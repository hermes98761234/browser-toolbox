// Cost / markup / margin / price conversions, tax handling, psychological price endings and batch CSV.

/** Markup (on cost) → margin (on price). Fractions: 0.5 = 50 %. */
export const markupToMargin = (m: number) => (m <= -1 ? NaN : m / (1 + m))
/** Margin → markup. A margin of 100 % or more is impossible with a positive cost. */
export const marginToMarkup = (g: number) => (g >= 1 ? NaN : g / (1 - g))

export type Driver = 'markup' | 'margin' | 'price'

/** Net (pre-tax) price from cost and one driver value. */
export function netPrice(cost: number, driver: Driver, value: number): number {
  if (driver === 'price') return value
  if (driver === 'markup') return cost * (1 + value)
  return value >= 1 ? NaN : cost / (1 - value)
}

export interface Breakdown { cost: number; net: number; gross: number; tax: number; profit: number; markup: number; margin: number }

export function breakdown(cost: number, net: number, taxRate: number): Breakdown {
  const profit = net - cost
  return {
    cost, net, gross: net * (1 + taxRate), tax: net * taxRate, profit,
    markup: cost > 0 ? profit / cost : NaN,
    margin: net !== 0 ? profit / net : NaN,
  }
}

export type Ending = 'none' | '.99' | '.95' | '.90' | '.49' | '.00' | '9' | '0.05'
export const ENDINGS: [Ending, string][] = [
  ['none', 'No rounding'], ['.99', 'x.99'], ['.95', 'x.95'], ['.90', 'x.90'], ['.49', 'x.49 / x.99'], ['.00', 'Whole x.00'], ['9', 'Ends in 9 (19, 29…)'], ['0.05', 'Nearest 0.05'],
]
export type Dir = 'up' | 'nearest' | 'down'

/** Candidate prices with the given ending around p. */
function candidates(p: number, e: Ending): number[] {
  const f = Math.floor(p)
  const r2 = (x: number) => Math.round(x * 100) / 100
  switch (e) {
    case '.99': case '.95': case '.90': {
      const c = Number(e)
      return [f - 1 + c, f + c, f + 1 + c].map(r2)
    }
    case '.49':
      return [f - 1 + 0.99, f + 0.49, f + 0.99, f + 1.49].map(r2)
    case '.00':
      return [f, f + 1]
    case '9': {
      const t = Math.floor(p / 10) * 10
      return [t - 1, t + 9, t + 19]
    }
    case '0.05':
      return [Math.floor(p * 20) / 20, Math.ceil(p * 20) / 20].map(r2)
    default:
      return [p]
  }
}

/** Rounds p to a price ending. 'up' never lowers the price, 'down' never raises it. */
export function roundEnding(p: number, e: Ending, dir: Dir): number {
  if (e === 'none' || !Number.isFinite(p)) return p
  const c = candidates(p, e).filter((x) => x > 0)
  const eps = 1e-9
  if (dir === 'up') return Math.min(...c.filter((x) => x >= p - eps))
  if (dir === 'down') {
    const d = c.filter((x) => x <= p + eps)
    return d.length ? Math.max(...d) : Math.min(...c)
  }
  return c.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a))
}

export interface BatchRow { name: string; cost: number; value: number; net: number; final: number; markup: number; margin: number; error?: string }

/**
 * Batch pricing. Each line: name, cost[, markup or margin %]. Header line optional.
 * Rounding is applied to the shelf price (gross if `roundGross`), then margin is recomputed.
 */
export function batchPrice(text: string, opts: { driver: 'markup' | 'margin'; value: number; taxRate: number; ending: Ending; dir: Dir; roundGross: boolean }): BatchRow[] {
  const out: BatchRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cells = splitCsv(line)
    const cost = parseNum(cells[1])
    if (out.length === 0 && !Number.isFinite(cost) && /cost/i.test(line)) continue // header
    const name = cells[0] ?? ''
    if (!Number.isFinite(cost) || cost < 0) {
      out.push({ name, cost: NaN, value: NaN, net: NaN, final: NaN, markup: NaN, margin: NaN, error: 'cost is not a number' })
      continue
    }
    const own = parseNum(cells[2])
    const value = Number.isFinite(own) ? own / 100 : opts.value
    const net0 = netPrice(cost, opts.driver, value)
    if (!Number.isFinite(net0)) {
      out.push({ name, cost, value, net: NaN, final: NaN, markup: NaN, margin: NaN, error: 'margin must be below 100 %' })
      continue
    }
    const shelf = opts.roundGross ? roundEnding(net0 * (1 + opts.taxRate), opts.ending, opts.dir) : roundEnding(net0, opts.ending, opts.dir)
    const net = opts.roundGross ? shelf / (1 + opts.taxRate) : shelf
    const b = breakdown(cost, net, opts.taxRate)
    out.push({ name, cost, value, net, final: shelf, markup: b.markup, margin: b.margin })
  }
  return out
}

export function parseNum(s: string | undefined): number {
  if (s === undefined) return NaN
  const t = s.replace(/[^\d.,-]/g, '')
  if (!t) return NaN
  // "1.234,56" or "1,234.56" or "12,5"
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  return Number(norm)
}

export function splitCsv(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === sep && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}
