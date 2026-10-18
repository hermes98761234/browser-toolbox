import { Btn, CopyButton, fmt, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { APPLICATIONS, fromRa, GOST, gostClass, N_GRADES, nGrade, PROCESSES, RQ_RA, toRa, type Param, type Profile, type Unit } from './lib/surface-finish-converter'

interface S { value: number; param: Param | 'n' | 'gost'; unit: Unit; profile: Profile; rz: number; rt: number }
const DEF: S = { value: 1.6, param: 'ra', unit: 'um', profile: 'sine', rz: 5, rt: 1.2 }

const P_LABEL: Record<Param, string> = { ra: 'Ra (arithmetic mean)', rq: 'Rq / RMS', rz: 'Rz (mean peak-to-valley, ISO)', rt: 'Rt / Rmax (total height)' }
const LO = 0.01, HI = 100
const lx = (v: number, w: number) => ((Math.log10(Math.max(LO, Math.min(HI, v))) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO))) * w

/** ISO 1302 surface texture symbol with the Ra requirement. */
function Symbol({ ra, removal }: { ra: number; removal: boolean }) {
  return (
    <svg viewBox="0 0 150 80" width={150} height={80} role="img" aria-label="Surface texture symbol">
      <path d="M10,45 L22,62 L48,10 L140,10" fill="none" stroke="var(--fg)" strokeWidth={2} />
      {removal && <path d="M10,45 L30.5,45" stroke="var(--fg)" strokeWidth={2} />}
      <text x={56} y={30} fontSize={15} fill="var(--fg)" fontFamily="var(--mono)">Ra {fmt(ra, 3)}</text>
      <text x={0} y={78} fontSize={10} fill="var(--muted)">{removal ? 'machining required' : 'any process'}</text>
    </svg>
  )
}

