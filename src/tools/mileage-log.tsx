import { useState } from 'react'
import { BarChart, Btn, Check, CsvButton, Donut, download, JsonButtons, money, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { claim, odometerIssues, RATE_SETS, summary, tripDistance, type Cat, type RateSet, type Trip } from './lib/mileage-log'

interface State {
  rateId: string
  custom: { unit: 'mi' | 'km'; currency: string; rate: number }
  year: string
  trips: Trip[]
}

const trip = (date: string, vehicle: string, from: string, to: string, purpose: string, cat: Cat, start: number | null, end: number | null, dist = 0, round = false): Trip => ({ id: uid(), date, vehicle, from, to, purpose, cat, start, end, dist, round })
const SAMPLE: Trip[] = [
  trip('2026-01-08', 'Corolla', 'Office', 'Acme Corp HQ', 'Quarterly review meeting', 'business', 41250, 41312),
  trip('2026-01-21', 'Corolla', 'Office', 'Print shop', 'Pick up brochures', 'business', 41390, 41404),
  trip('2026-02-04', 'Corolla', 'Home', 'Riverside Clinic', 'Physiotherapy', 'medical', null, null, 9, true),
  trip('2026-02-17', 'Corolla', 'Office', 'Trade fair, Exeter', 'Exhibitor setup', 'business', 41520, 41708),
  trip('2026-03-03', 'Corolla', 'Office', 'Client – Bright Dental', 'Install workshop', 'business', 41800, 41846),
  trip('2026-03-28', 'Corolla', 'Home', 'Food bank', 'Volunteer delivery run', 'charity', null, null, 12, true),
  trip('2026-04-14', 'Corolla', 'Office', 'Airport', 'Flight to supplier visit', 'business', 42010, 42073),
  trip('2026-05-06', 'Corolla', 'Home', 'Lakeside', 'Weekend trip', 'personal', null, null, 140),
  trip('2026-05-19', 'Corolla', 'Office', 'Northwind Ltd', 'Contract signing', 'business', 42390, 42455),
  trip('2026-06-11', 'Corolla', 'Office', 'Bank', 'Deposit and accountant visit', 'business', null, null, 6, true),
  trip('2026-07-02', 'Corolla', 'Office', 'Client – Hill Farm', 'Site survey', 'business', 42800, 42921),
  trip('2026-08-20', 'Corolla', 'Office', 'Conference centre', 'Industry conference', 'business', 43210, 43388),
  trip('2026-09-09', 'Corolla', 'Office', 'Acme Corp HQ', 'Quarterly review meeting', 'business', 43500, 43562),
  trip('2026-10-05', 'Corolla', 'Office', 'Hardware store', 'Office supplies', 'business', null, null, 4, true),
]

const DEF: State = { rateId: 'irs2025', custom: { unit: 'km', currency: '€', rate: 0.3 }, year: '2026', trips: SAMPLE }
const CATS: [Cat, string][] = [['business', 'Business'], ['medical', 'Medical'], ['charity', 'Charity'], ['personal', 'Personal']]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const latin = (s: string) => s.replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '?')

