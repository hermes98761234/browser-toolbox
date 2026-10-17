// CPR training metronome timing: compression/breath cycles, phase at a given time, and feedback on
// a trainee's tapped compression rate. Training aid only.

export interface CprCfg {
  bpm: number // compression rate, 100–120 per guidelines
  compressions: number // per cycle (30 for 30:2; 0 = continuous)
  breaths: number // rescue breaths per cycle
  pause: number // seconds allowed for the breaths (guidelines: under 10 s)
  switchEvery: number // seconds between rescuer switches (typically 120)
}

export const clampRate = (bpm: number) => Math.max(100, Math.min(120, Math.round(bpm)))

/** Durations of one cycle. Compression fraction = time compressing / total. */
export function cycleInfo(c: CprCfg) {
  const comp = c.compressions > 0 ? (c.compressions * 60) / c.bpm : Infinity
  const pause = c.compressions > 0 ? c.pause : 0
  const total = comp + pause
  return { comp, pause, total, fraction: Number.isFinite(total) ? comp / total : 1, perMinute: Number.isFinite(total) ? (c.compressions * 60) / total : c.bpm }
}

export type Phase = { kind: 'compress'; cycle: number; count: number; nextAt: number } | { kind: 'breathe'; cycle: number; breath: number; resumeAt: number }

/** Phase at elapsed seconds `t` (t ≥ 0). `count` is 1-based compression number within the cycle. */
export function phaseAt(t: number, c: CprCfg): Phase {
  const period = 60 / c.bpm
  const ci = cycleInfo(c)
  if (!Number.isFinite(ci.total)) {
    const n = Math.floor(t / period)
    return { kind: 'compress', cycle: 1, count: n + 1, nextAt: (n + 1) * period }
  }
  const cycle = Math.floor(t / ci.total)
  const into = t - cycle * ci.total
  if (into < ci.comp - 1e-9) {
    const n = Math.floor(into / period + 1e-9)
    return { kind: 'compress', cycle: cycle + 1, count: n + 1, nextAt: cycle * ci.total + (n + 1) * period }
  }
  const breathLen = ci.pause / Math.max(1, c.breaths)
  return { kind: 'breathe', cycle: cycle + 1, breath: Math.min(c.breaths, Math.floor((into - ci.comp) / breathLen) + 1), resumeAt: (cycle + 1) * ci.total }
}

export interface Ev { t: number; kind: 'click' | 'accent' | 'breaths' | 'resume' | 'switch'; cycle: number; count: number }

/** All audio/voice events with time in [from, to). */
export function events(from: number, to: number, c: CprCfg): Ev[] {
  const out: Ev[] = []
  const period = 60 / c.bpm
  const ci = cycleInfo(c)
  if (!Number.isFinite(ci.total)) {
    for (let n = Math.ceil(from / period - 1e-9); n * period < to; n++) out.push({ t: n * period, kind: (n % 10 === 0 ? 'accent' : 'click'), cycle: 1, count: n + 1 })
  } else {
    for (let k = Math.max(0, Math.floor(from / ci.total)); k * ci.total < to; k++) {
      const t0 = k * ci.total
      for (let n = 0; n < c.compressions; n++) {
        const t = t0 + n * period
        if (t >= from && t < to) out.push({ t, kind: n === 0 || (n + 1) % 10 === 0 ? 'accent' : 'click', cycle: k + 1, count: n + 1 })
      }
      const tb = t0 + c.compressions * period
      if (tb >= from && tb < to) out.push({ t: tb, kind: 'breaths', cycle: k + 1, count: 0 })
      const tr = t0 + ci.total - Math.min(1, ci.pause / 2)
      if (k >= 0 && tr >= from && tr < to) out.push({ t: tr, kind: 'resume', cycle: k + 2, count: 0 })
    }
  }
  if (c.switchEvery > 0) for (let m = Math.max(1, Math.ceil(from / c.switchEvery)); m * c.switchEvery < to; m++) out.push({ t: m * c.switchEvery, kind: 'switch', cycle: 0, count: 0 })
  return out.sort((a, b) => a.t - b.t)
}

/** Trainee feedback from tap times (ms): rate, share of intervals inside 100–120/min, and steadiness. */
export function tapFeedback(times: number[]) {
  const iv: number[] = []
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1]
    if (d > 250 && d < 1500) iv.push(d) // ignore pauses for breaths and double taps
  }
  if (iv.length < 3) return null
  const recent = iv.slice(-20)
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length)
  const inRange = recent.filter((d) => d >= 500 && d <= 600).length / recent.length
  const rate = 60000 / mean
  const verdict = rate < 100 ? 'Too slow — push faster.' : rate > 120 ? 'Too fast — allow full recoil.' : sd > 60 ? 'Rate OK but uneven — follow the click.' : 'Good rate and rhythm.'
  return { rate, sd, inRange, n: recent.length, verdict, good: rate >= 100 && rate <= 120 && sd <= 60 }
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
