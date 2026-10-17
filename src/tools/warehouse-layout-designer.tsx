import { useRef, useState } from 'react'
import { Btn, Check, JsonButtons, Note, num, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { autoFill, checks, EQUIPMENT, footprint, FLUE, positions, rackHeight, type Floor, type Rack, type Zone } from './lib/warehouse-layout-designer'

const FLOOR: Floor = { w: 60, d: 40, h: 10 }
const ZONES: Zone[] = [
  { id: 'zr', name: 'Receiving', x: 0, z: 0, w: 22, d: 7, color: '#0ea5e9' },
  { id: 'zs', name: 'Shipping', x: 38, z: 0, w: 22, d: 7, color: '#10b981' },
  { id: 'zo', name: 'Office', x: 24, z: 0, w: 12, d: 6, color: '#a855f7' },
]
const START = autoFill(FLOOR, { aisle: 3.2, cross: 3.5, bayW: 2.7, depth: 1.1, levels: 5, levelH: 1.6, z0: 10, z1: 40 })
const DEF = {
  floor: FLOOR,
  equipment: 'Reach truck',
  perBay: 3,
  occupancy: 75,
  racks: START,
  zones: ZONES,
  auto: { aisle: 3.2, levels: 5, levelH: 1.6, z0: 10 },
  labels: true,
}

/** Small deterministic hash → [0,1) for stable pallet fill. */
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export default function WarehouseLayoutDesigner() {
  const [s, set, reset] = useToolState('warehouse-layout-designer', DEF)
  const [sel, setSel] = useState<string | null>(s.racks[0]?.id ?? null)
  const minAisle = EQUIPMENT[s.equipment] ?? 3
  const issues = checks(s.racks, s.zones, s.floor, minAisle)
  const bad = new Set(issues.flatMap((i) => i.ids))
  const cap = s.racks.reduce((a, r) => a + positions(r, s.perBay), 0)
  const area = s.racks.reduce((a, r) => { const f = footprint(r); return a + f.w * f.d }, 0)
  const cur = s.racks.find((r) => r.id === sel)
  const edit = (id: string, p: Partial<Rack>) => set({ racks: s.racks.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const holder = useRef<THREE.Group | null>(null)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      st.scene.add(g)
      holder.current = g
    },
    (st) => {
      const g = holder.current
      if (!g) return
      st.clear(g)
      const { w, d } = s.floor
      const ox = -w / 2, oz = -d / 2
      const floorM = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9 }))
      floorM.rotation.x = -Math.PI / 2
      g.add(floorM)
      const grid = new THREE.GridHelper(Math.max(w, d), Math.max(w, d) / 2, 0x94a3b8, 0x94a3b8)
      ;(grid.material as THREE.Material).opacity = 0.25
      ;(grid.material as THREE.Material).transparent = true
      grid.position.y = 0.01
      g.add(grid)
      // walls (low, so the inside stays visible)
      const wallM = new THREE.MeshStandardMaterial({ color: '#64748b', transparent: true, opacity: 0.35 })
      for (const [ww, dd, x, z] of [[w, 0.3, 0, -d / 2], [w, 0.3, 0, d / 2], [0.3, d, -w / 2, 0], [0.3, d, w / 2, 0]] as const) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.2, dd), wallM)
        m.position.set(x, 0.6, z)
        g.add(m)
      }
      for (const z of s.zones) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.45 }))
        m.rotation.x = -Math.PI / 2
        m.position.set(ox + z.x + z.w / 2, 0.02, oz + z.z + z.d / 2)
        g.add(m)
        if (s.labels) {
          const l = label(z.name, '#f8fafc', 2.4)
          l.position.set(ox + z.x + z.w / 2, 1, oz + z.z + z.d / 2)
          g.add(l)
        }
      }
      for (const i of issues) {
        if (!i.rect) continue
        const m = new THREE.Mesh(new THREE.PlaneGeometry(i.rect.w, i.rect.d), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.6 }))
        m.rotation.x = -Math.PI / 2
        m.position.set(ox + i.rect.x + i.rect.w / 2, 0.03, oz + i.rect.z + i.rect.d / 2)
        g.add(m)
      }
      // count instances
      let nUp = 0, nBeam = 0, nPal = 0
      for (const r of s.racks) {
        const rows = r.double ? 2 : 1
        nUp += (r.bays + 1) * 2 * rows
        nBeam += r.bays * r.levels * 2 * rows
        nPal += r.bays * r.levels * s.perBay * rows
      }
      const up = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.4, roughness: 0.5 }), Math.max(1, nUp))
      const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 }), Math.max(1, nBeam))
      const pal = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, nPal))
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3()
      const put = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)))
      }
      let iu = 0, ib = 0, ip = 0, seed = 0
      const loads = ['#a16207', '#ca8a04', '#78716c', '#e7e5e4', '#0f766e', '#b45309']
      const col = new THREE.Color()
      for (const r of s.racks) {
        const H = rackHeight(r)
        const rows = r.double ? 2 : 1
        const hot = bad.has(r.id)
        for (let row = 0; row < rows; row++) {
          const d0 = row * (r.depth + FLUE)
          // local frame: u along the rack, v across (depth)
          const at = (u: number, v: number): [number, number] => (r.along === 'x' ? [ox + r.x + u, oz + r.z + v] : [ox + r.x + v, oz + r.z + u])
          const sz = (su: number, sv: number): [number, number] => (r.along === 'x' ? [su, sv] : [sv, su])
          for (let b = 0; b <= r.bays; b++) {
            for (const v of [d0 + 0.04, d0 + r.depth - 0.04]) {
              const [x, z] = at(b * r.bayW, v)
              put(up, iu++, x, H / 2, z, 0.08, H, 0.08)
            }
          }
          for (let b = 0; b < r.bays; b++) {
            for (let l = 0; l < r.levels; l++) {
              const y = l * r.levelH
              for (const v of [d0 + 0.04, d0 + r.depth - 0.04]) {
                const [x, z] = at(b * r.bayW + r.bayW / 2, v)
                const [a, c] = sz(r.bayW, 0.06)
                put(beam, ib++, x, y + (l === 0 ? 0.08 : 0), z, a, l === 0 ? 0.02 : 0.12, c)
              }
              for (let p = 0; p < s.perBay; p++) {
                const filled = rnd(++seed) * 100 < s.occupancy
                const slot = r.bayW / s.perBay
                const [x, z] = at(b * r.bayW + slot * (p + 0.5), d0 + r.depth / 2)
                const h = filled ? Math.min(r.levelH - 0.25, 0.9 + rnd(seed + 0.5) * 0.6) : 0.0001
                const [a, c] = sz(slot * 0.85, r.depth * 0.95)
                put(pal, ip, x, y + 0.14 + h / 2, z, a, h, c)
                pal.setColorAt(ip++, col.set(hot ? '#ef4444' : loads[Math.floor(rnd(seed + 0.3) * loads.length)]))
              }
            }
          }
        }
        if (s.labels) {
          const f = footprint(r)
          const l = label(r.name, r.id === sel ? '#facc15' : '#e2e8f0', 1.8)
          l.position.set(ox + f.x + f.w / 2, H + 0.9, oz + f.z + f.d / 2)
          g.add(l)
        }
      }
      for (const im of [up, beam, pal]) {
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        g.add(im)
      }
      up.count = iu; beam.count = ib; pal.count = ip
    },
    [s, sel],
    { camera: [24, 26, 32], target: [0, 0, 3], background: '#0f172a', grid: false },
  )

  // ---- 2D plan with drag ----
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; kind: 'rack' | 'zone'; dx: number; dz: number } | null>(null)
  const toM = (e: React.PointerEvent) => {
    const pt = svg.current!.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }
  const snap = (v: number) => Math.round(v * 10) / 10
  const onMove = (e: React.PointerEvent) => {
    const dr = drag.current
    if (!dr) return
    const [x, z] = toM(e)
    if (dr.kind === 'rack') edit(dr.id, { x: snap(x - dr.dx), z: snap(z - dr.dz) })
    else set({ zones: s.zones.map((q) => (q.id === dr.id ? { ...q, x: snap(x - dr.dx), z: snap(z - dr.dz) } : q)) })
  }

  const runAuto = () => {
    const racks = autoFill(s.floor, { aisle: Math.max(s.auto.aisle, minAisle), cross: 3.5, bayW: 2.7, depth: 1.1, levels: s.auto.levels, levelH: s.auto.levelH, z0: s.auto.z0, z1: s.floor.d })
    set({ racks })
    setSel(racks[0]?.id ?? null)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Building" actions={<Btn kind="ghost" onClick={() => { reset(); setSel(START[0]?.id ?? null) }}>Reset</Btn>}>
          <Row>
            <Num label="Width" value={s.floor.w} onChange={(w) => set({ floor: { ...s.floor, w } })} unit="m" min={5} max={400} />
            <Num label="Depth" value={s.floor.d} onChange={(d) => set({ floor: { ...s.floor, d } })} unit="m" min={5} max={400} />
            <Num label="Clear height" value={s.floor.h} onChange={(h) => set({ floor: { ...s.floor, h } })} unit="m" min={3} max={40} />
          </Row>
          <Select label={`Equipment (min aisle ${minAisle} m)`} value={s.equipment} onChange={(equipment) => set({ equipment })} options={Object.keys(EQUIPMENT)} />
          <Row>
            <Num label="Pallets per bay" value={s.perBay} onChange={(perBay) => set({ perBay: Math.max(1, Math.round(perBay)) })} min={1} max={4} step={1} />
            <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
          </Row>
          <Slider label="Occupancy shown" value={s.occupancy} onChange={(occupancy) => set({ occupancy })} min={0} max={100} unit="%" />
        </Panel>
        <Panel title="Auto layout">
          <Row>
            <Num label="Aisle width" value={s.auto.aisle} onChange={(aisle) => set({ auto: { ...s.auto, aisle } })} unit="m" min={1.5} />
            <Num label="Racks start at" value={s.auto.z0} onChange={(z0) => set({ auto: { ...s.auto, z0 } })} unit="m" min={0} hint="leave room for docks" />
          </Row>
          <Row>
            <Num label="Levels" value={s.auto.levels} onChange={(levels) => set({ auto: { ...s.auto, levels: Math.max(1, Math.round(levels)) } })} min={1} max={15} step={1} />
            <Num label="Level height" value={s.auto.levelH} onChange={(levelH) => set({ auto: { ...s.auto, levelH } })} unit="m" min={0.8} max={3} step={0.1} />
          </Row>
          <Btn kind="primary" onClick={runAuto}>Fill floor with racks</Btn>
          <p className="muted" style={{ fontSize: 13 }}>Rows run along the width: single rows on the walls, back-to-back rows in between, 2.7 m bays × 1.1 m deep, 3.5 m cross aisles at the ends.</p>
        </Panel>
        <Panel title={cur ? `Selected · ${cur.name}` : 'Selected rack'} actions={<Btn onClick={() => { const id = uid(); set({ racks: [...s.racks, { id, name: `Rack ${s.racks.length + 1}`, x: 1, z: 1, along: 'z', bays: 6, bayW: 2.7, depth: 1.1, levels: 4, levelH: 1.6, double: false }] }); setSel(id) }}>+ Rack</Btn>}>
          {cur ? (
            <>
              <Row>
                <input value={cur.name} onChange={(e) => edit(cur.id, { name: e.target.value })} aria-label="Rack name" style={{ flex: 1 }} />
                <Btn onClick={() => edit(cur.id, { along: cur.along === 'x' ? 'z' : 'x' })}>⟳ Rotate</Btn>
                <Btn kind="danger" onClick={() => { set({ racks: s.racks.filter((r) => r.id !== cur.id) }); setSel(null) }}>Delete</Btn>
              </Row>
              <Row>
                <Num label="X" value={cur.x} onChange={(x) => edit(cur.id, { x })} unit="m" />
                <Num label="Z" value={cur.z} onChange={(z) => edit(cur.id, { z })} unit="m" />
                <Num label="Bays" value={cur.bays} onChange={(bays) => edit(cur.id, { bays: Math.max(1, Math.round(bays)) })} min={1} step={1} />
              </Row>
              <Row>
                <Num label="Levels" value={cur.levels} onChange={(levels) => edit(cur.id, { levels: Math.max(1, Math.round(levels)) })} min={1} step={1} />
                <Num label="Level height" value={cur.levelH} onChange={(levelH) => edit(cur.id, { levelH })} unit="m" min={0.5} step={0.1} />
                <Num label="Bay width" value={cur.bayW} onChange={(bayW) => edit(cur.id, { bayW })} unit="m" min={0.9} step={0.1} />
              </Row>
              <Check label="Back-to-back (double row)" value={cur.double} onChange={(double) => edit(cur.id, { double })} />
              <p className="muted" style={{ fontSize: 13 }}>{positions(cur, s.perBay)} pallet positions · {rackHeight(cur).toFixed(1)} m tall</p>
            </>
          ) : <Note>Click a rack on the plan to edit it.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pallet positions" value={num(cap, 0)} sub={`${num(Math.round((cap * s.occupancy) / 100), 0)} filled at ${s.occupancy}%`} tone="accent" />
          <Stat label="Racks" value={s.racks.length} sub={`${s.racks.reduce((a, r) => a + r.bays * (r.double ? 2 : 1), 0)} bays`} />
          <Stat label="Floor used by racks" value={`${((area / (s.floor.w * s.floor.d)) * 100).toFixed(0)}%`} sub={`${num(area, 0)} of ${num(s.floor.w * s.floor.d, 0)} m²`} />
          <Stat label="Issues" value={issues.length} tone={issues.length ? 'bad' : 'good'} sub={issues.length ? 'see list below' : 'all checks pass'} />
        </Stats>
        <Panel title="3D view">
          <View3D refEl={ref} height={400} />
        </Panel>
        <Panel title="Plan (drag racks and zones)" actions={<JsonButtons name="warehouse-layout.json" data={s} onLoad={(d) => set(d)} />}>
          <svg
            ref={svg}
            viewBox={`-1 -1 ${s.floor.w + 2} ${s.floor.d + 2}`}
            style={{ width: '100%', display: 'block', touchAction: 'none', background: 'var(--panel2)', borderRadius: 8 }}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
          >
            <rect x={0} y={0} width={s.floor.w} height={s.floor.d} fill="none" stroke="var(--fg)" strokeWidth={0.3} />
            {s.zones.map((z) => (
              <g key={z.id} style={{ cursor: 'move' }} onPointerDown={(e) => { const [x, y] = toM(e); drag.current = { id: z.id, kind: 'zone', dx: x - z.x, dz: y - z.z } }}>
                <rect x={z.x} y={z.z} width={z.w} height={z.d} fill={z.color} opacity={0.35} />
                <text x={z.x + z.w / 2} y={z.z + z.d / 2 + 0.6} fontSize={1.6} textAnchor="middle" fill="var(--fg)">{z.name}</text>
              </g>
            ))}
            {issues.filter((i) => i.rect).map((i, k) => <rect key={k} x={i.rect!.x} y={i.rect!.z} width={i.rect!.w} height={i.rect!.d} fill="#ef4444" opacity={0.5} />)}
            {s.racks.map((r) => {
              const f = footprint(r)
              return (
                <g key={r.id} style={{ cursor: 'move' }} onPointerDown={(e) => { const [x, y] = toM(e); setSel(r.id); drag.current = { id: r.id, kind: 'rack', dx: x - r.x, dz: y - r.z } }}>
                  <rect x={f.x} y={f.z} width={f.w} height={f.d} fill={bad.has(r.id) ? '#ef4444' : '#f97316'} stroke={r.id === sel ? '#facc15' : '#1d4ed8'} strokeWidth={r.id === sel ? 0.4 : 0.15} />
                  {r.double && (r.along === 'x' ? <line x1={f.x} x2={f.x + f.w} y1={f.z + f.d / 2} y2={f.z + f.d / 2} stroke="#1d4ed8" strokeWidth={0.1} /> : <line y1={f.z} y2={f.z + f.d} x1={f.x + f.w / 2} x2={f.x + f.w / 2} stroke="#1d4ed8" strokeWidth={0.1} />)}
                </g>
              )
            })}
          </svg>
          <p className="muted" style={{ fontSize: 12 }}>Top view, 1 unit = 1 m, snaps to 10 cm. Docks/front wall at the top. Red strips are aisles narrower than {minAisle} m.</p>
        </Panel>
        <Panel title="Checks">
          {issues.length ? issues.map((i, k) => <Note key={k} tone={i.kind === 'aisle' || i.kind === 'zone' ? 'warn' : 'err'}>{i.msg}</Note>) : <Note tone="ok">Aisles ≥ {minAisle} m, no overlaps, everything inside the building and below the sprinkler clearance.</Note>}
          <Table
            head={['Rack', 'Size (m)', 'Levels', 'Positions']}
            rows={s.racks.map((r) => { const f = footprint(r); return [<button key="n" type="button" className="k-btn ghost" onClick={() => setSel(r.id)}>{r.name}</button>, `${f.w.toFixed(1)} × ${f.d.toFixed(1)} × ${rackHeight(r).toFixed(1)}`, r.levels, positions(r, s.perBay)] })}
            foot={['Total', '', '', String(cap)]}
          />
        </Panel>
      </div>
    </Split>
  )
}
