import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Bar, Btn, Check, color, CsvButton, FileDrop, Note, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { label as makeLabel, THREE, useStage3D, View3D } from '../kit/three'
import { blobsCsv, l2normalize, neighbours, parseVectors, pca, sampleCsv, spiralCsv } from './lib/embedding-projector'

type Method = 'pca' | 'tsne'
type Dims = '2' | '3'
const DEF = { text: sampleCsv(), method: 'pca' as Method, dims: '3' as Dims, perplexity: 12, iters: 600, norm: true, labels: true, search: '' }
const MAX_TSNE = 2500
const R = 5 // layout radius in scene units

interface TsneState { key: string; Y: number[]; iter: number; kl: number; ms: number; done: boolean }

function hashText(t: string) {
  let h = 2166136261
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36) + t.length
}

/** Centre and scale an n×dims layout into a Float32Array of xyz inside radius R. */
function fit(Y: ArrayLike<number>, n: number, dims: number): Float32Array {
  const out = new Float32Array(n * 3)
  const mean = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let d = 0; d < dims; d++) mean[d] += Y[i * dims + d] / n
  let mx = 0
  for (let i = 0; i < n; i++) for (let d = 0; d < dims; d++) mx = Math.max(mx, Math.abs(Y[i * dims + d] - mean[d]))
  const k = mx ? R / mx : 1
  for (let i = 0; i < n; i++) for (let d = 0; d < dims; d++) out[i * 3 + d] = (Y[i * dims + d] - mean[d]) * k
  return out
}

function dotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(32, 32, 28, 0, Math.PI * 2)
  g.fillStyle = '#fff'
  g.fill()
  g.lineWidth = 5
  g.strokeStyle = 'rgba(0,0,0,0.45)'
  g.stroke()
  return new THREE.CanvasTexture(c)
}

