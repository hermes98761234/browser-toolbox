// Repositioning schedule logic: due status, position rotation, on-time compliance, durations.

export const POSITIONS = ['Left 30°', 'Supine', 'Right 30°', 'Semi-Fowler', 'Prone', 'Chair'] as const
export type Position = (typeof POSITIONS)[number]

export interface Room { id: string; label: string; interval: number /* min */; position: Position; last: number /* ms */; rotation: Position[]; paused: boolean; note: string }
export interface Turn { id: string; room: string; label: string; at: number; from: Position; to: Position; skin: string; by: string }

export type Level = 'ok' | 'soon' | 'due' | 'overdue' | 'paused'

/** Due time and status; `soon` within `warn` minutes, `overdue` past `grace` minutes. */
export function status(r: Room, now: number, warn = 15, grace = 15): { due: number; left: number; level: Level } {
  const due = r.last + r.interval * 60000
  const left = due - now
  if (r.paused) return { due, left, level: 'paused' }
  const level: Level = left > warn * 60000 ? 'ok' : left > 0 ? 'soon' : left > -grace * 60000 ? 'due' : 'overdue'
  return { due, left, level }
}

/** Next position in the room's rotation after `cur` (wraps around; first entry if `cur` isn't in it). */
export function nextPosition(cur: Position, rotation: Position[]): Position {
  if (!rotation.length) return cur
  const i = rotation.indexOf(cur)
  return rotation[(i + 1) % rotation.length]
}

/**
 * On-time share of intervals between consecutive turns of one room inside [from, to]:
 * an interval counts as on time when gap ≤ interval + grace.
 */
export function compliance(turns: Turn[], room: string, intervalMin: number, from: number, to: number, grace = 15): { onTime: number; total: number; longest: number } {
  const ts = turns.filter((t) => t.room === room && t.at >= from && t.at <= to).map((t) => t.at).sort((a, b) => a - b)
  let onTime = 0, longest = 0
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1]
    longest = Math.max(longest, gap)
    if (gap <= (intervalMin + grace) * 60000) onTime++
  }
  return { onTime, total: Math.max(0, ts.length - 1), longest }
}

/** "1 h 05 min", "12 min", "45 s" (absolute value). */
export function fmtDur(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** mm:ss or h:mm:ss countdown text for the tiles. */
export function clock(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${ms < 0 ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`
}
