import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, download, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { qr } from './lib/barcode-label-maker'
import { combine, decodeShare, encodeShare, fromHex, split, toHex } from './lib/secret-sharing-splitter'

const SAMPLE = 'Vault master key: 7f3a-91c2-e04b-5d88\nRecovery phrase: orbit lunar velvet canyon brisk ember'

function QrSvg({ text, size = 168 }: { text: string; size?: number }) {
  const code = useMemo(() => { try { return qr(text, 'M') } catch { return null } }, [text])
  if (!code) return <div className="muted" style={{ fontSize: 12, width: size }}>Too long for a QR code — use the text.</div>
  const n = code.size + 8
  let d = ''
  code.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4},${y + 4}h1v1h-1z` }))
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 6, flex: 'none' }}>
      <path d={d} fill="#000" />
    </svg>
  )
}

export default function SecretSharingSplitter() {
  const [s, set] = useToolState('secret-sharing-splitter', { tab: 'split' as 'split' | 'recover', n: 5, k: 3, hexInput: false })
  const [secret, setSecret] = useState(SAMPLE)
  const [seed, setSeed] = useState(0) // bump to re-randomise
  const [input, setInput] = useState('')
  const bytes = useMemo(() => {
    try { return { b: s.hexInput ? fromHex(secret) : new TextEncoder().encode(secret), err: '' } } catch (e) { return { b: new Uint8Array(), err: (e as Error).message } }
  }, [secret, s.hexInput])
  const shares = useMemo(() => {
    void seed
    if (!bytes.b.length) return []
    return split(bytes.b, s.n, Math.min(s.k, s.n)).map(encodeShare)
  }, [bytes, s.n, s.k, seed])

  const rec = useMemo(() => {
    const lines = input.split(/[\s,;]+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return null
    const parsed: ReturnType<typeof decodeShare>[] = []
    const errors: string[] = []
    lines.forEach((l, i) => { try { parsed.push(decodeShare(l)) } catch (e) { errors.push(`Share ${i + 1}: ${(e as Error).message}`) } })
    if (parsed.length < 2) return { errors: [...errors, 'Paste at least two shares.'], text: '', ok: false, need: parsed[0]?.k ?? 0, have: parsed.length, hex: '' }
    const k = parsed[0].k
    const have = new Set(parsed.map((p) => p.x)).size
    if (have < k) return { errors: [...errors, `This secret needs ${k} shares; you have ${have}.`], text: '', ok: false, need: k, have, hex: '' }
    try {
      const r = combine(parsed)
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(r.secret) } catch { text = '' }
      return { errors, text, ok: r.ok, need: k, have, hex: toHex(r.secret) }
    } catch (e) {
      return { errors: [...errors, (e as Error).message], text: '', ok: false, need: k, have, hex: '' }
    }
  }, [input])

  const printShares = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const cards = shares.map((sh, i) => `<div style="page-break-inside:avoid;border:1px dashed #999;padding:16px;margin:12px 0;font-family:sans-serif"><h3>Share ${i + 1} of ${s.n} — any ${s.k} recover the secret</h3><div style="display:flex;gap:16px;align-items:center">${document.getElementById('qr-' + i)?.outerHTML ?? ''}<code style="word-break:break-all;font-size:12px">${sh}</code></div></div>`).join('')
    w.document.write(`<!doctype html><title>Secret shares</title><body>${cards}<script>print()</script></body>`)
    w.document.close()
  }

  return (
    <div>
      <Row><Seg value={s.tab} onChange={(tab) => set({ tab })} options={[['split', '✂ Split a secret'], ['recover', '🔓 Recover a secret']]} /></Row>
      {s.tab === 'split' ? (
        <Split wide="right">
          <div>
            <Panel title="Secret">
              <Area value={secret} onChange={setSecret} rows={5} mono placeholder="Password, seed phrase, key…" />
              <Row>
                <Seg value={s.hexInput ? 'hex' : 'text'} onChange={(v) => set({ hexInput: v === 'hex' })} options={[['text', 'Text (UTF-8)'], ['hex', 'Hex bytes']]} />
                <span className="muted" style={{ fontSize: 12 }}>{bytes.b.length} bytes</span>
              </Row>
              {bytes.err && <Note tone="err">{bytes.err}</Note>}
            </Panel>
            <Panel title="Scheme">
              <Slider label="Number of shares (n)" value={s.n} onChange={(n) => set({ n, k: Math.min(s.k, n) })} min={2} max={16} />
              <Slider label="Threshold (k) — shares needed to recover" value={Math.min(s.k, s.n)} onChange={(k) => set({ k })} min={2} max={s.n} />
              <Btn kind="primary" onClick={() => setSeed((x) => x + 1)}>↻ New random shares</Btn>
              <Note>Each byte of the secret becomes the constant term of a random degree-{s.k - 1} polynomial over GF(256); share i is its value at x = i. Any {s.k} shares determine the polynomial; {s.k - 1} or fewer reveal nothing about the secret. A 4-byte checksum detects wrong or tampered shares.</Note>
              <Note tone="warn">Randomness comes from crypto.getRandomValues. Nothing leaves your browser, and the secret is not saved. Give each share to a different person or place.</Note>
            </Panel>
          </div>
          <div>
            <Stats>
              <Stat label="Shares" value={s.n} />
              <Stat label="Threshold" value={`${Math.min(s.k, s.n)} of ${s.n}`} tone="accent" />
              <Stat label="Can be lost" value={s.n - Math.min(s.k, s.n)} sub="shares, still recoverable" />
              <Stat label="Share size" value={`${shares[0]?.length ?? 0} chars`} />
            </Stats>
            <Panel title="Shares" actions={<>
              <CopyButton text={() => shares.join('\n')} label="Copy all" />
              <Btn onClick={() => download('secret-shares.txt', shares.map((sh, i) => `# Share ${i + 1}/${s.n} (threshold ${s.k})\n${sh}`).join('\n\n') + '\n')}>⬇ TXT</Btn>
              <Btn onClick={printShares}>🖨 Print</Btn>
              <Btn onClick={() => { setInput(shares.slice(0, s.k).join('\n')); set({ tab: 'recover' }) }}>Test recovery →</Btn>
            </>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))', gap: 12 }}>
                {shares.map((sh, i) => (
                  <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span id={'qr-' + i}><QrSvg text={sh} size={120} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Row wrap={false}><b style={{ flex: 1 }}>Share {i + 1}</b><CopyButton text={sh} /></Row>
                      <code style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', maxHeight: 90, overflow: 'auto' }}>{sh}</code>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Split>
      ) : (
        <Split>
          <Panel title="Paste shares" actions={<Btn kind="ghost" onClick={() => setInput('')}>Clear</Btn>}>
            <Area value={input} onChange={setInput} rows={10} mono placeholder={'SSS1-3-1-…\nSSS1-3-4-…\nSSS1-3-5-…'} />
            <Row>
              <Btn onClick={() => setInput(shares.slice(0, Math.min(s.k, s.n)).join('\n'))}>Use demo shares 1–{Math.min(s.k, s.n)}</Btn>
              <Btn onClick={() => setInput([shares[0], shares[shares.length - 1]].join('\n'))}>Try with too few</Btn>
            </Row>
            <Note>One share per line (spaces and commas also separate). Order does not matter; duplicates are ignored.</Note>
          </Panel>
          <Panel title="Recovered secret">
            {!rec ? <Note>Paste shares on the left.</Note> : <>
              <Stats>
                <Stat label="Shares given" value={rec.have} />
                <Stat label="Needed" value={rec.need || '—'} />
                <Stat label="Checksum" value={rec.ok ? 'Valid ✓' : '—'} tone={rec.ok ? 'good' : 'bad'} />
              </Stats>
              {rec.errors.map((e, i) => <Note key={i} tone="err">{e}</Note>)}
              {rec.hex && !rec.ok && <Note tone="err">Checksum mismatch: the shares come from different secrets, one is mistyped, or the threshold is not met.</Note>}
              {rec.ok && (rec.text
                ? <><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg)', padding: 12, borderRadius: 8 }}>{rec.text}</pre><CopyButton text={rec.text} label="Copy secret" /></>
                : <><Note>Binary secret (not valid UTF-8), shown as hex:</Note><code style={{ wordBreak: 'break-all' }}>{rec.hex}</code></>)}
            </>}
          </Panel>
        </Split>
      )}
    </div>
  )
}
