// WHO hand hygiene technique: step lists and time schedules.

export type Method = 'wash' | 'rub'
export type Pose = 'wet' | 'soap' | 'palms' | 'backs' | 'interlace' | 'fingerbacks' | 'thumbs' | 'tips' | 'rinse' | 'dry' | 'tap' | 'drip'

export interface Step { pose: Pose; title: string; tip: string; weight: number }

/** WHO "How to handwash" (40–60 s) and "How to handrub" (20–30 s). Weights split the total time. */
export const STEPS: Record<Method, Step[]> = {
  wash: [
    { pose: 'wet', title: 'Wet your hands', tip: 'Use clean running water, warm or cold.', weight: 1 },
    { pose: 'soap', title: 'Apply soap', tip: 'Enough to cover all hand surfaces.', weight: 1 },
    { pose: 'palms', title: 'Palm to palm', tip: 'Rub hands palm to palm.', weight: 1 },
    { pose: 'backs', title: 'Backs of hands', tip: 'Right palm over left back with fingers interlaced, then swap.', weight: 1 },
    { pose: 'interlace', title: 'Between the fingers', tip: 'Palm to palm with fingers interlaced.', weight: 1 },
    { pose: 'fingerbacks', title: 'Backs of fingers', tip: 'Backs of fingers to opposing palms, fingers interlocked.', weight: 1 },
    { pose: 'thumbs', title: 'Thumbs', tip: 'Rotational rubbing of each thumb clasped in the other palm.', weight: 1 },
    { pose: 'tips', title: 'Fingertips', tip: 'Rub fingertips in circles in the opposite palm, both hands.', weight: 1 },
    { pose: 'rinse', title: 'Rinse', tip: 'Rinse hands thoroughly under running water.', weight: 1 },
    { pose: 'dry', title: 'Dry thoroughly', tip: 'Use a single-use towel or air dryer.', weight: 1 },
    { pose: 'tap', title: 'Turn off the tap', tip: 'Use the towel to turn off the tap. Your hands are now clean.', weight: 0.6 },
  ],
  rub: [
    { pose: 'drip', title: 'Fill your palm', tip: 'A palmful of alcohol-based rub covering all surfaces.', weight: 0.8 },
    { pose: 'palms', title: 'Palm to palm', tip: 'Rub hands palm to palm.', weight: 1 },
    { pose: 'backs', title: 'Backs of hands', tip: 'Right palm over left back with fingers interlaced, then swap.', weight: 1 },
    { pose: 'interlace', title: 'Between the fingers', tip: 'Palm to palm with fingers interlaced.', weight: 1 },
    { pose: 'fingerbacks', title: 'Backs of fingers', tip: 'Backs of fingers to opposing palms, fingers interlocked.', weight: 1 },
    { pose: 'thumbs', title: 'Thumbs', tip: 'Rotational rubbing of each thumb clasped in the other palm.', weight: 1 },
    { pose: 'tips', title: 'Fingertips', tip: 'Rub fingertips in circles in the opposite palm. Keep going until dry.', weight: 1.2 },
  ],
}

export const RANGE: Record<Method, [number, number, number]> = { wash: [40, 60, 50], rub: [20, 30, 25] } // min, max, default

export interface Slot { i: number; start: number; dur: number }

/** Splits `total` seconds across the steps by weight. */
export function schedule(steps: Step[], total: number): Slot[] {
  const W = steps.reduce((a, s) => a + s.weight, 0)
  let t = 0
  return steps.map((s, i) => {
    const dur = (total * s.weight) / W
    const slot = { i, start: t, dur }
    t += dur
    return slot
  })
}

/** Index of the step active at time t (seconds since start); steps.length when finished. */
export function stepAt(slots: Slot[], t: number): number {
  for (const s of slots) if (t < s.start + s.dur - 1e-9) return s.i
  return slots.length
}

/** Whole-second countdown text, e.g. 0:07. */
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec - 1e-9))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
