// GIF89a encoder: median-cut palette, nearest-colour mapping with optional dithering,
// frame-difference optimisation (cropped, transparent unchanged pixels) and LZW compression.

export type Dither = 'none' | 'fs' | 'bayer'

/** Median-cut quantiser over a 5-bit-per-channel histogram. Returns RGB triplets (n ≤ maxColors). */
export function medianCut(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, step = 1): Uint8Array {
  const count = new Uint32Array(32768)
  const sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768)
  for (let i = 0; i < rgba.length; i += 4 * step) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    count[k]++
    sr[k] += r
    sg[k] += g
    sb[k] += b
  }
  const bins: number[] = []
  for (let k = 0; k < 32768; k++) if (count[k]) bins.push(k)
  if (!bins.length) return new Uint8Array([0, 0, 0])
  const ch = (k: number, c: number) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31)
  interface Box { bins: number[]; n: number; axis: number; range: number }
  const mk = (b: number[]): Box => {
    let n = 0
    const lo = [31, 31, 31], hi = [0, 0, 0]
    for (const k of b) {
      n += count[k]
      for (let c = 0; c < 3; c++) {
        const v = ch(k, c)
        if (v < lo[c]) lo[c] = v
        if (v > hi[c]) hi[c] = v
      }
    }
    // green is weighted up a little: the eye is most sensitive to it
    const r = [(hi[0] - lo[0]) * 1.0, (hi[1] - lo[1]) * 1.2, (hi[2] - lo[2]) * 0.8]
    const axis = r[1] >= r[0] && r[1] >= r[2] ? 1 : r[0] >= r[2] ? 0 : 2
    return { bins: b, n, axis, range: r[axis] }
  }
  const boxes: Box[] = [mk(bins)]
  while (boxes.length < maxColors) {
    let bi = -1, best = 0
    boxes.forEach((b, i) => {
      const score = b.bins.length > 1 ? b.range * Math.sqrt(b.n) : 0
      if (score > best) {
        best = score
        bi = i
      }
    })
    if (bi < 0) break
    const box = boxes[bi]
    const sorted = [...box.bins].sort((a, b) => ch(a, box.axis) - ch(b, box.axis))
    let acc = 0, cut = 1
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += count[sorted[i]]
      cut = i + 1
      if (acc >= box.n / 2) break
    }
    boxes.splice(bi, 1, mk(sorted.slice(0, cut)), mk(sorted.slice(cut)))
  }
  const out = new Uint8Array(boxes.length * 3)
  boxes.forEach((b, i) => {
    let r = 0, g = 0, bl = 0
    for (const k of b.bins) {
      r += sr[k]
      g += sg[k]
      bl += sb[k]
    }
    out[i * 3] = Math.round(r / b.n)
    out[i * 3 + 1] = Math.round(g / b.n)
    out[i * 3 + 2] = Math.round(bl / b.n)
  })
  return out
}

