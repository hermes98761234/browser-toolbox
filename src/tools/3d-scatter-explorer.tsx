import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, color, download, FileDrop, fmt, Legend, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { inPolygon, loadTable, pearson, ramp, range, sampleCsv, scale } from './lib/3d-scatter-explorer'

const SAMPLE = sampleCsv()
const DEF = { csv: SAMPLE, x: 'bill_length_mm', y: 'flipper_length_mm', z: 'body_mass_g', colorBy: 'species', size: 5, axes: true }
const H = 4 // half size of the plotting cube
const GRAY = new THREE.Color('#64748b')

function dot(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(32, 32, 28, 0, Math.PI * 2)
  g.fillStyle = '#fff'
  g.fill()
  return new THREE.CanvasTexture(c)
}

export default function ScatterExplorer3D() {
  const [s, set, reset] = useToolState('3d-scatter-explorer', DEF)
  const t = useMemo(() => loadTable(s.csv), [s.csv])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [lasso, setLasso] = useState(false)
  const [path, setPath] = useState<[number, number][]>([])
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const posRef = useRef<{ idx: number[]; pos: Float32Array; pts: THREE.Points | null }>({ idx: [], pos: new Float32Array(), pts: null })

  const col = (name: string) => t.headers.indexOf(name)
  const numOpts = t.numeric.map((i) => [t.headers[i], t.headers[i]] as const)
  const ci = [col(s.x), col(s.y), col(s.z)]
  const valid = ci.every((i) => t.numeric.includes(i))
  const cc = col(s.colorBy)
  const vals = useMemo(() => [s.x, s.y, s.z].map((n) => t.headers.indexOf(n)).map((i) => t.rows.map((r) => (i >= 0 ? Number(r[i]) : NaN))), [t, s.x, s.y, s.z])
  const plotted = valid ? t.rows.filter((_, i) => vals.every((v) => Number.isFinite(v[i]))).length : 0
  const ranges = vals.map(range)
  const cats = useMemo(() => (cc >= 0 && !t.numeric.includes(cc) ? [...new Set(t.rows.map((r) => r[cc]))] : []), [t, cc])
  const numColor = cc >= 0 && t.numeric.includes(cc)

  // auto-pick axes when a new CSV has different columns
  useEffect(() => {
    if (!t.numeric.length) return
    const names = t.numeric.map((i) => t.headers[i])
    if (![s.x, s.y, s.z].every((n) => names.includes(n))) set({ x: names[0], y: names[1] ?? names[0], z: names[2] ?? names[0], colorBy: t.categorical.length ? t.headers[t.categorical[0]] : '' })
  }, [t, s.x, s.y, s.z, set])

  const ref = useStage3D(
    (stage) => {
      stageRef.current = stage
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      const ray = new THREE.Raycaster()
      ray.params.Points = { threshold: 0.12 }
      const el = stage.renderer.domElement
      const move = (e: PointerEvent) => {
        const p = posRef.current.pts
        if (!p || e.buttons) return setHover(null)
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const hit = ray.intersectObject(p)[0]
        setHover(hit?.index !== undefined ? { i: posRef.current.idx[hit.index], x: e.clientX - r.left, y: e.clientY - r.top } : null)
      }
      const leave = () => setHover(null)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerleave', leave)
      return () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerleave', leave)
      }
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      posRef.current = { idx: [], pos: new Float32Array(), pts: null }
      if (!valid) return
      const idx: number[] = []
      t.rows.forEach((_, i) => { if (vals.every((v) => Number.isFinite(v[i]))) idx.push(i) })
      const pos = new Float32Array(idx.length * 3)
      const cols = new Float32Array(idx.length * 3)
      const cr = numColor ? range(t.rows.map((r) => Number(r[cc]))) : null
      idx.forEach((ri, k) => {
        // x → X, y → up (Y), z → depth (Z)
        pos[k * 3] = scale(vals[0][ri], ranges[0], H)
        pos[k * 3 + 1] = scale(vals[1][ri], ranges[1], H) + H
        pos[k * 3 + 2] = -scale(vals[2][ri], ranges[2], H)
        let c: THREE.Color
        if (sel.size && !sel.has(ri)) c = GRAY
        else if (cr) c = new THREE.Color(...ramp((Number(t.rows[ri][cc]) - cr.min) / (cr.max - cr.min)))
        else if (cats.length) c = new THREE.Color(color(cats.indexOf(t.rows[ri][cc])))
        else c = new THREE.Color('#818cf8')
        cols.set([c.r, c.g, c.b], k * 3)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: s.size * 0.055, vertexColors: true, map: dot(), alphaTest: 0.5, transparent: true }))
      root.add(pts)
      posRef.current = { idx, pos, pts }
      if (!s.axes) return
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H)), new THREE.LineBasicMaterial({ color: '#334155' }))
      box.position.y = H
      root.add(box)
      const axes: [THREE.Vector3, THREE.Vector3, string, string][] = [
        [new THREE.Vector3(-H, 0, H), new THREE.Vector3(H, 0, H), s.x, '#f87171'],
        [new THREE.Vector3(-H, 0, H), new THREE.Vector3(-H, 2 * H, H), s.y, '#4ade80'],
        [new THREE.Vector3(-H, 0, H), new THREE.Vector3(-H, 0, -H), s.z, '#60a5fa'],
      ]
      axes.forEach(([a, b, name, c], k) => {
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: c })))
        const dir = b.clone().sub(a).normalize()
        const l = label(name, c, 0.6)
        l.position.copy(b.clone().add(dir.clone().multiplyScalar(0.6)))
        root.add(l)
        for (const f of k ? [0.5, 1] : [0, 0.5, 1]) {
          const v = ranges[k].min + f * (ranges[k].max - ranges[k].min)
          const tl = label(fmt(v, 3), '#cbd5e1', 0.42)
          const p = a.clone().lerp(b, f)
          tl.position.copy(p.add(k === 1 ? new THREE.Vector3(-0.5, 0, 0) : new THREE.Vector3(k === 2 ? -0.5 : 0, -0.3, k === 0 ? 0.3 : 0)))
          root.add(tl)
        }
      })
    },
    [t, vals, valid, cc, numColor, cats, sel, s.size, s.axes, s.x, s.y, s.z],
    { camera: [11, 10, 15], target: [0, H, 0], grid: false },
  )

  const finishLasso = (poly: [number, number][], add: boolean) => {
    const st = stageRef.current
    if (!st || poly.length < 3) return
    const { idx, pos } = posRef.current
    const el = st.renderer.domElement
    const w = el.clientWidth, h = el.clientHeight
    const v = new THREE.Vector3()
    const next = new Set(add ? sel : [])
    idx.forEach((ri, k) => {
      v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).project(st.camera)
      if (v.z < 1 && inPolygon(((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, poly)) next.add(ri)
    })
    setSel(next)
  }

  const selRows = [...sel].sort((a, b) => a - b).map((i) => t.rows[i])
  const corr = (a: number, b: number) => (valid ? fmt(pearson(vals[a], vals[b]), 2) : '—')

  return (
    <Split wide="right">
      <div>
        <Panel title="Axes & colour">
          {t.numeric.length < 1 ? (
            <Note tone="err">No numeric columns found — paste a CSV with a header row and at least three numeric columns.</Note>
          ) : (
            <>
              <Select label="X axis" value={s.x} onChange={(x) => set({ x })} options={numOpts} />
              <Select label="Y axis (up)" value={s.y} onChange={(y) => set({ y })} options={numOpts} />
              <Select label="Z axis (depth)" value={s.z} onChange={(z) => set({ z })} options={numOpts} />
              <Select label="Colour by" value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['', 'None'], ...t.headers.map((h) => [h, h] as const)]} />
              <Slider label="Point size" value={s.size} min={1} max={12} onChange={(size) => set({ size })} />
              <Check label="Show axes & box" value={s.axes} onChange={(axes) => set({ axes })} />
            </>
          )}
        </Panel>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={() => { reset(); setSel(new Set()) }}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" label="Drop a CSV / TSV file" onFiles={async ([f]) => { set({ csv: await f.text() }); setSel(new Set()) }} />
          <details style={{ marginTop: 8 }}>
            <summary>Edit CSV text ({t.rows.length} rows × {t.headers.length} columns)</summary>
            <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />
          </details>
          <p className="muted" style={{ fontSize: 13 }}>Sample: 215 penguins (simulated from Palmer Penguins species means). Delimiter is detected automatically.</p>
        </Panel>
        <Panel title="Correlation (Pearson r)">
          <Table head={['Pair', 'r']} rows={[[`${s.x} ↔ ${s.y}`, corr(0, 1)], [`${s.y} ↔ ${s.z}`, corr(1, 2)], [`${s.x} ↔ ${s.z}`, corr(0, 2)]]} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rows" value={t.rows.length} />
          <Stat label="Plotted" value={plotted} sub="rows with all 3 values" />
          <Stat label="Selected" value={sel.size} tone={sel.size ? 'accent' : undefined} />
        </Stats>
        <Panel
          title="3D view"
          actions={
            <>
              <Btn kind={lasso ? 'primary' : 'normal'} onClick={() => setLasso(!lasso)}>{lasso ? '✎ Lasso on' : '✎ Lasso select'}</Btn>
              <Btn disabled={!sel.size} onClick={() => setSel(new Set())}>Clear</Btn>
              <Btn disabled={!sel.size} onClick={() => setSel(new Set(posRef.current.idx.filter((i) => !sel.has(i))))}>Invert</Btn>
            </>
          }
        >
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={520} />
            {lasso && (
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
                onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setPath([[e.nativeEvent.offsetX, e.nativeEvent.offsetY]]) }}
                onPointerMove={(e) => { if (path.length) setPath([...path, [e.nativeEvent.offsetX, e.nativeEvent.offsetY]]) }}
                onPointerUp={(e) => { finishLasso(path, e.shiftKey); setPath([]) }}
              >
                {path.length > 1 && <polygon points={path.map((p) => p.join(',')).join(' ')} fill="rgba(99,102,241,.18)" stroke="#a5b4fc" strokeWidth={2} strokeDasharray="5 4" />}
              </svg>
            )}
            {hover && !lasso && (
              <div className="k-tip" style={{ left: Math.max(4, hover.x + 14), top: hover.y + 10, position: 'absolute', pointerEvents: 'none' }}>
                {t.headers.map((h, k) => (
                  <div key={h}>{h}: <b>{t.rows[hover.i][k]}</b></div>
                ))}
              </div>
            )}
          </div>
          {cats.length > 0 && <Legend items={cats.map((c, i) => [`${c || '(blank)'}${sel.size ? ` · ${selRows.filter((r) => r[cc] === c).length} sel.` : ''}`, color(i)])} />}
          {numColor && <div style={{ height: 10, borderRadius: 5, marginTop: 8, background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((x) => `rgb(${ramp(x).map((v) => Math.round(v * 255)).join(',')})`).join(',')})` }} />}
          {valid && (
            <p style={{ fontSize: 13, margin: '6px 0' }}>
              <b style={{ color: '#f87171' }}>X</b> {s.x} {fmt(ranges[0].min, 4)}–{fmt(ranges[0].max, 4)} · <b style={{ color: '#4ade80' }}>Y</b> {s.y} {fmt(ranges[1].min, 4)}–{fmt(ranges[1].max, 4)} · <b style={{ color: '#60a5fa' }}>Z</b> {s.z} {fmt(ranges[2].min, 4)}–{fmt(ranges[2].max, 4)}
            </p>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            Drag to orbit, scroll to zoom, right-drag to pan. Turn on <b>Lasso</b> and draw around points to select them (hold Shift to add to the selection). Hover a point to inspect it.
          </p>
        </Panel>
        <Panel title={`Selection (${sel.size})`} actions={<Btn disabled={!sel.size} onClick={() => download('selection.csv', toCsv([t.headers, ...selRows]), 'text/csv')}>⬇ Export CSV</Btn>}>
          {sel.size ? <Table head={t.headers} rows={selRows} max={15} /> : <Note>Nothing selected yet — use the lasso on the 3D view.</Note>}
          {sel.size > 0 && (
            <Row>
              {t.numeric.slice(0, 6).map((i) => {
                const v = selRows.map((r) => Number(r[i])).filter(Number.isFinite)
                return <Stat key={i} label={`mean ${t.headers[i]}`} value={v.length ? fmt(v.reduce((a, b) => a + b, 0) / v.length, 4) : '—'} />
              })}
            </Row>
          )}
        </Panel>
      </div>
    </Split>
  )
}
