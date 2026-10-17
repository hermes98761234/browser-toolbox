import { useEffect, useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'

type Kind = 'left' | 'right' | 'bottle' | 'solid'
interface Feed { id: string; kind: Kind; start: number; end: number; ml: number; note: string }
interface State { feeds: Feed[]; active: { kind: Kind; start: number } | null; unit: 'ml' | 'oz'; name: string }

const KINDS: Record<Kind, { label: string; icon: string; color: string }> = {
  left: { label: 'Left breast', icon: 'L', color: '#ec4899' },
  right: { label: 'Right breast', icon: 'R', color: '#a855f7' },
  bottle: { label: 'Bottle', icon: '🍼', color: '#0ea5e9' },
  solid: { label: 'Solids', icon: '🥣', color: '#f59e0b' },
}
const nowMs = () => Date.now()
const MIN = 60_000
const H = 3_600_000
const DAY = 86_400_000

function sample(): Feed[] {
  const out: Feed[] = []
  const now = Date.now()
  let t = now - 6 * DAY + 0.3 * H
  let side: Kind = 'left'
  let i = 0
  while (t < now - 1.6 * H) {
    const hour = new Date(t).getHours()
    const bottle = i % 5 === 3
    const dur = bottle ? 15 : 9 + ((i * 7) % 11)
    out.push({ id: uid(), kind: bottle ? 'bottle' : side, start: t, end: t + dur * MIN, ml: bottle ? 90 + ((i * 13) % 4) * 10 : 0, note: '' })
    if (!bottle) side = side === 'left' ? 'right' : 'left'
    t += (hour >= 22 || hour < 5 ? 3.4 : 2.6) * H + ((i * 17) % 30) * MIN
    i++
  }
  // shift so the most recent sample feed ended a little under two hours ago
  const shift = now - 1.8 * H - out[out.length - 1].start
  return out.map((f) => ({ ...f, start: f.start + shift, end: f.end + shift }))
}

const DEF: State = { feeds: sample(), active: null, unit: 'ml', name: 'Baby' }

const dur = (ms: number) => {
  const m = Math.round(ms / MIN)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const localInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * MIN)
  return d.toISOString().slice(0, 16)
}

