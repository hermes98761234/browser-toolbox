// Barcode encoders (Code 128, EAN-13, QR) + label sheet geometry + CSV merge. No dependencies.

// ---------- Code 128 ----------

const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ')
export const C128_PATTERNS = C128

/** Symbol values (incl. start, checksum, stop) for Code 128 using sets B and C. Throws on non-ASCII. */
export function code128Values(text: string): number[] {
  for (const ch of text) if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126) throw new Error(`Code 128 (set B) can't encode “${ch}”`)
  const digitsAt = (i: number) => {
    let n = 0
    while (i + n < text.length && text[i + n] >= '0' && text[i + n] <= '9') n++
    return n
  }
  const out: number[] = []
  let set: 'B' | 'C'
  let i = 0
  const d0 = digitsAt(0)
  if (d0 >= 4) {
    set = 'C'
    out.push(105)
  } else {
    set = 'B'
    out.push(104)
  }
  while (i < text.length) {
    const d = digitsAt(i)
    if (set === 'C') {
      if (d >= 2) {
        out.push(Number(text.slice(i, i + 2)))
        i += 2
        continue
      }
      out.push(100) // switch to B
      set = 'B'
      continue
    }
    const atEnd = i + d === text.length
    if (d >= 6 || (atEnd && d >= 4)) {
      if (d % 2) {
        out.push(text.charCodeAt(i) - 32)
        i++
      }
      out.push(99) // switch to C
      set = 'C'
      continue
    }
    out.push(text.charCodeAt(i) - 32)
    i++
  }
  const check = out.reduce((a, v, k) => a + v * (k || 1), 0) % 103
  return [...out, check, 106]
}

/** Bar/space widths in modules (starts with a bar). */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => [...C128[v]].map(Number))
}

// ---------- EAN-13 ----------

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const R = L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).join(''))
const G = R.map((p) => [...p].reverse().join(''))
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function eanCheck(d12: string): number {
  const s = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0)
  return (10 - (s % 10)) % 10
}

/** Returns the full 13-digit code and its 95-module bit string. */
export function ean13(input: string): { code: string; bits: string } {
  const d = input.replace(/\s/g, '')
  if (!/^\d{12,13}$/.test(d)) throw new Error('EAN-13 needs 12 digits (check digit added) or 13 digits')
  const c = eanCheck(d.slice(0, 12))
  if (d.length === 13 && Number(d[12]) !== c) throw new Error(`Wrong check digit: expected ${c}`)
  const code = d.slice(0, 12) + c
  const par = PARITY[Number(code[0])]
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[Number(code[i])]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[Number(code[i])]
  bits += '101'
  return { code, bits }
}

// ---------- QR code (byte mode, versions 1–40) ----------

export type Ecl = 'L' | 'M' | 'Q' | 'H'
const ECL_IDX: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 }
const ECL_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 }
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

function rawModules(ver: number) {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2
    r -= (25 * na - 10) * na - 55
    if (ver >= 7) r -= 36
  }
  return r
}
const dataCodewords = (ver: number, e: Ecl) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ECL_IDX[e]][ver] * NUM_BLOCKS[ECL_IDX[e]][ver]

export function gfMul(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

export function rsDivisor(deg: number): number[] {
  const r = new Array<number>(deg).fill(0)
  r[deg - 1] = 1
  let root = 1
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    root = gfMul(root, 2)
  }
  return r
}

export function rsRemainder(data: number[], div: number[]): number[] {
  const r = div.map(() => 0)
  for (const b of data) {
    const f = b ^ (r.shift() as number)
    r.push(0)
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)))
  }
  return r
}

