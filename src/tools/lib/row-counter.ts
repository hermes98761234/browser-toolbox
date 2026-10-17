// Row counter logic: linked counters (pattern repeats roll over into a parent counter) and reminders.

export interface Counter { id: string; name: string; value: number; target: number; repeat: number; linkTo: string }
export interface Reminder { id: string; counterId: string; kind: 'at' | 'every'; n: number; text: string }

/**
 * Adds `delta` (+1 / −1) to counter `id`. A counter with `repeat` > 0 counts 1…repeat; stepping past `repeat`
 * wraps to 1 and bumps the linked counter (if any); stepping below 1 wraps to `repeat` and decrements the link.
 * Returns the new counters and the ids of counters whose value went up (for reminders).
 */
export function step(counters: Counter[], id: string, delta: 1 | -1): { counters: Counter[]; bumped: string[] } {
  const next = counters.map((c) => ({ ...c }))
  const bumped: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = id
  let d = delta
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const c = next.find((x) => x.id === cur)
    if (!c) break
    let carry = false
    if (d > 0) {
      c.value += 1
      if (c.repeat > 0 && c.value > c.repeat) { c.value = 1; carry = true }
      bumped.push(c.id)
    } else {
      if (c.repeat > 0 && c.value <= 1) { c.value = c.repeat; carry = true } else c.value = Math.max(0, c.value - 1)
    }
    if (!carry || !c.linkTo) break
    cur = c.linkTo
    d = delta
  }
  return { counters: next, bumped }
}

/** Reminders triggered by the counters that just went up. */
export function triggered(counters: Counter[], reminders: Reminder[], bumped: string[]): Reminder[] {
  return reminders.filter((r) => {
    if (!bumped.includes(r.counterId) || r.n <= 0) return false
    const v = counters.find((c) => c.id === r.counterId)?.value ?? 0
    return r.kind === 'at' ? v === r.n : v > 0 && v % r.n === 0
  })
}

/** Next row at which a reminder fires (for "coming up" hints). */
export function nextFire(r: Reminder, value: number): number | null {
  if (r.n <= 0) return null
  if (r.kind === 'at') return r.n > value ? r.n : null
  return (Math.floor(value / r.n) + 1) * r.n
}
