// Word cloud layout: word counting (tokeniser shared with the keyword density analyzer), font scaling,
// Archimedean spiral search and an occupancy bitmap for pixel-accurate collision tests within a shape mask.
import { sentencesOfWords, STOP } from './keyword-density-analyzer'

export interface WordCount { word: string; count: number }

/** Short stop-word lists written for this tool (English uses the shared, longer list). */
export const STOP_LISTS: Record<string, string> = {
  es: 'el la los las un una unos unas y o pero si de del al a en con por para sin sobre entre es son era fue ser estar está están lo le les se su sus mi mis tu tus que qué como cuando donde muy más menos ya no sí también este esta estos estas ese esa eso hay',
  fr: 'le la les un une des et ou mais si de du au aux à en dans par pour sur avec sans est sont était être avoir a ont ce cet cette ces se sa son ses mon ma mes ton ta tes que qui quoi comme quand où très plus moins ne pas oui aussi il elle ils elles nous vous je tu on y',
  de: 'der die das den dem des ein eine einer eines einem einen und oder aber wenn von zu im in an auf mit für über unter ist sind war waren sein haben hat hatte es er sie wir ihr ich du man nicht kein keine auch noch nur sehr mehr dass wie wo als so bei aus nach',
  uk: 'і й та а але або що як це цей ця ці той та ті в у на з із до від за по про для при над під не ні так також вже ще дуже він вона вони ми ви я ти воно був була були бути є його її їх свій свої наш ваш які який яка де коли бо чи же лише',
}

/** Common filler words missing from the shared list that make poor cloud words. */
const EN_EXTRA = 'every far come comes came one ones get gets got make makes made much many way ways well back even still really thing things lot lots today anyone others other some any each'

export function stopSet(lists: string[], extra: string): Set<string> {
  const s = new Set<string>()
  for (const l of lists) {
    if (l === 'en') { STOP.forEach((w) => s.add(w)); EN_EXTRA.split(' ').forEach((w) => s.add(w)) }
    else (STOP_LISTS[l] ?? '').split(/\s+/).forEach((w) => w && s.add(w))
  }
  extra.split(/[\s,;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).forEach((w) => s.add(w))
  return s
}

export function countWords(text: string, o: { stop: Set<string>; minLen: number; numbers: boolean }): WordCount[] {
  const m = new Map<string, number>()
  for (const w of sentencesOfWords(text).flat()) {
    if (w.length < o.minLen || o.stop.has(w) || (!o.numbers && /^\d+([.,]\d+)?$/.test(w))) continue
    m.set(w, (m.get(w) ?? 0) + 1)
  }
  return [...m].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
}

/** Lines like "word: 12", "word, 12", "word 12" or a bare "word" (weight 1). */
export function parseWeighted(text: string): WordCount[] {
  const m = new Map<string, number>()
  for (const raw of text.split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    const g = /^(.*?)[\s,:;=\t]+(\d+(?:\.\d+)?)$/.exec(line)
    const word = (g ? g[1] : line).trim()
    const w = g ? Number(g[2]) : 1
    if (word && w > 0) m.set(word, (m.get(word) ?? 0) + w)
  }
  return [...m].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count)
}

export type Scale = 'linear' | 'sqrt' | 'log'
export function sizeFor(c: number, cMin: number, cMax: number, fMin: number, fMax: number, scale: Scale): number {
  if (cMax <= cMin) return fMax
  const f = (x: number) => (scale === 'sqrt' ? Math.sqrt(x) : scale === 'log' ? Math.log(x) : x)
  const t = (f(c) - f(cMin)) / (f(cMax) - f(cMin))
  return fMin + (fMax - fMin) * Math.max(0, Math.min(1, t))
}

