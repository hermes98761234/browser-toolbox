// Parametric folding-carton dielines (tuck-end boxes): panels, hinges, fold sequence, cut/fold lines.
// Flat coordinates in mm, x right, y up. The front panel is the fixed root.

export type Style = 'rte' | 'ste' | 'sleeve'
export type Dir = 'left' | 'right' | 'up' | 'down'
export interface Params { style: Style; W: number; D: number; H: number; glue: number; tuck: number; dust: number }
export interface Panel {
  id: string; name: string; poly: [number, number][]; parent: string | null
  dir: Dir; origin: [number, number] // hinge: child lies on the `dir` side of the hinge line through `origin`
  phase: [number, number]; layer: number; angle: number
}

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

export function validate(p: Params): string[] {
  const e: string[] = []
  if (!(p.W > 0 && p.D > 0 && p.H > 0)) e.push('Width, depth and height must be positive.')
  if (p.glue <= 0 || p.glue > p.H) e.push('Glue flap must be between 0 and the box height.')
  if (p.style !== 'sleeve' && (p.tuck <= 0 || p.tuck > p.H)) e.push('Tuck flap must be positive and not taller than the box.')
  if (p.style !== 'sleeve' && p.dust > p.W / 2 + 1e-9) e.push('Dust flaps longer than half the width would collide.')
  return e
}

export function buildDieline(p: Params): Panel[] {
  const { W, D, H, glue: g, tuck: t } = p
  const df = Math.max(5, Math.min(p.dust, W / 2))
  const x1 = D, x2 = D + W, x3 = 2 * D + W, x4 = 2 * D + 2 * W
  const out: Panel[] = [
    { id: 'front', name: 'Front', poly: rect(x1, 0, x2, H), parent: null, dir: 'right', origin: [x1, 0], phase: [0, 0], layer: 0, angle: 0 },
    { id: 'side1', name: 'Left side', poly: rect(0, 0, x1, H), parent: 'front', dir: 'left', origin: [x1, 0], phase: [0, 0.35], layer: 0, angle: 90 },
    { id: 'side2', name: 'Right side', poly: rect(x2, 0, x3, H), parent: 'front', dir: 'right', origin: [x2, 0], phase: [0, 0.35], layer: 0, angle: 90 },
    { id: 'back', name: 'Back', poly: rect(x3, 0, x4, H), parent: 'side2', dir: 'right', origin: [x3, 0], phase: [0.05, 0.4], layer: 0, angle: 90 },
    { id: 'glue', name: 'Glue flap', poly: [[x4, 0], [x4 + g, Math.min(g * 0.6, H * 0.15)], [x4 + g, H - Math.min(g * 0.6, H * 0.15)], [x4, H]], parent: 'back', dir: 'right', origin: [x4, 0], phase: [0.08, 0.42], layer: -1, angle: 90 },
  ]
  if (p.style === 'sleeve') return out
  const dust = (id: string, side: 'side1' | 'side2', xa: number, xb: number, top: boolean): Panel => {
    const y0 = top ? H : 0, s = top ? 1 : -1
    const c = Math.min(df * 0.35, (xb - xa) * 0.25)
    const poly: [number, number][] = top
      ? [[xa, y0], [xb, y0], [xb - c * 0.3, y0 + df], [xa + c, y0 + df * s]]
      : [[xa, y0], [xa + c, y0 - df], [xb - c * 0.3, y0 - df], [xb, y0]]
    return { id, name: `${top ? 'Top' : 'Bottom'} dust flap`, poly, parent: side, dir: top ? 'up' : 'down', origin: [xa, y0], phase: [0.42, 0.6], layer: -1, angle: 90 }
  }
  out.push(dust('dustT1', 'side1', 0, x1, true), dust('dustT2', 'side2', x2, x3, true), dust('dustB1', 'side1', 0, x1, false), dust('dustB2', 'side2', x2, x3, false))
  const closure = (top: boolean, onBack: boolean): Panel[] => {
    const [xa, xb] = onBack ? [x3, x4] : [x1, x2]
    const parent = onBack ? 'back' : 'front'
    const s = top ? 1 : -1, y0 = top ? H : 0, y1 = y0 + s * D, y2 = y1 + s * t
    const r = Math.min(t * 0.6, W * 0.2)
    const tuckPoly: [number, number][] = top
      ? [[xa, y1], [xb, y1], [xb, y2 - r], [xb - r, y2], [xa + r, y2], [xa, y2 - r]]
      : [[xa, y1], [xa, y2 + r], [xa + r, y2], [xb - r, y2], [xb, y2 + r], [xb, y1]]
    const k = top ? 'Top' : 'Bottom'
    return [
      { id: `close${k}`, name: `${k} closure`, poly: top ? rect(xa, y0, xb, y1) : rect(xa, y1, xb, y0), parent, dir: top ? 'up' : 'down', origin: [xa, y0], phase: [0.6, 0.82], layer: 0, angle: 90 },
      { id: `tuck${k}`, name: `${k} tuck flap`, poly: tuckPoly, parent: `close${k}`, dir: top ? 'up' : 'down', origin: [xa, y1], phase: [0.82, 1], layer: 0, angle: 90 },
    ]
  }
  out.push(...closure(true, true), ...closure(false, p.style === 'ste'))
  return out
}

