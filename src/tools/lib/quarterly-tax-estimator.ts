// US federal quarterly estimated tax for the self-employed: SE tax, income tax with QBI deduction,
// safe-harbor required payments and Form 1040-ES due dates. Year parameters are plain JSON so users can edit them.

export type Status = 'single' | 'mfj' | 'mfs' | 'hoh'

export interface YearTable {
  std: Record<Status, number>
  /** Bracket upper bounds per status for rates[0..n-2]; the last rate applies above. */
  brackets: Record<Status, number[]>
  rates: number[]
  ssWageBase: number
  addlMedicare: Record<Status, number>
}

export const YEARS: Record<string, YearTable> = {
  '2025': {
    std: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625 },
    rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    brackets: {
      single: [11925, 48475, 103350, 197300, 250525, 626350],
      mfj: [23850, 96950, 206700, 394600, 501050, 751600],
      mfs: [11925, 48475, 103350, 197300, 250525, 375800],
      hoh: [17000, 64850, 103350, 197300, 250500, 626350],
    },
    ssWageBase: 176100,
    addlMedicare: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
  },
  '2026': {
    std: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 },
    rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    brackets: {
      single: [12400, 50400, 105700, 201775, 256225, 640600],
      mfj: [24800, 100800, 211400, 403550, 512450, 768700],
      mfs: [12400, 50400, 105700, 201775, 256225, 384350],
      hoh: [17700, 67450, 105700, 201750, 256200, 640600],
    },
    ssWageBase: 184500,
    addlMedicare: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
  },
}

/** Validates an edited year table; returns an error message or ''. */
export function checkTable(t: unknown): string {
  const y = t as YearTable
  if (!y || typeof y !== 'object') return 'Not an object'
  if (!Array.isArray(y.rates) || !y.rates.every((r) => r >= 0 && r < 1)) return '"rates" must be fractions like 0.22'
  for (const s of ['single', 'mfj', 'mfs', 'hoh'] as Status[]) {
    const b = y.brackets?.[s]
    if (!Array.isArray(b) || b.length !== y.rates.length - 1) return `"brackets.${s}" needs ${y.rates.length - 1} thresholds`
    if (b.some((v, i) => !(v > (b[i - 1] ?? 0)))) return `"brackets.${s}" must be increasing`
    if (!(y.std?.[s] >= 0)) return `"std.${s}" missing`
    if (!(y.addlMedicare?.[s] > 0)) return `"addlMedicare.${s}" missing`
  }
  if (!(y.ssWageBase > 0)) return '"ssWageBase" missing'
  return ''
}

/** Progressive tax; also returns the marginal rate. */
export function bracketTax(taxable: number, bounds: number[], rates: number[]): { tax: number; marginal: number } {
  let tax = 0, lo = 0
  const x = Math.max(0, taxable)
  for (let i = 0; i < rates.length; i++) {
    const hi = i < bounds.length ? bounds[i] : Infinity
    if (x > lo) tax += (Math.min(x, hi) - lo) * rates[i]
    if (x <= hi) return { tax, marginal: rates[i] }
    lo = hi
  }
  return { tax, marginal: rates[rates.length - 1] }
}

/** Schedule SE: 92.35% of profit; 12.4% Social Security up to the wage base left after W-2 wages; 2.9% Medicare. */
export function seTax(profit: number, w2ssWages: number, y: YearTable): { base: number; ss: number; medicare: number; total: number } {
  const base = Math.max(0, profit) * 0.9235
  if (base < 400) return { base, ss: 0, medicare: 0, total: 0 }
  const ss = Math.min(base, Math.max(0, y.ssWageBase - w2ssWages)) * 0.124
  const medicare = base * 0.029
  return { base, ss, medicare, total: ss + medicare }
}

export interface Inputs {
  status: Status
  profit: number // Schedule C net profit (annual)
  wages: number // W-2 wages
  otherIncome: number // interest, dividends taxed as ordinary, etc.
  adjustments: number // SE health insurance, SEP/solo 401k, HSA…
  itemized: number // 0 = use standard deduction
  credits: number
  withholding: number // federal income tax withheld from W-2 this year
  priorTax: number // last year's total tax (line 24)
  priorAgi: number
  qbi: boolean
}

export interface Result {
  se: ReturnType<typeof seTax>
  halfSe: number
  agi: number
  deduction: number
  qbiDed: number
  taxable: number
  incomeTax: number
  marginal: number
  addlMedicare: number
  total: number
  effective: number
  safe90: number
  safePrior: number
  priorPct: number
  required: number
  dueAfterWithholding: number
  perQuarter: number
  noPaymentsNeeded: boolean
  balanceAtFiling: number
}

export function estimate(i: Inputs, y: YearTable): Result {
  const se = seTax(i.profit, i.wages, y)
  const halfSe = se.total / 2
  const agi = Math.max(0, i.wages + i.profit + i.otherIncome - halfSe - i.adjustments)
  const deduction = i.itemized > 0 ? i.itemized : y.std[i.status]
  const preQbi = Math.max(0, agi - deduction)
  // Simplified §199A: 20% of qualified business income, capped at 20% of taxable income before QBI.
  const qbiDed = i.qbi ? Math.max(0, Math.min(0.2 * Math.max(0, i.profit - halfSe - i.adjustments), 0.2 * preQbi)) : 0
  const taxable = Math.max(0, preQbi - qbiDed)
  const { tax: incomeTax, marginal } = bracketTax(taxable, y.brackets[i.status], y.rates)
  const medWages = i.wages + se.base
  const addlMedicare = Math.max(0, medWages - y.addlMedicare[i.status]) * 0.009
  const total = Math.max(0, incomeTax - i.credits) + se.total + addlMedicare
  const safe90 = 0.9 * total
  const priorPct = i.priorAgi > (i.status === 'mfs' ? 75000 : 150000) ? 1.1 : 1
  const safePrior = i.priorTax > 0 ? i.priorTax * priorPct : Infinity
  const required = Math.min(safe90, safePrior)
  const dueAfterWithholding = Math.max(0, required - i.withholding)
  const noPaymentsNeeded = total - i.withholding < 1000
  const perQuarter = noPaymentsNeeded ? 0 : dueAfterWithholding / 4
  return {
    se, halfSe, agi, deduction, qbiDed, taxable, incomeTax, marginal, addlMedicare, total,
    effective: total / Math.max(1, i.wages + i.profit + i.otherIncome),
    safe90, safePrior, priorPct, required, dueAfterWithholding, perQuarter, noPaymentsNeeded,
    balanceAtFiling: Math.max(0, total - i.withholding - perQuarter * 4),
  }
}

/** Form 1040-ES due dates, moved to the next weekday when they fall on a weekend. */
export function dueDates(year: number): string[] {
  return [[year, 4, 15], [year, 6, 15], [year, 9, 15], [year + 1, 1, 15]].map(([yy, m, d]) => {
    const dt = new Date(Date.UTC(yy, m - 1, d))
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() + 1)
    return dt.toISOString().slice(0, 10)
  })
}
