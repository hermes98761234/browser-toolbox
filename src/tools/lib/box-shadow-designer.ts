// Box-shadow layers: CSS generation, parsing of existing box-shadow values, smooth layered shadows.

export interface Layer { id: string; x: number; y: number; blur: number; spread: number; color: string; alpha: number; inset: boolean; on: boolean }

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

const px = (v: number) => (v === 0 ? '0' : `${Math.round(v * 100) / 100}px`)
export function rgba(color: string, a: number): string {
  const [r, g, b] = hexToRgb(color)
  const al = Math.round(a * 1000) / 1000
  return al >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${al})`
}

export function layerCss(l: Layer): string {
  return `${l.inset ? 'inset ' : ''}${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} ${rgba(l.color, l.alpha)}`
}

export function shadowCss(layers: Layer[], sep = ',\n    '): string {
  const on = layers.filter((l) => l.on)
  return on.length ? on.map(layerCss).join(sep) : 'none'
}

/** Splits on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const c of s) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', gray: '#808080', grey: '#808080', transparent: '#000000' }

function parseColor(c: string): { color: string; alpha: number } | null {
  const t = c.trim().toLowerCase()
  if (t in NAMED) return { color: NAMED[t], alpha: t === 'transparent' ? 0 : 1 }
  let m = /^#([0-9a-f]{3,8})$/.exec(t)
  if (m) {
    const h = m[1].length === 3 || m[1].length === 4 ? [...m[1]].map((x) => x + x).join('') : m[1]
    return { color: '#' + h.slice(0, 6), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(t)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return { color: rgbToHex(+m[1], +m[2], +m[3]), alpha: a }
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(t)
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100
    const f = (n: number) => {
      const k = (n + h * 12) % 12
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return { color: rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255), alpha: a }
  }
  return null
}

/** Parses a CSS box-shadow value (with or without the `box-shadow:` prefix). */
export function parseShadow(css: string, mkId: () => string): Layer[] {
  const v = css.replace(/^[^:]*box-shadow\s*:/i, '').replace(/;[\s\S]*$/, '').trim()
  if (!v || v === 'none') return []
  return splitTop(v).map((part) => {
    let p = part.trim()
    const inset = /\binset\b/i.test(p)
    p = p.replace(/\binset\b/i, '').trim()
    let col = { color: '#000000', alpha: 1 }
    const fn = /(rgba?|hsla?)\([^)]*\)/i.exec(p)
    if (fn) {
      col = parseColor(fn[0]) ?? col
      p = p.replace(fn[0], ' ')
    } else {
      const tok = p.split(/\s+/).find((x) => /^#|^[a-z]+$/i.test(x))
      if (tok) {
        col = parseColor(tok) ?? col
        p = p.replace(tok, ' ')
      }
    }
    const nums = p.trim().split(/\s+/).filter(Boolean).map((x) => parseFloat(x))
    const [x = 0, y = 0, blur = 0, spread = 0] = nums
    return { id: mkId(), x, y, blur, spread, color: col.color, alpha: col.alpha, inset, on: true }
  })
}

/**
 * Smooth layered shadow: n layers whose offsets/blur grow along an ease-in curve
 * and whose alpha sums to `alpha` (the "layered shadows look more natural" technique).
 */
export function smooth(n: number, x: number, y: number, blur: number, alpha: number, color: string, mkId: () => string): Layer[] {
  const out: Layer[] = []
  for (let i = 1; i <= n; i++) {
    const t = Math.pow(i / n, 2)
    out.push({ id: mkId(), x: +(x * t).toFixed(2), y: +(y * t).toFixed(2), blur: +(blur * t).toFixed(2), spread: 0, color, alpha: +(alpha / n).toFixed(3), inset: false, on: true })
  }
  return out
}
