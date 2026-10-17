import { useState } from 'react'
import { Btn, CsvButton, JsonButtons, LineChart, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState, type Series } from '../kit'
import { BREEDS, changeSince, KG_LB, range, sorted, status, trendPerWeek, type WeighIn } from './lib/pet-weight-tracker'

interface Pet { id: string; name: string; species: string; breed: string; born: string; target: number; log: (WeighIn & { note?: string })[] }
interface State { unit: 'kg' | 'lb'; sel: string; pets: Pet[] }

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
const DEF: State = {
  unit: 'kg',
  sel: 'bailey',
  pets: [
    {
      id: 'bailey', name: 'Bailey', species: 'Dog', breed: 'Labrador Retriever', born: '2019-04-02', target: 33,
      log: [[180, 38.4, 'Vet: aim for 33 kg'], [160, 38.1], [140, 37.6], [120, 37.0], [100, 36.6, 'Switched to measured cups'], [80, 36.1], [60, 35.5], [40, 35.2], [20, 34.6], [3, 34.2]].map(([d, kg, note]) => ({ date: ago(d as number), kg: kg as number, note: note as string | undefined })),
    },
    {
      id: 'miso', name: 'Miso', species: 'Cat', breed: 'Domestic Shorthair', born: '2021-08-15', target: 5.2,
      log: [[150, 4.9], [110, 5.2], [75, 5.5], [40, 5.7], [8, 5.9, 'Indoor only since spring']].map(([d, kg, note]) => ({ date: ago(d as number), kg: kg as number, note: note as string | undefined })),
    },
  ],
}

const STATUS = { under: ['Under range', 'var(--warn)'], in: ['In range', 'var(--ok)'], over: ['Over range', 'var(--err)'], unknown: ['No reference', 'var(--muted)'] } as const

