import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { bilateral, buildMesh, heightAt, monotoneCurve, normalMap, soften, type Pt, type ReliefOpts } from './lib/image-relief-maker'
import { meshVolume, toGray } from './lib/lithophane-maker'
import { toBinaryStl } from './lib/stl-viewer'

type Source = 'demo' | 'text' | 'image'
interface State extends ReliefOpts {
  source: Source
  text: string
  font: string
  invert: boolean
  smooth: number
  soft: number
  curve: Pt[]
  cell: number
  res: number
  lightAz: number
  lightEl: number
}

const LINEAR: Pt[] = [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]]
const CURVES: Record<string, Pt[]> = {
  Linear: LINEAR,
  'Soft S': [[0, 0], [0.25, 0.12], [0.5, 0.5], [0.75, 0.88], [1, 1]],
  'Lift lows': [[0, 0], [0.25, 0.45], [0.5, 0.68], [0.75, 0.86], [1, 1]],
  'Flat top': [[0, 0], [0.25, 0.3], [0.5, 0.8], [0.75, 1], [1, 1]],
  Terraced: [[0, 0], [0.3, 0.05], [0.45, 0.5], [0.7, 0.55], [1, 1]],
}

const DEF: State = {
  shape: 'round', width: 60, height: 40, base: 2.4, depth: 2.2, mode: 'emboss', border: 3, rim: 2.6,
  source: 'demo', text: 'BREW\nCLUB', font: 'Georgia, serif', invert: false, smooth: 2, soft: 1, curve: LINEAR, cell: 0.3, res: 220, lightAz: 135, lightEl: 30,
}

const PRESETS: Record<string, Partial<State>> = {
  Medallion: { shape: 'round', width: 60, base: 2.4, depth: 2.2, border: 3, rim: 2.6, mode: 'emboss' },
  Coin: { shape: 'round', width: 32, base: 1.4, depth: 0.8, border: 1.6, rim: 1.0, mode: 'emboss', cell: 0.15 },
  Plaque: { shape: 'rect', width: 100, height: 70, base: 3, depth: 3, border: 5, rim: 3.2, mode: 'emboss', cell: 0.4 },
  'Engraved tile': { shape: 'rect', width: 70, height: 70, base: 2, depth: 1.5, border: 0, rim: 1.5, mode: 'engrave', cell: 0.3 },
}

/** Original procedural emblem: sun dome, ridged mountains and waves (bright = high). */
function demoEmblem(w: number, h: number, g: CanvasRenderingContext2D) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  const sun = g.createRadialGradient(w * 0.62, h * 0.33, 0, w * 0.62, h * 0.33, w * 0.17)
  sun.addColorStop(0, '#fff')
  sun.addColorStop(0.8, '#bbb')
  sun.addColorStop(1, '#555')
  g.fillStyle = sun
  g.beginPath()
  g.arc(w * 0.62, h * 0.33, w * 0.16, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#6a6a6a'
  g.lineWidth = w * 0.012
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2
    g.beginPath()
    g.moveTo(w * 0.62 + Math.cos(t) * w * 0.2, h * 0.33 + Math.sin(t) * w * 0.2)
    g.lineTo(w * 0.62 + Math.cos(t) * w * 0.26, h * 0.33 + Math.sin(t) * w * 0.26)
    g.stroke()
  }
  const peak = (x: number, top: number, half: number, bright: string) => {
    const gr = g.createLinearGradient(0, top, 0, h * 0.75)
    gr.addColorStop(0, bright)
    gr.addColorStop(1, '#333')
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(x - half, h * 0.75)
    g.lineTo(x - half * 0.3, top + (h * 0.75 - top) * 0.35)
    g.lineTo(x, top)
    g.lineTo(x + half * 0.35, top + (h * 0.75 - top) * 0.3)
    g.lineTo(x + half, h * 0.75)
    g.fill()
  }
  peak(w * 0.32, h * 0.3, w * 0.3, '#e6e6e6')
  peak(w * 0.7, h * 0.45, w * 0.26, '#c8c8c8')
  g.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = ['#d0d0d0', '#a8a8a8', '#808080'][k]
    g.lineWidth = w * 0.03
    g.shadowColor = '#000'
    g.shadowBlur = w * 0.01
    g.beginPath()
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.8 + k * 0.07) + Math.sin(x / (w * 0.06) + k) * h * 0.018)
    g.stroke()
  }
  g.shadowBlur = 0
}

