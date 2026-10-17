// Meta Tag Previewer: builds <head> meta tags (SEO, Open Graph, Twitter/X), parses them back
// from pasted HTML, truncates text the way result pages do, and lints lengths and images.

export interface Meta {
  title: string; description: string; url: string; siteName: string; image: string; imageAlt: string
  type: 'website' | 'article' | 'product' | 'profile'; card: 'summary' | 'summary_large_image'
  twSite: string; twCreator: string; locale: string; author: string; published: string; themeColor: string; robots: string; keywords: string
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const handle = (h: string) => (h.trim() ? '@' + h.trim().replace(/^@/, '') : '')

export function buildTags(m: Meta): string {
  const L: string[] = []
  const meta = (attr: 'name' | 'property', k: string, v: string) => v.trim() && L.push(`<meta ${attr}="${k}" content="${esc(v.trim())}">`)
  L.push('<!-- Primary -->')
  if (m.title.trim()) L.push(`<title>${esc(m.title.trim())}</title>`)
  meta('name', 'description', m.description)
  if (m.keywords.trim()) meta('name', 'keywords', m.keywords)
  meta('name', 'author', m.author)
  if (m.robots && m.robots !== 'index, follow') meta('name', 'robots', m.robots)
  if (m.url.trim()) L.push(`<link rel="canonical" href="${esc(m.url.trim())}">`)
  meta('name', 'theme-color', m.themeColor)
  L.push('', '<!-- Open Graph / Facebook / LinkedIn -->')
  meta('property', 'og:type', m.type)
  meta('property', 'og:url', m.url)
  meta('property', 'og:title', m.title)
  meta('property', 'og:description', m.description)
  meta('property', 'og:site_name', m.siteName)
  meta('property', 'og:locale', m.locale)
  meta('property', 'og:image', m.image)
  if (m.image.trim()) meta('property', 'og:image:alt', m.imageAlt)
  if (m.type === 'article') {
    meta('property', 'article:published_time', m.published)
    meta('property', 'article:author', m.author)
  }
  L.push('', '<!-- Twitter / X -->')
  meta('name', 'twitter:card', m.card)
  meta('name', 'twitter:site', handle(m.twSite))
  meta('name', 'twitter:creator', handle(m.twCreator))
  meta('name', 'twitter:title', m.title)
  meta('name', 'twitter:description', m.description)
  meta('name', 'twitter:image', m.image)
  if (m.image.trim()) meta('name', 'twitter:image:alt', m.imageAlt)
  return L.join('\n') + '\n'
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Reads meta/title/canonical tags from pasted HTML (attribute order and quotes don't matter). */
export function parseHead(html: string): Partial<Meta> {
  const tags: Record<string, string> = {}
  for (const t of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {}
    for (const a of t.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = unesc(a[3] ?? a[4] ?? a[5] ?? '')
    const k = (attrs.property ?? attrs.name ?? '').toLowerCase()
    if (k && attrs.content !== undefined && !(k in tags)) tags[k] = attrs.content
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const canon = /<link\b[^>]*rel=["']?canonical["']?[^>]*>/i.exec(html)?.[0]
  const href = canon ? /href\s*=\s*["']?([^"'\s>]+)/i.exec(canon)?.[1] : undefined
  const out: Partial<Meta> = {}
  const set = <K extends keyof Meta>(k: K, v: string | undefined) => { if (v !== undefined && v !== '') out[k] = v as Meta[K] }
  set('title', tags['og:title'] ?? tags['twitter:title'] ?? (title ? unesc(title.trim()) : undefined))
  set('description', tags['og:description'] ?? tags.description ?? tags['twitter:description'])
  set('url', tags['og:url'] ?? (href ? unesc(href) : undefined))
  set('siteName', tags['og:site_name'])
  set('image', tags['og:image'] ?? tags['twitter:image'])
  set('imageAlt', tags['og:image:alt'] ?? tags['twitter:image:alt'])
  const ty = tags['og:type']
  if (ty === 'website' || ty === 'article' || ty === 'product' || ty === 'profile') out.type = ty
  const card = tags['twitter:card']
  if (card === 'summary' || card === 'summary_large_image') out.card = card
  set('twSite', tags['twitter:site'])
  set('twCreator', tags['twitter:creator'])
  set('locale', tags['og:locale'])
  set('author', tags.author ?? tags['article:author'])
  set('published', tags['article:published_time'])
  set('themeColor', tags['theme-color'])
  set('robots', tags.robots)
  set('keywords', tags.keywords)
  return out
}

/** Cuts text to fit `maxPx` (measured by `measure`) at a word boundary, adding an ellipsis like result pages do. */
export function fit(text: string, maxPx: number, measure: (s: string) => number, ell = ' ...'): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (measure(t) <= maxPx) return t
  let lo = 0, hi = t.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(t.slice(0, mid) + ell) <= maxPx) lo = mid
    else hi = mid - 1
  }
  let cut = t.slice(0, lo)
  const sp = cut.lastIndexOf(' ')
  if (sp > lo * 0.6) cut = cut.slice(0, sp)
  return cut.replace(/[\s,.;:–-]+$/, '') + ell
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || 'example.com'
  }
}

/** Google-style breadcrumb: host › path › segments. */
export function breadcrumb(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p).replace(/\.\w+$/, ''))
    return [u.origin.replace(/^https?:\/\/(www\.)?/, 'https://'), ...parts].join(' › ')
  } catch {
    return url
  }
}

