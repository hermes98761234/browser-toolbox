import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Btn, Note, Panel, Row, Select, Slider, Split, useToolState } from '../kit'
import { download } from '../kitlib'
import { highlight, parseControls, parseLog, rgbToHex, hexToRgb, wrapSource, type GlError } from './lib/shader-playground'

const EXAMPLES: Record<string, string> = {
  'Aurora bands': `// Layered sine bands drifting like an aurora.
uniform float speed; // @slider 0 3 1
uniform float bands; // @slider 1 12 5
uniform vec3 tint;   // @color #3ddc97

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime * speed;
  float v = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    v += sin(uv.x * bands * (1.0 + fi * 0.37) + t * (0.6 + fi * 0.2) + sin(uv.y * 3.0 + t + fi)) / (1.0 + fi);
  }
  float glow = smoothstep(0.0, 1.0, 1.0 - abs(uv.y - 0.55 - 0.15 * v * 0.3) * 3.0);
  vec3 sky = mix(vec3(0.02, 0.03, 0.08), vec3(0.05, 0.02, 0.12), uv.y);
  vec3 col = sky + tint * glow * (0.6 + 0.4 * v);
  fragColor = vec4(col, 1.0);
}
`,
  'Raymarched blobs': `// Signed-distance raymarching: two blobs melting together on a floor.
uniform float blend; // @slider 0.05 1.5 0.6
uniform float lightAngle; // @slider 0 6.283 1.2

float sdSphere(vec3 p, float r) { return length(p) - r; }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float scene(vec3 p) {
  float a = sdSphere(p - vec3(sin(iTime) * 0.9, 0.0, 0.0), 0.6);
  float b = sdSphere(p - vec3(-sin(iTime * 0.7) * 0.8, 0.2 * cos(iTime), 0.0), 0.45);
  return min(smin(a, b, blend), p.y + 0.8);
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(scene(p + e.xyy) - scene(p - e.xyy), scene(p + e.yxy) - scene(p - e.yxy), scene(p + e.yyx) - scene(p - e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.3, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    float d = scene(ro + rd * t);
    if (d < 0.001 || t > 20.0) break;
    t += d;
  }
  vec3 col = vec3(0.55, 0.65, 0.85) - rd.y * 0.3;
  if (t < 20.0) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 l = normalize(vec3(cos(lightAngle), 0.8, sin(lightAngle)));
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
    vec3 base = p.y < -0.79 ? vec3(0.8) * (0.5 + 0.5 * mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0)) : vec3(0.95, 0.35, 0.3);
    col = base * (0.15 + diff) + spec;
    col = mix(col, vec3(0.55, 0.65, 0.85), 1.0 - exp(-0.02 * t * t));
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
`,
  'Mandelbrot explorer': `// Smooth-coloured Mandelbrot set. Drag on the preview to move the focus point.
uniform float zoom; // @slider 0 8 1.5
uniform float hue;  // @slider 0 1 0.6

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831 * (vec3(1.0, 1.0, 1.0) * t + vec3(hue, hue + 0.1, hue + 0.2)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 focus = vec2(-0.745, 0.11);
  if (iMouse.z > 0.0) focus += (iMouse.xy / iResolution.xy - 0.5) * 0.5;
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec2 c = focus + uv * 2.5 * exp(-zoom);
  vec2 z = vec2(0.0);
  float n = 0.0;
  for (int i = 0; i < 300; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 256.0) break;
    n += 1.0;
  }
  vec3 col = vec3(0.0);
  if (n < 300.0) {
    float sn = n - log2(log2(dot(z, z))) + 4.0;
    col = palette(sn * 0.02 + iTime * 0.03);
  }
  fragColor = vec4(col, 1.0);
}
`,
  'Voronoi cells': `// Animated Voronoi (cellular) pattern with cell borders.
uniform float scale; // @slider 2 20 7
uniform float border; // @slider 0 0.2 0.05

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y * scale;
  vec2 cell = floor(uv);
  vec2 f = fract(uv);
  float d1 = 8.0, d2 = 8.0;
  vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.45 * sin(iTime * 0.8 + 6.2831 * hash2(cell + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; best = cell + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  vec3 col = 0.55 + 0.45 * cos(6.2831 * hash2(best).x + vec3(0.0, 2.0, 4.0));
  col *= smoothstep(border, border + 0.02, d2 - d1);
  col *= 1.0 - 0.4 * d1;
  fragColor = vec4(col, 1.0);
}
`,
  'Mouse ripples': `// Click or drag on the preview to drop a ripple.
uniform float waves; // @slider 5 80 35
uniform float damping; // @slider 0.5 8 3

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 m = iMouse.xy / iResolution.xy;
  if (iMouse.x <= 0.0 && iMouse.y <= 0.0) m = vec2(0.5);
  vec2 d = (uv - m) * vec2(iResolution.x / iResolution.y, 1.0);
  float r = length(d);
  float w = sin(r * waves - iTime * 6.0) * exp(-r * damping);
  vec2 warped = uv + normalize(d + 1e-5) * w * 0.02;
  vec2 checker = floor(warped * 12.0);
  float c = mod(checker.x + checker.y, 2.0);
  vec3 col = mix(vec3(0.1, 0.2, 0.35), vec3(0.85, 0.9, 1.0), c * 0.25 + 0.4);
  col += vec3(0.6, 0.8, 1.0) * max(w, 0.0) * 0.6;
  fragColor = vec4(col, 1.0);
}
`,
  'Full main() (raw GLSL)': `// You can also write a complete fragment shader with your own main().
precision mediump float;
uniform vec3 iResolution;
uniform float iTime;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(col, 1.0);
}
`,
}

