// Molecular file parsing (PDB, SDF/MOL, XYZ), bond perception, formulas and geometry.

export interface Atom {
  el: string
  x: number; y: number; z: number
  name: string
  res: string
  resSeq: number
  chain: string
  het: boolean
}
export interface Bond { a: number; b: number; order: number }
export interface Molecule { title: string; atoms: Atom[]; bonds: Bond[]; format: 'pdb' | 'sdf' | 'xyz' }

// symbol: [CPK colour, covalent radius Å, van der Waals radius Å, atomic mass]
export const ELEMENTS: Record<string, [string, number, number, number]> = {
  H: ['#ffffff', 0.31, 1.2, 1.008], C: ['#909090', 0.76, 1.7, 12.011], N: ['#3050f8', 0.71, 1.55, 14.007], O: ['#ff0d0d', 0.66, 1.52, 15.999],
  S: ['#ffff30', 1.05, 1.8, 32.06], P: ['#ff8000', 1.07, 1.8, 30.974], F: ['#90e050', 0.57, 1.47, 18.998], Cl: ['#1ff01f', 1.02, 1.75, 35.45],
  Br: ['#a62929', 1.2, 1.85, 79.904], I: ['#940094', 1.39, 1.98, 126.904], Na: ['#ab5cf2', 1.66, 2.27, 22.99], K: ['#8f40d4', 2.03, 2.75, 39.098],
  Mg: ['#8aff00', 1.41, 1.73, 24.305], Ca: ['#3dff00', 1.76, 2.31, 40.078], Fe: ['#e06633', 1.32, 2.0, 55.845], Zn: ['#7d80b0', 1.22, 1.39, 65.38],
  Cu: ['#c88033', 1.32, 1.4, 63.546], Mn: ['#9c7ac7', 1.39, 2.0, 54.938], Se: ['#ffa100', 1.2, 1.9, 78.971], B: ['#ffb5b5', 0.84, 1.92, 10.81],
  Si: ['#f0c8a0', 1.11, 2.1, 28.085], Li: ['#cc80ff', 1.28, 1.82, 6.94], Co: ['#f090a0', 1.26, 2.0, 58.933], Ni: ['#50d050', 1.24, 1.63, 58.693],
}
export const elem = (el: string) => ELEMENTS[el] ?? ['#ff1493', 1.2, 2.0, 0]

function normEl(s: string): string {
  const t = s.replace(/[^A-Za-z]/g, '')
  if (!t) return 'X'
  return t[0].toUpperCase() + t.slice(1).toLowerCase()
}

export function parsePdb(text: string): Molecule {
  const atoms: Atom[] = []
  let title = ''
  for (const line of text.split(/\r?\n/)) {
    const rec = line.slice(0, 6).trim()
    if (rec === 'ENDMDL') break
    if (rec === 'HEADER' && !title) title = line.slice(10, 50).trim()
    if (rec === 'TITLE') title = line.slice(10).trim()
    if (rec !== 'ATOM' && rec !== 'HETATM') continue
    const alt = line[16]
    if (alt && alt !== ' ' && alt !== 'A') continue
    const name = line.slice(12, 16).trim()
    let el = normEl(line.slice(76, 78))
    if (el === 'X' || !ELEMENTS[el]) {
      const n = line.slice(12, 14).replace(/[^A-Za-z]/g, '')
      el = n.length === 2 && ELEMENTS[normEl(n)] && line[12] !== ' ' && !/^[CNOSH]/.test(name) ? normEl(n) : normEl(name[0] ?? 'X')
    }
    const x = parseFloat(line.slice(30, 38)), y = parseFloat(line.slice(38, 46)), z = parseFloat(line.slice(46, 54))
    if (![x, y, z].every(Number.isFinite)) continue
    atoms.push({ el, x, y, z, name, res: line.slice(17, 20).trim(), resSeq: parseInt(line.slice(22, 26)) || 0, chain: line[21]?.trim() || 'A', het: rec === 'HETATM' })
  }
  if (!atoms.length) throw new Error('No ATOM/HETATM records found.')
  return { title: title || 'PDB structure', atoms, bonds: inferBonds(atoms), format: 'pdb' }
}