export interface Lint { tone: 'ok' | 'warn' | 'err'; text: string }

export function lint(m: Meta, titlePx: number, img: { w: number; h: number } | null | 'error'): Lint[] {
  const out: Lint[] = []
  const tl = m.title.trim().length, dl = m.description.trim().length
  if (!tl) out.push({ tone: 'err', text: 'Title is missing.' })
  else if (tl < 30) out.push({ tone: 'warn', text: `Title is short (${tl} chars). 30–60 characters gives search engines and people more to go on.` })
  else if (titlePx > 580 || tl > 60) out.push({ tone: 'warn', text: `Title is ${tl} chars / ~${Math.round(titlePx)} px and will be truncated on Google (about 580 px).` })
  else out.push({ tone: 'ok', text: `Title length ${tl} chars (~${Math.round(titlePx)} px) fits.` })
  if (!dl) out.push({ tone: 'err', text: 'Description is missing — platforms will pick random page text.' })
  else if (dl < 70) out.push({ tone: 'warn', text: `Description is short (${dl} chars). Aim for 70–160.` })
  else if (dl > 160) out.push({ tone: 'warn', text: `Description is ${dl} chars; Google usually shows about 155–160 on desktop.` })
  else out.push({ tone: 'ok', text: `Description length ${dl} chars is in the sweet spot.` })
  if (!/^https:\/\//i.test(m.url.trim())) out.push({ tone: m.url.trim() ? 'warn' : 'err', text: m.url.trim() ? 'Canonical URL should be an absolute https:// address.' : 'Page URL (og:url / canonical) is missing.' })
  if (!m.image.trim()) out.push({ tone: 'err', text: 'No share image: links will show as plain text cards.' })
  else {
    if (!/^https?:\/\//i.test(m.image.trim())) out.push({ tone: 'err', text: 'og:image must be an absolute URL (https://…); relative paths are ignored by crawlers.' })
    if (img === 'error') out.push({ tone: 'warn', text: 'The image URL could not be loaded from this browser (offline, CORS or 404). Check that crawlers can fetch it.' })
    else if (img) {
      const r = img.w / img.h
      if (img.w < 600 || img.h < 315) out.push({ tone: 'warn', text: `Image is ${img.w}×${img.h}px; use at least 1200×630 for sharp large cards.` })
      else if (Math.abs(r - 1.91) > 0.15 && m.card === 'summary_large_image') out.push({ tone: 'warn', text: `Image ratio ${r.toFixed(2)}:1 will be cropped; large cards use 1.91:1 (1200×630).` })
      else out.push({ tone: 'ok', text: `Image ${img.w}×${img.h}px works for large cards.` })
    }
    if (!m.imageAlt.trim()) out.push({ tone: 'warn', text: 'Add image alt text for screen-reader users.' })
  }
  if (!m.siteName.trim()) out.push({ tone: 'warn', text: 'og:site_name is empty; Facebook and Slack show it above the title.' })
  return out
}
