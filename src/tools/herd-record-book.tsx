import { useMemo, useState } from 'react'
import { BarChart, Btn, download, JsonButtons, LineChart, Note, num, Panel, Row, Select, Split, Stat, Stats, Table, toCsv, Txt, uid, useToolState } from '../kit'
import { addDays, age, days, gains, inWithdrawal, isoDate, mapRows, overallAdg, parseCsv, project, withdrawalEnd } from './lib/herd-record-book'

type Status = 'active' | 'sold' | 'dead'
interface Animal { id: string; tag: string; name: string; species: string; breed: string; sex: 'F' | 'M' | 'C'; dob: string; dam: string; sire: string; status: Status; notes: string }
interface Weight { id: string; aid: string; date: string; kg: number }
interface Treat { id: string; aid: string; date: string; product: string; dose: string; reason: string; wd: number }
interface Birth { id: string; dam: string; date: string; calf: string; ease: number; bw: number; notes: string }
interface State { animals: Animal[]; weights: Weight[]; treats: Treat[]; births: Birth[]; unit: 'kg' | 'lb' }

const SPECIES = ['Cattle', 'Sheep', 'Goat', 'Pig', 'Horse', 'Alpaca', 'Other']
const SEX: Record<string, string> = { F: 'Female', M: 'Male (entire)', C: 'Castrate' }
const EASE = ['', '1 · unassisted', '2 · easy pull', '3 · hard pull', '4 · vet / caesarean', '5 · malpresentation']
const T = new Date().toISOString().slice(0, 10)
const d = (n: number) => addDays(T, -n)

function sample(): State {
  const animals: Animal[] = [
    ['a1', 'UK 3021', 'Daisy', 'Cattle', 'Hereford', 'F', d(2200), '', '', 'Matriarch, calm, good mother'],
    ['a2', 'UK 3044', 'Bramble', 'Cattle', 'Hereford × Angus', 'F', d(1500), 'UK 3021', 'Monty', ''],
    ['a3', 'UK 3078', 'Clover', 'Cattle', 'Angus', 'F', d(1100), '', '', 'Lame NH in spring, resolved'],
    ['a4', 'UK 3102', 'Monty', 'Cattle', 'Angus', 'M', d(1800), '', '', 'Stock bull'],
    ['a5', 'UK 3150', 'Pip', 'Cattle', 'Hereford × Angus', 'C', d(420), 'UK 3044', 'Monty', 'Finishing group'],
    ['a6', 'UK 3151', 'Rusty', 'Cattle', 'Hereford', 'C', d(400), 'UK 3021', 'Monty', 'Finishing group'],
    ['a7', 'UK 3188', 'Nell', 'Cattle', 'Angus', 'F', d(190), 'UK 3078', 'Monty', 'Replacement heifer'],
    ['a8', 'UK 3189', 'Bandit', 'Cattle', 'Hereford × Angus', 'M', d(176), 'UK 3044', 'Monty', ''],
    ['a9', 'UK 2990', 'Old Bess', 'Cattle', 'Hereford', 'F', d(3400), '', '', 'Culled — poor fertility'],
  ].map(([id, tag, name, species, breed, sex, dob, dam, sire, notes]) => ({ id, tag, name, species, breed, sex: sex as Animal['sex'], dob, dam, sire, status: (id === 'a9' ? 'sold' : 'active') as Status, notes }))
  const weights: Weight[] = []
  const curve: Record<string, [number, number]> = { a5: [180, 1.05], a6: [170, 0.92], a7: [90, 0.85], a8: [95, 1.15], a2: [560, 0.05], a3: [520, 0.12] }
  for (const [aid, [w0, adg]] of Object.entries(curve))
    for (let k = 0; k < 6; k++) {
      const age0 = 150 - k * 30
      weights.push({ id: uid(), aid, date: d(age0), kg: Math.round(w0 + adg * (150 - age0) + Math.sin(k * 1.7 + w0) * 4) })
    }
  const treats: Treat[] = [
    { id: uid(), aid: 'a3', date: d(9), product: 'Oxytetracycline LA', dose: '20 mg/kg IM', reason: 'Foul in the foot (LH)', wd: 28 },
    { id: uid(), aid: 'a5', date: d(40), product: 'Ivermectin pour-on', dose: '25 ml', reason: 'Worming — whole group', wd: 31 },
    { id: uid(), aid: 'a6', date: d(40), product: 'Ivermectin pour-on', dose: '25 ml', reason: 'Worming — whole group', wd: 31 },
    { id: uid(), aid: 'a2', date: d(3), product: 'Meloxicam', dose: '0.5 mg/kg SC', reason: 'Post-calving inflammation', wd: 15 },
    { id: uid(), aid: 'a7', date: d(60), product: 'BVD vaccine', dose: '2 ml IM', reason: 'Booster', wd: 0 },
  ]
  const births: Birth[] = [
    { id: uid(), dam: 'a3', date: d(190), calf: 'a7', ease: 1, bw: 36, notes: 'Up and sucking in 30 min' },
    { id: uid(), dam: 'a2', date: d(176), calf: 'a8', ease: 2, bw: 41, notes: '' },
    { id: uid(), dam: 'a2', date: d(420), calf: 'a5', ease: 1, bw: 38, notes: '' },
    { id: uid(), dam: 'a1', date: d(400), calf: 'a6', ease: 3, bw: 45, notes: 'Large calf, assisted' },
  ]
  return { animals, weights, treats, births, unit: 'kg' }
}
const DEF = sample()
const blankAnimal = (): Animal => ({ id: uid(), tag: '', name: '', species: 'Cattle', breed: '', sex: 'F', dob: T, dam: '', sire: '', status: 'active', notes: '' })

