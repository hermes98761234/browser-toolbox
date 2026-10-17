// Small cheminformatics core: molecule graph, SMILES reader/writer, implicit hydrogens,
// formula/mass, descriptors (HBD/HBA, rotatable bonds, rings, TPSA subset) and a 2D layout.

export interface Atom { id: number; el: string; x: number; y: number; charge: number; h: number | null; arom: boolean; iso: number }
export interface Bond { id: number; a: number; b: number; order: number /* 1,2,3 or 1.5 aromatic */ }
export interface Mol { atoms: Atom[]; bonds: Bond[] }

// symbol: [average weight, monoisotopic mass, valences]
export const ELEMENTS: Record<string, [number, number, number[]]> = {
  H: [1.008, 1.00782503, [1]], B: [10.81, 11.0093054, [3]], C: [12.011, 12, [4]], N: [14.007, 14.0030740, [3, 5]], O: [15.999, 15.9949146, [2]],
  F: [18.998, 18.9984032, [1]], Na: [22.990, 22.9897693, [1]], Mg: [24.305, 23.9850417, [2]], Si: [28.085, 27.9769265, [4]], P: [30.974, 30.9737620, [3, 5]],
  S: [32.06, 31.9720707, [2, 4, 6]], Cl: [35.45, 34.9688527, [1]], K: [39.098, 38.9637064, [1]], Ca: [40.078, 39.9625909, [2]], Fe: [55.845, 55.9349375, [2, 3]],
  Cu: [63.546, 62.9295975, [1, 2]], Zn: [65.38, 63.9291422, [2]], Se: [78.971, 79.9165218, [2, 4, 6]], Br: [79.904, 78.9183376, [1]], I: [126.904, 126.904473, [1, 3, 5]],
  Li: [6.94, 7.0160034, [1]], Al: [26.982, 26.9815385, [3]], Sn: [118.71, 119.902199, [2, 4]], Pt: [195.08, 194.964791, [2, 4]],
}
const ORGANIC = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I'])
export const HETERO_COLORS: Record<string, string> = { N: '#3b82f6', O: '#ef4444', S: '#eab308', P: '#f97316', F: '#22c55e', Cl: '#16a34a', Br: '#b45309', I: '#9333ea', B: '#f59e0b', Si: '#64748b', Se: '#ea580c' }

export const empty = (): Mol => ({ atoms: [], bonds: [] })
export const neighbors = (m: Mol, id: number) => m.bonds.filter((b) => b.a === id || b.b === id).map((b) => ({ bond: b, other: b.a === id ? b.b : b.a }))

/** Implicit + explicit hydrogens on an atom. */
export function hCount(m: Mol, a: Atom): number {
  if (a.h !== null) return a.h
  const el = ELEMENTS[a.el]
  if (!el || !ORGANIC.has(a.el)) return 0
  const nb = neighbors(m, a.id)
  let sum = 0
  let arom = 0
  for (const { bond } of nb) {
    if (bond.order === 1.5) arom++
    else sum += bond.order
  }
  const group15plus = ['N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I'].includes(a.el)
  const adj = (v: number) => (group15plus ? v + a.charge : v - Math.abs(a.charge))
  const used = sum + arom + (arom ? 1 : 0)
  // aromatic atoms use only their lowest valence (SMILES rule); others take the next valence that fits
  const v = arom ? adj(el[2][0]) : (el[2].map(adj).find((x) => x >= used) ?? adj(el[2][el[2].length - 1]))
  return Math.max(0, v - used)
}

// ---------------- SMILES ----------------

