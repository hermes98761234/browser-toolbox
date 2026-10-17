import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, color, CsvButton, download, FileDrop, Note, num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { centroid, edges, ellipsoidArea, fromGeoJSON, parseCoords, perimeter, project, selfIntersects, sphereArea, toGeoJSON, unproject, type LonLat, type Parcel } from './lib/site-area-mapper'

type AreaUnit = 'm2' | 'ha' | 'ac' | 'ft2' | 'km2'
interface State {
  center: LonLat
  zoom: number
  tiles: boolean
  parcels: Parcel[]
  active: string
  unit: AreaUnit
  feet: boolean
}

// Sample: two adjoining urban lots (illustrative geometry, not a legal survey).
const LOT_A: LonLat[] = [[-122.67745, 45.52345], [-122.67665, 45.52345], [-122.67665, 45.52297], [-122.67745, 45.52297]]
const LOT_B: LonLat[] = [[-122.67665, 45.52345], [-122.67585, 45.52345], [-122.67585, 45.52255], [-122.6763, 45.52255], [-122.6763, 45.52297], [-122.67665, 45.52297]]
const DEF: State = {
  center: [-122.67665, 45.52302],
  zoom: 18,
  tiles: true,
  unit: 'm2',
  feet: false,
  active: 'a',
  parcels: [
    { id: 'a', name: 'Lot A', color: color(0), ring: LOT_A },
    { id: 'b', name: 'Lot B (L-shape)', color: color(2), ring: LOT_B },
  ],
}

const UNITS: [AreaUnit, string, number][] = [['m2', 'm²', 1], ['ha', 'ha', 1e4], ['ac', 'acres', 4046.8564224], ['ft2', 'ft²', 0.09290304], ['km2', 'km²', 1e6]]
const H = 460

function compass(az: number) {
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16]
}

