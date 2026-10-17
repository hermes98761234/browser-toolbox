import { Btn, CopyButton, CsvButton, LineChart, money, Note, num, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { breakEven, curves, type BeInput } from './lib/break-even-calculator'

interface State extends BeInput {
  currency: string
  unit: string
  period: string
}

const PRESETS: [string, Omit<State, 'currency'>][] = [
  ['Coffee cart', { fixed: 4200, price: 4.5, variable: 1.35, expected: 1900, target: 2000, unit: 'cup', period: 'month' }],
  ['Bakery', { fixed: 18500, price: 3.2, variable: 1.1, expected: 11000, target: 5000, unit: 'item', period: 'month' }],
  ['SaaS plan', { fixed: 42000, price: 49, variable: 6, expected: 1300, target: 15000, unit: 'subscriber', period: 'month' }],
  ['Handmade shop', { fixed: 650, price: 38, variable: 14, expected: 45, target: 500, unit: 'order', period: 'month' }],
  ['Event ticketing', { fixed: 12000, price: 45, variable: 8, expected: 400, target: 3000, unit: 'ticket', period: 'event' }],
]

const DEF: State = { currency: '$', ...PRESETS[0][1] }

export default function BreakEvenCalculator() {
  const [s, set, reset] = useToolState('break-even-calculator', DEF)
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const r = breakEven(s)
  const ok = Number.isFinite(r.units)
  const maxU = Math.max(10, Math.ceil(Math.max(ok ? r.units * 2 : 0, s.expected * 1.25, ok ? r.targetUnits * 1.1 : 0) / 10) * 10)
  const c = curves(s, maxU)
  const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((f) => Math.round((ok ? r.unitsCeil : s.expected) * f))
  const sens: [string, BeInput][] = [
    ['Base case', s],
    ['Price +10%', { ...s, price: s.price * 1.1 }],
    ['Price −10%', { ...s, price: s.price * 0.9 }],
    ['Variable cost −10%', { ...s, variable: s.variable * 0.9 }],
    ['Variable cost +10%', { ...s, variable: s.variable * 1.1 }],
    ['Fixed costs −10%', { ...s, fixed: s.fixed * 0.9 }],
    ['Fixed costs +10%', { ...s, fixed: s.fixed * 1.1 }],
  ]
  const units = (x: number) => (Number.isFinite(x) ? `${num(Math.ceil(x - 1e-9), 0)} ${s.unit}s` : 'never')
  const summary = ok
    ? `Break-even: ${units(r.units)} per ${s.period} (${m(r.revenue)} revenue). Contribution margin ${m(r.cm, 2)} per ${s.unit} (${pct(r.cmRatio)}). At ${num(s.expected, 0)} ${s.unit}s profit is ${m(r.profit)}.`
    : 'No break-even: the price does not cover the variable cost per unit.'

  return (
    <Split>
      <div>
        <Panel title="Costs & price" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Preset" value="" onChange={(p) => { const hit = PRESETS.find(([n]) => n === p); if (hit) set(hit[1]) }} options={[['', 'Choose…'], ...PRESETS.map(([n]) => [n, n] as [string, string])]} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <Row>
            <Txt label="Unit name" value={s.unit} onChange={(unit) => set({ unit })} />
            <Txt label="Period" value={s.period} onChange={(period) => set({ period })} />
          </Row>
          <Num label={`Fixed costs per ${s.period}`} value={s.fixed} onChange={(fixed) => set({ fixed })} unit={s.currency} min={0} hint="Rent, salaries, software, insurance…" />
          <Row>
            <Num label={`Price per ${s.unit}`} value={s.price} onChange={(price) => set({ price })} unit={s.currency} min={0} />
            <Num label={`Variable cost per ${s.unit}`} value={s.variable} onChange={(variable) => set({ variable })} unit={s.currency} min={0} />
          </Row>
          <Row>
            <Num label={`Expected ${s.unit}s per ${s.period}`} value={s.expected} onChange={(expected) => set({ expected })} min={0} />
            <Num label="Target profit" value={s.target} onChange={(target) => set({ target })} unit={s.currency} />
          </Row>
          {!ok && <Note tone="err">Price ({m(s.price, 2)}) does not exceed variable cost ({m(s.variable, 2)}): every sale loses money, so there is no break-even point.</Note>}
        </Panel>
        <Panel title="Formulas">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
            <li>Contribution margin = price − variable cost = <b>{m(r.cm, 2)}</b></li>
            <li>Break-even units = fixed ÷ margin = {m(s.fixed)} ÷ {m(r.cm, 2)} = <b>{ok ? num(r.units, 2) : '∞'}</b></li>
            <li>Break-even revenue = fixed ÷ margin ratio = <b>{ok ? m(r.revenue) : '—'}</b></li>
            <li>Units for target = (fixed + target) ÷ margin = <b>{units(r.targetUnits)}</b></li>
            <li>Operating leverage = contribution ÷ profit = <b>{Number.isFinite(r.dol) ? num(r.dol, 2) + '×' : '—'}</b></li>
          </ul>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Break-even volume" value={units(r.units)} sub={`per ${s.period}`} tone="accent" />
          <Stat label="Break-even revenue" value={ok ? m(r.revenue) : '—'} />
          <Stat label="Contribution margin" value={m(r.cm, 2)} sub={`${pct(r.cmRatio)} of price`} />
          <Stat label={`Profit at ${num(s.expected, 0)}`} value={m(r.profit)} tone={r.profit >= 0 ? 'good' : 'bad'} sub={ok ? `Safety margin ${pct(r.safetyPct)}` : undefined} />
        </Stats>
        <Panel title="Cost–volume–profit chart" actions={<CopyButton text={summary} label="Copy summary" />}>
          <LineChart
            series={[
              { name: 'Revenue', points: c.revenue, color: '#10b981' },
              { name: 'Total cost', points: c.cost, color: '#ef4444' },
              { name: 'Fixed cost', points: c.fixed, color: '#64748b', dashed: true },
              { name: 'Profit', points: c.profit, color: '#6366f1', area: true },
            ]}
            height={300}
            xLabel={`${s.unit}s per ${s.period}`}
            fx={(v) => num(v, 0)}
            fy={(v) => m(v)}
            markers={[...(ok ? [{ x: r.units, label: 'Break-even' }] : []), ...(s.expected > 0 ? [{ x: s.expected, label: 'Expected' }] : [])]}
          />
          <Note tone={r.profit >= 0 ? 'ok' : 'warn'}>
            {ok
              ? r.safety >= 0
                ? `Expected sales are ${units(r.safety)} above break-even — sales could fall ${pct(r.safetyPct)} before you make a loss.`
                : `You need ${units(-r.safety)} more per ${s.period} to break even.`
              : summary}
          </Note>
        </Panel>
        <Panel title="Profit at different volumes" actions={<CsvButton name="break-even.csv" rows={() => [['Units', 'Revenue', 'Total cost', 'Profit'], ...steps.map((u) => [u, u * s.price, s.fixed + u * s.variable, u * r.cm - s.fixed])]} />}>
          <Table
            head={['Units', 'Revenue', 'Total cost', 'Profit']}
            rows={steps.map((u) => {
              const p = u * r.cm - s.fixed
              return [num(u, 0), m(u * s.price), m(s.fixed + u * s.variable), <b key="p" style={{ color: p >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(p)}</b>]
            })}
          />
        </Panel>
        <Panel title="Sensitivity">
          <Table
            head={['Scenario', 'Break-even', 'Change', `Profit at ${num(s.expected, 0)}`]}
            rows={sens.map(([n, inp]) => {
              const x = breakEven(inp)
              const d = Number.isFinite(x.units) && ok ? x.units / r.units - 1 : NaN
              return [n, units(x.units), Number.isFinite(d) && n !== 'Base case' ? `${d > 0 ? '+' : ''}${pct(d)}` : '—', m(x.profit)]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
