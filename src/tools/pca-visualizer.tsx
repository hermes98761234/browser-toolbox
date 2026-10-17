import { useMemo } from 'react'
import { Area, Bar, BarChart, Btn, Check, color, CsvButton, Legend, Note, Panel, pct, Row, Select, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { blobs, iris, parseTable, pca, type Dataset } from './lib/pca-visualizer'

type Src = 'iris' | 'blobs' | 'custom'

const SAMPLE_CSV = `kcal,protein,fat,carbs,fiber,type
52,0.3,0.2,14,2.4,fruit
89,1.1,0.3,23,2.6,fruit
47,0.9,0.1,12,2.4,fruit
57,0.7,0.3,14,2.4,fruit
34,2.8,0.4,7,2.6,vegetable
41,0.9,0.2,10,2.8,vegetable
23,2.9,0.4,3.6,2.2,vegetable
18,0.9,0.2,3.9,1.2,vegetable
165,31,3.6,0,0,meat
250,26,15,0,0,meat
242,27,14,0,0,meat
206,22,12,0,0,fish
579,21,50,22,12.5,nut
654,15,65,14,6.7,nut
607,20,54,30,3.3,nut
130,2.7,0.3,28,0.4,grain
365,7.1,0.7,80,1.3,grain
389,17,7,66,11,grain`

const DEF = { src: 'iris' as Src, csv: SAMPLE_CSV, std: true, ax: [0, 1, 2], arrows: true, size: 0.09, stretch: false }

export default function PcaVisualizer() {
  const [s, set, reset] = useToolState('pca-visualizer', DEF)

  const data = useMemo<Dataset | string>(() => (s.src === 'iris' ? iris() : s.src === 'blobs' ? blobs() : parseTable(s.csv)), [s.src, s.csv])
  const ok = typeof data === 'object'
  const res = useMemo(() => (ok ? pca(data.rows, s.std) : null), [data, ok, s.std])
  const classes = useMemo(() => (ok ? [...new Set(data.labels)] : []), [data, ok])
  const d = ok ? data.features.length : 0
  const ax = s.ax.map((a) => Math.min(a, Math.max(0, d - 1)))
  const need95 = res ? res.cumulative.findIndex((c) => c >= 0.95) + 1 : 0

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'pca'
      st.scene.add(g)
      st.controls.autoRotate = true
      st.controls.autoRotateSpeed = 0.6
      st.renderer.domElement.addEventListener('pointerdown', () => (st.controls.autoRotate = false))
    },
    (st) => {
      const g = st.scene.getObjectByName('pca') as THREE.Group
      st.clear(g)
      if (!res || !ok) return
      const R = 4
      const pts = res.scores.map((r) => ax.map((k, i) => (i < d ? r[k] : 0)))
      const m = Math.max(1e-9, ...pts.flat().map(Math.abs))
      const per = [0, 1, 2].map((i) => (s.stretch ? R / Math.max(1e-9, ...pts.map((p) => Math.abs(p[i]))) : R / m))
      const geo = new THREE.SphereGeometry(s.size, 12, 8)
      classes.forEach((c, ci) => {
        const idx = data.labels.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0)
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: color(ci), roughness: 0.45 }), idx.length)
        const mat = new THREE.Matrix4()
        idx.forEach((i, k) => {
          const [x, y, z] = pts[i]
          mat.makeTranslation(x * per[0], z * per[2] + R, -y * per[1])
          mesh.setMatrixAt(k, mat)
        })
        g.add(mesh)
      })
      // axes (scene y is up = PC on Z axis)
      const axis = (dir: THREE.Vector3, name: string, col: string) => {
        const geom = new THREE.BufferGeometry().setFromPoints([dir.clone().multiplyScalar(-R).add(new THREE.Vector3(0, R, 0)), dir.clone().multiplyScalar(R * 1.1).add(new THREE.Vector3(0, R, 0))])
        g.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color: col })))
        const l = label(name, col, 0.4)
        l.position.copy(dir.clone().multiplyScalar(R * 1.22).add(new THREE.Vector3(0, R, 0)))
        g.add(l)
      }
      axis(new THREE.Vector3(1, 0, 0), `PC${ax[0] + 1}`, '#f87171')
      axis(new THREE.Vector3(0, 0, -1), `PC${ax[1] + 1}`, '#4ade80')
      axis(new THREE.Vector3(0, 1, 0), `PC${ax[2] + 1}`, '#60a5fa')
      if (s.arrows) {
        // biplot: loading vectors scaled so the longest reaches ~ 80 % of the axis
        const vecs = res.loadings.map((row) => ax.map((k) => row[k] * Math.sqrt(res.values[k])))
        const lm = Math.max(1e-9, ...vecs.map((v) => Math.hypot(...v)))
        vecs.forEach((v, j) => {
          const dir = new THREE.Vector3(v[0], v[2], -v[1]).multiplyScalar((R * 0.8) / lm)
          const len = dir.length()
          if (len < 1e-6) return
          const arrow = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(0, R, 0), len, 0xfacc15, Math.min(0.35, len * 0.25), 0.16)
          g.add(arrow)
          const l = label(data.features[j], '#fde68a', 0.32)
          l.position.copy(dir.clone().multiplyScalar(1.12).add(new THREE.Vector3(0, R, 0)))
          g.add(l)
        })
      }
    },
    [res, ax.join(), s.arrows, s.size, s.stretch, classes],
    { camera: [6.5, 7.5, 7], target: [0, 4, 0] },
  )

  const pcOpts = Array.from({ length: d }, (_, i) => [i, `PC${i + 1}${res ? ` (${pct(res.explained[i], 1)})` : ''}`] as [number, string])

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.src} onChange={(src) => set({ src })} options={[['iris', 'Iris (150×4)'], ['blobs', '6-D clusters'], ['custom', 'Paste CSV']]} />
          {s.src === 'custom' && (
            <div style={{ marginTop: 10 }}>
              <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono placeholder="header row, numeric columns, optional label column" />
              <p className="muted" style={{ fontSize: 12 }}>Header row required. Numeric columns become features; the first text column colours the points.</p>
            </div>
          )}
          {!ok && <Note tone="err">{data}</Note>}
          {ok && (
            <p className="muted" style={{ fontSize: 13 }}>
              {data.rows.length} rows · {d} features · {classes.length} group{classes.length === 1 ? '' : 's'}
            </p>
          )}
        </Panel>
        <Panel title="Projection">
          <Seg value={s.std ? 'cor' : 'cov'} onChange={(v) => set({ std: v === 'cor' })} options={[['cor', 'Standardize (correlation)'], ['cov', 'Raw (covariance)']]} />
          <p className="muted" style={{ fontSize: 12 }}>Standardize when features use different units, otherwise the largest-scale feature dominates PC1.</p>
          {d >= 2 && (
            <Row>
              {(['X', 'Y', 'Z'] as const).map((n, i) => (
                <Select key={n} label={`${n} axis`} value={ax[i]} onChange={(v) => set({ ax: ax.map((a, j) => (j === i ? v : a)) })} options={pcOpts} />
              ))}
            </Row>
          )}
          <Check label="Show loading vectors (biplot)" value={s.arrows} onChange={(arrows) => set({ arrows })} />
          <Check label="Stretch each axis to fill the cube (distorts true variance)" value={s.stretch} onChange={(stretch) => set({ stretch })} />
          <Slider label="Point size" value={s.size} onChange={(size) => set({ size })} min={0.03} max={0.2} step={0.01} />
        </Panel>
        {res && ok && (
          <Panel title="Explained variance">
            <BarChart bars={res.explained.map((e, i) => ({ label: `PC${i + 1}`, value: e * 100, color: i < 3 ? 'var(--accent)' : '#94a3b8' }))} fy={(v) => `${v.toFixed(0)}%`} height={200} />
            <Table head={['PC', 'Eigenvalue', 'Explained', 'Cumulative']} rows={res.values.map((v, i) => [`PC${i + 1}`, v.toFixed(4), pct(res.explained[i], 2), <div key="c" style={{ minWidth: 90 }}>{pct(res.cumulative[i], 1)}<Bar value={res.cumulative[i]} /></div>])} />
          </Panel>
        )}
      </div>

      <div>
        {res && ok && (
          <Stats>
            <Stat label="PC1 explains" value={pct(res.explained[0], 1)} tone="accent" />
            <Stat label={`Shown (${ax.map((a) => `PC${a + 1}`).join('+')})`} value={pct([...new Set(ax)].reduce((a, k) => a + res.explained[k], 0), 1)} />
            <Stat label="PCs for 95 %" value={need95} sub={`of ${d} features`} />
            <Stat label="Kaiser rule" value={s.std ? res.values.filter((v) => v > 1).length : '—'} sub={s.std ? 'eigenvalues > 1' : 'needs standardizing'} />
          </Stats>
        )}
        <Panel title="Component scatter">
          <View3D refEl={ref} height={460} />
          {ok && <Legend items={classes.map((c, i) => [c, color(i)])} />}
          <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, scroll to zoom. Yellow arrows show how each original feature points in PC space.</p>
        </Panel>
        {res && ok && (
          <Panel
            title="Loadings"
            actions={
              <CsvButton
                name="pca-scores.csv"
                rows={() => [['label', ...res.scores[0].map((_, k) => `PC${k + 1}`)], ...res.scores.map((r, i) => [data.labels[i], ...r.map((x) => +x.toFixed(6))])]}
              />
            }
          >
            <Table
              head={['Feature', ...res.loadings[0].slice(0, Math.min(d, 4)).map((_, k) => `PC${k + 1}`)]}
              rows={data.features.map((f, j) => [
                <b key="f">{f}</b>,
                ...res.loadings[j].slice(0, Math.min(d, 4)).map((x, k) => (
                  <span key={k} className="mono" style={{ display: 'inline-block', minWidth: 64, padding: '2px 6px', borderRadius: 6, background: `${x > 0 ? 'rgba(99,102,241,' : 'rgba(239,68,68,'}${Math.abs(x) * 0.55})` }}>
                    {x >= 0 ? ' ' : ''}{x.toFixed(3)}
                  </span>
                )),
              ])}
            />
            <p className="muted" style={{ fontSize: 12 }}>
              Loadings are eigenvector coefficients (unit length per PC). Blue = positive, red = negative, stronger colour = bigger weight. The CSV exports every row's scores.
            </p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
