// Minimal CIF reader + crystallography helpers: symmetry expansion, cell matrix, density, supercells, neighbours.

export interface Site { label: string; el: string; x: number; y: number; z: number; occ: number }
export interface Crystal { name: string; a: number; b: number; c: number; alpha: number; beta: number; gamma: number; sites: Site[]; ops: string[]; spaceGroup: string }

/** [CPK colour, covalent radius Å, atomic mass]. */
export const ELEMENTS: Record<string, [string, number, number]> = {
  H: ['#ffffff', 0.31, 1.008], Li: ['#cc80ff', 1.28, 6.94], Be: ['#c2ff00', 0.96, 9.012], B: ['#ffb5b5', 0.84, 10.81], C: ['#909090', 0.76, 12.011], N: ['#3050f8', 0.71, 14.007],
  O: ['#ff0d0d', 0.66, 15.999], F: ['#90e050', 0.57, 18.998], Na: ['#ab5cf2', 1.66, 22.99], Mg: ['#8aff00', 1.41, 24.305], Al: ['#bfa6a6', 1.21, 26.982], Si: ['#f0c8a0', 1.11, 28.085],
  P: ['#ff8000', 1.07, 30.974], S: ['#ffff30', 1.05, 32.06], Cl: ['#1ff01f', 1.02, 35.45], K: ['#8f40d4', 2.03, 39.098], Ca: ['#3dff00', 1.76, 40.078], Sc: ['#e6e6e6', 1.7, 44.956],
  Ti: ['#bfc2c7', 1.6, 47.867], V: ['#a6a6ab', 1.53, 50.942], Cr: ['#8a99c7', 1.39, 51.996], Mn: ['#9c7ac7', 1.39, 54.938], Fe: ['#e06633', 1.32, 55.845], Co: ['#f090a0', 1.26, 58.933],
  Ni: ['#50d050', 1.24, 58.693], Cu: ['#c88033', 1.32, 63.546], Zn: ['#7d80b0', 1.22, 65.38], Ga: ['#c28f8f', 1.22, 69.723], Ge: ['#668f8f', 1.2, 72.63], As: ['#bd80e3', 1.19, 74.922],
  Se: ['#ffa100', 1.2, 78.971], Br: ['#a62929', 1.2, 79.904], Rb: ['#702eb0', 2.2, 85.468], Sr: ['#00ff00', 1.95, 87.62], Y: ['#94ffff', 1.9, 88.906], Zr: ['#94e0e0', 1.75, 91.224],
  Nb: ['#73c2c9', 1.64, 92.906], Mo: ['#54b5b5', 1.54, 95.95], Ag: ['#c0c0c0', 1.45, 107.868], Cd: ['#ffd98f', 1.44, 112.414], In: ['#a67573', 1.42, 114.818], Sn: ['#668080', 1.39, 118.71],
  Sb: ['#9e63b5', 1.39, 121.76], Te: ['#d47a00', 1.38, 127.6], I: ['#940094', 1.39, 126.904], Cs: ['#57178f', 2.44, 132.905], Ba: ['#00c900', 2.15, 137.327], La: ['#70d4ff', 2.07, 138.905],
  Ce: ['#ffffc7', 2.04, 140.116], W: ['#2194d6', 1.62, 183.84], Pt: ['#d0d0e0', 1.36, 195.084], Au: ['#ffd123', 1.36, 196.967], Hg: ['#b8b8d0', 1.32, 200.592], Pb: ['#575961', 1.46, 207.2],
  Bi: ['#9e4fb5', 1.48, 208.98], U: ['#008fff', 1.96, 238.029],
}
export const elInfo = (el: string): [string, number, number] => ELEMENTS[el] ?? ['#ff1493', 1.5, 0]

const num = (s: string) => parseFloat(s.replace(/\(.*\)$/, ''))

