import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, Note, num, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { analyze, clean, DEFAULT_COND, DEFAULT_SETTINGS, design, dimer, naEq, revComp, SAMPLE_TEMPLATE, type Cond, type Dimer, type PrimerInfo, type Settings } from './lib/primer-designer'

interface State { mode: 'design' | 'check'; template: string; tStart: number; tEnd: number; useTarget: boolean; st: Settings; cond: Cond; fwd: string; rev: string }
const DEF: State = {
  mode: 'design', template: SAMPLE_TEMPLATE, tStart: 300, tEnd: 360, useTarget: false,
  st: { ...DEFAULT_SETTINGS, tmOpt: 62, tmMin: 57, tmMax: 67 }, cond: DEFAULT_COND,
  fwd: 'CAAGCTGACCCTGAAGTTCATC', rev: 'CAGCTCGATGCGGTTCAC',
}

const dG = (v: number) => `${v.toFixed(1)} kcal/mol`
const tone = (bad: boolean, warn: boolean) => (bad ? 'var(--err)' : warn ? 'var(--warn)' : 'var(--ok)')

function DimerView({ d, title }: { d: Dimer; title: string }) {
  if (d.dG === 0) return <p className="muted">{title}: no complementary stretch of 3+ bases.</p>
  return (
    <div style={{ marginTop: 6 }}>
      <b>{title}</b> <span style={{ color: tone(d.dG < (d.threePrime ? -5 : -6), d.dG < -3) }}>{dG(d.dG)}{d.threePrime ? " · involves a 3' end" : ''}</span>
      <pre style={{ margin: '4px 0', fontSize: 12, overflowX: 'auto', lineHeight: 1.25 }}>{`5' ${d.top} 3'\n   ${d.mid}\n3' ${d.bottom} 5'`}</pre>
    </div>
  )
}

function PrimerCard({ name, p }: { name: string; p: PrimerInfo }) {
  return (
    <Panel title={`${name}: 5'-${p.seq}-3'`} actions={<CopyButton text={p.seq} />}>
      <Table
        head={['Length', 'Tm', 'GC', "3' clamp (last 5)", 'Hairpin', "3' end ΔG"]}
        rows={[[
          `${p.len} nt`, `${num(p.tm, 1)} °C`,
          <span key="g" style={{ color: tone(p.gc < 0.35 || p.gc > 0.7, p.gc < 0.4 || p.gc > 0.6) }}>{pct(p.gc, 0)}</span>,
          <span key="c" style={{ color: tone(p.clamp === 0 || p.clamp > 3, !/[GC]$/.test(p.seq)) }}>{p.clamp} G/C{/[GC]$/.test(p.seq) ? ', ends G/C' : ''}</span>,
          <span key="h" style={{ color: tone(p.hairpin.dG < -3, p.hairpin.dG < -1) }}>{p.hairpin.stem ? `${p.hairpin.stem} bp stem, ${dG(p.hairpin.dG)}` : 'none'}</span>,
          dG(p.end3),
        ]]}
      />
      <DimerView d={p.self} title="Self-dimer" />
      {p.warnings.length ? <Note tone="warn">{p.warnings.map((w) => <div key={w}>• {w}</div>)}</Note> : <Note tone="ok">No issues found by the screening rules.</Note>}
    </Panel>
  )
}