function drawText(w: number, h: number, g: CanvasRenderingContext2D, text: string, font: string) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 5)
  if (!lines.length) return
  let size = h / (lines.length * 1.15)
  g.font = `bold ${size}px ${font}`
  const widest = Math.max(...lines.map((l) => g.measureText(l).width))
  size = Math.min(size, (size * w * 0.86) / Math.max(1, widest))
  g.font = `bold ${size}px ${font}`
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1))
}

function CurveEditor({ pts, onChange, hist }: { pts: Pt[]; onChange: (p: Pt[]) => void; hist: number[] }) {
  const S = 220, P = 10
  const [drag, setDrag] = useState<number | null>(null)
  const f = useMemo(() => monotoneCurve(pts), [pts])
  const hmax = Math.max(1, ...hist)
  const toXY = ([x, y]: Pt) => [P + x * (S - 2 * P), S - P - y * (S - 2 * P)]
  const move = (e: RPE<SVGSVGElement>) => {
    if (drag === null) return
    const r = e.currentTarget.getBoundingClientRect()
    let x = ((e.clientX - r.left) / r.width * S - P) / (S - 2 * P)
    const y = Math.min(1, Math.max(0, (S - P - ((e.clientY - r.top) / r.height) * S) / (S - 2 * P)))
    const lo = drag === 0 ? 0 : pts[drag - 1][0] + 0.03, hi = drag === pts.length - 1 ? 1 : pts[drag + 1][0] - 0.03
    if (drag === 0) x = 0
    else if (drag === pts.length - 1) x = 1
    x = Math.min(hi, Math.max(lo, x))
    onChange(pts.map((p, i) => (i === drag ? [x, y] : p)))
  }
  let d = ''
  for (let i = 0; i <= 64; i++) {
    const [x, y] = toXY([i / 64, f(i / 64)])
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 260, touchAction: 'none', background: 'var(--panel2)', borderRadius: 10 }} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      {hist.map((v, i) => (
        <rect key={i} x={P + (i / hist.length) * (S - 2 * P)} width={(S - 2 * P) / hist.length} y={S - P - (v / hmax) * (S - 2 * P) * 0.6} height={(v / hmax) * (S - 2 * P) * 0.6} fill="var(--muted)" opacity={0.25} />
      ))}
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t} stroke="var(--line)">
          <line x1={P + t * (S - 2 * P)} x2={P + t * (S - 2 * P)} y1={P} y2={S - P} />
          <line y1={P + t * (S - 2 * P)} y2={P + t * (S - 2 * P)} x1={P} x2={S - P} />
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      {pts.map((p, i) => {
        const [x, y] = toXY(p)
        return <circle key={i} cx={x} cy={y} r={7} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2.5} style={{ cursor: 'grab' }} onPointerDown={(e) => { e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); setDrag(i) }} />
      })}
      <text x={P + 2} y={P + 10} fontSize={10} fill="var(--muted)">high</text>
      <text x={S - P - 2} y={S - P - 4} fontSize={10} fill="var(--muted)" textAnchor="end">bright →</text>
    </svg>
  )
}