export const easeFold = (t: number, [a, b]: [number, number]) => (b <= a ? 1 : Math.max(0, Math.min(1, (t - a) / (b - a))))

export function bbox(panels: Panel[]): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } {
  const xs = panels.flatMap((p) => p.poly.map((q) => q[0])), ys = panels.flatMap((p) => p.poly.map((q) => q[1]))
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

export function polyArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) / 2
}

/** Splits all panel edges into cut lines (outline) and fold lines (shared by two panels). */
export function cutFold(panels: Panel[]): { cut: [number, number, number, number][]; fold: [number, number, number, number][] } {
  const key = (a: [number, number], b: [number, number]) => {
    const r = (v: number) => Math.round(v * 100) / 100
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a]
    return `${r(p[0])},${r(p[1])},${r(q[0])},${r(q[1])}`
  }
  const count = new Map<string, { seg: [number, number, number, number]; n: number }>()
  for (const p of panels)
    for (let i = 0; i < p.poly.length; i++) {
      const a = p.poly[i], b = p.poly[(i + 1) % p.poly.length]
      const k = key(a, b)
      const e = count.get(k)
      if (e) e.n++
      else count.set(k, { seg: [a[0], a[1], b[0], b[1]], n: 1 })
    }
  const cut: [number, number, number, number][] = [], fold: [number, number, number, number][] = []
  for (const { seg, n } of count.values()) (n > 1 ? fold : cut).push(seg)
  return { cut, fold }
}

export function dielineSvg(panels: Panel[], p: Params, labels = true): string {
  const b = bbox(panels)
  const m = 10
  const { cut, fold } = cutFold(panels)
  const X = (x: number) => (x - b.x0 + m).toFixed(2), Y = (y: number) => (b.y1 - y + m).toFixed(2)
  const line = (s: number[], cls: string) => `<line class="${cls}" x1="${X(s[0])}" y1="${Y(s[1])}" x2="${X(s[2])}" y2="${Y(s[3])}"/>`
  const txt = labels ? panels.map((q) => {
    const cx = q.poly.reduce((a, v) => a + v[0], 0) / q.poly.length, cy = q.poly.reduce((a, v) => a + v[1], 0) / q.poly.length
    return `<text x="${X(cx)}" y="${Y(cy)}" font-size="${Math.max(3, Math.min(8, p.W / 10))}" text-anchor="middle" fill="#64748b" font-family="sans-serif">${q.name}</text>`
  }).join('') : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(b.w + 2 * m).toFixed(1)}mm" height="${(b.h + 2 * m).toFixed(1)}mm" viewBox="0 0 ${(b.w + 2 * m).toFixed(2)} ${(b.h + 2 * m).toFixed(2)}">
<style>.cut{stroke:#e11d48;stroke-width:0.35;fill:none}.fold{stroke:#2563eb;stroke-width:0.35;stroke-dasharray:3 2;fill:none}</style>
<title>${p.style.toUpperCase()} box ${p.W}×${p.D}×${p.H} mm dieline (red = cut, blue dashed = fold)</title>
${cut.map((s) => line(s, 'cut')).join('')}
${fold.map((s) => line(s, 'fold')).join('')}
${txt}
</svg>`
}
