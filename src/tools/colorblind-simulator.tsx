import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Note, num, Panel, Row, Seg, Slider, Split, Table, useToolState } from '../kit'
import { closestPair, CVD_INFO, deltaE, hexToRgb, matrices, rgbToHex, simulate, simulatePixels, type Algo, type Cvd } from './lib/colorblind-simulator'

const DEF = { cvd: 'deutan' as Cvd, algo: 'machado' as Algo, sev: 1, view: 'side' as 'side' | 'wipe' | 'grid', wipe: 0.5, palette: '#d62728 #2ca02c #ff7f0e #1f77b4 #9467bd #8c564b' }

// ---------- demo image ----------

function makeDemo(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 460
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 900, 460)
  // Ishihara-style plate with the number 74
  const mask = document.createElement('canvas')
  mask.width = mask.height = 400
  const mg = mask.getContext('2d')!
  mg.fillStyle = '#000'
  mg.font = 'bold 230px system-ui, sans-serif'
  mg.textAlign = 'center'
  mg.textBaseline = 'middle'
  mg.fillText('74', 200, 210)
  const md = mg.getImageData(0, 0, 400, 400).data
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const fig = ['#7da34c', '#90b25b', '#6c9944', '#a3b866'], bg = ['#e08a4e', '#d97848', '#eba56b', '#d9915d', '#c9a065']
  const circles: [number, number, number][] = []
  for (let t = 0; t < 20000 && circles.length < 1400; t++) {
    const r = 3 + rnd() * 9
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (190 - r)
    const x = 200 + d * Math.cos(a), y = 200 + d * Math.sin(a)
    if (circles.some(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) < cr + r + 1)) continue
    circles.push([x, y, r])
    const inside = md[(Math.round(y) * 400 + Math.round(x)) * 4 + 3] > 128
    const pal = inside ? fig : bg
    g.fillStyle = pal[Math.floor(rnd() * pal.length)]
    g.beginPath()
    g.arc(30 + x, 30 + y, r, 0, Math.PI * 2)
    g.fill()
  }
  // bar chart with a red/green palette
  const series = [['#d62728', [62, 48, 70, 55]], ['#2ca02c', [50, 66, 45, 72]], ['#ff7f0e', [30, 38, 52, 41]]] as const
  g.font = '15px system-ui, sans-serif'
  g.fillStyle = '#111'
  g.fillText('Quarterly sales by region', 480, 50)
  for (let q = 0; q < 4; q++) {
    series.forEach(([col, vals], k) => {
      g.fillStyle = col
      const h = vals[q] * 3.2
      g.fillRect(480 + q * 95 + k * 26, 330 - h, 22, h)
    })
    g.fillStyle = '#333'
    g.fillText(`Q${q + 1}`, 505 + q * 95, 352)
  }
  ;['North', 'South', 'East'].forEach((n, k) => {
    g.fillStyle = series[k][0]
    g.fillRect(480 + k * 110, 375, 14, 14)
    g.fillStyle = '#111'
    g.fillText(n, 500 + k * 110, 387)
  })
  // traffic light + status pills
  ;['#e53935', '#fdd835', '#43a047'].forEach((col, i) => {
    g.fillStyle = col
    g.beginPath()
    g.arc(500 + i * 50, 425, 16, 0, Math.PI * 2)
    g.fill()
  })
  ;[['#43a047', 'OK'], ['#e53935', 'Error']].forEach(([col, t], i) => {
    g.fillStyle = col
    g.fillRect(680 + i * 95, 410, 82, 30)
    g.fillStyle = '#fff'
    g.fillText(t, 700 + i * 95, 431)
  })
  return c
}

// ---------- WebGL renderer (one shared context) ----------

const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)/2.,(1.-p.y)/2.);gl_Position=vec4(p,0.,1.);}'
const FS = `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform mat3 m1;uniform mat3 m2;uniform vec3 n;
vec3 lin(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
void main(){vec4 s=texture2D(t,uv);vec3 l=lin(s.rgb);vec3 o=dot(l,n)>=0.?m1*l:m2*l;gl_FragColor=vec4(srgb(clamp(o,0.,1.)),s.a);}`

let GL: { c: HTMLCanvasElement; gl: WebGLRenderingContext; prog: WebGLProgram } | null | undefined

