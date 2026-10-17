import { useEffect, useRef, useState, type PointerEvent as PE } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Select, Slider, Split, useToolState } from '../kit'
import { css, ease, overshoot, parseCurve, PRESETS, type Curve } from './lib/cubic-bezier-editor'

const DEF = { c: [0.34, 1.56, 0.64, 1] as Curve, duration: 900, compare: 'ease', pause: 300 }

// Editor geometry: 1 unit = U px, y from Y1 (top) to Y0 (bottom).
const U = 200, PAD = 30, Y0 = -0.6, Y1 = 1.6
const W = U + PAD * 2, H = (Y1 - Y0) * U + PAD * 2
const sx = (x: number) => PAD + x * U
const sy = (y: number) => PAD + (Y1 - y) * U

function pathOf(c: Curve, w: number, h: number, pad = 0, y0 = 0, y1 = 1) {
  const X = (x: number) => pad + x * (w - 2 * pad)
  const Y = (y: number) => pad + ((y1 - y) / (y1 - y0)) * (h - 2 * pad)
  return `M${X(0)},${Y(0)} C${X(c[0])},${Y(c[1])} ${X(c[2])},${Y(c[3])} ${X(1)},${Y(1)}`
}

function Thumb({ c }: { c: Curve }) {
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
      <rect x={6} y={10} width={32} height={24} fill="none" stroke="var(--line)" />
      <path d={pathOf(c, 44, 44, 6, -0.6, 1.6)} fill="none" stroke="var(--accent)" strokeWidth={2} />
    </svg>
  )
}

