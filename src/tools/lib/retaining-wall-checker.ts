// Cantilever retaining wall stability (per metre run): Rankine / Coulomb active pressure on the
// vertical plane through the heel, overturning about the toe, sliding with passive resistance,
// eccentricity and Meyerhof bearing capacity with depth and inclination factors.

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export interface Wall {
  stemH: number // stem height above base (m)
  tTop: number // stem thickness at top (m)
  tBot: number // stem thickness at base (m); front face battered, back face vertical
  toe: number // toe projection (m)
  heel: number // heel projection behind stem (m)
  tBase: number // base slab thickness (m)
  gc: number // concrete unit weight (kN/m³)
  g1: number // backfill unit weight (kN/m³)
  phi1: number // backfill friction angle (°)
  beta: number // backfill slope (°)
  q: number // uniform surcharge on backfill (kPa)
  method: 'rankine' | 'coulomb'
  delta: number // wall friction for Coulomb (°)
  g2: number // foundation soil unit weight
  phi2: number // foundation soil friction angle (°)
  c2: number // foundation soil cohesion (kPa)
  D: number // depth of soil in front of the toe (m) measured to the underside of the base
  k1: number // base friction factor: δ' = k1·φ2
  k2: number // adhesion factor: ca = k2·c2
  passive: boolean
}

export const rankineKa = (phi: number, beta = 0) => {
  const b = rad(beta), p = rad(phi)
  if (beta === 0) return (1 - Math.sin(p)) / (1 + Math.sin(p))
  if (beta >= phi) return NaN
  const r = Math.sqrt(Math.cos(b) ** 2 - Math.cos(p) ** 2)
  return (Math.cos(b) * (Math.cos(b) - r)) / (Math.cos(b) + r)
}
export const rankineKp = (phi: number) => Math.tan(rad(45 + phi / 2)) ** 2

/** Coulomb active coefficient. theta = back face inclination from vertical, delta = wall friction, beta = backfill slope (°). */
export function coulombKa(phi: number, delta: number, beta = 0, theta = 0) {
  const p = rad(phi), d = rad(delta), b = rad(beta), t = rad(theta)
  if (beta >= phi) return NaN
  const root = Math.sqrt((Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(d + t) * Math.cos(t - b)))
  return Math.cos(p - t) ** 2 / (Math.cos(t) ** 2 * Math.cos(d + t) * (1 + root) ** 2)
}

/** Bearing capacity factors (Reissner/Prandtl Nq, Nc and Vesic Nγ). */
export function bearingFactors(phi: number) {
  const p = rad(phi)
  const Nq = Math.tan(rad(45 + phi / 2)) ** 2 * Math.exp(Math.PI * Math.tan(p))
  const Nc = phi === 0 ? 5.14 : (Nq - 1) / Math.tan(p)
  const Ng = 2 * (Nq + 1) * Math.tan(p)
  return { Nc, Nq, Ng }
}

export interface Part { name: string; W: number; x: number }

export interface Result {
  Ka: number
  Kp: number
  Hp: number // height of the virtual back
  Pa: number
  Ph: number
  Pv: number
  Pq: number // surcharge thrust (along the same direction as Pa)
  parts: Part[]
  V: number
  MR: number
  MO: number
  FSo: number
  Pp: number
  FSs: number
  e: number
  qToe: number
  qHeel: number
  qu: number
  FSb: number
  psi: number
  B: number
}

