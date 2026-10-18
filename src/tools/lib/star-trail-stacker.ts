// Star-trail stacking: lighten (max) or mean blending, comet-tail decay, and gap filling by detecting
// stars in consecutive frames, pairing them (mutual nearest neighbours) and drawing the missing arc
// segment between the two positions. All buffers are RGBA Uint8 rows; strips allow tiled processing.

export interface Star { x: number; y: number; v: number; r: number; c: [number, number, number] }
export interface Segment { x0: number; y0: number; x1: number; y1: number; w: number; c: [number, number, number] }

export const luma = (d: ArrayLike<number>, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]

/** Bright local maxima above mean + k·σ (and an absolute floor), strongest first, at most `maxN`. */
export function detectStars(d: ArrayLike<number>, w: number, h: number, k = 5, floor = 60, maxN = 1500): Star[] {
  const L = new Float32Array(w * h)
  let sum = 0, sq = 0
  for (let i = 0; i < w * h; i++) {
    const v = luma(d, i * 4)
    L[i] = v
    sum += v
    sq += v * v
  }
  const mean = sum / (w * h), sd = Math.sqrt(Math.max(0, sq / (w * h) - mean * mean))
  const thr = Math.max(floor, mean + k * sd)
  const out: Star[] = []
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const v = L[y * w + x]
      if (v < thr) continue
      let peak = true
      for (let dy = -1; dy <= 1 && peak; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const n = L[(y + dy) * w + x + dx]
          // ties: only the first pixel (in scan order) of a flat top counts as the peak
          if (n > v || (n === v && (dy < 0 || (dy === 0 && dx < 0)))) {
            peak = false
            break
          }
        }
      if (!peak) continue
      let area = 0
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (L[(y + dy) * w + x + dx] >= v * 0.5) area++
      const i = (y * w + x) * 4
      out.push({ x, y, v, r: Math.max(0.6, Math.sqrt(area / Math.PI)), c: [d[i], d[i + 1], d[i + 2]] })
    }
  out.sort((a, b) => b.v - a.v)
  return out.slice(0, maxN)
}

/** Mutual-nearest-neighbour pairs within maxDist (grid-bucketed). Returns index pairs [a, b]. */
export function matchStars(a: Star[], b: Star[], maxDist: number): [number, number][] {
  const cell = Math.max(1, maxDist)
  const bucket = (s: Star[]) => {
    const m = new Map<string, number[]>()
    s.forEach((p, i) => {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
      const l = m.get(key)
      if (l) l.push(i)
      else m.set(key, [i])
    })
    return m
  }
  const nearest = (p: Star, set: Star[], m: Map<string, number[]>) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell)
    let best = -1, bd = maxDist * maxDist
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of m.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = (set[j].x - p.x) ** 2 + (set[j].y - p.y) ** 2
          if (d <= bd) {
            bd = d
            best = j
          }
        }
    return best
  }
  const ma = bucket(a), mb = bucket(b)
  const out: [number, number][] = []
  a.forEach((p, i) => {
    const j = nearest(p, b, mb)
    if (j >= 0 && nearest(b[j], a, ma) === i) out.push([i, j])
  })
  return out
}

/** Segments that bridge the gap between two frames' star lists (coordinates scaled by `scale`). */
export function gapSegments(a: Star[], b: Star[], maxDist: number, scale = 1, minLen = 1): Segment[] {
  return matchStars(a, b, maxDist)
    .filter(([i, j]) => Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y) >= minLen)
    .map(([i, j]) => ({
      x0: a[i].x * scale, y0: a[i].y * scale, x1: b[j].x * scale, y1: b[j].y * scale,
      w: ((a[i].r + b[j].r) / 2) * scale,
      c: [0, 1, 2].map((k) => Math.round((a[i].c[k] + b[j].c[k]) / 2)) as [number, number, number],
    }))
}

/** acc = max(acc · decay, frame), per channel (decay = 1 → plain lighten). */
export function lightenInto(acc: Uint8ClampedArray, frame: ArrayLike<number>, decay = 1) {
  if (decay >= 1) {
    for (let i = 0; i < acc.length; i += 4) {
      if (frame[i] > acc[i]) acc[i] = frame[i]
      if (frame[i + 1] > acc[i + 1]) acc[i + 1] = frame[i + 1]
      if (frame[i + 2] > acc[i + 2]) acc[i + 2] = frame[i + 2]
      acc[i + 3] = 255
    }
    return
  }
  for (let i = 0; i < acc.length; i += 4) {
    acc[i] = Math.max(acc[i] * decay, frame[i])
    acc[i + 1] = Math.max(acc[i + 1] * decay, frame[i + 1])
    acc[i + 2] = Math.max(acc[i + 2] * decay, frame[i + 2])
    acc[i + 3] = 255
  }
}

