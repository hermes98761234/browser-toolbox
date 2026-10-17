import { useEffect, useMemo, useState } from 'react'
import { Area, Bar, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Split, Stat, Stats, Table } from '../kit'
import { body, decodeCert, digest, dnString, hex, makeSampleChain, oid, OIDS, parseDer, readInput, str, time, toB64, toPem, verify, type Cert, type Node } from './lib/certificate-decoder'

const TAGS: Record<number, string> = { 1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL', 6: 'OBJECT IDENTIFIER', 12: 'UTF8String', 16: 'SEQUENCE', 17: 'SET', 19: 'PrintableString', 20: 'T61String', 22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime', 30: 'BMPString' }
const DAY = 86400000

function preview(n: Node): string {
  if (n.cls !== 0 || n.constructed) return ''
  const b = body(n)
  try {
    if (n.tag === 6) { const o = oid(b); return OIDS[o] ? `${o} (${OIDS[o]})` : o }
    if ([12, 19, 20, 22, 30].includes(n.tag)) return str(n)
    if (n.tag === 23 || n.tag === 24) return time(n).toISOString()
    if (n.tag === 1) return b[0] ? 'TRUE' : 'FALSE'
  } catch { /* fall through to hex */ }
  const h = hex(b.subarray(0, 24), ' ')
  return b.length > 24 ? `${h} … (${b.length} bytes)` : h
}

function Tree({ n, depth = 0 }: { n: Node; depth?: number }) {
  const label = n.cls === 0 ? (TAGS[n.tag] ?? `[UNIVERSAL ${n.tag}]`) : `[${['UNIV', 'APP', '', 'PRIV'][n.cls]}${n.tag}]`
  const head = <><b>{label}</b> <span className="muted">({n.len})</span> <span style={{ wordBreak: 'break-all' }}>{preview(n)}</span></>
  if (!n.children) return <div style={{ paddingLeft: 14 }}>{head}</div>
  return (
    <details open={depth < 3} style={{ paddingLeft: depth ? 14 : 0 }}>
      <summary>{head}</summary>
      {n.children.map((c, i) => <Tree key={i} n={c} depth={depth + 1} />)}
    </details>
  )
}

const cn = (c: Cert) => c.subject.find(([k]) => k === 'CN')?.[1] ?? dnString(c.subject)
function status(c: Cert, now: number): [string, 'good' | 'bad' | 'accent', string] {
  if (now < c.notBefore.getTime()) return ['Not yet valid', 'bad', `starts in ${Math.ceil((c.notBefore.getTime() - now) / DAY)} days`]
  const left = (c.notAfter.getTime() - now) / DAY
  if (left < 0) return ['Expired', 'bad', `${Math.floor(-left)} days ago`]
  return [left < 30 ? 'Expiring soon' : 'Valid', left < 30 ? 'accent' : 'good', `${Math.floor(left)} days left`]
}

