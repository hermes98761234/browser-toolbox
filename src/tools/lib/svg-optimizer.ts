// SVG Optimizer: a small DOM-based optimizer (DOMParser in, own serializer out) with SVGO-like plugins.
// String helpers (numbers, colors, path data) are pure and unit-tested; `optimize` needs a DOMParser.

// ---------- numbers ----------

/** Rounds to `p` decimals and prints the shortest form: 0.50 → .5, -0.20 → -.2, 1e-7 → 0. */
export function fmtNum(v: number, p: number): string {
  const f = 10 ** p
  let r = Math.round(v * f) / f
  if (Object.is(r, -0)) r = 0
  let s = String(r)
  if (/e/i.test(s)) s = r.toFixed(p).replace(/\.?0+$/, '')
  return s.replace(/^(-?)0\./, '$1.')
}

const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

/** Rounds every number inside a list-like attribute (viewBox, points, transform, x, …) and tidies separators. */
export function roundList(v: string, p: number): string {
  return v
    .replace(NUM_RE, (m) => fmtNum(Number(m), p))
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ?([()]) ?/g, '$1')
    .trim()
}

/** Joins numbers with the fewest separators: "1 -2" → "1-2", ".5 .5" → ".5.5". */
export function joinNums(nums: string[]): string {
  let out = ''
  for (const n of nums) {
    if (!out) out = n
    else if (n.startsWith('-') || (n.startsWith('.') && /\.\d*$/.test(out.split(/[^\d.]/).pop() ?? '') && !/[eE]/.test(out))) out += n
    else out += ' ' + n
  }
  return out
}

// ---------- colors ----------

const NAMES: Record<string, string> = {
  black: '#000', white: '#fff', red: '#f00', lime: '#0f0', blue: '#00f', yellow: '#ff0', cyan: '#0ff', aqua: '#0ff', magenta: '#f0f', fuchsia: '#f0f',
  silver: '#c0c0c0', gray: '#808080', grey: '#808080', maroon: '#800000', olive: '#808000', green: '#008000', purple: '#800080', teal: '#008080',
  navy: '#000080', orange: '#ffa500', gold: '#ffd700', tan: '#d2b48c', linen: '#faf0e6', beige: '#f5f5dc', coral: '#ff7f50', khaki: '#f0e68c',
  ivory: '#fffff0', indigo: '#4b0082', orchid: '#da70d6', plum: '#dda0dd', salmon: '#fa8072', sienna: '#a0522d', snow: '#fffafa', violet: '#ee82ee', wheat: '#f5deb3',
  azure: '#f0ffff', bisque: '#ffe4c4', brown: '#a52a2a', chocolate: '#d2691e', crimson: '#dc143c', peru: '#cd853f', pink: '#ffc0cb', tomato: '#ff6347', darkblue: '#00008b',
}
const HEX_TO_NAME: Record<string, string> = {}
for (const [n, h] of Object.entries(NAMES)) if (n.length < h.length && !HEX_TO_NAME[h]) HEX_TO_NAME[h] = n

/** Shortest equivalent for a CSS color value; unknown values are returned unchanged. */
export function shortColor(v: string): string {
  let c = v.trim().toLowerCase()
  const rgb = /^rgb\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*\)$/.exec(c)
  if (rgb) {
    const ch = rgb.slice(1).map((x) => Math.max(0, Math.min(255, Math.round(x.endsWith('%') ? (parseFloat(x) * 255) / 100 : parseFloat(x)))))
    c = '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('')
  } else if (NAMES[c]) c = NAMES[c]
  else if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/.test(c)) return v.trim()
  if (/^#([\da-f])\1([\da-f])\2([\da-f])\3$/.test(c)) c = `#${c[1]}${c[3]}${c[5]}`
  return HEX_TO_NAME[c] ?? c
}

// ---------- path data ----------

