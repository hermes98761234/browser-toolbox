import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, CsvButton, download, JsonButtons, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { bounds, conflicts, makeSeats, shuffleSeating, type Layout } from './lib/seating-chart-builder'

interface Student { id: string; name: string }
interface State {
  title: string
  layout: Layout
  cols: number
  rows: number
  students: Student[]
  assign: (string | null)[]
  apart: [string, string][]
  front: string[]
  seed: number
}

const NAMES = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mateo', 'Isla', 'Leo', 'Amelia', 'Ethan', 'Zoe', 'Arjun', 'Chloe', 'Kai', 'Nora', 'Omar', 'Lily', 'Hugo', 'Maya', 'Felix']
const SAMPLE: Student[] = NAMES.map((name, i) => ({ id: 's' + i, name }))
const DEF: State = {
  title: 'Period 2 · Science',
  layout: 'pairs',
  cols: 6,
  rows: 4,
  students: SAMPLE,
  assign: SAMPLE.map((s) => s.id),
  apart: [['s1', 's3'], ['s7', 's13']],
  front: ['s15'],
  seed: 1,
}
const LAYOUTS: [Layout, string, number, number][] = [
  ['rows', 'Traditional rows', 6, 4],
  ['pairs', 'Paired desks', 6, 4],
  ['groups', 'Groups of four', 3, 2],
  ['ushape', 'U-shape / horseshoe', 6, 6],
]

type Drag = { id: string; from: number; x: number; y: number; sx: number; sy: number }

