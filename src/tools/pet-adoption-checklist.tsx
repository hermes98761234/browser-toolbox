import { useState } from 'react'
import { Bar, Btn, Check, CopyButton, download, JsonButtons, Note, Panel, Ring, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'

type Cat = 'B' | 'H' | 'S' | 'V' | 'W'
type Sp = 'dog' | 'cat' | 'rabbit' | 'guinea' | 'bird' | 'fish'
// [category, text, one-time low, high, monthly low, high, age filter: y = young only, a = adult only]
type Row5 = [Cat, string, number?, number?, number?, number?, ('y' | 'a')?]

const CATS: Record<Cat, string> = { B: 'Before you adopt', H: 'Prepare your home', S: 'Supplies to buy', V: 'Vet & paperwork', W: 'The first week' }
const SPECIES: Record<Sp, [string, string, boolean]> = {
  dog: ['🐶', 'Dog', true], cat: ['🐱', 'Cat', true], rabbit: ['🐰', 'Rabbit', false], guinea: ['🐹', 'Guinea pigs', false], bird: ['🐦', 'Budgies', false], fish: ['🐟', 'Aquarium fish', false],
}

const COMMON: Row5[] = [
  ['B', 'Check that your lease, landlord or building rules allow this pet'],
  ['B', 'Agree who feeds, cleans and exercises, and write it on a chore chart'],
  ['B', 'Check the household for allergies'],
  ['B', 'Plan care for holidays and travel (sitter, boarding, friend)'],
  ['V', 'Collect adoption records: vaccinations, health checks, microchip number'],
  ['V', 'Book a first vet check within the first week', 60, 150],
  ['V', 'Start an emergency fund for unexpected vet bills', 0, 0, 20, 50],
]

const DATA: Record<Sp, Row5[]> = {
  dog: [
    ['B', 'Match energy level and size to your home and schedule'],
    ['B', 'Plan how the dog will get out during long workdays (walker, daycare)'],
    ['H', 'Check fences and gates for gaps'], ['H', 'Move toxic plants, medicines, chocolate and xylitol out of reach'],
    ['H', 'Secure bins and hide cables'], ['H', 'Set up a quiet resting spot away from foot traffic'],
    ['S', 'Food and water bowls', 15, 40], ['S', 'Food (first bag, then monthly)', 40, 80, 40, 90], ['S', 'Collar with ID tag', 15, 35], ['S', 'Leash and harness', 30, 80],
    ['S', 'Crate or pen', 50, 150], ['S', 'Bed', 30, 100], ['S', 'Toys and chews', 20, 50, 10, 20], ['S', 'Treats for training', 0, 0, 10, 20],
    ['S', 'Poop bags', 0, 0, 5, 10], ['S', 'Brush and nail clippers', 20, 45], ['S', 'Enzyme cleaner for accidents', 10, 20],
    ['S', 'Puppy pads', 15, 30, 0, 0, 'y'], ['S', 'Teething toys', 15, 30, 0, 0, 'y'], ['S', 'Baby gate', 25, 60, 0, 0, 'y'],
    ['V', 'Core vaccinations (if not complete)', 75, 200], ['V', 'Spay / neuter (if not done)', 150, 500, 0, 0, 'a'], ['V', 'Microchip registration in your name', 0, 25],
    ['V', 'Local dog licence', 10, 30], ['V', 'Flea, tick and worm prevention', 0, 0, 20, 40], ['V', 'Pet insurance (optional)', 0, 0, 25, 70],
    ['W', 'Keep a predictable routine for meals, walks and sleep'], ['W', 'Toilet trips after waking, eating and playing'], ['W', 'Short, calm introductions to people and pets'],
    ['W', 'Start basic cues (sit, come) with rewards'], ['W', 'Puppy or basic training class', 100, 250],
  ],
  cat: [
    ['B', 'Decide indoor-only or supervised outdoor access'],
    ['H', 'Secure window screens and balcony'], ['H', 'Remove lilies and other toxic plants (lilies are deadly to cats)'], ['H', 'Hide strings, hair ties and cables'],
    ['H', 'Block small gaps behind appliances'], ['H', 'Prepare a safe room for the first days'],
    ['S', 'Litter box (one per cat plus one)', 20, 60], ['S', 'Litter', 0, 0, 15, 30], ['S', 'Litter scoop and mat', 10, 25], ['S', 'Food and water bowls (or a fountain)', 10, 40],
    ['S', 'Food', 0, 0, 25, 60], ['S', 'Carrier', 25, 60], ['S', 'Scratching post', 25, 80], ['S', 'Bed or blanket', 20, 50], ['S', 'Wand and ball toys', 15, 30, 5, 10],
    ['S', 'Brush and nail clippers', 15, 35], ['S', 'Breakaway collar with ID', 8, 20], ['S', 'Enzyme cleaner', 10, 20],
    ['S', 'Kitten food', 0, 0, 0, 0, 'y'], ['S', 'Low-entry litter tray', 10, 20, 0, 0, 'y'],
    ['V', 'Core vaccinations (if not complete)', 60, 150], ['V', 'Spay / neuter (if not done)', 100, 300, 0, 0, 'a'], ['V', 'Microchip registration in your name', 0, 25],
    ['V', 'Flea and worm prevention', 0, 0, 15, 25], ['V', 'Pet insurance (optional)', 0, 0, 15, 40],
    ['W', 'Keep the cat in one room for the first days'], ['W', 'Let the cat approach you; avoid forcing contact'], ['W', 'Keep litter away from food and water'],
    ['W', 'Two short play sessions a day'],
  ],
  rabbit: [
    ['B', 'Rabbits are social: consider adopting a bonded pair'], ['B', 'Find a vet experienced with rabbits'],
    ['H', 'Cover or lift cables; rabbits chew them'], ['H', 'Block gaps behind furniture'], ['H', 'Protect skirting boards and furniture legs'], ['H', 'Remove toxic houseplants'],
    ['S', 'Large pen or room area (not a small hutch)', 80, 200], ['S', 'Litter box', 15, 30], ['S', 'Paper-based litter', 0, 0, 15, 25], ['S', 'Hay (unlimited, the main diet)', 0, 0, 20, 40],
    ['S', 'Pellets', 0, 0, 10, 15], ['S', 'Fresh leafy greens', 0, 0, 20, 40], ['S', 'Heavy water bowl', 10, 20], ['S', 'Hide house', 20, 40], ['S', 'Chew toys', 15, 30, 5, 10],
    ['S', 'Brush and nail clippers', 15, 30], ['S', 'Carrier', 25, 50], ['S', 'Cable protectors', 15, 30],
    ['V', 'Spay / neuter (if not done)', 200, 500], ['V', 'Vaccinations where recommended in your area', 50, 120],
    ['W', 'Give a quiet space and let the rabbit come to you'], ['W', 'Check daily that it eats and produces droppings (no droppings for 12 h is an emergency)'], ['W', 'Sit on the floor at its level to build trust'],
  ],
  guinea: [
    ['B', 'Guinea pigs need company: adopt at least two'], ['B', 'Find a vet that treats guinea pigs'],
    ['H', 'Choose a draught-free spot away from direct sun and loud TVs'], ['H', 'Set up a safe floor-time area'],
    ['S', 'Cage of at least 0.7 m² (7.5 ft²) for two', 80, 200], ['S', 'Fleece liners or bedding', 40, 80, 15, 30], ['S', 'Hay rack and hay', 15, 25, 20, 35], ['S', 'Pellets', 0, 0, 10, 15],
    ['S', 'Vitamin C-rich vegetables (they cannot make their own)', 0, 0, 20, 35], ['S', 'Water bottles (one each)', 10, 20], ['S', 'Hideouts (one per animal)', 20, 40], ['S', 'Chew toys', 10, 20, 5, 10],
    ['S', 'Nail clippers', 8, 15], ['S', 'Carrier', 20, 40],
    ['W', 'Handle gently and close to the floor'], ['W', 'Weigh weekly to catch illness early'], ['W', 'Spot-clean the cage daily'],
  ],
  bird: [
    ['B', 'Budgies are flock birds: consider a pair'], ['B', 'Find an avian vet'],
    ['H', 'Never overheat non-stick pans near birds (the fumes are toxic)'], ['H', 'Avoid aerosols, candles and smoke near the cage'], ['H', 'Close windows and turn off ceiling fans during free flight'],
    ['H', 'Place the cage away from the kitchen and draughts'],
    ['S', 'Cage with bar spacing about 1 cm (½ in)', 60, 200], ['S', 'Perches of different widths and materials', 15, 30], ['S', 'Food and water dishes', 10, 20], ['S', 'Seed/pellet mix', 0, 0, 10, 20],
    ['S', 'Cuttlebone or mineral block', 5, 10], ['S', 'Toys (rotate weekly)', 15, 30, 5, 10], ['S', 'Cage cover for the night', 15, 30], ['S', 'Bird-safe cleaner', 10, 15],
    ['W', 'Let the birds settle for a few days before taming'], ['W', 'Talk softly near the cage'], ['W', 'Offer vegetables daily alongside the seed mix'],
  ],
  fish: [
    ['B', 'Cycle the tank for 4–6 weeks before adding fish (builds beneficial bacteria)'], ['B', 'Research adult sizes and compatible species'],
    ['H', 'Pick a sturdy level spot out of direct sun near a socket'], ['H', 'Make sure the floor can take the weight (about 1 kg per litre)'],
    ['S', 'Tank (75 L / 20 US gal or more is easier to keep stable)', 60, 200], ['S', 'Filter', 25, 80], ['S', 'Heater (tropical fish)', 20, 40], ['S', 'Thermometer', 5, 10],
    ['S', 'Light', 20, 60], ['S', 'Substrate', 15, 30], ['S', 'Plants and decor', 20, 60], ['S', 'Water conditioner', 8, 15, 3, 5], ['S', 'Water test kit', 25, 40],
    ['S', 'Net and gravel vacuum', 15, 30], ['S', 'Fish food', 5, 10, 5, 8], ['S', 'Stand (if needed)', 50, 150],
    ['W', 'Add only a few fish at first'], ['W', 'Test ammonia and nitrite daily for two weeks'], ['W', 'Weekly 20–25% water change'],
  ],
}

interface Custom { id: string; cat: Cat; text: string; low: number; high: number }
interface State { sp: Sp; young: boolean; currency: string; checked: Record<string, string[]>; custom: Record<string, Custom[]>; hideDone: boolean }
const DEF: State = { sp: 'dog', young: true, currency: '$', checked: { dog: ['Check the household for allergies', 'Food and water bowls', 'Collar with ID tag'] }, custom: {}, hideDone: false }

export default function PetAdoptionChecklist() {
  const [s, set, reset] = useToolState('pet-adoption-checklist', DEF)
  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState<Cat>('S')
  const [newCost, setNewCost] = useState('')
  const ageOk = (r: Row5) => !r[6] || (SPECIES[s.sp][2] && (r[6] === 'y') === s.young)
  const items = [...COMMON, ...DATA[s.sp]].filter(ageOk).map((r) => ({ key: r[1], cat: r[0], text: r[1], one: [r[2] ?? 0, r[3] ?? 0], mo: [r[4] ?? 0, r[5] ?? 0], custom: false }))
  const custom = (s.custom[s.sp] ?? []).map((c) => ({ key: c.id, cat: c.cat, text: c.text, one: [c.low, c.high], mo: [0, 0], custom: true }))
  const all = [...items, ...custom]
  const done = new Set(s.checked[s.sp] ?? [])
  const toggle = (k: string) => {
    const n = new Set(done)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    set({ checked: { ...s.checked, [s.sp]: [...n] } })
  }
  const m = (x: number) => `${s.currency}${Math.round(x).toLocaleString()}`
  const sum = (xs: typeof all, f: (i: (typeof all)[number]) => number) => xs.reduce((a, i) => a + f(i), 0)
  const oneL = sum(all, (i) => i.one[0]), oneH = sum(all, (i) => i.one[1]), moL = sum(all, (i) => i.mo[0]), moH = sum(all, (i) => i.mo[1])
  const shop = all.filter((i) => i.cat === 'S')
  const toBuy = shop.filter((i) => !done.has(i.key))
  const leftL = sum(all.filter((i) => !done.has(i.key)), (i) => i.one[0]), leftH = sum(all.filter((i) => !done.has(i.key)), (i) => i.one[1])
  const pctDone = all.length ? all.filter((i) => done.has(i.key)).length / all.length : 0
  const [emoji, name] = SPECIES[s.sp]

  const listText = () =>
    [`${name} shopping list`, '', ...toBuy.map((i) => `☐ ${i.text}${i.one[1] ? ` (${m(i.one[0])}–${m(i.one[1])})` : i.mo[1] ? ` (${m(i.mo[0])}–${m(i.mo[1])}/month)` : ''}`), '', `Estimated: ${m(leftL)}–${m(leftH)} one-time`].join('\n')
  const print = () => {
    const w = window.open('', '_blank', 'width=700,height=900')
    if (!w) return
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const rows = toBuy.map((i) => `<tr><td style="width:24px">☐</td><td>${esc(i.text)}</td><td style="text-align:right;white-space:nowrap">${i.one[1] ? `${m(i.one[0])}–${m(i.one[1])}` : i.mo[1] ? `${m(i.mo[0])}–${m(i.mo[1])}/mo` : ''}</td></tr>`).join('')
    w.document.write(`<!doctype html><title>${name} shopping list</title><body style="font:15px system-ui;margin:32px;color:#111"><h1 style="font-size:22px">${emoji} ${name} shopping list</h1><table style="width:100%;border-collapse:collapse" cellpadding="6">${rows}</table><p style="margin-top:20px"><b>Estimated one-time cost:</b> ${m(leftL)}–${m(leftH)} · <b>monthly:</b> ${m(moL)}–${m(moH)}</p><p style="color:#666;font-size:12px">Price ranges are rough estimates; local prices vary.</p></body>`)
    w.document.close()
    w.focus()
    w.print()
  }
  const addCustom = () => {
    if (!newText.trim()) return
    const c = Math.max(0, Number(newCost) || 0)
    set({ custom: { ...s.custom, [s.sp]: [...(s.custom[s.sp] ?? []), { id: uid(), cat: newCat, text: newText.trim(), low: c, high: c }] } })
    setNewText('')
    setNewCost('')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Your new pet">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(Object.keys(SPECIES) as Sp[]).map((k) => (
              <button key={k} type="button" className={`k-btn ${s.sp === k ? 'primary' : ''}`} onClick={() => set({ sp: k })} style={{ padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 26 }}>{SPECIES[k][0]}</span>{SPECIES[k][1]}
              </button>
            ))}
          </div>
          {SPECIES[s.sp][2] && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0' }}>
              <span className="muted">Age</span>
              <Seg value={s.young ? 'y' : 'a'} onChange={(v) => set({ young: v === 'y' })} options={[['y', s.sp === 'dog' ? 'Puppy' : 'Kitten'], ['a', 'Adult']]} />
            </div>
          )}
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
        </Panel>
        <Panel title="Cost estimate">
          <Table
            head={['', 'Low', 'High']}
            rows={[
              ['One-time setup', m(oneL), m(oneH)],
              ['Monthly', m(moL), m(moH)],
              [<b key="y">First year</b>, <b key="l">{m(oneL + 12 * moL)}</b>, <b key="h">{m(oneH + 12 * moH)}</b>],
            ]}
          />
          <p className="muted" style={{ fontSize: 12 }}>Rough typical retail ranges in the chosen currency’s units; prices vary a lot by country and brand. Adoption fees are not included.</p>
        </Panel>
        <Panel title="Add your own item">
          <Txt label="Item" value={newText} onChange={setNewText} placeholder="e.g. Cooling mat" />
          <Row>
            <Select label="Section" value={newCat} onChange={setNewCat} options={Object.entries(CATS).map(([k, v]) => [k as Cat, v] as [Cat, string])} />
            <Txt label="Cost (optional)" value={newCost} onChange={setNewCost} type="number" />
          </Row>
          <Btn kind="primary" onClick={addCustom} disabled={!newText.trim()}>+ Add</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Ready" value={<Ring value={pctDone} size={70} />} />
          <Stat label="Tasks done" value={`${all.filter((i) => done.has(i.key)).length} / ${all.length}`} />
          <Stat label="Still to buy" value={toBuy.length} sub={`${m(leftL)}–${m(leftH)} left`} tone="accent" />
        </Stats>
        <Panel
          title={`${emoji} ${name} checklist`}
          actions={
            <>
              <Check label="Hide done" value={s.hideDone} onChange={(hideDone) => set({ hideDone })} />
              <Btn onClick={print}>🖨 Print shopping list</Btn>
              <CopyButton text={listText} label="Copy list" />
              <Btn onClick={() => download(`${s.sp}-shopping-list.txt`, listText())}>⬇ .txt</Btn>
            </>
          }
        >
          {(Object.keys(CATS) as Cat[]).map((c) => {
            const its = all.filter((i) => i.cat === c)
            if (!its.length) return null
            const d = its.filter((i) => done.has(i.key)).length
            return (
              <div key={c} style={{ marginBottom: 14 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{CATS[c]}</b>
                  <span className="muted" style={{ fontSize: 13 }}>{d}/{its.length}</span>
                </Row>
                <Bar value={d} max={its.length} color={d === its.length ? 'var(--ok)' : 'var(--accent)'} />
                <div style={{ display: 'grid', gap: 2, marginTop: 6 }}>
                  {its.filter((i) => !(s.hideDone && done.has(i.key))).map((i) => (
                    <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label className="k-check" style={{ flex: 1, textDecoration: done.has(i.key) ? 'line-through' : undefined, opacity: done.has(i.key) ? 0.6 : 1 }}>
                        <input type="checkbox" checked={done.has(i.key)} onChange={() => toggle(i.key)} /> {i.text}
                      </label>
                      <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {i.one[1] ? `${m(i.one[0])}${i.one[1] !== i.one[0] ? `–${m(i.one[1])}` : ''}` : ''}{i.mo[1] ? `${i.one[1] ? ' + ' : ''}${m(i.mo[0])}–${m(i.mo[1])}/mo` : ''}
                      </span>
                      {i.custom && <Btn kind="ghost" title="Remove" onClick={() => set({ custom: { ...s.custom, [s.sp]: (s.custom[s.sp] ?? []).filter((x) => x.id !== i.key) } })}>✕</Btn>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {pctDone === 1 && <Note tone="ok">Everything is ready. Enjoy welcoming your new {name.toLowerCase().replace(/s$/, '')}! 🎉</Note>}
          <Row>
            <Btn kind="ghost" onClick={() => set({ checked: { ...s.checked, [s.sp]: [] } })}>Uncheck all</Btn>
            <JsonButtons name="pet-checklist.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
