import { describe, expect, it } from 'vitest'
import { inline, markdown, safeUrl, textStats } from './markdown-live-editor'

const md = (s: string, allowHtml = false) => markdown(s, { allowHtml }).html

describe('markdown-live-editor', () => {
  it('headings with ids', () => {
    const r = markdown('# Hello *World*\n\nTitle\n=====\n\n## Hello World')
    expect(r.html).toContain('<h1 id="hello-world">Hello <em>World</em></h1>')
    expect(r.html).toContain('<h1 id="title">Title</h1>')
    expect(r.html).toContain('<h2 id="hello-world-1">')
    expect(r.headings.length).toBe(3)
  })
  it('inline formatting', () => {
    expect(inline('**b** *i* ~~s~~ `a<b>` snake_case_word')).toBe('<strong>b</strong> <em>i</em> <del>s</del> <code>a&lt;b&gt;</code> snake_case_word')
    expect(inline('[x](https://a.b "T")')).toBe('<a href="https://a.b" title="T">x</a>')
    expect(inline('see https://example.com.')).toBe('see <a href="https://example.com">https://example.com</a>.')
    expect(inline('![cat](c.png)')).toBe('<img src="c.png" alt="cat" loading="lazy">')
    expect(inline('a  \nb')).toBe('a<br>\nb')
    expect(inline('\\*not em\\*')).toBe('*not em*')
  })
  it('escapes html and blocks dangerous urls', () => {
    expect(md('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(inline('[x](javascript:alert(1))')).toContain('href="#"')
    expect(safeUrl('JaVa\nScript:alert(1)')).toBe('#')
    expect(safeUrl('data:image/png;base64,AAA', true)).toBe('data:image/png;base64,AAA')
    expect(safeUrl('data:text/html,hi', true)).toBe('#')
    expect(md('<b>hi</b>', true)).toBe('<b>hi</b>')
  })
  it('lists, tasks and nesting', () => {
    expect(md('- a\n- b\n  - c\n- [x] done')).toBe('<ul>\n<li>a</li>\n<li>b\n<ul>\n<li>c</li>\n</ul></li>\n<li class="task"><input type="checkbox" disabled checked> done</li>\n</ul>')
    expect(md('3. x\n4. y')).toBe('<ol start="3">\n<li>x</li>\n<li>y</li>\n</ol>')
    expect(md('- a\n\n- b')).toContain('<li><p>a</p></li>')
  })
  it('code, quotes, rules, tables', () => {
    expect(md('```js\nlet a = 1 < 2\n```')).toBe('<pre><code class="language-js">let a = 1 &lt; 2\n</code></pre>')
    expect(md('> quote\n> more')).toBe('<blockquote>\n<p>quote\nmore</p>\n</blockquote>')
    expect(md('---')).toBe('<hr>')
    expect(md('| a | b |\n|:--|--:|\n| 1 | 2 |')).toBe('<table>\n<thead><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr></thead>\n<tbody>\n<tr><td style="text-align:left">1</td><td style="text-align:right">2</td></tr>\n</tbody>\n</table>')
  })
  it('stats', () => {
    expect(textStats('# Hi there\n\nOne two three.').words).toBe(5)
  })
})

describe('list tightness', () => {
  it('a following list of another type does not make the list loose', () => {
    expect(md('- a\n- b\n\n1. c')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<ol>\n<li>c</li>\n</ol>')
  })
})