export default function ImageReliefMaker() {
  const [s, set, reset] = useToolState('image-relief-maker', DEF)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [name, setName] = useState('')
  const nmRef = useRef<HTMLCanvasElement>(null)
  const hmRef = useRef<HTMLCanvasElement>(null)
  const H = s.shape === 'round' ? s.width : s.height
  const bad = s.width <= 0 || H <= 0 || s.base <= 0 || s.depth < 0 || s.border * 2 >= Math.min(s.width, H)
  const source: Source = s.source === 'image' && !img ? 'demo' : s.source

  const onFiles = ([f]: File[]) => {
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setName(f.name)
      set({ source: 'image' })
    }
    im.src = URL.createObjectURL(f)
  }

  const field = useMemo(() => {
    const iw = s.shape === 'round' ? 1 : Math.max(1, s.width - 2 * s.border)
    const ih = s.shape === 'round' ? 1 : Math.max(1, H - 2 * s.border)
    const fw = Math.max(32, Math.min(500, Math.round(s.res)))
    const fh = Math.max(16, Math.round((fw * ih) / iw))
    const c = document.createElement('canvas')
    c.width = fw
    c.height = fh
    const g = c.getContext('2d', { willReadFrequently: true })!
    if (source === 'image' && img) {
      const k = Math.max(fw / img.width, fh / img.height)
      g.fillStyle = '#fff'
      g.fillRect(0, 0, fw, fh)
      g.drawImage(img, (fw - img.width * k) / 2, (fh - img.height * k) / 2, img.width * k, img.height * k)
    } else if (source === 'text') drawText(fw, fh, g, s.text, s.font)
    else demoEmblem(fw, fh, g)
    let gray = toGray(g.getImageData(0, 0, fw, fh).data, fw * fh, { contrast: 1, brightness: 0, gamma: 1, invert: s.invert })
    const hist = new Array(32).fill(0)
    for (const v of gray) hist[Math.min(31, Math.floor(v * 32))]++
    if (s.smooth > 0) gray = bilateral(gray, fw, fh, s.smooth, 0.12)
    if (s.soft > 0) gray = soften(gray, fw, fh, s.soft)
    const f = monotoneCurve(s.curve)
    for (let i = 0; i < gray.length; i++) gray[i] = Math.min(1, Math.max(0, f(gray[i])))
    return { g: gray, fw, fh, hist }
  }, [source, img, s.text, s.font, s.invert, s.smooth, s.soft, s.curve, s.res, s.shape, s.width, H, s.border])

  const opts: ReliefOpts = useMemo(() => ({ shape: s.shape, width: s.width, height: H, base: s.base, depth: s.depth, mode: s.mode, border: s.border, rim: s.rim }), [s.shape, s.width, H, s.base, s.depth, s.mode, s.border, s.rim])
  const zf = useMemo(() => (x: number, y: number) => heightAt(field.g, field.fw, field.fh, opts, x, y), [field, opts])
  const mesh = useMemo(() => {
    if (bad) return null
    const C = Math.max(16, Math.min(420, Math.round(s.width / Math.max(0.08, s.cell)) + 1))
    const R = s.shape === 'round' ? C : Math.max(8, Math.min(420, Math.round(H / Math.max(0.08, s.cell)) + 1))
    return buildMesh(zf, C, R, opts)
  }, [zf, opts, s.cell, s.width, H, s.shape, bad])
  const vol = mesh ? meshVolume(mesh) : 0
  const tris = mesh ? mesh.length / 9 : 0

  useEffect(() => {
    const nm = nmRef.current, hm = hmRef.current
    if (!nm || !hm || bad) return
    const w = 200, h = Math.round((200 * H) / s.width)
    for (const c of [nm, hm]) {
      c.width = w
      c.height = h
    }
    nm.getContext('2d')!.putImageData(new ImageData(normalMap(zf, w, h, opts), w, h), 0, 0)
    const id = new ImageData(w, h)
    const top = s.base + Math.max(s.depth, s.rim)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const x = -s.width / 2 + (i + 0.5) * (s.width / w), y = H / 2 - (j + 0.5) * (H / h)
        const v = Math.round((zf(x, y) / top) * 255)
        const out = s.shape === 'round' && Math.hypot(x, y) > s.width / 2
        id.data.set([v, v, v, out ? 0 : 255], (j * w + i) * 4)
      }
    hm.getContext('2d')!.putImageData(id, 0, 0)
  }, [zf, opts, H, s.width, s.base, s.depth, s.rim, s.shape, bad])

  const ref = useStage3D(
    (st) => {
      st.scene.children.forEach((c) => {
        if (c instanceof THREE.HemisphereLight) c.intensity = 0.35
        else if (c instanceof THREE.DirectionalLight) c.intensity = 0.35
      })
      const key = new THREE.DirectionalLight(0xfff4e0, 2.4)
      key.name = 'key'
      st.scene.add(key)
    },
    (st) => {
      const key = st.scene.getObjectByName('key') as THREE.DirectionalLight
      const az = (s.lightAz * Math.PI) / 180, el = (s.lightEl * Math.PI) / 180
      key.position.set(Math.cos(az) * Math.cos(el) * 10, Math.sin(az) * Math.cos(el) * 10, Math.sin(el) * 10)
      let grp = st.scene.getObjectByName('relief') as THREE.Group | undefined
      if (!grp) {
        grp = new THREE.Group()
        grp.name = 'relief'
        st.scene.add(grp)
      }
      st.clear(grp)
      if (!mesh) return
      let geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(mesh, 3))
      geo = mergeVertices(geo, 1e-4)
      geo.computeVertexNormals()
      const k = 6 / Math.max(s.width, H)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd6c7a8, roughness: 0.6, metalness: 0.15 }))
      m.scale.setScalar(k)
      m.position.z = -((s.base + s.depth) / 2) * k
      grp.add(m)
    },
    [mesh, s.lightAz, s.lightEl],
    { camera: [0, -2.2, 7.5], background: '#1f2937', grid: false },
  )

  const exportStl = () => mesh && download(`relief-${s.shape}-${s.width}mm.stl`, new Blob([toBinaryStl(mesh, 'relief')], { type: 'model/stl' }))
  const exportPng = (kind: 'normal' | 'height') => {
    const w = 1024, h = Math.round((1024 * H) / s.width)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    if (kind === 'normal') c.getContext('2d')!.putImageData(new ImageData(normalMap(zf, w, h, opts), w, h), 0, 0)
    else c.getContext('2d')!.drawImage(hmRef.current!, 0, 0, w, h)
    c.toBlob((b) => b && download(`relief-${kind}-map.png`, b), 'image/png')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Source">
          <Seg value={source} onChange={(v) => set({ source: v })} options={[['demo', 'Demo emblem'], ['text', 'Text / monogram'], ['image', 'Photo or logo']]} />
          {source === 'text' && (
            <>
              <label className="k-field">
                <span className="k-label">Text (one line per row)</span>
                <textarea className="k-area" rows={2} value={s.text} onChange={(e) => set({ text: e.target.value })} />
              </label>
              <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={[['Georgia, serif', 'Serif'], ['Arial Black, Arial, sans-serif', 'Heavy sans'], ['Courier New, monospace', 'Typewriter'], ['Brush Script MT, cursive', 'Script']]} />
            </>
          )}
          <FileDrop accept="image/*" onFiles={onFiles} label={name ? `Loaded: ${name} — drop another` : 'Drop a photo or logo (PNG/JPG/SVG)'} />
          <Check label="Invert (dark areas become high)" value={s.invert} onChange={(invert) => set({ invert })} />
          <Slider label="Edge-preserving smoothing" value={s.smooth} onChange={(smooth) => set({ smooth })} min={0} max={6} unit=" px" />
          <Slider label="Soften edges (domed letters)" value={s.soft} onChange={(soft) => set({ soft })} min={0} max={6} unit=" px" />
          <Slider label="Detail (source pixels across)" value={s.res} onChange={(res) => set({ res })} min={80} max={400} step={10} show={(v) => num(v, 0)} />
        </Panel>
        <Panel title="Height curve" actions={<Select label="" value="" onChange={(k: string) => k && set({ curve: CURVES[k] })} options={[['', 'Preset…'], ...Object.keys(CURVES).map((k) => [k, k] as [string, string])]} />}>
          <CurveEditor pts={s.curve} onChange={(curve) => set({ curve })} hist={field.hist} />
          <p className="muted" style={{ fontSize: 13 }}>Drag the points: input brightness (x) → relief height (y). Flatten a range to make terraces; lift the lows to keep thin backgrounds.</p>
        </Panel>
        <Panel title="Shape & size">
          <Row>
            {Object.keys(PRESETS).map((k) => (
              <Btn key={k} onClick={() => set(PRESETS[k])}>{k}</Btn>
            ))}
          </Row>
          <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['round', 'Round medallion / coin'], ['rect', 'Rectangular plaque']]} />
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['emboss', 'Emboss (raised)'], ['engrave', 'Engrave (cut in)']]} />
          <Row>
            <Num label={s.shape === 'round' ? 'Diameter' : 'Width'} value={s.width} onChange={(width) => set({ width })} unit="mm" min={5} max={400} />
            {s.shape === 'rect' && <Num label="Height" value={s.height} onChange={(height) => set({ height })} unit="mm" min={5} max={400} />}
            <Num label="Base" value={s.base} onChange={(base) => set({ base })} unit="mm" min={0.2} max={30} />
            <Num label="Relief depth" value={s.depth} onChange={(depth) => set({ depth })} unit="mm" min={0} max={30} />
            <Num label="Border width" value={s.border} onChange={(border) => set({ border })} unit="mm" min={0} max={50} />
            <Num label="Border height" value={s.rim} onChange={(rim) => set({ rim })} unit="mm" min={0} max={30} hint="above the base" />
            <Num label="Mesh cell" value={s.cell} onChange={(cell) => set({ cell })} unit="mm" min={0.08} max={2} hint="smaller = finer, bigger STL" />
          </Row>
          {bad && <Note tone="err">Check the sizes: the border must be narrower than half the plate and the base thicker than 0.</Note>}
          <Btn kind="ghost" onClick={reset}>Reset all</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size" value={`${num(s.width, 1)} × ${num(H, 1)} mm`} sub={`${num(s.base + Math.max(s.depth, s.rim), 1)} mm max thickness`} />
          <Stat label="Volume" value={`${num(vol / 1000, 2)} cm³`} sub={`≈ ${num((vol / 1000) * 1.24, 1)} g PLA`} />
          <Stat label="Triangles" value={num(tris, 0)} sub={`STL ≈ ${num((84 + tris * 50) / 1048576, 1)} MB`} tone="accent" />
        </Stats>
        <Panel title="3D preview (front-lit)" actions={<Btn kind="primary" onClick={exportStl} disabled={!mesh}>⬇ STL</Btn>}>
          <View3D refEl={ref} height={430} />
          <Row>
            <Slider label="Light direction" value={s.lightAz} onChange={(lightAz) => set({ lightAz })} min={0} max={360} unit="°" show={(v) => num(v, 0)} />
            <Slider label="Light elevation (low = raking)" value={s.lightEl} onChange={(lightEl) => set({ lightEl })} min={5} max={90} unit="°" show={(v) => num(v, 0)} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit. A low raking light shows the relief the way it will look on a wall or in the hand.</p>
        </Panel>
        <Panel title="Maps" actions={<><Btn onClick={() => exportPng('normal')} disabled={bad}>⬇ Normal map PNG</Btn><Btn onClick={() => exportPng('height')} disabled={bad}>⬇ Height map PNG</Btn></>}>
          <Row>
            <figure style={{ margin: 0, flex: 1, minWidth: 140 }}>
              <canvas ref={hmRef} style={{ width: '100%', background: 'var(--panel2)', borderRadius: 8 }} />
              <figcaption className="muted">Height map (white = high)</figcaption>
            </figure>
            <figure style={{ margin: 0, flex: 1, minWidth: 140 }}>
              <canvas ref={nmRef} style={{ width: '100%', background: 'var(--panel2)', borderRadius: 8 }} />
              <figcaption className="muted">Normal map (OpenGL, +Y up)</figcaption>
            </figure>
          </Row>
          <Note>Normal maps let game engines and 3D apps fake this relief on a flat surface. The exported PNG is 1024 px wide; the STL is in millimetres with the back flat on the print bed.</Note>
        </Panel>
      </div>
    </Split>
  )
}