export default function HerdRecordBook() {
  const [s, set, reset] = useToolState<State>('herd-record-book', DEF)
  const [q, setQ] = useState('')
  const [fSpecies, setFSpecies] = useState('All')
  const [fStatus, setFStatus] = useState<'active' | 'all'>('active')
  const [sel, setSel] = useState<string>(DEF.animals[4].id)
  const [msg, setMsg] = useState('')
  const [nw, setNw] = useState({ date: T, kg: 0 })
  const [nt, setNt] = useState({ date: T, product: '', dose: '', reason: '', wd: 0 })
  const [nb, setNb] = useState({ date: T, tag: '', sex: 'F' as Animal['sex'], ease: 1, bw: 0 })
  const u = s.unit

  const byId = useMemo(() => new Map(s.animals.map((a) => [a.id, a])), [s.animals])
  const wOf = (id: string) => s.weights.filter((w) => w.aid === id).sort((a, b) => a.date.localeCompare(b.date))
  const list = s.animals
    .filter((a) => (fStatus === 'all' || a.status === 'active') && (fSpecies === 'All' || a.species === fSpecies))
    .filter((a) => !q || `${a.tag} ${a.name} ${a.breed} ${a.notes}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.tag.localeCompare(b.tag))
  const a = byId.get(sel) ?? list[0]
  const active = s.animals.filter((x) => x.status === 'active')
  const withdrawal = s.treats.filter((t) => inWithdrawal(t.date, t.wd, T) && byId.get(t.aid)?.status === 'active')
  const adgs = active.map((x) => overallAdg(wOf(x.id))).filter((x): x is number => x !== null)
  const stale = active.filter((x) => {
    const w = wOf(x.id)
    return w.length && days(w[w.length - 1].date, T) > 60
  })
  const bornYear = s.births.filter((b) => b.date.slice(0, 4) === T.slice(0, 4)).length

  const upd = (id: string, p: Partial<Animal>) => set({ animals: s.animals.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const ws = a ? wOf(a.id) : []
  const gs = gains(ws)
  const proj = a ? project(ws.slice(-3), addDays(T, 60)) : null

  const importCsv = async (f: File) => {
    const rows = mapRows(parseCsv(await f.text()), { tag: ['id', 'eartag', 'ear tag', 'tag number'], name: [], species: [], breed: [], sex: ['gender'], dob: ['date of birth', 'birth date', 'born'], dam: ['mother'], sire: ['father'], notes: ['note', 'comments'], weight: ['kg', 'last weight'], weighdate: ['weigh date', 'weight date'] })
    let added = 0, updated = 0, wAdded = 0
    const animals = [...s.animals], weights = [...s.weights]
    for (const r of rows) {
      if (!r.tag) continue
      const sx = (r.sex ?? '').toUpperCase().startsWith('M') ? 'M' : /^(C|S|W)/.test((r.sex ?? '').toUpperCase()) ? 'C' : 'F'
      const sp = SPECIES.find((x) => x.toLowerCase() === (r.species ?? '').toLowerCase()) ?? (r.species ? 'Other' : 'Cattle')
      const patch = { tag: r.tag, name: r.name ?? '', species: sp, breed: r.breed ?? '', sex: sx as Animal['sex'], dob: isoDate(r.dob ?? ''), dam: r.dam ?? '', sire: r.sire ?? '', notes: r.notes ?? '' }
      const at = animals.findIndex((x) => x.tag === r.tag)
      let ex: Animal
      if (at >= 0) {
        ex = animals[at] = { ...animals[at], ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v)) }
        updated++
      } else {
        ex = { ...blankAnimal(), ...patch }
        animals.push(ex)
        added++
      }
      const kg = Number(r.weight)
      if (kg > 0) {
        weights.push({ id: uid(), aid: ex.id, date: isoDate(r.weighdate ?? '') || T, kg })
        wAdded++
      }
    }
    set({ animals, weights })
    setMsg(rows.length ? `Imported ${added} new and updated ${updated} animals, ${wAdded} weights.` : 'No rows found — the first line must be a header (Tag, Name, Species, Breed, Sex, DOB, Dam, Sire, Weight…).')
  }

  return (
    <div>
      <Stats>
        <Stat label="Active head" value={active.length} sub={`${s.animals.length - active.length} sold / dead`} tone="accent" />
        <Stat label="Average daily gain" value={adgs.length ? `${num(adgs.reduce((x, y) => x + y, 0) / adgs.length, 2)} ${u}/d` : '—'} sub={`${adgs.length} animals with 2+ weights`} />
        <Stat label="In withdrawal" value={new Set(withdrawal.map((t) => t.aid)).size} sub="do not sell / slaughter" tone={withdrawal.length ? 'bad' : 'good'} />
        <Stat label={`Births ${T.slice(0, 4)}`} value={bornYear} sub={`${s.births.length} recorded in total`} />
      </Stats>
      {withdrawal.length > 0 && (
        <Note tone="err">
          ⚠ Withdrawal: {withdrawal.map((t) => `${byId.get(t.aid)?.tag} (${t.product}) until ${withdrawalEnd(t.date, t.wd)}`).join(' · ')}
        </Note>
      )}
      {stale.length > 0 && <Note tone="warn">Not weighed for 60+ days: {stale.map((x) => x.tag).join(', ')}</Note>}
      <Split>
        <div>
          <Panel title="Herd" actions={<Btn kind="primary" onClick={() => { const n = blankAnimal(); set({ animals: [...s.animals, n] }); setSel(n.id) }}>+ Animal</Btn>}>
            <Txt label="Search" value={q} onChange={setQ} placeholder="Tag, name, breed, note…" />
            <Row>
              <Select label="Species" value={fSpecies} onChange={setFSpecies} options={['All', ...SPECIES]} />
              <Select label="Show" value={fStatus} onChange={setFStatus} options={[['active', 'Active only'], ['all', 'All incl. sold/dead']]} />
            </Row>
            <Table
              head={['Tag', 'Name', 'Sex', 'Age', `Last ${u}`, 'ADG']}
              rows={list.map((x) => {
                const w = wOf(x.id), g = overallAdg(w)
                const on = x.id === a?.id
                return [
                  <button key="t" type="button" className={`k-btn ${on ? 'primary' : 'ghost'}`} style={{ padding: '2px 8px' }} onClick={() => setSel(x.id)}>{x.tag || '(no tag)'}</button>,
                  <span key="n" style={{ opacity: x.status === 'active' ? 1 : 0.5 }}>{x.name}{x.status !== 'active' ? ` (${x.status})` : ''}{withdrawal.some((t) => t.aid === x.id) ? ' 💊' : ''}</span>,
                  x.sex,
                  age(x.dob, T),
                  w.length ? w[w.length - 1].kg : '—',
                  g === null ? '—' : num(g, 2),
                ]
              })}
            />
            {!list.length && <p className="k-hint">No animals match.</p>}
          </Panel>
          <Panel title="Import / export">
            <Row>
              <label className="k-btn">⬆ Import CSV<input type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCsv(f) }} /></label>
              <Btn onClick={() => download('herd-animals.csv', toCsv([['Tag', 'Name', 'Species', 'Breed', 'Sex', 'DOB', 'Dam', 'Sire', 'Status', 'Last weight', 'ADG', 'Notes'], ...s.animals.map((x) => { const w = wOf(x.id); return [x.tag, x.name, x.species, x.breed, x.sex, x.dob, x.dam, x.sire, x.status, w.length ? w[w.length - 1].kg : '', overallAdg(w)?.toFixed(3) ?? '', x.notes] })]), 'text/csv')}>⬇ Animals</Btn>
              <Btn onClick={() => download('herd-weights.csv', toCsv([['Tag', 'Date', u], ...s.weights.map((w) => [byId.get(w.aid)?.tag ?? '', w.date, w.kg])]), 'text/csv')}>⬇ Weights</Btn>
              <Btn onClick={() => download('herd-treatments.csv', toCsv([['Tag', 'Date', 'Product', 'Dose', 'Reason', 'Withdrawal days', 'Withdrawal ends'], ...s.treats.map((t) => [byId.get(t.aid)?.tag ?? '', t.date, t.product, t.dose, t.reason, t.wd, withdrawalEnd(t.date, t.wd)])]), 'text/csv')}>⬇ Treatments</Btn>
            </Row>
            <Row>
              <JsonButtons name="herd-record-book.json" data={s} onLoad={(v) => set(v)} />
              <Select label="" value={u} onChange={(unit) => set({ unit })} options={[['kg', 'Unit: kg'], ['lb', 'Unit: lb']]} />
              <Btn kind="ghost" onClick={() => confirm('Replace everything with the sample herd?') && reset()}>Load sample</Btn>
              <Btn kind="danger" onClick={() => confirm('Delete ALL records? Make a backup first.') && set({ animals: [], weights: [], treats: [], births: [] })}>Clear all</Btn>
            </Row>
            {msg && <Note tone="ok">{msg}</Note>}
            <p className="k-hint">CSV columns are matched by name (Tag/ID, Name, Species, Breed, Sex, DOB, Dam, Sire, Weight, Weigh date). Records stay in this browser — use Backup regularly.</p>
          </Panel>
        </div>
        <div>
          {a ? (
            <>
              <Panel title={`${a.tag || 'New animal'}${a.name ? ` · ${a.name}` : ''}`} actions={<Btn kind="ghost" onClick={() => confirm(`Delete ${a.tag} and all its records?`) && set({ animals: s.animals.filter((x) => x.id !== a.id), weights: s.weights.filter((w) => w.aid !== a.id), treats: s.treats.filter((t) => t.aid !== a.id) })}>Delete</Btn>}>
                <Row>
                  <Txt label="Tag / ID" value={a.tag} onChange={(tag) => upd(a.id, { tag })} />
                  <Txt label="Name" value={a.name} onChange={(name) => upd(a.id, { name })} />
                  <Select label="Species" value={a.species} onChange={(species) => upd(a.id, { species })} options={SPECIES} />
                </Row>
                <Row>
                  <Txt label="Breed" value={a.breed} onChange={(breed) => upd(a.id, { breed })} />
                  <Select label="Sex" value={a.sex} onChange={(sex) => upd(a.id, { sex })} options={Object.entries(SEX) as [Animal['sex'], string][]} />
                  <Txt label={`Born · ${age(a.dob, T)}`} type="date" value={a.dob} onChange={(dob) => upd(a.id, { dob })} />
                </Row>
                <Row>
                  <Txt label="Dam (tag)" value={a.dam} onChange={(dam) => upd(a.id, { dam })} />
                  <Txt label="Sire" value={a.sire} onChange={(sire) => upd(a.id, { sire })} />
                  <Select label="Status" value={a.status} onChange={(status) => upd(a.id, { status })} options={[['active', 'Active'], ['sold', 'Sold'], ['dead', 'Dead']]} />
                </Row>
                <Txt label="Notes" value={a.notes} onChange={(notes) => upd(a.id, { notes })} />
              </Panel>
              <Panel title="Weights">
                <Stats>
                  <Stat label="Latest" value={ws.length ? `${ws[ws.length - 1].kg} ${u}` : '—'} sub={ws.length ? ws[ws.length - 1].date : 'no weighings'} />
                  <Stat label="Overall ADG" value={overallAdg(ws) !== null ? `${num(overallAdg(ws)!, 2)} ${u}/d` : '—'} sub={ws.length > 1 ? `over ${days(ws[0].date, ws[ws.length - 1].date)} days` : ''} tone="accent" />
                  <Stat label="In 60 days" value={proj ? `≈ ${Math.round(proj)} ${u}` : '—'} sub="trend of last 3 weighings" />
                </Stats>
                {ws.length > 0 && (
                  <LineChart
                    series={[
                      { name: a.tag, points: ws.map((w) => [Date.parse(w.date), w.kg] as [number, number]), area: true },
                      ...(proj && ws.length ? [{ name: 'Projection', dashed: true, color: '#94a3b8', points: [[Date.parse(ws[ws.length - 1].date), ws[ws.length - 1].kg], [Date.parse(addDays(T, 60)), proj]] as [number, number][] }] : []),
                    ]}
                    height={220}
                    yMin={Math.floor(Math.min(...ws.map((w) => w.kg)) * 0.9)}
                    fx={(v) => new Date(v).toISOString().slice(2, 10)}
                    fy={(v) => `${Math.round(v)}`}
                    yLabel={u}
                  />
                )}
                <Table head={['Date', u, `ADG ${u}/d`, '']} rows={gs.slice().reverse().map((g) => {
                  const w = ws.find((x) => x.date === g.date && x.kg === g.kg)!
                  return [g.date, g.kg, g.adg === null ? '—' : <span key="g" style={{ color: g.adg < 0 ? 'var(--err)' : undefined }}>{num(g.adg, 2)}</span>, <Btn key="x" kind="ghost" onClick={() => set({ weights: s.weights.filter((x) => x.id !== w.id) })}>✕</Btn>]
                })} />
                <Row>
                  <Txt label="Date" type="date" value={nw.date} onChange={(date) => setNw({ ...nw, date })} />
                  <Txt label={`Weight (${u})`} type="number" value={nw.kg ? String(nw.kg) : ''} onChange={(v) => setNw({ ...nw, kg: Number(v) })} />
                  <Btn kind="primary" disabled={!(nw.kg > 0) || !nw.date} onClick={() => { set({ weights: [...s.weights, { id: uid(), aid: a.id, date: nw.date, kg: nw.kg }] }); setNw({ ...nw, kg: 0 }) }}>+ Weight</Btn>
                </Row>
              </Panel>
              <Panel title="Treatments">
                <Table head={['Date', 'Product', 'Dose', 'Reason', 'Withdrawal', '']} rows={s.treats.filter((t) => t.aid === a.id).sort((x, y) => y.date.localeCompare(x.date)).map((t) => [
                  t.date, t.product, t.dose, t.reason,
                  t.wd ? <span key="w" style={{ color: inWithdrawal(t.date, t.wd, T) ? 'var(--err)' : 'var(--muted)', fontWeight: inWithdrawal(t.date, t.wd, T) ? 700 : 400 }}>{t.wd} d → {withdrawalEnd(t.date, t.wd)}</span> : '—',
                  <Btn key="x" kind="ghost" onClick={() => set({ treats: s.treats.filter((x) => x.id !== t.id) })}>✕</Btn>,
                ])} />
                <Row>
                  <Txt label="Date" type="date" value={nt.date} onChange={(date) => setNt({ ...nt, date })} />
                  <Txt label="Product" value={nt.product} onChange={(product) => setNt({ ...nt, product })} />
                  <Txt label="Dose / route" value={nt.dose} onChange={(dose) => setNt({ ...nt, dose })} />
                </Row>
                <Row>
                  <Txt label="Reason" value={nt.reason} onChange={(reason) => setNt({ ...nt, reason })} />
                  <Txt label="Withdrawal (days)" type="number" value={String(nt.wd)} onChange={(v) => setNt({ ...nt, wd: Math.max(0, Math.round(Number(v) || 0)) })} />
                  <Btn kind="primary" disabled={!nt.product} onClick={() => { set({ treats: [...s.treats, { id: uid(), aid: a.id, ...nt }] }); setNt({ ...nt, product: '', dose: '', reason: '', wd: 0 }) }}>+ Treatment</Btn>
                </Row>
              </Panel>
              {a.sex === 'F' && (
                <Panel title="Births">
                  <Table head={['Date', 'Offspring', 'Sex', `Birth ${u}`, 'Ease', 'Notes']} rows={s.births.filter((b) => b.dam === a.id).sort((x, y) => y.date.localeCompare(x.date)).map((b) => {
                    const c = byId.get(b.calf)
                    return [b.date, c ? <button key="c" type="button" className="k-btn ghost" onClick={() => setSel(c.id)}>{c.tag}</button> : '—', c?.sex ?? '', b.bw || '—', EASE[b.ease] ?? b.ease, b.notes]
                  })} />
                  <Row>
                    <Txt label="Date" type="date" value={nb.date} onChange={(date) => setNb({ ...nb, date })} />
                    <Txt label="Offspring tag" value={nb.tag} onChange={(tag) => setNb({ ...nb, tag })} />
                    <Select label="Sex" value={nb.sex} onChange={(sex) => setNb({ ...nb, sex })} options={[['F', 'Female'], ['M', 'Male']]} />
                  </Row>
                  <Row>
                    <Txt label={`Birth weight (${u})`} type="number" value={nb.bw ? String(nb.bw) : ''} onChange={(v) => setNb({ ...nb, bw: Number(v) || 0 })} />
                    <Select label="Ease" value={nb.ease} onChange={(ease) => setNb({ ...nb, ease })} options={EASE.slice(1).map((l, i) => [i + 1, l] as [number, string])} />
                    <Btn kind="primary" disabled={!nb.tag} onClick={() => {
                      const calf: Animal = { ...blankAnimal(), tag: nb.tag, species: a.species, breed: a.breed, sex: nb.sex, dob: nb.date, dam: a.tag }
                      set({ animals: [...s.animals, calf], births: [...s.births, { id: uid(), dam: a.id, date: nb.date, calf: calf.id, ease: nb.ease, bw: nb.bw, notes: '' }], weights: nb.bw ? [...s.weights, { id: uid(), aid: calf.id, date: nb.date, kg: nb.bw }] : s.weights })
                      setNb({ ...nb, tag: '', bw: 0 })
                    }}>+ Record birth</Btn>
                  </Row>
                  <p className="k-hint">Recording a birth also creates the offspring’s own record (with its birth weight).</p>
                </Panel>
              )}
            </>
          ) : (
            <Panel title="No animal selected"><p>Add an animal or pick one from the list.</p></Panel>
          )}
          <Panel title="Herd ADG comparison">
            <BarChart bars={active.map((x) => ({ label: x.tag, value: +(overallAdg(wOf(x.id)) ?? 0).toFixed(2), color: x.id === a?.id ? '#f59e0b' : undefined })).filter((b) => b.value !== 0)} fy={(v) => `${v.toFixed(2)}`} height={200} />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
