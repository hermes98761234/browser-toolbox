// Log parsing: format presets (regex with named groups), timestamps, level normalisation,
// message templates and time bucketing for the histogram.

export type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'OTHER'
export const LEVELS: Level[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OTHER']
export const LEVEL_COLOR: Record<Level, string> = { ERROR: '#ef4444', WARN: '#f59e0b', INFO: '#0ea5e9', DEBUG: '#64748b', OTHER: '#a855f7' }

export interface Entry {
  ts: number | null
  level: Level
  msg: string
  fields: Record<string, string>
  line: string
  extra: number // continuation lines (stack traces) folded into this entry
}

export interface Format {
  id: string
  name: string
  re?: RegExp
  json?: boolean
}

export const FORMATS: Format[] = [
  { id: 'app', name: 'App log (ISO time, level, message)', re: /^\[?(?<time>\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?)\]?\s+\[?(?<level>[A-Za-z]{3,8})\]?\s*(?:\[(?<thread>[^\]]+)\]\s*)?(?<msg>.*)$/ },
  { id: 'access', name: 'Apache / Nginx access log', re: /^(?<ip>\S+) \S+ (?<user>\S+) \[(?<time>[^\]]+)\] "(?<method>[A-Z]+) (?<path>\S+)[^"]*" (?<status>\d{3}) (?<bytes>\S+)(?: "(?<referer>[^"]*)" "(?<agent>[^"]*)")?/ },
  { id: 'syslog', name: 'Syslog (RFC 3164)', re: /^(?<time>[A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d) (?<host>\S+) (?<proc>[^:[\s]+)(?:\[(?<pid>\d+)\])?: (?<msg>.*)$/ },
  { id: 'json', name: 'JSON lines', json: true },
]

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Parses ISO, Apache CLF, syslog and epoch timestamps to ms since epoch (UTC unless an offset is given). */
export function parseTime(s: string | number | undefined, year = new Date().getUTCFullYear()): number | null {
  if (s === undefined || s === '') return null
  if (typeof s === 'number' || /^\d{10}(\.\d+)?$|^\d{13}$/.test(s)) {
    const n = Number(s)
    return n < 1e12 ? n * 1000 : n
  }
  let m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)(?:[.,](\d+))?\s*(Z|[+-]\d\d:?\d\d)?$/.exec(s.trim())
  if (m) {
    const ms = m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms)
    return t - offsetMs(m[8])
  }
  m = /^(\d\d)\/([A-Za-z]{3})\/(\d{4}):(\d\d):(\d\d):(\d\d)(?:\s*([+-]\d{4}))?$/.exec(s.trim())
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase())
    if (mon < 0) return null
    return Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - offsetMs(m[7])
  }
  m = /^([A-Za-z]{3})\s+(\d{1,2}) (\d\d):(\d\d):(\d\d)$/.exec(s.trim())
  if (m) {
    const mon = MONTHS.indexOf(m[1].toLowerCase())
    if (mon < 0) return null
    return Date.UTC(year, mon, +m[2], +m[3], +m[4], +m[5])
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function offsetMs(z: string | undefined): number {
  if (!z || z === 'Z') return 0
  const m = /^([+-])(\d\d):?(\d\d)$/.exec(z)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000
}

export function normLevel(raw: string | undefined, msg = ''): Level {
  const l = (raw ?? '').toUpperCase()
  if (/^(ERR|ERROR|FATAL|CRIT|CRITICAL|SEVERE|EMERG|ALERT|PANIC)/.test(l)) return 'ERROR'
  if (/^WARN/.test(l)) return 'WARN'
  if (/^(INFO|NOTICE|INF)/.test(l)) return 'INFO'
  if (/^(DEBUG|DBG|TRACE|VERBOSE|FINE)/.test(l)) return 'DEBUG'
  if (l) return 'OTHER'
  if (/\b(error|exception|fail(ed|ure)?|fatal|panic|segfault|denied)\b/i.test(msg)) return 'ERROR'
  if (/\b(warn(ing)?|deprecated|retry(ing)?|timeout|slow)\b/i.test(msg)) return 'WARN'
  return 'INFO'
}

/** HTTP status → level for access logs. */
export const statusLevel = (st: number): Level => (st >= 500 ? 'ERROR' : st >= 400 ? 'WARN' : 'INFO')

/** Builds a Format from a user regex; returns an error message when it is invalid. */
export function customFormat(src: string): Format | string {
  try {
    const re = new RegExp(src)
    if (!/\(\?<\w+>/.test(src)) return 'Use named groups, e.g. (?<time>…) (?<level>…) (?<msg>…)'
    return { id: 'custom', name: 'Custom regex', re }
  } catch (e) {
    return (e as Error).message
  }
}

export function parseLine(line: string, f: Format, year?: number): Entry | null {
  if (f.json) {
    if (!line.startsWith('{')) return null
    try {
      const o = JSON.parse(line) as Record<string, unknown>
      const fields: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) fields[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
      const time = o.time ?? o.timestamp ?? o.ts ?? o['@timestamp'] ?? o.date
      const msg = String(o.msg ?? o.message ?? o.text ?? o.event ?? '')
      return { ts: parseTime(time as string | number | undefined, year), level: normLevel(String(o.level ?? o.severity ?? o.lvl ?? o.loglevel ?? ''), msg), msg, fields, line, extra: 0 }
    } catch {
      return null
    }
  }
  const m = f.re?.exec(line)
  if (!m) return null
  const g: Record<string, string> = {}
  for (const [k, v] of Object.entries(m.groups ?? {})) if (v !== undefined) g[k] = v
  if (g.status) {
    const msg = `${g.method ?? ''} ${g.path ?? ''} → ${g.status}`.trim()
    return { ts: parseTime(g.time, year), level: statusLevel(+g.status), msg, fields: g, line, extra: 0 }
  }
  const msg = g.msg ?? g.message ?? line
  return { ts: parseTime(g.time, year), level: normLevel(g.level, msg), msg, fields: g, line, extra: 0 }
}

/** Picks the preset that parses most of the sample lines. */
export function detectFormat(lines: string[]): Format {
  const sample = lines.filter((l) => l.trim()).slice(0, 200)
  let best = FORMATS[0], score = -1
  for (const f of FORMATS) {
    const n = sample.filter((l) => parseLine(l, f)).length
    if (n > score) { best = f; score = n }
  }
  return best
}

/** Collapses variable parts so similar messages group together. */
export function template(msg: string): string {
  return msg
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/g, '<ip>')
    .replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/(\/[\w.-]+)+\/?/g, (p) => (p.split('/').length > 3 ? '<path>' : p))
    .replace(/"[^"]{20,}"/g, '"…"')
    .replace(/\b\d+(\.\d+)?(ms|s|kb|mb|%)?\b/gi, '<n>')
    .slice(0, 160)
}

