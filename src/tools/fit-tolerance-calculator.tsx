import { Btn, Check, CopyButton, CsvButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fit, hole, IT, PRESETS, shaft, SHAFT_LETTERS, stepOf, unitI, geoMean, type Letter, type Limits } from './lib/fit-tolerance-calculator'

interface State { size: number; hl: Letter; hg: number; sl: Letter; sg: number; published: boolean }
const DEF: State = { size: 25, hl: 'h', hg: 7, sl: 'g', sg: 6, published: false }

const GRADES = Array.from({ length: 18 }, (_, i) => i + 1)
const up = (l: string) => l.toUpperCase()
const sgn = (v: number) => (v > 0 ? `+${fmtU(v)}` : v < 0 ? `−${fmtU(-v)}` : '0')
const fmtU = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const KIND_COLOR = { clearance: '#10b981', transition: '#f59e0b', interference: '#ef4444' }

function Diagram({ h, s, hName, sName, size }: { h: Limits; s: Limits; hName: string; sName: string; size: number }) {
  const W = 520, H = 280, L = 70, R = 20, T = 20, B = 30
  const vals = [h.upper, h.lower, s.upper, s.lower, 0]
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const pad = (hi - lo) * 0.15 || 5
  lo -= pad
  hi += pad
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B)
  const ticks = 6
  const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / ticks)))
  const st = [1, 2, 5, 10].map((k) => k * step).find((k) => (hi - lo) / k <= ticks) ?? step * 10
  const tv: number[] = []
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) tv.push(+v.toFixed(6))
  const box = (lim: Limits, x: number, c: string, name: string) => (
    <g>
      <rect x={x} y={y(lim.upper)} width={130} height={Math.max(2, y(lim.lower) - y(lim.upper))} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={2} />
      <text x={x + 65} y={(y(lim.upper) + y(lim.lower)) / 2 + 5} textAnchor="middle" fontWeight={700} fontSize={15} fill="currentColor">{name}</text>
      <text x={x + 136} y={y(lim.upper) + 4} fontSize={11} fill="currentColor">{sgn(lim.upper)}</text>
      <text x={x + 136} y={y(lim.lower) + 4} fontSize={11} fill="currentColor">{sgn(lim.lower)}</text>
    </g>
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="tolerance zone diagram">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" strokeWidth="1" /></pattern>
      </defs>
      {tv.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line, #e2e8f0)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted, #64748b)">{sgn(v)}</text>
        </g>
      ))}
      <rect x={L} y={y(0)} width={W - L - R} height={Math.max(0, H - B - y(0))} fill="url(#hatch)" opacity={0.18} />
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth={2} />
      <text x={W - R} y={y(0) - 6} textAnchor="end" fontSize={11} fill="currentColor">zero line · Ø{size} mm</text>
      <text x={8} y={T + 4} fontSize={11} fill="var(--muted, #64748b)">µm</text>
      {box(h, L + 50, '#6366f1', hName)}
      {box(s, L + 250, '#10b981', sName)}
    </svg>
  )
}