export function parseSdf(text: string): Molecule {
  const lines = text.split(/\r?\n/)
  const counts = lines[3] ?? ''
  if (/V3000/.test(counts)) throw new Error('V3000 molfiles are not supported — export as V2000.')
  const na = parseInt(counts.slice(0, 3)), nb = parseInt(counts.slice(3, 6))
  if (!(na > 0) || lines.length < 4 + na) throw new Error('Not a valid MOL/SDF file (bad counts line).')
  const atoms: Atom[] = []
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i]
    const parts = l.trim().split(/\s+/)
    const x = parseFloat(l.slice(0, 10)), y = parseFloat(l.slice(10, 20)), z = parseFloat(l.slice(20, 30))
    const el = normEl(l.slice(31, 34).trim() || parts[3])
    atoms.push({ el, x, y, z, name: `${el}${i + 1}`, res: 'MOL', resSeq: 1, chain: 'A', het: true })
  }
  const bonds: Bond[] = []
  for (let i = 0; i < (nb || 0); i++) {
    const l = lines[4 + na + i] ?? ''
    const a = parseInt(l.slice(0, 3)) - 1, b = parseInt(l.slice(3, 6)) - 1, order = parseInt(l.slice(6, 9)) || 1
    if (a >= 0 && b >= 0 && a < na && b < na) bonds.push({ a, b, order: order === 4 ? 1.5 : order })
  }
  return { title: lines[0].trim() || 'Molecule', atoms, bonds: bonds.length ? bonds : inferBonds(atoms), format: 'sdf' }
}

export function parseXyz(text: string): Molecule {
  const lines = text.trim().split(/\r?\n/)
  const n = parseInt(lines[0])
  if (!(n > 0)) throw new Error('XYZ file must start with the atom count.')
  const atoms: Atom[] = []
  for (let i = 0; i < n; i++) {
    const p = (lines[2 + i] ?? '').trim().split(/\s+/)
    const el = normEl(p[0] ?? 'X')
    atoms.push({ el, x: +p[1], y: +p[2], z: +p[3], name: `${el}${i + 1}`, res: 'MOL', resSeq: 1, chain: 'A', het: true })
  }
  return { title: lines[1]?.trim() || 'XYZ molecule', atoms, bonds: inferBonds(atoms), format: 'xyz' }
}

export function parseAny(text: string, fileName = ''): Molecule {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdb' || ext === 'ent' || /^(ATOM  |HETATM|HEADER|CRYST1)/m.test(text)) return parsePdb(text)
  if (ext === 'xyz' || /^\s*\d+\s*\n/.test(text) && !/V2000/.test(text)) return parseXyz(text)
  return parseSdf(text)
}

/** Distance-based bond perception using covalent radii (grid hashed). */
export function inferBonds(atoms: Atom[]): Bond[] {
  const cell = 2.4
  const grid = new Map<string, number[]>()
  const k = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  atoms.forEach((a, i) => { const key = k(a.x, a.y, a.z); const g = grid.get(key); if (g) g.push(i); else grid.set(key, [i]) })
  const bonds: Bond[] = []
  atoms.forEach((a, i) => {
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell), cz = Math.floor(a.z / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        if (j <= i) continue
        const b = atoms[j]
        if (a.el === 'H' && b.el === 'H') continue
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        if (d > 0.4 && d < elem(a.el)[1] + elem(b.el)[1] + 0.4) bonds.push({ a: i, b: j, order: 1 })
      }
    }
  })
  return bonds
}

