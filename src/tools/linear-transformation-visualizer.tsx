import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { apply, classify, det3, eigenvalues, eigenvectors, fmtCx, I3, inverse, lerp, rank, type M3, type V3 } from './lib/linear-transformation-visualizer'

type Dim = '2d' | '3d'
interface State {
  dim: Dim
  m: M3
  grid: boolean
  cube: boolean
  eigen: boolean
  v: V3
  speed: number
}

const r = (deg: number) => (deg * Math.PI) / 180
const PRESETS: { name: string; dim: Dim | 'any'; m: M3 }[] = [
  { name: 'Shear', dim: 'any', m: [1, 1, 0, 0, 1, 0, 0, 0, 1] },
  { name: 'Rotate 45°', dim: 'any', m: [Math.cos(r(45)), -Math.sin(r(45)), 0, Math.sin(r(45)), Math.cos(r(45)), 0, 0, 0, 1] },
  { name: 'Scale 2 × ½', dim: 'any', m: [2, 0, 0, 0, 0.5, 0, 0, 0, 1] },
  { name: 'Symmetric stretch', dim: 'any', m: [2, 1, 0, 1, 2, 0, 0, 0, 1] },
  { name: 'Reflect y = x', dim: 'any', m: [0, 1, 0, 1, 0, 0, 0, 0, 1] },
  { name: 'Singular (rank 1)', dim: 'any', m: [1, 2, 0, 0.5, 1, 0, 0, 0, 1] },
  { name: 'Spiral (rot+scale)', dim: 'any', m: [0.9, -0.6, 0, 0.6, 0.9, 0, 0, 0, 1] },
  { name: 'Cycle axes (120° about 1,1,1)', dim: '3d', m: [0, 0, 1, 1, 0, 0, 0, 1, 0] },
  { name: 'Project onto xy-plane', dim: '3d', m: [1, 0, 0, 0, 1, 0, 0, 0, 0] },
  { name: '3-D shear', dim: '3d', m: [1, 0, 0.8, 0, 1, 0.5, 0, 0, 1] },
  { name: 'Mirror z', dim: '3d', m: [1, 0, 0, 0, 1, 0, 0, 0, -1] },
]

const DEF: State = { dim: '2d', m: [1, 1, 0, 0, 1, 0, 0, 0, 1], grid: true, cube: true, eigen: true, v: [1, 2, 1], speed: 1 }
const toW = (v: V3) => new THREE.Vector3(v[0], v[2], -v[1])
const BASIS_COL = ['#ef4444', '#22c55e', '#3b82f6']
const f = (x: number) => num(x, 3)

