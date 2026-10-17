import { useState } from 'react'
import { Btn, color, CopyButton, CsvButton, Donut, JsonButtons, Note, Num, Panel, pct, Row, Seg, Select, shareLink, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { consumablesFor, fmtW, type Gear, type Kind, totals, weightClass } from './lib/camping-gear-checklist'

const CATS = ['Shelter', 'Sleep', 'Pack', 'Kitchen', 'Water', 'Clothing', 'Safety & navigation', 'Hygiene', 'Food & water', 'Comfort', 'Other']

// Gear database: name | category | grams | kind (c = carried, w = worn, x = consumable) | in backpacking template | in car-camping template
const DB = `Backpacking tent 2P|Shelter|1500|c|1|0
Trekking-pole tent 1P|Shelter|750|c|0|0
Family tent 4P|Shelter|6500|c|0|1
Tarp|Shelter|450|c|0|1
Tent footprint|Shelter|200|c|1|1
Extra stakes (6)|Shelter|90|c|1|0
Sleeping bag 3-season|Sleep|1100|c|1|1
Down quilt|Sleep|650|c|0|0
Inflatable sleeping pad|Sleep|450|c|1|0
Self-inflating mattress|Sleep|1800|c|0|1
Inflatable pillow|Sleep|90|c|1|1
Backpack 50 L|Pack|1250|c|1|0
Pack liner|Pack|60|c|1|0
Daypack|Pack|450|c|0|1
Canister stove|Kitchen|85|c|1|0
Two-burner camp stove|Kitchen|5000|c|0|1
Fuel canister 230 g|Kitchen|370|x|1|0
Propane cylinder|Kitchen|900|x|0|1
Titanium pot 750 ml|Kitchen|110|c|1|0
Cookset & pans|Kitchen|1400|c|0|1
Long spoon|Kitchen|15|c|1|0
Lighter|Kitchen|20|c|1|1
Mug|Kitchen|80|c|0|1
Cooler|Kitchen|4500|c|0|1
Water filter|Water|85|c|1|0
Water bottle 1 L|Water|35|c|2|0
Water jug 20 L|Water|900|c|0|1
Purification tablets|Water|20|c|1|0
Rain jacket|Clothing|300|c|1|1
Puffy jacket|Clothing|350|c|1|1
Fleece|Clothing|300|c|0|1
Thermal base layer|Clothing|220|c|1|1
Spare hiking socks|Clothing|70|c|2|2
Beanie|Clothing|50|c|1|1
Hiking boots|Clothing|1100|w|1|0
Hiking shirt & shorts|Clothing|350|w|1|0
Sun hat|Clothing|80|w|1|1
Headlamp|Safety & navigation|80|c|1|1
First-aid kit|Safety & navigation|250|c|1|1
Map & compass|Safety & navigation|100|c|1|0
Phone|Safety & navigation|200|w|1|1
Power bank 10 000 mAh|Safety & navigation|200|c|1|1
Pocket knife|Safety & navigation|60|c|1|1
Whistle|Safety & navigation|10|c|1|0
Sunscreen|Safety & navigation|100|c|1|1
Bug spray|Safety & navigation|90|c|1|1
Toiletry kit|Hygiene|150|c|1|1
Trowel|Hygiene|50|c|1|0
Toilet paper|Hygiene|60|x|1|1
Hand sanitizer|Hygiene|50|c|1|1
Food (per day)|Food & water|700|x|3|0
Water carried (1 L)|Food & water|1000|x|2|0
Camp chair|Comfort|900|c|0|1
Camp shoes|Comfort|300|c|0|1
Lantern|Comfort|500|c|0|1`
  .split('\n')
  .map((l) => {
    const [name, cat, g, k, bp, car] = l.split('|')
    return { name, cat, grams: +g, kind: (k === 'w' ? 'worn' : k === 'x' ? 'consumable' : 'carried') as Kind, bp: +bp, car: +car }
  })

const template = (which: 'bp' | 'car'): Gear[] =>
  DB.filter((d) => d[which] > 0).map((d, i) => ({ id: uid(), name: d.name, cat: d.cat, grams: d.grams, qty: d[which], kind: d.kind, packed: which === 'bp' && i % 3 === 0, on: true }))

interface State { trip: string; unit: 'metric' | 'imperial'; gear: Gear[]; days: number; people: number }
const DEF: State = { trip: '3-day backpacking loop', unit: 'metric', gear: template('bp'), days: 3, people: 1 }

const KIND_ICON: Record<Kind, string> = { carried: '🎒', worn: '👕', consumable: '🍫' }

export default function CampingGearChecklist() {
  const [s, set, reset] = useToolState('camping-gear-checklist', DEF)
  const [pick, setPick] = useState(DB[0].name)
  const [hidePacked, setHidePacked] = useState(false)
  const t = totals(s.gear)
  const w = (g: number) => fmtW(g, s.unit)
  const edit = (id: string, p: Partial<Gear>) => set({ gear: s.gear.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const cats = CATS.filter((c) => s.gear.some((g) => g.cat === c)).concat([...new Set(s.gear.map((g) => g.cat))].filter((c) => !CATS.includes(c)))
  const heaviest = [...s.gear].filter((g) => g.on && g.kind === 'carried').sort((a, b) => b.grams * b.qty - a.grams * a.qty).slice(0, 3)
  const asText = () => `${s.trip}\n` + cats.map((c) => `\n${c}\n` + s.gear.filter((g) => g.cat === c && g.on).map((g) => `[${g.packed ? 'x' : ' '}] ${g.name}${g.qty > 1 ? ` ×${g.qty}` : ''} — ${w(g.grams * g.qty)}`).join('\n')).join('\n') + `\n\nBase ${w(t.base)} · Pack ${w(t.packWeight)} · Skin-out ${w(t.skinOut)}`
  const cons = consumablesFor(s.days, s.people, 2)

  return (
    <Split wide="left">
      <div>
        <Panel title="Gear list" actions={<>
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['metric', 'g/kg'], ['imperial', 'oz/lb']]} />
          <Btn kind="ghost" onClick={() => setHidePacked(!hidePacked)}>{hidePacked ? 'Show packed' : 'Hide packed'}</Btn>
        </>}>
          <Txt label="Trip" value={s.trip} onChange={(trip) => set({ trip })} />
          {cats.map((c, ci) => {
            const items = s.gear.filter((g) => g.cat === c && (!hidePacked || !g.packed))
            if (!items.length) return null
            return (
              <div key={c} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${color(ci)}`, padding: '4px 0', fontWeight: 800 }}>
                  <span>{c}</span><span className="muted" style={{ fontWeight: 600 }}>{w(s.gear.filter((g) => g.cat === c && g.on).reduce((a, g) => a + g.grams * g.qty, 0))}</span>
                </div>
                {items.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--line)', opacity: g.on ? 1 : 0.45, flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={g.packed} onChange={(e) => edit(g.id, { packed: e.target.checked })} aria-label={`Packed ${g.name}`} style={{ width: 18, height: 18 }} />
                    <input value={g.name} onChange={(e) => edit(g.id, { name: e.target.value })} aria-label="Item" style={{ flex: '1 1 140px', minWidth: 0, border: 0, background: 'none', fontWeight: 600, textDecoration: g.packed ? 'line-through' : undefined, color: 'inherit' }} />
                    <button type="button" title={`${g.kind} — click to change`} onClick={() => edit(g.id, { kind: g.kind === 'carried' ? 'worn' : g.kind === 'worn' ? 'consumable' : 'carried' })} style={{ border: '1px solid var(--line)', borderRadius: 6, background: 'none', cursor: 'pointer', padding: '1px 5px' }}>{KIND_ICON[g.kind]}</button>
                    <input type="number" min={0} value={g.grams} onChange={(e) => edit(g.id, { grams: Math.max(0, Number(e.target.value) || 0) })} aria-label="Grams each" style={{ width: 66 }} />
                    <span className="muted" style={{ fontSize: 12 }}>g ×</span>
                    <input type="number" min={0} value={g.qty} onChange={(e) => edit(g.id, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Quantity" style={{ width: 44 }} />
                    <span style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{w(g.grams * g.qty)}</span>
                    <input type="checkbox" checked={g.on} title="Bring on this trip" onChange={(e) => edit(g.id, { on: e.target.checked })} aria-label={`Bring ${g.name}`} />
                    <Btn kind="ghost" title="Remove" onClick={() => set({ gear: s.gear.filter((x) => x.id !== g.id) })}>✕</Btn>
                  </div>
                ))}
              </div>
            )
          })}
          <p className="muted" style={{ fontSize: 12.5 }}>☑ left = packed · ☑ right = bringing it this trip · {KIND_ICON.carried} carried / {KIND_ICON.worn} worn / {KIND_ICON.consumable} consumable (tap to switch). Weights are per item in grams.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Base weight" value={w(t.base)} sub={weightClass(t.base)} tone="accent" />
          <Stat label="Pack weight" value={w(t.packWeight)} sub={`+ ${w(t.consumable)} food, water, fuel`} />
          <Stat label="Skin-out" value={w(t.skinOut)} sub={`incl. ${w(t.worn)} worn`} />
          <Stat label="Packed" value={`${t.packed}/${t.items}`} sub={pct(t.packed / (t.items || 1), 0)} tone={t.packed === t.items && t.items ? 'good' : undefined} />
        </Stats>
        <Panel title="Pack weight by category">
          <Donut slices={Object.entries(t.byCat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: color(cats.indexOf(label)) }))} fv={w} center={<b>{w(t.packWeight)}</b>} />
          {heaviest.length > 0 && <Note>Heaviest carried items: {heaviest.map((g) => `${g.name} (${w(g.grams * g.qty)})`).join(', ')}. Upgrading the “big three” (shelter, sleep, pack) saves the most.</Note>}
        </Panel>
        <Panel title="Add gear">
          <Select label="From the gear database" value={pick} onChange={setPick} options={CATS.flatMap((c) => DB.filter((d) => d.cat === c).map((d) => [d.name, `${c} · ${d.name} (${w(d.grams)})`] as [string, string]))} />
          <Row>
            <Btn kind="primary" onClick={() => { const d = DB.find((x) => x.name === pick)!; set({ gear: [...s.gear, { id: uid(), name: d.name, cat: d.cat, grams: d.grams, qty: 1, kind: d.kind, packed: false, on: true }] }) }}>+ Add</Btn>
            <Btn onClick={() => set({ gear: [...s.gear, { id: uid(), name: 'Custom item', cat: 'Other', grams: 100, qty: 1, kind: 'carried', packed: false, on: true }] })}>+ Custom</Btn>
          </Row>
          <Row>
            <Num label="Days" value={s.days} min={1} max={30} onChange={(days) => set({ days })} />
            <Num label="People" value={s.people} min={1} max={12} onChange={(people) => set({ people })} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Plan ≈ {w(cons.food)} of food ({w(700)} per person-day) — carry water between sources only: each litre weighs 1 kg.</p>
        </Panel>
        <Panel title="Templates & sharing">
          <Row>
            <Btn onClick={() => confirm('Replace the list with the backpacking template?') && set({ gear: template('bp'), trip: '3-day backpacking loop' })}>🥾 Backpacking</Btn>
            <Btn onClick={() => confirm('Replace the list with the car-camping template?') && set({ gear: template('car'), trip: 'Weekend car camping' })}>🚗 Car camping</Btn>
            <Btn kind="ghost" onClick={() => set({ gear: s.gear.map((g) => ({ ...g, packed: false })) })}>Unpack all</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <Row>
            <CopyButton label="Copy checklist" text={asText} />
            <CopyButton label="Copy share link" text={() => shareLink(s)} />
            <CsvButton name="camping-gear.csv" rows={() => [['Category', 'Item', 'Grams each', 'Qty', 'Total g', 'Type', 'Packed', 'Bringing'], ...s.gear.map((g) => [g.cat, g.name, g.grams, g.qty, g.grams * g.qty, g.kind, g.packed ? 'yes' : 'no', g.on ? 'yes' : 'no'])]} />
            <JsonButtons name="camping-gear.json" data={s} onLoad={(d) => d && Array.isArray(d.gear) && set(d)} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>The share link carries the whole list inside the URL — nothing is uploaded. Your list is saved in this browser automatically.</p>
        </Panel>
      </div>
    </Split>
  )
}
