import { Bar, Btn, Check, CsvButton, Donut, JsonButtons, Note, num, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { autoBalance, compute, connections, DEFAULT_DEMAND, KINDS, necOptional, SYSTEMS, type Kind, type Load, type Sys } from './lib/panel-load-calculator'

const L = (name: string, kind: Kind, va: number, conn: string, extra: Partial<Load> = {}): Load => ({ id: uid(), name, kind, va, qty: 1, conn, demand: DEFAULT_DEMAND[kind], continuous: false, ...extra })

const stamp = () => new Date().toLocaleString()

const DEF = {
  sys: 'split' as Sys,
  nonCoincident: true,
  nec42: true,
  loads: [
    L('General lighting (2,000 ft² × 3 VA)', 'Lighting', 3000, 'A', { qty: 2, conn: 'A' }),
    L('Kitchen small-appliance circuits', 'Receptacles', 1500, 'B', { qty: 2, demand: 100 }),
    L('Laundry circuit', 'Receptacles', 1500, 'A', { demand: 100 }),
    L('Electric range', 'Appliance', 12000, 'AB', { demand: 67 }),
    L('Clothes dryer', 'Appliance', 5000, 'AB', { demand: 100 }),
    L('Water heater', 'Appliance', 4500, 'AB', { continuous: true, demand: 100 }),
    L('Dishwasher', 'Appliance', 1200, 'B'),
    L('Microwave', 'Appliance', 1500, 'A'),
    L('Refrigerator', 'Appliance', 800, 'B', { demand: 100 }),
    L('Garbage disposal', 'Motor', 900, 'A'),
    L('Air conditioner (condenser)', 'Cooling', 5000, 'AB'),
    L('Furnace blower', 'Motor', 800, 'B'),
    L('Electric heat strips', 'Heating', 10000, 'AB'),
    L('EV charger 32 A', 'EV charger', 7680, 'AB', { continuous: true }),
  ],
}

export default function PanelLoadCalculator() {
  const [s, set, reset] = useToolState('panel-load-calculator', DEF)
  const S = SYSTEMS[s.sys]
  const conns = connections(s.sys)
  const heat = s.loads.filter((l) => l.kind === 'Heating').reduce((a, l) => a + l.va * l.qty, 0)
  const cool = s.loads.filter((l) => l.kind === 'Cooling').reduce((a, l) => a + l.va * l.qty, 0)
  const dropped: Kind | null = s.nonCoincident && heat > 0 && cool > 0 ? (heat >= cool ? 'Cooling' : 'Heating') : null
  const isLR = (l: Load) => l.kind === 'Lighting' || l.kind === 'Receptacles'
  const lr = s.loads.filter(isLR).reduce((a, l) => a + l.va * l.qty, 0)
  const lrDemand = Math.min(lr, 3000) + Math.min(Math.max(0, lr - 3000), 117000) * 0.35 + Math.max(0, lr - 120000) * 0.25
  const lrPct = s.nec42 && lr > 0 ? (lrDemand / lr) * 100 : null
  const effective = s.loads.map((l) => (l.kind === dropped ? { ...l, demand: 0 } : lrPct !== null && isLR(l) ? { ...l, demand: lrPct } : l))
  const r = compute(effective, s.sys)
  const nec = necOptional(s.loads, S.vll)
  const edit = (id: string, p: Partial<Load>) => set({ loads: s.loads.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const changeSys = (sys: Sys) => {
    const ok = connections(sys)
    set({ sys, loads: s.loads.map((l) => (ok.includes(l.conn) ? l : { ...l, conn: ok.find((c) => c.length === Math.min(l.conn.length, SYSTEMS[sys].phases.length)) ?? 'A' })) })
  }
  const kva = (va: number) => `${num(va / 1000, 2)} kVA`
  const byKind = KINDS.map((k) => ({ label: k, value: s.loads.filter((l) => l.kind === k).reduce((a, l) => a + (r.rows.find((x) => x.id === l.id)?.sizing ?? 0), 0) })).filter((x) => x.value > 0)
  const maxAmp = Math.max(1, ...Object.values(r.phaseAmps))
  const util = r.amps / r.service

  const printSummary = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    const rows = s.loads.map((l) => {
      const x = r.rows.find((y) => y.id === l.id)!
      return `<tr><td>${esc(l.name)}</td><td>${l.kind}</td><td>${l.qty}</td><td>${num(l.va, 0)}</td><td>${l.conn}</td><td>${l.kind === dropped ? '0 (non-coincident)' : num(effective[s.loads.indexOf(l)].demand, 1)}%</td><td>${l.continuous ? 'yes' : ''}</td><td>${num(x.sizing, 0)}</td></tr>`
    }).join('')
    w.document.write(`<!doctype html><title>Panel load summary</title><style>body{font:13px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}h1{font-size:20px}</style>
<h1>Panel load summary — ${S.name}</h1><p>Generated ${stamp()}</p>
<table><tr><th>Load</th><th>Type</th><th>Qty</th><th>VA each</th><th>Phase</th><th>Demand</th><th>Cont.</th><th>Sizing VA</th></tr>${rows}</table>
<h2>Totals</h2><table>
<tr><td>Connected load</td><td>${kva(r.connected)}</td></tr><tr><td>Demand load</td><td>${kva(r.demand)}</td></tr>
<tr><td>Largest motor +25 %</td><td>${num(r.motorAdder, 0)} VA</td></tr><tr><td>Sizing load</td><td>${kva(r.sizing)}</td></tr>
${S.phases.map((p) => `<tr><td>Phase ${p}</td><td>${num(r.phaseAmps[p], 1)} A</td></tr>`).join('')}
<tr><td>Imbalance</td><td>${pct(r.imbalance, 1)}</td></tr><tr><td><b>Minimum service / panel</b></td><td><b>${r.service} A</b></td></tr>
${s.sys === 'split' ? `<tr><td>NEC 220.82 optional method</td><td>${num(nec.amps, 1)} A</td></tr>` : ''}</table>
<p>Estimate only — verify against your local electrical code with a licensed electrician.</p>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div>
      <Stats>
        <Stat label="Connected load" value={kva(r.connected)} />
        <Stat label="Sizing load" value={kva(r.sizing)} sub={`demand ${kva(r.demand)} + continuous/motor adders`} />
        <Stat label="Highest phase current" value={`${num(r.amps, 1)} A`} sub={`${util > 0.8 ? '⚠ ' : ''}${pct(util, 0)} of ${r.service} A`} />
        <Stat label="Minimum service" value={`${r.service} A`} tone="accent" sub={S.name} />
      </Stats>
      <Panel
          title="Loads"
          actions={
            <>
              <Btn onClick={() => set({ loads: [...s.loads, L('New load', 'Other', 1000, conns[0])] })}>+ Load</Btn>
              <CsvButton name="panel-loads.csv" rows={() => [['Load', 'Type', 'Qty', 'VA each', 'Phase', 'Demand %', 'Continuous', 'Sizing VA'], ...s.loads.map((l, i) => [l.name, l.kind, l.qty, l.va, l.conn, +effective[i].demand.toFixed(1), l.continuous ? 'yes' : 'no', Math.round(r.rows[i].sizing)])]} />
              <JsonButtons name="panel-loads.json" data={s} onLoad={(d) => set(d)} />
              <Btn onClick={printSummary}>🖨 Print</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Load', 'Type', 'Qty', 'VA each', 'Phase', 'Demand %', 'Cont.', 'Sizing VA', '']}
            rows={s.loads.map((l, i) => [
              <input key="n" value={l.name} onChange={(e) => edit(l.id, { name: e.target.value })} aria-label="Load name" style={{ minWidth: 220 }} />,
              <select key="k" value={l.kind} onChange={(e) => edit(l.id, { kind: e.target.value as Kind, demand: DEFAULT_DEMAND[e.target.value as Kind] })} aria-label="Type" style={{ minWidth: 112 }}>
                {KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>,
              <input key="q" type="number" min={1} value={l.qty} onChange={(e) => edit(l.id, { qty: Math.max(0, Number(e.target.value) || 0) })} aria-label="Quantity" style={{ width: 52 }} />,
              <input key="v" type="number" min={0} step={100} value={l.va} onChange={(e) => edit(l.id, { va: Math.max(0, Number(e.target.value) || 0) })} aria-label="VA" style={{ width: 78 }} />,
              <select key="c" value={l.conn} onChange={(e) => edit(l.id, { conn: e.target.value })} aria-label="Phase" style={{ minWidth: 104 }}>
                {conns.map((c) => <option key={c} value={c}>{c.length === 1 ? `${c} (${S.vln} V)` : c.length === 2 ? `${c} (${S.vll} V)` : `${c} 3φ`}</option>)}
              </select>,
              <input key="d" type="number" min={0} max={100} value={l.kind === dropped ? 0 : lrPct !== null && isLR(l) ? +lrPct.toFixed(1) : l.demand} disabled={l.kind === dropped || (lrPct !== null && isLR(l))} onChange={(e) => edit(l.id, { demand: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Demand factor" style={{ width: 58 }} />,
              <input key="ct" type="checkbox" checked={l.continuous} onChange={(e) => edit(l.id, { continuous: e.target.checked })} aria-label="Continuous (3 h or more)" />,
              <b key="z">{num(r.rows[i].sizing, 0)}</b>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ loads: s.loads.filter((x) => x.id !== l.id) })}>✕</Btn>,
            ])}
            foot={['Total', '', '', num(r.connected, 0), '', num(r.demand, 0), '', num(r.sizing, 0), '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Sizing VA = VA × qty × demand %, ×125 % for continuous loads (3 h+). The largest motor adds 25 % ({num(r.motorAdder, 0)} VA). {S.phases.length > 1 && <> Line-to-line loads draw VA ÷ {S.vll} V on both lines{S.three && <>; 3-phase loads draw VA ÷ (√3 × {S.vll} V) per line</>}.</>}
          </p>
        </Panel>
      <Split>
        <div>
          <Panel title="Service">
            <Select label="System" value={s.sys} onChange={changeSys} options={(Object.keys(SYSTEMS) as Sys[]).map((k) => [k, SYSTEMS[k].name] as const)} />
            <Check label="Heating & cooling never run together (count only the larger)" value={s.nonCoincident} onChange={(nonCoincident) => set({ nonCoincident })} />
            <Check label="NEC 220.42 tiers for lighting & receptacles (3 kVA @ 100 %, next 117 kVA @ 35 %)" value={s.nec42} onChange={(nec42) => set({ nec42 })} />
            {lrPct !== null && <Note>Lighting & receptacles: {kva(lr)} connected → {kva(lrDemand)} demand ({num(lrPct, 1)} %).</Note>}
            {dropped && <Note>{dropped} ({kva(dropped === 'Cooling' ? cool : heat)}) is omitted as the smaller non-coincident load.</Note>}
          </Panel>
          <Panel title="Phase balance" actions={S.phases.length > 1 && <Btn kind="primary" onClick={() => set({ loads: autoBalance(s.loads, s.sys) })}>⚖ Auto-balance</Btn>}>
            {S.phases.map((p, i) => (
              <div key={p} style={{ marginBottom: 10 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{s.sys === 'split' ? `Leg ${p}` : `Phase ${p}`}</b>
                  <span>{num(r.phaseAmps[p], 1)} A <span className="muted">· {kva(r.phaseVA[p])}</span></span>
                </Row>
                <Bar value={r.phaseAmps[p]} max={maxAmp} color={['#6366f1', '#ef4444', '#0ea5e9'][i]} />
              </div>
            ))}
            {S.phases.length > 1 && (
              <Note tone={r.imbalance > 0.2 ? 'warn' : 'ok'}>
                Imbalance {pct(r.imbalance, 1)} {r.imbalance > 0.2 ? '— move single-pole loads to the lighter phase or press Auto-balance.' : '— well balanced.'}
              </Note>
            )}
          </Panel>
          {s.sys === 'split' && (
            <Panel title="Cross-check: NEC 220.82 optional method">
              <p style={{ margin: 0 }}>
                General loads: first 10 kVA at 100 %, remainder at 40 %, plus the larger of heating or cooling.
              </p>
              <Stats>
                <Stat label="Optional-method load" value={kva(nec.va)} />
                <Stat label="Current at 240 V" value={`${num(nec.amps, 1)} A`} />
              </Stats>
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Where the load comes from">
            <Donut slices={byKind} fv={(v) => kva(v)} center={<span>{kva(r.sizing)}</span>} size={190} />
          </Panel>
          <Note tone="warn">Estimate for planning only. Electrical codes vary by country and edition — have a licensed electrician verify service sizing.</Note>
        </div>
      </Split>
    </div>
  )
}
