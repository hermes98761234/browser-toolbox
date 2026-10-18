import { BarChart, Btn, Check, CsvButton, Donut, JsonButtons, money, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { cycle, fmtMin, type Machine, type Op, type OpType, type Units } from './lib/cycle-time-calculator'

interface State { m: Machine; ops: Op[] }

const TYPES: [OpType, string][] = [['face', 'Face mill'], ['mill', 'End mill / contour'], ['turn', 'Turning'], ['bore', 'Boring'], ['drill', 'Drilling'], ['tap', 'Tapping'], ['feed', 'Fixed feed rate']]
const mk = (p: Partial<Op>): Op => ({ id: uid(), name: 'Operation', type: 'mill', d: 10, z: 4, vc: 120, f: 0.05, len: 100, extra: 5, passes: 1, count: 1, rapid: 150, peck: 0, newTool: true, ...p })

const MILL: State = {
  m: { units: 'metric', maxRpm: 12000, rapidRate: 30000, toolChange: 5, handling: 45, setup: 40, batch: 25, rate: 75, tapReturn: 1.5 },
  ops: [
    mk({ name: 'Face top', type: 'face', d: 63, z: 5, vc: 250, f: 0.12, len: 160, extra: 70, passes: 2, rapid: 300 }),
    mk({ name: 'Rough pocket', type: 'mill', d: 12, z: 3, vc: 180, f: 0.06, len: 420, extra: 10, passes: 4, rapid: 200 }),
    mk({ name: 'Finish contour', type: 'mill', d: 10, z: 4, vc: 220, f: 0.04, len: 380, extra: 10, passes: 1, rapid: 150 }),
    mk({ name: 'Spot drill', type: 'drill', d: 8, z: 1, vc: 60, f: 0.08, len: 2, extra: 2, count: 6, rapid: 40 }),
    mk({ name: 'Drill Ø6.8', type: 'drill', d: 6.8, z: 1, vc: 80, f: 0.12, len: 18, extra: 2, count: 6, rapid: 40, peck: 7 }),
    mk({ name: 'Tap M8×1.25', type: 'tap', d: 8, z: 1, vc: 12, f: 1.25, len: 14, extra: 3, count: 6, rapid: 40 }),
  ],
}
const LATHE: State = {
  m: { units: 'metric', maxRpm: 4000, rapidRate: 20000, toolChange: 1.5, handling: 25, setup: 30, batch: 50, rate: 60, tapReturn: 1 },
  ops: [
    mk({ name: 'Face end', type: 'turn', d: 50, z: 1, vc: 200, f: 0.2, len: 26, extra: 2, passes: 1, rapid: 60 }),
    mk({ name: 'Rough OD', type: 'turn', d: 50, z: 1, vc: 220, f: 0.3, len: 85, extra: 2, passes: 4, rapid: 60, newTool: false }),
    mk({ name: 'Finish OD', type: 'turn', d: 42, z: 1, vc: 280, f: 0.1, len: 85, extra: 2, passes: 1, rapid: 60 }),
    mk({ name: 'Center drill + drill Ø10', type: 'drill', d: 10, z: 1, vc: 70, f: 0.15, len: 30, extra: 2, rapid: 80, peck: 10 }),
    mk({ name: 'Bore Ø16', type: 'bore', d: 16, z: 1, vc: 150, f: 0.1, len: 25, extra: 2, passes: 2, rapid: 60 }),
    mk({ name: 'Part off', type: 'turn', d: 42, z: 1, vc: 120, f: 0.06, len: 21, extra: 1, rapid: 60 }),
  ],
}

const U = {
  metric: { L: 'mm', vc: 'm/min', fz: 'mm/tooth', fr: 'mm/rev', pitch: 'mm', rate: 'mm/min' },
  inch: { L: 'in', vc: 'SFM', fz: 'in/tooth', fr: 'in/rev', pitch: 'in (1/TPI)', rate: 'in/min' },
}

function convert(s: State, to: Units): State {
  if (s.m.units === to) return s
  const k = to === 'inch' ? 1 / 25.4 : 25.4
  const kv = to === 'inch' ? 3.28084 : 1 / 3.28084
  const r = (x: number, d = 4) => Number(x.toPrecision(d))
  return {
    m: { ...s.m, units: to, rapidRate: r(s.m.rapidRate * k) },
    ops: s.ops.map((o) => ({ ...o, d: r(o.d * k), vc: r(o.type === 'feed' ? o.vc * k : o.vc * kv), f: r(o.f * k), len: r(o.len * k), extra: r(o.extra * k), rapid: r(o.rapid * k), peck: r(o.peck * k) })),
  }
}

function OpEditor({ o, u, onChange, onMove, onDup, onDel }: { o: Op; u: Units; onChange: (p: Partial<Op>) => void; onMove: (d: -1 | 1) => void; onDup: () => void; onDel: () => void }) {
  const L = U[u]
  const milling = o.type === 'face' || o.type === 'mill'
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10, marginBottom: 10 }}>
      <Row>
        <div style={{ flex: 2, minWidth: 160 }}><Txt label="Name" value={o.name} onChange={(name) => onChange({ name })} /></div>
        <div style={{ flex: 1, minWidth: 140 }}><Select label="Type" value={o.type} onChange={(type) => onChange({ type })} options={TYPES} /></div>
      </Row>
      <Row>
        {o.type !== 'feed' && <Num label={o.type === 'turn' || o.type === 'bore' ? 'Work Ø' : 'Tool Ø'} value={o.d} onChange={(d) => onChange({ d })} unit={L.L} min={0} />}
        {milling && <Num label="Teeth" value={o.z} onChange={(z) => onChange({ z })} min={1} step={1} />}
        <Num label={o.type === 'feed' ? 'Feed rate' : 'Cutting speed'} value={o.vc} onChange={(vc) => onChange({ vc })} unit={o.type === 'feed' ? L.rate : L.vc} min={0} />
        {o.type !== 'feed' && <Num label={o.type === 'tap' ? 'Pitch' : 'Feed'} value={o.f} onChange={(f) => onChange({ f })} unit={o.type === 'tap' ? L.pitch : milling ? L.fz : L.fr} min={0} />}
      </Row>
      <Row>
        <Num label={o.type === 'drill' || o.type === 'tap' ? 'Depth' : 'Length / pass'} value={o.len} onChange={(len) => onChange({ len })} unit={L.L} min={0} />
        <Num label="Approach + overrun" value={o.extra} onChange={(extra) => onChange({ extra })} unit={L.L} min={0} />
        {o.type !== 'drill' && o.type !== 'tap' && <Num label="Passes" value={o.passes} onChange={(passes) => onChange({ passes })} min={1} step={1} />}
        <Num label={o.type === 'drill' || o.type === 'tap' ? 'Holes' : 'Repeats'} value={o.count} onChange={(count) => onChange({ count })} min={1} step={1} />
        <Num label="Rapid / repeat" value={o.rapid} onChange={(rapid) => onChange({ rapid })} unit={L.L} min={0} />
        {o.type === 'drill' && <Num label="Peck (0 = none)" value={o.peck} onChange={(peck) => onChange({ peck })} unit={L.L} min={0} />}
      </Row>
      <Row>
        <Check label="Tool change before this op" value={o.newTool} onChange={(newTool) => onChange({ newTool })} />
        <span style={{ flex: 1 }} />
        <Btn kind="ghost" onClick={() => onMove(-1)} title="Move up">↑</Btn>
        <Btn kind="ghost" onClick={() => onMove(1)} title="Move down">↓</Btn>
        <Btn kind="ghost" onClick={onDup}>Duplicate</Btn>
        <Btn kind="danger" onClick={onDel}>Delete</Btn>
      </Row>
    </div>
  )
}

