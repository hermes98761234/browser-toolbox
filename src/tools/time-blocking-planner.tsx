import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, num, pct, uid, useToolState } from '../kit'
import { adherence, type Block, conflicts, hhmm, lanes, minutesByCat, parseHhmm, snap } from './lib/time-blocking-planner'

const CATS: [string, string][] = [['Deep work', '#6366f1'], ['Meetings', '#0ea5e9'], ['Admin', '#64748b'], ['Learning', '#a855f7'], ['Exercise', '#10b981'], ['Break', '#f59e0b'], ['Personal', '#ec4899']]
const catColor = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? '#64748b'
const PX = 52 // pixels per hour
const COLS = [['plan', 'Plan'], ['actual', 'Actual']] as const

const localDay = (off = 0, from?: string) => {
  const d = from ? new Date(from + 'T12:00') : new Date()
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const H = (h: number) => Math.round(h * 60)
function sampleDay(): Block[] {
  const p: [number, number, string, string][] = [[8, 8.5, 'Plan the day', 'Admin'], [8.5, 11, 'Write quarterly report', 'Deep work'], [11, 11.25, 'Walk & coffee', 'Break'], [11.25, 12.25, 'Team sync', 'Meetings'], [12.25, 13.25, 'Lunch', 'Break'], [13.25, 15.25, 'Code review', 'Deep work'], [15.25, 16.25, 'Email & invoices', 'Admin'], [16.25, 17, 'Course: SQL module 3', 'Learning'], [17.5, 18.5, 'Gym', 'Exercise']]
  const a: [number, number, string, string][] = [[8, 8.75, 'Plan + inbox', 'Admin'], [8.75, 10.5, 'Quarterly report', 'Deep work'], [10.5, 11, 'Unplanned call with client', 'Meetings'], [11, 11.5, 'Coffee', 'Break'], [11.5, 12.5, 'Team sync (ran long)', 'Meetings'], [12.5, 13.25, 'Lunch', 'Break'], [13.25, 14.75, 'Code review', 'Deep work']]
  return [...p.map(([s, e, t, c]) => ({ id: uid(), col: 'plan' as const, start: H(s), end: H(e), title: t, cat: c })), ...a.map(([s, e, t, c]) => ({ id: uid(), col: 'actual' as const, start: H(s), end: H(e), title: t, cat: c }))]
}
const DEF = { from: 7, to: 21, step: 15, days: { [localDay()]: sampleDay() } as Record<string, Block[]> }

interface Drag { mode: 'move' | 'top' | 'bottom'; id: string; y0: number; s0: number; e0: number }

export default function TimeBlockingPlanner() {
  const [s, set, reset] = useToolState('time-blocking-planner', DEF)
  const [date, setDate] = useState(localDay())
  const [sel, setSel] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const drag = useRef<Drag | null>(null)
  const colRef = useRef<Record<string, HTMLDivElement | null>>({})
  const blocks = s.days[date] ?? []
  const selB = blocks.find((b) => b.id === sel) ?? null
  const plan = blocks.filter((b) => b.col === 'plan'), actual = blocks.filter((b) => b.col === 'actual')
  const adh = adherence(plan, actual)
  const pm = minutesByCat(plan), am = minutesByCat(actual)
  const clash = conflicts(blocks)
  const ppm = PX / 60
  const top = s.from * 60

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const setBlocks = (fn: (b: Block[]) => Block[]) => set((st) => ({ ...st, days: { ...st.days, [date]: fn(st.days[date] ?? []) } }))
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)))

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    e.preventDefault()
    e.stopPropagation()
    drag.current = d
    setSel(d.id)
    const move = (ev: PointerEvent) => {
      const g = drag.current
      if (!g) return
      const dm = snap((ev.clientY - g.y0) / ppm, s.step)
      const lo = s.from * 60, hi = s.to * 60
      setBlocks((bs) => bs.map((b) => {
        if (b.id !== g.id) return b
        if (g.mode === 'move') {
          const len = g.e0 - g.s0
          const st = Math.min(hi - len, Math.max(lo, g.s0 + dm))
          return { ...b, start: st, end: st + len }
        }
        if (g.mode === 'top') return { ...b, start: Math.min(g.e0 - s.step, Math.max(lo, g.s0 + dm)) }
        return { ...b, end: Math.max(g.s0 + s.step, Math.min(hi, g.e0 + dm)) }
      }))
    }
    const up = () => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const create = (e: React.PointerEvent, col: Block['col']) => {
    if (e.target !== e.currentTarget) return
    const r = e.currentTarget.getBoundingClientRect()
    const st = Math.min(s.to * 60 - s.step * 2, Math.max(top, snap(top + (e.clientY - r.top) / ppm - 15, s.step)))
    const b: Block = { id: uid(), col, start: st, end: st + 60, title: col === 'plan' ? 'New block' : 'What I did', cat: 'Deep work' }
    setBlocks((bs) => [...bs, b])
    startDrag(e, { mode: 'bottom', id: b.id, y0: e.clientY, s0: b.start, e0: b.end })
  }

  const isToday = date === localDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cats = CATS.map((c) => c[0]).filter((c) => pm[c] || am[c])

  return (
    <Split wide="left">
      <div>
        <Panel
          className="tbp-print"
          title={new Date(date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          actions={
            <>
              <Btn onClick={() => setDate(localDay(-1, date))}>‹</Btn>
              <Btn kind={isToday ? 'primary' : 'normal'} onClick={() => setDate(localDay())}>Today</Btn>
              <Btn onClick={() => setDate(localDay(1, date))}>›</Btn>
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
            </>
          }
        >
          <style>{`@media print { body * { visibility: hidden } .tbp-print, .tbp-print * { visibility: visible } .tbp-print { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none } .tbp-print .k-actions, .tbp-noprint { display: none !important } }`}</style>
          <p className="muted tbp-noprint" style={{ marginTop: 0, fontSize: 13 }}>Drag on an empty column to add a block · drag a block to move · drag its top/bottom edge to resize · click to edit.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 1fr', gap: 8, userSelect: 'none' }}>
            <div />
            {COLS.map(([c, l]) => (
              <b key={c} style={{ textAlign: 'center' }}>{l} <span className="muted" style={{ fontWeight: 400 }}>· {num(blocks.filter((b) => b.col === c).reduce((a, b) => a + b.end - b.start, 0) / 60, 1)} h</span></b>
            ))}
            <div style={{ position: 'relative', height: (s.to - s.from) * PX }}>
              {Array.from({ length: s.to - s.from + 1 }, (_, i) => (
                <span key={i} className="muted" style={{ position: 'absolute', top: i * PX - 7, right: 4, fontSize: 11 }}>{hhmm((s.from + i) * 60)}</span>
              ))}
            </div>
            {COLS.map(([c]) => {
              const col = blocks.filter((b) => b.col === c)
              const ln = lanes(col)
              return (
                <div
                  key={c}
                  ref={(el) => {
                    colRef.current[c] = el
                  }}
                  onPointerDown={(e) => create(e, c)}
                  style={{ position: 'relative', height: (s.to - s.from) * PX, borderRadius: 8, border: '1px solid var(--line)', touchAction: 'none', cursor: 'copy', background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, var(--line) ${PX - 1}px, var(--line) ${PX}px)` }}
                >
                  {col.map((b) => {
                    const L = ln[b.id] ?? { lane: 0, of: 1 }
                    const h = (b.end - b.start) * ppm
                    return (
                      <div
                        key={b.id}
                        onPointerDown={(e) => startDrag(e, { mode: 'move', id: b.id, y0: e.clientY, s0: b.start, e0: b.end })}
                        style={{ position: 'absolute', top: (b.start - top) * ppm, height: h - 2, left: `calc(${(L.lane / L.of) * 100}% + 2px)`, width: `calc(${100 / L.of}% - 4px)`, background: catColor(b.cat), opacity: c === 'actual' ? 0.85 : 1, color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 12, lineHeight: 1.25, overflow: 'hidden', cursor: 'grab', boxShadow: sel === b.id ? '0 0 0 3px var(--fg)' : undefined }}
                      >
                        <div onPointerDown={(e) => startDrag(e, { mode: 'top', id: b.id, y0: e.clientY, s0: b.start, e0: b.end })} style={{ position: 'absolute', inset: '0 0 auto 0', height: 7, cursor: 'ns-resize' }} />
                        <b>{b.title}</b>
                        {h > 30 && <div style={{ opacity: 0.9 }}>{hhmm(b.start)}–{hhmm(b.end)}</div>}
                        <div onPointerDown={(e) => startDrag(e, { mode: 'bottom', id: b.id, y0: e.clientY, s0: b.start, e0: b.end })} style={{ position: 'absolute', inset: 'auto 0 0 0', height: 8, cursor: 'ns-resize' }} />
                      </div>
                    )
                  })}
                  {isToday && nowMin > top && nowMin < s.to * 60 && <div style={{ position: 'absolute', left: 0, right: 0, top: (nowMin - top) * ppm, borderTop: '2px solid var(--err)', pointerEvents: 'none' }} />}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Plan followed" value={pct(adh.score, 0)} sub={`${num(adh.matched / 60, 1)} of ${num(adh.planned / 60, 1)} h`} tone={adh.score >= 0.7 ? 'good' : 'accent'} />
          <Stat label="Unplanned" value={`${num(adh.unplanned / 60, 1)} h`} sub="actual time outside the plan" />
        </Stats>
        {selB ? (
          <Panel title="Edit block" actions={<Btn kind="ghost" onClick={() => setSel(null)}>✕</Btn>}>
            <Txt label="Title" value={selB.title} onChange={(title) => patch(selB.id, { title })} />
            <Select label="Category" value={selB.cat} onChange={(cat) => patch(selB.id, { cat })} options={CATS.map((c) => c[0])} />
            <Row>
              <Txt label="Start" type="time" value={hhmm(selB.start)} onChange={(v) => { const m = parseHhmm(v); if (m < selB.end) patch(selB.id, { start: m }) }} />
              <Txt label="End" type="time" value={hhmm(selB.end)} onChange={(v) => { const m = parseHhmm(v); if (m > selB.start) patch(selB.id, { end: m }) }} />
            </Row>
            <Row>
              {selB.col === 'plan' && <Btn onClick={() => setBlocks((bs) => [...bs, { ...selB, id: uid(), col: 'actual' }])}>✓ Done as planned</Btn>}
              <Btn onClick={() => setBlocks((bs) => [...bs, { ...selB, id: uid(), start: selB.end, end: Math.min(s.to * 60, selB.end + (selB.end - selB.start)) }])}>Duplicate after</Btn>
              <Btn kind="danger" onClick={() => { setBlocks((bs) => bs.filter((b) => b.id !== selB.id)); setSel(null) }}>Delete</Btn>
            </Row>
          </Panel>
        ) : (
          <Note>Select a block to edit its title, category and times. “Done as planned” copies a planned block into the Actual column.</Note>
        )}
        {clash.length > 0 && <Note tone="warn">{clash.length} overlap{clash.length > 1 ? 's' : ''}: {clash.slice(0, 3).map(([a, b]) => `“${a.title}” & “${b.title}”`).join(', ')}.</Note>}
        <Panel title="Planned vs actual by category">
          {cats.length === 0 && <p className="muted">No blocks yet.</p>}
          {cats.length > 0 && (
            <Table
              head={['Category', 'Plan', 'Actual', 'Δ']}
              rows={cats.map((c) => {
                const p = pm[c] ?? 0, a = am[c] ?? 0
                const max = Math.max(...cats.map((x) => Math.max(pm[x] ?? 0, am[x] ?? 0)))
                return [
                  <span key="c"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: catColor(c), marginRight: 6 }} />{c}</span>,
                  <div key="p" style={{ minWidth: 80 }}><div>{num(p / 60, 2)} h</div><Bar value={p} max={max} color={catColor(c)} /></div>,
                  <div key="a" style={{ minWidth: 80 }}><div>{num(a / 60, 2)} h</div><Bar value={a} max={max} color={catColor(c)} /></div>,
                  <b key="d" style={{ color: a - p < 0 ? 'var(--err)' : a - p > 0 ? 'var(--ok)' : undefined }}>{a - p > 0 ? '+' : ''}{num((a - p) / 60, 2)}</b>,
                ]
              })}
            />
          )}
        </Panel>
        <Panel title="Day tools">
          <Row>
            <Btn onClick={() => setBlocks((bs) => [...bs.filter((b) => b.col === 'actual'), ...(s.days[localDay(-1, date)] ?? []).filter((b) => b.col === 'plan').map((b) => ({ ...b, id: uid() }))])}>Copy yesterday's plan</Btn>
            <Btn onClick={() => setBlocks(() => sampleDay())}>Sample day</Btn>
            <Btn kind="danger" onClick={() => setBlocks(() => [])}>Clear day</Btn>
          </Row>
          <Row>
            <Select label="Day starts" value={s.from} onChange={(from) => set({ from })} options={Array.from({ length: 12 }, (_, i) => [i, hhmm(i * 60)] as const).filter(([h]) => h < s.to - 2)} />
            <Select label="Day ends" value={s.to} onChange={(to) => set({ to })} options={Array.from({ length: 13 }, (_, i) => [i + 12, hhmm((i + 12) * 60)] as const).filter(([h]) => h > s.from + 2)} />
            <Select label="Snap" value={s.step} onChange={(step) => set({ step })} options={[[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']] as const} />
          </Row>
          <Row>
            <CsvButton name="time-blocks.csv" rows={() => [['Date', 'Column', 'Start', 'End', 'Minutes', 'Title', 'Category'], ...Object.entries(s.days).flatMap(([d, bs]) => [...bs].sort((a, b) => a.start - b.start).map((b) => [d, b.col, hhmm(b.start), hhmm(b.end), b.end - b.start, b.title, b.cat]))]} />
            <JsonButtons name="time-blocks.json" data={s} onLoad={(d) => d && typeof d.days === 'object' && set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
