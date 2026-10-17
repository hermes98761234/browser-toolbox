import { useEffect, useRef } from 'react'
import { Btn, Check, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, pct, today, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { changes, halfWidth, MEASURES, navyBodyFat, sortByDate, waistHeight, waistHip, whrRisk, whtrBand, type Entry, type Measure } from './lib/body-measurement-tracker'

interface State { unit: 'cm' | 'in'; wunit: 'kg' | 'lb'; sex: 'male' | 'female'; height: number; entries: Entry[]; sel: string; ghost: boolean; chart: Measure | 'weight' }

const NAMES: Record<Measure | 'weight', string> = { neck: 'Neck', chest: 'Chest', waist: 'Waist', hips: 'Hips', arm: 'Upper arm', thigh: 'Thigh', calf: 'Calf', weight: 'Weight' }
const mkE = (date: string, weight: number, neck: number, chest: number, waist: number, hips: number, arm: number, thigh: number, calf: number, note = ''): Entry =>
  ({ id: date, date, weight, neck, chest, waist, hips, arm, thigh, calf, note })
const DEF: State = {
  unit: 'cm', wunit: 'kg', sex: 'male', height: 178, sel: '', ghost: true, chart: 'waist',
  entries: [
    mkE('2026-04-05', 88.4, 40, 106, 98, 104, 34, 60, 39, 'Start'),
    mkE('2026-05-03', 86.9, 39.5, 105, 95.5, 103, 34, 59, 39),
    mkE('2026-06-01', 85.2, 39, 104, 93, 102, 34.5, 58.5, 38.5),
    mkE('2026-07-05', 84.1, 39, 104, 91, 101, 35, 58, 38.5, 'Added lifting'),
    mkE('2026-08-02', 83.0, 38.5, 104.5, 89, 100, 35.5, 58, 38.5),
    mkE('2026-09-06', 82.2, 38.5, 105, 87.5, 99.5, 36, 58.5, 38.5),
  ],
}

const IN = 2.54, LB = 0.45359237

/** Builds a parametric body from lathe/sphere primitives. Lengths in cm, output in metres. */
function buildBody(e: Entry, H: number, sex: State['sex'], mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const h = H / 100
  const R = (c: number, ratio: number) => halfWidth(c, ratio) / 100
  const depth = sex === 'male' ? 0.72 : 0.75
  const neck = R(e.neck, 0.9), chest = R(e.chest, depth), waist = R(e.waist, 0.78), hips = R(e.hips, depth)
  const shoulder = Math.max(chest * 1.08, 0.105 * h * (sex === 'male' ? 1.12 : 1.0))
  const torso: [number, number][] = [
    [0.001, 0.47], [hips * 0.92, 0.475], [hips, 0.52], [(hips + waist) / 2, 0.57], [waist, 0.62], [(waist + chest) / 2, 0.67],
    [chest, 0.72], [chest * 1.02, 0.76], [chest * 0.97, 0.79], [chest * 0.78, 0.815], [neck * 1.7, 0.835], [neck * 1.2, 0.848], [neck, 0.855], [neck, 0.875], [0.001, 0.876],
  ]
  const lathe = (pts: [number, number][], sx = 1, sz = 1) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y * h)), 40)
    const m = new THREE.Mesh(geo, mat)
    m.scale.set(sx, 1, sz)
    return m
  }
  const body = lathe(torso, 1, depth)
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06 * h, 32, 20), mat)
  head.scale.set(0.85, 1.12, 0.95)
  head.position.y = 0.935 * h
  g.add(head)
  const thigh = R(e.thigh, 0.95), calf = R(e.calf, 0.95), arm = R(e.arm, 0.95)
  for (const side of [-1, 1]) {
    const leg = lathe([[0.001, 0.0], [calf * 0.45, 0.005], [calf * 0.5, 0.05], [calf, 0.19], [calf * 0.78, 0.27], [thigh * 0.75, 0.3], [thigh, 0.44], [thigh * 0.98, 0.49], [0.001, 0.495]])
    leg.position.x = side * Math.max(thigh * 1.02, hips * 0.48)
    g.add(leg)
    const armM = lathe([[0.001, 0.4], [arm * 0.35, 0.41], [arm * 0.55, 0.47], [arm * 0.8, 0.56], [arm * 0.75, 0.6], [arm, 0.68], [arm * 0.95, 0.77], [arm * 0.6, 0.8], [0.001, 0.81]])
    const cap = new THREE.Mesh(new THREE.SphereGeometry(arm * 1.1, 24, 16), mat)
    cap.scale.set(1.15, 0.8, depth * 1.2)
    cap.position.set(side * (shoulder + arm * 0.2), 0.785 * h, 0)
    g.add(cap)
    armM.position.x = side * (shoulder + arm * 1.05)
    armM.rotation.z = side * 0.04
    g.add(armM)
  }
  return g
}

