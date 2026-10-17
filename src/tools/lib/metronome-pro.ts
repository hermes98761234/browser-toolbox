// Pure helpers for the metronome: bar layout, tap tempo, tempo markings.

export type Level = 0 | 1 | 2 // mute, normal, accent

export interface Tick {
  at: number // fraction of the bar, 0 ≤ at < 1
  layer: 'main' | 'sub' | 'poly'
  beat: number // main beat index (or poly index for the poly layer)
  level: number // 0..1 gain
}

/** All clicks in one bar: main beats, subdivisions and an optional polyrhythm layer. */
export function barTicks(accents: Level[], sub: number, poly: number): Tick[] {
  const B = accents.length
  const out: Tick[] = []
  for (let b = 0; b < B; b++) {
    const lv = accents[b]
    out.push({ at: b / B, layer: 'main', beat: b, level: lv === 2 ? 1 : lv === 1 ? 0.7 : 0 })
    for (let k = 1; k < sub; k++) out.push({ at: (b + k / sub) / B, layer: 'sub', beat: b, level: lv === 0 ? 0 : 0.35 })
  }
  if (poly > 0) for (let j = 0; j < poly; j++) out.push({ at: j / poly, layer: 'poly', beat: j, level: j === 0 ? 0.9 : 0.6 })
  return out.sort((a, b) => a.at - b.at)
}

/** Seconds per bar when `bpm` counts the beat unit. */
export const barSeconds = (bpm: number, beats: number) => (60 / bpm) * beats

/** BPM from tap timestamps (ms). Uses the median of the last intervals; resets after a 2 s gap. */
export function tapBpm(times: number[]): number | null {
  let start = 0
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > 2000) start = i
  const t = times.slice(Math.max(start, times.length - 9))
  if (t.length < 2) return null
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  const m = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2
  return Math.round(60000 / m)
}

const MARKS: [number, string][] = [
  [24, 'Larghissimo'], [40, 'Grave'], [55, 'Largo'], [66, 'Adagio'], [76, 'Adagietto'], [92, 'Andante'], [108, 'Moderato'],
  [120, 'Allegretto'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo'],
]
export const tempoName = (bpm: number) => MARKS.find(([lim]) => bpm < lim)![1]

/** Trainer: tempo after `bars` completed bars, stepping `step` BPM every `every` bars up to `target`. */
export function trainerBpm(start: number, target: number, step: number, every: number, bars: number): number {
  if (every <= 0 || step === 0) return start
  const n = Math.floor(bars / every)
  const v = start + n * step
  return step > 0 ? Math.min(target, v) : Math.max(target, v)
}