/** Nearest palette entry with an 18-bit lookup cache. */
export function makeMatcher(pal: Uint8Array): (r: number, g: number, b: number) => number {
  const n = pal.length / 3
  const cache = new Int16Array(1 << 18).fill(-1)
  return (r, g, b) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0
    g = g < 0 ? 0 : g > 255 ? 255 : g | 0
    b = b < 0 ? 0 : b > 255 ? 255 : b | 0
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    const c = cache[key]
    if (c >= 0) return c
    let best = 0, bd = Infinity
    for (let i = 0; i < n; i++) {
      const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
      if (d < bd) {
        bd = d
        best = i
      }
    }
    cache[key] = best
    return best
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Maps RGBA pixels to palette indices. */
export function mapPixels(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, match: (r: number, g: number, b: number) => number, pal: Uint8Array, dither: Dither, strength = 1): Uint8Array {
  const out = new Uint8Array(w * h)
  if (dither === 'fs') {
    const buf = new Float32Array(w * h * 3)
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      buf[j] = rgba[i]
      buf[j + 1] = rgba[i + 1]
      buf[j + 2] = rgba[i + 2]
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x, j = p * 3
        const idx = match(buf[j], buf[j + 1], buf[j + 2])
        out[p] = idx
        for (let c = 0; c < 3; c++) {
          const e = (buf[j + c] - pal[idx * 3 + c]) * strength
          if (x + 1 < w) buf[j + 3 + c] += (e * 7) / 16
          if (y + 1 < h) {
            if (x > 0) buf[j + (w - 1) * 3 + c] += (e * 3) / 16
            buf[j + w * 3 + c] += (e * 5) / 16
            if (x + 1 < w) buf[j + (w + 1) * 3 + c] += e / 16
          }
        }
      }
    return out
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4
      const t = dither === 'bayer' ? (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 32 * strength : 0
      out[p] = match(rgba[i] + t, rgba[i + 1] + t, rgba[i + 2] + t)
    }
  return out
}

/** GIF-flavoured LZW (variable code size, LSB-first, max 12 bits). */
export function lzwEncode(idx: Uint8Array, minCode: number): Uint8Array {
  const clear = 1 << minCode, eoi = clear + 1
  const bytes: number[] = []
  let cur = 0, nbits = 0
  let size = minCode + 1, next = eoi + 1
  const emit = (code: number) => {
    cur |= code << nbits
    nbits += size
    while (nbits >= 8) {
      bytes.push(cur & 255)
      cur >>>= 8
      nbits -= 8
    }
  }
  let dict = new Map<number, number>()
  emit(clear)
  if (!idx.length) {
    emit(eoi)
    if (nbits > 0) bytes.push(cur & 255)
    return new Uint8Array(bytes)
  }
  let prefix = idx[0]
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i]
    const key = (prefix << 8) | k
    const hit = dict.get(key)
    if (hit !== undefined) {
      prefix = hit
      continue
    }
    emit(prefix)
    if (next === 4096) {
      emit(clear)
      next = eoi + 1
      size = minCode + 1
      dict = new Map()
    } else {
      if (next >= 1 << size) size++
      dict.set(key, next++)
    }
    prefix = k
  }
  emit(prefix)
  emit(eoi)
  if (nbits > 0) bytes.push(cur & 255)
  return new Uint8Array(bytes)
}

/** Reference decoder (used by tests to round-trip the encoder). */
export function lzwDecode(data: Uint8Array, minCode: number, outLen: number): Uint8Array {
  const clear = 1 << minCode, eoi = clear + 1
  const out = new Uint8Array(outLen)
  let op = 0, pos = 0, cur = 0, nbits = 0, size = minCode + 1
  let table: number[][] = []
  const reset = () => {
    table = Array.from({ length: clear + 2 }, (_, i) => [i])
    size = minCode + 1
  }
  reset()
  let prev: number[] | null = null
  for (;;) {
    while (nbits < size && pos < data.length) {
      cur |= data[pos++] << nbits
      nbits += 8
    }
    if (nbits < size) break
    const code = cur & ((1 << size) - 1)
    cur >>>= size
    nbits -= size
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === eoi) break
    let entry: number[]
    if (code < table.length) entry = table[code]
    else if (prev) entry = [...prev, prev[0]]
    else break
    for (const v of entry) if (op < outLen) out[op++] = v
    if (prev && table.length < 4096) table.push([...prev, entry[0]])
    if (table.length === 1 << size && size < 12) size++
    prev = entry
  }
  return out
}

export interface GifFrame { x: number; y: number; w: number; h: number; idx: Uint8Array; delayCs: number; transparent: number; palette?: Uint8Array }

const bitsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))))

function padPalette(p: Uint8Array): [Uint8Array, number] {
  const bits = bitsFor(p.length / 3)
  const out = new Uint8Array(3 << bits)
  out.set(p.subarray(0, Math.min(p.length, out.length)))
  return [out, bits]
}

