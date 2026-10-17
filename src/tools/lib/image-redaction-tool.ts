// Pixel-destroying redaction on RGBA buffers, plus metadata detection for the source file.

export type Mode = 'solid' | 'pixelate' | 'blur'
export interface Rect { x: number; y: number; w: number; h: number }
export interface Region extends Rect { id: string; mode: Mode; color: string; block: number; source?: 'face' | 'manual' }
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

/** Normalises a drag (any direction) to an integer rectangle clipped to the image. */
export function normRect(x0: number, y0: number, x1: number, y1: number, W: number, H: number, pad = 0): Rect {
  const l = Math.max(0, Math.floor(Math.min(x0, x1) - pad)), t = Math.max(0, Math.floor(Math.min(y0, y1) - pad))
  const r = Math.min(W, Math.ceil(Math.max(x0, x1) + pad)), b = Math.min(H, Math.ceil(Math.max(y0, y1) + pad))
  return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
}

/** Overwrites every pixel of the rectangle with an opaque colour. */
export function fillSolid(p: Pixels, r: Rect, rgb: [number, number, number]) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const o = (y * p.width + x) * 4
      p.data[o] = rgb[0]
      p.data[o + 1] = rgb[1]
      p.data[o + 2] = rgb[2]
      p.data[o + 3] = 255
    }
}

/** Replaces each block × block cell by its mean colour (blocks aligned to the region's corner). */
export function pixelate(p: Pixels, r: Rect, block: number) {
  const b = Math.max(2, Math.round(block))
  for (let by = r.y; by < r.y + r.h; by += b)
    for (let bx = r.x; bx < r.x + r.w; bx += b) {
      const ex = Math.min(bx + b, r.x + r.w), ey = Math.min(by + b, r.y + r.h)
      let R = 0, G = 0, B = 0, n = 0
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const o = (y * p.width + x) * 4
          R += p.data[o]
          G += p.data[o + 1]
          B += p.data[o + 2]
          n++
        }
      const c = [Math.round(R / n), Math.round(G / n), Math.round(B / n)]
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const o = (y * p.width + x) * 4
          p.data[o] = c[0]
          p.data[o + 1] = c[1]
          p.data[o + 2] = c[2]
          p.data[o + 3] = 255
        }
    }
}

/**
 * Heavy blur that cannot be undone: 3 box-blur passes of radius `radius`, reading only pixels inside the region,
 * then coarse colour quantisation and added noise so fine detail is destroyed rather than smoothed.
 */
export function destructiveBlur(p: Pixels, r: Rect, radius: number, seed = 1) {
  const rad = Math.max(1, Math.round(radius))
  const w = r.w, h = r.h
  if (!w || !h) return
  let buf = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((r.y + y) * p.width + r.x + x) * 4
      buf.set([p.data[o], p.data[o + 1], p.data[o + 2]], (y * w + x) * 3)
    }
  const pass = (src: Float32Array, horiz: boolean) => {
    const out = new Float32Array(src.length)
    const [len, lines] = horiz ? [w, h] : [h, w]
    for (let l = 0; l < lines; l++)
      for (let c = 0; c < 3; c++) {
        let acc = 0, cnt = 0
        const at = (i: number) => (horiz ? (l * w + i) * 3 + c : (i * w + l) * 3 + c)
        for (let i = 0; i <= Math.min(rad, len - 1); i++) {
          acc += src[at(i)]
          cnt++
        }
        for (let i = 0; i < len; i++) {
          out[at(i)] = acc / cnt
          const add = i + rad + 1, rem = i - rad
          if (add < len) {
            acc += src[at(add)]
            cnt++
          }
          if (rem >= 0) {
            acc -= src[at(rem)]
            cnt--
          }
        }
      }
    return out
  }
  for (let k = 0; k < 3; k++) buf = pass(pass(buf, true), false)
  let s = seed >>> 0 || 1
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((r.y + y) * p.width + r.x + x) * 4
      for (let c = 0; c < 3; c++) p.data[o + c] = Math.max(0, Math.min(255, Math.round(buf[(y * w + x) * 3 + c] / 16) * 16 + (rnd() - 0.5) * 12))
      p.data[o + 3] = 255
    }
}

export function applyRegion(p: Pixels, reg: Region) {
  const r = normRect(reg.x, reg.y, reg.x + reg.w, reg.y + reg.h, p.width, p.height)
  if (!r.w || !r.h) return
  if (reg.mode === 'solid') fillSolid(p, r, hexToRgb(reg.color))
  else if (reg.mode === 'pixelate') pixelate(p, r, reg.block)
  else destructiveBlur(p, r, reg.block, r.x * 31 + r.y)
}

/** Number of distinct colours inside a rectangle (1 = fully flattened). */
export function distinctColors(p: Pixels, r: Rect): number {
  const set = new Set<number>()
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const o = (y * p.width + x) * 4
      set.add((p.data[o] << 16) | (p.data[o + 1] << 8) | p.data[o + 2])
    }
  return set.size
}

export interface MetaReport { format: string; exif: boolean; gps: boolean; xmp: boolean; iptc: boolean; icc: boolean; text: boolean }

/** Scans file bytes for metadata blocks that a re-encode would drop. */
export function scanMetadata(b: Uint8Array): MetaReport {
  const r: MetaReport = { format: 'unknown', exif: false, gps: false, xmp: false, iptc: false, icc: false, text: false }
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  if (b[0] === 0xff && b[1] === 0xd8) {
    r.format = 'JPEG'
    let o = 2
    while (o + 4 < b.length && b[o] === 0xff) {
      const m = b[o + 1]
      if (m === 0xda || m === 0xd9) break
      const len = (b[o + 2] << 8) | b[o + 3]
      if (m === 0xe1 && ascii(o + 4, 4) === 'Exif') {
        r.exif = true
        // GPS IFD pointer tag 0x8825 in either byte order
        const seg = b.subarray(o + 4, o + 2 + len)
        for (let i = 0; i + 1 < seg.length; i++) if ((seg[i] === 0x88 && seg[i + 1] === 0x25) || (seg[i] === 0x25 && seg[i + 1] === 0x88)) r.gps = true
      }
      if (m === 0xe1 && ascii(o + 4, 28).startsWith('http://ns.adobe.com/xap')) r.xmp = true
      if (m === 0xed) r.iptc = true
      if (m === 0xe2 && ascii(o + 4, 11) === 'ICC_PROFILE') r.icc = true
      if (m === 0xfe) r.text = true
      o += 2 + len
    }
  } else if (b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    r.format = 'PNG'
    let o = 8
    while (o + 8 <= b.length) {
      const len = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
      const type = ascii(o + 4, 4)
      if (type === 'eXIf') r.exif = true
      if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        r.text = true
        if (ascii(o + 8, 17).startsWith('XML:com.adobe.xmp')) r.xmp = true
      }
      if (type === 'iCCP') r.icc = true
      if (type === 'IEND') break
      o += 12 + len
    }
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    r.format = 'WebP'
    const s = ascii(12, Math.min(b.length - 12, 4096))
    r.exif = s.includes('EXIF')
    r.xmp = s.includes('XMP ')
    r.icc = s.includes('ICCP')
  }
  return r
}
