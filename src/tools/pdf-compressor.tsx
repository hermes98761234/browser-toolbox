import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import type { PDFDict as Dict } from 'pdf-lib'
import { fmtBytes, PRESETS, saving, targetSize, toRgba, unpredictPng } from './lib/pdf-compressor'

interface Opts {
  preset: string
  maxPx: number
  dpi: number
  quality: number
  jpeg: boolean
  lossless: boolean
  meta: boolean
  unused: boolean
  objStreams: boolean
  flate: boolean
}

interface Img {
  id: string
  kind: string
  from: string
  to: string
  before: number
  after: number
  status: string
}

interface Result {
  bytes: Uint8Array
  before: number
  after: number
  pages: number
  imgs: Img[]
  dropped: number
  deflated: number
  ms: number
}

const DEF: Opts = { preset: 'ebook', maxPx: 1600, dpi: 150, quality: 0.65, jpeg: true, lossless: true, meta: true, unused: true, objStreams: true, flate: true }

type Lib = typeof import('pdf-lib')

function filters(lib: Lib, d: Dict): string[] {
  const f = d.lookup(lib.PDFName.of('Filter'))
  if (f instanceof lib.PDFName) return [f.toString()]
  if (f instanceof lib.PDFArray) return f.asArray().map((x) => String(x))
  return []
}

/** Number of colour components of an image colour space we can handle (1 or 3), or 0. */
function comps(lib: Lib, d: Dict): { n: 0 | 1 | 3; keep: boolean } {
  const cs = d.lookup(lib.PDFName.of('ColorSpace'))
  if (cs instanceof lib.PDFName) {
    const s = cs.toString()
    return s === '/DeviceRGB' ? { n: 3, keep: true } : s === '/DeviceGray' ? { n: 1, keep: false } : { n: 0, keep: false }
  }
  if (cs instanceof lib.PDFArray && String(cs.get(0)) === '/ICCBased') {
    const icc = d.context.lookup(cs.get(1))
    const n = icc instanceof lib.PDFRawStream ? icc.dict.lookupMaybe(lib.PDFName.of('N'), lib.PDFNumber)?.asNumber() : undefined
    return n === 3 ? { n: 3, keep: true } : n === 1 ? { n: 1, keep: false } : { n: 0, keep: false }
  }
  return { n: 0, keep: false }
}

function fewColours(px: Uint8ClampedArray): boolean {
  const seen = new Set<number>()
  const step = Math.max(1, Math.floor(px.length / 4 / 20000))
  for (let i = 0; i < px.length; i += 4 * step) {
    seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
    if (seen.size > 256) return false
  }
  return true
}

async function toJpeg(src: CanvasImageSource, w: number, h: number, q: number): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q))
  if (!blob) throw new Error('JPEG encoding failed')
  return new Uint8Array(await blob.arrayBuffer())
}

