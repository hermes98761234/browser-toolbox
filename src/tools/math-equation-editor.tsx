import { useMemo, useRef, useState } from 'react'
import { Btn, CopyButton, Note, Panel, Row, Select, Seg, Slider, Split, download, uid, useToolState } from '../kit'
import { render } from './lib/math-equation-editor'

const EXAMPLES: [string, string][] = [
  ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
  ["Euler's identity", 'e^{i\\pi} + 1 = 0'],
  ['Gaussian integral', '\\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}'],
  ['Taylor series', 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x - a)^n'],
  ["Bayes' theorem", 'P(A \\mid B) = \\frac{P(B \\mid A)\\, P(A)}{P(B)}'],
  ['Matrix product', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}'],
  ['Determinant', '\\det A = \\begin{vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{vmatrix} = a_{11}a_{22} - a_{12}a_{21}'],
  ['Piecewise', '|x| = \\begin{cases} x & x \\geq 0 \\\\ -x & \\text{otherwise} \\end{cases}'],
  ['Limit definition', "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}"],
  ['Schrödinger', 'i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\vec{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\vec{r}, t) \\right] \\Psi(\\vec{r}, t)'],
  ['Maxwell (Gauss)', '\\oint_{\\partial V} \\vec{E} \\cdot d\\vec{A} = \\frac{Q}{\\varepsilon_0}'],
  ['Continued fraction', '\\varphi = 1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cdots}}}'],
  ['Binomial theorem', '(x + y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k'],
  ['Cube root & sets', '\\sqrt[3]{27} = 3 \\in \\mathbb{N} \\subset \\mathbb{Z} \\subset \\mathbb{R}'],
]