function tokens(line: string): string[] {
  const out: string[] = []
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

/** Parses the first data block of a CIF file. */
export function parseCif(text: string): Crystal {
  const lines = text.replace(/\r/g, '').split('\n')
  const items: Record<string, string> = {}
  const loops: { names: string[]; rows: string[][] }[] = []
  let name = 'structure'
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t || t.startsWith('#')) { i++; continue }
    if (/^data_/i.test(t)) { name = t.slice(5) || name; i++; continue }
    if (/^loop_/i.test(t)) {
      const names: string[] = []
      i++
      while (i < lines.length && lines[i].trim().startsWith('_')) {
        names.push(lines[i].trim().split(/\s+/)[0].toLowerCase())
        i++
      }
      const vals: string[] = []
      while (i < lines.length) {
        const u = lines[i].trim()
        if (/^(loop_|data_)/i.test(u) || u.startsWith('_')) break
        if (u && !u.startsWith('#')) {
          if (u.startsWith(';')) {
            const buf: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith(';')) {
              buf.push(lines[i])
              i++
            }
            vals.push(buf.join(' '))
          } else vals.push(...tokens(u))
        }
        i++
      }
      const rows: string[][] = []
      for (let k = 0; k + names.length <= vals.length; k += names.length) rows.push(vals.slice(k, k + names.length))
      loops.push({ names, rows })
      continue
    }
    if (t.startsWith('_')) {
      const tk = tokens(t)
      let v = tk.slice(1).join(' ')
      if (!v && i + 1 < lines.length) {
        if (lines[i + 1].startsWith(';')) {
          const buf: string[] = []
          i += 2
          while (i < lines.length && !lines[i].startsWith(';')) {
            buf.push(lines[i])
            i++
          }
          v = buf.join(' ')
        } else v = tokens(lines[++i])[0] ?? ''
      }
      items[tk[0].toLowerCase()] = v
    }
    i++
  }
  const cell = (k: string, d: number) => (items[`_cell_${k}`] ? num(items[`_cell_${k}`]) : d)
  const atomLoop = loops.find((l) => l.names.includes('_atom_site_fract_x'))
  if (!atomLoop) throw new Error('No _atom_site_fract_x loop found.')
  const col = (n: string) => atomLoop.names.indexOf(n)
  const [cl, ct, cx, cy, cz, co] = ['_atom_site_label', '_atom_site_type_symbol', '_atom_site_fract_x', '_atom_site_fract_y', '_atom_site_fract_z', '_atom_site_occupancy'].map(col)
  const sites: Site[] = atomLoop.rows.map((r) => {
    const label = cl >= 0 ? r[cl] : r[ct]
    const sym = ((ct >= 0 ? r[ct] : label) ?? 'X').match(/^[A-Z][a-z]?/)?.[0] ?? 'X'
    return { label, el: sym, x: num(r[cx]), y: num(r[cy]), z: num(r[cz]), occ: co >= 0 && r[co] !== '?' && r[co] !== '.' ? num(r[co]) : 1 }
  })
  const opLoop = loops.find((l) => l.names.some((n) => /_symmetry_equiv_pos_as_xyz|_space_group_symop_operation_xyz/.test(n)))
  let ops = ['x,y,z']
  if (opLoop) {
    const k = opLoop.names.findIndex((n) => /_as_xyz|_operation_xyz/.test(n))
    ops = opLoop.rows.map((r) => r[k])
  }
  const sg = items['_symmetry_space_group_name_h-m'] ?? items['_space_group_name_h-m_alt'] ?? ''
  const c: Crystal = { name, a: cell('length_a', 1), b: cell('length_b', 1), c: cell('length_c', 1), alpha: cell('angle_alpha', 90), beta: cell('angle_beta', 90), gamma: cell('angle_gamma', 90), sites, ops, spaceGroup: sg }
  if (!(c.a > 0 && c.b > 0 && c.c > 0)) throw new Error('Cell lengths are missing or invalid.')
  return c
}

/** Parses a symmetry operation like "-x+1/2, y, z+1/2" → 3×4 affine rows. */
export function parseOp(op: string): number[][] {
  const parts = op.toLowerCase().replace(/\s/g, '').split(',')
  if (parts.length !== 3) throw new Error(`Bad symmetry operation: ${op}`)
  return parts.map((p) => {
    const row = [0, 0, 0, 0]
    const re = /([+-]?)(\d*\.?\d*(?:\/\d+)?)\*?([xyz]?)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(p)) && m[0] !== '') {
      const sign = m[1] === '-' ? -1 : 1
      let coef = 1
      if (m[2]) coef = m[2].includes('/') ? Number(m[2].split('/')[0]) / Number(m[2].split('/')[1]) : Number(m[2])
      if (m[3]) row['xyz'.indexOf(m[3])] += sign * coef
      else row[3] += sign * coef
    }
    return row
  })
}

const wrap = (v: number) => {
  const w = v - Math.floor(v)
  return w > 1 - 1e-6 ? 0 : w
}

