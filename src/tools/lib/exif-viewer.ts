// Minimal EXIF (TIFF IFD) reader + writer. Reads JPEG APP1, PNG eXIf, WebP EXIF and raw TIFF.

export type IfdName = 'IFD0' | 'Exif' | 'GPS' | 'Interop' | 'IFD1'
export type Raw = number | string | number[] | [number, number][]
export interface Tag { ifd: IfdName; id: number; name: string; type: number; value: Raw }

const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }

export const NAMES: Record<IfdName, Record<number, string>> = {
  IFD0: {
    0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution',
    0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x0213: 'YCbCrPositioning', 0x8298: 'Copyright',
    0x8769: 'ExifIFDPointer', 0x8825: 'GPSInfoIFDPointer', 0x0100: 'ImageWidth', 0x0101: 'ImageHeight',
  },
  IFD1: { 0x0103: 'Compression', 0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0128: 'ResolutionUnit' },
  Exif: {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal',
    0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue',
    0x9203: 'BrightnessValue', 0x9204: 'ExposureBiasValue', 0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance', 0x9207: 'MeteringMode',
    0x9208: 'LightSource', 0x9209: 'Flash', 0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment', 0x9290: 'SubSecTime',
    0x9291: 'SubSecTimeOriginal', 0xa000: 'FlashpixVersion', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension',
    0xa005: 'InteropIFDPointer', 0xa217: 'SensingMethod', 0xa401: 'CustomRendered', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance',
    0xa404: 'DigitalZoomRatio', 0xa405: 'FocalLengthIn35mmFilm', 0xa406: 'SceneCaptureType', 0xa408: 'Contrast', 0xa409: 'Saturation',
    0xa40a: 'Sharpness', 0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification',
    0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber',
  },
  GPS: {
    0x00: 'GPSVersionID', 0x01: 'GPSLatitudeRef', 0x02: 'GPSLatitude', 0x03: 'GPSLongitudeRef', 0x04: 'GPSLongitude', 0x05: 'GPSAltitudeRef',
    0x06: 'GPSAltitude', 0x07: 'GPSTimeStamp', 0x0c: 'GPSSpeedRef', 0x0d: 'GPSSpeed', 0x10: 'GPSImgDirectionRef', 0x11: 'GPSImgDirection',
    0x12: 'GPSMapDatum', 0x1d: 'GPSDateStamp', 0x1f: 'GPSHPositioningError',
  },
  Interop: { 0x0001: 'InteroperabilityIndex', 0x0002: 'InteroperabilityVersion' },
}

/** Returns the TIFF block (starting at "II*\0" / "MM\0*") inside a supported image file, or null. */
export function findTiff(bytes: Uint8Array): Uint8Array | null {
  const b = bytes
  const isTiff = (o: number) => (b[o] === 0x49 && b[o + 1] === 0x49 && b[o + 2] === 42 && b[o + 3] === 0) || (b[o] === 0x4d && b[o + 1] === 0x4d && b[o + 2] === 0 && b[o + 3] === 42)
  if (b.length < 12) return null
  if (isTiff(0)) return b
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 4 <= b.length && b[o] === 0xff) {
      const marker = b[o + 1]
      if (marker === 0xd9 || marker === 0xda) break
      const len = (b[o + 2] << 8) | b[o + 3]
      if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66 && isTiff(o + 10)) return b.subarray(o + 10, o + 2 + len)
      o += 2 + len
    }
    return null
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    let o = 8
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    while (o + 8 <= b.length) {
      const len = dv.getUint32(o)
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7])
      if (type === 'eXIf') return b.subarray(o + 8, o + 8 + len)
      if (type === 'IEND') break
      o += 12 + len
    }
    return null
  }
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    let o = 12
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    while (o + 8 <= b.length) {
      const type = String.fromCharCode(...b.subarray(o, o + 4))
      const len = dv.getUint32(o + 4, true)
      if (type === 'EXIF') {
        let s = o + 8
        if (b[s] === 0x45 && b[s + 1] === 0x78) s += 6 // optional "Exif\0\0"
        return b.subarray(s, o + 8 + len)
      }
      o += 8 + len + (len & 1)
    }
    return null
  }
  // last resort: search for an Exif header (HEIC and others)
  for (let o = 0; o + 10 < Math.min(b.length, 1 << 20); o++) {
    if (b[o] === 0x45 && b[o + 1] === 0x78 && b[o + 2] === 0x69 && b[o + 3] === 0x66 && b[o + 4] === 0 && b[o + 5] === 0 && isTiff(o + 6)) return b.subarray(o + 6)
  }
  return null
}

