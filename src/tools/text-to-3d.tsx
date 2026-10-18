import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, download, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { toBinaryStl } from './lib/stl-viewer'
import { maskToShapes, meshVolume, type ShapeRings } from './lib/text-to-3d'

const FONTS: [string, string][] = [
  ['Arial Black, Arial, sans-serif', 'Arial Black'],
  ['Impact, Haettenschweiler, sans-serif', 'Impact'],
  ['Verdana, sans-serif', 'Verdana'],
  ['Trebuchet MS, sans-serif', 'Trebuchet MS'],
  ['Georgia, serif', 'Georgia'],
  ['Times New Roman, serif', 'Times New Roman'],
  ['Courier New, monospace', 'Courier New'],
  ['system-ui, sans-serif', 'System UI'],
  ['cursive', 'Cursive'],
]

type Plate = 'none' | 'rect' | 'round'
const DEF = {
  text: 'MAKE\nthings',
  font: FONTS[0][0],
  bold: true,
  italic: false,
  height: 20, // cap height, mm
  depth: 6,
  spacing: 4, // % of em
  lineGap: 115, // % of em
  align: 'center' as 'left' | 'center' | 'right',
  bevel: true,
  bevelSize: 0.6,
  plate: 'round' as Plate,
  margin: 5,
  plateT: 3,
  hole: false,
  color: '#f97316',
  plateColor: '#334155',
}

const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Desk sign', { text: 'MAKE\nthings', height: 20, depth: 6, plate: 'round', hole: false, align: 'center' }],
  ['Keychain', { text: 'Alex', height: 12, depth: 3, plate: 'round', margin: 3, plateT: 2.4, hole: true, bold: true }],
  ['Free letters', { text: 'HELLO', height: 30, depth: 8, plate: 'none', hole: false }],
  ['Door plate', { text: 'Room 12', height: 16, depth: 2, plate: 'rect', margin: 8, plateT: 4, hole: false, font: FONTS[4][0] }],
]

const PX = 200 // rendering font size in px

