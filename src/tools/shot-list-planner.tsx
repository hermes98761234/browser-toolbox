import { useState } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { download } from '../kitlib'
import { ANGLES, AUDIO, fmtDur, fmtMin, MOVES, move, renumber, sanitize, SIZES, summarize, wrap, type Shot } from './lib/shot-list-planner'

const mk = (p: Partial<Shot>): Shot => ({
  id: uid(), scene: '1', shot: '1', size: 'MS', angle: 'Eye level', move: 'Static', lens: 35, desc: '', audio: 'Sync',
  location: '', gear: [], setup: 10, dur: 8, takes: 3, status: 'planned', ...p,
})

const SAMPLE: Shot[] = [
  mk({ scene: '1', shot: '1', size: 'EWS', move: 'Drone', lens: 24, desc: 'Dawn over the harbour, fishing boats leaving', audio: 'MOS', location: 'Harbour', gear: ['Drone', 'ND filters'], setup: 20, dur: 12, takes: 2 }),
  mk({ scene: '1', shot: '2', size: 'WS', move: 'Dolly', lens: 28, desc: 'Mara walks along the pier towards camera carrying a toolbox', location: 'Harbour', gear: ['Dolly + track', 'Lav mic'], setup: 25, dur: 10, takes: 4 }),
  mk({ scene: '1', shot: '3', size: 'MCU', angle: 'Low', move: 'Handheld', lens: 50, desc: 'Mara stops, squints at the old lighthouse', location: 'Harbour', gear: ['Lav mic'], setup: 8, dur: 6, takes: 3, status: 'ready' }),
  mk({ scene: '1', shot: '4', size: 'Insert', lens: 85, desc: 'Rusty padlock on the lighthouse door', audio: 'MOS', location: 'Harbour', gear: ['Macro lens'], setup: 10, dur: 3, takes: 2 }),
  mk({ scene: '2', shot: '1', size: 'MS', move: 'Gimbal', lens: 35, desc: 'Mara climbs the spiral staircase, torch in hand', location: 'Lighthouse', gear: ['Gimbal', 'LED panel', 'Lav mic'], setup: 30, dur: 15, takes: 4 }),
  mk({ scene: '2', shot: '2', size: 'OTS', lens: 50, desc: 'Over Mara\'s shoulder: the lamp room, dust in the light', location: 'Lighthouse', gear: ['Haze machine', 'LED panel'], setup: 20, dur: 8, takes: 3 }),
  mk({ scene: '2', shot: '3', size: 'CU', lens: 85, desc: 'Mara\'s face lit by the lens as it turns', location: 'Lighthouse', gear: ['LED panel', 'Boom mic'], setup: 15, dur: 5, takes: 5, status: 'shot' }),
  mk({ scene: '3', shot: '1', size: 'Two-shot', angle: 'High', move: 'Crane', lens: 24, desc: 'Mara and Theo on the gallery, the town below', location: 'Lighthouse gallery', gear: ['Jib', 'Boom mic'], setup: 40, dur: 20, takes: 3 }),
]

const GEAR = ['Drone', 'Dolly + track', 'Gimbal', 'Jib', 'Tripod', 'LED panel', 'Haze machine', 'Boom mic', 'Lav mic', 'Macro lens', 'ND filters']
const DEF = { title: 'The Keeper — short film', director: 'A. Rivera', date: '2026-11-07', dayHours: 10, reset: 45, shots: SAMPLE, gear: GEAR }
const STATUS: Shot['status'][] = ['planned', 'ready', 'shot', 'cut']
const STATUS_COL: Record<Shot['status'], string> = { planned: 'var(--muted)', ready: 'var(--accent2)', shot: 'var(--ok)', cut: 'var(--err)' }

