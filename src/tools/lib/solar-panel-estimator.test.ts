import { describe, expect, it } from 'vitest'
import { airMass, calibrate, clearSky, cosIncidence, DEFAULT_SYS, fitPanels, monthGhi, seasonalTemps, simulate } from './solar-panel-estimator'

describe('solar model', () => {
  it('air mass', () => {
    expect(airMass(90)).toBeCloseTo(1, 2)
    expect(airMass(30)).toBeCloseTo(1.994, 1)
  })
  it('clear-sky DNI at zenith ≈ 950 W/m²', () => {
    const c = clearSky(90, 80)
    expect(c.dni).toBeGreaterThan(900)
    expect(c.dni).toBeLessThan(1000)
  })
  it('incidence on a south panel at solar noon', () => {
    expect(cosIncidence(60, 180, 30, 180)).toBeCloseTo(1, 6)
    expect(cosIncidence(90, 0, 0, 180)).toBeCloseTo(1, 6)
  })
  it('panel fitting', () => {
    const l = fitPanels(10, 5, 1.13, 1.72, true, 0.3)
    expect(l.cols).toBe(8)
    expect(l.rows).toBe(2)
  })
  it('specific yields land in realistic ranges', () => {
    const run = (lat: number, lon: number, c: number, t: number, amp: number) =>
      simulate({ ...DEFAULT_SYS, lat, lon, kWp: 1, tilt: 30, clear: Array(12).fill(c), temp: seasonalTemps(t, amp, lat) }, 60).specific
    const phx = run(33.45, -112.07, 0.92, 24, 10)
    const ber = run(52.52, 13.4, 0.53, 10, 9.5)
    expect(phx).toBeGreaterThan(1650)
    expect(phx).toBeLessThan(2000)
    expect(ber).toBeGreaterThan(850)
    expect(ber).toBeLessThan(1150)
  })
  it('calibration inverts the GHI model', () => {
    const g = monthGhi(40, -105, 5, 0.7, 60)
    expect(calibrate(40, -105, 5, g)).toBeCloseTo(0.7, 2)
  })
})
