// Serum anion gap, albumin-corrected gap (Figge), delta gap and delta ratio. Electrolytes in mmol/L (= mEq/L).

export interface AgInput {
  na: number
  cl: number
  hco3: number
  k?: number // included only when given
  albumin?: number // g/dL
  normalAlbumin?: number // g/dL, default 4.0
  normalAg?: number // mmol/L, default 12 (without K)
  normalHco3?: number // default 24
}

export interface AgResult {
  ag: number
  corrected: number | null
  used: number // the gap used for delta calculations (corrected when albumin is known)
  deltaGap: number
  deltaRatio: number | null // null when HCO3 is not below normal
  interpretation: string
  level: 'low' | 'normal' | 'high'
}

export function anionGap(p: AgInput): AgResult {
  const ag = p.na + (p.k ?? 0) - (p.cl + p.hco3)
  const normAlb = p.normalAlbumin ?? 4
  const corrected = p.albumin !== undefined && p.albumin > 0 ? ag + 2.5 * (normAlb - p.albumin) : null
  const used = corrected ?? ag
  const nAg = p.normalAg ?? 12
  const nH = p.normalHco3 ?? 24
  const dAg = used - nAg
  const dH = nH - p.hco3
  const deltaGap = dAg - dH
  const deltaRatio = dH > 0 ? dAg / dH : null
  const level = used > nAg + 4 ? 'high' : used < nAg - 6 ? 'low' : 'normal'
  let interpretation: string
  if (level === 'high') {
    if (deltaRatio === null) interpretation = 'High anion gap with normal or high bicarbonate: suggests a high anion gap acidosis combined with a metabolic alkalosis.'
    else if (deltaRatio < 0.4) interpretation = 'Delta ratio < 0.4: hyperchloremic (normal gap) acidosis predominates.'
    else if (deltaRatio < 0.8) interpretation = 'Delta ratio 0.4–0.8: combined high anion gap and normal anion gap metabolic acidosis.'
    else if (deltaRatio <= 2) interpretation = 'Delta ratio 0.8–2: pure high anion gap metabolic acidosis (lactic acidosis typically ~1.6, ketoacidosis ~1).'
    else interpretation = 'Delta ratio > 2: high anion gap acidosis plus a concurrent metabolic alkalosis (or pre-existing compensated respiratory acidosis).'
  } else if (level === 'low') interpretation = 'Low anion gap: consider lab error, hypoalbuminaemia (if uncorrected), paraproteinaemia (IgG myeloma), lithium, bromide or iodide.'
  else if (dH >= 4) interpretation = 'Normal anion gap with low bicarbonate: suggests a hyperchloremic (normal gap) metabolic acidosis, e.g. diarrhoea or renal tubular acidosis.'
  else interpretation = 'Anion gap within the reference range.'
  return { ag, corrected, used, deltaGap, deltaRatio, interpretation, level }
}

/** g/L → g/dL */
export const albuminToGdl = (v: number, unit: 'g/dL' | 'g/L') => (unit === 'g/L' ? v / 10 : v)
