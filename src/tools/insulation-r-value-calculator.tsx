import { BarChart, Btn, Check, CsvButton, money, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { assembly, cToF, dewPoint, heatLoss, layerR, matById, MATS, profile, RSI, type Framing, type Layer } from './lib/insulation-r-value-calculator'

type Unit = 'imp' | 'si'
const L = (mat: string, mm: number, cavity = false): Layer => ({ id: uid(), mat, mm, cavity })
const PRESETS: Record<string, { name: string; framing: Framing; fraction: number; layers: Layer[] }> = {
  w2x4: { name: '2×4 wall, R-13 batts', framing: 'wood', fraction: 0.25, layers: [L('film-in', 0), L('gyp', 12.7), L('fg', 88.9, true), L('osb', 11.1), L('wrap', 0.5), L('vinyl', 10), L('film-out', 0)] },
  w2x6: { name: '2×6 wall, dense-pack + 1″ XPS', framing: 'wood', fraction: 0.22, layers: [L('film-in', 0), L('gyp', 12.7), L('cell', 139.7, true), L('osb', 11.1), L('xps', 25.4), L('gap', 19), L('fcs', 8), L('film-out', 0)] },
  steel: { name: 'Steel studs, R-19 batts', framing: 'steel', fraction: 0.15, layers: [L('film-in', 0), L('gyp', 15.9), L('fg', 152, true), L('gyp', 12.7), L('mwb', 50), L('stucco', 22), L('film-out', 0)] },
  brick: { name: 'Solid brick + interior foam', framing: 'none', fraction: 0, layers: [L('film-in', 0), L('gyp', 12.7), L('iso', 50), L('brick-c', 220), L('film-out', 0)] },
  attic: { name: 'Attic floor, R-49 cellulose', framing: 'wood', fraction: 0.07, layers: [L('film-ceil', 0), L('gyp', 15.9), L('cell-loose', 368, true), L('film-out', 0)] },
}
const DEF = {
  unit: 'imp' as Unit, preset: 'w2x4', framing: 'wood' as Framing, fraction: 0.25, layers: PRESETS.w2x4.layers.map((l, i) => ({ ...l, id: `l${i}` })),
  tIn: 21.111, tOut: -12.222, rh: 40, areaM2: 120, hddC: 3000, price: 0.17, eff: 0.95,
}
const CAT_COL: Record<string, string> = { film: '#94a3b8', board: '#e2e8f0', insul: '#fbbf24', struct: '#d6a46b', clad: '#64748b', masonry: '#b45309', air: '#bae6fd' }

export default function InsulationRValueCalculator() {
  const [s, set, reset] = useToolState('insulation-r-value-calculator', DEF)
  const imp = s.unit === 'imp'
  const res = assembly(s.layers, s.framing, s.fraction)
  const rU = (r: number) => (imp ? `R-${num(r, 1)}` : `RSI ${num(r * RSI, 2)}`)
  const T = (c: number) => (imp ? `${num(cToF(c), 0)} °F` : `${num(c, 1)} °C`)
  const thick = (mm: number) => (imp ? +(mm / 25.4).toFixed(2) : +mm.toFixed(1))
  const toMm = (v: number) => (imp ? v * 25.4 : v)
  const editL = (id: string, p: Partial<Layer>) => set({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) })
  const move = (i: number, d: number) => {
    const a = [...s.layers]
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ layers: a })
  }
  const prof = profile(s.layers, s.tIn, s.tOut)
  const dp = dewPoint(s.tIn, s.rh)
  const firstCold = prof.findIndex((t) => t < dp)
  const coldLayer = firstCold > 0 ? s.layers[firstCold - 1] : null
  const areaFt2 = s.areaM2 * 10.7639
  const hl = heatLoss(res.u, areaFt2, Math.max(0, cToF(s.tIn) - cToF(s.tOut)), s.hddC * 1.8)
  const cost = (hl.annualKwh / Math.max(0.1, s.eff)) * s.price
  const totalMm = s.layers.reduce((a, l) => a + l.mm, 0)

  // cross-section geometry
  const W = 620, H = 220, pad = 30
  const widths = s.layers.map((l) => Math.max(10, l.mm))
  const wsum = widths.reduce((a, b) => a + b, 0)
  const xs = [pad]
  widths.forEach((w) => xs.push(xs[xs.length - 1] + (w / wsum) * (W - 2 * pad)))
  const tMax = Math.max(s.tIn, s.tOut, dp), tMin = Math.min(s.tIn, s.tOut, dp)
  const ty = (t: number) => 30 + (1 - (t - tMin) / (tMax - tMin || 1)) * (H - 60)

  const compare = Object.entries(PRESETS).map(([, p]) => ({ label: p.name.split(',')[0], value: assembly(p.layers, p.framing, p.fraction).rEff * (imp ? 1 : RSI) }))
  compare.push({ label: 'Yours', value: res.rEff * (imp ? 1 : RSI) })

  return (
    <Split wide="right">
      <div>
        <Panel title="Assembly" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['imp', 'R (US)'], ['si', 'RSI (metric)']]} />}>
          <Select label="Start from a preset" value={s.preset} onChange={(preset) => { const p = PRESETS[preset]; set({ preset, framing: p.framing, fraction: p.fraction, layers: p.layers.map((l) => ({ ...l, id: uid() })) }) }} options={Object.entries(PRESETS).map(([k, p]) => [k, p.name] as [string, string])} />
          <Seg value={s.framing} onChange={(framing) => set({ framing })} options={[['wood', 'Wood framing'], ['steel', 'Steel studs'], ['none', 'No framing']]} />
          {s.framing === 'wood' && (
            <>
              <Row>
                {([['16″ o.c.', 0.25], ['24″ o.c.', 0.22], ['Advanced', 0.18], ['Attic joists', 0.07]] as [string, number][]).map(([n, f]) => <Btn key={n} kind={s.fraction === f ? 'primary' : 'ghost'} onClick={() => set({ fraction: f })}>{n}</Btn>)}
              </Row>
              <Num label="Framing fraction" value={+(s.fraction * 100).toFixed(1)} onChange={(v) => set({ fraction: Math.max(0, Math.min(100, v)) / 100 })} unit="%" min={0} max={100} hint="Studs, plates, headers as share of wall area (typical 20–27 %)" />
            </>
          )}
          {s.framing === 'steel' && <Note tone="warn">Steel conducts ~400× better than wood, so cavity insulation is derated to about 50 % (ASHRAE-style correction) instead of the parallel-path method. Continuous exterior insulation is the real fix.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Layers run from inside (top) to outside (bottom). Tick “cavity” for insulation between studs; the framing path swaps it for lumber.</p>
        </Panel>
        <Panel title="Heat loss">
          <Row>
            <Num label="Indoor" value={imp ? +cToF(s.tIn).toFixed(1) : s.tIn} onChange={(v) => set({ tIn: imp ? ((v - 32) * 5) / 9 : v })} unit={imp ? '°F' : '°C'} />
            <Num label="Design outdoor" value={imp ? +cToF(s.tOut).toFixed(1) : s.tOut} onChange={(v) => set({ tOut: imp ? ((v - 32) * 5) / 9 : v })} unit={imp ? '°F' : '°C'} />
            <Num label="Indoor RH" value={s.rh} onChange={(rh) => set({ rh })} unit="%" min={1} max={100} />
          </Row>
          <Row>
            <Num label="Area" value={imp ? +(s.areaM2 * 10.7639).toFixed(0) : s.areaM2} onChange={(v) => set({ areaM2: Math.max(0, imp ? v / 10.7639 : v) })} unit={imp ? 'ft²' : 'm²'} min={0} />
            <Num label="Heating degree-days" value={imp ? Math.round(s.hddC * 1.8) : s.hddC} onChange={(v) => set({ hddC: Math.max(0, imp ? v / 1.8 : v) })} unit={imp ? '°F·d' : '°C·d'} min={0} />
          </Row>
          <Row>
            <Num label="Energy price" value={s.price} onChange={(price) => set({ price: Math.max(0, price) })} unit="/kWh" min={0} />
            <Num label="Heating efficiency / COP" value={s.eff} onChange={(eff) => set({ eff })} min={0.1} hint="Furnace 0.8–0.97, heat pump 2.5–4" />
          </Row>
          <Table head={['', 'Value']} rows={[
            ['Peak loss at design temp', imp ? `${num(hl.btuh, 0)} BTU/h (${num(hl.watts, 0)} W)` : `${num(hl.watts, 0)} W`],
            ['Annual loss through this area', `${num(hl.annualKwh, 0)} kWh`],
            ['Annual heating cost', money(cost)],
            ['Indoor dew point', T(dp)],
          ]} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Effective R" value={rU(res.rEff)} sub={`whole assembly incl. framing`} tone="accent" />
          <Stat label="U-factor" value={imp ? num(res.u, 3) : num(res.u / RSI, 3)} sub={imp ? 'BTU/h·ft²·°F' : 'W/m²·K'} />
          <Stat label="Nominal (clear cavity)" value={rU(res.rNominal)} sub={`${num(res.bridging * 100, 0)} % lost to framing`} tone={res.bridging > 0.2 ? 'bad' : undefined} />
          <Stat label="Thickness" value={imp ? `${num(totalMm / 25.4, 2)}″` : `${num(totalMm, 0)} mm`} sub={`peak ${num(hl.watts, 0)} W`} />
        </Stats>
        <Panel title="Layers" actions={<>
          <Btn onClick={() => set({ layers: [...s.layers.slice(0, -1), L('eps', 50), ...s.layers.slice(-1)] })}>+ Layer</Btn>
          <CsvButton name="assembly.csv" rows={() => [['Layer', 'Thickness mm', 'R (US)', 'RSI', 'Cavity'], ...s.layers.map((l) => [matById(l.mat).name, l.mm, +layerR(l).toFixed(3), +(layerR(l) * RSI).toFixed(3), l.cavity ? 'yes' : '']), ['Effective', totalMm, +res.rEff.toFixed(2), +(res.rEff * RSI).toFixed(2), '']]} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <Table
            head={['Material', imp ? 'in' : 'mm', imp ? 'R' : 'RSI', 'Cavity', '']}
            rows={s.layers.map((l, i) => {
              const m = matById(l.mat)
              return [
                <select key="m" value={l.mat} onChange={(e) => editL(l.id, { mat: e.target.value, mm: matById(e.target.value).mm })} aria-label="Material" style={{ maxWidth: 220 }}>
                  {MATS.map((x) => <option key={x.id} value={x.id}>{x.name}{x.perIn ? ` (R-${x.perIn}/in)` : ` (R-${x.fixed})`}</option>)}
                </select>,
                m.fixed !== undefined && m.cat === 'film' ? <span key="t" className="muted">—</span> : <input key="t" type="number" min={0} step="any" value={thick(l.mm)} onChange={(e) => editL(l.id, { mm: Math.max(0, toMm(Number(e.target.value) || 0)) })} style={{ width: 70 }} aria-label="Thickness" />,
                <b key="r">{imp ? num(layerR(l), 2) : num(layerR(l) * RSI, 3)}</b>,
                m.cat === 'insul' ? <Check key="c" label="" value={!!l.cavity} onChange={(cavity) => editL(l.id, { cavity })} /> : '',
                <span key="x" style={{ whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" onClick={() => move(i, -1)} title="Move in">↑</Btn>
                  <Btn kind="ghost" onClick={() => move(i, 1)} title="Move out">↓</Btn>
                  <Btn kind="ghost" onClick={() => set({ layers: s.layers.filter((x) => x.id !== l.id) })} title="Remove">✕</Btn>
                </span>,
              ]
            })}
            foot={['Cavity path / framing path', '', `${rU(res.rCavityPath)} / ${rU(res.rFramePath)}`, '', '']}
          />
        </Panel>
        <Panel title="Section & temperature profile">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Wall section with temperature profile">
            {s.layers.map((l, i) => (
              <g key={l.id}>
                <rect x={xs[i]} y={20} width={xs[i + 1] - xs[i]} height={H - 40} fill={CAT_COL[matById(l.mat).cat]} opacity={l.id === coldLayer?.id ? 1 : 0.8} stroke={l.id === coldLayer?.id ? '#ef4444' : 'var(--panel)'} strokeWidth={l.id === coldLayer?.id ? 2 : 1} />
                {xs[i + 1] - xs[i] > 26 && <text x={(xs[i] + xs[i + 1]) / 2} y={H - 26} fontSize={10} textAnchor="middle" fill="#1e293b">{matById(l.mat).name.split(/[ ,(]/)[0]}</text>}
              </g>
            ))}
            <line x1={pad} x2={W - pad} y1={ty(dp)} y2={ty(dp)} stroke="#0ea5e9" strokeDasharray="6 4" />
            <text x={W - pad} y={ty(dp) - 4} fontSize={11} textAnchor="end" fill="#0ea5e9">dew point {T(dp)}</text>
            <polyline points={prof.map((t, i) => `${xs[i]},${ty(t)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={2.5} />
            {prof.map((t, i) => <circle key={i} cx={xs[i]} cy={ty(t)} r={3} fill="#ef4444" />)}
            <text x={pad} y={14} fontSize={11} fill="currentColor">Inside {T(s.tIn)}</text>
            <text x={W - pad} y={14} fontSize={11} textAnchor="end" fill="currentColor">Outside {T(s.tOut)}</text>
          </svg>
          {coldLayer ? (
            <Note tone="warn">Interfaces from <b>{matById(coldLayer.mat).name}</b> outward are colder than the indoor dew point ({T(dp)}). Air leaking or vapour diffusing to there can condense: keep the interior side airtight, use a vapour retarder suited to your climate, or add enough exterior insulation to keep the sheathing warm.</Note>
          ) : <Note tone="ok">No interface falls below the indoor dew point at these conditions.</Note>}
        </Panel>
        <Panel title={`Compare assemblies (${imp ? 'R' : 'RSI'} effective)`}>
          <BarChart bars={compare.map((c, i) => ({ ...c, color: i === compare.length - 1 ? '#ef4444' : undefined }))} fy={(v) => num(v, 1)} height={200} />
          <Note>Values are typical published figures; actual products differ (check the label R-value). Films use standard design values for still indoor air and 15 mph wind.</Note>
        </Panel>
      </div>
    </Split>
  )
}