export function parseSmiles(s: string): Mol {
  const m = empty()
  let prev: number | null = null
  let bondOrder: number | null = null
  const stack: (number | null)[] = []
  const rings = new Map<number, { atom: number; order: number | null }>()
  let i = 0
  const addAtom = (el: string, arom: boolean, charge = 0, h: number | null = null, iso = 0) => {
    const id = m.atoms.length
    m.atoms.push({ id, el, x: 0, y: 0, charge, h, arom, iso })
    if (prev !== null) addBond(prev, id, bondOrder)
    prev = id
    bondOrder = null
    return id
  }
  const addBond = (a: number, b: number, order: number | null) => {
    const ar = m.atoms[a].arom && m.atoms[b].arom
    m.bonds.push({ id: m.bonds.length, a, b, order: order ?? (ar ? 1.5 : 1) })
  }
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t') break
    if (c === '(') {
      stack.push(prev)
      i++
    } else if (c === ')') {
      if (!stack.length) throw new Error(`Unmatched ")" at ${i + 1}`)
      prev = stack.pop()!
      i++
    } else if ('-=#$:/\\'.includes(c)) {
      bondOrder = c === '=' ? 2 : c === '#' ? 3 : c === '$' ? 4 : c === ':' ? 1.5 : 1
      if (c === '/' || c === '\\') bondOrder = null // stereo marks: plain single
      i++
    } else if (c === '.') {
      prev = null
      i++
    } else if (/[0-9%]/.test(c)) {
      let n: number
      if (c === '%') {
        n = Number(s.slice(i + 1, i + 3))
        i += 3
      } else {
        n = Number(c)
        i++
      }
      if (prev === null) throw new Error(`Ring bond ${n} without an atom`)
      const open = rings.get(n)
      if (open) {
        addBond(open.atom, prev, bondOrder ?? open.order)
        rings.delete(n)
      } else rings.set(n, { atom: prev, order: bondOrder })
      bondOrder = null
    } else if (c === '[') {
      const j = s.indexOf(']', i)
      if (j < 0) throw new Error('Unclosed [')
      const body = s.slice(i + 1, j)
      const bm = /^(\d+)?([A-Z][a-z]?|[bcnopsa]|se|as)(@{0,2}(?:TH|AL|SP|TB|OH)?\d*)?(H\d*)?([+-]+\d*)?(:\d+)?$/.exec(body)
      if (!bm) throw new Error(`Can’t read [${body}]`)
      const arom = /^[a-z]/.test(bm[2])
      const el = arom ? bm[2][0].toUpperCase() + bm[2].slice(1) : bm[2]
      if (!ELEMENTS[el]) throw new Error(`Unknown element ${el}`)
      const h = bm[4] ? Number(bm[4].slice(1) || 1) : 0
      let charge = 0
      if (bm[5]) {
        const sign = bm[5][0] === '+' ? 1 : -1
        const digits = bm[5].replace(/[+-]/g, '')
        charge = sign * (digits ? Number(digits) : bm[5].length)
      }
      addAtom(el, arom, charge, h, bm[1] ? Number(bm[1]) : 0)
      i = j + 1
    } else {
      const two = s.slice(i, i + 2)
      if (two === 'Cl' || two === 'Br') {
        addAtom(two, false)
        i += 2
      } else if ('BCNOPSFI'.includes(c)) {
        addAtom(c, false)
        i++
      } else if ('bcnops'.includes(c)) {
        addAtom(c.toUpperCase(), true)
        i++
      } else if (c === '*') {
        addAtom('C', false)
        i++
      } else throw new Error(`Unexpected “${c}” at position ${i + 1}`)
    }
  }
  if (rings.size) throw new Error(`Unclosed ring bond ${[...rings.keys()].join(', ')}`)
  if (stack.length) throw new Error('Unclosed "("')
  return m
}

