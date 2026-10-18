import { useState } from 'react'
import { Area, Bar, Btn, Check, CopyButton, download, JsonButtons, LineChart, Note, Panel, pct, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import {
  avgRating, completion, emptyEntry, isoWeek, RATINGS, reviewStreak, shiftWeek, stepDone, STEPS, toMarkdown, weekStart, type Entry,
} from './lib/weekly-review-guide'

interface State { entries: Record<string, Entry>; step: number }

const localIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const THIS = isoWeek(localIso())

function sampleEntry(week: string, r: number[], wins: string, hard: string, pri: [string, boolean][]): Entry {
  const e = emptyEntry(week)
  for (const s of STEPS) for (const [id] of s.checks ?? []) e.checks[id] = true
  e.answers = { wins, hard, learn: 'Short planning sessions on Monday morning save time all week.', grateful: 'A long walk on Sunday.', theme: 'Deep work before noon', stop: 'Doom-scrolling after 10 pm', idea: 'Start a small reading group' }
  RATINGS.forEach(([id], i) => (e.ratings[id] = r[i]))
  e.priorities = pri.map(([text, done]) => ({ text, done }))
  e.updated = weekStart(week)
  return e
}

const W1 = shiftWeek(THIS, -1), W2 = shiftWeek(THIS, -2), W3 = shiftWeek(THIS, -3)
const DEF: State = {
  step: 0,
  entries: {
    [W3]: sampleEntry(W3, [3, 2, 3, 3, 4, 2], 'Finished onboarding the new teammate.', 'Slept badly, skipped workouts.', [['Draft the Q4 plan', true], ['Book dentist', false], ['Three workouts', false]]),
    [W2]: sampleEntry(W2, [3, 3, 4, 3, 4, 3], 'Q4 plan approved; two workouts.', 'Context switching between projects.', [['Prototype the dashboard', true], ['Book dentist', true], ['Read 100 pages', false]]),
    [W1]: sampleEntry(W1, [4, 4, 4, 3, 3, 4], 'Dashboard prototype demoed — good feedback.', 'Late meetings ate into evenings.', [['Ship dashboard v1', false], ['Call grandma', false], ['Three workouts', false]]),
  },
}

const stars = (v: number | undefined, onSet: (n: number) => void, label: string) => (
  <span role="radiogroup" aria-label={label} style={{ whiteSpace: 'nowrap' }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" role="radio" aria-checked={v === n} onClick={() => onSet(v === n ? 0 : n)} title={`${n}/5`}
        style={{ border: 0, background: 'none', fontSize: 24, cursor: 'pointer', color: v && n <= v ? '#f59e0b' : 'var(--line)', padding: '0 2px' }}>★</button>
    ))}
  </span>
)