/** Hill-order formula and molecular weight. */
export function formula(atoms: Atom[]): { text: string; mass: number } {
  const c = new Map<string, number>()
  for (const a of atoms) c.set(a.el, (c.get(a.el) ?? 0) + 1)
  const keys = [...c.keys()].sort()
  const order = c.has('C') ? ['C', ...(c.has('H') ? ['H'] : []), ...keys.filter((x) => x !== 'C' && x !== 'H')] : keys
  return { text: order.map((e) => e + (c.get(e)! > 1 ? c.get(e) : '')).join(''), mass: atoms.reduce((s, a) => s + elem(a.el)[3], 0) }
}

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const dist = (a: V, b: V) => Math.hypot(...sub(a, b))
export function angle(a: V, b: V, c: V): number {
  const u = norm(sub(a, b)), w = norm(sub(c, b))
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, w)))) * 180) / Math.PI
}
export function dihedral(a: V, b: V, c: V, d: V): number {
  const b0 = sub(a, b), b1 = norm(sub(c, b)), b2 = sub(d, c)
  const v = sub(b0, b1.map((x) => x * dot(b0, b1)) as V), w = sub(b2, b1.map((x) => x * dot(b2, b1)) as V)
  return (Math.atan2(dot(cross(b1, v), w), dot(v, w)) * 180) / Math.PI
}

/** NeRF: place D from A, B, C with |CD| = len, ∠BCD = ang, torsion ABCD = tor (degrees). */
export function place(A: V, B: V, C: V, len: number, ang: number, tor: number): V {
  const r = Math.PI / 180
  const bc = norm(sub(C, B))
  const n = norm(cross(sub(B, A), bc))
  const m = cross(n, bc)
  const d2: V = [-len * Math.cos(ang * r), len * Math.sin(ang * r) * Math.cos(tor * r), len * Math.sin(ang * r) * Math.sin(tor * r)]
  return [C[0] + d2[0] * bc[0] + d2[1] * m[0] + d2[2] * n[0], C[1] + d2[0] * bc[1] + d2[1] * m[1] + d2[2] * n[1], C[2] + d2[0] * bc[2] + d2[1] * m[2] + d2[2] * n[2]]
}

const THREE_LETTER: Record<string, string> = { A: 'ALA', G: 'GLY', K: 'LYS', E: 'GLU', L: 'LEU', S: 'SER', N: 'ASN', P: 'PRO', R: 'ARG', I: 'ILE', M: 'MET', D: 'ASP', Q: 'GLN', V: 'VAL' }

/** Demo helix–turn–helix peptide built from ideal backbone geometry and φ/ψ angles. Returns PDB text. */
export function demoPeptidePdb(): string {
  // loop φ/ψ chosen so the two helices pack ~9 Å apart without clashes
  const turn: [number, number][] = [[-150, 150], [-120, 130], [90, 0], [-70, 145]]
  const seq = 'MSPEELLKKAEELLKRGNPDLAKKLLELAEKL'
  const ss = seq.split('').map((_, i) => (i < 15 ? 'H' : i < 19 ? 'T' : 'H'))
  const tors: [number, number][] = ss.map((s, i) => (s === 'H' ? [-57, -47] : turn[i - 15]))
  const out: string[] = ['HEADER    DEMO PEPTIDE (IDEAL GEOMETRY)', 'TITLE     HELIX-TURN-HELIX DEMO PEPTIDE']
  let N: V = [0, 0, 0], CA: V = [1.458, 0, 0]
  let C: V = place([0, 1, 0], N, CA, 1.525, 111.2, -60)
  let serial = 1
  const line = (name: string, res: string, i: number, p: V, el: string) =>
    out.push(`ATOM  ${String(serial++).padStart(5)} ${name.padEnd(4)} ${res} A${String(i + 1).padStart(4)}    ${p.map((v) => v.toFixed(3).padStart(8)).join('')}  1.00  0.00          ${el.padStart(2)}`)
  for (let i = 0; i < seq.length; i++) {
    const res = THREE_LETTER[seq[i]] ?? 'ALA'
    const [, psi] = tors[i]
    const Nn = place(N, CA, C, 1.329, 116.2, psi)
    const O = place(Nn, CA, C, 1.231, 120.5, 180)
    line(' N', res, i, N, 'N'); line(' CA', res, i, CA, 'C'); line(' C', res, i, C, 'C'); line(' O', res, i, O, 'O')
    if (res !== 'GLY') line(' CB', res, i, place(C, N, CA, 1.53, 110.5, 122.55), 'C')
    if (i === seq.length - 1) break
    const CAn = place(CA, C, Nn, 1.458, 121.7, 180)
    const Cn = place(C, Nn, CAn, 1.525, 111.2, tors[i + 1][0])
    N = Nn; CA = CAn; C = Cn
  }
  out.push('END')
  return out.join('\n')
}