async function compress(input: Uint8Array, o: Opts): Promise<Result> {
  const t0 = performance.now()
  const lib = await import('pdf-lib')
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, PDFNumber, decodePDFRawStream } = lib
  const nm = (s: string) => PDFName.of(s)
  const pdf = await PDFDocument.load(input, { updateMetadata: false, ignoreEncryption: true })
  if (pdf.isEncrypted) throw new Error('This PDF is encrypted. Remove the password first, then compress it.')
  const ctx = pdf.context
  // Largest page side each image appears on (upper bound for its drawn size).
  const drawn = new Map<string, number>()
  for (const p of pdf.getPages()) {
    const { width, height } = p.getSize()
    const xo = p.node.Resources()?.lookupMaybe(nm('XObject'), PDFDict)
    for (const [, v] of xo?.entries() ?? []) if (v instanceof PDFRef) drawn.set(v.toString(), Math.max(drawn.get(v.toString()) ?? 0, width, height))
  }
  if (o.meta) {
    pdf.catalog.delete(nm('Metadata'))
    pdf.catalog.delete(nm('PieceInfo'))
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      const d = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null
      if (d && d !== pdf.catalog) {
        d.delete(nm('Metadata'))
        d.delete(nm('PieceInfo'))
        if (d.lookup(nm('Type')) === nm('Page')) d.delete(nm('Thumb'))
      }
    }
    if (ctx.trailerInfo.Info instanceof PDFRef) ctx.delete(ctx.trailerInfo.Info)
    ctx.trailerInfo.Info = undefined
  }
  let dropped = 0
  if (o.unused) {
    const seen = new Set<string>()
    const walk = (x: unknown): void => {
      if (x instanceof PDFRef) {
        if (seen.has(x.toString())) return
        seen.add(x.toString())
        walk(ctx.lookup(x))
      } else if (x instanceof PDFRawStream) walk(x.dict)
      else if (x instanceof PDFDict) for (const v of x.values()) walk(v)
      else if (x instanceof PDFArray) for (const v of x.asArray()) walk(v)
    }
    walk(ctx.trailerInfo.Root)
    walk(ctx.trailerInfo.Info)
    for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.toString())) dropped += Number(ctx.delete(ref))
  }
  const imgs: Img[] = []
  let deflated = 0
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const d = obj.dict
    const fs = filters(lib, d)
    if (d.lookup(nm('Subtype')) !== nm('Image')) {
      if (o.flate && !fs.length && obj.contents.length > 64 && d.lookup(nm('Type')) !== nm('XRef') && d.lookup(nm('Type')) !== nm('ObjStm')) {
        const s = ctx.flateStream(obj.contents)
        for (const [k, v] of d.entries()) if (k !== nm('Length') && k !== nm('Filter')) s.dict.set(k, v)
        if (s.contents.length < obj.contents.length) {
          ctx.assign(ref, s)
          deflated += obj.contents.length - s.contents.length
        }
      }
      continue
    }
    const w = d.lookupMaybe(nm('Width'), PDFNumber)?.asNumber() ?? 0
    const h = d.lookupMaybe(nm('Height'), PDFNumber)?.asNumber() ?? 0
    const bpc = d.lookupMaybe(nm('BitsPerComponent'), PDFNumber)?.asNumber() ?? 0
    const isJpeg = fs.length === 1 && fs[0] === '/DCTDecode'
    const isFlate = fs.length === 0 || (fs.length === 1 && fs[0] === '/FlateDecode')
    const img: Img = { id: String(ref.objectNumber), kind: isJpeg ? 'JPEG' : fs.length ? fs.map((f) => f.slice(1).replace('Decode', '')).join('+') : 'Raw', from: `${w}×${h}`, to: '—', before: obj.contents.length, after: obj.contents.length, status: '' }
    imgs.push(img)
    const cs = comps(lib, d)
    const skip = (why: string) => void (img.status = why)
    if (d.lookup(nm('ImageMask'))?.toString() === 'true') { skip('Stencil mask'); continue }
    if (d.lookup(nm('Mask')) instanceof PDFArray || d.has(nm('Decode'))) { skip('Colour-key mask / decode array'); continue }
    if (bpc !== 8 || !cs.n) { skip(cs.n ? `${bpc}-bit samples` : 'CMYK / indexed / special colour space'); continue }
    if (Math.max(w, h) < 64 || obj.contents.length < 8192) { skip('Too small to matter'); continue }
    if (isJpeg && !o.jpeg) { skip('JPEG recompression off'); continue }
    if (!isJpeg && !(isFlate && o.lossless)) { skip(isFlate ? 'Lossless conversion off' : 'Unsupported filter'); continue }
    try {
      let src: CanvasImageSource
      if (isJpeg) {
        src = await createImageBitmap(new Blob([obj.contents.slice()], { type: 'image/jpeg' }))
      } else {
        let raw = fs.length ? decodePDFRawStream(obj).decode() : obj.contents
        const pred = d.lookupMaybe(nm('DecodeParms'), PDFDict)?.lookupMaybe(nm('Predictor'), PDFNumber)?.asNumber() ?? 1
        if (pred >= 10) raw = unpredictPng(raw, w * cs.n, cs.n)
        else if (pred !== 1) { skip('TIFF predictor'); continue }
        if (raw.length < w * h * cs.n) { skip('Truncated data'); continue }
        const px = toRgba(raw, w, h, cs.n)
        if (fewColours(px)) { skip('Few colours (line art) — kept lossless'); continue }
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d')!.putImageData(new ImageData(px, w, h), 0, 0)
        src = c
      }
      const [nw, nh] = targetSize(w, h, o.maxPx, o.dpi, drawn.get(ref.toString()))
      const jpg = await toJpeg(src, nw, nh, o.quality)
      if (jpg.length >= obj.contents.length * 0.95) { skip('Already optimal — kept'); continue }
      const nd = d.clone(ctx)
      nd.set(nm('Filter'), nm('DCTDecode'))
      nd.set(nm('Width'), PDFNumber.of(nw))
      nd.set(nm('Height'), PDFNumber.of(nh))
      nd.set(nm('BitsPerComponent'), PDFNumber.of(8))
      if (!cs.keep) nd.set(nm('ColorSpace'), nm('DeviceRGB'))
      nd.delete(nm('DecodeParms'))
      nd.delete(nm('Length'))
      ctx.assign(ref, PDFRawStream.of(nd, jpg))
      Object.assign(img, { to: `${nw}×${nh}`, after: jpg.length, status: nw < w ? 'Downsampled + recompressed' : 'Recompressed' })
    } catch {
      skip('Could not decode')
    }
  }
  const bytes = await pdf.save({ useObjectStreams: o.objStreams, updateFieldAppearances: false })
  return { bytes, before: input.length, after: bytes.length, pages: pdf.getPageCount(), imgs, dropped, deflated, ms: performance.now() - t0 }
}

