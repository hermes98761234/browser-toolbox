import { useMemo } from 'react'
import { Btn, CsvButton, fmt, LineChart, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { closedLoopPoles, margins, padd, parseTf, polyToString, roots, sweep, type Cx, type Tf } from './lib/bode-plot-generator'

const PRESETS: [string, string, string, number][] = [
  ['Type-1 plant 1/(s(s+1)(s+2))', '1', 's(s+1)(s+2)', 0],
  ['Second-order, ζ = 0.2, ωn = 10', '100', 's^2 + 4s + 100', 0],
  ['First-order low-pass, τ = 0.1 s', '1', '0.1s + 1', 0],
  ['Lead compensator × plant', '20(s+1)', 's(s+10)(0.5s+1)', 0],
  ['PI + motor', '5(s+2)', 's^2(s+5)', 0],
  ['Lag with dead time', '2', '(10s+1)', 0.8],
  ['Non-minimum phase', '-(s-1)', '(s+1)(s+3)', 0],
  ['Notch filter', 's^2 + 100', 's^2 + 4s + 100', 0],
]

const DEF = { num: '1', den: 's(s+1)(s+2)', delay: 0, k: 1, w0: -2, w1: 2, unit: 'rad' as 'rad' | 'hz' }

const fmtW = (w: number, hz: boolean) => (hz ? `${fmt(w / (2 * Math.PI), 4)} Hz` : `${fmt(w, 4)} rad/s`)
const rootRows = (rs: Cx[]) =>
  rs
    .filter((r) => r[1] >= 0)
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
    .map((r) => {
      const wn = Math.hypot(r[0], r[1])
      return [r[1] ? `${fmt(r[0], 5)} ± ${fmt(r[1], 5)}j` : fmt(r[0], 6), fmt(wn, 5), r[1] ? fmt(-r[0] / (wn || 1), 4) : '—', r[0] > 1e-9 ? <b key="u" style={{ color: 'var(--err)' }}>RHP</b> : Math.abs(r[0]) <= 1e-9 ? 'on jω axis' : 'LHP']
    })

export default function BodePlotGenerator() {
  const [s, set, reset] = useToolState('bode-plot-generator', DEF)
  const parsed = useMemo(() => {
    try {
      const num = parseTf(s.num).map((c) => c * s.k)
      const den = parseTf(s.den)
      if (den.every((c) => c === 0)) throw new Error('Denominator is zero')
      if (num.length > den.length) return { tf: { num, den, delay: Math.max(0, s.delay) } as Tf, err: '', warn: 'Improper transfer function (more zeros than poles): magnitude grows without bound.' }
      return { tf: { num, den, delay: Math.max(0, s.delay) } as Tf, err: '', warn: '' }
    } catch (e) {
      return { tf: null, err: (e as Error).message, warn: '' }
    }
  }, [s.num, s.den, s.k, s.delay])
  const tf = parsed.tf
  const hz = s.unit === 'hz'
  const lo = Math.min(s.w0, s.w1 - 1), hi = Math.max(s.w1, s.w0 + 1)
  const off = hz ? Math.log10(2 * Math.PI) : 0 // axis in Hz: ω = 2πf
  const data = useMemo(() => (tf ? sweep(tf, 10 ** (lo + off), 10 ** (hi + off), 500) : []), [tf, lo, hi, off])
  const m = useMemo(() => (tf ? margins(tf, 10 ** Math.min(lo + off, -4), 10 ** Math.max(hi + off, 5)) : null), [tf, lo, hi, off])
  const zs = useMemo(() => (tf ? roots(tf.num) : []), [tf])
  const ps = useMemo(() => (tf ? roots(tf.den) : []), [tf])
  const cl = useMemo(() => (tf && !tf.delay ? closedLoopPoles(tf) : []), [tf])
  const clBw = useMemo(() => (tf && !tf.delay ? margins({ num: tf.num, den: padd(tf.den, tf.num), delay: 0 }, 1e-4, 1e6).bandwidth : null), [tf])
  const integ = !!tf && Math.abs(tf.den[0]) < 1e-15
  const clStable = cl.length > 0 && cl.every((p) => p[0] < -1e-9)
  const X = (w: number) => Math.log10(hz ? w / (2 * Math.PI) : w)
  const marks = (w: number | null | undefined, l: string) => (w && X(w) >= lo && X(w) <= hi ? [{ x: X(w), label: l }] : [])
  const fx = (v: number) => {
    const r = 10 ** v
    return Math.abs(v - Math.round(v)) < 1e-6 ? (r >= 1000 ? `${r / 1000}k` : `${+r.toPrecision(3)}`) : ''
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Transfer function G(s) = K · N(s) / D(s) · e^(−sT)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Numerator N(s)" value={s.num} onChange={(num) => set({ num })} placeholder="10(s+1)  or  [10 10]" />
          <Txt label="Denominator D(s)" value={s.den} onChange={(den) => set({ den })} placeholder="s(s+2)(s+5)  or  [1 7 10 0]" />
          {parsed.err ? <Note tone="err">{parsed.err}</Note> : tf && (
            <div className="mono" style={{ textAlign: 'center', margin: '8px 0', fontSize: 13 }}>
              <div>{polyToString(tf.num)}</div>
              <div style={{ borderTop: '1px solid var(--text)', margin: '2px auto', width: '80%' }} />
              <div>{polyToString(tf.den)}</div>
            </div>
          )}
          {parsed.warn && <Note tone="warn">{parsed.warn}</Note>}
          <Slider label="Loop gain K" value={Math.log10(s.k)} min={-2} max={3} step={0.01} show={(v) => fmt(10 ** v, 3)} onChange={(v) => set({ k: +(10 ** v).toPrecision(4) })} />
          <Row>
            <Num label="Gain K" value={s.k} onChange={(k) => set({ k })} min={0} />
            <Num label="Dead time T" value={s.delay} onChange={(delay) => set({ delay })} unit="s" min={0} />
          </Row>
          <p className="muted" style={{ margin: 0 }}>Write polynomials in s with + − * ^ and parentheses (implicit products allowed), or coefficient lists in descending powers like [1 3 2].</p>
        </Panel>
        <Panel title="Frequency range">
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['rad', 'rad/s'], ['hz', 'Hz']]} />
          <Row>
            <Num label="From 10^" value={s.w0} onChange={(w0) => set({ w0 })} min={-6} max={8} step={1} />
            <Num label="To 10^" value={s.w1} onChange={(w1) => set({ w1 })} min={-5} max={9} step={1} />
          </Row>
        </Panel>
        <Panel title="Examples">
          {PRESETS.map(([n, num, den, delay]) => (
            <Btn key={n} kind="ghost" onClick={() => set({ num, den, delay, k: 1 })}>{n}</Btn>
          ))}
        </Panel>
      </div>
      <div>
        {m && (
          <Stats>
            <Stat label="Gain margin" value={m.gm === null ? '∞' : `${m.gm.toFixed(2)} dB`} tone={m.gm === null || m.gm > 6 ? 'good' : m.gm > 0 ? 'accent' : 'bad'} sub={m.wgm ? `at ${fmtW(m.wgm, hz)}` : 'phase never reaches −180°'} />
            <Stat label="Phase margin" value={m.pm === null ? '∞' : `${m.pm.toFixed(2)}°`} tone={m.pm === null || m.pm > 45 ? 'good' : m.pm > 0 ? 'accent' : 'bad'} sub={m.wpm ? `at ${fmtW(m.wpm, hz)}` : '|G| never crosses 0 dB'} />
            {tf?.delay || !clStable ? (
              <Stat label="−3 dB bandwidth" value={!integ && m.bandwidth ? fmtW(m.bandwidth, hz) : '—'} sub={integ ? 'open loop has an integrator' : 'of G(jω), open loop'} />
            ) : (
              <Stat label="Closed-loop bandwidth" value={clBw ? fmtW(clBw, hz) : '—'} sub="−3 dB of G/(1+G)" />
            )}
            <Stat label="Closed loop (unity feedback)" value={tf?.delay ? 'see margins' : clStable ? 'Stable' : 'Unstable'} tone={tf?.delay ? undefined : clStable ? 'good' : 'bad'} sub={tf?.delay ? 'dead time: judge by margins' : `${cl.length} poles of D + KN`} />
          </Stats>
        )}
        <Panel title="Magnitude" actions={<CsvButton name="bode.csv" rows={() => [[hz ? 'f (Hz)' : 'w (rad/s)', 'magnitude', 'dB', 'phase (deg)'], ...data.map((p) => [hz ? p.w / (2 * Math.PI) : p.w, p.mag, p.db, p.phase])]} />}>
          <LineChart
            series={[{ name: '|G| dB', points: data.map((p) => [X(p.w), p.db]) }, { name: '0 dB', points: [[lo, 0], [hi, 0]], color: '#94a3b8', dashed: true }]}
            height={240} xMin={lo} xMax={hi} fx={fx} fy={(v) => `${fmt(v, 1)}`} xLabel={hz ? 'frequency (Hz)' : 'ω (rad/s)'} yLabel="dB"
            markers={[...marks(m?.wpm, 'ωgc'), ...marks(m?.wgm, 'ωpc')]}
          />
        </Panel>
        <Panel title="Phase">
          <LineChart
            series={[{ name: '∠G (deg)', points: data.map((p) => [X(p.w), p.phase]), color: '#f59e0b' }, { name: '−180°', points: [[lo, -180], [hi, -180]], color: '#94a3b8', dashed: true }]}
            height={240} xMin={lo} xMax={hi} fx={fx} fy={(v) => `${fmt(v, 0)}°`} xLabel={hz ? 'frequency (Hz)' : 'ω (rad/s)'}
            markers={[...marks(m?.wpm, 'ωgc'), ...marks(m?.wgm, 'ωpc')]}
          />
          {m && m.pm !== null && m.pm < 30 && m.pm > 0 && <Note tone="warn">Phase margin below 30° means a lightly damped, oscillatory closed loop. Aim for 45–60°.</Note>}
          {m && ((m.gm !== null && m.gm < 0) || (m.pm !== null && m.pm < 0)) && <Note tone="err">Negative margin: the unity-feedback loop is unstable (for minimum-phase, open-loop-stable systems).</Note>}
        </Panel>
        <Panel title="Poles and zeros">
          <h4 style={{ margin: '4px 0' }}>Poles of G</h4>
          <Table head={['Pole', 'ωn', 'ζ', 'Half-plane']} rows={rootRows(ps)} />
          <h4 style={{ margin: '10px 0 4px' }}>Zeros of G</h4>
          {zs.length ? <Table head={['Zero', 'ωn', 'ζ', 'Half-plane']} rows={rootRows(zs)} /> : <p className="muted">No finite zeros.</p>}
          {cl.length > 0 && (
            <>
              <h4 style={{ margin: '10px 0 4px' }}>Closed-loop poles (1 + G = 0)</h4>
              <Table head={['Pole', 'ωn', 'ζ', 'Half-plane']} rows={rootRows(cl)} />
            </>
          )}
          <p className="muted">Complex pairs are listed once (±). ζ is the damping ratio of a complex pair.</p>
        </Panel>
      </div>
    </Split>
  )
}
