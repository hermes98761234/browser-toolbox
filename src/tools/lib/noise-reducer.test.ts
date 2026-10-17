import { describe, expect, it } from 'vitest'
import { demoSignal, denoise, fft, gate, highpass, learnProfile, noiseFloorDb, rmsDb, snrDb, stftPower } from './noise-reducer'

const sine = (f: number, rate: number, n: number, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / rate))

describe('noise-reducer', () => {
  it('fft round-trips and finds a tone', () => {
    const n = 64
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n))
    const im = new Float64Array(n)
    const orig = re.slice()
    fft(re, im)
    expect(Math.hypot(re[5], im[5])).toBeCloseTo(n / 2, 6)
    expect(Math.hypot(re[6], im[6])).toBeLessThan(1e-9)
    fft(re, im, true)
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(orig[i], 9)
  })
  it('STFT/ISTFT with unity gain reconstructs the input', () => {
    const x = Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i * 0.05) * 0.3 + Math.sin(i * 0.31) * 0.2)
    const y = denoise(x, new Float64Array(257), 512, { method: 'subtract', reductionDb: 0, overSub: 1, smoothing: 0 })
    let err = 0
    for (let i = 0; i < x.length; i++) err = Math.max(err, Math.abs(x[i] - y[i]))
    expect(err).toBeLessThan(1e-5)
  })
  it('improves SNR on the demo signal with both methods', () => {
    const rate = 16000
    const { clean, noisy } = demoSignal(rate, 6)
    const prof = learnProfile(stftPower(noisy, 512, 128))
    const before = snrDb(clean, noisy)
    for (const method of ['subtract', 'wiener'] as const) {
      const y = denoise(highpass(noisy, rate, 80), prof, 512, { method, reductionDb: 24, overSub: 1.5, smoothing: 0.5 })
      expect(snrDb(clean, y)).toBeGreaterThan(before + 3)
      expect(noiseFloorDb(y, rate)).toBeLessThan(noiseFloorDb(noisy, rate) - 10)
    }
  })
  it('learns a profile from an explicit range', () => {
    const p = learnProfile([new Float64Array([1, 1]), new Float64Array([3, 5]), new Float64Array([100, 100])], [0, 2])
    expect([...p]).toEqual([2, 3])
  })
  it('high-pass removes rumble and keeps voice band', () => {
    const rate = 16000
    expect(rmsDb(highpass(sine(20, rate, 16000), rate, 100).subarray(4000, 12000))).toBeLessThan(rmsDb(sine(20, rate, 16000)) - 25)
    expect(Math.abs(rmsDb(highpass(sine(1000, rate, 16000), rate, 100).subarray(4000, 12000)) - rmsDb(sine(1000, rate, 16000)))).toBeLessThan(0.2)
  })
  it('gate attenuates quiet parts only', () => {
    const rate = 8000
    const x = new Float32Array(16000)
    x.set(sine(300, rate, 8000, 0.5), 0)
    x.set(sine(300, rate, 8000, 0.001), 8000)
    const y = gate(x, rate, -40, 30)
    expect(rmsDb(y.subarray(1000, 7000))).toBeCloseTo(rmsDb(x.subarray(1000, 7000)), 0)
    expect(rmsDb(y.subarray(12000))).toBeLessThan(rmsDb(x.subarray(12000)) - 25)
  })
})
