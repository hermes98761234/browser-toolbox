// Caption Burner logic: which cues are visible, line wrapping, and caption block placement inside
// the safe area. Drawing is done by the component; these helpers are pure for testing.
import type { Cue } from './subtitle-editor'

export type Pos = 'bottom' | 'middle' | 'top'

/** Cues visible at time t (seconds), with a global sync offset added to every cue. */
export function activeCues(cues: Cue[], t: number, offset = 0): Cue[] {
  return cues.filter((c) => t >= c.start + offset && t < c.end + offset)
}

/** Removes simple markup used in SRT/VTT (<i>, <b>, <c.x>, {\an8} tags) for drawing. */
export function plain(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** Greedy word wrap of each hard line to maxW using a width measure function. */
export function wrap(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const hard of plain(text).split('\n')) {
    const words = hard.trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue
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

/** Baseline-centre y of the first line for a block of n lines in a W×H frame. */
export function blockTop(n: number, lineH: number, H: number, pos: Pos, safe: number): number {
  const m = (safe / 100) * H
  const block = n * lineH
  if (pos === 'top') return m + lineH / 2
  if (pos === 'middle') return H / 2 - block / 2 + lineH / 2
  return H - m - block + lineH / 2
}

/** Short summary of a cue list for the UI. */
export function coverage(cues: Cue[], duration: number): { count: number; spoken: number; share: number } {
  const spoken = cues.reduce((a, c) => a + Math.max(0, Math.min(c.end, duration || Infinity) - c.start), 0)
  return { count: cues.length, spoken, share: duration > 0 ? Math.min(1, spoken / duration) : 0 }
}

/** Formats the container label for a MediaRecorder mime type. */
export function containerOf(mime: string): { ext: string; label: string } {
  if (mime.startsWith('video/mp4')) return { ext: 'mp4', label: mime.includes('avc1') ? 'MP4 · H.264' : 'MP4' }
  if (mime.includes('vp9')) return { ext: 'webm', label: 'WebM · VP9' }
  if (mime.includes('av01')) return { ext: 'webm', label: 'WebM · AV1' }
  if (mime.includes('vp8')) return { ext: 'webm', label: 'WebM · VP8' }
  return { ext: 'webm', label: 'WebM' }
}
