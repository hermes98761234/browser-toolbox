import { describe, expect, it } from 'vitest'
import { buildIco, htmlSnippet, manifest, readIco } from './favicon-generator'

describe('favicon generator', () => {
  it('writes a valid ICO directory with PNG payloads', () => {
    const a = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])
    const b = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])
    const ico = buildIco([{ size: 32, png: a }, { size: 16, png: b }, { size: 256, png: a }])
    expect(ico.length).toBe(6 + 48 + 6 + 5 + 6)
    expect([...ico.slice(0, 6)]).toEqual([0, 0, 1, 0, 3, 0])
    const dir = readIco(ico)
    expect(dir.map((d) => d.size)).toEqual([16, 32, 256])
    expect(dir[0]).toEqual({ size: 16, bytes: 5, offset: 54 })
    expect(dir[1].offset).toBe(59)
    expect([...ico.slice(59, 65)]).toEqual([...a])
    expect(ico[6 + 32]).toBe(0) // 256 stored as 0
    expect(ico[6 + 6]).toBe(32) // bit depth
  })
  it('manifest and snippet', () => {
    const m = JSON.parse(manifest({ name: 'My App', short: '', theme: '#111111', bg: '#ffffff', path: '/' }))
    expect(m.short_name).toBe('My App')
    expect(m.icons).toHaveLength(3)
    expect(htmlSnippet({ path: '/static', theme: '#000' })).toContain('href="/static/favicon.ico"')
  })
})
