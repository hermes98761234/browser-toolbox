import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, uid, download, FileDrop, Note, Num, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { check, clock, fmtTime, parseSubs, parseTime, retime, sorted, toSrt, toVtt, type Cue } from './lib/subtitle-editor'

const SAMPLE = `1
00:00:01,000 --> 00:00:03,600
Welcome back to the workshop.

2
00:00:04,000 --> 00:00:07,200
Today we're syncing subtitles
right in the browser.

3
00:00:07,600 --> 00:00:10,800
Press Space to play, [ to mark a start
and ] to mark an end.

4
00:00:11,200 --> 00:00:14,000
N adds a new cue at the playhead.

5
00:00:14,400 --> 00:00:15,000
This one is far too fast to read comfortably.

6
00:00:16,000 --> 00:00:19,500
When you're done, export SRT or WebVTT.
`

const DEF = { cues: parseSubs(SAMPLE), name: 'subtitles', shift: 0.5 }

function TimeInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState<string | null>(null)
  const bad = text !== null && !Number.isFinite(parseTime(text))
  return (
    <input
      aria-label={label}
      className="mono"
      value={text ?? fmtTime(value, '.')}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && Number.isFinite(parseTime(text))) onChange(parseTime(text))
        setText(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      style={{
        width: 112,
        fontFamily: 'var(--mono)',
        fontSize: 13,
        borderColor: bad ? 'var(--err)' : undefined,
      }}
    />
  )
}

