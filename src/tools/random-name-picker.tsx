import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, color, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'

interface ClassList { id: string; name: string; text: string }
interface Pick { name: string; list: string; at: number }
interface State {
  lists: ClassList[]
  active: string
  noRepeat: boolean
  sound: boolean
  picked: Record<string, string[]>
  history: Pick[]
  groupSize: number
}

const DEF: State = {
  lists: [
    { id: 'c7a', name: 'Class 7A', text: 'Amelia Brooks\nNoah Fischer\nSofia Rossi\nLiam O’Connor\nMia Novak\nLucas Moreau\nAva Kowalski\nEthan Silva\nIsla Schmidt\nOliver Jensen\nChloe Martin\nMateo García\nZoe Petrov\nLeo Andersen\nGrace Kim\nHenry Walsh' },
    { id: 'club', name: 'Robotics club', text: 'Yuki\nPriya\nMarcus\nElena\nTomás\nFatima\nJonas\nAisha' },
  ],
  active: 'c7a',
  noRepeat: true,
  sound: true,
  picked: {},
  history: [],
  groupSize: 4,
}

const parseNames = (t: string) => [...new Set(t.split(/\r?\n|,|;/).map((x) => x.trim()).filter(Boolean))]
/** Unbiased integer in [0, n) from the crypto RNG. */
function randInt(n: number) {
  const a = new Uint32Array(1)
  const lim = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(a)
  while (a[0] >= lim)
  return a[0] % n
}
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function drawWheel(c: HTMLCanvasElement, names: string[], rot: number, winner: number | null) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const S = c.clientWidth
  c.width = S * dpr
  c.height = S * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const cx = S / 2, cy = S / 2, R = S / 2 - 14
  const n = Math.max(1, names.length)
  const seg = (Math.PI * 2) / n
  if (!names.length) {
    g.fillStyle = '#94a3b833'
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.fill()
  }
  names.forEach((nm, i) => {
    const a0 = rot + i * seg
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, R, a0, a0 + seg)
    g.closePath()
    g.fillStyle = color(n > 1 && i === n - 1 && i % 12 === 0 ? 5 : i)
    g.globalAlpha = winner === null || winner === i ? 1 : 0.45
    g.fill()
    g.globalAlpha = 1
    g.strokeStyle = '#ffffff'
    g.lineWidth = 2
    g.stroke()
    g.save()
    g.translate(cx, cy)
    g.rotate(a0 + seg / 2)
    g.fillStyle = '#ffffff'
    const fs = Math.max(9, Math.min(18, (seg * R) / 2.2, 300 / Math.max(6, nm.length)))
    g.font = `600 ${fs}px system-ui, sans-serif`
    g.textAlign = 'right'
    g.textBaseline = 'middle'
    const txt = nm.length > 18 ? nm.slice(0, 17) + '…' : nm
    if (n <= 80) g.fillText(txt, R - 12, 0)
    g.restore()
  })
  // hub
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(cx, cy, 22, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#0f172a'
  g.beginPath()
  g.arc(cx, cy, 8, 0, Math.PI * 2)
  g.fill()
  // pointer at the top
  g.fillStyle = '#0f172a'
  g.strokeStyle = '#ffffff'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(cx - 14, 2)
  g.lineTo(cx + 14, 2)
  g.lineTo(cx, 30)
  g.closePath()
  g.fill()
  g.stroke()
}

