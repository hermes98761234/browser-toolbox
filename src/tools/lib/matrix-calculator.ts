// Dense matrix algebra for small matrices: elimination with step logs, LU, QR, Cholesky, eigenvalues.

export type Mat = number[][]
export interface Step {
  op: string
  M: Mat
}
export interface Complex {
  re: number
  im: number
}

const EPS = 1e-10
export const clone = (A: Mat): Mat => A.map((r) => [...r])
export const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
export const transpose = (A: Mat): Mat => (A[0] ?? []).map((_, j) => A.map((r) => r[j]))
export const isSquare = (A: Mat) => A.length > 0 && A.every((r) => r.length === A.length)
const clean = (x: number) => (Math.abs(x) < EPS ? 0 : Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x)
export const tidy = (A: Mat): Mat => A.map((r) => r.map(clean))

export function mul(A: Mat, B: Mat): Mat {
  if ((A[0]?.length ?? 0) !== B.length) throw new Error(`Cannot multiply ${A.length}×${A[0]?.length} by ${B.length}×${B[0]?.length}: inner sizes differ`)
  return A.map((r) => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)))
}
export function add(A: Mat, B: Mat, sign = 1): Mat {
  if (A.length !== B.length || A[0].length !== B[0].length) throw new Error('Matrices must have the same size')
  return A.map((r, i) => r.map((a, j) => a + sign * B[i][j]))
}
export const scale = (A: Mat, k: number): Mat => A.map((r) => r.map((a) => a * k))
export const trace = (A: Mat) => A.reduce((s, r, i) => s + (r[i] ?? 0), 0)

export function power(A: Mat, k: number): Mat {
  if (!isSquare(A)) throw new Error('Powers need a square matrix')
  if (k < 0) {
    const inv = inverse(A).inv
    if (!inv) throw new Error('Matrix is singular: negative powers do not exist')
    return power(inv, -k)
  }
  let R = identity(A.length), B = clone(A), e = Math.floor(k)
  while (e > 0) {
    if (e & 1) R = mul(R, B)
    B = mul(B, B)
    e >>= 1
  }
  return R
}

const fmtK = (k: number) => {
  const f = toFraction(Math.abs(k))
  return f
}

/** Reduced row echelon form with a log of row operations. */
export function rref(A: Mat, augCols = 0): { R: Mat; rank: number; pivots: number[]; steps: Step[] } {
  const M = clone(A)
  const rows = M.length, cols = (M[0]?.length ?? 0) - augCols
  const steps: Step[] = []
  const pivots: number[] = []
  let r = 0
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r
    for (let i = r + 1; i < rows; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < EPS) continue
    if (p !== r) {
      ;[M[p], M[r]] = [M[r], M[p]]
      steps.push({ op: `R${r + 1} ↔ R${p + 1}`, M: tidy(M) })
    }
    const pv = M[r][c]
    if (Math.abs(pv - 1) > EPS) {
      M[r] = M[r].map((x) => x / pv)
      steps.push({ op: `R${r + 1} ← R${r + 1} ÷ ${toFraction(pv)}`, M: tidy(M) })
    }
    for (let i = 0; i < rows; i++) {
      if (i === r || Math.abs(M[i][c]) < EPS) continue
      const f = M[i][c]
      M[i] = M[i].map((x, j) => x - f * M[r][j])
      steps.push({ op: `R${i + 1} ← R${i + 1} ${f > 0 ? '−' : '+'} ${fmtK(f)}·R${r + 1}`, M: tidy(M) })
    }
    pivots.push(c)
    r++
  }
  return { R: tidy(M), rank: pivots.length, pivots, steps }
}

/** Gauss–Jordan on [A | I]. */
export function inverse(A: Mat): { inv: Mat | null; steps: Step[] } {
  if (!isSquare(A)) throw new Error('Only square matrices have inverses')
  const n = A.length
  const aug = A.map((r, i) => [...r, ...identity(n)[i]])
  const { R, rank, steps } = rref(aug, n)
  if (rank < n) return { inv: null, steps }
  return { inv: R.map((r) => r.slice(n)), steps }
}

/** Determinant by elimination (row swaps flip the sign). */
export function det(A: Mat): { det: number; steps: Step[] } {
  if (!isSquare(A)) throw new Error('Determinants need a square matrix')
  const M = clone(A), n = M.length
  const steps: Step[] = []
  let sign = 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < EPS) {
      steps.push({ op: `Column ${c + 1} has no pivot → det = 0`, M: tidy(M) })
      return { det: 0, steps }
    }
    if (p !== c) {
      ;[M[p], M[c]] = [M[c], M[p]]
      sign = -sign
      steps.push({ op: `R${c + 1} ↔ R${p + 1} (sign flips)`, M: tidy(M) })
    }
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c]
      if (Math.abs(f) < EPS) continue
      M[i] = M[i].map((x, j) => x - f * M[c][j])
      steps.push({ op: `R${i + 1} ← R${i + 1} ${f > 0 ? '−' : '+'} ${toFraction(Math.abs(f))}·R${c + 1}`, M: tidy(M) })
    }
  }
  const d = sign * M.reduce((s, r, i) => s * r[i], 1)
  steps.push({ op: `det = ${sign < 0 ? '−' : ''}(${M.map((r, i) => toFraction(clean(r[i]))).join(' · ')}) = ${toFraction(clean(d))}`, M: tidy(M) })
  return { det: clean(d), steps }
}