/** Applies all symmetry operations and removes duplicates → atoms inside one unit cell, fractional [0,1). */
export function expand(c: Crystal): Site[] {
  const ops = c.ops.map(parseOp)
  const out: Site[] = []
  for (const s of c.sites)
    for (const m of ops) {
      const p = m.map((r) => wrap(r[0] * s.x + r[1] * s.y + r[2] * s.z + r[3]))
      const dup = out.some((o) => {
        const d = [o.x - p[0], o.y - p[1], o.z - p[2]].map((v) => Math.abs(v - Math.round(v)))
        return d[0] < 1e-3 && d[1] < 1e-3 && d[2] < 1e-3
      })
      if (!dup) out.push({ ...s, x: p[0], y: p[1], z: p[2] })
    }
  return out
}

const R = Math.PI / 180

/** Rows are the a, b, c vectors in Cartesian Å (a along x, b in the xy plane). */
export function cellMatrix(c: Crystal): number[][] {
  const [al, be, ga] = [c.alpha * R, c.beta * R, c.gamma * R]
  const cx = c.c * Math.cos(be)
  const cy = (c.c * (Math.cos(al) - Math.cos(be) * Math.cos(ga))) / Math.sin(ga)
  return [[c.a, 0, 0], [c.b * Math.cos(ga), c.b * Math.sin(ga), 0], [cx, cy, Math.sqrt(Math.max(0, c.c * c.c - cx * cx - cy * cy))]]
}

export function volume(c: Crystal): number {
  const [ca, cb, cg] = [Math.cos(c.alpha * R), Math.cos(c.beta * R), Math.cos(c.gamma * R)]
  return c.a * c.b * c.c * Math.sqrt(1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg)
}

export const toCart = (M: number[][], f: [number, number, number]): [number, number, number] => [0, 1, 2].map((k) => f[0] * M[0][k] + f[1] * M[1][k] + f[2] * M[2][k]) as [number, number, number]

/** Density in g/cm³ from the full cell contents. */
export function density(c: Crystal, atoms: Site[]): number {
  const mass = atoms.reduce((s, a) => s + elInfo(a.el)[2] * a.occ, 0)
  return mass / (0.602214 * volume(c))
}

/** Reduced chemical formula with Z (formula units per cell). */
export function formula(atoms: Site[]): { formula: string; Z: number } {
  const cnt = new Map<string, number>()
  for (const a of atoms) cnt.set(a.el, (cnt.get(a.el) ?? 0) + a.occ)
  const vals = [...cnt.values()].map((v) => Math.round(v * 100) / 100)
  const ints = vals.every((v) => Math.abs(v - Math.round(v)) < 1e-6)
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x)
  const Z = ints ? vals.map(Math.round).reduce(gcd) : 1
  const els = [...cnt.keys()].sort((x, y) => (x === 'C' ? -1 : y === 'C' ? 1 : x.localeCompare(y)))
  return { formula: els.map((e) => { const n = Math.round(((cnt.get(e) ?? 0) / Z) * 100) / 100; return n === 1 ? e : `${e}${n}` }).join(''), Z }
}

export interface Atom3 { el: string; label: string; p: [number, number, number] }

/** Atoms of an nx×ny×nz supercell; `boundary` adds periodic images that sit on the far faces/edges/corners. */
export function supercell(c: Crystal, atoms: Site[], n: [number, number, number], boundary: boolean): Atom3[] {
  const M = cellMatrix(c)
  const out: Atom3[] = []
  const eps = 1e-3
  const range = (v: number, d: number) => {
    const r: number[] = []
    for (let i = 0; i <= n[d]; i++) if (i < n[d] || (boundary && v < eps)) r.push(v + i)
    return r
  }
  for (const a of atoms)
    for (const x of range(a.x, 0)) for (const y of range(a.y, 1)) for (const z of range(a.z, 2))
      out.push({ el: a.el, label: a.label, p: toCart(M, [x, y, z]) })
  return out
}

/** Pairs closer than (r1 + r2) × tol. */
export function bonds(atoms: Atom3[], tol = 1.15, max = 6000): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const a = atoms[i].p, b = atoms[j].p
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      if (d > 0.4 && d < (elInfo(atoms[i].el)[1] + elInfo(atoms[j].el)[1]) * tol) {
        out.push([i, j, d])
        if (out.length >= max) return out
      }
    }
  return out
}

