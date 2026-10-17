import { useState } from 'react'
import { Btn, Check, CsvButton, money, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { bestCans, paintNeeded, roomArea, type Can, type Opening, type Room } from './lib/paint-calculator'

type Sys = 'metric' | 'imperial'
interface State {
  sys: Sys
  rooms: Room[]
  door: Opening
  win: Opening
  coats: number
  coverage: number
  ceilCoverage: number
  waste: number
  primer: boolean
  cans: Can[]
}

const FT = 3.28084
const COV = 40.7458 // 1 m²/L in ft²/US gal
const CANS: Record<Sys, Can[]> = {
  metric: [{ size: 1, price: 14 }, { size: 2.5, price: 29 }, { size: 5, price: 49 }, { size: 10, price: 89 }],
  imperial: [{ size: 0.25, price: 18 }, { size: 1, price: 42 }, { size: 5, price: 185 }],
}
const DEF: State = {
  sys: 'metric',
  rooms: [
    { id: 'lr', name: 'Living room', length: 5.2, width: 4.1, height: 2.6, doors: 2, windows: 2, ceiling: true, walls: true },
    { id: 'bd', name: 'Bedroom', length: 3.8, width: 3.4, height: 2.6, doors: 1, windows: 1, ceiling: false, walls: true },
    { id: 'hl', name: 'Hallway', length: 4.5, width: 1.4, height: 2.6, doors: 4, windows: 0, ceiling: true, walls: true },
  ],
  door: { w: 0.9, h: 2.1 },
  win: { w: 1.3, h: 1.4 },
  coats: 2,
  coverage: 10,
  ceilCoverage: 9,
  waste: 10,
  primer: false,
  cans: CANS.metric,
}

const PRESETS: [string, number][] = [['Smooth, previously painted', 12], ['Average wall', 10], ['New plaster / drywall', 8], ['Textured / masonry', 6]]

export default function PaintCalculator() {
  const [s, set, reset] = useToolState('paint-calculator', DEF)
  const [sel, setSel] = useState(0)
  const im = s.sys === 'imperial'
  const lu = im ? 'ft' : 'm', au = im ? 'ft²' : 'm²', vu = im ? 'gal' : 'L', cu = im ? 'ft²/gal' : 'm²/L'
  const edit = (id: string, p: Partial<Room>) => set({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) })

  const areas = s.rooms.map((r) => ({ r, a: roomArea(r, s.door, s.win) }))
  const wallArea = areas.reduce((t, x) => t + x.a.walls, 0)
  const ceilArea = areas.reduce((t, x) => t + x.a.ceiling, 0)
  const wallPaint = paintNeeded(wallArea, s.coats, s.coverage, s.waste)
  const ceilPaint = paintNeeded(ceilArea, s.coats, s.ceilCoverage, s.waste)
  const primerPaint = s.primer ? paintNeeded(wallArea + ceilArea, 1, s.coverage, s.waste) : 0
  const plans = ([['Wall paint', wallPaint], ['Ceiling paint', ceilPaint], ...(s.primer ? [['Primer', primerPaint]] : [])] as [string, number][]).map(([name, need]) => ({ name, need, plan: bestCans(need, s.cans) }))
  const totalCost = plans.reduce((t, p) => t + (p.plan?.cost ?? 0), 0)

  const switchSys = (sys: Sys) => {
    if (sys === s.sys) return
    const f = sys === 'imperial' ? FT : 1 / FT
    const c = sys === 'imperial' ? COV : 1 / COV
    const r1 = (x: number) => Math.round(x * 100) / 100
    set({
      sys,
      rooms: s.rooms.map((r) => ({ ...r, length: r1(r.length * f), width: r1(r.width * f), height: r1(r.height * f) })),
      door: { w: r1(s.door.w * f), h: r1(s.door.h * f) },
      win: { w: r1(s.win.w * f), h: r1(s.win.h * f) },
      coverage: Math.round(s.coverage * c),
      ceilCoverage: Math.round(s.ceilCoverage * c),
      cans: CANS[sys],
    })
  }

  const cur = areas[Math.min(sel, areas.length - 1)]

  return (
    <Split>
      <div>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.sys} onChange={switchSys} options={[['metric', 'Metric (m, L)'], ['imperial', 'US (ft, gal)']]} />
          <Slider label="Coats" value={s.coats} min={1} max={4} onChange={(coats) => set({ coats })} show={(v) => String(v)} />
          <Row>
            <Num label="Wall coverage" unit={cu} value={s.coverage} min={0.1} onChange={(coverage) => set({ coverage })} />
            <Num label="Ceiling coverage" unit={cu} value={s.ceilCoverage} min={0.1} onChange={(ceilCoverage) => set({ ceilCoverage })} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {PRESETS.map(([n, v]) => {
              const val = Math.round(im ? v * COV : v)
              return <button key={n} type="button" className={`k-btn ${s.coverage === val ? 'primary' : ''}`} style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => set({ coverage: val })}>{n} · {val}</button>
            })}
          </div>
          <Slider label="Waste & touch-up allowance" value={s.waste} min={0} max={25} unit="%" onChange={(waste) => set({ waste })} show={(v) => String(v)} />
          <Row>
            <Num label="Door width" unit={lu} value={s.door.w} min={0} onChange={(w) => set({ door: { ...s.door, w } })} />
            <Num label="Door height" unit={lu} value={s.door.h} min={0} onChange={(h) => set({ door: { ...s.door, h } })} />
          </Row>
          <Row>
            <Num label="Window width" unit={lu} value={s.win.w} min={0} onChange={(w) => set({ win: { ...s.win, w } })} />
            <Num label="Window height" unit={lu} value={s.win.h} min={0} onChange={(h) => set({ win: { ...s.win, h } })} />
          </Row>
          <Check label="Add a primer coat (walls + ceilings)" value={s.primer} onChange={(primer) => set({ primer })} />
        </Panel>
        <Panel title={`Can sizes & prices (${vu})`}>
          <Table
            head={['Size', 'Price', '']}
            rows={s.cans.map((c, i) => [
              <input key="s" type="number" min={0} step="any" value={c.size} aria-label="Can size" onChange={(e) => set({ cans: s.cans.map((x, j) => (j === i ? { ...x, size: Math.max(0, Number(e.target.value) || 0) } : x)) })} />,
              <input key="p" type="number" min={0} step="any" value={c.price} aria-label="Price" onChange={(e) => set({ cans: s.cans.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)) })} />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ cans: s.cans.filter((_, j) => j !== i) })}>✕</Btn>,
            ])}
          />
          <div style={{ marginTop: 8 }}><Btn onClick={() => set({ cans: [...s.cans, { size: 1, price: 10 }] })}>+ Can size</Btn></div>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Wall area to paint" value={`${num(wallArea, 1)} ${au}`} sub={`after ${num(areas.reduce((t, x) => t + x.a.openings, 0), 1)} ${au} of doors/windows`} />
          <Stat label="Ceiling area" value={`${num(ceilArea, 1)} ${au}`} />
          <Stat label="Paint needed" value={`${num(wallPaint + ceilPaint + primerPaint, 1)} ${vu}`} sub={`${s.coats} coat${s.coats > 1 ? 's' : ''} + ${s.waste}% extra`} tone="accent" />
          <Stat label="Estimated cost" value={money(totalCost)} sub="cheapest can mix" tone="good" />
        </Stats>

        <Panel title="Rooms" actions={<>
          <Btn onClick={() => set({ rooms: [...s.rooms, { id: uid(), name: `Room ${s.rooms.length + 1}`, length: im ? 12 : 4, width: im ? 10 : 3, height: im ? 8 : 2.5, doors: 1, windows: 1, ceiling: false, walls: true }] })}>+ Room</Btn>
          <CsvButton name="paint-rooms.csv" rows={() => [['Room', `Length ${lu}`, `Width ${lu}`, `Height ${lu}`, 'Doors', 'Windows', `Wall area ${au}`, `Ceiling ${au}`], ...areas.map(({ r, a }) => [r.name, r.length, r.width, r.height, r.doors, r.windows, a.walls.toFixed(2), a.ceiling.toFixed(2)])]} />
        </>}>
          <Table
            head={['Room', `L (${lu})`, `W (${lu})`, `H (${lu})`, 'Doors', 'Win.', 'Walls', 'Ceil.', au, '']}
            rows={areas.map(({ r, a }, i) => [
              <input key="n" value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} onFocus={() => setSel(i)} aria-label="Room name" style={{ minWidth: 96 }} />,
              ...(['length', 'width', 'height', 'doors', 'windows'] as const).map((k) => (
                <input key={k} type="number" min={0} step={k === 'doors' || k === 'windows' ? 1 : 'any'} value={r[k]} aria-label={k} style={{ width: k === 'doors' || k === 'windows' ? 44 : 58, minWidth: 0 }} onFocus={() => setSel(i)} onChange={(e) => edit(r.id, { [k]: Math.max(0, Number(e.target.value) || 0) })} />
              )),
              <input key="w" type="checkbox" checked={r.walls} aria-label="Paint walls" onChange={(e) => edit(r.id, { walls: e.target.checked })} />,
              <input key="c" type="checkbox" checked={r.ceiling} aria-label="Paint ceiling" onChange={(e) => edit(r.id, { ceiling: e.target.checked })} />,
              <b key="a">{num(a.walls + a.ceiling, 1)}</b>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ rooms: s.rooms.filter((x) => x.id !== r.id) })}>✕</Btn>,
            ])}
            foot={['Total', '', '', '', '', '', '', '', num(wallArea + ceilArea, 1), '']}
          />
          {a0warn(areas) && <Note tone="warn">Some room has more door/window area than wall area. Check the opening sizes.</Note>}
        </Panel>

        <Panel title="What to buy">
          <Table
            head={['Product', 'Needed', 'Buy', 'Volume', 'Leftover', 'Cost']}
            rows={plans.map(({ name, need, plan }) => [
              <b key="n">{name}</b>,
              `${num(need, 2)} ${vu}`,
              plan ? plan.counts.map((n, i) => (n ? `${n} × ${s.cans[i].size} ${vu}` : '')).filter(Boolean).join(' + ') || '—' : 'add a can size',
              plan ? `${num(plan.volume, 2)} ${vu}` : '—',
              plan ? `${num(plan.volume - need, 2)} ${vu}` : '—',
              plan ? money(plan.cost) : '—',
            ])}
            foot={['Total', '', '', '', '', money(totalCost)]}
          />
          <Note>Coverage is per coat. Dark-to-light colour changes, fresh plaster and rough surfaces often need an extra coat; check the label on your tin.</Note>
        </Panel>

        {cur && (
          <Panel title={`Wall layout: ${cur.r.name}`}>
            <Unfolded r={cur.r} door={s.door} win={s.win} lu={lu} />
            <p className="muted" style={{ fontSize: 12.5 }}>Walls shown unfolded. Openings are spread across walls for illustration only. Click a room row to show it here.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}

const a0warn = (areas: { a: { gross: number; openings: number } }[]) => areas.some(({ a }) => a.gross > 0 && a.openings >= a.gross)

function Unfolded({ r, door, win, lu }: { r: Room; door: Opening; win: Opening; lu: string }) {
  const walls = [r.length, r.width, r.length, r.width]
  const total = walls.reduce((a, b) => a + b, 0) || 1
  const W = 680, pad = 8, H = Math.max(60, Math.min(220, ((W - 2 * pad) / total) * r.height))
  const k = H / (r.height || 1)
  const ops: { wall: number; kind: 'door' | 'win' }[] = []
  for (let i = 0; i < r.doors; i++) ops.push({ wall: i % 4, kind: 'door' })
  for (let i = 0; i < r.windows; i++) ops.push({ wall: (i + 1) % 4, kind: 'win' })
  let x = pad
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Unfolded walls">
      {walls.map((w, i) => {
        const x0 = x
        const ww = w * k
        x += ww
        const mine = ops.filter((o) => o.wall === i)
        const slot = ww / (mine.length + 1)
        return (
          <g key={i}>
            <rect x={x0} y={pad} width={ww} height={H - pad} fill={r.walls ? 'color-mix(in srgb, var(--accent) 22%, var(--panel))' : 'var(--panel)'} stroke="var(--line)" />
            {mine.map((o, j) => {
              const ow = (o.kind === 'door' ? door.w : win.w) * k, oh = (o.kind === 'door' ? door.h : win.h) * k
              const cx = x0 + slot * (j + 1)
              const y = o.kind === 'door' ? H - oh : pad + (H - pad) * 0.3
              return <rect key={j} x={cx - ow / 2} y={Math.max(pad, y)} width={ow} height={Math.min(oh, H - pad)} fill="var(--panel)" stroke="var(--muted)" strokeDasharray={o.kind === 'win' ? '3 2' : undefined} />
            })}
            <text x={x0 + ww / 2} y={H + 18} textAnchor="middle" fontSize={11} fill="var(--muted)">{num(w, 2)} {lu}</text>
          </g>
        )
      })}
    </svg>
  )
}
