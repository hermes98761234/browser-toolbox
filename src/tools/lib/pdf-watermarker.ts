// Pure helpers for the PDF watermarker: text sanitising for standard PDF fonts, page selection
// and watermark placement (rotation-aware) in PDF user space (origin bottom-left, y up).

// Characters outside ASCII/Latin-1 that WinAnsiEncoding (pdf-lib standard fonts) can still encode.
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ё: 'yo', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const GREEK: Record<string, string> = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' }

export const encodable = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.includes(ch)
}

/** Makes text drawable with a standard font: transliterates Cyrillic/Greek, replaces the rest with "?". */
export function sanitize(text: string): { text: string; changed: string[] } {
  const changed = new Set<string>()
  let out = ''
  for (const ch of text.replace(/[\t\r\n]+/g, ' ')) {
    if (encodable(ch)) {
      out += ch
      continue
    }
    changed.add(ch)
    const low = ch.toLowerCase()
    const tr = CYR[low] ?? GREEK[low]
    if (tr !== undefined) out += ch !== low && tr ? tr[0].toUpperCase() + tr.slice(1) : tr
    else out += '?'
  }
  return { text: out, changed: [...changed] }
}

/** Parses "all", "odd", "even", "1-3, 5, 8-", "-4" into sorted 1-based page numbers. */
export function parsePages(spec: string, total: number): { pages: number[]; error?: string } {
  const set = new Set<number>()
  const parts = spec.split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean)
  if (!parts.length) return { pages: [], error: 'No pages selected.' }
  for (const p of parts) {
    if (p === 'all') for (let i = 1; i <= total; i++) set.add(i)
    else if (p === 'odd' || p === 'even') for (let i = p === 'odd' ? 1 : 2; i <= total; i += 2) set.add(i)
    else {
      const m = /^(\d*)\s*-\s*(\d*)$/.exec(p) ?? /^(\d+)()$/.exec(p)
      if (!m) return { pages: [], error: `Cannot read "${p}".` }
      const single = !p.includes('-')
      const a = m[1] ? Number(m[1]) : 1
      const b = single ? a : m[2] ? Number(m[2]) : total
      if (a < 1 || b < 1 || a > total || b > total) return { pages: [], error: `"${p}" is outside 1–${total}.` }
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i)
    }
  }
  return { pages: [...set].sort((x, y) => x - y) }
}

export type Pos = 'center' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

/** Axis-aligned bounding box of a w×h box rotated by deg. */
export function rotatedBox(w: number, h: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
  return [w * c + h * s, w * s + h * c]
}

/** Centres (PDF coords) of each watermark copy on a page. */
export function centers(pw: number, ph: number, w: number, h: number, deg: number, pos: Pos, margin: number, gap: number): [number, number][] {
  const [bw, bh] = rotatedBox(w, h, deg)
  const L = margin + bw / 2, R = pw - margin - bw / 2, B = margin + bh / 2, T = ph - margin - bh / 2
  switch (pos) {
    case 'center': return [[pw / 2, ph / 2]]
    case 'top': return [[pw / 2, T]]
    case 'bottom': return [[pw / 2, B]]
    case 'top-left': return [[L, T]]
    case 'top-right': return [[R, T]]
    case 'bottom-left': return [[L, B]]
    case 'bottom-right': return [[R, B]]
  }
  const sx = Math.max(bw + gap, 10), sy = Math.max(bh + gap, 10)
  const out: [number, number][] = []
  const rows = Math.ceil(ph / sy) + 1
  for (let j = 0; j <= rows; j++) {
    const off = j % 2 ? sx / 2 : 0
    for (let x = -sx / 2 + off; x <= pw + sx / 2; x += sx) out.push([x, j * sy])
  }
  return out
}

/** pdf-lib rotates text/images around their bottom-left origin; this returns that origin for a given centre. */
export function originFor(cx: number, cy: number, w: number, h: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  return [cx - (w / 2) * c + (h / 2) * s, cy - (w / 2) * s - (h / 2) * c]
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
