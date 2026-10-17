import { useState } from 'react'
import { Btn, CsvButton, FileDrop, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, money, num, uid, useToolState } from '../kit'

type Kind = 'visit' | 'vaccine' | 'med' | 'weight'
interface Pet { id: string; name: string; species: string; breed: string; birth: string; sex: string; chip: string }
interface Rec { id: string; pet: string; kind: Kind; date: string; title: string; due: string; notes: string; cost: number; weight: number; photos: string[] }
interface State { pets: Pet[]; recs: Rec[]; cur: string; filter: 'all' | Kind }

const DAYMS = 86_400_000
const stamp = () => new Date().toLocaleString()
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const rel = (days: number) => iso(Date.now() + days * DAYMS)
const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00').getTime() - new Date(iso(Date.now()) + 'T00:00').getTime()) / DAYMS)

const KIND: Record<Kind, { label: string; icon: string; color: string; titles: string[] }> = {
  visit: { label: 'Vet visit', icon: '🩺', color: '#6366f1', titles: ['Annual check-up', 'Dental cleaning', 'Ear infection', 'Skin allergy', 'Injury'] },
  vaccine: { label: 'Vaccine', icon: '💉', color: '#10b981', titles: ['Rabies', 'DHPP', 'Leptospirosis', 'Bordetella', 'FVRCP', 'FeLV'] },
  med: { label: 'Medication', icon: '💊', color: '#f59e0b', titles: ['Flea & tick prevention', 'Heartworm prevention', 'Deworming', 'Antibiotics', 'Pain relief'] },
  weight: { label: 'Weight', icon: '⚖', color: '#0ea5e9', titles: ['Weigh-in'] },
}

const R = (pet: string, kind: Kind, date: number, title: string, due: number | null, extra: Partial<Rec> = {}): Rec => ({
  id: uid(), pet, kind, date: rel(date), title, due: due === null ? '' : rel(due), notes: '', cost: 0, weight: 0, photos: [], ...extra,
})

/** A drawn sample "vaccination certificate" so the attachments feature is visible on first load. */
function sampleDoc(): string[] {
  try {
    const c = document.createElement('canvas')
    c.width = 420
    c.height = 300
    const g = c.getContext('2d')!
    g.fillStyle = '#fffdf5'
    g.fillRect(0, 0, 420, 300)
    g.strokeStyle = '#0f766e'
    g.lineWidth = 6
    g.strokeRect(10, 10, 400, 280)
    g.fillStyle = '#0f766e'
    g.font = 'bold 22px serif'
    g.fillText('Vaccination Certificate', 90, 55)
    g.fillStyle = '#333'
    g.font = '15px sans-serif'
    const lines = ['Patient: Luna (Border Collie)', 'Vaccine: Rabies, 1-year', 'Batch: RB-2231', `Date given: ${rel(-345)}`, `Valid until: ${rel(20)}`]
    lines.forEach((l, i) => g.fillText(l, 40, 100 + i * 28))
    g.strokeStyle = '#555'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(240, 262)
    g.lineTo(380, 262)
    g.stroke()
    g.font = 'italic 13px serif'
    g.fillText('Veterinarian', 275, 280)
    return [c.toDataURL('image/jpeg', 0.7)]
  } catch {
    return []
  }
}

