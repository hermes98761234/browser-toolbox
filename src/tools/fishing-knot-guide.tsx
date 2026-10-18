import { useEffect, useState } from 'react'
import { Btn, Check, download, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { filterKnots, KNOTS, knotStrength, USES, type El, type Knot, type LineType, type Step, type Use } from './lib/fishing-knot-guide'

interface State { knot: string; use: Use | 'all'; line: LineType | 'any'; q: string; speed: number; test: number; unit: 'lb' | 'kg'; learned: string[] }
const DEF: State = { knot: 'clinch', use: 'all', line: 'any', q: '', speed: 2.5, test: 12, unit: 'lb', learned: [] }

const COL: Record<El['r'], string> = { S: '#2563eb', T: '#f97316', G: '#16a34a', A: '#64748b' }
const PAPER = '#f8fafc'
const HOOK = 'M61,80 H28 C8,80 8,120 32,120 C46,120 52,108 48,96 L55,103'
const LINE_NAMES: Record<LineType, string> = { mono: 'Mono', fluoro: 'Fluoro', braid: 'Braid' }
const RATE = ['✕ avoid', '✓ ok', '★ good']

function Base({ k }: { k: Knot }) {
  if (k.base === 'hook') return <g fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round"><path d={HOOK} /><circle cx={70} cy={80} r={9} /></g>
  if (k.base === 'spool') return <g><circle cx={70} cy={80} r={22} fill="#cbd5e1" stroke="#64748b" strokeWidth={2} /><circle cx={70} cy={80} r={6} fill={PAPER} stroke="#64748b" /></g>
  return null
}

function Diagram({ k, step, animate = true, small }: { k: Knot; step: Step; animate?: boolean; small?: boolean }) {
  const w = small ? 4 : 3.2
  return (
    <svg viewBox="0 0 320 170" style={{ width: '100%', display: 'block', background: PAPER, borderRadius: 10 }} role="img" aria-label={step.text}>
      <defs>
        <marker id="kg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b" /></marker>
      </defs>
      <Base k={k} />
      {step.els.map((e, i) => {
        const cls = animate && e.anim ? 'kg-draw' : undefined
        const common = { d: e.d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, className: cls }
        if (e.r === 'A') return <path key={i} {...common} stroke={COL.A} strokeWidth={1.8} strokeDasharray={cls ? undefined : '0.03 0.02'} markerEnd="url(#kg-arrow)" />
        return (
          <g key={i}>
            <path {...common} stroke={COL[e.r]} strokeWidth={e.dbl ? w * 2.8 : w} />
            {e.dbl && <path {...common} stroke={PAPER} strokeWidth={w * 0.9} />}
          </g>
        )
      })}
      {step.labels?.map(([x, y, t]) => <text key={t} x={x} y={y} fontSize={13} fontWeight={700} fill="#334155" textAnchor="middle">{t}</text>)}
    </svg>
  )
}

/** Static SVG markup for the offline cheat-sheet export. */
function svgString(k: Knot, st: Step): string {
  const base = k.base === 'hook' ? `<g fill="none" stroke="#64748b" stroke-width="3.5" stroke-linecap="round"><path d="${HOOK}"/><circle cx="70" cy="80" r="9"/></g>` : k.base === 'spool' ? '<circle cx="70" cy="80" r="22" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>' : ''
  const els = st.els.map((e) => e.r === 'A'
    ? `<path d="${e.d}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-dasharray="5 4"/>`
    : `<path d="${e.d}" fill="none" stroke="${COL[e.r]}" stroke-width="${e.dbl ? 9 : 3.2}" stroke-linecap="round" stroke-linejoin="round"/>${e.dbl ? `<path d="${e.d}" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>` : ''}`).join('')
  const labels = (st.labels ?? []).map(([x, y, t]) => `<text x="${x}" y="${y}" font-size="13" font-weight="700" fill="#334155" text-anchor="middle">${t}</text>`).join('')
  return `<svg viewBox="0 0 320 170" width="240" style="background:${PAPER};border-radius:8px">${base}${els}${labels}</svg>`
}

function exportSheet() {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const body = KNOTS.map((k) => `<section><h2>${esc(k.name)}</h2><p>${esc(k.about)}</p><p><b>Approx. strength:</b> ${k.strength[1] ? `${k.strength[0]}–${k.strength[1]} % of line rating (approximate)` : 'not load-bearing'}</p><ol>${k.steps.map((st) => `<li>${svgString(k, st)}<span>${esc(st.text)}</span></li>`).join('')}</ol></section>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fishing knots — offline sheet</title><style>body{font:15px/1.45 system-ui,sans-serif;max-width:900px;margin:auto;padding:16px;color:#0f172a}section{page-break-inside:avoid;border-top:1px solid #cbd5e1;padding-top:8px}ol{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding-left:18px}li span{display:block;font-size:13px}</style></head><body><h1>Fishing knots</h1><p>Schematic diagrams. Strength figures are approximate ranges; real results depend on line, tying and conditions. Blue = standing line, orange = tag end, green = second line.</p>${body}</body></html>`
  download('fishing-knots-offline.html', html, 'text/html')
}

export default function FishingKnotGuide() {
  const [s, set] = useToolState<State>('fishing-knot-guide', DEF)
  const list = filterKnots(s.use, s.line, s.q)
  const k = KNOTS.find((x) => x.id === s.knot) ?? KNOTS[0]
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [prevK, setPrevK] = useState(k.id)
  if (prevK !== k.id) {
    setPrevK(k.id)
    setStep(0)
  }
  const st = k.steps[Math.min(step, k.steps.length - 1)]

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setStep((i) => (i + 1) % k.steps.length), s.speed * 1000)
    return () => clearInterval(id)
  }, [playing, k.steps.length, s.speed])

  const [lo, hi] = knotStrength(s.test, k)
  const learned = s.learned.includes(k.id)

  return (
    <Split wide="right">
      <style>{'.kg-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:kg-draw 1.1s ease-out forwards}@keyframes kg-draw{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.kg-draw{animation:none;stroke-dashoffset:0}}'}</style>
      <div>
        <Panel title="Find a knot">
          <Seg value={s.use} onChange={(use) => set({ use })} options={USES} />
          <Row>
            <Select label="Line type" value={s.line} onChange={(line) => set({ line })} options={[['any', 'Any line'], ['mono', 'Monofilament'], ['fluoro', 'Fluorocarbon'], ['braid', 'Braid']]} />
            <Txt label="Search" value={s.q} onChange={(q) => set({ q })} placeholder="leader, lure…" />
          </Row>
          <div style={{ display: 'grid', gap: 8 }}>
            {list.map((x) => (
              <button key={x.id} type="button" onClick={() => set({ knot: x.id })} className="k-btn" style={{ textAlign: 'left', display: 'block', padding: '10px 12px', borderColor: x.id === k.id ? 'var(--accent)' : undefined, boxShadow: x.id === k.id ? '0 0 0 2px var(--accent)' : undefined }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{s.learned.includes(x.id) ? '✅ ' : ''}{x.name}</b>
                  <span title="difficulty" style={{ letterSpacing: 2, color: 'var(--accent)' }}>{'●'.repeat(x.difficulty)}<span style={{ opacity: 0.2 }}>{'●'.repeat(3 - x.difficulty)}</span></span>
                </Row>
                <span className="muted" style={{ fontSize: 12 }}>
                  {USES.find((u) => u[0] === x.use)![1]} · {x.strength[1] ? `≈ ${x.strength[0]}–${x.strength[1]} %` : 'not load-bearing'} · {(Object.keys(x.lines) as LineType[]).filter((l) => x.lines[l] === 2).map((l) => LINE_NAMES[l]).join(', ')}
                </span>
              </button>
            ))}
            {!list.length && <Note tone="warn">No knot matches these filters.</Note>}
          </div>
        </Panel>
        <Panel title="Knot strength (approximate)">
          <Row>
            <Num label="Line rating" value={s.test} onChange={(test) => set({ test })} min={0} unit={s.unit} />
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['lb', 'lb'], ['kg', 'kg']]} />
          </Row>
          <RangeChart test={s.test} unit={s.unit} active={k.id} />
          <p className="muted" style={{ fontSize: 12 }}>Approximate ranges of knot strength as a share of the unknotted line’s rating, compiled from typical published pull tests. Real results vary a lot with line brand, diameter, tying care and wet/dry testing — test your own knots.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Approx. knot strength" value={k.strength[1] ? `${k.strength[0]}–${k.strength[1]} %` : 'n/a'} sub={k.strength[1] ? `≈ ${num(lo, 1)}–${num(hi, 1)} ${s.unit} on ${s.test} ${s.unit} line` : 'only holds line on the spool'} tone="accent" />
          <Stat label="Difficulty" value={['', 'Easy', 'Medium', 'Fiddly'][k.difficulty]} sub={`${k.steps.length} steps`} />
          <Stat label="Lines" value={(Object.keys(k.lines) as LineType[]).map((l) => `${LINE_NAMES[l]} ${RATE[k.lines[l]].slice(0, 1)}`).join(' ')} sub="★ good · ✓ ok · ✕ avoid" />
        </Stats>
        <Panel title={k.name} actions={<Btn onClick={exportSheet} title="Self-contained HTML with every knot — save it to your phone for use without signal">⬇ Offline sheet</Btn>}>
          <p style={{ marginTop: 0 }}>{k.about}</p>
          <div key={`${k.id}-${step}`} style={{ maxWidth: 640 }}>
            <Diagram k={k} step={st} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '10px 0' }}>
            <b style={{ background: 'var(--accent)', color: '#fff', borderRadius: 99, minWidth: 28, height: 28, display: 'inline-grid', placeItems: 'center' }}>{step + 1}</b>
            <span style={{ fontSize: 17 }}>{st.text}</span>
          </div>
          <Row>
            <Btn onClick={() => { setPlaying(false); setStep((step - 1 + k.steps.length) % k.steps.length) }}>◀ Back</Btn>
            <Btn kind="primary" onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Play steps'}</Btn>
            <Btn onClick={() => { setPlaying(false); setStep((step + 1) % k.steps.length) }}>Next ▶</Btn>
            <Select label="" value={s.speed} onChange={(speed) => set({ speed })} options={[[1.5, 'Fast'], [2.5, 'Normal'], [4, 'Slow']]} />
            <Check label="I can tie this" value={learned} onChange={(v) => set({ learned: v ? [...s.learned, k.id] : s.learned.filter((x) => x !== k.id) })} />
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
            {k.steps.map((x, i) => (
              <button key={i} type="button" onClick={() => { setPlaying(false); setStep(i) }} style={{ padding: 3, border: `2px solid ${i === step ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, background: 'none', cursor: 'pointer' }} aria-label={`Step ${i + 1}`}>
                <Diagram k={k} step={x} animate={false} small />
                <span style={{ fontSize: 11 }}>Step {i + 1}</span>
              </button>
            ))}
          </div>
          <Row>
            {(['S', 'T', 'G'] as const).map((r) => <span key={r} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 18, height: 4, background: COL[r], display: 'inline-block', borderRadius: 2 }} />{{ S: 'Standing line', T: 'Tag end', G: 'Second line' }[r]}</span>)}
          </Row>
        </Panel>
        <Panel title="Tips">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{k.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          <Note>Diagrams are schematic — real coils sit tight together. Always wet knots before tightening and test with a firm pull before casting. {s.learned.length}/{KNOTS.length} knots marked as learned.</Note>
        </Panel>
      </div>
    </Split>
  )
}

function RangeChart({ test, unit, active }: { test: number; unit: string; active: string }) {
  const ks = KNOTS.filter((k) => k.strength[1] > 0)
  const x = (p: number) => 110 + ((p - 50) / 50) * 190
  return (
    <svg viewBox={`0 0 310 ${ks.length * 22 + 26}`} style={{ width: '100%' }} role="img" aria-label="Approximate knot strength ranges">
      {[50, 60, 70, 80, 90, 100].map((p) => <g key={p}><line x1={x(p)} x2={x(p)} y1={0} y2={ks.length * 22} stroke="var(--line)" /><text x={x(p)} y={ks.length * 22 + 14} fontSize={10} textAnchor="middle" fill="currentColor">{p}%</text></g>)}
      {ks.map((k, i) => (
        <g key={k.id}>
          <text x={0} y={i * 22 + 15} fontSize={10.5} fill="currentColor" fontWeight={k.id === active ? 700 : 400}>{k.name.replace(' knot', '').replace(' (barrel)', '')}</text>
          <rect x={x(k.strength[0])} y={i * 22 + 5} width={x(k.strength[1]) - x(k.strength[0])} height={13} rx={6} fill={k.id === active ? 'var(--accent)' : '#94a3b8'} opacity={0.85}>
            <title>{`${k.name}: ≈ ${k.strength[0]}–${k.strength[1]} % → ${num((test * k.strength[0]) / 100, 1)}–${num((test * k.strength[1]) / 100, 1)} ${unit}`}</title>
          </rect>
        </g>
      ))}
    </svg>
  )
}
