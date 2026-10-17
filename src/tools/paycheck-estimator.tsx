import { useState } from 'react'
import { Area, Btn, Check, CsvButton, Donut, money, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { checkTable, compute, FREQS, hourlyAnnual, TABLE_2026, type Status, type TaxTable } from './lib/paycheck-estimator'

// Approximate flat / near-flat state rates — verify the current year's rate for your state.
const STATES: [string, string, number, number][] = [
  ['none', 'No state income tax (TX, FL, WA, NV, TN, SD, WY, AK, NH)', 0, 0],
  ['IL', 'Illinois 4.95 %', 4.95, 2850],
  ['PA', 'Pennsylvania 3.07 %', 3.07, 0],
  ['MI', 'Michigan 4.25 %', 4.25, 5800],
  ['IN', 'Indiana ~3.0 %', 3.0, 1000],
  ['KY', 'Kentucky ~3.5 %', 3.5, 3360],
  ['NC', 'North Carolina ~3.99 %', 3.99, 12750],
  ['CO', 'Colorado ~4.4 %', 4.4, 0],
  ['UT', 'Utah ~4.5 %', 4.5, 0],
  ['AZ', 'Arizona 2.5 %', 2.5, 16100],
  ['MA', 'Massachusetts 5 %', 5.0, 4400],
  ['custom', 'Custom flat rate', 0, 0],
]
const DEF = {
  mode: 'salary' as 'salary' | 'hourly', salary: 75000, rate: 28, hours: 40, ot: 0, status: 'single' as Status, periods: 26,
  k401: 6, roth: 0, hsa: 1200, sec125: 1800, postTax: 0, children: 0, otherDeps: 0, extraDeduction: 0,
  state: 'IL', stateRate: 4.95, stateDeduction: 2850, localRate: 0, table: TABLE_2026, showSchedule: false,
}

export default function PaycheckEstimator() {
  const [s, set, reset] = useToolState('paycheck-estimator', DEF)
  const [json, setJson] = useState<string | null>(null)
  const [jsonErr, setJsonErr] = useState('')
  const gross = s.mode === 'salary' ? s.salary : hourlyAnnual(s.rate, s.hours, s.ot)
  const T = checkTable(s.table) ? TABLE_2026 : (s.table as TaxTable)
  const r = compute({ ...s, gross }, T)
  const P = s.periods
  const per = (x: number) => x / P
  const m = (x: number) => money(x)
  const freq = FREQS.find((f) => f[0] === P)?.[1] ?? `${P}×/yr`
  const ages401 = 24500 // 2026 employee deferral limit (under 50)
  const rows: [string, number, string?][] = [
    ['Gross pay', r.gross],
    ['Traditional 401(k)', -r.k401, 'pre-tax'],
    ['HSA (payroll)', -r.hsa, 'pre-tax'],
    ['Health / dental / FSA (Sec. 125)', -r.sec125, 'pre-tax'],
    ['Federal income tax', -r.federal],
    ['Social Security (6.2 %)', -r.ss],
    ['Medicare (1.45 %)', -(r.medicare + r.addlMedicare)],
    ['State income tax', -r.state],
    ['Local tax', -r.local],
    ['Roth 401(k)', -r.roth, 'after-tax'],
    ['Other after-tax deductions', -r.postTax, 'after-tax'],
  ]

  const pickState = (k: string) => {
    const st = STATES.find((x) => x[0] === k)!
    set(k === 'custom' ? { state: k } : { state: k, stateRate: st[2], stateDeduction: st[3] })
  }
  const applyJson = () => {
    try {
      const t = JSON.parse(json ?? '')
      const e = checkTable(t)
      if (e) return setJsonErr(e)
      set({ table: t })
      setJson(null)
      setJsonErr('')
    } catch (e) {
      setJsonErr((e as Error).message)
    }
  }

  return (
    <div>
      <Stats>
        <Stat label={`Take-home per paycheck (${freq.toLowerCase()})`} value={m(per(r.net))} sub={`${m(r.net)} per year`} tone="accent" />
        <Stat label="Total taxes" value={m(r.gross - r.net - r.k401 - r.hsa - r.sec125 - r.roth - r.postTax)} sub={`effective ${pct(r.effective)} of gross`} />
        <Stat label="Federal marginal rate" value={pct(r.marginal, 0)} sub={`taxable income ${m(r.federalTaxable)}`} />
        <Stat label="Saved pre-tax" value={m(r.k401 + r.hsa + r.sec125)} sub={`≈ ${m((r.k401 + r.hsa + r.sec125) * (r.marginal + s.stateRate / 100))} income tax avoided`} tone="good" />
      </Stats>
      <Note tone="warn">Estimate only — not tax advice. Actual withholding depends on your W-4, employer payroll software, benefits and state rules. Uses {T.year} federal brackets ({JSON.stringify(T) === JSON.stringify(TABLE_2026) ? 'built in' : 'your edited table'}).</Note>
      <Split>
        <div>
          <Panel title="Pay" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['salary', 'Annual salary'], ['hourly', 'Hourly']]} label="Pay type" />
            {s.mode === 'salary' ? (
              <Num label="Annual salary" value={s.salary} min={0} unit="$" onChange={(salary) => set({ salary })} />
            ) : (
              <Row>
                <Num label="Hourly rate" value={s.rate} min={0} unit="$/h" onChange={(rate) => set({ rate })} />
                <Num label="Hours / week" value={s.hours} min={0} max={80} onChange={(hours) => set({ hours })} />
                <Num label="Overtime h / week" value={s.ot} min={0} max={60} hint="paid 1.5×" onChange={(ot) => set({ ot })} />
              </Row>
            )}
            <Row>
              <Select label="Pay frequency" value={s.periods} onChange={(periods) => set({ periods })} options={FREQS} />
              <Select label="Filing status" value={s.status} onChange={(status) => set({ status })} options={[['single', 'Single'], ['mfj', 'Married filing jointly'], ['hoh', 'Head of household']]} />
            </Row>
            <Row>
              <Num label="Children under 17" value={s.children} min={0} max={15} step={1} onChange={(children) => set({ children: Math.round(children) })} />
              <Num label="Other dependents" value={s.otherDeps} min={0} max={15} step={1} onChange={(otherDeps) => set({ otherDeps: Math.round(otherDeps) })} />
            </Row>
            <Num label="Deductions above the standard deduction" value={s.extraDeduction} min={0} unit="$/yr" hint={`standard deduction ${m(T.standard[s.status])}`} onChange={(extraDeduction) => set({ extraDeduction })} />
          </Panel>
          <Panel title="Deductions from pay">
            <Row>
              <Num label="Traditional 401(k)" value={s.k401} min={0} max={100} unit="% of pay" onChange={(k401) => set({ k401 })} />
              <Num label="Roth 401(k)" value={s.roth} min={0} max={100} unit="% of pay" onChange={(roth) => set({ roth })} />
            </Row>
            {r.k401 + r.roth > ages401 && <Note tone="warn">401(k) contributions of {m(r.k401 + r.roth)} exceed the 2026 employee limit of {m(ages401)} (catch-up allowed from age 50).</Note>}
            <Row>
              <Num label="HSA via payroll" value={s.hsa} min={0} unit="$/yr" onChange={(hsa) => set({ hsa })} />
              <Num label="Health/dental/vision/FSA" value={s.sec125} min={0} unit="$/yr" onChange={(sec125) => set({ sec125 })} />
            </Row>
            <Num label="Other after-tax deductions" value={s.postTax} min={0} unit="$/yr" hint="union dues, garnishments, ESPP…" onChange={(postTax) => set({ postTax })} />
          </Panel>
          <Panel title="State & local">
            <Select label="State" value={s.state} onChange={pickState} options={STATES.map((x) => [x[0], x[1]] as [string, string])} />
            <Row>
              <Num label="Flat state rate" value={s.stateRate} min={0} max={15} step={0.01} unit="%" onChange={(stateRate) => set({ stateRate, state: 'custom' })} />
              <Num label="State exemption / deduction" value={s.stateDeduction} min={0} unit="$" onChange={(stateDeduction) => set({ stateDeduction })} />
            </Row>
            <Num label="Local / city income tax" value={s.localRate} min={0} max={10} step={0.01} unit="%" onChange={(localRate) => set({ localRate })} />
            <p className="muted" style={{ fontSize: 12 }}>States with graduated brackets (CA, NY, NJ…) are approximated by a single flat rate — use your effective state rate for a closer estimate.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Per-paycheck breakdown" actions={<CsvButton name="paycheck.csv" rows={() => [['Item', `Per paycheck (${freq})`, 'Per month', 'Per year'], ...rows.map(([n, v]) => [n, per(v).toFixed(2), (v / 12).toFixed(2), v.toFixed(2)]), ['Net pay', per(r.net).toFixed(2), (r.net / 12).toFixed(2), r.net.toFixed(2)]]} />}>
            <Table
              head={['', 'Per paycheck', 'Per month', 'Per year']}
              rows={rows.filter(([, v], i) => i === 0 || Math.abs(v) > 0.004).map(([n, v, tag]) => [
                <span key="n">{n} {tag && <span className="muted" style={{ fontSize: 11 }}>({tag})</span>}</span>,
                <span key="p" style={{ color: v < 0 ? 'var(--err)' : undefined }}>{m(per(v))}</span>,
                m(v / 12),
                m(v),
              ])}
              foot={['Net pay', m(per(r.net)), m(r.net / 12), m(r.net)]}
            />
            {r.credits > 0 && <p className="muted" style={{ fontSize: 12 }}>Includes {m(r.credits)} of child / dependent credits.</p>}
            {r.addlMedicare > 0 && <p className="muted" style={{ fontSize: 12 }}>Includes {m(r.addlMedicare)} Additional Medicare Tax (0.9 % above {m(T.addlThreshold[s.status])}).</p>}
          </Panel>
          <Panel title="Where your gross pay goes">
            <Donut
              slices={[
                { label: 'Take-home', value: r.net, color: '#10b981' },
                { label: 'Federal tax', value: r.federal, color: '#6366f1' },
                { label: 'FICA', value: r.ss + r.medicare + r.addlMedicare, color: '#0ea5e9' },
                { label: 'State & local', value: r.state + r.local, color: '#f59e0b' },
                { label: 'Retirement & HSA', value: r.k401 + r.roth + r.hsa, color: '#a855f7' },
                { label: 'Benefits & other', value: r.sec125 + r.postTax, color: '#64748b' },
              ]}
              fv={(v) => money(v, '$', 0)}
              center={<span>{m(per(r.net))}<br /><small>per check</small></span>}
            />
          </Panel>
          <Panel title="Paycheck schedule" actions={<Check label="Show all paychecks" value={s.showSchedule} onChange={(showSchedule) => set({ showSchedule })} />}>
            <Table
              head={['#', 'Gross', 'Federal', 'Soc. Sec.', 'Medicare', 'State+local', 'Net']}
              rows={r.schedule.map((p) => [p.n, m(p.gross), m(p.federal), m(p.ss), m(p.medicare), m(p.state + p.local), <b key="n">{m(p.net)}</b>])}
              max={s.showSchedule ? undefined : 4}
            />
            <p className="muted" style={{ fontSize: 12 }}>Social Security stops for the rest of the year once wages reach {m(T.ssWageBase)}; employers withhold the extra 0.9 % Medicare above $200,000 regardless of filing status.</p>
          </Panel>
          <Panel title={`Tax table (${T.year})`} actions={json === null ? <Btn onClick={() => { setJson(JSON.stringify(s.table, null, 1)); setJsonErr('') }}>Edit JSON</Btn> : <><Btn kind="primary" onClick={applyJson}>Apply</Btn><Btn kind="ghost" onClick={() => setJson(null)}>Cancel</Btn></>}>
            {json === null ? (
              <Table head={['Rate', 'Single from', 'Joint from', 'HoH from']} rows={T.brackets.single.map(([lo, rt], i) => [pct(rt, 0), m(lo), m(T.brackets.mfj[i]?.[0] ?? NaN), m(T.brackets.hoh[i]?.[0] ?? NaN)])} />
            ) : (
              <>
                <Area value={json} onChange={setJson} rows={14} mono />
                {jsonErr && <Note tone="err">{jsonErr}</Note>}
              </>
            )}
            <Row>
              <Btn kind="ghost" onClick={() => set({ table: TABLE_2026 })}>Restore 2026 defaults</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 12 }}>Brackets are [taxable-income threshold, rate]. Built-in: 2026 IRS brackets and standard deductions, Social Security wage base {m(TABLE_2026.ssWageBase)}, child tax credit {m(TABLE_2026.ctc)}.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
