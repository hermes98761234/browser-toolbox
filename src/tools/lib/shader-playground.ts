// GLSL helpers for the shader playground: syntax highlighting, @slider/@color uniform parsing,
// compile-log parsing and the Shadertoy-style wrapper.

export interface UniformCtl {
  name: string
  kind: 'slider' | 'color'
  min: number
  max: number
  def: number[]
}

const SLIDER = /uniform\s+float\s+(\w+)\s*;\s*\/\/\s*@slider\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+))?/g
const COLOR = /uniform\s+vec3\s+(\w+)\s*;\s*\/\/\s*@color(?:\s+(#[0-9a-fA-F]{6}))?/g

export function parseControls(src: string): UniformCtl[] {
  const out: UniformCtl[] = []
  for (const m of src.matchAll(SLIDER)) {
    const min = parseFloat(m[2]), max = parseFloat(m[3])
    const d = m[4] !== undefined ? parseFloat(m[4]) : (min + max) / 2
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) out.push({ name: m[1], kind: 'slider', min, max, def: [Math.min(max, Math.max(min, d))] })
  }
  for (const m of src.matchAll(COLOR)) out.push({ name: m[1], kind: 'color', min: 0, max: 1, def: hexToRgb(m[2] ?? '#ff8040') })
  return out
}

export function hexToRgb(h: string): number[] {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
export function rgbToHex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
}

export const HEADER = `precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
`
export const HEADER_LINES = HEADER.split('\n').length - 1

/** Wrap user code: Shadertoy-style mainImage() gets a main(); a full main() is used as-is. */
export function wrapSource(user: string): { src: string; offset: number } {
  const hasMain = /\bvoid\s+main\s*\(/.test(user)
  const hasPrecision = /^\s*precision\s/m.test(user)
  if (hasMain) {
    const head = hasPrecision ? '' : 'precision highp float;\n'
    return { src: head + user, offset: hasPrecision ? 0 : 1 }
  }
  return { src: HEADER + user + '\nvoid main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = c; }\n', offset: HEADER_LINES }
}

export interface GlError { line: number; msg: string }

/** Parse a WebGL info log ("ERROR: 0:12: 'x' : undeclared identifier") into user-code line numbers. */
export function parseLog(log: string, offset: number, userLines: number): GlError[] {
  const out: GlError[] = []
  for (const raw of log.split('\n')) {
    const l = raw.trim()
    if (!l) continue
    const m = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(l)
    if (m) {
      let line = parseInt(m[1], 10) - offset
      if (line < 1 || line > userLines) line = Math.max(1, Math.min(userLines, line))
      out.push({ line, msg: m[2] })
    } else if (!/^\s*$/.test(l) && !/compilation errors/i.test(l)) out.push({ line: 0, msg: l })
  }
  return out
}

const KEYWORDS = new Set('if else for while do return break continue discard uniform varying attribute const in out inout struct precision highp mediump lowp true false'.split(' '))
const TYPES = new Set('void bool int float vec2 vec3 vec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 sampler2D samplerCube'.split(' '))
const BUILTINS = new Set(('radians degrees sin cos tan asin acos atan pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize faceforward reflect refract matrixCompMult lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture2D textureCube dFdx dFdy fwidth ' +
  'gl_FragColor gl_FragCoord mainImage iTime iResolution iMouse iFrame iTimeDelta').split(' '))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(^[ \t]*#[^\n]*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)/gm

/** Return HTML with <span class="g-…"> tokens for comments, preprocessor, numbers, keywords, types, builtins. */
export function highlight(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    const i = m.index ?? 0
    out += esc(src.slice(last, i))
    const t = m[0]
    let cls = ''
    if (m[1]) cls = 'c'
    else if (m[2]) cls = 'p'
    else if (m[3]) cls = 'n'
    else if (KEYWORDS.has(t)) cls = 'k'
    else if (TYPES.has(t)) cls = 't'
    else if (BUILTINS.has(t)) cls = 'b'
    out += cls ? `<span class="g-${cls}">${esc(t)}</span>` : esc(t)
    last = i + t.length
  }
  return out + esc(src.slice(last)) + '\n'
}
