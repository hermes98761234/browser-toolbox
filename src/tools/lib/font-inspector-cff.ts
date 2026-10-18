// CFF (Compact Font Format, version 1) outline reader written from Adobe Technical Notes #5176 (CFF)
// and #5177 (Type 2 charstrings). Supports name-keyed and CID-keyed fonts, local/global subroutines,
// hint masks and the flex operators. Output is an SVG path in font units (y up) plus the points.
import type { Outline, Pt } from './font-inspector'

export interface Index { count: number; items: Uint8Array[]; end: number }

export function readIndex(b: Uint8Array, at: number): Index {
  const count = (b[at] << 8) | b[at + 1]
  if (count === 0) return { count, items: [], end: at + 2 }
  const os = b[at + 2]
  const off = (i: number) => {
    let v = 0
    for (let k = 0; k < os; k++) v = v * 256 + b[at + 3 + i * os + k]
    return v
  }
  const base = at + 3 + (count + 1) * os - 1
  const items: Uint8Array[] = []
  for (let i = 0; i < count; i++) items.push(b.subarray(base + off(i), base + off(i + 1)))
  return { count, items, end: base + off(count) }
}

/** DICT data → operator → operands (two-byte operators are 1200 + second byte). */
export function readDict(b: Uint8Array): Map<number, number[]> {
  const out = new Map<number, number[]>()
  let ops: number[] = []
  let i = 0
  while (i < b.length) {
    const v = b[i]
    if (v <= 21) {
      let op = v
      i++
      if (v === 12) op = 1200 + b[i++]
      out.set(op, ops)
      ops = []
    } else if (v === 28) {
      ops.push(((b[i + 1] << 24) | (b[i + 2] << 16)) >> 16)
      i += 3
    } else if (v === 29) {
      ops.push((b[i + 1] << 24) | (b[i + 2] << 16) | (b[i + 3] << 8) | b[i + 4])
      i += 5
    } else if (v === 30) {
      let s = ''
      i++
      for (let done = false; !done && i < b.length; i++) {
        for (const n of [b[i] >> 4, b[i] & 15]) {
          if (n === 15) { done = true; break }
          s += n < 10 ? String(n) : n === 10 ? '.' : n === 11 ? 'E' : n === 12 ? 'E-' : n === 14 ? '-' : ''
        }
      }
      ops.push(parseFloat(s) || 0)
    } else if (v >= 32 && v <= 246) {
      ops.push(v - 139)
      i++
    } else if (v >= 247 && v <= 250) {
      ops.push((v - 247) * 256 + b[i + 1] + 108)
      i += 2
    } else if (v >= 251 && v <= 254) {
      ops.push(-(v - 251) * 256 - b[i + 1] - 108)
      i += 2
    } else i++
  }
  return out
}

const bias = (n: number) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768)

interface Priv { subrs: Uint8Array[] }

export interface Cff {
  numGlyphs: number
  cid: boolean
  glyph: (gid: number) => Outline | null
}

function readPrivate(b: Uint8Array, top: Map<number, number[]>): Priv {
  const p = top.get(18)
  if (!p || p.length < 2) return { subrs: [] }
  const [size, off] = p
  const d = readDict(b.subarray(off, off + size))
  const s = d.get(19)
  return { subrs: s ? readIndex(b, off + s[0]).items : [] }
}

