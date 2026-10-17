import { Btn, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import {
  APERTURES, ev100, fmt, fmtIso, fmtN, fmtShutter, FULL, ISOS, nearest, SCENES, SHUTTERS, solve, stops, type Exposure, type Param,
} from './lib/exposure-triangle-calculator'

const LISTS: Record<Param, number[]> = { n: APERTURES, t: SHUTTERS, iso: ISOS }
const NAMES: Record<Param, string> = { n: 'Aperture', t: 'Shutter', iso: 'ISO' }
const PARAMS: Param[] = ['n', 't', 'iso']

const DEF = {
  n: 8, t: 1 / 250, iso: 100,
  lock: 'iso' as Param, change: 'n' as Param, value: 2.8,
  focal: 50, crop: 1, maxIso: 6400,
}

const opts = (p: Param) => LISTS[p].map((v) => [v, fmt(p, v)] as const)

function notes(e: Exposure, focal: number, crop: number, maxIso: number): string[] {
  const out: string[] = []
  const safe = 1 / (focal * crop)
  if (e.t > safe * 1.01) out.push(`Slower than 1/${Math.round(focal * crop)} — use a tripod or stabilization`)
  if (e.t <= 1 / 1000) out.push('Freezes fast action')
  if (e.t >= 1) out.push('Long exposure: motion becomes blur/trails')
  if (e.n <= 2.8) out.push('Shallow depth of field, blurry background')
  if (e.n >= 16) out.push('Diffraction softening likely')
  if (e.iso > maxIso) out.push(`ISO above your clean limit (${maxIso})`)
  else if (e.iso >= 3200) out.push('Visible noise')
  return out
}

/** Exposure triangle graphic with each value placed on its edge. */
function Triangle({ e }: { e: Exposure }) {
  const P = { n: [160, 22], t: [28, 210], iso: [292, 210] } as const
  const lab = (p: Param, v: string, sub: string) => {
    const [x, y] = P[p]
    return (
      <g key={p}>
        <circle cx={x} cy={y} r={30} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2} />
        <text x={x} y={y + 1} textAnchor="middle" fontWeight={700} fontSize={13} fill="var(--fg)">{v}</text>
        <text x={x} y={y + 15} textAnchor="middle" fontSize={9} fill="var(--muted)">{NAMES[p]}</text>
        <text x={x} y={p === 'n' ? y + 46 : y + 44} textAnchor="middle" fontSize={10} fill="var(--muted)">{sub}</text>
      </g>
    )
  }
  return (
    <svg viewBox="0 -14 320 276" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }} role="img" aria-label="Exposure triangle">
      <polygon points="160,22 28,210 292,210" fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="var(--line)" strokeWidth={2} />
      <text x={160} y={150} textAnchor="middle" fontSize={22} fontWeight={800} fill="var(--accent)">EV {ev100(e).toFixed(1)}</text>
      <text x={160} y={168} textAnchor="middle" fontSize={10} fill="var(--muted)">at ISO 100</text>
      {lab('n', fmtN(e.n), 'depth of field')}
      {lab('t', fmtShutter(e.t), 'motion')}
      {lab('iso', String(e.iso), 'noise')}
    </svg>
  )
}

