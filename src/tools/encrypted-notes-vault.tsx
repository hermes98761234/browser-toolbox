import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note as Tip, num, Panel, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { changePassphrase, createVault, ITERATIONS, parseVault, sampleNotes, sealNote, strength, unlock, type Note, type Vault } from './lib/encrypted-notes-vault'

// ---------- storage: IndexedDB with a localStorage fallback (ciphertext only) ----------
const DBN = 'tb-encrypted-notes-vault', STORE = 'kv', KEY = 'vault', LS = 'tb-vault:encrypted-notes'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function loadVault(): Promise<Vault | null> {
  try {
    const db = await idb()
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY)
      q.onsuccess = () => res((q.result as Vault | undefined) ?? null)
      q.onerror = () => rej(q.error)
    })
  } catch {
    try { const t = localStorage.getItem(LS); return t ? parseVault(t) : null } catch { return null }
  }
}
async function saveVault(v: Vault | null): Promise<void> {
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (v) tx.objectStore(STORE).put(v, KEY)
      else tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS) } catch { /* storage unavailable */ }
  }
}

interface Settings { autoLock: number; lockOnHide: boolean }
const DEF: Settings = { autoLock: 5, lockOnHide: false }
const DEMO_PASS = 'demo vault passphrase'
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Strength({ pass }: { pass: string }) {
  const s = strength(pass)
  const c = s.bits < 40 ? '#ef4444' : s.bits < 60 ? '#f59e0b' : '#10b981'
  return pass ? <div style={{ fontSize: 13, margin: '4px 0 8px' }}><Bar value={Math.min(100, s.bits)} max={100} color={c} /> ≈ {num(s.bits, 0)} bits — {s.label}</div> : null
}

