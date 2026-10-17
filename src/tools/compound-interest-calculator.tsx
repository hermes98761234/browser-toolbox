import { BarChart, Btn, CsvButton, Donut, LineChart, money, Note, Num, Panel, pct, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { effectiveAnnual, simulate, yearsToTarget } from './lib/compound-interest-calculator'

const DEF = {
  currency: '$', principal: 10000, rate: 7, years: 25, compound: 12, contribution: 300, contribFreq: 12,
  timing: 'end' as 'end' | 'begin', growth: 2, inflation: 2.5, target: 500000,
}
const FREQ: [number, string][] = [[1, 'Annually'], [2, 'Semi-annually'], [4, 'Quarterly'], [12, 'Monthly'], [26, 'Bi-weekly'], [52, 'Weekly'], [365, 'Daily'], [0, 'Continuously']]
const CFREQ: [number, string][] = [[1, 'per year'], [4, 'per quarter'], [12, 'per month'], [26, 'every 2 weeks'], [52, 'per week']]
const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Index fund', { rate: 7, compound: 12, years: 30 }],
  ['High-yield savings', { rate: 4.2, compound: 365, years: 5 }],
  ['Bond ladder', { rate: 4.5, compound: 2, years: 10 }],
  ['Kid’s college fund', { principal: 2000, contribution: 150, rate: 6, years: 18 }],
]

export default function CompoundInterestCalculator() {
  const [s, set, reset] = useToolState('compound-interest-calculator', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const ok = s.years > 0 && s.years <= 100 && s.rate > -100
  const rows = ok ? simulate(s) : []
  const last = rows[rows.length - 1]
  const real = last ? last.balance / (1 + s.inflation / 100) ** s.years : NaN
  const ear = effectiveAnnual(s.rate, s.compound)
  const tYears = ok ? yearsToTarget(s, s.target) : Infinity
  const noContrib = ok ? simulate({ ...s, contribution: 0 }) : []
  const doubling = s.rate > 0 ? Math.log(2) / Math.log(1 + ear) : Infinity
  const step = Math.max(1, Math.ceil(rows.length / 30))

  return (
    <Split>
      <div>
        <Panel title="Investment" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Initial deposit" value={s.principal} onChange={(principal) => set({ principal })} unit={s.currency} min={0} />
            <Num label="Annual interest rate" value={s.rate} onChange={(rate) => set({ rate })} unit="%" min={-50} max={100} step={0.1} />
          </Row>
          <Row>
            <Num label="Years" value={s.years} onChange={(years) => set({ years })} min={0.25} max={100} step={1} />
            <Select label="Compounding" value={s.compound} onChange={(compound) => set({ compound })} options={FREQ} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}
          </div>
        </Panel>
        <Panel title="Regular contributions">
          <Row>
            <Num label="Contribution" value={s.contribution} onChange={(contribution) => set({ contribution })} unit={s.currency} min={0} />
            <Select label="Frequency" value={s.contribFreq} onChange={(contribFreq) => set({ contribFreq })} options={CFREQ} />
          </Row>
          <Row>
            <Seg value={s.timing} onChange={(timing) => set({ timing })} options={[['end', 'End of period'], ['begin', 'Start of period']]} label="Timing" />
            <Num label="Raise contributions yearly" value={s.growth} onChange={(growth) => set({ growth })} unit="%" min={0} max={50} />
          </Row>
        </Panel>
        <Panel title="Goal & inflation">
          <Row>
            <Num label="Target balance" value={s.target} onChange={(target) => set({ target })} unit={s.currency} min={0} />
            <Num label="Inflation" value={s.inflation} onChange={(inflation) => set({ inflation })} unit="%" min={0} max={50} />
          </Row>
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          <Note>{Number.isFinite(tYears) ? <>You reach <b>{m(s.target)}</b> after about <b>{tYears.toFixed(1)} years</b>.</> : <>The target is not reached within 100 years at these settings.</>} Money doubles every {Number.isFinite(doubling) ? `${doubling.toFixed(1)} years` : '—'} (rule of 72: {s.rate > 0 ? (72 / s.rate).toFixed(1) : '—'}).</Note>
        </Panel>
      </div>
      <div>
        {!ok && <Note tone="err">Enter 0.25–100 years and a rate above −100%.</Note>}
        <Stats>
          <Stat label={`Balance after ${s.years} years`} value={last ? m(last.balance) : '—'} sub={`${m(real)} in today’s money`} tone="accent" />
          <Stat label="Total contributed" value={last ? m(last.contributed) : '—'} sub={`incl. ${m(s.principal)} initial`} />
          <Stat label="Interest earned" value={last ? m(last.interest) : '—'} sub={last ? `${pct(last.interest / (last.balance || 1), 0)} of the balance` : ''} tone="good" />
          <Stat label="Effective annual rate" value={pct(ear, 3)} sub={`APY at ${s.rate}% nominal`} />
        </Stats>
        <Panel title="Principal vs interest by year">
          <BarChart
            bars={rows.filter((_, i) => i % step === step - 1 || i === rows.length - 1).map((r) => ({ label: `Y${r.year}`, value: [s.principal, r.contributed - s.principal, Math.max(0, r.interest)] }))}
            stacks={[{ name: 'Initial deposit', color: '#64748b' }, { name: 'Contributions', color: '#6366f1' }, { name: 'Interest', color: '#10b981' }]}
            fy={(v) => m(v)}
            height={260}
          />
        </Panel>
        <Panel title="Growth curve">
          <LineChart
            series={[
              { name: 'Balance', points: [[0, s.principal], ...rows.map((r) => [r.year, r.balance] as [number, number])], color: '#10b981', area: true },
              { name: 'Contributed', points: [[0, s.principal], ...rows.map((r) => [r.year, r.contributed] as [number, number])], color: '#6366f1' },
              { name: 'Deposit only', points: [[0, s.principal], ...noContrib.map((r) => [r.year, r.balance] as [number, number])], color: '#94a3b8', dashed: true },
              { name: 'Balance in today’s money', points: [[0, s.principal], ...rows.map((r) => [r.year, r.balance / (1 + s.inflation / 100) ** r.year] as [number, number])], color: '#f59e0b', dashed: true },
            ]}
            xLabel="Years"
            fx={(v) => String(Math.round(v * 10) / 10)}
            fy={(v) => m(v)}
            markers={Number.isFinite(tYears) && tYears <= s.years ? [{ x: tYears, label: 'target' }] : []}
          />
        </Panel>
        {last && (
          <Panel title="Final balance breakdown">
            <Donut slices={[{ label: 'Initial deposit', value: s.principal, color: '#64748b' }, { label: 'Contributions', value: last.contributed - s.principal, color: '#6366f1' }, { label: 'Interest', value: Math.max(0, last.interest), color: '#10b981' }]} fv={m} center={<b>{m(last.balance)}</b>} />
          </Panel>
        )}
        <Panel title="Year-by-year schedule" actions={<CsvButton name="compound-interest.csv" rows={() => [['Year', 'Contributions this year', 'Interest this year', 'Total contributed', 'Total interest', 'Balance'], ...rows.map((r) => [r.year, r.yearContrib.toFixed(2), r.yearInterest.toFixed(2), r.contributed.toFixed(2), r.interest.toFixed(2), r.balance.toFixed(2)])]} />}>
          <Table head={['Year', 'Added', 'Interest', 'Total interest', 'Balance']} rows={rows.map((r) => [r.year, m(r.yearContrib), m(r.yearInterest), m(r.interest), <b key="b">{m(r.balance)}</b>])} max={40} />
        </Panel>
      </div>
    </Split>
  )
}
