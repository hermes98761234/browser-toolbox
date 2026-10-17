// 3D pin-jointed truss solver (direct stiffness method). Units: m, kN, GPa, cm². Y axis is vertical.

export interface TNode {
  id: string
  x: number
  y: number
  z: number
  /** restrained directions */
  rx: boolean
  ry: boolean
  rz: boolean
  /** applied loads, kN */
  px: number
  py: number
  pz: number
}

export interface TMember {
  id: string
  a: string
  b: string
  /** cross-section area, cm² */
  area: number
}

export interface TrussResult {
  ok: boolean
  error?: string
  /** nodal displacements [ux, uy, uz] per node, m */
  disp: [number, number, number][]
  /** support reactions per node, kN */
  reactions: [number, number, number][]
  /** axial force per member, kN (+ tension, − compression) */
  force: number[]
  length: number[]
  /** axial stress, MPa */
  stress: number[]
  /** Euler buckling load assuming a solid round bar of the same area, kN */
  pcr: number[]
}

/** Solves A x = b in place (Gaussian elimination with partial pivoting). Returns null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  let scale = 0
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v))
  const tol = (scale || 1) * 1e-11
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < tol) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f === 0) continue
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

export function solveTruss(nodes: TNode[], members: TMember[], E_GPa: number): TrussResult {
  const n = nodes.length
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]))
  const empty: TrussResult = {
    ok: false, disp: nodes.map(() => [0, 0, 0]), reactions: nodes.map(() => [0, 0, 0]),
    force: members.map(() => 0), length: members.map(() => 0), stress: members.map(() => 0), pcr: members.map(() => 0),
  }
  if (n < 2 || !members.length) return { ...empty, error: 'Add at least two nodes and one member.' }
  if (!(E_GPa > 0)) return { ...empty, error: "Young's modulus must be positive." }
  const E = E_GPa * 1e6 // kN/m²
  const dof = 3 * n
  const K = Array.from({ length: dof }, () => new Array<number>(dof).fill(0))
  const geo: { i: number; j: number; L: number; c: [number, number, number]; EA: number }[] = []
  for (const m of members) {
    const i = idx.get(m.a), j = idx.get(m.b)
    if (i === undefined || j === undefined) return { ...empty, error: `Member ${m.id} references a missing node.` }
    if (i === j) return { ...empty, error: `Member ${m.id} connects a node to itself.` }
    const A = nodes[i], B = nodes[j]
    const d: [number, number, number] = [B.x - A.x, B.y - A.y, B.z - A.z]
    const L = Math.hypot(...d)
    if (L < 1e-9) return { ...empty, error: `Member ${m.id} has zero length.` }
    if (!(m.area > 0)) return { ...empty, error: `Member ${m.id} needs a positive area.` }
    const c: [number, number, number] = [d[0] / L, d[1] / L, d[2] / L]
    const EA = E * m.area * 1e-4
    geo.push({ i, j, L, c, EA })
    const k = EA / L
    for (let p = 0; p < 3; p++)
      for (let q = 0; q < 3; q++) {
        const v = k * c[p] * c[q]
        K[3 * i + p][3 * i + q] += v
        K[3 * j + p][3 * j + q] += v
        K[3 * i + p][3 * j + q] -= v
        K[3 * j + p][3 * i + q] -= v
      }
  }
  const F: number[] = []
  const fixed: boolean[] = []
  for (const nd of nodes) {
    F.push(nd.px, nd.py, nd.pz)
    fixed.push(nd.rx, nd.ry, nd.rz)
  }
  const free = [...Array(dof).keys()].filter((d) => !fixed[d])
  const u = new Array<number>(dof).fill(0)
  if (free.length) {
    const Kff = free.map((r) => free.map((c) => K[r][c]))
    const sol = solveLinear(Kff, free.map((r) => F[r]))
    if (!sol) {
      // find a node that is likely unstable for a helpful message
      const loose = nodes.find((_nd, i) => [0, 1, 2].some((p) => !fixed[3 * i + p] && K[3 * i + p][3 * i + p] < 1e-9))
      return { ...empty, error: loose ? `Unstable: node ${loose.id} is not restrained in every direction (add members or supports).` : 'Unstable structure (mechanism): add bracing members or supports.' }
    }
    free.forEach((d, k) => (u[d] = sol[k]))
  }
  const R = K.map((row, r) => (fixed[r] ? row.reduce((a, v, c) => a + v * u[c], 0) - F[r] : 0))
  const force = geo.map(({ i, j, L, c, EA }) => (EA / L) * ((u[3 * j] - u[3 * i]) * c[0] + (u[3 * j + 1] - u[3 * i + 1]) * c[1] + (u[3 * j + 2] - u[3 * i + 2]) * c[2]))
  const stress = force.map((N, k) => (N / members[k].area) * 10)
  const pcr = geo.map(({ L }, k) => {
    const A = members[k].area * 1e-4
    const I = (A * A) / (4 * Math.PI)
    return (Math.PI ** 2 * E * I) / (L * L)
  })
  return {
    ok: true,
    disp: nodes.map((_, i) => [u[3 * i], u[3 * i + 1], u[3 * i + 2]]),
    reactions: nodes.map((_, i) => [R[3 * i], R[3 * i + 1], R[3 * i + 2]]),
    force, length: geo.map((g) => g.L), stress, pcr,
  }
}

/** Degree of static indeterminacy m + r − 3j (negative → mechanism). */
export function indeterminacy(nodes: TNode[], members: TMember[]): number {
  const r = nodes.reduce((a, n) => a + Number(n.rx) + Number(n.ry) + Number(n.rz), 0)
  return members.length + r - 3 * nodes.length
}