export function formatBits(e: Ecl, mask: number) {
  const data = (ECL_BITS[e] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

export function versionBits(ver: number) {
  let rem = ver
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  return (ver << 12) | rem
}

export interface Qr { size: number; version: number; mask: number; modules: boolean[][] }

export function qr(text: string, ecl: Ecl = 'M'): Qr {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  for (; ver <= 40; ver++) if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break
  if (ver > 40) throw new Error('Text too long for a QR code')
  const cap = dataCodewords(ver, ecl) * 8
  const bits: number[] = []
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1)
  }
  put(4, 4)
  put(bytes.length, ver <= 9 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  put(0, Math.min(4, cap - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // ECC + interleave
  const nb = NUM_BLOCKS[ECL_IDX[ecl]][ver]
  const eccLen = ECC_PER_BLOCK[ECL_IDX[ecl]][ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const nShort = nb - (raw % nb)
  const shortLen = Math.floor(raw / nb)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < nShort) dat.push(0)
    blocks.push([...dat, ...ecc])
  }
  const cw: number[] = []
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) cw.push(b[i]) })

  const size = ver * 4 + 17
  const mods = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, v: boolean) => {
    mods[y][x] = v
    fn[y][x] = true
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, dist !== 2 && dist !== 4)
      }
  if (ver > 1) {
    const na = Math.floor(ver / 7) + 2
    const step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2
    const pos = [6]
    for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p)
    pos.forEach((a, i) =>
      pos.forEach((b, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }),
    )
  }
  const drawFormat = (mask: number) => {
    const b = formatBits(ecl, mask)
    const bit = (i: number) => ((b >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    const b = versionBits(ver)
    for (let i = 0; i < 18; i++) {
      const v = ((b >>> i) & 1) === 1
      const a = size - 11 + (i % 3), c = Math.floor(i / 3)
      set(a, c, v)
      set(c, a, v)
    }
  }
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - v : v
        if (!fn[y][x] && k < cw.length * 8) {
          mods[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1
          k++
        }
      }
  }
  const maskFn = [
    (x: number, y: number) => (x + y) % 2 === 0, (_: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mods[y][x] = !mods[y][x]
  }
  let best = 0, bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m)
    drawFormat(m)
    const sc = penalty(mods)
    if (sc < bestScore) {
      bestScore = sc
      best = m
    }
    applyMask(m)
  }
  applyMask(best)
  drawFormat(best)
  return { size, version: ver, mask: best, modules: mods }
}

function penalty(m: boolean[][]): number {
  const n = m.length
  let s = 0
  let dark = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    let str = ''
    for (let i = 0; i < n; i++) {
      str += get(i) ? '1' : '0'
      if (i && get(i) === get(i - 1)) run++
      else {
        if (run >= 5) s += run - 2
        run = 1
      }
    }
    if (run >= 5) s += run - 2
    for (const p of ['10111010000', '00001011101']) for (let i = str.indexOf(p); i >= 0; i = str.indexOf(p, i + 1)) s += 40
  }
  for (let y = 0; y < n; y++) {
    line((x) => m[y][x])
    line((x) => m[x][y])
    for (let x = 0; x < n; x++) {
      if (m[y][x]) dark++
      if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) s += 3
    }
  }
  s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return s
}

// ---------- label sheets ----------

export interface Sheet { id: string; name: string; pageW: number; pageH: number; cols: number; rows: number; w: number; h: number; top: number; left: number; hgap: number; vgap: number }

export const SHEETS: Sheet[] = [
  { id: '5160', name: 'Letter 30-up · 2⅝″ × 1″ (Avery 5160)', pageW: 215.9, pageH: 279.4, cols: 3, rows: 10, w: 66.675, h: 25.4, top: 12.7, left: 4.7625, hgap: 3.175, vgap: 0 },
  { id: '5167', name: 'Letter 80-up · 1¾″ × ½″ (Avery 5167)', pageW: 215.9, pageH: 279.4, cols: 4, rows: 20, w: 44.45, h: 12.7, top: 12.7, left: 7.62, hgap: 7.62, vgap: 0 },
  { id: 'L7160', name: 'A4 21-up · 63.5 × 38.1 mm (L7160)', pageW: 210, pageH: 297, cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.2, hgap: 2.5, vgap: 0 },
  { id: 'L7651', name: 'A4 65-up · 38.1 × 21.2 mm (L7651)', pageW: 210, pageH: 297, cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.65, hgap: 2.5, vgap: 0 },
  { id: 'A4-24', name: 'A4 24-up · 70 × 37 mm', pageW: 210, pageH: 297, cols: 3, rows: 8, w: 70, h: 37, top: 0.5, left: 0, hgap: 0, vgap: 0 },
  { id: '4x6', name: 'Shipping 4″ × 6″ (thermal, 1 per page)', pageW: 101.6, pageH: 152.4, cols: 1, rows: 1, w: 101.6, h: 152.4, top: 0, left: 0, hgap: 0, vgap: 0 },
  { id: 'dymo', name: 'Roll 89 × 28 mm (Dymo 99010, 1 per page)', pageW: 89, pageH: 28, cols: 1, rows: 1, w: 89, h: 28, top: 0, left: 0, hgap: 0, vgap: 0 },
]

/** Top-left corner (mm) of label `i` on its page. */
export function labelPos(sh: Sheet, i: number) {
  const per = sh.cols * sh.rows
  const k = i % per
  const c = k % sh.cols
  const r = Math.floor(k / sh.cols)
  return { page: Math.floor(i / per), x: sh.left + c * (sh.w + sh.hgap), y: sh.top + r * (sh.h + sh.vgap) }
}

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()))
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()))
  return rows
}

/** Replaces {column} placeholders with values from a CSV record. */
export function fill(tpl: string, rec: Record<string, string>) {
  return tpl.replace(/\{([^}]+)\}/g, (_, k: string) => rec[k.trim().toLowerCase()] ?? '')
}
