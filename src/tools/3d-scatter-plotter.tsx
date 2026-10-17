import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, color, fmt, JsonButtons, niceTicks, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { bounds, fitPlane, parametric, parsePoints, surface, type P3 } from './lib/3d-scatter-plotter'

type Kind = 'points' | 'param' | 'surface'
type Marker = 'sphere' | 'cube' | 'diamond'
interface Series {
  id: string; name: string; color: string; kind: Kind; visible: boolean; marker: Marker; size: number; line: boolean
  text: string; fx: string; fy: string; fz: string; t0: number; t1: number; n: number
  fs: string; x0: number; x1: number; y0: number; y1: number
}

function noisy(): string {
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2
  const rows = ['# x, y, z — temperature, humidity, yield']
  for (let i = 0; i < 40; i++) {
    const x = +(2 + Math.abs(r()) * 6).toFixed(2), y = +(1 + Math.abs(r()) * 5).toFixed(2)
    rows.push(`${x}, ${y}, ${(2 + 0.5 * x - 0.3 * y + r() * 0.5).toFixed(2)}`)
  }
  return rows.join('\n')
}

const base = (p: Partial<Series>): Series => ({
  id: uid(), name: 'Series', color: color(0), kind: 'points', visible: true, marker: 'sphere', size: 1, line: false,
  text: '', fx: 'cos(t)', fy: 'sin(t)', fz: 't/4', t0: 0, t1: 12.566, n: 120, fs: 'sin(x)*cos(y)', x0: -3, x1: 3, y0: -3, y1: 3, ...p,
})

const DEF = {
  title: 'Crop yield vs. growing conditions',
  ax: 'Temperature (°C)', ay: 'Humidity (g/m³)', az: 'Yield (t/ha)',
  scale: 'fit' as 'fit' | 'equal',
  fit: 'trial',
  residuals: true,
  dark: true,
  series: [
    base({ id: 'trial', name: 'Field trial', color: color(0), text: noisy() }),
    base({ id: 'ctrl', name: 'Control plots', color: color(3), marker: 'cube', text: '2.5 1.5 2.8\n4 2 3.5\n5.5 3.2 3.9\n7 4 4.6\n7.8 5.5 4.3\n3 4.5 1.9' }),
    base({ id: 'helix', name: 'Model curve', color: color(2), kind: 'param', fx: '5 + 2.5cos(t)', fy: '3.5 + 2sin(t)', fz: '3 + 0.12t', t0: 0, t1: 12.566, n: 90, size: 0.5, line: true }),
  ],
}

function pointsOf(s: Series): { pts: P3[]; err: string } {
  try {
    if (s.kind === 'points') {
      const r = parsePoints(s.text)
      return { pts: r.pts, err: r.bad.length ? `Skipped line${r.bad.length > 1 ? 's' : ''} ${r.bad.slice(0, 6).join(', ')}${r.bad.length > 6 ? '…' : ''} (need 3 numbers)` : '' }
    }
    if (s.kind === 'param') return { pts: parametric(s.fx, s.fy, s.fz, s.t0, s.t1, s.n), err: '' }
    return { pts: surface(s.fs, s.x0, s.x1, s.y0, s.y1, s.n), err: '' }
  } catch (e) {
    return { pts: [], err: (e as Error).message }
  }
}

const HALF = 4

