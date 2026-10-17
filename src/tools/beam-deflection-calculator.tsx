import { useMemo } from 'react'
import { Btn, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState, CsvButton, fmt } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { analyze, type BeamResult, type Load, type Support } from './lib/beam-deflection-calculator'

const SECTIONS: [string, number, number][] = [
  ['IPE 160', 869, 160], ['IPE 200', 1943, 200], ['IPE 270', 5790, 270], ['IPE 300', 8356, 300], ['IPE 400', 23130, 400],
  ['HEA 200', 3692, 190], ['HEB 300', 25170, 300], ['Timber 50×150', 1406, 150], ['Timber 100×200', 6667, 200], ['Timber 200×300', 45000, 300],
]
const MATERIALS: [string, number, number][] = [['Steel S235', 210, 235], ['Steel S355', 210, 355], ['Aluminium 6061-T6', 69, 240], ['Timber C24', 11, 24], ['Glulam GL28h', 12.6, 28]]
const SUPPORTS: [Support, string][] = [['simple', 'Simply supported'], ['cantilever', 'Cantilever (fixed left)'], ['overhang', 'Overhanging (2 pins)'], ['propped', 'Propped cantilever'], ['fixed', 'Fixed – fixed']]

interface State {
  L: number; support: Support; a: number; b: number
  section: string; I: number; h: number; material: string; E: number; fy: number
  limit: number; exag: number; loads: Load[]
}
const DEF: State = {
  L: 6, support: 'simple', a: 0, b: 4.5, section: 'IPE 200', I: 1943, h: 200, material: 'Steel S235', E: 210, fy: 235, limit: 250, exag: 1,
  loads: [
    { id: 'p1', kind: 'point', x: 2, x2: 0, v: 12 },
    { id: 'u1', kind: 'udl', x: 0, x2: 6, v: 4 },
  ],
}

const KIND_COLOR = { point: '#f97316', udl: '#0ea5e9', moment: '#a855f7' }

function mColor(m: number, max: number): THREE.Color {
  const t = Math.max(-1, Math.min(1, m / (max || 1)))
  const grey = new THREE.Color('#94a3b8')
  return t >= 0 ? grey.lerp(new THREE.Color('#ef4444'), t) : grey.lerp(new THREE.Color('#3b82f6'), -t)
}