export default function ExposureTriangleCalculator() {
  const [s, set, reset] = useToolState('exposure-triangle-calculator', DEF)
  const base: Exposure = { n: s.n, t: s.t, iso: s.iso }
  const ev = ev100(base)
  const change = s.change === s.lock ? PARAMS.find((p) => p !== s.lock)! : s.change
  const solveFor = PARAMS.find((p) => p !== s.lock && p !== change)!
  const value = LISTS[change].includes(s.value) ? s.value : base[change]
  const partial = { ...base, [change]: value }
  const exact = solve(solveFor, partial, ev)
  const snap = nearest(solveFor, LISTS[solveFor], exact)
  const lo = LISTS[solveFor][0], hi = LISTS[solveFor][LISTS[solveFor].length - 1]
  const outOfRange = exact < Math.min(lo, hi) * 0.97 || exact > Math.max(lo, hi) * 1.03
  const next: Exposure = { ...partial, [solveFor]: snap.v }
  const shift = (p: Param) => stops(p, next[p]) - stops(p, base[p])

  // Equivalent exposures: keep the locked value, step the "change" parameter through every marked value.
  const equiv = LISTS[change]
    .map((v) => {
      const e = { ...base, [change]: v }
      const x = solve(solveFor, e, ev)
      const sn = nearest(solveFor, LISTS[solveFor], x)
      return { e: { ...e, [solveFor]: sn.v } as Exposure, err: sn.err, x }
    })
    .filter((r) => Math.abs(r.err) <= 0.2)
    .filter((_, i, a) => a.length < 24 || i % 3 === 0 || a[i].e[change] === base[change])

  const meter = (sceneEv: number) => {
    const t = nearest('t', SHUTTERS, solve('t', base, sceneEv)).v
    set({ t })
  }

  return (
    <Split>
      <div>
        <Panel title="Your current (metered) exposure">
          <Row>
            <Select label="Aperture" value={s.n} onChange={(n) => set({ n })} options={opts('n')} />
            <Select label="Shutter" value={s.t} onChange={(t) => set({ t })} options={opts('t')} />
            <Select label="ISO" value={s.iso} onChange={(iso) => set({ iso })} options={opts('iso')} />
          </Row>
          <Select<number>
            label="…or meter from a typical scene (sets the shutter)"
            value={-99}
            onChange={meter}
            options={[[-99, 'Pick a scene…'], ...SCENES.map(([n, v]) => [v, `${n} — EV ${v}`] as const)]}
          />
        </Panel>
        <Panel title="Change one setting, keep the exposure">
          <div className="k-label" style={{ marginBottom: 4 }}>Keep fixed</div>
          <Seg value={s.lock} onChange={(lock) => set({ lock, change: lock === s.change ? PARAMS.find((p) => p !== lock)! : s.change })} options={PARAMS.map((p) => [p, NAMES[p]] as const)} />
          <div style={{ height: 10 }} />
          <div className="k-label" style={{ marginBottom: 4 }}>I want to set</div>
          <Seg value={change} onChange={(c) => set({ change: c, value: base[c] })} options={PARAMS.filter((p) => p !== s.lock).map((p) => [p, NAMES[p]] as const)} />
          <div style={{ height: 10 }} />
          <Select label={`New ${NAMES[change].toLowerCase()}`} value={value} onChange={(v) => set({ value: v })} options={opts(change)} />
          <Note tone={outOfRange ? 'err' : 'ok'}>
            {outOfRange
              ? `Needs ${fmt(solveFor, exact)} — outside the usual range. Add ND filters or change the fixed setting.`
              : <>Set {NAMES[solveFor].toLowerCase()} to <b>{fmt(solveFor, snap.v)}</b> (exact {fmt(solveFor, exact)}; {Math.abs(snap.err) < 0.02 ? 'spot on' : `${snap.err > 0 ? '+' : '−'}${Math.abs(snap.err).toFixed(2)} stop`}).</>}
          </Note>
          <Btn onClick={() => set({ ...next, value: next[change] })} disabled={outOfRange}>Use as new base</Btn>
        </Panel>
        <Panel title="Camera & lens" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Focal length" value={s.focal} onChange={(focal) => set({ focal })} unit="mm" min={1} />
            <Num label="Crop factor" value={s.crop} onChange={(crop) => set({ crop })} min={0.5} max={10} step={0.1} />
            <Num label="Clean ISO limit" value={s.maxIso} onChange={(maxIso) => set({ maxIso })} min={100} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Handheld rule: shutter ≥ 1/(focal × crop) = {fmtShutter(1 / (s.focal * s.crop || 1))}.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Exposure value" value={`EV ${ev.toFixed(1)}`} sub={`EV ${(ev + Math.log2(s.iso / 100)).toFixed(1)} at ISO ${s.iso} (scene)`} tone="accent" />
          {PARAMS.map((p) => (
            <Stat key={p} label={NAMES[p]} value={fmt(p, next[p])} sub={Math.abs(shift(p)) < 0.05 ? 'unchanged' : `${shift(p) > 0 ? '+' : '−'}${Math.abs(shift(p)).toFixed(1)} stop${shift(p) > 0 ? ' brighter' : ' darker'}`} />
          ))}
        </Stats>
        <Panel title="Exposure triangle">
          <Row>
            <div style={{ flex: '1 1 240px' }}><Triangle e={base} /><p className="muted" style={{ textAlign: 'center', margin: 0, fontSize: 12 }}>Current</p></div>
            <div style={{ flex: '1 1 240px' }}><Triangle e={next} /><p className="muted" style={{ textAlign: 'center', margin: 0, fontSize: 12 }}>New</p></div>
          </Row>
          {notes(next, s.focal, s.crop, s.maxIso).map((n) => <Note key={n} tone="warn">{n}</Note>)}
        </Panel>
        <Panel
          title={`Equivalent exposures (${NAMES[s.lock]} fixed at ${fmt(s.lock, base[s.lock])})`}
          actions={<CsvButton name="equivalent-exposures.csv" rows={() => [['Aperture', 'Shutter', 'ISO', 'Error (stops)'], ...equiv.map((r) => [fmtN(r.e.n), fmtShutter(r.e.t), r.e.iso, r.err.toFixed(2)])]} />}
        >
          <Table
            head={['Aperture', 'Shutter', 'ISO', 'Effect']}
            rows={equiv.map((r) => {
              const cur = r.e[change] === base[change]
              const w = (t: string) => (cur ? <b>{t}</b> : t)
              return [w(fmtN(r.e.n)), w(fmtShutter(r.e.t)), w(fmtIso(r.e.iso)), <span key="e" className="muted" style={{ fontSize: 12 }}>{cur ? 'current · ' : ''}{notes(r.e, s.focal, s.crop, s.maxIso).join(' · ') || 'balanced'}</span>]
            })}
          />
        </Panel>
        <Panel title="Full-stop reference">
          <Table
            head={['Stop', 'Aperture', 'Shutter', 'ISO']}
            rows={Array.from({ length: 14 }, (_, i) => [
              i === 0 ? '0' : `+${i}`,
              FULL.n[i] ? fmtN(FULL.n[i]) : '',
              fmtShutter(FULL.t[i]),
              FULL.iso[i] ? FULL.iso[i] : '',
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Each row is one stop: f-number ×√2, shutter ÷2 and ISO ×2 each change light by a factor of 2 (aperture/shutter darker, ISO brighter).</p>
        </Panel>
      </div>
    </Split>
  )
}
