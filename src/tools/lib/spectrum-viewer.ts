// Spectroscopy data: JCAMP-DX (AFFN + ASDF SQZ/DIF/DUP) and CSV parsing, baseline, smoothing, normalisation, peaks.

export interface Spectrum { title: string; x: number[]; y: number[]; xUnits: string; yUnits: string; dataType: string; peaks?: [number, number][] }

const SQZ: Record<string, number> = { '@': 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, a: -1, b: -2, c: -3, d: -4, e: -5, f: -6, g: -7, h: -8, i: -9 }
const DIF: Record<string, number> = { '%': 0, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, j: -1, k: -2, l: -3, m: -4, n: -5, o: -6, p: -7, q: -8, r: -9 }
const DUP: Record<string, number> = { S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8, s: 9 }

const isAffn = (l: string) => /^[\s\d.,+\-Ee]+$/.test(l) && !/[Ee](?![+-]\d)/.test(l) && !/(^|[^\d.])[Ee]/.test(l)

/** Decodes one data line. Returns all numbers (first = abscissa) and whether it ended in DIF form. */
export function decodeLine(line: string): { vals: number[]; endsDif: boolean } {
  const l = line.replace(/\$\$.*$/, '').trim()
  if (!l) return { vals: [], endsDif: false }
  if (isAffn(l)) return { vals: (l.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g) ?? []).map(Number), endsDif: false }
  type Tok = { m: 'abs' | 'dif' | 'dup'; s: string }
  const toks: Tok[] = []
  let cur: Tok | null = null
  for (const ch of l) {
    if (ch === ' ' || ch === ',' || ch === '\t' || ch === ';') {
      cur = null
      continue
    }
    if (/[\d.]/.test(ch) && cur) {
      cur.s += ch
      continue
    }
    if (ch in SQZ) cur = { m: 'abs', s: String(SQZ[ch]) }
    else if (ch in DIF) cur = { m: 'dif', s: String(DIF[ch]) }
    else if (ch in DUP) cur = { m: 'dup', s: String(DUP[ch]) }
    else if (ch === '+' || ch === '-' || /[\d.]/.test(ch)) cur = { m: 'abs', s: ch === '+' ? '' : ch }
    else throw new Error(`Unexpected character “${ch}” in data line`)
    toks.push(cur)
  }
  const vals: number[] = []
  let lastMode: 'abs' | 'dif' = 'abs', lastDif = 0
  for (const t of toks) {
    const v = Number(t.s)
    if (t.m === 'abs') {
      vals.push(v)
      lastMode = 'abs'
    } else if (t.m === 'dif') {
      vals.push(vals[vals.length - 1] + v)
      lastDif = v
      lastMode = 'dif'
    } else {
      for (let k = 1; k < v; k++) vals.push(lastMode === 'dif' ? vals[vals.length - 1] + lastDif : vals[vals.length - 1])
    }
  }
  return { vals, endsDif: lastMode === 'dif' }
}

