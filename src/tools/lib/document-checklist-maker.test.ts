import { describe, expect, it } from 'vitest'
import { daysLeft, fromTemplate, progress, sections, TEMPLATES, toMarkdown, toPrintHtml, type Checklist } from './document-checklist-maker'

describe('templates', () => {
  it('parse sections, required flags and hints', () => {
    const items = fromTemplate('# A\n* one :: hint here\n- two\n# B\n* three')
    expect(items.map((i) => [i.section, i.text, i.required])).toEqual([['A', 'one', true], ['A', 'two', false], ['B', 'three', true]])
    expect(items[0].note).toBe('Hint: hint here')
    expect(new Set(items.map((i) => i.id)).size).toBe(3)
  })
  it('every bundled template has sections and required items', () => {
    for (const t of TEMPLATES) {
      const it = fromTemplate(t.body)
      expect(it.length).toBeGreaterThan(5)
      expect(sections(it).length).toBeGreaterThan(1)
      expect(it.some((i) => i.required)).toBe(true)
    }
  })
})

describe('progress & exports', () => {
  const items = fromTemplate('# A\n* one\n* two\n- three\n- four')
  items[0].state = 'done'
  items[2].state = 'done'
  items[3].state = 'na'
  const c: Checklist = { id: 'x', title: 'Test <list>', who: 'Ann', due: '2026-11-01', template: '', items }
  it('excludes n/a items', () => {
    expect(progress(items)).toEqual({ done: 2, total: 3, required: 2, requiredDone: 1, na: 1, pct: 2 / 3 })
  })
  it('markdown task list', () => {
    const md = toMarkdown(c)
    expect(md).toContain('- [x] one *')
    expect(md).toContain('- [ ] two *')
    expect(md).toContain('~~four~~ (n/a)')
  })
  it('printable HTML escapes text', () => {
    const h = toPrintHtml(c)
    expect(h).toContain('<title>Test &lt;list&gt;</title>')
    expect(h).toContain('2/3 ready')
  })
  it('days left', () => {
    expect(daysLeft('2026-11-01', '2026-10-18')).toBe(14)
    expect(daysLeft('', '2026-10-18')).toBeNull()
  })
})
