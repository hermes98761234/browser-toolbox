// Linear barcode symbologies → bar geometry in modules. Reuses Code 128 / EAN-13 from barcode-label-maker.
import { code128Widths, ean13 } from './barcode-label-maker'

export type Sym = 'ean13' | 'upca' | 'ean8' | 'code128' | 'code39' | 'itf14' | 'itf'

export const SYMS: [Sym, string, string][] = [
  ['ean13', 'EAN-13', '590123412345'],
  ['upca', 'UPC-A', '03600029145'],
  ['ean8', 'EAN-8', '9638507'],
  ['code128', 'Code 128', 'SKU-2026-0042'],
  ['code39', 'Code 39', 'PART-77A'],
  ['itf14', 'ITF-14 (cartons)', '1540014128876'],
  ['itf', 'Interleaved 2 of 5', '12345670'],
]

export interface Barcode {
  bars: [number, number][] // [x, width] in modules
  width: number // modules
  guards: [number, number][] // x-ranges whose bars extend below the text baseline (EAN/UPC)
  text: { x: number; s: string; small?: boolean }[] // centre x in modules; may be outside [0,width]
  code: string // final encoded value incl. check digits
  quiet: [number, number] // recommended quiet zone, modules
  bearer?: boolean
}

/** GS1 check digit for any length (weights 3,1,3… from the right). */
export function gs1Check(digits: string): number {
  let s = 0
  for (let i = 0; i < digits.length; i++) s += Number(digits[digits.length - 1 - i]) * (i % 2 ? 1 : 3)
  return (10 - (s % 10)) % 10
}

function runs(bits: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== '1') { i++; continue }
    let j = i
    while (bits[j] === '1') j++
    out.push([i, j - i])
    i = j
  }
  return out
}

function widthsToBars(widths: number[]): { bars: [number, number][]; width: number } {
  const bars: [number, number][] = []
  let x = 0
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push([x, w])
    x += w
  })
  return { bars, width: x }
}

function gtin(input: string, n: number, name: string): string {
  const d = input.replace(/[\s-]/g, '')
  if (!new RegExp(`^\\d{${n - 1},${n}}$`).test(d)) throw new Error(`${name} needs ${n - 1} digits (check digit added) or ${n} digits`)
  const c = gs1Check(d.slice(0, n - 1))
  if (d.length === n && Number(d[n - 1]) !== c) throw new Error(`Wrong check digit: expected ${c}`)
  return d.slice(0, n - 1) + c
}

const EL = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const ER = EL.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).join(''))

export function ean8Bits(input: string): { code: string; bits: string } {
  const code = gtin(input, 8, 'EAN-8')
  let bits = '101'
  for (let i = 0; i < 4; i++) bits += EL[Number(code[i])]
  bits += '01010'
  for (let i = 4; i < 8; i++) bits += ER[Number(code[i])]
  return { code, bits: bits + '101' }
}

const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'
const C39 = 'nnnwwnwnn wnnwnnnnw nnwwnnnnw wnwwnnnnn nnnwwnnnw wnnwwnnnn nnwwwnnnn nnnwnnwnw wnnwnnwnn nnwwnnwnn wnnnnwnnw nnwnnwnnw wnwnnwnnn nnnnwwnnw wnnnwwnnn nnwnwwnnn nnnnnwwnw wnnnnwwnn nnwnnwwnn nnnnwwwnn wnnnnnnww nnwnnnnww wnwnnnnwn nnnnwnnww wnnnwnnwn nnwnwnnwn nnnnnnwww wnnnnnwwn nnwnnnwwn nnnnwnwwn wwnnnnnnw nwwnnnnnw wwwnnnnnn nwnnwnnnw wwnnwnnnn nwwnwnnnn nwnnnnwnw wwnnnnwnn nwwnnnwnn nwnwnwnnn nwnwnnnwn nwnnnwnwn nnnwnwnwn'.split(' ')
export const C39_PATTERNS = C39
const C39_STAR = 'nwnnwnwnn'

export function code39Check(s: string): string {
  return C39_CHARS[[...s].reduce((a, c) => a + C39_CHARS.indexOf(c), 0) % 43]
}

export function code39Widths(input: string, check: boolean, ratio = 3): { code: string; widths: number[] } {
  const s = input.toUpperCase()
  for (const ch of s) if (!C39_CHARS.includes(ch)) throw new Error(`Code 39 can't encode “${ch}” (use 0-9, A-Z, space and - . $ / + %)`)
  if (!s) throw new Error('Enter some text')
  const code = check ? s + code39Check(s) : s
  const widths: number[] = []
  const pats = [C39_STAR, ...[...code].map((c) => C39[C39_CHARS.indexOf(c)]), C39_STAR]
  pats.forEach((p, k) => {
    for (const e of p) widths.push(e === 'w' ? ratio : 1)
    if (k < pats.length - 1) widths.push(1) // inter-character gap
  })
  return { code, widths }
}

const I25 = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn']

export function itfWidths(digits: string, ratio = 2.5): number[] {
  if (!/^\d+$/.test(digits) || digits.length % 2) throw new Error('Interleaved 2 of 5 needs an even number of digits')
  const w = (e: string) => (e === 'w' ? ratio : 1)
  const out = [1, 1, 1, 1]
  for (let i = 0; i < digits.length; i += 2) {
    const a = I25[Number(digits[i])], b = I25[Number(digits[i + 1])]
    for (let k = 0; k < 5; k++) out.push(w(a[k]), w(b[k]))
  }
  return [...out, ratio, 1, 1]
}

