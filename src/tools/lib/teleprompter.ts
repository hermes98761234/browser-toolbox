// Script parsing and timing for the teleprompter.

export type Seg = { kind: 'para'; text: string; words: number } | { kind: 'head'; text: string } | { kind: 'pause'; sec: number } | { kind: 'note'; text: string }

export const countWords = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length

/**
 * Script syntax: blank lines separate paragraphs; "# Title" lines are section headings;
 * "[pause]" or "[pause 3]" on its own line stops (or waits N seconds); "(note)" lines are cues shown dimmed.
 */
export function parseScript(src: string): Seg[] {
  const out: Seg[] = []
  for (const block of src.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    let para: string[] = []
    const flush = () => {
      const text = para.join(' ').replace(/\s+/g, ' ').trim()
      if (text) out.push({ kind: 'para', text, words: countWords(text) })
      para = []
    }
    for (const raw of block.split('\n')) {
      const line = raw.trim()
      const pm = /^\[pause(?:\s+(\d+(?:\.\d+)?)\s*s?)?\]$/i.exec(line)
      if (pm) { flush(); out.push({ kind: 'pause', sec: pm[1] ? +pm[1] : 0 }); continue }
      if (/^#{1,3}\s+/.test(line)) { flush(); out.push({ kind: 'head', text: line.replace(/^#+\s+/, '') }); continue }
      if (/^\(.*\)$/.test(line)) { flush(); out.push({ kind: 'note', text: line.slice(1, -1) }); continue }
      if (line) para.push(line)
    }
    flush()
  }
  return out
}

export const totalWords = (segs: Seg[]) => segs.reduce((a, s) => a + (s.kind === 'para' ? s.words : 0), 0)
export const timedPauses = (segs: Seg[]) => segs.reduce((a, s) => a + (s.kind === 'pause' ? s.sec : 0), 0)

/** Reading time in seconds at `wpm` words per minute, including timed pauses. */
export const duration = (segs: Seg[], wpm: number) => (totalWords(segs) / Math.max(1, wpm)) * 60 + timedPauses(segs)

/** Scroll speed (px/s) that moves `height` px of text containing `words` words at `wpm`. */
export const pxPerSec = (height: number, words: number, wpm: number) => (words > 0 ? (height / words) * (wpm / 60) : 0)

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** Splits text into plain and *emphasised* runs. */
export function emphasis(text: string): { t: string; em: boolean }[] {
  const out: { t: string; em: boolean }[] = []
  const re = /\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), em: false })
    out.push({ t: m[1], em: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), em: false })
  return out
}
