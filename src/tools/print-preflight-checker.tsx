import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, CopyButton, download, FileDrop, fmt, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { display, findTiff, jpegWithExif, parseTiff, writeTiff, type Tag } from './lib/exif-viewer'
import { effectivePpi, gamutExcess, inspect, MM_PER_IN, ppiForDistance, ppiRating, SIZES, tac, type Meta } from './lib/print-preflight-checker'

interface S { size: number; w: number; h: number; unit: 'mm' | 'in'; bleed: number; safe: number; mode: 'cover' | 'fit'; gcr: number; tacLimit: number; distance: number; overlay: 'none' | 'gamut' | 'tac' }
const DEF: S = { size: 0, w: 210, h: 297, unit: 'mm', bleed: 3, safe: 5, mode: 'cover', gcr: 0.5, tacLimit: 300, distance: 30, overlay: 'gamut' }

interface Img { name: string; bytes: number; el: HTMLImageElement; meta: Meta; tags: Tag[] }
interface Analysis { gamutPct: number; worst: [number, number, number, number][]; tacMax: number; tacOver: number; gamutMask: ImageData; tacMask: ImageData }

/** Builds a demo poster: bright RGB shapes (some outside CMYK), rich black and text near the edge. JPEG + EXIF 72 dpi. */
async function demoFile(): Promise<File> {
  const c = document.createElement('canvas')
  c.width = 1800
  c.height = 1200
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 1200)
  sky.addColorStop(0, '#0b3d91')
  sky.addColorStop(1, '#f6c26b')
  g.fillStyle = sky
  g.fillRect(0, 0, 1800, 1200)
  const shapes: [string, number, number, number][] = [['#0000ff', 300, 380, 190], ['#00ff00', 760, 420, 170], ['#ff6a00', 1200, 360, 200], ['#ff00ff', 1560, 640, 150], ['#c8a07a', 520, 820, 160], ['#3a6ea5', 1050, 860, 180]]
  for (const [col, x, y, r] of shapes) {
    g.fillStyle = col
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#000'
  g.fillRect(0, 1040, 1800, 160)
  g.fillStyle = '#fff'
  g.font = 'bold 84px sans-serif'
  g.fillText('SUMMER FAIR 2026', 40, 1140)
  g.font = 'bold 54px sans-serif'
  g.fillStyle = '#ffeb3b'
  g.fillText('Edge text →', 1500, 60)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
  const jpg = new Uint8Array(await blob.arrayBuffer())
  const tiff = writeTiff([{ id: 0x010f, type: 2, value: 'Browser Toolbox' }, { id: 0x0110, type: 2, value: 'Demo generator' }, { id: 0x011a, type: 5, value: [[72, 1]] }, { id: 0x011b, type: 5, value: [[72, 1]] }, { id: 0x0128, type: 3, value: [2] }, { id: 0x0131, type: 2, value: 'Canvas' }], [{ id: 0xa001, type: 3, value: [1] }])
  return new File([jpegWithExif(jpg, tiff) as BlobPart], 'demo-poster.jpg', { type: 'image/jpeg' })
}

function analyse(el: HTMLImageElement, gcr: number, limit: number): Analysis {
  const scale = Math.min(1, 700 / Math.max(el.naturalWidth, el.naturalHeight))
  const w = Math.max(1, Math.round(el.naturalWidth * scale)), h = Math.max(1, Math.round(el.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(el, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data
  const gm = new ImageData(w, h), tm = new ImageData(w, h)
  const cache = new Map<number, number>()
  const counts = new Map<number, number>()
  let out = 0, opaque = 0, tacMax = 0, over = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    opaque++
    const r = px[i], gg = px[i + 1], b = px[i + 2]
    const key = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)
    let ex = cache.get(key)
    if (ex === undefined) {
      ex = gamutExcess((r & 0xf8) + 4, (gg & 0xf8) + 4, (b & 0xf8) + 4)
      cache.set(key, ex)
    }
    const grey = (r * 0.3 + gg * 0.59 + b * 0.11) * 0.35 + 150
    if (ex > 4) {
      out++
      counts.set(key, (counts.get(key) ?? 0) + 1)
      gm.data.set([255, 0, 200, 255], i)
    } else gm.data.set([grey, grey, grey, 255], i)
    const t = tac(r, gg, b, gcr)
    tacMax = Math.max(tacMax, t)
    if (t > limit) {
      over++
      tm.data.set([0, 200, 255, 255], i)
    } else tm.data.set([grey, grey, grey, 255], i)
  }
  const worst = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4, n / Math.max(1, opaque)] as [number, number, number, number])
  return { gamutPct: out / Math.max(1, opaque), worst, tacMax, tacOver: over / Math.max(1, opaque), gamutMask: gm, tacMask: tm }
}

