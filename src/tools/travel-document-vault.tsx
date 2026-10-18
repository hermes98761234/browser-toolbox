import { useCallback, useEffect, useRef, useState } from 'react'
import { Area, Bar, Btn, Check, download, FileDrop, Note, num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { createVault, DOC_TYPES, EMPTY_PROFILE, expiry, ITERATIONS, mask, openFile, parseVault, pruneFiles, rekey, sealDoc, sealFile, sealProfile, STATUS_COLOR, strength, unlock, type Doc, type DocType, type DocVault, type FileMeta, type Profile } from './lib/travel-document-vault'

// ---------- storage: IndexedDB (localStorage fallback); ciphertext only ----------
const DBN = 'tb-travel-document-vault', STORE = 'kv', KEY = 'vault', LS = 'tb-vault:travel-documents'
const idb = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DBN, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
async function loadVault(): Promise<DocVault | null> {
  try {
    const db = await idb()
    return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res((q.result as DocVault | undefined) ?? null); q.onerror = () => rej(q.error) })
  } catch {
    try { const t = localStorage.getItem(LS); return t ? parseVault(t) : null } catch { return null }
  }
}
async function saveVault(v: DocVault | null) {
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); if (v) tx.objectStore(STORE).put(v, KEY); else tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
  } catch {
    if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS)
  }
}

const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const DEMO_PASS = 'demo travel vault'
const MAX_FILE = 10 * 1024 * 1024

/** Images are re-encoded (max 1600 px, JPEG) before encryption; this also drops EXIF/GPS metadata. */
async function prepareFile(f: File): Promise<{ meta: Omit<FileMeta, 'id'>; bytes: Uint8Array }> {
  if (f.type.startsWith('image/')) {
    const bmp = await createImageBitmap(f)
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc)
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    g.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85))
    return { meta: { name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', size: blob.size, w: c.width, h: c.height }, bytes: new Uint8Array(await blob.arrayBuffer()) }
  }
  if (f.size > MAX_FILE) throw new Error(`${f.name} is larger than 10 MB`)
  return { meta: { name: f.name, mime: f.type || 'application/octet-stream', size: f.size }, bytes: new Uint8Array(await f.arrayBuffer()) }
}

async function specimen(): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = 900; c.height = 600
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 900, 600); gr.addColorStop(0, '#dbeafe'); gr.addColorStop(1, '#ede9fe')
  g.fillStyle = gr; g.fillRect(0, 0, 900, 600)
  g.strokeStyle = '#94a3b8'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(450, 300, 30 + i * 12, 0, 7); g.stroke() }
  g.fillStyle = '#cbd5e1'; g.fillRect(50, 120, 220, 280)
  g.fillStyle = '#64748b'; g.beginPath(); g.arc(160, 220, 55, 0, 7); g.fill(); g.fillRect(85, 290, 150, 110)
  g.fillStyle = '#1e293b'; g.font = 'bold 34px sans-serif'; g.fillText('TRAVEL DOCUMENT · SAMPLE', 50, 75)
  g.font = '22px monospace'
  ;[['Surname', 'TRAVELLER'], ['Given names', 'ALEX SAMPLE'], ['Document no.', 'SPEC12345'], ['Date of expiry', '2027-03-01'], ['Issuing state', 'EXAMPLE']].forEach(([k, v], i) => { g.fillStyle = '#475569'; g.fillText(k, 310, 150 + i * 56); g.fillStyle = '#0f172a'; g.fillText(v, 310, 176 + i * 56) })
  g.fillStyle = '#0f172a'; g.font = '24px monospace'; g.fillText('P<EXMTRAVELLER<<ALEX<SAMPLE<<<<<<<<<<<<<<<', 50, 500); g.fillText('SPEC12345<0EXM9001017M2703013<<<<<<<<<<<<04', 50, 540)
  g.save(); g.translate(450, 300); g.rotate(-0.35); g.fillStyle = 'rgba(220,38,38,.35)'; g.font = 'bold 110px sans-serif'; g.textAlign = 'center'; g.fillText('SPECIMEN', 0, 30); g.restore()
  const b = await new Promise<Blob>((res) => c.toBlob((x) => res(x!), 'image/jpeg', 0.85))
  return new Uint8Array(await b.arrayBuffer())
}