export default function FitToleranceCalculator() {
  const [s, set, reset] = useToolState('fit-tolerance-calculator', DEF)
  const o = { published: s.published }
  const valid = !!stepOf(s.size)
  const h = valid ? hole(s.hl, s.hg, s.size, o) : null
  const sh = valid ? shaft(s.sl, s.sg, s.size, o) : null
  const f = h && sh ? fit(h, sh) : null
  const hName = `${up(s.hl)}${s.hg}`, sName = `${s.sl}${s.sg}`
  const st = stepOf(s.size)
  const mm = (dev: number) => (s.size + dev / 1000).toFixed(3)
  const presetRows = valid ? PRESETS.map((p) => {
    const [a, b] = p.fit.split('/')
    const hh = hole(a.replace(/\d+/, '').toLowerCase() as Letter, Number(a.replace(/\D+/, '')), s.size, o)
    const ss = shaft(b.replace(/\d+/, '') as Letter, Number(b.replace(/\D+/, '')), s.size, o)
    return { p, hh, ss, ff: hh && ss ? fit(hh, ss) : null }
  }) : []
  const diffs = valid ? [5, 6, 7, 8, 9, 10, 11].filter((g) => IT(g, s.size, { published: true }) !== IT(g, s.size, { published: false })) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Fit" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Num label="Nominal size" value={s.size} onChange={(size) => set({ size })} unit="mm" min={0.1} max={500} hint={st ? `size step: over ${st[0]} to ${st[1]} mm (D = ${geoMean(st).toFixed(2)} mm, i = ${unitI(geoMean(st)).toFixed(3)} µm)` : 'ISO 286 formulas here cover 0–500 mm'} />
          <Select label="Preset (ISO preferred fits)" value={`${hName}/${sName}`} onChange={(v) => {
            const [a, b] = v.split('/')
            set({ hl: a.replace(/\d+/, '').toLowerCase() as Letter, hg: Number(a.replace(/\D+/, '')), sl: b.replace(/\d+/, '') as Letter, sg: Number(b.replace(/\D+/, '')) })
          }} options={[...(PRESETS.some((p) => p.fit === `${hName}/${sName}`) ? [] : [[`${hName}/${sName}`, `${hName}/${sName} (custom)`] as [string, string]]), ...PRESETS.map((p) => [p.fit, `${p.fit} · ${p.name}`] as [string, string])]} />
          <Row>
            <Select label="Hole letter" value={s.hl} onChange={(hl) => set({ hl })} options={SHAFT_LETTERS.map((l) => [l, up(l)] as [Letter, string])} />
            <Select label="Hole grade IT" value={s.hg} onChange={(hg) => set({ hg })} options={GRADES} />
          </Row>
          <Row>
            <Select label="Shaft letter" value={s.sl} onChange={(sl) => set({ sl })} options={SHAFT_LETTERS.map((l) => [l, l] as [Letter, string])} />
            <Select label="Shaft grade IT" value={s.sg} onChange={(sg) => set({ sg })} options={GRADES} />
          </Row>
          <Check label="Snap IT5–IT11 to the published ISO table values" value={s.published} onChange={(published) => set({ published })} />
          {diffs.length > 0 && <Note tone="info">For this size the printed ISO table rounds IT{diffs.join(', IT')} differently from the plain formula ({diffs.map((g) => `IT${g}: ${IT(g, s.size, { published: false })} → ${IT(g, s.size, { published: true })} µm`).join('; ')}). Tick the box above to use the printed values.</Note>}
        </Panel>
        <Panel title={`IT grades at Ø${s.size} mm`}>
          <Table head={['Grade', 'µm', 'Grade', 'µm', 'Grade', 'µm']} rows={valid ? [0, 1, 2, 3, 4, 5].map((r) => [0, 6, 12].flatMap((c) => { const g = r + c + 1; return [`IT${g}`, fmtU(IT(g, s.size, o))] })) : []} />
          <p className="muted" style={{ fontSize: 12 }}>IT5–IT11 = 7, 10, 16, 25, 40, 64, 100 × i, with i = 0.45∛D + 0.001D; each further five grades multiply by 10; IT1 = 0.8 + 0.020D with IT2–IT4 geometric between IT1 and IT5.</p>
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Enter a nominal size between 0 and 500 mm.</Note>}
        {valid && (!h || !sh) && <Note tone="err">{!h ? `Hole ${hName}` : `Shaft ${sName}`} is not defined by ISO 286 at this size (e.g. t/T starts above 24 mm, cd/ef/fg only up to 10 mm, j/J has no formula and is omitted).</Note>}
        {h && sh && f && (
          <>
            <Stats>
              <Stat label={`Hole ${hName}`} value={`${sgn(h.upper)} / ${sgn(h.lower)} µm`} sub={`${mm(h.upper)} – ${mm(h.lower)} mm${h.delta ? ` · Δ = ${h.delta} µm` : ''}`} />
              <Stat label={`Shaft ${sName}`} value={`${sgn(sh.upper)} / ${sgn(sh.lower)} µm`} sub={`${mm(sh.upper)} – ${mm(sh.lower)} mm`} />
              <Stat label={f.maxClear >= 0 ? 'Max clearance' : 'Min interference'} value={`${fmtU(Math.abs(f.maxClear))} µm`} />
              <Stat label={f.minClear >= 0 ? 'Min clearance' : 'Max interference'} value={`${fmtU(Math.abs(f.minClear))} µm`} />
              <Stat label="Fit type" value={<span style={{ color: KIND_COLOR[f.kind], textTransform: 'capitalize' }}>{f.kind}</span>} sub={`fit tolerance ${fmtU(h.it + sh.it)} µm · mean ${f.mean >= 0 ? 'clearance' : 'interference'} ${fmtU(Math.abs(f.mean))} µm`} tone="accent" />
            </Stats>
            <Panel title={`Ø${s.size} ${hName}/${sName}`} actions={<CopyButton label="Copy limits" text={() => `Ø${s.size} ${hName}/${sName}\nHole ${hName}: ${mm(h.upper)} / ${mm(h.lower)} mm (${sgn(h.upper)} / ${sgn(h.lower)} µm)\nShaft ${sName}: ${mm(sh.upper)} / ${mm(sh.lower)} mm (${sgn(sh.upper)} / ${sgn(sh.lower)} µm)\nClearance: ${f.minClear} … ${f.maxClear} µm (${f.kind})`} />}>
              <Diagram h={h} s={sh} hName={hName} sName={sName} size={s.size} />
              <p className="muted" style={{ fontSize: 13 }}>
                Hole basis zones sit above the zero line for A–H, shaft zones below it for a–h; letters further along the alphabet push the zone the other way. Clearance where the hole zone is entirely above the shaft zone, interference where it is entirely below.
              </p>
            </Panel>
          </>
        )}
        {valid && (
          <Panel title={`Preferred fits at Ø${s.size} mm`} actions={<CsvButton name={`fits-${s.size}mm.csv`} rows={() => [['fit', 'name', 'hole_upper_um', 'hole_lower_um', 'shaft_upper_um', 'shaft_lower_um', 'max_clearance_um', 'min_clearance_um', 'type'], ...presetRows.map(({ p, hh, ss, ff }) => [p.fit, p.name, hh?.upper ?? '', hh?.lower ?? '', ss?.upper ?? '', ss?.lower ?? '', ff?.maxClear ?? '', ff?.minClear ?? '', ff?.kind ?? ''])]} />}>
            <Table
              head={['Fit', 'Name', 'Hole µm', 'Shaft µm', 'Clearance µm', 'Type']}
              rows={presetRows.map(({ p, hh, ss, ff }) => [
                <button type="button" key="f" className="k-btn ghost" title={p.use} onClick={() => {
                  const [a, b] = p.fit.split('/')
                  set({ hl: a.replace(/\d+/, '').toLowerCase() as Letter, hg: Number(a.replace(/\D+/, '')), sl: b.replace(/\d+/, '') as Letter, sg: Number(b.replace(/\D+/, '')) })
                }}><b>{p.fit}</b></button>,
                <span key="n" title={p.use}>{p.name}</span>,
                hh ? `${sgn(hh.upper)} / ${sgn(hh.lower)}` : '—',
                ss ? `${sgn(ss.upper)} / ${sgn(ss.lower)}` : '—',
                ff ? `${sgn(ff.minClear)} … ${sgn(ff.maxClear)}` : '—',
                ff ? <b key="k" style={{ color: KIND_COLOR[ff.kind] }}>{ff.kind}</b> : '—',
              ])}
            />
          </Panel>
        )}
        <Note>
          Computed from the ISO 286-1 formulas: fundamental deviations per letter (e.g. g: es = −2.5·D^0.34, n: ei = +5·D^0.34, u: ei = IT7 + D), holes A–H mirror the shafts, and K, M, N (≤ IT8) and P–ZC (≤ IT7) use ES = −ei + Δ with Δ = IT<sub>n</sub> − IT<sub>n−1</sub>. Where the standard gives a range (“p = IT7 + 0 to 5”), the tabulated choice is used. The printed tables were hand-rounded in places, so a handful of cells (mostly below 18 mm or for intermediate steps) can differ by 1–2 µm: check critical fits against ISO 286-2.
        </Note>
      </div>
    </Split>
  )
}
