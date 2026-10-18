import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, download, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { clock, duration, emphasis, parseScript, pxPerSec, totalWords } from './lib/teleprompter'

const SAMPLE = `# Welcome
Hi everyone, and thanks for joining this short product update. Today I want to cover *three things*: what we shipped this month, what we learned from your feedback, and what comes next.

(look at camera, smile)
[pause 2]

# What we shipped
First, the new dashboard is live for every account. It loads about twice as fast, and you can now pin the reports you open most often to the top of the page.

We also added offline mode to the mobile app. If your connection drops, your notes are saved on the device and sync automatically when you are back online.

[pause]

# What we learned
Many of you told us that exporting data took too many clicks. So we moved the export button to every table, and it remembers the format you used last time.

# What comes next
Next month we will focus on *shared workspaces*, so small teams can plan together in one place. If you would like early access, reply to the email that came with this video.

Thanks for watching, and see you next time!`

const THEMES = { dark: ['#0b0b0f', '#f5f5f5', '#ffd54a'], light: ['#ffffff', '#111111', '#c2185b'], green: ['#000000', '#7CFC9A', '#ffffff'], amber: ['#111111', '#ffb300', '#ffffff'] } as const
type Theme = keyof typeof THEMES

const DEF = { script: SAMPLE, wpm: 140, size: 48, lineHeight: 1.45, width: 80, mirrorX: false, mirrorY: false, theme: 'dark' as Theme, guide: 35, countdown: 3, showNotes: true, align: 'left' as 'left' | 'center' }

