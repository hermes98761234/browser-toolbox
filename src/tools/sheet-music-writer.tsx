import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn, download, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { midiFreq, noteShape, parseAbc, timeline, toMidi, type BarItem, type NoteItem, type Tune } from './lib/sheet-music-writer'

const PRESETS: [string, string][] = [
  ['Minuet in G', `X:1
T:Minuet in G
C:C. Petzold
M:3/4
L:1/8
Q:1/4=110
K:G
|: d2 GABc | d2 G2 G2 | e2 cdef | g2 G2 G2 |
c2 dcBA | B2 cBAG | F2 GABG | A6 :|`],
  ['Twinkle, Twinkle', `X:2
T:Twinkle, Twinkle, Little Star
C:Traditional
M:4/4
L:1/4
Q:1/4=100
K:C
"C"C C G G | "F"A A "C"G2 | "F"F F "C"E E | "G7"D D "C"C2 |
"C"G G "F"F F | "C"E E "G"D2 | "C"G G "F"F F | "C"E E "G"D2 |
"C"C C G G | "F"A A "C"G2 | "F"F F "C"E E | "G7"D D "C"C2 |]`],
  ['Ode to Joy', `X:3
T:Ode to Joy
C:L. van Beethoven
M:4/4
L:1/4
Q:1/4=120
K:D
"D"F F G A | "A"A G F E | "D"D D E F | "A"F>E E2 |
"D"F F G A | "A"A G F E | "D"D D E F | "A"E>D "D"D2 |]`],
  ['Amazing Grace', `X:4
T:Amazing Grace
C:Traditional
M:3/4
L:1/4
Q:1/4=80
K:G
D | "G"G2 B/G/ | B2 A | "C"G2 E | "G"D2 D | G2 B/G/ | B2 A/B/ | "D"d3- | d2 B |
"G"d2 B/G/ | B2 A | "C"G2 E | "G"D2 D | G2 B/G/ | "D"B2 A | "G"G3- | G2 |]`],
  ['Rhythm drill', `X:5
T:Rhythm drill
M:2/4
L:1/16
Q:1/4=88
K:Bb
B,2D2 F2B2 | A2G2 F4 | (3G2A2B2 c3d | B4 z4 |
F3G FEDC | _D2=D2 ^D2E2 | [B,DF]4 [B,DF]4 | [B,DF]8 |]`],
  ['Walking bass', `X:6
T:Walking Bass in F
M:4/4
L:1/4
Q:1/4=132
K:F clef=bass
"F"F, A, C D | "Bb"B,, D F =E | "F"F, A, C A, | "C7"C E G =B, | "F"F,2 z2 |]`],
]

const DEF = { abc: PRESETS[0][1], tempo: 0, sound: 'piano' as 'piano' | 'organ' | 'box', width: 760 }

// ---------- layout ----------
const LS = 10 // staff line spacing
const SYS_H = 112
const TOP = 38 // staff top inside a system
interface Placed { it: NoteItem; idx: number; x: number }
interface Measure { notes: { it: NoteItem; idx: number }[]; end: BarItem | null; startRepeat: boolean }
interface System { measures: { m: Measure; x0: number; x1: number; placed: Placed[] }[]; first: boolean }

const noteW = (it: NoteItem) => 12 + 30 * Math.sqrt(it.shown * 4) + (it.pitches.some((p) => p.acc !== null) ? 10 : 0) + noteShape(it.shown).dots * 6

