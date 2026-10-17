import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { applyRatio, centerCrop, moveRect, outputSize, resizeRect, roundRect, type Handle, type Rect } from './lib/image-cropper'

type Fmt = 'image/png' | 'image/jpeg' | 'image/webp'
interface State { preset: string; fmt: Fmt; quality: number; usePresetSize: boolean; maxSide: number; thirds: boolean }
const DEF: State = { preset: 'ig-square', fmt: 'image/jpeg', quality: 0.9, usePresetSize: true, maxSide: 0, thirds: true }

// [key, label, ratio w/h (0 = free, -1 = original), target size]
const PRESETS: [string, string, number, [number, number] | null][] = [
  ['free', 'Free', 0, null],
  ['orig', 'Original ratio', -1, null],
  ['1:1', 'Square 1:1', 1, null],
  ['4:3', '4:3', 4 / 3, null],
  ['3:2', '3:2', 3 / 2, null],
  ['16:9', '16:9', 16 / 9, null],
  ['ig-square', 'Instagram post 1080×1080', 1, [1080, 1080]],
  ['ig-portrait', 'Instagram portrait 1080×1350', 4 / 5, [1080, 1350]],
  ['story', 'Story / Reels / TikTok 1080×1920', 9 / 16, [1080, 1920]],
  ['yt', 'YouTube thumbnail 1280×720', 16 / 9, [1280, 720]],
  ['fb', 'Facebook / link preview 1200×630', 1200 / 630, [1200, 630]],
  ['li', 'LinkedIn post 1200×627', 1200 / 627, [1200, 627]],
  ['x-post', 'X / Twitter post 1600×900', 16 / 9, [1600, 900]],
  ['x-header', 'X / Twitter header 1500×500', 3, [1500, 500]],
  ['pin', 'Pinterest pin 1000×1500', 2 / 3, [1000, 1500]],
  ['avatar', 'Profile picture 400×400', 1, [400, 400]],
]
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HPOS: Record<Handle, [number, number]> = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] }
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)
const EXT: Record<Fmt, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function sampleImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 1000
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 640)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.6, '#f97316')
  sky.addColorStop(1, '#fde68a')
  g.fillStyle = sky
  g.fillRect(0, 0, 1600, 1000)
  g.fillStyle = '#fff7d6'
  g.beginPath()
  g.arc(1050, 560, 90, 0, Math.PI * 2)
  g.fill()
  const ridge = (base: number, amp: number, col: string, seed: number) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 1000)
    for (let x = 0; x <= 1600; x += 20) g.lineTo(x, base - amp * Math.abs(Math.sin(x / 210 + seed)) - (amp / 3) * Math.sin(x / 57 + seed * 3))
    g.lineTo(1600, 1000)
    g.fill()
  }
  ridge(640, 180, '#7c3aed', 1)
  ridge(720, 130, '#4c1d95', 2.4)
  ridge(820, 90, '#1e1b4b', 4.1)
  g.fillStyle = '#0f172a'
  g.fillRect(0, 880, 1600, 120)
  g.fillStyle = 'rgba(255,255,255,.85)'
  g.font = 'bold 54px system-ui, sans-serif'
  g.fillText('Sample photo · 1600×1000', 60, 960)
  return c
}