export default function WeeklyReviewGuide() {
  const [s, set, reset] = useToolState('weekly-review-guide', DEF)
  const [week, setWeek] = useState(THIS)
  const e = s.entries[week] ?? emptyEntry(week)
  const prevKey = shiftWeek(week, -1)
  const prev = s.entries[prevKey]
  const step = STEPS[Math.min(s.step, STEPS.length - 1)]
  const put = (patch: Partial<Entry>) => set((st) => ({ ...st, entries: { ...st.entries, [week]: { ...(st.entries[week] ?? emptyEntry(week)), ...patch, updated: localIso() } } }))
  const putPrev = (i: number, done: boolean) => prev && set((st) => ({ ...st, entries: { ...st.entries, [prevKey]: { ...prev, priorities: prev.priorities.map((p, j) => (j === i ? { ...p, done } : p)) } } }))
  const comp = completion(e)
  const avg = avgRating(e), pavg = avgRating(prev)
  const prevPri = prev?.priorities.filter((p) => p.text.trim()) ?? []
  const streak = reviewStreak(s.entries, week)
  const keys = Object.keys(s.entries).sort()
  const md = () => toMarkdown(e, prev)
  const totalMin = STEPS.reduce((a, x) => a + x.minutes, 0)

  return (
    <div>
      <Panel
        title={`Week ${week.slice(6)} · ${new Date(weekStart(week) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(Date.parse(weekStart(week) + 'T12:00:00') + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        actions={
          <>
            <Btn onClick={() => setWeek(shiftWeek(week, -1))}>◀ Prev</Btn>
            <Btn onClick={() => setWeek(THIS)} disabled={week === THIS}>This week</Btn>
            <Btn onClick={() => setWeek(shiftWeek(week, 1))}>Next ▶</Btn>
          </>
        }
      >
        <Stats>
          <Stat label="Review progress" value={pct(comp, 0)} sub={`about ${totalMin} min in total`} tone={comp >= 1 ? 'good' : 'accent'} />
          <Stat label="Week score" value={avg === null ? '—' : `${avg.toFixed(1)} / 5`} sub={avg !== null && pavg !== null ? `${avg - pavg >= 0 ? '▲' : '▼'} ${Math.abs(avg - pavg).toFixed(1)} vs last week` : 'rate the week in step 4'} tone={avg !== null && pavg !== null ? (avg >= pavg ? 'good' : 'bad') : undefined} />
          <Stat label="Last week's top 3" value={prevPri.length ? `${prevPri.filter((p) => p.done).length} / ${prevPri.length}` : '—'} sub="priorities done" />
          <Stat label="Review streak" value={`${streak} wk`} sub="weeks in a row" tone={streak >= 4 ? 'good' : undefined} />
        </Stats>
      </Panel>

      <Split wide="right">
        <div>
          <Panel title="Steps">
            {STEPS.map((x, i) => {
              const d = stepDone(x, e)
              return (
                <button key={x.id} type="button" onClick={() => set({ step: i })}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 6, borderRadius: 10, border: `2px solid ${i === s.step ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
                  <Row wrap={false}>
                    <b style={{ flex: 1 }}>{d >= 1 ? '✅' : `${i + 1}.`} {x.title}</b>
                    <span className="muted" style={{ fontSize: 13 }}>{x.minutes} min</span>
                  </Row>
                  <Bar value={d} max={1} color={d >= 1 ? 'var(--ok)' : 'var(--accent)'} />
                </button>
              )
            })}
          </Panel>
          <Panel title="Last week vs this week">
            {prev ? (
              <Table
                head={['Area', prevKey.slice(5), week.slice(5), 'Δ']}
                rows={RATINGS.map(([id, n]) => {
                  const a = prev.ratings[id], b = e.ratings[id]
                  const d = a && b ? b - a : null
                  return [n, a || '—', b || '—', d === null ? '' : <b key="d" style={{ color: d > 0 ? 'var(--ok)' : d < 0 ? 'var(--err)' : undefined }}>{d > 0 ? `+${d}` : d}</b>]
                })}
              />
            ) : <p className="muted">No review saved for the previous week.</p>}
          </Panel>
        </div>

        <div>
          <Panel title={`Step ${s.step + 1} of ${STEPS.length}: ${step.title}`} actions={<span className="muted">≈ {step.minutes} min</span>}>
            <p className="muted" style={{ marginTop: 0 }}>{step.intro}</p>
            {step.id === 'reflect' && prevPri.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <b>Last week's priorities — did they happen?</b>
                {prev!.priorities.map((p, i) => p.text.trim() && <div key={i}><Check label={p.text} value={p.done} onChange={(v) => putPrev(i, v)} /></div>)}
              </div>
            )}
            {step.checks?.map(([id, t]) => <div key={id}><Check label={t} value={!!e.checks[id]} onChange={(v) => put({ checks: { ...e.checks, [id]: v } })} /></div>)}
            {step.questions?.map(([id, q, ph]) => (
              <div key={id} style={{ marginTop: 10 }}>
                <Area label={q} value={e.answers[id] ?? ''} onChange={(v) => put({ answers: { ...e.answers, [id]: v } })} rows={2} placeholder={`e.g. ${ph}`} />
                {prev?.answers[id]?.trim() && <div className="muted" style={{ fontSize: 12 }}>Last week: {prev.answers[id]}</div>}
              </div>
            ))}
            {step.ratings && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto', gap: '4px 12px', alignItems: 'center' }}>
                {RATINGS.map(([id, n]) => (
                  <div key={id} style={{ display: 'contents' }}>
                    <span>{n}{prev?.ratings[id] ? <span className="muted" style={{ fontSize: 12 }}> (last: {prev.ratings[id]})</span> : null}</span>
                    {stars(e.ratings[id], (v) => put({ ratings: { ...e.ratings, [id]: v } }), n)}
                  </div>
                ))}
              </div>
            )}
            {step.priorities && (
              <div>
                <b>Top 3 priorities for next week</b>
                {e.priorities.map((p, i) => (
                  <Row key={i} wrap={false}>
                    <span style={{ width: 20 }}>{i + 1}.</span>
                    <input className="k-text" style={{ flex: 1 }} value={p.text} placeholder={['The one thing that would make next week a success', 'Second most important', 'Something for you (health, people, fun)'][i]}
                      onChange={(ev) => put({ priorities: e.priorities.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)) })} aria-label={`Priority ${i + 1}`} />
                  </Row>
                ))}
              </div>
            )}
            <Row>
              <Btn disabled={s.step === 0} onClick={() => set({ step: s.step - 1 })}>← Back</Btn>
              {s.step < STEPS.length - 1 ? <Btn kind="primary" onClick={() => set({ step: s.step + 1 })}>Next step →</Btn> : <Btn kind="primary" onClick={() => download(`weekly-review-${week}.md`, md(), 'text/markdown')}>✓ Finish & save .md</Btn>}
            </Row>
          </Panel>

          <Panel title="Trends" actions={<span className="muted" style={{ fontSize: 13 }}>{keys.length} weeks saved</span>}>
            {keys.length > 1 ? (
              <LineChart
                series={[
                  { name: 'Average score', points: keys.map((k, i) => [i, avgRating(s.entries[k]) ?? NaN] as [number, number]).filter(([, v]) => Number.isFinite(v)), color: '#6366f1' },
                  { name: 'Energy', points: keys.map((k, i) => [i, s.entries[k].ratings.energy || NaN] as [number, number]).filter(([, v]) => Number.isFinite(v)), color: '#f59e0b', dashed: true },
                  { name: 'Focus', points: keys.map((k, i) => [i, s.entries[k].ratings.focus || NaN] as [number, number]).filter(([, v]) => Number.isFinite(v)), color: '#10b981', dashed: true },
                ]}
                yMin={0}
                yMax={5}
                fx={(v) => (Number.isInteger(v) ? keys[v]?.slice(5) ?? '' : '')}
                fy={(v) => v.toFixed(1)}
                height={200}
              />
            ) : <p className="muted">Trends appear after two reviewed weeks.</p>}
          </Panel>

          <Panel
            title="Export & history"
            actions={
              <>
                <CopyButton text={md} label="Copy Markdown" />
                <Btn onClick={() => download(`weekly-review-${week}.md`, md(), 'text/markdown')}>⬇ .md</Btn>
                <Btn onClick={() => download('weekly-reviews.md', keys.map((k) => toMarkdown(s.entries[k], s.entries[shiftWeek(k, -1)])).join('\n---\n\n'), 'text/markdown')}>⬇ All weeks</Btn>
                <JsonButtons name="weekly-reviews.json" data={s} onLoad={(d) => set(d)} />
              </>
            }
          >
            <Table
              head={['Week', 'Starts', 'Done', 'Score', '']}
              rows={keys.slice().reverse().map((k) => [
                <button key="w" type="button" onClick={() => setWeek(k)} style={{ background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontWeight: k === week ? 800 : 400 }}>{k}</button>,
                weekStart(k),
                pct(completion(s.entries[k]), 0),
                avgRating(s.entries[k])?.toFixed(1) ?? '—',
                <Btn key="x" kind="ghost" title="Delete week" onClick={() => set((st) => { const en = { ...st.entries }; delete en[k]; return { ...st, entries: en } })}>✕</Btn>,
              ])}
            />
            <Row><Btn kind="ghost" onClick={reset}>Reset to sample</Btn></Row>
            <Note>Reviews are stored in this browser (localStorage). Use Backup to keep a copy or move to another device.</Note>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
