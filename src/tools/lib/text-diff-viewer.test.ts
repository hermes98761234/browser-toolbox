import { describe, expect, it } from 'vitest'
import { diffKeys, diffLines, diffWords, sideBySide, splitLines, unifiedPatch } from './text-diff-viewer'

describe('text-diff-viewer', () => {
  it('finds a shortest edit script', () => {
    const a = 'ABCABBA'.split(''), b = 'CBABAC'.split('')
    const ops = diffKeys(a, b)
    expect(ops.filter((o) => o.t !== 'eq').length).toBe(5)
    // Applying the script rebuilds b
    expect(ops.filter((o) => o.t !== 'del').map((o) => b[o.b]).join('')).toBe('CBABAC')
    expect(ops.filter((o) => o.t !== 'ins').map((o) => a[o.a]).join('')).toBe('ABCABBA')
  })
  it('splits lines and tracks the final newline', () => {
    expect(splitLines('a\r\nb\n')).toEqual({ lines: ['a', 'b'], eol: true })
    expect(splitLines('a\nb')).toEqual({ lines: ['a', 'b'], eol: false })
    expect(splitLines('')).toEqual({ lines: [], eol: true })
  })
  it('matches diff -u output', () => {
    const o = 'abcdefghijklm'.split('').join('\n') + '\n'
    const n = o.replace('b\n', 'B\n') + 'n'
    expect(unifiedPatch(diffLines(o, n), 'o.txt', 'n.txt')).toBe(
      '--- o.txt\n+++ n.txt\n@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n@@ -11,3 +11,4 @@\n k\n l\n m\n+n\n\\ No newline at end of file\n',
    )
    expect(unifiedPatch(diffLines('', 'x\ny\n'))).toBe('--- a.txt\n+++ b.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n')
    expect(unifiedPatch(diffLines('same\n', 'same\n'))).toBe('')
  })
  it('honours ignore options and similarity', () => {
    const d = diffLines('Hello  World\nx', 'hello world\nx', { ignoreCase: true, ignoreWhitespace: true })
    expect(d.added + d.removed).toBe(0)
    expect(d.similarity).toBe(1)
  })
  it('diffs words and pairs rows', () => {
    const p = diffWords('the quick brown fox', 'the slow brown fox')
    expect(p).toEqual([{ t: 'eq', text: 'the ' }, { t: 'del', text: 'quick' }, { t: 'ins', text: 'slow' }, { t: 'eq', text: ' brown fox' }])
    const rows = sideBySide(diffLines('a\nb\nc\n', 'a\nB\nX\nc\n').ops)
    expect(rows.map((r) => r.kind)).toEqual(['eq', 'chg', 'ins', 'eq'])
  })
})
