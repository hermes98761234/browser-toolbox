import { describe, expect, it } from 'vitest'
import { crc32, md, search, snippet, zip } from './markdown-notes'

describe('markdown-notes', () => {
  it('renders blocks', () => {
    expect(md('# Hi')).toBe('<h1>Hi</h1>')
    expect(md('- a\n- [x] b')).toBe('<ul><li>a</li><li class="task"><input type="checkbox" disabled checked> b</li></ul>')
    expect(md('```js\n<b>\n```')).toBe('<pre><code class="lang-js">&lt;b&gt;</code></pre>')
    expect(md('| a | b |\n|---|--:|\n| 1 | 2 |')).toContain('<td style="text-align:right">2</td>')
    expect(md('> quote')).toBe('<blockquote><p>quote</p></blockquote>')
    expect(md('---')).toBe('<hr>')
  })
  it('renders inline and escapes', () => {
    expect(md('**b** *i* `c<` ~~d~~')).toBe('<p><strong>b</strong> <em>i</em> <code>c&lt;</code> <del>d</del></p>')
    expect(md('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>')
    expect(md('[x](javascript:alert(1))')).not.toContain('javascript')
    expect(md('see [[Other note]]')).toContain('data-note="Other note"')
  })
  it('searches with prefixes, AND and tags', () => {
    const docs = [
      { id: '1', title: 'Pasta recipe', body: 'Boil water, add salt', tags: ['food'] },
      { id: '2', title: 'Trip', body: 'Pack pasta and water bottle', tags: ['travel'] },
    ]
    expect(search(docs, 'past').map((h) => h.id)).toEqual(['1', '2'])
    expect(search(docs, 'pasta bottle').map((h) => h.id)).toEqual(['2'])
    expect(search(docs, '#food water').map((h) => h.id)).toEqual(['1'])
    expect(snippet('Hello **world** again', 'world')).toContain('world')
  })
  it('crc32 and zip', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const z = zip([{ name: 'a.md', text: 'hi' }])
    expect(z[0]).toBe(0x50)
    expect(z.length).toBe(30 + 4 + 2 + 46 + 4 + 22)
  })
})
