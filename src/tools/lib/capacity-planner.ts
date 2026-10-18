// Queueing formulas for capacity planning: Little's law, M/M/1, M/M/c (Erlang C), M/M/c/K.
// Rates are per second; times are in seconds.

export type Model = 'mm1' | 'mmc' | 'mmck'

export interface QueueResult {
  stable: boolean
  /** Server utilisation (busy fraction of each server). */
  rho: number
  /** Offered load in Erlangs (λ/μ). */
  a: number
  /** Probability an arriving (admitted) request has to wait. */
  pWait: number
  /** Probability an arrival is rejected (M/M/c/K only). */
  pBlock: number
  /** Effective (admitted) throughput, per second. */
  throughput: number
  L: number
  Lq: number
  W: number
  Wq: number
  /** Probability the queueing delay is ≤ t (seconds), as a function. */
  slWithin: (t: number) => number
  /** p-quantile of the waiting time in queue (seconds). */
  waitQuantile: (p: number) => number
}

/** Erlang B blocking probability for c servers and a Erlangs (stable recursion). */
export function erlangB(c: number, a: number): number {
  let b = 1
  for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b)
  return b
}

/** Erlang C: probability of waiting in an M/M/c queue (1 when a ≥ c). */
export function erlangC(c: number, a: number): number {
  if (a >= c) return 1
  const b = erlangB(c, a)
  return (c * b) / (c - a * (1 - b))
}

const unstable = (a: number, c: number, lambda: number): QueueResult => ({
  stable: false, rho: a / c, a, pWait: 1, pBlock: 0, throughput: Math.min(lambda, (c * lambda) / Math.max(a, 1e-12)),
  L: Infinity, Lq: Infinity, W: Infinity, Wq: Infinity, slWithin: () => 0, waitQuantile: () => Infinity,
})

/** M/M/c (c = 1 gives M/M/1). */
export function mmc(lambda: number, mu: number, c: number): QueueResult {
  const a = lambda / mu
  if (!(lambda >= 0 && mu > 0 && c >= 1) || a >= c) return unstable(a, c, lambda)
  const C = lambda === 0 ? 0 : erlangC(c, a)
  const gap = c * mu - lambda
  const Wq = C / gap
  const Lq = lambda * Wq
  return {
    stable: true, rho: a / c, a, pWait: C, pBlock: 0, throughput: lambda,
    Wq, Lq, W: Wq + 1 / mu, L: Lq + a,
    slWithin: (t) => 1 - C * Math.exp(-gap * Math.max(0, t)),
    waitQuantile: (p) => (C <= 1 - p ? 0 : Math.log(C / (1 - p)) / gap),
  }
}

/** M/M/c/K: c servers, at most K requests in the system (K ≥ c); excess arrivals are dropped. */
export function mmck(lambda: number, mu: number, c: number, K: number): QueueResult {
  const a = lambda / mu
  K = Math.max(c, Math.floor(K))
  // unnormalised p_n with log-safe incremental products
  const w: number[] = [1]
  for (let n = 1; n <= K; n++) w.push(w[n - 1] * (a / Math.min(n, c)))
  const tot = w.reduce((s, v) => s + v, 0)
  const p = w.map((v) => v / tot)
  const pK = p[K]
  const lamE = lambda * (1 - pK)
  let L = 0, Lq = 0, busy = 0
  p.forEach((pn, n) => {
    L += n * pn
    Lq += Math.max(0, n - c) * pn
    busy += Math.min(n, c) * pn
  })
  const W = lamE > 0 ? L / lamE : 1 / mu
  const Wq = lamE > 0 ? Lq / lamE : 0
  // Arrival-time state distribution for admitted requests (PASTA, conditioned on n < K)
  const adm = p.slice(0, K).map((v) => v / (1 - pK || 1))
  const pWait = adm.reduce((s, v, n) => s + (n >= c ? v : 0), 0)
  // Waiting time of an admitted arrival finding n ≥ c: Erlang(n−c+1, cμ)
  const slWithin = (t: number) => {
    t = Math.max(0, t)
    const r = c * mu * t
    let s = 0
    for (let n = 0; n < K; n++) {
      if (n < c) { s += adm[n]; continue }
      const k = n - c + 1
      // P(Erlang(k, cμ) ≤ t) = 1 − Σ_{j<k} e^{−r} r^j / j!
      let term = Math.exp(-r), tail = 0
      for (let j = 0; j < k; j++) {
        tail += term
        term *= r / (j + 1)
      }
      s += adm[n] * (1 - tail)
    }
    return Math.min(1, s)
  }
  const waitQuantile = (q: number) => {
    if (slWithin(0) >= q) return 0
    let lo = 0, hi = 1 / mu
    while (slWithin(hi) < q && hi < 1e9) hi *= 2
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2
      if (slWithin(m) < q) lo = m
      else hi = m
    }
    return hi
  }
  return { stable: true, rho: busy / c, a, pWait, pBlock: pK, throughput: lamE, L, Lq, W, Wq, slWithin, waitQuantile }
}

export function solve(model: Model, lambda: number, mu: number, c: number, K: number): QueueResult {
  if (model === 'mm1') return mmc(lambda, mu, 1)
  if (model === 'mmc') return mmc(lambda, mu, c)
  return mmck(lambda, mu, c, K)
}

/** Smallest c meeting: P(wait ≤ t) ≥ target and utilisation ≤ maxRho (Erlang C staffing). */
export function staffFor(lambda: number, mu: number, t: number, target: number, maxRho = 1): number {
  const a = lambda / mu
  let c = Math.max(1, Math.floor(a) + 1)
  for (; c < 100000; c++) {
    const r = mmc(lambda, mu, c)
    if (r.stable && r.rho <= maxRho && r.slWithin(t) >= target) return c
  }
  return NaN
}

/** Little's law L = λ·W: give any two (others NaN) and get the third. */
export function little(L: number, lambda: number, W: number): { L: number; lambda: number; W: number } {
  if (!Number.isFinite(L)) return { L: lambda * W, lambda, W }
  if (!Number.isFinite(lambda)) return { L, lambda: W ? L / W : NaN, W }
  return { L, lambda, W: lambda ? L / lambda : NaN }
}
