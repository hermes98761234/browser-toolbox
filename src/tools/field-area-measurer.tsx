import { useEffect, useRef, useState } from 'react'
import { Btn, download, FileDrop, Note, num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { haversine, perimeter, project, ringArea, ringFromGeoJSON, toGeoJSON, toKml, unproject, type LonLat } from './lib/field-area-measurer'

const Tip = ({ children }: { children: React.ReactNode }) => <div className="k-note info" style={{ display: 'block' }}>{children}</div>

// A 160-acre "quarter section" in Finney County, Kansas — US farmland laid out on the PLSS grid.
const SAMPLE: LonLat[] = [[-100.9107, 37.9742], [-100.901525, 37.9742], [-100.901525, 37.981437], [-100.9107, 37.981437]]

interface Field { id: string; name: string; ring: LonLat[] }
interface State { center: LonLat; zoom: number; layer: 'sat' | 'osm'; ring: LonLat[]; name: string; fields: Field[] }
const DEF: State = { center: [-100.9061, 37.9778], zoom: 15, layer: 'sat', ring: SAMPLE, name: 'North quarter', fields: [{ id: 'sample', name: 'North quarter (sample)', ring: SAMPLE }] }

const TILES = {
  sat: { url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
  osm: { url: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, attr: '© OpenStreetMap contributors' },
}

const fmtArea = (m2: number) => ({ ha: m2 / 1e4, ac: m2 / 4046.8564224, km2: m2 / 1e6, sqft: m2 / 0.09290304, m2 })

function kmlRing(text: string): LonLat[] | null {
  const m = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(text)
  if (!m) return null
  const pts = m[1].trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]] as LonLat)
  if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop()
  return pts.length >= 3 ? pts : null
}