export default function EncryptedNotesVault() {
  const [cfg, setCfg] = useToolState('encrypted-notes-vault', DEF)
  const [vault, setVault] = useState<Vault | null | undefined>(undefined)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [sel, setSel] = useState('')
  const [q, setQ] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [left, setLeft] = useState(0)
  const [showChange, setShowChange] = useState(false)
  const dirty = useRef(new Set<string>())
  const vaultRef = useRef<Vault | null>(null)
  const notesRef = useRef<Note[]>([])
  const activity = useRef(0)

  useEffect(() => { vaultRef.current = vault ?? null }, [vault])
  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { void loadVault().then(setVault) }, [])

  const persist = useCallback(async (v: Vault) => { setVault(v); vaultRef.current = v; await saveVault(v) }, [])

  // encrypt and store notes edited since the last flush
  const flush = useCallback(async () => {
    const v = vaultRef.current
    if (!key || !v || !dirty.current.size) return
    const ids = [...dirty.current]
    dirty.current.clear()
    const next: Vault = { ...v, notes: { ...v.notes }, updated: new Date().toISOString() }
    for (const id of ids) {
      const n = notesRef.current.find((x) => x.id === id)
      if (n) next.notes[id] = await sealNote(key, n)
      else delete next.notes[id]
    }
    await persist(next)
  }, [key, persist])

  useEffect(() => {
    if (!key) return
    const t = setTimeout(() => void flush(), 500)
    return () => clearTimeout(t)
  }, [notes, key, flush])

  const lock = useCallback(async (why?: string) => {
    await flush()
    setKey(null); setNotes([]); setSel(''); setPass(''); setPass2(''); setShowChange(false)
    if (why) setMsg({ tone: 'warn', text: why })
  }, [flush])

  // auto-lock on inactivity and (optionally) when the tab is hidden
  useEffect(() => {
    if (!key) return
    activity.current = Date.now()
    const bump = () => { activity.current = Date.now() }
    const evs = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const hide = () => { if (cfg.lockOnHide && document.hidden) void lock('Locked because the tab was hidden.') }
    document.addEventListener('visibilitychange', hide)
    const iv = setInterval(() => {
      if (!cfg.autoLock) { setLeft(0); return }
      const remain = cfg.autoLock * 60_000 - (Date.now() - activity.current)
      setLeft(Math.max(0, remain))
      if (remain <= 0) void lock(`Locked after ${cfg.autoLock} min of inactivity.`)
    }, 1000)
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); document.removeEventListener('visibilitychange', hide); clearInterval(iv) }
  }, [key, cfg.autoLock, cfg.lockOnHide, lock])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null)
    try { await fn() } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }) } finally { setBusy('') }
  }

  const create = (p: string, seed: Note[] = []) => run('Deriving key (600,000 PBKDF2 rounds)…', async () => {
    const r = await createVault(p, seed)
    await persist(r.vault)
    setKey(r.key); setNotes(seed); setSel(seed[0]?.id ?? ''); setPass(''); setPass2('')
  })
  const doUnlock = () => run('Deriving key and decrypting…', async () => {
    const r = await unlock(vault!, pass)
    setKey(r.key); setNotes(r.notes); setSel(r.notes.find((n) => n.pinned)?.id ?? r.notes[0]?.id ?? ''); setPass('')
    if (r.failed.length) setMsg({ tone: 'warn', text: `${r.failed.length} note(s) could not be decrypted (damaged data).` })
  })
  const doChange = () => run('Re-encrypting with the new passphrase…', async () => {
    if (pass !== pass2) throw new Error('The new passphrases do not match')
    await flush()
    const r = await changePassphrase(notesRef.current, pass)
    await persist(r.vault)
    setKey(r.key); setPass(''); setPass2(''); setShowChange(false)
    setMsg({ tone: 'ok', text: 'Passphrase changed; every note was re-encrypted with a new key. Old backups still need the old passphrase.' })
  })
  const exportBackup = async () => {
    await flush()
    const v = vaultRef.current
    if (v) download(`notes-vault-${new Date().toISOString().slice(0, 10)}.btvault.json`, JSON.stringify(v), 'application/json')
  }
  const importBackup = (f: File) => run('Reading backup…', async () => {
    const v = parseVault(await f.text())
    if (vaultRef.current && Object.keys(vaultRef.current.notes).length && !confirm('Replace the current vault with this backup? Notes not in the backup will be lost.')) return
    setKey(null); setNotes([])
    await persist(v)
    setMsg({ tone: 'ok', text: `Backup with ${Object.keys(v.notes).length} encrypted notes imported. Unlock it with the passphrase it was made with.` })
  })

  const editNote = (id: string, p: Partial<Note>) => {
    dirty.current.add(id)
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...p, updated: new Date().toISOString() } : n)))
  }
  const addNote = () => {
    const now = new Date().toISOString()
    const n: Note = { id: uid(), title: 'Untitled note', body: '', tags: [], created: now, updated: now, pinned: false }
    dirty.current.add(n.id)
    setNotes((ns) => [n, ...ns]); setSel(n.id)
  }
  const delNote = (id: string) => {
    if (!confirm('Delete this note permanently?')) return
    dirty.current.add(id)
    setNotes((ns) => ns.filter((n) => n.id !== id)); setSel('')
  }

  const status = (busy || msg) && (
    <>
      {busy && <Tip>⏳ {busy}</Tip>}
      {msg && <Tip tone={msg.tone}>{msg.text}</Tip>}
    </>
  )
  const how = (
    <Panel title="How it protects your notes">
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.65, fontSize: 14 }}>
        <li>Your passphrase is stretched with <b>PBKDF2-SHA-256, {num(ITERATIONS, 0)} iterations</b> and a random salt into a 256-bit AES key that never leaves memory.</li>
        <li>Each note is sealed separately with <b>AES-GCM</b>, a fresh random IV on every save, and its id as authenticated data — edits or swapped notes are detected.</li>
        <li>Only ciphertext is written (IndexedDB in this browser). Locking or auto-lock wipes the key and decrypted text from the page.</li>
        <li>There is no recovery: forget the passphrase and the notes are gone. Keep encrypted backups.</li>
      </ul>
    </Panel>
  )

  if (vault === undefined) return <Tip>Opening vault…</Tip>

  if (!vault) return (
    <Split>
      <div>
        <Panel title="Create your vault">
          <Txt label="Passphrase" type="password" value={pass} onChange={setPass} placeholder="e.g. four or more unrelated words" />
          <Strength pass={pass} />
          <Txt label="Repeat passphrase" type="password" value={pass2} onChange={setPass2} />
          {pass2 && pass !== pass2 && <Tip tone="err">Passphrases do not match.</Tip>}
          <Row>
            <Btn kind="primary" disabled={!!busy || pass.length < 8 || pass !== pass2} onClick={() => void create(pass)}>🔒 Create vault</Btn>
            <Btn disabled={!!busy} onClick={() => void create(DEMO_PASS, sampleNotes())}>Try a demo vault</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>The demo vault uses the passphrase “{DEMO_PASS}” — change it (or delete the vault) before storing anything real.</p>
          {status}
        </Panel>
        <Panel title="Restore an encrypted backup">
          <FileDrop accept=".json,application/json" onFiles={([f]) => void importBackup(f)} label="Drop a .btvault.json backup here" />
        </Panel>
      </div>
      <div>{how}</div>
    </Split>
  )

  if (!key) return (
    <Split>
      <div>
        <Panel title="🔒 Vault locked">
          <Stats>
            <Stat label="Encrypted notes" value={Object.keys(vault.notes).length} />
            <Stat label="Last change" value={when(vault.updated)} />
          </Stats>
          <form onSubmit={(e) => { e.preventDefault(); void doUnlock() }}>
            <Txt label="Passphrase" type="password" value={pass} onChange={setPass} />
            <Row><Btn kind="primary" disabled={!!busy || !pass} onClick={() => void doUnlock()}>Unlock</Btn></Row>
          </form>
          {status}
        </Panel>
        <Panel title="Backup">
          <Row><Btn onClick={() => void exportBackup()}>⬇ Export encrypted backup</Btn></Row>
          <FileDrop accept=".json,application/json" onFiles={([f]) => void importBackup(f)} label="Import a .btvault.json backup (replaces this vault)" />
          <Row><Btn kind="danger" onClick={() => { if (prompt('Type DELETE to erase the vault and all its notes from this browser.') === 'DELETE') void saveVault(null).then(() => { setVault(null); setMsg(null) }) }}>Erase vault</Btn></Row>
        </Panel>
      </div>
      <div>{how}</div>
    </Split>
  )

  const term = q.trim().toLowerCase()
  const list = notes
    .filter((n) => !term || `${n.title}\n${n.body}\n${n.tags.join(' ')}`.toLowerCase().includes(term))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated.localeCompare(a.updated))
  const cur = notes.find((n) => n.id === sel)
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000)

  return (
    <>
      <Stats>
        <Stat label="Notes" value={notes.length} sub={`${notes.filter((n) => n.pinned).length} pinned`} />
        <Stat label="Auto-lock in" value={cfg.autoLock ? `${mm}:${String(ss).padStart(2, '0')}` : 'off'} tone={cfg.autoLock && left < 60000 ? 'bad' : undefined} />
        <Stat label="Saved" value={when(vault.updated)} sub="encrypted, per-note IV" tone="good" />
      </Stats>
      {status}
      <Split wide="right">
        <div>
          <Panel title="Notes" actions={<Btn kind="primary" onClick={addNote}>+ New</Btn>}>
            <input className="k-text" placeholder="Search titles, text, tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
            <div style={{ marginTop: 8, maxHeight: 460, overflowY: 'auto' }}>
              {list.map((n) => (
                <button key={n.id} type="button" onClick={() => setSel(n.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4, borderRadius: 10, border: '1px solid var(--line)', background: n.id === sel ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                  <b>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</b>
                  <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body.split('\n')[0] || '—'}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{when(n.updated)}{n.tags.length ? ` · ${n.tags.map((t) => `#${t}`).join(' ')}` : ''}</div>
                </button>
              ))}
              {!list.length && <Tip>No notes match.</Tip>}
            </div>
          </Panel>
          <Panel title="Security" actions={<Btn kind="danger" onClick={() => void lock('Vault locked.')}>🔒 Lock now</Btn>}>
            <Select label="Auto-lock after inactivity" value={cfg.autoLock} onChange={(autoLock) => setCfg({ autoLock })} options={[[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Never (not recommended)']]} />
            <Check label="Lock when the tab is hidden" value={cfg.lockOnHide} onChange={(lockOnHide) => setCfg({ lockOnHide })} />
            <Row>
              <Btn onClick={() => void exportBackup()}>⬇ Encrypted backup</Btn>
              <Btn onClick={() => setShowChange(!showChange)}>Change passphrase</Btn>
            </Row>
            {showChange && (
              <>
                <Txt label="New passphrase" type="password" value={pass} onChange={setPass} />
                <Strength pass={pass} />
                <Txt label="Repeat new passphrase" type="password" value={pass2} onChange={setPass2} />
                <Btn kind="primary" disabled={!!busy || pass.length < 8 || pass !== pass2} onClick={() => void doChange()}>Re-encrypt vault</Btn>
              </>
            )}
          </Panel>
        </div>
        <div>
          {cur ? (
            <Panel title="Edit note" actions={<>
              <Btn kind="ghost" onClick={() => editNote(cur.id, { pinned: !cur.pinned })}>{cur.pinned ? 'Unpin' : '📌 Pin'}</Btn>
              <Btn kind="danger" onClick={() => delNote(cur.id)}>Delete</Btn>
            </>}>
              <input className="k-text" value={cur.title} onChange={(e) => editNote(cur.id, { title: e.target.value })} aria-label="Title" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }} />
              <input className="k-text" value={cur.tags.join(', ')} onChange={(e) => editNote(cur.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="tags, comma separated" aria-label="Tags" style={{ marginBottom: 8 }} />
              <textarea className="k-area" rows={18} value={cur.body} onChange={(e) => editNote(cur.id, { body: e.target.value })} aria-label="Note text" placeholder="Write here — it is encrypted as you type." />
              <p className="muted" style={{ fontSize: 12 }}>Created {when(cur.created)} · {cur.body.length} characters · autosaved (encrypted) half a second after you stop typing.</p>
            </Panel>
          ) : <Tip>Select a note or create a new one.</Tip>}
        </div>
      </Split>
    </>
  )
}
