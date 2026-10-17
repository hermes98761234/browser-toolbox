// Informational car seat stage logic following the general stages published by the American
// Academy of Pediatrics (AAP) and NHTSA: rear-facing as long as possible → forward-facing with
// harness → belt-positioning booster → adult seat belt when it fits (≈ 4 ft 9 in, 8–12 years);
// back seat until 13. Seat limits come from the specific seat's manual and always win.

export type Stage = 'rear' | 'forward' | 'booster' | 'belt'

export interface Child { ageMonths: number; weightLb: number; heightIn: number }
export interface Limits { rearMaxLb: number; rearMaxIn: number; harnessMaxLb: number; harnessMaxIn: number }
export const DEFAULT_LIMITS: Limits = { rearMaxLb: 40, rearMaxIn: 40, harnessMaxLb: 65, harnessMaxIn: 49 }

export const BELT_HEIGHT_IN = 57 // 4 ft 9 in
export const BACK_SEAT_UNTIL = 13 * 12

export interface Advice { stage: Stage; reasons: string[]; warnings: string[]; next: string }

/** `beltFit` = the child passes all five steps of the seat-belt fit test in this vehicle. */
export function advise(c: Child, l: Limits, beltFit: boolean): Advice {
  const reasons: string[] = []
  const warnings: string[] = []
  const outRear = c.weightLb > l.rearMaxLb || c.heightIn > l.rearMaxIn
  const outHarness = c.weightLb > l.harnessMaxLb || c.heightIn > l.harnessMaxIn
  const years = c.ageMonths / 12

  if (!outRear) {
    reasons.push(`Still within the rear-facing limits of the seat (${l.rearMaxLb} lb, ${l.rearMaxIn} in).`, 'AAP: keep children rear-facing as long as possible, until they reach the seat’s highest rear-facing weight or height.')
    if (c.ageMonths < 12) reasons.push('NHTSA: children under 1 year should always ride rear-facing.')
    return { stage: 'rear', reasons, warnings, next: `Forward-facing with a harness only after exceeding ${l.rearMaxLb} lb or ${l.rearMaxIn} in (check the seat’s own rule for head clearance).` }
  }
  if (!outHarness) {
    reasons.push('Has outgrown the rear-facing limits of this seat.', `Within the harness limits (${l.harnessMaxLb} lb, ${l.harnessMaxIn} in) — keep using the 5-point harness as long as possible.`)
    if (c.ageMonths < 24) warnings.push('Under 2 years and over the rear-facing limits: many convertible seats rear-face to 40–50 lb. Consider a seat with higher rear-facing limits.')
    if (c.ageMonths < 12) warnings.push('Infants under 1 year should not ride forward-facing. Use a seat rated for this size rear-facing.')
    return { stage: 'forward', reasons, warnings, next: `Booster only after exceeding the harness limits (${l.harnessMaxLb} lb or ${l.harnessMaxIn} in, or shoulders above the top harness slots).` }
  }
  if (c.heightIn >= BELT_HEIGHT_IN && years >= 8 && beltFit) {
    reasons.push('At least 4 ft 9 in (145 cm) tall and passes the 5-step belt-fit test in this vehicle.', 'The lap belt sits low on the thighs and the shoulder belt crosses the chest — the adult belt now fits.')
    if (c.ageMonths < BACK_SEAT_UNTIL) reasons.push('Keep riding in the back seat until age 13.')
    return { stage: 'belt', reasons, warnings, next: 'Re-check the belt fit in every vehicle — fit differs between cars and seating positions.' }
  }
  reasons.push('Has outgrown the forward-facing harness limits.', 'Use a belt-positioning booster until the vehicle seat belt fits properly (usually at 4 ft 9 in / 145 cm, between 8 and 12 years).')
  if (years < 4) warnings.push('Most boosters require at least 4 years and 40 lb. A seat with higher harness limits is the safer choice for a young child.')
  if (c.heightIn >= BELT_HEIGHT_IN && !beltFit) reasons.push('Tall enough for the belt, but it doesn’t pass the 5-step test yet — keep the booster.')
  return { stage: 'booster', reasons, warnings, next: 'Move to the seat belt when the child is ≈ 4 ft 9 in and passes all five steps of the belt-fit test.' }
}

export const lbToKg = (lb: number) => lb * 0.45359237
export const kgToLb = (kg: number) => kg / 0.45359237
export const inToCm = (i: number) => i * 2.54
export const cmToIn = (cm: number) => cm / 2.54
