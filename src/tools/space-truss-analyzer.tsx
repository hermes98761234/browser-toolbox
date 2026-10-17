import { useMemo, useRef } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { indeterminacy, PRESETS, solveTruss, type TMember, type TNode, type TrussResult } from './lib/space-truss-analyzer'

const MATERIALS: [string, number, number, number][] = [
  // name, E (GPa), yield (MPa), density (kg/m³)
  ['Steel S235', 200, 235, 7850],
  ['Steel S355', 200, 355, 7850],
  ['Aluminium 6061-T6', 69, 240, 2700],
  ['Timber C24', 11, 24, 420],
]

interface State {
  preset: string
  nodes: TNode[]
  members: TMember[]
  material: string
  E: number
  fy: number
  rho: number
  exag: number
  showLabels: boolean
  showDeformed: boolean
}

const start = PRESETS['Lattice tower']()
const DEF: State = { preset: 'Lattice tower', ...start, material: 'Steel S235', E: 200, fy: 235, rho: 7850, exag: 1, showLabels: false, showDeformed: true }

const TENSION = new THREE.Color('#ef4444')
const COMPRESSION = new THREE.Color('#3b82f6')
const NEUTRAL = new THREE.Color('#94a3b8')

function memberColor(N: number, max: number) {
  const t = Math.min(1, Math.abs(N) / (max || 1))
  if (t < 0.01) return NEUTRAL.clone()
  return NEUTRAL.clone().lerp(N > 0 ? TENSION : COMPRESSION, 0.35 + 0.65 * t)
}

function cylinder(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = b.clone().sub(a)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  return m
}

function build(g: THREE.Group, s: State, r: TrussResult) {
  const pos = new Map(s.nodes.map((n) => [n.id, new THREE.Vector3(n.x, n.y, n.z)]))
  const box = new THREE.Box3().setFromPoints([...pos.values()])
  const span = Math.max(1, box.getSize(new THREE.Vector3()).length())
  const maxN = Math.max(1e-9, ...r.force.map(Math.abs))
  const maxA = Math.max(...s.members.map((m) => m.area), 1)
  s.members.forEach((m, k) => {
    const a = pos.get(m.a), b = pos.get(m.b)
    if (!a || !b || a.distanceTo(b) < 1e-9) return
    const N = r.ok ? r.force[k] : 0
    const mat = new THREE.MeshStandardMaterial({ color: r.ok ? memberColor(N, maxN) : NEUTRAL, roughness: 0.45, metalness: 0.3 })
    g.add(cylinder(a, b, span * (0.004 + 0.006 * Math.sqrt(m.area / maxA)), mat))
    if (s.showLabels && r.ok) {
      const t = label(`${N >= 0 ? '+' : ''}${num(N, 1)}`, N > 0 ? '#fca5a5' : N < 0 ? '#93c5fd' : '#cbd5e1', span * 0.022)
      t.position.copy(a).add(b).multiplyScalar(0.5)
      g.add(t)
    }
  })
  // deformed shape
  const maxD = Math.max(0, ...r.disp.map((d) => Math.hypot(...d)))
  if (r.ok && s.showDeformed && maxD > 0) {
    const k = ((span * 0.06) / maxD) * s.exag
    const dpos = new Map(s.nodes.map((n, i) => [n.id, new THREE.Vector3(n.x + r.disp[i][0] * k, n.y + r.disp[i][1] * k, n.z + r.disp[i][2] * k)]))
    const pts: THREE.Vector3[] = []
    for (const m of s.members) {
      const a = dpos.get(m.a), b = dpos.get(m.b)
      if (a && b) pts.push(a, b)
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.85 })))
  }
  // nodes, supports, loads
  const maxP = Math.max(1e-9, ...s.nodes.map((n) => Math.hypot(n.px, n.py, n.pz)))
  const nodeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0' })
  for (const n of s.nodes) {
    const p = pos.get(n.id)!
    const sp = new THREE.Mesh(new THREE.SphereGeometry(span * 0.012, 14, 10), nodeMat)
    sp.position.copy(p)
    g.add(sp)
    const fixedCount = Number(n.rx) + Number(n.ry) + Number(n.rz)
    if (fixedCount) {
      const h = span * 0.04
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.7, h, fixedCount === 3 ? 4 : 16), new THREE.MeshStandardMaterial({ color: fixedCount === 3 ? '#22c55e' : '#a3e635' }))
      cone.position.set(p.x, p.y - h / 2 - span * 0.01, p.z)
      g.add(cone)
    }
    const P = Math.hypot(n.px, n.py, n.pz)
    if (P > 0) {
      const dir = new THREE.Vector3(n.px, n.py, n.pz).normalize()
      const len = span * (0.05 + 0.07 * (P / maxP))
      g.add(new THREE.ArrowHelper(dir, p.clone().sub(dir.clone().multiplyScalar(len + span * 0.012)), len, 0xf97316, len * 0.3, len * 0.18))
    }
    if (s.showLabels) {
      const t = label(n.id, '#f8fafc', span * 0.02)
      t.position.set(p.x, p.y + span * 0.03, p.z)
      g.add(t)
    }
  }
}

