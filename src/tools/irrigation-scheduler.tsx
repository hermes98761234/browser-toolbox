import { useMemo } from 'react'
import { Area, BarChart, Btn, CsvButton, FileDrop, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { balance, CLIMATES, CROPS, doy, et0, kcOn, seasonLength, SOILS, stageName, synthWeather, windAt2m, type Day } from './lib/irrigation-scheduler'

type Src = 'demo' | 'csv'
interface State {
  lat: number; elev: number; climate: number; start: string; crop: number; soil: number; zr: number; mad: number
  eff: number; area: number; rate: number; days: number; src: Src; csv: string; depl0: number
  d1: { tmax: number; tmin: number; rhmax: number; rhmin: number; wind: number; zWind: number; sun: number; lat: number; elev: number; date: string }
}

const SAMPLE_CSV = `date,tmax,tmin,rhmax,rhmin,wind,sun,rain
2025-06-01,27.1,15.2,82,41,2.1,11.2,0
2025-06-02,28.4,16.0,80,38,2.4,11.8,0
2025-06-03,24.9,15.8,92,60,3.0,4.1,6.5
2025-06-04,26.2,14.9,85,45,2.2,10.4,0`

const DEF: State = {
  lat: 41.9, elev: 50, climate: 0, start: '2025-04-15', crop: 0, soil: 3, zr: 0.8, mad: 0.4, eff: 0.9, area: 100, rate: 4, days: 0, src: 'demo', csv: SAMPLE_CSV, depl0: 20,
  d1: { tmax: 21.5, tmin: 12.3, rhmax: 84, rhmin: 63, wind: 10 / 3.6, zWind: 10, sun: 9.25, lat: 50.8, elev: 100, date: '2025-07-06' },
}

const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)

/** Reads a daily weather CSV with flexible headers; missing columns trigger the Hargreaves fallback. */
function parseWeather(text: string): (Day & { date: string; rain: number })[] {
  const rows = parseCsv(text.trim(), detectDelimiter(text))
  if (rows.length < 2) return []
  const h = rows[0].map((x) => x.trim().toLowerCase())
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x.startsWith(n)))
  const ix = { date: col('date', 'day'), tmax: col('tmax', 'max'), tmin: col('tmin', 'min'), rhmax: col('rhmax'), rhmin: col('rhmin'), rh: col('rh', 'hum'), wind: col('wind', 'u2'), sun: col('sun'), rs: col('rs', 'solar', 'rad'), rain: col('rain', 'precip', 'p') }
  const v = (r: string[], i: number) => (i >= 0 && r[i]?.trim() !== '' && Number.isFinite(Number(r[i])) ? Number(r[i]) : undefined)
  return rows.slice(1).filter((r) => r.length > 1 && v(r, ix.tmax) !== undefined && v(r, ix.tmin) !== undefined).map((r) => ({
    date: r[ix.date]?.trim() || '', tmax: v(r, ix.tmax)!, tmin: v(r, ix.tmin)!, rhmax: v(r, ix.rhmax), rhmin: v(r, ix.rhmin),
    rhmean: ix.rhmax < 0 ? v(r, ix.rh) : undefined, u2: v(r, ix.wind), sun: v(r, ix.sun), rs: v(r, ix.rs), rain: v(r, ix.rain) ?? 0,
  }))
}