export default function SeatingChartBuilder() {
  const [s, set, reset] = useToolState<State>('seating-chart-builder', DEF)
  const [bulk, setBulk] = useState('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [apartA, setApartA] = useState('')
  const [apartB, setApartB] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const seats = useMemo(() => makeSeats(s.layout, s.cols, s.rows), [s.layout, s.cols, s.rows])
  const { w, h } = bounds(seats)
  const byId = useMemo(() => new Map(s.students.map((x) => [x.id, x])), [s.students])
  const assign = seats.map((_, i) => {
    const id = s.assign[i] ?? null
    return id && byId.has(id) ? id : null
  })
  const seated = new Set(assign.filter(Boolean) as string[])
  const unseated = s.students.filter((x) => !seated.has(x.id))
  const bad = conflicts(assign, seats, s.apart)
  const name = (id: string) => byId.get(id)?.name ?? '?'

  const place = (id: string, seat: number) => {
    const next = [...assign]
    const from = next.indexOf(id)
    const prev = next[seat]
    next[seat] = id
    if (from >= 0 && from !== seat) next[from] = prev
    set({ assign: next })
  }
  const unseat = (id: string) => set({ assign: assign.map((x) => (x === id ? null : x)) })

  const dragRef = useRef(drag)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])
  const active = drag !== null
  useEffect(() => {
    if (!active) return
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d))
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const seatEl = el?.closest('[data-seat]')
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6
      if (!moved) {
        setSelected((sel) => (sel === d.id ? null : d.id))
        return
      }
      if (seatEl) place(d.id, Number(seatEl.getAttribute('data-seat')))
      else if (el?.closest('[data-roster]')) unseat(d.id)
      setSelected(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })

  const start = (id: string, from: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    setDrag({ id, from, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })
  }
  const clickSeat = (i: number) => {
    if (selected) {
      place(selected, i)
      setSelected(null)
    }
  }

  const setLayout = (layout: Layout) => {
    const l = LAYOUTS.find((x) => x[0] === layout)!
    set({ layout, cols: l[2], rows: l[3] })
  }
  const shuffle = () => {
    const seed = Math.floor(Math.random() * 1e9)
    const ids = [...s.students.map((x) => x.id)]
    const r = shuffleSeating(ids, seats, s.apart, s.front, seed)
    set({ assign: r.assign, seed })
  }
  const alpha = () => {
    const order = seats.map((_, i) => i).sort((a, b) => seats[a].y - seats[b].y || seats[a].x - seats[b].x)
    const sorted = [...s.students].sort((a, b) => a.name.localeCompare(b.name))
    const next: (string | null)[] = seats.map(() => null)
    sorted.slice(0, seats.length).forEach((st, k) => (next[order[k]] = st.id))
    set({ assign: next })
  }
  const fillEmpty = () => {
    const next = [...assign]
    let k = 0
    for (let i = 0; i < next.length && k < unseated.length; i++) if (!next[i]) next[i] = unseated[k++].id
    set({ assign: next })
  }
  const addBulk = () => {
    const names = bulk.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
    if (!names.length) return
    set({ students: [...s.students, ...names.map((n) => ({ id: uid(), name: n }))] })
    setBulk('')
  }
  const remove = (id: string) => set({ students: s.students.filter((x) => x.id !== id), assign: assign.map((x) => (x === id ? null : x)), apart: s.apart.filter((p) => !p.includes(id)), front: s.front.filter((f) => f !== id) })

  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    return new XMLSerializer().serializeToString(el)
  }
  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><title>${s.title}</title><style>body{font-family:system-ui,sans-serif;margin:24px}h1{font-size:20px}svg{width:100%;height:auto}</style><h1>${s.title.replace(/</g, '&lt;')}</h1>${svgText()}`)
    win.document.close()
    win.focus()
    win.print()
  }

  const students = [...s.students].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Split wide="right">
      <div>
        <Panel title="Room layout">
          <Txt label="Chart title" value={s.title} onChange={(title) => set({ title })} />
          <Select label="Preset" value={s.layout} onChange={setLayout} options={LAYOUTS.map((l) => [l[0], l[1]] as const)} />
          <Slider label={s.layout === 'groups' ? 'Groups across' : s.layout === 'ushape' ? 'Desks along the back' : 'Desks per row'} value={s.cols} onChange={(cols) => set({ cols })} min={1} max={s.layout === 'groups' ? 5 : 10} />
          <Slider label={s.layout === 'groups' ? 'Groups deep' : s.layout === 'ushape' ? 'Desks per side' : 'Rows'} value={s.rows} onChange={(rows) => set({ rows })} min={1} max={s.layout === 'groups' ? 4 : 8} />
        </Panel>
        <Panel title="Students" actions={<Btn kind="ghost" onClick={() => set({ students: [], assign: [], apart: [], front: [] })}>Clear all</Btn>}>
          <Area label="Add names (one per line or comma-separated)" value={bulk} onChange={setBulk} rows={3} placeholder={'Alex\nSam\nJordan'} />
          <Btn kind="primary" onClick={addBulk} disabled={!bulk.trim()}>+ Add students</Btn>
          <div data-roster style={{ marginTop: 10, minHeight: 60, border: '2px dashed var(--line)', borderRadius: 10, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <div className="muted" style={{ width: '100%', fontSize: 12 }}>Unseated ({unseated.length}): drag onto a desk, or drop a seated student here</div>
            {unseated.map((st) => (
              <span key={st.id} onPointerDown={start(st.id, -1)} style={{ touchAction: 'none', cursor: 'grab', padding: '4px 10px', borderRadius: 999, background: selected === st.id ? 'var(--accent)' : 'var(--line)', color: selected === st.id ? '#fff' : undefined, fontSize: 14, userSelect: 'none' }}>
                {st.name}
              </span>
            ))}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary>Edit roster ({s.students.length})</summary>
            {students.map((st) => (
              <Row key={st.id} wrap={false}>
                <input value={st.name} aria-label="Name" onChange={(e) => set({ students: s.students.map((x) => (x.id === st.id ? { ...x, name: e.target.value } : x)) })} style={{ flex: 1 }} />
                <label className="k-check" title="Needs a front seat"><input type="checkbox" checked={s.front.includes(st.id)} onChange={(e) => set({ front: e.target.checked ? [...s.front, st.id] : s.front.filter((f) => f !== st.id) })} /> front</label>
                <Btn kind="ghost" onClick={() => remove(st.id)} title="Remove">✕</Btn>
              </Row>
            ))}
          </details>
        </Panel>
        <Panel title="Keep apart">
          <Row>
            <Select label="Student" value={apartA} onChange={setApartA} options={[['', '—'] as const, ...students.map((x) => [x.id, x.name] as const)]} />
            <Select label="and" value={apartB} onChange={setApartB} options={[['', '—'] as const, ...students.map((x) => [x.id, x.name] as const)]} />
          </Row>
          <Btn disabled={!apartA || !apartB || apartA === apartB} onClick={() => { set({ apart: [...s.apart, [apartA, apartB]] }); setApartA(''); setApartB('') }}>+ Add rule</Btn>
          {s.apart.map(([a, b], i) => (
            <Row key={i} wrap={false}>
              <span style={{ flex: 1 }}>{name(a)} ↔ {name(b)}</span>
              <Btn kind="ghost" onClick={() => set({ apart: s.apart.filter((_, k) => k !== i) })}>✕</Btn>
            </Row>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>Shuffle keeps these pairs out of neighbouring desks (including diagonals) and seats students marked "front" in the first row.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Desks" value={seats.length} />
          <Stat label="Seated" value={`${seated.size} / ${s.students.length}`} tone={unseated.length ? 'accent' : 'good'} />
          <Stat label="Empty desks" value={seats.length - seated.size} />
          <Stat label="Rule conflicts" value={bad} tone={bad ? 'bad' : 'good'} />
        </Stats>
        {s.students.length > seats.length && <Note tone="warn">{s.students.length - seats.length} more students than desks. Add rows or desks.</Note>}
        <Panel
          title={s.title || 'Seating chart'}
          actions={
            <>
              <Btn kind="primary" onClick={shuffle}>🔀 Shuffle</Btn>
              <Btn onClick={alpha}>A→Z</Btn>
              <Btn onClick={fillEmpty} disabled={!unseated.length}>Fill empty</Btn>
              <Btn kind="ghost" onClick={() => set({ assign: [] })}>Clear seats</Btn>
            </>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: Math.min(w, 520), display: 'block', touchAction: drag ? 'none' : undefined, userSelect: 'none' }} role="img" aria-label="Seating chart">
              <rect x={0} y={0} width={w} height={h} rx={14} fill="#f8fafc" stroke="#cbd5e1" />
              <rect x={w / 2 - 90} y={18} width={180} height={50} rx={8} fill="#e0e7ff" stroke="#818cf8" />
              <text x={w / 2} y={48} textAnchor="middle" fontSize={15} fontWeight={600} fill="#3730a3">Teacher · Front of room</text>
              {seats.map((st, i) => {
                const id = assign[i]
                const conflict = id && s.apart.some(([a, b]) => (a === id || b === id) && conflicts(assign, seats, [[a, b]]) > 0)
                const over = drag && drag.from !== i
                return (
                  <g key={i} data-seat={i} onPointerDown={id ? start(id, i) : undefined} onClick={() => clickSeat(i)} style={{ cursor: id ? 'grab' : selected ? 'pointer' : 'default' }}>
                    <rect x={st.x + 3} y={st.y + 3} width={st.w - 6} height={st.h - 6} rx={7} fill={id ? (selected === id ? '#c7d2fe' : '#fef9c3') : over ? '#dcfce7' : '#f1f5f9'} stroke={conflict ? '#dc2626' : id ? '#ca8a04' : '#94a3b8'} strokeWidth={conflict ? 3 : 1.5} strokeDasharray={id ? undefined : '4 3'} />
                    <text x={st.x + st.w / 2} y={st.y + st.h / 2 + 5} textAnchor="middle" fontSize={id && name(id).length > 10 ? 11 : 14} fontWeight={600} fill={id ? '#1e293b' : '#94a3b8'}>
                      {id ? name(id) : i + 1}
                    </text>
                    {id && s.front.includes(id) && <text x={st.x + 10} y={st.y + 16} fontSize={10} fill="#4f46e5">★</text>}
                  </g>
                )
              })}
            </svg>
          </div>
          <Row>
            <Btn onClick={print}>🖨 Print</Btn>
            <Btn onClick={() => download('seating-chart.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
            <CsvButton name="seating-chart.csv" rows={() => [['Desk', 'Student'], ...seats.map((_, i) => [i + 1, assign[i] ? name(assign[i]!) : ''])]} />
            <JsonButtons name="seating-chart.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Sample class</Btn>
          </Row>
          {selected ? <Note>Selected <b>{name(selected)}</b>: tap a desk to move them there.</Note> : <p className="muted" style={{ fontSize: 13 }}>Drag names between desks to swap them, or tap a name and then a desk. Red outline = a keep-apart rule is broken.</p>}
        </Panel>
      </div>
      {drag && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 6 && (
        <div style={{ position: 'fixed', left: drag.x + 8, top: drag.y + 8, pointerEvents: 'none', zIndex: 50, background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: 999, boxShadow: '0 4px 12px #0004' }}>{name(drag.id)}</div>
      )}
    </Split>
  )
}
