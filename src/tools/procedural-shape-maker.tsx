import { useMemo } from 'react'
import { Btn, Check, download, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { THREE, useStage3D, View3D } from '../kit/three'
import { bounds, gear, gearDims, signedVolume, spring, springLength, surfaceArea, toStl, vase, type GearParams, type SpringParams, type VaseParams } from './lib/procedural-shape-maker'

type Mode = 'vase' | 'gear' | 'spring'

interface State {
  mode: Mode
  v: VaseParams
  g: GearParams
  s: SpringParams
  color: string
  wire: boolean
  spin: boolean
}

const VASES: [string, VaseParams][] = [
  ['Amphora', { height: 140, baseR: 28, bellyR: 48, bellyAt: 0.38, neckR: 18, neckAt: 0.82, lipR: 26, sides: 0, twist: 0, ripples: 0, rippleAmp: 0, wall: 2, segments: 96, rows: 60 }],
  ['Twisted hexagon', { height: 120, baseR: 34, bellyR: 42, bellyAt: 0.45, neckR: 32, neckAt: 0.8, lipR: 38, sides: 6, twist: 120, ripples: 0, rippleAmp: 0, wall: 2, segments: 120, rows: 60 }],
  ['Ripple bowl', { height: 60, baseR: 26, bellyR: 52, bellyAt: 0.55, neckR: 60, neckAt: 0.85, lipR: 64, sides: 0, twist: 40, ripples: 12, rippleAmp: 0.06, wall: 2, segments: 144, rows: 40 }],
  ['Tall bottle', { height: 180, baseR: 30, bellyR: 32, bellyAt: 0.45, neckR: 10, neckAt: 0.8, lipR: 12, sides: 0, twist: 0, ripples: 0, rippleAmp: 0, wall: 1.6, segments: 96, rows: 70 }],
  ['Star column', { height: 120, baseR: 30, bellyR: 30, bellyAt: 0.4, neckR: 30, neckAt: 0.8, lipR: 30, sides: 0, twist: 180, ripples: 5, rippleAmp: 0.2, wall: 0, segments: 160, rows: 60 }],
]
const GEARS: [string, GearParams][] = [
  ['20T · m2', { teeth: 20, module: 2, pressureAngle: 20, thickness: 6, bore: 5 }],
  ['12T pinion · m2', { teeth: 12, module: 2, pressureAngle: 20, thickness: 8, bore: 5 }],
  ['40T · m1.5', { teeth: 40, module: 1.5, pressureAngle: 20, thickness: 5, bore: 8 }],
  ['Clock wheel 60T · m0.8', { teeth: 60, module: 0.8, pressureAngle: 20, thickness: 2, bore: 3 }],
]
const SPRINGS: [string, SpringParams][] = [
  ['Compression spring', { coilR: 12, wireR: 1.5, pitch: 6, turns: 8, segments: 16 }],
  ['Tight coil', { coilR: 10, wireR: 2, pitch: 4.2, turns: 10, segments: 16 }],
  ['Open helix', { coilR: 25, wireR: 3, pitch: 22, turns: 4, segments: 20 }],
]

const DEF: State = { mode: 'vase', v: VASES[0][1], g: GEARS[0][1], s: SPRINGS[0][1], color: '#38bdf8', wire: false, spin: true }

export default function ProceduralShapeMaker() {
  const [st, set, reset] = useToolState('procedural-shape-maker', DEF)
  const { mode, v, g, s } = st
  const mesh = useMemo(() => (mode === 'vase' ? vase(v) : mode === 'gear' ? gear(g) : spring(s)), [mode, v, g, s])
  const info = useMemo(() => {
    const b = bounds(mesh)
    return {
      tris: mesh.length / 9,
      vol: signedVolume(mesh) / 1000,
      area: surfaceArea(mesh) / 100,
      size: [b.max[0] - b.min[0], b.max[2] - b.min[2], b.max[1] - b.min[1]],
    }
  }, [mesh])

  const ref = useStage3D(
    (stage) => {
      const grp = new THREE.Group()
      grp.name = 'model'
      stage.scene.add(grp)
      stage.onFrame((_t, dt) => {
        if (grp.userData.spin) grp.rotation.y += dt * 0.4
      })
    },
    (stage) => {
      const grp = stage.scene.getObjectByName('model') as THREE.Group
      stage.clear(grp)
      grp.userData.spin = st.spin
      let geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(mesh.slice(), 3))
      if (mode !== 'gear') geo = mergeVertices(geo, 1e-4)
      geo.computeVertexNormals()
      geo.computeBoundingBox()
      const bb = geo.boundingBox!
      const size = bb.getSize(new THREE.Vector3())
      const k = 6 / Math.max(size.x, size.y, size.z, 1)
      const mat = new THREE.MeshStandardMaterial({ color: st.color, metalness: mode === 'spring' ? 0.6 : 0.15, roughness: 0.45, wireframe: st.wire, flatShading: mode === 'gear' })
      const m = new THREE.Mesh(geo, mat)
      m.scale.setScalar(k)
      m.position.set(-((bb.min.x + bb.max.x) / 2) * k, -bb.min.y * k, -((bb.min.z + bb.max.z) / 2) * k)
      grp.add(m)
    },
    [mesh, st.color, st.wire, st.spin, mode],
    { camera: [7, 6, 9], target: [0, 2.5, 0] },
  )

  const setV = (p: Partial<VaseParams>) => set({ v: { ...v, ...p } })
  const setG = (p: Partial<GearParams>) => set({ g: { ...g, ...p } })
  const setS = (p: Partial<SpringParams>) => set({ s: { ...s, ...p } })
  const mm = (x: number) => `${num(x, 1)}`
  const dims = gearDims(g)

  const exportStl = () => download(`${mode}.stl`, new Blob([toStl(mesh, mode)], { type: 'model/stl' }), 'model/stl')
  const exportPng = () => {
    const c = ref.current?.querySelector('canvas')
    if (c) c.toBlob((b) => b && download(`${mode}.png`, b, 'image/png'))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Shape" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={mode} onChange={(m) => set({ mode: m })} options={[['vase', '🏺 Vase'], ['gear', '⚙️ Gear'], ['spring', '🌀 Spring']]} />
          <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>Presets</p>
          <Row>
            {mode === 'vase' && VASES.map(([n, p]) => <Btn key={n} onClick={() => set({ v: p })}>{n}</Btn>)}
            {mode === 'gear' && GEARS.map(([n, p]) => <Btn key={n} onClick={() => set({ g: p })}>{n}</Btn>)}
            {mode === 'spring' && SPRINGS.map(([n, p]) => <Btn key={n} onClick={() => set({ s: p })}>{n}</Btn>)}
          </Row>
        </Panel>
        {mode === 'vase' && (
          <Panel title="Vase profile (mm)">
            <Slider label="Height" value={v.height} onChange={(height) => setV({ height })} min={20} max={300} unit=" mm" />
            <Slider label="Base radius" value={v.baseR} onChange={(baseR) => setV({ baseR })} min={5} max={100} unit=" mm" />
            <Slider label="Belly radius" value={v.bellyR} onChange={(bellyR) => setV({ bellyR })} min={5} max={120} unit=" mm" />
            <Slider label="Belly height" value={v.bellyAt} onChange={(bellyAt) => setV({ bellyAt: Math.min(bellyAt, v.neckAt - 0.05) })} min={0.1} max={0.8} step={0.01} show={(x) => `${Math.round(x * 100)}%`} />
            <Slider label="Neck radius" value={v.neckR} onChange={(neckR) => setV({ neckR })} min={3} max={120} unit=" mm" />
            <Slider label="Neck height" value={v.neckAt} onChange={(neckAt) => setV({ neckAt: Math.max(neckAt, v.bellyAt + 0.05) })} min={0.3} max={0.95} step={0.01} show={(x) => `${Math.round(x * 100)}%`} />
            <Slider label="Lip radius" value={v.lipR} onChange={(lipR) => setV({ lipR })} min={3} max={120} unit=" mm" />
            <Slider label="Cross-section" value={v.sides} onChange={(sides) => setV({ sides: sides < 3 ? 0 : sides })} min={2} max={12} show={(x) => (x < 3 ? 'round' : `${x} sides`)} />
            <Slider label="Twist" value={v.twist} onChange={(twist) => setV({ twist })} min={-360} max={360} step={5} unit="°" />
            <Slider label="Ripples" value={v.ripples} onChange={(ripples) => setV({ ripples })} min={0} max={24} />
            <Slider label="Ripple depth" value={v.rippleAmp} onChange={(rippleAmp) => setV({ rippleAmp })} min={0} max={0.3} step={0.01} show={(x) => `${Math.round(x * 100)}%`} />
            <Slider label="Wall thickness" value={v.wall} onChange={(wall) => setV({ wall })} min={0} max={6} step={0.2} show={(x) => (x === 0 ? 'solid' : `${num(x, 1)} mm`)} />
            <Slider label="Smoothness" value={v.segments} onChange={(segments) => setV({ segments, rows: Math.round(segments * 0.5) })} min={24} max={240} step={8} show={(x) => `${x} segments`} />
          </Panel>
        )}
        {mode === 'gear' && (
          <Panel title="Spur gear (involute)">
            <Slider label="Teeth" value={g.teeth} onChange={(teeth) => setG({ teeth })} min={6} max={120} />
            <Slider label="Module" value={g.module} onChange={(module) => setG({ module })} min={0.5} max={6} step={0.1} unit=" mm" />
            <Slider label="Pressure angle" value={g.pressureAngle} onChange={(pressureAngle) => setG({ pressureAngle })} min={14.5} max={25} step={0.5} unit="°" />
            <Slider label="Thickness" value={g.thickness} onChange={(thickness) => setG({ thickness })} min={1} max={40} step={0.5} unit=" mm" />
            <Slider label="Bore diameter" value={g.bore} onChange={(bore) => setG({ bore: Math.min(bore, dims.rootD - 2) })} min={0} max={60} step={0.5} unit=" mm" />
            <Table head={['Figure', 'mm']} rows={[
              ['Pitch diameter (m·z)', mm(dims.pitchD)],
              ['Tip (outside) diameter', mm(dims.tipD)],
              ['Root diameter', mm(dims.rootD)],
              ['Base circle diameter', mm(dims.baseD)],
              ['Circular pitch (π·m)', mm(dims.circularPitch)],
              ['Centre distance to a 2nd gear of the same z', mm(dims.pitchD)],
            ]} />
            <Note>Two gears mesh when they share the same module and pressure angle. Centre distance = m·(z₁+z₂)/2.</Note>
          </Panel>
        )}
        {mode === 'spring' && (
          <Panel title="Helical spring">
            <Slider label="Coil radius" value={s.coilR} onChange={(coilR) => setS({ coilR: Math.max(coilR, s.wireR * 1.5) })} min={3} max={60} step={0.5} unit=" mm" />
            <Slider label="Wire radius" value={s.wireR} onChange={(wireR) => setS({ wireR: Math.min(wireR, s.coilR / 1.5), pitch: Math.max(s.pitch, wireR * 2.1) })} min={0.4} max={8} step={0.1} unit=" mm" />
            <Slider label="Pitch" value={s.pitch} onChange={(pitch) => setS({ pitch: Math.max(pitch, s.wireR * 2.1) })} min={1} max={60} step={0.5} unit=" mm" />
            <Slider label="Turns" value={s.turns} onChange={(turns) => setS({ turns })} min={0.5} max={30} step={0.5} />
            <Slider label="Tube smoothness" value={s.segments} onChange={(segments) => setS({ segments })} min={6} max={32} />
            <Note>Wire length ≈ {num(springLength(s), 0)} mm. Pitch is kept above the wire diameter so coils never intersect.</Note>
          </Panel>
        )}
      </div>
      <div>
        <Panel
          title="Preview"
          actions={
            <>
              <input type="color" value={st.color} onChange={(e) => set({ color: e.target.value })} aria-label="Colour" style={{ width: 36, height: 30, border: 0, background: 'none' }} />
              <Btn kind="primary" onClick={exportStl}>⬇ STL</Btn>
              <Btn onClick={exportPng}>⬇ PNG</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={460} />
          <Row>
            <Check label="Wireframe" value={st.wire} onChange={(wire) => set({ wire })} />
            <Check label="Auto-rotate" value={st.spin} onChange={(spin) => set({ spin })} />
          </Row>
        </Panel>
        <Stats>
          <Stat label="Size W×D×H" value={`${info.size.map((x) => num(x, 0)).join('×')}`} sub="mm" />
          <Stat label="Volume" value={`${num(info.vol, 1)} cm³`} sub={`≈ ${num(info.vol * 1.24, 0)} g PLA at 100% infill`} tone="accent" />
          <Stat label="Surface" value={`${num(info.area, 0)} cm²`} />
          <Stat label="Triangles" value={num(info.tris, 0)} sub={`STL ≈ ${num((84 + info.tris * 50) / 1024, 0)} KB`} />
        </Stats>
        <Note tone="ok">Meshes are closed and outward-facing, so the STL slices directly. Export uses millimetres with Z up.</Note>
      </div>
    </Split>
  )
}