function layout(t: Tune, W: number): System[] {
  const ms: Measure[] = []
  let cur: Measure = { notes: [], end: null, startRepeat: false }
  t.items.forEach((it, idx) => {
    if (it.kind === 'note') cur.notes.push({ it, idx })
    else {
      if (!cur.notes.length) {
        if (it.type.endsWith(':')) cur.startRepeat = true
        return
      }
      cur.end = it
      ms.push(cur)
      cur = { notes: [], end: null, startRepeat: it.type.endsWith(':') && it.type !== ':|' }
    }
  })
  if (cur.notes.length) ms.push(cur)
  const keyW = Math.abs(t.fifths) * 9
  const head = (first: boolean) => 42 + keyW + (first && t.meter ? 26 : 0) + 8
  const nat = (m: Measure) => m.notes.reduce((a, n) => a + noteW(n.it), 0) + 14 + (m.startRepeat ? 12 : 0)
  const lines: Measure[][] = []
  let line: Measure[] = []
  let used = 0
  for (const m of ms) {
    const avail = W - 10 - head(lines.length === 0)
    if (line.length && used + nat(m) > avail) {
      lines.push(line)
      line = []
      used = 0
    }
    line.push(m)
    used += nat(m)
  }
  if (line.length) lines.push(line)
  return lines.map((ln, li) => {
    const first = li === 0
    const x0 = head(first)
    const total = ln.reduce((a, m) => a + nat(m), 0)
    const avail = W - 10 - x0
    const k = li < lines.length - 1 || total > avail * 0.6 ? avail / total : 1
    let x = x0
    return {
      first,
      measures: ln.map((m) => {
        const start = x
        let nx = x + (m.startRepeat ? 12 : 0) + 8 * k
        const placed = m.notes.map((n) => {
          const p = { ...n, x: nx + (n.it.pitches.some((q) => q.acc !== null) ? 10 : 4) }
          nx += noteW(n.it) * k
          return p
        })
        x = start + nat(m) * k
        return { m, x0: start, x1: x, placed }
      }),
    }
  })
}

// ---------- drawing ----------
const TREBLE = 'M12 31C6 31 6 24 12 23C19 22 22 30 18 35C14 40 4 38 3 30C2 20 14 12 17 4C19-2 17-10 14-10C10-10 8-2 9 6L13 48C14 53 9 55 6 52'
const BASS = 'M5 11C5 4 17 2 19 11C21 21 11 30 2 36'
const SHARP_POS = [0, 3, -1, 2, 5, 1, 4] // steps below the top line (treble)
const FLAT_POS = [4, 1, 5, 2, 6, 3, 7]

