import { Bar, BarChart, Btn, CsvButton, JsonButtons, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { CFM, FRICTION_IP, FT, IN, INWG, sizeSection, VLIMIT, type Section } from './lib/duct-sizing-calculator'

type Units = 'si' | 'ip'
interface State {
  units: Units
  /** friction rate, Pa/m */
  rate: number
  eps: number
  /** max rectangular height, m */
  rectH: number
  mode: 'up' | 'nearest'
  equip: number
  sections: Section[]
}

const MATERIALS: [number, string][] = [
  [0.00009, 'Galvanized steel (0.09 mm)'],
  [0.00015, 'Galvanized, spiral seam (0.15 mm)'],
  [0.0009, 'Flexible duct, extended (0.9 mm)'],
  [0.003, 'Flexible duct, compressed (3 mm)'],
  [0.0015, 'Concrete / masonry (1.5 mm)'],
  [0.0000015, 'PVC / smooth plastic (0.0015 mm)'],
  [0.0009, 'Fibreglass duct board (0.9 mm)'],
]

const S = (name: string, m3h: number, len: number, k: number, kind: Section['kind'], path = true): Section => ({ id: uid(), name, q: m3h / 3600, len, k, kind, path })
const DEF: State = {
  units: 'si',
  rate: 1.0,
  eps: 0.00009,
  rectH: 0.3,
  mode: 'up',
  equip: 150,
  sections: [
    S('AHU → T1 main trunk', 2400, 12, 0.6, 'main'),
    S('T1 → T2 trunk', 1600, 8, 0.3, 'main'),
    S('T2 → T3 trunk', 900, 8, 0.3, 'main'),
    S('Branch: meeting room', 800, 5, 1.1, 'branch', false),
    S('Branch: open office', 450, 6, 1.2, 'branch'),
    S('Runout to diffuser', 225, 3, 1.8, 'runout'),
  ],
}

export default function DuctSizingCalculator() {
  const [s, set, reset] = useToolState('duct-sizing-calculator', DEF)
  const si = s.units === 'si'
  // display ⇄ SI conversions
  const qOut = (q: number) => (si ? q * 3600 : q / CFM)
  const qIn = (v: number) => (si ? v / 3600 : v * CFM)
  const lOut = (m: number) => (si ? m : m / FT)
  const lIn = (v: number) => (si ? v : v * FT)
  const rOut = (r: number) => (si ? r : r / FRICTION_IP)
  const rIn = (v: number) => (si ? v : v * FRICTION_IP)
  const dOut = (m: number) => (si ? `${num(m * 1000, 0)}` : `${num(m / IN, 1)}`)
  const vOut = (v: number) => (si ? `${num(v, 2)} m/s` : `${num(v / 0.00508, 0)} fpm`)
  const pOut = (p: number) => (si ? `${num(p, 1)} Pa` : `${num(p / INWG, 3)} in.wg`)
  const dU = si ? 'mm' : 'in'

  const res = s.sections.map((x) => ({ x, r: sizeSection(x, { rate: s.rate, eps: s.eps, metric: si, rectH: s.rectH, mode: s.mode }) }))
  const path = res.filter(({ x }) => x.path)
  const ductTotal = path.reduce((a, { r }) => a + r.total, 0)
  const total = ductTotal + s.equip
  const fast = res.filter(({ r }) => !r.vOk)
  const edit = (id: string, p: Partial<Section>) => set({ sections: s.sections.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const inp = (v: number, f: (n: number) => void, w = 72, label = '') => (
    <input type="number" step="any" min={0} value={Number(v.toFixed(4))} onChange={(e) => f(Math.max(0, Number(e.target.value) || 0))} style={{ width: w }} aria-label={label} />
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Design basis">
          <Seg label="Units" value={s.units} onChange={(units) => set({ units })} options={[['si', 'SI (m³/h, Pa)'], ['ip', 'IP (cfm, in.wg)']]} />
          <Num label="Design friction rate" value={Number(rOut(s.rate).toFixed(4))} onChange={(v) => set({ rate: rIn(v) })} unit={si ? 'Pa/m' : 'in.wg/100 ft'} min={0.01} hint={si ? 'Typical 0.8–1.2 Pa/m for low-pressure supply; 0.5–0.8 for quiet systems.' : 'Typical 0.08–0.10 in.wg/100 ft for residential/low-pressure.'} />
          <Row>
            <button type="button" className="k-btn" onClick={() => set({ rate: si ? 0.6 : 0.06 * FRICTION_IP })}>Quiet</button>
            <button type="button" className="k-btn" onClick={() => set({ rate: si ? 1.0 : 0.1 * FRICTION_IP })}>Standard</button>
            <button type="button" className="k-btn" onClick={() => set({ rate: si ? 1.6 : 0.15 * FRICTION_IP })}>Compact</button>
          </Row>
          <Select label="Duct material (roughness)" value={MATERIALS.findIndex((m) => m[0] === s.eps)} onChange={(i) => set({ eps: MATERIALS[i]?.[0] ?? 0.00009 })} options={MATERIALS.map((m, i) => [i, m[1]] as const)} />
          <Num label="Max. rectangular duct height" value={Number((si ? s.rectH * 1000 : s.rectH / IN).toFixed(2))} onChange={(v) => set({ rectH: si ? v / 1000 : v * IN })} unit={dU} min={50 * (si ? 1 : 0.04)} hint="Ceiling-void limit; width is solved for equal friction (Huebscher)." />
          <Seg label="Standard size" value={s.mode} onChange={(mode) => set({ mode })} options={[['up', 'Next size up'], ['nearest', 'Nearest size']]} />
          <Num label="Equipment & terminal losses (filter, coil, diffuser)" value={Number((si ? s.equip : s.equip / INWG).toFixed(3))} onChange={(v) => set({ equip: si ? v : v * INWG })} unit={si ? 'Pa' : 'in.wg'} min={0} />
        </Panel>
        <Panel title="Velocity limits used">
          <Table head={['Section type', 'Max velocity']} rows={(Object.keys(VLIMIT) as (keyof typeof VLIMIT)[]).map((k) => [k, vOut(VLIMIT[k])])} />
          <Note>Equal friction gives every section the same pressure drop per length; the index run (ticked “path”) sets the fan pressure. Fittings use ΔP = ΣK × velocity pressure.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Index-run duct loss" value={pOut(ductTotal)} sub={`${path.length} sections`} />
          <Stat label="Fan static (incl. equipment)" value={pOut(total)} tone="accent" sub={si ? `${num(total / INWG, 2)} in.wg` : `${num(total, 0)} Pa`} />
          <Stat label="Supply airflow" value={`${num(qOut(Math.max(0, ...s.sections.map((x) => x.q))), 0)} ${si ? 'm³/h' : 'cfm'}`} sub={si ? `${num(Math.max(0, ...s.sections.map((x) => x.q)) * 1000, 0)} L/s` : ''} />
          <Stat label="Velocity check" value={fast.length ? `${fast.length} too fast` : 'All OK'} tone={fast.length ? 'bad' : 'good'} sub={fast.length ? fast.map(({ x }) => x.name).join(', ') : 'within limits'} />
        </Stats>
        <Panel
          title="Duct sections"
          actions={
            <>
              <Btn onClick={() => set({ sections: [...s.sections, S('New section', 300, 5, 0.5, 'branch')] })}>+ Section</Btn>
              <CsvButton
                name="duct-sizing.csv"
                rows={() => [
                  ['Section', `Airflow (${si ? 'm3/h' : 'cfm'})`, `Length (${si ? 'm' : 'ft'})`, 'Sum K', `Calc dia (${dU})`, `Round (${dU})`, `Rect W x H (${dU})`, 'Velocity', 'Friction', 'Fittings', 'Total', 'On path'],
                  ...res.map(({ x, r }) => [x.name, qOut(x.q).toFixed(1), lOut(x.len).toFixed(2), x.k, dOut(r.dCalc), dOut(r.dStd), `${dOut(r.rect.w)} x ${dOut(r.rect.h)}`, vOut(r.flow.v), pOut(r.friction), pOut(r.fittings), pOut(r.total), x.path ? 'yes' : 'no']),
                ]}
              />
              <JsonButtons name="duct-sizing.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Section', `Flow ${si ? 'm³/h' : 'cfm'}`, `Len ${si ? 'm' : 'ft'}`, 'ΣK', 'Type', 'Path', '']}
            rows={s.sections.map((x) => [
              <input key="n" value={x.name} onChange={(e) => edit(x.id, { name: e.target.value })} aria-label="Section name" style={{ minWidth: 150 }} />,
              inp(qOut(x.q), (v) => edit(x.id, { q: qIn(v) }), 80, 'Airflow'),
              inp(lOut(x.len), (v) => edit(x.id, { len: lIn(v) }), 60, 'Length'),
              inp(x.k, (v) => edit(x.id, { k: v }), 56, 'Fitting K'),
              <select key="t" value={x.kind} onChange={(e) => edit(x.id, { kind: e.target.value as Section['kind'] })} aria-label="Type" style={{ minWidth: 96 }}>
                <option value="main">Main</option>
                <option value="branch">Branch</option>
                <option value="runout">Runout</option>
              </select>,
              <input key="p" type="checkbox" checked={x.path} onChange={(e) => edit(x.id, { path: e.target.checked })} aria-label="On index run" />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ sections: s.sections.filter((y) => y.id !== x.id) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>ΣK examples: 90° smooth elbow 0.2–0.3, mitred elbow 1.2, branch take-off 0.5–1.0, transition 0.1, damper (open) 0.2.</p>
        </Panel>
        <Panel title="Sizes and pressure drop">
          <Table
            head={[`Calc Ø ${dU}`, `Round ${dU}`, `Rect ${dU}`, 'Velocity', 'Friction', 'Fittings', 'Total']}
            rows={res.map(({ x, r }) => [
              <span key="c" title={x.name}>{dOut(r.dCalc)}<br /><span className="muted" style={{ fontSize: 11 }}>{x.name.slice(0, 22)}</span></span>,
              <b key="r">Ø {dOut(r.dStd)}</b>,
              `${dOut(r.rect.w)} × ${dOut(r.rect.h)}`,
              <div key="v" style={{ minWidth: 110, display: 'grid', gap: 3 }}>
                <span style={{ color: r.vOk ? undefined : 'var(--err)', fontWeight: 700 }}>{vOut(r.flow.v)}</span>
                <Bar value={r.flow.v} max={VLIMIT[x.kind] * 1.25} color={r.vOk ? 'var(--ok)' : 'var(--err)'} />
              </div>,
              pOut(r.friction),
              pOut(r.fittings),
              <b key="t" style={{ opacity: x.path ? 1 : 0.55 }}>{pOut(r.total)}</b>,
            ])}
            foot={['', '', '', '', '', 'Index run', pOut(ductTotal)]}
          />
          {fast.length > 0 && <Note tone="warn">Velocity above the limit causes noise. Lower the friction rate or upsize: {fast.map(({ x }) => x.name).join(', ')}.</Note>}
        </Panel>
        <Panel title="Pressure drop along the index run">
          <BarChart bars={path.map(({ x, r }) => ({ label: x.name.split(/[:→]/).pop()!.trim(), value: [si ? r.friction : r.friction / INWG, si ? r.fittings : r.fittings / INWG] }))} stacks={[{ name: 'Straight duct' }, { name: 'Fittings' }]} fy={(v) => (si ? `${num(v, 0)} Pa` : num(v, 3))} />
        </Panel>
      </div>
    </Split>
  )
}
