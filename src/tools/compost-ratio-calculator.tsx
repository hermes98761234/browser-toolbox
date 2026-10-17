import { Btn, CsvButton, Donut, Note, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { amountForRatio, elements, MATERIALS, mix, ratioVerdict, waterForMoisture, type Part } from './lib/compost-ratio-calculator'

interface Item { id: number; mat: string; cn: number; amount: number }
interface State { unit: 'kg' | 'bucket'; items: Item[]; target: number }

const DEF: State = {
  unit: 'bucket', target: 30,
  items: [
    { id: 1, mat: 'Grass clippings', cn: 17, amount: 4 },
    { id: 2, mat: 'Vegetable scraps', cn: 19, amount: 2 },
    { id: 3, mat: 'Fallen leaves', cn: 54, amount: 6 },
    { id: 4, mat: 'Shredded cardboard', cn: 350, amount: 1 },
  ],
}
const BUCKET = 0.01 // m³ (10 L)
const byName = (n: string) => MATERIALS.find((m) => m.name === n) ?? MATERIALS[0]

function Gauge({ ratio, target }: { ratio: number; target: number }) {
  const max = 80
  const ang = (v: number) => Math.PI * (1 - Math.min(max, Math.max(0, v)) / max)
  const pt = (v: number, r: number) => [100 + r * Math.cos(ang(v)), 100 - r * Math.sin(ang(v))]
  const arc = (a: number, b: number, c: string) => {
    const [x1, y1] = pt(a, 80), [x2, y2] = pt(b, 80)
    return <path d={`M${x1},${y1} A80,80 0 0 1 ${x2},${y2}`} stroke={c} strokeWidth={18} fill="none" />
  }
  const [nx, ny] = pt(Number.isFinite(ratio) ? ratio : 0, 70)
  const [tx, ty] = pt(target, 96)
  return (
    <svg viewBox="-12 -12 224 134" style={{ width: '100%', maxWidth: 360, display: 'block', margin: '0 auto' }} role="img" aria-label={`C:N ratio ${num(ratio, 0)} to 1`}>
      {arc(0, 20, '#ef4444')}{arc(20, 25, '#f59e0b')}{arc(25, 35, '#10b981')}{arc(35, 50, '#f59e0b')}{arc(50, 80, '#ef4444')}
      <line x1={100} y1={100} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={100} cy={100} r={6} fill="var(--fg)" />
      <circle cx={tx} cy={ty} r={3} fill="var(--accent)" />
      {[0, 20, 40, 60, 80].map((v) => { const [x, y] = pt(v, 104); return <text key={v} x={x} y={y} fontSize={8} textAnchor="middle" fill="var(--muted)">{v}</text> })}
      <text x={100} y={118} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--fg)">{Number.isFinite(ratio) ? `${num(ratio, 1)} : 1` : '—'}</text>
    </svg>
  )
}