export default function EmbeddingProjector() {
  const [s, set, reset] = useToolState('embedding-projector', DEF)
  const [run, setRun] = useState(0)
  const [ts, setTs] = useState<TsneState | null>(null)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const dims = Number(s.dims)

  const data = useMemo(() => parseVectors(s.text), [s.text])
  const X = useMemo(() => (s.norm ? l2normalize(data.X) : data.X), [data, s.norm])
  const n = X.length
  const pcaRes = useMemo(() => (n >= 2 ? pca(X, 3) : null), [X, n])
  const key = `${hashText(s.text)}|${s.norm}|${s.dims}|${s.perplexity}|${s.iters}|${run}`
  const tsneOk = s.method === 'tsne' && n >= 5 && n <= MAX_TSNE

  useEffect(() => {
    if (!tsneOk) return
    const w = new Worker(new URL('./lib/embedding-projector.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<Omit<TsneState, 'key'>>) => setTs({ ...e.data, key })
    w.postMessage({ X, dims, perplexity: s.perplexity, iterations: s.iters })
    return () => w.terminate()
  }, [tsneOk, key, X, dims, s.perplexity, s.iters])

  const tsCur = ts && ts.key === key ? ts : null
  const pos = useMemo(() => {
    if (!n) return new Float32Array(0)
    if (s.method === 'tsne' && tsCur) return fit(tsCur.Y, n, dims)
    if (s.method === 'tsne') return new Float32Array(n * 3) // waiting for the first frame
    const flat = pcaRes!.Y.flatMap((y) => y.slice(0, dims))
    return fit(flat, n, dims)
  }, [n, s.method, tsCur, pcaRes, dims])

  const cats = useMemo(() => (data.cats ? [...new Set(data.cats)] : []), [data])
  const q = s.search.trim().toLowerCase()
  const nb = useMemo(() => (sel !== null && sel < n ? neighbours(X, sel, 8) : []), [X, sel, n])
  const colors = useMemo(() => {
    const out = new Float32Array(n * 3)
    const c = new THREE.Color()
    const nbSet = new Set(nb.map((x) => x.j))
    for (let i = 0; i < n; i++) {
      const base = data.cats ? color(cats.indexOf(data.cats[i])) : '#60a5fa'
      const dim = (q && !data.labels[i].toLowerCase().includes(q)) || (sel !== null && i !== sel && !nbSet.has(i))
      c.set(dim ? '#334155' : base)
      out.set([c.r, c.g, c.b], i * 3)
    }
    return out
  }, [n, data, cats, q, sel, nb])

  const pointsRef = useRef<THREE.Points | null>(null)
  const labelsRef = useRef<{ key: string; group: THREE.Group } | null>(null)
  const dimsRef = useRef(0)
  const hoverRef = useRef(-1)
  const texRef = useRef<THREE.Texture | null>(null)

  const ref = useStage3D(
    (st) => {
      labelsRef.current = null
      dimsRef.current = 0
      texRef.current = dotTexture()
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const v = new THREE.Vector2()
      let down: [number, number] | null = null
      const hit = (e: PointerEvent) => {
        const p = pointsRef.current
        if (!p) return -1
        const r = el.getBoundingClientRect()
        v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.params.Points = { threshold: 0.16 * (st.camera.position.distanceTo(st.controls.target) / 13) }
        ray.setFromCamera(v, st.camera)
        return ray.intersectObject(p)[0]?.index ?? -1
      }
      const onMove = (e: PointerEvent) => {
        const i = hit(e)
        if (i === hoverRef.current && i < 0) return
        hoverRef.current = i
        const r = el.getBoundingClientRect()
        setHover(i >= 0 ? { i, x: e.clientX - r.left, y: e.clientY - r.top } : null)
      }
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
          const i = hit(e)
          setSel(i >= 0 ? i : null)
        }
        down = null
      }
      const onLeave = () => {
        hoverRef.current = -1
        setHover(null)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointerleave', onLeave)
      return () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointerleave', onLeave)
        texRef.current?.dispose()
      }
    },
    (st) => {
      let g = st.scene.getObjectByName('pts') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'pts'
        st.scene.add(g)
      }
      st.clear(g)
      if (dimsRef.current !== dims) {
        dimsRef.current = dims
        st.controls.target.set(0, 0, 0)
        if (dims === 2) st.camera.position.set(0, 0, 13)
        else st.camera.position.set(8, 6, 10)
        st.controls.enableRotate = dims === 3
      }
      if (dims === 3) {
        const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * R, 2 * R, 2 * R)), new THREE.LineBasicMaterial({ color: 0x334155 }))
        g.add(box)
        g.add(new THREE.AxesHelper(1.2))
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeBoundingSphere()
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: n > 800 ? 0.16 : 0.32, vertexColors: true, map: texRef.current, alphaTest: 0.5, sizeAttenuation: true }))
      g.add(pts)
      pointsRef.current = pts
      if (sel !== null && sel < n) {
        const a = new THREE.Vector3().fromArray(pos, sel * 3)
        const seg: number[] = []
        for (const { j } of nb) seg.push(a.x, a.y, a.z, pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2])
        const lg = new THREE.BufferGeometry()
        lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
        g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.8 })))
        const ring = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true }))
        ring.position.copy(a)
        g.add(ring)
      }
      // labels: cached sprites, only repositioned between t-SNE frames
      const showLabels = s.labels && n <= 250
      const lkey = `${data.labels.join('\u0001')}|${data.cats?.join('\u0001') ?? ''}`
      if (labelsRef.current && (labelsRef.current.key !== lkey || !showLabels)) {
        st.clear(labelsRef.current.group)
        st.scene.remove(labelsRef.current.group)
        labelsRef.current = null
      }
      if (showLabels && !labelsRef.current) {
        const lg = new THREE.Group()
        data.labels.forEach((l, i) => lg.add(makeLabel(l, data.cats ? color(cats.indexOf(data.cats[i])) : '#e2e8f0', 0.3)))
        st.scene.add(lg)
        labelsRef.current = { key: lkey, group: lg }
      }
      if (labelsRef.current) {
        const nbSet = new Set(nb.map((x) => x.j))
        labelsRef.current.group.children.forEach((sp, i) => {
          sp.position.set(pos[i * 3], pos[i * 3 + 1] + 0.3, pos[i * 3 + 2])
          sp.visible = !(q && !data.labels[i].toLowerCase().includes(q)) && (sel === null || i === sel || nbSet.has(i))
        })
      }
    },
    [pos, colors, sel, nb, s.labels, dims, q, data, cats, n],
    { camera: [8, 6, 10], grid: false, background: '#0b1222' },
  )

  const exportPng = () => {
    const c = ref.current?.querySelector('canvas')
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'embedding-projection.png'
    a.click()
  }
  const loadPreset = (text: string) => {
    setSel(null)
    set({ text, search: '' })
  }
  const ratio = pcaRes?.ratio ?? [0, 0, 0]

  return (
    <Split>
      <div>
        <Panel title="Vectors" actions={<Btn kind="ghost" onClick={() => { setSel(null); reset() }}>Reset</Btn>}>
          <Row>
            <Btn onClick={() => loadPreset(sampleCsv())}>Word sample</Btn>
            <Btn onClick={() => loadPreset(blobsCsv())}>3 blobs (5-D)</Btn>
            <Btn onClick={() => loadPreset(spiralCsv())}>Swiss roll (3-D)</Btn>
          </Row>
          <div style={{ marginTop: 8 }}>
            <FileDrop accept=".csv,.tsv,.txt,.vec" label="Drop CSV / TSV / word2vec .txt" onFiles={async ([f]) => loadPreset(await f.text())} />
          </div>
          <Area value={s.text} onChange={(text) => set({ text })} rows={7} mono placeholder="label,category,v1,v2,v3,…" />
          <p className="k-hint" style={{ margin: '4px 0 0' }}>
            One vector per line. First text cell = label, second = category (colour). Header rows are ignored.
          </p>
          {data.skipped > 0 && <Note tone="warn">{data.skipped} row(s) skipped: they don’t have {data.dim} numbers.</Note>}
          {n < 3 && <Note tone="err">Need at least 3 vectors with the same number of dimensions.</Note>}
        </Panel>
        <Panel title="Projection">
          <Row>
            <Seg value={s.method} onChange={(method) => set({ method })} options={[['pca', 'PCA'], ['tsne', 't-SNE']]} label="Method" />
            <Seg value={s.dims} onChange={(d) => set({ dims: d })} options={[['3', '3D'], ['2', '2D']]} label="Dimensions" />
          </Row>
          <Check label="L2-normalise vectors (cosine geometry)" value={s.norm} onChange={(norm) => set({ norm })} />
          {s.method === 'tsne' && (
            <>
              <Slider label="Perplexity" value={s.perplexity} onChange={(perplexity) => set({ perplexity })} min={2} max={50} />
              <Slider label="Iterations" value={s.iters} onChange={(iters) => set({ iters })} min={250} max={2000} step={50} />
              <Row>
                <Btn kind="primary" onClick={() => setRun((r) => r + 1)}>↻ Re-run</Btn>
                <span className="muted" style={{ fontSize: 13 }}>
                  {tsCur ? `${tsCur.done ? 'Done' : 'Running'} · iter ${tsCur.iter}/${s.iters} · KL ${num(tsCur.kl, 3)} · ${num(tsCur.ms / 1000, 1)} s` : tsneOk ? 'Starting worker…' : ''}
                </span>
              </Row>
              {tsCur && <Bar value={tsCur.iter} max={s.iters} />}
              {n > MAX_TSNE && <Note tone="warn">t-SNE here is exact (O(n²)); limit is {MAX_TSNE} points. Use PCA or subsample.</Note>}
              <Note>Perplexity ≈ how many neighbours each point “cares” about (5–50). It is capped at (n−1)/3. Cluster sizes and distances between clusters in t-SNE are not meaningful.</Note>
            </>
          )}
        </Panel>
        <Panel title="Explore">
          <Txt label="Search labels" value={s.search} onChange={(search) => set({ search })} placeholder="e.g. tiger" />
          <Check label="Show labels (≤ 250 points)" value={s.labels} onChange={(labels) => set({ labels })} />
          {cats.length > 0 && (
            <div className="k-legend">
              {cats.slice(0, 24).map((c, i) => (
                <span key={c}>
                  <i style={{ background: color(i) }} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Points" value={num(n, 0)} sub={`${data.dim} dimensions`} />
          <Stat label="Method" value={s.method === 'pca' ? 'PCA' : 't-SNE'} sub={`${s.dims}D projection`} tone="accent" />
          {s.method === 'tsne' ? (
            <Stat label="KL divergence" value={tsCur ? num(tsCur.kl, 3) : '…'} sub={tsCur ? `iteration ${tsCur.iter} of ${s.iters}` : 'optimising'} />
          ) : (
          <Stat label="Variance shown" value={pct(ratio.slice(0, dims).reduce((a, b) => a + b, 0))} sub={`PC1 ${pct(ratio[0], 0)} · PC2 ${pct(ratio[1], 0)}${dims === 3 ? ` · PC3 ${pct(ratio[2], 0)}` : ''}`} />
          )}
        </Stats>
        <Panel
          title="Projection view"
          actions={
            <>
              <Btn onClick={exportPng}>⬇ PNG</Btn>
              <CsvButton name="projection.csv" rows={() => [['label', 'category', 'x', 'y', ...(dims === 3 ? ['z'] : [])], ...data.labels.map((l, i) => [l, data.cats?.[i] ?? '', ...Array.from(pos.slice(i * 3, i * 3 + dims), (v) => +v.toFixed(4))])]} />
            </>
          }
        >
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={480} />
            {hover && hover.i < n && (
              <div className="k-tip" style={{ left: Math.max(4, hover.x + 14), top: hover.y + 10, pointerEvents: 'none' }}>
                <b>{data.labels[hover.i]}</b>
                {data.cats && <span className="muted"> · {data.cats[hover.i]}</span>}
              </div>
            )}
          </div>
          <p className="k-hint" style={{ margin: '6px 0 0' }}>Drag to {dims === 3 ? 'rotate' : 'pan'}, scroll to zoom, hover for labels, click a point for its nearest neighbours.</p>
        </Panel>
        <Panel title={sel !== null && sel < n ? `Nearest neighbours of “${data.labels[sel]}”` : 'Nearest neighbours'} actions={sel !== null ? <Btn kind="ghost" onClick={() => setSel(null)}>Clear</Btn> : undefined}>
          {sel === null || sel >= n ? (
            <Row>
              <span className="muted">Click a point, or pick one:</span>
              {data.labels.slice(0, 6).map((l, i) => (
                <Btn key={i} onClick={() => setSel(i)}>{l}</Btn>
              ))}
            </Row>
          ) : (
            <>
              {nb.map(({ j, sim }) => (
                <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 54px', gap: 10, alignItems: 'center', marginBottom: 4, cursor: 'pointer' }} onClick={() => setSel(j)}>
                  <span>
                    <b>{data.labels[j]}</b> {data.cats && <span className="muted">· {data.cats[j]}</span>}
                  </span>
                  <Bar value={Math.max(0, sim)} max={1} color={data.cats ? color(cats.indexOf(data.cats[j])) : undefined} />
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sim.toFixed(3)}</span>
                </div>
              ))}
              <p className="k-hint">Cosine similarity in the original {data.dim}-D space (not the projection).</p>
            </>
          )}
        </Panel>
        <Note>
          PCA is linear and preserves global structure; t-SNE (exact, in a Web Worker) preserves local neighbourhoods. UMAP isn’t bundled here — for most exploratory work t-SNE with perplexity 10–30 shows the same clusters.
        </Note>
      </div>
    </Split>
  )
}
