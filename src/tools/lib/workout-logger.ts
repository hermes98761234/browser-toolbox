// Pure workout math: estimated 1RM, volume, personal-record detection.

export interface WSet { reps: number; weight: number }
export interface WEntry { exercise: string; sets: WSet[] }
export interface WSession { id: string; date: string; name: string; entries: WEntry[] }

/** Epley estimated one-rep max. A single rep is its own 1RM. */
export function e1rm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Brzycki estimate (valid for reps < 37). */
export function brzycki(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0) || reps >= 37) return 0
  return (weight * 36) / (37 - reps)
}

export const setVolume = (s: WSet) => Math.max(0, s.reps) * Math.max(0, s.weight)
export const entryVolume = (e: WEntry) => e.sets.reduce((a, s) => a + setVolume(s), 0)
export const sessionVolume = (s: WSession) => s.entries.reduce((a, e) => a + entryVolume(e), 0)
export const sessionSets = (s: WSession) => s.entries.reduce((a, e) => a + e.sets.length, 0)

export interface PR { exercise: string; kind: 'weight' | 'e1rm' | 'volume'; value: number; date: string; sessionId: string }

/**
 * Walks sessions in date order and records every time an exercise beats its previous best
 * heaviest weight, estimated 1RM or single-session volume. The first time an exercise is
 * logged sets the baseline and is not counted as a PR.
 */
export function detectPRs(sessions: WSession[]): PR[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const best = new Map<string, { weight: number; e1rm: number; volume: number }>()
  const out: PR[] = []
  for (const s of sorted) {
    for (const e of s.entries) {
      const valid = e.sets.filter((x) => x.reps > 0 && x.weight >= 0)
      if (!valid.length) continue
      const w = Math.max(...valid.map((x) => x.weight))
      const r = Math.max(...valid.map((x) => e1rm(x.weight, x.reps)))
      const v = entryVolume(e)
      const key = e.exercise.trim().toLowerCase()
      const b = best.get(key)
      if (!b) {
        best.set(key, { weight: w, e1rm: r, volume: v })
        continue
      }
      if (w > b.weight) out.push({ exercise: e.exercise, kind: 'weight', value: w, date: s.date, sessionId: s.id })
      if (r > b.e1rm + 1e-9) out.push({ exercise: e.exercise, kind: 'e1rm', value: r, date: s.date, sessionId: s.id })
      if (v > b.volume) out.push({ exercise: e.exercise, kind: 'volume', value: v, date: s.date, sessionId: s.id })
      best.set(key, { weight: Math.max(w, b.weight), e1rm: Math.max(r, b.e1rm), volume: Math.max(v, b.volume) })
    }
  }
  return out
}

/** Monday of the ISO week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

/** Total volume per week, sorted by week. */
export function weeklyVolume(sessions: WSession[]): { week: string; volume: number; sessions: number }[] {
  const m = new Map<string, { volume: number; sessions: number }>()
  for (const s of sessions) {
    const k = weekStart(s.date)
    const cur = m.get(k) ?? { volume: 0, sessions: 0 }
    cur.volume += sessionVolume(s)
    cur.sessions += 1
    m.set(k, cur)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }))
}

/** Best estimated 1RM per session for one exercise, in date order. */
export function exerciseTrend(sessions: WSession[], exercise: string): { date: string; e1rm: number; top: number; volume: number }[] {
  const key = exercise.trim().toLowerCase()
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) => {
      const es = s.entries.filter((e) => e.exercise.trim().toLowerCase() === key && e.sets.length)
      if (!es.length) return []
      const sets = es.flatMap((e) => e.sets)
      return [{ date: s.date, e1rm: Math.max(...sets.map((x) => e1rm(x.weight, x.reps))), top: Math.max(...sets.map((x) => x.weight)), volume: sets.reduce((a, x) => a + setVolume(x), 0) }]
    })
}
