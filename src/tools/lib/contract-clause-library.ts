// Contract assembly: ordering, numbering, variables, tag statistics.
import { fill, placeholders } from './cover-letter-writer'

export interface Clause { id: string; title: string; category: string; tags: string[]; body: string }

export const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]

/** Placeholders across the selected clauses (and the preamble), first-seen order. */
export function docVars(preamble: string, clauses: Clause[]): string[] {
  return [...new Set([...placeholders(preamble), ...clauses.flatMap((c) => placeholders(c.body))])]
}

/** Plain-text contract with numbered headings ("1. Title"). Missing variables become [Name]. */
export function assemble(title: string, preamble: string, clauses: Clause[], vars: Record<string, string>, numbered = true): string {
  const parts: string[] = []
  if (title.trim()) parts.push(`**${title.trim().toUpperCase()}**`)
  if (preamble.trim()) parts.push(fill(preamble.trim(), vars))
  clauses.forEach((c, i) => {
    parts.push(`**${numbered ? `${i + 1}. ` : ''}${c.title}**`)
    const body = fill(c.body.trim(), vars)
    // Sub-paragraphs "(a) …" keep their own lines; number them "1.1" when numbering is on.
    const paras = body.split(/\n{2,}/)
    parts.push(...(numbered && paras.length > 1 ? paras.map((p, j) => `${i + 1}.${j + 1} ${p}`) : paras))
  })
  return parts.join('\n\n')
}

/** Tag → count, most used first. */
export function tagCounts(clauses: Clause[]): [string, number][] {
  const m = new Map<string, number>()
  for (const c of clauses) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Moves item `from` to index `to` (array copy). */
export function move<T>(xs: T[], from: number, to: number): T[] {
  const out = xs.slice()
  const [x] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x)
  return out
}