const DEF: State = {
  cur: 'luna',
  filter: 'all',
  pets: [
    { id: 'luna', name: 'Luna', species: 'Dog', breed: 'Border Collie', birth: rel(-365 * 4 - 40), sex: 'Female (spayed)', chip: '985 112 004 563 210' },
    { id: 'milo', name: 'Milo', species: 'Cat', breed: 'Domestic shorthair', birth: rel(-365 * 2 - 100), sex: 'Male (neutered)', chip: '' },
  ],
  recs: [
    R('luna', 'vaccine', -345, 'Rabies', 20, { notes: '1-year vaccine, batch RB-2231', cost: 35, photos: sampleDoc() }),
    R('luna', 'vaccine', -380, 'DHPP', -15, { cost: 42 }),
    R('luna', 'vaccine', -200, 'Leptospirosis', 165, { cost: 30 }),
    R('luna', 'visit', -60, 'Annual check-up', 305, { notes: 'Healthy. Mild tartar on back molars, consider dental cleaning.', cost: 85 }),
    R('luna', 'visit', -140, 'Ear infection', null, { notes: 'Left ear, prescribed drops for 10 days.', cost: 64 }),
    R('luna', 'med', -25, 'Flea & tick prevention', 5, { notes: 'Monthly chewable', cost: 22 }),
    R('luna', 'med', -28, 'Heartworm prevention', 2, { notes: 'Monthly', cost: 18 }),
    ...[-330, -270, -210, -150, -90, -30].map((d, i) => R('luna', 'weight', d, 'Weigh-in', null, { weight: [19.2, 19.6, 19.9, 20.3, 20.1, 19.8][i] })),
    R('milo', 'vaccine', -300, 'FVRCP', 65, { cost: 38 }),
    R('milo', 'vaccine', -300, 'Rabies', 65, { cost: 35 }),
    R('milo', 'med', -80, 'Deworming', 10, { notes: 'Every 3 months', cost: 12 }),
    R('milo', 'visit', -300, 'Annual check-up', 65, { cost: 70 }),
    ...[-300, -200, -100, -10].map((d, i) => R('milo', 'weight', d, 'Weigh-in', null, { weight: [4.6, 4.9, 5.1, 5.2][i] })),
  ],
}

/** Downscale an image file to a compact JPEG data URL so it fits in local storage. */
function shrink(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => reject(new Error('not an image'))
    img.src = url
  })
}

