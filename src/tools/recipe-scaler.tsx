import { Area, Btn, CopyButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { formatScaled, parseLine, scaleIngredient, unitById, type Mode } from './lib/recipe-scaler'

type By = 'servings' | 'factor' | 'pan'
type Pan = 'round' | 'square' | 'rect'

interface State {
  text: string
  from: number
  to: number
  factor: number
  by: By
  mode: Mode
  pan1: Pan
  pan1a: number
  pan1b: number
  pan2: Pan
  pan2a: number
  pan2b: number
}

const SAMPLES: Record<string, [string, number]> = {
  'Fluffy pancakes': [
    '1 1/2 cups all-purpose flour\n3 1/2 tsp baking powder\n1 tbsp sugar\n1/4 tsp salt\n1 1/4 cups milk\n1 egg\n3 tbsp butter, melted\nMaple syrup, to serve',
    4,
  ],
  'Beef chili': [
    '500 g ground beef\n1 large onion, diced\n2-3 cloves garlic, minced\n2 tbsp chili powder\n1 tsp ground cumin\n800 g canned tomatoes\n400 g kidney beans, drained\n250 ml beef stock\nSalt and pepper to taste',
    6,
  ],
  'Chocolate chip cookies': [
    '2 1/4 cups flour\n1 tsp baking soda\n1 tsp salt\n1 cup butter, softened\n3/4 cup sugar\n3/4 cup brown sugar\n2 eggs\n2 tsp vanilla extract\n12 oz chocolate chips',
    48,
  ],
}

const DEF: State = {
  text: SAMPLES['Fluffy pancakes'][0], from: 4, to: 10, factor: 2, by: 'servings', mode: 'tidy',
  pan1: 'round', pan1a: 20, pan1b: 20, pan2: 'rect', pan2a: 23, pan2b: 33,
}

const panArea = (p: Pan, a: number, b: number) => (p === 'round' ? Math.PI * (a / 2) ** 2 : p === 'square' ? a * a : a * b)

function PanInput({ label, pan, a, b, onChange }: { label: string; pan: Pan; a: number; b: number; onChange: (p: { pan?: Pan; a?: number; b?: number }) => void }) {
  return (
    <div>
      <div className="k-label" style={{ marginBottom: 4 }}>{label}</div>
      <Seg value={pan} onChange={(v) => onChange({ pan: v })} options={[['round', 'Round'], ['square', 'Square'], ['rect', 'Rectangle']]} />
      <Row>
        <Num label={pan === 'round' ? 'Diameter' : pan === 'square' ? 'Side' : 'Width'} value={a} onChange={(v) => onChange({ a: v })} unit="cm / in" min={1} />
        {pan === 'rect' && <Num label="Length" value={b} onChange={(v) => onChange({ b: v })} unit="cm / in" min={1} />}
      </Row>
    </div>
  )
}

export default function RecipeScaler() {
  const [s, set, reset] = useToolState('recipe-scaler', DEF)
  const lines = s.text.split('\n').map((l) => l.trim()).filter(Boolean)
  const parsed = lines.map(parseLine)
  const a1 = panArea(s.pan1, s.pan1a, s.pan1b)
  const a2 = panArea(s.pan2, s.pan2a, s.pan2b)
  const factor = s.by === 'servings' ? (s.from > 0 ? s.to / s.from : NaN) : s.by === 'factor' ? s.factor : a1 > 0 ? a2 / a1 : NaN
  const ok = Number.isFinite(factor) && factor > 0
  const scaled = parsed.map((p) => (ok ? scaleIngredient(p, factor, s.mode) : null))
  const out = scaled.map((x, i) => (x ? formatScaled(x) : lines[i]))
  const withQty = parsed.filter((p) => p.qty !== null).length
  const withUnit = parsed.filter((p) => p.unit).length
  const eggs = parsed.find((p) => /\begg/i.test(p.text) && !p.unit && p.qty !== null)
  const eggCount = eggs && ok ? eggs.qty! * factor : 0

  return (
    <Split>
      <div>
        <Panel title="Recipe ingredients" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {Object.entries(SAMPLES).map(([n, [t, serv]]) => (
              <Btn key={n} onClick={() => set({ text: t, from: serv, to: serv * 2 })}>{n}</Btn>
            ))}
          </Row>
          <div style={{ marginTop: 10 }}>
            <Area value={s.text} onChange={(text) => set({ text })} rows={11} placeholder={'One ingredient per line, e.g.\n1 1/2 cups flour\n200 g butter'} />
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Understands mixed numbers (1 1/2), unicode fractions (½), decimals (0.5 or 0,5), ranges (2–3) and US + metric units.
          </p>
        </Panel>
        <Panel title="Scale">
          <Seg value={s.by} onChange={(by) => set({ by })} options={[['servings', 'By servings'], ['factor', 'By factor'], ['pan', 'By pan size']]} />
          {s.by === 'servings' && (
            <Row>
              <Num label="Recipe makes" value={s.from} onChange={(from) => set({ from })} unit="servings" min={0.1} />
              <Num label="I need" value={s.to} onChange={(to) => set({ to })} unit="servings" min={0.1} />
            </Row>
          )}
          {s.by === 'factor' && (
            <>
              <Num label="Multiply by" value={s.factor} onChange={(factor) => set({ factor })} unit="×" min={0.01} />
              <Row>
                {[0.25, 0.5, 1.5, 2, 3, 4].map((f) => (
                  <Btn key={f} kind={s.factor === f ? 'primary' : 'normal'} onClick={() => set({ factor: f })}>×{f}</Btn>
                ))}
              </Row>
            </>
          )}
          {s.by === 'pan' && (
            <>
              <PanInput label="Recipe pan" pan={s.pan1} a={s.pan1a} b={s.pan1b} onChange={(p) => set({ pan1: p.pan ?? s.pan1, pan1a: p.a ?? s.pan1a, pan1b: p.b ?? s.pan1b })} />
              <PanInput label="My pan" pan={s.pan2} a={s.pan2a} b={s.pan2b} onChange={(p) => set({ pan2: p.pan ?? s.pan2, pan2a: p.a ?? s.pan2a, pan2b: p.b ?? s.pan2b })} />
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Same depth assumed; use the same length unit for both pans.</p>
            </>
          )}
          <Select
            label="Units in the result"
            value={s.mode}
            onChange={(mode) => set({ mode })}
            options={[['tidy', 'Tidy (12 tsp → ¼ cup, 1500 g → 1.5 kg)'], ['keep', 'Keep original units'], ['metric', 'Convert to metric (g, ml)'], ['us', 'Convert to US (cups, oz)']]}
          />
          {!ok && <Note tone="err">Enter positive numbers to get a scale factor.</Note>}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Scale factor" value={ok ? `×${num(factor, 3)}` : '—'} tone="accent" sub={s.by === 'servings' ? `${num(s.from)} → ${num(s.to)} servings` : s.by === 'pan' ? `${num(a1, 0)} → ${num(a2, 0)} area` : undefined} />
          <Stat label="Ingredients" value={lines.length} sub={`${withQty} with amounts`} />
          <Stat label="With units" value={withUnit} sub="converted & tidied" />
        </Stats>
        <Panel
          title="Scaled ingredients"
          actions={
            <>
              <CopyButton text={() => out.join('\n')} label="Copy list" />
              <Btn onClick={() => download('scaled-recipe.txt', out.join('\n'), 'text/plain')}>⬇ TXT</Btn>
            </>
          }
        >
          {lines.length === 0 ? (
            <Note>Paste or type ingredients on the left.</Note>
          ) : (
            <Table
              head={['Original', 'Scaled']}
              rows={parsed.map((p, i) => [
                <span key="o" className="muted">{p.raw}</span>,
                <b key="s" style={{ whiteSpace: 'normal' }}>
                  {p.qty === null ? <span className="muted" style={{ fontWeight: 500 }}>{out[i]} (no amount)</span> : out[i]}
                </b>,
              ])}
            />
          )}
        </Panel>
        <Panel title="Kitchen tips">
          {eggCount > 0 && Math.abs(eggCount - Math.round(eggCount)) > 0.1 && (
            <Note tone="warn">
              The recipe now needs {num(eggCount, 2)} eggs. Round to {Math.max(1, Math.round(eggCount))}, or beat {Math.ceil(eggCount)} eggs and use about {num((eggCount / Math.ceil(eggCount)) * 100, 0)}% (≈ {num(eggCount * 50, 0)} g).
            </Note>
          )}
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
            <li>Spices, salt and chili: start with ~75% of the scaled amount when scaling up a lot, then taste.</li>
            <li>Baking time changes with pan depth, not with quantity. Check early when using a shallower pan.</li>
            <li>Leaveners (baking powder/soda) scale linearly for most home batches.</li>
            <li>1 cup = 16 tbsp = 48 tsp ≈ {num(unitById('cup')!.base, 0)} ml · 1 lb = 16 oz ≈ 454 g.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
