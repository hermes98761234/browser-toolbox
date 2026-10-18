import { useState } from 'react'
import { BarChart, Btn, color, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { byKey, byMonthCategory, CATEGORIES, lastMonths, projection, ytd, type Entry } from './lib/pet-expense-tracker'

interface Pet { id: string; name: string; emoji: string }

// Deterministic sample history for the last 11 months (relative to today).
function sample(): Entry[] {
  const out: Entry[] = []
  const t = today()
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const months = lastMonths(t, 11)
  months.forEach((mk, i) => {
    const day = (d: number) => `${mk}-${String(d).padStart(2, '0')}`
    const last = i === months.length - 1
    const ok = (d: number) => !last || day(d) <= t
    if (ok(3)) out.push({ id: uid(), pet: 'max', date: day(3), category: 'Food', amount: 58 + Math.round(rnd() * 8), note: 'Dry food 12 kg' })
    if (ok(5)) out.push({ id: uid(), pet: 'luna', date: day(5), category: 'Food', amount: 34 + Math.round(rnd() * 6), note: 'Wet food case' })
    if (ok(1)) out.push({ id: uid(), pet: 'max', date: day(1), category: 'Insurance', amount: 24.5, note: 'Monthly premium' })
    if (ok(14) && rnd() < 0.6) out.push({ id: uid(), pet: rnd() < 0.5 ? 'max' : 'luna', date: day(14), category: 'Toys & treats', amount: Math.round(8 + rnd() * 22), note: '' })
    if (ok(18)) out.push({ id: uid(), pet: 'luna', date: day(18), category: 'Supplies', amount: 16 + Math.round(rnd() * 6), note: 'Cat litter' })
    if (ok(20) && i % 3 === 1) out.push({ id: uid(), pet: 'max', date: day(20), category: 'Grooming', amount: 45, note: 'Groomer' })
    if (ok(9) && i % 3 === 0) out.push({ id: uid(), pet: 'max', date: day(9), category: 'Medication', amount: 38, note: 'Flea & tick (3 months)' })
  })
  const mk = (n: number) => months[n]
  out.push({ id: uid(), pet: 'max', date: `${mk(2)}-11`, category: 'Vet', amount: 185, note: 'Annual check-up + vaccines' })
  out.push({ id: uid(), pet: 'luna', date: `${mk(5)}-22`, category: 'Vet', amount: 340, note: 'Dental cleaning' })
  out.push({ id: uid(), pet: 'max', date: `${mk(7)}-02`, category: 'Boarding', amount: 210, note: 'Kennel, 6 nights' })
  out.push({ id: uid(), pet: 'luna', date: `${mk(8)}-16`, category: 'Vet', amount: 95, note: 'Ear infection' })
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

const DEF = {
  cur: '$',
  pets: [{ id: 'max', name: 'Max', emoji: '🐕' }, { id: 'luna', name: 'Luna', emoji: '🐈' }] as Pet[],
  entries: sample(),
  filter: '',
  window: 6,
  range: 12,
}

export default function PetExpenseTracker() {
  const [s, set, reset] = useToolState('pet-expense-tracker', DEF)
  const [f, setF] = useState({ pet: s.pets[0]?.id ?? '', date: today(), category: 'Food' as string, amount: 0, note: '' })
  const [newPet, setNewPet] = useState('')
  const m = (x: number) => money(x, s.cur, 2)
  const m0 = (x: number) => money(x, s.cur, 0)
  const t = today()
  const es = s.entries.filter((e) => !s.filter || e.pet === s.filter)
  const months = lastMonths(t, s.range)
  const monthly = byMonthCategory(es, months, CATEGORIES)
  const usedCats = CATEGORIES.map((c, i) => ({ c, i })).filter(({ i }) => monthly.some((r) => r.values[i] > 0))
  const proj = projection(es, t, s.window)
  const cats = byKey(es.filter((e) => months.includes(e.date.slice(0, 7))), 'category')
  const petName = (id: string) => { const p = s.pets.find((x) => x.id === id); return p ? `${p.emoji} ${p.name}` : '—' }
  const thisMonth = monthly[monthly.length - 1]?.total ?? 0
  const add = () => {
    if (!(f.amount > 0) || !f.pet) return
    set({ entries: [{ id: uid(), ...f, note: f.note.trim() }, ...s.entries].sort((a, b) => b.date.localeCompare(a.date)) })
    setF({ ...f, amount: 0, note: '' })
  }
  const monthLabel = (mk: string) => new Date(`${mk}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

  return (
    <Split wide="right">
      <div>
        <Panel title="Add expense">
          <Row>
            <Select label="Pet" value={f.pet} onChange={(pet) => setF({ ...f, pet })} options={s.pets.map((p) => [p.id, `${p.emoji} ${p.name}`] as [string, string])} />
            <Select label="Category" value={f.category} onChange={(category) => setF({ ...f, category })} options={CATEGORIES} />
          </Row>
          <Row>
            <Num label="Amount" value={f.amount} onChange={(amount) => setF({ ...f, amount })} unit={s.cur} min={0} />
            <Txt label="Date" type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
          </Row>
          <Txt label="Note" value={f.note} onChange={(note) => setF({ ...f, note })} placeholder="e.g. vaccines, 12 kg bag" />
          <Btn kind="primary" onClick={add} disabled={!(f.amount > 0) || !f.pet}>+ Add expense</Btn>
        </Panel>
        <Panel title="Pets">
          {s.pets.map((p) => {
            const tot = s.entries.filter((e) => e.pet === p.id).reduce((a, e) => a + e.amount, 0)
            const pp = projection(s.entries.filter((e) => e.pet === p.id), t, s.window)
            return (
              <Row key={p.id} wrap={false}>
                <input value={p.emoji} onChange={(e) => set({ pets: s.pets.map((x) => (x.id === p.id ? { ...x, emoji: e.target.value } : x)) })} style={{ width: 44, textAlign: 'center' }} aria-label="Emoji" />
                <input value={p.name} onChange={(e) => set({ pets: s.pets.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} style={{ flex: 1 }} aria-label="Pet name" />
                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{m0(tot)} total · ~{m0(pp.year)}/yr</span>
              </Row>
            )
          })}
          <Row>
            <Txt label="New pet name" value={newPet} onChange={setNewPet} placeholder="e.g. Kiwi" />
            <Btn onClick={() => { if (newPet.trim()) { set({ pets: [...s.pets, { id: uid(), name: newPet.trim(), emoji: '🐾' }] }); setNewPet('') } }}>+ Pet</Btn>
          </Row>
        </Panel>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', 'CHF ', 'zł', '₴', '¥']} />
            <Select label="Projection based on last" value={s.window} onChange={(window) => set({ window })} options={[[3, '3 full months'], [6, '6 full months'], [12, '12 full months']]} />
          </Row>
        </Panel>
      </div>
      <div>
        <Row>
          <Seg value={s.filter} onChange={(filter) => set({ filter })} options={[['', 'All pets'] as [string, string], ...s.pets.map((p) => [p.id, `${p.emoji} ${p.name}`] as [string, string])]} />
        </Row>
        <Stats>
          <Stat label="This month" value={m0(thisMonth)} />
          <Stat label="Monthly average" value={m0(proj.avg)} sub={`last ${proj.months} full month${proj.months === 1 ? '' : 's'}`} />
          <Stat label="Projected per year" value={m0(proj.year)} tone="accent" sub="average × 12" />
          <Stat label="Year to date" value={m0(ytd(es, t))} />
        </Stats>
        {proj.months < 3 && <Note tone="warn">Projection uses fewer than 3 complete months; it will settle as you log more.</Note>}
        <Panel title="Monthly costs" actions={<Seg value={String(s.range)} onChange={(r) => set({ range: +r })} options={[['6', '6 mo'], ['12', '12 mo'], ['24', '24 mo']]} />}>
          <BarChart bars={monthly.map((r) => ({ label: monthLabel(r.month), value: usedCats.map(({ i }) => r.values[i]) }))} stacks={usedCats.map(({ c, i }) => ({ name: c, color: color(i) }))} fy={m0} />
        </Panel>
        <Panel title="By category">
          <Donut slices={cats.map(([c, v]) => ({ label: c, value: v, color: color(CATEGORIES.indexOf(c as (typeof CATEGORIES)[number])) }))} fv={m0} center={<span>{m0(cats.reduce((a, [, v]) => a + v, 0))}</span>} />
        </Panel>
        <Panel title={`Expenses (${es.length})`} actions={<>
          <CsvButton name="pet-expenses.csv" rows={() => [['Date', 'Pet', 'Category', 'Amount', 'Note'], ...es.map((e) => [e.date, petName(e.pet), e.category, e.amount, e.note])]} />
          <JsonButtons name="pet-expenses.json" data={s} onLoad={(d) => set(d)} />
        </>}>
          <Table max={40} head={['Date', 'Pet', 'Category', 'Amount', 'Note', '']} rows={es.map((e) => [
            e.date, petName(e.pet),
            <span key="c"><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color(CATEGORIES.indexOf(e.category as (typeof CATEGORIES)[number])), marginRight: 6 }} />{e.category}</span>,
            <b key="a">{m(e.amount)}</b>, e.note,
            <Btn key="x" kind="ghost" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })} title="Delete">✕</Btn>,
          ])} />
        </Panel>
      </div>
    </Split>
  )
}