/** Parses all IFDs of a TIFF block. */
export function parseTiff(t: Uint8Array): Tag[] {
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength)
  const le = t[0] === 0x49
  const u16 = (o: number) => dv.getUint16(o, le)
  const u32 = (o: number) => dv.getUint32(o, le)
  const out: Tag[] = []
  const seen = new Set<number>()
  const readIfd = (off: number, ifd: IfdName): number => {
    if (off <= 0 || off + 2 > t.length || seen.has(off)) return 0
    seen.add(off)
    const n = u16(off)
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12
      if (e + 12 > t.length) break
      const id = u16(e), type = u16(e + 2), count = u32(e + 4)
      const sz = (SIZE[type] ?? 1) * count
      const vo = sz <= 4 ? e + 8 : u32(e + 8)
      if (vo + sz > t.length || !SIZE[type]) continue
      let value: Raw
      if (type === 2) {
        value = new TextDecoder().decode(t.subarray(vo, vo + count)).replace(/\0+$/, '').trim()
      } else if (type === 5 || type === 10) {
        const arr: [number, number][] = []
        for (let k = 0; k < count; k++) {
          const p = vo + k * 8
          arr.push(type === 5 ? [u32(p), u32(p + 4)] : [dv.getInt32(p, le), dv.getInt32(p + 4, le)])
        }
        value = arr
      } else {
        const arr: number[] = []
        const lim = Math.min(count, 64)
        for (let k = 0; k < lim; k++) {
          const p = vo + k * (SIZE[type] ?? 1)
          arr.push(type === 3 ? u16(p) : type === 4 ? u32(p) : type === 9 ? dv.getInt32(p, le) : type === 8 ? dv.getInt16(p, le) : t[p])
        }
        value = arr.length === 1 ? arr[0] : arr
      }
      out.push({ ifd, id, type, name: NAMES[ifd][id] ?? `0x${id.toString(16).padStart(4, '0')}`, value })
      if (ifd === 'IFD0' && id === 0x8769) readIfd(Number(value), 'Exif')
      if (ifd === 'IFD0' && id === 0x8825) readIfd(Number(value), 'GPS')
      if (ifd === 'Exif' && id === 0xa005) readIfd(Number(value), 'Interop')
    }
    return off + 2 + n * 12 + 4 <= t.length ? u32(off + 2 + n * 12) : 0
  }
  const next = readIfd(u32(4), 'IFD0')
  if (next) readIfd(next, 'IFD1')
  return out
}

export const rat = (v: Raw): number => {
  if (Array.isArray(v) && Array.isArray(v[0])) {
    const [n, d] = v[0] as [number, number]
    return d ? n / d : NaN
  }
  return typeof v === 'number' ? v : NaN
}

/** Degrees/minutes/seconds rationals → decimal degrees (negative for S/W). */
export function dms(v: Raw, ref: string): number {
  if (!Array.isArray(v) || !Array.isArray(v[0])) return NaN
  const [d, m, s] = (v as [number, number][]).map(([n, q]) => (q ? n / q : 0))
  const x = d + (m ?? 0) / 60 + (s ?? 0) / 3600
  return ref === 'S' || ref === 'W' ? -x : x
}