/** Factor that scales font sizes so the words cover about `density` of the available area (glyph box ≈ 0.6·size per letter × 1.1·size). */
export function fitFactor(words: { word: string; size: number }[], area: number, density = 0.8): number {
  const est = words.reduce((a, w) => a + w.size * 0.6 * w.word.length * w.size * 1.1, 0)
  return est > 0 ? Math.max(0.4, Math.min(3, Math.sqrt((area * density) / est))) : 1
}

/** Archimedean spiral offsets r = a·θ, roughly `step` pixels apart along the curve, stretched to the canvas aspect. */
export function spiral(maxR: number, aspect = 1, step = 2): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  let θ = 0
  const a = step / (2 * Math.PI)
  while (a * θ < maxR) {
    const r = a * θ
    θ += step / Math.max(step, r)
    out.push([Math.round(r * Math.cos(θ) * aspect), Math.round(r * Math.sin(θ))])
  }
  return out
}

/** Occupancy grid (1 cell = `cell` pixels). A sprite is a w×h cell bitmap of a rotated word. */
export interface Sprite { w: number; h: number; bits: Uint8Array }
export class Board {
  readonly occ: Uint8Array
  readonly w: number
  readonly h: number
  readonly allowed: Uint8Array | null
  constructor(w: number, h: number, allowed: Uint8Array | null = null) {
    this.w = w
    this.h = h
    this.allowed = allowed
    this.occ = new Uint8Array(w * h)
  }
  fits(s: Sprite, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x + s.w > this.w || y + s.h > this.h) return false
    for (let j = 0; j < s.h; j++) {
      const row = (y + j) * this.w + x, srow = j * s.w
      for (let i = 0; i < s.w; i++) {
        if (!s.bits[srow + i]) continue
        if (this.occ[row + i] || (this.allowed && !this.allowed[row + i])) return false
      }
    }
    return true
  }
  put(s: Sprite, x: number, y: number) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) if (s.bits[j * s.w + i]) this.occ[(y + j) * this.w + x + i] = 1
  }
}

/** Grows a sprite by `pad` cells in every direction (spacing between words). */
export function dilate(s: Sprite, pad: number): Sprite {
  if (pad <= 0) return s
  const w = s.w + 2 * pad, h = s.h + 2 * pad
  const bits = new Uint8Array(w * h)
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    if (!s.bits[j * s.w + i]) continue
    for (let dj = 0; dj <= 2 * pad; dj++) for (let di = 0; di <= 2 * pad; di++) bits[(j + dj) * w + i + di] = 1
  }
  return { w, h, bits }
}

export type Shape = 'rect' | 'ellipse' | 'heart' | 'star' | 'diamond' | 'cloud'
/** 1 where words may go. Shapes are fitted to the board. */
export function shapeMask(shape: Shape, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h)
  const inside = (u: number, v: number): boolean => {
    // u, v in [-1, 1], v down
    switch (shape) {
      case 'rect': return true
      case 'ellipse': return u * u + v * v <= 1
      case 'diamond': return Math.abs(u) + Math.abs(v) <= 1
      case 'heart': { const x = u * 1.25, y = -v * 1.25 + 0.25; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0 }
      case 'star': {
        const r = Math.hypot(u, v), a = Math.atan2(v, u) + Math.PI / 2
        const k = (((a % ((2 * Math.PI) / 5)) + (2 * Math.PI) / 5) % ((2 * Math.PI) / 5)) / ((2 * Math.PI) / 5)
        const edge = 0.45 + 0.55 * Math.abs(1 - 2 * k) ** 1.6
        return r <= edge
      }
      case 'cloud': {
        const bumps: [number, number, number][] = [[-0.55, 0.15, 0.45], [0, -0.2, 0.6], [0.55, 0.1, 0.45], [-0.25, 0.35, 0.45], [0.3, 0.35, 0.45]]
        return bumps.some(([cx, cy, r]) => (u - cx) ** 2 + ((v - cy) * 1.2) ** 2 <= r * r)
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside((2 * x) / (w - 1) - 1, (2 * y) / (h - 1) - 1) ? 1 : 0
  return m
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
