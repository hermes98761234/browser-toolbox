import { useMemo } from 'react'
import { Btn, Check, CsvButton, Donut, download, JsonButtons, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { TABLE_2026, type Status } from './lib/paycheck-estimator'
import { payLine, post, register, totals, type Company, type Employee, type Line, type Rule, type RuleKind } from './lib/payroll-calculator'

const FREQ: [number, string][] = [[52, 'Weekly'], [26, 'Bi-weekly'], [24, 'Semi-monthly'], [12, 'Monthly']]
const KINDS: [RuleKind, string][] = [['401k', 'Pre-tax 401(k)'], ['roth', 'Roth 401(k)'], ['sec125', 'Section 125 (health)'], ['hsa', 'HSA (payroll)'], ['posttax', 'Post-tax']]

const RULES: Rule[] = [
  { id: 'r401', name: '401(k)', kind: '401k', percent: true, amount: 5, match: 50, matchCap: 6, employer: 0 },
  { id: 'rhealth', name: 'Medical plan', kind: 'sec125', percent: false, amount: 95, match: 0, matchCap: 0, employer: 260 },
  { id: 'rdental', name: 'Dental', kind: 'sec125', percent: false, amount: 12, match: 0, matchCap: 0, employer: 8 },
  { id: 'rhsa', name: 'HSA', kind: 'hsa', percent: false, amount: 50, match: 0, matchCap: 0, employer: 25 },
  { id: 'rgym', name: 'Gym membership', kind: 'posttax', percent: false, amount: 20, match: 0, matchCap: 0, employer: 0 },
]
const emp = (p: Partial<Employee>): Employee => ({ id: uid(), name: '', title: '', pay: 'salary', annual: 50000, rate: 18, hours: 80, ot: 0, bonus: 0, status: 'single', children: 0, otherDeps: 0, extraWh: 0, stateRate: 4.5, stateAllowance: 3000, enroll: {}, ytdGross: 0, ytdFica: 0, ytdFuta: 0, ...p })
const ytd = (g: number, n = 20) => ({ ytdGross: g * n, ytdFica: g * n, ytdFuta: g * n })

const DEF = {
  company: 'Riverbend Bakery Co.',
  address: '120 Mill Street, Springfield',
  ein: '12-3456789',
  payDate: '2026-10-23',
  start: '2026-10-05',
  end: '2026-10-18',
  runNo: 21,
  c: { periods: 26, futaRate: 0.6, futaBase: 7000, sutaRate: 2.7, sutaBase: 9500, otherEmployerRate: 1.2 } as Company,
  rules: RULES,
  emps: [
    emp({ id: 'e1', name: 'Olivia Hart', title: 'Store manager', pay: 'salary', annual: 78000, status: 'mfj', children: 2, enroll: { r401: 6, rhealth: 180, rdental: 24 }, ...ytd(3000) }),
    emp({ id: 'e2', name: 'Mateo Silva', title: 'Head baker', pay: 'salary', annual: 52000, enroll: { r401: 4, rhealth: 95, rhsa: 50 }, ...ytd(2000) }),
    emp({ id: 'e3', name: 'Aisha Bello', title: 'Cashier', pay: 'hourly', rate: 18, hours: 80, ot: 6, status: 'hoh', children: 1, enroll: { rhealth: 95, rgym: 20 }, ...ytd(1600) }),
    emp({ id: 'e4', name: 'Leo Park', title: 'Weekend baker (part-time)', pay: 'hourly', rate: 16.5, hours: 42, enroll: {}, ...ytd(690) }),
  ] as Employee[],
  sel: 'e1',
  history: [] as { run: number; payDate: string; gross: number; net: number; cost: number }[],
}

const m = (x: number) => money(x)

async function payslips(s: typeof DEF, lines: Line[], only?: string) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const L = (t: string) => t.replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
  const ink = rgb(0.1, 0.12, 0.16), mute = rgb(0.45, 0.47, 0.52), band = rgb(0.94, 0.95, 0.98), accent = rgb(0.31, 0.27, 0.9)
  for (const l of lines.filter((x) => !only || x.id === only)) {
    const e = s.emps.find((x) => x.id === l.id)!
    const p = pdf.addPage([612, 792])
    const t = (x: number, y: number, str: string, size = 10, f = font, color = ink) => p.drawText(L(str), { x, y, size, font: f, color })
    const r = (x: number, y: number, str: string, size = 10, f = font) => t(x - f.widthOfTextAtSize(L(str), size), y, str, size, f)
    t(48, 740, s.company, 16, bold)
    t(48, 724, `${s.address} · EIN ${s.ein}`, 9, font, mute)
    r(564, 740, 'EARNINGS STATEMENT', 12, bold)
    r(564, 724, `Pay date ${s.payDate} · Period ${s.start} to ${s.end}`, 9)
    p.drawRectangle({ x: 48, y: 664, width: 516, height: 44, color: band })
    t(58, 690, e.name, 12, bold)
    t(58, 674, `${e.title} · ${e.pay === 'salary' ? `Salary ${m(e.annual)}/yr` : `Hourly ${m(e.rate)}`} · Filing ${e.status.toUpperCase()}`, 9, font, mute)
    r(554, 690, `Net pay ${m(l.net)}`, 13, bold)
    let y = 636
    const section = (title: string, rows: [string, number, number | null][]) => {
      t(48, y, title, 11, bold, accent)
      r(470, y, 'Current', 9, bold)
      r(564, y, 'Year to date', 9, bold)
      y -= 6
      p.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) })
      y -= 14
      for (const [label, cur, ytdv] of rows) {
        t(56, y, label)
        r(470, y, m(cur))
        if (ytdv !== null) r(564, y, m(ytdv))
        y -= 15
      }
      y -= 10
    }
    const yr = (cur: number, factor: number) => cur * factor
    const f = s.runNo > 0 ? s.runNo : 1
    section('Earnings', [
      [e.pay === 'hourly' ? `Regular (${e.hours} h @ ${m(e.rate)})` : 'Regular salary', l.regular, null],
      ...(l.overtime ? [[`Overtime (${e.ot} h @ ${m(e.rate * 1.5)})`, l.overtime, null] as [string, number, null]] : []),
      ...(l.bonus ? [['Bonus', l.bonus, null] as [string, number, null]] : []),
      ['Gross pay', l.gross, e.ytdGross + l.gross],
    ])
    section('Taxes withheld', [
      ['Federal income tax', l.federal, yr(l.federal, f)],
      ['Social Security (6.2%)', l.ss, yr(l.ss, f)],
      ['Medicare (1.45%)', l.medicare, yr(l.medicare, f)],
      ['State income tax', l.state, yr(l.state, f)],
    ])
    if (l.deductions.length) section('Deductions', l.deductions.map((d) => [`${d.name}${d.kind === 'posttax' || d.kind === 'roth' ? ' (after tax)' : ' (pre-tax)'}`, d.amount, yr(d.amount, f)] as [string, number, number]))
    p.drawRectangle({ x: 330, y: y - 8, width: 234, height: 30, color: rgb(0.93, 0.97, 0.94) })
    t(340, y + 2, 'NET PAY', 11, bold)
    r(554, y + 2, m(l.net), 14, bold)
    y -= 46
    t(48, y, 'Employer contributions (not deducted from your pay)', 10, bold, mute)
    y -= 15
    for (const [k, v] of [['Social Security match', l.er.ss], ['Medicare match', l.er.medicare], ['FUTA', l.er.futa], ['SUTA', l.er.suta], ['401(k) match', l.er.match], ['Benefits', l.er.benefits]] as [string, number][]) {
      if (!v) continue
      t(56, y, k, 9, font, mute)
      r(470, y, m(v), 9)
      y -= 13
    }
    t(48, 60, 'Estimate prepared with Browser Toolbox Payroll Calculator. YTD tax figures are estimated from this run; verify against your payroll records.', 7.5, font, mute)
  }
  const bytes = await pdf.save()
  download(only ? `payslip-${lines.find((x) => x.id === only)?.name.replace(/\W+/g, '-').toLowerCase()}.pdf` : `payslips-run-${s.runNo}.pdf`, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
}

