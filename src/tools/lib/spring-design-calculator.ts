// Helical compression spring design (Shigley's Mechanical Engineering Design, ch. 10). SI: mm, N, MPa.

export interface Material { name: string; A: number; m: number; G: number; E: number; rho: number; ssyFrac: number }
/** Sut = A / d^m (MPa, d in mm), Shigley table 10-4; G, E in MPa; ssyFrac from table 10-6 (set not removed). */
export const MATERIALS: Record<string, Material> = {
  music: { name: 'Music wire A228', A: 2211, m: 0.145, G: 81700, E: 203400, rho: 7850, ssyFrac: 0.45 },
  hd: { name: 'Hard-drawn A227', A: 1783, m: 0.19, G: 80000, E: 197900, rho: 7850, ssyFrac: 0.45 },
  ot: { name: 'Oil-tempered A229', A: 1855, m: 0.187, G: 77200, E: 196500, rho: 7850, ssyFrac: 0.5 },
  crv: { name: 'Chrome-vanadium A232', A: 2005, m: 0.168, G: 77200, E: 203400, rho: 7850, ssyFrac: 0.5 },
  crsi: { name: 'Chrome-silicon A401', A: 1974, m: 0.108, G: 77200, E: 203400, rho: 7850, ssyFrac: 0.5 },
  ss302: { name: 'Stainless 302 A313', A: 1867, m: 0.146, G: 69000, E: 193000, rho: 7920, ssyFrac: 0.35 },
}

export type Ends = 'plain' | 'plainGround' | 'squared' | 'squaredGround'
export const ENDS: Record<Ends, { label: string; extra: number; solidExtra: number; alphaFixed: boolean }> = {
  plain: { label: 'Plain', extra: 0, solidExtra: 1, alphaFixed: false },
  plainGround: { label: 'Plain & ground', extra: 1, solidExtra: 0, alphaFixed: false },
  squared: { label: 'Squared (closed)', extra: 2, solidExtra: 1, alphaFixed: true },
  squaredGround: { label: 'Squared & ground', extra: 2, solidExtra: 0, alphaFixed: true },
}

export interface Input { d: number; D: number; Na: number; L0: number; ends: Ends; mat: string; Fmax: number; Fmin: number; seating: 'fixed' | 'pinned' | 'oneFixed' }

export const sut = (mat: Material, d: number) => mat.A / d ** mat.m
export const wahl = (C: number) => (4 * C - 1) / (4 * C - 4) + 0.615 / C
export const bergstrasser = (C: number) => (4 * C + 2) / (4 * C - 3)
export const rate = (G: number, d: number, D: number, Na: number) => (G * d ** 4) / (8 * D ** 3 * Na)
export const shear = (K: number, F: number, D: number, d: number) => (K * 8 * F * D) / (Math.PI * d ** 3)

export function analyse(i: Input) {
  const mat = MATERIALS[i.mat] ?? MATERIALS.music
  const e = ENDS[i.ends]
  const C = i.D / i.d
  const Nt = i.Na + e.extra
  const Ls = i.d * (Nt + e.solidExtra)
  const pitch = i.ends === 'plain' ? (i.L0 - i.d) / i.Na : i.ends === 'plainGround' ? i.L0 / (i.Na + 1) : i.ends === 'squared' ? (i.L0 - 3 * i.d) / i.Na : (i.L0 - 2 * i.d) / i.Na
  const k = rate(mat.G, i.d, i.D, i.Na)
  const Kw = wahl(C), KB = bergstrasser(C)
  const Sut = sut(mat, i.d)
  const Ssy = mat.ssyFrac * Sut
  const yMax = i.Fmax / k
  const Fs = k * Math.max(0, i.L0 - Ls)
  const tauMax = shear(KB, i.Fmax, i.D, i.d)
  const tauSolid = shear(KB, Fs, i.D, i.d)
  const xi = i.Fmax > 0 ? Fs / i.Fmax - 1 : Infinity // fractional overrun to closure
  const alpha = i.seating === 'fixed' ? 0.5 : i.seating === 'pinned' ? 1 : 0.707
  const Lcrit = (2.63 * i.D) / alpha // stable if L0 < Lcrit (steel, Shigley eq. 10-13)
  // Fatigue (Zimmerli, unpeened): Ssa = 241 MPa, Ssm = 379 MPa; Gerber with Ssu = 0.67 Sut
  const Fa = (i.Fmax - i.Fmin) / 2, Fm = (i.Fmax + i.Fmin) / 2
  const ta = shear(KB, Fa, i.D, i.d), tm = shear(KB, Fm, i.D, i.d)
  const Ssu = 0.67 * Sut
  const Sse = 241 / (1 - (379 / Ssu) ** 2)
  const nf = ta > 0 ? 0.5 * (Ssu / tm) ** 2 * (ta / Sse) * (-1 + Math.sqrt(1 + ((2 * tm * Sse) / (Ssu * ta)) ** 2)) : Infinity
  // Mass of active coils and surge frequency (both ends against flat plates): f = 0.5·sqrt(k/m)
  const massAll = (Math.PI ** 2 * i.d ** 2 * i.D * Nt * mat.rho) / 4 / 1e9 // kg
  const massActive = (Math.PI ** 2 * i.d ** 2 * i.D * i.Na * mat.rho) / 4 / 1e9
  const fn = 0.5 * Math.sqrt((k * 1000) / massActive)
  const wireLen = Math.PI * i.D * Nt
  const checks: { ok: boolean; text: string }[] = [
    { ok: C >= 4 && C <= 12, text: `Spring index C = ${C.toFixed(2)} (4 – 12 preferred)` },
    { ok: i.Na >= 3 && i.Na <= 15, text: `Active coils Na = ${i.Na} (3 – 15 preferred)` },
    { ok: xi >= 0.15, text: `Overrun to closure ξ = ${Number.isFinite(xi) ? xi.toFixed(2) : '∞'} (≥ 0.15)` },
    { ok: tauSolid <= Ssy, text: `Solid-safe: τ_s ${tauSolid.toFixed(0)} MPa ≤ Ssy ${Ssy.toFixed(0)} MPa` },
    { ok: i.L0 < Lcrit, text: `Buckling: L0 ${i.L0} mm < L_cr ${Lcrit.toFixed(0)} mm` },
    { ok: i.L0 - yMax > Ls, text: `Max load fits before solid (L at Fmax ${(i.L0 - yMax).toFixed(1)} > Ls ${Ls.toFixed(1)} mm)` },
  ]
  return { mat, C, Nt, Ls, pitch, k, Kw, KB, Sut, Ssy, yMax, Fs, tauMax, tauSolid, xi, Lcrit, nStatic: Ssy / tauMax, nSolid: Ssy / tauSolid, ta, tm, nf, massAll, fn, wireLen, checks }
}
