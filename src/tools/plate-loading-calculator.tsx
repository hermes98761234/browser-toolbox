import { useMemo } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { fromKg, planSets, ramp, sleeveUsed, toKg, type Plate, type RampStep, type Unit } from './lib/plate-loading-calculator'
import { platesFor } from './lib/one-rep-max-calculator'

interface Gym { id: string; name: string; unit: Unit; plates: Plate[] }
interface BarPreset { id: string; name: string; unit: Unit; w: number; sleeve: number }

const BARS: BarPreset[] = [
  { id: 'm20', name: "Men's Olympic 20 kg", unit: 'kg', w: 20, sleeve: 415 },
  { id: 'w15', name: "Women's Olympic 15 kg", unit: 'kg', w: 15, sleeve: 320 },
  { id: 'pb20', name: 'Power bar 20 kg', unit: 'kg', w: 20, sleeve: 420 },
  { id: 't10', name: 'Technique bar 10 kg', unit: 'kg', w: 10, sleeve: 260 },
  { id: 's45', name: 'Standard bar 45 lb', unit: 'lb', w: 45, sleeve: 413 },
  { id: 'w35', name: "Women's bar 35 lb", unit: 'lb', w: 35, sleeve: 320 },
  { id: 'trap', name: 'Trap / hex bar 55 lb', unit: 'lb', w: 55, sleeve: 254 },
  { id: 'ez', name: 'EZ curl bar 25 lb', unit: 'lb', w: 25, sleeve: 200 },
]
const B = (w: number, pairs: number, mm: number, bumper = false): Plate => ({ w, pairs, mm, bumper })
const GYMS: Gym[] = [
  { id: 'home', name: 'Home garage (bumpers)', unit: 'kg', plates: [B(20, 2, 64, true), B(15, 1, 50, true), B(10, 2, 40, true), B(5, 1, 25), B(2.5, 2, 18), B(1.25, 2, 13)] },
  { id: 'meet', name: 'Competition calibrated', unit: 'kg', plates: [B(25, 9, 27), B(20, 1, 23), B(15, 1, 21), B(10, 1, 18), B(5, 1, 17), B(2.5, 1, 16), B(1.25, 1, 12), B(0.5, 1, 10)] },
  { id: 'comm', name: 'Commercial gym (iron)', unit: 'lb', plates: [B(45, 8, 38), B(35, 2, 33), B(25, 4, 29), B(10, 4, 22), B(5, 4, 18), B(2.5, 2, 15)] },
]
const SCHEMES: Record<string, RampStep[]> = {
  'Standard 5-step': [{ pct: 0, reps: 10 }, { pct: 40, reps: 5 }, { pct: 60, reps: 3 }, { pct: 80, reps: 2 }, { pct: 90, reps: 1 }],
  'Short 3-step': [{ pct: 0, reps: 8 }, { pct: 50, reps: 5 }, { pct: 75, reps: 2 }],
  'Olympic lifts': [{ pct: 0, reps: 5 }, { pct: 40, reps: 3 }, { pct: 55, reps: 3 }, { pct: 70, reps: 2 }, { pct: 80, reps: 1 }, { pct: 90, reps: 1 }],
}

const DEF = {
  gyms: GYMS,
  gymId: 'home',
  barId: 'm20',
  barW: 20,
  sleeve: 415,
  collars: 0,
  collarMm: 25,
  quick: 102.5,
  work: 120,
  workSets: 3,
  workReps: 5,
  steps: SCHEMES['Standard 5-step'],
  optimize: true,
  warmInc: 5,
}

const KG_COLORS: Record<string, string> = { '25': '#dc2626', '20': '#2563eb', '15': '#eab308', '10': '#16a34a', '5': '#f8fafc', '2.5': '#b91c1c', '1.25': '#94a3b8', '0.5': '#cbd5e1' }
const LB_COLORS: Record<string, string> = { '55': '#dc2626', '45': '#2563eb', '35': '#eab308', '25': '#16a34a', '10': '#f8fafc', '5': '#b91c1c', '2.5': '#94a3b8', '1.25': '#cbd5e1' }
const plateColor = (p: Plate, u: Unit) => (p.bumper && !(u === 'kg' ? KG_COLORS : LB_COLORS)[p.w] ? '#1f2937' : ((u === 'kg' ? KG_COLORS : LB_COLORS)[p.w] ?? '#475569'))
/** Diameter in mm: bumpers are full size; steel/iron plates shrink with weight. */
function diaOf(p: Plate, u: Unit) {
  if (p.bumper) return 450
  const kg = toKg(p.w, u)
  return kg >= 19 ? 450 : kg >= 14 ? 400 : kg >= 9 ? 325 : kg >= 4.5 ? 230 : kg >= 2 ? 190 : kg >= 1 ? 160 : 135
}

