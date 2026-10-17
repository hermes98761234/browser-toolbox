import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { dotSize, dotSvg, INK, screen, SCREEN_ANGLES, toneCurve, type Channel, type Dot, type Shape } from './lib/halftone-generator'

const DEF = { mode: 'cmyk' as 'mono' | 'cmyk', cell: 7, angle: 45, shape: 'circle' as Shape, contrast: 1.1, gamma: 1, invert: false, ink: '#111827', paper: '#ffffff', size: 600, compare: false }

function demoImage(w: number): ImageData {
  const h = Math.round(w * 0.66)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#1e3a8a'); sky.addColorStop(0.55, '#f97316'); sky.addColorStop(1, '#fde68a')
  g.fillStyle = sky; g.fillRect(0, 0, w, h)
  const sun = g.createRadialGradient(w * 0.62, h * 0.52, 0, w * 0.62, h * 0.52, h * 0.3)
  sun.addColorStop(0, '#fffbeb'); sun.addColorStop(0.35, '#fde047'); sun.addColorStop(1, 'rgba(253,224,71,0)')
  g.fillStyle = sun; g.fillRect(0, 0, w, h)
  const hill = (y: number, amp: number, col: string, ph: number) => {
    g.beginPath(); g.moveTo(0, h)
    for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x / w * 6 + ph) * amp + Math.sin(x / w * 17 + ph * 2) * amp * 0.3)
    g.lineTo(w, h); g.closePath(); g.fillStyle = col; g.fill()
  }
  hill(h * 0.68, h * 0.05, '#7c2d12', 1); hill(h * 0.78, h * 0.06, '#14532d', 2.5); hill(h * 0.9, h * 0.04, '#052e16', 4)
  g.fillStyle = '#0f172a'
  g.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`
  g.fillText('HALFTONE', w * 0.05, h * 0.22)
  return g.getImageData(0, 0, w, h)
}

function drawDot(g: CanvasRenderingContext2D, d: Dot, cell: number, shape: Shape, angle: number) {
  const r = dotSize(d.s, cell, shape)
  if (shape === 'circle') { g.moveTo(d.x + r, d.y); g.arc(d.x, d.y, r, 0, Math.PI * 2); return }
  const a = ((shape === 'diamond' ? angle + 45 : angle) * Math.PI) / 180
  const hw = shape === 'line' ? cell / 2 + 0.1 : shape === 'diamond' ? r / Math.SQRT2 : r
  const hh = shape === 'line' ? r : hw
  const ca = Math.cos(a), sa = Math.sin(a)
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [d.x + x * ca - y * sa, d.y + x * sa + y * ca])
  g.moveTo(pts[0][0], pts[0][1])
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1])
  g.closePath()
}

export default function HalftoneGenerator() {
  const [s, set, reset] = useToolState('halftone-generator', DEF)
  const [src, setSrc] = useState<HTMLImageElement | null>(null)
  const [err, setErr] = useState('')
  const out = useRef<HTMLCanvasElement>(null)
  const orig = useRef<HTMLCanvasElement>(null)

  // source pixels at the processing width
  const img = useMemo(() => {
    if (!src) return demoImage(s.size)
    const w = Math.min(s.size, src.naturalWidth), h = Math.round((src.naturalHeight / src.naturalWidth) * w)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.drawImage(src, 0, 0, w, h)
    return g.getImageData(0, 0, w, h)
  }, [src, s.size])

  const layers = useMemo(() => {
    if (!img) return []
    const tone = toneCurve(s.contrast, s.gamma, s.invert)
    const chans: Channel[] = s.mode === 'mono' ? ['k'] : ['c', 'm', 'y', 'k']
    return chans.map((ch) => {
      const angle = s.mode === 'mono' ? s.angle : SCREEN_ANGLES[ch]
      return { ch, angle, color: s.mode === 'mono' ? s.ink : INK[ch], dots: screen(img, s.cell, angle, ch, s.mode === 'mono', tone) }
    })
  }, [img, s.mode, s.cell, s.angle, s.contrast, s.gamma, s.invert, s.ink])

  useEffect(() => {
    const c = out.current
    if (!c || !img) return
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = s.mode === 'mono' ? s.paper : '#ffffff'
    g.fillRect(0, 0, c.width, c.height)
    if (s.mode === 'cmyk') g.globalCompositeOperation = 'multiply'
    for (const l of layers) {
      g.fillStyle = l.color
      g.beginPath()
      for (const d of l.dots) drawDot(g, d, s.cell, s.shape, l.angle)
      g.fill()
    }
    const o = orig.current
    if (o) { o.width = img.width; o.height = img.height; o.getContext('2d')!.putImageData(img, 0, 0) }
  }, [layers, img, s.shape, s.cell, s.mode, s.paper, s.compare])

  const load = (f: File) => {
    if (!f.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => { setErr(''); setSrc(im) }
    im.onerror = () => setErr('Could not decode that image.')
    im.src = url
  }

  const svg = () => {
    if (!img) return ''
    const bg = s.mode === 'mono' ? s.paper : '#ffffff'
    const groups = layers.map((l) => `<g fill="${l.color}"${s.mode === 'cmyk' ? ' style="mix-blend-mode:multiply"' : ''}>${l.dots.map((d) => dotSvg(d, s.cell, s.shape, l.angle)).join('')}</g>`).join('\n')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}"><rect width="100%" height="100%" fill="${bg}"/>\n${groups}\n</svg>`
  }
  const dots = layers.reduce((a, l) => a + l.dots.length, 0)
  const lpi = img ? (img.width / s.cell) / 8 : 0 // at an 8-inch print width

  return (
    <Split wide="right">
      <div>
        <Panel title="Image" actions={src && <Btn kind="ghost" onClick={() => setSrc(null)}>Use demo</Btn>}>
          <FileDrop accept="image/*" onFiles={(fs) => load(fs[0])} label="Drop a photo or click to choose" />
          {err && <Note tone="err">{err}</Note>}
          <Select label="Processing width" value={s.size} onChange={(size) => set({ size })} options={[[400, '400 px (fast)'], [600, '600 px'], [900, '900 px'], [1200, '1200 px (slow)']]} />
        </Panel>
        <Panel title="Screen" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['mono', 'Single ink'], ['cmyk', 'CMYK separation']]} />
          <Slider label="Cell size" value={s.cell} onChange={(cell) => set({ cell })} min={3} max={30} unit=" px" />
          {s.mode === 'mono' ? (
            <Slider label="Screen angle" value={s.angle} onChange={(angle) => set({ angle })} min={0} max={90} unit="°" />
          ) : <p className="muted" style={{ fontSize: 13 }}>Classic angles: C 15° · M 75° · Y 0° · K 45° (avoids moiré).</p>}
          <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['circle', '● Dots'], ['square', '■ Squares'], ['diamond', '◆ Diamonds'], ['line', '≡ Lines']]} />
        </Panel>
        <Panel title="Tone">
          <Slider label="Contrast" value={s.contrast} onChange={(contrast) => set({ contrast })} min={0.3} max={3} step={0.05} />
          <Slider label="Gamma" value={s.gamma} onChange={(gamma) => set({ gamma })} min={0.3} max={3} step={0.05} />
          <Check label="Invert" value={s.invert} onChange={(invert) => set({ invert })} />
          {s.mode === 'mono' && (
            <Row>
              <label className="k-field"><span className="k-label">Ink</span><input type="color" value={s.ink} onChange={(e) => set({ ink: e.target.value })} /></label>
              <label className="k-field"><span className="k-label">Paper</span><input type="color" value={s.paper} onChange={(e) => set({ paper: e.target.value })} /></label>
              <Btn onClick={() => set({ ink: '#1e3a8a', paper: '#fef3c7' })}>Blueprint</Btn>
              <Btn onClick={() => set({ ink: '#f8fafc', paper: '#0f172a' })}>Night</Btn>
              <Btn onClick={() => set({ ink: '#be123c', paper: '#fff1f2' })}>Riso red</Btn>
            </Row>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Dots" value={num(dots, 0)} sub={`${layers.length} ${layers.length > 1 ? 'separations' : 'screen'}`} tone="accent" />
          <Stat label="Grid" value={`${img?.width ?? 0} × ${img?.height ?? 0}`} sub={`${s.cell}px cells`} />
          <Stat label="Screen ruling" value={`${num(lpi, 0)} lpi`} sub="if printed 8 in wide" />
        </Stats>
        <Panel title="Halftone" actions={<>
          <Check label="Compare" value={s.compare} onChange={(compare) => set({ compare })} />
          <Btn onClick={() => out.current?.toBlob((b) => b && download('halftone.png', b))}>⬇ PNG</Btn>
          <Btn kind="primary" onClick={() => download('halftone.svg', svg(), 'image/svg+xml')}>⬇ SVG</Btn>
        </>}>
          <div style={{ display: 'grid', gridTemplateColumns: s.compare ? '1fr 1fr' : '1fr', gap: 8 }}>
            {s.compare && <canvas ref={orig} style={{ width: '100%', height: 'auto', borderRadius: 8 }} aria-label="original image" />}
            <canvas ref={out} style={{ width: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--line)' }} aria-label="halftone result" />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Dot area is proportional to ink coverage (sampled with a 5-tap average per cell). The SVG is resolution-independent — ideal for laser cutting, screen printing or vinyl.</p>
        </Panel>
        {s.mode === 'cmyk' && (
          <Panel title="Separations">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 13 }}>
              {layers.map((l) => (
                <div key={l.ch} style={{ textAlign: 'center' }}>
                  <div style={{ height: 8, background: l.color, borderRadius: 4, marginBottom: 4 }} />
                  <b>{{ c: 'Cyan', m: 'Magenta', y: 'Yellow', k: 'Black' }[l.ch]}</b>
                  <div className="muted">{l.angle}° · {num(l.dots.length, 0)} dots</div>
                  <div className="muted">{num((l.dots.reduce((a, d) => a + d.s, 0) * s.cell * s.cell) / ((img?.width ?? 1) * (img?.height ?? 1)) * 100, 0)}% ink</div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </Split>
  )
}
