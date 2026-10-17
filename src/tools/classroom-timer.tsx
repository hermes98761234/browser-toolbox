import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Select, Split, Txt, useToolState } from '../kit'

const PRESETS: [string, number][] = [
  ['Quick write', 3 * 60], ['Think · pair · share', 5 * 60], ['Group work', 15 * 60], ['Silent reading', 20 * 60],
  ['Quiz', 10 * 60], ['Clean up', 2 * 60], ['Brain break', 90], ['Test', 45 * 60],
]
const STYLES = { ring: 'Ring', pie: 'Shrinking pie', bar: 'Progress bar' } as const
type Style = keyof typeof STYLES

const DEF = { title: 'Think · pair · share', total: 300, style: 'ring' as Style, warnAt: 60, chime: true, warnChime: true, keepAwake: true, showSecs: true }

let actx: AudioContext | null = null
function chime(kind: 'end' | 'warn') {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  actx ??= new AC()
  void actx.resume()
  const notes = kind === 'end' ? [784, 988, 1175, 1568] : [880]
  notes.forEach((f, i) => {
    const t = actx!.currentTime + i * 0.22
    for (const [mul, lvl] of [[1, 0.3], [2.76, 0.08], [5.4, 0.03]]) {
      const o = actx!.createOscillator(), g = actx!.createGain()
      o.frequency.value = f * mul
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
      o.connect(g).connect(actx!.destination)
      o.start(t)
      o.stop(t + 1.9)
    }
  })
}

const mmss = (sec: number, secs = true) => {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (!secs && s >= 60) return `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m} min`
  return `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m}:${String(r).padStart(2, '0')}`
}

