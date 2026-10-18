import { useState } from 'react'
import { Bar, Btn, Check, download, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { addDays, cToF, diff, dueInfo, fToC, ics, PETS, petById, tempCheck, validDay, type Reading } from './lib/pet-gestation-calculator'

interface Pet { id: string; name: string; species: string; first: string; last: string; checks: Record<string, boolean>; temps: Reading[] }
const T = today()
const now = new Date()
const hourAgo = (h: number) => { const d = new Date(now.getTime() - h * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00` }
const DEF = {
  unit: 'C' as 'C' | 'F', sel: 'p1',
  pets: [
    {
      id: 'p1', name: 'Luna', species: 'dog', first: addDays(T, -58), last: addDays(T, -56), checks: { 0: true, 1: true, 2: true, 6: true },
      temps: [[60, 38.6], [48, 38.5], [36, 38.6], [24, 38.4], [12, 38.3], [1, 38.2]].map(([h, c], i) => ({ id: `t${i}`, at: hourAgo(h), c })),
    },
    { id: 'p2', name: 'Miso', species: 'cat', first: addDays(T, -24), last: '', checks: {}, temps: [] },
    { id: 'p3', name: 'Clover', species: 'rabbit', first: addDays(T, -20), last: '', checks: {}, temps: [] },
  ] as Pet[],
}
const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
const KIND_COL: Record<string, string> = { vet: '#0ea5e9', prep: '#f59e0b', dev: '#a855f7', birth: '#ef4444' }

export default function PetGestationCalculator() {
  const [s, set, reset] = useToolState('pet-gestation-calculator', DEF)
  const [tIn, setTIn] = useState(38.5)
  const [tAt, setTAt] = useState(() => hourAgo(0))
  const pet = s.pets.find((p) => p.id === s.sel) ?? s.pets[0]
  const edit = (p: Partial<Pet>) => pet && set({ pets: s.pets.map((x) => (x.id === pet.id ? { ...x, ...p } : x)) })
  const sp = petById(pet?.species ?? 'dog')
  const ok = !!pet && validDay(pet.first)
  const d = ok ? dueInfo(sp, pet.first, validDay(pet.last) ? pet.last : '', T) : null
  const tc = pet ? tempCheck(sp, pet.temps) : null
  const F = s.unit === 'F'
  const showT = (c: number) => (F ? `${cToF(c).toFixed(1)} °F` : `${c.toFixed(1)} °C`)
  const nextEv = d ? sp.events.find((e) => e.day >= d.day) : undefined
  const exportIcs = () => {
    if (!pet || !d) return
    const evs = [
      ...sp.events.filter((e) => e.kind !== 'birth').map((e) => ({ date: addDays(pet.first, e.day), title: `${pet.name}: ${e.title}`, desc: e.detail, uid: `${pet.id}-${e.day}` })),
      { date: d.early, title: `${pet.name}: birth window opens`, desc: `Typical ${sp.name.toLowerCase()} pregnancy ${sp.min}–${sp.max} days.`, uid: `${pet.id}-early` },
      { date: d.due, title: `${pet.name}: due date (${sp.young})`, desc: sp.tip, uid: `${pet.id}-due` },
      { date: d.late, title: `${pet.name}: end of window — call the vet if no ${sp.young}`, uid: `${pet.id}-late` },
    ]
    download(`${pet.name || 'pet'}-pregnancy.ics`, ics(evs, stampNow()), 'text/calendar')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Pets" actions={<Btn onClick={() => { const p: Pet = { id: uid(), name: 'New mum', species: 'dog', first: T, last: '', checks: {}, temps: [] }; set({ pets: [...s.pets, p], sel: p.id }) }}>+ Pet</Btn>}>
          {s.pets.map((p) => {
            const ps = petById(p.species)
            const dd = validDay(p.first) ? dueInfo(ps, p.first, validDay(p.last) ? p.last : '', T) : null
            return (
              <div key={p.id} onClick={() => set({ sel: p.id })} style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 8, marginBottom: 6, border: `1px solid ${p.id === pet?.id ? 'var(--accent)' : 'var(--line)'}` }}>
                <Row wrap={false}>
                  <span style={{ fontSize: 22 }}>{ps.icon}</span>
                  <b style={{ flex: 1 }}>{p.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{dd ? `day ${dd.day} · due ${dd.due}` : 'set a date'}</span>
                </Row>
                {dd && <Bar value={dd.pct} max={1} color={dd.phase === 'overdue' ? 'var(--err)' : dd.phase === 'window' ? 'var(--warn)' : 'var(--accent)'} />}
              </div>
            )
          })}
        </Panel>
        {pet && (
          <Panel title="Details">
            <Txt label="Name" value={pet.name} onChange={(name) => edit({ name })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6, margin: '8px 0' }}>
              {PETS.map((p) => (
                <button key={p.id} type="button" className={`k-btn ${p.id === pet.species ? 'primary' : 'ghost'}`} onClick={() => edit({ species: p.id, checks: {} })} style={{ flexDirection: 'column', padding: 6 }}>
                  <span style={{ fontSize: 20 }}>{p.icon}</span><span style={{ fontSize: 11 }}>{p.name}</span>
                </button>
              ))}
            </div>
            <Row>
              <Txt label="First mating" type="date" value={pet.first} onChange={(first) => edit({ first })} />
              <Txt label="Last mating (optional)" type="date" value={pet.last} onChange={(last) => edit({ last })} />
            </Row>
            {!ok && <Note tone="warn">Enter the first mating date.</Note>}
            {validDay(pet.last) && pet.last < pet.first && <Note tone="warn">The last mating is before the first one; it is ignored.</Note>}
            <p className="muted" style={{ fontSize: 13 }}>{sp.name}: typically {sp.days} days ({sp.min}–{sp.max}), litter {sp.litter}.</p>
            <Btn kind="ghost" onClick={() => set({ pets: s.pets.filter((x) => x.id !== pet.id), sel: s.pets.find((x) => x.id !== pet.id)?.id ?? '' })}>Remove {pet.name}</Btn>
          </Panel>
        )}
        <Panel title="Data">
          <Row>
            <Btn kind="primary" disabled={!d} onClick={exportIcs}>📅 Add to calendar (.ics)</Btn>
            <JsonButtons name="pet-pregnancies.json" data={s} onLoad={(v) => v && Array.isArray(v.pets) && set(v)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Day of pregnancy" value={d ? (d.day < 0 ? '—' : d.day) : '—'} sub={d ? `week ${d.week} of ~${Math.ceil(sp.days / 7)}` : ''} tone="accent" />
          <Stat label="Due date" value={d?.due ?? '—'} sub={d ? (d.left > 0 ? `in ${d.left} days` : d.left === 0 ? 'today' : `${-d.left} days ago`) : ''} />
          <Stat label="Birth window" value={d ? `${d.early.slice(5)} → ${d.late.slice(5)}` : '—'} sub={d?.phase === 'window' ? 'in the window now' : d?.phase === 'overdue' ? 'past the window' : `${sp.min}–${sp.max} days`} tone={d?.phase === 'overdue' ? 'bad' : d?.phase === 'window' ? 'good' : undefined} />
          <Stat label="Next up" value={nextEv && d && pet ? (nextEv.kind === 'birth' ? d.due : addDays(pet.first, nextEv.day)).slice(5) : '—'} sub={nextEv ? nextEv.title : ''} />
        </Stats>
        {d?.phase === 'overdue' && <Note tone="err">{pet?.name} is past the usual {sp.name.toLowerCase()} window. Please contact your vet today.</Note>}
        {d && pet && (
          <Panel title={`${sp.icon} Timeline for ${pet.name}`}>
            <svg viewBox="0 0 640 92" style={{ width: '100%' }} role="img" aria-label="Pregnancy timeline">
              {(() => {
                const span = diff(pet.first, d.late) + 2
                const X = (day: number) => 14 + (Math.max(0, Math.min(span, day)) / span) * 612
                const e0 = diff(pet.first, d.early), e1 = diff(pet.first, d.late)
                return (
                  <>
                    <rect x={14} y={30} width={612} height={10} rx={5} fill="var(--line)" />
                    <rect x={14} y={30} width={Math.max(0, X(d.day) - 14)} height={10} rx={5} fill="var(--accent)" opacity={0.7} />
                    <rect x={X(e0)} y={26} width={X(e1) - X(e0)} height={18} rx={4} fill="#ef4444" opacity={0.2} />
                    {sp.events.map((e, i) => (
                      <g key={i}>
                        <circle cx={X(e.day)} cy={35} r={5} fill={KIND_COL[e.kind ?? 'dev']} stroke="var(--panel)" strokeWidth={1.5}><title>{`Day ${e.day}: ${e.title}`}</title></circle>
                        <text x={X(e.day)} y={[14, 64, 84][i % 3]} fontSize={9} textAnchor="middle" fill="currentColor">{e.title.length > 18 ? e.title.slice(0, 17) + '…' : e.title}</text>
                      </g>
                    ))}
                    {d.day >= 0 && <line x1={X(d.day)} x2={X(d.day)} y1={22} y2={48} stroke="#ef4444" strokeWidth={2} />}
                  </>
                )
              })()}
            </svg>
            <Table
              head={['Day', 'Date', 'What happens', '']}
              rows={sp.events.map((e) => {
                const date = e.kind === 'birth' ? d.due : addDays(pet.first, e.day)
                const past = d.day > e.day
                const curWeek = Math.floor(e.day / 7) === Math.floor(Math.max(0, d.day) / 7)
                return [
                  <b key="d" style={{ color: curWeek ? 'var(--accent)' : undefined }}>{e.day}</b>,
                  <span key="t" className={past ? 'muted' : ''}>{date}</span>,
                  <div key="w" style={{ opacity: past ? 0.6 : 1, whiteSpace: 'normal', minWidth: 240 }}><b>{e.title}</b><div style={{ fontSize: 13 }}>{e.detail}</div></div>,
                  <span key="k" style={{ fontSize: 11, color: KIND_COL[e.kind ?? 'dev'] }}>{e.kind === 'vet' ? 'Vet' : e.kind === 'prep' ? 'Prep' : e.kind === 'birth' ? 'Birth' : ''}</span>,
                ]
              })}
            />
          </Panel>
        )}
        {pet && (
          <Panel title={`${sp.id === 'dog' ? 'Whelping' : sp.id === 'cat' ? 'Queening' : 'Birth'} prep checklist`}>
            {sp.prep.map((p, i) => <Check key={p} label={p} value={!!pet.checks[i]} onChange={(v) => edit({ checks: { ...pet.checks, [i]: v } })} />)}
            <Bar value={sp.prep.filter((_, i) => pet.checks[i]).length} max={sp.prep.length} color="var(--ok)" />
            <Note tone="warn">{sp.tip}</Note>
          </Panel>
        )}
        {pet && sp.temp && (
          <Panel title="Temperature-drop log" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['C', '°C'], ['F', '°F']]} />}>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{sp.temp.note} Normal: {showT(sp.temp.lo)}–{showT(sp.temp.hi)}. Measure at the same times each day from about a week before the due date.</p>
            <Row>
              <Num label="Reading" value={F ? +cToF(tIn).toFixed(1) : tIn} onChange={(v) => setTIn(F ? fToC(v) : v)} unit={F ? '°F' : '°C'} step={0.1} />
              <Txt label="Taken at" type="datetime-local" value={tAt} onChange={setTAt} />
              <Btn kind="primary" disabled={!(tIn > 30 && tIn < 43) || !tAt} onClick={() => edit({ temps: [...pet.temps, { id: uid(), at: tAt, c: +tIn.toFixed(2) }] })}>+ Log</Btn>
            </Row>
            {tc && <Note tone={tc.alert ? 'warn' : 'ok'}>{tc.alert ? '⚠ ' : ''}{F ? tc.text.replace(/(\d+\.\d) °C/g, (_, c) => `${cToF(+c).toFixed(1)} °F`) : tc.text}</Note>}
            {pet.temps.length > 0 && (
              <>
                <LineChart
                  height={200}
                  series={[{ name: 'Temperature', points: [...pet.temps].sort((a, b) => a.at.localeCompare(b.at)).map((r) => [Date.parse(r.at) / 3600e3, F ? cToF(r.c) : r.c] as [number, number]) }, { name: 'Drop threshold', dashed: true, color: '#ef4444', points: (() => { const xs = pet.temps.map((r) => Date.parse(r.at) / 3600e3); const y = F ? cToF(sp.temp!.drop) : sp.temp!.drop; return [[Math.min(...xs), y], [Math.max(...xs), y]] as [number, number][] })() }]}
                  fx={(h) => new Date(h * 3600e3).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })}
                  fy={(v) => v.toFixed(1)}
                  yMin={F ? 97 : 36.5}
                  yMax={F ? 103 : 39.5}
                />
                <Table head={['Taken', 'Temp', '']} rows={[...pet.temps].sort((a, b) => b.at.localeCompare(a.at)).map((r) => [r.at.replace('T', ' '), showT(r.c), <Btn key="x" kind="ghost" onClick={() => edit({ temps: pet.temps.filter((x) => x.id !== r.id) })} title="Remove">✕</Btn>])} max={12} />
              </>
            )}
          </Panel>
        )}
        <Note>Dates are typical ranges; breed, litter size and the exact ovulation day shift them. This tool does not replace your vet — please consult your vet for pregnancy confirmation, diet and birth planning, and call them whenever something seems wrong.</Note>
      </div>
    </Split>
  )
}