export default function BodyMeasurementTracker() {
  const [s, set, reset] = useToolState('body-measurement-tracker', DEF)
  const sorted = sortByDate(s.entries)
  const cur = sorted.find((e) => e.id === s.sel) ?? sorted[sorted.length - 1]
  const first = sorted[0]
  const sRef = useRef(s)
  useEffect(() => { sRef.current = s })
  const bodyG = useRef(new THREE.Group())

  const L = (cm: number, d = 1) => (s.unit === 'cm' ? num(cm, d) : num(cm / IN, d))
  const toCm = (v: number) => (s.unit === 'cm' ? v : v * IN)
  const W = (kg: number) => (s.wunit === 'kg' ? num(kg, 1) : num(kg / LB, 1))
  const edit = (id: string, patch: Partial<Entry>) => set({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })

  const ref = useStage3D(
    (st: Stage3D) => { st.scene.add(bodyG.current) },
    (st) => {
      const v = sRef.current
      const list = sortByDate(v.entries)
      const c = list.find((e) => e.id === v.sel) ?? list[list.length - 1]
      st.clear(bodyG.current)
      if (!c) return
      const skin = new THREE.MeshStandardMaterial({ color: '#d9a07a', roughness: 0.7, metalness: 0.05 })
      bodyG.current.add(buildBody(c, v.height, v.sex, skin))
      if (v.ghost && list.length > 1 && list[0].id !== c.id) {
        const ghost = buildBody(list[0], v.height, v.sex, new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true, transparent: true, opacity: 0.25 }))
        bodyG.current.add(ghost)
      }
      const h = v.height / 100
      const tag = (txt: string, y: number) => {
        const sp = label(txt, '#f8fafc', 0.085)
        sp.position.set(0.42, y * h, 0)
        bodyG.current.add(sp)
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.05, y * h, 0), new THREE.Vector3(0.3, y * h, 0)]), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
        bodyG.current.add(line)
      }
      const u = v.unit
      const f = (cm: number) => (u === 'cm' ? `${num(cm, 1)} cm` : `${num(cm / IN, 1)} in`)
      tag(`Chest ${f(c.chest)}`, 0.72)
      tag(`Waist ${f(c.waist)}`, 0.62)
      tag(`Hips ${f(c.hips)}`, 0.52)
      tag(`Neck ${f(c.neck)}`, 0.865)
      st.controls.target.set(0, h * 0.52, 0)
    },
    [s.entries, s.sel, s.height, s.sex, s.ghost, s.unit],
    { camera: [0.45, 1.25, 2.4], target: [0, 0.9, 0], background: '#0f172a' },
  )

  const add = () => {
    const base = cur ?? DEF.entries[0]
    const e = { ...base, id: uid(), date: today(), note: '' }
    set({ entries: [...s.entries, e], sel: e.id })
  }

  const ch = changes(s.entries)
  const whr = cur ? waistHip(cur) : NaN
  const whtr = cur ? waistHeight(cur.waist, s.height) : NaN
  const bf = cur ? navyBodyFat(s.sex, s.height, cur.neck, cur.waist, cur.hips) : NaN
  const sign = (x: number, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + num(Math.abs(x), d)
  const chartPts = sorted.map((e) => [new Date(e.date).getTime() / 864e5, s.chart === 'weight' ? (s.wunit === 'kg' ? e.weight : e.weight / LB) : (s.unit === 'cm' ? e[s.chart] : e[s.chart] / IN)] as [number, number])

  return (
    <Split wide="right">
      <div>
        <Panel title="Profile">
          <Row>
            <Seg value={s.sex} onChange={(sex) => set({ sex })} options={[['male', 'Male'], ['female', 'Female']]} />
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['cm', 'cm'], ['in', 'inches']]} />
            <Seg value={s.wunit} onChange={(wunit) => set({ wunit })} options={[['kg', 'kg'], ['lb', 'lb']]} />
          </Row>
          <Num key={'h' + s.unit} label="Height" value={+(s.unit === 'cm' ? s.height : s.height / IN).toFixed(1)} onChange={(v) => set({ height: toCm(v) })} unit={s.unit} min={1} />
        </Panel>
        {cur && (
          <Panel title={`Measurements — ${cur.date}`} actions={<Btn kind="danger" disabled={s.entries.length < 2} onClick={() => set({ entries: s.entries.filter((e) => e.id !== cur.id), sel: '' })}>Delete</Btn>}>
            <Row>
              <label className="k-field"><span className="k-label">Date</span><input className="k-input" type="date" value={cur.date} onChange={(ev) => edit(cur.id, { date: ev.target.value })} /></label>
              <Num key={cur.id + s.wunit} label="Weight" value={+(s.wunit === 'kg' ? cur.weight : cur.weight / LB).toFixed(1)} onChange={(v) => edit(cur.id, { weight: s.wunit === 'kg' ? v : v * LB })} unit={s.wunit} min={0} />
            </Row>
            <Row>
              {MEASURES.map((k) => (
                <Num key={cur.id + k + s.unit} label={NAMES[k]} value={+(s.unit === 'cm' ? cur[k] : cur[k] / IN).toFixed(1)} onChange={(v) => edit(cur.id, { [k]: toCm(v) })} unit={s.unit} min={0} />
              ))}
            </Row>
            <label className="k-field"><span className="k-label">Note</span><input className="k-input" value={cur.note} onChange={(ev) => edit(cur.id, { note: ev.target.value })} /></label>
            <Note>Measure at the same time of day, relaxed, tape snug but not compressing: waist at the navel, hips at the widest point, chest at nipple line, arm/thigh/calf at the largest girth.</Note>
          </Panel>
        )}
        <Panel title="Ratios (current entry)">
          <Stats>
            <Stat label="Waist-to-hip" value={num(whr, 2)} sub={Number.isFinite(whr) ? (whrRisk(whr, s.sex) === 'high' ? 'Above WHO cut-off' : 'Below WHO cut-off') : ''} tone={whrRisk(whr, s.sex) === 'high' ? 'bad' : 'good'} />
            <Stat label="Waist-to-height" value={num(whtr, 2)} sub={whtrBand(whtr)} tone={whtr >= 0.5 ? 'bad' : 'good'} />
            <Stat label="Body fat (US Navy)" value={Number.isFinite(bf) ? pct(bf / 100) : '—'} sub="Tape estimate ±3–4%" />
          </Stats>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Entries" value={s.entries.length} sub={first && cur ? `${first.date} → ${sorted[sorted.length - 1].date}` : ''} />
          <Stat label="Waist change" value={`${sign(s.unit === 'cm' ? ch.waist : ch.waist / IN)} ${s.unit}`} tone={ch.waist < 0 ? 'good' : ch.waist > 0 ? 'bad' : undefined} />
          <Stat label="Weight change" value={`${sign(s.wunit === 'kg' ? ch.weight : ch.weight / LB)} ${s.wunit}`} tone={ch.weight < 0 ? 'good' : undefined} />
          <Stat label="Arm change" value={`${sign(s.unit === 'cm' ? ch.arm : ch.arm / IN)} ${s.unit}`} tone="accent" />
        </Stats>
        <Panel title="3D silhouette" actions={<Check label="Overlay first entry" value={s.ghost} onChange={(ghost) => set({ ghost })} />}>
          <View3D refEl={ref} height={440} />
          <p className="muted" style={{ fontSize: 13 }}>Parametric body: every girth becomes an elliptical cross-section of the same circumference. Blue wireframe = your first entry. Drag to orbit.</p>
        </Panel>
        <Panel title="Trend" actions={<Select label="" value={s.chart} onChange={(chart) => set({ chart })} options={(['weight', ...MEASURES] as const).map((k) => [k, NAMES[k]] as const)} />}>
          <LineChart series={[{ name: NAMES[s.chart], points: chartPts, area: true }]} fx={(d) => new Date(d * 864e5).toISOString().slice(5, 10)} fy={(v) => num(v, 1)} yLabel={s.chart === 'weight' ? s.wunit : s.unit} />
        </Panel>
        <Panel
          title="History"
          actions={
            <>
              <Btn kind="primary" onClick={add}>+ New entry</Btn>
              <CsvButton name="body-measurements.csv" rows={() => [['Date', `Weight (${s.wunit})`, ...MEASURES.map((k) => `${NAMES[k]} (${s.unit})`), 'Note'], ...sorted.map((e) => [e.date, W(e.weight), ...MEASURES.map((k) => L(e[k])), e.note])]} />
              <JsonButtons name="body-measurements.json" data={s} onLoad={(d) => d && Array.isArray(d.entries) && set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Date', s.wunit, 'Waist', 'Hips', 'Chest', 'Arm', 'Note', '']}
            rows={[...sorted].reverse().map((e) => [
              <b key="d" style={{ color: e.id === cur?.id ? 'var(--accent)' : undefined }}>{e.date}</b>, W(e.weight), L(e.waist), L(e.hips), L(e.chest), L(e.arm), e.note,
              <Btn key="v" kind="ghost" onClick={() => set({ sel: e.id })}>{e.id === cur?.id ? 'Viewing' : 'View'}</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