export default function CubicBezierEditor() {
  const [s, set] = useToolState('cubic-bezier-editor', DEF)
  const [drag, setDrag] = useState<0 | 1 | null>(null)
  const [text, setText] = useState<string | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  const balls = useRef<(HTMLDivElement | null)[]>([])
  const box = useRef<HTMLDivElement>(null)
  const c = s.c
  const cmp = PRESETS.find((p) => p.name === s.compare)?.c ?? PRESETS[0].c
  const os = overshoot(c)
  const code = css(c)
  const parts = code.slice(13, -1).split(', ')

  const move = (e: PE<SVGSVGElement>) => {
    if (drag === null || !svg.current) return
    const pt = svg.current.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.current.getScreenCTM()!.inverse())
    const x = Math.min(1, Math.max(0, (p.x - PAD) / U))
    const y = Math.min(Y1, Math.max(Y0, Y1 - (p.y - PAD) / U))
    const r = (v: number) => Math.round(v * 100) / 100
    const n = [...c] as Curve
    n[drag * 2] = r(x)
    n[drag * 2 + 1] = r(y)
    set({ c: n })
  }

  // One clock drives the dot on the curve and all preview balls, so they stay in sync.
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const cycle = s.duration + s.pause
    const tick = (now: number) => {
      const el = (now - t0) % (2 * cycle)
      const fwd = el < cycle
      const local = Math.min(1, (fwd ? el : el - cycle) / s.duration)
      const x = fwd ? local : 1 - local
      const w = (box.current?.clientWidth ?? 300) - 40
      const curves: Curve[] = [c, cmp, [0, 0, 1, 1]]
      curves.forEach((cv, i) => {
        const b = balls.current[i]
        if (b) b.style.transform = `translateX(${ease(cv, x) * w}px)`
      })
      const b3 = balls.current[3]
      if (b3) {
        const y = ease(c, x)
        b3.style.transform = `scale(${0.4 + 0.6 * y})`
        b3.style.opacity = String(Math.min(1, Math.max(0, y)))
      }
      if (dot.current) {
        dot.current.setAttribute('cx', String(sx(x)))
        dot.current.setAttribute('cy', String(sy(ease(c, x))))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [c, cmp, s.duration, s.pause])

  const groups = [...new Set(PRESETS.map((p) => p.group))]
  const snippets: [string, string][] = [
    ['CSS transition', `transition: transform ${s.duration}ms ${code};`],
    ['CSS animation', `animation-timing-function: ${code};`],
    ['Web Animations API', `el.animate(keyframes, { duration: ${s.duration}, easing: '${code}' })`],
    ['Tailwind', `ease-[${code.replace(/\s+/g, '')}]`],
  ]

  return (
    <Split>
      <div>
        <Panel title="Curve" actions={<CopyButton text={code} label="Copy" />}>
          <div style={{ textAlign: 'center' }}>
            <svg
              ref={svg}
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', maxWidth: 300, touchAction: 'none', userSelect: 'none' }}
              onPointerMove={move}
              onPointerUp={() => setDrag(null)}
              onPointerLeave={() => setDrag(null)}
              role="img"
              aria-label={`Easing curve ${code}`}
            >
              <rect x={sx(0)} y={sy(1)} width={U} height={U} fill="var(--panel2)" stroke="var(--line)" />
              {[0.25, 0.5, 0.75].map((g) => (
                <g key={g} stroke="var(--line)" strokeDasharray="3 4">
                  <line x1={sx(g)} x2={sx(g)} y1={sy(0)} y2={sy(1)} />
                  <line x1={sx(0)} x2={sx(1)} y1={sy(g)} y2={sy(g)} />
                </g>
              ))}
              <text x={sx(0)} y={sy(0) + 16} fontSize={11} fill="var(--muted)">time →</text>
              <text x={sx(0) - 6} y={sy(1) - 8} fontSize={11} fill="var(--muted)">progress ↑</text>
              <path d={pathOf(cmp, U, U)} transform={`translate(${PAD},${sy(1)})`} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" />
              <line x1={sx(0)} y1={sy(0)} x2={sx(c[0])} y2={sy(c[1])} stroke="#ec4899" strokeWidth={2} />
              <line x1={sx(1)} y1={sy(1)} x2={sx(c[2])} y2={sy(c[3])} stroke="#0ea5e9" strokeWidth={2} />
              <path d={`M${sx(0)},${sy(0)} C${sx(c[0])},${sy(c[1])} ${sx(c[2])},${sy(c[3])} ${sx(1)},${sy(1)}`} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" />
              <circle ref={dot} r={5} fill="var(--accent)" />
              {[0, 1].map((k) => (
                <circle
                  key={k}
                  cx={sx(c[k * 2])}
                  cy={sy(c[k * 2 + 1])}
                  r={drag === k ? 12 : 10}
                  fill={k ? '#0ea5e9' : '#ec4899'}
                  stroke="#fff"
                  strokeWidth={3}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    svg.current?.setPointerCapture(e.pointerId)
                    setDrag(k as 0 | 1)
                  }}
                />
              ))}
            </svg>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(15px, 2.4vw, 20px)', textAlign: 'center', margin: '4px 0 10px' }}>
            cubic-bezier(<span style={{ color: '#ec4899' }}>{parts.slice(0, 2).join(', ')}</span>, <span style={{ color: '#0ea5e9' }}>{parts.slice(2).join(', ')}</span>)
          </div>
          <Row>
            {(['x1', 'y1', 'x2', 'y2'] as const).map((k, i) => (
              <Num key={k} label={k} value={c[i]} step={0.01} min={i % 2 ? -5 : 0} max={i % 2 ? 5 : 1} onChange={(v) => set({ c: c.map((x, j) => (j === i ? (i % 2 ? v : Math.min(1, Math.max(0, v))) : x)) as Curve })} />
            ))}
          </Row>
          <label className="k-field">
            <span className="k-label">Paste a curve</span>
            <input
              className="k-text"
              value={text ?? code}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseCurve(e.target.value)
                if (p) set({ c: p })
              }}
              onBlur={() => setText(null)}
              style={{ borderColor: text !== null && !parseCurve(text) ? 'var(--err)' : undefined }}
            />
          </label>
          {(os.max > 1.001 || os.min < -0.001) && (
            <Note>This curve {os.max > 1.001 ? `overshoots to ${Math.round(os.max * 100)}%` : ''}{os.max > 1.001 && os.min < -0.001 ? ' and ' : ''}{os.min < -0.001 ? `pulls back to ${Math.round(os.min * 100)}%` : ''}: a springy “back” effect. It looks great on transforms; colours and opacity get clamped.</Note>
          )}
        </Panel>
      </div>
      <div>
        <Panel title="Preview">
          <Row>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Slider label="Duration" value={s.duration} onChange={(duration) => set({ duration })} min={100} max={3000} step={50} unit=" ms" show={String} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Select label="Compare with" value={s.compare} onChange={(compare) => set({ compare })} options={PRESETS.map((p) => [p.name, p.name] as [string, string])} />
            </div>
          </Row>
          <div ref={box} style={{ display: 'grid', gap: 10 }}>
            {[
              ['Your curve', 'var(--accent)'],
              [s.compare, 'var(--muted)'],
              ['linear', 'var(--line)'],
            ].map(([name, col], i) => (
              <div key={i}>
                <div className="muted" style={{ fontSize: 12 }}>{name}</div>
                <div style={{ position: 'relative', height: 40, background: 'var(--panel2)', borderRadius: 20 }}>
                  <div ref={(el) => { balls.current[i] = el }} style={{ position: 'absolute', left: 4, top: 4, width: 32, height: 32, borderRadius: '50%', background: col, border: i === 2 ? '2px solid var(--muted)' : undefined }} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 80, height: 80, display: 'grid', placeItems: 'center', background: 'var(--panel2)', borderRadius: 12 }}>
                <div ref={(el) => { balls.current[3] = el }} style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), #ec4899)' }} />
              </div>
              <span className="muted">Scale + opacity with your curve</span>
            </div>
          </div>
        </Panel>
        <Panel title="Code">
          {snippets.map(([label, snip]) => (
            <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 13, wordBreak: 'break-all' }}>{snip}</code>
              </div>
              <CopyButton text={snip} />
            </div>
          ))}
        </Panel>
        <Panel title="Presets">
          {groups.map((g) => (
            <div key={g}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', margin: '6px 0' }}>{g}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <Btn key={p.name} kind={css(p.c) === code ? 'primary' : 'normal'} title={css(p.c)} onClick={() => set({ c: p.c })}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <Thumb c={p.c} /> {p.name}
                    </span>
                  </Btn>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </Split>
  )
}
