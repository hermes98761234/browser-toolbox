// Sales tax / VAT math: exclusive (add on top) and inclusive (extract) calculations, batch lines, rounding.

export const round2 = (x: number) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100

export interface Split { net: number; tax: number; gross: number }

/** Price excludes tax: tax = net × r. */
export function addTax(net: number, ratePct: number): Split {
  const tax = (net * ratePct) / 100
  return { net, tax, gross: net + tax }
}

/** Price includes tax: net = gross ÷ (1 + r), tax = gross − net. */
export function removeTax(gross: number, ratePct: number): Split {
  const net = gross / (1 + ratePct / 100)
  return { net, tax: gross - net, gross }
}

/** Effective rate from a net and a gross amount. */
export const findRate = (net: number, gross: number) => (net > 0 ? (gross / net - 1) * 100 : NaN)

/** Total rate of stacked components; compound applies each on top of the previous total. */
export function combineRates(rates: number[], compound = false): number {
  if (!compound) return rates.reduce((a, r) => a + r, 0)
  return (rates.reduce((m, r) => m * (1 + r / 100), 1) - 1) * 100
}

export interface Line { label: string; amount: number; qty: number }

/** Parses "Label; amount; qty" / "Label, amount" / "amount" lines (thousands separators and currency symbols allowed). */
export function parseLines(text: string): { lines: Line[]; errors: string[] } {
  const lines: Line[] = [], errors: string[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim()
    if (!t || t.startsWith('#')) return
    const parts = t.split(/\s*[;\t|]\s*/)
    const cells = parts.length > 1 ? parts : t.split(/\s*,(?!\d{3}(?:\D|$))\s*/)
    const nums = cells.map((c) => Number(c.replace(/[$€£¥₴\s]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')))
    const firstNum = nums.findIndex((n, j) => Number.isFinite(n) && cells[j].trim() !== '')
    if (firstNum < 0) return errors.push(`Line ${i + 1}: no amount found`)
    const label = cells.slice(0, firstNum).join(' ').trim() || `Item ${lines.length + 1}`
    const qty = Number.isFinite(nums[firstNum + 1]) && cells[firstNum + 1]?.trim() ? nums[firstNum + 1] : 1
    lines.push({ label, amount: nums[firstNum], qty })
  })
  return { lines, errors }
}

export interface BatchRow extends Split { label: string; qty: number }

/** Batch totals. perLine: round tax on every line (receipt style); otherwise round once on the total (invoice style). */
export function batch(lines: Line[], ratePct: number, inclusive: boolean, perLine: boolean): { rows: BatchRow[]; total: Split } {
  const rows = lines.map((l) => {
    const amt = l.amount * l.qty
    const s = inclusive ? removeTax(amt, ratePct) : addTax(amt, ratePct)
    const tax = perLine ? round2(s.tax) : s.tax
    return { label: l.label, qty: l.qty, net: inclusive ? amt - tax : amt, tax, gross: inclusive ? amt : amt + tax }
  })
  const base = rows.reduce((a, r) => a + (inclusive ? r.gross : r.net), 0)
  if (perLine) {
    const tax = round2(rows.reduce((a, r) => a + r.tax, 0))
    return { rows, total: inclusive ? { net: round2(base - tax), tax, gross: round2(base) } : { net: round2(base), tax, gross: round2(base + tax) } }
  }
  const s = inclusive ? removeTax(base, ratePct) : addTax(base, ratePct)
  const tax = round2(s.tax)
  return { rows, total: inclusive ? { net: round2(base - tax), tax, gross: round2(base) } : { net: round2(base), tax, gross: round2(base + tax) } }
}
