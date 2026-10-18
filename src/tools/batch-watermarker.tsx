import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { autoTone, markSize, meanLuminance, outName, positions, type Pos } from './lib/batch-watermarker'
import { fmtBytes, makeZip } from './lib/image-compressor'

type Kind = 'logo' | 'text'
type ColorMode = 'original' | 'custom' | 'auto'
type Fmt = 'same' | 'image/jpeg' | 'image/png' | 'image/webp'
interface State {
  kind: Kind; text: string; font: string; bold: boolean; pos: Pos; size: number; opacity: number; margin: number; rotate: number; gap: number
  colorMode: ColorMode; color: string; shadow: boolean; blend: GlobalCompositeOperation; fmt: Fmt; quality: number; pattern: string
}
const DEF: State = {
  kind: 'logo', text: '© Northwind Studio 2026', font: 'system-ui, sans-serif', bold: true, pos: 'br', size: 22, opacity: 0.75, margin: 4, rotate: 0, gap: 60,
  colorMode: 'auto', color: '#ffffff', shadow: true, blend: 'source-over', fmt: 'same', quality: 0.9, pattern: '{name}-wm',
}
const GRID: Pos[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
const POSNAME: Record<string, string> = { tl: 'Top left', tc: 'Top', tr: 'Top right', ml: 'Left', mc: 'Center', mr: 'Right', bl: 'Bottom left', bc: 'Bottom', br: 'Bottom right' }
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const FONTS: [string, string][] = [['system-ui, sans-serif', 'Sans'], ['Georgia, "Times New Roman", serif', 'Serif'], ['"Courier New", monospace', 'Mono'], ['"Brush Script MT", "Segoe Script", cursive', 'Script']]
const BLENDS: [GlobalCompositeOperation, string][] = [['source-over', 'Normal'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['difference', 'Difference']]
const PRESETS: [string, Partial<State>][] = [
  ['Corner logo', { kind: 'logo', pos: 'br', size: 22, opacity: 0.75, rotate: 0, colorMode: 'auto', blend: 'source-over' }],
  ['Center stamp', { pos: 'mc', size: 45, opacity: 0.35, rotate: -20, colorMode: 'custom', color: '#ffffff', blend: 'overlay' }],
  ['Tiled proof', { kind: 'text', text: 'PROOF · NOT FOR USE', pos: 'tile', size: 30, opacity: 0.22, rotate: -30, colorMode: 'auto', gap: 45 }],
  ['Credit line', { kind: 'text', text: '© Northwind Studio 2026', pos: 'bl', size: 30, opacity: 0.85, rotate: 0, colorMode: 'auto' }],
]

interface Item { id: string; name: string; type: string; size: number; w: number; h: number; bmp: ImageBitmap; thumb: string }
interface Mark { img: CanvasImageSource; w: number; h: number; name: string; url: string }

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}
const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob>((r, rej) => c.toBlob((b) => (b ? r(b) : rej(new Error('Encoding failed'))), type, q))

async function samplePhoto(name: string, w: number, h: number, scene: number): Promise<File> {
  const c = canvas(w, h)
  const g = c.getContext('2d')!
  const skies = [['#1e3a8a', '#f97316'], ['#bae6fd', '#f0f9ff'], ['#0f172a', '#334155'], ['#fde68a', '#fb7185']]
  const [a, b] = skies[scene]
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, a)
  sky.addColorStop(1, b)
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.fillStyle = scene === 2 ? '#fef9c3' : 'rgba(255,255,255,.85)'
  g.beginPath()
  g.arc(w * 0.7, h * 0.3, Math.min(w, h) * 0.08, 0, 7)
  g.fill()
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = scene === 1 ? `hsl(200 20% ${92 - layer * 6}%)` : `hsl(${150 + scene * 40} 35% ${30 - layer * 8}%)`
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += w / 40) g.lineTo(x, h * (0.55 + layer * 0.12 + 0.07 * Math.sin((x / w) * (5 + layer * 3) + scene + layer)))
    g.lineTo(w, h)
    g.fill()
  }
  const blob = await toBlob(c, 'image/jpeg', 0.9)
  return new File([blob], name, { type: 'image/jpeg' })
}

