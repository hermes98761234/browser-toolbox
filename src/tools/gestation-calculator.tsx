import { useState } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, color, download, today, uid, useToolState } from '../kit'
import { SPECIES, addDays, due, ics, monthGrid, speciesById, validISO, type Status } from './lib/gestation-calculator'

interface Animal { id: string; name: string; species: string; bred: string; days: number; notes: string }
interface State { species: string; bred: string; days: number; batch: Animal[] }

const T = today()
const DEF: State = {
  species: 'cattle', bred: addDays(T, -120), days: 0,
  batch: [
    { id: 'a1', name: 'Daisy #214', species: 'cattle', bred: addDays(T, -270), days: 0, notes: 'AI, Angus sire' },
    { id: 'a2', name: 'Bella #198', species: 'cattle', bred: addDays(T, -140), days: 0, notes: '' },
    { id: 'a3', name: 'Ewe group A (12)', species: 'sheep', bred: addDays(T, -130), days: 0, notes: 'Ram in 1 cycle' },
    { id: 'a4', name: 'Nanny', species: 'goat', bred: addDays(T, -60), days: 0, notes: '' },
    { id: 'a5', name: 'Sow 7', species: 'pig', bred: addDays(T, -100), days: 0, notes: 'Gilt' },
    { id: 'a6', name: 'Bluebell', species: 'horse', bred: addDays(T, -200), days: 0, notes: 'Live cover' },
    { id: 'a7', name: 'Incubator tray 1', species: 'chicken', bred: addDays(T, -12), days: 0, notes: '42 eggs' },
  ],
}
const STATUS: Record<Status, [string, string]> = {
  early: ['Early', 'var(--muted)'], mid: ['Mid', 'var(--accent)'], late: ['Late — prepare', 'var(--warn)'],
  window: ['Due window', 'var(--ok)'], overdue: ['Overdue', 'var(--err)'], done: ['Past', 'var(--muted)'],
}
const fmtD = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
const spIdx = (id: string) => SPECIES.findIndex((x) => x.id === id)