/** Running sum for mean stacking. */
export function addInto(sum: Float32Array, frame: ArrayLike<number>) {
  for (let i = 0; i < sum.length; i++) sum[i] += frame[i]
}

/**
 * Draws a soft round-capped segment with max blending into an RGBA strip that covers image rows
 * [y0, y0 + rows). Brightness falls off over the outer half of the width.
 */
export function stampSegment(acc: Uint8ClampedArray, w: number, y0: number, rows: number, s: Segment) {
  const r = Math.max(0.5, s.w)
  const minX = Math.max(0, Math.floor(Math.min(s.x0, s.x1) - r - 1)), maxX = Math.min(w - 1, Math.ceil(Math.max(s.x0, s.x1) + r + 1))
  const minY = Math.max(y0, Math.floor(Math.min(s.y0, s.y1) - r - 1)), maxY = Math.min(y0 + rows - 1, Math.ceil(Math.max(s.y0, s.y1) + r + 1))
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len2 = dx * dx + dy * dy
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const t = len2 ? Math.min(1, Math.max(0, ((x - s.x0) * dx + (y - s.y0) * dy) / len2)) : 0
      const d = Math.hypot(x - (s.x0 + t * dx), y - (s.y0 + t * dy))
      if (d > r) continue
      const a = d < r / 2 ? 1 : 1 - (d - r / 2) / (r / 2)
      const i = ((y - y0) * w + x) * 4
      for (let k = 0; k < 3; k++) {
        const v = s.c[k] * a
        if (v > acc[i + k]) acc[i + k] = v
      }
      acc[i + 3] = 255
    }
}

/** Per-frame decay so that the first frame keeps `tail` (0..1) of its brightness by the end. */
export const decayFor = (frames: number, tail: number) => (frames > 1 && tail < 1 ? Math.pow(Math.max(0.001, tail), 1 / (frames - 1)) : 1)

/** Small deterministic PRNG for the demo sky. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Demo frame: stars rotating around a pole above a hill-and-pines silhouette (original scene). */
export function drawDemoFrame(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, w: number, h: number, i: number, degPerFrame = 0.5) {
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#02040c')
  sky.addColorStop(0.7, '#0a1430')
  sky.addColorStop(1, '#1b2a4a')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  const R = rng(7)
  const px = w * 0.62, py = h * 0.18, a = (i * degPerFrame * Math.PI) / 180
  const n = Math.round((w * h) / 2600)
  const k = w / 960
  for (let s = 0; s < n; s++) {
    const rr = Math.sqrt(R()) * Math.hypot(w, h) * 0.95, th = R() * Math.PI * 2, mag = R() ** 3
    const hue = R()
    const x = px + rr * Math.cos(th + a), y = py + rr * Math.sin(th + a)
    if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue
    g.fillStyle = hue < 0.2 ? '#ffd9a8' : hue < 0.4 ? '#bcd4ff' : '#ffffff'
    g.globalAlpha = 0.35 + 0.65 * mag
    g.beginPath()
    g.arc(x, y, (0.6 + mag * 1.6) * k, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  // noise grain
  const N = rng(1000 + i)
  g.fillStyle = 'rgba(120,140,190,0.35)'
  for (let s = 0; s < n / 2; s++) g.fillRect(N() * w, N() * h, k, k)
  // foreground
  g.fillStyle = '#020306'
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 8 * k) g.lineTo(x, h * 0.8 - Math.sin(x / (w * 0.18)) * h * 0.05 - Math.sin(x / (w * 0.05)) * h * 0.012)
  g.lineTo(w, h)
  g.fill()
  for (const [fx, fh] of [[0.12, 0.26], [0.17, 0.2], [0.85, 0.3], [0.9, 0.22]] as const) {
    const x = fx * w, base = h * 0.82, top = base - fh * h
    g.beginPath()
    g.moveTo(x, top)
    g.lineTo(x - fh * h * 0.22, base)
    g.lineTo(x + fh * h * 0.22, base)
    g.fill()
  }
  // a cabin window light (stays sharp: it's in every frame)
  g.fillStyle = '#ffb347'
  g.fillRect(w * 0.42, h * 0.84, 6 * k, 5 * k)
}
