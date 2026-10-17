// Pallet layer packing: guillotine dynamic programming over raster points (2D, boxes may rotate 90°).

export interface Rect { x: number; y: number; w: number; d: number }

/** Lengths that can be built as i*a + j*b and do not exceed max (raster points). */
function raster(max: number, a: number, b: number) {
  const s = new Set<number>()
  for (let i = 0; i * a <= max; i++) for (let j = 0; i * a + j * b <= max; j++) s.add(i * a + j * b)
  return [...s].sort((x, y) => x - y)
}

/** Best guillotine layout of l x w boxes in an L x W area; returns placed rectangles. */
export function packLayer(L: number, W: number, l: number, w: number): Rect[] {
  if (l <= 0 || w <= 0 || L <= 0 || W <= 0) return []
  const RX = raster(L, l, w)
  const RY = raster(W, l, w)
  const fit = (v: number, R: number[]) => {
    let best = 0
    for (const r of R) if (r <= v + 1e-9) best = r
    return best
  }
  type Plan = { n: number; cut?: ['x' | 'y', number]; rot?: boolean }
  const memo = new Map<string, Plan>()
  const solve = (X: number, Y: number): Plan => {
    X = fit(X, RX)
    Y = fit(Y, RY)
    const key = X + ',' + Y
    const hit = memo.get(key)
    if (hit) return hit
    const a = Math.floor(X / l) * Math.floor(Y / w)
    const b = Math.floor(X / w) * Math.floor(Y / l)
    let best: Plan = a >= b ? { n: a, rot: false } : { n: b, rot: true }
    memo.set(key, best)
    for (const x of RX) {
      if (x <= 0 || x >= X) continue
      if (x > X / 2 + 1e-9) break
      const n = solve(x, Y).n + solve(X - x, Y).n
      if (n > best.n) best = { n, cut: ['x', x] }
    }
    for (const y of RY) {
      if (y <= 0 || y >= Y) continue
      if (y > Y / 2 + 1e-9) break
      const n = solve(X, y).n + solve(X, Y - y).n
      if (n > best.n) best = { n, cut: ['y', y] }
    }
    memo.set(key, best)
    return best
  }
  const out: Rect[] = []
  const place = (x0: number, y0: number, X: number, Y: number) => {
    const p = solve(X, Y)
    if (!p.n) return
    if (!p.cut) {
      const [bw, bd] = p.rot ? [w, l] : [l, w]
      const nx = Math.floor(X / bw), ny = Math.floor(Y / bd)
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push({ x: x0 + i * bw, y: y0 + j * bd, w: bw, d: bd })
      return
    }
    const [axis, at] = p.cut
    if (axis === 'x') {
      place(x0, y0, at, Y)
      place(x0 + at, y0, X - at, Y)
    } else {
      place(x0, y0, X, at)
      place(x0, y0 + at, X, Y - at)
    }
  }
  place(0, 0, L, W)
  // centre the pattern on the pallet
  const maxX = Math.max(0, ...out.map((r) => r.x + r.w))
  const maxY = Math.max(0, ...out.map((r) => r.y + r.d))
  const dx = (L - maxX) / 2, dy = (W - maxY) / 2
  return out.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }))
}

export interface PlanInput {
  palletL: number; palletW: number; palletH: number; palletKg: number
  boxL: number; boxW: number; boxH: number; boxKg: number
  maxHeight: number // overall, including pallet
  maxKg: number // payload limit (boxes only)
  overhang: number // allowed per side, mm
  upright: boolean // "this side up": box height stays vertical
}

export interface Plan {
  layer: Rect[]
  dims: [number, number, number] // box l, w, h as placed
  perLayer: number
  layers: number
  total: number
  topLayer: number // boxes in the last (possibly partial) layer
  height: number
  payload: number
  gross: number
  areaUse: number
  volumeUse: number
  limitedBy: 'height' | 'weight' | 'none'
}

export function planPallet(p: PlanInput): Plan {
  const L = p.palletL + 2 * p.overhang
  const W = p.palletW + 2 * p.overhang
  const orients: [number, number, number][] = p.upright ? [[p.boxL, p.boxW, p.boxH]] : [[p.boxL, p.boxW, p.boxH], [p.boxL, p.boxH, p.boxW], [p.boxW, p.boxH, p.boxL]]
  let best: Plan | null = null
  for (const [l, w, h] of orients) {
    const layer = packLayer(L, W, l, w)
    const perLayer = layer.length
    const byHeight = h > 0 ? Math.floor((p.maxHeight - p.palletH) / h + 1e-9) : 0
    const fullByWeight = p.boxKg > 0 ? Math.floor(p.maxKg / p.boxKg + 1e-9) : Infinity
    const maxBoxes = Math.min(perLayer * Math.max(0, byHeight), fullByWeight)
    const layers = perLayer ? Math.ceil(maxBoxes / perLayer) : 0
    const topLayer = layers ? maxBoxes - (layers - 1) * perLayer : 0
    const total = maxBoxes
    const plan: Plan = {
      layer: layer.map((r) => ({ ...r, x: r.x - p.overhang, y: r.y - p.overhang })),
      dims: [l, w, h],
      perLayer,
      layers,
      total,
      topLayer,
      height: p.palletH + layers * h,
      payload: total * p.boxKg,
      gross: total * p.boxKg + p.palletKg,
      areaUse: (perLayer * l * w) / (p.palletL * p.palletW),
      volumeUse: layers ? (total * l * w * h) / (p.palletL * p.palletW * (p.maxHeight - p.palletH)) : 0,
      limitedBy: perLayer * byHeight > fullByWeight ? 'weight' : byHeight > 0 ? 'height' : 'none',
    }
    if (!best || plan.total > best.total || (plan.total === best.total && plan.height < best.height)) best = plan
  }
  return best!
}
