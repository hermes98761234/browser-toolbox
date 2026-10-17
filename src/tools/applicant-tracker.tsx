import { useState } from 'react'
import { BarChart, Btn, download, FileDrop, Note, Num, Panel, Row, Select, Stat, Stats, Txt, today, uid, useToolState } from '../kit'
import { avgStageDays, daysInStage, funnel, matches, moveTo, STAGES, timeToHire, type Candidate, type FileRef, type Stage } from './lib/applicant-tracker'

// ---------- resumes live in IndexedDB as Blobs ----------
const DB = 'tb-applicant-tracker'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const r = fn(db.transaction('files', mode).objectStore('files'))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const putFile = (id: string, b: Blob) => tx('readwrite', (s) => s.put(b, id))
const getFile = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id))
const delFile = (id: string) => tx('readwrite', (s) => s.delete(id))

const d = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const mk = (name: string, role: string, source: string, rating: number, tags: string[], path: [Stage, number][], notes = ''): Candidate => ({
  id: uid(), name, role, source, rating, tags, notes, files: [],
  email: `${name.split(' ')[0].toLowerCase()}@mail.example`, phone: '',
  stage: path[path.length - 1][0], history: path.map(([stage, o]) => ({ stage, at: d(o) })),
})

const SAMPLE: Candidate[] = [
  mk('Priya Raman', 'Frontend Engineer', 'LinkedIn', 5, ['react', 'a11y'], [['Applied', 30], ['Screen', 26], ['Interview', 19], ['Offer', 6]], 'Strong portfolio, great system-design round.'),
  mk('Lucas Ferreira', 'Frontend Engineer', 'Referral', 4, ['vue', 'typescript'], [['Applied', 21], ['Screen', 17], ['Interview', 9]], 'Referred by Ana. Second interview Thursday.'),
  mk('Emma Schulz', 'Frontend Engineer', 'Job board', 3, ['react'], [['Applied', 12], ['Screen', 8]]),
  mk('Kwame Mensah', 'Frontend Engineer', 'Careers page', 2, ['angular'], [['Applied', 18], ['Screen', 15], ['Rejected', 13]], 'Salary expectations too far apart.'),
  mk('Sofia Rossi', 'Frontend Engineer', 'LinkedIn', 0, [], [['Applied', 2]]),
  mk('Hannah Kim', 'Product Designer', 'Dribbble', 5, ['figma', 'research'], [['Applied', 45], ['Screen', 41], ['Interview', 33], ['Offer', 20], ['Hired', 15]], 'Starts on the 1st.'),
  mk('Omar Haddad', 'Product Designer', 'Referral', 4, ['figma'], [['Applied', 14], ['Screen', 10], ['Interview', 4]]),
  mk('Julia Nowak', 'Product Designer', 'Job board', 3, ['ux writing'], [['Applied', 6]]),
  mk('Mateo García', 'Product Designer', 'Careers page', 1, [], [['Applied', 20], ['Rejected', 17]], 'No portfolio.'),
  mk('Aiko Tanaka', 'Data Analyst', 'LinkedIn', 4, ['sql', 'python'], [['Applied', 9], ['Screen', 5]]),
]

const DEF = { candidates: SAMPLE, role: 'All', q: '' }
const COLORS: Record<Stage, string> = { Applied: '#64748b', Screen: '#0ea5e9', Interview: '#6366f1', Offer: '#f59e0b', Hired: '#10b981', Rejected: '#ef4444' }
const kb = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)

