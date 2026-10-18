import { useEffect, useMemo } from 'react'
import { Area, BarChart, Btn, Check, color, CsvButton, download, FileDrop, fmt, Legend, LineChart, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { loadTable, range, scale } from './lib/3d-scatter-explorer'
import { adjustedRand, elbow, kmeans, sampleBlobs, silhouette, standardize, sweep } from './lib/k-means-cluster-explorer'
import { iris } from './lib/pca-visualizer'

const IRIS_CSV = (() => {
  const d = iris()
  return ['sepal_length,sepal_width,petal_length,petal_width,species', ...d.rows.map((r, i) => `${r.join(',')},${d.labels[i]}`)].join('\n')
})()
const BLOBS = sampleBlobs()

const DEF = { csv: IRIS_CSV, features: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'], x: 'petal_length', y: 'petal_width', z: 'sepal_length', k: 3, std: true, seed: 42, truth: 'species', size: 5 }
const H = 4

export default function KMeansClusterExplorer() {
  const [s, set, reset] = useToolState('k-means-cluster-explorer', DEF)
  const t = useMemo(() => loadTable(s.csv), [s.csv])
  const numNames = useMemo(() => t.numeric.map((i) => t.headers[i]), [t])
  const featKey = s.features.filter((f) => numNames.includes(f)).join('\u0001')
  const feats = useMemo(() => (featKey ? featKey.split('\u0001') : []), [featKey])

  // New CSV with other columns → pick all numeric columns
  useEffect(() => {
    if (!numNames.length || s.features.some((f) => numNames.includes(f))) return
    const cat = t.categorical.map((i) => t.headers[i]).find((h) => !numNames.includes(h)) ?? ''
    set({ features: numNames.slice(0, 6), x: numNames[0], y: numNames[1] ?? numNames[0], z: numNames[2] ?? numNames[0], truth: cat })
  }, [t, numNames, s.features, set])

  const data = useMemo(() => {
    const ci = feats.map((f) => t.headers.indexOf(f))
    const keep: number[] = []
    const X: number[][] = []
    t.rows.forEach((r, i) => {
      const v = ci.map((c) => Number(r[c]))
      if (r.length && v.every(Number.isFinite) && ci.every((c) => r[c] !== '')) {
        keep.push(i)
        X.push(v)
      }
    })
    const st = X.length ? standardize(X) : { Z: [], mean: [], sd: [] }
    return { keep, X, W: s.std ? st.Z : X, mean: st.mean, sd: st.sd }
  }, [t, feats, s.std])

  const ok = feats.length >= 1 && data.X.length >= 3
  const k = Math.min(s.k, Math.max(1, data.X.length))
  const model = useMemo(() => (ok ? kmeans(data.W, k, { seed: s.seed, restarts: 10 }) : null), [ok, data, k, s.seed])
  const sw = useMemo(() => (ok ? sweep(data.W, Math.min(10, data.X.length), s.seed) : []), [ok, data, s.seed])
  const sil = useMemo(() => (model && k > 1 ? silhouette(data.W, model.labels, k) : NaN), [model, data, k])
  const elb = sw.length ? elbow(sw) : 0
  const bestSil = sw.filter((p) => p.k > 1).reduce((b, p) => (p.silhouette > (b?.silhouette ?? -2) ? p : b), null as (typeof sw)[number] | null)
  const centroids = model ? model.centroids.map((c) => (s.std ? c.map((v, j) => v * data.sd[j] + data.mean[j]) : c)) : []
  const truthIdx = t.headers.indexOf(s.truth)
  const ari = model && truthIdx >= 0 ? adjustedRand(model.labels, data.keep.map((i) => t.rows[i][truthIdx])) : NaN

  const axisIdx = [s.x, s.y, s.z].map((a) => feats.indexOf(a))
  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'root'
      st.scene.add(g)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      if (!model || axisIdx.some((a) => a < 0)) return
      const rg = axisIdx.map((a) => range(data.X.map((r) => r[a])))
      const P = (v: number[]) => new THREE.Vector3(scale(v[axisIdx[0]], rg[0], H), scale(v[axisIdx[1]], rg[1], H) + H, -scale(v[axisIdx[2]], rg[2], H))
      const pos = new Float32Array(data.X.length * 3)
      const col = new Float32Array(data.X.length * 3)
      data.X.forEach((r, i) => {
        pos.set(P(r).toArray(), i * 3)
        const c = new THREE.Color(color(model.labels[i]))
        col.set([c.r, c.g, c.b], i * 3)
      })
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      root.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: s.size * 0.05, vertexColors: true, sizeAttenuation: true })))
      centroids.forEach((c, j) => {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: color(j), emissive: color(j), emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.4 }))
        m.position.copy(P(c))
        root.add(m)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
        ring.position.copy(m.position)
        root.add(ring)
        const l = label(`C${j + 1}`, '#ffffff', 0.45)
        l.position.copy(m.position).add(new THREE.Vector3(0, 0.6, 0))
        root.add(l)
      })
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H)), new THREE.LineBasicMaterial({ color: '#334155' }))
      box.position.y = H
      root.add(box)
      const ends: [THREE.Vector3, string, string][] = [[new THREE.Vector3(H + 0.8, 0, H), s.x, '#f87171'], [new THREE.Vector3(-H, 2 * H + 0.5, H), s.y, '#4ade80'], [new THREE.Vector3(-H, 0, -H - 0.8), s.z, '#60a5fa']]
      for (const [p, n, c] of ends) {
        const l = label(n, c, 0.5)
        l.position.copy(p)
        root.add(l)
      }
    },
    [model, data, s.x, s.y, s.z, s.size],
    { camera: [9, 8, 11], target: [0, H, 0] },
  )

  const exportRows = () => [[...t.headers, 'cluster'], ...data.keep.map((ri, i) => [...t.rows[ri], `C${model!.labels[i] + 1}`])]
  const optFeats = numNames.map((n) => [n, n] as const)

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Btn onClick={() => set({ ...DEF })}>🌸 Iris (150×4)</Btn>
            <Btn onClick={() => set({ csv: BLOBS, features: ['x', 'y', 'z'], x: 'x', y: 'y', z: 'z', k: 4, truth: 'group', std: false })}>🫧 3-D blobs</Btn>
          </Row>
          <FileDrop accept=".csv,.tsv,.txt" onFiles={async ([f]) => set({ csv: await f.text(), features: [] })} label="Drop a CSV/TSV with a header row" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={5} mono />
          <p className="muted" style={{ margin: '6px 0' }}>{t.rows.length} rows · {numNames.length} numeric columns · {data.X.length} complete rows used</p>
        </Panel>
        <Panel title="Columns to cluster on">
          <Row>
            {numNames.map((n) => (
              <Check key={n} label={n} value={feats.includes(n)} onChange={(v) => set({ features: v ? [...feats, n] : feats.filter((f) => f !== n) })} />
            ))}
          </Row>
          <Check label="Standardize columns (z-score) — recommended when units differ" value={s.std} onChange={(std) => set({ std })} />
        </Panel>
        <Panel title="Model">
          <Slider label="Clusters k" value={s.k} min={1} max={10} onChange={(k) => set({ k })} />
          <Row>
            <Btn onClick={() => set({ k: elb })} disabled={!elb}>Use elbow (k={elb})</Btn>
            <Btn onClick={() => bestSil && set({ k: bestSil.k })} disabled={!bestSil}>Use best silhouette (k={bestSil?.k ?? '—'})</Btn>
            <Btn kind="ghost" onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>🎲 Re-seed</Btn>
          </Row>
          <Note>k-means++ seeding, 10 restarts (best inertia kept), Lloyd iterations until no point changes cluster.</Note>
        </Panel>
        <Panel title="3-D view axes">
          <Row>
            <Select label="X" value={s.x} onChange={(x) => set({ x })} options={optFeats} />
            <Select label="Y (up)" value={s.y} onChange={(y) => set({ y })} options={optFeats} />
            <Select label="Z" value={s.z} onChange={(z) => set({ z })} options={optFeats} />
          </Row>
          {axisIdx.some((a) => a < 0) && <Note tone="warn">Every axis must be one of the clustered columns.</Note>}
          <Slider label="Point size" value={s.size} min={1} max={12} onChange={(size) => set({ size })} />
          <Select label="Compare with label column" value={s.truth} onChange={(truth) => set({ truth })} options={[['', '(none)'], ...t.headers.filter((h) => !numNames.includes(h)).map((h) => [h, h] as const)]} />
        </Panel>
      </div>
      <div>
        {!ok && <Note tone="err">Pick at least one numeric column and provide 3+ complete rows.</Note>}
        <Stats>
          <Stat label="Clusters" value={k} sub={model ? `${model.iterations} iterations` : ''} />
          <Stat label="Inertia (WCSS)" value={model ? fmt(model.inertia, 4) : '—'} sub={s.std ? 'in z-score units' : 'in data units'} />
          <Stat label="Silhouette" value={Number.isFinite(sil) ? sil.toFixed(3) : '—'} tone={sil > 0.5 ? 'good' : sil < 0.25 ? 'bad' : 'accent'} sub={sil > 0.7 ? 'strong structure' : sil > 0.5 ? 'reasonable' : sil > 0.25 ? 'weak' : 'no clear structure'} />
          {Number.isFinite(ari) && <Stat label={`Agreement with “${s.truth}”`} value={ari.toFixed(3)} sub="adjusted Rand index" />}
        </Stats>
        <Panel title="Point cloud">
          <View3D refEl={ref} height={440} />
          {model && <Legend items={centroids.map((_, j) => [`C${j + 1} · ${model.sizes[j]} pts`, color(j)])} />}
          <p className="muted">Octahedra with rings mark centroids. Drag to orbit, scroll to zoom.</p>
        </Panel>
        <Panel title="Choosing k">
          <LineChart series={[{ name: 'Inertia', points: sw.map((p) => [p.k, p.inertia]) }]} height={200} xLabel="k" fx={(v) => fmt(v, 0)} markers={[{ x: elb, label: `elbow k=${elb}` }]} />
          <BarChart bars={sw.filter((p) => p.k > 1).map((p) => ({ label: `k=${p.k}`, value: p.silhouette, color: p.k === k ? 'var(--accent)' : '#94a3b8' }))} height={170} fy={(v) => v.toFixed(2)} />
          <p className="muted">Bars: mean silhouette per k (higher is better). The elbow is where adding clusters stops paying off.</p>
        </Panel>
        <Panel
          title="Centroids"
          actions={
            model && (
              <>
                <CsvButton name="clustered.csv" rows={exportRows} />
                <Btn onClick={() => download('centroids.csv', toCsv([['cluster', 'size', ...feats], ...centroids.map((c, j) => [`C${j + 1}`, model.sizes[j], ...c.map((v) => +v.toFixed(6))])]), 'text/csv')}>⬇ Centroids</Btn>
              </>
            )
          }
        >
          {model && (
            <Table
              head={['Cluster', 'Size', ...feats]}
              rows={centroids.map((c, j) => [<b key="c" style={{ color: color(j) }}>C{j + 1}</b>, `${model.sizes[j]} (${((model.sizes[j] / data.X.length) * 100).toFixed(0)}%)`, ...c.map((v) => fmt(v, 4))])}
            />
          )}
          <p className="muted">Centroids are shown in original units.</p>
        </Panel>
      </div>
    </Split>
  )
}
