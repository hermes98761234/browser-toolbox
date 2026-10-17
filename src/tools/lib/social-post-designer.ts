// Platform sizes and layout math for the social post designer.

export const PRESETS = [
  { id: 'ig-square', name: 'Instagram post', w: 1080, h: 1080 },
  { id: 'ig-portrait', name: 'Instagram portrait', w: 1080, h: 1350 },
  { id: 'story', name: 'Story / Reel / TikTok', w: 1080, h: 1920 },
  { id: 'fb', name: 'Facebook / link post', w: 1200, h: 630 },
  { id: 'x', name: 'X (Twitter) post', w: 1600, h: 900 },
  { id: 'li', name: 'LinkedIn post', w: 1200, h: 627 },
  { id: 'yt', name: 'YouTube thumbnail', w: 1280, h: 720 },
  { id: 'pin', name: 'Pinterest pin', w: 1000, h: 1500 },
] as const

export type PresetId = (typeof PRESETS)[number]['id']

/** Rectangle that covers W×H with an image of iw×ih (centre crop), like CSS object-fit: cover. */
export function coverRect(iw: number, ih: number, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const s = Math.max(W / iw, H / ih)
  const w = iw * s, h = ih * s
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

/** Word-wraps text (respecting manual line breaks) to maxW using a measure function. */
export function wrapLines(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && measure(next) > maxW) {
        out.push(line)
        line = w
      } else line = next
    }
    out.push(line)
  }
  return out
}

/** Font scale relative to a 1080 px reference so designs survive switching platform sizes. */
export const unit = (W: number, H: number) => Math.min(W, H) / 1080

/** Simplified aspect ratio label, e.g. 1080×1350 → "4:5". */
export function ratio(w: number, h: number): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a)
  const d = g(w, h)
  const [a, b] = [w / d, h / d]
  return a > 50 || b > 50 ? (w / h).toFixed(2) + ':1' : `${a}:${b}`
}
