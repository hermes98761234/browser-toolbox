import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, FileDrop, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, download, num, useToolState } from '../kit'
import { apply, area, convexQuad, dist, homography, orderQuad, REFERENCES, UNITS, type P, type Unit } from './lib/photo-measure-tool'

type Mode = 'scale' | 'persp'
type Tool = 'ref' | 'quad' | 'line' | 'area'
interface Meas { id: number; kind: 'line' | 'area'; pts: P[] }
interface Settings { mode: Mode; unit: Unit; refLen: number; rectW: number; rectH: number }

const DEF: Settings = { mode: 'persp', unit: 'mm', refLen: 85.6, rectW: 210, rectH: 297 }
const COLORS = ['#f43f5e', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6']

// Demo scene: an A4 sheet photographed at an angle. Plane coords are millimetres on the table.
const DEMO_QUAD: P[] = [[420, 175], [800, 205], [905, 690], [255, 640]]
function demoImage(): { canvas: HTMLCanvasElement; meas: Meas[] } {
  const c = document.createElement('canvas')
  c.width = 1200; c.height = 800
  const g = c.getContext('2d')!
  const H = homography([[0, 0], [210, 0], [210, 297], [0, 297]], DEMO_QUAD)!
  const grd = g.createLinearGradient(0, 0, 0, 800)
  grd.addColorStop(0, '#6b4a2f'); grd.addColorStop(1, '#a0714a')
  g.fillStyle = grd; g.fillRect(0, 0, 1200, 800)
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2
  for (let x = -200; x <= 420; x += 40) { g.beginPath(); const a = apply(H, [x, -150]), b = apply(H, [x, 450]); g.moveTo(...a); g.lineTo(...b); g.stroke() }
  const poly = (pts: P[], fill: string, stroke = '') => {
    g.beginPath(); pts.map((p) => apply(H, p)).forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath()
    g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke() }
  }
  const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  poly(rect(0, 0, 210, 297), '#f8fafc', '#cbd5e1')
  for (let y = 30; y < 290; y += 9) poly(rect(20, y, 170, 0.6), 'rgba(59,130,246,0.25)')
  poly(rect(30, 40, 85.6, 53.98), '#1d4ed8')
  poly(rect(38, 62, 12, 9), '#facc15')
  poly(rect(38, 82, 50, 4), 'rgba(255,255,255,0.7)')
  const coin: P[] = Array.from({ length: 48 }, (_, i) => [150 + 12.13 * Math.cos((i / 48) * 2 * Math.PI), 180 + 12.13 * Math.sin((i / 48) * 2 * Math.PI)])
  poly(coin, '#cbd5e1', '#64748b')
  poly(rect(232, 120, 76, 76), '#fde047', '#eab308')
  poly([[40, 230], [185, 255], [184, 260], [39, 235]], '#0f172a')
  const meas: Meas[] = [
    { id: 1, kind: 'line', pts: [apply(H, [30, 40]), apply(H, [115.6, 40])] },
    { id: 2, kind: 'line', pts: [apply(H, [137.87, 180]), apply(H, [162.13, 180])] },
    { id: 3, kind: 'area', pts: rect(232, 120, 76, 76).map((p) => apply(H, p)) },
  ]
  return { canvas: c, meas }
}

