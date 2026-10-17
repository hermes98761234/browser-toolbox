// Pure helpers for the PDF splitter: page-range parsing, split plans and a tiny ZIP writer.

export interface Part {
  name: string
  pages: number[] // 1-based page numbers
}

/**
 * Parses "1-3, 5, 8-" style specs. Each comma/semicolon-separated item becomes one part.
 * "8-" means 8 to the end, "-3" means 1 to 3, "5-2" is a reversed range, "odd"/"even"/"all" are keywords,
 * and "+" joins items into one part ("1-2+5").
 */
export function parseRanges(spec: string, total: number): { parts: Part[]; errors: string[] } {
  const parts: Part[] = []
  const errors: string[] = []
  const items = spec.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
  for (const item of items) {
    const pages: number[] = []
    let ok = true
    for (const tok of item.split('+').map((s) => s.trim()).filter(Boolean)) {
      const t = tok.toLowerCase().replace(/\s+/g, '')
      if (t === 'all') for (let p = 1; p <= total; p++) pages.push(p)
      else if (t === 'odd') for (let p = 1; p <= total; p += 2) pages.push(p)
      else if (t === 'even') for (let p = 2; p <= total; p += 2) pages.push(p)
      else {
        const m = /^(\d*)(?:([-–])(\d*))?$/.exec(t)
        if (!m || (!m[1] && !m[3])) {
          errors.push(`"${tok}" is not a page or range`)
          ok = false
          continue
        }
        const a = m[1] ? Number(m[1]) : 1
        const b = m[2] ? (m[3] ? Number(m[3]) : total) : a
        if (a < 1 || b < 1 || a > total || b > total) {
          errors.push(`"${tok}" is outside 1–${total}`)
          ok = false
          continue
        }
        const step = a <= b ? 1 : -1
        for (let p = a; p !== b + step; p += step) pages.push(p)
      }
    }
    if (ok && pages.length) parts.push({ name: item.replace(/\s+/g, ''), pages })
  }
  return { parts, errors }
}

/** Every page on its own. */
export function everyPage(total: number): Part[] {
  return Array.from({ length: total }, (_, i) => ({ name: String(i + 1), pages: [i + 1] }))
}

/** Chunks of n pages (the last one may be shorter). */
export function everyN(total: number, n: number): Part[] {
  const k = Math.max(1, Math.floor(n))
  const out: Part[] = []
  for (let a = 1; a <= total; a += k) {
    const b = Math.min(total, a + k - 1)
    out.push({ name: a === b ? String(a) : `${a}-${b}`, pages: Array.from({ length: b - a + 1 }, (_, i) => a + i) })
  }
  return out
}

/** Split into n parts of nearly equal size. */
export function intoN(total: number, n: number): Part[] {
  const k = Math.max(1, Math.min(total, Math.floor(n)))
  const out: Part[] = []
  let a = 1
  for (let i = 0; i < k; i++) {
    const size = Math.floor(total / k) + (i < total % k ? 1 : 0)
    const b = a + size - 1
    out.push({ name: a === b ? String(a) : `${a}-${b}`, pages: Array.from({ length: size }, (_, j) => a + j) })
    a = b + 1
  }
  return out
}

// ---------- ZIP (store, no compression: PDFs are already compressed) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Builds a ZIP archive (method 0 = stored) from named byte arrays. */
export function zipStore(files: { name: string; data: Uint8Array }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const lh = new Uint8Array(30 + name.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, 0, true)
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, f.data.length, true)
    lv.setUint32(22, f.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    lh.set(name, 30)
    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, f.data.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    ch.set(name, 46)
    locals.push(lh, f.data)
    centrals.push(ch)
    offset += lh.length + f.data.length
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const b of [...locals, ...centrals, end]) {
    out.set(b, p)
    p += b.length
  }
  return out
}