export interface Seg { c: string; a: number[] }
const ARGC: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Parses path data into absolute-or-relative segments exactly as written (one segment per argument group). */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = []
  const re = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)|([\s,]+)|(.)/g
  let cmd = ''
  let args: number[] = []
  let m: RegExpExecArray | null
  const flush = () => {
    const n = ARGC[cmd.toUpperCase()]
    if (n === 0) {
      out.push({ c: cmd, a: [] })
      return
    }
    for (let i = 0; i + n <= args.length; i += n) {
      // Repeated M/m pairs are implicit L/l.
      const c = i > 0 && cmd === 'M' ? 'L' : i > 0 && cmd === 'm' ? 'l' : cmd
      out.push({ c, a: args.slice(i, i + n) })
    }
  }
  while ((m = re.exec(d))) {
    if (m[1]) {
      if (cmd) flush()
      cmd = m[1]
      args = []
    } else if (m[2] !== undefined) {
      if (!cmd) break
      // Arc flags may be packed ("a1 1 0 0110 10"): split single digits at flag positions.
      if (cmd.toUpperCase() === 'A') {
        let s = m[2]
        while (s) {
          const pos = args.length % 7
          if ((pos === 3 || pos === 4) && /^[01]/.test(s)) {
            args.push(Number(s[0]))
            s = s.slice(1)
          } else {
            args.push(Number(s))
            s = ''
          }
        }
      } else args.push(Number(m[2]))
    } else if (m[4]) break // invalid character: stop like browsers do
  }
  if (cmd) flush()
  return out
}

/** Converts segments to absolute coordinates (H/V/S/T kept as their own commands). */
export function toAbsolute(segs: Seg[]): Seg[] {
  let x = 0, y = 0, sx = 0, sy = 0
  return segs.map(({ c, a }) => {
    const C = c.toUpperCase()
    const rel = c !== C
    const b = [...a]
    if (rel) {
      if (C === 'H') b[0] += x
      else if (C === 'V') b[0] += y
      else if (C === 'A') {
        b[5] += x
        b[6] += y
      } else for (let i = 0; i < b.length; i += 2) {
        b[i] += x
        b[i + 1] += y
      }
    }
    if (C === 'Z') {
      x = sx
      y = sy
    } else if (C === 'H') x = b[0]
    else if (C === 'V') y = b[0]
    else {
      x = b[b.length - 2]
      y = b[b.length - 1]
    }
    if (C === 'M') {
      sx = x
      sy = y
    }
    return { c: C, a: b }
  })
}

/** Minifies path data: rounding, shortest of absolute/relative per segment, L→H/V, implicit commands. */
export function minifyPath(d: string, p: number): string {
  const abs = toAbsolute(parsePath(d))
  const R = (v: number) => Number(fmtNum(v, p))
  let x = 0, y = 0, sx = 0, sy = 0
  let out = ''
  let prev = ''
  for (const s of abs) {
    let C = s.c
    let a = s.a.map((v, i) => (C === 'A' && i >= 2 && i <= 4 ? v : R(v)))
    if (C === 'L' && a[1] === y && a[0] !== x) {
      C = 'H'
      a = [a[0]]
    } else if (C === 'L' && a[0] === x && a[1] !== y) {
      C = 'V'
      a = [a[1]]
    }
    let r: number[] = []
    if (C === 'H') r = [a[0] - x]
    else if (C === 'V') r = [a[0] - y]
    else if (C === 'A') r = [...a.slice(0, 5), a[5] - x, a[6] - y]
    else r = a.map((v, i) => v - (i % 2 ? y : x))
    r = r.map((v, i) => (C === 'A' && i >= 2 && i <= 4 ? v : R(v)))
    const absStr = joinNums(a.map((v) => fmtNum(v, p)))
    const relStr = joinNums(r.map((v) => fmtNum(v, p)))
    let cmd = C
    let body = absStr
    if (C !== 'Z' && (relStr.length < absStr.length || (relStr.length === absStr.length && prev === C.toLowerCase()))) {
      cmd = C.toLowerCase()
      body = relStr
    }
    if (C === 'Z') {
      cmd = 'z'
      body = ''
    }
    // Command letter can be omitted when it repeats (or L/l follows M/m).
    const implicit = cmd !== 'z' && cmd !== 'M' && cmd !== 'm' && (prev === cmd || (prev === 'M' && cmd === 'L') || (prev === 'm' && cmd === 'l'))
    if (implicit) out += (body.startsWith('-') || (body.startsWith('.') && /\.\d*$/.test(out.split(/[^\d.]/).pop() ?? '')) ? '' : ' ') + body
    else out += cmd + body
    prev = cmd
    if (C === 'Z') {
      x = sx
      y = sy
    } else if (C === 'H') x = a[0]
    else if (C === 'V') y = a[0]
    else {
      x = a[a.length - 2]
      y = a[a.length - 1]
    }
    if (C === 'M') {
      sx = x
      sy = y
    }
  }
  return out
}

// ---------- DOM optimizer ----------

export interface Opts {
  comments: boolean; metadata: boolean; editors: boolean; numbers: boolean; groups: boolean; defaults: boolean
  colors: boolean; paths: boolean; ids: boolean; empty: boolean; titles: boolean; dimensions: boolean; pretty: boolean; precision: number
}

