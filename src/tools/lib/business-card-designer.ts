// Business card layout engine: templates → device-independent primitives (mm, top-left origin of the
// trim box), shared by the SVG preview and the vector PDF export. Also sheet imposition and vCard text.
import { payload } from './qr-code-generator'

export interface CardData {
  name: string; title: string; company: string; tagline: string
  phone: string; email: string; web: string; address: string
  accent: string; ink: string; paper: string; font: Font
  template: TemplateId; qr: 'none' | 'front' | 'back'; qrContent: 'vcard' | 'url'
}
export type Font = 'sans' | 'serif' | 'mono'
export type TemplateId = 'classic' | 'band' | 'split' | 'centered' | 'minimal'

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'text'; x: number; y: number; pt: number; text: string; fill: string; bold?: boolean; anchor?: 'start' | 'middle' | 'end'; caps?: boolean }
  | { t: 'qr'; x: number; y: number; size: number; text: string; fill: string }

export const SIZES: Record<string, { label: string; w: number; h: number; bleed: number }> = {
  us: { label: 'US 3.5 × 2 in', w: 88.9, h: 50.8, bleed: 3.175 },
  eu: { label: 'EU 85 × 55 mm', w: 85, h: 55, bleed: 3 },
  jp: { label: 'Japan 91 × 55 mm', w: 91, h: 55, bleed: 3 },
  au: { label: 'AU 90 × 55 mm', w: 90, h: 55, bleed: 3 },
}

export const TEMPLATES: [TemplateId, string][] = [['classic', 'Classic'], ['band', 'Color band'], ['split', 'Split panel'], ['centered', 'Centered'], ['minimal', 'Minimal']]

export const PT = 25.4 / 72 // mm per point

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** Relative luminance-based choice of readable text color on a background. */
export function onColor(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff'
}

/** Payload encoded in the QR code. */
export function qrText(d: CardData): string {
  if (d.qrContent === 'url') return d.web.trim() ? (/^[a-z]+:/i.test(d.web.trim()) ? d.web.trim() : `https://${d.web.trim()}`) : ''
  const parts = d.name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  const [street = '', city = ''] = d.address.split(',').map((x) => x.trim())
  return payload('vcard', { first: parts.join(' '), last, org: d.company, title: d.title, phone: d.phone, email: d.email, web: d.web, street, city })
}

/** Shrinks a text's point size so its approximate width fits `maxW` mm. */
function fit<T extends Extract<Prim, { t: 'text' }>>(p: T, maxW: number, font: Font = 'sans'): T {
  const tw = approxWidth(p.caps ? p.text.toUpperCase() : p.text, p.pt, p.bold, font)
  return tw > maxW ? { ...p, pt: Math.max(4, (p.pt * maxW) / tw) } : p
}

const contactLines = (d: CardData) => [d.phone, d.email, d.web, d.address].map((x) => x.trim()).filter(Boolean)

