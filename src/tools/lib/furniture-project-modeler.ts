// Parametric furniture → parts (3D boxes in mm) + cut list.

export type Kind = 'shelf' | 'table' | 'box'
export type Joint = 'butt' | 'dado' | 'dowel' | 'mortise' | 'rabbet'

export interface Params {
  kind: Kind
  w: number; h: number; d: number; t: number
  shelves: number; back: boolean; doors: number
  legs: number; top: number; apron: number; overhang: number
  joint: Joint
}

export interface Part {
  name: string
  /** box size along x (width), y (height), z (depth), mm */
  size: [number, number, number]
  /** centre, mm; y = 0 is the floor */
  pos: [number, number, number]
  /** explode direction */
  dir: [number, number, number]
  role: 'panel' | 'solid' | 'back'
}

export const DADO = (t: number) => Math.round(t / 3) // groove depth ≈ ⅓ of board thickness
export const TENON = 25 // tenon length per end, mm
export const BACK_T = 6

export function buildParts(p: Params): Part[] {
  const { w, h, d, t } = p
  const parts: Part[] = []
  const add = (name: string, size: [number, number, number], pos: [number, number, number], dir: [number, number, number], role: Part['role'] = 'panel') => parts.push({ name, size, pos, dir, role })
  if (p.kind === 'shelf' || p.kind === 'box') {
    const isBox = p.kind === 'box'
    const inner = w - 2 * t
    const groove = p.joint === 'dado' || p.joint === 'rabbet' ? DADO(t) : 0
    const backInset = p.back ? (p.joint === 'rabbet' ? 0 : BACK_T) : 0
    const depth = isBox ? d - 2 * t : d - backInset
    const zc = isBox ? 0 : backInset / 2
    add('Side', [t, h, d], [-(w - t) / 2, h / 2, 0], [-1, 0, 0])
    add('Side', [t, h, d], [(w - t) / 2, h / 2, 0], [1, 0, 0])
    if (isBox) {
      add('Front / back', [inner + 2 * groove, h, t], [0, h / 2, (d - t) / 2], [0, 0, 1])
      add('Front / back', [inner + 2 * groove, h, t], [0, h / 2, -(d - t) / 2], [0, 0, -1])
      const bt = p.back ? BACK_T : t
      add('Bottom', [inner + 2 * groove, bt, depth + 2 * groove], [0, bt / 2 + (groove ? 8 : 0), 0], [0, -1, 0], p.back ? 'back' : 'panel')
      return parts
    }
    add('Top', [inner + 2 * groove, t, depth], [0, h - t / 2, zc], [0, 1, 0])
    add('Bottom', [inner + 2 * groove, t, depth], [0, t / 2 + 60, zc], [0, -1, 0])
    add('Kick plate', [inner, 60, t], [0, 30, (d - t) / 2 - 20], [0, -1, 1])
    const n = Math.max(0, Math.floor(p.shelves))
    const y0 = 60 + t, y1 = h - t
    for (let i = 1; i <= n; i++) add('Shelf', [inner + 2 * groove, t, depth - 10], [0, y0 + ((y1 - y0) * i) / (n + 1), zc + 5], [0, 0, 1])
    if (p.back) {
      if (p.joint === 'rabbet') add('Back panel', [inner + 2 * DADO(t), h - 60, BACK_T], [0, 60 + (h - 60) / 2, -(d - BACK_T) / 2], [0, 0, -1], 'back')
      else add('Back panel', [w, h - 60, BACK_T], [0, 60 + (h - 60) / 2, -(d + BACK_T) / 2], [0, 0, -1], 'back')
    }
    const doors = Math.max(0, Math.floor(p.doors))
    const gap = 3
    for (let i = 0; i < doors; i++) {
      const dw = (w - gap * (doors + 1)) / doors
      add('Door', [dw, h - 60 - 2 * gap, t], [-w / 2 + gap + dw / 2 + i * (dw + gap), 60 + (h - 60) / 2, d / 2 + t / 2 + 1], [0, 0, 1])
    }
    return parts
  }
  // table / desk
  const L = p.legs, tt = p.top, oh = p.overhang, ah = p.apron
  const legH = h - tt
  const tenon = p.joint === 'mortise' ? TENON : 0
  add('Top', [w, tt, d], [0, h - tt / 2, 0], [0, 1, 0], 'solid')
  const lx = w / 2 - oh - L / 2, lz = d / 2 - oh - L / 2
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add('Leg', [L, legH, L], [sx * lx, legH / 2, sz * lz], [sx, -0.3, sz], 'solid')
  const longL = w - 2 * oh - 2 * L, shortL = d - 2 * oh - 2 * L
  const ay = legH - ah / 2, at = Math.max(18, Math.round(L / 3))
  for (const sz of [-1, 1]) add('Long apron', [longL + 2 * tenon, ah, at], [0, ay, sz * (lz + L / 2 - at / 2 - 8)], [0, 0.4, sz * 1.2], 'solid')
  for (const sx of [-1, 1]) add('Short apron', [at, ah, shortL + 2 * tenon], [sx * (lx + L / 2 - at / 2 - 8), ay, 0], [sx * 1.2, 0.4, 0], 'solid')
  return parts
}

export interface CutRow { name: string; qty: number; length: number; width: number; thick: number; role: Part['role'] }

/** Groups identical parts; length = longest dimension, width = middle, thickness = smallest. */
export function cutList(parts: Part[]): CutRow[] {
  const rows: CutRow[] = []
  for (const p of parts) {
    const [thick, width, length] = [...p.size].map((v) => Math.round(v * 10) / 10).sort((a, b) => a - b)
    const hit = rows.find((r) => r.name === p.name && r.length === length && r.width === width && r.thick === thick)
    if (hit) hit.qty++
    else rows.push({ name: p.name, qty: 1, length, width, thick, role: p.role })
  }
  return rows
}

/** Board feet: (T in × W in × L in) / 144. */
export const boardFeet = (lmm: number, wmm: number, tmm: number) => ((lmm / 25.4) * (wmm / 25.4) * (tmm / 25.4)) / 144

export function totals(rows: CutRow[]) {
  let area = 0, vol = 0, bf = 0, edge = 0
  for (const r of rows) {
    area += (r.length * r.width * r.qty) / 1e6
    vol += (r.length * r.width * r.thick * r.qty) / 1e9
    bf += boardFeet(r.length, r.width, r.thick) * r.qty
    if (r.role === 'panel') edge += (r.length * r.qty) / 1000 // front edge banding
  }
  return { area, vol, bf, edge }
}
