import { useMemo } from 'react'
import { Btn, Check, CopyButton, Donut, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { composition, CONC_UNITS, dilution, ELEMENTS, hillFormula, MASS_UNITS, molarMass, parseFormula, solve, VOL_UNITS, type SolveFor } from './lib/molarity-calculator'

const PRESETS: [string, string][] = [
  ['NaCl', 'Sodium chloride'], ['NaOH', 'Sodium hydroxide'], ['KCl', 'Potassium chloride'], ['C6H12O6', 'Glucose'], ['C12H22O11', 'Sucrose'],
  ['C4H11NO3', 'Tris base'], ['C8H18N2O4S', 'HEPES'], ['C10H14N2Na2O8·2H2O', 'EDTA disodium dihydrate'], ['CuSO4·5H2O', 'Copper(II) sulfate pentahydrate'],
  ['MgCl2·6H2O', 'Magnesium chloride hexahydrate'], ['CaCl2·2H2O', 'Calcium chloride dihydrate'], ['KH2PO4', 'Potassium dihydrogen phosphate'], ['K4[Fe(CN)6]', 'Potassium ferrocyanide'],
]

type DilKey = 'c1' | 'v1' | 'c2' | 'v2'

const DEF = {
  formula: 'NaCl', override: false, mwManual: 100, solveFor: 'mass' as SolveFor,
  mass: 5, massU: 'g', vol: 500, volU: 'mL', conc: 100, concU: 'mM', purity: 100,
  dilFor: 'v1' as DilKey, c1: 1, c1U: 'M', v1: 10, v1U: 'mL', c2: 100, c2U: 'mM', v2: 250, v2U: 'mL',
}

const f = (list: [string, number][], u: string) => list.find((x) => x[0] === u)?.[1] ?? 1
const sig = (x: number) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? num(x, 1) : Number(x.toPrecision(4)).toString()) : '—')

/** Picks the most readable unit for a base-unit value. */
function best(v: number, list: [string, number][]): [number, string] {
  for (const [u, k] of list) if (Math.abs(v) >= k * 0.999) return [v / k, u]
  const [u, k] = list[list.length - 1]
  return [v / k, u]
}

