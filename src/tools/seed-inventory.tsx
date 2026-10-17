import { useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { CROPS, germination, seedsNeeded, spotsNeeded, status, testRate, type Status } from './lib/seed-inventory'

interface Packet { id: string; crop: string; variety: string; year: number; qty: number; unit: 'seeds' | 'g'; tested: number | null; testYear: number | null; source: string; notes: string }

const Y = new Date().getFullYear()
const P = (crop: string, variety: string, age: number, qty: number, unit: 'seeds' | 'g', source: string, tested: number | null = null, notes = ''): Packet =>
  ({ id: uid(), crop, variety, year: Y - age, qty, unit, tested, testYear: tested === null ? null : Y - Math.max(0, age - 1), source, notes })

const DEF = {
  packets: [
    P('Tomato', 'San Marzano', 1, 40, 'seeds', 'Baker Creek'), P('Tomato', 'Sungold F1', 0, 15, 'seeds', 'Johnny’s'),
    P('Lettuce', 'Buttercrunch', 2, 1.5, 'g', 'Saved'), P('Carrot', 'Nantes', 3, 2, 'g', 'Local store', 0.62, 'Slow to germinate'),
    P('Bean', 'Provider bush', 1, 120, 'seeds', 'Saved'), P('Pea', 'Sugar Snap', 2, 80, 'seeds', 'Burpee'),
    P('Onion', 'Walla Walla', 1, 0.8, 'g', 'Johnny’s'), P('Pepper', 'Jalapeño', 3, 25, 'seeds', 'Swap'),
    P('Cucumber', 'Marketmore', 2, 30, 'seeds', 'Burpee'), P('Basil', 'Genovese', 1, 0.5, 'g', 'Baker Creek'),
    P('Squash', 'Butternut', 4, 18, 'seeds', 'Saved', 0.7), P('Parsnip', 'Hollow Crown', 2, 1, 'g', 'Local store'),
  ] as Packet[],
  calc: { id: '', plants: 24, loss: 15, perCell: 1 },
  filter: 'all' as 'all' | Status,
}

const TONE: Record<Status, string> = { fresh: 'var(--ok)', good: '#0ea5e9', aging: 'var(--warn)', replace: 'var(--err)' }
const info = (p: Packet) => {
  const [life, perG, g0] = CROPS[p.crop] ?? [3, 100, 80]
  const age = Y - p.year
  const g = p.tested !== null ? germination(p.tested, Y - (p.testYear ?? Y), life) : germination(g0 / 100, age, life)
  const seeds = p.unit === 'g' ? p.qty * perG : p.qty
  return { life, perG, age, g, seeds, st: status(age, life, g), left: Math.max(0, life - age) }
}

export default function SeedInventory() {
  const [s, set, reset] = useToolState('seed-inventory', DEF)
  const [draft, setDraft] = useState<Packet>(() => P('Kale', 'Lacinato', 0, 1, 'g', ''))
  const [test, setTest] = useState({ id: '', sown: 10, sprouted: 8 })
  const rows = s.packets.map((p) => ({ p, ...info(p) })).sort((a, b) => a.p.crop.localeCompare(b.p.crop) || a.p.variety.localeCompare(b.p.variety))
  const shown = rows.filter((r) => s.filter === 'all' || r.st === s.filter)
  const count = (st: Status) => rows.filter((r) => r.st === st).length
  const edit = (id: string, patch: Partial<Packet>) => set({ packets: s.packets.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const calcRow = rows.find((r) => r.p.id === s.calc.id) ?? rows[0]
  const c = s.calc
  const need = calcRow ? seedsNeeded(c.plants, calcRow.g, c.loss / 100, c.perCell) : 0
  const spots = calcRow ? spotsNeeded(c.plants, calcRow.g, c.loss / 100, c.perCell) : 0
  const testR = rows.find((r) => r.p.id === test.id) ?? rows[0]

  return (
    <Split wide="right">
      <div>
        <Panel title="Add a packet">
          <Row>
            <Select label="Crop" value={draft.crop} onChange={(crop) => setDraft({ ...draft, crop })} options={Object.keys(CROPS)} />
            <Txt label="Variety" value={draft.variety} onChange={(variety) => setDraft({ ...draft, variety })} />
          </Row>
          <Row>
            <Num label="Packed for year" min={1990} max={Y + 1} value={draft.year} onChange={(year) => setDraft({ ...draft, year })} />
            <Num label="Quantity" min={0} value={draft.qty} onChange={(qty) => setDraft({ ...draft, qty })} />
            <Select label="Unit" value={draft.unit} onChange={(unit) => setDraft({ ...draft, unit })} options={[['seeds', 'seeds'], ['g', 'grams']]} />
          </Row>
          <Txt label="Source" value={draft.source} onChange={(source) => setDraft({ ...draft, source })} placeholder="Shop, swap, saved…" />
          <Btn kind="primary" disabled={!draft.variety.trim() || draft.qty < 0} onClick={() => { set({ packets: [...s.packets, { ...draft, id: uid() }] }); setDraft({ ...draft, variety: '', id: uid() }) }}>+ Add packet</Btn>
        </Panel>
        <Panel title="Sowing calculator">
          <Select label="Packet" value={calcRow?.p.id ?? ''} onChange={(id) => set({ calc: { ...c, id } })} options={rows.map((r) => [r.p.id, `${r.p.crop} · ${r.p.variety} (${pct(r.g, 0)})`] as [string, string])} />
          <Row>
            <Num label="Plants wanted" min={1} value={c.plants} onChange={(plants) => set({ calc: { ...c, plants } })} />
            <Num label="Seedling losses" unit="%" min={0} max={90} value={c.loss} onChange={(loss) => set({ calc: { ...c, loss } })} />
            <Num label="Seeds per cell" min={1} max={6} step={1} value={c.perCell} onChange={(perCell) => set({ calc: { ...c, perCell: Math.max(1, Math.round(perCell)) } })} />
          </Row>
          {calcRow && (
            <>
              <Stats>
                <Stat label="Seeds to sow" value={need} sub={calcRow.p.unit === 'g' ? `≈ ${(need / calcRow.perG).toFixed(2)} g` : undefined} tone="accent" />
                <Stat label="Cells / spots" value={spots} sub={c.perCell > 1 ? 'thin to one plant' : undefined} />
                <Stat label="In stock" value={Math.round(calcRow.seeds)} sub="seeds (est.)" tone={calcRow.seeds >= need ? 'good' : 'bad'} />
              </Stats>
              {calcRow.seeds < need && <Note tone="warn">Not enough seed: order about {Math.ceil(need - calcRow.seeds)} more, or sow two per cell.</Note>}
            </>
          )}
        </Panel>
        <Panel title="Germination test">
          <p className="muted" style={{ marginTop: 0 }}>Roll 10–20 seeds in a damp paper towel, keep warm, count sprouts after the usual germination time.</p>
          <Select label="Packet" value={testR?.p.id ?? ''} onChange={(id) => setTest({ ...test, id })} options={rows.map((r) => [r.p.id, `${r.p.crop} · ${r.p.variety}`] as [string, string])} />
          <Row>
            <Num label="Seeds tested" min={1} value={test.sown} onChange={(sown) => setTest({ ...test, sown })} />
            <Num label="Sprouted" min={0} max={test.sown} value={test.sprouted} onChange={(sprouted) => setTest({ ...test, sprouted })} />
          </Row>
          <Btn disabled={!testR || !(test.sprouted <= test.sown)} onClick={() => testR && edit(testR.p.id, { tested: testRate(test.sown, test.sprouted), testYear: Y })}>
            Record {pct(testRate(test.sown, test.sprouted), 0)} germination
          </Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Packets" value={rows.length} sub={`${new Set(rows.map((r) => r.p.crop)).size} crops`} />
          <Stat label="Fresh / good" value={count('fresh') + count('good')} tone="good" />
          <Stat label="Use this year" value={count('aging')} sub="at end of typical life" tone="accent" />
          <Stat label="Replace" value={count('replace')} tone={count('replace') ? 'bad' : undefined} />
        </Stats>
        <Panel
          title="Inventory"
          actions={
            <>
              <Select label="" value={s.filter} onChange={(filter) => set({ filter })} options={[['all', 'All'], ['fresh', 'Fresh'], ['good', 'Good'], ['aging', 'Use soon'], ['replace', 'Replace']]} />
              <CsvButton name="seed-inventory.csv" rows={() => [['Crop', 'Variety', 'Year', 'Quantity', 'Unit', 'Est. seeds', 'Est. germination', 'Status', 'Source', 'Notes'], ...rows.map((r) => [r.p.crop, r.p.variety, r.p.year, r.p.qty, r.p.unit, Math.round(r.seeds), (r.g * 100).toFixed(0) + '%', r.st, r.p.source, r.p.notes])]} />
              <JsonButtons name="seed-inventory.json" data={s.packets} onLoad={(packets) => Array.isArray(packets) && set({ packets })} />
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <Table
            head={['Crop / variety', 'Year', 'Qty', 'Germ.', 'Status', '']}
            rows={shown.map((r) => [
              <div key="n"><b>{r.p.crop}</b> <span className="muted">{r.p.variety}</span>{r.p.source && <div className="muted" style={{ fontSize: 12 }}>{r.p.source}{r.p.notes && ` · ${r.p.notes}`}</div>}</div>,
              <span key="y">{r.p.year}<div className="muted" style={{ fontSize: 12 }}>{r.age} yr old</div></span>,
              <span key="q" style={{ whiteSpace: 'nowrap' }}>
                <input type="number" min={0} step="any" value={r.p.qty} aria-label="Quantity" style={{ width: 64 }} onChange={(e) => edit(r.p.id, { qty: Math.max(0, Number(e.target.value) || 0) })} /> {r.p.unit}
                {r.p.unit === 'g' && <div className="muted" style={{ fontSize: 12 }}>≈ {Math.round(r.seeds)} seeds</div>}
              </span>,
              <span key="g"><b>{pct(r.g, 0)}</b><div className="muted" style={{ fontSize: 12 }}>{r.p.tested !== null ? `tested ${r.p.testYear}` : 'estimated'}</div></span>,
              <span key="s" style={{ color: TONE[r.st], fontWeight: 700 }}>{{ fresh: 'Fresh', good: 'Good', aging: 'Use now', replace: 'Replace' }[r.st]}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{r.left ? `${r.left} yr left` : 'past typical life'}</div></span>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ packets: s.packets.filter((p) => p.id !== r.p.id) })}>✕</Btn>,
            ])}
          />
          {!shown.length && <Note>No packets match this filter.</Note>}
        </Panel>
        <Panel title="Estimated germination">
          <BarChart bars={rows.map((r) => ({ label: r.p.crop, value: Math.round(r.g * 100), color: TONE[r.st] }))} fy={(v) => `${v}%`} height={200} />
        </Panel>
        <Panel title="Viability by age (typical, cool & dry storage)">
          <Table
            head={['Years', 'Crops']}
            rows={[1, 2, 3, 4, 5].map((y) => [`${y}${y === 5 ? '+' : ''}`, Object.entries(CROPS).filter(([, v]) => v[0] === y).map(([k]) => k).join(', ')])}
          />
          <Note>Estimate: germination starts at a typical fresh rate and halves by the end of the crop’s typical life. A germination test replaces the estimate. Store seed in an airtight jar in the fridge to stretch these numbers.</Note>
        </Panel>
      </div>
    </Split>
  )
}
