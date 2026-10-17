// A small in-memory SQL engine (SQLite-flavoured subset):
// CREATE TABLE [AS SELECT], DROP TABLE, INSERT (VALUES | SELECT), UPDATE, DELETE and
// SELECT [DISTINCT] … FROM … [INNER|LEFT|CROSS JOIN … ON …] WHERE … GROUP BY … HAVING … ORDER BY … LIMIT … OFFSET,
// with aggregates (note: "/" is always real division), scalar functions, CASE, CAST, LIKE, IN (list | subquery), BETWEEN, IS NULL and scalar subqueries.

export type Value = number | string | null
export interface Column { name: string; type: string }
export interface Table { name: string; cols: Column[]; rows: Value[][]; pk?: number }
export interface Db { tables: Record<string, Table> }
export interface Result { columns: string[]; rows: Value[][]; message?: string; ms?: number }

export class SqlError extends Error {
  /** 0-based character offset of the problem in the SQL text, when known. */
  pos?: number
  constructor(msg: string, pos?: number) {
    super(msg)
    this.pos = pos
  }
}

// ---------- tokenizer ----------

interface Tok { t: 'num' | 'str' | 'id' | 'qid' | 'op' | 'eof'; v: string; p: number }

export function tokenize(sql: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue }
    if (c === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue }
    const p = i
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const m = /^(\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.)/.exec(sql.slice(i))!
      out.push({ t: 'num', v: m[0], p })
      i += m[0].length
    } else if (c === "'") {
      let s = ''
      i++
      for (;;) {
        if (i >= sql.length) throw new SqlError(`Unterminated string starting at ${p + 1}`, p)
        if (sql[i] === "'") { if (sql[i + 1] === "'") { s += "'"; i += 2; continue } i++; break }
        s += sql[i++]
      }
      out.push({ t: 'str', v: s, p })
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c
      const e = sql.indexOf(close, i + 1)
      if (e < 0) throw new SqlError(`Unterminated identifier at ${p + 1}`, p)
      out.push({ t: 'qid', v: sql.slice(i + 1, e), p })
      i = e + 1
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i))!
      out.push({ t: 'id', v: m[0], p })
      i += m[0].length
    } else {
      const two = sql.slice(i, i + 2)
      const op = ['<=', '>=', '<>', '!=', '==', '||'].includes(two) ? two : c
      if (!'<>=!+-*/%(),.;|'.includes(op[0])) throw new SqlError(`Unexpected character "${c}" at ${p + 1}`, p)
      out.push({ t: 'op', v: op, p })
      i += op.length
    }
  }
  out.push({ t: 'eof', v: '', p: sql.length })
  return out
}

// ---------- AST ----------

export type Expr =
  | { k: 'lit'; v: Value }
  | { k: 'col'; table?: string; name: string }
  | { k: 'star'; table?: string }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'un'; op: string; a: Expr }
  | { k: 'fn'; name: string; args: Expr[]; distinct?: boolean; star?: boolean }
  | { k: 'in'; a: Expr; list?: Expr[]; sub?: Select; not: boolean }
  | { k: 'between'; a: Expr; lo: Expr; hi: Expr; not: boolean }
  | { k: 'like'; a: Expr; pat: Expr; not: boolean }
  | { k: 'isnull'; a: Expr; not: boolean }
  | { k: 'case'; base?: Expr; whens: [Expr, Expr][]; els?: Expr }
  | { k: 'cast'; a: Expr; type: string }
  | { k: 'sub'; sel: Select }
  | { k: 'exists'; sel: Select; not: boolean }

interface Item { expr: Expr; alias?: string; text: string }
interface Source { table: string; alias: string }
interface Join extends Source { kind: 'inner' | 'left' | 'cross'; on?: Expr }
export interface Select {
  type: 'select'
  distinct: boolean
  items: Item[]
  from?: Source
  joins: Join[]
  where?: Expr
  groupBy: Expr[]
  having?: Expr
  orderBy: { expr: Expr; desc: boolean }[]
  limit?: Expr
  offset?: Expr
}
type Stmt =
  | Select
  | { type: 'create'; name: string; cols: Column[]; pk?: number; ifNot: boolean; as?: Select }
  | { type: 'drop'; name: string; ifExists: boolean }
  | { type: 'insert'; table: string; cols?: string[]; values?: Expr[][]; sel?: Select }
  | { type: 'update'; table: string; sets: [string, Expr][]; where?: Expr }
  | { type: 'delete'; table: string; where?: Expr }

const RESERVED = new Set('select from where group by having order limit offset join inner left right outer cross on as and or not union values set into is null in between like case when then else end asc desc distinct exists'.split(' '))
const AGG = new Set(['count', 'sum', 'avg', 'min', 'max', 'total', 'group_concat'])
/** MIN/MAX with one argument aggregate; with several they are scalar. */
const isAgg = (e: { name: string; args: unknown[]; star?: boolean }) => AGG.has(e.name) && ((e.name !== 'min' && e.name !== 'max') || e.args.length === 1)

// ---------- parser ----------

class Parser {
  i = 0
  toks: Tok[]
  src: string
  constructor(toks: Tok[], src: string) {
    this.toks = toks
    this.src = src
  }
  get peek() { return this.toks[this.i] }
  err(msg: string): never {
    const p = this.peek.p
    const before = this.src.slice(0, p).split('\n')
    throw new SqlError(`${msg} near "${this.peek.v || 'end of input'}" (line ${before.length}, col ${before[before.length - 1].length + 1})`, p)
  }
  isKw(...k: string[]) { return this.peek.t === 'id' && k.includes(this.peek.v.toLowerCase()) }
  kw(...k: string[]) { if (this.isKw(...k)) { this.i++; return true } return false }
  needKw(k: string) { if (!this.kw(k)) this.err(`Expected ${k.toUpperCase()}`) }
  isOp(o: string) { return this.peek.t === 'op' && this.peek.v === o }
  op(o: string) { if (this.isOp(o)) { this.i++; return true } return false }
  needOp(o: string) { if (!this.op(o)) this.err(`Expected "${o}"`) }
  ident(): string {
    const t = this.peek
    if (t.t === 'qid' || (t.t === 'id' && !RESERVED.has(t.v.toLowerCase()))) { this.i++; return t.v }
    return this.err('Expected a name')
  }

