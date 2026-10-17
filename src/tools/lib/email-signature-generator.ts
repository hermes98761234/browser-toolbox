// Builds table-based, inline-styled HTML email signatures (works in Gmail, Outlook, Apple Mail).

export type Layout = 'classic' | 'stacked' | 'minimal' | 'banner'

export interface Sig {
  name: string
  title: string
  company: string
  phone: string
  mobile: string
  email: string
  website: string
  address: string
  logo: string // URL or data URI
  logoSize: number
  accent: string
  font: string
  layout: Layout
  linkedin: string
  x: string
  github: string
  instagram: string
  cta: string
  ctaUrl: string
  disclaimer: string
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Adds https:// to bare domains; refuses javascript: and other non-web schemes. */
export function safeUrl(u: string): string {
  const t = u.trim()
  if (!t) return ''
  if (/^(https?:|mailto:|tel:|data:image\/)/i.test(t)) return t
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return ''
  return `https://${t.replace(/^\/+/, '')}`
}

export const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
const display = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/$/, '')

const SOCIAL: [keyof Sig, string, string][] = [
  ['linkedin', 'in', '#0a66c2'],
  ['x', '𝕏', '#111111'],
  ['github', 'GH', '#24292f'],
  ['instagram', 'IG', '#d62976'],
]

export function buildSignature(s: Sig): string {
  const f = `font-family:${s.font};`
  const muted = 'color:#6b7280;'
  const a = (href: string, text: string, style = '') => `<a href="${esc(href)}" style="color:${s.accent};text-decoration:none;${style}">${esc(text)}</a>`
  const lines: string[] = []
  const contact: string[] = []
  if (s.phone) contact.push(`<span style="${muted}">P</span>&nbsp;${a(telHref(s.phone), s.phone, 'color:#374151;')}`)
  if (s.mobile) contact.push(`<span style="${muted}">M</span>&nbsp;${a(telHref(s.mobile), s.mobile, 'color:#374151;')}`)
  if (contact.length) lines.push(contact.join('&nbsp;&nbsp;|&nbsp;&nbsp;'))
  const web: string[] = []
  if (s.email) web.push(a(`mailto:${s.email.trim()}`, s.email.trim()))
  if (safeUrl(s.website)) web.push(a(safeUrl(s.website), display(s.website.trim())))
  if (web.length) lines.push(web.join('&nbsp;&nbsp;|&nbsp;&nbsp;'))
  if (s.address) lines.push(`<span style="${muted}">${esc(s.address)}</span>`)
  const socials = SOCIAL.filter(([k]) => safeUrl(String(s[k])))
    .map(([k, label, bg]) => `<td style="padding:0 4px 0 0;"><a href="${esc(safeUrl(String(s[k])))}" style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:4px;background:${bg};color:#ffffff;font-size:11px;font-weight:bold;text-decoration:none;${f}">${label}</a></td>`)
    .join('')
  const socialRow = socials ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>${socials}</tr></table>` : ''
  const cta = s.cta && safeUrl(s.ctaUrl)
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr><td style="background:${s.accent};border-radius:4px;padding:6px 12px;"><a href="${esc(safeUrl(s.ctaUrl))}" style="color:#ffffff;text-decoration:none;font-size:12px;font-weight:bold;${f}">${esc(s.cta)}</a></td></tr></table>`
    : ''
  const nameBlock =
    `<div style="font-size:16px;font-weight:bold;color:#111827;${f}">${esc(s.name)}</div>` +
    (s.title || s.company ? `<div style="font-size:13px;color:${s.accent};${f}">${esc([s.title, s.company].filter(Boolean).join(s.layout === 'minimal' ? ', ' : ' · '))}</div>` : '')
  const info = `<div style="font-size:12px;line-height:19px;color:#374151;margin-top:6px;${f}">${lines.join('<br>')}</div>`
  const logo = safeUrl(s.logo) ? `<img src="${esc(safeUrl(s.logo))}" alt="${esc(s.company || s.name)}" width="${s.logoSize}" style="display:block;width:${s.logoSize}px;max-width:${s.logoSize}px;height:auto;border:0;border-radius:6px;">` : ''
  const disc = s.disclaimer ? `<tr><td colspan="3" style="padding-top:12px;font-size:10px;line-height:14px;color:#9ca3af;${f}">${esc(s.disclaimer)}</td></tr>` : ''
  const open = `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${f}">`

  if (s.layout === 'stacked' || s.layout === 'minimal') {
    const top = s.layout === 'stacked' && logo ? `<tr><td style="padding-bottom:10px;">${logo}</td></tr>` : ''
    return `${open}${top}<tr><td style="${s.layout === 'stacked' ? `border-top:2px solid ${s.accent};padding-top:10px;` : ''}">${nameBlock}${info}${socialRow}${cta}</td></tr>${disc.replace('colspan="3"', '')}</table>`
  }
  if (s.layout === 'banner') {
    return `${open}<tr><td style="background:${s.accent};height:4px;font-size:0;line-height:0;" colspan="3">&nbsp;</td></tr><tr>${logo ? `<td valign="middle" style="padding:12px 14px 12px 0;">${logo}</td>` : ''}<td valign="middle" style="padding:12px 0;">${nameBlock}${info}</td></tr><tr><td colspan="3" style="border-top:1px solid #e5e7eb;padding-top:4px;">${socialRow}${cta}</td></tr>${disc}</table>`
  }
  return `${open}<tr>${logo ? `<td valign="top" style="padding-right:14px;">${logo}</td><td style="border-left:2px solid ${s.accent};padding:0 0 0 14px;" valign="top">` : '<td valign="top">'}${nameBlock}${info}${socialRow}${cta}</td></tr>${disc}</table>`
}

/** Plain-text version for clients that strip HTML. */
export function plainSignature(s: Sig): string {
  return [
    '--',
    s.name,
    [s.title, s.company].filter(Boolean).join(', '),
    [s.phone && `P ${s.phone}`, s.mobile && `M ${s.mobile}`].filter(Boolean).join(' | '),
    [s.email, s.website].filter(Boolean).join(' | '),
    s.address,
    s.disclaimer,
  ].filter(Boolean).join('\n')
}
