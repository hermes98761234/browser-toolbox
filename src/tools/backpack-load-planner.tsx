import { useMemo } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { advise, centreOfMass, TARGET, ZONES, zoneLoad, type Activity, type Item, type ZoneId } from './lib/backpack-load-planner'

const it = (name: string, kg: number, liters: number, zone: ZoneId): Item => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, kg, liters, zone })
const DEF = {
  unit: 'kg' as 'kg' | 'lb',
  act: 'trail' as Activity,
  capacity: 55,
  packKg: 1.6,
  bodyKg: 75,
  heightCm: 72, // pack height
  items: [
    it('Sleeping bag', 1.1, 8, 'bottom'),
    it('Sleeping pad', 0.5, 4, 'front'),
    it('Food (3 days)', 2.4, 7, 'core'),
    it('Water reservoir 2 L', 2.1, 2.5, 'core'),
    it('Tent body + poles', 1.6, 4, 'core'),
    it('Stove, pot & fuel', 0.75, 2.5, 'front'),
    it('Spare clothes', 0.8, 6, 'front'),
    it('Insulated jacket', 0.45, 4, 'top'),
    it('Rain shell', 0.35, 1.5, 'top'),
    it('First aid & headlamp', 0.4, 1, 'lid'),
    it('Map, compass, sunscreen', 0.2, 0.5, 'lid'),
    it('Water bottle 1 L', 1.05, 1.1, 'right'),
    it('Water filter', 0.1, 0.4, 'left'),
    it('Snacks & phone', 0.4, 0.6, 'hip'),
  ],
}

