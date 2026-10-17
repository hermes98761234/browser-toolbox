// Transcript model and subtitle/text exporters (SRT, WebVTT, TXT) plus an SRT/VTT parser.

export interface Seg {
  id: string
  start: number // seconds
  end: number // seconds
  text: string
  speaker?: string
}

/** 3725.5 → "01:02:05,500" (SRT) or "01:02:05.500" (VTT). */
export function stamp(sec: number, sep: ',' | '.' = ','): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms % 1000, 3)}`
}

/** Short clock "m:ss" or "h:mm:ss". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.floor(sec))
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

const line = (s: Seg) => (s.speaker ? `${s.speaker}: ` : '') + s.text.trim()
const ordered = (segs: Seg[]) => segs.filter((s) => s.text.trim()).sort((a, b) => a.start - b.start)

export function toSrt(segs: Seg[]): string {
  return ordered(segs)
    .map((s, i) => `${i + 1}\n${stamp(s.start)} --> ${stamp(Math.max(s.end, s.start + 0.5))}\n${line(s)}\n`)
    .join('\n')
}

export function toVtt(segs: Seg[]): string {
  return 'WEBVTT\n\n' + ordered(segs).map((s) => `${stamp(s.start, '.')} --> ${stamp(Math.max(s.end, s.start + 0.5), '.')}\n${line(s)}\n`).join('\n')
}

export function toTxt(segs: Seg[], times: boolean): string {
  return ordered(segs).map((s) => (times ? `[${clock(s.start)}] ` : '') + line(s)).join(times ? '\n' : '\n\n') + '\n'
}

const parseStamp = (t: string) => {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/.exec(t)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000 : NaN
}

/** Parses SRT or WebVTT cues. Lines like "Name: text" become the speaker. */
export function parseSubs(text: string): Omit<Seg, 'id'>[] {
  const out: Omit<Seg, 'id'>[] = []
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter(Boolean)
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti].split('-->')
    const start = parseStamp(a), end = parseStamp(b)
    if (!Number.isFinite(start)) continue
    let body = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    let speaker: string | undefined
    const sp = /^([A-Z][\w .'-]{0,24}):\s+(.*)$/.exec(body)
    if (sp) [, speaker, body] = sp
    out.push({ start, end: Number.isFinite(end) ? end : start + 2, text: body, ...(speaker ? { speaker } : {}) })
  }
  return out
}

export const wordCount = (segs: Seg[]) => segs.reduce((n, s) => n + (s.text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length, 0)

/** Words per minute over the spoken span. */
export function wpm(segs: Seg[]): number {
  const o = ordered(segs)
  if (!o.length) return 0
  const span = Math.max(...o.map((s) => s.end)) - o[0].start
  return span > 0 ? wordCount(o) / (span / 60) : 0
}
