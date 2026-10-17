import { useMemo, useState } from 'react'
import { Btn, FileDrop, JsonButtons, LineChart, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, color, today, uid, useToolState } from '../kit'

type Kind = 'water' | 'fertilize' | 'repot' | 'prune' | 'photo' | 'note'
interface Entry { id: string; date: string; kind: Kind; height?: number; photo?: string; note?: string }
interface Plant { id: string; name: string; species: string; spot: string; water: number; feed: number; entries: Entry[] }
interface State { plants: Plant[]; sel: string }

const KINDS: [Kind, string][] = [['water', '💧 Watered'], ['fertilize', '🌱 Fertilized'], ['repot', '🪴 Repotted'], ['prune', '✂️ Pruned'], ['photo', '📷 Photo / measure'], ['note', '📝 Note']]
const ICON: Record<Kind, string> = { water: '💧', fertilize: '🌱', repot: '🪴', prune: '✂️', photo: '📷', note: '📝' }

const DAY = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const ago = (d: number) => iso(Date.now() - d * DAY)
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/** Demo photos are drawn procedurally: "demo:<hue>:<height>". */
function demoPhoto(hue: number, h: number): string {
  const W = 240, H = 300
  const leaves = Math.round(3 + h / 6)
  const top = 230 - h * 3.2
  let g = ''
  for (let i = 0; i < leaves; i++) {
    const y = 225 - ((225 - top) * (i + 1)) / leaves
    const side = i % 2 ? 1 : -1
    const len = 22 + Math.min(40, h * 0.9) * (1 - i / leaves / 2)
    g += `<ellipse cx="${120 + side * len * 0.55}" cy="${y}" rx="${len * 0.6}" ry="${len * 0.25}" fill="hsl(${hue},55%,${32 + (i % 3) * 6}%)" transform="rotate(${side * -25} ${120 + side * len * 0.55} ${y})"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4efe6"/><rect y="200" width="${W}" height="100" fill="#e7dccb"/><path d="M120 230 L120 ${top}" stroke="hsl(${hue},45%,28%)" stroke-width="5"/>${g}<path d="M80 225 L160 225 L150 285 L90 285Z" fill="#c4683b"/><rect x="74" y="218" width="92" height="14" rx="3" fill="#a9532b"/><text x="10" y="20" font-family="sans-serif" font-size="13" fill="#7a6a55">${h} cm</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
const src = (p: string) => {
  const m = /^demo:(\d+):(\d+)$/.exec(p)
  return m ? demoPhoto(Number(m[1]), Number(m[2])) : p
}

function demo(): State {
  const mkLog = (water: number, feed: number, hue: number, h0: number, gain: number): Entry[] => {
    const out: Entry[] = []
    for (let d = 84; d >= 0; d -= water) out.push({ id: uid(), date: ago(d + 1), kind: 'water' })
    for (let d = 80; d >= 0; d -= feed) out.push({ id: uid(), date: ago(d + 2), kind: 'fertilize' })
    for (let w = 0; w <= 4; w++) {
      const h = Math.round(h0 + gain * w)
      out.push({ id: uid(), date: ago(84 - w * 21), kind: 'photo', height: h, photo: `demo:${hue}:${h}` })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }
  const plants: Plant[] = [
    { id: 'monstera', name: 'Monty', species: 'Monstera deliciosa', spot: 'Living room, east window', water: 7, feed: 28, entries: mkLog(7, 28, 130, 22, 5) },
    { id: 'basil', name: 'Kitchen basil', species: 'Ocimum basilicum', spot: 'Kitchen sill', water: 2, feed: 14, entries: mkLog(3, 14, 105, 8, 4) },
    { id: 'snake', name: 'Snake plant', species: 'Dracaena trifasciata', spot: 'Bedroom', water: 14, feed: 60, entries: mkLog(14, 60, 90, 30, 1.5) },
  ]
  plants[0].entries.push({ id: uid(), date: ago(40), kind: 'repot', note: 'Moved to 24 cm pot with chunky aroid mix' })
  return { plants, sel: 'monstera' }
}
const DEF = demo()

/** Downscale an image file to a ~480 px JPEG data URL to keep storage small. */
async function shrink(f: File): Promise<string> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.72)
}

const last = (p: Plant, k: Kind) => p.entries.filter((e) => e.kind === k).map((e) => e.date).sort().at(-1)
function due(p: Plant, k: 'water' | 'fertilize') {
  const l = last(p, k)
  const every = k === 'water' ? p.water : p.feed
  const next = l ? iso(Date.parse(l) + every * DAY) : today()
  return { last: l, next, inDays: days(today(), next) }
}

export default function PlantCareJournal() {
  const [s, set] = useToolState('plant-care-journal', DEF)
  const plant = s.plants.find((p) => p.id === s.sel) ?? s.plants[0]
  const [kind, setKind] = useState<Kind>('water')
  const [date, setDate] = useState(today())
  const [height, setHeight] = useState(0)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState('')
  const [cmp, setCmp] = useState(50)
  const [pair, setPair] = useState<[number, number]>([0, -1])

  const updPlant = (patch: Partial<Plant>) => set({ plants: s.plants.map((p) => (p.id === plant.id ? { ...p, ...patch } : p)) })
  const log = (k: Kind, p = plant) => set({ plants: s.plants.map((x) => (x.id === p.id ? { ...x, entries: [...x.entries, { id: uid(), date: today(), kind: k }] } : x)) })
  const addEntry = () => {
    const e: Entry = { id: uid(), date, kind, ...(height > 0 ? { height } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(photo ? { photo } : {}) }
    updPlant({ entries: [...plant.entries, e].sort((a, b) => a.date.localeCompare(b.date)) })
    setNote('')
    setPhoto('')
    setHeight(0)
  }

  const photos = useMemo(() => (plant?.entries ?? []).filter((e) => e.photo), [plant])
  const heights = (plant?.entries ?? []).filter((e) => e.height).map((e) => [days(plant.entries[0].date, e.date), e.height!] as [number, number])
  const reminders = s.plants
    .flatMap((p) => (['water', 'fertilize'] as const).map((k) => ({ p, k, ...due(p, k) })))
    .sort((a, b) => a.inDays - b.inDays)

  if (!plant) {
    return (
      <Panel title="Plant Care Journal">
        <Note>No plants yet.</Note>
        <Btn kind="primary" onClick={() => set(demo())}>Load sample plants</Btn>
      </Panel>
    )
  }
  const a = photos[Math.min(pair[0], photos.length - 1)]
  const b = photos.at(pair[1] < 0 ? -1 : Math.min(pair[1], photos.length - 1))
  const growth = heights.length > 1 ? heights[heights.length - 1][1] - heights[0][1] : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Care reminders">
          {reminders.slice(0, 8).map((r) => (
            <div key={r.p.id + r.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 20 }}>{ICON[r.k]}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{r.p.name}</b> <span className="muted">— {r.k === 'water' ? 'water' : 'feed'}</span>
                <div style={{ fontSize: 12, color: r.inDays < 0 ? 'var(--err)' : r.inDays === 0 ? 'var(--warn)' : 'var(--muted)' }}>
                  {r.inDays < 0 ? `${-r.inDays} day(s) overdue` : r.inDays === 0 ? 'due today' : `in ${r.inDays} day(s) · ${r.next}`}
                </div>
              </span>
              {r.inDays <= 1 && <Btn onClick={() => log(r.k, r.p)}>Done</Btn>}
            </div>
          ))}
        </Panel>
        <Panel title="My plants" actions={<Btn onClick={() => { const id = uid(); set({ plants: [...s.plants, { id, name: 'New plant', species: '', spot: '', water: 7, feed: 30, entries: [] }], sel: id }) }}>+ Plant</Btn>}>
          <div style={{ display: 'grid', gap: 6 }}>
            {s.plants.map((p, i) => {
              const w = due(p, 'water')
              const ph = p.entries.filter((e) => e.photo).at(-1)
              return (
                <button key={p.id} className="k-btn" onClick={() => set({ sel: p.id })} style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', borderColor: p.id === plant.id ? 'var(--accent)' : undefined, borderLeft: `4px solid ${color(i)}` }}>
                  {ph ? <img src={src(ph.photo!)} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ fontSize: 28 }}>🪴</span>}
                  <span style={{ flex: 1 }}>
                    <b>{p.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{p.species || 'species?'} · 💧 {w.inDays < 0 ? 'overdue' : w.inDays === 0 ? 'today' : `in ${w.inDays}d`}</div>
                  </span>
                </button>
              )
            })}
          </div>
          <Row>
            <JsonButtons name="plant-journal.json" data={s} onLoad={(d) => d && Array.isArray(d.plants) && set(d)} />
            <Btn kind="ghost" onClick={() => set(demo())}>Sample data</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Everything is stored in this browser (photos are downscaled). Use Backup to keep a copy.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Last watered" value={due(plant, 'water').last ? `${days(due(plant, 'water').last!, today())} d ago` : '—'} sub={`every ${plant.water} days`} />
          <Stat label="Next watering" value={due(plant, 'water').next} tone={due(plant, 'water').inDays < 0 ? 'bad' : 'accent'} />
          <Stat label="Next feeding" value={due(plant, 'fertilize').next} sub={`every ${plant.feed} days`} />
          <Stat label="Growth" value={heights.length ? `${heights[heights.length - 1][1]} cm` : '—'} sub={growth ? `+${growth} cm since first measure` : undefined} tone="good" />
        </Stats>
        <Panel title={`🪴 ${plant.name}`} actions={<Btn kind="danger" onClick={() => { if (confirm(`Delete ${plant.name}?`)) set({ plants: s.plants.filter((p) => p.id !== plant.id), sel: s.plants.find((p) => p.id !== plant.id)?.id ?? '' }) }}>Delete</Btn>}>
          <Row>
            <Txt label="Name" value={plant.name} onChange={(name) => updPlant({ name })} />
            <Txt label="Species" value={plant.species} onChange={(species) => updPlant({ species })} />
            <Txt label="Location" value={plant.spot} onChange={(spot) => updPlant({ spot })} />
          </Row>
          <Row>
            <Num label="Water every" value={plant.water} onChange={(water) => updPlant({ water: Math.max(1, water) })} unit="days" min={1} />
            <Num label="Fertilize every" value={plant.feed} onChange={(feed) => updPlant({ feed: Math.max(1, feed) })} unit="days" min={1} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => log('water')}>💧 Watered today</Btn>
            <Btn onClick={() => log('fertilize')}>🌱 Fed today</Btn>
          </Row>
        </Panel>
        {photos.length > 0 && (
          <Panel title="Growth comparison">
            {photos.length > 1 && (
              <Row>
                <Select label="Before" value={pair[0]} onChange={(v) => setPair([v, pair[1]])} options={photos.map((p, i) => [i, `${p.date}${p.height ? ` · ${p.height} cm` : ''}`] as [number, string])} />
                <Select label="After" value={pair[1] < 0 ? photos.length - 1 : pair[1]} onChange={(v) => setPair([pair[0], v])} options={photos.map((p, i) => [i, `${p.date}${p.height ? ` · ${p.height} cm` : ''}`] as [number, string])} />
              </Row>
            )}
            <div style={{ position: 'relative', maxWidth: 340, margin: '0 auto', aspectRatio: '4 / 5', borderRadius: 10, overflow: 'hidden', background: 'var(--panel2)' }}>
              <img src={src(b!.photo!)} alt="after" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <img src={src(a!.photo!)} alt="before" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - cmp}% 0 0)` }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${cmp}%`, width: 3, background: '#fff', boxShadow: '0 0 4px #0008' }} />
              <span style={{ position: 'absolute', left: 8, bottom: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>{a!.date}</span>
              <span style={{ position: 'absolute', right: 8, bottom: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>{b!.date}</span>
            </div>
            <input type="range" min={0} max={100} value={cmp} onChange={(e) => setCmp(Number(e.target.value))} aria-label="Compare slider" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '8px auto' }} />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {photos.map((p, i) => (
                <figure key={p.id} style={{ margin: 0, flex: 'none', textAlign: 'center', fontSize: 11 }} className="muted">
                  <img src={src(p.photo!)} alt={p.date} onClick={() => setPair([pair[0], i])} style={{ width: 72, height: 90, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--line)' }} />
                  <figcaption>{p.date.slice(5)}{p.height ? ` · ${p.height}cm` : ''}</figcaption>
                </figure>
              ))}
            </div>
          </Panel>
        )}
        {heights.length > 1 && (
          <Panel title="Height over time">
            <LineChart height={180} series={[{ name: 'Height', points: heights, area: true, color: '#10b981' }]} xLabel="days since first entry" fy={(v) => `${v} cm`} />
          </Panel>
        )}
        <Panel title="Add journal entry">
          <Row>
            <Select label="Type" value={kind} onChange={setKind} options={KINDS} />
            <Txt label="Date" type="date" value={date} onChange={setDate} />
            <Num label="Height (optional)" value={height} onChange={setHeight} unit="cm" min={0} />
          </Row>
          <Txt label="Note" value={note} onChange={setNote} placeholder="New leaf unfurling, yellow tips…" />
          {photo ? (
            <Row>
              <img src={photo} alt="new" style={{ height: 80, borderRadius: 6 }} />
              <Btn kind="ghost" onClick={() => setPhoto('')}>Remove photo</Btn>
            </Row>
          ) : (
            <FileDrop accept="image/*" onFiles={async ([f]) => { try { setPhoto(await shrink(f)); setKind('photo') } catch { /* not an image */ } }} label="Add a photo (optional)" />
          )}
          <Btn kind="primary" onClick={addEntry} disabled={!date}>Save entry</Btn>
        </Panel>
        <Panel title="Journal">
          <Table
            max={30}
            head={['Date', 'Entry', 'Details', '']}
            rows={[...plant.entries].reverse().map((e) => [
              e.date,
              `${ICON[e.kind]} ${e.kind}`,
              <span key="d">{e.height ? <b>{e.height} cm </b> : null}{e.note}{e.photo ? ' 📷' : ''}</span>,
              <Btn key="x" kind="ghost" title="Delete entry" onClick={() => updPlant({ entries: plant.entries.filter((x) => x.id !== e.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
