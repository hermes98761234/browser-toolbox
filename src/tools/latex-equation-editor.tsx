import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Btn, Check, CopyButton, download, Note, Panel, Row, Seg, Select, Slider, Split, useToolState } from '../kit'
import { COMMANDS, DEFAULT_FONT, lineCol, parseDisplay, render, SYMBOL_OF, TexError, toMathML, type Measure, type Node } from './lib/latex-equation-editor'

const EXAMPLES: [string, string][] = [
  ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
  ['Gaussian integral', '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}'],
  ['Maxwell (aligned)', '\\begin{aligned}\n  \\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n  \\nabla \\cdot \\vec{B} &= 0 \\\\\n  \\nabla \\times \\vec{E} &= -\\frac{\\partial \\vec{B}}{\\partial t} \\\\\n  \\nabla \\times \\vec{B} &= \\mu_0 \\vec{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}\n\\end{aligned}'],
  ['Matrix determinant', '\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc'],
  ['Piecewise (cases)', '|x| = \\begin{cases}\n  x & \\text{if } x \\geq 0 \\\\\n  -x & \\text{if } x < 0\n\\end{cases}'],
  ['Taylor series', 'e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!} = 1 + x + \\frac{x^2}{2!} + \\cdots'],
  ['Bayes\' theorem', 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}'],
  ['Fourier transform', '\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi}\\,dx'],
  ['Limit definition', 'f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}'],
  ['Binomial theorem', '(x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^{k}'],
  ['Euler\'s identity', '\\boxed{e^{i\\pi} + 1 = 0}'],
  ['Continued fraction', '\\phi = 1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cdots}}}'],
  ['Norm & sets', '\\left\\| \\mathbf{v} \\right\\| = \\sqrt{\\sum_{i=1}^{n} v_i^2}, \\quad \\mathbf{v} \\in \\mathbb{R}^n'],
]

const PALETTE: Record<string, [string, string][]> = {
  Structures: [
    ['\\frac{a}{b}', '\\frac{$}{}'], ['x^{n}', '^{$}'], ['x_{i}', '_{$}'], ['\\sqrt{x}', '\\sqrt{$}'], ['\\sqrt[n]{x}', '\\sqrt[$]{}'],
    ['\\sum_{i=1}^{n}', '\\sum_{$}^{}'], ['\\prod_{i}', '\\prod_{$}^{}'], ['\\int_{a}^{b}', '\\int_{$}^{}'], ['\\oint', '\\oint'], ['\\lim_{x \\to 0}', '\\lim_{$ \\to }'],
    ['\\left( x \\right)', '\\left( $ \\right)'], ['\\left[ x \\right]', '\\left[ $ \\right]'], ['\\left\\{ x \\right\\}', '\\left\\{ $ \\right\\}'], ['\\left| x \\right|', '\\left| $ \\right|'],
    ['\\binom{n}{k}', '\\binom{$}{}'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\begin{pmatrix}\n  $ & \\\\\n  & \n\\end{pmatrix}'],
    ['\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}', '\\begin{bmatrix}\n  $ & \\\\\n  & \n\\end{bmatrix}'],
    ['\\begin{cases} a & x \\\\ b & y \\end{cases}', '\\begin{cases}\n  $ & \\text{if } \\\\\n  & \\text{otherwise}\n\\end{cases}'],
    ['\\boxed{x}', '\\boxed{$}'], ['\\text{abc}', '\\text{$}'],
  ],
  Accents: [['\\hat{a}', '\\hat{$}'], ['\\bar{a}', '\\bar{$}'], ['\\vec{a}', '\\vec{$}'], ['\\dot{a}', '\\dot{$}'], ['\\ddot{a}', '\\ddot{$}'], ['\\tilde{a}', '\\tilde{$}'], ['\\overline{ab}', '\\overline{$}'], ['\\underline{ab}', '\\underline{$}'], ['\\widehat{abc}', '\\widehat{$}'], ['\\overrightarrow{AB}', '\\overrightarrow{$}'], ['\\underbrace{abc}_{n}', '\\underbrace{$}_{}'], ['\\mathbb{R}', '\\mathbb{$}'], ['\\mathcal{L}', '\\mathcal{$}'], ['\\mathbf{v}', '\\mathbf{$}']],
  Greek: 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' ').map((g) => [`\\${g}`, `\\${g}`]),
  Operators: 'pm mp times div cdot ast circ bullet cap cup wedge vee oplus otimes setminus nabla partial infty sum prod int iint oint bigcup bigcap'.split(' ').map((g) => [`\\${g}`, `\\${g}`]),
  Relations: 'leq geq neq approx equiv sim simeq cong propto ll gg in notin subset supset subseteq supseteq perp parallel mid models'.split(' ').map((g) => [`\\${g}`, `\\${g}`]),
  Arrows: 'to leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff mapsto uparrow downarrow longrightarrow hookrightarrow rightleftharpoons'.split(' ').map((g) => [`\\${g}`, `\\${g}`]),
  Misc: 'forall exists nexists emptyset neg angle triangle hbar ell Re Im aleph ldots cdots vdots ddots prime degree langle rangle lfloor rfloor lceil rceil'.split(' ').map((g) => [`\\${g}`, `\\${g}`]),
}

