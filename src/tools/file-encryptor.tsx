import { useEffect, useState } from 'react'
import { Area, Bar, Btn, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { armor, decrypt, encrypt, entropyBits, parseHeader, randomPassword, unarmor, type Header, type Meta } from './lib/file-encryptor'

const DEF = { mode: 'enc' as 'enc' | 'dec', source: 'text' as 'text' | 'file', iterations: 600000, text: 'Wi-Fi: Garden-5G\nPassword: tulips-and-kettles-42\nSafe code: 7319' }

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${num(n / 1024, 1)} KB` : `${num(n / 1048576, 2)} MB`)
const DEMO_PW = 'demo-correct-horse-battery'

export default function FileEncryptor() {
  const [s, set, reset] = useToolState('file-encryptor', DEF)
  const [pw, setPw] = useState(DEMO_PW)
  const [pw2, setPw2] = useState(DEMO_PW)
  const [show, setShow] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [out, setOut] = useState<{ bytes: Uint8Array; name: string; ms: number } | null>(null)
  const [blob, setBlob] = useState<Uint8Array | null>(null) // ciphertext to decrypt
  const [blobName, setBlobName] = useState('')
  const [armorIn, setArmorIn] = useState('')
  const [plain, setPlain] = useState<{ meta: Meta; data: Uint8Array } | null>(null)
  const bits = entropyBits(pw)
  const strength = bits < 40 ? ['Weak', 'var(--err)'] : bits < 65 ? ['Fair', 'var(--warn)'] : bits < 90 ? ['Strong', 'var(--ok)'] : ['Very strong', 'var(--ok)']

  let header: Header | null = null
  let headerErr = ''
  if (blob) {
    try {
      header = parseHeader(blob)
    } catch (e) {
      headerErr = (e as Error).message
    }
  }

  const doEncrypt = async () => {
    setErr('')
    setOut(null)
    if (!pw) return setErr('Enter a password.')
    if (pw !== pw2) return setErr('Passwords do not match.')
    if (s.source === 'file' && !file) return setErr('Choose a file first.')
    setBusy(true)
    try {
      const t0 = performance.now()
      const data = s.source === 'file' ? new Uint8Array(await file!.arrayBuffer()) : new TextEncoder().encode(s.text)
      const meta: Meta = s.source === 'file' ? { name: file!.name, type: file!.type, size: file!.size, created: new Date().toISOString() } : { name: 'message.txt', type: 'text/plain', size: data.length, created: new Date().toISOString() }
      const bytes = await encrypt(data, meta, pw, s.iterations)
      setOut({ bytes, name: `${meta.name}.btenc`, ms: performance.now() - t0 })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doDecrypt = async () => {
    setErr('')
    setPlain(null)
    if (!blob) return setErr('Load an encrypted file or paste armored text.')
    setBusy(true)
    try {
      setPlain(await decrypt(blob, pw))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // demo on first load: encrypt the sample note so the result panel is never empty
  useEffect(() => {
    if (typeof crypto === 'undefined' || !crypto.subtle) return
    let alive = true
    void encrypt(new TextEncoder().encode(DEF.text), { name: 'message.txt', type: 'text/plain', size: DEF.text.length, created: new Date().toISOString() }, DEMO_PW, 100000).then((bytes) => {
      if (alive) setOut((o) => o ?? { bytes, name: 'message.txt.btenc', ms: 0 })
    })
    return () => {
      alive = false
    }
  }, [])

  if (typeof crypto === 'undefined' || !crypto.subtle) return <Note tone="err">Web Crypto is not available. Open this page over HTTPS in a modern browser.</Note>

  const plainText = plain && (plain.meta.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(plain.meta.name)) ? new TextDecoder().decode(plain.data) : null

  return (
    <Split>
      <div>
        <Panel title="Mode" actions={<Btn kind="ghost" onClick={() => { reset(); setErr(''); setPlain(null) }}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => { set({ mode }); setErr('') }} options={[['enc', '🔒 Encrypt'], ['dec', '🔓 Decrypt']]} />
        </Panel>
        {s.mode === 'enc' ? (
          <Panel title="What to encrypt">
            <Seg value={s.source} onChange={(source) => set({ source })} options={[['text', 'Text / note'], ['file', 'File']]} />
            <div style={{ marginTop: 10 }}>
              {s.source === 'text' ? (
                <Area value={s.text} onChange={(text) => set({ text })} rows={6} placeholder="Secret text" />
              ) : (
                <>
                  <FileDrop onFiles={(f) => { setFile(f[0]); setOut(null) }} label={file ? `${file.name} (${size(file.size)}) — click to change` : 'Drop any file here or click to choose'} />
                  {file && file.size > 500 * 1048576 && <Note tone="warn">Large file: it is processed in memory, so very big files may exhaust the tab.</Note>}
                </>
              )}
            </div>
          </Panel>
        ) : (
          <Panel title="Encrypted input">
            <FileDrop
              accept=".btenc,application/octet-stream"
              onFiles={async (f) => {
                setBlob(new Uint8Array(await f[0].arrayBuffer()))
                setBlobName(f[0].name)
                setPlain(null)
                setErr('')
              }}
              label={blob && blobName ? `${blobName} (${size(blob.length)})` : 'Drop a .btenc file'}
            />
            <Area value={armorIn} onChange={(t) => { setArmorIn(t); setPlain(null); try { setBlob(t.trim() ? unarmor(t) : null); setBlobName('') } catch { setBlob(null) } }} rows={4} mono placeholder="…or paste -----BEGIN BTENC----- text" />
            {out && <Btn kind="ghost" onClick={() => { setBlob(out.bytes); setBlobName(out.name); setPlain(null) }}>Use the file I just encrypted</Btn>}
            {headerErr && <Note tone="err">{headerErr}</Note>}
            {header && (
              <Table
                head={['Header field', 'Value']}
                rows={[
                  ['Format', `BTENC v${header.version}, AES-256-GCM`],
                  ['Key derivation', `${header.kdf}, ${header.iterations.toLocaleString()} iterations`],
                  ['Salt', <span key="s" className="mono">{hex(header.salt)}</span>],
                  ['IV / nonce', <span key="i" className="mono">{hex(header.iv)}</span>],
                  ['Payload', size(blob!.length - header.headerLen)],
                ]}
              />
            )}
          </Panel>
        )}
        <Panel title="Password">
          <label className="k-field">
            <span className="k-label">Password</span>
            <input className="k-text" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </label>
          {s.mode === 'enc' && (
            <label className={`k-field ${pw2 && pw2 !== pw ? 'err' : ''}`}>
              <span className="k-label">Confirm</span>
              <input className="k-text" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {s.mode === 'enc' && (
            <div style={{ margin: '6px 0' }}>
              <Row wrap={false}><span style={{ flex: 1 }}>Strength: <b style={{ color: strength[1] }}>{strength[0]}</b></span><span className="muted">≈ {bits} bits</span></Row>
              <Bar value={Math.min(bits, 100)} max={100} color={strength[1]} />
            </div>
          )}
          <Row>
            <Btn kind="ghost" onClick={() => setShow(!show)}>{show ? '🙈 Hide' : '👁 Show'}</Btn>
            {s.mode === 'enc' && <Btn onClick={() => { const p = randomPassword(20); setPw(p); setPw2(p); setShow(true) }}>🎲 Generate</Btn>}
          </Row>
          {s.mode === 'enc' && (
            <Select label="PBKDF2 iterations" value={s.iterations} onChange={(iterations) => set({ iterations })} options={[[100000, '100,000 (fast)'], [310000, '310,000'], [600000, '600,000 (OWASP 2023)'], [1000000, '1,000,000 (slow, stronger)']]} />
          )}
          {pw === DEMO_PW && <Note tone="warn">This is the demo password. Pick your own before encrypting anything real.</Note>}
          <div style={{ marginTop: 10 }}>
            <Btn kind="primary" disabled={busy} onClick={() => void (s.mode === 'enc' ? doEncrypt() : doDecrypt())}>{busy ? 'Working…' : s.mode === 'enc' ? '🔒 Encrypt' : '🔓 Decrypt'}</Btn>
          </div>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
      </div>

      <div>
        {s.mode === 'enc' ? (
          <>
            <Stats>
              <Stat label="Cipher" value="AES-256-GCM" sub="authenticated" tone="accent" />
              <Stat label="Output" value={out ? size(out.bytes.length) : '—'} sub={out ? `${out.bytes.length - (s.source === 'file' ? file?.size ?? 0 : new TextEncoder().encode(s.text).length)} B overhead` : undefined} />
              <Stat label="Time" value={out && out.ms ? `${num(out.ms, 0)} ms` : '—'} sub="mostly key derivation" />
            </Stats>
            <Panel title="Result" actions={out && <><Btn kind="primary" onClick={() => download(out.name, new Blob([out.bytes as BlobPart]), 'application/octet-stream')}>⬇ {out.name}</Btn><CopyButton text={() => armor(out.bytes)} label="Copy as text" /></>}>
              {out ? (
                <>
                  <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflow: 'auto', background: 'var(--bg)', padding: 10, borderRadius: 8 }}>{armor(out.bytes.length > 6000 ? out.bytes.slice(0, 6000) : out.bytes)}{out.bytes.length > 6000 ? '\n…' : ''}</pre>
                  {out.ms === 0 && <Note>Demo: the sample note encrypted with the demo password. Switch to Decrypt → “Use the file I just encrypted” to round-trip it.</Note>}
                </>
              ) : (
                <p className="muted">Press Encrypt to produce a .btenc file.</p>
              )}
            </Panel>
          </>
        ) : (
          <Panel title="Decrypted" actions={plain && <Btn kind="primary" onClick={() => download(plain.meta.name, new Blob([plain.data as BlobPart]), plain.meta.type || 'application/octet-stream')}>⬇ {plain.meta.name}</Btn>}>
            {plain ? (
              <>
                <Note tone="ok">Authenticated: the content is exactly what was encrypted.</Note>
                <Table head={['Field', 'Value']} rows={[['Original name', plain.meta.name], ['Type', plain.meta.type || 'unknown'], ['Size', size(plain.data.length)], ['Encrypted on', new Date(plain.meta.created).toLocaleString()]]} />
                {plainText !== null && <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 10, borderRadius: 8, maxHeight: 260, overflow: 'auto' }}>{plainText.slice(0, 20000)}</pre>}
              </>
            ) : (
              <p className="muted">Load a .btenc file, enter its password and press Decrypt. The header is readable without the password; the name and contents are not.</p>
            )}
          </Panel>
        )}
        <Panel title="How it works">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            <li>Your password is stretched with PBKDF2-HMAC-SHA256 and a random 16-byte salt into a 256-bit key.</li>
            <li>The file and its name are sealed with AES-GCM using a random 96-bit nonce; the 16-byte tag detects any change.</li>
            <li>The header (magic, version, iterations, salt, nonce) is authenticated too, so it can't be swapped.</li>
            <li>Everything runs locally with the browser's Web Crypto API. Nothing is uploaded. Lose the password and the data is gone.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
