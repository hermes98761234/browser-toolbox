import { CopyButton, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, color, num, useToolState } from '../kit'
import { ageFromBirth, dogChart, dogLog, type DogSize, humanAge, lifespan, type Species, stageAt, stages } from './lib/pet-age-converter'

const SPECIES: [Species, string][] = [['dog', '🐶 Dog'], ['cat', '🐱 Cat'], ['rabbit', '🐰 Rabbit'], ['guinea', '🐹 Guinea pig'], ['hamster', '🐭 Hamster'], ['horse', '🐴 Horse']]
const SIZES: [DogSize, string, string][] = [['small', 'Small', '≤ 9 kg / 20 lb'], ['medium', 'Medium', '10–23 kg / 21–50 lb'], ['large', 'Large', '24–45 kg / 51–100 lb'], ['giant', 'Giant', '> 45 kg / 100 lb']]
const STAGE_COL = ['#38bdf8', '#10b981', '#f59e0b', '#a855f7']
const DEF = { name: 'Biscuit', species: 'dog' as Species, size: 'large' as DogSize, mode: 'age' as 'age' | 'birth', years: 7, months: 4, birth: '2019-06-15', kg: 30 }

const TODAY = new Date().toISOString().slice(0, 10)
const sizeFor = (kg: number): DogSize => (kg <= 9 ? 'small' : kg <= 23 ? 'medium' : kg <= 45 ? 'large' : 'giant')
const ym = (a: number) => {
  const y = Math.floor(a), m = Math.floor((a - y) * 12 + 1e-6)
  return `${y} yr${y === 1 ? '' : 's'}${m ? ` ${m} mo` : ''}`
}