export default function LinearTransformationVisualizer() {
  const [s, set, reset] = useToolState('linear-transformation-visualizer', DEF)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const twoD = s.dim === '2d'
  const M = useMemo<M3>(() => (twoD ? [s.m[0], s.m[1], 0, s.m[3], s.m[4], 0, 0, 0, 1] : s.m), [s.m, twoD])
  const live = useRef({ M, t, playing, twoD, grid: s.grid, cube: s.cube, v: s.v, speed: s.speed, dirty: true, lastUi: 0 })
  useEffect(() => {
    Object.assign(live.current, { M, t, playing, twoD, grid: s.grid, cube: s.cube, v: s.v, speed: s.speed, dirty: true })
  }, [M, t, playing, twoD, s.grid, s.cube, s.v, s.speed])

  const eig = useMemo(() => eigenvalues(M, twoD), [M, twoD])
  const realVecs = useMemo(() => {
    const seen: number[] = []
    const out: { l: number; v: V3 }[] = []
    for (const z of eig) {
      if (Math.abs(z.im) > 1e-9 || seen.some((x) => Math.abs(x - z.re) < 1e-7)) continue
      seen.push(z.re)
      for (const v of eigenvectors(M, z.re, twoD)) out.push({ l: z.re, v })
    }
    return out
  }, [eig, M, twoD])

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      st.scene.add(root)
      // static faint reference grid (xy-plane)
      const ref0: number[] = []
      for (let k = -5; k <= 5; k++) ref0.push(k, 0, -5, k, 0, 5, -5, 0, k, 5, 0, k)
      const refGeo = new THREE.BufferGeometry()
      refGeo.setAttribute('position', new THREE.Float32BufferAttribute(ref0, 3))
      root.add(new THREE.LineSegments(refGeo, new THREE.LineBasicMaterial({ color: '#1e293b' })))
      // transformed lattice: x-, y-, z-parallel lines
      const base: [V3, V3, number][] = []
      for (let a = -5; a <= 5; a++) {
        base.push([[-5, a, 0], [5, a, 0], 0], [[a, -5, 0], [a, 5, 0], 1])
      }
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        if (b !== 0) base.push([[-2, a, b], [2, a, b], 0], [[a, -2, b], [a, 2, b], 1])
        base.push([[a, b, -2], [a, b, 2], 2])
      }
      const gPos = new Float32Array(base.length * 6)
      const gCol = new Float32Array(base.length * 6)
      const cols = ['#7f1d1d', '#14532d', '#1e3a8a'].map((c) => new THREE.Color(c))
      base.forEach(([, , k], i) => { for (let e = 0; e < 2; e++) gCol.set([cols[k].r * 1.6, cols[k].g * 1.6, cols[k].b * 1.6], i * 6 + e * 3) })
      const gGeo = new THREE.BufferGeometry()
      gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3))
      gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3))
      const lattice = new THREE.LineSegments(gGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 }))
      lattice.frustumCulled = false
      root.add(lattice)
      // unit cube / square
      const corners: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
      const cPos = new Float32Array(24)
      const cGeo = new THREE.BufferGeometry()
      cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3))
      cGeo.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
      const cMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      const cube = new THREE.Mesh(cGeo, cMat)
      cube.frustumCulled = false
      const eGeo = new THREE.BufferGeometry()
      const ePos = new Float32Array(24 * 3)
      eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3))
      const edges = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: '#fbbf24' }))
      edges.frustumCulled = false
      const EDGE = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
      root.add(cube, edges)
      // arrows
      const mk = (c: string, op = 1) => {
        const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, c, 0.22, 0.12)
        ;(a.line.material as THREE.LineBasicMaterial).linewidth = 2
        if (op < 1) {
          for (const mm of [a.line.material, a.cone.material] as THREE.Material[]) { mm.transparent = true; mm.opacity = op }
        }
        root.add(a)
        return a
      }
      const ghosts = BASIS_COL.map((c) => mk(c, 0.25))
      const arrows = BASIS_COL.map((c) => mk(c))
      const vGhost = mk('#e2e8f0', 0.3)
      const vArrow = mk('#e879f9')
      const labels = ['î', 'ĵ', 'k̂', 'v'].map((txt, i) => {
        const l = label(txt, i < 3 ? BASIS_COL[i] : '#e879f9', 0.42)
        root.add(l)
        return l
      })
      const setArrow = (a: THREE.ArrowHelper, v: V3) => {
        const w = toW(v)
        const len = w.length()
        a.visible = len > 1e-6
        if (!a.visible) return
        a.setDirection(w.clone().normalize())
        a.setLength(len, Math.min(0.25, len * 0.3), Math.min(0.13, len * 0.16))
      }
      const update = () => {
        const L = live.current
        const Mt = lerp(I3, L.M, L.t)
        base.forEach(([a, b], i) => {
          const visible = L.twoD ? a[2] === 0 && b[2] === 0 && Math.abs(a[0]) + Math.abs(b[0]) + Math.abs(a[1]) + Math.abs(b[1]) > 0 && (a[0] === -5 || a[1] === -5) : !(a[2] === 0 && b[2] === 0 && (Math.abs(a[0]) > 2 || Math.abs(a[1]) > 2 || Math.abs(b[0]) > 2 || Math.abs(b[1]) > 2))
          const p = visible ? toW(apply(Mt, a)) : new THREE.Vector3()
          const q = visible ? toW(apply(Mt, b)) : new THREE.Vector3()
          gPos.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6)
        })
        gGeo.attributes.position.needsUpdate = true
        lattice.visible = L.grid
        const cs = corners.map((c) => toW(apply(Mt, L.twoD ? [c[0], c[1], 0] : c)))
        cs.forEach((p, i) => cPos.set([p.x, p.y, p.z], i * 3))
        EDGE.forEach((k, i) => ePos.set([cs[k].x, cs[k].y, cs[k].z], i * 3))
        cGeo.attributes.position.needsUpdate = true
        eGeo.attributes.position.needsUpdate = true
        cGeo.computeBoundingSphere()
        const d = det3(Mt)
        cMat.color.set(d < 0 ? '#ef4444' : '#f59e0b')
        cube.visible = edges.visible = L.cube
        const E: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        E.forEach((e, i) => {
          setArrow(ghosts[i], e)
          setArrow(arrows[i], apply(Mt, e))
          const show = !(L.twoD && i === 2)
          arrows[i].visible = arrows[i].visible && show
          ghosts[i].visible = ghosts[i].visible && show
          labels[i].visible = show
          labels[i].position.copy(toW(apply(Mt, e)).multiplyScalar(1.12).add(new THREE.Vector3(0, 0.18, 0)))
        })
        const v: V3 = L.twoD ? [L.v[0], L.v[1], 0] : L.v
        setArrow(vGhost, v)
        setArrow(vArrow, apply(Mt, v))
        labels[3].position.copy(toW(apply(Mt, v)).multiplyScalar(1.08).add(new THREE.Vector3(0, 0.18, 0)))
      }
      st.onFrame((_, dt) => {
        const L = live.current
        if (L.playing) {
          L.t = Math.min(1, L.t + dt * 0.5 * L.speed)
          L.dirty = true
          const now = performance.now()
          if (L.t >= 1 || now - L.lastUi > 80) {
            L.lastUi = now
            setT(L.t)
            if (L.t >= 1) setPlaying(false)
          }
        }
        if (L.dirty) {
          L.dirty = false
          update()
        }
      })
    },
    (st) => {
      // eigenvector lines (they stay fixed during the animation: (1−t)I + tM shares M's eigenvectors)
      let g = st.scene.getObjectByName('eigen') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'eigen'
        st.scene.add(g)
      }
      st.clear(g)
      if (!s.eigen) return
      for (const { l, v } of realVecs) {
        const a = toW([v[0] * 6, v[1] * 6, v[2] * 6]), b = a.clone().multiplyScalar(-1)
        const geo = new THREE.BufferGeometry().setFromPoints([b, a])
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#facc15', dashSize: 0.25, gapSize: 0.15 }))
        line.computeLineDistances()
        g.add(line)
        const lb = label(`λ=${num(l, 3)}`, '#facc15', 0.36)
        lb.position.copy(a.clone().multiplyScalar(0.62).add(new THREE.Vector3(0, 0.25, 0)))
        g.add(lb)
      }
    },
    [realVecs, s.eigen],
    { camera: [1.6, 4.4, 3.9], target: [0.6, 0, -0.6], grid: false, background: '#0b1120' },
  )

  const det = det3(M)
  const inv = inverse(M)
  const rk = twoD ? rank(M) - 1 : rank(M)
  const editCell = (i: number, v: number) => set({ m: s.m.map((x, k) => (k === i ? v : x)) })
  const play = () => {
    live.current.t = 0
    setT(0)
    setPlaying(true)
  }
  const mv = apply(M, twoD ? [s.v[0], s.v[1], 0] : s.v)
  const n = twoD ? 2 : 3

  return (
    <Split wide="right">
      <div>
        <Panel title="Matrix" actions={<Btn kind="ghost" onClick={() => { reset(); setT(1) }}>Reset</Btn>}>
          <Seg label="Dimension" value={s.dim} onChange={(dim) => set({ dim })} options={[['2d', '2-D (plane)'], ['3d', '3-D (space)']]} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 6, margin: '10px 0', borderLeft: '2px solid var(--fg)', borderRight: '2px solid var(--fg)', padding: '4px 8px', borderRadius: 4 }}>
            {Array.from({ length: n * n }, (_, k) => {
              const i = Math.floor(k / n) * 3 + (k % n)
              return (
                <input key={i} type="number" step={0.1} value={Number(s.m[i].toFixed(4))} onChange={(e) => editCell(i, Number(e.target.value) || 0)} aria-label={`m${Math.floor(k / n) + 1}${(k % n) + 1}`} style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', color: BASIS_COL[k % n] }} />
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Columns are where the basis vectors land: column 1 = î (red), column 2 = ĵ (green){twoD ? '' : ', column 3 = k̂ (blue)'}.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.filter((p) => p.dim === 'any' || p.dim === s.dim).map((p) => (
              <Btn key={p.name} onClick={() => { set({ m: p.m }); live.current.t = 0; setT(0); setPlaying(true) }}>{p.name}</Btn>
            ))}
            <Btn onClick={() => { set({ m: s.m.map((_, i) => (twoD && (i % 3 === 2 || i >= 6) ? I3[i] : Math.round((Math.random() * 4 - 2) * 2) / 2)) }); live.current.t = 0; setT(0); setPlaying(true) }}>🎲 Random</Btn>
          </div>
        </Panel>
        <Panel title="Animation">
          <Row>
            <Btn kind="primary" onClick={play}>▶ Play from identity</Btn>
            <Btn onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '⏵ Resume'}</Btn>
          </Row>
          <Slider label="t" value={t} onChange={(v) => { setPlaying(false); setT(v) }} min={0} max={1} step={0.01} show={(v) => v.toFixed(2)} />
          <Slider label="Speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.2} max={3} step={0.1} unit="×" />
          <p className="muted" style={{ fontSize: 13 }}>Shows A(t) = (1 − t)·I + t·M. Eigenvector lines stay put for every t, because A(t) has the same eigenvectors as M.</p>
        </Panel>
        <Panel title="Show">
          <Check label="Transformed grid" value={s.grid} onChange={(grid) => set({ grid })} />
          <Check label={twoD ? 'Unit square (area = |det|)' : 'Unit cube (volume = |det|)'} value={s.cube} onChange={(cube) => set({ cube })} />
          <Check label="Eigenvector lines" value={s.eigen} onChange={(eigen) => set({ eigen })} />
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>Vector v (pink)</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 6 }}>
            {s.v.slice(0, n).map((x, i) => (
              <input key={i} type="number" step={0.5} value={x} onChange={(e) => set({ v: s.v.map((y, k) => (k === i ? Number(e.target.value) || 0 : y)) as V3 })} aria-label={`v${i + 1}`} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
            ))}
          </div>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>Mv = ({mv.slice(0, n).map(f).join(', ')})</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Determinant" value={f(twoD ? M[0] * M[4] - M[1] * M[3] : det)} tone={Math.abs(det) < 1e-9 ? 'bad' : det < 0 ? 'accent' : 'good'} sub={`${twoD ? 'area' : 'volume'} × ${f(Math.abs(det))}${det < 0 ? ', flipped' : ''}`} />
          <Stat label="Trace" value={f(twoD ? M[0] + M[4] : M[0] + M[4] + M[8])} sub="sum of eigenvalues" />
          <Stat label="Rank" value={rk} sub={rk === n ? 'invertible' : 'singular'} />
          <Stat label="t" value={t.toFixed(2)} sub={playing ? 'animating…' : 'drag the slider'} />
        </Stats>
        <Panel title="Transformation">
          <View3D refEl={ref} height={460} />
          <Note>{classify(M, twoD)}</Note>
        </Panel>
        <Panel title="Eigenvalues and eigenvectors">
          <Table
            head={['λ', 'Eigenvector (unit)', 'Meaning']}
            rows={eig
              .filter((z, i) => eig.findIndex((w) => Math.abs(w.re - z.re) < 1e-7 && Math.abs(w.im - z.im) < 1e-7) === i && z.im >= -1e-9)
              .map((z) => {
                const mult = eig.filter((w) => Math.abs(w.re - z.re) < 1e-7 && Math.abs(w.im - z.im) < 1e-7).length
                const vs = Math.abs(z.im) < 1e-9 ? realVecs.filter((x) => Math.abs(x.l - z.re) < 1e-7) : []
                return [
                  <b key="l" style={{ fontFamily: 'var(--mono)' }}>{Math.abs(z.im) > 1e-9 ? `${fmtCx(z).replace(/ \+ /, ' ± ')}` : fmtCx(z)}{mult > 1 ? <span className="muted"> (×{mult})</span> : null}</b>,
                  vs.length ? vs.map((x) => `(${x.v.slice(0, n).map((c) => num(c + 0, 3)).join(', ')})`).join(' · ') : <span key="c" className="muted">complex pair — no real direction</span>,
                  Math.abs(z.im) > 1e-9 ? `rotation by ${num((Math.atan2(Math.abs(z.im), z.re) * 180) / Math.PI, 1)}°, scale ${num(Math.hypot(z.re, z.im), 3)}` : `${Math.abs(z.re) < 1e-9 ? 'collapsed to 0' : z.re < 0 ? `flipped, ×${num(-z.re, 3)}` : `scaled ×${num(z.re, 3)}`}${mult > vs.length && vs.length ? ' · defective (shear-like)' : ''}`,
                ]
              })}
          />
        </Panel>
        <Panel title="Inverse">
          {inv ? (
            <pre style={{ fontFamily: 'var(--mono)', fontSize: 13, margin: 0 }}>
              {[0, 1, 2].slice(0, n).map((i) => '[ ' + [0, 1, 2].slice(0, n).map((j) => f(inv[i * 3 + j]).padStart(8)).join(' ') + ' ]').join('\n')}
            </pre>
          ) : (
            <Note tone="warn">No inverse: det = 0, so information is lost and the transformation cannot be undone.</Note>
          )}
        </Panel>
      </div>
    </Split>
  )
}