export default function SiteAreaMapper() {
  const [s, set, reset] = useToolState('site-area-mapper', DEF)
  const [w, setW] = useState(900)
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'pan' | 'v'; pid: string; i: number; x: number; y: number; c: [number, number]; moved: boolean } | null>(null)
  const z = s.zoom
  const cpx = project(s.center, z)
  const tl: [number, number] = [cpx[0] - w / 2, cpx[1] - H / 2]
  const scr = (p: LonLat): [number, number] => {
    const q = project(p, z)
    return [q[0] - tl[0], q[1] - tl[1]]
  }
  const act = s.parcels.find((p) => p.id === s.active) ?? s.parcels[0]
  const unit = UNITS.find((u) => u[0] === s.unit) ?? UNITS[0]
  const fa = (m2: number) => `${num(m2 / unit[2], unit[2] >= 1e4 ? 4 : unit[0] === 'ac' ? 4 : 1)} ${unit[1]}`
  const fl = (m: number) => (s.feet ? `${num(m / 0.3048, 1)} ft` : `${num(m, 2)} m`)
  const setRing = (pid: string, f: (r: LonLat[]) => LonLat[]) => set((st) => ({ ...st, parcels: st.parcels.map((p) => (p.id === pid ? { ...p, ring: f(p.ring) } : p)) }))

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const lx = e.clientX - r.left, ly = e.clientY - r.top
      set((st) => {
        const z2 = Math.max(3, Math.min(20, st.zoom + (e.deltaY < 0 ? 1 : -1)))
        if (z2 === st.zoom) return st
        const c = project(st.center, st.zoom)
        const under = unproject([c[0] - r.width / 2 + lx, c[1] - r.height / 2 + ly], st.zoom)
        const u2 = project(under, z2)
        return { ...st, zoom: z2, center: unproject([u2[0] - lx + r.width / 2, u2[1] - ly + r.height / 2], z2) }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', wheel)
    }
  }, [set])

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onDown = (e: React.PointerEvent) => {
    const t = (e.target as SVGElement).dataset ?? {}
    e.currentTarget.setPointerCapture(e.pointerId)
    if (t.mi !== undefined && t.pid) {
      const i = Number(t.mi)
      const pid = t.pid
      setRing(pid, (r) => {
        const a = r[i], b = r[(i + 1) % r.length]
        const n = [...r]
        n.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
        return n
      })
      drag.current = { kind: 'v', pid, i: i + 1, x: e.clientX, y: e.clientY, c: cpx, moved: false }
      return
    }
    if (t.vi !== undefined && t.pid) {
      if (t.pid !== s.active) set({ active: t.pid })
      drag.current = { kind: 'v', pid: t.pid, i: Number(t.vi), x: e.clientX, y: e.clientY, c: cpx, moved: false }
      return
    }
    drag.current = { kind: 'pan', pid: '', i: -1, x: e.clientX, y: e.clientY, c: cpx, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    if (d.kind === 'pan') set({ center: unproject([d.c[0] - dx, d.c[1] - dy], z) })
    else {
      const [lx, ly] = local(e)
      const p = unproject([tl[0] + lx, tl[1] + ly], z)
      setRing(d.pid, (r) => r.map((q, j) => (j === d.i ? p : q)))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'pan' && !d.moved && act) {
      const [lx, ly] = local(e)
      const p = unproject([tl[0] + lx, tl[1] + ly], z)
      setRing(act.id, (r) => [...r, p])
    }
  }

  const fit = (parcels = s.parcels) => {
    const pts = parcels.flatMap((p) => p.ring)
    if (!pts.length) return
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
    const c: LonLat = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
    let zz = 20
    while (zz > 3) {
      const a = project([Math.min(...lons), Math.max(...lats)], zz), b = project([Math.max(...lons), Math.min(...lats)], zz)
      if (b[0] - a[0] < w * 0.8 && b[1] - a[1] < H * 0.8) break
      zz--
    }
    set({ center: c, zoom: zz })
  }

  // tiles
  const tiles: React.ReactNode[] = []
  if (s.tiles) {
    const n = 2 ** z
    for (let ty = Math.floor(tl[1] / 256); ty <= Math.floor((tl[1] + H) / 256); ty++) {
      for (let tx = Math.floor(tl[0] / 256); tx <= Math.floor((tl[0] + w) / 256); tx++) {
        if (ty < 0 || ty >= n) continue
        const wx = ((tx % n) + n) % n
        tiles.push(<img key={`${z}/${tx}/${ty}`} src={`https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`} alt="" draggable={false} style={{ position: 'absolute', left: tx * 256 - tl[0], top: ty * 256 - tl[1], width: 256, height: 256, pointerEvents: 'none' }} />)
      }
    }
  }
  // scale bar
  const mpp = (40075016.686 * Math.cos((s.center[1] * Math.PI) / 180)) / 2 ** (z + 8)
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find((v) => v / mpp > 70) ?? 100000

  const stats = s.parcels.map((p) => ({ p, area: ellipsoidArea(p.ring), sph: sphereArea(p.ring), per: perimeter(p.ring), bad: selfIntersects(p.ring) }))
  const total = stats.reduce((a, x) => a + x.area, 0)
  const aStats = stats.find((x) => x.p.id === act?.id)
  const eds = act && act.ring.length >= 2 ? edges(act.ring) : []

  return (
    <div>
      <Stats>
        <Stat label={`${act?.name ?? '—'} area`} value={fa(aStats?.area ?? 0)} sub={`${num((aStats?.area ?? 0) / 1e4, 4)} ha · ${num((aStats?.area ?? 0) / 4046.8564224, 3)} ac`} tone="accent" />
        <Stat label="Perimeter" value={fl(aStats?.per ?? 0)} sub={`${act?.ring.length ?? 0} vertices`} />
        <Stat label={`Total (${s.parcels.length} parcels)`} value={fa(total)} sub={`${num(total, 0)} m²`} />
        <Stat label="Sphere vs ellipsoid" value={aStats && aStats.area ? `${((aStats.sph / aStats.area - 1) * 100).toFixed(3)} %` : '—'} sub="spherical web-map area error" />
      </Stats>
      <Panel
        title="Map — click to add corners, drag corners to adjust, drag ◦ midpoints to insert"
        actions={
          <>
            <select className="k-select" value={act?.id} onChange={(e) => set({ active: e.target.value })} aria-label="Active parcel" style={{ width: 'auto' }}>
              {s.parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Btn onClick={() => { const id = uid(); set({ parcels: [...s.parcels, { id, name: `Parcel ${s.parcels.length + 1}`, color: color(s.parcels.length * 3 + 1), ring: [] }], active: id }) }}>+ Parcel</Btn>
            <Btn disabled={!act?.ring.length} onClick={() => act && setRing(act.id, (r) => r.slice(0, -1))}>↶ Undo point</Btn>
            <Btn onClick={() => fit()}>⤢ Fit</Btn>
          </>
        }
      >
        <div
          ref={box}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{ position: 'relative', height: H, overflow: 'hidden', borderRadius: 10, background: s.tiles ? '#e5e7eb' : 'repeating-linear-gradient(0deg,var(--panel2) 0 39px,var(--line) 39px 40px),repeating-linear-gradient(90deg,transparent 0 39px,var(--line) 39px 40px)', touchAction: 'none', cursor: 'crosshair', userSelect: 'none' }}
        >
          {tiles}
          <svg width={w} height={H} style={{ position: 'absolute', inset: 0 }}>
            {stats.map(({ p, area, bad }) => {
              const pts = p.ring.map(scr)
              const on = p.id === act?.id
              const c = centroid(p.ring)
              const cs = scr(c)
              return (
                <g key={p.id}>
                  {pts.length >= 3 ? (
                    <polygon points={pts.map((q) => q.join(',')).join(' ')} fill={p.color} fillOpacity={on ? 0.28 : 0.16} stroke={bad ? '#dc2626' : p.color} strokeWidth={on ? 3 : 2} strokeDasharray={bad ? '6 4' : undefined} />
                  ) : (
                    <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={p.color} strokeWidth={3} />
                  )}
                  {pts.length >= 3 && (
                    <text x={cs[0]} y={cs[1]} textAnchor="middle" fontSize={13} fontWeight={700} fill="#111827" stroke="#fff" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
                      {p.name} · {fa(area)}
                    </text>
                  )}
                  {on && pts.length >= 2 && pts.map((a, i) => {
                    if (pts.length < 3 && i === pts.length - 1) return null
                    const b = pts[(i + 1) % pts.length]
                    return <circle key={`m${i}`} data-pid={p.id} data-mi={i} cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} r={5} fill="#fff" fillOpacity={0.8} stroke={p.color} strokeWidth={1.5} style={{ cursor: 'copy' }} />
                  })}
                  {pts.map((a, i) => (
                    <circle key={i} data-pid={p.id} data-vi={i} cx={a[0]} cy={a[1]} r={on ? 7 : 4} fill={on ? p.color : '#fff'} stroke={on ? '#fff' : p.color} strokeWidth={2} style={{ cursor: 'move' }} />
                  ))}
                </g>
              )
            })}
          </svg>
          <div style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(255,255,255,.85)', color: '#111', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>
            <div style={{ width: nice / mpp, borderBottom: '3px solid #111', borderLeft: '2px solid #111', borderRight: '2px solid #111', height: 6 }} />
            {nice >= 1000 ? `${nice / 1000} km` : `${nice} m`} · z{z}
          </div>
          {s.tiles && <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 10, background: 'rgba(255,255,255,.85)', color: '#333', padding: '1px 5px' }}>© OpenStreetMap contributors</div>}
          <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
            <Btn onClick={() => set({ zoom: Math.min(20, z + 1) })}>+</Btn>
            <Btn onClick={() => set({ zoom: Math.max(3, z - 1) })}>−</Btn>
          </div>
        </div>
        <Row>
          <Check label="OpenStreetMap tiles (uncheck to work offline on a grid)" value={s.tiles} onChange={(tiles) => set({ tiles })} />
        </Row>
      </Panel>

      <Split>
        <div>
          <Panel
            title="Parcels"
            actions={
              <>
                <Btn onClick={() => download('site-parcels.geojson', JSON.stringify(toGeoJSON(s.parcels), null, 2), 'application/geo+json')}>⬇ GeoJSON</Btn>
                <CsvButton name="site-parcels.csv" rows={() => [['Parcel', 'Area m2', 'Area ha', 'Area acres', 'Perimeter m', 'Vertices'], ...stats.map((x) => [x.p.name, x.area.toFixed(2), (x.area / 1e4).toFixed(5), (x.area / 4046.8564224).toFixed(5), x.per.toFixed(2), x.p.ring.length])]} />
                <Btn kind="ghost" onClick={() => { reset(); setMsg('') }}>Reset</Btn>
              </>
            }
          >
            <Seg label="Area unit" value={s.unit} onChange={(unit) => set({ unit })} options={UNITS.map(([k, l]) => [k, l] as const)} />
            <Check label="Lengths in feet" value={s.feet} onChange={(feet) => set({ feet })} />
            <Table
              head={['', 'Name', 'Area', 'Perimeter', '']}
              rows={stats.map(({ p, area, per, bad }) => [
                <input key="c" type="color" value={p.color} onChange={(e) => set({ parcels: s.parcels.map((q) => (q.id === p.id ? { ...q, color: e.target.value } : q)) })} aria-label="Colour" style={{ width: 28, height: 24, padding: 0, border: 0, background: 'none' }} />,
                <input key="n" value={p.name} onFocus={() => set({ active: p.id })} onChange={(e) => set({ parcels: s.parcels.map((q) => (q.id === p.id ? { ...q, name: e.target.value } : q)) })} aria-label="Name" style={{ fontWeight: p.id === act?.id ? 700 : 400 }} />,
                bad ? <span key="a" style={{ color: 'var(--err)' }}>self-intersecting</span> : p.ring.length < 3 ? <span key="a" className="muted">add {3 - p.ring.length} more</span> : fa(area),
                fl(per),
                <Btn key="x" kind="ghost" title="Delete parcel" onClick={() => set({ parcels: s.parcels.filter((q) => q.id !== p.id), active: s.parcels.find((q) => q.id !== p.id)?.id ?? '' })}>✕</Btn>,
              ])}
              foot={['', 'Total', fa(total), '', '']}
            />
            {stats.some((x) => x.bad) && <Note tone="err">A boundary crosses itself (dashed red). Drag the corners so edges do not cross — the area of a self-intersecting shape is not meaningful.</Note>}
          </Panel>
          <Panel title="Import / enter coordinates">
            <FileDrop
              accept=".geojson,.json,application/geo+json,application/json"
              onFiles={async ([f]) => {
                try {
                  const got = fromGeoJSON(JSON.parse(await f.text()))
                  if (!got.length) return setMsg('No polygons found in that file.')
                  const ps = got.map((g, i) => ({ id: uid(), name: g.name, color: color(i), ring: g.ring }))
                  set({ parcels: ps, active: ps[0].id })
                  fit(ps)
                  setMsg(`Imported ${ps.length} polygon(s).`)
                } catch {
                  setMsg('That file is not valid GeoJSON.')
                }
              }}
              label="Drop a GeoJSON file with polygons"
            />
            <Area label={`Corners for “${act?.name ?? ''}” — one “lat, lon” per line`} value={paste} onChange={setPaste} rows={4} mono placeholder={'45.52345, -122.67745\n45.52345, -122.67665\n45.52297, -122.67665'} />
            <Row>
              <Btn disabled={!act} onClick={() => { const r = parseCoords(paste); if (r.length < 3) return setMsg('Need at least 3 valid “lat, lon” lines.'); setRing(act.id, () => r); fit(s.parcels.map((p) => (p.id === act.id ? { ...p, ring: r } : p))); setMsg(`Set ${r.length} corners.`) }}>Use as boundary</Btn>
              <Btn kind="ghost" disabled={!act} onClick={() => setPaste(act.ring.map(([lon, lat]) => `${lat.toFixed(7)}, ${lon.toFixed(7)}`).join('\n'))}>Load current</Btn>
            </Row>
            {msg && <Note>{msg}</Note>}
          </Panel>
        </div>
        <div>
          <Panel title={`Boundary of ${act?.name ?? '—'}`}>
            {eds.length ? (
              <Table
                head={['Edge', 'Length', 'Bearing', '']}
                rows={(act.ring.length < 3 ? eds.slice(0, -1) : eds).map((e) => [
                  `${e.from + 1} → ${e.to + 1}`,
                  fl(e.dist),
                  `${e.az1.toFixed(1)}° ${compass(e.az1)}`,
                  <Btn key="d" kind="ghost" title={`Delete corner ${e.from + 1}`} onClick={() => setRing(act.id, (r) => r.filter((_, j) => j !== e.from))}>✕ {e.from + 1}</Btn>,
                ])}
              />
            ) : (
              <p className="muted">Click on the map to place the first corners of this parcel.</p>
            )}
          </Panel>
          <Note>
            Areas are computed on the <b>WGS84 ellipsoid</b> (vertices mapped to authalic latitude, then exact spherical excess on the equal-area sphere); edge lengths and bearings use Vincenty’s inverse formula. Plain spherical formulas used by many web maps are off by up to ±0.7 % depending on latitude. Map tiles: OpenStreetMap (needs internet); measurements work offline.
          </Note>
        </div>
      </Split>
    </div>
  )
}
