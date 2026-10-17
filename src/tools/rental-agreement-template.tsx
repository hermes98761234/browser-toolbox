import { useState } from 'react'
import { Area, Btn, Check, CopyButton, download, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { addMonths, buildLease, fmtMoney, longDate, makeDocx, prorated, toText, type Block, type Lease } from './lib/rental-agreement-template'

const UTILS = ['Electricity', 'Gas', 'Water & sewer', 'Trash', 'Internet', 'Heating', 'HOA fees'] as const
type Who = 'L' | 'T' | '-'

const DEF = {
  landlord: 'Harbor Property LLC',
  landlordAddr: '210 Pine Ave, Portland, OR 97204',
  tenants: 'Jordan Rivera and Casey Kim',
  address: '48 Willow Street, Apt 5B, Portland, OR 97205',
  unitType: 'two-bedroom apartment',
  furnished: false,
  kind: 'fixed' as Lease['kind'],
  start: '2026-11-15',
  months: 12,
  rent: 1850,
  currency: '$',
  dueDay: 1,
  payMethod: 'bank transfer to the account Landlord designates in writing',
  graceDays: 5,
  lateFee: 75,
  deposit: 1850,
  depositDays: 31,
  utils: { Electricity: 'T', Gas: 'T', 'Water & sewer': 'L', Trash: 'L', Internet: 'T', Heating: '-', 'HOA fees': '-' } as Record<string, Who>,
  pets: true,
  petDeposit: 300,
  smoking: false,
  maxOccupants: 3,
  parking: 'One assigned parking space (#12) is included in the rent.',
  entryHours: 24,
  noticeDays: 30,
  law: 'the State of Oregon',
  extra: '',
}
type S = typeof DEF

const toLease = (s: S): Lease => ({
  ...s,
  utilitiesLandlord: UTILS.filter((u) => s.utils[u] === 'L').map((u) => u.toLowerCase()),
  utilitiesTenant: UTILS.filter((u) => s.utils[u] === 'T').map((u) => u.toLowerCase()),
})

function toHtml(blocks: Block[]): string {
  const e = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return blocks
    .map((b) =>
      b.t === 'title' ? `<h1>${e(b.text)}</h1>` : b.t === 'h' ? `<h2>${e(b.text)}</h2>` : b.t === 'sig' ? `<div class="sig"><b>${e(b.text)}</b><div>Signature: ______________________ &nbsp; Date: ____________</div></div>` : `<p>${e(b.text)}</p>`,
    )
    .join('')
}
const PRINT_CSS = 'body{font:11.5pt/1.5 Georgia,serif;max-width:7in;margin:0.6in auto;color:#111}h1{text-align:center;font-size:18pt}h2{font-size:12pt;margin:14pt 0 4pt;break-after:avoid}p{text-align:justify;margin:0 0 6pt}.sig{margin-top:22pt;break-inside:avoid}.sig div{margin-top:16pt}'

export default function RentalAgreementTemplate() {
  const [s, set, reset] = useToolState('rental-agreement-template', DEF)
  const [step, setStep] = useState<'parties' | 'money' | 'rules' | 'extra'>('parties')
  const lease = toLease(s)
  const blocks = buildLease(lease)
  const pro = prorated(s.rent, s.start, s.dueDay)
  const moveIn = (pro.days ? pro.amount : s.rent) + s.deposit + (s.pets ? s.petDeposit : 0)
  const m = (x: number) => fmtMoney(x, s.currency)
  const fname = `lease-${s.address.split(',')[0].replace(/[^\w]+/g, '-').toLowerCase() || 'agreement'}`

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Residential Lease Agreement</title><style>${PRINT_CSS}</style></head><body>${toHtml(blocks)}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Lease details" actions={<Btn kind="ghost" onClick={reset}>Example</Btn>}>
          <Seg value={step} onChange={setStep} options={[['parties', '1 · Parties'], ['money', '2 · Rent'], ['rules', '3 · Rules'], ['extra', '4 · Extras']]} label="Section" />
          <div style={{ marginTop: 12 }}>
            {step === 'parties' && (
              <>
                <Txt label="Landlord (person or company)" value={s.landlord} onChange={(landlord) => set({ landlord })} />
                <Txt label="Landlord address for notices" value={s.landlordAddr} onChange={(landlordAddr) => set({ landlordAddr })} />
                <Txt label="Tenant(s)" value={s.tenants} onChange={(tenants) => set({ tenants })} hint="Separate several names with commas or “and”: each gets a signature line." />
                <Txt label="Property address" value={s.address} onChange={(address) => set({ address })} />
                <Row>
                  <Txt label="Type of home" value={s.unitType} onChange={(unitType) => set({ unitType })} />
                  <Num label="Max occupants" value={s.maxOccupants} onChange={(maxOccupants) => set({ maxOccupants })} min={1} />
                </Row>
                <Check label="Furnished" value={s.furnished} onChange={(furnished) => set({ furnished })} />
              </>
            )}
            {step === 'money' && (
              <>
                <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['fixed', 'Fixed term'], ['monthly', 'Month-to-month']]} label="Lease type" />
                <Row>
                  <Txt label="Start date" type="date" value={s.start} onChange={(start) => set({ start })} />
                  {s.kind === 'fixed' && <Num label="Term" value={s.months} onChange={(months) => set({ months: Math.max(1, Math.round(months)) })} unit="months" min={1} />}
                </Row>
                <Row>
                  <Num label="Monthly rent" value={s.rent} onChange={(rent) => set({ rent })} unit={s.currency} min={0} />
                  <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'C$', 'A$', '₴', 'zł', 'CHF ']} />
                </Row>
                <Row>
                  <Num label="Due on day" value={s.dueDay} onChange={(dueDay) => set({ dueDay: Math.min(28, Math.max(1, Math.round(dueDay))) })} min={1} max={28} />
                  <Num label="Grace period" value={s.graceDays} onChange={(graceDays) => set({ graceDays })} unit="days" min={0} />
                  <Num label="Late fee" value={s.lateFee} onChange={(lateFee) => set({ lateFee })} unit={s.currency} min={0} />
                </Row>
                <Txt label="Payment method" value={s.payMethod} onChange={(payMethod) => set({ payMethod })} />
                <Row>
                  <Num label="Security deposit" value={s.deposit} onChange={(deposit) => set({ deposit })} unit={s.currency} min={0} />
                  <Num label="Return deposit within" value={s.depositDays} onChange={(depositDays) => set({ depositDays })} unit="days" min={1} />
                </Row>
              </>
            )}
            {step === 'rules' && (
              <>
                <div className="k-label" style={{ marginBottom: 6 }}>Who pays utilities?</div>
                {UTILS.map((u) => (
                  <Row key={u} wrap={false}>
                    <span style={{ flex: 1 }}>{u}</span>
                    <Seg value={s.utils[u] ?? '-'} onChange={(v: Who) => set({ utils: { ...s.utils, [u]: v } })} options={[['L', 'Landlord'], ['T', 'Tenant'], ['-', 'N/A']]} label={u} />
                  </Row>
                ))}
                <Check label="Pets allowed" value={s.pets} onChange={(pets) => set({ pets })} />
                {s.pets && <Num label="Pet deposit" value={s.petDeposit} onChange={(petDeposit) => set({ petDeposit })} unit={s.currency} min={0} />}
                <Check label="Smoking allowed outdoors" value={s.smoking} onChange={(smoking) => set({ smoking })} />
                <Row>
                  <Num label="Entry notice" value={s.entryHours} onChange={(entryHours) => set({ entryHours })} unit="hours" min={0} />
                  <Num label="Termination notice" value={s.noticeDays} onChange={(noticeDays) => set({ noticeDays })} unit="days" min={0} />
                </Row>
              </>
            )}
            {step === 'extra' && (
              <>
                <Txt label="Parking" value={s.parking} onChange={(parking) => set({ parking })} placeholder="Leave empty to omit the clause" />
                <Txt label="Governing law (state / country)" value={s.law} onChange={(law) => set({ law })} />
                <Area label="Additional terms (one paragraph per line)" value={s.extra} onChange={(extra) => set({ extra })} rows={5} placeholder="e.g. Tenant shall maintain renter's insurance with at least $100,000 liability coverage." />
              </>
            )}
          </div>
        </Panel>
        <Note tone="warn">
          <b>Not legal advice.</b> This is a general template. Landlord–tenant law (deposit caps, notice periods, late-fee limits, required disclosures such as lead paint) varies by state and country. Have it reviewed by a local professional before signing.
        </Note>
      </div>
      <div>
        <Stats>
          <Stat label="Monthly rent" value={m(s.rent)} />
          <Stat label="Due at move-in" value={m(moveIn)} sub={`${pro.days ? `prorated ${pro.days} days` : 'first month'} + deposit${s.pets && s.petDeposit ? ' + pet deposit' : ''}`} tone="accent" />
          <Stat label={s.kind === 'fixed' ? 'Rent over the term' : 'Rent per year'} value={m(s.rent * (s.kind === 'fixed' ? s.months : 12))} sub={s.kind === 'fixed' ? `ends ${longDate(addMonths(s.start, s.months))}` : 'month-to-month'} />
        </Stats>
        <Panel
          title="Agreement"
          actions={
            <>
              <Btn kind="primary" onClick={() => download(`${fname}.docx`, new Blob([makeDocx(blocks) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
              <Btn onClick={print}>🖨 Print / PDF</Btn>
              <Btn onClick={() => download(`${fname}.txt`, toText(blocks))}>⬇ TXT</Btn>
              <CopyButton text={() => toText(blocks)} label="Copy" />
            </>
          }
        >
          <div style={{ background: '#fff', color: '#111', borderRadius: 8, border: '1px solid var(--line)', padding: 'clamp(16px, 4vw, 40px)', fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.55, maxHeight: 760, overflowY: 'auto' }}>
            {blocks.map((b, i) =>
              b.t === 'title' ? (
                <h2 key={i} style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 22 }}>{b.text}</h2>
              ) : b.t === 'h' ? (
                <h4 key={i} style={{ margin: '16px 0 4px', fontSize: 15 }}>{b.text}</h4>
              ) : b.t === 'sig' ? (
                <div key={i} style={{ marginTop: 22 }}>
                  <b>{b.text}</b>
                  <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
                    <span style={{ borderTop: '1px solid #111', minWidth: 220, paddingTop: 2, fontSize: 12 }}>Signature</span>
                    <span style={{ borderTop: '1px solid #111', minWidth: 120, paddingTop: 2, fontSize: 12 }}>Date</span>
                  </div>
                </div>
              ) : (
                <p key={i} style={{ margin: '0 0 8px', textAlign: 'justify' }}>{b.text}</p>
              ),
            )}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
