import { useState } from 'react'
import { Bar, Btn, CsvButton, FileDrop, JsonButtons, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { addDays, brineSalt, daysBetween, drySalt, KINDS, kindById, phase, readyWindow, saltAdvice, SALTS, type Method, type Phase } from './lib/fermentation-tracker'

interface Entry { id: string; date: string; text: string; ph?: number; photo?: string }
interface Batch {
  id: string; name: string; kind: string; start: string; method: Method; vegG: number; waterG: number; pct: number
  brineMode: 'brine' | 'equilibrium'; temp: number; status: 'active' | 'done' | 'failed'; log: Entry[]
}
interface State { batches: Batch[]; sel: string; salt: string }

const T = today()
const mk = (id: string, name: string, kind: string, ago: number, extra: Partial<Batch>, log: [number, string, number?][]): Batch => {
  const k = kindById(kind)
  return {
    id, name, kind, start: addDays(T, -ago), method: k.method, vegG: 1000, waterG: 0, pct: k.pct, brineMode: 'brine', temp: 20, status: 'active',
    log: log.map(([d, text, ph], i) => ({ id: `${id}${i}`, date: addDays(T, -ago + d), text, ph })), ...extra,
  }
}
const DEF: State = {
  sel: 'b1', salt: 'fine',
  batches: [
    mk('b1', 'Caraway kraut', 'kraut', 12, { vegG: 2400, temp: 19 }, [[0, 'Shredded 2 heads, packed in 2 L crock with caraway seeds.'], [3, 'Lively bubbles, brine rose above the weight.', 4.6], [9, 'Tangy, still crunchy. Skimmed a little white film.', 3.8]]),
    mk('b2', 'Garlic dill pickles', 'pickles', 6, { method: 'brine', vegG: 1100, waterG: 900, pct: 3.5, temp: 22 }, [[0, 'Small cucumbers, 6 garlic cloves, dill heads, oak leaves.'], [4, 'Brine cloudy, cucumbers turning olive.', 4.1]]),
    mk('b3', 'Habanero mash', 'hot', 30, { vegG: 650, pct: 3, temp: 23 }, [[0, 'Habanero, carrot, garlic. Airlock lid.'], [21, 'Fruity aroma, mash pH low.', 3.5]]),
    mk('b4', 'Napa kimchi', 'kimchi', 28, { vegG: 1800, pct: 2.5, temp: 18, status: 'done' }, [[0, 'Classic napa with gochugaru paste.'], [5, 'Sour enough, moved to fridge.', 4.2]]),
  ],
}

const PHASE: Record<Phase, [string, string]> = { early: ['Fermenting', '#0ea5e9'], ready: ['Taste now', '#10b981'], over: ['Past window', '#f59e0b'], done: ['Finished', '#64748b'] }

async function shrink(f: File, max = 360): Promise<string> {
  const img = await createImageBitmap(f)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.72)
}