/** Parses every data block of a JCAMP-DX file (XYDATA=(X++(Y..Y)), XYPOINTS / PEAK TABLE=(XY..XY)). */
export function parseJcamp(text: string): Spectrum[] {
  const out: Spectrum[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let h: Record<string, string> = {}
  let mode: 'none' | 'xpp' | 'xy' | 'peaks' = 'none'
  let ys: number[] = [], firstXs: number[] = [], pairs: [number, number][] = []
  let prevDif = false
  const flush = () => {
    const num = (k: string, d: number) => (h[k] !== undefined && Number.isFinite(parseFloat(h[k])) ? parseFloat(h[k]) : d)
    const xf = num('XFACTOR', 1), yf = num('YFACTOR', 1)
    const base = { title: h['TITLE'] ?? 'Spectrum', xUnits: h['XUNITS'] ?? '', yUnits: h['YUNITS'] ?? '', dataType: h['DATA TYPE'] ?? h['DATATYPE'] ?? '' }
    if (mode === 'xpp' && ys.length) {
      const n = ys.length
      const fx = num('FIRSTX', firstXs[0] * xf), lx = num('LASTX', NaN)
      const dx = Number.isFinite(lx) && n > 1 ? (lx - fx) / (n - 1) : num('DELTAX', n > 1 && firstXs.length > 1 ? 0 : 1)
      out.push({ ...base, x: ys.map((_, i) => fx + i * dx), y: ys.map((v) => v * yf) })
    } else if (mode === 'xy' && pairs.length) {
      out.push({ ...base, x: pairs.map((p) => p[0] * xf), y: pairs.map((p) => p[1] * yf) })
    } else if (mode === 'peaks' && pairs.length) {
      const sp = { ...base, x: [] as number[], y: [] as number[], peaks: pairs.map((p) => [p[0] * xf, p[1] * yf] as [number, number]) }
      const last = out[out.length - 1]
      if (last && last.title === sp.title && !last.peaks) last.peaks = sp.peaks
      else out.push(sp)
    }
    mode = 'none'
    ys = []
    firstXs = []
    pairs = []
  }
  for (const raw of lines) {
    const line = raw.replace(/\$\$.*$/, '')
    const m = /^\s*##([^=]*)=(.*)$/.exec(line)
    if (m) {
      if (mode !== 'none') flush()
      const key = m[1].trim().toUpperCase().replace(/[\s_-]+/g, ' ').replace(/^\./, '.')
      const val = m[2].trim()
      if (key === 'TITLE') h = { TITLE: val || 'Spectrum' }
      else h[key] = val
      if (key === 'XYDATA' || key === 'DATA TABLE') {
        const v = val.replace(/\s/g, '').toUpperCase()
        if (v.includes('X++(Y..Y)') || v.includes('X++(R..R)')) mode = 'xpp'
        else if (v.includes('XY..XY')) mode = 'xy'
        else throw new Error(`Unsupported data table form “${val}”`)
        prevDif = false
      } else if (key === 'XYPOINTS') mode = 'xy'
      else if (key === 'PEAK TABLE') mode = 'peaks'
      else if (key === 'END') mode = 'none'
      continue
    }
    if (mode === 'xpp') {
      const { vals, endsDif } = decodeLine(line)
      if (vals.length < 1) continue
      firstXs.push(vals[0])
      let yv = vals.slice(1)
      if (prevDif && yv.length) yv = yv.slice(1) // Y-check value duplicates the previous line's last ordinate
      ys.push(...yv)
      prevDif = endsDif
    } else if (mode === 'xy' || mode === 'peaks') {
      const nums = (line.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g) ?? []).map(Number)
      for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]])
    }
  }
  if (mode !== 'none') flush()
  return out
}

/** Encodes ordinates as JCAMP DIFDUP lines (used for the sample file and tests). */
export function encodeDifDup(x0: number, dx: number, y: number[], perLine = 10): string[] {
  const sqz = (v: number) => {
    const s = String(Math.abs(v))
    const c = v < 0 ? 'abcdefghi'[Number(s[0]) - 1] : '@ABCDEFGHI'[Number(s[0])]
    return c + s.slice(1)
  }
  const dif = (v: number) => {
    const s = String(Math.abs(v))
    const c = v < 0 ? 'jklmnopqr'[Number(s[0]) - 1] : '%JKLMNOPQR'[Number(s[0])]
    return c + s.slice(1)
  }
  const dup = (n: number) => {
    const s = String(n)
    return 'STUVWXYZs'[Number(s[0]) - 1] + s.slice(1)
  }
  const lines: string[] = []
  for (let i = 0; i < y.length - 1; i += perLine) {
    const seg = y.slice(i, Math.min(y.length, i + perLine + 1)) // last value repeats as next line's check
    let s = `${+(x0 + i * dx).toFixed(6)}${sqz(seg[0])}`
    const d = seg.slice(1).map((v, k) => v - seg[k])
    for (let k = 0; k < d.length; ) {
      let n = 1
      while (k + n < d.length && d[k + n] === d[k]) n++
      s += dif(d[k]) + (n > 1 ? dup(n) : '')
      k += n
    }
    lines.push(s)
  }
  if (y.length === 1) lines.push(`${x0}${sqz(y[0])}`)
  return lines
}

/** CSV/TSV: first numeric column = x, every other numeric column = one spectrum. */
export function parseCsvSpectra(text: string, name = 'CSV'): Spectrum[] {
  const rows = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!rows.length) return []
  const sep = rows[0].includes('\t') ? '\t' : rows[0].includes(';') ? ';' : rows[0].includes(',') ? ',' : /\s+/
  const cells = rows.map((r) => r.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')))
  const header = cells[0].some((c) => c !== '' && !Number.isFinite(Number(c))) ? cells.shift()! : null
  const data = cells.filter((r) => r.length >= 2 && Number.isFinite(Number(r[0])))
  const cols = Math.max(...data.map((r) => r.length))
  const out: Spectrum[] = []
  for (let c = 1; c < cols; c++) {
    const pts = data.filter((r) => r[c] !== undefined && r[c] !== '' && Number.isFinite(Number(r[c]))).map((r) => [Number(r[0]), Number(r[c])])
    if (pts.length > 1) out.push({ title: header?.[c] || (cols > 2 ? `${name} #${c}` : name), x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), xUnits: header?.[0] ?? '', yUnits: '', dataType: '' })
  }
  return out
}

