// Reference formatting for APA 7, MLA 9 and Chicago 17 (notes-bibliography), plus BibTeX import/export.
// Formatters return HTML with <i> for italics; use toPlain() for plain text.

export type Kind = 'book' | 'journal' | 'website' | 'chapter' | 'newspaper'
export type Style = 'apa' | 'mla' | 'chicago'

export interface Source {
  id: string
  kind: Kind
  authors: string // one per line: "Last, First Middle" or "First Last"; {Org Name} for organisations
  editors: string
  title: string
  container: string // journal, website, newspaper or book (for chapters)
  publisher: string
  place: string
  year: string
  month: string // 1–12 or ''
  day: string
  volume: string
  issue: string
  pages: string
  edition: string
  doi: string
  url: string
  accessed: string // YYYY-MM-DD
}

export interface Name { family: string; given: string; org?: boolean }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MLA_MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const it = (s: string) => (s ? `<i>${esc(s)}</i>` : '')
export const toPlain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** Adds `p` unless the text already ends with terminal punctuation. */
const end = (s: string, p = '.') => (!s ? '' : /[.?!]$/.test(toPlain(s).trim()) ? s : s + p)
const dash = (p: string) => p.replace(/\s*[-–—]+\s*/g, '–')

export function parseNames(text: string): Name[] {
  return text.split(/\n|;| and /).map((x) => x.trim()).filter(Boolean).map((x) => {
    const org = /^\{(.*)\}$/.exec(x)
    if (org) return { family: org[1], given: '', org: true }
    if (x.includes(',')) {
      const [f, ...g] = x.split(',')
      return { family: f.trim(), given: g.join(',').trim() }
    }
    const parts = x.split(/\s+/)
    if (parts.length === 1) return { family: x, given: '' }
    // keep particles with the family name (van, de, von, da…)
    let i = parts.length - 1
    while (i > 1 && /^(van|von|de|da|del|der|di|la|le|du|dos|ten|ter)$/i.test(parts[i - 1])) i--
    return { family: parts.slice(i).join(' '), given: parts.slice(0, i).join(' ') }
  })
}

export const initials = (given: string) =>
  given.split(/\s+/).filter(Boolean).map((g) => g.split('-').map((p) => (/^[A-Z]\.?$/i.test(p) ? p[0].toUpperCase() + '.' : p[0].toUpperCase() + '.')).join('-')).join(' ')

const inv = (n: Name) => (n.org || !n.given ? n.family : `${n.family}, ${n.given}`)
const fwd = (n: Name) => (n.org || !n.given ? n.family : `${n.given} ${n.family}`)
const apaName = (n: Name) => (n.org || !n.given ? n.family : `${n.family}, ${initials(n.given)}`)
const apaFwd = (n: Name) => (n.org || !n.given ? n.family : `${initials(n.given)} ${n.family}`)

const list = (xs: string[], and: string, serial = true) =>
  xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]}${serial && and === '&' ? ',' : ''} ${and} ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, ${and} ${xs[xs.length - 1]}`

export function apaAuthors(ns: Name[]): string {
  const a = ns.map(apaName)
  if (a.length > 20) return `${a.slice(0, 19).join(', ')}, . . . ${a[a.length - 1]}`
  return list(a, '&')
}
export function mlaAuthors(ns: Name[]): string {
  if (!ns.length) return ''
  if (ns.length === 1) return inv(ns[0])
  if (ns.length === 2) return `${inv(ns[0])}, and ${fwd(ns[1])}`
  return `${inv(ns[0])}, et al`
}
export function chicagoAuthors(ns: Name[]): string {
  if (!ns.length) return ''
  const shown = ns.length > 10 ? ns.slice(0, 7) : ns
  const parts = shown.map((n, i) => (i === 0 ? inv(n) : fwd(n)))
  if (ns.length > 10) return `${parts.join(', ')}, et al`
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`
  return list(parts, 'and')
}

/** Sentence case: capitalise first word and the word after a colon; keep acronyms / proper-looking words (internal caps). */
export function sentenceCase(t: string): string {
  let first = true
  return t.replace(/[^\s]+/g, (w) => {
    const keep = /[A-Z].*[A-Z]|\d/.test(w.slice(1)) || /^[A-Z]{2,}/.test(w)
    const out = first ? w[0].toUpperCase() + (keep ? w.slice(1) : w.slice(1).toLowerCase()) : keep ? w : w.toLowerCase()
    first = /:$/.test(w)
    return out
  })
}

