// Knitting/crochet gauge maths. Gauge = stitches (or rows) per swatch width.

/** Converts a pattern count to your gauge, optionally snapping to a stitch repeat (multiple of m plus r). */
export function convertCount(count: number, patternGauge: number, yourGauge: number, multiple = 1, plus = 0) {
  if (!(patternGauge > 0) || !(yourGauge > 0)) return { exact: NaN, rounded: NaN }
  const exact = (count * yourGauge) / patternGauge
  const m = Math.max(1, Math.round(multiple))
  const rounded = m > 1 ? Math.max(plus, Math.round((exact - plus) / m) * m + plus) : Math.round(exact)
  return { exact, rounded }
}

/** Width produced by `count` stitches at a gauge of `gauge` sts per `swatch` units. */
export const widthOf = (count: number, gauge: number, swatch: number) => (gauge > 0 ? (count / gauge) * swatch : NaN)

/** Finished measurement if you follow the pattern as written but knit at your own gauge. */
export const asWrittenSize = (patternSize: number, patternGauge: number, yourGauge: number) => (yourGauge > 0 ? (patternSize * patternGauge) / yourGauge : NaN)

/** Index of the pattern size that, knit at your gauge, lands closest to the wanted measurement. */
export function bestSize(sizes: number[], patternGauge: number, yourGauge: number, wanted: number) {
  let best = -1, err = Infinity
  sizes.forEach((sz, i) => {
    const e = Math.abs(asWrittenSize(sz, patternGauge, yourGauge) - wanted)
    if (e < err) { err = e; best = i }
  })
  return best
}

/** Percentage difference of your gauge vs the pattern (positive = you knit tighter, more sts per unit). */
export const gaugeDiff = (pattern: number, yours: number) => (pattern > 0 ? yours / pattern - 1 : NaN)