export default function PetWeightTracker() {
  const [s, set, reset] = useToolState('pet-weight-tracker', DEF)
  const [date, setDate] = useState(today())
  const [w, setW] = useState(0)
  const [note, setNote] = useState('')
  const pet = s.pets.find((p) => p.id === s.sel) ?? s.pets[0]
  const lb = s.unit === 'lb'
  const show = (kg: number, d = 1) => `${num(lb ? kg * KG_LB : kg, d)} ${s.unit}`
  const toKg = (v: number) => (lb ? v / KG_LB : v)
  const edit = (p: Partial<Pet>) => pet && set({ pets: s.pets.map((x) => (x.id === pet.id ? { ...x, ...p } : x)) })

  if (!pet) {
    return (
      <Panel title="No pets yet">
        <Btn kind="primary" onClick={() => { const id = uid(); set({ sel: id, pets: [{ id, name: 'My pet', species: 'Dog', breed: 'Mixed breed – medium', born: '', target: 0, log: [] }] }) }}>+ Add a pet</Btn>
        <Btn kind="ghost" onClick={reset}>Load sample</Btn>
      </Panel>
    )
  }

  const log = sorted(pet.log) as Pet['log']
  const latest = log[log.length - 1]
  const r = range(pet.species, pet.breed)
  const st = status(latest?.kg ?? 0, r)
  const c30 = changeSince(log, 30)
  const tr = trendPerWeek(log)
  const ageM = pet.born ? (Date.parse(latest?.date ?? today()) - Date.parse(pet.born)) / (86400000 * 30.44) : NaN
  const k = (x: number) => (lb ? x * KG_LB : x)
  const xs = log.map((x) => Date.parse(x.date))
  const series: Series[] = [{ name: 'Weight', points: log.map((x, i) => [xs[i], k(x.kg)]), area: false }]
  if (r && xs.length) {
    series.push({ name: 'Breed min', points: [[xs[0], k(r[0])], [xs[xs.length - 1], k(r[0])]], dashed: true, color: '#10b981' })
    series.push({ name: 'Breed max', points: [[xs[0], k(r[1])], [xs[xs.length - 1], k(r[1])]], dashed: true, color: '#ef4444' })
  }
  if (pet.target > 0 && xs.length) series.push({ name: 'Target', points: [[xs[0], k(pet.target)], [xs[xs.length - 1], k(pet.target)]], dashed: true, color: '#f59e0b' })
  const all = series.flatMap((x) => x.points.map((p) => p[1]))
  const wIn = w > 0 ? w : latest ? Math.round(k(latest.kg) * 10) / 10 : 0
  const weeksToTarget = pet.target > 0 && latest && tr !== 0 && Math.sign(pet.target - latest.kg) === Math.sign(tr) ? (pet.target - latest.kg) / tr : NaN

  return (
    <Split>
      <div>
        <Panel title="Pets" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['kg', 'kg'], ['lb', 'lb']]} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {s.pets.map((p) => <Btn key={p.id} kind={p.id === pet.id ? 'primary' : 'normal'} onClick={() => set({ sel: p.id })}>{p.species === 'Cat' ? '🐈' : p.species === 'Dog' ? '🐕' : p.species === 'Rabbit' ? '🐇' : '🐹'} {p.name}</Btn>)}
            <Btn onClick={() => { const id = uid(); set({ sel: id, pets: [...s.pets, { id, name: `Pet ${s.pets.length + 1}`, species: 'Dog', breed: 'Mixed breed – medium', born: '', target: 0, log: [] }] }) }}>+ Pet</Btn>
          </div>
          <Txt label="Name" value={pet.name} onChange={(name) => edit({ name })} />
          <Row>
            <Select label="Species" value={pet.species} onChange={(species) => edit({ species, breed: BREEDS[species][0][0] })} options={Object.keys(BREEDS)} />
            <Select label="Breed" value={pet.breed} onChange={(breed) => edit({ breed })} options={BREEDS[pet.species]?.map((b) => b[0]) ?? []} />
          </Row>
          <Row>
            <Txt label="Born" type="date" value={pet.born} onChange={(born) => edit({ born })} />
            <Num label="Target weight" unit={s.unit} value={Math.round(k(pet.target) * 10) / 10} min={0} onChange={(v) => edit({ target: toKg(v) })} hint="0 = none (ask your vet)" />
          </Row>
          {r && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Typical adult {pet.breed}: <b>{show(r[0])} – {show(r[1])}</b></p>}
          <Row>
            <Btn kind="danger" onClick={() => confirm(`Remove ${pet.name} and all weigh-ins?`) && set({ pets: s.pets.filter((x) => x.id !== pet.id), sel: s.pets.find((x) => x.id !== pet.id)?.id ?? '' })}>Remove pet</Btn>
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
          </Row>
        </Panel>

        <Panel title="Add weigh-in">
          <Row>
            <Txt label="Date" type="date" value={date} onChange={setDate} />
            <Num label="Weight" unit={s.unit} value={wIn} min={0} onChange={setW} />
          </Row>
          <Txt label="Note (optional)" value={note} placeholder="e.g. after walk, new food" onChange={setNote} />
          <Btn kind="primary" disabled={!(wIn > 0) || !date} onClick={() => { edit({ log: [...pet.log.filter((x) => x.date !== date), { date, kg: toKg(wIn), note: note.trim() || undefined }] }); setW(0); setNote('') }}>Save weigh-in</Btn>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Tip: weigh yourself holding your pet, then subtract your own weight. Same scale, same time of day.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Latest" value={latest ? show(latest.kg) : '—'} sub={latest?.date} tone="accent" />
          <Stat label="30-day change" value={c30 ? `${c30.kg >= 0 ? '+' : ''}${show(c30.kg, 2)}` : '—'} sub={c30 ? `${c30.pct >= 0 ? '+' : ''}${pct(c30.pct)} since ${c30.from.date}` : 'need 2+ weigh-ins'} />
          <Stat label="Trend" value={`${tr >= 0 ? '+' : ''}${show(tr, 2)}/wk`} sub={Number.isFinite(weeksToTarget) ? `≈ ${Math.ceil(weeksToTarget)} weeks to target` : 'least-squares, last 60 days'} />
          <Stat label="Breed range" value={<span style={{ color: STATUS[st][1], fontSize: 17 }}>{STATUS[st][0]}</span>} sub={r ? `${show(r[0])} – ${show(r[1])}` : undefined} />
        </Stats>

        <Panel title={`${pet.name}'s weight`}>
          <LineChart series={series} fx={(v) => new Date(v).toISOString().slice(5, 10)} fy={(v) => num(v, 1)} yMin={all.length ? Math.floor(Math.min(...all) * 0.95) : 0} yLabel={s.unit} />
        </Panel>

        {Number.isFinite(ageM) && ageM < 12 && <Note tone="warn">{pet.name} is under a year old. Breed ranges describe adults; growing animals should be tracked against a vet's growth chart.</Note>}
        {c30 && c30.pct < -0.1 && <Note tone="err">More than 10% weight loss in a month. Unplanned rapid loss can signal illness. Consider calling your vet.</Note>}

        <Panel title="Weigh-ins" actions={<>
          <CsvButton name={`${pet.name}-weights.csv`} rows={() => [['Date', `Weight (${s.unit})`, 'Note'], ...log.map((x) => [x.date, Number(k(x.kg).toFixed(2)), x.note ?? ''])]} />
          <JsonButtons name="pet-weights.json" data={s} onLoad={(d) => d && Array.isArray(d.pets) && set(d)} />
        </>}>
          <Table
            head={['Date', 'Weight', 'Change', 'Note', '']}
            rows={[...log].reverse().map((x, i, arr) => {
              const prev = arr[i + 1]
              const d = prev ? x.kg - prev.kg : 0
              return [x.date, <b key="w">{show(x.kg, 2)}</b>, prev ? <span key="c" style={{ color: d > 0 ? 'var(--warn)' : d < 0 ? 'var(--accent2)' : undefined }}>{d >= 0 ? '+' : ''}{show(d, 2)}</span> : '—', <span key="n" className="muted">{x.note ?? ''}</span>,
                <Btn key="x" kind="ghost" title="Delete" onClick={() => edit({ log: pet.log.filter((y) => y.date !== x.date) })}>✕</Btn>]
            })}
          />
          <Note>Breed ranges are general references; muscle, frame and sex matter. A body condition score (ribs easily felt, visible waist) from your vet is the best guide. Informational only, not veterinary advice.</Note>
        </Panel>
      </div>
    </Split>
  )
}
