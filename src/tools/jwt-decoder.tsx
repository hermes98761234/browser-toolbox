import { useEffect, useState } from 'react'
import { Area, Btn, CopyButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { algInfo, CLAIMS, decodeJwt, relative, signHmac, TIME_CLAIMS, timeStatus, verify, warnings } from './lib/jwt-decoder'

const SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjYtMTAta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20vIiwic3ViIjoidXNlcl84ZjNhMmMiLCJhdWQiOiJhcGkuZXhhbXBsZS5jb20iLCJuYW1lIjoiT2xlbmEgS292YWxlbmtvIiwiZW1haWwiOiJvbGVuYUBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJyb2xlcyI6WyJlZGl0b3IiLCJiaWxsaW5nIl0sInNjb3BlIjoicmVhZDphcnRpY2xlcyB3cml0ZTphcnRpY2xlcyIsImlhdCI6MTc5MDg0MTYwMCwibmJmIjoxNzkwODQxNjAwLCJleHAiOjE4OTM0NTYwMDAsImp0aSI6ImI3ZTFjMmQ0LTVmNjAtNGE4Yi05YzFkLTJlM2Y0YTViNmM3ZCJ9.Ufb-nV50-IYagbJphZdrpX99vX1xN-sXyguwqXVm29Y'
const SECRET = 'my-super-secret-signing-key-2026'
type Enc = 'utf8' | 'base64' | 'base64url'
interface State { token: string; key: string; enc: Enc; leeway: number }
const DEF: State = { token: SAMPLE, key: SECRET, enc: 'utf8', leeway: 0 }
const SEG = ['#e11d48', '#9333ea', '#0284c7']

const fmtDate = (sec: number) => {
  const d = new Date(sec * 1000)
  return Number.isNaN(d.getTime()) ? '—' : `${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })} · ${d.toISOString().replace('.000Z', 'Z')}`
}
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

export default function JwtDecoder() {
  const [s, set, reset] = useToolState('jwt-decoder', DEF)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [verdict, setVerdict] = useState<{ for: string; ok: boolean | null; msg: string }>({ for: '', ok: null, msg: '' })
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const d = decodeJwt(s.token)
  const payload = d.payload && typeof d.payload === 'object' ? d.payload : null
  const alg = String(d.header?.alg ?? '—')
  const info = algInfo(alg)
  const ts = payload ? timeStatus(payload, now, s.leeway) : null
  const warn = d.errors.length ? [] : warnings(d.header, d.payload)
  const vKey = `${s.token}|${s.key}|${s.enc}`

  useEffect(() => {
    let live = true
    const done = (ok: boolean | null, msg: string) => live && setVerdict({ for: vKey, ok, msg })
    if (!s.key.trim() || !algInfo(alg)) {
      void Promise.resolve().then(() => done(null, ''))
    } else {
      verify(s.token, s.key, s.enc).then((ok) => done(ok, ''), (e: Error) => done(null, e.message))
    }
    return () => { live = false }
  }, [vKey, s.token, s.key, s.enc, alg])
  const v = verdict.for === vKey ? verdict : { ok: null, msg: '' }

  const fresh = async () => {
    const iat = Math.floor(Date.now() / 1000)
    const token = await signHmac({ alg: 'HS256', typ: 'JWT' }, { iss: 'https://auth.example.com/', sub: 'user_8f3a2c', aud: 'api.example.com', scope: 'read:articles', iat, nbf: iat, exp: iat + 3600 }, SECRET)
    set({ token, key: SECRET, enc: 'utf8' })
  }

  const parts = s.token.trim().replace(/^bearer\s+/i, '').split('.')
  const statusText = !ts ? '—' : ts.state === 'valid' ? 'Active' : ts.state === 'expired' ? 'Expired' : ts.state === 'early' ? 'Not yet valid' : 'No expiry'
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  const iat = typeof payload?.iat === 'number' ? payload.iat : typeof payload?.nbf === 'number' ? payload.nbf : null
  const span = exp !== null && iat !== null && exp > iat ? exp - iat : null
  const isPem = info && info.kind !== 'hmac'

  return (
    <Split>
      <div>
        <Panel title="Encoded token" actions={<>
          <Btn kind="ghost" onClick={() => set({ token: SAMPLE, key: SECRET, enc: 'utf8' })}>Sample</Btn>
          <Btn kind="ghost" onClick={() => void fresh()}>Fresh (1 h)</Btn>
          <Btn kind="ghost" onClick={() => set({ token: '', key: '' })}>Clear</Btn>
        </>}>
          <Area value={s.token} onChange={(token) => set({ token })} rows={6} mono placeholder="Paste a JWT (eyJ…). A leading “Bearer ” is ignored." />
          {s.token.trim() && parts.length === 3 && (
            <div className="mono" style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.5, marginTop: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
              {parts.map((p, i) => <span key={i}><span style={{ color: SEG[i] }}>{p}</span>{i < 2 && <b>.</b>}</span>)}
            </div>
          )}
          {d.errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            <span style={{ color: SEG[0] }}>■</span> header · <span style={{ color: SEG[1] }}>■</span> payload · <span style={{ color: SEG[2] }}>■</span> signature. Decoding runs entirely in your browser; the token is never sent anywhere.
          </p>
        </Panel>
        <Panel title="Verify signature">
          {info?.kind === 'hmac' ? (
            <>
              <Area label={`Shared secret (${alg})`} value={s.key} onChange={(key) => set({ key })} rows={2} mono />
              <Select label="Secret encoding" value={s.enc} onChange={(enc) => set({ enc })} options={[['utf8', 'Plain text (UTF-8)'], ['base64', 'Base64'], ['base64url', 'Base64url']]} />
            </>
          ) : isPem ? (
            <Area label={`Public key for ${alg} (PEM “BEGIN PUBLIC KEY” or JWK JSON)`} value={s.key} onChange={(key) => set({ key })} rows={6} mono placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'} />
          ) : <p className="muted">{alg === 'none' ? 'Unsigned token: nothing to verify.' : `Algorithm ${alg} cannot be verified here.`}</p>}
          {v.ok === true && <Note tone="ok">✓ Signature verified with WebCrypto.</Note>}
          {v.ok === false && <Note tone="err">✗ Invalid signature: wrong key, or the token was modified.</Note>}
          {v.msg && <Note tone="warn">Could not verify: {v.msg}</Note>}
          <Num label="Clock skew leeway" value={s.leeway} onChange={(leeway) => set({ leeway })} min={0} max={3600} step={1} unit="s" hint="Tolerance used for exp / nbf checks" />
          <Row><Btn kind="ghost" onClick={reset}>Reset</Btn></Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Algorithm" value={alg} sub={String(d.header?.typ ?? '')} />
          <Stat label="Status" value={statusText} tone={ts?.state === 'valid' ? 'good' : ts?.state === 'no-exp' ? undefined : 'bad'} sub={ts?.remaining != null ? (ts.remaining > 0 ? `expires ${relative(ts.remaining)}` : `expired ${relative(ts.remaining)}`) : ''} />
          <Stat label="Signature" value={v.ok === true ? 'Verified' : v.ok === false ? 'Invalid' : 'Not checked'} tone={v.ok === true ? 'good' : v.ok === false ? 'bad' : undefined} />
          <Stat label="Lifetime" value={ts?.lifetime != null ? relative(ts.lifetime).replace('in ', '') : '—'} sub="exp − iat" />
        </Stats>
        {warn.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        {span !== null && exp !== null && iat !== null && (
          <Panel title="Validity window">
            <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'color-mix(in srgb, var(--ok) 30%, var(--line))', margin: '8px 0 6px' }}>
              <span title="now" style={{ position: 'absolute', top: -5, bottom: -5, width: 3, borderRadius: 2, background: now > exp ? 'var(--err)' : 'var(--accent)', left: `calc(${Math.min(100, Math.max(0, ((now - iat) / span) * 100))}% - 1px)` }} />
            </div>
            <Row wrap={false}><span className="muted" style={{ flex: 1, fontSize: 13 }}>issued {relative(iat - now)}</span><span className="muted" style={{ fontSize: 13 }}>{now > exp ? 'expired' : 'expires'} {relative(exp - now)}</span></Row>
          </Panel>
        )}
        <Panel title="Claims">
          {payload ? (
            <Table
              head={['Claim', 'Value', 'Meaning']}
              rows={Object.entries(payload).map(([k, val]) => [
                <code key="k">{k}</code>,
                TIME_CLAIMS.includes(k) && typeof val === 'number'
                  ? <span key="v"><b>{fmtDate(val)}</b><br /><span className="muted">{val} · {relative(val - now)}</span></span>
                  : <span key="v" style={{ wordBreak: 'break-word' }}>{Array.isArray(val) ? val.map((x, i) => <span key={i} style={{ display: 'inline-block', padding: '0 6px', margin: 2, borderRadius: 8, border: '1px solid var(--line)' }}>{show(x)}</span>) : show(val)}</span>,
                <span key="m" className="muted">{CLAIMS[k] ?? 'Custom claim'}</span>,
              ])}
            />
          ) : <p className="muted">{typeof d.payload === 'string' ? `Non-JSON payload: ${d.payload}` : 'No payload yet.'}</p>}
        </Panel>
        <Panel title="Header" actions={<CopyButton text={JSON.stringify(d.header, null, 2)} />}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: SEG[0] }}>{d.header ? JSON.stringify(d.header, null, 2) : '—'}</pre>
          {d.header && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{Object.keys(d.header).map((k) => `${k}: ${CLAIMS[k] ?? 'custom'}`).join(' · ')}</p>}
        </Panel>
        <Panel title="Payload" actions={<CopyButton text={payload ? JSON.stringify(payload, null, 2) : d.payloadRaw} />}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: SEG[1] }}>{payload ? JSON.stringify(payload, null, 2) : d.payloadRaw || '—'}</pre>
        </Panel>
      </div>
    </Split>
  )
}