  statements(): Stmt[] {
    const out: Stmt[] = []
    while (this.peek.t !== 'eof') {
      if (this.op(';')) continue
      out.push(this.statement())
      if ((this.peek.t as string) !== 'eof') this.needOp(';')
    }
    return out
  }

  statement(): Stmt {
    if (this.isKw('select')) return this.select()
    if (this.kw('create')) {
      this.needKw('table')
      let ifNot = false
      if (this.kw('if')) { this.needKw('not'); this.needKw('exists'); ifNot = true }
      const name = this.ident()
      if (this.kw('as')) return { type: 'create', name, cols: [], ifNot, as: this.select() }
      this.needOp('(')
      const cols: Column[] = []
      let pk: number | undefined
      do {
        if (this.isKw('primary', 'unique', 'foreign', 'constraint', 'check')) {
          if (this.kw('primary')) {
            this.needKw('key')
            this.needOp('(')
            const c = this.ident().toLowerCase()
            const j = cols.findIndex((x) => x.name.toLowerCase() === c)
            if (j >= 0 && this.isOp(')')) pk = j
          }
          this.skipDef()
          continue
        }
        const n = this.ident()
        let type = ''
        while (this.peek.t === 'id' && !this.isKw('primary', 'not', 'null', 'unique', 'default', 'references', 'check')) type += (type ? ' ' : '') + this.toks[this.i++].v
        if (this.op('(')) { while (!this.op(')')) this.i++ }
        if (this.isKw('primary')) pk = cols.length
        this.skipDef()
        cols.push({ name: n, type: type.toUpperCase() || 'ANY' })
      } while (this.op(','))
      this.needOp(')')
      return { type: 'create', name, cols, pk, ifNot }
    }
    if (this.kw('drop')) {
      this.needKw('table')
      let ifExists = false
      if (this.kw('if')) { this.needKw('exists'); ifExists = true }
      return { type: 'drop', name: this.ident(), ifExists }
    }
    if (this.kw('insert')) {
      this.needKw('into')
      const table = this.ident()
      let cols: string[] | undefined
      if (this.op('(')) { cols = []; do cols.push(this.ident()); while (this.op(',')); this.needOp(')') }
      if (this.isKw('select')) return { type: 'insert', table, cols, sel: this.select() }
      this.needKw('values')
      const values: Expr[][] = []
      do {
        this.needOp('(')
        const row: Expr[] = []
        do row.push(this.expr()); while (this.op(','))
        this.needOp(')')
        values.push(row)
      } while (this.op(','))
      return { type: 'insert', table, cols, values }
    }
    if (this.kw('update')) {
      const table = this.ident()
      this.needKw('set')
      const sets: [string, Expr][] = []
      do { const c = this.ident(); this.needOp('='); sets.push([c, this.expr()]) } while (this.op(','))
      return { type: 'update', table, sets, where: this.kw('where') ? this.expr() : undefined }
    }
    if (this.kw('delete')) {
      this.needKw('from')
      const table = this.ident()
      return { type: 'delete', table, where: this.kw('where') ? this.expr() : undefined }
    }
    return this.err('Unknown statement')
  }

  /** Skip a column constraint / table constraint up to the next top-level comma or ")". */
  skipDef() {
    let depth = 0
    while (this.peek.t !== 'eof') {
      if (this.isOp('(')) depth++
      else if (this.isOp(')')) { if (!depth) return; depth-- }
      else if (this.isOp(',') && !depth) return
      this.i++
    }
  }

  source(): Source {
    const table = this.ident()
    this.kw('as')
    const alias = this.peek.t === 'qid' || (this.peek.t === 'id' && !RESERVED.has(this.peek.v.toLowerCase())) ? this.ident() : table
    return { table, alias }
  }

  select(): Select {
    this.needKw('select')
    const s: Select = { type: 'select', distinct: this.kw('distinct'), items: [], joins: [], groupBy: [], orderBy: [] }
    if (!s.distinct) this.kw('all')
    do {
      const start = this.peek.p
      const expr = this.expr()
      const end = this.peek.p
      let alias: string | undefined
      if (this.kw('as')) alias = this.peek.t === 'str' ? this.toks[this.i++].v : this.ident()
      else if (this.peek.t === 'qid' || (this.peek.t === 'id' && !RESERVED.has(this.peek.v.toLowerCase()))) alias = this.ident()
      s.items.push({ expr, alias, text: this.src.slice(start, end).trim() })
    } while (this.op(','))
    if (this.kw('from')) {
      s.from = this.source()
      for (;;) {
        if (this.op(',')) { s.joins.push({ kind: 'cross', ...this.source() }); continue }
        let kind: Join['kind'] | null = null
        if (this.kw('left')) { this.kw('outer'); kind = 'left' }
        else if (this.kw('inner')) kind = 'inner'
        else if (this.kw('cross')) kind = 'cross'
        else if (this.isKw('join')) kind = 'inner'
        else if (this.isKw('right')) this.err('RIGHT JOIN is not supported — swap the tables and use LEFT JOIN')
        if (!kind) break
        this.needKw('join')
        const src = this.source()
        s.joins.push({ kind, ...src, on: kind !== 'cross' && this.kw('on') ? this.expr() : undefined })
      }
    }
    if (this.kw('where')) s.where = this.expr()
    if (this.kw('group')) { this.needKw('by'); do s.groupBy.push(this.expr()); while (this.op(',')) }
    if (this.kw('having')) s.having = this.expr()
    if (this.kw('order')) {
      this.needKw('by')
      do {
        const expr = this.expr()
        const desc = this.kw('desc')
        if (!desc) this.kw('asc')
        s.orderBy.push({ expr, desc })
      } while (this.op(','))
    }
    if (this.kw('limit')) {
      s.limit = this.expr()
      if (this.kw('offset')) s.offset = this.expr()
      else if (this.op(',')) { s.offset = s.limit; s.limit = this.expr() }
    }
    return s
  }

