// G-code parser for toolpath previews: G0/G1 lines, G2/G3 arcs (XY plane, I/J or R), G20/G21 units,
// G90/G91 positioning, M82/M83 extruder modes, G92 position reset, layer detection and time estimates.

export interface Layer {
  z: number
  /** segment index ranges [start, end) into `cut` and `travel` */
  cutStart: number
  cutEnd: number
  travelStart: number
  travelEnd: number
  time: number // s
  extruded: number // mm of filament
  length: number // mm of cutting/extruding path
}

export interface GcodeResult {
  /** 6 numbers per segment: x0 y0 z0 x1 y1 z1 (mm, machine coordinates) */
  cut: number[]
  travel: number[]
  /** feed (mm/min) per cut segment */
  cutFeed: number[]
  layers: Layer[]
  hasExtrusion: boolean
  lines: number
  moves: number
  time: number
  filament: number
  pathLength: number
  travelLength: number
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
  warnings: string[]
}

export interface ParseOptions {
  rapidFeed: number // mm/min for G0
  accel: number // mm/s²
  defaultFeed: number // mm/min when no F has been given
}

/** Time to move `d` mm at target speed `v` (mm/s) from and to rest with acceleration `a` (trapezoidal profile). */
export function moveTime(d: number, v: number, a: number): number {
  if (d <= 0 || v <= 0) return 0
  if (!(a > 0)) return d / v
  const dAcc = (v * v) / a // accelerate + decelerate distance
  return d >= dAcc ? d / v + v / a : 2 * Math.sqrt(d / a)
}

const WORD = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g