const doiUrl = (d: string) => (d ? (/^https?:/.test(d) ? d : `https://doi.org/${d.replace(/^doi:\s*/i, '')}`) : '')
const fmtAccessed = (iso: string, style: Style) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [y, mo, d] = [m[1], +m[2], +m[3]]
  return style === 'mla' ? `${d} ${MLA_MON[mo - 1]} ${y}` : `${MONTHS[mo - 1]} ${d}, ${y}`
}

export function format(s: Source, style: Style, opts: { sentence?: boolean } = {}): string {
  const A = parseNames(s.authors), E = parseNames(s.editors)
  const mo = +s.month, d = +s.day
  const link = doiUrl(s.doi) || s.url
  const pages = dash(s.pages)
  const ed = s.edition && !/^1(st)?$/i.test(s.edition) ? s.edition.replace(/\s*ed\.?$/i, '') : ''
  const edTxt = ed ? (/^\d+$/.test(ed) ? `${ed}${['th', 'st', 'nd', 'rd'][+ed % 100 > 10 && +ed % 100 < 14 ? 0 : Math.min(+ed % 10, 4) % 4] ?? 'th'} ed.` : `${ed} ed.`) : ''

  if (style === 'apa') {
    const title = opts.sentence ? sentenceCase(s.title) : s.title
    const date = s.year ? (s.kind === 'website' || s.kind === 'newspaper') && mo ? `${s.year}, ${MONTHS[mo - 1]}${d ? ' ' + d : ''}` : s.year : 'n.d.'
    const who = apaAuthors(A)
    const t = s.kind === 'book' ? `${it(title)}${edTxt ? ` (${edTxt})` : ''}` : s.kind === 'website' ? it(title) : esc(title)
    // No author: the title moves into the author position.
    const head = who ? `${esc(end(who))} (${date}). ` : `${end(t)} (${date}). `
    const tPart = who ? `${end(t)} ` : ''
    let rest = ''
    if (s.kind === 'journal' || s.kind === 'newspaper') {
      const vol = s.volume ? `, ${it(s.volume)}${s.issue ? `(${esc(s.issue)})` : ''}` : ''
      rest = `${it(s.container)}${vol}${pages ? `, ${esc(pages)}` : ''}.`
    } else if (s.kind === 'book') rest = s.publisher ? `${esc(end(s.publisher))}` : ''
    else if (s.kind === 'chapter') {
      const eds = E.length ? `In ${esc(list(E.map(apaFwd), '&'))} (${E.length > 1 ? 'Eds.' : 'Ed.'}), ` : 'In '
      rest = `${eds}${it(s.container)}${pages || edTxt ? ` (${[edTxt, pages ? `pp. ${esc(pages)}` : ''].filter(Boolean).join(', ')})` : ''}. ${s.publisher ? esc(end(s.publisher)) : ''}`.trim()
    } else rest = s.container ? `${esc(end(s.container))}` : ''
    return `${head}${tPart}${rest}${link ? ' ' + esc(link) : ''}`.replace(/\s+/g, ' ').trim()
  }

  if (style === 'mla') {
    const who = mlaAuthors(A)
    const quoted = s.kind !== 'book'
    const t = quoted ? `“${esc(end(s.title))}”` : end(it(s.title))
    const date = s.year ? `${d && mo ? d + ' ' : ''}${mo ? MLA_MON[mo - 1] + ' ' : ''}${s.year}` : ''
    const els: string[] = []
    if (s.kind === 'book') {
      if (edTxt) els.push(esc(edTxt.replace(/ ed\.$/, ' ed.')))
      if (s.publisher) els.push(esc(s.publisher))
      if (date) els.push(esc(date))
    } else {
      if (s.container) els.push(it(s.container))
      if (s.kind === 'chapter' && E.length) els.push(`edited by ${esc(list(E.map(fwd), 'and', false))}`)
      if (s.volume) els.push(`vol. ${esc(s.volume)}`)
      if (s.issue) els.push(`no. ${esc(s.issue)}`)
      if (s.kind === 'chapter' && s.publisher) els.push(esc(s.publisher))
      if (s.kind === 'website' && s.publisher && s.publisher !== s.container) els.push(esc(s.publisher))
      if (date) els.push(esc(date))
      if (s.pages) els.push(`${/[-–]/.test(s.pages) ? 'pp.' : 'p.'} ${esc(s.pages.replace(/\s*[–—]\s*/g, '-'))}`)
      if (link) els.push(esc(link.replace(/^https?:\/\/(?!doi\.org)/, '')))
    }
    let out = `${who ? esc(end(who)) + ' ' : ''}${t} ${els.join(', ')}`.trim()
    out = end(out)
    if (s.accessed && s.kind === 'website') out += ` Accessed ${esc(fmtAccessed(s.accessed, 'mla'))}.`
    return out.replace(/\s+/g, ' ')
  }

  // Chicago 17 bibliography
  const who = chicagoAuthors(A)
  const date = s.year ? `${mo ? MONTHS[mo - 1] + ' ' + (d ? d + ', ' : '') : ''}${s.year}` : 'n.d.'
  const pub = [s.place && s.publisher ? `${esc(s.place)}: ${esc(s.publisher)}` : esc(s.publisher || s.place), esc(s.year || 'n.d.')].filter(Boolean).join(', ')
  let body = ''
  if (s.kind === 'book') body = `${end(it(s.title))}${edTxt ? ` ${esc(edTxt)}` : ''} ${end(pub)}`
  else if (s.kind === 'chapter') {
    const eds = E.length ? `, edited by ${esc(list(E.map(fwd), 'and', false))}` : ''
    body = `“${esc(end(s.title))}” In ${it(s.container)}${eds}${pages ? `, ${esc(pages)}` : ''}. ${end(pub)}`
  } else if (s.kind === 'journal') {
    body = `“${esc(end(s.title))}” ${it(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? `, no. ${esc(s.issue)}` : ''} (${esc(s.year || 'n.d.')})${pages ? `: ${esc(pages)}` : ''}.`
  } else if (s.kind === 'newspaper') {
    body = `“${esc(end(s.title))}” ${it(s.container)}, ${esc(date)}${pages ? `, ${esc(pages)}` : ''}.`
  } else {
    body = `“${esc(end(s.title))}” ${s.container ? esc(end(s.container)) + ' ' : ''}${s.year ? esc(end(date)) : s.accessed ? `Accessed ${esc(fmtAccessed(s.accessed, 'chicago'))}.` : ''}`
  }
  return `${who ? esc(end(who)) + ' ' : ''}${body}${link ? ' ' + esc(end(link)) : ''}`.replace(/\s+/g, ' ').trim()
}