  expr(): Expr { return this.or() }
  or(): Expr { let a = this.and(); while (this.kw('or')) a = { k: 'bin', op: 'or', a, b: this.and() }; return a }
  and(): Expr { let a = this.not(); while (this.kw('and')) a = { k: 'bin', op: 'and', a, b: this.not() }; return a }
  not(): Expr {
    if (this.isKw('not') && !(this.toks[this.i + 1].t === 'id' && this.toks[this.i + 1].v.toLowerCase() === 'exists')) { this.i++; return { k: 'un', op: 'not', a: this.not() } }
    return this.cmp()
  }
  cmp(): Expr {
    let a = this.add()
    for (;;) {
      const t = this.peek
      if (t.t === 'op' && ['=', '==', '<>', '!=', '<', '<=', '>', '>='].includes(t.v)) {
        this.i++
        a = { k: 'bin', op: t.v === '==' ? '=' : t.v === '!=' ? '<>' : t.v, a, b: this.add() }
        continue
      }
      if (this.kw('is')) { const not = this.kw('not'); this.needKw('null'); a = { k: 'isnull', a, not }; continue }
      const save = this.i
      const not = this.kw('not')
      if (this.kw('in')) {
        this.needOp('(')
        if (this.isKw('select')) { const sub = this.select(); this.needOp(')'); a = { k: 'in', a, sub, not }; continue }
        const list: Expr[] = []
        if (!this.isOp(')')) do list.push(this.expr()); while (this.op(','))
        this.needOp(')')
        a = { k: 'in', a, list, not }
        continue
      }
      if (this.kw('between')) { const lo = this.add(); this.needKw('and'); a = { k: 'between', a, lo, hi: this.add(), not }; continue }
      if (this.kw('like')) { a = { k: 'like', a, pat: this.add(), not }; continue }
      if (not) this.i = save
      return a
    }
  }
  add(): Expr {
    let a = this.mul()
    while (this.isOp('+') || this.isOp('-')) { const op = this.toks[this.i++].v; a = { k: 'bin', op, a, b: this.mul() } }
    return a
  }
  mul(): Expr {
    let a = this.concat()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const op = this.toks[this.i++].v; a = { k: 'bin', op, a, b: this.concat() } }
    return a
  }
  concat(): Expr { let a = this.unary(); while (this.op('||')) a = { k: 'bin', op: '||', a, b: this.unary() }; return a }
  unary(): Expr {
    if (this.op('-')) return { k: 'un', op: '-', a: this.unary() }
    if (this.op('+')) return this.unary()
    return this.primary()
  }
  primary(): Expr {
    const t = this.peek
    if (t.t === 'num') { this.i++; return { k: 'lit', v: Number(t.v) } }
    if (t.t === 'str') { this.i++; return { k: 'lit', v: t.v } }
    if (this.op('*')) return { k: 'star' }
    if (this.op('(')) {
      if (this.isKw('select')) { const sel = this.select(); this.needOp(')'); return { k: 'sub', sel } }
      const e = this.expr()
      this.needOp(')')
      return e
    }
    if (t.t === 'id') {
      const kw = t.v.toLowerCase()
      if (kw === 'null') { this.i++; return { k: 'lit', v: null } }
      if (kw === 'true' || kw === 'false') { this.i++; return { k: 'lit', v: kw === 'true' ? 1 : 0 } }
      if (kw === 'not' || kw === 'exists') {
        const not = this.kw('not')
        this.needKw('exists')
        this.needOp('(')
        const sel = this.select()
        this.needOp(')')
        return { k: 'exists', sel, not }
      }
      if (kw === 'case') {
        this.i++
        const base = this.isKw('when') ? undefined : this.expr()
        const whens: [Expr, Expr][] = []
        while (this.kw('when')) { const w = this.expr(); this.needKw('then'); whens.push([w, this.expr()]) }
        const els = this.kw('else') ? this.expr() : undefined
        this.needKw('end')
        return { k: 'case', base, whens, els }
      }
      if (kw === 'cast' && this.toks[this.i + 1].v === '(') {
        this.i += 2
        const a = this.expr()
        this.needKw('as')
        const type = this.ident().toUpperCase()
        this.needOp(')')
        return { k: 'cast', a, type }
      }
    }
    if (t.t === 'id' && this.toks[this.i + 1].t === 'op' && this.toks[this.i + 1].v === '(') {
      this.i += 2
      const name = t.v.toLowerCase()
      if (this.op('*')) { this.needOp(')'); return { k: 'fn', name, args: [], star: true } }
      const distinct = this.kw('distinct')
      const args: Expr[] = []
      if (!this.isOp(')')) do args.push(this.expr()); while (this.op(','))
      this.needOp(')')
      return { k: 'fn', name, args, distinct }
    }
    if (t.t === 'id' || t.t === 'qid') {
      const name = this.ident()
      if (this.op('.')) {
        if (this.op('*')) return { k: 'star', table: name }
        return { k: 'col', table: name, name: this.ident() }
      }
      return { k: 'col', name }
    }
    return this.err('Unexpected token')
  }
}

export function parse(sql: string): Stmt[] {
  return new Parser(tokenize(sql), sql).statements()
}

// ---------- evaluation ----------