export default function CompostRatioCalculator() {
  const [s, set, reset] = useToolState('compost-ratio-calculator', DEF)
  const kgOf = (it: Item, amount = it.amount) => (s.unit === 'kg' ? amount : amount * BUCKET * byName(it.mat).density)
  const fromKg = (mat: string, kg: number) => (s.unit === 'kg' ? kg : kg / (BUCKET * byName(mat).density))
  const parts: Part[] = s.items.map((it) => { const m = byName(it.mat); return { name: m.name, n: m.n, cn: it.cn, moist: m.moist, kg: kgOf(it) } })
  const m = mix(parts)
  const verdict = ratioVerdict(m.ratio)
  const edit = (id: number, p: Partial<Item>) => set({ items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const uName = s.unit === 'kg' ? 'kg' : 'buckets'

  const greensKg = s.items.filter((it) => byName(it.mat).kind === 'green').reduce((a, it) => a + kgOf(it), 0)
  const brownsKg = m.wet - greensKg

  // Suggest adding the most effective material already in the pile, or a common default.
  const pick = (kind: 'green' | 'brown') => {
    const inPile = s.items.filter((it) => byName(it.mat).kind === kind)
    const it = inPile.sort((a, b) => (kind === 'brown' ? b.cn - a.cn : a.cn - b.cn))[0]
    const mat = it ? it.mat : kind === 'brown' ? 'Fallen leaves' : 'Grass clippings'
    const mm = byName(mat)
    return { mat, part: { name: mat, n: mm.n, cn: it ? it.cn : mm.cn, moist: mm.moist, kg: 0 } }
  }
  const low = m.ratio < s.target
  const sug = Number.isFinite(m.ratio) && Math.abs(m.ratio - s.target) > 2 ? pick(low ? 'brown' : 'green') : null
  const sugKg = sug ? amountForRatio(parts, sug.part, s.target) : null
  const water = Number.isFinite(m.moisture) ? waterForMoisture(parts, 55) : 0

  const add = (name: string) => set({ items: [...s.items, { id: Date.now(), mat: name, cn: byName(name).cn, amount: s.unit === 'kg' ? 5 : 2 }] })

  return (
    <Split>
      <div>
        <Panel title="Your pile" actions={<><Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['bucket', '10 L buckets'], ['kg', 'kg']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table
            head={['Material', 'C:N', uName, '']}
            rows={s.items.map((it) => {
              const mm = byName(it.mat)
              return [
                <select key="m" className="k-select" value={it.mat} onChange={(e) => edit(it.id, { mat: e.target.value, cn: byName(e.target.value).cn })} aria-label="Material">
                  <optgroup label="Greens (nitrogen)">{MATERIALS.filter((x) => x.kind === 'green').map((x) => <option key={x.name}>{x.name}</option>)}</optgroup>
                  <optgroup label="Browns (carbon)">{MATERIALS.filter((x) => x.kind === 'brown').map((x) => <option key={x.name}>{x.name}</option>)}</optgroup>
                </select>,
                <input key="c" className="k-input" type="number" min={1} style={{ width: 70 }} value={it.cn} onChange={(e) => edit(it.id, { cn: Math.max(1, +e.target.value || 1) })} aria-label="C:N ratio" title={`Typical ${mm.cn}:1`} />,
                <input key="a" className="k-input" type="number" min={0} step={0.5} style={{ width: 80 }} value={it.amount} onChange={(e) => edit(it.id, { amount: Math.max(0, +e.target.value || 0) })} aria-label="Amount" />,
                <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })}>✕</Btn>,
              ]
            })}
          />
          <Row>
            <Btn onClick={() => add('Grass clippings')}>+ Green</Btn>
            <Btn onClick={() => add('Fallen leaves')}>+ Brown</Btn>
          </Row>
          {s.unit === 'bucket' && <p className="muted" style={{ fontSize: 13 }}>Buckets are converted to weight with typical loose bulk densities (e.g. leaves ≈ 1 kg, grass ≈ 3 kg per 10 L bucket).</p>}
        </Panel>
        <Panel title="Reference: typical materials">
          <Table
            head={['Material', 'Type', 'C:N', 'N % (dry)', 'Moisture']}
            rows={MATERIALS.map((x) => [x.name, x.kind === 'green' ? '🟢 green' : '🟤 brown', `${x.cn}:1`, num(x.n, 2), `${x.moist}%`])}
            max={8}
          />
          <p className="muted" style={{ fontSize: 13 }}>Values are typical averages from composting handbooks; real materials vary a lot. Edit C:N per row if you know better.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="C:N ratio" value={Number.isFinite(m.ratio) ? `${num(m.ratio, 1)}:1` : '—'} tone={verdict.tone === 'ok' ? 'good' : 'bad'} sub="target 25–35:1" />
          <Stat label="Moisture" value={Number.isFinite(m.moisture) ? `${num(m.moisture, 0)}%` : '—'} tone={m.moisture >= 45 && m.moisture <= 65 ? 'good' : 'bad'} sub="target 50–60%" />
          <Stat label="Pile weight" value={`${num(m.wet, 1)} kg`} sub={`${num(m.dry, 1)} kg dry matter`} />
          <Stat label="Nitrogen" value={`${num(m.nitrogen * 1000, 0)} g`} sub={`${num(m.carbon, 2)} kg carbon`} />
        </Stats>
        <Panel title="Balance gauge">
          <Gauge ratio={m.ratio} target={s.target} />
          <Note tone={verdict.tone}>{verdict.text}</Note>
        </Panel>
        <Panel title="Adjustments">
          {sug && sugKg !== null ? (
            <Note tone="info">To reach {s.target}:1, add about <b>{num(fromKg(sug.mat, sugKg), 1)} {uName}</b> of {sug.mat.toLowerCase()} ({num(sugKg, 1)} kg).</Note>
          ) : sug ? (
            <Note tone="warn">{sug.mat} alone can't move the ratio to {s.target}:1 — add a material with a {low ? 'higher' : 'lower'} C:N.</Note>
          ) : (
            <Note tone="ok">Ratio is within ±2 of your {s.target}:1 target. ✓</Note>
          )}
          {water > 0.5 ? (
            <Note>Add roughly <b>{num(water, 0)} L of water</b> while turning to reach 55% moisture (damp like a wrung-out sponge).</Note>
          ) : water < -0.5 ? (
            <Note tone="warn">The mix is wet ({num(m.moisture, 0)}%). Add dry browns (straw, cardboard) or cover it from rain to avoid anaerobic, smelly spots.</Note>
          ) : null}
          <Row>
            <span className="muted">Target C:N</span>
            <Seg value={String(s.target)} onChange={(v) => set({ target: +v })} options={[['25', '25:1'], ['30', '30:1'], ['35', '35:1']]} />
          </Row>
        </Panel>
        <Panel title="Greens vs browns (by weight)" actions={<CsvButton name="compost-mix.csv" rows={() => [['Material', 'Kind', 'C:N', 'kg', 'C kg', 'N kg'], ...s.items.map((it, i) => { const e = elements(parts[i]); return [it.mat, byName(it.mat).kind, it.cn, num(kgOf(it), 2), num(e.c, 3), num(e.n, 4)] })]} />}>
          <Donut slices={[{ label: 'Greens', value: greensKg, color: '#10b981' }, { label: 'Browns', value: brownsKg, color: '#a16207' }]} fv={(v) => `${num(v, 1)} kg`} size={180} />
          <p className="muted" style={{ fontSize: 13 }}>The old "3 browns : 1 green by volume" rule is a rough proxy — weight and C:N matter more, because a bucket of leaves weighs a third of a bucket of grass.</p>
        </Panel>
      </div>
    </Split>
  )
}
