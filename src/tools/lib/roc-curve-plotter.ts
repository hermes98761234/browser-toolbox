// ROC / precision-recall curves from classifier scores: threshold sweep, trapezoidal AUC, average precision.

export interface CurvePoint {
  thr: number
  tp: number
  fp: number
  tpr: number
  fpr: number
  precision: number
}

export interface Model {
  name: string
  scores: number[]
}

export interface Dataset {
  labels: number[]
  models: Model[]
  errors: string[]
}

const POS = new Set(['1', 'true', 'yes', 'y', 'pos', 'positive', 't'])
const NEG = new Set(['0', 'false', 'no', 'n', 'neg', 'negative', 'f', '-1'])

export function parseLabel(s: string): number | null {
  const v = s.trim().toLowerCase()
  if (POS.has(v)) return 1
  if (NEG.has(v)) return 0
  return null
}

/** CSV/TSV with a label column and one or more score columns (header optional). */
export function parseData(text: string): Dataset {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/[,;\t]|\s+/).map((c) => c.trim().replace(/^"|"$/g, '')))
  const errors: string[] = []
  if (!rows.length) return { labels: [], models: [], errors: ['No data'] }
  const numericRow = (r: string[]) => r.every((c) => c !== '' && (Number.isFinite(Number(c)) || parseLabel(c) !== null))
  let header: string[] | null = null
  if (!numericRow(rows[0])) header = rows.shift()!
  const width = Math.max(0, ...rows.map((r) => r.length))
  let li = 0
  if (header) {
    const h = header.findIndex((c) => /^(label|y|target|class|truth|actual|true)$/i.test(c))
    if (h >= 0) li = h
  }
  const scoreCols = [...Array(width).keys()].filter((c) => c !== li)
  const labels: number[] = []
  const models: Model[] = scoreCols.map((c, i) => ({ name: header?.[c] || (scoreCols.length > 1 ? `Model ${i + 1}` : 'Model'), scores: [] }))
  rows.forEach((r, i) => {
    const lab = parseLabel(r[li] ?? '')
    const sc = scoreCols.map((c) => Number(r[c]))
    if (lab === null) return void errors.push(`Row ${i + 1}: label "${r[li]}" is not 0/1`)
    if (sc.some((x) => !Number.isFinite(x))) return void errors.push(`Row ${i + 1}: score is not a number`)
    labels.push(lab)
    sc.forEach((x, j) => models[j].scores.push(x))
  })
  if (!scoreCols.length) errors.push('Need at least one score column next to the label column')
  return { labels, models, errors }
}

/** Sweeps every distinct threshold from high to low; predicted positive when score ≥ thr. */
export function rocCurve(scores: number[], labels: number[]): CurvePoint[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a])
  const P = labels.reduce((a, l) => a + l, 0)
  const N = labels.length - P
  const pts: CurvePoint[] = [{ thr: Infinity, tp: 0, fp: 0, tpr: 0, fpr: 0, precision: 1 }]
  let tp = 0, fp = 0
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]
    if (labels[i]) tp++
    else fp++
    if (k + 1 < idx.length && scores[idx[k + 1]] === scores[i]) continue // ties move together
    pts.push({ thr: scores[i], tp, fp, tpr: P ? tp / P : 0, fpr: N ? fp / N : 0, precision: tp + fp ? tp / (tp + fp) : 1 })
  }
  return pts
}

/** Area under the ROC curve (trapezoidal rule). */
export function rocAuc(pts: CurvePoint[]): number {
  let a = 0
  for (let i = 1; i < pts.length; i++) a += ((pts[i].fpr - pts[i - 1].fpr) * (pts[i].tpr + pts[i - 1].tpr)) / 2
  return a
}

/** Average precision: Σ (Rₙ − Rₙ₋₁) Pₙ (step interpolation, as scikit-learn). */
export function averagePrecision(pts: CurvePoint[]): number {
  let ap = 0
  for (let i = 1; i < pts.length; i++) ap += (pts[i].tpr - pts[i - 1].tpr) * pts[i].precision
  return ap
}

/** Area under the PR curve by trapezoids (optimistic compared with AP). */
export function prAuc(pts: CurvePoint[]): number {
  let a = 0
  for (let i = 2; i < pts.length; i++) a += ((pts[i].tpr - pts[i - 1].tpr) * (pts[i].precision + pts[i - 1].precision)) / 2
  if (pts.length > 1) a += pts[1].tpr * pts[1].precision
  return a
}

export interface Confusion {
  tp: number
  fp: number
  tn: number
  fn: number
  tpr: number
  fpr: number
  tnr: number
  precision: number
  accuracy: number
  f1: number
  mcc: number
}

export function confusion(scores: number[], labels: number[], thr: number): Confusion {
  let tp = 0, fp = 0, tn = 0, fn = 0
  scores.forEach((s, i) => {
    const pred = s >= thr
    if (labels[i] && pred) tp++
    else if (labels[i]) fn++
    else if (pred) fp++
    else tn++
  })
  const d = (a: number, b: number) => (b ? a / b : 0)
  const precision = d(tp, tp + fp), tpr = d(tp, tp + fn)
  const den = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
  return {
    tp, fp, tn, fn, tpr, precision,
    fpr: d(fp, fp + tn),
    tnr: d(tn, fp + tn),
    accuracy: d(tp + tn, scores.length),
    f1: d(2 * precision * tpr, precision + tpr),
    mcc: den ? (tp * tn - fp * fn) / den : 0,
  }
}

/** Threshold maximising Youden's J = TPR − FPR. */
export function youden(pts: CurvePoint[]): CurvePoint {
  return pts.slice(1).reduce((b, p) => (p.tpr - p.fpr > b.tpr - b.fpr ? p : b), pts[Math.min(1, pts.length - 1)])
}

/** Deterministic sample: Gaussian scores per class squashed to (0,1). */
export function sampleCsv(n = 300, seed = 7): string {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const sig = (x: number) => 1 / (1 + Math.exp(-x))
  const lines = ['label,gradient_boost,logistic,baseline']
  for (let i = 0; i < n; i++) {
    const y = rnd() < 0.35 ? 1 : 0
    const z = gauss()
    const s1 = sig((y ? 1.3 : -1.3) + 1.1 * z)
    const s2 = sig((y ? 0.75 : -0.75) + 0.9 * gauss() + 0.3 * z)
    const s3 = sig((y ? 0.2 : -0.2) + gauss())
    lines.push(`${y},${s1.toFixed(4)},${s2.toFixed(4)},${s3.toFixed(4)}`)
  }
  return lines.join('\n')
}