export default function CertificateDecoder() {
  const [text, setText] = useState('')
  const [pick, setPick] = useState(0)
  const [fp, setFp] = useState<{ sha256: string; sha1: string; pin: string } | null>(null)
  const [sigs, setSigs] = useState<(boolean | null | 'self')[]>([])
  const [loading, setLoading] = useState(true)
  const [now] = useState(() => Date.now())

  const sample = (expired = false) => {
    setLoading(true)
    makeSampleChain(expired).then((t) => { setText(t); setPick(0) }).catch(() => setText('')).finally(() => setLoading(false))
  }
  useEffect(() => {
    let alive = true
    makeSampleChain().then((t) => alive && setText(t)).catch(() => undefined).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const parsed = useMemo(() => {
    const blocks = readInput(text)
    const certs: Cert[] = [], errors: string[] = []
    for (const b of blocks) {
      if (b.label !== 'CERTIFICATE' && b.label !== 'HEX' && b.label !== 'BASE64' && b.label !== 'TRUSTED CERTIFICATE') { errors.push(`Skipped "${b.label}" block — only certificates are decoded.`); continue }
      try { certs.push(decodeCert(b.der)) } catch (e) { errors.push((e as Error).message) }
    }
    return { certs, errors, empty: !blocks.length && text.trim().length > 0 }
  }, [text])
  const certs = parsed.certs
  const c = certs[Math.min(pick, certs.length - 1)]

  useEffect(() => {
    let alive = true
    if (!c) return
    Promise.all([digest('SHA-256', c.der), digest('SHA-1', c.der), crypto.subtle.digest('SHA-256', c.spki.slice().buffer as ArrayBuffer)])
      .then(([sha256, sha1, pin]) => alive && setFp({ sha256, sha1, pin: toB64(new Uint8Array(pin)) }))
      .catch(() => alive && setFp(null))
    return () => { alive = false }
  }, [c])
  useEffect(() => {
    let alive = true
    Promise.all(certs.map(async (x, i) => {
      if (x.selfSigned) return (await verify(x, x)) === false ? false : ('self' as const)
      const issuer = certs.find((y, j) => j !== i && dnString(y.subject) === dnString(x.issuer) && (!x.aki || !y.ski || x.aki === y.ski))
      return issuer ? verify(x, issuer) : null
    })).then((r) => alive && setSigs(r))
    return () => { alive = false }
  }, [certs])

  const loadFiles = async (fs: File[]) => {
    const parts = await Promise.all(fs.map(async (f) => {
      const b = new Uint8Array(await f.arrayBuffer())
      return b[0] === 0x30 ? toPem(b) : new TextDecoder().decode(b)
    }))
    setText(parts.join('\n'))
    setPick(0)
  }

  const st = c ? status(c, now) : null
  const life = c ? (now - c.notBefore.getTime()) / (c.notAfter.getTime() - c.notBefore.getTime()) : 0
  const tree = useMemo(() => { try { return c ? parseDer(c.der) : null } catch { return null } }, [c])

  return (
    <Split wide="right">
      <div>
        <Panel title="Certificate input">
          <FileDrop accept=".pem,.crt,.cer,.der,.txt" multiple onFiles={(fs) => void loadFiles(fs)} label="Drop .pem / .crt / .der files" />
          <div style={{ marginTop: 8 }}><Area value={text} onChange={(t) => { setText(t); setPick(0) }} rows={10} mono placeholder="-----BEGIN CERTIFICATE-----" /></div>
          <Row>
            <Btn onClick={() => sample(false)}>Sample chain</Btn>
            <Btn onClick={() => sample(true)}>Expired leaf</Btn>
            <Btn kind="ghost" onClick={() => setText('')}>Clear</Btn>
          </Row>
          {loading && <p className="muted">Generating a sample chain with WebCrypto…</p>}
          {parsed.empty && <Note tone="err">No PEM block, base64 or hex DER found.</Note>}
          {parsed.errors.map((e, i) => <Note key={i} tone="warn">{e}</Note>)}
          <p className="muted" style={{ fontSize: 12 }}>Get a site's chain with <code>openssl s_client -connect host:443 -showcerts</code>. Everything is decoded locally; nothing is uploaded.</p>
        </Panel>
        {certs.length > 0 && (
          <Panel title={`Chain (${certs.length})`}>
            {certs.map((x, i) => {
              const s2 = status(x, now)
              const v = sigs[i]
              return (
                <button key={i} type="button" onClick={() => setPick(i)} className="k-btn" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, borderColor: i === pick ? 'var(--accent)' : undefined, marginLeft: Math.min(i, 4) * 10, maxWidth: `calc(100% - ${Math.min(i, 4) * 10}px)` }}>
                  <b>{x.isCA ? (x.selfSigned ? '🏛 ' : '🔗 ') : '📄 '}{cn(x)}</b>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                    <span style={{ color: s2[1] === 'bad' ? 'var(--err)' : s2[1] === 'good' ? 'var(--ok)' : 'var(--warn)' }}>{s2[0]}</span> · {x.selfSigned ? 'self-signed root' : `issued by ${x.issuer.find(([k]) => k === 'CN')?.[1] ?? dnString(x.issuer)}`}
                    {' · '}{v === true ? '✓ signature verified' : v === 'self' ? '✓ self-signature' : v === false ? '✗ signature INVALID' : x.selfSigned ? '' : 'issuer not in input'}
                  </div>
                </button>
              )
            })}
          </Panel>
        )}
      </div>
      <div>
        {!c ? <Note>Paste a PEM certificate or load the sample chain.</Note> : (
          <>
            <Stats>
              <Stat label="Status" value={st![0]} sub={st![2]} tone={st![1]} />
              <Stat label="Public key" value={`${c.keyAlg} ${c.keySize || ''}`} sub={c.keyDetail} />
              <Stat label="Signature" value={c.sigAlg.replace('WithRSAEncryption', ' RSA').replace('ecdsa-with-', 'ECDSA ')} sub={/sha1|md5/i.test(c.sigAlg) ? '⚠ weak hash' : `X.509 v${c.version}`} />
              <Stat label="Type" value={c.isCA ? (c.selfSigned ? 'Root CA' : 'Intermediate CA') : 'End entity'} sub={c.san.length ? `${c.san.length} SAN entries` : ''} />
            </Stats>
            <Panel title={cn(c)} actions={<><CopyButton text={() => toPem(c.der)} label="PEM" /><Btn onClick={() => download(`${cn(c).replace(/[^\w.-]+/g, '_')}.der`, new Blob([c.der.slice().buffer as ArrayBuffer], { type: 'application/pkix-cert' }))}>⬇ DER</Btn></>}>
              <Table head={['Field', 'Value']} rows={[
                ['Subject', dnString(c.subject)],
                ['Issuer', dnString(c.issuer)],
                ['Serial', <span key="s" className="mono" style={{ fontSize: 12, wordBreak: 'break-all', whiteSpace: 'normal', display: 'block' }}>{c.serial}</span>],
                ['Not before', c.notBefore.toUTCString()],
                ['Not after', c.notAfter.toUTCString()],
                ['Lifetime', `${Math.round((c.notAfter.getTime() - c.notBefore.getTime()) / DAY)} days`],
              ]} />
              <div style={{ marginTop: 8 }}><Bar value={Math.max(0, Math.min(1, life))} color={life > 1 ? 'var(--err)' : life > 0.85 ? 'var(--warn)' : 'var(--ok)'} /></div>
              <p className="muted" style={{ fontSize: 12 }}>{Math.round(Math.max(0, Math.min(1, life)) * 100)}% of the validity period used</p>
            </Panel>
            {c.san.length > 0 && (
              <Panel title="Subject Alternative Names">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.san.map((n) => <span key={n} className="mono" style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--panel2)', border: '1px solid var(--line)', fontSize: 13 }}>{n}</span>)}
                </div>
              </Panel>
            )}
            <Panel title="Fingerprints">
              {fp ? (
                <Table head={['Digest', 'Value', '']} rows={[
                  ['SHA-256', <span key="a" className="mono" style={{ fontSize: 12, wordBreak: 'break-all', whiteSpace: 'normal', display: 'block' }}>{fp.sha256}</span>, <CopyButton key="c" text={fp.sha256} />],
                  ['SHA-1', <span key="b" className="mono" style={{ fontSize: 12, wordBreak: 'break-all', whiteSpace: 'normal', display: 'block' }}>{fp.sha1}</span>, <CopyButton key="d" text={fp.sha1} />],
                  ['SPKI pin (sha256/base64)', <span key="p" className="mono" style={{ fontSize: 12, wordBreak: 'break-all', whiteSpace: 'normal', display: 'block' }}>{fp.pin}</span>, <CopyButton key="e" text={fp.pin} />],
                ]} />
              ) : <p className="muted">Computing…</p>}
            </Panel>
            <Panel title={`Extensions (${c.extensions.length})`}>
              <Table head={['Extension', 'Value']} rows={c.extensions.map((e) => [
                <span key="n">{e.name}{e.critical && <b style={{ color: 'var(--warn)' }}> critical</b>}<br /><span className="muted mono" style={{ fontSize: 11 }}>{e.oid}</span></span>,
                <div key="v" style={{ fontSize: 13, wordBreak: 'break-all' }}>{e.values.map((v, i) => <div key={i}>{v}</div>)}</div>,
              ])} />
            </Panel>
            <Panel title="ASN.1 structure">
              <div className="mono" style={{ fontSize: 12, maxHeight: 420, overflow: 'auto' }}>{tree && <Tree n={tree} />}</div>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
