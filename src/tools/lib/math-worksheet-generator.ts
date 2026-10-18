// Early-primary visual math problems (number bonds, times tables, place value, clocks, money,
// number sequences) from a seeded generator, with exact answers.
import { rng } from './worksheet-generator'

export { rng }
export type Grade = 'K' | '1' | '2' | '3'
export type Topic = 'bond' | 'times' | 'place' | 'clock' | 'money' | 'seq'
export type Currency = 'USD' | 'EUR' | 'GBP'

export const TOPIC_INFO: Record<Topic, [string, string]> = {
  bond: ['Number bonds', 'Fill in the missing number so the parts make the whole.'],
  times: ['Times tables', 'Work out each fact as fast as you can.'],
  place: ['Place value', 'Write the number shown by the blocks.'],
  clock: ['Telling time', 'Write the time shown on each clock.'],
  money: ['Counting money', 'How much money is in each box?'],
  seq: ['Missing numbers', 'Find the pattern and fill in the gaps.'],
}

export type Prob =
  | { k: 'bond'; whole: number; a: number; b: number; hide: 'whole' | 'a' | 'b' }
  | { k: 'times'; a: number; b: number; div: boolean }
  | { k: 'place'; th: number; h: number; t: number; o: number }
  | { k: 'clock'; h: number; m: number }
  | { k: 'money'; items: number[]; cur: Currency }
  | { k: 'seq'; items: (number | null)[]; full: number[] }

/** Denominations in minor units (cents/pence); values ≥ 500 are notes. */
export const DENOMS: Record<Currency, number[]> = {
  USD: [1, 5, 10, 25, 100, 500, 1000],
  EUR: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
  GBP: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
}

export function fmtMoney(minor: number, cur: Currency): string {
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '£'
  if (minor < 100) return `${minor}${cur === 'GBP' ? 'p' : cur === 'USD' ? '¢' : 'c'}`
  return `${sym}${(minor / 100).toFixed(2)}`
}

export function denomLabel(v: number, cur: Currency): string {
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '£'
  if (v >= 100) return `${sym}${v / 100}`
  return `${v}${cur === 'GBP' ? 'p' : cur === 'USD' ? '¢' : 'c'}`
}

const LIMITS: Record<Grade, { bond: number; place: number; money: number; clockStep: number; seqMax: number }> = {
  K: { bond: 10, place: 50, money: 50, clockStep: 60, seqMax: 30 },
  '1': { bond: 20, place: 100, money: 100, clockStep: 30, seqMax: 100 },
  '2': { bond: 100, place: 999, money: 500, clockStep: 5, seqMax: 500 },
  '3': { bond: 1000, place: 9999, money: 2000, clockStep: 1, seqMax: 1000 },
}

export const DEFAULT_TABLES: Record<Grade, number[]> = { K: [1, 2], '1': [2, 5, 10], '2': [2, 3, 4, 5, 10], '3': [2, 3, 4, 5, 6, 7, 8, 9, 10] }

