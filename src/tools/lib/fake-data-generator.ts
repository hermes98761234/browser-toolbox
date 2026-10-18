// Seeded fake-data engine: original word lists, field generators, CSV / JSON / SQL export.
// All names, streets, cities and companies are assembled from short word parts written for this
// tool, so results look plausible without copying any third-party dataset. E-mail and web domains
// use the reserved example.* domains so generated data can never reach a real inbox.

export type FieldType =
  | 'id' | 'uuid' | 'firstName' | 'lastName' | 'fullName' | 'email' | 'username' | 'phone' | 'company' | 'jobTitle'
  | 'street' | 'city' | 'postcode' | 'country' | 'date' | 'datetime' | 'int' | 'decimal' | 'bool' | 'pick'
  | 'words' | 'sentence' | 'color' | 'ipv4' | 'url' | 'pattern' | 'constant'

export interface Field {
  id: string; name: string; type: FieldType
  min?: number; max?: number; decimals?: number; prob?: number; from?: string; to?: string
  options?: string; pattern?: string; value?: string; nulls?: number
}

export type Value = string | number | boolean | null
export type Rng = () => number

/** Mulberry32: small, fast, good-quality 32-bit PRNG. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Seed from any text (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const sp = (s: string) => s.split(' ')
const FIRST = sp('Ada Alder Amara Anton Aria Arlo Bea Bram Cato Celia Dario Dalia Elio Elsa Emery Ezra Fen Freya Gil Greta Hana Hugo Ines Ivo Juno Jasper Kai Kira Lena Leo Lior Luca Mara Milo Nadia Nils Noor Oren Otto Pia Quinn Rafa Rhea Rowan Runa Sami Sela Soren Tala Teo Uma Vera Vik Wren Xavi Yara Yuri Zara Zev Ilse Mateo Noa Odile Pavel Selin Tomas')
const SUR_A = sp('Ash Birch Brook Clay Cole Crane Dale Elm Fair Fern Frost Glen Hale Hart Hollow Lark Lind March Moss North Oak Pike Quarry Rain Reed Ridge Rook Rush Sand Stone Thorn Vale West Wilde Winter Wood')
const SUR_B = sp('by croft dell field ford gate grove ham hurst ley low man mere mont more ridge ton vale well wick worth')
const STREET_A = sp('Maple Cedar Willow Juniper Linden Poplar Rowan Hawthorn Chestnut Beacon Harbor Meadow Orchard Quarry Sparrow Heron Falcon Lantern Mill Granary Copper Silver Amber Clover Thistle Bramble Larch Aspen Saffron Fountain')
const STREET_B = sp('Street Avenue Lane Road Way Court Place Terrace Row Drive Walk Crescent')
const CITY_A = sp('Ash Bright Clear Elder Fair Glen Green High Iron Kings Lake Long Mill New North Oak Red River Silver South Stone Sun West White Wind')
const CITY_B = sp('borough bridge brook burn dale field ford gate haven hill holm marsh mere moor port stead ton vale water wood')
const CO_A = sp('Bright Blue Clever Copper Crisp Silver Golden North Prime Quiet Rapid Solid Swift True Vivid Bold Little Open Lucky Kind')
const CO_B = sp('Harbor Lantern Pine Summit Atlas Beacon Comet Delta Ember Falcon Garden Horizon Island Maple Meadow Orbit Pixel River Sparrow Tide')
const CO_C = sp('Labs Works Systems Studio Partners Group Collective Supply Logistics Analytics Foods Dynamics Ventures Co. Ltd. Inc.')
const JOB_A = sp('Senior Junior Lead Principal Associate Chief Assistant Staff')
const JOB_B = sp('Data Product Marketing Sales Finance Operations Support Design Research Quality Security People Platform')
const JOB_C = sp('Analyst Engineer Manager Designer Specialist Coordinator Consultant Director Officer Strategist Technician')
const COUNTRIES = sp('Argentina Australia Austria Belgium Brazil Canada Chile Colombia Czechia Denmark Egypt Estonia Finland France Germany Ghana Greece India Indonesia Ireland Italy Japan Kenya Mexico Morocco Netherlands Norway Peru Poland Portugal Singapore Spain Sweden Thailand Turkey Ukraine Uruguay Vietnam')
// Invented syllables for filler text (deliberately not Latin or any real language).
const SYL = sp('ba ri to ne ka lu mo si da ve tor lin pa qua ser no ta mi rel ost ven cal dor im ul es ar')
const DOMAINS = ['example.com', 'example.org', 'example.net']

const pick = <T,>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)]
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '')

export function word(r: Rng): string {
  let w = ''
  for (let i = int(r, 1, 3); i > 0; i--) w += pick(r, SYL)
  return w
}
export function sentence(r: Rng, n = int(r, 5, 12)): string {
  const ws = Array.from({ length: n }, () => word(r))
  ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1)
  return ws.join(' ') + '.'
}

/** Replaces # with a digit, ? with an upper-case letter, * with either. */
export function fromPattern(r: Rng, p: string): string {
  return p.replace(/[#?*]/g, (c) => (c === '#' || (c === '*' && r() < 0.5) ? String(int(r, 0, 9)) : String.fromCharCode(65 + int(r, 0, 25))))
}

export function uuid(r: Rng): string {
  const h = Array.from({ length: 32 }, () => int(r, 0, 15).toString(16))
  h[12] = '4'
  h[16] = (8 + int(r, 0, 3)).toString(16)
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/** "a, b:3, c" → weighted choice list. */
export function parseOptions(spec: string): { v: string; w: number }[] {
  return spec.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.*?):(\d+(?:\.\d+)?)$/.exec(x)
    return m ? { v: m[1].trim(), w: Number(m[2]) } : { v: x, w: 1 }
  })
}
function weighted(r: Rng, opts: { v: string; w: number }[]): string {
  const total = opts.reduce((a, o) => a + o.w, 0)
  let x = r() * total
  for (const o of opts) if ((x -= o.w) < 0) return o.v
  return opts[opts.length - 1]?.v ?? ''
}