interface Src { alias: string; cols: string[]; names: string[]; row: Value[] | null; depth?: number }
interface Env { srcs: Src[]; out?: Map<string, Value> }

const isNum = (v: Value): v is number => typeof v === 'number'
const truthy = (v: Value) => v !== null && (isNum(v) ? v !== 0 : Number(v) !== 0 && v !== '')

export function compare(a: Value, b: Value): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1
  if (isNum(a) && isNum(b)) return a - b
  if (isNum(a)) return -1
  if (isNum(b)) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

function toNum(v: Value): number | null {
  if (v === null) return null
  if (isNum(v)) return v
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? n : 0
}

export function likeToRegex(p: string): RegExp {
  return new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'is')
}

const DAY = 86400000

/** Parses an SQLite-style time value plus modifiers ('+3 days', 'start of month', …) to epoch ms (UTC). */
export function sqlDate(args: Value[]): number | null {
  const [v, ...mods] = args
  if (v === null || v === undefined) return null
  let t: number
  if (typeof v === 'number') t = v > 1e6 && v < 4e6 ? (v - 2440587.5) * DAY : v * 1000
  else if (v.toLowerCase() === 'now') t = Date.now()
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?/.exec(v.trim())
    if (!m) return null
    t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) + Number(m[6] ?? 0) * 1000
  }
  for (const raw of mods) {
    if (raw === null) return null
    const mod = String(raw).trim().toLowerCase()
    const d = new Date(t)
    const am = /^([+-]?\d+(?:\.\d+)?)\s+(day|hour|minute|second|month|year)s?$/.exec(mod)
    if (am) {
      const k = Number(am[1])
      if (am[2] === 'month') d.setUTCMonth(d.getUTCMonth() + k)
      else if (am[2] === 'year') d.setUTCFullYear(d.getUTCFullYear() + k)
      else { t += k * { day: DAY, hour: 3600000, minute: 60000, second: 1000 }[am[2] as 'day']; continue }
      t = d.getTime()
    } else if (mod === 'start of month') t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    else if (mod === 'start of year') t = Date.UTC(d.getUTCFullYear(), 0, 1)
    else if (mod === 'start of day') t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    else if (/^weekday [0-6]$/.test(mod)) t += ((Number(mod.slice(8)) - d.getUTCDay() + 7) % 7) * DAY
    else return null
  }
  return Number.isFinite(t) ? t : null
}

/** SQLite strftime subset: %Y %m %d %H %M %S %j %w %W %s %f %%. */
export function strftime(f: string, t: number): string {
  const d = new Date(t)
  const p = (x: number, n = 2) => String(x).padStart(n, '0')
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
  const yday = Math.floor((t - jan1) / DAY)
  return f.replace(/%([YmdHMSjwWsf%])/g, (_, c: string) => {
    switch (c) {
      case 'Y': return String(d.getUTCFullYear())
      case 'm': return p(d.getUTCMonth() + 1)
      case 'd': return p(d.getUTCDate())
      case 'H': return p(d.getUTCHours())
      case 'M': return p(d.getUTCMinutes())
      case 'S': return p(d.getUTCSeconds())
      case 'f': return `${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`
      case 'j': return p(yday + 1, 3)
      case 'w': return String(d.getUTCDay())
      case 'W': return p(Math.floor((yday + 7 - ((d.getUTCDay() + 6) % 7)) / 7))
      case 's': return String(Math.floor(t / 1000))
      default: return '%'
    }
  })
}

function affinity(type: string, v: Value): Value {
  if (v === null) return null
  const t = type.toUpperCase()
  if (/INT|REAL|FLOA|DOUB|NUM|DEC/.test(t)) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
    if (isNum(n) && Number.isFinite(n)) return /INT/.test(t) && Number.isInteger(n) ? n : n
    return v
  }
  if (/CHAR|TEXT|CLOB|DATE|TIME/.test(t)) return String(v)
  return v
}

class Engine {
  db: Db
  constructor(db: Db) {
    this.db = db
  }

  table(name: string): Table {
    const t = this.db.tables[name.toLowerCase()]
    if (!t) throw new SqlError(`No such table: ${name}`)
    return t
  }

  col(e: { table?: string; name: string }, env: Env): Value {
    const n = e.name.toLowerCase()
    if (!e.table && env.out?.has(n)) return env.out.get(n)!
    let hit: Value | undefined
    let found = 0
    let depth = Infinity // inner query sources shadow outer ones
    for (const s of env.srcs) {
      if (e.table && s.alias.toLowerCase() !== e.table.toLowerCase()) continue
      const j = s.cols.indexOf(n)
      const d = s.depth ?? 0
      if (j >= 0 && d <= depth) {
        found = d < depth ? 1 : found + 1
        depth = d
        hit = s.row ? s.row[j] : null
      }
    }
    if (found > 1) throw new SqlError(`Ambiguous column name: ${e.name}`)
    if (!found) throw new SqlError(`No such column: ${e.table ? e.table + '.' : ''}${e.name}`)
    return hit ?? null
  }