export default function ApplicantTracker() {
  const [s, set, reset] = useToolState('applicant-tracker', DEF)
  const [sel, setSel] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const now = today()
  const roles = ['All', ...new Set(s.candidates.map((c) => c.role))]
  const pool = s.candidates.filter((c) => s.role === 'All' || c.role === s.role)
  const visible = pool.filter((c) => matches(c, s.q))
  const cur = s.candidates.find((c) => c.id === sel)
  const edit = (id: string, p: Partial<Candidate>) => set({ candidates: s.candidates.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const move = (id: string, stage: Stage) => set({ candidates: s.candidates.map((c) => (c.id === id ? moveTo(c, stage, now) : c)) })
  const fun = funnel(pool)
  const avg = avgStageDays(pool, now)
  const tth = timeToHire(pool)
  const active = pool.filter((c) => c.stage !== 'Hired' && c.stage !== 'Rejected')
  const stale = active.filter((c) => daysInStage(c, now) >= 7)

  const add = () => {
    const c = mk('New candidate', s.role === 'All' ? roles[1] ?? 'Open role' : s.role, 'LinkedIn', 0, [], [['Applied', 0]])
    set({ candidates: [c, ...s.candidates] })
    setSel(c.id)
  }
  const remove = (c: Candidate) => {
    c.files.forEach((f) => void delFile(f.id).catch(() => {}))
    set({ candidates: s.candidates.filter((x) => x.id !== c.id) })
    setSel(null)
  }
  const attach = async (c: Candidate, fs: File[]) => {
    try {
      const refs: FileRef[] = []
      for (const f of fs) {
        const id = uid()
        await putFile(id, f)
        refs.push({ id, name: f.name, size: f.size, type: f.type })
      }
      edit(c.id, { files: [...c.files, ...refs] })
    } catch {
      setMsg('Could not store the file (IndexedDB unavailable or full).')
    }
  }
  const open = async (f: FileRef) => {
    const b = await getFile(f.id).catch(() => undefined)
    if (!b) return setMsg(`“${f.name}” is not in this browser’s storage (restored from another device?).`)
    download(f.name, b)
  }
  const backup = async () => {
    const files: Record<string, string> = {}
    for (const c of s.candidates)
      for (const f of c.files) {
        const b = await getFile(f.id).catch(() => undefined)
        if (b) files[f.id] = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(b) })
      }
    download(`applicants-${now}.json`, JSON.stringify({ candidates: s.candidates, files }, null, 1), 'application/json')
  }
  const restore = async (file: File) => {
    try {
      const j = JSON.parse(await file.text()) as { candidates: Candidate[]; files?: Record<string, string> }
      if (!Array.isArray(j.candidates)) throw new Error()
      for (const [id, url] of Object.entries(j.files ?? {})) await putFile(id, await (await fetch(url)).blob())
      set({ candidates: j.candidates })
      setMsg(`Restored ${j.candidates.length} candidates and ${Object.keys(j.files ?? {}).length} files.`)
    } catch {
      setMsg('That file is not an Applicant Tracker backup.')
    }
  }
  const csv = () => {
    const rows = [['Name', 'Role', 'Stage', 'Days in stage', 'Rating', 'Source', 'Email', 'Tags', 'Applied'], ...s.candidates.map((c) => [c.name, c.role, c.stage, daysInStage(c, now), c.rating, c.source, c.email, c.tags.join(' '), c.history[0]?.at ?? ''])]
    download(`applicants-${now}.csv`, rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv')
  }

  return (
    <div>
      <Stats>
        <Stat label="Active candidates" value={active.length} sub={`${pool.length} total`} />
        <Stat label="Waiting ≥ 7 days" value={stale.length} tone={stale.length ? 'bad' : 'good'} sub="need a nudge" />
        <Stat label="Offers out" value={pool.filter((c) => c.stage === 'Offer').length} tone="accent" />
        <Stat label="Time to hire" value={Number.isFinite(tth) ? `${Math.round(tth)} d` : '—'} sub="application → hired" />
      </Stats>
      <Panel
        title="Pipeline"
        actions={
          <>
            <Btn kind="primary" onClick={add}>+ Candidate</Btn>
            <Btn onClick={csv}>⬇ CSV</Btn>
            <Btn onClick={() => void backup()}>⬇ Backup (with resumes)</Btn>
            <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
            <Btn kind="ghost" onClick={() => { reset(); setSel(null) }}>Sample</Btn>
          </>
        }
      >
        <Row>
          <Select label="Role" value={s.role} onChange={(role) => set({ role })} options={roles} />
          <Txt label="Search" value={s.q} onChange={(q) => set({ q })} placeholder="name, tag, source…" />
        </Row>
        {msg && <Note tone="warn">{msg}</Note>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(170px, 1fr))`, gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
          {STAGES.map((st) => {
            const col = visible.filter((c) => c.stage === st)
            return (
              <div
                key={st}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragging) move(dragging, st); setDragging(null) }}
                style={{ background: 'var(--bg, rgba(100,116,139,.06))', border: '1px solid var(--line)', borderRadius: 12, padding: 8, minHeight: 200 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: `3px solid ${COLORS[st]}`, paddingBottom: 4 }}>
                  <b>{st}</b>
                  <span className="muted">{col.length}</span>
                </div>
                {col.map((c) => {
                  const days = daysInStage(c, now)
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragging(c.id)}
                      onClick={() => setSel(c.id)}
                      style={{ background: 'var(--panel)', border: `1px solid ${sel === c.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 8, marginBottom: 8, cursor: 'grab', fontSize: 13 }}
                    >
                      <b style={{ fontSize: 14 }}>{c.name}</b>
                      <div className="muted">{c.role}</div>
                      <div style={{ color: '#f59e0b', letterSpacing: 1 }}>{'★'.repeat(c.rating)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - c.rating)}</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {c.tags.map((t) => <span key={t} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'rgba(99,102,241,.12)' }}>{t}</span>)}
                        {c.files.length > 0 && <span style={{ fontSize: 11 }}>📎{c.files.length}</span>}
                      </div>
                      {st !== 'Hired' && st !== 'Rejected' && <div style={{ marginTop: 4, fontSize: 11, color: days >= 7 ? 'var(--err)' : 'var(--muted)' }}>{days} d in stage</div>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <p className="k-hint">Drag cards between columns, or open a card and use the stage buttons (works on phones). Resumes are stored in this browser’s IndexedDB.</p>
      </Panel>

      <div className="k-split">
        <div>
          {cur ? (
            <Panel title={`Candidate · ${cur.name}`} actions={<><Btn kind="danger" onClick={() => remove(cur)}>Delete</Btn><Btn kind="ghost" onClick={() => setSel(null)}>Close</Btn></>}>
              <Row>
                {STAGES.map((st) => (
                  <button key={st} type="button" className={`k-btn ${cur.stage === st ? 'primary' : ''}`} onClick={() => move(cur.id, st)} style={cur.stage === st ? { background: COLORS[st], borderColor: COLORS[st] } : undefined}>{st}</button>
                ))}
              </Row>
              <Row>
                <Txt label="Name" value={cur.name} onChange={(name) => edit(cur.id, { name })} />
                <Txt label="Role" value={cur.role} onChange={(role) => edit(cur.id, { role })} />
              </Row>
              <Row>
                <Txt label="Email" value={cur.email} onChange={(email) => edit(cur.id, { email })} />
                <Txt label="Phone" value={cur.phone} onChange={(phone) => edit(cur.id, { phone })} />
              </Row>
              <Row>
                <Select label="Source" value={cur.source} onChange={(source) => edit(cur.id, { source })} options={[...new Set(['LinkedIn', 'Referral', 'Job board', 'Careers page', 'Dribbble', 'Agency', 'Other', cur.source])]} />
                <Num label="Rating (0–5)" value={cur.rating} onChange={(v) => edit(cur.id, { rating: Math.max(0, Math.min(5, Math.round(v))) })} min={0} max={5} step={1} />
              </Row>
              <Txt label="Tags (comma separated)" value={cur.tags.join(', ')} onChange={(v) => edit(cur.id, { tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />
              <label className="k-field"><span className="k-label">Notes</span><textarea className="k-area" rows={3} value={cur.notes} onChange={(e) => edit(cur.id, { notes: e.target.value })} /></label>
              <div className="k-label">Resume & documents</div>
              {cur.files.map((f) => (
                <Row key={f.id}>
                  <button type="button" className="k-btn ghost" onClick={() => void open(f)}>📄 {f.name}</button>
                  <span className="muted">{kb(f.size)}</span>
                  <Btn kind="ghost" onClick={() => { void delFile(f.id).catch(() => {}); edit(cur.id, { files: cur.files.filter((x) => x.id !== f.id) }) }}>✕</Btn>
                </Row>
              ))}
              <FileDrop multiple accept=".pdf,.doc,.docx,.txt,.rtf,.odt,image/*" onFiles={(fs) => void attach(cur, fs)} label="Drop resume / cover letter" />
              <div className="k-label" style={{ marginTop: 10 }}>History</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {cur.history.map((m, i) => <li key={i}><b style={{ color: COLORS[m.stage] }}>{m.stage}</b> · {m.at}</li>)}
              </ol>
            </Panel>
          ) : (
            <Panel title="Needs attention">
              {stale.length ? stale.sort((a, b) => daysInStage(b, now) - daysInStage(a, now)).map((c) => (
                <Row key={c.id}>
                  <button type="button" className="k-btn ghost" onClick={() => setSel(c.id)}>{c.name}</button>
                  <span className="muted">{c.stage} for {daysInStage(c, now)} days</span>
                </Row>
              )) : <Note tone="ok">Nobody has been waiting a week or more. 🎉</Note>}
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Funnel">
            {fun.map((f) => (
              <div key={f.stage} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
                <span style={{ width: 80, fontSize: 13 }}>{f.stage}</span>
                <div style={{ flex: 1, background: 'var(--line)', borderRadius: 6, height: 22, position: 'relative' }}>
                  <div style={{ width: `${(f.count / (fun[0].count || 1)) * 100}%`, background: COLORS[f.stage], height: '100%', borderRadius: 6 }} />
                  <span style={{ position: 'absolute', left: 8, top: 2, fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px #0008' }}>{f.count}</span>
                </div>
                <span className="muted" style={{ width: 48, textAlign: 'right', fontSize: 12 }}>{f.stage === 'Applied' ? '' : `${Math.round(f.rate * 100)}%`}</span>
              </div>
            ))}
            <p className="k-hint">Counts everyone who ever reached a stage, so rejected candidates still count for the steps they passed.</p>
          </Panel>
          <Panel title="Average days per stage">
            <BarChart bars={(['Applied', 'Screen', 'Interview', 'Offer'] as Stage[]).map((st) => ({ label: st, value: +(avg[st] ?? 0).toFixed(1), color: COLORS[st] }))} height={180} fy={(v) => `${v} d`} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