/** Front side primitives. `w`,`h` = trim size, `b` = bleed (backgrounds extend into it). */
export function front(d: CardData, w: number, h: number, b: number): Prim[] {
  const P: Prim[] = [{ t: 'rect', x: -b, y: -b, w: w + 2 * b, h: h + 2 * b, fill: d.paper }]
  const lines = contactLines(d)
  const qrOn = d.qr === 'front' && !!qrText(d)
  const qs = h * 0.36
  const m = 6
  switch (d.template) {
    case 'classic': {
      P.push({ t: 'rect', x: -b, y: -b, w: b + 2.2, h: h + 2 * b, fill: d.accent })
      P.push(fit({ t: 'text', x: m + 2, y: 15, pt: 15, text: d.name, fill: d.ink, bold: true }, w - m - 5, d.font))
      P.push({ t: 'text', x: m + 2, y: 20.5, pt: 8, text: d.title, fill: d.accent, bold: true, caps: true })
      P.push({ t: 'text', x: m + 2, y: 25, pt: 7.5, text: d.company, fill: d.ink })
      lines.forEach((l, i) => P.push({ t: 'text', x: m + 2, y: h - m - (lines.length - 1 - i) * 3.6, pt: 6.8, text: l, fill: d.ink }))
      if (qrOn) P.push({ t: 'qr', x: w - m - qs, y: h - m - qs, size: qs, text: qrText(d), fill: d.ink })
      break
    }
    case 'band': {
      const bh = h * 0.44
      P.push({ t: 'rect', x: -b, y: -b, w: w + 2 * b, h: bh + b, fill: d.accent })
      const on = onColor(d.accent)
      P.push(fit({ t: 'text', x: m, y: bh - 9, pt: 14, text: d.name, fill: on, bold: true }, w - 2 * m, d.font))
      P.push({ t: 'text', x: m, y: bh - 4, pt: 7.5, text: [d.title, d.company].filter(Boolean).join(' · '), fill: on })
      lines.forEach((l, i) => P.push({ t: 'text', x: m, y: bh + 7 + i * 3.7, pt: 6.8, text: l, fill: d.ink }))
      if (qrOn) P.push({ t: 'qr', x: w - m - qs, y: h - m + 1 - qs, size: qs, text: qrText(d), fill: d.ink })
      break
    }
    case 'split': {
      const pw = w * 0.36
      P.push({ t: 'rect', x: -b, y: -b, w: pw + b, h: h + 2 * b, fill: d.accent })
      const on = onColor(d.accent)
      P.push({ t: 'circle', cx: pw / 2, cy: h / 2 - 4, r: 9, fill: on })
      P.push({ t: 'text', x: pw / 2, y: h / 2 - 4 + 3.6, pt: 14, text: initials(d.name), fill: d.accent, bold: true, anchor: 'middle' })
      P.push(fit({ t: 'text', x: pw / 2 + 1, y: h / 2 + 12, pt: 7, text: d.company, fill: on, bold: true, anchor: 'middle', caps: true }, pw - 6, d.font))
      const x = pw + 5
      P.push(fit({ t: 'text', x, y: 13, pt: 13, text: d.name, fill: d.ink, bold: true }, w - x - 3.5, d.font))
      P.push({ t: 'text', x, y: 18, pt: 7.5, text: d.title, fill: d.accent, bold: true })
      lines.forEach((l, i) => P.push({ t: 'text', x, y: h - m - (lines.length - 1 - i) * 3.6, pt: 6.5, text: l, fill: d.ink }))
      if (qrOn) P.push({ t: 'qr', x: w - 4 - h * 0.26, y: 4, size: h * 0.26, text: qrText(d), fill: d.ink })
      break
    }
    case 'centered': {
      P.push({ t: 'rect', x: -b, y: -b, w: w + 2 * b, h: h + 2 * b, fill: d.accent })
      const on = onColor(d.accent)
      const top = qrOn ? h / 2 - 8 : h / 2 - 2
      P.push(fit({ t: 'text', x: w / 2, y: top, pt: 16, text: d.name, fill: on, bold: true, anchor: 'middle' }, w - 8, d.font))
      P.push({ t: 'rect', x: w / 2 - 8, y: top + 3, w: 16, h: 0.5, fill: on })
      P.push({ t: 'text', x: w / 2, y: top + 8.5, pt: 8, text: d.title, fill: on, anchor: 'middle', caps: true })
      P.push({ t: 'text', x: w / 2, y: top + 13, pt: 7, text: d.company, fill: on, anchor: 'middle' })
      if (qrOn) P.push({ t: 'qr', x: w / 2 - h * 0.13, y: h - 4 - h * 0.26, size: h * 0.26, text: qrText(d), fill: on })
      break
    }
    case 'minimal': {
      P.push({ t: 'rect', x: m, y: h - m - 11, w: 10, h: 0.7, fill: d.accent })
      P.push(fit({ t: 'text', x: m, y: h - m - 4, pt: 13, text: d.name, fill: d.ink, bold: true }, w - 2 * m - (qrOn ? h * 0.3 + 2 : 0), d.font))
      P.push({ t: 'text', x: m, y: h - m, pt: 7, text: [d.title, d.company].filter(Boolean).join(', '), fill: d.ink })
      lines.forEach((l, i) => P.push({ t: 'text', x: w - m, y: m + 3 + i * 3.5, pt: 6.5, text: l, fill: d.ink, anchor: 'end' }))
      if (qrOn) P.push({ t: 'qr', x: w - m - h * 0.3, y: h - m - h * 0.3, size: h * 0.3, text: qrText(d), fill: d.ink })
      break
    }
  }
  return P
}

