// Redirect mapping → server configs, with duplicate / loop / chain detection.

export type Code = 301 | 302 | 307 | 308 | 410
export interface Rule { from: string; to: string; code: Code; line: number }
export interface Opts { code: Code; ignoreCase: boolean; trailingSlash: boolean; keepQuery: boolean }
export type Format = 'nginx' | 'apache' | 'netlify' | 'vercel' | 'caddy'

/** Path part of a URL or path: "https://a.com/x/?q" → "/x/?q". */
export function toPath(s: string): string {
  const t = s.trim()
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i.exec(t)
  const p = m ? (m[1] ?? '/') : t
  return p.startsWith('/') ? p : `/${p}`
}

/** Parses CSV / TSV / whitespace lines: from, to[, code]. Header rows are skipped. */
export function parse(text: string, def: Code): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const parts = (line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s+/)).map((p) => p.trim().replace(/^"|"$/g, '')).filter(Boolean)
    if (i === 0 && /^(old|from|source)/i.test(parts[0] ?? '')) return
    const code = Number(parts[2] ?? parts[1])
    if (parts.length === 2 && code === 410) { rules.push({ from: toPath(parts[0]), to: '', code: 410, line: i + 1 }); return }
    if (parts.length < 2) { errors.push(`Line ${i + 1}: needs an old and a new path`); return }
    const c = parts[2] ? Number(parts[2]) : def
    if (![301, 302, 307, 308, 410].includes(c)) { errors.push(`Line ${i + 1}: unsupported status “${parts[2]}”`); return }
    const to = parts[1].trim()
    rules.push({ from: toPath(parts[0]), to: /^[a-z][a-z0-9+.-]*:\/\//i.test(to) ? to : toPath(to), code: c as Code, line: i + 1 })
  })
  return { rules, errors }
}

