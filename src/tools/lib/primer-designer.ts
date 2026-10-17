// PCR primer design: SantaLucia (1998) unified nearest-neighbour Tm with von Ahsen (2001) Na⁺-equivalent salt
// correction, GC clamp, hairpin / self-dimer / cross-dimer screening (ΔG37 of best complementary stretch),
// and a Primer3-style penalty search for primer pairs on a template.

export interface Cond { na: number; mg: number; dntp: number; primerNM: number } // mM, mM, mM, nM

export const DEFAULT_COND: Cond = { na: 50, mg: 1.5, dntp: 0.2, primerNM: 250 }

// ΔH (kcal/mol), ΔS (cal/K·mol) for 5'XY3'/3'X'Y'5'
const NN: Record<string, [number, number]> = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2], AT: [-7.2, -20.4], TA: [-7.2, -21.3], CA: [-8.5, -22.7], TG: [-8.5, -22.7],
  GT: [-8.4, -22.4], AC: [-8.4, -22.4], CT: [-7.8, -21.0], AG: [-7.8, -21.0], GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4], GG: [-8.0, -19.9], CC: [-8.0, -19.9],
}
const INIT_GC: [number, number] = [0.1, -2.8]
const INIT_AT: [number, number] = [2.3, 4.1]
const R = 1.987 // cal/K·mol

export const clean = (s: string) => s.toUpperCase().replace(/[^ACGT]/g, '')
const COMP: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' }
export const revComp = (s: string) => s.split('').reverse().map((c) => COMP[c] ?? 'N').join('')
export const gc = (s: string) => (s.length ? (s.match(/[GC]/g)?.length ?? 0) / s.length : 0)

/** ΔH, ΔS of a perfectly matched duplex (no salt correction). */
export function thermo(s: string): { dH: number; dS: number } {
  let dH = 0, dS = 0
  for (let i = 0; i < s.length - 1; i++) {
    const p = NN[s.slice(i, i + 2)]
    if (p) { dH += p[0]; dS += p[1] }
  }
  for (const end of [s[0], s[s.length - 1]]) {
    const [h, e] = end === 'G' || end === 'C' ? INIT_GC : INIT_AT
    dH += h
    dS += e
  }
  if (s === revComp(s)) dS += -1.4
  return { dH, dS }
}

/** Monovalent-equivalent [Na⁺] in M (von Ahsen et al. 2001): Na + 120·√(Mg − dNTP). */
export const naEq = (c: Cond) => (c.na + 120 * Math.sqrt(Math.max(0, c.mg - c.dntp))) / 1000

/** Melting temperature (°C), SantaLucia 1998 with salt-corrected entropy. */
export function tm(seq: string, c: Cond = DEFAULT_COND): number {
  const s = clean(seq)
  if (s.length < 2) return NaN
  const { dH, dS } = thermo(s)
  const dSs = dS + 0.368 * (s.length - 1) * Math.log(naEq(c))
  const x = s === revComp(s) ? 1 : 4
  return (dH * 1000) / (dSs + R * Math.log((c.primerNM * 1e-9) / x)) - 273.15
}

/** ΔG37 (kcal/mol) of the duplex formed by `s` (5'→3') with its complement, salt-corrected. */
export function dG37(s: string, c: Cond = DEFAULT_COND): number {
  const { dH, dS } = thermo(s)
  return dH - (310.15 * (dS + 0.368 * (s.length - 1) * Math.log(naEq(c)))) / 1000
}

/** ΔG37 of the nearest-neighbour stacks only (no initiation or symmetry terms), salt-corrected. */
export function stackDG(s: string, c: Cond = DEFAULT_COND): number {
  let g = 0
  for (let i = 0; i < s.length - 1; i++) {
    const p = NN[s.slice(i, i + 2)]
    if (p) g += p[0] - (310.15 * (p[1] + 0.368 * Math.log(naEq(c)))) / 1000
  }
  return g
}

const pairs = (a: string, b: string) => COMP[a] === b

export interface Dimer { dG: number; offset: number; top: string; mid: string; bottom: string; threePrime: boolean }

/**
 * Best (most negative ΔG) contiguous complementary stretch when `a` (5'→3') anneals to `b` (also given 5'→3'),
 * considering every alignment. The returned strings show the alignment (b reversed under a).
 */
