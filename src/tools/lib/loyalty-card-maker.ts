// Loyalty Card Maker: stamp-grid geometry, card SVG (front/back) in millimetres, and print-sheet imposition.

export interface Design {
  business: string
  tagline: string
  reward: string
  stamps: number
  icon: string
  shape: 'circle' | 'rounded' | 'square'
  bg: string
  bg2: string
  accent: string
  ink: string
  font: 'sans' | 'serif' | 'rounded' | 'mono'
  radius: number
  logo: string
  freeLast: boolean
  numbers: boolean
  preview: number
  backTitle: string
  terms: string
  address: string
  phone: string
  web: string
  nameLine: boolean
  expiryLine: boolean
}

export interface CardSize { id: string; label: string; w: number; h: number }
export const SIZES: CardSize[] = [
  { id: 'us', label: 'US business card 3.5 × 2 in', w: 88.9, h: 50.8 },
  { id: 'eu', label: 'EU business card 85 × 55 mm', w: 85, h: 55 },
  { id: 'cr80', label: 'Credit-card size 85.6 × 54 mm', w: 85.6, h: 53.98 },
  { id: 'big', label: 'Large 100 × 70 mm', w: 100, h: 70 },
]
export const PAGES: Record<string, { label: string; w: number; h: number }> = {
  letter: { label: 'US Letter', w: 215.9, h: 279.4 },
  a4: { label: 'A4', w: 210, h: 297 },
}

/** Best rows × columns for n stamps inside a w × h box: maximises the stamp diameter. */
export function stampGrid(n: number, w: number, h: number, gapRatio = 0.22): { cols: number; rows: number; d: number } {
  let best = { cols: n, rows: 1, d: 0 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    if (rows * cols - n >= cols) continue
    const d = Math.min(w / (cols + (cols - 1) * gapRatio), h / (rows + (rows - 1) * gapRatio))
    if (d > best.d + 1e-9 || (Math.abs(d - best.d) < 1e-9 && rows * cols - n < best.rows * best.cols - n)) best = { cols, rows, d }
  }
  return best
}

export interface Sheet { cols: number; rows: number; perPage: number; x0: number; y0: number; cw: number; ch: number; gap: number; rotated: boolean }

/** How many cards fit a page (optionally rotating the card 90°), centred. */
export function layoutSheet(pw: number, ph: number, cw: number, ch: number, margin: number, gap: number, allowRotate = true): Sheet {
  const fit = (w: number, h: number) => {
    const cols = Math.max(0, Math.floor((pw - 2 * margin + gap) / (w + gap)))
    const rows = Math.max(0, Math.floor((ph - 2 * margin + gap) / (h + gap)))
    return { cols, rows, n: cols * rows }
  }
  const a = fit(cw, ch)
  const b = allowRotate ? fit(ch, cw) : { cols: 0, rows: 0, n: 0 }
  const rotated = b.n > a.n
  const f = rotated ? b : a
  const w = rotated ? ch : cw, h = rotated ? cw : ch
  const usedW = f.cols * w + Math.max(0, f.cols - 1) * gap
  const usedH = f.rows * h + Math.max(0, f.rows - 1) * gap
  return { cols: f.cols, rows: f.rows, perPage: f.n, x0: (pw - usedW) / 2, y0: (ph - usedH) / 2, cw: w, ch: h, gap, rotated }
}

/** Slot positions (top-left, mm). For backs printed duplex (flip on long edge) columns are mirrored. */
export function slots(s: Sheet, back = false): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      const cc = back ? s.cols - 1 - c : c
      out.push({ x: s.x0 + cc * (s.cw + s.gap), y: s.y0 + r * (s.ch + s.gap) })
    }
  return out
}

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FONTS: Record<Design['font'], string> = {
  sans: "'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif",
  mono: "'Courier New', ui-monospace, monospace",
}

/** Wraps text into lines of at most `max` characters (greedy, word based). */
export function wrap(text: string, max: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + w).length > max) {
        out.push(line)
        line = w
      } else line = line ? `${line} ${w}` : w
    }
    out.push(line)
  }
  return out
}

