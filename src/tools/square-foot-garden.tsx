import { useMemo, useRef, useState } from 'react'
import { Btn, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { neighbours, plant, PLANTS, resize, tally } from './lib/square-foot-garden'

interface State { name: string; w: number; h: number; cells: (string | null)[]; brush: string }

const S = (x: string) => x.split(',').map((v) => (v === '.' ? null : v))
const DEF: State = {
  name: 'Backyard bed',
  w: 4,
  h: 4,
  // A classic first 4×4 bed: tall plants on the north row, roots and greens in front.
  cells: S('tomato,basil,marigold,cucumber,pepper,lettuce,lettuce,bean,carrot,onion,radish,spinach,carrot,beet,strawberry,parsley'),
  brush: 'tomato',
}
const ERASE = '__erase'
const fr = (x: number) => (x === 0.25 ? '¼' : x === 0.5 ? '½' : String(x))

export default function SquareFootGarden() {
  const [s, set, reset] = useToolState('square-foot-garden', DEF)
  const [season, setSeason] = useState<'all' | 'cool' | 'warm'>('all')
  const [hover, setHover] = useState<number | null>(null)
  const painting = useRef(false)
  const cells = s.cells.length === s.w * s.h ? s.cells : resize(s.cells, s.w, s.w, s.h)
  const issues = useMemo(() => neighbours(cells, s.w), [cells, s.w])
  const bad = issues.filter((x) => x.kind === 'bad')
  const good = issues.filter((x) => x.kind === 'good')
  const badCells = new Set(bad.flatMap((x) => [x.a, x.b]))
  const counts = tally(cells)
  const planted = cells.filter(Boolean).length
  const totalPlants = counts.reduce((a, c) => a + c.plants, 0)

  const paint = (i: number) => {
    const v = s.brush === ERASE ? null : s.brush
    if (cells[i] === v) return
    set({ cells: cells.map((c, j) => (j === i ? v : c)) })
  }
  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-i]')
    return el ? Number(el.getAttribute('data-i')) : null
  }
  const setSize = (w: number, h: number) => {
    const W = Math.max(1, Math.min(16, Math.round(w) || 1)), H = Math.max(1, Math.min(16, Math.round(h) || 1))
    set({ w: W, h: H, cells: resize(cells, s.w, W, H) })
  }
  const cellName = (i: number) => `${String.fromCharCode(65 + (i % s.w))}${Math.floor(i / s.w) + 1}`

  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const grid = Array.from({ length: s.h }, (_, y) => `<tr>${Array.from({ length: s.w }, (_, x) => {
      const p = plant(cells[y * s.w + x])
      return `<td style="background:${p ? p.color + '33' : '#fff'}"><div class="ic">${p?.icon ?? ''}</div><div>${p ? p.name.replace(/ \(.*\)/, '') : ''}</div><b>${p ? fr(p.perSq) : ''}</b></td>`
    }).join('')}</tr>`).join('')
    const list = counts.map((c) => { const p = plant(c.id)!; return `<li>${p.icon} ${p.name}: ${c.squares} sq → ${c.plants} plant(s), ${fr(p.perSq)}/sq, ~${p.days} days</li>` }).join('')
    win.document.write(`<!doctype html><title>${s.name}</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td{width:90px;height:90px;border:2px solid #555;text-align:center;font-size:11px;vertical-align:middle}.ic{font-size:28px}</style><h2>${s.name} — ${s.w}×${s.h} ft</h2><table>${grid}</table><ul>${list}</ul><p>North is at the top. Plant counts are per square-foot-gardening spacing.</p><script>setTimeout(()=>print(),300)</script>`)
    win.document.close()
  }

  const palette = PLANTS.filter((p) => season === 'all' || p.season === season)
  const brushP = plant(s.brush)

  return (
    <Split wide="left">
      <div>
        <Panel
          title={`${s.name} · ${s.w}×${s.h} ft`}
          actions={<>
            <Btn onClick={print}>🖨 Print layout</Btn>
            <JsonButtons name="garden.json" data={s} onLoad={(d) => d && Array.isArray(d.cells) && set(d)} />
          </>}
        >
          <div
            role="grid"
            aria-label="Garden bed"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${s.w}, minmax(0, 1fr))`, gap: 3, padding: 6, background: '#8b5a2b', borderRadius: 10, touchAction: 'none', userSelect: 'none', maxWidth: Math.min(640, s.w * 120), margin: '0 auto' }}
            onPointerDown={(e) => { painting.current = true; const i = cellAt(e.clientX, e.clientY); if (i !== null) paint(i) }}
            onPointerMove={(e) => { const i = cellAt(e.clientX, e.clientY); setHover(i); if (painting.current && i !== null) paint(i) }}
            onPointerUp={() => (painting.current = false)}
            onPointerLeave={() => { painting.current = false; setHover(null) }}
          >
            {cells.map((c, i) => {
              const p = plant(c)
              const n = p ? Math.max(1, Math.min(16, Math.round(p.perSq))) : 0
              const side = Math.ceil(Math.sqrt(n))
              return (
                <div
                  key={i}
                  data-i={i}
                  title={`${cellName(i)}${p ? ` · ${p.name} · ${fr(p.perSq)} per square` : ' · empty'}`}
                  style={{
                    aspectRatio: '1', borderRadius: 6, position: 'relative', cursor: 'crosshair', overflow: 'hidden',
                    background: p ? `color-mix(in srgb, ${p.color} 28%, #5b3a1e)` : '#5b3a1e',
                    outline: badCells.has(i) ? '3px solid #ef4444' : hover === i ? '2px solid #fff' : undefined, outlineOffset: -3,
                  }}
                >
                  {p && (
                    <div style={{ position: 'absolute', inset: 4, display: 'grid', gridTemplateColumns: `repeat(${side}, 1fr)`, placeItems: 'center', fontSize: `clamp(10px, ${(s.w > 6 ? 18 : 30) / side}px, 30px)` }}>
                      {Array.from({ length: n }, (_, k) => <span key={k}>{p.icon}</span>)}
                    </div>
                  )}
                  <span style={{ position: 'absolute', left: 4, top: 2, fontSize: 9, color: '#fff9', fontWeight: 700 }}>{cellName(i)}</span>
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 12.5, textAlign: 'center', margin: '8px 0 0' }}>North ↑ · click or drag to plant with <b>{brushP ? `${brushP.icon} ${brushP.name}` : 'the eraser'}</b> · each square is 1 × 1 ft (30 × 30 cm)</p>
        </Panel>

        <Panel title="Companion check">
          {bad.length === 0 ? <Note tone="ok">No known antagonists are next to each other. 👍</Note> : bad.map((x, k) => (
            <Note key={k} tone="err">{cellName(x.a)} {plant(cells[x.a])?.name} ✕ {cellName(x.b)} {plant(cells[x.b])?.name}: these are commonly said to stunt each other. Move one at least a square away.</Note>
          ))}
          {good.length > 0 && (
            <p style={{ fontSize: 13 }}>
              <b style={{ color: 'var(--ok)' }}>Good neighbours:</b> {[...new Set(good.map((x) => `${plant(cells[x.a])?.icon} ${plant(cells[x.a])?.name} + ${plant(cells[x.b])?.icon} ${plant(cells[x.b])?.name}`))].join(' · ')}
            </p>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Companion pairings come from traditional gardening lore. Treat them as hints; sun, water and spacing matter more.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Squares planted" value={`${planted} / ${s.w * s.h}`} sub={`${Math.round((planted / (s.w * s.h)) * 100)}% of the bed`} tone="accent" />
          <Stat label="Plants" value={totalPlants} sub={`${counts.length} varieties`} />
          <Stat label="Conflicts" value={bad.length} tone={bad.length ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Bed">
          <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
          <Row>
            <label className="k-field"><span className="k-label">Width (ft)</span><input className="k-text" type="number" min={1} max={16} value={s.w} onChange={(e) => setSize(Number(e.target.value), s.h)} /></label>
            <label className="k-field"><span className="k-label">Length (ft)</span><input className="k-text" type="number" min={1} max={16} value={s.h} onChange={(e) => setSize(s.w, Number(e.target.value))} /></label>
          </Row>
          <Row>
            {[[4, 4], [4, 8], [3, 6], [2, 8]].map(([w, h]) => <Btn key={`${w}x${h}`} onClick={() => setSize(w, h)}>{w}×{h}</Btn>)}
            <Btn kind="danger" onClick={() => set({ cells: cells.map(() => null) })}>Clear</Btn>
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
          </Row>
        </Panel>
        <Panel title="Plants" actions={<Seg value={season} onChange={setSeason} options={[['all', 'All'], ['cool', 'Cool'], ['warm', 'Warm']]} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 6 }}>
            <button type="button" className={`k-btn ${s.brush === ERASE ? 'primary' : ''}`} onClick={() => set({ brush: ERASE })} style={{ justifyContent: 'flex-start' }}>🧽 Eraser</button>
            {palette.map((p) => (
              <button key={p.id} type="button" className={`k-btn ${s.brush === p.id ? 'primary' : ''}`} onClick={() => set({ brush: p.id })} style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: 12.5 }} title={`${p.name}: ${fr(p.perSq)} per square, ~${p.days} days, ${p.season}-season`}>
                {p.icon} {p.name.replace(/ \(.*\)/, '')} <span className="muted" style={{ marginLeft: 'auto' }}>{fr(p.perSq)}</span>
              </button>
            ))}
          </div>
          {brushP && <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{brushP.icon} <b>{brushP.name}</b>: {fr(brushP.perSq)} per square · ~{brushP.days} days to harvest · {brushP.season}-season crop{brushP.perSq < 1 ? ` · fill ${Math.round(1 / brushP.perSq)} squares per plant` : ''}</p>}
        </Panel>
        <Panel title="Planting list">
          <Table
            head={['Plant', 'Squares', 'Per sq', 'Plants', 'Days']}
            rows={counts.map((c) => { const p = plant(c.id)!; return [`${p.icon} ${p.name}`, c.squares, fr(p.perSq), <b key="n">{c.plants || '<1'}</b>, p.days] })}
            foot={['Total', planted, '', totalPlants, '']}
          />
        </Panel>
      </div>
    </Split>
  )
}
