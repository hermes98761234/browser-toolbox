import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { moveRect, resizeRect, type Handle, type Rect } from './lib/image-cropper'
import { dpiVerdict, fitCrop, orientRatio, parseRatio, PHI, printDpi, RATIOS, type Orient } from './lib/aspect-ratio-cropper'
import { zipStore } from './lib/pdf-splitter'

type Src = HTMLCanvasElement | HTMLImageElement
interface Img { id: string; name: string; src: Src; W: number; H: number; thumb: string; crop: Rect }
type Guide = 'thirds' | 'golden' | 'center' | 'none'
const DEF = { ratio: 'p810', custom: '7:3', orient: 'auto' as Orient, guide: 'thirds' as Guide, quality: 0.92, inches: 24 }
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw']
const HPOS: Record<string, [number, number]> = { nw: [0, 0], ne: [100, 0], se: [100, 100], sw: [0, 100] }

function demo(W: number, H: number, hue: number, label: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, `hsl(${hue},70%,28%)`)
  sky.addColorStop(0.55, `hsl(${hue + 40},85%,62%)`)
  sky.addColorStop(1, `hsl(${hue + 60},90%,80%)`)
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255,250,220,.95)'
  g.beginPath()
  g.arc(W * 0.66, H * 0.38, Math.min(W, H) * 0.08, 0, Math.PI * 2)
  g.fill()
  for (let k = 0; k < 3; k++) {
    g.fillStyle = `hsl(${hue + 200 + k * 15},45%,${30 - k * 9}%)`
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x <= W; x += W / 60) g.lineTo(x, H * (0.55 + k * 0.12) - H * 0.12 * Math.abs(Math.sin(x / (W / 5) + k * 1.7 + hue)))
    g.lineTo(W, H)
    g.fill()
  }
  // a subject on the left third
  g.fillStyle = '#111827'
  const tx = W * 0.3, ty = H * 0.82
  g.fillRect(tx - W * 0.006, ty - H * 0.2, W * 0.012, H * 0.2)
  g.beginPath()
  g.arc(tx, ty - H * 0.22, Math.min(W, H) * 0.07, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,.85)'
  g.font = `bold ${Math.round(Math.min(W, H) / 22)}px system-ui, sans-serif`
  g.fillText(`${label} · ${W}×${H}`, W * 0.04, H * 0.95)
  return c
}

