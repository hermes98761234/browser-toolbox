import { Bar, Btn, CopyButton, CsvButton, Donut, JsonButtons, money, Note, Panel, Row, Seg, Select, shareLink, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { balances, exactGap, settle, shares, type Expense, type Person, type SplitMode } from './lib/bill-split-calculator'

interface State { title: string; cur: string; people: Person[]; expenses: Expense[] }

const DEF: State = {
  title: 'Lake weekend',
  cur: '$',
  people: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }, { id: 'p3', name: 'Jordan' }, { id: 'p4', name: 'Riley' }],
  expenses: [
    { id: 'e1', desc: 'Cabin rental (2 nights)', amount: 480, payer: 'p1', mode: 'equal', parts: { p1: 1, p2: 1, p3: 1, p4: 1 } },
    { id: 'e2', desc: 'Groceries', amount: 136.4, payer: 'p2', mode: 'equal', parts: { p1: 1, p2: 1, p3: 1, p4: 1 } },
    { id: 'e3', desc: 'Fuel (Jordan drove only 2 of us)', amount: 72, payer: 'p3', mode: 'equal', parts: { p3: 1, p4: 1 } },
    { id: 'e4', desc: 'Kayak hire (Riley took a double)', amount: 90, payer: 'p4', mode: 'weights', parts: { p1: 1, p2: 1, p4: 2 } },
    { id: 'e5', desc: 'Dinner out', amount: 154.75, payer: 'p2', mode: 'exact', parts: { p1: 41.5, p2: 35.25, p3: 48, p4: 30 } },
  ],
}

const MODES: [SplitMode, string][] = [['equal', 'Equally'], ['weights', 'By shares'], ['exact', 'Exact amounts']]

