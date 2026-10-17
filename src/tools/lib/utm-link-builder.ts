// UTM URL building, normalisation and parsing.

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_source_platform'] as const
export type UtmKey = (typeof UTM_KEYS)[number]
export type Utm = Partial<Record<UtmKey, string>>

export interface NormOpts {
  lower: boolean
  space: '-' | '_' | '+' | 'keep'
  strip: boolean // drop characters other than letters, digits, - _ . + ~
}

export function normalize(v: string, o: NormOpts): string {
  let s = v.trim()
  if (o.lower) s = s.toLowerCase()
  if (o.space !== 'keep') s = s.replace(/\s+/g, o.space)
  if (o.strip) s = s.replace(/[^\p{L}\p{N}\-_.+~]/gu, '')
  return s
}

/** Adds http(s):// if missing and validates. Returns null when the URL cannot be parsed. */
export function parseBase(raw: string): URL | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`)
    return u.hostname.includes('.') || u.hostname === 'localhost' ? u : null
  } catch {
    return null
  }
}

/**
 * Builds the tagged URL: keeps existing query params and #hash, replaces existing utm_* values,
 * and orders UTM params canonically.
 */
export function buildUtm(base: string, utm: Utm, o: NormOpts): string | null {
  const u = parseBase(base)
  if (!u) return null
  for (const k of UTM_KEYS) u.searchParams.delete(k)
  for (const k of UTM_KEYS) {
    const v = utm[k]
    if (v && v.trim()) u.searchParams.set(k, normalize(v, o))
  }
  return u.toString()
}

/** Reads UTM values (and the clean base) from a tagged URL. */
export function parseUtm(url: string): { base: string; utm: Utm; other: number } | null {
  const u = parseBase(url)
  if (!u) return null
  const utm: Utm = {}
  for (const k of UTM_KEYS) {
    const v = u.searchParams.get(k)
    if (v !== null) utm[k] = v
    u.searchParams.delete(k)
  }
  return { base: u.toString(), utm, other: [...u.searchParams.keys()].length }
}

/** Warnings about common tagging mistakes. */
export function lint(utm: Utm, url: string | null): string[] {
  const w: string[] = []
  if (!utm.utm_source?.trim()) w.push('utm_source is required (where the traffic comes from: google, newsletter, facebook…).')
  if (!utm.utm_medium?.trim()) w.push('utm_medium is strongly recommended (cpc, email, social, referral…). GA4 uses it for channel grouping.')
  if (!utm.utm_campaign?.trim()) w.push('utm_campaign is recommended so you can group results by campaign.')
  const m = utm.utm_medium?.trim().toLowerCase()
  if (m && !['cpc', 'ppc', 'paid', 'paidsearch', 'email', 'social', 'paid-social', 'paid_social', 'organic', 'referral', 'display', 'banner', 'cpm', 'affiliate', 'video', 'sms', 'push', 'audio', 'qr', 'print', 'offline'].includes(m))
    w.push(`utm_medium "${utm.utm_medium}" does not match a GA4 default channel; traffic may land in "Unassigned".`)
  if (url && url.length > 2000) w.push('The URL is over 2000 characters; some tools truncate long links.')
  if (Object.values(utm).some((v) => v && /[A-Z]/.test(v))) w.push('UTM values are case-sensitive in analytics: "Facebook" and "facebook" become two sources.')
  return w
}
