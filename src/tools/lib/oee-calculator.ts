// Overall Equipment Effectiveness: Availability × Performance × Quality, with the six big losses.

export interface Shift {
  id: string
  name: string
  shiftMin: number // scheduled shift length
  breakMin: number // planned stops (breaks, meetings, no orders) — excluded from planned production time
  breakdownMin: number // unplanned stops (availability loss)
  setupMin: number // changeovers & adjustments (availability loss)
  smallStopMin: number // minor stops < 5 min (performance loss, counted inside run time)
  idealCycleSec: number // ideal time per part
  total: number // parts produced
  startupRejects: number
  rejects: number // production rejects (incl. rework)
}

export interface Losses { breakdown: number; setup: number; smallStops: number; speed: number; startupRejects: number; prodRejects: number }

export interface OeeResult {
  planned: number // planned production time (min)
  run: number // run time (min)
  netRun: number // ideal time for all parts (min)
  fullyProductive: number // ideal time for good parts (min)
  good: number
  total: number
  A: number
  P: number
  Q: number
  oee: number
  losses: Losses
  idealRatePerHour: number
}

const safe = (a: number, b: number) => (b > 0 ? a / b : 0)

export function oee(s: Shift): OeeResult {
  const planned = Math.max(0, s.shiftMin - s.breakMin)
  const run = Math.max(0, planned - s.breakdownMin - s.setupMin)
  const netRun = (s.idealCycleSec * s.total) / 60
  const rejects = Math.min(s.total, s.startupRejects + s.rejects)
  const good = s.total - rejects
  const fullyProductive = (s.idealCycleSec * good) / 60
  const perfLoss = Math.max(0, run - netRun)
  const small = Math.min(s.smallStopMin, perfLoss)
  return {
    planned, run, netRun, fullyProductive, good, total: s.total,
    A: safe(run, planned),
    P: safe(netRun, run),
    Q: safe(good, s.total),
    oee: safe(fullyProductive, planned),
    idealRatePerHour: s.idealCycleSec > 0 ? 3600 / s.idealCycleSec : 0,
    losses: {
      breakdown: Math.min(s.breakdownMin, planned),
      setup: Math.max(0, Math.min(s.setupMin, planned - s.breakdownMin)),
      smallStops: small,
      speed: perfLoss - small,
      startupRejects: (s.idealCycleSec * Math.min(s.startupRejects, s.total)) / 60,
      prodRejects: (s.idealCycleSec * (rejects - Math.min(s.startupRejects, s.total))) / 60,
    },
  }
}

/** Combines shift results by summing times and counts (time-weighted, not an average of percentages). */
export function combine(rs: OeeResult[]): OeeResult {
  const sum = (f: (r: OeeResult) => number) => rs.reduce((a, r) => a + f(r), 0)
  const planned = sum((r) => r.planned), run = sum((r) => r.run), netRun = sum((r) => r.netRun), fullyProductive = sum((r) => r.fullyProductive)
  const good = sum((r) => r.good), total = sum((r) => r.total)
  const L = (k: keyof Losses) => sum((r) => r.losses[k])
  return {
    planned, run, netRun, fullyProductive, good, total,
    A: safe(run, planned), P: safe(netRun, run), Q: safe(good, total), oee: safe(fullyProductive, planned),
    idealRatePerHour: netRun > 0 ? (total / netRun) * 60 : 0,
    losses: { breakdown: L('breakdown'), setup: L('setup'), smallStops: L('smallStops'), speed: L('speed'), startupRejects: L('startupRejects'), prodRejects: L('prodRejects') },
  }
}

export interface Step { label: string; value: number; kind: 'total' | 'loss' }

/** Waterfall from planned production time down to fully productive time (minutes). */
export function waterfall(r: OeeResult): Step[] {
  const L = r.losses
  return [
    { label: 'Planned production', value: r.planned, kind: 'total' },
    { label: 'Breakdowns', value: L.breakdown, kind: 'loss' },
    { label: 'Setup & adjust', value: L.setup, kind: 'loss' },
    { label: 'Run time', value: r.run, kind: 'total' },
    { label: 'Small stops', value: L.smallStops, kind: 'loss' },
    { label: 'Reduced speed', value: L.speed, kind: 'loss' },
    { label: 'Net run time', value: r.netRun, kind: 'total' },
    { label: 'Startup rejects', value: L.startupRejects, kind: 'loss' },
    { label: 'Production rejects', value: L.prodRejects, kind: 'loss' },
    { label: 'Fully productive', value: r.fullyProductive, kind: 'total' },
  ]
}

export const WORLD_CLASS = { A: 0.9, P: 0.95, Q: 0.999, oee: 0.85 }

export function rating(o: number): string {
  if (o >= 0.85) return 'World class'
  if (o >= 0.6) return 'Typical'
  if (o >= 0.4) return 'Low — common for plants starting to measure'
  return 'Very low'
}