export default function CycleTimeCalculator() {
  const [s, set, reset] = useToolState<State>('cycle-time-calculator', MILL)
  const m = s.m, u = m.units
  const c = cycle(s.ops, m)
  const setM = (p: Partial<Machine>) => set({ m: { ...m, ...p } })
  const edit = (id: string, p: Partial<Op>) => set({ ops: s.ops.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= s.ops.length) return
    const ops = [...s.ops]
    ;[ops[i], ops[j]] = [ops[j], ops[i]]
    set({ ops })
  }
  const capped = c.rows.filter((r) => r.capped)
  const sec = (x: number) => x * 60

  return (
    <Split wide="left">
      <div>
        <Panel title="Machine & batch" actions={<>
          <Btn kind="ghost" onClick={() => set(convert(MILL, u))}>Milled bracket</Btn>
          <Btn kind="ghost" onClick={() => set(convert(LATHE, u))}>Turned shaft</Btn>
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <Seg value={u} onChange={(to) => set(convert(s, to))} options={[['metric', 'Metric (mm, m/min)'], ['inch', 'Inch (in, SFM)']]} />
          <Row>
            <Num label="Max spindle" value={m.maxRpm} onChange={(maxRpm) => setM({ maxRpm })} unit="rpm" min={0} />
            <Num label="Rapid traverse" value={m.rapidRate} onChange={(rapidRate) => setM({ rapidRate })} unit={U[u].rate} min={1} />
            <Num label="Tool change" value={m.toolChange} onChange={(toolChange) => setM({ toolChange })} unit="s" min={0} />
          </Row>
          <Row>
            <Num label="Load / unload" value={m.handling} onChange={(handling) => setM({ handling })} unit="s/part" min={0} />
            <Num label="Setup" value={m.setup} onChange={(setup) => setM({ setup })} unit="min/batch" min={0} />
            <Num label="Batch size" value={m.batch} onChange={(batch) => setM({ batch })} min={1} step={1} />
            <Num label="Shop rate" value={m.rate} onChange={(rate) => setM({ rate })} unit="/h" min={0} />
          </Row>
          <Num label="Tap retract speed ×" value={m.tapReturn} onChange={(tapReturn) => setM({ tapReturn })} min={0.1} hint="Many controls retract 1–2× faster than the tapping feed" />
        </Panel>
        <Panel title={`Operations (${s.ops.length})`} actions={<Btn kind="primary" onClick={() => set({ ops: [...s.ops, mk({ name: `Op ${s.ops.length + 1}` })] })}>+ Operation</Btn>}>
          {s.ops.map((o, i) => (
            <OpEditor key={o.id} o={o} u={u} onChange={(p) => edit(o.id, p)} onMove={(d) => move(i, d)} onDup={() => set({ ops: [...s.ops.slice(0, i + 1), { ...o, id: uid(), name: `${o.name} (copy)` }, ...s.ops.slice(i + 1)] })} onDel={() => set({ ops: s.ops.filter((x) => x.id !== o.id) })} />
          ))}
          {!s.ops.length && <Note>Add an operation to start.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Cycle time / part" value={fmtMin(c.part)} sub={`${num(c.perHour, 1)} parts/hour`} tone="accent" />
          <Stat label="Incl. setup share" value={fmtMin(c.perPart)} sub={`batch of ${m.batch}: ${fmtMin(c.batchMin)}`} />
          <Stat label="Cost / part" value={money(c.cost)} sub={`at ${money(m.rate, '$', 0)}/h`} />
          <Stat label="Spindle in cut" value={`${num(c.spindleUtil * 100, 0)} %`} sub="of cycle time" tone={c.spindleUtil > 0.6 ? 'good' : undefined} />
        </Stats>
        {capped.length > 0 && <Note tone="warn">Spindle speed limited to {m.maxRpm} rpm in: {capped.map((r) => r.name).join(', ')}. Feeds there are lower than the cutting data asks for.</Note>}
        <Panel title="Where the time goes">
          <Donut slices={[{ label: 'Cutting', value: sec(c.cut) }, { label: 'Rapid moves', value: sec(c.rapid) }, { label: 'Tool changes', value: sec(c.change) }, { label: 'Load / unload', value: sec(c.handling) }]} fv={(v) => fmtMin(v / 60)} center={<b>{fmtMin(c.part)}</b>} />
        </Panel>
        <Panel title="Per operation">
          <BarChart bars={c.rows.map((r) => ({ label: r.name, value: [sec(r.cut), sec(r.rapid), sec(r.change)] }))} stacks={[{ name: 'Cut' }, { name: 'Rapid' }, { name: 'Tool change' }]} fy={(v) => `${num(v, 0)} s`} />
        </Panel>
        <Panel title="Breakdown" actions={<>
          <CsvButton name="cycle-time.csv" rows={() => [['Operation', 'rpm', `Feed (${U[u].rate})`, 'Cut (s)', 'Rapid (s)', 'Tool change (s)', 'Total (s)'], ...c.rows.map((r) => [r.name, Math.round(r.rpm), num(r.feed, 1), num(sec(r.cut), 1), num(sec(r.rapid), 1), num(sec(r.change), 1), num(sec(r.total), 1)]), ['Load/unload', '', '', '', '', '', num(sec(c.handling), 1)], ['Total per part', '', '', '', '', '', num(sec(c.part), 1)]]} />
          <JsonButtons name="cycle-time.json" data={s} onLoad={(d) => d?.ops && d?.m && set(d)} />
        </>}>
          <Table
            head={['Operation', 'rpm', 'Cut', 'Rapid', 'Total']}
            rows={c.rows.map((r) => [<span key="n">{r.name}<br /><small className="muted">{num(r.feed, 1)} {U[u].rate}{r.change ? ' · tool change' : ''}</small></span>, r.rpm ? num(r.rpm, 0) : '—', fmtMin(r.cut), fmtMin(r.rapid), <b key="t">{fmtMin(r.total)}</b>])}
            foot={['Part (+ tool changes, load/unload)', '', fmtMin(c.cut), fmtMin(c.rapid), <b key="t">{fmtMin(c.part)}</b>]}
          />
          <p className="muted" style={{ fontSize: 12 }}>Estimates ignore acceleration and look-ahead slowdowns; real cycles typically run 5–15 % longer. Drill depth includes a 0.3·D point allowance; pecking adds retract rapids.</p>
        </Panel>
      </div>
    </Split>
  )
}
