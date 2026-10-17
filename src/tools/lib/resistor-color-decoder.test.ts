import { describe, expect, it } from 'vitest'
import { decode, encode, eSeries, formatOhms, nearestE, parseOhms } from './resistor-color-decoder'

const E96 = '100 102 105 107 110 113 115 118 121 124 127 130 133 137 140 143 147 150 154 158 162 165 169 174 178 182 187 191 196 200 205 210 215 221 226 232 237 243 249 255 261 267 274 280 287 294 301 309 316 324 332 340 348 357 365 374 383 392 402 412 422 432 442 453 464 475 487 499 511 523 536 549 562 576 590 604 619 634 649 665 681 698 715 732 750 768 787 806 825 845 866 887 909 931 953 976'

describe('resistor-color-decoder', () => {
  it('decodes bands', () => {
    expect(decode(['yellow', 'violet', 'red', 'gold'])).toMatchObject({ ohms: 4700, tol: 5, min: 4465, max: 4935 })
    expect(decode(['brown', 'black', 'black', 'red', 'brown', 'brown'])).toMatchObject({ ohms: 10000, tol: 1, tempco: 100 })
    expect(decode(['yellow', 'violet', 'gold', 'gold']).ohms).toBe(4.7)
    expect(decode(['brown', 'black', 'orange']).tol).toBe(20)
    expect(decode(['gold', 'black', 'red', 'gold']).error).toBeTruthy()
  })
  it('encodes values', () => {
    expect(encode(4700, 4, 5).bands).toEqual(['yellow', 'violet', 'red', 'gold'])
    expect(encode(0.47, 4, 10).bands).toEqual(['yellow', 'violet', 'silver', 'silver'])
    expect(encode(12400, 5, 1).bands).toEqual(['brown', 'red', 'yellow', 'red', 'brown'])
    const r = encode(12400, 4, 5)
    expect(r.ohms).toBe(12000)
    expect(r.exact).toBe(false)
    expect(encode(99.6, 4, 5).ohms).toBe(100)
    expect(encode(1e12, 4, 5).error).toBeTruthy()
  })
  it('builds E-series and finds nearest values', () => {
    expect(eSeries('E96').map((v) => Math.round(v * 100)).join(' ')).toBe(E96)
    expect(eSeries('E12')).toEqual([1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2])
    expect(eSeries('E192')).toContain(9.2)
    expect(nearestE(5000, 'E12')).toMatchObject({ value: 4700, below: 4700, above: 5600 })
    expect(nearestE(9800, 'E24').value).toBe(10000)
  })
  it('parses and formats ohms', () => {
    expect(parseOhms('4k7')).toBe(4700)
    expect(parseOhms('0R1')).toBe(0.1)
    expect(parseOhms('2.2 MΩ')).toBe(2.2e6)
    expect(parseOhms('330')).toBe(330)
    expect(parseOhms('abc')).toBeNaN()
    expect(formatOhms(4700)).toBe('4.7 kΩ')
    expect(formatOhms(0.47)).toBe('470 mΩ')
  })
})
