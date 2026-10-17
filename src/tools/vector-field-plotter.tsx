import { useMemo, useRef } from 'react'
import { Btn, Check, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { divCurl, mag, makeField, PRESETS, rk4, streamline, type Field, type Vec } from './lib/vector-field-plotter'

const DEF = {
  fx: '-y - 0.3x', fy: 'x - 0.3y', fz: '0', dim: 2 as 2 | 3, L: 3,
  n: 17, arrows: true, scaleMode: 'scaled' as 'scaled' | 'uniform' | 'log',
  stream: true, seeds: 6, particles: true, speed: 1, probe: [1, 0.5, 0] as Vec,
}
const WORLD = 4
const ramp = (t: number) => new THREE.Color().setHSL(0.66 - 0.66 * Math.min(1, Math.max(0, t)), 0.9, 0.55)

export default function VectorFieldPlotter() {
  const [s, set, reset] = useToolState('vector-field-plotter', DEF)
  const res = useMemo(() => {
    try { return { f: makeField(s.fx, s.fy, s.fz, s.dim), err: '' } } catch (e) { return { f: null as Field | null, err: (e as Error).message } }
  }, [s.fx, s.fy, s.fz, s.dim])
  const f = res.f
  const sc = WORLD / s.L
  const toWorld = (p: Vec) => new THREE.Vector3(p[0] * sc, p[2] * sc, -p[1] * sc)

  // sample grid
  const grid = useMemo(() => {
    if (!f) return { pts: [] as Vec[], vecs: [] as Vec[], max: 0, bad: 0 }
    const n = s.n, nz = s.dim === 3 ? n : 1
    const pts: Vec[] = [], vecs: Vec[] = []
    let max = 0, bad = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const g = (a: number) => -s.L + ((a + 0.5) / n) * 2 * s.L
      const p: Vec = [g(i), g(j), s.dim === 3 ? g(k) : 0]
      const v = f(p)
      if (!v.every(Number.isFinite)) { bad++; continue }
      pts.push(p); vecs.push(v)
      max = Math.max(max, mag(v))
    }
    return { pts, vecs, max, bad }
  }, [f, s.n, s.L, s.dim])

  const lines = useMemo(() => {
    if (!f || !s.stream) return []
    const m = s.seeds, mz = s.dim === 3 ? Math.max(2, Math.round(m * 0.7)) : 1
    const out: { pts: Vec[]; mags: number[] }[] = []
    for (let k = 0; k < mz; k++) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const g = (a: number, c: number) => -s.L + ((a + 0.5) / c) * 2 * s.L
      out.push(streamline(f, [g(i, m), g(j, m), s.dim === 3 ? g(k, mz) : 0], s.L / 60, 500, s.L, s.dim))
    }
    return out
  }, [f, s.stream, s.seeds, s.L, s.dim])

  const live = useRef({ f, L: s.L, dim: s.dim, speed: s.speed, max: grid.max, on: s.particles })

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'field'
      st.scene.add(g)
      // flow particles
      const N = 900
      const P: Vec[] = [], age: number[] = []
      const rnd = () => { const { L, dim } = live.current; return [(Math.random() * 2 - 1) * L, (Math.random() * 2 - 1) * L, dim === 3 ? (Math.random() * 2 - 1) * L : 0] as Vec }
      for (let i = 0; i < N; i++) { P.push(rnd()); age.push(Math.random() * 4) }
      const geo = new THREE.BufferGeometry()
      const arr = new Float32Array(N * 3)
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f8fafc', size: 0.07, transparent: true, opacity: 0.9, depthWrite: false }))
      pts.frustumCulled = false
      st.scene.add(pts)
      st.onFrame((_, dt) => {
        const { f: fn, L, dim, speed, max, on } = live.current
        pts.visible = !!fn && on
        if (!fn || !on) return
        const k = max > 0 ? (L * 0.35 * speed) / max : 0
        const scaled: typeof fn = (p) => { const v = fn(p); return [v[0] * k, v[1] * k, v[2] * k] }
        const s2 = WORLD / L
        for (let i = 0; i < N; i++) {
          age[i] -= dt
          let p = rk4(scaled, P[i], dt)
          if (age[i] < 0 || !p.every(Number.isFinite) || Math.abs(p[0]) > L || Math.abs(p[1]) > L || Math.abs(p[2]) > L) { p = rnd(); age[i] = 2 + Math.random() * 4 }
          if (dim === 2) p[2] = 0
          P[i] = p
          arr[i * 3] = p[0] * s2; arr[i * 3 + 1] = p[2] * s2 + (dim === 2 ? 0.02 : 0); arr[i * 3 + 2] = -p[1] * s2
        }
        geo.attributes.position.needsUpdate = true
      })
    },
    (st) => {
      live.current = { f, L: s.L, dim: s.dim, speed: s.speed, max: grid.max, on: s.particles }
      const g = st.scene.getObjectByName('field') as THREE.Group
      st.clear(g)
      // domain box / plane + axis labels
      if (s.dim === 3) {
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(WORLD * 2, WORLD * 2, WORLD * 2)), new THREE.LineBasicMaterial({ color: '#334155' })))
      } else {
        const sq = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, WORLD * 2), new THREE.MeshBasicMaterial({ color: '#0f1d33', side: THREE.DoubleSide }))
        sq.rotation.x = -Math.PI / 2
        sq.position.y = -0.01
        g.add(sq)
      }
      const ax = (t: string, p: THREE.Vector3) => { const l = label(t, '#94a3b8', 0.4); l.position.copy(p); g.add(l) }
      ax(`x ${num(s.L, 2)}`, new THREE.Vector3(WORLD + 0.5, 0, 0)); ax(`y ${num(s.L, 2)}`, new THREE.Vector3(0, 0, -WORLD - 0.5))
      if (s.dim === 3) ax(`z ${num(s.L, 2)}`, new THREE.Vector3(0, WORLD + 0.5, 0))
      if (!f) return
      // arrows
      const cell = (2 * WORLD) / s.n
      if (s.arrows && grid.pts.length) {
        const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.68, 6).translate(0, 0.34, 0)
        const head = new THREE.ConeGeometry(0.12, 0.32, 8).translate(0, 0.84, 0)
        const geom = mergeGeometries([shaft, head])!
        const im = new THREE.InstancedMesh(geom, new THREE.MeshStandardMaterial({ roughness: 0.5 }), grid.pts.length)
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
        const lmax = Math.log1p(grid.max)
        grid.pts.forEach((p, i) => {
          const v = grid.vecs[i], mg = mag(v)
          const t = grid.max > 0 ? mg / grid.max : 0
          const rel = s.scaleMode === 'uniform' ? 1 : s.scaleMode === 'log' ? (lmax > 0 ? Math.log1p(mg) / lmax : 0) : t
          const len = cell * (0.2 + 0.75 * rel)
          const dir = new THREE.Vector3(v[0], v[2], -v[1])
          if (dir.lengthSq() < 1e-20) dir.set(0, 1, 0)
          q.setFromUnitVectors(up, dir.normalize())
          const base = toWorld(p).addScaledVector(dir, -len / 2)
          m.compose(base, q, new THREE.Vector3(cell * 0.9, len, cell * 0.9))
          im.setMatrixAt(i, m)
          im.setColorAt(i, ramp(t))
        })
        g.add(im)
      }
      // streamlines
      for (const l of lines) {
        if (l.pts.length < 2) continue
        const geo = new THREE.BufferGeometry().setFromPoints(l.pts.map(toWorld))
        const cols: number[] = []
        l.mags.forEach((mg) => { const c = ramp(grid.max ? mg / grid.max : 0); cols.push(c.r, c.g, c.b) })
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
        g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })))
      }
      // probe
      const pr = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: '#facc15' }))
      pr.position.copy(toWorld(s.probe))
      g.add(pr)
    },
    [f, grid, lines, s.arrows, s.scaleMode, s.dim, s.L, s.n, s.probe, s.speed, s.particles],
    { camera: [0, 9, 6], target: [0, 0, 0], grid: false, background: '#0b1120' },
  )

  const probe = f ? f(s.probe) : null
  const dc = f ? divCurl(f, s.probe) : null
  const setProbe = (i: number, v: number) => set({ probe: s.probe.map((x, j) => (j === i ? v : x)) as Vec })

  return (
    <Split wide="left">
      <div>
        <Panel title="Field" actions={<Seg value={String(s.dim) as '2' | '3'} onChange={(d) => set({ dim: d === '3' ? 3 : 2 })} options={[['2', '2D'], ['3', '3D']]} />}>
          <View3D refEl={ref} height={520} />
          <p className="muted" style={{ fontSize: 12 }}>Arrow colour = |F| (blue low → red high). White dots are particles carried by the flow. Drag to orbit.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="|F| at probe" value={probe ? num(mag(probe), 3) : '—'} sub={probe ? `(${probe.map((v) => num(v, 2)).join(', ')})` : ''} tone="accent" />
          <Stat label="div F" value={dc ? num(dc.div, 3) : '—'} sub={dc ? (Math.abs(dc.div) < 1e-6 ? 'incompressible' : dc.div > 0 ? 'source' : 'sink') : ''} />
          <Stat label="curl F" value={dc ? (s.dim === 2 ? num(dc.curl[2], 3) : num(mag(dc.curl), 3)) : '—'} sub={dc ? (s.dim === 2 ? 'z-component' : `(${dc.curl.map((v) => num(v, 2)).join(', ')})`) : ''} />
        </Stats>
        <Panel title="Components" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Fx(x, y, z)" value={s.fx} onChange={(fx) => set({ fx })} />
          <Txt label="Fy(x, y, z)" value={s.fy} onChange={(fy) => set({ fy })} />
          {s.dim === 3 && <Txt label="Fz(x, y, z)" value={s.fz} onChange={(fz) => set({ fz })} />}
          {res.err && <Note tone="err">{res.err}</Note>}
          {grid.bad > 0 && <Note tone="warn">{grid.bad} grid points are undefined (division by zero?) and were skipped.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Functions: sin cos tan exp ln sqrt abs atan2 hypot … constants pi, e. Implicit multiplication works (2x, x y).</p>
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p.name} kind={p.fx === s.fx && p.fy === s.fy && p.dim === s.dim ? 'primary' : 'normal'} onClick={() => set({ fx: p.fx, fy: p.fy, fz: p.fz, dim: p.dim, L: p.L, probe: [p.L / 3, p.L / 6, 0], n: p.dim === 3 ? 9 : 17, seeds: p.dim === 3 ? 4 : 6 })}>{p.name}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Display">
          <Num label="Domain half-width L" value={s.L} onChange={(L) => L > 0 && set({ L })} min={0.01} />
          <Slider label="Arrows per axis" value={s.n} onChange={(n) => set({ n })} min={4} max={s.dim === 3 ? 14 : 40} />
          <Seg value={s.scaleMode} onChange={(scaleMode) => set({ scaleMode })} options={[['scaled', 'Length ∝ |F|'], ['log', 'Log length'], ['uniform', 'Direction only']]} />
          <Row>
            <Check label="Arrows" value={s.arrows} onChange={(arrows) => set({ arrows })} />
            <Check label="Streamlines (RK4)" value={s.stream} onChange={(stream) => set({ stream })} />
            <Check label="Particles" value={s.particles} onChange={(particles) => set({ particles })} />
          </Row>
          {s.stream && <Slider label="Streamline seeds per axis" value={s.seeds} onChange={(seeds) => set({ seeds })} min={2} max={s.dim === 3 ? 7 : 16} />}
          {s.particles && <Slider label="Particle speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.1} max={3} step={0.1} />}
        </Panel>
        <Panel title="Probe point">
          <Row>
            <Num label="x" value={s.probe[0]} onChange={(v) => setProbe(0, v)} />
            <Num label="y" value={s.probe[1]} onChange={(v) => setProbe(1, v)} />
            {s.dim === 3 && <Num label="z" value={s.probe[2]} onChange={(v) => setProbe(2, v)} />}
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>div and curl use central differences (h = 10⁻⁴). Max |F| on the grid: {num(grid.max, 3)}.</p>
        </Panel>
      </div>
    </Split>
  )
}
