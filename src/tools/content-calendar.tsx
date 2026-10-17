import { useState, type DragEvent, type ReactNode } from 'react'
import { Area, Bar, Btn, Check, CsvButton, download, JsonButtons, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { addDays, byDate, isoWeek, monthGrid, parseIso, toIcs, weekStart, type Channel, type Post, type Status } from './lib/content-calendar'

type View = 'month' | 'week' | 'list'
interface State { channels: Channel[]; posts: Post[]; view: View; cursor: string; monday: boolean; hidden: string[]; status: Status | 'all' }

const STATUS: [Status, string, string][] = [['idea', 'Idea', '💡'], ['draft', 'Draft', '✏️'], ['scheduled', 'Scheduled', '⏰'], ['published', 'Published', '✅']]
const icon = (s: Status) => STATUS.find((x) => x[0] === s)?.[2] ?? ''
const CHANNELS: Channel[] = [
  { id: 'ig', name: 'Instagram', color: '#e1306c' }, { id: 'li', name: 'LinkedIn', color: '#0a66c2' }, { id: 'blog', name: 'Blog', color: '#10b981' },
  { id: 'nl', name: 'Newsletter', color: '#f59e0b' }, { id: 'yt', name: 'YouTube', color: '#ef4444' }, { id: 'tt', name: 'TikTok', color: '#111827' },
]
const SAMPLE: [number, string, string, Status, string][] = [
  [-13, 'ig', 'Behind the scenes: studio tour reel', 'published', '18:00'], [-11, 'blog', '5 lessons from our first year', 'published', ''], [-10, 'li', 'Hiring post: product designer', 'published', '09:00'],
  [-8, 'nl', 'Monthly newsletter #14', 'published', '07:30'], [-6, 'yt', 'Tutorial: getting started in 10 minutes', 'published', '16:00'], [-4, 'ig', 'Customer spotlight carousel', 'published', '12:00'],
  [-3, 'tt', 'Quick tip: keyboard shortcuts', 'published', '19:00'], [-1, 'li', 'Case study teaser', 'scheduled', '08:30'], [0, 'ig', 'Poll: what should we build next?', 'scheduled', '17:00'],
  [1, 'blog', 'Deep dive: how pricing works', 'draft', ''], [2, 'tt', 'Trend remix with product demo', 'draft', '20:00'], [3, 'li', 'Founder story thread', 'draft', '09:00'],
  [5, 'nl', 'Newsletter #15: launch edition', 'draft', '07:30'], [6, 'ig', 'Launch countdown story', 'scheduled', '10:00'], [7, 'yt', 'Launch video', 'scheduled', '15:00'],
  [7, 'ig', 'Launch day reel', 'scheduled', '15:30'], [7, 'li', 'Launch announcement', 'scheduled', '15:30'], [9, 'blog', 'Launch recap & numbers', 'idea', ''],
  [12, 'tt', 'Myth vs fact series #1', 'idea', ''], [14, 'ig', 'UGC repost week', 'idea', ''], [17, 'li', 'Industry report summary', 'idea', ''], [20, 'nl', 'Newsletter #16', 'idea', '07:30'],
]
const T0 = today()
const DEF: State = {
  channels: CHANNELS,
  posts: SAMPLE.map(([o, channel, title, status, time], i) => ({ id: `s${i}`, date: addDays(T0, o), time, title, channel, status, notes: '' })),
  view: 'month', cursor: T0, monday: true, hidden: [], status: 'all',
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ContentCalendar() {
  const [s, set, reset] = useToolState('content-calendar', DEF)
  const [sel, setSel] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const ch = (id: string) => s.channels.find((c) => c.id === id) ?? { id, name: 'Other', color: '#64748b' }
  const visible = s.posts.filter((p) => !s.hidden.includes(p.channel) && (s.status === 'all' || p.status === s.status)).sort(byDate)
  const cur = parseIso(s.cursor)
  const grid = monthGrid(cur.getFullYear(), cur.getMonth(), s.monday)
  const wk = Array.from({ length: 7 }, (_, i) => addDays(weekStart(s.cursor, s.monday), i))
  const range = s.view === 'week' ? wk : grid.filter((d) => parseIso(d).getMonth() === cur.getMonth())
  const inRange = visible.filter((p) => p.date >= range[0] && p.date <= range[range.length - 1])
  const post = s.posts.find((p) => p.id === sel)
  const today0 = today()

  const edit = (id: string, patch: Partial<Post>) => set({ posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const add = (date: string, channel = s.channels.find((c) => !s.hidden.includes(c.id))?.id ?? s.channels[0]?.id ?? 'other') => {
    const p: Post = { id: uid(), date, time: '', title: 'New post', channel, status: 'idea', notes: '' }
    set({ posts: [...s.posts, p] })
    setSel(p.id)
  }
  const shift = (n: number) => {
    if (s.view === 'week') return set({ cursor: addDays(s.cursor, 7 * n) })
    const d = new Date(cur.getFullYear(), cur.getMonth() + n, 1)
    set({ cursor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
  }
  const drop = (date: string, channel?: string) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) edit(id, channel ? { date, channel } : { date })
  }
  const dropProps = (key: string, date: string, channel?: string) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); if (over !== key) setOver(key) },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: drop(date, channel),
  })

  const Chip = ({ p, compact }: { p: Post; compact?: boolean }): ReactNode => {
    const c = ch(p.channel)
    return (
      <button type="button" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)} onClick={() => setSel(p.id)} title={`${c.name} · ${p.title} · ${p.status}`}
        style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: 12, lineHeight: 1.25, padding: '2px 5px', margin: '2px 0', borderRadius: 4, cursor: 'grab', color: 'inherit',
          background: `color-mix(in srgb, ${c.color} ${p.status === 'published' ? 12 : 22}%, var(--panel))`, borderLeft: `3px solid ${c.color}`,
          border: `1px ${p.status === 'idea' ? 'dashed' : 'solid'} color-mix(in srgb, ${c.color} 45%, transparent)`, borderLeftWidth: 3, outline: p.id === sel ? '2px solid var(--accent)' : undefined,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: p.status === 'published' ? 0.75 : 1 }}>
        {icon(p.status)} {!compact && p.time && <b>{p.time} </b>}{p.title}
      </button>
    )
  }

  const title = s.view === 'week' ? `Week ${isoWeek(wk[0])} · ${parseIso(wk[0]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${parseIso(wk[6]).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`
  const dows = s.monday ? [...DOW.slice(1), DOW[0]] : DOW
  const empty = range.filter((d) => !inRange.some((p) => p.date === d)).length

  return (
    <Split wide="left">
      <div>
        <Panel title={title} actions={<>
          <Btn kind="ghost" onClick={() => shift(-1)} title="Previous">◀</Btn>
          <Btn kind="ghost" onClick={() => set({ cursor: today() })}>Today</Btn>
          <Btn kind="ghost" onClick={() => shift(1)} title="Next">▶</Btn>
        </>}>
          <Row>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['month', 'Month'], ['week', 'Week × channel'], ['list', 'List']]} label="View" />
            <Select label="" value={s.status} onChange={(status) => set({ status })} options={[['all', 'All statuses'], ...STATUS.map(([k, l, i]) => [k, `${i} ${l}`] as [Status, string])]} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {s.channels.map((c) => {
              const off = s.hidden.includes(c.id)
              return <button key={c.id} type="button" onClick={() => set({ hidden: off ? s.hidden.filter((x) => x !== c.id) : [...s.hidden, c.id] })} style={{ font: 'inherit', fontSize: 13, borderRadius: 99, padding: '3px 10px', cursor: 'pointer', border: `1.5px solid ${c.color}`, background: off ? 'transparent' : `color-mix(in srgb, ${c.color} 18%, transparent)`, color: 'inherit', opacity: off ? 0.5 : 1, textDecoration: off ? 'line-through' : undefined }}>{c.name}</button>
            })}
          </div>

          {s.view === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
              {dows.map((d) => <div key={d} className="muted" style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{d}</div>)}
              {grid.map((d) => {
                const inMonth = parseIso(d).getMonth() === cur.getMonth()
                const ps = visible.filter((p) => p.date === d)
                return (
                  <div key={d} {...dropProps(d, d)} onDoubleClick={() => add(d)} style={{ minHeight: 92, padding: 3, borderRadius: 6, border: `1px solid ${over === d ? 'var(--accent)' : 'var(--line)'}`, background: over === d ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : inMonth ? 'var(--panel)' : 'transparent', opacity: inMonth ? 1 : 0.55, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, ...(d === today0 ? { background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '0 6px' } : {}) }}>{parseIso(d).getDate()}</span>
                      <button type="button" onClick={() => add(d)} title="Add post" style={{ border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>+</button>
                    </div>
                    {ps.slice(0, 4).map((p) => <Chip key={p.id} p={p} compact />)}
                    {ps.length > 4 && <span className="muted" style={{ fontSize: 11 }}>+{ps.length - 4} more</span>}
                  </div>
                )
              })}
            </div>
          )}

          {s.view === 'week' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '92px repeat(7, minmax(84px, 1fr))', gap: 3, minWidth: 700 }}>
                <span />
                {wk.map((d, i) => <div key={d} style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: d === today0 ? 'var(--accent)' : undefined }}>{dows[i]} {parseIso(d).getDate()}</div>)}
                {s.channels.filter((c) => !s.hidden.includes(c.id)).map((c) => (
                  <div key={c.id} style={{ display: 'contents' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, borderLeft: `4px solid ${c.color}`, paddingLeft: 6, alignSelf: 'center' }}>{c.name}</div>
                    {wk.map((d) => {
                      const key = `${c.id}|${d}`
                      return (
                        <div key={key} {...dropProps(key, d, c.id)} onDoubleClick={() => add(d, c.id)} style={{ minHeight: 54, padding: 3, borderRadius: 6, border: `1px solid ${over === key ? 'var(--accent)' : 'var(--line)'}`, background: over === key ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel)', minWidth: 0 }}>
                          {visible.filter((p) => p.date === d && p.channel === c.id).map((p) => <Chip key={p.id} p={p} />)}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.view === 'list' && (
            <Table head={['Date', 'Time', 'Channel', 'Post', 'Status']} rows={inRange.map((p) => [
              parseIso(p.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), p.time || '—',
              <span key="c" style={{ color: ch(p.channel).color, fontWeight: 700 }}>{ch(p.channel).name}</span>,
              <button key="t" type="button" onClick={() => setSel(p.id)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left', fontWeight: p.id === sel ? 700 : 400 }}>{p.title}</button>,
              `${icon(p.status)} ${p.status}`,
            ])} />
          )}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Drag posts between days{s.view === 'week' ? ' and channels' : ''}. Double-click a day (or “+”) to add a post. Click a post to edit it.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={s.view === 'week' ? 'This week' : 'This month'} value={inRange.length} sub="posts shown" />
          <Stat label="Ready" value={inRange.filter((p) => p.status === 'scheduled' || p.status === 'published').length} tone="good" sub="scheduled + published" />
          <Stat label="Empty days" value={empty} tone={empty > range.length / 2 ? 'bad' : undefined} sub={`of ${range.length}`} />
        </Stats>
        <Panel title={post ? 'Edit post' : 'Post details'} actions={post && <Btn kind="danger" onClick={() => { set({ posts: s.posts.filter((p) => p.id !== post.id) }); setSel(null) }}>Delete</Btn>}>
          {post ? (
            <>
              <Txt label="Title" value={post.title} onChange={(title) => edit(post.id, { title })} />
              <Row>
                <Txt label="Date" type="date" value={post.date} onChange={(date) => date && edit(post.id, { date })} />
                <Txt label="Time" type="time" value={post.time} onChange={(time) => edit(post.id, { time })} />
              </Row>
              <Row>
                <Select label="Channel" value={post.channel} onChange={(channel) => edit(post.id, { channel })} options={s.channels.map((c) => [c.id, c.name] as [string, string])} />
                <Select label="Status" value={post.status} onChange={(status) => edit(post.id, { status })} options={STATUS.map(([k, l, i]) => [k, `${i} ${l}`] as [Status, string])} />
              </Row>
              <Area label="Notes, caption, links" value={post.notes} onChange={(notes) => edit(post.id, { notes })} rows={4} />
              <Row>
                <Btn onClick={() => { const p = { ...post, id: uid(), date: addDays(post.date, 7), status: 'idea' as Status }; set({ posts: [...s.posts, p] }); setSel(p.id) }}>Duplicate +1 week</Btn>
                <Btn kind="ghost" onClick={() => setSel(null)}>Close</Btn>
              </Row>
            </>
          ) : <p className="muted" style={{ margin: 0 }}>Select a post on the calendar to edit it, or <Btn kind="ghost" onClick={() => add(today())}>+ add one for today</Btn></p>}
        </Panel>
        <Panel title="Channel mix">
          {s.channels.map((c) => {
            const n = inRange.filter((p) => p.channel === c.id).length
            return (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <Row wrap={false}>
                  <input type="color" value={c.color} aria-label={`${c.name} colour`} onChange={(e) => set({ channels: s.channels.map((x) => (x.id === c.id ? { ...x, color: e.target.value } : x)) })} style={{ width: 28, height: 24, padding: 0, border: 0, background: 'none' }} />
                  <input value={c.name} aria-label="Channel name" onChange={(e) => set({ channels: s.channels.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} style={{ flex: 1, minWidth: 0 }} />
                  <b style={{ minWidth: 24, textAlign: 'right' }}>{n}</b>
                  <Btn kind="ghost" title="Remove channel" disabled={s.posts.some((p) => p.channel === c.id)} onClick={() => set({ channels: s.channels.filter((x) => x.id !== c.id) })}>✕</Btn>
                </Row>
                <Bar value={n} max={Math.max(1, ...s.channels.map((x) => inRange.filter((p) => p.channel === x.id).length))} color={c.color} />
              </div>
            )
          })}
          <Btn onClick={() => set({ channels: [...s.channels, { id: uid(), name: 'New channel', color: '#6366f1' }] })}>+ Channel</Btn>
          <Check label="Weeks start on Monday" value={s.monday} onChange={(monday) => set({ monday })} />
        </Panel>
        <Panel title="Export & backup">
          <Row>
            <Btn kind="primary" onClick={() => download('content-calendar.ics', toIcs(visible, s.channels, new Date()), 'text/calendar')}>⬇ ICS (calendar)</Btn>
            <CsvButton name="content-calendar.csv" rows={() => [['Date', 'Time', 'Channel', 'Title', 'Status', 'Notes'], ...visible.map((p) => [p.date, p.time, ch(p.channel).name, p.title, p.status, p.notes])]} />
            <JsonButtons name="content-calendar.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset to sample</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Exports include the posts matching the current channel and status filters ({visible.length}). The ICS file imports into Google Calendar, Outlook and Apple Calendar. Data is saved in this browser only; use Backup to move it.</p>
        </Panel>
      </div>
    </Split>
  )
}