export const PLUGINS: [keyof Opts, string, string][] = [
  ['comments', 'Strip comments', 'XML comments, <?xml?> declaration and DOCTYPE'],
  ['metadata', 'Strip metadata', '<metadata> blocks (RDF, licence, generator info)'],
  ['editors', 'Strip editor data', 'Inkscape, Sodipodi, Illustrator, Sketch, Figma namespaces and attributes'],
  ['numbers', 'Round numbers', 'coordinates, sizes, transforms, viewBox to the chosen precision'],
  ['paths', 'Minify path data', 'shortest absolute/relative form, H/V, implicit commands'],
  ['colors', 'Shorten colors', 'rgb() → hex, #aabbcc → #abc, names ↔ hex'],
  ['defaults', 'Remove default values', 'fill-opacity="1", x="0", stroke="none"… (only when nothing inherits)'],
  ['groups', 'Collapse groups', 'unwrap attribute-less <g>, push single-child group attributes down'],
  ['ids', 'Remove unused IDs', 'ids nothing references (kept when the file has <style> or <script>)'],
  ['empty', 'Remove empty elements', 'empty <g>, <defs>, <text>, zero-size shapes, empty attributes'],
  ['titles', 'Remove <title>/<desc>', 'off by default: they help screen readers'],
  ['dimensions', 'Width/height → viewBox', 'makes the SVG scale to its container'],
]

export const DEFAULT_OPTS: Opts = { comments: true, metadata: true, editors: true, numbers: true, groups: true, defaults: true, colors: true, paths: true, ids: true, empty: true, titles: false, dimensions: false, pretty: false, precision: 3 }

const EDITOR_NS = /inkscape|sodipodi|adobe|illustrator|sketch|figma|bohemian|ns.adobe.com|xml\.openoffice|serif\.com|vectornator|boxy-svg/i
const EDITOR_PREFIX = /^(inkscape|sodipodi|i|x|graph|sketch|figma|serif|a|vectornator|bx):/
const NUM_ATTRS = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height', 'points', 'viewBox', 'transform', 'gradientTransform', 'patternTransform', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'offset', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'font-size', 'stdDeviation', 'dx', 'dy', 'refX', 'refY', 'markerWidth', 'markerHeight', 'letter-spacing', 'word-spacing'])
const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'])
const INHERITED_DEFAULTS: Record<string, string[]> = {
  'fill-opacity': ['1'], 'stroke-opacity': ['1'], 'stroke-width': ['1'], 'stroke-linecap': ['butt'], 'stroke-linejoin': ['miter'], 'stroke-miterlimit': ['4'],
  'stroke-dashoffset': ['0'], 'stroke-dasharray': ['none'], 'fill-rule': ['nonzero'], 'clip-rule': ['nonzero'], stroke: ['none'], visibility: ['visible'], 'font-style': ['normal'], 'font-weight': ['normal', '400'],
}
const PLAIN_DEFAULTS: Record<string, string[]> = { opacity: ['1'], 'stop-opacity': ['1'], 'stop-color': ['#000', 'black', '#000000'], display: ['inline'], 'mix-blend-mode': ['normal'], 'flood-opacity': ['1'] }
const ZERO_POS = new Set(['rect', 'image', 'use', 'svg', 'circle', 'ellipse', 'line', 'text', 'foreignObject'])
const POS_ATTRS = ['x', 'y', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2']
const TEXTY = new Set(['text', 'tspan', 'textPath', 'style', 'script', 'title', 'desc'])

function styleMap(el: Element): Map<string, string> {
  const m = new Map<string, string>()
  for (const part of (el.getAttribute('style') ?? '').split(';')) {
    const i = part.indexOf(':')
    if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return m
}

function ancestorSets(el: Element, prop: string): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) if (p.hasAttribute(prop) || styleMap(p).has(prop)) return true
  return false
}