const ENUMS: Record<string, Record<number, string>> = {
  Orientation: { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored, rotated 90° CCW', 6: 'Rotated 90° CW', 7: 'Mirrored, rotated 90° CW', 8: 'Rotated 90° CCW' },
  ExposureProgram: { 0: 'Not defined', 1: 'Manual', 2: 'Program AE', 3: 'Aperture priority', 4: 'Shutter priority', 5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape' },
  MeteringMode: { 0: 'Unknown', 1: 'Average', 2: 'Center-weighted', 3: 'Spot', 4: 'Multi-spot', 5: 'Multi-segment', 6: 'Partial' },
  ExposureMode: { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' },
  WhiteBalance: { 0: 'Auto', 1: 'Manual' },
  SceneCaptureType: { 0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night' },
  ColorSpace: { 1: 'sRGB', 65535: 'Uncalibrated' },
  ResolutionUnit: { 1: 'None', 2: 'inch', 3: 'cm' },
  LightSource: { 0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten', 4: 'Flash', 9: 'Fine weather', 10: 'Cloudy', 11: 'Shade' },
}

export function exposure(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  return sec >= 0.3 ? `${+sec.toFixed(1)} s` : `1/${Math.round(1 / sec)} s`
}

export function flash(v: number): string {
  const fired = v & 1 ? 'Fired' : 'Did not fire'
  const mode = ['', ', compulsory', ', suppressed', ', auto'][(v >> 3) & 3]
  return `${fired}${mode}${v & 0x40 ? ', red-eye reduction' : ''}`
}

/** Human-readable value for any tag. */
export function display(t: Tag): string {
  const v = t.value
  const r = rat(v)
  switch (t.name) {
    case 'ExposureTime': return exposure(r)
    case 'FNumber': return `f/${+r.toFixed(1)}`
    case 'FocalLength': return `${+r.toFixed(1)} mm`
    case 'FocalLengthIn35mmFilm': return `${v} mm`
    case 'ExposureBiasValue': return `${r > 0 ? '+' : ''}${+r.toFixed(2)} EV`
    case 'ApertureValue': case 'MaxApertureValue': return `f/${+Math.pow(2, r / 2).toFixed(1)}`
    case 'ShutterSpeedValue': return exposure(Math.pow(2, -r))
    case 'Flash': return flash(Number(v))
    case 'GPSAltitude': return `${+r.toFixed(1)} m`
    case 'GPSLatitude': case 'GPSLongitude': return dms(v, 'N').toFixed(6) + '°'
    case 'GPSTimeStamp': return Array.isArray(v) ? (v as [number, number][]).map(([n, d]) => String(Math.floor(d ? n / d : 0)).padStart(2, '0')).join(':') + ' UTC' : String(v)
    case 'LensSpecification': {
      const a = (v as [number, number][]).map(([n, d]) => (d ? n / d : 0))
      return `${a[0]}–${a[1]} mm f/${+a[2]?.toFixed(1)}–${+a[3]?.toFixed(1)}`
    }
    case 'ExifVersion': case 'FlashpixVersion': return Array.isArray(v) ? String.fromCharCode(...(v as number[])) : String(v)
  }
  if (ENUMS[t.name] && typeof v === 'number') return ENUMS[t.name][v] ?? String(v)
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v[0])) return (v as [number, number][]).map(([n, d]) => (d === 1 ? String(n) : d ? `${+(n / d).toFixed(4)}` : '—')).join(', ')
  const arr = v as number[]
  return arr.length > 16 ? `${arr.length} bytes` : arr.join(' ')
}

// ---------- writer (used to build the demo photo and in tests) ----------

export interface WEntry { id: number; type: 2 | 3 | 4 | 5 | 10; value: string | number[] | [number, number][] }

function entryBytes(e: WEntry): number[] {
  const out: number[] = []
  const p16 = (x: number) => out.push(x & 255, (x >> 8) & 255)
  const p32 = (x: number) => out.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255)
  if (e.type === 2) for (const c of new TextEncoder().encode(String(e.value) + '\0')) out.push(c)
  else if (e.type === 3) (e.value as number[]).forEach(p16)
  else if (e.type === 4) (e.value as number[]).forEach(p32)
  else (e.value as [number, number][]).forEach(([n, d]) => { p32(n); p32(d) })
  return out
}

/** Builds a little-endian TIFF block with IFD0 (+ optional Exif and GPS sub-IFDs). */
export function writeTiff(ifd0: WEntry[], exif: WEntry[] = [], gps: WEntry[] = []): Uint8Array {
  const blocks: WEntry[][] = [[...ifd0], exif, gps]
  if (exif.length) blocks[0].push({ id: 0x8769, type: 4, value: [0] })
  if (gps.length) blocks[0].push({ id: 0x8825, type: 4, value: [0] })
  blocks[0].sort((a, b) => a.id - b.id)
  const size = (b: WEntry[]) => (b.length ? 6 + 12 * b.length + b.reduce((a, e) => { const n = entryBytes(e).length; return a + (n > 4 ? n + (n & 1) : 0) }, 0) : 0)
  const start = [8, 8 + size(blocks[0]), 8 + size(blocks[0]) + size(exif)]
  for (const e of blocks[0]) {
    if (e.id === 0x8769) e.value = [start[1]]
    if (e.id === 0x8825) e.value = [start[2]]
  }
  const out: number[] = [0x49, 0x49, 42, 0, 8, 0, 0, 0]
  blocks.forEach((b, bi) => {
    if (!b.length) return
    const base = start[bi]
    const dir: number[] = []
    const data: number[] = []
    const dataStart = base + 6 + 12 * b.length
    const p = (arr: number[], x: number, n: number) => { for (let i = 0; i < n; i++) arr.push((x >>> (8 * i)) & 255) }
    p(dir, b.length, 2)
    for (const e of b) {
      const bytes = entryBytes(e)
      const count = e.type === 2 ? bytes.length : (e.value as unknown[]).length
      p(dir, e.id, 2); p(dir, e.type, 2); p(dir, count, 4)
      if (bytes.length <= 4) { dir.push(...bytes); for (let i = bytes.length; i < 4; i++) dir.push(0) }
      else { p(dir, dataStart + data.length, 4); data.push(...bytes); if (bytes.length & 1) data.push(0) }
    }
    p(dir, 0, 4)
    out.push(...dir, ...data)
  })
  return new Uint8Array(out)
}

/** Inserts an APP1 Exif segment right after SOI of a JPEG (replacing existing APP1 Exif). */
export function jpegWithExif(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const stripped = stripJpeg(jpeg)
  const len = tiff.length + 8
  const seg = new Uint8Array([0xff, 0xe1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
  const out = new Uint8Array(stripped.length + seg.length)
  out.set(stripped.subarray(0, 2))
  out.set(seg, 2)
  out.set(stripped.subarray(2), 2 + seg.length)
  return out
}

/** Removes APP1 (Exif/XMP), APP13 (IPTC) and COM segments from a JPEG. */
export function stripJpeg(b: Uint8Array): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) return b
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let o = 2
  while (o + 4 <= b.length && b[o] === 0xff) {
    const m = b[o + 1]
    if (m === 0xda) break
    const len = (b[o + 2] << 8) | b[o + 3]
    if (!(m === 0xe1 || m === 0xed || m === 0xfe)) parts.push(b.subarray(o, o + 2 + len))
    o += 2 + len
  }
  parts.push(b.subarray(o))
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let k = 0
  for (const p of parts) { out.set(p, k); k += p.length }
  return out
}