export function parseCff(b: Uint8Array): Cff {
  if (b[0] !== 1) throw new Error(`CFF version ${b[0]} is not supported`)
  const names = readIndex(b, b[2])
  const tops = readIndex(b, names.end)
  const strings = readIndex(b, tops.end)
  const gsubrs = readIndex(b, strings.end).items
  const top = readDict(tops.items[0])
  const cs = top.get(17)
  if (!cs) throw new Error('CFF has no CharStrings')
  const charstrings = readIndex(b, cs[0]).items
  const cid = top.has(1230)
  let privFor: (gid: number) => Priv
  if (cid && top.get(1236) && top.get(1237)) {
    const fds = readIndex(b, top.get(1236)![0]).items.map((fd) => readPrivate(b, readDict(fd)))
    const at = top.get(1237)![0]
    const fmt = b[at]
    const sel = new Uint8Array(charstrings.length)
    if (fmt === 0) sel.set(b.subarray(at + 1, at + 1 + charstrings.length))
    else if (fmt === 3) {
      const n = (b[at + 1] << 8) | b[at + 2]
      for (let r = 0; r < n; r++) {
        const p = at + 3 + r * 3
        const first = (b[p] << 8) | b[p + 1], fd = b[p + 2], next = (b[p + 3] << 8) | b[p + 4]
        sel.fill(fd, first, Math.min(next, sel.length))
      }
    }
    privFor = (g) => fds[sel[g]] ?? { subrs: [] }
  } else {
    const p = readPrivate(b, top)
    privFor = () => p
  }
  return {
    numGlyphs: charstrings.length,
    cid,
    glyph: (gid) => (gid >= 0 && gid < charstrings.length ? runCharstring(charstrings[gid], gsubrs, privFor(gid).subrs) : null),
  }
}