function sampleLogo(): Mark {
  const c = canvas(420, 140)
  const g = c.getContext('2d')!
  g.strokeStyle = '#6366f1'
  g.lineWidth = 12
  g.beginPath()
  g.arc(70, 70, 54, 0, 7)
  g.stroke()
  g.fillStyle = '#6366f1'
  g.font = 'bold 64px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('N', 70, 92)
  g.fillStyle = '#111827'
  g.textAlign = 'left'
  g.font = 'bold 50px system-ui, sans-serif'
  g.fillText('Northwind', 142, 78)
  g.font = '28px system-ui, sans-serif'
  g.fillText('STUDIO', 145, 114)
  return { img: c, w: c.width, h: c.height, name: 'northwind-logo.png', url: c.toDataURL() }
}

async function toItem(f: File): Promise<Item> {
  const bmp = await createImageBitmap(f)
  const k = 96 / Math.max(bmp.width, bmp.height)
  const c = canvas(bmp.width * k, bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return { id: uid(), name: f.name, type: f.type, size: f.size, w: bmp.width, h: bmp.height, bmp, thumb: c.toDataURL('image/jpeg', 0.7) }
}

/** The watermark as an image, recoloured if needed. */
function markImage(s: State, logo: Mark | null, tone: string | null): { img: HTMLCanvasElement; aspect: number } | null {
  let c: HTMLCanvasElement
  if (s.kind === 'text') {
    const txt = s.text.trim() || ' '
    const font = `${s.bold ? 'bold ' : ''}160px ${s.font}`
    const m = canvas(10, 10).getContext('2d')!
    m.font = font
    c = canvas(m.measureText(txt).width + 20, 200)
    const g = c.getContext('2d')!
    g.font = font
    g.textBaseline = 'middle'
    g.fillStyle = tone ?? s.color
    g.fillText(txt, 10, 104)
    return { img: c, aspect: c.width / c.height }
  }
  if (!logo) return null
  c = canvas(logo.w, logo.h)
  const g = c.getContext('2d')!
  g.drawImage(logo.img, 0, 0, c.width, c.height)
  const col = s.colorMode === 'original' ? null : tone ?? s.color
  if (col) {
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = col
    g.fillRect(0, 0, c.width, c.height)
  }
  return { img: c, aspect: c.width / c.height }
}

/** Draws the watermark(s) over an image already painted on g (W×H). */
function stamp(g: CanvasRenderingContext2D, W: number, H: number, s: State, logo: Mark | null): string | null {
  const probe = markImage(s, logo, null)
  if (!probe) return null
  const [w, h] = markSize(W, H, probe.aspect, s.size)
  const spots = positions(W, H, w, h, s.pos, s.margin, s.gap)
  let tone: string | null = null
  if (s.colorMode === 'auto') {
    const [x, y] = s.pos === 'tile' ? [0, 0] : spots[0]
    const [rw, rh] = s.pos === 'tile' ? [W, H] : [w, h]
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y))
    const px = g.getImageData(x0, y0, Math.max(1, Math.min(W - x0, Math.ceil(rw))), Math.max(1, Math.min(H - y0, Math.ceil(rh)))).data
    tone = autoTone(meanLuminance(px)) === 'light' ? '#ffffff' : '#111111'
  }
  const mark = tone ? markImage(s, logo, tone) : probe
  if (!mark) return null
  g.save()
  g.globalAlpha = s.opacity
  g.globalCompositeOperation = s.blend
  if (s.shadow) {
    g.shadowColor = tone === '#111111' ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.5)'
    g.shadowBlur = Math.max(2, h * 0.08)
    g.shadowOffsetY = Math.max(1, h * 0.02)
  }
  for (const [x, y] of spots) {
    g.save()
    g.translate(x + w / 2, y + h / 2)
    g.rotate((s.rotate * Math.PI) / 180)
    g.drawImage(mark.img, -w / 2, -h / 2, w, h)
    g.restore()
  }
  g.restore()
  return tone
}

