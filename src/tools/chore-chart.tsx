import { useState } from 'react'
import { Bar, Btn, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { addDays, assignee, balance, earned, key, mondayOf, type Chore, type Member, type Redemption, type Reward } from './lib/chore-chart'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#a855f7']
const EMOJI = ['🦊', '🐼', '🦄', '🐯', '🐸', '🐙', '🦉', '🐶']
const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sample() {
  const members: Member[] = [
    { id: 'm1', name: 'Mia', emoji: '🦊', color: COLORS[0] },
    { id: 'm2', name: 'Leo', emoji: '🐼', color: COLORS[1] },
    { id: 'm3', name: 'Ava', emoji: '🦄', color: COLORS[2] },
  ]
  const chores: Chore[] = [
    { id: 'c1', name: 'Set the table', emoji: '🍽️', points: 2, days: [0, 1, 2, 3, 4, 5, 6], who: ['m1', 'm2', 'm3'], rotate: 'day' },
    { id: 'c2', name: 'Load dishwasher', emoji: '🧽', points: 3, days: [0, 1, 2, 3, 4, 5, 6], who: ['m2', 'm3', 'm1'], rotate: 'day' },
    { id: 'c3', name: 'Feed the cat', emoji: '🐈', points: 1, days: [0, 1, 2, 3, 4, 5, 6], who: ['m1', 'm2', 'm3'], rotate: 'week' },
    { id: 'c4', name: 'Take out trash', emoji: '🗑️', points: 3, days: [1, 4], who: ['m2', 'm1'], rotate: 'week' },
    { id: 'c5', name: 'Tidy bedroom', emoji: '🛏️', points: 4, days: [5], who: ['m1'], rotate: 'week' },
    { id: 'c6', name: 'Tidy bedroom', emoji: '🛏️', points: 4, days: [5], who: ['m2'], rotate: 'week' },
    { id: 'c7', name: 'Water plants', emoji: '🪴', points: 2, days: [2, 6], who: ['m3'], rotate: 'week' },
    { id: 'c8', name: 'Vacuum living room', emoji: '🧹', points: 5, days: [6], who: ['m1', 'm2', 'm3'], rotate: 'week' },
  ]
  const rewards: Reward[] = [
    { id: 'r1', name: '30 min extra screen time', cost: 10 },
    { id: 'r2', name: 'Pick the movie night film', cost: 25 },
    { id: 'r3', name: 'Ice-cream trip', cost: 40 },
    { id: 'r4', name: 'Day out of choice', cost: 100 },
  ]
  // some completed chores in the past 10 days so the tallies are alive
  const done: Record<string, string> = {}
  const t = localToday()
  for (let i = 1; i <= 10; i++) {
    const d = addDays(t, -i)
    chores.forEach((c, j) => {
      const who = assignee(c, d)
      if (who && (i * 7 + j * 3) % 5 !== 0) done[key(c.id, d)] = who
    })
  }
  return { members, chores, rewards, done, redeemed: [] as Redemption[] }
}

const DEF = sample()

export default function ChoreChart() {
  const [s, set, reset] = useToolState('chore-chart', DEF)
  const [week, setWeek] = useState(() => mondayOf(localToday()))
  const [tab, setTab] = useState<'chores' | 'family' | 'rewards'>('chores')
  const [redeemer, setRedeemer] = useState('')
  const today = localToday()
  const dates = DAYS.map((_, i) => addDays(week, i))
  const weekPts = earned(s.chores, s.done, dates[0], dates[6])
  const member = (id: string) => s.members.find((m) => m.id === id)
  const bal = (id: string) => balance(id, s.chores, s.done, s.redeemed)
  const dueThisWeek = s.chores.flatMap((c) => dates.filter((d) => assignee(c, d)).map((d) => key(c.id, d)))
  const doneThisWeek = dueThisWeek.filter((k) => s.done[k]).length
  const who = redeemer || s.members[0]?.id || ''

  const toggle = (c: Chore, d: string) => {
    const k = key(c.id, d)
    const next = { ...s.done }
    if (next[k]) delete next[k]
    else next[k] = assignee(c, d)!
    set({ done: next })
  }
  const editChore = (id: string, p: Partial<Chore>) => set({ chores: s.chores.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editMember = (id: string, p: Partial<Member>) => set({ members: s.members.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const editReward = (id: string, p: Partial<Reward>) => set({ rewards: s.rewards.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const redeem = (r: Reward) => set({ redeemed: [...s.redeemed, { at: today, member: who, reward: r.name, cost: r.cost }] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Setup" actions={<><JsonButtons name="chore-chart.json" data={s} onLoad={(d) => d && Array.isArray(d.members) && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <div className="k-seg" role="tablist" style={{ marginBottom: 10 }}>
            {(['chores', 'family', 'rewards'] as const).map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          {tab === 'chores' && (
            <>
              {s.chores.map((c) => (
                <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                  <Row wrap={false}>
                    <input className="k-text" value={c.emoji} onChange={(e) => editChore(c.id, { emoji: e.target.value })} style={{ width: 42, textAlign: 'center' }} aria-label="Icon" />
                    <input className="k-text" value={c.name} onChange={(e) => editChore(c.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="Chore" />
                    <input className="k-text" type="number" min={0} value={c.points} onChange={(e) => editChore(c.id, { points: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 56 }} aria-label="Points" title="Points" />
                    <Btn kind="ghost" onClick={() => set({ chores: s.chores.filter((x) => x.id !== c.id) })} title="Remove">✕</Btn>
                  </Row>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                    {DAYS.map((d, i) => (
                      <button key={d} type="button" className={`k-btn ${c.days.includes(i) ? 'primary' : ''}`} style={{ padding: '2px 7px', fontSize: 12 }} onClick={() => editChore(c.id, { days: c.days.includes(i) ? c.days.filter((x) => x !== i) : [...c.days, i].sort() })}>{d[0]}{d[1]}</button>
                    ))}
                    <span style={{ width: 8 }} />
                    {s.members.map((m) => (
                      <button key={m.id} type="button" title={m.name} onClick={() => editChore(c.id, { who: c.who.includes(m.id) ? c.who.filter((x) => x !== m.id) : [...c.who, m.id] })} style={{ border: `2px solid ${c.who.includes(m.id) ? m.color : 'var(--line)'}`, borderRadius: 999, background: c.who.includes(m.id) ? m.color + '22' : 'transparent', padding: '0 6px', cursor: 'pointer', opacity: c.who.includes(m.id) ? 1 : 0.5 }}>{m.emoji}</button>
                    ))}
                    {c.who.length > 1 && (
                      <select className="k-select" value={c.rotate} onChange={(e) => editChore(c.id, { rotate: e.target.value as Chore['rotate'] })} aria-label="Rotation" style={{ fontSize: 12, width: 'auto', padding: '2px 6px' }}>
                        <option value="day">rotate each time</option>
                        <option value="week">rotate weekly</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}
              <Btn onClick={() => set({ chores: [...s.chores, { id: uid(), name: 'New chore', emoji: '✨', points: 2, days: [5], who: s.members.map((m) => m.id), rotate: 'week' }] })}>+ Chore</Btn>
            </>
          )}
          {tab === 'family' && (
            <>
              {s.members.map((m, i) => (
                <Row key={m.id} wrap={false}>
                  <select className="k-select" style={{ width: 64 }} value={m.emoji} onChange={(e) => editMember(m.id, { emoji: e.target.value })} aria-label="Avatar">{EMOJI.map((e) => <option key={e}>{e}</option>)}</select>
                  <input className="k-text" value={m.name} onChange={(e) => editMember(m.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="Name" />
                  <input type="color" value={m.color} onChange={(e) => editMember(m.id, { color: e.target.value })} aria-label="Colour" style={{ width: 36, padding: 0 }} />
                  <Btn kind="ghost" disabled={s.members.length < 2} onClick={() => set({ members: s.members.filter((x) => x.id !== m.id), chores: s.chores.map((c) => ({ ...c, who: c.who.filter((w) => w !== m.id) })) })} title="Remove">✕</Btn>
                  <span className="muted" style={{ fontSize: 12 }}>#{i + 1}</span>
                </Row>
              ))}
              <Btn onClick={() => { const n = s.members.length; set({ members: [...s.members, { id: uid(), name: `Kid ${n + 1}`, emoji: EMOJI[n % EMOJI.length], color: COLORS[n % COLORS.length] }] }) }}>+ Person</Btn>
            </>
          )}
          {tab === 'rewards' && (
            <>
              {s.rewards.map((r) => (
                <Row key={r.id} wrap={false}>
                  <input className="k-text" value={r.name} onChange={(e) => editReward(r.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="Reward" />
                  <input className="k-text" type="number" min={1} value={r.cost} onChange={(e) => editReward(r.id, { cost: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 64 }} aria-label="Cost" />
                  <span className="muted">pts</span>
                  <Btn kind="ghost" onClick={() => set({ rewards: s.rewards.filter((x) => x.id !== r.id) })} title="Remove">✕</Btn>
                </Row>
              ))}
              <Btn onClick={() => set({ rewards: [...s.rewards, { id: uid(), name: 'New reward', cost: 20 }].sort((a, b) => a.cost - b.cost) })}>+ Reward</Btn>
            </>
          )}
        </Panel>
        <Panel title="Redeem a reward">
          <Select label="Who" value={who} onChange={setRedeemer} options={s.members.map((m) => [m.id, `${m.emoji} ${m.name} · ${bal(m.id)} pts`] as const)} />
          {[...s.rewards].sort((a, b) => a.cost - b.cost).map((r) => {
            const b = bal(who)
            return (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <Row wrap={false}>
                  <span style={{ flex: 1 }}>{r.name} <span className="muted">· {r.cost} pts</span></span>
                  <Btn kind={b >= r.cost ? 'primary' : 'normal'} disabled={b < r.cost} onClick={() => redeem(r)}>Redeem</Btn>
                </Row>
                <Bar value={b} max={r.cost} color={member(who)?.color} />
              </div>
            )
          })}
          {s.redeemed.length > 0 && (
            <Table head={['Date', 'Who', 'Reward', '']} rows={[...s.redeemed].reverse().slice(0, 6).map((r) => [r.at, member(r.member)?.name ?? '?', r.reward, `−${r.cost}`])} />
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          {s.members.map((m) => (
            <Stat key={m.id} label={<span>{m.emoji} {m.name}</span>} value={<span style={{ color: m.color }}>{weekPts[m.id] ?? 0} pts</span>} sub={`this week · balance ${bal(m.id)}`} />
          ))}
        </Stats>
        <Panel
          title={`Week of ${new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          actions={
            <>
              <Btn onClick={() => setWeek(addDays(week, -7))}>◀</Btn>
              <Btn onClick={() => setWeek(mondayOf(today))}>This week</Btn>
              <Btn onClick={() => setWeek(addDays(week, 7))}>▶</Btn>
              <Btn onClick={() => window.print()}>Print</Btn>
            </>
          }
        >
          <p className="muted" style={{ marginTop: 0 }}>{doneThisWeek} of {dueThisWeek.length} chores done · tap a cell to tick it off</p>
          <Bar value={doneThisWeek} max={dueThisWeek.length || 1} color="var(--ok)" />
          <div className="k-table-wrap" style={{ marginTop: 10 }}>
            <table className="k-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Chore</th>
                  {dates.map((d, i) => (
                    <th key={d} style={{ textAlign: 'center', background: d === today ? 'var(--accent)' : undefined, color: d === today ? 'var(--on-accent)' : undefined, borderRadius: 6 }}>
                      {DAYS[i]}<br /><small>{Number(d.slice(8))}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.chores.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.emoji} {c.name} <small className="muted">+{c.points}</small></td>
                    {dates.map((d) => {
                      const a = assignee(c, d)
                      const m = a ? member(a) : undefined
                      const isDone = !!s.done[key(c.id, d)]
                      const late = !isDone && d < today
                      return (
                        <td key={d} style={{ textAlign: 'center', padding: 3 }}>
                          {m && (
                            <button type="button" onClick={() => toggle(c, d)} title={`${m.name}: ${c.name}${isDone ? ' (done)' : ''}`}
                              style={{ width: '100%', minWidth: 54, padding: '5px 2px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${m.color}`, background: isDone ? m.color : late ? 'transparent' : m.color + '1a', color: isDone ? '#fff' : 'var(--fg)', opacity: late ? 0.55 : 1, fontSize: 13 }}>
                              {isDone ? '✓' : m.emoji} {m.name.slice(0, 5)}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.members.length === 0 && <Note tone="warn">Add family members in Setup → Family.</Note>}
        </Panel>
        <Panel title="Reward progress">
          {s.members.map((m) => {
            const b = bal(m.id)
            const next = [...s.rewards].sort((x, y) => x.cost - y.cost).find((r) => r.cost > b)
            const ready = s.rewards.filter((r) => r.cost <= b)
            return (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{m.emoji} {m.name}</b>
                  <span>{b} pts</span>
                </Row>
                <Bar value={b} max={next?.cost ?? (b || 1)} color={m.color} />
                <small className="muted">
                  {ready.length ? `Can redeem: ${ready.map((r) => r.name).join(', ')}. ` : ''}
                  {next ? `${next.cost - b} pts to “${next.name}”` : 'Every reward unlocked! 🎉'}
                </small>
              </div>
            )
          })}
        </Panel>
      </div>
    </Split>
  )
}
