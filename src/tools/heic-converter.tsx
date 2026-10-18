import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { buildHeif, exifTiff, HeifError, itemData, parseHeif, plan, pngWithExif, readBoxes, type Box, type Heif, type Plan } from './lib/heic-converter'
import { crc32, fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'
import { jpegWithExif, parseTiff, writeTiff, type WEntry } from './lib/exif-viewer'

type Fmt = 'jpeg' | 'png' | 'webp'
const DEF = { fmt: 'jpeg' as Fmt, quality: 0.9, maxEdge: 0, keepMeta: false }
const EXT: Record<Fmt, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

interface Entry {
  id: string
  name: string
  bytes: Uint8Array
  heif?: Heif
  plan?: Plan
  parseErr?: string
  placeholder?: boolean
  status: 'queued' | 'working' | 'done' | 'error'
  msg?: string
  via?: string
  out?: { blob: Blob; url: string; w: number; h: number }
}

class NoHevc extends Error {}

/** Decodes the primary image's HEVC tiles with WebCodecs and composes the grid. */
async function decodeWebCodecs(bytes: Uint8Array, h: Heif, p: Plan): Promise<HTMLCanvasElement> {
  if (p.kind === 'other') throw new HeifError(`Primary image is “${p.type}”, not HEVC`)
  if (!p.hvcC) throw new HeifError('No hvcC decoder configuration found')
  if (typeof VideoDecoder === 'undefined') throw new NoHevc('WebCodecs is not available')
  const [tw, th] = h.props.get(p.tiles[0])?.ispe ?? [p.width, p.height]
  const config: VideoDecoderConfig = { codec: p.hvcC.codec, description: p.hvcC.raw, codedWidth: tw, codedHeight: th }
  const sup = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }))
  if (!sup.supported) throw new NoHevc(`This browser cannot decode ${p.hvcC.codec}`)
  const cv = document.createElement('canvas')
  cv.width = p.width
  cv.height = p.height
  const ctx = cv.getContext('2d')!
  const cols = p.grid?.cols ?? 1
  const errs: Error[] = []
  const dec = new VideoDecoder({
    output: (f) => {
      const i = Math.round(f.timestamp)
      ctx.drawImage(f, (i % cols) * tw, Math.floor(i / cols) * th, f.displayWidth, f.displayHeight)
      f.close()
    },
    error: (e) => errs.push(e),
  })
  dec.configure(config)
  p.tiles.forEach((id, i) => dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: i, data: itemData(h, bytes, id) })))
  await dec.flush()
  dec.close()
  if (errs.length) throw errs[0]
  return cv
}

/** Safari (and some others) decode HEIC natively; the browser applies rotation itself. */
async function decodeNative(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/heic' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    cv.getContext('2d')!.drawImage(img, 0, 0)
    return cv
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Applies HEIF transformative properties (irot = anticlockwise quarter turns, imir = mirror) in order. */
function transform(src: HTMLCanvasElement, p: Plan, order: string[]): HTMLCanvasElement {
  let cv = src
  for (const t of order) {
    const next = document.createElement('canvas')
    const g = next.getContext('2d')!
    if (t === 'irot' && p.rotation) {
      const q = p.rotation
      next.width = q & 1 ? cv.height : cv.width
      next.height = q & 1 ? cv.width : cv.height
      g.translate(next.width / 2, next.height / 2)
      g.rotate((-q * Math.PI) / 2)
      g.drawImage(cv, -cv.width / 2, -cv.height / 2)
    } else if (t === 'imir' && p.mirror !== null) {
      next.width = cv.width
      next.height = cv.height
      if (p.mirror === 0) g.setTransform(-1, 0, 0, 1, cv.width, 0)
      else g.setTransform(1, 0, 0, -1, 0, cv.height)
      g.drawImage(cv, 0, 0)
    } else continue
    cv = next
  }
  return cv
}

function scaleDown(cv: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const k = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(cv.width, cv.height)) : 1
  if (k >= 1) return cv
  const out = document.createElement('canvas')
  out.width = Math.round(cv.width * k)
  out.height = Math.round(cv.height * k)
  const g = out.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(cv, 0, 0, out.width, out.height)
  return out
}

