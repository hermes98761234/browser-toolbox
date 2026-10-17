import { useMemo, useState } from 'react'
import { Btn, CsvButton, FileDrop, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { climb, naismith, parseCsv, parseGpx, profile, sampleGpx, toblerHours, type ProfilePt, type Route } from './lib/hike-elevation-profile'

const DEF = { units: 'metric' as 'metric' | 'imperial', kmh: 5, climbRate: 600, threshold: 3, smooth: 50, start: '08:00', breaks: 10 }
const GRADES: [number, string, string][] = [[3, '#10b981', '< 3%'], [8, '#84cc16', '3–8%'], [15, '#f59e0b', '8–15%'], [25, '#f97316', '15–25%'], [Infinity, '#ef4444', '> 25%']]
const gradeColor = (g: number) => GRADES.find(([lim]) => Math.abs(g) < lim)![1]
const hm = (h: number) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
const clock = (start: string, h: number) => {
  const [a, b] = start.split(':').map(Number)
  const m = Math.round((a || 0) * 60 + (b || 0) + h * 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export default function HikeElevationProfile() {
  const [s, set, reset] = useToolState('hike-elevation-profile', DEF)
  const [route, setRoute] = useState<Route>(() => parseGpx(sampleGpx()))
  const [err, setErr] = useState('')
  const [hover, setHover] = useState<number | null>(null)
  const imp = s.units === 'imperial'
  const L = (m: number) => (imp ? `${num(m / 1609.344, 2)} mi` : `${num(m / 1000, 2)} km`)
  const E = (m: number) => (imp ? `${num(m * 3.28084, 0)} ft` : `${num(m, 0)} m`)

  const p = useMemo(() => profile(route.pts, s.smooth), [route, s.smooth])
  const ok = p.length >= 2 && p[p.length - 1].d > 0
  const total = ok ? p[p.length - 1].d : 0
  const { gain, loss } = useMemo(() => climb(p.map((x) => x.e), s.threshold), [p, s.threshold])
  const nai = useMemo(() => naismith(p, s.kmh, s.climbRate), [p, s.kmh, s.climbRate])
  const tob = useMemo(() => toblerHours(p), [p])
  const es = p.map((x) => x.e)
  const hi = Math.max(...es), lo = Math.min(...es)
  const times = route.pts.map((x) => x.time).filter((t): t is number => Number.isFinite(t))
  const recorded = times.length > 1 ? (times[times.length - 1] - times[0]) / 3600000 : 0

  // resample every ~stepM metres for grades / drawing
  const segs = useMemo(() => {
    const out: { a: ProfilePt; b: ProfilePt; g: number }[] = []
    const step = Math.max(25, total / 300)
    let j = 0
    for (let i = 1; i < p.length; i++) {
      if (p[i].d - p[j].d < step && i < p.length - 1) continue
      out.push({ a: p[j], b: p[i], g: ((p[i].e - p[j].e) / (p[i].d - p[j].d || 1)) * 100 })
      j = i
    }
    return out
  }, [p, total])
  const maxUp = Math.max(0, ...segs.map((x) => x.g)), maxDown = Math.min(0, ...segs.map((x) => x.g))

  // splits per km / mile
  const unit = imp ? 1609.344 : 1000
  const splits = useMemo(() => {
    const rows: { n: number; d: number; gain: number; loss: number; h: number }[] = []
    let k = 0, from = 0
    for (let i = 1; i <= p.length; i++) {
      if (i < p.length && p[i].d < (k + 1) * unit) continue
      const part = p.slice(from, Math.min(i + 1, p.length))
      if (part.length > 1) {
        const c = climb(part.map((x) => x.e), s.threshold)
        rows.push({ n: k + 1, d: part[part.length - 1].d - part[0].d, gain: c.gain, loss: c.loss, h: naismith(part, s.kmh, s.climbRate).hours })
      }
      from = Math.min(i, p.length - 1)
      k++
    }
    return rows
  }, [p, unit, s.threshold, s.kmh, s.climbRate])
  const splitScale = nai.hours / (splits.reduce((a, r) => a + r.h, 0) || 1)

  const load = async (f: File) => {
    setErr('')
    const text = await f.text()
    const r = /<gpx/i.test(text) ? parseGpx(text) : parseCsv(text)
    if (r.pts.length < 2) return setErr('No track points found. Use a GPX file with <trkpt>/<rtept> points or a CSV with lat,lon,ele or distance_km,elevation_m.')
    if (/<gpx/i.test(text) && r.name === 'Route') r.name = f.name.replace(/\.\w+$/, '')
    setRoute(r)
  }

  // chart geometry
  const W = 1000, H = 300, PL = 56, PR = 12, PT = 14, PB = 32
  const y0 = Math.floor((lo - (hi - lo) * 0.1) / 50) * 50, y1 = Math.ceil((hi + (hi - lo) * 0.08) / 50) * 50 || 1
  const sx = (d: number) => PL + (d / (total || 1)) * (W - PL - PR)
  const sy = (e: number) => PT + (1 - (e - y0) / (y1 - y0 || 1)) * (H - PT - PB)
  const hp = hover !== null && ok ? p.reduce((b, x) => (Math.abs(x.d - hover) < Math.abs(b.d - hover) ? x : b), p[0]) : null
  const hg = hp ? segs.find((x) => x.a.d <= hp.d && x.b.d >= hp.d)?.g ?? 0 : 0
  const ticksY = Array.from({ length: 6 }, (_, i) => y0 + ((y1 - y0) * i) / 5)
  const tickStep = [0.5, 1, 2, 5, 10, 20, 50].find((t) => (total / unit) / t <= 10) ?? 100

  // map projection
  const lat0 = ok ? p.reduce((a, x) => a + x.lat, 0) / p.length : 0
  const mx = p.map((x) => x.lon * Math.cos((lat0 * Math.PI) / 180)), my = p.map((x) => -x.lat)
  const bx = [Math.min(...mx), Math.max(...mx)], by = [Math.min(...my), Math.max(...my)]
  const ms = Math.max(bx[1] - bx[0], by[1] - by[0]) || 1
  const MW = 300
  const mp = (i: number) => [10 + ((mx[i] - bx[0]) / ms) * (MW - 20), 10 + ((my[i] - by[0]) / ms) * (MW - 20)] as const
  const mapPts = p.map((_, i) => mp(i).join(',')).join(' ')
  const hpIdx = hp ? p.indexOf(hp) : -1
  const totalH = nai.hours * (1 + s.breaks / 60)

  return (
    <Split wide="right">
      <div>
        <Panel title="Route" actions={<Btn kind="ghost" onClick={() => { setRoute(parseGpx(sampleGpx())); reset() }}>Sample</Btn>}>
          <FileDrop accept=".gpx,.csv,.txt,application/gpx+xml" label="Drop a GPX (or CSV) file" onFiles={([f]) => void load(f)} />
          {err && <Note tone="err">{err}</Note>}
          <p style={{ margin: '10px 0 0' }}><b>{route.name}</b> <span className="muted">· {route.pts.length} points{recorded ? ` · recorded ${hm(recorded)} h` : ''}</span></p>
        </Panel>
        <Panel title="Pace model">
          <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'km / m'], ['imperial', 'mi / ft']]} label="Units" />
          <Row>
            <Num label="Flat speed" value={s.kmh} onChange={(kmh) => set({ kmh })} unit="km/h" min={1} max={10} />
            <Num label="Climb rate" value={s.climbRate} onChange={(climbRate) => set({ climbRate })} unit="m/h" min={100} max={1500} hint="Naismith: 600 m/h" />
          </Row>
          <Row>
            <Num label="Start time" value={Number(s.start.split(':')[0])} onChange={(h) => set({ start: `${String(Math.max(0, Math.min(23, Math.round(h)))).padStart(2, '0')}:${s.start.split(':')[1] ?? '00'}` })} unit="h" min={0} max={23} step={1} />
            <Num label="Breaks" value={s.breaks} onChange={(breaks) => set({ breaks })} unit="min/h" min={0} max={30} />
          </Row>
          <Slider label="Elevation smoothing" value={s.smooth} onChange={(smooth) => set({ smooth })} min={0} max={200} step={10} unit=" m" />
          <Slider label="Climb threshold (noise filter)" value={s.threshold} onChange={(threshold) => set({ threshold })} min={0} max={10} step={0.5} unit=" m" />
          <p className="muted" style={{ fontSize: 13 }}>Naismith's rule: 1 h per 5 km plus 1 h per 600 m of ascent, with Langmuir's corrections for descents. Tobler's hiking function integrates speed over every slope.</p>
        </Panel>
        <Panel title="Track">
          {ok && (
            <svg viewBox={`0 0 ${MW} ${MW}`} style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }} role="img" aria-label="Route map">
              <polyline points={mapPts} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinejoin="round" />
              <circle cx={mp(0)[0]} cy={mp(0)[1]} r={6} fill="#10b981" stroke="#fff" strokeWidth={2}><title>Start</title></circle>
              <circle cx={mp(p.length - 1)[0]} cy={mp(p.length - 1)[1]} r={4} fill="#ef4444"><title>Finish</title></circle>
              {(() => { const i = es.indexOf(hi); return <text x={mp(i)[0]} y={mp(i)[1] - 8} textAnchor="middle" fontSize={14}>▲</text> })()}
              {hpIdx >= 0 && <circle cx={mp(hpIdx)[0]} cy={mp(hpIdx)[1]} r={7} fill="none" stroke="#f59e0b" strokeWidth={3} />}
            </svg>
          )}
          <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>North up · ● start ▲ high point</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Distance" value={L(total)} />
          <Stat label="Ascent / descent" value={`↑${E(gain)}`} sub={`↓${E(loss)}`} />
          <Stat label="High / low" value={E(hi)} sub={`low ${E(lo)}`} />
          <Stat label="Naismith time" value={`${hm(nai.hours)} h`} tone="accent" sub={`${hm(totalH)} h with breaks · Tobler ${hm(tob)} h`} />
        </Stats>
        <Panel title="Elevation profile">
          {!ok ? <Note>Load a route to see its profile.</Note> : (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', touchAction: 'none' }}
                onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(total, ((x - PL) / (W - PL - PR)) * total))) }}
                onPointerLeave={() => setHover(null)} role="img" aria-label="Elevation profile">
                {ticksY.map((v) => (
                  <g key={v}>
                    <line x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
                    <text x={PL - 6} y={sy(v) + 4} textAnchor="end" fontSize={13} fill="var(--muted)">{E(v)}</text>
                  </g>
                ))}
                {Array.from({ length: Math.floor(total / unit / tickStep) + 1 }, (_, i) => i * tickStep).map((k) => (
                  <text key={k} x={sx(k * unit)} y={H - 10} textAnchor="middle" fontSize={13} fill="var(--muted)">{k}{imp ? ' mi' : ' km'}</text>
                ))}
                {segs.map((x, i) => (
                  <path key={i} d={`M${sx(x.a.d)},${sy(x.a.e)}L${sx(x.b.d)},${sy(x.b.e)}L${sx(x.b.d)},${sy(y0)}L${sx(x.a.d)},${sy(y0)}Z`} fill={gradeColor(x.g)} opacity={0.55} stroke={gradeColor(x.g)} strokeWidth={0.6} />
                ))}
                <polyline points={segs.map((x) => `${sx(x.a.d)},${sy(x.a.e)}`).concat(segs.length ? [`${sx(segs[segs.length - 1].b.d)},${sy(segs[segs.length - 1].b.e)}`] : []).join(' ')} fill="none" stroke="var(--fg)" strokeWidth={2} />
                {hp && (
                  <g>
                    <line x1={sx(hp.d)} x2={sx(hp.d)} y1={PT} y2={H - PB} stroke="var(--muted)" strokeDasharray="4 3" />
                    <circle cx={sx(hp.d)} cy={sy(hp.e)} r={5} fill="#f59e0b" />
                    <g transform={`translate(${Math.min(sx(hp.d) + 10, W - 190)} ${PT + 4})`}>
                      <rect width={180} height={56} rx={8} fill="var(--panel)" stroke="var(--line)" />
                      <text x={10} y={20} fontSize={14} fill="var(--fg)" fontWeight={700}>{L(hp.d)} · {E(hp.e)}</text>
                      <text x={10} y={42} fontSize={13} fill={gradeColor(hg)}>grade {hg >= 0 ? '+' : ''}{num(hg, 1)}%</text>
                    </g>
                  </g>
                )}
              </svg>
              <div className="k-legend">
                {GRADES.map(([, c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
                <span className="muted">steepest ↑{num(maxUp, 0)}% ↓{num(-maxDown, 0)}%</span>
              </div>
            </>
          )}
        </Panel>
        <Panel title={`Splits per ${imp ? 'mile' : 'km'}`} actions={<CsvButton name="hike-splits.csv" rows={() => [['Split', 'Distance m', 'Gain m', 'Loss m', 'Time h', 'ETA'], ...splits.reduce<{ acc: number; rows: (string | number)[][] }>((o, r) => { o.acc += r.h * splitScale; o.rows.push([r.n, Math.round(r.d), Math.round(r.gain), Math.round(r.loss), +(r.h * splitScale).toFixed(2), clock(s.start, o.acc * (1 + s.breaks / 60))]); return o }, { acc: 0, rows: [] }).rows]} />}>
          <Table
            head={['#', 'Ascent', 'Descent', 'Avg grade', 'Time', 'ETA']}
            rows={splits.reduce<{ acc: number; rows: React.ReactNode[][] }>((o, r) => {
              const h = r.h * splitScale
              o.acc += h
              o.rows.push([r.n, `↑${E(r.gain)}`, `↓${E(r.loss)}`, <span key="g" style={{ color: gradeColor(((r.gain - r.loss) / (r.d || 1)) * 100) }}>{num(((r.gain - r.loss) / (r.d || 1)) * 100, 1)}%</span>, `${Math.round(h * 60)} min`, clock(s.start, o.acc * (1 + s.breaks / 60))])
              return o
            }, { acc: 0, rows: [] }).rows}
            max={30}
          />
          <p className="muted" style={{ fontSize: 13 }}>Starting at {s.start}, you'd finish around <b>{clock(s.start, nai.hours * (1 + s.breaks / 60))}</b>. Add margin for navigation, weather and group pace, and check sunset time.</p>
        </Panel>
      </div>
    </Split>
  )
}
