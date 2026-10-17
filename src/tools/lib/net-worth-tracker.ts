// Net worth snapshots: totals, changes and stacked chart series.

export interface Acct { id: string; name: string; kind: 'asset' | 'liability'; cat: string }
export interface Snap { month: string; values: Record<string, number> }

export interface Totals { month: string; assets: number; liabilities: number; net: number; byCat: Record<string, number> }

/** Liabilities are entered as positive balances owed. */
export function totals(accts: Acct[], s: Snap): Totals {
  let assets = 0, liabilities = 0
  const byCat: Record<string, number> = {}
  for (const a of accts) {
    const v = Number(s.values[a.id]) || 0
    if (a.kind === 'asset') assets += v
    else liabilities += Math.abs(v)
    byCat[a.cat] = (byCat[a.cat] ?? 0) + (a.kind === 'asset' ? v : Math.abs(v))
  }
  return { month: s.month, assets, liabilities, net: assets - liabilities, byCat }
}

export const sortSnaps = (ss: Snap[]) => [...ss].sort((a, b) => a.month.localeCompare(b.month))

/** Relative change; null when the base is zero. Uses |base| so a shrinking negative net worth reads as an improvement. */
export function change(now: number, base: number): number | null {
  if (!base) return null
  return (now - base) / Math.abs(base)
}

/** Next calendar month in YYYY-MM form. */
export function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

/** Finds the snapshot `months` before `m` (exact month) or null. */
export function monthsBack(ss: Snap[], m: string, months: number): Snap | null {
  const [y, mo] = m.split('-').map(Number)
  const t = y * 12 + (mo - 1) - months
  const target = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
  return ss.find((s) => s.month === target) ?? null
}

/** Compound monthly growth rate of net worth between the first and last snapshot. */
export function cmgr(first: number, last: number, months: number): number | null {
  if (months <= 0 || first <= 0 || last <= 0) return null
  return Math.pow(last / first, 1 / months) - 1
}

export const monthIndex = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + mo - 1
}
