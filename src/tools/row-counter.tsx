import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, JsonButtons, Note, Num, Panel, Row, Select, Split, Txt, Area, uid, useToolState } from '../kit'
import { nextFire, step, triggered, type Counter, type Reminder } from './lib/row-counter'

interface Project { id: string; name: string; craft: 'knit' | 'crochet'; counters: Counter[]; reminders: Reminder[]; notes: string }

const sample = (): Project => ({
  id: 'p1', name: 'Cabled sweater — back', craft: 'knit',
  counters: [
    { id: 'rows', name: 'Rows', value: 17, target: 96, repeat: 0, linkTo: '' },
    { id: 'cable', name: 'Cable pattern row', value: 5, target: 0, repeat: 8, linkTo: 'reps' },
    { id: 'reps', name: 'Cable repeats', value: 2, target: 12, repeat: 0, linkTo: '' },
  ],
  reminders: [
    { id: 'r1', counterId: 'cable', kind: 'at', n: 7, text: 'Cable row: C6F across the panel' },
    { id: 'r2', counterId: 'rows', kind: 'every', n: 10, text: 'Decrease 1 st each side' },
    { id: 'r3', counterId: 'rows', kind: 'at', n: 64, text: 'Start armhole shaping' },
  ],
  notes: 'Needles 4.5 mm. Gauge 22 sts × 30 rows = 10 cm.',
})

const DEF = { projects: [sample()], active: 'p1', wake: true, sound: true, vibrate: true }

let actx: AudioContext | null = null
function beep(freq = 880) {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  actx ??= new AC()
  void actx.resume()
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  o.connect(g).connect(actx.destination)
  o.start(t)
  o.stop(t + 0.55)
}

