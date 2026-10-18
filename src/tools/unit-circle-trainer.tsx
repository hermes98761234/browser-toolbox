import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, Check, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { parseDisplay, render } from './lib/latex-equation-editor'
import { exact, makeQuestion, norm360, quadrant, radTex, radText, refAngle, rng, snap, SPECIAL, type AngleQuestion, type Fn, type Question } from './lib/unit-circle-trainer'

const texCache = new Map<string, string>()
function Tex({ tex, size = 20 }: { tex: string; size?: number }) {
  const key = `${size}|${tex}`
  let svg = texCache.get(key)
  if (svg === undefined) {
    try {
      svg = render(parseDisplay(tex), { size, display: false }).svg
    } catch {
      svg = tex
    }
    texCache.set(key, svg)
  }
  return <span style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** LaTeX → short plain text for the circle labels. */
const plain = (t: string) => t.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*)\}/g, '$1/$2').replace(/\\sqrt\{(\d+)\}/g, '√$1').replace(/-/g, '−')

const FNS: Fn[] = ['sin', 'cos', 'tan', 'csc', 'sec', 'cot']
interface State { deg: number; step: '1' | '15' | 'special'; units: 'deg' | 'rad'; coords: boolean; mode: 'explore' | 'quiz'; dur: number; fns: Fn[]; set15: boolean; showAngle: boolean; best: number }
const DEF: State = { deg: 150, step: 'special', units: 'rad', coords: true, mode: 'explore', dur: 60, fns: ['sin', 'cos', 'tan'], set15: false, showAngle: true, best: 0 }

type Q = Question | AngleQuestion