const blankDoc = (): Doc => ({ id: uid(), type: 'passport', title: '', holder: '', number: '', country: '', issued: '', expires: '', notes: '', files: [], updated: new Date().toISOString() })

interface Cfg { autoLock: number; showNumbers: boolean }

export default function TravelDocumentVault() {
  const [cfg, setCfg] = useToolState<Cfg>('travel-document-vault', { autoLock: 5, showNumbers: false })
  const [vault, setVault] = useState<DocVault | null | undefined>(undefined)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [sel, setSel] = useState<string>('')
  const [draft, setDraft] = useState<Doc | null>(null)
  const [tab, setTab] = useState<'docs' | 'card' | 'security'>('docs')
  const [pass, setPass] = useState(''), [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [info, setInfo] = useState('')
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const lastAct = useRef(0)
  const today = todayLocal()

  useEffect(() => { void loadVault().then(setVault) }, [])

  const lock = useCallback(() => {
    setKey(null); setDocs([]); setProfile(EMPTY_PROFILE); setDraft(null); setSel(''); setPass(''); setPass2('')
    setThumbs((t) => { Object.values(t).forEach(URL.revokeObjectURL); return {} })
  }, [])

  // auto-lock after inactivity
  useEffect(() => {
    if (!key || !cfg.autoLock) return
    lastAct.current = Date.now()
    const bump = () => { lastAct.current = Date.now() }
    const ev = ['pointerdown', 'keydown', 'scroll']
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const iv = setInterval(() => { if (Date.now() - lastAct.current > cfg.autoLock * 60000) lock() }, 5000)
    return () => { clearInterval(iv); ev.forEach((e) => window.removeEventListener(e, bump)) }
  }, [key, cfg.autoLock, lock])

  // decrypt thumbnails of the selected document on demand
  const selDoc = docs.find((d) => d.id === sel)
  useEffect(() => {
    if (!key || !vault || !selDoc) return
    let off = false
    void (async () => {
      const add: Record<string, string> = {}
      for (const f of selDoc.files) {
        if (!f.mime.startsWith('image/') || thumbs[f.id] || !vault.files[f.id]) continue
        try { add[f.id] = URL.createObjectURL(new Blob([(await openFile(key, vault, f.id)) as Uint8Array<ArrayBuffer>], { type: f.mime })) } catch { /* damaged */ }
      }
      if (!off && Object.keys(add).length) setThumbs((t) => ({ ...t, ...add }))
    })()
    return () => { off = true }
  }, [key, vault, selDoc, thumbs])

  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label); setErr(''); setInfo('')
    try { await f() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy('') }
  }
  const persist = async (v: DocVault) => { v.updated = new Date().toISOString(); await saveVault(v); setVault({ ...v }) }

  const open = (v: DocVault, p: string) => run('Unlocking…', async () => {
    const u = await unlock(v, p)
    setKey(u.key); setDocs(u.docs); setProfile({ ...EMPTY_PROFILE, ...u.profile }); setSel(u.docs[0]?.id ?? ''); setPass('')
    if (u.failed.length) setErr(`${u.failed.length} record(s) failed authentication and were skipped.`)
  })

  const createDemo = () => run('Creating demo vault…', async () => {
    const { vault: v, key: k } = await createVault(DEMO_PASS)
    const y = Number(today.slice(0, 4))
    const fileId = uid()
    const img = await specimen()
    const ds: Doc[] = [
      { ...blankDoc(), id: 'pp', type: 'passport', title: 'Passport', holder: 'Alex Traveller', number: 'SPEC12345', country: 'Example', issued: `${y - 9}-03-02`, expires: `${y + 1}-03-01`, notes: 'Keep the paper copy in the hotel safe.', files: [{ id: fileId, name: 'passport-data-page.jpg', mime: 'image/jpeg', size: img.length, w: 900, h: 600 }] },
      { ...blankDoc(), id: 'id', type: 'id', title: 'National ID card', holder: 'Alex Traveller', number: 'ID-883421', country: 'Example', issued: `${y - 3}-06-11`, expires: `${y + 7}-06-10` },
      { ...blankDoc(), id: 'ins', type: 'insurance', title: 'Annual travel insurance', holder: 'Alex Traveller', number: 'POL-55-2091', country: '', issued: `${y - 1}-11-05`, expires: `${y}-11-04`, notes: '24/7 assistance line on the card. Covers skiing.' },
      { ...blankDoc(), id: 'dl', type: 'licence', title: 'Driving licence', holder: 'Alex Traveller', number: 'DL 4410 2231', country: 'Example', issued: `${y - 8}-01-20`, expires: `${y + 2}-01-19` },
      { ...blankDoc(), id: 'tk', type: 'ticket', title: 'Flight out', holder: 'Alex Traveller', number: 'PNR K7Q2ZD', country: '', issued: '', expires: `${y + 1}-02-14`, notes: 'Seat 14A, bag 23 kg' },
    ]
    for (const d of ds) v.docs[d.id] = await sealDoc(k, d)
    v.files[fileId] = await sealFile(k, fileId, img)
    const pr: Profile = { ...EMPTY_PROFILE, name: 'Alex Traveller', birth: '1990-01-01', nationality: 'Example', blood: 'A+', allergies: 'Penicillin', medical: 'Mild asthma: inhaler in hand luggage', contacts: 'Sam Traveller (partner) +00 555 0100\nDr. Rivera (GP) +00 555 0199', insurerPhone: '+00 555 0177 (24/7)', embassy: 'Embassy of Example, Main St 1', tripStart: `${y + 1}-02-14`, tripEnd: `${y + 1}-03-02` }
    v.profile = await sealProfile(k, pr)
    await persist(v)
    setKey(k); setDocs(ds); setProfile(pr); setSel('pp')
    setInfo(`Demo vault created. Its passphrase is “${DEMO_PASS}”. Delete it before storing real documents.`)
  })

  if (vault === undefined) return <Panel title="Travel Document Vault"><p className="muted">Opening storage…</p></Panel>

  if (!key) {
    const st = strength(pass)
    return (
      <Split>
        <Panel title={vault ? '🔒 Vault locked' : 'Create your document vault'}>
          {vault ? (
            <>
              <p className="muted">{Object.keys(vault.docs).length} encrypted documents · {Object.keys(vault.files).length} files · updated {new Date(vault.updated).toLocaleString()}</p>
              <Txt label="Passphrase" type="password" value={pass} onChange={setPass} />
              <Row><Btn kind="primary" disabled={!pass || !!busy} onClick={() => void open(vault, pass)}>{busy || 'Unlock'}</Btn></Row>
            </>
          ) : (
            <>
              <Txt label="New passphrase" type="password" value={pass} onChange={setPass} hint="Four or more random words work well. It cannot be recovered." />
              {pass && <div style={{ fontSize: 13, margin: '4px 0 8px' }}><Bar value={Math.min(100, st.bits)} max={100} color={st.bits < 40 ? '#ef4444' : st.bits < 60 ? '#f59e0b' : '#10b981'} /> ≈ {num(st.bits, 0)} bits · {st.label}</div>}
              <Txt label="Repeat passphrase" type="password" value={pass2} onChange={setPass2} />
              <Row>
                <Btn kind="primary" disabled={pass.length < 8 || pass !== pass2 || !!busy} onClick={() => void run('Creating…', async () => { const r = await createVault(pass); r.vault.profile = await sealProfile(r.key, EMPTY_PROFILE); await persist(r.vault); setKey(r.key); setPass(''); setPass2('') })}>{busy || 'Create vault'}</Btn>
                <Btn disabled={!!busy} onClick={() => void createDemo()}>Try a demo vault</Btn>
              </Row>
              {pass2 && pass !== pass2 && <Note tone="warn">Passphrases differ.</Note>}
            </>
          )}
          <Row>
            <label className="k-btn">⬆ Restore encrypted backup<input type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; await run('Restoring…', async () => { const v = parseVault(await f.text()); if (vault && !confirm('Replace the vault stored in this browser with the backup?')) return; await saveVault(v); setVault(v); setInfo('Backup restored. Unlock it with the passphrase it was made with.') }) }} /></label>
            {vault && <Btn kind="danger" onClick={() => { if (confirm('Permanently delete the vault from this browser? Make sure you have a backup.')) void saveVault(null).then(() => setVault(null)) }}>Delete vault</Btn>}
          </Row>
          {err && <Note tone="err">{err}</Note>}
          {info && <Note tone="ok">{info}</Note>}
        </Panel>
        <Panel title="How it protects your documents">
          <ul style={{ lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Your passphrase becomes an AES-256 key with PBKDF2-SHA-256 ({ITERATIONS.toLocaleString()} iterations).</li>
            <li>Each record and each scan is sealed separately with AES-GCM and a fresh random IV; tampering is detected.</li>
            <li>Only ciphertext is written to this browser (IndexedDB) or to backup files. Nothing is uploaded.</li>
            <li>Photos are downscaled and re-encoded before encryption, which also strips location metadata.</li>
            <li>The vault locks itself after a few idle minutes. A forgotten passphrase cannot be recovered.</li>
          </ul>
          <Note tone="warn">Keep an encrypted backup somewhere safe (another device or a USB stick). Clearing browser data deletes the vault.</Note>
        </Panel>
      </Split>
    )
  }

  // ---------- unlocked ----------
  const v = vault!
  const ex = (d: Doc) => expiry(d, today, profile.tripEnd)
  const sorted = [...docs].sort((a, b) => ['expired', 'renew', 'soon', 'ok', 'none'].indexOf(ex(a).status) - ['expired', 'renew', 'soon', 'ok', 'none'].indexOf(ex(b).status) || a.title.localeCompare(b.title))
  const counts = { attention: docs.filter((d) => ['expired', 'renew'].includes(ex(d).status)).length, soon: docs.filter((d) => ex(d).status === 'soon').length }
  const cur = draft ?? selDoc ?? null

  const saveDoc = (d: Doc) => run('Encrypting…', async () => {
    const nd = { ...d, title: d.title.trim() || DOC_TYPES[d.type].name, updated: new Date().toISOString() }
    const nv = { ...v, docs: { ...v.docs, [nd.id]: await sealDoc(key, nd) } }
    const list = [...docs.filter((x) => x.id !== nd.id), nd]
    await persist(pruneFiles(nv, list))
    setDocs(list); setSel(nd.id); setDraft(null)
  })
  const delDoc = (d: Doc) => run('Deleting…', async () => {
    const list = docs.filter((x) => x.id !== d.id)
    const docsS = { ...v.docs }; delete docsS[d.id]
    await persist(pruneFiles({ ...v, docs: docsS }, list))
    setDocs(list); setSel(list[0]?.id ?? ''); setDraft(null)
  })
  const addFiles = (fs: File[]) => run('Encrypting files…', async () => {
    const base = draft ?? selDoc
    if (!base) return
    const files = [...base.files], nf = { ...v.files }
    for (const f of fs) {
      const p = await prepareFile(f)
      const id = uid()
      nf[id] = await sealFile(key, id, p.bytes)
      files.push({ id, ...p.meta })
    }
    const nd = { ...base, files, updated: new Date().toISOString() }
    const list = [...docs.filter((x) => x.id !== nd.id), nd]
    await persist({ ...v, files: nf, docs: { ...v.docs, [nd.id]: await sealDoc(key, nd) } })
    setDocs(list); setSel(nd.id); setDraft(draft ? nd : null)
  })
  const fileOut = (f: FileMeta) => run('Decrypting…', async () => { download(f.name, new Blob([(await openFile(key, v, f.id)) as Uint8Array<ArrayBuffer>], { type: f.mime }), f.mime) })
  const saveProfile = (p: Profile) => { setProfile(p); void run('', async () => persist({ ...v, profile: await sealProfile(key, p) })) }
  const upd = (p: Partial<Doc>) => cur && setDraft({ ...cur, ...p })
  const badge = (d: Doc) => { const e = ex(d); return <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: STATUS_COLOR[e.status], borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{e.status === 'none' ? 'no expiry' : e.status === 'ok' ? 'valid' : e.status === 'renew' ? 'renew now' : e.status}</span> }

  return (
    <div>
      <Row>
        <Seg value={tab} onChange={setTab} options={[['docs', '📁 Documents'], ['card', '🆘 Emergency card'], ['security', '🔐 Backup & security']]} />
        <span style={{ flex: 1 }} />
        <Btn onClick={lock}>🔒 Lock</Btn>
      </Row>
      {err && <Note tone="err">{err}</Note>}
      {info && <Note tone="ok">{info}</Note>}
      {busy && <Note>{busy}</Note>}

      {tab === 'docs' && (
        <Split>
          <div>
            <Stats>
              <Stat label="Documents" value={docs.length} />
              <Stat label="Need action" value={counts.attention} tone={counts.attention ? 'bad' : 'good'} />
              <Stat label="Coming up" value={counts.soon} tone={counts.soon ? 'accent' : undefined} />
            </Stats>
            <Panel title="Next trip">
              <Row>
                <Txt label="Departure" type="date" value={profile.tripStart} onChange={(tripStart) => saveProfile({ ...profile, tripStart })} />
                <Txt label="Return" type="date" value={profile.tripEnd} onChange={(tripEnd) => saveProfile({ ...profile, tripEnd })} />
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>With a return date, passports are checked against the common rule of 6 months’ validity beyond your stay, and other documents must last until you are back. Always confirm the rules for your destination.</p>
            </Panel>
            <Panel title="Documents" actions={<Btn kind="primary" onClick={() => { const d = blankDoc(); setDraft(d); setSel('') }}>+ Add</Btn>}>
              {!docs.length && <Note>No documents yet. Add your passport first.</Note>}
              {sorted.map((d) => (
                <button key={d.id} type="button" onClick={() => { setSel(d.id); setDraft(null) }} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', textAlign: 'left', padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer', color: 'inherit', background: 'var(--panel2)', border: `2px solid ${sel === d.id ? 'var(--accent)' : 'transparent'}` }}>
                  <span style={{ fontSize: 24 }}>{DOC_TYPES[d.type].icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{d.title}</b> {d.files.length > 0 && <span className="muted" style={{ fontSize: 12 }}>📎{d.files.length}</span>}
                    <div className="muted" style={{ fontSize: 13 }}>{ex(d).message}</div>
                  </span>
                  {badge(d)}
                </button>
              ))}
            </Panel>
          </div>
          <div>
            {cur ? (
              <Panel title={draft ? (docs.some((d) => d.id === draft.id) ? 'Edit document' : 'New document') : `${DOC_TYPES[cur.type].icon} ${cur.title}`} actions={draft ? <><Btn kind="primary" disabled={!!busy} onClick={() => void saveDoc(draft)}>Save encrypted</Btn><Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn></> : <><Btn onClick={() => setDraft({ ...cur })}>✎ Edit</Btn><Btn kind="danger" onClick={() => confirm(`Delete “${cur.title}” and its files?`) && void delDoc(cur)}>Delete</Btn></>}>
                {draft ? (
                  <>
                    <Row>
                      <Select label="Type" value={draft.type} onChange={(type: DocType) => upd({ type })} options={Object.entries(DOC_TYPES).map(([k, t]) => [k as DocType, `${t.icon} ${t.name}`] as const)} />
                      <Txt label="Title" value={draft.title} onChange={(title) => upd({ title })} placeholder={DOC_TYPES[draft.type].name} />
                    </Row>
                    <Row>
                      <Txt label="Holder" value={draft.holder} onChange={(holder) => upd({ holder })} />
                      <Txt label="Number / reference" value={draft.number} onChange={(number) => upd({ number })} />
                    </Row>
                    <Row>
                      <Txt label="Issued by (country / company)" value={draft.country} onChange={(country) => upd({ country })} />
                      <Txt label="Issue date" type="date" value={draft.issued} onChange={(issued) => upd({ issued })} />
                      <Txt label={draft.type === 'ticket' || draft.type === 'booking' ? 'Travel date' : 'Expiry date'} type="date" value={draft.expires} onChange={(expires) => upd({ expires })} />
                    </Row>
                    <Area label="Notes" value={draft.notes} onChange={(notes) => upd({ notes })} rows={3} />
                    {DOC_TYPES[draft.type].hint && <p className="muted" style={{ fontSize: 13 }}>💡 {DOC_TYPES[draft.type].hint}</p>}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
                      {([['Type', DOC_TYPES[cur.type].name], ['Holder', cur.holder], ['Number', cfg.showNumbers ? cur.number : mask(cur.number)], ['Issued by', cur.country], ['Issued', cur.issued], [cur.type === 'ticket' || cur.type === 'booking' ? 'Travel date' : 'Expires', cur.expires]] as const).map(([k, val]) => (
                        <div key={k}><div className="muted" style={{ fontSize: 12 }}>{k}</div><b>{val || '—'}</b></div>
                      ))}
                    </div>
                    <Note tone={ex(cur).status === 'ok' || ex(cur).status === 'none' ? 'ok' : ex(cur).status === 'soon' ? 'warn' : 'err'}>{ex(cur).message}{ex(cur).renewBy && DOC_TYPES[cur.type].beyond ? ` · renew-by date ${ex(cur).renewBy}` : ''}</Note>
                    {cur.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{cur.notes}</p>}
                    <Check label="Show full numbers" value={cfg.showNumbers} onChange={(showNumbers) => setCfg({ showNumbers })} />
                  </>
                )}
                <h4 style={{ margin: '14px 0 6px' }}>Scans & copies</h4>
                {docs.some((d) => d.id === cur.id) || draft ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
                      {cur.files.map((f) => (
                        <div key={f.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 6, fontSize: 12 }}>
                          {thumbs[f.id] ? <img src={thumbs[f.id]} alt={f.name} style={{ width: '100%', borderRadius: 6, display: 'block' }} /> : <div style={{ height: 90, display: 'grid', placeItems: 'center', fontSize: 30 }}>{f.mime === 'application/pdf' ? '📕' : '🔒'}</div>}
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '4px 0' }}>{f.name}</div>
                          <div className="muted">{num(f.size / 1024, 0)} KB{f.w ? ` · ${f.w}×${f.h}` : ''}</div>
                          <Row>
                            <Btn kind="ghost" onClick={() => void fileOut(f)} title="Decrypt and download">⬇</Btn>
                            <Btn kind="ghost" title="Remove" onClick={() => { const nd = { ...cur, files: cur.files.filter((x) => x.id !== f.id) }; void saveDoc(nd) }}>✕</Btn>
                          </Row>
                        </div>
                      ))}
                    </div>
                    <FileDrop accept="image/*,application/pdf" multiple onFiles={(fs) => void addFiles(fs)} label="Add photos or PDFs (encrypted on this device)" />
                  </>
                ) : null}
              </Panel>
            ) : <Panel title="Select a document"><p className="muted">Pick a document on the left or add a new one.</p></Panel>}
          </div>
        </Split>
      )}

      {tab === 'card' && (
        <Split>
          <Panel title="Emergency details (encrypted)">
            <Row>
              <Txt label="Full name" value={profile.name} onChange={(name) => setProfile({ ...profile, name })} />
              <Txt label="Date of birth" type="date" value={profile.birth} onChange={(birth) => setProfile({ ...profile, birth })} />
            </Row>
            <Row>
              <Txt label="Nationality" value={profile.nationality} onChange={(nationality) => setProfile({ ...profile, nationality })} />
              <Txt label="Blood type" value={profile.blood} onChange={(blood) => setProfile({ ...profile, blood })} />
            </Row>
            <Txt label="Allergies" value={profile.allergies} onChange={(allergies) => setProfile({ ...profile, allergies })} />
            <Txt label="Medical notes" value={profile.medical} onChange={(medical) => setProfile({ ...profile, medical })} />
            <Area label="Emergency contacts" value={profile.contacts} onChange={(contacts) => setProfile({ ...profile, contacts })} rows={3} />
            <Row>
              <Txt label="Insurance assistance line" value={profile.insurerPhone} onChange={(insurerPhone) => setProfile({ ...profile, insurerPhone })} />
              <Txt label="Embassy / consulate" value={profile.embassy} onChange={(embassy) => setProfile({ ...profile, embassy })} />
            </Row>
            <Row><Btn kind="primary" onClick={() => saveProfile(profile)}>Save encrypted</Btn><Btn onClick={() => window.print()}>🖨 Print card</Btn></Row>
          </Panel>
          <div>
            <style>{'@media print{body *{visibility:hidden}.tdv-card,.tdv-card *{visibility:visible}.tdv-card{position:absolute;left:0;top:0;width:12cm}}'}</style>
            <div className="tdv-card" style={{ border: '3px solid #ef4444', borderRadius: 16, padding: 18, background: 'var(--panel)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ color: '#ef4444', fontSize: 18 }}>🆘 IN CASE OF EMERGENCY</b><span className="muted" style={{ fontSize: 12 }}>{today}</span></div>
              <h2 style={{ margin: '8px 0 2px' }}>{profile.name || 'Your name'}</h2>
              <div className="muted">{[profile.birth && `born ${profile.birth}`, profile.nationality].filter(Boolean).join(' · ')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
                <div><div className="muted" style={{ fontSize: 12 }}>Blood type</div><b>{profile.blood || '—'}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Allergies</div><b style={{ color: profile.allergies ? '#ef4444' : undefined }}>{profile.allergies || 'None known'}</b></div>
              </div>
              {profile.medical && <p style={{ margin: '0 0 8px' }}>{profile.medical}</p>}
              <div className="muted" style={{ fontSize: 12 }}>Contacts</div>
              <div style={{ whiteSpace: 'pre-wrap', fontWeight: 600, marginBottom: 8 }}>{profile.contacts || '—'}</div>
              {profile.insurerPhone && <div>Insurance assistance: <b>{profile.insurerPhone}</b></div>}
              {profile.embassy && <div>Embassy: <b>{profile.embassy}</b></div>}
              <table style={{ width: '100%', marginTop: 10, fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {docs.filter((d) => d.type !== 'ticket' && d.type !== 'booking').map((d) => (
                    <tr key={d.id} style={{ borderTop: '1px solid var(--line)' }}><td>{DOC_TYPES[d.type].icon} {d.title}</td><td style={{ fontFamily: 'var(--mono)' }}>{cfg.showNumbers ? d.number : mask(d.number)}</td><td>{d.expires && `exp. ${d.expires}`}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Check label="Show full document numbers on the card" value={cfg.showNumbers} onChange={(showNumbers) => setCfg({ showNumbers })} />
            <p className="muted" style={{ fontSize: 13 }}>Print it and keep it in your wallet, or take a screenshot for your phone’s lock screen. A printed card is not encrypted.</p>
          </div>
        </Split>
      )}

      {tab === 'security' && (
        <Split>
          <Panel title="Encrypted backup">
            <p>The backup contains only ciphertext: {Object.keys(v.docs).length} records and {Object.keys(v.files).length} files ({num(JSON.stringify(v).length / 1048576, 2)} MB). You need the passphrase to open it.</p>
            <Btn kind="primary" onClick={() => download(`travel-vault-${today}.json`, JSON.stringify(v), 'application/json')}>⬇ Download encrypted backup</Btn>
            <Select label="Auto-lock after inactivity" value={cfg.autoLock} onChange={(autoLock) => setCfg({ autoLock })} options={[[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour'], [0, 'Never']]} />
          </Panel>
          <Panel title="Change passphrase">
            <Txt label="New passphrase" type="password" value={pass} onChange={setPass} />
            <Txt label="Repeat" type="password" value={pass2} onChange={setPass2} />
            <Btn disabled={pass.length < 8 || pass !== pass2 || !!busy} onClick={() => void run('Re-encrypting everything…', async () => { const r = await rekey(v, key, docs, profile, pass); await persist(r.vault); setKey(r.key); setPass(''); setPass2(''); setInfo('Passphrase changed. Old backups still open with the old passphrase.') })}>Re-encrypt with new passphrase</Btn>
            <p className="muted" style={{ fontSize: 13 }}>Every record and file is re-sealed with a new salt, key and IVs.</p>
          </Panel>
        </Split>
      )}
    </div>
  )
}
