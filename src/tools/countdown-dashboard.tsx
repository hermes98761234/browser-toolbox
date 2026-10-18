import { useEffect, useState } from 'react'
import { Btn, Check, CopyButton, JsonButtons, Note, Panel, Row, Seg, Split, Txt, uid, useToolState, PALETTE } from '../kit'
import { decode, encode, monthsDays, parts, progress, target, type Countdown } from './lib/countdown-dashboard'

const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const N0 = new Date()
const plusDays = (n: number, h = 9) => { const d = new Date(N0); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return local(d) }
const created = new Date(N0.getTime() - 20 * 86400000).toISOString()
const SAMPLE: Countdown[] = [
  { id: 'ny', title: 'New Year', at: `${N0.getFullYear() + 1}-01-01T00:00`, emoji: '🎆', color: '#6366f1', yearly: true, created },
  { id: 'trip', title: 'Summer trip to the coast', at: plusDays(64, 7), emoji: '🏖️', color: '#0ea5e9', yearly: false, created },
  { id: 'bday', title: "Grandma's birthday", at: plusDays(23, 12), emoji: '🎂', color: '#ec4899', yearly: true, created },
  { id: 'proj', title: 'Project launch', at: plusDays(9, 10), emoji: '🚀', color: '#10b981', yearly: false, created },
  { id: 'move', title: 'Moved into the new flat', at: plusDays(-41, 15), emoji: '🏠', color: '#f59e0b', yearly: false, created: new Date(N0.getTime() - 120 * 86400000).toISOString() },
]
const EMOJI = ['⏳', '🎉', '🎂', '🎄', '🎆', '✈️', '🏖️', '🚀', '💍', '🎓', '👶', '🏠', '⚽', '🎵', '📅', '❤️']
const DEF = { items: SAMPLE, sort: 'soon' as 'soon' | 'manual', showSec: true }

function sharedFromHash(): string | null {
  const m = /[?&]c=([^&]+)/.exec(location.hash)
  return m ? m[1] : null
}
const shareUrl = (cs: Countdown[]) => `${location.origin}${location.pathname}${location.hash.replace(/\?.*$/, '')}?c=${encode(cs)}`

