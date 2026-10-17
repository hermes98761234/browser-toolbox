import { useEffect, useMemo, useRef } from 'react'
import { Btn, Check, CsvButton, download, fmt, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { compile, sample, type Grid } from './lib/3d-function-plotter'

const PRESETS: [string, string, number][] = [
  ['Ripple', 'sin(sqrt(x^2 + y^2)) / sqrt(x^2 + y^2 + 0.1)', 10],
  ['Saddle', 'x^2 - y^2', 2],
  ['Peaks', '3(1-x)^2 exp(-x^2-(y+1)^2) - 10(x/5 - x^3 - y^5) exp(-x^2-y^2) - exp(-(x+1)^2-y^2)/3', 3],
  ['Gaussian', 'exp(-(x^2 + y^2) / 2)', 3],
  ['Egg crate', 'sin(x) cos(y)', 6],
  ['Monkey saddle', 'x^3 - 3x y^2', 1.5],
  ['Wave (animated)', 'sin(x + t) * cos(y - t/2)', 6],
  ['Paraboloid', 'x^2 + y^2', 2],
  ['Himmelblau', 'log(1 + (x^2 + y - 11)^2 + (x + y^2 - 7)^2)', 5],
]

const MAPS: Record<string, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
  turbo: ['#30123b', '#4686fb', '#1ae4b6', '#a2fc3c', '#fabb39', '#e4460a', '#7a0403'],
  coolwarm: ['#3b4cc0', '#8db0fe', '#dddddd', '#f49a7b', '#b40426'],
  terrain: ['#1e3a8a', '#0ea5e9', '#22c55e', '#a16207', '#f8fafc'],
}
function cmap(name: string, t: number, out: THREE.Color): THREE.Color {
  const stops = MAPS[name] ?? MAPS.viridis
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return out.set(stops[i]).lerp(new THREE.Color(stops[i + 1]), x - i)
}

const DEF = { expr: PRESETS[0][1], range: 10, xMin: -10, xMax: 10, yMin: -10, yMax: 10, res: 90, map: 'viridis', wire: false, height: 1, zAuto: true, zMin: -1, zMax: 1, animate: true, px: 1, py: 1 }

const S = 10 // plot box size in scene units

