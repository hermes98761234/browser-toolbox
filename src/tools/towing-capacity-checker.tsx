import { Bar, Btn, Check, CopyButton, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { checks, derive, LB_PER_KG, worst, type Inputs, type Status } from './lib/towing-capacity-checker'

type Unit = 'lb' | 'kg'
interface State extends Inputs { unit: Unit }

const WEIGHTS = ['gvwr', 'gcwr', 'towBraked', 'towUnbraked', 'maxTongue', 'curb', 'payload', 'rearGawr', 'frontGawr', 'people', 'cargo', 'hitch', 'trailerEmpty', 'trailerCargo', 'trailerGvwr', 'frontUnhitched', 'rearUnhitched'] as const

const PRESETS: Record<string, [string, Partial<Inputs>]> = {
  pickup: ['Full-size pickup + travel trailer', {
    gvwr: 7100, gcwr: 14000, towBraked: 9000, towUnbraked: 2000, maxTongue: 900, curb: 5100, payload: 1800, rearGawr: 4100, frontGawr: 3900,
    people: 400, cargo: 250, hitch: 60, trailerEmpty: 5200, trailerCargo: 900, trailerGvwr: 7000, tonguePct: 12, braked: true, fifth: false,
    axleOn: true, frontUnhitched: 3100, rearUnhitched: 2650, wheelbase: 145, overhang: 48,
  }],
  suv: ['Midsize SUV + pop-up camper', {
    gvwr: 6000, gcwr: 10500, towBraked: 5000, towUnbraked: 1650, maxTongue: 500, curb: 4500, payload: 0, rearGawr: 3300, frontGawr: 3100,
    people: 500, cargo: 150, hitch: 40, trailerEmpty: 2400, trailerCargo: 500, trailerGvwr: 3300, tonguePct: 11, braked: true, fifth: false,
    axleOn: false, frontUnhitched: 2700, rearUnhitched: 2450, wheelbase: 112, overhang: 40,
  }],
  car: ['Compact car + utility trailer', {
    gvwr: 4300, gcwr: 6000, towBraked: 2000, towUnbraked: 1000, maxTongue: 200, curb: 3100, payload: 0, rearGawr: 2200, frontGawr: 2300,
    people: 350, cargo: 100, hitch: 25, trailerEmpty: 500, trailerCargo: 600, trailerGvwr: 1500, tonguePct: 10, braked: false, fifth: false,
    axleOn: false, frontUnhitched: 2000, rearUnhitched: 1550, wheelbase: 106, overhang: 36,
  }],
  fifth: ['Heavy-duty pickup + fifth-wheel', {
    gvwr: 11500, gcwr: 26000, towBraked: 17000, towUnbraked: 2000, maxTongue: 3600, curb: 8000, payload: 0, rearGawr: 7000, frontGawr: 5600,
    people: 400, cargo: 300, hitch: 200, trailerEmpty: 11500, trailerCargo: 2000, trailerGvwr: 15000, tonguePct: 20, braked: true, fifth: true,
    axleOn: false, frontUnhitched: 4900, rearUnhitched: 4000, wheelbase: 160, overhang: -2,
  }],
}

const DEF: State = { unit: 'lb', ...(PRESETS.pickup[1] as Inputs) }
const TONE: Record<Status, string> = { ok: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--err)', na: 'var(--muted)' }
const LABEL: Record<Status, string> = { ok: '✓ Pass', warn: '⚠ Close', fail: '✕ Over', na: '—' }

function Diagram({ s, tongue, trailer, gross }: { s: State; tongue: number; trailer: number; gross: number }) {
  const u = s.unit
  const f = (x: number) => `${Math.round(x).toLocaleString()} ${u}`
  return (
    <svg viewBox="0 0 600 170" style={{ width: '100%', maxWidth: 620, height: 'auto', display: 'block', margin: '0 auto' }} role="img" aria-label="Tow vehicle and trailer diagram">
      <line x1={10} x2={590} y1={140} y2={140} stroke="var(--line)" strokeWidth={2} />
      {/* tow vehicle */}
      <path d="M30,120 V80 L70,80 L95,50 H175 L195,80 H240 V120 Z" fill="var(--accent)" opacity={0.85} />
      <circle cx={75} cy={125} r={15} fill="var(--fg)" /><circle cx={205} cy={125} r={15} fill="var(--fg)" />
      <text x={135} y={102} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={700}>{f(gross)}</text>
      {/* hitch */}
      <line x1={240} x2={s.fifth ? 210 : 262} y1={s.fifth ? 80 : 112} y2={s.fifth ? 80 : 112} stroke="var(--fg)" strokeWidth={4} />
      <path d={`M${s.fifth ? 210 : 262},${s.fifth ? 60 : 92} v14`} stroke="var(--err)" strokeWidth={3} markerEnd="url(#arr)" />
      <text x={s.fifth ? 210 : 262} y={s.fifth ? 52 : 86} textAnchor="middle" fontSize={11} fill="var(--fg)">tongue {f(tongue)}</text>
      {/* trailer */}
      {s.fifth
        ? <path d="M200,72 H300 V40 H560 V120 H300 V72" fill="var(--muted)" opacity={0.5} />
        : <rect x={270} y={45} width={290} height={75} rx={8} fill="var(--muted)" opacity={0.5} />}
      <circle cx={430} cy={125} r={14} fill="var(--fg)" /><circle cx={462} cy={125} r={14} fill="var(--fg)" />
      <text x={420} y={88} textAnchor="middle" fontSize={13} fill="var(--fg)" fontWeight={700}>trailer {f(trailer)}</text>
      <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--err)" /></marker></defs>
    </svg>
  )
}

