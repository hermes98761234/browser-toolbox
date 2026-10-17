import { useMemo, useRef } from 'react'
import { Btn, Check, fmt, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { compileCurve, compileSurface, curveInfo, diverging, evalConst, PRESETS, robustScale, sampleSurface, type V3 } from './lib/parametric-surface-viewer'

type ColorMode = 'K' | 'H' | 'height' | 'solid'
const P0 = PRESETS[0]
const DEF = { kind: P0.kind, x: P0.x, y: P0.y, z: P0.z, u0: P0.u[0], u1: P0.u[1], v0: P0.v![0], v1: P0.v![1], a: P0.a ?? 1, res: 96, mode: 'K' as ColorMode, wire: true, spin: false, preset: P0.name }

const heightColor = (t: number): V3 => {
  // viridis-like ramp
  const stops: V3[] = [[0.27, 0.0, 0.33], [0.23, 0.32, 0.55], [0.13, 0.57, 0.55], [0.37, 0.79, 0.38], [0.99, 0.91, 0.14]]
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1)
  const i = Math.floor(x), f = x - i
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as V3
}

export default function ParametricSurfaceViewer() {
  const [s, set, reset] = useToolState('parametric-surface-viewer', DEF)
  const group = useRef<THREE.Group | null>(null)

  const built = useMemo(() => {
    try {
      const u0 = evalConst(s.u0, s.a), u1 = evalConst(s.u1, s.a)
      if (![u0, u1].every(Number.isFinite) || u0 === u1) throw new Error('Invalid range for ' + (s.kind === 'curve' ? 't' : 'u'))
      if (s.kind === 'curve') {
        const f = compileCurve(s.x, s.y, s.z, s.a)
        const n = Math.max(200, s.res * 6)
        const info = curveInfo(f, u0, u1, n)
        if (!info.pts.every((p) => p.every(Number.isFinite))) throw new Error('The curve produced non-finite points in this range')
        const ks = Array.from({ length: n + 1 }, (_, i) => info.kappa(u0 + ((u1 - u0) * i) / n))
        return { kind: 'curve' as const, info, ks, err: '' }
      }
      const v0 = evalConst(s.v0, s.a), v1 = evalConst(s.v1, s.a)
      if (![v0, v1].every(Number.isFinite) || v0 === v1) throw new Error('Invalid range for v')
      const f = compileSurface(s.x, s.y, s.z, s.a)
      const mesh = sampleSurface(f, u0, u1, v0, v1, s.res, s.res)
      return { kind: 'surface' as const, mesh, err: '' }
    } catch (e) {
      return { kind: 'error' as const, err: (e as Error).message }
    }
  }, [s.kind, s.x, s.y, s.z, s.u0, s.u1, s.v0, s.v1, s.a, s.res])

  const ref = useStage3D(
    (st) => {
      group.current = new THREE.Group()
      st.scene.add(group.current)
      st.onFrame((_t, dt) => { if (group.current && group.current.userData.spin) group.current.rotation.y += dt * 0.4 })
    },
    (st) => {
      const g = group.current
      if (!g) return
      g.userData.spin = s.spin
      if (built.kind === 'error') return
      st.clear(g)
      if (built.kind === 'surface') {
        const m = built.mesh
        const [lo, hi] = m.bounds
        const c = lo.map((l, i) => (l + hi[i]) / 2)
        const size = Math.max(...hi.map((h, i) => h - lo[i])) || 1
        const k = 6 / size
        const n = m.pos.length / 3
        const pos = new Float32Array(m.pos.length)
        // math z-up → three y-up
        for (let i = 0; i < n; i++) { pos[i * 3] = (m.pos[i * 3] - c[0]) * k; pos[i * 3 + 1] = (m.pos[i * 3 + 2] - c[2]) * k + 2.5; pos[i * 3 + 2] = -(m.pos[i * 3 + 1] - c[1]) * k }
        const col = new Float32Array(n * 3)
        const scaleK = robustScale(m.K), scaleH = robustScale(m.H)
        for (let i = 0; i < n; i++) {
          const rgb: V3 = s.mode === 'K' ? diverging(m.K[i] / scaleK || 0) : s.mode === 'H' ? diverging(m.H[i] / scaleH || 0) : s.mode === 'height' ? heightColor((m.pos[i * 3 + 2] - lo[2]) / (hi[2] - lo[2] || 1)) : [0.45, 0.55, 0.95]
          col.set(rgb, i * 3)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        geo.setIndex(new THREE.BufferAttribute(m.index, 1))
        geo.computeVertexNormals()
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
        if (s.wire) {
          const nu = s.res, step = Math.max(1, Math.round(s.res / 24))
          const seg: number[] = []
          const P = (i: number, j: number) => { const q = (j * (nu + 1) + i) * 3; return [pos[q], pos[q + 1], pos[q + 2]] }
          for (let j = 0; j <= nu; j += step) for (let i = 0; i < nu; i++) seg.push(...P(i, j), ...P(i + 1, j))
          for (let i = 0; i <= nu; i += step) for (let j = 0; j < nu; j++) seg.push(...P(i, j), ...P(i, j + 1))
          const lg = new THREE.BufferGeometry()
          lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3))
          g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.35 })))
        }
      } else {
        const pts = built.info.pts
        const lo = [0, 1, 2].map((d) => Math.min(...pts.map((p) => p[d]))), hi = [0, 1, 2].map((d) => Math.max(...pts.map((p) => p[d])))
        const c = lo.map((l, i) => (l + hi[i]) / 2)
        const k = 6 / (Math.max(...hi.map((h, i) => h - lo[i])) || 1)
        const v = pts.map((p) => new THREE.Vector3((p[0] - c[0]) * k, (p[2] - c[2]) * k + 2.5, -(p[1] - c[1]) * k))
        const closed = v[0].distanceTo(v[v.length - 1]) < 1e-3
        const curve = new THREE.CatmullRomCurve3(closed ? v.slice(0, -1) : v, closed)
        const segs = built.ks.length - 1, radial = 12
        const geo = new THREE.TubeGeometry(curve, segs, 0.09, radial, closed)
        const ks = built.ks.filter(Number.isFinite).sort((a, b) => a - b)
        const kmax = ks[Math.floor(ks.length * 0.95)] || 1
        const col = new Float32Array(geo.attributes.position.count * 3)
        for (let i = 0; i <= segs; i++) {
          const rgb: V3 = s.mode === 'solid' ? [0.45, 0.55, 0.95] : s.mode === 'height' ? heightColor((v[Math.min(i, v.length - 1)].y - (lo[2] - c[2]) * k - 2.5) / ((hi[2] - lo[2]) * k || 1)) : heightColor((built.ks[i] || 0) / kmax)
          for (let r = 0; r <= radial; r++) col.set(rgb, (i * (radial + 1) + r) * 3)
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })))
      }
    },
    [built, s.mode, s.wire, s.spin],
    { camera: [7, 6, 8], target: [0, 2.5, 0] },
  )

  const load = (name: string) => {
    const p = PRESETS.find((q) => q.name === name)
    if (!p) return
    set({ preset: name, kind: p.kind, x: p.x, y: p.y, z: p.z, u0: p.u[0], u1: p.u[1], v0: p.v?.[0] ?? '0', v1: p.v?.[1] ?? '1', a: p.a ?? 1, mode: p.kind === 'curve' ? 'K' : s.mode })
  }
  const curveVar = s.kind === 'curve' ? 't' : 'u, v'
  const m = built.kind === 'surface' ? built.mesh : null
  const chi = m ? m.totalK / (2 * Math.PI) : NaN

  return (
    <Split wide="right">
      <div>
        <Panel title="Definition" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={s.preset} onChange={load} options={[...PRESETS.map((p) => [p.name, `${p.kind === 'curve' ? '〰 ' : '◼ '}${p.name}`] as [string, string]), ['custom', 'Custom']]} />
          <Seg value={s.kind} onChange={(kind) => set({ kind, preset: 'custom' })} options={[['surface', 'Surface r(u, v)'], ['curve', 'Space curve r(t)']]} />
          <Txt label={`x(${curveVar})`} value={s.x} onChange={(x) => set({ x, preset: 'custom' })} />
          <Txt label={`y(${curveVar})`} value={s.y} onChange={(y) => set({ y, preset: 'custom' })} />
          <Txt label={`z(${curveVar})`} value={s.z} onChange={(z) => set({ z, preset: 'custom' })} />
          <Row>
            <Txt label={s.kind === 'curve' ? 't from' : 'u from'} value={s.u0} onChange={(u0) => set({ u0 })} />
            <Txt label="to" value={s.u1} onChange={(u1) => set({ u1 })} />
          </Row>
          {s.kind === 'surface' && (
            <Row>
              <Txt label="v from" value={s.v0} onChange={(v0) => set({ v0 })} />
              <Txt label="to" value={s.v1} onChange={(v1) => set({ v1 })} />
            </Row>
          )}
          <Slider label="Parameter a" value={s.a} onChange={(a) => set({ a })} min={-3} max={5} step={0.05} show={(v) => v.toFixed(2)} />
          {built.err && <Note tone="err">{built.err}</Note>}
          <Note>Use sin, cos, tan, sqrt, exp, ln, abs, ^, pi, e. Implicit multiplication works: <code>2pi</code>, <code>a cos(u)</code>. The free parameter <code>a</code> can appear anywhere, including ranges.</Note>
        </Panel>
        <Panel title="Display">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={s.kind === 'curve' ? [['K', 'Curvature κ'], ['height', 'Height'], ['solid', 'Solid']] : [['K', 'Gaussian K'], ['H', 'Mean H'], ['height', 'Height'], ['solid', 'Solid']]} />
          <Slider label="Resolution" value={s.res} onChange={(res) => set({ res })} min={16} max={220} step={4} show={(v) => (s.kind === 'curve' ? `${Math.max(200, v * 6)} samples` : `${v}×${v} grid`)} />
          <Row>
            {s.kind === 'surface' && <Check label="Wireframe (iso-lines)" value={s.wire} onChange={(wire) => set({ wire })} />}
            <Check label="Auto-rotate" value={s.spin} onChange={(spin) => set({ spin })} />
          </Row>
          {s.mode !== 'solid' && s.kind === 'surface' && (s.mode === 'K' || s.mode === 'H') && (
            <div style={{ fontSize: 12 }} className="muted">
              <div style={{ height: 10, borderRadius: 5, background: 'linear-gradient(90deg, rgb(38,115,242), #fff, rgb(242,77,51))' }} />
              <Row wrap={false}><span style={{ flex: 1 }}>negative (saddle)</span><span>0</span><span style={{ flex: 1, textAlign: 'right' }}>positive (dome)</span></Row>
            </div>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          {m ? <>
            <Stat label="Surface area" value={fmt(m.area, 4)} sub="sum over triangles" />
            <Stat label="∫ K dA" value={fmt(m.totalK, 4)} sub={`= 2π × ${fmt(chi, 3)}`} tone="accent" />
            <Stat label="K range (5–95%)" value={`±${fmt(robustScale(m.K), 3)}`} />
            <Stat label="Vertices" value={(m.pos.length / 3).toLocaleString()} sub={m.bad ? `${m.bad} undefined points` : 'all finite'} tone={m.bad ? 'bad' : undefined} />
          </> : built.kind === 'curve' ? <>
            <Stat label="Arc length" value={fmt(built.info.len, 5)} tone="accent" />
            <Stat label="Max curvature κ" value={fmt(Math.max(...built.ks.filter(Number.isFinite)), 4)} />
            <Stat label="Closed?" value={Math.hypot(...[0, 1, 2].map((d) => built.info.pts[0][d] - built.info.pts[built.info.pts.length - 1][d])) < 1e-6 ? 'Yes' : 'No'} />
          </> : <Stat label="Status" value="Fix the expression" tone="bad" />}
        </Stats>
        <Panel title="3D view">
          <View3D refEl={ref} height={520} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag to orbit, scroll to zoom. Math z axis points up. For closed orientable surfaces ∫K dA / 2π equals the Euler characteristic (sphere 2, torus 0) — Gauss–Bonnet.</p>
        </Panel>
      </div>
    </Split>
  )
}
