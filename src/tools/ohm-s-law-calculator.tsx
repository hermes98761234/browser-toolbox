import { Btn, CopyButton, LineChart, Note, num, Panel, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { formatSI, nearestE, parseSI, powerRating, solve, UNITS, WHEEL, type Q } from './lib/ohm-s-law-calculator'

const NAMES: Record<Q, string> = { V: 'Voltage', I: 'Current', R: 'Resistance', P: 'Power' }
const COLORS: Record<Q, string> = { V: '#6366f1', I: '#0ea5e9', R: '#f59e0b', P: '#ef4444' }
const ORDER: Q[] = ['V', 'I', 'R', 'P']

const PRESETS: { name: string; text: Partial<Record<Q, string>> }[] = [
  { name: 'LED series resistor (5 V − 2 V at 20 mA)', text: { V: '3', I: '20m' } },
  { name: '12 V car bulb, 21 W', text: { V: '12', P: '21' } },
  { name: '2 kW kettle on 230 V', text: { V: '230', P: '2k' } },
  { name: 'USB port 5 V, 0.5 A', text: { V: '5', I: '0.5' } },
  { name: 'Pull-up 4k7 on 3.3 V', text: { V: '3.3', R: '4k7' } },
  { name: '1 Ω shunt, 2 A', text: { I: '2', R: '1' } },
]

const DEF = { text: { V: '3', I: '20m', R: '', P: '' } as Record<Q, string>, known: ['V', 'I'] as Q[] }

/** Power wheel: 4 inner quadrants (quantity), 12 outer segments (formula). Used formulas are highlighted. */
function Wheel({ used, known }: { used: string[]; known: Q[] }) {
  const S = 340, c = S / 2, r1 = 62, r2 = 160
  const seg = (a0: number, a1: number, ri: number, ro: number) => {
    const p = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`
    const large = a1 - a0 > Math.PI ? 1 : 0
    return `M${p(ro, a0)}A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z`
  }
  const start = -Math.PI
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 360, display: 'block', margin: '0 auto' }} role="img" aria-label="Ohm's law power wheel">
      {ORDER.map((q, k) => {
        const a0 = start + (k * Math.PI) / 2, a1 = a0 + Math.PI / 2, am = (a0 + a1) / 2
        const isKnown = known.includes(q)
        return (
          <g key={q}>
            <path d={seg(a0, a1, 0, r1)} fill={COLORS[q]} opacity={isKnown ? 1 : 0.55} stroke="var(--panel)" strokeWidth={2} />
            <text x={c + r1 * 0.55 * Math.cos(am)} y={c + r1 * 0.55 * Math.sin(am) + 7} textAnchor="middle" fill="#fff" fontWeight={800} fontSize={20}>{q}</text>
            {WHEEL.filter(([w]) => w === q).map(([, f], j) => {
              const b0 = a0 + (j * Math.PI) / 6, b1 = b0 + Math.PI / 6, bm = (b0 + b1) / 2
              const on = used.includes(`${q} = ${f}`)
              const tx = c + ((r1 + r2) / 2 + 6) * Math.cos(bm), ty = c + ((r1 + r2) / 2 + 6) * Math.sin(bm)
              return (
                <g key={f}>
                  <path d={seg(b0, b1, r1 + 3, r2)} fill={on ? COLORS[q] : 'var(--panel2)'} opacity={on ? 0.9 : 1} stroke="var(--line)" strokeWidth={1} />
                  <text x={tx} y={ty + 4} textAnchor="middle" fontSize={12.5} fontWeight={on ? 800 : 500} fill={on ? '#fff' : 'var(--fg)'}>{f}</text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export default function OhmsLawCalculator() {
  const [s, set, reset] = useToolState('ohm-s-law-calculator', DEF)
  const parsed = Object.fromEntries(ORDER.map((q) => [q, parseSI(s.text[q])])) as Record<Q, number | null>
  const knownVals = Object.fromEntries(s.known.filter((q) => parsed[q] !== null).map((q) => [q, parsed[q]!]))
  const res = solve(knownVals)
  const ok = typeof res !== 'string'
  const v = ok ? res.vals : null
  const bad = s.known.filter((q) => s.text[q].trim() && parsed[q] === null)

  const edit = (q: Q, text: string) => {
    const known = s.known.includes(q) ? s.known : [s.known[s.known.length - 1], q].filter(Boolean) as Q[]
    set({ text: { ...s.text, [q]: text }, known })
  }
  const show = (q: Q) => (s.known.includes(q) ? s.text[q] : v ? formatSI(v[q], '', 4).replace(' ', '') : '')

  const rating = v ? powerRating(v.P) : null
  const e24 = v ? nearestE(v.R, 24) : NaN
  const e12 = v ? nearestE(v.R, 12) : NaN

  // V–I characteristic and power curve for the solved resistance
  const curve = v && v.R > 0 ? Array.from({ length: 41 }, (_, k) => (k / 40) * v.V * 1.5) : []

  return (
    <Split>
      <div>
        <Panel title="Known values" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Type any two values — the other two are solved. Prefixes work: <code>4k7</code>, <code>220m</code>, <code>1.5M</code>, <code>10µ</code>.</p>
          {ORDER.map((q) => {
            const isKnown = s.known.includes(q)
            return (
              <label key={q} className="k-field">
                <span className="k-label">
                  <b style={{ color: COLORS[q] }}>{q}</b> · {NAMES[q]} {isKnown ? <span className="muted">(input)</span> : <span style={{ color: 'var(--ok)' }}>(solved)</span>}
                </span>
                <span className="k-input" style={{ borderColor: isKnown ? COLORS[q] : undefined, opacity: isKnown ? 1 : 0.85 }}>
                  <input value={show(q)} onChange={(e) => edit(q, e.target.value)} onFocus={(e) => !isKnown && e.target.select()} inputMode="decimal" aria-label={NAMES[q]} />
                  <span className="k-unit">{UNITS[q]}</span>
                </span>
              </label>
            )
          })}
          {bad.length > 0 && <Note tone="err">Could not read {bad.join(', ')} — use a number with an optional prefix (p n µ m k M G).</Note>}
          {!bad.length && !ok && <Note tone="warn">{res as string}</Note>}
        </Panel>
        <Panel title="Examples">
          <div style={{ display: 'grid', gap: 6 }}>
            {PRESETS.map((p) => (
              <Btn key={p.name} kind="ghost" onClick={() => set({ text: { V: '', I: '', R: '', P: '', ...p.text } as Record<Q, string>, known: Object.keys(p.text) as Q[] })}>
                {p.name}
              </Btn>
            ))}
          </div>
        </Panel>
      </div>
      <div>
        {v && (
          <Stats>
            {ORDER.map((q) => (
              <Stat key={q} label={NAMES[q]} value={formatSI(v[q], UNITS[q])} tone={s.known.includes(q) ? undefined : 'accent'} />
            ))}
          </Stats>
        )}
        <Panel title="Power wheel" actions={ok && <CopyButton text={() => ORDER.map((q) => `${NAMES[q]}: ${formatSI(v![q], UNITS[q])}`).join('\n')} label="Copy results" />}>
          <Wheel used={ok ? res.used : []} known={s.known} />
          {ok && (
            <Row>
              {res.used.map((f) => (
                <code key={f} style={{ background: 'var(--panel2)', padding: '4px 8px', borderRadius: 6 }}>{f}</code>
              ))}
            </Row>
          )}
        </Panel>
        {v && (
          <Panel title="Choosing a part">
            <Table
              head={['Check', 'Value', 'Note']}
              rows={[
                ['Nearest E24 resistor (5 %)', formatSI(e24, 'Ω'), `I would be ${formatSI(v.V / e24, 'A')}`],
                ['Nearest E12 resistor (10 %)', formatSI(e12, 'Ω'), `I would be ${formatSI(v.V / e12, 'A')}`],
                ['Resistor power rating', rating ? `${rating >= 1 ? rating : `1/${Math.round(1 / rating)}`} W` : '> 100 W', 'Dissipation × 2 safety margin'],
                ['Energy per hour', formatSI(v.P, 'Wh'), `${formatSI(v.P * 8760, 'Wh')} per year if left on`],
                ['Charge per hour', formatSI(v.I * 3600, 'C'), `${num(v.I * 1000, 3)} mAh of battery per hour`],
              ]}
            />
            {v.P > 2 && <Note tone="warn">{formatSI(v.P, 'W')} is a lot of heat for a small resistor — use a power resistor with a heatsink or reconsider the design.</Note>}
          </Panel>
        )}
        {v && curve.length > 0 && (
          <Panel title={`Behaviour of ${formatSI(v.R, 'Ω')} as voltage changes`}>
            <LineChart
              xLabel="Voltage (V)"
              fx={(x) => formatSI(x, 'V', 3)}
              fy={(y) => formatSI(y, '', 3)}
              series={[
                { name: 'Current (A)', color: COLORS.I, points: curve.map((x) => [x, x / v.R]) },
                { name: 'Power (W)', color: COLORS.P, points: curve.map((x) => [x, (x * x) / v.R]), dashed: true },
              ]}
              markers={[{ x: v.V, label: 'now' }]}
            />
            <p className="muted" style={{ fontSize: 13 }}>Current rises linearly with voltage (Ohm's law); power rises with the square — doubling the voltage quadruples the heat.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
