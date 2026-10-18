// {{field}} templates: field extraction, substitution with defaults and built-ins, and a tiny
// Markdown-like formatter (bold, italic, links, bullet lists) for rich-text copying.

export interface Field { name: string; def: string }

const RE = /\{\{\s*([a-zA-Z_][\w .-]*?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g
export const BUILTINS = ['today', 'tomorrow', 'next_week', 'weekday', 'year'] as const

export function extractFields(...texts: string[]): Field[] {
  const out: Field[] = []
  for (const t of texts)
    for (const m of t.matchAll(RE)) {
      const name = m[1].trim()
      if ((BUILTINS as readonly string[]).includes(name)) continue
      const hit = out.find((f) => f.name === name)
      if (!hit) out.push({ name, def: m[2] ?? '' })
      else if (!hit.def && m[2]) hit.def = m[2]
    }
  return out
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
export function builtin(name: string, now: Date): string | undefined {
  const add = (n: number) => new Date(now.getTime() + n * 86400000)
  switch (name) {
    case 'today': return fmtDate(now)
    case 'tomorrow': return fmtDate(add(1))
    case 'next_week': return fmtDate(add(7))
    case 'weekday': return now.toLocaleDateString('en-GB', { weekday: 'long' })
    case 'year': return String(now.getFullYear())
  }
  return undefined
}

/** Replaces placeholders. Missing values fall back to the inline default, else stay as {{name}} (or `mark(name)`). */
export function fill(text: string, values: Record<string, string>, now = new Date(), mark?: (name: string) => string): string {
  return text.replace(RE, (whole, n: string, def?: string) => {
    const name = n.trim()
    const v = values[name]
    if (v !== undefined && v !== '') return v
    const b = builtin(name, now)
    if (b !== undefined) return b
    if (def) return def
    return mark ? mark(name) : whole
  })
}

export const missing = (fields: Field[], values: Record<string, string>) => fields.filter((f) => !values[f.name] && !f.def).map((f) => f.name)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Inline formatting on already-escaped text. */
function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
}

/** Plain text with light Markdown → email-safe HTML (paragraphs, line breaks, bullet lists). */
export function toHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return blocks
    .map((b) => {
      const lines = b.split('\n')
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(esc(l.replace(/^\s*[-*•]\s+/, '')))}</li>`).join('')}</ul>`
      return `<p>${lines.map((l) => inline(esc(l))).join('<br>')}</p>`
    })
    .join('\n')
}

/** Markdown-ish → plain text (links become “text (url)”, emphasis markers dropped). */
export function toPlain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '• ')
}

export const mailto = (to: string, subject: string, body: string) => `mailto:${encodeURIComponent(to).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