function Score({ tune, systems, W, qpm, playing, onPick }: { tune: Tune; systems: System[]; W: number; qpm: number; playing: number; onPick: (pos: number) => void }) {
  const topStep = tune.clef === 'bass' ? 26 : 38
  const headH = 64
  const H = headH + systems.length * SYS_H + 10
  const out: ReactNode[] = []
  let key = 0
  const k = () => key++
  systems.forEach((sys, si) => {
    const y0 = headH + si * SYS_H + TOP
    const yOf = (step: number) => y0 + ((topStep - step) * LS) / 2
    const xEnd = sys.measures[sys.measures.length - 1]?.x1 ?? W - 8
    for (let l = 0; l < 5; l++) out.push(<line key={k()} x1={8} x2={xEnd} y1={y0 + l * LS} y2={y0 + l * LS} stroke="currentColor" strokeWidth={1} opacity={0.75} />)
    out.push(<line key={k()} x1={8} x2={8} y1={y0} y2={y0 + 40} stroke="currentColor" />)
    out.push(tune.clef === 'bass'
      ? <g key={k()} transform={`translate(14 ${y0})`}><path d={BASS} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /><circle cx={5} cy={11} r={3.5} fill="currentColor" /><circle cx={25} cy={6} r={2} fill="currentColor" /><circle cx={25} cy={15} r={2} fill="currentColor" /></g>
      : <path key={k()} d={TREBLE} transform={`translate(14 ${y0})`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />)
    for (let a = 0; a < Math.abs(tune.fifths); a++) {
      const pos = (tune.fifths > 0 ? SHARP_POS : FLAT_POS)[a] + (tune.clef === 'bass' ? 2 : 0)
      out.push(<text key={k()} x={44 + a * 9} y={y0 + (pos * LS) / 2 + (tune.fifths > 0 ? 5 : 3)} fontSize={18} textAnchor="middle" fill="currentColor">{tune.fifths > 0 ? '♯' : '♭'}</text>)
    }
    if (sys.first && tune.meter) {
      const tx = 50 + Math.abs(tune.fifths) * 9
      out.push(<text key={k()} x={tx} y={y0 + 18} fontSize={22} fontWeight={800} fontFamily="Georgia, serif" textAnchor="middle" fill="currentColor">{tune.meter[0]}</text>)
      out.push(<text key={k()} x={tx} y={y0 + 38} fontSize={22} fontWeight={800} fontFamily="Georgia, serif" textAnchor="middle" fill="currentColor">{tune.meter[1]}</text>)
    }
    const allPlaced = sys.measures.flatMap((m) => m.placed)
    for (const { m, x1, x0, placed } of sys.measures) {
      // bar lines
      const t = m.end?.type ?? '|'
      const thin = (x: number) => out.push(<line key={k()} x1={x} x2={x} y1={y0} y2={y0 + 40} stroke="currentColor" strokeWidth={1.2} />)
      const thick = (x: number) => out.push(<rect key={k()} x={x - 2} y={y0} width={4} height={40} fill="currentColor" />)
      const dots = (x: number) => { out.push(<circle key={k()} cx={x} cy={y0 + 15} r={2} fill="currentColor" />, <circle key={k()} cx={x} cy={y0 + 25} r={2} fill="currentColor" />) }
      if (m.startRepeat) { thick(x0 + 2); thin(x0 + 7); dots(x0 + 12) }
      if (t === '|]' || t === ':|]') { thin(x1 - 7); thick(x1 - 2) } else if (t === '||') { thin(x1 - 4); thin(x1) } else thin(x1)
      if (t.startsWith(':')) { thin(x1 - 7); thick(x1 - 2); dots(x1 - 12) }
      // beam groups
      const groups: Placed[][] = []
      for (const p of placed) {
        const sh = noteShape(p.it.shown).base
        const beamable = p.it.pitches.length > 0 && sh <= 1 / 8
        const g = groups[groups.length - 1]
        const prev = g?.[g.length - 1]
        if (beamable && prev && !p.it.beamBreak && noteShape(prev.it.shown).base <= 1 / 8 && prev.it.pitches.length) g.push(p)
        else groups.push([p])
      }
      for (const g of groups) {
        const steps = g.flatMap((p) => p.it.pitches.map((q) => q.step))
        const mid = topStep - 4
        const up = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length < mid : true
        const stemX = (p: Placed) => p.x + (up ? 5.6 : -5.6)
        const tip = (p: Placed) => (up ? yOf(Math.max(...p.it.pitches.map((q) => q.step))) - 34 : yOf(Math.min(...p.it.pitches.map((q) => q.step))) + 34)
        let beam: ((x: number) => number) | null = null
        if (g.length > 1) {
          const a = g[0], b = g[g.length - 1]
          const xa = stemX(a), xb = stemX(b)
          const slope = Math.max(-0.25, Math.min(0.25, (tip(b) - tip(a)) / (xb - xa || 1))) * 0.5
          let off = 0
          for (const p of g) {
            const need = tip(p) - (tip(a) + slope * (stemX(p) - xa))
            off = up ? Math.min(off, need) : Math.max(off, need)
          }
          beam = (x: number) => tip(a) + off + slope * (x - xa)
        }
        g.forEach((p, gi) => {
          const it = p.it
          const sh = noteShape(it.shown)
          const hl = p.idx === playing
          const ink = hl ? '#e11d48' : 'currentColor'
          const click = { onClick: () => onPick(it.pos), style: { cursor: 'pointer' } }
          if (!it.pitches.length) {
            const rx = p.x
            if (sh.base >= 1) out.push(<rect key={k()} {...click} x={rx - 6} y={y0 + 10} width={12} height={5} fill={ink} />)
            else if (sh.base >= 1 / 2) out.push(<rect key={k()} {...click} x={rx - 6} y={y0 + 15} width={12} height={5} fill={ink} />)
            else if (sh.base >= 1 / 4) out.push(<path key={k()} {...click} d={`M${rx - 3} ${y0 + 6}l6 8l-5 6l6 7c-6-2-8 1-4 6`} fill="none" stroke={ink} strokeWidth={2.4} strokeLinejoin="round" />)
            else {
              const n = Math.max(1, Math.round(Math.log2(1 / sh.base)) - 2)
              for (let f = 0; f < n; f++) {
                const yy = y0 + 14 + f * 8
                out.push(<circle key={k()} cx={rx - 3 - f * 2} cy={yy} r={2.6} fill={ink} />, <path key={k()} d={`M${rx - 3 - f * 2} ${yy + 2}q5 1 8-3`} fill="none" stroke={ink} strokeWidth={1.6} />)
              }
              out.push(<line key={k()} {...click} x1={rx + 5} y1={y0 + 11} x2={rx - 1 - n * 2} y2={y0 + 22 + n * 8} stroke={ink} strokeWidth={1.6} />)
            }
            if (sh.dots) out.push(<circle key={k()} cx={p.x + 10} cy={y0 + 15} r={1.8} fill={ink} />)
            return
          }
          for (const q of it.pitches) {
            const y = yOf(q.step)
            // ledger lines
            for (let s = topStep + 2; s <= q.step; s += 2) out.push(<line key={k()} x1={p.x - 9} x2={p.x + 9} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" />)
            for (let s = topStep - 10; s >= q.step; s -= 2) out.push(<line key={k()} x1={p.x - 9} x2={p.x + 9} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" />)
            const open = sh.base >= 1 / 2
            out.push(<ellipse key={k()} {...click} cx={p.x} cy={y} rx={sh.base >= 1 ? 7 : 6} ry={4.3} transform={`rotate(-20 ${p.x} ${y})`} fill={open ? 'none' : ink} stroke={ink} strokeWidth={open ? 1.8 : 1} />)
            if (q.acc !== null) out.push(<text key={k()} x={p.x - 13} y={y + (q.acc < 0 ? 4 : 5)} fontSize={16} textAnchor="middle" fill={ink}>{['𝄫', '♭', '♮', '♯', '𝄪'][q.acc + 2]}</text>)
            for (let d = 0; d < sh.dots; d++) out.push(<circle key={k()} cx={p.x + 11 + d * 5} cy={(topStep - q.step) % 2 === 0 ? y - 4 : y} r={1.8} fill={ink} />)
          }
          if (sh.base < 1) {
            const sx = stemX(p)
            const from = up ? yOf(Math.min(...it.pitches.map((q) => q.step))) : yOf(Math.max(...it.pitches.map((q) => q.step)))
            const to = beam ? beam(sx) : tip(p)
            out.push(<line key={k()} x1={sx} x2={sx} y1={from} y2={to} stroke={ink} strokeWidth={1.3} />)
            const flags = Math.max(0, Math.round(Math.log2(1 / sh.base)) - 2)
            if (!beam) {
              for (let f = 0; f < flags; f++) {
                const fy = to + (up ? f * 8 : -f * 8)
                out.push(<path key={k()} d={up ? `M${sx} ${fy}c1 7 11 9 8 21c1-8-4-11-8-13` : `M${sx} ${fy}c1-7 11-9 8-21c1 8-4 11-8 13`} fill={ink} stroke={ink} strokeWidth={0.8} />)
              }
            } else if (gi < g.length - 1 || flags > 1) {
              const nxt = g[gi + 1]
              if (nxt && gi < g.length - 1) out.push(<line key={k()} x1={sx} x2={stemX(nxt)} y1={beam(sx)} y2={beam(stemX(nxt))} stroke="currentColor" strokeWidth={4.5} />)
              const nflags = nxt ? Math.max(0, Math.round(Math.log2(1 / noteShape(nxt.it.shown).base)) - 2) : 0
              for (let f = 1; f < flags; f++) {
                const dy = up ? f * 7 : -f * 7
                if (nflags > f) out.push(<line key={k()} x1={sx} x2={stemX(nxt)} y1={beam(sx) + dy} y2={beam(stemX(nxt)) + dy} stroke="currentColor" strokeWidth={4.5} />)
                else {
                  const prevF = gi > 0 ? Math.max(0, Math.round(Math.log2(1 / noteShape(g[gi - 1].it.shown).base)) - 2) : 0
                  if (prevF <= f) {
                    const x2 = nxt ? sx + 9 : sx - 9
                    out.push(<line key={k()} x1={sx} x2={x2} y1={beam(sx) + dy} y2={beam(x2) + dy} stroke="currentColor" strokeWidth={4.5} />)
                  }
                }
              }
            }
          }
          // tie to the next note
          if (it.tie) {
            const ni = allPlaced.findIndex((q) => q.idx === p.idx)
            const nx = allPlaced[ni + 1]?.x ?? W - 12
            const y = yOf(it.pitches[0].step) + (up ? 8 : -8)
            out.push(<path key={k()} d={`M${p.x + 4} ${y}Q${(p.x + nx) / 2} ${y + (up ? 10 : -10)} ${nx - 4} ${y}`} fill="none" stroke="currentColor" strokeWidth={1.4} />)
          }
          if (it.tuplet && it.tuplet.i === Math.floor((it.tuplet.n - 1) / 2)) {
            const ty = up ? Math.min(y0 - 6, (beam ? beam(stemX(p)) : tip(p)) - 6) : Math.max(y0 + 54, (beam ? beam(stemX(p)) : tip(p)) + 14)
            out.push(<text key={k()} x={p.x + (up ? 5 : -5)} y={ty} fontSize={12} fontStyle="italic" fontWeight={700} textAnchor="middle" fill="currentColor">{it.tuplet.n}</text>)
          }
        })
      }
      for (const p of placed) if (p.it.chord) out.push(<text key={k()} x={p.x - 6} y={y0 - 20} fontSize={13} fontWeight={700} fontFamily="system-ui, sans-serif" fill="currentColor">{p.it.chord}</text>)
    }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ color: 'var(--fg)', display: 'block' }} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rendered score">
      <text x={W / 2} y={30} textAnchor="middle" fontSize={24} fontFamily="Georgia, serif" fontWeight={700} fill="currentColor">{tune.title || 'Untitled'}</text>
      {tune.composer && <text x={W - 10} y={52} textAnchor="end" fontSize={13} fontFamily="Georgia, serif" fontStyle="italic" fill="currentColor">{tune.composer}</text>}
      <ellipse cx={15} cy={50} rx={4.5} ry={3.2} transform="rotate(-20 15 50)" fill="currentColor" />
      <line x1={19} x2={19} y1={49} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <text x={26} y={53} fontSize={13} fontFamily="Georgia, serif" fill="currentColor">= {Math.round(qpm)}</text>
      {out}
    </svg>
  )
}

// ---------- audio ----------
function synth(ctx: AudioContext, dest: AudioNode, midi: number, t: number, d: number, sound: string) {
  const g = ctx.createGain()
  g.connect(dest)
  const f = midiFreq(midi)
  const parts: [OscillatorType, number, number][] = sound === 'organ' ? [['sine', 1, 0.5], ['sine', 2, 0.25], ['square', 1, 0.05]] : sound === 'box' ? [['sine', 2, 0.5], ['sine', 6, 0.08]] : [['triangle', 1, 0.6], ['sine', 2, 0.15]]
  for (const [type, mul, amp] of parts) {
    const o = ctx.createOscillator()
    const og = ctx.createGain()
    o.type = type
    o.frequency.value = f * mul
    og.gain.value = amp
    o.connect(og).connect(g)
    o.start(t)
    o.stop(t + d + 0.6)
  }
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.35, t + 0.01)
  if (sound === 'organ') g.gain.setValueAtTime(0.3, t + d - 0.02)
  else g.gain.exponentialRampToValueAtTime(sound === 'box' ? 0.02 : 0.08, t + Math.max(0.05, d))
  g.gain.linearRampToValueAtTime(0, t + d + (sound === 'organ' ? 0.05 : 0.4))
}

async function svgToPdf(svg: SVGSVGElement, title: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('style', 'color:#111')
  const [, , vw, vh] = (clone.getAttribute('viewBox') ?? '0 0 900 600').split(' ').map(Number)
  clone.setAttribute('width', String(vw * 2))
  clone.setAttribute('height', String(vh * 2))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  const img = new Image()
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url })
  URL.revokeObjectURL(url)
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const pw = 595, ph = 842, m = 36
  const scale = (pw - 2 * m) / vw
  const perPage = Math.floor((ph - 2 * m) / scale / SYS_H) * SYS_H
  for (let y = 0; y < vh; y += perPage) {
    const hh = Math.min(perPage + (y === 0 ? 64 : 0), vh - y)
    const c = document.createElement('canvas')
    c.width = vw * 2
    c.height = hh * 2
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, -y * 2, vw * 2, vh * 2)
    const png = await pdf.embedPng(c.toDataURL('image/png'))
    const page = pdf.addPage([pw, ph])
    page.drawImage(png, { x: m, y: ph - m - hh * scale, width: vw * scale, height: hh * scale })
    if (y === 0) y += 64
  }
  download(`${title || 'score'}.pdf`, new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }))
}

