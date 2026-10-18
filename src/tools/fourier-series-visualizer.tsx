import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, LineChart, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { amp, coefficients, errorStats, overshoot, partial, phase, sample, wave, type Coefs, type Wave } from './lib/fourier-series-visualizer'

interface State { kind: Wave; N: number; duty: number; custom: number[]; ghosts: boolean; speed: number; playing: boolean }

const CUSTOM_N = 128
const heart = Array.from({ length: CUSTOM_N }, (_, i) => {
  const t = i / CUSTOM_N
  return Math.round((0.8 * Math.exp(-(((t - 0.3) / 0.03) ** 2)) - 0.3 * Math.exp(-(((t - 0.34) / 0.02) ** 2)) + 0.25 * Math.exp(-(((t - 0.6) / 0.06) ** 2)) - 0.1) * 1000) / 1000
})
const DEF: State = { kind: 'square', N: 9, duty: 0.25, custom: heart, ghosts: true, speed: 0.25, playing: true }

const WAVES: [Wave, string][] = [['square', 'Square'], ['sawtooth', 'Sawtooth'], ['triangle', 'Triangle'], ['pulse', 'Pulse train'], ['halfsine', 'Half-wave rectified sine'], ['abs-sine', 'Full-wave rectified sine'], ['custom', 'Draw your own']]

function Epicycles({ c, N, speed, playing }: { c: Coefs; N: number; speed: number; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const st = useRef({ c, N, speed, playing, t: 0, trail: [] as number[] })
  useEffect(() => {
    st.current.c = c
    st.current.N = N
    st.current.speed = speed
    st.current.playing = playing
    st.current.trail = []
  }, [c, N, speed, playing])
  useEffect(() => {
    let raf = 0, last = performance.now()
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const cv = ref.current
      if (!cv) return
      const S = st.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (S.playing) S.t = (S.t + dt * S.speed) % 1
      const w = cv.clientWidth, h = cv.clientHeight
      const dpr = Math.min(2, devicePixelRatio || 1)
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, w, h)
      const total = Array.from({ length: Math.min(S.N, S.c.a.length) }, (_, i) => amp(S.c, i + 1)).reduce((a, b) => a + b, 0) || 1
      const scale = (h * 0.42) / Math.max(total, 1)
      const cx = Math.min(w * 0.25, h * 0.5), cy = h / 2 - S.c.a0 * scale
      let x = cx, y = cy
      for (let n = 1; n <= Math.min(S.N, S.c.a.length); n++) {
        const R = amp(S.c, n) * scale
        if (R < 0.15) continue
        const th = 2 * Math.PI * n * S.t + phase(S.c, n)
        g.strokeStyle = 'rgba(148,163,184,0.35)'
        g.lineWidth = 1
        g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke()
        const nx = x + R * Math.cos(th), ny = y - R * Math.sin(th)
        g.strokeStyle = '#a5b4fc'
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke()
        x = nx
        y = ny
      }
      S.trail.unshift(y)
      const x0 = cx * 2 + 10
      const maxLen = Math.max(10, Math.floor(w - x0))
      if (S.trail.length > maxLen) S.trail.length = maxLen
      g.strokeStyle = 'rgba(250,204,21,0.6)'
      g.setLineDash([4, 4])
      g.beginPath(); g.moveTo(x, y); g.lineTo(x0, y); g.stroke()
      g.setLineDash([])
      g.strokeStyle = '#facc15'
      g.lineWidth = 2
      g.beginPath()
      S.trail.forEach((yy, i) => (i ? g.lineTo(x0 + i, yy) : g.moveTo(x0, yy)))
      g.stroke()
      g.fillStyle = '#facc15'
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block', borderRadius: 10 }} aria-label="Epicycle animation" />
}

function DrawPad({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const last = useRef<[number, number] | null>(null)
  const [buf, setBuf] = useState<number[] | null>(null)
  const shown = buf ?? values
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const w = cv.clientWidth, h = cv.clientHeight
    cv.width = w * 2
    cv.height = h * 2
    const g = cv.getContext('2d')!
    g.setTransform(2, 0, 0, 2, 0, 0)
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(148,163,184,0.3)'
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke()
    g.strokeStyle = '#34d399'
    g.lineWidth = 2
    g.beginPath()
    shown.forEach((v, i) => {
      const px = ((i + 0.5) / shown.length) * w, py = h / 2 - v * (h * 0.45)
      if (i) g.lineTo(px, py)
      else g.moveTo(px, py)
    })
    g.stroke()
  }, [shown])
  const at = (e: React.PointerEvent): [number, number] => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const i = Math.max(0, Math.min(CUSTOM_N - 1, Math.floor(((e.clientX - r.left) / r.width) * CUSTOM_N)))
    const v = Math.max(-1, Math.min(1, (r.height / 2 - (e.clientY - r.top)) / (r.height * 0.45)))
    return [i, v]
  }
  const paint = (arr: number[], [i, v]: [number, number]) => {
    const prev = last.current ?? [i, v]
    const [i0, v0] = prev
    const steps = Math.abs(i - i0)
    for (let k = 0; k <= steps; k++) {
      const f = steps ? k / steps : 1
      arr[Math.round(i0 + (i - i0) * f)] = Math.round((v0 + (v - v0) * f) * 1000) / 1000
    }
    last.current = [i, v]
    return arr
  }
  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: 160, display: 'block', borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(e) => {
        ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
        last.current = null
        setBuf(paint(values.slice(), at(e)))
      }}
      onPointerMove={(e) => buf && setBuf(paint(buf.slice(), at(e)))}
      onPointerUp={() => {
        if (buf) onChange(buf)
        setBuf(null)
        last.current = null
      }}
      aria-label="Draw one period of a waveform"
    />
  )
}