export default function BatchWatermarker() {
  const [s, set, reset] = useToolState('batch-watermarker', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [logo, setLogo] = useState<Mark | null>(() => sampleLogo())
  const [cur, setCur] = useState(0)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<{ n: number; bytes: number } | null>(null)
  const [err, setErr] = useState('')
  const view = useRef<HTMLCanvasElement>(null)
  const [tone, setTone] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      samplePhoto('sunset-ridge.jpg', 1600, 1067, 0),
      samplePhoto('snow-field.jpg', 1200, 1500, 1),
      samplePhoto('night-hills.jpg', 1400, 1400, 2),
      samplePhoto('golden-hour.jpg', 1800, 1000, 3),
    ]).then((fs) => Promise.all(fs.map(toItem))).then((its) => setItems((cur) => (cur.length ? cur : its)))
  }, [])

  const it = items[Math.min(cur, items.length - 1)]
  useEffect(() => {
    const c = view.current
    if (!c || !it) return
    const id = requestAnimationFrame(() => {
      const k = Math.min(1, 900 / Math.max(it.w, it.h))
      c.width = Math.round(it.w * k)
      c.height = Math.round(it.h * k)
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(it.bmp, 0, 0, c.width, c.height)
      setTone(stamp(g, c.width, c.height, s, logo))
    })
    return () => cancelAnimationFrame(id)
  }, [it, s, logo])

  const addFiles = async (fs: File[]) => {
    setErr('')
    const imgs = fs.filter((f) => f.type.startsWith('image/'))
    if (imgs.length < fs.length) setErr(`${fs.length - imgs.length} non-image file(s) skipped.`)
    const add: Item[] = []
    for (const f of imgs) {
      try { add.push(await toItem(f)) } catch { setErr(`Could not decode ${f.name}.`) }
    }
    setItems((cur) => [...cur.filter((x) => !x.name.match(/^(sunset-ridge|snow-field|night-hills|golden-hour)\.jpg$/)), ...add])
    setCur(0)
    setDone(null)
  }
  const setLogoFile = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f)
      setLogo({ img: bmp, w: bmp.width, h: bmp.height, name: f.name, url: URL.createObjectURL(f) })
      set({ kind: 'logo', colorMode: 'original' })
    } catch {
      setErr('Could not read that logo. Use PNG, SVG, WebP or JPEG.')
    }
  }

  const run = async () => {
    setBusy('Starting…')
    setDone(null)
    const files: { name: string; data: Uint8Array }[] = []
    let bytes = 0
    for (const [i, x] of items.entries()) {
      setBusy(`Watermarking ${i + 1} / ${items.length}`)
      const c = canvas(x.w, x.h)
      const g = c.getContext('2d', { willReadFrequently: true })!
      const type = s.fmt === 'same' ? (x.type in EXT ? x.type : 'image/png') : s.fmt
      if (type === 'image/jpeg') {
        g.fillStyle = '#fff'
        g.fillRect(0, 0, x.w, x.h)
      }
      g.drawImage(x.bmp, 0, 0)
      stamp(g, x.w, x.h, s, logo)
      const blob = await toBlob(c, type, s.quality)
      c.width = c.height = 0
      bytes += blob.size
      files.push({ name: outName(s.pattern, x.name, i + 1, EXT[blob.type] ?? 'png'), data: new Uint8Array(await blob.arrayBuffer()) })
    }
    const names = new Set<string>()
    for (const f of files) {
      let n = f.name, k = 2
      while (names.has(n)) n = f.name.replace(/(\.[^.]+)$/, `-${k++}$1`)
      names.add(n)
      f.name = n
    }
    if (files.length === 1) download(files[0].name, new Blob([files[0].data as Uint8Array<ArrayBuffer>]))
    else download('watermarked.zip', new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    setDone({ n: files.length, bytes })
    setBusy('')
  }

  const totalIn = items.reduce((a, x) => a + x.size, 0)
  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Photos">
          <FileDrop accept="image/*" multiple onFiles={(fs) => void addFiles(fs)} label="Drop photos or click to choose (many at once)" />
          {err && <Note tone="warn">{err}</Note>}
          {items.length > 0 && <Btn kind="ghost" onClick={() => { setItems([]); setDone(null) }}>Clear all</Btn>}
        </Panel>
        <Panel title="2 · Watermark">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['logo', '🖼 Logo'], ['text', '🔤 Text']]} />
          {s.kind === 'logo' ? (
            <>
              <FileDrop accept="image/png,image/svg+xml,image/webp,image/jpeg" onFiles={([f]) => void setLogoFile(f)} label="Logo (transparent PNG or SVG works best)" />
              {logo && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}><img src={logo.url} alt="" style={{ height: 36, maxWidth: 140, objectFit: 'contain', background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/12px 12px', borderRadius: 4 }} /><span className="muted">{logo.name} · {logo.w}×{logo.h}</span></div>}
            </>
          ) : (
            <>
              <Txt label="Text" value={s.text} onChange={(text) => set({ text })} />
              <Row>
                <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
                <Check label="Bold" value={s.bold} onChange={(bold) => set({ bold })} />
              </Row>
            </>
          )}
          <span className="k-label">Color</span>
          <Seg value={s.colorMode} onChange={(colorMode) => set({ colorMode })} options={s.kind === 'logo' ? [['original', 'Original'], ['auto', 'Auto contrast'], ['custom', 'Solid color']] : [['auto', 'Auto contrast'], ['custom', 'Solid color']]} />
          {(s.colorMode === 'custom' || (s.kind === 'text' && s.colorMode === 'original')) && <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 64, height: 32, display: 'block' }} />}
          {s.colorMode === 'auto' && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>White on dark areas, black on bright ones, decided per photo.</p>}
        </Panel>
        <Panel title="3 · Placement">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div role="radiogroup" aria-label="Position" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4, padding: 6, border: '1px solid var(--line)', borderRadius: 10 }}>
              {GRID.map((p) => <button key={p} type="button" aria-checked={s.pos === p} role="radio" onClick={() => set({ pos: p })} title={p} style={{ width: 34, height: 26, borderRadius: 6, border: '1px solid var(--line)', background: s.pos === p ? 'var(--accent)' : 'var(--panel)' }} />)}
            </div>
            <Btn kind={s.pos === 'tile' ? 'primary' : 'normal'} onClick={() => set({ pos: 'tile' })}>▦ Tile across</Btn>
          </div>
          <Slider label="Size" value={s.size} onChange={(size) => set({ size })} min={3} max={90} unit="% of width" />
          <Slider label="Opacity" value={s.opacity} onChange={(opacity) => set({ opacity })} min={0.05} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          {s.pos !== 'tile' ? <Slider label="Margin" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={20} step={0.5} unit="%" /> : <Slider label="Tile spacing" value={s.gap} onChange={(gap) => set({ gap })} min={0} max={200} step={5} unit="%" />}
          <Slider label="Rotation" value={s.rotate} onChange={(rotate) => set({ rotate })} min={-90} max={90} unit="°" />
          <Row>
            <Select label="Blend" value={s.blend} onChange={(blend) => set({ blend })} options={BLENDS} />
            <Check label="Soft shadow" value={s.shadow} onChange={(shadow) => set({ shadow })} />
          </Row>
        </Panel>
        <Panel title="4 · Output" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['same', 'Same as input'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} />
            <Txt label="File name" value={s.pattern} onChange={(pattern) => set({ pattern })} hint="{name} original, {n} 001, 002…" />
          </Row>
          {s.fmt !== 'image/png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.5} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}`} />}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Photos" value={items.length} sub={fmtBytes(totalIn)} />
          <Stat label="Placement" value={s.pos === 'tile' ? 'Tiled' : POSNAME[s.pos]} sub={`${s.size}% wide · ${Math.round(s.opacity * 100)}% opacity`} />
          <Stat label="Mark tone" value={tone ? (tone === '#ffffff' ? 'Light' : 'Dark') : s.colorMode === 'original' ? 'Original' : 'Custom'} tone="accent" />
          <Stat label="Output" value={done ? fmtBytes(done.bytes) : '—'} sub={done ? `${done.n} files` : 'not exported yet'} />
        </Stats>
        <Panel title={it ? `Preview · ${it.name} (${it.w}×${it.h})` : 'Preview'} actions={<Btn kind="primary" disabled={!items.length || !!busy} onClick={() => void run()}>{busy || (items.length > 1 ? `⬇ Watermark all (${items.length}) · ZIP` : '⬇ Watermark & download')}</Btn>}>
          {it ? (
            <div style={{ display: 'grid', placeItems: 'center', background: 'var(--bg)', borderRadius: 10, padding: 10 }}>
              <canvas ref={view} style={{ maxWidth: '100%', maxHeight: 520, borderRadius: 6 }} />
            </div>
          ) : <Note>Add some photos to begin.</Note>}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 4 }}>
            {items.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setCur(i)} title={x.name} style={{ position: 'relative', flex: '0 0 auto', padding: 0, border: `2px solid ${i === cur ? 'var(--accent)' : 'transparent'}`, borderRadius: 8, background: 'none' }}>
                <img src={x.thumb} alt={x.name} style={{ height: 64, display: 'block', borderRadius: 6 }} />
                <span onClick={(e) => { e.stopPropagation(); setItems(items.filter((y) => y.id !== x.id)); setCur(0) }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '0 5px' }}>✕</span>
              </button>
            ))}
          </div>
          {done && <Note tone="ok">Exported {done.n} watermarked {done.n === 1 ? 'photo' : 'photos'} ({fmtBytes(done.bytes)}). Originals are untouched; full resolution kept.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Size and margin are relative to each photo, so portrait and landscape shots get proportionally the same mark. Metadata (EXIF) is not copied to the output.</p>
        </Panel>
      </div>
    </Split>
  )
}
