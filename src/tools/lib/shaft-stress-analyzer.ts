// Stepped shaft under transverse loads and torque: reactions, bending/torsion diagrams,
// von Mises stress and DE-Goodman fatigue safety factor (Shigley, ch. 6–7). Units: mm, N, N·mm, MPa.

export interface Segment { len: number; d: number }
export interface Load { x: number; fy: number; fz: number; torque: number; label: string }
export interface Material { name: string; sut: number; sy: number }

export const MATERIALS: Material[] = [
  { name: 'AISI 1020 cold-drawn', sut: 470, sy: 390 },
  { name: 'AISI 1045 cold-drawn', sut: 630, sy: 530 },
  { name: 'AISI 1050 cold-drawn', sut: 690, sy: 580 },
  { name: 'AISI 4140 Q&T 425 °C', sut: 1250, sy: 1140 },
  { name: 'AISI 4340 Q&T 540 °C', sut: 1140, sy: 1040 },
  { name: 'Stainless 304 annealed', sut: 585, sy: 235 },
  { name: 'Aluminium 6061-T6', sut: 310, sy: 276 },
]

/** Surface factor ka = a·Sut^b (Shigley table 6-2, Sut in MPa). */
export const FINISH: Record<string, [string, number, number]> = {
  ground: ['Ground', 1.58, -0.085],
  machined: ['Machined / cold-drawn', 4.51, -0.265],
  hotrolled: ['Hot-rolled', 57.7, -0.718],
  forged: ['As-forged', 272, -0.995],
}
/** Reliability factor ke. */
export const RELIABILITY: [number, number][] = [[0.5, 1], [0.9, 0.897], [0.95, 0.868], [0.99, 0.814], [0.999, 0.753], [0.9999, 0.702]]

export const shaftLength = (segs: Segment[]) => segs.reduce((s, g) => s + g.len, 0)

/** Diameter at position x (left-continuous at a step: the segment that contains x). */
export function diameterAt(segs: Segment[], x: number): number {
  let acc = 0
  for (const g of segs) {
    acc += g.len
    if (x <= acc + 1e-9) return g.d
  }
  return segs[segs.length - 1]?.d ?? 0
}

/** Shoulder positions with the smaller adjoining diameter. */
export function shoulders(segs: Segment[]): { x: number; d: number; D: number }[] {
  const out: { x: number; d: number; D: number }[] = []
  let acc = 0
  for (let i = 0; i < segs.length - 1; i++) {
    acc += segs[i].len
    if (segs[i].d !== segs[i + 1].d) out.push({ x: acc, d: Math.min(segs[i].d, segs[i + 1].d), D: Math.max(segs[i].d, segs[i + 1].d) })
  }
  return out
}

/** Bearing reactions (simple supports at xa, xb) in the y and z planes. */
export function reactions(loads: Load[], xa: number, xb: number): { ay: number; by: number; az: number; bz: number } {
  const span = xb - xa
  const solve = (k: 'fy' | 'fz') => {
    const sumF = loads.reduce((s, l) => s + l[k], 0)
    const sumM = loads.reduce((s, l) => s + l[k] * (l.x - xa), 0)
    const rb = -sumM / span
    return [-sumF - rb, rb]
  }
  const [ay, by] = solve('fy'), [az, bz] = solve('fz')
  return { ay, by, az, bz }
}

export interface Station { x: number; d: number; my: number; mz: number; m: number; t: number; sigma: number; tau: number; vm: number }

/** Internal moments (N·mm) and torque at x; contributions strictly left of x. */
export function internal(loads: Load[], xa: number, xb: number, x: number) {
  const r = reactions(loads, xa, xb)
  const pts = [...loads.map((l) => ({ x: l.x, fy: l.fy, fz: l.fz, t: l.torque })), { x: xa, fy: r.ay, fz: r.az, t: 0 }, { x: xb, fy: r.by, fz: r.bz, t: 0 }]
  let my = 0, mz = 0, t = 0
  for (const p of pts) if (p.x < x - 1e-9) {
    my += p.fy * (x - p.x)
    mz += p.fz * (x - p.x)
    t += p.t
  }
  return { my, mz, t: t * 1000 }
}

/** Nominal stresses at a section (no stress concentration). */
export function sectionStress(d: number, m: number, t: number) {
  const sigma = (32 * Math.abs(m)) / (Math.PI * d ** 3)
  const tau = (16 * Math.abs(t)) / (Math.PI * d ** 3)
  return { sigma, tau, vm: Math.sqrt(sigma ** 2 + 3 * tau ** 2) }
}