// ---------- demo document ----------

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function photo(seed: number, w: number, h: number, hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const r = rng(seed)
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, `hsl(${hue},70%,45%)`)
  sky.addColorStop(0.6, `hsl(${hue + 30},80%,75%)`)
  sky.addColorStop(1, `hsl(${hue + 50},70%,85%)`)
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  const sun = g.createRadialGradient(w * 0.7, h * 0.35, 10, w * 0.7, h * 0.35, h * 0.3)
  sun.addColorStop(0, 'rgba(255,250,220,1)')
  sun.addColorStop(1, 'rgba(255,250,220,0)')
  g.fillStyle = sun
  g.fillRect(0, 0, w, h)
  for (let l = 0; l < 5; l++) {
    const base = h * (0.45 + l * 0.12)
    const a = [r() * 6, r() * 6, r() * 6]
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base - Math.sin(x / (w / 3) + a[0]) * h * 0.06 - Math.sin(x / (w / 11) + a[1]) * h * 0.025 - Math.sin(x / 37 + a[2]) * 6)
    g.lineTo(w, h)
    g.fillStyle = `hsl(${hue + 120 + l * 8},${35 + l * 6}%,${42 - l * 7}%)`
    g.fill()
  }
  const im = g.getImageData(0, 0, w, h)
  for (let i = 0; i < im.data.length; i += 4) {
    const n = (r() - 0.5) * 34
    im.data[i] += n
    im.data[i + 1] += n
    im.data[i + 2] += n
  }
  g.putImageData(im, 0, 0)
  return c
}

async function demoPdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle('Field trip report (demo)')
  pdf.setAuthor('Browser Toolbox')
  pdf.setKeywords(['demo', 'photos', 'compression'])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const blob = async (c: HTMLCanvasElement, type: string, q?: number) => new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q))).arrayBuffer())
  const pics = [
    await pdf.embedJpg(await blob(photo(1, 2600, 1700, 200), 'image/jpeg', 0.95)),
    await pdf.embedJpg(await blob(photo(7, 2400, 1600, 20), 'image/jpeg', 0.95)),
  ]
  const png = await pdf.embedPng(await blob(photo(3, 900, 600, 260), 'image/png'))
  const chart = document.createElement('canvas')
  chart.width = 1200
  chart.height = 700
  const cg = chart.getContext('2d')!
  cg.fillStyle = '#fff'
  cg.fillRect(0, 0, 1200, 700)
  ;[340, 520, 410, 610, 560, 480].forEach((v, i) => {
    cg.fillStyle = ['#6366f1', '#0ea5e9', '#10b981'][i % 3]
    cg.fillRect(80 + i * 180, 650 - v, 120, v)
  })
  const chartImg = await pdf.embedPng(await blob(chart, 'image/png'))
  await pdf.embedJpg(await blob(photo(9, 1600, 1000, 120), 'image/jpeg', 0.9)) // embedded but never drawn → unused object
  const [W, H] = [595.28, 841.89]
  for (let i = 0; i < 3; i++) {
    const p = pdf.addPage([W, H])
    p.drawText(['Day 1 — Coastal ridge', 'Day 2 — Desert canyon', 'Results & notes'][i], { x: 48, y: H - 70, size: 24, font: bold, color: rgb(0.1, 0.12, 0.2) })
    if (i < 2) p.drawImage(pics[i], { x: 48, y: H - 470, width: W - 96, height: (W - 96) / 1.53 })
    else {
      p.drawImage(png, { x: 48, y: H - 400, width: 300, height: 200 })
      p.drawImage(chartImg, { x: 48, y: H - 700, width: 360, height: 210 })
    }
    for (let l = 0; l < 6; l++) p.drawText('Sample paragraph text that stays sharp — only images are recompressed.', { x: 48, y: (i < 2 ? 280 : 110) - l * 16, size: 11, font, color: rgb(0.3, 0.32, 0.4) })
    p.drawText(`Page ${i + 1} of 3`, { x: W - 110, y: 30, size: 10, font })
  }
  return pdf.save({ useObjectStreams: false })
}

