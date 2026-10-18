import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { decryptPdf, encryptPdf, inspectPdf, PERMS, samplePdf, type EncInfo, type Perms } from './lib/pdf-password-protector'

type Method = 'AES-256' | 'AES-128' | 'RC4-128'
interface Settings { method: Method; perms: Perms; encryptMetadata: boolean }
const ALL: Perms = { print: true, printHigh: true, modify: true, copy: true, annotate: true, fillForms: true, accessibility: true, assemble: true }
const NONE: Perms = { print: false, printHigh: false, modify: false, copy: false, annotate: false, fillForms: false, accessibility: true, assemble: false }
const PRESETS: [string, Perms][] = [
  ['Everything allowed', ALL],
  ['Read & print only', { ...NONE, print: true, printHigh: true }],
  ['No copying', { ...ALL, copy: false }],
  ['Fill forms only', { ...NONE, print: true, printHigh: true, fillForms: true }],
  ['Locked down', NONE],
]
const DEF: Settings = { method: 'AES-256', perms: { ...ALL, modify: false, assemble: false }, encryptMetadata: true }

interface Doc { name: string; bytes: Uint8Array; info: EncInfo }
interface Out { name: string; bytes: Uint8Array; summary: string[]; tone: 'ok' | 'warn' }

function strength(pw: string): { bits: number; label: string; tone: 'good' | 'bad' | 'accent' } {
  if (!pw) return { bits: 0, label: 'none', tone: 'bad' }
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  if ([...pw].some((c) => c.charCodeAt(0) > 127)) pool += 100
  const bits = Math.round([...pw].length * Math.log2(pool || 1) * (/(.)\1\1/.test(pw) ? 0.8 : 1))
  return { bits, label: bits < 36 ? 'weak' : bits < 60 ? 'fair' : bits < 80 ? 'strong' : 'very strong', tone: bits < 36 ? 'bad' : bits < 60 ? 'accent' : 'good' }
}

function genPassword(): string {
  const words = ['amber', 'cobalt', 'falcon', 'harbor', 'juniper', 'lantern', 'meadow', 'nickel', 'orbit', 'pepper', 'quartz', 'raven', 'saffron', 'tundra', 'velvet', 'willow', 'zephyr', 'canyon', 'ember', 'glacier']
  const r = crypto.getRandomValues(new Uint32Array(5))
  return [0, 1, 2].map((i) => words[r[i] % words.length]).join('-') + '-' + (r[3] % 90 + 10) + '!#$%&*'[r[4] % 6]
}

function PwField({ label, value, onChange, show, hint }: { label: string; value: string; onChange: (v: string) => void; show: boolean; hint?: string }) {
  const st = strength(value)
  return (
    <label className="k-field">
      <span className="k-label">{label}</span>
      <input className="k-text" type={show ? 'text' : 'password'} value={value} autoComplete="new-password" onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      <span className="k-hint">
        {hint ? hint + ' · ' : ''}
        {value ? <>~{st.bits} bits, <b style={{ color: st.tone === 'bad' ? 'var(--err)' : st.tone === 'good' ? 'var(--ok)' : 'var(--warn)' }}>{st.label}</b></> : 'empty'}
      </span>
    </label>
  )
}

