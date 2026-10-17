import { describe, expect, it } from 'vitest'
import { ansiToHtml, highlight, parseNotebook, stats, stripAnsi, toScript } from './notebook-file-viewer'

const NB = JSON.stringify({
  nbformat: 4, nbformat_minor: 5,
  metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
  cells: [
    { cell_type: 'markdown', metadata: {}, source: ['# Title\n', 'Some *text*'] },
    { cell_type: 'code', execution_count: 1, metadata: {}, source: 'x = 1\nprint(x)', outputs: [{ output_type: 'stream', name: 'stdout', text: ['1\n'] }] },
    { cell_type: 'code', execution_count: 2, metadata: {}, source: 'x', outputs: [{ output_type: 'execute_result', execution_count: 2, data: { 'text/plain': ['1'], 'text/html': ['<b>1</b>'] }, metadata: {} }] },
    { cell_type: 'code', execution_count: 3, metadata: {}, source: '1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero', traceback: ['\u001b[0;31mZeroDivisionError\u001b[0m: division by zero'] }] },
    { cell_type: 'code', execution_count: null, metadata: {}, source: '', outputs: [] },
  ],
})

describe('notebook parser', () => {
  it('parses cells and outputs', () => {
    const nb = parseNotebook(NB)
    expect(nb.cells).toHaveLength(5)
    expect(nb.title).toBe('Title')
    expect(nb.kernel).toBe('Python 3')
    expect(nb.cells[0].source).toBe('# Title\nSome *text*')
    expect(nb.cells[1].outputs[0]).toEqual({ kind: 'stream', name: 'stdout', text: '1\n' })
    const o = nb.cells[2].outputs[0]
    expect(o.kind === 'data' && o.mime).toBe('text/html')
    expect(nb.cells[3].outputs[0].kind).toBe('error')
    const st = stats(nb)
    expect(st).toMatchObject({ code: 4, markdown: 1, outputs: 3, errors: 1, unexecuted: 0, inOrder: true })
  })
  it('supports nbformat 3 worksheets', () => {
    const nb = parseNotebook(JSON.stringify({ nbformat: 3, worksheets: [{ cells: [{ cell_type: 'heading', level: 2, source: 'Hi' }, { cell_type: 'code', input: 'a=1', prompt_number: 4, outputs: [{ output_type: 'pyout', png: 'AAA', text: '<Figure>' }] }] }] }))
    expect(nb.cells[0].source).toBe('## Hi')
    expect(nb.cells[1].count).toBe(4)
    const o = nb.cells[1].outputs[0]
    expect(o.kind === 'data' && o.mime).toBe('image/png')
  })
  it('rejects non-notebooks', () => {
    expect(() => parseNotebook('{"a":1}')).toThrow()
  })
  it('highlights python safely', () => {
    const h = highlight('def f(x):  # <c>\n    return "a<b" + 2', 'python')
    expect(h).toContain('<span class="t-kw">def</span>')
    expect(h).toContain('<span class="t-fn">f</span>')
    expect(h).toContain('<span class="t-com"># &lt;c&gt;</span>')
    expect(h).toContain('<span class="t-str">&quot;a&lt;b&quot;</span>')
    expect(h).toContain('<span class="t-num">2</span>')
  })
  it('converts ANSI codes', () => {
    const s = '\u001b[0;31mErr\u001b[0m: x<y'
    expect(ansiToHtml(s)).toBe('<span style="color:#dc2626;">Err</span>: x&lt;y')
    expect(stripAnsi(s)).toBe('Err: x<y')
  })
  it('exports percent-format script', () => {
    const sc = toScript(parseNotebook(NB))
    expect(sc.startsWith('# %% [markdown]\n# # Title\n# Some *text*\n')).toBe(true)
    expect(sc).toContain('# %%\nx = 1\nprint(x)\n')
  })
})
