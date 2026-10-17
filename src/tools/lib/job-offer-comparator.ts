// Total-compensation maths for the Job Offer Comparator. All money values are per year unless named otherwise.

export interface Offer {
  id: string
  name: string
  base: number
  bonusPct: number // target annual bonus, % of base
  signing: number // one-time
  equity: number // expected vesting value per year
  matchPct: number // employer retirement match, % of base
  benefits: number // other employer-paid perks per year (stipends, HSA, wellness…)
  premium: number // employee health premium per month (a cost)
  ptoDays: number
  hoursWeek: number
  officeDays: number // commute days per week
  commuteMin: number // one way, minutes
  commuteCost: number // per office day (fuel, parking, transit)
  taxPct: number // effective income-tax rate on cash and equity
  col: number // cost-of-living index, 100 = your baseline city
}

export interface Breakdown {
  base: number
  bonus: number
  signing: number // amortised over the horizon
  equity: number
  match: number
  benefits: number
  totalComp: number
  costs: number // premiums + commuting
  afterTax: number
  colAdjusted: number
  commuteHours: number
  workHours: number
  hourly: number // after-tax, cost-adjusted value per hour of work + commute
  ptoValue: number
}

export const WORK_WEEKS = 52

export function compute(o: Offer, years = 1, holidays = 10): Breakdown {
  const y = Math.max(1, years)
  const bonus = (o.base * o.bonusPct) / 100
  const signing = o.signing / y
  const match = (o.base * o.matchPct) / 100
  const totalComp = o.base + bonus + signing + o.equity + match + o.benefits
  const weeksOff = (o.ptoDays + holidays) / 5
  const workWeeks = Math.max(0, WORK_WEEKS - weeksOff)
  const officeDays = Math.min(o.officeDays, 7) * workWeeks
  const commuteHours = (officeDays * 2 * o.commuteMin) / 60
  const costs = o.premium * 12 + officeDays * o.commuteCost
  const taxed = o.base + bonus + signing + o.equity
  const afterTax = taxed * (1 - o.taxPct / 100) + match + o.benefits - costs
  const colAdjusted = o.col > 0 ? (afterTax * 100) / o.col : afterTax
  const workHours = o.hoursWeek * workWeeks
  const hours = workHours + commuteHours
  return {
    base: o.base, bonus, signing, equity: o.equity, match, benefits: o.benefits, totalComp, costs, afterTax, colAdjusted,
    commuteHours, workHours, hourly: hours > 0 ? colAdjusted / hours : 0, ptoValue: (o.base / 260) * o.ptoDays,
  }
}

/** Value over a horizon with annual raises applied to base, bonus, match (equity and perks flat). */
export function horizonValue(o: Offer, years: number, raisePct: number, holidays = 10): number {
  let sum = 0
  for (let k = 0; k < years; k++) {
    const g = (1 + raisePct / 100) ** k
    sum += compute({ ...o, base: o.base * g, signing: k === 0 ? o.signing : 0 }, 1, holidays).colAdjusted
  }
  return sum
}
