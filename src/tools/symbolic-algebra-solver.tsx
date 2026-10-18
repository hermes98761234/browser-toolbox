import { useMemo } from 'react'
import { Btn, CopyButton, fmt, LineChart, Note, Panel, Row, Seg, Select, Split, Txt, uid, useToolState } from '../kit'
import { parseDisplay, render as texRender, type Measure } from './lib/latex-equation-editor'
import {
  diff, evalN, expand, factor, integrate, numIntegrate, parse, simplify, solve, str, sub, subs, sym, symbols, tex, verifyAntiderivative, type Expr, type Step,
} from './lib/symbolic-algebra-solver'

type Op = 'simplify' | 'expand' | 'factor' | 'diff' | 'integrate' | 'solve'
const OPS: [Op, string][] = [['simplify', 'Simplify'], ['expand', 'Expand'], ['factor', 'Factor'], ['diff', 'd/dx'], ['integrate', '∫ dx'], ['solve', 'Solve']]
const EXAMPLES: Record<Op, string[]> = {
  simplify: ['(x^2 - 1)/(x - 1)', 'sin(x)^2 + cos(x)^2 + 2x/4', 'sqrt(72) + 8^(2/3)', 'ln(e^(3x)) - x'],
  expand: ['(x + 1)^5', '(a + b)^3', '(2x - 3)(x^2 + x + 1)', '(x + 1/2)^2'],
  factor: ['x^3 - 6x^2 + 11x - 6', '2x^2 - 8', 'x^4 + 4', '6x^2y + 9xy^2'],
  diff: ['x^3 sin(x)', 'e^(2x) / (1 + x^2)', 'atan(sqrt(x))', 'x^x', 'ln(cos(x))'],
  integrate: ['x^2 e^x', '(3x + 5)/(x^2 + 2x - 3)', 'sin(x)^3', '2x cos(x^2)', 'x ln(x)', 'e^x sin(x)', '1/(x^4 + 4)', 'e^(x^2)'],
  solve: ['x^2 - 5x + 6 = 0', 'x^3 + x - 1 = 0', 'x^4 - 5x^2 + 4 = 0', 'a x^2 + b x + c = 0', 'e^(2x) = 7', 'cos(x) = x'],
}

interface Hist { id: string; op: Op; input: string; v: string; tex: string }
const DEF = { input: '(3x + 5)/(x^2 + 2x - 3)', op: 'integrate' as Op, v: 'x', order: 1, lo: '', hi: '', history: [] as Hist[] }

