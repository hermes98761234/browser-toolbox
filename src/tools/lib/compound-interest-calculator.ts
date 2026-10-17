// Compound growth with periodic contributions. Compounding (n/yr) and contribution frequency (m/yr) may differ:
// the rate per contribution period is the equivalent (1 + r/n)^(n/m) − 1 (continuous: e^(r/m) − 1).

export interface Inputs {
  principal: number
  rate: number // annual %, nominal
  years: number
  compound: number // periods per year, 0 = continuous
  contribution: number // per contribution period
  contribFreq: number // per year
  timing: 'end' | 'begin'
  growth: number // % increase of the contribution each year
}
export interface YearRow { year: number; balance: number; contributed: number; interest: number; yearInterest: number; yearContrib: number }

export function periodRate(rate: number, compound: number, perYear: number): number {
  const r = rate / 100
  return compound === 0 ? Math.exp(r / perYear) - 1 : (1 + r / compound) ** (compound / perYear) - 1
}

export function effectiveAnnual(rate: number, compound: number): number {
  return periodRate(rate, compound, 1)
}

export function simulate(i: Inputs): YearRow[] {
  const m = Math.max(1, i.contribFreq)
  const rp = periodRate(i.rate, i.compound, m)
  let bal = i.principal
  let contributed = i.principal
  const rows: YearRow[] = []
  const wholeYears = Math.ceil(i.years)
  for (let y = 1; y <= wholeYears; y++) {
    const c = i.contribution * (1 + i.growth / 100) ** (y - 1)
    const periods = y <= i.years ? m : Math.round((i.years - (y - 1)) * m)
    const start = bal
    let yc = 0
    for (let k = 0; k < periods; k++) {
      if (i.timing === 'begin') { bal += c; yc += c }
      bal *= 1 + rp
      if (i.timing === 'end') { bal += c; yc += c }
    }
    contributed += yc
    rows.push({ year: y, balance: bal, contributed, interest: bal - contributed, yearInterest: bal - start - yc, yearContrib: yc })
  }
  return rows
}

/** Closed form for level contributions (used to cross-check the simulation). */
export function futureValue(P: number, rate: number, years: number, compound: number, pmt: number, perYear: number, begin = false): number {
  const rp = periodRate(rate, compound, perYear)
  const N = years * perYear
  const g = (1 + rp) ** N
  const ann = rp === 0 ? pmt * N : (pmt * (g - 1)) / rp
  return P * g + ann * (begin ? 1 + rp : 1)
}

/** Years until the balance reaches `target` (simulated month by month), or Infinity. */
export function yearsToTarget(i: Inputs, target: number, maxYears = 100): number {
  const rows = simulate({ ...i, years: maxYears })
  const hit = rows.find((r) => r.balance >= target)
  if (!hit) return Infinity
  const prev = rows[hit.year - 2]?.balance ?? i.principal
  return hit.year - 1 + (target - prev) / (hit.balance - prev || 1)
}
