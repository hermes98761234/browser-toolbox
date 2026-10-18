// Seamless pattern geometry: symmetry transforms about the tile centre, repeat lattices
// (grid, brick, half-drop) and SVG serialisation of vector shapes with wrap-around copies.

export type Sym = 'none' | 'mirrorX' | 'mirrorY' | 'quad' | 'rot2' | 'rot4' | 'diag' | 'kaleido'
export type Repeat = 'grid' | 'brick' | 'halfdrop'
export type Kind = 'pen' | 'line' | 'rect' | 'ellipse' | 'erase'

export interface Shape { kind: Kind; pts: [number, number][]; color: string; width: number; fill: boolean }

export const SYMS: [Sym, string][] = [
  ['none', 'None'], ['mirrorX', 'Mirror ↔'], ['mirrorY', 'Mirror ↕'], ['quad', 'Mirror both'], ['rot2', 'Rotate 2×'], ['rot4', 'Rotate 4×'], ['diag', 'Diagonal'], ['kaleido', 'Kaleidoscope 8×'],
]

type M = [number, number, number, number] // 2×2 linear part about the centre
const I: M = [1, 0, 0, 1], MX: M = [-1, 0, 0, 1], MY: M = [1, 0, 0, -1], R90: M = [0, -1, 1, 0], R180: M = [-1, 0, 0, -1], R270: M = [0, 1, -1, 0], D: M = [0, 1, 1, 0], AD: M = [0, -1, -1, 0]

export function symMatrices(s: Sym): M[] {
  switch (s) {
    case 'none': return [I]
    case 'mirrorX': return [I, MX]
    case 'mirrorY': return [I, MY]
    case 'quad': return [I, MX, MY, R180]
    case 'rot2': return [I, R180]
    case 'rot4': return [I, R90, R180, R270]
    case 'diag': return [I, D]
    case 'kaleido': return [I, R90, R180, R270, MX, MY, D, AD]
  }
}

export function applyM(m: M, p: [number, number], T: number): [number, number] {
  const c = T / 2, x = p[0] - c, y = p[1] - c
  return [c + m[0] * x + m[1] * y, c + m[2] * x + m[3] * y]
}

/** Lattice offset of tile (i, j) for a repeat mode. */
export function latticeOffset(r: Repeat, i: number, j: number, T: number): [number, number] {
  if (r === 'brick') return [i * T + j * (T / 2), j * T]
  if (r === 'halfdrop') return [i * T, j * T + i * (T / 2)]
  return [i * T, j * T]
}

/** Offsets needed so that shapes poking out of the tile reappear on the opposite side. */
export function wrapOffsets(r: Repeat, T: number, reach = 2): [number, number][] {
  const out: [number, number][] = []
  for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) {
    const o = latticeOffset(r, i, j, T)
    if (Math.abs(o[0]) <= 1.5 * T * reach && Math.abs(o[1]) <= 1.5 * T * reach) out.push(o)
  }
  return out
}

