import { Bar, Btn, Check, CsvButton, Note, num, Num, Panel, Ring, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ALLOW, BOXES, boxFill, CM3, type Device, type Fill, type Gauge, GAUGES, KIND_COUNT, maxConductors, type Wire, type WireKind } from './lib/box-fill-calculator'

interface State extends Fill { box: number; custom: number; useCustom: boolean; ring: number; metric: boolean }

const PRESETS: Record<string, Partial<State>> = {
  'Switch, end of run (14/2 ×2)': { wires: [{ gauge: '14', qty: 4, kind: 'terminated' }], egc: true, egcGauge: '14', clamps: true, fittings: 0, devices: [{ gangs: 1, gauge: '14' }], box: 14, useCustom: false, ring: 0, isoEgc: false },
  'Receptacle, mid-run (12/2 ×2)': { wires: [{ gauge: '12', qty: 4, kind: 'terminated' }, { gauge: '12', qty: 2, kind: 'internal' }], egc: true, egcGauge: '12', clamps: true, fittings: 0, devices: [{ gangs: 1, gauge: '12' }], box: 13, useCustom: false, ring: 0, isoEgc: false },
  '2-gang: switch + GFCI (12/2 ×3)': { wires: [{ gauge: '12', qty: 6, kind: 'terminated' }], egc: true, egcGauge: '12', clamps: false, fittings: 0, devices: [{ gangs: 1, gauge: '12' }, { gangs: 1, gauge: '12' }], box: 5, useCustom: false, ring: 6.0, isoEgc: false },
  'Ceiling fan/light (14/3 + 14/2)': { wires: [{ gauge: '14', qty: 5, kind: 'terminated' }, { gauge: '18', qty: 3, kind: 'terminated' }], egc: true, egcGauge: '14', clamps: true, fittings: 1, devices: [], box: 2, useCustom: false, ring: 0, isoEgc: false },
}

const DEF: State = {
  wires: [{ gauge: '12', qty: 4, kind: 'terminated' }, { gauge: '12', qty: 2, kind: 'through' }],
  egc: true, egcGauge: '12', isoEgc: false, isoGauge: '12', clamps: true, fittings: 0,
  devices: [{ gangs: 1, gauge: '12' }],
  box: 5, custom: 22.5, useCustom: false, ring: 0, metric: false,
}
const KIND_LABEL: [WireKind, string][] = [['terminated', 'Spliced/terminated · 1'], ['through', 'Passes through · 1'], ['loop', 'Loop ≥ 12 in · 2'], ['internal', 'Pigtail (stays in box) · 0']]
const G = GAUGES.map((g) => [g, `${g} AWG (${ALLOW[g].toFixed(2)} in³)`] as [Gauge, string])

