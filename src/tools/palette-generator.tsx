import { useMemo, useState } from 'react'
import { Btn, CopyButton, download, Note, Panel, Row, Seg, Select, Slider, Split, uid, useToolState } from '../kit'
import { contrast, fmtHsl, fmtOklch, fmtRgb, harmony, hexToRgb, rgbToHex, RULES, scale, STEPS, type RGB, type Rule } from './lib/palette-generator'

type Fmt = 'hex' | 'rgb' | 'hsl' | 'oklch'
interface Saved { id: string; name: string; colors: string[] }
const DEF = { base: '#6366f1', rule: 'triadic' as Rule, space: 'oklch' as 'hsl' | 'oklch', spread: 30, fmt: 'hex' as Fmt, saved: [] as Saved[] }
const BASES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#84cc16', '#78716c']
const ROLE: Record<Rule, string[]> = {
  complementary: ['Base', 'Complement'],
  split: ['Base', 'Split A', 'Split B'],
  analogous: ['−2', '−1', 'Base', '+1', '+2'],
  triadic: ['Base', 'Triad A', 'Triad B'],
  tetradic: ['Base', '+60°', 'Complement', '+240°'],
  square: ['Base', '+90°', 'Complement', '+270°'],
  monochromatic: ['Darkest', 'Dark', 'Base', 'Light', 'Lightest'],
}

const show = (c: RGB, f: Fmt) => (f === 'hex' ? rgbToHex(c) : f === 'rgb' ? fmtRgb(c) : f === 'hsl' ? fmtHsl(c) : fmtOklch(c))
const ink = (c: RGB): RGB => (contrast(c, [255, 255, 255]) >= contrast(c, [17, 24, 39]) ? [255, 255, 255] : [17, 24, 39])
const grade = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'fail')

