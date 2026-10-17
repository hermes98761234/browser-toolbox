// Depreciation schedules: straight-line, declining balance (with optional switch to SL), sum-of-the-years'-digits,
// units of production and US MACRS (GDS, half-year convention). Partial first years are handled by spreading each
// asset-year's charge across fiscal years in proportion to the months in service.

export type Method = 'sl' | 'db' | 'syd' | 'units' | 'macrs'

export interface Input {
  cost: number
  salvage: number
  life: number // years
  months: number // months in service in the first fiscal year (1–12)
  factor: number // declining-balance factor: 2 = double declining, 1.5 = 150%
  switchToSl: boolean
  units: number[] // units produced per year (units-of-production)
  totalUnits: number
  macrs: number // recovery period for MACRS
}

export interface Row {
  year: number
  dep: number
  accum: number
  book: number
}

export const MACRS: Record<number, number[]> = {
  3: [33.33, 44.45, 14.81, 7.41],
  5: [20, 32, 19.2, 11.52, 11.52, 5.76],
  7: [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
  10: [10, 18, 14.4, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28],
  15: [5, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95],
  20: [3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231],
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Charges per full asset-year (year 1 = first 12 months of service). */
export function assetYears(i: Input, m: Method): number[] {
  const base = Math.max(0, i.cost - i.salvage)
  const n = Math.max(1, Math.round(i.life))
  if (m === 'sl') return Array(n).fill(base / n)
  if (m === 'syd') {
    const sum = (n * (n + 1)) / 2
    return Array.from({ length: n }, (_, k) => (base * (n - k)) / sum)
  }
  if (m === 'db') {
    const rate = i.factor / n
    const out: number[] = []
    let book = i.cost
    for (let k = 0; k < n; k++) {
      let d = book * rate
      const sl = (book - i.salvage) / (n - k)
      if (i.switchToSl && sl > d) d = sl
      if (k === n - 1 && i.switchToSl) d = book - i.salvage
      d = Math.max(0, Math.min(d, book - i.salvage))
      out.push(d)
      book -= d
    }
    return out
  }
  return []
}

/** Fiscal-year schedule. */
export function schedule(i: Input, m: Method): Row[] {
  let deps: number[]
  if (m === 'macrs') deps = (MACRS[i.macrs] ?? MACRS[5]).map((p) => (i.cost * p) / 100)
  else if (m === 'units') {
    const per = i.totalUnits > 0 ? Math.max(0, i.cost - i.salvage) / i.totalUnits : 0
    let left = Math.max(0, i.cost - i.salvage)
    deps = i.units.map((u) => {
      const d = Math.min(left, Math.max(0, u) * per)
      left -= d
      return d
    })
  } else {
    const a = assetYears(i, m)
    const f = Math.min(12, Math.max(1, Math.round(i.months))) / 12
    if (f === 1) deps = a
    else {
      deps = []
      for (let k = 0; k <= a.length; k++) deps.push((k < a.length ? a[k] * f : 0) + (k > 0 ? a[k - 1] * (1 - f) : 0))
    }
  }
  while (deps.length > 1 && deps[deps.length - 1] < 0.005) deps.pop()
  let accum = 0
  return deps.map((d, k) => {
    accum += d
    return { year: k + 1, dep: r2(d), accum: r2(accum), book: r2(i.cost - accum) }
  })
}

export const METHOD_NAMES: Record<Method, string> = {
  sl: 'Straight-line',
  db: 'Declining balance',
  syd: "Sum-of-years' digits",
  units: 'Units of production',
  macrs: 'MACRS (US tax)',
}