export default function RandomNamePicker() {
  const [s, set, reset] = useToolState('random-name-picker', DEF)
  const list = s.lists.find((l) => l.id === s.active) ?? s.lists[0]
  const all = parseNames(list?.text ?? '')
  const picked = (s.picked[list?.id ?? ''] ?? []).filter((n) => all.includes(n))
  const pool = s.noRepeat ? all.filter((n) => !picked.includes(n)) : all
  const [winner, setWinner] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [mode, setMode] = useState<'wheel' | 'groups'>('wheel')
  const [groups, setGroups] = useState<string[][]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  const rot = useRef(-Math.PI / 2)
  const audio = useRef<AudioContext | null>(null)
  const poolKey = pool.join('\n')

  useEffect(() => {
    if (!canvas.current || spinning) return
    drawWheel(canvas.current, pool, rot.current, winner ? pool.indexOf(winner) : null)
    const ro = new ResizeObserver(() => canvas.current && drawWheel(canvas.current, pool, rot.current, null))
    ro.observe(canvas.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey, spinning, winner, mode])

  const tick = () => {
    if (!s.sound) return
    try {
      const ac = audio.current ?? (audio.current = new AudioContext())
      const o = ac.createOscillator(), gn = ac.createGain()
      o.frequency.value = 1400
      gn.gain.setValueAtTime(0.08, ac.currentTime)
      gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.03)
      o.connect(gn).connect(ac.destination)
      o.start()
      o.stop(ac.currentTime + 0.04)
    } catch {
      /* audio not allowed */
    }
  }

  const spin = () => {
    if (spinning || !pool.length || !list) return
    const names = pool
    const i = randInt(names.length)
    const seg = (Math.PI * 2) / names.length
    const u = 0.15 + Math.random() * 0.7
    const desired = -Math.PI / 2 - (i + u) * seg
    const from = rot.current
    const delta = (((desired - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const to = from + Math.PI * 2 * (5 + randInt(3)) + delta
    const dur = 4200
    const t0 = performance.now()
    let lastSeg = Math.floor((-Math.PI / 2 - from) / seg)
    setWinner(null)
    setSpinning(true)
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur)
      const e = 1 - Math.pow(1 - k, 4)
      rot.current = from + (to - from) * e
      const cur = Math.floor((-Math.PI / 2 - rot.current) / seg)
      if (cur !== lastSeg) { lastSeg = cur; tick() }
      if (canvas.current) drawWheel(canvas.current, names, rot.current, null)
      if (k < 1) requestAnimationFrame(step)
      else {
        rot.current = to % (Math.PI * 2)
        const name = names[i]
        setWinner(name)
        setSpinning(false)
        set((st) => ({
          ...st,
          picked: { ...st.picked, [list.id]: [...(st.picked[list.id] ?? []), name] },
          history: [{ name, list: list.name, at: Date.now() }, ...st.history].slice(0, 200),
        }))
      }
    }
    requestAnimationFrame(step)
  }

  const quickPick = () => {
    if (!pool.length || !list) return
    const name = pool[randInt(pool.length)]
    setWinner(name)
    set((st) => ({ ...st, picked: { ...st.picked, [list.id]: [...(st.picked[list.id] ?? []), name] }, history: [{ name, list: list.name, at: Date.now() }, ...st.history].slice(0, 200) }))
  }

  const editList = (patch: Partial<ClassList>) => set({ lists: s.lists.map((l) => (l.id === list.id ? { ...l, ...patch } : l)) })
  const resetRound = () => { setWinner(null); set({ picked: { ...s.picked, [list.id]: [] } }) }
  const counts = new Map<string, number>()
  for (const h of s.history) if (h.list === list?.name) counts.set(h.name, (counts.get(h.name) ?? 0) + 1)

  const makeGroups = () => {
    const sh = shuffle(all)
    const k = Math.max(1, Math.round(sh.length / Math.max(1, s.groupSize)))
    const out: string[][] = Array.from({ length: k }, () => [])
    sh.forEach((n, i) => out[i % k].push(n))
    setGroups(out)
  }

  return (
    <Split>
      <div>
        <Panel
          title="Class lists"
          actions={<Btn onClick={() => { const id = uid(); set({ lists: [...s.lists, { id, name: `List ${s.lists.length + 1}`, text: '' }], active: id }) }}>+ List</Btn>}
        >
          <Row>
            {s.lists.map((l) => (
              <Btn key={l.id} kind={l.id === list?.id ? 'primary' : 'normal'} onClick={() => { setWinner(null); set({ active: l.id }) }}>{l.name}</Btn>
            ))}
          </Row>
          {list && (
            <>
              <label className="k-field">
                <span className="k-label">List name</span>
                <input className="k-text" value={list.name} onChange={(e) => editList({ name: e.target.value })} />
              </label>
              <Area label={`Names — one per line (${all.length})`} value={list.text} onChange={(text) => editList({ text })} rows={10} />
              <Row>
                <Btn kind="ghost" onClick={() => editList({ text: shuffle(all).join('\n') })}>Shuffle order</Btn>
                <Btn kind="ghost" onClick={() => editList({ text: [...all].sort((a, b) => a.localeCompare(b)).join('\n') })}>Sort A→Z</Btn>
                <Btn kind="danger" disabled={s.lists.length < 2} onClick={() => set({ lists: s.lists.filter((l) => l.id !== list.id), active: s.lists.find((l) => l.id !== list.id)!.id })}>Delete list</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Options">
          <Check label="No repeats — each name once per round" value={s.noRepeat} onChange={(noRepeat) => set({ noRepeat })} />
          <Check label="Tick sound while spinning" value={s.sound} onChange={(sound) => set({ sound })} />
          <Row>
            <JsonButtons name="class-lists.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Students" value={all.length} />
          <Stat label="Still to pick" value={pool.length} sub={s.noRepeat ? 'this round' : 'repeats allowed'} tone="accent" />
          <Stat label="Picked this round" value={picked.length} />
          <Stat label="Chance per spin" value={pool.length ? `${(100 / pool.length).toFixed(1)}%` : '—'} />
        </Stats>
        <Panel title={mode === 'wheel' ? 'Spin the wheel' : 'Random groups'} actions={<Seg value={mode} onChange={setMode} options={[['wheel', 'Wheel'], ['groups', 'Groups']]} />}>
          {mode === 'wheel' ? (
            <>
              <div style={{ maxWidth: 440, margin: '0 auto', position: 'relative' }}>
                <canvas ref={canvas} onClick={spin} style={{ width: '100%', aspectRatio: '1', display: 'block', cursor: pool.length ? 'pointer' : 'default' }} aria-label="Name wheel, click to spin" />
              </div>
              <div style={{ textAlign: 'center', minHeight: 56, margin: '8px 0' }}>
                {winner && !spinning && <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)' }}>🎉 {winner}</div>}
                {spinning && <div className="muted" style={{ fontSize: 20 }}>Spinning…</div>}
              </div>
              <Row>
                <Btn kind="primary" disabled={spinning || !pool.length} onClick={spin}>🎡 Spin</Btn>
                <Btn disabled={spinning || !pool.length} onClick={quickPick}>⚡ Instant pick</Btn>
                <Btn kind="ghost" disabled={spinning || !picked.length} onClick={resetRound}>↺ New round</Btn>
              </Row>
              {!pool.length && all.length > 0 && <Note tone="ok">Everyone has had a turn. Start a new round to put all names back on the wheel.</Note>}
              {!all.length && <Note tone="warn">Add some names to the list first.</Note>}
            </>
          ) : (
            <>
              <Row>
                <Num label="People per group" value={s.groupSize} onChange={(groupSize) => set({ groupSize: Math.max(1, Math.round(groupSize)) })} min={1} max={50} />
                <Btn kind="primary" onClick={makeGroups} disabled={!all.length}>🔀 Make groups</Btn>
              </Row>
              {groups.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                  {groups.map((g, i) => (
                    <div key={i} style={{ border: '1px solid var(--line)', borderTop: `4px solid ${color(i)}`, borderRadius: 10, padding: '8px 10px' }}>
                      <b>Group {i + 1}</b> <span className="muted">({g.length})</span>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{g.map((n) => <li key={n}>{n}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}
              {groups.length > 0 && <CsvButton name="groups.csv" rows={() => [['Group', 'Name'], ...groups.flatMap((g, i) => g.map((n) => [i + 1, n]))]} />}
            </>
          )}
        </Panel>
        <Panel title="History" actions={<><CsvButton name="picks.csv" rows={() => [['Time', 'List', 'Name'], ...s.history.map((h) => [new Date(h.at).toLocaleString(), h.list, h.name])]} /><Btn kind="ghost" onClick={() => set({ history: [] })}>Clear</Btn></>}>
          {s.history.length ? (
            <Table
              max={12}
              head={['When', 'List', 'Name', 'Times picked']}
              rows={s.history.map((h) => [new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), h.list, <b key="n">{h.name}</b>, h.list === list?.name ? counts.get(h.name) ?? 0 : ''])}
            />
          ) : (
            <p className="muted">No picks yet — spin the wheel!</p>
          )}
        </Panel>
      </div>
    </Split>
  )
}
