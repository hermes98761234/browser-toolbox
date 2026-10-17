// Helpers for the image compressor: size fitting, byte formatting and a tiny STORE-only ZIP writer.

/** Scales (w, h) down to fit inside maxW × maxH (0 = unlimited), never up. Returns integers ≥ 1. */
export function fitSize(w: number, h: number, maxW: number, maxH: number): [number, number] {
  let s = 1
  if (maxW > 0 && w > maxW) s = Math.min(s, maxW / w)
  if (maxH > 0 && h > maxH) s = Math.min(s, maxH / h)
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(2)} MB`
}

let TABLE: Uint32Array | null = null
export function crc32(data: Uint8Array): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABLE[i] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Builds an uncompressed (STORE) ZIP archive. Images are already compressed, so deflate would gain little. */
export function makeZip(files: { name: string; data: Uint8Array }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(6, 0x0800, true) // UTF-8 names
    lh.setUint16(8, 0, true)
    lh.setUint16(10, dosTime, true)
    lh.setUint16(12, dosDate, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, f.data.length, true)
    lh.setUint32(22, f.data.length, true)
    lh.setUint16(26, name.length, true)
    lh.setUint16(28, 0, true)
    const local = concat([new Uint8Array(lh.buffer), name, f.data])
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint16(10, 0, true)
    ch.setUint16(12, dosTime, true)
    ch.setUint16(14, dosDate, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, f.data.length, true)
    ch.setUint32(24, f.data.length, true)
    ch.setUint16(28, name.length, true)
    ch.setUint32(42, offset, true)
    centrals.push(concat([new Uint8Array(ch.buffer), name]))
    locals.push(local)
    offset += local.length
  }
  const cd = concat(centrals)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cd.length, true)
  end.setUint32(16, offset, true)
  return concat([...locals, cd, new Uint8Array(end.buffer)])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Makes file names unique inside an archive: a.jpg, a (2).jpg, … */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const k = n.toLowerCase()
    const c = (seen.get(k) ?? 0) + 1
    seen.set(k, c)
    return c === 1 ? n : n.replace(/(\.[^.]*)?$/, (ext) => ` (${c})${ext}`)
  })
}
