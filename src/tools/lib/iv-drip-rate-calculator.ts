// IV infusion maths. Volumes in mL, times in minutes, drop factor in gtt/mL.

/** mL/hr from volume and duration. */
export const mlPerHour = (volume: number, minutes: number) => (minutes > 0 ? (volume * 60) / minutes : NaN)

/** Drops per minute = volume (mL) × drop factor (gtt/mL) ÷ time (min). */
export const gttPerMin = (mlHr: number, dropFactor: number) => (mlHr * dropFactor) / 60

/** Infusion duration in minutes at a given mL/hr. */
export const durationMin = (volume: number, mlHr: number) => (mlHr > 0 ? (volume * 60) / mlHr : NaN)

/** mL/hr from gtt/min (gravity set counted at the bedside). */
export const mlHrFromGtt = (gtt: number, dropFactor: number) => (dropFactor > 0 ? (gtt * 60) / dropFactor : NaN)

/**
 * Weight-based dose → mL/hr.
 * dose in `unit` per kg per minute (mcg/kg/min) or per hour; concentration = drug amount (mg) / bag volume (mL).
 */
export function doseToMlHr(dose: number, doseUnit: 'mcg/kg/min' | 'mg/kg/hr' | 'mcg/min' | 'mg/hr' | 'units/hr', weightKg: number, drugAmount: number, bagMl: number) {
  const conc = drugAmount / bagMl // per mL, in the drug amount's unit (mg, or units)
  if (!(conc > 0)) return NaN
  switch (doseUnit) {
    case 'mcg/kg/min':
      return (dose * weightKg * 60) / 1000 / conc
    case 'mg/kg/hr':
      return (dose * weightKg) / conc
    case 'mcg/min':
      return (dose * 60) / 1000 / conc
    case 'mg/hr':
    case 'units/hr':
      return dose / conc
  }
}

/** Rounds gtt/min the way it is counted on a gravity set (whole drops). */
export const roundDrops = (g: number) => Math.round(g)

/** "2 h 05 min" */
export function hm(min: number) {
  if (!Number.isFinite(min)) return '—'
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
