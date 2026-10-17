// Modular type scale: static and fluid (clamp) sizes, naming and CSS/Tailwind/SCSS export.

export const RATIOS: [number, string][] = [
  [1.067, 'Minor second'], [1.125, 'Major second'], [1.2, 'Minor third'], [1.25, 'Major third'], [1.333, 'Perfect fourth'],
  [1.414, 'Augmented fourth'], [1.5, 'Perfect fifth'], [1.6, 'Minor sixth'], [1.618, 'Golden ratio'], [1.667, 'Major sixth'], [1.778, 'Minor seventh'], [1.875, 'Major seventh'], [2, 'Octave'],
]

export interface Step { step: number; name: string; min: number; max: number }

const UP = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']
const DOWN = ['sm', 'xs', '2xs', '3xs', '4xs']

export function stepName(i: number): string {
  if (i === 0) return 'base'
  return i > 0 ? (UP[i - 1] ?? `${i - 8}xl+`) : (DOWN[-i - 1] ?? `${-i}xs`)
}

/** Sizes in px from `down` steps below the base to `up` steps above. min/max are equal for a static scale. */
export function scale(base: number, ratio: number, up: number, down: number, maxBase = base, maxRatio = ratio): Step[] {
  const out: Step[] = []
  for (let i = up; i >= -down; i--) out.push({ step: i, name: stepName(i), min: base * ratio ** i, max: maxBase * maxRatio ** i })
  return out
}

const r4 = (v: number) => Number(v.toFixed(4))

/** CSS clamp() interpolating linearly from minVw to maxVw (px), expressed in rem + vw. */
export function clampCss(minPx: number, maxPx: number, minVw: number, maxVw: number, root = 16): string {
  if (Math.abs(maxPx - minPx) < 1e-9) return `${r4(minPx / root)}rem`
  const slope = (maxPx - minPx) / (maxVw - minVw)
  const intercept = minPx - slope * minVw
  const lo = Math.min(minPx, maxPx), hi = Math.max(minPx, maxPx)
  return `clamp(${r4(lo / root)}rem, ${r4(intercept / root)}rem ${slope < 0 ? '-' : '+'} ${r4(Math.abs(slope) * 100)}vw, ${r4(hi / root)}rem)`
}

/** Size produced by the fluid rule at a given viewport width. */
export function fluidAt(minPx: number, maxPx: number, minVw: number, maxVw: number, vw: number): number {
  const t = Math.max(0, Math.min(1, (vw - minVw) / (maxVw - minVw)))
  return minPx + (maxPx - minPx) * t
}

/** Suggested unitless line-height: tighter for large text, looser for body copy. Snapped to a 4px grid when asked. */
export function lineHeight(px: number, grid = 0): number {
  const lh = px <= 16 ? 1.6 : px >= 64 ? 1.1 : 1.6 - ((px - 16) / 48) * 0.5
  if (!grid) return Number(lh.toFixed(3))
  return Number((Math.ceil((px * lh) / grid) * grid / px).toFixed(3))
}