export default function FunctionPlotter3D() {
  const [s, set, reset] = useToolState('3d-function-plotter', DEF)
  const comp = useMemo(() => {
    try {
      return { f: compile(s.expr, ['x', 'y', 't']), err: '' }
    } catch (e) {
      return { f: null, err: (e as Error).message }
    }
  }, [s.expr])
  const usesT = /\bt\b/.test(s.expr)
  const n = Math.max(10, Math.min(250, Math.round(s.res)))
  const okDomain = s.xMax > s.xMin && s.yMax > s.yMin
  const grid = useMemo(() => (comp.f && okDomain ? sample(comp.f, s.xMin, s.xMax, s.yMin, s.yMax, n, 0) : null), [comp.f, s.xMin, s.xMax, s.yMin, s.yMax, n, okDomain])
  const zr = useMemo<[number, number]>(() => {
    if (!s.zAuto && s.zMax > s.zMin) return [s.zMin, s.zMax]
    if (!grid || !Number.isFinite(grid.min)) return [-1, 1]
    return grid.max > grid.min ? [grid.min, grid.max] : [grid.min - 1, grid.max + 1]
  }, [grid, s.zAuto, s.zMin, s.zMax])
  const live = useRef({ s, comp, zr, n })
  useEffect(() => {
    live.current = { s, comp, zr, n }
  }, [s, comp, zr, n])
  const meshRef = useRef<THREE.Mesh | null>(null)

  const fill = (geo: THREE.BufferGeometry, g: Grid, z0: number, z1: number, mapName: string, h: number) => {
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    const c = new THREE.Color()
    for (let k = 0; k < g.n * g.n; k++) {
      const v = g.z[k]
      const t = (Math.max(z0, Math.min(z1, v)) - z0) / (z1 - z0)
      pos.setY(k, Number.isFinite(v) ? t * 6 * h : 0)
      cmap(mapName, Number.isFinite(v) ? t : 0, c)
      col.setXYZ(k, c.r, c.g, c.b)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    geo.computeVertexNormals()
  }

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'plot'
      st.scene.add(g)
      st.onFrame((t) => {
        const L = live.current
        const m = meshRef.current
        if (!m || !L.comp.f || !L.s.animate || !/\bt\b/.test(L.s.expr)) return
        const gr = sample(L.comp.f, L.s.xMin, L.s.xMax, L.s.yMin, L.s.yMax, L.n, t)
        fill(m.geometry, gr, L.zr[0], L.zr[1], L.s.map, L.s.height)
      })
    },
    (st) => {
      const root = st.scene.getObjectByName('plot') as THREE.Group
      st.clear(root)
      meshRef.current = null
      if (!grid) return
      const N = grid.n
      const pos = new Float32Array(N * N * 3)
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i
        pos[k * 3] = (i / (N - 1) - 0.5) * S
        pos[k * 3 + 2] = -(j / (N - 1) - 0.5) * S
      }
      const idx: number[] = []
      const ok = (k: number) => Number.isFinite(grid.z[k])
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1
        if (ok(a) && ok(b) && ok(d)) idx.push(a, d, b)
        if (ok(a) && ok(d) && ok(c)) idx.push(a, c, d)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3))
      geo.setIndex(idx)
      fill(geo, grid, zr[0], zr[1], s.map, s.height)
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
      root.add(mesh)
      meshRef.current = mesh
      if (s.wire) root.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.35 })))
      const H = 6 * s.height
      root.add(new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-S / 2, 0, -S / 2), new THREE.Vector3(S / 2, H, S / 2)), new THREE.Color('#475569')))
      const L = (t: string, x: number, y: number, z: number, c = '#cbd5e1') => { const sp = label(t, c, 0.5); sp.position.set(x, y, z); root.add(sp) }
      L(`x ${fmt(s.xMin, 3)}`, -S / 2, -0.4, S / 2 + 0.5); L(`x ${fmt(s.xMax, 3)}`, S / 2, -0.4, S / 2 + 0.5, '#f87171')
      L(`y ${fmt(s.yMin, 3)}`, S / 2 + 0.9, -0.4, S / 2); L(`y ${fmt(s.yMax, 3)}`, S / 2 + 0.9, -0.4, -S / 2, '#4ade80')
      L(`z ${fmt(zr[0], 3)}`, -S / 2 - 0.9, 0, -S / 2); L(`z ${fmt(zr[1], 3)}`, -S / 2 - 0.9, H, -S / 2, '#60a5fa')
    },
    [grid, zr, s.map, s.wire, s.height],
    { camera: [11, 10, 13], target: [0, 2.5, 0] },
  )

  // top-view heat map
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid) return
    const N = grid.n
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(N, N)
    const c = new THREE.Color()
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = grid.z[j * N + i]
      const o = ((N - 1 - j) * N + i) * 4
      if (!Number.isFinite(v)) { img.data[o + 3] = 0; continue }
      cmap(s.map, (Math.max(zr[0], Math.min(zr[1], v)) - zr[0]) / (zr[1] - zr[0]), c)
      img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, zr, s.map])

  const cf = comp.f
  const probe = useMemo(() => {
    if (!cf) return null
    const f = (x: number, y: number) => cf({ x, y, t: 0 })
    const h = 1e-5 * Math.max(1, Math.abs(s.px), Math.abs(s.py))
    const fx = (f(s.px + h, s.py) - f(s.px - h, s.py)) / (2 * h)
    const fy = (f(s.px, s.py + h) - f(s.px, s.py - h)) / (2 * h)
    return { z: f(s.px, s.py), fx, fy }
  }, [cf, s.px, s.py])

  const exportStl = () => {
    if (!grid) return
    const N = grid.n, tris: number[] = []
    const P = (i: number, j: number) => [grid.xs[i], grid.ys[j], grid.z[j * N + i]]
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1)
      if ([a, b, c, d].every((p) => Number.isFinite(p[2]))) tris.push(...a, ...b, ...d, ...a, ...d, ...c)
    }
    const cnt = tris.length / 9
    const buf = new ArrayBuffer(84 + cnt * 50), dv = new DataView(buf)
    dv.setUint32(80, cnt, true)
    for (let t = 0; t < cnt; t++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, tris[t * 9 + k], true)
    download('surface.stl', new Blob([buf]), 'model/stl')
  }
  const setRange = (r: number) => set({ range: r, xMin: -r, xMax: r, yMin: -r, yMax: r })

  return (
    <div>
      <Panel title="z = f(x, y)" actions={<><Btn onClick={exportStl}>⬇ STL</Btn><CsvButton name="surface.csv" rows={() => grid ? [['x', 'y', 'z'], ...grid.ys.flatMap((y, j) => grid.xs.map((x, i) => [x, y, grid.z[j * grid.n + i]]))] : []} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
        <Txt label="Expression (use x, y and optional t for time)" value={s.expr} onChange={(expr) => set({ expr })} placeholder="sin(x) * cos(y)" />
        {comp.err && <Note tone="err">{comp.err}</Note>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map(([name, e, r]) => <Btn key={name} kind={s.expr === e ? 'primary' : 'normal'} onClick={() => set({ expr: e, range: r, xMin: -r, xMax: r, yMin: -r, yMax: r, zAuto: true })}>{name}</Btn>)}
        </div>
      </Panel>
      <Stats>
        <Stat label="z min" value={grid && Number.isFinite(grid.min) ? fmt(grid.min, 5) : '—'} />
        <Stat label="z max" value={grid && Number.isFinite(grid.max) ? fmt(grid.max, 5) : '—'} />
        <Stat label="Grid" value={`${n} × ${n}`} sub={`${(n * n).toLocaleString('en-US')} evaluations`} />
        <Stat label="Undefined points" value={grid?.bad ?? 0} tone={grid?.bad ? 'bad' : 'good'} sub={grid?.bad ? 'NaN / ±∞ are left as holes' : 'all finite'} />
      </Stats>
      <Split wide="left">
        <Panel title="Surface">
          <View3D refEl={ref} height={480} />
          <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, right-drag to pan, scroll to zoom. Red label = +x, green = +y, blue = top of z range.</p>
        </Panel>
        <div>
          <Panel title="Domain & view">
            <Slider label="Symmetric range ±" value={s.range} min={0.5} max={50} step={0.5} onChange={setRange} />
            <Row>
              <Num label="x min" value={s.xMin} onChange={(xMin) => set({ xMin })} />
              <Num label="x max" value={s.xMax} onChange={(xMax) => set({ xMax })} />
            </Row>
            <Row>
              <Num label="y min" value={s.yMin} onChange={(yMin) => set({ yMin })} />
              <Num label="y max" value={s.yMax} onChange={(yMax) => set({ yMax })} />
            </Row>
            {!okDomain && <Note tone="err">Each max must be greater than its min.</Note>}
            <Slider label="Resolution" value={s.res} min={20} max={200} step={10} onChange={(res) => set({ res })} show={(v) => `${v} × ${v}`} />
            <Slider label="Height scale" value={s.height} min={0.2} max={2} step={0.05} onChange={(height) => set({ height })} />
            <Row>
              <Select label="Colour map" value={s.map} onChange={(map) => set({ map })} options={Object.keys(MAPS)} />
              <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
            </Row>
            <Check label="Auto z range" value={s.zAuto} onChange={(zAuto) => set({ zAuto, zMin: +zr[0].toPrecision(3), zMax: +zr[1].toPrecision(3) })} />
            {!s.zAuto && (
              <Row>
                <Num label="z min (clip)" value={s.zMin} onChange={(zMin) => set({ zMin })} />
                <Num label="z max (clip)" value={s.zMax} onChange={(zMax) => set({ zMax })} />
              </Row>
            )}
            {usesT && <Check label="Animate t (seconds)" value={s.animate} onChange={(animate) => set({ animate })} />}
          </Panel>
          <Panel title="Top view">
            <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1', imageRendering: 'auto', borderRadius: 8, background: 'var(--panel2)' }} />
            <div style={{ height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${(MAPS[s.map] ?? MAPS.viridis).join(',')})` }} />
            <Row wrap={false}><span className="muted" style={{ flex: 1 }}>{fmt(zr[0], 4)}</span><span className="muted">{fmt(zr[1], 4)}</span></Row>
          </Panel>
          <Panel title="Probe a point">
            <Row>
              <Num label="x" value={s.px} onChange={(px) => set({ px })} />
              <Num label="y" value={s.py} onChange={(py) => set({ py })} />
            </Row>
            {probe && (
              <Stats>
                <Stat label="f(x, y)" value={fmt(probe.z, 6)} tone="accent" />
                <Stat label="∂f/∂x" value={fmt(probe.fx, 5)} />
                <Stat label="∂f/∂y" value={fmt(probe.fy, 5)} />
                <Stat label="|∇f|" value={fmt(Math.hypot(probe.fx, probe.fy), 5)} />
              </Stats>
            )}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