/** One card face as an SVG fragment in mm (no outer <svg>), origin at its top-left corner. */
export function cardBody(d: Design, w: number, h: number, side: 'front' | 'back'): string {
  const font = FONTS[d.font]
  const r = Math.min(d.radius, Math.min(w, h) / 4)
  const id = `g${Math.round(w * 10)}${side}`
  const parts: string[] = [
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(d.bg)}"/><stop offset="1" stop-color="${esc(d.bg2)}"/></linearGradient><clipPath id="c${id}"><rect width="${w}" height="${h}" rx="${r}"/></clipPath></defs>`,
    `<rect width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>`,
  ]
  const pad = Math.min(w, h) * 0.075
  if (side === 'front') {
    const logoS = d.logo ? h * 0.2 : 0
    if (d.logo) parts.push(`<image href="${esc(d.logo)}" x="${pad}" y="${pad}" width="${logoS}" height="${logoS}" preserveAspectRatio="xMidYMid meet"/>`)
    const tx = pad + (logoS ? logoS + pad * 0.6 : 0)
    parts.push(`<text x="${tx}" y="${pad + h * 0.085}" font-family="${font}" font-weight="700" font-size="${h * 0.1}" fill="${esc(d.ink)}">${esc(d.business)}</text>`)
    if (d.tagline) parts.push(`<text x="${tx}" y="${pad + h * 0.16}" font-family="${font}" font-size="${h * 0.055}" fill="${esc(d.ink)}" opacity="0.75">${esc(d.tagline)}</text>`)
    const gy = pad + h * 0.24, gh = h - gy - pad - h * 0.1
    const g = stampGrid(d.stamps, w - 2 * pad, gh)
    const gap = g.d * 0.22
    const gw = g.cols * g.d + (g.cols - 1) * gap, ghh = g.rows * g.d + (g.rows - 1) * gap
    const ox = (w - gw) / 2, oy = gy + (gh - ghh) / 2
    for (let i = 0; i < d.stamps; i++) {
      const c = i % g.cols, row = Math.floor(i / g.cols)
      const lastRow = row === g.rows - 1
      const inRow = lastRow ? d.stamps - row * g.cols : g.cols
      const shift = lastRow ? ((g.cols - inRow) * (g.d + gap)) / 2 : 0
      const cx = ox + shift + c * (g.d + gap) + g.d / 2, cy = oy + row * (g.d + gap) + g.d / 2
      const free = d.freeLast && i === d.stamps - 1
      const stamped = i < d.preview
      const rr = d.shape === 'circle' ? g.d / 2 : d.shape === 'rounded' ? g.d * 0.22 : g.d * 0.04
      parts.push(`<rect x="${cx - g.d / 2}" y="${cy - g.d / 2}" width="${g.d}" height="${g.d}" rx="${rr}" fill="${free ? esc(d.accent) : '#ffffff'}" fill-opacity="${free ? 1 : 0.9}" stroke="${esc(d.accent)}" stroke-width="${g.d * 0.05}" ${free ? '' : `stroke-dasharray="${g.d * 0.12} ${g.d * 0.07}"`}/>`)
      if (free) parts.push(`<text x="${cx}" y="${cy + g.d * 0.12}" text-anchor="middle" font-family="${font}" font-weight="800" font-size="${g.d * 0.3}" fill="#ffffff">FREE</text>`)
      else if (stamped) parts.push(`<text x="${cx}" y="${cy + g.d * 0.2}" text-anchor="middle" font-size="${g.d * 0.56}" fill="${esc(d.accent)}" transform="rotate(${((i * 37) % 30) - 15} ${cx} ${cy})">${esc(d.icon)}</text>`)
      else if (d.numbers) parts.push(`<text x="${cx}" y="${cy + g.d * 0.13}" text-anchor="middle" font-family="${font}" font-size="${g.d * 0.36}" fill="${esc(d.accent)}" opacity="0.45">${i + 1}</text>`)
    }
    parts.push(`<text x="${w / 2}" y="${h - pad * 0.95}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${h * 0.06}" fill="${esc(d.accent)}">${esc(d.reward)}</text>`)
  } else {
    parts.push(`<rect width="${w}" height="${h * 0.045}" fill="${esc(d.accent)}" clip-path="url(#c${id})"/>`)
    let y = pad + h * 0.12
    parts.push(`<text x="${pad}" y="${y}" font-family="${font}" font-weight="700" font-size="${h * 0.08}" fill="${esc(d.ink)}">${esc(d.backTitle)}</text>`)
    y += h * 0.1
    const fs = h * 0.048
    const maxChars = Math.floor((w - 2 * pad) / (fs * 0.5))
    for (const line of wrap(d.terms, maxChars).slice(0, 4)) {
      parts.push(`<text x="${pad}" y="${y}" font-family="${font}" font-size="${fs}" fill="${esc(d.ink)}" opacity="0.8">${esc(line)}</text>`)
      y += fs * 1.35
    }
    const lines: string[] = []
    if (d.nameLine) lines.push('Name')
    if (d.expiryLine) lines.push('Valid until')
    let ly = h - pad - h * 0.13 - lines.length * h * 0.11
    for (const l of lines) {
      parts.push(`<text x="${pad}" y="${ly}" font-family="${font}" font-size="${fs}" fill="${esc(d.ink)}">${l}</text><line x1="${pad + fs * 5.2}" x2="${w - pad}" y1="${ly + 0.4}" y2="${ly + 0.4}" stroke="${esc(d.ink)}" stroke-width="0.2" opacity="0.6"/>`)
      ly += h * 0.11
    }
    const contact = [d.address, [d.phone, d.web].filter(Boolean).join('  ·  ')].filter(Boolean)
    contact.forEach((c, i) => parts.push(`<text x="${w / 2}" y="${h - pad - (contact.length - 1 - i) * fs * 1.3}" text-anchor="middle" font-family="${font}" font-size="${fs}" fill="${esc(d.ink)}" opacity="0.85">${esc(c)}</text>`))
  }
  return parts.join('')
}

