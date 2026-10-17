// Pure 1D barcode codec used as the fallback when the browser has no BarcodeDetector:
// EAN-13 / UPC-A / EAN-8 and Code 128, encoded to module strings and decoded from scanline run lengths.

export interface Decoded {
  format: 'ean_13' | 'upc_a' | 'ean_8' | 'code_128'
  text: string
}

// ---------- EAN / UPC ----------

/** Run lengths (space, bar, space, bar) of the L-code digits; R codes share them, G codes are reversed. */
const L_RUNS = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map((s) => [...s].map(Number))
const G_RUNS = L_RUNS.map((r) => [...r].reverse())
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** GS1 mod-10 check digit for the digits without their check digit. */
export function gtinCheck(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) sum += +body[body.length - 1 - i] * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

export const validGtin = (code: string) => /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) && gtinCheck(code.slice(0, -1)) === +code.slice(-1)

const runsToBits = (runs: number[], startBar: boolean) => runs.map((n, i) => ((i % 2 === 0) === startBar ? '1' : '0').repeat(n)).join('')

/** Module string ('1' = bar) for EAN-13 (12 or 13 digits; check digit added/verified), UPC-A (12 digits → EAN-13 with 0) or EAN-8. */
export function encodeEan(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.length === 7) d += gtinCheck(d)
  if (d.length === 12) d = validGtin(d) ? '0' + d : d + gtinCheck(d)
  if (d.length !== 8 && d.length !== 13) throw new Error('EAN needs 7/8 or 12/13 digits')
  if (!validGtin(d)) throw new Error('Wrong check digit')
  if (d.length === 8) {
    return '101' + [...d.slice(0, 4)].map((c) => runsToBits(L_RUNS[+c], false)).join('') + '01010' + [...d.slice(4)].map((c) => runsToBits(L_RUNS[+c], true)).join('') + '101'
  }
  const par = PARITY[+d[0]]
  const left = [...d.slice(1, 7)].map((c, i) => runsToBits(par[i] === 'L' ? L_RUNS[+c] : G_RUNS[+c], false)).join('')
  const right = [...d.slice(7)].map((c) => runsToBits(L_RUNS[+c], true)).join('')
  return '101' + left + '01010' + right + '101'
}

/** Nearest code in `table` for 4 or 6 measured runs normalised to `modules`; returns [index, error]. */
function nearest(runs: number[], table: number[][], modules: number): [number, number] {
  const tot = runs.reduce((a, b) => a + b, 0)
  const norm = runs.map((r) => (r * modules) / tot)
  let best = -1, err = Infinity
  table.forEach((t, i) => {
    let e = 0
    for (let k = 0; k < t.length; k++) e += Math.abs(norm[k] - t[k])
    if (e < err) {
      err = e
      best = i
    }
  })
  return [best, err]
}

const guardOk = (runs: number[], m: number) => runs.every((r) => r > m * 0.4 && r < m * 1.8)

function decodeEanAt(runs: number[], i: number, digits: 6 | 4): Decoded | null {
  const n = 3 + digits * 8 + 5 + 3
  if (i + n > runs.length) return null
  const seg = runs.slice(i, i + n)
  const modules = digits === 6 ? 95 : 67
  const m = seg.reduce((a, b) => a + b, 0) / modules
  if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(n - 3), m) || !guardOk(seg.slice(3 + digits * 4, 8 + digits * 4), m)) return null
  // quiet zone: the space before the start guard should be clearly wider than a module
  if (i > 0 && runs[i - 1] < m * 3) return null
  let par = ''
  let out = ''
  let errSum = 0
  for (let k = 0; k < digits * 2; k++) {
    const off = k < digits ? 3 + k * 4 : 8 + k * 4
    const r = seg.slice(off, off + 4)
    if (k < digits && digits === 6) {
      const [l, el] = nearest(r, L_RUNS, 7)
      const [g, eg] = nearest(r, G_RUNS, 7)
      par += el <= eg ? 'L' : 'G'
      out += el <= eg ? l : g
      errSum += Math.min(el, eg)
    } else {
      const [d, e] = nearest(r, L_RUNS, 7)
      out += d
      errSum += e
    }
  }
  if (errSum / (digits * 2) > 1.6) return null
  if (digits === 6) {
    const first = PARITY.indexOf(par)
    if (first < 0) return null
    out = first + out
  }
  if (!validGtin(out)) return null
  if (digits === 6 && out[0] === '0') return { format: 'upc_a', text: out.slice(1) }
  return { format: digits === 6 ? 'ean_13' : 'ean_8', text: out }
}

// ---------- Code 128 ----------

const C128 = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232'
).split(' ').map((s) => [...s].map(Number))
const STOP = [2, 3, 3, 1, 1, 1, 2]

