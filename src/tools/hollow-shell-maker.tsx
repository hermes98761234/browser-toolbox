import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, fmt, money, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { analyze, gridCube, toSoup, type Indexed } from './lib/stl-repair-checker'
import { parseObj } from './lib/mesh-repair-checker'
import { parseStl, toBinaryStl } from './lib/stl-viewer'
import { compact, drill, hollow, icosphere, orientOutward, samplePawn, subdivide, volumeArea, weld, type V3 } from './lib/hollow-shell-maker'

interface HoleSpec { id: number; p: V3; n: V3; d: number }
const SAMPLES = {
  pawn: ['Chess pawn figurine', samplePawn],
  sphere: ['Sphere Ø 40 mm', () => icosphere(20, 4)],
  cube: ['Cube 25 mm', () => weld(new Float32Array(gridCube(25, 25).flat()))],
} as const
type SampleKey = keyof typeof SAMPLES
const PAWN_HOLES: HoleSpec[] = [{ id: 1, p: [0, 0, 0], n: [0, 0, -1], d: 3.5 }, { id: 2, p: [9.5, 0, 0], n: [0, 0, -1], d: 2.5 }]
const DEF = { wall: 2, hollow: true, unit: 1, refine: 0, holeD: 3, density: 1.1, price: 35, cutOn: true, cut: 0, inner: true }
const MAX_TRI = 400_000

