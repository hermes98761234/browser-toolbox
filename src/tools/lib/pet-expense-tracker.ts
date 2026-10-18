// Pet expenses: monthly aggregation, category breakdown and yearly projection.

export interface Entry { id: string; pet: string; date: string; category: string; amount: number; note: string }

export const CATEGORIES = ['Food', 'Vet', 'Medication', 'Supplies', 'Grooming', 'Insurance', 'Toys & treats', 'Boarding', 'Training', 'Other'] as const

export const monthKey = (date: string) => date.slice(0, 7)

/** The last `n` month keys ending with the month of `today` (oldest first). */
export function lastMonths(today: string, n: number): string[] {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (n - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export function byMonthCategory(es: Entry[], months: string[], cats: readonly string[]) {
  return months.map((mk) => {
    const inMonth = es.filter((e) => monthKey(e.date) === mk)
    return { month: mk, values: cats.map((c) => inMonth.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0)), total: inMonth.reduce((a, e) => a + e.amount, 0) }
  })
}

export function byKey(es: Entry[], key: 'category' | 'pet') {
  const m = new Map<string, number>()
  for (const e of es) m.set(e[key], (m.get(e[key]) ?? 0) + e.amount)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * Yearly projection from the average of the last `window` complete months
 * (the current month is excluded because it is still running).
 */
export function projection(es: Entry[], today: string, window: number) {
  const months = lastMonths(today, window + 1).slice(0, window)
  const first = es.reduce((a, e) => (e.date < a ? e.date : a), today)
  // only count months since tracking started, so a new tracker isn't diluted by empty months
  const counted = months.filter((m) => m >= monthKey(first))
  const total = es.filter((e) => counted.includes(monthKey(e.date))).reduce((a, e) => a + e.amount, 0)
  const avg = counted.length ? total / counted.length : 0
  return { avg, year: avg * 12, months: counted.length }
}

export function ytd(es: Entry[], today: string) {
  const y = today.slice(0, 4)
  return es.filter((e) => e.date.startsWith(y) && e.date <= today).reduce((a, e) => a + e.amount, 0)
}
