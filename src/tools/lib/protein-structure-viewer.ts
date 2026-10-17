// Protein structure model on top of the molecule-viewer PDB parser: residues, chains,
// secondary structure (HELIX/SHEET records or a CA-geometry estimate), sequence and a synthetic demo.
import { dist, parsePdb, place, type Molecule } from './molecule-viewer'

export type SS = 'H' | 'E' | 'C'
export interface Residue {
  chain: string
  seq: number
  name: string
  one: string
  atoms: number[]
  ca: number
  o: number
  ss: SS
  b: number
}
export interface SSElement { type: 'H' | 'E'; chain: string; start: number; end: number }
export interface Protein {
  mol: Molecule
  residues: Residue[]
  chains: string[]
  elements: SSElement[]
  ssSource: 'records' | 'estimated' | 'none'
  bfactor: number[]
  ligands: { name: string; chain: string; seq: number; atoms: number[] }[]
}

export const ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M',
  PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', SEC: 'U', PYL: 'O', MSE: 'M',
}
const THREE: Record<string, string> = Object.fromEntries(Object.entries(ONE).filter(([k]) => k !== 'MSE').map(([k, v]) => [v, k]))
// average residue masses (Da) in a chain
const RES_MASS: Record<string, number> = { A: 71.08, R: 156.19, N: 114.1, D: 115.09, C: 103.14, E: 129.12, Q: 128.13, G: 57.05, H: 137.14, I: 113.16, L: 113.16, K: 128.17, M: 131.19, F: 147.18, P: 97.12, S: 87.08, T: 101.1, W: 186.21, Y: 163.18, V: 99.13 }

export type ResClass = 'hydrophobic' | 'polar' | 'positive' | 'negative' | 'special'
export function resClass(one: string): ResClass {
  if ('AVLIMFWC'.includes(one)) return 'hydrophobic'
  if ('KRH'.includes(one)) return 'positive'
  if ('DE'.includes(one)) return 'negative'
  if ('GP'.includes(one)) return 'special'
  return 'polar'
}

/** HELIX / SHEET records (PDB v3.3 fixed columns). */
export function parseSSRecords(text: string): SSElement[] {
  const out: SSElement[] = []
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('HELIX ')) {
      const s = parseInt(l.slice(21, 25)), e = parseInt(l.slice(33, 37))
      if (Number.isFinite(s) && Number.isFinite(e)) out.push({ type: 'H', chain: l[19]?.trim() || 'A', start: s, end: e })
    } else if (l.startsWith('SHEET ')) {
      const s = parseInt(l.slice(22, 26)), e = parseInt(l.slice(33, 37))
      if (Number.isFinite(s) && Number.isFinite(e)) out.push({ type: 'E', chain: l[21]?.trim() || 'A', start: s, end: e })
    }
  }
  return out
}

const P = (m: Molecule, i: number): [number, number, number] => { const a = m.atoms[i]; return [a.x, a.y, a.z] }

/** Estimate helix / strand from Cα geometry when the file has no HELIX/SHEET records. */
export function estimateSS(m: Molecule, res: Residue[]): SS[] {
  const ss: SS[] = res.map(() => 'C')
  const d = (i: number, j: number) => (res[i] && res[j] && res[i].chain === res[j].chain && res[i].ca >= 0 && res[j].ca >= 0 ? dist(P(m, res[i].ca), P(m, res[j].ca)) : NaN)
  for (let i = 0; i + 4 < res.length; i++) {
    const d3 = d(i, i + 3), d4 = d(i, i + 4)
    if (d3 > 4.5 && d3 < 5.8 && d4 > 5.4 && d4 < 6.9) for (let k = i; k <= i + 4; k++) ss[k] = 'H'
  }
  const ext = res.map((_, i) => d(i - 1, i + 1) > 6.1)
  for (let i = 0; i < res.length; i++) {
    if (ss[i] === 'H' || !ext[i]) continue
    for (let j = 0; j < res.length; j++) {
      if (Math.abs(i - j) < 3 && res[i].chain === res[j].chain) continue
      if (ext[j] && ss[j] !== 'H' && d(i, j) < 5.6) { ss[i] = 'E'; break }
      // cross-chain pairing
      if (res[i].chain !== res[j].chain && ext[j] && res[i].ca >= 0 && res[j].ca >= 0 && dist(P(m, res[i].ca), P(m, res[j].ca)) < 5.6) { ss[i] = 'E'; break }
    }
  }
  // drop runs that are too short
  const clean = (t: SS, min: number) => {
    for (let i = 0; i < ss.length;) {
      let j = i
      while (j < ss.length && ss[j] === t && res[j].chain === res[i].chain) j++
      if (j > i && j - i < min) for (let k = i; k < j; k++) ss[k] = 'C'
      i = Math.max(j, i + 1)
    }
  }
  clean('H', 4)
  clean('E', 2)
  return ss
}