export default function SheetMusicWriter() {
  const [s, set, reset] = useToolState('sheet-music-writer', DEF)
  const tune = useMemo(() => parseAbc(s.abc), [s.abc])
  const W = s.width
  const systems = useMemo(() => layout(tune, W), [tune, W])
  const [playing, setPlaying] = useState(-1)
  const [on, setOn] = useState(false)
  const [unit, setUnit] = useState('1/4')
  const ctx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const svgBox = useRef<HTMLDivElement>(null)
  const qpm = s.tempo || tune.qpm
  const tl = useMemo(() => timeline(tune.items), [tune])
  const total = tl.length ? tl[tl.length - 1].t + tl[tl.length - 1].dur : 0
  const secs = (total * 4 * 60) / qpm
  const measures = tune.items.filter((i) => i.kind === 'bar').length

  const stop = () => {
    cancelAnimationFrame(raf.current)
    void ctx.current?.close()
    ctx.current = null
    setPlaying(-1)
    setOn(false)
  }
  useEffect(() => stop, [])
  const play = () => {
    stop()
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const c = new AC()
    ctx.current = c
    setOn(true)
    const master = c.createGain()
    master.gain.value = 0.5
    master.connect(c.destination)
    const t0 = c.currentTime + 0.1
    const spw = (4 * 60) / qpm // seconds per whole note
    for (const n of tl) for (const m of n.midi) synth(c, master, m, t0 + n.t * spw, n.dur * spw * 0.95, s.sound)
    const tick = () => {
      if (ctx.current !== c) return
      const now = (c.currentTime - t0) / spw
      if (now > total + 0.1) return stop()
      const hit = tl.find((n) => now >= n.t && now < n.t + n.dur)
      setPlaying(hit ? hit.idx : -1)
      raf.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const insert = (tok: string) => {
    const el = ta.current
    const a = el?.selectionStart ?? s.abc.length, b = el?.selectionEnd ?? s.abc.length
    const v = s.abc.slice(0, a) + tok + s.abc.slice(b)
    set({ abc: v })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tok.length, a + tok.length) })
  }
  const lenTok = () => {
    const [n, d] = unit.split('/').map(Number)
    const r = n / d / tune.unit
    if (Math.abs(r - 1) < 1e-9) return ''
    if (Number.isInteger(r)) return String(r)
    if (Number.isInteger(1 / r)) return `/${1 / r}`
    return `${r * 2}/2`
  }
  const pick = (pos: number) => {
    const el = ta.current
    if (!el) return
    el.focus()
    el.setSelectionRange(pos, pos + 1)
  }
  const svgEl = () => svgBox.current?.querySelector('svg') ?? null
  const fname = (tune.title || 'score').replace(/[^\w-]+/g, '-').toLowerCase()

  return (
    <Split wide="right">
      <div>
        <Panel title="ABC notation">
          <Select label="Example" value="" onChange={(v) => v && set({ abc: v, tempo: 0 })} options={[['', 'Load an example…'], ...PRESETS.map(([n, a]) => [a, n] as const)]} />
          <div className="k-label" style={{ margin: '8px 0 4px' }}>Insert at cursor</div>
          <Seg value={unit} onChange={setUnit} options={[['1/16', '𝅘𝅥𝅯 16th'], ['1/8', '♪ 8th'], ['1/4', '♩ ¼'], ['1/2', '𝅗𝅥 ½'], ['1/1', '𝅝 1']]} label="Note length" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
            {['C,', 'D,', 'E,', 'F,', 'G,', 'A,', 'B,', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'c', 'd', 'e', 'f', 'g', 'a', 'b', "c'"].map((n) => (
              <button key={n} type="button" className="k-btn" style={{ padding: '4px 7px', minWidth: 32 }} onClick={() => insert(n + lenTok())}>{n}</button>
            ))}
            {[['z', 'rest'], ['^', '♯'], ['_', '♭'], ['=', '♮'], [' | ', 'bar'], ['-', 'tie'], [' ', 'space']].map(([tok, l]) => (
              <button key={l} type="button" className="k-btn ghost" style={{ padding: '4px 8px' }} onClick={() => insert(tok === 'z' ? 'z' + lenTok() : tok)}>{l}</button>
            ))}
          </div>
          <textarea ref={ta} className="k-area mono" rows={14} value={s.abc} onChange={(e) => set({ abc: e.target.value })} spellCheck={false} aria-label="ABC notation" />
          {tune.errors.length > 0 && <Note tone="warn">{tune.errors.slice(0, 3).join(' · ')}{tune.errors.length > 3 ? ` (+${tune.errors.length - 3} more)` : ''}</Note>}
          <details style={{ fontSize: 13, marginTop: 8 }}>
            <summary>ABC cheat sheet</summary>
            <p><code>C D E F G A B</code> = octave from middle C, <code>c … b</code> one higher, <code>'</code> up / <code>,</code> down an octave. <code>^</code> sharp, <code>_</code> flat, <code>=</code> natural.</p>
            <p>Lengths multiply <code>L:</code>: <code>A2</code> double, <code>A/</code> half, <code>A3/2</code> dotted. <code>z</code> rest, <code>[CEG]</code> chord, <code>"Am"</code> chord symbol, <code>A&gt;B</code> dotted pair, <code>(3ABC</code> triplet, <code>-</code> tie.</p>
            <p>Notes written together are beamed; a space breaks the beam. Bars: <code>|</code> <code>||</code> <code>|]</code> <code>|:</code> <code>:|</code>. Header: <code>T:</code> title, <code>C:</code> composer, <code>M:</code> meter, <code>L:</code> unit, <code>Q:</code> tempo, <code>K:</code> key (e.g. <code>K:Dm</code>, <code>K:F clef=bass</code>).</p>
          </details>
        </Panel>
        <Panel title="Playback" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Btn kind="primary" onClick={on ? stop : play} disabled={!tl.length}>{on ? '■ Stop' : '▶ Play'}</Btn>
            <Seg value={s.sound} onChange={(sound) => set({ sound })} options={[['piano', 'Piano'], ['organ', 'Organ'], ['box', 'Music box']]} label="Sound" />
          </Row>
          <Slider label="Tempo" value={qpm} onChange={(tempo) => set({ tempo })} min={30} max={240} unit=" bpm" show={(v) => String(Math.round(v))} />
          {s.tempo > 0 && <Btn kind="ghost" onClick={() => set({ tempo: 0 })}>Use Q: tempo ({Math.round(tune.qpm)})</Btn>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Key" value={tune.key} sub={`${tune.clef} clef`} />
          <Stat label="Meter" value={tune.meter ? tune.meter.join('/') : 'free'} sub={`unit 1/${Math.round(1 / tune.unit)}`} />
          <Stat label="Notes" value={tl.length} sub={`${measures} bars`} />
          <Stat label="Duration" value={`${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`} sub={`at ${Math.round(qpm)} bpm, repeats played`} />
        </Stats>
        <Panel
          title="Score"
          actions={
            <>
              <Select label="" value={W} onChange={(width) => set({ width })} options={[[600, 'Large'], [760, 'Normal'], [1000, 'Compact']]} />
              <Btn onClick={() => { const e = svgEl(); if (e) void svgToPdf(e, tune.title) }}>⬇ PDF</Btn>
              <Btn onClick={() => download(`${fname}.mid`, new Blob([toMidi(tune, qpm) as BlobPart], { type: 'audio/midi' }))}>⬇ MIDI</Btn>
              <Btn onClick={() => { const e = svgEl(); if (e) download(`${fname}.svg`, new XMLSerializer().serializeToString(e).replace('color: var(--fg)', 'color: #111'), 'image/svg+xml') }}>⬇ SVG</Btn>
              <Btn onClick={() => download(`${fname}.abc`, s.abc)}>⬇ ABC</Btn>
            </>
          }
        >
          <div ref={svgBox} style={{ background: 'var(--panel)', borderRadius: 8 }}>
            <Score tune={tune} systems={systems} W={W} qpm={qpm} playing={playing} onPick={pick} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Tip: click a note to jump to it in the ABC text. PDF is A4, split between systems.</p>
        </Panel>
      </div>
    </Split>
  )
}
