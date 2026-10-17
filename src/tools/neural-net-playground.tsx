import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, LineChart, Note, Panel, Row, Select, Slider, Split, Stat, Stats, download, num, pct, useToolState } from '../kit'
import { createNet, epoch, evaluate, features, forward, makeData, rng, type Act, type DatasetKind, type Feature, type Net, type Pt } from './lib/neural-net-playground'

const FEATS: [Feature, string][] = [['x', 'x₁'], ['y', 'x₂'], ['x2', 'x₁²'], ['y2', 'x₂²'], ['xy', 'x₁x₂'], ['sinx', 'sin x₁'], ['siny', 'sin x₂']]
const DATASETS: [DatasetKind, string][] = [['circle', 'Circle'], ['xor', 'XOR'], ['gauss', 'Two blobs'], ['moons', 'Moons'], ['spiral', 'Spiral']]

const DEF = {
  dataset: 'circle' as DatasetKind,
  noise: 0.1,
  n: 300,
  trainRatio: 0.6,
  feats: ['x', 'y'] as Feature[],
  layers: [6, 4],
  act: 'tanh' as Act,
  lr: 0.1,
  batch: 10,
  l2: 0,
  speed: 2,
  seed: 1,
  showTest: false,
  discrete: false,
}

const G = 64 // boundary grid resolution
const C0 = [245, 158, 11] // class 0: amber
const C1 = [14, 165, 233] // class 1: sky