/** Writes SMILES (aromatic atoms lowercase, ring closures for cycles). */
export function writeSmiles(m: Mol): string {
  if (!m.atoms.length) return ''
  const seen = new Set<number>()
  const parts: string[] = []
  let ringNo = 0
  const atomStr = (a: Atom) => {
    const hc = hCount(m, a)
    const implicit = a.h === null ? hc : (() => {
      const t = { ...a, h: null }
      return hCount(m, t)
    })()
    const needBracket = !ORGANIC.has(a.el) || a.charge !== 0 || a.iso > 0 || (a.h !== null && a.h !== implicit) || (a.arom && a.el === 'N' && hc > 0)
    const sym = a.arom ? a.el.toLowerCase() : a.el
    if (!needBracket) return sym
    const ch = a.charge ? (a.charge > 0 ? '+' : '-') + (Math.abs(a.charge) > 1 ? Math.abs(a.charge) : '') : ''
    return `[${a.iso || ''}${sym}${hc ? 'H' + (hc > 1 ? hc : '') : ''}${ch}]`
  }
  const bondStr = (b: Bond, x: Atom, y: Atom) => (b.order === 2 ? '=' : b.order === 3 ? '#' : b.order === 1.5 && !(x.arom && y.arom) ? ':' : b.order === 1 && x.arom && y.arom ? '-' : '')
  for (const start of m.atoms) {
    if (seen.has(start.id)) continue
    // first pass: DFS tree to find ring-closure bonds
    const order: number[] = []
    const parent = new Map<number, number | null>()
    const closures = new Map<number, Bond[]>()
    const treeBond = new Set<number>()
    const dfs = (id: number, from: number | null) => {
      seen.add(id)
      order.push(id)
      parent.set(id, from)
      for (const { bond, other } of neighbors(m, id)) {
        if (treeBond.has(bond.id)) continue
        if (seen.has(other)) {
          if (other !== from && ![...closures.values()].flat().includes(bond)) {
            closures.set(other, [...(closures.get(other) ?? []), bond])
            closures.set(id, [...(closures.get(id) ?? []), bond])
          }
          continue
        }
        treeBond.add(bond.id)
        dfs(other, id)
      }
    }
    dfs(start.id, null)
    const ringLabel = new Map<number, number>()
    const free: number[] = []
    const emit = (id: number): string => {
      const a = m.atoms[id]
      let out = atomStr(a)
      for (const b of closures.get(id) ?? []) {
        const other = m.atoms[b.a === id ? b.b : b.a]
        if (ringLabel.has(b.id)) {
          const n = ringLabel.get(b.id)!
          out += bondStr(b, a, other) + (n > 9 ? `%${n}` : n)
          free.push(n)
          free.sort((x, y) => x - y)
        } else {
          const n = free.length ? free.shift()! : ++ringNo
          ringLabel.set(b.id, n)
          out += n > 9 ? `%${n}` : n
        }
      }
      const kids = neighbors(m, id).filter(({ bond, other }) => treeBond.has(bond.id) && parent.get(other) === id)
      kids.forEach(({ bond, other }, k) => {
        const s = bondStr(bond, a, m.atoms[other]) + emit(other)
        out += k < kids.length - 1 ? `(${s})` : s
      })
      return out
    }
    parts.push(emit(start.id))
  }
  return parts.join('.')
}

// ---------------- properties ----------------

export function formula(m: Mol): { counts: Map<string, number>; text: string; charge: number } {
  const counts = new Map<string, number>()
  let charge = 0
  for (const a of m.atoms) {
    counts.set(a.el, (counts.get(a.el) ?? 0) + 1)
    const h = hCount(m, a)
    if (h) counts.set('H', (counts.get('H') ?? 0) + h)
    charge += a.charge
  }
  const keys = [...counts.keys()].sort()
  const hill = counts.has('C') ? ['C', ...(counts.has('H') ? ['H'] : []), ...keys.filter((k) => k !== 'C' && k !== 'H')] : keys
  const text = hill.map((k) => k + (counts.get(k)! > 1 ? counts.get(k) : '')).join('') + (charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '−') : '')
  return { counts, text, charge }
}

export function masses(m: Mol) {
  const { counts, charge } = formula(m)
  let avg = 0, mono = 0
  for (const [el, n] of counts) {
    avg += (ELEMENTS[el]?.[0] ?? 0) * n
    mono += (ELEMENTS[el]?.[1] ?? 0) * n
  }
  return { avg, mono: mono - charge * 0.000548579909 }
}

/** True if the bond lies on a cycle (endpoints still connected without it). */
export function inRing(m: Mol, b: Bond): boolean {
  const seen = new Set([b.a])
  const st = [b.a]
  while (st.length) {
    const x = st.pop()!
    for (const { bond, other } of neighbors(m, x)) {
      if (bond.id === b.id || seen.has(other)) continue
      if (other === b.b) return true
      seen.add(other)
      st.push(other)
    }
  }
  return false
}

