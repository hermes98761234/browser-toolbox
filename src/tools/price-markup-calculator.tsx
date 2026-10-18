import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, LineChart, money, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { batchPrice, breakdown, ENDINGS, marginToMarkup, markupToMargin, netPrice, roundEnding, type Dir, type Driver, type Ending } from './lib/price-markup-calculator'

interface State {
  mode: 'single' | 'batch'; currency: string
  cost: number; driver: Driver | 'gross'; value: number
  tax: number; ending: Ending; dir: Dir; roundGross: boolean
  batch: string; bDriver: 'markup' | 'margin'; bValue: number
}

const DEF: State = {
  mode: 'single', currency: '$', cost: 18.4, driver: 'markup', value: 0.65, tax: 8.25, ending: '.99', dir: 'up', roundGross: false,
  batch: 'Item,Cost,Markup %\nCeramic mug,4.20,\nLinen tea towel,6.75,\nCast-iron trivet,11.30,120\nBeeswax candle,3.10,\nWalnut serving board,22.00,80\nGift card holder,0.85,300',
  bDriver: 'markup', bValue: 1.5,
}

const QUICK = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.5, 2, 3]

export default function PriceMarkupCalculator() {
  const [s, set, reset] = useToolState<State>('price-markup-calculator', DEF)
  const tr = Math.max(0, s.tax) / 100
  const m = (x: number) => money(x, s.currency)

  const net = s.driver === 'gross' ? s.value / (1 + tr) : netPrice(s.cost, s.driver, s.value)
  const b = breakdown(s.cost, net, tr)
  const shelf0 = s.roundGross ? b.gross : b.net
  const shelf = roundEnding(shelf0, s.ending, s.dir)
  const rb = breakdown(s.cost, s.roundGross ? shelf / (1 + tr) : shelf, tr)
  const valid = Number.isFinite(net) && s.cost >= 0

  const rows = useMemo(() => batchPrice(s.batch, { driver: s.bDriver, value: s.bValue, taxRate: tr, ending: s.ending, dir: s.dir, roundGross: s.roundGross }), [s.batch, s.bDriver, s.bValue, tr, s.ending, s.dir, s.roundGross])
  const ok = rows.filter((r) => !r.error)
  const avgMargin = ok.length ? ok.reduce((a, r) => a + r.margin, 0) / ok.length : NaN

  const fin = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : 0)
  const rounding = (
    <Panel title="Rounding & tax">
      <Row>
        <Num label="Sales tax / VAT" value={s.tax} onChange={(tax) => set({ tax })} unit="%" min={0} max={100} />
        <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '¥', '₴', 'zł', 'CHF ', 'kr ']} />
      </Row>
      <Select label="Price ending" value={s.ending} onChange={(ending) => set({ ending })} options={ENDINGS} />
      <Seg value={s.dir} onChange={(dir) => set({ dir })} options={[['up', 'Round up'], ['nearest', 'Nearest'], ['down', 'Round down']]} />
      <Check label="Round the tax-inclusive shelf price (retail, EU/UK style)" value={s.roundGross} onChange={(roundGross) => set({ roundGross })} />
    </Panel>
  )

  return (
    <>
      <Row>
        <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['single', 'Single item'], ['batch', 'Batch CSV']]} />
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </Row>
      {s.mode === 'single' ? (
        <Split>
          <div>
            <Panel title="Edit any field — the others follow">
              <Num label="Unit cost" value={fin(s.cost, 4)} onChange={(cost) => set({ cost })} unit={s.currency.trim()} min={0} hint={`Price changes keep the ${s.driver === 'gross' ? 'tax-inclusive price' : s.driver} fixed`} />
              <Row>
                <Num label="Markup (on cost)" value={fin(b.markup * 100)} onChange={(v) => set({ driver: 'markup', value: v / 100 })} unit="%" min={-100} />
                <Num label="Margin (on price)" value={fin(b.margin * 100)} onChange={(v) => set({ driver: 'margin', value: v / 100 })} unit="%" max={99.99} />
              </Row>
              <Row>
                <Num label="Price excl. tax" value={fin(b.net)} onChange={(v) => set({ driver: 'price', value: v })} unit={s.currency.trim()} min={0} />
                <Num label="Price incl. tax" value={fin(b.gross)} onChange={(v) => set({ driver: 'gross', value: v })} unit={s.currency.trim()} min={0} />
              </Row>
              {!valid && <Note tone="err">A margin of 100 % or more is impossible — margin is profit divided by price.</Note>}
              {valid && b.profit < 0 && <Note tone="warn">This price is below cost: you lose {m(-b.profit)} per unit.</Note>}
            </Panel>
            {rounding}
          </div>
          <div>
            <Stats>
              <Stat label="Profit / unit" value={m(b.profit)} sub={`${pct(b.margin)} margin`} tone={b.profit >= 0 ? 'good' : 'bad'} />
              <Stat label="Markup" value={pct(b.markup)} sub={`× ${num(1 + b.markup, 3)} cost multiplier`} />
              <Stat label="Tax" value={m(b.tax)} sub={`${s.tax}% on ${m(b.net)}`} />
              <Stat label="Shelf price" value={m(shelf)} sub={s.ending === 'none' ? 'unrounded' : `${s.roundGross ? 'incl.' : 'excl.'} tax, from ${m(shelf0)}`} tone="accent" />
            </Stats>
            {s.ending !== 'none' && valid && (
              <Panel title="After rounding" actions={<Btn kind="primary" onClick={() => set(s.roundGross ? { driver: 'gross', value: shelf } : { driver: 'price', value: shelf })}>Use {m(shelf)}</Btn>}>
                <Table head={['', 'Exact', 'Rounded', 'Change']} rows={[
                  ['Price excl. tax', m(b.net), m(rb.net), m(rb.net - b.net)],
                  ['Price incl. tax', m(b.gross), m(rb.gross), m(rb.gross - b.gross)],
                  ['Profit', m(b.profit), m(rb.profit), m(rb.profit - b.profit)],
                  ['Markup', pct(b.markup), pct(rb.markup), `${num((rb.markup - b.markup) * 100, 2)} pts`],
                  ['Margin', pct(b.margin), pct(rb.margin), `${num((rb.margin - b.margin) * 100, 2)} pts`],
                ]} />
              </Panel>
            )}
            <Panel title="Markup vs margin" actions={<CopyButton label="Copy summary" text={() => `Cost ${m(s.cost)} · markup ${pct(b.markup)} · margin ${pct(b.margin)} · price ${m(b.net)} (+${s.tax}% tax = ${m(b.gross)}) · shelf ${m(shelf)}`} />}>
              <LineChart height={200} xLabel="Markup %" yLabel="Margin %" fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} yMin={0} yMax={100}
                series={[{ name: 'Margin', points: Array.from({ length: 61 }, (_, i) => [i * 5, markupToMargin(i * 0.05) * 100]), area: true }]}
                markers={Number.isFinite(b.markup) && b.markup >= 0 && b.markup <= 3 ? [{ x: b.markup * 100, label: `you: ${num(b.margin * 100, 1)} %` }] : []} />
              <Table head={['Markup', 'Margin', 'Price for this cost']} rows={QUICK.map((q) => [pct(q, 0), pct(markupToMargin(q), 1), m(s.cost * (1 + q))])} />
              <p className="muted" style={{ fontSize: 13 }}>Markup = profit ÷ cost. Margin = profit ÷ price. A 50 % margin needs a {pct(marginToMarkup(0.5), 0)} markup — mixing them up is the classic pricing mistake.</p>
            </Panel>
          </div>
        </Split>
      ) : (
        <Split wide="right">
          <div>
            <Panel title="Batch rule">
              <Seg value={s.bDriver} onChange={(bDriver) => set({ bDriver })} options={[['markup', 'Markup'], ['margin', 'Margin']]} />
              <Num label={`Default ${s.bDriver}`} value={fin(s.bValue * 100)} onChange={(v) => set({ bValue: v / 100 })} unit="%" />
              <Area label="Items: name, cost[, own %] — one per line" value={s.batch} onChange={(batch) => set({ batch })} rows={9} mono />
              <p className="muted" style={{ fontSize: 13 }}>Paste from a spreadsheet (comma, semicolon or tab separated). A third column overrides the default {s.bDriver} for that row.</p>
            </Panel>
            {rounding}
          </div>
          <div>
            <Stats>
              <Stat label="Items" value={ok.length} sub={rows.length > ok.length ? `${rows.length - ok.length} skipped` : 'all valid'} />
              <Stat label="Average margin" value={pct(avgMargin)} tone="accent" />
              <Stat label="Profit if 1 of each sold" value={m(ok.reduce((a, r) => a + r.net - r.cost, 0))} />
            </Stats>
            <Panel title="Price list" actions={<CsvButton name="price-list.csv" rows={() => [['Item', 'Cost', 'Price excl. tax', `Shelf price${s.roundGross ? ' incl. tax' : ''}`, 'Markup %', 'Margin %'], ...ok.map((r) => [r.name, r.cost.toFixed(2), r.net.toFixed(2), r.final.toFixed(2), (r.markup * 100).toFixed(1), (r.margin * 100).toFixed(1)])]} />}>
              <Table head={['Item', 'Cost', 'Net price', 'Shelf', 'Markup', 'Margin']} rows={rows.map((r) => r.error
                ? [r.name || '—', <span key="e" style={{ color: 'var(--err)' }}>{r.error}</span>, '', '', '', '']
                : [r.name, m(r.cost), m(r.net), <b key="f">{m(r.final)}</b>, pct(r.markup), pct(r.margin)])} />
            </Panel>
          </div>
        </Split>
      )}
    </>
  )
}