/** Parenthetical in-text citation. */
export function inText(s: Source, style: Style): string {
  const A = parseNames(s.authors)
  const fam = A.map((n) => n.family)
  const short = s.title.split(/[:.?]/)[0].trim()
  if (style === 'apa') {
    const who = !fam.length ? short : fam.length === 1 ? fam[0] : fam.length === 2 ? `${fam[0]} & ${fam[1]}` : `${fam[0]} et al.`
    return `(${who}, ${s.year || 'n.d.'})`
  }
  if (style === 'mla') {
    const who = !fam.length ? `“${short}”` : fam.length === 1 ? fam[0] : fam.length === 2 ? `${fam[0]} and ${fam[1]}` : `${fam[0]} et al.`
    const pg = s.pages.split(/[-–]/)[0].trim()
    return `(${who}${pg ? ' ' + pg : ''})`
  }
  const who = !fam.length ? `“${short}”` : fam.length <= 3 ? list(fam, 'and', fam.length > 2) : `${fam[0]} et al.`
  return `(${who} ${s.year || 'n.d.'}${s.pages ? ', ' + s.pages.split(/[-–]/)[0].trim() : ''})`
}

export const sortKey = (s: Source) => (parseNames(s.authors)[0]?.family ?? s.title.replace(/^(the|a|an)\s+/i, '')).toLowerCase()

// ---------- BibTeX ----------