/** Back side: accent background with company/tagline, or contacts for the centered template, plus optional QR. */
export function back(d: CardData, w: number, h: number, b: number): Prim[] {
  const on = onColor(d.accent)
  const P: Prim[] = []
  const qrOn = d.qr === 'back' && !!qrText(d)
  if (d.template === 'centered') {
    P.push({ t: 'rect', x: -b, y: -b, w: w + 2 * b, h: h + 2 * b, fill: d.paper })
    const lines = contactLines(d)
    const x = qrOn ? 7 : w / 2
    lines.forEach((l, i) => P.push({ t: 'text', x, y: h / 2 - ((lines.length - 1) * 4) / 2 + i * 4 + 1, pt: 7.5, text: l, fill: d.ink, anchor: qrOn ? 'start' : 'middle' }))
    if (qrOn) P.push({ t: 'qr', x: w - 6 - h * 0.42, y: h / 2 - h * 0.21, size: h * 0.42, text: qrText(d), fill: d.ink })
    return P
  }
  P.push({ t: 'rect', x: -b, y: -b, w: w + 2 * b, h: h + 2 * b, fill: d.accent })
  const s = h * 0.5
  const right = qrOn ? w - 5 - s - 4 - 3 : w - 4
  const cx = (4 + right) / 2
  P.push(fit({ t: 'text', x: cx, y: h / 2, pt: 15, text: d.company || d.name, fill: on, bold: true, anchor: 'middle' }, right - 4, d.font))
  if (d.tagline) P.push(fit({ t: 'text', x: cx, y: h / 2 + 6, pt: 7, text: d.tagline, fill: on, anchor: 'middle' }, right - 4, d.font))
  if (qrOn) {
    P.push({ t: 'rect', x: w - 5 - s - 2, y: h / 2 - s / 2 - 2, w: s + 4, h: s + 4, fill: '#ffffff' })
    P.push({ t: 'qr', x: w - 5 - s, y: h / 2 - s / 2, size: s, text: qrText(d), fill: '#111111' })
  }
  return P
}

/** Rough text width (mm) for warnings, using average glyph widths of Helvetica-like fonts. */
export function approxWidth(text: string, pt: number, bold = false, font: Font = 'sans'): number {
  if (font === 'mono') return text.length * 0.6 * pt * PT
  let em = 0
  for (const ch of text) em += ch === ' ' ? 0.28 : /[A-Z0-9@MW]/.test(ch) ? (bold ? 0.7 : 0.64) : /[ijlt.,:;'|!]/.test(ch) ? 0.26 : bold ? 0.58 : 0.53
  return em * pt * PT * (font === 'serif' ? 0.95 : 1)
}

/** Texts that leave the safe zone (3 mm inside the trim). */
export function overflowing(prims: Prim[], w: number, h: number, font: Font, safe = 3, width = approxWidth): string[] {
  const out: string[] = []
  for (const p of prims) {
    if (p.t !== 'text' || !p.text) continue
    const tw = width(p.caps ? p.text.toUpperCase() : p.text, p.pt, p.bold, font)
    const x0 = p.anchor === 'middle' ? p.x - tw / 2 : p.anchor === 'end' ? p.x - tw : p.x
    if (x0 < safe - 0.01 || x0 + tw > w - safe + 0.01 || p.y > h - safe + 0.5 || p.y - p.pt * PT < safe - 0.5) out.push(p.text)
  }
  return out
}

/** N-up imposition: card bleed boxes in a centered grid with `gap` mm between them. Returns trim-box origins. */
export function impose(pageW: number, pageH: number, w: number, h: number, bleed: number, margin = 10, gap = 4): { x: number; y: number }[] {
  const bw = w + 2 * bleed, bh = h + 2 * bleed
  const cols = Math.max(0, Math.floor((pageW - 2 * margin + gap) / (bw + gap)))
  const rows = Math.max(0, Math.floor((pageH - 2 * margin + gap) / (bh + gap)))
  const gw = cols * bw + (cols - 1) * gap, gh = rows * bh + (rows - 1) * gap
  const ox = (pageW - gw) / 2, oy = (pageH - gh) / 2
  const out: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: ox + c * (bw + gap) + bleed, y: oy + r * (bh + gap) + bleed })
  return out
}

/** Mirrors positions horizontally for the back side of a long-edge duplex sheet. */
export const mirror = (pos: { x: number; y: number }[], pageW: number, w: number) => pos.map((p) => ({ x: pageW - p.x - w, y: p.y }))
