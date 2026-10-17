import { useEffect, useRef } from 'react'
import { Btn, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { CARS, doorAngle, fit, gapForAngle, GARAGES, verdict, type Car, type Garage } from './lib/garage-fit-checker'

interface State { unit: 'm' | 'ft'; car: Car; garage: Garage; n: 1 | 2; offset: number; rear: number; roof: number; view: 'persp' | 'top' }
const DEF: State = { unit: 'm', car: CARS[4], garage: GARAGES[1], n: 1, offset: 0, rear: 0.4, roof: 0, view: 'persp' }
const FT = 0.3048
const VC = { comfortable: '#10b981', tight: '#f59e0b', squeeze: '#f97316', blocked: '#ef4444' }

export default function GarageFitChecker() {
  const [s, set, reset] = useToolState('garage-fit-checker', DEF)
  const f = fit(s.car, s.garage, s.offset, s.rear, s.roof, s.n)
  const midGap = s.n === 2 ? (s.garage.width - 2 * s.car.width) / 3 : 0
  const L = (m: number, d = 2) => (s.unit === 'm' ? `${num(m, d)} m` : (() => { const inch = m / 0.0254; const sign = inch < 0 ? '−' : ''; const a = Math.abs(inch); return `${sign}${Math.floor(a / 12)}′ ${num(a % 12, 1)}″` })())
  const toU = (m: number) => +(s.unit === 'm' ? m : m / FT).toFixed(3)
  const fromU = (v: number) => (s.unit === 'm' ? v : v * FT)
  const u = s.unit
  const sRef = useRef(s)
  useEffect(() => { sRef.current = s })
  const G = useRef(new THREE.Group())

  const ref = useStage3D(
    (st: Stage3D) => { st.scene.add(G.current) },
    (st) => {
      const v = sRef.current
      const { car, garage: g } = v
      const ff = fit(car, g, v.offset, v.rear, v.roof, v.n)
      st.clear(G.current)
      const W = g.width, D = g.depth, H = g.height
      const wallMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.95 }))
      floor.rotation.x = -Math.PI / 2
      G.current.add(floor)
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); G.current.add(b); return b }
      const t = 0.1
      box(W + 2 * t, H, t, 0, H / 2, -D / 2 - t / 2, wallMat)
      box(t, H, D, -W / 2 - t / 2, H / 2, 0, wallMat)
      box(t, H, D, W / 2 + t / 2, H / 2, 0, wallMat)
      const side = (W - g.doorW) / 2
      if (side > 0) { box(side, H, t, -W / 2 + side / 2, H / 2, D / 2 + t / 2, wallMat); box(side, H, t, W / 2 - side / 2, H / 2, D / 2 + t / 2, wallMat) }
      if (H > g.doorH) box(g.doorW, H - g.doorH, t, 0, g.doorH + (H - g.doorH) / 2, D / 2 + t / 2, wallMat)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
      edges.position.y = H / 2
      G.current.add(edges)

      const free = W - car.width * v.n
      const xs = v.n === 1 ? [-W / 2 + free / 2 + v.offset + car.width / 2] : [-W / 2 + free / 3 + v.offset + car.width / 2, -W / 2 + (2 * free) / 3 + v.offset + car.width * 1.5]
      const zRear = D / 2 - v.rear
      const zFront = zRear - car.length
      const cz = (zRear + zFront) / 2
      const bodyM = new THREE.MeshStandardMaterial({ color: ff.fits ? '#2563eb' : '#dc2626', metalness: 0.3, roughness: 0.45 })
      const glass = new THREE.MeshStandardMaterial({ color: '#93c5fd', metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.55 })
      const tyre = new THREE.MeshStandardMaterial({ color: '#111827' })
      xs.forEach((x) => {
        const lowH = car.height * 0.5
        box(car.width, lowH, car.length, x, 0.12 + lowH / 2, cz, bodyM)
        box(car.width * 0.9, car.height - lowH - 0.12, car.length * 0.5, x, 0.12 + lowH + (car.height - lowH - 0.12) / 2, cz + car.length * 0.05, glass)
        for (const sx of [-1, 1]) {
          box((car.mirrors - car.width) / 2, 0.1, 0.18, x + sx * (car.width / 2 + (car.mirrors - car.width) / 4), lowH + 0.15, zFront + car.length * 0.33, bodyM)
          for (const wz of [zFront + car.length * 0.17, zRear - car.length * 0.17]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20), tyre)
            w.rotation.z = Math.PI / 2
            w.position.set(x + sx * (car.width / 2 - 0.1), 0.33, wz)
            G.current.add(w)
          }
          // door swing: hinge at the front edge of the front door, door closes towards the rear (+z)
          const gap = v.n === 1 ? (sx < 0 ? ff.left : ff.right) : (x === xs[0] ? (sx < 0 ? ff.left : midGap) : (sx < 0 ? midGap : ff.right))
          const ang = doorAngle(gap, car.door)
          const hx = x + sx * car.width / 2, hz = zFront + car.length * 0.3
          const col = VC[verdict(ang)]
          const full = new THREE.Mesh(new THREE.RingGeometry(car.door - 0.01, car.door, 40, 1, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e2e8f0', side: THREE.DoubleSide, transparent: true, opacity: 0.5 }))
          const sector = new THREE.Mesh(new THREE.CircleGeometry(car.door, 40, 0, (ang * Math.PI) / 180), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }))
          for (const m of [full, sector]) {
            m.rotation.x = -Math.PI / 2
            // local +x of the circle → world +z (door closed, pointing rearwards); sweep outward on side sx
            m.rotation.z = -Math.PI / 2
            if (sx < 0) m.scale.y = -1
            m.position.set(hx, 0.02, hz)
            G.current.add(m)
          }
          const a = (ang * Math.PI) / 180
          const door = box(0.05, car.height * 0.45, car.door, hx + sx * Math.sin(a) * car.door / 2, 0.15 + car.height * 0.225 + 0.15, hz + Math.cos(a) * car.door / 2, new THREE.MeshStandardMaterial({ color: col }))
          door.rotation.y = sx * a
          const tag = label(`${Math.round(ang)}°`, col, 0.34)
          tag.position.set(hx + sx * Math.sin(a) * car.door * 0.9, 1.2, hz + Math.cos(a) * car.door * 0.6)
          G.current.add(tag)
        }
      })
      const lab = (txt: string, x: number, y: number, z: number, c = '#f8fafc') => { const sp = label(txt, c, 0.34); sp.position.set(x, y, z); G.current.add(sp) }
      const fmt = (m: number) => (v.unit === 'm' ? `${num(m, 2)} m` : `${num(m / FT, 2)} ft`)
      lab(`↔ ${fmt(ff.left)}`, -W / 2 + Math.max(0.3, ff.left / 2), 0.3, cz, ff.left > 0 ? '#f8fafc' : '#f87171')
      lab(`↔ ${fmt(ff.right)}`, W / 2 - Math.max(0.3, ff.right / 2), 0.3, cz, ff.right > 0 ? '#f8fafc' : '#f87171')
      lab(`↕ ${fmt(ff.front)}`, xs[0], 0.4, -D / 2 + Math.max(0.25, ff.front / 2), ff.front >= 0 ? '#f8fafc' : '#f87171')
      lab(`door ${fmt(g.doorW)} × ${fmt(g.doorH)}`, 0, g.doorH + 0.25, D / 2 + 0.2, ff.doorFits ? '#a7f3d0' : '#f87171')
      const camD = Math.max(W, D) * 1.25
      if (v.view === 'top') { st.camera.position.set(0, camD * 1.6, 0.01); st.controls.target.set(0, 0, 0) }
      else { st.camera.position.set(W * 0.9, camD * 0.9, D * 0.95 + 2); st.controls.target.set(0, 0.6, 0) }
    },
    [s],
    { camera: [5, 6, 8], background: '#0f172a', grid: false },
  )

  const exitSide = s.n === 1 ? Math.max(f.leftAngle, f.rightAngle) : Math.max(f.leftAngle, doorAngle(midGap, s.car.door))
  const driverGap = s.n === 1 ? f.left : f.left
  const need45 = gapForAngle(45, s.car.door)
  const setCar = (p: Partial<Car>) => set({ car: { ...s.car, ...p } })
  const setG = (p: Partial<Garage>) => set({ garage: { ...s.garage, ...p } })

  const checks: [string, boolean, string][] = [
    ['Car fits inside', f.fits, f.fits ? `${L(Math.min(f.left, f.right))} min side gap` : 'Too wide, long or tall'],
    ['Through the garage door (mirrors out)', f.doorFits, `${L(f.doorSide)} per side, ${L(f.doorHead)} above roof`],
    ['Door can open ≥ 30° to get out', exitSide >= 30, `best door opens to ${Math.round(exitSide)}°`],
    ['Walkway in front (≥ 0.6 m)', f.front >= 0.6, `${L(f.front)} free`],
    ['Headroom', f.head > 0.1, `${L(f.head)} above roof`],
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Car" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['m', 'metric'], ['ft', 'feet']]} />}>
          <Select label="Preset" value={s.car.name} onChange={(n) => { const c = CARS.find((x) => x.name === n); if (c) set({ car: c }) }} options={[...(CARS.some((c) => c.name === s.car.name) ? [] : [s.car.name]), ...CARS.map((c) => c.name)]} />
          <Row>
            <Num key={'l' + u + s.car.name} label="Length" value={toU(s.car.length)} onChange={(v) => setCar({ length: fromU(v), name: 'Custom car' })} unit={u} min={0.5} />
            <Num key={'w' + u + s.car.name} label="Width (body)" value={toU(s.car.width)} onChange={(v) => setCar({ width: fromU(v), name: 'Custom car' })} unit={u} min={0.5} />
          </Row>
          <Row>
            <Num key={'m' + u + s.car.name} label="Width incl. mirrors" value={toU(s.car.mirrors)} onChange={(v) => setCar({ mirrors: fromU(v), name: 'Custom car' })} unit={u} min={0.5} />
            <Num key={'h' + u + s.car.name} label="Height" value={toU(s.car.height)} onChange={(v) => setCar({ height: fromU(v), name: 'Custom car' })} unit={u} min={0.5} />
          </Row>
          <Num key={'d' + u + s.car.name} label="Front door length" value={toU(s.car.door)} onChange={(v) => setCar({ door: fromU(v), name: 'Custom car' })} unit={u} min={0.3} hint="Hinge to rear edge; coupes have long doors." />
        </Panel>
        <Panel title="Garage">
          <Select label="Preset" value={s.garage.name} onChange={(n) => { const g = GARAGES.find((x) => x.name === n); if (g) set({ garage: g, n: g.width >= 5 ? 2 : 1 }) }} options={[...(GARAGES.some((g) => g.name === s.garage.name) ? [] : [s.garage.name]), ...GARAGES.map((g) => g.name)]} />
          <Row>
            <Num key={'gw' + u + s.garage.name} label="Inside width" value={toU(s.garage.width)} onChange={(v) => setG({ width: fromU(v), name: 'Custom garage' })} unit={u} min={1} />
            <Num key={'gd' + u + s.garage.name} label="Inside depth" value={toU(s.garage.depth)} onChange={(v) => setG({ depth: fromU(v), name: 'Custom garage' })} unit={u} min={1} />
            <Num key={'gh' + u + s.garage.name} label="Ceiling height" value={toU(s.garage.height)} onChange={(v) => setG({ height: fromU(v), name: 'Custom garage' })} unit={u} min={1} />
          </Row>
          <Row>
            <Num key={'dw' + u + s.garage.name} label="Door opening width" value={toU(s.garage.doorW)} onChange={(v) => setG({ doorW: fromU(v), name: 'Custom garage' })} unit={u} min={1} />
            <Num key={'dh' + u + s.garage.name} label="Door opening height" value={toU(s.garage.doorH)} onChange={(v) => setG({ doorH: fromU(v), name: 'Custom garage' })} unit={u} min={1} />
          </Row>
          <Note>Measure the door <b>opening</b> with the door fully up — roller boxes and tracks often steal 10–20 cm of height.</Note>
        </Panel>
        <Panel title="Parking" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={String(s.n)} onChange={(v) => set({ n: +v as 1 | 2 })} options={[['1', 'One car'], ['2', 'Two cars']]} />
          <Slider label="Shift towards right wall" value={s.offset} onChange={(offset) => set({ offset })} min={-1} max={1} step={0.02} show={(v) => L(v)} />
          <Slider label="Space behind car (door side)" value={s.rear} onChange={(rear) => set({ rear })} min={0} max={2} step={0.05} show={(v) => L(v)} />
          <Slider label="Roof box / bike rack height" value={s.roof} onChange={(roof) => set({ roof })} min={0} max={0.6} step={0.02} show={(v) => L(v)} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Verdict" value={f.fits && f.doorFits ? (exitSide >= 30 ? 'Fits ✓' : 'Fits, tight') : 'Does not fit'} tone={f.fits && f.doorFits ? (exitSide >= 30 ? 'good' : 'accent') : 'bad'} />
          <Stat label={s.n === 2 ? 'Left wall gap' : 'Driver side gap'} value={L(driverGap)} sub={`door opens ${Math.round(f.leftAngle)}°`} />
          <Stat label={s.n === 2 ? 'Gap between cars' : 'Passenger side gap'} value={L(s.n === 2 ? midGap : f.right)} sub={`door opens ${Math.round(s.n === 2 ? doorAngle(midGap, s.car.door) : f.rightAngle)}°`} />
          <Stat label="Front walkway" value={L(f.front)} tone={f.front >= 0.6 ? 'good' : 'bad'} />
        </Stats>
        <Panel title="3D view" actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['persp', '3D'], ['top', 'Top']]} />}>
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 13 }}>Coloured wedges show how far each front door can swing before hitting the wall or the other car: green ≥ 45°, amber 30–45°, orange 15–30°, red blocked.</p>
        </Panel>
        <Panel title="Checklist">
          <Table head={['Check', '', 'Detail']} rows={checks.map(([n, ok, d]) => [n, <b key="ok" style={{ color: ok ? 'var(--ok)' : 'var(--err)' }}>{ok ? '✓' : '✗'}</b>, d])} />
          <p className="muted" style={{ fontSize: 13 }}>To open a {L(s.car.door)} door to 45° you need about <b>{L(need45)}</b> beside the car; 30° needs {L(gapForAngle(30, s.car.door))}. Vehicle presets are typical class dimensions — check your model's spec sheet.</p>
        </Panel>
      </div>
    </Split>
  )
}