/** Asymmetric least squares baseline (Eilers & Boelens 2005): (W + λD'D) z = W y, iterated. */
export function alsBaseline(y: number[], lambda = 1e5, p = 0.01, iter = 10): number[] {
  const n = y.length
  if (n < 5) return y.slice()
  const w = new Array<number>(n).fill(1)
  let z = y.slice()
  // D'D for second differences: pentadiagonal with diagonals d0, d1, d2
  const d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n)
  for (let i = 0; i < n; i++) d0[i] = i === 0 || i === n - 1 ? 1 : i === 1 || i === n - 2 ? 5 : 6
  for (let i = 0; i < n - 1; i++) d1[i] = i === 0 || i === n - 2 ? -2 : -4
  for (let i = 0; i < n - 2; i++) d2[i] = 1
  for (let it = 0; it < iter; it++) {
    // banded LDLᵀ of A = W + λD'D (A[i][i]=a0, A[i+1][i]=a1, A[i+2][i]=a2)
    const D = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      D[i] = w[i] + lambda * d0[i] - (i >= 1 ? l1[i - 1] ** 2 * D[i - 1] : 0) - (i >= 2 ? l2[i - 2] ** 2 * D[i - 2] : 0)
      l1[i] = (lambda * d1[i] - (i >= 1 ? l2[i - 1] * l1[i - 1] * D[i - 1] : 0)) / D[i]
      l2[i] = (lambda * d2[i]) / D[i]
    }
    const u = new Float64Array(n)
    for (let i = 0; i < n; i++) u[i] = w[i] * y[i] - (i >= 1 ? l1[i - 1] * u[i - 1] : 0) - (i >= 2 ? l2[i - 2] * u[i - 2] : 0)
    const zz = new Float64Array(n)
    for (let i = n - 1; i >= 0; i--) zz[i] = u[i] / D[i] - (i + 1 < n ? l1[i] * zz[i + 1] : 0) - (i + 2 < n ? l2[i] * zz[i + 2] : 0)
    z = Array.from(zz)
    for (let i = 0; i < n; i++) w[i] = y[i] > z[i] ? p : 1 - p
  }
  return z
}

/** Iterative ("modpoly") polynomial baseline of the given degree. */
export function polyBaseline(x: number[], y: number[], degree = 3, iter = 50): number[] {
  const n = x.length
  const x0 = Math.min(...x), x1 = Math.max(...x)
  const t = x.map((v) => (2 * (v - x0)) / (x1 - x0 || 1) - 1)
  let yy = y.slice()
  let fit = y.slice()
  const d = Math.min(degree, n - 1)
  for (let it = 0; it < iter; it++) {
    // normal equations on Chebyshev-scaled x
    const m = d + 1
    const A = Array.from({ length: m }, () => new Array<number>(m + 1).fill(0))
    for (let i = 0; i < n; i++) {
      const pw = [1]
      for (let k = 1; k < m; k++) pw.push(pw[k - 1] * t[i])
      for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) A[r][c] += pw[r] * pw[c]
        A[r][m] += pw[r] * yy[i]
      }
    }
    for (let c = 0; c < m; c++) {
      let piv = c
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
      ;[A[c], A[piv]] = [A[piv], A[c]]
      for (let r = 0; r < m; r++) {
        if (r === c || !A[c][c]) continue
        const f = A[r][c] / A[c][c]
        for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k]
      }
    }
    const coef = A.map((r, i) => r[m] / (r[i] || 1))
    fit = t.map((v) => coef.reduce((s, c, k) => s + c * v ** k, 0))
    let changed = false
    yy = yy.map((v, i) => {
      if (v > fit[i]) {
        changed = true
        return fit[i]
      }
      return v
    })
    if (!changed) break
  }
  return fit
}

/** Savitzky–Golay quadratic/cubic smoothing (window odd ≥ 5). */
export function savgol(y: number[], window: number): number[] {
  const w = Math.max(5, window | 1), h = (w - 1) / 2
  // quadratic SG coefficients: c_i = (3(3h²+3h−1) − 15 i²) / ((2h+3)(2h+1)(2h−1))
  const den = (2 * h + 3) * (2 * h + 1) * (2 * h - 1)
  const c = Array.from({ length: w }, (_, k) => (3 * (3 * h * h + 3 * h - 1) - 15 * (k - h) ** 2) / den)
  return y.map((_, i) => {
    let s = 0
    for (let k = -h; k <= h; k++) s += c[k + h] * y[Math.min(y.length - 1, Math.max(0, i + k))]
    return s
  })
}

