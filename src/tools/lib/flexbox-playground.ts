// Flexbox model → CSS text (only non-default declarations).

export interface Container {
  direction: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  wrap: 'nowrap' | 'wrap' | 'wrap-reverse'
  justify: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline'
  alignContent: 'normal' | 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch'
  rowGap: number
  colGap: number
}

export interface Item {
  id: string
  grow: number
  shrink: number
  basis: string // "auto" | "120px" | "30%"
  alignSelf: 'auto' | 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline'
  order: number
  w: string // "" = auto
  h: string
}

export const CONTAINER_DEFAULT: Container = { direction: 'row', wrap: 'nowrap', justify: 'flex-start', alignItems: 'stretch', alignContent: 'normal', rowGap: 0, colGap: 0 }
export const ITEM_DEFAULT: Omit<Item, 'id'> = { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'auto', order: 0, w: '', h: '' }

/** CSS length validation for basis/width/height inputs. */
export const isLength = (v: string) => v === '' || v === 'auto' || v === 'content' || /^(\d+(\.\d+)?)(px|%|rem|em|vw|vh|ch|fr)?$/.test(v.trim()) || /^0$/.test(v.trim())

/** Shorthand for flex: grow shrink basis, using the common keywords where they match. */
export function flexShorthand(i: Pick<Item, 'grow' | 'shrink' | 'basis'>): string | null {
  const { grow: g, shrink: s, basis: b } = i
  if (g === 0 && s === 1 && b === 'auto') return null // initial
  if (g === 1 && s === 1 && b === '0%') return '1'
  if (g === 1 && s === 1 && b === 'auto') return 'auto'
  if (g === 0 && s === 0 && b === 'auto') return 'none'
  if (s === 1 && b === '0%') return String(g)
  return `${g} ${s} ${b}`
}

export function containerCss(c: Container, selector = '.container'): string {
  const d = CONTAINER_DEFAULT
  const lines = ['display: flex;']
  if (c.direction !== d.direction) lines.push(`flex-direction: ${c.direction};`)
  if (c.wrap !== d.wrap) lines.push(`flex-wrap: ${c.wrap};`)
  if (c.justify !== d.justify) lines.push(`justify-content: ${c.justify};`)
  if (c.alignItems !== d.alignItems) lines.push(`align-items: ${c.alignItems};`)
  if (c.alignContent !== d.alignContent && c.wrap !== 'nowrap') lines.push(`align-content: ${c.alignContent};`)
  if (c.rowGap || c.colGap) lines.push(c.rowGap === c.colGap ? `gap: ${c.rowGap}px;` : `gap: ${c.rowGap}px ${c.colGap}px;`)
  return `${selector} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`
}

export function itemCss(it: Item, selector: string): string | null {
  const lines: string[] = []
  const f = flexShorthand(it)
  if (f) lines.push(`flex: ${f};`)
  if (it.alignSelf !== 'auto') lines.push(`align-self: ${it.alignSelf};`)
  if (it.order) lines.push(`order: ${it.order};`)
  if (it.w) lines.push(`width: ${/^\d+(\.\d+)?$/.test(it.w) ? `${it.w}px` : it.w};`)
  if (it.h) lines.push(`height: ${/^\d+(\.\d+)?$/.test(it.h) ? `${it.h}px` : it.h};`)
  return lines.length ? `${selector} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}` : null
}

export function fullCss(c: Container, items: Item[]): string {
  return [containerCss(c), ...items.map((it, i) => itemCss(it, `.item-${i + 1}`)).filter(Boolean)].join('\n\n')
}
