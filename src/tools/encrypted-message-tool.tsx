import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { clearsign, decrypt, encrypt, exportPrivate, exportPublic, fpPretty, generateKey, importKey, inspect, type StoredKey, unlock, verifyClearsigned } from './lib/encrypted-message-tool'

type Tab = 'encrypt' | 'decrypt' | 'sign' | 'keys'
interface State { keys: StoredKey[] }
const DEF: State = { keys: [] }

const Badge = ({ status, uid, fp }: { status: string; uid?: string; fp?: string }) => {
  const map: Record<string, [string, 'ok' | 'err' | 'warn' | 'info']> = {
    valid: [`✅ Good signature from ${uid}`, 'ok'],
    invalid: [`❌ BAD signature — claimed signer ${uid}. The text was altered or the signature forged.`, 'err'],
    unknown: [`⚠ Signed by ${uid ?? 'an unknown key'} (${fp ? fpPretty(fp).slice(0, 24) + '…' : '?'}), but that public key isn’t in your keyring, so it can’t be verified.`, 'warn'],
    none: ['ℹ Not signed — anyone could have written this message.', 'info'],
  }
  const [t, tone] = map[status] ?? map.none
  return <Note tone={tone}>{t}</Note>
}

export default function EncryptedMessageTool() {
  const [s, set] = useToolState('encrypted-message-tool', DEF)
  const [tab, setTab] = useState<Tab>('decrypt')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  // encrypt
  const [plain, setPlain] = useState('The package arrives Thursday. Bring the blue folder.\n— A.')
  const [to, setTo] = useState<string[]>([])
  const [usePw, setUsePw] = useState(false)
  const [pw, setPw] = useState('')
  const [signWith, setSignWith] = useState('')
  const [signPass, setSignPass] = useState('')
  const [cipher, setCipher] = useState('')
  // decrypt
  const [incoming, setIncoming] = useState('')
  const [decPass, setDecPass] = useState('')
  const [decPw, setDecPw] = useState('')
  const [result, setResult] = useState<{ text: string; ts: string; sig: { status: string; uid?: string; fp?: string }; key?: string } | null>(null)
  // sign / verify
  const [toSign, setToSign] = useState('I approve invoice #2041 for $1,250.')
  const [signed, setSigned] = useState('')
  const [verifyIn, setVerifyIn] = useState('')
  const [verifyRes, setVerifyRes] = useState<{ status: string; uid?: string; fp?: string; ts?: string } | null>(null)
  // keys
  const [uid, setUid] = useState('')
  const [email, setEmail] = useState('')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [importText, setImportText] = useState('')
  const [shown, setShown] = useState<{ title: string; text: string } | null>(null)

  const own = s.keys.filter((k) => k.priv)
  const signer = s.keys.find((k) => k.fp === signWith && k.priv) ?? own[0]
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  // first visit: create demo identities and a signed message from Alice to Bob
  const started = useRef(false)
  useEffect(() => {
    if (started.current || s.keys.length || !globalThis.crypto?.subtle) return
    started.current = true
    void (async () => {
      setBusy('Generating demo keys…')
      const alice = await generateKey('Alice Demo <alice@example.org>', '')
      const bob = await generateKey('Bob Demo <bob@example.org>', '')
      const msg = await encrypt('Hi Bob! This message was encrypted to your key and signed by me.\nTry editing one character of the armored block and decrypting again.', { to: [bob], signWith: { key: alice, sig: (await unlock(alice, '')).sig } })
      set({ keys: [alice, bob] })
      setTo([bob.fp])
      setSignWith(alice.fp)
      setIncoming(msg)
      setBusy('')
    })()
  }, [s.keys.length, set])

  const info = (() => {
    try {
      return incoming.trim() ? inspect(incoming) : null
    } catch {
      return null
    }
  })()
  const nameOf = (fp: string) => s.keys.find((k) => k.fp === fp)?.pub.uid ?? `unknown key ${fpPretty(fp).slice(0, 14)}…`

  if (!globalThis.crypto?.subtle) return <Note tone="err">This browser does not expose WebCrypto (crypto.subtle). Open the page over HTTPS in a modern browser.</Note>

  return (
    <div>
      <Row>
        <Seg value={tab} onChange={(t) => { setTab(t); setErr('') }} options={[['encrypt', '🔒 Encrypt'], ['decrypt', '🔓 Decrypt'], ['sign', '✍ Sign / verify'], ['keys', `🔑 Keyring (${s.keys.length})`]]} label="Mode" />
        {busy && <span className="muted">⏳ {busy}</span>}
      </Row>
      {err && <Note tone="err">{err}</Note>}

      {tab === 'encrypt' && (
        <Split>
          <div>
            <Panel title="Message"><Area value={plain} onChange={setPlain} rows={8} /></Panel>
            <Panel title="Protect with">
              <Seg value={usePw ? 'pw' : 'pk'} onChange={(v) => setUsePw(v === 'pw')} options={[['pk', 'Recipients’ public keys'], ['pw', 'Shared password']]} />
              {usePw ? (
                <Txt label="Password (PBKDF2-SHA256, 600k iterations)" type="password" value={pw} onChange={setPw} hint={pw.length < 10 ? 'Use 10+ characters or a passphrase of several words.' : 'Share it over a different channel.'} />
              ) : (
                <div style={{ marginTop: 8 }}>
                  {s.keys.length === 0 && <p className="muted">No keys yet — add some in the Keyring tab.</p>}
                  {s.keys.map((k) => (
                    <Check key={k.fp} label={<>{k.pub.uid} <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fpPretty(k.fp).slice(0, 14)}…</span></>} value={to.includes(k.fp)} onChange={(v) => setTo(v ? [...to, k.fp] : to.filter((x) => x !== k.fp))} />
                  ))}
                </div>
              )}
              <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
              <Check label="Sign the message" value={!!signWith && !!signer} onChange={(v) => setSignWith(v ? (own[0]?.fp ?? '') : '')} />
              {signWith && signer && (
                <Row>
                  <label className="k-field" style={{ flex: '1 1 200px' }}><span className="k-label">Sign as</span>
                    <select className="k-select" value={signer.fp} onChange={(e) => setSignWith(e.target.value)}>{own.map((k) => <option key={k.fp} value={k.fp}>{k.pub.uid}</option>)}</select></label>
                  {signer.priv?.protected && <Txt label="Passphrase" type="password" value={signPass} onChange={setSignPass} />}
                </Row>
              )}
              <Btn kind="primary" disabled={!!busy || !plain || (usePw ? !pw : !to.length)} onClick={() => run('Encrypting…', async () => {
                const sw = signWith && signer ? { key: signer, sig: (await unlock(signer, signPass)).sig } : undefined
                setCipher(await encrypt(plain, usePw ? { password: pw, signWith: sw } : { to: s.keys.filter((k) => to.includes(k.fp)), signWith: sw }))
              })}>🔒 Encrypt</Btn>
            </Panel>
          </div>
          <div>
            <Panel title="Armored output" actions={cipher && <>
              <CopyButton text={cipher} />
              <Btn onClick={() => download('message.btx.asc', cipher, 'text/plain')}>⬇ .asc</Btn>
              <Btn onClick={() => { setIncoming(cipher); setTab('decrypt') }}>Try decrypting →</Btn>
            </>}>
              {cipher ? <Area value={cipher} onChange={setCipher} rows={16} mono /> : <p className="muted">Encrypted text will appear here, ready to paste into email or chat.</p>}
            </Panel>
            {cipher && (
              <Stats>
                <Stat label="Plaintext" value={`${new TextEncoder().encode(plain).length} B`} />
                <Stat label="Armored" value={`${cipher.length} B`} />
                <Stat label="Recipients" value={usePw ? 'password' : to.length} />
              </Stats>
            )}
            <Note>Each message gets a fresh AES-256-GCM key. For every recipient an ephemeral P-256 ECDH key derives (via HKDF-SHA256) an AES-KW key that wraps it. GCM detects any change to the ciphertext.</Note>
          </div>
        </Split>
      )}

      {tab === 'decrypt' && (
        <Split>
          <div>
            <Panel title="Paste an armored message">
              <Area value={incoming} onChange={(v) => { setIncoming(v); setResult(null) }} rows={14} mono placeholder="-----BEGIN BTX MESSAGE-----" />
              {info && (info.mode === 'pw'
                ? <p className="muted">Password-encrypted message.</p>
                : <p className="muted">Encrypted to: {info.recipients.map(nameOf).join(', ')}</p>)}
              {info?.mode === 'pw' ? <Txt label="Password" type="password" value={decPw} onChange={setDecPw} /> : <Txt label="Your key passphrase (blank if none)" type="password" value={decPass} onChange={setDecPass} />}
              <Btn kind="primary" disabled={!!busy || !incoming.trim()} onClick={() => run('Decrypting…', async () => {
                const r = await decrypt(incoming, s.keys, () => decPass, decPw)
                setResult({ text: r.text, ts: r.ts, sig: r.signature, key: r.usedKey?.pub.uid })
              })}>🔓 Decrypt</Btn>
            </Panel>
          </div>
          <div>
            <Panel title="Decrypted message" actions={result && <CopyButton text={result.text} />}>
              {result ? (
                <>
                  <Badge {...result.sig} />
                  <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 15, margin: 0 }}>{result.text}</pre>
                  <p className="muted">Written {new Date(result.ts).toLocaleString()}{result.key ? ` · opened with ${result.key}` : ''}</p>
                </>
              ) : (
                <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>A demo message from Alice to Bob is already pasted on the left — press <b>Decrypt</b>.</li>
                  <li>Change one character inside the armored block and decrypt again: the checksum or GCM tag catches it.</li>
                  <li>Create your own key in <b>Keyring</b>, send your public key to a friend, and import theirs.</li>
                </ol>
              )}
            </Panel>
          </div>
        </Split>
      )}

      {tab === 'sign' && (
        <Split>
          <Panel title="Clear-sign text">
            <Area value={toSign} onChange={setToSign} rows={5} />
            {own.length ? (
              <Row>
                <label className="k-field" style={{ flex: '1 1 200px' }}><span className="k-label">Sign as</span>
                  <select className="k-select" value={signer?.fp} onChange={(e) => setSignWith(e.target.value)}>{own.map((k) => <option key={k.fp} value={k.fp}>{k.pub.uid}</option>)}</select></label>
                {signer?.priv?.protected && <Txt label="Passphrase" type="password" value={signPass} onChange={setSignPass} />}
              </Row>
            ) : <p className="muted">Create a key first.</p>}
            <Btn kind="primary" disabled={!signer || !!busy} onClick={() => run('Signing…', async () => setSigned(await clearsign(toSign, signer!, (await unlock(signer!, signPass)).sig)))}>✍ Sign</Btn>
            {signed && <>
              <Area value={signed} onChange={setSigned} rows={12} mono />
              <Row><CopyButton text={signed} /><Btn onClick={() => { setVerifyIn(signed); setVerifyRes(null) }}>Verify it →</Btn></Row>
            </>}
          </Panel>
          <Panel title="Verify a signed message">
            <Area value={verifyIn} onChange={(v) => { setVerifyIn(v); setVerifyRes(null) }} rows={12} mono placeholder="-----BEGIN BTX SIGNED MESSAGE-----" />
            <Btn kind="primary" disabled={!verifyIn.trim() || !!busy} onClick={() => run('Verifying…', async () => setVerifyRes(await verifyClearsigned(verifyIn, s.keys)))}>Verify</Btn>
            {verifyRes && <><Badge {...verifyRes} />{verifyRes.ts && <p className="muted">Signed {new Date(verifyRes.ts).toLocaleString()}</p>}</>}
          </Panel>
        </Split>
      )}

      {tab === 'keys' && (
        <Split>
          <div>
            <Panel title="New key pair">
              <Row>
                <Txt label="Name" value={uid} onChange={setUid} placeholder="Ada Lovelace" />
                <Txt label="Email" value={email} onChange={setEmail} placeholder="ada@example.org" />
              </Row>
              <Row>
                <Txt label="Passphrase" type="password" value={pass1} onChange={setPass1} />
                <Txt label="Repeat" type="password" value={pass2} onChange={setPass2} />
              </Row>
              {pass1 !== pass2 && <Note tone="warn">Passphrases differ.</Note>}
              {!pass1 && <Note tone="warn">Without a passphrase anyone with access to this browser profile can use the key.</Note>}
              <Btn kind="primary" disabled={!uid.trim() || pass1 !== pass2 || !!busy} onClick={() => run('Generating keys…', async () => {
                const k = await generateKey(email.trim() ? `${uid.trim()} <${email.trim()}>` : uid.trim(), pass1)
                set({ keys: [...s.keys, k] })
                setUid('')
                setEmail('')
                setPass1('')
                setPass2('')
              })}>Generate P-256 keys</Btn>
            </Panel>
            <Panel title="Import key">
              <Area value={importText} onChange={setImportText} rows={6} mono placeholder="-----BEGIN BTX PUBLIC KEY BLOCK-----" />
              <Btn disabled={!importText.trim()} onClick={() => run('Importing…', async () => {
                const k = await importKey(importText)
                const ex = s.keys.find((x) => x.fp === k.fp)
                set({ keys: ex ? s.keys.map((x) => (x.fp === k.fp ? { ...x, priv: x.priv ?? k.priv } : x)) : [...s.keys, k] })
                setImportText('')
              })}>Import</Btn>
            </Panel>
          </div>
          <div>
            <Panel title="Keyring" actions={<JsonButtons name="keyring.json" data={s} onLoad={(d) => Array.isArray(d?.keys) && set({ keys: d.keys })} />}>
              <Table head={['Identity', 'Fingerprint', 'Type', '']} rows={s.keys.map((k) => [
                <span key="u"><b>{k.pub.uid}</b><br /><span className="muted" style={{ fontSize: 12 }}>{new Date(k.pub.created).toLocaleDateString()}</span></span>,
                <code key="f" style={{ fontSize: 11.5, whiteSpace: 'normal' }}>{fpPretty(k.fp)}</code>,
                k.priv ? (k.priv.protected ? '🔐 private (protected)' : '🔓 private') : '📇 public',
                <span key="a" style={{ display: 'flex', gap: 4 }}>
                  <Btn onClick={() => setShown({ title: `Public key · ${k.pub.uid}`, text: exportPublic(k) })}>Public</Btn>
                  {k.priv && <Btn onClick={() => setShown({ title: `PRIVATE key · ${k.pub.uid}`, text: exportPrivate(k) })}>Private</Btn>}
                  <Btn kind="ghost" onClick={() => {
                    if (confirm(`Delete ${k.pub.uid}?`)) set({ keys: s.keys.filter((x) => x.fp !== k.fp) })
                  }}>✕</Btn>
                </span>,
              ])} />
            </Panel>
            {shown && (
              <Panel title={shown.title} actions={<><CopyButton text={shown.text} /><Btn onClick={() => download(`${shown.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.asc`, shown.text, 'text/plain')}>⬇ .asc</Btn><Btn kind="ghost" onClick={() => setShown(null)}>Close</Btn></>}>
                {shown.title.startsWith('PRIVATE') && <Note tone="warn">Keep this secret. It is encrypted with your passphrase (if you set one).</Note>}
                <Area value={shown.text} onChange={() => undefined} rows={10} mono />
              </Panel>
            )}
          </div>
        </Split>
      )}
      <Note tone="warn">
        Uses standard WebCrypto primitives (ECDH/ECDSA P-256, AES-GCM, HKDF, PBKDF2) in a simple PGP-style armored format of its own. It is <b>not</b> OpenPGP-compatible — use GnuPG to exchange mail with PGP users. Keys live only in this browser’s storage; back them up from the Keyring tab.
      </Note>
    </div>
  )
}
