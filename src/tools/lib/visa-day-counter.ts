// Rolling-window stay counter (Schengen-style "90 days in any 180-day period").
// Days are integer UTC day numbers; entry and exit days both count as days of stay.

export interface Trip { id: string; entry: string; exit: string; note: string; planned?: boolean }

export const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000)
}
export const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
export const validIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))

/** Set of day numbers spent inside the zone (overlapping trips and same-day re-entry count once). */
export function presence(trips: Trip[]): Set<number> {
  const s = new Set<number>()
  for (const t of trips) {
    if (!validIso(t.entry) || !validIso(t.exit)) continue
    const a = dayNum(t.entry), b = dayNum(t.exit)
    if (b < a || b - a > 3660) continue
    for (let d = a; d <= b; d++) s.add(d)
  }
  return s
}

/** Days present in the window of `window` days ending on (and including) day `d`. */
export function usedOn(days: Set<number>, d: number, window = 180): number {
  let n = 0
  for (let x = d - window + 1; x <= d; x++) if (days.has(x)) n++
  return n
}

/** First day on which the count exceeds the limit (null if none). */
export function firstViolation(days: Set<number>, limit = 90, window = 180): number | null {
  const sorted = [...days].sort((a, b) => a - b)
  for (const d of sorted) if (usedOn(days, d, window) > limit) return d
  return null
}

/**
 * How many consecutive days you could stay if you enter on `entry` (also counting days already
 * planned after it). Returns 0 if even the entry day would break the rule. Stops counting at `cap`.
 */
export function maxStay(days: Set<number>, entry: number, limit = 90, window = 180, cap = limit): number {
  const lo = entry - window, hi = entry + limit + 2 * window
  const pres = new Uint8Array(hi - lo)
  for (const d of days) if (d >= lo && d < hi) pres[d - lo] = 1
  // cnt[i] = days present in the window ending on lo + i
  const cnt = new Int32Array(hi - lo)
  let run = 0
  for (let i = 0; i < hi - lo; i++) {
    run += pres[i] - (i >= window ? pres[i - window] : 0)
    cnt[i] = run
  }
  let n = 0
  for (let i = entry - lo; n < cap; i++, n++) {
    if (!pres[i]) {
      pres[i] = 1
      for (let e = i; e < i + window; e++) cnt[e]++
    }
    for (let e = i; e < i + window; e++) if (pres[e] && cnt[e] > limit) return n
  }
  return n
}

/** Earliest entry day ≥ `from` that allows a continuous stay of `len` days. */
export function earliestEntry(days: Set<number>, from: number, len: number, limit = 90, window = 180): number | null {
  if (len > limit) return null
  for (let d = from; d < from + 2 * window + len; d++) if (maxStay(days, d, limit, window, len) >= len) return d
  return null
}

/** Day on which at least `need` days are free again assuming no further travel. */
export function regainDate(days: Set<number>, from: number, need: number, limit = 90, window = 180): number | null {
  if (need > limit) return null
  for (let d = from; d < from + window + 1; d++) if (limit - usedOn(days, d, window) >= need) return d
  return null
}
