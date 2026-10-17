// QR payload builders (URL, Wi-Fi, vCard, e-mail, SMS, geo, calendar event) and a styled SVG renderer
// on top of the QR encoder in barcode-label-maker.
import { qr, type Ecl } from './barcode-label-maker'

export type ContentType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'geo' | 'event'

export interface Fields { [k: string]: string }

/** Escapes \ ; , : " for the MECARD-like Wi-Fi syntax. */
export const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')
/** Escapes text values in vCard / iCalendar. */
export const vEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

/** "2026-10-20T09:30" → "20261020T093000" (floating local time). */
export function icsDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v)
  if (!m) return ''
  return m[4] ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : `${m[1]}${m[2]}${m[3]}`
}

export function payload(t: ContentType, f: Fields): string {
  const g = (k: string) => (f[k] ?? '').trim()
  switch (t) {
    case 'url': {
      const u = g('url')
      return u && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? `https://${u}` : u
    }
    case 'text':
      return f.text ?? ''
    case 'wifi': {
      const sec = g('sec') || 'WPA'
      return `WIFI:T:${sec === 'none' ? 'nopass' : sec};S:${wifiEsc(g('ssid'))};${sec === 'none' ? '' : `P:${wifiEsc(f.pass ?? '')};`}${g('hidden') === 'true' ? 'H:true;' : ''};`
    }
    case 'vcard': {
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(g('last'))};${vEsc(g('first'))};;;`, `FN:${vEsc([g('first'), g('last')].filter(Boolean).join(' '))}`]
      if (g('org')) L.push(`ORG:${vEsc(g('org'))}`)
      if (g('title')) L.push(`TITLE:${vEsc(g('title'))}`)
      if (g('phone')) L.push(`TEL;TYPE=CELL:${g('phone')}`)
      if (g('email')) L.push(`EMAIL:${g('email')}`)
      if (g('web')) L.push(`URL:${g('web')}`)
      if (g('street') || g('city') || g('country')) L.push(`ADR;TYPE=WORK:;;${vEsc(g('street'))};${vEsc(g('city'))};;${vEsc(g('zip'))};${vEsc(g('country'))}`)
      L.push('END:VCARD')
      return L.join('\n')
    }
    case 'email': {
      const q = [g('subject') && `subject=${encodeURIComponent(g('subject'))}`, g('body') && `body=${encodeURIComponent(f.body ?? '')}`].filter(Boolean).join('&')
      return `mailto:${g('to')}${q ? `?${q}` : ''}`
    }
    case 'sms':
      return `SMSTO:${g('phone')}:${f.msg ?? ''}`
    case 'geo': {
      const lat = Number(g('lat')), lon = Number(g('lon'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
      return `geo:${+lat.toFixed(6)},${+lon.toFixed(6)}${g('label') ? `?q=${+lat.toFixed(6)},${+lon.toFixed(6)}(${encodeURIComponent(g('label'))})` : ''}`
    }
    case 'event': {
      const L = ['BEGIN:VEVENT', `SUMMARY:${vEsc(g('summary'))}`, `DTSTART:${icsDate(g('start'))}`]
      if (g('end')) L.push(`DTEND:${icsDate(g('end'))}`)
      if (g('location')) L.push(`LOCATION:${vEsc(g('location'))}`)
      if (g('desc')) L.push(`DESCRIPTION:${vEsc(g('desc'))}`)
      L.push('END:VEVENT')
      return L.join('\n')
    }
  }
}

/** Problems that would make a code unusable. */
export function validate(t: ContentType, f: Fields): string[] {
  const e: string[] = []
  const g = (k: string) => (f[k] ?? '').trim()
  if (t === 'url' && !g('url')) e.push('Enter a URL')
  if (t === 'url' && g('url') && /\s/.test(g('url'))) e.push('URLs cannot contain spaces')
  if (t === 'wifi' && !g('ssid')) e.push('Network name (SSID) is required')
  if (t === 'wifi' && g('sec') === 'WPA' && (f.pass ?? '').length > 0 && (f.pass ?? '').length < 8) e.push('WPA passwords are 8–63 characters')
  if (t === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('to'))) e.push('Enter a valid e-mail address')
  if (t === 'sms' && !/^\+?[\d\s()-]{3,}$/.test(g('phone'))) e.push('Enter a phone number')
  if (t === 'geo' && (!(Math.abs(Number(g('lat'))) <= 90) || !(Math.abs(Number(g('lon'))) <= 180) || !g('lat') || !g('lon'))) e.push('Latitude must be −90…90 and longitude −180…180')
  if (t === 'event' && !icsDate(g('start'))) e.push('Event needs a start date')
  if (t === 'event' && g('end') && icsDate(g('end')) < icsDate(g('start'))) e.push('Event ends before it starts')
  if (t === 'vcard' && !g('first') && !g('last')) e.push('Enter a name')
  if (t === 'text' && !(f.text ?? '')) e.push('Enter some text')
  return e
}

// ---------- rendering ----------

export type Dot = 'square' | 'rounded' | 'dots' | 'vertical'
export type Eye = 'square' | 'rounded' | 'circle'

export interface Style {
  fg: string; fg2: string; gradient: boolean; bg: string; transparent: boolean
  dot: Dot; eye: Eye; eyeColor: string; margin: number
  logo: string; logoSize: number // logo: data URL or '' ; logoSize: fraction of code width (0.1–0.3)
}

/** Relative luminance-based contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const inEye = (x: number, y: number, n: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)

/** Builds a standalone SVG for the given QR text and style. */
export function toSvg(text: string, ecl: Ecl, st: Style, px = 512): { svg: string; version: number; size: number } {
  const q = qr(text, ecl)
  const n = q.size, m = st.margin, W = n + 2 * m
  const logoW = st.logo ? Math.round(n * st.logoSize) | 1 : 0
  const l0 = (n - logoW) / 2 - 0.5, l1 = (n + logoW) / 2 + 0.5
  const covered = (x: number, y: number) => logoW > 0 && x + 1 > l0 && x < l1 && y + 1 > l0 && y < l1
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && q.modules[y][x] && !inEye(x, y, n) && !covered(x, y)
  const parts: string[] = []
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!on(x, y)) continue
      const X = x + m, Y = y + m
      if (st.dot === 'square') parts.push(`M${X} ${Y}h1v1h-1z`)
      else if (st.dot === 'dots') parts.push(`M${X + 0.5} ${Y + 0.08}a.42 .42 0 1 1 0 .84a.42 .42 0 1 1 0-.84z`)
      else if (st.dot === 'vertical') {
        if (on(x, y - 1)) continue // drawn as part of a run starting above
        let len = 1
        while (on(x, y + len)) len++
        parts.push(`M${X + 0.5} ${Y + 0.1}a.4 .4 0 0 1 .4 .4v${len - 1}a.4 .4 0 0 1 -.8 0v-${len - 1}a.4 .4 0 0 1 .4 -.4z`)
      } else {
        // rounded: round only the corners that have no neighbour
        const t = on(x, y - 1), b = on(x, y + 1), l = on(x - 1, y), r = on(x + 1, y)
        const k = 0.5
        const tl = !t && !l ? k : 0, tr = !t && !r ? k : 0, br = !b && !r ? k : 0, bl = !b && !l ? k : 0
        parts.push(`M${X + tl} ${Y}h${1 - tl - tr}${tr ? `a${tr} ${tr} 0 0 1 ${tr} ${tr}` : ''}v${1 - tr - br}${br ? `a${br} ${br} 0 0 1 -${br} ${br}` : ''}h-${1 - br - bl}${bl ? `a${bl} ${bl} 0 0 1 -${bl} -${bl}` : ''}v-${1 - bl - tl}${tl ? `a${tl} ${tl} 0 0 1 ${tl} -${tl}` : ''}z`)
      }
    }
  const eyes: string[] = []
  for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const X = ex + m, Y = ey + m
    if (st.eye === 'circle') {
      eyes.push(`M${X + 3.5} ${Y}a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7zM${X + 3.5} ${Y + 1}a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z`)
      eyes.push(`M${X + 3.5} ${Y + 2}a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z`)
    } else {
      const r = st.eye === 'rounded' ? 1.6 : 0, ri = st.eye === 'rounded' ? 1 : 0, rc = st.eye === 'rounded' ? 0.8 : 0
      const rr = (x: number, y: number, w: number, rad: number, ccw = false) =>
        rad ? (ccw
          ? `M${x + rad} ${y}a${rad} ${rad} 0 0 0 -${rad} ${rad}v${w - 2 * rad}a${rad} ${rad} 0 0 0 ${rad} ${rad}h${w - 2 * rad}a${rad} ${rad} 0 0 0 ${rad} -${rad}v-${w - 2 * rad}a${rad} ${rad} 0 0 0 -${rad} -${rad}z`
          : `M${x + rad} ${y}h${w - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${w - 2 * rad}a${rad} ${rad} 0 0 1 -${rad} ${rad}h-${w - 2 * rad}a${rad} ${rad} 0 0 1 -${rad} -${rad}v-${w - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} -${rad}z`)
          : ccw ? `M${x} ${y}v${w}h${w}v-${w}z` : `M${x} ${y}h${w}v${w}h-${w}z`
      eyes.push(rr(X, Y, 7, r) + rr(X + 1, Y + 1, 5, ri, true))
      eyes.push(rr(X + 2, Y + 2, 3, rc))
    }
  }
  const fill = st.gradient ? 'url(#g)' : st.fg
  const defs = st.gradient ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st.fg}"/><stop offset="1" stop-color="${st.fg2}"/></linearGradient></defs>` : ''
  const bg = st.transparent ? '' : `<rect width="${W}" height="${W}" fill="${st.bg}"/>`
  let logo = ''
  if (st.logo) {
    const pad = 0.6
    const c = W / 2
    logo = `<rect x="${c - logoW / 2 - pad}" y="${c - logoW / 2 - pad}" width="${logoW + 2 * pad}" height="${logoW + 2 * pad}" rx="${(logoW + 2 * pad) * 0.18}" fill="${st.transparent ? '#ffffff' : st.bg}"/><image href="${st.logo}" x="${c - logoW / 2}" y="${c - logoW / 2}" width="${logoW}" height="${logoW}" preserveAspectRatio="xMidYMid meet"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${px}" height="${px}" shape-rendering="${st.dot === 'square' ? 'crispEdges' : 'geometricPrecision'}">${defs}${bg}<path fill="${fill}" d="${parts.join('')}"/><path fill="${st.eyeColor || fill}" fill-rule="evenodd" d="${eyes.join('')}"/>${logo}</svg>`
  return { svg, version: q.version, size: n }
}