export default function PdfPasswordProtector() {
  const [s, set, reset] = useToolState('pdf-password-protector', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [mode, setMode] = useState<'protect' | 'unlock'>('protect')
  const [user, setUser] = useState('open-sesame-42')
  const [owner, setOwner] = useState('')
  const [unlockPw, setUnlockPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [out, setOut] = useState<Out | null>(null)

  const open = async (name: string, bytes: Uint8Array) => {
    setErr(''); setOut(null); setBusy('Reading…')
    try {
      const info = await inspectPdf(bytes)
      setDoc({ name, bytes, info })
      setMode(info.encrypted ? 'unlock' : 'protect')
      if (info.encrypted && info.openWithoutPassword) setUnlockPw('')
    } catch (e) {
      setErr(`Could not read this PDF: ${(e as Error).message}`)
    } finally { setBusy('') }
  }
  useEffect(() => {
    void samplePdf().then((b) => open('sample-report.pdf', b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // First visit: encrypt the built-in sample once so the result panel shows a verified example.
  const auto = useRef(true)
  useEffect(() => {
    if (auto.current && doc?.name === 'sample-report.pdf') { auto.current = false; void protect() }
  })

  const encSample = async () => {
    const b = await encryptPdf(await samplePdf(), { user: 'demo', owner: 'demo-owner', perms: { ...ALL, copy: false }, method: 'AES-256', encryptMetadata: true })
    await open('locked-sample.pdf', b.bytes)
    setUnlockPw('demo')
  }

  const protect = async () => {
    if (!doc) return
    if (!user && !owner) { setErr('Set at least one password.'); return }
    setErr(''); setBusy('Encrypting…')
    try {
      const t0 = performance.now()
      const r = await encryptPdf(doc.bytes, { user, owner: owner || user, perms: s.perms, method: s.method, encryptMetadata: s.encryptMetadata })
      // Self-check: re-open the result and authenticate with the passwords.
      const info = await inspectPdf(r.bytes)
      const ok = user ? !info.openWithoutPassword : !!info.openWithoutPassword
      await decryptPdf(r.bytes, owner || user)
      let wrongRefused = true
      try { await decryptPdf(r.bytes, (user || owner) + 'x'); wrongRefused = false } catch { /* expected */ }
      const ms = performance.now() - t0
      setOut({
        name: doc.name.replace(/\.pdf$/i, '') + '-protected.pdf',
        bytes: r.bytes,
        tone: ok && wrongRefused ? 'ok' : 'warn',
        summary: [
          `${info.method} (V${info.V}/R${info.R}) · ${r.streams} streams and ${r.strings} strings encrypted in ${Math.round(ms)} ms.`,
          user ? 'Needs the user password to open ✓' : 'Opens without a password; the owner password guards the permissions.',
          wrongRefused ? 'Verified: a wrong password is refused ✓' : 'Warning: verification failed.',
          `Owner password ${owner ? 'set separately' : 'equals the user password'}.`,
        ],
      })
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const unlock = async () => {
    if (!doc) return
    setErr(''); setBusy('Decrypting…')
    try {
      const r = await decryptPdf(doc.bytes, unlockPw)
      setOut({
        name: doc.name.replace(/\.pdf$/i, '') + '-unlocked.pdf',
        bytes: r.bytes,
        tone: 'ok',
        summary: [`Authenticated with the ${r.as} password.`, `${r.streams} streams and ${r.strings} strings decrypted (${doc.info.method}).`, 'The result has no password and no permission restrictions.'],
      })
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const info = doc?.info
  const permOn = Object.values(s.perms).filter(Boolean).length

  return (
    <Split>
      <div>
        <Panel title="PDF file">
          <FileDrop accept="application/pdf,.pdf" onFiles={async ([f]) => open(f.name, new Uint8Array(await f.arrayBuffer()))} label="Drop a PDF or click to choose" />
          <Row>
            <Btn onClick={() => void samplePdf().then((b) => open('sample-report.pdf', b))}>Plain sample</Btn>
            <Btn onClick={() => void encSample()}>Encrypted sample (password “demo”)</Btn>
          </Row>
          {doc && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              <b>{doc.name}</b> · {fmtBytes(doc.bytes.length)} · {info?.pages ?? '?'} page(s) · {info?.encrypted ? `🔒 ${info.method ?? 'encrypted'}` : '🔓 not encrypted'}
            </p>
          )}
        </Panel>

        <Panel title="Action">
          <Seg value={mode} onChange={(m) => { setMode(m); setOut(null); setErr('') }} options={[['protect', '🔒 Add password'], ['unlock', '🔓 Remove password']]} />
          {mode === 'protect' ? (
            info?.encrypted ? <Note tone="warn">This file is already encrypted. Remove the password first, then protect it again.</Note> : (
              <>
                <PwField label="Open password (user)" value={user} onChange={setUser} show={show} hint="needed to open" />
                <PwField label="Permissions password (owner)" value={owner} onChange={setOwner} show={show} hint="blank = same as open password" />
                <Row>
                  <Check label="Show passwords" value={show} onChange={setShow} />
                  <Btn kind="ghost" onClick={() => { setUser(genPassword()); setShow(true) }}>🎲 Generate</Btn>
                  <Btn kind="ghost" onClick={() => { setOwner(genPassword()); setShow(true) }}>🎲 Owner</Btn>
                </Row>
                <Select label="Encryption" value={s.method} onChange={(method) => set({ method })} options={[['AES-256', 'AES-256 (PDF 2.0, R6) — recommended'], ['AES-128', 'AES-128 (PDF 1.6, R4)'], ['RC4-128', 'RC4-128 (PDF 1.4, R3) — legacy, weak']] as const} />
                <Check label="Encrypt document metadata (XMP)" value={s.encryptMetadata || s.method === 'RC4-128'} onChange={(encryptMetadata) => set({ encryptMetadata })} />
                <div style={{ marginTop: 10 }}><Btn kind="primary" disabled={!!busy || !doc} onClick={() => void protect()}>{busy || '🔒 Encrypt PDF'}</Btn></div>
              </>
            )
          ) : !info?.encrypted ? <Note>This file has no password. Choose “Add password” or load an encrypted PDF.</Note> : !info.supported ? <Note tone="err">{info.note}</Note> : (
            <>
              <PwField label="Password (user or owner)" value={unlockPw} onChange={setUnlockPw} show={show} />
              <Row>
                <Check label="Show" value={show} onChange={setShow} />
                <Btn kind="primary" disabled={!!busy} onClick={() => void unlock()}>{busy || '🔓 Remove password'}</Btn>
              </Row>
              {info.openWithoutPassword && <Note>This file opens without a password (only permissions are restricted). Leave the field empty to strip the restrictions — only do this for files you are allowed to edit.</Note>}
            </>
          )}
          {err && <Note tone="err">{err}</Note>}
        </Panel>

        {mode === 'protect' && !info?.encrypted && (
          <Panel title={`Permissions (${permOn}/8 allowed)`} actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Row>{PRESETS.map(([l, p]) => <Btn key={l} kind="ghost" onClick={() => set({ perms: p })}>{l}</Btn>)}</Row>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, marginTop: 8 }}>
              {PERMS.map((d) => <Check key={d.key} label={d.label} value={s.perms[d.key]} onChange={(v) => set({ perms: { ...s.perms, [d.key]: v } })} />)}
            </div>
            <Note>Permissions are honoured by compliant readers but are not cryptographic: anyone with the open password can technically bypass them. Use a strong open password for confidentiality.</Note>
          </Panel>
        )}
      </div>

      <div>
        <Stats>
          <Stat label="Status" value={info ? (info.encrypted ? '🔒 Encrypted' : '🔓 Open') : '—'} tone={info?.encrypted ? 'accent' : undefined} />
          <Stat label="Cipher" value={info?.encrypted ? info.method ?? '?' : mode === 'protect' ? s.method : '—'} sub={info?.encrypted ? `V${info.V} · R${info.R}` : 'will be used'} />
          <Stat label="Pages" value={info?.pages ?? '—'} sub={doc ? fmtBytes(doc.bytes.length) : ''} />
          <Stat label="Opens without password" value={info?.encrypted ? (info.openWithoutPassword ? 'yes' : 'no') : '—'} />
        </Stats>

        {out && (
          <Panel title="Result" actions={<Btn kind="primary" onClick={() => download(out.name, new Blob([out.bytes as BlobPart], { type: 'application/pdf' }))}>⬇ Download {out.name}</Btn>}>
            <Note tone={out.tone}>{out.summary.map((l) => <div key={l}>{l}</div>)}</Note>
            <p className="muted">{fmtBytes(out.bytes.length)} · <Btn kind="ghost" onClick={() => void open(out.name, out.bytes)}>Load result as input</Btn></p>
          </Panel>
        )}

        {info?.encrypted && info.perms && (
          <Panel title="Permissions in this file">
            <Table head={['Permission', 'Allowed']} rows={PERMS.map((d) => [d.label, info.perms![d.key] ? '✓ yes' : '✗ no'])} />
            <p className="muted">P = {info.P} · metadata {info.encMeta ? 'encrypted' : 'in clear'}</p>
          </Panel>
        )}

        <Panel title="What this tool supports">
          <Table
            head={['Scheme', 'Encrypt', 'Decrypt']}
            rows={[
              ['AES-256 · V5/R6 (PDF 2.0)', '✓', '✓'],
              ['AES-256 · V5/R5 (Acrobat 9 extension)', '—', '✓'],
              ['AES-128 · V4/R4 (AESV2)', '✓', '✓'],
              ['RC4-128 · V2/R3', '✓', '✓'],
              ['RC4-40 · V1/R2', '—', '✓'],
              ['Certificate / DRM handlers (/PubSec, /Adobe.APS)', '✗', '✗'],
            ]}
          />
          <Note>
            Everything runs locally: AES via Web Crypto, MD5/RC4 and the ISO 32000-2 hardened hash (Algorithm 2.B) implemented in this page. Every string and stream is encrypted; object streams
            are written out as regular objects. Digital signatures are invalidated by re-encryption. The file never leaves your browser.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