export function components(m: Mol): number {
  const seen = new Set<number>()
  let c = 0
  for (const a of m.atoms) {
    if (seen.has(a.id)) continue
    c++
    const st = [a.id]
    seen.add(a.id)
    while (st.length) for (const { other } of neighbors(m, st.pop()!)) if (!seen.has(other)) {
        seen.add(other)
        st.push(other)
      }
  }
  return c
}

/** Ertl TPSA contributions for common N/O environments (subset of the 2000 table). */
function tpsaAtom(m: Mol, a: Atom): number {
  if (a.el !== 'N' && a.el !== 'O') return 0
  const nb = neighbors(m, a.id)
  const h = hCount(m, a)
  const heavy = nb.length
  const dbl = nb.filter((x) => x.bond.order === 2).length
  const tri = nb.filter((x) => x.bond.order === 3).length
  const ar = nb.filter((x) => x.bond.order === 1.5).length
  if (a.el === 'O') {
    if (a.charge === -1) return 23.06
    if (ar) return 13.14
    if (dbl) return 17.07
    if (h >= 1) return 20.23
    return heavy === 2 ? 9.23 : 0
  }
  if (a.charge === 1) return heavy === 3 && dbl === 1 ? 11.68 /* nitro-like */ : 4.36
  if (ar) return h ? 15.79 : ar + nb.length - ar >= 3 ? 4.41 : 12.89
  if (tri) return 23.79
  if (dbl) return h ? 23.85 : heavy === 2 ? 12.36 : 13.97
  if (h === 2) return 26.02
  if (h === 1) return 12.03
  return heavy === 3 ? 3.24 : 0
}

export function descriptors(m: Mol) {
  const { counts } = formula(m)
  const heavy = m.atoms.filter((a) => a.el !== 'H')
  const hbd = m.atoms.filter((a) => a.el === 'N' || a.el === 'O').reduce((s, a) => s + hCount(m, a), 0)
  const hba = m.atoms.filter((a) => a.el === 'N' || a.el === 'O').length
  const deg = (id: number) => neighbors(m, id).filter(({ other }) => m.atoms[other].el !== 'H').length
  const rot = m.bonds.filter((b) => b.order === 1 && m.atoms[b.a].el !== 'H' && m.atoms[b.b].el !== 'H' && deg(b.a) > 1 && deg(b.b) > 1 && !inRing(m, b) &&
    !neighbors(m, b.a).some((x) => x.bond.order === 3) && !neighbors(m, b.b).some((x) => x.bond.order === 3)).length
  const rings = m.bonds.length - m.atoms.length + components(m)
  const C = counts.get('C') ?? 0, H = counts.get('H') ?? 0, N = counts.get('N') ?? 0
  const X = ['F', 'Cl', 'Br', 'I'].reduce((s, k) => s + (counts.get(k) ?? 0), 0)
  const dbe = C ? (2 * C + 2 + N - H - X) / 2 : NaN
  const tpsa = m.atoms.reduce((s, a) => s + tpsaAtom(m, a), 0)
  const aromAtoms = m.atoms.filter((a) => a.arom).length
  return { heavy: heavy.length, hbd, hba, rot, rings, dbe, tpsa, aromAtoms }
}

// ---------------- 2D layout ----------------

/** Rings up to size 8 via BFS shortest cycles through each bond (good enough for drawing). */
export function smallRings(m: Mol): number[][] {
  const out: number[][] = []
  const keys = new Set<string>()
  for (const b of m.bonds) {
    if (!inRing(m, b)) continue
    // BFS from b.a to b.b without using b
    const prev = new Map<number, number>([[b.a, -1]])
    const q = [b.a]
    while (q.length && !prev.has(b.b)) {
      const x = q.shift()!
      for (const { bond, other } of neighbors(m, x)) {
        if (bond.id === b.id || prev.has(other)) continue
        prev.set(other, x)
        q.push(other)
      }
    }
    if (!prev.has(b.b)) continue
    const path: number[] = []
    for (let x = b.b; x !== -1; x = prev.get(x)!) path.push(x)
    if (path.length > 8) continue
    const k = [...path].sort((x, y) => x - y).join(',')
    if (!keys.has(k)) {
      keys.add(k)
      out.push(path)
    }
  }
  return out
}

