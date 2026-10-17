/** sRGB 8-bit channel → linear light 0..1 */
export function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const LUT = Array.from({ length: 256 }, (_, i) => srgbToLinear(i))

/** Mean relative luminance (linear, 0..1) of RGBA pixel data, plus the share of clipped pixels. */
export function frameLuminance(data: ArrayLike<number>): { y: number; clipped: number } {
  let sum = 0
  let clip = 0
  const n = Math.floor(data.length / 4)
  for (let i = 0; i < n * 4; i += 4) {
    sum += 0.2126 * LUT[data[i]] + 0.7152 * LUT[data[i + 1]] + 0.0722 * LUT[data[i + 2]]
    if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) clip++
  }
  return { y: n ? sum / n : 0, clipped: n ? clip / n : 0 }
}

/** Incident-light estimate from camera exposure (reflected-light metering of an ~18% grey scene).
 *  EV100 = log2(N²/t) − log2(ISO/100); scaled by how bright the frame came out vs mid grey;
 *  lux ≈ 2.5 · 2^EV100 (C = 250 incident-meter constant). */
export function luxFromExposure(fNumber: number, tSec: number, iso: number, yLinear: number): number {
  const ev100 = Math.log2((fNumber * fNumber) / tSec) - Math.log2(iso / 100)
  return 2.5 * 2 ** ev100 * (yLinear / 0.18)
}

/** Daily light integral (mol/m²/day) from lux, assuming daylight (1 lux ≈ 0.0185 µmol/m²/s PPFD). */
export const dli = (lux: number, hours: number) => (lux * 0.0185 * hours * 3600) / 1e6

export const BANDS: { max: number; name: string; tip: string; color: string }[] = [
  { max: 250, name: 'Too dark', tip: 'Fine for walking through, not for growing. Add a grow light or move closer to a window.', color: '#64748b' },
  { max: 1000, name: 'Low light', tip: 'North-facing room or several metres from a window. Tough foliage plants survive here.', color: '#6366f1' },
  { max: 2500, name: 'Medium-low', tip: 'Bright room, out of the window\'s direct view. Most trailing foliage is happy.', color: '#0ea5e9' },
  { max: 10000, name: 'Bright indirect', tip: 'Near a bright window but out of direct sun. The sweet spot for most tropical houseplants.', color: '#10b981' },
  { max: 20000, name: 'Very bright', tip: 'Right at a sunny window or under a strong grow light. Good for fig trees and herbs.', color: '#f59e0b' },
  { max: Infinity, name: 'Direct sun', tip: 'Full sun on a sill or outdoors. Cacti, succulents, citrus and many herbs love it.', color: '#ef4444' },
]

export const band = (lux: number) => BANDS.find((b) => lux < b.max) ?? BANDS[BANDS.length - 1]

/** Plant light needs in lux: [minimum to survive, ideal low, ideal high] */
export const PLANTS: [string, number, number, number][] = [
  ['ZZ plant', 250, 800, 8000],
  ['Snake plant', 250, 1000, 10000],
  ['Cast iron plant', 200, 500, 3000],
  ['Pothos', 500, 1500, 8000],
  ['Peace lily', 500, 1500, 5000],
  ['Chinese evergreen', 400, 1000, 5000],
  ['Heartleaf philodendron', 800, 2000, 8000],
  ['Calathea / prayer plant', 1000, 2500, 8000],
  ['Boston fern', 1500, 3000, 10000],
  ['Spider plant', 1000, 3000, 15000],
  ['Monstera', 1500, 4000, 15000],
  ['Rubber plant', 2000, 5000, 20000],
  ['Fiddle leaf fig', 4000, 10000, 25000],
  ['Bird of paradise', 5000, 15000, 40000],
  ['Herbs (basil, rosemary)', 10000, 20000, 60000],
  ['Succulents', 10000, 20000, 80000],
  ['Cacti', 15000, 30000, 100000],
]

export type Fit = 'ideal' | 'ok' | 'low' | 'high'
export function fit(lux: number, p: [string, number, number, number]): Fit {
  if (lux < p[1]) return 'low'
  if (lux < p[2]) return 'ok'
  if (lux <= p[3]) return 'ideal'
  return 'high'
}
