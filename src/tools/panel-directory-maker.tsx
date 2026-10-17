import { useMemo } from 'react'
import { Bar, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fits, leg, occupancy, slotRange, summarize, type Circuit, type Circuits, type Kind } from './lib/panel-directory-maker'

const AMPS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 125]
const KINDS: [Kind, string][] = [['std', 'Standard'], ['gfci', 'GFCI'], ['afci', 'AFCI'], ['dual', 'Dual (AF+GF)'], ['spare', 'Spare']]
const BADGE: Record<Kind, string> = { std: '', gfci: 'GFCI', afci: 'AFCI', dual: 'AF/GF', spare: '' }
const LEGC: Record<string, string> = { A: '#ef4444', B: '#0ea5e9', C: '#10b981' }

const c = (label: string, amps: number, poles: 1 | 2 | 3 = 1, kind: Kind = 'std'): Circuit => ({ label, amps, poles, kind })

const DEF = {
  title: 'Main Panel',
  location: 'Garage, north wall',
  main: 200,
  system: '1' as '1' | '3',
  date: new Date().toISOString().slice(0, 10),
  slots: 30,
  font: 'm' as 's' | 'm' | 'l',
  showAmps: true,
  showLegs: false,
  upper: false,
  circuits: {
    1: c('Range / Oven', 50, 2),
    2: c('Kitchen counter (left)', 20, 1, 'gfci'),
    4: c('Kitchen counter (right)', 20, 1, 'gfci'),
    5: c('Dryer', 30, 2),
    6: c('Dishwasher', 20, 1, 'dual'),
    8: c('Refrigerator', 20),
    9: c('A/C condenser', 40, 2),
    10: c('Microwave', 20),
    12: c('Bathrooms', 20, 1, 'gfci'),
    13: c('Water heater', 30, 2),
    14: c('Laundry', 20, 1, 'dual'),
    16: c('Primary bedroom', 15, 1, 'afci'),
    17: c('Furnace / air handler', 15),
    18: c('Bedrooms 2 & 3', 15, 1, 'afci'),
    19: c('Garage & outdoor', 20, 1, 'gfci'),
    20: c('Living room', 15, 1, 'afci'),
    21: c('EV charger', 50, 2),
    22: c('Dining & hall lights', 15, 1, 'afci'),
    24: c('Office', 15, 1, 'afci'),
    25: c('Sump pump', 15),
    26: c('Smoke detectors', 15, 1, 'afci'),
    28: c('Spare', 20, 1, 'spare'),
  } as Circuits,
}

const FONT = { s: 10, m: 12, l: 14 }