  eval(e: Expr, env: Env, grp?: Env[]): Value {
    switch (e.k) {
      case 'lit': return e.v
      case 'col': return this.col(e, env)
      case 'star': throw new SqlError('* is only allowed in the select list or COUNT(*)')
      case 'un': {
        const a = this.eval(e.a, env, grp)
        if (e.op === 'not') return a === null ? null : truthy(a) ? 0 : 1
        const n = toNum(a)
        return n === null ? null : -n
      }
      case 'bin': {
        if (e.op === 'and' || e.op === 'or') {
          const a = this.eval(e.a, env, grp)
          if (e.op === 'and' && a !== null && !truthy(a)) return 0
          if (e.op === 'or' && a !== null && truthy(a)) return 1
          const b = this.eval(e.b, env, grp)
          if (e.op === 'and') return b !== null && !truthy(b) ? 0 : a === null || b === null ? null : 1
          return b !== null && truthy(b) ? 1 : a === null || b === null ? null : 0
        }
        const a = this.eval(e.a, env, grp), b = this.eval(e.b, env, grp)
        if (a === null || b === null) return null
        if (e.op === '||') return String(a) + String(b)
        if (['=', '<>', '<', '<=', '>', '>='].includes(e.op)) {
          // numeric strings compare with numbers numerically (column affinity in practice)
          const [x, y] = isNum(a) && typeof b === 'string' && b.trim() !== '' && Number.isFinite(Number(b)) ? [a, Number(b)] : isNum(b) && typeof a === 'string' && a.trim() !== '' && Number.isFinite(Number(a)) ? [Number(a), b] : [a, b]
          const c = compare(x, y)
          return Number(e.op === '=' ? c === 0 : e.op === '<>' ? c !== 0 : e.op === '<' ? c < 0 : e.op === '<=' ? c <= 0 : e.op === '>' ? c > 0 : c >= 0)
        }
        const x = toNum(a)!, y = toNum(b)!
        if (e.op === '+') return x + y
        if (e.op === '-') return x - y
        if (e.op === '*') return x * y
        if (y === 0) return null
        if (e.op === '/') return x / y // always real division (no integer typing of values)
        return x % y
      }
      case 'isnull': { const a = this.eval(e.a, env, grp); return Number((a === null) !== e.not) }
      case 'between': {
        const a = this.eval(e.a, env, grp), lo = this.eval(e.lo, env, grp), hi = this.eval(e.hi, env, grp)
        if (a === null || lo === null || hi === null) return null
        return Number((compare(a, lo) >= 0 && compare(a, hi) <= 0) !== e.not)
      }
      case 'like': {
        const a = this.eval(e.a, env, grp), p = this.eval(e.pat, env, grp)
        if (a === null || p === null) return null
        return Number(likeToRegex(String(p)).test(String(a)) !== e.not)
      }
      case 'in': {
        const a = this.eval(e.a, env, grp)
        if (a === null) return null
        const vals = e.sub ? this.select(e.sub, env).rows.map((r) => r[0]) : e.list!.map((x) => this.eval(x, env, grp))
        const hit = vals.some((v) => v !== null && compare(isNum(a) && typeof v === 'string' ? Number(v) : v, a) === 0)
        if (!hit && vals.includes(null)) return null
        return Number(hit !== e.not)
      }
      case 'case': {
        const base = e.base ? this.eval(e.base, env, grp) : undefined
        for (const [w, t] of e.whens) {
          const v = this.eval(w, env, grp)
          if (e.base ? base !== null && v !== null && compare(base!, v) === 0 : truthy(v)) return this.eval(t, env, grp)
        }
        return e.els ? this.eval(e.els, env, grp) : null
      }
      case 'cast': {
        const a = this.eval(e.a, env, grp)
        if (a === null) return null
        if (/INT/.test(e.type)) return Math.trunc(toNum(a) ?? 0)
        if (/REAL|FLOA|DOUB|NUM|DEC/.test(e.type)) return toNum(a)
        return String(a)
      }
      case 'sub': { const r = this.select(e.sel, env); return r.rows[0]?.[0] ?? null }
      case 'exists': return Number((this.select(e.sel, env).rows.length > 0) !== e.not)
      case 'fn': return isAgg(e) ? this.agg(e, grp) : this.scalar(e, env, grp)
    }
  }

  agg(e: Extract<Expr, { k: 'fn' }>, grp?: Env[]): Value {
    if (!grp) throw new SqlError(`Misuse of aggregate function ${e.name.toUpperCase()}()`)
    if (e.star) return grp.length
    let vals = grp.map((g) => this.eval(e.args[0], g)).filter((v) => v !== null) as (string | number)[]
    if (e.distinct) vals = [...new Map(vals.map((v) => [typeof v + ':' + v, v])).values()]
    switch (e.name) {
      case 'count': return vals.length
      case 'sum': return vals.length ? vals.reduce<number>((a, v) => a + (toNum(v) ?? 0), 0) : null
      case 'total': return vals.reduce<number>((a, v) => a + (toNum(v) ?? 0), 0)
      case 'avg': return vals.length ? vals.reduce<number>((a, v) => a + (toNum(v) ?? 0), 0) / vals.length : null
      case 'min': return vals.length ? vals.reduce((a, v) => (compare(v, a) < 0 ? v : a)) : null
      case 'max': return vals.length ? vals.reduce((a, v) => (compare(v, a) > 0 ? v : a)) : null
      default: {
        const sep = e.args[1] ? String(this.eval(e.args[1], grp[0] ?? { srcs: [] }) ?? ',') : ','
        return vals.length ? vals.join(sep) : null
      }
    }
  }