export function parseProtein(text: string): Protein {
  const mol = parsePdb(text)
  // B-factors in the same order as parsePdb keeps atoms
  const bfactor: number[] = []
  for (const line of text.split(/\r?\n/)) {
    const rec = line.slice(0, 6).trim()
    if (rec === 'ENDMDL') break
    if (rec !== 'ATOM' && rec !== 'HETATM') continue
    const alt = line[16]
    if (alt && alt !== ' ' && alt !== 'A') continue
    if (![line.slice(30, 38), line.slice(38, 46), line.slice(46, 54)].map(parseFloat).every(Number.isFinite)) continue
    bfactor.push(parseFloat(line.slice(60, 66)) || 0)
  }
  const residues: Residue[] = []
  const ligMap = new Map<string, Protein['ligands'][number]>()
  mol.atoms.forEach((a, i) => {
    if (a.het && !ONE[a.res]) {
      const k = `${a.chain}:${a.res}:${a.resSeq}`
      const l = ligMap.get(k)
      if (l) l.atoms.push(i)
      else ligMap.set(k, { name: a.res, chain: a.chain, seq: a.resSeq, atoms: [i] })
      return
    }
    const last = residues[residues.length - 1]
    if (last && last.chain === a.chain && last.seq === a.resSeq && last.name === a.res) last.atoms.push(i)
    else residues.push({ chain: a.chain, seq: a.resSeq, name: a.res, one: ONE[a.res] ?? 'X', atoms: [i], ca: -1, o: -1, ss: 'C', b: 0 })
    const r = residues[residues.length - 1]
    if (a.name === 'CA') r.ca = i
    if (a.name === 'O') r.o = i
  })
  for (const r of residues) r.b = r.atoms.reduce((s, i) => s + (bfactor[i] ?? 0), 0) / r.atoms.length
  const prot = residues.filter((r) => r.ca >= 0)
  const recs = parseSSRecords(text)
  let ssSource: Protein['ssSource'] = 'none'
  if (recs.length) {
    ssSource = 'records'
    for (const r of prot) {
      const e = recs.find((x) => x.chain === r.chain && r.seq >= x.start && r.seq <= x.end)
      if (e) r.ss = e.type
    }
  } else if (prot.length > 6) {
    ssSource = 'estimated'
    estimateSS(mol, prot).forEach((s, i) => (prot[i].ss = s))
  }
  const elements: SSElement[] = []
  for (let i = 0; i < prot.length; i++) {
    const r = prot[i]
    if (r.ss === 'C') continue
    const prev = elements[elements.length - 1]
    if (prev && prev.type === r.ss && prev.chain === r.chain && prot[i - 1]?.ss === r.ss && prot[i - 1]?.chain === r.chain) prev.end = r.seq
    else elements.push({ type: r.ss, chain: r.chain, start: r.seq, end: r.seq })
  }
  return { mol, residues: prot, chains: [...new Set(prot.map((r) => r.chain))], elements, ssSource, bfactor, ligands: [...ligMap.values()] }
}

export function sequenceOf(p: Protein, chain: string): string {
  return p.residues.filter((r) => r.chain === chain).map((r) => r.one).join('')
}

/** Average-mass molecular weight of a sequence (Da), adding one water for the termini. */
export const seqMass = (seq: string) => [...seq].reduce((s, c) => s + (RES_MASS[c] ?? 110), 0) + 18.02

export function radiusOfGyration(pts: [number, number, number][]): number {
  if (!pts.length) return 0
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0])
  return Math.sqrt(pts.reduce((s, p) => s + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2, 0) / pts.length)
}

export function fasta(p: Protein, title: string): string {
  return p.chains.map((c) => `>${title}|chain ${c}\n${sequenceOf(p, c).replace(/(.{60})/g, '$1\n').trim()}`).join('\n')
}

// ---------- synthetic demo protein ----------