const DEF = { example: 'Aurora bands', code: EXAMPLES['Aurora bands'], values: {} as Record<string, number[]>, scale: 1 }
const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'

const CSS = `
.sp-ed{position:relative;display:flex;background:#0d1117;border-radius:10px;border:1px solid var(--line);overflow:hidden;font:13px/20px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;height:520px}
.sp-gut{flex:none;padding:10px 0;text-align:right;color:#6e7681;background:#0b0f15;user-select:none;overflow:hidden;min-width:44px}
.sp-gut div{padding:0 8px 0 4px;height:20px}
.sp-gut div.err{background:#5c1d24;color:#ffb4b4}
.sp-wrap{position:relative;flex:1;overflow:hidden}
.sp-wrap pre,.sp-wrap textarea{position:absolute;inset:0;margin:0;padding:10px 12px;font:inherit;white-space:pre;tab-size:2;overflow:auto;border:0;box-sizing:border-box}
.sp-wrap pre{color:#d1d7e0;pointer-events:none}
.sp-wrap textarea{background:transparent;color:transparent;caret-color:#fff;resize:none;outline:none}
.sp-wrap textarea::selection{background:#264f78;color:transparent}
.sp-line-err{position:absolute;left:0;right:0;height:20px;background:rgba(248,81,73,.16);border-left:3px solid #f85149;pointer-events:none}
.g-c{color:#8b949e;font-style:italic}.g-p{color:#ff7b72}.g-n{color:#79c0ff}.g-k{color:#ff7b72}.g-t{color:#ffa657}.g-b{color:#d2a8ff}
.sp-cv{width:100%;aspect-ratio:16/10;display:block;border-radius:10px;background:#000;touch-action:none;cursor:crosshair}
.sp-errs{font:12px/1.5 ui-monospace,monospace;color:var(--err);margin:8px 0 0;padding:0;list-style:none}
.sp-errs li{cursor:pointer}
`

