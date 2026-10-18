import { useRef, useState } from 'react'
import { Btn, download, FileDrop, money, Note, Num, num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { addDays, DOC_TYPES, expiry, isSealed, isWallet, ITERATIONS, newKey, sealWallet, STATUS, toIcs, unlockWallet, type CarDoc, type DocType, type FileRef, type SealedWallet, type Vehicle, type Wallet } from './lib/car-document-wallet'

const T = today()
const SAMPLE: Wallet = {
  vehicles: [
    { id: 'v1', name: 'Family SUV', make: 'Toyota', model: 'RAV4 Hybrid', year: 2021, plate: 'KA 4821 BT', vin: 'JTMW43FV40D012345', odometer: 41_250, unit: 'km' },
    { id: 'v2', name: 'City hatch', make: 'Volkswagen', model: 'Golf 1.4', year: 2016, plate: 'KA 7310 CE', vin: 'WVWZZZAUZGW123456', odometer: 118_900, unit: 'km' },
  ],
  docs: [
    { id: 'd1', vehicle: 'v1', type: 'insurance', title: 'Comprehensive cover', provider: 'Northwind Mutual', number: 'NWM-55-90321', issued: addDays(T, -353), expires: addDays(T, 12), dueOdo: 0, cost: 640, notes: 'Includes windscreen. Ask about multi-car discount.', files: [] },
    { id: 'd2', vehicle: 'v1', type: 'registration', title: 'Registration certificate', provider: 'Vehicle registry', number: 'REG 0042117', issued: addDays(T, -225), expires: addDays(T, 140), dueOdo: 0, cost: 85, notes: '', files: [] },
    { id: 'd3', vehicle: 'v1', type: 'service', title: '40 000 km service', provider: 'Central Toyota', number: 'INV-7781', issued: addDays(T, -200), expires: addDays(T, 165), dueOdo: 45_000, cost: 310, notes: 'Next: brake fluid + cabin filter.', files: [] },
    { id: 'd4', vehicle: 'v1', type: 'warranty', title: 'Hybrid battery warranty', provider: 'Toyota', number: 'HB-10Y', issued: '2021-04-02', expires: '2031-04-02', dueOdo: 0, cost: 0, notes: '10 years / 200 000 km with annual hybrid check.', files: [] },
    { id: 'd5', vehicle: 'v2', type: 'inspection', title: 'Roadworthiness test', provider: 'TestCentre 12', number: 'TC-2025-8812', issued: addDays(T, -370), expires: addDays(T, -5), dueOdo: 0, cost: 45, notes: 'Advisory: rear tyres near limit.', files: [] },
    { id: 'd6', vehicle: 'v2', type: 'insurance', title: 'Third party, fire & theft', provider: 'Contoso Insure', number: 'CI-208-441', issued: addDays(T, -300), expires: addDays(T, 65), dueOdo: 0, cost: 410, notes: '', files: [] },
    { id: 'd7', vehicle: 'v2', type: 'roadside', title: 'Breakdown cover', provider: 'RoadHelp', number: 'RH-99812', issued: addDays(T, -180), expires: addDays(T, 185), dueOdo: 0, cost: 79, notes: 'Hotline on the card in the glovebox.', files: [] },
  ],
}
const DEF = { data: SAMPLE as Wallet | null, vault: null as SealedWallet | null, sel: 'all', doc: 'd1' }
const ORDER = ['expired', 'renew', 'soon', 'ok', 'none']

async function readFile(f: File): Promise<FileRef> {
  if (f.type.startsWith('image/')) {
    const img = await createImageBitmap(f)
    const k = Math.min(1, 1400 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return { id: uid(), name: f.name, mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.8) }
  }
  if (f.size > 1_500_000) throw new Error('PDFs and other files must be under 1.5 MB (photos are shrunk automatically).')
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
  return { id: uid(), name: f.name, mime: f.type || 'application/octet-stream', data }
}
const openData = (f: FileRef) => {
  const bytes = Uint8Array.from(atob(f.data.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
  window.open(URL.createObjectURL(new Blob([bytes], { type: f.mime })), '_blank', 'noopener')
}
const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'

export default function CarDocumentWallet() {
  const [s, set, reset] = useToolState('car-document-wallet', DEF)
  const [open, setOpen] = useState<Wallet | null>(null)
  const key = useRef<{ key: CryptoKey; salt: string; it: number } | null>(null)
  const seq = useRef(0)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const w = s.vault ? open : s.data

  const update = (fn: (w: Wallet) => Wallet) => {
    if (s.vault) {
      if (!open || !key.current) return
      const nw = fn(open)
      setOpen(nw)
      const n = ++seq.current
      const k = key.current
      void sealWallet(nw, k.key, k.salt, k.it).then((v) => { if (n === seq.current) set({ vault: v }) })
    } else set((st) => ({ ...st, data: fn(st.data ?? { vehicles: [], docs: [] }) }))
  }
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f() } catch (e) { setErr((e as Error).message) } setBusy(false) }

  const enable = () => run(async () => {
    if (pass !== pass2) throw new Error('The passphrases do not match.')
    const { key: k, salt } = await newKey(pass)
    key.current = { key: k, salt, it: ITERATIONS }
    const data = s.data ?? { vehicles: [], docs: [] }
    const v = await sealWallet(data, k, salt, ITERATIONS)
    setOpen(data)
    set({ vault: v, data: null })
    setPass(''); setPass2('')
  })
  const unlock = () => run(async () => {
    const u = await unlockWallet(s.vault!, pass)
    key.current = { key: u.key, salt: s.vault!.kdf.salt, it: s.vault!.kdf.iterations }
    setOpen(u.wallet)
    setPass('')
  })
  const lock = () => { key.current = null; setOpen(null) }
  const disable = () => { if (open) { set({ data: open, vault: null }); key.current = null; setOpen(null) } }

  if (s.vault && !open) {
    return (
      <Split>
        <Panel title="🔒 Wallet locked">
          <p>Your car documents are encrypted with AES-256-GCM. Enter the passphrase to open them.</p>
          <Txt label="Passphrase" type="password" value={pass} onChange={setPass} />
          <Row>
            <Btn kind="primary" disabled={busy || !pass} onClick={() => void unlock()}>{busy ? 'Deriving key…' : 'Unlock'}</Btn>
            <Btn onClick={() => download('car-wallet-encrypted.json', JSON.stringify(s.vault, null, 2), 'application/json')}>⬇ Encrypted backup</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Forgot the passphrase?">
          <Note tone="warn">There is no recovery: without the passphrase the data cannot be decrypted. You can wipe the wallet and start again.</Note>
          <Btn kind="danger" onClick={() => { if (confirm('Delete the encrypted wallet from this browser?')) { set({ vault: null, data: { vehicles: [], docs: [] } }) } }}>Wipe wallet</Btn>
        </Panel>
      </Split>
    )
  }
  if (!w) return null

  const veh = (id: string) => w.vehicles.find((v) => v.id === id)
  const docs = w.docs.filter((d) => s.sel === 'all' || d.vehicle === s.sel)
  const withExp = docs.map((d) => ({ d, e: expiry(d, T, veh(d.vehicle)?.odometer ?? 0) })).sort((a, b) => ORDER.indexOf(a.e.status) - ORDER.indexOf(b.e.status) || (a.e.days ?? 1e9) - (b.e.days ?? 1e9))
  const count = (st: string) => withExp.filter((x) => x.e.status === st).length
  const doc = w.docs.find((d) => d.id === s.doc)
  const editDoc = (p: Partial<CarDoc>) => doc && update((x) => ({ ...x, docs: x.docs.map((d) => (d.id === doc.id ? { ...d, ...p } : d)) }))
  const v = s.sel !== 'all' ? veh(s.sel) : undefined
  const editV = (p: Partial<Vehicle>) => v && update((x) => ({ ...x, vehicles: x.vehicles.map((y) => (y.id === v.id ? { ...y, ...p } : y)) }))
  const yearCost = docs.filter((d) => ['insurance', 'registration', 'roadside', 'inspection'].includes(d.type)).reduce((a, d) => a + d.cost, 0)
  const size = JSON.stringify(s).length
  const addDoc = (type: DocType) => {
    const vid = s.sel !== 'all' ? s.sel : w.vehicles[0]?.id
    if (!vid) return setErr('Add a vehicle first.')
    const d: CarDoc = { id: uid(), vehicle: vid, type, title: DOC_TYPES[type].name, provider: '', number: '', issued: T, expires: addDays(T, 365), dueOdo: 0, cost: 0, notes: '', files: [] }
    update((x) => ({ ...x, docs: [...x.docs, d] }))
    set({ doc: d.id })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Vehicles" actions={<Btn onClick={() => { const nv: Vehicle = { id: uid(), name: `Car ${w.vehicles.length + 1}`, make: '', model: '', year: new Date().getFullYear(), plate: '', vin: '', odometer: 0, unit: 'km' }; update((x) => ({ ...x, vehicles: [...x.vehicles, nv] })); set({ sel: nv.id }) }}>+ Vehicle</Btn>}>
          <Row>
            <Btn kind={s.sel === 'all' ? 'primary' : 'ghost'} onClick={() => set({ sel: 'all' })}>All</Btn>
            {w.vehicles.map((x) => <Btn key={x.id} kind={s.sel === x.id ? 'primary' : 'ghost'} onClick={() => set({ sel: x.id })}>🚗 {x.name}</Btn>)}
          </Row>
          {v ? (
            <>
              <Row>
                <Txt label="Nickname" value={v.name} onChange={(name) => editV({ name })} />
                <Txt label="Plate" value={v.plate} onChange={(plate) => editV({ plate })} />
              </Row>
              <Row>
                <Txt label="Make" value={v.make} onChange={(make) => editV({ make })} />
                <Txt label="Model" value={v.model} onChange={(model) => editV({ model })} />
                <Num label="Year" value={v.year} onChange={(year) => editV({ year })} min={1900} max={2100} />
              </Row>
              <Txt label="VIN" value={v.vin} onChange={(vin) => editV({ vin: vin.toUpperCase() })} hint={v.vin && v.vin.length !== 17 ? 'Modern VINs have 17 characters' : undefined} />
              <Row>
                <Num label="Odometer" value={v.odometer} onChange={(odometer) => editV({ odometer: Math.max(0, odometer) })} min={0} />
                <Select label="Unit" value={v.unit} onChange={(unit) => editV({ unit })} options={[['km', 'km'], ['mi', 'miles']]} />
              </Row>
              <Btn kind="ghost" onClick={() => { if (confirm(`Delete ${v.name} and its documents?`)) { update((x) => ({ vehicles: x.vehicles.filter((y) => y.id !== v.id), docs: x.docs.filter((d) => d.vehicle !== v.id) })); set({ sel: 'all' }) } }}>Delete vehicle</Btn>
            </>
          ) : <p className="muted" style={{ fontSize: 13 }}>Pick a vehicle to edit its details and odometer (used for service-due reminders).</p>}
        </Panel>
        <Panel title={s.vault ? '🔐 Encrypted' : '🔓 Encryption (optional)'}>
          {s.vault ? (
            <>
              <Note tone="ok">Stored encrypted (AES-256-GCM, PBKDF2-SHA-256 × {num(s.vault.kdf.iterations, 0)}). Only ciphertext is saved in this browser.</Note>
              <Row>
                <Btn onClick={lock}>🔒 Lock now</Btn>
                <Btn kind="ghost" onClick={() => { if (confirm('Store the wallet unencrypted again?')) disable() }}>Turn off encryption</Btn>
              </Row>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Protect policy numbers, VINs and scans with a passphrase. If you forget it, the data is gone.</p>
              <Row>
                <Txt label="Passphrase" type="password" value={pass} onChange={setPass} />
                <Txt label="Repeat" type="password" value={pass2} onChange={setPass2} />
              </Row>
              <Btn kind="primary" disabled={busy || pass.length < 8} onClick={() => void enable()}>{busy ? 'Encrypting…' : 'Encrypt wallet'}</Btn>
            </>
          )}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Backup & calendar">
          <Row>
            <Btn kind="primary" onClick={() => download('car-renewals.ics', toIcs(w, stampNow()), 'text/calendar')}>📅 Renewal reminders (.ics)</Btn>
            <Btn onClick={() => download(s.vault ? 'car-wallet-encrypted.json' : 'car-wallet.json', JSON.stringify(s.vault ?? w, null, 2), 'application/json')}>⬇ Backup{s.vault ? ' (encrypted)' : ''}</Btn>
            <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try {
                const j = JSON.parse(await f.text())
                if (isSealed(j)) { key.current = null; setOpen(null); set({ vault: j, data: null }) }
                else if (isWallet(j)) { if (s.vault) update(() => j); else set({ data: j }) }
                else setErr('That file is not a car wallet backup.')
              } catch { setErr('Could not read that file.') }
            }} /></label>
            {!s.vault && <Btn kind="ghost" onClick={reset}>Reset sample</Btn>}
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Works offline; nothing leaves this browser. Using {num(size / 1024, 0)} KB of ~5 MB — photos are shrunk to 1400 px.</p>
          {size > 3_800_000 && <Note tone="warn">Storage nearly full: remove some scans or keep them elsewhere.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Documents" value={docs.length} sub={s.sel === 'all' ? `${w.vehicles.length} vehicles` : v?.name} />
          <Stat label="Expired" value={count('expired')} tone={count('expired') ? 'bad' : undefined} />
          <Stat label="Renew now" value={count('renew')} sub={`${count('soon')} coming up`} tone={count('renew') ? 'accent' : undefined} />
          <Stat label="Yearly fixed costs" value={money(yearCost, '', 0)} sub="insurance, tax, tests, cover" />
        </Stats>
        <Panel title="Expiry dashboard" actions={<Select label="" value="" onChange={(t: string) => t && addDoc(t as DocType)} options={[['', '+ Add document…'], ...Object.entries(DOC_TYPES).map(([k, t]) => [k, `${t.icon} ${t.name}`] as [string, string])]} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {withExp.map(({ d, e }) => {
              const car = veh(d.vehicle)
              return (
                <div key={d.id} onClick={() => set({ doc: d.id })} style={{ cursor: 'pointer', borderRadius: 10, padding: '8px 10px', border: `1px solid ${d.id === s.doc ? 'var(--accent)' : 'var(--line)'}`, borderLeft: `6px solid ${STATUS[e.status].color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <b>{DOC_TYPES[d.type].icon} {d.title}</b>
                    {d.files.length > 0 && <span title="attachments">📎{d.files.length}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{car?.name ?? '—'}{d.provider ? ` · ${d.provider}` : ''}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <b style={{ color: STATUS[e.status].color }}>{STATUS[e.status].label}</b> · {e.text}{e.kmLeft !== null && ` ${car?.unit ?? 'km'}`}
                  </div>
                  {d.expires && <div className="muted" style={{ fontSize: 11 }}>expires {d.expires}{e.status !== 'expired' && e.status !== 'none' ? ` · renew by ${e.renewBy}` : ''}</div>}
                </div>
              )
            })}
          </div>
          {!withExp.length && <Note>No documents for this vehicle yet. Use “+ Add document…”.</Note>}
        </Panel>
        {doc && (
          <Panel title={`${DOC_TYPES[doc.type].icon} ${doc.title}`} actions={<Btn kind="ghost" onClick={() => { update((x) => ({ ...x, docs: x.docs.filter((d) => d.id !== doc.id) })); set({ doc: '' }) }}>Delete</Btn>}>
            <Row>
              <Select label="Type" value={doc.type} onChange={(type) => editDoc({ type })} options={Object.entries(DOC_TYPES).map(([k, t]) => [k as DocType, t.name] as [DocType, string])} />
              <Select label="Vehicle" value={doc.vehicle} onChange={(vehicle) => editDoc({ vehicle })} options={w.vehicles.map((x) => [x.id, x.name] as [string, string])} />
            </Row>
            <Row>
              <Txt label="Title" value={doc.title} onChange={(title) => editDoc({ title })} />
              <Txt label="Provider / issuer" value={doc.provider} onChange={(provider) => editDoc({ provider })} />
              <Txt label="Policy / reference no." value={doc.number} onChange={(number) => editDoc({ number })} />
            </Row>
            <Row>
              <Txt label="Issued" type="date" value={doc.issued} onChange={(issued) => editDoc({ issued })} />
              <Txt label="Expires / due" type="date" value={doc.expires} onChange={(expires) => editDoc({ expires })} />
              <Num label={`Due at odometer (${veh(doc.vehicle)?.unit ?? 'km'})`} value={doc.dueOdo} onChange={(dueOdo) => editDoc({ dueOdo: Math.max(0, dueOdo) })} min={0} hint="0 = not mileage based" />
              <Num label="Cost" value={doc.cost} onChange={(cost) => editDoc({ cost: Math.max(0, cost) })} min={0} />
            </Row>
            <Txt label="Notes" value={doc.notes} onChange={(notes) => editDoc({ notes })} />
            <Row>
              <Btn kind="ghost" disabled={!doc.expires} onClick={() => editDoc({ issued: doc.expires, expires: addDays(doc.expires, 365) })} title="Roll dates forward one year">↻ Renewed for a year</Btn>
            </Row>
            <FileDrop accept="image/*,application/pdf" multiple onFiles={(fs) => void run(async () => { const add: FileRef[] = []; for (const f of fs) add.push(await readFile(f)); editDoc({ files: [...doc.files, ...add] }) })} label="Attach photos or PDFs of this document" />
            {doc.files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {doc.files.map((f) => (
                  <div key={f.id} style={{ textAlign: 'center', width: 110 }}>
                    <button type="button" onClick={() => openData(f)} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 0, background: 'none', cursor: 'zoom-in', width: 110, height: 80, overflow: 'hidden' }}>
                      {f.mime.startsWith('image/') ? <img src={f.data} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30 }}>📄</span>}
                    </button>
                    <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <Btn kind="ghost" onClick={() => editDoc({ files: doc.files.filter((x) => x.id !== f.id) })}>Remove</Btn>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
        <Panel title="All documents">
          <Table
            head={['Vehicle', 'Document', 'Ref', 'Expires', 'Status', 'Cost']}
            rows={withExp.map(({ d, e }) => [veh(d.vehicle)?.name ?? '—', `${DOC_TYPES[d.type].icon} ${d.title}`, d.number || '—', d.expires || '—', <b key="s" style={{ color: STATUS[e.status].color }}>{STATUS[e.status].label}</b>, d.cost ? money(d.cost, '', 0) : '—'])}
          />
        </Panel>
      </div>
    </Split>
  )
}
