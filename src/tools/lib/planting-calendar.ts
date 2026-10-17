// Sowing / planting / harvest windows from frost dates. Dates are UTC-midnight ISO strings (YYYY-MM-DD).

export interface Crop {
  n: string
  e: string
  /** Start indoors: weeks relative to last spring frost [from, to]. */
  ind?: [number, number]
  /** Transplant outside: weeks relative to last frost. */
  out?: [number, number]
  /** Direct sow outside: weeks relative to last frost. */
  dir?: [number, number]
  /** Days to maturity from sowing outside / transplanting. */
  dtm: number
  /** Length of the harvest window in weeks. */
  hw: number
  /** Frost-hardy: tolerates light frost, can be sown again for a fall crop. */
  hardy?: boolean
}

// Typical temperate-garden timings (weeks vs. last frost), compiled from extension-service charts.
export const CROPS: Crop[] = [
  { n: 'Tomato', e: '🍅', ind: [-8, -6], out: [1, 3], dtm: 70, hw: 10 },
  { n: 'Pepper', e: '🫑', ind: [-10, -8], out: [2, 4], dtm: 75, hw: 8 },
  { n: 'Eggplant', e: '🍆', ind: [-9, -7], out: [2, 4], dtm: 75, hw: 6 },
  { n: 'Basil', e: '🌿', ind: [-6, -4], out: [1, 3], dtm: 40, hw: 10 },
  { n: 'Cucumber', e: '🥒', ind: [-4, -3], out: [1, 3], dir: [1, 3], dtm: 55, hw: 6 },
  { n: 'Zucchini', e: '🥒', ind: [-4, -3], out: [1, 3], dir: [1, 3], dtm: 50, hw: 8 },
  { n: 'Winter squash', e: '🎃', ind: [-4, -3], out: [2, 3], dir: [2, 3], dtm: 95, hw: 3 },
  { n: 'Melon', e: '🍈', ind: [-4, -3], out: [2, 4], dtm: 85, hw: 3 },
  { n: 'Sweet corn', e: '🌽', dir: [1, 4], dtm: 80, hw: 2 },
  { n: 'Bush beans', e: '🫘', dir: [1, 4], dtm: 55, hw: 4 },
  { n: 'Potato', e: '🥔', dir: [-3, 0], dtm: 90, hw: 4, hardy: true },
  { n: 'Onion', e: '🧅', ind: [-12, -10], out: [-4, -2], dtm: 100, hw: 3, hardy: true },
  { n: 'Peas', e: '🫛', dir: [-6, -3], dtm: 60, hw: 3, hardy: true },
  { n: 'Spinach', e: '🥬', dir: [-6, -3], dtm: 40, hw: 4, hardy: true },
  { n: 'Lettuce', e: '🥬', ind: [-6, -4], out: [-2, 0], dir: [-4, 0], dtm: 45, hw: 4, hardy: true },
  { n: 'Kale', e: '🥬', ind: [-8, -6], out: [-4, -1], dir: [-4, -2], dtm: 55, hw: 12, hardy: true },
  { n: 'Broccoli', e: '🥦', ind: [-8, -6], out: [-3, -1], dtm: 60, hw: 3, hardy: true },
  { n: 'Cabbage', e: '🥬', ind: [-8, -6], out: [-3, -1], dtm: 70, hw: 4, hardy: true },
  { n: 'Cauliflower', e: '🥦', ind: [-8, -6], out: [-2, 0], dtm: 60, hw: 2, hardy: true },
  { n: 'Carrot', e: '🥕', dir: [-3, 1], dtm: 70, hw: 6, hardy: true },
  { n: 'Beet', e: '🟣', dir: [-3, 1], dtm: 55, hw: 5, hardy: true },
  { n: 'Radish', e: '🔴', dir: [-5, -1], dtm: 25, hw: 2, hardy: true },
  { n: 'Swiss chard', e: '🥬', dir: [-2, 2], dtm: 55, hw: 16, hardy: true },
]

export type Kind = 'indoor' | 'transplant' | 'direct' | 'harvest' | 'fall-sow' | 'fall-harvest'
export interface Task {
  crop: string
  kind: Kind
  start: string
  end: string
}

const DAY = 86400000
export const toDay = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY
export const fromDay = (d: number) => new Date(Math.round(d) * DAY).toISOString().slice(0, 10)

/** All task windows for one crop given last spring frost and first fall frost. */
export function schedule(c: Crop, lastFrost: string, firstFrost: string): Task[] {
  const lf = toDay(lastFrost), ff = toDay(firstFrost)
  const out: Task[] = []
  const add = (kind: Kind, a: number, b: number) => out.push({ crop: c.n, kind, start: fromDay(a), end: fromDay(Math.max(a, b)) })
  const frostEnd = ff + (c.hardy ? 28 : 0)
  if (c.ind) add('indoor', lf + c.ind[0] * 7, lf + c.ind[1] * 7)
  if (c.out) add('transplant', lf + c.out[0] * 7, lf + c.out[1] * 7)
  if (c.dir) add('direct', lf + c.dir[0] * 7, lf + c.dir[1] * 7)
  const plant = [c.out, c.dir].filter(Boolean) as [number, number][]
  if (plant.length) {
    const first = lf + Math.min(...plant.map((p) => p[0])) * 7 + c.dtm
    const last = lf + Math.max(...plant.map((p) => p[1])) * 7 + c.dtm + c.hw * 7
    if (first < frostEnd) add('harvest', first, Math.min(last, frostEnd))
  }
  if (c.hardy && c.dtm <= 80) {
    // Fall crop: count back days-to-maturity from the first frost (the usual 14-day "fall factor"
    // for slower autumn growth is offset by these crops tolerating light frosts).
    const latest = ff - c.dtm
    const earliest = latest - 21
    const springHarvestEnd = plant.length ? lf + Math.max(...plant.map((p) => p[1])) * 7 + c.dtm + c.hw * 7 : 0
    if (earliest > springHarvestEnd - 30 && earliest > lf + 56) {
      add('fall-sow', earliest, latest)
      add('fall-harvest', earliest + c.dtm, Math.min(latest + c.dtm + c.hw * 7, frostEnd))
    }
  }
  return out
}

export const seasonDays = (lastFrost: string, firstFrost: string) => toDay(firstFrost) - toDay(lastFrost)

const LABEL: Record<Kind, string> = {
  indoor: 'Start seeds indoors',
  transplant: 'Transplant outdoors',
  direct: 'Direct sow outdoors',
  harvest: 'Harvest',
  'fall-sow': 'Sow fall crop',
  'fall-harvest': 'Harvest fall crop',
}
export const kindLabel = (k: Kind) => LABEL[k]

/** iCalendar with one all-day (multi-day) event per task. */
export function toIcs(tasks: Task[], stamp = '20260101T000000Z'): string {
  const d = (iso: string) => iso.replace(/-/g, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Planting Calendar//EN', 'CALSCALE:GREGORIAN']
  tasks.forEach((t, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:plant-${i}-${d(t.start)}-${t.crop.replace(/\W+/g, '')}@browser-toolbox`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d(t.start)}`,
      `DTEND;VALUE=DATE:${d(fromDay(toDay(t.end) + 1))}`,
      `SUMMARY:${t.crop}: ${kindLabel(t.kind)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