export default function ScatterPlotter3D() {
  const [s, set, reset] = useToolState('3d-scatter-plotter', DEF)
  const [open, setOpen] = useState(s.series[0]?.id ?? '')
  const [hover, setHover] = useState<string>('')
  const stage = useRef<Stage3D | null>(null)
  const meshes = useRef<THREE.Object3D[]>([])

  const data = useMemo(() => s.series.map((x) => ({ s: x, ...pointsOf(x) })), [s.series])
  const shown = data.filter((d) => d.s.visible && d.pts.length)
  const all = shown.flatMap((d) => d.pts)
  const bb = bounds(all)
  const fitPts = s.fit === 'none' ? [] : s.fit === 'all' ? all : (data.find((d) => d.s.id === s.fit)?.pts ?? [])
  const plane = fitPlane(fitPts)

  // data → scene mapping (z is up)
  const span = [0, 1, 2].map((k) => bb.max[k] - bb.min[k])
  const maxSpan = Math.max(...span)
  const sc = (v: number, k: number) => {
    const mid = (bb.min[k] + bb.max[k]) / 2
    return ((v - mid) / (s.scale === 'equal' ? maxSpan : span[k])) * 2 * HALF
  }
  const lim = (k: number) => (s.scale === 'equal' ? (span[k] / maxSpan) * HALF : HALF)
  const toV = (p: P3) => new THREE.Vector3(sc(p[0], 0), sc(p[2], 2), -sc(p[1], 1))

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
      const ray = new THREE.Raycaster()
      const el = st.renderer.domElement
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(meshes.current, false)[0]
        if (hit && hit.instanceId !== undefined) {
          const u = hit.object.userData as { name: string; pts: P3[] }
          const p = u.pts[hit.instanceId]
          setHover(`${u.name}: (${fmt(p[0], 4)}, ${fmt(p[1], 4)}, ${fmt(p[2], 4)})`)
        } else setHover('')
      }
      el.addEventListener('pointermove', move)
      return () => el.removeEventListener('pointermove', move)
    },
    (st) => {
      const root = st.scene.getObjectByName('root')!
      st.clear(root)
      st.scene.background = new THREE.Color(s.dark ? '#0f172a' : '#f8fafc')
      const ink = s.dark ? '#cbd5e1' : '#334155'
      const lineMat = new THREE.LineBasicMaterial({ color: s.dark ? 0x475569 : 0x94a3b8 })
      const gridMat = new THREE.LineBasicMaterial({ color: s.dark ? 0x1e293b : 0xe2e8f0 })
      const [lx, ly, lz] = [lim(0), lim(1), lim(2)]
      // box
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(lx * 2, lz * 2, ly * 2)), lineMat)
      root.add(box)
      // ticks + floor grid
      const seg: number[] = []
      const tick = (k: number, len: number) => niceTicks(bb.min[k], bb.max[k], 5).filter((v) => v >= bb.min[k] - 1e-9 && v <= bb.max[k] + 1e-9).map((v) => [v, (sc(v, k) / (lim(k) || 1)) * len] as const)
      for (const [v, p] of tick(0, lx)) {
        seg.push(p, -lz, -ly, p, -lz, ly)
        const t = label(fmt(v, 3), ink, 0.4); t.position.set(p, -lz - 0.3, ly + 0.35); root.add(t)
      }
      for (const [v, p] of tick(1, ly)) {
        seg.push(-lx, -lz, -p, lx, -lz, -p)
        const t = label(fmt(v, 3), ink, 0.4); t.position.set(lx + 0.5, -lz - 0.3, -p); root.add(t)
      }
      for (const [v, p] of tick(2, lz)) {
        seg.push(-lx, p, -ly, lx, p, -ly, -lx, p, -ly, -lx, p, ly)
        const t = label(fmt(v, 3), ink, 0.4); t.position.set(-lx - 0.5, p, ly + 0.2); root.add(t)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
      root.add(new THREE.LineSegments(g, gridMat))
      const axT = (txt: string, x: number, y: number, z: number) => { const t = label(txt, s.dark ? '#f1f5f9' : '#0f172a', 0.46); t.position.set(x, y, z); root.add(t) }
      axT(s.ax, 0, -lz - 0.85, ly + 1.0)
      axT(s.ay, lx + 1.6, -lz - 0.85, 0)
      axT(s.az, -lx - 1.1, lz + 0.6, ly)
      // series
      meshes.current = []
      for (const d of shown) {
        const r = 0.07 * d.s.size
        const geo = d.s.marker === 'cube' ? new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6) : d.s.marker === 'diamond' ? new THREE.OctahedronGeometry(r * 1.4) : new THREE.SphereGeometry(r, 14, 10)
        const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: d.s.color, roughness: 0.45 }), d.pts.length)
        const mat = new THREE.Matrix4()
        d.pts.forEach((p, i) => { mat.setPosition(toV(p)); m.setMatrixAt(i, mat) })
        m.userData = { name: d.s.name, pts: d.pts }
        root.add(m)
        meshes.current.push(m)
        if (d.s.line && d.pts.length > 1) {
          const lg = new THREE.BufferGeometry().setFromPoints(d.pts.map(toV))
          root.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: d.s.color })))
        }
      }
      // regression plane + residuals
      if (plane) {
        const z = (x: number, y: number) => plane.a + plane.b * x + plane.c * y
        const [x0, x1, y0, y1] = [bb.min[0], bb.max[0], bb.min[1], bb.max[1]]
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toV([x, y, z(x, y)]))
        const pg = new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]])
        pg.computeVertexNormals()
        root.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })))
        root.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: 0xf472b6 })))
        if (s.residuals && fitPts.length <= 2000) {
          const rs: THREE.Vector3[] = []
          for (const p of fitPts) rs.push(toV(p), toV([p[0], p[1], z(p[0], p[1])]))
          root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rs), new THREE.LineBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.6 })))
        }
      }
    },
    [data, s.scale, s.fit, s.residuals, s.dark, s.ax, s.ay, s.az],
    { grid: false, camera: [9, 6, 10] },
  )

  const edit = (id: string, p: Partial<Series>) => set({ series: s.series.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const add = (kind: Kind) => {
    const n = base({ kind, name: kind === 'points' ? 'New data' : kind === 'param' ? 'Curve' : 'Surface z = f(x,y)', color: color(s.series.length), text: '1 1 1\n2 3 2\n3 2 4', line: kind === 'param', size: kind === 'points' ? 1 : 0.5 })
    set({ series: [...s.series, n] })
    setOpen(n.id)
  }

  const exportPng = () => {
    const st = stage.current
    if (!st) return
    st.renderer.render(st.scene, st.camera)
    const src = st.renderer.domElement
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const g = c.getContext('2d')!
    g.drawImage(src, 0, 0)
    const k = src.width / (src.clientWidth || src.width)
    g.fillStyle = s.dark ? '#f1f5f9' : '#0f172a'
    g.font = `700 ${20 * k}px system-ui`
    g.fillText(s.title, 16 * k, 32 * k)
    g.font = `${13 * k}px system-ui`
    shown.forEach((d, i) => {
      g.fillStyle = d.s.color
      g.fillRect(16 * k, (50 + i * 20) * k, 12 * k, 12 * k)
      g.fillStyle = s.dark ? '#cbd5e1' : '#334155'
      g.fillText(`${d.s.name} (${d.pts.length})`, 34 * k, (60 + i * 20) * k)
    })
    if (plane) g.fillText(`Fit: z = ${fmt(plane.a, 4)} ${plane.b < 0 ? '−' : '+'} ${fmt(Math.abs(plane.b), 4)}x ${plane.c < 0 ? '−' : '+'} ${fmt(Math.abs(plane.c), 4)}y   R² = ${plane.r2.toFixed(3)}`, 16 * k, (66 + shown.length * 20) * k)
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${s.title.replace(/[^\w]+/g, '-').toLowerCase() || 'scatter-3d'}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  }

  const cur = s.series.find((x) => x.id === open)
  const curData = data.find((d) => d.s.id === open)

  return (
    <Split wide="right">
      <div>
        <Panel title="Series" actions={<><Btn onClick={() => add('points')}>+ Data</Btn><Btn onClick={() => add('param')}>+ Curve</Btn><Btn onClick={() => add('surface')}>+ Surface</Btn></>}>
          {s.series.map((x) => {
            const d = data.find((q) => q.s.id === x.id)!
            return (
              <div key={x.id} onClick={() => setOpen(x.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: open === x.id ? 'var(--accent-soft, rgba(99,102,241,.12))' : undefined }}>
                <input type="checkbox" checked={x.visible} onChange={(e) => edit(x.id, { visible: e.target.checked })} onClick={(e) => e.stopPropagation()} aria-label="Visible" />
                <input type="color" value={x.color} onChange={(e) => edit(x.id, { color: e.target.value })} aria-label="Colour" style={{ width: 28, height: 24, border: 0, background: 'none', padding: 0 }} />
                <b style={{ flex: 1 }}>{x.name}</b>
                <span className="muted" style={{ fontSize: 12 }}>{d.pts.length} pts{d.err ? ' ⚠' : ''}</span>
              </div>
            )
          })}
        </Panel>
        {cur && (
          <Panel title={`Edit · ${cur.name}`} actions={<Btn kind="ghost" onClick={() => { set({ series: s.series.filter((x) => x.id !== cur.id), fit: s.fit === cur.id ? 'none' : s.fit }); setOpen(s.series[0]?.id ?? '') }}>Delete</Btn>}>
            <Txt label="Name" value={cur.name} onChange={(name) => edit(cur.id, { name })} />
            <Seg value={cur.kind} onChange={(kind) => edit(cur.id, { kind })} options={[['points', 'Points'], ['param', 'Parametric'], ['surface', 'z = f(x, y)']]} />
            <div style={{ marginTop: 10 }}>
              {cur.kind === 'points' && <Area label="x y z per line (paste from a spreadsheet)" value={cur.text} onChange={(text) => edit(cur.id, { text })} rows={8} mono />}
              {cur.kind === 'param' && (
                <>
                  <Txt label="x(t)" value={cur.fx} onChange={(fx) => edit(cur.id, { fx })} />
                  <Txt label="y(t)" value={cur.fy} onChange={(fy) => edit(cur.id, { fy })} />
                  <Txt label="z(t)" value={cur.fz} onChange={(fz) => edit(cur.id, { fz })} />
                  <Row>
                    <Num label="t from" value={cur.t0} onChange={(t0) => edit(cur.id, { t0 })} />
                    <Num label="t to" value={cur.t1} onChange={(t1) => edit(cur.id, { t1 })} />
                    <Num label="Points" value={cur.n} onChange={(n) => edit(cur.id, { n })} min={2} max={5000} />
                  </Row>
                </>
              )}
              {cur.kind === 'surface' && (
                <>
                  <Txt label="z = f(x, y)" value={cur.fs} onChange={(fs) => edit(cur.id, { fs })} />
                  <Row>
                    <Num label="x from" value={cur.x0} onChange={(x0) => edit(cur.id, { x0 })} />
                    <Num label="x to" value={cur.x1} onChange={(x1) => edit(cur.id, { x1 })} />
                    <Num label="y from" value={cur.y0} onChange={(y0) => edit(cur.id, { y0 })} />
                    <Num label="y to" value={cur.y1} onChange={(y1) => edit(cur.id, { y1 })} />
                  </Row>
                  <Slider label="Grid" value={cur.n} onChange={(n) => edit(cur.id, { n })} min={4} max={60} unit={` × ${cur.n}`} />
                </>
              )}
            </div>
            {curData?.err && <Note tone="warn">{curData.err}</Note>}
            {cur.kind !== 'points' && <p className="k-hint">Functions: sin cos tan sqrt abs exp ln log pow min max…, constants pi e tau, ^ for powers, implicit 2t.</p>}
            <Row>
              <Select label="Marker" value={cur.marker} onChange={(marker) => edit(cur.id, { marker })} options={[['sphere', '● Sphere'], ['cube', '■ Cube'], ['diamond', '◆ Diamond']]} />
              <Slider label="Size" value={cur.size} onChange={(size) => edit(cur.id, { size })} min={0.2} max={3} step={0.1} />
            </Row>
            <Check label="Connect points with a line" value={cur.line} onChange={(line) => edit(cur.id, { line })} />
          </Panel>
        )}
        <Panel title="Axes & style">
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Txt label="X axis" value={s.ax} onChange={(ax) => set({ ax })} />
            <Txt label="Y axis" value={s.ay} onChange={(ay) => set({ ay })} />
            <Txt label="Z axis" value={s.az} onChange={(az) => set({ az })} />
          </Row>
          <Seg value={s.scale} onChange={(scale) => set({ scale })} options={[['fit', 'Fit each axis'], ['equal', 'Equal aspect']]} />
          <Check label="Dark background" value={s.dark} onChange={(dark) => set({ dark })} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Points shown" value={all.length} sub={`${shown.length} series`} />
          <Stat label="Fit R²" value={plane ? plane.r2.toFixed(3) : '—'} tone={plane ? (plane.r2 > 0.8 ? 'good' : 'accent') : undefined} sub={plane ? `RMSE ${fmt(plane.rmse, 3)}` : 'no plane'} />
          <Stat label="Z range" value={`${fmt(bb.min[2], 3)} … ${fmt(bb.max[2], 3)}`} />
        </Stats>
        <Panel title={s.title || '3D plot'} actions={<><Btn kind="primary" onClick={exportPng}>⬇ PNG</Btn><JsonButtons name="scatter-3d.json" data={s} onLoad={(d) => set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={500} />
            {hover && <div style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(15,23,42,.85)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 13 }}>{hover}</div>}
          </div>
          <Row>
            {shown.map((d) => (
              <span key={d.s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <i style={{ width: 10, height: 10, borderRadius: d.s.marker === 'sphere' ? 99 : 2, background: d.s.color, transform: d.s.marker === 'diamond' ? 'rotate(45deg)' : undefined, display: 'inline-block' }} />
                {d.s.name}
              </span>
            ))}
          </Row>
          <p className="k-hint">Drag to rotate · scroll to zoom · right-drag to pan · hover a marker to read its coordinates.</p>
        </Panel>
        <Panel title="Regression plane z = a + b·x + c·y">
          <Row>
            <Select label="Fit to" value={s.fit} onChange={(fit) => set({ fit })} options={[['none', 'No plane'], ['all', 'All visible points'], ...s.series.map((x) => [x.id, x.name] as [string, string])]} />
            <Check label="Show residuals" value={s.residuals} onChange={(residuals) => set({ residuals })} />
          </Row>
          {plane ? (
            <>
              <p style={{ fontSize: 18, fontFamily: 'ui-monospace, monospace' }}>
                z = {fmt(plane.a, 4)} {plane.b < 0 ? '−' : '+'} {fmt(Math.abs(plane.b), 4)}·x {plane.c < 0 ? '−' : '+'} {fmt(Math.abs(plane.c), 4)}·y
              </p>
              <Table head={['n', 'R²', 'RMSE', '∂z/∂x', '∂z/∂y']} rows={[[plane.n, plane.r2.toFixed(4), fmt(plane.rmse, 4), fmt(plane.b, 4), fmt(plane.c, 4)]]} />
              <p className="k-hint">Ordinary least squares on the chosen points. R² is the share of z-variance explained by x and y together.</p>
            </>
          ) : (
            s.fit !== 'none' && <Note tone="warn">Need at least 3 non-collinear points to fit a plane.</Note>
          )}
        </Panel>
        {curData && curData.pts.length > 0 && (
          <Panel title={`Summary · ${cur?.name}`}>
            <Table
              head={['', 'min', 'mean', 'max']}
              rows={[0, 1, 2].map((k) => {
                const v = curData.pts.map((p) => p[k])
                return [['x', 'y', 'z'][k], fmt(Math.min(...v), 4), fmt(v.reduce((a, b) => a + b, 0) / v.length, 4), fmt(Math.max(...v), 4)]
              })}
            />
          </Panel>
        )}
      </div>
    </Split>
  )
}
