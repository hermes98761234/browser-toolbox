import { describe, expect, it } from 'vitest'
import { colIndex, colName, formatCell, isDateFormat, readXlsx, sampleXlsx, serialToDate, toCsvText, unescapeXml, unzip, zipDeflate, type CsvOpts } from './excel-to-csv'

const O: CsvOpts = { delimiter: ',', quoteAll: false, eol: '\n', dates: 'iso', trim: true, decimal: '.' }

describe('helpers', () => {
  it('columns', () => {
    expect(colIndex('A1')).toBe(0)
    expect(colIndex('Z9')).toBe(25)
    expect(colIndex('AA3')).toBe(26)
    expect(colIndex('XFD1')).toBe(16383)
    expect(colName(27)).toBe('AB')
  })
  it('dates', () => {
    expect(serialToDate(45658).toISOString().slice(0, 10)).toBe('2025-01-01')
    expect(serialToDate(1).toISOString().slice(0, 10)).toBe('1900-01-01')
    expect(serialToDate(61).toISOString().slice(0, 10)).toBe('1900-03-01')
    expect(serialToDate(0, true).toISOString().slice(0, 10)).toBe('1904-01-01')
    expect(formatCell(serialToDate(45658.75), O)).toBe('2025-01-01 18:00:00')
    expect(formatCell(serialToDate(0.5), O)).toBe('12:00:00')
    expect(isDateFormat('yyyy\\-mm\\-dd')).toBe(true)
    expect(isDateFormat('#,##0.00 "kg"')).toBe(false)
    expect(isDateFormat('[Red]0.00')).toBe(false)
  })
  it('xml entities', () => {
    expect(unescapeXml('a &amp; b &lt;c&gt; &#233;&#x41;')).toBe('a & b <c> éA')
  })
  it('csv quoting', () => {
    expect(toCsvText([['a,b', 'say "hi"', 1.5, true, null], ['', '', '', '', '']], O)).toBe('"a,b","say ""hi""",1.5,TRUE\n')
    expect(toCsvText([[0.1 + 0.2, 3]], { ...O, delimiter: ';', decimal: ',' })).toBe('0,3;3\n')
  })
})

describe('xlsx round trip', () => {
  it('zip deflate and unzip', async () => {
    const z = await zipDeflate([{ name: 'a.txt', text: 'hello '.repeat(50) }])
    expect(new TextDecoder().decode((await unzip(z)).get('a.txt'))).toBe('hello '.repeat(50))
  })
  it('reads the sample workbook', async () => {
    const sheets = await readXlsx(await sampleXlsx())
    expect(sheets.map((s) => s.name)).toEqual(['Sales Q1', 'Staff', 'Lookup'])
    expect(sheets[2].hidden).toBe(true)
    const sales = sheets[0].rows
    expect(sales[0][0]).toBe('Date')
    expect(formatCell(sales[1][0], O)).toBe('2026-01-01')
    expect(sales[1][2]).toBe('Widget "Pro"')
    expect(sales[1][6]).toBe(false)
    expect(sales[19][2]).toBe('Total')
    const csv = toCsvText(sheets[1].rows, O).split('\n')
    expect(csv[0]).toBe('ID,Name,Department,Start date,Salary,Notes')
    expect(csv[1]).toBe('101,Olena Kovalenko,Engineering,2021-01-04,72000,"Team lead;')
  })
})
