import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, JsonButtons, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { qr } from './lib/barcode-label-maker'

interface Pet { id: string; name: string; species: string; breed: string; age: string; weight: string; looks: string; quirks: string }
interface Feed { id: string; time: string; pet: string; what: string; amount: string }
interface Med { id: string; time: string; pet: string; name: string; dose: string; how: string }
interface Contact { id: string; role: string; name: string; phone: string }

const DEF = {
  owner: 'Sam & Alex', from: '2026-11-02', to: '2026-11-09', where: 'Lisbon, back late Sunday',
  pets: [
    { id: 'p1', name: 'Biscuit', species: 'Dog', breed: 'Beagle mix', age: '6 y', weight: '12 kg', looks: 'Tan & white, red collar', quirks: 'Steals socks. Scared of thunder: hides under the bed, let him be. Pulls on the lead near cats.' },
    { id: 'p2', name: 'Miso', species: 'Cat', breed: 'Domestic shorthair', age: '3 y', weight: '4.5 kg', looks: 'Grey tabby', quirks: 'Indoor only — watch the door! Likes chin scratches, bites if you touch her belly.' },
  ] as Pet[],
  feeds: [
    { id: 'f1', time: '07:30', pet: 'Biscuit', what: 'Dry food (blue bag, pantry)', amount: '1 cup' },
    { id: 'f2', time: '07:30', pet: 'Miso', what: 'Wet food pouch', amount: '½ pouch' },
    { id: 'f3', time: '18:00', pet: 'Biscuit', what: 'Dry food + warm water', amount: '1 cup' },
    { id: 'f4', time: '18:00', pet: 'Miso', what: 'Wet food pouch', amount: '½ pouch' },
  ] as Feed[],
  meds: [{ id: 'm1', time: '07:30', pet: 'Biscuit', name: 'Apoquel 5.4 mg', dose: '1 tablet', how: 'Hide in a piece of cheese' }] as Med[],
  routine: '08:00 Walk Biscuit 30 min (harness on hook by the door, bags in the pocket)\n12:30 Short garden break\n19:30 Walk Biscuit 30 min\nDaily: scoop Miso’s litter box (bathroom), fresh water in both bowls\nEvery 2nd day: water the plants on the balcony',
  rules: 'Biscuit is not allowed on the sofa.\nNo human food, especially grapes, chocolate, onions.\nTreats: max 3 a day (jar on the fridge).',
  contacts: [
    { id: 'c1', role: 'Owner', name: 'Sam', phone: '+351 912 345 678' },
    { id: 'c2', role: 'Backup', name: 'Neighbour Rita (flat 3B)', phone: '+351 913 222 111' },
    { id: 'c3', role: 'Vet', name: 'Clínica Veterinária Estrela', phone: '+351 213 900 000' },
    { id: 'c4', role: 'Emergency vet (24h)', name: 'Hospital Veterinário 24h', phone: '+351 217 000 000' },
  ] as Contact[],
  home: 'Spare key with Rita. Wi-Fi: “HomeNet” (password on the fridge). Supplies: pantry bottom shelf. Vet budget OK up to €300 without calling.',
  showQr: true,
}
type S = typeof DEF
const SPECIES = ['Dog', 'Cat', 'Rabbit', 'Bird', 'Fish', 'Reptile', 'Small mammal', 'Other']
const ICON: Record<string, string> = { Dog: '🐶', Cat: '🐱', Rabbit: '🐰', Bird: '🐦', Fish: '🐟', Reptile: '🦎', 'Small mammal': '🐹', Other: '🐾' }

