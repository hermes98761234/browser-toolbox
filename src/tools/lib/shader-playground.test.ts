import { describe, expect, it } from 'vitest'
import { HEADER_LINES, highlight, parseControls, parseLog, wrapSource } from './shader-playground'

describe('shader-playground helpers', () => {
  it('parses slider and color uniforms', () => {
    const c = parseControls('uniform float zoom; // @slider 0 8 1.5\nuniform float k; // @slider -1 1\nuniform vec3 tint; // @color #ff0000')
    expect(c.map((x) => x.name)).toEqual(['zoom', 'k', 'tint'])
    expect(c[0].def).toEqual([1.5])
    expect(c[1].def).toEqual([0])
    expect(c[2].def).toEqual([1, 0, 0])
  })
  it('maps log lines back to user lines', () => {
    const { offset } = wrapSource('void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0); }')
    expect(offset).toBe(HEADER_LINES)
    const e = parseLog(`ERROR: 0:${HEADER_LINES + 3}: 'foo' : undeclared identifier\nERROR: 1 compilation errors.`, offset, 10)
    expect(e).toEqual([{ line: 3, msg: "'foo' : undeclared identifier" }])
  })
  it('keeps a full main() untouched', () => {
    const w = wrapSource('precision mediump float;\nvoid main() { gl_FragColor = vec4(1.0); }')
    expect(w.offset).toBe(0)
    expect(w.src.startsWith('precision mediump')).toBe(true)
  })
  it('highlights and escapes', () => {
    const h = highlight('float a = 1.0; // x < y')
    expect(h).toContain('<span class="g-t">float</span>')
    expect(h).toContain('<span class="g-n">1.0</span>')
    expect(h).toContain('&lt;')
  })
})
