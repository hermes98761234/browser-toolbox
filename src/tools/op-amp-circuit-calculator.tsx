import type { ReactNode } from 'react'
import { Btn, Check, LineChart, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { bestPairs, closedLoopBw, diffCmrrDb, eng, fullPowerBw, idealGain, mag, nearestValue, noiseGain, OPAMPS, openLoop, phaseDeg, rcFreq, transfer, type Circuit, type Topo } from './lib/op-amp-circuit-calculator'
import type { Series } from './lib/resistor-color-decoder'

interface State extends Circuit { target: number; fTarget: number; series: Series; op: number; vs: number; vin: number; f: number }

const DEF: State = { topo: 'inverting', r1: 10e3, r2: 100e3, r3: 10e3, r4: 100e3, c: 10e-9, rpar: true, target: 10, fTarget: 1000, series: 'E24', op: 2, vs: 12, vin: 0.5, f: 1000 }

const TOPOS: [Topo, string][] = [['inverting', 'Inverting'], ['noninverting', 'Non-inverting'], ['follower', 'Voltage follower'], ['difference', 'Difference'], ['summing', 'Inverting summer'], ['integrator', 'Integrator'], ['differentiator', 'Differentiator']]
const FORMULA: Record<Topo, string> = {
  inverting: 'Vout = −(R2 / R1) · Vin',
  noninverting: 'Vout = (1 + R2 / R1) · Vin',
  follower: 'Vout = Vin (unity gain, high input impedance)',
  difference: 'Vout = (R2 / R1) · (V2 − V1) when R4/R3 = R2/R1',
  summing: 'Vout = −R2 · (V1 / R1 + V2 / R3)',
  integrator: 'Vout = −1/(R1·C) ∫ Vin dt  (R2 ∥ C limits DC gain to −R2/R1)',
  differentiator: 'Vout = −R2·C · dVin/dt',
}

// ---------- schematic ----------
const W = { stroke: 'var(--fg)', strokeWidth: 1.8, fill: 'none' }
function Part({ kind, x1, y1, x2, y2, name, value }: { kind: 'R' | 'C'; x1: number; y1: number; x2: number; y2: number; name: string; value: string }) {
  const vert = x1 === x2
  const len = vert ? y2 - y1 : x2 - x1
  const mid = len / 2
  const body = kind === 'R'
    ? <polyline {...W} points={`${mid - 20},0 ${[...Array(6)].map((_, i) => `${mid - 20 + 3.3 + i * 6.67},${i % 2 ? 6 : -6}`).join(' ')} ${mid + 20},0`} />
    : <><line {...W} x1={mid - 4} y1={-12} x2={mid - 4} y2={12} strokeWidth={2.4} /><line {...W} x1={mid + 4} y1={-12} x2={mid + 4} y2={12} strokeWidth={2.4} /></>
  const gap = kind === 'R' ? 20 : 4
  return (
    <g transform={`translate(${x1},${y1})${vert ? ' rotate(90)' : ''}`}>
      <line {...W} x1={0} y1={0} x2={mid - gap} y2={0} />
      <line {...W} x1={mid + gap} y1={0} x2={len} y2={0} />
      {body}
      <text x={mid} y={vert ? 26 : -12} transform={vert ? `rotate(-90 ${mid} 0) translate(${kind === 'R' ? 14 : 16} 0)` : undefined} textAnchor={vert ? 'start' : 'middle'} fontSize={11} fill="var(--fg)">
        <tspan fontWeight={700}>{name}</tspan> {value}
      </text>
    </g>
  )
}
const Wire = ({ d }: { d: string }) => <path {...W} d={d} />
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={3} fill="var(--fg)" />
const Gnd = ({ x, y }: { x: number; y: number }) => <g {...W}><line x1={x} y1={y} x2={x} y2={y + 8} /><line x1={x - 9} y1={y + 8} x2={x + 9} y2={y + 8} /><line x1={x - 5} y1={y + 12} x2={x + 5} y2={y + 12} /><line x1={x - 2} y1={y + 16} x2={x + 2} y2={y + 16} /></g>
const Term = ({ x, y, t, right }: { x: number; y: number; t: string; right?: boolean }) => (
  <g><circle cx={x} cy={y} r={4} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2} /><text x={right ? x + 8 : x - 8} y={y + 4} textAnchor={right ? 'start' : 'end'} fontSize={12} fontWeight={700} fill="var(--accent)">{t}</text></g>
)

