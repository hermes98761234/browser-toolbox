// SVG sprite builder: a tiny XML tokenizer/serializer (no DOM needed), sanitising, id prefixing,
// optional currentColor conversion and <symbol> sprite generation.

export interface XEl { type: 'el'; name: string; attrs: [string, string][]; children: XNode[] }
export interface XText { type: 'text'; text: string; raw?: boolean }
export type XNode = XEl | XText

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&')
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

/** Parses XML into a node list. Comments, PIs and doctypes are dropped; CDATA becomes raw text. */
export function parseXml(src: string): XNode[] {
  const root: XEl = { type: 'el', name: '#root', attrs: [], children: [] }
  const stack: XEl[] = [root]
  let i = 0
  const top = () => stack[stack.length - 1]
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) {
      top().children.push({ type: 'text', text: decode(src.slice(i)) })
      break
    }
    if (lt > i) top().children.push({ type: 'text', text: decode(src.slice(i, lt)) })
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4)
      i = e < 0 ? src.length : e + 3
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9)
      top().children.push({ type: 'text', text: src.slice(lt + 9, e < 0 ? src.length : e), raw: true })
      i = e < 0 ? src.length : e + 3
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2)
      i = e < 0 ? src.length : e + 2
    } else if (src.startsWith('<!', lt)) {
      // doctype, possibly with an internal subset
      let depth = 0, j = lt + 2
      for (; j < src.length; j++) {
        if (src[j] === '[') depth++
        else if (src[j] === ']') depth--
        else if (src[j] === '>' && depth <= 0) break
      }
      i = j + 1
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt)
      const name = src.slice(lt + 2, e).trim()
      // pop to the matching element (tolerates sloppy markup)
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break }
      i = e < 0 ? src.length : e + 1
    } else {
      const m = /^<([A-Za-z_][\w:.-]*)/.exec(src.slice(lt, lt + 200))
      if (!m) {
        top().children.push({ type: 'text', text: '<' })
        i = lt + 1
        continue
      }
      let j = lt + m[0].length
      const attrs: [string, string][] = []
      const re = /\s*([A-Za-z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/y
      for (;;) {
        re.lastIndex = j
        const a = re.exec(src)
        if (!a || a.index !== j) break
        const v = a[2] === undefined ? '' : /^["']/.test(a[2]) ? a[2].slice(1, -1) : a[2]
        attrs.push([a[1], decode(v)])
        j = re.lastIndex
      }
      while (j < src.length && /\s/.test(src[j])) j++
      const selfClose = src[j] === '/'
      const e = src.indexOf('>', j)
      const el: XEl = { type: 'el', name: m[1], attrs, children: [] }
      top().children.push(el)
      if (!selfClose) stack.push(el)
      i = e < 0 ? src.length : e + 1
    }
  }
  return root.children
}

export function serialize(nodes: XNode[], minify = true): string {
  return nodes.map((n) => {
    if (n.type === 'text') {
      if (n.raw) return n.text.includes(']]>') ? escText(n.text) : `<![CDATA[${n.text}]]>`
      const t = minify ? n.text.replace(/\s+/g, ' ') : n.text
      return minify && !t.trim() ? '' : escText(t)
    }
    const attrs = n.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
    return n.children.length ? `<${n.name}${attrs}>${serialize(n.children, minify)}</${n.name}>` : `<${n.name}${attrs}/>`
  }).join('')
}

const get = (el: XEl, k: string) => el.attrs.find(([a]) => a === k)?.[1]

const DROP_EL = /^(script|foreignObject|metadata|title|desc)$/
const DROP_ATTR = /^(on\w+|xmlns(:.*)?|sodipodi:.*|inkscape:.*|xml:space|version|data-.*)$/i
const INHERIT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'opacity', 'color']
const COLOR_KEYS = new Set(['fill', 'stroke', 'stop-color', 'color', 'flood-color', 'lighting-color'])

export type ColorMode = 'keep' | 'current'

export interface Icon { id: string; viewBox: string; rootAttrs: [string, string][]; body: string; warnings: string[]; bytes: number }

