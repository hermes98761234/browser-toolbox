// US take-home pay estimate: federal income tax (editable brackets), FICA with wage base / additional Medicare,
// pre-tax deductions (401k, HSA, Section 125), simple credits, flat state + local rates, per-paycheck schedule.

export type Status = 'single' | 'mfj' | 'hoh'
export interface TaxTable { year: number; standard: Record<Status, number>; brackets: Record<Status, [number, number][]>; ssRate: number; ssWageBase: number; medicare: number; addlMedicare: number; addlThreshold: Record<Status, number>; ctc: number; otherDep: number; ctcPhaseout: Record<Status, number> }

/** 2026 figures (IRS Rev. Proc. 2025-32, SSA 2026 wage base). Brackets: [lower bound of taxable income, rate]. */
export const TABLE_2026: TaxTable = {
  year: 2026,
  standard: { single: 16100, mfj: 32200, hoh: 24150 },
  brackets: {
    single: [[0, 0.1], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
    mfj: [[0, 0.1], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]],
    hoh: [[0, 0.1], [17700, 0.12], [67450, 0.22], [105700, 0.24], [201750, 0.32], [256200, 0.35], [640600, 0.37]],
  },
  ssRate: 0.062,
  ssWageBase: 184500,
  medicare: 0.0145,
  addlMedicare: 0.009,
  addlThreshold: { single: 200000, mfj: 250000, hoh: 200000 },
  ctc: 2200,
  otherDep: 500,
  ctcPhaseout: { single: 200000, mfj: 400000, hoh: 200000 },
}

/** Progressive tax on `taxable` with [lowerBound, rate] brackets (sorted). */
export function bracketTax(taxable: number, br: [number, number][]): { tax: number; marginal: number } {
  let tax = 0, marginal = br[0]?.[1] ?? 0
  for (let i = 0; i < br.length; i++) {
    const [lo, r] = br[i]
    const hi = i + 1 < br.length ? br[i + 1][0] : Infinity
    if (taxable <= lo) break
    tax += (Math.min(taxable, hi) - lo) * r
    marginal = r
  }
  return { tax, marginal }
}

/** Validates a user-edited table; returns an error string or null. */
export function checkTable(t: unknown): string | null {
  const x = t as TaxTable
  if (!x || typeof x !== 'object') return 'Not an object.'
  for (const st of ['single', 'mfj', 'hoh'] as Status[]) {
    if (!(x.standard?.[st] >= 0)) return `standard.${st} must be a number ≥ 0.`
    const b = x.brackets?.[st]
    if (!Array.isArray(b) || !b.length) return `brackets.${st} must be a non-empty list.`
    for (let i = 0; i < b.length; i++) {
      if (!Array.isArray(b[i]) || b[i].length !== 2 || !(b[i][1] >= 0 && b[i][1] < 1)) return `brackets.${st}[${i}] must be [threshold, rate 0–1].`
      if (i && !(b[i][0] > b[i - 1][0])) return `brackets.${st} thresholds must increase.`
    }
  }
  if (!(x.ssWageBase > 0) || !(x.ssRate >= 0) || !(x.medicare >= 0)) return 'FICA values are missing.'
  return null
}

export interface Inputs {
  status: Status
  gross: number // annual gross wages
  periods: number
  k401: number // % of gross, traditional (pre-tax income tax only)
  roth: number // % of gross, after tax
  hsa: number // annual, via payroll (pre-tax incl. FICA)
  sec125: number // annual health/dental/vision/FSA premiums (pre-tax incl. FICA)
  postTax: number // annual other after-tax deductions
  children: number
  otherDeps: number
  extraDeduction: number // itemized above standard, or other adjustments
  stateRate: number // %
  stateDeduction: number
  localRate: number // %
}

export interface Result {
  gross: number; k401: number; hsa: number; sec125: number; roth: number; postTax: number
  federalTaxable: number; federal: number; marginal: number; credits: number
  ss: number; medicare: number; addlMedicare: number; state: number; local: number; net: number
  effective: number; schedule: { n: number; gross: number; federal: number; ss: number; medicare: number; state: number; local: number; deductions: number; net: number }[]
}

export function compute(inp: Inputs, T: TaxTable): Result {
  const gross = Math.max(0, inp.gross)
  const k401 = (gross * Math.max(0, inp.k401)) / 100
  const roth = (gross * Math.max(0, inp.roth)) / 100
  const hsa = Math.max(0, inp.hsa), sec125 = Math.max(0, inp.sec125)
  const ficaWages = Math.max(0, gross - hsa - sec125)
  const incomeWages = Math.max(0, ficaWages - k401)
  const ded = T.standard[inp.status] + Math.max(0, inp.extraDeduction)
  const federalTaxable = Math.max(0, incomeWages - ded)
  const { tax, marginal } = bracketTax(federalTaxable, T.brackets[inp.status])
  // child / other-dependent credit, phased out by $50 per $1,000 (or part) over the threshold; non-refundable here
  const rawCredit = inp.children * T.ctc + inp.otherDeps * T.otherDep
  const over = Math.max(0, incomeWages - T.ctcPhaseout[inp.status])
  const credits = Math.min(tax, Math.max(0, rawCredit - Math.ceil(over / 1000) * 50))
  const federal = tax - credits
  const ss = Math.min(ficaWages, T.ssWageBase) * T.ssRate
  const medicare = ficaWages * T.medicare
  const addlMedicare = Math.max(0, ficaWages - T.addlThreshold[inp.status]) * T.addlMedicare
  const state = Math.max(0, incomeWages - Math.max(0, inp.stateDeduction)) * Math.max(0, inp.stateRate) / 100
  const local = incomeWages * Math.max(0, inp.localRate) / 100
  const postTax = Math.max(0, inp.postTax)
  const net = gross - k401 - hsa - sec125 - roth - postTax - federal - ss - medicare - addlMedicare - state - local
  // Paycheck schedule: income tax spread evenly; Social Security stops once the wage base is reached.
  const P = Math.max(1, Math.round(inp.periods))
  const pg = gross / P, pf = ficaWages / P
  const schedule: Result['schedule'] = []
  let cum = 0
  for (let n = 1; n <= P; n++) {
    const ssWages = Math.max(0, Math.min(pf, T.ssWageBase - cum))
    cum += pf
    const addl = Math.max(0, Math.min(pf, cum - 200000)) * T.addlMedicare // employers withhold above $200k regardless of status
    const p = { ss: ssWages * T.ssRate, medicare: pf * T.medicare + addl }
    const deductions = (k401 + hsa + sec125 + roth + postTax) / P
    const row = { n, gross: pg, federal: federal / P, ss: p.ss, medicare: p.medicare, state: state / P, local: local / P, deductions, net: 0 }
    row.net = pg - row.federal - row.ss - row.medicare - row.state - row.local - deductions
    schedule.push(row)
  }
  return { gross, k401, hsa, sec125, roth, postTax, federalTaxable, federal, marginal, credits, ss, medicare, addlMedicare, state, local, net, effective: gross ? (federal + ss + medicare + addlMedicare + state + local) / gross : 0, schedule }
}

export const FREQS: [number, string][] = [[52, 'Weekly'], [26, 'Every 2 weeks'], [24, 'Twice a month'], [12, 'Monthly'], [4, 'Quarterly'], [1, 'Annually']]

/** Annual gross from hourly pay with 1.5× overtime. */
export const hourlyAnnual = (rate: number, hours: number, ot: number, weeks = 52) => (rate * hours + rate * 1.5 * ot) * weeks