export default function PrintPreflightChecker() {
  const [s, set, reset] = useToolState('print-preflight-checker', DEF)
  const [img, setImg] = useState<Img | null>(null)
  const [err, setErr] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)

  const load = useCallback(async (f: File) => {
    setErr('')
    const bytes = new Uint8Array(await f.arrayBuffer())
    const url = URL.createObjectURL(f)
    const el = new Image()
    el.onload = () => {
      const tiff = findTiff(bytes)
      let tags: Tag[] = []
      try {
        tags = tiff ? parseTiff(tiff) : []
      } catch {
        tags = []
      }
      setImg((old) => {
        if (old) URL.revokeObjectURL(old.el.src)
        return { name: f.name, bytes: f.size, el, meta: inspect(bytes), tags }
      })
    }
    el.onerror = () => setErr(`${f.name} could not be decoded by this browser (try JPEG, PNG or WebP).`)
    el.src = url
  }, [])
  useEffect(() => {
    void demoFile().then(load)
  }, [load])

  const an = useMemo(() => (img ? analyse(img.el, s.gcr, s.tacLimit) : null), [img, s.gcr, s.tacLimit])

  // target size (auto-orient to the image)
  const k = s.unit === 'in' ? MM_PER_IN : 1
  let tw = s.w * k, th = s.h * k
  const pw = img?.el.naturalWidth ?? 1, ph = img?.el.naturalHeight ?? 1
  if ((pw > ph) !== (tw > th) && tw !== th) [tw, th] = [th, tw]
  const bleed = s.bleed * k, safe = s.safe * k
  const coverW = s.mode === 'cover' ? tw + 2 * bleed : tw, coverH = s.mode === 'cover' ? th + 2 * bleed : th
  const eff = effectivePpi(pw, ph, coverW / MM_PER_IN, coverH / MM_PER_IN, s.mode)
  const rating = ppiRating(eff.ppi)
  const needPpi = Math.min(300, ppiForDistance(s.distance / 2.54))
  const crop = s.mode === 'cover' ? 1 - Math.min(pw / ph / (coverW / coverH), (coverW / coverH) / (pw / ph)) : 0
  const maxSizeIn = [pw / 300, ph / 300]
  const exif = (name: string) => img?.tags.find((t) => t.name === name)

  // draw preview
  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const W = 640, mmToPx = Math.min((W - 40) / (tw + 2 * bleed), 520 / (th + 2 * bleed))
    c.width = Math.round((tw + 2 * bleed) * mmToPx + 40)
    c.height = Math.round((th + 2 * bleed) * mmToPx + 40)
    const g = c.getContext('2d')!
    g.fillStyle = '#e5e7eb'
    g.fillRect(0, 0, c.width, c.height)
    const ox = 20, oy = 20
    const bx = ox, by = oy, bw = (tw + 2 * bleed) * mmToPx, bh = (th + 2 * bleed) * mmToPx
    const tx = ox + bleed * mmToPx, ty = oy + bleed * mmToPx, tW = tw * mmToPx, tH = th * mmToPx
    g.fillStyle = '#fff'
    g.fillRect(bx, by, bw, bh)
    const src = s.overlay === 'none' || !an ? img.el : (() => {
      const m = document.createElement('canvas')
      const d = s.overlay === 'gamut' ? an.gamutMask : an.tacMask
      m.width = d.width
      m.height = d.height
      m.getContext('2d')!.putImageData(d, 0, 0)
      return m
    })()
    const sw = img.el.naturalWidth, sh = img.el.naturalHeight
    const [aw, ah, ax, ay] = s.mode === 'cover' ? [bw, bh, bx, by] : [tW, tH, tx, ty]
    const sc = s.mode === 'cover' ? Math.max(aw / sw, ah / sh) : Math.min(aw / sw, ah / sh)
    const dw = sw * sc, dh = sh * sc
    g.save()
    g.beginPath()
    g.rect(bx, by, bw, bh)
    g.clip()
    g.drawImage(src, ax + (aw - dw) / 2, ay + (ah - dh) / 2, dw, dh)
    g.restore()
    // bleed zone tint
    g.fillStyle = 'rgba(239,68,68,0.28)'
    g.fillRect(bx, by, bw, ty - by)
    g.fillRect(bx, ty + tH, bw, by + bh - ty - tH)
    g.fillRect(bx, ty, tx - bx, tH)
    g.fillRect(tx + tW, ty, bx + bw - tx - tW, tH)
    g.strokeStyle = '#111'
    g.lineWidth = 1.5
    g.strokeRect(tx, ty, tW, tH)
    g.setLineDash([6, 4])
    g.strokeStyle = '#16a34a'
    g.strokeRect(tx + safe * mmToPx, ty + safe * mmToPx, tW - 2 * safe * mmToPx, tH - 2 * safe * mmToPx)
    g.setLineDash([])
    // crop marks
    g.strokeStyle = '#111'
    g.lineWidth = 1
    for (const [x, y] of [[tx, ty], [tx + tW, ty], [tx, ty + tH], [tx + tW, ty + tH]]) {
      g.beginPath()
      g.moveTo(x, y < c.height / 2 ? 2 : c.height - 2)
      g.lineTo(x, y < c.height / 2 ? 14 : c.height - 14)
      g.moveTo(x < c.width / 2 ? 2 : c.width - 2, y)
      g.lineTo(x < c.width / 2 ? 14 : c.width - 14, y)
      g.stroke()
    }
  }, [img, an, s.overlay, s.mode, tw, th, bleed, safe])

  const checks: { item: string; tone: 'ok' | 'warn' | 'err' | 'info'; detail: string }[] = []
  if (img && an) {
    checks.push({ item: 'Resolution', tone: rating.tone, detail: `${Math.round(eff.ppi)} ppi effective at ${fmt(tw, 1)} × ${fmt(th, 1)} mm — ${rating.label}. At ${s.distance} cm viewing distance ~${Math.round(needPpi)} ppi is enough.` })
    checks.push({ item: 'Aspect / crop', tone: crop > 0.1 ? 'warn' : 'ok', detail: s.mode === 'cover' ? `${fmt(crop * 100, 1)}% of the image is cropped to fill the page${bleed ? ' and bleed' : ''}.` : 'Image fitted inside the trim; check for white margins.' })
    checks.push({ item: 'Bleed', tone: s.mode === 'cover' && bleed > 0 ? 'ok' : 'warn', detail: bleed === 0 ? 'No bleed set: edge-to-edge designs need 3 mm (⅛ in) bleed.' : s.mode === 'cover' ? `Image extends ${fmt(s.bleed, 2)} ${s.unit} past the trim.` : 'Fit mode leaves the bleed empty: use Fill for full-bleed prints.' })
    const cmyk = img.meta.components === 4
    checks.push({ item: 'Colour mode', tone: cmyk ? 'ok' : 'info', detail: cmyk ? 'CMYK JPEG (4 components). Shown via the browser’s RGB conversion.' : 'RGB image: the printer or RIP will convert it to CMYK.' })
    const icc = img.meta.icc ? `${img.meta.icc.desc || 'unnamed'} (${img.meta.icc.space}, ${img.meta.icc.cls}, v${img.meta.icc.version})` : img.meta.iccName ? `${img.meta.iccName} (PNG iCCP)` : img.meta.srgbChunk ? 'sRGB chunk' : ''
    checks.push({ item: 'Colour profile', tone: icc ? 'ok' : 'warn', detail: icc ? `Embedded: ${icc}.` : 'No embedded ICC profile: printers will assume sRGB. Embed one when exporting.' })
    checks.push({ item: 'Out-of-gamut colours (approx.)', tone: an.gamutPct > 0.05 ? 'err' : an.gamutPct > 0.005 ? 'warn' : 'ok', detail: `${fmt(an.gamutPct * 100, 1)}% of pixels look too saturated for typical coated CMYK; expect them to print duller.` })
    checks.push({ item: 'Ink coverage (estimate)', tone: an.tacMax > s.tacLimit ? 'warn' : 'ok', detail: `Max ≈ ${Math.round(an.tacMax)}% (limit ${s.tacLimit}%), ${fmt(an.tacOver * 100, 1)}% of pixels above it before the printer’s TAC limiting.` })
    if (img.meta.components === 2 || (img.meta.components === 4 && img.meta.format === 'PNG')) checks.push({ item: 'Transparency', tone: 'warn', detail: 'Image has an alpha channel: transparent areas will print as paper white.' })
    if (img.meta.dpi) checks.push({ item: 'File DPI tag', tone: 'info', detail: `${Math.round(img.meta.dpi[0])} dpi (${img.meta.dpiSource}). This is only a hint; the effective PPI above is what counts.` })
    checks.push({ item: 'Safe area', tone: 'info', detail: `Keep text and logos inside the dashed green line (${s.safe} ${s.unit} inside the trim).` })
  }
  const score = checks.filter((c) => c.tone === 'ok').length
  const report = img ? [
    `PRINT PREFLIGHT REPORT — ${img.name}`,
    `Image: ${pw} × ${ph} px, ${img.meta.format}, ${fmt(img.bytes / 1024, 0)} KB`,
    `Target: ${fmt(tw, 1)} × ${fmt(th, 1)} mm, bleed ${fmt(bleed, 2)} mm, safe ${fmt(safe, 2)} mm, ${s.mode === 'cover' ? 'fill' : 'fit'}`,
    '',
    ...checks.map((c) => `[${c.tone === 'ok' ? 'PASS' : c.tone === 'err' ? 'FAIL' : c.tone === 'warn' ? 'WARN' : 'INFO'}] ${c.item}: ${c.detail}`),
    '',
    'Gamut and ink checks are approximate (generic coated-offset model), not an ICC soft proof.',
  ].join('\n') : ''

  return (
    <Split>
      <div>
        <Panel title="Image" actions={<Btn kind="ghost" onClick={() => void demoFile().then(load)}>Demo poster</Btn>}>
          <FileDrop accept="image/*" onFiles={([f]) => void load(f)} label="Drop a JPEG, PNG or WebP to check" />
          {err && <Note tone="err">{err}</Note>}
          {img && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{img.name} · {pw} × {ph} px · {fmt(img.bytes / 1024, 0)} KB · max {fmt(maxSizeIn[0], 1)} × {fmt(maxSizeIn[1], 1)} in ({Math.round(maxSizeIn[0] * 25.4)} × {Math.round(maxSizeIn[1] * 25.4)} mm) at 300 ppi</div>}
        </Panel>
        <Panel title="Print size" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={s.size} onChange={(size) => set(size < 0 ? { size } : { size, unit: 'mm', w: SIZES[size][1], h: SIZES[size][2], bleed: s.unit === 'in' ? 3 : s.bleed, safe: s.unit === 'in' ? 5 : s.safe })} options={[...SIZES.map(([n], i) => [i, n] as [number, string]), [-1, 'Custom']]} />
          <Row>
            <Num label="Width" value={s.w} onChange={(w) => set({ w, size: -1 })} unit={s.unit} min={1} />
            <Num label="Height" value={s.h} onChange={(h) => set({ h, size: -1 })} unit={s.unit} min={1} />
            <div style={{ alignSelf: 'end' }}>
              <Seg value={s.unit} onChange={(unit) => unit !== s.unit && set({ unit, w: +(unit === 'in' ? s.w / 25.4 : s.w * 25.4).toFixed(3), h: +(unit === 'in' ? s.h / 25.4 : s.h * 25.4).toFixed(3), bleed: unit === 'in' ? 0.125 : 3, safe: unit === 'in' ? 0.25 : 5 })} options={[['mm', 'mm'], ['in', 'in']]} />
            </div>
          </Row>
          <Row>
            <Num label="Bleed" value={s.bleed} onChange={(bleed) => set({ bleed: Math.max(0, bleed) })} unit={s.unit} min={0} />
            <Num label="Safe margin" value={s.safe} onChange={(safe) => set({ safe: Math.max(0, safe) })} unit={s.unit} min={0} />
          </Row>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['cover', 'Fill page + bleed (crop)'], ['fit', 'Fit inside trim']]} />
          <Slider label="Viewing distance" value={s.distance} onChange={(distance) => set({ distance })} min={20} max={300} step={5} unit=" cm" show={(v) => String(v)} />
        </Panel>
        <Panel title="Ink settings (estimate)">
          <Row>
            <Select label="TAC limit" value={s.tacLimit} onChange={(tacLimit) => set({ tacLimit })} options={[[340, '340% sheet-fed coated'], [300, '300% coated (typical)'], [260, '260% uncoated'], [240, '240% newsprint']]} />
            <Select label="Black generation (GCR)" value={s.gcr} onChange={(gcr) => set({ gcr })} options={[[0.25, 'Light'], [0.5, 'Medium'], [0.8, 'Heavy']]} />
          </Row>
        </Panel>
      </div>
      <div>
        {img && an && (
          <>
            <Stats>
              <Stat label="Effective resolution" value={`${Math.round(eff.ppi)} ppi`} sub={rating.label} tone={rating.tone === 'ok' ? 'good' : rating.tone === 'err' ? 'bad' : undefined} />
              <Stat label="Out of CMYK gamut ≈" value={`${fmt(an.gamutPct * 100, 1)}%`} sub="of pixels (approximate)" tone={an.gamutPct > 0.005 ? 'bad' : 'good'} />
              <Stat label="Max ink ≈" value={`${Math.round(an.tacMax)}%`} sub={`${fmt(an.tacOver * 100, 1)}% px over ${s.tacLimit}%`} />
              <Stat label="Checks passed" value={`${score} / ${checks.length}`} tone="accent" />
            </Stats>
            <Panel title="Proof with bleed & safe area" actions={<Seg value={s.overlay} onChange={(overlay) => set({ overlay })} options={[['none', 'Image'], ['gamut', 'Gamut warning'], ['tac', 'Ink > limit']]} />}>
              <canvas ref={canvas} style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto', borderRadius: 6 }} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Red band = bleed (trimmed off). Black line = trim. Dashed green = safe area. {s.overlay === 'gamut' ? 'Magenta pixels are likely outside a typical CMYK gamut.' : s.overlay === 'tac' ? 'Cyan pixels exceed the ink limit in a simple separation.' : ''}
              </div>
              {an.worst.length > 0 && (
                <Row>
                  <span className="muted" style={{ fontSize: 13 }}>Most common out-of-gamut colours:</span>
                  {an.worst.map(([r, g, b, f]) => <span key={`${r}${g}${b}`} title={`rgb(${r},${g},${b}) · ${fmt(f * 100, 1)}%`} style={{ width: 26, height: 26, borderRadius: 6, background: `rgb(${r},${g},${b})`, border: '1px solid var(--line)' }} />)}
                </Row>
              )}
            </Panel>
            <Panel title="Preflight report" actions={<><CopyButton text={report} /><Btn onClick={() => download('preflight-report.txt', report, 'text/plain')}>⬇ .txt</Btn></>}>
              {checks.map((c) => (
                <Note key={c.item} tone={c.tone}>
                  <b>{c.tone === 'ok' ? '✓' : c.tone === 'err' ? '✗' : c.tone === 'warn' ? '⚠' : 'ℹ'} {c.item}:</b> {c.detail}
                </Note>
              ))}
              <div className="muted" style={{ fontSize: 12 }}>The gamut test compares each colour’s chroma with an approximate coated-offset CMYK gamut (typical ink primaries); it is a quick screen, not an ICC soft proof.</div>
            </Panel>
            <Panel title="File & EXIF">
              <Table
                head={['Property', 'Value']}
                rows={[
                  ['Format', `${img.meta.format}${img.meta.progressive ? ' (progressive)' : ''}`],
                  ['Pixels', `${pw} × ${ph}`],
                  ['Components / bit depth', `${img.meta.components ?? '—'} / ${img.meta.bitDepth ?? '—'}`],
                  ['DPI tag', img.meta.dpi ? `${Math.round(img.meta.dpi[0])} × ${Math.round(img.meta.dpi[1])} (${img.meta.dpiSource})` : exif('XResolution') ? `${display(exif('XResolution')!)} (EXIF)` : '—'],
                  ['ICC profile', img.meta.icc ? `${img.meta.icc.desc} · ${img.meta.icc.space} · ${img.meta.icc.cls} · v${img.meta.icc.version} · ${img.meta.icc.size} bytes` : img.meta.iccName ?? (img.meta.srgbChunk ? 'sRGB (chunk)' : 'none')],
                  ['Adobe APP14', img.meta.adobe ? 'yes' : 'no'],
                  ...img.tags.filter((t) => ['Make', 'Model', 'Software', 'ColorSpace', 'XResolution', 'ResolutionUnit', 'DateTimeOriginal', 'PixelXDimension', 'PixelYDimension'].includes(t.name)).map((t) => [`EXIF ${t.name}`, display(t)]),
                ]}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
