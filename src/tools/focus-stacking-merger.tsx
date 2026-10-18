import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { align, boxBlur, focusMap, luma, masks, pyramidBlend, selectSharpest, toRgb, toRgba, warpRgb, type Rgb, type Xform } from './lib/focus-stacking-merger'

interface Frame { name: string; rgb: Rgb }
interface Result { out: Rgb; idx: Uint8Array; conf: Float32Array; xf: Xform[]; aligned: Rgb[]; share: number[]; crop: number; ms: number }

const MAX = 1600
const tick = () => new Promise((r) => setTimeout(r, 0))

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Synthetic macro scene: a receding ruler, a coin and a flower, with a depth map; returns n focus slices. */
function demoStack(n = 6, w = 560, h = 400): Frame[] {
  const c = canvasOf(w, h)
  const g = c.getContext('2d', { willReadFrequently: true })!
  const bg = g.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#3f6212')
  bg.addColorStop(1, '#a3a35a')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  let seed = 11
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsla(${70 + rnd() * 50},45%,${25 + rnd() * 45}%,0.7)`
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3)
  }
  // ruler running from the far top-left to the near bottom-right
  g.save()
  g.translate(w * 0.06, h * 0.12)
  g.rotate(Math.atan2(h * 0.78, w * 0.84))
  const L = Math.hypot(w * 0.84, h * 0.78)
  g.fillStyle = '#f5e7b8'
  g.fillRect(0, -26, L, 52)
  g.fillStyle = '#1f2937'
  g.font = 'bold 13px Arial, sans-serif'
  for (let mm = 0; mm * 4 < L; mm++) {
    const x = mm * 4
    const len = mm % 10 === 0 ? 20 : mm % 5 === 0 ? 14 : 8
    g.fillRect(x, -26, 1.2, len)
    if (mm % 10 === 0 && mm) g.fillText(String(mm / 10), x - 4, 10)
  }
  g.restore()
  // coin
  g.fillStyle = '#b8862b'
  g.beginPath()
  g.arc(w * 0.74, h * 0.28, 62, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#6b4a12'
  g.lineWidth = 2
  for (let r = 50; r < 62; r += 3) { g.beginPath(); g.arc(w * 0.74, h * 0.28, r, 0, Math.PI * 2); g.stroke() }
  g.fillStyle = '#4a3208'
  g.font = 'bold 30px Georgia, serif'
  g.fillText('2026', w * 0.74 - 36, h * 0.28 + 10)
  // flower
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    g.fillStyle = k % 2 ? '#db2777' : '#f472b6'
    g.beginPath()
    g.ellipse(w * 0.22 + Math.cos(a) * 34, h * 0.72 + Math.sin(a) * 34, 26, 10, a, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#facc15'
  g.beginPath()
  g.arc(w * 0.22, h * 0.72, 18, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 60; i++) { g.fillStyle = '#92400e'; g.fillRect(w * 0.22 - 14 + rnd() * 28, h * 0.72 - 14 + rnd() * 28, 2, 2) }
  const base = toRgb(g.getImageData(0, 0, w, h).data, w, h)
  // depth 0 (far) … 1 (near): along the ruler diagonal; coin and flower are flat objects
  const depth = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d = 0.5 * (x / w) + 0.5 * (y / h)
    if (Math.hypot(x - w * 0.74, y - h * 0.28) < 64) d = 0.42
    if (Math.hypot(x - w * 0.22, y - h * 0.72) < 62) d = 0.9
    depth[y * w + x] = d
  }
  const LV = 7
  const levels = [base, ...Array.from({ length: LV - 1 }, (_, r) => {
    const R = r + 1
    const bl = (a: Float32Array) => boxBlur(boxBlur(a, w, h, R), w, h, R)
    return { w, h, r: bl(base.r), g: bl(base.g), b: bl(base.b) }
  })]
  const mid = (n - 1) / 2
  return Array.from({ length: n }, (_, k) => {
    const f = k / (n - 1)
    const o: Rgb = { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) }
    for (let i = 0; i < w * h; i++) {
      const rad = Math.min(LV - 1.001, Math.abs(depth[i] - f) * 11)
      const a = Math.floor(rad), t = rad - a
      o.r[i] = levels[a].r[i] * (1 - t) + levels[a + 1].r[i] * t
      o.g[i] = levels[a].g[i] * (1 - t) + levels[a + 1].g[i] * t
      o.b[i] = levels[a].b[i] * (1 - t) + levels[a + 1].b[i] * t
    }
    // focus breathing + a small hand-held shift
    const xf = { s: 1 + 0.007 * (k - mid), tx: (rnd() - 0.5) * 7, ty: (rnd() - 0.5) * 7 }
    return { name: `slice ${k + 1} (focus ${Math.round(f * 100)}%)`, rgb: warpRgb(o, xf) }
  })
}

async function stack(frames: Frame[], o: { align: boolean; radius: number; mode: 'select' | 'pyramid'; soften: number }, progress: (s: string) => void): Promise<Result> {
  const t0 = performance.now()
  const n = frames.length
  const ref = Math.floor((n - 1) / 2)
  const refL = luma(frames[ref].rgb)
  const xf: Xform[] = []
  const aligned: Rgb[] = []
  for (let k = 0; k < n; k++) {
    progress(`Aligning frame ${k + 1} of ${n}…`)
    await tick()
    const t = o.align && k !== ref ? align(refL, luma(frames[k].rgb)) : { s: 1, tx: 0, ty: 0 }
    xf.push(t)
    aligned.push(t.s === 1 && t.tx === 0 && t.ty === 0 ? frames[k].rgb : warpRgb(frames[k].rgb, t))
  }
  const { w, h } = aligned[0]
  progress('Measuring sharpness…')
  await tick()
  const maps = aligned.map((a) => focusMap(luma(a), o.radius))
  const { idx, conf } = selectSharpest(maps)
  progress(o.mode === 'pyramid' ? 'Blending pyramids…' : 'Composing…')
  await tick()
  let out: Rgb
  if (o.mode === 'select') {
    out = { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) }
    for (let i = 0; i < w * h; i++) {
      const a = aligned[idx[i]]
      out.r[i] = a.r[i]
      out.g[i] = a.g[i]
      out.b[i] = a.b[i]
    }
  } else {
    const ws = masks(idx, n, w, h, o.soften)
    const ch = (c: 'r' | 'g' | 'b') => pyramidBlend(aligned.map((a) => a[c]), ws, w, h, 6)
    out = { w, h, r: ch('r'), g: ch('g'), b: ch('b') }
  }
  const share = Array.from({ length: n }, (_, k) => idx.reduce((a, v) => a + (v === k ? 1 : 0), 0) / idx.length)
  const crop = Math.min(Math.floor(Math.min(w, h) / 4), Math.ceil(Math.max(0, ...xf.map((t) => Math.max(Math.abs(t.tx), Math.abs(t.ty)) + Math.abs(1 - t.s) * Math.max(w, h) / 2))))
  progress('')
  return { out, idx, conf, xf, aligned, share, crop, ms: performance.now() - t0 }
}

const PAL = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']
function depthColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(0.9999, t)) * (PAL.length - 1)
  const i = Math.floor(x), f = x - i
  const p = (s: string) => [1, 3, 5].map((j) => parseInt(s.slice(j, j + 2), 16))
  const a = p(PAL[i]), b = p(PAL[i + 1])
  return [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * f) as [number, number, number]
}

const DEF = { align: true, radius: 4, mode: 'pyramid' as 'select' | 'pyramid', soften: 2, view: 'result' as 'result' | 'depth' | 'frame', frame: 0, crop: true }

export default function FocusStackingMerger() {
  const [s, set] = useToolState('focus-stacking-merger', DEF)
  const [frames, setFrames] = useState<Frame[]>([])
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)

  const run = async (fr = frames) => {
    if (fr.length < 2) return setMsg('Add at least two frames of the same scene.')
    setMsg('')
    setBusy('Starting…')
    try {
      setRes(await stack(fr, s, setBusy))
    } catch (e) {
      setMsg(`Stacking failed: ${(e as Error).message}`)
    }
    setBusy('')
  }
  useEffect(() => {
    const fr = demoStack()
    setFrames(fr) // eslint-disable-line react-hooks/set-state-in-effect
    void run(fr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async (files: File[]) => {
    setBusy('Loading images…')
    const out: Frame[] = []
    for (const f of files.slice(0, 20)) {
      try {
        const b = await createImageBitmap(f)
        const k = Math.min(1, MAX / Math.max(b.width, b.height))
        const c = canvasOf(Math.round(b.width * k), Math.round(b.height * k))
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(b, 0, 0, c.width, c.height)
        out.push({ name: f.name, rgb: toRgb(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height) })
      } catch {
        setMsg(`Could not read ${f.name}`)
      }
    }
    const ok = out.filter((f) => f.rgb.w === out[0]?.rgb.w && f.rgb.h === out[0]?.rgb.h)
    if (ok.length < out.length) setMsg('Some images had a different size and were skipped. All frames must come from the same camera position and settings.')
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setFrames(ok)
    setRes(null)
    setBusy('')
    if (ok.length >= 2) void run(ok)
  }

  // draw the current view
  useEffect(() => {
    const c = cv.current
    if (!c || !res) return
    const { w, h } = res.out
    const cr = s.crop ? res.crop : 0
    let px: Uint8ClampedArray
    if (s.view === 'result') px = toRgba(res.out)
    else if (s.view === 'frame') px = toRgba(res.aligned[Math.min(s.frame, res.aligned.length - 1)])
    else {
      px = new Uint8ClampedArray(w * h * 4)
      const n = res.aligned.length
      for (let i = 0; i < w * h; i++) {
        const [r, g, b] = depthColor(n > 1 ? res.idx[i] / (n - 1) : 0)
        const k = 0.35 + 0.65 * Math.min(1, res.conf[i] * 3)
        px[i * 4] = r * k
        px[i * 4 + 1] = g * k
        px[i * 4 + 2] = b * k
        px[i * 4 + 3] = 255
      }
    }
    const full = canvasOf(w, h)
    full.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
    c.width = w - 2 * cr
    c.height = h - 2 * cr
    c.getContext('2d')!.drawImage(full, -cr, -cr)
  }, [res, s.view, s.frame, s.crop])

  const save = (name: string) => cv.current?.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }, 'image/png')
  const n = frames.length

  return (
    <Split wide="right">
      <div>
        <Panel title="Frames">
          <FileDrop accept="image/*" multiple onFiles={(f) => void load(f)} label="Drop 2–20 photos focused at different depths" />
          <Row>
            <Btn onClick={() => { const fr = demoStack(); setFrames(fr); void run(fr) }}>Demo stack</Btn>
            <Btn kind="primary" disabled={!!busy || n < 2} onClick={() => void run()}>▶ Stack {n} frames</Btn>
          </Row>
          {busy && <Note>{busy}</Note>}
          {msg && <Note tone="warn">{msg}</Note>}
          <p className="muted" style={{ fontSize: 12.5 }}>{n} frame{n === 1 ? '' : 's'} loaded{frames[0] ? ` · ${frames[0].rgb.w} × ${frames[0].rgb.h}` : ''}. Large photos are reduced to {MAX} px on the long side; everything runs locally.</p>
        </Panel>
        <Panel title="Settings">
          <Check label="Align frames (shift + focus breathing)" value={s.align} onChange={(v) => set({ align: v })} />
          <Slider label="Sharpness smoothing radius" value={s.radius} onChange={(radius) => set({ radius })} min={1} max={12} unit=" px" />
          <div className="k-label">Merge method</div>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['pyramid', 'Pyramid blend'], ['select', 'Per-pixel pick']]} />
          {s.mode === 'pyramid' && <Slider label="Seam softening" value={s.soften} onChange={(soften) => set({ soften })} min={0} max={8} unit=" px" />}
          <Check label="Crop edges left by alignment" value={s.crop} onChange={(crop) => set({ crop })} />
          <p className="muted" style={{ fontSize: 12.5 }}>Change settings, then press Stack again. Pyramid blending hides seams and halos; per-pixel pick keeps the most detail but may show edges between depth zones.</p>
        </Panel>
        {res && (
          <Panel title="Alignment">
            <Table head={['Frame', 'Scale', 'Shift x', 'Shift y', 'Used']} rows={res.xf.map((t, i) => [i + 1, `${num((t.s - 1) * 100, 2)}%`, `${num(t.tx, 1)} px`, `${num(t.ty, 1)} px`, `${Math.round(res.share[i] * 100)}%`])} />
          </Panel>
        )}
      </div>
      <div>
        {res && (
          <Stats>
            <Stat label="Frames merged" value={res.aligned.length} sub={`reference = frame ${Math.floor((res.aligned.length - 1) / 2) + 1}`} />
            <Stat label="Output" value={`${res.out.w - 2 * (s.crop ? res.crop : 0)} × ${res.out.h - 2 * (s.crop ? res.crop : 0)}`} sub={s.crop ? `cropped ${res.crop} px` : 'uncropped'} />
            <Stat label="Time" value={`${num(res.ms / 1000, 1)} s`} />
          </Stats>
        )}
        <Panel title="Result" actions={<><Btn onClick={() => save(s.view === 'depth' ? 'depth-map.png' : 'focus-stack.png')} disabled={!res}>⬇ PNG</Btn></>}>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['result', 'Stacked'], ['depth', 'Depth map'], ['frame', 'Single frame']]} />
          {s.view === 'frame' && res && <Slider label="Frame" value={Math.min(s.frame, res.aligned.length - 1)} onChange={(frame) => set({ frame })} min={0} max={res.aligned.length - 1} show={(v) => `${v + 1} / ${res.aligned.length}`} />}
          <canvas ref={cv} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#111', display: 'block' }} />
          {s.view === 'depth' && <div className="k-legend" style={{ marginTop: 6 }}><span><i style={{ background: PAL[0] }} />first frame</span><span><i style={{ background: PAL[4] }} />last frame</span><span className="muted">darker = low confidence (flat areas)</span></div>}
          {!res && !busy && <p className="muted">Load frames and press Stack.</p>}
        </Panel>
        {res && (
          <Panel title="Where each frame was used">
            <BarChart bars={res.share.map((v, i) => ({ label: `#${i + 1}`, value: Math.round(v * 1000) / 10, color: `rgb(${depthColor(res.share.length > 1 ? i / (res.share.length - 1) : 0).join(',')})` }))} fy={(v) => `${v}%`} height={170} />
          </Panel>
        )}
        <Note>Shoot on a tripod with manual exposure, stepping focus from front to back with overlapping depth of field. Alignment corrects small shifts and the slight magnification change (focus breathing); it cannot fix rotation or moving subjects.</Note>
      </div>
    </Split>
  )
}