export default function PetAgeConverter() {
  const [s, set, reset] = useToolState('pet-age-converter', DEF)
  const age = s.mode === 'age' ? Math.max(0, s.years + s.months / 12) : ageFromBirth(s.birth)
  const sp = s.species
  const human = humanAge(sp, age, s.size)
  const st = stages(sp, s.size)
  const cur = stageAt(st, age)
  const [lo, hi] = lifespan(sp, s.size)
  const maxAge = Math.ceil(hi * 1.25)
  const label = SPECIES.find((x) => x[0] === sp)![1]
  const pts = (f: (a: number) => number) => Array.from({ length: maxAge * 4 + 1 }, (_, i) => [i / 4, f(i / 4)] as [number, number])
  const series =
    sp === 'dog'
      ? [...SIZES.map(([z, n], i) => ({ name: n, points: pts((a) => dogChart(a, z)), color: color(i), dashed: z !== s.size })), { name: 'Epigenetic clock', points: pts(dogLog).filter((p) => p[0] >= 1), color: '#64748b', dashed: true }]
      : [{ name: label.slice(3), points: pts((a) => humanAge(sp, a)), color: color(0), area: true }]
  const rows = Array.from({ length: Math.min(30, maxAge) }, (_, i) => i + 1)
  const summary = `${s.name || 'My pet'} (${label.slice(3).toLowerCase()}, ${ym(age)}) is about ${num(human, 0)} in human years — ${cur.name.toLowerCase()} life stage.`

  return (
    <Split>
      <div>
        <Panel title="Your pet">
          <Txt label="Name" value={s.name} onChange={(name) => set({ name })} placeholder="Optional" />
          <div className="k-label" style={{ margin: '8px 0 6px' }}>Species</div>
          <Seg value={sp} onChange={(species) => set({ species })} options={SPECIES} />
          {sp === 'dog' && (
            <>
              <div className="k-label" style={{ margin: '12px 0 6px' }}>Adult size</div>
              <Seg value={s.size} onChange={(size) => set({ size })} options={SIZES.map(([v, l]) => [v, l] as const)} />
              <Row>
                <Num label="Adult weight (optional)" value={s.kg} min={1} max={120} unit="kg" onChange={(kg) => set({ kg, size: sizeFor(kg) })} hint={SIZES.find((x) => x[0] === s.size)![2]} />
              </Row>
            </>
          )}
          <div className="k-label" style={{ margin: '12px 0 6px' }}>Age</div>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['age', 'Years & months'], ['birth', 'Birthday']]} />
          {s.mode === 'age' ? (
            <Row>
              <Num label="Years" value={s.years} min={0} max={60} onChange={(years) => set({ years: Math.max(0, Math.floor(years)) })} />
              <Num label="Months" value={s.months} min={0} max={11} onChange={(months) => set({ months: Math.min(11, Math.max(0, Math.floor(months))) })} />
            </Row>
          ) : (
            <label className="k-field">
              <span className="k-label">Date of birth</span>
              <input type="date" className="k-text" value={s.birth} max={TODAY} onChange={(e) => e.target.value && set({ birth: e.target.value })} />
              <span className="k-hint">That makes {ym(age)} today.</span>
            </label>
          )}
          <Row>
            <CopyButton text={summary} label="Copy result" />
            <button type="button" className="k-btn ghost" onClick={reset}>Reset</button>
          </Row>
        </Panel>
        <Panel title="How it is calculated">
          <p style={{ fontSize: 14, marginTop: 0 }}>
            {sp === 'dog' && <>Dogs age fast at first (year 1 ≈ 15 human years, year 2 ≈ 24), then bigger breeds age faster. The size curves follow the widely used IDEXX/AVMA chart. The <b>epigenetic clock</b> (Wang et al., 2020: 16·ln(age) + 31) comes from DNA-methylation data in Labradors.</>}
            {sp === 'cat' && <>AAHA/AAFP convention: the first year ≈ 15 human years, the second adds 9 (24), then about 4 per year.</>}
            {sp === 'horse' && <>Common equine chart: year 1 ≈ 6.5, year 2 ≈ 13, year 3 ≈ 18, year 4 ≈ 20.5, then about 2.5 human years per horse year.</>}
            {(sp === 'rabbit' || sp === 'guinea' || sp === 'hamster') && <>Physiological scaling: sexual maturity maps to 18 human years and the typical lifespan ({lo}–{hi} years) to 80, linear in between.</>}
          </p>
          <Note>These are rules of thumb. Breed, genetics, weight and care matter more than any formula, so ask your vet about your pet's health stage.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`${s.name || 'Your pet'} in human years`} value={num(human, 0)} sub={`at ${ym(age)}`} tone="accent" />
          {sp === 'dog' && <Stat label="Epigenetic clock" value={age >= 1 ? num(dogLog(age), 0) : '—'} sub={age >= 1 ? '16·ln(age) + 31' : 'from 1 year'} />}
          <Stat label="Life stage" value={cur.name} sub={`typical lifespan ${lo}–${hi} yrs`} tone={cur.name === 'Senior' ? 'bad' : 'good'} />
          <Stat label="Of typical lifespan" value={`${num(Math.min(150, (age / ((lo + hi) / 2)) * 100), 0)}%`} sub={age > hi ? 'a golden oldie!' : `${num(Math.max(0, (lo + hi) / 2 - age), 1)} yrs to average`} />
        </Stats>
        <Panel title="Life stages">
          <div style={{ position: 'relative', display: 'flex', height: 34, borderRadius: 8, overflow: 'hidden' }}>
            {st.map((x, i) => {
              const to = Math.min(x.to, maxAge)
              return (
                <div key={x.name} title={`${x.name}: ${num(x.from, 1)}–${num(to, 1)} yrs`} style={{ width: `${((to - x.from) / maxAge) * 100}%`, background: STAGE_COL[i], color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', opacity: x === cur ? 1 : 0.55 }}>
                  {x.name}
                </div>
              )
            })}
            <div style={{ position: 'absolute', left: `${Math.min(100, (age / maxAge) * 100)}%`, top: -2, bottom: -2, width: 3, background: 'var(--fg)', borderRadius: 2 }} />
          </div>
          <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
            <span>0</span>
            <span>{maxAge} years</span>
          </div>
          <Note tone="ok"><b>{cur.name}:</b> {cur.tip}</Note>
        </Panel>
        <Panel title="Human-equivalent age curve">
          <LineChart series={series} xLabel={`${label.slice(3).toLowerCase()} age (years)`} fx={(v) => num(v, 1)} fy={(v) => num(v, 0)} markers={[{ x: age, label: s.name || 'now' }]} height={260} />
        </Panel>
        <Panel title="Year-by-year chart">
          <Table
            head={sp === 'dog' ? ['Age', ...SIZES.map((x) => x[1]), 'Epigenetic'] : ['Age', 'Human years', 'Stage']}
            rows={rows.map((a) =>
              sp === 'dog'
                ? [<b key="a">{a}</b>, ...SIZES.map(([z]) => <span key={z} style={{ fontWeight: z === s.size ? 700 : 400 }}>{num(dogChart(a, z), 0)}</span>), num(dogLog(a), 0)]
                : [<b key="a">{a}</b>, num(humanAge(sp, a), 0), stageAt(st, a).name],
            )}
          />
        </Panel>
      </div>
    </Split>
  )
}