const BIB_KIND: Record<string, Kind> = { article: 'journal', book: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'chapter', online: 'website', misc: 'website', webpage: 'website' }
const MON_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function parseBibtex(text: string, mkId: () => string): Source[] {
  const out: Source[] = []
  const re = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase()
    if (type === 'comment' || type === 'string' || type === 'preamble') continue
    let i = re.lastIndex, depth = 1
    const start = i
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    const body = text.slice(start, i - 1)
    re.lastIndex = i
    const f: Record<string, string> = {}
    const fr = /(\w+)\s*=\s*/g
    let fm: RegExpExecArray | null
    while ((fm = fr.exec(body))) {
      let j = fr.lastIndex, val = ''
      if (body[j] === '{') {
        let dd = 0
        const s0 = j
        for (; j < body.length; j++) {
          if (body[j] === '{') dd++
          else if (body[j] === '}' && --dd === 0) break
        }
        val = body.slice(s0 + 1, j)
        j++
      } else if (body[j] === '"') {
        const e = body.indexOf('"', j + 1)
        val = body.slice(j + 1, e < 0 ? body.length : e)
        j = e < 0 ? body.length : e + 1
      } else {
        const e = /[,}\n]/.exec(body.slice(j))
        val = body.slice(j, e ? j + e.index : body.length).trim()
        j += e ? e.index : body.length
      }
      f[fm[1].toLowerCase()] = val.replace(/\s+/g, ' ').trim()
      fr.lastIndex = j
    }
    const clean = (v = '') => v.replace(/[{}]/g, '').replace(/\\&/g, '&').replace(/--/g, '–')
    const mon = (f.month ?? '').toLowerCase()
    const mi = MON_ABBR.findIndex((a) => mon.startsWith(a))
    const urldate = /\d{4}-\d{2}-\d{2}/.exec(f.urldate ?? f.note ?? '')?.[0] ?? ''
    out.push({
      id: mkId(),
      kind: BIB_KIND[type] ?? (f.journal ? 'journal' : 'book'),
      authors: (f.author ?? '').split(/\s+and\s+/i).map((a) => (/^\{.*\}$/.test(a.trim()) ? a.trim() : clean(a))).filter(Boolean).join('\n'),
      editors: clean(f.editor).split(/\s+and\s+/i).filter(Boolean).join('\n'),
      title: clean(f.title),
      container: clean(f.journal ?? f.journaltitle ?? f.booktitle ?? f.howpublished ?? f.organization),
      publisher: clean(f.publisher ?? f.institution ?? f.organization),
      place: clean(f.address ?? f.location),
      year: (f.year ?? f.date ?? '').slice(0, 4),
      month: mi >= 0 ? String(mi + 1) : /^\d+$/.test(mon) ? mon : '',
      day: f.day ?? '',
      volume: clean(f.volume),
      issue: clean(f.number ?? f.issue),
      pages: clean(f.pages),
      edition: clean(f.edition),
      doi: clean(f.doi),
      url: clean(f.url),
      accessed: urldate,
    })
  }
  return out
}

export function toBibtex(s: Source): string {
  const type = { book: 'book', journal: 'article', website: 'online', chapter: 'incollection', newspaper: 'article' }[s.kind]
  const key = (parseNames(s.authors)[0]?.family.replace(/\W/g, '') || 'anon').toLowerCase() + (s.year || '')
  const F: [string, string][] = [
    ['author', parseNames(s.authors).map((n) => (n.org ? `{${n.family}}` : inv(n))).join(' and ')],
    ['editor', parseNames(s.editors).map(inv).join(' and ')],
    ['title', s.title],
    [s.kind === 'chapter' ? 'booktitle' : s.kind === 'website' ? 'organization' : 'journal', s.kind === 'book' ? '' : s.container],
    ['publisher', s.publisher], ['address', s.place], ['year', s.year], ['month', s.month ? MON_ABBR[+s.month - 1] ?? '' : ''],
    ['volume', s.volume], ['number', s.issue], ['pages', s.pages.replace(/–/g, '--')], ['edition', s.edition], ['doi', s.doi], ['url', s.url], ['urldate', s.accessed],
  ]
  return `@${type}{${key},\n${F.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`
}