export default function UnitCircleTrainer() {
  const [s, set] = useToolState('unit-circle-trainer', DEF)
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState(false)
  const [quiz, setQuiz] = useState<{ on: boolean; start: number; q: Q | null; score: number; asked: number; streak: number; pick: string | null; missed: { q: Q; got: string }[] }>({ on: false, start: 0, q: null, score: 0, asked: 0, streak: 0, pick: null, missed: [] })
  const [now, setNow] = useState(0)
  const rand = useMemo(() => rng(Date.now() & 0xffff), [])
  const angles = useMemo(() => (s.set15 ? Array.from({ length: 24 }, (_, i) => i * 15) : SPECIAL), [s.set15])
  const left = quiz.on ? Math.max(0, s.dur - (now - quiz.start) / 1000) : 0

  useEffect(() => {
    if (!quiz.on) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [quiz.on])
  useEffect(() => {
    if (quiz.on && left <= 0 && now > 0) {
      setQuiz((q) => ({ ...q, on: false }))
      if (quiz.score > s.best) set({ best: quiz.score })
    }
  }, [left, quiz.on, quiz.score, now, s.best, set])

  const shownDeg = s.mode === 'quiz' && quiz.q ? (quiz.q.kind === 'value' && s.showAngle ? quiz.q.deg : null) : s.deg
  const deg = shownDeg ?? 0
  const th = (deg * Math.PI) / 180
  const c = Math.cos(th), sn = Math.sin(th), tn = Math.tan(th)
  const isExact = Number.isInteger(s.deg) && s.deg % 15 === 0

  const angleFrom = (e: RPE<SVGSVGElement>) => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2.8 - 1.4, y = -(((e.clientY - r.top) / r.height) * 2.8 - 1.4)
    let a = norm360((Math.atan2(y, x) * 180) / Math.PI)
    if (s.step === '15') a = snap(a, 15)
    else if (s.step === 'special') a = [...SPECIAL, 360].reduce((b, v) => (Math.abs(v - a) < Math.abs(b - a) ? v : b), 0) % 360
    else a = Math.round(a)
    set({ deg: a })
  }

  const next = () => setQuiz((q) => ({ ...q, q: makeQuestion(rand, s.fns.length ? s.fns : ['sin'], angles, s.units === 'rad'), pick: null }))
  const start = () => {
    setNow(Date.now())
    setQuiz({ on: true, start: Date.now(), q: makeQuestion(rand, s.fns.length ? s.fns : ['sin'], angles, s.units === 'rad'), score: 0, asked: 0, streak: 0, pick: null, missed: [] })
  }
  const answer = (o: string) => {
    if (!quiz.q || quiz.pick || !quiz.on) return
    const ok = o === quiz.q.answer
    setQuiz((q) => ({ ...q, pick: o, asked: q.asked + 1, score: q.score + (ok ? 1 : 0), streak: ok ? q.streak + 1 : 0, missed: ok ? q.missed : [...q.missed, { q: q.q!, got: o }] }))
    setTimeout(next, ok ? 450 : 1300)
  }
  const angleTex = (d: number) => (s.units === 'rad' ? radTex(d) : `${d}^\\circ`)

  const P = (x: number, y: number) => `${x.toFixed(4)},${(-y).toFixed(4)}`
  const big = Math.abs(tn) < 2.6

  return (
    <Split>
      <div>
        <Panel title="Unit circle" actions={<Seg value={s.units} onChange={(units) => set({ units })} options={[['deg', 'Degrees'], ['rad', 'Radians']]} />}>
          <svg ref={svgRef} viewBox="-1.4 -1.4 2.8 2.8" style={{ width: '100%', maxWidth: 520, display: 'block', margin: '0 auto', touchAction: 'none', cursor: s.mode === 'explore' ? 'pointer' : 'default' }}
            onPointerDown={(e) => { if (s.mode !== 'explore') return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); angleFrom(e) }}
            onPointerMove={(e) => drag && angleFrom(e)} onPointerUp={() => setDrag(false)}>
            <line x1={-1.3} x2={1.3} y1={0} y2={0} stroke="var(--muted)" strokeWidth={0.006} />
            <line y1={-1.3} y2={1.3} x1={0} x2={0} stroke="var(--muted)" strokeWidth={0.006} />
            <circle r={1} fill="none" stroke="var(--fg)" strokeWidth={0.01} />
            {SPECIAL.map((a) => {
              const t = (a * Math.PI) / 180, lx = Math.cos(t), ly = Math.sin(t)
              const e = (fn: Fn) => plain(exact(fn, a)!.tex)
              return (
                <g key={a} style={{ fontSize: 0.065 }}>
                  <circle cx={lx} cy={-ly} r={0.018} fill="var(--muted)" />
                  <text x={lx * 0.86} y={-ly * 0.86 + 0.022} textAnchor="middle" fill="var(--muted)">{s.units === 'rad' ? radText(a) : `${a}°`}</text>
                  {s.coords && a % 90 !== 0 && (
                    <text x={lx * 1.2} y={-ly * 1.13 + 0.02} textAnchor="middle" fill="var(--fg)" style={{ fontSize: 0.055 }}>({e('cos')}, {e('sin')})</text>
                  )}
                </g>
              )
            })}
            {shownDeg !== null && (
              <g>
                <path d={`M0.18,0 A0.18,0.18 0 ${norm360(deg) > 180 ? 1 : 0} 0 ${P(0.18 * c, 0.18 * sn)}`} fill="none" stroke="var(--accent)" strokeWidth={0.012} />
                {big && <line x1={1} y1={0} x2={1} y2={-tn} stroke="#10b981" strokeWidth={0.014} />}
                {big && <line x1={0} y1={0} x2={1} y2={-tn} stroke="#10b981" strokeWidth={0.006} strokeDasharray="0.03 0.02" />}
                <line x1={0} y1={0} x2={c} y2={0} stroke="#0ea5e9" strokeWidth={0.022} />
                <line x1={c} y1={0} x2={c} y2={-sn} stroke="#ef4444" strokeWidth={0.022} />
                <line x1={0} y1={0} x2={c} y2={-sn} stroke="var(--accent)" strokeWidth={0.014} />
                <circle cx={c} cy={-sn} r={0.045} fill="var(--accent)" stroke="#fff" strokeWidth={0.012} />
                <text x={c / 2} y={sn >= 0 ? 0.08 : -0.04} textAnchor="middle" fill="#0ea5e9" style={{ fontSize: 0.07, fontWeight: 700 }}>cos</text>
                <text x={c + (c >= 0 ? 0.04 : -0.04)} y={-sn / 2} textAnchor={c >= 0 ? 'start' : 'end'} fill="#ef4444" style={{ fontSize: 0.07, fontWeight: 700 }}>sin</text>
              </g>
            )}
          </svg>
          <Row>
            <Check label="Show coordinates" value={s.coords} onChange={(coords) => set({ coords })} />
            {s.mode === 'explore' && <Seg value={s.step} onChange={(step) => set({ step })} options={[['special', 'Snap: special'], ['15', '15°'], ['1', 'Free (1°)']]} />}
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>
            <b style={{ color: '#0ea5e9' }}>cos θ</b> is the x-coordinate, <b style={{ color: '#ef4444' }}>sin θ</b> the y-coordinate, and <b style={{ color: '#10b981' }}>tan θ</b> the height where the ray meets the line x = 1.
            Signs by quadrant: All · Sine · Tangent · Cosine are positive (I → IV).
          </p>
        </Panel>
      </div>
      <div>
        <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['explore', 'Explore'], ['quiz', 'Timed quiz']]} />
        {s.mode === 'explore' ? (
          <>
            <Stats>
              <Stat label="Angle θ" value={<>{s.deg}°</>} sub={isExact ? <Tex tex={radTex(s.deg)} size={24} /> : `${num((s.deg * Math.PI) / 180, 4)} rad`} tone="accent" />
              <Stat label="Quadrant" value={quadrant(s.deg) || 'on an axis'} />
              <Stat label="Reference angle" value={`${refAngle(s.deg)}°`} />
            </Stats>
            <Panel title="Values" actions={<Row><Btn onClick={() => set({ deg: norm360(s.deg - 15) })}>−15°</Btn><Btn onClick={() => set({ deg: norm360(s.deg + 15) })}>+15°</Btn></Row>}>
              <Num label="Angle (degrees)" value={s.deg} onChange={(d) => set({ deg: norm360(d) })} unit="°" />
              <Table
                head={['Function', 'Exact', 'Decimal']}
                rows={FNS.map((fn) => {
                  const e = isExact ? exact(fn, s.deg) : null
                  const v = { sin: sn, cos: c, tan: tn, csc: 1 / sn, sec: 1 / c, cot: c / sn }[fn]
                  const und = e ? Number.isNaN(e.value) : Math.abs(v) > 1e9
                  return [<Tex key="f" tex={`\\${fn}\\,\\theta`} size={18} />, e ? <Tex key="e" tex={e.tex} size={24} /> : <span className="muted">—</span>, und ? 'undefined' : num(e ? e.value : v, 5)]
                })}
              />
              {!isExact && <Note>Snap to a multiple of 15° to see exact values.</Note>}
            </Panel>
            <Panel title="Sine and cosine waves">
              <LineChart height={200} xMin={0} xMax={360} yMin={-1.1} yMax={1.1} fx={(v) => `${v}°`} fy={(v) => num(v, 1)} markers={[{ x: norm360(s.deg), label: 'θ' }]}
                series={[
                  { name: 'sin θ', color: '#ef4444', points: Array.from({ length: 73 }, (_, i) => [i * 5, Math.sin((i * 5 * Math.PI) / 180)] as [number, number]) },
                  { name: 'cos θ', color: '#0ea5e9', points: Array.from({ length: 73 }, (_, i) => [i * 5, Math.cos((i * 5 * Math.PI) / 180)] as [number, number]) },
                ]} />
            </Panel>
          </>
        ) : (
          <>
            <Stats>
              <Stat label="Time left" value={quiz.on ? `${left.toFixed(1)} s` : `${s.dur} s`} tone={quiz.on && left < 10 ? 'bad' : 'accent'} />
              <Stat label="Score" value={`${quiz.score} / ${quiz.asked}`} sub={quiz.asked ? `${Math.round((100 * quiz.score) / quiz.asked)}% correct` : ' '} />
              <Stat label="Streak" value={quiz.streak} sub={`best score ${s.best}`} tone={quiz.streak >= 5 ? 'good' : undefined} />
            </Stats>
            {quiz.on && <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, margin: '6px 0' }}><div style={{ width: `${(left / s.dur) * 100}%`, height: 6, borderRadius: 3, background: 'var(--accent)' }} /></div>}
            <Panel title={quiz.on ? 'Question' : 'Quiz settings'}>
              {quiz.on && quiz.q ? (
                <>
                  <div style={{ fontSize: 18, textAlign: 'center', padding: '10px 0 16px' }}>
                    {quiz.q.kind === 'value' ? (
                      <Tex tex={`\\${quiz.q.fn}\\left(${angleTex(quiz.q.deg)}\\right) = \\;?`} size={30} />
                    ) : (
                      <span>Which angle in [0, 2π) has point <Tex tex={`\\left(${quiz.q.x},\\ ${quiz.q.y}\\right)`} size={26} /> ?</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    {quiz.q.options.map((o) => {
                      const st = quiz.pick ? (o === quiz.q!.answer ? 'var(--ok)' : o === quiz.pick ? 'var(--err)' : undefined) : undefined
                      return (
                        <button key={o} type="button" className="k-btn" onClick={() => answer(o)} style={{ minHeight: 64, justifyContent: 'center', borderColor: st, borderWidth: st ? 3 : undefined, color: 'var(--fg)' }}>
                          <Tex tex={o} size={22} />
                        </button>
                      )
                    })}
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>Tip: find the reference angle, read the value from quadrant I, then fix the sign with ASTC.</p>
                </>
              ) : (
                <>
                  <Row>
                    {FNS.map((fn) => (
                      <Check key={fn} label={fn} value={s.fns.includes(fn)} onChange={(on) => set({ fns: on ? [...s.fns, fn] : s.fns.filter((x) => x !== fn) })} />
                    ))}
                  </Row>
                  <Seg value={String(s.dur)} onChange={(v) => set({ dur: Number(v) })} options={[['30', '30 s'], ['60', '60 s'], ['120', '2 min']]} />
                  <Check label="Include 15° multiples (15°, 75°, …)" value={s.set15} onChange={(set15) => set({ set15 })} />
                  <Check label="Show the angle on the circle as a hint" value={s.showAngle} onChange={(showAngle) => set({ showAngle })} />
                  <Btn kind="primary" onClick={start} disabled={!s.fns.length}>▶ Start {s.dur}-second quiz</Btn>
                  {quiz.asked > 0 && <Note tone={quiz.score / quiz.asked >= 0.8 ? 'ok' : 'warn'}>Time! You scored {quiz.score} of {quiz.asked} ({Math.round((100 * quiz.score) / quiz.asked)}%).{quiz.score >= s.best && quiz.score > 0 ? ' New best!' : ''}</Note>}
                </>
              )}
            </Panel>
            {quiz.missed.length > 0 && (
              <Panel title="Review your misses">
                <Table head={['Question', 'Correct', 'You chose']} rows={quiz.missed.slice(-8).map((m, i) => [
                  m.q.kind === 'value' ? <Tex key={i} tex={`\\${m.q.fn}\\left(${angleTex(m.q.deg)}\\right)`} size={18} /> : <Tex key={i} tex={`\\left(${m.q.x},${m.q.y}\\right)`} size={16} />,
                  <Tex key="a" tex={m.q.answer} size={18} />, <Tex key="g" tex={m.got} size={18} />,
                ])} />
              </Panel>
            )}
          </>
        )}
      </div>
    </Split>
  )
}
