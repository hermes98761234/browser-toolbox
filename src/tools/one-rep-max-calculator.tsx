import { Bar, Btn, Check, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { estimates, FORMULAS, pctTable, platesFor, roundTo, type FormulaId } from './lib/one-rep-max-calculator'

type Unit = 'kg' | 'lb'

const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
}
const BARS: Record<Unit, [number, string][]> = {
  kg: [[20, "Men's Olympic 20 kg"], [15, "Women's Olympic 15 kg"], [10, 'Technique / EZ 10 kg'], [25, 'Safety squat 25 kg'], [7, 'Short bar 7 kg']],
  lb: [[45, 'Standard Olympic 45 lb'], [35, "Women's bar 35 lb"], [55, 'Trap bar 55 lb'], [25, 'EZ curl 25 lb'], [15, 'Technique 15 lb']],
}
// Plate colours roughly follow the competition colour code.
const PLATE_COLOR: Record<number, string> = { 25: '#dc2626', 20: '#2563eb', 15: '#eab308', 10: '#16a34a', 5: '#e5e7eb', 2.5: '#b91c1c', 1.25: '#94a3b8', 0.5: '#cbd5e1', 55: '#dc2626', 45: '#2563eb', 35: '#eab308', 1: '#94a3b8' }

const LIFTS = ['Back squat', 'Bench press', 'Deadlift', 'Overhead press', 'Front squat', 'Barbell row', 'Other']

const DEF = {
  unit: 'kg' as Unit,
  lift: 'Bench press',
  weight: 100,
  reps: 5,
  use: ['epley', 'brzycki', 'lombardi', 'mayhew', 'oconner', 'wathan'] as FormulaId[],
  rounding: 2.5,
  bar: 20,
  collars: 0,
  target: 0, // 0 = use the percentage row picked below
  pick: 80,
  stock: {} as Record<string, number>,
}

function Barbell({ side, unit }: { side: { plate: number; pairs: number }[]; unit: Unit }) {
  const max = unit === 'kg' ? 25 : 55
  const list = side.flatMap((p) => Array.from({ length: p.pairs }, () => p.plate))
  const W = 420, cy = 70
  const xs = list.reduce<number[]>((a, _p, i) => [...a, i ? a[i - 1] + (list[i - 1] >= max * 0.35 ? 24 : 16) : 150], [])
  return (
    <svg viewBox={`0 0 ${W} 140`} width="100%" style={{ maxWidth: 520 }} role="img" aria-label="Plates on one side of the bar">
      <rect x={10} y={cy - 5} width={W - 20} height={10} rx={3} fill="#9ca3af" />
      <rect x={120} y={cy - 12} width={24} height={24} rx={3} fill="#6b7280" />
      {list.map((p, i) => {
        const h = 40 + 80 * Math.sqrt(p / max)
        const w = p >= max * 0.35 ? 22 : 14
        const x = xs[i]
        return (
          <g key={i}>
            <rect x={x} y={cy - h / 2} width={w} height={h} rx={3} fill={PLATE_COLOR[p] ?? '#64748b'} stroke="rgba(0,0,0,.35)" />
            {w > 14 && <text x={x + w / 2} y={cy + 4} textAnchor="middle" fontSize={10} fill={p === 5 ? '#111' : '#fff'} fontWeight={700}>{p}</text>}
          </g>
        )
      })}
      {list.length === 0 && <text x={260} y={cy - 18} fontSize={12} fill="var(--muted)" textAnchor="middle">Empty bar</text>}
    </svg>
  )
}

