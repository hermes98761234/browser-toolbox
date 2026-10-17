import { Btn, Check, CopyButton, Num, Panel, Row, Select, Seg, Slider, Split, Table, Txt, download, num, useToolState } from '../kit'
import { clampCss, fluidAt, lineHeight, RATIOS, scale } from './lib/type-scale-calculator'

const FONTS: [string, string][] = [
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'System sans'],
  ['Georgia, "Times New Roman", serif', 'Serif (Georgia)'],
  ['"Helvetica Neue", Arial, sans-serif', 'Helvetica / Arial'],
  ['ui-monospace, Menlo, Consolas, monospace', 'Monospace'],
  ['"Palatino Linotype", Palatino, serif', 'Palatino'],
]

const DEF = {
  base: 16, ratio: 1.25, custom: 1.3, useCustom: false, up: 5, down: 2, root: 16,
  fluid: true, maxBase: 18, maxRatio: 1.333, minVw: 360, maxVw: 1280, preview: 1280,
  unit: 'rem' as 'rem' | 'px', prefix: 'step', naming: 'tshirt' as 'tshirt' | 'numeric', grid: 0, font: FONTS[0][0], weight: 700,
  text: 'The quick brown fox jumps over the lazy dog',
}

const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Blog / editorial', { base: 18, ratio: 1.25, maxBase: 20, maxRatio: 1.333, font: FONTS[1][0] }],
  ['App UI (compact)', { base: 14, ratio: 1.125, maxBase: 15, maxRatio: 1.2, up: 5, down: 2, font: FONTS[0][0] }],
  ['Marketing (dramatic)', { base: 17, ratio: 1.333, maxBase: 20, maxRatio: 1.5, up: 7 }],
  ['Static (no fluid)', { fluid: false }],
]

