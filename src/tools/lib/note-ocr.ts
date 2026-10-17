// Image cleanup helpers for photos of notes / whiteboards, plus text tidy-up for pasted OCR output.

/** Otsu's threshold on 8-bit grayscale values: maximises between-class variance. */
export function otsu(gray: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, th = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > best) { best = v; th = t }
  }
  return th
}

/**
 * Estimates text-line tilt θ (radians, image coords with y down: lines follow y = x·tanθ + c)
 * by maximising the sharpness (sum of squares) of the projection profile of dark pixels.
 * Rotate the image by −θ to level it.
 */
export function deskewAngle(xs: ArrayLike<number>, ys: ArrayLike<number>, maxDeg = 15, stepDeg = 0.25): number {
  let best = -1, bestA = 0
  const n = xs.length
  if (n < 10) return 0
  const bins = new Map<number, number>()
  for (let d = -maxDeg; d <= maxDeg + 1e-9; d += stepDeg) {
    const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    bins.clear()
    for (let i = 0; i < n; i++) {
      const b = Math.round(ys[i] * c - xs[i] * s)
      bins.set(b, (bins.get(b) ?? 0) + 1)
    }
    let score = 0
    for (const v of bins.values()) score += v * v
    if (score > best) { best = score; bestA = a }
  }
  return bestA
}

/** Joins lines wrapped by OCR into paragraphs, re-joins hyphenated words, keeps bullets and blank lines. */
export function reflow(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  const out: string[] = []
  const bullet = /^\s*([-*•▪◦–]|\d+[.)]|[a-z][.)])\s+/i
  for (const l of lines) {
    const prev = out.length ? out[out.length - 1] : null
    if (l.trim() === '' || prev === null || prev.trim() === '' || bullet.test(l) || /[.:!?]$/.test(prev) || /^#/.test(l)) { out.push(l); continue }
    if (/[a-z]-$/i.test(prev) && /^[a-z]/.test(l.trim())) out[out.length - 1] = prev.slice(0, -1) + l.trim()
    else out[out.length - 1] = `${prev} ${l.trim()}`
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/** Common OCR fixes: curly quotes, ligatures, stray spaces before punctuation, normalised bullets. */
export function tidy(text: string): string {
  return text
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/^\s*[•▪◦·]\s*/gm, '- ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function counts(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return { words, chars: text.length, lines: text ? text.split('\n').length : 0 }
}