interface Person { first: string; last: string }
const person = (r: Rng): Person => ({ first: pick(r, FIRST), last: pick(r, SUR_A) + pick(r, SUR_B) })

const dayMs = 86400000
const toTime = (d: string | undefined, def: string) => {
  const t = Date.parse((d || def) + 'T00:00:00Z')
  return Number.isFinite(t) ? t : Date.parse(def + 'T00:00:00Z')
}

/** One value for a field. `ctx` keeps the row's person/company consistent across fields. */
export function gen(f: Field, r: Rng, row: number, ctx: { p?: Person; co?: string }): Value {
  if (f.nulls && r() * 100 < f.nulls) return null
  const P = () => (ctx.p ??= person(r))
  switch (f.type) {
    case 'id': return (f.min ?? 1) + row
    case 'uuid': return uuid(r)
    case 'firstName': return P().first
    case 'lastName': return P().last
    case 'fullName': return `${P().first} ${P().last}`
    case 'email': {
      const p = P()
      const style = int(r, 0, 2)
      const local = style === 0 ? `${slug(p.first)}.${slug(p.last)}` : style === 1 ? `${slug(p.first)[0]}${slug(p.last)}` : `${slug(p.first)}${int(r, 1, 99)}`
      return `${local}@${pick(r, DOMAINS)}`
    }
    case 'username': return `${slug(P().first)}_${slug(P().last).slice(0, 4)}${int(r, 1, 999)}`
    case 'phone': return fromPattern(r, f.pattern || '+## ### ### ####')
    case 'company': return (ctx.co ??= `${pick(r, CO_A)} ${pick(r, CO_B)} ${pick(r, CO_C)}`)
    case 'jobTitle': return `${r() < 0.6 ? pick(r, JOB_A) + ' ' : ''}${pick(r, JOB_B)} ${pick(r, JOB_C)}`
    case 'street': return `${int(r, 1, 1999)} ${pick(r, STREET_A)} ${pick(r, STREET_B)}`
    case 'city': return pick(r, CITY_A) + pick(r, CITY_B)
    case 'postcode': return fromPattern(r, f.pattern || '#####')
    case 'country': return pick(r, COUNTRIES)
    case 'date':
    case 'datetime': {
      const a = toTime(f.from, '2020-01-01'), b = toTime(f.to, '2026-12-31')
      const lo = Math.min(a, b), hi = Math.max(a, b)
      if (f.type === 'date') return new Date(lo + int(r, 0, Math.round((hi - lo) / dayMs)) * dayMs).toISOString().slice(0, 10)
      return new Date(lo + Math.floor(r() * (hi - lo + dayMs) / 1000) * 1000).toISOString().replace('.000Z', 'Z')
    }
    case 'int': {
      const lo = Math.ceil(Math.min(f.min ?? 0, f.max ?? 100)), hi = Math.floor(Math.max(f.min ?? 0, f.max ?? 100))
      return int(r, lo, hi)
    }
    case 'decimal': {
      const lo = Math.min(f.min ?? 0, f.max ?? 1000), hi = Math.max(f.min ?? 0, f.max ?? 1000), d = Math.max(0, Math.min(8, f.decimals ?? 2))
      return Number((lo + r() * (hi - lo)).toFixed(d))
    }
    case 'bool': return r() * 100 < (f.prob ?? 50)
    case 'pick': return weighted(r, parseOptions(f.options || 'A, B, C'))
    case 'words': return Array.from({ length: int(r, Math.max(1, f.min ?? 1), Math.max(1, f.max ?? 3)) }, () => word(r)).join(' ')
    case 'sentence': return sentence(r)
    case 'color': return '#' + int(r, 0, 0xffffff).toString(16).padStart(6, '0')
    case 'ipv4': return `${int(r, 1, 223)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`
    case 'url': return `https://${slug(ctx.co ?? pick(r, CO_B))}.${pick(r, DOMAINS)}/${word(r)}`
    case 'pattern': return fromPattern(r, f.pattern || 'ID-####')
    case 'constant': return f.value ?? ''
  }
}