export type Norm = 'none' | 'max' | 'minmax' | 'area' | 'l2' | 'snv'
export function normalize(x: number[], y: number[], mode: Norm): number[] {
  if (mode === 'none' || !y.length) return y
  if (mode === 'max') {
    const m = Math.max(...y.map(Math.abs)) || 1
    return y.map((v) => v / m)
  }
  if (mode === 'minmax') {
    const lo = Math.min(...y), hi = Math.max(...y)
    return y.map((v) => (v - lo) / (hi - lo || 1))
  }
  if (mode === 'area') {
    let a = 0
    for (let i = 1; i < y.length; i++) a += Math.abs(x[i] - x[i - 1]) * (Math.abs(y[i]) + Math.abs(y[i - 1])) / 2
    return y.map((v) => v / (a || 1))
  }
  if (mode === 'l2') {
    const n = Math.hypot(...y) || 1
    return y.map((v) => v / n)
  }
  const mean = y.reduce((a, b) => a + b, 0) / y.length
  const sd = Math.sqrt(y.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, y.length - 1)) || 1
  return y.map((v) => (v - mean) / sd)
}

export interface Peak { x: number; y: number; prominence: number; fwhm: number; i: number }

/** Local maxima (or minima when `down`) with topographic prominence ≥ minProm·range, separated by ≥ minDist points. */
export function findPeaks(x: number[], y0: number[], minProm = 0.05, minDist = 3, down = false): Peak[] {
  const y = down ? y0.map((v) => -v) : y0
  const n = y.length
  const range = Math.max(...y) - Math.min(...y) || 1
  const cand: Peak[] = []
  for (let i = 1; i < n - 1; i++) {
    if (!(y[i] > y[i - 1] && y[i] >= y[i + 1])) continue
    let l = i, lm = y[i]
    while (l > 0 && y[l - 1] <= y[i]) lm = Math.min(lm, y[--l])
    let r = i, rm = y[i]
    while (r < n - 1 && y[r + 1] <= y[i]) rm = Math.min(rm, y[++r])
    const prom = y[i] - Math.max(lm, rm)
    if (prom < minProm * range) continue
    // parabolic refinement of the apex
    const a = y[i - 1], b = y[i], c = y[i + 1]
    const den = a - 2 * b + c
    const off = den ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0
    const xi = x[i] + off * (off > 0 ? x[i + 1] - x[i] : x[i] - x[i - 1])
    // FWHM at half prominence
    const half = y[i] - prom / 2
    let li = i, ri = i
    while (li > 0 && y[li] > half) li--
    while (ri < n - 1 && y[ri] > half) ri++
    const interp = (j: number, k: number) => (y[j] === y[k] ? x[j] : x[j] + ((half - y[j]) * (x[k] - x[j])) / (y[k] - y[j]))
    const fwhm = Math.abs(interp(ri, ri - 1) - interp(li, li + 1))
    cand.push({ x: xi, y: y0[i], prominence: prom, fwhm, i })
  }
  cand.sort((p, q) => q.prominence - p.prominence)
  const kept: Peak[] = []
  for (const p of cand) if (kept.every((k) => Math.abs(k.i - p.i) >= minDist)) kept.push(p)
  return kept.sort((p, q) => p.x - q.x)
}

/** Synthetic IR spectrum (%T, 4000→400 cm⁻¹) resembling ethyl acetate, plus a sloping baseline. */
export function sampleIr(): { x: number[]; t: number[] } {
  const bands: [number, number, number][] = [[2984, 0.35, 18], [2940, 0.2, 14], [1742, 0.95, 14], [1447, 0.25, 10], [1373, 0.45, 9], [1240, 0.9, 22], [1098, 0.4, 12], [1047, 0.55, 10], [938, 0.2, 8], [847, 0.15, 8], [634, 0.2, 10]]
  const x: number[] = [], t: number[] = []
  for (let w = 4000; w >= 400; w -= 2) {
    let a = 0.02 + 0.00002 * (4000 - w) // gentle baseline
    for (const [c, h, g] of bands) a += h / (1 + ((w - c) / g) ** 2)
    x.push(w)
    t.push(Math.round(100 * Math.pow(10, -a) * 100) / 100)
  }
  return { x, t }
}