/** Key used for matching: no query, optional case-folding and trailing-slash folding. */
export function key(p: string, o: Pick<Opts, 'ignoreCase' | 'trailingSlash'>): string {
  let k = p.split(/[?#]/)[0]
  if (o.trailingSlash && k.length > 1) k = k.replace(/\/+$/, '')
  return o.ignoreCase ? k.toLowerCase() : k
}

export interface Finding { kind: 'duplicate' | 'conflict' | 'loop' | 'chain' | 'self'; lines: number[]; msg: string }

export function analyze(rules: Rule[], o: Opts): Finding[] {
  const out: Finding[] = []
  const by = new Map<string, Rule[]>()
  for (const r of rules) by.set(key(r.from, o), [...(by.get(key(r.from, o)) ?? []), r])
  for (const [k, rs] of by) {
    if (rs.length < 2) continue
    const targets = new Set(rs.map((r) => `${r.to}|${r.code}`))
    out.push(targets.size > 1
      ? { kind: 'conflict', lines: rs.map((r) => r.line), msg: `${k} redirects to ${[...new Set(rs.map((r) => r.to || '410'))].join(' and ')} — only the first rule will win` }
      : { kind: 'duplicate', lines: rs.map((r) => r.line), msg: `${k} is listed ${rs.length} times` })
  }
  const first = new Map<string, Rule>()
  for (const r of rules) if (!first.has(key(r.from, o))) first.set(key(r.from, o), r)
  const internal = (t: string) => (t.startsWith('/') ? key(t, o) : null)
  const seenLoop = new Set<string>()
  for (const r of first.values()) {
    if (!r.to) continue
    if (internal(r.to) === key(r.from, o)) { out.push({ kind: 'self', lines: [r.line], msg: `${r.from} redirects to itself` }); continue }
    const path = [r]
    let cur = internal(r.to)
    while (cur && first.has(cur)) {
      const nx = first.get(cur)!
      if (path.includes(nx)) {
        const cyc = path.slice(path.indexOf(nx))
        const id = cyc.map((x) => x.line).sort((a, b) => a - b).join(',')
        if (!seenLoop.has(id)) { seenLoop.add(id); out.push({ kind: 'loop', lines: cyc.map((x) => x.line), msg: `Redirect loop: ${[...cyc.map((x) => x.from), nx.from].join(' → ')}` }) }
        break
      }
      path.push(nx)
      if (!nx.to) break
      cur = internal(nx.to)
    }
    if (path.length > 1 && !out.some((f) => f.kind === 'loop' && f.lines.includes(r.line))) {
      const last = path[path.length - 1]
      out.push({ kind: 'chain', lines: path.map((x) => x.line), msg: `Chain of ${path.length} hops: ${path.map((x) => x.from).join(' → ')} → ${last.to || '410'}` })
    }
  }
  return out
}

/** Points every rule straight at its final destination (loops are left untouched). Duplicate sources keep the first rule. */
export function flatten(rules: Rule[], o: Opts): Rule[] {
  const first = new Map<string, Rule>()
  for (const r of rules) if (!first.has(key(r.from, o))) first.set(key(r.from, o), r)
  return [...first.values()].map((r) => {
    let cur = r
    const seen = new Set<Rule>([r])
    while (cur.to.startsWith('/') && first.has(key(cur.to, o))) {
      const nx = first.get(key(cur.to, o))!
      if (seen.has(nx)) return r
      seen.add(nx)
      cur = nx
    }
    return cur === r ? r : { ...r, to: cur.to, code: cur.to ? r.code : 410 }
  })
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const nginxPath = (p: string) => (/[\s;{}"']/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p)

export function generate(rules: Rule[], f: Format, o: Opts): string {
  const rs = rules
  const src = (r: Rule) => r.from.split(/[?#]/)[0]
  switch (f) {
    case 'nginx': {
      const L = ['# Inside your server { } block']
      for (const r of rs) {
        const p = src(r)
        const tgt = r.to + (o.keepQuery && r.to ? '$is_args$args' : '')
        const body = r.code === 410 ? 'return 410;' : `return ${r.code} ${nginxPath(tgt)};`
        if (o.ignoreCase || (o.trailingSlash && p.length > 1)) {
          const rx = `^${reEsc(p.replace(/\/+$/, '') || '/')}${o.trailingSlash && p.length > 1 ? '/?' : ''}$`
          L.push(`location ${o.ignoreCase ? '~*' : '~'} "${rx}" { ${body} }`)
        } else L.push(`location = ${nginxPath(p)} { ${body} }`)
      }
      return L.join('\n') + '\n'
    }
    case 'apache': {
      const L = ['# .htaccess (needs mod_rewrite)', 'RewriteEngine On']
      for (const r of rs) {
        const p = src(r).replace(/^\//, '')
        const rx = `^${reEsc(o.trailingSlash ? p.replace(/\/+$/, '') : p)}${o.trailingSlash && p ? '/?' : ''}$`
        const flags = [r.code === 410 ? 'G' : `R=${r.code}`, 'L', ...(o.ignoreCase ? ['NC'] : []), ...(!o.keepQuery && r.code !== 410 ? ['QSD'] : [])]
        L.push(`RewriteRule ${rx} ${r.code === 410 ? '-' : r.to.replace(/ /g, '%20')} [${flags.join(',')}]`)
      }
      return L.join('\n') + '\n'
    }
    case 'netlify': {
      const L = ['# _redirects (Netlify, Cloudflare Pages)']
      for (const r of rs) {
        if (r.code === 410) { L.push(`# ${src(r)} → 410 Gone is not supported; consider a 404 page`); continue }
        L.push(`${src(r)}  ${r.to}  ${r.code}`)
      }
      return L.join('\n') + '\n'
    }
    case 'vercel': {
      const redirects = rs.filter((r) => r.code !== 410).map((r) => ({ source: src(r), destination: r.to, statusCode: r.code }))
      return JSON.stringify({ redirects }, null, 2) + '\n'
    }
    case 'caddy': {
      const L = ['# Inside your site block']
      for (const r of rs) L.push(r.code === 410 ? `respond ${src(r)} 410` : `redir ${src(r)} ${r.to} ${r.code}`)
      return L.join('\n') + '\n'
    }
  }
}