export default function MileageLog() {
  const [s, set, reset] = useToolState('mileage-log', DEF)
  const base = RATE_SETS.find((r) => r.id === s.rateId) ?? RATE_SETS[0]
  const rates: RateSet = base.id === 'custom' ? { ...base, unit: s.custom.unit, currency: s.custom.currency, business: [{ upTo: null, rate: s.custom.rate }] } : base
  const u = rates.unit
  const m = (x: number) => money(x, rates.currency)
  const years = [...new Set([s.year, ...s.trips.map((x) => x.date.slice(0, 4))])].sort().reverse()
  const yearTrips = s.trips.filter((x) => x.date.startsWith(s.year))
  const lines = claim(yearTrips, rates)
  const sum = summary(lines)
  const issues = odometerIssues(s.trips)
  const lastEnd = (v: string) => Math.max(0, ...s.trips.filter((x) => x.vehicle === v && x.end !== null).map((x) => x.end!))

  const blank = (): Trip => {
    const v = s.trips.at(-1)?.vehicle ?? 'Car'
    return { id: uid(), date: today(), vehicle: v, from: '', to: '', purpose: '', cat: 'business', start: lastEnd(v) || null, end: null, dist: 0, round: false }
  }
  const [d, setD] = useState<Trip>(blank)
  const [odo, setOdo] = useState(true)
  const draftDist = odo ? (d.start !== null && d.end !== null ? d.end - d.start : NaN) : tripDistance({ ...d, start: null, end: null })
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(draftDist) && draftDist > 0 && d.purpose.trim() !== ''
  const add = () => {
    const nt = odo ? { ...d, dist: 0, round: false } : { ...d, start: null, end: null }
    set({ trips: [...s.trips, nt], year: nt.date.slice(0, 4) })
    setD({ ...blank(), vehicle: d.vehicle, start: odo && d.end !== null ? d.end : null, cat: d.cat })
  }

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    let page = doc.addPage([841.89, 595.28])
    let y = 550
    const tx = (s2: string, x: number, size = 9, b = false) => page.drawText(latin(s2), { x, y, size, font: b ? bold : font, color: rgb(0.1, 0.1, 0.15) })
    tx(`Mileage log ${s.year}`, 40, 18, true)
    y -= 18
    tx(`Rates: ${rates.name} · generated ${today()}`, 40, 9)
    y -= 22
    const cols = [40, 105, 170, 300, 430, 600, 660, 730]
    const head = () => { ['Date', 'Vehicle', 'From', 'To', 'Purpose', 'Category', `Dist (${u})`, 'Amount'].forEach((h, i) => tx(h, cols[i], 9, true)); y -= 14 }
    head()
    for (const l of lines) {
      if (y < 60) { page = doc.addPage([841.89, 595.28]); y = 550; head() }
      const odoTxt = l.trip.start !== null ? ` (${l.trip.start}-${l.trip.end})` : ''
      ;[l.trip.date, l.trip.vehicle, l.trip.from, l.trip.to, l.trip.purpose + odoTxt, l.trip.cat, num(l.distance, 1), m(l.amount)].forEach((c, i) => tx(c.slice(0, i === 4 ? 40 : 26), cols[i]))
      y -= 13
    }
    y -= 10
    page.drawLine({ start: { x: 40, y: y + 8 }, end: { x: 800, y: y + 8 }, thickness: 0.6 })
    tx(`Total ${num(sum.total, 1)} ${u} · business ${num(sum.byCat.business, 1)} ${u} (${pct(sum.businessShare)}) · medical ${num(sum.byCat.medical, 1)} · charity ${num(sum.byCat.charity, 1)} · claim ${m(sum.amount)}`, 40, 10, true)
    const bytes = await doc.save()
    download(`mileage-log-${s.year}.pdf`, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Log a trip">
          <Row>
            <Txt label="Date" type="date" value={d.date} onChange={(date) => setD({ ...d, date })} />
            <Txt label="Vehicle" value={d.vehicle} onChange={(vehicle) => setD({ ...d, vehicle, start: odo ? lastEnd(vehicle) || d.start : null })} />
          </Row>
          <Row>
            <Txt label="From" value={d.from} onChange={(from) => setD({ ...d, from })} />
            <Txt label="To" value={d.to} onChange={(to) => setD({ ...d, to })} />
          </Row>
          <Txt label="Business purpose" value={d.purpose} onChange={(purpose) => setD({ ...d, purpose })} placeholder="Who / why — required for deductions" />
          <Select label="Category" value={d.cat} onChange={(cat) => setD({ ...d, cat })} options={CATS} />
          <Seg value={odo ? 'o' : 'd'} onChange={(v) => setOdo(v === 'o')} options={[['o', 'Odometer'], ['d', 'Distance']]} label="Entry mode" />
          {odo ? (
            <Row>
              <Num label="Start reading" value={d.start ?? 0} onChange={(start) => setD({ ...d, start })} unit={u} min={0} />
              <Num label="End reading" value={d.end ?? 0} onChange={(end) => setD({ ...d, end })} unit={u} min={0} />
            </Row>
          ) : (
            <Row>
              <Num label="Distance" value={d.dist} onChange={(dist) => setD({ ...d, dist })} unit={u} min={0} />
              <Check label="Round trip (×2)" value={d.round} onChange={(round) => setD({ ...d, round })} />
            </Row>
          )}
          <Row>
            <Btn kind="primary" disabled={!valid} onClick={add}>+ Add trip{Number.isFinite(draftDist) && draftDist > 0 ? ` · ${num(draftDist, 1)} ${u}` : ''}</Btn>
          </Row>
          {odo && d.start !== null && d.end !== null && d.end <= d.start && <Note tone="err">End reading must be higher than the start.</Note>}
        </Panel>
        <Panel title="Rates" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Rate table" value={s.rateId} onChange={(rateId) => set({ rateId })} options={RATE_SETS.map((r) => [r.id, r.name] as [string, string])} />
          {s.rateId === 'custom' && (
            <Row>
              <Num label="Rate per unit" value={s.custom.rate} onChange={(rate) => set({ custom: { ...s.custom, rate } })} min={0} />
              <Select label="Unit" value={s.custom.unit} onChange={(unit) => set({ custom: { ...s.custom, unit } })} options={[['km', 'km'], ['mi', 'miles']]} />
              <Select label="Currency" value={s.custom.currency} onChange={(currency) => set({ custom: { ...s.custom, currency } })} options={['€', '$', '£', 'zł', '₴', 'CHF ']} />
            </Row>
          )}
          <Note>{rates.note} Check the current official rate for your tax year — rates change annually.</Note>
        </Panel>
      </div>

      <div>
        <Row>
          <Select label="Year" value={s.year} onChange={(year) => set({ year })} options={years} />
        </Row>
        <Stats>
          <Stat label="Business distance" value={`${num(sum.byCat.business, 0)} ${u}`} sub={`${pct(sum.businessShare, 0)} of ${num(sum.total, 0)} ${u}`} />
          <Stat label="Deduction / claim" value={m(sum.amount)} tone="good" />
          <Stat label="Trips" value={yearTrips.length} sub={Object.keys(issues).length ? `${Object.keys(issues).length} odometer issue(s)` : 'odometer OK'} tone={Object.keys(issues).length ? 'bad' : undefined} />
        </Stats>
        <Panel
          title={`Trips ${s.year}`}
          actions={
            <>
              <Btn kind="primary" onClick={() => void pdf()}>⬇ PDF summary</Btn>
              <CsvButton name={`mileage-${s.year}.csv`} rows={() => [['Date', 'Vehicle', 'From', 'To', 'Purpose', 'Category', 'Odometer start', 'Odometer end', `Distance (${u})`, `Amount (${rates.currency.trim()})`], ...lines.map((l) => [l.trip.date, l.trip.vehicle, l.trip.from, l.trip.to, l.trip.purpose, l.trip.cat, l.trip.start ?? '', l.trip.end ?? '', l.distance, Math.round(l.amount * 100) / 100])]} />
              <JsonButtons name="mileage-log.json" data={s} onLoad={(x) => set(x)} />
            </>
          }
        >
          <Table
            head={['Date', 'Route', 'Purpose', 'Cat.', 'Distance', 'Amount', '']}
            rows={[...lines].reverse().map((l) => [
              l.trip.date,
              <span key="r">{l.trip.from} → {l.trip.to}<br /><span className="muted" style={{ fontSize: 12 }}>{l.trip.vehicle}{l.trip.start !== null ? ` · ${l.trip.start}–${l.trip.end}` : l.trip.round ? ' · round trip' : ''}</span></span>,
              <span key="p">{l.trip.purpose}{issues[l.trip.id] && <><br /><span style={{ color: 'var(--err)', fontSize: 12 }}>⚠ {issues[l.trip.id]}</span></>}</span>,
              l.trip.cat,
              `${num(l.distance, 1)} ${u}`,
              l.amount ? m(l.amount) : '—',
              <span key="x" style={{ whiteSpace: 'nowrap' }}>
                <Btn kind="ghost" title="Repeat today" onClick={() => set({ trips: [...s.trips, { ...l.trip, id: uid(), date: today(), ...(l.trip.start !== null ? { start: lastEnd(l.trip.vehicle), end: lastEnd(l.trip.vehicle) + l.distance } : {}) }] })}>↻</Btn>
                <Btn kind="ghost" title="Delete" onClick={() => set({ trips: s.trips.filter((x) => x.id !== l.trip.id) })}>✕</Btn>
              </span>,
            ])}
            foot={['Total', '', '', '', `${num(sum.total, 1)} ${u}`, m(sum.amount), '']}
            max={100}
          />
          {!yearTrips.length && <Note>No trips logged for {s.year}.</Note>}
        </Panel>
        <Panel title="By month">
          <BarChart bars={sum.months.map((x, i) => ({ label: MONTHS[i], value: [x.business, x.distance - x.business] }))} stacks={[{ name: 'Business', color: '#6366f1' }, { name: 'Other', color: '#94a3b8' }]} fy={(v) => `${num(v, 0)}`} height={220} />
        </Panel>
        <Panel title="By category">
          <Donut slices={CATS.map(([c, n]) => ({ label: n, value: sum.byCat[c] }))} fv={(v) => `${num(v, 0)} ${u}`} />
        </Panel>
      </div>
    </Split>
  )
}