export default function IrrigationScheduler() {
  const [s, set, reset] = useToolState('irrigation-scheduler', DEF)
  const crop = CROPS[s.crop] ?? CROPS[0]
  const [, fc, wp] = SOILS[s.soil] ?? SOILS[3]
  const taw = 1000 * (fc - wp) * s.zr
  const n = s.days > 0 ? s.days : Math.min(365, seasonLength(crop))

  const weather = useMemo(
    () => (s.src === 'csv' ? parseWeather(s.csv) : synthWeather(CLIMATES[s.climate] ?? CLIMATES[0], s.start, n, s.lat)),
    [s.src, s.csv, s.climate, s.start, n, s.lat],
  )
  const days = weather.map((w, i) => {
    const date = w.date || addDays(s.start, i)
    const e = et0(w, s.lat, s.elev, doy(date))
    return { date, w, e, kc: kcOn(crop, i) }
  })
  const rows = balance(days.map((d) => ({ et0: d.e.et0, rain: d.w.rain, kc: d.kc })), { taw, p: crop.p, mad: s.mad, eff: s.eff, startDepl: (s.depl0 / 100) * taw })
  const events = rows.filter((r) => r.irrNet > 0)
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0)
  const etcTot = sum((r) => r.etc), rainTot = sum((r) => r.rainEff), netTot = sum((r) => r.irrNet), grossTot = sum((r) => r.irrGross)
  const hargDays = days.filter((d) => d.e.method === 'Hargreaves').length
  const stressDays = rows.filter((r) => r.ks < 0.999).length
  const L = (mm: number) => mm * s.area // 1 mm over 1 m² = 1 L
  const runMin = (gross: number) => (gross / (s.rate || 1)) * 60
  const fx = (i: number) => (days[Math.round(i)]?.date ?? '').slice(5)

  // weekly totals
  const weeks: { label: string; value: number[] }[] = []
  rows.forEach((r, i) => {
    const w = Math.floor(i / 7)
    weeks[w] ??= { label: days[i].date.slice(5), value: [0, 0] }
    weeks[w].value[0] += r.rainEff
    weeks[w].value[1] += r.irrNet
  })

  // single-day calculator
  const d1 = s.d1
  const one = et0({ tmax: d1.tmax, tmin: d1.tmin, rhmax: d1.rhmax, rhmin: d1.rhmin, u2: windAt2m(d1.wind, d1.zWind), sun: d1.sun }, d1.lat, d1.elev, doy(d1.date))
  const setD1 = (p: Partial<State['d1']>) => set({ d1: { ...d1, ...p } })

  return (
    <Split wide="right">
      <div>
        <Panel title="Site and season" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Latitude" unit="°" value={s.lat} min={-66} max={66} onChange={(lat) => set({ lat: Math.max(-66, Math.min(66, lat)) })} />
            <Num label="Elevation" unit="m" value={s.elev} onChange={(elev) => set({ elev })} />
          </Row>
          <Row>
            <label className="k-field"><span className="k-label">Planting date</span><input className="k-text" type="date" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></label>
            <Num label="Days to plan" value={s.days} min={0} max={365} onChange={(days) => set({ days: Math.max(0, Math.min(365, Math.round(days))) })} hint={s.days ? undefined : `0 = whole season (${n} d)`} />
          </Row>
          <Seg value={s.src} onChange={(src) => set({ src })} options={[['demo', 'Typical climate'], ['csv', 'My weather data']]} />
          {s.src === 'demo' ? (
            <Select label="Climate" value={s.climate} onChange={(climate) => set({ climate })} options={CLIMATES.map((c, i) => [i, c.name] as [number, string])} />
          ) : (
            <>
              <FileDrop accept=".csv,.txt,text/csv" onFiles={async ([f]) => set({ csv: await f.text() })} label="Drop a daily weather CSV" />
              <Area value={s.csv} onChange={(csv) => set({ csv })} rows={5} mono />
              <p className="muted" style={{ fontSize: 12.5 }}>Columns: date, tmax, tmin (°C), rhmax, rhmin or rh (%), wind (m/s at 2 m), sun (hours) or rs (MJ/m²), rain (mm). Rows without humidity, wind or sun use Hargreaves.</p>
            </>
          )}
        </Panel>
        <Panel title="Crop and soil">
          <Select label="Crop" value={s.crop} onChange={(c) => set({ crop: c, zr: CROPS[c].zr, mad: CROPS[c].p })} options={CROPS.map((c, i) => [i, c.name] as [number, string])} />
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
            Kc {crop.kc.join(' → ')} · stages {crop.stages.join(' / ')} days · FAO depletion fraction p = {crop.p}
          </p>
          <Select label="Soil texture" value={s.soil} onChange={(soil) => set({ soil })} options={SOILS.map(([nm, f, w], i) => [i, `${nm} (FC ${f}, WP ${w})`] as [number, string])} />
          <Row>
            <Num label="Root depth" unit="m" value={s.zr} min={0.1} max={3} onChange={(zr) => set({ zr: Math.max(0.1, zr) })} />
            <Num label="Irrigate at depletion" unit="% TAW" value={Math.round(s.mad * 100)} min={10} max={90} onChange={(v) => set({ mad: Math.max(0.1, Math.min(0.9, v / 100)) })} />
          </Row>
          <Num label="Soil dryness at planting" unit="% TAW" value={s.depl0} min={0} max={100} onChange={(depl0) => set({ depl0: Math.max(0, Math.min(100, depl0)) })} />
        </Panel>
        <Panel title="System">
          <Select label="Irrigation method" value={s.eff} onChange={(eff) => set({ eff })} options={[[0.9, 'Drip (90 % efficient)'], [0.8, 'Micro-sprinkler (80 %)'], [0.75, 'Sprinkler (75 %)'], [0.6, 'Furrow / flood (60 %)']]} />
          <Row>
            <Num label="Area" unit="m²" value={s.area} min={1} onChange={(area) => set({ area: Math.max(1, area) })} />
            <Num label="Application rate" unit="mm/h" value={s.rate} min={0.1} onChange={(rate) => set({ rate: Math.max(0.1, rate) })} />
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Crop water use" value={`${num(etcTot, 0)} mm`} sub={`ETc over ${rows.length} days`} />
          <Stat label="Effective rain" value={`${num(rainTot, 0)} mm`} />
          <Stat label="Irrigations" value={events.length} tone="accent" sub={`${num(netTot, 0)} mm net · ${num(grossTot, 0)} mm gross`} />
          <Stat label="Water to apply" value={`${num(L(grossTot) / 1000, 1)} m³`} sub={`${num(L(grossTot), 0)} L on ${num(s.area)} m²`} />
        </Stats>
        <Note>
          Root zone holds <b>{num(taw, 0)} mm</b> available water (TAW = 1000 × ({fc} − {wp}) × {s.zr} m). Irrigate when {Math.round(s.mad * 100)} % is used ({num(s.mad * taw, 0)} mm), refilling to field capacity.
          {hargDays > 0 && ` ${hargDays} day(s) used the Hargreaves fallback.`}
          {stressDays > 0 && ` Crop was water-stressed on ${stressDays} day(s) — lower the trigger to avoid it.`}
        </Note>
        {!rows.length && <Note tone="warn">No usable weather rows. Each row needs at least tmax and tmin.</Note>}
        <Panel title="Daily evapotranspiration">
          <LineChart
            series={[
              { name: 'ET0 (reference)', points: rows.map((r, i) => [i, r.et0]), color: '#94a3b8' },
              { name: 'ETc (crop)', points: rows.map((r, i) => [i, r.etc]), color: '#10b981', area: true },
            ]}
            fx={fx}
            fy={(v) => num(v, 1)}
            yLabel="mm/day"
            height={220}
          />
        </Panel>
        <Panel title="Root-zone depletion">
          <LineChart
            series={[
              { name: 'Depletion', points: rows.map((r, i) => [i, r.depl]), color: '#f59e0b', area: true },
              { name: 'Irrigation trigger', points: [[0, s.mad * taw], [Math.max(1, rows.length - 1), s.mad * taw]], color: '#0ea5e9', dashed: true },
              { name: 'Stress starts (RAW)', points: [[0, crop.p * taw], [Math.max(1, rows.length - 1), crop.p * taw]], color: '#ef4444', dashed: true },
            ]}
            fx={fx}
            fy={(v) => num(v, 0)}
            yLabel="mm below field capacity"
            yMin={0}
            yMax={Math.max(taw * 0.75, s.mad * taw * 1.15)}
            height={220}
          />
        </Panel>
        <Panel title="Weekly water supply">
          <BarChart bars={weeks} stacks={[{ name: 'Effective rain', color: '#0ea5e9' }, { name: 'Irrigation (net)', color: '#10b981' }]} fy={(v) => num(v, 0)} height={200} />
        </Panel>
        <Panel
          title={`Irrigation schedule (${events.length})`}
          actions={<CsvButton name="irrigation-schedule.csv" rows={() => [['Date', 'Stage', 'Kc', 'Net mm', 'Gross mm', 'Litres', 'Run time min'], ...events.map((r) => [days[r.day].date, stageName(crop, r.day), +r.kc.toFixed(2), +r.irrNet.toFixed(1), +r.irrGross.toFixed(1), Math.round(L(r.irrGross)), Math.round(runMin(r.irrGross))])]} />}
        >
          <Table
            head={['Date', 'Stage', 'Kc', 'Net', 'Gross', 'Volume', 'Run time']}
            rows={events.map((r) => [days[r.day].date, stageName(crop, r.day), num(r.kc, 2), `${num(r.irrNet, 1)} mm`, `${num(r.irrGross, 1)} mm`, `${num(L(r.irrGross), 0)} L`, `${Math.floor(runMin(r.irrGross) / 60)} h ${Math.round(runMin(r.irrGross) % 60)} min`])}
            max={60}
          />
        </Panel>
        <Panel title="Daily ET0 calculator (FAO-56 Penman–Monteith)" actions={<Btn onClick={() => set({ d1: DEF.d1 })}>Load FAO Example 18</Btn>}>
          <Row>
            <Num label="Tmax" unit="°C" value={d1.tmax} onChange={(tmax) => setD1({ tmax })} />
            <Num label="Tmin" unit="°C" value={d1.tmin} onChange={(tmin) => setD1({ tmin })} />
            <Num label="RHmax" unit="%" value={d1.rhmax} min={0} max={100} onChange={(rhmax) => setD1({ rhmax })} />
            <Num label="RHmin" unit="%" value={d1.rhmin} min={0} max={100} onChange={(rhmin) => setD1({ rhmin })} />
          </Row>
          <Row>
            <Num label="Wind" unit="m/s" value={+d1.wind.toFixed(3)} min={0} onChange={(wind) => setD1({ wind })} />
            <Num label="measured at" unit="m" value={d1.zWind} min={2} onChange={(zWind) => setD1({ zWind: Math.max(2, zWind) })} />
            <Num label="Sunshine" unit="h" value={d1.sun} min={0} max={24} onChange={(sun) => setD1({ sun })} />
          </Row>
          <Row>
            <Num label="Latitude" unit="°" value={d1.lat} min={-66} max={66} onChange={(lat) => setD1({ lat })} />
            <Num label="Elevation" unit="m" value={d1.elev} onChange={(elev) => setD1({ elev })} />
            <label className="k-field"><span className="k-label">Date</span><input className="k-text" type="date" value={d1.date} onChange={(e) => e.target.value && setD1({ date: e.target.value })} /></label>
          </Row>
          <Stats>
            <Stat label="ET0" value={`${num(one.et0, 2)} mm/day`} tone="accent" sub={one.method} />
            <Stat label="Net radiation Rn" value={`${num(one.Rn, 2)} MJ/m²`} sub={`Ra ${num(one.Ra, 2)} · Rs ${num(one.Rs, 2)}`} />
            <Stat label="Vapour pressure" value={`${num(one.es - one.ea, 3)} kPa deficit`} sub={`es ${num(one.es, 3)} · ea ${num(one.ea, 3)}`} />
            <Stat label="Day length N" value={`${num(one.N, 1)} h`} sub={`Δ ${num(one.delta, 3)} · γ ${num(one.gamma, 4)}`} />
          </Stats>
          <p className="muted" style={{ fontSize: 12.5 }}>FAO-56 Example 18 (Uccle, Belgium, 6 July) gives ET0 = 3.9 mm/day; this calculator reproduces it.</p>
        </Panel>
      </div>
    </Split>
  )
}
