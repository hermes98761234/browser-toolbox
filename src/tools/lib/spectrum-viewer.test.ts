import { describe, expect, it } from 'vitest'
import { alsBaseline, decodeLine, encodeDifDup, findPeaks, normalize, parseCsvSpectra, parseJcamp, polyBaseline, savgol } from './spectrum-viewer'

const Y = [2, 3, 3, 2, 1, 0, -1, -2, -3]
describe('JCAMP-DX', () => {
  it('decodes AFFN, PAC, SQZ, DIF and DIFDUP forms (spec example)', () => {
    for (const l of ['1 2 3 3 2 1 0 -1 -2 -3', '1+2+3+3+2+1+0-1-2-3', '1BCCBA@abc', '1BJ%jjjjjj', '1BJ%jX']) expect(decodeLine(l).vals).toEqual([1, ...Y])
    expect(decodeLine('1BJ%jX').endsDif).toBe(true)
    expect(decodeLine('100 1.5E+03 -2.5e-1').vals).toEqual([100, 1500, -0.25])
    expect(decodeLine('5A12j3').vals).toEqual([5, 112, 99])
  })
  it('round-trips a compressed file with Y-check values', () => {
    const y = Array.from({ length: 57 }, (_, i) => Math.round(1000 * Math.sin(i / 5)) + (i % 7 === 0 ? 5 : 0))
    const body = encodeDifDup(400, 2, y, 8).join('\n')
    const txt = `##TITLE=test\n##JCAMP-DX=4.24\n##XUNITS=1/CM\n##YUNITS=ABSORBANCE\n##XFACTOR=1\n##YFACTOR=0.001\n##FIRSTX=400\n##LASTX=512\n##NPOINTS=57\n##XYDATA=(X++(Y..Y))\n${body}\n##END=`
    const [s] = parseJcamp(txt)
    expect(s.y.length).toBe(57)
    expect(s.y.map((v) => Math.round(v * 1000))).toEqual(y)
    expect(s.x[56]).toBeCloseTo(512, 9)
    expect(s.yUnits).toBe('ABSORBANCE')
  })
  it('reads XY pairs and peak tables', () => {
    const t = parseJcamp('##TITLE=p\n##XYPOINTS=(XY..XY)\n1,10; 2,20\n3,30\n##PEAK TABLE=(XY..XY)\n2,20\n##END=')
    expect(t[0].x).toEqual([1, 2, 3])
    expect(t[0].peaks).toEqual([[2, 20]])
  })
  it('CSV with several columns', () => {
    const c = parseCsvSpectra('nm,A,B\n400,0.1,0.2\n401,0.2,0.3\n402,0.1,0.1')
    expect(c.map((s) => s.title)).toEqual(['A', 'B'])
  })
})

describe('processing', () => {
  const x = Array.from({ length: 400 }, (_, i) => i)
  const peak = x.map((v) => 5 * Math.exp(-(((v - 200) / 6) ** 2)) + 3 * Math.exp(-(((v - 300) / 4) ** 2)))
  const y = peak.map((v, i) => v + 0.01 * i + 1)
  it('ALS and polynomial baselines remove a linear drift', () => {
    const b = alsBaseline(y, 1e5, 0.001)
    expect(Math.abs(y[50] - b[50])).toBeLessThan(0.05)
    expect(y[200] - b[200]).toBeCloseTo(5, 0)
    const pb = polyBaseline(x, y, 1)
    expect(Math.abs(pb[100] - 2)).toBeLessThan(0.1)
  })
  it('peaks, FWHM, smoothing and normalisation', () => {
    const p = findPeaks(x, peak, 0.1)
    expect(p.map((q) => Math.round(q.x))).toEqual([200, 300])
    expect(p[0].fwhm).toBeCloseTo(2 * 6 * Math.sqrt(Math.log(2)), 0)
    expect(findPeaks(x, peak.map((v) => -v), 0.1, 3, true).length).toBe(2)
    const sm = savgol(peak, 7)
    expect(sm[200]).toBeCloseTo(5, 1)
    expect(Math.max(...normalize(x, y, 'max'))).toBeCloseTo(1, 9)
  })
})