export default function SurfaceFinishConverter() {
  const [s, set, reset] = useToolState('surface-finish-converter', DEF)
  const m = { profile: s.profile, rzRatio: s.rz, rtRatio: s.rt }
  const ra = s.param === 'n' ? N_GRADES[Math.min(11, Math.max(0, Math.round(s.value) - 1))][1] : s.param === 'gost' ? GOST[Math.min(13, Math.max(0, Math.round(s.value) - 1))][1] : toRa(s.value, s.param, s.unit, m)
  const ok = ra > 0 && Number.isFinite(ra)
  const ng = nGrade(ra), gc = gostClass(ra)
  const params: Param[] = ['ra', 'rq', 'rz', 'rt']
  const W = 560
  const summary = params.map((p) => `${p.toUpperCase().replace('R', 'R')} ${fmt(fromRa(ra, p, 'um', m), 3)} µm (${fmt(fromRa(ra, p, 'uin', m), 1)} µin)`).join(' · ')

  return (
    <Split>
      <div>
        <Panel title="Convert" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select<S['param']> label="I have" value={s.param} onChange={(param) => set({ param, value: param === 'n' ? 7 : param === 'gost' ? 6 : s.param === 'n' || s.param === 'gost' ? 1.6 : s.value })} options={[...params.map((p) => [p, P_LABEL[p]] as [S['param'], string]), ['n', 'ISO N-grade (N1–N12)'], ['gost', 'GOST 2789 class (1–14)']]} />
          {s.param === 'n' ? (
            <Select label="Grade" value={Math.round(s.value)} onChange={(value) => set({ value })} options={N_GRADES.map(([g, v], i) => [i + 1, `${g} — Ra ${v} µm`] as [number, string])} />
          ) : s.param === 'gost' ? (
            <Select label="Class" value={Math.round(s.value)} onChange={(value) => set({ value })} options={GOST.map(([c, v]) => [c, `Class ${c} — Ra ≤ ${v} µm`] as [number, string])} />
          ) : (
            <Row>
              <Num label="Value" value={s.value} onChange={(value) => set({ value })} min={0} unit={s.unit === 'um' ? 'µm' : 'µin'} />
              <div style={{ alignSelf: 'end' }}>
                <Seg value={s.unit} onChange={(unit) => set({ unit, value: +(unit === s.unit ? s.value : unit === 'uin' ? s.value / 0.0254 : s.value * 0.0254).toPrecision(4) })} options={[['um', 'µm'], ['uin', 'µin']]} />
              </div>
            </Row>
          )}
          <Row>
            {[0.4, 0.8, 1.6, 3.2, 6.3].map((v) => <Btn key={v} kind="ghost" onClick={() => set({ param: 'ra', unit: 'um', value: v })}>Ra {v}</Btn>)}
            {[16, 32, 63, 125].map((v) => <Btn key={v} kind="ghost" onClick={() => set({ param: 'ra', unit: 'uin', value: v })}>{v} µin</Btn>)}
          </Row>
        </Panel>
        <Panel title="Approximation model">
          <Select<Profile> label="Profile shape (for Rq/Ra)" value={s.profile} onChange={(profile) => set({ profile })} options={[['sine', `Periodic turned/milled (sinusoid) — Rq ≈ ${RQ_RA.sine.toFixed(3)}·Ra`], ['triangle', `Saw-tooth feed marks — Rq ≈ ${RQ_RA.triangle.toFixed(3)}·Ra`], ['gauss', `Random ground/blasted (Gaussian) — Rq ≈ ${RQ_RA.gauss.toFixed(3)}·Ra`]]} />
          <Slider label="Rz / Ra ratio" value={s.rz} onChange={(rz) => set({ rz })} min={3} max={10} step={0.5} show={(v) => v.toFixed(1)} />
          <Slider label="Rt / Rz ratio" value={s.rt} onChange={(rt) => set({ rt })} min={1} max={1.6} step={0.05} show={(v) => v.toFixed(2)} />
          <Note tone="warn">
            Only µm ⇄ µin and the grade tables are exact. Ra, Rq, Rz and Rt measure different things, so conversions between them are <b>approximate ratios</b>:
            Rz is commonly 4–7 × Ra (≈ 4 for turning, 7+ for grinding and honing). When a drawing specifies Rz, measure Rz.
          </Note>
        </Panel>
        <Panel title="Typical requirements">
          <Table head={['Application', 'Ra µm', 'µin']} rows={APPLICATIONS.map(([a, lo, hi]) => [a, `${lo} – ${hi}`, `${Math.round(lo / 0.0254)} – ${Math.round(hi / 0.0254)}`])} />
        </Panel>
      </div>
      <div>
        {!ok ? (
          <Note tone="err">Enter a positive roughness value.</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Ra" value={`${fmt(ra, 3)} µm`} sub={`${fmt(ra / 0.0254, 1)} µin`} tone="accent" />
              <Stat label={`Rq (≈ ${RQ_RA[s.profile].toFixed(2)}·Ra)`} value={`${fmt(fromRa(ra, 'rq', 'um', m), 3)} µm`} sub={`${fmt(fromRa(ra, 'rq', 'uin', m), 1)} µin`} />
              <Stat label={`Rz (≈ ${s.rz}·Ra)`} value={`${fmt(fromRa(ra, 'rz', 'um', m), 2)} µm`} sub={`${fmt(fromRa(ra, 'rz', 'uin', m), 0)} µin`} />
              <Stat label="Rt / Rmax (≈)" value={`${fmt(fromRa(ra, 'rt', 'um', m), 2)} µm`} sub={`${fmt(fromRa(ra, 'rt', 'uin', m), 0)} µin`} />
              <Stat label="ISO 1302 grade" value={ng ? ng.grade : '> N12'} sub={ng ? `meets Ra ≤ ${ng.limit} µm` : 'rougher than 50 µm'} />
              <Stat label="GOST 2789 class" value={gc ?? '—'} sub={gc ? `Ra ≤ ${GOST[gc - 1][1]} µm` : 'out of range'} />
            </Stats>
            <Panel title="Drawing callout" actions={<CopyButton text={summary} label="Copy values" />}>
              <Row>
                <Symbol ra={ra} removal />
                <div className="muted" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
                  ISO 1302 symbol with an upper Ra limit. Older drawings may use the N-grade ({ng?.grade ?? '—'}) or, in the US, µin values on the check mark ({Math.round(ra / 0.0254)}).
                </div>
              </Row>
            </Panel>
            <Panel title="Which processes reach this finish?">
              <svg viewBox={`0 0 ${W + 170} ${PROCESSES.length * 22 + 40}`} style={{ width: '100%' }} role="img" aria-label="Process roughness ranges">
                {[0.01, 0.1, 1, 10, 100].map((v) => (
                  <g key={v}>
                    <line x1={170 + lx(v, W)} x2={170 + lx(v, W)} y1={14} y2={PROCESSES.length * 22 + 18} stroke="var(--grid)" />
                    <text x={170 + lx(v, W)} y={10} fontSize={11} textAnchor="middle" fill="var(--muted)">{v} µm</text>
                  </g>
                ))}
                {PROCESSES.map(([nm, lo, hi, rlo, rhi], i) => {
                  const y = 20 + i * 22
                  const fits = ra >= lo && ra <= hi, maybe = ra >= rlo && ra <= rhi
                  return (
                    <g key={nm}>
                      <text x={164} y={y + 12} fontSize={13} textAnchor="end" fill={fits ? 'var(--fg)' : 'var(--muted)'} fontWeight={fits ? 700 : 400}>{nm}</text>
                      <rect x={170 + lx(rlo, W)} y={y + 4} width={lx(rhi, W) - lx(rlo, W)} height={8} rx={4} fill="var(--accent)" opacity={0.2} />
                      <rect x={170 + lx(lo, W)} y={y + 2} width={lx(hi, W) - lx(lo, W)} height={12} rx={4} fill={fits ? 'var(--ok)' : maybe ? 'var(--warn)' : 'var(--accent)'} opacity={fits ? 0.9 : 0.55} />
                    </g>
                  )
                })}
                <line x1={170 + lx(ra, W)} x2={170 + lx(ra, W)} y1={14} y2={PROCESSES.length * 22 + 22} stroke="var(--err)" strokeWidth={2} />
                <text x={170 + lx(ra, W)} y={PROCESSES.length * 22 + 34} fontSize={12} textAnchor="middle" fill="var(--err)">Ra {fmt(ra, 3)}</text>
              </svg>
              <div className="muted" style={{ fontSize: 12 }}>Solid bars: typical production range (green = reaches your value). Pale bars: achievable with extra care. Typical chart figures; log scale.</div>
            </Panel>
            <Panel title="Grade table">
              <Table
                head={['N-grade', 'Ra µm', 'Ra µin', `Rz ≈ µm (×${s.rz})`, '']}
                rows={N_GRADES.map(([g, v]) => [g, v, Math.round(v / 0.0254), fmt(v * s.rz, 2), ng?.grade === g ? '◀ your value' : ''])}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
