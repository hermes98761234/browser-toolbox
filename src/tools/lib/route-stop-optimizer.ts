// Stop ordering: haversine distances, nearest-neighbour construction, 2-opt + Or-opt improvement.

export interface Pt { lat: number; lon: number }
export type Mode = 'loop' | 'open' | 'fixed-end'

const R = 6371.0088 // mean Earth radius, km

export function haversine(a: Pt, b: Pt): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function matrix(ps: Pt[]): number[][] {
  return ps.map((a) => ps.map((b) => haversine(a, b)))
}

/** Length of a route given as indices; `loop` adds the return leg to the first index. */
export function routeLength(order: number[], D: number[][], loop: boolean): number {
  let s = 0
  for (let i = 1; i < order.length; i++) s += D[order[i - 1]][order[i]]
  if (loop && order.length > 1) s += D[order[order.length - 1]][order[0]]
  return s
}

/** Nearest neighbour from index 0; with fixed-end the last index is kept for the end. */
export function nearestNeighbour(D: number[][], mode: Mode): number[] {
  const n = D.length
  if (n <= 2) return [...Array(n).keys()]
  const end = mode === 'fixed-end' ? n - 1 : -1
  const left = new Set([...Array(n).keys()].filter((i) => i !== 0 && i !== end))
  const order = [0]
  while (left.size) {
    const cur = order[order.length - 1]
    let best = -1
    for (const j of left) if (best < 0 || D[cur][j] < D[cur][best]) best = j
    order.push(best)
    left.delete(best)
  }
  if (end > 0) order.push(end)
  return order
}

/**
 * 2-opt (segment reversal) and Or-opt (move 1–3 stop chains) until no improvement.
 * The first stop always stays first; with fixed-end the last stays last.
 */
export function improve(order: number[], D: number[][], mode: Mode, maxRounds = 200): number[] {
  const loop = mode === 'loop'
  const r = [...order]
  const n = r.length
  if (n < 4) return r
  const lastMovable = mode === 'fixed-end' ? n - 2 : n - 1
  const d = (i: number, j: number) => D[r[i]][r[j]]
  const next = (i: number) => (i + 1 < n ? i + 1 : loop ? 0 : -1)
  for (let round = 0; round < maxRounds; round++) {
    let better = false
    // 2-opt: reverse r[i..k]
    for (let i = 1; i < lastMovable; i++)
      for (let k = i + 1; k <= lastMovable; k++) {
        const a = i - 1, kn = next(k)
        const before = d(a, i) + (kn >= 0 ? d(k, kn) : 0)
        const after = d(a, k) + (kn >= 0 ? d(i, kn) : 0)
        if (after < before - 1e-9) {
          r.splice(i, k - i + 1, ...r.slice(i, k + 1).reverse())
          better = true
        }
      }
    // Or-opt: move a chain of length L starting at i to after position j (optionally reversed)
    for (let L = 1; L <= 3; L++)
      for (let i = 1; i + L - 1 <= lastMovable; i++) {
        const seg = r.slice(i, i + L)
        const rest = [...r.slice(0, i), ...r.slice(i + L)]
        const base = routeLength(r, D, loop)
        let bestLen = base - 1e-9, bestR: number[] | null = null
        const lim = mode === 'fixed-end' ? rest.length - 1 : rest.length
        for (let j = 1; j <= lim; j++) {
          if (j === i) continue
          for (const s of [seg, [...seg].reverse()]) {
            const cand = [...rest.slice(0, j), ...s, ...rest.slice(j)]
            const len = routeLength(cand, D, loop)
            if (len < bestLen) {
              bestLen = len
              bestR = cand
            }
          }
        }
        if (bestR) {
          r.splice(0, n, ...bestR)
          better = true
        }
      }
    if (!better) break
  }
  return r
}

export function optimize(ps: Pt[], mode: Mode): { order: number[]; km: number; naiveKm: number; nnKm: number } {
  const D = matrix(ps)
  const loop = mode === 'loop'
  const naive = [...ps.keys()]
  const nn = nearestNeighbour(D, mode)
  // Also try 2-opt from the original order; keep whichever is shorter.
  const a = improve(nn, D, mode), b = improve(naive, D, mode)
  const best = routeLength(a, D, loop) <= routeLength(b, D, loop) ? a : b
  return { order: best, km: routeLength(best, D, loop), naiveKm: routeLength(naive, D, loop), nnKm: routeLength(nn, D, loop) }
}

/** Parses "label | lat, lon | note" or "lat, lon label" lines; other lines are addresses to geocode. */
export function parseLine(line: string): { label: string; lat?: number; lon?: number; note: string } | null {
  const raw = line.trim()
  if (!raw || raw.startsWith('#')) return null
  const parts = raw.split('|').map((x) => x.trim())
  // Decimal degrees only (both numbers need a fraction) so house numbers / postcodes never match.
  const coordRe = /(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/
  for (let i = 0; i < parts.length; i++) {
    const m = coordRe.exec(parts[i])
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) {
      const rest = parts.filter((_, j) => j !== i)
      const leftover = parts[i].replace(m[0], '').trim()
      return { label: rest[0] || leftover || `${(+m[1]).toFixed(4)}, ${(+m[2]).toFixed(4)}`, lat: +m[1], lon: +m[2], note: rest.slice(1).join(' · ') }
    }
  }
  return { label: parts[0], note: parts.slice(1).join(' · ') }
}

// Web Mercator helpers for the tile map.
export const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 256 * 2 ** z
export const lat2y = (lat: number, z: number) => {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z
}

export function fitZoom(ps: Pt[], w: number, h: number, pad = 40): number {
  if (ps.length < 2) return 13
  for (let z = 17; z >= 1; z--) {
    const xs = ps.map((p) => lon2x(p.lon, z)), ys = ps.map((p) => lat2y(p.lat, z))
    if (Math.max(...xs) - Math.min(...xs) <= w - 2 * pad && Math.max(...ys) - Math.min(...ys) <= h - 2 * pad) return z
  }
  return 1
}