/**
 * 2D coordinates by stress majorisation: exact targets for bonds (1), 120° neighbours and regular ring
 * polygons, softer targets from graph distance for everything else; classical-MDS start.
 */
export function layout(m: Mol): void {
  const n = m.atoms.length
  if (!n) return
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)
  const local = new Map<string, number>()
  for (const b of m.bonds) local.set(key(b.a, b.b), 1)
  for (const a of m.atoms) {
    const nb = neighbors(m, a.id)
    const lin = nb.some((x) => x.bond.order === 3) || (nb.length === 2 && nb.every((x) => x.bond.order === 2))
    const ang = nb.length >= 4 ? Math.PI / 2 : lin ? Math.PI : (2 * Math.PI) / 3
    for (let i = 0; i < nb.length; i++)
      for (let j = i + 1; j < nb.length; j++) {
        const k = key(nb[i].other, nb[j].other)
        if (!local.has(k)) local.set(k, 2 * Math.sin(ang / 2))
      }
  }
  for (const ring of smallRings(m)) {
    const L = ring.length
    for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) local.set(key(ring[i], ring[j]), Math.sin((Math.PI * (j - i)) / L) / Math.sin(Math.PI / L))
  }
  // components
  const comp = new Array(n).fill(-1)
  const comps: number[][] = []
  for (let s0 = 0; s0 < n; s0++) {
    if (comp[s0] >= 0) continue
    const list = [s0]
    comp[s0] = comps.length
    for (let q = 0; q < list.length; q++) for (const { other } of neighbors(m, list[q])) if (comp[other] < 0) {
      comp[other] = comps.length
      list.push(other)
    }
    comps.push(list)
  }
  let offset = 0
  for (const list of comps) {
    const k = list.length
    const idx = new Map(list.map((a, i) => [a, i]))
    // graph distances
    const G = list.map((src) => {
      const d = new Array(k).fill(Infinity)
      d[idx.get(src)!] = 0
      const q = [src]
      for (let h = 0; h < q.length; h++) for (const { other } of neighbors(m, q[h])) if (d[idx.get(other)!] === Infinity) {
        d[idx.get(other)!] = d[idx.get(q[h])!] + 1
        q.push(other)
      }
      return d
    })
    const D = (i: number, j: number) => local.get(key(list[i], list[j])) ?? 0.87 * G[i][j] + 0.2
    const W = (i: number, j: number) => (local.has(key(list[i], list[j])) ? 1 : 0.3 / G[i][j] ** 2)
    // classical MDS start
    const X = new Float64Array(k * 2)
    if (k > 2) {
      const B = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 0 : -0.5 * D(i, j) ** 2)))
      const rm = B.map((r) => r.reduce((a, b) => a + b, 0) / k)
      const all = rm.reduce((a, b) => a + b, 0) / k
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) B[i][j] += -rm[i] - rm[j] + all
      const vecs: number[][] = []
      for (let c = 0; c < 2; c++) {
        let v = Array.from({ length: k }, (_, i) => Math.sin(i * (c + 1.3) + 0.7))
        let lam = 0
        for (let it = 0; it < 200; it++) {
          let w = B.map((r) => r.reduce((a, x, j) => a + x * v[j], 0))
          for (const u of vecs) {
            const d = w.reduce((a, x, j) => a + x * u[j], 0)
            w = w.map((x, j) => x - d * u[j])
          }
          lam = Math.hypot(...w) || 1e-9
          v = w.map((x) => x / lam)
        }
        vecs.push(v)
        for (let i = 0; i < k; i++) X[i * 2 + c] = v[i] * Math.sqrt(Math.max(lam, 1e-9))
      }
    } else if (k === 2) X[2] = 1
    // stress majorisation (SMACOF-style localized updates)
    for (let it = 0; it < 300; it++)
      for (let i = 0; i < k; i++) {
        let sx = 0, sy = 0, sw = 0
        for (let j = 0; j < k; j++) {
          if (i === j) continue
          const w = W(i, j), d = D(i, j)
          const dx = X[i * 2] - X[j * 2], dy = X[i * 2 + 1] - X[j * 2 + 1]
          const l = Math.hypot(dx, dy) || 1e-6
          sx += w * (X[j * 2] + (d * dx) / l)
          sy += w * (X[j * 2 + 1] + (d * dy) / l)
          sw += w
        }
        if (sw) {
          X[i * 2] = sx / sw
          X[i * 2 + 1] = sy / sw
        }
      }
    // orient principal axis horizontally and place components side by side
    let cx = 0, cy = 0
    for (let i = 0; i < k; i++) {
      cx += X[i * 2] / k
      cy += X[i * 2 + 1] / k
    }
    let sxx = 0, sxy = 0, syy = 0
    for (let i = 0; i < k; i++) {
      const x = X[i * 2] - cx, y = X[i * 2 + 1] - cy
      sxx += x * x; sxy += x * y; syy += y * y
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    let minX = Infinity, maxX = -Infinity
    const P = list.map((_, i) => {
      const x = X[i * 2] - cx, y = X[i * 2 + 1] - cy
      const px = x * Math.cos(-th) - y * Math.sin(-th)
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      return [px, x * Math.sin(-th) + y * Math.cos(-th)]
    })
    list.forEach((a, i) => {
      m.atoms[a].x = P[i][0] - minX + offset
      m.atoms[a].y = P[i][1]
    })
    offset += maxX - minX + 1.6
  }
}

