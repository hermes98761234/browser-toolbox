import { Btn, CsvButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { dawes, exitPupil, focalRatio, imageScale, lightGrasp, limitingMag, magnification, maxUseful, minUseful, pupilForAge, pupilUse, rayleigh, trueField } from './lib/telescope-calculator'

interface Ep { id: string; name: string; focal: number; afov: number; fieldStop: number }
interface State { aperture: number; focal: number; obstruction: number; barlow: number; age: number; pixel: number; sensorW: number; sensorH: number; eps: Ep[] }

const SCOPES: [string, number, number, number][] = [
  ['80 mm f/5 refractor', 80, 400, 0], ['102 mm f/7 refractor', 102, 714, 0], ['90 mm Maksutov', 90, 1250, 0.33],
  ['130 mm f/5 Newtonian', 130, 650, 0.25], ['8" f/6 Dobsonian', 203, 1200, 0.23], ['10" f/5 Dobsonian', 254, 1270, 0.23],
  ['8" f/10 SCT', 203, 2032, 0.34], ['11" f/10 SCT', 279, 2800, 0.34], ['16" f/4.5 Dobsonian', 406, 1829, 0.2],
]

const e = (name: string, focal: number, afov: number, fieldStop = 0): Ep => ({ id: uid(), name, focal, afov, fieldStop })
const DEF: State = {
  aperture: 203, focal: 1200, obstruction: 0.23, barlow: 1, age: 40, pixel: 3.76, sensorW: 23.5, sensorH: 15.6,
  eps: [e('32 mm Plössl', 32, 52, 27), e('25 mm Plössl', 25, 52, 0), e('15 mm wide-angle', 15, 66, 0), e('10 mm Plössl', 10, 52, 0), e('6 mm planetary', 6, 58, 0), e('3.5 mm ultra-wide', 3.5, 82, 0)],
}

/** What each eyepiece shows: its circular field with the full Moon (0.52°) drawn to scale. */
function FovView({ items }: { items: { name: string; tf: number; mag: number; color: string }[] }) {
  const S = 130, R = S / 2 - 4
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
      {items.map((it, k) => {
        const mr = (0.26 / (it.tf / 2)) * R
        return (
          <figure key={it.name + k} style={{ margin: 0, textAlign: 'center' }}>
            <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 160 }} role="img" aria-label={`${it.name} field of view`}>
              <defs>
                <clipPath id={`fov${k}`}><circle cx={S / 2} cy={S / 2} r={R} /></clipPath>
              </defs>
              <circle cx={S / 2} cy={S / 2} r={R} fill="#0b1020" />
              <g clipPath={`url(#fov${k})`}>
                {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={(i * 53 + k * 17) % S} cy={(i * 97 + k * 29) % S} r={i % 5 === 0 ? 1.2 : 0.6} fill="#cbd5e1" />)}
                <circle cx={S / 2} cy={S / 2} r={mr} fill="#e5e7eb" />
                <circle cx={S / 2 - mr * 0.3} cy={S / 2 - mr * 0.2} r={mr * 0.18} fill="#cbd5e1" />
                <circle cx={S / 2 + mr * 0.35} cy={S / 2 + mr * 0.25} r={mr * 0.14} fill="#cbd5e1" />
              </g>
              <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke={it.color} strokeWidth={3} />
            </svg>
            <figcaption style={{ fontSize: 12.5 }}><b>{it.name}</b><br /><span className="muted">{num(it.mag, 0)}× · {num(it.tf, 2)}°</span></figcaption>
          </figure>
        )
      })}
    </div>
  )
}

const COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#f87171', '#a3e635']

