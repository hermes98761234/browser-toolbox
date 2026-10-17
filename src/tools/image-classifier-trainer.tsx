import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Btn, color, download, FileDrop, JsonButtons, LineChart, Note, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, uid, useToolState } from '../kit'
import {
  argmax, confusion, DEMO_CLASSES, features, FEATURE_LEN, fitScaler, holdout, initNet, knnPredict, netPredict, resample, scale, SIDE, synth, trainNet,
  type Net, type Scaler,
} from './lib/image-classifier-trainer'

type Kind = 'knn' | 'softmax' | 'mlp'
interface Cls { id: string; name: string; samples: string[] }
interface State { classes: Cls[]; kind: Kind; k: number; epochs: number; lr: number; hidden: number }

// samples are stored as base64 of SIDE×SIDE RGB bytes
const enc = (px: Uint8ClampedArray) => {
  let s = ''
  for (let i = 0; i < SIDE * SIDE; i++) s += String.fromCharCode(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])
  return btoa(s)
}
const dec = (b: string) => {
  const s = atob(b)
  const px = new Uint8ClampedArray(SIDE * SIDE * 4)
  for (let i = 0; i < SIDE * SIDE; i++) {
    px[i * 4] = s.charCodeAt(i * 3)
    px[i * 4 + 1] = s.charCodeAt(i * 3 + 1)
    px[i * 4 + 2] = s.charCodeAt(i * 3 + 2)
    px[i * 4 + 3] = 255
  }
  return px
}

const demoClasses = (): Cls[] => DEMO_CLASSES.map((name, c) => ({ id: name, name, samples: Array.from({ length: 20 }, (_, i) => enc(resample(synth(c, i + 1), 64, 64))) }))
const DEF: State = { classes: demoClasses(), kind: 'knn', k: 5, epochs: 60, lr: 0.02, hidden: 32 }

interface Model { kind: Kind; scaler: Scaler; names: string[]; X: number[][]; y: number[]; net?: Net; k: number; losses: number[]; valAcc: number; trainAcc: number; conf: number[][]; n: number }

function train(s: State): Model | null {
  const cls = s.classes.filter((c) => c.samples.length > 0)
  if (cls.length < 2) return null
  const Xraw: number[][] = [], y: number[] = []
  cls.forEach((c, ci) => c.samples.forEach((b) => { Xraw.push(features(dec(b))); y.push(ci) }))
  const { train: tr, val } = holdout(y, 5)
  const scaler = fitScaler(tr.map((i) => Xraw[i]))
  const X = Xraw.map((x) => scale(scaler, x))
  const nc = cls.length
  const predictWith = (net: Net | undefined, trainIdx: number[], x: number[]) =>
    net ? netPredict(net, x) : knnPredict(trainIdx.map((i) => X[i]), trainIdx.map((i) => y[i]), x, s.k, nc)
  let net: Net | undefined
  let losses: number[] = []
  if (s.kind !== 'knn') {
    net = initNet(FEATURE_LEN, s.kind === 'mlp' ? s.hidden : 0, nc)
    losses = trainNet(net, tr.map((i) => X[i]), tr.map((i) => y[i]), { epochs: s.epochs, lr: s.lr, l2: 1e-3 })
  }
  const valPred = val.map((i) => argmax(predictWith(net, tr, X[i])))
  const trainAcc = tr.filter((i) => argmax(predictWith(net, tr, X[i])) === y[i]).length / (tr.length || 1)
  // final model: KNN keeps every sample; nets were trained on the training split only (honest validation)
  const all = X.map((_, i) => i)
  return {
    kind: s.kind, scaler, names: cls.map((c) => c.name), X: s.kind === 'knn' ? all.map((i) => X[i]) : [], y: s.kind === 'knn' ? y : [], net, k: s.k, losses,
    valAcc: val.length ? valPred.filter((p, j) => p === y[val[j]]).length / val.length : NaN,
    trainAcc, conf: confusion(val.map((i) => y[i]), valPred, nc), n: X.length,
  }
}