export default function BoxFillCalculator() {
  const [s, set, reset] = useToolState('box-fill-calculator', DEF)
  const r = boxFill(s)
  const base = s.useCustom ? s.custom : BOXES[s.box]?.[2] ?? 0
  const avail = base + s.ring
  const ok = avail >= r.required - 1e-9
  const v = (x: number) => (s.metric ? `${num(x * CM3, 0)} cm³` : `${num(x, 2)} in³`)
  const setWire = (i: number, p: Partial<Wire>) => set({ wires: s.wires.map((w, j) => (j === i ? { ...w, ...p } : w)) })
  const setDev = (i: number, p: Partial<Device>) => set({ devices: s.devices.map((d, j) => (j === i ? { ...d, ...p } : d)) })
  const totalCount = r.items.reduce((a, x) => a + x.count, 0)
  const fits = BOXES.map((b, i) => ({ b, i })).filter(({ b }) => b[2] + s.ring >= r.required).sort((a, b) => a.b[2] - b.b[2])
  const sameCat = fits.filter(({ b }) => b[0] === BOXES[s.box]?.[0])
  const suggest = (sameCat[0] ?? fits[0])

  return (
    <Split>
      <div>
        <Panel title="Quick start">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <Btn key={k} onClick={() => set(p)}>{k}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Conductors entering the box" actions={<Btn onClick={() => set({ wires: [...s.wires, { gauge: '14', qty: 2, kind: 'terminated' }] })}>+ Row</Btn>}>
          {s.wires.map((w, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 1.6fr 32px', gap: 6, alignItems: 'end', marginBottom: 6 }}>
              <label className="k-field" style={{ margin: 0 }}><span className="k-label">Qty</span><input className="k-text" type="number" min={0} value={w.qty} onChange={(e) => setWire(i, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></label>
              <label className="k-field" style={{ margin: 0 }}><span className="k-label">Size</span>
                <select className="k-select" value={w.gauge} onChange={(e) => setWire(i, { gauge: e.target.value as Gauge })}>{GAUGES.map((g) => <option key={g} value={g}>{g} AWG</option>)}</select></label>
              <label className="k-field" style={{ margin: 0 }}><span className="k-label">How it’s run</span>
                <select className="k-select" value={w.kind} onChange={(e) => setWire(i, { kind: e.target.value as WireKind })}>{KIND_LABEL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <Btn kind="ghost" title="Remove" onClick={() => set({ wires: s.wires.filter((_, j) => j !== i) })}>✕</Btn>
            </div>
          ))}
          <p className="k-hint" style={{ margin: '4px 0 0' }}>Count insulated conductors only (hot, neutral, travelers). A 12/2 cable = 2 conductors + ground. Fixture wires under 14 AWG from a luminaire canopy (max 4 + EGC) may be exempt.</p>
        </Panel>
        <Panel title="Grounds, clamps, fittings">
          <Row>
            <Check label="Equipment grounds present" value={s.egc} onChange={(egc) => set({ egc })} />
            {s.egc && <Select label="Largest EGC" value={s.egcGauge} onChange={(egcGauge: Gauge) => set({ egcGauge })} options={G} />}
          </Row>
          <Row>
            <Check label="Isolated-ground EGCs (IG receptacles)" value={s.isoEgc} onChange={(isoEgc) => set({ isoEgc })} />
            {s.isoEgc && <Select label="Largest IG EGC" value={s.isoGauge} onChange={(isoGauge: Gauge) => set({ isoGauge })} options={G} />}
          </Row>
          <Check label="Internal cable clamps (any number)" value={s.clamps} onChange={(clamps) => set({ clamps })} />
          <Num label="Support fittings — number of different types (fixture stud, hickey…)" value={s.fittings} min={0} step={1} onChange={(f) => set({ fittings: Math.max(0, Math.round(f)) })} />
        </Panel>
        <Panel title="Devices (switches, receptacles…)" actions={<Btn onClick={() => set({ devices: [...s.devices, { gangs: 1, gauge: r.largest ?? '14' }] })}>+ Device</Btn>}>
          {s.devices.length === 0 && <p className="muted" style={{ margin: 0 }}>No devices — e.g. a junction or luminaire box.</p>}
          {s.devices.map((d, i) => (
            <Row key={i}>
              <b style={{ alignSelf: 'center' }}>#{i + 1}</b>
              <Select label="Width" value={d.gangs} onChange={(gangs: number) => setDev(i, { gangs })} options={[[1, 'Single yoke'], [2, 'Wider than 2 in: 2 gangs'], [3, '3 gangs']]} />
              <Select label="Largest wire connected" value={d.gauge} onChange={(gauge: Gauge) => setDev(i, { gauge })} options={G} />
              <Btn kind="ghost" onClick={() => set({ devices: s.devices.filter((_, j) => j !== i) })}>✕</Btn>
            </Row>
          ))}
        </Panel>
        <Panel title="Box" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.useCustom ? 'custom' : 'std'} onChange={(m) => set({ useCustom: m === 'custom' })} options={[['std', 'Standard metal box'], ['custom', 'Marked volume']]} />
          <div style={{ marginTop: 8 }}>
            {s.useCustom ? (
              <Num label="Volume marked on box (nonmetallic, etc.)" unit="in³" value={s.custom} min={0} onChange={(custom) => set({ custom })} />
            ) : (
              <Select label="Box (NEC Table 314.16(A))" value={s.box} onChange={(box: number) => set({ box })} options={BOXES.map((b, i) => [i, `${b[1]} — ${b[2]} in³`] as [number, string])} />
            )}
          </div>
          <Num label="Plaster ring / extension ring / raised cover (marked volume)" unit="in³" value={s.ring} min={0} onChange={(ring) => set({ ring })} />
          <Check label="Show metric (cm³)" value={s.metric} onChange={(metric) => set({ metric })} />
        </Panel>
      </div>
      <div>
        <Panel title="Result">
          <Row wrap={false}>
            <Ring value={avail ? r.required / avail : 1} size={120} color={ok ? 'var(--ok)' : 'var(--err)'} label={<>{avail ? Math.round((r.required / avail) * 100) : '—'}%<br /><small style={{ fontWeight: 600, fontSize: 11 }}>full</small></>} />
            <div style={{ flex: 1 }}>
              {ok ? <Note tone="ok"><b>PASS.</b> {v(avail - r.required)} to spare.</Note> : <Note tone="err"><b>FAIL — overfilled by {v(r.required - avail)}.</b> Use a bigger box or add an extension ring.</Note>}
              {!ok && suggest && <p style={{ margin: 0 }}>Smallest box that fits: <b>{suggest.b[1]}</b> ({v(suggest.b[2])}){s.ring ? ' with the same ring' : ''}. <Btn onClick={() => set({ box: suggest.i, useCustom: false })}>Use it</Btn></p>}
            </div>
          </Row>
        </Panel>
        <Stats>
          <Stat label="Required" value={v(r.required)} sub={`${totalCount} conductor equivalents`} tone="accent" />
          <Stat label="Available" value={v(avail)} sub={s.ring ? `box ${v(base)} + ring ${v(s.ring)}` : 'box volume'} tone={ok ? 'good' : 'bad'} />
          <Stat label="Largest conductor" value={r.largest ? `${r.largest} AWG` : '—'} sub="used for clamps & fittings" />
        </Stats>
        <Panel title="Calculation (NEC 314.16(B))" actions={<CsvButton name="box-fill.csv" rows={() => [['Item', 'Count', 'Size AWG', 'in³ each', 'Volume in³'], ...r.items.map((x) => [x.label, x.count, x.gauge, ALLOW[x.gauge], x.volume]), ['Total', totalCount, '', '', r.required], ['Available', '', '', '', avail]]} />}>
          <Table
            head={['Item', 'Count', 'Each', 'Volume']}
            rows={r.items.map((x) => [x.label, x.count, `${ALLOW[x.gauge].toFixed(2)} (${x.gauge})`, <b key="v">{v(x.volume)}</b>])}
            foot={['Required', totalCount, '', v(r.required)]}
          />
        </Panel>
        <Panel title="Capacity of this box">
          <Table
            head={['Wire size', 'Each', 'Max conductors (same size)', '']}
            rows={GAUGES.map((g) => [`${g} AWG`, `${ALLOW[g].toFixed(2)} in³`, maxConductors(avail, g), <Bar key="b" value={maxConductors(avail, g)} max={maxConductors(avail, '18') || 1} />])}
          />
          <p className="k-hint">Counts per Table 314.16(A) assume all conductors are the same size, with no clamps, fittings, devices or grounds deducted.</p>
        </Panel>
        <Note>
          Rules applied: each conductor from outside = 1 ({KIND_COUNT.terminated}); unbroken loops ≥ 12 in = 2; pigtails = 0; all EGCs = 1 (largest); clamps = 1; each fitting type = 1; each device yoke = 2 (largest wire connected). Always confirm with the code edition adopted locally.
        </Note>
      </div>
    </Split>
  )
}
