import { useMemo, useState } from 'react'
import { Btn, Check, CsvButton, Donut, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, today, useToolState } from '../kit'
import { checkTable, dueDates, estimate, YEARS, type Inputs, type Status, type YearTable } from './lib/quarterly-tax-estimator'

const DEF: Inputs & { year: string; custom: Record<string, string>; paid: number[]; state: number } = {
  year: '2026', status: 'single', profit: 85000, wages: 0, otherIncome: 1200, adjustments: 6000, itemized: 0, credits: 0, withholding: 0,
  priorTax: 14000, priorAgi: 72000, qbi: true, custom: {}, paid: [3500, 3500, 3500, 0], state: 0,
}
const STATUSES: [Status, string][] = [['single', 'Single'], ['mfj', 'Married filing jointly'], ['mfs', 'Married filing separately'], ['hoh', 'Head of household']]
const m = (x: number) => money(x, '$', 0)

export default function QuarterlyTaxEstimator() {
  const [s, set, reset] = useToolState('quarterly-tax-estimator', DEF)
  const [editing, setEditing] = useState(false)
  const raw = s.custom[s.year] ?? JSON.stringify(YEARS[s.year], null, 1)
  const parsed = useMemo((): { t: YearTable | null; err: string } => {
    try {
      const t = JSON.parse(raw) as YearTable
      const err = checkTable(t)
      return { t: err ? null : t, err }
    } catch (e) {
      return { t: null, err: (e as Error).message }
    }
  }, [raw])
  const table = parsed.t ?? YEARS[s.year]
  const r = estimate(s, table)
  const dates = dueDates(Number(s.year))
  const stateTax = (s.state / 100) * Math.max(0, r.agi - r.deduction)
  const income = s.profit + s.wages + s.otherIncome
  const setAside = (r.total - s.withholding + stateTax) / Math.max(1, s.profit)
  const now = today()
  const rows = dates.map((d, q) => {
    const cum = r.perQuarter * (q + 1)
    const cumPaid = s.paid.slice(0, q + 1).reduce((a, b) => a + (b || 0), 0)
    const short = Math.max(0, cum - cumPaid)
    return { q, d, amt: r.perQuarter, cum, paid: s.paid[q] ?? 0, short, past: d < now }
  })

  return (
    <Split>
      <div>
        <Note tone="warn"><b>Estimate, not tax advice.</b> US federal only (plus an optional flat state rate); simplified QBI, no AMT, NIIT, phase-outs or annualized-income method. Verify figures with the IRS (Form 1040-ES) or a tax professional.</Note>
        <Panel title="Year & filing status" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Tax year" value={s.year} onChange={(year) => set({ year })} options={Object.keys(YEARS).map((y) => [y, y] as [string, string])} />
            <Select label="Filing status" value={s.status} onChange={(status) => set({ status })} options={STATUSES} />
          </Row>
        </Panel>
        <Panel title="Income (expected for the full year)">
          <Row>
            <Num label="Self-employment net profit" value={s.profit} onChange={(profit) => set({ profit })} unit="$" min={0} hint="Schedule C: revenue − expenses" />
            <Num label="W-2 wages" value={s.wages} onChange={(wages) => set({ wages })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="Other ordinary income" value={s.otherIncome} onChange={(otherIncome) => set({ otherIncome })} unit="$" min={0} hint="interest, side income" />
            <Num label="Adjustments" value={s.adjustments} onChange={(adjustments) => set({ adjustments })} unit="$" min={0} hint="SEP/solo 401(k), SE health insurance, HSA" />
          </Row>
          <Row>
            <Num label="Itemized deductions" value={s.itemized} onChange={(itemized) => set({ itemized })} unit="$" min={0} hint={`0 = standard ${m(table.std[s.status])}`} />
            <Num label="Tax credits" value={s.credits} onChange={(credits) => set({ credits })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="Federal withholding (W-2)" value={s.withholding} onChange={(withholding) => set({ withholding })} unit="$" min={0} />
            <Num label="State income tax (flat)" value={s.state} onChange={(state) => set({ state })} unit="%" min={0} max={15} hint="for set-aside only" />
          </Row>
          <Check label="Apply 20% qualified business income (QBI) deduction" value={s.qbi} onChange={(qbi) => set({ qbi })} />
        </Panel>
        <Panel title="Safe harbor (last year)">
          <Row>
            <Num label="Last year's total tax" value={s.priorTax} onChange={(priorTax) => set({ priorTax })} unit="$" min={0} hint="Form 1040 line 24; 0 = unknown" />
            <Num label="Last year's AGI" value={s.priorAgi} onChange={(priorAgi) => set({ priorAgi })} unit="$" min={0} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>
            You avoid the underpayment penalty by paying, on time, the smaller of 90% of this year's tax or {r.priorPct > 1 ? '110' : '100'}% of last year's
            {r.priorPct > 1 ? ' (110% because last year\'s AGI was over $150,000)' : ''}. Withholding counts as paid evenly through the year.
          </p>
        </Panel>
        <Panel title={`${s.year} rates table`} actions={<Btn onClick={() => setEditing(!editing)}>{editing ? 'Close' : '✎ Edit JSON'}</Btn>}>
          {editing ? (
            <>
              <textarea className="k-area mono" rows={14} value={raw} onChange={(e) => set({ custom: { ...s.custom, [s.year]: e.target.value } })} spellCheck={false} />
              {parsed.err ? <Note tone="err">Invalid table, using built-in values: {parsed.err}</Note> : s.custom[s.year] ? <Note tone="ok">Using your edited table.</Note> : null}
              <Btn kind="ghost" onClick={() => { const c = { ...s.custom }; delete c[s.year]; set({ custom: c }) }}>Restore built-in {s.year}</Btn>
            </>
          ) : (
            <Table head={['Rate', 'Taxable income up to']} rows={table.rates.map((rate, i) => [pct(rate, 0), i < table.brackets[s.status].length ? m(table.brackets[s.status][i]) : 'and above'])} />
          )}
          <p className="muted" style={{ fontSize: 12.5 }}>Standard deduction {m(table.std[s.status])} · Social Security wage base {m(table.ssWageBase)} · Additional Medicare above {m(table.addlMedicare[s.status])}.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pay each quarter" value={r.noPaymentsNeeded ? '$0' : m(r.perQuarter)} sub={r.noPaymentsNeeded ? 'under $1,000 owed' : `${m(r.dueAfterWithholding)} / year`} tone="accent" />
          <Stat label="Total federal tax" value={m(r.total)} sub={`${pct(r.effective)} effective`} />
          <Stat label="Marginal rate" value={pct(r.marginal, 0)} sub={`+ ${pct(0.153 * 0.9235, 1)} SE on profit`} />
          <Stat label="Set aside from profit" value={pct(Math.max(0, setAside), 0)} sub={s.state ? 'incl. state' : 'federal only'} tone="good" />
        </Stats>
        {r.noPaymentsNeeded && <Note tone="ok">You expect to owe less than $1,000 after withholding, so no estimated payments are required.</Note>}
        <Panel title="Quarterly payments (Form 1040-ES)" actions={<CsvButton name={`estimated-tax-${s.year}.csv`} rows={() => [['Quarter', 'Due', 'Amount', 'Cumulative required', 'Paid', 'Behind'], ...rows.map((x) => [`Q${x.q + 1}`, x.d, x.amt.toFixed(2), x.cum.toFixed(2), x.paid, x.short.toFixed(2)])]} />}>
          <Table
            head={['', 'Due', 'Amount', 'Paid so far', 'Status']}
            rows={rows.map((x) => [
              <b key="q">Q{x.q + 1}</b>,
              <span key="d" style={{ color: x.past ? 'var(--muted)' : undefined }}>{x.d}</span>,
              m(x.amt),
              <input key="p" type="number" min={0} value={x.paid} onChange={(e) => { const p = [...s.paid]; p[x.q] = Math.max(0, Number(e.target.value) || 0); set({ paid: p }) }} style={{ width: 100 }} aria-label={`Paid Q${x.q + 1}`} />,
              x.short > 0.5 ? <span key="s" style={{ color: x.past ? 'var(--err)' : 'var(--muted)' }}>{x.past ? 'behind ' : 'to pay '}{m(x.short)}</span> : <span key="s" style={{ color: 'var(--ok)' }}>✓ covered</span>,
            ])}
            foot={['', 'Total', m(r.perQuarter * 4), m(s.paid.reduce((a, b) => a + b, 0)), '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Balance due when you file: about <b>{m(r.balanceAtFiling)}</b> (by April 15, {Number(s.year) + 1}). Pay via IRS Direct Pay or EFTPS. Dates move to the next weekday; holidays are not checked.
          </p>
        </Panel>
        <Panel title="How the tax is built">
          <Table
            head={['Step', 'Amount']}
            rows={[
              ['Self-employment earnings (92.35% of profit)', m(r.se.base)],
              ['Social Security 12.4% (up to wage base)', m(r.se.ss)],
              ['Medicare 2.9%', m(r.se.medicare)],
              ['Adjusted gross income (after ½ SE tax and adjustments)', m(r.agi)],
              [`${s.itemized > 0 ? 'Itemized' : 'Standard'} deduction`, `− ${m(r.deduction)}`],
              ['QBI deduction', `− ${m(r.qbiDed)}`],
              ['Taxable income', m(r.taxable)],
              ['Income tax (brackets)', m(r.incomeTax)],
              ['Credits', `− ${m(Math.min(s.credits, r.incomeTax))}`],
              ['Additional Medicare 0.9%', m(r.addlMedicare)],
              [<b key="t">Total federal tax</b>, <b key="v">{m(r.total)}</b>],
              ['90% of this year', m(r.safe90)],
              [`${Math.round(r.priorPct * 100)}% of last year`, Number.isFinite(r.safePrior) ? m(r.safePrior) : '—'],
              [<b key="r">Required annual payment (smaller)</b>, <b key="rv">{m(r.required)}</b>],
            ]}
          />
        </Panel>
        <Panel title="Where it goes">
          <Donut slices={[{ label: 'Income tax', value: Math.max(0, r.incomeTax - s.credits) }, { label: 'Self-employment tax', value: r.se.total }, { label: 'Additional Medicare', value: r.addlMedicare }, { label: 'State (est.)', value: stateTax }].filter((x) => x.value > 0)} fv={m} center={<span>{m(r.total + stateTax)}</span>} />
          <p className="muted" style={{ fontSize: 13 }}>Gross income {m(income)}.</p>
        </Panel>
      </div>
    </Split>
  )
}
