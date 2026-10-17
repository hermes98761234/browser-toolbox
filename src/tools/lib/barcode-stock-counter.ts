// EAN-13 / UPC-A / EAN-8 encoder and scan-line decoder (fallback when BarcodeDetector is missing).

const L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map((s) => [...s].map(Number))
const G = L.map((w) => [...w].reverse())
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** GS1 check digit for the given digits (without check digit). */
export function checkDigit(body: string): number {
  let s = 0
  for (let i = 0; i < body.length; i++) s += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (s % 10)) % 10
}
export const validGtin = (code: string) => /^\d{8}$|^\d{12,14}$/.test(code) && checkDigit(code.slice(0, -1)) === Number(code.slice(-1))

/** Module pattern (1 = bar) for EAN-13 (13 digits), UPC-A (12) or EAN-8 (8). */
export function encode(code: string): number[] {
  if (code.length === 12) code = '0' + code
  const out: number[] = []
  const put = (widths: number[], startBar: boolean) => widths.forEach((w, i) => { for (let k = 0; k < w; k++) out.push((i % 2 === 0) === startBar ? 1 : 0) })
  const guard = () => put([1, 1, 1], true)
  if (code.length === 8) {
    guard()
    for (let i = 0; i < 4; i++) put(L[+code[i]], false)
    put([1, 1, 1, 1, 1], false)
    for (let i = 4; i < 8; i++) put(L[+code[i]], true)
    guard()
    return out
  }
  if (code.length !== 13) throw new Error('EAN-13, UPC-A or EAN-8 expected')
  const par = PARITY[+code[0]]
  guard()
  for (let i = 0; i < 6; i++) put((par[i] === 'L' ? L : G)[+code[i + 1]], false)
  put([1, 1, 1, 1, 1], false)
  for (let i = 7; i < 13; i++) put(L[+code[i]], true)
  guard()
  return out
}

/** Best-matching digit for 4 run widths: returns [digit, set ('L'|'G'), error]. */
function matchDigit(w: number[]): [number, 'L' | 'G', number] {
  const tot = w[0] + w[1] + w[2] + w[3]
  const n = w.map((x) => (x * 7) / tot)
  let best: [number, 'L' | 'G', number] = [-1, 'L', Infinity]
  for (const [set, tab] of [['L', L], ['G', G]] as const) {
    tab.forEach((p, d) => {
      const e = Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1]) + Math.abs(n[2] - p[2]) + Math.abs(n[3] - p[3])
      if (e < best[2]) best = [d, set, e]
    })
  }
  return best
}

function runsOf(row: ArrayLike<number>): { runs: number[]; firstDark: boolean } {
  let lo = 255, hi = 0
  for (let i = 0; i < row.length; i++) { lo = Math.min(lo, row[i]); hi = Math.max(hi, row[i]) }
  if (hi - lo < 40) return { runs: [], firstDark: false }
  const th = (lo + hi) / 2
  const runs: number[] = []
  let cur = row[0] < th, len = 0
  const firstDark = cur
  for (let i = 0; i < row.length; i++) {
    const d = row[i] < th
    if (d === cur) len++
    else { runs.push(len); cur = d; len = 1 }
  }
  runs.push(len)
  return { runs, firstDark }
}

function tryDecode(runs: number[], firstDark: boolean): string | null {
  for (let i = 0; i + 43 <= runs.length; i++) {
    const isBar = (i % 2 === 0) === firstDark
    if (!isBar) continue
    const m = (runs[i] + runs[i + 1] + runs[i + 2]) / 3
    if (Math.max(runs[i], runs[i + 1], runs[i + 2]) > m * 1.8) continue
    if (i > 0 && runs[i - 1] < m * 3) continue // quiet zone
    // EAN-13
    if (i + 59 <= runs.length) {
      const digits: number[] = []
      let par = ''
      let err = 0
      for (let k = 0; k < 6; k++) {
        const [d, set, e] = matchDigit(runs.slice(i + 3 + 4 * k, i + 7 + 4 * k))
        digits.push(d); par += set; err += e
      }
      for (let k = 0; k < 6; k++) {
        const [d, set, e] = matchDigit(runs.slice(i + 32 + 4 * k, i + 36 + 4 * k))
        if (set !== 'L') err += 9
        digits.push(d); err += e
      }
      const first = PARITY.indexOf(par)
      if (first >= 0 && err < 12) {
        const code = String(first) + digits.join('')
        if (validGtin(code)) return code
      }
    }
    // EAN-8
    const digits: number[] = []
    let err = 0, ok = true
    for (let k = 0; k < 8; k++) {
      const off = k < 4 ? i + 3 + 4 * k : i + 24 + 4 * (k - 4)
      const [d, set, e] = matchDigit(runs.slice(off, off + 4))
      if (set !== 'L') ok = false
      digits.push(d); err += e
    }
    if (ok && err < 9) {
      const code = digits.join('')
      if (validGtin(code)) return code
    }
  }
  return null
}

/** Decodes one scan line of luminance values (0–255), trying both directions. */
export function decodeRow(row: ArrayLike<number>): string | null {
  const { runs, firstDark } = runsOf(row)
  if (runs.length < 43) return null
  const fw = tryDecode(runs, firstDark)
  if (fw) return fw
  const rev = [...runs].reverse()
  const lastDark = runs.length % 2 === 1 ? firstDark : !firstDark
  return tryDecode(rev, lastDark)
}

/** Scans several horizontal lines of an RGBA image; returns the most frequent result. */
export function decodeImage(data: Uint8ClampedArray, w: number, h: number, lines = 21): string | null {
  const votes = new Map<string, number>()
  const row = new Uint8Array(w)
  for (let k = 0; k < lines; k++) {
    const y = Math.floor(h * (0.2 + (0.6 * k) / Math.max(1, lines - 1)))
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      row[x] = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000
    }
    const c = decodeRow(row)
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1)
  }
  let best: string | null = null, n = 0
  votes.forEach((v, c) => { if (v > n) { n = v; best = c } })
  return best
}