export default function Teleprompter() {
  const [s, set, reset] = useToolState('teleprompter', DEF)
  const segs = useMemo(() => parseScript(s.script), [s.script])
  const words = totalWords(segs)
  const [playing, setPlaying] = useState(false)
  const [count, setCount] = useState(0)
  const [pos, setPos] = useState(0)
  const [wait, setWait] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const posRef = useRef(0)
  const live = useRef({ wpm: s.wpm, guide: s.guide, words })
  useEffect(() => { live.current = { wpm: s.wpm, guide: s.guide, words } })
  const colors = THEMES[s.theme] ?? THEMES.dark
  const [stageH, setStageH] = useState(560)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setStageH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const maxPos = () => Math.max(0, (content.current?.scrollHeight ?? 0) - 40)
  const frac = () => (maxPos() ? posRef.current / maxPos() : 0)
  const apply = (p: number) => {
    posRef.current = Math.max(0, Math.min(maxPos(), p))
    if (content.current) content.current.style.transform = `translateY(${-posRef.current}px)`
  }
  const jump = useCallback((d: number) => { apply(posRef.current + d); setPos(frac()) }, [])

  // scrolling loop
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let paused = 0
    let lastUi = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (paused > now) return
      const c = content.current
      const st = stage.current
      if (!c || !st) return
      const textH = [...c.querySelectorAll<HTMLElement>('[data-words]')].reduce((a, el) => a + el.offsetHeight, 0)
      const v = pxPerSec(textH, live.current.words, live.current.wpm)
      const before = posRef.current
      apply(before + v * dt)
      // pause markers crossing the reading line
      const line = (st.clientHeight * live.current.guide) / 100
      for (const el of c.querySelectorAll<HTMLElement>('[data-pause]')) {
        const y = el.offsetTop - line
        if (before < y && posRef.current >= y) {
          apply(y + 1)
          const sec = Number(el.dataset.pause)
          if (sec > 0) { paused = now + sec * 1000; setWait(sec) }
          else { setPlaying(false); setPos(frac()); return }
        }
      }
      if (posRef.current >= maxPos()) { setPlaying(false); setPos(frac()); return }
      if (now - lastUi > 120) { lastUi = now; setPos(frac()); if (paused < now) setWait(0) }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // countdown
  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(() => { if (count === 1) setPlaying(true); setCount(count - 1) }, 1000)
    return () => clearTimeout(t)
  }, [count])

  const toggle = useCallback(() => {
    if (playing || count > 0) { setPlaying(false); setCount(0) }
    else if (s.countdown > 0 && posRef.current === 0) setCount(s.countdown)
    else setPlaying(true)
  }, [playing, count, s.countdown])
  const restart = () => { setPlaying(false); setCount(0); apply(0); setPos(0) }
  const full = () => {
    const el = stage.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  // keyboard shortcuts (ignored while typing in the editor)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('textarea, input, select')) return
      if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); set((x) => ({ ...x, wpm: Math.min(300, x.wpm + 10) })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); set((x) => ({ ...x, wpm: Math.max(40, x.wpm - 10) })) }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); jump(s.size * s.lineHeight * 3) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); jump(-s.size * s.lineHeight * 3) }
      else if (e.key === 'Home') restart()
      else if (e.key.toLowerCase() === 'm') set((x) => ({ ...x, mirrorX: !x.mirrorX }))
      else if (e.key.toLowerCase() === 'f') full()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const total = duration(segs, s.wpm)
  const progress = pos
  const transform = `scale(${s.mirrorX ? -1 : 1}, ${s.mirrorY ? -1 : 1})`

  return (
    <Split wide="right">
      <div>
        <Panel title="Script" actions={<><Btn kind="ghost" onClick={() => set({ script: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={() => download('script.txt', s.script)}>⬇ .txt</Btn></>}>
          <Area value={s.script} onChange={(script) => set({ script })} rows={14} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            <code># Heading</code> section titles · <code>[pause]</code> stops scrolling · <code>[pause 3]</code> waits 3 s · <code>(note)</code> stage cue · <code>*word*</code> emphasis.
          </p>
        </Panel>
        <Panel title="Speed & text">
          <Slider label="Speed" value={s.wpm} onChange={(wpm) => set({ wpm })} min={40} max={300} step={5} unit=" wpm" show={(v) => String(v)} />
          <Row>
            <Seg value={String(s.wpm)} onChange={(v) => set({ wpm: +v })} options={[['110', 'Slow'], ['140', 'Natural'], ['170', 'Brisk']]} />
          </Row>
          <Slider label="Font size" value={s.size} onChange={(size) => set({ size })} min={20} max={120} unit=" px" />
          <Slider label="Line spacing" value={s.lineHeight} onChange={(lineHeight) => set({ lineHeight })} min={1} max={2.2} step={0.05} />
          <Slider label="Text width" value={s.width} onChange={(width) => set({ width })} min={40} max={100} unit=" %" />
          <Slider label="Reading line" value={s.guide} onChange={(guide) => set({ guide })} min={10} max={70} unit=" % from top" />
          <Slider label="Countdown" value={s.countdown} onChange={(countdown) => set({ countdown })} min={0} max={10} unit=" s" />
        </Panel>
        <Panel title="Display">
          <Seg value={s.theme} onChange={(theme) => set({ theme })} options={[['dark', 'White on black'], ['light', 'Black on white'], ['green', 'Green'], ['amber', 'Amber']]} />
          <Row>
            <Seg value={s.align} onChange={(align) => set({ align })} options={[['left', 'Left'], ['center', 'Centre']]} />
          </Row>
          <Check label="Mirror horizontally (for beam-splitter glass)" value={s.mirrorX} onChange={(mirrorX) => set({ mirrorX })} />
          <Check label="Flip vertically" value={s.mirrorY} onChange={(mirrorY) => set({ mirrorY })} />
          <Check label="Show (stage notes)" value={s.showNotes} onChange={(showNotes) => set({ showNotes })} />
          <Btn kind="ghost" onClick={reset}>Reset all</Btn>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Words" value={words} />
          <Stat label="Run time" value={clock(total)} sub={`at ${s.wpm} wpm`} tone="accent" />
          <Stat label="Remaining" value={clock(total * (1 - progress))} sub={`${Math.round(progress * 100)} % read`} />
        </Stats>
        <Panel
          title="Prompter"
          actions={
            <>
              <Btn kind="primary" onClick={toggle}>{playing || count ? '⏸ Pause' : progress > 0 ? '▶ Resume' : '▶ Start'}</Btn>
              <Btn onClick={restart}>⏮ Restart</Btn>
              <Btn onClick={full}>⛶ Fullscreen</Btn>
            </>
          }
        >
          <div
            ref={stage}
            onWheel={(e) => { if (!playing) jump(e.deltaY) }}
            onDoubleClick={toggle}
            style={{ position: 'relative', height: 560, overflow: 'hidden', background: colors[0], color: colors[1], borderRadius: 10, cursor: 'pointer' }}
          >
            <div style={{ transform, height: '100%' }}>
              <div ref={content} style={{ position: 'relative', padding: `${(stageH * s.guide) / 100}px 0 ${stageH}px`, width: `${s.width}%`, margin: '0 auto', fontSize: s.size, lineHeight: s.lineHeight, textAlign: s.align, fontFamily: 'system-ui, sans-serif', fontWeight: 600, willChange: 'transform' }}>
                {segs.map((g, i) =>
                  g.kind === 'para' ? (
                    <p key={i} data-words={g.words} style={{ margin: `0 0 ${s.lineHeight * 0.6}em` }}>
                      {emphasis(g.text).map((r, j) => (r.em ? <span key={j} style={{ color: colors[2] }}>{r.t}</span> : <span key={j}>{r.t}</span>))}
                    </p>
                  ) : g.kind === 'head' ? (
                    <div key={i} style={{ fontSize: '0.55em', letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6, margin: '0.6em 0 0.4em' }}>{g.text}</div>
                  ) : g.kind === 'note' ? (
                    s.showNotes && <div key={i} style={{ fontSize: '0.5em', fontStyle: 'italic', opacity: 0.55, margin: '0 0 0.6em' }}>({g.text})</div>
                  ) : (
                    <div key={i} data-pause={g.sec} style={{ fontSize: '0.45em', color: colors[2], margin: '0 0 0.8em', opacity: 0.8 }}>{g.sec ? `◷ wait ${g.sec} s` : '■ pause — press space'}</div>
                  ),
                )}
                <div style={{ fontSize: '0.5em', opacity: 0.5, textAlign: 'center' }}>— end —</div>
              </div>
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${s.guide}%`, height: s.size * s.lineHeight, transform: 'translateY(-10%)', borderTop: `2px solid ${colors[2]}55`, borderBottom: `2px solid ${colors[2]}55`, background: `${colors[2]}12`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 6, top: `${s.guide}%`, color: colors[2], fontSize: 22, pointerEvents: 'none' }}>▶</div>
            {count > 0 && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 160, fontWeight: 800, background: '#0008', color: '#fff' }}>{count}</div>}
            {wait > 0 && playing && <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 14, color: colors[2] }}>waiting {wait} s…</div>}
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${progress * 100}%`, background: colors[2], opacity: 0.7 }} />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            Keys: <b>Space</b> start/pause · <b>↑/↓</b> speed ±10 wpm · <b>←/→</b> jump back/forward · <b>Home</b> restart · <b>M</b> mirror · <b>F</b> fullscreen. Scroll the
            mouse wheel while paused to position the text; double-click the prompter to start/pause.
          </p>
        </Panel>
        <Note>Speed is set in words per minute: the scroll rate is calculated from the rendered height of your text, so changing the font size keeps the same speaking pace. 130–160 wpm is a natural conversational rate.</Note>
      </div>
    </Split>
  )
}