/** Assembles the GIF89a byte stream. */
export function writeGif(w: number, h: number, frames: GifFrame[], global: Uint8Array | null, loop: number): Uint8Array {
  const parts: Uint8Array[] = []
  const u8 = (...a: number[]) => parts.push(new Uint8Array(a))
  const u16 = (v: number) => [v & 255, (v >> 8) & 255]
  parts.push(new TextEncoder().encode('GIF89a'))
  if (global) {
    const [gp, bits] = padPalette(global)
    u8(...u16(w), ...u16(h), 0x80 | 0x70 | (bits - 1), 0, 0)
    parts.push(gp)
  } else u8(...u16(w), ...u16(h), 0x70, 0, 0)
  if (loop >= 0) u8(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, ...u16(loop), 0)
  for (const f of frames) {
    const hasT = f.transparent >= 0
    u8(0x21, 0xf9, 4, (1 << 2) | (hasT ? 1 : 0), ...u16(f.delayCs), hasT ? f.transparent : 0, 0)
    let minCode: number
    if (f.palette) {
      const [lp, bits] = padPalette(f.palette)
      u8(0x2c, ...u16(f.x), ...u16(f.y), ...u16(f.w), ...u16(f.h), 0x80 | (bits - 1))
      parts.push(lp)
      minCode = Math.max(2, bits)
    } else {
      u8(0x2c, ...u16(f.x), ...u16(f.y), ...u16(f.w), ...u16(f.h), 0)
      minCode = Math.max(2, bitsFor((global?.length ?? 6) / 3))
    }
    u8(minCode)
    const data = lzwEncode(f.idx, minCode)
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i)
      u8(n)
      parts.push(data.subarray(i, i + n))
    }
    u8(0)
  }
  u8(0x3b)
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export interface EncodeOpts { colors: number; dither: Dither; strength: number; optimize: boolean; localPalettes: boolean; loop: number }

/** Full pipeline: RGBA frames → GIF bytes. `onProgress` gets 0..1. */
export function encodeGif(w: number, h: number, frames: Uint8ClampedArray[], delaysCs: number[], o: EncodeOpts, onProgress?: (p: number) => void): { bytes: Uint8Array; colors: number; frames: number } {
  const ncol = Math.max(2, Math.min(256, Math.round(o.colors)))
  const useT = o.optimize && !o.localPalettes
  const reserve = useT ? 1 : 0
  let global: Uint8Array | null = null
  if (!o.localPalettes) {
    // sample all frames together for one stable palette (no flicker between frames)
    const per = Math.max(1, Math.floor(frames.length / 24))
    const pick = frames.filter((_, i) => i % per === 0)
    const merged = new Uint8ClampedArray(pick.reduce((a, f) => a + f.length, 0))
    let off = 0
    for (const f of pick) {
      merged.set(f, off)
      off += f.length
    }
    const step = Math.max(1, Math.floor(merged.length / 4 / 400000))
    global = medianCut(merged, ncol - reserve, step)
  }
  const match = global ? makeMatcher(global) : null
  const TI = global ? global.length / 3 : -1 // transparent index right after the real colours
  if (useT && global) {
    const g2 = new Uint8Array(global.length + 3)
    g2.set(global)
    global = g2
  }
  const out: GifFrame[] = []
  let prev: Uint8Array | null = null
  let maxColors = 0
  frames.forEach((rgba, fi) => {
    let pal = global
    let m = match
    if (!pal || !m) {
      pal = medianCut(rgba, ncol, Math.max(1, Math.floor((w * h) / 200000)))
      m = makeMatcher(pal)
    }
    maxColors = Math.max(maxColors, pal.length / 3)
    const idx = mapPixels(rgba, w, h, m, pal, o.dither, o.strength)
    if (useT && prev) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (idx[y * w + x] !== prev[y * w + x]) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
      if (x1 < 0) {
        out[out.length - 1].delayCs += delaysCs[fi] // identical frame: just extend the previous one
      } else {
        const cw = x1 - x0 + 1, chh = y1 - y0 + 1
        const sub = new Uint8Array(cw * chh)
        for (let y = 0; y < chh; y++)
          for (let x = 0; x < cw; x++) {
            const p = (y + y0) * w + x + x0
            sub[y * cw + x] = idx[p] === prev[p] ? TI : idx[p]
          }
        out.push({ x: x0, y: y0, w: cw, h: chh, idx: sub, delayCs: delaysCs[fi], transparent: TI })
      }
    } else out.push({ x: 0, y: 0, w, h, idx, delayCs: delaysCs[fi], transparent: -1, palette: o.localPalettes ? pal : undefined })
    prev = idx
    onProgress?.((fi + 1) / frames.length)
  })
  return { bytes: writeGif(w, h, out, global, o.loop), colors: maxColors - reserve, frames: out.length }
}