export default function NeuralNetPlayground() {
  const [s, set, reset] = useToolState('neural-net-playground', DEF)
  const [playing, setPlaying] = useState(true)
  const [tick, setTick] = useState(0)
  const [focus, setFocus] = useState<[number, number] | null>(null) // [layer, neuron] shown on the canvas
  const netRef = useRef<Net | null>(null)
  const hist = useRef<{ e: number; train: number; test: number; acc: number }[]>([])
  const ep = useRef(0)
  const rand = useRef(rng(1))
  const canvas = useRef<HTMLCanvasElement>(null)

  const feats = useMemo(() => (s.feats.length ? s.feats : (['x'] as Feature[])), [s.feats])
  const data = useMemo(() => {
    const pts = makeData(s.dataset, s.n, s.noise, s.seed)
    const r = rng(s.seed + 99)
    const sh = [...pts].sort(() => r() - 0.5)
    const k = Math.round(sh.length * s.trainRatio)
    return { train: sh.slice(0, k), test: sh.slice(k) }
  }, [s.dataset, s.n, s.noise, s.seed, s.trainRatio])
  const XY = useMemo(() => {
    const m = (p: Pt[]) => ({ X: p.map((q) => features(q.x, q.y, feats)), Y: p.map((q) => q.label as number) })
    return { tr: m(data.train), te: m(data.test) }
  }, [data, feats])

  const archKey = `${feats.join(',')}|${s.layers.join(',')}|${s.act}|${s.seed}|${s.dataset}|${s.n}|${s.noise}|${s.trainRatio}`
  const rebuild = useCallback(() => {
    netRef.current = createNet([feats.length, ...s.layers, 1], s.act, s.seed * 31 + Math.floor(Math.random() * 1e6))
    hist.current = []
    ep.current = 0
    rand.current = rng(s.seed + 5)
    const tr = evaluate(netRef.current, XY.tr.X, XY.tr.Y), te = evaluate(netRef.current, XY.te.X, XY.te.Y)
    hist.current.push({ e: 0, train: tr.loss, test: te.loss, acc: te.acc })
    setFocus(null)
    setTick((t) => t + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archKey, XY])
  useEffect(() => rebuild(), [rebuild])

  const step = useCallback((k: number) => {
    const net = netRef.current
    if (!net) return
    for (let i = 0; i < k; i++) {
      epoch(net, XY.tr.X, XY.tr.Y, s.lr, s.batch, s.l2, rand.current)
      ep.current++
    }
    const tr = evaluate(net, XY.tr.X, XY.tr.Y), te = evaluate(net, XY.te.X, XY.te.Y)
    hist.current.push({ e: ep.current, train: tr.loss, test: te.loss, acc: te.acc })
    if (hist.current.length > 600) hist.current = hist.current.filter((_, i) => i % 2 === 0 || i === hist.current.length - 1)
    setTick((t) => t + 1)
  }, [XY, s.lr, s.batch, s.l2])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      step(s.speed)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, step, s.speed])

  // draw boundary + points
  useEffect(() => {
    const cv = canvas.current, net = netRef.current
    if (!cv || !net) return
    const ctx = cv.getContext('2d')!
    const W = cv.width
    const img = ctx.createImageData(G, G)
    for (let gy = 0; gy < G; gy++)
      for (let gx = 0; gx < G; gx++) {
        const x = -6 + (12 * (gx + 0.5)) / G, y = 6 - (12 * (gy + 0.5)) / G
        const { a } = forward(net, features(x, y, feats))
        let v = focus ? a[focus[0]][focus[1]] : a[a.length - 1][0]
        if (focus && focus[0] < a.length - 1 && s.act !== 'sigmoid') v = (Math.tanh(v) + 1) / 2
        if (s.discrete) v = v >= 0.5 ? 1 : 0
        const t = Math.abs(v - 0.5) * 2
        const c = v >= 0.5 ? C1 : C0
        const o = (gy * G + gx) * 4
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.round(255 + (c[ch] - 255) * t * 0.75)
        img.data[o + 3] = 255
      }
    const off = document.createElement('canvas')
    off.width = off.height = G
    off.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(off, 0, 0, W, W)
    const sc = (v: number) => ((v + 6) / 12) * W
    const draw = (pts: Pt[], test: boolean) => {
      for (const p of pts) {
        ctx.beginPath()
        ctx.arc(sc(p.x), W - sc(p.y), 3.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${(p.label ? C1 : C0).join(',')})`
        ctx.fill()
        ctx.lineWidth = test ? 1.6 : 1
        ctx.strokeStyle = test ? '#111827' : '#ffffff'
        ctx.stroke()
      }
    }
    draw(data.train, false)
    if (s.showTest) draw(data.test, true)
    ctx.strokeStyle = 'rgba(0,0,0,.15)'
    ctx.beginPath()
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, W); ctx.moveTo(0, W / 2); ctx.lineTo(W, W / 2)
    ctx.stroke()
  }, [tick, focus, data, feats, s.showTest, s.discrete, s.act])

  const net = netRef.current
  const last = hist.current[hist.current.length - 1]
  const trAcc = net ? evaluate(net, XY.tr.X, XY.tr.Y).acc : 0
  const params = net ? net.W.reduce((a, m) => a + m.length * m[0].length, 0) + net.b.reduce((a, v) => a + v.length, 0) : 0
  const setLayer = (i: number, d: number) => set({ layers: s.layers.map((n, k) => (k === i ? Math.max(1, Math.min(8, n + d)) : n)) })

  // network diagram geometry
  const sizes = [feats.length, ...s.layers, 1]
  const DW = 560, DH = 240
  const nx = (l: number) => 40 + (l * (DW - 80)) / (sizes.length - 1)
  const ny = (l: number, j: number) => DH / 2 + (j - (sizes[l] - 1) / 2) * Math.min(30, (DH - 30) / Math.max(...sizes))
  const maxW = net ? Math.max(0.01, ...net.W.flat(2).map(Math.abs)) : 1

  return (
    <Split wide="right">
      <div>
        <Panel title="Data">
          <Select label="Dataset" value={s.dataset} onChange={(dataset) => set({ dataset })} options={DATASETS} />
          <Slider label="Noise" value={s.noise} min={0} max={0.8} step={0.05} onChange={(noise) => set({ noise })} />
          <Slider label="Points" value={s.n} min={50} max={600} step={50} onChange={(n) => set({ n })} />
          <Slider label="Training split" value={s.trainRatio} min={0.2} max={0.9} step={0.1} onChange={(trainRatio) => set({ trainRatio })} show={(v) => pct(v, 0)} />
          <Row>
            <Btn onClick={() => set({ seed: s.seed + 1 })}>🎲 Regenerate</Btn>
            <Check label="Show test data" value={s.showTest} onChange={(showTest) => set({ showTest })} />
          </Row>
        </Panel>
        <Panel title="Input features">
          <Row>
            {FEATS.map(([f, l]) => (
              <Check key={f} label={l} value={s.feats.includes(f)} onChange={(on) => set({ feats: on ? FEATS.map((x) => x[0]).filter((x) => x === f || s.feats.includes(x)) : s.feats.filter((x) => x !== f) })} />
            ))}
          </Row>
        </Panel>
        <Panel title="Hyper-parameters">
          <Select label="Activation" value={s.act} onChange={(act) => set({ act })} options={[['tanh', 'Tanh'], ['relu', 'ReLU'], ['sigmoid', 'Sigmoid'], ['linear', 'Linear']]} />
          <Select label="Learning rate" value={s.lr} onChange={(lr) => set({ lr })} options={[0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3]} />
          <Select label="Batch size" value={s.batch} onChange={(batch) => set({ batch })} options={[1, 5, 10, 20, 50]} />
          <Select label="L2 regularization" value={s.l2} onChange={(l2) => set({ l2 })} options={[0, 0.0001, 0.001, 0.003, 0.01, 0.03, 0.1]} />
          <Slider label="Epochs per frame" value={s.speed} min={1} max={10} onChange={(speed) => set({ speed })} />
        </Panel>
      </div>
      <div>
        <Panel
          title={`Epoch ${ep.current.toLocaleString('en-US')}`}
          actions={
            <>
              <Btn kind="primary" onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Train'}</Btn>
              <Btn onClick={() => step(1)} disabled={playing}>Step</Btn>
              <Btn onClick={rebuild}>↺ Re-init</Btn>
              <Btn kind="ghost" onClick={() => { reset(); setPlaying(true) }}>Defaults</Btn>
            </>
          }
        >
          <Stats>
            <Stat label="Test loss" value={last ? num(last.test, 3) : '—'} tone="accent" />
            <Stat label="Train loss" value={last ? num(last.train, 3) : '—'} />
            <Stat label="Test accuracy" value={last ? pct(last.acc) : '—'} tone={last && last.acc > 0.9 ? 'good' : undefined} />
            <Stat label="Train accuracy" value={pct(trAcc)} sub={`${params} parameters`} />
          </Stats>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
            <div style={{ flex: '0 1 340px', minWidth: 240 }}>
              <canvas ref={canvas} width={340} height={340} style={{ width: '100%', maxWidth: 340, aspectRatio: '1', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />
              <Row>
                <Check label="Discretize output" value={s.discrete} onChange={(discrete) => set({ discrete })} />
                <Btn kind="ghost" onClick={() => canvas.current && canvas.current.toBlob((b) => b && download('decision-boundary.png', b, 'image/png'))}>⬇ PNG</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                {focus ? `Showing hidden neuron L${focus[0]}·${focus[1] + 1}. Click it again for the output.` : 'Showing the network output. Click a neuron to see what it learned.'}
              </p>
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <LineChart
                height={220}
                xLabel="epoch"
                fx={(v) => num(v, 0)}
                fy={(v) => num(v, 2)}
                series={[
                  { name: 'Test loss', points: hist.current.map((h) => [h.e, h.test]), color: '#ef4444' },
                  { name: 'Training loss', points: hist.current.map((h) => [h.e, h.train]), color: '#6366f1' },
                ]}
              />
            </div>
          </div>
        </Panel>
        <Panel
          title="Network"
          actions={
            <>
              <Btn onClick={() => s.layers.length < 6 && set({ layers: [...s.layers, 4] })} disabled={s.layers.length >= 6}>+ Layer</Btn>
              <Btn onClick={() => set({ layers: s.layers.slice(0, -1) })} disabled={!s.layers.length}>− Layer</Btn>
            </>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${DW} ${DH + 34}`} style={{ width: '100%', minWidth: 420 }}>
              {net && net.W.map((m, l) => m.map((row, j) => row.map((w, i) => (
                <line key={`${l}-${j}-${i}`} x1={nx(l)} y1={ny(l, i)} x2={nx(l + 1)} y2={ny(l + 1, j)} stroke={w >= 0 ? '#0ea5e9' : '#f59e0b'} strokeWidth={0.4 + (Math.abs(w) / maxW) * 4} opacity={0.35 + (Math.abs(w) / maxW) * 0.6}>
                  <title>{`w = ${w.toFixed(3)}`}</title>
                </line>
              ))))}
              {sizes.map((n, l) => Array.from({ length: n }, (_, j) => {
                const on = focus && focus[0] === l && focus[1] === j
                const clickable = l > 0
                return (
                  <g key={`n${l}-${j}`} onClick={() => clickable && setFocus(on || l === sizes.length - 1 ? null : [l, j])} style={{ cursor: clickable ? 'pointer' : undefined }}>
                    <circle cx={nx(l)} cy={ny(l, j)} r={l === 0 ? 11 : 9} fill={on ? 'var(--accent)' : 'var(--panel)'} stroke="var(--fg)" strokeWidth={1.2} />
                    {l === 0 && <text x={nx(l) - 16} y={ny(l, j) + 4} textAnchor="end" fontSize={11} fill="var(--fg)">{FEATS.find((f) => f[0] === feats[j])?.[1]}</text>}
                    {net && l > 0 && <title>{`bias = ${net.b[l - 1][j].toFixed(3)}`}</title>}
                  </g>
                )
              }))}
              {sizes.map((n, l) => (
                <text key={`t${l}`} x={nx(l)} y={DH + 24} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {l === 0 ? 'input' : l === sizes.length - 1 ? 'output' : `${n} neurons`}
                </text>
              ))}
            </svg>
          </div>
          {s.layers.length > 0 && (
            <Row>
              {s.layers.map((n, i) => (
                <span key={i} className="k-btn" style={{ gap: 6, cursor: 'default' }}>
                  L{i + 1}
                  <Btn kind="ghost" onClick={() => setLayer(i, -1)} disabled={n <= 1}>−</Btn>
                  <b>{n}</b>
                  <Btn kind="ghost" onClick={() => setLayer(i, 1)} disabled={n >= 8}>+</Btn>
                </span>
              ))}
            </Row>
          )}
          <Note>
            Blue edges are positive weights, amber negative; thickness ∝ |w|. The model is a fully-connected MLP trained with mini-batch SGD and backpropagation on
            binary cross-entropy (sigmoid output). Try <b>Spiral</b> with 3 layers of 8, or <b>Circle</b> with only x₁² and x₂² and no hidden layers.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
