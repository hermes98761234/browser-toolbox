// Employer-side payroll estimate for one pay run: gross pay, deduction rules (pre-tax 401(k), Section 125,
// HSA, Roth, post-tax), employee withholding (federal via the Paycheck Estimator annualised tables,
// FICA with YTD wage-base caps, flat state) and employer costs (FICA match, FUTA, SUTA, match, benefits).
import { compute, type Status, type TaxTable } from './paycheck-estimator'

export type RuleKind = '401k' | 'roth' | 'sec125' | 'hsa' | 'posttax'
export interface Rule {
  id: string
  name: string
  kind: RuleKind
  /** Default amount: % of gross when `percent`, else $ per pay period. */
  percent: boolean
  amount: number
  /** Employer match: % of the employee contribution, up to `matchCap` % of gross. */
  match: number
  matchCap: number
  /** Employer contribution per period (e.g. employer share of health premium). */
  employer: number
}

export interface Employee {
  id: string
  name: string
  title: string
  pay: 'salary' | 'hourly'
  annual: number
  rate: number
  hours: number
  ot: number
  bonus: number
  status: Status
  children: number
  otherDeps: number
  extraWh: number
  stateRate: number
  stateAllowance: number
  /** ruleId → amount override (same unit as the rule); missing = not enrolled. */
  enroll: Record<string, number>
  ytdGross: number
  ytdFica: number
  ytdFuta: number
}

export interface Company {
  periods: number
  futaRate: number // % after the state credit (0.6 normal)
  futaBase: number
  sutaRate: number
  sutaBase: number
  otherEmployerRate: number // % of gross, e.g. workers' comp
}

export interface Line {
  id: string
  name: string
  gross: number
  regular: number
  overtime: number
  bonus: number
  pretax: number // 401k + sec125 + hsa
  roth: number
  posttax: number
  deductions: { name: string; amount: number; kind: RuleKind }[]
  federal: number
  ss: number
  medicare: number
  state: number
  net: number
  er: { ss: number; medicare: number; futa: number; suta: number; other: number; match: number; benefits: number }
  erTotal: number
  cost: number
  ficaWages: number
  futaWages: number
}

const r2 = (x: number) => Math.round(x * 100) / 100

export function grossPay(e: Employee, periods: number): { regular: number; overtime: number; bonus: number; gross: number } {
  const regular = e.pay === 'salary' ? e.annual / periods : e.rate * Math.max(0, e.hours)
  const overtime = e.pay === 'hourly' ? e.rate * 1.5 * Math.max(0, e.ot) : 0
  const bonus = Math.max(0, e.bonus)
  return { regular: r2(regular), overtime: r2(overtime), bonus: r2(bonus), gross: r2(regular + overtime + bonus) }
}