  scalar(e: Extract<Expr, { k: 'fn' }>, env: Env, grp?: Env[]): Value {
    const a = e.args.map((x) => this.eval(x, env, grp))
    const s = (i: number) => (a[i] === null ? null : String(a[i]))
    const n = (i: number) => toNum(a[i] ?? null)
    switch (e.name) {
      case 'upper': return s(0)?.toUpperCase() ?? null
      case 'lower': return s(0)?.toLowerCase() ?? null
      case 'length': return s(0)?.length ?? null
      case 'trim': return s(0)?.trim() ?? null
      case 'abs': return n(0) === null ? null : Math.abs(n(0)!)
      case 'round': { const x = n(0), d = n(1) ?? 0; return x === null ? null : Math.round(x * 10 ** d) / 10 ** d }
      case 'floor': return n(0) === null ? null : Math.floor(n(0)!)
      case 'ceil': case 'ceiling': return n(0) === null ? null : Math.ceil(n(0)!)
      case 'coalesce': case 'ifnull': return a.find((v) => v !== null) ?? null
      case 'nullif': return a[0] !== null && a[1] !== null && compare(a[0], a[1]) === 0 ? null : a[0]
      case 'substr': case 'substring': {
        const str = s(0)
        if (str === null) return null
        const st = n(1) ?? 1
        const from = st > 0 ? st - 1 : Math.max(0, str.length + st)
        return a.length > 2 ? str.substr(from, n(2) ?? 0) : str.slice(from)
      }
      case 'replace': return s(0) === null ? null : s(0)!.split(s(1) ?? '').join(s(2) ?? '')
      case 'instr': return s(0) === null ? null : s(0)!.indexOf(s(1) ?? '') + 1
      case 'typeof': return a[0] === null ? 'null' : isNum(a[0]) ? (Number.isInteger(a[0]) ? 'integer' : 'real') : 'text'
      case 'min': case 'max': {
        const vs = a.filter((v) => v !== null) as (string | number)[]
        if (vs.length < a.length) return null
        return vs.reduce((p, v) => ((e.name === 'min' ? compare(v, p) < 0 : compare(v, p) > 0) ? v : p))
      }
      case 'iif': return truthy(a[0] ?? null) ? a[1] : a[2] ?? null
      case 'ltrim': return s(0)?.replace(/^\s+/, '') ?? null
      case 'rtrim': return s(0)?.replace(/\s+$/, '') ?? null
      case 'sqrt': return n(0) === null || n(0)! < 0 ? null : Math.sqrt(n(0)!)
      case 'power': case 'pow': return n(0) === null || n(1) === null ? null : n(0)! ** n(1)!
      case 'sign': return n(0) === null ? null : Math.sign(n(0)!)
      case 'date': case 'datetime': case 'julianday': case 'strftime': {
        const fmtArg = e.name === 'strftime' ? s(0) : null
        const rest = e.name === 'strftime' ? a.slice(1) : a
        const d = sqlDate(rest)
        if (d === null) return null
        if (e.name === 'julianday') return d / 86400000 + 2440587.5
        const iso = new Date(d).toISOString()
        if (e.name === 'date') return iso.slice(0, 10)
        if (e.name === 'datetime') return iso.slice(0, 19).replace('T', ' ')
        return fmtArg === null ? null : strftime(fmtArg, d)
      }
      default: throw new SqlError(`No such function: ${e.name.toUpperCase()}`)
    }
  }

  hasAgg(e: Expr | undefined): boolean {
    if (!e) return false
    switch (e.k) {
      case 'fn': return isAgg(e) || e.args.some((x) => this.hasAgg(x))
      case 'bin': return this.hasAgg(e.a) || this.hasAgg(e.b)
      case 'un': case 'isnull': case 'cast': return this.hasAgg(e.a)
      case 'between': return this.hasAgg(e.a) || this.hasAgg(e.lo) || this.hasAgg(e.hi)
      case 'like': return this.hasAgg(e.a) || this.hasAgg(e.pat)
      case 'in': return this.hasAgg(e.a) || !!e.list?.some((x) => this.hasAgg(x))
      case 'case': return this.hasAgg(e.base) || this.hasAgg(e.els) || e.whens.some(([w, t]) => this.hasAgg(w) || this.hasAgg(t))
      default: return false
    }
  }

  srcOf(t: Table, alias: string): Src {
    return { alias, cols: t.cols.map((c) => c.name.toLowerCase()), names: t.cols.map((c) => c.name), row: null }
  }