export interface Opts { check39?: boolean; ratio?: number }

export function encode(sym: Sym, value: string, o: Opts = {}): Barcode {
  const v = value.trim()
  if (sym === 'ean13') {
    const { code, bits } = ean13(v.replace(/-/g, ''))
    const text = [{ x: -4, s: code[0] }, ...[...code.slice(1, 7)].map((s, i) => ({ x: 3 + i * 7 + 3.5, s })), ...[...code.slice(7)].map((s, i) => ({ x: 50 + i * 7 + 3.5, s }))]
    return { bars: runs(bits), width: 95, guards: [[0, 3], [45, 50], [92, 95]], text, code, quiet: [11, 7] }
  }
  if (sym === 'upca') {
    const code = gtin(v, 12, 'UPC-A')
    const { bits } = ean13('0' + code)
    const text = [{ x: -4, s: code[0], small: true }, ...[...code.slice(1, 6)].map((s, i) => ({ x: 10 + i * 7 + 3.5, s })), ...[...code.slice(6, 11)].map((s, i) => ({ x: 50 + i * 7 + 3.5, s })), { x: 99, s: code[11], small: true }]
    return { bars: runs(bits), width: 95, guards: [[0, 10], [45, 50], [85, 95]], text, code, quiet: [9, 9] }
  }
  if (sym === 'ean8') {
    const { code, bits } = ean8Bits(v)
    const text = [...[...code.slice(0, 4)].map((s, i) => ({ x: 3 + i * 7 + 3.5, s })), ...[...code.slice(4)].map((s, i) => ({ x: 36 + i * 7 + 3.5, s }))]
    return { bars: runs(bits), width: 67, guards: [[0, 3], [31, 36], [64, 67]], text, code, quiet: [7, 7] }
  }
  if (sym === 'code128') {
    if (!v) throw new Error('Enter some text')
    const { bars, width } = widthsToBars(code128Widths(v))
    return { bars, width, guards: [], text: [{ x: width / 2, s: v }], code: v, quiet: [10, 10] }
  }
  if (sym === 'code39') {
    const { code, widths } = code39Widths(v, !!o.check39, o.ratio ?? 3)
    const { bars, width } = widthsToBars(widths)
    return { bars, width, guards: [], text: [{ x: width / 2, s: `*${code}*` }], code, quiet: [10, 10] }
  }
  if (sym === 'itf14') {
    const code = gtin(v, 14, 'ITF-14')
    const { bars, width } = widthsToBars(itfWidths(code, o.ratio ?? 2.5))
    return { bars, width, guards: [], text: [{ x: width / 2, s: `${code[0]} ${code.slice(1, 3)} ${code.slice(3, 8)} ${code.slice(8, 13)} ${code[13]}` }], code, quiet: [10, 10], bearer: true }
  }
  const d = v.replace(/\s/g, '')
  const code = d.length % 2 ? d + gs1Check(d) : d
  const { bars, width } = widthsToBars(itfWidths(code, o.ratio ?? 2.5))
  return { bars, width, guards: [], text: [{ x: width / 2, s: code }], code, quiet: [10, 10] }
}

export interface Render { module: number; height: number; text: boolean; fontSize: number; fg: string; bg: string; caption?: string }

/** Standalone SVG (units = px; pass module in px). */
export function toSvg(b: Barcode, r: Render): string {
  const m = r.module
  const ql = b.quiet[0] * m, qr = b.quiet[1] * m
  const bear = b.bearer ? 4.8 * m : 0
  const W = ql + b.width * m + qr + bear * 2
  const hasText = r.text
  const fs = r.fontSize
  const ext = b.guards.length && hasText ? fs * 0.5 : 0
  const capH = r.caption ? fs + 4 : 0
  const textH = hasText ? fs + 4 : 0
  const H = bear * 2 + r.height + textH + capH + 4
  const top = bear + 2 + capH
  const inGuard = (x: number) => b.guards.some(([a, z]) => x >= a && x < z)
  const rects = b.bars.map(([x, w]) => `<rect x="${(bear + ql + x * m).toFixed(2)}" y="${top}" width="${(w * m).toFixed(2)}" height="${(r.height + (inGuard(x) ? ext : 0)).toFixed(2)}"/>`).join('')
  const ty = top + r.height + fs * 0.85 + 1
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const texts = hasText ? b.text.map((t) => `<text x="${(bear + ql + t.x * m).toFixed(2)}" y="${ty.toFixed(2)}" font-size="${t.small ? fs * 0.75 : fs}" text-anchor="middle">${esc(t.s)}</text>`).join('') : ''
  const bearer = b.bearer ? `<rect x="${bear / 2}" y="${bear / 2}" width="${W - bear}" height="${bear + 2 + r.height + 2 + bear / 2}" fill="none" stroke="${r.fg}" stroke-width="${bear}"/>` : ''
  const cap = r.caption ? `<text x="${W / 2}" y="${bear + fs}" font-size="${fs}" text-anchor="middle" font-weight="600" font-family="system-ui,Arial,sans-serif">${esc(r.caption)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}" height="${H.toFixed(2)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}"><rect width="100%" height="100%" fill="${r.bg}"/><g fill="${r.fg}" font-family="'OCR-B','Courier New',monospace">${bearer}${cap}${rects}${texts}</g></svg>`
}