function predict(m: Model, px: Uint8ClampedArray): number[] {
  const x = scale(m.scaler, features(px))
  return m.net ? netPredict(m.net, x) : knnPredict(m.X, m.y, x, m.k, m.names.length)
}

/** Centre-crops a source to a square and returns SIDE×SIDE RGBA. */
function grab(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  if (!w || !h) return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const side = Math.min(w, h)
  ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 64, 64)
  return resample(ctx.getImageData(0, 0, 64, 64).data, 64, 64)
}

function Thumb({ b, size = 36 }: { b: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) ctx.putImageData(new ImageData(dec(b), SIDE, SIDE), 0, 0)
  }, [b])
  return <canvas ref={ref} width={SIDE} height={SIDE} style={{ width: size, height: size, imageRendering: 'pixelated', borderRadius: 4 }} />
}

export default function ImageClassifierTrainer() {
  const [s, set, reset] = useToolState('image-classifier-trainer', DEF)
  const [model, setModel] = useState<Model | null>(() => train(s))
  const [cam, setCam] = useState<'demo' | 'camera'>('demo')
  const [camErr, setCamErr] = useState('')
  const [probs, setProbs] = useState<number[]>([])
  const [demoTruth, setDemoTruth] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const demo = useRef<HTMLCanvasElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const rec = useRef<number | null>(null)
  const modelRef = useRef(model)
  useEffect(() => { modelRef.current = model }, [model])

  const frame = (): Uint8ClampedArray | null => {
    if (cam === 'camera' && video.current) return grab(video.current, video.current.videoWidth, video.current.videoHeight)
    if (demo.current) return grab(demo.current, demo.current.width, demo.current.height)
    return null
  }
  const frameRef = useRef(frame)
  useEffect(() => { frameRef.current = frame })

  // demo stream: a new synthetic image of a random class every 1.5 s
  useEffect(() => {
    if (cam !== 'demo') return
    let n = 1000
    const draw = () => {
      const ctx = demo.current?.getContext('2d')
      if (!ctx) return
      const c = Math.floor(Math.random() * DEMO_CLASSES.length)
      ctx.putImageData(new ImageData(synth(c, n++, 64), 64, 64), 0, 0)
      setDemoTruth(c)
    }
    draw()
    const t = setInterval(draw, 1500)
    return () => clearInterval(t)
  }, [cam])

  // live prediction ~5 fps
  useEffect(() => {
    const t = setInterval(() => {
      const m = modelRef.current, px = frameRef.current()
      if (m && px) setProbs(predict(m, px))
    }, 200)
    return () => clearInterval(t)
  }, [])

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])

  const startCam = async () => {
    setCamErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setCamErr('This browser has no camera API (getUserMedia). Use photos or the demo stream.')
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
      stream.current = st
      setCam('camera')
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = st; void video.current.play() } })
    } catch (e) {
      setCamErr(`Camera unavailable: ${(e as Error).message}. The demo stream keeps working.`)
    }
  }
  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCam('demo') }

  const addSamples = (id: string, list: string[]) => set((st) => ({ ...st, classes: st.classes.map((c) => (c.id === id ? { ...c, samples: [...c.samples, ...list].slice(-200) } : c)) }))
  const snap = (id: string) => { const px = frameRef.current(); if (px) addSamples(id, [enc(px)]) }
  const startRec = (id: string) => { snap(id); rec.current = window.setInterval(() => snap(id), 150) }
  const stopRec = () => { if (rec.current) clearInterval(rec.current); rec.current = null }
  const addFiles = async (id: string, files: File[]) => {
    const out: string[] = []
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f)
        const px = grab(bmp, bmp.width, bmp.height)
        if (px) out.push(enc(px))
      } catch { /* not an image */ }
    }
    addSamples(id, out)
  }

  const total = s.classes.reduce((a, c) => a + c.samples.length, 0)
  const stale = model && (model.n !== total || model.kind !== s.kind)
  const best = probs.length ? argmax(probs) : -1
  const isDemo = useMemo(() => s.classes.map((c) => c.name).join() === DEMO_CLASSES.join(), [s.classes])

  return (
    <Split>
      <div>
        <Panel title="Input" actions={cam === 'camera' ? <Btn onClick={stopCam}>Stop camera</Btn> : <Btn kind="primary" onClick={startCam}>📷 Use webcam</Btn>}>
          <div style={{ display: 'flex', justifyContent: 'center', background: '#0f172a', borderRadius: 10, padding: 8 }}>
            {cam === 'camera' ? (
              <video ref={video} muted playsInline style={{ width: 240, height: 240, objectFit: 'cover', borderRadius: 8, transform: 'scaleX(-1)' }} />
            ) : (
              <canvas ref={demo} width={64} height={64} style={{ width: 240, height: 240, imageRendering: 'pixelated', borderRadius: 8 }} />
            )}
          </div>
          {camErr && <Note tone="warn">{camErr}</Note>}
          {cam === 'demo' && <p className="muted" style={{ fontSize: 13 }}>Demo stream: synthetic images (random colours) of a circle, stripes or a checkerboard. Showing <b>{DEMO_CLASSES[demoTruth]}</b>.</p>}
        </Panel>
        <Panel title="Classes" actions={<><Btn onClick={() => set({ classes: [...s.classes, { id: uid(), name: `Class ${s.classes.length + 1}`, samples: [] }] })}>+ Class</Btn><Btn kind="ghost" onClick={() => set({ classes: s.classes.map((c) => ({ ...c, samples: [] })) })}>Clear samples</Btn></>}>
          {s.classes.map((c, i) => (
            <div key={c.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
              <Row wrap={false}>
                <i style={{ width: 12, height: 12, borderRadius: 3, background: color(i), flex: 'none', alignSelf: 'center' }} />
                <input className="k-text" value={c.name} onChange={(e) => set({ classes: s.classes.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} aria-label="Class name" style={{ flex: 1, minWidth: 0 }} />
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.samples.length}</span>
                <Btn kind="ghost" title="Remove class" onClick={() => set({ classes: s.classes.filter((x) => x.id !== c.id) })}>✕</Btn>
              </Row>
              <Row>
                <button type="button" className="k-btn primary" onPointerDown={() => startRec(c.id)} onPointerUp={stopRec} onPointerLeave={stopRec} style={{ touchAction: 'none' }}>● Hold to record</button>
                <Btn onClick={() => snap(c.id)}>+1 frame</Btn>
                <label className="k-btn">🖼 Photos<input type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(c.id, [...(e.target.files ?? [])]); e.target.value = '' }} /></label>
              </Row>
              <div style={{ display: 'flex', gap: 3, overflowX: 'auto', marginTop: 6 }}>
                {c.samples.slice(-14).reverse().map((b, j) => <Thumb key={j + b.slice(-12)} b={b} size={30} />)}
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <div>
        <Panel title="Live prediction">
          {!model && <Note tone="warn">Add samples to at least two classes, then train.</Note>}
          {model && model.names.map((n, i) => (
            <div key={n + i} style={{ marginBottom: 8 }}>
              <Row wrap={false}>
                <b style={{ flex: 1, color: i === best ? color(s.classes.findIndex((c) => c.name === n)) : undefined }}>{i === best ? '▶ ' : ''}{n}</b>
                <span>{pct(probs[i] ?? 0, 0)}</span>
              </Row>
              <Bar value={probs[i] ?? 0} color={color(s.classes.findIndex((c) => c.name === n))} />
            </div>
          ))}
          {model && cam === 'demo' && isDemo && best >= 0 && <Note tone={best === demoTruth ? 'ok' : 'warn'}>{best === demoTruth ? 'Correct' : 'Wrong'}: the demo image is a {DEMO_CLASSES[demoTruth]}.</Note>}
          <FileDrop accept="image/*" label="Test a photo (drop or choose)" onFiles={async ([f]) => { try { const b = await createImageBitmap(f); const px = grab(b, b.width, b.height); if (px && model) setProbs(predict(model, px)) } catch { /* ignore */ } }} />
        </Panel>
        <Panel title="Train" actions={<><Btn kind="primary" onClick={() => setModel(train(s))}>⚙ Train</Btn></>}>
          <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['knn', 'k-nearest neighbours'], ['softmax', 'Softmax'], ['mlp', 'MLP']]} />
          {s.kind === 'knn' ? (
            <Slider label="k (neighbours)" value={s.k} min={1} max={15} onChange={(k) => set({ k })} />
          ) : (
            <Row>
              <Slider label="Epochs" value={s.epochs} min={10} max={300} step={10} onChange={(epochs) => set({ epochs })} />
              <Slider label="Learning rate" value={s.lr} min={0.002} max={0.1} step={0.002} onChange={(lr) => set({ lr })} />
              {s.kind === 'mlp' && <Slider label="Hidden units" value={s.hidden} min={8} max={96} step={8} onChange={(hidden) => set({ hidden })} />}
            </Row>
          )}
          {stale && <Note tone="warn">Samples or model type changed: press Train to update.</Note>}
          {model && (
            <>
              <Stats>
                <Stat label="Samples" value={model.n} sub={`${model.names.length} classes · ${FEATURE_LEN} features`} />
                <Stat label="Validation accuracy" value={pct(model.valAcc, 0)} tone={model.valAcc > 0.85 ? 'good' : model.valAcc < 0.6 ? 'bad' : 'accent'} sub="every 5th sample held out" />
                <Stat label="Training accuracy" value={pct(model.trainAcc, 0)} />
              </Stats>
              {model.losses.length > 0 && <LineChart height={160} series={[{ name: 'Cross-entropy loss', points: model.losses.map((l, i) => [i + 1, l]), area: true }]} xLabel="epoch" />}
              <h4 style={{ margin: '10px 0 4px' }}>Confusion matrix (validation)</h4>
              <div className="k-table-wrap">
                <table className="k-table">
                  <thead><tr><th>true ↓ / predicted →</th>{model.names.map((n, i) => <th key={i}>{n}</th>)}</tr></thead>
                  <tbody>
                    {model.conf.map((r, i) => (
                      <tr key={i}><td><b>{model.names[i]}</b></td>{r.map((v, j) => <td key={j} style={{ background: v ? (i === j ? 'rgba(16,185,129,.18)' : 'rgba(239,68,68,.18)') : undefined }}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Row>
            <Btn disabled={!model} onClick={() => model && download('image-classifier-model.json', JSON.stringify({ format: 'browser-toolbox-image-classifier/1', features: `${SIDE}x${SIDE} resample → 64-bin RGB histogram (sqrt) + 4x4x9 HOG + 8x8 grey`, ...model, X: model.X.map((x) => x.map((v) => +v.toFixed(4))) }), 'application/json')}>⬇ Model JSON</Btn>
            <JsonButtons name="image-classifier-dataset.json" data={s} onLoad={(d) => d && Array.isArray(d.classes) && set(d)} />
            <Btn kind="ghost" onClick={() => { reset(); setModel(train(DEF)) }}>Demo data</Btn>
          </Row>
        </Panel>
        <Note>
          <b>How it works and its limits.</b> There is no pretrained neural network here. Each image is shrunk to {SIDE}×{SIDE} px and described by a colour histogram, a HOG-style
          histogram of edge directions and a tiny grey thumbnail, then classified with k-NN or a small softmax / MLP trained in your browser. It works well for distinct,
          consistently lit things (hand signs against the same wall, coloured objects, cards) after 20 to 50 samples per class, but not for general object recognition. Nothing is uploaded.
        </Note>
      </div>
    </Split>
  )
}