type V = [number, number, number]
interface BB { N: V; CA: V; C: V; O: V; CB: V | null; aa: string }
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => mul(a, 1 / (Math.hypot(...a) || 1))

/** Ideal backbone from φ/ψ with NeRF. */
function fragment(seq: string, phi: number, psi: number): BB[] {
  let N: V = [0, 0, 0], CA: V = [1.458, 0, 0]
  let C = place([0, 1, 0], N, CA, 1.525, 111.2, phi)
  const out: BB[] = []
  for (let i = 0; i < seq.length; i++) {
    const Nn = place(N, CA, C, 1.329, 116.2, psi)
    const O = place(Nn, CA, C, 1.231, 120.5, 180)
    out.push({ N, CA, C, O, CB: seq[i] === 'G' ? null : place(C, N, CA, 1.53, 110.5, 122.55), aa: seq[i] })
    const CAn = place(CA, C, Nn, 1.458, 121.7, 180)
    const Cn = place(C, Nn, CAn, 1.525, 111.2, phi)
    N = Nn; CA = CAn; C = Cn
  }
  return out
}

/** Rigidly moves a fragment so its axis points along `dir`, side vector toward `up`, centred at `at`. */
function placeFragment(f: BB[], dir: V, up: V, at: V): BB[] {
  const k = Math.min(4, f.length)
  const mean = (a: BB[]) => a.reduce<V>((s, r) => add(s, mul(r.CA, 1 / a.length)), [0, 0, 0])
  const u = unit(sub(mean(f.slice(-k)), mean(f.slice(0, k))))
  const c = mean(f)
  const side0 = f[0].CB ? sub(f[0].CB, f[0].CA) : [0, 0, 1] as V
  const v = unit(sub(side0, mul(u, dot(side0, u))))
  const w = cross(u, v)
  const U = unit(dir), Vv = unit(sub(up, mul(U, dot(up, U)))), W = cross(U, Vv)
  const tf = (p: V): V => { const q = sub(p, c); const a = dot(q, u), b = dot(q, v), d = dot(q, w); return add(at, add(add(mul(U, a), mul(Vv, b)), mul(W, d))) }
  return f.map((r) => ({ N: tf(r.N), CA: tf(r.CA), C: tf(r.C), O: tf(r.O), CB: r.CB && tf(r.CB), aa: r.aa }))
}

/** Loop residues along a cubic Bézier between two fragments (approximate backbone). */
function loop(a: BB, b: BB, seq: string, bulge: V): BB[] {
  const p0 = a.CA, p3 = b.CA
  const p1 = add(add(p0, mul(unit(sub(a.C, a.N)), 4)), bulge), p2 = add(add(p3, mul(unit(sub(b.N, b.C)), 4)), bulge)
  const bez = (t: number): V => add(add(mul(p0, (1 - t) ** 3), mul(p1, 3 * t * (1 - t) ** 2)), add(mul(p2, 3 * t * t * (1 - t)), mul(p3, t ** 3)))
  const n = seq.length
  const cas = Array.from({ length: n }, (_, i) => bez((i + 1) / (n + 1)))
  return cas.map((ca, i) => {
    const prev = i ? cas[i - 1] : p0, next = i < n - 1 ? cas[i + 1] : p3
    const C = add(ca, mul(unit(sub(next, ca)), 1.52)), N = add(ca, mul(unit(sub(prev, ca)), 1.46))
    const perp = unit(cross(sub(next, prev), [0.3, 0.5, 0.8]))
    return { N, CA: ca, C, O: add(C, mul(perp, 1.23)), CB: seq[i] === 'G' ? null : add(ca, mul(unit(cross(perp, sub(next, prev))), 1.53)), aa: seq[i] }
  })
}

function fixed(parts: [number, string][]): string {
  let s = ''
  for (const [col, t] of parts) s = s.padEnd(col - 1) + t
  return s
}

