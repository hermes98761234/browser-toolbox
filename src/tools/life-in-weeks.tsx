import { useEffect, useRef, useState } from 'react'
import { Btn, JsonButtons, Note, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { birthday, cellOf, cellRange, eraOf, ERAS, stats, validDate, type Cell, type Era } from './lib/life-in-weeks'

interface Milestone { id: string; date: string; label: string; icon: string }
interface State { name: string; birth: string; expectancy: number; eras: Era[]; milestones: Milestone[]; poster: 'light' | 'dark'; showEras: boolean; showLabels: boolean }

const DEF: State = {
  name: 'Alex',
  birth: '1990-06-15',
  expectancy: 82,
  eras: ERAS,
  milestones: [
    { id: 'm1', date: '1996-09-02', label: 'First day of school', icon: '🎒' },
    { id: 'm2', date: '2008-09-15', label: 'Moved to the city', icon: '🏙️' },
    { id: 'm3', date: '2012-07-01', label: 'Graduated', icon: '🎓' },
    { id: 'm4', date: '2015-03-20', label: 'Trip around Asia', icon: '✈️' },
    { id: 'm5', date: '2019-05-11', label: 'Got married', icon: '💍' },
    { id: 'm6', date: '2021-11-03', label: 'First child born', icon: '👶' },
    { id: 'm7', date: '2031-01-01', label: 'Goal: run a marathon', icon: '🏃' },
  ],
  poster: 'light',
  showEras: true,
  showLabels: true,
}

const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

interface Layout { L: number; T: number; cell: number; gap: number; rows: number; rowY: (r: number) => number }

function draw(ctx: CanvasRenderingContext2D, W: number, s: State, today: string, hover: Cell | null, title: boolean): Layout {
  const dark = s.poster === 'dark'
  const bg = dark ? '#0f172a' : '#ffffff', fg = dark ? '#e2e8f0' : '#0f172a', mute = dark ? '#64748b' : '#94a3b8', empty = dark ? '#1e293b' : '#eef2f7'
  const rows = Math.max(1, Math.ceil(s.expectancy))
  const T = title ? 90 : 26, L = 34
  const R = s.showLabels ? Math.min(240, W * 0.28) : 10
  const cell = Math.max(3, Math.floor(((W - L - R) / 52) * 10) / 10)
  const gap = cell > 7 ? 1.5 : 1
  const rowY = (r: number) => T + r * cell + Math.floor(r / 10) * cell * 0.6
  const H = rowY(rows) + 20
  ctx.canvas.height = Math.ceil(H * (ctx.canvas.width / W))
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.width / W, 0, 0)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  if (title) {
    ctx.fillStyle = fg; ctx.font = 'bold 28px system-ui, sans-serif'; ctx.fillText(`${s.name ? `${s.name}’s` : 'My'} life in weeks`, L, 42)
    ctx.fillStyle = mute; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(`Born ${s.birth} · each box is one week · each row is one year`, L, 66)
  }
  ctx.font = '10px system-ui, sans-serif'
  ctx.fillStyle = mute
  ctx.textAlign = 'center'
  for (const w of [1, 10, 20, 30, 40, 52]) ctx.fillText(String(w), L + (w - 0.5) * cell, T - 6)
  ctx.textAlign = 'right'
  const now = cellOf(s.birth, today)
  const ms = new Map<string, Milestone[]>()
  for (const m of s.milestones) if (validDate(m.date) && m.date >= s.birth) { const c = cellOf(s.birth, m.date); const k = `${c.row}:${c.col}`; ms.set(k, [...(ms.get(k) ?? []), m]) }
  for (let r = 0; r < rows; r++) {
    const y = rowY(r)
    if (r % 5 === 0) { ctx.fillStyle = mute; ctx.fillText(String(r), L - 6, y + cell * 0.8) }
    const era = s.showEras ? eraOf(s.eras, r) : undefined
    for (let c = 0; c < 52; c++) {
      const x = L + c * cell
      const lived = r < now.row || (r === now.row && c < now.col)
      const isNow = r === now.row && c === now.col
      ctx.fillStyle = lived ? (era?.color ?? (dark ? '#818cf8' : '#4f46e5')) : empty
      if (!lived && era) { ctx.globalAlpha = 0.28; ctx.fillStyle = era.color }
      ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap)
      ctx.globalAlpha = 1
      if (isNow) { ctx.fillStyle = '#ef4444'; ctx.fillRect(x, y, cell, cell) }
      if (ms.has(`${r}:${c}`)) {
        ctx.fillStyle = fg
        ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, Math.max(1.6, cell * 0.36), 0, 7); ctx.fill()
      }
      if (hover && hover.row === r && hover.col === c) { ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1) }
    }
    if (s.showLabels) {
      const here = s.milestones.filter((m) => validDate(m.date) && m.date >= s.birth && cellOf(s.birth, m.date).row === r)
      if (here.length) {
        ctx.textAlign = 'left'; ctx.fillStyle = fg; ctx.font = `${Math.max(9, Math.min(12, cell * 1.3))}px system-ui, sans-serif`
        ctx.fillText(here.map((m) => `${m.icon} ${m.label}`).join(' · '), L + 52 * cell + 8, y + cell * 0.85, R - 12)
        ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'
      }
    }
  }
  ctx.textAlign = 'left'
  return { L, T, cell, gap, rows, rowY }
}

