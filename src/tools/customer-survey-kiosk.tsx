import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, BarChart, Btn, Check, CsvButton, Donut, download, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { answered, answerText, choiceCounts, csvRows, demoResponses, EMOJI, missing, nps, numStats, perDay, type Answer, type QType, type Question, type Resp, type Survey } from './lib/customer-survey-kiosk'

// ---------- IndexedDB (responses survive reloads and can grow large) ----------
const DB = 'tb-customer-survey-kiosk', STORE = 'responses'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db()
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      d.close()
      res(req ? req.result : undefined)
    }
    t.onerror = () => rej(t.error)
  })
}
const idbAll = async () => ((await tx<Resp[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => a.at - b.at)
const idbPut = (rs: Resp[]) => tx('readwrite', (s) => void rs.forEach((r) => s.put(r)))
const idbClear = () => tx('readwrite', (s) => void s.clear())
const idbDelete = (ids: string[]) => tx('readwrite', (s) => void ids.forEach((i) => s.delete(i)))

/** Wall-clock helper kept outside components (time is read in handlers and intervals). */
const stamp = () => Date.now()

const TYPES: [QType, string][] = [['rating', '★ Star rating 1–5'], ['emoji', '😊 Smiley scale 1–5'], ['nps', 'NPS 0–10'], ['choice', 'Single choice'], ['multi', 'Multiple choice'], ['yesno', 'Yes / No'], ['text', 'Free text']]
const SURVEY: Survey = {
  title: 'How was your visit today?',
  intro: 'Four quick taps help us improve. It takes 20 seconds.',
  thanks: 'Thank you! Have a lovely day.',
  questions: [
    { id: 'q1', type: 'emoji', label: 'How do you feel about your visit?', options: [], required: true },
    { id: 'q2', type: 'rating', label: 'Rate the speed of service', options: [], required: true },
    { id: 'q3', type: 'choice', label: 'What brought you in today?', options: ['Coffee', 'Breakfast', 'Lunch', 'Pastries to go', 'Meeting a friend'], required: false },
    { id: 'q4', type: 'multi', label: 'What did you like?', options: ['Staff', 'Food quality', 'Cleanliness', 'Music', 'Prices'], required: false },
    { id: 'q5', type: 'nps', label: 'How likely are you to recommend us to a friend?', options: [], required: true },
    { id: 'q6', type: 'yesno', label: 'Was this your first visit?', options: [], required: false },
    { id: 'q7', type: 'text', label: 'Anything we could do better?', options: [], required: false },
  ],
}
const DEF = { survey: SURVEY, pin: '1234', idle: 30, oneByOne: true, accent: '#4f46e5', seeded: false }

// ---------- kiosk ----------
function Kiosk({ s, pin, idle, oneByOne, accent, onSubmit, onExit }: {
  s: Survey; pin: string; idle: number; oneByOne: boolean; accent: string; onSubmit: (a: Record<string, Answer>) => void; onExit: () => void
}) {
  const [stage, setStage] = useState<'welcome' | 'q' | 'thanks'>('welcome')
  const [i, setI] = useState(0)
  const [ans, setAns] = useState<Record<string, Answer>>({})
  const [pinOpen, setPinOpen] = useState(false)
  const [entered, setEntered] = useState('')
  const [warn, setWarn] = useState(false)
  const [last, setLast] = useState(() => stamp())
  const [now, setNow] = useState(() => stamp())
  const root = useRef<HTMLDivElement>(null)

  const restart = useCallback(() => {
    setStage('welcome')
    setI(0)
    setAns({})
    setWarn(false)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(stamp()), 500)
    return () => clearInterval(t)
  }, [])
  // Inactivity reset and thank-you auto-return
  const left = Math.max(0, idle - (now - last) / 1000)
  if (stage === 'q' && left <= 0) restart()
  if (stage === 'thanks' && now - last > 5000) restart()
  useEffect(() => {
    const el = root.current
    void el?.requestFullscreen?.().catch(() => {})
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  const qs = s.questions
  const touch = () => setLast(stamp())
  const setA = (id: string, v: Answer) => {
    touch()
    setAns((a) => ({ ...a, [id]: v }))
    setWarn(false)
  }
  const submit = () => {
    if (missing(s, ans).length) return setWarn(true)
    onSubmit(ans)
    setStage('thanks')
    touch()
  }
  const big: React.CSSProperties = { fontSize: 'clamp(18px, 3.2vw, 30px)', padding: '14px 22px', borderRadius: 16, border: '2px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer', minWidth: 64, fontWeight: 600 }
  const on = (b: boolean): React.CSSProperties => (b ? { ...big, background: accent, borderColor: accent, color: '#fff' } : big)

  const field = (q: Question) => {
    const a = ans[q.id]
    const wrap: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }
    if (q.type === 'rating') return <div style={wrap}>{[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" style={{ ...big, fontSize: 'clamp(30px, 6vw, 56px)', border: 0, background: 'none', color: typeof a === 'number' && v <= a ? '#f59e0b' : '#cbd5e1' }} onClick={() => setA(q.id, v)} aria-label={`${v} stars`}>★</button>)}</div>
    if (q.type === 'emoji') return <div style={wrap}>{EMOJI.map((e, k) => <button key={e} type="button" style={{ ...on(a === k + 1), fontSize: 'clamp(34px, 6vw, 60px)', padding: 10 }} onClick={() => setA(q.id, k + 1)} aria-label={`mood ${k + 1}`}>{e}</button>)}</div>
    if (q.type === 'nps') return (
      <div>
        <div style={{ ...wrap, gap: 6 }}>{Array.from({ length: 11 }, (_, v) => <button key={v} type="button" style={{ ...on(a === v), minWidth: 48, padding: '12px 0' }} onClick={() => setA(q.id, v)}>{v}</button>)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: 6, fontSize: 15 }}><span>Not likely</span><span>Extremely likely</span></div>
      </div>
    )
    if (q.type === 'yesno') return <div style={wrap}>{['Yes', 'No'].map((v) => <button key={v} type="button" style={{ ...on(a === v), minWidth: 140 }} onClick={() => setA(q.id, v)}>{v}</button>)}</div>
    if (q.type === 'choice') return <div style={wrap}>{q.options.filter(Boolean).map((v) => <button key={v} type="button" style={on(a === v)} onClick={() => setA(q.id, v)}>{v}</button>)}</div>
    if (q.type === 'multi') {
      const arr = Array.isArray(a) ? a : []
      return <div style={wrap}>{q.options.filter(Boolean).map((v) => <button key={v} type="button" style={on(arr.includes(v))} onClick={() => setA(q.id, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])}>{arr.includes(v) ? '✓ ' : ''}{v}</button>)}</div>
    }
    return <textarea value={typeof a === 'string' ? a : ''} onChange={(e) => setA(q.id, e.target.value)} rows={4} style={{ width: '100%', fontSize: 22, borderRadius: 14, padding: 14, border: '2px solid #cbd5e1', color: '#0f172a', background: '#fff' }} placeholder="Type here (optional)" />
  }

  const q = qs[i]
  const isLast = i === qs.length - 1
  const needNow = q && q.required && !answered(ans[q.id])
  return (
    <div ref={root} onPointerDown={touch} onKeyDown={touch} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'linear-gradient(160deg, #f8fafc, #e2e8f0)', color: '#0f172a', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <button type="button" onClick={() => { setPinOpen(true); setEntered('') }} aria-label="Exit kiosk" style={{ position: 'absolute', top: 8, right: 8, opacity: 0.35, border: 0, background: 'none', fontSize: 20, cursor: 'pointer', color: '#334155' }}>⚙</button>
      <div style={{ margin: 'auto', width: 'min(900px, 94vw)', padding: '24px 0', textAlign: 'center' }}>
        {stage === 'welcome' && (
          <>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 52px)', margin: '0 0 12px' }}>{s.title}</h1>
            <p style={{ fontSize: 'clamp(18px, 2.6vw, 26px)', color: '#475569' }}>{s.intro}</p>
            <button type="button" style={{ ...on(true), fontSize: 'clamp(22px, 3.6vw, 34px)', padding: '18px 48px', marginTop: 20 }} onClick={() => { setStage('q'); touch() }}>Start ▶</button>
          </>
        )}
        {stage === 'q' && (
          <>
            {oneByOne && q ? (
              <>
                <div style={{ height: 8, background: '#cbd5e1', borderRadius: 4, marginBottom: 28 }}><div style={{ height: 8, width: `${((i + 1) / qs.length) * 100}%`, background: accent, borderRadius: 4, transition: 'width .3s' }} /></div>
                <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', margin: '0 0 26px' }}>{q.label}{q.required ? '' : <span style={{ color: '#94a3b8', fontSize: '0.55em' }}> (optional)</span>}</h2>
                {field(q)}
                {warn && <p style={{ color: '#dc2626', fontSize: 20 }}>Please answer this question.</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34 }}>
                  <button type="button" style={{ ...big, visibility: i ? 'visible' : 'hidden' }} onClick={() => { setI(i - 1); touch() }}>◀ Back</button>
                  <button type="button" style={on(!needNow)} onClick={() => (needNow ? setWarn(true) : isLast ? submit() : (setI(i + 1), touch(), setWarn(false)))}>{isLast ? 'Submit ✓' : 'Next ▶'}</button>
                </div>
              </>
            ) : (
              <>
                {qs.map((x) => <div key={x.id} style={{ marginBottom: 30 }}><h2 style={{ fontSize: 'clamp(20px, 3vw, 30px)' }}>{x.label}</h2>{field(x)}</div>)}
                {warn && <p style={{ color: '#dc2626', fontSize: 20 }}>Please answer the required questions.</p>}
                <button type="button" style={on(true)} onClick={submit}>Submit ✓</button>
              </>
            )}
            <p style={{ color: '#94a3b8', marginTop: 24, fontSize: 14 }}>Resets in {Math.ceil(left)} s without activity</p>
          </>
        )}
        {stage === 'thanks' && <h1 style={{ fontSize: 'clamp(30px, 6vw, 60px)' }}>🎉<br />{s.thanks}</h1>}
      </div>
      {pinOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#0f172acc', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, width: 280, textAlign: 'center' }}>
            <b style={{ fontSize: 20 }}>Staff PIN</b>
            <div style={{ fontSize: 30, letterSpacing: 10, margin: '10px 0', minHeight: 40 }}>{'•'.repeat(entered.length)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '✕', '0', '⌫'].map((k) => (
                <button key={k} type="button" style={{ ...big, padding: '12px 0', fontSize: 22 }} onClick={() => {
                  if (k === '✕') return setPinOpen(false)
                  const v = k === '⌫' ? entered.slice(0, -1) : entered + k
                  setEntered(v)
                  if (v === pin) onExit()
                  else if (v.length >= pin.length && k !== '⌫') setTimeout(() => setEntered(''), 250)
                }}>{k}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- main ----------
export default function CustomerSurveyKiosk() {
  const [st, set] = useToolState('customer-survey-kiosk', DEF)
  const s = st.survey
  const [tab, setTab] = useState<'build' | 'results'>('results')
  const [kiosk, setKiosk] = useState(false)
  const [rs, setRs] = useState<Resp[]>([])
  const [range, setRange] = useState<'all' | '7' | '1'>('all')
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    try {
      setRs(await idbAll())
    } catch (e) {
      setErr(`IndexedDB unavailable (${(e as Error).message}). Responses cannot be stored in this browser mode.`)
    }
  }, [])
  useEffect(() => {
    void (async () => {
      try {
        if (!st.seeded && !(await idbAll()).length) await idbPut(demoResponses(SURVEY, 64, stamp()))
        set({ seeded: true })
      } catch {
        /* reported by reload */
      }
      await reload()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editQ = (id: string, p: Partial<Question>) => set({ survey: { ...s, questions: s.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) } })
  const moveQ = (k: number, d: number) => {
    const a = [...s.questions]
    const [x] = a.splice(k, 1)
    a.splice(Math.max(0, Math.min(a.length, k + d)), 0, x)
    set({ survey: { ...s, questions: a } })
  }
  const cutoff = range === 'all' ? 0 : stamp() - Number(range) * 86400000
  const shown = useMemo(() => rs.filter((r) => r.at >= cutoff), [rs, cutoff])
  const days = perDay(shown)
  const demoCount = rs.filter((r) => r.demo).length
  const today = rs.filter((r) => new Date(r.at).toDateString() === new Date().toDateString()).length
  const npsQ = s.questions.find((q) => q.type === 'nps')
  const npsAll = npsQ ? nps(shown.map((r) => r.answers[npsQ.id] ?? null)) : null
  const satQ = s.questions.find((q) => q.type === 'rating' || q.type === 'emoji')
  const sat = satQ ? numStats(shown.map((r) => r.answers[satQ.id] ?? null), 1, 5) : null

  const result = (q: Question) => {
    const vals = shown.map((r) => r.answers[q.id] ?? null)
    const n = vals.filter(answered).length
    if (q.type === 'rating' || q.type === 'emoji') {
      const ns = numStats(vals, 1, 5)
      return <><p className="muted">Average <b>{Number.isFinite(ns.mean) ? ns.mean.toFixed(2) : '—'}</b> / 5 · {n} answers</p><BarChart bars={ns.dist.map((v, k) => ({ label: q.type === 'emoji' ? EMOJI[k] : `${k + 1}★`, value: v, color: ['#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981'][k] }))} height={180} fy={(v) => String(Math.round(v))} /></>
    }
    if (q.type === 'nps') {
      const r = nps(vals), ns = numStats(vals, 0, 10)
      return <><p className="muted">NPS <b>{Number.isFinite(r.score) ? r.score : '—'}</b> · {r.promoters} promoters · {r.passives} passives · {r.detractors} detractors</p><BarChart bars={ns.dist.map((v, k) => ({ label: String(k), value: v, color: k <= 6 ? '#ef4444' : k <= 8 ? '#eab308' : '#10b981' }))} height={180} fy={(v) => String(Math.round(v))} /></>
    }
    if (q.type === 'yesno' || q.type === 'choice') return <Donut slices={choiceCounts(vals, q.type === 'yesno' ? ['Yes', 'No'] : q.options).filter((c) => c.value > 0 || c.label !== 'Other')} size={170} fv={(v) => String(v)} center={<span>{n}</span>} />
    if (q.type === 'multi') return <><p className="muted">{n} respondents · several answers allowed</p><BarChart bars={choiceCounts(vals, q.options).filter((c) => c.value > 0 || c.label !== 'Other').map((c) => ({ label: c.label, value: c.value }))} height={180} fy={(v) => String(Math.round(v))} /></>
    const texts = shown.filter((r) => answered(r.answers[q.id] ?? null)).slice(-8).reverse()
    return texts.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{texts.map((r) => <li key={r.id}>{String(r.answers[q.id])} <span className="muted" style={{ fontSize: 12 }}>{new Date(r.at).toLocaleDateString()}</span></li>)}</ul> : <p className="muted">No comments yet.</p>
  }

  if (kiosk) return <Kiosk s={s} pin={st.pin} idle={st.idle} oneByOne={st.oneByOne} accent={st.accent} onSubmit={(answers) => void idbPut([{ id: uid(), at: stamp(), answers }]).then(reload)} onExit={() => { setKiosk(false); void reload() }} />

  return (
    <div>
      <Panel title="Customer survey kiosk" actions={<><Seg value={tab} onChange={setTab} options={[['results', '📊 Results'], ['build', '✏️ Build survey']]} /><Btn kind="primary" onClick={() => setKiosk(true)} disabled={!s.questions.length}>▶ Start kiosk mode</Btn></>}>
        <Row>
          <Txt label="Exit PIN" value={st.pin} onChange={(pin) => set({ pin: pin.replace(/\D/g, '').slice(0, 8) })} hint="Digits only. Needed to leave kiosk mode." />
          <Num label="Auto-reset after" value={st.idle} onChange={(idle) => set({ idle })} unit="s idle" min={10} max={600} step={5} />
          <Select label="Layout" value={st.oneByOne ? 'one' : 'all'} onChange={(v) => set({ oneByOne: v === 'one' })} options={[['one', 'One question per screen'], ['all', 'All on one page']]} />
          <label className="k-field"><span className="k-label">Accent</span><input type="color" value={st.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
        </Row>
        {st.pin.length < 4 && <Note tone="warn">Use a PIN of at least 4 digits so customers can't leave kiosk mode by accident.</Note>}
        {err && <Note tone="err">{err}</Note>}
      </Panel>

      {tab === 'results' ? (
        <>
          <Stats>
            <Stat label="Responses" value={shown.length} sub={`${today} today${demoCount ? ` · ${demoCount} demo` : ''}`} />
            {npsAll && <Stat label="Net Promoter Score" value={Number.isFinite(npsAll.score) ? npsAll.score : '—'} tone={npsAll.score >= 30 ? 'good' : npsAll.score < 0 ? 'bad' : 'accent'} sub={`${npsAll.n} answers, −100…+100`} />}
            {sat && <Stat label="Average satisfaction" value={Number.isFinite(sat.mean) ? `${sat.mean.toFixed(2)} / 5` : '—'} sub={satQ?.label} />}
            <Stat label="Completion of optional text" value={(() => { const t = s.questions.find((q) => q.type === 'text'); return t && shown.length ? `${Math.round((shown.filter((r) => answered(r.answers[t.id] ?? null)).length / shown.length) * 100)}%` : '—' })()} />
          </Stats>
          <Panel
            title="Responses over time"
            actions={
              <>
                <Seg value={range} onChange={setRange} options={[['all', 'All'], ['7', '7 days'], ['1', '24 h']]} />
                <CsvButton name="survey-responses.csv" rows={() => csvRows(s, shown)} />
                <Btn onClick={() => download('survey-backup.json', JSON.stringify({ survey: s, responses: rs }, null, 2), 'application/json')}>⬇ Backup</Btn>
                <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  try {
                    const d = JSON.parse(await f.text()) as { survey?: Survey; responses?: Resp[] }
                    if (d.survey?.questions) set({ survey: d.survey })
                    if (Array.isArray(d.responses)) await idbPut(d.responses)
                    await reload()
                  } catch { setErr('That file is not a survey backup.') }
                }} /></label>
              </>
            }
          >
            <LineChart series={[{ name: 'Responses', points: days.map(([d, n]) => [new Date(d + 'T12:00').getTime(), n]), area: true }]} height={180} fx={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} fy={(v) => String(Math.round(v))} />
            <Row>
              {demoCount > 0 && <Btn onClick={() => void idbDelete(rs.filter((r) => r.demo).map((r) => r.id)).then(reload)}>Remove {demoCount} demo responses</Btn>}
              <Btn kind="danger" onClick={() => { if (confirm('Delete ALL stored responses? Export a CSV first if you need them.')) void idbClear().then(reload) }}>Delete all responses</Btn>
            </Row>
          </Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {s.questions.map((q, k) => <Panel key={q.id} title={`${k + 1}. ${q.label}`}>{result(q)}</Panel>)}
          </div>
          <Panel title="Latest responses">
            <Table head={['When', ...s.questions.map((q) => q.label.length > 22 ? q.label.slice(0, 21) + '…' : q.label)]} rows={shown.slice(-10).reverse().map((r) => [new Date(r.at).toLocaleString(), ...s.questions.map((q) => answerText(q, r.answers[q.id]))])} />
          </Panel>
        </>
      ) : (
        <Split>
          <Panel title="Welcome & thank-you screens">
            <Txt label="Title" value={s.title} onChange={(title) => set({ survey: { ...s, title } })} />
            <Area label="Intro" value={s.intro} onChange={(intro) => set({ survey: { ...s, intro } })} rows={2} />
            <Txt label="Thank-you message" value={s.thanks} onChange={(thanks) => set({ survey: { ...s, thanks } })} />
            <Note>Responses are stored in this browser's IndexedDB and never leave the device. Changing questions keeps old answers; renamed options appear as "Other".</Note>
            <Btn kind="ghost" onClick={() => set({ survey: SURVEY })}>Restore sample survey</Btn>
          </Panel>
          <Panel title={`Questions (${s.questions.length})`} actions={<Btn onClick={() => set({ survey: { ...s, questions: [...s.questions, { id: uid(), type: 'rating', label: 'New question', options: [], required: false }] } })}>+ Question</Btn>}>
            {s.questions.map((q, k) => (
              <div key={q.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>Q{k + 1}</b>
                  <Btn kind="ghost" onClick={() => moveQ(k, -1)} disabled={!k}>↑</Btn>
                  <Btn kind="ghost" onClick={() => moveQ(k, 1)} disabled={k === s.questions.length - 1}>↓</Btn>
                  <Btn kind="ghost" onClick={() => set({ survey: { ...s, questions: s.questions.filter((x) => x.id !== q.id) } })}>✕</Btn>
                </Row>
                <Txt label="Question" value={q.label} onChange={(label) => editQ(q.id, { label })} />
                <Row>
                  <Select label="Type" value={q.type} onChange={(type) => editQ(q.id, { type, options: (type === 'choice' || type === 'multi') && !q.options.length ? ['Option A', 'Option B'] : q.options })} options={TYPES} />
                  <Check label="Required" value={q.required} onChange={(required) => editQ(q.id, { required })} />
                </Row>
                {(q.type === 'choice' || q.type === 'multi') && <Area label="Options (one per line)" value={q.options.join('\n')} onChange={(v) => editQ(q.id, { options: v.split('\n').map((x) => x.trimStart()).filter((x, i, a) => x || i === a.length - 1) })} rows={4} />}
              </div>
            ))}
          </Panel>
        </Split>
      )}
    </div>
  )
}
