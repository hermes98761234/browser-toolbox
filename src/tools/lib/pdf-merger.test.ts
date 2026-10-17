import { describe, expect, it } from 'vitest'
import { describePages, paperName, parseRanges } from './pdf-merger'

describe('parseRanges', () => {
  it('empty and all select every page', () => {
    expect(parseRanges('', 3).pages).toEqual([0, 1, 2])
    expect(parseRanges('all', 2).pages).toEqual([0, 1])
  })
  it('lists, ranges, open ends, reverse', () => {
    expect(parseRanges('1-3, 5', 6).pages).toEqual([0, 1, 2, 4])
    expect(parseRanges('4-', 6).pages).toEqual([3, 4, 5])
    expect(parseRanges('-2', 6).pages).toEqual([0, 1])
    expect(parseRanges('3-1', 6).pages).toEqual([2, 1, 0])
    expect(parseRanges('last', 6).pages).toEqual([5])
  })
  it('odd / even', () => {
    expect(parseRanges('odd', 5).pages).toEqual([0, 2, 4])
    expect(parseRanges('even', 5).pages).toEqual([1, 3])
  })
  it('reports errors', () => {
    expect(parseRanges('7', 6).error).toMatch(/doesn't exist/)
    expect(parseRanges('0', 6).error).toBeTruthy()
    expect(parseRanges('abc', 6).error).toBeTruthy()
  })
})

describe('helpers', () => {
  it('describePages', () => expect(describePages([0, 1, 2, 4, 6, 7])).toBe('1–3, 5, 7–8'))
  it('paperName', () => {
    expect(paperName(595.28, 841.89)).toBe('A4')
    expect(paperName(792, 612)).toBe('Letter landscape')
    expect(paperName(283.46, 283.46)).toBe('100×100 mm')
  })
})
