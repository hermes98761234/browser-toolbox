// Budget vs actual variance: favourable/unfavourable by line type, materiality thresholds, table import.
import { toNumber } from './chart-builder'

export type Kind = 'income' | 'expense'
export interface Line { id: string; category: string; group: string; kind: Kind; budget: number; actual: number }
export interface Thresholds { pct: number; abs: number; rule: 'and' | 'or' }
export interface VarLine extends Line { budgetAdj: number; variance: number; pct: number; fav: boolean | null; flag: boolean; used: number }

/**
 * variance = actual − budget (budget optionally pro-rated). Favourable when income beats budget or costs come in
 * under it. A line is flagged when it is unfavourable and passes the materiality test (|%| ≥ pct and/or |Δ| ≥ abs).
 */
export function analyse(lines: Line[], t: Thresholds, prorate = 1): VarLine[] {
  return lines.map((l) => {
    const budgetAdj = l.budget * prorate
    const variance = l.actual - budgetAdj
    const pct = budgetAdj !== 0 ? variance / Math.abs(budgetAdj) : variance === 0 ? 0 : Infinity * Math.sign(variance)
    const fav = variance === 0 ? null : l.kind === 'income' ? variance > 0 : variance < 0
    const bigPct = Math.abs(pct) >= t.pct / 100, bigAbs = Math.abs(variance) >= t.abs
    const material = t.rule === 'and' ? bigPct && bigAbs : bigPct || bigAbs
    return { ...l, budgetAdj, variance, pct, fav, flag: fav === false && material, used: budgetAdj ? l.actual / budgetAdj : NaN }
  })
}

export function totals(v: VarLine[]) {
  const sum = (k: Kind, f: 'budgetAdj' | 'actual') => v.filter((x) => x.kind === k).reduce((a, x) => a + x[f], 0)
  const ib = sum('income', 'budgetAdj'), ia = sum('income', 'actual'), eb = sum('expense', 'budgetAdj'), ea = sum('expense', 'actual')
  return { ib, ia, eb, ea, nb: ib - eb, na: ia - ea, netVar: ia - ea - (ib - eb), incomeVar: ia - ib, expenseVar: ea - eb }
}

/** Subtotals per group, keeping the first-seen order. */
export function groups(v: VarLine[]): { group: string; kind: Kind; budget: number; actual: number; variance: number; fav: boolean | null }[] {
  const m = new Map<string, { group: string; kind: Kind; budget: number; actual: number; variance: number; fav: boolean | null }>()
  for (const x of v) {
    const k = `${x.kind}|${x.group}`
    const g = m.get(k) ?? { group: x.group, kind: x.kind, budget: 0, actual: 0, variance: 0, fav: null }
    g.budget += x.budgetAdj
    g.actual += x.actual
    g.variance = g.actual - g.budget
    g.fav = g.variance === 0 ? null : x.kind === 'income' ? g.variance > 0 : g.variance < 0
    m.set(k, g)
  }
  return [...m.values()]
}

type Cell = string | number | boolean | Date | null
const str = (c: Cell | undefined) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)).trim()
/** Amount parser: "1,000" and "1,234.50" are thousands separators (common in budgets); other forms via toNumber. */
export function amount(c: Cell | undefined): number {
  if (typeof c === 'number') return c
  const t = str(c).replace(/[$€£¥₴\s]/g, '')
  const neg = /^\(.*\)$/.test(t)
  const u = neg ? t.slice(1, -1) : t
  const v = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(u) ? Number(u.replace(/,/g, '')) : toNumber(u)
  return neg ? -v : v
}
const numOf = amount
const INCOME_WORDS = /^(income|revenue|inflow|sales|receipt|in)$/i

/** Finds a header row and the columns for category, group, type, budget and actual. */
function header(rows: Cell[][]) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const h = rows[r].map((c) => str(c).toLowerCase())
    const find = (re: RegExp) => h.findIndex((x) => re.test(x))
    const cat = find(/^(category|line|item|account|description|name)/)
    const bud = find(/budget|plan|forecast|target/)
    const act = find(/actual|spent|real|ytd/)
    const amt = find(/^(amount|value|total|sum)/)
    if (cat >= 0 && (bud >= 0 || act >= 0 || amt >= 0)) return { r, cat, bud, act, amt, grp: find(/^(group|section|department|dept|class)/), type: find(/^(type|kind|direction|in\/out)/) }
  }
  return null
}

/**
 * Imports one table with budget and actual columns, or a pair of tables (budget sheet, actual sheet) each with a
 * category and an amount column, matched by category name (case-insensitive).
 */
export function importTables(tables: Cell[][][], id: () => string): { lines: Line[]; note: string } | null {
  for (const t of tables) {
    const h = header(t)
    if (h && h.bud >= 0 && h.act >= 0) {
      const lines = t.slice(h.r + 1).filter((row) => str(row[h.cat])).map((row) => line(row, h, numOf(row[h.bud]), numOf(row[h.act]), id))
      return { lines, note: `Read ${lines.length} lines with budget and actual columns.` }
    }
  }
  if (tables.length >= 2) {
    const [hb, ha] = [header(tables[0]), header(tables[1])]
    if (hb && ha) {
      const amtCol = (h: NonNullable<typeof hb>, pref: number) => (pref >= 0 ? pref : h.amt >= 0 ? h.amt : h.bud >= 0 ? h.bud : h.act)
      const bc = amtCol(hb, hb.bud), ac = amtCol(ha, ha.act)
      const actual = new Map<string, number>()
      for (const row of tables[1].slice(ha.r + 1)) {
        const k = str(row[ha.cat]).toLowerCase()
        if (k) actual.set(k, (actual.get(k) ?? 0) + (numOf(row[ac]) || 0))
      }
      const lines: Line[] = []
      for (const row of tables[0].slice(hb.r + 1)) {
        const k = str(row[hb.cat]).toLowerCase()
        if (!k) continue
        lines.push(line(row, hb, numOf(row[bc]) || 0, actual.get(k) ?? 0, id))
        actual.delete(k)
      }
      for (const [k, v] of actual) lines.push({ id: id(), category: k.replace(/^\w/, (c) => c.toUpperCase()), group: 'Unbudgeted', kind: 'expense', budget: 0, actual: v })
      return { lines, note: `Matched budget sheet with actual sheet by category: ${lines.length} lines.` }
    }
  }
  return null
}

function line(row: Cell[], h: { cat: number; grp: number; type: number }, budget: number, actual: number, id: () => string): Line {
  const type = h.type >= 0 ? str(row[h.type]) : ''
  return { id: id(), category: str(row[h.cat]), group: (h.grp >= 0 && str(row[h.grp])) || 'General', kind: INCOME_WORDS.test(type) ? 'income' : 'expense', budget: Number.isFinite(budget) ? budget : 0, actual: Number.isFinite(actual) ? actual : 0 }
}
