import { Bar, Btn, CopyButton, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { analyze, buildFormula, hydrationFeel, waterForHydration, type Flour } from './lib/sourdough-hydration-calculator'

interface State {
  mode: 'build' | 'check'
  name: string
  loaves: number; loafWeight: number
  hydration: number; salt: number; starter: number; starterHyd: number; inclusions: number
  flours: Flour[]
  r: { flour: number; water: number; starter: number; starterHyd: number; salt: number; otherLiquid: number }
  target: number
}

const DEF: State = {
  mode: 'build', name: 'Country sourdough',
  loaves: 2, loafWeight: 900,
  hydration: 75, salt: 2, starter: 20, starterHyd: 100, inclusions: 0,
  flours: [{ name: 'Bread flour', pct: 80 }, { name: 'Whole wheat', pct: 15 }, { name: 'Whole rye', pct: 5 }],
  r: { flour: 450, water: 325, starter: 100, starterHyd: 100, salt: 10, otherLiquid: 0 },
  target: 78,
}

const PRESETS: { name: string; p: Partial<State> }[] = [
  { name: 'Beginner loaf', p: { hydration: 68, salt: 2, starter: 20, starterHyd: 100, inclusions: 0, flours: [{ name: 'Bread flour', pct: 90 }, { name: 'Whole wheat', pct: 10 }] } },
  { name: 'Country loaf', p: { hydration: 75, salt: 2, starter: 20, starterHyd: 100, inclusions: 0, flours: DEF.flours } },
  { name: 'Open-crumb', p: { hydration: 82, salt: 2.1, starter: 15, starterHyd: 100, inclusions: 0, flours: [{ name: 'Strong bread flour', pct: 85 }, { name: 'Whole wheat', pct: 15 }] } },
  { name: 'Focaccia', p: { hydration: 85, salt: 2.5, starter: 20, starterHyd: 100, inclusions: 0, flours: [{ name: 'Bread flour', pct: 100 }] } },
  { name: 'Seeded rye', p: { hydration: 80, salt: 2, starter: 30, starterHyd: 100, inclusions: 15, flours: [{ name: 'Whole rye', pct: 40 }, { name: 'Bread flour', pct: 60 }] } },
  { name: 'Bagels', p: { hydration: 58, salt: 2, starter: 25, starterHyd: 100, inclusions: 0, flours: [{ name: 'High-gluten flour', pct: 100 }] } },
]

const g = (x: number) => `${num(Math.round(x), 0)} g`
const bp = (x: number) => `${num(x, 1)}%`

export default function SourdoughHydrationCalculator() {
  const [s, set, reset] = useToolState('sourdough-hydration-calculator', DEF)
  const f = buildFormula({ dough: s.loaves * s.loafWeight, hydration: s.hydration, salt: s.salt, starter: s.starter, starterHyd: s.starterHyd, inclusions: s.inclusions, flours: s.flours })
  const a = analyze(s.r)
  const fixWater = waterForHydration(s.r, s.target)
  const editFlour = (i: number, p: Partial<Flour>) => set({ flours: s.flours.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const blendSum = s.flours.reduce((t, x) => t + x.pct, 0)
  const build = f.starter * 1.1
  const pctOf = (x: number) => (f.totalFlour ? (x / f.totalFlour) * 100 : 0)

  const rows: [string, number, number][] = [
    ...f.flours.map((x) => [x.name || 'Flour', x.g, pctOf(x.g)] as [string, number, number]),
    ['Water', f.addWater, pctOf(f.addWater)],
    [`Starter (${s.starterHyd}% hydration)`, f.starter, s.starter],
    ['Salt', f.salt, s.salt],
    ...(f.inclusions > 0 ? [['Inclusions (seeds, nuts…)', f.inclusions, s.inclusions] as [string, number, number]] : []),
  ]
  const cardText = () => [`${s.name} — ${s.loaves} × ${s.loafWeight} g`, `Hydration ${s.hydration}% · salt ${s.salt}% · starter ${s.starter}%`, '', ...rows.map(([n, w, p]) => `${n.padEnd(30)} ${String(Math.round(w)).padStart(6)} g  ${num(p, 1)}%`), '', `Total dough ${Math.round(f.dough)} g`].join('\n')

  const print = () => {
    const w = window.open('', '_blank', 'width=520,height=700')
    if (!w) return
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
    w.document.write(`<!doctype html><title>${esc(s.name)}</title><style>body{font:15px system-ui;margin:28px;color:#111}h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:0 0 16px}table{border-collapse:collapse;width:100%}td,th{padding:7px 6px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-top:2px solid #111}.box{border:2px solid #111;border-radius:10px;padding:18px}</style>
<div class="box"><h1>${esc(s.name)}</h1><p>${s.loaves} × ${s.loafWeight} g · hydration ${s.hydration}% · salt ${s.salt}% · starter ${s.starter}% at ${s.starterHyd}%</p>
<table><thead><tr><th>Ingredient</th><th class="n">Grams</th><th class="n">Baker's %</th></tr></thead><tbody>${rows.map(([n, wt, p]) => `<tr><td>${esc(n)}</td><td class="n">${Math.round(wt)}</td><td class="n">${num(p, 1)}%</td></tr>`).join('')}</tbody>
<tfoot><tr><td>Total dough</td><td class="n">${Math.round(f.dough)}</td><td class="n">${num(pctOf(f.dough), 1)}%</td></tr></tfoot></table>
<p style="margin-top:14px">Total flour ${Math.round(f.totalFlour)} g · total water ${Math.round(f.totalWater)} g · prefermented flour ${num(f.prefermented * 100, 1)}%</p></div><script>print()</script>`)
    w.document.close()
  }

  return (
    <>
      <Row>
        <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['build', 'Build a formula'], ['check', 'Check my recipe']]} />
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </Row>
      {s.mode === 'build' ? (
        <Split>
          <div>
            <Panel title="Presets">
              <Row>{PRESETS.map((p) => <Btn key={p.name} onClick={() => set({ ...p.p, name: p.name })}>{p.name}</Btn>)}</Row>
            </Panel>
            <Panel title="Dough">
              <label className="k-field"><span className="k-label">Recipe name</span><input className="k-input" value={s.name} onChange={(e) => set({ name: e.target.value })} /></label>
              <Row>
                <Num label="Loaves" value={s.loaves} onChange={(loaves) => set({ loaves })} min={1} step={1} />
                <Num label="Weight per loaf" value={s.loafWeight} onChange={(loafWeight) => set({ loafWeight })} unit="g" min={50} />
              </Row>
              <Slider label="Hydration (total water ÷ total flour)" value={s.hydration} onChange={(hydration) => set({ hydration })} min={50} max={100} step={0.5} show={(v) => `${v}%`} />
              <Slider label="Salt" value={s.salt} onChange={(salt) => set({ salt })} min={0} max={4} step={0.1} show={(v) => `${num(v, 1)}%`} />
              <Slider label="Starter (inoculation, % of total flour)" value={s.starter} onChange={(starter) => set({ starter })} min={2} max={50} step={1} show={(v) => `${v}%`} />
              <Slider label="Starter hydration" value={s.starterHyd} onChange={(starterHyd) => set({ starterHyd })} min={50} max={150} step={5} show={(v) => `${v}%`} />
              <Slider label="Inclusions" value={s.inclusions} onChange={(inclusions) => set({ inclusions })} min={0} max={40} step={1} show={(v) => `${v}%`} />
              <Note>{hydrationFeel(s.hydration)}</Note>
            </Panel>
            <Panel title="Flour blend (added flour)" actions={<Btn onClick={() => set({ flours: [...s.flours, { name: 'Spelt', pct: 10 }] })}>+ Flour</Btn>}>
              <Table
                head={['Flour', 'Share', '']}
                rows={s.flours.map((x, i) => [
                  <input key="n" className="k-input" value={x.name} onChange={(e) => editFlour(i, { name: e.target.value })} aria-label="Flour name" />,
                  <input key="p" className="k-input" type="number" min={0} style={{ width: 80 }} value={x.pct} onChange={(e) => editFlour(i, { pct: Math.max(0, +e.target.value || 0) })} aria-label="Share %" />,
                  <Btn key="x" kind="ghost" disabled={s.flours.length < 2} onClick={() => set({ flours: s.flours.filter((_, j) => j !== i) })}>✕</Btn>,
                ])}
                foot={['Total', `${num(blendSum, 1)}%`, '']}
              />
              {Math.abs(blendSum - 100) > 0.01 && <Note tone="warn">Shares add up to {num(blendSum, 1)}% — they are scaled proportionally to 100%.</Note>}
              <p className="muted" style={{ fontSize: 13 }}>Whole-grain and rye flours absorb more water: add roughly 1–2 points of hydration per 10% whole grain.</p>
            </Panel>
          </div>
          <div>
            <Stats>
              <Stat label="Total dough" value={g(f.dough)} sub={`${s.loaves} × ${g(s.loafWeight)}`} />
              <Stat label="Total flour" value={g(f.totalFlour)} sub="incl. starter flour" />
              <Stat label="Total water" value={g(f.totalWater)} sub={`${bp(s.hydration)} hydration`} tone="accent" />
              <Stat label="Prefermented flour" value={bp(f.prefermented * 100)} sub="flour in the starter" />
            </Stats>
            {!f.valid && <Note tone="err">The starter alone holds more {f.addFlour < 0 ? 'flour' : 'water'} than the formula needs. Lower the starter percentage or adjust its hydration.</Note>}
            <Panel title={`Formula card — ${s.name}`} actions={<><CopyButton text={cardText} label="Copy" /><Btn kind="primary" onClick={print}>🖨 Print card</Btn></>}>
              <Table head={['Ingredient', 'Grams', "Baker's %"]} rows={rows.map(([n, w, p]) => [n, <b key="w">{g(w)}</b>, bp(p)])} foot={['Total dough', g(f.dough), bp(pctOf(f.dough))]} />
              <p className="muted" style={{ fontSize: 13 }}>Baker's percentages are relative to <b>total flour</b> (added flour + flour inside the starter), so the hydration shown is the true dough hydration.</p>
            </Panel>
            <Panel title="Inside the starter">
              <Row>
                <div style={{ flex: 1 }}><div className="muted">Flour {g(f.starterFlour)}</div><Bar value={f.starterFlour} max={f.starter || 1} /></div>
                <div style={{ flex: 1 }}><div className="muted">Water {g(f.starterWater)}</div><Bar value={f.starterWater} max={f.starter || 1} color="#0ea5e9" /></div>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>Build {g(build)} of starter (10% extra for jar losses): {g(build / 5)} ripe starter + {g((build * 0.8) / (1 + s.starterHyd / 100))} flour + {g(build * 0.8 - (build * 0.8) / (1 + s.starterHyd / 100))} water, 4–8 h before mixing.</p>
            </Panel>
          </div>
        </Split>
      ) : (
        <Split>
          <Panel title="Your recipe (grams)">
            <Row>
              <Num label="Flour (added)" value={s.r.flour} onChange={(flour) => set({ r: { ...s.r, flour } })} unit="g" min={0} />
              <Num label="Water" value={s.r.water} onChange={(water) => set({ r: { ...s.r, water } })} unit="g" min={0} />
            </Row>
            <Row>
              <Num label="Starter" value={s.r.starter} onChange={(starter) => set({ r: { ...s.r, starter } })} unit="g" min={0} />
              <Num label="Starter hydration" value={s.r.starterHyd} onChange={(starterHyd) => set({ r: { ...s.r, starterHyd } })} unit="%" min={1} />
            </Row>
            <Row>
              <Num label="Salt" value={s.r.salt} onChange={(salt) => set({ r: { ...s.r, salt } })} unit="g" min={0} />
              <Num label="Other liquid (milk, oil…)" value={s.r.otherLiquid} onChange={(otherLiquid) => set({ r: { ...s.r, otherLiquid } })} unit="g" min={0} hint="Counted as water" />
            </Row>
            <Num label="Target hydration" value={s.target} onChange={(target) => set({ target })} unit="%" min={40} max={120} />
            <Note tone={Math.abs(fixWater) < 1 ? 'ok' : 'info'}>
              {Math.abs(fixWater) < 1 ? 'Already at target hydration.' : fixWater > 0 ? `Add ${g(fixWater)} water to reach ${s.target}%.` : `Remove ${g(-fixWater)} water (or add ${g(-fixWater / (s.target / 100))} flour) to reach ${s.target}%.`}
            </Note>
          </Panel>
          <div>
            <Stats>
              <Stat label="True hydration" value={bp(a.hydration)} sub="starter included" tone="accent" />
              <Stat label="Naive hydration" value={bp(a.naiveHydration)} sub="water ÷ added flour" />
              <Stat label="Salt" value={bp(a.saltPct)} tone={a.saltPct < 1.5 || a.saltPct > 2.6 ? 'bad' : 'good'} sub="typical 1.8–2.2%" />
              <Stat label="Starter" value={bp(a.starterPct)} sub={`${bp(a.prefermented)} prefermented`} />
            </Stats>
            <Panel title="Breakdown">
              <Table
                head={['', 'Flour', 'Water']}
                rows={[
                  ['Added', g(s.r.flour), g(s.r.water + s.r.otherLiquid)],
                  ['In starter', g(a.totalFlour - s.r.flour), g(a.totalWater - s.r.water - s.r.otherLiquid)],
                ]}
                foot={['Total', g(a.totalFlour), g(a.totalWater)]}
              />
              <Note>{hydrationFeel(a.hydration)}</Note>
              <p className="muted" style={{ fontSize: 13 }}>Total dough {g(a.dough)}. Recipes often quote naive hydration — the gap here is {num(a.naiveHydration - a.hydration, 1)} points.</p>
            </Panel>
          </div>
        </Split>
      )}
    </>
  )
}