function getGL() {
  if (GL !== undefined) return GL
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true })
    if (!gl) return (GL = null)
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (GL = null)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
    return (GL = { c, gl, prog })
  } catch {
    return (GL = null)
  }
}

/** Draws `src` simulated into `dst` (same size), via WebGL when available, else on the CPU. */
function render(src: HTMLCanvasElement, dst: HTMLCanvasElement, cvd: Cvd | null, algo: Algo, sev: number) {
  dst.width = src.width
  dst.height = src.height
  const ctx = dst.getContext('2d')!
  if (!cvd) {
    ctx.drawImage(src, 0, 0)
    return
  }
  const R = getGL()
  if (R) {
    const { c, gl, prog } = R
    c.width = src.width
    c.height = src.height
    gl.viewport(0, 0, c.width, c.height)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    const { m1, m2, n } = matrices(cvd, algo, sev)
    const T = (m: number[]) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]] // GLSL is column-major
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'm1'), false, T(m1))
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'm2'), false, T(m2))
    gl.uniform3fv(gl.getUniformLocation(prog, 'n'), n)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    ctx.drawImage(c, 0, 0)
  } else {
    ctx.drawImage(src, 0, 0)
    const im = ctx.getImageData(0, 0, dst.width, dst.height)
    simulatePixels(im.data, cvd, algo, sev)
    ctx.putImageData(im, 0, 0)
  }
}

const ALL: (Cvd | null)[] = [null, 'protan', 'deutan', 'tritan', 'achroma']
const label = (c: Cvd | null) => (c ? CVD_INFO[c][0] : 'Normal vision')