export function payLine(e: Employee, rules: Rule[], c: Company, T: TaxTable): Line {
  const P = Math.max(1, c.periods)
  const g = grossPay(e, P)
  const gross = g.gross
  const ded: Line['deductions'] = []
  let k401 = 0, roth = 0, sec125 = 0, hsa = 0, post = 0, match = 0, benefits = 0
  for (const rule of rules) {
    if (!(rule.id in e.enroll)) continue
    const amt = e.enroll[rule.id] ?? rule.amount
    const v = r2(Math.max(0, rule.percent ? (gross * amt) / 100 : amt))
    ded.push({ name: rule.name, amount: v, kind: rule.kind })
    if (rule.kind === '401k') k401 += v
    else if (rule.kind === 'roth') roth += v
    else if (rule.kind === 'sec125') sec125 += v
    else if (rule.kind === 'hsa') hsa += v
    else post += v
    if (rule.match > 0) match += Math.min((v * rule.match) / 100, (gross * rule.matchCap) / 100)
    benefits += Math.max(0, rule.employer)
  }
  // Income-tax withholding: annualise this period (percentage method style) using the paycheck estimator.
  const res = compute(
    { status: e.status, gross: gross * P, periods: P, k401: gross ? (k401 / gross) * 100 : 0, roth: 0, hsa: hsa * P, sec125: sec125 * P, postTax: 0, children: e.children, otherDeps: e.otherDeps, extraDeduction: 0, stateRate: e.stateRate, stateDeduction: e.stateAllowance, localRate: 0 },
    T,
  )
  const federal = r2(Math.max(0, res.federal / P + Math.max(0, e.extraWh)))
  const state = r2(res.state / P)
  const ficaWages = Math.max(0, gross - sec125 - hsa)
  const ssWages = Math.max(0, Math.min(ficaWages, T.ssWageBase - e.ytdFica))
  const ss = r2(ssWages * T.ssRate)
  const addlWages = Math.max(0, e.ytdFica + ficaWages - Math.max(200000, e.ytdFica))
  const medicare = r2(ficaWages * T.medicare + Math.min(ficaWages, addlWages) * T.addlMedicare)
  const futaWages = Math.max(0, Math.min(ficaWages, c.futaBase - e.ytdFuta))
  const sutaWages = Math.max(0, Math.min(ficaWages, c.sutaBase - e.ytdFuta))
  const er = {
    ss,
    medicare: r2(ficaWages * T.medicare),
    futa: r2((futaWages * c.futaRate) / 100),
    suta: r2((sutaWages * c.sutaRate) / 100),
    other: r2((gross * c.otherEmployerRate) / 100),
    match: r2(match),
    benefits: r2(benefits),
  }
  const erTotal = r2(er.ss + er.medicare + er.futa + er.suta + er.other + er.match + er.benefits)
  const pretax = r2(k401 + sec125 + hsa)
  const net = r2(gross - pretax - roth - post - federal - ss - medicare - state)
  return { id: e.id, name: e.name, ...g, pretax, roth: r2(roth), posttax: r2(post), deductions: ded, federal, ss, medicare, state, net, er, erTotal, cost: r2(gross + erTotal), ficaWages: r2(ficaWages), futaWages: r2(futaWages) }
}

export function totals(lines: Line[]) {
  const sum = (f: (l: Line) => number) => r2(lines.reduce((a, l) => a + f(l), 0))
  return {
    gross: sum((l) => l.gross),
    net: sum((l) => l.net),
    federal: sum((l) => l.federal),
    ss: sum((l) => l.ss),
    medicare: sum((l) => l.medicare),
    state: sum((l) => l.state),
    deductions: sum((l) => l.pretax + l.roth + l.posttax),
    erTaxes: sum((l) => l.er.ss + l.er.medicare + l.er.futa + l.er.suta + l.er.other),
    erBenefits: sum((l) => l.er.match + l.er.benefits),
    cost: sum((l) => l.cost),
    /** Federal deposit liability: income tax withheld + both halves of FICA. */
    deposit: sum((l) => l.federal + l.ss + l.medicare + l.er.ss + l.er.medicare),
  }
}

/** Updates the employees' YTD wage figures after a run is posted. */
export function post(emps: Employee[], lines: Line[]): Employee[] {
  return emps.map((e) => {
    const l = lines.find((x) => x.id === e.id)
    return l ? { ...e, ytdGross: r2(e.ytdGross + l.gross), ytdFica: r2(e.ytdFica + l.ficaWages), ytdFuta: r2(e.ytdFuta + l.ficaWages) } : e
  })
}

export function register(lines: Line[]): (string | number)[][] {
  return [
    ['Employee', 'Gross', 'Regular', 'Overtime', 'Bonus', 'Pre-tax deductions', 'Roth', 'Post-tax deductions', 'Federal WH', 'Social Security', 'Medicare', 'State WH', 'Net pay', 'ER Social Security', 'ER Medicare', 'FUTA', 'SUTA', 'ER other', 'ER match', 'ER benefits', 'Total employer cost'],
    ...lines.map((l) => [l.name, l.gross, l.regular, l.overtime, l.bonus, l.pretax, l.roth, l.posttax, l.federal, l.ss, l.medicare, l.state, l.net, l.er.ss, l.er.medicare, l.er.futa, l.er.suta, l.er.other, l.er.match, l.er.benefits, l.cost]),
  ]
}
