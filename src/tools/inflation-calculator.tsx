import { BarChart, Btn, Check, CsvButton, LineChart, money, Note, Num, Panel, pct, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { adjust, annualRate, compound, CPI_SOURCE, CPI_START_YEAR, cpiMonth, cpiYear, cumulative, LAST_MONTH, LAST_YEAR, lastLabel, MONTHS } from './lib/inflation-calculator'

const DEF = {
  mode: 'us' as 'us' | 'custom',
  amount: 100, fromY: 1990, fromM: 0, toY: LAST_YEAR, toM: LAST_MONTH, monthly: false,
  cur: '€', cAmount: 1000, cStart: 2020, cYears: 6, cRate: 3, perYear: false, rates: [0.3, 2.6, 8.4, 5.4, 2.4, 2.2] as number[],
}
const YEARS = Array.from({ length: LAST_YEAR - CPI_START_YEAR + 1 }, (_, i) => CPI_START_YEAR + i)

export default function InflationCalculator() {
  const [s, set] = useToolState('inflation-calculator', DEF)
  if (s.mode === 'custom') return <Custom s={s} set={set} />
  const at = (y: number, m: number) => (s.monthly ? cpiMonth(y, m) : cpiYear(y))
  const a = at(s.fromY, s.fromM), b = at(s.toY, s.toM)
  const span = s.toY - s.fromY + (s.monthly ? (s.toM - s.fromM) / 12 : 0)
  const ok = a && b && s.amount >= 0
  const value = ok ? adjust(s.amount, a.v, b.v) : NaN
  const cum = ok ? cumulative(a.v, b.v) : NaN
  const rate = ok ? annualRate(a.v, b.v, Math.abs(span)) * Math.sign(span || 1) : NaN
  const lo = Math.min(s.fromY, s.toY), hi = Math.max(s.fromY, s.toY)
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  const rows = years.map((y) => {
    const c = cpiYear(y)!
    const prev = cpiYear(y - 1)
    return { y, cpi: c.v, partial: c.partial, yoy: prev ? c.v / prev.v - 1 : NaN, val: a ? adjust(s.amount, a.v, c.v) : NaN }
  })
  const label = (y: number, m: number) => (s.monthly ? `${MONTHS[m]} ${y}` : `${y}${cpiYear(y)?.partial ? '*' : ''}`)
  const notes: string[] = []
  if (!s.monthly) for (const y of [...new Set([s.fromY, s.toY])]) { const c = cpiYear(y); if (c?.partial) notes.push(`* ${y}: average of the ${c.months} months published so far.`) }
  if (s.monthly && ((a && 'interpolated' in a && a.interpolated) || (b && 'interpolated' in b && b.interpolated))) notes.push('October 2025 CPI was never collected (U.S. government shutdown); the value is interpolated from September and November.')

  return (
    <Split wide="right">
      <div>
        <Panel title="Calculate">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['us', 'US dollar (CPI data)'], ['custom', 'Custom rate / other country']]} />
          <Num label="Amount" value={s.amount} onChange={(amount) => set({ amount })} unit="$" min={0} />
          <Check label="Pick exact months" value={s.monthly} onChange={(monthly) => set({ monthly })} />
          <Row>
            <Select label="From year" value={s.fromY} onChange={(v) => set({ fromY: Number(v) })} options={YEARS} />
            {s.monthly && <Select label="Month" value={s.fromM} onChange={(v) => set({ fromM: Number(v) })} options={MONTHS.map((m, i) => [i, m] as [number, string])} />}
          </Row>
          <Row>
            <Select label="To year" value={s.toY} onChange={(v) => set({ toY: Number(v) })} options={YEARS} />
            {s.monthly && <Select label="Month" value={s.toM} onChange={(v) => set({ toM: Number(v) })} options={MONTHS.map((m, i) => [i, m] as [number, string])} />}
          </Row>
          <Row>
            <Btn onClick={() => set({ fromY: s.toY, toY: s.fromY, fromM: s.toM, toM: s.fromM })}>⇄ Swap</Btn>
            {[1970, 1990, 2000, 2020].map((y) => <Btn key={y} kind="ghost" onClick={() => set({ fromY: y, toY: LAST_YEAR, toM: LAST_MONTH })}>{y} → now</Btn>)}
          </Row>
          {!ok && <Note tone="err">No CPI value for that date. Data covers Jan {CPI_START_YEAR} – {lastLabel()}.</Note>}
        </Panel>
        <Panel title="Data source">
          <p className="k-hint" style={{ margin: 0 }}>{CPI_SOURCE}. Latest data month: <b>{lastLabel()}</b>. Annual figures are averages of monthly index values (1982–84 = 100). CPI measures average urban consumer prices; your personal inflation can differ.</p>
        </Panel>
      </div>
      <div>
        <Panel title={`${money(s.amount)} in ${label(s.fromY, s.fromM)} → ${label(s.toY, s.toM)}`}>
          <Stats>
            <Stat label={`Equivalent in ${label(s.toY, s.toM)}`} value={money(value)} tone="accent" sub="same purchasing power" />
            <Stat label="Cumulative inflation" value={pct(cum, 1)} tone={cum > 0 ? 'bad' : 'good'} sub={ok ? `CPI ${a.v.toFixed(3)} → ${b.v.toFixed(3)}` : ''} />
            <Stat label="Average per year" value={pct(rate, 2)} sub={`over ${Math.abs(span).toFixed(s.monthly ? 1 : 0)} years`} />
            <Stat label="Purchasing power change" value={pct(ok ? a.v / b.v - 1 : NaN, 1)} sub={`$1 then buys what ${money(ok ? b.v / a.v : NaN)} buys later`} />
          </Stats>
          {notes.map((n) => <Note key={n}>{n}</Note>)}
          <LineChart
            series={[{ name: `Value of ${money(s.amount, '$', 0)} from ${s.fromY}`, points: rows.map((r) => [r.y, r.val] as [number, number]), area: true }]}
            fx={(v) => String(Math.round(v))} fy={(v) => money(v, '$', 0)} xLabel="Year" yLabel="Equivalent dollars" yMin={0}
          />
        </Panel>
        <Panel title="Year-over-year inflation (annual average CPI)">
          <BarChart bars={rows.filter((r) => Number.isFinite(r.yoy)).map((r) => ({ label: String(r.y), value: r.yoy * 100, color: r.yoy < 0 ? 'var(--ok)' : 'var(--accent)' }))} fy={(v) => `${v.toFixed(1)}%`} height={200} />
        </Panel>
        <Panel title="Year by year" actions={<CsvButton name="us-cpi-inflation.csv" rows={() => [['Year', 'CPI-U annual avg', 'YoY %', `Value of ${s.amount} from ${s.fromY}`], ...rows.map((r) => [r.y, r.cpi.toFixed(3), Number.isFinite(r.yoy) ? (r.yoy * 100).toFixed(2) : '', r.val.toFixed(2)])]} />}>
          <Table head={['Year', 'CPI-U', 'Inflation', 'Equivalent value']} rows={[...rows].reverse().map((r) => [`${r.y}${r.partial ? '*' : ''}`, r.cpi.toFixed(3), Number.isFinite(r.yoy) ? pct(r.yoy, 1) : '—', money(r.val)])} max={40} />
          {rows.some((r) => r.partial) && <p className="k-hint">* partial year — average of the months published so far.</p>}
        </Panel>
      </div>
    </Split>
  )
}