export default function ColorblindSimulator() {
  const [s, set, reset] = useToolState('colorblind-simulator', DEF)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(() => (typeof document === 'undefined' ? null : makeDemo()))
  const [name, setName] = useState('demo plate & chart')
  const a = useRef<HTMLCanvasElement>(null)
  const b = useRef<HTMLCanvasElement>(null)
  const grid = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    if (!src) return
    if (s.view === 'grid') {
      ALL.forEach((c, i) => grid.current[i] && render(src, grid.current[i]!, c, s.algo, s.sev))
      return
    }
    if (s.view === 'side') {
      if (a.current) render(src, a.current, null, s.algo, s.sev)
      if (b.current) render(src, b.current, s.cvd, s.algo, s.sev)
      return
    }
    if (a.current) {
      const tmp = document.createElement('canvas')
      render(src, tmp, s.cvd, s.algo, s.sev)
      const cv = a.current
      cv.width = src.width
      cv.height = src.height
      const g = cv.getContext('2d')!
      g.drawImage(src, 0, 0)
      const x = Math.round(src.width * s.wipe)
      g.drawImage(tmp, 0, 0, x, src.height, 0, 0, x, src.height)
      g.fillStyle = '#fff'
      g.fillRect(x - 1, 0, 3, src.height)
    }
  }, [src, s.cvd, s.algo, s.sev, s.view, s.wipe])

  const load = (f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setSrc(c)
      setName(f.name)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const savePng = () => {
    if (!src) return
    const c = document.createElement('canvas')
    render(src, c, s.cvd, s.algo, s.sev)
    c.toBlob((bl) => {
      if (!bl) return
      const u = URL.createObjectURL(bl)
      const el = document.createElement('a')
      el.href = u
      el.download = `${name.replace(/\.[a-z]+$/i, '')}-${s.cvd}.png`
      el.click()
      setTimeout(() => URL.revokeObjectURL(u), 1000)
    }, 'image/png')
  }

  const colors = useMemo(() => s.palette.split(/[\s,;]+/).map(hexToRgb).filter((c): c is [number, number, number] => !!c).slice(0, 16), [s.palette])
  const canvasStyle = { width: '100%', height: 'auto', borderRadius: 8, display: 'block', background: '#fff' } as const

  return (
    <div>
      <Split wide="right">
        <div>
          <Panel title="Image" actions={<Btn kind="ghost" onClick={() => { reset(); setSrc(makeDemo()); setName('demo plate & chart') }}>Reset</Btn>}>
            <label className="k-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) load(f) }}>
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
              <span>🖼 Drop a screenshot or design, or click to choose</span>
            </label>
            <p className="muted" style={{ fontSize: 12 }}>Showing: {name}{src ? ` (${src.width}×${src.height})` : ''}. Images never leave your browser. Paste-from-clipboard works too: use your OS screenshot tool, save, and drop.</p>
          </Panel>
          <Panel title="Deficiency">
            <div style={{ display: 'grid', gap: 6 }}>
              {(Object.keys(CVD_INFO) as Cvd[]).map((k) => (
                <button key={k} type="button" className={`k-btn ${s.cvd === k ? 'primary' : ''}`} style={{ justifyContent: 'space-between', display: 'flex' }} onClick={() => set({ cvd: k })}>
                  <span><b>{CVD_INFO[k][0]}</b> · {CVD_INFO[k][1]}</span>
                  <span style={{ opacity: 0.75 }}>{CVD_INFO[k][2]}</span>
                </button>
              ))}
            </div>
            <Slider label="Severity" value={s.sev} onChange={(sev) => set({ sev })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
            <p className="muted" style={{ fontSize: 12 }}>100% = dichromacy (…anopia); lower values model anomalous trichromacy (…anomaly), the far more common form.</p>
            <span className="k-label">Model</span>
            <Seg value={s.algo} onChange={(algo) => set({ algo })} options={[['machado', 'Machado 2009'], ['brettel', 'Brettel 1997']]} />
          </Panel>
        </div>
        <div>
          <Panel
            title="Comparison"
            actions={
              <>
                <Seg value={s.view} onChange={(view) => set({ view })} options={[['side', 'Side by side'], ['wipe', 'Wipe'], ['grid', 'All types']]} />
                <Btn onClick={savePng}>⬇ PNG</Btn>
              </>
            }
          >
            {s.view === 'side' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <figure style={{ margin: 0 }}><canvas ref={a} style={canvasStyle} /><figcaption className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Normal vision</figcaption></figure>
                <figure style={{ margin: 0 }}><canvas ref={b} style={canvasStyle} /><figcaption className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{label(s.cvd)} · {Math.round(s.sev * 100)}%</figcaption></figure>
              </div>
            )}
            {s.view === 'wipe' && (
              <>
                <canvas ref={a} style={canvasStyle} />
                <Slider label={`◀ ${label(s.cvd)} | Normal ▶`} value={s.wipe} onChange={(wipe) => set({ wipe })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
              </>
            )}
            {s.view === 'grid' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {ALL.map((c, i) => (
                  <figure key={i} style={{ margin: 0 }}>
                    <canvas ref={(el) => { grid.current[i] = el }} style={canvasStyle} />
                    <figcaption className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{label(c)}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {!getGL() && <Note tone="warn">WebGL unavailable: using the slower CPU path.</Note>}
          </Panel>
        </div>
      </Split>
      <Panel title="Palette checker">
        <Area value={s.palette} onChange={(palette) => set({ palette })} rows={2} mono placeholder="#hex colors separated by spaces" />
        <Table
          head={['Vision', 'Swatches', 'Closest pair', 'ΔE']}
          rows={ALL.map((c) => {
            const sim = colors.map((col) => (c ? simulate(col, c, s.algo, s.sev) : col))
            const [i, j, d] = closestPair(sim)
            const tone = d < 10 ? 'var(--err)' : d < 20 ? 'var(--warn)' : 'var(--ok)'
            return [
              <b key="n">{label(c)}</b>,
              <Row key="s" wrap>
                {sim.map((x, k) => (
                  <span key={k} title={rgbToHex(x)} style={{ width: 26, height: 26, borderRadius: 6, background: rgbToHex(x), border: '1px solid var(--line)', display: 'inline-block', outline: k === i || k === j ? `2px solid ${tone}` : undefined }} />
                ))}
              </Row>,
              i >= 0 ? `${rgbToHex(colors[i])} ↔ ${rgbToHex(colors[j])}` : '—',
              <b key="d" style={{ color: tone }}>{Number.isFinite(d) ? num(d, 1) : '—'}</b>,
            ]
          })}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          ΔE is the CIE76 distance between simulated colours: under 10 the pair is easy to confuse in a chart, under 20 risky without labels or patterns. Normal-vision ΔE of the closest pair: {colors.length > 1 ? num(deltaE(colors[closestPair(colors)[0]], colors[closestPair(colors)[1]]), 1) : '—'}.
        </p>
      </Panel>
    </div>
  )
}