// [label shown on the button, snippet inserted; "▢" marks where the cursor goes]
const PALETTE: Record<string, [string, string][]> = {
  Structures: [['a/b', '\\frac{▢}{}'], ['xⁿ', '^{▢}'], ['xₙ', '_{▢}'], ['√', '\\sqrt{▢}'], ['ⁿ√', '\\sqrt[▢]{}'], ['( )', '\\left( ▢ \\right)'], ['[ ]', '\\left[ ▢ \\right]'], ['{ }', '\\left\\{ ▢ \\right\\}'], ['| |', '\\left| ▢ \\right|'], ['x̂', '\\hat{▢}'], ['x̄', '\\bar{▢}'], ['x⃗', '\\vec{▢}'], ['ẋ', '\\dot{▢}'], ['(ⁿₖ)', '\\binom{▢}{}'], ['matrix', '\\begin{pmatrix} ▢ & \\\\  & \\end{pmatrix}'], ['cases', '\\begin{cases} ▢ & \\\\  & \\end{cases}'], ['text', '\\text{▢}']],
  Greek: Object.entries({ α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ζ: 'zeta', η: 'eta', θ: 'theta', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', φ: 'varphi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega' }).map(([k, v]) => [k, `\\${v} `]),
  Operators: [['±', '\\pm '], ['∓', '\\mp '], ['×', '\\times '], ['÷', '\\div '], ['·', '\\cdot '], ['∘', '\\circ '], ['∑', '\\sum_{▢}^{}'], ['∏', '\\prod_{▢}^{}'], ['∫', '\\int_{▢}^{}'], ['∬', '\\iint '], ['∮', '\\oint '], ['lim', '\\lim_{▢ \\to }'], ['∂', '\\partial '], ['∇', '\\nabla '], ['∞', '\\infty '], ['∪', '\\cup '], ['∩', '\\cap '], ['⊕', '\\oplus '], ['sin', '\\sin '], ['log', '\\log ']],
  Relations: [['≤', '\\leq '], ['≥', '\\geq '], ['≠', '\\neq '], ['≈', '\\approx '], ['≡', '\\equiv '], ['∼', '\\sim '], ['∝', '\\propto '], ['≪', '\\ll '], ['≫', '\\gg '], ['∈', '\\in '], ['∉', '\\notin '], ['⊂', '\\subset '], ['⊆', '\\subseteq '], ['⊥', '\\perp '], ['∥', '\\parallel '], ['∀', '\\forall '], ['∃', '\\exists '], ['∅', '\\emptyset ']],
  Arrows: [['→', '\\to '], ['←', '\\leftarrow '], ['↔', '\\leftrightarrow '], ['⇒', '\\Rightarrow '], ['⇐', '\\Leftarrow '], ['⇔', '\\Leftrightarrow '], ['↦', '\\mapsto '], ['⟹', '\\implies '], ['↑', '\\uparrow '], ['↓', '\\downarrow ']],
  Misc: [['ℝ', '\\mathbb{R}'], ['ℕ', '\\mathbb{N}'], ['ℤ', '\\mathbb{Z}'], ['ℂ', '\\mathbb{C}'], ['ℏ', '\\hbar '], ['ℓ', '\\ell '], ['…', '\\ldots '], ['⋯', '\\cdots '], ['⋮', '\\vdots '], ['°', '^{\\circ}'], ['∠', '\\angle '], ['∴', '\\therefore '], ['thin space', '\\, '], ['quad', '\\quad ']],
}

const COLORS: [string, string][] = [['auto', 'Theme'], ['#000000', 'Black'], ['#1e3a8a', 'Navy'], ['#4f46e5', 'Indigo'], ['#b91c1c', 'Red'], ['#047857', 'Green'], ['#ffffff', 'White']]

interface Saved { id: string; tex: string }
const DEF = { tex: EXAMPLES[0][1], size: 40, color: 'auto', display: 'display' as 'display' | 'inline', bg: 'none' as 'none' | 'white' | 'dark', scale: 2, tab: 'Structures', saved: [] as Saved[] }

export default function MathEquationEditor() {
  const [s, set, reset] = useToolState('math-equation-editor', DEF)
  const ta = useRef<HTMLTextAreaElement>(null)
  const [msg, setMsg] = useState('')
  const opts = { size: s.size, display: s.display === 'display' }
  const preview = useMemo(() => render(s.tex, { ...opts, color: s.color === 'auto' ? 'currentColor' : s.color }), [s.tex, s.size, s.display, s.color]) // eslint-disable-line react-hooks/exhaustive-deps
  const exportColor = s.color === 'auto' ? (s.bg === 'dark' ? '#ffffff' : '#000000') : s.color
  const svgOut = () => {
    const r = render(s.tex, { ...opts, color: exportColor })
    if (s.bg === 'none') return r.svg
    return r.svg.replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="${s.bg === 'white' ? '#ffffff' : '#0f172a'}"/>`)
  }
  const insert = (snip: string) => {
    const el = ta.current
    const start = el?.selectionStart ?? s.tex.length, end = el?.selectionEnd ?? s.tex.length
    const sel = s.tex.slice(start, end)
    let ins = snip.replace('▢', sel)
    const caret = snip.includes('▢') ? start + snip.indexOf('▢') + sel.length : start + ins.length
    ins = ins.replace('▢', '')
    set({ tex: s.tex.slice(0, start) + ins + s.tex.slice(end) })
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(caret, caret) } })
  }
  const png = () => {
    const svg = svgOut()
    const r = render(s.tex, { ...opts, color: exportColor })
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = r.width * s.scale
      c.height = r.height * s.scale
      const g = c.getContext('2d')!
      g.scale(s.scale, s.scale)
      g.drawImage(img, 0, 0)
      c.toBlob((b) => b && download('equation.png', b, 'image/png'))
    }
    img.onerror = () => setMsg('PNG export failed in this browser.')
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  const balance = (() => {
    let d = 0
    for (let i = 0; i < s.tex.length; i++) {
      if (s.tex[i] === '\\') { i++; continue }
      if (s.tex[i] === '{') d++
      else if (s.tex[i] === '}') d--
      if (d < 0) break
    }
    return d
  })()

  return (
    <Split wide="right">
      <div>
        <Panel title="LaTeX source" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Examples" value="" onChange={(tex) => tex && set({ tex })} options={[['', 'Choose an example…'], ...EXAMPLES.map(([n, t]) => [t, n] as [string, string])]} />
          <textarea
            ref={ta}
            className="k-area mono"
            rows={7}
            spellCheck={false}
            value={s.tex}
            onChange={(e) => set({ tex: e.target.value })}
            style={{ marginTop: 10, fontSize: 15 }}
            aria-label="LaTeX"
          />
          <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{s.tex.length} chars</span>
            <span style={{ color: balance === 0 ? 'var(--ok)' : 'var(--err)' }}>{balance === 0 ? 'braces balanced ✓' : balance > 0 ? `${balance} unclosed {` : 'extra }'}</span>
            <span>Use \\ for a new line</span>
          </div>
          {preview.errors.length > 0 && <Note tone="warn">{[...new Set(preview.errors)].join(' · ')}</Note>}
        </Panel>
        <Panel title="Symbols">
          <Seg value={s.tab} onChange={(tab) => set({ tab })} options={Object.keys(PALETTE).map((k) => [k, k] as [string, string])} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {(PALETTE[s.tab] ?? PALETTE.Structures).map(([l, snip]) => (
              <button key={l + snip} type="button" className="k-btn" title={snip.replace('▢', '')} onClick={() => insert(snip)} style={{ minWidth: 40, justifyContent: 'center', fontFamily: 'serif', fontSize: 16 }}>
                {l}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={`Saved (${s.saved.length})`} actions={<Btn onClick={() => set({ saved: [{ id: uid(), tex: s.tex }, ...s.saved.filter((x) => x.tex !== s.tex)].slice(0, 30) })}>★ Save current</Btn>}>
          {s.saved.length === 0 && <p className="muted">Saved equations stay in this browser.</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {s.saved.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: 6 }}>
                <button type="button" onClick={() => set({ tex: x.tex })} style={{ flex: 1, background: 'none', border: 0, color: 'inherit', cursor: 'pointer', overflowX: 'auto', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: render(x.tex, { size: 18, display: false, color: 'currentColor' }).svg }} />
                <Btn kind="ghost" onClick={() => set({ saved: s.saved.filter((y) => y.id !== x.id) })}>✕</Btn>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div>
        <Panel
          title="Preview"
          actions={
            <>
              <CopyButton text={() => s.tex} label="LaTeX" />
              <CopyButton text={svgOut} label="SVG" />
              <Btn onClick={() => download('equation.svg', svgOut(), 'image/svg+xml')}>⬇ SVG</Btn>
              <Btn kind="primary" onClick={png}>⬇ PNG</Btn>
            </>
          }
        >
          <div
            style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'auto', padding: 16, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--fg)', background: s.bg === 'white' ? '#fff' : s.bg === 'dark' ? '#0f172a' : 'repeating-conic-gradient(color-mix(in srgb, var(--line) 45%, transparent) 0% 25%, transparent 0% 50%) 50% / 20px 20px' }}
            dangerouslySetInnerHTML={{ __html: preview.svg }}
          />
          <p className="muted" style={{ fontSize: 13 }}>{preview.width} × {preview.height} px at 1× · PNG exports at {s.scale}× ({preview.width * s.scale} × {preview.height * s.scale} px)</p>
          {msg && <Note tone="err">{msg}</Note>}
        </Panel>
        <Panel title="Style">
          <Row>
            <Seg value={s.display} onChange={(display) => set({ display })} options={[['display', 'Display'], ['inline', 'Inline']]} />
            <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['none', 'Transparent'], ['white', 'White'], ['dark', 'Dark']]} />
          </Row>
          <Slider label="Font size" value={s.size} min={14} max={96} unit=" px" onChange={(size) => set({ size })} />
          <Slider label="PNG scale" value={s.scale} min={1} max={4} unit="×" onChange={(scale) => set({ scale })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="k-label">Colour</span>
            {COLORS.map(([c, l]) => (
              <button key={c} type="button" title={l} onClick={() => set({ color: c })} style={{ width: 28, height: 28, borderRadius: 999, cursor: 'pointer', border: s.color === c ? '3px solid var(--accent)' : '1px solid var(--line)', background: c === 'auto' ? 'linear-gradient(135deg, #fff 50%, #111 50%)' : c }} />
            ))}
            <input type="color" value={s.color === 'auto' ? '#000000' : s.color} onChange={(e) => set({ color: e.target.value })} aria-label="Custom colour" />
          </div>
        </Panel>
        <Panel title="In a sentence">
          <p style={{ fontSize: 17, lineHeight: 1.9 }}>
            The solution is{' '}
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }} dangerouslySetInnerHTML={{ __html: render(s.tex, { size: 20, display: false, color: 'currentColor' }).svg }} />
            , which follows directly from the definition.
          </p>
          <Note>
            Supported: \frac \dfrac \sqrt[n] ^ _ \sum \prod \int \oint \lim \left…\right, Greek letters, \mathbb, \text, \hat \bar \vec \dot \tilde \overline, environments matrix, pmatrix, bmatrix, vmatrix, cases, aligned (&amp; and \\).
            Rendering is done locally into pure SVG — no fonts or scripts are downloaded.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
