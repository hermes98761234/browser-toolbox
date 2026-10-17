// Kanban board model helpers.

export interface Card {
  id: string
  col: string
  title: string
  desc: string
  labels: string[]
  due: string
  created: string
}

/**
 * Moves card `id` into column `toCol` so it becomes the `toIndex`-th card of that column
 * (index counted among the column's cards excluding the moved one). Order is the array order.
 */
export function moveCard(cards: Card[], id: string, toCol: string, toIndex: number): Card[] {
  const card = cards.find((c) => c.id === id)
  if (!card) return cards
  const rest = cards.filter((c) => c.id !== id)
  const moved = { ...card, col: toCol }
  const inCol = rest.filter((c) => c.col === toCol)
  const i = Math.max(0, Math.min(inCol.length, toIndex))
  if (i >= inCol.length) {
    // after the last card of that column (or at the end if the column is empty)
    const last = inCol[inCol.length - 1]
    const at = last ? rest.indexOf(last) + 1 : rest.length
    return [...rest.slice(0, at), moved, ...rest.slice(at)]
  }
  const at = rest.indexOf(inCol[i])
  return [...rest.slice(0, at), moved, ...rest.slice(at)]
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'later'
/** Due-date status relative to `today` (both YYYY-MM-DD); "soon" = within 3 days. */
export function dueState(due: string, today: string): DueState {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  const days = (Date.parse(due) - Date.parse(today)) / 86400000
  return days <= 3 ? 'soon' : 'later'
}

/** Case-insensitive search over title, description and label names. */
export function matches(c: Card, q: string, labelNames: Record<string, string>): boolean {
  if (!q.trim()) return true
  const hay = `${c.title} ${c.desc} ${c.labels.map((l) => labelNames[l] ?? '').join(' ')}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}
