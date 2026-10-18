// Column grid math: container, column width, column positions, spans, breakpoints and CSS export.

export interface Breakpoint { id: string; name: string; min: number; columns: number; gutter: number; margin: number; maxWidth: number }

export interface Layout { viewport: number; container: number; offset: number; content: number; colW: number; cols: { x0: number; x1: number }[]; valid: boolean }

/** Breakpoint that applies at `width` (largest min ≤ width; falls back to the smallest). */
export function pick(bps: Breakpoint[], width: number): Breakpoint {
  const sorted = [...bps].sort((a, b) => a.min - b.min)
  return [...sorted].reverse().find((b) => width >= b.min) ?? sorted[0]
}

/** Grid geometry at a viewport width. maxWidth 0 = fluid. Margins sit inside the container. */
export function layout(bp: Breakpoint, viewport: number): Layout {
  const container = bp.maxWidth > 0 ? Math.min(viewport, bp.maxWidth) : viewport
  const offset = (viewport - container) / 2
  const content = container - 2 * bp.margin
  const n = Math.max(1, Math.round(bp.columns))
  const colW = (content - (n - 1) * bp.gutter) / n
  const cols = Array.from({ length: n }, (_, i) => { const x0 = offset + bp.margin + i * (colW + bp.gutter); return { x0, x1: x0 + colW } })
  return { viewport, container, offset, content, colW, cols, valid: colW > 0 }
}

/** Width of an element spanning `n` columns (including the gutters between them). */
export const spanWidth = (l: Layout, n: number, gutter: number) => n * l.colW + Math.max(0, n - 1) * gutter

const px = (v: number) => `${+v.toFixed(3)}px`

/** Mobile-first CSS using custom properties and media queries. */
export function css(bps: Breakpoint[], cls = 'grid'): string {
  const sorted = [...bps].sort((a, b) => a.min - b.min)
  const block = (b: Breakpoint, ind: string) => [
    `${ind}--grid-columns: ${b.columns};`,
    `${ind}--grid-gutter: ${px(b.gutter)};`,
    `${ind}--grid-margin: ${px(b.margin)};`,
    `${ind}--grid-max: ${b.maxWidth > 0 ? px(b.maxWidth) : 'none'};`,
  ].join('\n')
  const out = [
    `/* ${sorted.map((b) => `${b.name}: ${b.columns} cols`).join(' · ')} */`,
    `.${cls} {`,
    block(sorted[0], '  '),
    '  display: grid;',
    '  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));',
    '  column-gap: var(--grid-gutter);',
    '  padding-inline: var(--grid-margin);',
    '  max-width: var(--grid-max);',
    '  margin-inline: auto;',
    '  box-sizing: border-box;',
    '}',
  ]
  for (const b of sorted.slice(1)) out.push('', `@media (min-width: ${b.min}px) {`, `  .${cls} {`, block(b, '    '), '  }', '}')
  out.push('', `/* span helpers */`, `.${cls} > .span-all { grid-column: 1 / -1; }`)
  const maxCols = Math.max(...sorted.map((b) => b.columns))
  for (let i = 1; i <= Math.min(maxCols, 12); i++) out.push(`.${cls} > .span-${i} { grid-column: span min(${i}, var(--grid-columns)); }`)
  return out.join('\n')
}

/** A background-image overlay for checking a page against the grid (paste into dev tools). */
export function overlayCss(b: Breakpoint, color = 'rgba(255, 0, 80, 0.12)'): string {
  return [
    `/* ${b.name} overlay — apply to the grid container */`,
    '.grid-overlay {',
    `  --cols: ${b.columns}; --gutter: ${px(b.gutter)}; --margin: ${px(b.margin)};`,
    '  --col: calc((100% - 2 * var(--margin) - (var(--cols) - 1) * var(--gutter)) / var(--cols));',
    '  background-image: repeating-linear-gradient(to right,',
    `    ${color} 0, ${color} var(--col),`,
    '    transparent var(--col), transparent calc(var(--col) + var(--gutter)));',
    '  background-origin: content-box;',
    '  background-clip: content-box;',
    '  padding-inline: var(--margin);',
    '}',
  ].join('\n')
}

export const DEFAULT_BPS: Breakpoint[] = [
  { id: 'xs', name: 'Mobile', min: 0, columns: 4, gutter: 16, margin: 16, maxWidth: 0 },
  { id: 'md', name: 'Tablet', min: 600, columns: 8, gutter: 24, margin: 32, maxWidth: 0 },
  { id: 'lg', name: 'Desktop', min: 1024, columns: 12, gutter: 24, margin: 40, maxWidth: 1280 },
]

export const PRESETS: Record<string, { name: string; bps: Breakpoint[] }> = {
  default: { name: '4 / 8 / 12 responsive', bps: DEFAULT_BPS },
  bootstrap: { name: 'Bootstrap-like 12 col', bps: [
    { id: 'xs', name: 'xs', min: 0, columns: 12, gutter: 24, margin: 12, maxWidth: 0 },
    { id: 'sm', name: 'sm', min: 576, columns: 12, gutter: 24, margin: 12, maxWidth: 540 },
    { id: 'md', name: 'md', min: 768, columns: 12, gutter: 24, margin: 12, maxWidth: 720 },
    { id: 'lg', name: 'lg', min: 992, columns: 12, gutter: 24, margin: 12, maxWidth: 960 },
    { id: 'xl', name: 'xl', min: 1200, columns: 12, gutter: 24, margin: 12, maxWidth: 1140 },
  ] },
  editorial: { name: 'Editorial 6 col', bps: [
    { id: 'm', name: 'Mobile', min: 0, columns: 2, gutter: 20, margin: 20, maxWidth: 0 },
    { id: 'd', name: 'Desktop', min: 900, columns: 6, gutter: 32, margin: 48, maxWidth: 1200 },
  ] },
  print: { name: 'A4 page (595 pt) 6 col', bps: [{ id: 'a4', name: 'A4', min: 0, columns: 6, gutter: 12, margin: 42, maxWidth: 595 }] },
}
