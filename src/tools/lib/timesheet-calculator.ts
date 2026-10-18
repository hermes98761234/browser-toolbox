// Timesheet Calculator logic: time parsing, rounding, overnight shifts, daily + weekly overtime.
// All durations are in minutes.

/** Parses "9", "9:30", "0930", "9.5", "9am", "5:45 pm", "17:45". Returns minutes after midnight or NaN. */
export function parseClock(s: string): number {
  const t = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return NaN
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(t)
  if (!m) return NaN
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  if (min > 59) return NaN
  const ap = m[3]?.[0]
  if (ap) {
    if (h < 1 || h > 12) return NaN
    if (ap === 'a' && h === 12) h = 0
    if (ap === 'p' && h !== 12) h += 12
  }
  if (h > 24 || (h === 24 && min > 0)) return NaN
  return h * 60 + min
}

export type Rounding = 0 | 5 | 6 | 10 | 15
/** Rounds a clock time to the nearest increment (e.g. 15 → the common "7-minute rule"). */
export const roundTo = (m: number, inc: Rounding) => (inc ? Math.round(m / inc) * inc : m)

/** Worked minutes for one shift; an end before the start means the shift ran past midnight. */
export function shiftMinutes(start: number, end: number, breakMin: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  let d = end - start
  if (d < 0) d += 1440
  return Math.max(0, d - Math.max(0, breakMin || 0))
}

export interface Rules {
  dailyOt: number | null // minutes after which daily overtime starts (e.g. 480), null = off
  dailyDt: number | null // minutes after which double time starts (e.g. 720)
  weeklyOt: number | null // minutes per week after which overtime starts (e.g. 2400)
}
export interface DaySplit { worked: number; reg: number; ot: number; dt: number }

/**
 * Splits each day of one workweek into regular, overtime and double time.
 * Daily rules apply first; then regular minutes beyond the weekly limit become overtime
 * (so no minute is counted twice).
 */
export function splitWeek(worked: number[], r: Rules): DaySplit[] {
  let cumReg = 0
  return worked.map((w) => {
    let dt = 0, ot = 0
    if (r.dailyDt !== null && w > r.dailyDt) dt = w - r.dailyDt
    const capped = w - dt
    if (r.dailyOt !== null && capped > r.dailyOt) ot = capped - r.dailyOt
    let reg = capped - ot
    if (r.weeklyOt !== null) {
      const room = Math.max(0, r.weeklyOt - cumReg)
      if (reg > room) {
        ot += reg - room
        reg = room
      }
    }
    cumReg += reg
    return { worked: w, reg, ot, dt }
  })
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** 450 → "7:30" */
export function hm(m: number): string {
  const r = Math.round(Math.abs(m))
  return `${m < 0 ? '-' : ''}${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}
/** 450 → 7.5 (two decimals) */
export const dec = (m: number) => Math.round((m / 60) * 100) / 100

/** Pay for a split given an hourly rate and multipliers. */
export function pay(s: { reg: number; ot: number; dt: number }, rate: number, otX = 1.5, dtX = 2): { reg: number; ot: number; dt: number; total: number } {
  const reg = (s.reg / 60) * rate, ot = (s.ot / 60) * rate * otX, dt = (s.dt / 60) * rate * dtX
  return { reg, ot, dt, total: reg + ot + dt }
}