export default function TypeScaleCalculator() {
  const [s, set, reset] = useToolState('type-scale-calculator', DEF)
  const ratio = s.useCustom ? s.custom : s.ratio
  const base = s.base > 0 ? s.base : 16
  const maxBase = s.fluid ? (s.maxBase > 0 ? s.maxBase : base) : base
  const maxRatio = s.fluid ? s.maxRatio : ratio
  const vwOk = s.maxVw > s.minVw
  const steps = scale(base, ratio, Math.min(12, Math.max(0, s.up)), Math.min(5, Math.max(0, s.down)), maxBase, maxRatio)
  const varName = (st: (typeof steps)[number]) => (s.naming === 'numeric' ? `--${s.prefix}-${st.step}` : `--${s.prefix}-${st.name}`)
  const val = (px: number) => (s.unit === 'rem' ? `${num(px / s.root, 4)}rem` : `${num(px, 2)}px`)
  const cssValue = (st: (typeof steps)[number]) => (s.fluid && vwOk ? clampCss(st.min, st.max, s.minVw, s.maxVw, s.root) : val(st.min))
  const css = () => `:root {\n${steps.map((st) => `  ${varName(st)}: ${cssValue(st)};`).join('\n')}\n}\n`
  const tailwind = () => `// tailwind.config.js → theme.extend.fontSize\nfontSize: {\n${steps.map((st) => `  '${st.name}': ['${cssValue(st)}', { lineHeight: '${lineHeight(st.min, s.grid)}' }],`).join('\n')}\n}\n`
  const scss = () => `$type-scale: (\n${steps.map((st) => `  '${st.name}': ${cssValue(st)},`).join('\n')}\n);\n`
  const json = () => JSON.stringify(Object.fromEntries(steps.map((st) => [st.name, { min: +st.min.toFixed(3), max: +st.max.toFixed(3), css: cssValue(st), lineHeight: lineHeight(st.min, s.grid) }])), null, 2)
  const at = (st: (typeof steps)[number]) => (s.fluid && vwOk ? fluidAt(st.min, st.max, s.minVw, s.maxVw, s.preview) : st.min)
  const ratioName = RATIOS.find((r) => r[0] === ratio)?.[1]

  return (
    <Split>
      <div>
        <Panel title="Scale" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ marginBottom: 10 }}>
            <Row>
              {PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set({ ...DEF, ...p })}>{n}</Btn>)}
            </Row>
          </div>
          <Row>
            <Num label={s.fluid ? 'Base size (small screens)' : 'Base size'} value={s.base} onChange={(b) => set({ base: b })} unit="px" min={6} max={64} />
            <Num label="Root font size" value={s.root} onChange={(root) => set({ root: root > 0 ? root : 16 })} unit="px" min={1} />
          </Row>
          {!s.useCustom ? (
            <Select label="Ratio" value={s.ratio} onChange={(r) => set({ ratio: r })} options={RATIOS.map(([v, n]) => [v, `${v} — ${n}`] as const)} />
          ) : (
            <Num label="Custom ratio" value={s.custom} onChange={(custom) => set({ custom })} min={1.01} max={3} />
          )}
          <Check label="Custom ratio" value={s.useCustom} onChange={(useCustom) => set({ useCustom })} />
          <Slider label="Steps above base" value={s.up} min={1} max={12} onChange={(up) => set({ up })} />
          <Slider label="Steps below base" value={s.down} min={0} max={5} onChange={(down) => set({ down })} />
        </Panel>
        <Panel title="Fluid typography">
          <Check label="Scale fluidly between two viewport widths (CSS clamp)" value={s.fluid} onChange={(fluid) => set({ fluid })} />
          {s.fluid && (
            <>
              <Row>
                <Num label="Min viewport" value={s.minVw} onChange={(minVw) => set({ minVw })} unit="px" min={200} />
                <Num label="Max viewport" value={s.maxVw} onChange={(maxVw) => set({ maxVw })} unit="px" min={300} />
              </Row>
              <Row>
                <Num label="Base at max viewport" value={s.maxBase} onChange={(maxBase) => set({ maxBase })} unit="px" min={6} />
                <Select label="Ratio at max viewport" value={s.maxRatio} onChange={(maxRatio) => set({ maxRatio })} options={RATIOS.map(([v, n]) => [v, `${v} — ${n}`] as const)} />
              </Row>
              {!vwOk && <p style={{ color: 'var(--err)' }}>Max viewport must be larger than min viewport.</p>}
            </>
          )}
        </Panel>
        <Panel title="Output">
          <Row>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['rem', 'rem'], ['px', 'px']]} />
            <Seg value={s.naming} onChange={(naming) => set({ naming })} options={[['tshirt', 'xs…xl names'], ['numeric', '−2…6 steps']]} />
          </Row>
          <Row>
            <Txt label="Variable prefix" value={s.prefix} onChange={(prefix) => set({ prefix: prefix.replace(/[^a-z0-9-]/gi, '') || 'step' })} />
            <Select label="Line-height grid" value={s.grid} onChange={(grid) => set({ grid })} options={[[0, 'None'], [4, '4 px'], [8, '8 px']]} />
          </Row>
          <pre style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'color-mix(in srgb, var(--line) 40%, transparent)', padding: 10, borderRadius: 8, overflowX: 'auto', margin: '8px 0' }}>{css()}</pre>
          <Row>
            <CopyButton text={css} label="CSS variables" />
            <CopyButton text={tailwind} label="Tailwind" />
            <CopyButton text={scss} label="SCSS map" />
            <Btn onClick={() => download('type-scale.json', json(), 'application/json')}>⬇ JSON</Btn>
            <Btn onClick={() => download('type-scale.css', css(), 'text/css')}>⬇ CSS</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title={`Scale table — ratio ${ratio}${ratioName ? ` (${ratioName})` : ''}`}>
          <Table
            head={s.fluid ? ['Name', 'Min', 'Max', 'Line height', 'CSS'] : ['Name', 'px', 'rem', 'Line height', 'CSS']}
            rows={steps.map((st) => [
              <b key="n" style={{ color: st.step === 0 ? 'var(--accent)' : undefined }}>{st.name}</b>,
              s.fluid ? `${num(st.min, 2)}px` : `${num(st.min, 2)}px`,
              s.fluid ? `${num(st.max, 2)}px` : `${num(st.min / s.root, 4)}rem`,
              lineHeight(st.min, s.grid),
              <code key="c" style={{ fontSize: 12 }}>{cssValue(st)}</code>,
            ])}
          />
        </Panel>
        <Panel title="Live preview">
          <Row>
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
            <Select label="Heading weight" value={s.weight} onChange={(weight) => set({ weight })} options={[[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold']]} />
          </Row>
          <Txt label="Sample text" value={s.text} onChange={(text) => set({ text })} />
          {s.fluid && vwOk && <Slider label="Simulated viewport" value={s.preview} min={Math.min(s.minVw, 320)} max={Math.max(s.maxVw, 1440)} step={10} unit=" px" onChange={(preview) => set({ preview })} />}
          <div style={{ fontFamily: s.font, overflowX: 'hidden', marginTop: 8 }}>
            {steps.map((st) => {
              const px = at(st)
              return (
                <div key={st.step} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, alignItems: 'baseline', borderTop: '1px solid var(--line)', padding: '6px 0' }}>
                  <span className="muted" style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{st.name}<br />{num(px, 1)}px</span>
                  <span style={{ fontSize: px, lineHeight: lineHeight(px, s.grid), fontWeight: st.step > 0 ? s.weight : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.text}</span>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="In context">
          <article style={{ fontFamily: s.font, maxWidth: '66ch' }}>
            {(['3xl', '2xl', 'xl', 'lg'] as const).map((n, i) => {
              const st = steps.find((x) => x.name === n)
              const px = st ? at(st) : base * ratio ** (4 - i)
              const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[i]
              return <Tag key={n} style={{ fontSize: px, lineHeight: lineHeight(px, s.grid), fontWeight: s.weight, margin: '0.5em 0 0.25em' }}>{['Designing with a modular scale', 'Why ratios matter', 'Choosing a base size', 'Fluid sizes with clamp()'][i]}</Tag>
            })}
            {(() => {
              const b = steps.find((x) => x.step === 0)!
              const sm = steps.find((x) => x.step === -1)
              return (
                <>
                  <p style={{ fontSize: at(b), lineHeight: lineHeight(at(b), s.grid) }}>A modular scale multiplies a base size by the same ratio at every step, so headings, body copy and captions share one rhythm. Smaller ratios suit dense interfaces; larger ones give editorial pages drama.</p>
                  {sm && <p className="muted" style={{ fontSize: at(sm), lineHeight: lineHeight(at(sm), s.grid) }}>Caption · Body text at {num(at(b), 1)}px, line height {lineHeight(at(b), s.grid)}.</p>}
                </>
              )
            })()}
          </article>
        </Panel>
      </div>
    </Split>
  )
}
