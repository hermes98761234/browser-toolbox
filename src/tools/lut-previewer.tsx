import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { applyToPixels, blendLut, parseCube, PRESETS, toCube, type Lut } from './lib/lut-previewer'

type View = 'split' | 'before' | 'after'
const MAX_SIDE = 3000

/** Synthetic test scene: sunset landscape on top, colour chart below. */
function sampleImage(): HTMLCanvasElement {
  const W = 960, H = 640
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  const sky = x.createLinearGradient(0, 0, 0, 300)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.55, '#7c6fb0')
  sky.addColorStop(0.85, '#f59e6b')
  sky.addColorStop(1, '#fcd9a0')
  x.fillStyle = sky
  x.fillRect(0, 0, W, 300)
  const sun = x.createRadialGradient(640, 250, 10, 640, 250, 160)
  sun.addColorStop(0, 'rgba(255,248,220,1)')
  sun.addColorStop(0.18, 'rgba(255,214,140,0.9)')
  sun.addColorStop(1, 'rgba(255,170,90,0)')
  x.fillStyle = sun
  x.fillRect(0, 0, W, 300)
  const hill = (y0: number, amp: number, f: number, col: string) => {
    x.beginPath()
    x.moveTo(0, 440)
    for (let i = 0; i <= W; i += 8) x.lineTo(i, y0 + Math.sin(i * f) * amp + Math.sin(i * f * 2.7 + 1) * amp * 0.4)
    x.lineTo(W, 440)
    x.fillStyle = col
    x.fill()
  }
  hill(250, 22, 0.008, '#4b5f7a')
  hill(285, 18, 0.013, '#2f6b3f')
  const water = x.createLinearGradient(0, 300, 0, 440)
  water.addColorStop(0, '#f2b98a')
  water.addColorStop(1, '#244a6b')
  x.fillStyle = water
  x.fillRect(0, 318, W, 122)
  hill(330, 10, 0.02, '#1f3d2a')
  // a "face" with skin tones
  x.fillStyle = '#c98e6b'
  x.beginPath()
  x.ellipse(170, 330, 60, 76, 0, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#e8b896'
  x.beginPath()
  x.ellipse(158, 315, 30, 40, 0, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#3b2a20'
  x.fillRect(110, 245, 120, 30)
  // chart
  x.fillStyle = '#202020'
  x.fillRect(0, 440, W, 200)
  const gray = x.createLinearGradient(20, 0, W - 20, 0)
  gray.addColorStop(0, '#000')
  gray.addColorStop(1, '#fff')
  x.fillStyle = gray
  x.fillRect(20, 455, W - 40, 40)
  for (let i = 0; i < W - 40; i++) {
    x.fillStyle = `hsl(${(i / (W - 40)) * 360},90%,50%)`
    x.fillRect(20 + i, 505, 1, 40)
  }
  const sw = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#d1a3a4', '#e53935', '#43a047', '#1e88e5', '#fdd835', '#00acc1', '#8e24aa']
  sw.forEach((col, i) => {
    x.fillStyle = col
    x.fillRect(20 + i * ((W - 40) / 12) + 3, 555, (W - 40) / 12 - 6, 70)
  })
  return c
}

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler3D lut3; uniform sampler2D lut1;
uniform int kind; uniform float N; uniform vec3 dmin; uniform vec3 dmax;
uniform float intensity; uniform float split; uniform int mode; uniform float px;
void main(){
  vec4 src = texture(img, uv);
  vec3 c = src.rgb;
  vec3 n = clamp((c - dmin) / (dmax - dmin), 0.0, 1.0);
  vec3 t = (n * (N - 1.0) + 0.5) / N;
  vec3 g = kind == 3 ? texture(lut3, t).rgb : vec3(texture(lut1, vec2(t.r, 0.5)).r, texture(lut1, vec2(t.g, 0.5)).g, texture(lut1, vec2(t.b, 0.5)).b);
  vec3 outc = mix(c, g, intensity);
  if (mode == 1 || (mode == 0 && uv.x < split)) outc = c;
  if (mode == 0 && abs(uv.x - split) < px) outc = vec3(1.0);
  o = vec4(outc, src.a);
}`

interface GL {
  gl: WebGL2RenderingContext
  prog: WebGLProgram
  setImage: (src: TexImageSource) => void
  setLut: (l: Lut) => void
  draw: (intensity: number, split: number, mode: number) => void
}

function makeGL(canvas: HTMLCanvasElement): GL | null {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false })
  if (!gl) return null
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const tex = (unit: number, target: number) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(target, t)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(target, k, v)
    return t
  }
  const tImg = tex(0, gl.TEXTURE_2D)
  const t3 = tex(1, gl.TEXTURE_3D)
  const t1 = tex(2, gl.TEXTURE_2D)
  const u = (n: string) => gl.getUniformLocation(prog, n)
  gl.uniform1i(u('img'), 0)
  gl.uniform1i(u('lut3'), 1)
  gl.uniform1i(u('lut1'), 2)
  // placeholders so both samplers are always complete
  gl.activeTexture(gl.TEXTURE1)
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, 2, 2, 2, 0, gl.RGB, gl.FLOAT, new Float32Array(24))
  gl.activeTexture(gl.TEXTURE2)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, 2, 1, 0, gl.RGB, gl.FLOAT, new Float32Array(6))
  return {
    gl, prog,
    setImage: (src) => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tImg)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    },
    setLut: (l) => {
      if (l.kind === '3D') {
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_3D, t3)
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, l.size, l.size, l.size, 0, gl.RGB, gl.FLOAT, l.data)
      } else {
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, t1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, l.size, 1, 0, gl.RGB, gl.FLOAT, l.data)
      }
      gl.uniform1i(u('kind'), l.kind === '3D' ? 3 : 1)
      gl.uniform1f(u('N'), l.size)
      gl.uniform3fv(u('dmin'), l.min)
      gl.uniform3fv(u('dmax'), l.max)
    },
    draw: (intensity, split, mode) => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform1f(u('intensity'), intensity)
      gl.uniform1f(u('split'), split)
      gl.uniform1i(u('mode'), mode)
      gl.uniform1f(u('px'), 1.2 / canvas.width)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}

export default function LutPreviewer() {
  const [s, set] = useToolState('lut-previewer', { preset: 1, intensity: 1, split: 0.5, view: 'split' as View })
  const [custom, setCustom] = useState<{ lut: Lut; name: string; warnings: string[] } | null>(null)
  const [err, setErr] = useState('')
  const [src, setSrc] = useState<{ canvas: HTMLCanvasElement; name: string } | null>(() => (typeof document === 'undefined' ? null : { canvas: sampleImage(), name: 'sample' }))
  const [engine, setEngine] = useState<'gpu' | 'cpu' | ''>('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GL | null>(null)
  const cpuRef = useRef<{ orig: ImageData; graded: ImageData | null } | null>(null)
  const lut = useMemo(() => custom?.lut ?? PRESETS[Math.min(s.preset, PRESETS.length - 1)].make(), [custom, s.preset])
  const mode = s.view === 'split' ? 0 : s.view === 'before' ? 1 : 2

  // image → canvas / texture
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !src) return
    cv.width = src.canvas.width
    cv.height = src.canvas.height
    if (!glRef.current && engine !== 'cpu') {
      try {
        glRef.current = makeGL(cv)
      } catch {
        glRef.current = null
      }
      setEngine(glRef.current ? 'gpu' : 'cpu')
    }
    if (glRef.current) glRef.current.setImage(src.canvas)
    else cpuRef.current = { orig: src.canvas.getContext('2d')!.getImageData(0, 0, src.canvas.width, src.canvas.height), graded: null }
  }, [src, engine])

  // CPU: regrade when LUT or intensity changes
  useEffect(() => {
    if (engine !== 'cpu' || !cpuRef.current) return
    const o = cpuRef.current.orig
    cpuRef.current.graded = new ImageData(applyToPixels(lut, o.data, s.intensity), o.width, o.height)
  }, [engine, lut, s.intensity, src])

  const paint = (m: number) => {
    const g = glRef.current
    const cv = canvasRef.current
    if (!cv) return
    if (g) {
      g.setLut(lut)
      g.draw(s.intensity, s.split, m)
    } else if (cpuRef.current?.graded) {
      const ctx = cv.getContext('2d')!
      const { orig, graded } = cpuRef.current
      const sx = m === 0 ? Math.round(s.split * cv.width) : m === 1 ? cv.width : 0
      ctx.putImageData(orig, 0, 0)
      ctx.putImageData(graded, 0, 0, sx, 0, cv.width - sx, cv.height)
      if (m === 0) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(sx - 1, 0, 2, cv.height)
      }
    }
  }
  const paintRef = useRef(paint)
  useEffect(() => {
    paintRef.current = paint
  })
  useEffect(() => {
    if (src) paintRef.current(mode)
  }, [lut, s.intensity, s.split, mode, src, engine])

  const loadImage = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      setSrc({ canvas: c, name: f.name.replace(/\.[^.]+$/, '') })
      setErr('')
    } catch {
      setErr('Could not decode that image.')
    }
  }
  const loadCube = async (f: File) => {
    try {
      const r = parseCube(await f.text())
      setCustom({ lut: r.lut, name: r.lut.title || f.name, warnings: r.warnings })
      setErr('')
    } catch (e) {
      setErr(`${f.name}: ${(e as Error).message}`)
    }
  }
  const exportPng = () => {
    const cv = canvasRef.current
    if (!cv) return
    paint(2)
    cv.toBlob((b) => {
      if (b) download(`${src?.name ?? 'image'}-graded.png`, b, 'image/png')
      paint(mode)
    }, 'image/png')
  }
  const dragSplit = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (s.view !== 'split' || (e.type === 'pointermove' && !e.buttons)) return
    const r = e.currentTarget.getBoundingClientRect()
    set({ split: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) })
  }
  const name = custom ? custom.name : PRESETS[s.preset]?.name

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · Image">
          <FileDrop accept="image/*" onFiles={(f) => void loadImage(f[0])} label="Drop a photo (JPG/PNG/WebP)" />
          <Row>
            <Btn onClick={() => setSrc({ canvas: sampleImage(), name: 'sample' })}>Use test scene</Btn>
            {src && <span className="muted" style={{ fontSize: 13 }}>{src.name} · {src.canvas.width}×{src.canvas.height}</span>}
          </Row>
        </Panel>
        <Panel title="2 · LUT">
          <FileDrop accept=".cube,text/plain" onFiles={(f) => void loadCube(f[0])} label="Drop a .cube LUT (1D or 3D)" />
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 6px' }}>Built-in looks</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                type="button"
                className={`k-btn ${!custom && s.preset === i ? 'primary' : ''}`}
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => {
                  setCustom(null)
                  set({ preset: i })
                }}
                title={p.note}
              >
                {p.name}
              </button>
            ))}
          </div>
          {custom && <Note tone="ok">Using your file: <b>{custom.name}</b>{custom.warnings.length ? ` (${custom.warnings.length} warning${custom.warnings.length > 1 ? 's' : ''}: ${custom.warnings.slice(0, 2).join('; ')})` : ''}</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="3 · Adjust">
          <Slider label="Intensity" value={s.intensity} onChange={(intensity) => set({ intensity })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['split', 'Before | After'], ['before', 'Before'], ['after', 'After']]} />
          {s.view === 'split' && <Slider label="Split position" value={s.split} onChange={(split) => set({ split })} min={0} max={1} step={0.005} show={(v) => `${Math.round(v * 100)}%`} />}
        </Panel>
      </div>
      <div>
        <Panel
          title={name}
          actions={
            <>
              <Btn kind="primary" onClick={exportPng}>⬇ Graded PNG</Btn>
              <Btn onClick={() => download(`${(lut.title || 'lut').replace(/\W+/g, '-')}.cube`, toCube(blendLut({ ...lut, title: `${lut.title || 'LUT'}${s.intensity < 1 ? ` @${Math.round(s.intensity * 100)}%` : ''}` }, s.intensity)), 'text/plain')}>
                ⬇ .cube{s.intensity < 1 ? ` @${Math.round(s.intensity * 100)}%` : ''}
              </Btn>
            </>
          }
        >
          <canvas
            ref={canvasRef}
            onPointerDown={dragSplit}
            onPointerMove={dragSplit}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, cursor: s.view === 'split' ? 'ew-resize' : 'default', touchAction: 'none', background: '#000' }}
          />
          {s.view === 'split' && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>◀ original · graded ▶ — drag on the image to move the divider.</p>}
        </Panel>
        <Stats>
          <Stat label="Type" value={`${lut.kind} LUT`} sub={lut.kind === '3D' ? `${lut.size}³ = ${num(lut.size ** 3, 0)} entries` : `${lut.size} entries per channel`} />
          <Stat label="Domain" value={`${lut.min[0]}…${lut.max[0]}`} sub={`min ${lut.min.join(' / ')} · max ${lut.max.join(' / ')}`} />
          <Stat label="Renderer" value={engine === 'gpu' ? 'WebGL2' : engine === 'cpu' ? 'CPU' : '…'} sub={engine === 'gpu' ? '3D texture, hardware trilinear' : 'JS trilinear fallback'} tone="accent" />
        </Stats>
        <Note>
          {custom ? 'Your LUT is parsed locally – nothing is uploaded.' : PRESETS[s.preset]?.note} LUTs map input RGB to output RGB; most camera LUTs expect a specific log profile, so apply them to footage shot in that profile.
        </Note>
      </div>
    </Split>
  )
}
