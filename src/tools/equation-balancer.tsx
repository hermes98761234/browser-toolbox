import { useMemo } from 'react'
import { Btn, CopyButton, Note, num, Num, Panel, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { balance, molarMass, pretty, type Balanced } from './lib/equation-balancer'

const EXAMPLES = [
  'C3H8 + O2 = CO2 + H2O',
  'KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2',
  'Cu + HNO3 = Cu(NO3)2 + NO + H2O',
  'Fe + O2 = Fe2O3',
  'Ca3(PO4)2 + SiO2 + C = CaSiO3 + P4 + CO',
  'MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O',
  'CuSO4·5H2O = CuSO4 + H2O',
  'C6H12O6 + O2 = CO2 + H2O',
  'K4[Fe(CN)6] + KMnO4 + H2SO4 = KHSO4 + Fe2(SO4)3 + MnSO4 + HNO3 + CO2 + H2O',
]
const DEF = { eq: 'KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2', pick: 0, amount: 10, unit: 'g' as 'g' | 'mol' }

export default function EquationBalancer() {
  const [s, set] = useToolState('equation-balancer', DEF)
  const res = useMemo((): Balanced | string => {
    try {
      return balance(s.eq)
    } catch (e) {
      return (e as Error).message
    }
  }, [s.eq])
  const ok = typeof res !== 'string'
  const all = ok ? [...res.reactants, ...res.products] : []
  const coef = ok ? res.coef.map(Number) : []
  const nR = ok ? res.reactants.length : 0
  const side = (from: number, to: number) => all.slice(from, to).map((sp, i) => `${coef[from + i] === 1 ? '' : coef[from + i]}${pretty(sp)}`).join(' + ')
  const text = ok ? `${side(0, nR)} → ${side(nR, all.length)}` : ''
  const plain = ok ? `${all.slice(0, nR).map((sp, i) => `${coef[i] === 1 ? '' : coef[i]}${sp.text}`).join(' + ')} = ${all.slice(nR).map((sp, i) => `${coef[nR + i] === 1 ? '' : coef[nR + i]}${sp.text}`).join(' + ')}` : ''
  const masses = all.map(molarMass)

  // stoichiometry from one known amount
  const pick = Math.min(s.pick, Math.max(0, all.length - 1))
  const molPick = ok ? (s.unit === 'g' ? s.amount / (masses[pick] || 1) : s.amount) : 0
  const extent = ok ? molPick / coef[pick] : 0
  const massR = all.slice(0, nR).reduce((a, _, i) => a + coef[i] * masses[i], 0)
  const massP = all.slice(nR).reduce((a, _, i) => a + coef[nR + i] * masses[nR + i], 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Equation">
          <Txt label="Reactants = products" value={s.eq} onChange={(eq) => set({ eq })} placeholder="e.g. Al + O2 = Al2O3" hint="Use = or → between sides, + between species. Brackets (), [], hydrates CuSO4·5H2O, charges like Fe^3+, SO4^2-, NH4+, e-." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {EXAMPLES.map((e) => (
              <Btn key={e} kind={e === s.eq ? 'primary' : 'ghost'} onClick={() => set({ eq: e, pick: 0 })}>{e.length > 34 ? e.slice(0, 32) + '…' : e}</Btn>
            ))}
          </div>
        </Panel>
        {ok && (
          <Panel title="Stoichiometry">
            <Select label="I have" value={pick} onChange={(p) => set({ pick: p })} options={all.map((sp, i) => [i, `${pretty(sp)} (${num(masses[i], 3)} g/mol)`] as const)} />
            <Num label="Amount" value={s.amount} onChange={(amount) => set({ amount })} unit={s.unit} min={0} />
            <Select label="Unit" value={s.unit} onChange={(unit) => set({ unit })} options={[['g', 'grams'], ['mol', 'moles']]} />
            {all[pick]?.text === 'e⁻' && <Note>Electrons have no mass — enter moles.</Note>}
          </Panel>
        )}
      </div>
      <div>
        {!ok && <Note tone="err">{res as string}</Note>}
        {ok && (
          <>
            <Panel title="Balanced equation" actions={<CopyButton text={plain} label="Copy" />}>
              <div style={{ fontSize: 'clamp(18px, 3vw, 28px)', fontWeight: 700, lineHeight: 1.5, padding: '6px 0', wordBreak: 'break-word' }}>
                {all.map((sp, i) => (
                  <span key={i}>
                    {i === nR ? <span style={{ color: 'var(--muted)' }}> → </span> : i > 0 ? <span style={{ color: 'var(--muted)' }}> + </span> : null}
                    {coef[i] !== 1 && <span style={{ color: 'var(--accent)' }}>{coef[i]}</span>}
                    {pretty(sp)}
                  </span>
                ))}
              </div>
              {res.ambiguous && <Note tone="warn">This equation mixes several independent reactions, so many balanced forms exist. One valid combination is shown.</Note>}
              <Stats>
                <Stat label="Species" value={all.length} />
                <Stat label="Elements" value={res.elements.filter((e) => e !== 'charge').length} />
                <Stat label="Mass of reactants" value={`${num(massR, 3)} g`} sub="per formula equation" />
                <Stat label="Mass of products" value={`${num(massP, 3)} g`} sub={Math.abs(massR - massP) < 1e-6 * massR ? 'conserved ✓' : 'check'} tone="good" />
              </Stats>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{text}</p>
            </Panel>
            <Panel title="Atom check">
              <Table
                head={['Element', 'Reactants', 'Products', '']}
                rows={res.elements.map((el) => {
                  const cnt = (from: number, to: number) => all.slice(from, to).reduce((a, sp, i) => a + coef[from + i] * (el === 'charge' ? sp.charge : (sp.atoms[el] ?? 0)), 0)
                  const l = cnt(0, nR), r = cnt(nR, all.length)
                  return [<b key="e">{el === 'charge' ? 'Charge' : el}</b>, l, r, l === r ? '✓' : '✗']
                })}
              />
            </Panel>
            <Panel title="Element matrix (reactants +, products −)">
              <Table
                head={['', ...all.map((sp) => pretty(sp))]}
                rows={res.elements.map((el) => [<b key="e">{el}</b>, ...all.map((sp, j) => (el === 'charge' ? sp.charge : (sp.atoms[el] ?? 0)) * (j < nR ? 1 : -1))])}
                foot={['coef.', ...coef.map((c) => <b key={c} style={{ color: 'var(--accent)' }}>{c}</b>)]}
              />
              <p className="muted" style={{ fontSize: 13 }}>The coefficients are the smallest whole-number vector in the null space of this matrix, found by exact fraction Gaussian elimination.</p>
            </Panel>
            <Panel title={`Amounts for ${num(s.amount, 4)} ${s.unit} of ${pretty(all[pick])}`}>
              <Table
                head={['Species', 'Coef.', 'Molar mass', 'Moles', 'Mass']}
                rows={all.map((sp, i) => [
                  <span key="n">{i < nR ? '⟵ ' : '⟶ '}{pretty(sp)}</span>,
                  coef[i],
                  `${num(masses[i], 3)} g/mol`,
                  num(extent * coef[i], 5),
                  `${num(extent * coef[i] * masses[i], 4)} g`,
                ])}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
