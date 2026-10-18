import { useEffect, useMemo, useState, type MouseEvent as RME } from 'react'
import { BarChart, Btn, Check, color, CsvButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, num, uid, useToolState } from '../kit'
import { fitView, tiles, toScreen, type LL } from './lib/dog-walk-tracker'
import { byDayPart, cmToIn, fitWithin, kgToLb, moonPhase, speciesSummary, tally, unproject, type Catch } from './lib/fishing-catch-log'

// ---------- photos in IndexedDB ----------
const openDb = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('tb-fishing-catch-log', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('photos')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
async function photoOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction('photos', mode).objectStore('photos'))
    req.onsuccess = () => res(req.result as T)
    req.onerror = () => rej(req.error)
  })
}
const putPhoto = (id: string, b: Blob) => photoOp<void>('readwrite', (s) => s.put(b, id))
const getPhoto = (id: string) => photoOp<Blob | undefined>('readonly', (s) => s.get(id))
const delPhoto = (id: string) => photoOp<void>('readwrite', (s) => s.delete(id))

async function downscale(f: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const [w, h] = fitWithin(bmp.width, bmp.height, 1024)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.82))
}
const toDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b) })

// ---------- data ----------
const SPECIES = ['Largemouth bass', 'Smallmouth bass', 'Northern pike', 'Walleye', 'Yellow perch', 'Bluegill', 'Rainbow trout', 'Brown trout', 'Lake trout', 'Channel catfish', 'Crappie', 'Carp', 'Salmon']
const WEATHER = ['', 'Sunny', 'Partly cloudy', 'Overcast', 'Light rain', 'Rain', 'Fog', 'Windy', 'Snow']
const blank = (): Catch => ({ id: uid(), at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), species: 'Largemouth bass', length: 0, weight: 0, method: 'Spinning', bait: '', released: true, lat: null, lon: null, spot: '', weather: 'Sunny', airT: null, waterT: null, wind: '', notes: '', photo: false })

function sample(): Catch[] {
  const d = (daysAgo: number, hh: string) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10) + 'T' + hh
  const rows: [number, string, string, number, number, string, string, boolean, number, number, string, string, number][] = [
    [2, '06:40', 'Largemouth bass', 41, 1.1, 'Spinning', 'Soft plastic worm', true, 44.538, -73.312, 'Weed bed', 'Overcast', 19],
    [2, '07:15', 'Largemouth bass', 36, 0.8, 'Spinning', 'Soft plastic worm', true, 44.536, -73.309, 'Weed bed', 'Overcast', 19],
    [5, '19:30', 'Northern pike', 68, 2.4, 'Baitcasting', 'Spoon', true, 44.552, -73.329, 'North cove', 'Partly cloudy', 18],
    [9, '05:55', 'Walleye', 47, 1.2, 'Trolling', 'Crankbait', false, 44.521, -73.341, 'Drop-off', 'Fog', 17],
    [9, '06:20', 'Yellow perch', 24, 0.2, 'Spinning', 'Live minnow', false, 44.523, -73.338, 'Drop-off', 'Fog', 17],
    [14, '12:10', 'Bluegill', 18, 0.15, 'Fly', 'Nymph', true, 44.546, -73.318, 'Dock', 'Sunny', 21],
    [21, '18:45', 'Smallmouth bass', 39, 0.95, 'Spinning', 'Tube jig', true, 44.529, -73.3, 'Rock point', 'Sunny', 20],
    [28, '20:05', 'Northern pike', 81, 3.6, 'Baitcasting', 'Spinnerbait', true, 44.551, -73.332, 'North cove', 'Windy', 16],
    [35, '07:00', 'Rainbow trout', 33, 0.45, 'Fly', 'Dry fly', false, 44.542, -73.355, 'Inlet', 'Light rain', 13],
    [40, '06:35', 'Largemouth bass', 44, 1.4, 'Spinning', 'Topwater frog', true, 44.537, -73.311, 'Weed bed', 'Partly cloudy', 18],
  ]
  return rows.map(([da, hh, species, length, weight, method, bait, released, lat, lon, spot, weather, waterT]) => ({ ...blank(), id: uid(), at: d(da, hh), species, length, weight, method, bait, released, lat, lon, spot, weather, waterT, airT: waterT + 3, wind: weather === 'Windy' ? 'W 25 km/h' : 'light' }))
}

