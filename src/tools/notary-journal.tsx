import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, download, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, toCsv, Txt, uid, useToolState } from '../kit'
import { strength } from './lib/encrypted-notes-vault'
import { ACTS, csvRows, diff, ID_TYPES, maskId, merge, newKey, nextSeq, openEntries, parseBlob, sealEntries, search, stats, validate, type EncBlob, type Entry } from './lib/notary-journal'

type Key = Awaited<ReturnType<typeof newKey>>
const now = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
const blank = (seq: number): Entry => ({ id: uid(), seq, when: now(), act: 'Acknowledgment', docType: '', docDate: '', signer: '', address: '', idType: 'Driver licence', idNumber: '', idIssuer: '', idExpiry: '', witnesses: '', fee: 15, travelFee: 0, location: '', remote: false, thumbprint: false, signature: '', notes: '', created: '', history: [] })
const S = (p: Partial<Entry>): Entry => ({ ...blank(0), created: `${p.when}:00Z`, ...p })

const SAMPLE: Entry[] = [
  S({ id: 's1', seq: 1, when: '2026-10-02T09:15', act: 'Acknowledgment', docType: 'Grant deed', docDate: '2026-10-01', signer: 'Marisol Vega', address: '418 Alder Ct, Fresno CA', idType: 'Driver licence', idNumber: 'C4471029', idIssuer: 'California DMV', idExpiry: '2029-03-14', fee: 15, location: 'Office — 22 Main St', thumbprint: true, notes: 'Real-property deed; thumbprint taken.' }),
  S({ id: 's2', seq: 2, when: '2026-10-02T09:20', act: 'Jurat', docType: 'Affidavit of identity', docDate: '2026-10-02', signer: 'Marisol Vega', address: '418 Alder Ct, Fresno CA', idType: 'Driver licence', idNumber: 'C4471029', idIssuer: 'California DMV', idExpiry: '2029-03-14', fee: 15, location: 'Office — 22 Main St' }),
  S({ id: 's3', seq: 3, when: '2026-10-07T18:40', act: 'Acknowledgment', docType: 'Power of attorney', docDate: '2026-10-07', signer: 'Harold Kim', address: 'Sunrise Care Home, Rm 12', idType: 'Passport', idNumber: '567120983', idIssuer: 'U.S. Department of State', idExpiry: '2031-06-30', fee: 15, travelFee: 40, location: 'Sunrise Care Home (mobile)', notes: 'Signer alert and responsive; staff nurse present.' }),
  S({ id: 's4', seq: 4, when: '2026-10-11T13:05', act: 'Oath / affirmation', docType: 'Deposition transcript', docDate: '2026-10-11', signer: 'Priya Shah', address: '90 Bay Rd, Oakland CA', idType: 'Personally known', fee: 15, location: 'Remote (audio-video)', remote: true }),
  S({ id: 's5', seq: 5, when: '2026-10-15T16:30', act: 'Copy certification', docType: 'Power of attorney (copy)', docDate: '2026-10-07', signer: 'Tom Nguyen', address: '5 Elm St, Fresno CA', idType: 'Credible witness(es)', witnesses: 'Rita Lopez (CA DL ••3381), known to notary', fee: 15, location: 'Office — 22 Main St' }),
]

const DEF = { notary: 'Jordan Avery', commission: 'No. 2419876', commExpiry: '2028-05-31', feeCap: 15, maskIds: true, entries: SAMPLE, enc: null as EncBlob | null }

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    if (value) {
      const img = new Image()
      img.onload = () => g.drawImage(img, 0, 0)
      img.src = value
    }
  }, [value])
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height]
  }
  return (
    <div>
      <canvas
        ref={ref}
        width={480}
        height={120}
        style={{ width: '100%', height: 90, background: '#fff', border: '1px dashed var(--line)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const g = e.currentTarget.getContext('2d')!
          const [x, y] = pos(e)
          g.beginPath()
          g.moveTo(x, y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const g = e.currentTarget.getContext('2d')!
          g.lineWidth = 2.4
          g.lineCap = 'round'
          g.strokeStyle = '#0f172a'
          const [x, y] = pos(e)
          g.lineTo(x, y)
          g.stroke()
        }}
        onPointerUp={(e) => {
          drawing.current = false
          onChange(e.currentTarget.toDataURL('image/png'))
        }}
      />
      <Row>
        <span className="muted" style={{ fontSize: 12, flex: 1 }}>Signer signs with finger, stylus or mouse.</span>
        <Btn kind="ghost" onClick={() => onChange('')}>Clear</Btn>
      </Row>
    </div>
  )
}

