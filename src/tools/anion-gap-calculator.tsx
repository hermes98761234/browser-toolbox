import { Btn, Check, CopyButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { albuminToGdl, anionGap } from './lib/anion-gap-calculator'

type AlbUnit = 'g/dL' | 'g/L'
const DEF = { na: 138, cl: 100, hco3: 14, k: 4.2, useK: false, alb: 2.5, albUnit: 'g/dL' as AlbUnit, useAlb: true, normalAg: 12, normalAlb: 4, normalHco3: 24 }

const CASES: [string, Partial<typeof DEF>][] = [
  ['Normal', { na: 140, cl: 104, hco3: 24, alb: 4.2, k: 4 }],
  ['DKA', { na: 132, cl: 96, hco3: 8, alb: 4, k: 5.6 }],
  ['Lactic acidosis + low albumin', { na: 138, cl: 100, hco3: 14, alb: 2.5, k: 4.2 }],
  ['Diarrhoea (NAGMA)', { na: 136, cl: 115, hco3: 13, alb: 3.8, k: 3.1 }],
  ['Vomiting + ketosis', { na: 138, cl: 88, hco3: 26, alb: 4.1, k: 3.2 }],
]

const COL = { na: '#6366f1', k: '#a855f7', cl: '#0ea5e9', hco3: '#10b981', alb: '#f59e0b', ua: '#ef4444' }

export default function AnionGapCalculator() {
  const [s, set, reset] = useToolState('anion-gap-calculator', DEF)
  const albGdl = albuminToGdl(s.alb, s.albUnit)
  const normAlbGdl = albuminToGdl(s.normalAlb, s.albUnit)
  const valid = [s.na, s.cl, s.hco3].every((v) => v > 0) && (!s.useAlb || s.alb > 0)
  const r = anionGap({ na: s.na, cl: s.cl, hco3: s.hco3, k: s.useK ? s.k : undefined, albumin: s.useAlb ? albGdl : undefined, normalAlbumin: normAlbGdl, normalAg: s.normalAg, normalHco3: s.normalHco3 })
  const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
  const tone = r.level === 'high' ? 'bad' : r.level === 'low' ? 'accent' : 'good'

  // Gamblegram: cations vs anions; unmeasured anions split into the albumin share (~2.5 × albumin g/dL) and the rest.
  const cations = s.na + (s.useK ? s.k : 0)
  const albShare = s.useAlb ? Math.min(Math.max(0, r.ag), 2.5 * albGdl) : 0
  const other = Math.max(0, r.ag - albShare)
  const anions: [string, number, string][] = [['Cl⁻', s.cl, COL.cl], ['HCO₃⁻', s.hco3, COL.hco3], ...(s.useAlb ? [['Alb⁻', albShare, COL.alb] as [string, number, string]] : []), ['UA⁻', other, COL.ua]]
  const top = Math.max(cations, s.cl + s.hco3 + Math.max(0, r.ag), 1)
  const H = 300, bw = 120
  const y = (v: number) => (v / top) * (H - 20)
  const stack = (x: number, parts: [string, number, string][]) => {
    let acc = 0
    return parts.map(([n, v, c]) => {
      const h = y(Math.max(0, v))
      const yy = H - y(acc) - h
      acc += Math.max(0, v)
      return (
        <g key={n}>
          <rect x={x} y={yy} width={bw} height={Math.max(0, h)} fill={c} rx={3} stroke="var(--panel)" />
          {h > 16 && <text x={x + bw / 2} y={yy + h / 2 + 4} textAnchor="middle" fontSize={12} fill="#fff" fontWeight={700}>{n} {f1(v)}</text>}
        </g>
      )
    })
  }

  const summary = `Anion gap ${f1(r.ag)} mmol/L${r.corrected !== null ? `, albumin-corrected ${f1(r.corrected)}` : ''}; delta gap ${f1(r.deltaGap)}${r.deltaRatio !== null ? `, delta ratio ${r.deltaRatio.toFixed(2)}` : ''}. ${r.interpretation}`

  return (
    <Split>
      <div>
        <Panel title="Electrolytes (mmol/L = mEq/L)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Sodium (Na⁺)" value={s.na} unit="mmol/L" min={0} onChange={(na) => set({ na })} />
            <Num label="Chloride (Cl⁻)" value={s.cl} unit="mmol/L" min={0} onChange={(cl) => set({ cl })} />
          </Row>
          <Row>
            <Num label="Bicarbonate (HCO₃⁻)" value={s.hco3} unit="mmol/L" min={0} onChange={(hco3) => set({ hco3 })} />
            {s.useK && <Num label="Potassium (K⁺)" value={s.k} unit="mmol/L" min={0} onChange={(k) => set({ k })} />}
          </Row>
          <Check label="Include potassium (adds ~4 to the gap and its reference)" value={s.useK} onChange={(useK) => set({ useK, normalAg: s.normalAg + (useK ? 4 : -4) })} />
          {[s.na, s.cl, s.hco3].some((v) => v <= 0) && <Note tone="err">Enter positive values for Na, Cl and HCO₃.</Note>}
          {(s.na < 100 || s.na > 180 || s.cl < 60 || s.cl > 140 || s.hco3 > 60) && <Note tone="warn">One of the values is outside a plausible physiological range. Check units and typing.</Note>}
        </Panel>
        <Panel title="Albumin correction">
          <Check label="Correct for serum albumin (Figge: +2.5 per 1 g/dL below normal)" value={s.useAlb} onChange={(useAlb) => set({ useAlb })} />
          {s.useAlb && (
            <Row>
              <Num label="Albumin" value={s.alb} unit={s.albUnit} min={0} step={0.1} onChange={(alb) => set({ alb })} />
              <div className="k-field">
                <span className="k-label">Unit</span>
                <Seg value={s.albUnit} onChange={(albUnit) => albUnit !== s.albUnit && set({ albUnit, alb: +(albUnit === 'g/L' ? s.alb * 10 : s.alb / 10).toFixed(2), normalAlb: +(albUnit === 'g/L' ? s.normalAlb * 10 : s.normalAlb / 10).toFixed(2) })} options={[['g/dL', 'g/dL'], ['g/L', 'g/L']]} />
              </div>
            </Row>
          )}
        </Panel>
        <Panel title="Reference values (adjust to your lab)">
          <Row>
            <Num label="Normal anion gap" value={s.normalAg} unit="mmol/L" onChange={(normalAg) => set({ normalAg })} />
            <Num label="Normal HCO₃⁻" value={s.normalHco3} unit="mmol/L" onChange={(normalHco3) => set({ normalHco3 })} />
            <Num label="Normal albumin" value={s.normalAlb} unit={s.albUnit} onChange={(normalAlb) => set({ normalAlb })} />
          </Row>
          <div className="k-field"><span className="k-label">Example cases</span></div>
          <Row>{CASES.map(([n, p]) => <Btn key={n} onClick={() => set({ ...p, alb: s.albUnit === 'g/L' ? (p.alb ?? 4) * 10 : p.alb })}>{n}</Btn>)}</Row>
        </Panel>
      </div>
      <div>
        {valid && (
          <>
            <Stats>
              <Stat label="Anion gap" value={`${f1(r.ag)}`} sub={`Na${s.useK ? ' + K' : ''} − (Cl + HCO₃) · mmol/L`} tone={r.corrected === null ? tone : undefined} />
              {r.corrected !== null && <Stat label="Albumin-corrected gap" value={f1(r.corrected)} sub={`AG + 2.5 × (${normAlbGdl.toFixed(1)} − ${albGdl.toFixed(1)})`} tone={tone} />}
              <Stat label="Delta gap" value={f1(r.deltaGap)} sub="ΔAG − ΔHCO₃" />
              <Stat label="Delta ratio" value={r.deltaRatio === null ? 'n/a' : r.deltaRatio.toFixed(2)} sub={r.deltaRatio === null ? 'HCO₃ not below normal' : 'ΔAG ÷ ΔHCO₃'} />
            </Stats>
            <Panel title="Interpretation" actions={<CopyButton text={summary} label="Copy summary" />}>
              <Note tone={r.level === 'high' ? 'warn' : r.level === 'low' ? 'info' : 'ok'}>
                <b>{r.level === 'high' ? 'High' : r.level === 'low' ? 'Low' : 'Normal'} anion gap.</b> {r.interpretation}
              </Note>
              {r.corrected !== null && Math.abs(r.corrected - r.ag) >= 2 && (
                <p style={{ fontSize: 13 }}>Low albumin hides unmeasured anions: the raw gap of <b>{f1(r.ag)}</b> becomes <b>{f1(r.corrected)}</b> after correction{r.ag <= s.normalAg + 4 && r.corrected > s.normalAg + 4 ? ', unmasking a high anion gap.' : '.'}</p>
              )}
            </Panel>
            <Panel title="Gamblegram (cations = anions)">
              <svg viewBox={`0 0 340 ${H + 30}`} width="100%" style={{ maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label="Gamblegram">
                {stack(30, [['Na⁺', s.na, COL.na], ...(s.useK ? [['K⁺', s.k, COL.k] as [string, number, string]] : [])])}
                {stack(190, anions)}
                <text x={90} y={H + 20} textAnchor="middle" fontSize={13} fill="currentColor" fontWeight={700}>Cations {f1(cations)}</text>
                <text x={250} y={H + 20} textAnchor="middle" fontSize={13} fill="currentColor" fontWeight={700}>Anions</text>
              </svg>
              <div className="k-legend">
                {[['UA⁻ = other unmeasured anions', COL.ua], ...(s.useAlb ? [['Alb⁻ = albumin share ≈ 2.5 × g/dL', COL.alb]] : [])].map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}
              </div>
            </Panel>
            <Panel title="Common causes">
              <Table
                head={['Pattern', 'Think of']}
                rows={[
                  ['High gap (GOLDMARK)', 'Glycols, 5-Oxoproline (paracetamol), L-lactate, D-lactate, Methanol, Aspirin, Renal failure, Ketoacidosis'],
                  ['Normal gap (hyperchloremic)', 'Diarrhoea, renal tubular acidosis, saline loading, ureteral diversion, carbonic anhydrase inhibitors'],
                  ['Low gap', 'Hypoalbuminaemia, IgG myeloma, lithium or bromide toxicity, hypercalcaemia/hypermagnesaemia, lab error'],
                ]}
              />
            </Panel>
          </>
        )}
        <Note tone="warn">For education and reference only. Reference ranges vary between analysers and labs; this is not a diagnosis. Always interpret with the full clinical picture and blood gas.</Note>
      </div>
    </Split>
  )
}