function build(group: THREE.Group, s: State, r: BeamResult | null) {
  const S = 10 / s.L, H = 0.4, W = 0.32
  const X = (xm: number) => xm * S - 5
  const maxY = r ? Math.max(1e-12, Math.abs(r.maxDefl.v)) : 1
  const k = (s.exag * 1.2) / (maxY * S) // metres of deflection → metres of display
  const yAt = (xm: number) => {
    if (!r) return 0
    let i = r.xs.findIndex((v) => v >= xm)
    if (i <= 0) i = Math.max(0, i)
    const x0 = r.xs[Math.max(0, i - 1)], x1 = r.xs[i] ?? r.xs[r.xs.length - 1]
    const y0 = r.y[Math.max(0, i - 1)], y1 = r.y[i] ?? r.y[r.y.length - 1]
    const t = x1 > x0 ? (xm - x0) / (x1 - x0) : 0
    return (y0 + (y1 - y0) * t) * k * S
  }
  const mAt = (xm: number) => {
    if (!r) return 0
    const i = Math.max(0, r.xs.findIndex((v) => v >= xm))
    return r.M[i]
  }
  const mMax = r ? Math.max(Math.abs(r.maxM.v), Math.abs(r.minM.v)) : 1
  // undeformed ghost
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(10, H, W), new THREE.MeshBasicMaterial({ color: '#64748b', wireframe: true, transparent: true, opacity: 0.25 }))
  group.add(ghost)
  // deformed beam with moment colouring
  const geo = new THREE.BoxGeometry(10, H, W, 240, 1, 1)
  const pos = geo.attributes.position
  const cols: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const xm = (pos.getX(i) + 5) / S
    pos.setY(i, pos.getY(i) + yAt(xm))
    const c = mColor(mAt(xm), mMax)
    cols.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals()
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })))
  // supports
  const supMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1' })
  const pin = (xm: number, roller: boolean) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 24), supMat)
    cone.position.set(X(xm), -H / 2 - 0.225, 0)
    group.add(cone)
    if (roller) for (const dx of [-0.15, 0.15]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 16), supMat)
      cyl.rotation.x = Math.PI / 2
      cyl.position.set(X(xm) + dx, -H / 2 - 0.53, 0)
      group.add(cyl)
    }
  }
  const wall = (xm: number) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2, 1.2), new THREE.MeshStandardMaterial({ color: '#475569' }))
    w.position.set(X(xm) + (xm === 0 ? -0.125 : 0.125), 0, 0)
    group.add(w)
  }
  if (s.support === 'simple') { pin(0, false); pin(s.L, true) }
  if (s.support === 'overhang') { pin(Math.min(s.a, s.b), false); pin(Math.max(s.a, s.b), true) }
  if (s.support === 'cantilever') wall(0)
  if (s.support === 'propped') { wall(0); pin(s.L, true) }
  if (s.support === 'fixed') { wall(0); wall(s.L) }
  // loads
  const top = (xm: number) => H / 2 + yAt(xm)
  const maxP = Math.max(1, ...s.loads.filter((l) => l.kind === 'point').map((l) => Math.abs(l.v)))
  const maxW = Math.max(1, ...s.loads.filter((l) => l.kind === 'udl').map((l) => Math.abs(l.v)))
  for (const l of s.loads) {
    const c = new THREE.Color(KIND_COLOR[l.kind])
    if (l.kind === 'point') {
      const len = 0.8 + (1.2 * Math.abs(l.v)) / maxP
      const x = X(Math.min(s.L, Math.max(0, l.x)))
      const down = l.v >= 0
      const y0 = top(l.x)
      group.add(new THREE.ArrowHelper(new THREE.Vector3(0, down ? -1 : 1, 0), new THREE.Vector3(x, down ? y0 + len : y0, 0), len, c, 0.3, 0.2))
      const t = label(`${fmt(l.v, 3)} kN`, KIND_COLOR.point, 0.45)
      t.position.set(x, y0 + len + 0.3, 0)
      group.add(t)
    } else if (l.kind === 'udl') {
      const a = Math.max(0, Math.min(l.x, l.x2)), b = Math.min(s.L, Math.max(l.x, l.x2))
      if (b <= a) continue
      const len = 0.4 + (0.6 * Math.abs(l.v)) / maxW
      const n = Math.max(2, Math.round((b - a) * S * 1.6))
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= n; i++) {
        const xm = a + ((b - a) * i) / n
        const y0 = top(xm)
        pts.push(new THREE.Vector3(X(xm), y0 + len, 0))
        group.add(new THREE.ArrowHelper(new THREE.Vector3(0, l.v >= 0 ? -1 : 1, 0), new THREE.Vector3(X(xm), l.v >= 0 ? y0 + len : y0, 0), len, c, 0.18, 0.12))
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c })))
      const t = label(`${fmt(l.v, 3)} kN/m`, KIND_COLOR.udl, 0.42)
      t.position.set(X((a + b) / 2), top((a + b) / 2) + len + 0.3, 0.2)
      group.add(t)
    } else {
      const x = X(Math.min(s.L, Math.max(0, l.x)))
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 40, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: c }))
      arc.position.set(x, yAt(l.x), 0)
      arc.rotation.z = l.v >= 0 ? Math.PI / 4 : Math.PI * 0.75
      if (l.v < 0) arc.scale.x = -1
      group.add(arc)
      const t = label(`${fmt(l.v, 3)} kN·m ${l.v >= 0 ? '↻' : '↺'}`, KIND_COLOR.moment, 0.42)
      t.position.set(x, yAt(l.x) + 0.95, 0)
      group.add(t)
    }
  }
}

