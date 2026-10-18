import { useMemo } from 'react'
import { Btn, CopyButton, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { convert, dimFormula, dimString, fmtSig, parseUnit, PREFIXES, QUANTITIES, quantityName, sigFigs, type Q } from './lib/unit-converter'

interface Hist { value: string; from: string; to: string; result: string }

const EXAMPLES: [string, string, string][] = [
  ['9.81', 'm/s²', 'ft/s²'],
  ['101.325', 'kPa', 'mmHg'],
  ['4.184', 'J/(g·°C)', 'BTU/(lb·°F)'],
  ['350', 'K', '°F'],
  ['2.50', 'kg·m/s²', 'lbf'],
  ['0.0450', 'mol/L', 'mmol/mL'],
  ['1.00', 'kWh', 'MJ'],
  ['210', 'GPa', 'psi'],
  ['8.90', 'mPa·s', 'cP'],
  ['65', 'mph', 'm/s'],
]

const DEF = {
  value: '9.81',
  from: 'm/s²',
  to: 'ft/s²',
  sig: 'input' as 'input' | 'fixed' | 'full',
  n: 4,
  notation: 'auto' as 'auto' | 'sci' | 'eng',
  history: [] as Hist[],
}

const ALL_UNITS = [...new Set(QUANTITIES.flatMap(([, , u]) => u))]

const g8 = (x: number) => (Math.abs(x) >= 1e-4 && Math.abs(x) < 1e7 ? String(Number(x.toPrecision(8))) : fmtSig(Number(x.toPrecision(8)), Number(x.toPrecision(8)).toExponential().split('e')[0].replace(/[-.]/g, '').length, 'sci'))

function tryParse(s: string): { q?: Q; err?: string } {
  try {
    return { q: parseUnit(s) }
  } catch (e) {
    return { err: (e as Error).message }
  }
}

export default function UnitConverter() {
  const [s, set, reset] = useToolState('unit-converter', DEF)
  const v = Number(s.value.replace(/,/g, '').replace(/\s/g, '').replace(/×10\^?/, 'e'))
  const from = useMemo(() => tryParse(s.from), [s.from])
  const to = useMemo(() => tryParse(s.to), [s.to])
  const inSig = sigFigs(s.value.replace(/,/g, ''))
  const n = s.sig === 'fixed' ? s.n : s.sig === 'full' ? 10 : Number.isFinite(inSig) ? inSig : 4
  const ok = from.q && to.q && Number.isFinite(v)
  const consistent = !!(from.q && to.q && from.q.dim.every((x, i) => Math.abs(x - to.q!.dim[i]) < 1e-9))
  const res = ok && consistent ? convert(v, from.q!, to.q!) : NaN
  const resText = fmtSig(res, n, s.notation)
  const qname = from.q ? quantityName(from.q.dim) : null
  const cat = QUANTITIES.find(([name]) => qname?.split(' / ').includes(name))
  const isTemp = from.q?.offset !== undefined && to.q?.offset !== undefined && from.q.factor !== to.q.factor

  const save = () => set({ history: [{ value: s.value, from: s.from, to: s.to, result: resText }, ...s.history.filter((h) => !(h.value === s.value && h.from === s.from && h.to === s.to))].slice(0, 30) })

  return (
    <Split>
      <div>
        <Panel title="Convert" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label={`Value ${Number.isFinite(inSig) ? `· ${inSig} significant figure${inSig > 1 ? 's' : ''}` : ''}`} value={s.value} onChange={(value) => set({ value })} placeholder="e.g. 0.0450 or 6.02e23" />
          <datalist id="uc-units">{ALL_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <Row>
            <label className="k-field">
              <span className="k-label">From unit</span>
              <input className="k-text" list="uc-units" value={s.from} onChange={(e) => set({ from: e.target.value })} spellCheck={false} />
            </label>
            <Btn onClick={() => set({ from: s.to, to: s.from, value: Number.isFinite(res) ? resText.replace(' × 10', 'e').replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => [...m].map((c) => '-0123456789'['⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)]).join('')) : s.value })} title="Swap">⇄</Btn>
            <label className="k-field">
              <span className="k-label">To unit</span>
              <input className="k-text" list="uc-units" value={s.to} onChange={(e) => set({ to: e.target.value })} spellCheck={false} />
            </label>
          </Row>
          {from.err && <Note tone="err">From: {from.err}</Note>}
          {to.err && <Note tone="err">To: {to.err}</Note>}
          <Select label="Quick category" value={cat?.[0] ?? ''} onChange={(c) => { const q = QUANTITIES.find(([x]) => x === c); if (q) set({ from: q[2][0], to: q[2][1] }) }} options={[['', '— pick a quantity —'], ...QUANTITIES.map(([x]) => [x, x] as [string, string])]} />
          <div className="k-label">Significant figures</div>
          <Seg value={s.sig} onChange={(sig) => set({ sig })} options={[['input', 'Match input'], ['fixed', 'Fixed'], ['full', 'Full precision']]} />
          {s.sig === 'fixed' && <Num label="Significant figures" value={s.n} onChange={(x) => set({ n: Math.round(x) })} min={1} max={15} step={1} />}
          <div className="k-label">Notation</div>
          <div><Seg value={s.notation} onChange={(notation) => set({ notation })} options={[['auto', 'Auto'], ['sci', 'Scientific'], ['eng', 'Engineering']]} /></div>
        </Panel>
        <Panel title="Coursework examples">
          <Row>
            {EXAMPLES.map(([a, b, c]) => <Btn key={a + b} onClick={() => set({ value: a, from: b, to: c })}>{a} {b} → {c}</Btn>)}
          </Row>
          <Note>Write compound units with <b>·</b>, <b>*</b> or a space, powers as <b>^2</b> or <b>²</b>. Everything after <b>/</b> goes to the denominator: J/kg·K means J/(kg·K). Prefixes from quecto to quetta work on SI units (µm, MPa, kWh, ns…); type <b>u</b> for µ.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Result" value={<span style={{ fontSize: '1.15em' }}>{Number.isFinite(res) ? `${resText} ${s.to}` : '—'}</span>} sub={`${s.value} ${s.from} · ${n} sig. fig.${s.sig === 'input' ? ' (from input)' : ''}`} tone="accent" />
          <Stat label="Quantity" value={qname ?? (from.q ? 'derived' : '—')} sub={from.q ? `dimension ${dimFormula(from.q.dim)}` : ''} />
        </Stats>
        <Panel title="Dimensional analysis" actions={<><CopyButton text={`${s.value} ${s.from} = ${resText} ${s.to}`} label="Copy" /><Btn kind="primary" disabled={!Number.isFinite(res)} onClick={save}>Save to history</Btn></>}>
          {from.q && to.q && (
            <>
              <Table
                head={['', 'Unit', 'SI base units', 'Dimension', '1 unit = (SI)']}
                rows={[from.q, to.q].map((q, i) => [i ? 'To' : 'From', <b key="u">{i ? s.to : s.from}</b>, dimString(q.dim), dimFormula(q.dim), g8(q.factor)])}
              />
              {consistent ? (
                <Note tone="ok">Dimensions match ({dimFormula(from.q.dim)}), so the conversion is valid.</Note>
              ) : (
                <Note tone="err">Dimensions differ: {dimFormula(from.q.dim)} vs {dimFormula(to.q.dim)}. The ratio has dimension {dimFormula(from.q.dim.map((x, i) => x - to.q!.dim[i]))}; you would need to multiply or divide by a quantity with that dimension (a density, a molar mass, g, …).</Note>
              )}
              {consistent && Number.isFinite(v) && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13.5, overflowX: 'auto', padding: '6px 0' }}>
                  {isTemp ? (
                    <>Absolute temperature: T[K] = {s.value} × {g8(from.q.factor)} + {g8(from.q.offset ?? 0)} = {g8(v * from.q.factor + (from.q.offset ?? 0))} K → ({g8(v * from.q.factor + (from.q.offset ?? 0))} − {g8(to.q.offset ?? 0)}) ÷ {g8(to.q.factor)} = <b>{resText} {s.to}</b></>
                  ) : (
                    <>Factor-label: {s.value} {s.from} × ({g8(from.q.factor)} SI / 1 {s.from}) × (1 {s.to} / {g8(to.q.factor)} SI) = <b>{resText} {s.to}</b><br />Conversion factor: 1 {s.from} = {g8(from.q.factor / to.q.factor)} {s.to}</>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>
        {cat && Number.isFinite(v) && from.q && (
          <Panel title={`${s.value} ${s.from} in other ${cat[0].toLowerCase()} units`}>
            <Table head={['Unit', 'Value']} rows={cat[2].filter((u) => u !== s.from).map((u) => { const t = tryParse(u); return [u, t.q ? fmtSig(convert(v, from.q!, t.q), n, s.notation) : '—'] })} />
          </Panel>
        )}
        <Panel title="Conversion history" actions={s.history.length > 0 && <><CsvButton name="unit-conversions.csv" rows={() => [['Value', 'From', 'Result', 'To'], ...s.history.map((h) => [h.value, h.from, h.result, h.to])]} /><Btn kind="ghost" onClick={() => set({ history: [] })}>Clear</Btn></>}>
          {s.history.length ? (
            <Table head={['Input', 'Result', '']} rows={s.history.map((h, i) => [`${h.value} ${h.from}`, <b key="r">{h.result} {h.to}</b>, <Btn key="l" kind="ghost" onClick={() => set({ value: h.value, from: h.from, to: h.to })} title={`Load #${i + 1}`}>↺</Btn>])} />
          ) : (
            <p className="muted">Saved conversions appear here (kept in this browser).</p>
          )}
        </Panel>
        <details className="k-panel" style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>SI prefix reference</summary>
          <Table head={['Symbol', 'Prefix', 'Factor']} rows={PREFIXES.map(([sym, name, f]) => [sym, name, `10${fmtSig(f, 1, 'sci').split('10')[1] ?? '⁰'}`])} />
        </details>
      </div>
    </Split>
  )
}
