// An original geometric display face ("Toolbox Grotesk Demo") generated in code so the inspector has
// something to show on first load: uppercase A–Z (lowercase maps to the same glyphs), some digits and
// punctuation, quadratic bowls, and composite Ä/Ö/Ü built from O/A/U plus dot components.
import { buildFont, type Pt, type WGlyph } from './font-inspector'

const S = 92 // stem
const P = (x: number, y: number, on = true): Pt => ({ x: Math.round(x), y: Math.round(y), on })

const area = (c: Pt[]) => c.reduce((a, p, i) => a + p.x * c[(i + 1) % c.length].y - c[(i + 1) % c.length].x * p.y, 0) / 2
/** TrueType wants clockwise outer contours (y up) and counter-clockwise holes. */
const orient = (c: Pt[], cw = true) => ((area(c) < 0) === cw ? c : [...c].reverse())

const R = (x0: number, y0: number, x1: number, y1: number) => [orient([P(x0, y0), P(x0, y1), P(x1, y1), P(x1, y0)])]
/** Diagonal stroke with horizontal ends, centreline (x0,y0) → (x1,y1). */
function D(x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const k = ((S / 2) * len) / Math.max(1, Math.abs(y1 - y0))
  return [orient([P(x0 - k, y0), P(x1 - k, y1), P(x1 + k, y1), P(x0 + k, y0)])]
}
/** Elliptical arc band (outer radii rx, ry) from a0 to a1 degrees, built from ≤45° quadratic segments. */
function A(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
  const ring = (rxx: number, ryy: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 45))
    const st = ((a1 - a0) / n) * (Math.PI / 180)
    const pts: Pt[] = []
    for (let i = 0; i <= n; i++) {
      const t = (a0 * Math.PI) / 180 + i * st
      if (i > 0) {
        const m = t - st / 2, sc = 1 / Math.cos(st / 2)
        pts.push(P(cx + rxx * sc * Math.cos(m), cy + ryy * sc * Math.sin(m), false))
      }
      pts.push(P(cx + rxx * Math.cos(t), cy + ryy * Math.sin(t)))
    }
    return pts
  }
  const outer = ring(rx, ry), inner = ring(rx - S, ry - S * 0.95)
  if (Math.abs(a1 - a0) >= 360) return [orient(outer.slice(0, -1)), orient(inner.slice(0, -1), false)]
  return [orient([...outer, ...inner.reverse()])]
}

type Shape = Pt[][]
const G = (advance: number, ...parts: Shape[]): WGlyph => ({ advance, contours: parts.flat() })

