import { useState } from 'react'
import { Bar, Btn, CopyButton, CsvButton, JsonButtons, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { mainDim, netPrice, parseSize, PER, rank, UNITS, type Item } from './lib/unit-price-comparer'

interface Saved { id: string; title: string; date: string; items: Item[] }
interface State { currency: string; title: string; perIdx: number; need: number; items: Item[]; saved: Saved[] }

const mk = (name: string, price: number, size: number, unit: string, packs = 1, discount = 0): Item => ({ id: uid(), name, price, size, unit, packs, discount })

const PRESETS: Record<string, { title: string; items: Item[] }> = {
  rice: { title: 'Rice', items: [mk('Small bag', 2.49, 500, 'g'), mk('Family bag', 4.29, 1, 'kg'), mk('Bulk sack', 18.9, 5, 'kg'), mk('Imported (oz)', 3.99, 32, 'oz')] },
  drinks: { title: 'Sparkling water', items: [mk('Single bottle', 1.29, 1, 'l'), mk('6-pack cans', 3.99, 330, 'ml', 6), mk('12-pack cans, 15% off', 7.49, 12, 'fl oz', 12, 15), mk('2 L bottle', 1.79, 2, 'l')] },
  paper: { title: 'Toilet rolls', items: [mk('4 rolls', 3.2, 4, 'each'), mk('9 rolls', 6.5, 9, 'each'), mk('24 rolls', 15.99, 24, 'each'), mk('2 × 12 multipack', 14.5, 12, 'each', 2)] },
  eggs: { title: 'Eggs', items: [mk('Half dozen', 2.19, 6, 'each'), mk('Dozen', 3.89, 1, 'dozen'), mk('Tray of 30', 8.75, 30, 'each')] },
}

const DEF: State = { currency: '$', title: PRESETS.rice.title, perIdx: 1, need: 5, items: PRESETS.rice.items, saved: [] }
const UNIT_OPTS = Object.entries(UNITS).map(([k, [, , n]]) => [k, `${k} (${n})`] as [string, string])

export default function UnitPriceComparer() {
  const [s, set, reset] = useToolState('unit-price-comparer', DEF)
  const [quick, setQuick] = useState('')
  const m = (x: number, d = 2) => (Number.isFinite(x) ? `${s.currency}${x.toFixed(d)}` : '—')
  const dim = mainDim(s.items) ?? 'mass'
  const bases = PER[dim]
  const [perLabel, perFactor] = bases[Math.min(s.perIdx, bases.length - 1)]
  const ranked = rank(s.items)
  const ok = ranked.filter((r) => r.comparable)
  const best = ok[0], worst = ok[ok.length - 1]
  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const needBase = s.need * perFactor
  const perShow = (x: number) => m(x * perFactor, x * perFactor < 1 ? 3 : 2)

  const addQuick = () => {
    // "Name, price, 6 x 330 ml"
    const parts = quick.split(',').map((x) => x.trim())
    const price = Number((parts[1] ?? '').replace(/[^\d.]/g, ''))
    const sz = parseSize(parts[2] ?? '')
    if (!parts[0] || !(price >= 0) || !sz) return
    set({ items: [...s.items, mk(parts[0], price, sz.size, sz.unit, sz.packs)] })
    setQuick('')
  }
  const save = () => {
    const entry: Saved = { id: uid(), title: s.title || 'Comparison', date: new Date().toISOString().slice(0, 10), items: s.items }
    set({ saved: [entry, ...s.saved.filter((x) => x.title !== entry.title)].slice(0, 30) })
  }
  const summary = () =>
    [`${s.title} — price per ${perLabel}`, ...ok.map((r) => `${r.rank}. ${r.item.name}: ${perShow(r.per)}${r.rank > 1 ? ` (+${pct(r.vsBest, 0)})` : ' ← cheapest'}`)].join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Comparison">
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
            <Select label="Show price per" value={Math.min(s.perIdx, bases.length - 1)} onChange={(perIdx) => set({ perIdx })} options={bases.map(([l], i) => [i, l] as [number, string])} />
          </Row>
          <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>Presets</div>
          <Row>
            {Object.entries(PRESETS).map(([k, p]) => (
              <Btn key={k} onClick={() => set({ title: p.title, items: p.items.map((i) => ({ ...i, id: uid() })), perIdx: 0 })}>{p.title}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Quick add">
          <Txt label="Name, price, size" value={quick} onChange={setQuick} placeholder="Store brand, 3.49, 2 x 500 g" hint="Sizes like 750 ml, 1.5 kg, 6 x 330 ml, 12 ct, 2 lb" />
          <Btn kind="primary" onClick={addQuick} disabled={!quick.trim()}>+ Add</Btn>
        </Panel>
        <Panel title="Saved comparisons" actions={<Btn onClick={save}>💾 Save current</Btn>}>
          {s.saved.length === 0 ? (
            <p className="muted">Nothing saved yet. Saved comparisons stay in this browser.</p>
          ) : (
            s.saved.map((sv) => (
              <Row key={sv.id} wrap={false}>
                <span style={{ flex: 1 }}>
                  <b>{sv.title}</b> <span className="muted">· {sv.items.length} items · {sv.date}</span>
                </span>
                <Btn onClick={() => set({ title: sv.title, items: sv.items })}>Open</Btn>
                <Btn kind="ghost" onClick={() => set({ saved: s.saved.filter((x) => x.id !== sv.id) })} title="Delete">✕</Btn>
              </Row>
            ))
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Cheapest" value={best ? best.item.name : '—'} sub={best ? `${perShow(best.per)} per ${perLabel}` : undefined} tone="good" />
          <Stat label="Priciest" value={worst && worst !== best ? worst.item.name : '—'} sub={worst && worst !== best ? `${perShow(worst.per)} per ${perLabel}` : undefined} tone="bad" />
          <Stat label="Spread" value={worst && best ? `+${pct(worst.vsBest, 0)}` : '—'} sub="priciest vs cheapest" />
        </Stats>
        <Panel
          title={`Price per ${perLabel}`}
          actions={
            <>
              <Btn onClick={() => set({ items: [...s.items, mk('New item', 1, 1, Object.entries(UNITS).find(([, u]) => u[0] === dim)?.[0] ?? 'g')] })}>+ Item</Btn>
              <CopyButton text={summary} label="Copy summary" />
              <CsvButton name="unit-prices.csv" rows={() => [['Rank', 'Item', 'Price', 'Discount %', 'Packs', 'Size', 'Unit', `Price per ${perLabel}`], ...ranked.map((r) => [r.comparable ? r.rank : '', r.item.name, r.item.price, r.item.discount, r.item.packs, r.item.size, r.item.unit, Number.isFinite(r.per) ? +(r.per * perFactor).toFixed(4) : ''])]} />
              <JsonButtons name="unit-prices.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['#', 'Item', 'Price', '% off', 'Packs ×', 'Size', 'Unit', `Per ${perLabel}`, '']}
            rows={ranked.map((r) => {
              const it = r.item
              const top = r.comparable && r.rank === 1
              return [
                <b key="r" style={{ color: top ? 'var(--ok)' : undefined }}>{r.comparable ? (top ? '★' : r.rank) : '—'}</b>,
                <input key="n" value={it.name} onChange={(e) => edit(it.id, { name: e.target.value })} aria-label="Item name" style={{ width: 120, fontWeight: top ? 700 : undefined }} />,
                <input key="p" type="number" min={0} step="0.01" value={it.price} onChange={(e) => edit(it.id, { price: Math.max(0, +e.target.value || 0) })} aria-label="Price" style={{ width: 66 }} />,
                <input key="d" type="number" min={0} max={100} value={it.discount} onChange={(e) => edit(it.id, { discount: Math.min(100, Math.max(0, +e.target.value || 0)) })} aria-label="Discount percent" style={{ width: 48 }} />,
                <input key="k" type="number" min={1} value={it.packs} onChange={(e) => edit(it.id, { packs: Math.max(1, Math.round(+e.target.value) || 1) })} aria-label="Packs" style={{ width: 44 }} />,
                <input key="s" type="number" min={0} value={it.size} onChange={(e) => edit(it.id, { size: Math.max(0, +e.target.value || 0) })} aria-label="Size" style={{ width: 60 }} />,
                <select key="u" value={it.unit} onChange={(e) => edit(it.id, { unit: e.target.value })} aria-label="Unit">
                  {UNIT_OPTS.map(([v]) => <option key={v} value={v}>{v}</option>)}
                </select>,
                <div key="v" style={{ minWidth: 100 }}>
                  {r.comparable ? (
                    <>
                      <b style={{ color: top ? 'var(--ok)' : undefined }}>{perShow(r.per)}</b>{' '}
                      <span className="muted" style={{ fontSize: 12 }}>{top ? 'best' : `+${pct(r.vsBest, 0)}`}</span>
                      <div style={{ marginTop: 3 }}><Bar value={r.per} max={worst?.per || 1} color={top ? 'var(--ok)' : r === worst ? 'var(--err)' : 'var(--accent)'} /></div>
                    </>
                  ) : (
                    <span className="muted">{Number.isFinite(r.per) ? `not ${dim}` : 'check inputs'}</span>
                  )}
                </div>,
                <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })} title="Remove">✕</Btn>,
              ]
            })}
          />
          {ranked.some((r) => !r.comparable) && (
            <Note tone="warn">Items measured in a different kind of unit than most ({dim}) can’t be compared directly (weight vs volume needs the product’s density) and are listed last.</Note>
          )}
        </Panel>
        {best && worst && worst !== best && (
          <Panel title="What it means for you">
            <Row>
              <Num label="I need" value={s.need} onChange={(need) => set({ need: Math.max(0, need) })} unit={perLabel} min={0} />
            </Row>
            <Table
              head={['Option', 'Packs to buy', 'You pay', `Cost of ${s.need} × ${perLabel}`]}
              rows={ok.map((r) => {
                const q = r.item.size * r.item.packs * UNITS[r.item.unit][1]
                const packs = q > 0 ? Math.ceil(needBase / q - 1e-9) : 0
                return [r.item.name, packs, m(packs * netPrice(r.item)), m(r.per * needBase)]
              })}
            />
            <Note tone="ok">
              Choosing <b>{best.item.name}</b> over <b>{worst.item.name}</b> saves {m((worst.per - best.per) * needBase)} on {s.need} × {perLabel} ({pct(1 - best.per / worst.per, 0)} less).
              Bigger isn’t always cheaper: check that you’ll use it before it expires.
            </Note>
          </Panel>
        )}
      </div>
    </Split>
  )
}
