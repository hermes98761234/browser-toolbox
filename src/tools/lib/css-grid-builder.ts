// grid-template-areas generation and validation for the CSS grid builder.

export type Cells = string[][] // rows × cols of area names, '.' = empty

export const isName = (s: string) => /^[a-zA-Z_][\w-]*$/.test(s)

/** Resizes the cell matrix, keeping existing names. */
export function resize(cells: Cells, rows: number, cols: number): Cells {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cells[r]?.[c] ?? '.'))
}

/** Fills the rectangle between two cells with a name. */
export function paint(cells: Cells, r0: number, c0: number, r1: number, c1: number, name: string): Cells {
  const [ra, rb] = [Math.min(r0, r1), Math.max(r0, r1)]
  const [ca, cb] = [Math.min(c0, c1), Math.max(c0, c1)]
  return cells.map((row, r) => row.map((v, c) => (r >= ra && r <= rb && c >= ca && c <= cb ? name : v)))
}

export interface Bounds { name: string; r0: number; c0: number; r1: number; c1: number; count: number }

/** Bounding boxes of named areas in order of first appearance. */
export function areas(cells: Cells): Bounds[] {
  const map = new Map<string, Bounds>()
  cells.forEach((row, r) =>
    row.forEach((n, c) => {
      if (n === '.') return
      const b = map.get(n)
      if (!b) map.set(n, { name: n, r0: r, c0: c, r1: r, c1: c, count: 1 })
      else Object.assign(b, { r0: Math.min(b.r0, r), c0: Math.min(b.c0, c), r1: Math.max(b.r1, r), c1: Math.max(b.c1, c), count: b.count + 1 })
    }),
  )
  return [...map.values()]
}

/** Names whose cells don't form one filled rectangle (invalid in CSS). */
export function invalidAreas(cells: Cells): string[] {
  return areas(cells)
    .filter((b) => {
      if (b.count !== (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1)) return true
      for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if (cells[r][c] !== b.name) return true
      return false
    })
    .map((b) => b.name)
}

/** grid-template-areas value with aligned columns. */
export function templateAreas(cells: Cells, indent = '    '): string {
  const w = Array.from({ length: cells[0]?.length ?? 0 }, (_, c) => Math.max(...cells.map((row) => row[c].length)))
  return cells.map((row) => `${indent}"${row.map((n, c) => n.padEnd(w[c])).join(' ')}"`).join('\n')
}

/** Collapses repeated tracks: ["1fr","1fr","1fr"] → "repeat(3, 1fr)". */
export function tracks(list: string[]): string {
  if (list.length > 1 && list.every((t) => t === list[0])) return `repeat(${list.length}, ${list[0]})`
  return list.join(' ')
}

export const validTrack = (t: string) => /^(auto|min-content|max-content|\d*\.?\d+(fr|px|%|rem|em|vw|vh)|minmax\(\s*[^,()]+\s*,\s*[^,()]+\s*\)|fit-content\(\s*[^()]+\s*\)|0)$/.test(t.trim())

export interface GridSpec {
  cols: string[]
  rows: string[]
  colGap: number
  rowGap: number
  cells: Cells
  container: string
  stackBelow: number // px, 0 = off
}

export function cssFor(g: GridSpec): string {
  const list = areas(g.cells)
  const parts = [
    `.${g.container} {`,
    '  display: grid;',
    `  grid-template-columns: ${tracks(g.cols)};`,
    `  grid-template-rows: ${tracks(g.rows)};`,
    '  grid-template-areas:',
    templateAreas(g.cells) + ';',
    g.colGap === g.rowGap ? `  gap: ${g.colGap}px;` : `  gap: ${g.rowGap}px ${g.colGap}px;`,
    '}',
    '',
    ...list.map((b) => `.${b.name} { grid-area: ${b.name}; }`),
  ]
  if (g.stackBelow > 0 && list.length) {
    parts.push(
      '',
      `@media (max-width: ${g.stackBelow}px) {`,
      `  .${g.container} {`,
      '    grid-template-columns: 1fr;',
      '    grid-template-rows: auto;',
      '    grid-template-areas:',
      list.map((b) => `      "${b.name}"`).join('\n') + ';',
      '  }',
      '}',
    )
  }
  return parts.join('\n') + '\n'
}

export function htmlFor(g: GridSpec): string {
  return [`<div class="${g.container}">`, ...areas(g.cells).map((b) => `  <div class="${b.name}">${b.name}</div>`), '</div>'].join('\n') + '\n'
}