interface State { catches: Catch[]; imperial: boolean; osm: boolean; filter: string }
const DEF: State = { catches: sample(), imperial: false, osm: true, filter: '' }

const W = 760, H = 380

export default function FishingCatchLog() {
  const [s, set, reset] = useToolState('fishing-catch-log', DEF)
  const [form, setForm] = useState<Catch | null>(null)
  const [pending, setPending] = useState<Blob | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : ''), [pending])
  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl) }, [pendingUrl])
  const list = useMemo(() => [...s.catches].filter((c) => !s.filter || c.species === s.filter).sort((a, b) => b.at.localeCompare(a.at)), [s.catches, s.filter])
  const L = (cm: number) => (cm ? (s.imperial ? `${num(cmToIn(cm), 1)} in` : `${num(cm, 1)} cm`) : '—')
  const Wt = (kg: number) => (kg ? (s.imperial ? `${num(kgToLb(kg), 2)} lb` : `${num(kg, 2)} kg`) : '—')

  // thumbnails for entries with photos
  useEffect(() => {
    let live = true
    const urls: string[] = []
    void (async () => {
      const out: Record<string, string> = {}
      for (const c of s.catches.filter((x) => x.photo)) {
        try {
          const b = await getPhoto(c.id)
          if (b) urls.push((out[c.id] = URL.createObjectURL(b)))
        } catch { /* IndexedDB unavailable */ }
      }
      if (live) setThumbs(out)
    })()
    return () => {
      live = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [s.catches])

  const located = s.catches.filter((c) => c.lat !== null && c.lon !== null)
  const pts: LL[] = located.map((c) => [c.lat!, c.lon!])
  if (form?.lat != null && form.lon != null) pts.push([form.lat, form.lon])
  const v = fitView(pts.length ? pts : [[44.54, -73.32]], W, H, 50, 15)
  const speciesList = [...new Set([...SPECIES, ...s.catches.map((c) => c.species)])]
  const spColor = (sp: string) => color(speciesList.indexOf(sp))

  const mapClick = (e: RME<SVGSVGElement>) => {
    if (!form) return
    const r = e.currentTarget.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H
    const [lat, lon] = unproject(v.cx - W / 2 + sx, v.cy - H / 2 + sy, v.z)
    setForm({ ...form, lat: +lat.toFixed(6), lon: +lon.toFixed(6) })
  }
  const locate = () => {
    if (!form) return
    if (!('geolocation' in navigator)) return setMsg('Geolocation is not available in this browser.')
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => f && { ...f, lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) }),
      (err) => setMsg(`Location failed: ${err.message}. Click the map to place the spot instead.`),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
  const save = async () => {
    if (!form) return
    let f = form
    if (pending) {
      try {
        await putPhoto(f.id, pending)
        f = { ...f, photo: true }
      } catch {
        setMsg('Could not store the photo (IndexedDB unavailable, e.g. private mode). The entry is saved without it.')
      }
    }
    set((x) => ({ ...x, catches: x.catches.some((c) => c.id === f.id) ? x.catches.map((c) => (c.id === f.id ? f : c)) : [...x.catches, f] }))
    setForm(null)
    setPending(null)
  }
  const remove = (c: Catch) => {
    if (!confirm(`Delete the ${c.species} from ${c.at.replace('T', ' ')}?`)) return
    if (c.photo) void delPhoto(c.id).catch(() => {})
    set((x) => ({ ...x, catches: x.catches.filter((y) => y.id !== c.id) }))
  }
  const backup = async () => {
    const photos: Record<string, string> = {}
    for (const c of s.catches.filter((x) => x.photo)) {
      const b = await getPhoto(c.id).catch(() => undefined)
      if (b) photos[c.id] = await toDataUrl(b)
    }
    download('fishing-log-backup.json', JSON.stringify({ ...s, photos }, null, 1), 'application/json')
  }
  const restore = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as State & { photos?: Record<string, string> }
      if (!Array.isArray(d.catches)) throw new Error('no catches')
      for (const [id, url] of Object.entries(d.photos ?? {})) await putPhoto(id, await (await fetch(url)).blob())
      set({ catches: d.catches, imperial: !!d.imperial, osm: d.osm !== false, filter: '' })
      setMsg(`Restored ${d.catches.length} catches.`)
    } catch {
      setMsg('That file is not a fishing-log backup.')
    }
  }

  const sum = speciesSummary(s.catches)
  const parts = byDayPart(s.catches)
  const baits = tally(s.catches, (c) => c.bait).slice(0, 6)
  const moons = tally(s.catches, (c) => moonPhase(Date.parse(c.at)).name)
  const biggest = [...s.catches].sort((a, b) => b.length - a.length)[0]
  const fm = form ? moonPhase(Date.parse(form.at)) : null

  return (
    <div>
      <Stats>
        <Stat label="Catches" value={s.catches.length} sub={`${s.catches.filter((c) => c.released).length} released`} />
        <Stat label="Species" value={sum.length} sub={sum[0] ? `most: ${sum[0].species}` : ''} />
        <Stat label="Biggest" value={biggest ? L(biggest.length) : '—'} sub={biggest ? `${biggest.species}, ${biggest.at.slice(0, 10)}` : ''} tone="accent" />
        <Stat label="Moon today" value={`${moonPhase(Date.now()).icon} ${moonPhase(Date.now()).name}`} sub={`${Math.round(moonPhase(Date.now()).illum * 100)}% lit`} />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title={form ? (s.catches.some((c) => c.id === form.id) ? 'Edit catch' : 'Log a catch') : 'Log a catch'} actions={!form && <Btn kind="primary" onClick={() => setForm(blank())}>+ New catch</Btn>}>
            {!form ? (
              <p className="muted">Record species, size, bait, conditions, a photo and where it happened. Everything stays on this device; photos are downscaled to 1024 px and kept in the browser's IndexedDB.</p>
            ) : (
              <>
                <Row>
                  <Select label="Species" value={speciesList.includes(form.species) ? form.species : '__other'} onChange={(v: string) => setForm({ ...form, species: v === '__other' ? '' : v })} options={[...speciesList.map((x) => [x, x] as [string, string]), ['__other', 'Other…']]} />
                  {!speciesList.includes(form.species) && <Txt label="Species name" value={form.species} onChange={(species) => setForm({ ...form, species })} />}
                  <Txt label="Date & time" type="datetime-local" value={form.at} onChange={(at) => at && setForm({ ...form, at })} />
                </Row>
                <Row>
                  <Num label={`Length (${s.imperial ? 'in' : 'cm'})`} value={+(s.imperial ? cmToIn(form.length) : form.length).toFixed(1)} onChange={(v) => setForm({ ...form, length: Math.max(0, s.imperial ? v * 2.54 : v) })} min={0} />
                  <Num label={`Weight (${s.imperial ? 'lb' : 'kg'})`} value={+(s.imperial ? kgToLb(form.weight) : form.weight).toFixed(2)} onChange={(v) => setForm({ ...form, weight: Math.max(0, s.imperial ? v / 2.2046226218 : v) })} min={0} />
                </Row>
                <Row>
                  <Txt label="Method" value={form.method} onChange={(method) => setForm({ ...form, method })} placeholder="Spinning, fly, trolling…" />
                  <Txt label="Bait / lure" value={form.bait} onChange={(bait) => setForm({ ...form, bait })} />
                </Row>
                <Check label="Released" value={form.released} onChange={(released) => setForm({ ...form, released })} />
                <Row>
                  <Select label="Weather" value={form.weather} onChange={(weather) => setForm({ ...form, weather })} options={WEATHER.map((w) => [w, w || '—'] as [string, string])} />
                  <Num label="Water °C" value={form.waterT ?? 0} onChange={(waterT) => setForm({ ...form, waterT })} />
                  <Num label="Air °C" value={form.airT ?? 0} onChange={(airT) => setForm({ ...form, airT })} />
                  <Txt label="Wind" value={form.wind} onChange={(wind) => setForm({ ...form, wind })} />
                </Row>
                {fm && <p className="muted" style={{ margin: '4px 0' }}>{fm.icon} {fm.name} ({Math.round(fm.illum * 100)}% lit) on that date.</p>}
                <Row>
                  <Txt label="Spot name" value={form.spot} onChange={(spot) => setForm({ ...form, spot })} />
                  <Btn onClick={locate}>📍 Use my location</Btn>
                </Row>
                <p className="muted" style={{ fontSize: 13 }}>{form.lat != null ? `Location: ${form.lat}, ${form.lon}` : 'No location yet'} — or click the map to place the pin.</p>
                <label className="k-btn" style={{ cursor: 'pointer' }}>
                  📷 {pending || form.photo ? 'Replace photo' : 'Take / add photo'}
                  <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) setPending(await downscale(f).catch(() => null))
                  }} />
                </label>
                {(pending || thumbs[form.id]) && <img alt="Catch" src={pendingUrl || thumbs[form.id]} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginTop: 8 }} />}
                <label className="k-field"><span className="k-label">Notes</span><textarea className="k-area" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                <Row>
                  <Btn kind="primary" onClick={save} disabled={!form.species.trim()}>Save catch</Btn>
                  <Btn kind="ghost" onClick={() => { setForm(null); setPending(null) }}>Cancel</Btn>
                </Row>
              </>
            )}
            {msg && <Note tone="warn">{msg}</Note>}
          </Panel>
          <Panel title="Species">
            <BarChart height={200} fy={(x) => num(x, 0)} bars={sum.map((r) => ({ label: r.species, value: r.count, color: spColor(r.species) }))} />
            <Table head={['Species', 'Caught', 'Released', 'Biggest', 'Avg']} rows={sum.map((r) => [r.species, r.count, r.released, L(r.maxLen), L(r.avgLen)])} />
          </Panel>
          <Panel title="When & what works">
            <BarChart height={170} fy={(x) => num(x, 0)} bars={parts.map((n, i) => ({ label: `${String(i * 3).padStart(2, '0')}–${String(i * 3 + 3).padStart(2, '0')}`, value: n, color: '#0ea5e9' }))} />
            <Table head={['Top baits / lures', 'Catches']} rows={baits.map(([b, n]) => [b, n])} />
            <Table head={['Moon phase', 'Catches']} rows={moons.map(([b, n]) => [b, n])} />
          </Panel>
        </div>
        <div>
          <Panel title="Map" actions={<Check label="OpenStreetMap tiles" value={s.osm} onChange={(osm) => set({ osm })} />}>
            <svg viewBox={`0 0 ${W} ${H}`} onClick={mapClick} style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid var(--line)', background: s.osm ? '#dbe7ef' : 'color-mix(in srgb, #0ea5e9 9%, var(--panel))', cursor: form ? 'crosshair' : 'default' }}>
              {s.osm && tiles(v).map((t) => <image key={`${t.z}-${t.x}-${t.y}`} href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`} x={t.sx} y={t.sy} width={256} height={256} />)}
              {located.map((c) => {
                const [x, y] = toScreen([c.lat!, c.lon!], v)
                const on = sel === c.id
                return (
                  <g key={c.id} transform={`translate(${x} ${y})`} onClick={(e) => { e.stopPropagation(); setSel(c.id) }} style={{ cursor: 'pointer' }}>
                    <circle r={on ? 11 : 7} fill={spColor(c.species)} stroke="#fff" strokeWidth={2.5} />
                    <title>{`${c.species} · ${L(c.length)} · ${c.spot}`}</title>
                  </g>
                )
              })}
              {form?.lat != null && form.lon != null && (() => {
                const [x, y] = toScreen([form.lat, form.lon], v)
                return <path transform={`translate(${x} ${y})`} d="M0 0 C-10 -13 -13 -19 -13 -25 A13 13 0 1 1 13 -25 C13 -19 10 -13 0 0 Z" fill="#ef4444" stroke="#fff" strokeWidth={2.5} />
              })()}
              {s.osm && <text x={W - 6} y={H - 6} fontSize={11} textAnchor="end" fill="#334155">© OpenStreetMap contributors</text>}
            </svg>
            {!located.length && <p className="muted">Catches with a location appear here.</p>}
            <p className="muted" style={{ fontSize: 13 }}>Map tiles load from openstreetmap.org; untick to keep the map fully offline (markers stay).</p>
          </Panel>
          <Panel title="Catches" actions={<>
            <Select label="" value={s.filter} onChange={(filter: string) => set({ filter })} options={[['', 'All species'], ...sum.map((r) => [r.species, r.species] as [string, string])]} />
            <Seg value={s.imperial ? 'imp' : 'met'} onChange={(u) => set({ imperial: u === 'imp' })} options={[['met', 'cm/kg'], ['imp', 'in/lb']]} />
          </>}>
            <div style={{ display: 'grid', gap: 8 }}>
              {list.map((c) => {
                const mp = moonPhase(Date.parse(c.at))
                return (
                  <div key={c.id} onClick={() => setSel(c.id)} style={{ display: 'flex', gap: 10, padding: 8, borderRadius: 10, border: `2px solid ${sel === c.id ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel2)', cursor: 'pointer' }}>
                    {thumbs[c.id] ? <img src={thumbs[c.id]} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 72, height: 72, borderRadius: 8, background: spColor(c.species), display: 'grid', placeItems: 'center', fontSize: 30, opacity: 0.85 }}>🐟</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{c.species}</b> {c.released && <span className="muted" style={{ fontSize: 12 }}>· released</span>}
                      <div style={{ fontSize: 13 }}>{L(c.length)} · {Wt(c.weight)} · {c.bait || c.method || '—'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.at.replace('T', ' ')} · {c.spot || 'no spot'} · {mp.icon} {c.weather}{c.waterT != null ? ` · water ${c.waterT}°C` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Btn kind="ghost" onClick={() => { setForm({ ...c }); setPending(null) }}>Edit</Btn>
                      <Btn kind="ghost" onClick={() => remove(c)}>✕</Btn>
                    </div>
                  </div>
                )
              })}
            </div>
            <Row>
              <CsvButton name="fishing-log.csv" rows={() => [['Date', 'Species', 'Length cm', 'Weight kg', 'Method', 'Bait', 'Released', 'Lat', 'Lon', 'Spot', 'Weather', 'Air C', 'Water C', 'Wind', 'Moon', 'Notes'], ...s.catches.map((c) => [c.at, c.species, c.length, c.weight, c.method, c.bait, c.released ? 'yes' : 'no', c.lat ?? '', c.lon ?? '', c.spot, c.weather, c.airT ?? '', c.waterT ?? '', c.wind, moonPhase(Date.parse(c.at)).name, c.notes])]} />
              <Btn onClick={backup}>⬇ Backup (with photos)</Btn>
              <label className="k-btn">⬆ Restore<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
              <Btn kind="ghost" onClick={() => confirm('Replace your log with the sample data?') && reset()}>Reset</Btn>
            </Row>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