export function bbox(pts: [number, number][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

/** Every symmetric, wrapped copy of a shape whose bounds touch the tile. */
export function copies(sh: Shape, sym: Sym, rep: Repeat, T: number): [number, number][][] {
  const out: [number, number][][] = []
  const pad = sh.width / 2 + 1
  for (const m of symMatrices(sym)) {
    const base = sh.pts.map((p) => applyM(m, p, T))
    const [x0, y0, x1, y1] = bbox(base)
    for (const [dx, dy] of wrapOffsets(rep, T)) {
      if (x1 + dx < -pad || x0 + dx > T + pad || y1 + dy < -pad || y0 + dy > T + pad) continue
      out.push(base.map(([x, y]) => [x + dx, y + dy]))
    }
  }
  return out
}

/** Smooth path through freehand points (midpoint quadratic curves). */
export function pathD(pts: [number, number][]): string {
  const f = (v: number) => +v.toFixed(2)
  if (pts.length === 1) return `M${f(pts[0][0])},${f(pts[0][1])}l0.01,0`
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2
    d += `Q${f(pts[i][0])},${f(pts[i][1])} ${f(mx)},${f(my)}`
  }
  const l = pts[pts.length - 1]
  return d + `L${f(l[0])},${f(l[1])}`
}

/** SVG element for one transformed copy. */
export function shapeSvg(sh: Shape, pts: [number, number][], bg: string): string {
  const col = sh.kind === 'erase' ? bg : sh.color
  const stroke = `stroke="${col}" stroke-width="${sh.width}" stroke-linecap="round" stroke-linejoin="round"`
  if (sh.kind === 'pen' || sh.kind === 'erase') return `<path d="${pathD(pts)}" fill="none" ${stroke}/>`
  const [a, b] = [pts[0], pts[pts.length - 1]]
  if (sh.kind === 'line') return `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" ${stroke}/>`
  // rect/ellipse are stored as 4 corners so mirrors/rotations stay exact
  const [x0, y0, x1, y1] = bbox(pts)
  const fill = sh.fill ? `fill="${col}"` : 'fill="none"'
  if (sh.kind === 'rect') return `<rect x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${(x1 - x0).toFixed(2)}" height="${(y1 - y0).toFixed(2)}" ${fill} ${stroke}/>`
  return `<ellipse cx="${((x0 + x1) / 2).toFixed(2)}" cy="${((y0 + y1) / 2).toFixed(2)}" rx="${((x1 - x0) / 2).toFixed(2)}" ry="${((y1 - y0) / 2).toFixed(2)}" ${fill} ${stroke}/>`
}

/** Corner points for rect/ellipse from a drag (a → b). */
export const corners = (a: [number, number], b: [number, number]): [number, number][] => [a, [b[0], a[1]], b, [a[0], b[1]]]

export function tileSvg(shapes: Shape[], sym: Sym, rep: Repeat, T: number, bg: string): string {
  const body = shapes.flatMap((sh) => copies(sh, sym, rep, T).map((p) => shapeSvg(sh, p, bg))).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">
<defs><clipPath id="tile"><rect width="${T}" height="${T}"/></clipPath></defs>
<g clip-path="url(#tile)"><rect width="${T}" height="${T}" fill="${bg}"/>
${body}
</g></svg>`
}

/** A sheet of n×n tiles laid out on the repeat lattice. */
export function sheetSvg(shapes: Shape[], sym: Sym, rep: Repeat, T: number, bg: string, n: number): string {
  const inner = tileSvg(shapes, sym, rep, T, bg).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  const W = n * T
  const uses: string[] = []
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    const [x, y] = latticeOffset(rep, i, j, T)
    if (x > -T && x < W && y > -T && y < W) uses.push(`<use href="#t" x="${x}" y="${y}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
<defs><g id="t">${inner}</g></defs>
${uses.join('\n')}
</svg>`
}

/** Original demo motif: petals and dots arranged with 4-fold mirror symmetry. */
export function demoShapes(T: number): Shape[] {
  const c = T / 2
  const out: Shape[] = []
  // a leaf-like petal from centre towards the corner, mirrored ×4 by the symmetry
  const petal: [number, number][] = []
  for (let k = 0; k <= 24; k++) {
    const t = k / 24
    const x = c + (T * 0.42 - 0) * t, y = c + T * 0.42 * t
    const w = Math.sin(Math.PI * t) * T * 0.09
    petal.push([x + w, y - w])
  }
  for (let k = 24; k >= 0; k--) {
    const t = k / 24
    const x = c + T * 0.42 * t, y = c + T * 0.42 * t
    const w = Math.sin(Math.PI * t) * T * 0.09
    petal.push([x - w, y + w])
  }
  out.push({ kind: 'pen', pts: petal, color: '#0f766e', width: T * 0.025, fill: false })
  out.push({ kind: 'ellipse', pts: corners([c - T * 0.08, c - T * 0.08], [c + T * 0.08, c + T * 0.08]), color: '#f59e0b', width: 2, fill: true })
  out.push({ kind: 'ellipse', pts: corners([c - T * 0.035, -T * 0.035], [c + T * 0.035, T * 0.035]), color: '#e11d48', width: 2, fill: true })
  out.push({ kind: 'line', pts: [[c, c - T * 0.12], [c, T * 0.06]], color: '#0f766e', width: T * 0.015, fill: false })
  out.push({ kind: 'ellipse', pts: corners([T * 0.2, T * 0.06], [T * 0.26, T * 0.12]), color: '#6366f1', width: 2, fill: true })
  return out
}