export default function ClassroomTimer() {
  const [s, set, reset] = useToolState('classroom-timer', DEF)
  const [left, setLeft] = useState(s.total) // seconds remaining
  const [endAt, setEndAt] = useState<number | null>(null) // epoch ms while running
  const [full, setFull] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const warned = useRef(false)
  const lock = useRef<{ release: () => Promise<void> } | null>(null)
  const running = endAt !== null
  const done = left <= 0

  // Tick: derive remaining time from the end timestamp, so it stays exact in background tabs.
  useEffect(() => {
    if (endAt === null) return
    let raf = 0
    const tick = () => {
      const l = (endAt - Date.now()) / 1000
      if (l <= s.warnAt && !warned.current && s.warnAt > 0 && s.total > s.warnAt) {
        warned.current = true
        if (s.warnChime) chime('warn')
      }
      if (l <= 0) {
        setLeft(0)
        setEndAt(null)
        if (s.chime) chime('end')
        return
      }
      setLeft(l)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [endAt, s.warnAt, s.warnChime, s.chime, s.total])

  // Wake Lock while running.
  useEffect(() => {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    if (!running || !s.keepAwake || !wl) return
    let cancelled = false
    const get = () => wl.request('screen').then((l) => { if (cancelled) void l.release(); else lock.current = l }).catch(() => undefined)
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', vis)
      void lock.current?.release().catch(() => undefined)
      lock.current = null
    }
  }, [running, s.keepAwake])

  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const frac = s.total > 0 ? Math.max(0, Math.min(1, left / s.total)) : 0
  const col = done ? '#ef4444' : left <= s.warnAt ? '#f59e0b' : '#10b981'

  const draw = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const W = c.clientWidth, H = c.clientHeight
    const dpr = Math.min(2, devicePixelRatio || 1)
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const fg = getComputedStyle(c).color
    const cx = W / 2, cy = H / 2 + (s.style === 'bar' ? 0 : 0)
    const R = Math.min(W, H) * 0.42
    const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2
    if (s.style === 'ring') {
      g.lineWidth = R * 0.16
      g.strokeStyle = 'rgba(128,128,128,.18)'
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke()
      g.strokeStyle = col
      g.lineCap = 'round'
      if (frac > 0) { g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke() }
    } else if (s.style === 'pie') {
      g.fillStyle = 'rgba(128,128,128,.15)'
      g.beginPath(); g.arc(cx, cy, R * 1.05, 0, Math.PI * 2); g.fill()
      g.fillStyle = col
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 1.05, a0, a1); g.closePath(); g.fill()
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3
        g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); g.lineTo(cx + Math.cos(a) * R * 1.18, cy + Math.sin(a) * R * 1.18); g.stroke()
        g.globalAlpha = 1
      }
    } else {
      const bw = W * 0.86, bh = Math.min(70, H * 0.14), bx = (W - bw) / 2, by = H * 0.72
      g.fillStyle = 'rgba(128,128,128,.18)'; g.beginPath(); g.roundRect(bx, by, bw, bh, bh / 2); g.fill()
      if (frac > 0) { g.fillStyle = col; g.beginPath(); g.roundRect(bx, by, Math.max(bh, bw * frac), bh, bh / 2); g.fill() }
    }
    const big = s.style === 'bar' ? Math.min(W * 0.22, H * 0.4) : R * (left >= 3600 ? 0.42 : 0.55)
    const ty = s.style === 'bar' ? H * 0.42 : cy
    g.textAlign = 'center'; g.textBaseline = 'middle'
    if (s.style === 'pie') {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx, cy, big * 1.05, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'
    } else g.fillStyle = done ? '#ef4444' : fg
    g.font = `800 ${big}px system-ui, sans-serif`
    g.fillText(done ? "Time's up!" : mmss(left, s.showSecs), cx, ty, s.style === 'pie' ? big * 2 : W * 0.9)
    if (s.title) {
      g.fillStyle = fg; g.globalAlpha = 0.75
      g.font = `600 ${Math.max(14, big * 0.22)}px system-ui, sans-serif`
      g.fillText(s.title, cx, s.style === 'bar' ? H * 0.14 : cy + (s.style === 'pie' ? R * 1.0 : R * 0.42), W * 0.9)
      g.globalAlpha = 1
    }
  }, [frac, col, left, done, s.style, s.title, s.showSecs])

  useEffect(() => {
    draw()
    const c = canvas.current
    if (!c) return
    const ro = new ResizeObserver(draw)
    ro.observe(c)
    return () => ro.disconnect()
  }, [draw])

  const setTotal = (total: number, title?: string) => {
    const t = Math.max(1, Math.round(total))
    set(title !== undefined ? { total: t, title } : { total: t })
    setEndAt(null)
    setLeft(t)
    warned.current = false
  }
  const start = () => {
    void actx?.resume()
    const l = left <= 0 ? s.total : left
    if (left <= 0) warned.current = false
    setLeft(l)
    setEndAt(Date.now() + l * 1000)
  }
  const pause = () => { if (endAt) setLeft((endAt - Date.now()) / 1000); setEndAt(null) }
  const restart = () => { setEndAt(null); setLeft(s.total); warned.current = false }
  const add = (sec: number) => {
    if (endAt) setEndAt(endAt + sec * 1000)
    else setLeft((l) => Math.max(0, l + sec))
    if (left + sec > s.warnAt) warned.current = false
  }
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void box.current?.requestFullscreen?.().catch(() => undefined)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.code === 'Space') { e.preventDefault(); if (running) pause(); else start() }
      else if (e.key === 'r') restart()
      else if (e.key === 'f') toggleFull()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const mins = Math.floor(s.total / 60), secs = s.total % 60

  return (
    <Split wide="left">
      <div>
        <div ref={box} style={{ background: full ? '#0b1020' : 'var(--panel)', color: full ? '#f8fafc' : 'var(--fg)', borderRadius: full ? 0 : 'var(--radius)', border: full ? 'none' : '1px solid var(--line)', padding: 12, display: 'flex', flexDirection: 'column', height: full ? '100vh' : undefined }}>
          <canvas ref={canvas} style={{ width: '100%', height: full ? 'calc(100vh - 90px)' : 'min(62vh, 560px)', minHeight: 300, display: 'block', color: 'inherit' }} aria-label={`Timer: ${mmss(left)} left`} role="timer" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingTop: 8 }}>
            {running ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={start}>▶ {done ? 'Start again' : left < s.total ? 'Resume' : 'Start'}</Btn>}
            <Btn onClick={restart}>↺ Restart</Btn>
            <Btn onClick={() => add(60)}>+1 min</Btn>
            <Btn onClick={() => add(-60)} disabled={left < 60}>−1 min</Btn>
            <Btn onClick={toggleFull}>{full ? '🗗 Exit full screen' : '⛶ Full screen'}</Btn>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Keys: <b>Space</b> start/pause · <b>R</b> restart · <b>F</b> full screen. Colour turns amber in the warning window and red at zero.</p>
      </div>
      <div>
        <Panel title="Activity" actions={<Btn kind="ghost" onClick={() => { reset(); restart() }}>Reset</Btn>}>
          <Txt label="Title on screen" value={s.title} onChange={(title) => set({ title })} placeholder="e.g. Group work" />
          <Row>
            <Num label="Minutes" value={mins} min={0} max={600} step={1} onChange={(m) => setTotal(m * 60 + secs)} />
            <Num label="Seconds" value={secs} min={0} max={59} step={1} onChange={(x) => setTotal(mins * 60 + Math.min(59, x))} />
          </Row>
          <div className="k-field"><span className="k-label">Presets</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
            {PRESETS.map(([n, t]) => (
              <Btn key={n} kind={s.title === n && s.total === t ? 'primary' : 'normal'} onClick={() => setTotal(t, n)}><span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>{n}<small style={{ opacity: 0.75 }}>{mmss(t, t % 60 !== 0)}</small></span></Btn>
            ))}
          </div>
          <Row>
            {[1, 2, 5, 10, 15, 30].map((m) => <Btn key={m} kind="ghost" onClick={() => setTotal(m * 60)}>{m} min</Btn>)}
          </Row>
        </Panel>
        <Panel title="Display & sound">
          <Select label="Visual style" value={s.style} onChange={(style) => set({ style })} options={Object.entries(STYLES) as [Style, string][]} />
          <Num label="Warning colour + chime at" value={s.warnAt} unit="sec left" min={0} step={10} onChange={(warnAt) => set({ warnAt })} />
          <Check label="Chime when time is up" value={s.chime} onChange={(chime) => set({ chime })} />
          <Check label="Soft beep at the warning" value={s.warnChime} onChange={(warnChime) => set({ warnChime })} />
          <Check label="Show seconds" value={s.showSecs} onChange={(showSecs) => set({ showSecs })} />
          <Check label="Keep screen awake while running" value={s.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
          {!('wakeLock' in navigator) && s.keepAwake && <Note tone="warn">This browser has no Wake Lock API; set the screen timeout manually.</Note>}
          <Btn onClick={() => chime('end')}>🔔 Test chime</Btn>
        </Panel>
      </div>
    </Split>
  )
}
