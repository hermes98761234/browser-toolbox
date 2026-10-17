import { describe, expect, it } from 'vitest'
import { zipStore } from './pdf-splitter'
import { applyFilter, docxText, fields, fileName, fillDocxXml, fillText, unzip } from './document-assembly-tool'

describe('text templates', () => {
  it('lists fields', () => expect(fields('Hi {{ name }}, {{salary|money}} {{name}}')).toEqual(['name', 'salary']))
  it('fills with filters and missing markers', () => {
    expect(fillText('Dear {{Name|upper}}, salary {{salary | money:€}} from {{start|date}}; {{x}}', { name: 'ann lee', salary: '72000', start: '2026-03-04' }))
      .toBe('Dear ANN LEE, salary €72,000.00 from March 4, 2026; [x]')
  })
  it('filters', () => {
    expect(applyFilter('', 'default:N/A')).toBe('N/A')
    expect(applyFilter('mary-jane smith', 'title')).toBe('Mary-Jane Smith')
    expect(applyFilter('1234.5', 'number')).toBe('1,234.5')
  })
  it('file names', () => expect(fileName('{{name}} / offer', { name: 'Ann' }, 0)).toBe('Ann - offer'))
})

describe('docx xml', () => {
  it('fills placeholders split across runs', () => {
    const xml = '<w:body><w:p><w:r><w:t>Hello {{na</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>me}}</w:t></w:r><w:r><w:t xml:space="preserve">, welcome &amp; enjoy</w:t></w:r></w:p><w:p><w:r><w:t>No fields</w:t></w:r></w:p></w:body>'
    const out = fillDocxXml(xml, { name: 'Tom & Jerry' })
    expect(docxText(out)).toBe('Hello Tom & Jerry, welcome & enjoy\nNo fields')
    expect(out).toContain('Tom &amp; Jerry')
    expect(out).toContain('<w:t>No fields</w:t>')
  })
})

describe('unzip', () => {
  it('reads stored entries written by zipStore', async () => {
    const enc = new TextEncoder()
    const z = zipStore([{ name: 'a.txt', data: enc.encode('alpha') }, { name: 'dir/b.xml', data: enc.encode('<b/>') }])
    const files = await unzip(z)
    expect(files.map((f) => [f.name, new TextDecoder().decode(f.data)])).toEqual([['a.txt', 'alpha'], ['dir/b.xml', '<b/>']])
  })
  it('reads deflated entries', async () => {
    const enc = new TextEncoder()
    const raw = new Uint8Array(await new Response(new Blob([enc.encode('hello hello hello')]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    const z = zipStore([{ name: 'x.txt', data: raw }])
    // patch method to 8 (deflate) in local + central headers, and uncompressed size in central dir
    const dv = new DataView(z.buffer)
    dv.setUint16(8, 8, true)
    const cd = z.length - 22 - (46 + 5)
    dv.setUint16(cd + 10, 8, true)
    const files = await unzip(z)
    expect(new TextDecoder().decode(files[0].data)).toBe('hello hello hello')
  })
})
