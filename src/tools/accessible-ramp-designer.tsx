import { useMemo, useRef } from 'react'
import { Btn, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { checks, IN, planRamp, type Layout, type Piece } from './lib/accessible-ramp-designer'

const DEF = {
  unit: 'imperial' as 'imperial' | 'metric',
  rise: 32 * IN,
  ratio: 12,
  maxSegRise: 30 * IN,
  landing: 60 * IN,
  width: 42 * IN,
  layout: 'l-shape' as Layout,
  gap: 0.15,
  available: 0,
}
const RAIL_H = 36 * IN

function fmtLen(m: number, unit: 'imperial' | 'metric') {
  if (!Number.isFinite(m)) return '—'
  if (unit === 'metric') return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 1000)} mm`
  const inches = Math.round((m / IN) * 10) / 10
  const ft = Math.floor(inches / 12 + 1e-9)
  const rest = Math.round((inches - ft * 12) * 10) / 10
  const r = `${Number.isInteger(rest) ? rest : rest.toFixed(1)}″`
  return ft ? (rest ? `${ft}′ ${r}` : `${ft}′`) : r
}

/** Side-profile slab: (0,0)-(len,0)-(len,y1)-(0,y0), extruded across the width. */
function slab(q: Piece, mat: THREE.Material) {
  const sh = new THREE.Shape()
  const top0 = Math.max(q.y0, 0.04), top1 = Math.max(q.y1, 0.04)
  sh.moveTo(-q.len / 2, 0)
  sh.lineTo(q.len / 2, 0)
  sh.lineTo(q.len / 2, top1)
  sh.lineTo(-q.len / 2, top0)
  sh.closePath()
  const g = new THREE.ExtrudeGeometry(sh, { depth: q.wid, bevelEnabled: false })
  g.translate(0, 0, -q.wid / 2)
  return new THREE.Mesh(g, mat)
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}

export default function AccessibleRampDesigner() {
  const [s, set, reset] = useToolState('accessible-ramp-designer', DEF)
  const u = s.unit
  const plan = useMemo(() => planRamp(s), [s])
  const list = checks(s, plan, s.available)
  const group = useRef(new THREE.Group())
  // display conversions: inches or millimetres for small sizes
  const toU = (m: number) => (u === 'imperial' ? Math.round((m / IN) * 100) / 100 : Math.round(m * 1000))
  const fromU = (v: number) => (u === 'imperial' ? v * IN : v / 1000)
  const su = u === 'imperial' ? 'in' : 'mm'

  const ref = useStage3D(
    (st) => {
      st.scene.add(group.current)
    },
    (st) => {
      const G = group.current
      st.clear(G)
      const ramp = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.85 })
      const land = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.9 })
      const rail = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.5, roughness: 0.35 })
      const fp = plan.footprint
      const ox = fp.x + fp.w / 2, oz = fp.z + fp.d / 2
      plan.pieces.forEach((q, idx) => {
        const g = new THREE.Group()
        g.position.set(q.cx - ox, 0, q.cz - oz)
        g.rotation.y = q.yaw
        g.add(slab(q, q.kind === 'ramp' ? ramp : land))
        if (plan.handrailsRequired) {
          const h = RAIL_H
          const sides = [-q.wid / 2, q.wid / 2]
          const isEnd = idx === 0 || idx === plan.pieces.length - 1
          if (q.kind === 'ramp') {
            for (const z of sides) {
              const a = new THREE.Vector3(-q.len / 2, q.y0 + h, z), b = new THREE.Vector3(q.len / 2, q.y1 + h, z)
              g.add(rod(a, b, 0.02, rail))
              const n = Math.max(1, Math.ceil(q.len / 1.5))
              for (let k = 0; k <= n; k++) {
                const t = k / n
                const p = a.clone().lerp(b, t)
                g.add(rod(new THREE.Vector3(p.x, q.y0 + (q.y1 - q.y0) * t, z), p, 0.018, rail))
              }
              // 12 in horizontal extensions at the bottom and top of the ramp
              if (idx === 1) g.add(rod(new THREE.Vector3(-q.len / 2 - 12 * IN, q.y0 + h, z), a, 0.02, rail))
              if (idx === plan.pieces.length - 2) g.add(rod(b, new THREE.Vector3(q.len / 2 + 12 * IN, q.y1 + h, z), 0.02, rail))
            }
          } else if (!isEnd) {
            const turning = q.label.startsWith('Turning')
            const edges: [THREE.Vector3, THREE.Vector3][] = turning
              ? [[new THREE.Vector3(q.len / 2, q.y0 + h, -q.wid / 2), new THREE.Vector3(q.len / 2, q.y0 + h, q.wid / 2)]]
              : sides.map((z) => [new THREE.Vector3(-q.len / 2, q.y0 + h, z), new THREE.Vector3(q.len / 2, q.y0 + h, z)])
            if (turning && s.layout === 'l-shape') edges.push([new THREE.Vector3(-q.len / 2, q.y0 + h, q.wid / 2), new THREE.Vector3(q.len / 2, q.y0 + h, q.wid / 2)])
            for (const [a, b] of edges) {
              g.add(rod(a, b, 0.02, rail))
              for (const p of [a, b]) g.add(rod(new THREE.Vector3(p.x, q.y0, p.z), p, 0.018, rail))
            }
          }
        }
        if (q.kind === 'ramp') {
          const t = label(`${q.label} · 1:${s.ratio}`, '#f8fafc', 0.26)
          t.position.set(0, (q.y0 + q.y1) / 2 + 1.25, 0)
          g.add(t)
        }
        G.add(g)
      })
      const top = plan.pieces[plan.pieces.length - 1]
      if (top) {
        const t = label(`Top +${fmtLen(top.y0, u)}`, '#34d399', 0.3)
        t.position.set(top.cx - ox, top.y0 + 1.6, top.cz - oz)
        G.add(t)
        const b = label('Start', '#fbbf24', 0.3)
        b.position.set(plan.pieces[0].cx - ox, 1.2, plan.pieces[0].cz - oz)
        G.add(b)
      }
      const size = Math.max(fp.w, fp.d, 4)
      st.controls.target.set(0, 0.4, 0)
      st.camera.position.set(size * 0.75, size * 0.6, size * 0.85)
    },
    [plan, u],
    { camera: [10, 8, 12] },
  )

  // Elevation profile (unfolded along the walking path), vertical scale exaggerated.
  const prof = useMemo(() => {
    const out: { x0: number; x1: number; y0: number; y1: number; q: Piece }[] = []
    for (const q of plan.pieces) {
      const x0 = out.length ? out[out.length - 1].x1 : 0
      out.push({ x0, x1: x0 + q.len, y0: q.y0, y1: q.y1, q })
    }
    return out
  }, [plan])
  const PW = 640, PH = 180, pad = 24
  const totalX = prof.length ? prof[prof.length - 1].x1 : 1
  const scale = (PW - 2 * pad) / totalX
  const ex = Math.max(1, Math.round((PH - 2 * pad - 24) / (Math.max(s.rise, 0.01) * scale)))
  const py = (y: number) => PH - pad - y * scale * ex

  return (
    <Split wide="right">
      <div>
        <Panel title="Site & rules" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={u} onChange={(unit) => set({ unit })} options={[['imperial', 'Inches / feet'], ['metric', 'Millimetres / metres']]} label="Units" />
          <Row>
            <Num label="Total rise" value={toU(s.rise)} onChange={(v) => set({ rise: fromU(v) })} unit={su} min={0} hint="Ground to door threshold" />
            <Select label="Max slope" value={s.ratio} onChange={(ratio) => set({ ratio })} options={[[12, '1:12 (ADA max, 8.33%)'], [14, '1:14 (7.1%)'], [15, '1:15 (6.7%)'], [16, '1:16 (6.25%)'], [20, '1:20 (5%, walkway)'], [10, '1:10 (too steep)'], [8, '1:8 (too steep)']]} />
          </Row>
          <Row>
            <Num label="Max rise per run" value={toU(s.maxSegRise)} onChange={(v) => set({ maxSegRise: Math.max(fromU(v), 0.01) })} unit={su} min={0.5} hint="ADA: 30 in / 760 mm" />
            <Num label="Clear width" value={toU(s.width)} onChange={(v) => set({ width: fromU(v) })} unit={su} min={0} hint="ADA: ≥ 36 in / 915 mm" />
          </Row>
          <Row>
            <Num label="Landing length" value={toU(s.landing)} onChange={(v) => set({ landing: fromU(v) })} unit={su} min={0} hint="ADA: ≥ 60 in / 1525 mm" />
            <Num label="Available length" value={u === 'imperial' ? Math.round((s.available / 0.3048) * 10) / 10 : Math.round(s.available * 100) / 100} onChange={(v) => set({ available: u === 'imperial' ? v * 0.3048 : v })} unit={u === 'imperial' ? 'ft' : 'm'} min={0} hint="0 = no limit" />
          </Row>
          <div className="k-label" style={{ marginTop: 6 }}>Layout</div>
          <Seg value={s.layout} onChange={(layout) => set({ layout })} options={[['straight', 'Straight'], ['l-shape', 'L-shape (90°)'], ['switchback', 'Switchback (180°)']]} label="Layout" />
        </Panel>
        <Panel title="Compliance checks">
          {list.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
              <b style={{ color: !c.ok ? 'var(--err)' : c.warn ? 'var(--warn)' : 'var(--ok)', width: 18 }}>{!c.ok ? '✗' : c.warn ? '!' : '✓'}</b>
              <span>{c.text}</span>
            </div>
          ))}
          <Note>Defaults follow the 2010 ADA Standards §405 (ramps) and §505 (handrails). Check your local code: some require 1:15 or 1:20 for long ramps, or 48 in width between rails.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Ramp runs" value={plan.segments.length} sub={`${fmtLen(plan.segments[0]?.rise ?? 0, u)} rise each`} />
          <Stat label="Total horizontal run" value={fmtLen(plan.totalRun, u)} sub={`${plan.slopePct.toFixed(2)}% · ${plan.angleDeg.toFixed(2)}°`} tone="accent" />
          <Stat label="Footprint" value={`${fmtLen(plan.footprint.w, u)} × ${fmtLen(plan.footprint.d, u)}`} sub={`${plan.landings} landings · path ${fmtLen(plan.pathLength, u)}`} />
          <Stat label="Handrail" value={plan.handrailsRequired ? fmtLen(plan.handrail, u) : 'not required'} sub={plan.handrailsRequired ? 'both sides incl. extensions' : 'rise ≤ 6 in'} />
        </Stats>
        <Panel title="3D model">
          <View3D refEl={ref} height={430} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Drag to orbit, scroll to zoom. Light slabs are ramp runs, dark ones landings; yellow rails at 36 in.</p>
        </Panel>
        <Panel title={`Elevation (path unfolded, vertical ×${ex})`}>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="ramp elevation">
            <line x1={pad} x2={PW - pad} y1={py(0)} y2={py(0)} stroke="var(--grid-strong)" />
            {prof.map((p, i) => (
              <g key={i}>
                <polygon points={`${pad + p.x0 * scale},${py(0)} ${pad + p.x1 * scale},${py(0)} ${pad + p.x1 * scale},${py(p.y1)} ${pad + p.x0 * scale},${py(p.y0)}`} fill={p.q.kind === 'ramp' ? 'var(--accent)' : 'var(--muted)'} opacity={p.q.kind === 'ramp' ? 0.55 : 0.35} />
                <text x={pad + ((p.x0 + p.x1) / 2) * scale} y={py(Math.max(p.y0, p.y1)) - 6} textAnchor="middle" fontSize={10} fill="var(--fg)">{fmtLen(p.q.len, u)}</text>
              </g>
            ))}
            <text x={PW - pad} y={14} textAnchor="end" fontSize={11} fill="var(--muted)">rise {fmtLen(s.rise, u)}</text>
          </svg>
        </Panel>
        <Panel title="Cut list" actions={<CsvButton name="ramp-plan.csv" rows={() => [['Piece', 'Horizontal length (m)', 'Rise (m)', 'Width (m)'], ...plan.pieces.map((q) => [q.label, +q.len.toFixed(3), +(q.y1 - q.y0).toFixed(3), +q.wid.toFixed(3)])]} />}>
          <Table
            head={['Piece', 'Length', 'Width', 'Rise', 'Height at end']}
            rows={plan.pieces.map((q) => [q.kind === 'ramp' ? <b key="l">{q.label}</b> : q.label, fmtLen(q.len, u), fmtLen(q.wid, u), q.kind === 'ramp' ? fmtLen(q.y1 - q.y0, u) : '—', fmtLen(q.y1, u)])}
          />
        </Panel>
      </div>
    </Split>
  )
}