export default function TowingCapacityChecker() {
  const [s, set, reset] = useToolState('towing-capacity-checker', DEF)
  const u = s.unit
  const d = derive(s)
  const cs = checks(s)
  const verdict = worst(cs)
  const fw = (x: number) => (Number.isFinite(x) ? `${Math.round(x).toLocaleString()} ${u}` : '—')
  const W = (k: (typeof WEIGHTS)[number], label: string, hint?: string) => (
    <Num label={label} value={s[k]} onChange={(v) => set({ [k]: Math.max(0, v) } as Partial<State>)} unit={u} min={0} hint={hint} />
  )
  const switchUnit = (unit: Unit) => {
    if (unit === u) return
    const f = unit === 'kg' ? 1 / LB_PER_KG : LB_PER_KG
    set((st) => ({ ...st, unit, ...Object.fromEntries(WEIGHTS.map((k) => [k, Math.round(st[k] * f)])) }))
  }
  const loadPreset = (k: string) => {
    const p = PRESETS[k][1] as Inputs
    const f = u === 'kg' ? 1 / LB_PER_KG : 1
    set({ ...p, ...Object.fromEntries(WEIGHTS.map((w) => [w, Math.round(p[w] * f)])) })
  }
  const report = () => [`Towing check (${u})`, ...cs.map((c) => `${LABEL[c.status]}  ${c.name}: ${c.unit ? c.actual.toFixed(1) + c.unit : fw(c.actual)} / ${c.unit ? '' : fw(c.limit)}${Number.isFinite(c.ratio) && !c.unit ? ` (${Math.round(c.ratio * 100)}%)` : ''}`)].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Presets & units">
          <Row>
            <Seg value={u} onChange={switchUnit} options={[['lb', 'Pounds'], ['kg', 'Kilograms']]} />
          </Row>
          <Row>
            {Object.entries(PRESETS).map(([k, [n]]) => <Btn key={k} onClick={() => loadPreset(k)}>{n}</Btn>)}
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Presets are generic examples, not ratings for any real model.</p>
        </Panel>
        <Panel title="Tow vehicle ratings">
          <Row>{W('gvwr', 'GVWR', 'Max loaded vehicle weight')}{W('gcwr', 'GCWR', 'Max vehicle + trailer')}</Row>
          <Row>{W('towBraked', 'Towing capacity (braked)')}{W('towUnbraked', 'Towing capacity (unbraked)')}</Row>
          <Row>{W('maxTongue', 'Max tongue / hitch load')}{W('curb', 'Curb weight')}</Row>
          <Row>{W('payload', 'Payload capacity', '0 = use GVWR − curb')}{W('rearGawr', 'Rear axle rating (GAWR)')}</Row>
        </Panel>
        <Panel title="Load in the vehicle">
          <Row>{W('people', 'Passengers incl. driver')}{W('cargo', 'Cargo in vehicle')}{W('hitch', 'Hitch hardware')}</Row>
        </Panel>
        <Panel title="Trailer">
          <Row>{W('trailerEmpty', 'Empty (dry) weight')}{W('trailerCargo', 'Cargo, water, gear')}{W('trailerGvwr', 'Trailer GVWR')}</Row>
          <Slider label="Tongue weight" value={s.tonguePct} onChange={(tonguePct) => set({ tonguePct })} min={0} max={30} step={0.5} unit="%" show={(v) => v.toFixed(1)} />
          <Check label="Trailer has its own brakes" value={s.braked} onChange={(braked) => set({ braked })} />
          <Check label="Fifth-wheel / gooseneck (15–25% pin weight)" value={s.fifth} onChange={(fifth) => set({ fifth })} />
        </Panel>
        <Panel title="Axle check (optional, from a scale)">
          <Check label="Estimate axle loads" value={s.axleOn} onChange={(axleOn) => set({ axleOn })} />
          {s.axleOn && (
            <>
              <Row>{W('frontUnhitched', 'Front axle, loaded, unhitched')}{W('rearUnhitched', 'Rear axle, loaded, unhitched')}</Row>
              <Row>
                <Num label="Wheelbase" value={s.wheelbase} onChange={(wheelbase) => set({ wheelbase: Math.max(1, wheelbase) })} min={1} hint="any length unit" />
                <Num label="Rear axle → hitch ball" value={s.overhang} onChange={(overhang) => set({ overhang })} hint="same unit; negative = ahead of axle" />
              </Row>
            </>
          )}
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        <Note tone={verdict === 'ok' ? 'ok' : verdict === 'warn' ? 'warn' : 'err'}>
          <b style={{ fontSize: 17 }}>{verdict === 'ok' ? 'Within all entered limits.' : verdict === 'warn' ? 'Within limits, but close on some items.' : 'Over at least one limit. Do not tow this setup as entered.'}</b>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Always confirm with <b>your owner’s manual</b>, the door-jamb tyre & loading sticker, the hitch label and the trailer’s VIN plate. Ratings vary by engine, axle ratio,
            cab, options and local law; the lowest rating in the chain wins. Weigh the loaded rig at a public scale before a long trip.
          </div>
        </Note>
        <Stats>
          <Stat label="Loaded trailer" value={fw(d.trailer)} sub={`${Math.round((d.trailer / d.tow) * 100)}% of tow rating`} />
          <Stat label="Tongue weight" value={fw(d.tongue)} sub={`${s.tonguePct}% of trailer`} />
          <Stat label="Payload left" value={fw(d.payloadCap - d.payloadUsed)} tone={d.payloadCap - d.payloadUsed < 0 ? 'bad' : 'good'} />
          <Stat label="GCWR headroom" value={fw(s.gcwr - d.combined)} tone={s.gcwr - d.combined < 0 ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Checks" actions={<CopyButton text={report} label="Copy report" />}>
          {cs.map((c) => (
            <div key={c.name} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ flex: '1 1 220px' }}>{c.name}</b>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {c.unit ? `${c.actual.toFixed(1)}${c.unit}` : fw(c.actual)}
                  <span className="muted"> / {c.unit ? (c.name.startsWith('Tongue') ? `${s.fifth ? 15 : 10}–${c.limit}%` : `${c.limit}%`) : fw(c.limit)}</span>
                </span>
                <b style={{ color: TONE[c.status], whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>{LABEL[c.status]}</b>
              </div>
              {Number.isFinite(c.ratio) && !c.unit && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <div style={{ flex: 1 }}><Bar value={c.ratio} max={1} color={TONE[c.status]} /></div>
                  <span style={{ fontSize: 12, minWidth: 38, textAlign: 'right' }}>{Math.round(c.ratio * 100)}%</span>
                </div>
              )}
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.tip}</div>
            </div>
          ))}
        </Panel>
        <Panel title="Your rig">
          <Diagram s={s} tongue={d.tongue} trailer={d.trailer} gross={d.vehicleGross} />
          {s.axleOn && Number.isFinite(d.rearAxle) && (
            <p style={{ fontSize: 14 }}>
              Estimated hitched axle loads: front <b>{fw(d.frontAxle)}</b> (was {fw(s.frontUnhitched)}), rear <b>{fw(d.rearAxle)}</b> (was {fw(s.rearUnhitched)}, rating {fw(s.rearGawr)}).
            </p>
          )}
        </Panel>
        <Panel title="Terms">
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            <li><b>GVWR</b>: the most the tow vehicle may weigh, including occupants, cargo and tongue weight.</li>
            <li><b>GCWR</b>: the most the vehicle plus loaded trailer may weigh together.</li>
            <li><b>Payload</b>: GVWR minus curb weight; occupants, cargo, hitch and tongue weight all come out of it.</li>
            <li><b>Tongue weight</b>: the trailer’s downward force on the hitch. 10–15% for bumper-pull trailers, 15–25% for fifth-wheels.</li>
            <li><b>GAWR</b>: the maximum load on a single axle.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