export default function PanelDirectoryMaker() {
  const [s, set, reset] = useToolState('panel-directory-maker', DEF)
  const phases = s.system === '3' ? 3 : 1
  const occ = useMemo(() => occupancy(s.slots, s.circuits), [s.slots, s.circuits])
  const sum = useMemo(() => summarize(s.slots, s.circuits, phases), [s.slots, s.circuits, phases])
  const rows = Math.ceil(s.slots / 2)
  const orphan = Object.keys(s.circuits).map(Number).filter((n) => n > s.slots || occ.get(n) !== n)

  const put = (slot: number, ci: Circuit | null) => {
    const next = { ...s.circuits }
    if (ci) next[slot] = ci
    else delete next[slot]
    set({ circuits: next })
  }
  const txt = (t: string) => (s.upper ? t.toUpperCase() : t)

  const cell = (slot: number) => {
    if (slot > s.slots) return <div />
    const start = occ.get(slot)
    const L = leg(slot, phases)
    const num = (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 24, borderRadius: 6, fontWeight: 700, fontSize: 12, background: 'var(--line)', borderLeft: `3px solid ${LEGC[L]}` }} title={`Leg ${L}`}>
        {slot}
      </span>
    )
    if (start !== undefined && start !== slot)
      return (
        <div className="pdm-cell" style={{ opacity: 0.65 }}>
          <Row wrap={false}>{num}<span className="muted" style={{ fontSize: 12 }}>↳ pole of #{start} {s.circuits[start].label}</span></Row>
        </div>
      )
    const ci = start === slot ? s.circuits[slot] : undefined
    if (!ci)
      return (
        <div className="pdm-cell">
          <Row wrap={false}>{num}<Btn kind="ghost" onClick={() => put(slot, c('', 20))}>+ Add circuit</Btn></Row>
        </div>
      )
    const edit = (p: Partial<Circuit>) => put(slot, { ...ci, ...p })
    return (
      <div className="pdm-cell" style={{ background: ci.kind === 'spare' ? 'transparent' : undefined }}>
        <Row wrap={false}>
          {num}
          <input value={ci.label} placeholder="Circuit name" onChange={(e) => edit({ label: e.target.value })} aria-label={`Slot ${slot} name`} style={{ flex: 1, minWidth: 0 }} />
          <Btn kind="ghost" title="Clear" onClick={() => put(slot, null)}>✕</Btn>
        </Row>
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <select value={ci.amps} onChange={(e) => edit({ amps: Number(e.target.value) })} aria-label="Amps">
            {AMPS.map((a) => (
              <option key={a} value={a}>{a} A</option>
            ))}
          </select>
          <select value={ci.poles} onChange={(e) => edit({ poles: Number(e.target.value) as 1 | 2 | 3 })} aria-label="Poles">
            {[1, 2, 3].filter((p) => p <= phases + 1 || p === 1).map((p) => (
              <option key={p} value={p} disabled={p !== ci.poles && !fits(s.slots, s.circuits, slot, p)}>{p}-pole</option>
            ))}
          </select>
          <select value={ci.kind} onChange={(e) => edit({ kind: e.target.value as Kind })} aria-label="Type">
            {KINDS.map(([k, n]) => (
              <option key={k} value={k}>{n}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  // printable rows: per side, skip covered slots and use rowSpan for multi-pole breakers
  const side = (slot: number) => {
    if (slot > s.slots) return [<td key="e" colSpan={s.showAmps ? 3 : 2} />]
    const start = occ.get(slot)
    if (start !== undefined && start !== slot) return []
    const ci = start === slot ? s.circuits[slot] : undefined
    const span = ci?.poles ?? 1
    const L = leg(slot, phases)
    return [
      <td key="n" rowSpan={span} className="pdm-n">{ci ? slotRange(slot, ci.poles) : slot}{s.showLegs && <sup>{L}</sup>}</td>,
      <td key="l" rowSpan={span} className="pdm-l">
        {ci ? (ci.kind === 'spare' ? <i style={{ color: '#888' }}>{txt('Spare')}</i> : txt(ci.label || '—')) : ''}
        {ci && BADGE[ci.kind] && <span className="pdm-b">{BADGE[ci.kind]}</span>}
      </td>,
      ...(s.showAmps ? [<td key="a" rowSpan={span} className="pdm-a">{ci ? `${ci.amps}${ci.poles > 1 ? `/${ci.poles}P` : ''}` : ''}</td>] : []),
    ]
  }

  const legMax = Math.max(1, ...Object.values(sum.perLeg))

  return (
    <Split wide="right">
      <div>
        <Panel title="Panel" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Txt label="Location / served area" value={s.location} onChange={(location) => set({ location })} />
          <Row>
            <Num label="Main breaker" value={s.main} onChange={(main) => set({ main })} unit="A" min={0} />
            <Select label="Spaces" value={s.slots} onChange={(slots) => set({ slots })} options={[8, 12, 16, 20, 24, 30, 32, 40, 42, 54, 60]} />
          </Row>
          <span className="k-label">System</span>
          <Seg value={s.system} onChange={(system) => set({ system })} options={[['1', '120/240 V split-phase'], ['3', '208Y/120 V 3-phase']]} />
          <label className="k-field" style={{ marginTop: 10 }}>
            <span className="k-label">Updated on</span>
            <input className="k-text" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </Panel>
        <Panel title="Label style">
          <Seg value={s.font} onChange={(font) => set({ font })} options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} />
          <Check label="Show breaker amps" value={s.showAmps} onChange={(showAmps) => set({ showAmps })} />
          <Check label="Show leg / phase letters" value={s.showLegs} onChange={(showLegs) => set({ showLegs })} />
          <Check label="UPPERCASE names" value={s.upper} onChange={(upper) => set({ upper })} />
        </Panel>
        <Panel title="Balance (connected breaker amps)">
          {Object.entries(sum.perLeg).map(([L, a]) => (
            <div key={L} style={{ marginBottom: 8 }}>
              <Row wrap={false}><b style={{ flex: 1, color: LEGC[L] }}>Leg {L}</b><span>{a} A</span></Row>
              <Bar value={a} max={legMax} color={LEGC[L]} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Breaker ratings, not measured load: a rough check that big circuits are spread across legs. Multi-pole breakers count on every leg they touch.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Spaces used" value={`${sum.used} / ${s.slots}`} tone="accent" />
          <Stat label="Free spaces" value={sum.free} sub={sum.free < 3 ? 'nearly full' : undefined} tone={sum.free < 3 ? 'bad' : undefined} />
          <Stat label="Breakers" value={sum.breakers} sub={`${sum.multi} multi-pole`} />
          <Stat label="Main" value={`${s.main} A`} sub={s.system === '3' ? '3-phase' : 'split-phase'} />
        </Stats>
        {orphan.length > 0 && (
          <Note tone="warn">
            Hidden circuits (beyond {s.slots} spaces or overlapped): {orphan.map((n) => `#${n} ${s.circuits[n].label}`).join(', ')}.{' '}
            <Btn kind="ghost" onClick={() => set({ circuits: Object.fromEntries(Object.entries(s.circuits).filter(([k]) => !orphan.includes(Number(k)))) })}>Remove them</Btn>
          </Note>
        )}
        <Panel
          title="Slot editor"
          actions={
            <>
              <CsvButton name="panel-directory.csv" rows={() => [['Slot', 'Circuit', 'Amps', 'Poles', 'Type', 'Leg'], ...[...occ].filter(([a, b]) => a === b).sort((x, y) => x[0] - y[0]).map(([n]) => { const ci = s.circuits[n]; return [slotRange(n, ci.poles), ci.label, ci.amps, ci.poles, ci.kind, leg(n, phases)] })]} />
              <JsonButtons name="panel-directory.json" data={s} onLoad={(d) => set(d)} />
            </>
          }
        >
          <style>{`.pdm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pdm-cell{border:1px solid var(--line);border-radius:10px;padding:6px;min-height:40px;background:var(--panel)}.pdm-cell input,.pdm-cell select{font:inherit;font-size:13px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}@media (max-width:640px){.pdm-grid{grid-template-columns:1fr}}`}</style>
          <div className="pdm-grid">
            {Array.from({ length: rows }, (_, i) => [cell(2 * i + 1), cell(2 * i + 2)]).flat().map((el, i) => (
              <div key={i}>{el}</div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Odd spaces are on the left, even on the right (standard North-American numbering). A 2-pole breaker at 5 also takes space 7.</p>
        </Panel>
        <Panel title="Printable directory" actions={<Btn kind="primary" onClick={() => window.print()}>🖨 Print</Btn>}>
          <style>{`@media print{body *{visibility:hidden}.pdm-card,.pdm-card *{visibility:visible}.pdm-card{position:absolute;inset:0 0 auto 0;margin:0 !important;box-shadow:none !important}}.pdm-card{background:#fff;color:#111;border:2px solid #111;border-radius:6px;padding:10px;max-width:720px;margin:0 auto}.pdm-card table{width:100%;border-collapse:collapse;table-layout:fixed}.pdm-card td{border:1px solid #333;padding:2px 5px;vertical-align:middle;overflow:hidden;word-wrap:break-word}.pdm-n{width:54px;text-align:center;font-weight:700;background:#f1f1f1}.pdm-a{width:52px;text-align:center;font-family:monospace}.pdm-b{margin-left:4px;font-size:.75em;border:1px solid #333;border-radius:3px;padding:0 3px}.pdm-mid{width:6px;border:none !important;background:#111}.pdm-card sup{font-size:.65em;margin-left:1px;color:#555}`}</style>
          <div className="pdm-card" style={{ fontSize: FONT[s.font] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: '1.6em', fontWeight: 800 }}>{txt(s.title)}</div>
                <div style={{ color: '#444' }}>{s.location}</div>
              </div>
              <div style={{ textAlign: 'right', color: '#444' }}>
                Main {s.main} A · {s.system === '3' ? '208Y/120 V 3φ' : '120/240 V 1φ'}
                <br />Updated {s.date}
              </div>
            </div>
            <table>
              <tbody>
                {Array.from({ length: rows }, (_, i) => (
                  <tr key={i} style={{ height: `${FONT[s.font] * 2.1}px` }}>
                    {side(2 * i + 1)}
                    <td className="pdm-mid" />
                    {side(2 * i + 2)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 6, fontSize: '0.8em', color: '#555' }}>Turn off the main before servicing. Verify circuits with a tester; labels can be wrong.</div>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
