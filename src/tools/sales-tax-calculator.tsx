import { Area, Btn, Check, CopyButton, CsvButton, JsonButtons, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { addTax, batch, findRate, parseLines, removeTax, round2 } from './lib/sales-tax-calculator'

interface Preset { id: string; name: string; rate: number }
type Mode = 'add' | 'remove' | 'rate'
interface State { mode: Mode; amount: number; gross: number; rate: number; local: number; presetId: string; currency: string; presets: Preset[]; batchOn: boolean; lines: string; perLine: boolean }

const PRESETS: Preset[] = [
  ['us-ca', 'US · California (state base)', 7.25], ['us-nyc', 'US · New York City', 8.875], ['us-tx', 'US · Texas (state 6.25 + max local 2)', 8.25], ['us-chi', 'US · Chicago', 10.25], ['us-wa', 'US · Seattle', 10.35],
  ['ca-on', 'Canada · Ontario HST', 13], ['ca-bc', 'Canada · BC GST + PST', 12], ['ca-qc', 'Canada · Québec GST + QST', 14.975], ['uk', 'UK · VAT standard', 20], ['uk-r', 'UK · VAT reduced', 5],
  ['de', 'Germany · MwSt', 19], ['de-r', 'Germany · reduced', 7], ['fr', 'France · TVA', 20], ['es', 'Spain · IVA', 21], ['it', 'Italy · IVA', 22], ['pl', 'Poland · VAT', 23], ['ua', 'Ukraine · VAT', 20],
  ['au', 'Australia · GST', 10], ['nz', 'New Zealand · GST', 15], ['jp', 'Japan · consumption tax', 10], ['in', 'India · GST 18%', 18], ['ch', 'Switzerland · VAT', 8.1],
].map(([id, name, rate]) => ({ id: id as string, name: name as string, rate: rate as number }))

const DEF: State = {
  mode: 'add', amount: 249.99, gross: 270.62, rate: 8.875, local: 0, presetId: 'us-nyc', currency: '$', presets: PRESETS, batchOn: true, perLine: true,
  lines: 'Wireless headphones; 129.99; 1\nUSB-C cable; 12.49; 3\nLaptop sleeve; 34.95; 1\nScreen cleaner; 6.99; 2\n# Format: description; price; quantity',
}

export default function SalesTaxCalculator() {
  const [s, set, reset] = useToolState('sales-tax-calculator', DEF)
  const m = (x: number) => money(x, s.currency)
  const rate = s.rate + s.local
  const r = s.mode === 'add' ? addTax(s.amount, rate) : s.mode === 'remove' ? removeTax(s.amount, rate) : { net: s.amount, gross: s.gross, tax: s.gross - s.amount }
  const found = findRate(s.amount, s.gross)
  const parsed = parseLines(s.lines)
  const inclusive = s.mode === 'remove'
  const b = batch(parsed.lines, rate, inclusive, s.perLine)
  const alt = batch(parsed.lines, rate, inclusive, !s.perLine).total
  const pick = (id: string) => {
    const p = s.presets.find((x) => x.id === id)
    if (p) set({ presetId: id, rate: p.rate })
  }
  const editPreset = (id: string, patch: Partial<Preset>) => set({ presets: s.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)), ...(id === s.presetId && patch.rate !== undefined ? { rate: patch.rate } : {}) })
  const summary = s.mode === 'rate'
    ? `Net ${m(s.amount)} → gross ${m(s.gross)}: tax ${m(r.tax)} = ${found.toFixed(3)}%`
    : `${m(round2(r.net))} + ${rate}% tax (${m(round2(r.tax))}) = ${m(round2(r.gross))}`

  return (
    <Split>
      <div>
        <Panel title="Calculate" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['add', 'Add tax'], ['remove', 'Remove tax (inclusive)'], ['rate', 'Find the rate']]} label="Mode" />
          <div style={{ marginTop: 10 }}>
            {s.mode === 'rate' ? (
              <Row>
                <Num label="Price before tax" value={s.amount} onChange={(amount) => set({ amount })} min={0} unit={s.currency.trim()} />
                <Num label="Price after tax" value={s.gross} onChange={(gross) => set({ gross })} min={0} unit={s.currency.trim()} />
              </Row>
            ) : (
              <Row>
                <Num label={s.mode === 'add' ? 'Price before tax (net)' : 'Price including tax (gross)'} value={s.amount} onChange={(amount) => set({ amount })} min={0} unit={s.currency.trim()} />
                <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', '₹', 'CHF ', 'A$', 'C$']} />
              </Row>
            )}
          </div>
          {s.mode !== 'rate' && (
            <>
              <Select label="Rate preset" value={s.presetId} onChange={pick} options={[...s.presets.map((p) => [p.id, `${p.name} — ${p.rate}%`] as [string, string]), ['custom', 'Custom rate']]} />
              <Row>
                <Num label="Tax rate" value={s.rate} onChange={(v) => set({ rate: v, presetId: s.presets.some((p) => p.id === s.presetId && p.rate === v) ? s.presetId : 'custom' })} min={0} max={100} unit="%" />
                <Num label="+ Local rate (county, city)" value={s.local} onChange={(local) => set({ local })} min={0} max={50} unit="%" />
              </Row>
            </>
          )}
          <Note tone="ok"><b>{summary}</b></Note>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {s.mode === 'add' && <>Tax = net × {rate}% · Gross = net × {(1 + rate / 100).toFixed(5)}</>}
            {s.mode === 'remove' && <>Net = gross ÷ {(1 + rate / 100).toFixed(5)} · Tax = gross − net. Tip: don't just subtract {rate}% of the gross; that understates the net price.</>}
            {s.mode === 'rate' && <>Rate = (gross ÷ net − 1) × 100</>}
          </p>
        </Panel>
        <Panel title="Rate presets" actions={<Btn onClick={() => set({ presets: [...s.presets, { id: uid(), name: 'My rate', rate: 0 }] })}>+ Preset</Btn>}>
          <Table
            max={8}
            head={['Name', 'Rate %', '']}
            rows={[...s.presets].sort((a, b) => (a.id === s.presetId ? -1 : b.id === s.presetId ? 1 : 0)).map((p) => [
              <input key="n" value={p.name} onChange={(e) => editPreset(p.id, { name: e.target.value })} aria-label="Preset name" style={{ fontWeight: p.id === s.presetId ? 700 : 400 }} />,
              <input key="r" type="number" min={0} step="0.001" value={p.rate} onChange={(e) => editPreset(p.id, { rate: Math.max(0, Number(e.target.value) || 0) })} aria-label="Rate" style={{ width: 80 }} />,
              <span key="a" style={{ whiteSpace: 'nowrap' }}><Btn kind="ghost" onClick={() => pick(p.id)}>Use</Btn><Btn kind="ghost" onClick={() => set({ presets: s.presets.filter((x) => x.id !== p.id) })} title="Delete">✕</Btn></span>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Rates change; check your local tax authority. Presets are saved in this browser.</p>
          <JsonButtons name="tax-presets.json" data={s.presets} onLoad={(presets) => Array.isArray(presets) && set({ presets })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Net (before tax)" value={m(round2(r.net))} />
          <Stat label={s.mode === 'rate' ? 'Tax amount' : `Tax @ ${rate}%`} value={m(round2(r.tax))} tone="accent" />
          <Stat label="Gross (total)" value={m(round2(r.gross))} />
          {s.mode === 'rate' && <Stat label="Effective rate" value={Number.isFinite(found) ? `${found.toFixed(3)}%` : '—'} tone="good" />}
        </Stats>
        {s.mode !== 'rate' && (
          <Panel title="Same price at other rates">
            <Table head={['Rate', 'Net', 'Tax', 'Gross']} rows={[5, 7.25, 8.875, 10, 13, 19, 20, 21, 23].map((x) => {
              const q = s.mode === 'add' ? addTax(s.amount, x) : removeTax(s.amount, x)
              return [<b key="x" style={{ color: x === rate ? 'var(--accent)' : undefined }}>{x}%</b>, m(round2(q.net)), m(round2(q.tax)), m(round2(q.gross))]
            })} />
          </Panel>
        )}
        <Panel title="Batch list" actions={<Check label="Batch mode" value={s.batchOn} onChange={(batchOn) => set({ batchOn })} />}>
          {s.batchOn ? (
            <>
              <Area label={`Items (${inclusive ? 'prices include tax' : 'prices before tax'}, ${rate}%)`} value={s.lines} onChange={(lines) => set({ lines })} rows={6} mono />
              {parsed.errors.map((e) => <Note key={e} tone="warn">{e}</Note>)}
              <Check label="Round tax on each line (receipt style)" value={s.perLine} onChange={(perLine) => set({ perLine })} />
              <Table
                head={['Item', 'Qty', 'Net', 'Tax', 'Gross']}
                rows={b.rows.map((x) => [x.label, x.qty, m(x.net), m(x.tax), m(x.gross)])}
                foot={['Total', parsed.lines.reduce((a, l) => a + l.qty, 0), m(b.total.net), m(b.total.tax), m(b.total.gross)]}
              />
              {alt.tax !== b.total.tax && <p className="muted" style={{ fontSize: 13 }}>Rounding {s.perLine ? 'once on the total' : 'per line'} would give {m(alt.tax)} tax instead ({m(round2(alt.tax - b.total.tax))}).</p>}
              <Row>
                <CsvButton name="sales-tax.csv" rows={() => [['Item', 'Qty', 'Net', 'Tax', 'Gross'], ...b.rows.map((x) => [x.label, x.qty, round2(x.net), round2(x.tax), round2(x.gross)]), ['Total', '', b.total.net, b.total.tax, b.total.gross]]} />
                <CopyButton text={() => b.rows.map((x) => `${x.label}\t${x.qty}\t${round2(x.net)}\t${round2(x.tax)}\t${round2(x.gross)}`).join('\n') + `\nTotal\t\t${b.total.net}\t${b.total.tax}\t${b.total.gross}`} label="Copy table" />
              </Row>
            </>
          ) : <p className="muted" style={{ margin: 0 }}>Turn on batch mode to calculate tax for a whole list of prices at once, e.g. an order or a price list. Paste lines like <code>Item; price; qty</code>.</p>}
        </Panel>
      </div>
    </Split>
  )
}
