import { useMemo } from 'react'
import { BarChart, Btn, Check, color, CsvButton, LineChart, money, Note, num, Num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { annualPct, equivalentFee, PRESETS, simulate, summarize, type Scenario } from './lib/investment-fee-analyzer'

const DEF = {
  initial: 25000, monthly: 500, growth: 2, ret: 7, years: 30, inflation: 2.5, real: false,
  scenarios: [
    { id: 'a', ...PRESETS[0] },
    { id: 'b', ...PRESETS[3] },
    { id: 'c', ...PRESETS[4] },
  ] as Scenario[],
}
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${num(x / 1e6, 2)}M` : Math.abs(x) >= 1e3 ? `$${num(x / 1e3, 0)}k` : `$${num(x, 0)}`)

export default function InvestmentFeeAnalyzer() {
  const [s, set, reset] = useToolState('investment-fee-analyzer', DEF)
  const inp = { initial: s.initial, monthly: s.monthly, growth: s.growth, ret: s.ret, years: Math.max(1, Math.min(60, Math.round(s.years))), inflation: s.inflation }
  const defl = (y: number) => (s.real ? (1 + s.inflation / 100) ** y : 1)
  const base = useMemo(() => simulate(inp, null), [s.initial, s.monthly, s.growth, s.ret, s.years, s.inflation]) // eslint-disable-line react-hooks/exhaustive-deps
  const runs = useMemo(() => s.scenarios.map((sc) => ({ sc, rows: simulate(inp, sc), sum: summarize(inp, sc), eq: equivalentFee(inp, sc) })), [s]) // eslint-disable-line react-hooks/exhaustive-deps
  const best = runs.reduce((a, r) => (r.sum.final > a.sum.final ? r : a), runs[0])
  const worst = runs.reduce((a, r) => (r.sum.final < a.sum.final ? r : a), runs[0])
  const baseFinal = base.at(-1)!.balance
  const edit = (id: string, p: Partial<Scenario>) => set({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const m0 = (x: number) => money(x, '$', 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Your plan">
          <Row>
            <Num label="Starting balance" value={s.initial} onChange={(initial) => set({ initial })} unit="$" min={0} />
            <Num label="Monthly contribution" value={s.monthly} onChange={(monthly) => set({ monthly })} unit="$" min={0} />
          </Row>
          <Slider label="Gross return (before fees)" value={s.ret} onChange={(ret) => set({ ret })} min={0} max={12} step={0.1} unit="%/yr" />
          <Slider label="Years invested" value={s.years} onChange={(years) => set({ years })} min={1} max={50} unit=" yrs" show={(v) => num(v, 0)} />
          <Slider label="Raise contributions each year" value={s.growth} onChange={(growth) => set({ growth })} min={0} max={10} step={0.5} unit="%" />
          <Row>
            <Num label="Inflation" value={s.inflation} onChange={(inflation) => set({ inflation })} unit="%/yr" min={0} max={20} />
            <Check label="Show in today's dollars" value={s.real} onChange={(real) => set({ real })} />
          </Row>
        </Panel>
        <Panel title="Scenarios" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          {s.scenarios.map((sc, i) => (
            <div key={sc.id} style={{ borderLeft: `4px solid ${color(i)}`, paddingLeft: 10, marginBottom: 14 }}>
              <Row wrap={false}>
                <input className="k-text" value={sc.name} onChange={(e) => edit(sc.id, { name: e.target.value })} aria-label="Scenario name" style={{ fontWeight: 700 }} />
                <Btn kind="ghost" onClick={() => set({ scenarios: s.scenarios.filter((x) => x.id !== sc.id) })} disabled={s.scenarios.length < 2} title="Remove">✕</Btn>
              </Row>
              <Row>
                <Num label="Expense ratio" value={sc.er} onChange={(er) => edit(sc.id, { er })} unit="%" min={0} max={5} />
                <Num label="Advisory fee" value={sc.advisory} onChange={(advisory) => edit(sc.id, { advisory })} unit="%" min={0} max={5} />
              </Row>
              <Row>
                <Num label="Sales load" value={sc.load} onChange={(load) => edit(sc.id, { load })} unit="%" min={0} max={10} hint="on each deposit" />
                <Num label="Flat fee" value={sc.flat} onChange={(flat) => edit(sc.id, { flat })} unit="$/yr" min={0} />
              </Row>
            </div>
          ))}
          <Select label="Add a scenario" value="" onChange={(n: string) => { const p = PRESETS.find((x) => x.name === n); if (p && s.scenarios.length < 5) set({ scenarios: [...s.scenarios, { id: uid(), ...p }] }) }} options={[['', s.scenarios.length >= 5 ? 'Up to 5 scenarios' : 'Choose a preset…'], ...PRESETS.map((p) => [p.name, `${p.name} (${num(p.er + p.advisory, 2)}%${p.load ? ` + ${p.load}% load` : ''})`] as [string, string])]} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Without any fees" value={short(baseFinal / defl(inp.years))} sub={`after ${inp.years} years`} />
          <Stat label={`Best: ${best.sc.name}`} value={short(best.sum.final / defl(inp.years))} tone="good" />
          <Stat label={`Costliest: ${worst.sc.name}`} value={short(worst.sum.final / defl(inp.years))} tone="bad" sub={`${pct(worst.sum.shareLost, 0)} of potential lost`} />
          <Stat label="Gap best vs worst" value={short((best.sum.final - worst.sum.final) / defl(inp.years))} tone="accent" />
        </Stats>
        <Panel title={`Balance over time${s.real ? " (today's dollars)" : ''}`}>
          <LineChart
            series={[
              { name: 'No fees', points: base.map((r) => [r.year, r.balance / defl(r.year)]), color: '#94a3b8', dashed: true },
              ...runs.map((r, i) => ({ name: r.sc.name, points: r.rows.map((x) => [x.year, x.balance / defl(x.year)] as [number, number]), color: color(i), area: i === runs.indexOf(worst) })),
            ]}
            xLabel="Years"
            fx={(v) => num(v, 0)}
            fy={short}
          />
        </Panel>
        <Panel title="Where the fee-free money went">
          <BarChart
            bars={runs.map((r, i) => ({ label: r.sc.name, value: [r.sum.final / defl(inp.years), r.sum.fees / defl(inp.years), Math.max(0, r.sum.lost) / defl(inp.years)], color: color(i) }))}
            stacks={[{ name: 'Your ending balance', color: '#10b981' }, { name: 'Fees paid', color: '#f59e0b' }, { name: 'Growth lost on fees', color: '#ef4444' }]}
            fy={short}
            height={260}
          />
          <Note>Each bar adds up to the fee-free ending balance. “Growth lost” is what the fees would have earned had they stayed invested — often bigger than the fees themselves.</Note>
        </Panel>
        <Panel title="Side by side" actions={<CsvButton name="fee-comparison.csv" rows={() => [['Year', 'No fees', ...runs.map((r) => r.sc.name)], ...base.map((b, y) => [y, Math.round(b.balance), ...runs.map((r) => Math.round(r.rows[y].balance))])]} />}>
          <Table
            head={['Scenario', 'Annual cost', 'Ending balance', 'Fees paid', 'Lost growth', 'Total drag', 'Equiv. fee']}
            rows={runs.map((r, i) => [
              <b key="n" style={{ color: color(i) }}>{r.sc.name}</b>,
              `${num(annualPct(r.sc), 2)}%${r.sc.load ? ` + ${r.sc.load}% load` : ''}${r.sc.flat ? ` + $${r.sc.flat}` : ''}`,
              m0(r.sum.final / defl(inp.years)),
              m0(r.sum.fees / defl(inp.years)),
              m0(r.sum.lost / defl(inp.years)),
              <span key="d">{m0(r.sum.drag / defl(inp.years))} <span className="muted">({pct(r.sum.shareLost, 1)})</span></span>,
              `${num(r.eq, 2)}%/yr`,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>Contributed in total: {m0(runs[0]?.sum.contributed ?? 0)}. “Equiv. fee” turns loads and flat fees into the yearly percentage that would cost the same over {inp.years} years.</p>
          <Note>Fees are certain; returns are not. A 1-point fee difference compounds into roughly a {pct(1 - (((1 + s.ret / 100) * 0.99) / (1 + s.ret / 100)) ** inp.years, 0)} smaller lump sum over {inp.years} years. Illustration only, not investment advice; taxes are ignored.</Note>
        </Panel>
      </div>
    </Split>
  )
}
