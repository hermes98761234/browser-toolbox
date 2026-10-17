// Replacement-template expansion with case modifiers and a sequential rule pipeline.

export interface Rule { id: string; on: boolean; find: string; replace: string; flags: string; literal: boolean }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function compile(r: Pick<Rule, 'find' | 'flags' | 'literal'>): RegExp {
  return new RegExp(r.literal ? escapeRe(r.find) : r.find, r.flags)
}

/**
 * Expands a replacement template like JS String.replace ($1 $<name> $& $` $' $$) plus
 * sed/Perl-style case modifiers: \U…\E upper, \L…\E lower, \u / \l next char, and \n \t escapes.
 */
export function expand(tpl: string, m: string[], index: number, input: string, groups?: Record<string, string | undefined>): string {
  let out = ''
  let mode: 'U' | 'L' | '' = ''
  let once: 'u' | 'l' | '' = ''
  const emit = (s: string) => {
    if (!s) return
    let t = mode === 'U' ? s.toUpperCase() : mode === 'L' ? s.toLowerCase() : s
    if (once) {
      t = (once === 'u' ? t[0].toUpperCase() : t[0].toLowerCase()) + t.slice(1)
      once = ''
    }
    out += t
  }
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i]
    if (c === '\\' && i + 1 < tpl.length) {
      const n = tpl[i + 1]
      if (n === 'U' || n === 'L') { mode = n; i++; continue }
      if (n === 'E') { mode = ''; i++; continue }
      if (n === 'u' || n === 'l') { once = n; i++; continue }
      if (n === 'n') { emit('\n'); i++; continue }
      if (n === 't') { emit('\t'); i++; continue }
      if (n === '\\') { emit('\\'); i++; continue }
      emit(c)
      continue
    }
    if (c === '$' && i + 1 < tpl.length) {
      const n = tpl[i + 1]
      if (n === '$') { emit('$'); i++; continue }
      if (n === '&') { emit(m[0]); i++; continue }
      if (n === '`') { emit(input.slice(0, index)); i++; continue }
      if (n === "'") { emit(input.slice(index + m[0].length)); i++; continue }
      if (n === '<' && groups) {
        const e = tpl.indexOf('>', i)
        if (e > 0) { emit(groups[tpl.slice(i + 2, e)] ?? ''); i = e; continue }
      }
      const d = /^\d{1,2}/.exec(tpl.slice(i + 1))
      if (d) {
        // prefer two-digit group if it exists, as JS does
        let g = d[0]
        if (g.length === 2 && Number(g) >= m.length) g = g[0]
        const k = Number(g)
        if (k > 0 && k < m.length) { emit(m[k] ?? ''); i += g.length; continue }
      }
    }
    emit(c)
  }
  return out
}

export interface Applied { text: string; count: number; error: string }

/** Applies one rule; counts replacements. */
export function applyRule(text: string, r: Rule): Applied {
  if (!r.find) return { text, count: 0, error: '' }
  let re: RegExp
  try {
    re = compile(r)
  } catch (e) {
    return { text, count: 0, error: (e as Error).message }
  }
  let count = 0
  const res = text.replace(re, (...args: unknown[]) => {
    count++
    const hasGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null
    const groups = hasGroups ? (args[args.length - 1] as Record<string, string | undefined>) : undefined
    const base = hasGroups ? args.length - 3 : args.length - 2
    const m = args.slice(0, base) as string[]
    const index = args[base] as number
    return r.literal ? r.replace : expand(r.replace, m, index, text, groups)
  })
  return { text: res, count, error: '' }
}

/** Runs enabled rules in order. */
export function pipeline(text: string, rules: Rule[]): { text: string; counts: number[]; errors: string[] } {
  const counts: number[] = []
  const errors: string[] = []
  let t = text
  for (const r of rules) {
    if (!r.on) { counts.push(0); errors.push(''); continue }
    const a = applyRule(t, r)
    t = a.text
    counts.push(a.count)
    errors.push(a.error)
  }
  return { text: t, counts, errors }
}
