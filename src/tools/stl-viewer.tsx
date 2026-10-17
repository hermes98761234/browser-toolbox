import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, fmt, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { measure, parseStl, sampleCube, sampleTorus, sampleVase, toBinaryStl } from './lib/stl-viewer'

const MATERIALS: [string, number][] = [['PLA', 1.24], ['PETG', 1.27], ['ABS', 1.04], ['ASA', 1.07], ['TPU', 1.21], ['Nylon', 1.14], ['Standard resin', 1.12]]
const SAMPLES = { vase: ['Twisted vase', sampleVase], torus: ['Torus', () => sampleTorus()], cube: ['20 mm calibration cube', () => sampleCube(20)] } as const
type SampleKey = keyof typeof SAMPLES

const DEF = { unit: 1, color: '#38bdf8', wire: false, bbox: true, material: 'PLA', infill: 20, walls: 1.2, price: 22, measure: false }

export default function StlViewer() {
  const [s, set, reset] = useToolState('stl-viewer', DEF)
  const [model, setModel] = useState<{ pos: Float32Array; name: string; file: string; bytes: number }>(() => ({ pos: sampleVase(), name: 'Twisted vase', file: 'sample', bytes: 0 }))
  const [err, setErr] = useState('')
  const [pts, setPts] = useState<[number, number, number][]>([])
  const st = useMemo(() => measure(model.pos), [model])
  const k = s.unit // file units → mm
  const meshRef = useRef<THREE.Mesh | null>(null)
  const measureOn = useRef(false)
  useEffect(() => {
    measureOn.current = s.measure
  }, [s.measure])

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      const el = stage.renderer.domElement
      let dx = 0, dy = 0
      const down = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY }
      const up = (e: PointerEvent) => {
        if (!measureOn.current || Math.hypot(e.clientX - dx, e.clientY - dy) > 4 || !meshRef.current) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const hit = ray.intersectObject(meshRef.current)[0]
        if (!hit) return
        const p = meshRef.current.worldToLocal(hit.point.clone())
        setPts((old) => (old.length >= 2 ? [[p.x, p.y, p.z]] : [...old, [p.x, p.y, p.z]]))
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(model.pos, 3))
      g.computeVertexNormals()
      const maxDim = Math.max(...st.size) || 1
      const sc = 8 / maxDim
      // STL is Z-up; three.js is Y-up. Centre on X/Y, rest on the grid.
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2
      holder.scale.setScalar(sc)
      holder.position.set(0, 0, 0)
      const inner = new THREE.Group()
      inner.position.set(-(st.min[0] + st.max[0]) / 2, -(st.min[1] + st.max[1]) / 2, -st.min[2])
      holder.add(inner)
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.45, metalness: 0.1, wireframe: s.wire, side: THREE.DoubleSide }))
      inner.add(mesh)
      meshRef.current = mesh
      if (s.bbox) {
        const box = new THREE.Box3(new THREE.Vector3(...st.min), new THREE.Vector3(...st.max))
        inner.add(new THREE.Box3Helper(box, new THREE.Color('#f59e0b')))
        const L = (txt: string, x: number, y: number, z: number) => {
          const t = label(txt, '#fbbf24', 0.45 / sc)
          t.position.set(x, y, z)
          inner.add(t)
        }
        const [a, b] = [st.min, st.max]
        L(`X ${fmt(st.size[0] * k, 4)} mm`, (a[0] + b[0]) / 2, a[1] - 0.06 * maxDim, a[2])
        L(`Y ${fmt(st.size[1] * k, 4)} mm`, b[0] + 0.12 * maxDim, (a[1] + b[1]) / 2, a[2])
        L(`Z ${fmt(st.size[2] * k, 4)} mm`, b[0] + 0.08 * maxDim, a[1], (a[2] + b[2]) / 2)
      }
      if (pts.length) {
        const mat = new THREE.MeshBasicMaterial({ color: '#f43f5e', depthTest: false })
        for (const p of pts) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.08 / sc, 16, 12), mat)
          m.position.set(...p)
          m.renderOrder = 10
          inner.add(m)
        }
        if (pts.length === 2) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: '#f43f5e', depthTest: false }))
          line.renderOrder = 10
          inner.add(line)
          const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]) * k
          const t = label(`${fmt(d, 4)} mm`, '#fda4af', 0.5 / sc)
          t.position.set((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, (pts[0][2] + pts[1][2]) / 2 + 0.05 * maxDim)
          inner.add(t)
        }
      }
      root.add(holder)
      stage.controls.target.set(0, (st.size[2] * sc) / 2, 0)
    },
    [model, st, s.color, s.wire, s.bbox, k, pts],
    { camera: [10, 9, 15], target: [0, 4, 0] },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const m = parseStl(await f.arrayBuffer())
      setModel({ pos: m.pos, name: m.name || f.name, file: f.name, bytes: f.size })
      setPts([])
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const loadSample = (key: SampleKey) => {
    const [name, gen] = SAMPLES[key]
    setModel({ pos: gen(), name, file: 'sample', bytes: 0 })
    setPts([])
  }

  const volCm3 = (st.volume * k ** 3) / 1000
  const areaCm2 = (st.area * k ** 2) / 100
  const dens = MATERIALS.find((m) => m[0] === s.material)?.[1] ?? 1.24
  // Rough print estimate: solid shell (area × wall thickness) + infill share of the remaining volume.
  const shell = Math.min(volCm3, (areaCm2 * s.walls) / 10)
  const printed = shell + Math.max(0, volCm3 - shell) * (s.infill / 100)
  const grams = printed * dens
  const filamentM = grams / dens / (Math.PI * 0.0875 ** 2) / 100
  const watertight = st.openEdges === 0 && st.nonManifold === 0
  const dist = pts.length === 2 ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]) * k : NaN

  return (
    <div>
      <Stats>
        <Stat label="Dimensions (X × Y × Z)" value={`${st.size.map((v) => fmt(v * k, 4)).join(' × ')} mm`} sub={`${st.size.map((v) => fmt((v * k) / 25.4, 3)).join(' × ')} in`} tone="accent" />
        <Stat label="Volume" value={`${fmt(volCm3, 5)} cm³`} sub={`${fmt(st.volume * k ** 3, 6)} mm³`} />
        <Stat label="Surface area" value={`${fmt(areaCm2, 5)} cm²`} />
        <Stat label="Triangles" value={st.triangles.toLocaleString('en-US')} sub={watertight ? 'watertight ✓' : `${st.openEdges} open edges`} tone={watertight ? 'good' : 'bad'} />
      </Stats>
      <Split wide="left">
        <Panel title={<>Model: <span style={{ color: 'var(--accent)' }}>{model.name}</span></>} actions={<Check label="📏 Measure" value={s.measure} onChange={(m) => { set({ measure: m }); setPts([]) }} />}>
          <View3D refEl={ref} height={460} />
          {s.measure ? (
            <Note tone={pts.length === 2 ? 'ok' : 'info'}>
              {pts.length === 0 && 'Click a point on the model to start a measurement.'}
              {pts.length === 1 && 'Now click a second point.'}
              {pts.length === 2 && <>Distance: <b>{fmt(dist, 5)} mm</b> (ΔX {fmt(Math.abs(pts[1][0] - pts[0][0]) * k, 4)}, ΔY {fmt(Math.abs(pts[1][1] - pts[0][1]) * k, 4)}, ΔZ {fmt(Math.abs(pts[1][2] - pts[0][2]) * k, 4)}). Click again to start over.</>}
            </Note>
          ) : <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, right-drag to pan, scroll to zoom. Enable Measure to pick two points on the surface.</p>}
        </Panel>
        <div>
          <Panel title="Open STL" actions={<Btn kind="ghost" onClick={reset}>Reset view</Btn>}>
            <FileDrop accept=".stl,model/stl,application/sla" onFiles={(fs) => void load(fs[0])} label="Drop an .stl file (binary or ASCII)" />
            {err && <Note tone="err">{err}</Note>}
            <Row>
              <Select label="Sample model" value={'' as string} onChange={(v) => v && loadSample(v as SampleKey)} options={[['', 'Choose…'], ...Object.entries(SAMPLES).map(([k2, v]) => [k2, v[0]] as [string, string])]} />
              <Select label="File units" value={s.unit} onChange={(unit) => set({ unit })} options={[[1, 'millimetres'], [10, 'centimetres'], [25.4, 'inches'], [1000, 'metres']]} />
            </Row>
            <Row>
              <label className="k-field" style={{ flex: '0 0 auto' }}>
                <span className="k-label">Colour</span>
                <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 56, height: 36, border: 'none', background: 'none' }} />
              </label>
              <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
              <Check label="Bounding box" value={s.bbox} onChange={(bbox) => set({ bbox })} />
            </Row>
            <Btn onClick={() => download(`${model.name.replace(/\W+/g, '-') || 'model'}.stl`, new Blob([toBinaryStl(model.pos, model.name)]), 'model/stl')}>⬇ Save as binary STL</Btn>
            <p className="muted" style={{ fontSize: 12 }}>{model.file === 'sample' ? 'Built-in sample' : `${model.file} · ${fmt(model.bytes / 1024, 4)} KB`}. Files are read locally and never uploaded.</p>
          </Panel>
          <Panel title="Print estimate">
            <Row>
              <Select label="Material" value={s.material} onChange={(material) => set({ material })} options={MATERIALS.map((m) => [m[0], `${m[0]} (${m[1]} g/cm³)`] as [string, string])} />
              <Num label="Infill" value={s.infill} unit="%" min={0} max={100} onChange={(infill) => set({ infill })} />
            </Row>
            <Row>
              <Num label="Shell thickness" value={s.walls} unit="mm" min={0} step={0.1} onChange={(walls) => set({ walls })} />
              <Num label="Filament price" value={s.price} unit="/kg" min={0} onChange={(price) => set({ price })} />
            </Row>
            <Table
              head={['Estimate', 'Value']}
              rows={[
                ['Solid weight (100 %)', `${fmt(volCm3 * dens, 4)} g`],
                ['Printed weight', `${fmt(grams, 4)} g`],
                ['Filament (1.75 mm)', `${fmt(filamentM, 3)} m`],
                ['Material cost', fmt((grams / 1000) * s.price, 3)],
              ]}
            />
          </Panel>
          <Panel title="Mesh check">
            <Table
              head={['Check', 'Result']}
              rows={[
                ['Open (boundary) edges', <b key="o" style={{ color: st.openEdges ? 'var(--err)' : 'var(--ok)' }}>{st.openEdges}</b>],
                ['Non-manifold edges', <b key="n" style={{ color: st.nonManifold ? 'var(--err)' : 'var(--ok)' }}>{st.nonManifold}</b>],
                ['Centre of mass', `${st.centroid.map((v) => fmt(v * k, 4)).join(', ')} mm`],
                ['Bounding box min', `${st.min.map((v) => fmt(v * k, 4)).join(', ')}`],
                ['Bounding box max', `${st.max.map((v) => fmt(v * k, 4)).join(', ')}`],
              ]}
            />
            {!watertight && <Note tone="warn">The mesh is not closed, so the volume (signed tetrahedra) is approximate. Repair it before slicing.</Note>}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