let ctx: CanvasRenderingContext2D | null = null
const measure: Measure = (t, px, italic, bold, font) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return t.length * px * 0.55
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${font}`
  return ctx.measureText(t).width
}
function Tex({ src, size = 22 }: { src: string; size?: number }) {
  const svg = useMemo(() => {
    try {
      return texRender(parseDisplay(src), { size, display: true, measure, color: 'currentColor' }).svg
    } catch {
      return ''
    }
  }, [src, size])
  return svg ? <div className="sas-tex" style={{ overflowX: 'auto', maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} /> : <code>{src}</code>
}

interface Out { inTex: string; resTex: string; resStr: string; steps: Step[]; notes: { tone: 'ok' | 'warn' | 'err' | 'info'; text: string }[]; plot: { f?: Expr; g?: Expr; roots?: number[] }; error?: string }

function run(op: Op, input: string, v: string, order: number, lo: string, hi: string): Out {
  const notes: Out['notes'] = []
  const steps: Step[] = []
  const D = `\\frac{d${order > 1 ? `^{${order}}` : ''}}{d${v}${order > 1 ? `^{${order}}` : ''}}`
  try {
    if (op === 'solve') {
      const [l, r = '0'] = input.split('=')
      if (input.split('=').length > 2) throw new Error('Use a single “=”')
      const L = parse(l), R = parse(r)
      const sols = solve(L, R, v, steps)
      const f = sub(L, R)
      const items = sols.map((s) => {
        if (s.im !== undefined) {
          const val = s.exact ? tex(s.value) : `${fmt(s.numeric, 8)} ${s.im >= 0 ? '+' : '-'} ${fmt(Math.abs(s.im), 8)}\\,i`
          return `${v} = ${val}`
        }
        const ex = s.exact ? tex(s.value) : ''
        const approx = fmt(s.numeric, 10)
        return ex && ex !== approx && !/^-?\d+$/.test(ex) ? `${v} = ${ex} \\approx ${approx}` : `${v} ${s.exact ? '=' : '\\approx'} ${ex && s.exact ? ex : approx}`
      })
      if (!sols.length) notes.push({ tone: 'warn', text: 'No solutions found (no real roots in [−50, 50] for non-polynomial equations).' })
      if (sols.some((s) => !s.exact)) notes.push({ tone: 'info', text: 'Values marked ≈ are numeric (closed form not available or impractical).' })
      return { inTex: `${tex(L)} = ${tex(R)}`, resTex: items.join(',\\quad ') || '\\text{no solution}', resStr: sols.map((s) => (s.exact ? str(s.value) : String(s.numeric))).join(', '), steps, notes, plot: { f, roots: sols.filter((s) => s.im === undefined).map((s) => s.numeric) } }
    }
    const e = parse(input)
    if (op === 'simplify' || op === 'expand' || op === 'factor') {
      const r = op === 'simplify' ? simplify(e, v) : op === 'expand' ? expand(e) : factor(e, v)
      if (op === 'factor' && str(r) === str(expand(e))) notes.push({ tone: 'info', text: 'Irreducible over the rationals (or not a polynomial/rational function in ' + v + ').' })
      const val = symbols(r).length === 0 ? evalN(r) : NaN
      return { inTex: tex(e), resTex: tex(r) + (Number.isFinite(val) && !/^-?\d+$/.test(tex(r)) ? ` \\approx ${fmt(val, 10)}` : ''), resStr: str(r), steps, notes, plot: { f: e, g: r } }
    }
    if (op === 'diff') {
      let r = e
      for (let k = 0; k < order; k++) r = diff(r, v, k === 0 ? steps : undefined)
      const s = simplify(r, v)
      return { inTex: `${D}\\left[${tex(e)}\\right]`, resTex: tex(s), resStr: str(s), steps, notes, plot: { f: e, g: s } }
    }
    // integrate
    const { result, steps: st } = integrate(e, v)
    const definite = lo.trim() !== '' && hi.trim() !== ''
    const a = definite ? parse(lo) : null, b = definite ? parse(hi) : null
    const intTex = definite ? `\\int_{${tex(a!)}}^{${tex(b!)}} ${tex(e)}\\,d${v}` : `\\int ${tex(e)}\\,d${v}`
    const numeric = definite ? numIntegrate((t) => evalN(e, { [v]: t }), evalN(a!), evalN(b!), 4000) : NaN
    if (!result) {
      notes.push({ tone: 'warn', text: `Can't integrate this in closed form with the available methods (table, substitution, parts, partial fractions, trig identities). It may have no elementary antiderivative.` })
      return { inTex: intTex, resTex: definite && Number.isFinite(numeric) ? `\\approx ${fmt(numeric, 10)}` : '\\text{no closed form found}', resStr: definite ? String(numeric) : '', steps: st, notes, plot: { f: e } }
    }
    let F = simplify(result, v)
    if (str(F).length > str(result).length) F = result
    const ver = verifyAntiderivative(F, e, v)
    notes.push(ver === 'failed' ? { tone: 'err', text: 'Check failed: the derivative of the result does not match the integrand. Please report this example.' } : { tone: 'ok', text: ver === 'symbolic' ? '✓ Verified: differentiating the result gives back the integrand exactly.' : '✓ Verified numerically: the derivative of the result matches the integrand at sample points.' })
    if (definite) {
      const X = sym(v)
      const exact = simplify(sub(subs(F, X, b!), subs(F, X, a!)))
      const ev = evalN(exact)
      const agree = Number.isFinite(ev) && Number.isFinite(numeric) && Math.abs(ev - numeric) < 1e-6 * (1 + Math.abs(numeric))
      if (!agree) notes.push({ tone: 'warn', text: `The antiderivative gives ${fmt(ev, 8)} but numeric integration gives ${fmt(numeric, 8)}: the integrand is probably singular on the interval (improper integral).` })
      return { inTex: intTex, resTex: `\\left[${tex(F)}\\right]_{${tex(a!)}}^{${tex(b!)}} = ${tex(exact)}${/^-?\d+$/.test(tex(exact)) ? '' : ` \\approx ${fmt(ev, 10)}`}`, resStr: str(exact), steps: st, notes, plot: { f: e, g: F } }
    }
    return { inTex: intTex, resTex: `${tex(F)} + C`, resStr: str(F), steps: st, notes, plot: { f: e, g: F } }
  } catch (err) {
    return { inTex: '', resTex: '', resStr: '', steps, notes, plot: {}, error: (err as Error).message }
  }
}