export default function RowCounter() {
  const [s, set, reset] = useToolState('row-counter', DEF)
  const [alerts, setAlerts] = useState<{ key: string; text: string; where: string }[]>([])
  const [undo, setUndo] = useState<Project[]>([])
  const [wakeOn, setWakeOn] = useState(false)
  const p = s.projects.find((x) => x.id === s.active) ?? s.projects[0]

  const save = (np: Project, keepUndo = true) => {
    if (keepUndo && p) setUndo((u) => [...u.slice(-49), p])
    set({ projects: s.projects.map((x) => (x.id === np.id ? np : x)) })
  }
  const bump = (cid: string, d: 1 | -1) => {
    if (!p) return
    const r = step(p.counters, cid, d)
    save({ ...p, counters: r.counters })
    if (d > 0) {
      const hits = triggered(r.counters, p.reminders, r.bumped)
      if (hits.length) {
        setAlerts((a) => [...hits.map((h) => ({ key: uid(), text: h.text, where: `${r.counters.find((c) => c.id === h.counterId)?.name ?? ''} ${r.counters.find((c) => c.id === h.counterId)?.value ?? ''}` })), ...a].slice(0, 6))
        if (s.sound) beep(1046)
        if (s.vibrate) navigator.vibrate?.([120, 60, 120])
      } else if (s.sound) beep(660)
    }
  }
  const editCounter = (id: string, patch: Partial<Counter>) => p && save({ ...p, counters: p.counters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, false)
  const editRem = (id: string, patch: Partial<Reminder>) => p && save({ ...p, reminders: p.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, false)

  // Wake Lock
  const lock = useRef<{ release: () => Promise<void> } | null>(null)
  useEffect(() => {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    if (!s.wake || !wl) return
    let dead = false
    const get = () => wl.request('screen').then((l) => { if (dead) void l.release(); else { lock.current = l; setWakeOn(true) } }).catch(() => setWakeOn(false))
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => { dead = true; document.removeEventListener('visibilitychange', vis); void lock.current?.release().catch(() => undefined); lock.current = null; setWakeOn(false) }
  }, [s.wake])

  // Keyboard: Space / + / ArrowUp count the main counter, − / ArrowDown undo-count, U = undo
  const bumpRef = useRef(bump)
  useEffect(() => {
    bumpRef.current = bump
  })
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const main = p?.counters[0]?.id
      if (!main) return
      if (e.code === 'Space' || e.key === '+' || e.key === 'ArrowUp') { e.preventDefault(); bumpRef.current(main, 1) }
      else if (e.key === '-' || e.key === 'ArrowDown') { e.preventDefault(); bumpRef.current(main, -1) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [p?.counters])

  if (!p) return <Note>No project. <Btn onClick={reset}>Create sample</Btn></Note>
  const main = p.counters[0]
  const big = { fontSize: 'clamp(28px, 6vw, 44px)', minHeight: 88, borderRadius: 18, flex: 1, fontWeight: 800, justifyContent: 'center' } as const
  const upcoming = p.reminders.map((r) => {
    const c = p.counters.find((x) => x.id === r.counterId)
    const at = c ? nextFire(r, c.value) : null
    return { r, c, at, left: c && at !== null ? at - c.value : Infinity }
  }).filter((x) => x.at !== null).sort((a, b) => a.left - b.left)

  return (
    <Split wide="left">
      <div>
        <Panel title={<>{p.craft === 'knit' ? '🧶' : '🪡'} {p.name}</>} actions={<Btn disabled={!undo.length} onClick={() => { const last = undo[undo.length - 1]; setUndo(undo.slice(0, -1)); set({ projects: s.projects.map((x) => (x.id === last.id ? last : x)) }) }}>↶ Undo</Btn>}>
          {alerts.map((a) => (
            <Note key={a.key} tone="warn">
              <Row wrap={false}><span style={{ flex: 1 }}>🔔 <b>{a.text}</b> <span className="muted">({a.where})</span></span><Btn kind="ghost" onClick={() => setAlerts(alerts.filter((x) => x.key !== a.key))}>✕</Btn></Row>
            </Note>
          ))}
          {main && (
            <div style={{ textAlign: 'center', margin: '8px 0 14px' }}>
              <div className="muted" style={{ fontWeight: 700 }}>{main.name}</div>
              <div style={{ fontSize: 'clamp(72px, 16vw, 132px)', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{main.value}</div>
              {main.target > 0 && <div style={{ maxWidth: 420, margin: '8px auto 0' }}><Bar value={main.value} max={main.target} /><span className="muted" style={{ fontSize: 13 }}>{main.value} of {main.target} · {Math.max(0, main.target - main.value)} to go</span></div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                <button type="button" className="k-btn" style={{ ...big, flex: '0 0 30%' }} onClick={() => bump(main.id, -1)} aria-label="Minus one">−</button>
                <button type="button" className="k-btn primary" style={big} onClick={() => bump(main.id, 1)} aria-label="Plus one">+ 1 row</button>
              </div>
            </div>
          )}
          {p.counters.slice(1).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <b>{c.name}</b>
                <div className="muted" style={{ fontSize: 12 }}>{c.repeat ? `repeats 1–${c.repeat}` : 'free count'}{c.linkTo ? ` → bumps ${p.counters.find((x) => x.id === c.linkTo)?.name ?? '?'}` : ''}{c.target ? ` · goal ${c.target}` : ''}</div>
                {(c.repeat > 0 || c.target > 0) && <Bar value={c.value} max={c.repeat || c.target} color="var(--accent2)" />}
              </div>
              <button type="button" className="k-btn" style={{ minWidth: 52, minHeight: 52, fontSize: 24 }} onClick={() => bump(c.id, -1)} aria-label={`${c.name} minus`}>−</button>
              <div style={{ fontSize: 34, fontWeight: 800, minWidth: 56, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
              <button type="button" className="k-btn primary" style={{ minWidth: 52, minHeight: 52, fontSize: 24 }} onClick={() => bump(c.id, 1)} aria-label={`${c.name} plus`}>+</button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Tip: Space / ↑ counts a row, ↓ takes one back. {s.wake ? (wakeOn ? 'Screen stays awake ✓' : 'Wake Lock not available — screen may dim.') : ''}</p>
        </Panel>
        {upcoming.length > 0 && (
          <Panel title="Coming up">
            {upcoming.slice(0, 5).map(({ r, c, at, left }) => (
              <Row key={r.id} wrap={false}>
                <span style={{ flex: 1 }}>{r.text}</span>
                <span className="muted">{c?.name} {at}</span>
                <b style={{ color: left <= 1 ? 'var(--warn)' : undefined, minWidth: 70, textAlign: 'right' }}>{left === 1 ? 'next!' : `in ${left}`}</b>
              </Row>
            ))}
          </Panel>
        )}
      </div>
      <div>
        <Panel title="Projects" actions={<Btn onClick={() => { const n: Project = { id: uid(), name: 'New project', craft: 'knit', counters: [{ id: uid(), name: 'Rows', value: 0, target: 0, repeat: 0, linkTo: '' }], reminders: [], notes: '' }; set({ projects: [...s.projects, n], active: n.id }) }}>+ Project</Btn>}>
          <Select label="Current project" value={p.id} onChange={(active) => { set({ active }); setAlerts([]); setUndo([]) }} options={s.projects.map((x) => [x.id, x.name] as [string, string])} />
          <Row>
            <Txt label="Name" value={p.name} onChange={(name) => save({ ...p, name }, false)} />
            <Select label="Craft" value={p.craft} onChange={(craft) => save({ ...p, craft }, false)} options={[['knit', 'Knitting'], ['crochet', 'Crochet']]} />
          </Row>
          <Area label="Notes" value={p.notes} onChange={(notes) => save({ ...p, notes }, false)} rows={2} />
          <Row>
            <Btn kind="danger" disabled={s.projects.length <= 1} onClick={() => { if (confirm(`Delete “${p.name}”?`)) { const rest = s.projects.filter((x) => x.id !== p.id); set({ projects: rest, active: rest[0].id }) } }}>Delete project</Btn>
            <Btn kind="ghost" onClick={() => save({ ...p, counters: p.counters.map((c) => ({ ...c, value: c.repeat ? 1 : 0 })) })}>Zero all counters</Btn>
          </Row>
        </Panel>
        <Panel title="Counters" actions={<Btn onClick={() => save({ ...p, counters: [...p.counters, { id: uid(), name: 'Pattern row', value: 1, target: 0, repeat: 4, linkTo: '' }] }, false)}>+ Counter</Btn>}>
          {p.counters.map((c, i) => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
              <Row>
                <Txt label={i === 0 ? 'Main counter' : 'Name'} value={c.name} onChange={(name) => editCounter(c.id, { name })} />
                <Num label="Value" value={c.value} min={0} step={1} onChange={(v) => editCounter(c.id, { value: Math.max(0, Math.round(v)) })} />
              </Row>
              <Row>
                <Num label="Goal" value={c.target} min={0} step={1} onChange={(v) => editCounter(c.id, { target: Math.max(0, Math.round(v)) })} hint="0 = none" />
                <Num label="Repeat every" value={c.repeat} min={0} step={1} onChange={(v) => editCounter(c.id, { repeat: Math.max(0, Math.round(v)) })} hint="counts 1…N" />
                <Select label="On repeat, bump" value={c.linkTo} onChange={(linkTo) => editCounter(c.id, { linkTo })} options={[['', '—'], ...p.counters.filter((x) => x.id !== c.id).map((x) => [x.id, x.name] as [string, string])]} />
              </Row>
              {i > 0 && <Btn kind="ghost" onClick={() => save({ ...p, counters: p.counters.filter((x) => x.id !== c.id).map((x) => (x.linkTo === c.id ? { ...x, linkTo: '' } : x)), reminders: p.reminders.filter((r) => r.counterId !== c.id) }, false)}>Remove counter</Btn>}
            </div>
          ))}
        </Panel>
        <Panel title="Reminders" actions={<Btn onClick={() => save({ ...p, reminders: [...p.reminders, { id: uid(), counterId: p.counters[0].id, kind: 'every', n: 4, text: 'Increase row' }] }, false)}>+ Reminder</Btn>}>
          {p.reminders.length === 0 && <p className="muted">Add a reminder like “every 6 rows: decrease” or “at row 40: start the neck”.</p>}
          {p.reminders.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
              <Txt label="Message" value={r.text} onChange={(text) => editRem(r.id, { text })} />
              <Row>
                <Select label="When" value={r.kind} onChange={(kind) => editRem(r.id, { kind })} options={[['every', 'Every'], ['at', 'At exactly']]} />
                <Num label="Number" value={r.n} min={1} step={1} onChange={(n) => editRem(r.id, { n: Math.max(1, Math.round(n)) })} />
                <Select label="Of counter" value={r.counterId} onChange={(counterId) => editRem(r.id, { counterId })} options={p.counters.map((x) => [x.id, x.name] as [string, string])} />
              </Row>
              <Btn kind="ghost" onClick={() => save({ ...p, reminders: p.reminders.filter((x) => x.id !== r.id) }, false)}>Remove</Btn>
            </div>
          ))}
        </Panel>
        <Panel title="Settings & backup">
          <Check label="Keep screen awake (Wake Lock)" value={s.wake} onChange={(wake) => set({ wake })} />
          <Check label="Click sound" value={s.sound} onChange={(sound) => set({ sound })} />
          <Check label="Vibrate on reminders (phones)" value={s.vibrate} onChange={(vibrate) => set({ vibrate })} />
          <Row>
            <JsonButtons name="row-counter-backup.json" data={s} onLoad={(d) => d && Array.isArray(d.projects) && set(d)} />
            <Btn kind="ghost" onClick={() => { if (confirm('Reset everything to the sample project?')) reset() }}>Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Progress is saved automatically in this browser.</p>
        </Panel>
      </div>
    </Split>
  )
}