/** Converts aromatic flags to alternating double bonds where possible (for drawing). */
export function kekulize(m: Mol): Mol {
  const out: Mol = { atoms: m.atoms.map((a) => ({ ...a })), bonds: m.bonds.map((b) => ({ ...b })) }
  const ab = out.bonds.filter((b) => b.order === 1.5)
  if (!ab.length) return out
  // atoms that need a double bond: aromatic atoms with no exocyclic double bond and a free valence
  const need = new Set<number>()
  for (const a of out.atoms) {
    if (!a.arom) continue
    const nb = neighbors(out, a.id)
    if (nb.some((x) => x.bond.order === 2)) continue
    const h = hCount(m, m.atoms[a.id])
    const sigma = nb.length + h
    const val = a.el === 'C' ? 4 - Math.abs(a.charge) : a.el === 'N' ? 3 + a.charge : a.el === 'B' ? 3 : 2
    if (val - sigma >= 1 && !(a.el === 'N' && h > 0) && a.el !== 'O' && !(a.el === 'S' && nb.length === 2)) need.add(a.id)
  }
  // backtracking perfect matching on aromatic bonds between needy atoms
  const cand = ab.filter((b) => need.has(b.a) && need.has(b.b))
  const used = new Set<number>()
  const pick = new Set<number>()
  const atomsList = [...need]
  const solve = (k: number): boolean => {
    while (k < atomsList.length && used.has(atomsList[k])) k++
    if (k >= atomsList.length) return true
    const a = atomsList[k]
    for (const b of cand) {
      if (b.a !== a && b.b !== a) continue
      const o = b.a === a ? b.b : b.a
      if (used.has(o)) continue
      used.add(a); used.add(o); pick.add(b.id)
      if (solve(k + 1)) return true
      used.delete(a); used.delete(o); pick.delete(b.id)
    }
    return false
  }
  const ok = atomsList.length < 200 && solve(0)
  for (const b of out.bonds) if (b.order === 1.5) b.order = ok ? (pick.has(b.id) ? 2 : 1) : 1.5
  // keep the hydrogen counts the aromatic form implied
  for (const a of out.atoms) if (a.arom) {
    a.h = hCount(m, m.atoms[a.id])
    a.arom = false
  }
  if (!ok) for (const a of out.atoms) a.arom = m.atoms[a.id].arom
  // drop explicit H counts that the plain valence model reproduces, so later edits stay consistent
  for (const a of out.atoms) if (a.h !== null && !m.atoms[a.id].h && hCount(out, { ...a, h: null }) === a.h) a.h = null
  return out
}
