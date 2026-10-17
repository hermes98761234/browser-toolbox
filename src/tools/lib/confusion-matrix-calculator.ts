// Classification metrics from a confusion matrix (rows = actual class, columns = predicted class).

export interface ClassMetrics {
  label: string
  tp: number
  fp: number
  fn: number
  tn: number
  support: number
  predicted: number
  precision: number
  recall: number
  f1: number
  fbeta: number
  specificity: number
}

export interface Metrics {
  n: number
  accuracy: number
  balancedAccuracy: number
  kappa: number
  mcc: number
  perClass: ClassMetrics[]
  macro: { precision: number; recall: number; f1: number; fbeta: number }
  weighted: { precision: number; recall: number; f1: number; fbeta: number }
  micro: { precision: number; recall: number; f1: number }
}

const div = (a: number, b: number) => (b === 0 ? NaN : a / b)
const fb = (p: number, r: number, beta: number) => {
  const b2 = beta * beta
  return p + r === 0 || !Number.isFinite(p) || !Number.isFinite(r) ? (p === 0 && r === 0 ? 0 : NaN) : ((1 + b2) * p * r) / (b2 * p + r)
}
/** Mean that skips undefined (NaN) entries, like sklearn's zero_division handling would warn about. */
const mean = (xs: number[]) => {
  const ok = xs.filter(Number.isFinite)
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN
}

export function computeMetrics(m: number[][], labels: string[], beta = 1): Metrics {
  const k = m.length
  const rowSum = m.map((r) => r.reduce((a, b) => a + b, 0))
  const colSum = Array.from({ length: k }, (_, j) => m.reduce((a, r) => a + (r[j] ?? 0), 0))
  const n = rowSum.reduce((a, b) => a + b, 0)
  const diag = m.reduce((a, r, i) => a + (r[i] ?? 0), 0)
  const perClass: ClassMetrics[] = m.map((r, i) => {
    const tp = r[i] ?? 0
    const fn = rowSum[i] - tp
    const fp = colSum[i] - tp
    const tn = n - tp - fn - fp
    const precision = div(tp, tp + fp)
    const recall = div(tp, tp + fn)
    return {
      label: labels[i] ?? `Class ${i + 1}`, tp, fp, fn, tn, support: rowSum[i], predicted: colSum[i],
      precision, recall, f1: fb(precision, recall, 1), fbeta: fb(precision, recall, beta), specificity: div(tn, tn + fp),
    }
  })
  const accuracy = div(diag, n)
  const pe = n ? rowSum.reduce((a, r, i) => a + r * colSum[i], 0) / (n * n) : NaN
  const kappa = div(accuracy - pe, 1 - pe)
  // Multiclass MCC (Gorodkin's R_K statistic)
  const sPP = colSum.reduce((a, p) => a + p * p, 0)
  const sTT = rowSum.reduce((a, t) => a + t * t, 0)
  const sPT = rowSum.reduce((a, t, i) => a + t * colSum[i], 0)
  const denom = Math.sqrt((n * n - sPP) * (n * n - sTT))
  const mcc = denom === 0 ? 0 : (diag * n - sPT) / denom
  const w = (f: (c: ClassMetrics) => number) => {
    let s = 0
    for (const c of perClass) if (Number.isFinite(f(c))) s += f(c) * c.support
    return div(s, n)
  }
  const microP = div(diag, n)
  return {
    n, accuracy, kappa, mcc,
    balancedAccuracy: mean(perClass.filter((c) => c.support > 0).map((c) => c.recall)),
    perClass,
    macro: { precision: mean(perClass.map((c) => c.precision)), recall: mean(perClass.map((c) => c.recall)), f1: mean(perClass.map((c) => c.f1)), fbeta: mean(perClass.map((c) => c.fbeta)) },
    weighted: { precision: w((c) => c.precision), recall: w((c) => c.recall), f1: w((c) => c.f1), fbeta: w((c) => c.fbeta) },
    micro: { precision: microP, recall: microP, f1: microP },
  }
}

export interface BinaryMetrics {
  prevalence: number
  tpr: number
  tnr: number
  ppv: number
  npv: number
  fpr: number
  fnr: number
  fdr: number
  lrPlus: number
  lrMinus: number
  dor: number
  informedness: number
  markedness: number
}

/** Extra statistics for a 2×2 table with the positive class first (row/col 0). */
export function binaryMetrics(tp: number, fn: number, fp: number, tn: number): BinaryMetrics {
  const n = tp + fn + fp + tn
  const tpr = div(tp, tp + fn), tnr = div(tn, tn + fp), ppv = div(tp, tp + fp), npv = div(tn, tn + fn)
  const fpr = 1 - tnr, fnr = 1 - tpr
  const lrPlus = div(tpr, fpr), lrMinus = div(fnr, tnr)
  return {
    prevalence: div(tp + fn, n), tpr, tnr, ppv, npv, fpr, fnr, fdr: 1 - ppv,
    lrPlus, lrMinus, dor: div(lrPlus, lrMinus), informedness: tpr + tnr - 1, markedness: ppv + npv - 1,
  }
}

/** Builds a matrix from "actual,predicted" lines (comma, tab, semicolon or whitespace separated). */
export function matrixFromPairs(text: string): { labels: string[]; m: number[][]; pairs: number; skipped: number } {
  const pairs: [string, string][] = []
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const parts = t.split(/\s*[,;\t]\s*|\s+/).filter(Boolean)
    if (parts.length < 2) {
      skipped++
      continue
    }
    pairs.push([parts[0], parts[1]])
  }
  // drop a header row like "actual,predicted"
  if (pairs.length && /^(actual|true|y_true|label|truth)$/i.test(pairs[0][0])) pairs.shift()
  const set = new Set<string>()
  for (const [a, p] of pairs) {
    set.add(a)
    set.add(p)
  }
  const labels = [...set].sort((a, b) => (isFinite(Number(a)) && isFinite(Number(b)) ? Number(a) - Number(b) : a.localeCompare(b)))
  const idx = new Map(labels.map((l, i) => [l, i]))
  const m = labels.map(() => labels.map(() => 0))
  for (const [a, p] of pairs) m[idx.get(a)!][idx.get(p)!]++
  return { labels, m, pairs: pairs.length, skipped }
}