const age = (birth: string) => {
  const d = -daysUntil(birth)
  if (!Number.isFinite(d) || d < 0) return '—'
  const y = Math.floor(d / 365.25), m = Math.floor((d % 365.25) / 30.44)
  return y ? `${y} y ${m} m` : `${m} months`
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const blank = (pet: string): Rec => ({ id: '', pet, kind: 'vaccine', date: iso(Date.now()), title: '', due: '', notes: '', cost: 0, weight: 0, photos: [] })

export default function PetHealthLog() {
  const [s, set, reset] = useToolState('pet-health-log', DEF)
  const pet = s.pets.find((p) => p.id === s.cur) ?? s.pets[0]
  const [form, setForm] = useState<Rec>(() => blank(pet?.id ?? ''))
  const [err, setErr] = useState('')
  const [view, setView] = useState<string | null>(null)
  if (!pet) {
    return <Note>No pets yet. <Btn onClick={() => set({ pets: [{ id: 'p1', name: 'My pet', species: 'Dog', breed: '', birth: iso(Date.now()), sex: '', chip: '' }], cur: 'p1' })}>Add a pet</Btn></Note>
  }
  const recs = s.recs.filter((r) => r.pet === pet.id).sort((a, b) => b.date.localeCompare(a.date))
  const shown = s.filter === 'all' ? recs : recs.filter((r) => r.kind === s.filter)
  // latest record per title decides what is due next
  const latest = new Map<string, Rec>()
  for (const r of [...recs].reverse()) if (r.kind !== 'weight') latest.set(r.kind + r.title, r)
  const due = [...latest.values()].filter((r) => r.due).sort((a, b) => a.due.localeCompare(b.due))
  const allDue = s.pets.flatMap((p) => {
    const m = new Map<string, Rec>()
    for (const r of s.recs.filter((x) => x.pet === p.id).sort((a, b) => a.date.localeCompare(b.date))) if (r.kind !== 'weight') m.set(r.kind + r.title, r)
    return [...m.values()].filter((r) => r.due && daysUntil(r.due) <= 14).map((r) => ({ p, r }))
  })
  const weights = recs.filter((r) => r.kind === 'weight' && r.weight > 0).sort((a, b) => a.date.localeCompare(b.date))
  const spent = recs.filter((r) => daysUntil(r.date) > -365).reduce((a, r) => a + r.cost, 0)
  const editPet = (p: Partial<Pet>) => set({ pets: s.pets.map((x) => (x.id === pet.id ? { ...x, ...p } : x)) })
  const photoBytes = s.recs.reduce((a, r) => a + r.photos.reduce((b, p) => b + p.length, 0), 0)

  const save = () => {
    if (!form.title.trim() || !form.date) return setErr('Add a date and a title.')
    if (form.kind === 'weight' && !(form.weight > 0)) return setErr('Enter the weight.')
    setErr('')
    const rec = { ...form, pet: pet.id, title: form.title.trim() }
    set({ recs: form.id ? s.recs.map((r) => (r.id === form.id ? rec : r)) : [...s.recs, { ...rec, id: uid() }] })
    setForm(blank(pet.id))
  }

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const row = (r: Rec) => `<tr><td>${r.date}</td><td>${KIND[r.kind].label}</td><td>${esc(r.title)}${r.kind === 'weight' ? ` — ${r.weight} kg` : ''}</td><td>${r.due || ''}</td><td>${esc(r.notes)}</td></tr>`
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(pet.name)} — health summary</title>
<style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}h1{margin:0}table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}.muted{color:#666}img{max-height:160px;margin:4px;border:1px solid #ccc}</style></head><body>
<h1>${esc(pet.name)}</h1><p class="muted">${esc(pet.species)} · ${esc(pet.breed)} · ${esc(pet.sex)} · born ${pet.birth} (${age(pet.birth)})${pet.chip ? ` · microchip ${esc(pet.chip)}` : ''}</p>
<h2>Upcoming & overdue</h2><table><tr><th>Due</th><th>Type</th><th>Item</th></tr>${due.map((r) => `<tr><td>${r.due}${daysUntil(r.due) < 0 ? ' (overdue)' : ''}</td><td>${KIND[r.kind].label}</td><td>${esc(r.title)}</td></tr>`).join('')}</table>
<h2>History</h2><table><tr><th>Date</th><th>Type</th><th>Item</th><th>Next due</th><th>Notes</th></tr>${recs.map(row).join('')}</table>
${recs.some((r) => r.photos.length) ? `<h2>Documents</h2>${recs.flatMap((r) => r.photos.map((p) => `<img src="${p}" alt="">`)).join('')}` : ''}
<p class="muted">Printed ${stamp()}</p><script>onload=()=>print()</script></body></html>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Pets" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {s.pets.map((p) => (
              <Btn key={p.id} kind={p.id === pet.id ? 'primary' : 'normal'} onClick={() => {
                set({ cur: p.id })
                setForm(blank(p.id))
              }}>{p.species === 'Cat' ? '🐈' : p.species === 'Dog' ? '🐕' : '🐾'} {p.name}</Btn>
            ))}
            <Btn onClick={() => {
              const id = uid()
              set({ pets: [...s.pets, { id, name: 'New pet', species: 'Dog', breed: '', birth: iso(Date.now()), sex: '', chip: '' }], cur: id })
            }}>+ Pet</Btn>
          </Row>
          <div style={{ marginTop: 10 }}>
            <Row>
              <Txt label="Name" value={pet.name} onChange={(name) => editPet({ name })} />
              <Select label="Species" value={pet.species} onChange={(species) => editPet({ species })} options={['Dog', 'Cat', 'Rabbit', 'Bird', 'Other']} />
            </Row>
            <Row>
              <Txt label="Breed" value={pet.breed} onChange={(breed) => editPet({ breed })} />
              <Txt label="Born" type="date" value={pet.birth} onChange={(birth) => editPet({ birth })} hint={`Age ${age(pet.birth)}`} />
            </Row>
            <Row>
              <Txt label="Sex" value={pet.sex} onChange={(sex) => editPet({ sex })} />
              <Txt label="Microchip" value={pet.chip} onChange={(chip) => editPet({ chip })} />
            </Row>
            <Btn kind="danger" disabled={s.pets.length < 2} onClick={() => set({ pets: s.pets.filter((p) => p.id !== pet.id), recs: s.recs.filter((r) => r.pet !== pet.id), cur: s.pets.find((p) => p.id !== pet.id)?.id ?? '' })}>Delete {pet.name}</Btn>
          </div>
        </Panel>
        <Panel title={form.id ? 'Edit record' : `Add record for ${pet.name}`}>
          <Seg value={form.kind} onChange={(kind) => setForm({ ...form, kind, title: kind === 'weight' ? 'Weigh-in' : form.title })} options={(Object.keys(KIND) as Kind[]).map((k) => [k, `${KIND[k].icon} ${KIND[k].label}`] as const)} />
          <Row>
            <Txt label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
            {form.kind === 'weight' ? (
              <Num label="Weight" value={form.weight} onChange={(weight) => setForm({ ...form, weight })} unit="kg" min={0} />
            ) : (
              <Txt label="Next due (optional)" type="date" value={form.due} onChange={(due) => setForm({ ...form, due })} />
            )}
          </Row>
          {form.kind !== 'weight' && (
            <>
              <Txt label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder={KIND[form.kind].titles[0]} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '-4px 0 10px' }}>
                {KIND[form.kind].titles.map((t) => (
                  <button key={t} type="button" className="k-btn ghost" style={{ padding: '2px 8px', fontSize: 12.5 }} onClick={() => setForm({ ...form, title: t })}>{t}</button>
                ))}
                {form.date && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {[['+1 mo', 30], ['+3 mo', 91], ['+1 yr', 365], ['+3 yr', 1095]].map(([l, d]) => (
                      <button key={l} type="button" className="k-btn ghost" style={{ padding: '2px 8px', fontSize: 12.5 }} title="Set next due date" onClick={() => setForm({ ...form, due: iso(new Date(form.date + 'T12:00').getTime() + Number(d) * DAYMS) })}>due {l}</button>
                    ))}
                  </span>
                )}
              </div>
              <Row>
                <Num label="Cost" value={form.cost} onChange={(cost) => setForm({ ...form, cost })} unit="$" min={0} />
                <Txt label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} placeholder="Dose, vet, batch number…" />
              </Row>
            </>
          )}
          <FileDrop accept="image/*" multiple label="Attach photos of documents (certificates, receipts)" onFiles={async (files) => {
            try {
              const imgs = await Promise.all(files.slice(0, 4).map((f) => shrink(f)))
              setForm((f) => ({ ...f, photos: [...f.photos, ...imgs] }))
            } catch {
              setErr('Could not read that image.')
            }
          }} />
          {form.photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {form.photos.map((p, i) => (
                <span key={i} style={{ position: 'relative' }}>
                  <img src={p} alt="" style={{ height: 60, borderRadius: 6, border: '1px solid var(--line)' }} />
                  <button type="button" className="k-btn" style={{ position: 'absolute', top: -6, right: -6, padding: '0 5px' }} onClick={() => setForm({ ...form, photos: form.photos.filter((_, j) => j !== i) })}>✕</button>
                </span>
              ))}
            </div>
          )}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <Btn kind="primary" onClick={save}>{form.id ? 'Save changes' : 'Add record'}</Btn>
              {form.id && <Btn onClick={() => setForm(blank(pet.id))}>Cancel</Btn>}
            </div>
          </Row>
        </Panel>
      </div>

      <div>
        {allDue.length > 0 && (
          <Note tone={allDue.some(({ r }) => daysUntil(r.due) < 0) ? 'err' : 'warn'}>
            <b>Reminders:</b> {allDue.map(({ p, r }) => `${p.name}: ${r.title} ${daysUntil(r.due) < 0 ? `overdue by ${-daysUntil(r.due)} d` : daysUntil(r.due) === 0 ? 'due today' : `in ${daysUntil(r.due)} d`}`).join(' · ')}
          </Note>
        )}
        <Stats>
          <Stat label={pet.name} value={age(pet.birth)} sub={`${pet.species} · ${pet.breed || 'breed unknown'}`} tone="accent" />
          <Stat label="Weight" value={weights.length ? `${num(weights[weights.length - 1].weight, 1)} kg` : '—'} sub={weights.length > 1 ? `${weights[weights.length - 1].weight >= weights[weights.length - 2].weight ? '▲' : '▼'} ${num(Math.abs(weights[weights.length - 1].weight - weights[weights.length - 2].weight), 2)} kg since last` : undefined} />
          <Stat label="Overdue" value={due.filter((r) => daysUntil(r.due) < 0).length} tone={due.some((r) => daysUntil(r.due) < 0) ? 'bad' : 'good'} />
          <Stat label="Spent (12 mo)" value={money(spent, '$', 0)} />
        </Stats>
        <Panel title="Upcoming & overdue" actions={<Btn onClick={print}>🖨 Printable summary</Btn>}>
          {due.length === 0 ? (
            <Note>No due dates set. Add a "next due" date to vaccines and medications to get reminders.</Note>
          ) : (
            <Table
              head={['Due', 'Item', 'Status']}
              rows={due.map((r) => {
                const d = daysUntil(r.due)
                return [
                  r.due,
                  `${KIND[r.kind].icon} ${r.title}`,
                  <b key="s" style={{ color: d < 0 ? 'var(--err)' : d <= 30 ? 'var(--warn)' : 'var(--ok)' }}>{d < 0 ? `Overdue ${-d} d` : d === 0 ? 'Today' : `In ${d} d`}</b>,
                ]
              })}
            />
          )}
        </Panel>
        {weights.length > 1 && (
          <Panel title="Weight trend">
            <LineChart series={[{ name: 'Weight', points: weights.map((w) => [new Date(w.date).getTime(), w.weight]), color: KIND.weight.color, area: true }]} fx={(v) => new Date(v).toLocaleDateString([], { month: 'short', year: '2-digit' })} fy={(v) => `${num(v, 1)} kg`} yMin={Math.floor(Math.min(...weights.map((w) => w.weight)) * 0.9)} height={200} />
          </Panel>
        )}
        <Panel
          title="Health history"
          actions={
            <>
              <CsvButton name={`${pet.name}-health.csv`} rows={() => [['Date', 'Type', 'Title', 'Next due', 'Weight kg', 'Cost', 'Notes'], ...recs.map((r) => [r.date, KIND[r.kind].label, r.title, r.due, r.weight || '', r.cost || '', r.notes])]} />
              <JsonButtons name="pet-health.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.pets) && Array.isArray(d.recs)) set({ ...DEF, ...d })
              }} />
            </>
          }
        >
          <Seg value={s.filter} onChange={(filter) => set({ filter })} options={[['all', 'All'], ...(Object.keys(KIND) as Kind[]).map((k) => [k, KIND[k].label] as const)]} />
          <Table
            head={['Date', 'Record', 'Details', '']}
            rows={shown.map((r) => [
              r.date,
              <span key="t" style={{ whiteSpace: 'normal' }}><b style={{ color: KIND[r.kind].color }}>{KIND[r.kind].icon}</b> {r.kind === 'weight' ? `${r.weight} kg` : r.title}{r.due ? <span className="muted"> · next {r.due}</span> : null}</span>,
              <span key="n" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 260, fontSize: 13 }}>
                {r.notes}{r.cost ? <span className="muted"> {money(r.cost, '$', 0)}</span> : null}
                {r.photos.map((p, i) => (
                  <img key={i} src={p} alt="attachment" onClick={() => setView(p)} style={{ height: 30, marginLeft: 4, borderRadius: 4, cursor: 'zoom-in', verticalAlign: 'middle' }} />
                ))}
              </span>,
              <span key="a" style={{ display: 'flex' }}>
                <Btn kind="ghost" title="Edit" onClick={() => setForm(r)}>✎</Btn>
                <Btn kind="ghost" title="Delete" onClick={() => set({ recs: s.recs.filter((x) => x.id !== r.id) })}>✕</Btn>
              </span>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            Stored only in this browser ({num(photoBytes / 1024, 0)} KB of photos; browsers allow about 5 MB). Photos are downscaled; use Backup to keep a copy.
          </p>
        </Panel>
        {view && (
          <div role="dialog" onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center', zIndex: 50, cursor: 'zoom-out' }}>
            <img src={view} alt="attachment" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 8 }} />
          </div>
        )}
      </div>
    </Split>
  )
}