export default function FourierSeriesVisualizer() {
  const [s, set, reset] = useToolState('fourier-series-visualizer', DEF)
  const NMAX = 200
  const f = useMemo(() => sample(s.kind, 2048, s.duty, s.custom), [s.kind, s.duty, s.custom])
  const c = useMemo(() => coefficients(f, NMAX), [f])
  const stats = useMemo(() => errorStats(f, c, s.N), [f, c, s.N])
  const gibbs = useMemo(() => overshoot(f, c, s.N, 3000), [f, c, s.N])
  const xs = Array.from({ length: 601 }, (_, i) => (i / 600) * 2)
  const ghostNs = [1, 3, Math.ceil(s.N / 3)].filter((n, i, a) => n < s.N && a.indexOf(n) === i)
  const series = [
    { name: 'Signal', color: '#94a3b8', points: xs.map((t) => [t, wave(s.kind, t, s.duty, s.custom)] as [number, number]) },
    ...(s.ghosts ? ghostNs.map((n, i) => ({ name: `N = ${n}`, dashed: true, color: ['#a5b4fc', '#7dd3fc', '#c4b5fd'][i], points: xs.map((t) => [t, partial(c, t, n)] as [number, number]) })) : []),
    { name: `Partial sum N = ${s.N}`, color: '#f59e0b', points: xs.map((t) => [t, partial(c, t, s.N)] as [number, number]) },
  ]
  const hasJump = ['square', 'sawtooth', 'pulse'].includes(s.kind)

  return (
    <Split>
      <div>
        <Panel title="Waveform" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select<Wave> label="Signal" value={s.kind} onChange={(kind) => set({ kind })} options={WAVES} />
          {s.kind === 'pulse' && <Slider label="Duty cycle" value={s.duty} onChange={(duty) => set({ duty })} min={0.05} max={0.95} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
          {s.kind === 'custom' && (
            <>
              <p className="muted" style={{ margin: '4px 0' }}>Draw one period (it repeats). Drag across the pad:</p>
              <DrawPad values={s.custom} onChange={(custom) => set({ custom })} />
              <Row>
                <Btn onClick={() => set({ custom: s.custom.map((_, i, a) => (a[(i - 1 + a.length) % a.length] + 2 * a[i] + a[(i + 1) % a.length]) / 4) })}>Smooth</Btn>
                <Btn onClick={() => set({ custom: Array(CUSTOM_N).fill(0) })}>Clear</Btn>
                <Btn onClick={() => set({ custom: heart })}>Heartbeat</Btn>
                <Btn onClick={() => set({ custom: Array.from({ length: CUSTOM_N }, (_, i) => (i < 32 ? i / 32 : i < 64 ? 1 : i < 96 ? 1 - (i - 64) / 16 : -1)) })}>Ramp-step</Btn>
              </Row>
            </>
          )}
          <Slider label="Harmonics N" value={s.N} onChange={(N) => set({ N })} min={1} max={NMAX} show={(v) => String(v)} />
          <Row>
            {[1, 3, 9, 25, 99].map((n) => <Btn key={n} kind="ghost" onClick={() => set({ N: n })}>N = {n}</Btn>)}
          </Row>
          <Check label="Show lower partial sums" value={s.ghosts} onChange={(ghosts) => set({ ghosts })} />
        </Panel>
        <Panel title="Epicycles" actions={<Btn onClick={() => set({ playing: !s.playing })}>{s.playing ? '⏸ Pause' : '▶ Play'}</Btn>}>
          <Epicycles c={c} N={s.N} speed={s.speed} playing={s.playing} />
          <Slider label="Speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.05} max={1} step={0.05} show={(v) => `${v.toFixed(2)} periods/s`} />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Each circle is one harmonic: radius √(aₙ² + bₙ²), spinning n times per period. The tip’s height traces the partial sum.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="RMS error" value={stats.rms.toFixed(4)} sub={`with ${s.N} harmonic${s.N > 1 ? 's' : ''}`} />
          <Stat label="Energy captured" value={`${(stats.energy * 100).toFixed(2)}%`} sub="Parseval, AC part" tone="accent" />
          <Stat label="Overshoot" value={`${(gibbs * 100).toFixed(2)}%`} sub="of the jump" tone={hasJump && gibbs > 0.08 ? 'bad' : undefined} />
          <Stat label="DC (a₀)" value={c.a0.toFixed(4)} sub="average value" />
        </Stats>
        <Panel title="Signal and partial sums (two periods)">
          <LineChart series={series} height={300} xLabel="time (periods)" fx={(v) => v.toFixed(2)} fy={(v) => v.toFixed(2)} />
        </Panel>
        {hasJump ? (
          <Note tone="warn">Gibbs phenomenon: near each jump the partial sum overshoots by about 9 % of the jump no matter how large N gets — the ripples only get narrower. Here: {(gibbs * 100).toFixed(2)}% (limit ≈ 8.95%).</Note>
        ) : (
          <Note tone="ok">This signal is continuous, so its coefficients fall off at least as 1/n² and the partial sums converge uniformly — no Gibbs overshoot.</Note>
        )}
        <Panel title="Amplitude spectrum" actions={<CsvButton name={`fourier-${s.kind}.csv`} rows={() => [['n', 'a_n', 'b_n', 'amplitude', 'phase_rad'], [0, c.a0, 0, Math.abs(c.a0), 0], ...c.a.slice(0, Math.max(s.N, 20)).map((_, i) => [i + 1, c.a[i], c.b[i], amp(c, i + 1), phase(c, i + 1)])]} />}>
          <BarChart height={200} fy={(v) => v.toFixed(2)} bars={Array.from({ length: Math.min(40, Math.max(12, s.N)) }, (_, i) => ({ label: String(i + 1), value: amp(c, i + 1), color: i < s.N ? '#6366f1' : '#94a3b8' }))} />
          <Table
            head={['n', 'aₙ (cos)', 'bₙ (sin)', '|cₙ|']}
            rows={Array.from({ length: Math.min(10, NMAX) }, (_, i) => [i + 1, c.a[i].toFixed(5), c.b[i].toFixed(5), amp(c, i + 1).toFixed(5)])}
          />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Coefficients are integrated numerically over 2 048 samples per period: aₙ = 2⟨f, cos 2πnt⟩, bₙ = 2⟨f, sin 2πnt⟩.</p>
        </Panel>
      </div>
    </Split>
  )
}