export function generate(fields: Field[], count: number, seed: number, offset = 0): Record<string, Value>[] {
  const out: Record<string, Value>[] = []
  for (let i = offset; i < offset + count; i++) {
    const r = rng(seed ^ Math.imul(i + 1, 0x9e3779b1)) // per-row stream: row i is the same however many rows are made
    const ctx = {}
    const row: Record<string, Value> = {}
    for (const f of fields) row[f.name] = gen(f, r, i, ctx)
    out.push(row)
  }
  return out
}

const csvCell = (v: Value, d: string) => {
  if (v === null) return ''
  const s = String(v)
  return s.includes(d) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(fields: Field[], rows: Record<string, Value>[], delim = ','): string {
  return [fields.map((f) => csvCell(f.name, delim)).join(delim), ...rows.map((r) => fields.map((f) => csvCell(r[f.name], delim)).join(delim))].join('\r\n') + '\r\n'
}

export type Dialect = 'ansi' | 'mysql' | 'sqlite'
const ident = (s: string, d: Dialect) => (d === 'mysql' ? `\`${s.replace(/`/g, '``')}\`` : `"${s.replace(/"/g, '""')}"`)
export const sqlValue = (v: Value, d: Dialect = 'ansi'): string =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (d === 'sqlite' ? (v ? '1' : '0') : v ? 'TRUE' : 'FALSE') : `'${(d === 'mysql' ? v.replace(/\\/g, '\\\\') : v).replace(/'/g, "''")}'`

export function sqlType(f: Field, d: Dialect): string {
  switch (f.type) {
    case 'id': case 'int': return 'INTEGER'
    case 'decimal': return `DECIMAL(14,${f.decimals ?? 2})`
    case 'bool': return d === 'sqlite' ? 'INTEGER' : 'BOOLEAN'
    case 'date': return 'DATE'
    case 'datetime': return d === 'mysql' ? 'DATETIME' : 'TIMESTAMP'
    case 'sentence': return 'TEXT'
    default: return 'VARCHAR(255)'
  }
}

export function toSql(fields: Field[], rows: Record<string, Value>[], table: string, d: Dialect, batch = 100, create = true): string {
  const t = ident(table || 'fake_data', d)
  const cols = fields.map((f) => ident(f.name, d)).join(', ')
  const out: string[] = []
  if (create) {
    out.push(`CREATE TABLE ${t} (\n${fields.map((f) => `  ${ident(f.name, d)} ${sqlType(f, d)}${f.type === 'id' ? ' PRIMARY KEY' : ''}`).join(',\n')}\n);\n`)
  }
  const n = Math.max(1, batch)
  for (let i = 0; i < rows.length; i += n) {
    const chunk = rows.slice(i, i + n).map((r) => `  (${fields.map((f) => sqlValue(r[f.name], d)).join(', ')})`)
    out.push(`INSERT INTO ${t} (${cols}) VALUES\n${chunk.join(',\n')};`)
  }
  return out.join('\n') + '\n'
}