const IVL = [1, 5, 15, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400, 604800].map((s) => s * 1000)

/** Smallest "nice" bucket width that yields at most `max` buckets over [t0, t1]. */
export function bucketWidth(t0: number, t1: number, max = 60): number {
  for (const w of IVL) if ((t1 - t0) / w <= max) return w
  return Math.ceil((t1 - t0) / max / 86400000) * 86400000
}

export interface Bucket { t: number; counts: number[] }

export function histogram(entries: { ts: number | null; level: Level }[], max = 60): { width: number; buckets: Bucket[] } {
  let t0 = Infinity, t1 = -Infinity
  for (const e of entries) if (e.ts !== null) { if (e.ts < t0) t0 = e.ts; if (e.ts > t1) t1 = e.ts }
  if (!Number.isFinite(t0)) return { width: 0, buckets: [] }
  const width = bucketWidth(t0, t1 + 1, max)
  const start = Math.floor(t0 / width) * width
  const n = Math.floor((t1 - start) / width) + 1
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({ t: start + i * width, counts: LEVELS.map(() => 0) }))
  for (const e of entries) if (e.ts !== null) buckets[Math.floor((e.ts - start) / width)].counts[LEVELS.indexOf(e.level)]++
  return { width, buckets }
}

/** Splits a stream of text chunks into lines, keeping the trailing partial line. */
export function lineSplitter(onLine: (l: string) => void) {
  let rest = ''
  return {
    push(chunk: string) {
      const parts = (rest + chunk).split(/\r?\n/)
      rest = parts.pop() ?? ''
      for (const p of parts) onLine(p)
    },
    end() {
      if (rest) onLine(rest)
      rest = ''
    },
  }
}

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Deterministic demo logs: a day of app logs with an incident, or an nginx access log. */
export function sampleLog(kind: 'app' | 'access' = 'app'): string {
  const r = rng(42)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const base = Date.UTC(2026, 9, 16, 0, 0, 0)
  const out: string[] = []
  const iso = (t: number) => new Date(t).toISOString().replace('T', ' ').replace('Z', '')
  const clf = (t: number) => {
    const d = new Date(t)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getUTCDate())}/${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`
  }
  let t = base
  const ips = ['203.0.113.7', '198.51.100.23', '192.0.2.44', '203.0.113.90', '198.51.100.4', '10.0.4.18']
  const paths = ['/', '/api/orders', '/api/users/42', '/api/cart', '/static/app.js', '/static/style.css', '/login', '/api/search?q=shoes', '/health']
  while (t < base + 86400000) {
    const hour = (t - base) / 3600000
    const busy = 0.4 + Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.35 + 0.35
    t += Math.round((8000 + r() * 40000) / busy)
    const incident = hour > 14.2 && hour < 15.1
    if (kind === 'access') {
      const p = pick(paths)
      const st = incident && p.startsWith('/api') && r() < 0.6 ? pick([500, 502, 503, 504]) : r() < 0.04 ? 404 : r() < 0.02 ? 401 : p === '/login' && r() < 0.3 ? 302 : 200
      out.push(`${pick(ips)} - - [${clf(t)}] "${p === '/login' && r() < 0.5 ? 'POST' : 'GET'} ${p} HTTP/1.1" ${st} ${Math.round(200 + r() * 9000)} "-" "Mozilla/5.0"`)
      continue
    }
    const thr = pick(['main', 'http-1', 'http-2', 'worker-3', 'scheduler'])
    const x = r()
    if (incident && x < 0.55) {
      out.push(`${iso(t)} ERROR [${thr}] Database connection to 10.0.2.5:5432 failed: timeout after ${Math.round(3000 + r() * 2000)}ms`)
      if (r() < 0.3) out.push('    at db.Pool.acquire (pool.js:118)', '    at OrderService.save (orders.js:64)')
    } else if (x < 0.03) out.push(`${iso(t)} ERROR [${thr}] Payment gateway returned HTTP 502 for order ${Math.floor(r() * 90000 + 10000)}`)
    else if (x < 0.1) out.push(`${iso(t)} WARN  [${thr}] Slow query took ${Math.round(800 + r() * 3000)}ms: SELECT * FROM orders WHERE user_id = ${Math.floor(r() * 5000)}`)
    else if (x < 0.14) out.push(`${iso(t)} WARN  [${thr}] Retrying request to inventory service (attempt ${1 + Math.floor(r() * 3)})`)
    else if (x < 0.32) out.push(`${iso(t)} DEBUG [${thr}] Cache hit for key user:${Math.floor(r() * 5000)}`)
    else if (x < 0.62) out.push(`${iso(t)} INFO  [${thr}] GET ${pick(paths)} 200 in ${Math.round(5 + r() * 200)}ms`)
    else if (x < 0.82) out.push(`${iso(t)} INFO  [${thr}] User ${Math.floor(r() * 5000)} logged in from ${pick(ips)}`)
    else out.push(`${iso(t)} INFO  [${thr}] Order ${Math.floor(r() * 90000 + 10000)} created, total ${(r() * 300).toFixed(2)} EUR`)
  }
  return out.join('\n')
}