export default function SubtitleEditor() {
  const [s, set, reset] = useToolState('subtitle-editor', DEF)
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null)
  const [t, setT] = useState(8)
  const [playing, setPlaying] = useState(false)
  const [vidDur, setVidDur] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState<'1' | '2' | '4'>('1')
  const vref = useRef<HTMLVideoElement>(null)
  const tRef = useRef(0)
  useEffect(() => {
    tRef.current = t
  })

  const cues = sorted(s.cues)
  const lastEnd = cues.reduce((a, c) => Math.max(a, c.end), 0)
  const dur = video ? vidDur || lastEnd + 3 : Math.max(30, Math.ceil(lastEnd + 3))
  const active = cues.filter((c) => t >= c.start && t < c.end)
  const issues = check(s.cues)
  const setCues = (f: (c: Cue[]) => Cue[]) => set((st) => ({ ...st, cues: f(st.cues) }))
  const edit = (id: string, p: Partial<Cue>) => setCues((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const seek = (x: number) => {
    const v = Math.min(Math.max(0, x), dur)
    setT(v)
    if (vref.current) vref.current.currentTime = v
  }
  const toggle = () => {
    const v = vref.current
    if (v) {
      if (v.paused) void v.play()
      else v.pause()
    } else setPlaying((p) => !p)
  }

  // Clock: follows the <video>, or a virtual timeline in demo mode.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const v = vref.current
      if (v) setT(v.currentTime)
      else {
        const nt = tRef.current + (now - last) / 1000
        if (nt >= dur) {
          setT(dur)
          setPlaying(false)
          return
        }
        setT(nt)
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, dur])

  const newCue = (at: number) => {
    const c: Cue = {
      id: uid(),
      start: +at.toFixed(3),
      end: +(at + 2).toFixed(3),
      text: 'New subtitle',
    }
    setCues((cs) => [...cs, c])
    setSel(c.id)
  }

  // Keyboard timestamping.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const now = +tRef.current.toFixed(3)
      if (e.key === ' ') toggle()
      else if (e.key === '[') {
        if (sel) edit(sel, { start: now })
        else newCue(now)
      } else if (e.key === ']') {
        if (!sel) return
        edit(sel, { end: now })
        const i = cues.findIndex((c) => c.id === sel)
        setSel(cues[i + 1]?.id ?? null)
      } else if (e.key === 'n' || e.key === 'N') newCue(now)
      else if (e.key === 'ArrowLeft') seek(now - (e.shiftKey ? 5 : 1))
      else if (e.key === 'ArrowRight') seek(now + (e.shiftKey ? 5 : 1))
      else return
      e.preventDefault()
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const onFiles = async (files: File[]) => {
    for (const f of files) {
      if (f.type.startsWith('video/') || f.type.startsWith('audio/')) {
        if (video) URL.revokeObjectURL(video.url)
        setVideo({ url: URL.createObjectURL(f), name: f.name })
        setT(0)
        setPlaying(false)
      } else {
        const parsed = parseSubs(await f.text())
        if (parsed.length) set({ cues: parsed, name: f.name.replace(/\.(srt|vtt|txt)$/i, '') })
      }
    }
  }

  const words = cues.reduce((a, c) => a + (c.text.trim() ? c.text.trim().split(/\s+/).length : 0), 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Files">
          <FileDrop multiple accept="video/*,audio/*,.srt,.vtt,.txt" label="Drop a video and/or .srt / .vtt file" onFiles={(f) => void onFiles(f)} />
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {video ? `🎬 ${video.name}` : '🎞 Demo mode: no video loaded, a virtual timeline plays instead.'}
          </p>
          <Row>
            {video && (
              <Btn
                kind="ghost"
                onClick={() => {
                  URL.revokeObjectURL(video.url)
                  setVideo(null)
                  setPlaying(false)
                }}
              >
                Close video
              </Btn>
            )}
            <Btn
              kind="ghost"
              onClick={() => {
                reset()
                setSel(null)
              }}
            >
              Load sample cues
            </Btn>
            <Btn
              kind="ghost"
              onClick={() => {
                set({ cues: [] })
                setSel(null)
              }}
            >
              Clear all
            </Btn>
          </Row>
        </Panel>
        <Panel title="Export">
          <Row>
            <Btn kind="primary" onClick={() => download(`${s.name}.srt`, toSrt(s.cues), 'application/x-subrip')}>
              ⬇ SRT
            </Btn>
            <Btn kind="primary" onClick={() => download(`${s.name}.vtt`, toVtt(s.cues), 'text/vtt')}>
              ⬇ WebVTT
            </Btn>
            <CopyButton text={() => toSrt(s.cues)} label="Copy SRT" />
          </Row>
        </Panel>
        <Panel title="Retime all cues">
          <Num label="Shift by" value={s.shift} onChange={(shift) => set({ shift })} unit="s" step={0.1} />
          <Row>
            <Btn onClick={() => setCues((cs) => retime(cs, -s.shift))}>⏪ Earlier</Btn>
            <Btn onClick={() => setCues((cs) => retime(cs, s.shift))}>Later ⏩</Btn>
            <Btn kind="ghost" title="Convert timings made for 25 fps to 23.976 fps" onClick={() => setCues((cs) => retime(cs, 0, 25 / 23.976))}>
              25→23.976 fps
            </Btn>
          </Row>
        </Panel>
        <Panel title={`Quality check (${issues.length})`}>
          {issues.length === 0 ? (
            <Note tone="ok">No timing or reading-speed problems found. ✓</Note>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {issues.map((i, k) => {
                const n = cues.findIndex((c) => c.id === i.id) + 1
                return (
                  <li key={k}>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setSel(i.id)
                        seek(cues[n - 1]?.start ?? 0)
                      }}
                    >
                      Cue {n}
                    </a>
                    : {i.msg}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
        <Note>
          <b>Keys</b> (outside text fields): <kbd>Space</kbd> play/pause · <kbd>[</kbd> set start of selected cue · <kbd>]</kbd> set end and select next · <kbd>N</kbd> new cue ·{' '}
          <kbd>←</kbd>/<kbd>→</kbd> seek 1 s (Shift: 5 s)
        </Note>
      </div>
      <div>
        <Panel>
          <div
            style={{
              position: 'relative',
              background: '#000',
              borderRadius: 10,
              overflow: 'hidden',
              aspectRatio: '16 / 9',
            }}
          >
            {video ? (
              <video
                ref={vref}
                src={video.url}
                style={{ width: '100%', height: '100%', display: 'block' }}
                onLoadedMetadata={(e) => setVidDur(e.currentTarget.duration)}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  setPlaying(false)
                  setT(vref.current?.currentTime ?? 0)
                }}
                onSeeked={(e) => setT(e.currentTarget.currentTime)}
                onClick={toggle}
              />
            ) : (
              <div
                onClick={toggle}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg,#1e1b4b,#0c4a6e)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#c7d2fe',
                  cursor: 'pointer',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 44, fontFamily: 'var(--mono)' }}>{clock(t)}</div>
                  <div style={{ opacity: 0.7 }}>{playing ? 'Playing virtual timeline' : 'Click or press Space to play'}</div>
                </div>
              </div>
            )}
            {active.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '7%',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                {active.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'inline-block',
                      background: 'rgba(0,0,0,.72)',
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 'clamp(14px, 2.4vw, 22px)',
                      whiteSpace: 'pre-line',
                      margin: 2,
                    }}
                  >
                    {c.text}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Row wrap={false}>
            <Btn kind="primary" onClick={toggle}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </Btn>
            <span className="mono" style={{ minWidth: 120 }}>
              {fmtTime(t, '.')}
            </span>
            <span style={{ flex: 1 }} />
            <Btn onClick={() => newCue(t)}>+ Cue at playhead</Btn>
            <Seg
              value={zoom}
              onChange={setZoom}
              options={[
                ['1', '1×'],
                ['2', '2×'],
                ['4', '4×'],
              ]}
              label="Zoom"
            />
          </Row>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div
              style={{
                position: 'relative',
                height: 64,
                width: `${Number(zoom) * 100}%`,
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                seek(((e.clientX - r.left) / r.width) * dur)
              }}
            >
              {Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${((i * 5) / dur) * 100}%`,
                    top: 0,
                    bottom: 0,
                    borderLeft: '1px solid var(--line)',
                    fontSize: 10,
                    color: 'var(--muted)',
                    paddingLeft: 2,
                  }}
                >
                  {i * 5}s
                </span>
              ))}
              {cues.map((c, i) => (
                <div
                  key={c.id}
                  title={c.text}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSel(c.id)
                    seek(c.start)
                  }}
                  style={{
                    position: 'absolute',
                    top: 18 + (i % 2) * 20,
                    height: 18,
                    left: `${(c.start / dur) * 100}%`,
                    width: `${Math.max(0.3, ((c.end - c.start) / dur) * 100)}%`,
                    background: issues.some((x) => x.id === c.id) ? 'var(--warn)' : 'var(--accent)',
                    opacity: sel === c.id ? 1 : 0.7,
                    outline: sel === c.id ? '2px solid var(--fg)' : undefined,
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 10,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    padding: '2px 4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {i + 1}
                </div>
              ))}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${(t / dur) * 100}%`,
                  width: 2,
                  background: 'var(--err)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </Panel>
        <Stats>
          <Stat label="Cues" value={cues.length} />
          <Stat label="Last cue ends" value={clock(lastEnd)} />
          <Stat label="Words" value={words} />
          <Stat label="Issues" value={issues.length} tone={issues.length ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Cues" actions={<Btn onClick={() => newCue(lastEnd + 0.4)}>+ Append cue</Btn>}>
          {cues.length === 0 && (
            <p className="muted">
              No cues yet. Play and press <kbd>N</kbd> or <kbd>[</kbd>, or drop an .srt file.
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {cues.map((c, i) => {
              const on = t >= c.start && t < c.end
              return (
                <div
                  key={c.id}
                  onClick={() => setSel(c.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto auto 1fr auto',
                    gap: 8,
                    alignItems: 'start',
                    padding: 8,
                    borderRadius: 8,
                    border: `1px solid ${sel === c.id ? 'var(--accent)' : 'var(--line)'}`,
                    background: on ? 'var(--panel2)' : undefined,
                  }}
                >
                  <b
                    style={{
                      width: 22,
                      color: on ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {i + 1}
                  </b>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <TimeInput label="Start" value={c.start} onChange={(start) => edit(c.id, { start })} />
                    <TimeInput label="End" value={c.end} onChange={(end) => edit(c.id, { end })} />
                  </div>
                  <textarea
                    className="k-area"
                    rows={2}
                    value={c.text}
                    onChange={(e) => edit(c.id, { text: e.target.value })}
                    aria-label={`Cue ${i + 1} text`}
                    style={{ minWidth: 0 }}
                  />
                  <div style={{ display: 'grid', gap: 4 }}>
                    <Btn
                      kind="ghost"
                      title="Play from here"
                      onClick={() => {
                        seek(c.start)
                        setSel(c.id)
                      }}
                    >
                      ▶
                    </Btn>
                    <Btn kind="ghost" title="Delete" onClick={() => setCues((cs) => cs.filter((x) => x.id !== c.id))}>
                      ✕
                    </Btn>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
