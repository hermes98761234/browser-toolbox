// Storyboard model: frames with drawings (whiteboard items) and shot notes, aspect templates,
// PDF page layout, text wrapping and running time.
import type { Item, ShapeItem, Stroke } from './interactive-whiteboard'

export interface Frame { id: string; shot: string; move: string; dur: number; action: string; dialogue: string; items: Item[] }
export interface Board { title: string; aspect: string; perPage: number; paper: 'letter' | 'a4'; frames: Frame[] }

export const ASPECTS: [string, string, number][] = [
  ['16:9', '16:9 HD video', 16 / 9],
  ['2.39:1', '2.39:1 Scope', 2.39],
  ['1.85:1', '1.85:1 Flat', 1.85],
  ['4:3', '4:3 Classic', 4 / 3],
  ['1:1', '1:1 Square', 1],
  ['4:5', '4:5 Feed', 0.8],
  ['9:16', '9:16 Vertical', 9 / 16],
]
export const ratioOf = (a: string) => ASPECTS.find((x) => x[0] === a)?.[2] ?? 16 / 9
export const SHOTS = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'Insert', 'Two-shot']
export const MOVES = ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Truck', 'Crane', 'Handheld', 'Zoom', 'Whip pan']

/** Drawing space: frames are always CANVAS_W wide; height follows the aspect ratio. */
export const CANVAS_W = 960
export const canvasH = (aspect: string) => Math.round(CANVAS_W / ratioOf(aspect))

export const GRIDS: Record<number, [number, number]> = { 2: [2, 1], 3: [3, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3] }

export interface Rect { x: number; y: number; w: number; h: number }
/** Cell rectangles (PDF points, origin bottom-left) for a page grid; image area + text area per cell. */
export function cells(pageW: number, pageH: number, perPage: number, aspect: number, margin = 36, header = 34, gap = 16): { img: Rect; text: Rect }[] {
  const [cols, rows] = GRIDS[perPage] ?? [3, 2]
  const cw = (pageW - 2 * margin - (cols - 1) * gap) / cols
  const ch = (pageH - 2 * margin - header - (rows - 1) * gap) / rows
  // image takes the width unless that leaves less than 38% of the cell for notes
  let iw = cw, ih = cw / aspect
  if (ih > ch * 0.62) {
    ih = ch * 0.62
    iw = ih * aspect
  }
  const out: { img: Rect; text: Rect }[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = margin + c * (cw + gap)
      const top = pageH - margin - header - r * (ch + gap)
      out.push({ img: { x: x + (cw - iw) / 2, y: top - ih, w: iw, h: ih }, text: { x, y: top - ch, w: cw, h: ch - ih - 6 } })
    }
  return out
}

/** Greedy word wrap with a width measure (also splits words that are longer than a line). */
export function wrap(text: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = cur ? `${cur} ${word}` : word
      if (measure(cand) <= maxW) {
        cur = cand
        continue
      }
      if (cur) lines.push(cur)
      let w = word
      while (measure(w) > maxW && w.length > 1) {
        let k = w.length - 1
        while (k > 1 && measure(w.slice(0, k)) > maxW) k--
        lines.push(w.slice(0, k))
        w = w.slice(k)
      }
      cur = w
    }
    lines.push(cur)
  }
  return lines
}

/** Keeps text printable with the standard PDF fonts (WinAnsi): smart quotes/dashes mapped, others → '?'. */
export function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7e\n\xa0-\xff]/g, '?')
}

export const runtime = (frames: Frame[]) => frames.reduce((a, f) => a + (Number.isFinite(f.dur) ? Math.max(0, f.dur) : 0), 0)
export const tc = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
/** Start time of each frame. */
export const starts = (frames: Frame[]) => frames.reduce<number[]>((a, _f, i) => [...a, i ? a[i - 1] + Math.max(0, frames[i - 1].dur) : 0], [])