export default function FermentationTracker() {
  const [s, set, reset] = useToolState<State>('fermentation-tracker', DEF)
  const [note, setNote] = useState('')
  const [ph, setPh] = useState(0)
  const [photo, setPhoto] = useState('')
  const [err, setErr] = useState('')
  const b = s.batches.find((x) => x.id === s.sel) ?? s.batches[0]
  const edit = (patch: Partial<Batch>) => b && set({ batches: s.batches.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) })
  const info = (x: Batch) => {
    const k = kindById(x.kind)
    const day = Math.max(0, daysBetween(x.start, T))
    const win = readyWindow(k.days, x.temp)
    return { k, day, win, ph: phase(day, win, x.status !== 'active') }
  }
  const active = s.batches.filter((x) => x.status === 'active')
  const readyNow = active.filter((x) => info(x).ph === 'ready').length
  const size = JSON.stringify(s).length
  const addBatch = (kind: string) => {
    const k = kindById(kind)
    const nb: Batch = { id: uid(), name: `New ${k.name.toLowerCase()}`, kind, start: T, method: k.method, vegG: 1000, waterG: k.method === 'brine' ? 800 : 0, pct: k.pct, brineMode: 'brine', temp: 20, status: 'active', log: [] }
    set({ batches: [nb, ...s.batches], sel: nb.id })
  }

  // timeline (Gantt) geometry
  const starts = s.batches.map((x) => x.start).sort()
  const t0 = starts[0] ?? T
  const t1 = s.batches.reduce((m, x) => { const e = addDays(x.start, info(x).win[1]); return e > m ? e : m }, T)
  const span = Math.max(14, daysBetween(t0, t1) + 2)
  const W = 640, rowH = 26, top = 22
  const X = (d: string) => 120 + (daysBetween(t0, d) / span) * (W - 130)

  let salt = 0
  if (b) salt = b.method === 'dry' ? drySalt(b.vegG, b.pct) : b.method === 'brine' ? brineSalt(b.waterG, b.pct, b.brineMode, b.vegG) : 0
  const gPerTbsp = SALTS.find((x) => x[0] === s.salt)?.[2] ?? 18
  const effPct = b && b.method === 'brine' ? (salt / (b.vegG + b.waterG + salt)) * 100 : b?.pct ?? 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Batches" actions={<Select label="" value="" onChange={(v: string) => v && addBatch(v)} options={[['', '+ New batch…'], ...KINDS.map((k) => [k.id, `${k.icon} ${k.name}`] as [string, string])]} />}>
          {s.batches.length === 0 && <Note>No batches yet. Start one with “+ New batch”.</Note>}
          {s.batches.map((x) => {
            const i = info(x)
            const [lab, col] = x.status === 'failed' ? ['Failed', '#ef4444'] : PHASE[i.ph]
            return (
              <div key={x.id} onClick={() => set({ sel: x.id })} style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 10, marginBottom: 6, border: `1px solid ${x.id === b?.id ? 'var(--accent)' : 'var(--line)'}`, opacity: x.status === 'active' ? 1 : 0.7 }}>
                <Row wrap={false}>
                  <span style={{ fontSize: 22 }}>{i.k.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{x.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>Day {i.day} · ready {i.win[0]}–{i.win[1]} d @ {x.temp} °C</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{lab}</span>
                </Row>
                <Bar value={i.day} max={i.win[1]} color={col} />
              </div>
            )
          })}
        </Panel>
        <Panel title="Data">
          <Row>
            <JsonButtons name="ferments.json" data={s} onLoad={(d) => d && Array.isArray(d.batches) && set(d)} />
            <CsvButton name="ferment-log.csv" rows={() => [['Batch', 'Type', 'Date', 'Day', 'pH', 'Note'], ...s.batches.flatMap((x) => x.log.map((e) => [x.name, kindById(x.kind).name, e.date, daysBetween(x.start, e.date), e.ph ?? '', e.text]))]} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Stored in this browser ({num(size / 1024, 0)} KB). Photos are shrunk to ~360 px; back up regularly.</p>
          {size > 3_500_000 && <Note tone="warn">Storage is getting full. Download a backup and remove old photos.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Active" value={active.length} sub={`${s.batches.length} total`} />
          <Stat label="Ready to taste" value={readyNow} tone={readyNow ? 'good' : undefined} />
          <Stat label="Selected" value={b ? `Day ${info(b).day}` : '—'} sub={b ? `${info(b).k.name}` : ''} tone="accent" />
          <Stat label="Salt" value={b && b.method !== 'none' ? `${num(salt, 1)} g` : '—'} sub={b && b.method !== 'none' ? `≈ ${num(salt / gPerTbsp, 2)} tbsp` : 'no salt'} />
        </Stats>
        {b && (
          <Panel title={`${info(b).k.icon} ${b.name}`} actions={<>
            <Seg value={b.status} onChange={(status) => edit({ status })} options={[['active', 'Active'], ['done', 'Done'], ['failed', 'Failed']]} />
            <Btn kind="ghost" onClick={() => set({ batches: s.batches.filter((x) => x.id !== b.id), sel: s.batches.find((x) => x.id !== b.id)?.id ?? '' })}>Delete</Btn>
          </>}>
            <Row>
              <Txt label="Name" value={b.name} onChange={(name) => edit({ name })} />
              <Select label="Type" value={b.kind} onChange={(kind) => { const k = kindById(kind); edit({ kind, method: k.method, pct: k.pct }) }} options={KINDS.map((k) => [k.id, k.name] as [string, string])} />
              <Txt label="Started" type="date" value={b.start} onChange={(start) => start && edit({ start })} />
              <Num label="Room temp" value={b.temp} onChange={(temp) => edit({ temp })} unit="°C" min={0} max={40} />
            </Row>
            <Seg value={b.method} onChange={(method) => edit({ method })} options={[['dry', 'Dry salt'], ['brine', 'Brine'], ['none', 'No salt']]} />
            {b.method !== 'none' && (
              <Row>
                <Num label="Vegetables" value={b.vegG} onChange={(vegG) => edit({ vegG: Math.max(0, vegG) })} unit="g" min={0} />
                {b.method === 'brine' && <Num label="Water" value={b.waterG} onChange={(waterG) => edit({ waterG: Math.max(0, waterG) })} unit="g" min={0} />}
                <Num label="Salt" value={b.pct} onChange={(pct) => edit({ pct })} unit="%" min={0} max={30} />
                <Select label="Salt type" value={s.salt} onChange={(salt) => set({ salt })} options={SALTS.map(([id, n, g]) => [id, `${n} (${g} g/tbsp)`] as [string, string])} />
              </Row>
            )}
            {b.method === 'brine' && <Seg value={b.brineMode} onChange={(brineMode) => edit({ brineMode })} options={[['brine', '% of brine'], ['equilibrium', '% of veg + water (equilibrium)']]} />}
            {b.method !== 'none' && (
              <p style={{ margin: '8px 0' }}>
                Add <b>{num(salt, 1)} g</b> salt ({num(salt / gPerTbsp, 2)} tbsp, {num((salt / gPerTbsp) * 3, 1)} tsp)
                {b.method === 'brine' && <> to {num(b.waterG, 0)} g water → brine {num((salt / (b.waterG + salt || 1)) * 100, 2)} %, jar equalises at ≈ {num(effPct, 2)} %.</>}
              </p>
            )}
            {(() => { const a = saltAdvice(b.method, +effPct.toFixed(2)); return <Note tone={a.tone}>{a.text}</Note> })()}
            {info(b).k.tip && <Note>💡 {info(b).k.tip} Expected ready {addDays(b.start, info(b).win[0])} – {addDays(b.start, info(b).win[1])}.</Note>}

            <h4 style={{ margin: '14px 0 6px' }}>Journal</h4>
            <Row>
              <Txt label="Note" value={note} onChange={setNote} placeholder="Smell, taste, bubbles, film…" />
              <Num label="pH (optional)" value={ph} onChange={setPh} min={0} max={14} step={0.1} />
            </Row>
            <Row>
              <FileDrop accept="image/*" onFiles={(f) => { setErr(''); shrink(f[0]).then(setPhoto, () => setErr('Could not read that image.')) }} label={photo ? 'Photo attached ✓ (click to replace)' : 'Attach a photo'} />
              <Btn kind="primary" disabled={!note.trim() && !photo} onClick={() => {
                edit({ log: [...b.log, { id: uid(), date: T, text: note.trim(), ph: ph > 0 ? ph : undefined, photo: photo || undefined }] })
                setNote(''); setPh(0); setPhoto('')
              }}>+ Add entry</Btn>
            </Row>
            {err && <Note tone="err">{err}</Note>}
            {[...b.log].reverse().map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ minWidth: 64 }}><b>Day {daysBetween(b.start, e.date)}</b><div className="muted" style={{ fontSize: 11 }}>{e.date}</div></div>
                {e.photo && <img src={e.photo} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />}
                <div style={{ flex: 1 }}>{e.text}{e.ph !== undefined && <span className="muted"> · pH {e.ph}</span>}</div>
                <Btn kind="ghost" onClick={() => edit({ log: b.log.filter((x) => x.id !== e.id) })} title="Remove">✕</Btn>
              </div>
            ))}
            {b.log.some((e) => e.ph !== undefined) && (
              <Table head={['Day', 'pH', '']} rows={b.log.filter((e) => e.ph !== undefined).map((e) => [daysBetween(b.start, e.date), e.ph!, e.ph! <= 4.6 ? '✓ below 4.6 (acidic enough)' : 'still above 4.6'])} />
            )}
          </Panel>
        )}
        <Panel title="Timeline">
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${top + s.batches.length * rowH + 8}`} style={{ width: '100%', minWidth: 480 }} role="img" aria-label="Fermentation timeline">
              {s.batches.map((x, i) => {
                const inf = info(x)
                const y = top + i * rowH
                const [, col] = PHASE[inf.ph]
                return (
                  <g key={x.id} onClick={() => set({ sel: x.id })} style={{ cursor: 'pointer' }}>
                    <text x={4} y={y + 15} fontSize={12} fill="currentColor">{inf.k.icon} {x.name.slice(0, 14)}</text>
                    <rect x={X(x.start)} y={y + 4} width={Math.max(2, X(addDays(x.start, inf.win[1])) - X(x.start))} height={14} rx={4} fill="var(--line)" />
                    <rect x={X(addDays(x.start, inf.win[0]))} y={y + 4} width={Math.max(2, X(addDays(x.start, inf.win[1])) - X(addDays(x.start, inf.win[0])))} height={14} rx={4} fill="#10b981" opacity={0.35} />
                    <rect x={X(x.start)} y={y + 8} width={Math.max(2, X(addDays(x.start, Math.min(inf.day, x.status === 'active' ? inf.day : (x.log.at(-1) ? daysBetween(x.start, x.log.at(-1)!.date) : inf.day)))) - X(x.start))} height={6} rx={3} fill={col} />
                    {x.log.map((e) => <circle key={e.id} cx={X(e.date)} cy={y + 11} r={3} fill="var(--panel)" stroke={col} />)}
                  </g>
                )
              })}
              <line x1={X(T)} x2={X(T)} y1={10} y2={top + s.batches.length * rowH} stroke="#ef4444" strokeDasharray="4 3" />
              <text x={X(T)} y={12} fontSize={11} textAnchor="middle" fill="#ef4444">today</text>
            </svg>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Green band = expected tasting window, adjusted for temperature (activity roughly doubles every 10 °C). Dots are journal entries.</p>
        </Panel>
      </div>
    </Split>
  )
}