/** A standalone SVG for one card face, sized in millimetres. */
export function cardSvg(d: Design, w: number, h: number, side: 'front' | 'back'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${cardBody(d, w, h, side)}</svg>`
}

/** A full print page (SVG, mm) with cards placed per `layoutSheet` and optional crop marks. */
export function sheetSvg(d: Design, pw: number, ph: number, card: CardSize, s: Sheet, side: 'front' | 'back', cropMarks: boolean, count = s.perPage): string {
  const parts: string[] = []
  slots(s, side === 'back').slice(0, count).forEach((p) => {
    const body = cardBody(d, card.w, card.h, side)
    // duplex flip on the long edge mirrors left/right, so rotated backs turn the other way
    const tr = !s.rotated ? `translate(${p.x} ${p.y})` : side === 'back' ? `translate(${p.x} ${p.y + s.ch}) rotate(-90)` : `translate(${p.x + s.cw} ${p.y}) rotate(90)`
    parts.push(`<g transform="${tr}">${body}</g>`)
  })
  if (cropMarks) {
    const xs = new Set<number>(), ys = new Set<number>()
    for (const p of slots(s)) {
      xs.add(+p.x.toFixed(3)); xs.add(+(p.x + s.cw).toFixed(3))
      ys.add(+p.y.toFixed(3)); ys.add(+(p.y + s.ch).toFixed(3))
    }
    const L = 4
    const m: string[] = []
    const top = s.y0, bot = s.y0 + s.rows * s.ch + (s.rows - 1) * s.gap, left = s.x0, right = s.x0 + s.cols * s.cw + (s.cols - 1) * s.gap
    for (const x of xs) m.push(`M${x} ${top - 1.5}v${-L}M${x} ${bot + 1.5}v${L}`)
    for (const y of ys) m.push(`M${left - 1.5} ${y}h${-L}M${right + 1.5} ${y}h${L}`)
    parts.push(`<path d="${m.join('')}" stroke="#000" stroke-width="0.15" fill="none"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}">${parts.join('')}</svg>`
}