function molfile(title: string, atoms: [string, number, number, number][], bonds: [number, number, number][]): string {
  const f = (v: number) => v.toFixed(4).padStart(10)
  return [
    title, '  BrowserToolbox', '',
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([e, x, y, z]) => `${f(x)}${f(y)}${f(z)} ${e.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b, o]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(o).padStart(3)}  0`),
    'M  END', '$$$$',
  ].join('\n')
}

/** Caffeine (C8H10N4O2) with planar purine core built from regular polygons. */
export function caffeineSdf(): string {
  const atoms: [string, number, number, number][] = []
  const bonds: [number, number, number][] = []
  const add = (e: string, x: number, y: number, z = 0) => atoms.push([e, x, y, z]) - 1
  const s = 1.39, d = Math.PI / 180
  const hex = (deg: number): [number, number] => [s * Math.cos(deg * d), s * Math.sin(deg * d)]
  const C5 = add('C', ...hex(30)), C6 = add('C', ...hex(90)), N1 = add('N', ...hex(150)), C2 = add('C', ...hex(210)), N3 = add('N', ...hex(270)), C4 = add('C', ...hex(330))
  const R5 = s / (2 * Math.sin(36 * d)), cx = s * Math.cos(30 * d) + s / (2 * Math.tan(36 * d))
  const pent = (deg: number): [number, number] => [cx + R5 * Math.cos(deg * d), R5 * Math.sin(deg * d)]
  const N7 = add('N', ...pent(72)), C8 = add('C', ...pent(0)), N9 = add('N', ...pent(288))
  bonds.push([N1, C2, 1], [C2, N3, 1], [N3, C4, 1], [C4, C5, 2], [C5, C6, 1], [C6, N1, 1], [C5, N7, 1], [N7, C8, 1], [C8, N9, 2], [N9, C4, 1])
  const out = (i: number, c: [number, number]) => { const [x, y] = [atoms[i][1] - c[0], atoms[i][2] - c[1]]; const l = Math.hypot(x, y); return [x / l, y / l] as [number, number] }
  const sub1 = (i: number, c: [number, number], e: string, len: number, order: number) => {
    const [ux, uy] = out(i, c)
    const j = add(e, atoms[i][1] + ux * len, atoms[i][2] + uy * len)
    bonds.push([i, j, order])
    return j
  }
  const methyl = (i: number, c: [number, number]) => {
    const [ux, uy] = out(i, c)
    const m = sub1(i, c, 'C', 1.47, 1)
    for (const t of [0, 120, 240]) {
      const cs = Math.cos(t * d), sn = Math.sin(t * d)
      const dx = ux * 0.334 + 0.943 * cs * -uy, dy = uy * 0.334 + 0.943 * cs * ux, dz = 0.943 * sn
      bonds.push([m, add('H', atoms[m][1] + dx * 1.09, atoms[m][2] + dy * 1.09, dz * 1.09), 1])
    }
  }
  sub1(C2, [0, 0], 'O', 1.23, 2)
  sub1(C6, [0, 0], 'O', 1.23, 2)
  methyl(N1, [0, 0]); methyl(N3, [0, 0]); methyl(N7, [cx, 0])
  sub1(C8, [cx, 0], 'H', 1.08, 1)
  return molfile('Caffeine', atoms, bonds)
}

export function benzeneSdf(): string {
  const atoms: [string, number, number, number][] = [], bonds: [number, number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    atoms.push(['C', 1.39 * Math.cos(a), 1.39 * Math.sin(a), 0])
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    atoms.push(['H', 2.48 * Math.cos(a), 2.48 * Math.sin(a), 0])
    bonds.push([i, (i + 1) % 6, i % 2 ? 1 : 2], [i, i + 6, 1])
  }
  return molfile('Benzene', atoms, bonds)
}