/** Code 128 module string: set C for even-length digit strings (≥ 4), otherwise set B (ASCII 32–126). */
export function encodeCode128(text: string): string {
  const vals: number[] = []
  if (/^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4) {
    vals.push(105)
    for (let i = 0; i < text.length; i += 2) vals.push(+text.slice(i, i + 2))
  } else {
    vals.push(104)
    for (const ch of text) {
      const c = ch.charCodeAt(0)
      if (c < 32 || c > 126) throw new Error('Code 128 (set B) supports printable ASCII only')
      vals.push(c - 32)
    }
  }
  vals.push(vals.reduce((a, v, i) => a + v * Math.max(1, i), 0) % 103)
  return vals.map((v) => runsToBits(C128[v], true)).join('') + runsToBits(STOP, true)
}

function decodeCode128At(runs: number[], i: number): Decoded | null {
  if (i + 6 + 6 + 7 > runs.length) return null
  const [start, e0] = nearest(runs.slice(i, i + 6), C128, 11)
  if (start < 103 || start > 105 || e0 > 1.2) return null
  const m = runs.slice(i, i + 6).reduce((a, b) => a + b, 0) / 11
  if (i > 0 && runs[i - 1] < m * 4) return null
  const vals = [start]
  let k = i + 6
  for (;;) {
    if (k + 7 <= runs.length) {
      const seven = runs.slice(k, k + 7)
      const [, es] = nearest(seven, [STOP], 13)
      const w = seven.reduce((a, b) => a + b, 0)
      if (es < 1.5 && Math.abs(w / m - 13) < 2.5 && vals.length >= 3) break
    }
    if (k + 6 > runs.length || vals.length > 80) return null
    const [v, e] = nearest(runs.slice(k, k + 6), C128, 11)
    if (e > 1.6 || v > 102) return null
    vals.push(v)
    k += 6
  }
  const check = vals.pop()!
  if (vals.reduce((a, v, j) => a + v * Math.max(1, j), 0) % 103 !== check) return null
  let set: 'A' | 'B' | 'C' = start === 103 ? 'A' : start === 104 ? 'B' : 'C'
  let text = ''
  for (const v of vals.slice(1)) {
    if (set === 'C') {
      if (v < 100) text += String(v).padStart(2, '0')
      else if (v === 100) set = 'B'
      else if (v === 101) set = 'A'
    } else {
      if (v === 99) set = 'C'
      else if (v === 100 && set === 'A') set = 'B'
      else if (v === 101 && set === 'B') set = 'A'
      else if (v < 96) text += set === 'A' ? String.fromCharCode(v < 64 ? v + 32 : v - 64) : String.fromCharCode(v + 32)
    }
  }
  return text ? { format: 'code_128', text } : null
}

// ---------- scanlines ----------

/** Run lengths of a binarised line, starting with the first bar. */
export function toRuns(bits: ArrayLike<number>): number[] {
  const runs: number[] = []
  let i = 0
  while (i < bits.length && !bits[i]) i++
  runs.push(i) // leading quiet zone (space)
  let cur = 1, n = 0
  for (; i < bits.length; i++) {
    if (bits[i] === cur) n++
    else {
      runs.push(n)
      cur = bits[i]
      n = 1
    }
  }
  runs.push(n)
  return runs // runs[0] = leading space, then bar, space, bar…
}

/** Decodes run lengths that start with a space (quiet zone) followed by alternating bar/space runs. */
export function decodeRuns(runs: number[]): Decoded | null {
  for (let i = 1; i < runs.length; i += 2) {
    const r = decodeEanAt(runs, i, 6) ?? decodeCode128At(runs, i) ?? decodeEanAt(runs, i, 4)
    if (r) return r
  }
  return null
}

/** Decodes one line of luminance values (0 = black … 255 = white), trying both directions. */
export function decodeLine(lum: ArrayLike<number>): Decoded | null {
  let lo = 255, hi = 0
  for (let i = 0; i < lum.length; i++) {
    lo = Math.min(lo, lum[i])
    hi = Math.max(hi, lum[i])
  }
  if (hi - lo < 40) return null
  const th = (lo + hi) / 2
  const bits = Array.from(lum, (v) => (v < th ? 1 : 0))
  return decodeRuns(toRuns(bits)) ?? decodeRuns(toRuns(bits.reverse()))
}

/** Rows of a greyscale image to try: the middle band first, then spreading outwards. */
export function scanRows(h: number, n = 15): number[] {
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1)
    const y = Math.round(h / 2 + (off * h * 0.8) / n)
    if (y >= 0 && y < h) out.push(y)
  }
  return out
}

export const FORMAT_NAMES: Record<string, string> = { ean_13: 'EAN-13', upc_a: 'UPC-A', ean_8: 'EAN-8', code_128: 'Code 128', qr_code: 'QR', code_39: 'Code 39', itf: 'ITF', upc_e: 'UPC-E', data_matrix: 'Data Matrix', pdf417: 'PDF417', manual: 'Manual' }
