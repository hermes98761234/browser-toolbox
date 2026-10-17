import { useMemo } from 'react'
import { Bar, Btn, Check, color, CsvButton, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { adjustment, conductorArea, CONDUITS, fill, jamRatio, maxSameSize, pack, SIZES, smallestSize, WIRE_TYPES, WIRES, type Conductor } from './lib/conduit-fill-calculator'

const c = (type: string, size: string, qty: number, ccc = true): Conductor => ({ id: uid(), type, size, qty, od: 0.5, ccc })
const T = 'THHN / THWN-2'
const DEF = {
  type: 'EMT',
  size: '3/4',
  nipple: false,
  conds: [c(T, '12', 6), c(T, '10', 2), c(T, '12', 1, false)],
}
const PRESETS: [string, Conductor[]][] = [
  ['Branch: 3 × #12 + G', [c(T, '12', 3), c(T, '12', 1, false)]],
  ['Two circuits #10', [c(T, '10', 4), c(T, '10', 1, false)]],
  ['100 A feeder', [c(T, '3', 3), c(T, '8', 1, false)]],
  ['200 A service', [c('XHHW / XHHW-2', '3/0', 3), c('XHHW / XHHW-2', '2/0', 1, false), c(T, '4', 1, false)]],
]
const MM2 = 645.16
const SIZE_LABEL = (s: string) => (s.includes('/') ? `${s} AWG` : Number(s) >= 250 ? `${s} kcmil` : `#${s} AWG`)

export default function ConduitFillCalculator() {
  const [s, set, reset] = useToolState('conduit-fill-calculator', DEF)
  const sizes = CONDUITS[s.type]
  const size = sizes.some(([x]) => x === s.size) ? s.size : sizes[0][0]
  const r = fill(s.conds, s.type, size, s.nipple)
  const dia = sizes.find(([x]) => x === size)![1]
  const edit = (id: string, p: Partial<Conductor>) => set({ conds: s.conds.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const ccc = s.conds.reduce((a, x) => a + (x.ccc ? x.qty : 0), 0)
  const over = r.fill > r.limit
  const tone = over ? 'var(--err)' : r.fill > r.limit * 0.85 ? 'var(--warn)' : 'var(--ok)'

  const circles = useMemo(() => {
    const radii: { r: number; k: number }[] = []
    s.conds.forEach((x, k) => {
      const a = conductorArea(x)
      for (let i = 0; i < Math.min(x.qty, 120); i++) radii.push({ r: Math.sqrt(a / Math.PI), k })
    })
    return pack(dia / 2, radii.map((q) => q.r)).map((p, i) => ({ ...p, k: radii[i].k }))
  }, [s.conds, dia])

  // jam ratio for exactly three equal conductors
  const equal3 = s.conds.filter((x) => x.qty > 0).length === 1 && r.count === 3 ? s.conds.find((x) => x.qty > 0)! : null
  const jam = equal3 ? jamRatio(dia, Math.sqrt((4 * conductorArea(equal3)) / Math.PI)) : 0
  const biggest = [...s.conds].sort((a, b) => conductorArea(b) - conductorArea(a))[0]
  const V = 260

  return (
    <Split wide="right">
      <div>
        <Panel title="Conduit" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Type" value={s.type} onChange={(type) => set({ type })} options={Object.keys(CONDUITS)} />
            <Select label="Trade size" value={size} onChange={(v) => set({ size: v })} options={sizes.map(([x, d]) => [x, `${x}″ (ID ${d}″)`] as const)} />
          </Row>
          <Check label="Nipple ≤ 24 in (60 % fill allowed)" value={s.nipple} onChange={(nipple) => set({ nipple })} />
        </Panel>
        <Panel
          title="Conductors"
          actions={<Btn onClick={() => set({ conds: [...s.conds, c(T, '12', 1)] })}>+ Conductor</Btn>}
        >
          {s.conds.map((x, k) => (
            <div key={x.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <Row>
                <i style={{ width: 12, height: 12, borderRadius: 6, background: color(k), alignSelf: 'center' }} />
                <select className="k-select" style={{ flex: '1 1 150px' }} value={x.type} onChange={(e) => edit(x.id, { type: e.target.value })} aria-label="Insulation type">
                  {[...WIRE_TYPES, 'Custom OD'].map((t) => <option key={t}>{t}</option>)}
                </select>
                {x.type === 'Custom OD' ? (
                  <input className="k-text" style={{ width: 90 }} type="number" min={0} step={0.01} value={x.od} onChange={(e) => edit(x.id, { od: Math.max(0, Number(e.target.value) || 0) })} aria-label="Outside diameter (in)" title="Outside diameter, inches" />
                ) : (
                  <select className="k-select" style={{ width: 120 }} value={x.size} onChange={(e) => edit(x.id, { size: e.target.value })} aria-label="Size">
                    {SIZES.map((z) => <option key={z} value={z}>{SIZE_LABEL(z)}</option>)}
                  </select>
                )}
                <input className="k-text" style={{ width: 64 }} type="number" min={0} value={x.qty} onChange={(e) => edit(x.id, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Quantity" />
                <Btn kind="ghost" onClick={() => set({ conds: s.conds.filter((y) => y.id !== x.id) })} title="Remove">✕</Btn>
              </Row>
              <Row>
                <Check label="Current-carrying" value={x.ccc} onChange={(v) => edit(x.id, { ccc: v })} />
                <span className="muted" style={{ fontSize: 12.5 }}>{x.qty} × {conductorArea(x).toFixed(4)} in² = {(x.qty * conductorArea(x)).toFixed(4)} in²</span>
              </Row>
            </div>
          ))}
          <div className="k-label" style={{ marginTop: 10 }}>Presets</div>
          <Row>
            {PRESETS.map(([n, list]) => <Btn key={n} onClick={() => set({ conds: list.map((x) => ({ ...x, id: uid() })) })}>{n}</Btn>)}
          </Row>
        </Panel>
        <Panel title="Derating (NEC 310.15(C)(1))">
          <Stats>
            <Stat label="Current-carrying" value={ccc} />
            <Stat label="Ampacity factor" value={pct(adjustment(ccc), 0)} tone={ccc > 3 ? 'bad' : 'good'} />
          </Stats>
          <Note>Neutrals carrying only unbalanced current and grounding conductors do not count. Untick them above.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Fill" value={pct(r.fill, 1)} tone={over ? 'bad' : 'good'} sub={`limit ${pct(r.limit, 0)} (${r.count} conductor${r.count === 1 ? '' : 's'})`} />
          <Stat label="Conductor area" value={`${r.wireArea.toFixed(4)} in²`} sub={`${(r.wireArea * MM2).toFixed(1)} mm²`} />
          <Stat label="Conduit area" value={`${r.conduitArea.toFixed(3)} in²`} sub={`${s.type} ${size}″`} />
          <Stat label={r.spare >= 0 ? 'Spare within limit' : 'Over the limit'} value={`${Math.abs(r.spare).toFixed(4)} in²`} tone={r.spare >= 0 ? 'accent' : 'bad'} sub={`${(Math.abs(r.spare) * MM2).toFixed(1)} mm²`} />
        </Stats>
        <Panel title="Cross-section">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <svg viewBox={`${-V / 2 - 8} ${-V / 2 - 8} ${V + 16} ${V + 16}`} style={{ width: 280, maxWidth: '100%' }} role="img" aria-label="conduit cross-section">
              <circle r={V / 2 + 5} fill="var(--muted)" opacity={0.35} />
              <circle r={V / 2} fill="var(--bg)" stroke="var(--grid-strong)" />
              {circles.map((p, i) => {
                const k = V / dia
                return (
                  <g key={i}>
                    <circle cx={p.x * k} cy={p.y * k} r={p.r * k - 0.5} fill={color(p.k)} opacity={p.bad ? 0.35 : 0.9} stroke={p.bad ? 'var(--err)' : 'rgb(0 0 0 / 0.35)'} strokeDasharray={p.bad ? '3 2' : undefined} />
                    <circle cx={p.x * k} cy={p.y * k} r={p.r * k * 0.55} fill="#d9a066" opacity={p.bad ? 0.3 : 0.85} />
                  </g>
                )
              })}
            </svg>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <b>Fill {pct(r.fill, 1)}</b>
                <span className="muted">max {pct(r.limit, 0)}</span>
              </div>
              <Bar value={r.fill} max={r.limit} color={tone} />
              <p style={{ fontSize: 13.5 }}>
                {over ? (
                  <b style={{ color: 'var(--err)' }}>Too full. {smallestSize(s.conds, s.type, s.nipple) ? `Use ${s.type} ${smallestSize(s.conds, s.type, s.nipple)}″ or larger.` : `No ${s.type} size is large enough; split the run.`}</b>
                ) : (
                  <b style={{ color: 'var(--ok)' }}>Passes NEC Chapter 9 Table 1.</b>
                )}
              </p>
              {circles.some((p) => p.bad) && !over && <p className="muted" style={{ fontSize: 12.5 }}>The drawing could not place every circle without overlap: a pull this tight is hard even if the code allows it.</p>}
              {equal3 && jam >= 2.8 && jam <= 3.2 && <Note tone="warn">Jam ratio {jam.toFixed(2)} (2.8–3.2): three equal conductors may wedge side by side at bends.</Note>}
              {equal3 && (jam < 2.8 || jam > 3.2) && <p className="muted" style={{ fontSize: 12.5 }}>Jam ratio {jam.toFixed(2)}: outside the 2.8–3.2 jamming range.</p>}
              <p className="muted" style={{ fontSize: 12.5 }}>Colours match the conductor rows; copper core drawn for scale.</p>
            </div>
          </div>
        </Panel>
        <Panel title="Smallest size per conduit type" actions={<CsvButton name="conduit-fill.csv" rows={() => [['Conduit', 'Trade size', 'Area in2', 'Fill %', 'OK'], ...Object.keys(CONDUITS).flatMap((t) => CONDUITS[t].map(([z]) => { const f = fill(s.conds, t, z, s.nipple); return [t, z, f.conduitArea, +(f.fill * 100).toFixed(2), f.ok ? 'yes' : 'no'] }))]} />}>
          <Table
            head={['Conduit', 'Smallest OK', 'Fill there', '']}
            rows={Object.keys(CONDUITS).map((t) => {
              const z = smallestSize(s.conds, t, s.nipple)
              const f = z ? fill(s.conds, t, z, s.nipple) : null
              return [
                <b key="t">{t}</b>,
                z ? `${z}″` : <span key="n" style={{ color: 'var(--err)' }}>none</span>,
                f ? pct(f.fill, 1) : '—',
                z && (t !== s.type || z !== size) ? <Btn key="u" kind="ghost" onClick={() => set({ type: t, size: z })}>Use</Btn> : t === s.type && z === size ? <span key="c" className="muted">current</span> : '',
              ]
            })}
          />
        </Panel>
        {biggest && biggest.type !== 'Custom OD' && (
          <Panel title={`Max conductors of one size in ${s.type} (Annex C style)`}>
            <Table
              head={['Conductor', ...sizes.slice(0, 7).map(([z]) => `${z}″`)]}
              rows={[...new Map(s.conds.filter((x) => x.type !== 'Custom OD').map((x) => [`${x.type}|${x.size}`, x])).values()].map((x) => [
                `${SIZE_LABEL(x.size)} ${x.type.split(' ')[0]}`,
                ...sizes.slice(0, 7).map(([z]) => maxSameSize(s.type, z, WIRES[x.type][SIZES.indexOf(x.size as (typeof SIZES)[number])])),
              ])}
            />
            <Note>Keep total bends between pull points to 360° or less. Counts round up when the remainder is ≥ 0.8, as in NEC Annex C. Areas come from Chapter 9 Tables 4 and 5; always confirm against your code edition.</Note>
          </Panel>
        )}
      </div>
    </Split>
  )
}