// ---------- UI ----------

export default function PdfCompressor() {
  const [o, set, reset] = useToolState('pdf-compressor', DEF)
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cmp, setCmp] = useState<{ name: string; size: number }[] | null>(null)
  const run = useRef(0)

  useEffect(() => {
    void demoPdf().then((bytes) => setFile((f) => f ?? { name: 'field-trip-report-demo.pdf', bytes }))
  }, [])

  useEffect(() => {
    if (!file) return
    const id = ++run.current
    const t = setTimeout(() => {
      setBusy(true)
      setErr('')
      compress(file.bytes, o)
        .then((r) => id === run.current && setRes(r))
        .catch((e: Error) => id === run.current && (setErr(e.message || 'Could not read this PDF'), setRes(null)))
        .finally(() => id === run.current && setBusy(false))
    }, 350)
    return () => clearTimeout(t)
  }, [file, o])

  const pick = (p: string) => {
    const pr = PRESETS.find((x) => x.id === p)
    set(pr ? { preset: p, maxPx: pr.maxPx, dpi: pr.dpi, quality: pr.quality } : { preset: 'custom' })
  }
  const custom = (patch: Partial<Opts>) => set({ ...patch, preset: 'custom' })
  const compare = async () => {
    if (!file) return
    setCmp([])
    const out: { name: string; size: number }[] = []
    for (const p of PRESETS) {
      const r = await compress(file.bytes, { ...o, maxPx: p.maxPx, dpi: p.dpi, quality: p.quality })
      out.push({ name: `${p.name} (${p.maxPx}px, ${p.dpi} dpi, q${Math.round(p.quality * 100)})`, size: r.after })
      setCmp([...out])
    }
  }
  const outName = (file?.name ?? 'document.pdf').replace(/\.pdf$/i, '') + '-compressed.pdf'
  const sv = res ? saving(res.before, res.after) : 0
  const done = res?.imgs.filter((i) => i.after < i.before) ?? []
  const imgBefore = res?.imgs.reduce((a, i) => a + i.before, 0) ?? 0
  const imgAfter = res?.imgs.reduce((a, i) => a + i.after, 0) ?? 0

  return (
    <Split>
      <div>
        <Panel title="PDF file">
          <FileDrop
            accept="application/pdf,.pdf"
            label="Drop a PDF here or click to choose"
            onFiles={async ([f]) => {
              setCmp(null)
              setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
            }}
          />
          {file && (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              <b>{file.name}</b> · {fmtBytes(file.bytes.length)}
              {res && ` · ${res.pages} page${res.pages === 1 ? '' : 's'} · ${res.imgs.length} image${res.imgs.length === 1 ? '' : 's'}`}
            </p>
          )}
          <Row>
            <Btn kind="ghost" onClick={() => void demoPdf().then((bytes) => (setCmp(null), setFile({ name: 'field-trip-report-demo.pdf', bytes })))}>Load demo PDF</Btn>
          </Row>
        </Panel>
        <Panel title="Quality" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={o.preset} onChange={pick} options={[...PRESETS.map((p) => [p.id, p.name] as const), ['custom', 'Custom'] as const]} label="Preset" />
          <p className="muted" style={{ fontSize: 13 }}>{PRESETS.find((p) => p.id === o.preset)?.note ?? 'Your own settings.'}</p>
          <Slider label="Max image size" value={o.maxPx} min={400} max={4000} step={100} unit=" px" onChange={(maxPx) => custom({ maxPx })} />
          <Slider label="Target resolution" value={o.dpi} min={72} max={300} step={6} unit=" dpi" onChange={(dpi) => custom({ dpi })} />
          <Slider label="JPEG quality" value={o.quality} min={0.2} max={0.95} step={0.05} show={(v) => String(Math.round(v * 100))} onChange={(quality) => custom({ quality })} />
        </Panel>
        <Panel title="What to optimise">
          <Check label="Recompress / downsample JPEG images" value={o.jpeg} onChange={(jpeg) => set({ jpeg })} />
          <Check label="Convert lossless photos to JPEG (line art is kept)" value={o.lossless} onChange={(lossless) => set({ lossless })} />
          <Check label="Strip metadata (XMP, document info, thumbnails)" value={o.meta} onChange={(meta) => set({ meta })} />
          <Check label="Remove unused objects" value={o.unused} onChange={(unused) => set({ unused })} />
          <Check label="Deflate uncompressed streams" value={o.flate} onChange={(flate) => set({ flate })} />
          <Check label="Pack objects into object streams (PDF 1.5+)" value={o.objStreams} onChange={(objStreams) => set({ objStreams })} />
          <Note>Everything runs locally — the file never leaves your browser. Text and vector graphics are untouched; savings come from images and structure.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Original" value={res ? fmtBytes(res.before) : '—'} />
          <Stat label="Compressed" value={res ? fmtBytes(res.after) : busy ? 'Working…' : '—'} tone="accent" />
          <Stat label="Saved" value={res ? pct(sv, 1) : '—'} sub={res ? `${fmtBytes(Math.max(0, res.before - res.after))} smaller` : undefined} tone={sv > 0.05 ? 'good' : sv < 0 ? 'bad' : undefined} />
          <Stat label="Images optimised" value={res ? `${done.length} / ${res.imgs.length}` : '—'} sub={res ? `${res.ms.toFixed(0)} ms` : undefined} />
        </Stats>
        {err && <Note tone="err">{err}</Note>}
        {res && (
          <Panel
            title="Result"
            actions={
              <>
                <Btn kind="primary" disabled={busy} onClick={() => download(outName, new Blob([(sv > 0 ? res.bytes : file!.bytes).slice().buffer], { type: 'application/pdf' }))}>
                  ⬇ Download {sv > 0 ? 'compressed' : 'original'}
                </Btn>
                <Btn onClick={() => void compare()}>Compare presets</Btn>
              </>
            }
          >
            {sv <= 0 && <Note tone="warn">This PDF is already well optimised — the rewritten file is not smaller, so the download gives you the original.</Note>}
            {[['Original', res.before], ['Compressed', res.after]].map(([l, v]) => (
              <div key={l as string} style={{ marginBottom: 8 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{l}</b>
                  <span>{fmtBytes(v as number)}</span>
                </Row>
                <Bar value={v as number} max={Math.max(res.before, res.after)} color={l === 'Original' ? 'var(--muted)' : 'var(--accent)'} />
              </div>
            ))}
            <p className="muted" style={{ fontSize: 13 }}>
              Images {fmtBytes(imgBefore)} → {fmtBytes(imgAfter)} · {res.dropped} unused object{res.dropped === 1 ? '' : 's'} removed · {fmtBytes(res.deflated)} saved by deflating streams
            </p>
            {cmp && (
              <Table
                head={['Preset', 'Size', 'Saved']}
                rows={cmp.map((c) => [c.name, fmtBytes(c.size), pct(saving(res.before, c.size), 1)])}
              />
            )}
          </Panel>
        )}
        {res && (
          <Panel title="Images">
            {res.imgs.length ? (
              <Table
                head={['Obj', 'Type', 'Pixels', 'Size', 'Saved', 'Action']}
                rows={res.imgs.map((i) => [
                  i.id,
                  i.kind,
                  i.to === '—' ? i.from : `${i.from} → ${i.to}`,
                  i.after < i.before ? `${fmtBytes(i.before)} → ${fmtBytes(i.after)}` : fmtBytes(i.before),
                  i.after < i.before ? <b key="s" style={{ color: 'var(--ok)' }}>{pct(saving(i.before, i.after), 0)}</b> : '—',
                  <span key="a" className="muted">{i.status}</span>,
                ])}
              />
            ) : (
              <Note>No images found — this PDF is text/vector only, so only structural savings apply.</Note>
            )}
          </Panel>
        )}
        <Panel title="Tips">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>Screen</b> (96 dpi) suits email attachments; <b>Print</b> keeps photos crisp on paper.</li>
            <li>Scanned documents shrink the most. Text-only PDFs are already compact.</li>
            <li>Images used on several pages are stored once and recompressed once.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