/** Converts a name to a safe id fragment. */
export const slug = (s: string) => s.toLowerCase().replace(/\.svg$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'icon'

function isPaint(v: string) {
  const t = v.trim().toLowerCase()
  return t !== '' && t !== 'none' && t !== 'currentcolor' && t !== 'inherit' && t !== 'transparent' && !t.startsWith('url(')
}

/** Cleans one SVG document and turns it into symbol content. */
export function processIcon(svgText: string, id: string, color: ColorMode): Icon {
  const warnings: string[] = []
  const nodes = parseXml(svgText)
  const svg = nodes.find((n): n is XEl => n.type === 'el' && /(^|:)svg$/.test(n.name))
  if (!svg) return { id, viewBox: '0 0 24 24', rootAttrs: [], body: '', warnings: ['No <svg> root element found'], bytes: 0 }
  let vb = get(svg, 'viewBox')
  if (!vb) {
    const w = parseFloat(get(svg, 'width') ?? ''), h = parseFloat(get(svg, 'height') ?? '')
    if (w > 0 && h > 0) {
      vb = `0 0 ${w} ${h}`
      warnings.push('No viewBox — derived from width/height')
    } else {
      vb = '0 0 24 24'
      warnings.push('No viewBox or size — assumed 0 0 24 24')
    }
  }
  // ids → prefixed ids
  const idMap = new Map<string, string>()
  const collect = (n: XNode) => {
    if (n.type !== 'el') return
    const v = get(n, 'id')
    if (v) idMap.set(v, `${id}-${slug(v)}`)
    n.children.forEach(collect)
  }
  svg.children.forEach(collect)
  const fixRefs = (v: string) => v.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (m, x: string) => (idMap.has(x) ? `url(#${idMap.get(x)})` : m))
  let dropped = 0, external = 0, recolored = 0
  const clean = (list: XNode[]): XNode[] => {
    const out: XNode[] = []
    for (const n of list) {
      if (n.type === 'text') {
        out.push(n.raw ? { ...n, text: fixRefs(n.text) } : n)
        continue
      }
      const local = n.name.replace(/^svg:/, '')
      if (DROP_EL.test(local) || /^(sodipodi|inkscape):/.test(n.name)) {
        if (local === 'script' || local === 'foreignObject') dropped++
        continue
      }
      const attrs: [string, string][] = []
      for (let [k, v] of n.attrs) {
        if (DROP_ATTR.test(k)) {
          if (/^on/i.test(k)) dropped++
          continue
        }
        if (k === 'xlink:href') k = 'href'
        if (k === 'href') {
          if (!v.startsWith('#')) { external++; continue }
          const t = v.slice(1)
          if (idMap.has(t)) v = `#${idMap.get(t)}`
        }
        if (k === 'id') v = idMap.get(v) ?? v
        v = fixRefs(v)
        if (color === 'current') {
          if (COLOR_KEYS.has(k) && isPaint(v) && k !== 'color') { v = 'currentColor'; recolored++ }
          if (k === 'style') v = v.replace(/(^|;)\s*(fill|stroke|stop-color)\s*:\s*([^;]+)/g, (m, a: string, p: string, val: string) => (isPaint(val) ? (recolored++, `${a}${p}:currentColor`) : m))
        }
        attrs.push([k, v])
      }
      out.push({ type: 'el', name: local, attrs, children: clean(n.children) })
    }
    return out
  }
  const children = clean(svg.children)
  const rootAttrs = INHERIT.map((k) => [k, get(svg, k)] as [string, string | undefined]).filter((x): x is [string, string] => x[1] !== undefined)
    .map(([k, v]) => [k, color === 'current' && COLOR_KEYS.has(k) && isPaint(v) ? 'currentColor' : v] as [string, string])
  if (dropped) warnings.push(`Removed ${dropped} script/event-handler item${dropped > 1 ? 's' : ''}`)
  if (external) warnings.push(`Removed ${external} external link${external > 1 ? 's' : ''}`)
  if (color === 'current' && recolored) warnings.push(`${recolored} colour${recolored > 1 ? 's' : ''} → currentColor`)
  if (/<style\b/.test(svgText)) warnings.push('Has a <style> block — class rules apply sprite-wide and may clash')
  if (/<image\b/.test(svgText)) warnings.push('Contains raster <image> — large and not recolourable')
  const body = serialize(children)
  return { id, viewBox: vb.trim().replace(/[\s,]+/g, ' '), rootAttrs, body, warnings, bytes: body.length }
}

export interface SpriteOpts { titles: boolean; hidden: boolean }

export function symbolOf(ic: Icon, title?: string): string {
  const attrs = ic.rootAttrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
  return `<symbol id="${ic.id}" viewBox="${ic.viewBox}"${attrs}>${title ? `<title>${escText(title)}</title>` : ''}${ic.body}</symbol>`
}

export function buildSprite(icons: { icon: Icon; title: string }[], o: SpriteOpts): string {
  const head = o.hidden
    ? '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">'
    : '<svg xmlns="http://www.w3.org/2000/svg">'
  return `${head}\n${icons.map(({ icon, title }) => '  ' + symbolOf(icon, o.titles ? title : undefined)).join('\n')}\n</svg>\n`
}

/** Standalone SVG for previewing one icon (used as an <img> data URL, so nothing executes). */
export function standalone(ic: Icon, colorCss: string): string {
  const attrs = ic.rootAttrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ic.viewBox}"${attrs} style="color:${colorCss}">${ic.body}</svg>`
}

/** Unique ids: appends -2, -3 … to repeated names. */
export function uniqueIds(names: string[], prefix: string): string[] {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const base = `${prefix}${slug(n)}`
    const k = (seen.get(base) ?? 0) + 1
    seen.set(base, k)
    return k > 1 ? `${base}-${k}` : base
  })
}

// Original sample icons (24×24, stroke style) plus one colourful icon with a gradient.
const STROKE = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
export const SAMPLES: [string, string][] = [
  ['home', `<svg ${STROKE}><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>`],
  ['search', `<svg ${STROKE}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`],
  ['user', `<svg ${STROKE}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`],
  ['heart', `<svg ${STROKE}><path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg>`],
  ['star', `<svg ${STROKE}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/></svg>`],
  ['bell', `<svg ${STROKE}><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`],
  ['mail', `<svg ${STROKE}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`],
  ['trash', `<svg ${STROKE}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`],
  ['check', `<svg ${STROKE}><path d="m5 12 5 5 9-10"/></svg>`],
  ['sliders', `<svg ${STROKE}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`],
  ['sun-badge', `<?xml version="1.0"?>\n<!-- coloured sample with a gradient id -->\n<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><radialGradient id="glow"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></radialGradient></defs><circle cx="16" cy="16" r="7" fill="url(#glow)"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3"/></g></svg>`],
]