export default function BabyFeedingTracker() {
  const [s, set, reset] = useToolState('baby-feeding-tracker', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [form, setForm] = useState(() => ({ kind: 'bottle' as Kind, at: localInput(nowMs() - 30 * MIN), min: 15, amount: 120, note: '' }))
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), s.active ? 1000 : 30_000)
    return () => clearInterval(t)
  }, [s.active])

  const feeds = [...s.feeds].sort((a, b) => b.start - a.start)
  const last = feeds[0]
  const lastBreast = feeds.find((f) => f.kind === 'left' || f.kind === 'right')
  const nextSide: Kind = lastBreast?.kind === 'left' ? 'right' : 'left'
  const toUnit = (ml: number) => (s.unit === 'oz' ? ml / 29.5735 : ml)
  const fromUnit = (v: number) => (s.unit === 'oz' ? v * 29.5735 : v)
  const amt = (ml: number) => `${Math.round(toUnit(ml) * (s.unit === 'oz' ? 10 : 1)) / (s.unit === 'oz' ? 10 : 1)} ${s.unit}`

  const tap = (kind: Kind) => {
    const t = nowMs()
    set((x) => {
      let fs = x.feeds
      if (x.active) fs = [...fs, { id: uid(), kind: x.active.kind, start: x.active.start, end: t, ml: 0, note: '' }]
      const stoppingSame = x.active?.kind === kind
      return { ...x, feeds: fs, active: stoppingSame ? null : { kind, start: t } }
    })
  }

  const last24 = s.feeds.filter((f) => f.start > now - DAY)
  const nurse24 = last24.filter((f) => f.kind === 'left' || f.kind === 'right').reduce((a, f) => a + (f.end - f.start), 0)
  const ml24 = last24.reduce((a, f) => a + f.ml, 0)
  const starts = [...last24].sort((a, b) => a.start - b.start).map((f) => f.start)
  const gaps = starts.slice(1).map((t, i) => t - starts[i])
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : NaN

  const days = Array.from({ length: 7 }, (_, i) => dayKey(now - (6 - i) * DAY))
  const per = (k: string, f: (x: Feed) => number) => s.feeds.filter((x) => dayKey(x.start) === k).reduce((a, x) => a + f(x), 0)
  const label = (k: string) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' })

  return (
    <Split>
      <div>
        <Panel title={`${s.name}'s feeds`} actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          {s.active ? (
            <div style={{ textAlign: 'center', padding: '6px 0 12px' }}>
              <div className="muted" style={{ fontWeight: 700 }}>{KINDS[s.active.kind].icon} {KINDS[s.active.kind].label} · started {hm(s.active.start)}</div>
              <div style={{ fontSize: 52, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: KINDS[s.active.kind].color }}>{clock(now - s.active.start)}</div>
            </div>
          ) : (
            <Note>Tap a button to start a timer. Tap it again to stop, or tap the other side to switch.</Note>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(Object.keys(KINDS) as Kind[]).map((k) => {
              const on = s.active?.kind === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => tap(k)}
                  style={{ padding: '18px 8px', borderRadius: 14, border: `2px solid ${KINDS[k].color}`, background: on ? KINDS[k].color : 'var(--panel)', color: on ? '#fff' : 'var(--fg)', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 26, lineHeight: '34px', height: 34 }}>
                    {k === 'left' || k === 'right' ? (
                      <span style={{ display: 'inline-grid', placeItems: 'center', width: 34, height: 34, borderRadius: 34, border: `3px solid ${on ? '#fff' : KINDS[k].color}`, fontSize: 18 }}>{KINDS[k].icon}</span>
                    ) : KINDS[k].icon}
                  </div>
                  {on ? 'Stop' : 'Start'} {KINDS[k].label.toLowerCase()}
                  {k === nextSide && !s.active && <div style={{ fontSize: 12, fontWeight: 700, color: KINDS[k].color }}>suggested next side</div>}
                </button>
              )
            })}
          </div>
          {feeds[0]?.kind === 'bottle' && !feeds[0].ml && <Note tone="warn">Enter how much the last bottle was in the log below.</Note>}
          {s.active && (
            <Row>
              <Btn kind="ghost" onClick={() => set({ active: null })}>Discard timer</Btn>
            </Row>
          )}
        </Panel>
        <Panel title="Add or edit a past feed">
          <Seg value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={(Object.keys(KINDS) as Kind[]).map((k) => [k, KINDS[k].label] as const)} />
          <Row>
            <Txt label="Started" type="datetime-local" value={form.at} onChange={(at) => setForm({ ...form, at })} />
            <Num label="Duration" value={form.min} onChange={(min) => setForm({ ...form, min })} unit="min" min={0} />
          </Row>
          <Row>
            {(form.kind === 'bottle' || form.kind === 'solid') && <Num label="Amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} unit={s.unit === 'oz' && form.kind === 'bottle' ? 'oz' : form.kind === 'bottle' ? 'ml' : 'g / ml'} min={0} />}
            <Txt label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="optional" />
          </Row>
          <Btn kind="primary" disabled={!form.at || !(form.min >= 0)} onClick={() => {
            const start = new Date(form.at).getTime()
            if (!Number.isFinite(start)) return
            const ml = form.kind === 'bottle' ? fromUnit(form.amount) : form.kind === 'solid' ? form.amount : 0
            set({ feeds: [...s.feeds, { id: uid(), kind: form.kind, start, end: start + form.min * MIN, ml, note: form.note }] })
            setForm({ ...form, note: '' })
          }}>Add feed</Btn>
        </Panel>
        <Panel title="Settings">
          <Row>
            <Txt label="Baby's name" value={s.name} onChange={(name) => set({ name })} />
            <div className="k-field">
              <span className="k-label">Bottle unit</span>
              <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['ml', 'ml'], ['oz', 'fl oz']]} />
            </div>
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Everything stays in this browser. Use Backup to move the log to another device.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Last feed" value={last ? `${dur(now - last.start)} ago` : '—'} sub={last ? `${KINDS[last.kind].label} at ${hm(last.start)} · ${dur(last.end - last.start)}` : undefined} tone="accent" />
          <Stat label="Next side" value={KINDS[nextSide].label.split(' ')[0]} sub={lastBreast ? `Last: ${KINDS[lastBreast.kind].label.toLowerCase()}` : undefined} />
          <Stat label="Feeds (24 h)" value={last24.length} sub={Number.isFinite(avgGap) ? `every ${dur(avgGap)} on average` : undefined} />
          <Stat label="Nursing / bottle (24 h)" value={dur(nurse24)} sub={`${amt(ml24)} from bottles`} />
        </Stats>
        <Panel title="Last 24 hours">
          <div style={{ position: 'relative', height: 34, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)', overflow: 'hidden' }}>
            {last24.map((f) => (
              <div key={f.id} title={`${KINDS[f.kind].label} ${hm(f.start)} · ${dur(f.end - f.start)}`} style={{ position: 'absolute', top: 4, bottom: 4, left: `${((f.start - (now - DAY)) / DAY) * 100}%`, width: `max(4px, ${((f.end - f.start) / DAY) * 100}%)`, background: KINDS[f.kind].color, borderRadius: 3 }} />
            ))}
            {s.active && <div style={{ position: 'absolute', top: 4, bottom: 4, right: 0, width: `max(4px, ${((now - s.active.start) / DAY) * 100}%)`, background: KINDS[s.active.kind].color, opacity: 0.6 }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
            <span>{hm(now - DAY)}</span><span>{hm(now - DAY * 0.75)}</span><span>{hm(now - DAY / 2)}</span><span>{hm(now - DAY / 4)}</span><span>now</span>
          </div>
        </Panel>
        <Panel title="Daily nursing minutes (7 days)">
          <BarChart
            bars={days.map((k) => ({ label: label(k), value: [per(k, (x) => (x.kind === 'left' ? (x.end - x.start) / MIN : 0)), per(k, (x) => (x.kind === 'right' ? (x.end - x.start) / MIN : 0))] }))}
            stacks={[{ name: 'Left', color: KINDS.left.color }, { name: 'Right', color: KINDS.right.color }]}
            fy={(v) => `${Math.round(v)}`}
            height={200}
          />
        </Panel>
        <Panel title={`Daily bottle volume (${s.unit})`}>
          <BarChart bars={days.map((k) => ({ label: label(k), value: toUnit(per(k, (x) => (x.kind === 'bottle' ? x.ml : 0))), color: KINDS.bottle.color }))} fy={(v) => `${Math.round(v)}`} height={180} />
        </Panel>
        <Panel
          title={`Log (${s.feeds.length})`}
          actions={
            <>
              <CsvButton name="feeds.csv" rows={() => [['Type', 'Start', 'End', 'Minutes', 'Amount ml', 'Note'], ...feeds.map((f) => [KINDS[f.kind].label, new Date(f.start).toISOString(), new Date(f.end).toISOString(), Math.round((f.end - f.start) / MIN), Math.round(f.ml), f.note])]} />
              <JsonButtons name="baby-feeds.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.feeds)) set({ ...DEF, ...d })
              }} />
            </>
          }
        >
          <Table
            max={40}
            head={['When', 'Type', 'Duration', 'Amount', 'Note', '']}
            rows={feeds.map((f) => [
              new Date(f.start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
              <span key="k" style={{ color: KINDS[f.kind].color, fontWeight: 700 }}>{KINDS[f.kind].icon} {KINDS[f.kind].label}</span>,
              dur(f.end - f.start),
              f.kind === 'bottle' ? (
                <span key="a" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    value={Math.round(toUnit(f.ml) * 10) / 10}
                    onChange={(e) => set({ feeds: s.feeds.map((x) => (x.id === f.id ? { ...x, ml: Math.max(0, fromUnit(Number(e.target.value) || 0)) } : x)) })}
                    aria-label="Bottle amount"
                    style={{ width: 70, borderColor: f.ml ? undefined : 'var(--warn)' }}
                  />
                  {s.unit}
                </span>
              ) : f.ml ? `${Math.round(f.ml)} g` : '',
              f.note,
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ feeds: s.feeds.filter((x) => x.id !== f.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
        <Note tone="warn">A log to help you notice patterns, not medical advice. Ask your pediatrician or midwife about how much and how often your baby should feed.</Note>
      </div>
    </Split>
  )
}