  select(s: Select, outer?: Env): Result {
    // FROM + JOINs → list of environments
    let envs: Env[]
    const outerSrcs = (outer?.srcs ?? []).map((x) => ({ ...x, depth: (x.depth ?? 0) + 1 }))
    if (!s.from) envs = [{ srcs: [...outerSrcs] }]
    else {
      const t = this.table(s.from.table)
      const base = this.srcOf(t, s.from.alias)
      envs = t.rows.map((row) => ({ srcs: [{ ...base, row }, ...outerSrcs] }))
      for (const j of s.joins) {
        const jt = this.table(j.table)
        const js = this.srcOf(jt, j.alias)
        const next: Env[] = []
        for (const env of envs) {
          let matched = false
          for (const row of jt.rows) {
            const cand: Env = { srcs: [...env.srcs.slice(0, env.srcs.length - outerSrcs.length), { ...js, row }, ...outerSrcs] }
            if (!j.on || truthy(this.eval(j.on, cand))) {
              next.push(cand)
              matched = true
            }
          }
          if (!matched && j.kind === 'left') next.push({ srcs: [...env.srcs.slice(0, env.srcs.length - outerSrcs.length), { ...js, row: null }, ...outerSrcs] })
        }
        envs = next
      }
    }
    if (s.where) envs = envs.filter((env) => truthy(this.eval(s.where!, env)))

    // projection list (expand *)
    const nullEnv: Env = envs[0] ?? { srcs: s.from ? [this.srcOf(this.table(s.from.table), s.from.alias), ...s.joins.map((j) => this.srcOf(this.table(j.table), j.alias)), ...outerSrcs] : [...outerSrcs] }
    const cols: { name: string; expr: Expr }[] = []
    for (const it of s.items) {
      if (it.expr.k === 'star') {
        const st = it.expr.table?.toLowerCase()
        const srcs = nullEnv.srcs.slice(0, nullEnv.srcs.length - outerSrcs.length).filter((x) => !st || x.alias.toLowerCase() === st)
        if (st && !srcs.length) throw new SqlError(`No such table: ${it.expr.table}`)
        for (const src of srcs) src.names.forEach((nm) => cols.push({ name: nm, expr: { k: 'col', table: src.alias, name: nm } }))
      } else cols.push({ name: it.alias ?? (it.expr.k === 'col' ? it.expr.name : it.text), expr: it.expr })
    }

    // GROUP BY may name an output alias (SQLite extension)
    const srcCols = new Set(nullEnv.srcs.flatMap((x) => x.cols))
    const groupBy = s.groupBy.map((g) => {
      if (g.k !== 'col' || g.table || srcCols.has(g.name.toLowerCase())) return g
      return s.items.find((it) => it.alias?.toLowerCase() === g.name.toLowerCase())?.expr ?? g
    })
    const grouped = s.groupBy.length > 0 || s.items.some((it) => this.hasAgg(it.expr)) || this.hasAgg(s.having)
    type Out = { vals: Value[]; env: Env; grp?: Env[] }
    let outs: Out[] = []
    if (grouped) {
      const groups = new Map<string, Env[]>()
      for (const env of envs) {
        const key = JSON.stringify(groupBy.map((g) => this.eval(g, env)))
        const arr = groups.get(key)
        if (arr) arr.push(env)
        else groups.set(key, [env])
      }
      if (!s.groupBy.length && !groups.size) groups.set('[]', [])
      for (const grp of groups.values()) {
        const env = grp[0] ?? nullEnv
        const vals = cols.map((c) => this.eval(c.expr, env, grp))
        if (s.having) {
          // HAVING may use output aliases (SQLite extension)
          const out = new Map<string, Value>()
          cols.forEach((c, i) => { if (!srcCols.has(c.name.toLowerCase())) out.set(c.name.toLowerCase(), vals[i]) })
          if (!truthy(this.eval(s.having, { ...env, out }, grp))) continue
        }
        outs.push({ vals, env, grp })
      }
    } else outs = envs.map((env) => ({ vals: cols.map((c) => this.eval(c.expr, env)), env }))

    if (s.distinct) {
      const seen = new Set<string>()
      outs = outs.filter((o) => {
        const k = JSON.stringify(o.vals)
        return seen.has(k) ? false : (seen.add(k), true)
      })
    }
    if (s.orderBy.length) {
      const keyed = outs.map((o) => {
        const out = new Map<string, Value>()
        cols.forEach((c, i) => out.set(c.name.toLowerCase(), o.vals[i]))
        return {
          o,
          keys: s.orderBy.map(({ expr }) => {
            if (expr.k === 'lit' && isNum(expr.v)) {
              if (expr.v < 1 || expr.v > cols.length) throw new SqlError(`ORDER BY term out of range: ${expr.v}`)
              return o.vals[expr.v - 1]
            }
            return this.eval(expr, { ...o.env, out }, o.grp)
          }),
        }
      })
      keyed.sort((x, y) => {
        for (let i = 0; i < s.orderBy.length; i++) {
          const c = compare(x.keys[i], y.keys[i])
          if (c) return s.orderBy[i].desc ? -c : c
        }
        return 0
      })
      outs = keyed.map((k) => k.o)
    }
    const off = s.offset ? Math.max(0, toNum(this.eval(s.offset, { srcs: [] })) ?? 0) : 0
    const lim = s.limit ? toNum(this.eval(s.limit, { srcs: [] })) ?? -1 : -1
    outs = outs.slice(off, lim >= 0 ? off + lim : undefined)
    return { columns: cols.map((c) => c.name), rows: outs.map((o) => o.vals) }
  }

  run(st: Stmt): Result {
    const msg = (message: string): Result => ({ columns: [], rows: [], message })
    switch (st.type) {
      case 'select': return this.select(st)
      case 'create': {
        const key = st.name.toLowerCase()
        if (this.db.tables[key]) {
          if (st.ifNot) return msg(`Table ${st.name} already exists — skipped`)
          throw new SqlError(`Table ${st.name} already exists`)
        }
        if (st.as) {
          const r = this.select(st.as)
          const types = r.columns.map((_, i) => (r.rows.length && r.rows.every((row) => row[i] === null || isNum(row[i])) ? 'REAL' : 'TEXT'))
          this.db.tables[key] = { name: st.name, cols: r.columns.map((n, i) => ({ name: n, type: types[i] })), rows: r.rows }
          return msg(`Created table ${st.name} with ${r.rows.length} row${r.rows.length === 1 ? '' : 's'}`)
        }
        this.db.tables[key] = { name: st.name, cols: st.cols, rows: [], pk: st.pk }
        return msg(`Created table ${st.name} (${st.cols.length} columns)`)
      }
      case 'drop': {
        const key = st.name.toLowerCase()
        if (!this.db.tables[key]) {
          if (st.ifExists) return msg(`Table ${st.name} does not exist — skipped`)
          throw new SqlError(`No such table: ${st.name}`)
        }
        delete this.db.tables[key]
        return msg(`Dropped table ${st.name}`)
      }
      case 'insert': {
        const t = this.table(st.table)
        const idx = st.cols ? st.cols.map((c) => { const j = t.cols.findIndex((x) => x.name.toLowerCase() === c.toLowerCase()); if (j < 0) throw new SqlError(`Table ${t.name} has no column ${c}`); return j }) : t.cols.map((_, j) => j)
        const src = st.sel ? this.select(st.sel).rows : st.values!.map((r) => r.map((e) => this.eval(e, { srcs: [] })))
        const added: Value[][] = []
        for (const r of src) {
          if (r.length !== idx.length) throw new SqlError(`${idx.length} values expected, ${r.length} given`)
          const row: Value[] = t.cols.map(() => null)
          idx.forEach((j, i) => (row[j] = affinity(t.cols[j].type, r[i])))
          if (t.pk !== undefined) {
            if (row[t.pk] === null && /INT/.test(t.cols[t.pk].type)) row[t.pk] = Math.max(0, ...[...t.rows, ...added].map((x) => toNum(x[t.pk!]) ?? 0)) + 1
            if ([...t.rows, ...added].some((x) => x[t.pk!] !== null && compare(x[t.pk!], row[t.pk!]) === 0)) throw new SqlError(`UNIQUE constraint failed: ${t.name}.${t.cols[t.pk].name}`)
          }
          added.push(row)
        }
        t.rows.push(...added)
        return msg(`Inserted ${added.length} row${added.length === 1 ? '' : 's'} into ${t.name}`)
      }
      case 'update': {
        const t = this.table(st.table)
        const src = this.srcOf(t, t.name)
        const sets = st.sets.map(([c, e]) => { const j = src.cols.indexOf(c.toLowerCase()); if (j < 0) throw new SqlError(`No such column: ${c}`); return [j, e] as const })
        let n = 0
        t.rows = t.rows.map((row) => {
          const env = { srcs: [{ ...src, row }] }
          if (st.where && !truthy(this.eval(st.where, env))) return row
          n++
          const next = [...row]
          for (const [j, e] of sets) next[j] = affinity(t.cols[j].type, this.eval(e, env))
          return next
        })
        return msg(`Updated ${n} row${n === 1 ? '' : 's'} in ${t.name}`)
      }
      case 'delete': {
        const t = this.table(st.table)
        const src = this.srcOf(t, t.name)
        const before = t.rows.length
        t.rows = st.where ? t.rows.filter((row) => !truthy(this.eval(st.where!, { srcs: [{ ...src, row }] }))) : []
        return msg(`Deleted ${before - t.rows.length} row${before - t.rows.length === 1 ? '' : 's'} from ${t.name}`)
      }
    }
  }
}