/** PA = LU with partial pivoting. */
export function lu(A: Mat): { P: Mat; L: Mat; U: Mat } {
  if (!isSquare(A)) throw new Error('LU here needs a square matrix')
  const n = A.length
  const U = clone(A), L = identity(n).map((r) => r.map(() => 0)), perm = [...Array(n).keys()]
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(U[i][c]) > Math.abs(U[p][c])) p = i
    if (p !== c) {
      ;[U[p], U[c]] = [U[c], U[p]]
      ;[L[p], L[c]] = [L[c], L[p]]
      ;[perm[p], perm[c]] = [perm[c], perm[p]]
    }
    L[c][c] = 1
    if (Math.abs(U[c][c]) < EPS) continue
    for (let i = c + 1; i < n; i++) {
      const f = U[i][c] / U[c][c]
      L[i][c] = f
      U[i] = U[i].map((x, j) => x - f * U[c][j])
    }
  }
  const P = perm.map((pi) => identity(n)[pi])
  return { P, L: tidy(L), U: tidy(U) }
}

/** Householder QR: A = Q R, Q orthogonal (m×m), R upper triangular (m×n). */
export function qr(A: Mat): { Q: Mat; R: Mat } {
  const m = A.length, n = A[0].length
  const R = clone(A)
  let Q = identity(m)
  for (let k = 0; k < Math.min(m - 1, n); k++) {
    const x = R.slice(k).map((r) => r[k])
    const norm = Math.hypot(...x)
    if (norm < EPS) continue
    const v = [...x]
    v[0] += (x[0] >= 0 ? 1 : -1) * norm
    const vn = Math.hypot(...v)
    if (vn < EPS) continue
    const u = v.map((a) => a / vn)
    // R = H R, Q = Q H with H = I − 2uuᵀ on rows/cols k..m
    for (let j = 0; j < n; j++) {
      const d = u.reduce((s, ui, i) => s + ui * R[k + i][j], 0)
      u.forEach((ui, i) => (R[k + i][j] -= 2 * ui * d))
    }
    Q = Q.map((row) => {
      const d = u.reduce((s, ui, i) => s + ui * row[k + i], 0)
      const out = [...row]
      u.forEach((ui, i) => (out[k + i] -= 2 * ui * d))
      return out
    })
  }
  return { Q: tidy(Q), R: tidy(R) }
}

export function cholesky(A: Mat): Mat | null {
  if (!isSquare(A)) return null
  const n = A.length
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (Math.abs(A[i][j] - A[j][i]) > 1e-9) return null
  const L = identity(n).map((r) => r.map(() => 0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j]
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
      if (i === j) {
        if (s <= EPS) return null
        L[i][i] = Math.sqrt(s)
      } else L[i][j] = s / L[j][j]
    }
  }
  return L
}

/** Characteristic polynomial coefficients [1, c1, …, cn] of det(λI − A) (Faddeev–LeVerrier). */
export function charPoly(A: Mat): number[] {
  const n = A.length
  const c = [1]
  let M = identity(n).map((r) => r.map(() => 0))
  for (let k = 1; k <= n; k++) {
    M = add(mul(A, M), scale(identity(n), c[k - 1]))
    const AM = mul(A, M)
    c.push(-trace(AM) / k)
  }
  return c.map(clean)
}

/** All roots of a monic-ish polynomial (Durand–Kerner, then Newton polish). */
export function polyRoots(coef: number[]): Complex[] {
  const a = coef.map((x) => x / coef[0])
  const n = a.length - 1
  if (n < 1) return []
  type C = [number, number]
  const cm = (p: C, q: C): C => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]]
  const cd = (p: C, q: C): C => {
    const d = q[0] * q[0] + q[1] * q[1] || 1e-300
    return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]
  }
  const ev = (z: C): C => a.reduce<C>((acc, ai) => { const m = cm(acc, z); return [m[0] + ai, m[1]] }, [0, 0])
  const bound = 1 + Math.max(...a.slice(1).map(Math.abs))
  let z: C[] = Array.from({ length: n }, (_, k) => [bound * 0.9 * Math.cos((2 * Math.PI * k) / n + 0.4), bound * 0.9 * Math.sin((2 * Math.PI * k) / n + 0.4)])
  for (let it = 0; it < 2000; it++) {
    let moved = 0
    z = z.map((zi, i) => {
      let den: C = [1, 0]
      z.forEach((zj, j) => { if (j !== i) den = cm(den, [zi[0] - zj[0], zi[1] - zj[1]]) })
      const d = cd(ev(zi), den)
      moved = Math.max(moved, Math.hypot(d[0], d[1]))
      return [zi[0] - d[0], zi[1] - d[1]]
    })
    if (moved < 1e-14 * bound) break
  }
  return z
    .map(([re, im]) => ({ re: clean(re), im: Math.abs(im) < 1e-8 * Math.max(1, Math.abs(re)) ? 0 : clean(im) }))
    .sort((p, q) => q.re - p.re || q.im - p.im)
}

