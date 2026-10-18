// Daylight factor estimates for a side-lit rectangular room under a CIE overcast sky.
// Average DF: BRE / Littlefair formula. Point DF: numerically integrated sky component + BRE
// split-flux internally reflected component. All lengths in metres.

export interface Win { w: number; h: number; sill: number; x: number }
export interface Room {
  W: number // width along the window wall
  D: number // depth away from the window wall
  H: number // ceiling height
  wins: Win[]
  rFloor: number; rWall: number; rCeil: number
  T: number // diffuse visible transmittance of glazing
  frame: number // glazed fraction of the window opening (net/gross)
  M: number // maintenance (dirt) factor
  obst: number // obstruction angle above horizon, degrees, measured from window centre
  wp: number // working-plane height
}

export interface Surfaces { total: number; glazedNet: number; gross: number; Ravg: number; floor: number; windowWall: number }

export function surfaces(r: Room): Surfaces {
  const floor = r.W * r.D
  const walls = 2 * (r.W + r.D) * r.H
  const gross = r.wins.reduce((s, w) => s + w.w * w.h, 0)
  const total = 2 * floor + walls
  const glazedNet = gross * r.frame
  // windows count as low-reflectance surfaces (~0.1) in the area-weighted mean
  const Ravg = (floor * r.rFloor + floor * r.rCeil + (walls - gross) * r.rWall + gross * 0.1) / total
  return { total, glazedNet, gross, Ravg, floor, windowWall: r.W * r.H }
}

/** BRE average daylight factor (%): DF = T·Aw·θ·M / (A·(1−R²)). */
export function averageDF(r: Room): number {
  const s = surfaces(r)
  const theta = 90 - r.obst
  return (r.T * s.glazedNet * theta * r.M) / (s.total * (1 - s.Ravg ** 2))
}

/** BRE room-depth criterion: L/W + L/H ≤ 2/(1 − Rb) (Rb: mean reflectance of the back half of the room). */
export function depthCriterion(r: Room): { lhs: number; rhs: number; ok: boolean } {
  const hw = Math.max(...r.wins.map((w) => w.sill + w.h), 0)
  const lhs = r.D / r.W + r.D / Math.max(0.1, hw)
  const Rb = (r.W * r.D * 0.5 * (r.rFloor + r.rCeil) + (r.W + r.D) * r.H * r.rWall) / (r.W * r.D + (r.W + r.D) * r.H)
  const rhs = 2 / (1 - Rb)
  return { lhs, rhs, ok: lhs <= rhs }
}

/** Analytic form factor from a horizontal element to a vertical rectangle [0,a]×[0,b] at distance c (corner below the element's normal line). */
export function ffPerp(a: number, b: number, c: number): number {
  if (a <= 0 || b <= 0) return 0
  const k = Math.hypot(b, c)
  return (Math.atan(a / c) - (c / k) * Math.atan(a / k)) / (2 * Math.PI)
}

/** Obstruction coefficient C for the BRE IRC formula (interpolated: 0°→39, 10°→35, 20°→31, 30°→25, 40°→20, 50°→14, 60°→10, 70°→7, 80°→5). */
export function irCoefC(obst: number): number {
  const T = [39, 35, 31, 25, 20, 14, 10, 7, 5]
  const i = Math.max(0, Math.min(7.999, obst / 10))
  const k = Math.floor(i)
  return T[k] + (T[k + 1] - T[k]) * (i - k)
}