export default function PrimerDesigner() {
  const [s, set, reset] = useToolState('primer-designer', DEF)
  const [pick, setPick] = useState(0)
  const T = clean(s.template)
  const bad = s.template.toUpperCase().replace(/^>.*$/gm, '').replace(/[\sACGT\d]/g, '')
  const pairs = useMemo(() => (s.mode === 'design' && T.length >= 60 ? design(T, s.st, s.cond, s.useTarget ? [s.tStart - 1, s.tEnd] : undefined) : []), [s.mode, T, s.st, s.cond, s.useTarget, s.tStart, s.tEnd])
  const sel = pairs[Math.min(pick, pairs.length - 1)]
  const fwd = useMemo(() => analyze(s.mode === 'check' ? s.fwd : sel?.fwd.seq ?? '', s.cond), [s.mode, s.fwd, sel, s.cond])
  const rev = useMemo(() => analyze(s.mode === 'check' ? s.rev : sel?.rev.seq ?? '', s.cond), [s.mode, s.rev, sel, s.cond])
  const cross = useMemo(() => (fwd.len && rev.len ? dimer(fwd.seq, rev.seq, s.cond) : null), [fwd, rev, s.cond])
  const checkProduct = s.mode === 'check' && T.length ? (() => { const a = T.indexOf(fwd.seq), b = T.indexOf(revComp(rev.seq)); return a >= 0 && b > a ? b + rev.len - a : null })() : null
  const st = s.st
  const setSt = (p: Partial<Settings>) => set({ st: { ...st, ...p } })
  const setC = (p: Partial<Cond>) => set({ cond: { ...s.cond, ...p } })
  const ta = Math.max(fwd.tm && rev.tm ? Math.min(fwd.tm, rev.tm) - 3 : NaN, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Mode" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['design', 'Design from template'], ['check', 'Check my primers']]} />
        </Panel>
        {s.mode === 'check' ? (
          <Panel title="Primers (5'→3')">
            <Txt label="Forward primer" value={s.fwd} onChange={(fwd) => set({ fwd })} />
            <Txt label="Reverse primer" value={s.rev} onChange={(rev) => set({ rev })} />
            <p className="muted" style={{ fontSize: 12 }}>Optional: keep a template below to compute the product size.</p>
          </Panel>
        ) : (
          <Panel title="Search settings">
            <Row>
              <Num label="Min length" value={st.minLen} onChange={(minLen) => setSt({ minLen })} unit="nt" min={14} max={st.maxLen} />
              <Num label="Max length" value={st.maxLen} onChange={(maxLen) => setSt({ maxLen })} unit="nt" min={st.minLen} max={36} />
            </Row>
            <Row>
              <Num label="Optimal Tm" value={st.tmOpt} onChange={(tmOpt) => setSt({ tmOpt })} unit="°C" />
              <Num label="Max ΔTm (pair)" value={st.maxTmDiff} onChange={(maxTmDiff) => setSt({ maxTmDiff })} unit="°C" min={0} />
            </Row>
            <Row>
              <Num label="Tm min" value={st.tmMin} onChange={(tmMin) => setSt({ tmMin })} unit="°C" />
              <Num label="Tm max" value={st.tmMax} onChange={(tmMax) => setSt({ tmMax })} unit="°C" />
            </Row>
            <Row>
              <Num label="Product min" value={st.prodMin} onChange={(prodMin) => setSt({ prodMin })} unit="bp" min={40} />
              <Num label="Product max" value={st.prodMax} onChange={(prodMax) => setSt({ prodMax })} unit="bp" min={st.prodMin} />
            </Row>
            <Row>
              <Num label="GC min" value={Math.round(st.gcMin * 100)} onChange={(v) => setSt({ gcMin: v / 100 })} unit="%" />
              <Num label="GC max" value={Math.round(st.gcMax * 100)} onChange={(v) => setSt({ gcMax: v / 100 })} unit="%" />
            </Row>
            <label className="k-check"><input type="checkbox" checked={s.useTarget} onChange={(e) => set({ useTarget: e.target.checked })} /> Product must include target region</label>
            {s.useTarget && (
              <Row>
                <Num label="Target from" value={s.tStart} onChange={(tStart) => set({ tStart })} unit="nt" min={1} />
                <Num label="to" value={s.tEnd} onChange={(tEnd) => set({ tEnd })} unit="nt" min={s.tStart} />
              </Row>
            )}
          </Panel>
        )}
        <Panel title="Reaction conditions">
          <Row>
            <Num label="Na⁺ / K⁺" value={s.cond.na} onChange={(na) => setC({ na })} unit="mM" min={0} />
            <Num label="Mg²⁺" value={s.cond.mg} onChange={(mg) => setC({ mg })} unit="mM" min={0} />
          </Row>
          <Row>
            <Num label="dNTPs (total)" value={s.cond.dntp} onChange={(dntp) => setC({ dntp })} unit="mM" min={0} />
            <Num label="Primer" value={s.cond.primerNM} onChange={(primerNM) => setC({ primerNM })} unit="nM" min={1} />
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Tm: SantaLucia 1998 nearest-neighbour; salt as Na⁺-equivalent {num(naEq(s.cond) * 1000, 0)} mM (Na + 120·√(Mg − dNTP)). Values differ by 1–3 °C between calculators; compare primers with the same tool.</p>
        </Panel>
        <Panel title={`Template (${T.length} nt)`}>
          <Area value={s.template} onChange={(template) => set({ template })} rows={8} mono placeholder="Paste DNA (FASTA or plain)" />
          {bad && <Note tone="warn">Ignored {bad.length} non-ACGT characters (N, IUPAC codes, symbols).</Note>}
          <Row>
            <Btn kind="ghost" onClick={() => set({ template: SAMPLE_TEMPLATE })}>Sample: EGFP CDS</Btn>
            <Btn kind="ghost" onClick={() => set({ template: '' })}>Clear</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        {s.mode === 'design' && (
          <Panel title="Primer pairs" actions={pairs.length > 0 && <CsvButton name="primer-pairs.csv" rows={() => [['Rank', 'Forward', 'Fwd Tm', 'Reverse', 'Rev Tm', 'Product bp', 'Fwd start', 'Rev end', 'Penalty'], ...pairs.map((p, i) => [i + 1, p.fwd.seq, +p.fwd.info.tm.toFixed(1), p.rev.seq, +p.rev.info.tm.toFixed(1), p.product, p.fwd.pos + 1, p.rev.pos + p.rev.seq.length, +p.pen.toFixed(2)])]} />}>
            {T.length < 60 ? <Note tone="warn">Paste a template of at least 60 nt.</Note> : !pairs.length ? <Note tone="warn">No pair fits these settings. Widen the Tm, GC or product size range, or allow a larger Tm difference.</Note> : (
              <>
                <Table
                  head={['#', "Forward 5'→3'", "Reverse 5'→3'", 'Tm F / R', 'Product', 'Penalty']}
                  rows={pairs.map((p, i) => [
                    <button key="i" type="button" className={`k-btn ${i === pick ? 'primary' : 'ghost'}`} style={{ padding: '2px 8px' }} onClick={() => setPick(i)}>{i + 1}</button>,
                    <code key="f" style={{ fontSize: 12 }}>{p.fwd.seq}</code>, <code key="r" style={{ fontSize: 12 }}>{p.rev.seq}</code>,
                    `${num(p.fwd.info.tm, 1)} / ${num(p.rev.info.tm, 1)}`, `${p.product} bp`, num(p.pen, 2),
                  ])}
                />
                {sel && (
                  <svg viewBox="0 0 600 60" style={{ width: '100%', marginTop: 8 }} role="img" aria-label="Primer positions">
                    <rect x={0} y={26} width={600} height={8} rx={4} fill="var(--line)" />
                    {s.useTarget && <rect x={(s.tStart / T.length) * 600} y={22} width={((s.tEnd - s.tStart) / T.length) * 600} height={16} fill="#f59e0b" opacity={0.5} />}
                    <rect x={(sel.fwd.pos / T.length) * 600} y={26} width={((sel.product) / T.length) * 600} height={8} fill="var(--accent)" opacity={0.35} />
                    <path d={`M${(sel.fwd.pos / T.length) * 600},16 h${(sel.fwd.seq.length / T.length) * 600} l6,4 l-6,4 h-${(sel.fwd.seq.length / T.length) * 600}z`} fill="#10b981" />
                    <path d={`M${((sel.rev.pos + sel.rev.seq.length) / T.length) * 600},38 h-${(sel.rev.seq.length / T.length) * 600} l-6,4 l6,4 h${(sel.rev.seq.length / T.length) * 600}z`} fill="#ef4444" />
                    <text x={(sel.fwd.pos / T.length) * 600} y={12} fontSize={10} fill="currentColor">F {sel.fwd.pos + 1}</text>
                    <text x={((sel.rev.pos + sel.rev.seq.length) / T.length) * 600} y={58} fontSize={10} textAnchor="end" fill="currentColor">R {sel.rev.pos + sel.rev.seq.length}</text>
                    <text x={600} y={12} fontSize={10} textAnchor="end" fill="var(--muted)">{T.length} nt</text>
                  </svg>
                )}
              </>
            )}
          </Panel>
        )}
        {fwd.len > 0 && rev.len > 0 && (
          <>
            <Stats>
              <Stat label="Tm forward / reverse" value={`${num(fwd.tm, 1)} / ${num(rev.tm, 1)} °C`} sub={`ΔTm ${num(Math.abs(fwd.tm - rev.tm), 1)} °C`} tone={Math.abs(fwd.tm - rev.tm) <= 3 ? 'good' : 'bad'} />
              <Stat label="Suggested annealing" value={`${num(ta, 0)} °C`} sub="≈ lower Tm − 3 °C; optimise by gradient" />
              <Stat label="Product" value={s.mode === 'design' && sel ? `${sel.product} bp` : checkProduct ? `${checkProduct} bp` : '—'} sub={s.mode === 'check' && !checkProduct ? 'primers not found on template' : undefined} />
              <Stat label="Cross-dimer" value={cross && cross.dG < 0 ? dG(cross.dG) : 'none'} tone={cross && cross.dG < (cross.threePrime ? -5 : -6) ? 'bad' : 'good'} />
            </Stats>
            <PrimerCard name="Forward" p={fwd} />
            <PrimerCard name="Reverse" p={rev} />
            {cross && <Panel title="Forward × reverse"><DimerView d={cross} title="Cross-dimer" /></Panel>}
          </>
        )}
        <Note>Screening uses ΔG37 of the most stable perfectly complementary stretch (≥ 3 bp) for dimers and simple hairpins (stem ≥ 3 bp, loop ≥ 3 nt). It is a good first filter; check specificity against the genome (e.g. BLAST) before ordering.</Note>
      </div>
    </Split>
  )
}