export default function FieldAreaMeasurer() {
  const [s, set] = useToolState('field-area-measurer', DEF)
  const [size, setSize] = useState({ w: 800, h: 480 })
  const [mode, setMode] = useState<'draw' | 'walk'>('draw')
  const [walking, setWalking] = useState<'off' | 'gps' | 'demo'>('off')
  const [pos, setPos] = useState<{ p: LonLat; acc: number } | null>(null)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'pan' | 'vertex'; i: number; x: number; y: number; c: [number, number]; moved: boolean } | null>(null)
  const z = s.zoom
  const cpx = project(s.center, z)
  const tl: [number, number] = [cpx[0] - size.w / 2, cpx[1] - size.h / 2]
  const scr = (p: LonLat): [number, number] => {
    const q = project(p, z)
    return [q[0] - tl[0], q[1] - tl[1]]
  }
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const dz = e.deltaY < 0 ? 1 : -1
      const r = el.getBoundingClientRect()
      const lx = e.clientX - r.left, ly = e.clientY - r.top
      set((st) => {
        const z2 = Math.max(3, Math.min(19, st.zoom + dz))
        if (z2 === st.zoom) return st
        const c = project(st.center, st.zoom)
        const under = unproject([c[0] - r.width / 2 + lx, c[1] - r.height / 2 + ly], st.zoom)
        const u2 = project(under, z2)
        return { ...st, zoom: z2, center: unproject([u2[0] - lx + r.width / 2, u2[1] - ly + r.height / 2], z2) }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel) }
  }, [set])

  // walking: real GPS or a simulated walk around the sample field
  useEffect(() => {
    if (walking === 'off') return
    const add = (p: LonLat, acc: number) => {
      setPos({ p, acc })
      set((st) => {
        const last = st.ring[st.ring.length - 1]
        if (acc > 30 || (last && haversine(last, p) < Math.max(3, acc / 2))) return st
        return { ...st, ring: [...st.ring, p], center: p }
      })
    }
    if (walking === 'gps') {
      const id = navigator.geolocation.watchPosition(
        (g) => add([g.coords.longitude, g.coords.latitude], g.coords.accuracy),
        (e) => { setErr(`Location error: ${e.message}`); setWalking('off') },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      )
      return () => navigator.geolocation.clearWatch(id)
    }
    // demo: walk the sample boundary with GPS-like jitter
    let k = 0
    const path: LonLat[] = []
    for (let i = 0; i < 4; i++) {
      const a = SAMPLE[i], b = SAMPLE[(i + 1) % 4]
      for (let t = 0; t < 1; t += 1 / 12) path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    const id = setInterval(() => {
      if (k >= path.length) { setWalking('off'); return }
      const [x, y] = path[k++]
      add([x + (Math.random() - 0.5) * 0.00004, y + (Math.random() - 0.5) * 0.00003], 4 + Math.random() * 4)
    }, 180)
    return () => clearInterval(id)
  }, [walking, set])

  const onDown = (e: React.PointerEvent) => {
    const vi = (e.target as SVGElement).dataset?.vi
    const mi = (e.target as SVGElement).dataset?.mi
    e.currentTarget.setPointerCapture(e.pointerId)
    if (mi !== undefined) {
      // insert a vertex at an edge midpoint and start dragging it
      const i = Number(mi)
      const a = s.ring[i], b = s.ring[(i + 1) % s.ring.length]
      const ring = [...s.ring]
      ring.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
      set({ ring })
      drag.current = { kind: 'vertex', i: i + 1, x: e.clientX, y: e.clientY, c: cpx, moved: false }
      return
    }
    drag.current = vi !== undefined ? { kind: 'vertex', i: Number(vi), x: e.clientX, y: e.clientY, c: cpx, moved: false } : { kind: 'pan', i: -1, x: e.clientX, y: e.clientY, c: cpx, moved: false }
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
      set((st) => ({ ...st, ring: st.ring.map((q, j) => (j === d.i ? p : q)) }))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d && d.kind === 'pan' && !d.moved && mode === 'draw') {
      const [lx, ly] = local(e)
      set({ ring: [...s.ring, unproject([tl[0] + lx, tl[1] + ly], z)] })
    }
  }

  const zoomBy = (dz: number) => set({ zoom: Math.max(3, Math.min(19, z + dz)) })
  const fit = (ring: LonLat[]) => {
    if (ring.length < 2) return
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
    const c: LonLat = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    let zz = 19
    while (zz > 3) {
      const a = project([Math.min(...xs), Math.max(...ys)], zz), b = project([Math.max(...xs), Math.min(...ys)], zz)
      if (b[0] - a[0] < size.w * 0.8 && b[1] - a[1] < size.h * 0.8) break
      zz--
    }
    set({ center: c, zoom: zz })
  }
  const locate = () => {
    setErr('')
    if (!navigator.geolocation) return setErr('Geolocation is not available in this browser.')
    navigator.geolocation.getCurrentPosition((g) => set({ center: [g.coords.longitude, g.coords.latitude], zoom: 17 }), (e) => setErr(`Location error: ${e.message}`), { enableHighAccuracy: true, timeout: 15000 })
  }

  const area = ringArea(s.ring)
  const A = fmtArea(area)
  const per = perimeter(s.ring, s.ring.length > 2)
  const pts = s.ring.map(scr)
  const centroid = pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : [0, 0]
  const t0 = [Math.floor(tl[0] / 256), Math.floor(tl[1] / 256)]
  const t1 = [Math.floor((tl[0] + size.w) / 256), Math.floor((tl[1] + size.h) / 256)]
  const n = 2 ** z
  const tiles: [number, number][] = []
  for (let x = t0[0]; x <= t1[0]; x++) for (let y = t0[1]; y <= t1[1]; y++) if (y >= 0 && y < n) tiles.push([x, y])
  const safeName = (s.name || 'field').replace(/[^\w-]+/g, '_')

  const importFile = async (f: File) => {
    setErr('')
    const text = await f.text()
    let ring: LonLat[] | null = null
    try { ring = /\.kml$/i.test(f.name) || text.trimStart().startsWith('<') ? kmlRing(text) : ringFromGeoJSON(JSON.parse(text)) } catch { ring = null }
    if (!ring) return setErr('No polygon found in that file (GeoJSON or KML expected).')
    set({ ring, name: f.name.replace(/\.\w+$/, '') })
    fit(ring)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Measure">
          <Seg value={mode} onChange={(m) => { setMode(m); if (m === 'draw') setWalking('off') }} options={[['draw', '✏️ Draw on map'], ['walk', '🚶 Walk the boundary']]} />
          {mode === 'draw' ? (
            <Tip>Tap the map to add corners. Drag a corner to move it, drag a small midpoint dot to add a corner on an edge. Scroll or use ± to zoom.</Tip>
          ) : (
            <>
              <Tip>Walk along the field edge with your phone. A point is recorded every few metres when GPS accuracy is better than 30 m. Keep the screen on.</Tip>
              <Row>
                {walking === 'off' ? (
                  <>
                    <Btn kind="primary" disabled={!('geolocation' in navigator)} onClick={() => { setErr(''); set({ ring: [] }); setWalking('gps') }}>▶ Start GPS walk</Btn>
                    <Btn onClick={() => { set({ ring: [], center: [-100.9061, 37.9778], zoom: 15 }); setWalking('demo') }}>Simulate a walk</Btn>
                  </>
                ) : (
                  <Btn kind="danger" onClick={() => setWalking('off')}>■ Stop ({walking === 'demo' ? 'demo' : 'GPS'})</Btn>
                )}
              </Row>
              {pos && <p className="muted" style={{ fontSize: 13 }}>Last fix {pos.p[1].toFixed(6)}, {pos.p[0].toFixed(6)} · ±{num(pos.acc, 0)} m</p>}
            </>
          )}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn onClick={() => set({ ring: s.ring.slice(0, -1) })} disabled={!s.ring.length}>↶ Undo point</Btn>
            <Btn kind="ghost" onClick={() => set({ ring: [] })} disabled={!s.ring.length}>Clear</Btn>
            <Btn kind="ghost" onClick={() => fit(s.ring)} disabled={s.ring.length < 2}>Fit</Btn>
            <Btn kind="ghost" onClick={locate}>📍 My location</Btn>
          </Row>
        </Panel>
        <Panel title="Saved fields">
          <Txt label="Field name" value={s.name} onChange={(name) => set({ name })} />
          <Row>
            <Btn kind="primary" disabled={s.ring.length < 3} onClick={() => set({ fields: [...s.fields, { id: uid(), name: s.name || `Field ${s.fields.length + 1}`, ring: s.ring }] })}>💾 Save field</Btn>
            <Btn disabled={s.ring.length < 3} onClick={() => download(`${safeName}.geojson`, JSON.stringify(toGeoJSON(s.ring, s.name), null, 2), 'application/geo+json')}>⬇ GeoJSON</Btn>
            <Btn disabled={s.ring.length < 3} onClick={() => download(`${safeName}.kml`, toKml(s.ring, s.name), 'application/vnd.google-earth.kml+xml')}>⬇ KML</Btn>
          </Row>
          <FileDrop accept=".geojson,.json,.kml" onFiles={(f) => void importFile(f[0])} label="Import GeoJSON / KML" />
          {s.fields.length > 0 && (
            <Table
              head={['Field', 'Hectares', 'Acres', '']}
              rows={s.fields.map((f) => {
                const a = ringArea(f.ring)
                return [
                  <a key="n" href="#" onClick={(e) => { e.preventDefault(); set({ ring: f.ring, name: f.name }); fit(f.ring) }}>{f.name}</a>,
                  num(a / 1e4, 2),
                  num(a / 4046.8564224, 2),
                  <Btn key="x" kind="ghost" onClick={() => set({ fields: s.fields.filter((x) => x.id !== f.id) })} title="Delete">✕</Btn>,
                ]
              })}
            />
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Area" value={`${num(A.ha, A.ha < 10 ? 3 : 2)} ha`} sub={`${num(A.m2, 0)} m²`} tone="accent" />
          <Stat label="Acres" value={num(A.ac, A.ac < 10 ? 3 : 2)} sub={`${num(A.sqft, 0)} sq ft`} />
          <Stat label="Perimeter" value={per >= 1000 ? `${num(per / 1000, 3)} km` : `${num(per, 1)} m`} sub={`${num(per / 0.3048, 0)} ft`} />
          <Stat label="Corners" value={s.ring.length} sub={s.ring.length < 3 ? 'need at least 3' : `${num(A.km2, 4)} km²`} />
        </Stats>
        <Panel title={s.name || 'Map'} actions={<Seg value={s.layer} onChange={(layer) => set({ layer })} options={[['sat', 'Satellite'], ['osm', 'Map']]} />}>
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => (drag.current = null)}
            style={{ position: 'relative', height: 480, overflow: 'hidden', borderRadius: 10, background: '#1e293b', touchAction: 'none', cursor: mode === 'draw' ? 'crosshair' : 'grab', userSelect: 'none' }}
          >
            {tiles.map(([x, y]) => (
              <img key={`${s.layer}${z}/${x}/${y}`} alt="" draggable={false} src={TILES[s.layer].url(z, ((x % n) + n) % n, y)} width={256} height={256} style={{ position: 'absolute', left: x * 256 - tl[0], top: y * 256 - tl[1], maxWidth: 'none', pointerEvents: 'none' }} />
            ))}
            <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
              {pts.length > 1 && (
                <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={pts.length > 2 ? 'rgba(250,204,21,0.28)' : 'none'} stroke="#facc15" strokeWidth={2.5} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
              )}
              {mode === 'draw' && pts.length > 1 && pts.map((p, i) => {
                if (pts.length < 3 && i === pts.length - 1) return null
                const q = pts[(i + 1) % pts.length]
                return <circle key={`m${i}`} data-mi={i} cx={(p[0] + q[0]) / 2} cy={(p[1] + q[1]) / 2} r={5} fill="rgba(255,255,255,0.55)" stroke="#facc15" strokeWidth={1.5} style={{ cursor: 'copy' }} />
              })}
              {pts.map((p, i) => (
                <circle key={i} data-vi={i} cx={p[0]} cy={p[1]} r={mode === 'draw' ? 8 : 4} fill={i === 0 ? '#22c55e' : '#ffffff'} stroke="#0f172a" strokeWidth={2} style={{ cursor: 'move' }} />
              ))}
              {pts.length > 2 && (
                <text x={centroid[0]} y={centroid[1]} textAnchor="middle" style={{ fill: '#fff', fontWeight: 800, fontSize: 16, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 4, pointerEvents: 'none' }}>
                  {num(A.ha, 2)} ha · {num(A.ac, 1)} ac
                </text>
              )}
              {pos && (() => {
                const [x, y] = scr(pos.p)
                const mpp = (156543.03392 * Math.cos((pos.p[1] * Math.PI) / 180)) / 2 ** z
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={x} cy={y} r={Math.max(8, pos.acc / mpp)} fill="rgba(59,130,246,0.18)" stroke="rgba(59,130,246,0.6)" />
                    <circle cx={x} cy={y} r={7} fill="#3b82f6" stroke="#fff" strokeWidth={2.5} />
                  </g>
                )
              })()}
            </svg>
            <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
              <Btn onClick={() => zoomBy(1)} title="Zoom in">＋</Btn>
              <Btn onClick={() => zoomBy(-1)} title="Zoom out">－</Btn>
            </div>
            <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, background: '#fffc', color: '#333', padding: '0 4px', borderRadius: 4 }}>{TILES[s.layer].attr}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Zoom {z} · {s.center[1].toFixed(5)}, {s.center[0].toFixed(5)} · Area is computed on the WGS84 sphere (same method as Turf.js), so it stays accurate for large fields.</p>
        </Panel>
      </div>
    </Split>
  )
}