/** Jacobi rotations for symmetric matrices: eigenvalues and orthonormal eigenvectors (columns). */
export function jacobi(A: Mat): { values: number[]; vectors: Mat } {
  const n = A.length
  const M = clone(A)
  let V = identity(n)
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] ** 2
    if (off < 1e-22) break
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(M[p][q]) < 1e-300) continue
        const th = (M[q][q] - M[p][p]) / (2 * M[p][q])
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let k = 0; k < n; k++) {
          const a = M[k][p], b = M[k][q]
          M[k][p] = c * a - s * b
          M[k][q] = s * a + c * b
        }
        for (let k = 0; k < n; k++) {
          const a = M[p][k], b = M[q][k]
          M[p][k] = c * a - s * b
          M[q][k] = s * a + c * b
        }
        V = V.map((row) => {
          const a = row[p], b = row[q]
          const r = [...row]
          r[p] = c * a - s * b
          r[q] = s * a + c * b
          return r
        })
      }
  }
  const order = [...Array(n).keys()].sort((i, j) => M[j][j] - M[i][i])
  return { values: order.map((i) => clean(M[i][i])), vectors: tidy(V.map((row) => order.map((i) => row[i]))) }
}

/** Eigenvector for a real eigenvalue by inverse iteration (unit length, first non-zero entry positive). */
export function eigenvector(A: Mat, lambda: number): number[] {
  const n = A.length
  const shift = lambda + 1e-7 * Math.max(1, Math.abs(lambda))
  const B = A.map((r, i) => r.map((a, j) => a - (i === j ? shift : 0)))
  const { P, L, U } = lu(B)
  let x = Array.from({ length: n }, (_, i) => 1 + i * 0.1)
  for (let it = 0; it < 8; it++) {
    const b = P.map((row) => row.reduce((s, p, j) => s + p * x[j], 0))
    const y = [...b]
    for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) y[i] -= L[i][k] * y[k]
    for (let i = n - 1; i >= 0; i--) {
      for (let k = i + 1; k < n; k++) y[i] -= U[i][k] * y[k]
      y[i] /= Math.abs(U[i][i]) < 1e-300 ? 1e-300 : U[i][i]
    }
    const nm = Math.hypot(...y) || 1
    x = y.map((v) => v / nm)
  }
  const first = x.find((v) => Math.abs(v) > 1e-9) ?? 1
  return x.map((v) => clean(v * Math.sign(first)))
}

/** Solves A x = b (b: column) via RREF; reports none / unique / infinite. */
export function solveSystem(A: Mat, b: number[]): { kind: 'unique' | 'none' | 'infinite'; x?: number[]; steps: Step[] } {
  const aug = A.map((r, i) => [...r, b[i] ?? 0])
  const { R, pivots, steps } = rref(aug, 1)
  const n = A[0].length
  for (const row of R) if (row.slice(0, n).every((v) => Math.abs(v) < EPS) && Math.abs(row[n]) > EPS) return { kind: 'none', steps }
  if (pivots.length < n) return { kind: 'infinite', steps }
  const x = new Array(n).fill(0)
  pivots.forEach((c, r) => (x[c] = R[r][n]))
  return { kind: 'unique', x: x.map(clean), steps }
}

/** Best simple fraction for display (denominator ≤ 1000), else a rounded decimal. */
export function toFraction(x: number): string {
  if (!Number.isFinite(x)) return String(x)
  if (Number.isInteger(x)) return String(x)
  const s = x < 0 ? '−' : ''
  const v = Math.abs(x)
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(b)
    ;[h1, h0] = [a * h1 + h0, h1]
    ;[k1, k0] = [a * k1 + k0, k1]
    if (k1 > 1000) break
    if (Math.abs(v - h1 / k1) < 1e-9 * Math.max(1, v)) return `${s}${h1}/${k1}`
    b = 1 / (b - a)
    if (!Number.isFinite(b)) break
  }
  return `${s}${Number(v.toPrecision(6))}`
}

export function parseMatrix(text: string): Mat | null {
  const rows = text.trim().split(/\n|;/).map((r) => r.trim().replace(/^\[|\]$/g, '')).filter(Boolean)
  const M = rows.map((r) => r.split(/[\s,]+/).filter(Boolean).map((v) => {
    const f = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(v)
    return f ? Number(f[1]) / Number(f[2]) : Number(v)
  }))
  if (!M.length || M.some((r) => r.length !== M[0].length || r.some((v) => !Number.isFinite(v)))) return null
  return M
}
