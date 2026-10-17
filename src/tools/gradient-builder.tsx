import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Seg, Select, Slider, Split, uid, useToolState } from '../kit'
import { css, fallbackCss, oklabToRgb, oklchToOklab, positionAt, rgbToHex, sample, type Geometry, type Kind, type Space, type Stop } from './lib/gradient-builder'

const S = (color: string, pos: number, alpha = 1): Stop => ({ id: uid(), color, pos, alpha })
const PRESETS: [string, Stop[], Space, Kind, number][] = [
  ['Sunset', [S('#2a0845', 0), S('#c0397a', 45), S('#ff9a44', 80), S('#ffe29a', 100)], 'oklch', 'linear', 160],
  ['Ocean', [S('#0b1d51', 0), S('#1565c0', 50), S('#4dd0e1', 100)], 'oklab', 'linear', 135],
  ['Aurora', [S('#00c9a7', 0), S('#845ec2', 50), S('#ff6f91', 100)], 'oklch', 'linear', 90],
  ['Blue → yellow', [S('#0000ff', 0), S('#ffff00', 100)], 'oklch', 'linear', 90],
  ['Neon ring', [S('#ff00cc', 0), S('#3333ff', 33), S('#00ffcc', 66), S('#ff00cc', 100)], 'oklch', 'conic', 0],
  ['Spotlight', [S('#fff7d6', 0), S('#f59e0b', 30), S('#7c2d12', 70, 0.9), S('#1c1917', 100)], 'oklab', 'radial', 0],
  ['Fade out', [S('#6366f1', 0), S('#6366f1', 100, 0)], 'srgb', 'linear', 180],
]
const DEF = { stops: PRESETS[0][1], space: 'oklch' as Space, kind: 'linear' as Kind, angle: 160, cx: 50, cy: 40, w: 1920, h: 1080, sel: '' }
const SPACES: [Space, string][] = [['srgb', 'sRGB'], ['srgb-linear', 'Linear sRGB'], ['oklab', 'OKLab'], ['oklch', 'OKLCH']]

/** 1024-entry RGBA lookup table over positions 0–100. */
function lut(stops: Stop[], space: Space): Uint8ClampedArray {
  const t = new Uint8ClampedArray(1024 * 4)
  for (let i = 0; i < 1024; i++) {
    const [c, a] = sample(stops, space, (i / 1023) * 100)
    t[i * 4] = c[0] * 255
    t[i * 4 + 1] = c[1] * 255
    t[i * 4 + 2] = c[2] * 255
    t[i * 4 + 3] = a * 255
  }
  return t
}

function paint(cv: HTMLCanvasElement, w: number, h: number, stops: Stop[], space: Space, g: Geometry) {
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const L = lut(stops, space)
  const d = img.data
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = positionAt(g, x + 0.5, y + 0.5, w, h)
      const k = Math.round((Math.min(100, Math.max(0, p)) / 100) * 1023) * 4
      const o = (y * w + x) * 4
      d[o] = L[k]; d[o + 1] = L[k + 1]; d[o + 2] = L[k + 2]; d[o + 3] = L[k + 3]
    }
  ctx.putImageData(img, 0, 0)
}

