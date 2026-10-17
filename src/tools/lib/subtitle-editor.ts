// SRT / WebVTT parsing, formatting and checks for the Subtitle Editor. Times are in seconds.

export interface Cue {
  id: string
  start: number
  end: number
  text: string
}

/** Parses "01:02:03,456", "02:03.456", "1:02:03.4" or plain seconds. Returns NaN when invalid. */
export function parseTime(s: string): number {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(s)
  if (!m) {
    const n = Number(s)
    return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : NaN
  }
  const [, h, mi, se, ms] = m
  if (+mi > 59 && h !== undefined) return NaN
  if (+se > 59) return NaN
  return (h ? +h * 3600 : 0) + +mi * 60 + +se + (ms ? +ms.padEnd(3, '0') / 1000 : 0)
}

/** Formats seconds as HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT). */
export function fmtTime(t: number, sep: ',' | '.' = ','): string {
  const ms = Math.max(0, Math.round(t * 1000))
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms % 1000, 3)}`
}

/** Short m:ss.s label for the UI. */
export function clock(t: number): string {
  const m = Math.floor(t / 60)
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`
}

let n = 0
const nid = () => `c${Date.now().toString(36)}${(n++).toString(36)}`

/** Parses SRT or WebVTT text (auto-detected by its timing lines). */
export function parseSubs(text: string): Cue[] {
  const blocks = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n{2,}/)
  const out: Cue[] = []
  for (const b of blocks) {
    const lines = b.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, rest] = lines[i].split('-->')
    const start = parseTime(a)
    const end = parseTime(rest.trim().split(/\s+/)[0])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    out.push({ id: nid(), start, end, text: lines.slice(i + 1).join('\n').trim() })
  }
  return out.sort((x, y) => x.start - y.start)
}

export function toSrt(cues: Cue[]): string {
  return sorted(cues).map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}`).join('\n\n') + '\n'
}

export function toVtt(cues: Cue[]): string {
  return 'WEBVTT\n\n' + sorted(cues).map((c, i) => `${i + 1}\n${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${c.text}`).join('\n\n') + '\n'
}

export const sorted = (cues: Cue[]) => [...cues].sort((a, b) => a.start - b.start || a.end - b.end)

/** Shifts every cue by `dt` seconds (clamped at 0) and optionally rescales around 0 (frame-rate fixes). */
export function retime(cues: Cue[], dt: number, factor = 1): Cue[] {
  return cues.map((c) => ({ ...c, start: Math.max(0, c.start * factor + dt), end: Math.max(0, c.end * factor + dt) }))
}

export interface Issue {
  id: string
  msg: string
}

/** Common subtitle QA rules: timing order, overlaps, too short/long, reading speed and line length. */
export function check(cues: Cue[], maxCps = 20, maxLine = 42): Issue[] {
  const out: Issue[] = []
  const s = sorted(cues)
  s.forEach((c, i) => {
    const d = c.end - c.start
    if (d <= 0) out.push({ id: c.id, msg: 'ends before it starts' })
    else {
      if (d < 0.7) out.push({ id: c.id, msg: `very short (${d.toFixed(2)} s)` })
      if (d > 7) out.push({ id: c.id, msg: `very long (${d.toFixed(1)} s)` })
      const cps = c.text.replace(/\s+/g, ' ').trim().length / d
      if (cps > maxCps) out.push({ id: c.id, msg: `reading speed ${cps.toFixed(0)} chars/s (> ${maxCps})` })
    }
    if (!c.text.trim()) out.push({ id: c.id, msg: 'empty text' })
    if (c.text.split('\n').some((l) => l.length > maxLine)) out.push({ id: c.id, msg: `line longer than ${maxLine} chars` })
    if (c.text.split('\n').length > 2) out.push({ id: c.id, msg: 'more than 2 lines' })
    const nx = s[i + 1]
    if (nx && nx.start < c.end) out.push({ id: c.id, msg: `overlaps the next cue by ${(c.end - nx.start).toFixed(2)} s` })
  })
  return out
}