// ---- sample board (simple sketches built from shapes) ----
let n = 0
const sh = (kind: ShapeItem['kind'], x1: number, y1: number, x2: number, y2: number, color = '#1f2937', size = 4, fill = false): ShapeItem => ({ id: `s${n++}`, kind, color, size, fill, x1, y1, x2, y2 })
const pen = (pts: [number, number][], color = '#1f2937', size = 4): Stroke => ({ id: `p${n++}`, kind: 'pen', color, size, pts: pts.flatMap(([x, y]) => [x, y, 0.5]) })
const figure = (x: number, y: number, s: number, color = '#1f2937'): Item[] => [
  sh('ellipse', x - 14 * s, y - 100 * s, x + 14 * s, y - 72 * s, color, 4),
  sh('line', x, y - 72 * s, x, y - 30 * s, color, 4),
  sh('line', x, y - 60 * s, x - 22 * s, y - 42 * s, color, 4),
  sh('line', x, y - 60 * s, x + 22 * s, y - 42 * s, color, 4),
  sh('line', x, y - 30 * s, x - 16 * s, y, color, 4),
  sh('line', x, y - 30 * s, x + 16 * s, y, color, 4),
]
const hills = (y: number) => pen(Array.from({ length: 25 }, (_, i) => [i * 40, y - 30 * Math.sin(i / 3) - 12 * Math.sin(i * 1.3)] as [number, number]), '#475569', 3)

export function sampleBoard(): Board {
  n = 0
  const frames: Frame[] = [
    { id: 'f1', shot: 'EWS', move: 'Static', dur: 4, action: 'Dawn over the valley. A lone cabin sits by the lake.', dialogue: '', items: [hills(300), sh('ellipse', 700, 90, 780, 170, '#f59e0b', 4, true), sh('rect', 380, 300, 470, 370, '#1f2937', 4), sh('line', 370, 300, 425, 250), sh('line', 425, 250, 480, 300), sh('line', 0, 420, 960, 420, '#0ea5e9', 3)] },
    { id: 'f2', shot: 'MS', move: 'Dolly in', dur: 3, action: 'Mara steps onto the porch with a mug, squinting at the sun.', dialogue: 'MARA: Right on time.', items: [sh('rect', 120, 120, 380, 480, '#64748b', 3), ...figure(560, 470, 3.6), sh('arrow', 860, 260, 760, 260, '#ef4444', 5)] },
    { id: 'f3', shot: 'CU', move: 'Static', dur: 2, action: 'Her phone buzzes on the railing. Unknown number.', dialogue: '', items: [sh('rect', 330, 120, 630, 460, '#1f2937', 6), sh('rect', 360, 160, 600, 400, '#6366f1', 3, true), sh('line', 0, 470, 960, 470, '#92400e', 8), pen([[300, 110], [280, 90], [300, 70]], '#ef4444', 4), pen([[660, 110], [680, 90], [660, 70]], '#ef4444', 4)] },
    { id: 'f4', shot: 'OTS', move: 'Handheld', dur: 5, action: 'Over her shoulder: a canoe drifts toward the dock, empty.', dialogue: 'MARA: That is not ours.', items: [sh('ellipse', -80, 200, 300, 640, '#1f2937', 5, true), sh('line', 0, 300, 960, 300, '#0ea5e9', 3), pen([[520, 330], [600, 350], [720, 350], [800, 330]], '#92400e', 5), sh('line', 520, 330, 800, 330, '#92400e', 4)] },
    { id: 'f5', shot: 'WS', move: 'Pan', dur: 4, action: 'She runs down to the water. Camera pans with her.', dialogue: '', items: [hills(220), ...figure(300, 440, 2), sh('arrow', 360, 360, 700, 360, '#ef4444', 5), sh('line', 0, 470, 960, 470, '#0ea5e9', 3)] },
    { id: 'f6', shot: 'Insert', move: 'Static', dur: 3, action: 'Inside the canoe: a folded map with a red circle.', dialogue: 'V.O.: Find the second key.', items: [sh('rect', 220, 110, 740, 430, '#a16207', 4), sh('line', 393, 110, 393, 430, '#a16207', 2), sh('line', 566, 110, 566, 430, '#a16207', 2), sh('ellipse', 600, 200, 690, 280, '#ef4444', 6), pen([[260, 380], [330, 300], [420, 330], [520, 250], [640, 240]], '#475569', 3)] },
  ]
  return { title: 'The Second Key', aspect: '16:9', perPage: 6, paper: 'letter', frames }
}
