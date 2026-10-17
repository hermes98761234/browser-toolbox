// Breathing pattern timing: which phase is active at a given elapsed time.

export type PhaseKind = 'in' | 'hold' | 'out' | 'rest'
export interface Phase { kind: PhaseKind; label: string; secs: number }
/** Durations in seconds: inhale, hold after inhale, exhale, hold after exhale. */
export type Pattern = [number, number, number, number]

const LABELS: Record<PhaseKind, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Hold' }

export function phases(p: Pattern): Phase[] {
  const kinds: PhaseKind[] = ['in', 'hold', 'out', 'rest']
  return kinds.map((kind, i) => ({ kind, label: LABELS[kind], secs: Math.max(0, p[i]) })).filter((x) => x.secs > 0)
}

export const cycleLength = (p: Pattern) => phases(p).reduce((a, x) => a + x.secs, 0)
export const breathsPerMinute = (p: Pattern) => (cycleLength(p) > 0 ? 60 / cycleLength(p) : 0)

export interface PhaseState {
  cycle: number // completed cycles
  index: number // phase index within the cycle
  phase: Phase
  into: number // seconds into the phase
  remaining: number
  progress: number // 0..1 within the phase
  cycleProgress: number // 0..1 within the cycle
}

export function phaseAt(p: Pattern, t: number): PhaseState | null {
  const ph = phases(p)
  const L = cycleLength(p)
  if (!ph.length || L <= 0) return null
  const tt = Math.max(0, t)
  const cycle = Math.floor(tt / L)
  let r = tt - cycle * L
  const inCycle = r
  for (let i = 0; i < ph.length; i++) {
    if (r < ph[i].secs || i === ph.length - 1) {
      const into = Math.min(r, ph[i].secs)
      return { cycle, index: i, phase: ph[i], into, remaining: ph[i].secs - into, progress: into / ph[i].secs, cycleProgress: inCycle / L }
    }
    r -= ph[i].secs
  }
  return null
}

/** Lung "fullness" 0..1 for the animation (eased in/out, flat during holds). */
export function fullness(s: PhaseState): number {
  const e = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
  switch (s.phase.kind) {
    case 'in': return e(s.progress)
    case 'hold': return 1
    case 'out': return 1 - e(s.progress)
    default: return 0
  }
}