/** Interprets one Type 2 charstring. */
export function runCharstring(code: Uint8Array, gsubrs: Uint8Array[], subrs: Uint8Array[]): Outline {
  const contours: Pt[][] = []
  const d: string[] = []
  let cur: Pt[] | null = null
  let x = 0, y = 0, stems = 0, haveWidth = false, done = false, depth = 0
  let st: number[] = []
  const f = (n: number) => +n.toFixed(2)
  const close = () => {
    if (cur && cur.length) d.push('Z')
    cur = null
  }
  const moveTo = (dx: number, dy: number) => {
    close()
    x += dx
    y += dy
    cur = [{ x, y, on: true }]
    contours.push(cur)
    d.push(`M${f(x)} ${f(y)}`)
  }
  const ensure = () => {
    if (!cur) {
      cur = [{ x, y, on: true }]
      contours.push(cur)
      d.push(`M${f(x)} ${f(y)}`)
    }
    return cur
  }
  const lineTo = (dx: number, dy: number) => {
    const c = ensure()
    x += dx
    y += dy
    c.push({ x, y, on: true })
    d.push(`L${f(x)} ${f(y)}`)
  }
  const curveTo = (a: number, b: number, c2: number, e: number, g: number, h: number) => {
    const c = ensure()
    const x1 = x + a, y1 = y + b, x2 = x1 + c2, y2 = y1 + e
    x = x2 + g
    y = y2 + h
    c.push({ x: x1, y: y1, on: false }, { x: x2, y: y2, on: false }, { x, y, on: true })
    d.push(`C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x)} ${f(y)}`)
  }
  const width = (even: boolean) => {
    if (!haveWidth && st.length % 2 === (even ? 1 : 0)) st.shift()
    haveWidth = true
  }
  const run = (c: Uint8Array) => {
    if (++depth > 12) throw new Error('Subroutine nesting too deep')
    let i = 0
    while (i < c.length && !done) {
      const v = c[i++]
      if (v >= 32) {
        if (v <= 246) st.push(v - 139)
        else if (v <= 250) st.push((v - 247) * 256 + c[i++] + 108)
        else if (v <= 254) st.push(-(v - 251) * 256 - c[i++] - 108)
        else {
          st.push(((c[i] << 24) | (c[i + 1] << 16) | (c[i + 2] << 8) | c[i + 3]) / 65536)
          i += 4
        }
        continue
      }
      if (v === 28) {
        st.push(((c[i] << 24) | (c[i + 1] << 16)) >> 16)
        i += 2
        continue
      }
      switch (v) {
        case 1: case 3: case 18: case 23:
          width(true)
          stems += st.length >> 1
          st = []
          break
        case 19: case 20:
          width(true)
          stems += st.length >> 1
          st = []
          i += (stems + 7) >> 3
          break
        case 21:
          width(true)
          moveTo(st[0] ?? 0, st[1] ?? 0)
          st = []
          break
        case 22:
          width(false)
          moveTo(st[0] ?? 0, 0)
          st = []
          break
        case 4:
          width(false)
          moveTo(0, st[0] ?? 0)
          st = []
          break
        case 5:
          for (let k = 0; k + 1 < st.length; k += 2) lineTo(st[k], st[k + 1])
          st = []
          break
        case 6: case 7: {
          let h = v === 6
          for (const a of st) {
            if (h) lineTo(a, 0)
            else lineTo(0, a)
            h = !h
          }
          st = []
          break
        }
        case 8:
          for (let k = 0; k + 5 < st.length; k += 6) curveTo(st[k], st[k + 1], st[k + 2], st[k + 3], st[k + 4], st[k + 5])
          st = []
          break
        case 24: {
          let k = 0
          for (; k + 7 < st.length; k += 6) curveTo(st[k], st[k + 1], st[k + 2], st[k + 3], st[k + 4], st[k + 5])
          lineTo(st[k], st[k + 1])
          st = []
          break
        }
        case 25: {
          let k = 0
          for (; k + 7 < st.length; k += 2) lineTo(st[k], st[k + 1])
          curveTo(st[k], st[k + 1], st[k + 2], st[k + 3], st[k + 4], st[k + 5])
          st = []
          break
        }
        case 26: {
          let k = 0, dx1 = 0
          if (st.length % 2) dx1 = st[k++]
          for (; k + 3 < st.length; k += 4) {
            curveTo(dx1, st[k], st[k + 1], st[k + 2], 0, st[k + 3])
            dx1 = 0
          }
          st = []
          break
        }
        case 27: {
          let k = 0, dy1 = 0
          if (st.length % 2) dy1 = st[k++]
          for (; k + 3 < st.length; k += 4) {
            curveTo(st[k], dy1, st[k + 1], st[k + 2], st[k + 3], 0)
            dy1 = 0
          }
          st = []
          break
        }
        case 30: case 31: {
          let h = v === 31
          let k = 0
          while (k + 3 < st.length) {
            const last = st.length - k === 5 ? st[k + 4] : 0
            if (h) curveTo(st[k], 0, st[k + 1], st[k + 2], last, st[k + 3])
            else curveTo(0, st[k], st[k + 1], st[k + 2], st[k + 3], last)
            k += 4
            h = !h
          }
          st = []
          break
        }
        case 10: case 29: {
          const set = v === 10 ? subrs : gsubrs
          const n = (st.pop() ?? 0) + bias(set.length)
          if (set[n]) run(set[n])
          break
        }
        case 11:
          depth--
          return
        case 14:
          width(true)
          close()
          done = true
          break
        case 12: {
          const e = c[i++]
          const s = st
          if (e === 34) {
            curveTo(s[0], 0, s[1], s[2], s[3], 0)
            curveTo(s[4], 0, s[5], -s[2], s[6], 0)
          } else if (e === 35) {
            curveTo(s[0], s[1], s[2], s[3], s[4], s[5])
            curveTo(s[6], s[7], s[8], s[9], s[10], s[11])
          } else if (e === 36) {
            curveTo(s[0], s[1], s[2], s[3], s[4], 0)
            curveTo(s[5], 0, s[6], s[7], s[8], -(s[1] + s[3] + s[7]))
          } else if (e === 37) {
            let dx = 0, dy = 0
            for (let k = 0; k < 10; k += 2) { dx += s[k]; dy += s[k + 1] }
            curveTo(s[0], s[1], s[2], s[3], s[4], s[5])
            if (Math.abs(dx) > Math.abs(dy)) curveTo(s[6], s[7], s[8], s[9], s[10], -dy)
            else curveTo(s[6], s[7], s[8], s[9], -dx, s[10])
          }
          st = []
          break
        }
        default:
          st = []
      }
    }
    depth--
  }
  run(code)
  close()
  const pts = contours.flat()
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  return {
    contours,
    composite: [],
    d: d.join(''),
    xMin: pts.length ? Math.min(...xs) : 0,
    yMin: pts.length ? Math.min(...ys) : 0,
    xMax: pts.length ? Math.max(...xs) : 0,
    yMax: pts.length ? Math.max(...ys) : 0,
  }
}