export default function SymbolicAlgebraSolver() {
  const [s, set, reset] = useToolState('symbolic-algebra-solver', DEF)
  const vars = useMemo(() => {
    try {
      const raw = s.op === 'solve' ? s.input.split('=').map((p) => (p.trim() ? parse(p) : null)).filter(Boolean) : [parse(s.input)]
      return [...new Set(raw.flatMap((r) => symbols(r as Expr)))]
    } catch {
      return []
    }
  }, [s.input, s.op])
  const v = vars.includes(s.v) ? s.v : vars.includes('x') ? 'x' : (vars[0] ?? 'x')
  const out = useMemo(() => run(s.op, s.input, v, s.order, s.lo, s.hi), [s.op, s.input, v, s.order, s.lo, s.hi])
  const full = out.error ? '' : `${out.inTex} ${s.op === 'solve' ? '\\;\\Rightarrow\\;' : '='} ${out.resTex}`

  const plot = useMemo(() => {
    const series: { name: string; points: [number, number][]; color?: string; dashed?: boolean }[] = []
    const env = (t: number) => Object.fromEntries([...vars.map((n) => [n, 1]), [v, t]])
    const sample = (e: Expr | undefined) => {
      if (!e) return null
      const pts: [number, number][] = []
      for (let i = 0; i <= 240; i++) {
        const t = -5 + (10 * i) / 240
        const y = evalN(e, env(t))
        if (Number.isFinite(y) && Math.abs(y) < 1e6) pts.push([t, y])
      }
      return pts.length > 5 ? pts : null
    }
    const f = sample(out.plot.f), g = sample(out.plot.g)
    if (f) series.push({ name: s.op === 'solve' ? 'lhs − rhs' : 'input', points: f })
    if (g && s.op !== 'simplify' && s.op !== 'expand' && s.op !== 'factor') series.push({ name: s.op === 'diff' ? 'derivative' : 'antiderivative (C = 0)', points: g, color: '#f59e0b' })
    return series
  }, [out, s.op, v, vars])
  const yr = plot.flatMap((p) => p.points.map((q) => q[1]))
  const lo = yr.length ? Math.max(Math.min(...yr), -50) : -1, hi = yr.length ? Math.min(Math.max(...yr), 50) : 1

  const record = () => {
    if (out.error || !full) return
    set({ history: [{ id: uid(), op: s.op, input: s.input, v, tex: full }, ...s.history.filter((h) => !(h.input === s.input && h.op === s.op))].slice(0, 30) })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Expression" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.op} onChange={(op) => set({ op, input: op === 'solve' && !s.input.includes('=') ? `${s.input} = 0` : op !== 'solve' && s.input.includes('=') ? s.input.split('=')[0].trim() : s.input })} options={OPS} />
          <div onKeyDown={(e) => e.key === 'Enter' && record()}>
            <Txt label={s.op === 'solve' ? 'Equation (use =)' : 'Expression'} value={s.input} onChange={(input) => set({ input })} placeholder="e.g. x^2 sin(x) + 3/(x+1)" hint="Operators + − * / ^, implicit products (2x, x sin x needs parentheses: x sin(x)), sqrt, exp, ln, log(x, b), sin…atanh, abs, pi, e. Press Enter to record." />
          </div>
          <Row>
            <Select label="Variable" value={v} onChange={(nv) => set({ v: nv })} options={(vars.length ? vars : ['x']).map((n) => [n, n] as const)} />
            {s.op === 'diff' && <Select label="Order" value={s.order} onChange={(order) => set({ order })} options={[[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th']]} />}
            {s.op === 'integrate' && (
              <>
                <Txt label="From (optional)" value={s.lo} onChange={(lo) => set({ lo })} placeholder="0" />
                <Txt label="To" value={s.hi} onChange={(hi) => set({ hi })} placeholder="pi" />
              </>
            )}
          </Row>
          <p className="muted" style={{ margin: '6px 0 4px' }}>Examples:</p>
          <Row>
            {EXAMPLES[s.op].map((x) => (
              <Btn key={x} kind="ghost" onClick={() => set({ input: x })}>{x}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="History" actions={<>{s.history.length > 0 && <CopyButton label="Copy all LaTeX" text={() => `\\begin{aligned}\n${s.history.map((h) => h.tex.replace(/ = /, ' &= ')).join(' \\\\\n')}\n\\end{aligned}`} />}<Btn kind="ghost" onClick={() => set({ history: [] })} disabled={!s.history.length}>Clear</Btn></>}>
          {s.history.length === 0 && <p className="muted">Press Enter or “Record” to keep a result here. Click an entry to bring it back.</p>}
          {s.history.map((h) => (
            <button key={h.id} type="button" onClick={() => set({ op: h.op, input: h.input, v: h.v })} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--line)', padding: '6px 0', cursor: 'pointer', color: 'inherit' }} title="Load this entry">
              <span className="muted" style={{ fontSize: 12 }}>{OPS.find((o) => o[0] === h.op)?.[1]}</span>
              <Tex src={h.tex} size={16} />
            </button>
          ))}
        </Panel>
      </div>
      <div>
        <Panel
          title="Result"
          actions={
            !out.error && (
              <>
                <Btn kind="primary" onClick={record}>⏎ Record</Btn>
                <CopyButton label="LaTeX" text={full} />
                <CopyButton label="Plain" text={out.resStr} />
                {out.resStr && s.op !== 'solve' && <Btn onClick={() => set({ input: out.resStr, lo: '', hi: '' })}>Use as input</Btn>}
              </>
            )
          }
        >
          {out.error ? (
            <Note tone="err">{out.error}</Note>
          ) : (
            <div style={{ fontSize: 0, padding: '10px 4px' }}>
              <Tex src={full} size={24} />
            </div>
          )}
          {out.notes.map((n, i) => <Note key={i} tone={n.tone}>{n.text}</Note>)}
        </Panel>
        {out.steps.length > 0 && (
          <Panel title="Steps">
            <ol style={{ margin: 0, paddingLeft: 22 }}>
              {out.steps.map((st, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span>{st.text}</span>
                  {st.tex && <Tex src={st.tex} size={17} />}
                </li>
              ))}
            </ol>
          </Panel>
        )}
        {plot.length > 0 && (
          <Panel title="Graph">
            <LineChart series={plot} height={240} xMin={-5} xMax={5} yMin={lo} yMax={hi} xLabel={v} markers={(out.plot.roots ?? []).filter((r) => r >= -5 && r <= 5).slice(0, 6).map((r) => ({ x: r, label: fmt(r, 4) }))} />
            {vars.length > 1 && <p className="muted">Other symbols are set to 1 for plotting.</p>}
          </Panel>
        )}
      </div>
    </Split>
  )
}