const cell = { width: 58 }

export default function SpaceTrussAnalyzer() {
  const [s, set, reset] = useToolState('space-truss-analyzer', DEF)
  const r = useMemo(() => solveTruss(s.nodes, s.members, s.E), [s.nodes, s.members, s.E])
  const fit = useRef('')

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'truss'
      st.scene.add(g)
    },
    (st) => {
      const g = st.scene.getObjectByName('truss') as THREE.Group
      st.clear(g)
      build(g, s, r)
      const key = s.preset + s.nodes.length
      if (fit.current !== key && s.nodes.length) {
        fit.current = key
        const box = new THREE.Box3().setFromPoints(s.nodes.map((n) => new THREE.Vector3(n.x, n.y, n.z)))
        const c = box.getCenter(new THREE.Vector3())
        const size = Math.max(2, box.getSize(new THREE.Vector3()).length())
        st.controls.target.copy(c)
        st.camera.position.set(c.x + size * 1.05, c.y + size * 0.55, c.z + size * 1.2)
      }
    },
    [s, r],
    { camera: [12, 8, 14], target: [0, 3, 0] },
  )

  const editNode = (id: string, p: Partial<TNode>) => set({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) })
  const editMember = (id: string, p: Partial<TMember>) => set({ members: s.members.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const nextId = (prefix: string, ids: string[]) => {
    let k = ids.length + 1
    while (ids.includes(`${prefix}${k}`)) k++
    return `${prefix}${k}`
  }

  const maxT = r.ok ? Math.max(0, ...r.force) : 0
  const maxC = r.ok ? Math.min(0, ...r.force) : 0
  const dmag = r.disp.map((d) => Math.hypot(...d))
  const dMaxI = dmag.indexOf(Math.max(...dmag))
  const util = r.stress.map((st, k) => Math.max(Math.abs(st) / s.fy, r.force[k] < 0 ? -r.force[k] / r.pcr[k] : 0))
  const maxU = r.ok ? Math.max(0, ...util) : 0
  const weight = r.length.reduce((a, L, k) => a + L * s.members[k].area * 1e-4 * s.rho, 0)
  const deg = indeterminacy(s.nodes, s.members)
  const sumR = [0, 1, 2].map((ax) => r.reactions.reduce((a, rr) => a + rr[ax], 0))

  return (
    <div>
      <Stats>
        <Stat label="Max tension" value={r.ok ? `${num(maxT, 2)} kN` : '—'} sub={<span style={{ color: '#ef4444' }}>● tension (+)</span>} />
        <Stat label="Max compression" value={r.ok ? `${num(-maxC, 2)} kN` : '—'} sub={<span style={{ color: '#3b82f6' }}>● compression (−)</span>} />
        <Stat label="Max displacement" value={r.ok ? `${num(dmag[dMaxI] * 1000, 3)} mm` : '—'} sub={r.ok ? `at node ${s.nodes[dMaxI]?.id}` : ''} />
        <Stat label="Max utilisation" value={r.ok ? `${num(maxU * 100, 1)}%` : '—'} tone={!r.ok ? undefined : maxU > 1 ? 'bad' : 'good'} sub="yield or Euler buckling" />
        <Stat label="Self-weight" value={`${num(weight, 1)} kg`} sub={`${s.members.length} members · ${s.nodes.length} nodes`} />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="Model">
            <Row>
              <Select
                label="Example structure"
                value={s.preset}
                onChange={(preset) => set({ preset, ...PRESETS[preset]() })}
                options={Object.keys(PRESETS)}
              />
              <Select
                label="Material"
                value={s.material}
                onChange={(material) => {
                  const m = MATERIALS.find((x) => x[0] === material)!
                  set({ material, E: m[1], fy: m[2], rho: m[3] })
                }}
                options={MATERIALS.map((m) => m[0])}
              />
            </Row>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
              E = {s.E} GPa · f<sub>y</sub> = {s.fy} MPa · ρ = {s.rho} kg/m³. Units: metres, kN, cm². Y is vertical.
            </p>
            <Slider label="Deformation exaggeration" value={s.exag} onChange={(exag) => set({ exag })} min={0} max={4} step={0.25} show={(v) => `×${v}`} />
            <Row>
              <Check label="Deformed shape" value={s.showDeformed} onChange={(showDeformed) => set({ showDeformed })} />
              <Check label="Labels (forces, node ids)" value={s.showLabels} onChange={(showLabels) => set({ showLabels })} />
            </Row>
            <Row>
              <JsonButtons name="truss.json" data={{ nodes: s.nodes, members: s.members }} onLoad={(d) => d && Array.isArray(d.nodes) && Array.isArray(d.members) && set({ nodes: d.nodes, members: d.members, preset: 'Custom' })} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </Row>
          </Panel>
          <Panel title="Stability">
            {r.ok ? <Note tone="ok">Stable structure. {deg === 0 ? 'Statically determinate (m + r = 3j).' : deg > 0 ? `Statically indeterminate to degree ${deg}.` : ''}</Note> : <Note tone="err">{r.error}</Note>}
            {r.ok && (
              <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                Equilibrium check: ΣR = ({sumR.map((v) => num(v, 2)).join(', ')}) kN balances the applied loads.
              </p>
            )}
            <p className="muted" style={{ fontSize: 13 }}>
              Solved with the direct stiffness method: each bar contributes (EA/L)·[c cᵀ] to the global stiffness matrix; restrained degrees of freedom are removed and K·u = F is solved by Gaussian elimination.
            </p>
          </Panel>
        </div>
        <div>
          <Panel title="3D view" actions={<span className="muted" style={{ fontSize: 13 }}>drag to orbit · scroll to zoom · yellow = deformed</span>}>
            <View3D refEl={ref} height={460} />
          </Panel>
        </div>
      </Split>
      <Panel
        title={`Nodes (${s.nodes.length})`}
        actions={<Btn onClick={() => set({ preset: 'Custom', nodes: [...s.nodes, { id: nextId('N', s.nodes.map((n) => n.id)), x: 0, y: 0, z: 0, rx: false, ry: false, rz: false, px: 0, py: 0, pz: 0 }] })}>+ Node</Btn>}
      >
        <Table
          head={['Node', 'x (m)', 'y (m)', 'z (m)', 'Fix x/y/z', 'Px (kN)', 'Py (kN)', 'Pz (kN)', 'Displacement (mm)', 'Reaction (kN)', '']}
          rows={s.nodes.map((n, i) => {
            const fixed = n.rx || n.ry || n.rz
            return [
              <b key="id">{n.id}</b>,
              ...(['x', 'y', 'z'] as const).map((k) => <input key={k} type="number" step={0.1} value={n[k]} style={cell} onChange={(e) => editNode(n.id, { [k]: Number(e.target.value) || 0 })} aria-label={`${n.id} ${k}`} />),
              <span key="f" style={{ whiteSpace: 'nowrap' }}>
                {(['rx', 'ry', 'rz'] as const).map((k) => <input key={k} type="checkbox" style={{ width: 'auto', margin: '0 3px' }} checked={n[k]} onChange={(e) => editNode(n.id, { [k]: e.target.checked })} aria-label={`${n.id} ${k}`} />)}
              </span>,
              ...(['px', 'py', 'pz'] as const).map((k) => <input key={k} type="number" step={1} value={n[k]} style={cell} onChange={(e) => editNode(n.id, { [k]: Number(e.target.value) || 0 })} aria-label={`${n.id} ${k}`} />),
              <span key="d" className="muted" style={{ whiteSpace: 'nowrap' }}>{r.ok ? r.disp[i].map((v) => num(v * 1000, 2)).join(', ') : '—'}</span>,
              <span key="r" style={{ whiteSpace: 'nowrap' }}>{r.ok && fixed ? r.reactions[i].map((v) => num(v, 2)).join(', ') : ''}</span>,
              <Btn key="x" kind="ghost" title="Remove node and its members" onClick={() => set({ preset: 'Custom', nodes: s.nodes.filter((x) => x.id !== n.id), members: s.members.filter((m) => m.a !== n.id && m.b !== n.id) })}>✕</Btn>,
            ]
          })}
        />
      </Panel>
      <Panel
        title={`Members (${s.members.length})`}
        actions={
          <>
            <Btn disabled={s.nodes.length < 2} onClick={() => set({ preset: 'Custom', members: [...s.members, { id: nextId('M', s.members.map((m) => m.id)), a: s.nodes[0].id, b: s.nodes[1].id, area: 5 }] })}>+ Member</Btn>
            <CsvButton
              name="truss-member-forces.csv"
              rows={() => [['Member', 'From', 'To', 'Length m', 'Area cm2', 'Force kN', 'Stress MPa', 'Euler Pcr kN', 'Utilisation'], ...s.members.map((m, k) => [m.id, m.a, m.b, r.length[k].toFixed(3), m.area, r.force[k].toFixed(3), r.stress[k].toFixed(2), r.pcr[k].toFixed(1), util[k].toFixed(3)])]}
            />
          </>
        }
      >
        <Table
          head={['Member', 'From', 'To', 'Area (cm²)', 'L (m)', 'Force (kN)', 'σ (MPa)', 'Euler Pcr (kN)', 'Utilisation', '']}
          rows={s.members.map((m, k) => {
            const N = r.force[k]
            const opt = s.nodes.map((n) => <option key={n.id}>{n.id}</option>)
            return [
              <b key="id">{m.id}</b>,
              <select key="a" value={m.a} onChange={(e) => editMember(m.id, { a: e.target.value })} aria-label={`${m.id} start`}>{opt}</select>,
              <select key="b" value={m.b} onChange={(e) => editMember(m.id, { b: e.target.value })} aria-label={`${m.id} end`}>{opt}</select>,
              <input key="A" type="number" min={0.01} step={0.5} value={m.area} style={cell} onChange={(e) => editMember(m.id, { area: Math.max(0.01, Number(e.target.value) || 0.01) })} aria-label={`${m.id} area`} />,
              num(r.length[k], 3),
              <b key="N" style={{ color: !r.ok || Math.abs(N) < 1e-6 ? undefined : N > 0 ? '#ef4444' : '#3b82f6' }}>{r.ok ? `${num(N, 2)} ${Math.abs(N) < 1e-6 ? '' : N > 0 ? 'T' : 'C'}` : '—'}</b>,
              r.ok ? num(r.stress[k], 1) : '—',
              N < 0 ? num(r.pcr[k], 1) : <span key="na" className="muted">n/a</span>,
              <span key="u" style={{ color: util[k] > 1 ? 'var(--err)' : undefined, fontWeight: util[k] > 1 ? 700 : undefined }}>{r.ok ? `${num(util[k] * 100, 1)}%` : '—'}</span>,
              <Btn key="x" kind="ghost" title="Remove member" onClick={() => set({ preset: 'Custom', members: s.members.filter((x) => x.id !== m.id) })}>✕</Btn>,
            ]
          })}
        />
        <p className="muted" style={{ fontSize: 13 }}>
          Utilisation = max(|σ| / f<sub>y</sub>, |N| / P<sub>cr</sub>). Euler buckling assumes pin-ended solid round bars of the given area (I = A²/4π) — real sections such as tubes buckle later.
        </p>
      </Panel>
    </div>
  )
}