export function generate(topic: Topic, grade: Grade, n: number, seed: number, opts: { tables?: number[]; cur?: Currency; division?: boolean } = {}): Prob[] {
  const r = rng(seed * 7919 + topic.length * 104729 + topic.charCodeAt(0))
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const L = LIMITS[grade]
  const out: Prob[] = []
  const seen = new Set<string>()
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    let p: Prob
    if (topic === 'bond') {
      const whole = grade === '2' ? pick([int(10, 20), int(2, 10) * 10, int(20, 100)]) : grade === '3' ? pick([int(2, 10) * 100, int(10, 100) * 10, int(100, 1000)]) : int(Math.ceil(L.bond / 2), L.bond)
      const a = int(1, whole - 1)
      p = { k: 'bond', whole, a, b: whole - a, hide: pick(['a', 'b', 'b', 'whole']) }
    } else if (topic === 'times') {
      const tables = opts.tables?.length ? opts.tables : DEFAULT_TABLES[grade]
      const a = pick(tables), b = int(grade === 'K' ? 1 : 0, grade === '3' ? 12 : 10)
      p = { k: 'times', a, b, div: !!opts.division && b > 0 && r() < 0.4 }
    } else if (topic === 'place') {
      const v = int(grade === 'K' ? 11 : 12, L.place)
      p = { k: 'place', th: Math.floor(v / 1000), h: Math.floor(v / 100) % 10, t: Math.floor(v / 10) % 10, o: v % 10 }
    } else if (topic === 'clock') {
      const h = int(1, 12)
      const m = L.clockStep === 60 ? 0 : grade === '1' ? pick([0, 30, 0, 30, 15, 45]) : L.clockStep === 5 ? int(0, 11) * 5 : int(0, 59)
      p = { k: 'clock', h, m: grade === 'K' ? pick([0, 0, 30]) : m }
    } else if (topic === 'money') {
      const cur = opts.cur ?? 'USD'
      const ds = DENOMS[cur].filter((d) => d <= L.money / 2 || d === DENOMS[cur][0])
      const target = int(Math.max(2, Math.floor(L.money / 5)), L.money)
      const items: number[] = []
      let left = target
      while (left > 0 && items.length < 9) {
        const ok = ds.filter((d) => d <= left)
        const d = r() < 0.65 ? ok[ok.length - 1] : pick(ok)
        items.push(d)
        left -= d
      }
      items.sort((a, b) => b - a)
      p = { k: 'money', items, cur }
    } else {
      const steps = grade === 'K' ? [1, 2] : grade === '1' ? [1, 2, 5, 10] : grade === '2' ? [2, 3, 4, 5, 10, 100] : [3, 4, 6, 7, 8, 9, 11, 25, 50, 100]
      const step = pick(steps) * (grade !== 'K' && r() < 0.3 ? -1 : 1)
      const len = 6
      const span = Math.abs(step) * (len - 1)
      const start = step > 0 ? int(0, Math.max(0, L.seqMax - span)) : int(span, Math.max(span, L.seqMax))
      const full = Array.from({ length: len }, (_, i) => start + i * step)
      const holes = new Set<number>()
      const k = grade === 'K' ? 1 : 2
      while (holes.size < k) holes.add(int(1, len - 1))
      p = { k: 'seq', full, items: full.map((v, i) => (holes.has(i) ? null : v)) }
    }
    const key = JSON.stringify(p)
    if (seen.has(key) && tries < n * 20) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export const pad2 = (x: number) => String(x).padStart(2, '0')

export function answer(p: Prob): string {
  switch (p.k) {
    case 'bond': return String(p.hide === 'whole' ? p.whole : p.hide === 'a' ? p.a : p.b)
    case 'times': return String(p.div ? p.b : p.a * p.b)
    case 'place': return String(p.th * 1000 + p.h * 100 + p.t * 10 + p.o)
    case 'clock': return `${p.h}:${pad2(p.m)}`
    case 'money': return fmtMoney(p.items.reduce((a, b) => a + b, 0), p.cur)
    case 'seq': return p.full.filter((_, i) => p.items[i] === null).join(', ')
  }
}

/** Text prompt used by the on-screen drill. */
export function prompt(p: Prob): string {
  switch (p.k) {
    case 'bond': return p.hide === 'whole' ? `${p.a} + ${p.b} = ?` : `${p.whole} = ${p.hide === 'a' ? '?' : p.a} + ${p.hide === 'b' ? '?' : p.b}`
    case 'times': return p.div ? `${p.a * p.b} ÷ ${p.a} = ?` : `${p.a} × ${p.b} = ?`
    case 'place': return `${p.th ? `${p.th} thousands, ` : ''}${p.h ? `${p.h} hundreds, ` : ''}${p.t} tens, ${p.o} ones = ?`
    case 'clock': return 'What time is it?'
    case 'money': return 'How much money?'
    case 'seq': return p.items.map((v) => (v === null ? '?' : v)).join(', ')
  }
}

/** Lenient answer check: ignores spaces, currency signs, leading zeros of hours; "3.15" = "3:15". */
export function check(p: Prob, given: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s$€£¢]/g, '').replace(/^0+(?=\d)/, '').replace(/\./g, p.k === 'clock' ? ':' : '.')
  if (p.k === 'money') {
    const total = p.items.reduce((a, b) => a + b, 0)
    const g = given.replace(/[^\d.,]/g, '').replace(',', '.')
    if (!g) return false
    const v = Number(g)
    const isMinor = /[¢cp]\s*$/i.test(given.trim()) || (!g.includes('.') && total < 100)
    return Math.abs((isMinor ? v : v * 100) - total) < 0.5
  }
  return norm(given) === norm(answer(p))
}
