import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Stat, Stats, Table, Txt, color, uid, useToolState } from '../kit'
import { clock, compliance, fmtDur, nextPosition, POSITIONS, status, type Level, type Position, type Room, type Turn } from './lib/repositioning-turn-timer'

const SKIN = ['Intact', 'Redness – blanching', 'Redness – non-blanching', 'Broken skin', 'Not checked'] as const
const M = 60000

interface State { rooms: Room[]; log: Turn[]; warn: number; grace: number; notify: boolean; sound: boolean; by: string }

function sample(): State {
  const now = Date.now()
  const rot: Position[] = ['Left 30°', 'Supine', 'Right 30°', 'Supine']
  const rooms: Room[] = [
    { id: 'a', label: 'Room 101 · Bed A', interval: 120, position: 'Left 30°', last: now - 38 * M, rotation: rot, paused: false, note: 'Heel offloading boots' },
    { id: 'b', label: 'Room 101 · Bed B', interval: 120, position: 'Supine', last: now - 109 * M, rotation: rot, paused: false, note: '' },
    { id: 'c', label: 'Room 104', interval: 90, position: 'Right 30°', last: now - 96 * M, rotation: ['Left 30°', 'Right 30°'], paused: false, note: 'Air mattress' },
    { id: 'd', label: 'Room 107 · Bed A', interval: 180, position: 'Semi-Fowler', last: now - 20 * M, rotation: ['Semi-Fowler', 'Left 30°', 'Right 30°'], paused: false, note: '' },
    { id: 'e', label: 'Room 110', interval: 120, position: 'Chair', last: now - 70 * M, rotation: ['Chair', 'Supine', 'Left 30°', 'Right 30°'], paused: true, note: 'Off unit (imaging)' },
  ]
  const log: Turn[] = []
  for (const r of rooms) {
    let at = r.last, pos = r.position
    for (let k = 0; k < 5; k++) {
      const prev = r.rotation[(r.rotation.indexOf(pos) - 1 + r.rotation.length) % r.rotation.length] ?? pos
      log.push({ id: uid(), room: r.id, label: r.label, at, from: prev, to: pos, skin: k === 2 && r.id === 'b' ? 'Redness – blanching' : 'Intact', by: ['JS', 'AK', 'MT'][k % 3] })
      at -= (r.interval + (k === 1 && r.id === 'c' ? 35 : (k * 7) % 12) - 6) * M
      pos = prev
    }
  }
  return { rooms, log: log.sort((a, b) => b.at - a.at), warn: 15, grace: 15, notify: false, sound: true, by: '' }
}
const DEF = sample()

