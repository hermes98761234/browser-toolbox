// Running pace math: time parsing/formatting, pace ⇄ speed, split tables and Riegel race prediction.

export const KM_PER_MI = 1.609344

/** "1:23:45", "23:45", "45" (minutes when `minutesOnly`) or "3h20m" → seconds. NaN if invalid. */
export function parseTime(t: string): number {
  const s = t.trim().toLowerCase()
  if (!s) return NaN
  const hm = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/.exec(s)
  if (hm && (hm[1] || hm[2] || hm[3])) return Number(hm[1] ?? 0) * 3600 + Number(hm[2] ?? 0) * 60 + Number(hm[3] ?? 0)
  const parts = s.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  const n = parts.map(Number)
  if (n.length > 1 && n.slice(1).some((x) => x >= 60)) return NaN
  return n.reduce((a, x) => a * 60 + x, 0)
}

/** Seconds → "h:mm:ss" or "m:ss" (with optional tenths). */
export function fmtTime(sec: number, tenths = false): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const total = tenths ? Math.round(sec * 10) / 10 : Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = total - h * 3600 - m * 60
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Riegel (1977): T2 = T1 · (D2 / D1)^k, k ≈ 1.06. */
export const riegel = (t1: number, d1: number, d2: number, k = 1.06) => t1 * Math.pow(d2 / d1, k)

export interface Split { n: number; dist: number; pace: number; split: number; cum: number }

/**
 * Splits every `unit` of distance (same unit as `dist`). `neg` is the negative-split fraction:
 * 0.04 means the first half is run 4 % slower than the second half (pace changes linearly, total time kept).
 */
export function splits(dist: number, total: number, unit = 1, neg = 0): Split[] {
  if (!(dist > 0 && total > 0 && unit > 0)) return []
  const avg = total / dist
  // pace(x) = avg · (1 + a·(1/2 − x/dist)); halves' mean paces differ by a/2 each way → ratio (1+a/4)/(1−a/4) = 1+neg
  const a = (4 * neg) / (2 + neg)
  const timeTo = (x: number) => avg * (x + a * (x / 2 - (x * x) / (2 * dist)))
  const out: Split[] = []
  let prev = 0
  for (let i = 1; prev < dist - 1e-9 && i < 1000; i++) {
    const d = Math.min(i * unit, dist)
    const cum = timeTo(d)
    const seg = d - prev
    out.push({ n: i, dist: d, pace: (cum - timeTo(prev)) / seg, split: cum - timeTo(prev), cum })
    prev = d
  }
  return out
}

/** Pace in s per km/mi → speed in km/h or mph. */
export const speed = (paceSec: number) => (paceSec > 0 ? 3600 / paceSec : NaN)