/** Two-chain α/β demo: a 3-stranded antiparallel sheet packed against a helix (A) and a helical hairpin (B). */
export function demoProteinPdb(): string {
  const X: V = [1, 0, 0], Z: V = [0, 0, 1]
  const s1 = placeFragment(fragment('KVTVEV', -120, 130), X, Z, [0, 0, 0])
  const s2 = placeFragment(fragment('RYEIRV', -120, 130), mul(X, -1), Z, [0, 4.8, 0])
  const s3 = placeFragment(fragment('TFKVYV', -120, 130), X, Z, [0, 9.6, 0])
  const h1 = placeFragment(fragment('SPEEALKLAKELAEKG', -57, -47), mul(X, -1), [0, -1, 0], [0, 4.8, 10])
  const A: BB[] = [...s1, ...loop(s1[5], s2[0], 'NG', [3, 0, 0]), ...s2, ...loop(s2[5], s3[0], 'DG', [-3, 0, 0]), ...s3, ...loop(s3[5], h1[0], 'GSD', [3, 0, 3]), ...h1]
  const h2 = placeFragment(fragment('DPELIKKLLELAKRAL', -57, -47), X, Z, [0, -10, 2])
  const h3 = placeFragment(fragment('NPELAKKALELLKKAG', -57, -47), mul(X, -1), Z, [0, -10, 11])
  const B: BB[] = [...h2, ...loop(h2[h2.length - 1], h3[0], 'GDG', [4, -2, 0]), ...h3]
  const lines = ['HEADER    DE NOVO PROTEIN                         17-OCT-26   DEMO', 'TITLE     SYNTHETIC ALPHA/BETA DEMO (IDEAL GEOMETRY, TWO CHAINS)']
  const ss: [string, number, number, 'H' | 'E'][] = [['A', 1, 6, 'E'], ['A', 9, 14, 'E'], ['A', 17, 22, 'E'], ['A', 27, 40, 'H'], ['B', 2, 15, 'H'], ['B', 20, 33, 'H']]
  const chains: [string, BB[]][] = [['A', A], ['B', B]]
  const resName = (c: string, n: number) => THREE[chains.find(([id]) => id === c)![1][n - 1].aa] ?? 'GLY'
  let hi = 1, si = 1
  for (const [c, s, e, t] of ss) {
    if (t === 'H') lines.push(fixed([[1, 'HELIX'], [8, String(hi).padStart(3)], [12, String(hi).padStart(3)], [16, resName(c, s)], [20, c], [22, String(s).padStart(4)], [28, resName(c, e)], [32, c], [34, String(e).padStart(4)], [39, ' 1'], [72, String(e - s + 1).padStart(5)]]))
    else lines.push(fixed([[1, 'SHEET'], [8, String(si).padStart(3)], [12, '  S'], [15, ' 3'], [18, resName(c, s)], [22, c], [23, String(s).padStart(4)], [29, resName(c, e)], [33, c], [34, String(e).padStart(4)], [39, si === 1 ? ' 0' : '-1']]))
    if (t === 'H') hi++
    else si++
  }
  let serial = 1
  const atom = (rec: string, name: string, res: string, chain: string, seq: number, p: V, el: string, b: number) =>
    lines.push(`${rec.padEnd(6)}${String(serial++).padStart(5)} ${name.padEnd(4)} ${res} ${chain}${String(seq).padStart(4)}    ${p.map((v) => v.toFixed(3).padStart(8)).join('')}  1.00${b.toFixed(2).padStart(6)}          ${el.padStart(2)}`)
  for (const [c, bb] of chains) {
    bb.forEach((r, i) => {
      const res = THREE[r.aa] ?? 'GLY'
      const b = 12 + 30 * Math.abs(i / bb.length - 0.5) ** 2 * 4 + (i % 7)
      atom('ATOM', ' N', res, c, i + 1, r.N, 'N', b); atom('ATOM', ' CA', res, c, i + 1, r.CA, 'C', b); atom('ATOM', ' C', res, c, i + 1, r.C, 'C', b); atom('ATOM', ' O', res, c, i + 1, r.O, 'O', b)
      if (r.CB) atom('ATOM', ' CB', res, c, i + 1, r.CB, 'C', b + 3)
    })
    lines.push(`TER   ${String(serial++).padStart(5)}      ${THREE[bb[bb.length - 1].aa]} ${c}${String(bb.length).padStart(4)}`)
  }
  atom('HETATM', 'ZN', ' ZN', 'A', 101, [0, 4.8, 5.2], 'ZN', 20)
  ;[[6, -4, 2], [-7, 14, 1], [9, 6, -3], [-8, -4, 6], [2, -15, 6]].forEach((p, i) => atom('HETATM', ' O', 'HOH', 'A', 201 + i, p as V, 'O', 35))
  lines.push('END')
  return lines.join('\n')
}
