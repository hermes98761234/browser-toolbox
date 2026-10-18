import { describe, expect, it } from 'vitest'
import { closure, criterion, FN, formatValue, general, graph, parse, roundHalf, Sheet, toSerial, XErr, type V } from './formula-tester'
import { DOCS, sampleCells } from './formula-tester-docs'

const sheet = () => new Sheet(sampleCells(), 30, 10, new Date(2026, 9, 18))
const run = (f: string, s = sheet()): V => s.run(f).value
const val = (f: string) => { const v = run(f); return v instanceof XErr ? v.code : v }

describe('parser', () => {
  it('follows Excel precedence', () => {
    expect(val('=1+2*3')).toBe(7)
    expect(val('=-2^2')).toBe(4) // unary minus binds tighter than ^
    expect(val('=2^3^2')).toBe(64) // left-associative
    expect(val('=50%*10')).toBe(5)
    expect(val('="a"&1+1')).toBe('a2')
    expect(val('=1+1=2')).toBe(true)
  })
  it('reports syntax problems', () => {
    expect(() => parse('=SUM(1,')).toThrow()
    expect(() => parse('=1 2')).toThrow()
    expect(sheet().run('=(1+2').error).toMatch(/Expected/)
  })
})

describe('sample sheet', () => {
  it('computes the summary column', () => {
    const s = sheet()
    expect(s.value('G7')).toBe(108.75)
    expect(s.value('J2')).toBe(527)
    expect(s.value('J3')).toBe(20)
    expect(s.value('J4')).toBe(4)
    expect(s.value('J5')).toBe(7.41)
    expect(s.value('J6')).toBe(168.75)
    expect(s.value('J7')).toBe('Ben')
    expect(s.value('J8')).toBe(7.25)
    expect(s.value('J9')).toBe('Jan 14, 2026')
    expect(s.value('J10')).toBe('On target')
  })
  it('every documented function exists and its example evaluates without #NAME?', () => {
    for (const [name, , , , ex] of DOCS) {
      expect(FN[name], name).toBeTypeOf('function')
      const v = run(ex)
      if (name !== 'NA' && name !== 'IFERROR') expect(v instanceof XErr ? `${name}: ${v.code}` : 'ok').toBe('ok')
    }
    expect(Object.keys(FN).length).toBeGreaterThanOrEqual(80)
  })
})

