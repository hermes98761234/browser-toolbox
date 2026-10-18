// Hiking time estimates (Naismith, Langmuir's corrections, Tobler), adjustments, breaks and turnaround.
import { naismith, tobler, toblerHours, type ProfilePt } from './hike-elevation-profile'

export interface Estimate { naismith: number; langmuir: number; tobler: number }
export interface Leg { distKm: number; ascent: number; descent: number; steepFrac: number; gentleFrac: number }

/** Naismith: distance / speed + ascent / climb rate (hours). */
export const naismithHours = (distKm: number, ascent: number, kmh = 5, climb = 600) => (kmh > 0 ? distKm / kmh : 0) + (climb > 0 ? ascent / climb : 0)

/** Langmuir: −10 min per 300 m of gentle descent (5–12°), +10 min per 300 m of steep descent (> 12°). Hours. */
export const langmuirAdj = (gentle: number, steep: number) => ((steep - gentle) / 300) * (10 / 60)

/**
 * Tobler for a leg summarised by distance, ascent and descent: the distance is split between an uphill
 * and a downhill section in proportion to the height changes, each at its average gradient.
 */
export function toblerLeg(distKm: number, ascent: number, descent: number): number {
  const m = distKm * 1000
  if (m <= 0) return 0
  const tot = ascent + descent
  if (tot <= 0) return distKm / tobler(0)
  const up = (m * ascent) / tot, down = m - up
  const h = (dist: number, dh: number) => (dist > 0 ? dist / 1000 / tobler(dh / dist) : 0)
  return h(up, ascent) + h(down, -descent)
}

export function estimateLeg(l: Leg, kmh = 5, climb = 600): Estimate {
  const n = naismithHours(l.distKm, l.ascent, kmh, climb)
  return { naismith: n, langmuir: Math.max(0, n + langmuirAdj(l.descent * l.gentleFrac, l.descent * l.steepFrac)), tobler: toblerLeg(l.distKm, l.ascent, l.descent) }
}

export function estimateProfile(p: ProfilePt[], kmh = 5, climb = 600): Estimate {
  const r = naismith(p, kmh, climb)
  return { naismith: r.base + r.ascent, langmuir: r.hours, tobler: toblerHours(p) }
}

/** The same path walked in the opposite direction. */
export function reverseProfile(p: ProfilePt[]): ProfilePt[] {
  const total = p.length ? p[p.length - 1].d : 0
  return p.slice().reverse().map((x) => ({ ...x, d: total - x.d }))
}

/** Cumulative Tobler hours at each profile point (for plotting progress). */
export function toblerTimeline(p: ProfilePt[]): number[] {
  const t = [0]
  for (let i = 1; i < p.length; i++) {
    const dx = p[i].d - p[i - 1].d
    t.push(t[i - 1] + (dx > 0 ? dx / 1000 / tobler((p[i].e - p[i - 1].e) / dx) : 0))
  }
  return t
}

/** Moving time × pace factor plus short breaks (min per hour walked) and one long break (min). Hours. */
export function withBreaks(moving: number, factor: number, perHourMin: number, longMin: number): { moving: number; breaks: number; total: number } {
  const mv = moving * factor
  const br = (mv * perHourMin) / 60 + longMin / 60
  return { moving: mv, breaks: br, total: mv + br }
}

/** Formats hours as "4 h 05 min". */
export function hm(h: number): string {
  if (!Number.isFinite(h)) return '—'
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** Clock time (HH:MM) from minutes after midnight (wraps at 24 h). */
export function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
export const parseClock = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  return m ? +m[1] * 60 + +m[2] : NaN
}
