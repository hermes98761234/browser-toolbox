// Currency conversion on EUR-based rate tables (units of currency per 1 EUR), with manual overrides.

export type Rates = Record<string, number>

/** Bundled fallback table: approximate mid-2025 reference rates, units per 1 EUR. Deliberately labelled stale in the UI. */
export const BUNDLED_DATE = '2025-07-01'
export const BUNDLED: Rates = {
  EUR: 1, USD: 1.17, GBP: 0.86, JPY: 172, CHF: 0.935, CAD: 1.6, AUD: 1.79, NZD: 1.95, CNY: 8.4, HKD: 9.18, SGD: 1.5,
  KRW: 1620, INR: 101, IDR: 19000, THB: 37.9, PHP: 66.5, MYR: 4.95, SEK: 11.2, NOK: 11.8, DKK: 7.46, ISK: 143,
  PLN: 4.26, CZK: 24.6, HUF: 398, RON: 5.07, BGN: 1.9558, TRY: 47, ILS: 3.95, ZAR: 20.6, BRL: 6.4, MXN: 21.8, UAH: 48.5,
}

export const NAMES: Record<string, string> = {
  EUR: 'Euro', USD: 'US dollar', GBP: 'British pound', JPY: 'Japanese yen', CHF: 'Swiss franc', CAD: 'Canadian dollar', AUD: 'Australian dollar',
  NZD: 'New Zealand dollar', CNY: 'Chinese yuan', HKD: 'Hong Kong dollar', SGD: 'Singapore dollar', KRW: 'South Korean won', INR: 'Indian rupee',
  IDR: 'Indonesian rupiah', THB: 'Thai baht', PHP: 'Philippine peso', MYR: 'Malaysian ringgit', SEK: 'Swedish krona', NOK: 'Norwegian krone',
  DKK: 'Danish krone', ISK: 'Icelandic króna', PLN: 'Polish złoty', CZK: 'Czech koruna', HUF: 'Hungarian forint', RON: 'Romanian leu',
  BGN: 'Bulgarian lev', TRY: 'Turkish lira', ILS: 'Israeli shekel', ZAR: 'South African rand', BRL: 'Brazilian real', MXN: 'Mexican peso', UAH: 'Ukrainian hryvnia',
}

/** Typical decimal places for display. */
export const DECIMALS: Record<string, number> = { JPY: 0, KRW: 0, IDR: 0, HUF: 0, ISK: 0 }

/** Merges a fetched table over the bundled one, then manual overrides (all EUR-based). */
export function effective(fetched: Rates | null, overrides: Rates): Rates {
  const out: Rates = { ...BUNDLED, ...(fetched ?? {}), EUR: 1 }
  for (const [k, v] of Object.entries(overrides)) if (v > 0 && Number.isFinite(v)) out[k] = v
  return out
}

/** Converts via EUR: amount × (to per EUR) / (from per EUR). */
export function convert(amount: number, from: string, to: string, rates: Rates): number {
  const f = rates[from], t = rates[to]
  if (!(f > 0) || !(t > 0)) return NaN
  return (amount * t) / f
}

/** How many `to` per one `from`. */
export const cross = (from: string, to: string, rates: Rates) => convert(1, from, to, rates)

/** EUR-based override value from a user-entered "1 FROM = x CUR". */
export const overrideFromCross = (x: number, from: string, rates: Rates) => x * (rates[from] ?? NaN)

/** Validates a frankfurter.app /latest response and returns an EUR-based table. */
export function parseApi(j: unknown): { date: string; rates: Rates } | null {
  if (!j || typeof j !== 'object') return null
  const o = j as { base?: unknown; date?: unknown; rates?: unknown }
  if (typeof o.date !== 'string' || !o.rates || typeof o.rates !== 'object') return null
  const raw = o.rates as Record<string, unknown>
  const rates: Rates = {}
  for (const [k, v] of Object.entries(raw)) if (/^[A-Z]{3}$/.test(k) && typeof v === 'number' && v > 0) rates[k] = v
  const base = typeof o.base === 'string' ? o.base : 'EUR'
  if (base !== 'EUR') {
    // re-base so that EUR = 1
    const e = rates.EUR
    if (!(e > 0)) return null
    const reb: Rates = { [base]: 1 / e }
    for (const [k, v] of Object.entries(rates)) reb[k] = v / e
    reb.EUR = 1
    return { date: o.date, rates: reb }
  }
  rates.EUR = 1
  return Object.keys(rates).length > 1 ? { date: o.date, rates } : null
}

/** Whole days between two ISO dates (or timestamps). */
export function ageDays(from: string | number, now: number = Date.now()): number {
  const t = typeof from === 'number' ? from : Date.parse(from)
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : NaN
}

export function ageText(days: number): string {
  if (!Number.isFinite(days)) return 'unknown'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  if (days < 730) return `${Math.round(days / 30.4)} months ago`
  return `${(days / 365.25).toFixed(1)} years ago`
}

/** Evaluates simple amount expressions like "12.5*3 + 4" (digits, + − * / parentheses only). */
export function evalAmount(s: string): number {
  const t = s.replace(/,/g, '.').replace(/\s+/g, '')
  if (!t || !/^[\d.+\-*/()]+$/.test(t)) return NaN
  let i = 0
  const num = (): number => {
    if (t[i] === '(') { i++; const v = expr(); i++; return v }
    if (t[i] === '-') { i++; return -num() }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(t.slice(i))
    if (!m) return NaN
    i += m[0].length
    return Number(m[0])
  }
  const term = (): number => {
    let v = num()
    while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = num(); v = op === '*' ? v * r : v / r }
    return v
  }
  const expr = (): number => {
    let v = term()
    while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r }
    return v
  }
  const v = expr()
  return i === t.length ? v : NaN
}