/** Keeps only capture date/time (and Orientation = 1, since pixels are already upright). */
function slimExif(h: Heif, bytes: Uint8Array, p: Plan): Uint8Array | null {
  if (p.exifId === null) return null
  const t = exifTiff(itemData(h, bytes, p.exifId))
  if (!t) return null
  const tags = parseTiff(t)
  const get = (id: number) => tags.find((x) => x.id === id && typeof x.value === 'string')?.value as string | undefined
  const ifd0: WEntry[] = [{ id: 0x0112, type: 3, value: [1] }]
  const dt = get(0x0132)
  if (dt) ifd0.push({ id: 0x0132, type: 2, value: dt })
  const ex: WEntry[] = []
  for (const id of [0x9003, 0x9004, 0x9010, 0x9011]) {
    const v = get(id)
    if (v) ex.push({ id, type: 2, value: v })
  }
  return writeTiff(ifd0, ex)
}

/** Draws a colourful demo photo for the generated sample file. */
function demoScene(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#fb923c')
  sky.addColorStop(0.55, '#f9a8d4')
  sky.addColorStop(0.56, '#1e3a8a')
  sky.addColorStop(1, '#0f172a')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#fde68a'
  g.beginPath()
  g.arc(w * 0.62, h * 0.5, h * 0.14, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1e293b'
  g.beginPath()
  g.moveTo(0, h * 0.56)
  for (let x = 0; x <= w; x += w / 12) g.lineTo(x, h * (0.42 + 0.1 * Math.sin(x / 90) + 0.05 * Math.cos(x / 37)))
  g.lineTo(w, h * 0.56)
  g.fill()
  g.fillStyle = '#fff'
  g.font = `bold ${Math.round(h / 12)}px system-ui, sans-serif`
  g.fillText('HEIC demo · 2×2 tiles', w * 0.05, h * 0.88)
  return cv
}

/** Makes a real HEIC with WebCodecs' HEVC encoder when available, else a structure-only file. */
async function makeDemo(): Promise<{ bytes: Uint8Array; real: boolean }> {
  const tw = 512, th = 384, cols = 2, rows = 2
  const exif = writeTiff([{ id: 0x0112, type: 3, value: [1] }, { id: 0x0132, type: 2, value: '2026:10:18 18:42:07' }], [{ id: 0x9003, type: 2, value: '2026:10:18 18:42:07' }])
  const cfg: VideoEncoderConfig = { codec: 'hvc1.1.6.L93.B0', width: tw, height: th, hevc: { format: 'hevc' } } as VideoEncoderConfig
  try {
    if (typeof VideoEncoder === 'undefined' || !(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error('no encoder')
    const scene = demoScene(tw * cols, th * rows)
    const tiles: Uint8Array[] = []
    let desc: Uint8Array | null = null
    for (let i = 0; i < cols * rows; i++) {
      const c = document.createElement('canvas')
      c.width = tw
      c.height = th
      c.getContext('2d')!.drawImage(scene, -(i % cols) * tw, -Math.floor(i / cols) * th)
      const chunks: Uint8Array[] = []
      const enc = new VideoEncoder({
        output: (ch, meta) => {
          const d = new Uint8Array(ch.byteLength)
          ch.copyTo(d)
          chunks.push(d)
          if (meta?.decoderConfig?.description && !desc) desc = new Uint8Array(meta.decoderConfig.description as ArrayBuffer)
        },
        error: () => undefined,
      })
      enc.configure(cfg)
      const f = new VideoFrame(c, { timestamp: 0 })
      enc.encode(f, { keyFrame: true })
      f.close()
      await enc.flush()
      enc.close()
      tiles.push(chunks[0])
    }
    if (!desc || tiles.some((t) => !t)) throw new Error('encoder gave no config')
    return { bytes: buildHeif({ hvcC: desc, tiles, tileW: tw, tileH: th, cols, rows, width: 1000, height: 740, exif }), real: true }
  } catch {
    const hvcC = new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93, 0xf0, 0, 0xfc, 0xfd, 0xf8, 0xf8, 0, 0, 0x0f, 0])
    const fake = (n: number) => new Uint8Array([0, 0, 0, 4, 0x26, 0x01, 0xaf, n])
    return { bytes: buildHeif({ hvcC, tiles: [fake(1), fake(2), fake(3), fake(4)], tileW: tw, tileH: th, cols, rows, width: 1000, height: 740, irot: 0, exif }), real: false }
  }
}

function BoxTree({ boxes, depth = 0 }: { boxes: Box[]; depth?: number }) {
  return (
    <>
      {boxes.map((b, i) => (
        <div key={`${b.start}-${i}`}>
          <div style={{ paddingLeft: depth * 16, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            <b>{b.type}</b> <span className="muted">@{b.start} · {fmtBytes(b.size)}</span>
          </div>
          {b.children && <BoxTree boxes={b.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  )
}

export default function HeicConverter() {
  const [s, set, reset] = useToolState('heic-converter', DEF)
  const [entries, setEntries] = useState<Entry[]>([])
  const [sel, setSel] = useState<string>('')
  const [support, setSupport] = useState<{ webcodecs: boolean | null }>({ webcodecs: null })
  const [demoNote, setDemoNote] = useState('')
  const urls = useRef<string[]>([])

  const patch = (id: string, p: Partial<Entry>) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)))

  const convert = async (e: Entry, o = s) => {
    patch(e.id, { status: 'working', msg: '' })
    try {
      if (!e.heif || !e.plan) throw new HeifError(e.parseErr ?? 'Not a HEIF file')
      if (e.placeholder) throw new HeifError('Structure-only demo: the tiles hold placeholder bytes, so there is no picture to decode. See the container breakdown below.')
      let cv: HTMLCanvasElement
      let via = 'WebCodecs HEVC'
      try {
        cv = transform(await decodeWebCodecs(e.bytes, e.heif, e.plan), e.plan, e.heif.props.get(e.plan.id)?.transforms ?? [])
      } catch (err) {
        try {
          cv = await decodeNative(e.bytes)
          via = 'native browser decoder'
        } catch {
          throw err instanceof NoHevc ? new NoHevc(`${err.message}, and it has no built-in HEIC support. Try Safari, or Chrome/Edge on a device with HEVC hardware decoding.`) : err
        }
      }
      cv = scaleDown(cv, o.maxEdge)
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, `image/${o.fmt}`, o.quality))
      if (!blob) throw new Error('Encoding failed')
      let out = blob
      if (o.keepMeta && o.fmt !== 'webp') {
        const tiff = slimExif(e.heif, e.bytes, e.plan)
        if (tiff) {
          const raw = new Uint8Array(await blob.arrayBuffer())
          out = new Blob([(o.fmt === 'jpeg' ? jpegWithExif(raw, tiff) : pngWithExif(raw, tiff, crc32)) as Uint8Array<ArrayBuffer>], { type: blob.type })
        }
      }
      const url = URL.createObjectURL(out)
      urls.current.push(url)
      patch(e.id, { status: 'done', via, out: { blob: out, url, w: cv.width, h: cv.height } })
    } catch (err) {
      patch(e.id, { status: 'error', msg: (err as Error).message })
    }
  }

  const add = async (files: { name: string; bytes: Uint8Array; placeholder?: boolean }[]) => {
    const fresh: Entry[] = files.map(({ name, bytes, placeholder }) => {
      const e: Entry = { id: uid(), name, bytes, placeholder, status: 'queued' }
      try {
        e.heif = parseHeif(bytes)
        e.plan = plan(e.heif, bytes)
      } catch (err) {
        e.parseErr = (err as Error).message
      }
      return e
    })
    setEntries((es) => [...es, ...fresh])
    if (fresh[0]) setSel(fresh[0].id)
    for (const e of fresh) await convert(e)
  }

  useEffect(() => {
    void (async () => {
      const wc = typeof VideoDecoder !== 'undefined' && (await VideoDecoder.isConfigSupported({ codec: 'hvc1.1.6.L93.B0', codedWidth: 512, codedHeight: 512 }).then((r) => !!r.supported).catch(() => false))
      setSupport({ webcodecs: wc })
      const d = await makeDemo()
      setDemoNote(d.real ? 'Demo file encoded with your browser’s HEVC encoder.' : 'Your browser has no HEVC encoder, so the demo is a structure-only HEIC (valid container, placeholder tile data). Use it to explore the inspector; drop real iPhone photos to convert.')
      await add([{ name: d.real ? 'demo-sunset.heic' : 'demo-structure-only.heic', bytes: d.bytes, placeholder: !d.real }])
    })()
    const list = urls.current
    return () => list.forEach((u) => URL.revokeObjectURL(u))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = entries.filter((e) => e.out)
  const outName = (e: Entry) => e.name.replace(/\.(heic|heif|hif)$/i, '') + '.' + EXT[s.fmt]
  const zip = () => {
    const names = uniqueNames(done.map(outName))
    void Promise.all(done.map(async (e, i) => ({ name: names[i], data: new Uint8Array(await e.out!.blob.arrayBuffer()) }))).then((files) =>
      download('converted-photos.zip', new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })),
    )
  }
  const cur = entries.find((e) => e.id === sel) ?? entries[0]
  const inBytes = entries.reduce((a, e) => a + e.bytes.length, 0)
  const outBytes = done.reduce((a, e) => a + e.out!.blob.size, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="HEIC photos">
          <FileDrop accept=".heic,.heif,.hif,image/heic,image/heif" multiple label="Drop iPhone HEIC photos or click to choose" onFiles={async (fs) => add(await Promise.all(fs.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))} />
          <Row>
            <span style={{ fontSize: 14, fontWeight: 600, color: support.webcodecs ? 'var(--ok)' : support.webcodecs === false ? 'var(--warn)' : 'var(--muted)' }}>
              {support.webcodecs === null ? '… checking HEVC decoder' : support.webcodecs ? '✓ WebCodecs HEVC decoder available' : '✕ No WebCodecs HEVC decoder (will try native decoding)'}
            </span>
          </Row>
          {demoNote && <p className="muted" style={{ fontSize: 13 }}>{demoNote}</p>}
          <p className="muted" style={{ fontSize: 13 }}>Photos are parsed and decoded in this tab — nothing is uploaded.</p>
        </Panel>
        <Panel title="Output" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']]} />
          {s.fmt !== 'png' && <Slider label="Quality" value={s.quality} min={0.4} max={1} step={0.01} onChange={(quality) => set({ quality })} show={(v) => `${Math.round(v * 100)}`} unit="%" />}
          <Select label="Resize" value={s.maxEdge} onChange={(maxEdge) => set({ maxEdge })} options={[[0, 'Original size'], [4096, 'Long edge ≤ 4096 px'], [2048, 'Long edge ≤ 2048 px'], [1600, 'Long edge ≤ 1600 px'], [1080, 'Long edge ≤ 1080 px']]} />
          <Check label="Keep capture date & time (EXIF)" value={s.keepMeta} onChange={(keepMeta) => set({ keepMeta })} />
          <p className="muted" style={{ fontSize: 13 }}>
            By default all EXIF (GPS location, camera serials…) is dropped. With the option on, only the date/time tags are kept and Orientation is set to 1 — rotation and mirroring from the HEIC are always baked into the pixels.{s.fmt === 'webp' && ' WebP output never carries EXIF here.'}
          </p>
          <Btn kind="primary" disabled={!entries.length} onClick={() => entries.forEach((e) => void convert(e))}>↻ Re-convert all with these settings</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Photos" value={entries.length} />
          <Stat label="Converted" value={`${done.length} / ${entries.length}`} tone={done.length === entries.length && entries.length ? 'good' : 'accent'} />
          <Stat label="HEIC size" value={fmtBytes(inBytes)} />
          <Stat label={`${EXT[s.fmt].toUpperCase()} size`} value={fmtBytes(outBytes)} />
        </Stats>
        <Panel
          title="Results"
          actions={
            <>
              <Btn kind="primary" disabled={!done.length} onClick={zip}>⬇ ZIP ({done.length})</Btn>
              <Btn kind="ghost" disabled={!entries.length} onClick={() => setEntries([])}>Clear</Btn>
            </>
          }
        >
          {!entries.length && <p className="muted">Drop HEIC photos to start.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {entries.map((e) => (
              <div key={e.id} onClick={() => setSel(e.id)} style={{ border: `2px solid ${cur?.id === e.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 8, cursor: 'pointer', background: 'var(--panel)' }}>
                <div style={{ aspectRatio: '4 / 3', borderRadius: 6, background: 'repeating-conic-gradient(#8881 0 25%, transparent 0 50%) 0 0 / 16px 16px', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {e.out ? <img src={e.out.url} alt={e.name} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ fontSize: 32 }}>{e.status === 'error' ? '⚠️' : '⏳'}</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 6, wordBreak: 'break-all' }}>{e.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {fmtBytes(e.bytes.length)}
                  {e.out && ` → ${fmtBytes(e.out.blob.size)} · ${e.out.w}×${e.out.h}`}
                </div>
                {e.via && <div className="muted" style={{ fontSize: 12 }}>via {e.via}</div>}
                {e.status === 'error' && <div style={{ color: 'var(--err)', fontSize: 12 }}>{e.msg}</div>}
                {e.out && (
                  <Btn onClick={() => download(outName(e), e.out!.blob)}>⬇ {EXT[s.fmt].toUpperCase()}</Btn>
                )}
              </div>
            ))}
          </div>
        </Panel>
        {cur && (
          <Panel title={`Inside ${cur.name}`}>
            {cur.parseErr ? (
              <Note tone="err">{cur.parseErr}</Note>
            ) : cur.heif && cur.plan ? (
              <>
                <Table
                  head={['Property', 'Value']}
                  rows={[
                    ['Brands', `${cur.heif.majorBrand} (${cur.heif.brands.join(', ')})`],
                    ['Primary item', `#${cur.plan.id} · ${cur.plan.type}`],
                    ['Size', `${cur.plan.width} × ${cur.plan.height}`],
                    ['Layout', cur.plan.grid ? `grid ${cur.plan.grid.cols} × ${cur.plan.grid.rows} tiles` : 'single image'],
                    ['Codec', cur.plan.hvcC ? `${cur.plan.hvcC.codec} · ${cur.plan.hvcC.bitDepth}-bit · ${['mono', '4:2:0', '4:2:2', '4:4:4'][cur.plan.hvcC.chroma]}` : '—'],
                    ['Rotation', cur.plan.rotation ? `${cur.plan.rotation * 90}° anticlockwise` : 'none'],
                    ['Mirror', cur.plan.mirror === null ? 'none' : cur.plan.mirror === 0 ? 'left ↔ right' : 'top ↕ bottom'],
                    ['Colour', cur.plan.colr ?? '—'],
                    ['Exif', cur.plan.exifId !== null ? `item #${cur.plan.exifId}` : 'none'],
                    ['Thumbnail', cur.plan.thumbId !== null ? `item #${cur.plan.thumbId}` : 'none'],
                    ['Alpha', cur.plan.hasAlpha ? 'yes (not converted: output is opaque)' : 'no'],
                  ]}
                />
                <details style={{ marginTop: 8 }}>
                  <summary>Items ({cur.heif.items.length}) and box tree</summary>
                  <Table head={['Item', 'Type', 'Bytes', '']} rows={cur.heif.items.map((it) => [`#${it.id}`, it.type, fmtBytes(cur.heif!.locs.get(it.id)?.extents.reduce((a, x) => a + x.length, 0) ?? 0), it.hidden ? 'hidden' : it.id === cur.heif!.primary ? 'primary' : ''])} max={40} />
                  <BoxTree boxes={readBoxes(cur.bytes)} />
                </details>
              </>
            ) : null}
          </Panel>
        )}
        <Note>
          How it works: the HEIC container (ISO-BMFF boxes: ftyp, meta, iinf, iloc, iref, iprp…) is parsed in JavaScript; the HEVC-compressed tiles of the primary image are decoded with the WebCodecs <code>VideoDecoder</code>, stitched into the full grid, rotated/mirrored as the file says, then re-encoded with canvas. Browsers without an HEVC decoder (e.g. Firefox, many Linux builds) fall back to native decoding, which works in Safari.
        </Note>
      </div>
    </Split>
  )
}