export function dimer(a: string, b: string, c: Cond = DEFAULT_COND): Dimer {
  const rb = b.split('').reverse().join('') // b written 3'→5' under a
  let best: Dimer = { dG: 0, offset: 0, top: a, mid: '', bottom: rb, threePrime: false }
  for (let off = -(rb.length - 1); off < a.length; off++) {
    // position i in a pairs with position i - off in rb
    let run = '', runEnd = -1
    const scoreRun = (end: number) => {
      if (run.length < 3) return
      const g = stackDG(run, c) + 1.96 // stacks + bimolecular initiation (SantaLucia 2004)
      if (g < best.dG) {
        const start = end - run.length + 1
        const touches3 = end >= a.length - 2 || start - off <= 1 // a's 3' end or b's 3' end (index 0 in rb = b's 3')
        best = { dG: g, offset: off, top: '', mid: '', bottom: '', threePrime: touches3 }
        const pad = Math.max(0, -off), padA = Math.max(0, off) // a[i] sits above rb[i - off]
        best.top = ' '.repeat(pad) + a
        best.bottom = ' '.repeat(padA) + rb
        const L = Math.max(best.top.length, best.bottom.length)
        let mid = ''
        for (let k = 0; k < L; k++) {
          const ia = k - pad, ib = k - padA
          mid += ia >= start && ia <= end && ib >= 0 ? '|' : ia >= 0 && ia < a.length && ib >= 0 && ib < rb.length && pairs(a[ia], rb[ib]) ? ':' : ' '
        }
        best.mid = mid
      }
    }
    for (let i = 0; i < a.length; i++) {
      const j = i - off
      if (j >= 0 && j < rb.length && pairs(a[i], rb[j])) {
        run += a[i]
        runEnd = i
      } else {
        scoreRun(runEnd)
        run = ''
      }
    }
    scoreRun(runEnd)
  }
  return best
}

const LOOP: Record<number, number> = { 3: 3.5, 4: 3.5, 5: 3.3, 6: 4.0, 7: 4.2, 8: 4.3, 9: 4.5 }

export interface Hairpin { dG: number; stem: number; loop: number; i: number; j: number; threePrime: boolean }

/** Most stable simple hairpin (stem ≥ 3 bp, loop ≥ 3 nt). */
export function hairpin(s: string, c: Cond = DEFAULT_COND): Hairpin {
  let best: Hairpin = { dG: 0, stem: 0, loop: 0, i: -1, j: -1, threePrime: false }
  const n = s.length
  for (let i = 0; i < n; i++)
    for (let j = n - 1; j > i + 3; j--) {
      let k = 0
      while (i + k < j - k - 3 && pairs(s[i + k], s[j - k])) k++
      if (k < 3) continue
      const loop = j - k - (i + k) + 1
      const g = stackDG(s.slice(i, i + k), c) + (loop <= 9 ? LOOP[loop] : 4.5 + 1.08 * Math.log(loop / 9)) // stem stacks + loop penalty
      if (g < best.dG) best = { dG: g, stem: k, loop, i, j, threePrime: j >= n - 2 }
    }
  return best
}

/** ΔG of the 3'-terminal pentamer: more negative = "stickier" 3' end (Primer3 advises ≥ −9 kcal/mol). */
export const end3Stability = (s: string, c: Cond = DEFAULT_COND) => stackDG(s.slice(-5), c)

export interface PrimerInfo {
  seq: string; len: number; tm: number; gc: number; clamp: number; hairpin: Hairpin; self: Dimer; end3: number; maxRun: number; repeats: boolean
  warnings: string[]
}

export function analyze(seq: string, c: Cond = DEFAULT_COND): PrimerInfo {
  const s = clean(seq)
  const clamp = (s.slice(-5).match(/[GC]/g) ?? []).length
  const maxRun = Math.max(0, ...(s.match(/(.)\1*/g) ?? []).map((r) => r.length))
  const repeats = /(..)\1{3,}/.test(s)
  const info: PrimerInfo = { seq: s, len: s.length, tm: tm(s, c), gc: gc(s), clamp, hairpin: hairpin(s, c), self: dimer(s, s, c), end3: end3Stability(s, c), maxRun, repeats, warnings: [] }
  const w = info.warnings
  if (s.length < 17 || s.length > 30) w.push(`Length ${s.length} nt: 18–25 is typical.`)
  if (info.gc < 0.4 || info.gc > 0.6) w.push(`GC ${Math.round(info.gc * 100)} %: aim for 40–60 %.`)
  if (!/[GC]$/.test(s)) w.push("No G/C at the 3' end (weak GC clamp).")
  if (clamp > 3) w.push(`${clamp} G/C in the last 5 bases: 3' end may prime non-specifically.`)
  if (maxRun >= 4) w.push(`Run of ${maxRun} identical bases.`)
  if (repeats) w.push('Dinucleotide repeat (≥ 4 ×).')
  if (info.hairpin.dG < (info.hairpin.threePrime ? -2 : -3)) w.push(`Hairpin ΔG ${info.hairpin.dG.toFixed(1)} kcal/mol${info.hairpin.threePrime ? " at the 3' end" : ''}.`)
  if (info.self.dG < (info.self.threePrime ? -5 : -6)) w.push(`Self-dimer ΔG ${info.self.dG.toFixed(1)} kcal/mol${info.self.threePrime ? " involving the 3' end" : ''}.`)
  if (info.end3 < -9) w.push(`3' end very stable (ΔG ${info.end3.toFixed(1)}).`)
  return info
}

