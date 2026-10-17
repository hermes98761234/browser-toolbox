import { describe, expect, it } from 'vitest'
import { decode, encode, inspect, NAMED, NAME_OF } from './html-entity-converter'

describe('html-entity-converter', () => {
  it('has a correct table', () => {
    expect(NAMED.nbsp).toBe(160)
    expect(NAMED.yuml).toBe(255)
    expect(NAMED.eacute).toBe(233)
    expect(NAMED.Omega).toBe(937)
    expect(NAMED.omega).toBe(969)
    expect(NAMED.sigma).toBe(963)
    expect(NAMED.sigmaf).toBe(962)
    expect(NAMED.Sigma).toBe(931)
    expect(NAMED.euro).toBe(8364)
    expect(NAME_OF[38]).toBe('amp')
  })
  it('encodes', () => {
    expect(encode('<a href="x">Tom & Jerry\'s</a>', 'basic', 'named')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    expect(encode('café €5 😀', 'nonascii', 'named')).toBe('caf&eacute; &euro;5 &#x1F600;')
    expect(encode('café', 'nonascii', 'decimal')).toBe('caf&#233;')
    expect(encode('a-b', 'all', 'hex')).toBe('a&#x2D;b')
  })
  it('decodes named, numeric and cp1252 references', () => {
    expect(decode('&lt;p&gt; caf&eacute; &#233; &#xE9; &#128; &#0; &bogus; &amp').text).toBe('<p> café é é € � &bogus; &amp')
    const r = decode('&hearts;&foo;', (e) => (e === '&foo;' ? 'F' : null))
    expect(r.text).toBe('♥F')
    expect(decode('&bar;').unknown).toEqual(['&bar;'])
  })
  it('round-trips arbitrary text', () => {
    const t = 'Ünïcödé “quotes” — ≤ ≥ ∞ 𝔸 👍🏽 <tag> & "x"'
    for (const f of ['named', 'decimal', 'hex'] as const) expect(decode(encode(t, 'all', f)).text).toBe(t)
  })
  it('inspects code points', () => {
    const [a, e] = inspect('é😀')
    expect(a).toMatchObject({ hex: 'U+00E9', utf8: 'C3 A9', named: '&eacute;', cat: 'Lowercase letter' })
    expect(e).toMatchObject({ hex: 'U+1F600', utf8: 'F0 9F 98 80', utf16: 'D83D DE00', js: '\\u{1F600}' })
  })
})
