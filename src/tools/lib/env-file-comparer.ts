// Dotenv parsing and comparison for the Env File Comparer.

export interface EnvEntry { key: string; value: string; line: number; quoted: boolean }
export interface EnvParse { entries: EnvEntry[]; map: Map<string, string>; duplicates: string[]; errors: { line: number; text: string }[] }

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/** Parses a dotenv file: comments, `export`, single/double/backtick quotes, multi-line double quotes, inline comments. */
export function parseEnv(src: string): EnvParse {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const entries: EnvEntry[] = []
  const errors: { line: number; text: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const m = /^(?:export\s+)?([^=\s:]+)\s*[=:]\s?(.*)$/.exec(t)
    if (!m || !KEY.test(m[1])) {
      errors.push({ line: i + 1, text: raw })
      continue
    }
    const key = m[1]
    let rest = m[2].trimStart()
    let value: string
    let quoted = false
    const q = rest[0]
    if (q === '"' || q === "'" || q === '`') {
      quoted = true
      let body = rest.slice(1)
      let end = findClose(body, q)
      const start = i
      // multi-line quoted value
      while (end < 0 && i + 1 < lines.length) {
        i++
        body += '\n' + lines[i]
        end = findClose(body, q)
      }
      if (end < 0) {
        errors.push({ line: start + 1, text: raw })
        continue
      }
      value = body.slice(0, end)
      if (q === '"') value = value.replace(/\\(n|r|t|"|\\)/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[c] ?? c)
      entries.push({ key, value, line: start + 1, quoted })
      continue
    }
    const hash = rest.search(/\s#/)
    if (hash >= 0) rest = rest.slice(0, hash)
    value = rest.trim()
    entries.push({ key, value, line: i + 1, quoted })
  }
  const map = new Map<string, string>()
  const dup = new Set<string>()
  for (const e of entries) {
    if (map.has(e.key)) dup.add(e.key)
    map.set(e.key, e.value) // later definitions win, like dotenv-expand / shells
  }
  return { entries, map, duplicates: [...dup], errors }
}

function findClose(s: string, q: string): number {
  for (let j = 0; j < s.length; j++) {
    if (s[j] === '\\' && q === '"') {
      j++
      continue
    }
    if (s[j] === q) return j
  }
  return -1
}

export type Status = 'same' | 'differs' | 'missing' | 'empty'
export interface Row { key: string; values: (string | undefined)[]; status: Status; missingIn: number[] }

/** One row per key across all files. */
export function compare(files: EnvParse[]): Row[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const f of files) for (const k of f.map.keys()) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  return keys.map((key) => {
    const values = files.map((f) => f.map.get(key))
    const missingIn = values.flatMap((v, i) => (v === undefined ? [i] : []))
    const present = values.filter((v): v is string => v !== undefined)
    const status: Status = missingIn.length ? 'missing' : present.some((v) => v === '') ? 'empty' : new Set(present).size > 1 ? 'differs' : 'same'
    return { key, values, status, missingIn }
  })
}

/** Masks a secret-ish value: keeps a short prefix and the length. */
export function mask(v: string, show = 0): string {
  if (v === '') return '(empty)'
  if (v.length <= 4) return '•'.repeat(v.length)
  const keep = Math.min(show, Math.floor(v.length / 3))
  return v.slice(0, keep) + '•'.repeat(Math.min(8, v.length - keep)) + (v.length > 12 ? ` (${v.length})` : '')
}

export const looksSecret = (k: string) => /SECRET|TOKEN|PASS|PWD|KEY|PRIVATE|CREDENTIAL|AUTH|SALT|DSN/i.test(k)

export function quote(v: string): string {
  if (v === '') return ''
  if (/^[\w@%+=:,./-]+$/.test(v)) return v
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

export type MergeMode = 'first' | 'last' | 'example'

/** Union of all keys. `first`/`last`: whose value wins; `example`: empty values (a .env.example). */
export function merge(files: EnvParse[], names: string[], mode: MergeMode, sort: boolean): string {
  const rows = compare(files)
  if (sort) rows.sort((a, b) => a.key.localeCompare(b.key))
  const out: string[] = [`# Merged by Env File Comparer from: ${names.join(', ')}`]
  for (const r of rows) {
    const idx = r.values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0)
    if (mode === 'example') {
      out.push(`${r.key}=`)
      continue
    }
    const pick = mode === 'first' ? idx[0] : idx[idx.length - 1]
    if (r.status === 'differs' || r.missingIn.length) out.push(`# ${r.status === 'differs' ? 'differs' : 'only in ' + idx.map((i) => names[i]).join(', ')}; value from ${names[pick]}`)
    out.push(`${r.key}=${quote(r.values[pick] ?? '')}`)
  }
  return out.join('\n') + '\n'
}