export interface Settings { minLen: number; maxLen: number; tmOpt: number; tmMin: number; tmMax: number; gcMin: number; gcMax: number; prodMin: number; prodMax: number; maxTmDiff: number }

export const DEFAULT_SETTINGS: Settings = { minLen: 18, maxLen: 25, tmOpt: 60, tmMin: 55, tmMax: 65, gcMin: 0.4, gcMax: 0.65, prodMin: 200, prodMax: 500, maxTmDiff: 3 }

interface Cand { seq: string; pos: number; info: PrimerInfo; pen: number }

function penalty(i: PrimerInfo, st: Settings): number {
  let p = Math.abs(i.tm - st.tmOpt)
  if (i.gc < st.gcMin) p += (st.gcMin - i.gc) * 100
  if (i.gc > st.gcMax) p += (i.gc - st.gcMax) * 100
  if (!/[GC]$/.test(i.seq)) p += 2
  if (i.clamp > 3) p += 3
  if (i.maxRun >= 4) p += (i.maxRun - 3) * 3
  if (i.repeats) p += 5
  p += Math.max(0, -i.hairpin.dG - 2) * 2
  p += Math.max(0, -i.self.dG - 5) * (i.self.threePrime ? 3 : 1.5)
  p += Math.max(0, -i.end3 - 9) * 2
  return p
}

export interface Pair { fwd: Cand; rev: Cand; product: number; cross: Dimer; pen: number }

/** Search primer pairs on `template`, optionally requiring the product to span [tStart, tEnd] (0-based). */
export function design(template: string, st: Settings, c: Cond = DEFAULT_COND, target?: [number, number], top = 8): Pair[] {
  const T = clean(template)
  const cands = (strand: 1 | -1): Cand[] => {
    const out: Cand[] = []
    for (let len = st.minLen; len <= st.maxLen; len++)
      for (let p = 0; p + len <= T.length; p++) {
        const site = T.slice(p, p + len)
        if (target && (strand === 1 ? p + len > target[0] : p < target[1])) continue
        const seq = strand === 1 ? site : revComp(site)
        const t = tm(seq, c)
        if (t < st.tmMin || t > st.tmMax) continue
        const g = gc(seq)
        if (g < st.gcMin - 0.1 || g > st.gcMax + 0.1) continue
        const info = analyze(seq, c)
        out.push({ seq, pos: p, info, pen: penalty(info, st) })
      }
    return out.sort((a, b) => a.pen - b.pen).slice(0, 60)
  }
  const F = cands(1), Rv = cands(-1)
  const res: Pair[] = []
  for (const f of F)
    for (const r of Rv) {
      const product = r.pos + r.seq.length - f.pos
      if (product < st.prodMin || product > st.prodMax || r.pos <= f.pos) continue
      const dTm = Math.abs(f.info.tm - r.info.tm)
      if (dTm > st.maxTmDiff) continue
      const cross = dimer(f.seq, r.seq, c)
      const pen = f.pen + r.pen + dTm + Math.max(0, -cross.dG - 5) * (cross.threePrime ? 3 : 1.5)
      res.push({ fwd: f, rev: r, product, cross, pen })
    }
  res.sort((a, b) => a.pen - b.pen)
  // keep diverse pairs (different forward or reverse sites)
  const out: Pair[] = []
  for (const p of res) {
    if (out.some((o) => Math.abs(o.fwd.pos - p.fwd.pos) < 3 && Math.abs(o.rev.pos - p.rev.pos) < 3)) continue
    out.push(p)
    if (out.length >= top) break
  }
  return out
}

export const SAMPLE_TEMPLATE =
  'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA'