function BarbellSvg({ st, plates, unit, sleeve, collarMm }: { st: number[]; plates: Plate[]; unit: Unit; sleeve: number; collarMm: number }) {
  const used = sleeveUsed(st, plates, collarMm)
  const W = 760, H = 210, cy = 105, shaft = 150
  const k = 270 / Math.max(sleeve, used, 1)
  const side = (dir: 1 | -1) => {
    const x0 = W / 2 + dir * (shaft / 2 + 12)
    let x = x0
    const g: React.ReactNode[] = []
    st.forEach((i, n) => {
      const p = plates[i]
      const w = Math.max(4, p.mm * k), h = diaOf(p, unit) * 0.4
      const rx = dir === 1 ? x : x - w
      const c = plateColor(p, unit)
      g.push(
        <g key={`${dir}${n}`}>
          <rect x={rx} y={cy - h / 2} width={w} height={h} rx={2} fill={c} stroke="rgba(0,0,0,.6)" />
          {w > 13 && dir === 1 && <text x={rx + w / 2} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={c === '#f8fafc' || c === '#eab308' ? '#111' : '#fff'}>{p.w}</text>}
        </g>,
      )
      x += dir * w
    })
    if (st.length) g.push(<rect key={`c${dir}`} x={dir === 1 ? x : x - collarMm * k} y={cy - 14} width={collarMm * k} height={28} rx={3} fill="#64748b" />)
    const end = x0 + dir * sleeve * k
    return (
      <g key={dir}>
        <rect x={Math.min(x0, end)} y={cy - 9} width={sleeve * k} height={18} rx={3} fill="#cbd5e1" stroke="#94a3b8" />
        {g}
        {used > sleeve && <line x1={end} x2={end} y1={cy - 100} y2={cy + 100} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" />}
      </g>
    )
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Loaded barbell">
      <rect x={W / 2 - shaft / 2} y={cy - 5} width={shaft} height={10} fill="#94a3b8" />
      <rect x={W / 2 - shaft / 2 - 12} y={cy - 15} width={12} height={30} rx={2} fill="#64748b" />
      <rect x={W / 2 + shaft / 2} y={cy - 15} width={12} height={30} rx={2} fill="#64748b" />
      {side(1)}
      {side(-1)}
      {!st.length && <text x={W / 2} y={cy - 30} textAnchor="middle" fontSize={13} fill="var(--muted)">Empty bar</text>}
    </svg>
  )
}

const Chips = ({ st, plates, unit }: { st: number[]; plates: Plate[]; unit: Unit }) =>
  st.length ? (
    <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap' }}>
      {st.map((i, n) => {
        const c = plateColor(plates[i], unit)
        return <span key={n} style={{ background: c, color: c === '#f8fafc' || c === '#eab308' ? '#111' : '#fff', borderRadius: 4, padding: '0 5px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(0,0,0,.25)' }}>{plates[i].w}</span>
      })}
    </span>
  ) : <span className="muted">bar only</span>

export default function PlateLoadingCalculator() {
  const [s, set, reset] = useToolState('plate-loading-calculator', DEF)
  const gym = s.gyms.find((g) => g.id === s.gymId) ?? s.gyms[0]
  const u = gym.unit
  const plates = gym.plates
  const other: Unit = u === 'kg' ? 'lb' : 'kg'
  const editGym = (patch: Partial<Gym>) => set({ gyms: s.gyms.map((g) => (g.id === gym.id ? { ...g, ...patch } : g)) })
  const editPlate = (i: number, patch: Partial<Plate>) => editGym({ plates: plates.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const round = (x: number) => Math.round(x / (u === 'kg' ? 2.5 : 5)) * (u === 'kg' ? 2.5 : 5)

  const switchGym = (id: string) => {
    const g = s.gyms.find((x) => x.id === id)
    if (!g) return
    if (g.unit === u) return set({ gymId: id })
    const conv = (x: number) => Math.round(fromKg(toKg(x, u), g.unit) / (g.unit === 'kg' ? 2.5 : 5)) * (g.unit === 'kg' ? 2.5 : 5)
    const bar = BARS.find((b) => b.unit === g.unit)!
    set({ gymId: id, work: conv(s.work), quick: conv(s.quick), barId: bar.id, barW: bar.w, sleeve: bar.sleeve, warmInc: g.unit === 'kg' ? 5 : 10, collars: Math.round(fromKg(toKg(s.collars, u), g.unit) * 4) / 4 })
  }
  const pickBar = (id: string) => {
    const b = BARS.find((x) => x.id === id)
    set(b ? { barId: id, barW: b.w, sleeve: b.sleeve } : { barId: id })
  }

  const quick = useMemo(() => planSets({ sets: [{ label: 'Load', reps: 1, target: s.quick }], bar: s.barW, collars: s.collars, plates }, false)[0], [s.quick, s.barW, s.collars, plates])
  const sets = useMemo(() => ramp(s.work, s.steps, s.workSets, s.workReps, s.barW, s.collars, s.warmInc), [s.work, s.steps, s.workSets, s.workReps, s.barW, s.collars, s.warmInc])
  const plan = useMemo(() => planSets({ sets, bar: s.barW, collars: s.collars, plates }, s.optimize), [sets, s.barW, s.collars, plates, s.optimize])
  const naive = useMemo(() => planSets({ sets, bar: s.barW, collars: s.collars, plates }, false), [sets, s.barW, s.collars, plates])
  const moves = (p: typeof plan) => p.reduce((a, x) => a + x.moves, 0)
  const maxSleeve = Math.max(0, ...plan.map((p) => sleeveUsed(p.stack, plates, s.collarMm)))
  const quickUsed = sleeveUsed(quick.stack, plates, s.collarMm)
  const best = platesFor(1e6, s.barW, s.collars, plates.map((p) => ({ plate: p.w, pairs: p.pairs }))).total
  const short = plan.filter((p) => p.target - p.total > 1e-6)

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><title>Loading plan</title><style>body{font:14px system-ui,sans-serif;margin:14mm}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}table{border-collapse:collapse;width:100%}</style><h2>Loading plan · ${gym.name}</h2><p>Bar ${s.barW} ${u}${s.collars ? ` + collars ${s.collars} ${u}` : ''} · plates listed per side, inside → out</p><table><tr><th>Set</th><th>Reps</th><th>Load</th><th>Each side</th><th>Moves</th></tr>${plan.map((p) => `<tr><td>${p.label}</td><td>${p.reps}</td><td><b>${num(p.total)} ${u}</b></td><td>${p.stack.map((i) => plates[i].w).join(' · ') || 'bar'}</td><td>${p.moves}</td></tr>`).join('')}</table><script>onload=()=>setTimeout(()=>print(),200)</script>`)
    w.document.close()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Gym & bar" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Gym (plate inventory)" value={gym.id} onChange={switchGym} options={s.gyms.map((g) => [g.id, `${g.name} · ${g.unit}`] as [string, string])} />
          <Row>
            <Txt label="Gym name" value={gym.name} onChange={(name) => editGym({ name })} />
            <div className="k-field"><span className="k-label">Unit</span><Seg value={u} onChange={(unit) => editGym({ unit })} options={[['kg', 'kg'], ['lb', 'lb']]} /></div>
          </Row>
          <Row>
            <Btn onClick={() => { const id = uid(); set({ gyms: [...s.gyms, { ...gym, id, name: `${gym.name} (copy)` }], gymId: id }) }}>＋ Copy gym</Btn>
            <Btn kind="danger" disabled={s.gyms.length < 2} onClick={() => { const rest = s.gyms.filter((g) => g.id !== gym.id); set({ gyms: rest, gymId: rest[0].id }) }}>Delete gym</Btn>
          </Row>
          <Select label="Bar" value={s.barId} onChange={pickBar} options={[...BARS.filter((b) => b.unit === u).map((b) => [b.id, b.name] as [string, string]), ['custom', 'Custom bar']]} />
          <Row>
            <Num label="Bar weight" value={s.barW} onChange={(barW) => set({ barW, barId: 'custom' })} unit={u} min={0} />
            <Num label="Loadable sleeve" value={s.sleeve} onChange={(sleeve) => set({ sleeve, barId: 'custom' })} unit="mm" min={50} />
          </Row>
          <Row>
            <Num label="Collars (pair)" value={s.collars} onChange={(collars) => set({ collars })} unit={u} min={0} hint="0 for spring clips, 5 kg for competition collars" />
            <Num label="Collar width" value={s.collarMm} onChange={(collarMm) => set({ collarMm })} unit="mm" min={0} />
          </Row>
        </Panel>
        <Panel title="Plate inventory" actions={<JsonButtons name="plate-gyms.json" data={s.gyms} onLoad={(gyms) => Array.isArray(gyms) && gyms.length && set({ gyms, gymId: gyms[0].id })} />}>
          <Table
            head={[`Plate (${u})`, 'Pairs', 'Width mm', 'Bumper', '']}
            rows={plates.map((p, i) => [
              <input key="w" type="number" min={0} step="any" value={p.w} onChange={(e) => editPlate(i, { w: Math.max(0, +e.target.value) })} style={{ width: 70 }} />,
              <input key="n" type="number" min={0} step={1} value={p.pairs} onChange={(e) => editPlate(i, { pairs: Math.max(0, Math.round(+e.target.value)) })} style={{ width: 56 }} />,
              <input key="m" type="number" min={1} step={1} value={p.mm} onChange={(e) => editPlate(i, { mm: Math.max(1, +e.target.value) })} style={{ width: 60 }} />,
              <input key="b" type="checkbox" checked={p.bumper} onChange={(e) => editPlate(i, { bumper: e.target.checked })} />,
              <Btn key="x" kind="ghost" onClick={() => editGym({ plates: plates.filter((_, j) => j !== i) })} title="Remove">✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => editGym({ plates: [...plates, B(u === 'kg' ? 2.5 : 5, 1, 16)] })}>＋ Add plate size</Btn>
            <Btn kind="ghost" onClick={() => editGym({ plates: [...plates].sort((a, b) => b.w - a.w || Number(b.bumper) - Number(a.bumper)) })}>Sort</Btn>
          </Row>
          <p className="k-hint">Pairs = how many of each plate you can put on <i>each</i> side. Widths are typical values (bumpers are thick, calibrated steel thin); measure yours for an exact sleeve check. Heaviest max load: <b>{num(best)} {u}</b>.</p>
        </Panel>
      </div>
      <div>
        <Panel title="Load the bar">
          <Row>
            <Num label="Target weight" value={s.quick} onChange={(quick) => set({ quick })} unit={u} min={0} />
            <Btn onClick={() => set({ quick: Math.max(s.barW, s.quick - (u === 'kg' ? 2.5 : 5)) })}>−{u === 'kg' ? 2.5 : 5}</Btn>
            <Btn onClick={() => set({ quick: s.quick + (u === 'kg' ? 2.5 : 5) })}>＋{u === 'kg' ? 2.5 : 5}</Btn>
          </Row>
          <Stats>
            <Stat label="Loaded" value={`${num(quick.total)} ${u}`} sub={`≈ ${num(fromKg(toKg(quick.total, u), other), 1)} ${other}`} tone="accent" />
            <Stat label="Each side" value={`${num((quick.total - s.barW - s.collars) / 2)} ${u}`} sub={`${quick.stack.length} plate${quick.stack.length === 1 ? '' : 's'}`} />
            <Stat label="Sleeve used" value={`${Math.round(quickUsed)} / ${s.sleeve} mm`} tone={quickUsed > s.sleeve ? 'bad' : 'good'} sub={quickUsed > s.sleeve ? 'does not fit!' : `${Math.round((quickUsed / s.sleeve) * 100)}%`} />
          </Stats>
          <BarbellSvg st={quick.stack} plates={plates} unit={u} sleeve={s.sleeve} collarMm={s.collarMm} />
          <p style={{ margin: '4px 0' }}><b>Each side, inside → out:</b> <Chips st={quick.stack} plates={plates} unit={u} /></p>
          {s.quick - quick.total > 1e-6 && <Note tone="warn">{num(s.quick)} {u} is not reachable with this inventory; closest load below it is {num(quick.total)} {u}.</Note>}
          {s.quick < s.barW + s.collars && <Note tone="warn">The target is lighter than the empty bar ({num(s.barW + s.collars)} {u}).</Note>}
          {quickUsed > s.sleeve && <Note tone="err">The plates need {Math.round(quickUsed)} mm but the sleeve has {s.sleeve} mm. Use thinner (steel) plates or a longer-sleeved bar.</Note>}
        </Panel>
        <Panel title="Warm-up ramp & set plan" actions={<><CsvButton name="loading-plan.csv" rows={() => [['Set', 'Reps', `Target ${u}`, `Loaded ${u}`, 'Each side (inside→out)', 'Plate moves per side'], ...plan.map((p) => [p.label, p.reps, num(p.target), p.total, p.stack.map((i) => plates[i].w).join(' '), p.moves])]} /><Btn onClick={print}>🖨 Print</Btn></>}>
          <Row>
            <Num label="Working weight" value={s.work} onChange={(work) => set({ work })} unit={u} min={0} />
            <Num label="Work sets" value={s.workSets} onChange={(workSets) => set({ workSets: Math.max(0, Math.round(workSets)) })} min={0} max={10} step={1} />
            <Num label="Reps" value={s.workReps} onChange={(workReps) => set({ workReps })} min={1} step={1} />
            <Select label="Round warm-ups to" value={s.warmInc} onChange={(warmInc) => set({ warmInc })} options={(u === 'kg' ? [0, 2.5, 5, 10] : [0, 5, 10, 20]).map((v) => [v, v ? `${v} ${u}` : 'exact'] as [number, string])} />
          </Row>
          <Row>
            {Object.entries(SCHEMES).map(([k, v]) => <Btn key={k} kind="ghost" onClick={() => set({ steps: v })}>{k}</Btn>)}
            <Btn kind="ghost" onClick={() => set({ work: round(s.work * 0.9) })}>Deload −10%</Btn>
          </Row>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {s.steps.map((st, i) => (
              <span key={i} className="k-input" style={{ padding: '2px 6px', gap: 4, display: 'inline-flex', alignItems: 'center' }}>
                <input type="number" value={st.pct} min={0} max={100} onChange={(e) => set({ steps: s.steps.map((x, j) => (j === i ? { ...x, pct: Math.max(0, Math.min(100, +e.target.value)) } : x)) })} style={{ width: 54, padding: '4px 2px', textAlign: 'right' }} aria-label="percent" />%×
                <input type="number" value={st.reps} min={1} onChange={(e) => set({ steps: s.steps.map((x, j) => (j === i ? { ...x, reps: Math.max(1, Math.round(+e.target.value)) } : x)) })} style={{ width: 46, padding: '4px 2px', textAlign: 'right' }} aria-label="reps" />
                <button type="button" className="k-btn ghost" style={{ padding: '0 4px' }} onClick={() => set({ steps: s.steps.filter((_, j) => j !== i) })} aria-label="Remove step">✕</button>
              </span>
            ))}
            <Btn onClick={() => set({ steps: [...s.steps, { pct: 95, reps: 1 }] })}>＋ Step</Btn>
          </div>
          <Check label="Order plates for the fewest plate changes between sets" value={s.optimize} onChange={(optimize) => set({ optimize })} />
          <Stats>
            <Stat label="Sets" value={plan.length} sub={`${s.steps.length} warm-up · ${s.workSets} work`} />
            <Stat label="Plate moves / side" value={moves(plan)} sub={s.optimize && moves(naive) > moves(plan) ? `saves ${moves(naive) - moves(plan)} vs fewest-plates` : 'add + remove'} tone="accent" />
            <Stat label="Max sleeve" value={`${Math.round(maxSleeve)} mm`} sub={`of ${s.sleeve} mm`} tone={maxSleeve > s.sleeve ? 'bad' : undefined} />
          </Stats>
          <Table
            head={['Set', 'Reps', 'Load', 'Each side (inside → out)', 'Moves']}
            rows={plan.map((p) => [
              <b key="l">{p.label}</b>,
              p.reps,
              <span key="t">{num(p.total)} {u}{p.target - p.total > 1e-6 && <span className="muted"> (want {num(p.target, 1)})</span>}</span>,
              <Chips key="c" st={p.stack} plates={plates} unit={u} />,
              p.moves ? `${p.moves}` : '—',
            ])}
          />
          {short.length > 0 && <Note tone="warn">{short.length} set(s) are rounded down to the closest load your plates allow.</Note>}
          <Note>Moves count plates taken off or put on one sleeve: only the outermost plates can be changed, so keeping a shared inner stack (e.g. 20 → 20 + 10 rather than 25 + 5) saves time between sets.</Note>
        </Panel>
      </div>
    </Split>
  )
}