export default function BeamDeflectionCalculator() {
  const [s, set, reset] = useToolState('beam-deflection-calculator', DEF)
  const EI = s.E * 1e9 * s.I * 1e-8
  const res = useMemo(() => {
    try {
      if (!(s.L > 0) || !(EI > 0)) throw new Error('Length, E and I must be positive.')
      return { r: analyze({ L: s.L, support: s.support, a: s.a, b: s.b, EI, loads: s.loads }), err: '' }
    } catch (e) {
      return { r: null, err: (e as Error).message }
    }
  }, [s.L, s.support, s.a, s.b, EI, s.loads])
  const r = res.r

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'beam'
      st.scene.add(g)
      const grid = new THREE.GridHelper(16, 16, 0x475569, 0x1e293b)
      grid.position.y = -1.3
      st.scene.add(grid)
    },
    (st) => {
      const g = st.scene.getObjectByName('beam') as THREE.Group
      st.clear(g)
      build(g, s, r)
    },
    [s, r],
    { camera: [0.8, 2.4, 8.2], target: [0, 0, 0], grid: false },
  )

  const editLoad = (id: string, p: Partial<Load>) => set({ loads: s.loads.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const addLoad = (kind: Load['kind']) =>
    set({ loads: [...s.loads, { id: uid(), kind, x: kind === 'udl' ? 0 : s.L / 2, x2: s.L, v: kind === 'udl' ? 2 : kind === 'moment' ? 5 : 10 }] })

  const maxDmm = r ? Math.abs(r.maxDefl.v) * 1000 : NaN
  const ratio = r && maxDmm > 0 ? (s.support === 'cantilever' ? (2 * s.L) / Math.abs(r.maxDefl.v) : s.L / Math.abs(r.maxDefl.v)) : Infinity
  const Mabs = r ? Math.max(Math.abs(r.maxM.v), Math.abs(r.minM.v)) : NaN
  const sigma = (Mabs * (s.h / 2000)) / (s.I * 1e-8) / 1e6
  const util = sigma / s.fy
  const pts = (arr: number[] | undefined, f: number): [number, number][] => (r && arr ? r.xs.map((x, i) => [x, arr[i] * f]) : [])

  return (
    <Split>
      <div>
        <Panel title="Beam & supports" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Support type" value={s.support} onChange={(support) => set({ support })} options={SUPPORTS} />
          <Row>
            <Num label="Span length L" value={s.L} unit="m" min={0.1} onChange={(L) => L > 0 && set({ L })} />
            {s.support === 'overhang' && <Num label="Pin A at" value={s.a} unit="m" min={0} max={s.L} onChange={(a) => set({ a })} />}
            {s.support === 'overhang' && <Num label="Roller B at" value={s.b} unit="m" min={0} max={s.L} onChange={(b) => set({ b })} />}
          </Row>
        </Panel>
        <Panel title="Section & material">
          <Row>
            <Select label="Section" value={s.section} onChange={(section) => {
              const p = SECTIONS.find((x) => x[0] === section)
              set(p ? { section, I: p[1], h: p[2] } : { section })
            }} options={[...SECTIONS.map((x) => x[0]), 'Custom']} />
            <Select label="Material" value={s.material} onChange={(material) => {
              const p = MATERIALS.find((x) => x[0] === material)
              set(p ? { material, E: p[1], fy: p[2] } : { material })
            }} options={[...MATERIALS.map((x) => x[0]), 'Custom']} />
          </Row>
          <Row>
            <Num label="I (second moment)" value={s.I} unit="cm⁴" min={0} onChange={(I) => set({ I, section: 'Custom' })} />
            <Num label="Depth h" value={s.h} unit="mm" min={0} onChange={(h) => set({ h, section: 'Custom' })} />
          </Row>
          <Row>
            <Num label="E (Young's modulus)" value={s.E} unit="GPa" min={0} onChange={(E) => set({ E, material: 'Custom' })} />
            <Num label="Allowable stress" value={s.fy} unit="MPa" min={0} onChange={(fy) => set({ fy, material: 'Custom' })} />
          </Row>
          <Select label="Deflection limit" value={s.limit} onChange={(limit) => set({ limit })} options={[[180, 'L/180 (roofs)'], [250, 'L/250 (general)'], [360, 'L/360 (floors, brittle finishes)'], [500, 'L/500 (strict)']]} />
        </Panel>
        <Panel title="Loads" actions={<><Btn onClick={() => addLoad('point')}>+ Point</Btn><Btn onClick={() => addLoad('udl')}>+ UDL</Btn><Btn onClick={() => addLoad('moment')}>+ Moment</Btn></>}>
          <Table
            head={['Type', 'x / from (m)', 'to (m)', 'Value', '']}
            rows={s.loads.map((l) => [
              <span key="k" style={{ color: KIND_COLOR[l.kind], fontWeight: 700 }}>{l.kind === 'udl' ? 'UDL' : l.kind === 'point' ? 'Point' : 'Moment'}</span>,
              <input key="x" type="number" step="any" value={l.x} min={0} max={s.L} style={{ width: 70 }} aria-label="Position" onChange={(e) => editLoad(l.id, { x: Number(e.target.value) || 0 })} />,
              l.kind === 'udl' ? <input key="x2" type="number" step="any" value={l.x2} min={0} max={s.L} style={{ width: 70 }} aria-label="End" onChange={(e) => editLoad(l.id, { x2: Number(e.target.value) || 0 })} /> : '—',
              <span key="v" style={{ whiteSpace: 'nowrap' }}><input type="number" step="any" value={l.v} style={{ width: 70 }} aria-label="Value" onChange={(e) => editLoad(l.id, { v: Number(e.target.value) || 0 })} /> <span className="muted">{l.kind === 'udl' ? 'kN/m' : l.kind === 'point' ? 'kN' : 'kN·m'}</span></span>,
              <Btn key="d" kind="ghost" title="Remove" onClick={() => set({ loads: s.loads.filter((x) => x.id !== l.id) })}>✕</Btn>,
            ])}
          />
          <Note>Point and distributed loads act downward when positive; moments are clockwise when positive. Self-weight is not included — add it as a UDL.</Note>
        </Panel>
      </div>
      <div>
        {res.err && <Note tone="err">{res.err}</Note>}
        <Stats>
          <Stat label="Max deflection" value={`${fmt(maxDmm, 3)} mm`} sub={r ? `at x = ${fmt(r.maxDefl.x, 3)} m · L/${Number.isFinite(ratio) ? Math.round(ratio) : '∞'}` : ''} tone={ratio >= s.limit ? 'good' : 'bad'} />
          <Stat label="Max moment" value={`${fmt(Mabs / 1000, 4)} kN·m`} sub={r ? `+${fmt(r.maxM.v / 1000, 4)} / ${fmt(r.minM.v / 1000, 4)}` : ''} />
          <Stat label="Max shear" value={`${fmt(r ? Math.abs(r.maxV.v) / 1000 : NaN, 4)} kN`} sub={r ? `at x = ${fmt(r.maxV.x, 3)} m` : ''} />
          <Stat label="Bending stress" value={`${fmt(sigma, 4)} MPa`} sub={`${fmt(util * 100, 3)}% of ${s.fy} MPa`} tone={util <= 1 ? 'good' : 'bad'} />
        </Stats>
        {r && (ratio < s.limit ? <Note tone="warn">Deflection L/{Math.round(ratio)} exceeds the L/{s.limit} limit{s.support === 'cantilever' ? ' (cantilevers use 2L)' : ''}. Choose a deeper section or shorten the span.</Note> : <Note tone="ok">Deflection L/{Number.isFinite(ratio) ? Math.round(ratio) : '∞'} is within L/{s.limit}{util > 1 ? ', but the bending stress is too high' : ''}.</Note>)}
        <Panel title="Deformed beam (3D)">
          <View3D refEl={ref} height={340} />
          <Slider label="Exaggeration" value={s.exag} min={0} max={2.5} step={0.05} onChange={(exag) => set({ exag })} show={() => (r && Math.abs(r.maxDefl.v) > 0 ? `×${fmt((s.exag * 1.2) / (Math.abs(r.maxDefl.v) * (10 / s.L)), 3)}` : '—')} />
          <p className="muted" style={{ fontSize: 12 }}>Colour = bending moment: <span style={{ color: '#ef4444' }}>red sagging</span>, <span style={{ color: '#3b82f6' }}>blue hogging</span>. Drag to orbit, scroll to zoom.</p>
        </Panel>
        <Panel title="Shear force V (kN)"><LineChart height={170} series={[{ name: 'V', points: pts(r?.V, 1e-3), color: '#0ea5e9', area: true }]} xLabel="x (m)" /></Panel>
        <Panel title="Bending moment M (kN·m)"><LineChart height={170} series={[{ name: 'M', points: pts(r?.M, 1e-3), color: '#ef4444', area: true }]} xLabel="x (m)" /></Panel>
        <Panel title="Deflection (mm)" actions={<CsvButton name="beam.csv" rows={() => [['x_m', 'V_kN', 'M_kNm', 'slope_rad', 'deflection_mm'], ...(r ? r.xs.map((x, i) => [x, r.V[i] / 1e3, r.M[i] / 1e3, r.theta[i], r.y[i] * 1e3]) : [])]} />}>
          <LineChart height={170} series={[{ name: 'y', points: pts(r?.y, 1e3), color: '#6366f1', area: true }]} xLabel="x (m)" />
        </Panel>
        {r && (
          <Panel title="Reactions">
            <Table head={['Support', 'x (m)', 'Vertical (kN, + up)', 'Moment (kN·m)']} rows={r.reactions.map((q) => [q.label, fmt(q.x, 3), fmt(q.F / 1e3, 4), q.M === undefined ? '—' : fmt(q.M / 1e3, 4)])} />
            <p className="muted" style={{ fontSize: 12 }}>EI = {fmt(EI / 1e3, 5)} kN·m². Euler–Bernoulli theory (small deflections, no shear deformation). Fixed-end moments shown as internal moment (negative = hogging).</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
