import { Btn, Check, CopyButton, LineChart, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { BUFFERS, pKaAt, recipe } from './lib/buffer-calculator'

const DEF = { id: 'hepes', pH: 7.4, T: 25, mM: 50, mL: 500, correct: true, salt: 150, titrant: 1 }

const g = (x: number) => (x >= 10 ? x.toFixed(2) : x >= 1 ? x.toFixed(3) : x.toFixed(4))

export default function BufferCalculator() {
  const [s, set, reset] = useToolState('buffer-calculator', DEF)
  const b = BUFFERS.find((x) => x.id === s.id) ?? BUFFERS[0]
  const C = s.mM / 1000, V = s.mL / 1000
  const r = recipe(b, s.pH, C, V, s.T, s.correct, s.salt / 1000)
  const titrantName = r.titrantFrom === 'acid' ? 'NaOH' : 'HCl'
  const titrantMl = (r.titrant / s.titrant) * 1000
  const startName = r.titrantFrom === 'acid' ? b.acid : b.base
  const startMass = r.titrantFrom === 'acid' ? C * V * b.acidMw : C * V * b.baseMw
  const suggestions = BUFFERS.map((x) => ({ x, d: Math.abs(pKaAt(x, s.T) - s.pH) })).sort((a, c) => a.d - c.d).slice(0, 4)
  const curve: [number, number][] = Array.from({ length: 99 }, (_, i) => { const f = (i + 1) / 100; return [f * 100, r.pKa + Math.log10(f / (1 - f))] })
  const betaCurve: [number, number][] = Array.from({ length: 81 }, (_, i) => { const pH = r.pKa - 2 + i * 0.05; return [pH, recipe(b, pH, C, V, s.T, false).beta * 1000] })
  const fmtG = (x: number) => (x < 0.01 ? `${(x * 1000).toFixed(2)} mg` : `${g(x)} g`)
  const protocol = [
    `${s.mL} mL of ${s.mM} mM ${b.name} buffer, pH ${s.pH} at ${s.T} °C`,
    `Option A — weigh both forms:`,
    `  ${b.acid}: ${fmtG(r.massAcid)} (${(r.ca * 1000).toFixed(2)} mM)`,
    `  ${b.base}: ${fmtG(r.massBase)} (${(r.cb * 1000).toFixed(2)} mM)`,
    `Option B — titrate:`,
    `  ${startName}: ${fmtG(startMass)}, dissolve in ~${Math.round(s.mL * 0.8)} mL water`,
    `  add ~${titrantMl.toFixed(2)} mL of ${s.titrant} M ${titrantName}, check with a pH meter at ${s.T} °C`,
    ...(s.salt ? [`  NaCl: ${fmtG((s.salt / 1000) * V * 58.44)} (${s.salt} mM)`] : []),
    `Make up to ${s.mL} mL. pKa' = ${r.pKa.toFixed(3)}, I = ${(r.I * 1000).toFixed(0)} mM.`,
  ].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Target" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Buffer system" value={s.id} onChange={(id) => set({ id })} options={BUFFERS.map((x) => [x.id, `${x.name} — pKa ${x.pKa.toFixed(2)}`] as const)} />
          <Row>
            <Num label="Target pH" value={s.pH} step={0.05} min={0} max={14} onChange={(pH) => set({ pH })} />
            <Num label="Temperature" unit="°C" value={s.T} min={0} max={80} onChange={(T) => set({ T })} />
          </Row>
          <Row>
            <Num label="Buffer concentration" unit="mM" value={s.mM} min={0.1} onChange={(mM) => set({ mM })} />
            <Num label="Final volume" unit="mL" value={s.mL} min={1} onChange={(mL) => set({ mL })} />
          </Row>
          <Row>
            <Num label="Added NaCl" unit="mM" value={s.salt} min={0} onChange={(salt) => set({ salt })} hint="counts towards ionic strength" />
            <Num label="Titrant strength" unit="M" value={s.titrant} min={0.01} step={0.1} onChange={(titrant) => set({ titrant })} />
          </Row>
          <Check label="Correct pKa for ionic strength (Davies equation)" value={s.correct} onChange={(correct) => set({ correct })} />
        </Panel>
        <Panel title="Best buffers for this pH">
          {suggestions.map(({ x, d }) => (
            <Row key={x.id} wrap={false}>
              <span style={{ flex: 1 }}><b>{x.name}</b> <span className="muted">pKa {pKaAt(x, s.T).toFixed(2)} at {s.T} °C</span></span>
              <span style={{ color: d <= 0.5 ? 'var(--ok)' : d <= 1 ? 'var(--warn)' : 'var(--err)' }}>Δ {d.toFixed(2)}</span>
              <Btn kind={x.id === s.id ? 'primary' : 'normal'} onClick={() => set({ id: x.id })}>Use</Btn>
            </Row>
          ))}
          <Note>Pick a buffer whose pKa is within ±0.5 of the target for good capacity; ±1 is the usable limit.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`pKa' at ${s.T} °C`} value={r.pKa.toFixed(3)} sub={`25 °C: ${b.pKa.toFixed(2)} · ${b.dT >= 0 ? '+' : ''}${b.dT}/°C`} />
          <Stat label="Base : acid ratio" value={r.ratio >= 100 || r.ratio < 0.01 ? r.ratio.toExponential(2) : r.ratio.toFixed(3)} sub={`${((r.cb / C) * 100).toFixed(1)}% base form`} tone="accent" />
          <Stat label="Buffer capacity β" value={`${(r.beta * 1000).toFixed(1)} mM/pH`} sub={`max ${(0.5756 * s.mM).toFixed(1)} at pH = pKa`} />
          <Stat label="Ionic strength" value={`${(r.I * 1000).toFixed(0)} mM`} />
        </Stats>
        {!r.inRange && <Note tone="err">pH {s.pH} is {Math.abs(s.pH - r.pKa).toFixed(2)} units from the pKa — outside the ±1 buffering range. Choose another buffer.</Note>}
        {r.inRange && Math.abs(s.pH - r.pKa) > 0.5 && <Note tone="warn">Usable, but capacity is reduced. A buffer with pKa closer to {s.pH} would hold pH better.</Note>}
        <Panel title="Recipe" actions={<CopyButton text={protocol} label="Copy protocol" />}>
          <Table head={['Component', 'Concentration', 'Amount']} rows={[
            [<b key="a">A · {b.acid}</b>, `${(r.ca * 1000).toFixed(2)} mM`, <b key="ma">{fmtG(r.massAcid)}</b>],
            [<b key="b">A · {b.base}</b>, `${(r.cb * 1000).toFixed(2)} mM`, <b key="mb">{fmtG(r.massBase)}</b>],
            [`B · ${startName}`, `${s.mM} mM`, fmtG(startMass)],
            [`B · ${s.titrant} M ${titrantName}`, `${((r.titrant / V) * 1000).toFixed(2)} mM`, `${titrantMl.toFixed(2)} mL`],
            ...(s.salt ? [['NaCl', `${s.salt} mM`, fmtG((s.salt / 1000) * V * 58.44)]] : []),
          ]} />
          <Note>Option A: dissolve both weighed forms and make up to {s.mL} mL. Option B: dissolve one form, titrate with {titrantName} to pH {s.pH} at {s.T} °C, then make up to volume. Always confirm with a calibrated pH meter at the working temperature.</Note>
        </Panel>
        <Panel title="Titration curve">
          <LineChart height={220} xLabel="Base form (%)" yLabel="pH" series={[{ name: b.name, points: curve }]} markers={[{ x: (r.cb / C) * 100, label: `pH ${s.pH}` }]} yMin={r.pKa - 2.2} yMax={r.pKa + 2.2} />
        </Panel>
        <Panel title="Buffer capacity vs pH">
          <LineChart height={200} xLabel="pH" yLabel="β (mM/pH)" series={[{ name: 'β', points: betaCurve, area: true, color: '#10b981' }]} markers={[{ x: s.pH, label: 'target' }]} />
        </Panel>
        <Panel title="Same recipe at other temperatures">
          <Table head={['Temperature', "pKa'", 'pH of this mix']} rows={[4, 20, 25, 37, 50].map((T) => {
            const pk = pKaAt(b, T) + (r.pKa - pKaAt(b, s.T))
            return [`${T} °C`, pk.toFixed(2), <b key="p" style={{ color: Math.abs(pk + Math.log10(r.ratio) - s.pH) > 0.2 ? 'var(--warn)' : undefined }}>{(pk + Math.log10(r.ratio)).toFixed(2)}</b>]
          })} />
          <Note>Amine buffers (Tris, Bicine, Tricine) shift strongly with temperature; carboxylate and phosphate buffers hardly shift.</Note>
        </Panel>
      </div>
    </Split>
  )
}