export default function BillSplitCalculator() {
  const [s, set, reset] = useToolState('bill-split-calculator', DEF)
  const m = (x: number) => money(x, s.cur)
  const name = (id: string) => s.people.find((p) => p.id === id)?.name || '?'
  const bal = balances(s.people, s.expenses)
  const transfers = settle(bal)
  const total = s.expenses.reduce((a, e) => a + e.amount, 0)
  const maxAbs = Math.max(1, ...bal.map((b) => Math.abs(b.net)))
  const editE = (id: string, p: Partial<Expense>) => set({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const setPart = (e: Expense, pid: string, v: number) => editE(e.id, { parts: { ...e.parts, [pid]: v } })
  const summary = () =>
    [`${s.title} — total ${m(total)}`, ...transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${m(t.amount)}`), transfers.length ? '' : 'Everyone is settled up.'].filter(Boolean).join('\n')

  const addPerson = () => {
    const id = uid()
    set({ people: [...s.people, { id, name: `Person ${s.people.length + 1}` }], expenses: s.expenses.map((e) => (e.mode === 'equal' ? { ...e, parts: { ...e.parts, [id]: 1 } } : e)) })
  }
  const removePerson = (id: string) =>
    set({
      people: s.people.filter((p) => p.id !== id),
      expenses: s.expenses.filter((e) => e.payer !== id).map((e) => {
        const parts = { ...e.parts }
        delete parts[id]
        return { ...e, parts }
      }),
    })

  return (
    <Split wide="right">
      <div>
        <Panel title="Group" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <label className="k-field"><span className="k-label">Name</span><input className="k-text" value={s.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ', 'kr ']} />
          </Row>
          {s.people.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input className="k-text" value={p.name} aria-label="Person name" onChange={(e) => set({ people: s.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} style={{ flex: 1 }} />
              <Btn kind="ghost" title="Remove (also removes expenses they paid)" disabled={s.people.length <= 2} onClick={() => removePerson(p.id)}>✕</Btn>
            </div>
          ))}
          <Row>
            <Btn onClick={addPerson}>+ Person</Btn>
            <CopyButton label="Share link" text={() => shareLink(s)} />
            <JsonButtons name="bill-split.json" data={s} onLoad={(d) => Array.isArray(d?.people) && Array.isArray(d?.expenses) && set({ ...DEF, ...d })} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5 }}>The share link carries the whole split in the URL, so friends can open it and check the maths. Nothing is uploaded.</p>
        </Panel>
        <Panel title={`Expenses (${s.expenses.length})`} actions={<Btn onClick={() => set({ expenses: [...s.expenses, { id: uid(), desc: 'New expense', amount: 0, payer: s.people[0]?.id ?? '', mode: 'equal', parts: Object.fromEntries(s.people.map((p) => [p.id, 1])) }] })}>+ Expense</Btn>}>
          {s.expenses.map((e) => {
            const sh = shares(e, s.people)
            const gap = e.mode === 'exact' ? exactGap(e) : 0
            return (
              <div key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="k-text" value={e.desc} aria-label="Description" onChange={(ev) => editE(e.id, { desc: ev.target.value })} style={{ flex: '2 1 160px' }} />
                  <input className="k-text" type="number" min={0} step={0.01} value={e.amount} aria-label="Amount" onChange={(ev) => editE(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })} style={{ flex: '1 1 80px', width: 90 }} />
                  <Btn kind="ghost" title="Delete expense" onClick={() => set({ expenses: s.expenses.filter((x) => x.id !== e.id) })}>✕</Btn>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
                  <span className="muted" style={{ fontSize: 13 }}>paid by</span>
                  <select className="k-select" value={e.payer} onChange={(ev) => editE(e.id, { payer: ev.target.value })} aria-label="Payer" style={{ width: 'auto' }}>
                    {s.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Seg value={e.mode} onChange={(mode) => editE(e.id, { mode, parts: mode === 'exact' ? sh : mode === 'weights' ? Object.fromEntries(s.people.map((p) => [p.id, sh[p.id] > 0 ? 1 : 0])) : Object.fromEntries(s.people.filter((p) => sh[p.id] > 0).map((p) => [p.id, 1])) })} options={MODES} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                  {s.people.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      {e.mode === 'equal' ? (
                        <input type="checkbox" checked={!!e.parts[p.id]} onChange={(ev) => {
                          const parts = { ...e.parts }
                          if (ev.target.checked) parts[p.id] = 1
                          else delete parts[p.id]
                          editE(e.id, { parts })
                        }} />
                      ) : (
                        <input type="number" min={0} step={e.mode === 'exact' ? 0.01 : 0.5} value={e.parts[p.id] ?? 0} aria-label={`${p.name} ${e.mode === 'exact' ? 'amount' : 'shares'}`} onChange={(ev) => setPart(e, p.id, Math.max(0, Number(ev.target.value) || 0))} style={{ width: 62 }} />
                      )}
                      <span>{p.name}<br /><span className="muted">{m(sh[p.id] ?? 0)}</span></span>
                    </label>
                  ))}
                </div>
                {gap !== 0 && <Note tone="warn">Exact amounts are {m(Math.abs(gap))} {gap > 0 ? 'short of' : 'over'} the total.</Note>}
                {e.mode !== 'exact' && Object.values(e.parts).every((v) => !v) && <Note tone="warn">Nobody shares this expense yet.</Note>}
              </div>
            )
          })}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Total spent" value={m(total)} sub={`${s.expenses.length} expenses`} />
          <Stat label="Average per person" value={m(total / (s.people.length || 1))} />
          <Stat label="Transfers to settle" value={transfers.length} tone="accent" sub={`at most ${Math.max(0, s.people.length - 1)} needed`} />
        </Stats>
        <Panel title="Settle up" actions={<CopyButton text={summary} label="Copy summary" />}>
          {transfers.length ? (
            transfers.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <b style={{ flex: 1, textAlign: 'right' }}>{name(t.from)}</b>
                <span style={{ color: 'var(--muted)' }}>pays →</span>
                <b style={{ flex: 1 }}>{name(t.to)}</b>
                <b style={{ fontSize: 18, color: 'var(--accent)' }}>{m(t.amount)}</b>
              </div>
            ))
          ) : (
            <Note tone="ok">Everyone is even. Nothing to settle.</Note>
          )}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Greedy plan: the person who owes the most pays the person owed the most, repeated until everyone is even.</p>
        </Panel>
        <Panel title="Balances" actions={<CsvButton name="bill-split.csv" rows={() => [['Person', 'Paid', 'Share', 'Net'], ...bal.map((b) => [name(b.id), b.paid, b.owed, b.net])]} />}>
          <Table
            head={['Person', 'Paid', 'Share', 'Net', '']}
            rows={bal.map((b) => [
              name(b.id),
              m(b.paid),
              m(b.owed),
              <b key="n" style={{ color: b.net > 0.004 ? 'var(--ok)' : b.net < -0.004 ? 'var(--err)' : undefined }}>{b.net > 0 ? '+' : ''}{m(b.net)}</b>,
              <div key="b" style={{ minWidth: 120, display: 'flex' }}>
                <div style={{ flex: 1, transform: 'scaleX(-1)' }}>{b.net < 0 && <Bar value={-b.net} max={maxAbs} color="var(--err)" />}</div>
                <div style={{ flex: 1 }}>{b.net > 0 && <Bar value={b.net} max={maxAbs} color="var(--ok)" />}</div>
              </div>,
            ])}
            foot={['Total', m(bal.reduce((a, b) => a + b.paid, 0)), m(bal.reduce((a, b) => a + b.owed, 0)), '', '']}
          />
        </Panel>
        <Panel title="Who paid">
          <Donut slices={bal.filter((b) => b.paid > 0).map((b) => ({ label: name(b.id), value: b.paid }))} fv={m} center={<span>{m(total)}</span>} />
        </Panel>
      </div>
    </Split>
  )
}