function Schematic({ s }: { s: State }) {
  const R = (v: number) => eng(v, 'Ω'), C = (v: number) => eng(v, 'F')
  const t = s.topo
  const parts: ReactNode[] = []
  // Inverting node N(180,125); feedback across the top (y=70) to output column x=340.
  const feedback = () => {
    parts.push(<Wire key="fb" d="M180,125 V70 H200 M320,70 H340 V150" />, <Dot key="d1" x={180} y={125} />, <Dot key="d2" x={340} y={150} />)
    if (t === 'integrator') {
      parts.push(<Part key="c" kind="C" x1={200} y1={70} x2={320} y2={70} name="C" value={C(s.c)} />)
      if (s.rpar) parts.push(<Wire key="pw" d="M180,70 V30 H200 M320,30 H340 V70" />, <Part key="rp" kind="R" x1={200} y1={30} x2={320} y2={30} name="R2" value={R(s.r2)} />, <Dot key="d3" x={180} y={70} />, <Dot key="d4" x={340} y={70} />)
    } else parts.push(<Part key="rf" kind="R" x1={200} y1={70} x2={320} y2={70} name="R2" value={R(s.r2)} />)
  }
  const plusGnd = () => parts.push(<Wire key="pg" d="M220,175 H200 V190" />, <Gnd key="g" x={200} y={190} />)
  if (t === 'inverting' || t === 'integrator') {
    parts.push(<Term key="vi" x={30} y={125} t="Vin" />, <Wire key="w" d="M30,125 H50 M160,125 H220" />, <Part key="r1" kind="R" x1={50} y1={125} x2={160} y2={125} name="R1" value={R(s.r1)} />)
    feedback(); plusGnd()
  } else if (t === 'differentiator') {
    parts.push(<Term key="vi" x={30} y={125} t="Vin" />, <Wire key="w" d="M30,125 H50 M160,125 H220" />, <Part key="c1" kind="C" x1={50} y1={125} x2={160} y2={125} name="C" value={C(s.c)} />)
    feedback(); plusGnd()
  } else if (t === 'noninverting') {
    parts.push(<Term key="vi" x={30} y={175} t="Vin" />, <Wire key="w" d="M30,175 H220 M170,125 H220" />, <Part key="r1" kind="R" x1={60} y1={125} x2={170} y2={125} name="R1" value={R(s.r1)} />, <Wire key="g1" d="M60,125 V135" />, <Gnd key="g" x={60} y={135} />)
    parts.push(<Wire key="fb" d="M180,125 V70 H200 M320,70 H340 V150" />, <Dot key="d1" x={180} y={125} />, <Dot key="d2" x={340} y={150} />, <Part key="rf" kind="R" x1={200} y1={70} x2={320} y2={70} name="R2" value={R(s.r2)} />)
  } else if (t === 'follower') {
    parts.push(<Term key="vi" x={30} y={175} t="Vin" />, <Wire key="w" d="M30,175 H220 M340,150 V70 H180 V125 H220" />, <Dot key="d2" x={340} y={150} />)
  } else if (t === 'difference') {
    parts.push(<Term key="v1" x={30} y={125} t="V1" />, <Wire key="w" d="M30,125 H50 M160,125 H220" />, <Part key="r1" kind="R" x1={50} y1={125} x2={160} y2={125} name="R1" value={R(s.r1)} />)
    feedback()
    parts.push(<Term key="v2" x={30} y={175} t="V2" />, <Wire key="w2" d="M30,175 H50 M160,175 H220" />, <Part key="r3" kind="R" x1={50} y1={175} x2={160} y2={175} name="R3" value={R(s.r3)} />,
      <Part key="r4" kind="R" x1={170} y1={175} x2={170} y2={235} name="R4" value={R(s.r4)} />, <Gnd key="g4" x={170} y={235} />, <Dot key="dp" x={170} y={175} />)
  } else if (t === 'summing') {
    parts.push(<Term key="v1" x={30} y={100} t="V1" />, <Wire key="w" d="M30,100 H50 M150,100 H180 V150 H150 M180,125 H220" />, <Part key="r1" kind="R" x1={50} y1={100} x2={150} y2={100} name="R1" value={R(s.r1)} />,
      <Term key="v2" x={30} y={150} t="V2" />, <Wire key="w2" d="M30,150 H50" />, <Part key="r3" kind="R" x1={50} y1={150} x2={150} y2={150} name="R3" value={R(s.r3)} />)
    feedback(); plusGnd()
  }
  return (
    <svg viewBox={t === 'integrator' && s.rpar ? '0 10 440 230' : t === 'difference' ? '0 45 440 205' : '0 45 440 175'} style={{ width: '100%', maxWidth: 560, display: 'block', margin: '0 auto' }} role="img" aria-label={`${t} op-amp schematic`}>
      {parts}
      <path d="M220,95 V205 L300,150 Z" fill="var(--panel)" stroke="var(--accent)" strokeWidth={2.2} />
      <text x={226} y={130} fontSize={16} fill="var(--fg)">−</text>
      <text x={226} y={180} fontSize={16} fill="var(--fg)">+</text>
      <Wire d="M300,150 H400" />
      <Term x={400} y={150} t="Vout" right />
    </svg>
  )
}