export function parseGcode(text: string, opt: ParseOptions): GcodeResult {
  const hasExtrusion = /^[ \t]*G0?[123]\b[^;\n(]*E[-+]?[\d.]/im.test(text)
  const cut: number[] = [], travel: number[] = [], cutFeed: number[] = []
  const layers: Layer[] = []
  const warnings = new Set<string>()
  let x = 0, y = 0, z = 0, e = 0
  let abs = true, absE = true, scale = 1
  let feed = opt.defaultFeed
  let moves = 0, time = 0, filament = 0, pathLength = 0, travelLength = 0
  const mn: [number, number, number] = [Infinity, Infinity, Infinity]
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let layer: Layer | null = null
  let preTime = 0
  const lines = text.split(/\r?\n/)

  const ensureLayer = (zz: number) => {
    if (!layer || Math.abs(layer.z - zz) > 1e-4) {
      if (layer) {
        layer.cutEnd = cut.length / 6
        layer.travelEnd = travel.length / 6
      }
      const first = layers.length === 0
      layer = { z: zz, cutStart: cut.length / 6, cutEnd: cut.length / 6, travelStart: first ? 0 : travel.length / 6, travelEnd: travel.length / 6, time: first ? preTime : 0, extruded: 0, length: 0 }
      layers.push(layer)
    }
    return layer
  }
  const grow = (px: number, py: number, pz: number) => {
    if (px < mn[0]) mn[0] = px
    if (py < mn[1]) mn[1] = py
    if (pz < mn[2]) mn[2] = pz
    if (px > mx[0]) mx[0] = px
    if (py > mx[1]) mx[1] = py
    if (pz > mx[2]) mx[2] = pz
  }

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li]
    const sc = line.indexOf(';')
    if (sc >= 0) line = line.slice(0, sc)
    line = line.replace(/\([^)]*\)/g, '').trim().toUpperCase()
    if (!line) continue
    const w: Record<string, number> = {}
    const gs: number[] = []
    const ms: number[] = []
    WORD.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WORD.exec(line))) {
      const v = Number(m[2])
      if (m[1] === 'G') gs.push(v)
      else if (m[1] === 'M') ms.push(v)
      else w[m[1]] = v
    }
    for (const mm of ms) {
      if (mm === 82) absE = true
      if (mm === 83) absE = false
    }
    let motion: number | null = null
    for (const g of gs) {
      if (g === 20) scale = 25.4
      else if (g === 21) scale = 1
      else if (g === 90) {
        abs = true
        absE = true
      } else if (g === 91) {
        abs = false
        absE = false
      } else if (g === 92) {
        if (w.X !== undefined) x = w.X * scale
        if (w.Y !== undefined) y = w.Y * scale
        if (w.Z !== undefined) z = w.Z * scale
        if (w.E !== undefined) e = w.E * scale
        if (!('X' in w) && !('Y' in w) && !('Z' in w) && !('E' in w)) x = y = z = e = 0
      } else if (g === 28) {
        x = y = z = 0
      } else if (g === 0 || g === 1 || g === 2 || g === 3) motion = g
      else if (g === 17 || g === 4 || g === 94 || g === 54 || g === 80) {
        /* plane / dwell / modes: ignored */
      } else if (g === 18 || g === 19) warnings.add('Arcs in the XZ/YZ planes (G18/G19) are drawn as straight lines.')
    }
    if (gs.includes(92) || gs.includes(28)) continue
    if (motion === null) {
      // modal motion: coordinate words without G repeat the last G0/G1 (common in CNC output)
      if (!('X' in w || 'Y' in w || 'Z' in w || 'E' in w)) {
        if ('F' in w) feed = w.F * scale
        continue
      }
      motion = 1
    }
    if (w.F !== undefined) feed = w.F * scale
    const nx = w.X !== undefined ? (abs ? w.X * scale : x + w.X * scale) : x
    const ny = w.Y !== undefined ? (abs ? w.Y * scale : y + w.Y * scale) : y
    const nz = w.Z !== undefined ? (abs ? w.Z * scale : z + w.Z * scale) : z
    const ne = w.E !== undefined ? (absE ? w.E * scale : e + w.E * scale) : e
    const de = ne - e
    moves++
    const extruding = hasExtrusion ? de > 1e-6 : motion !== 0
    // build the polyline for this move
    const pts: [number, number, number][] = [[x, y, z]]
    if (motion === 2 || motion === 3) {
      let cx: number, cy: number
      if (w.R !== undefined) {
        const r = w.R * scale
        const dx = nx - x, dy = ny - y
        const d = Math.hypot(dx, dy)
        if (d === 0 || Math.abs(r) < d / 2 - 1e-6) {
          warnings.add(`Line ${li + 1}: invalid arc radius; drawn as a line.`)
          cx = NaN
          cy = NaN
        } else {
          const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4))
          const s = (motion === 2 ? -1 : 1) * (r < 0 ? -1 : 1)
          cx = x + dx / 2 - (s * h * dy) / d
          cy = y + dy / 2 + (s * h * dx) / d
        }
      } else {
        cx = x + (w.I ?? 0) * scale
        cy = y + (w.J ?? 0) * scale
      }
      if (Number.isFinite(cx)) {
        const r = Math.hypot(x - cx, y - cy)
        const a0 = Math.atan2(y - cy, x - cx)
        let a1 = Math.atan2(ny - cy, nx - cx)
        if (motion === 2) {
          while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI
        } else {
          while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI
        }
        const sweep = a1 - a0
        const n = Math.max(2, Math.min(720, Math.max(Math.ceil(Math.abs(sweep) / (Math.PI / 36)), Math.ceil((Math.abs(sweep) * r) / 0.5))))
        for (let k = 1; k < n; k++) {
          const a = a0 + (sweep * k) / n
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z + ((nz - z) * k) / n])
        }
      }
    }
    pts.push([nx, ny, nz])
    let d = 0
    for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2])
    const f = motion === 0 ? opt.rapidFeed : feed
    const t = d > 0 ? moveTime(d, f / 60, opt.accel) : moveTime(Math.abs(de), f / 60, opt.accel)
    time += t
    if (de > 0) filament += de
    const L: Layer | null = extruding && d > 0 ? ensureLayer(nz) : layer
    if (L) {
      L.time += t
      if (de > 0) L.extruded += de
    } else preTime += t
    if (d > 0) {
      const target = extruding ? cut : travel
      for (let k = 1; k < pts.length; k++) {
        target.push(...pts[k - 1], ...pts[k])
        if (extruding) cutFeed.push(f)
      }
      if (extruding) {
        pathLength += d
        if (L) L.length += d
        for (const p of pts) grow(p[0], p[1], p[2])
      } else travelLength += d
    }
    x = nx
    y = ny
    z = nz
    e = ne
  }
  const last = layer as Layer | null
  if (last) {
    last.cutEnd = cut.length / 6
    last.travelEnd = travel.length / 6
  }
  return {
    cut, travel, cutFeed, layers,
    hasExtrusion, lines: lines.length, moves, time, filament, pathLength, travelLength,
    bounds: Number.isFinite(mn[0]) ? { min: mn, max: mx } : null,
    warnings: [...warnings],
  }
}

/** Filament mass in grams for a length (mm) of filament of diameter `dia` (mm) and density (g/cm³). */
export const filamentGrams = (lenMm: number, dia: number, density: number) => (Math.PI * (dia / 2) ** 2 * lenMm * density) / 1000