function traceText(s: typeof DEF): { shapes: ShapeRings[]; mmPerPx: number } {
  const lines = s.text.split('\n')
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${PX}px ${s.font}`
  ctx.font = font
  const capH = ctx.measureText('H').actualBoundingBoxAscent || PX * 0.72
  const sp = (s.spacing / 100) * PX
  const widths = lines.map((l) => [...l].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + sp * Math.max(0, [...l].length - 1))
  const pad = 20
  const lh = (s.lineGap / 100) * PX
  const W = Math.min(8000, Math.ceil(Math.max(1, ...widths) + 2 * pad))
  const H = Math.ceil(lines.length * lh + PX * 0.4 + 2 * pad)
  c.width = W
  c.height = H
  ctx.font = font
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((l, i) => {
    let x = pad + (s.align === 'left' ? 0 : s.align === 'center' ? (Math.max(...widths) - widths[i]) / 2 : Math.max(...widths) - widths[i])
    const y = pad + PX * 0.95 + i * lh
    for (const ch of l) {
      ctx.fillText(ch, x, y)
      x += ctx.measureText(ch).width + sp
    }
  })
  const d = ctx.getImageData(0, 0, W, H).data
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] >= 128 ? 1 : 0
  return { shapes: maskToShapes(mask, W, H), mmPerPx: s.height / capH }
}

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Shape {
  const sh = new THREE.Shape()
  r = Math.max(0.01, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2))
  sh.moveTo(x0 + r, y0)
  sh.lineTo(x1 - r, y0)
  sh.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
  sh.lineTo(x1, y1 - r)
  sh.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
  sh.lineTo(x0 + r, y1)
  sh.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
  sh.lineTo(x0, y0 + r)
  sh.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  return sh
}

interface Built { size: [number, number, number]; tris: number; volume: number; letters: number }

export default function TextTo3D() {
  const [s, set, reset] = useToolState('text-to-3d', DEF)
  const traced = useMemo(() => traceText(s), [s])
  const model = useRef<THREE.Group | null>(null)
  const [b, setInfo] = useState<Built>({ size: [0, 0, 0], tris: 0, volume: 0, letters: 0 })

  const build = (): THREE.Group => {
    const g = new THREE.Group()
    const k = traced.mmPerPx
    const shapes = traced.shapes.map((r) => {
      const sh = new THREE.Shape(r.outer.map(([x, y]) => new THREE.Vector2(x * k, -y * k)))
      sh.holes = r.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * k, -y * k))))
      return sh
    })
    const bt = s.bevel ? Math.min(s.bevelSize, s.depth / 3) : 0
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: Math.max(0.2, s.depth - 2 * bt), bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt * 0.8, bevelOffset: 0, bevelSegments: 2, curveSegments: 1,
    })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2
    const base = s.plate === 'none' ? 0 : s.plateT
    geo.translate(-cx, -cy, base + bt)
    const letters = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.45, metalness: 0.05 }))
    g.add(letters)
    if (s.plate !== 'none' && shapes.length) {
      const w = bb.max.x - bb.min.x
      const h = bb.max.y - bb.min.y
      const holeD = Math.max(3, Math.min(6, h * 0.35))
      const extra = s.hole ? holeD + s.margin : 0
      const x0 = -w / 2 - s.margin - extra
      const x1 = w / 2 + s.margin
      const y0 = -h / 2 - s.margin
      const y1 = h / 2 + s.margin
      const sh = s.plate === 'round' ? roundRect(x0, y0, x1, y1, Math.min(s.margin * 1.6, (y1 - y0) / 2)) : roundRect(x0, y0, x1, y1, 0.01)
      if (s.hole) {
        const hp = new THREE.Path()
        hp.absarc(x0 + s.margin * 0.8 + holeD / 2, 0, holeD / 2, 0, Math.PI * 2, true)
        sh.holes.push(hp)
      }
      const pg = new THREE.ExtrudeGeometry(sh, { depth: s.plateT, bevelEnabled: false, curveSegments: 24 })
      g.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: s.plateColor, roughness: 0.7 })))
    }
    return g
  }

  const ref = useStage3D(
    (st) => {
      const holder = new THREE.Group()
      holder.name = 'holder'
      st.scene.add(holder)
    },
    (st) => {
      const holder = st.scene.getObjectByName('holder')!
      st.clear(holder)
      const g = build()
      model.current = g
      const box = new THREE.Box3().setFromObject(g)
      const size = box.getSize(new THREE.Vector3())
      let tris = 0
      let volume = 0
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          const p = m.geometry.attributes.position.array
          tris += p.length / 9
          volume += meshVolume(p)
        }
      })
      setInfo({ size: [size.x, size.y, size.z], tris, volume, letters: traced.shapes.length })
      const fit = 12 / Math.max(size.x, size.y, 1)
      const view = new THREE.Group()
      view.rotation.x = -Math.PI / 2
      view.scale.setScalar(fit)
      view.add(g)
      holder.add(view)
    },
    [traced, s.depth, s.bevel, s.bevelSize, s.plate, s.margin, s.plateT, s.hole, s.color, s.plateColor],
    { camera: [0, 9, 10], background: '#0f172a' },
  )

  const exportStl = () => {
    const g = model.current
    if (!g) return
    const parts: Float32Array[] = []
    g.updateMatrixWorld(true)
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix)
        parts.push(geo.attributes.position.array as Float32Array)
        geo.dispose()
      }
    })
    const all = new Float32Array(parts.reduce((a, p) => a + p.length, 0))
    let o = 0
    for (const p of parts) {
      all.set(p, o)
      o += p.length
    }
    const name = (s.text.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'text').toLowerCase()
    download(`${name}.stl`, new Blob([toBinaryStl(all, `text ${name}`)], { type: 'model/stl' }), 'model/stl')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Text" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Area value={s.text} onChange={(text) => set({ text: text.slice(0, 120) })} rows={3} placeholder="Type your text (Enter = new line)" />
          <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
          <Check label="Bold" value={s.bold} onChange={(bold) => set({ bold })} />
          <Check label="Italic" value={s.italic} onChange={(italic) => set({ italic })} />
          <div><Seg value={s.align} onChange={(align) => set({ align })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} /></div>
          <Slider label="Letter spacing" value={s.spacing} onChange={(spacing) => set({ spacing })} min={-10} max={40} unit="% em" />
          <Slider label="Line spacing" value={s.lineGap} onChange={(lineGap) => set({ lineGap })} min={80} max={180} unit="%" />
        </Panel>
        <Panel title="Extrusion">
          <Slider label="Cap height" value={s.height} onChange={(height) => set({ height })} min={5} max={80} unit=" mm" />
          <Slider label="Letter depth" value={s.depth} onChange={(depth) => set({ depth })} min={0.6} max={30} step={0.2} unit=" mm" />
          <Check label="Bevel edges" value={s.bevel} onChange={(bevel) => set({ bevel })} />
          {s.bevel && <Slider label="Bevel size" value={s.bevelSize} onChange={(bevelSize) => set({ bevelSize })} min={0.2} max={2} step={0.1} unit=" mm" />}
          <Row>
            <label className="k-field"><span className="k-label">Letters</span><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Plate</span><input type="color" value={s.plateColor} onChange={(e) => set({ plateColor: e.target.value })} /></label>
          </Row>
        </Panel>
        <Panel title="Base plate">
          <Seg value={s.plate} onChange={(plate) => set({ plate })} options={[['none', 'None'], ['rect', 'Rectangle'], ['round', 'Rounded']]} />
          {s.plate !== 'none' && (
            <>
              <Slider label="Margin" value={s.margin} onChange={(margin) => set({ margin })} min={1} max={20} step={0.5} unit=" mm" />
              <Slider label="Plate thickness" value={s.plateT} onChange={(plateT) => set({ plateT })} min={0.8} max={10} step={0.2} unit=" mm" />
              <Check label="Keyring hole" value={s.hole} onChange={(hole) => set({ hole })} />
            </>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size (W × D × H)" value={`${num(b.size[0], 1)} × ${num(b.size[1], 1)} × ${num(b.size[2], 1)}`} sub="mm" />
          <Stat label="Volume" value={`${num(b.volume / 1000, 2)} cm³`} sub={`≈ ${num((b.volume / 1000) * 1.24, 1)} g PLA if solid`} />
          <Stat label="Mesh" value={num(b.tris, 0)} sub={`triangles · ${b.letters} outline${b.letters === 1 ? '' : 's'}`} />
        </Stats>
        <Panel title="Preview" actions={<Btn kind="primary" onClick={exportStl} disabled={!traced.shapes.length}>⬇ STL</Btn>}>
          <View3D refEl={ref} height={460} />
          {!traced.shapes.length && <Note tone="warn">Nothing to extrude: type some text.</Note>}
        </Panel>
        <Note>
          The text is drawn with a font installed on your device at high resolution, traced into outlines (with holes for letters like A, B, O) and extruded. The STL is in millimetres with Z up, ready for a slicer; letters sit on the plate, so print it as one part or use a filament change at the plate height ({num(s.plate === 'none' ? 0 : s.plateT, 1)} mm) for two colours. Thin script fonts below ~8 mm cap height may print poorly.
        </Note>
      </div>
    </Split>
  )
}