export function stations(segs: Segment[], loads: Load[], xa: number, xb: number, n = 400): Station[] {
  const L = shaftLength(segs)
  const xs = new Set<number>()
  for (let i = 0; i <= n; i++) xs.add((L * i) / n)
  for (const l of loads) [l.x - 1e-6, l.x + 1e-6].forEach((v) => v >= 0 && v <= L && xs.add(v))
  for (const s of shoulders(segs)) [s.x - 1e-6, s.x + 1e-6].forEach((v) => xs.add(v))
  return [...xs].sort((a, b) => a - b).map((x) => {
    const { my, mz, t } = internal(loads, xa, xb, x)
    const m = Math.hypot(my, mz)
    const d = diameterAt(segs, x)
    return { x, d, my, mz, m, t, ...sectionStress(d, m, t) }
  })
}

/** Marin-modified endurance limit (MPa) for a rotating round shaft of diameter d (mm). */
export function enduranceLimit(sut: number, d: number, finish: string, reliability: number, tempFactor = 1): { se: number; sePrime: number; ka: number; kb: number; ke: number } {
  const sePrime = sut <= 1400 ? 0.5 * sut : 700
  const [, a, b] = FINISH[finish] ?? FINISH.machined
  const ka = a * sut ** b
  const kb = d <= 2.79 ? 1 : d <= 51 ? 1.24 * d ** -0.107 : d <= 254 ? 1.51 * d ** -0.157 : 0.6
  const ke = RELIABILITY.find(([r]) => r === reliability)?.[1] ?? 0.814
  return { se: ka * kb * ke * tempFactor * sePrime, sePrime, ka, kb, ke }
}

/** DE-Goodman safety factor for fully reversed bending Ma and steady torque Tm (Shigley eq. 7-8). */
export function goodman(d: number, ma: number, tm: number, kf: number, kfs: number, se: number, sut: number): number {
  const inv = (16 / (Math.PI * d ** 3)) * ((2 * kf * Math.abs(ma)) / se + (Math.sqrt(3) * kfs * Math.abs(tm)) / sut)
  return inv > 0 ? 1 / inv : Infinity
}

/** First-cycle yield factor using peak von Mises with stress concentration. */
export function yieldFactor(d: number, m: number, t: number, kf: number, kfs: number, sy: number): number {
  const s = (32 * kf * Math.abs(m)) / (Math.PI * d ** 3), tau = (16 * kfs * Math.abs(t)) / (Math.PI * d ** 3)
  const vm = Math.sqrt(s * s + 3 * tau * tau)
  return vm > 0 ? sy / vm : Infinity
}

export interface Check { x: number; d: number; where: string; m: number; t: number; vm: number; nf: number; ny: number; se: number; kf: number; kfs: number }

/** Checks every station; shoulders use the given Kf/Kfs on the smaller diameter. */
export function checkShaft(segs: Segment[], loads: Load[], xa: number, xb: number, mat: Material, finish: string, reliability: number, kf: number, kfs: number): { st: Station[]; checks: Check[]; critical: Check | null } {
  const st = stations(segs, loads, xa, xb)
  const sh = shoulders(segs)
  const checks: Check[] = []
  for (const s of st) {
    const shoulder = sh.find((q) => Math.abs(q.x - s.x) < 1e-3)
    const d = shoulder ? shoulder.d : s.d
    const [k1, k2] = shoulder ? [kf, kfs] : [1, 1]
    const se = enduranceLimit(mat.sut, d, finish, reliability).se
    const { sigma, tau } = sectionStress(d, s.m, s.t)
    checks.push({ x: s.x, d, where: shoulder ? `Shoulder ⌀${shoulder.D}→⌀${shoulder.d}` : `⌀${d}`, m: s.m, t: s.t, vm: Math.sqrt((k1 * sigma) ** 2 + 3 * (k2 * tau) ** 2), nf: goodman(d, s.m, s.t, k1, k2, se, mat.sut), ny: yieldFactor(d, s.m, s.t, k1, k2, mat.sy), se, kf: k1, kfs: k2 })
  }
  const critical = checks.reduce<Check | null>((b, c) => (!b || c.nf < b.nf ? c : b), null)
  return { st, checks, critical }
}
