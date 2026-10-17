// Univariate outlier detection: Tukey IQR fences, z-score and modified z-score (MAD).
import { detectDelimiter, parseCsv } from './csv-json-converter'

export type Method = 'iqr' | 'z' | 'mad'
export interface ColStats {
  name: string; index: number; n: number; mean: number; sd: number; min: number; q1: number; median: number; q3: number; max: number
  iqr: number; lo: number; hi: number; mad: number
}
export interface Flag { row: number; col: number; value: number; score: number; reason: string }

/** Quantile with linear interpolation (type 7, as in R/Excel QUARTILE.INC). */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const i = Math.floor(pos), f = pos - i
  return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i]
}

export const toNum = (s: string): number => {
  const t = s.trim().replace(/[\s,](?=\d{3}\b)/g, '').replace(/^\$|%$/g, '')
  return t === '' ? NaN : Number(t)
}

export function columnStats(name: string, index: number, vals: number[], k: number): ColStats {
  const v = vals.filter(Number.isFinite)
  const s = [...v].sort((a, b) => a - b)
  const n = v.length
  const mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), median = quantile(s, 0.5)
  const iqr = q3 - q1
  const dev = v.map((x) => Math.abs(x - median)).sort((a, b) => a - b)
  return { name, index, n, mean, sd, min: s[0], q1, median, q3, max: s[n - 1], iqr, lo: q1 - k * iqr, hi: q3 + k * iqr, mad: quantile(dev, 0.5) }
}

/** Score for one value (|z|, |modified z| or distance beyond fence in IQRs). */
export function score(x: number, st: ColStats, m: Method): number {
  if (m === 'z') return st.sd ? Math.abs(x - st.mean) / st.sd : 0
  if (m === 'mad') return st.mad ? (0.6745 * Math.abs(x - st.median)) / st.mad : 0
  const d = x < st.q1 ? st.q1 - x : x > st.q3 ? x - st.q3 : 0
  return st.iqr ? d / st.iqr : 0
}

export function isOutlier(x: number, st: ColStats, m: Method, thr: number): boolean {
  if (!Number.isFinite(x)) return false
  if (m === 'iqr') return x < st.lo || x > st.hi
  return score(x, st, m) > thr
}

export interface Dataset { head: string[]; rows: string[][]; numeric: number[] }

export function loadCsv(text: string): Dataset {
  const all = parseCsv(text, detectDelimiter(text)).filter((r) => r.some((c) => c.trim() !== ''))
  const head = (all[0] ?? []).map((h, i) => h.trim() || `col${i + 1}`)
  const rows = all.slice(1).map((r) => head.map((_, i) => r[i] ?? ''))
  const numeric = head
    .map((_, i) => i)
    .filter((i) => {
      const filled = rows.filter((r) => r[i].trim() !== '')
      return filled.length >= 3 && filled.filter((r) => Number.isFinite(toNum(r[i]))).length / filled.length >= 0.9
    })
  return { head, rows, numeric }
}

export function detect(ds: Dataset, cols: number[], m: Method, thr: number, k: number) {
  const stats = cols.map((c) => columnStats(ds.head[c], c, ds.rows.map((r) => toNum(r[c])), k))
  const flags: Flag[] = []
  ds.rows.forEach((r, ri) => stats.forEach((st) => {
    const x = toNum(r[st.index])
    if (isOutlier(x, st, m, thr)) {
      const sc = score(x, st, m)
      const reason = m === 'iqr' ? (x < st.lo ? `below ${round(st.lo)}` : `above ${round(st.hi)}`) : `${m === 'z' ? '|z|' : '|Mz|'} = ${sc.toFixed(2)}`
      flags.push({ row: ri, col: st.index, value: x, score: sc, reason })
    }
  }))
  return { stats, flags }
}
const round = (x: number) => Number(x.toPrecision(5))

/** Sample sensor/sales-like dataset with planted anomalies. */
export function sampleCsv(): string {
  let seed = 987654321
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
  const lines = ['date,store,temperature_c,orders,basket_eur,returns']
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    let t = 21 + gauss() * 0.8, o = Math.round(120 + gauss() * 14), b = 38 + gauss() * 5, r = Math.max(0, Math.round(4 + gauss() * 1.5))
    if (i === 12) t = 34.5
    if (i === 27) o = 310
    if (i === 41) b = 4.2
    if (i === 50) { r = 19; o = 41 }
    if (i === 33) t = 9.8
    lines.push(`${d},${['North', 'South', 'East'][i % 3]},${t.toFixed(1)},${o},${b.toFixed(2)},${r}`)
  }
  return lines.join('\n')
}
