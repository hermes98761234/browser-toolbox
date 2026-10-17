import { Btn, CopyButton, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, color, money, num, pct, useToolState } from '../kit'
import { estimate, type Match, type Opening, type Wall } from './lib/wallpaper-roll-calculator'

const PRESETS: [string, string, number, number][] = [
  ['euro', 'Standard EU roll 53 cm × 10.05 m', 53, 1005],
  ['us', 'US double roll 20.5 in × 33 ft', 52.07, 1005.8],
  ['uk', 'UK roll 52 cm × 10 m', 52, 1000],
  ['wide70', 'Wide 70 cm × 10.05 m', 70, 1005],
  ['wide106', 'Extra wide 1.06 m × 10.05 m', 106, 1005],
  ['custom', 'Custom size', 0, 0],
]

const DEF = {
  unit: 'cm' as 'cm' | 'in',
  preset: 'euro',
  rollWidth: 53,
  rollLength: 1005,
  repeat: 64,
  match: 'straight' as Match,
  trim: 10,
  spare: 10,
  price: 35,
  walls: [
    { name: 'Wall A', width: 420, height: 250 },
    { name: 'Wall B', width: 360, height: 250 },
    { name: 'Wall C', width: 420, height: 250 },
    { name: 'Wall D', width: 360, height: 250 },
  ] as Wall[],
  openings: [
    { wall: 1, x: 40, y: 0, w: 90, h: 205, label: 'Door' },
    { wall: 2, x: 120, y: 90, w: 160, h: 130, label: 'Window' },
  ] as Opening[],
}

function WallSvg({ w, wi, ops, rollWidth, pieces }: { w: Wall; wi: number; ops: Opening[]; rollWidth: number; pieces: { strip: number; kind: string }[] }) {
  const n = Math.ceil(w.width / rollWidth - 1e-9)
  const H = 120, k = H / w.height, W = w.width * k
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width={Math.min(260, W + 4)} style={{ maxWidth: '100%' }} role="img" aria-label={w.name}>
        {Array.from({ length: n }, (_, i) => {
          const kinds = pieces.filter((p) => p.strip === i).map((p) => p.kind)
          return <rect key={i} x={i * rollWidth * k} y={0} width={Math.min(rollWidth, w.width - i * rollWidth) * k} height={H} fill={kinds.includes('full') ? color(wi) : 'var(--grid)'} opacity={i % 2 ? 0.45 : 0.7} stroke="var(--panel)" strokeWidth={1} />
        })}
        {ops.map((o, j) => (
          <g key={j}>
            <rect x={o.x * k} y={(w.height - o.y - o.h) * k} width={o.w * k} height={o.h * k} fill="var(--panel)" stroke="var(--fg)" strokeWidth={1.5} />
            <text x={(o.x + o.w / 2) * k} y={(w.height - o.y - o.h / 2) * k} textAnchor="middle" fontSize={10} fill="var(--muted)">{o.label}</text>
          </g>
        ))}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--fg)" strokeWidth={1.5} />
      </svg>
      <figcaption className="muted" style={{ fontSize: 12 }}>{w.name} · {n} strips</figcaption>
    </figure>
  )
}

