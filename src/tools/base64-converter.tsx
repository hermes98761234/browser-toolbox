import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, useToolState } from '../kit'
import { base64ToBytes, bytesToBase64, bytesToText, hexDump, sniffMime, textToBytes } from './lib/base64-converter'

type Mode = 'encode' | 'decode'

const SAMPLE_TEXT = 'Hello from Browser Toolbox! ✓\nBase64 turns any bytes into 64 safe ASCII characters — handy for JSON, e-mail and data URIs.'
const SAMPLE_B64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiM2MzY2ZjEiLz48dGV4dCB4PSIzMiIgeT0iNDIiIGZvbnQtc2l6ZT0iMjQiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj42NDwvdGV4dD48L3N2Zz4='

const DEF = { mode: 'encode' as Mode, text: SAMPLE_TEXT, b64: SAMPLE_B64, urlSafe: false, pad: true, wrap: 0, dataUri: false }

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`)

function toUrl(bytes: Uint8Array, mime: string) {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
}

export default function Base64Converter() {
  const [s, set, reset] = useToolState('base64-converter', DEF)
  const [file, setFile] = useState<{ name: string; type: string; bytes: Uint8Array } | null>(null)
  const [busy, setBusy] = useState(false)

  const srcBytes = useMemo(() => (file ? file.bytes : textToBytes(s.text)), [file, s.text])
  const encoded = useMemo(() => {
    const b = bytesToBase64(srcBytes, { urlSafe: s.urlSafe, pad: s.pad, wrap: s.dataUri ? 0 : s.wrap })
    if (!s.dataUri) return b
    const mime = file?.type || sniffMime(srcBytes)?.mime || 'text/plain;charset=utf-8'
    return `data:${mime};base64,${bytesToBase64(srcBytes)}`
  }, [srcBytes, s.urlSafe, s.pad, s.wrap, s.dataUri, file])

  const decoded = useMemo(() => base64ToBytes(s.b64), [s.b64])
  const decText = decoded.ok ? bytesToText(decoded.bytes) : null
  const decMime = decoded.ok ? decoded.mime || sniffMime(decoded.bytes)?.mime : undefined
  const decExt = decoded.ok ? sniffMime(decoded.bytes)?.ext ?? (decText !== null ? 'txt' : 'bin') : 'bin'

  const previewBytes = s.mode === 'encode' ? srcBytes : decoded.ok ? decoded.bytes : null
  const previewMime = s.mode === 'encode' ? (file?.type || sniffMime(srcBytes)?.mime) : decMime
  const imgUrl = useMemo(
    () => (previewBytes && previewMime?.startsWith('image/') ? toUrl(previewBytes, previewMime) : null),
    [previewBytes, previewMime],
  )

  const onFiles = async ([f]: File[]) => {
    setBusy(true)
    const bytes = new Uint8Array(await f.arrayBuffer())
    setBusy(false)
    if (s.mode === 'encode') setFile({ name: f.name, type: f.type, bytes })
    else set({ b64: new TextDecoder().decode(bytes) })
  }

  const sampleImage = () => {
    const c = document.createElement('canvas')
    c.width = c.height = 48
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 48, 48)
    gr.addColorStop(0, '#0ea5e9')
    gr.addColorStop(1, '#a855f7')
    g.fillStyle = gr
    g.fillRect(0, 0, 48, 48)
    g.fillStyle = '#fff'
    g.font = 'bold 22px sans-serif'
    g.fillText('B64', 3, 32)
    c.toBlob(async (b) => b && setFile({ name: 'sample.png', type: 'image/png', bytes: new Uint8Array(await b.arrayBuffer()) }), 'image/png')
  }

  const inLen = srcBytes.length
  const ratio = inLen ? encoded.length / inLen : 0

  return (
    <Split>
      <div>
        <Panel title="Mode" actions={<Btn kind="ghost" onClick={() => { reset(); setFile(null) }}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['encode', 'Encode → Base64'], ['decode', 'Decode Base64 →']]} />
        </Panel>
        {s.mode === 'encode' ? (
          <Panel title="Input">
            {file ? (
              <Note tone="ok">
                File <b>{file.name}</b> ({size(file.bytes.length)}, {file.type || 'unknown type'}) <Btn kind="ghost" onClick={() => setFile(null)}>✕ Use text instead</Btn>
              </Note>
            ) : (
              <Area label="Text (UTF-8)" value={s.text} onChange={(text) => set({ text })} rows={7} />
            )}
            <FileDrop onFiles={onFiles} label={busy ? 'Reading…' : 'Drop any file to encode it (image, PDF, binary…)'} />
            <Row>
              <Btn onClick={sampleImage}>🖼 Sample PNG</Btn>
              <Btn onClick={() => { setFile(null); set({ text: SAMPLE_TEXT }) }}>Sample text</Btn>
            </Row>
          </Panel>
        ) : (
          <Panel title="Base64 input">
            <Area value={s.b64} onChange={(b64) => set({ b64 })} rows={8} mono placeholder="Paste Base64, URL-safe Base64 or a data: URI" />
            <FileDrop onFiles={onFiles} label="…or drop a .txt/.b64 file containing Base64" />
            <Note>Whitespace and line breaks are ignored; the standard (+/) or URL-safe (-_) alphabet is detected automatically, and missing padding is accepted.</Note>
          </Panel>
        )}
        <Panel title="Options">
          <Check label="URL-safe alphabet (- and _ instead of + and /)" value={s.urlSafe} onChange={(urlSafe) => set({ urlSafe, pad: !urlSafe })} />
          <Check label="Padding with =" value={s.pad} onChange={(pad) => set({ pad })} />
          <Check label="Output a data: URI" value={s.dataUri} onChange={(dataUri) => set({ dataUri })} />
          <Select label="Line wrapping" value={s.wrap} onChange={(wrap) => set({ wrap })} options={[[0, 'None (single line)'], [64, '64 chars (PEM)'], [76, '76 chars (MIME e-mail)']]} />
        </Panel>
      </div>

      <div>
        {s.mode === 'encode' ? (
          <>
            <Stats>
              <Stat label="Input" value={size(inLen)} sub={file ? 'binary file' : `${[...s.text].length} characters`} />
              <Stat label="Base64" value={size(encoded.length)} sub={`${encoded.length.toLocaleString()} chars`} tone="accent" />
              <Stat label="Overhead" value={inLen ? `+${((ratio - 1) * 100).toFixed(0)}%` : '—'} sub="≈ 4 chars per 3 bytes" />
            </Stats>
            <Panel
              title="Base64 output"
              actions={
                <>
                  <CopyButton text={encoded} />
                  <Btn onClick={() => download((file?.name ?? 'text') + '.b64.txt', encoded, 'text/plain')}>⬇ .txt</Btn>
                </>
              }
            >
              <Area value={encoded} onChange={() => {}} rows={10} mono />
            </Panel>
          </>
        ) : decoded.ok ? (
          <>
            <Stats>
              <Stat label="Decoded" value={size(decoded.bytes.length)} tone="good" />
              <Stat label="Alphabet" value={decoded.urlSafe ? 'URL-safe' : 'Standard'} />
              <Stat label="Detected type" value={decMime ?? (decText !== null ? 'UTF-8 text' : 'binary')} />
            </Stats>
            <Panel
              title={decText !== null ? 'Decoded text' : 'Hex dump (first 256 bytes)'}
              actions={
                <>
                  {decText !== null && <CopyButton text={decText} />}
                  <Btn onClick={() => download(`decoded.${decExt}`, new Blob([decoded.bytes as BlobPart], { type: decMime ?? 'application/octet-stream' }))}>⬇ Save file</Btn>
                </>
              }
            >
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflow: 'auto', margin: 0, fontSize: 13 }}>
                {decText ?? hexDump(decoded.bytes)}
              </pre>
            </Panel>
          </>
        ) : (
          <Note tone="err">{decoded.error}</Note>
        )}
        {imgUrl && (
          <Panel title="Image preview">
            <div style={{ display: 'grid', placeItems: 'center', padding: 12, background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0/16px 16px', borderRadius: 10 }}>
              <img src={imgUrl} alt="decoded preview" style={{ maxWidth: '100%', maxHeight: 260, imageRendering: 'auto' }} />
            </div>
          </Panel>
        )}
        <Panel title="How it works">
          <p className="muted" style={{ margin: 0 }}>
            Every 3 bytes (24 bits) are split into four 6-bit groups, each mapped to one of 64 characters (A–Z, a–z, 0–9, + and /). A final group of 1 or 2 bytes is padded with
            <code> =</code>. Base64 is an <b>encoding, not encryption</b> — anyone can decode it.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
