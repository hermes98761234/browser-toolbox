import { describe, expect, it } from 'vitest'
import { clean, decodeEntities, DEFAULT_OPTS, reveal, scan } from './text-cleaner'

const run = (s: string, o = {}) => clean(s, { ...DEFAULT_OPTS, ...o }).text

describe('text cleaner', () => {
  it('removes zero-width, BOM, soft hyphens, bidi and tag characters', () => {
    expect(run('\ufeffpay\u200bment of\u00ad 50\u202e')).toBe('payment of 50')
    const tags = [...'hi'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('')
    expect(run(`ok${tags}`)).toBe('ok')
  })
  it('keeps emoji ZWJ sequences when asked', () => {
    const fam = '👩\u200d👩\u200d👧'
    expect(run(`a${fam}b`)).toBe(`a${fam}b`)
    expect(run(`a\u200db`)).toBe('ab')
    expect(run(fam, { keepEmojiZwj: false })).toBe('👩👩👧')
  })
  it('spaces, quotes, ellipsis, whitespace', () => {
    expect(run('“Smart”\u00a0quotes — it’s… fine   here  \n\n\n\nnext')).toBe('"Smart" quotes — it\'s... fine here\n\nnext')
    expect(run('a – b — c', { dashes: true })).toBe('a - b - c')
  })
  it('NFC vs NFKC', () => {
    expect(run('é')).toBe('é')
    expect(run('ﬁle ＡＢＣ', { norm: 'NFKC' })).toBe('file ABC')
    expect(run('ﬁle', { norm: 'NFC' })).toBe('ﬁle')
  })
  it('control chars and line endings', () => {
    expect(run('a\r\nb\rc\u0007d\u0085')).toBe('a\nb\ncd')
  })
  it('unwraps hard-wrapped paragraphs but keeps lists', () => {
    expect(run('This is a hard\nwrapped para-\ngraph.\n\n- item one\n- item two', { unwrap: true })).toBe('This is a hard wrapped paragraph.\n\n- item one\n- item two')
  })
  it('html', () => {
    expect(run('<p>Tom &amp; Jerry&nbsp;&#8212;&#x41;</p><script>x()</script>', { html: true })).toBe('Tom & Jerry —A')
    expect(decodeEntities('&unknown; &lt;')).toBe('&unknown; <')
  })
  it('counts changes and scans', () => {
    const r = clean('a\u200bb\u200bc', DEFAULT_OPTS)
    expect(r.steps.find((s) => s.label.startsWith('Invisible'))!.n).toBe(2)
    const f = scan('x\u00a0y\u00a0\u200b')
    expect(f[0]).toMatchObject({ cp: 0xa0, count: 2 })
    const t = reveal('a\u200bb \nc\t')
    expect(t.map((x) => x.info?.short ?? x.ws ?? x.s)).toEqual(['a', 'ZWSP', 'b', 'trail', '\nc', 'trail'])
  })
})
