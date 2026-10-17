// Weight-based dose arithmetic: mg/kg → mg → mL (or tablets), with caps and rounding.

export interface DoseInput {
  weight: number // kg
  dosePerKg: number // in `unit` per kg
  unit: 'mg' | 'mcg'
  basis: 'dose' | 'day' // per single dose, or per day divided into `freq` doses
  freq: number // doses per day
  maxSingle: number // mg (0 = none)
  maxDaily: number // mg (0 = none)
  form: 'liquid' | 'tablet'
  concAmount: number // mg in concVolume mL (liquid) or mg per tablet
  concVolume: number // mL
  round: number // mL step (liquid) or tablet fraction (1, 0.5, 0.25)
}

export interface DoseResult {
  mgPerDoseRaw: number
  mgPerDose: number // after caps
  capped: '' | 'single' | 'daily'
  mgPerDay: number
  conc: number // mg per mL (or per tablet)
  amountRaw: number // mL or tablets
  amount: number // rounded
  deliveredMg: number
  deliveredPerKg: number // in input unit
  deviation: number // fraction vs intended (after caps)
  warnings: string[]
}

export const LB = 0.45359237

export function roundTo(x: number, step: number) {
  if (!(step > 0)) return x
  const r = Math.round(x / step) * step
  return +r.toFixed(6)
}

export function calcDose(i: DoseInput): DoseResult {
  const warnings: string[] = []
  const toMg = i.unit === 'mcg' ? 1 / 1000 : 1
  const freq = Math.max(1, Math.round(i.freq))
  const totalMgRaw = i.weight * i.dosePerKg * toMg
  let mgPerDose = i.basis === 'day' ? totalMgRaw / freq : totalMgRaw
  const mgPerDoseRaw = mgPerDose
  let capped: DoseResult['capped'] = ''
  if (i.maxSingle > 0 && mgPerDose > i.maxSingle) {
    mgPerDose = i.maxSingle
    capped = 'single'
  }
  if (i.maxDaily > 0 && mgPerDose * freq > i.maxDaily) {
    mgPerDose = i.maxDaily / freq
    capped = 'daily'
  }
  const conc = i.form === 'liquid' ? i.concAmount / (i.concVolume || NaN) : i.concAmount
  const amountRaw = mgPerDose / conc
  let amount = roundTo(amountRaw, i.round)
  if (amount === 0 && amountRaw > 0) {
    amount = i.round
    warnings.push('Rounding would give zero; the smallest measurable amount is shown — check the device or concentration.')
  }
  const deliveredMg = amount * conc
  const deviation = mgPerDose ? deliveredMg / mgPerDose - 1 : 0
  if (capped) warnings.push(capped === 'single' ? 'Weight-based dose exceeds the maximum single dose — capped.' : 'Daily total exceeds the maximum daily dose — reduced to fit.')
  if (Math.abs(deviation) > 0.1) warnings.push(`Rounding changes the delivered dose by ${(deviation * 100).toFixed(1)}% — consider a finer measuring step or another strength.`)
  if (i.weight > 150 || i.weight < 0.3) warnings.push('Unusual weight — re-check the value and unit (kg vs lb).')
  if (i.form === 'liquid' && amount > 0 && amount < 0.1) warnings.push('Volume below 0.1 mL is hard to measure accurately.')
  if (i.form === 'tablet' && amount > 4) warnings.push('More than 4 tablets per dose — is a higher strength available?')
  return {
    mgPerDoseRaw, mgPerDose, capped, mgPerDay: mgPerDose * freq, conc, amountRaw, amount, deliveredMg,
    deliveredPerKg: deliveredMg / (i.weight || NaN) / toMg, deviation, warnings,
  }
}

/** Independent check: does the re-entered amount match within half a rounding step (1% if no rounding)? */
export function matches(entered: number, expected: number, step: number) {
  return Number.isFinite(entered) && Math.abs(entered - expected) <= (step > 0 ? step / 2 : Math.abs(expected) * 0.01) + 1e-9
}
