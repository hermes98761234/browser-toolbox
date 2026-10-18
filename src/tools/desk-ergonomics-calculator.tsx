import { Btn, Check, CopyButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { checkSetup, targets, type Opts } from './lib/desk-ergonomics-calculator'

type Unit = 'cm' | 'in'
const ASPECTS: [string, string][] = [['16:9', '16:9 widescreen'], ['16:10', '16:10'], ['21:9', '21:9 ultrawide'], ['3:2', '3:2 laptop']]
const PEOPLE: [string, number][] = [['Small (152 cm)', 152], ['Avg. woman (163)', 163], ['Avg. man (176)', 176], ['Tall (190)', 190]]

const DEF = {
  unit: 'cm' as Unit, stature: 176, shoe: 2.5, keyboard: 2.5, diagonal: 27, aspect: '16:9', bifocal: false, laptopOnly: false,
  mode: 'sit' as 'sit' | 'stand', curDesk: 74, curChair: 47, curMonitor: 118,
}

const M = (cm: number) => cm / 100

function cyl(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 12), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
function dim(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, text: string, col: string) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b])
  g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col })))
  for (const p of [a, b]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008), new THREE.MeshBasicMaterial({ color: col }))
    dot.position.copy(p)
    g.add(dot)
  }
  const l = label(text, col, 0.085)
  l.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0.12, 0, 0))
  g.add(l)
}

