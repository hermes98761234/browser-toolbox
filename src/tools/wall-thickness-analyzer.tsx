import { useEffect, useMemo, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, FileDrop, fmt, Note, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { parseStl } from './lib/stl-viewer'
import { analyzeThickness, heatColor, sampleModel, thinAreaFraction, type ThicknessResult } from './lib/wall-thickness-analyzer'

const PROCESSES: [string, string, number][] = [
  ['fdm04', 'FDM, 0.4 mm nozzle', 0.8],
  ['fdm06', 'FDM, 0.6 mm nozzle', 1.2],
  ['sla', 'SLA / resin', 0.5],
  ['sls', 'SLS nylon', 0.7],
  ['mjf', 'MJF nylon', 0.6],
  ['metal', 'Metal DMLS', 1.0],
]
const UNITS: [number, string][] = [[1, 'mm'], [10, 'cm'], [25.4, 'inch']]

const DEF = { threshold: 0.8, process: 'fdm04', unit: 1, onlyThin: false, wire: false }

interface Model { pos: Float32Array; name: string }

export default function WallThicknessAnalyzer() {
  const [s, set, reset] = useToolState('wall-thickness-analyzer', DEF)
  const [model, setModel] = useState<Model>(() => ({ pos: sampleModel(), name: 'Sample tray with pin' }))
  const [done, setDone] = useState<{ m: Model; r: ThicknessResult } | null>(null)
  const busy = done?.m !== model
  const res = done?.r ?? null
  const [err, setErr] = useState('')
  const k = s.unit

  useEffect(() => {
    const id = setTimeout(() => setDone({ m: model, r: analyzeThickness(model.pos) }), 30)
    return () => clearTimeout(id)
  }, [model])

  const thr = s.threshold / k // threshold in file units
  const info = useMemo(() => {
    if (!res) return null
    const n = res.thickness.length
    let thinTris = 0, open = 0
    const finite: number[] = []
    for (let t = 0; t < n; t++) {
      const th = res.thickness[t]
      if (!Number.isFinite(th)) open++
      else finite.push(th)
      if (th < thr) thinTris++
    }
    const total = res.area.reduce((a, b) => a + b, 0)
    const bands = [0, 0.5, 1, 1.5, 2, 3, 4].map((m) => m * s.threshold)
    const hist = bands.map((lo, i) => {
      const hi = i + 1 < bands.length ? bands[i + 1] : Infinity
      let a = 0
      for (let t = 0; t < n; t++) {
        const th = res.thickness[t] * k
        if (Number.isFinite(th) && th >= lo && th < hi) a += res.area[t]
      }
      return { lo, hi, a: total ? a / total : 0 }
    })
    finite.sort((a, b) => a - b)
    const median = finite.length ? finite[finite.length >> 1] : NaN
    return { n, thinTris, open, frac: thinAreaFraction(res, thr), hist, median, total }
  }, [res, thr, s.threshold, k])

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      if (!done) return
      const p = done.m.pos
      const res = done.r
      const n = p.length / 9
      let pos = p
      let cols = new Float32Array(p.length)
      if (s.onlyThin) {
        const keep: number[] = []
        for (let t = 0; t < n; t++) if (res.thickness[t] < thr) keep.push(t)
        pos = new Float32Array(keep.length * 9)
        cols = new Float32Array(keep.length * 9)
        keep.forEach((t, i) => pos.set(p.subarray(t * 9, t * 9 + 9), i * 9))
        keep.forEach((t, i) => {
          const c = heatColor(res.thickness[t], thr)
          for (let v = 0; v < 3; v++) cols.set(c, i * 9 + v * 3)
        })
      } else {
        for (let t = 0; t < n; t++) {
          const c = heatColor(res.thickness[t], thr)
          for (let v = 0; v < 3; v++) cols.set(c, t * 9 + v * 3)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      g.computeVertexNormals()
      const { min, max } = res.bbox
      const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2 // STL is Z-up
      holder.scale.setScalar(8 / size)
      const inner = new THREE.Group()
      inner.position.set(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2])
      holder.add(inner)
      inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide, wireframe: s.wire })))
      if (s.onlyThin) {
        const ghost = new THREE.BufferGeometry()
        ghost.setAttribute('position', new THREE.BufferAttribute(p, 3))
        ghost.computeVertexNormals()
        inner.add(new THREE.Mesh(ghost, new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })))
      }
      root.add(holder)
    },
    [done, thr, s.onlyThin, s.wire],
    { camera: [7, 6, 9] },
  )

  const load = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    try {
      const m = parseStl(await f.arrayBuffer())
      if (!m.pos.length) throw new Error('no triangles found')
      setErr('')
      setModel({ pos: m.pos, name: f.name })
    } catch (e) {
      setErr(`Could not read ${f.name}: ${(e as Error).message}`)
    }
  }

  const u = UNITS.find((x) => x[0] === k)?.[1] ?? 'mm'
  const verdict = !info ? null : info.frac === 0 ? (
    <Note tone="ok">No wall is thinner than {fmt(s.threshold, 3)} mm. This model should print without thin-wall problems.</Note>
  ) : info.frac < 0.02 ? (
    <Note tone="warn">A few small spots ({pct(info.frac, 2)} of the surface) are below the minimum. Check that they are cosmetic details, not load-bearing walls.</Note>
  ) : (
    <Note tone="err">{pct(info.frac, 1)} of the surface is thinner than {fmt(s.threshold, 3)} mm. Thicken the red walls, or scale the model up.</Note>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Model">
          <FileDrop accept=".stl" onFiles={load} label="Drop an STL file (binary or ASCII) or click to choose" />
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn onClick={() => setModel({ pos: sampleModel(), name: 'Sample tray with pin' })}>Load sample</Btn>
            <span className="muted">{model.name}</span>
          </Row>
          <Select label="File units" value={k} onChange={(unit) => set({ unit })} options={UNITS} />
        </Panel>
        <Panel title="Minimum wall">
          <Select
            label="Printing process"
            value={s.process}
            onChange={(process) => set({ process, threshold: PROCESSES.find((x) => x[0] === process)?.[2] ?? s.threshold })}
            options={PROCESSES.map(([id, name, t]) => [id, `${name} (${t} mm)`] as const)}
          />
          <Slider label="Threshold" value={s.threshold} onChange={(threshold) => set({ threshold })} min={0.1} max={5} step={0.05} unit=" mm" />
          <Check label="Show only thin areas" value={s.onlyThin} onChange={(onlyThin) => set({ onlyThin })} />
          <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
        <Panel title="How it works">
          <p className="muted" style={{ margin: 0 }}>
            For every triangle a ray is cast from its centre along the inward normal. The distance to the opposite surface is the local wall
            thickness. Rays run against a bounding-volume hierarchy, so models with 100k+ triangles take a few seconds. Grey means the ray
            escaped (an open or non-watertight mesh).
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Thinnest wall" value={res ? `${fmt(res.min * k, 3)} mm` : '…'} tone={res && res.min * k < s.threshold ? 'bad' : 'good'} />
          <Stat label="Thin surface" value={info ? pct(info.frac, 1) : '…'} sub={info ? `${info.thinTris.toLocaleString()} triangles` : ''} tone={info && info.frac > 0 ? 'bad' : 'good'} />
          <Stat label="Median wall" value={info ? `${fmt(info.median * k, 3)} mm` : '…'} />
          <Stat label="Triangles" value={info ? info.n.toLocaleString() : '…'} sub={info && info.open ? `${info.open} open rays` : 'watertight'} />
        </Stats>
        {busy && <Note>Analyzing {model.name}…</Note>}
        {verdict}
        <Panel title="Thickness heatmap">
          <View3D refEl={ref} height={440} />
          <div className="k-legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: '#e62626' }} />below {fmt(s.threshold, 3)} mm</span>
            <span><i style={{ background: '#ffbf1a' }} />just above</span>
            <span><i style={{ background: '#4dcc59' }} />comfortable</span>
            <span><i style={{ background: '#3373f2' }} />thick</span>
            <span><i style={{ background: '#8c8c99' }} />open mesh</span>
          </div>
        </Panel>
        {info && (
          <Panel title="Surface area by wall thickness" actions={<CsvButton name="wall-thickness.csv" rows={() => [['From mm', 'To mm', 'Share of surface'], ...info.hist.map((h) => [fmt(h.lo, 3), Number.isFinite(h.hi) ? fmt(h.hi, 3) : 'above', (h.a * 100).toFixed(2) + '%'])]} />}>
            <BarChart
              height={200}
              fy={(v) => pct(v, 0)}
              bars={info.hist.map((h) => ({ label: Number.isFinite(h.hi) ? `${fmt(h.lo, 2)}–${fmt(h.hi, 2)}` : `> ${fmt(h.lo, 2)}`, value: h.a, color: h.hi <= s.threshold ? '#e62626' : h.lo < s.threshold * 2 ? '#f59e0b' : '#22c55e' }))}
            />
            <Table
              head={['Thickness band', 'Share of surface', `Area (${u}²)`]}
              rows={info.hist.map((h) => [Number.isFinite(h.hi) ? `${fmt(h.lo, 3)} – ${fmt(h.hi, 3)} mm` : `≥ ${fmt(h.lo, 3)} mm`, pct(h.a, 1), fmt(h.a * info.total, 4)])}
            />
          </Panel>
        )}
      </div>
    </Split>
  )
}