export default function ImageCropper() {
  const [s, set, reset] = useToolState('image-cropper', DEF)
  const src = useRef<HTMLCanvasElement | null>(null) // oriented source
  const view = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'move' | Handle; px: number; py: number; start: Rect } | null>(null)
  const [dim, setDim] = useState<[number, number]>([0, 0])
  const [name, setName] = useState('sample-photo')
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 })
  const [res, setRes] = useState<{ url: string; blob: Blob; w: number; h: number } | null>(null)
  const [err, setErr] = useState('')

  const preset = PRESETS.find((p) => p[0] === s.preset) ?? PRESETS[0]
  const [W, H] = dim
  const ratio = preset[2] === -1 ? (W && H ? W / H : null) : preset[2] || null

  const show = (c: HTMLCanvasElement) => {
    src.current = c
    const v = view.current
    if (v) {
      v.width = c.width
      v.height = c.height
      v.getContext('2d')!.drawImage(c, 0, 0)
    }
    setDim([c.width, c.height])
    const p = PRESETS.find((x) => x[0] === s.preset) ?? PRESETS[0]
    setCrop(centerCrop(c.width, c.height, p[2] === -1 ? c.width / c.height : p[2] || null))
    setRes(null)
  }

  // First render: load the generated sample photo once (guarded by the ref).
  useEffect(() => {
    if (!src.current) show(sampleImage())
  })

  const open = (f: File) => {
    if (!f.type.startsWith('image/')) return setErr('Please choose an image file.')
    setErr('')
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      setName(f.name.replace(/\.[^.]+$/, ''))
      show(c)
    }
    img.onerror = () => setErr('This image format cannot be decoded by your browser.')
    img.src = url
  }

  const transform = (op: 'cw' | 'ccw' | 'fh' | 'fv') => {
    const o = src.current
    if (!o) return
    const c = document.createElement('canvas')
    const turn = op === 'cw' || op === 'ccw'
    c.width = turn ? o.height : o.width
    c.height = turn ? o.width : o.height
    const g = c.getContext('2d')!
    if (op === 'cw') { g.translate(c.width, 0); g.rotate(Math.PI / 2) }
    if (op === 'ccw') { g.translate(0, c.height); g.rotate(-Math.PI / 2) }
    if (op === 'fh') { g.translate(c.width, 0); g.scale(-1, 1) }
    if (op === 'fv') { g.translate(0, c.height); g.scale(1, -1) }
    g.drawImage(o, 0, 0)
    show(c)
  }

  const pickPreset = (key: string) => {
    set({ preset: key })
    const p = PRESETS.find((x) => x[0] === key)!
    const r = p[2] === -1 ? W / H : p[2] || null
    setCrop((c) => (r ? applyRatio(c, r, W, H) : c))
    setRes(null)
  }

  const down = (kind: 'move' | Handle) => (e: RPE) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { kind, px: e.clientX, py: e.clientY, start: crop }
  }
  const move = (e: RPE) => {
    const d = drag.current
    if (!d || !box.current) return
    const k = W / box.current.clientWidth
    const dx = (e.clientX - d.px) * k, dy = (e.clientY - d.py) * k
    setCrop(d.kind === 'move' ? moveRect(d.start, dx, dy, W, H) : resizeRect(d.start, d.kind, dx, dy, ratio, W, H, 16))
    setRes(null)
  }
  const up = () => (drag.current = null)

  const nudge = (patch: Partial<Rect>) => {
    const r = { ...crop, ...patch }
    r.w = Math.min(Math.max(1, r.w), W)
    r.h = ratio ? r.w / ratio : Math.min(Math.max(1, r.h), H)
    if (r.h > H) { r.h = H; r.w = ratio ? H * ratio : r.w }
    setCrop(moveRect(r, 0, 0, W, H))
    setRes(null)
  }

  const target = s.usePresetSize ? preset[3] : null
  const [ow, oh] = outputSize(crop, target, s.maxSide)
  const rc = roundRect(crop)

  const render = () => {
    const o = src.current
    if (!o) return
    const c = document.createElement('canvas')
    c.width = ow
    c.height = oh
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    if (s.fmt === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, ow, oh) }
    g.drawImage(o, crop.x, crop.y, crop.w, crop.h, 0, 0, ow, oh)
    c.toBlob((b) => {
      if (!b) return setErr('Export failed in this browser.')
      setRes((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { url: URL.createObjectURL(b), blob: b, w: ow, h: oh }
      })
    }, s.fmt, s.quality)
  }

  const copy = async () => {
    if (!res) return
    try {
      const png = res.blob.type === 'image/png' ? res.blob : await new Promise<Blob>((ok, bad) => { const c = document.createElement('canvas'); c.width = res.w; c.height = res.h; const im = new Image(); im.onload = () => { c.getContext('2d')!.drawImage(im, 0, 0); c.toBlob((b) => (b ? ok(b) : bad(new Error('png'))), 'image/png') }; im.src = res.url })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    } catch {
      setErr('Clipboard image copy is not supported here; use Download instead.')
    }
  }

  const upscale = target ? target[0] / crop.w : 1
  const pctOf = useMemo(() => (W && H ? (crop.w * crop.h) / (W * H) : 0), [crop, W, H])

  return (
    <Split wide="left">
      <div>
        <Panel title="Crop" actions={<><Btn kind="ghost" onClick={() => transform('ccw')} title="Rotate left">⟲</Btn><Btn kind="ghost" onClick={() => transform('cw')} title="Rotate right">⟳</Btn><Btn kind="ghost" onClick={() => transform('fh')} title="Flip horizontal">⇋</Btn><Btn kind="ghost" onClick={() => transform('fv')} title="Flip vertical">⇵</Btn><Btn kind="ghost" onClick={() => show(sampleImage())}>Sample</Btn></>}>
          <div style={{ padding: 10, background: '#111827', borderRadius: 8 }}>
          <div ref={box} style={{ position: 'relative', touchAction: 'none', userSelect: 'none', lineHeight: 0 }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <canvas ref={view} style={{ width: '100%', height: 'auto', display: 'block' }} />
            {W > 0 && [
              { left: 0, top: 0, width: '100%', height: `${(crop.y / H) * 100}%` },
              { left: 0, top: `${((crop.y + crop.h) / H) * 100}%`, width: '100%', bottom: 0 },
              { left: 0, top: `${(crop.y / H) * 100}%`, width: `${(crop.x / W) * 100}%`, height: `${(crop.h / H) * 100}%` },
              { left: `${((crop.x + crop.w) / W) * 100}%`, right: 0, top: `${(crop.y / H) * 100}%`, height: `${(crop.h / H) * 100}%` },
            ].map((st, i) => <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,.6)', pointerEvents: 'none', ...st }} />)}
            {W > 0 && (
              <div onPointerDown={down('move')} style={{ position: 'absolute', left: `${(crop.x / W) * 100}%`, top: `${(crop.y / H) * 100}%`, width: `${(crop.w / W) * 100}%`, height: `${(crop.h / H) * 100}%`, outline: '2px solid #fff', cursor: 'move' }}>
                {s.thirds && [1, 2].map((i) => (
                  <span key={i}>
                    <i style={{ position: 'absolute', left: `${(i * 100) / 3}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,.6)' }} />
                    <i style={{ position: 'absolute', top: `${(i * 100) / 3}%`, left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,.6)' }} />
                  </span>
                ))}
                {HANDLES.map((h) => (
                  <span key={h} onPointerDown={down(h)} style={{ position: 'absolute', left: `${HPOS[h][0]}%`, top: `${HPOS[h][1]}%`, width: 16, height: 16, margin: -8, background: '#fff', border: '2px solid var(--accent)', borderRadius: h.length === 2 ? 3 : 8, cursor: `${h}-resize`, touchAction: 'none' }} />
                ))}
                <span style={{ position: 'absolute', left: 6, top: 6, lineHeight: 1.2, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 12, pointerEvents: 'none' }}>{rc.w}×{rc.h}</span>
              </div>
            )}
          </div>
          </div>
          <FileDrop accept="image/*" onFiles={(f) => open(f[0])} label="Drop a photo here or click to choose (stays on your device)" />
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        {res && (
          <Panel title="Result" actions={<><Btn kind="primary" onClick={() => download(`${name}-${res.w}x${res.h}.${EXT[s.fmt]}`, res.blob)}>⬇ Download</Btn><Btn onClick={() => void copy()}>Copy</Btn></>}>
            <img src={res.url} alt="Cropped result" style={{ maxWidth: '100%', maxHeight: 360, display: 'block', margin: '0 auto', borderRadius: 6 }} />
            <p className="muted" style={{ textAlign: 'center' }}>{res.w}×{res.h}px · {kb(res.blob.size)} · {s.fmt.replace('image/', '').toUpperCase()}</p>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Source" value={`${W}×${H}`} sub={name} />
          <Stat label="Output" value={`${ow}×${oh}`} tone="accent" sub={`${(pctOf * 100).toFixed(0)}% of the image area`} />
        </Stats>
        {upscale > 1.15 && <Note tone="warn">The crop is only {rc.w}px wide, so it will be upscaled {upscale.toFixed(1)}× to {target![0]}px and may look soft. Use a larger crop or source.</Note>}
        <Panel title="Aspect ratio" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={s.preset} onChange={pickPreset} options={PRESETS.map(([k, l]) => [k, l] as [string, string])} />
          <Row>{['1:1', 'ig-portrait', 'story', 'yt', 'fb', 'free'].map((k) => <Btn key={k} kind={s.preset === k ? 'primary' : 'ghost'} onClick={() => pickPreset(k)}>{PRESETS.find((p) => p[0] === k)![1].split(' ')[0]}</Btn>)}</Row>
          {preset[3] && <Check label={`Resize output to ${preset[3][0]}×${preset[3][1]}`} value={s.usePresetSize} onChange={(usePresetSize) => set({ usePresetSize })} />}
          <Check label="Rule-of-thirds grid" value={s.thirds} onChange={(thirds) => set({ thirds })} />
          <Btn kind="ghost" onClick={() => setCrop(centerCrop(W, H, ratio))}>Center & maximise</Btn>
        </Panel>
        <Panel title="Exact position (px)">
          <Row>
            <Num label="X" value={rc.x} onChange={(x) => nudge({ x })} min={0} step={1} />
            <Num label="Y" value={rc.y} onChange={(y) => nudge({ y })} min={0} step={1} />
          </Row>
          <Row>
            <Num label="Width" value={rc.w} onChange={(w) => nudge({ w })} min={1} step={1} />
            <Num label="Height" value={rc.h} onChange={(h) => (ratio ? nudge({ w: h * ratio }) : nudge({ h }))} min={1} step={1} />
          </Row>
        </Panel>
        <Panel title="Export">
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} label="Format" />
          {s.fmt !== 'image/png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.4} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          {!target && <Num label="Limit long side (0 = no limit)" value={s.maxSide} onChange={(maxSide) => set({ maxSide })} min={0} step={1} unit="px" />}
          <Btn kind="primary" onClick={render}>✂ Crop image</Btn>
          <p className="muted" style={{ fontSize: 13 }}>Drag the box to move it, drag handles to resize. JPEG gets a white background where the source is transparent.</p>
        </Panel>
      </div>
    </Split>
  )
}
