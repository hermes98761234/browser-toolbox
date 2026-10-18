import { useCallback, useEffect, useState } from 'react'
import { Btn, Check, CopyButton, download, Note, Panel, Row, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { hashGrid, jwkThumbprint, opensshPrivate, pem, spkiFingerprint, sshFingerprint, sshPublicBlob, sshPublicLine, type Jwk } from './lib/key-pair-generator'

type Alg = 'RSA-PSS' | 'RSASSA-PKCS1-v1_5' | 'RSA-OAEP' | 'ECDSA' | 'ECDH' | 'Ed25519' | 'X25519'
const ALGS: [Alg, string, string][] = [
  ['Ed25519', 'Ed25519 — signatures (SSH, modern default)', 'sign'],
  ['ECDSA', 'ECDSA — signatures (TLS, JWT ES256…)', 'sign'],
  ['RSA-PSS', 'RSA-PSS — signatures', 'sign'],
  ['RSASSA-PKCS1-v1_5', 'RSA PKCS#1 v1.5 — signatures (JWT RS256, legacy SSH)', 'sign'],
  ['RSA-OAEP', 'RSA-OAEP — encryption', 'enc'],
  ['ECDH', 'ECDH — key agreement', 'agree'],
  ['X25519', 'X25519 — key agreement', 'agree'],
]
interface S { alg: Alg; bits: number; curve: 'P-256' | 'P-384' | 'P-521'; hash: 'SHA-256' | 'SHA-384' | 'SHA-512'; comment: string; showPriv: boolean }
const DEF: S = { alg: 'Ed25519', bits: 3072, curve: 'P-256', hash: 'SHA-256', comment: 'me@laptop', showPriv: false }

interface Out {
  alg: Alg; label: string; ms: number
  spki: string; pkcs8: string; jwkPub: Jwk; jwkPriv: Jwk
  ssh: string | null; sshPriv: string | null; sshFp: string | null
  spkiFp: string; thumb: string; grid: string[]; selfTest: string
}

function params(s: S): { gen: AlgorithmIdentifier | RsaHashedKeyGenParams | EcKeyGenParams; usages: KeyUsage[]; label: string } {
  const rsa = (name: string, usages: KeyUsage[]) => ({ gen: { name, modulusLength: s.bits, publicExponent: new Uint8Array([1, 0, 1]), hash: s.hash }, usages, label: `${name} ${s.bits}-bit, ${s.hash}` })
  switch (s.alg) {
    case 'RSA-PSS': return rsa('RSA-PSS', ['sign', 'verify'])
    case 'RSASSA-PKCS1-v1_5': return rsa('RSASSA-PKCS1-v1_5', ['sign', 'verify'])
    case 'RSA-OAEP': return rsa('RSA-OAEP', ['encrypt', 'decrypt'])
    case 'ECDSA': return { gen: { name: 'ECDSA', namedCurve: s.curve }, usages: ['sign', 'verify'], label: `ECDSA ${s.curve}` }
    case 'ECDH': return { gen: { name: 'ECDH', namedCurve: s.curve }, usages: ['deriveBits'], label: `ECDH ${s.curve}` }
    case 'Ed25519': return { gen: { name: 'Ed25519' }, usages: ['sign', 'verify'], label: 'Ed25519' }
    case 'X25519': return { gen: { name: 'X25519' }, usages: ['deriveBits'], label: 'X25519' }
  }
}

async function selfTest(s: S, kp: CryptoKeyPair): Promise<string> {
  const msg = new TextEncoder().encode('Browser Toolbox self-test')
  const sub = crypto.subtle
  if (s.alg === 'RSA-OAEP') {
    const ct = await sub.encrypt({ name: 'RSA-OAEP' }, kp.publicKey, msg)
    const pt = new Uint8Array(await sub.decrypt({ name: 'RSA-OAEP' }, kp.privateKey, ct))
    return pt.length === msg.length && pt.every((b, i) => b === msg[i]) ? 'Encrypt → decrypt round trip OK' : 'Round trip FAILED'
  }
  if (s.alg === 'ECDH' || s.alg === 'X25519') {
    const other = (await sub.generateKey(s.alg === 'ECDH' ? ({ name: 'ECDH', namedCurve: s.curve } as EcKeyGenParams) : ({ name: 'X25519' } as Algorithm), false, ['deriveBits'])) as CryptoKeyPair
    const bits = s.alg === 'ECDH' ? ({ 'P-256': 256, 'P-384': 384, 'P-521': 528 } as const)[s.curve] : 256
    const a = new Uint8Array(await sub.deriveBits({ name: s.alg, public: other.publicKey }, kp.privateKey, bits))
    const b = new Uint8Array(await sub.deriveBits({ name: s.alg, public: kp.publicKey }, other.privateKey, bits))
    return a.every((x, i) => x === b[i]) ? `Shared secret agreed with a test peer (${bits} bits)` : 'Key agreement FAILED'
  }
  const alg = s.alg === 'RSA-PSS' ? { name: 'RSA-PSS', saltLength: 32 } : s.alg === 'ECDSA' ? { name: 'ECDSA', hash: s.hash } : { name: s.alg }
  const sig = await sub.sign(alg, kp.privateKey, msg)
  const ok = await sub.verify(alg, kp.publicKey, sig, msg)
  return ok ? `Sign → verify OK (signature ${sig.byteLength} bytes)` : 'Verification FAILED'
}

export default function KeyPairGenerator() {
  const [s, set, reset] = useToolState('key-pair-generator', DEF)
  const [out, setOut] = useState<Out | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [support, setSupport] = useState<Record<string, boolean>>({ Ed25519: true, X25519: true })
  const hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle

  useEffect(() => {
    if (!hasSubtle) return
    void Promise.all((['Ed25519', 'X25519'] as const).map((name) =>
      crypto.subtle.generateKey({ name }, false, name === 'Ed25519' ? ['sign', 'verify'] : ['deriveBits']).then(() => true, () => false),
    )).then(([ed, x]) => setSupport({ Ed25519: ed, X25519: x }))
  }, [hasSubtle])

  const generate = useCallback(async (st: S) => {
    if (!hasSubtle) return
    setBusy(true)
    setErr('')
    try {
      const p = params(st)
      const t0 = performance.now()
      const kp = (await crypto.subtle.generateKey(p.gen, true, p.usages)) as CryptoKeyPair
      const ms = performance.now() - t0
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
      const jwkPub = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as Jwk
      const jwkPriv = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as Jwk
      const sshOk = st.alg === 'Ed25519' || st.alg === 'ECDSA' || st.alg.startsWith('RSA')
      const blob = sshOk ? sshPublicBlob(jwkPub) : null
      const check = crypto.getRandomValues(new Uint32Array(1))[0]
      const spkiHash = new Uint8Array(await crypto.subtle.digest('SHA-256', spki))
      setOut({
        alg: st.alg, label: p.label, ms,
        spki: pem(spki, 'PUBLIC KEY'), pkcs8: pem(pkcs8, 'PRIVATE KEY'), jwkPub, jwkPriv,
        ssh: blob ? sshPublicLine(jwkPub, st.comment) : null,
        sshPriv: blob ? opensshPrivate(jwkPriv, st.comment, check) : null,
        sshFp: blob ? await sshFingerprint(blob.blob) : null,
        spkiFp: await spkiFingerprint(spki), thumb: await jwkThumbprint(jwkPub), grid: hashGrid(spkiHash),
        selfTest: await selfTest(st, kp),
      })
    } catch (e) {
      setErr(`Generation failed: ${(e as Error).message || String(e)}. This browser may not support ${st.alg}.`)
      setOut(null)
    } finally {
      setBusy(false)
    }
  }, [hasSubtle])

  useEffect(() => {
    // generate one sample key on first load
    const t = setTimeout(() => void generate(DEF), 0)
    return () => clearTimeout(t)
  }, [generate])

  const isRsa = s.alg.startsWith('RSA'), isEc = s.alg === 'ECDSA' || s.alg === 'ECDH'
  const unsupported = (s.alg === 'Ed25519' || s.alg === 'X25519') && !support[s.alg]
  const base = (s.comment.split('@')[0] || 'key').replace(/[^\w.-]/g, '_')
  const sshName = out?.alg === 'Ed25519' ? 'id_ed25519' : out?.alg === 'ECDSA' ? 'id_ecdsa' : 'id_rsa'

  const block = (title: string, text: string, file: string, secret = false) => (
    <Panel key={title} title={title} actions={<><CopyButton text={text} /><Btn onClick={() => download(file, text, 'text/plain')}>⬇ {file}</Btn></>}>
      <pre className="mono" style={{ margin: 0, padding: 10, background: 'var(--bg2)', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto', filter: secret && !s.showPriv ? 'blur(5px)' : undefined, userSelect: secret && !s.showPriv ? 'none' : undefined }}>{text}</pre>
    </Panel>
  )

  return (
    <Split>
      <div>
        <Panel title="Algorithm" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          {!hasSubtle && <Note tone="err">Web Crypto (crypto.subtle) is unavailable. Open this page over HTTPS or localhost in a modern browser.</Note>}
          <Select<Alg> label="Key type" value={s.alg} onChange={(alg) => set({ alg })} options={ALGS.map(([a, l]) => [a, (a === 'Ed25519' || a === 'X25519') && !support[a] ? `${l} (not supported here)` : l] as [Alg, string])} />
          {isRsa && (
            <Row>
              <Select label="Modulus" value={s.bits} onChange={(bits) => set({ bits })} options={[[2048, '2048 bits'], [3072, '3072 bits (recommended)'], [4096, '4096 bits (slow)']]} />
              <Select label="Hash" value={s.hash} onChange={(hash) => set({ hash })} options={[['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512']]} />
            </Row>
          )}
          {isEc && (
            <Row>
              <Select label="Curve" value={s.curve} onChange={(curve) => set({ curve })} options={[['P-256', 'P-256 (secp256r1)'], ['P-384', 'P-384 (secp384r1)'], ['P-521', 'P-521 (secp521r1)']]} />
              {s.alg === 'ECDSA' && <Select label="Signature hash" value={s.hash} onChange={(hash) => set({ hash })} options={[['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512']]} />}
            </Row>
          )}
          <Txt label="Comment (SSH)" value={s.comment} onChange={(comment) => set({ comment })} hint="Appended to the OpenSSH public key, usually user@host" />
          {unsupported && <Note tone="warn">{s.alg} is not available in this browser’s Web Crypto. Try Chrome 113+, Firefox 129+ or Safari 17+.</Note>}
          <Btn kind="primary" onClick={() => generate(s)} disabled={busy || !hasSubtle || unsupported}>{busy ? 'Generating…' : '🔑 Generate key pair'}</Btn>
          {busy && isRsa && s.bits === 4096 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>4096-bit RSA can take several seconds.</div>}
        </Panel>
        <Note tone="warn">
          <b>Keys are generated locally by your browser’s Web Crypto and never leave this page.</b> Anyone with the private key can impersonate you: save it only to a protected location
          (e.g. <code>~/.ssh</code> with <code>chmod 600</code>), never paste it into chats or tickets, and consider adding a passphrase afterwards with <code>ssh-keygen -p -f {sshName}</code>.
        </Note>
        <Panel title="Which one should I pick?">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
            <li><b>SSH login:</b> Ed25519 (fast, short keys). Use RSA 3072+ only for old servers.</li>
            <li><b>JWT / OAuth signing:</b> ECDSA P-256 (ES256) or RSA PKCS#1 (RS256).</li>
            <li><b>Encrypting small secrets:</b> RSA-OAEP 3072; for bulk data use ECDH/X25519 + AES.</li>
            <li><b>TLS / X.509:</b> ECDSA P-256 or RSA 2048+; the PEM files work with OpenSSL.</li>
          </ul>
        </Panel>
      </div>
      <div>
        {err && <Note tone="err">{err}</Note>}
        {out && (
          <>
            <Stats>
              <Stat label="Key" value={out.label} sub={`generated in ${out.ms < 1 ? '< 1' : Math.round(out.ms)} ms`} tone="accent" />
              <Stat label="Self-test" value={out.selfTest.includes('FAIL') ? '✗ failed' : '✓ passed'} sub={out.selfTest} tone={out.selfTest.includes('FAIL') ? 'bad' : 'good'} />
            </Stats>
            <Panel title="Fingerprints">
              <Row wrap={false}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 10px)', gap: 1, flex: 'none' }} title="Visual hash of the public key">
                  {out.grid.map((c, i) => <span key={i} style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />)}
                </div>
                <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {out.sshFp && <div><b>SSH:</b> {out.sshFp}</div>}
                  <div><b>SPKI SHA-256:</b> {out.spkiFp}</div>
                  <div><b>JWK thumbprint:</b> {out.thumb}</div>
                </div>
              </Row>
            </Panel>
            {out.ssh && block('OpenSSH public key (authorized_keys)', out.ssh, `${sshName}.pub`)}
            {block('Public key — PEM (SPKI)', out.spki, `${base}-public.pem`)}
            <Check label="Reveal private keys on screen" value={s.showPriv} onChange={(showPriv) => set({ showPriv })} />
            {block('Private key — PEM (PKCS#8, unencrypted)', out.pkcs8, `${base}-private.pem`, true)}
            {out.sshPriv && block('Private key — OpenSSH format (unencrypted)', out.sshPriv, sshName, true)}
            {block('Public JWK', JSON.stringify({ ...out.jwkPub, kid: out.thumb }, null, 2), `${base}-public.jwk.json`)}
            {block('Private JWK', JSON.stringify({ ...out.jwkPriv, kid: out.thumb }, null, 2), `${base}-private.jwk.json`, true)}
            <div className="muted" style={{ fontSize: 12 }}>
              Check a PEM with <code>openssl pkey -in {base}-private.pem -text -noout</code>; check the SSH key with <code>ssh-keygen -lf {sshName}.pub</code> (the SHA256 fingerprint should match).
            </div>
          </>
        )}
      </div>
    </Split>
  )
}
