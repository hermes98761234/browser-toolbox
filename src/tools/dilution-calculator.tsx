import { Btn, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { CONC_UNITS, convertConc, family, fmtConc, fmtVol, fromL, serial, solve, toL, VOL_UNITS, type ConcUnit, type Field, type VolUnit } from './lib/dilution-calculator'

interface Q<U> {
  v: number
  u: U
}
const DEF = {
  mode: 'single' as 'single' | 'serial',
  unknown: 'v1' as Field,
  c1: { v: 10, u: 'mM' } as Q<ConcUnit>,
  v1: { v: 10, u: 'µL' } as Q<VolUnit>,
  c2: { v: 100, u: 'µM' } as Q<ConcUnit>,
  v2: { v: 1, u: 'mL' } as Q<VolUnit>,
  mw: 0,
  name: 'Compound X',
  stock: { v: 1, u: 'mg/mL' } as Q<ConcUnit>,
  df: 10,
  steps: 6,
  final: { v: 900, u: 'µL' } as Q<VolUnit>,
}
const PRESETS: [string, Partial<typeof DEF>][] = [
  ['10X PBS → 1X, 500 mL', { unknown: 'v1', c1: { v: 10, u: 'X' }, c2: { v: 1, u: 'X' }, v2: { v: 500, u: 'mL' }, name: 'PBS' }],
  ['Antibody 1 mg/mL → 5 µg/mL', { unknown: 'v1', c1: { v: 1, u: 'mg/mL' }, c2: { v: 5, u: 'µg/mL' }, v2: { v: 2, u: 'mL' }, name: 'Antibody' }],
  ['5 M NaCl → 150 mM', { unknown: 'v1', c1: { v: 5, u: 'M' }, c2: { v: 150, u: 'mM' }, v2: { v: 50, u: 'mL' }, name: 'NaCl' }],
  ['NaCl 2.92 g/L in M', { unknown: 'c2', c1: { v: 2.92, u: 'g/L' }, v1: { v: 1, u: 'L' }, v2: { v: 1, u: 'L' }, c2: { v: 0, u: 'mM' }, mw: 58.44, name: 'NaCl' }],
]
const LABEL: Record<Field, string> = { c1: 'Stock concentration (C₁)', v1: 'Stock volume (V₁)', c2: 'Final concentration (C₂)', v2: 'Final volume (V₂)' }

function QIn<U extends string>({ label, q, units, onChange, solved, onSolve, isUnknown }: {
  label: string; q: Q<U>; units: readonly U[]; onChange: (q: Q<U>) => void; solved?: string; onSolve: () => void; isUnknown: boolean
}) {
  return (
    <div style={{ border: `1px solid ${isUnknown ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 10, marginBottom: 8, background: isUnknown ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
      <label className="k-check" style={{ marginBottom: 6 }}>
        <input type="radio" checked={isUnknown} onChange={onSolve} /> <b>{label}</b> {isUnknown && <span className="muted">· solve for this</span>}
      </label>
      {isUnknown ? (
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{solved}</div>
      ) : (
        <Row wrap={false}>
          <input className="k-text" type="number" min={0} value={q.v} onChange={(e) => onChange({ ...q, v: Number(e.target.value) })} aria-label={label} style={{ flex: 1, minWidth: 0 }} />
          <select className="k-select" value={q.u} onChange={(e) => onChange({ ...q, u: e.target.value as U })} aria-label={`${label} unit`} style={{ width: 100 }}>
            {units.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Row>
      )}
      {isUnknown && (
        <select className="k-select" value={q.u} onChange={(e) => onChange({ ...q, u: e.target.value as U })} aria-label={`${label} unit`} style={{ width: 110, marginTop: 4 }}>
          {units.map((u) => <option key={u}>{u}</option>)}
        </select>
      )}
    </div>
  )
}

function Tubes({ concs, unit }: { concs: number[]; unit: ConcUnit }) {
  const max = concs[0] || 1
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0' }}>
      {concs.map((c, i) => {
        const a = Math.max(0.06, 1 - Math.log10(max / c) / (Math.log10(max / concs[concs.length - 1]) + 0.5 || 1))
        return (
          <div key={i} style={{ textAlign: 'center', minWidth: 62 }}>
            <svg width={34} height={90} viewBox="0 0 34 90" aria-hidden>
              <path d="M5 4 h24 v66 a12 12 0 0 1 -24 0 z" fill="var(--panel)" stroke="var(--grid-strong)" strokeWidth={2} />
              <path d="M7 30 h20 v40 a10 10 0 0 1 -20 0 z" fill="#e11d48" opacity={a} />
            </svg>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{i === 0 ? 'Stock' : `Tube ${i}`}</div>
            <div style={{ fontSize: 11 }} className="muted">{fmtConc(c, unit)}</div>
          </div>
        )
      })}
    </div>
  )
}

function printPlan(title: string, head: string[], rows: string[][], notes: string[]) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}td:last-child{width:40px}</style><h2>${esc(title)}</h2><p>Date: ${new Date().toLocaleDateString()} &nbsp; Operator: ________________</p><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}<th>✓</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}<td></td></tr>`).join('')}</table>${notes.map((n) => `<p>${esc(n)}</p>`).join('')}`)
  w.document.close()
  w.focus()
  w.print()
}

export default function DilutionCalculator() {
  const [s, set, reset] = useToolState('dilution-calculator', DEF)

  // ---- single step ----
  const cu = s.c1.u
  const c2in1 = (v: number, u: ConcUnit) => convertConc(v, u, cu, s.mw)
  const known = { c1: s.c1.v, v1: toL(s.v1.v, s.v1.u), c2: c2in1(s.c2.v, s.c2.u), v2: toL(s.v2.v, s.v2.u) }
  const raw = solve(s.unknown, known)
  const vals = { ...known, [s.unknown]: raw }
  const crossFamily = family(s.c1.u) !== family(s.c2.u)
  const needMw = crossFamily && family(s.c1.u) !== 'fold' && family(s.c2.u) !== 'fold'
  let err = ''
  if (crossFamily && (!needMw || !(s.mw > 0))) err = needMw ? 'Stock and final units differ (molar vs mass): enter the molecular weight.' : 'Fold (X) units can only be mixed with fold units.'
  else if (!Number.isFinite(raw) || raw <= 0) err = 'Enter positive values for the three known quantities.'
  else if (vals.c2 > vals.c1 + 1e-12) err = 'The final concentration is higher than the stock: dilution cannot concentrate a solution.'
  else if (vals.v1 > vals.v2 + 1e-15) err = 'The stock volume exceeds the final volume.'
  const solvedText = (f: Field) => {
    if (err && !Number.isFinite(raw)) return '—'
    if (f === 'c1') return `${Number(raw.toPrecision(4))} ${cu}`
    if (f === 'c2') return `${Number(convertConc(raw, cu, s.c2.u, s.mw).toPrecision(4))} ${s.c2.u}`
    const q = f === 'v1' ? s.v1 : s.v2
    return `${Number(fromL(raw, q.u).toPrecision(4))} ${q.u}`
  }
  const diluent = vals.v2 - vals.v1
  const df = vals.c1 / vals.c2

  // ---- serial ----
  const finalL = toL(s.final.v, s.final.u)
  const tubes = serial(s.stock.v, s.df, s.steps, finalL)
  const serialRows = tubes.map((t) => [`Tube ${t.n}`, fmtConc(t.conc, s.stock.u), `1:${Number((s.df ** t.n).toPrecision(6)).toLocaleString('en-US')}`, `${fmtVol(t.transfer)} from ${t.n === 1 ? 'stock' : `tube ${t.n - 1}`}`, fmtVol(t.diluent), t.discard ? `${fmtVol(t.final)} (discard ${fmtVol(t.discard)})` : fmtVol(t.final)])

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
      <Panel title="Dilution type" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
        <Row>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['single', 'Single step · C₁V₁ = C₂V₂'], ['serial', 'Serial dilution']]} label="Mode" />
          <div style={{ flex: '1 1 180px' }}><Txt label="Solution name" value={s.name} onChange={(name) => set({ name })} /></div>
          <div style={{ flex: '0 1 160px' }}><Num label="Molecular weight" value={s.mw} onChange={(mw) => set({ mw })} unit="g/mol" min={0} hint="Only for molar ↔ mass units" /></div>
        </Row>
      </Panel>
      </div>

      {s.mode === 'single' ? (
        <Split>
          <Panel title="Known values (pick the unknown)">
            <QIn label={LABEL.c1} q={s.c1} units={CONC_UNITS} onChange={(c1) => set({ c1 })} isUnknown={s.unknown === 'c1'} onSolve={() => set({ unknown: 'c1' })} solved={solvedText('c1')} />
            <QIn label={LABEL.v1} q={s.v1} units={VOL_UNITS} onChange={(v1) => set({ v1 })} isUnknown={s.unknown === 'v1'} onSolve={() => set({ unknown: 'v1' })} solved={solvedText('v1')} />
            <QIn label={LABEL.c2} q={s.c2} units={CONC_UNITS} onChange={(c2) => set({ c2 })} isUnknown={s.unknown === 'c2'} onSolve={() => set({ unknown: 'c2' })} solved={solvedText('c2')} />
            <QIn label={LABEL.v2} q={s.v2} units={VOL_UNITS} onChange={(v2) => set({ v2 })} isUnknown={s.unknown === 'v2'} onSolve={() => set({ unknown: 'v2' })} solved={solvedText('v2')} />
            <div className="k-label">Examples</div>
            <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}</Row>
          </Panel>
          <div>
            {err ? (
              <Note tone="err">{err}</Note>
            ) : (
              <>
                <Stats>
                  <Stat label={LABEL[s.unknown].replace(/ \(.*/, '')} value={solvedText(s.unknown)} tone="accent" />
                  <Stat label="Dilution factor" value={`1 : ${Number(df.toPrecision(4))}`} sub={`${Number(df.toPrecision(4))}-fold`} />
                  <Stat label="Final" value={s.unknown === 'c2' ? solvedText('c2') : fmtConc(s.c2.v, s.c2.u)} sub={`in ${fmtVol(vals.v2)}`} />
                  <Stat label="Diluent" value={fmtVol(diluent)} sub={`to ${fmtVol(vals.v2)} total`} />
                </Stats>
                <Panel
                  title="Pipetting plan"
                  actions={<Btn kind="primary" onClick={() => printPlan(`${s.name}: ${fmtConc(vals.c1, cu)} → ${fmtConc(vals.c2, cu)}`, ['Step', 'Action', 'Volume'], [['1', `Add diluent to the vessel`, fmtVol(diluent)], ['2', `Add ${s.name} stock (${fmtConc(vals.c1, cu)})`, fmtVol(vals.v1)], ['3', 'Mix gently by inversion or pipetting', '—']], [`Final: ${fmtVol(vals.v2)} at ${fmtConc(vals.c2, cu)} (1:${Number(df.toPrecision(4))}).`])}>🖨 Print</Btn>}
                >
                  <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
                    <li>Put <b>{fmtVol(diluent)}</b> of diluent in the tube or flask.</li>
                    <li>Add <b>{fmtVol(vals.v1)}</b> of {s.name} stock at {fmtConc(vals.c1, cu)}.</li>
                    <li>Mix. You now have <b>{fmtVol(vals.v2)}</b> at <b>{s.unknown === 'c2' ? solvedText('c2') : fmtConc(s.c2.v, s.c2.u)}</b>.</li>
                  </ol>
                  {vals.v1 < 1e-6 && <Note tone="warn">Under 1 µL of stock is hard to pipette accurately. Do an intermediate dilution first (Serial mode) or scale up the final volume.</Note>}
                  {df > 1000 && <Note tone="warn">A {Math.round(df)}-fold single step is error-prone; two or three serial steps are more accurate.</Note>}
                </Panel>
              </>
            )}
            <Note>C₁·V₁ = C₂·V₂: the amount of solute is the same before and after adding diluent. Units are converted automatically (molar ↔ mass with the molecular weight).</Note>
          </div>
        </Split>
      ) : (
        <Split wide="right">
          <Panel title="Serial dilution">
            <Row wrap={false}>
              <div style={{ flex: 1 }}><Num label="Stock concentration" value={s.stock.v} onChange={(v) => set({ stock: { ...s.stock, v } })} min={0} /></div>
              <div style={{ width: 110 }}><Select label="Unit" value={s.stock.u} onChange={(u) => set({ stock: { ...s.stock, u } })} options={CONC_UNITS} /></div>
            </Row>
            <Row>
              <Num label="Dilution factor per step" value={s.df} onChange={(v) => set({ df: v })} min={1.01} hint="e.g. 2, 3, 5, 10" />
              <Num label="Number of tubes" value={s.steps} onChange={(v) => set({ steps: Math.max(1, Math.min(24, Math.round(v))) })} min={1} max={24} step={1} />
            </Row>
            <Row>
              {[2, 3, 5, 10].map((d) => <Btn key={d} kind={s.df === d ? 'primary' : 'normal'} onClick={() => set({ df: d })}>{d}-fold</Btn>)}
            </Row>
            <Row wrap={false}>
              <div style={{ flex: 1 }}><Num label="Final volume in each tube" value={s.final.v} onChange={(v) => set({ final: { ...s.final, v } })} min={0} /></div>
              <div style={{ width: 110 }}><Select label="Unit" value={s.final.u} onChange={(u) => set({ final: { ...s.final, u } })} options={VOL_UNITS} /></div>
            </Row>
            <Note>Each tube gets the diluent first, then the transfer from the previous tube; mix and change tips before the next transfer.</Note>
          </Panel>
          <div>
            {tubes.length ? (
              <>
                <Stats>
                  <Stat label="Transfer volume" value={fmtVol(tubes[0].transfer)} tone="accent" sub={`= V ÷ (DF − 1)`} />
                  <Stat label="Diluent per tube" value={fmtVol(tubes[0].diluent)} sub={`${fmtVol(tubes[0].diluent * tubes.length)} total`} />
                  <Stat label="Lowest concentration" value={fmtConc(tubes[tubes.length - 1].conc, s.stock.u)} sub={`1 : ${Number((s.df ** tubes.length).toPrecision(4)).toLocaleString('en-US')}`} />
                  <Stat label="Tubes" value={tubes.length} sub={`mixed volume ${fmtVol(tubes[0].transfer + tubes[0].diluent)}`} />
                </Stats>
                <Panel
                  title="Pipetting plan"
                  actions={
                    <>
                      <CsvButton name="serial-dilution.csv" rows={() => [['Tube', 'Concentration', 'Total dilution', 'Transfer', 'Diluent', 'Final volume'], ...serialRows]} />
                      <Btn kind="primary" onClick={() => printPlan(`${s.name}: ${s.df}-fold serial dilution from ${fmtConc(s.stock.v, s.stock.u)}`, ['Tube', 'Concentration', 'Total dilution', 'Transfer in', 'Diluent', 'Final volume'], serialRows, [`Pre-fill each tube with ${fmtVol(tubes[0].diluent)} diluent. Transfer ${fmtVol(tubes[0].transfer)} down the series, mixing well and changing tips each time.`])}>🖨 Print</Btn>
                    </>
                  }
                >
                  <Tubes concs={[s.stock.v, ...tubes.map((t) => t.conc)]} unit={s.stock.u} />
                  <Table head={['Tube', 'Concentration', 'Total dilution', 'Transfer in', 'Diluent', 'Final volume']} rows={serialRows} />
                </Panel>
              </>
            ) : (
              <Note tone="err">Use a dilution factor above 1, at least one tube and a positive final volume.</Note>
            )}
          </div>
        </Split>
      )}
    </div>
  )
}