const thumbOf = (src: Src, W: number, H: number) => {
  const c = document.createElement('canvas')
  const k = 120 / Math.max(W, H)
  c.width = Math.round(W * k)
  c.height = Math.round(H * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

export default function AspectRatioCropper() {
  const [s, set, reset] = useToolState('aspect-ratio-cropper', DEF)
  const [imgs, setImgs] = useState<Img[]>([])
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const view = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'move' | Handle; px: number; py: number; start: Rect } | null>(null)

  const preset = RATIOS.find((r) => r[0] === s.ratio) ?? RATIOS[0]
  const baseRatio = s.ratio === 'custom' ? parseRatio(s.custom) : preset[2] / preset[3]
  const ratioFor = (im: { W: number; H: number }) => orientRatio(baseRatio ?? 1, im.W, im.H, s.orient)
  const cur = imgs[Math.min(sel, imgs.length - 1)]

  const add = (list: { name: string; src: Src; W: number; H: number }[]) =>
    setImgs((old) => [...old, ...list.map((x) => ({ ...x, id: Math.random().toString(36).slice(2), thumb: thumbOf(x.src, x.W, x.H), crop: fitCrop(x.W, x.H, ratioFor(x)) }))])

  // Demo photos on first load (guarded against the dev double-run).
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    add([
      { name: 'landscape-demo', src: demo(3000, 2000, 210, 'Landscape'), W: 3000, H: 2000 },
      { name: 'portrait-demo', src: demo(2000, 3000, 280, 'Portrait'), W: 2000, H: 3000 },
      { name: 'square-demo', src: demo(2400, 2400, 20, 'Square'), W: 2400, H: 2400 },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fit every crop when the ratio/orientation changes, keeping each crop's centre and relative size.
  const refit = (r: (im: Img) => number) =>
    setImgs((old) => old.map((im) => {
      const full = fitCrop(im.W, im.H, ratioFor(im))
      const scale = Math.min(1, Math.max(0.1, Math.sqrt((im.crop.w * im.crop.h) / (full.w * full.h))))
      return { ...im, crop: fitCrop(im.W, im.H, r(im), (im.crop.x + im.crop.w / 2) / im.W, (im.crop.y + im.crop.h / 2) / im.H, scale) }
    }))
  const lastKey = useRef('')
  useEffect(() => {
    const key = `${s.ratio}|${s.custom}|${s.orient}`
    if (lastKey.current && lastKey.current !== key && baseRatio) refit((im) => orientRatio(baseRatio, im.W, im.H, s.orient))
    lastKey.current = key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ratio, s.custom, s.orient])

  // Draw the selected image (downscaled preview).
  useEffect(() => {
    const c = view.current
    if (!c || !cur) return
    const k = Math.min(1, 1400 / Math.max(cur.W, cur.H))
    c.width = Math.round(cur.W * k)
    c.height = Math.round(cur.H * k)
    c.getContext('2d')!.drawImage(cur.src, 0, 0, c.width, c.height)
  }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (files: File[]) => {
    setErr('')
    const ok = files.filter((f) => f.type.startsWith('image/'))
    if (ok.length < files.length) setErr('Some files were skipped (not images).')
    for (const f of ok) {
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.onload = () => add([{ name: f.name.replace(/\.[^.]+$/, ''), src: img, W: img.naturalWidth, H: img.naturalHeight }])
      img.onerror = () => setErr(`${f.name}: this format cannot be decoded by your browser.`)
      img.src = url
    }
  }

  const setCrop = (c: Rect) => setImgs((old) => old.map((im) => (im.id === cur?.id ? { ...im, crop: c } : im)))
  const down = (kind: 'move' | Handle) => (e: RPE) => {
    if (!cur) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { kind, px: e.clientX, py: e.clientY, start: cur.crop }
  }
  const move = (e: RPE) => {
    const d = drag.current
    if (!d || !box.current || !cur) return
    const k = cur.W / box.current.clientWidth
    const dx = (e.clientX - d.px) * k, dy = (e.clientY - d.py) * k
    setCrop(d.kind === 'move' ? moveRect(d.start, dx, dy, cur.W, cur.H) : resizeRect(d.start, d.kind, dx, dy, ratioFor(cur), cur.W, cur.H, 32))
  }
  const up = () => (drag.current = null)

  const applyToAll = () => {
    if (!cur) return
    const full = fitCrop(cur.W, cur.H, ratioFor(cur))
    const scale = Math.sqrt((cur.crop.w * cur.crop.h) / (full.w * full.h))
    const cx = (cur.crop.x + cur.crop.w / 2) / cur.W, cy = (cur.crop.y + cur.crop.h / 2) / cur.H
    setImgs((old) => old.map((im) => (im.id === cur.id ? im : { ...im, crop: fitCrop(im.W, im.H, ratioFor(im), cx, cy, scale) })))
  }

  const render = (im: Img) =>
    new Promise<Blob>((ok, bad) => {
      const c = document.createElement('canvas')
      const w = Math.round(im.crop.w), h = Math.round(im.crop.h)
      c.width = w
      c.height = h
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, w, h)
      g.drawImage(im.src, Math.round(im.crop.x), Math.round(im.crop.y), w, h, 0, 0, w, h)
      c.toBlob((b) => (b ? ok(b) : bad(new Error('JPEG encoding failed'))), 'image/jpeg', s.quality)
    })
  const fname = (im: Img) => `${im.name}-${Math.round(im.crop.w)}x${Math.round(im.crop.h)}.jpg`
  const exportOne = async (im: Img) => download(fname(im), await render(im))
  const exportAll = async () => {
    setBusy('Rendering…')
    try {
      const files: { name: string; data: Uint8Array }[] = []
      for (const [i, im] of imgs.entries()) {
        setBusy(`Rendering ${i + 1}/${imgs.length}…`)
        files.push({ name: fname(im), data: new Uint8Array(await (await render(im)).arrayBuffer()) })
      }
      download('cropped-photos.zip', new Blob([zipStore(files) as BlobPart]), 'application/zip')
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy('')
  }

  const inches: [number, number] = preset[5] ?? [s.inches, s.inches / (baseRatio && baseRatio >= 1 ? baseRatio : 1 / (baseRatio || 1))]
  const dpiOf = (im: Img) => printDpi(im.crop, inches)
  const P = (v: number, total: number) => `${(v / total) * 100}%`
  const guides = s.guide === 'thirds' ? [1 / 3, 2 / 3] : s.guide === 'golden' ? PHI : s.guide === 'center' ? [0.5] : []

  return (
    <Split wide="left">
      <div>
        <Panel title={cur ? <>Crop <span style={{ color: 'var(--accent)' }}>{cur.name}</span></> : 'Crop'} actions={<Seg value={s.guide} onChange={(guide) => set({ guide })} options={[['thirds', 'Thirds'], ['golden', 'Golden'], ['center', 'Centre'], ['none', 'None']]} label="Guides" />}>
          {cur ? (
            <div style={{ padding: 10, background: '#111827', borderRadius: 8 }}>
              <div ref={box} style={{ position: 'relative', touchAction: 'none', userSelect: 'none', lineHeight: 0, maxWidth: cur.H > cur.W ? `${(cur.W / cur.H) * 560}px` : undefined, margin: '0 auto' }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <canvas ref={view} style={{ width: '100%', height: 'auto', display: 'block' }} />
                {[
                  { left: 0, top: 0, width: '100%', height: P(cur.crop.y, cur.H) },
                  { left: 0, top: P(cur.crop.y + cur.crop.h, cur.H), width: '100%', bottom: 0 },
                  { left: 0, top: P(cur.crop.y, cur.H), width: P(cur.crop.x, cur.W), height: P(cur.crop.h, cur.H) },
                  { left: P(cur.crop.x + cur.crop.w, cur.W), right: 0, top: P(cur.crop.y, cur.H), height: P(cur.crop.h, cur.H) },
                ].map((st, i) => <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,.62)', pointerEvents: 'none', ...st }} />)}
                <div onPointerDown={down('move')} style={{ position: 'absolute', left: P(cur.crop.x, cur.W), top: P(cur.crop.y, cur.H), width: P(cur.crop.w, cur.W), height: P(cur.crop.h, cur.H), outline: '2px solid #fff', cursor: 'move' }}>
                  {guides.map((g) => (
                    <span key={g}>
                      <i style={{ position: 'absolute', left: `${g * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,.7)' }} />
                      <i style={{ position: 'absolute', top: `${g * 100}%`, left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,.7)' }} />
                    </span>
                  ))}
                  {CORNERS.map((h) => (
                    <span key={h} onPointerDown={down(h)} style={{ position: 'absolute', left: `${HPOS[h][0]}%`, top: `${HPOS[h][1]}%`, width: 18, height: 18, margin: -9, background: '#fff', border: '2px solid var(--accent)', borderRadius: 4, cursor: `${h}-resize`, touchAction: 'none' }} />
                  ))}
                  <span style={{ position: 'absolute', left: 6, top: 6, lineHeight: 1.2, background: 'rgba(0,0,0,.65)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 12, pointerEvents: 'none' }}>{Math.round(cur.crop.w)}×{Math.round(cur.crop.h)}</span>
                </div>
              </div>
            </div>
          ) : <Note>Add photos to start.</Note>}
          <Row>
            <Btn onClick={() => cur && setCrop(fitCrop(cur.W, cur.H, ratioFor(cur)))} disabled={!cur}>Centre & maximise</Btn>
            <Btn onClick={applyToAll} disabled={imgs.length < 2} title="Use this crop's relative position and size for every photo">Apply position to all</Btn>
            {cur && <Btn kind="primary" onClick={() => void exportOne(cur)}>⬇ This JPEG</Btn>}
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Drag the frame to move it and the corners to resize; the ratio stays locked. Exports use the original pixels at full resolution.</p>
        </Panel>
        <Panel title={`Batch (${imgs.length} photo${imgs.length === 1 ? '' : 's'})`} actions={<><Btn kind="primary" onClick={() => void exportAll()} disabled={!imgs.length || !!busy}>{busy || '⬇ All as ZIP'}</Btn><Btn kind="ghost" onClick={() => { setImgs([]); setSel(0) }}>Clear</Btn></>}>
          <FileDrop accept="image/*" multiple onFiles={open} label="Drop photos here or click to add (stay on your device)" />
          {err && <Note tone="err">{err}</Note>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {imgs.map((im, i) => (
              <button key={im.id} type="button" onClick={() => setSel(i)} style={{ border: `2px solid ${im.id === cur?.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: 4, background: 'var(--panel)', cursor: 'pointer', width: 132 }}>
                <img src={im.thumb} alt={im.name} style={{ width: 120, height: 80, objectFit: 'contain', display: 'block' }} />
                <span style={{ fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{im.name}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div>
        {cur && (
          <Stats>
            <Stat label="Output" value={`${Math.round(cur.crop.w)}×${Math.round(cur.crop.h)}`} sub={`${((cur.crop.w * cur.crop.h) / 1e6).toFixed(1)} MP · ${((cur.crop.w * cur.crop.h * 100) / (cur.W * cur.H)).toFixed(0)}% of ${cur.W}×${cur.H}`} tone="accent" />
            <Stat label={`Print ${inches[0].toFixed(inches[0] % 1 ? 1 : 0)}×${inches[1].toFixed(inches[1] % 1 ? 1 : 0)} in`} value={`${Math.round(dpiOf(cur))} dpi`} sub={dpiVerdict(dpiOf(cur))} tone={dpiOf(cur) >= 200 ? 'good' : 'bad'} />
          </Stats>
        )}
        <Panel title="Aspect ratio" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={s.ratio} onChange={(ratio) => set({ ratio })} options={RATIOS.map((r) => [r[0], `${r[4]} · ${r[1]}`] as [string, string])} />
          <Row>{['sq', 'ig45', 'story', 'p46', 'p810', 'r169'].map((k) => <Btn key={k} kind={s.ratio === k ? 'primary' : 'ghost'} onClick={() => set({ ratio: k })}>{RATIOS.find((r) => r[0] === k)![1].replace(/^(Print|Instagram portrait|Story \/ Reels \/ TikTok|Widescreen|Square) /, '')}</Btn>)}</Row>
          {s.ratio === 'custom' && <Txt label="Custom ratio (W:H)" value={s.custom} onChange={(custom) => set({ custom })} placeholder="e.g. 7:3 or 1.85" />}
          {!baseRatio && <Note tone="err">Enter a ratio like 7:3, 4x5 or 1.85.</Note>}
          <span className="k-label">Orientation</span>
          <Seg value={s.orient} onChange={(orient) => set({ orient })} options={[['auto', 'Match photo'], ['landscape', 'Landscape'], ['portrait', 'Portrait'], ['as-is', 'As listed']]} label="Orientation" />
        </Panel>
        <Panel title="Print check">
          {!preset[5] && <Num label="Long side of the print" value={s.inches} min={1} max={120} unit="in" onChange={(v) => set({ inches: v })} />}
          <Table
            head={['Photo', 'Crop px', 'dpi', '']}
            rows={imgs.map((im) => {
              const d = dpiOf(im)
              return [im.name, `${Math.round(im.crop.w)}×${Math.round(im.crop.h)}`, Math.round(d), <b key="v" style={{ color: d >= 200 ? 'var(--ok)' : d >= 150 ? 'var(--warn)' : 'var(--err)' }}>{dpiVerdict(d)}</b>]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>300 dpi is ideal for photo prints viewed up close; 150–200 dpi is fine for posters seen from a distance.</p>
        </Panel>
        <Panel title="JPEG export">
          <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.5} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
          <p className="muted" style={{ fontSize: 12 }}>No resampling: every crop is exported at the source's native resolution. Transparent areas become white.</p>
        </Panel>
      </div>
    </Split>
  )
}