export default function PhotoMeasureTool() {
  const [s, set, reset] = useToolState('photo-measure-tool', DEF)
  const [img, setImg] = useState<CanvasImageSource & { width: number; height: number } | null>(null)
  const [name, setName] = useState('demo')
  const [quad, setQuad] = useState<P[]>(DEMO_QUAD)
  const [ref, setRef] = useState<P[]>([])
  const [meas, setMeas] = useState<Meas[]>([])
  const [draft, setDraft] = useState<P[]>([])
  const [tool, setTool] = useState<Tool>('line')
  const cv = useRef<HTMLCanvasElement>(null)
  const rc = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ kind: 'quad' | 'ref' | 'meas'; i: number; j: number } | null>(null)

  const loadDemo = () => {
    const d = demoImage()
    setImg(d.canvas); setName('demo'); setQuad(DEMO_QUAD); setMeas(d.meas); setDraft([])
    setRef([d.meas[0].pts[0], d.meas[0].pts[1]])
  }
  useEffect(loadDemo, [])

  const onFiles = async (f: File[]) => {
    if (!f[0]) return
    try {
      const bmp = await createImageBitmap(f[0])
      setImg(bmp); setName(f[0].name.replace(/\.[^.]+$/, ''))
      setQuad([]); setRef([]); setMeas([]); setDraft([])
      setTool(s.mode === 'persp' ? 'quad' : 'ref')
    } catch { alert('Could not read that image.') }
  }

  const U = UNITS[s.unit]
  const H = s.mode === 'persp' && quad.length === 4 && convexQuad(quad) ? homography(quad, [[0, 0], [s.rectW * U, 0], [s.rectW * U, s.rectH * U], [0, s.rectH * U]]) : null
  const mmPerPx = s.mode === 'scale' && ref.length === 2 && dist(ref[0], ref[1]) > 0 ? (s.refLen * U) / dist(ref[0], ref[1]) : null
  const ready = s.mode === 'persp' ? !!H : !!mmPerPx
  const toMm = (p: P): P => (H ? apply(H, p) : [p[0] * (mmPerPx ?? 0), p[1] * (mmPerPx ?? 0)])
  const lenOf = (pts: P[]) => (ready ? dist(toMm(pts[0]), toMm(pts[1])) / U : NaN)
  const areaOf = (pts: P[]) => (ready ? area(pts.map(toMm)) / (U * U) : NaN)
  const perimOf = (pts: P[]) => (ready ? pts.reduce((a, p, i) => a + dist(toMm(p), toMm(pts[(i + 1) % pts.length])), 0) / U : NaN)
  const fmtL = (v: number) => (Number.isFinite(v) ? `${num(v, s.unit === 'mm' ? 1 : 2)} ${s.unit}` : '—')
  const fmtA = (v: number) => (Number.isFinite(v) ? `${num(v, s.unit === 'mm' ? 0 : 2)} ${s.unit}²` : '—')

  // Draw main canvas at native image resolution
  useEffect(() => {
    const c = cv.current
    if (!c || !img) return
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    const k = img.width / Math.max(1, c.clientWidth || img.width)
    g.drawImage(img, 0, 0)
    const dot = (p: P, col: string, r = 6) => { g.beginPath(); g.arc(p[0], p[1], r * k, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 2 * k; g.strokeStyle = '#fff'; g.stroke() }
    const tag = (p: P, t: string, col: string) => {
      g.font = `600 ${14 * k}px system-ui, sans-serif`
      const w = g.measureText(t).width + 10 * k
      g.fillStyle = 'rgba(15,23,42,0.85)'; g.fillRect(p[0] - w / 2, p[1] - 11 * k, w, 22 * k)
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, p[0], p[1])
    }
    const path = (pts: P[], close: boolean) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); if (close) g.closePath() }
    if (s.mode === 'persp' && quad.length) {
      path(quad, quad.length === 4); g.setLineDash([8 * k, 6 * k]); g.lineWidth = 2 * k; g.strokeStyle = '#facc15'; g.stroke(); g.setLineDash([])
      if (quad.length === 4) { g.fillStyle = 'rgba(250,204,21,0.08)'; g.fill() }
      quad.forEach((p, i) => { dot(p, '#facc15', 7); tag([p[0], p[1] - 22 * k], ['TL', 'TR', 'BR', 'BL'][i], '#facc15') })
    }
    if (s.mode === 'scale' && ref.length) {
      path(ref, false); g.lineWidth = 3 * k; g.strokeStyle = '#facc15'; g.stroke()
      ref.forEach((p) => dot(p, '#facc15'))
      if (ref.length === 2) tag([(ref[0][0] + ref[1][0]) / 2, (ref[0][1] + ref[1][1]) / 2 - 20 * k], `ref ${s.refLen} ${s.unit}`, '#facc15')
    }
    meas.forEach((m, idx) => {
      const col = COLORS[idx % COLORS.length]
      path(m.pts, m.kind === 'area'); g.lineWidth = 3 * k; g.strokeStyle = col; g.stroke()
      if (m.kind === 'area') { g.fillStyle = col + '33'; g.fill() }
      m.pts.forEach((p) => dot(p, col, 5))
      const cx = m.pts.reduce((a, p) => a + p[0], 0) / m.pts.length, cy = m.pts.reduce((a, p) => a + p[1], 0) / m.pts.length
      tag([cx, cy - (m.kind === 'line' ? 18 * k : 0)], `${idx + 1}: ${m.kind === 'line' ? fmtL(lenOf(m.pts)) : fmtA(areaOf(m.pts))}`, col)
    })
    if (draft.length) { path(draft, false); g.lineWidth = 2 * k; g.strokeStyle = '#fff'; g.setLineDash([4 * k, 4 * k]); g.stroke(); g.setLineDash([]); draft.forEach((p) => dot(p, '#fff', 4)) }
  })

  // Rectified (top-down) preview of the reference plane
  useEffect(() => {
    const c = rc.current
    if (!c || !img || !H) return
    const inv = homography([[0, 0], [s.rectW, 0], [s.rectW, s.rectH], [0, s.rectH]], quad)
    if (!inv) return
    const pad = 0.35, x0 = -s.rectW * pad, y0 = -s.rectH * pad, W = s.rectW * (1 + 2 * pad), Hh = s.rectH * (1 + 2 * pad)
    const ow = 320, oh = Math.round((ow * Hh) / W)
    c.width = ow; c.height = oh
    const src = document.createElement('canvas')
    src.width = img.width; src.height = img.height
    const sg = src.getContext('2d')!
    sg.drawImage(img, 0, 0)
    const sd = sg.getImageData(0, 0, img.width, img.height).data
    const g = c.getContext('2d')!
    const out = g.createImageData(ow, oh)
    for (let y = 0; y < oh; y++)
      for (let x = 0; x < ow; x++) {
        const [u, v] = apply(inv, [x0 + (x / ow) * W, y0 + (y / oh) * Hh])
        const iu = Math.round(u), iv = Math.round(v), o = (y * ow + x) * 4
        if (iu >= 0 && iv >= 0 && iu < img.width && iv < img.height) {
          const si = (iv * img.width + iu) * 4
          out.data[o] = sd[si]; out.data[o + 1] = sd[si + 1]; out.data[o + 2] = sd[si + 2]; out.data[o + 3] = 255
        }
      }
    g.putImageData(out, 0, 0)
    g.strokeStyle = '#facc15'; g.setLineDash([5, 4]); g.lineWidth = 1.5
    g.strokeRect((-x0 / W) * ow, (-y0 / Hh) * oh, (s.rectW / W) * ow, (s.rectH / Hh) * oh)
  }, [img, H, quad, s.rectW, s.rectH])

  const toImg = (e: React.PointerEvent<HTMLCanvasElement>): P => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height]
  }
  const near = (p: P, e: React.PointerEvent<HTMLCanvasElement>) => {
    const k = e.currentTarget.width / e.currentTarget.getBoundingClientRect().width
    const hit = (q: P) => dist(p, q) < 14 * k
    let i = quad.findIndex(hit)
    if (s.mode === 'persp' && i >= 0) return { kind: 'quad' as const, i, j: 0 }
    i = ref.findIndex(hit)
    if (s.mode === 'scale' && i >= 0) return { kind: 'ref' as const, i, j: 0 }
    for (let m = 0; m < meas.length; m++) { const j = meas[m].pts.findIndex(hit); if (j >= 0) return { kind: 'meas' as const, i: m, j } }
    return null
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toImg(e)
    const n = near(p, e)
    if (n && !draft.length) { drag.current = n; e.currentTarget.setPointerCapture(e.pointerId); return }
    if (tool === 'quad') setQuad(quad.length >= 4 ? [p] : quad.length === 3 ? orderQuad([...quad, p]) : [...quad, p])
    else if (tool === 'ref') setRef(ref.length >= 2 ? [p] : [...ref, p])
    else if (tool === 'line') {
      if (draft.length) { setMeas([...meas, { id: Date.now(), kind: 'line', pts: [draft[0], p] }]); setDraft([]) } else setDraft([p])
    } else setDraft([...draft, p])
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const p = toImg(e)
    if (d.kind === 'quad') setQuad(quad.map((q, i) => (i === d.i ? p : q)))
    else if (d.kind === 'ref') setRef(ref.map((q, i) => (i === d.i ? p : q)))
    else setMeas(meas.map((m, i) => (i === d.i ? { ...m, pts: m.pts.map((q, j) => (j === d.j ? p : q)) } : m)))
  }
  const finishArea = () => { if (draft.length >= 3) setMeas([...meas, { id: Date.now(), kind: 'area', pts: draft }]); setDraft([]) }

  const exportPng = () => cv.current?.toBlob((b) => b && download(`${name}-measured.png`, b))
  const refTool: Tool = s.mode === 'persp' ? 'quad' : 'ref'
  const hint = !ready
    ? s.mode === 'persp' ? `Click the 4 corners of a flat rectangle of known size (${quad.length}/4 set).` : `Click both ends of the reference object (${ref.length}/2 set).`
    : tool === 'line' ? (draft.length ? 'Click the end point.' : 'Click the start point of a distance.') : tool === 'area' ? `Click polygon corners (${draft.length}), then Finish.` : 'Drag any handle to fine-tune.'

  return (
    <Split wide="right">
      <div>
        <Panel title="Photo">
          <FileDrop accept="image/*" onFiles={(f) => void onFiles(f)} label="Drop a photo or click to choose" />
          <Row><Btn kind="ghost" onClick={loadDemo}>Load demo photo</Btn><Btn kind="ghost" onClick={reset}>Reset settings</Btn></Row>
        </Panel>
        <Panel title="Calibration">
          <Seg value={s.mode} onChange={(mode) => { set({ mode }); setTool(mode === 'persp' ? 'quad' : 'ref') }} options={[['persp', 'Perspective (4 points)'], ['scale', 'Simple scale (2 points)']]} />
          <Select label="Units" value={s.unit} onChange={(unit) => set({ unit, refLen: +(s.refLen * UNITS[s.unit] / UNITS[unit]).toFixed(3), rectW: +(s.rectW * UNITS[s.unit] / UNITS[unit]).toFixed(3), rectH: +(s.rectH * UNITS[s.unit] / UNITS[unit]).toFixed(3) })} options={Object.keys(UNITS) as Unit[]} />
          <Select label="Reference object" value="" onChange={(v) => { const r = REFERENCES[+v]; if (r) set({ refLen: +(r.w / U).toFixed(3), rectW: +(r.w / U).toFixed(3), rectH: +(r.h / U).toFixed(3) }) }} options={[['', 'Choose a preset…'], ...REFERENCES.map((r, i) => [String(i), `${r.name} — ${r.w} × ${r.h} mm`] as const)]} />
          {s.mode === 'persp' ? (
            <Row>
              <Num key={'w' + s.unit} label="Rectangle width (TL→TR)" value={s.rectW} onChange={(rectW) => set({ rectW })} unit={s.unit} min={0.001} />
              <Num key={'h' + s.unit} label="Height (TL→BL)" value={s.rectH} onChange={(rectH) => set({ rectH })} unit={s.unit} min={0.001} />
            </Row>
          ) : (
            <Num key={'r' + s.unit} label="Reference length" value={s.refLen} onChange={(refLen) => set({ refLen })} unit={s.unit} min={0.001} />
          )}
          {s.mode === 'persp' && quad.length === 4 && !H && <Note tone="err">The 4 corners must form a convex quadrilateral.</Note>}
          <Note>{s.mode === 'persp' ? 'Perspective mode removes camera tilt: every point on the same flat surface as the rectangle is measured correctly, even far from it. Objects that stick up off that plane will read wrong.' : 'Simple scale assumes the camera looks straight at the object and everything is at the same distance. Use perspective mode for angled shots.'}</Note>
        </Panel>
        {s.mode === 'persp' && H && (
          <Panel title="Corrected top-down view">
            <canvas ref={rc} style={{ width: '100%', borderRadius: 8, background: 'var(--panel2)' }} />
            <p className="muted" style={{ fontSize: 13 }}>The photo re-projected onto the reference plane (dashed = your rectangle).</p>
          </Panel>
        )}
      </div>
      <div>
        <Panel title="Measure" actions={<Btn onClick={exportPng}>⬇ PNG</Btn>}>
          <Row>
            <Seg value={tool} onChange={(t) => { setTool(t); setDraft([]) }} options={[[refTool, s.mode === 'persp' ? '▭ Corners' : '📏 Reference'], ['line', '↔ Distance'], ['area', '⬠ Area']]} />
            {tool === 'area' && <Btn kind="primary" disabled={draft.length < 3} onClick={finishArea}>Finish area</Btn>}
            {draft.length > 0 && <Btn kind="ghost" onClick={() => setDraft([])}>Cancel</Btn>}
          </Row>
          <Note tone={ready ? 'info' : 'warn'}>{hint}</Note>
          <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onDoubleClick={() => tool === 'area' && finishArea()}
            style={{ width: '100%', display: 'block', borderRadius: 8, cursor: 'crosshair', touchAction: 'none', background: 'var(--panel2)' }} />
        </Panel>
        <Stats>
          <Stat label="Calibration" value={ready ? 'Ready' : 'Needed'} tone={ready ? 'good' : 'bad'} sub={s.mode === 'persp' ? 'homography' : mmPerPx ? `${num(mmPerPx / U, 4)} ${s.unit}/px` : 'scale'} />
          <Stat label="Measurements" value={meas.length} />
          {s.mode === 'persp' && H && <Stat label="Reference area" value={fmtA(s.rectW * s.rectH)} />}
        </Stats>
        <Panel title="Results" actions={<><CsvButton name={`${name}-measurements.csv`} rows={() => [['#', 'Type', `Length (${s.unit})`, `Area (${s.unit}²)`, `Perimeter (${s.unit})`], ...meas.map((m, i) => [i + 1, m.kind, m.kind === 'line' ? num(lenOf(m.pts), 3) : '', m.kind === 'area' ? num(areaOf(m.pts), 3) : '', m.kind === 'area' ? num(perimOf(m.pts), 3) : ''])]} /><Btn kind="ghost" disabled={!meas.length} onClick={() => setMeas([])}>Clear</Btn></>}>
          {meas.length ? (
            <Table
              head={['#', 'Type', 'Value', 'Detail', '']}
              rows={meas.map((m, i) => [
                <b key="i" style={{ color: COLORS[i % COLORS.length] }}>{i + 1}</b>,
                m.kind === 'line' ? 'Distance' : 'Area',
                <b key="v">{m.kind === 'line' ? fmtL(lenOf(m.pts)) : fmtA(areaOf(m.pts))}</b>,
                m.kind === 'line' ? `${num(dist(m.pts[0], m.pts[1]), 0)} px` : `perimeter ${fmtL(perimOf(m.pts))}`,
                <Btn key="x" kind="ghost" onClick={() => setMeas(meas.filter((x) => x.id !== m.id))}>✕</Btn>,
              ])}
            />
          ) : <p className="muted">No measurements yet.</p>}
          {name === 'demo' && <p className="muted" style={{ fontSize: 13 }}>Demo check: the card is 85.6 mm wide, the coin 24.26 mm across and the sticky note 76 × 76 mm (5,776 mm²).</p>}
        </Panel>
      </div>
    </Split>
  )
}
