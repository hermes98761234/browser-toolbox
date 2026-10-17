// SM-2 scheduling, CSV import and a tiny Markdown + TeX renderer for flashcards.

export interface Sched { ef: number; reps: number; interval: number; due: string; lapses: number }

export const addDays = (iso: string, d: number) => {
  const t = new Date(iso + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + d)
  return t.toISOString().slice(0, 10)
}

/**
 * SuperMemo-2. q: 0..5 answer quality. Returns the next schedule relative to `today`.
 * q < 3 resets repetitions (lapse) and shows the card again tomorrow.
 */
export function sm2(c: Pick<Sched, 'ef' | 'reps' | 'interval' | 'lapses'>, q: number, today: string): Sched {
  const ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (q < 3) return { ef, reps: 0, interval: 1, due: addDays(today, 1), lapses: c.lapses + 1 }
  const reps = c.reps + 1
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(c.interval * c.ef)
  return { ef, reps, interval, due: addDays(today, interval), lapses: c.lapses }
}

/** Splits CSV/TSV text into rows (auto-detects , ; or tab; supports quoted fields). */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const d = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++ }
      else if (ch === '"') q = false
      else f += ch
    } else if (ch === '"' && f === '') q = true
    else if (ch === d) { row.push(f); f = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(f); f = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else f += ch
  }
  row.push(f)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SYM: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Pi: 'Π', Gamma: 'Γ', Theta: 'Θ', Lambda: 'Λ', Phi: 'Φ', psi: 'ψ', eta: 'η', nu: 'ν', chi: 'χ',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  infty: '∞', sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
  iff: '⇔', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃', degree: '°', circ: '∘', hbar: 'ℏ', ell: 'ℓ',
  sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', exp: 'exp', lim: 'lim', quad: ' ', ',': ' ',
}

/** Renders a small TeX subset (sup/sub, \frac, \sqrt, Greek and operators) to HTML. */
export function tex(src: string): string {
  let i = 0
  const group = (): string => {
    while (src[i] === ' ') i++
    if (src[i] === '{') {
      i++
      const out = seq('}')
      i++
      return out
    }
    return atom()
  }
  const atom = (): string => {
    const ch = src[i]
    if (ch === undefined) return ''
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i))!
      i += m[0].length
      const name = m[1]
      if (name === 'frac') {
        const a = group(), b = group()
        return `<span class="tx-frac"><span>${a}</span><span>${b}</span></span>`
      }
      if (name === 'sqrt') return `√<span class="tx-sqrt">${group()}</span>`
      if (name === 'text' || name === 'mathrm') return `<span class="tx-up">${group()}</span>`
      if (name === 'vec') return `${group()}⃗`
      if (name === 'left' || name === 'right') return ''
      return SYM[name] !== undefined ? (/^[a-z]{2,}$/.test(SYM[name]) ? `<span class="tx-up">${SYM[name]}</span>` : SYM[name]) : esc(name)
    }
    i++
    if (/[A-Za-z]/.test(ch)) return `<i>${ch}</i>`
    if (ch === '-') return '−'
    return esc(ch)
  }
  const seq = (end?: string): string => {
    let out = ''
    while (i < src.length && src[i] !== end) {
      const ch = src[i]
      if (ch === '^' || ch === '_') {
        i++
        const g = group()
        out += ch === '^' ? `<sup>${g}</sup>` : `<sub>${g}</sub>`
      } else if (ch === '{') {
        i++
        out += seq('}')
        i++
      } else out += atom()
    }
    return out
  }
  return `<span class="tx">${seq()}</span>`
}

/** Markdown subset: paragraphs, - lists, **bold**, *italic*, `code`, $inline$ and $$display$$ math. */
export function md(src: string): string {
  const maths: string[] = []
  const protect = (html: string) => `\u0000${maths.push(html) - 1}\u0000`
  let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => protect(`<div class="tx-block">${tex(m.trim())}</div>`))
  s = s.replace(/\$([^$\n]+?)\$/g, (_, m: string) => protect(tex(m)))
  s = s.replace(/`([^`]+)`/g, (_, m: string) => protect(`<code>${esc(m)}</code>`))
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
  const blocks = s.split(/\n\s*\n/).map((b) => {
    const lines = b.split('\n')
    if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*] /, '')}</li>`).join('')}</ul>`
    if (lines.every((l) => /^\s*\d+[.)] /.test(l))) return `<ol>${lines.map((l) => `<li>${l.replace(/^\s*\d+[.)] /, '')}</li>`).join('')}</ol>`
    return `<p>${lines.join('<br>')}</p>`
  })
  // eslint-disable-next-line no-control-regex
  return blocks.join('').replace(/\u0000(\d+)\u0000/g, (_, k: string) => maths[Number(k)])
}