function Canvas({ stops, space, g, height, onPoint }: { stops: Stop[]; space: Space; g: Geometry; height: number; onPoint?: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (ref.current) paint(ref.current, Math.round(w / 2), Math.round(height / 2), stops, space, g)
  }, [w, height, stops, space, g])
  const pick = (e: React.PointerEvent) => {
    if (!onPoint || !(e.buttons & 1)) return
    const r = (e.target as HTMLElement).getBoundingClientRect()
    onPoint(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100))
  }
  return (
    <canvas
      ref={ref}
      onPointerDown={pick}
      onPointerMove={pick}
      style={{ width: '100%', height, display: 'block', borderRadius: 10, cursor: onPoint ? 'crosshair' : undefined, touchAction: onPoint ? 'none' : undefined, background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/16px 16px' }}
    />
  )
}

export default function GradientBuilder() {
  const [s, set, reset] = useToolState('gradient-builder', DEF)
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const g: Geometry = { kind: s.kind, angle: s.angle, cx: s.cx, cy: s.cy }
  const sel = s.stops.find((x) => x.id === s.sel) ?? s.stops[0]
  const code = css(s.stops, s.space, g)
  const fb = fallbackCss(s.stops, s.space, g)
  const editStop = (id: string, p: Partial<Stop>) => set({ stops: s.stops.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const posFromEvent = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)) * 10) / 10
  }
  const addAt = (pos: number) => {
    const [c, a] = sample(s.stops, s.space, pos)
    const st = { id: uid(), color: rgbToHex(c), pos, alpha: +a.toFixed(2) }
    set({ stops: [...s.stops, st], sel: st.id })
  }
  const exportPng = () => {
    const cv = document.createElement('canvas')
    paint(cv, Math.max(1, Math.min(8000, s.w)), Math.max(1, Math.min(8000, s.h)), s.stops, s.space, g)
    cv.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `gradient-${s.w}x${s.h}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }
  const random = () => {
    const n = 2 + Math.floor(Math.random() * 3)
    const h0 = Math.random() * 360
    const stops = Array.from({ length: n }, (_, i) => {
      const hue = (h0 + i * (50 + Math.random() * 70)) % 360
      const rgb = oklabToRgb(oklchToOklab([0.55 + Math.random() * 0.3, 0.12 + Math.random() * 0.08, hue]))
      return S(rgbToHex(rgb), Math.round((i / (n - 1)) * 100))
    })
    set({ stops, sel: stops[0].id, angle: Math.round(Math.random() * 36) * 10 })
  }

  return (
    <div>
      <Panel title="Preview" actions={<>
        <Btn onClick={random}>🎲 Random</Btn>
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </>}>
        <Canvas stops={s.stops} space={s.space} g={g} height={260} onPoint={s.kind === 'linear' ? undefined : (cx, cy) => set({ cx, cy })} />
        {s.kind !== 'linear' && <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Click or drag on the preview to move the centre.</p>}
        <div style={{ position: 'relative', margin: '22px 10px 34px' }}>
          <div
            ref={bar}
            onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'CANVAS') addAt(posFromEvent(e.clientX)) }}
            style={{ cursor: 'copy' }}
            title="Click to add a stop"
          >
            <Canvas stops={s.stops} space={s.space} g={{ kind: 'linear', angle: 90, cx: 50, cy: 50 }} height={36} />
          </div>
          {s.stops.map((st) => (
            <div
              key={st.id}
              role="slider"
              aria-label={`Stop ${st.color} at ${st.pos}%`}
              aria-valuenow={st.pos}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') editStop(st.id, { pos: Math.min(100, Math.max(0, st.pos + (e.key === 'ArrowLeft' ? -1 : 1))) })
                if ((e.key === 'Delete' || e.key === 'Backspace') && s.stops.length > 2) set({ stops: s.stops.filter((x) => x.id !== st.id) })
              }}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDrag(st.id); set({ sel: st.id }) }}
              onPointerMove={(e) => { if (drag === st.id) editStop(st.id, { pos: posFromEvent(e.clientX) }) }}
              onPointerUp={() => setDrag(null)}
              style={{
                position: 'absolute', left: `calc(${st.pos}% - 11px)`, top: 26, width: 22, height: 22, borderRadius: 6, background: st.color, cursor: 'grab', touchAction: 'none',
                border: `3px solid ${st.id === sel?.id ? 'var(--accent)' : 'var(--panel)'}`, boxShadow: '0 1px 4px rgba(0,0,0,.4)',
              }}
            />
          ))}
        </div>
      </Panel>
      <Split>
        <div>
          <Panel title="Shape">
            <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']]} />
            {s.kind !== 'radial' && <Slider label={s.kind === 'linear' ? 'Angle' : 'Start angle'} value={s.angle} min={0} max={360} onChange={(angle) => set({ angle })} unit="°" show={(v) => String(v)} />}
            {s.kind !== 'linear' && (
              <Row>
                <Slider label="Centre X" value={s.cx} min={0} max={100} onChange={(cx) => set({ cx })} unit="%" />
                <Slider label="Centre Y" value={s.cy} min={0} max={100} onChange={(cy) => set({ cy })} unit="%" />
              </Row>
            )}
            <Select label="Interpolation colour space" value={s.space} onChange={(space) => set({ space })} options={SPACES} />
          </Panel>
          {sel && (
            <Panel title="Selected stop" actions={<Btn kind="danger" disabled={s.stops.length <= 2} onClick={() => set({ stops: s.stops.filter((x) => x.id !== sel.id), sel: '' })}>Delete</Btn>}>
              <Row>
                <label className="k-field">
                  <span className="k-label">Colour</span>
                  <input type="color" value={sel.color} onChange={(e) => editStop(sel.id, { color: e.target.value })} style={{ width: 64, height: 40, border: 0, background: 'none' }} />
                </label>
                <label className="k-field">
                  <span className="k-label">Hex</span>
                  <input
                    key={sel.id + sel.color}
                    className="k-text"
                    defaultValue={sel.color}
                    onBlur={(e) => { const v = e.target.value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) editStop(sel.id, { color: v.toLowerCase() }); else e.target.value = sel.color }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    style={{ width: 110 }}
                  />
                </label>
                <Num label="Position" value={sel.pos} onChange={(pos) => editStop(sel.id, { pos: Math.min(100, Math.max(0, pos)) })} unit="%" min={0} max={100} />
              </Row>
              <Slider label="Opacity" value={sel.alpha} min={0} max={1} step={0.01} onChange={(alpha) => editStop(sel.id, { alpha })} show={(v) => `${Math.round(v * 100)}%`} />
              <Row>
                <Btn onClick={() => set({ stops: s.stops.map((x) => ({ ...x, pos: 100 - x.pos })) })}>⇄ Reverse</Btn>
                <Btn onClick={() => { const sorted = [...s.stops].sort((a, b) => a.pos - b.pos); set({ stops: sorted.map((x, i) => ({ ...x, pos: Math.round((i / (sorted.length - 1)) * 100) })) }) }}>Distribute evenly</Btn>
              </Row>
            </Panel>
          )}
          <Panel title="Presets">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {PRESETS.map(([n, st, sp, k, a]) => (
                <button key={n} type="button" className="k-btn ghost" style={{ display: 'block', padding: 0, overflow: 'hidden', textAlign: 'left' }} onClick={() => set({ stops: st.map((x) => ({ ...x, id: uid() })), space: sp, kind: k, angle: a, cx: 50, cy: k === 'radial' ? 40 : 50, sel: '' })}>
                  <div style={{ height: 40, background: css(st, sp, { kind: k, angle: a, cx: 50, cy: 50 }) }} />
                  <div style={{ padding: '4px 8px', fontSize: 13 }}>{n}</div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="CSS" actions={<CopyButton text={() => `background: ${fb};\nbackground: ${code};`} label="Copy CSS" />}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--mono)', fontSize: 13, background: 'var(--panel2)', padding: 12, borderRadius: 8, margin: 0 }}>
              {`/* sRGB fallback (baked ${s.space} stops) */\nbackground: ${fb};\n/* modern browsers */\nbackground: ${code};`}
            </pre>
            <Row>
              <CopyButton text={code} label="Gradient only" />
              <CopyButton text={() => `bg-[${code.replace(/\s+/g, '_')}]`} label="Tailwind class" />
            </Row>
            <div style={{ height: 70, borderRadius: 8, marginTop: 10, background: code }} title="Rendered by your browser's CSS engine" />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>↑ your browser rendering the CSS above (should match the canvas preview).</p>
          </Panel>
          <Panel title="Same stops, different colour spaces">
            {SPACES.map(([sp, label]) => (
              <button key={sp} type="button" onClick={() => set({ space: sp })} style={{ display: 'block', width: '100%', border: 0, background: 'none', padding: 0, marginBottom: 8, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                <div style={{ fontSize: 13, marginBottom: 2, fontWeight: sp === s.space ? 700 : 400 }}>{label}{sp === s.space ? ' ✓' : ''}</div>
                <Canvas stops={s.stops} space={sp} g={{ kind: 'linear', angle: 90, cx: 50, cy: 50 }} height={28} />
              </button>
            ))}
            <Note>sRGB blends often turn muddy or grey in the middle; OKLab keeps perceived lightness even; OKLCH also keeps chroma and travels around the hue wheel.</Note>
          </Panel>
          <Panel title="Export PNG">
            <Row>
              <Num label="Width" value={s.w} onChange={(w) => set({ w })} unit="px" min={1} max={8000} step={1} />
              <Num label="Height" value={s.h} onChange={(h) => set({ h })} unit="px" min={1} max={8000} step={1} />
            </Row>
            <Row>
              {[[1920, 1080], [2560, 1440], [1080, 1920], [1200, 630], [512, 512]].map(([w, h]) => (
                <Btn key={`${w}x${h}`} kind="ghost" onClick={() => set({ w, h })}>{w}×{h}</Btn>
              ))}
            </Row>
            <Btn kind="primary" onClick={exportPng}>⬇ Download PNG</Btn>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
