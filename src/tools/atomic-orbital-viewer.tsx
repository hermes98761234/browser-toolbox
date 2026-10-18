import { useMemo } from 'react'
import { Btn, Check, fmt, LineChart, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { isosurface, isoForProbability, meanR, orbitalName, psi, radial, radiusFor, sampleField, samplePoints } from './lib/atomic-orbital-viewer'

interface S { n: number; l: number; m: number; Z: number; mode: 'surface' | 'points' | 'both'; prob: number; quality: number; opacity: number; axes: boolean; points: number }
const DEF: S = { n: 3, l: 2, m: 0, Z: 1, mode: 'surface', prob: 0.9, quality: 56, opacity: 0.9, axes: true, points: 20000 }
const POS = '#f97316', NEG = '#3b82f6'
const PRESETS: [string, number, number, number][] = [['1s', 1, 0, 0], ['2s', 2, 0, 0], ['2p_z', 2, 1, 0], ['2p_x', 2, 1, 1], ['3s', 3, 0, 0], ['3p_z', 3, 1, 0], ['3d_z²', 3, 2, 0], ['3d_xy', 3, 2, -2], ['3d_x²−y²', 3, 2, 2], ['4d_z²', 4, 2, 0], ['4f_z³', 4, 3, 0], ['4f_xyz', 4, 3, -2], ['5f_x(x²−3y²)', 5, 3, 3], ['5g (m=0)', 5, 4, 0]]

export default function AtomicOrbitalViewer() {
  const [s, set, reset] = useToolState('atomic-orbital-viewer', DEF)
  const n = Math.min(6, Math.max(1, s.n)), l = Math.min(n - 1, Math.max(0, s.l)), m = Math.min(l, Math.max(-l, s.m))
  const ext = useMemo(() => radiusFor(n, l, s.Z, 0.995) * 1.05, [n, l, s.Z])

  const data = useMemo(() => {
    const field = sampleField((x, y, z) => psi(n, l, m, x, y, z, s.Z), s.quality, ext)
    const iso = isoForProbability(field, s.prob)
    const wantSurf = s.mode !== 'points', wantPts = s.mode !== 'surface'
    const pos = wantSurf ? isosurface(field, iso, 1) : null
    const neg = wantSurf ? isosurface(field, iso, -1) : null
    const pts = wantPts ? samplePoints(field, s.points) : null
    return { iso, pos, neg, pts, tris: ((pos?.indices.length ?? 0) + (neg?.indices.length ?? 0)) / 3 }
  }, [n, l, m, s.Z, s.quality, ext, s.prob, s.mode, s.points])

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const g = new THREE.Group()
      g.rotation.x = -Math.PI / 2 // physics z axis points up
      const sc = 4 / ext
      g.scale.setScalar(sc)
      root.add(g)
      const addMesh = (mesh: ReturnType<typeof isosurface> | null, col: string) => {
        if (!mesh || !mesh.indices.length) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
        geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
        const mat = new THREE.MeshPhongMaterial({ color: col, shininess: 60, side: THREE.DoubleSide, transparent: s.opacity < 1 || s.mode === 'both', opacity: s.mode === 'both' ? Math.min(0.45, s.opacity) : s.opacity, depthWrite: s.opacity >= 1 && s.mode !== 'both' })
        g.add(new THREE.Mesh(geo, mat))
      }
      addMesh(data.pos, POS)
      addMesh(data.neg, NEG)
      if (data.pts) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(data.pts.xyz, 3))
        const cols = new Float32Array(data.pts.sign.length * 3)
        const cp = new THREE.Color(POS), cn = new THREE.Color(NEG)
        data.pts.sign.forEach((sg, i) => (sg > 0 ? cp : cn).toArray(cols, i * 3))
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: (ext / 4) * 0.035, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false })))
      }
      const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.06 / sc * 1, 16, 12), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#facc15', emissiveIntensity: 0.6 }))
      g.add(nucleus)
      if (s.axes) {
        const ax = new THREE.AxesHelper(ext)
        g.add(ax)
        for (const [t, p, c] of [['x', [ext * 1.05, 0, 0], '#f87171'], ['y', [0, ext * 1.05, 0], '#4ade80'], ['z', [0, 0, ext * 1.05], '#60a5fa']] as const) {
          const sp = label(t, c, 0.4 / sc)
          sp.position.set(p[0], p[1], p[2])
          g.add(sp)
        }
      }
    },
    [data, s.opacity, s.axes, ext, s.mode],
    { camera: [6, 4.5, 7], grid: false, background: '#0b1020' },
  )

  const radialSeries = useMemo(() => {
    const pts: [number, number][] = [], rr: [number, number][] = []
    const N = 300
    let maxP = 0, rMax = 0
    for (let i = 0; i <= N; i++) {
      const r = (i / N) * ext
      const R = radial(n, l, r, s.Z)
      const P = r * r * R * R
      if (P > maxP) { maxP = P; rMax = r }
      pts.push([r, P])
      rr.push([r, R])
    }
    // radial nodes = sign changes of R (excluding r = 0)
    const nodes: number[] = []
    for (let i = 2; i <= N; i++) if (rr[i - 1][1] * rr[i][1] < 0) nodes.push((rr[i - 1][0] + rr[i][0]) / 2)
    const scale = maxP / Math.max(...rr.map((p) => Math.abs(p[1])))
    return { P: pts, R: rr.map(([r, v]) => [r, v * scale] as [number, number]), rMax, nodes }
  }, [n, l, s.Z, ext])

  const E = (-13.605693 * s.Z * s.Z) / (n * n)
  const mOptions: [number, string][] = []
  for (let k = -l; k <= l; k++) mOptions.push([k, `m = ${k}  ${orbitalName(n, l, k).replace(/^\d+[spdfg]_?/, '') || ''}`])

  return (
    <Split wide="right">
      <div>
        <Panel title="Orbital" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="n (shell)" value={n} onChange={(v) => set({ n: v, l: Math.min(l, v - 1), m: Math.max(-Math.min(l, v - 1), Math.min(Math.min(l, v - 1), m)) })} options={[1, 2, 3, 4, 5, 6].map((v) => [v, String(v)] as [number, string])} />
            <Select label="l (subshell)" value={l} onChange={(v) => set({ l: v, m: Math.max(-v, Math.min(v, m)) })} options={Array.from({ length: n }, (_, k) => [k, `${k} (${'spdfgh'[k]})`] as [number, string])} />
            <Select label="m (real combination)" value={m} onChange={(v) => set({ m: v })} options={mOptions} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
            {PRESETS.map(([nm, a, b, c]) => <Btn key={nm} kind={a === n && b === l && c === m ? 'primary' : 'ghost'} onClick={() => set({ n: a, l: b, m: c })}>{nm}</Btn>)}
          </div>
          <Select label="Nuclear charge Z (hydrogen-like ion)" value={s.Z} onChange={(Z) => set({ Z })} options={[[1, 'Z = 1 (H)'], [2, 'Z = 2 (He⁺)'], [3, 'Z = 3 (Li²⁺)']]} />
        </Panel>
        <Panel title="Display">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['surface', 'Isosurface'], ['points', 'Probability cloud'], ['both', 'Both']]} />
          <Slider label="Surface encloses" value={s.prob} onChange={(prob) => set({ prob })} min={0.5} max={0.98} step={0.02} show={(v) => `${Math.round(v * 100)}% of |ψ|²`} />
          <Row>
            <Select label="Grid" value={s.quality} onChange={(quality) => set({ quality })} options={[[36, '36³ fast'], [56, '56³'], [72, '72³ fine']]} />
            <Select label="Cloud points" value={s.points} onChange={(points) => set({ points })} options={[[8000, '8 000'], [20000, '20 000'], [50000, '50 000']]} />
          </Row>
          <Slider label="Surface opacity" value={s.opacity} onChange={(opacity) => set({ opacity })} min={0.3} max={1} step={0.05} show={(v) => v.toFixed(2)} />
          <Check label="Axes (z up)" value={s.axes} onChange={(axes) => set({ axes })} />
          <Note>
            <span style={{ color: POS, fontWeight: 700 }}>Orange</span> = ψ &gt; 0, <span style={{ color: NEG, fontWeight: 700 }}>blue</span> = ψ &lt; 0 (the phase). Surfaces are
            |ψ| = const chosen so the lobes contain the selected share of probability, extracted by marching tetrahedra.
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Orbital" value={orbitalName(n, l, m)} sub={`n=${n}, l=${l}, m=${m}`} tone="accent" />
          <Stat label="Energy" value={`${fmt(E, 4)} eV`} sub={`−13.606·Z²/n²`} />
          <Stat label="Nodes" value={`${n - l - 1} radial · ${l} angular`} sub={`${n - 1} total`} />
          <Stat label="⟨r⟩" value={`${fmt(meanR(n, l, s.Z), 3)} a₀`} sub={`most probable r ≈ ${fmt(radialSeries.rMax, 2)} a₀`} />
        </Stats>
        <Panel title="3D view">
          <View3D refEl={ref} height={460} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Drag to rotate, scroll to zoom. Box half-width {fmt(ext, 1)} a₀ · iso |ψ| = {data.iso.toExponential(2)} a₀⁻³ᐟ² · {data.tris.toLocaleString()} triangles
          </div>
        </Panel>
        <Panel title="Radial distribution">
          <LineChart
            series={[
              { name: 'P(r) = r²R²', points: radialSeries.P, color: POS, area: true },
              { name: 'R(r) (scaled)', points: radialSeries.R, color: NEG, dashed: true },
            ]}
            xLabel="r (a₀)"
            fx={(v) => fmt(v, 1)}
            fy={(v) => fmt(v, 3)}
            markers={[...radialSeries.nodes.map((r) => ({ x: r, label: 'node' })), { x: meanR(n, l, s.Z), label: '⟨r⟩' }]}
          />
          <div className="muted" style={{ fontSize: 12 }}>
            P(r) dr is the probability of finding the electron between r and r + dr (∫P dr = 1). Radial nodes{radialSeries.nodes.length ? ` at ${radialSeries.nodes.map((r) => fmt(r, 2)).join(', ')} a₀` : ': none'}.
          </div>
        </Panel>
      </div>
    </Split>
  )
}
