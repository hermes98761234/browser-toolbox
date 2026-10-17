import { useMemo } from 'react'
import { Btn, Check, CsvButton, LineChart, Note, num, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { checkShaft, enduranceLimit, FINISH, MATERIALS, reactions, RELIABILITY, shaftLength, shoulders, type Load, type Segment } from './lib/shaft-stress-analyzer'

const DEF = {
  segs: [{ len: 30, d: 35 }, { len: 50, d: 40 }, { len: 16, d: 52 }, { len: 124, d: 46 }, { len: 70, d: 42 }, { len: 30, d: 35 }] as Segment[],
  loads: [
    { x: 60, fy: -2400, fz: 6480, torque: 350, label: 'Gear (input)' },
    { x: 250, fy: 4000, fz: -10940, torque: -350, label: 'Pinion (output)' },
  ] as Load[],
  xa: 15, xb: 305, mat: 1, finish: 'machined', rel: 0.99, kf: 1.7, kfs: 1.5, target: 1.5, labels: true,
}

const SC = 1 / 30 // scene units per mm

function heat(t: number, c: THREE.Color) {
  // blue → cyan → green → yellow → red
  const h = (1 - Math.max(0, Math.min(1, t))) * 0.66
  return c.setHSL(h, 0.9, 0.5)
}

export default function ShaftStressAnalyzer() {
  const [s, set, reset] = useToolState('shaft-stress-analyzer', DEF)
  const mat = MATERIALS[s.mat] ?? MATERIALS[1]
  const L = shaftLength(s.segs)
  const valid = s.segs.length > 0 && s.segs.every((g) => g.len > 0 && g.d > 0) && s.xb > s.xa && s.xa >= 0 && s.xb <= L
  const res = useMemo(() => (valid ? checkShaft(s.segs, s.loads, s.xa, s.xb, mat, s.finish, s.rel, s.kf, s.kfs) : null), [valid, s.segs, s.loads, s.xa, s.xb, mat, s.finish, s.rel, s.kf, s.kfs])
  const r = valid ? reactions(s.loads, s.xa, s.xb) : null
  const maxVm = res ? Math.max(...res.checks.map((c) => c.vm)) : 0
  const minNy = res ? Math.min(...res.checks.map((c) => c.ny)) : 0
  const crit = res?.critical
  const torqueSum = s.loads.reduce((a, l) => a + l.torque, 0)
  const colorMax = Math.max(1, maxVm)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'shaft'
      st.scene.add(g)
    },
    (st) => {
      const g = st.scene.getObjectByName('shaft') as THREE.Group
      st.clear(g)
      if (!res) return
      const x0 = -L / 2
      const sh = shoulders(s.segs)
      const c = new THREE.Color()
      let acc = 0
      // station lookup for internal forces
      const at = (x: number) => {
        const arr = res.st
        let lo = 0, hi = arr.length - 1
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1
          if (arr[m].x <= x) lo = m
          else hi = m
        }
        return arr[Math.abs(arr[lo].x - x) < Math.abs(arr[hi].x - x) ? lo : hi]
      }
      for (const seg of s.segs) {
        const geo = new THREE.CylinderGeometry(seg.d / 2, seg.d / 2, seg.len, 64, Math.max(2, Math.ceil(seg.len / 2)), false)
        geo.rotateZ(-Math.PI / 2)
        geo.translate(acc + seg.len / 2, 0, 0)
        const p = geo.getAttribute('position') as THREE.BufferAttribute
        const cols = new Float32Array(p.count * 3)
        for (let i = 0; i < p.count; i++) {
          const x = Math.min(acc + seg.len - 1e-4, Math.max(acc + 1e-4, p.getX(i)))
          const y = p.getY(i), z = p.getZ(i)
          const stn = at(x)
          const d = seg.d
          const I = (Math.PI * d ** 4) / 64, J = 2 * I
          const sigma = (stn.my * y + stn.mz * z) / I
          const tau = (stn.t * Math.hypot(y, z)) / J
          const near = sh.some((q) => Math.abs(q.x - x) < 2.5 && q.d === d)
          const vm = Math.sqrt((sigma * (near ? s.kf : 1)) ** 2 + 3 * (tau * (near ? s.kfs : 1)) ** 2)
          heat(vm / colorMax, c)
          cols.set([c.r, c.g, c.b], i * 3)
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
        geo.translate(x0, 0, 0)
        geo.scale(SC, SC, SC)
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 })))
        acc += seg.len
      }
      const dMax = Math.max(...s.segs.map((q) => q.d))
      // bearings
      for (const [xb, name] of [[s.xa, 'A'], [s.xb, 'B']] as const) {
        const d = res.st.find((q) => q.x >= xb)?.d ?? 30
        const b = new THREE.Mesh(new THREE.TorusGeometry((d / 2 + 5) * SC, 4 * SC, 12, 40), new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.7, roughness: 0.3 }))
        b.rotation.y = Math.PI / 2
        b.position.set((xb + x0) * SC, 0, 0)
        g.add(b)
        const ped = new THREE.Mesh(new THREE.BoxGeometry(14 * SC, (dMax * 1.3) * SC, 26 * SC), new THREE.MeshStandardMaterial({ color: '#475569' }))
        ped.position.set((xb + x0) * SC, -(d / 2 + 9 + dMax * 0.65) * SC, 0)
        g.add(ped)
        if (s.labels) {
          const lb = label(`Bearing ${name}`, '#cbd5e1', 0.3)
          lb.position.set((xb + x0) * SC, -(d / 2 + dMax * 1.5 + 14) * SC, 0)
          g.add(lb)
        }
      }
      // loads: gear disc + force arrow
      const fMax = Math.max(1, ...s.loads.map((l) => Math.hypot(l.fy, l.fz)))
      for (const l of s.loads) {
        if (l.x < 0 || l.x > L) continue
        const d = res.st.find((q) => q.x >= l.x)?.d ?? 30
        const R = d * 1.5 + 10
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * SC, R * SC, 10 * SC, 48), new THREE.MeshStandardMaterial({ color: '#334155', transparent: true, opacity: 0.45, metalness: 0.4 }))
        disc.rotation.z = Math.PI / 2
        disc.position.set((l.x + x0) * SC, 0, 0)
        g.add(disc)
        const F = Math.hypot(l.fy, l.fz)
        if (F > 0) {
          const dir = new THREE.Vector3(0, l.fy, l.fz).normalize()
          const len = (30 + 40 * (F / fMax)) * SC
          const origin = new THREE.Vector3((l.x + x0) * SC, 0, 0).sub(dir.clone().multiplyScalar(len + (d / 2) * SC))
          g.add(new THREE.ArrowHelper(dir, origin, len, 0xf8fafc, 0.35 * len, 0.18 * len))
        }
        if (s.labels) {
          const lb = label(`${l.label || 'Load'} · ${num(F / 1000, 2)} kN${l.torque ? ` · ${l.torque > 0 ? '+' : ''}${l.torque} N·m` : ''}`, '#f8fafc', 0.4)
          lb.position.set((l.x + x0) * SC, (R + 22) * SC, 0)
          g.add(lb)
        }
      }
      if (crit) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry((crit.d / 2 + 2) * SC, 1.3 * SC, 8, 48), new THREE.MeshBasicMaterial({ color: '#f43f5e' }))
        ring.rotation.y = Math.PI / 2
        ring.position.set((crit.x + x0) * SC, 0, 0)
        g.add(ring)
      }
    },
    [res, s.segs, s.loads, s.labels, s.kf, s.kfs, s.xa, s.xb, colorMax, crit, L],
    { camera: [2, 4.5, 11], grid: false },
  )

  const seEx = crit ? enduranceLimit(mat.sut, crit.d, s.finish, s.rel) : null
  const editSeg = (i: number, p: Partial<Segment>) => set({ segs: s.segs.map((g, k) => (k === i ? { ...g, ...p } : g)) })
  const editLoad = (i: number, p: Partial<Load>) => set({ loads: s.loads.map((g, k) => (k === i ? { ...g, ...p } : g)) })
  const numIn = (v: number, on: (v: number) => void, w = 72) => <input type="number" value={v} style={{ width: w }} onChange={(e) => Number.isFinite(Number(e.target.value)) && e.target.value !== '' && on(Number(e.target.value))} />
  const keyRows = res ? [
    ...shoulders(s.segs).flatMap((q) => res.checks.filter((c) => Math.abs(c.x - q.x) < 1e-3).sort((a, b) => a.nf - b.nf).slice(0, 1)),
    ...s.loads.map((l) => res.checks.filter((c) => Math.abs(c.x - l.x) < 0.01).sort((a, b) => a.nf - b.nf)[0]).filter(Boolean),
  ].sort((a, b) => a.x - b.x) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Material & fatigue" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Material" value={s.mat} onChange={(m) => set({ mat: m })} options={MATERIALS.map((m, i) => [i, `${m.name} (Sut ${m.sut}, Sy ${m.sy} MPa)`] as [number, string])} />
          <Row>
            <Select label="Surface finish" value={s.finish} onChange={(finish) => set({ finish })} options={Object.entries(FINISH).map(([k, v]) => [k, v[0]] as [string, string])} />
            <Select label="Reliability" value={s.rel} onChange={(rel) => set({ rel })} options={RELIABILITY.map(([r]) => [r, `${r * 100}%`] as [number, string])} />
          </Row>
          <Row>
            <Num label="Shoulder Kf (bending)" value={s.kf} onChange={(kf) => set({ kf })} min={1} max={4} step={0.05} />
            <Num label="Shoulder Kfs (torsion)" value={s.kfs} onChange={(kfs) => set({ kfs })} min={1} max={4} step={0.05} />
            <Num label="Target safety factor" value={s.target} onChange={(target) => set({ target })} min={1} step={0.1} />
          </Row>
        </Panel>
        <Panel title="Shaft geometry (left → right)" actions={<Btn onClick={() => set({ segs: [...s.segs, { len: 40, d: s.segs[s.segs.length - 1]?.d ?? 30 }] })}>+ Step</Btn>}>
          <Table head={['#', 'Length mm', '⌀ mm', '']} rows={s.segs.map((g, i) => [i + 1, numIn(g.len, (len) => editSeg(i, { len })), numIn(g.d, (d) => editSeg(i, { d })), <Btn key="x" kind="ghost" disabled={s.segs.length < 2} onClick={() => set({ segs: s.segs.filter((_, k) => k !== i) })}>✕</Btn>])} foot={['Σ', `${L} mm`, '', '']} />
          <Row>
            <Num label="Bearing A at" value={s.xa} onChange={(xa) => set({ xa })} unit="mm" min={0} max={L} />
            <Num label="Bearing B at" value={s.xb} onChange={(xb) => set({ xb })} unit="mm" min={0} max={L} />
          </Row>
        </Panel>
        <Panel title="Loads (gears, pulleys, sprockets)" actions={<Btn onClick={() => set({ loads: [...s.loads, { x: L / 2, fy: -1000, fz: 0, torque: 0, label: 'Load' }] })}>+ Load</Btn>}>
          <Table head={['Name', 'x mm', 'Fy N', 'Fz N', 'T N·m', '']} rows={s.loads.map((l, i) => [
            <input key="n" value={l.label} style={{ width: 92 }} onChange={(e) => editLoad(i, { label: e.target.value })} />,
            numIn(l.x, (x) => editLoad(i, { x }), 52), numIn(l.fy, (fy) => editLoad(i, { fy }), 70), numIn(l.fz, (fz) => editLoad(i, { fz }), 70), numIn(l.torque, (torque) => editLoad(i, { torque }), 52),
            <Btn key="x" kind="ghost" onClick={() => set({ loads: s.loads.filter((_, k) => k !== i) })}>✕</Btn>,
          ])} />
          <p className="muted" style={{ fontSize: 12 }}>Fy, Fz: radial and tangential components (N). Torque: + where power enters, − where it leaves; it is carried between them. For a spur gear, Ft = T / r and Fr = Ft·tan 20°.</p>
          {Math.abs(torqueSum) > 0.5 && <Note tone="warn">Torques do not balance (Σ = {num(torqueSum, 1)} N·m). The remainder is assumed to be reacted at the shaft's right end.</Note>}
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Check geometry: positive lengths and diameters, bearing A before B, both on the shaft (0–{L} mm).</Note>}
        {res && crit && (
          <>
            <Stats>
              <Stat label="Fatigue safety (DE-Goodman)" value={num(crit.nf, 2)} sub={`at x = ${num(crit.x, 0)} mm · ${crit.where}`} tone={crit.nf >= s.target ? 'good' : 'bad'} />
              <Stat label="Yield safety" value={num(minNy, 2)} sub={`Sy ${mat.sy} MPa`} tone={minNy >= s.target ? 'good' : 'bad'} />
              <Stat label="Peak von Mises" value={`${num(maxVm, 1)} MPa`} sub="incl. Kf at shoulders" />
              <Stat label="Endurance limit Se" value={`${num(crit.se, 0)} MPa`} sub={seEx ? `ka ${num(seEx.ka, 3)} · kb ${num(seEx.kb, 3)} · ke ${seEx.ke}` : ''} />
            </Stats>
            <Panel title="3D stress field" actions={<Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />}>
              <View3D refEl={ref} height={400} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
                <span>0</span>
                <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, hsl(238,90%,50%), hsl(180,90%,50%), hsl(120,90%,50%), hsl(60,90%,50%), hsl(0,90%,50%))' }} />
                <span>{num(colorMax, 0)} MPa von Mises</span>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>Surface colour is the instantaneous von Mises stress σ′ = √(σ² + 3τ²) at each point: bending varies around the circumference, torsion with radius. The red ring marks the critical section. Drag to orbit.</p>
            </Panel>
            {crit.nf < s.target && <Note tone="err">Fatigue safety {num(crit.nf, 2)} is below the target {s.target}. Increase the diameter at {crit.where} (stress scales with 1/d³), use a larger fillet (lower Kf) or a stronger steel.</Note>}
            {crit.nf >= s.target && minNy >= s.target && <Note tone="ok">The shaft meets the target safety factor of {s.target} for infinite life and first-cycle yield.</Note>}
            <Panel title="Bending moment and torque">
              <LineChart xLabel="x (mm)" fy={(v) => num(v, 0)} series={[
                { name: 'Resultant bending moment M (N·m)', points: res.st.map((q) => [q.x, q.m / 1000]) },
                { name: 'My (N·m)', points: res.st.map((q) => [q.x, q.my / 1000]), dashed: true },
                { name: 'Mz (N·m)', points: res.st.map((q) => [q.x, q.mz / 1000]), dashed: true },
                { name: 'Torque T (N·m)', points: res.st.map((q) => [q.x, q.t / 1000]), color: '#f59e0b' },
              ]} />
              {r && <p className="muted" style={{ fontSize: 13 }}>Reactions: A = ({num(r.ay, 0)}, {num(r.az, 0)}) N → {num(Math.hypot(r.ay, r.az), 0)} N · B = ({num(r.by, 0)}, {num(r.bz, 0)}) N → {num(Math.hypot(r.by, r.bz), 0)} N (bearing radial loads).</p>}
            </Panel>
            <Panel title="Stress and safety along the shaft">
              <LineChart xLabel="x (mm)" fy={(v) => num(v, 1)} series={[
                { name: 'von Mises σ′ (MPa)', points: res.checks.map((q) => [q.x, q.vm]), color: '#ef4444' },
                { name: 'Fatigue safety ×10', points: res.checks.map((q) => [q.x, Math.min(q.nf, 10) * 10]), color: '#10b981' },
              ]} />
            </Panel>
            <Panel title="Checks at critical sections" actions={<CsvButton name="shaft-checks.csv" rows={() => [['x_mm', 'location', 'd_mm', 'M_Nm', 'T_Nm', 'Kf', 'Kfs', 'vonMises_MPa', 'Se_MPa', 'n_fatigue', 'n_yield'], ...res.checks.map((c) => [c.x.toFixed(2), c.where, c.d, (c.m / 1000).toFixed(2), (c.t / 1000).toFixed(2), c.kf, c.kfs, c.vm.toFixed(2), c.se.toFixed(1), c.nf.toFixed(3), c.ny.toFixed(3)])]} />}>
              <Table head={['x mm', 'Section', 'M N·m', 'T N·m', 'σ′ MPa', 'n fatigue', 'n yield']} rows={keyRows.map((c) => [
                num(c.x, 0), c.where, num(c.m / 1000, 1), num(c.t / 1000, 1), num(c.vm, 1),
                <b key="f" style={{ color: c.nf < s.target ? 'var(--err)' : 'var(--ok)' }}>{num(c.nf, 2)}</b>,
                <span key="y" style={{ color: c.ny < s.target ? 'var(--err)' : undefined }}>{num(c.ny, 2)}</span>,
              ])} />
              <p className="muted" style={{ fontSize: 12 }}>Rotating shaft: bending is fully reversed (Ma = M), torque is steady (Tm = T). DE-Goodman: 1/n = 16/(πd³)·[2·Kf·Ma/Se + √3·Kfs·Tm/Sut]. Se = ka·kb·ke·0.5·Sut (Marin factors, Shigley).</p>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
