import { useMemo, useState } from 'react'
import { BarChart, Btn, FileDrop, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { parseGpx, profile, sampleGpx, climb } from './lib/hike-elevation-profile'
import { clock, estimateLeg, estimateProfile, hm, parseClock, reverseProfile, toblerTimeline, withBreaks, type Estimate } from './lib/hiking-time-estimator'

type Method = keyof Estimate
interface State {
  source: 'manual' | 'gpx'; units: 'metric' | 'imperial'; route: 'oneway' | 'outback'
  dist: number; ascent: number; descent: number; descType: keyof typeof DESC
  kmh: number; climbRate: number; method: Method
  fitness: keyof typeof FIT; terrain: keyof typeof TERRAIN; pack: keyof typeof PACK
  perHour: number; longBreak: number; start: string; sunset: string; buffer: number
}

const FIT = { elite: [0.75, 'Very fit / fast'], fit: [0.9, 'Fit regular hiker'], avg: [1, 'Average'], easy: [1.2, 'Leisurely'], kids: [1.45, 'With young children'] } as const
const TERRAIN = { road: [0.95, 'Road / smooth path'], trail: [1, 'Good trail'], rough: [1.2, 'Rough, rocky or muddy'], off: [1.5, 'Off-trail / snow / scramble'] } as const
const PACK = { light: [1, 'Day pack'], heavy: [1.15, 'Heavy pack (> 15 kg)'] } as const
const DESC = { flat: [0, 0, 'Very gradual (< 5°)'], gentle: [1, 0, 'Mostly gentle (5–12°)'], mixed: [0.5, 0.5, 'Mixed'], steep: [0, 1, 'Mostly steep (> 12°)'] } as const

const DEF: State = {
  source: 'manual', units: 'metric', route: 'outback', dist: 7.5, ascent: 950, descent: 80, descType: 'steep',
  kmh: 5, climbRate: 600, method: 'langmuir', fitness: 'avg', terrain: 'trail', pack: 'light',
  perHour: 5, longBreak: 30, start: '08:00', sunset: '18:40', buffer: 45,
}

const METHOD_NAME: Record<Method, string> = { naismith: 'Naismith', langmuir: 'Naismith + Langmuir', tobler: 'Tobler' }
const KM_MI = 1.609344, M_FT = 0.3048

export default function HikingTimeEstimator() {
  const [s, set, reset] = useToolState('hiking-time-estimator', DEF)
  const [gpx, setGpx] = useState<{ name: string; text: string }>(() => ({ name: 'sample', text: sampleGpx() }))
  const [err, setErr] = useState('')
  const imp = s.units === 'imperial'
  const dU = imp ? 'mi' : 'km', hU = imp ? 'ft' : 'm'
  const toD = (km: number) => (imp ? km / KM_MI : km), toH = (m: number) => (imp ? m / M_FT : m)
  const fromD = (v: number) => (imp ? v * KM_MI : v), fromH = (v: number) => (imp ? v * M_FT : v)

  const prof = useMemo(() => {
    try {
      const r = parseGpx(gpx.text)
      return r.pts.length > 1 ? { name: r.name, p: profile(r.pts, 50) } : null
    } catch {
      return null
    }
  }, [gpx])

  const useGpx = s.source === 'gpx' && prof
  const [d1, d2] = [DESC[s.descType][0], DESC[s.descType][1]]
  const legs = useMemo(() => {
    if (useGpx) {
      const p = prof!.p
      const out = estimateProfile(p, s.kmh, s.climbRate)
      const { gain, loss } = climb(p.map((x) => x.e))
      return { out, back: s.route === 'outback' ? estimateProfile(reverseProfile(p), s.kmh, s.climbRate) : null, dist: p[p.length - 1].d / 1000, gain, loss }
    }
    const out = estimateLeg({ distKm: s.dist, ascent: s.ascent, descent: s.descent, gentleFrac: d1, steepFrac: d2 }, s.kmh, s.climbRate)
    const back = s.route === 'outback' ? estimateLeg({ distKm: s.dist, ascent: s.descent, descent: s.ascent, gentleFrac: d1, steepFrac: d2 }, s.kmh, s.climbRate) : null
    return { out, back, dist: s.dist, gain: s.ascent, loss: s.descent }
  }, [useGpx, prof, s.kmh, s.climbRate, s.route, s.dist, s.ascent, s.descent, d1, d2])

  const factor = FIT[s.fitness][0] * TERRAIN[s.terrain][0] * PACK[s.pack][0]
  const outMv = legs.out[s.method], backMv = legs.back ? legs.back[s.method] : 0
  const totalMv = outMv + backMv
  const plan = withBreaks(totalMv, factor, s.perHour, s.longBreak)
  // split breaks proportionally; the long break happens at the turnaround point
  const outT = outMv * factor * (1 + s.perHour / 60) + (legs.back ? s.longBreak / 60 : 0)
  const backT = backMv * factor * (1 + s.perHour / 60)
  const start = parseClock(s.start), sunset = parseClock(s.sunset)
  const deadline = sunset - s.buffer
  const finish = start + plan.total * 60
  const margin = deadline - finish
  const turnAt = legs.back ? deadline - backT * 60 : NaN
  const latestStart = deadline - plan.total * 60
  const badTime = !Number.isFinite(start) || !Number.isFinite(sunset)

  const timeline = useMemo(() => {
    if (!useGpx) return null
    const p = prof!.p
    const t = toblerTimeline(p)
    const scale = legs.out[s.method] / (t[t.length - 1] || 1)
    const marks: { x: number; label: string }[] = []
    let next = 1
    t.forEach((h, i) => {
      const hh = h * scale * factor * (1 + s.perHour / 60)
      if (hh >= next) {
        marks.push({ x: toD(p[i].d / 1000), label: `${next} h` })
        next++
      }
    })
    return { pts: p.map((x) => [toD(x.d / 1000), toH(x.e)] as [number, number]), marks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGpx, prof, legs, s.method, factor, s.perHour, imp])

  const onFile = async (f: File) => {
    const text = await f.text()
    try {
      const r = parseGpx(text)
      if (r.pts.length < 2) throw new Error('No track points found.')
      setGpx({ name: f.name, text })
      set({ source: 'gpx' })
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read the file.')
    }
  }

  const methodRows = (Object.keys(METHOD_NAME) as Method[]).map((k) => {
    const mv = legs.out[k] + (legs.back ? legs.back[k] : 0)
    const w = withBreaks(mv, factor, s.perHour, s.longBreak)
    return { k, out: legs.out[k], back: legs.back?.[k], mv, total: w.total }
  })

  return (
    <Split>
      <div>
        <Panel title="Route">
          <Row>
            <Seg value={s.source} onChange={(source) => set({ source })} options={[['manual', 'Enter numbers'], ['gpx', 'GPX track']]} />
            <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'km / m'], ['imperial', 'mi / ft']]} />
          </Row>
          <Seg value={s.route} onChange={(route) => set({ route })} options={[['outback', 'Out and back'], ['oneway', 'Loop / one-way']]} />
          {s.source === 'manual' ? (
            <>
              <p className="muted" style={{ fontSize: 13 }}>{s.route === 'outback' ? 'Enter the one-way leg to the turnaround point; the return is the same path reversed.' : 'Enter totals for the whole route.'}</p>
              <Row>
                <Num label="Distance" value={+toD(s.dist).toFixed(2)} onChange={(v) => set({ dist: Math.max(0, fromD(v)) })} unit={dU} min={0} />
                <Num label="Total ascent" value={Math.round(toH(s.ascent))} onChange={(v) => set({ ascent: Math.max(0, fromH(v)) })} unit={hU} min={0} />
                <Num label="Total descent" value={Math.round(toH(s.descent))} onChange={(v) => set({ descent: Math.max(0, fromH(v)) })} unit={hU} min={0} />
              </Row>
              <Select label="Descents are…" value={s.descType} onChange={(descType) => set({ descType })} options={Object.entries(DESC).map(([k, v]) => [k as State['descType'], v[2]] as [State['descType'], string])} />
            </>
          ) : (
            <>
              <FileDrop accept=".gpx,application/gpx+xml" onFiles={([f]) => void onFile(f)} label="Drop a GPX file (track or route) or click to choose" />
              {err && <Note tone="err">{err}</Note>}
              {prof ? (
                <p style={{ fontSize: 14 }}>
                  <b>{prof.name}</b> ({gpx.name === 'sample' ? 'built-in sample' : gpx.name}): {toD(legs.dist).toFixed(2)} {dU}, ↑ {Math.round(toH(legs.gain))} {hU}, ↓ {Math.round(toH(legs.loss))} {hU}
                  {s.route === 'outback' && ' (one way)'}
                </p>
              ) : <Note tone="warn">This GPX has no usable points.</Note>}
            </>
          )}
        </Panel>
        <Panel title="Pace & adjustments">
          <Row>
            <Num label="Flat walking speed" value={s.kmh} onChange={(kmh) => set({ kmh: Math.max(0.5, kmh) })} unit="km/h" min={0.5} step={0.5} hint="Naismith: 5 km/h (3 mph)" />
            <Num label="Climb rate" value={s.climbRate} onChange={(climbRate) => set({ climbRate: Math.max(50, climbRate) })} unit="m/h" min={50} hint="Naismith: 600 m/h (2000 ft/h)" />
          </Row>
          <Select label="Fitness" value={s.fitness} onChange={(fitness) => set({ fitness })} options={Object.entries(FIT).map(([k, v]) => [k as State['fitness'], `${v[1]} ×${v[0]}`] as [State['fitness'], string])} />
          <Select label="Terrain" value={s.terrain} onChange={(terrain) => set({ terrain })} options={Object.entries(TERRAIN).map(([k, v]) => [k as State['terrain'], `${v[1]} ×${v[0]}`] as [State['terrain'], string])} />
          <Select label="Load" value={s.pack} onChange={(pack) => set({ pack })} options={Object.entries(PACK).map(([k, v]) => [k as State['pack'], `${v[1]} ×${v[0]}`] as [State['pack'], string])} />
          <Row>
            <Num label="Short breaks" value={s.perHour} onChange={(perHour) => set({ perHour: Math.max(0, perHour) })} unit="min / hour" min={0} />
            <Num label="Long break" value={s.longBreak} onChange={(longBreak) => set({ longBreak: Math.max(0, longBreak) })} unit="min" min={0} />
          </Row>
        </Panel>
        <Panel title="Daylight">
          <Row>
            <Txt label="Start time" value={s.start} onChange={(start) => set({ start })} type="time" />
            <Txt label="Sunset" value={s.sunset} onChange={(sunset) => set({ sunset })} type="time" />
            <Num label="Safety buffer" value={s.buffer} onChange={(buffer) => set({ buffer: Math.max(0, buffer) })} unit="min" min={0} />
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Planned duration" value={hm(plan.total)} tone="accent" sub={`${hm(plan.moving)} moving + ${hm(plan.breaks)} breaks`} />
          <Stat label="Back at" value={badTime ? '—' : clock(finish)} tone={margin >= 0 ? 'good' : 'bad'} sub={badTime ? '' : margin >= 0 ? `${hm(margin / 60)} before your deadline` : `${hm(-margin / 60)} after your deadline`} />
          {legs.back ? (
            <Stat label="Turnaround time" value={badTime ? '—' : clock(turnAt)} tone="accent" sub="turn back by then, wherever you are" />
          ) : (
            <Stat label="Latest start" value={badTime ? '—' : clock(latestStart)} sub="to finish before the deadline" />
          )}
          <Stat label="Deadline" value={badTime ? '—' : clock(deadline)} sub={`sunset − ${s.buffer} min`} />
        </Stats>
        {!badTime && margin < 0 && (
          <Note tone="err">
            At this pace you finish after dark. Start by <b>{clock(latestStart)}</b>, shorten the route{legs.back ? <>, or turn back at <b>{clock(turnAt)}</b> even if you haven’t reached the goal</> : ''}.
          </Note>
        )}
        {!badTime && legs.back && margin >= 0 && (
          <Note tone="ok">
            You should reach the turnaround point around <b>{clock(start + outT * 60)}</b>. If you are not there by <b>{clock(turnAt)}</b>, turn back anyway: descending in the dark is the most common way day hikes go wrong.
          </Note>
        )}
        <Panel title="Method comparison">
          <Seg value={s.method} onChange={(method) => set({ method })} options={(Object.keys(METHOD_NAME) as Method[]).map((k) => [k, METHOD_NAME[k]] as [Method, string])} />
          <Table
            head={['Method', legs.back ? 'Out' : 'Route', ...(legs.back ? ['Back'] : []), 'Moving (raw)', 'Planned (adjusted + breaks)']}
            rows={methodRows.map((r) => [
              <b key="m" style={{ color: r.k === s.method ? 'var(--accent)' : undefined }}>{METHOD_NAME[r.k]}{r.k === s.method ? ' ✓' : ''}</b>,
              hm(r.out), ...(legs.back ? [hm(r.back ?? 0)] : []), hm(r.mv), <b key="t">{hm(r.total)}</b>,
            ])}
          />
          <BarChart bars={methodRows.map((r) => ({ label: METHOD_NAME[r.k].replace('Naismith + ', '+'), value: +r.total.toFixed(2), color: r.k === s.method ? 'var(--accent)' : 'var(--muted)' }))} height={160} fy={(v) => `${v.toFixed(1)} h`} />
          <p className="muted" style={{ fontSize: 13 }}>Combined adjustment factor ×{factor.toFixed(2)} (fitness × terrain × load).</p>
        </Panel>
        {timeline && (
          <Panel title="Elevation profile with time markers">
            <LineChart series={[{ name: 'Elevation', points: timeline.pts, area: true }]} markers={timeline.marks} xLabel={`Distance (${dU}, one way)`} fx={(v) => v.toFixed(1)} fy={(v) => `${Math.round(v)} ${hU}`} yMin={Math.min(...timeline.pts.map((p) => p[1])) - 50} />
          </Panel>
        )}
        <Panel title="The formulas">
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            <li><b>Naismith (1892):</b> 1 hour per 5 km (3 mi) of distance, plus 1 hour per 600 m (2000 ft) of ascent.</li>
            <li><b>Langmuir’s corrections:</b> subtract 10 min per 300 m of descent on gentle slopes (5–12°), add 10 min per 300 m on steep slopes (over 12°).</li>
            <li><b>Tobler’s hiking function (1993):</b> speed = 6·e<sup>−3.5·|slope + 0.05|</sup> km/h, fastest (6 km/h) on a gentle 5% downhill, so steep descents slow you down too. {s.source === 'manual' ? 'From totals, the distance is split into an uphill and a downhill part at average gradients.' : 'Applied to every segment of the smoothed GPX profile.'}</li>
            <li>None of them include stops, navigation, weather or group pace: that is what the factors and breaks are for. Compare with your own past hikes and adjust the speed.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
