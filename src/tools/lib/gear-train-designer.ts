// Involute spur gear geometry and gear train kinematics (simple, idler and compound trains).

const RAD = Math.PI / 180
export const inv = (a: number) => Math.tan(a) - a

export interface GearGeom {
  r: number // pitch radius
  rb: number // base radius
  ra: number // addendum (tip) radius
  rf: number // root radius
}

export function geom(z: number, m: number, alphaDeg: number): GearGeom {
  const r = (z * m) / 2
  return { r, rb: r * Math.cos(alphaDeg * RAD), ra: r + m, rf: Math.max(0.1 * m, r - 1.25 * m) }
}

/**
 * Closed outline of a standard involute spur gear (no profile shift, zero backlash).
 * Returns [x, y] points counter-clockwise; tooth 0 is centered on the +X axis.
 */
export function gearProfile(z: number, m: number, alphaDeg: number, steps = 8): [number, number][] {
  const { rb, ra, rf } = geom(z, m, alphaDeg)
  const half = Math.PI / (2 * z) + inv(alphaDeg * RAD) // half tooth angle at the base circle
  const r0 = Math.max(rb, rf)
  // involute flank: angle from tooth center as a function of radius
  const flank: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const rr = r0 + ((ra - r0) * i) / steps
    const phi = Math.acos(Math.min(1, rb / rr))
    flank.push([rr, half - inv(phi)])
  }
  const pts: [number, number][] = []
  const pitch = (2 * Math.PI) / z
  const pol = (rr: number, a: number): [number, number] => [rr * Math.cos(a), rr * Math.sin(a)]
  for (let k = 0; k < z; k++) {
    const c = k * pitch
    // root arc before the tooth (from previous gap center to this flank start)
    const startA = c - flank[0][1]
    const gapA = c - pitch / 2
    for (let i = 0; i <= 3; i++) pts.push(pol(rf, gapA + ((startA - gapA) * i) / 3))
    if (rf < rb) pts.push(pol(r0, startA))
    // rising flank (right side, negative angle)
    for (const [rr, a] of flank) pts.push(pol(rr, c - a))
    // tip land
    const tipA = flank[flank.length - 1][1]
    for (let i = 1; i < 3; i++) pts.push(pol(ra, c - tipA + (2 * tipA * i) / 3))
    // falling flank
    for (let i = flank.length - 1; i >= 0; i--) pts.push(pol(flank[i][0], c + flank[i][1]))
    if (rf < rb) pts.push(pol(rf, c + flank[0][1]))
    const endGap = c + pitch / 2
    for (let i = 1; i <= 3; i++) pts.push(pol(rf, c + flank[0][1] + ((endGap - c - flank[0][1]) * i) / 3))
  }
  // drop consecutive duplicates
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9)
}

/** Transverse contact ratio of an external mesh. */
export function contactRatio(z1: number, z2: number, m: number, alphaDeg: number): number {
  const a = (m * (z1 + z2)) / 2
  const g1 = geom(z1, m, alphaDeg), g2 = geom(z2, m, alphaDeg)
  const al = alphaDeg * RAD
  return (Math.sqrt(g1.ra ** 2 - g1.rb ** 2) + Math.sqrt(g2.ra ** 2 - g2.rb ** 2) - a * Math.sin(al)) / (Math.PI * m * Math.cos(al))
}

/** Minimum teeth without undercut for a full-depth rack (2 / sin²α). */
export const minTeeth = (alphaDeg: number) => Math.ceil(2 / Math.sin(alphaDeg * RAD) ** 2)

export interface GearIn {
  z: number
  m: number
  link: 'mesh' | 'shaft' // relation to the previous gear (ignored for the first)
  angle: number // direction (deg) from previous gear's center, for meshes
}

export interface GearOut {
  z: number
  m: number
  x: number
  y: number
  layer: number // axial layer (compound gears stack)
  rpm: number // signed: + = counter-clockwise
  torque: number
  ratio: number // rpm_in / rpm_this
  center?: number // center distance to the gear it meshes with
  cr?: number // contact ratio of that mesh
}

export function solveTrain(gears: GearIn[], rpmIn: number, torqueIn: number, eff: number, alphaDeg: number): GearOut[] {
  const out: GearOut[] = []
  gears.forEach((g, i) => {
    if (i === 0) {
      out.push({ z: g.z, m: g.m, x: 0, y: 0, layer: 0, rpm: rpmIn, torque: torqueIn, ratio: 1 })
      return
    }
    const p = out[i - 1]
    if (g.link === 'shaft') {
      out.push({ z: g.z, m: g.m, x: p.x, y: p.y, layer: p.layer + 1, rpm: p.rpm, torque: p.torque, ratio: p.ratio })
      return
    }
    const m = p.m // meshing gears share the module
    const a = (m * (p.z + g.z)) / 2
    const phi = g.angle * RAD
    const rpm = (-p.rpm * p.z) / g.z
    out.push({
      z: g.z, m, x: p.x + a * Math.cos(phi), y: p.y + a * Math.sin(phi), layer: p.layer, rpm,
      torque: (p.torque * eff * g.z) / p.z,
      ratio: rpmIn / rpm, center: a, cr: contactRatio(p.z, g.z, m, alphaDeg),
    })
  })
  return out
}

/**
 * Rotation angle (rad) of every gear at time t, given each gear's speed and the coupling rule above.
 * With gear p at θp, a meshing gear at direction φ sits at φ + π + π/z − (zp/z)(θp − φ).
 * Computed sequentially so meshes stay interlocked regardless of the speed scale.
 */
export function angles(gears: GearIn[], train: GearOut[], theta0: number): number[] {
  const th: number[] = []
  train.forEach((g, i) => {
    if (i === 0) th.push(theta0)
    else if (gears[i].link === 'shaft') th.push(th[i - 1])
    else {
      const p = train[i - 1]
      const phi = gears[i].angle * RAD
      th.push(phi + Math.PI + Math.PI / g.z - (p.z / g.z) * (th[i - 1] - phi))
    }
  })
  return th
}

/** SVG path for a gear outline (mm units). */
export function gearSvg(z: number, m: number, alphaDeg: number, bore: number): string {
  const pts = gearProfile(z, m, alphaDeg, 12)
  const ra = (z * m) / 2 + m
  const s = ra * 2 + 4
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)},${(-y).toFixed(4)}`).join('') + 'Z'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}mm" height="${s}mm" viewBox="${-s / 2} ${-s / 2} ${s} ${s}">
<path d="${d}" fill="none" stroke="black" stroke-width="0.1"/>
${bore > 0 ? `<circle cx="0" cy="0" r="${bore / 2}" fill="none" stroke="black" stroke-width="0.1"/>` : ''}
<circle cx="0" cy="0" r="${(z * m) / 2}" fill="none" stroke="red" stroke-width="0.05" stroke-dasharray="1 1"/>
</svg>`
}