// ---------- presets ----------

export interface TrussModel {
  nodes: TNode[]
  members: TMember[]
}

function builder() {
  const nodes: TNode[] = []
  const members: TMember[] = []
  const key = new Map<string, string>()
  const add = (x: number, y: number, z: number, fix: '' | 'pin' | 'roller' = '', load: [number, number, number] = [0, 0, 0]) => {
    const id = `N${nodes.length + 1}`
    const r = (v: number) => Math.round(v * 1000) / 1000
    nodes.push({ id, x: r(x), y: r(y), z: r(z), rx: fix === 'pin', ry: fix !== '', rz: fix !== '', px: load[0], py: load[1], pz: load[2] })
    key.set(`${r(x)},${r(y)},${r(z)}`, id)
    return id
  }
  const link = (a: string, b: string, area: number) => {
    if (a === b || members.some((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a))) return
    members.push({ id: `M${members.length + 1}`, a, b, area })
  }
  return { nodes, members, add, link }
}

export const PRESETS: Record<string, () => TrussModel> = {
  'Pyramid': () => {
    const t = builder()
    const base = [[2, 2], [-2, 2], [-2, -2], [2, -2]].map(([x, z]) => t.add(x, 0, z, 'pin'))
    const top = t.add(0, 3, 0, '', [10, -100, 0])
    base.forEach((b) => t.link(b, top, 24))
    return t
  },
  'Lattice tower': () => {
    const t = builder()
    const levels = [[0, 1.6], [3, 1.25], [6, 0.9], [9, 0.6]]
    const ring = levels.map(([y, h], li) =>
      [[h, h], [-h, h], [-h, -h], [h, -h]].map(([x, z]) => t.add(x, y, z, li === 0 ? 'pin' : '', li === levels.length - 1 ? [6, -15, 0] : [0, 0, 0])),
    )
    for (let li = 0; li < ring.length; li++) {
      const r = ring[li]
      if (li > 0) {
        for (let k = 0; k < 4; k++) {
          t.link(r[k], r[(k + 1) % 4], 6)
          t.link(ring[li - 1][k], r[k], 20)
          t.link(ring[li - 1][k], r[(k + 1) % 4], 12)
          t.link(ring[li - 1][(k + 1) % 4], r[k], 12)
        }
        t.link(r[0], r[2], 8)
      }
    }
    return t
  },
  'Space frame roof': () => {
    const t = builder()
    const n = 4, s = 2, h = 1.5
    const top: string[][] = []
    for (let i = 0; i < n; i++) {
      top.push([])
      for (let j = 0; j < n; j++) {
        const corner = (i === 0 || i === n - 1) && (j === 0 || j === n - 1)
        const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1
        top[i].push(t.add((i - (n - 1) / 2) * s, h, (j - (n - 1) / 2) * s, corner ? 'pin' : '', corner ? [0, 0, 0] : [0, edge ? -6 : -12, 0]))
      }
    }
    const bot: string[][] = []
    for (let i = 0; i < n - 1; i++) {
      bot.push([])
      for (let j = 0; j < n - 1; j++) bot[i].push(t.add((i - (n - 2) / 2) * s, 0, (j - (n - 2) / 2) * s))
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i + 1 < n) t.link(top[i][j], top[i + 1][j], 8)
        if (j + 1 < n) t.link(top[i][j], top[i][j + 1], 8)
      }
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < n - 1; j++) {
        if (i + 1 < n - 1) t.link(bot[i][j], bot[i + 1][j], 8)
        if (j + 1 < n - 1) t.link(bot[i][j], bot[i][j + 1], 8)
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.link(bot[i][j], top[i + a][j + b], 6)
      }
    return t
  },
  'Footbridge': () => {
    const t = builder()
    const panels = 6, p = 2, w = 2, h = 1.8
    const bot: string[][] = [[], []]
    const top: string[][] = [[], []]
    for (const side of [0, 1]) {
      for (let i = 0; i <= panels; i++) bot[side].push(t.add(i * p, 0, side * w, i === 0 ? 'pin' : i === panels ? 'roller' : '', i === 0 || i === panels ? [0, 0, 0] : [0, -8, 0]))
      for (let i = 0; i < panels; i++) top[side].push(t.add(i * p + p / 2, h, side * w))
    }
    for (const sd of [0, 1]) {
      for (let i = 0; i < panels; i++) {
        t.link(bot[sd][i], bot[sd][i + 1], 15)
        t.link(bot[sd][i], top[sd][i], 10)
        t.link(top[sd][i], bot[sd][i + 1], 10)
        if (i + 1 < panels) t.link(top[sd][i], top[sd][i + 1], 15)
      }
    }
    for (let i = 0; i <= panels; i++) t.link(bot[0][i], bot[1][i], 5)
    for (let i = 0; i < panels; i++) {
      t.link(top[0][i], top[1][i], 5)
      t.link(bot[0][i], bot[1][i + 1], 4)
      t.link(top[0][i], bot[1][i], 4)
      if (i + 1 < panels) t.link(top[0][i], top[1][i + 1], 4)
    }
    return t
  },
}
