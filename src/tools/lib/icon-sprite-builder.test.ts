import { describe, expect, it } from 'vitest'
import { buildSprite, parseXml, processIcon, SAMPLES, serialize, slug, uniqueIds } from './icon-sprite-builder'

describe('icon sprite builder', () => {
  it('parses and re-serialises XML, dropping comments and PIs', () => {
    const n = parseXml('<?xml version="1.0"?><!-- c --><svg a="1 &amp; 2"><g><path d="M0 0"/></g>  <text>x &lt; y</text></svg>')
    expect(serialize(n)).toBe('<svg a="1 &amp; 2"><g><path d="M0 0"/></g><text>x &lt; y</text></svg>')
  })
  it('sanitises scripts, handlers and external links; prefixes ids', () => {
    const ic = processIcon(`<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><defs><linearGradient id="g"/></defs><rect fill="url(#g)" onclick="y()"/><use xlink:href="#g"/><image href="http://evil/x.png"/></svg>`, 'icon-a', 'keep')
    expect(ic.body).not.toContain('script')
    expect(ic.body).not.toContain('onclick')
    expect(ic.body).not.toContain('evil')
    expect(ic.body).toContain('id="icon-a-g"')
    expect(ic.body).toContain('fill="url(#icon-a-g)"')
    expect(ic.body).toContain('href="#icon-a-g"')
    expect(ic.warnings.join(' ')).toContain('Removed 2 script')
  })
  it('derives viewBox from width/height and converts colours to currentColor', () => {
    const ic = processIcon('<svg width="32px" height="16"><path fill="#ff0000" stroke="none" style="fill:red;opacity:.5"/></svg>', 'i', 'current')
    expect(ic.viewBox).toBe('0 0 32 16')
    expect(ic.body).toContain('fill="currentColor"')
    expect(ic.body).toContain('stroke="none"')
    expect(ic.body).toContain('style="fill:currentColor;opacity:.5"')
  })
  it('keeps inheritable root attributes on the symbol and builds the sprite', () => {
    const icons = SAMPLES.slice(0, 2).map(([n, svg], i) => ({ icon: processIcon(svg, uniqueIds(SAMPLES.map((x) => x[0]), 'icon-')[i], 'keep'), title: n }))
    const sp = buildSprite(icons, { titles: true, hidden: false })
    expect(sp).toContain('<symbol id="icon-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"')
    expect(sp).toContain('<title>search</title>')
    expect(sp.match(/<symbol/g)?.length).toBe(2)
  })
  it('slugs and de-duplicates ids', () => {
    expect(slug('My Icon.svg')).toBe('my-icon')
    expect(uniqueIds(['a', 'A', 'b'], 'i-')).toEqual(['i-a', 'i-a-2', 'i-b'])
  })
})
