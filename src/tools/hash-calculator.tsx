import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { ALGOS, normalizeExpected, STREAMING, toBase64, toHex, type Algo } from './lib/hash-calculator'

const DEF = {
  mode: 'text' as 'text' | 'file',
  text: 'The quick brown fox jumps over the lazy dog',
  algos: ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'BLAKE3', 'CRC-32'] as Algo[],
  fmt: 'hex' as 'hex' | 'HEX' | 'b64',
  expected: '9e107d9d372bb6826bd81d3542a419d6',
  hmacKey: '',
}
const SUBTLE: Partial<Record<Algo, string>> = { 'SHA-1': 'SHA-1', 'SHA-256': 'SHA-256', 'SHA-384': 'SHA-384', 'SHA-512': 'SHA-512' }
const CHUNK = 4 << 20
const WHOLE_LIMIT = 512 << 20

type Digests = Partial<Record<Algo, Uint8Array | string>>
interface FileResult {
  name: string
  size: number
  ms: number
  digests: Digests
}

async function hashText(text: string, algos: Algo[], key: string): Promise<Digests> {
  const data = new TextEncoder().encode(text)
  const out: Digests = {}
  for (const a of algos) {
    if (key) {
      if (!SUBTLE[a]) {
        out[a] = 'HMAC n/a'
        continue
      }
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: SUBTLE[a]! }, false, ['sign'])
      out[a] = new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
    } else if (STREAMING[a]) {
      const h = STREAMING[a]!()
      h.update(data)
      out[a] = h.digest()
    } else out[a] = new Uint8Array(await crypto.subtle.digest(SUBTLE[a]!, data))
  }
  return out
}

async function hashFile(f: Blob, algos: Algo[], onProgress: (p: number) => void, cancel: () => boolean): Promise<Digests> {
  const hs = algos.filter((a) => STREAMING[a]).map((a) => [a, STREAMING[a]!()] as const)
  for (let off = 0; off < f.size; off += CHUNK) {
    if (cancel()) throw new Error('cancelled')
    const buf = new Uint8Array(await f.slice(off, off + CHUNK).arrayBuffer())
    for (const [, h] of hs) h.update(buf)
    onProgress(Math.min(1, (off + CHUNK) / f.size))
  }
  const out: Digests = {}
  for (const [a, h] of hs) out[a] = h.digest()
  const whole = algos.filter((a) => !STREAMING[a])
  if (whole.length) {
    if (f.size > WHOLE_LIMIT) for (const a of whole) out[a] = 'file > 512 MB'
    else {
      const all = await f.arrayBuffer()
      for (const a of whole) out[a] = new Uint8Array(await crypto.subtle.digest(SUBTLE[a]!, all))
    }
  }
  return out
}

function demoBlob(mb: number): Blob {
  const parts: Uint8Array[] = []
  let x = 2463534242
  for (let p = 0; p < mb; p++) {
    const b = new Uint8Array(1 << 20)
    for (let i = 0; i < b.length; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      b[i] = x & 255
    }
    parts.push(b)
  }
  return new Blob(parts as BlobPart[])
}

const sizeStr = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)

