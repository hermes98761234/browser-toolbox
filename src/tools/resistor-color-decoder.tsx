import { useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { C, COLORS, decode, encode, eSeries, formatOhms, nearestE, optionsFor, parseOhms, roles, SERIES, type ColorName } from './lib/resistor-color-decoder'

const DEF = { n: 4, bands: ['yellow', 'violet', 'red', 'gold'] as ColorName[], sel: 0, input: '4k7', tol: 5, tempco: 50, dT: 60 }
const ROLE_NAME = { digit: 'Digit', mult: 'Multiplier', tol: 'Tolerance', tempco: 'Temp. coefficient' }
const PRESETS: [string, number, ColorName[]][] = [
  ['220 Ω LED', 4, ['red', 'red', 'brown', 'gold']],
  ['1 kΩ', 4, ['brown', 'black', 'red', 'gold']],
  ['10 kΩ pull-up', 4, ['brown', 'black', 'orange', 'gold']],
  ['4.99 kΩ 1%', 5, ['yellow', 'white', 'white', 'brown', 'brown']],
  ['100 kΩ 6-band', 6, ['brown', 'black', 'black', 'orange', 'brown', 'red']],
]

const multText = (m: number) => '×' + (m >= 1e9 ? `${m / 1e9}G` : m >= 1e6 ? `${m / 1e6}M` : m >= 1e3 ? `${m / 1e3}k` : String(m))
const textOn = (hex: string) => (['#f5f5f5', '#fbc02d', '#b8bcc2', '#f48fb1', '#c9a227', 'transparent'].includes(hex) ? '#111' : '#fff')

function ResistorSvg({ bands, sel, onPick, precision }: { bands: ColorName[]; sel: number; onPick: (i: number) => void; precision: boolean }) {
  const n = bands.length
  const W = 520, H = 150, bx = 110, bw = 300, cy = 70
  // Value bands bunched to the left, tolerance (and tempco) to the right.
  const xs = bands.map((_, i) => {
    const valueBands = n === 3 ? 3 : n === 4 ? 3 : 4
    if (i < valueBands) return bx + 36 + i * 40
    return bx + bw - 70 + (i - valueBands) * 34
  })
  const body = precision ? '#7fb3d5' : '#e6cfa1'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 620, display: 'block', margin: '0 auto' }} role="img" aria-label="resistor with colour bands">
      <defs>
        <linearGradient id="rshade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.45} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.28} />
        </linearGradient>
      </defs>
      <line x1={10} x2={bx + 10} y1={cy} y2={cy} stroke="#9ca3af" strokeWidth={6} strokeLinecap="round" />
      <line x1={bx + bw - 10} x2={W - 10} y1={cy} y2={cy} stroke="#9ca3af" strokeWidth={6} strokeLinecap="round" />
      <path d={`M${bx} ${cy - 34} q0 -8 14 -8 h42 q10 0 16 8 h${bw - 144} q6 -8 16 -8 h42 q14 0 14 8 v68 q0 8 -14 8 h-42 q-10 0 -16 -8 h-${bw - 144} q-6 8 -16 8 h-42 q-14 0 -14 -8 z`} fill={body} />
      {bands.map((b, i) => {
        const c = C[b]
        const isEnd = xs[i] < bx + 70 || xs[i] > bx + bw - 70
        const h = isEnd ? 84 : 68
        return (
          <g key={i} onClick={() => onPick(i)} style={{ cursor: 'pointer' }}>
            <rect x={xs[i]} y={cy - h / 2} width={18} height={h} fill={b === 'none' ? body : c.hex} stroke={b === 'white' ? '#ccc' : 'none'} />
            {i === sel && <rect x={xs[i] - 4} y={cy - h / 2 - 6} width={26} height={h + 12} fill="none" stroke="var(--accent)" strokeWidth={3} rx={4} />}
            <text x={xs[i] + 9} y={cy + 62} textAnchor="middle" fontSize={11} fill="var(--muted)">{i + 1}</text>
          </g>
        )
      })}
      <path d={`M${bx} ${cy - 34} q0 -8 14 -8 h42 q10 0 16 8 h${bw - 144} q6 -8 16 -8 h42 q14 0 14 8 v68 q0 8 -14 8 h-42 q-10 0 -16 -8 h-${bw - 144} q-6 8 -16 8 h-42 q-14 0 -14 -8 z`} fill="url(#rshade)" pointerEvents="none" />
    </svg>
  )
}

