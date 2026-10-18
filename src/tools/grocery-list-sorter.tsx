import { useState } from 'react'
import { Area, Bar, Btn, CopyButton, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { classify, groupItems, KEYWORDS, normalize, parseLine, SECTIONS, toText, type Item, type Store } from './lib/grocery-list-sorter'

const ALL = SECTIONS.map((s) => s.id).filter((id) => id !== 'other')

interface State { items: Item[]; stores: Store[]; storeId: string; overrides: Record<string, string>; hideDone: boolean }

const mk = (name: string, qty = '', done = false): Item => ({ id: uid(), name, qty, done })
const DEF: State = {
  items: [
    mk('Bananas', '6'), mk('Cherry tomatoes'), mk('Spinach'), mk('Sourdough loaf'), mk('Greek yogurt', '2'), mk('Eggs', '×12'), mk('Butter'),
    mk('Chicken thighs', '1 kg'), mk('Salmon fillets', '2'), mk('Penne', '500 g'), mk('Chopped tomatoes', '3 tins'), mk('Peanut butter'), mk('Coffee beans'),
    mk('Frozen peas'), mk('Vanilla ice cream'), mk('Olive oil'), mk('Paprika'), mk('Sparkling water', '6'), mk('Dark chocolate'), mk('Dishwasher tablets'),
    mk('Toothpaste'), mk('Cat litter'), mk('Soy sauce'), mk('Parmesan'), mk('Batteries AA', '', true), mk('Birthday candles'),
  ],
  stores: [
    { id: 'super', name: 'Big supermarket', order: ['produce', 'bakery', 'deli', 'meat', 'dairy', 'pasta', 'canned', 'world', 'baking', 'breakfast', 'snacks', 'drinks', 'baby', 'pet', 'personal', 'household', 'frozen'], labels: { produce: 'Entrance', bakery: 'Back left', meat: 'Back wall', dairy: 'Aisle 2', pasta: 'Aisle 4', canned: 'Aisle 5', world: 'Aisle 5', baking: 'Aisle 6', breakfast: 'Aisle 7', snacks: 'Aisle 8', drinks: 'Aisle 9', household: 'Aisle 12', frozen: 'Before tills' } },
    { id: 'corner', name: 'Corner shop', order: ['drinks', 'snacks', 'dairy', 'bakery', 'produce', 'canned', 'pasta', 'breakfast', 'household', 'personal', 'frozen', 'meat', 'deli', 'baking', 'world', 'baby', 'pet'], labels: {} },
  ],
  storeId: 'super',
  overrides: { 'birthday candle': 'baking' },
  hideDone: false,
}

export default function GroceryListSorter() {
  const [s, set, reset] = useToolState('grocery-list-sorter', DEF)
  const [paste, setPaste] = useState('')
  const [tab, setTab] = useState<'list' | 'layout' | 'learned'>('list')
  const store = s.stores.find((x) => x.id === s.storeId) ?? s.stores[0]
  const groups = groupItems(s.items, store, s.overrides)
  const done = s.items.filter((i) => i.done).length
  const sec = (id: string) => SECTIONS.find((x) => x.id === id) ?? SECTIONS[SECTIONS.length - 1]

  const add = () => {
    const parsed = paste.split(/\n|;/).map(parseLine).filter((p): p is NonNullable<typeof p> => !!p)
    if (!parsed.length) return
    const have = new Set(s.items.map((i) => normalize(i.name)))
    set({ items: [...s.items, ...parsed.filter((p) => !have.has(normalize(p.name))).map((p) => mk(p.name, p.qty))] })
    setPaste('')
  }
  const editItem = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const moveTo = (it: Item, section: string) =>
    set({ items: s.items.map((i) => (i.id === it.id ? { ...i, section: undefined } : i)), overrides: { ...s.overrides, [normalize(it.name)]: section } })
  const editStore = (p: Partial<Store>) => set({ stores: s.stores.map((x) => (x.id === store.id ? { ...x, ...p } : x)) })
  const order = [...store.order, ...ALL.filter((id) => !store.order.includes(id))]
  const move = (i: number, d: number) => {
    const o = [...order]
    const j = i + d
    if (j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j], o[i]]
    editStore({ order: o })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Add items">
          <Area value={paste} onChange={setPaste} rows={5} placeholder={'Paste or type, one per line:\n2 x milk\n500 g flour\nbananas\neggs x12'} />
          <Row>
            <Btn kind="primary" onClick={add} disabled={!paste.trim()}>+ Add to list</Btn>
            <Btn kind="ghost" onClick={() => setPaste('apples\n2 x oat milk\nbagels\nmozzarella\nrice (1kg)\nshampoo\nkidney beans x2\nbin bags')}>Example</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Quantities like “2 x”, “500 g”, “×3” or “(1kg)” are recognised. Duplicates are skipped. Each item is placed by a built-in keyword map ({SECTIONS.length} sections, {Object.values(KEYWORDS).flat().length} keywords); fix any item with its section menu and the tool remembers it.</p>
        </Panel>
        <Panel title="Store">
          <Row>
            <label className="k-field">
              <span className="k-label">Shopping at</span>
              <select className="k-select" value={store.id} onChange={(e) => set({ storeId: e.target.value })}>
                {s.stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <Txt label="Rename" value={store.name} onChange={(name) => editStore({ name })} />
          </Row>
          <Row>
            <Btn onClick={() => { const id = uid(); set({ stores: [...s.stores, { id, name: 'New store', order: [...ALL], labels: {} }], storeId: id }); setTab('layout') }}>+ New store</Btn>
            <Btn onClick={() => { const id = uid(); set({ stores: [...s.stores, { ...store, id, name: `${store.name} copy` }], storeId: id }) }}>Duplicate</Btn>
            <Btn kind="ghost" disabled={s.stores.length < 2} onClick={() => set({ stores: s.stores.filter((x) => x.id !== store.id), storeId: s.stores.find((x) => x.id !== store.id)!.id })}>Delete</Btn>
          </Row>
        </Panel>
        <Stats>
          <Stat label="Items" value={s.items.length} />
          <Stat label="In basket" value={`${done} / ${s.items.length}`} tone={done && done === s.items.length ? 'good' : undefined} />
          <Stat label="Sections to visit" value={groups.filter((g) => g.items.some((i) => !i.done)).length} />
        </Stats>
        <Bar value={done} max={s.items.length || 1} color="var(--ok)" />
      </div>

      <div>
        <Row>
          <Seg value={tab} onChange={setTab} options={[['list', '🛒 Sorted list'], ['layout', '🗺️ Store layout'], ['learned', '🧠 Learned items']]} />
        </Row>
        {tab === 'list' && (
          <Panel
            title={`Route through ${store.name}`}
            actions={
              <>
                <Btn kind="ghost" onClick={() => set({ hideDone: !s.hideDone })}>{s.hideDone ? 'Show ticked' : 'Hide ticked'}</Btn>
                <CopyButton text={() => toText(groups, store)} label="Copy list" />
                <Btn onClick={() => set({ items: s.items.filter((i) => !i.done) })} disabled={!done}>Clear ticked</Btn>
                <Btn kind="ghost" onClick={() => set({ items: s.items.map((i) => ({ ...i, done: false })) })}>Untick all</Btn>
              </>
            }
          >
            {!s.items.length && <Note>Your list is empty. Add items on the left.</Note>}
            {groups.map((g, gi) => {
              const items = g.items.filter((i) => !s.hideDone || !i.done)
              if (!items.length) return null
              const meta = sec(g.section)
              const left = g.items.filter((i) => !i.done).length
              return (
                <div key={g.section} style={{ marginBottom: 14, opacity: left ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '2px solid var(--line)' }}>
                    <span style={{ fontWeight: 800, color: 'var(--muted)', minWidth: 22 }}>{gi + 1}</span>
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <b style={{ flex: 1 }}>{meta.name}</b>
                    {store.labels[g.section] && <span className="muted" style={{ fontSize: 13 }}>{store.labels[g.section]}</span>}
                    <span className="muted" style={{ fontSize: 13 }}>{left ? `${left} left` : '✓ done'}</span>
                  </div>
                  {items.map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0 5px 30px', borderBottom: '1px solid var(--line)' }}>
                      <input type="checkbox" checked={it.done} onChange={(e) => editItem(it.id, { done: e.target.checked })} style={{ width: 20, height: 20 }} aria-label={`Got ${it.name}`} />
                      <input value={it.name} onChange={(e) => editItem(it.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textDecoration: it.done ? 'line-through' : undefined }} aria-label="Item" />
                      <input value={it.qty} onChange={(e) => editItem(it.id, { qty: e.target.value })} placeholder="qty" style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6, background: 'transparent', color: 'inherit', padding: '2px 6px' }} aria-label="Quantity" />
                      <select value={g.section} onChange={(e) => moveTo(it, e.target.value)} title="Move to section (remembered)" style={{ maxWidth: 46, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', color: 'inherit' }} aria-label="Section">
                        {SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}
                      </select>
                      <Btn kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((i) => i.id !== it.id) })}>✕</Btn>
                    </div>
                  ))}
                </div>
              )
            })}
          </Panel>
        )}
        {tab === 'layout' && (
          <Panel title={`Layout of ${store.name}`} actions={<Btn kind="ghost" onClick={() => editStore({ order: [...ALL], labels: {} })}>Default order</Btn>}>
            <p className="muted" style={{ fontSize: 13 }}>Order the sections the way you walk through this store. Labels (aisle numbers, “back wall”) appear on the sorted list. “Other” is always last.</p>
            <Table
              head={['#', 'Section', 'Aisle / label', 'Items', '']}
              rows={order.map((id, i) => [
                i + 1,
                <span key="n" style={{ whiteSpace: 'nowrap' }}>{sec(id).icon} {sec(id).name}</span>,
                <input key="l" value={store.labels[id] ?? ''} placeholder="e.g. Aisle 3" onChange={(e) => editStore({ labels: { ...store.labels, [id]: e.target.value } })} style={{ width: 120 }} aria-label="Label" />,
                s.items.filter((it) => (it.section ?? classify(it.name, s.overrides)) === id).length || '',
                <span key="m" style={{ whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Earlier">▲</Btn>
                  <Btn kind="ghost" onClick={() => move(i, 1)} disabled={i === order.length - 1} title="Later">▼</Btn>
                </span>,
              ])}
            />
          </Panel>
        )}
        {tab === 'learned' && (
          <Panel title="Learned items" actions={<JsonButtons name="grocery-lists.json" data={s} onLoad={(d) => Array.isArray(d.items) && Array.isArray(d.stores) && set(d)} />}>
            <p className="muted" style={{ fontSize: 13 }}>Your corrections override the built-in keyword map. They apply to every store and future lists.</p>
            {Object.keys(s.overrides).length ? (
              <Table
                head={['Item (normalised)', 'Section', '']}
                rows={Object.entries(s.overrides).map(([k, v]) => [
                  k,
                  <select key="s" value={v} onChange={(e) => set({ overrides: { ...s.overrides, [k]: e.target.value } })}>{SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>,
                  <Btn key="x" kind="ghost" onClick={() => { const o = { ...s.overrides }; delete o[k]; set({ overrides: o }) }}>✕</Btn>,
                ])}
              />
            ) : <Note>No corrections yet.</Note>}
            <Row><Btn kind="ghost" onClick={reset}>Reset everything to sample</Btn></Row>
          </Panel>
        )}
      </div>
    </Split>
  )
}