export default function HashCalculator() {
  const [s, set, reset] = useToolState('hash-calculator', DEF)
  const [textRes, setTextRes] = useState<Digests>({})
  const [files, setFiles] = useState<FileResult[]>([])
  const [busy, setBusy] = useState<{ name: string; p: number } | null>(null)
  const cancelRef = useRef(false)
  const algos = ALGOS.filter((a) => s.algos.includes(a))

  useEffect(() => {
    let live = true
    hashText(s.text, algos, s.hmacKey).then((r) => live && setTextRes(r)).catch(() => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.text, s.algos.join(), s.hmacKey])

  const show = (d: Uint8Array | string | undefined) => (d === undefined ? '…' : typeof d === 'string' ? d : s.fmt === 'b64' ? toBase64(d) : s.fmt === 'HEX' ? toHex(d).toUpperCase() : toHex(d))
  const exp = s.expected.trim() ? normalizeExpected(s.expected) : ''
  const matches = (d: Uint8Array | string | undefined) => !!exp && d instanceof Uint8Array && toHex(d) === exp

  const run = async (list: { name: string; blob: Blob }[]) => {
    cancelRef.current = false
    for (const f of list) {
      setBusy({ name: f.name, p: 0 })
      const t0 = performance.now()
      try {
        const digests = await hashFile(f.blob, algos, (p) => setBusy({ name: f.name, p }), () => cancelRef.current)
        setFiles((fs) => [{ name: f.name, size: f.blob.size, ms: performance.now() - t0, digests }, ...fs].slice(0, 20))
      } catch {
        break
      }
    }
    setBusy(null)
  }

  const rows = (d: Digests) =>
    algos.map((a) => [
      <b key="a">{a}{s.hmacKey && s.mode === 'text' && SUBTLE[a] ? ' HMAC' : ''}</b>,
      <code key="h" className="mono" style={{ wordBreak: 'break-all', whiteSpace: 'normal', display: 'block', minWidth: 160, fontSize: 12.5, color: matches(d[a]) ? 'var(--ok)' : undefined, fontWeight: matches(d[a]) ? 700 : undefined }}>{show(d[a])}</code>,
      <span key="c" style={{ whiteSpace: 'nowrap' }}>{matches(d[a]) && <b style={{ color: 'var(--ok)' }}>✓ match </b>}{d[a] instanceof Uint8Array && <CopyButton text={show(d[a])} label="" />}</span>,
    ])

  const allDigests = s.mode === 'text' ? [textRes] : files.map((f) => f.digests)
  const anyMatch = exp && allDigests.some((d) => algos.some((a) => matches(d[a])))
  const matchAlgo = exp ? allDigests.flatMap((d) => algos.filter((a) => matches(d[a])))[0] : undefined
  const lenGuess: Record<number, string> = { 8: 'CRC-32', 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256 or BLAKE3', 96: 'SHA-384', 128: 'SHA-512' }

  return (
    <Split wide="right">
      <div>
        <Panel title="Input" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['text', 'Text'], ['file', 'Files']]} label="Input" />
          <div style={{ marginTop: 10 }}>
            {s.mode === 'text' ? (
              <>
                <textarea className="k-area mono" rows={7} value={s.text} onChange={(e) => set({ text: e.target.value })} aria-label="Text to hash" style={{ width: '100%' }} />
                <p className="muted" style={{ fontSize: 12.5, margin: '4px 0' }}>{new TextEncoder().encode(s.text).length} bytes, UTF-8. Hashes update as you type.</p>
                <Txt label="HMAC key (optional)" value={s.hmacKey} onChange={(hmacKey) => set({ hmacKey })} placeholder="secret" hint="With a key, SHA rows show HMAC-SHA values (Web Crypto)." />
              </>
            ) : (
              <>
                <FileDrop multiple onFiles={(fs) => void run(fs.map((f) => ({ name: f.name, blob: f })))} label="Drop files or click to choose (read locally in 4 MB chunks)" />
                <Row>
                  <Btn onClick={() => void run([{ name: 'demo-16MB.bin', blob: demoBlob(16) }])} disabled={!!busy}>Hash a generated 16 MB demo file</Btn>
                  {busy && <Btn kind="danger" onClick={() => { cancelRef.current = true }}>Cancel</Btn>}
                </Row>
                {busy && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13 }}>{busy.name} · {Math.round(busy.p * 100)}%</div>
                    <Bar value={busy.p} />
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
        <Panel title="Algorithms">
          <Row>
            {ALGOS.map((a) => (
              <Check key={a} label={a} value={s.algos.includes(a)} onChange={(on) => set({ algos: on ? [...s.algos, a] : s.algos.filter((x) => x !== a) })} />
            ))}
          </Row>
          <div className="k-label" style={{ marginTop: 8 }}>Output</div>
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['hex', 'hex'], ['HEX', 'HEX'], ['b64', 'Base64']]} label="Format" />
          <Note>MD5, SHA-1 and CRC-32 detect accidental corruption but are broken against deliberate tampering. Use SHA-256, SHA-512 or BLAKE3 to verify downloads.</Note>
        </Panel>
      </div>

      <div>
        <Panel title="Verify a checksum">
          <Txt label="Expected hash" value={s.expected} onChange={(expected) => set({ expected })} placeholder="Paste from the download page (hex or Base64)" />
          {exp && (anyMatch ? (
            <Note tone="ok">✓ Matches {matchAlgo}. The data is identical to what the publisher hashed.</Note>
          ) : (
            <Note tone="err">✗ No match among the selected algorithms.{lenGuess[exp.length] ? ` A ${exp.length}-digit hex value looks like ${lenGuess[exp.length]}${algos.some((a) => lenGuess[exp.length].includes(a)) ? '' : ' (not selected)'}.` : ''}</Note>
          ))}
        </Panel>
        {s.mode === 'text' ? (
          <Panel title="Digests">
            <Table head={['Algorithm', 'Digest', '']} rows={rows(textRes)} />
          </Panel>
        ) : files.length === 0 ? (
          <Panel title="Digests"><Note>Choose files or hash the generated demo file. Nothing is uploaded: files are read by your browser only.</Note></Panel>
        ) : (
          <>
            <Stats>
              <Stat label="Files hashed" value={files.length} />
              <Stat label="Total size" value={sizeStr(files.reduce((a, f) => a + f.size, 0))} />
              <Stat label="Last speed" value={`${(files[0].size / (1 << 20) / Math.max(files[0].ms / 1000, 1e-3)).toFixed(1)} MB/s`} sub={`${algos.length} algorithms at once`} tone="accent" />
            </Stats>
            {files.map((f, i) => (
              <Panel
                key={i}
                title={<>{f.name} <span className="muted" style={{ fontWeight: 400 }}>· {sizeStr(f.size)} · {(f.ms / 1000).toFixed(2)} s</span></>}
                actions={
                  <Btn onClick={() => download(`${f.name}.checksums.txt`, algos.filter((a) => f.digests[a] instanceof Uint8Array).map((a) => `${a}  ${toHex(f.digests[a] as Uint8Array)}  ${f.name}`).join('\n') + '\n', 'text/plain')}>⬇ Checksums</Btn>
                }
              >
                <Table head={['Algorithm', 'Digest', '']} rows={rows(f.digests)} />
              </Panel>
            ))}
            <Btn kind="ghost" onClick={() => setFiles([])}>Clear results</Btn>
          </>
        )}
      </div>
    </Split>
  )
}
