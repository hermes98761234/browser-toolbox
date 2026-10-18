// Viewport presets and the small maths behind the responsive tester.

export interface Device { id: string; name: string; w: number; h: number; dpr: number; kind: 'phone' | 'tablet' | 'laptop' | 'desktop' | 'custom' }

export const DEVICES: Device[] = [
  { id: 'se', name: 'Small phone', w: 360, h: 640, dpr: 3, kind: 'phone' },
  { id: 'ip', name: 'iPhone 15 class', w: 393, h: 852, dpr: 3, kind: 'phone' },
  { id: 'px', name: 'Large Android', w: 412, h: 915, dpr: 2.6, kind: 'phone' },
  { id: 'ipm', name: 'Small tablet', w: 768, h: 1024, dpr: 2, kind: 'tablet' },
  { id: 'ipp', name: 'Large tablet', w: 1024, h: 1366, dpr: 2, kind: 'tablet' },
  { id: 'lap', name: 'Laptop', w: 1366, h: 768, dpr: 1, kind: 'laptop' },
  { id: 'mac', name: 'Laptop HiDPI', w: 1440, h: 900, dpr: 2, kind: 'laptop' },
  { id: 'fhd', name: 'Desktop Full HD', w: 1920, h: 1080, dpr: 1, kind: 'desktop' },
]

/** Common CSS framework breakpoints (min-width) to label each viewport. */
export const BREAKPOINTS: [string, number][] = [['xs', 0], ['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280], ['2xl', 1536]]
export const breakpoint = (w: number) => BREAKPOINTS.reduce((acc, [n, min]) => (w >= min ? n : acc), 'xs')

/** Adds https:// to bare hosts; keeps http(s), file and about: URLs; returns '' for unusable input. */
export function normalizeUrl(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (/^(https?:|file:|about:)/i.test(t)) return t
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(t)) return 'http://' + t
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return 'https://' + t
  return ''
}

/** Viewport size after the orientation toggle (phones/tablets only rotate). */
export const oriented = (d: Device, landscape: boolean): [number, number] => {
  const long = Math.max(d.w, d.h), short = Math.min(d.w, d.h)
  if (d.kind === 'laptop' || d.kind === 'desktop') return [d.w, d.h]
  return landscape ? [long, short] : [short, long]
}

/** Scale for a frame: fit the height budget, never upscale, then apply the zoom factor. */
export const frameScale = (h: number, maxH: number, zoom: number) => Math.min(1, maxH / h) * zoom

/** Maps a scroll position between documents of different heights by relative progress. */
export function mapScroll(y: number, fromMax: number, toMax: number): number {
  if (fromMax <= 0 || toMax <= 0) return 0
  return Math.round((Math.max(0, Math.min(fromMax, y)) / fromMax) * toMax)
}