const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #ddd', verticalAlign: 'top', textAlign: 'left' }
const h2: React.CSSProperties = { fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #222', margin: '16px 0 6px', paddingBottom: 2 }

function QrSvg({ text, size = 150 }: { text: string; size?: number }) {
  const code = useMemo(() => { try { return qr(text, 'L') } catch { return null } }, [text])
  if (!code) return <div style={{ fontSize: 12 }}>Too much text for a QR code</div>
  const n = code.size + 8
  let d = ''
  code.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4},${y + 4}h1v1h-1z` }))
  return <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR code"><rect width={n} height={n} fill="#fff" /><path d={d} fill="#000" /></svg>
}

function summary(s: S): string {
  const t = [`PET SITTER INFO – ${s.pets.map((p) => p.name).join(', ')} (${s.from} → ${s.to})`]
  for (const c of s.contacts) t.push(`${c.role}: ${c.name} ${c.phone}`)
  const times = [...new Set([...s.feeds, ...s.meds].map((x) => x.time))].sort()
  for (const tm of times) {
    const f = s.feeds.filter((x) => x.time === tm).map((x) => `${x.pet}: ${x.amount} ${x.what}`)
    const m = s.meds.filter((x) => x.time === tm).map((x) => `${x.pet} MED ${x.name} ${x.dose}`)
    t.push(`${tm} ${[...f, ...m].join('; ')}`)
  }
  return t.join('\n')
}

export default function PetSitterInstructions() {
  const [s, set, reset] = useToolState('pet-sitter-instructions', DEF)
  const [step, setStep] = useState<'pets' | 'food' | 'routine' | 'contacts'>('pets')
  const sheet = useRef<HTMLDivElement>(null)
  const names = s.pets.map((p) => p.name)
  const upd = <K extends 'pets' | 'feeds' | 'meds' | 'contacts'>(k: K, id: string, patch: Partial<S[K][number]>) =>
    set({ [k]: (s[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } as Partial<S>)
  const del = (k: 'pets' | 'feeds' | 'meds' | 'contacts', id: string) => set({ [k]: (s[k] as { id: string }[]).filter((x) => x.id !== id) } as Partial<S>)
  const schedule = [...s.feeds.map((f) => ({ t: f.time, kind: '🍽', text: `${f.pet}: ${f.amount} ${f.what}` })), ...s.meds.map((m) => ({ t: m.time, kind: '💊', text: `${m.pet}: ${m.name} — ${m.dose}${m.how ? ` (${m.how})` : ''}` })),
    ...s.routine.split('\n').map((l) => /^(\d{1,2}:\d{2})\s+(.*)$/.exec(l.trim())).filter(Boolean).map((m) => ({ t: m![1].padStart(5, '0'), kind: '🐾', text: m![2] }))].sort((a, b) => a.t.localeCompare(b.t))
  const other = s.routine.split('\n').filter((l) => l.trim() && !/^\d{1,2}:\d{2}\s/.test(l.trim()))
  const days = Math.max(1, Math.round((new Date(s.to).getTime() - new Date(s.from).getTime()) / 864e5) + 1)
  const qrText = summary(s)
  const missingVet = !s.contacts.some((c) => /vet/i.test(c.role) && c.phone.trim())

  const print = () => {
    const w = window.open('', '_blank')
    if (!w || !sheet.current) return
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Pet sitter instructions</title><style>body{margin:16px;font-family:system-ui,sans-serif}@page{margin:14mm}</style>${sheet.current.outerHTML}`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  return (
    <Split>
      <div>
        <Panel title="Trip">
          <Row>
            <Txt label="Owner(s)" value={s.owner} onChange={(owner) => set({ owner })} />
            <Txt label="Away from" type="date" value={s.from} onChange={(from) => set({ from })} />
            <Txt label="Back on" type="date" value={s.to} onChange={(to) => set({ to })} />
          </Row>
          <Txt label="Where we’ll be" value={s.where} onChange={(where) => set({ where })} />
        </Panel>
        <Panel title="Care details" actions={<Seg value={step} onChange={setStep} options={[['pets', '1 Pets'], ['food', '2 Food & meds'], ['routine', '3 Routine'], ['contacts', '4 Contacts']]} />}>
          {step === 'pets' && (
            <>
              {s.pets.map((p) => (
                <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Row>
                    <Txt label="Name" value={p.name} onChange={(name) => upd('pets', p.id, { name })} />
                    <Select label="Species" value={p.species} onChange={(species) => upd('pets', p.id, { species })} options={SPECIES} />
                    <Txt label="Breed" value={p.breed} onChange={(breed) => upd('pets', p.id, { breed })} />
                  </Row>
                  <Row>
                    <Txt label="Age" value={p.age} onChange={(age) => upd('pets', p.id, { age })} />
                    <Txt label="Weight" value={p.weight} onChange={(weight) => upd('pets', p.id, { weight })} />
                    <Txt label="Looks like" value={p.looks} onChange={(looks) => upd('pets', p.id, { looks })} />
                  </Row>
                  <Area label="Personality, fears, quirks" value={p.quirks} onChange={(quirks) => upd('pets', p.id, { quirks })} rows={2} />
                  <Btn kind="ghost" onClick={() => del('pets', p.id)}>Remove {p.name || 'pet'}</Btn>
                </div>
              ))}
              <Btn onClick={() => set({ pets: [...s.pets, { id: uid(), name: '', species: 'Dog', breed: '', age: '', weight: '', looks: '', quirks: '' }] })}>+ Pet</Btn>
            </>
          )}
          {step === 'food' && (
            <>
              <h4 style={{ margin: '0 0 6px' }}>Feeding</h4>
              {s.feeds.map((f) => (
                <Row key={f.id}>
                  <Txt label="Time" type="time" value={f.time} onChange={(time) => upd('feeds', f.id, { time })} />
                  <Select label="Pet" value={f.pet} onChange={(pet) => upd('feeds', f.id, { pet })} options={names.includes(f.pet) ? names : [f.pet, ...names]} />
                  <Txt label="Food" value={f.what} onChange={(what) => upd('feeds', f.id, { what })} />
                  <Txt label="Amount" value={f.amount} onChange={(amount) => upd('feeds', f.id, { amount })} />
                  <Btn kind="ghost" title="Remove" onClick={() => del('feeds', f.id)}>✕</Btn>
                </Row>
              ))}
              <Btn onClick={() => set({ feeds: [...s.feeds, { id: uid(), time: '12:00', pet: names[0] ?? '', what: '', amount: '' }] })}>+ Meal</Btn>
              <h4 style={{ margin: '14px 0 6px' }}>Medication</h4>
              {s.meds.map((m) => (
                <Row key={m.id}>
                  <Txt label="Time" type="time" value={m.time} onChange={(time) => upd('meds', m.id, { time })} />
                  <Select label="Pet" value={m.pet} onChange={(pet) => upd('meds', m.id, { pet })} options={names.includes(m.pet) ? names : [m.pet, ...names]} />
                  <Txt label="Medicine" value={m.name} onChange={(name) => upd('meds', m.id, { name })} />
                  <Txt label="Dose" value={m.dose} onChange={(dose) => upd('meds', m.id, { dose })} />
                  <Txt label="How to give" value={m.how} onChange={(how) => upd('meds', m.id, { how })} />
                  <Btn kind="ghost" title="Remove" onClick={() => del('meds', m.id)}>✕</Btn>
                </Row>
              ))}
              <Btn onClick={() => set({ meds: [...s.meds, { id: uid(), time: '08:00', pet: names[0] ?? '', name: '', dose: '', how: '' }] })}>+ Medication</Btn>
            </>
          )}
          {step === 'routine' && (
            <>
              <Area label="Daily routine (start a line with HH:MM to put it on the timeline)" value={s.routine} onChange={(routine) => set({ routine })} rows={6} />
              <Area label="House rules & don’ts" value={s.rules} onChange={(rules) => set({ rules })} rows={4} />
              <Area label="Home, supplies & access" value={s.home} onChange={(home) => set({ home })} rows={3} />
              <Note tone="warn">Don’t write alarm codes or passwords here if you will share the QR code or print copies — hand those over in person.</Note>
            </>
          )}
          {step === 'contacts' && (
            <>
              {s.contacts.map((c) => (
                <Row key={c.id}>
                  <Txt label="Role" value={c.role} onChange={(role) => upd('contacts', c.id, { role })} />
                  <Txt label="Name" value={c.name} onChange={(name) => upd('contacts', c.id, { name })} />
                  <Txt label="Phone" type="tel" value={c.phone} onChange={(phone) => upd('contacts', c.id, { phone })} />
                  <Btn kind="ghost" title="Remove" onClick={() => del('contacts', c.id)}>✕</Btn>
                </Row>
              ))}
              <Btn onClick={() => set({ contacts: [...s.contacts, { id: uid(), role: 'Other', name: '', phone: '' }] })}>+ Contact</Btn>
              <Note>Animal poison helplines: ASPCA (US) +1 888 426 4435 · Pet Poison Helpline +1 855 764 7661. Add your local one.</Note>
            </>
          )}
        </Panel>
        <Panel title="Save">
          <Row>
            <JsonButtons name="pet-sitter.json" data={s} onLoad={(v) => set({ ...DEF, ...v })} />
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
            <Btn kind="ghost" onClick={() => set({ ...DEF, pets: [], feeds: [], meds: [], contacts: [], routine: '', rules: '', home: '', owner: '' })}>Blank</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pets" value={s.pets.map((p) => ICON[p.species] ?? '🐾').join(' ') || '—'} sub={names.join(', ')} />
          <Stat label="Sitting" value={`${days} day${days > 1 ? 's' : ''}`} sub={`${s.from} → ${s.to}`} />
          <Stat label="Daily tasks" value={schedule.length + other.length} sub={`${s.meds.length} meds`} tone="accent" />
        </Stats>
        {missingVet && <Note tone="err">Add your vet’s phone number — it is the most important line on the sheet.</Note>}
        <Panel title="Care sheet preview" actions={<><Btn kind="primary" onClick={print}>🖨 Print</Btn><Btn onClick={() => sheet.current && download('pet-sitter-instructions.html', `<!doctype html><meta charset="utf-8"><title>Pet sitter instructions</title>${sheet.current.outerHTML}`, 'text/html')}>⬇ HTML</Btn><CopyButton text={qrText} label="Copy text" /></>}>
          <Check label="Include QR code (contacts + feeding times)" value={s.showQr} onChange={(showQr) => set({ showQr })} />
          <div ref={sheet} style={{ background: '#fff', color: '#111', padding: 18, borderRadius: 8, fontFamily: 'system-ui, sans-serif', fontSize: 14, lineHeight: 1.45 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>Caring for {names.join(' & ') || 'our pets'}</div>
                <div style={{ color: '#555' }}>{s.owner && `${s.owner} · `}{s.from} → {s.to}{s.where && ` · ${s.where}`}</div>
                <div style={{ ...h2, marginTop: 12 }}>Emergency contacts</div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
                  {s.contacts.map((c) => <tr key={c.id}><td style={{ ...td, fontWeight: 700, width: '32%' }}>{c.role}</td><td style={td}>{c.name}</td><td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.phone}</td></tr>)}
                </tbody></table>
              </div>
              {s.showQr && <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}><QrSvg text={qrText} size={140} /><div>Scan for contacts<br />& schedule</div></div>}
            </div>
            <div style={h2}>Daily schedule</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
              {schedule.map((x, i) => <tr key={i}><td style={{ ...td, width: 58, fontWeight: 700 }}>{x.t}</td><td style={{ ...td, width: 24 }}>{x.kind}</td><td style={td}>{x.text}</td><td style={{ ...td, width: 18 }}>☐</td></tr>)}
              {other.map((l, i) => <tr key={`o${i}`}><td style={td}></td><td style={td}>✔</td><td style={td}>{l}</td><td style={td}>☐</td></tr>)}
            </tbody></table>
            <div style={h2}>Meet the pets</div>
            {s.pets.map((p) => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <b>{ICON[p.species] ?? '🐾'} {p.name}</b> <span style={{ color: '#555' }}>— {[p.species, p.breed, p.age, p.weight, p.looks].filter(Boolean).join(' · ')}</span>
                {p.quirks && <div>{p.quirks}</div>}
              </div>
            ))}
            {s.rules.trim() && <><div style={h2}>House rules</div><ul style={{ margin: 0, paddingLeft: 18 }}>{s.rules.split('\n').filter((l) => l.trim()).map((l, i) => <li key={i}>{l}</li>)}</ul></>}
            {s.home.trim() && <><div style={h2}>Home & supplies</div><div style={{ whiteSpace: 'pre-wrap' }}>{s.home}</div></>}
            <div style={{ marginTop: 14, fontSize: 12, color: '#666' }}>Signs to call the vet right away: not eating for 24 h, repeated vomiting or diarrhoea, trouble breathing, pale gums, swollen belly, can’t pee, suspected poisoning.</div>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