export default function PayrollCalculator() {
  const [s, set, reset] = useToolState('payroll-calculator', DEF)
  const lines = useMemo(() => s.emps.map((e) => payLine(e, s.rules, s.c, TABLE_2026)), [s.emps, s.rules, s.c])
  const T = totals(lines)
  const cur = s.emps.find((e) => e.id === s.sel) ?? s.emps[0]
  const editE = (p: Partial<Employee>) => cur && set({ emps: s.emps.map((e) => (e.id === cur.id ? { ...e, ...p } : e)) })
  const editR = (id: string, p: Partial<Rule>) => set({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const editC = (p: Partial<Company>) => set({ c: { ...s.c, ...p } })
  const curLine = lines.find((l) => l.id === cur?.id)

  return (
    <Split wide="right">
      <div>
        <Panel title="Pay run" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Company" value={s.company} onChange={(company) => set({ company })} />
          <Row>
            <Txt label="Address" value={s.address} onChange={(address) => set({ address })} />
            <Txt label="EIN" value={s.ein} onChange={(ein) => set({ ein })} />
          </Row>
          <Row>
            <Select label="Pay frequency" value={s.c.periods} onChange={(periods) => editC({ periods })} options={FREQ} />
            <Num label="Run no." value={s.runNo} onChange={(runNo) => set({ runNo })} min={1} />
          </Row>
          <Row>
            <Txt label="Period start" type="date" value={s.start} onChange={(start) => set({ start })} />
            <Txt label="Period end" type="date" value={s.end} onChange={(end) => set({ end })} />
            <Txt label="Pay date" type="date" value={s.payDate} onChange={(payDate) => set({ payDate })} />
          </Row>
        </Panel>
        <Panel title="Employer tax rates">
          <Row>
            <Num label="FUTA rate" value={s.c.futaRate} onChange={(futaRate) => editC({ futaRate })} unit="%" min={0} max={6} />
            <Num label="FUTA wage base" value={s.c.futaBase} onChange={(futaBase) => editC({ futaBase })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="SUTA rate" value={s.c.sutaRate} onChange={(sutaRate) => editC({ sutaRate })} unit="%" min={0} max={15} />
            <Num label="SUTA wage base" value={s.c.sutaBase} onChange={(sutaBase) => editC({ sutaBase })} unit="$" min={0} />
          </Row>
          <Num label="Other employer cost (workers’ comp etc.)" value={s.c.otherEmployerRate} onChange={(otherEmployerRate) => editC({ otherEmployerRate })} unit="% of gross" min={0} />
          <p className="muted" style={{ fontSize: 12 }}>FICA uses {TABLE_2026.year} figures from the Paycheck Estimator: Social Security {+(TABLE_2026.ssRate * 100).toFixed(2)}% to {m(TABLE_2026.ssWageBase)}, Medicare {+(TABLE_2026.medicare * 100).toFixed(2)}% (+0.9% employee withholding over $200k). FUTA 0.6% assumes the full state credit.</p>
        </Panel>
        <Panel title="Deduction rules" actions={<Btn onClick={() => set({ rules: [...s.rules, { id: uid(), name: 'New deduction', kind: 'posttax', percent: false, amount: 10, match: 0, matchCap: 0, employer: 0 }] })}>+ Rule</Btn>}>
          {s.rules.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <Row wrap={false}>
                <input value={r.name} onChange={(e) => editR(r.id, { name: e.target.value })} aria-label="Rule name" style={{ flex: 1, minWidth: 0, fontWeight: 600 }} />
                <select value={r.kind} onChange={(e) => editR(r.id, { kind: e.target.value as RuleKind })} aria-label="Tax treatment">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <Btn kind="ghost" onClick={() => set({ rules: s.rules.filter((x) => x.id !== r.id), emps: s.emps.map((e) => { const en = { ...e.enroll }; delete en[r.id]; return { ...e, enroll: en } }) })}>✕</Btn>
              </Row>
              <Row>
                <label className="k-check"><input type="checkbox" checked={r.percent} onChange={(e) => editR(r.id, { percent: e.target.checked })} /> % of gross</label>
                <label>Default <input type="number" min={0} value={r.amount} onChange={(e) => editR(r.id, { amount: Number(e.target.value) || 0 })} style={{ width: 70 }} />{r.percent ? '%' : '$'}</label>
                {(r.kind === '401k' || r.kind === 'roth') && <label>Match <input type="number" min={0} value={r.match} onChange={(e) => editR(r.id, { match: Number(e.target.value) || 0 })} style={{ width: 56 }} />% up to <input type="number" min={0} value={r.matchCap} onChange={(e) => editR(r.id, { matchCap: Number(e.target.value) || 0 })} style={{ width: 50 }} />%</label>}
                <label>Employer $ <input type="number" min={0} value={r.employer} onChange={(e) => editR(r.id, { employer: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>
              </Row>
            </div>
          ))}
        </Panel>
        {cur && (
          <Panel title="Employee" actions={<Btn onClick={() => { const e = emp({ name: 'New employee', title: '' }); set({ emps: [...s.emps, e], sel: e.id }) }}>+ Employee</Btn>}>
            <Select label="Edit" value={cur.id} onChange={(sel) => set({ sel })} options={s.emps.map((e) => [e.id, e.name || '(unnamed)'] as [string, string])} />
            <Row>
              <Txt label="Name" value={cur.name} onChange={(name) => editE({ name })} />
              <Txt label="Title" value={cur.title} onChange={(title) => editE({ title })} />
            </Row>
            <Row>
              <Select label="Pay type" value={cur.pay} onChange={(pay) => editE({ pay })} options={[['salary', 'Salary'], ['hourly', 'Hourly']]} />
              {cur.pay === 'salary' ? <Num label="Annual salary" value={cur.annual} onChange={(annual) => editE({ annual })} unit="$" min={0} /> : <Num label="Hourly rate" value={cur.rate} onChange={(rate) => editE({ rate })} unit="$" min={0} />}
            </Row>
            <Row>
              {cur.pay === 'hourly' && <Num label="Hours" value={cur.hours} onChange={(hours) => editE({ hours })} min={0} />}
              {cur.pay === 'hourly' && <Num label="Overtime h (1.5×)" value={cur.ot} onChange={(ot) => editE({ ot })} min={0} />}
              <Num label="Bonus" value={cur.bonus} onChange={(bonus) => editE({ bonus })} unit="$" min={0} />
            </Row>
            <Row>
              <Select label="W-4 filing status" value={cur.status} onChange={(status: Status) => editE({ status })} options={[['single', 'Single'], ['mfj', 'Married jointly'], ['hoh', 'Head of household']]} />
              <Num label="Children <17" value={cur.children} onChange={(children) => editE({ children })} min={0} />
              <Num label="Extra WH / period" value={cur.extraWh} onChange={(extraWh) => editE({ extraWh })} unit="$" min={0} />
            </Row>
            <Row>
              <Num label="State tax rate" value={cur.stateRate} onChange={(stateRate) => editE({ stateRate })} unit="%" min={0} max={15} />
              <Num label="State allowance / yr" value={cur.stateAllowance} onChange={(stateAllowance) => editE({ stateAllowance })} unit="$" min={0} />
            </Row>
            <div className="k-label">Enrolled deductions</div>
            {s.rules.map((r) => {
              const on = r.id in cur.enroll
              return (
                <Row key={r.id} wrap={false}>
                  <Check label={r.name} value={on} onChange={(v) => { const en = { ...cur.enroll }; if (v) en[r.id] = r.amount; else delete en[r.id]; editE({ enroll: en }) }} />
                  {on && <input type="number" min={0} value={cur.enroll[r.id]} onChange={(e) => editE({ enroll: { ...cur.enroll, [r.id]: Number(e.target.value) || 0 } })} style={{ width: 80 }} aria-label={`${r.name} amount`} />}
                  {on && <span className="muted">{r.percent ? '% of gross' : '$ / period'}</span>}
                </Row>
              )
            })}
            <Row>
              <Num label="YTD gross before run" value={cur.ytdGross} onChange={(ytdGross) => editE({ ytdGross })} unit="$" min={0} />
              <Num label="YTD FICA wages" value={cur.ytdFica} onChange={(ytdFica) => editE({ ytdFica, ytdFuta: ytdFica })} unit="$" min={0} />
            </Row>
            {curLine && <Note>This run: gross {m(curLine.gross)} → net <b>{m(curLine.net)}</b> · employer cost {m(curLine.cost)}</Note>}
            {s.emps.length > 1 && <Btn kind="danger" onClick={() => set({ emps: s.emps.filter((e) => e.id !== cur.id), sel: s.emps.find((e) => e.id !== cur.id)!.id })}>Remove employee</Btn>}
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Gross payroll" value={m(T.gross)} sub={`${s.emps.length} employees`} />
          <Stat label="Net pay to employees" value={m(T.net)} tone="good" />
          <Stat label="Employer taxes" value={m(T.erTaxes)} sub={`+ ${m(T.erBenefits)} match & benefits`} />
          <Stat label="Total cost of run" value={m(T.cost)} tone="accent" sub={`${((T.cost / (T.gross || 1) - 1) * 100).toFixed(1)}% on top of gross`} />
        </Stats>
        <Panel
          title={`Pay register — run ${s.runNo} (${s.start} → ${s.end})`}
          actions={
            <>
              <Btn kind="primary" onClick={() => void payslips(s, lines)}>⬇ Payslips PDF</Btn>
              <CsvButton name={`pay-register-run-${s.runNo}.csv`} rows={() => [...register(lines), ['TOTAL', T.gross, '', '', '', '', '', '', T.federal, T.ss, T.medicare, T.state, T.net, '', '', '', '', '', '', '', T.cost]]} />
            </>
          }
        >
          <Table
            head={['Employee', 'Gross', 'Deductions', 'Fed WH', 'SS + Med', 'State', 'Net', 'ER taxes', 'Cost', '']}
            rows={lines.map((l) => [
              <a key="n" href="#" onClick={(e) => { e.preventDefault(); set({ sel: l.id }) }}>{l.name}</a>,
              m(l.gross),
              m(l.pretax + l.roth + l.posttax),
              m(l.federal),
              m(l.ss + l.medicare),
              m(l.state),
              <b key="net">{m(l.net)}</b>,
              m(l.er.ss + l.er.medicare + l.er.futa + l.er.suta + l.er.other),
              m(l.cost),
              <Btn key="p" kind="ghost" onClick={() => void payslips(s, lines, l.id)} title="Payslip PDF">📄</Btn>,
            ])}
            foot={['Total', m(T.gross), m(T.deductions), m(T.federal), m(T.ss + T.medicare), m(T.state), m(T.net), m(T.erTaxes), m(T.cost), '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>Federal deposit for this run (income tax withheld + employee and employer FICA): <b>{m(T.deposit)}</b>. FUTA and SUTA are usually paid quarterly.</p>
        </Panel>
        <Panel title="Where the money goes">
          <Donut fv={m} slices={[
            { label: 'Net pay', value: T.net, color: '#10b981' },
            { label: 'Employee taxes', value: T.federal + T.ss + T.medicare + T.state, color: '#f59e0b' },
            { label: 'Employee deductions', value: T.deductions, color: '#0ea5e9' },
            { label: 'Employer taxes', value: T.erTaxes, color: '#ef4444' },
            { label: 'Employer match & benefits', value: T.erBenefits, color: '#a855f7' },
          ]} center={<span>{m(T.cost)}</span>} />
        </Panel>
        <Panel
          title="Post run & history"
          actions={<JsonButtons name="payroll.json" data={s} onLoad={(d) => set(d)} />}
        >
          <Row>
            <Btn kind="primary" onClick={() => set({ emps: post(s.emps, lines).map((e) => ({ ...e, bonus: 0 })), history: [...s.history, { run: s.runNo, payDate: s.payDate, gross: T.gross, net: T.net, cost: T.cost }], runNo: s.runNo + 1 })}>✓ Post run {s.runNo} (update YTD)</Btn>
            <span className="muted" style={{ fontSize: 13 }}>Adds this run to each employee’s YTD so wage-base caps apply next time; bonuses reset.</span>
          </Row>
          {s.history.length > 0 && <Table head={['Run', 'Pay date', 'Gross', 'Net', 'Cost']} rows={s.history.map((h) => [h.run, h.payDate, m(h.gross), m(h.net), m(h.cost)])} />}
        </Panel>
        <Note tone="warn">Estimate only. Withholding uses the annualised percentage method with {TABLE_2026.year} brackets and a flat state rate; it does not replace IRS Publication 15-T, state tables, local taxes, garnishment rules or a payroll provider. Check every figure before paying anyone.</Note>
      </div>
    </Split>
  )
}