export function fmtDuration(s: number): string {
  if (!Number.isFinite(s)) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60)
  return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${sec} s`
}

// ---------- sample programs ----------

/** A small twisted vase printed in 0.2 mm layers, generated so the preview is never empty. */
export function samplePrint(): string {
  const out = ['; Sample: twisted hexagonal vase, 0.2 mm layers', 'G21 ; mm', 'G90', 'M82', 'M104 S210', 'G28', 'G92 E0', 'G1 Z0.2 F1200']
  let e = 0
  const ePerMm = 0.033 // 0.4 mm line, 0.2 mm layer, 1.75 mm filament
  const cx = 110, cy = 110
  const shape = (z: number, k: number, scale: number) => {
    const pts: [number, number][] = []
    const n = 96
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + z * 0.03
      const r = (18 + 3 * Math.cos(6 * a - z * 0.05) + z * 0.08 * Math.sin(z / 6)) * scale + k
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    return pts
  }
  // skirt
  let px = 0, py = 0
  const skirt = shape(0, 6, 1)
  out.push(`G0 X${skirt[0][0].toFixed(3)} Y${skirt[0][1].toFixed(3)} F6000`)
  ;[px, py] = skirt[0]
  for (const [x, y] of skirt.slice(1)) {
    e += Math.hypot(x - px, y - py) * ePerMm
    out.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} E${e.toFixed(5)} F1200`)
    ;[px, py] = [x, y]
  }
  for (let L = 0; L < 60; L++) {
    const z = 0.2 * (L + 1)
    out.push(`;LAYER:${L}`, `G1 E${(e - 0.8).toFixed(5)} F2400`, `G0 Z${z.toFixed(2)} F3000`)
    const walls = L < 3 ? [0, -0.4, -0.8] : [0, -0.4]
    for (const k of walls) {
      const p = shape(z, k, 1)
      out.push(`G0 X${p[0][0].toFixed(3)} Y${p[0][1].toFixed(3)} F6000`, `G1 E${e.toFixed(5)} F2400`)
      ;[px, py] = p[0]
      for (const [x, y] of p.slice(1)) {
        e += Math.hypot(x - px, y - py) * ePerMm
        out.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} E${e.toFixed(5)} F${L === 0 ? 1200 : 2400}`)
        ;[px, py] = [x, y]
      }
    }
    if (L < 3) {
      // solid bottom: rectilinear infill clipped to a circle
      const R = 15
      for (let i = -R; i <= R; i += 0.8) {
        const h = Math.sqrt(Math.max(0, R * R - i * i))
        const [a, b] = (Math.round(i / 0.8) + L) % 2 ? [-h, h] : [h, -h]
        const p0 = L % 2 ? [cx + i, cy + a] : [cx + a, cy + i]
        const p1 = L % 2 ? [cx + i, cy + b] : [cx + b, cy + i]
        out.push(`G0 X${p0[0].toFixed(3)} Y${p0[1].toFixed(3)} F6000`)
        e += Math.abs(b - a) * ePerMm
        out.push(`G1 X${p1[0].toFixed(3)} Y${p1[1].toFixed(3)} E${e.toFixed(5)} F2400`)
      }
    }
  }
  out.push('G1 E' + (e - 2).toFixed(5) + ' F2400', 'G0 Z20 F3000', 'M104 S0', 'M84')
  return out.join('\n')
}

/** A CNC pocket and contour program using arcs, in inches. */
export const SAMPLE_CNC = `(Sample CNC program: rounded pocket + circle, inch units)
G20 G17 G90
G0 Z0.25
G0 X0.5 Y0.5
M3 S12000
(Pocket in 3 depth passes)
G1 Z-0.05 F10
G1 X2.5 F30
G3 X3.0 Y1.0 I0 J0.5
G1 Y2.0
G3 X2.5 Y2.5 I-0.5 J0
G1 X0.5
G3 X0.0 Y2.0 I0 J-0.5
G1 Y1.0
G3 X0.5 Y0.5 I0.5 J0
G1 Z-0.10 F10
G1 X2.5 F30
G3 X3.0 Y1.0 R0.5
G1 Y2.0
G3 X2.5 Y2.5 R0.5
G1 X0.5
G3 X0.0 Y2.0 R0.5
G1 Y1.0
G3 X0.5 Y0.5 R0.5
G1 Z-0.15 F10
G1 X2.5 F30
G3 X3.0 Y1.0 I0 J0.5
G1 Y2.0
G3 X2.5 Y2.5 I-0.5 J0
G1 X0.5
G3 X0.0 Y2.0 I0 J-0.5
G1 Y1.0
G3 X0.5 Y0.5 I0.5 J0
G0 Z0.25
(Circular hole, clockwise full circles stepping down)
G0 X4.5 Y1.5
G1 Z-0.05 F10
G2 X4.5 Y1.5 I-0.4 J0 F25
G1 Z-0.10 F10
G2 X4.5 Y1.5 I-0.4 J0 F25
G1 Z-0.15 F10
G2 X4.5 Y1.5 I-0.4 J0 F25
G0 Z0.25
M5
G0 X0 Y0
M30`
