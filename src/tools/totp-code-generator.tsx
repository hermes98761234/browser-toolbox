import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, FileDrop, JsonButtons, Note, Num, Panel, Ring, Row, Select, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { qr } from './lib/barcode-label-maker'
import { base32Decode, buildOtpauth, counterAt, hotp, parseOtpauth, randomSecret, verify, type Algo, type OtpAuth } from './lib/totp-code-generator'

interface Account extends OtpAuth { id: string }
interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (o?: { formats?: string[] }) => Detector
const BD = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

const DEF = {
  accounts: [
    { id: 'demo1', type: 'totp', issuer: 'Example', account: 'alice@example.com', secret: 'JBSWY3DPEHPK3PXP', algo: 'SHA1', digits: 6, period: 30, counter: 0 },
    { id: 'demo2', type: 'totp', issuer: 'ACME Co', account: 'ops@acme.test', secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ', algo: 'SHA256', digits: 8, period: 60, counter: 0 },
    { id: 'demo3', type: 'hotp', issuer: 'VPN token', account: 'bob', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', algo: 'SHA1', digits: 6, period: 30, counter: 0 },
  ] as Account[],
  sel: 'demo1',
  window: 1,
  draft: { type: 'totp', issuer: '', account: '', secret: '', algo: 'SHA1', digits: 6, period: 30, counter: 0 } as OtpAuth,
}

function QrSvg({ text }: { text: string }) {
  let q
  try { q = qr(text, 'M') } catch { return <Note tone="err">Too long for a QR code.</Note> }
  const n = q.size + 8
  let d = ''
  q.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4},${y + 4}h1v1h-1z` }))
  return (
    <svg viewBox={`0 0 ${n} ${n}`} style={{ width: '100%', maxWidth: 220, background: '#fff', borderRadius: 8, display: 'block' }} shapeRendering="crispEdges" aria-label="otpauth QR code">
      <path d={d} fill="#000" />
    </svg>
  )
}

export default function TotpCodeGenerator() {
  const [s, set, reset] = useToolState('totp-code-generator', DEF)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [codes, setCodes] = useState<Record<string, { cur: string; next: string; err?: string }>>({})
  const [uri, setUri] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [check, setCheck] = useState('')
  const [checkRes, setCheckRes] = useState<string>('')
  const [cam, setCam] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 250)
    return () => clearInterval(t)
  }, [])

  const stepKey = s.accounts.map((a) => `${a.id}:${a.secret}:${a.algo}:${a.digits}:${a.type === 'hotp' ? `c${a.counter}` : counterAt(now, a.period)}`).join('|')
  useEffect(() => {
    let live = true
    void Promise.all(s.accounts.map(async (a) => {
      try {
        const k = base32Decode(a.secret)
        if (!k.length) throw new Error('Empty secret')
        const c = a.type === 'hotp' ? a.counter : counterAt(Date.now() / 1000, a.period)
        return [a.id, { cur: await hotp(k, c, a.digits, a.algo), next: await hotp(k, c + 1, a.digits, a.algo) }] as const
      } catch (e) {
        return [a.id, { cur: '—', next: '—', err: (e as Error).message }] as const
      }
    })).then((r) => live && setCodes(Object.fromEntries(r)))
    return () => { live = false }
  }, [stepKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = s.accounts.find((a) => a.id === s.sel) ?? s.accounts[0]
  const addAccount = (o: OtpAuth) => {
    const id = uid()
    set({ accounts: [...s.accounts, { ...o, id }], sel: id })
  }
  const edit = (p: Partial<Account>) => sel && set({ accounts: s.accounts.map((a) => (a.id === sel.id ? { ...a, ...p } : a)) })
  const importUri = (text: string) => {
    try {
      const o = parseOtpauth(text)
      addAccount(o)
      setMsg({ tone: 'ok', text: `Added ${o.issuer || 'account'} ${o.account}.` })
      setUri('')
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
  }
  const scanImage = async (f: File) => {
    if (!BD) return setMsg({ tone: 'warn', text: 'QR scanning needs the BarcodeDetector API (Chrome/Edge on Android, macOS, ChromeOS). Paste the otpauth:// link instead.' })
    try {
      const bmp = await createImageBitmap(f)
      const r = await new BD({ formats: ['qr_code'] }).detect(bmp)
      const hit = r.find((x) => x.rawValue.startsWith('otpauth://'))
      if (hit) importUri(hit.rawValue)
      else setMsg({ tone: 'err', text: r.length ? 'QR code found, but it is not an otpauth:// link.' : 'No QR code found in that image.' })
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
  }
  useEffect(() => {
    if (!cam || !BD) return
    let stream: MediaStream | null = null, raf = 0, stop = false
    const det = new BD({ formats: ['qr_code'] })
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } }).then((st) => {
      stream = st
      if (!video.current || stop) return
      video.current.srcObject = st
      void video.current.play()
      let last = 0
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop)
        if (t - last < 300 || !video.current) return
        last = t
        void det.detect(video.current).then((r) => {
          const hit = r.find((x) => x.rawValue.startsWith('otpauth://'))
          if (hit) { importUri(hit.rawValue); setCam(false) }
        }).catch(() => {})
      }
      raf = requestAnimationFrame(loop)
    }).catch((e: Error) => { setMsg({ tone: 'err', text: `Camera: ${e.message}` }); setCam(false) })
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [cam]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCheck = async () => {
    if (!sel) return
    try {
      const k = base32Decode(sel.secret)
      if (sel.type === 'hotp') {
        for (let d = 0; d <= 10; d++) if ((await hotp(k, sel.counter + d, sel.digits, sel.algo)) === check.trim()) return setCheckRes(`✓ Valid — matches counter ${sel.counter + d}${d ? ` (${d} ahead; resynchronise)` : ''}.`)
        return setCheckRes('✗ No match in the next 10 counter values.')
      }
      const off = await verify(check, k, Date.now() / 1000, sel.period, sel.digits, sel.algo, s.window)
      setCheckRes(off === null ? `✗ Not valid within ±${s.window} step(s).` : off === 0 ? '✓ Valid for the current time step.' : `✓ Valid, but from ${off > 0 ? 'the next' : 'a previous'} step (${off > 0 ? '+' : ''}${off}) — the device clock may drift.`)
    } catch (e) {
      setCheckRes(`✗ ${(e as Error).message}`)
    }
  }

  const fmtCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c)
  const left = (a: Account) => a.period - (now % a.period)

  return (
    <Split wide="right">
      <div>
        <Panel title="Add account" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Paste otpauth:// link" value={uri} onChange={setUri} placeholder="otpauth://totp/Issuer:me@example.com?secret=…" />
          <Row>
            <Btn kind="primary" onClick={() => importUri(uri)} disabled={!uri.trim()}>Import link</Btn>
            {BD && <Btn onClick={() => setCam(!cam)}>{cam ? '■ Stop camera' : '📷 Scan with camera'}</Btn>}
          </Row>
          {cam && <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
          <div style={{ marginTop: 10 }}>
            <FileDrop accept="image/*" onFiles={([f]) => void scanImage(f)} label={BD ? 'Drop a QR-code screenshot to scan' : 'Drop a QR screenshot (needs BarcodeDetector)'} />
          </div>
          {!BD && <p className="muted" style={{ fontSize: 13 }}>This browser has no native QR decoder; paste the link (most sites show “can't scan? enter key”).</p>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />
          <b>Or enter manually</b>
          <Row>
            <Txt label="Issuer" value={s.draft.issuer} onChange={(issuer) => set({ draft: { ...s.draft, issuer } })} placeholder="GitHub" />
            <Txt label="Account" value={s.draft.account} onChange={(account) => set({ draft: { ...s.draft, account } })} placeholder="me@example.com" />
          </Row>
          <Txt label="Secret (Base32)" value={s.draft.secret} onChange={(secret) => set({ draft: { ...s.draft, secret: secret.toUpperCase() } })} placeholder="JBSW Y3DP EHPK 3PXP" />
          <Row>
            <Seg value={s.draft.type} onChange={(type) => set({ draft: { ...s.draft, type } })} options={[['totp', 'Time-based'], ['hotp', 'Counter']]} />
            <Btn onClick={() => set({ draft: { ...s.draft, secret: randomSecret(20) } })}>🎲 New secret</Btn>
          </Row>
          <Row>
            <Select label="Algorithm" value={s.draft.algo} onChange={(algo) => set({ draft: { ...s.draft, algo } })} options={['SHA1', 'SHA256', 'SHA512'] as Algo[]} />
            <Select label="Digits" value={s.draft.digits} onChange={(digits) => set({ draft: { ...s.draft, digits } })} options={[6, 7, 8]} />
            <Select label="Period" value={s.draft.period} onChange={(period) => set({ draft: { ...s.draft, period } })} options={[[30, '30 s'], [60, '60 s'], [15, '15 s']]} />
          </Row>
          <Btn kind="primary" onClick={() => {
            try { base32Decode(s.draft.secret); if (!s.draft.secret) throw new Error('Enter or generate a secret.'); addAccount({ ...s.draft, secret: s.draft.secret.replace(/[\s=]/g, '') }); set({ draft: DEF.draft }); setMsg(null) } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }) }
          }}>+ Add account</Btn>
        </Panel>
      </div>
      <div>
        <Panel title="Codes" actions={<JsonButtons name="otp-accounts.json" data={s.accounts} onLoad={(accounts) => Array.isArray(accounts) && set({ accounts, sel: accounts[0]?.id ?? '' })} />}>
          <div style={{ display: 'grid', gap: 8 }}>
            {s.accounts.map((a) => {
              const c = codes[a.id]
              const rem = left(a)
              return (
                <div key={a.id} onClick={() => set({ sel: a.id })} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${a.id === sel?.id ? 'var(--accent)' : 'var(--line)'}`, flexWrap: 'wrap' }}>
                  {a.type === 'totp' ? <Ring value={rem / a.period} size={52} label={<small>{Math.ceil(rem)}</small>} color={rem < 6 ? 'var(--err)' : 'var(--accent)'} /> : <span style={{ width: 52, textAlign: 'center', fontSize: 12 }} className="muted">#{a.counter}</span>}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <b>{a.issuer || 'Account'}</b> <span className="muted">{a.account}</span>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 30, letterSpacing: 2, color: c?.err ? 'var(--err)' : 'var(--fg)' }}>{c ? fmtCode(c.cur) : '…'}</div>
                    <span className="muted" style={{ fontSize: 12 }}>{c?.err ?? `next ${fmtCode(c?.next ?? '')} · ${a.algo} · ${a.digits} digits${a.type === 'totp' ? ` · ${a.period}s` : ''}`}</span>
                  </div>
                  <CopyButton text={c?.cur ?? ''} />
                  {a.type === 'hotp' && <Btn onClick={() => set({ accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, counter: x.counter + 1 } : x)) })}>Next ↻</Btn>}
                </div>
              )
            })}
            {!s.accounts.length && <p className="muted">No accounts yet. Add one on the left.</p>}
          </div>
        </Panel>
        {sel && (
          <Panel title={`${sel.issuer || 'Account'} — details`} actions={<Btn kind="danger" onClick={() => set({ accounts: s.accounts.filter((a) => a.id !== sel.id), sel: s.accounts.find((a) => a.id !== sel.id)?.id ?? '' })}>Delete</Btn>}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 200px' }}>
                <QrSvg text={buildOtpauth(sel)} />
                <p className="muted" style={{ fontSize: 12 }}>Scan with any authenticator app to enrol this secret.</p>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Row>
                  <Txt label="Issuer" value={sel.issuer} onChange={(issuer) => edit({ issuer })} />
                  <Txt label="Account" value={sel.account} onChange={(account) => edit({ account })} />
                </Row>
                <Txt label="Secret" value={sel.secret} onChange={(secret) => edit({ secret: secret.toUpperCase().replace(/\s/g, '') })} />
                {sel.type === 'hotp' && <Num label="Counter" value={sel.counter} onChange={(counter) => edit({ counter: Math.max(0, Math.round(counter)) })} min={0} step={1} />}
                <Row>
                  <CopyButton text={() => buildOtpauth(sel)} label="otpauth link" />
                  <CopyButton text={sel.secret} label="Secret" />
                </Row>
              </div>
            </div>
            <Stats>
              <Stat label="Unix time" value={Math.floor(now)} />
              <Stat label={sel.type === 'totp' ? 'Time step T' : 'Counter'} value={sel.type === 'totp' ? counterAt(now, sel.period) : sel.counter} sub={`0x${(sel.type === 'totp' ? counterAt(now, sel.period) : sel.counter).toString(16).padStart(16, '0')}`} />
              <Stat label="Key length" value={(() => { try { return `${base32Decode(sel.secret).length * 8} bits` } catch { return '—' } })()} sub={sel.algo === 'SHA1' ? '≥ 128 bits recommended' : undefined} />
            </Stats>
          </Panel>
        )}
        {sel && (
          <Panel title="Verify a code">
            <Row>
              <Txt label="Code from device" value={check} onChange={(v) => { setCheck(v); setCheckRes('') }} placeholder={'0'.repeat(sel.digits)} />
              {sel.type === 'totp' && <Select label="Accept drift" value={s.window} onChange={(window) => set({ window })} options={[[0, 'Exact step'], [1, '±1 step'], [2, '±2 steps'], [5, '±5 steps']]} />}
            </Row>
            <Btn kind="primary" onClick={() => void runCheck()} disabled={!check.trim()}>Verify</Btn>
            {checkRes && <Note tone={checkRes.startsWith('✓') ? 'ok' : 'err'}>{checkRes}</Note>}
            <Note>
              Codes are computed locally with Web Crypto: HMAC(secret, ⌊unix time / period⌋) → dynamic truncation → last {sel.digits} digits (RFC 6238 / RFC 4226). Accounts are kept in this browser's local storage — use Backup to move them, and treat the file like a password.
            </Note>
          </Panel>
        )}
      </div>
    </Split>
  )
}
