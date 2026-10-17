// Contraction statistics: durations, start-to-start intervals and the 5-1-1 style rule.

export interface Contraction { start: number; end: number; level?: 'mild' | 'moderate' | 'strong' }
export interface Rule { gap: number; dur: number; span: number } // minutes between starts, seconds long, minutes sustained
export const RULES: Record<string, { name: string; r: Rule }> = {
  '511': { name: '5-1-1 (first baby, common advice)', r: { gap: 5, dur: 60, span: 60 } },
  '411': { name: '4-1-1 (stricter)', r: { gap: 4, dur: 60, span: 60 } },
  '311': { name: '3-1-1', r: { gap: 3, dur: 60, span: 60 } },
}

const sec = (ms: number) => ms / 1000

/** Interval before contraction i (start-to-start), in seconds; null for the first. */
export function intervals(list: Contraction[]): (number | null)[] {
  return list.map((c, i) => (i === 0 ? null : sec(c.start - list[i - 1].start)))
}

export function summary(list: Contraction[], now: number, windowMin = 60) {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const recent = sorted.filter((c) => c.start >= now - windowMin * 60000)
  const iv = intervals(sorted)
  const recentIv = sorted.map((c, i) => ({ c, v: iv[i] })).filter((x) => x.c.start >= now - windowMin * 60000 && x.v !== null).map((x) => x.v as number)
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const last = sorted[sorted.length - 1]
  return {
    count: recent.length,
    avgDur: avg(recent.map((c) => sec(c.end - c.start))),
    avgGap: avg(recentIv),
    lastDur: last ? sec(last.end - last.start) : NaN,
    lastGap: iv.length ? (iv[iv.length - 1] ?? NaN) : NaN,
  }
}

/** Longest recent run satisfying the rule; met when it has lasted `span` minutes. */
export function checkRule(list: Contraction[], r: Rule) {
  const s = [...list].sort((a, b) => a.start - b.start)
  let i = s.length - 1
  if (i < 0 || sec(s[i].end - s[i].start) < r.dur) return { met: false, minutes: 0, count: 0 }
  while (i > 0 && sec(s[i].start - s[i - 1].start) <= r.gap * 60 && sec(s[i - 1].end - s[i - 1].start) >= r.dur) i--
  const minutes = (s[s.length - 1].start - s[i].start) / 60000
  return { met: minutes >= r.span, minutes, count: s.length - i }
}

export function mmss(seconds: number) {
  if (!Number.isFinite(seconds)) return '—'
  const t = Math.round(seconds)
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