const SHAPES: Record<string, WGlyph> = {
  ' ': { advance: 260 },
  A: G(640, D(100, 0, 320, 700), D(540, 0, 320, 700), R(190, 190, 450, 280)),
  B: G(600, R(70, 0, 162, 700), R(70, 0, 320, S), R(70, 350, 310, 350 + S), R(70, 700 - S, 300, 700), A(320, 220, 220, 220, -90, 90), A(300, 525, 190, 175, -90, 90)),
  C: G(620, A(340, 350, 280, 355, 40, 320)),
  D: G(640, R(70, 0, 162, 700), R(70, 0, 250, S), R(70, 700 - S, 250, 700), A(250, 350, 320, 350, -90, 90)),
  E: G(560, R(70, 0, 162, 700), R(70, 0, 500, S), R(70, 305, 440, 305 + S), R(70, 700 - S, 500, 700)),
  F: G(540, R(70, 0, 162, 700), R(70, 305, 430, 305 + S), R(70, 700 - S, 500, 700)),
  G: G(650, A(340, 350, 280, 355, 25, 335), R(360, 250, 620, 250 + S), R(528, 60, 620, 340)),
  H: G(640, R(70, 0, 162, 700), R(478, 0, 570, 700), R(70, 305, 570, 305 + S)),
  I: G(240, R(74, 0, 166, 700)),
  J: G(500, R(338, 250, 430, 700), A(235, 250, 195, 250, 180, 360)),
  K: G(600, R(70, 0, 162, 700), D(150, 300, 520, 700), D(270, 390, 545, 0)),
  L: G(520, R(70, 0, 162, 700), R(70, 0, 480, S)),
  M: G(760, R(70, 0, 162, 700), R(598, 0, 690, 700), D(118, 700, 380, 190), D(642, 700, 380, 190)),
  N: G(660, R(70, 0, 162, 700), R(498, 0, 590, 700), D(118, 700, 542, 0)),
  O: G(700, A(350, 350, 300, 360, 0, 360)),
  P: G(580, R(70, 0, 162, 700), R(70, 700 - S, 300, 700), R(70, 270, 300, 270 + S), A(300, 485, 215, 215, -90, 90)),
  Q: G(700, A(350, 350, 300, 360, 0, 360), D(420, 170, 600, -40)),
  R: G(600, R(70, 0, 162, 700), R(70, 700 - S, 300, 700), R(70, 270, 300, 270 + S), A(300, 485, 215, 215, -90, 90), D(320, 300, 550, 0)),
  S: G(560, A(280, 495, 210, 205, 20, 270), A(280, 190, 230, 190, -160, 90)),
  T: G(580, R(244, 0, 336, 700), R(30, 700 - S, 550, 700)),
  U: G(640, R(70, 250, 162, 700), R(478, 250, 570, 700), A(320, 250, 250, 250, 180, 360)),
  V: G(620, D(70, 700, 310, 0), D(550, 700, 310, 0)),
  W: G(860, D(50, 700, 230, 0), D(410, 700, 230, 0), D(450, 700, 630, 0), D(810, 700, 630, 0)),
  X: G(620, D(80, 0, 540, 700), D(540, 0, 80, 700)),
  Y: G(600, D(60, 700, 300, 330), D(540, 700, 300, 330), R(254, 0, 346, 370)),
  Z: G(560, R(50, 0, 510, S), R(50, 700 - S, 510, 700), D(100, S, 460, 700 - S)),
  '0': G(540, A(270, 350, 230, 360, 0, 360)),
  '1': G(380, R(170, 0, 262, 700), D(80, 560, 200, 700)),
  '2': G(540, A(270, 495, 210, 205, -35, 165), D(420, 380, 110, S), R(60, 0, 490, S)),
  '3': G(540, A(270, 500, 200, 200, -90, 150), A(270, 195, 230, 195, -150, 90)),
  '4': G(560, R(360, 0, 452, 700), R(40, 170, 520, 170 + S), D(390, 700, 95, 215)),
  '5': G(540, R(90, 700 - S, 480, 700), R(90, 340, 182, 700), R(90, 340, 270, 340 + 92), A(270, 216, 230, 216, -150, 90)),
  '6': G(540, A(280, 215, 230, 215, 0, 360), D(110, 215, 350, 700)),
  '7': G(540, R(50, 700 - S, 490, 700), D(445, 700 - S, 170, 0)),
  '8': G(560, A(280, 195, 230, 195, 0, 360), A(280, 505, 200, 195, 0, 360)),
  '9': G(540, A(260, 485, 230, 215, 0, 360), D(430, 485, 190, 0)),
  '.': G(240, R(74, 0, 166, S)),
  ',': G(240, R(74, 0, 166, S), D(140, 0, 90, -120)),
  ':': G(240, R(74, 0, 166, S), R(74, 400, 166, 400 + S)),
  '!': G(240, R(74, 0, 166, S), R(74, 200, 166, 700)),
  '-': G(400, R(60, 300, 340, 300 + S)),
  '?': G(520, A(260, 525, 190, 175, -90, 180), R(214, 200, 306, 350 + S), R(214, 0, 306, S)),
}

/** The demo font plus the text it is best shown with. */
export function demoFont(): Uint8Array {
  const glyphs: WGlyph[] = [{ advance: 560, contours: [...R(60, 0, 500, 700), orient([P(130, 70), P(430, 70), P(430, 630), P(130, 630)], false)] }]
  const cmap = new Map<number, number>()
  for (const [ch, g] of Object.entries(SHAPES)) {
    cmap.set(ch.charCodeAt(0), glyphs.length)
    if (/[A-Z]/.test(ch)) cmap.set(ch.toLowerCase().charCodeAt(0), glyphs.length)
    glyphs.push(g)
  }
  const gid = (c: string) => cmap.get(c.charCodeAt(0))!
  const dots = (base: string, w: number, l: number, r: number) => {
    cmap.set(base.charCodeAt(0), glyphs.length)
    cmap.set(base.toLowerCase().charCodeAt(0), glyphs.length)
    glyphs.push({ advance: w, components: [{ glyph: gid(base.normalize('NFD')[0]), dx: 0, dy: 0 }, { glyph: gid('.'), dx: l, dy: 780 }, { glyph: gid('.'), dx: r, dy: 780 }] })
  }
  dots('Ä', 640, 116, 290)
  dots('Ö', 700, 146, 320)
  dots('Ü', 640, 116, 290)
  return buildFont({ family: 'Toolbox Grotesk Demo', ascender: 900, descender: -200, xHeight: 700, capHeight: 700, glyphs, cmap, features: ['ccmp', 'liga', 'ss01'] })
}