export default function OneRepMaxCalculator() {
  const [s, set, reset] = useToolState('one-rep-max-calculator', DEF)
  const u = s.unit
  const valid = s.weight > 0 && s.reps >= 1 && s.reps <= 20 && Number.isInteger(s.reps)
  const est = estimates(s.weight, s.reps, s.use)
  const rm = est.avg
  const table = valid ? pctTable(rm, 100, 50, 5) : []
  const r = (x: number) => roundTo(x, s.rounding)
  const target = s.target > 0 ? s.target : r((rm * s.pick) / 100)
  const stock = PLATES[u].map((plate) => ({ plate, pairs: s.stock[`${u}${plate}`] ?? (plate === 55 || plate === 0.5 ? 0 : 99) }))
  const pl = platesFor(target, s.bar, s.collars, stock)
  const vals = est.rows.map((x) => x.value).filter(Number.isFinite)
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0

  const switchUnit = (unit: Unit) => {
    if (unit === u) return
    const k = unit === 'lb' ? 2.20462 : 1 / 2.20462
    set({ unit, weight: Math.round(s.weight * k), bar: BARS[unit][0][0], rounding: unit === 'kg' ? 2.5 : 5, target: 0, collars: 0 })
  }

  return (
    <Split>
      <div>
        <Panel title="Your set" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={u} onChange={switchUnit} options={[['kg', 'Kilograms'], ['lb', 'Pounds']]} label="Units" />
          <Select label="Lift" value={s.lift} onChange={(lift) => set({ lift })} options={LIFTS} />
          <Row>
            <Num label="Weight lifted" value={s.weight} onChange={(weight) => set({ weight })} unit={u} min={0.5} />
            <Num label="Reps completed" value={s.reps} onChange={(reps) => set({ reps })} min={1} max={20} step={1} />
          </Row>
          {!valid && <Note tone="err">Enter a weight above zero and 1–20 whole reps.</Note>}
          {valid && s.reps > 10 && <Note tone="warn">Estimates get unreliable above 10 reps. A heavier set of 3–6 reps gives a better number.</Note>}
          <div className="k-label" style={{ marginTop: 8 }}>Formulas in the average</div>
          {FORMULAS.map((f) => (
            <div key={f.id}><Check label={<>{f.name} <span className="muted" style={{ fontSize: 12 }}>{f.expr}</span></>} value={s.use.includes(f.id)}
              onChange={(on) => set({ use: on ? [...s.use, f.id] : s.use.filter((x) => x !== f.id) })} /></div>
          ))}
          <Select label="Round loads to" value={s.rounding} onChange={(rounding) => set({ rounding })}
            options={(u === 'kg' ? [0.5, 1, 1.25, 2.5, 5] : [1, 2.5, 5, 10]).map((v) => [v, `${v} ${u}`] as [number, string])} />
        </Panel>
        <Panel title="Plate loader">
          <Row>
            <Select label="Bar" value={s.bar} onChange={(bar) => set({ bar })} options={BARS[u]} />
            <Num label="Collars (both)" value={s.collars} onChange={(collars) => set({ collars })} unit={u} min={0} hint={u === 'kg' ? 'Competition collars: 5 kg' : 'Spring clips ≈ 0'} />
          </Row>
          <Row>
            <Select label="Load for" value={s.target > 0 ? 0 : s.pick} onChange={(pick) => set(pick === 0 ? { target: target || 1 } : { pick, target: 0 })}
              options={[[0, 'Custom weight'] as [number, string], ...[100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map((p) => [p, `${p}% of 1RM`] as [number, string])]} />
            <Num label="Target weight" value={target} onChange={(t) => set({ target: t })} unit={u} min={0} />
          </Row>
          <Barbell side={pl.side} unit={u} />
          {target < s.bar + s.collars ? (
            <Note tone="warn">Target is lighter than the bar plus collars ({num(s.bar + s.collars)} {u}).</Note>
          ) : (
            <>
              <p style={{ margin: '6px 0' }}>
                <b>Each side:</b> {pl.side.length ? pl.side.map((p) => `${p.pairs} × ${p.plate}`).join(' + ') : 'nothing'} {u}
                <span className="muted"> ({num(pl.side.reduce((a, p) => a + p.plate * p.pairs, 0))} {u} per side)</span>
              </p>
              {Math.abs(pl.diff) > 1e-6 && <Note tone="warn">Closest load with your plates: {num(pl.total)} {u} ({num(pl.diff)} {u} short).</Note>}
            </>
          )}
          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>Plates available (pairs)</summary>
            <Row>
              {PLATES[u].map((p) => (
                <Num key={p} label={`${p} ${u}`} value={stock.find((x) => x.plate === p)!.pairs} min={0} step={1}
                  onChange={(v) => set({ stock: { ...s.stock, [`${u}${p}`]: Math.max(0, Math.floor(v)) } })} />
              ))}
            </Row>
          </details>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`Estimated 1RM · ${s.lift}`} value={valid && Number.isFinite(rm) ? `${num(rm, 1)} ${u}` : '—'} tone="accent" sub={`${s.use.length} formula${s.use.length === 1 ? '' : 's'} averaged`} />
          <Stat label="Rounded" value={valid && Number.isFinite(rm) ? `${num(r(rm), 2)} ${u}` : '—'} sub={`to nearest ${s.rounding} ${u}`} />
          <Stat label="Formula spread" value={valid ? `${num(spread, 1)} ${u}` : '—'} sub="highest − lowest" />
          <Stat label="Set intensity" value={valid && rm ? `${num((s.weight / rm) * 100, 0)}%` : '—'} sub="of estimated max" />
        </Stats>
        {s.use.length === 0 && <Note tone="warn">Tick at least one formula to get an average.</Note>}
        <Panel title="Formula comparison">
          <Table
            head={['Formula', 'Estimate', '']}
            rows={est.rows.map((x) => [
              <span key="n" style={{ opacity: x.used ? 1 : 0.55 }}>{x.name}{x.used ? ' ✓' : ''}</span>,
              <b key="v">{valid ? `${num(x.value, 1)} ${u}` : '—'}</b>,
              <div key="b" style={{ minWidth: 120 }}><Bar value={valid ? x.value - s.weight : 0} max={Math.max(1, ...vals.map((v) => v - s.weight))} color={x.used ? 'var(--accent)' : 'var(--muted)'} /></div>,
            ])}
          />
        </Panel>
        <Panel title="Percentage loading table" actions={<CsvButton name="1rm-percentages.csv" rows={() => [['% of 1RM', `Weight (${u})`, `Rounded (${u})`, 'Approx. reps'], ...table.map((t) => [t.pct, t.weight.toFixed(1), r(t.weight), t.reps])]} />}>
          <Table
            head={['% 1RM', 'Weight', 'Rounded', '≈ Reps', 'Typical use']}
            rows={table.map((t) => [
              <b key="p">{t.pct}%</b>,
              `${num(t.weight, 1)} ${u}`,
              <Btn key="r" kind="ghost" onClick={() => set({ pick: t.pct, target: 0 })} title="Show plates">{num(r(t.weight), 2)} {u}</Btn>,
              t.reps,
              t.pct >= 90 ? 'Max strength' : t.pct >= 80 ? 'Strength' : t.pct >= 67 ? 'Hypertrophy' : 'Volume / technique',
            ])}
          />
          <Note>Click a rounded weight to see the plates for it. Rep counts use the inverse Epley formula and vary from person to person.</Note>
        </Panel>
      </div>
    </Split>
  )
}