type S = typeof DEF
function Custom({ s, set }: { s: S; set: (p: Partial<S>) => void }) {
  const n = Math.max(1, Math.min(100, Math.round(s.cYears)))
  const rates = Array.from({ length: n }, (_, i) => (s.perYear ? (s.rates[i] ?? s.cRate) : s.cRate) / 100)
  const idx = compound(rates)
  const final = idx[n]
  const m = (x: number) => money(x, s.cur, 2)
  const avg = final ** (1 / n) - 1
  return (
    <Split wide="right">
      <div>
        <Panel title="Calculate">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['us', 'US dollar (CPI data)'], ['custom', 'Custom rate / other country']]} />
          <Row>
            <Num label="Amount" value={s.cAmount} onChange={(cAmount) => set({ cAmount })} unit={s.cur} min={0} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['€', '£', '$', '₴', 'zł', '¥', '₹', 'CHF ', 'kr ']} />
          </Row>
          <Row>
            <Num label="Start year" value={s.cStart} onChange={(cStart) => set({ cStart: Math.round(cStart) })} />
            <Num label="Number of years" value={s.cYears} onChange={(cYears) => set({ cYears })} min={1} max={100} />
          </Row>
          <Check label="Different rate for each year" value={s.perYear} onChange={(perYear) => set({ perYear })} />
          {!s.perYear ? (
            <Num label="Annual inflation rate" value={s.cRate} onChange={(cRate) => set({ cRate })} unit="%" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
              {Array.from({ length: n }, (_, i) => (
                <Num key={i} label={`${s.cStart + i}`} value={s.rates[i] ?? s.cRate} unit="%" onChange={(v) => { const r = [...s.rates]; for (let k = r.length; k < i; k++) r[k] = s.cRate; r[i] = v; set({ rates: r }) }} />
              ))}
            </div>
          )}
          <Note>For a country other than the US, enter official yearly CPI inflation rates from your national statistics office (or a central-bank target for projections). Per-year rates compound one after another.</Note>
        </Panel>
      </div>
      <div>
        <Panel title={`${m(s.cAmount)} over ${n} years`}>
          <Stats>
            <Stat label={`Needed in ${s.cStart + n} for the same goods`} value={m(s.cAmount * final)} tone="accent" />
            <Stat label="Cumulative inflation" value={pct(final - 1, 1)} tone={final > 1 ? 'bad' : 'good'} />
            <Stat label={`Real value of ${m(s.cAmount)} in ${s.cStart + n}`} value={m(s.cAmount / final)} sub={`in ${s.cStart} money`} />
            <Stat label="Average rate" value={pct(avg, 2)} sub="compound per year" />
          </Stats>
          <LineChart
            series={[
              { name: 'Price of the same basket', points: idx.map((v, i) => [s.cStart + i, s.cAmount * v] as [number, number]), area: true },
              { name: 'Purchasing power of the original amount', points: idx.map((v, i) => [s.cStart + i, s.cAmount / v] as [number, number]), dashed: true },
            ]}
            fx={(v) => String(Math.round(v))} fy={(v) => money(v, s.cur, 0)} xLabel="Year" yMin={0}
          />
        </Panel>
        <Panel title="Year by year">
          <Table head={['Year', 'Rate', 'Price level', 'Basket cost', 'Real value']} rows={idx.map((v, i) => [s.cStart + i, i ? pct(rates[i - 1], 1) : '—', v.toFixed(4), m(s.cAmount * v), m(s.cAmount / v)])} max={40} />
        </Panel>
      </div>
    </Split>
  )
}