export default function OpAmpCircuitCalculator() {
  const [s, set, reset] = useToolState('op-amp-circuit-calculator', DEF)
  const op = OPAMPS[s.op] ?? OPAMPS[0]
  const t = s.topo
  const rc = t === 'integrator' || t === 'differentiator'
  const hasRes = !rc && t !== 'follower'
  const ratio = t === 'noninverting' ? s.target - 1 : s.target
  const pairs = hasRes ? bestPairs(ratio, s.series) : []
  const rcSugg = rc ? [1e-9, 2.2e-9, 4.7e-9, 10e-9, 22e-9, 47e-9, 100e-9, 220e-9].map((c) => {
    const r = nearestValue(rcFreq(1, c) / s.fTarget, s.series)
    return { c, r, f: rcFreq(r, c) }
  }).filter((x) => x.r >= 1e3 && x.r <= 1e6) : []

  const g0 = idealGain(s)
  const H = transfer(s, op, s.f)
  const gf = mag(H)
  const vout = gf * s.vin
  const rail = s.vs - op.headroom
  const bw = rc ? NaN : closedLoopBw(s, op)
  const fpbw = fullPowerBw(op.sr, Math.max(1e-6, Math.min(vout, rail)))
  const srNeed = (2 * Math.PI * s.f * vout) / 1e6
  const fc = t === 'integrator' ? rcFreq(s.r1, s.c) : t === 'differentiator' ? rcFreq(s.r2, s.c) : NaN
  const zin = t === 'inverting' || t === 'integrator' ? eng(s.r1, 'Ω') : t === 'summing' ? `${eng(s.r1, 'Ω')} / ${eng(s.r3, 'Ω')}` : t === 'difference' ? `${eng(s.r1, 'Ω')} / ${eng(s.r3 + s.r4, 'Ω')}` : t === 'differentiator' ? `1/(2πfC) = ${eng(1 / (2 * Math.PI * s.f * s.c), 'Ω')}` : 'very high (≈ op-amp input)'

  const freqs = Array.from({ length: 141 }, (_, i) => 10 ** (i / 20))
  const bode = [
    { name: 'Closed loop |H| (dB)', points: freqs.map((f) => [Math.log10(f), 20 * Math.log10(mag(transfer(s, op, f)))] as [number, number]) },
    { name: 'Op-amp open loop (dB)', dashed: true, color: '#94a3b8', points: freqs.map((f) => [Math.log10(f), 20 * Math.log10(mag(openLoop(op, f)))] as [number, number]) },
  ]
  const ph = phaseDeg(H) * (Math.PI / 180)
  const per = 1000 / s.f
  const wave = [
    { name: 'Vin', points: Array.from({ length: 201 }, (_, i) => [(i / 100) * per, s.vin * Math.sin((i / 100) * 2 * Math.PI)] as [number, number]) },
    { name: 'Vout (clipped at rails)', points: Array.from({ length: 201 }, (_, i) => [(i / 100) * per, Math.max(-rail, Math.min(rail, vout * Math.sin((i / 100) * 2 * Math.PI + ph)))] as [number, number]) },
  ]

  const warns: [string, 'warn' | 'err'][] = []
  if (vout > rail) warns.push([`Output clips: needs ±${vout.toFixed(2)} V but ${op.name} on ±${s.vs} V swings only about ±${rail.toFixed(2)} V.`, 'err'])
  if (srNeed > op.sr) warns.push([`Slew-rate limited: a ${eng(s.f, 'Hz')} sine at ${vout.toFixed(2)} V peak needs ${srNeed.toFixed(2)} V/µs, ${op.name} gives ${op.sr} V/µs.`, 'err'])
  if (Number.isFinite(bw) && s.f > bw / 3) warns.push([`Signal is close to the closed-loop bandwidth (${eng(bw, 'Hz')}); gain is already ${(20 * Math.log10(gf / Math.abs(g0))).toFixed(1)} dB off.`, 'warn'])
  if (hasRes && (s.r2 < 1e3 || s.r1 < 1e3)) warns.push(['Resistors under 1 kΩ load the output and waste supply current.', 'warn'])
  if (hasRes && (s.r2 > 1e6 || s.r1 > 1e6)) warns.push(['Resistors above 1 MΩ add noise and bias-current offset; consider a T-network.', 'warn'])
  if (t === 'integrator' && !s.rpar) warns.push(['A pure integrator drifts to a rail from input offset; add R2 in parallel with C.', 'warn'])
  if (t === 'differentiator') warns.push(['Pure differentiators amplify high-frequency noise and can ring; add a small resistor in series with C in practice.', 'warn'])

  const setTopo = (topo: Topo) => set({ topo, ...(topo === 'integrator' ? { r1: 15e3, r2: 150e3, c: 10e-9 } : topo === 'differentiator' ? { r2: 15e3, c: 10e-9 } : {}) })

  return (
    <Split>
      <div>
        <Panel title="Topology" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select<Topo> label="Configuration" value={t} onChange={setTopo} options={TOPOS} />
          <p className="mono" style={{ margin: '4px 0 0', fontSize: 13 }}>{FORMULA[t]}</p>
        </Panel>
        <Panel title="Components">
          {hasRes && (
            <Row>
              <Num label="R1 (input)" value={s.r1} onChange={(r1) => set({ r1 })} unit="Ω" min={1} />
              <Num label="R2 (feedback)" value={s.r2} onChange={(r2) => set({ r2 })} unit="Ω" min={1} />
            </Row>
          )}
          {(t === 'difference' || t === 'summing') && (
            <Row>
              <Num label={t === 'summing' ? 'R3 (input 2)' : 'R3'} value={s.r3} onChange={(r3) => set({ r3 })} unit="Ω" min={1} />
              {t === 'difference' && <Num label="R4" value={s.r4} onChange={(r4) => set({ r4 })} unit="Ω" min={1} />}
            </Row>
          )}
          {rc && (
            <Row>
              <Num label={t === 'integrator' ? 'R1 (input)' : 'R2 (feedback)'} value={t === 'integrator' ? s.r1 : s.r2} onChange={(v) => set(t === 'integrator' ? { r1: v } : { r2: v })} unit="Ω" min={1} />
              <Num label="C (nF)" value={Number((s.c * 1e9).toPrecision(6))} onChange={(v) => set({ c: v * 1e-9 })} unit="nF" min={0.001} />
            </Row>
          )}
          {t === 'integrator' && (
            <>
              <Check label="R2 across C (DC gain limit)" value={s.rpar} onChange={(rpar) => set({ rpar })} />
              {s.rpar && <Num label="R2" value={s.r2} onChange={(r2) => set({ r2 })} unit="Ω" min={1} />}
            </>
          )}
        </Panel>
        <Panel title="Op-amp & signal">
          <Select label="Op-amp model" value={s.op} onChange={(o) => set({ op: o })} options={OPAMPS.map((o, i) => [i, `${o.name} — ${eng(o.gbw, 'Hz')} GBW, ${o.sr} V/µs`] as const)} />
          <Row>
            <Num label="Supply" value={s.vs} onChange={(vs) => set({ vs })} unit="±V" min={1} />
            <Num label="Input peak" value={s.vin} onChange={(vin) => set({ vin })} unit="V" min={0} />
            <Num label="Frequency" value={s.f} onChange={(f) => set({ f: Math.max(0.1, f) })} unit="Hz" min={0.1} />
          </Row>
        </Panel>
        {(hasRes || rc) && (
          <Panel title="Standard-value suggestions">
            <Row>
              {hasRes ? <Num label={t === 'noninverting' ? 'Target gain (≥ 1)' : 'Target |gain|'} value={s.target} onChange={(target) => set({ target })} min={t === 'noninverting' ? 1 : 0.01} />
                : <Num label={t === 'integrator' ? 'Unity-gain frequency' : 'Corner frequency'} value={s.fTarget} onChange={(fTarget) => set({ fTarget })} unit="Hz" min={0.01} />}
              <Select<Series> label="Series" value={s.series} onChange={(series) => set({ series })} options={['E6', 'E12', 'E24', 'E48', 'E96']} />
            </Row>
            {hasRes && (pairs.length ? (
              <Table head={['R1', 'R2', 'Gain', 'Error', '']} rows={pairs.map((p) => [eng(p.rin, 'Ω'), eng(p.rf, 'Ω'), (t === 'noninverting' ? 1 + p.ratio : p.ratio).toFixed(4), `${p.errPct >= 0 ? '+' : ''}${p.errPct.toFixed(2)}%`,
                <Btn key="u" kind="ghost" onClick={() => set({ r1: p.rin, r2: p.rf, ...(t === 'difference' ? { r3: p.rin, r4: p.rf } : {}) })}>Use</Btn>])} />
            ) : <Note tone="warn">{t === 'noninverting' && s.target <= 1 ? 'Gain 1 needs no resistors — use a voltage follower.' : 'No pair within 1 kΩ–1 MΩ.'}</Note>)}
            {rc && <Table head={['C', 'R', 'Frequency', '']} rows={rcSugg.map((x) => [eng(x.c, 'F'), eng(x.r, 'Ω'), eng(x.f, 'Hz'), <Btn key="u" kind="ghost" onClick={() => set(t === 'integrator' ? { r1: x.r, c: x.c, r2: x.r * 10 } : { r2: x.r, c: x.c })}>Use</Btn>])} />}
          </Panel>
        )}
      </div>
      <div>
        <Panel title="Schematic"><Schematic s={s} /></Panel>
        <Stats>
          <Stat label={rc ? `Gain @ ${eng(s.f, 'Hz')}` : 'Ideal gain'} value={rc ? `${gf.toFixed(3)} V/V` : `${g0.toFixed(3)} V/V`} sub={`${(20 * Math.log10(rc ? gf : Math.abs(g0))).toFixed(1)} dB`} tone="accent" />
          {rc ? <Stat label={t === 'integrator' ? 'Unity-gain freq' : 'Corner freq'} value={eng(fc, 'Hz')} sub="1 / (2πRC)" /> : <Stat label="−3 dB bandwidth" value={eng(bw, 'Hz')} sub={`GBW / noise gain ${noiseGain(s).toFixed(2)}`} />}
          <Stat label="Output peak" value={`${vout.toFixed(2)} V`} sub={`phase ${Math.round(phaseDeg(H)) || 0}°`} tone={vout > rail ? 'bad' : undefined} />
          <Stat label="Full-power BW" value={eng(fpbw, 'Hz')} sub={`SR ${op.sr} V/µs`} tone={s.f > fpbw ? 'bad' : undefined} />
        </Stats>
        {warns.map(([w, tone]) => <Note key={w} tone={tone}>{w}</Note>)}
        {!warns.length && <Note tone="ok">Output stays inside the rails and within slew-rate and bandwidth limits.</Note>}
        <Panel title="Details">
          <Table head={['Quantity', 'Value']} rows={[
            ['Input impedance', zin],
            ['Gain at signal frequency', `${gf.toFixed(4)} V/V (${(20 * Math.log10(gf)).toFixed(2)} dB)`],
            ['Output swing limit', `±${rail.toFixed(2)} V (${op.headroom} V headroom)`],
            ['Required slew rate', `${srNeed.toFixed(3)} V/µs`],
            ...(t === 'difference' ? [['CMRR from resistor ratios', Number.isFinite(diffCmrrDb(s)) ? `${diffCmrrDb(s).toFixed(1)} dB` : '∞ (perfect match)']] : []),
          ]} />
        </Panel>
        <Panel title="Frequency response (single-pole op-amp model)">
          <LineChart series={bode} height={240} xLabel="frequency" fx={(v) => eng(10 ** v, 'Hz')} fy={(v) => `${v.toFixed(0)} dB`} xMin={0} xMax={7} />
        </Panel>
        <Panel title="Waveforms (two periods)">
          <LineChart series={wave} height={200} xLabel="time (ms)" fx={(v) => v.toPrecision(3)} fy={(v) => `${v.toFixed(2)} V`} />
        </Panel>
      </div>
    </Split>
  )
}