export default function MolarityCalculator() {
  const [s, set, reset] = useToolState('molarity-calculator', DEF)
  const parsed = useMemo(() => {
    try {
      const c = parseFormula(s.formula)
      return { ok: true as const, counts: c, mw: molarMass(c) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [s.formula])
  const mw = s.override ? s.mwManual : parsed.ok ? parsed.mw : NaN
  const massG = s.mass * f(MASS_UNITS, s.massU)
  const volL = s.vol * f(VOL_UNITS, s.volU)
  const concM = s.conc * f(CONC_UNITS, s.concU)
  const result = solve(s.solveFor, { massG, volL, concM, mw, purity: s.purity })
  const final = { massG: s.solveFor === 'mass' ? result : massG, volL: s.solveFor === 'volume' ? result : volL, concM: s.solveFor === 'conc' ? result : concM }
  const [rv, ru] = s.solveFor === 'mass' ? best(result, MASS_UNITS) : s.solveFor === 'volume' ? best(result, VOL_UNITS) : best(result, CONC_UNITS)
  const gPerL = final.concM * mw
  const name = PRESETS.find((p) => p[0] === s.formula)?.[1] ?? s.formula
  const [mv, mu] = best(final.massG, MASS_UNITS)
  const [vv, vu] = best(final.volL, VOL_UNITS)
  const [cv, cu] = best(final.concM, CONC_UNITS)
  const recipe = `Dissolve ${sig(mv)} ${mu} of ${name}${s.purity < 100 ? ` (${s.purity}% pure)` : ''} in about ${sig(vv * 0.8)} ${vu} of solvent, then make up to ${sig(vv)} ${vu} → ${sig(cv)} ${cu}.`

  // dilution
  const dv = { c1: s.c1 * f(CONC_UNITS, s.c1U), v1: s.v1 * f(VOL_UNITS, s.v1U), c2: s.c2 * f(CONC_UNITS, s.c2U), v2: s.v2 * f(VOL_UNITS, s.v2U) }
  const dres = dilution(s.dilFor === 'c1' ? null : dv.c1, s.dilFor === 'v1' ? null : dv.v1, s.dilFor === 'c2' ? null : dv.c2, s.dilFor === 'v2' ? null : dv.v2)
  const dfin = { ...dv, [s.dilFor]: dres }
  const [dv1, dv1u] = best(dfin.v1, VOL_UNITS)
  const [dv2, dv2u] = best(dfin.v2 - dfin.v1, VOL_UNITS)
  const dilBad = dfin.c2 > dfin.c1 || dfin.v1 > dfin.v2

  const unitInput = (key: 'mass' | 'vol' | 'conc', label: string, list: [string, number][], uKey: 'massU' | 'volU' | 'concU', solved: boolean, solvedText: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'end' }}>
      {solved ? (
        <div className="k-field">
          <span className="k-label">{label} (result)</span>
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--panel2)', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{solvedText}</div>
        </div>
      ) : (
        <Num label={label} value={s[key]} onChange={(v) => set({ [key]: v })} min={0} />
      )}
      {!solved && <Select label="Unit" value={s[uKey]} onChange={(v) => set({ [uKey]: v })} options={list.map((x) => x[0])} />}
    </div>
  )

  const dilInput = (k: DilKey, label: string, conc: boolean) => {
    const uk = `${k}U` as 'c1U' | 'v1U' | 'c2U' | 'v2U'
    const list = conc ? CONC_UNITS : VOL_UNITS
    if (s.dilFor === k) {
      const [v, u] = best(dres, list)
      return (
        <div className="k-field">
          <span className="k-label">{label} (result)</span>
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--panel2)', fontWeight: 800, color: 'var(--accent)' }}>{sig(v)} {u}</div>
        </div>
      )
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6, alignItems: 'end' }}>
        <Num label={label} value={s[k]} onChange={(v) => set({ [k]: v })} min={0} />
        <Select label="Unit" value={s[uk]} onChange={(v) => set({ [uk]: v })} options={list.map((x) => x[0])} />
      </div>
    )
  }

  const comp = parsed.ok ? composition(parsed.counts) : []

  return (
    <div>
      <Stats>
        <Stat label="Molar mass" value={Number.isFinite(mw) ? `${num(mw, 3)} g/mol` : '—'} sub={parsed.ok ? hillFormula(parsed.counts) : 'invalid formula'} />
        <Stat label={s.solveFor === 'mass' ? 'Mass to weigh' : s.solveFor === 'volume' ? 'Final volume' : 'Concentration'} value={`${sig(rv)} ${ru}`} tone="accent" />
        <Stat label="Mass concentration" value={`${sig(gPerL)} g/L`} sub={`${sig(gPerL / 10)}% w/v · ${sig(gPerL * 1000)} mg/L (ppm)`} />
        <Stat label="Moles" value={`${sig(final.concM * final.volL * 1000)} mmol`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Compound">
            <Txt label="Chemical formula" value={s.formula} onChange={(formula) => set({ formula })} placeholder="e.g. CuSO4·5H2O" hint="Parentheses, brackets and hydrates (· . or *) are supported." />
            {!parsed.ok && <Note tone="err">{parsed.error}</Note>}
            <Row>
              {PRESETS.map(([fm, n]) => (
                <Btn key={fm} kind={s.formula === fm ? 'primary' : 'normal'} title={n} onClick={() => set({ formula: fm, override: false })}>{fm}</Btn>
              ))}
            </Row>
            <Check label="Enter molar mass manually (e.g. proteins, polymers)" value={s.override} onChange={(override) => set({ override })} />
            {s.override && <Num label="Molar mass" value={s.mwManual} onChange={(mwManual) => set({ mwManual })} unit="g/mol" min={0} />}
          </Panel>
          <Panel title="Periodic table" actions={<span className="muted" style={{ fontSize: 13 }}>click to append</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gap: 2 }}>
              {ELEMENTS.map((e) => {
                const used = parsed.ok && parsed.counts.has(e.symbol)
                return (
                  <button
                    key={e.z}
                    type="button"
                    title={`${e.z} ${e.symbol} — ${e.mass} g/mol`}
                    onClick={() => set({ formula: s.formula + e.symbol, override: false })}
                    style={{
                      gridRow: e.row, gridColumn: e.col, marginTop: e.row === 8 ? 8 : 0,
                      padding: '3px 0', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer', lineHeight: 1.1,
                      border: `1px solid ${used ? 'var(--accent)' : 'var(--line)'}`, background: used ? 'var(--accent)' : 'var(--panel2)', color: used ? 'var(--on-accent)' : 'var(--fg)',
                    }}
                  >
                    {e.symbol}
                  </button>
                )
              })}
            </div>
          </Panel>
          {parsed.ok && (
            <Panel title="Composition by mass">
              <Table
                head={['Element', 'Atoms', 'Mass (g/mol)', 'Mass %']}
                rows={comp.map((c) => [c.symbol, num(c.count, 3), num(c.mass, 3), `${num(c.fraction * 100, 2)}%`])}
              />
              <Donut slices={comp.map((c) => ({ label: c.symbol, value: c.mass }))} size={180} fv={(v) => `${num(v, 2)} g/mol`} />
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Solution" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Seg value={s.solveFor} onChange={(solveFor) => set({ solveFor })} options={[['mass', 'Solve for mass'], ['volume', 'Solve for volume'], ['conc', 'Solve for concentration']]} />
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {unitInput('mass', 'Mass of solute', MASS_UNITS, 'massU', s.solveFor === 'mass', `${sig(rv)} ${ru}`)}
              {unitInput('vol', 'Final solution volume', VOL_UNITS, 'volU', s.solveFor === 'volume', `${sig(rv)} ${ru}`)}
              {unitInput('conc', 'Molar concentration', CONC_UNITS, 'concU', s.solveFor === 'conc', `${sig(rv)} ${ru}`)}
              <Num label="Reagent purity" value={s.purity} onChange={(purity) => set({ purity: Math.min(100, Math.max(1, purity)) })} unit="%" min={1} max={100} />
            </div>
            {Number.isFinite(result) && result > 0 ? (
              <Note tone="ok">
                {recipe} <CopyButton text={recipe} label="Copy recipe" />
              </Note>
            ) : (
              <Note tone="warn">Enter positive values and a valid formula to get a result.</Note>
            )}
            <p className="muted" style={{ fontSize: 13 }}>
              mass = concentration × volume × molar mass ÷ purity. Always add solvent to the final volume (volumetric flask) rather than adding the solute to the full volume.
            </p>
          </Panel>
          <Panel title="Dilution (C₁V₁ = C₂V₂)">
            <Seg value={s.dilFor} onChange={(dilFor) => set({ dilFor })} options={[['c1', 'Solve C₁'], ['v1', 'Solve V₁'], ['c2', 'Solve C₂'], ['v2', 'Solve V₂']]} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
              {dilInput('c1', 'Stock concentration C₁', true)}
              {dilInput('v1', 'Stock volume V₁', false)}
              {dilInput('c2', 'Final concentration C₂', true)}
              {dilInput('v2', 'Final volume V₂', false)}
            </div>
            {Number.isFinite(dres) && dres > 0 && !dilBad ? (
              <Note tone="ok">Take <b>{sig(dv1)} {dv1u}</b> of stock and add <b>{sig(dv2)} {dv2u}</b> of diluent (dilution factor {sig(dfin.c1 / dfin.c2)}×).</Note>
            ) : (
              <Note tone="warn">{dilBad ? 'The final concentration cannot exceed the stock, and V₂ must be at least V₁.' : 'Enter positive values.'}</Note>
            )}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