export default function LifeInWeeks() {
  const [s, set, reset] = useToolState('life-in-weeks', DEF)
  const [today] = useState(todayLocal)
  const [hover, setHover] = useState<Cell | null>(null)
  const [width, setWidth] = useState(760)
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const lay = useRef<Layout | null>(null)
  const ok = validDate(s.birth) && s.birth <= today
  const st = ok ? stats(s.birth, today, s.expectancy) : null

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const c = cv.current
    if (!c || !ok) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = width * dpr
    lay.current = draw(c.getContext('2d')!, width, s, today, hover, false)
    c.style.width = `${width}px`
    c.style.height = `${c.height / dpr}px`
  }, [s, width, hover, today, ok])

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const l = lay.current
    if (!l) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    const col = Math.floor((x - l.L) / l.cell)
    let row = -1
    for (let i = 0; i < l.rows; i++) if (y >= l.rowY(i) && y < l.rowY(i) + l.cell) row = i
    const c = col >= 0 && col < 52 && row >= 0 ? { row, col } : null
    if (c?.row !== hover?.row || c?.col !== hover?.col) setHover(c)
  }
  const exportPng = () => {
    const c = document.createElement('canvas')
    c.width = 2400
    draw(c.getContext('2d')!, 1200, s, today, null, true)
    c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'life-in-weeks.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }, 'image/png')
  }
  const hoverInfo = hover && ok ? (() => {
    const [a, b] = cellRange(s.birth, hover)
    const era = eraOf(s.eras, hover.row)
    const m = s.milestones.filter((x) => validDate(x.date) && x.date >= a && x.date <= b)
    return `Age ${hover.row}, week ${hover.col + 1} · ${a} → ${b}${era ? ` · ${era.name}` : ''}${m.length ? ` · ${m.map((x) => `${x.icon} ${x.label}`).join(', ')}` : ''}`
  })() : 'Hover over a week to see its dates.'
  const editMs = (id: string, p: Partial<Milestone>) => set({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const editEra = (id: string, p: Partial<Era>) => set({ eras: s.eras.map((e) => (e.id === id ? { ...e, ...p } : e)) })

  return (
    <Split wide="right">
      <div>
        <Panel title="You">
          <Row>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Txt label="Birth date" type="date" value={s.birth} onChange={(birth) => set({ birth })} />
          </Row>
          {!ok && <Note tone="err">Enter a valid birth date in the past.</Note>}
          <Slider label="Life expectancy" value={s.expectancy} min={50} max={110} unit=" years" onChange={(expectancy) => set({ expectancy })} />
          <p className="muted" style={{ fontSize: 13 }}>Global average is about 73 years; many countries are in the high 70s to mid 80s. It is a statistic, not a forecast.</p>
          <Row>
            <Seg value={s.poster} onChange={(poster) => set({ poster })} options={[['light', 'Light poster'], ['dark', 'Dark poster']]} />
          </Row>
          <Row>
            <label className="k-check"><input type="checkbox" checked={s.showEras} onChange={(e) => set({ showEras: e.target.checked })} /> Colour life phases</label>
            <label className="k-check"><input type="checkbox" checked={s.showLabels} onChange={(e) => set({ showLabels: e.target.checked })} /> Milestone labels</label>
          </Row>
        </Panel>
        <Panel title="Milestones" actions={<Btn onClick={() => set({ milestones: [...s.milestones, { id: uid(), date: today, label: 'New milestone', icon: '⭐' }] })}>+ Add</Btn>}>
          {[...s.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '44px 140px 1fr 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input className="k-text" value={m.icon} onChange={(e) => editMs(m.id, { icon: e.target.value.slice(0, 4) })} aria-label="Icon" style={{ textAlign: 'center' }} />
              <input className="k-text" type="date" value={m.date} onChange={(e) => editMs(m.id, { date: e.target.value })} aria-label="Date" />
              <input className="k-text" value={m.label} onChange={(e) => editMs(m.id, { label: e.target.value })} aria-label="Label" />
              <Btn kind="ghost" title="Remove" onClick={() => set({ milestones: s.milestones.filter((x) => x.id !== m.id) })}>✕</Btn>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>Future dates work too: mark goals and plans.</p>
        </Panel>
        <Panel title="Life phases" actions={<Btn kind="ghost" onClick={() => set({ eras: ERAS })}>Defaults</Btn>}>
          {s.eras.map((e) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 64px 64px 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input type="color" value={e.color} onChange={(ev) => editEra(e.id, { color: ev.target.value })} aria-label="Colour" style={{ width: 34, height: 30, border: 0, background: 'none' }} />
              <input className="k-text" value={e.name} onChange={(ev) => editEra(e.id, { name: ev.target.value })} aria-label="Phase" />
              <input className="k-text" type="number" min={0} value={e.from} onChange={(ev) => editEra(e.id, { from: Math.max(0, Number(ev.target.value) || 0) })} aria-label="From age" />
              <input className="k-text" type="number" min={0} value={e.to} onChange={(ev) => editEra(e.id, { to: Math.max(0, Number(ev.target.value) || 0) })} aria-label="To age" />
              <Btn kind="ghost" title="Remove" onClick={() => set({ eras: s.eras.filter((x) => x.id !== e.id) })}>✕</Btn>
            </div>
          ))}
          <Btn onClick={() => set({ eras: [...s.eras, { id: uid(), name: 'New phase', from: 30, to: 40, color: '#f472b6' }] })}>+ Phase</Btn>
        </Panel>
      </div>
      <div>
        {st && (
          <Stats>
            <Stat label="Weeks lived" value={st.weeks.toLocaleString('en-US')} sub={`${pct(st.share, 1)} of ${st.totalWeeks.toLocaleString('en-US')}`} tone="accent" />
            <Stat label="Weeks ahead" value={st.weeksLeft.toLocaleString('en-US')} sub={`≈ ${st.summersLeft} more summers`} />
            <Stat label="Days lived" value={st.days.toLocaleString('en-US')} sub={`age ${st.years}`} />
            <Stat label="Next birthday" value={`${st.daysToBirthday} days`} sub={`turning ${st.years + 1} on ${birthday(s.birth, st.years + 1)}`} />
          </Stats>
        )}
        <Panel title={`${s.name ? `${s.name}’s` : 'Your'} life in weeks`} actions={<><Btn kind="primary" onClick={exportPng} disabled={!ok}>⬇ PNG poster</Btn><JsonButtons name="life-in-weeks.json" data={s} onLoad={(d) => d && typeof d.birth === 'string' && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <div className="muted" style={{ fontSize: 13, minHeight: 20, marginBottom: 6 }}>{hoverInfo}</div>
          <div ref={box} style={{ width: '100%' }}>
            {ok && <canvas ref={cv} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', borderRadius: 8 }} />}
          </div>
          <div className="k-legend" style={{ marginTop: 8 }}>
            {s.showEras && s.eras.map((e) => <span key={e.id}><i style={{ background: e.color }} />{e.name} ({e.from}–{e.to})</span>)}
            <span><i style={{ background: '#ef4444' }} />This week</span>
            <span><i style={{ background: 'var(--fg)', borderRadius: 99 }} />Milestone</span>
          </div>
        </Panel>
        {st && (
          <Panel title="Perspective">
            <ul style={{ lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
              <li>Your heart has beaten roughly <b>{num(st.heartbeats / 1e9, 2)} billion</b> times (at ~72 bpm).</li>
              <li>You have slept about <b>{num(st.sleepYears, 1)} years</b> of it.</li>
              <li>You have seen about <b>{num(st.days / 29.53, 0)}</b> full moons and <b>{st.years}</b> trips around the Sun ({num(st.years * 940, 0)} million km).</li>
              <li>Each row is a year; one row is just 52 boxes. What would you like to fill the next few with?</li>
            </ul>
          </Panel>
        )}
      </div>
    </Split>
  )
}
