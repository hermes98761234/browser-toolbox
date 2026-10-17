// Cycle counting: ABC classification by annual usage value, count frequencies per class, and an
// evenly loaded calendar of counts over working days.

export interface Item { sku: string; name: string; location: string; unitCost: number; annualQty: number; cls?: 'A' | 'B' | 'C' | '' }
export type Cls = 'A' | 'B' | 'C'
export interface Classified extends Item { value: number; share: number; cum: number; klass: Cls }

/** Pareto ABC: sort by annual value; A up to `a` of cumulative value, B up to `b`, rest C. Manual class wins. */
export function classify(items: Item[], a = 0.8, b = 0.95): Classified[] {
  const withV = items.map((it) => ({ ...it, value: Math.max(0, it.unitCost) * Math.max(0, it.annualQty) }))
  const total = withV.reduce((s, x) => s + x.value, 0) || 1
  let cum = 0
  return withV.sort((x, y) => y.value - x.value || x.sku.localeCompare(y.sku)).map((x, i) => {
    cum += x.value / total
    // class by cumulative share including the item; the top item is always A
    const auto: Cls = i === 0 || cum <= a + 1e-9 ? 'A' : cum <= b + 1e-9 ? 'B' : 'C'
    return { ...x, share: x.value / total, cum, klass: x.cls ? x.cls : auto }
  })
}

/** Working days (Mon–Fri unless `weekends`) from start (inclusive) for `days` calendar days, minus holidays. */
export function workingDays(start: string, days: number, holidays: string[] = [], weekends = false): string[] {
  const hol = new Set(holidays)
  const out: string[] = []
  const t0 = Date.parse(start + 'T00:00:00Z')
  for (let i = 0; i < days; i++) {
    const d = new Date(t0 + i * 864e5)
    const iso = d.toISOString().slice(0, 10)
    const wd = d.getUTCDay()
    if (!weekends && (wd === 0 || wd === 6)) continue
    if (hol.has(iso)) continue
    out.push(iso)
  }
  return out
}

export interface Task { sku: string; day: string; round: number }

/**
 * Spreads `freq[klass]` counts per item across `days`. Each item's counts are evenly spaced, items
 * are staggered, and tasks are then dealt out in order so every day gets the same load (±1).
 */
export function schedule(items: Classified[], freq: Record<Cls, number>, days: string[]): Task[] {
  const D = days.length
  if (!D) return []
  const ideal: { sku: string; round: number; pos: number; loc: string }[] = []
  // stagger offsets with the golden ratio so items of one class don't all land together
  const phi = 0.6180339887
  items.forEach((it, i) => {
    const f = Math.max(0, Math.round(freq[it.klass]))
    const off = (i * phi) % 1
    for (let k = 0; k < f; k++) ideal.push({ sku: it.sku, round: k + 1, pos: ((off + k) / f) * D, loc: it.location })
  })
  ideal.sort((x, y) => x.pos - y.pos || x.loc.localeCompare(y.loc))
  const N = ideal.length
  return ideal.map((t, j) => ({ sku: t.sku, round: t.round, day: days[Math.min(D - 1, Math.floor((j * D) / N))] }))
}

/** Parses CSV lines: sku, name, location, unit cost, annual quantity[, class]. Header optional. */
export function parseItems(text: string): { items: Item[]; skipped: number } {
  const items: Item[] = []
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
    const c = line.split(delim).map((x) => x.trim().replace(/^"|"$/g, ''))
    const cs = (c[3] ?? '').replace(/[^0-9.-]/g, ''), qs = (c[4] ?? '').replace(/[^0-9.-]/g, '')
    const cost = Number(cs), qty = Number(qs)
    if (!c[0] || !cs || !qs || !Number.isFinite(cost) || !Number.isFinite(qty)) { skipped++; continue }
    const k = (c[5] ?? '').toUpperCase()
    items.push({ sku: c[0], name: c[1] ?? '', location: c[2] ?? '', unitCost: cost, annualQty: qty, cls: k === 'A' || k === 'B' || k === 'C' ? k : '' })
  }
  return { items, skipped }
}

/** Deterministic sample warehouse: `n` SKUs with a long-tailed value distribution. */
export function sampleItems(n = 200): Item[] {
  const cats = ['Bearing', 'Motor', 'Valve', 'Filter', 'Gasket', 'Sensor', 'Belt', 'Fuse', 'Bolt kit', 'Pump seal', 'Relay', 'Hose']
  let x = 42
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, (_, i) => {
    const cost = Math.round(Math.exp(rnd() * 5.5) * 100) / 100
    const qty = Math.round(Math.exp(rnd() * 6.5))
    return { sku: `SKU-${String(1001 + i)}`, name: `${cats[i % cats.length]} ${String.fromCharCode(65 + (i % 7))}${10 + i}`, location: `${'ABCDEF'[i % 6]}-${String(1 + ((i * 7) % 20)).padStart(2, '0')}-${1 + (i % 5)}`, unitCost: cost, annualQty: qty, cls: '' }
  })
}