export default function DeskErgonomicsCalculator() {
  const [s, set, reset] = useToolState('desk-ergonomics-calculator', DEF)
  const asp = s.aspect.split(':').map(Number) as [number, number]
  const o: Opts = { stature: s.stature, shoe: s.shoe, keyboard: s.keyboard, diagonal: s.diagonal, aspect: asp, bifocal: s.bifocal, laptopOnly: s.laptopOnly }
  const valid = s.stature >= 100 && s.stature <= 230 && s.diagonal >= 10 && s.diagonal <= 60
  const t = targets(valid ? o : { ...o, stature: 176, diagonal: 27 })
  const fit = checkSetup(t, o, s.curDesk, s.curChair, s.curMonitor)
  const k = s.unit === 'in' ? 1 / 2.54 : 1
  const L = (cm: number, d = 1) => `${(cm * k).toFixed(d)} ${s.unit}`
  const both = (cm: number) => `${cm.toFixed(1)} cm · ${(cm / 2.54).toFixed(1)} in`
  const inUnit = (cm: number) => +(cm * k).toFixed(1)
  const fromUnit = (v: number) => v / k

  const stand = s.mode === 'stand'
  const update = (st: Stage3D) => {
    let g = st.scene.getObjectByName('desk') as THREE.Group | undefined
    if (!g) {
      g = new THREE.Group()
      g.name = 'desk'
      st.scene.add(g)
    }
    st.clear(g)
    const wood = new THREE.MeshStandardMaterial({ color: '#b08355', roughness: 0.7 })
    const metal = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.5, roughness: 0.4 })
    const skin = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6 })
    const cloth = new THREE.MeshStandardMaterial({ color: '#6366f1', roughness: 0.8 })
    const dark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 })
    const b = t.b
    const deskH = M(stand ? t.deskStand : t.deskSit)
    // desk: front edge at z = 0, 80 cm deep, 140 cm wide
    g.add(box(1.4, 0.03, 0.8, 0, deskH - 0.015, -0.4, wood))
    for (const x of [-0.66, 0.66]) g.add(box(0.05, deskH - 0.03, 0.6, x, (deskH - 0.03) / 2, -0.4, metal))
    // keyboard
    g.add(box(0.44, M(s.keyboard), 0.14, 0, deskH + M(s.keyboard) / 2, -0.12, dark))
    // monitor
    const eyeZ = 0.12
    const scrZ = eyeZ - M(t.distanceIdeal)
    const top = M(stand ? t.monitorTopStand : t.monitorTopSit)
    const sw = M(t.screenW), sh = M(t.screenH)
    const scr = new THREE.Group()
    scr.add(box(sw + 0.02, sh + 0.02, 0.03, 0, 0, 0, dark))
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ color: '#1d4ed8' }))
    glow.position.z = 0.016
    scr.add(glow)
    scr.position.set(0, top - sh / 2, scrZ)
    scr.rotation.x = (-t.tilt * Math.PI) / 180
    g.add(scr)
    if (top - sh > deskH + 0.02) g.add(cyl(new THREE.Vector3(0, deskH, scrZ - 0.06), new THREE.Vector3(0, top - sh / 2, scrZ - 0.04), 0.015, metal))
    g.add(box(0.22, 0.012, 0.18, 0, deskH + 0.006, scrZ - 0.05, metal))

    // person (side view, facing −z)
    const shoe = M(s.shoe)
    let hip: THREE.Vector3, sh_: THREE.Vector3, elbow: THREE.Vector3, eye: THREE.Vector3
    if (!stand) {
      const seat = M(t.seatIdeal)
      hip = new THREE.Vector3(0, seat + 0.07, 0.24)
      const knee = new THREE.Vector3(0, seat + 0.06, 0.24 - M(b.buttockPopliteal))
      for (const x of [-0.09, 0.09]) {
        g.add(cyl(hip.clone().setX(x), knee.clone().setX(x), 0.065, cloth))
        g.add(cyl(knee.clone().setX(x), new THREE.Vector3(x, shoe + 0.05, knee.z), 0.05, cloth))
        g.add(box(0.09, 0.06, 0.25, x, 0.03 + shoe / 2, knee.z - 0.06, dark))
      }
      // chair
      g.add(box(0.48, 0.06, M(t.seatDepthMax), 0, seat - 0.03, 0.24 - M(t.seatDepthMax) / 2 + 0.06, dark))
      g.add(box(0.46, 0.5, 0.05, 0, seat + 0.32, 0.36, dark))
      g.add(cyl(new THREE.Vector3(0, 0.08, 0.14), new THREE.Vector3(0, seat - 0.06, 0.14), 0.025, metal))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        g.add(cyl(new THREE.Vector3(0, 0.06, 0.14), new THREE.Vector3(Math.cos(a) * 0.3, 0.04, 0.14 + Math.sin(a) * 0.3), 0.018, metal))
      }
      sh_ = new THREE.Vector3(0, seat + M(b.shoulderSeated), 0.25)
      elbow = new THREE.Vector3(0, seat + M(b.elbowRest), 0.2)
      eye = new THREE.Vector3(0, seat + M(b.eyeSeated), eyeZ)
    } else {
      hip = new THREE.Vector3(0, shoe + M(0.53 * b.stature), 0.3)
      for (const x of [-0.09, 0.09]) {
        g.add(cyl(hip.clone().setX(x), new THREE.Vector3(x, shoe + 0.05, 0.3), 0.06, cloth))
        g.add(box(0.09, 0.06, 0.25, x, 0.03 + shoe / 2, 0.24, dark))
      }
      sh_ = new THREE.Vector3(0, shoe + M(0.818 * b.stature), 0.3)
      elbow = new THREE.Vector3(0, shoe + M(b.elbowStanding), 0.24)
      eye = new THREE.Vector3(0, shoe + M(b.eyeStanding), eyeZ + 0.06)
    }
    g.add(cyl(hip, sh_, 0.13, cloth))
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), skin)
    head.position.set(0, eye.y + 0.02, eye.z + 0.08)
    g.add(head)
    g.add(cyl(sh_.clone().setY(sh_.y + 0.02), head.position.clone().setY(head.position.y - 0.08), 0.045, skin))
    for (const x of [-0.19, 0.19]) {
      const sx = sh_.clone().setX(x), ex = elbow.clone().setX(x)
      g.add(cyl(sx, ex, 0.04, cloth))
      g.add(cyl(ex, new THREE.Vector3(x * 0.6, deskH + M(s.keyboard) + 0.02, -0.1), 0.035, skin))
    }
    // sight line to screen centre
    const sight = new THREE.BufferGeometry().setFromPoints([eye, new THREE.Vector3(0, top - sh / 2, scrZ)])
    g.add(new THREE.Line(sight, new THREE.LineDashedMaterial({ color: '#facc15', dashSize: 0.03, gapSize: 0.02 })).computeLineDistances())

    // dimension lines on the right side
    const X = 0.85
    const d = (h: number, z: number, txt: string, c: string) => dim(g!, new THREE.Vector3(X, 0, z), new THREE.Vector3(X, h, z), txt, c)
    d(deskH, -0.02, `Desk ${L(stand ? t.deskStand : t.deskSit, 0)}`, '#fbbf24')
    if (!stand) d(M(t.seatIdeal), 0.3, `Seat ${L(t.seatIdeal, 0)}`, '#34d399')
    d(top, scrZ, `Screen top ${L(stand ? t.monitorTopStand : t.monitorTopSit, 0)}`, '#60a5fa')
    dim(g, new THREE.Vector3(0.3, eye.y + 0.18, eye.z), new THREE.Vector3(0.3, eye.y + 0.18, scrZ), `${L(t.distanceIdeal, 0)}`, '#f472b6')
  }
  const ref = useStage3D(() => {}, update, [s.stature, s.shoe, s.keyboard, s.diagonal, s.aspect, s.bifocal, s.laptopOnly, s.mode, s.unit], { camera: [1.9, 1.35, 1.25], target: [0, 0.8, -0.1], background: '#0f172a' })

  const summary = [
    `Workstation targets for ${both(s.stature)} stature (shoes ${s.shoe} cm):`,
    `Chair seat height: ${both(t.seatIdeal)} (range ${t.seat[0].toFixed(0)}–${t.seat[1].toFixed(0)} cm)`,
    `Desk surface, sitting: ${both(t.deskSit)}`,
    `Desk surface, standing: ${both(t.deskStand)}`,
    `Monitor top edge, sitting: ${both(t.monitorTopSit)}; standing: ${both(t.monitorTopStand)}`,
    `Viewing distance: ${t.distanceIdeal.toFixed(0)} cm (${t.distance[0].toFixed(0)}–${t.distance[1].toFixed(0)}), tilt back ${t.tilt}°`,
  ].join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="You" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['cm', 'cm'], ['in', 'in']]} />}>
          <Row>
            {PEOPLE.map(([n, h]) => <Btn key={n} kind={s.stature === h ? 'primary' : 'ghost'} onClick={() => set({ stature: h })}>{n}</Btn>)}
          </Row>
          <Row>
            <Num label="Body height" value={inUnit(s.stature)} onChange={(v) => set({ stature: fromUnit(v) })} unit={s.unit} min={inUnit(100)} max={inUnit(230)} />
            <Num label="Shoe heel" value={inUnit(s.shoe)} onChange={(v) => set({ shoe: Math.max(0, fromUnit(v)) })} unit={s.unit} min={0} />
          </Row>
          {!valid && <Note tone="warn">Enter a height between 100 and 230 cm and a screen between 10 and 60 inches.</Note>}
          <Check label="I wear bifocals / progressives" value={s.bifocal} onChange={(bifocal) => set({ bifocal })} />
        </Panel>
        <Panel title="Equipment">
          <Row>
            <Num label="Monitor diagonal" value={s.diagonal} onChange={(diagonal) => set({ diagonal })} unit="in" min={10} max={60} />
            <Select label="Aspect ratio" value={s.aspect} onChange={(aspect) => set({ aspect })} options={ASPECTS} />
          </Row>
          <Num label="Keyboard home-row height" value={inUnit(s.keyboard)} onChange={(v) => set({ keyboard: Math.max(0, fromUnit(v)) })} unit={s.unit} min={0} hint="Above the desk surface; ~2–3 cm for most keyboards" />
          <Check label="Laptop only (no external monitor)" value={s.laptopOnly} onChange={(laptopOnly) => set({ laptopOnly })} />
          {s.laptopOnly && <Note tone="warn">A laptop forces a trade-off: keyboard at elbow height puts the screen far below eyes. For long sessions use a laptop stand plus an external keyboard and mouse.</Note>}
        </Panel>
        <Panel title="Check my current setup">
          <Row>
            <Num label="Desk height" value={inUnit(s.curDesk)} onChange={(v) => set({ curDesk: fromUnit(v) })} unit={s.unit} min={0} />
            <Num label="Chair seat" value={inUnit(s.curChair)} onChange={(v) => set({ curChair: fromUnit(v) })} unit={s.unit} min={0} />
            <Num label="Screen top" value={inUnit(s.curMonitor)} onChange={(v) => set({ curMonitor: fromUnit(v) })} unit={s.unit} min={0} />
          </Row>
          {fit.checks.map((c, i) => <Note key={i} tone={c.ok ? 'ok' : 'warn'}>{c.ok ? '✓ ' : '⚠ '}{c.text}</Note>)}
          {fit.footrest > 1 && <p className="muted" style={{ fontSize: 13 }}>On this desk: chair at <b>{L(fit.seatForDesk)}</b>, footrest <b>{L(fit.footrest)}</b> tall.</p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Chair seat" value={L(t.seatIdeal)} sub={`range ${L(t.seat[0], 0)}–${L(t.seat[1], 0)}`} tone="accent" />
          <Stat label="Desk (sitting)" value={L(t.deskSit)} sub="surface height" />
          <Stat label="Desk (standing)" value={L(t.deskStand)} sub="surface height" />
          <Stat label="Screen top" value={L(stand ? t.monitorTopStand : t.monitorTopSit)} sub={`at ${L(t.distanceIdeal, 0)} distance`} />
        </Stats>
        <Panel title="3D workstation" actions={<><Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['sit', '🪑 Sitting'], ['stand', '🧍 Standing']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <View3D refEl={ref} height={430} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag to orbit, scroll to zoom. Dashed yellow line = line of sight to the screen centre ({t.gazeDown.toFixed(0)}° below horizontal while sitting; 10–20° is comfortable).</p>
        </Panel>
        <Panel title="All measurements" actions={<CopyButton text={summary} label="Copy summary" />}>
          <Table
            head={['Item', 'Target', 'Why']}
            rows={[
              ['Seat height', both(t.seatIdeal), 'Popliteal height + shoe: thighs level, feet flat'],
              ['Seat depth (max)', both(t.seatDepthMax), 'Leave 2–3 fingers between seat edge and the back of the knee'],
              ['Seat width (min)', both(t.seatWidthMin), 'Hip breadth + clearance'],
              ['Desk surface, sitting', both(t.deskSit), 'Elbows ~90°, forearms level with the home row'],
              ['Desk surface, standing', both(t.deskStand), 'Standing elbow height − keyboard height'],
              ['Screen top, sitting', both(t.monitorTopSit), s.bifocal ? '≈12 cm below eye level for bifocals' : 'At or slightly below eye level'],
              ['Screen top, standing', both(t.monitorTopStand), 'Same rule while standing'],
              ['Viewing distance', `${t.distanceIdeal.toFixed(0)} cm (${t.distance[0].toFixed(0)}–${t.distance[1].toFixed(0)})`, `Screen ${t.screenW.toFixed(0)}×${t.screenH.toFixed(0)} cm fills ~40–60° of view`],
              ['Screen tilt', `${t.tilt}° back`, 'Keeps the screen perpendicular to the downward gaze'],
              ['Seated eye height', both(t.seatIdeal + t.b.eyeSeated), 'Floor to eyes at the recommended seat height'],
            ]}
          />
          <Note>Estimates use average body proportions; legs and torsos vary by ±5 %. Fine-tune by feel: shoulders relaxed, wrists straight, feet flat, and no neck tilt to read the top line.</Note>
        </Panel>
      </div>
    </Split>
  )
}
