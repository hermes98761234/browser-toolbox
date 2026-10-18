import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, today, useToolState } from '../kit'

interface Doc { id: string; title: string; text: string; updated: number }
type Theme = 'paper' | 'sepia' | 'night'
interface State {
  current: string; goal: number; dailyGoal: number; sprintMin: number
  theme: Theme; font: 'serif' | 'sans' | 'mono'; size: number; width: number; typewriter: boolean
  log: Record<string, number>
}
const DEF: State = { current: '', goal: 500, dailyGoal: 300, sprintMin: 25, theme: 'paper', font: 'serif', size: 20, width: 680, typewriter: true, log: {} }

const THEMES: Record<Theme, [string, string, string]> = { paper: ['#fbfaf7', '#1f2328', '#d97706'], sepia: ['#f4ecd8', '#433422', '#b45309'], night: ['#16181d', '#d6d3cb', '#f59e0b'] }
const FONTS = { serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif', sans: 'system-ui, -apple-system, "Segoe UI", sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' }

const WELCOME = `Welcome to focus mode.

Set a word goal for this session, start the sprint timer and just write. The line you are typing stays in the middle of the screen, like paper in a typewriter, so your eyes never drift to the bottom edge.

Everything is saved automatically in this browser (IndexedDB), a moment after you stop typing. Press the full-screen button to hide everything else; press Esc to come back.

Delete this text and begin.`

const countWords = (t: string) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length
const newId = () => Math.random().toString(36).slice(2, 10)

// ---- tiny IndexedDB store (falls back to localStorage when IndexedDB is unavailable) ----
const DB = 'tb-writing-focus', STORE = 'docs', LS = 'tb:writing-focus-docs'
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function loadDocs(): Promise<Doc[]> {
  try {
    const db = await openDb()
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).getAll()
      q.onsuccess = () => res(q.result as Doc[])
      q.onerror = () => rej(q.error)
    })
  } catch {
    try {
      return JSON.parse(localStorage.getItem(LS) ?? '[]') as Doc[]
    } catch {
      return []
    }
  }
}
async function saveDoc(d: Doc, all: Doc[]) {
  try {
    const db = await openDb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(d)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    localStorage.setItem(LS, JSON.stringify(all.map((x) => (x.id === d.id ? d : x))))
  }
}
async function deleteDoc(id: string, rest: Doc[]) {
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
  } catch {
    localStorage.setItem(LS, JSON.stringify(rest))
  }
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export default function WritingFocusMode() {
  const [s, set, reset] = useToolState('writing-focus-mode', DEF)
  const [docs, setDocs] = useState<Doc[]>([])
  const [ready, setReady] = useState(false)
  const [words, setWords] = useState(0)
  const [chars, setChars] = useState(0)
  const [startWords, setStartWords] = useState(0)
  const [saved, setSaved] = useState('')
  const [full, setFull] = useState(false)
  const [sprintEnd, setSprintEnd] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [sessionStart, setSessionStart] = useState(() => Date.now())
  const ed = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)
  const timer = useRef(0)
  const docsRef = useRef<Doc[]>([])
  useEffect(() => {
    docsRef.current = docs
  }, [docs])

  const doc = docs.find((d) => d.id === s.current) ?? docs[0]

  // load documents once
  useEffect(() => {
    let alive = true
    void loadDocs().then(async (ds) => {
      if (!alive) return
      if (!ds.length) {
        const d: Doc = { id: newId(), title: 'Untitled draft', text: WELCOME, updated: Date.now() }
        ds = [d]
        await saveDoc(d, ds)
      }
      ds.sort((a, b) => b.updated - a.updated)
      setDocs(ds)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // put the current document's text into the editor when switching documents
  const shownId = useRef('')
  useEffect(() => {
    if (!doc || !ed.current || shownId.current === doc.id) return
    shownId.current = doc.id
    ed.current.innerText = doc.text
    const w = countWords(doc.text)
    lastCount.current = w
    const t = setTimeout(() => {
      setWords(w)
      setChars(doc.text.length)
      setStartWords(w)
      setSessionStart(Date.now())
    }, 0)
    return () => clearTimeout(t)
  }, [doc])

  const persist = useCallback((text: string) => {
    const cur = docsRef.current.find((d) => d.id === shownId.current)
    if (!cur) return
    const firstLine = text.trim().split('\n')[0]?.slice(0, 60) || 'Untitled draft'
    const d = { ...cur, text, title: firstLine, updated: Date.now() }
    const all = docsRef.current.map((x) => (x.id === d.id ? d : x))
    setDocs(all)
    void saveDoc(d, all).then(() => setSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })))
  }, [])

  const centerCaret = useCallback(() => {
    const sc = scroller.current, sel = window.getSelection()
    if (!s.typewriter || !sc || !sel || !sel.rangeCount) return
    const r = sel.getRangeAt(0).cloneRange()
    let rect = r.getBoundingClientRect()
    if (!rect.height) {
      const span = document.createElement('span')
      span.textContent = '​'
      r.insertNode(span)
      rect = span.getBoundingClientRect()
      span.remove()
    }
    const box = sc.getBoundingClientRect()
    sc.scrollTop += rect.top + rect.height / 2 - (box.top + box.height / 2)
  }, [s.typewriter])

  const onInput = () => {
    const text = ed.current?.innerText ?? ''
    const w = countWords(text)
    const delta = w - lastCount.current
    lastCount.current = w
    if (delta > 0) set((st) => ({ ...st, log: { ...st.log, [today()]: (st.log[today()] ?? 0) + delta } }))
    setWords(w)
    setChars(text.length)
    setSaved('…')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => persist(text), 700)
    requestAnimationFrame(centerCaret)
  }

  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === shell.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), sprintEnd ? 500 : 5000)
    return () => clearInterval(id)
  }, [sprintEnd])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        clearTimeout(timer.current)
        persist(ed.current?.innerText ?? '')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [persist])

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen?.().catch(() => undefined)
    setTimeout(() => ed.current?.focus(), 100)
  }
  const newDoc = () => {
    const d: Doc = { id: newId(), title: 'Untitled draft', text: '', updated: Date.now() }
    const all = [d, ...docs]
    setDocs(all)
    void saveDoc(d, all)
    set({ current: d.id })
  }
  const removeDoc = () => {
    if (!doc || docs.length <= 1) return
    const rest = docs.filter((d) => d.id !== doc.id)
    setDocs(rest)
    void deleteDoc(doc.id, rest)
    set({ current: rest[0].id })
  }

  const session = Math.max(0, words - startWords)
  const remaining = sprintEnd ? Math.max(0, sprintEnd - now) : s.sprintMin * 60000
  const sprintDone = sprintEnd > 0 && remaining === 0
  const elapsedMin = Math.max(1 / 60, (now - sessionStart) / 60000)
  const todayWords = s.log[today()] ?? 0
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const k = dayKey(now - i * 86400000)
    if ((s.log[k] ?? 0) >= s.dailyGoal) streak++
    else if (i > 0) break
  }
  const weeks = 12
  const cells = Array.from({ length: weeks * 7 }, (_, i) => dayKey(now - (weeks * 7 - 1 - i) * 86400000))
  const best = Math.max(0, ...Object.values(s.log))
  const [bg, fg, accent] = THEMES[s.theme]
  const mm = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  return (
    <div>
      <div
        ref={shell}
        style={{ background: bg, color: fg, borderRadius: full ? 0 : 14, border: full ? 0 : '1px solid var(--line)', position: 'relative', overflow: 'hidden', marginBottom: 14 }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 14px', fontSize: 13, opacity: 0.75, flexWrap: 'wrap' }}>
          <span><b>{session}</b> / {s.goal} words</span>
          <span>{words.toLocaleString()} total</span>
          <span>⏱ {mm(remaining)}{sprintDone ? ' · sprint done ✓' : ''}</span>
          <span style={{ flex: 1 }} />
          <span>{saved === '…' ? 'saving…' : saved ? `saved ${saved}` : ''}</span>
          {!sprintEnd || sprintDone ? (
            <button type="button" onClick={() => { setSprintEnd(Date.now() + s.sprintMin * 60000); setNow(Date.now()); ed.current?.focus() }} style={{ background: 'none', border: `1px solid ${fg}44`, color: fg, borderRadius: 8, padding: '2px 10px', cursor: 'pointer' }}>Start {s.sprintMin}-min sprint</button>
          ) : (
            <button type="button" onClick={() => setSprintEnd(0)} style={{ background: 'none', border: `1px solid ${fg}44`, color: fg, borderRadius: 8, padding: '2px 10px', cursor: 'pointer' }}>Stop sprint</button>
          )}
          <button type="button" onClick={toggleFull} style={{ background: 'none', border: `1px solid ${fg}44`, color: fg, borderRadius: 8, padding: '2px 10px', cursor: 'pointer' }}>{full ? '⤡ Exit full screen' : '⤢ Full screen'}</button>
        </div>
        <div style={{ height: 3, background: `${fg}18` }}>
          <div style={{ height: 3, width: `${Math.min(100, (session / Math.max(1, s.goal)) * 100)}%`, background: session >= s.goal ? '#16a34a' : accent, transition: 'width .3s' }} />
        </div>
        <div ref={scroller} style={{ height: full ? 'calc(100vh - 44px)' : 'min(62vh, 560px)', overflowY: 'auto', scrollBehavior: 'smooth' }} onClick={() => ed.current?.focus()}>
          <div style={{ maxWidth: s.width, margin: '0 auto', padding: s.typewriter ? (full ? '42vh 24px 50vh' : '160px 24px 260px') : '32px 24px 80px' }}>
            {!ready && <p style={{ opacity: 0.5 }}>Loading your drafts…</p>}
            <div
              ref={ed}
              contentEditable="plaintext-only"
              suppressContentEditableWarning
              spellCheck
              onInput={onInput}
              onKeyUp={() => requestAnimationFrame(centerCaret)}
              onClick={() => requestAnimationFrame(centerCaret)}
              aria-label="Writing area"
              style={{ outline: 'none', fontFamily: FONTS[s.font], fontSize: s.size, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', caretColor: accent, minHeight: '1.7em' }}
            />
          </div>
        </div>
        {sprintDone && (
          <div style={{ position: 'absolute', right: 16, bottom: 16, background: accent, color: '#fff', padding: '10px 14px', borderRadius: 10, fontSize: 14 }}>
            Sprint finished: {session} words in {s.sprintMin} min. Take a short break.
          </div>
        )}
      </div>
      <Split>
        <div>
          <Stats>
            <Stat label="This session" value={`${session} words`} sub={`${Math.round(session / elapsedMin)} words/min`} tone={session >= s.goal ? 'good' : 'accent'} />
            <Stat label="Today" value={todayWords} sub={`goal ${s.dailyGoal}`} tone={todayWords >= s.dailyGoal ? 'good' : undefined} />
            <Stat label="Goal streak" value={`${streak} day${streak === 1 ? '' : 's'}`} sub={`best day ${best}`} />
            <Stat label="Document" value={`${words.toLocaleString()} w`} sub={`${chars.toLocaleString()} chars · ${Math.max(1, Math.round(words / 238))} min read`} />
          </Stats>
          <Panel title={`Last ${weeks} weeks`}>
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gridAutoColumns: '14px', gap: 3, overflowX: 'auto' }}>
              {cells.map((k) => {
                const v = s.log[k] ?? 0
                const a = v ? Math.min(1, 0.25 + (v / Math.max(1, s.dailyGoal)) * 0.75) : 0
                return <div key={k} title={`${k}: ${v} words`} style={{ width: 14, height: 14, borderRadius: 3, background: v ? `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)` : 'var(--line)', outline: v >= s.dailyGoal ? '1.5px solid var(--ok)' : undefined }} />
              })}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Words added per day (deletions don’t subtract). Outlined days met the daily goal.</p>
            <Bar value={todayWords} max={s.dailyGoal} color={todayWords >= s.dailyGoal ? 'var(--ok)' : 'var(--accent)'} />
          </Panel>
          <Panel title="Drafts" actions={<Btn onClick={newDoc}>+ New</Btn>}>
            <Select label="Open draft" value={doc?.id ?? ''} onChange={(current) => set({ current })} options={docs.map((d) => [d.id, `${d.title} · ${new Date(d.updated).toLocaleDateString()}`] as [string, string])} />
            <Row>
              <Btn onClick={() => doc && download(`${doc.title.replace(/[^\w -]+/g, '').slice(0, 40) || 'draft'}.txt`, ed.current?.innerText ?? doc.text)}>⬇ .txt</Btn>
              <Btn onClick={() => doc && download(`${doc.title.replace(/[^\w -]+/g, '').slice(0, 40) || 'draft'}.md`, ed.current?.innerText ?? doc.text, 'text/markdown')}>⬇ .md</Btn>
              <Btn kind="danger" onClick={removeDoc} disabled={docs.length <= 1}>Delete draft</Btn>
            </Row>
            <Note>Drafts autosave to this browser’s IndexedDB about a second after you stop typing (Ctrl/⌘+S saves immediately). Clearing site data deletes them: download anything important.</Note>
          </Panel>
        </div>
        <div>
          <Panel title="Goals & sprint">
            <Row>
              <Num label="Session goal" value={s.goal} onChange={(goal) => set({ goal: Math.max(1, Math.round(goal)) })} unit="words" min={1} />
              <Num label="Daily goal" value={s.dailyGoal} onChange={(dailyGoal) => set({ dailyGoal: Math.max(1, Math.round(dailyGoal)) })} unit="words" min={1} />
              <Num label="Sprint length" value={s.sprintMin} onChange={(sprintMin) => set({ sprintMin: Math.max(1, sprintMin) })} unit="min" min={1} />
            </Row>
            <Btn onClick={() => { setStartWords(words); setSessionStart(Date.now()) }}>Start a new session count</Btn>
          </Panel>
          <Panel title="Page">
            <Seg value={s.theme} onChange={(theme) => set({ theme })} options={[['paper', 'Paper'], ['sepia', 'Sepia'], ['night', 'Night']]} />
            <Seg value={s.font} onChange={(font) => set({ font })} options={[['serif', 'Serif'], ['sans', 'Sans'], ['mono', 'Mono']]} />
            <Slider label="Text size" value={s.size} onChange={(size) => set({ size })} min={14} max={30} unit=" px" show={(v) => String(v)} />
            <Slider label="Line width" value={s.width} onChange={(width) => set({ width })} min={420} max={1000} step={20} unit=" px" show={(v) => String(v)} />
            <Check label="Typewriter scrolling (keep the current line centred)" value={s.typewriter} onChange={(typewriter) => set({ typewriter })} />
            <Btn kind="ghost" onClick={() => set({ ...DEF, current: s.current, log: s.log })}>Default look</Btn>
            <Btn kind="ghost" onClick={reset}>Reset all settings & stats</Btn>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