const TONE: Record<Level, { bg: string; fg: string; text: string }> = {
  ok: { bg: 'rgba(16,185,129,.12)', fg: '#059669', text: 'On schedule' },
  soon: { bg: 'rgba(245,158,11,.16)', fg: '#d97706', text: 'Due soon' },
  due: { bg: 'rgba(239,68,68,.16)', fg: '#dc2626', text: 'Due now' },
  overdue: { bg: 'rgba(239,68,68,.28)', fg: '#b91c1c', text: 'Overdue' },
  paused: { bg: 'var(--panel2)', fg: 'var(--muted)', text: 'Paused' },
}
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function RepositioningTurnTimer() {
  const [s, set, reset] = useToolState('repositioning-turn-timer', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [turning, setTurning] = useState<{ id: string; to: Position; skin: string; ago: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const notified = useRef(new Set<string>())
  const audio = useRef<AudioContext | null>(null)
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const st = s.rooms.map((r) => ({ r, ...status(r, now, s.warn, s.grace) }))
  const dueN = st.filter((x) => x.level === 'due' || x.level === 'overdue').length
  const soonN = st.filter((x) => x.level === 'soon').length

  // alerts: browser notification + beep once per room per due cycle and level
  useEffect(() => {
    document.title = dueN ? `(${dueN} due) Repositioning Turn Timer` : 'Repositioning Turn Timer'
    for (const x of st) {
      if (x.level !== 'soon' && x.level !== 'due') continue
      const key = `${x.r.id}:${x.r.last}:${x.level}`
      if (notified.current.has(key)) continue
      notified.current.add(key)
      if (s.notify && perm === 'granted') new Notification(x.level === 'due' ? `Turn due: ${x.r.label}` : `Turn due soon: ${x.r.label}`, { body: `Next position: ${nextPosition(x.r.position, x.r.rotation)}`, tag: x.r.id })
      if (s.sound && audio.current) {
        const a = audio.current, o = a.createOscillator(), g = a.createGain()
        o.frequency.value = x.level === 'due' ? 880 : 660
        g.gain.setValueAtTime(0.0001, a.currentTime)
        g.gain.exponentialRampToValueAtTime(0.3, a.currentTime + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6)
        o.connect(g).connect(a.destination)
        o.start()
        o.stop(a.currentTime + 0.65)
      }
    }
  })
  useEffect(() => () => {
    document.title = 'Browser Toolbox'
  }, [])

  const enableAlerts = async () => {
    audio.current ??= new AudioContext()
    if (perm !== 'unsupported' && Notification.permission === 'default') await Notification.requestPermission()
    set({ notify: true })
  }

  const edit = (id: string, p: Partial<Room>) => set((x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const confirmTurn = () => {
    if (!turning) return
    const r = s.rooms.find((x) => x.id === turning.id)
    if (!r) return
    const at = Date.now() - turning.ago * M
    const t: Turn = { id: uid(), room: r.id, label: r.label, at, from: r.position, to: turning.to, skin: turning.skin, by: s.by.trim() }
    set((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === r.id ? { ...y, position: turning.to, last: at } : y)), log: [t, ...x.log].sort((a, b) => b.at - a.at).slice(0, 3000) }))
    setTurning(null)
  }

  const comp = s.rooms.map((r) => compliance(s.log, r.id, r.interval, now - 24 * 60 * M, now, s.grace))
  const onTime = comp.reduce((a, c) => a + c.onTime, 0), total = comp.reduce((a, c) => a + c.total, 0)

  // 12-hour timeline
  const T0 = now - 12 * 60 * M, W = 760, rowH = 26, L = 130
  const tx = (t: number) => L + ((t - T0) / (12 * 60 * M)) * (W - L - 10)

  return (
    <div>
      <Stats>
        <Stat label="Beds tracked" value={s.rooms.length} sub={`${s.rooms.filter((r) => r.paused).length} paused`} />
        <Stat label="Due / overdue" value={dueN} tone={dueN ? 'bad' : 'good'} sub={dueN ? 'turn these first' : 'all on schedule'} />
        <Stat label="Due soon" value={soonN} sub={`within ${s.warn} min`} tone={soonN ? 'accent' : undefined} />
        <Stat label="On time (24 h)" value={total ? `${Math.round((100 * onTime) / total)}%` : '—'} sub={`${onTime} of ${total} intervals ≤ schedule + ${s.grace} min`} />
      </Stats>
      <Note tone="warn">Workflow aid only — follow your facility's pressure-injury protocol. Alerts work <b>only while this tab is open</b> (and the device is awake). Use room/bed labels only; no patient names or identifiers are needed. Data stays in this browser.</Note>
      <Panel title="Beds" actions={<>
        <Btn kind="primary" onClick={() => set((x) => ({ ...x, rooms: [...x.rooms, { id: uid(), label: `Room ${100 + x.rooms.length + 1}`, interval: 120, position: 'Supine', last: Date.now(), rotation: ['Left 30°', 'Supine', 'Right 30°', 'Supine'], paused: false, note: '' }] }))}>+ Bed</Btn>
        {s.notify && perm !== 'denied' ? <Btn onClick={() => set({ notify: false })}>🔔 Alerts on</Btn> : <Btn onClick={enableAlerts}>🔕 Enable alerts</Btn>}
      </>}>
        {perm === 'denied' && s.notify && <Note tone="err">Notifications are blocked for this site; the in-page sound and colours still work.</Note>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {[...st].sort((a, b) => (a.level === 'paused' ? 1 : 0) - (b.level === 'paused' ? 1 : 0) || a.left - b.left).map(({ r, left, due, level }) => {
            const tone = TONE[level]
            const nxt = nextPosition(r.position, r.rotation)
            return (
              <div key={r.id} style={{ border: `2px solid ${tone.fg}`, background: tone.bg, borderRadius: 12, padding: 12, animation: level === 'overdue' ? 'pulse 1.2s infinite' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b>{r.label}</b>
                  <span style={{ color: tone.fg, fontWeight: 700, fontSize: 13 }}>{tone.text}</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: tone.fg }}>{level === 'paused' ? '— —' : clock(left)}</div>
                <div style={{ fontSize: 13 }}>Now: <b>{r.position}</b> since {time(r.last)} · every {fmtDur(r.interval * M)}</div>
                <div style={{ fontSize: 13 }}>Next: <b>{nxt}</b> at {time(due)}</div>
                {r.note && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>📝 {r.note}</div>}
                {turning?.id === r.id ? (
                  <div style={{ marginTop: 8 }}>
                    <Select label="Turned to" value={turning.to} onChange={(to) => setTurning({ ...turning, to })} options={POSITIONS} />
                    <Select label="Skin check" value={turning.skin} onChange={(skin) => setTurning({ ...turning, skin })} options={SKIN} />
                    <Row>
                      <Num label="Minutes ago" value={turning.ago} onChange={(ago) => setTurning({ ...turning, ago: Math.max(0, ago) })} min={0} max={240} />
                      <Txt label="Initials" value={s.by} onChange={(by) => set({ by: by.slice(0, 4) })} placeholder="optional" />
                    </Row>
                    <Row><Btn kind="primary" onClick={confirmTurn}>✓ Save turn</Btn><Btn kind="ghost" onClick={() => setTurning(null)}>Cancel</Btn></Row>
                  </div>
                ) : editing === r.id ? (
                  <div style={{ marginTop: 8 }}>
                    <Txt label="Room / bed label" value={r.label} onChange={(label) => edit(r.id, { label })} />
                    <Select label="Interval" value={r.interval} onChange={(interval) => edit(r.id, { interval })} options={[[60, '1 h'], [90, '1 h 30'], [120, '2 h'], [150, '2 h 30'], [180, '3 h'], [240, '4 h']]} />
                    <span className="k-label">Rotation</span>
                    <Row>{POSITIONS.map((p) => <Check key={p} label={p} value={r.rotation.includes(p)} onChange={(on) => edit(r.id, { rotation: on ? POSITIONS.filter((q) => q === p || r.rotation.includes(q)) : r.rotation.filter((q) => q !== p) })} />)}</Row>
                    <Txt label="Care note (no identifiers)" value={r.note} onChange={(note) => edit(r.id, { note })} />
                    <Check label="Paused (off unit, procedure…)" value={r.paused} onChange={(paused) => edit(r.id, { paused })} />
                    <Row><Btn onClick={() => setEditing(null)}>Done</Btn><Btn kind="danger" onClick={() => { set((x) => ({ ...x, rooms: x.rooms.filter((y) => y.id !== r.id) })); setEditing(null) }}>Remove bed</Btn></Row>
                  </div>
                ) : (
                  <Row>
                    <Btn kind="primary" onClick={() => setTurning({ id: r.id, to: nxt, skin: 'Intact', ago: 0 })}>↻ Turned</Btn>
                    <Btn kind="ghost" onClick={() => setEditing(r.id)}>Edit</Btn>
                  </Row>
                )}
              </div>
            )
          })}
        </div>
        <style>{'@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}'}</style>
        <Row>
          <Num label="“Due soon” warning" value={s.warn} onChange={(warn) => set({ warn: Math.max(0, warn) })} unit="min" min={0} max={60} />
          <Num label="Grace before “overdue”" value={s.grace} onChange={(grace) => set({ grace: Math.max(0, grace) })} unit="min" min={0} max={60} />
          <Check label="Beep when due" value={s.sound} onChange={(sound) => { audio.current ??= new AudioContext(); set({ sound }) }} />
        </Row>
      </Panel>
      <Panel title="Last 12 hours">
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${s.rooms.length * rowH + 24}`} style={{ width: '100%', minWidth: 560 }}>
            {Array.from({ length: 13 }, (_, i) => T0 + i * 60 * M).map((t, i) => (
              <g key={i}>
                <line x1={tx(t)} x2={tx(t)} y1={0} y2={s.rooms.length * rowH} stroke="var(--line)" />
                {i % 2 === 0 && <text x={tx(t)} y={s.rooms.length * rowH + 16} fontSize={11} textAnchor="middle" fill="var(--muted)">{time(t)}</text>}
              </g>
            ))}
            {s.rooms.map((r, i) => {
              const ts = s.log.filter((t) => t.room === r.id && t.at >= T0 - r.interval * M).sort((a, b) => a.at - b.at)
              const y = i * rowH + rowH / 2
              return (
                <g key={r.id}>
                  <text x={4} y={y + 4} fontSize={12} fill="var(--fg)">{r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label}</text>
                  {ts.map((t, k) => {
                    const end = k + 1 < ts.length ? ts[k + 1].at : now
                    const late = end - t.at > (r.interval + s.grace) * M
                    return <rect key={t.id} x={tx(Math.max(T0, t.at))} y={y - 7} width={Math.max(0, tx(end) - tx(Math.max(T0, t.at)))} height={14} rx={3} fill={color(POSITIONS.indexOf(t.to))} opacity={0.75} stroke={late ? '#ef4444' : 'none'} strokeWidth={2}><title>{`${t.to} from ${time(t.at)} (${fmtDur(end - t.at)})${late ? ' — longer than schedule' : ''}`}</title></rect>
                  })}
                </g>
              )
            })}
            <line x1={tx(now)} x2={tx(now)} y1={0} y2={s.rooms.length * rowH} stroke="var(--accent)" strokeWidth={2} />
          </svg>
        </div>
        <div className="k-legend">{POSITIONS.map((p, i) => <span key={p}><i style={{ background: color(i) }} />{p}</span>)}<span><i style={{ background: 'transparent', border: '2px solid #ef4444' }} />longer than schedule</span></div>
      </Panel>
      <Panel title="Turn log" actions={<>
        <CsvButton name="turn-log.csv" rows={() => [['Time', 'Bed', 'From', 'To', 'Skin', 'By'], ...s.log.map((t) => [new Date(t.at).toISOString(), t.label, t.from, t.to, t.skin, t.by])]} />
        <JsonButtons name="turn-timer-backup.json" data={s} onLoad={(d) => d && Array.isArray(d.rooms) && set(d)} />
        <Btn kind="ghost" onClick={() => confirm('Reset to the sample unit? Your beds and log will be replaced.') && reset()}>Reset</Btn>
      </>}>
        <Table head={['Time', 'Bed', 'Change', 'Skin', 'By']} max={40} rows={s.log.map((t) => [
          `${new Date(t.at).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time(t.at)}`, t.label, `${t.from} → ${t.to}`,
          <span key="s" style={{ color: t.skin.startsWith('Intact') ? undefined : t.skin === 'Not checked' ? 'var(--muted)' : 'var(--err)' }}>{t.skin}</span>, t.by || '—',
        ])} />
      </Panel>
    </div>
  )
}