export default function WallpaperRollCalculator() {
  const [s, set, reset] = useToolState('wallpaper-roll-calculator', DEF)
  const f = s.unit === 'in' ? 2.54 : 1
  const U = s.unit
  const show = (cm: number) => Math.round((cm / f) * 100) / 100
  const len = (cm: number) => (s.unit === 'in' ? `${num(cm / 30.48, 1)} ft` : `${num(cm / 100, 2)} m`)
  const e = estimate(s)
  const spareRolls = Math.ceil(e.rolls.length * (s.spare / 100))
  const buy = e.rolls.length + spareRolls
  const editWall = (i: number, p: Partial<Wall>) => set({ walls: s.walls.map((w, j) => (j === i ? { ...w, ...p } : w)) })
  const editOp = (i: number, p: Partial<Opening>) => set({ openings: s.openings.map((o, j) => (j === i ? { ...o, ...p } : o)) })
  const cm = (v: number) => Math.max(0, v * f)
  const summary = `Wallpaper: buy ${buy} rolls (${e.rolls.length} needed + ${spareRolls} spare), ${e.pieces.length} cuts, full drop ${len(e.fullCut)}, ${e.perRoll} drops per roll.`

  return (
    <Split>
      <div>
        <Panel title="Roll & pattern">
          <Row>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['cm', 'Metric (cm)'], ['in', 'Imperial (in)']]} />
          </Row>
          <Select
            label="Roll size"
            value={s.preset}
            onChange={(preset) => {
              const p = PRESETS.find((x) => x[0] === preset)!
              set(p[2] ? { preset, rollWidth: p[2], rollLength: p[3] } : { preset })
            }}
            options={PRESETS.map((p) => [p[0], p[1]] as const)}
          />
          <Row>
            <Num label="Roll width" value={show(s.rollWidth)} unit={U} min={1} onChange={(v) => set({ rollWidth: cm(v), preset: 'custom' })} />
            <Num label="Roll length" value={show(s.rollLength)} unit={U} min={1} onChange={(v) => set({ rollLength: cm(v), preset: 'custom' })} />
          </Row>
          <div className="k-label" style={{ margin: '10px 0 6px' }}>Pattern match</div>
          <Seg value={s.match} onChange={(match) => set({ match })} options={[['random', 'Free / random'], ['straight', 'Straight'], ['half', 'Half-drop']]} />
          <Row>
            <Num label="Pattern repeat" value={show(s.repeat)} unit={U} min={0} onChange={(v) => set({ repeat: cm(v) })} hint="printed on the label" />
            <Num label="Trim allowance" value={show(s.trim)} unit={U} min={0} onChange={(v) => set({ trim: cm(v) })} hint="top + bottom per drop" />
          </Row>
          <Row>
            <Num label="Spare" value={s.spare} unit="%" min={0} max={100} onChange={(spare) => set({ spare })} />
            <Num label="Price per roll" value={s.price} min={0} onChange={(price) => set({ price })} />
          </Row>
        </Panel>
        <Panel title="Walls" actions={<Btn onClick={() => set({ walls: [...s.walls, { name: `Wall ${String.fromCharCode(65 + s.walls.length)}`, width: 300, height: s.walls[0]?.height ?? 250 }] })}>+ Wall</Btn>}>
          <Table
            head={['Name', `Width (${U})`, `Height (${U})`, '']}
            rows={s.walls.map((w, i) => [
              <input key="n" value={w.name} onChange={(ev) => editWall(i, { name: ev.target.value })} style={{ width: 90 }} aria-label="Wall name" />,
              <input key="w" type="number" min={0} value={show(w.width)} onChange={(ev) => editWall(i, { width: cm(+ev.target.value || 0) })} style={{ width: 80 }} aria-label="Width" />,
              <input key="h" type="number" min={0} value={show(w.height)} onChange={(ev) => editWall(i, { height: cm(+ev.target.value || 0) })} style={{ width: 80 }} aria-label="Height" />,
              <Btn key="x" kind="ghost" onClick={() => set({ walls: s.walls.filter((_, j) => j !== i), openings: s.openings.filter((o) => o.wall !== i).map((o) => ({ ...o, wall: o.wall > i ? o.wall - 1 : o.wall })) })}>✕</Btn>,
            ])}
          />
        </Panel>
        <Panel title="Doors & windows" actions={<Btn onClick={() => set({ openings: [...s.openings, { wall: 0, x: 100, y: 90, w: 120, h: 120, label: 'Window' }] })}>+ Opening</Btn>}>
          <Table
            head={['Label', 'Wall', `From left`, `From floor`, 'Width', 'Height', '']}
            rows={s.openings.map((o, i) => [
              <input key="l" value={o.label} onChange={(ev) => editOp(i, { label: ev.target.value })} style={{ width: 70 }} aria-label="Label" />,
              <select key="w" value={o.wall} onChange={(ev) => editOp(i, { wall: +ev.target.value })} aria-label="Wall">
                {s.walls.map((w, j) => <option key={j} value={j}>{w.name}</option>)}
              </select>,
              ...(['x', 'y', 'w', 'h'] as const).map((k) => <input key={k} type="number" min={0} value={show(o[k])} onChange={(ev) => editOp(i, { [k]: cm(+ev.target.value || 0) })} style={{ width: 56 }} aria-label={k} />),
              <Btn key="x" kind="ghost" onClick={() => set({ openings: s.openings.filter((_, j) => j !== i) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>An opening saves paper only for strips it spans completely; pieces above and below it are cut from roll offcuts where possible.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rolls to buy" value={buy} sub={`${e.rolls.length} needed + ${spareRolls} spare`} tone="accent" />
          <Stat label="Cost" value={money(buy * s.price, '', 2)} sub={`${money(s.price, '', 2)} per roll`} />
          <Stat label="Full drop length" value={len(e.fullCut)} sub={`${e.perRoll} drops per roll`} />
          <Stat label="Wall area" value={s.unit === 'in' ? `${num(e.area / 929.03, 0)} ft²` : `${num(e.area / 10000, 1)} m²`} sub={`waste ${pct(e.waste, 0)}`} />
        </Stats>
        {e.tooLong.length > 0 && <Note tone="err">{e.tooLong.length} drop(s) are longer than a roll. Use longer rolls or check the wall height.</Note>}
        {e.perRoll > 0 && e.rolls.length < e.naiveRolls && (
          <Note tone="ok">Using offcuts for short pieces saves {e.naiveRolls - e.rolls.length} roll(s) versus the simple strips ÷ drops-per-roll estimate ({e.naiveRolls}).</Note>
        )}
        <Panel title="Wall layout">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {s.walls.map((w, i) => (w.width > 0 && w.height > 0 ? <WallSvg key={i} w={w} wi={i} ops={s.openings.filter((o) => o.wall === i)} rollWidth={s.rollWidth} pieces={e.pieces.filter((p) => p.wall === i)} /> : null))}
          </div>
        </Panel>
        <Panel title="Cutting plan" actions={<CopyButton text={summary} label="Copy summary" />}>
          <div style={{ display: 'grid', gap: 6 }}>
            {e.rolls.map((r, i) => {
              const used = r.reduce((a, p) => a + p.len, 0)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 56, fontSize: 13 }}>Roll {i + 1}</span>
                  <div style={{ flex: 1, display: 'flex', height: 26, border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--grid)' }}>
                    {r.map((p, j) => (
                      <div key={j} title={`${s.walls[p.wall]?.name} strip ${p.strip + 1} (${p.kind}) ${len(p.len)}`} style={{ width: `${(p.len / s.rollLength) * 100}%`, background: color(p.wall), opacity: p.kind === 'full' ? 0.85 : 0.5, borderRight: '2px solid var(--panel)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                        {p.len / s.rollLength > 0.07 ? len(p.len) : '▴'}
                      </div>
                    ))}
                  </div>
                  <span className="muted" style={{ width: 70, fontSize: 12, textAlign: 'right' }}>{len(s.rollLength - used)} left</span>
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Colours = walls; faded blocks are short pieces above/below openings. Cuts are multiples of the repeat so every drop starts at the same point in the pattern.</p>
        </Panel>
        <Note>
          Buy all rolls with the same batch (lot) number: shades vary between print runs. {s.match === 'half' && 'Half-drop patterns: alternate drops are offset by half a repeat, which costs about half a repeat per drop.'} Hang from the window outward and keep a spare roll for repairs.
        </Note>
        <Row>
          <Btn kind="ghost" onClick={reset}>Reset to example room</Btn>
        </Row>
      </div>
    </Split>
  )
}