export function analyse(w: Wall): Result {
  const B = w.toe + w.tBot + w.heel
  const H = w.stemH + w.tBase
  const rise = w.heel * Math.tan(rad(w.beta))
  const Hp = H + rise
  const Ka = w.method === 'rankine' ? rankineKa(w.phi1, w.beta) : coulombKa(w.phi1, w.delta, w.beta, 0)
  const ang = rad(w.method === 'rankine' ? w.beta : w.delta) // thrust inclination from horizontal
  const Pa = 0.5 * w.g1 * Hp * Hp * Ka
  const Pq = w.q * Ka * Hp
  const Ph = (Pa + Pq) * Math.cos(ang)
  const Pv = (Pa + Pq) * Math.sin(ang)
  const batter = w.tBot - w.tTop
  const parts: Part[] = [
    { name: 'Stem (rectangle)', W: w.tTop * w.stemH * w.gc, x: w.toe + batter + w.tTop / 2 },
    { name: 'Stem (front batter)', W: 0.5 * batter * w.stemH * w.gc, x: w.toe + (2 / 3) * batter },
    { name: 'Base slab', W: B * w.tBase * w.gc, x: B / 2 },
    { name: 'Soil over heel', W: w.heel * w.stemH * w.g1, x: B - w.heel / 2 },
    { name: 'Sloping soil wedge', W: 0.5 * w.heel * rise * w.g1, x: B - w.heel / 3 },
    { name: 'Surcharge on heel', W: w.q * w.heel, x: B - w.heel / 2 },
    { name: 'Vertical thrust Pv', W: Pv, x: B },
  ].filter((p) => p.W > 1e-9)
  const V = parts.reduce((a, p) => a + p.W, 0)
  const MR = parts.reduce((a, p) => a + p.W * p.x, 0)
  const MO = Pa * Math.cos(ang) * (Hp / 3) + Pq * Math.cos(ang) * (Hp / 2)
  const Kp = rankineKp(w.phi2)
  const Pp = w.passive ? 0.5 * Kp * w.g2 * w.D * w.D + 2 * w.c2 * Math.sqrt(Kp) * w.D : 0
  const resist = V * Math.tan(rad(w.k1 * w.phi2)) + B * w.k2 * w.c2 + Pp
  const e = B / 2 - (MR - MO) / V
  const qToe = (V / B) * (1 + (6 * e) / B)
  const qHeel = (V / B) * (1 - (6 * e) / B)
  // Meyerhof general bearing equation on effective width B' = B − 2e
  const Bp = B - 2 * Math.abs(e)
  const { Nc, Nq, Ng } = bearingFactors(w.phi2)
  const qs = w.g2 * w.D
  const p2 = rad(w.phi2)
  const Fcd = 1 + 0.4 * (w.D / Bp)
  const Fqd = 1 + 2 * Math.tan(p2) * (1 - Math.sin(p2)) ** 2 * (w.D / Bp)
  const psi = deg(Math.atan(Ph / V))
  const Fci = (1 - psi / 90) ** 2
  const Fgi = w.phi2 > 0 ? Math.max(0, 1 - psi / w.phi2) ** 2 : 0
  const qu = w.c2 * Nc * Fcd * Fci + qs * Nq * Fqd * Fci + 0.5 * w.g2 * Bp * Ng * Fgi
  return {
    Ka, Kp, Hp, Pa, Ph, Pv, Pq, parts, V, MR, MO, FSo: MR / MO, Pp, FSs: resist / Ph, e, qToe, qHeel, qu,
    FSb: Bp > 0 && qToe > 0 ? qu / qToe : 0, psi, B,
  }
}

// Cantilever wall worked example in the style of standard foundation-engineering textbooks:
// 6 m stem (0.5 m top, 0.7 m bottom, front battered), 0.7 m toe, 2.6 m heel, 4 m × 0.7 m base,
// backfill γ = 18, φ = 30°, slope 10°; foundation γ = 19, φ = 20°, c = 40 kPa, D = 1.5 m, γc = 23.58.
export const EXAMPLE: Wall = {
  stemH: 6, tTop: 0.5, tBot: 0.7, toe: 0.7, heel: 2.6, tBase: 0.7, gc: 23.58,
  g1: 18, phi1: 30, beta: 10, q: 0, method: 'rankine', delta: 20,
  g2: 19, phi2: 20, c2: 40, D: 1.5, k1: 2 / 3, k2: 2 / 3, passive: true,
}