export default function HollowShellMaker() {
  const [s, set, reset] = useToolState('hollow-shell-maker', DEF)
  const [model, setModel] = useState<{ mesh: Indexed; name: string }>(() => ({ mesh: samplePawn(), name: SAMPLES.pawn[0] }))
  const [holes, setHoles] = useState<HoleSpec[]>(PAWN_HOLES)
  const [placing, setPlacing] = useState(false)
  const [err, setErr] = useState('')
  const k = s.unit
  const wallU = s.wall / k // wall in file units

  const src = useMemo(() => {
    let m = orientOutward(model.mesh)
    for (let i = 0; i < s.refine && m.faces.length / 3 * 4 * (s.hollow ? 2 : 1) <= MAX_TRI; i++) m = subdivide(m)
    return m
  }, [model, s.refine, s.hollow])
  const check = useMemo(() => analyze(src), [src])

  const res = useMemo(() => {
    if (!s.hollow) return { work: { verts: [...src.verts], faces: [...src.faces], kind: new Array(src.faces.length / 3).fill(0) }, folded: 0, errors: [] as [number, string][] }
    const h = hollow(src, wallU)
    const errors: [number, string][] = []
    for (const hole of holes) {
      const e = drill(h.work, { p: hole.p, n: hole.n, r: hole.d / 2 / k }, wallU)
      if (e) errors.push([hole.id, e])
    }
    return { work: h.work, folded: h.folded, errors }
  }, [src, s.hollow, wallU, holes, k])

  const solid = Math.abs(volumeArea(src.verts, src.faces).volume) * k ** 3 / 1000 // ml
  const printed = volumeArea(res.work.verts, res.work.faces).volume * k ** 3 / 1000
  const cavity = Math.max(0, solid - printed)
  const saved = solid > 0 ? cavity / solid : 0
  const grams = printed * s.density
  const okHoles = holes.length - res.errors.length
  const size = useMemo(() => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < src.verts.length; i++) {
      mn[i % 3] = Math.min(mn[i % 3], src.verts[i])
      mx[i % 3] = Math.max(mx[i % 3], src.verts[i])
    }
    return { mn, mx, d: mx.map((v, i) => v - mn[i]) }
  }, [src])
  const minDim = Math.min(...size.d) * k

  // --- 3D ---
  const outerRef = useRef<THREE.Mesh | null>(null)
  const placingRef = useRef(placing)
  const holeD = useRef(s.holeD)
  useEffect(() => {
    placingRef.current = placing
    holeD.current = s.holeD
  }, [placing, s.holeD])

  const ref = useStage3D(
    (stage) => {
      stage.renderer.localClippingEnabled = true
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      const el = stage.renderer.domElement
      let dx = 0, dy = 0
      const down = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY }
      const up = (e: PointerEvent) => {
        if (!placingRef.current || Math.hypot(e.clientX - dx, e.clientY - dy) > 4 || !outerRef.current) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const hit = ray.intersectObject(outerRef.current)[0]
        if (!hit?.face) return
        const p = outerRef.current.worldToLocal(hit.point.clone())
        const n = hit.face.normal
        setHoles((old) => [...old, { id: Date.now(), p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], d: holeD.current }])
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const maxDim = Math.max(...size.d) || 1
      const sc = 8 / maxDim
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2 // models are Z-up
      holder.scale.setScalar(sc)
      const inner = new THREE.Group()
      inner.position.set(-(size.mn[0] + size.mx[0]) / 2, -(size.mn[1] + size.mx[1]) / 2, -size.mn[2])
      holder.add(inner)
      const pos = new Float32Array(res.work.verts)
      // Clip plane perpendicular to world Z (front/back cut) to reveal the wall.
      const clip = s.cutOn ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), s.cut * 4.5)] : []
      const mk = (kind: number, color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
        const idx: number[] = []
        res.work.kind.forEach((kd, f) => { if (kd === kind) idx.push(res.work.faces[3 * f], res.work.faces[3 * f + 1], res.work.faces[3 * f + 2]) })
        if (!idx.length) return null
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setIndex(idx)
        g.computeVertexNormals()
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: clip, ...opts }))
        inner.add(m)
        return m
      }
      outerRef.current = mk(0, '#94a3b8')
      if (s.inner) mk(1, '#f59e0b')
      mk(2, '#ef4444')
      for (const h of holes) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(h.d / 2 / k, Math.max(0.15, h.d * 0.06) / k, 8, 32), new THREE.MeshBasicMaterial({ color: res.errors.some((e) => e[0] === h.id) ? '#ef4444' : '#22d3ee' }))
        ring.position.set(...h.p)
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...h.n).normalize())
        ring.position.addScaledVector(new THREE.Vector3(...h.n), 0.05 / sc)
        inner.add(ring)
      }
      root.add(holder)
      stage.controls.target.set(0, (size.d[2] * sc) / 2, 0)
    },
    [res, size, s.cutOn, s.cut, s.inner, holes, k],
    { camera: [9, 7, 11], target: [0, 4, 0] },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const buf = await f.arrayBuffer()
      const pos = /\.obj$/i.test(f.name) ? parseObj(new TextDecoder().decode(buf)) : parseStl(buf).pos
      if (pos.length / 9 > MAX_TRI) throw new Error(`Model has ${fmt(pos.length / 9, 6)} triangles; this tool handles up to ${MAX_TRI.toLocaleString('en-US')}. Decimate it first.`)
      setModel({ mesh: weld(pos, 1e-4), name: f.name })
      setHoles([])
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const loadSample = (key: SampleKey) => {
    setModel({ mesh: SAMPLES[key][1](), name: SAMPLES[key][0] })
    setHoles(key === 'pawn' ? PAWN_HOLES : key === 'sphere' ? [{ id: 1, p: [0, 0, -20], n: [0, 0, -1], d: 4 }] : [{ id: 1, p: [12.5, 12.5, 0], n: [0, 0, -1], d: 4 }])
  }
  // Lowest downward-facing spot, offset from existing holes when possible.
  const autoHole = () => {
    const v = src.verts, f = src.faces
    let best: { p: V3; score: number } | null = null
    for (let t = 0; t < f.length / 3; t++) {
      const a = [0, 1, 2].map((q) => f[3 * t + q])
      const P = a.map((i) => [v[3 * i], v[3 * i + 1], v[3 * i + 2]])
      const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], w = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]]
      const nz = u[0] * w[1] - u[1] * w[0], l = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], nz)
      if (!l || nz / l > -0.9) continue
      const c: V3 = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3]
      const near = holes.length ? Math.min(...holes.map((h) => Math.hypot(h.p[0] - c[0], h.p[1] - c[1], h.p[2] - c[2]))) : 0
      const cx = (size.mn[0] + size.mx[0]) / 2, cy = (size.mn[1] + size.mx[1]) / 2
      const score = (c[2] - size.mn[2]) * 10 + (holes.length ? -Math.min(near, 4 * (s.holeD / k)) * 5 : Math.hypot(c[0] - cx, c[1] - cy))
      if (!best || score < best.score) best = { p: c, score }
    }
    const pick = best as { p: V3 } | null
    if (pick) setHoles((o) => [...o, { id: Date.now(), p: pick.p, n: [0, 0, -1], d: s.holeD }])
    else setErr('No downward-facing surface found; click the model to place holes manually.')
  }

  const exportStl = () => {
    const m = compact(res.work)
    const soup = toSoup({ verts: m.verts.map((x) => x * k), faces: m.faces })
    download(`${model.name.replace(/\.\w+$/, '').replace(/\W+/g, '-')}-hollow.stl`, new Blob([toBinaryStl(new Float32Array(soup), 'hollowed')]), 'model/stl')
  }

  return (
    <div>
      <Stats>
        <Stat label="Solid volume" value={`${fmt(solid, 4)} ml`} sub={`${fmt(solid * s.density, 4)} g resin if printed solid`} />
        <Stat label="Hollowed print" value={`${fmt(printed, 4)} ml`} sub={`${fmt(grams, 4)} g · ${money((printed / 1000) * s.price)} resin`} tone="accent" />
        <Stat label="Resin saved" value={`${fmt(saved * 100, 3)} %`} sub={`${fmt(cavity, 4)} ml · ${money((cavity / 1000) * s.price)} saved`} tone="good" />
        <Stat label="Drain holes" value={`${okHoles} / ${holes.length}`} sub={!s.hollow ? 'hollowing off' : okHoles >= 2 ? 'drain + vent ✓' : okHoles === 1 ? 'add a vent hole' : 'resin will be trapped'} tone={!s.hollow || okHoles >= 2 ? 'good' : 'bad'} />
      </Stats>
      <Split wide="left">
        <Panel title={<>Model: <span style={{ color: 'var(--accent)' }}>{model.name}</span></>} actions={<Check label="🎯 Click to add hole" value={placing} onChange={setPlacing} />}>
          <View3D refEl={ref} height={480} />
          <Row>
            <Check label="Cross-section" value={s.cutOn} onChange={(cutOn) => set({ cutOn })} />
            <Check label="Show inner shell" value={s.inner} onChange={(inner) => set({ inner })} />
          </Row>
          {s.cutOn && <Slider label="Section position" value={s.cut} min={-1} max={1} step={0.02} onChange={(cut) => set({ cut })} show={(v) => fmt(v, 2)} />}
          <p className="muted" style={{ fontSize: 12 }}>
            Grey = outer surface, amber = inner (inverted) shell, red = drain-hole walls, cyan rings = holes. {placing ? 'Click on the outer surface to drop a hole.' : 'Drag to orbit, scroll to zoom.'}
          </p>
        </Panel>
        <div>
          <Panel title="Model" actions={<Btn kind="ghost" onClick={() => { reset(); loadSample('pawn') }}>Reset</Btn>}>
            <FileDrop accept=".stl,.obj" onFiles={(fs) => void load(fs[0])} label="Drop an STL or OBJ (closed mesh)" />
            {err && <Note tone="err">{err}</Note>}
            <Row>
              <Select label="Demo model" value={'' as string} onChange={(v) => v && loadSample(v as SampleKey)} options={[['', 'Choose…'], ...Object.entries(SAMPLES).map(([key, v]) => [key, v[0]] as [string, string])]} />
              <Select label="File units" value={s.unit} onChange={(unit) => set({ unit })} options={[[1, 'mm'], [10, 'cm'], [25.4, 'inch']]} />
            </Row>
            <Select label="Mesh resolution" value={s.refine} onChange={(refine) => set({ refine })} options={[[0, 'Original'], [1, 'Subdivide ×4'], [2, 'Subdivide ×16']]} />
            <p className="muted" style={{ fontSize: 12 }}>
              {(src.faces.length / 3).toLocaleString('en-US')} triangles · {size.d.map((d) => fmt(d * k, 4)).join(' × ')} mm ·{' '}
              {check.watertight ? <span style={{ color: 'var(--ok)' }}>watertight ✓</span> : <span style={{ color: 'var(--err)' }}>not watertight ({check.boundaryEdges.length} open edges)</span>}
            </p>
            {!check.watertight && <Note tone="warn">Hollowing needs a closed mesh. Repair the file first (e.g. with the STL Repair Checker), otherwise the shell will leak.</Note>}
          </Panel>
          <Panel title="Hollowing">
            <Check label="Hollow the model" value={s.hollow} onChange={(hollow) => set({ hollow })} />
            <Slider label="Wall thickness" value={s.wall} min={0.8} max={6} step={0.1} unit=" mm" onChange={(wall) => set({ wall })} show={(v) => fmt(v, 2)} />
            {s.wall < 1.5 && <Note tone="warn">Walls under ~1.5 mm often crack or warp on resin printers. 2–3 mm is a safe default for figurines.</Note>}
            {s.wall * 2 >= minDim && <Note tone="err">The wall is thicker than half the smallest model dimension — the inner shell will fold through itself.</Note>}
            {s.hollow && res.folded > (src.faces.length / 3) * 0.01 && <Note tone="warn">{res.folded} inner triangles folded over (features thinner than 2 × wall, e.g. fingers or sharp rims). Thin those areas or reduce the wall.</Note>}
          </Panel>
          <Panel title="Drain holes" actions={<Btn onClick={autoHole} disabled={!s.hollow}>+ Auto (lowest)</Btn>}>
            <Num label="New hole diameter" value={s.holeD} min={1} max={20} step={0.5} unit="mm" onChange={(holeD) => set({ holeD })} />
            {holes.length ? (
              <Table
                head={['#', 'Position (mm)', 'Ø mm', '']}
                rows={holes.map((h, i) => {
                  const e = res.errors.find((x) => x[0] === h.id)
                  return [
                    i + 1,
                    <span key="p" style={{ color: e ? 'var(--err)' : undefined }} title={e?.[1]}>{h.p.map((v) => fmt(v * k, 3)).join(', ')}{e ? ' ⚠' : ''}</span>,
                    <input key="d" type="number" min={1} max={20} step={0.5} value={h.d} style={{ width: 64 }} aria-label="Hole diameter" onChange={(ev) => setHoles((o) => o.map((x) => (x.id === h.id ? { ...x, d: Math.max(1, Number(ev.target.value) || 1) } : x)))} />,
                    <Btn key="x" kind="ghost" onClick={() => setHoles((o) => o.filter((x) => x.id !== h.id))} title="Remove">✕</Btn>,
                  ]
                })}
              />
            ) : <p className="muted">No holes yet. Tick “Click to add hole” and click the model, or use Auto.</p>}
            {res.errors.map(([id, e]) => <Note key={id} tone="err">Hole {holes.findIndex((h) => h.id === id) + 1}: {e}</Note>)}
            <p className="muted" style={{ fontSize: 12 }}>
              Place one hole near the build plate and a second one far from it so air can enter while resin drains (prevents suction “cupping”). Ø 3–5 mm drains well.
            </p>
          </Panel>
          <Panel title="Resin & export">
            <Row>
              <Num label="Resin density" value={s.density} min={0.9} max={2} step={0.01} unit="g/ml" onChange={(density) => set({ density })} />
              <Num label="Resin price" value={s.price} min={0} unit="/ litre" onChange={(price) => set({ price })} />
            </Row>
            <Btn kind="primary" onClick={exportStl}>⬇ Export hollowed STL</Btn>
            <p className="muted" style={{ fontSize: 12 }}>
              How it works: the inner shell is the outer surface offset inward along angle-weighted vertex normals (mitered at corners) with reversed winding.
              Holes are cut without booleans — a disk is removed from both shells, the rims are snapped to a circle and stitched with a tube wall, so the export stays watertight.
              Supports are not added; cured-resin volume excludes them.
            </p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
