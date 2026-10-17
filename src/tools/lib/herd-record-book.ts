// Pure helpers for the herd record book: dates, weight gain, withdrawal periods, CSV import.

export const DAY = 86400000
export const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10)

/** "2 y 3 mo", "5 mo", "12 d" from a birth date to `on`. */
export function age(dob: string, on: string): string {
  if (!dob) return '—'
  const a = new Date(dob), b = new Date(on)
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m--
  if (m < 0) return '—'
  if (m === 0) return `${Math.max(0, days(dob, on))} d`
  const y = Math.floor(m / 12)
  return y ? `${y} y${m % 12 ? ` ${m % 12} mo` : ''}` : `${m} mo`
}

export interface Weigh { date: string; kg: number }

/** Average daily gain (kg/day) between consecutive weighings, sorted by date. */
export function gains(ws: Weigh[]): { date: string; kg: number; adg: number | null }[] {
  const s = [...ws].sort((a, b) => a.date.localeCompare(b.date))
  return s.map((w, i) => {
    if (!i) return { ...w, adg: null }
    const d = days(s[i - 1].date, w.date)
    return { ...w, adg: d > 0 ? (w.kg - s[i - 1].kg) / d : null }
  })
}

/** Overall ADG from first to last weighing; null with fewer than two weighings. */
export function overallAdg(ws: Weigh[]): number | null {
  if (ws.length < 2) return null
  const s = [...ws].sort((a, b) => a.date.localeCompare(b.date))
  const d = days(s[0].date, s[s.length - 1].date)
  return d > 0 ? (s[s.length - 1].kg - s[0].kg) / d : null
}

/** Least-squares projection of weight on a future date (needs ≥ 2 points). */
export function project(ws: Weigh[], date: string): number | null {
  if (ws.length < 2) return null
  const t0 = Date.parse(ws[0].date)
  const xs = ws.map((w) => (Date.parse(w.date) - t0) / DAY), ys = ws.map((w) => w.kg)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0, den = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my)
    den += (x - mx) ** 2
  })
  if (!den) return null
  const b = num / den
  return my + b * ((Date.parse(date) - t0) / DAY - mx)
}

/** Meat/milk withdrawal end date (inclusive of the treatment day). */
export const withdrawalEnd = (date: string, d: number) => (d > 0 ? addDays(date, d) : '')
export const inWithdrawal = (date: string, d: number, today: string) => d > 0 && today < addDays(date, d)

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',' || c === ';' || c === '\t') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

/** Maps CSV rows to objects using a tolerant header match (case/space-insensitive aliases). */
export function mapRows(rows: string[][], fields: Record<string, string[]>): Record<string, string>[] {
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
  const idx: Record<string, number> = {}
  for (const [f, aliases] of Object.entries(fields)) {
    const i = head.findIndex((h) => [f, ...aliases].map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, '')).includes(h))
    if (i >= 0) idx[f] = i
  }
  return rows.slice(1).map((r) => Object.fromEntries(Object.entries(idx).map(([f, i]) => [f, (r[i] ?? '').trim()])))
}

/** Normalizes dd/mm/yyyy, dd.mm.yyyy and yyyy-mm-dd to ISO; returns '' if unparseable. */
export function isoDate(s: string): string {
  s = s.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}