/** For each unique site: nearest-neighbour distance and coordination number (within +10 % of the nearest). */
export function neighbours(c: Crystal, atoms: Site[]): { label: string; el: string; d: number; cn: number; with: string }[] {
  const M = cellMatrix(c)
  const seen = new Set<string>()
  const res: { label: string; el: string; d: number; cn: number; with: string }[] = []
  for (const a of atoms) {
    if (seen.has(a.label)) continue
    seen.add(a.label)
    const ds: { d: number; el: string }[] = []
    for (const b of atoms)
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const p = toCart(M, [b.x + i - a.x, b.y + j - a.y, b.z + k - a.z])
        const d = Math.hypot(...p)
        if (d > 1e-3) ds.push({ d, el: b.el })
      }
    ds.sort((x, y) => x.d - y.d)
    const d0 = ds[0]?.d ?? 0
    const shell = ds.filter((x) => x.d <= d0 * 1.1)
    res.push({ label: a.label, el: a.el, d: d0, cn: shell.length, with: [...new Set(shell.map((x) => x.el))].join(', ') })
  }
  return res
}

export const SAMPLES: Record<string, string> = {
  'NaCl (rock salt)': `data_NaCl
_symmetry_space_group_name_H-M 'F m -3 m'
_cell_length_a 5.6402
_cell_length_b 5.6402
_cell_length_c 5.6402
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
'x,y,z'
'x,y+1/2,z+1/2'
'x+1/2,y,z+1/2'
'x+1/2,y+1/2,z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Na1 Na 0 0 0
Cl1 Cl 0.5 0.5 0.5
`,
  'Si (diamond)': `data_Si
_symmetry_space_group_name_H-M 'F d -3 m'
_cell_length_a 5.431(1)
_cell_length_b 5.431(1)
_cell_length_c 5.431(1)
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
x,y+1/2,z+1/2
x+1/2,y,z+1/2
x+1/2,y+1/2,z
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Si1 0 0 0
Si2 0.25 0.25 0.25
`,
  'CsCl': `data_CsCl
_symmetry_space_group_name_H-M 'P m -3 m'
_cell_length_a 4.123
_cell_length_b 4.123
_cell_length_c 4.123
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Cs1 0 0 0
Cl1 0.5 0.5 0.5
`,
  'α-Fe (BCC)': `data_Fe
_symmetry_space_group_name_H-M 'I m -3 m'
_cell_length_a 2.8665
_cell_length_b 2.8665
_cell_length_c 2.8665
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
x+1/2,y+1/2,z+1/2
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Fe1 0 0 0
`,
  'Cu (FCC)': `data_Cu
_symmetry_space_group_name_H-M 'F m -3 m'
_cell_length_a 3.6149
_cell_length_b 3.6149
_cell_length_c 3.6149
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
x,y+1/2,z+1/2
x+1/2,y,z+1/2
x+1/2,y+1/2,z
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Cu1 0 0 0
`,
  'Mg (HCP)': `data_Mg
_symmetry_space_group_name_H-M 'P 63/m m c'
_cell_length_a 3.2094
_cell_length_b 3.2094
_cell_length_c 5.2108
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Mg1 0.33333 0.66667 0.25
Mg2 0.66667 0.33333 0.75
`,
  'SrTiO₃ (perovskite)': `data_SrTiO3
_symmetry_space_group_name_H-M 'P m -3 m'
_cell_length_a 3.905
_cell_length_b 3.905
_cell_length_c 3.905
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Sr1 0 0 0
Ti1 0.5 0.5 0.5
O1 0.5 0.5 0
O2 0.5 0 0.5
O3 0 0.5 0.5
`,
  'TiO₂ (rutile)': `data_TiO2_rutile
_symmetry_space_group_name_H-M 'P 42/m n m'
_cell_length_a 4.5937
_cell_length_b 4.5937
_cell_length_c 2.9587
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
-x,-y,z
-y+1/2,x+1/2,z+1/2
y+1/2,-x+1/2,z+1/2
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Ti1 0 0 0
O1 0.3053 0.3053 0
`,
  'ZnO (wurtzite)': `data_ZnO
_symmetry_space_group_name_H-M 'P 63 m c'
_cell_length_a 3.2495
_cell_length_b 3.2495
_cell_length_c 5.2069
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
-x+y,-x,z
-y,x-y,z
-x,-y,z+1/2
x-y,x,z+1/2
y,-x+y,z+1/2
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Zn1 0.33333 0.66667 0
O1 0.33333 0.66667 0.382
`,
  'Graphite': `data_graphite
_symmetry_space_group_name_H-M 'P 63/m m c'
_cell_length_a 2.464
_cell_length_b 2.464
_cell_length_c 6.711
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 0 0 0.25
C2 0 0 0.75
C3 0.33333 0.66667 0.25
C4 0.66667 0.33333 0.75
`,
}