export default function PaletteGenerator() {
  const [s, set, reset] = useToolState('palette-generator', DEF)
  const [hexText, setHexText] = useState(s.base)
  const [toast, setToast] = useState('')
  const base: RGB = hexToRgb(s.base) ?? [99, 102, 241]
  const colors = useMemo(() => harmony(hexToRgb(s.base) ?? [99, 102, 241], s.rule, s.space, s.spread), [s.base, s.rule, s.space, s.spread])
  const roles = ROLE[s.rule]
  const scales = useMemo(() => colors.map(scale), [colors])

  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t)
    setToast(`Copied ${t}`)
    setTimeout(() => setToast(''), 1400)
  }
  const setBase = (hex: string) => {
    setHexText(hex)
    if (hexToRgb(hex)) set({ base: rgbToHex(hexToRgb(hex)!) })
  }
  const random = () => {
    const b = new Uint8Array(3)
    crypto.getRandomValues(b)
    setBase(rgbToHex([b[0], b[1], b[2]]))
  }
  const name = (i: number) => (roles[i] ?? `c${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `c${i + 1}`
  const css = `:root {\n${colors.map((c, i) => `  --${name(i)}: ${show(c, s.fmt)};`).join('\n')}\n${scales[0].map((c, k) => `  --primary-${STEPS[k]}: ${rgbToHex(c)};`).join('\n')}\n}`
  const tailwind = JSON.stringify(Object.fromEntries(colors.map((_, i) => [name(i), Object.fromEntries(scales[i].map((c, k) => [STEPS[k], rgbToHex(c)]))])), null, 2)
  const [exp, setExp] = useState<'css' | 'tailwind' | 'list'>('css')
  const expText = exp === 'css' ? css : exp === 'tailwind' ? `// tailwind.config.js → theme.extend.colors\n${tailwind}` : colors.map((c) => show(c, s.fmt)).join('\n')
  const [p0, p1, p2] = [colors[0], colors[1] ?? colors[0], colors[2] ?? colors[1] ?? colors[0]]

  return (
    <Split>
      <div>
        <Panel title="Base colour" actions={<><Btn onClick={random}>🎲 Random</Btn><Btn kind="ghost" onClick={() => { reset(); setHexText(DEF.base) }}>Reset</Btn></>}>
          <Row>
            <input type="color" value={s.base} onChange={(e) => setBase(e.target.value)} aria-label="Pick base colour" style={{ width: 64, height: 64, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
            <label className={`k-field ${hexToRgb(hexText) ? '' : 'err'}`}>
              <span className="k-label">HEX</span>
              <input className="k-text mono" value={hexText} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
            </label>
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {BASES.map((b) => <button key={b} type="button" title={b} onClick={() => setBase(b)} style={{ width: 28, height: 28, borderRadius: 8, border: b === s.base ? '3px solid var(--fg)' : '1px solid var(--line)', background: b, cursor: 'pointer' }} />)}
          </div>
          <p className="muted mono" style={{ fontSize: 12 }}>{fmtRgb(base)} · {fmtHsl(base)} · {fmtOklch(base)}</p>
        </Panel>
        <Panel title="Harmony">
          <Select label="Rule" value={s.rule} onChange={(rule) => set({ rule })} options={RULES.map(([r, l]) => [r, l] as [Rule, string])} />
          {s.rule !== 'monochromatic' && (
            <div className="k-field">
              <span className="k-label">Rotate hue in</span>
              <Seg value={s.space} onChange={(space) => set({ space })} options={[['oklch', 'OKLCH (perceptual)'], ['hsl', 'HSL (classic wheel)']]} />
            </div>
          )}
          {s.rule === 'analogous' && <Slider label="Spread" value={s.spread} min={10} max={60} step={5} unit="°" onChange={(spread) => set({ spread })} />}
          <Note>{s.space === 'oklch' ? 'OKLCH keeps perceived lightness and chroma constant while rotating hue, so harmony colours feel equally bright.' : 'HSL rotates on the classic colour wheel; results can differ a lot in perceived brightness.'}</Note>
          {/* colour wheel */}
          <svg viewBox="-110 -110 220 220" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
            {Array.from({ length: 36 }, (_, i) => {
              const a0 = ((i * 10 - 90) * Math.PI) / 180, a1 = (((i + 1) * 10 - 90) * Math.PI) / 180
              return <path key={i} d={`M${90 * Math.cos(a0)},${90 * Math.sin(a0)} A90,90 0 0 1 ${90 * Math.cos(a1)},${90 * Math.sin(a1)} L${60 * Math.cos(a1)},${60 * Math.sin(a1)} A60,60 0 0 0 ${60 * Math.cos(a0)},${60 * Math.sin(a0)}Z`} fill={`hsl(${i * 10 + 5}, 85%, 55%)`} />
            })}
            {colors.map((c, i) => {
              const h = fmtHsl(c).match(/\d+/)![0]
              const a = ((+h - 90) * Math.PI) / 180
              return (
                <g key={i}>
                  <line x1={0} y1={0} x2={75 * Math.cos(a)} y2={75 * Math.sin(a)} stroke="var(--fg)" strokeWidth={1} opacity={0.4} />
                  <circle cx={75 * Math.cos(a)} cy={75 * Math.sin(a)} r={roles[i] === 'Base' ? 11 : 8} fill={rgbToHex(c)} stroke="var(--fg)" strokeWidth={2} />
                </g>
              )
            })}
          </svg>
        </Panel>
        <Panel title="Saved palettes" actions={<Btn onClick={() => set({ saved: [{ id: uid(), name: `${RULES.find((r) => r[0] === s.rule)![1]} ${s.base}`, colors: colors.map(rgbToHex) }, ...s.saved].slice(0, 30) })}>☆ Save current</Btn>}>
          {s.saved.length === 0 && <p className="muted">Nothing saved yet.</p>}
          {s.saved.map((p) => (
            <Row key={p.id} wrap={false}>
              <button type="button" onClick={() => setBase(p.colors[0])} style={{ display: 'flex', flex: 1, height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)', padding: 0, cursor: 'pointer' }} title={p.name}>
                {p.colors.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
              </button>
              <Btn kind="ghost" title="Delete" onClick={() => set({ saved: s.saved.filter((x) => x.id !== p.id) })}>✕</Btn>
            </Row>
          ))}
        </Panel>
      </div>
      <div>
        <Panel title="Palette" actions={<Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['hex', 'HEX'], ['rgb', 'RGB'], ['hsl', 'HSL'], ['oklch', 'OKLCH']]} />}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colors.length}, minmax(0, 1fr))`, gap: 8 }}>
            {colors.map((c, i) => {
              const t = ink(c)
              const cw = contrast(c, [255, 255, 255]), cb = contrast(c, [0, 0, 0])
              return (
                <button key={i} type="button" onClick={() => copy(show(c, s.fmt))} title="Click to copy" style={{ background: rgbToHex(c), color: rgbToHex(t), border: 'none', borderRadius: 12, padding: '14px 10px', minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>{roles[i]}</span>
                  <span>
                    <b className="mono" style={{ fontSize: 15, display: 'block' }}>{rgbToHex(c).toUpperCase()}</b>
                    <span style={{ fontSize: 11, opacity: 0.85, display: 'block', wordBreak: 'break-word' }}>{s.fmt !== 'hex' && show(c, s.fmt)}</span>
                    <span style={{ fontSize: 11, opacity: 0.85 }}>on white {cw.toFixed(2)} {grade(cw)} · black {cb.toFixed(2)} {grade(cb)}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {toast ? <Note tone="ok">{toast}</Note> : <p className="muted" style={{ fontSize: 12 }}>Click a swatch or a scale step to copy it. Contrast is WCAG 2.1 (AA needs 4.5 for body text).</p>}
        </Panel>
        <Panel title="Tints & shades (50–950)">
          {scales.map((row, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>{roles[i]}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, minmax(0, 1fr))', gap: 3 }}>
                {row.map((c, k) => (
                  <button key={k} type="button" onClick={() => copy(show(c, s.fmt))} title={`${STEPS[k]} · ${rgbToHex(c)}`} style={{ background: rgbToHex(c), color: rgbToHex(ink(c)), border: 'none', borderRadius: 6, height: 40, fontSize: 10, cursor: 'pointer', padding: 0 }}>{STEPS[k]}</button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Preview">
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: rgbToHex(scales[0][0]) }}>
            <div style={{ background: rgbToHex(scales[0][8]), color: '#fff', padding: '10px 14px', fontWeight: 700 }}>Acme Dashboard</div>
            <div style={{ padding: 14, color: rgbToHex(scales[0][9]) }}>
              <h4 style={{ margin: '0 0 6px', color: rgbToHex(scales[0][9]) }}>Welcome back</h4>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>Your palette applied to a tiny interface: header, text, buttons and badges.</p>
              <Row>
                <span style={{ background: rgbToHex(p0), color: rgbToHex(ink(p0)), padding: '8px 14px', borderRadius: 8, fontWeight: 700 }}>Primary</span>
                <span style={{ background: rgbToHex(p1), color: rgbToHex(ink(p1)), padding: '8px 14px', borderRadius: 8, fontWeight: 700 }}>Secondary</span>
                <span style={{ border: `2px solid ${rgbToHex(p2)}`, color: rgbToHex(scales[Math.min(2, scales.length - 1)][7]), padding: '6px 12px', borderRadius: 8, fontWeight: 700 }}>Outline</span>
                <span style={{ background: rgbToHex(scales[Math.min(2, scales.length - 1)][1]), color: rgbToHex(scales[Math.min(2, scales.length - 1)][8]), padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>Badge</span>
              </Row>
            </div>
          </div>
        </Panel>
        <Panel title="Export" actions={<><Seg value={exp} onChange={setExp} options={[['css', 'CSS vars'], ['tailwind', 'Tailwind'], ['list', 'List']]} /><CopyButton text={expText} /><Btn onClick={() => download('palette.json', JSON.stringify({ base: s.base, rule: s.rule, colors: colors.map(rgbToHex), scales: scales.map((r) => r.map(rgbToHex)) }, null, 2), 'application/json')}>⬇ JSON</Btn></>}>
          <pre className="mono" style={{ background: 'var(--panel2)', padding: 10, borderRadius: 8, fontSize: 12, maxHeight: 240, overflow: 'auto', margin: 0 }}>{expText}</pre>
        </Panel>
      </div>
    </Split>
  )
}