const inp: React.CSSProperties = { width: '100%', minWidth: 0, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', color: 'var(--fg)', font: 'inherit' }

export default function ShotListPlanner() {
  const [s, set, reset] = useToolState('shot-list-planner', DEF)
  const [filter, setFilter] = useState('all')
  const [drag, setDrag] = useState<number | null>(null)
  const [newGear, setNewGear] = useState('')
  const sum = summarize(s.shots, s.reset)
  const edit = (id: string, p: Partial<Shot>) => set({ shots: s.shots.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const scenes = [...new Set(s.shots.map((x) => x.scene))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const visible = s.shots.map((x, i) => ({ x, i })).filter(({ x }) => filter === 'all' || x.scene === filter || x.status === filter)
  const add = () => {
    const last = s.shots[s.shots.length - 1]
    const scene = filter !== 'all' && scenes.includes(filter) ? filter : last?.scene ?? '1'
    const n = s.shots.filter((x) => x.scene === scene).length + 1
    set({ shots: [...s.shots, mk({ scene, shot: String(n), location: last?.location ?? '' })] })
  }
  const days = sum.totalMin / 60 / Math.max(1, s.dayHours)

  const csv = () => [
    ['Scene', 'Shot', 'Size', 'Angle', 'Movement', 'Lens mm', 'Description', 'Audio', 'Location', 'Equipment', 'Setup min', 'Duration s', 'Takes', 'Status'],
    ...s.shots.map((x) => [x.scene, x.shot, x.size, x.angle, x.move, x.lens, x.desc, x.audio, x.location, x.gear.join('; '), x.setup, x.dur, x.takes, x.status]),
  ]

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const W = 842, H = 595, M = 32
    const cols: [string, number][] = [['Sc', 28], ['Shot', 32], ['Size', 46], ['Angle / move', 92], ['Lens', 34], ['Description', 250], ['Audio', 40], ['Location', 86], ['Equipment', 120], ['Time', 50]]
    let page = doc.addPage([W, H])
    let y = H - M
    const header = (first: boolean) => {
      if (first) {
        page.drawText(sanitize(s.title || 'Shot list'), { x: M, y: y - 14, size: 16, font: bold })
        page.drawText(sanitize(`Director: ${s.director}   Date: ${s.date}   Shots: ${sum.active}   Screen time: ${fmtDur(sum.screenSec)}   Est. on set: ${fmtMin(sum.totalMin)}`), { x: M, y: y - 30, size: 9, font, color: rgb(0.35, 0.35, 0.4) })
        y -= 46
      }
      page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: rgb(0.15, 0.18, 0.3) })
      let x = M + 4
      for (const [h, w] of cols) { page.drawText(h, { x, y: y - 11.5, size: 8, font: bold, color: rgb(1, 1, 1) }); x += w }
      y -= 18
    }
    header(true)
    let prevScene = ''
    s.shots.filter((x) => x.status !== 'cut').forEach((x, i) => {
      const cells = [x.scene, x.shot, x.size, `${x.angle}\n${x.move}`, `${x.lens}mm`, x.desc, x.audio, x.location, x.gear.join(', '), `${x.setup}m setup\n${x.dur}s x${x.takes}`]
      const lines = cells.map((c, k) => wrap(sanitize(c), cols[k][1] - 6, (t) => font.widthOfTextAtSize(t, 8)))
      const h = Math.max(...lines.map((l) => l.length)) * 10 + 6
      if (y - h < M) { page = doc.addPage([W, H]); y = H - M; header(false) }
      if (x.scene !== prevScene && prevScene) page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 1, color: rgb(0.3, 0.3, 0.5) })
      prevScene = x.scene
      if (i % 2) page.drawRectangle({ x: M, y: y - h + 2, width: W - 2 * M, height: h, color: rgb(0.95, 0.96, 0.98) })
      let cx = M + 4
      lines.forEach((l, k) => {
        l.forEach((t, j) => page.drawText(t, { x: cx, y: y - 9 - j * 10, size: 8, font: k === 1 ? bold : font }))
        cx += cols[k][1]
      })
      y -= h
    })
    if (sum.gear.length) {
      if (y < 120) { page = doc.addPage([W, H]); y = H - M }
      y -= 16
      page.drawText('Equipment checklist', { x: M, y, size: 11, font: bold })
      y -= 14
      sum.gear.forEach((g, i) => {
        const cx = M + (i % 4) * 190, cy = y - Math.floor(i / 4) * 13
        page.drawRectangle({ x: cx, y: cy - 2, width: 8, height: 8, borderWidth: 0.8, borderColor: rgb(0.2, 0.2, 0.2) })
        page.drawText(sanitize(`${g.name} (${g.shots} shot${g.shots > 1 ? 's' : ''})`), { x: cx + 13, y: cy - 1, size: 8.5, font })
      })
    }
    const bytes = await doc.save()
    download(`${(s.title || 'shot-list').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'application/pdf')
  }

  return (
    <>
      <Split wide="right">
        <div>
          <Panel title="Production">
            <Txt label="Project title" value={s.title} onChange={(title) => set({ title })} />
            <Row>
              <Txt label="Director" value={s.director} onChange={(director) => set({ director })} />
              <Txt label="Shoot date" type="date" value={s.date} onChange={(date) => set({ date })} />
            </Row>
            <Row>
              <Num label="Shooting day" value={s.dayHours} onChange={(dayHours) => set({ dayHours })} unit="h" min={1} max={16} />
              <Num label="Reset per take" value={s.reset} onChange={(r) => set({ reset: Math.max(0, r) })} unit="s" min={0} />
            </Row>
          </Panel>
          <Panel title="Schedule estimate">
            <Stats>
              <Stat label="Shots" value={sum.active} sub={`${sum.done} shot · ${s.shots.length - sum.active} cut`} />
              <Stat label="Screen time" value={fmtDur(sum.screenSec)} />
              <Stat label="On-set time" value={fmtMin(sum.totalMin)} sub={`${fmtMin(sum.setupMin)} setups`} tone="accent" />
              <Stat label="Shooting days" value={days.toFixed(1)} sub={`at ${s.dayHours} h/day`} tone={days > 1 ? 'bad' : 'good'} />
            </Stats>
            <p className="k-hint">Progress: {sum.active ? Math.round((sum.done / sum.active) * 100) : 0}% shot</p>
            <Bar value={sum.done} max={Math.max(1, sum.active)} color="var(--ok)" />
            <Table head={['Scene', 'Shots', 'Screen', 'On set']} rows={sum.scenes.map((x) => [x.scene, x.shots, fmtDur(x.screenSec), fmtMin(x.totalMin)])} />
          </Panel>
          <Panel title="Equipment">
            <Table head={['Item', 'Used in']} rows={sum.gear.map((g) => [g.name, `${g.shots} shot${g.shots > 1 ? 's' : ''}`])} />
            <Row>
              <Txt label="Add to kit list" value={newGear} onChange={setNewGear} placeholder="e.g. Slider" />
              <Btn onClick={() => { const g = newGear.trim(); if (g && !s.gear.includes(g)) set({ gear: [...s.gear, g] }); setNewGear('') }}>Add</Btn>
            </Row>
            <p className="k-hint">Kit: {s.gear.map((g) => (
              <button key={g} className="k-btn ghost" style={{ padding: '1px 6px', margin: 2, fontSize: 12 }} title="Remove from kit"
                onClick={() => set({ gear: s.gear.filter((x) => x !== g), shots: s.shots.map((x) => ({ ...x, gear: x.gear.filter((y) => y !== g) })) })}>{g} ✕</button>
            ))}</p>
          </Panel>
        </div>
        <Panel
          title={`Shot list · ${s.title}`}
          actions={<>
            <Btn kind="primary" onClick={pdf}>⬇ PDF</Btn>
            <CsvButton name="shot-list.csv" rows={csv} />
            <JsonButtons name="shot-list.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />
          </>}
        >
          <Row>
            <Select label="Show" value={filter} onChange={setFilter} options={[['all', 'All shots'], ...scenes.map((x) => [x, `Scene ${x}`] as [string, string]), ...STATUS.map((x) => [x, `Status: ${x}`] as [string, string])]} />
            <Btn onClick={add}>＋ Add shot</Btn>
            <Btn kind="ghost" onClick={() => set({ shots: renumber(s.shots) })} title="Renumber shots 1, 2, 3… within each scene">Renumber</Btn>
            <Btn kind="ghost" onClick={() => set({ shots: [...s.shots].sort((a, b) => a.scene.localeCompare(b.scene, undefined, { numeric: true })) })}>Sort by scene</Btn>
            <Btn kind="danger" onClick={reset}>Reset sample</Btn>
          </Row>
          {visible.length === 0 && <Note>No shots match this filter.</Note>}
          <div style={{ display: 'grid', gap: 8 }}>
            {visible.map(({ x, i }) => (
              <div
                key={x.id} draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null && drag !== i) set({ shots: move(s.shots, drag, i) }); setDrag(null) }}
                style={{
                  border: '1px solid var(--line)', borderLeft: `4px solid ${STATUS_COL[x.status]}`, borderRadius: 10, padding: 8,
                  background: drag === i ? 'var(--panel2)' : 'var(--panel)', opacity: x.status === 'cut' ? 0.55 : 1,
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 6, alignItems: 'end',
                }}
              >
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 18 }}>⠿</span>
                  <b style={{ whiteSpace: 'nowrap' }}>{x.scene}.{x.shot}</b>
                  <input style={inp} value={x.desc} placeholder="What happens in this shot" aria-label="Description" onChange={(e) => edit(x.id, { desc: e.target.value })} />
                  <Btn kind="ghost" title="Move up" disabled={i === 0} onClick={() => set({ shots: move(s.shots, i, i - 1) })}>↑</Btn>
                  <Btn kind="ghost" title="Move down" disabled={i === s.shots.length - 1} onClick={() => set({ shots: move(s.shots, i, i + 1) })}>↓</Btn>
                  <Btn kind="ghost" title="Duplicate" onClick={() => set({ shots: [...s.shots.slice(0, i + 1), { ...x, id: uid(), status: 'planned' }, ...s.shots.slice(i + 1)] })}>⧉</Btn>
                  <Btn kind="ghost" title="Delete" onClick={() => set({ shots: s.shots.filter((y) => y.id !== x.id) })}>✕</Btn>
                </div>
                <Mini label="Scene"><input style={inp} value={x.scene} onChange={(e) => edit(x.id, { scene: e.target.value })} /></Mini>
                <Mini label="Shot"><input style={inp} value={x.shot} onChange={(e) => edit(x.id, { shot: e.target.value })} /></Mini>
                <Mini label="Size"><Pick v={x.size} opts={SIZES} on={(size) => edit(x.id, { size })} /></Mini>
                <Mini label="Angle"><Pick v={x.angle} opts={ANGLES} on={(angle) => edit(x.id, { angle })} /></Mini>
                <Mini label="Movement"><Pick v={x.move} opts={MOVES} on={(m) => edit(x.id, { move: m })} /></Mini>
                <Mini label="Lens mm"><input style={inp} type="number" min={8} value={x.lens} onChange={(e) => edit(x.id, { lens: +e.target.value || 0 })} /></Mini>
                <Mini label="Audio"><Pick v={x.audio} opts={AUDIO} on={(audio) => edit(x.id, { audio })} /></Mini>
                <Mini label="Location"><input style={inp} value={x.location} onChange={(e) => edit(x.id, { location: e.target.value })} /></Mini>
                <Mini label="Setup min"><input style={inp} type="number" min={0} value={x.setup} onChange={(e) => edit(x.id, { setup: Math.max(0, +e.target.value || 0) })} /></Mini>
                <Mini label="Length s"><input style={inp} type="number" min={0} value={x.dur} onChange={(e) => edit(x.id, { dur: Math.max(0, +e.target.value || 0) })} /></Mini>
                <Mini label="Takes"><input style={inp} type="number" min={1} value={x.takes} onChange={(e) => edit(x.id, { takes: Math.max(1, +e.target.value || 1) })} /></Mini>
                <Mini label="Status"><Pick v={x.status} opts={STATUS} on={(status) => edit(x.id, { status: status as Shot['status'] })} /></Mini>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {s.gear.map((g) => {
                    const on = x.gear.includes(g)
                    return (
                      <button key={g} type="button" onClick={() => edit(x.id, { gear: on ? x.gear.filter((y) => y !== g) : [...x.gear, g] })}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent, #fff)' : 'var(--muted)' }}>
                        {g}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <Note>Drag cards by the ⠿ handle (or use ↑ ↓) to set the shooting order. Shots are usually grouped by location and setup, not script order, to save resets. Your list is saved in this browser; use Backup for a file copy.</Note>
        </Panel>
      </Split>
    </>
  )
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 2, fontSize: 11, color: 'var(--muted)', minWidth: 0 }}>
      {label}
      {children}
    </label>
  )
}
function Pick({ v, opts, on }: { v: string; opts: readonly string[]; on: (v: string) => void }) {
  return (
    <select style={inp} value={v} onChange={(e) => on(e.target.value)}>
      {(opts.includes(v) ? opts : [v, ...opts]).map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}
