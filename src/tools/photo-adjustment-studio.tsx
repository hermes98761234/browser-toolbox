import { useEffect, useRef, useState } from 'react'
import { Btn, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'

const KEYS = ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'vibrance', 'temperature', 'tint', 'hue', 'gamma', 'sharpness', 'vignette'] as const
type Key = (typeof KEYS)[number]
type Adj = Record<Key, number>

const ZERO: Adj = { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0, gamma: 1, sharpness: 0, vignette: 0 }
const RANGE: Record<Key, [number, number, number, string]> = {
  exposure: [-2, 2, 0.05, ' EV'], brightness: [-100, 100, 1, ''], contrast: [-100, 100, 1, ''], highlights: [-100, 100, 1, ''], shadows: [-100, 100, 1, ''],
  saturation: [-100, 100, 1, ''], vibrance: [-100, 100, 1, ''], temperature: [-100, 100, 1, ''], tint: [-100, 100, 1, ''], hue: [-180, 180, 1, '°'],
  gamma: [0.3, 3, 0.01, ''], sharpness: [0, 100, 1, ''], vignette: [0, 100, 1, ''],
}
const GROUPS: [string, Key[]][] = [
  ['Light', ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'gamma']],
  ['Color', ['saturation', 'vibrance', 'temperature', 'tint', 'hue']],
  ['Detail & effects', ['sharpness', 'vignette']],
]
const PRESETS: [string, Partial<Adj>][] = [
  ['Original', {}],
  ['Vivid', { contrast: 18, saturation: 22, vibrance: 30, sharpness: 25 }],
  ['Warm', { temperature: 35, tint: 6, vibrance: 10 }],
  ['Cool', { temperature: -35, contrast: 8 }],
  ['Matte', { contrast: -22, shadows: 30, saturation: -15, brightness: 4 }],
  ['B & W', { saturation: -100, contrast: 25, sharpness: 20 }],
  ['Punchy', { exposure: 0.15, contrast: 35, highlights: -30, shadows: 25, vibrance: 35, sharpness: 40, vignette: 25 }],
  ['Faded film', { contrast: -30, saturation: -25, temperature: 15, gamma: 1.15, vignette: 35 }],
]

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`
const FS = `precision mediump float;
varying vec2 uv;
uniform sampler2D img; uniform vec2 px;
uniform float exposure, brightness, contrast, highlights, shadows, saturation, vibrance, temperature, tint, hue, gamma, sharpness, vignette, split;
vec3 hueRot(vec3 c, float a){ vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
void main(){
  vec4 o = texture2D(img, uv);
  if (uv.x < split) { gl_FragColor = o; return; }
  vec3 c = o.rgb;
  if (sharpness > 0.0) {
    vec3 b = (texture2D(img, uv + vec2(px.x, 0.0)).rgb + texture2D(img, uv - vec2(px.x, 0.0)).rgb + texture2D(img, uv + vec2(0.0, px.y)).rgb + texture2D(img, uv - vec2(0.0, px.y)).rgb) * 0.25;
    c += (c - b) * sharpness * 2.0;
  }
  c *= pow(2.0, exposure);
  c += vec3(temperature * 0.08, -tint * 0.08, -temperature * 0.08);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += shadows * 0.3 * (1.0 - smoothstep(0.0, 0.5, l)) + highlights * 0.3 * smoothstep(0.5, 1.0, l);
  c += brightness * 0.5;
  if (contrast > 0.0) c = (c - 0.5) / (1.0 - contrast * 0.95) + 0.5; else c = (c - 0.5) * (1.0 + contrast) + 0.5;
  float avg = (c.r + c.g + c.b) / 3.0;
  if (saturation > 0.0) c += (avg - c) * (1.0 - 1.0 / (1.001 - saturation)); else c += (avg - c) * (-saturation);
  float mx = max(c.r, max(c.g, c.b));
  c = mix(c, vec3(mx), clamp((mx - avg) * (-vibrance * 3.0), -1.0, 1.0));
  if (hue != 0.0) c = hueRot(c, hue);
  c = pow(max(c, 0.0), vec3(1.0 / gamma));
  float d = distance(uv, vec2(0.5)) * 1.4142;
  c *= 1.0 - vignette * smoothstep(0.35, 1.0, d);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), o.a);
}`

function sample(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 800
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 520)
  sky.addColorStop(0, '#3b6fb6')
  sky.addColorStop(0.7, '#e9b38a')
  sky.addColorStop(1, '#f6d6a8')
  g.fillStyle = sky
  g.fillRect(0, 0, 1200, 800)
  const sun = g.createRadialGradient(820, 430, 10, 820, 430, 160)
  sun.addColorStop(0, 'rgba(255,250,220,1)')
  sun.addColorStop(0.25, 'rgba(255,220,150,.8)')
  sun.addColorStop(1, 'rgba(255,200,120,0)')
  g.fillStyle = sun
  g.fillRect(600, 250, 440, 360)
  const hill = (y: number, amp: number, col: string, ph: number) => {
    g.beginPath()
    g.moveTo(0, 800)
    for (let x = 0; x <= 1200; x += 10) g.lineTo(x, y + Math.sin(x / 140 + ph) * amp + Math.sin(x / 47 + ph * 2) * amp * 0.25)
    g.lineTo(1200, 800)
    g.fillStyle = col
    g.fill()
  }
  hill(470, 30, '#6b6f8e', 1)
  hill(530, 40, '#3f6b4e', 2.4)
  hill(610, 30, '#2c4f37', 4)
  for (let i = 0; i < 18; i++) {
    const x = 40 + i * 66, y = 640 + ((i * 37) % 40)
    g.fillStyle = '#1d3a26'
    g.beginPath()
    g.moveTo(x, y - 90)
    g.lineTo(x - 22, y)
    g.lineTo(x + 22, y)
    g.fill()
  }
  const sw = ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa', '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e', '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1', '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434']
  sw.forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(40 + (i % 6) * 46, 40 + Math.floor(i / 6) * 46, 42, 42)
  })
  g.fillStyle = 'rgba(255,255,255,.85)'
  g.font = 'bold 28px system-ui, sans-serif'
  g.fillText('Sample photo — drop your own', 40, 760)
  return c
}

function uniforms(a: Adj) {
  return {
    exposure: a.exposure, brightness: a.brightness / 100, contrast: a.contrast / 100, highlights: a.highlights / 100, shadows: a.shadows / 100,
    saturation: a.saturation / 100, vibrance: a.vibrance / 100, temperature: a.temperature / 100, tint: a.tint / 100, hue: (a.hue * Math.PI) / 180,
    gamma: a.gamma, sharpness: a.sharpness / 100, vignette: a.vignette / 100,
  }
}

interface GL { gl: WebGLRenderingContext; prog: WebGLProgram; tex: WebGLTexture; max: number }

export default function PhotoAdjustmentStudio() {
  const [s, set] = useToolState('photo-adjustment-studio', { adj: { ...ZERO, contrast: 22, saturation: 20, vibrance: 30, shadows: 15, sharpness: 30, vignette: 20 } as Adj, format: 'image/jpeg' as 'image/jpeg' | 'image/png' | 'image/webp', quality: 92 })
  const adj: Adj = { ...ZERO, ...s.adj }
  const canvas = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GL | null>(null)
  const [src, setSrc] = useState<{ el: CanvasImageSource; w: number; h: number; name: string; scaled: boolean } | null>(null)
  const [split, setSplit] = useState(50)
  const [hold, setHold] = useState(false)
  const [hist, setHist] = useState<number[][]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const c = canvas.current!
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
    if (!gl) {
      setErr('WebGL is not available in this browser, so the GPU adjustments cannot run.')
      return
    }
    const sh = (type: number, code: string) => {
      const o = gl.createShader(type)!
      gl.shaderSource(o, code)
      gl.compileShader(o)
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader')
      return o
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
    glRef.current = { gl, prog, tex, max: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number }
    const sm = sample()
    setSrc({ el: sm, w: sm.width, h: sm.height, name: 'sample.jpg', scaled: false })
  }, [])

  // upload texture when the source changes
  useEffect(() => {
    const g = glRef.current
    if (!g || !src) return
    const { gl } = g
    canvas.current!.width = src.w
    canvas.current!.height = src.h
    gl.viewport(0, 0, src.w, src.h)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    let el = src.el
    if (src.scaled) {
      const c = document.createElement('canvas')
      c.width = src.w
      c.height = src.h
      c.getContext('2d')!.drawImage(src.el, 0, 0, src.w, src.h)
      el = c
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el as TexImageSource)
  }, [src])

  const key = JSON.stringify([adj, split, hold, src?.name, src?.w])
  useEffect(() => {
    const g = glRef.current
    if (!g || !src) return
    const id = requestAnimationFrame(() => {
      const { gl, prog } = g
      const u = uniforms(adj)
      for (const [k, v] of Object.entries(u)) gl.uniform1f(gl.getUniformLocation(prog, k), v)
      gl.uniform1f(gl.getUniformLocation(prog, 'split'), hold ? 2 : split / 100)
      gl.uniform2f(gl.getUniformLocation(prog, 'px'), 1 / src.w, 1 / src.h)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      // histogram from a small copy
      const sc = document.createElement('canvas')
      sc.width = 240
      sc.height = Math.max(1, Math.round((240 * src.h) / src.w))
      const x = sc.getContext('2d', { willReadFrequently: true })!
      x.drawImage(canvas.current!, 0, 0, sc.width, sc.height)
      const d = x.getImageData(0, 0, sc.width, sc.height).data
      const h = [0, 1, 2, 3].map(() => new Array<number>(64).fill(0))
      for (let i = 0; i < d.length; i += 4) {
        h[0][d[i] >> 2]++
        h[1][d[i + 1] >> 2]++
        h[2][d[i + 2] >> 2]++
        h[3][Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) >> 2]++
      }
      setHist(h)
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const load = (f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const max = glRef.current?.max ?? 4096
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      setSrc({ el: img, w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k), name: f.name, scaled: k < 1 })
      setErr('')
    }
    img.onerror = () => setErr('That file could not be decoded as an image.')
    img.src = url
  }

  const save = () => {
    const c = canvas.current
    if (!c || !src) return
    const ext = s.format.split('/')[1].replace('jpeg', 'jpg')
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = src.name.replace(/\.[^.]+$/, '') + `-edited.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, s.format, s.quality / 100)
  }

  const setA = (k: Key, v: number) => set({ adj: { ...adj, [k]: v } })
  const changed = KEYS.filter((k) => adj[k] !== ZERO[k])
  const peak = Math.max(1, ...hist.flatMap((h) => h.slice(1, 63)))
  const lum = hist[3] ?? []
  const total = lum.reduce((a, b) => a + b, 0) || 1
  const clipHi = (lum[63] ?? 0) / total, clipLo = (lum[0] ?? 0) / total
  const mean = lum.reduce((a, v, i) => a + v * (i * 4 + 2), 0) / total

  return (
    <Split wide="right">
      <div>
        <Panel title="Photo">
          <FileDrop accept="image/*" onFiles={([f]) => load(f)} label="Drop a photo or click to choose" />
          {src && <p className="muted" style={{ marginTop: 8 }}>{src.name} · {src.w} × {src.h}px{src.scaled ? ' (downscaled to GPU texture limit)' : ''}</p>}
        </Panel>
        <Panel title="Presets">
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} kind={n === 'Original' ? 'ghost' : 'normal'} onClick={() => set({ adj: { ...ZERO, ...p } })}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        {GROUPS.map(([g, keys]) => (
          <Panel key={g} title={g}>
            {keys.map((k) => {
              const [mn, mx, st, u] = RANGE[k]
              return (
                <div key={k} onDoubleClick={() => setA(k, ZERO[k])} title="Double-click to reset">
                  <Slider label={k[0].toUpperCase() + k.slice(1)} value={adj[k]} onChange={(v) => setA(k, v)} min={mn} max={mx} step={st} unit={u} show={(v) => (v > 0 && k !== 'gamma' ? '+' : '') + (st < 1 ? v.toFixed(2) : String(v))} />
                </div>
              )
            })}
          </Panel>
        ))}
      </div>
      <div>
        <Stats>
          <Stat label="Adjustments" value={changed.length} sub={changed.length ? changed.slice(0, 3).join(', ') + (changed.length > 3 ? '…' : '') : 'none yet'} />
          <Stat label="Mean luminance" value={Math.round(mean)} sub="0 – 255" />
          <Stat label="Clipped shadows" value={`${(clipLo * 100).toFixed(1)}%`} tone={clipLo > 0.02 ? 'bad' : undefined} />
          <Stat label="Clipped highlights" value={`${(clipHi * 100).toFixed(1)}%`} tone={clipHi > 0.02 ? 'bad' : undefined} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="ghost" onClick={() => set({ adj: ZERO })}>Reset all</Btn>
            </>
          }
        >
          {err && <Note tone="err">{err}</Note>}
          {hold && <span className="muted" style={{ position: 'absolute', zIndex: 1, margin: 8, padding: '2px 8px', background: '#000a', color: '#fff', borderRadius: 4 }}>Original</span>}
          <div
            style={{ position: 'relative', background: 'repeating-conic-gradient(#8882 0 25%, transparent 0 50%) 0 0/16px 16px', borderRadius: 8, overflow: 'hidden' }}
            onPointerDown={() => setHold(true)}
            onPointerUp={() => setHold(false)}
            onPointerLeave={() => setHold(false)}
          >
            <canvas ref={canvas} style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }} />
            {split > 0 && !hold && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, background: '#fff', boxShadow: '0 0 4px #0008' }} />}
          </div>
          <Slider label="Before / after split" value={split} onChange={setSplit} min={0} max={100} unit="%" show={(v) => String(v)} />
          <p className="k-hint">Press and hold the photo to see the original. Double-click a slider to reset it.</p>
        </Panel>
        <Panel title="Histogram">
          <svg viewBox="0 0 256 100" preserveAspectRatio="none" style={{ width: '100%', height: 120, background: 'var(--bg)', borderRadius: 6 }}>
            {(['#ef4444', '#22c55e', '#3b82f6', '#94a3b8'] as const).map((col, ci) => (
              <path key={col} d={`M0,100 ${(hist[ci] ?? []).map((v, i) => `L${i * 4 + 2},${100 - Math.min(100, (v / peak) * 96)}`).join(' ')} L256,100Z`} fill={col} opacity={ci === 3 ? 0.3 : 0.45} />
            ))}
          </svg>
        </Panel>
        <Panel title="Export">
          <Row>
            <Seg value={s.format} onChange={(format) => set({ format })} options={[['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} />
            <Btn kind="primary" onClick={save} disabled={!src}>⬇ Download full resolution</Btn>
          </Row>
          {s.format !== 'image/png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={40} max={100} unit="%" show={(v) => String(v)} />}
          <Note>Processing runs in a WebGL fragment shader on your GPU at the photo's full resolution. Nothing is uploaded. EXIF metadata is not copied to the export.</Note>
        </Panel>
      </div>
    </Split>
  )
}