/** Internally reflected component (%), BRE split-flux: 0.85·W/(A(1−R))·(C·Rfw + 5·Rcw). */
export function irc(r: Room): number {
  const s = surfaces(r)
  const mid = r.wins.length ? r.wins.reduce((t, w) => t + (w.sill + w.h / 2) * w.w * w.h, 0) / Math.max(1e-9, s.gross) : r.H / 2
  // below mid-height: floor + lower walls (excluding window wall); above: ceiling + upper walls
  const wallsNoWin = (2 * r.D + r.W) * r.H
  const lowW = wallsNoWin * (mid / r.H), upW = wallsNoWin - lowW
  const Rfw = (s.floor * r.rFloor + lowW * r.rWall) / (s.floor + lowW)
  const Rcw = (s.floor * r.rCeil + upW * r.rWall) / (s.floor + upW)
  return ((0.85 * s.gross * r.frame) / (s.total * (1 - s.Ravg))) * (irCoefC(r.obst) * Rfw + 5 * Rcw)
}

/**
 * Sky component (%) at point (px, py) on the working plane (px along the window wall, py = distance from it),
 * CIE overcast sky L(γ) ∝ (1 + 2 sin γ), with an infinite horizontal obstruction of the given angle.
 * Glass transmittance/frame/maintenance are not included here.
 */
export function skyComponent(r: Room, px: number, py: number, n = 14, sky: 'cie' | 'uniform' = 'cie'): number {
  const c = Math.max(0.02, py)
  const tanO = Math.tan((r.obst * Math.PI) / 180)
  let E = 0
  for (const w of r.wins) {
    const z0 = w.sill - r.wp, z1 = w.sill + w.h - r.wp
    if (z1 <= 0) continue
    const zs = Math.max(0, z0)
    const dx = w.w / n, dz = (z1 - zs) / n
    for (let i = 0; i < n; i++) {
      const x = w.x + (i + 0.5) * dx - px
      for (let j = 0; j < n; j++) {
        const z = zs + (j + 0.5) * dz
        const rr = Math.hypot(x, c, z)
        const sinG = z / rr
        // ray elevation vs obstruction: obstruction height seen from the window centre
        const blocked = z / Math.hypot(x, c) < tanO
        const Lsky = sky === 'uniform' ? 1 : (1 + 2 * sinG) / 3
        const L = blocked ? 0.1 * (sky === 'uniform' ? 1 : (1 + 2 * Math.sin((r.obst * Math.PI) / 360)) / 3) : Lsky // obstruction ≈ 10% of sky luminance → ERC
        E += L * (z / rr) * (c / rr) * (dx * dz) / (rr * rr)
      }
    }
  }
  // unobstructed horizontal illuminance under CIE overcast: (7/9)·π·Lz, with L in units of Lz
  return (E / (sky === 'uniform' ? Math.PI : (7 / 9) * Math.PI)) * 100
}

export interface Grid { nx: number; ny: number; dx: number; dy: number; df: number[]; sc: number[] }

/** Point daylight factors on a working-plane grid (excluding a 0.5 m perimeter band is left to the caller). */
export function grid(r: Room, nx = 24, ny = 18): Grid {
  const dx = r.W / nx, dy = r.D / ny
  const ic = irc(r) * r.M
  const df: number[] = [], sc: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = skyComponent(r, (i + 0.5) * dx, (j + 0.5) * dy, 10)
      sc.push(s)
      df.push(s * r.T * r.frame * r.M + ic)
    }
  }
  return { nx, ny, dx, dy, df, sc }
}

export function stats(g: Grid, r: Room, band = 0.5): { mean: number; min: number; median: number; uniformity: number; over: (t: number) => number; noSky: number } {
  const vals: number[] = [], sky: number[] = []
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = (i + 0.5) * g.dx, y = (j + 0.5) * g.dy
    if (x < band || x > r.W - band || y < band || y > r.D - band) continue
    vals.push(g.df[j * g.nx + i])
    sky.push(g.sc[j * g.nx + i])
  }
  if (!vals.length) {
    vals.push(...g.df)
    sky.push(...g.sc)
  }
  const sorted = [...vals].sort((a, b) => a - b)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return {
    mean, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], uniformity: sorted[0] / mean,
    over: (t) => vals.filter((v) => v >= t).length / vals.length,
    noSky: sky.filter((v) => v < 0.05).length / sky.length,
  }
}
