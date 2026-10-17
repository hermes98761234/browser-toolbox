// Training-session statistics for the clicker trainer.

export interface Rep { t: number; behavior: string; ok: boolean } // ok = clicked (success), false = miss / no click
export interface Behavior { id: string; name: string; cue: string }

export function behaviorStats(reps: Rep[], behavior: string) {
  const r = reps.filter((x) => x.behavior === behavior)
  const ok = r.filter((x) => x.ok).length
  const last10 = r.slice(-10)
  const rate10 = last10.length ? last10.filter((x) => x.ok).length / last10.length : NaN
  return { tries: r.length, clicks: ok, misses: r.length - ok, rate: r.length ? ok / r.length : NaN, rate10 }
}

/** The common "80 % rule": raise criteria when the dog succeeds about 8 of 10 times, make it easier below ~5 of 10. */
export function advice(rate10: number, tries: number): { tone: 'ok' | 'warn' | 'info'; text: string } {
  if (!Number.isFinite(rate10) || tries < 5) return { tone: 'info', text: 'Do a few repetitions; advice appears after 5 tries.' }
  if (rate10 >= 0.8) return { tone: 'ok', text: 'Success rate ≥ 80 %: raise the criteria a little (more distance, duration or distraction).' }
  if (rate10 < 0.5) return { tone: 'warn', text: 'Below 50 %: make it easier. Lower the criteria or train somewhere quieter.' }
  return { tone: 'info', text: 'Between 50 and 80 %: keep the current criteria until it is reliable.' }
}

/** Clicks per minute over the session. */
export const perMinute = (clicks: number, seconds: number) => (seconds > 0 ? clicks / (seconds / 60) : 0)

/** Treat calories as a share of the dog's daily energy (keep treats under ~10 %). */
export const treatShare = (treats: number, kcalPerTreat: number, dailyKcal: number) => (dailyKcal > 0 ? (treats * kcalPerTreat) / dailyKcal : 0)

/** Resting energy requirement (kcal/day) = 70 × kg^0.75; a typical pet's daily need ≈ 1.6 × RER. */
export const dailyKcal = (kg: number) => (kg > 0 ? 1.6 * 70 * Math.pow(kg, 0.75) : 0)