export default function BackpackLoadPlanner() {
  const [s, set, reset] = useToolState('backpack-load-planner', DEF)
  const f = s.unit === 'kg' ? 1 : 2.20462
  const w = (kg: number, d = 2) => `${num(kg * f, d)} ${s.unit}`
  const com = centreOfMass(s.items, s.packKg)
  const load = zoneLoad(s.items, s.capacity)
  const adv = advise(s.items, s.packKg, s.capacity, s.bodyKg, s.act)
  const vol = s.items.reduce((a, i) => a + i.liters, 0)
  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  // pack dimensions in scene units (≈ metres × 5)
  const S = 5
  const H = (s.heightCm / 100) * S, W = H * 0.45, D = H * 0.34
  const target = TARGET[s.act]
  const sceneKey = useMemo(() => JSON.stringify([s.items, s.packKg, s.heightCm, s.act]), [s.items, s.packKg, s.heightCm, s.act])

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'root'
      st.scene.add(g)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const P = (x: number, y: number, z: number) => new THREE.Vector3(x * W, 0.3 + y * H, -D / 2 + z * D)
      // hiker silhouette behind the back panel
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(W * 0.42, H * 0.95, 6, 16), new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.9 }))
      body.position.set(0, 0.3 + H * 0.45, -D / 2 - W * 0.5)
      body.scale.set(1, 1, 0.55)
      root.add(body)
      const head = new THREE.Mesh(new THREE.SphereGeometry(W * 0.32, 20, 16), body.material)
      head.position.set(0, 0.3 + H * 1.25, -D / 2 - W * 0.45)
      root.add(head)
      const maxKg = Math.max(0.1, ...load.map((l) => l.kg))
      for (const l of load) {
        const [x0, x1, y0, y1, z0, z1] = l.zone.box
        const a = P(x0, y0, z0), b = P(x1, y1, z1)
        const size = b.clone().sub(a)
        const geo = new THREE.BoxGeometry(Math.abs(size.x) * 0.98, Math.abs(size.y) * 0.98, Math.abs(size.z) * 0.98)
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: l.zone.color, transparent: true, opacity: 0.12 + 0.6 * (l.kg / maxKg), depthWrite: false }))
        const c = a.clone().add(b).multiplyScalar(0.5)
        mesh.position.copy(c)
        root.add(mesh)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: l.fill > 1.05 ? '#ef4444' : '#cbd5e1', transparent: true, opacity: 0.6 }))
        edges.position.copy(c)
        root.add(edges)
        if (l.kg > 0 && ['bottom', 'core', 'front', 'top'].includes(l.zone.id)) {
          const t = label(`${l.zone.name.split(' ')[0]}${l.zone.id === 'front' ? ' outer' : ''} ${num(l.kg * f, 1)} ${s.unit}`, '#f8fafc', 0.2)
          t.position.set(0, c.y + (l.zone.id === 'core' ? 0.35 : l.zone.id === 'front' ? -0.35 : 0), D / 2 + 0.75)
          root.add(t)
        }
      }
      // ideal region
      const tz0 = P(-0.05, target.y[0], 0), tz1 = P(0.05, target.y[1], target.z)
      const tb = new THREE.Mesh(new THREE.BoxGeometry(tz1.x - tz0.x, tz1.y - tz0.y, tz1.z - tz0.z), new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.25, depthTest: false }))
      tb.position.copy(tz0.clone().add(tz1).multiplyScalar(0.5))
      root.add(tb)
      // centre of mass
      const cm = P(com.x, com.y, com.z)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), new THREE.MeshBasicMaterial({ color: '#ef4444', depthTest: false }))
      ball.position.copy(cm)
      ball.renderOrder = 10
      root.add(ball)
      const drop = new THREE.BufferGeometry().setFromPoints([cm, new THREE.Vector3(cm.x, 0, cm.z)])
      root.add(new THREE.Line(drop, new THREE.LineDashedMaterial({ color: '#ef4444', dashSize: 0.1, gapSize: 0.08 })).computeLineDistances())
      const cl = label('CoM', '#fecaca', 0.26)
      cl.position.set(cm.x, cm.y + 0.32, cm.z)
      root.add(cl)
      const bl = label('Your back', '#cbd5e1', 0.28)
      bl.position.set(0, 0.3 + H * 1.55, -D / 2 - W * 0.5)
      root.add(bl)
    },
    [sceneKey, s.unit, H, W, D],
    { camera: [5.6, 3, 2.2], target: [0, 1.9, 0], grid: true },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Pack & hiker" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['kg', 'kg'], ['lb', 'lb']]} />
          <Row>
            <Num label="Pack capacity" value={s.capacity} onChange={(capacity) => set({ capacity })} unit="L" min={10} />
            <Num label="Empty pack weight" value={Math.round(s.packKg * f * 100) / 100} onChange={(v) => set({ packKg: v / f })} unit={s.unit} min={0} />
          </Row>
          <Row>
            <Num label="Your body weight" value={Math.round(s.bodyKg * f * 10) / 10} onChange={(v) => set({ bodyKg: v / f })} unit={s.unit} min={0} />
            <Num label="Pack height" value={s.heightCm} onChange={(heightCm) => set({ heightCm })} unit="cm" min={30} max={110} />
          </Row>
          <Seg value={s.act} onChange={(act) => set({ act })} options={[['trail', 'On-trail hiking'], ['scramble', 'Scrambling / ski / off-trail']]} />
        </Panel>
        <Panel title="Balance advice">
          {adv.map((a, i) => <Note key={i} tone={a.tone}>{a.text}</Note>)}
        </Panel>
        <Panel title="Zones">
          {load.map((l) => (
            <div key={l.zone.id} style={{ marginBottom: 8 }}>
              <Row wrap={false}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: l.zone.color, display: 'inline-block', marginTop: 6 }} />
                <b style={{ flex: 1 }}>{l.zone.name}</b>
                <span className="muted">{w(l.kg, 1)} · {num(l.liters, 1)}/{num(l.cap, 1)} L</span>
              </Row>
              <Bar value={l.fill} max={1} color={l.fill > 1.05 ? 'var(--err)' : l.zone.color} />
              <div className="muted" style={{ fontSize: 12 }}>{l.zone.tip}</div>
            </div>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total carried" value={w(com.mass, 1)} tone="accent" sub={s.bodyKg > 0 ? `${num((com.mass / s.bodyKg) * 100, 0)}% of body weight` : undefined} />
          <Stat label="Volume" value={`${num(vol, 1)} L`} sub={`${num((vol / s.capacity) * 100, 0)}% of ${s.capacity} L`} tone={vol > s.capacity ? 'bad' : undefined} />
          <Stat label="CoM height" value={`${num(com.y * s.heightCm, 0)} cm`} sub={`${num(com.y * 100, 0)}% up · target ${target.y[0] * 100}–${target.y[1] * 100}%`} tone={com.y >= target.y[0] && com.y <= target.y[1] ? 'good' : 'bad'} />
          <Stat label="CoM from back" value={`${num(com.z * s.heightCm * 0.34, 1)} cm`} sub={`lateral ${com.x >= 0 ? 'right' : 'left'} ${num(Math.abs(com.x) * s.heightCm * 0.45, 1)} cm`} tone={com.z <= target.z ? 'good' : 'bad'} />
        </Stats>
        <Panel title="3D load view">
          <View3D refEl={ref} height={430} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Drag to orbit. Zone colour strength = weight in that zone; red ball = centre of mass; green box = target region for {s.act === 'trail' ? 'trail hiking' : 'scrambling'}.</p>
        </Panel>
        <Panel title="Gear" actions={<>
          <Btn onClick={() => set({ items: [...s.items, { id: uid(), name: 'New item', kg: 0.5, liters: 1, zone: 'core' }] })}>+ Item</Btn>
          <CsvButton name="backpack-load.csv" rows={() => [['Item', 'Weight kg', 'Volume L', 'Zone'], ...s.items.map((i) => [i.name, i.kg, i.liters, i.zone])]} />
          <JsonButtons name="backpack-load.json" data={s} onLoad={(d) => set(d)} />
        </>}>
          <Table head={['Item', `Weight (${s.unit})`, 'Volume (L)', 'Zone', '']} rows={[...s.items].sort((a, b) => b.kg - a.kg).map((i) => [
            <input key="n" value={i.name} onChange={(e) => edit(i.id, { name: e.target.value })} aria-label="Item name" style={{ width: 160 }} />,
            <input key="k" type="number" min={0} step={0.05} value={Math.round(i.kg * f * 100) / 100} onChange={(e) => edit(i.id, { kg: Math.max(0, +e.target.value || 0) / f })} aria-label="Weight" style={{ width: 70 }} />,
            <input key="l" type="number" min={0} step={0.5} value={i.liters} onChange={(e) => edit(i.id, { liters: Math.max(0, +e.target.value || 0) })} aria-label="Volume" style={{ width: 60 }} />,
            <select key="z" value={i.zone} onChange={(e) => edit(i.id, { zone: e.target.value as ZoneId })} aria-label="Zone">
              {ZONES.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>,
            <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id) })} title="Remove">✕</Btn>,
          ])} />
          <Note>Classic rule: light and bulky at the bottom, heavy and dense in the middle against your back, small essentials up top and in the lid. The model places each item at its zone's centre.</Note>
        </Panel>
      </div>
    </Split>
  )
}