const DEF = { src: EXAMPLES[2][1], size: 30, display: true, color: '', bg: 'transparent' as 'transparent' | 'white', scale: 3, tab: 'Structures' }

let ctx: CanvasRenderingContext2D | null = null
const measure: Measure = (t, px, italic, bold, font) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return t.length * px * 0.55
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${font}`
  return ctx.measureText(t).width
}

function highlight(src: string, err: TexError | null) {
  const out: React.ReactNode[] = []
  const re = /(%[^\n]*)|(\\[a-zA-Z]+|\\.)|([{}])|([\^_&])|([0-9]+)/g
  let last = 0, k = 0
  const push = (s: string, cls?: string, from = 0) => {
    if (!s) return
    // split around the error range so it can be underlined
    if (err && from < err.pos + err.len && from + s.length > err.pos) {
      const a = Math.max(0, err.pos - from), b = Math.min(s.length, err.pos + err.len - from)
      if (a) out.push(<span key={k++} className={cls}>{s.slice(0, a)}</span>)
      out.push(<span key={k++} className={`${cls ?? ''} tx-err`}>{s.slice(a, b)}</span>)
      if (b < s.length) out.push(<span key={k++} className={cls}>{s.slice(b)}</span>)
      return
    }
    out.push(cls ? <span key={k++} className={cls}>{s}</span> : s)
  }
  for (let m; (m = re.exec(src)); ) {
    push(src.slice(last, m.index), undefined, last)
    push(m[0], m[1] ? 'tx-c' : m[2] ? 'tx-k' : m[3] ? 'tx-b' : m[4] ? 'tx-o' : 'tx-n', m.index)
    last = m.index + m[0].length
  }
  push(src.slice(last), undefined, last)
  if (err && err.pos >= src.length) out.push(<span key={k++} className="tx-err"> </span>)
  return out
}

const CSS = `
.tx-wrap{position:relative;font-family:var(--mono);font-size:14px;line-height:1.55}
.tx-wrap pre,.tx-wrap textarea{margin:0;padding:10px 12px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;font:inherit;border-radius:8px;min-height:180px;box-sizing:border-box;width:100%;tab-size:2}
.tx-wrap pre{position:absolute;inset:0;pointer-events:none;color:var(--fg);border:1px solid transparent;overflow:hidden}
.tx-wrap textarea{position:relative;background:transparent;color:transparent;caret-color:var(--fg);border:1px solid var(--line);resize:vertical;display:block}
.tx-wrap textarea:focus{outline:2px solid var(--accent);outline-offset:-1px}
.tx-k{color:#7c3aed}.tx-b{color:#0ea5e9;font-weight:700}.tx-o{color:#ea580c;font-weight:700}.tx-n{color:#059669}.tx-c{color:var(--muted);font-style:italic}
@media (prefers-color-scheme: dark){.tx-k{color:#c4b5fd}.tx-n{color:#6ee7b7}}
.tx-err{text-decoration:underline wavy #ef4444;background:rgba(239,68,68,.18)}
.tx-sug{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.tx-sug button{font:12px var(--mono);border:1px solid var(--line);background:var(--panel2);color:var(--fg);border-radius:6px;padding:3px 7px;cursor:pointer}
.tx-sug button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.tx-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:4px;margin-top:8px}
.tx-pal button{border:1px solid var(--line);background:var(--panel2);color:var(--fg);border-radius:6px;min-height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:2px}
.tx-pal button:hover{border-color:var(--accent)}
.tx-pal button svg{max-width:100%;height:auto;max-height:40px}
.tx-prev{display:flex;align-items:center;justify-content:center;min-height:220px;overflow:auto;border-radius:10px;padding:18px}
.tx-prev svg{max-width:100%;height:auto}
`

export default function LatexEquationEditor() {
  const [s, set, reset] = useToolState('latex-equation-editor', DEF)
  const ta = useRef<HTMLTextAreaElement>(null)
  const pre = useRef<HTMLPreElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [showMl, setShowMl] = useState(false)

  const parsed = useMemo((): { node: Node | null; err: TexError | null } => {
    try {
      return { node: parseDisplay(s.src), err: null }
    } catch (e) {
      return { node: null, err: e instanceof TexError ? e : new TexError(String(e), 0) }
    }
  }, [s.src])
  const [good, setGood] = useState<Node | null>(null)
  if (parsed.node && parsed.node !== good) setGood(parsed.node)
  const node = parsed.node ?? good
  const out = useMemo(() => (node ? render(node, { size: s.size, display: s.display, color: s.color || undefined, measure }) : null), [node, s.size, s.display, s.color])
  const mathml = useMemo(() => (node ? toMathML(node, s.display) : ''), [node, s.display])

  const palette = useMemo(
    () => Object.fromEntries(Object.entries(PALETTE).map(([k, items]) => [k, items.map(([tex, snip]) => {
      try {
        return { tex, snip, svg: render(parseDisplay(tex), { size: 15, display: false, measure }).svg }
      } catch {
        return { tex, snip, svg: '' }
      }
    })])),
    [],
  )

  // ----- autocomplete -----
  const prefix = /\\([a-zA-Z]*)$/.exec(s.src.slice(0, caret))?.[1]
  const sugg = useMemo(() => {
    if (prefix === undefined) return []
    const seen = new Set<string>()
    return COMMANDS.filter(([name]) => name.startsWith(prefix) && name !== prefix && !seen.has(name) && seen.add(name))
      .sort((a, b) => a[0].length - b[0].length)
      .slice(0, 10)
  }, [prefix])

  const insert = (snip: string, replaceBefore = 0) => {
    const el = ta.current
    const a = el ? el.selectionStart - replaceBefore : s.src.length
    const b = el ? el.selectionEnd : s.src.length
    const sel = s.src.slice(a + replaceBefore, b)
    const idx = snip.indexOf('$')
    const body = idx >= 0 ? snip.slice(0, idx) + sel + snip.slice(idx + 1) : snip + sel
    const next = s.src.slice(0, a) + body + s.src.slice(b)
    const pos = a + (idx >= 0 ? idx + sel.length : body.length)
    set({ src: next })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }
  const accept = (i: number) => {
    const c = sugg[i]
    if (c) insert(c[1], (prefix?.length ?? 0) + 1)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugg.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : sugg.length - 1)) % sugg.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        accept(Math.min(active, sugg.length - 1))
        return
      }
      if (e.key === 'Escape') {
        setCaret(-1)
        return
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      insert('  ')
    }
  }

  const svgFor = (color: string) => (node ? render(node, { size: s.size, display: s.display, color, measure }) : null)
  const exportSvg = () => {
    const r = svgFor(s.color || '#000000')
    if (r) download('equation.svg', r.svg, 'image/svg+xml')
  }
  const exportPng = () => {
    const r = svgFor(s.color || '#000000')
    if (!r) return
    const img = new Image()
    const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }))
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.ceil(r.w * s.scale)
      c.height = Math.ceil(r.h * s.scale)
      const g = c.getContext('2d')!
      if (s.bg === 'white') {
        g.fillStyle = '#fff'
        g.fillRect(0, 0, c.width, c.height)
      }
      g.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => b && download('equation.png', b))
    }
    img.src = url
  }

  const err = parsed.err
  const [ln, cl] = err ? lineCol(s.src, err.pos) : [0, 0]
  const errLine = err ? s.src.split('\n')[ln - 1] : ''

  return (
    <Split wide="right">
      <div>
        <style>{CSS}</style>
        <Panel title="LaTeX source" actions={<><Select label="" value="" onChange={(v: string) => v && set({ src: v })} options={[['', 'Examples…'], ...EXAMPLES.map(([n, t]) => [t, n] as [string, string])]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <div className="tx-wrap">
            <pre ref={pre} aria-hidden>{highlight(s.src, err)}{'\n'}</pre>
            <textarea
              ref={ta}
              value={s.src}
              spellCheck={false}
              rows={12}
              aria-label="LaTeX source"
              onChange={(e) => {
                set({ src: e.target.value })
                setCaret(e.target.selectionStart)
                setActive(0)
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={onKey}
              onScroll={(e) => pre.current && (pre.current.scrollTop = e.currentTarget.scrollTop)}
            />
          </div>
          {sugg.length > 0 && (
            <div className="tx-sug" role="listbox" aria-label="Command suggestions">
              {sugg.map(([name], i) => (
                <button key={name} type="button" className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); accept(i) }}>
                  \{name}{SYMBOL_OF(name) ? ` ${SYMBOL_OF(name)}` : ''}
                </button>
              ))}
              <span className="k-hint">↑↓ choose · Enter/Tab insert · Esc close</span>
            </div>
          )}
          {err ? (
            <Note tone="err">
              <b>Line {ln}, column {cl}:</b> {err.message}
              <pre style={{ margin: '6px 0 0', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }}>{errLine}{'\n'}{' '.repeat(Math.max(0, cl - 1))}{'^'.repeat(Math.max(1, Math.min(err.len, errLine.length - cl + 1)))}</pre>
              {node && <span className="k-hint">Showing the last valid version.</span>}
            </Note>
          ) : (
            <p className="k-hint">Type <code>\</code> for command suggestions. Top-level <code>\\</code> starts a new centred line; use <code>aligned</code> with <code>&amp;</code> to line up equals signs.</p>
          )}
        </Panel>
        <Panel title="Symbol palette">
          <Seg value={s.tab} onChange={(tab) => set({ tab })} options={Object.keys(PALETTE).map((k) => [k, k] as [string, string])} />
          <div className="tx-pal">
            {(palette[s.tab] ?? []).map((p) => (
              <button key={p.tex} type="button" title={p.tex} onClick={() => insert(p.snip)} dangerouslySetInnerHTML={{ __html: p.svg || p.tex }} />
            ))}
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<><CopyButton label="LaTeX" text={s.src} /><CopyButton label="SVG" text={() => svgFor(s.color || '#000000')?.svg ?? ''} /><CopyButton label="MathML" text={mathml} /></>}>
          <div className="tx-prev" style={{ background: s.bg === 'white' ? '#fff' : 'var(--panel2)', color: s.bg === 'white' ? '#111' : 'var(--fg)', opacity: err ? 0.55 : 1 }} dangerouslySetInnerHTML={{ __html: out?.svg ?? '' }} />
          <p className="k-hint">{out ? `${out.w} × ${out.h} px at ${s.size} px · rendered by a built-in LaTeX layout engine (no external libraries).` : 'Nothing to show yet.'}</p>
        </Panel>
        <Panel title="Style & export">
          <Row>
            <Seg value={s.display ? 'd' : 'i'} onChange={(v) => set({ display: v === 'd' })} options={[['d', 'Display style'], ['i', 'Inline style']]} />
            <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['transparent', 'Transparent'], ['white', 'White background']]} />
          </Row>
          <Slider label="Size" value={s.size} onChange={(size) => set({ size })} min={14} max={72} unit=" px" show={(v) => String(v)} />
          <Row>
            <label className="k-field" style={{ maxWidth: 160 }}>
              <span className="k-label">Colour</span>
              <input type="color" value={s.color || '#111111'} onChange={(e) => set({ color: e.target.value })} style={{ width: '100%', height: 36 }} />
            </label>
            <Check label="Follow theme colour" value={!s.color} onChange={(v) => set({ color: v ? '' : '#111111' })} />
          </Row>
          <Slider label="PNG resolution" value={s.scale} onChange={(scale) => set({ scale })} min={1} max={6} step={1} unit="×" show={(v) => String(v)} />
          <Row>
            <Btn kind="primary" onClick={exportPng} disabled={!node}>⬇ PNG</Btn>
            <Btn onClick={exportSvg} disabled={!node}>⬇ SVG</Btn>
            <Btn onClick={() => download('equation.mml', mathml, 'application/mathml+xml')} disabled={!node}>⬇ MathML</Btn>
            <Btn kind="ghost" onClick={() => setShowMl(!showMl)}>{showMl ? 'Hide' : 'Show'} MathML</Btn>
          </Row>
          {showMl && (
            <>
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, maxHeight: 220, overflow: 'auto', background: 'var(--panel2)', padding: 10, borderRadius: 8 }}>{mathml}</pre>
              <p className="k-hint">Your browser’s own MathML rendering, for comparison:</p>
              <div style={{ fontSize: 22, padding: 8, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: mathml }} />
            </>
          )}
          <Note>MathML pastes into Word, LibreOffice and web pages as a real, editable equation. SVG text uses {DEFAULT_FONT.split(',')[0].replace(/'/g, '')} or a serif fallback; PNG bakes the glyphs in.</Note>
        </Panel>
      </div>
    </Split>
  )
}