const esc = (s: string, attr: boolean) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(attr ? /"/g : /$^/, '&quot;')

/** Serializes a node tree compactly (or indented when `pretty`). */
export function serialize(node: Node, pretty: boolean, depth = 0): string {
  const ind = pretty ? '\n' + '  '.repeat(depth) : ''
  if (node.nodeType === 3) return esc(node.nodeValue ?? '', false)
  if (node.nodeType === 4) return `<![CDATA[${node.nodeValue}]]>`
  if (node.nodeType === 8) return `${ind}<!--${node.nodeValue}-->`
  if (node.nodeType !== 1) return ''
  const el = node as Element
  const attrs = [...el.attributes].map((a) => ` ${a.name}="${esc(a.value, true)}"`).join('')
  const kids = [...el.childNodes]
  if (!kids.length) return `${ind}<${el.nodeName}${attrs}/>`
  const hasText = kids.some((k) => k.nodeType === 3 || k.nodeType === 4)
  const inner = kids.map((k) => serialize(k, pretty && !hasText && !TEXTY.has(el.nodeName), depth + 1)).join('')
  return `${ind}<${el.nodeName}${attrs}>${inner}${pretty && !hasText && !TEXTY.has(el.nodeName) ? ind : ''}</${el.nodeName}>`
}

export interface Report { removed: Record<string, number> }

/** Optimizes SVG source text. Throws on XML parse errors. */
export function optimize(src: string, o: Opts, parser: DOMParser = new DOMParser()): { svg: string; report: Report } {
  const doc = parser.parseFromString(src, 'image/svg+xml')
  const perr = doc.getElementsByTagName('parsererror')[0]
  if (perr) throw new Error((perr.textContent ?? 'XML parse error').trim().split('\n')[0])
  const root = doc.documentElement
  if (root.localName !== 'svg') throw new Error('The root element is not <svg>.')
  const removed: Record<string, number> = {}
  const bump = (k: string, n = 1) => (removed[k] = (removed[k] ?? 0) + n)
  const all = () => [root, ...root.getElementsByTagName('*')]
  const hasStyle = root.getElementsByTagName('style').length > 0 || root.getElementsByTagName('script').length > 0

  const walk = (n: Node, fn: (n: Node) => void) => {
    for (const k of [...n.childNodes]) walk(k, fn)
    fn(n)
  }
  // comments + whitespace-only text outside text elements
  walk(root, (n) => {
    if (n.nodeType === 8 && o.comments) {
      n.parentNode?.removeChild(n)
      bump('comments')
    } else if (n.nodeType === 3 && !(n.nodeValue ?? '').trim()) {
      let p = n.parentElement
      let texty = false
      for (; p; p = p.parentElement) if (TEXTY.has(p.localName) || p.getAttribute('xml:space') === 'preserve') texty = true
      if (!texty) n.parentNode?.removeChild(n)
    }
  })
  for (const el of all()) {
    const name = el.localName
    if (el !== root && !root.contains(el)) continue
    if ((o.metadata && name === 'metadata') || (o.titles && (name === 'title' || name === 'desc'))) {
      el.remove()
      bump(name)
      continue
    }
    if (o.editors && (EDITOR_NS.test(el.namespaceURI ?? '') || EDITOR_PREFIX.test(el.nodeName))) {
      el.remove()
      bump('editor elements')
      continue
    }
    for (const a of [...el.attributes]) {
      const an = a.name
      if (o.editors && (EDITOR_PREFIX.test(an) || EDITOR_NS.test(a.namespaceURI ?? '') || (an.startsWith('xmlns:') && EDITOR_NS.test(a.value)) || an.startsWith('data-name') || an === 'enable-background')) {
        el.removeAttribute(an)
        bump('editor attributes')
        continue
      }
      let v = a.value
      if (o.empty && !v.trim() && an !== 'alt') {
        el.removeAttribute(an)
        bump('empty attributes')
        continue
      }
      if (o.paths && an === 'd') v = minifyPath(v, o.numbers ? o.precision : 12)
      else if (o.paths && an === 'points') v = joinNums(v.match(NUM_RE)?.map((x) => fmtNum(Number(x), o.numbers ? o.precision : 12)) ?? [])
      else if (o.numbers && NUM_ATTRS.has(an) && /\d/.test(v)) v = roundList(v, o.precision)
      if (o.colors && COLOR_ATTRS.has(an)) v = shortColor(v)
      if (an === 'style') {
        const m = styleMap(el)
        if (o.colors) for (const [k, x] of m) if (COLOR_ATTRS.has(k)) m.set(k, shortColor(x))
        if (o.numbers) for (const [k, x] of m) if (NUM_ATTRS.has(k) && /^[-\d.e\s,]+$/.test(x)) m.set(k, roundList(x, o.precision))
        if (o.editors) for (const k of [...m.keys()]) if (k.startsWith('-inkscape') || k === 'enable-background') m.delete(k)
        v = [...m].map(([k, x]) => `${k}:${x}`).join(';')
        if (!v) {
          el.removeAttribute('style')
          continue
        }
      }
      if (v !== a.value) el.setAttribute(an, v)
    }
    if (o.defaults) {
      for (const a of [...el.attributes]) {
        const v = a.value.trim()
        const inh = INHERITED_DEFAULTS[a.name]
        if ((inh?.includes(v) && !hasStyle && !ancestorSets(el, a.name)) || PLAIN_DEFAULTS[a.name]?.includes(v) || (ZERO_POS.has(el.localName) && POS_ATTRS.includes(a.name) && Number(v) === 0 && v !== '' && !(el.localName === 'svg' && el === root))) {
          el.removeAttribute(a.name)
          bump('default values')
        }
      }
      if (el.hasAttribute('style')) {
        const m = styleMap(el)
        for (const [k, x] of m) if ((INHERITED_DEFAULTS[k]?.includes(x) && !hasStyle && !ancestorSets(el, k)) || PLAIN_DEFAULTS[k]?.includes(x)) {
          m.delete(k)
          bump('default values')
        }
        const v = [...m].map(([k, x]) => `${k}:${x}`).join(';')
        if (v) el.setAttribute('style', v)
        else el.removeAttribute('style')
      }
      if (el === root) for (const an of ['version', 'baseProfile', 'x', 'y']) if (el.hasAttribute(an)) {
        el.removeAttribute(an)
        bump('default values')
      }
    }
  }
  if (!root.hasAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (o.editors) {
    const text = serialize(root, false).replace(/ xmlns:[\w-]+="[^"]*"/g, '')
    for (const a of [...root.attributes]) if (a.name.startsWith('xmlns:') && !text.includes(a.name.slice(6) + ':')) root.removeAttribute(a.name)
  }
  if (o.ids && !hasStyle) {
    const text = serialize(root, false)
    for (const el of all()) {
      const id = el.getAttribute('id')
      if (!id) continue
      // Keep the id when its name appears anywhere besides its own definition (url(#…), href, aria-labelledby, SMIL…).
      const uses = text.split(id).length - 1
      if (uses <= 1) {
        el.removeAttribute('id')
        bump('unused ids')
      }
    }
  }
  if (o.groups) {
    const MOVABLE = new Set(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'transform', 'font-family', 'font-size', 'font-weight', 'color', 'visibility'])
    for (const g of [...root.getElementsByTagName('g')].reverse()) {
      if (!g.parentNode) continue
      const kids = [...g.children]
      if (!g.attributes.length) {
        while (g.firstChild) g.parentNode.insertBefore(g.firstChild, g)
        g.remove()
        bump('groups collapsed')
      } else if (kids.length === 1 && g.childNodes.length === 1 && !hasStyle && [...g.attributes].every((a) => MOVABLE.has(a.name))) {
        const k = kids[0]
        const okToMove = [...g.attributes].every((a) => a.name === 'transform' || a.name === 'opacity' || !k.hasAttribute(a.name)) && !(g.hasAttribute('opacity') && k.hasAttribute('opacity'))
        if (!okToMove || k.hasAttribute('clip-path') || k.hasAttribute('mask') || k.hasAttribute('filter')) continue
        for (const a of [...g.attributes]) {
          if (a.name === 'transform') k.setAttribute('transform', `${a.value}${k.getAttribute('transform') ? ' ' + k.getAttribute('transform') : ''}`)
          else k.setAttribute(a.name, a.value)
        }
        g.parentNode.insertBefore(k, g)
        g.remove()
        bump('groups collapsed')
      }
    }
  }
  if (o.empty) {
    let again = true
    while (again) {
      again = false
      for (const el of [...root.getElementsByTagName('*')]) {
        const n = el.localName
        const emptyContainer = ['g', 'defs', 'symbol', 'text', 'tspan'].includes(n) && !el.childNodes.length && !el.hasAttribute('id')
        const zero = ((n === 'rect' || n === 'image') && (el.getAttribute('width') === '0' || el.getAttribute('height') === '0')) || (n === 'circle' && el.getAttribute('r') === '0') || (n === 'path' && !(el.getAttribute('d') ?? '').trim())
        if (emptyContainer || zero) {
          el.remove()
          bump('empty elements')
          again = true
        }
      }
    }
  }
  if (o.dimensions && root.hasAttribute('width') && root.hasAttribute('height')) {
    const w = parseFloat(root.getAttribute('width')!), h = parseFloat(root.getAttribute('height')!)
    if (!root.hasAttribute('viewBox') && w > 0 && h > 0 && /^[\d.]+(px)?$/.test(root.getAttribute('width')!) && /^[\d.]+(px)?$/.test(root.getAttribute('height')!)) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
    if (root.hasAttribute('viewBox')) {
      root.removeAttribute('width')
      root.removeAttribute('height')
    }
  }
  return { svg: serialize(root, o.pretty).trim(), report: { removed } }
}