export default function NotaryJournal() {
  const [s, set, reset] = useToolState('notary-journal', DEF)
  const [mem, setMem] = useState<{ entries: Entry[]; k: Key } | null>(null)
  const [form, setForm] = useState<Entry | null>(null)
  const [orig, setOrig] = useState<Entry | null>(null)
  const [q, setQ] = useState('')
  const [act, setAct] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const saveSeq = useRef(0)

  const locked = !!s.enc && !mem
  const entries = s.enc ? mem?.entries ?? [] : s.entries
  const setEntries = (next: Entry[]) => {
    if (s.enc && mem) {
      setMem({ ...mem, entries: next })
      const n = ++saveSeq.current
      void sealEntries(mem.k, next).then((enc) => n === saveSeq.current && set({ enc, entries: [] }))
    } else set({ entries: next })
  }
  const issues = form ? validate(form, s.feeCap) : []
  const errors = issues.filter((i) => i.level === 'error')
  const save = () => {
    if (!form || errors.length) return
    const stamp = new Date().toISOString()
    if (orig) {
      const change = diff(orig, form)
      setEntries(entries.map((e) => (e.id === form.id ? { ...form, history: change ? [...form.history, { at: stamp, change }] : form.history } : e)))
      setMsg({ tone: 'ok', text: change ? `Entry #${form.seq} amended — the change is logged.` : 'No changes.' })
    } else {
      setEntries([...entries, { ...form, created: stamp }])
      setMsg({ tone: 'ok', text: `Entry #${form.seq} recorded.` })
    }
    setForm(null)
    setOrig(null)
  }
  const list = search(entries, q, act, from, to)
  const today = now().slice(0, 10)
  const st = stats(entries, today.slice(0, 4), today.slice(0, 7))
  const F = <K extends keyof Entry>(k: K, v: Entry[K]) => form && setForm({ ...form, [k]: v })

  const protect = async () => {
    setBusy(true)
    try {
      const k = await newKey(pass)
      const enc = await sealEntries(k, s.entries)
      setMem({ entries: s.entries, k })
      set({ enc, entries: [] })
      setMsg({ tone: 'ok', text: 'Journal is now encrypted in this browser. Keep the passphrase safe — it cannot be recovered.' })
      setPass('')
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
    setBusy(false)
  }
  const unlock = async () => {
    if (!s.enc) return
    setBusy(true)
    try {
      const r = await openEntries(s.enc, pass)
      setMem({ entries: r.entries, k: r.k })
      setPass('')
      setMsg(null)
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
    setBusy(false)
  }
  const exportEnc = async () => {
    setBusy(true)
    try {
      const k = await newKey(pass)
      const blob = await sealEntries(k, entries)
      download(`notary-journal-${today}.ntj.json`, JSON.stringify(blob), 'application/json')
      setMsg({ tone: 'ok', text: `Encrypted backup of ${entries.length} entries saved (AES-256-GCM, PBKDF2 ${blob.kdf.iterations.toLocaleString()} iterations).` })
      setPass('')
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
    setBusy(false)
  }
  const importEnc = async (f: File) => {
    setBusy(true)
    try {
      const r = await openEntries(parseBlob(await f.text()), pass)
      const m = merge(entries, r.entries)
      setEntries(m.entries)
      setMsg({ tone: 'ok', text: `Imported ${r.entries.length} entries (${m.added} new).` })
      setPass('')
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    }
    setBusy(false)
  }
  const printJournal = () => {
    const rows = csvRows(entries, s.maskIds)
    const esc = (x: unknown) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const html = `<!doctype html><meta charset="utf-8"><title>Notary journal</title><style>@page{size:landscape;margin:10mm}body{font:10px system-ui,sans-serif}h1{font-size:15px;margin:0 0 4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px;vertical-align:top}th{background:#eee}</style><h1>Notary journal — ${esc(s.notary)} · ${esc(s.commission)} · commission expires ${esc(s.commExpiry)}</h1><p>Printed ${new Date().toLocaleString()} · ${entries.length} entries</p><table><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
    const fr = document.createElement('iframe')
    fr.style.cssText = 'position:fixed;width:0;height:0;border:0'
    document.body.appendChild(fr)
    fr.contentDocument!.write(html)
    fr.contentDocument!.close()
    setTimeout(() => {
      fr.contentWindow?.print()
      setTimeout(() => fr.remove(), 2000)
    }, 300)
  }

  const passBox = (label: string) => (
    <Txt label={label} type="password" value={pass} onChange={setPass} hint={pass ? `Strength: ${strength(pass).label}` : 'At least 8 characters; a few random words work well.'} />
  )

  if (locked)
    return (
      <Panel title="🔒 Journal locked">
        <p>This journal is encrypted in your browser ({s.enc!.count} entries, saved {s.enc!.saved.slice(0, 16).replace('T', ' ')}). Enter the passphrase to open it.</p>
        <div style={{ maxWidth: 420 }}>
          {passBox('Passphrase')}
          <Row>
            <Btn kind="primary" disabled={busy || !pass} onClick={() => void unlock()}>{busy ? 'Unlocking…' : 'Unlock'}</Btn>
          </Row>
        </div>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      </Panel>
    )

  return (
    <Split wide="right">
      <div>
        {form ? (
          <Panel title={orig ? `Amend entry #${form.seq}` : `New entry #${form.seq}`}>
            <Row>
              <Txt label="Date & time" type="datetime-local" value={form.when} onChange={(v) => F('when', v)} />
              <Select label="Notarial act" value={form.act} onChange={(v) => F('act', v)} options={[...ACTS]} />
            </Row>
            <Row>
              <Txt label="Document type / title" value={form.docType} onChange={(v) => F('docType', v)} placeholder="e.g. Grant deed" />
              <Txt label="Document date" type="date" value={form.docDate} onChange={(v) => F('docDate', v)} />
            </Row>
            <Txt label="Signer name" value={form.signer} onChange={(v) => F('signer', v)} />
            <Txt label="Signer address" value={form.address} onChange={(v) => F('address', v)} />
            <Select label="Identified by" value={form.idType} onChange={(v) => F('idType', v)} options={[...ID_TYPES]} />
            {form.idType !== 'Personally known' && form.idType !== 'Credible witness(es)' && (
              <Row>
                <Txt label="ID number" value={form.idNumber} onChange={(v) => F('idNumber', v)} />
                <Txt label="Issued by" value={form.idIssuer} onChange={(v) => F('idIssuer', v)} />
                <Txt label="Expires" type="date" value={form.idExpiry} onChange={(v) => F('idExpiry', v)} />
              </Row>
            )}
            {form.idType === 'Credible witness(es)' && <Txt label="Credible witness name(s) & their ID" value={form.witnesses} onChange={(v) => F('witnesses', v)} />}
            <Row>
              <Num label="Fee" value={form.fee} onChange={(v) => F('fee', v)} unit="$" min={0} />
              <Num label="Travel fee" value={form.travelFee} onChange={(v) => F('travelFee', v)} unit="$" min={0} />
            </Row>
            <Txt label="Location" value={form.location} onChange={(v) => F('location', v)} />
            <Row>
              <Check label="Remote online notarization" value={form.remote} onChange={(v) => F('remote', v)} />
              <Check label="Thumbprint taken" value={form.thumbprint} onChange={(v) => F('thumbprint', v)} />
            </Row>
            <div className="k-label">Signer’s signature</div>
            <SignaturePad value={form.signature} onChange={(v) => F('signature', v)} />
            <Txt label="Notes" value={form.notes} onChange={(v) => F('notes', v)} />
            {issues.map((i, k) => <Note key={k} tone={i.level === 'error' ? 'err' : 'warn'}>{i.msg}</Note>)}
            <Row>
              <Btn kind="primary" disabled={!!errors.length} onClick={save}>{orig ? 'Save amendment' : 'Record entry'}</Btn>
              <Btn kind="ghost" onClick={() => { setForm(null); setOrig(null) }}>Cancel</Btn>
            </Row>
            {orig && <p className="muted" style={{ fontSize: 12 }}>Journal entries are not silently rewritten: every amendment is stored with a timestamp and the old → new values.</p>}
          </Panel>
        ) : (
          <Panel title="Record a notarization">
            <Btn kind="primary" onClick={() => setForm(blank(nextSeq(entries)))}>+ New journal entry</Btn>
            <Btn onClick={() => {
              const last = [...entries].sort((a, b) => b.seq - a.seq)[0]
              if (last) setForm({ ...blank(nextSeq(entries)), signer: last.signer, address: last.address, idType: last.idType, idNumber: last.idNumber, idIssuer: last.idIssuer, idExpiry: last.idExpiry, location: last.location })
            }} disabled={!entries.length}>+ Same signer, next document</Btn>
            {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          </Panel>
        )}
        <Panel title="Notary & settings" actions={<Btn kind="ghost" onClick={() => { if (confirm('Erase the journal in this browser and restore the sample?')) { reset(); setMem(null) } }}>Reset</Btn>}>
          <Row>
            <Txt label="Notary name" value={s.notary} onChange={(notary) => set({ notary })} />
            <Txt label="Commission" value={s.commission} onChange={(commission) => set({ commission })} />
          </Row>
          <Row>
            <Txt label="Commission expires" type="date" value={s.commExpiry} onChange={(commExpiry) => set({ commExpiry })} />
            <Num label="Max fee per act" value={s.feeCap} onChange={(feeCap) => set({ feeCap })} unit="$" min={0} />
          </Row>
          <Check label="Mask ID numbers in lists and exports" value={s.maskIds} onChange={(maskIds) => set({ maskIds })} />
          {s.commExpiry && s.commExpiry < today && <Note tone="err">Your commission has expired — you may not notarize.</Note>}
        </Panel>
        <Panel title="Security & backup">
          {s.enc ? <Note tone="ok">🔒 Encrypted at rest (AES-256-GCM). Only ciphertext is stored in this browser.</Note> : <Note tone="warn">The journal is stored unencrypted in this browser. Protect it with a passphrase — journals hold personal ID data.</Note>}
          {passBox(s.enc ? 'Passphrase for backups' : 'Passphrase')}
          <Row>
            {!s.enc && <Btn kind="primary" disabled={busy || pass.length < 8} onClick={() => void protect()}>Encrypt journal</Btn>}
            {s.enc && <Btn onClick={() => setMem(null)}>Lock now</Btn>}
            {s.enc && <Btn kind="ghost" onClick={() => { if (confirm('Store the journal unencrypted again?')) { set({ enc: null, entries }); setMem(null) } }}>Remove encryption</Btn>}
          </Row>
          <Row>
            <Btn disabled={busy || pass.length < 8} onClick={() => void exportEnc()}>⬇ Encrypted backup</Btn>
            <label className={`k-btn ${pass.length < 8 ? 'ghost' : ''}`}>
              ⬆ Import backup
              <input type="file" accept=".json" hidden disabled={pass.length < 8} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importEnc(f) }} />
            </label>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Backups are encrypted with the passphrase typed above (PBKDF2-SHA-256, 600 000 iterations → AES-256-GCM). Import merges entries by ID.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Entries" value={entries.length} sub={`next #${nextSeq(entries)}`} />
          <Stat label="This month" value={st.month} />
          <Stat label={`Fees ${today.slice(0, 4)}`} value={money(st.fees, '$', 0)} tone="accent" />
          <Stat label="Remote acts" value={st.remote} />
        </Stats>
        <Panel
          title="Journal"
          actions={
            <>
              <Btn onClick={() => download(`notary-journal-${today}.csv`, toCsv(csvRows(entries, s.maskIds)), 'text/csv')}>⬇ CSV</Btn>
              <Btn onClick={printJournal}>🖨 Print</Btn>
            </>
          }
        >
          <Row>
            <input className="k-text" style={{ flex: 2, minWidth: 160 }} placeholder="Search signer, document, #no., last 4 of ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <select className="k-select" value={act} onChange={(e) => setAct(e.target.value)} aria-label="Act" style={{ flex: 1 }}>
              <option value="">All acts</option>
              {ACTS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Row>
          <Row>
            <Txt label="From" type="date" value={from} onChange={setFrom} />
            <Txt label="To" type="date" value={to} onChange={setTo} />
          </Row>
          <Table
            head={['#', 'Date', 'Act · document', 'Signer', 'ID', 'Fee', '']}
            rows={list.map((e) => [
              e.seq,
              e.when.slice(5).replace('T', ' '),
              <span key="a"><b>{e.act}</b><br /><span className="muted" style={{ fontSize: 12 }}>{e.docType}</span></span>,
              <span key="s">{e.signer}{e.remote ? ' 🖥' : ''}{e.signature ? ' ✍' : ''}</span>,
              e.idType === 'Personally known' || e.idType === 'Credible witness(es)' ? e.idType : `${e.idType.split(' ')[0]} ${s.maskIds ? maskId(e.idNumber) : e.idNumber}`,
              money(e.fee + e.travelFee, '$', 0),
              <Row key="b" wrap={false}>
                <Btn kind="ghost" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? '▾' : '▸'}</Btn>
                <Btn kind="ghost" onClick={() => { setForm({ ...e }); setOrig(e) }}>Amend</Btn>
              </Row>,
            ])}
            max={100}
          />
          {!list.length && <p className="muted">No entries match.</p>}
          {open && (() => {
            const e = entries.find((x) => x.id === open)
            if (!e) return null
            return (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginTop: 8 }}>
                <b>#{e.seq} · {e.act} · {e.docType}</b>
                <p style={{ margin: '4px 0', fontSize: 14 }}>{e.signer}, {e.address}<br />ID: {e.idType} {e.idNumber && (s.maskIds ? maskId(e.idNumber) : e.idNumber)} {e.idIssuer && `· ${e.idIssuer}`} {e.idExpiry && `· exp. ${e.idExpiry}`}{e.witnesses && <><br />Witnesses: {e.witnesses}</>}<br />Location: {e.location}{e.thumbprint ? ' · thumbprint on file' : ''}{e.notes && <><br />Notes: {e.notes}</>}</p>
                {e.signature && <img src={e.signature} alt="Signature" style={{ maxWidth: 260, background: '#fff', borderRadius: 6, border: '1px solid var(--line)' }} />}
                <p className="muted" style={{ fontSize: 12 }}>Recorded {e.created.slice(0, 16).replace('T', ' ')}</p>
                {e.history.map((h, i) => <div key={i} style={{ fontSize: 12 }}>✎ {h.at.slice(0, 16).replace('T', ' ')} — {h.change}</div>)}
              </div>
            )
          })()}
        </Panel>
        <Panel title={`Acts in ${today.slice(0, 4)}`}>
          {st.byAct.length ? <BarChart height={200} bars={st.byAct.map(([label, value]) => ({ label, value }))} fy={(v) => (Number.isInteger(v) ? String(v) : '')} /> : <p className="muted">No acts recorded this year.</p>}
        </Panel>
        <Note>Check your state’s rules: some require a bound paper journal, specific fields or retention periods. This tool keeps data only in this browser — back it up regularly.</Note>
      </div>
    </Split>
  )
}