export default function CountdownDashboard() {
  const [s, set, reset] = useToolState('countdown-dashboard', DEF)
  const [now, setNow] = useState(() => new Date())
  const [incoming, setIncoming] = useState<Countdown[] | null>(() => {
    const h = sharedFromHash()
    return h ? decode(h, uid, new Date().toISOString()) : null
  })
  const [form, setForm] = useState<Countdown>(() => ({ id: '', title: '', at: local(new Date(Date.now() + 7 * 86400000)), emoji: '🎉', color: PALETTE[0], yearly: false, created: '' }))

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const list = s.sort === 'manual' ? s.items : [...s.items].sort((a, b) => {
    const ta = target(a, now).getTime() - now.getTime(), tb = target(b, now).getTime() - now.getTime()
    return (ta < 0 ? 1 : 0) - (tb < 0 ? 1 : 0) || (ta < 0 ? tb - ta : ta - tb)
  })
  const save = () => {
    if (!form.title.trim() || Number.isNaN(new Date(form.at).getTime())) return
    if (form.id) set({ items: s.items.map((c) => (c.id === form.id ? { ...form, title: form.title.trim() } : c)) })
    else set({ items: [...s.items, { ...form, id: uid(), title: form.title.trim(), created: new Date().toISOString() }] })
    setForm({ ...form, id: '', title: '' })
  }
  const clearHash = () => history.replaceState(null, '', location.hash.replace(/\?.*$/, '') || '#')
  const move = (id: string, d: number) => {
    const i = s.items.findIndex((c) => c.id === id)
    const j = i + d
    if (j < 0 || j >= s.items.length) return
    const a = [...s.items]
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ items: a, sort: 'manual' })
  }

  return (
    <div>
      {incoming && (
        <Note tone="info">
          <b>Someone shared {incoming.length} countdown{incoming.length === 1 ? '' : 's'} with you:</b> {incoming.map((c) => `${c.emoji} ${c.title}`).join(', ')}
          <Row>
            <Btn kind="primary" onClick={() => { set({ items: [...s.items, ...incoming] }); setIncoming(null); clearHash() }}>Add to my dashboard</Btn>
            <Btn onClick={() => { set({ items: incoming }); setIncoming(null); clearHash() }}>Replace mine</Btn>
            <Btn kind="ghost" onClick={() => { setIncoming(null); clearHash() }}>Dismiss</Btn>
          </Row>
        </Note>
      )}
      {incoming === null && sharedFromHash() && <Note tone="err">The shared link could not be read.</Note>}
      <Split wide="right">
        <div>
          <Panel title={form.id ? 'Edit countdown' : 'New countdown'}>
            <Txt label="Event" value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="e.g. Wedding day" />
            <Txt label="Date & time" type="datetime-local" value={form.at} onChange={(at) => setForm({ ...form, at })} />
            <div className="k-label">Icon</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 8px' }}>
              {EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => setForm({ ...form, emoji: e })} className={`k-btn ${form.emoji === e ? 'primary' : 'ghost'}`} style={{ padding: '4px 8px', fontSize: 18 }} aria-label={`Icon ${e}`}>{e}</button>
              ))}
            </div>
            <div className="k-label">Colour</div>
            <div style={{ display: 'flex', gap: 6, margin: '4px 0 8px' }}>
              {PALETTE.slice(0, 9).map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} aria-label={`Colour ${c}`} style={{ width: 26, height: 26, borderRadius: 13, background: c, border: form.color === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
            <Check label="Repeats every year (birthdays, anniversaries)" value={form.yearly} onChange={(yearly) => setForm({ ...form, yearly })} />
            <Row>
              <Btn kind="primary" onClick={save} disabled={!form.title.trim()}>{form.id ? 'Save changes' : '+ Add countdown'}</Btn>
              {form.id && <Btn kind="ghost" onClick={() => setForm({ ...form, id: '', title: '' })}>Cancel</Btn>}
            </Row>
          </Panel>
          <Panel title="Share & backup">
            <p className="muted" style={{ marginTop: 0 }}>The link below contains all your countdowns (titles, dates, icons) right in the URL. Nothing is uploaded; whoever opens it can add them to their own dashboard.</p>
            <input className="k-text" readOnly value={shareUrl(s.items)} onFocus={(e) => e.target.select()} aria-label="Share link" style={{ width: '100%', fontSize: 12 }} />
            <Row>
              <CopyButton text={() => shareUrl(s.items)} label="Copy link to all" />
              <JsonButtons name="countdowns.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Load samples</Btn>
            </Row>
          </Panel>
          <Panel title="Display">
            <Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['soon', 'Soonest first'], ['manual', 'My order']]} />
            <Check label="Show seconds" value={s.showSec} onChange={(showSec) => set({ showSec })} />
          </Panel>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12, alignContent: 'start' }}>
          {list.length === 0 && <Note>No countdowns yet. Add one on the left.</Note>}
          {list.map((c) => {
            const t = target(c, now)
            const p = parts(t.getTime() - now.getTime())
            const md = monthsDays(now, t)
            const bad = Number.isNaN(t.getTime())
            return (
              <div key={c.id} className="k-panel" style={{ borderTop: `5px solid ${c.color}`, margin: 0 }}>
                <Row wrap={false}>
                  <span style={{ fontSize: 30 }}>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{c.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{bad ? 'Invalid date' : t.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{c.yearly ? ' · yearly' : ''}</div>
                  </div>
                </Row>
                {!bad && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 2px' }}>
                      <b style={{ fontSize: 46, lineHeight: 1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{p.days}</b>
                      <span>day{p.days === 1 ? '' : 's'} {p.past ? 'ago' : 'to go'}</span>
                    </div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700 }}>
                      {pad(p.hours)}<span className="muted">h</span> {pad(p.minutes)}<span className="muted">m</span>{s.showSec && <> {pad(p.seconds)}<span className="muted">s</span></>}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {md.months > 0 ? `${md.months} month${md.months === 1 ? '' : 's'}, ${md.days} day${md.days === 1 ? '' : 's'} · ` : ''}{Math.floor(Math.abs(t.getTime() - now.getTime()) / 3600000).toLocaleString('en-US')} hours · {Math.floor(p.days / 7)} week{Math.floor(p.days / 7) === 1 ? '' : 's'}
                    </div>
                    {!p.past && (
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginTop: 8 }} title="Time elapsed since you added it">
                        <div style={{ width: `${progress(c, now) * 100}%`, height: '100%', background: c.color, borderRadius: 3 }} />
                      </div>
                    )}
                    {p.past && <Note tone="ok">🎉 This happened {p.days === 0 ? 'today' : `${p.days} days ago`}.</Note>}
                  </>
                )}
                <Row>
                  <Btn kind="ghost" onClick={() => setForm(c)}>Edit</Btn>
                  <CopyButton text={() => shareUrl([c])} label="Share" />
                  <Btn kind="ghost" onClick={() => move(c.id, -1)} title="Move earlier">↑</Btn>
                  <Btn kind="ghost" onClick={() => move(c.id, 1)} title="Move later">↓</Btn>
                  <Btn kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== c.id) })} title="Delete">✕</Btn>
                </Row>
              </div>
            )
          })}
        </div>
      </Split>
    </div>
  )
}