export default function GestationCalculator() {
  const [s, set, reset] = useToolState('gestation-calculator', DEF)
  const [month, setMonth] = useState(() => [Number(T.slice(0, 4)), Number(T.slice(5, 7)) - 1] as [number, number])
  const sp = speciesById(s.species)
  const ok = validISO(s.bred)
  const r = ok ? due(sp, s.bred, T, s.days) : null
  const len = s.days > 0 ? s.days : sp.days
  const rows = s.batch.filter((a) => validISO(a.bred)).map((a) => ({ a, sp: speciesById(a.species), d: due(speciesById(a.species), a.bred, T, a.days) })).sort((x, y) => x.d.due.localeCompare(y.d.due))
  const edit = (id: string, p: Partial<Animal>) => set({ batch: s.batch.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const upcoming = rows.filter((x) => x.d.left >= 0 && x.d.left <= 30).length
  const grid = monthGrid(month[0], month[1])
  const mName = new Date(Date.UTC(month[0], month[1], 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const shift = (k: number) => setMonth(([y, m]) => [y + Math.floor((m + k) / 12), (((m + k) % 12) + 12) % 12])
  const verb = (e?: boolean) => (e ? 'Hatch' : 'Due')

  const exportIcs = () => {
    const ev = rows.flatMap(({ a, sp: p, d }) => [
      { uid: `${a.id}-due`, date: d.due, title: `${a.name}: ${p.egg ? 'hatch' : 'due'} (${p.young})`, desc: `${p.name}. Window ${d.early} to ${d.late}. ${a.notes}` },
      { uid: `${a.id}-chk`, date: d.check, title: `${a.name}: ${p.checkLabel}` },
      { uid: `${a.id}-prep`, date: d.prep, title: `${a.name}: prepare (${p.prep} days before ${p.egg ? 'hatch' : 'birth'})` },
    ])
    download('breeding-calendar.ics', ics(ev, stampNow()), 'text/calendar')
  }

  return (
    <Split>
      <div>
        <Panel title="Calculator">
          <Select label="Species" value={s.species} onChange={(species) => set({ species, days: 0 })} options={SPECIES.map((x) => [x.id, `${x.name} · ${x.days} d`] as [string, string])} />
          <Row>
            <Txt type="date" label={sp.egg ? 'Eggs set on' : 'Breeding / service date'} value={s.bred} onChange={(bred) => set({ bred })} />
            <Num label="Custom length (0 = typical)" value={s.days} onChange={(days) => set({ days: Math.max(0, Math.round(days)) })} unit="days" min={0} max={500} />
          </Row>
          {!ok && <Note tone="err">Enter a valid date.</Note>}
          {r && (
            <>
              <Stats>
                <Stat label={`${verb(sp.egg)} date`} value={new Date(r.due + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })} sub={`${len} days`} tone="accent" />
                <Stat label="Window" value={`${r.early.slice(5)} → ${r.late.slice(5)}`} sub={`${sp.min + len - sp.days}–${sp.max + len - sp.days} days`} />
                <Stat label={r.left >= 0 ? 'Days to go' : 'Days past'} value={Math.abs(r.left)} sub={`day ${Math.max(0, r.day)} of ${len}`} tone={r.left < 0 ? 'bad' : undefined} />
              </Stats>
              <Bar value={r.pct} max={1} />
              <Table
                head={['Milestone', 'Date', 'Day']}
                rows={[
                  [sp.egg ? 'Eggs set' : 'Bred', fmtD(s.bred), 0],
                  [sp.checkLabel, fmtD(r.check), sp.check],
                  [`Prepare ${sp.egg ? 'brooder / lockdown' : 'birthing area'}`, fmtD(r.prep), len - sp.prep],
                  ['Earliest normal', fmtD(r.early), sp.min + len - sp.days],
                  [<b key="d">{verb(sp.egg)} ({sp.young})</b>, <b key="dd">{fmtD(r.due)}</b>, len],
                  ['Latest normal — call a vet after', fmtD(r.late), sp.max + len - sp.days],
                ]}
              />
              <Row>
                <Btn kind="primary" onClick={() => set({ batch: [...s.batch, { id: uid(), name: `${sp.name.split(' ')[0]} ${s.batch.length + 1}`, species: s.species, bred: s.bred, days: s.days, notes: '' }] })}>+ Add to batch</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Note>Typical lengths vary with breed, age, litter size and season by several days. Use the window, watch the animal, and ask your vet when in doubt.</Note>
      </div>
      <div>
        <Stats>
          <Stat label="Animals in batch" value={rows.length} />
          <Stat label="Due in next 30 days" value={upcoming} tone={upcoming ? 'accent' : undefined} />
          <Stat label="Overdue" value={rows.filter((x) => x.d.status === 'overdue').length} tone={rows.some((x) => x.d.status === 'overdue') ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Calendar" actions={<><Btn onClick={() => shift(-1)}>◀</Btn><b style={{ minWidth: 130, textAlign: 'center' }}>{mName}</b><Btn onClick={() => shift(1)}>▶</Btn><Btn kind="ghost" onClick={() => setMonth([Number(T.slice(0, 4)), Number(T.slice(5, 7)) - 1])}>Today</Btn></>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, fontSize: 12 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <b key={d} style={{ textAlign: 'center', color: 'var(--muted)' }}>{d}</b>)}
            {grid.map((d) => {
              const inM = Number(d.slice(5, 7)) - 1 === month[1]
              const dues = rows.filter((x) => x.d.due === d)
              const inWin = rows.filter((x) => d >= x.d.early && d <= x.d.late && x.d.due !== d)
              const marks = rows.filter((x) => x.d.check === d || x.d.prep === d)
              return (
                <div key={d} style={{ minHeight: 64, padding: 3, borderRadius: 6, border: `1px solid ${d === T ? 'var(--accent)' : 'var(--line)'}`, opacity: inM ? 1 : 0.4, background: inWin.length ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : undefined, overflow: 'hidden' }}>
                  <div style={{ fontWeight: d === T ? 800 : 500 }}>{Number(d.slice(8))}</div>
                  {dues.map((x) => <div key={x.a.id} title={`${x.a.name} due`} style={{ background: color(spIdx(x.a.species)), color: '#fff', borderRadius: 4, padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.a.name}</div>)}
                  {marks.map((x) => <div key={x.a.id + 'm'} title={x.d.check === d ? x.sp.checkLabel : 'Prepare'} style={{ color: color(spIdx(x.a.species)), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.d.check === d ? '✓' : '⚑'} {x.a.name}</div>)}
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Filled = due date · green cells = normal birth window · ✓ pregnancy check · ⚑ prepare.</p>
        </Panel>
        <Panel title="Batch" actions={<><Btn onClick={exportIcs}>📅 ICS</Btn><CsvButton name="breeding-batch.csv" rows={() => [['Name', 'Species', 'Bred', 'Check', 'Prepare', 'Earliest', 'Due', 'Latest', 'Days left', 'Notes'], ...rows.map(({ a, sp: p, d }) => [a.name, p.name, a.bred, d.check, d.prep, d.early, d.due, d.late, d.left, a.notes])]} /><JsonButtons name="breeding-batch.json" data={s} onLoad={(d) => d && Array.isArray(d.batch) && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table
            head={['Animal', 'Species', 'Bred', 'Due', 'Progress', '']}
            rows={rows.map(({ a, d, sp: p }) => [
              <div key="n" style={{ display: 'grid', gap: 2 }}><input value={a.name} onChange={(e) => edit(a.id, { name: e.target.value })} aria-label="Name" style={{ width: 130, fontWeight: 600 }} /><input value={a.notes} placeholder="notes" onChange={(e) => edit(a.id, { notes: e.target.value })} aria-label="Notes" style={{ width: 130, fontSize: 12 }} /></div>,
              <select key="s" value={a.species} onChange={(e) => edit(a.id, { species: e.target.value })} aria-label="Species" style={{ minWidth: 110 }}>{SPECIES.map((x) => <option key={x.id} value={x.id}>{x.name.replace(/ \(.*\)$/, '').replace(' eggs', ' 🥚')}</option>)}</select>,
              <input key="b" type="date" value={a.bred} onChange={(e) => e.target.value && edit(a.id, { bred: e.target.value })} aria-label="Bred" />,
              <span key="d" title={`Window ${d.early} → ${d.late}`}><b>{d.due}</b><br /><small className="muted">{d.left >= 0 ? `in ${d.left} d` : `${-d.left} d ago`} · {p.young}</small></span>,
              <div key="p" style={{ width: 110 }}><small style={{ display: 'block', color: STATUS[d.status][1], fontWeight: 700 }}>{STATUS[d.status][0]}</small><div style={{ display: 'flex' }}><Bar value={d.pct} max={1} color={STATUS[d.status][1]} /></div></div>,
              <Btn key="x" kind="ghost" onClick={() => set({ batch: s.batch.filter((x) => x.id !== a.id) })}>✕</Btn>,
            ])}
          />
          {!rows.length && <p className="muted">No animals yet — use “Add to batch”.</p>}
        </Panel>
      </div>
    </Split>
  )
}