/** Runs all statements on a deep copy of `db`; returns the new database and one result per statement. */
export function execute(db: Db, sql: string): { db: Db; results: Result[] } {
  const copy: Db = { tables: Object.fromEntries(Object.entries(db.tables).map(([k, t]) => [k, { ...t, cols: t.cols.map((c) => ({ ...c })), rows: t.rows.map((r) => [...r]) }])) }
  const eng = new Engine(copy)
  const results: Result[] = []
  for (const st of parse(sql)) {
    const t0 = performance.now()
    const r = eng.run(st)
    results.push({ ...r, ms: performance.now() - t0 })
  }
  return { db: copy, results }
}

/** Builds a table from CSV rows (first row = header), inferring INTEGER / REAL / TEXT per column. */
export function tableFromCsv(name: string, rows: string[][]): Table {
  const [head = [], ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const used = new Set<string>()
  const names = head.map((h, i) => {
    let n = h.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || `col${i + 1}`
    if (/^\d/.test(n)) n = 'c_' + n
    while (used.has(n.toLowerCase())) n += '_'
    used.add(n.toLowerCase())
    return n
  })
  const types = names.map((_, j) => {
    const vals = body.map((r) => (r[j] ?? '').trim()).filter((v) => v !== '')
    if (vals.length && vals.every((v) => /^-?\d+$/.test(v))) return 'INTEGER'
    if (vals.length && vals.every((v) => v !== '' && Number.isFinite(Number(v)))) return 'REAL'
    return 'TEXT'
  })
  return {
    name,
    cols: names.map((n, j) => ({ name: n, type: types[j] })),
    rows: body.map((r) => names.map((_, j) => {
      const v = (r[j] ?? '').trim()
      return v === '' ? null : types[j] === 'TEXT' ? v : Number(v)
    })),
  }
}

/** Sample shop database as SQL. */
export const SAMPLE_SQL = `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, country TEXT, joined DATE);
INSERT INTO customers VALUES
 (1,'Ava Thompson','London','UK','2024-01-14'),(2,'Lucas Meyer','Berlin','Germany','2024-02-03'),
 (3,'Sofia Rossi','Milan','Italy','2024-03-22'),(4,'Noah Kowalski','Warsaw','Poland','2024-04-09'),
 (5,'Emma Dubois','Paris','France','2024-05-30'),(6,'Liam O''Brien','Dublin','Ireland','2024-06-17'),
 (7,'Mia Jansen','Amsterdam','Netherlands','2024-08-05'),(8,'Oliver Smith','Manchester','UK','2024-09-12'),
 (9,'Olena Shevchenko','Kyiv','Ukraine','2024-10-01'),(10,'Hugo García','Madrid','Spain','2025-01-20');
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);
INSERT INTO products VALUES
 (1,'Mechanical keyboard','Accessories',89.0),(2,'Wireless mouse','Accessories',35.5),(3,'27" monitor','Displays',249.0),
 (4,'USB-C hub','Accessories',42.0),(5,'Laptop stand','Furniture',59.9),(6,'Desk lamp','Furniture',38.0),
 (7,'Noise-cancelling headphones','Audio',199.0),(8,'Webcam 1080p','Video',69.0),(9,'34" ultrawide','Displays',429.0),(10,'Standing desk','Furniture',499.0);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, order_date DATE, status TEXT);
INSERT INTO orders VALUES
 (101,1,'2025-01-05','shipped'),(102,2,'2025-01-11','shipped'),(103,3,'2025-01-19','cancelled'),(104,1,'2025-02-02','shipped'),
 (105,5,'2025-02-14','shipped'),(106,6,'2025-02-21','pending'),(107,7,'2025-03-03','shipped'),(108,2,'2025-03-09','shipped'),
 (109,8,'2025-03-15','shipped'),(110,9,'2025-03-28','pending'),(111,4,'2025-04-02','shipped'),(112,1,'2025-04-11','shipped');
CREATE TABLE order_items (order_id INTEGER, product_id INTEGER, qty INTEGER);
INSERT INTO order_items VALUES
 (101,1,1),(101,2,1),(102,3,2),(103,7,1),(104,5,1),(104,6,2),(105,9,1),(106,4,3),(107,7,1),(107,8,1),
 (108,10,1),(109,2,2),(109,4,1),(110,3,1),(111,1,1),(111,7,1),(112,9,1),(112,5,1);`

export const sampleDb = (): Db => execute({ tables: {} }, SAMPLE_SQL).db
