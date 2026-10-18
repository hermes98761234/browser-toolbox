import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Legend, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { DEF_HYPER, distToMin, height, OPTIMISERS, runPath, SURFACES, type OptId, type V2 } from './lib/loss-surface-visualizer'

const SIZE = 8 // world units across the plot window
const ZH = 3 // world height of the surface
const N = 90

interface State {
  surface: string
  start: V2
  lr: number
  alr: number
  beta: number
  beta1: number
  beta2: number
  rho: number
  noise: number
  steps: number
  speed: number
  on: OptId[]
}

const DEF: State = { surface: 'rosen', start: [-1.5, 2], lr: 0.0015, alr: 0.05, beta: 0.9, beta1: 0.9, beta2: 0.999, rho: 0.9, noise: 0, steps: 1000, speed: 150, on: ['sgd', 'momentum', 'rmsprop', 'adam'] }

/** Adam/RMSProp steps are ≈ lr in parameter units, so they get their own rate. */
const adaptive = (o: OptId) => o === 'adam' || o === 'rmsprop'
const fl = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 1e-3 ? v.toExponential(2) : num(v, 5))

export default function LossSurfaceVisualizer() {
  const [s, set, reset] = useToolState('loss-surface-visualizer', DEF)
  const surf = SURFACES.find((x) => x.id === s.surface) ?? SURFACES[0]
  const [playing, setPlaying] = useState(true)
  const [nonce, setNonce] = useState(0)

  const paths = useMemo(
    () =>
      OPTIMISERS.filter((o) => s.on.includes(o.id)).map((o) => ({
        ...o,
        lr: adaptive(o.id) ? s.alr : s.lr,
        path: runPath(surf, o.id, s.start, { ...DEF_HYPER, lr: adaptive(o.id) ? s.alr : s.lr, beta: s.beta, beta1: s.beta1, beta2: s.beta2, rho: s.rho, noise: s.noise }, s.steps, 7),
      })),
    [surf, s.on, s.start, s.lr, s.alr, s.beta, s.beta1, s.beta2, s.rho, s.noise, s.steps],
  )

  // Height normalisation for the current window.
  const range = useMemo(() => {
    const [x0, x1, y0, y1] = surf.box
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i <= 40; i++)
      for (let j = 0; j <= 40; j++) {
        const v = height(surf, surf.f(x0 + ((x1 - x0) * i) / 40, y0 + ((y1 - y0) * j) / 40))
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
    return { lo, hi }
  }, [surf])

  const anim = useRef({ t: 0, playing: true, speed: 60 })
  const heads = useRef<{ mesh: THREE.Mesh; pts: THREE.Vector3[]; line: THREE.Line }[]>([])
  const setStartRef = useRef<(p: V2) => void>(() => {})
  useEffect(() => {
    anim.current.playing = playing
    anim.current.speed = s.speed
    setStartRef.current = (start) => set({ start })
  })

  const ref = useStage3D(
    (st) => {
      st.onFrame((_t, dt) => {
        const a = anim.current
        if (a.playing) a.t += dt * a.speed
        for (const h of heads.current) {
          const k = Math.min(h.pts.length - 1, Math.floor(a.t))
          h.mesh.position.copy(h.pts[k])
          h.line.geometry.setDrawRange(0, k + 1)
        }
      })
      // click (without dragging) on the surface sets the start point
      const el = st.renderer.domElement
      let down: [number, number] | null = null
      const pd = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const pu = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(st.scene.children, true).find((h) => h.object.userData.surface)
        if (hit) {
          const u = hit.object.userData.surface as (wx: number, wz: number) => V2
          setStartRef.current(u(hit.point.x, hit.point.z))
        }
      }
      el.addEventListener('pointerdown', pd)
      el.addEventListener('pointerup', pu)
      return () => {
        el.removeEventListener('pointerdown', pd)
        el.removeEventListener('pointerup', pu)
      }
    },
    (st) => {
      let g = st.scene.getObjectByName('loss') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'loss'
        st.scene.add(g)
      }
      st.clear(g)
      const [x0, x1, y0, y1] = surf.box
      const sc = SIZE / Math.max(x1 - x0, y1 - y0)
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const H = (x: number, y: number) => ((height(surf, surf.f(x, y)) - range.lo) / (range.hi - range.lo || 1)) * ZH
      const W = (x: number, y: number, lift = 0) => new THREE.Vector3((x - cx) * sc, H(x, y) + lift, -(y - cy) * sc)
      const geo = new THREE.PlaneGeometry((x1 - x0) * sc, (y1 - y0) * sc, N, N)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position as THREE.BufferAttribute
      const cols = new Float32Array(pos.count * 3)
      const c = new THREE.Color()
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) / sc + cx, y = -pos.getZ(i) / sc + cy
        const h = H(x, y)
        pos.setY(i, h)
        const t = h / ZH
        c.setHSL(0.66 - 0.66 * Math.pow(t, 0.6), 0.75, 0.32 + 0.25 * t)
        cols.set([c.r, c.g, c.b], i * 3)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.93 }))
      mesh.userData.surface = (wx: number, wz: number): V2 => [+(wx / sc + cx).toFixed(3), +(-wz / sc + cy).toFixed(3)]
      g.add(mesh)
      // translucent floor under the surface
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry((x1 - x0) * sc, (y1 - y0) * sc).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.5 }),
      )
      floor.position.y = -0.02
      g.add(floor)
      for (const m of surf.minima) {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
        star.position.copy(W(m[0], m[1], 0.15))
        g.add(star)
      }
      const st0 = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      st0.position.copy(W(s.start[0], s.start[1], 0.08))
      g.add(st0)
      const lab = label('start', '#ffffff', 0.35)
      lab.position.copy(W(s.start[0], s.start[1], 0.45))
      g.add(lab)
      heads.current = paths.map((p) => {
        const pts = p.path.map(([x, y]) => {
          const xc = Math.min(x1, Math.max(x0, x)), yc = Math.min(y1, Math.max(y0, y))
          return W(xc, yc, 0.06)
        })
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: p.color, depthTest: false, transparent: true }))
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false, transparent: true }))
        line.renderOrder = 5
        head.renderOrder = 6
        g.add(line, head)
        return { mesh: head, pts, line }
      })
      anim.current.t = 0
    },
    [surf, paths, range, nonce],
    { camera: [6.5, 6.5, 7.5], target: [0, 1, 0], grid: false },
  )

  const lossSeries = paths.map((p) => ({
    name: p.name,
    color: p.color,
    points: p.path.filter((_, i) => i % Math.max(1, Math.floor(p.path.length / 300)) === 0).map(([x, y], i, arr): [number, number] => [(i * p.path.length) / arr.length, Math.log10(Math.max(1e-12, surf.f(x, y)) + 1e-12)]),
  }))

  const rows = paths.map((p) => {
    const last = p.path[p.path.length - 1]
    const conv = surf.minima.length ? p.path.findIndex((q) => distToMin(surf, q) < 0.01) : -1
    const diverged = p.path.length < s.steps + 1
    return [
      <span key="n" style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>,
      num(p.lr, 4),
      diverged ? <b key="d" style={{ color: 'var(--err)' }}>diverged @ {p.path.length - 1}</b> : fl(surf.f(last[0], last[1])),
      `(${num(last[0], 3)}, ${num(last[1], 3)})`,
      conv >= 0 ? conv : '—',
    ]
  })

  const toggle = (o: OptId) => set({ on: s.on.includes(o) ? s.on.filter((x) => x !== o) : [...s.on, o] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Landscape" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select
            label="Test function"
            value={s.surface}
            onChange={(id) => {
              const n = SURFACES.find((x) => x.id === id)!
              set({ surface: id, start: n.start, lr: n.lr, alr: n.alr })
            }}
            options={SURFACES.map((x) => [x.id, x.name] as const)}
          />
          <Note>{surf.note}</Note>
          <Row>
            <Num label="Start x" value={s.start[0]} onChange={(v) => set({ start: [v, s.start[1]] })} step={0.1} />
            <Num label="Start y" value={s.start[1]} onChange={(v) => set({ start: [s.start[0], v] })} step={0.1} />
          </Row>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Tip: click anywhere on the 3D surface to drop a new start point.</p>
        </Panel>
        <Panel title="Optimisers">
          {OPTIMISERS.map((o) => (
            <Check key={o.id} label={<span style={{ color: o.color, fontWeight: 700 }}>{o.name}</span>} value={s.on.includes(o.id)} onChange={() => toggle(o.id)} />
          ))}
          <Slider label="Learning rate: SGD / momentum / Nesterov" value={Math.log10(s.lr)} onChange={(v) => set({ lr: +Math.pow(10, v).toPrecision(2) })} min={-4} max={0} step={0.05} show={(v) => Math.pow(10, v).toPrecision(2)} />
          <Slider label="Learning rate: Adam / RMSProp" value={Math.log10(s.alr)} onChange={(v) => set({ alr: +Math.pow(10, v).toPrecision(2) })} min={-3} max={0} step={0.05} show={(v) => Math.pow(10, v).toPrecision(2)} />
          <Slider label="Momentum β" value={s.beta} onChange={(beta) => set({ beta })} min={0} max={0.99} step={0.01} />
          <Slider label="Adam β₁" value={s.beta1} onChange={(beta1) => set({ beta1 })} min={0} max={0.99} step={0.01} />
          <Slider label="Adam β₂" value={s.beta2} onChange={(beta2) => set({ beta2 })} min={0.9} max={0.9999} step={0.0001} show={(v) => v.toFixed(4)} />
          <Slider label="RMSProp ρ" value={s.rho} onChange={(rho) => set({ rho })} min={0.5} max={0.999} step={0.001} show={(v) => v.toFixed(3)} />
          <Slider label="Gradient noise (minibatch)" value={s.noise} onChange={(noise) => set({ noise })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Num label="Iterations" value={s.steps} onChange={(steps) => set({ steps: Math.round(Math.min(5000, Math.max(10, steps))) })} min={10} max={5000} />
            <Num label="Speed" value={s.speed} onChange={(speed) => set({ speed })} unit="steps/s" min={1} max={2000} />
          </Row>
          <Note>Adam and RMSProp divide by a running gradient magnitude, so each step moves ≈ lr in parameter space; plain gradient methods move lr × |gradient|. That is why they get separate rates.</Note>
        </Panel>
      </div>
      <div>
        <Panel
          title={`${surf.name} — optimiser race`}
          actions={
            <>
              <Btn onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
              <Btn onClick={() => { setNonce(nonce + 1); setPlaying(true) }}>↺ Replay</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={440} />
          <Legend items={[...paths.map((p) => [p.name, p.color] as [string, string]), ['global minimum', '#facc15']]} />
        </Panel>
        <Stats>
          <Stat label="Best final loss" value={paths.length ? fl(Math.min(...paths.map((p) => surf.f(...p.path[p.path.length - 1])))) : '—'} tone="good" />
          <Stat label="Start loss" value={num(surf.f(s.start[0], s.start[1]), 3)} />
          <Stat label="Iterations" value={s.steps} />
        </Stats>
        <Panel title="Results">
          <Table head={['Optimiser', 'lr', 'Final loss', 'Final point', 'Steps to within 0.01 of a min']} rows={rows} />
        </Panel>
        <Panel title="Loss curve (log₁₀ f)">
          <LineChart series={lossSeries} xLabel="iteration" fy={(v) => v.toFixed(1)} fx={(v) => num(v, 0)} height={220} />
        </Panel>
      </div>
    </Split>
  )
}