export default function ShaderPlayground() {
  const [s, set] = useToolState('shader-playground', DEF)
  const [errors, setErrors] = useState<GlError[]>([])
  const [paused, setPaused] = useState(false)
  const [fps, setFps] = useState({ fps: 0, t: 0 })
  const [noGl, setNoGl] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const gutRef = useRef<HTMLDivElement>(null)
  const gl = useRef<{ ctx: WebGLRenderingContext; prog: WebGLProgram | null; buf: WebGLBuffer } | null>(null)
  const mouse = useRef([0, 0, 0, 0])
  const clock = useRef({ t: 0, last: 0, frame: 0, paused: false })
  const live = useRef({ values: s.values, scale: s.scale })
  useEffect(() => { live.current = { values: s.values, scale: s.scale } }, [s.values, s.scale])
  useEffect(() => { clock.current.paused = paused }, [paused])

  const controls = useMemo(() => parseControls(s.code), [s.code])
  const ctlRef = useRef(controls)
  useEffect(() => { ctlRef.current = controls }, [controls])
  const val = (name: string, def: number[]) => s.values[name] ?? def
  const lines = s.code.split('\n').length
  const errLines = useMemo(() => new Set(errors.map((e) => e.line).filter((l) => l > 0)), [errors])

  // set up GL + render loop once
  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('webgl', { preserveDrawingBuffer: true })
    if (!ctx) { setNoGl(true); return }
    const buf = ctx.createBuffer()!
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf)
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW)
    gl.current = { ctx, prog: null, buf }
    let raf = 0
    let frames = 0, fpsT = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const c = clock.current
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0
      c.last = now
      if (c.paused) return
      c.t += dt
      c.frame++
      frames++
      if (now - fpsT > 1000) { setFps({ fps: Math.round((frames * 1000) / (now - fpsT)), t: c.t }); frames = 0; fpsT = now }
      const g = gl.current
      if (!g?.prog) return
      const dpr = Math.min(2, devicePixelRatio || 1) * live.current.scale
      const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr))
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      const x = g.ctx
      x.viewport(0, 0, w, h)
      x.useProgram(g.prog)
      const u = (n: string) => x.getUniformLocation(g.prog!, n)
      x.uniform3f(u('iResolution'), w, h, 1)
      x.uniform1f(u('iTime'), c.t)
      x.uniform1f(u('iTimeDelta'), dt)
      x.uniform1i(u('iFrame'), c.frame)
      const m = mouse.current
      x.uniform4f(u('iMouse'), m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr)
      for (const ctl of ctlRef.current) {
        const v = live.current.values[ctl.name] ?? ctl.def
        if (ctl.kind === 'slider') x.uniform1f(u(ctl.name), v[0])
        else x.uniform3f(u(ctl.name), v[0], v[1], v[2])
      }
      const loc = x.getAttribLocation(g.prog, 'p')
      x.bindBuffer(x.ARRAY_BUFFER, g.buf)
      x.enableVertexAttribArray(loc)
      x.vertexAttribPointer(loc, 2, x.FLOAT, false, 0, 0)
      x.drawArrays(x.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // compile on change (debounced); keep the last good program on failure
  useEffect(() => {
    const id = setTimeout(() => {
      const g = gl.current
      if (!g) return
      const x = g.ctx
      const { src, offset } = wrapSource(s.code)
      const compile = (type: number, text: string) => {
        const sh = x.createShader(type)!
        x.shaderSource(sh, text)
        x.compileShader(sh)
        return sh
      }
      const vs = compile(x.VERTEX_SHADER, VERT)
      const fs = compile(x.FRAGMENT_SHADER, src)
      if (!x.getShaderParameter(fs, x.COMPILE_STATUS)) {
        setErrors(parseLog(x.getShaderInfoLog(fs) ?? 'Unknown compile error', offset, lines))
        x.deleteShader(fs)
        x.deleteShader(vs)
        return
      }
      const prog = x.createProgram()!
      x.attachShader(prog, vs)
      x.attachShader(prog, fs)
      x.linkProgram(prog)
      if (!x.getProgramParameter(prog, x.LINK_STATUS)) {
        setErrors(parseLog(x.getProgramInfoLog(prog) ?? 'Link error', offset, lines))
        return
      }
      if (g.prog) x.deleteProgram(g.prog)
      g.prog = prog
      setErrors([])
    }, 350)
    return () => clearTimeout(id)
  }, [s.code, lines])

  const syncScroll = () => {
    const ta = taRef.current!
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget
    const a = ta.selectionStart, b = ta.selectionEnd
    const code = s.code.slice(0, a) + '  ' + s.code.slice(b)
    set({ code })
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = a + 2 })
  }
  const gotoLine = (line: number) => {
    const ta = taRef.current
    if (!ta || line < 1) return
    const pos = s.code.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    ta.focus()
    ta.setSelectionRange(pos, pos)
    ta.scrollTop = Math.max(0, (line - 5) * 20)
    syncScroll()
  }
  const pointer = (e: React.PointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left, y = r.height - (e.clientY - r.top)
    const m = mouse.current
    if (kind === 'down') { e.currentTarget.setPointerCapture(e.pointerId); mouse.current = [x, y, x, y] }
    else if (kind === 'move' && m[2] > 0) { m[0] = x; m[1] = y }
    else if (kind === 'up') { m[2] = -Math.abs(m[2]); m[3] = -Math.abs(m[3]) }
  }
  const exportPng = () => canvas.current?.toBlob((b) => b && download('shader.png', b, 'image/png'), 'image/png')
  const loadExample = (example: string) => set({ example, code: EXAMPLES[example], values: {} })

  return (
    <>
      <style>{CSS}</style>
      <Split wide="left">
        <Panel
          title={`Fragment shader · ${lines} lines`}
          actions={<Select label="" value={s.example} onChange={loadExample} options={Object.keys(EXAMPLES)} />}
        >
          <div className="sp-ed">
            <div className="sp-gut" ref={gutRef}>
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className={errLines.has(i + 1) ? 'err' : ''} title={errors.filter((e) => e.line === i + 1).map((e) => e.msg).join('\n') || undefined}>{i + 1}</div>
              ))}
              <div style={{ height: 40 }} />
            </div>
            <div className="sp-wrap">
              <pre ref={preRef} aria-hidden="true">
                {[...errLines].map((l) => <span key={l} className="sp-line-err" style={{ top: 10 + (l - 1) * 20 }} />)}
                <code dangerouslySetInnerHTML={{ __html: highlight(s.code) }} />
              </pre>
              <textarea
                ref={taRef} value={s.code} spellCheck={false} aria-label="GLSL source"
                onChange={(e) => set({ code: e.target.value })} onScroll={syncScroll} onKeyDown={onKey}
                autoCapitalize="off" autoCorrect="off"
              />
            </div>
          </div>
          {errors.length > 0 ? (
            <ul className="sp-errs">
              {errors.map((e, i) => <li key={i} onClick={() => gotoLine(e.line)}>{e.line > 0 ? `Line ${e.line}: ` : ''}{e.msg}</li>)}
            </ul>
          ) : (
            <Note tone="ok">Compiled OK. Write <code>mainImage(out vec4 fragColor, in vec2 fragCoord)</code> (Shadertoy style) or a full <code>main()</code>.</Note>
          )}
        </Panel>
        <div>
          <Panel
            title="Preview"
            actions={<>
              <Btn onClick={() => setPaused(!paused)}>{paused ? '▶ Play' : '⏸ Pause'}</Btn>
              <Btn onClick={() => { clock.current.t = 0; clock.current.frame = 0 }}>⟲ Time</Btn>
              <Btn kind="primary" onClick={exportPng}>⬇ PNG</Btn>
            </>}
          >
            {noGl ? <Note tone="err">WebGL is not available in this browser.</Note> : null}
            <canvas
              ref={canvas} className="sp-cv"
              onPointerDown={(e) => pointer(e, 'down')} onPointerMove={(e) => pointer(e, 'move')} onPointerUp={(e) => pointer(e, 'up')}
            />
            <Row>
              <span className="k-hint">{paused ? 'Paused' : `${fps.fps} fps`} · t ≈ {fps.t.toFixed(0)} s</span>
              <Select label="Resolution" value={s.scale} onChange={(scale) => set({ scale: Number(scale) })} options={[[0.5, '50% (fast)'], [1, '100%'], [1.5, '150%']] as const} />
            </Row>
          </Panel>
          <Panel title="Uniform controls">
            {controls.length === 0 ? (
              <Note>Add a line like <code>uniform float zoom; // @slider 0 5 1</code> (min max default) or <code>uniform vec3 tint; // @color #ff8040</code> to get a control here.</Note>
            ) : controls.map((c) => c.kind === 'slider' ? (
              <Slider key={c.name} label={c.name} value={val(c.name, c.def)[0]} min={c.min} max={c.max} step={(c.max - c.min) / 200}
                onChange={(v) => set({ values: { ...s.values, [c.name]: [v] } })} />
            ) : (
              <label key={c.name} className="k-field">
                <span className="k-label">{c.name}</span>
                <input type="color" value={rgbToHex(val(c.name, c.def))} onChange={(e) => set({ values: { ...s.values, [c.name]: hexToRgb(e.target.value) } })} />
              </label>
            ))}
            {controls.length > 0 && <Btn kind="ghost" onClick={() => set({ values: {} })}>Reset to defaults</Btn>}
          </Panel>
          <Panel title="Built-in uniforms">
            <Note>
              <code>iResolution</code> (vec3, pixels) · <code>iTime</code> (s) · <code>iTimeDelta</code> · <code>iFrame</code> (int) ·
              <code> iMouse</code> (vec4: xy = drag position, zw = click position, negative when released). Tab inserts two spaces; click an error to jump to its line.
            </Note>
          </Panel>
        </div>
      </Split>
    </>
  )
}
