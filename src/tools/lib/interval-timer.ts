// Interval workout plan: expands a preset into timed segments and locates a moment in it.

export type SegKind = 'prep' | 'work' | 'rest' | 'setRest' | 'cool'

export interface Workout {
  id: string
  name: string
  prep: number // seconds
  work: number
  rest: number
  rounds: number
  sets: number
  setRest: number
  cool: number
  /** Optional exercise names cycled through the work intervals. */
  moves: string
}

export interface Segment {
  kind: SegKind
  label: string
  sec: number
  start: number // seconds from plan start
  round: number // 1-based within set (0 for prep/cool)
  set: number // 1-based (0 for prep/cool)
}

const LABEL: Record<SegKind, string> = { prep: 'Get ready', work: 'Work', rest: 'Rest', setRest: 'Set break', cool: 'Cool down' }

export function buildPlan(w: Workout): Segment[] {
  const out: Segment[] = []
  let t = 0
  const moves = w.moves.split(/[,\n]/).map((m) => m.trim()).filter(Boolean)
  const push = (kind: SegKind, sec: number, round = 0, set = 0, label = LABEL[kind]) => {
    if (!(sec > 0)) return
    out.push({ kind, label, sec, start: t, round, set })
    t += sec
  }
  const rounds = Math.max(1, Math.floor(w.rounds))
  const sets = Math.max(1, Math.floor(w.sets))
  push('prep', w.prep)
  let k = 0
  for (let s = 1; s <= sets; s++) {
    for (let r = 1; r <= rounds; r++) {
      push('work', w.work, r, s, moves.length ? moves[k++ % moves.length] : LABEL.work)
      // No plain rest after the final round of a set: a set break (or the end) follows.
      if (r < rounds) push('rest', w.rest, r, s)
    }
    if (s < sets) push('setRest', w.setRest, rounds, s)
  }
  push('cool', w.cool)
  return out
}

export const planLength = (p: Segment[]) => (p.length ? p[p.length - 1].start + p[p.length - 1].sec : 0)

/** Segment index at `t` seconds (p.length when finished). */
export function segmentAt(p: Segment[], t: number): number {
  for (let i = 0; i < p.length; i++) if (t < p[i].start + p[i].sec) return i
  return p.length
}

export function summary(p: Segment[]) {
  const sum = (k: SegKind) => p.filter((s) => s.kind === k).reduce((a, s) => a + s.sec, 0)
  const work = sum('work')
  const total = planLength(p)
  return { total, work, rest: sum('rest') + sum('setRest'), intervals: p.filter((s) => s.kind === 'work').length, ratio: total ? work / total : 0 }
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