describe('functions', () => {
  it('lookups', () => {
    expect(val('=VLOOKUP("Dev",B2:E9,4,FALSE)')).toBe(12)
    expect(val('=VLOOKUP("Zed",B2:E9,4,FALSE)')).toBe('#N/A')
    expect(val('=VLOOKUP(6,{1},1)')).toBe('#NAME?')
    expect(val('=MATCH(9,D2:D9,0)')).toBe(7)
    expect(val('=INDEX(A1:G9,3,2)')).toBe('Ben')
    expect(val('=XLOOKUP("Zed",B2:B9,D2:D9,"none")')).toBe('none')
    expect(val('=XLOOKUP("Dev",B2:B9,D2:D9,,0,-1)')).toBe(11)
    expect(val('=XLOOKUP(10,D2:D9,B2:B9,,1)')).toBe('Dev') // next larger: 11
    expect(val('=XLOOKUP("Ch*",B2:B9,C2:C9,,2)')).toBe('Gizmo')
    expect(val('=HLOOKUP("Units",A1:G9,3,FALSE)')).toBe(5)
  })
  it('conditionals and criteria', () => {
    expect(val('=COUNTIF(C2:C9,"G*")')).toBe(5)
    expect(val('=COUNTIF(A2:A9,"<>North")')).toBe(6)
    expect(val('=SUMIFS(G2:G9,C2:C9,"Gizmo",D2:D9,">10")')).toBe(188.5)
    expect(val('=AVERAGEIF(C2:C9,"Widget",D2:D9)')).toBeCloseTo(41 / 3)
    expect(val('=SUMPRODUCT((A2:A9="North")*D2:D9*E2:E9)')).toBe(112)
    expect(criterion('>=10')(12)).toBe(true)
    expect(criterion('>=10')('12')).toBe(true)
    expect(criterion('a?c')('ABC')).toBe(true)
    expect(criterion('')(null)).toBe(true)
  })
  it('logic and errors', () => {
    expect(val('=IFS(D2>=15,"Large",D2>=8,"Medium",TRUE,"Small")')).toBe('Medium')
    expect(val('=IFS(FALSE,1)')).toBe('#N/A')
    expect(val('=IFERROR(1/0,"x")')).toBe('x')
    expect(val('=1/0')).toBe('#DIV/0!')
    expect(val('=SQRT(-1)')).toBe('#NUM!')
    expect(val('="a"+1')).toBe('#VALUE!')
    expect(val('=FOO(1)')).toBe('#NAME?')
    expect(val('=SUM(1,1/0)')).toBe('#DIV/0!')
    expect(val('=AND(TRUE,1,"x")')).toBe(true)
    expect(val('=SWITCH(3,1,"a",2,"b","z")')).toBe('z')
  })
  it('math and text', () => {
    expect(roundHalf(2.5, 0)).toBe(3)
    expect(roundHalf(-2.5, 0)).toBe(-3)
    expect(roundHalf(1.005, 2)).toBe(1.01)
    expect(roundHalf(1234, -2)).toBe(1200)
    expect(val('=MOD(-3,2)')).toBe(1)
    expect(val('=CEILING(7.41,0.05)')).toBe(7.45)
    expect(val('=PROPER("hello wORLD")')).toBe('Hello World')
    expect(val('=SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c')
    expect(val('=SEARCH("G",C3)')).toBe(1)
    expect(val('=TEXTJOIN(", ",TRUE,B2:B4)')).toBe('Ana, Ben, Chloe')
    expect(val('=VALUE("$1,250.50")')).toBe(1250.5)
    expect(general(0.1 + 0.2)).toBe('0.3')
  })
  it('TEXT formats', () => {
    expect(formatValue(1234.5, '#,##0.00')).toBe('1,234.50')
    expect(formatValue(0.256, '0.0%')).toBe('25.6%')
    expect(formatValue(527, '$#,##0.00')).toBe('$527.00')
    expect(formatValue(-5, '0;(0)')).toBe('(5)')
    expect(formatValue(3.14159, '0.##')).toBe('3.14')
    expect(formatValue(12345, '0.00E+00')).toBe('1.23E+04')
    expect(formatValue(toSerial(2026, 3, 5), 'yyyy-mm-dd')).toBe('2026-03-05')
    expect(formatValue(toSerial(2026, 3, 5), 'dddd, mmmm d')).toBe('Thursday, March 5')
    expect(formatValue(toSerial(2026, 3, 5) + 0.75, 'h:mm AM/PM')).toBe('6:00 PM')
  })
  it('dates', () => {
    expect(toSerial(2026, 1, 1)).toBe(46023)
    expect(val('=DATE(2026,14,1)')).toBe(toSerial(2027, 2, 1))
    expect(val('=EDATE(DATE(2026,1,31),1)')).toBe(toSerial(2026, 2, 28))
    expect(val('=EOMONTH(DATE(2024,2,10),0)')).toBe(toSerial(2024, 2, 29))
    expect(val('=DATEDIF(DATE(2020,5,15),DATE(2026,3,10),"Y")')).toBe(5)
    expect(val('=DATEDIF(DATE(2020,5,15),DATE(2026,3,10),"YM")')).toBe(9)
    expect(val('=WEEKDAY(DATE(2026,10,18))')).toBe(1)
    expect(val('=NETWORKDAYS(DATE(2026,10,12),DATE(2026,10,18))')).toBe(5)
    expect(val('=TODAY()')).toBe(toSerial(2026, 10, 18))
  })
})

describe('graph', () => {
  it('finds precedents, dependents and cycles', () => {
    const s = sheet()
    const g = graph(s)
    expect(g.prec.get('G2')).toEqual(['D2', 'E2'])
    expect(closure(g.prec, 'J10').has('D5')).toBe(true)
    expect(closure(g.dep, 'D2').has('J10')).toBe(true)
    expect(g.order.indexOf('G2')).toBeLessThan(g.order.indexOf('J2'))
    const c = new Sheet({ A1: '=B1+1', B1: '=A1' })
    expect(graph(c).cycles.sort()).toEqual(['A1', 'B1'])
    expect((c.value('A1') as XErr).code).toBe('#CIRC!')
  })
})