export default function TelescopeCalculator() {
  const [s, set, reset] = useToolState('telescope-calculator', DEF)
  const scope = { aperture: s.aperture, focal: s.focal, obstruction: s.obstruction }
  const eye = pupilForAge(s.age)
  const fr = focalRatio(scope)
  const rows = [...s.eps].sort((a, b) => b.focal - a.focal).map((ep, i) => {
    const mag = magnification(s.focal, ep.focal, s.barlow)
    const xp = exitPupil(s.aperture, mag)
    const tf = trueField(scope, { focal: ep.focal, afov: ep.afov, fieldStop: ep.fieldStop || undefined }, s.barlow)
    return { ep, mag, xp, tf, use: pupilUse(xp, eye), color: COLORS[i % COLORS.length] }
  })
  const edit = (id: string, p: Partial<Ep>) => set({ eps: s.eps.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const preset = SCOPES.find(([, a, f]) => a === s.aperture && f === s.focal)?.[0] ?? ''
  const fovW = (s.sensorW / s.focal) * (180 / Math.PI) * 60, fovH = (s.sensorH / s.focal) * (180 / Math.PI) * 60
  // eyepiece that would give an exit pupil of ~eye pupil, ~2 mm and the highest useful power
  const fe = (xp: number) => (xp * fr) / s.barlow

  return (
    <Split wide="right">
      <div>
        <Panel title="Telescope" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={preset} onChange={(k) => {
            const p = SCOPES.find(([n]) => n === k)
            if (p) set({ aperture: p[1], focal: p[2], obstruction: p[3] })
          }} options={[['', '— custom —'], ...SCOPES.map(([n]) => [n, n] as [string, string])]} />
          <Row>
            <Num label="Aperture" unit="mm" value={s.aperture} min={20} onChange={(aperture) => set({ aperture: Math.max(20, aperture) })} />
            <Num label="Focal length" unit="mm" value={s.focal} min={100} onChange={(focal) => set({ focal: Math.max(100, focal) })} />
          </Row>
          <Row>
            <Num label="Central obstruction" unit="%" value={Math.round(s.obstruction * 100)} min={0} max={60} onChange={(v) => set({ obstruction: Math.max(0, Math.min(0.6, v / 100)) })} />
            <Select label="Barlow / reducer" value={s.barlow} onChange={(barlow) => set({ barlow })} options={[[0.63, '0.63× reducer'], [1, 'None (1×)'], [1.5, '1.5× Barlow'], [2, '2× Barlow'], [2.5, '2.5× Barlow'], [3, '3× Barlow'], [5, '5× Powermate']]} />
          </Row>
          <Num label="Observer age" unit="years" value={s.age} min={5} max={100} onChange={(age) => set({ age })} hint={`Dark-adapted pupil ≈ ${num(eye, 1)} mm`} />
        </Panel>
        <Panel title="Eyepiece suggestions">
          <Table
            head={['Goal', 'Eyepiece', 'Power']}
            rows={[
              ['Lowest useful power', `${num(fe(eye), 1)} mm`, `${num(minUseful(s.aperture, eye), 0)}×`],
              ['Deep-sky sweet spot (2.5 mm pupil)', `${num(fe(2.5), 1)} mm`, `${num(s.aperture / 2.5, 0)}×`],
              ['Planets, typical seeing (1 mm)', `${num(fe(1), 1)} mm`, `${num(s.aperture, 0)}×`],
              ['Highest useful power', `${num(fe(0.5), 1)} mm`, `${num(maxUseful(s.aperture), 0)}×`],
            ]}
          />
          <p className="muted" style={{ fontSize: 12.5 }}>Eyepiece focal length = exit pupil × focal ratio{ s.barlow !== 1 ? ' ÷ Barlow' : ''}. Seeing usually caps real-world power near 250–300×.</p>
        </Panel>
        <Panel title="Camera (prime focus)">
          <Row>
            <Num label="Pixel size" unit="µm" value={s.pixel} min={0.5} onChange={(pixel) => set({ pixel })} />
            <Num label="Sensor width" unit="mm" value={s.sensorW} min={1} onChange={(sensorW) => set({ sensorW })} />
            <Num label="Sensor height" unit="mm" value={s.sensorH} min={1} onChange={(sensorH) => set({ sensorH })} />
          </Row>
          <Stats>
            <Stat label="Image scale" value={`${num(imageScale(s.focal, s.pixel), 2)}″/px`} sub={imageScale(s.focal, s.pixel) < 0.67 ? 'Oversampled for 2″ seeing' : imageScale(s.focal, s.pixel) > 2 ? 'Undersampled' : 'Well matched to typical seeing'} />
            <Stat label="Field" value={`${num(fovW, 0)}′ × ${num(fovH, 0)}′`} sub={`${num(fovW / 60, 2)}° × ${num(fovH / 60, 2)}°`} />
          </Stats>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Focal ratio" value={`f/${num(fr, 1)}`} sub={fr < 6 ? 'Fast: wide fields' : fr > 9 ? 'Slow: high power, small fields' : 'Medium'} />
          <Stat label="Resolution" value={`${num(dawes(s.aperture), 2)}″`} sub={`Dawes · Rayleigh ${num(rayleigh(s.aperture), 2)}″`} />
          <Stat label="Limiting magnitude" value={num(limitingMag(s.aperture), 1)} sub="dark sky, visual" />
          <Stat label="Light grasp" value={`${num(lightGrasp(scope, eye), 0)}×`} sub="vs. your eye" tone="accent" />
          <Stat label="Useful power" value={`${num(minUseful(s.aperture, eye), 0)}–${num(maxUseful(s.aperture), 0)}×`} />
        </Stats>
        <Panel
          title="Eyepiece comparison"
          actions={
            <>
              <Btn onClick={() => set({ eps: [...s.eps, e('New eyepiece', 20, 60)] })}>+ Eyepiece</Btn>
              <CsvButton name="eyepieces.csv" rows={() => [['Eyepiece', 'Focal mm', 'AFOV °', 'Magnification', 'Exit pupil mm', 'True field °', 'Best for'], ...rows.map((r) => [r.ep.name, r.ep.focal, r.ep.afov, +r.mag.toFixed(1), +r.xp.toFixed(2), +r.tf.toFixed(3), r.use.label])]} />
            </>
          }
        >
          <Table
            head={['Eyepiece', 'Focal', 'AFOV', 'Field stop', 'Power', 'Exit pupil', 'True field', 'Best for', '']}
            rows={rows.map((r) => [
              <span key="n" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: r.color, flex: 'none' }} /><input value={r.ep.name} onChange={(ev) => edit(r.ep.id, { name: ev.target.value })} aria-label="Name" style={{ width: 115 }} /></span>,
              <input key="f" type="number" min={1} step={0.5} value={r.ep.focal} onChange={(ev) => edit(r.ep.id, { focal: Math.max(1, Number(ev.target.value) || 1) })} aria-label="Focal length" style={{ width: 60 }} />,
              <input key="a" type="number" min={20} max={120} value={r.ep.afov} onChange={(ev) => edit(r.ep.id, { afov: Math.max(20, Number(ev.target.value) || 50) })} aria-label="Apparent field" style={{ width: 55 }} />,
              <input key="s" type="number" min={0} step={0.1} value={r.ep.fieldStop || ''} placeholder="—" onChange={(ev) => edit(r.ep.id, { fieldStop: Math.max(0, Number(ev.target.value) || 0) })} aria-label="Field stop" style={{ width: 55 }} />,
              <b key="m">{num(r.mag, 0)}×</b>,
              `${num(r.xp, 2)} mm`,
              `${num(r.tf, 2)}° (${num(r.tf * 60, 0)}′)`,
              <span key="u" style={{ color: r.use.tone === 'ok' ? undefined : r.use.tone === 'err' ? 'var(--err)' : 'var(--warn)', fontSize: 13 }}>{r.use.label}</span>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ eps: s.eps.filter((x) => x.id !== r.ep.id) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12.5 }}>Magnification = scope focal length × Barlow ÷ eyepiece focal length. True field uses the field stop when given (exact), otherwise apparent field ÷ power.</p>
        </Panel>
        {rows.some((r) => r.mag > maxUseful(s.aperture)) && <Note tone="warn">Some eyepieces exceed the useful maximum of {maxUseful(s.aperture)}× for a {s.aperture} mm aperture: the image will be dim and blurry.</Note>}
        <Panel title="What each eyepiece shows (full Moon to scale)">
          <FovView items={rows.map((r) => ({ name: r.ep.name, tf: r.tf, mag: r.mag, color: r.color }))} />
          <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>The Moon is about 0.52° (31′) wide. The Pleiades span ~2°, the Andromeda galaxy ~3°.</p>
        </Panel>
      </div>
    </Split>
  )
}