export default function ResistorColorDecoder() {
  const [s, set, reset] = useToolState('resistor-color-decoder', DEF)
  const [msg, setMsg] = useState('')
  const bands = s.bands.slice(0, s.n)
  const r = roles(s.n)
  const sel = Math.min(s.sel, s.n - 1)
  const d = decode(bands)
  const setBand = (i: number, c: ColorName) => set({ bands: bands.map((b, j) => (j === i ? c : b)), sel: Math.min(s.n - 1, i + 1) })
  const changeN = (n: number) => {
    const e = encode(d.ohms, n, n === 3 ? 20 : d.tol === 20 ? 5 : d.tol, d.tempco ?? s.tempco)
    set(e.error ? { n, bands: encode(1000, n, 5).bands, sel: 0 } : { n, bands: e.bands, sel: 0 })
  }
  const applyValue = () => {
    const ohms = parseOhms(s.input)
    const e = encode(ohms, s.n, s.n === 3 ? 20 : s.tol, s.tempco)
    if (e.error) return setMsg(e.error)
    setMsg(e.exact ? '' : `${formatOhms(ohms)} needs more digits than ${s.n} bands give; rounded to ${formatOhms(e.ohms)}.`)
    set({ bands: e.bands })
  }
  const inSeries = SERIES.filter((x) => Number.isFinite(d.ohms) && d.ohms > 0 && Math.abs(nearestE(d.ohms, x).errPct) < 1e-6)
  const drift = d.tempco ? (d.ohms * d.tempco * s.dT) / 1e6 : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Resistor" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={String(s.n)} onChange={(v) => changeN(Number(v))} options={[['3', '3 bands'], ['4', '4 bands'], ['5', '5 bands'], ['6', '6 bands']]} label="Band count" />
          <p className="muted" style={{ fontSize: 13 }}>
            Read from the side where the bands are bunched together; the tolerance band usually stands apart.
          </p>
          <Row>
            {PRESETS.map(([label, n, b]) => (
              <Btn key={label} onClick={() => set({ n, bands: b, sel: 0 })}>{label}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Encode a value">
          <Row>
            <Txt label="Resistance" value={s.input} onChange={(input) => set({ input })} placeholder="4k7, 220R, 1.5M" hint="Accepts 4.7k, 4k7, 0R22, 2.2 MΩ" />
            {s.n >= 4 && (
              <Select label="Tolerance" value={s.tol} onChange={(tol) => set({ tol })} options={optionsFor('tol').map((c) => [c.tol!, `±${c.tol}% (${c.name})`] as const)} />
            )}
            {s.n === 6 && (
              <Select label="Tempco" value={s.tempco} onChange={(tempco) => set({ tempco })} options={optionsFor('tempco').map((c) => [c.tempco!, `${c.tempco} ppm/K (${c.name})`] as const)} />
            )}
          </Row>
          <Btn kind="primary" onClick={applyValue}>Show bands</Btn>
          {msg && <Note tone="warn">{msg}</Note>}
        </Panel>
        <Panel title="Colour code chart">
          <Table
            head={['Colour', 'Digit', 'Multiplier', 'Tolerance', 'ppm/K']}
            rows={COLORS.filter((c) => c.name !== 'none').map((c) => [
              <span key="c"><i style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: c.hex, border: '1px solid var(--line)', verticalAlign: -2, marginRight: 6 }} />{c.name}</span>,
              c.digit ?? '',
              c.mult !== undefined ? multText(c.mult) : '',
              c.tol !== undefined ? `±${c.tol}%` : '',
              c.tempco ?? '',
            ])}
          />
        </Panel>
      </div>

      <div>
        <Panel title="Click a band, then pick its colour">
          <ResistorSvg bands={bands} sel={sel} onPick={(i) => set({ sel: i })} precision={s.n >= 5} />
          <div style={{ textAlign: 'center', margin: '4px 0 10px', fontWeight: 600 }}>
            Band {sel + 1}: {ROLE_NAME[r[sel]]}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {optionsFor(r[sel]).map((c) => {
              const on = bands[sel] === c.name
              const info = r[sel] === 'digit' ? c.digit : r[sel] === 'mult' ? multText(c.mult!) : r[sel] === 'tol' ? `±${c.tol}%` : `${c.tempco}ppm`
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setBand(sel, c.name)}
                  title={c.name}
                  style={{ background: c.hex, color: textOn(c.hex), border: on ? '3px solid var(--accent)' : '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', minWidth: 64, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
                >
                  {c.name}
                  <br />
                  {info}
                </button>
              )
            })}
          </div>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>{bands.join(' · ')}</p>
        </Panel>
        {d.error ? (
          <Note tone="err">{d.error}</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Resistance" value={formatOhms(d.ohms)} tone="accent" sub={`${d.ohms.toLocaleString('en-US')} Ω`} />
              <Stat label="Tolerance" value={`±${d.tol}%`} sub={`${formatOhms(d.min)} … ${formatOhms(d.max)}`} />
              <Stat label="Temp. coefficient" value={d.tempco ? `${d.tempco} ppm/K` : '—'} sub={d.tempco ? `±${formatOhms(drift)} over ${s.dT} K` : 'only on 6-band parts'} />
              <Stat label="Standard series" value={inSeries.length ? inSeries[0] : 'none'} sub={inSeries.length ? `also in ${inSeries.slice(1).join(', ') || '—'}` : 'not a preferred value'} tone={inSeries.length ? 'good' : 'bad'} />
            </Stats>
            <Panel title="Nearest standard (E-series) values" actions={<CopyButton text={`${formatOhms(d.ohms)} ±${d.tol}% (${bands.join(', ')})`} label="Copy" />}>
              <Table
                head={['Series', 'Tolerance', 'Nearest', 'Error', 'Below / above']}
                rows={SERIES.map((x) => {
                  const ne = nearestE(d.ohms, x)
                  const tol = { E6: '±20%', E12: '±10%', E24: '±5%', E48: '±2%', E96: '±1%', E192: '±0.5%' }[x]
                  return [
                    <b key="s">{x}</b>,
                    tol,
                    formatOhms(ne.value),
                    <span key="e" style={{ color: Math.abs(ne.errPct) < 1e-6 ? 'var(--ok)' : undefined }}>{Math.abs(ne.errPct) < 1e-6 ? 'exact' : `${ne.errPct > 0 ? '+' : ''}${ne.errPct.toFixed(2)}%`}</span>,
                    `${formatOhms(ne.below)} / ${formatOhms(ne.above)}`,
                  ]
                })}
              />
              {d.tempco !== undefined && <Num label="Temperature swing for drift estimate" value={s.dT} onChange={(dT) => set({ dT })} unit="K" min={0} />}
              <Note>
                E-series values are spaced evenly on a log scale, so each value's tolerance band touches its neighbours. {eSeries('E24').length} values per decade in E24 (±5%), 96 in E96 (±1%).
              </Note>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
