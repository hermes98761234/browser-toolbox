import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, Note, Panel, Seg, Select, Slider, Split, Stat, Stats, Table, color, fmt, niceTicks, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { parseCsv } from './lib/bank-csv-analyzer'

type Mode = 'wide' | 'long'
type Agg = 'sum' | 'avg' | 'count' | 'max'
type ColorBy = 'series' | 'category' | 'value'

const WIDE = `Region,Q1,Q2,Q3,Q4
North,120,135,150,172
South,98,110,104,126
East,143,151,168,190
West,76,92,118,131
Online,60,88,121,164`

const LONG = `product,month,units
Coffee,Jan,30
Coffee,Jan,12
Coffee,Feb,51
Coffee,Mar,47
Tea,Jan,22
Tea,Feb,18
Tea,Mar,35
Cocoa,Jan,40
Cocoa,Feb,28
Cocoa,Mar,9
Tea,Mar,6`

const DEF = { mode: 'wide' as Mode, text: WIDE, agg: 'sum' as Agg, colorBy: 'series' as ColorBy, width: 0.7, height: 6, labels: true, title: 'Sales by region and quarter', unit: 'k$' }

interface Pivot { cats: string[]; series: string[]; v: number[][] }

function pivot(text: string, mode: Mode, agg: Agg): { p: Pivot; err: string } {
  const rows = parseCsv(text.trim()).filter((r) => r.some((c) => c.trim()))
  if (rows.length < 2) return { p: { cats: [], series: [], v: [] }, err: 'Need a header row and at least one data row.' }
  if (mode === 'wide') {
    const series = rows[0].slice(1).map((x) => x.trim())
    const cats = rows.slice(1).map((r) => r[0].trim())
    let bad = 0
    const v = rows.slice(1).map((r) => series.map((_, j) => {
      const n = Number(String(r[j + 1] ?? '').replace(/[,\s$€£%]/g, ''))
      if (!Number.isFinite(n)) bad++
      return Number.isFinite(n) ? n : 0
    }))
    return { p: { cats, series, v }, err: bad ? `${bad} cell(s) were not numbers and count as 0.` : '' }
  }
  if (rows[0].length < 2) return { p: { cats: [], series: [], v: [] }, err: 'Long format needs columns: category, series, value.' }
  const cats: string[] = [], series: string[] = []
  const acc = new Map<string, number[]>()
  for (const r of rows.slice(1)) {
    const c = (r[0] ?? '').trim(), s = (r[1] ?? '').trim()
    const n = Number(String(r[2] ?? '1').replace(/[,\s$€£%]/g, ''))
    if (!c || !s) continue
    if (!cats.includes(c)) cats.push(c)
    if (!series.includes(s)) series.push(s)
    const k = c + '\u0000' + s
    acc.set(k, [...(acc.get(k) ?? []), Number.isFinite(n) ? n : 0])
  }
  const red = (a: number[] | undefined) => {
    if (!a?.length) return 0
    if (agg === 'count') return a.length
    if (agg === 'max') return Math.max(...a)
    const sum = a.reduce((x, y) => x + y, 0)
    return agg === 'avg' ? sum / a.length : sum
  }
  return { p: { cats, series, v: cats.map((c) => series.map((s) => red(acc.get(c + '\u0000' + s)))) }, err: '' }
}

const heat = (t: number) => new THREE.Color().setHSL(0.66 - 0.66 * t, 0.75, 0.52)

export default function BarChart3D() {
  const [s, set, reset] = useToolState('3d-bar-chart-maker', DEF)
  const { p, err } = useMemo(() => pivot(s.text, s.mode, s.agg), [s.text, s.mode, s.agg])
  const [hover, setHover] = useState<{ c: number; s: number; x: number; y: number } | null>(null)
  const bars = useRef<THREE.Mesh[]>([])
  const all = p.v.flat()
  const max = Math.max(0, ...all), min = Math.min(0, ...all)
  const total = all.reduce((a, b) => a + b, 0)
  let top: [number, number] = [0, 0]
  p.v.forEach((r, i) => r.forEach((x, j) => { if (x > (p.v[top[0]]?.[top[1]] ?? -Infinity)) top = [i, j] }))

  const ref = useStage3D(
    (st: Stage3D) => {
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const m = new THREE.Vector2()
      let last: THREE.Mesh | null = null
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        m.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.setFromCamera(m, st.camera)
        const hit = ray.intersectObjects(bars.current)[0]?.object as THREE.Mesh | undefined
        if (last && last !== hit) (last.material as THREE.MeshStandardMaterial).emissive.setHex(0)
        if (hit) {
          ;(hit.material as THREE.MeshStandardMaterial).emissive.setHex(0x333333)
          setHover({ c: hit.userData.c, s: hit.userData.s, x: e.clientX - r.left, y: e.clientY - r.top })
        } else if (last) setHover(null)
        last = hit ?? null
      }
      const onLeave = () => { setHover(null) }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerleave', onLeave)
      const g = new THREE.Group()
      g.name = 'chart'
      st.scene.add(g)
      return () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerleave', onLeave)
      }
    },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('chart')!
      st.clear(g)
      bars.current = []
      const nc = p.cats.length, ns = p.series.length
      if (!nc || !ns) return
      const span = Math.max(max - min, 1e-9)
      const k = s.height / span
      const y0 = -min * k
      const sp = 1.2
      const ox = ((nc - 1) * sp) / 2, oz = ((ns - 1) * sp) / 2
      const floor = new THREE.Mesh(new THREE.BoxGeometry(nc * sp + 0.6, 0.04, ns * sp + 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }))
      floor.position.set(0, y0 - 0.02, 0)
      g.add(floor)
      p.v.forEach((row, i) => row.forEach((val, j) => {
        const h = Math.max(0.02, Math.abs(val) * k)
        const col = s.colorBy === 'value' ? heat((val - min) / span) : new THREE.Color(color(s.colorBy === 'series' ? j : i))
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.width * sp, h, s.width * sp), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 }))
        mesh.position.set(i * sp - ox, y0 + (val >= 0 ? h / 2 : -h / 2), oz - j * sp)
        mesh.userData = { c: i, s: j }
        g.add(mesh)
        bars.current.push(mesh)
        if (s.labels && nc * ns <= 80) {
          const l = label(fmt(val, 3), '#f8fafc', 0.3)
          l.position.set(i * sp - ox, y0 + (val >= 0 ? h + 0.25 : -h - 0.25), oz - j * sp)
          g.add(l)
        }
      }))
      p.cats.forEach((c, i) => {
        const l = label(c, '#cbd5e1', 0.4)
        l.position.set(i * sp - ox, y0 - 0.1, oz + 1.1)
        g.add(l)
      })
      p.series.forEach((n, j) => {
        const l = label(n, color(j), 0.4)
        l.position.set(ox + 1.0 + n.length * 0.08, y0 - 0.1, oz - j * sp)
        g.add(l)
      })
      // value axis at back-left corner
      const lineMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.6 })
      for (const t of niceTicks(min, max, 5)) {
        if (t < min || t > max) continue
        const y = y0 + t * k
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ox - 0.6, y, -oz - 0.6), new THREE.Vector3(ox + 0.6, y, -oz - 0.6), new THREE.Vector3(-ox - 0.6, y, -oz - 0.6), new THREE.Vector3(-ox - 0.6, y, oz + 0.6)])
        g.add(new THREE.LineSegments(geo, lineMat))
        const l = label(fmt(t, 3), '#94a3b8', 0.32)
        l.position.set(-ox - 1.1, y, -oz - 0.6)
        g.add(l)
      }
      if (s.title) {
        const l = label(s.title, '#e2e8f0', 0.55)
        l.position.set(0, y0 + s.height + 1.2, -oz - 0.6)
        g.add(l)
      }
      const d = Math.max(nc * sp, ns * sp, s.height) * 1.45 + 4
      st.controls.target.set(0, y0 + s.height * 0.45, 0)
      st.camera.position.set(d * 0.5, y0 + s.height * 0.8 + d * 0.3, d * 0.95)
    },
    [p, s.width, s.height, s.labels, s.colorBy, s.title],
    { camera: [8, 8, 12] },
  )

  const png = () => {
    const c = ref.current?.querySelector('canvas')
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = '3d-bar-chart.png'
    a.click()
  }

  const rowSum = p.v.map((r) => r.reduce((a, b) => a + b, 0))
  const colSum = p.series.map((_, j) => p.v.reduce((a, r) => a + (r[j] ?? 0), 0))
  const u = (x: number) => `${fmt(x, 4)}${s.unit ? ' ' + s.unit : ''}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode, text: mode === 'wide' ? WIDE : LONG })} options={[['wide', 'Pivot table'], ['long', 'Long rows → pivot']]} />
          <p className="k-hint" style={{ margin: '6px 0' }}>
            {s.mode === 'wide' ? 'First column = categories (X axis), header row = series (depth axis). Paste from a spreadsheet (CSV, TSV or ;).' : 'Columns: category, series, value. Rows are aggregated into a pivot table.'}
          </p>
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} mono />
          {s.mode === 'long' && <Select label="Aggregate" value={s.agg} onChange={(agg) => set({ agg })} options={[['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count rows'], ['max', 'Maximum']]} />}
          {err && <Note tone="warn">{err}</Note>}
        </Panel>
        <Panel title="Appearance">
          <label className="k-field"><span className="k-label">Title</span><input className="k-text" value={s.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="k-field"><span className="k-label">Unit</span><input className="k-text" value={s.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
          <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['series', 'Color by series'], ['category', 'By category'], ['value', 'Heat by value']]} />
          <Slider label="Bar width" value={s.width} onChange={(width) => set({ width })} min={0.2} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Chart height" value={s.height} onChange={(height) => set({ height })} min={2} max={12} step={0.5} />
          <Check label="Value labels on bars" value={s.labels} onChange={(labels) => set({ labels })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Bars" value={all.length} sub={`${p.cats.length} × ${p.series.length}`} />
          <Stat label="Total" value={u(total)} />
          <Stat label="Largest" value={u(max)} sub={p.cats.length ? `${p.cats[top[0]]} · ${p.series[top[1]]}` : ''} tone="accent" />
          <Stat label="Average bar" value={u(all.length ? total / all.length : 0)} />
        </Stats>
        <Panel title="3D chart" actions={<Btn onClick={png}>⬇ PNG</Btn>}>
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={480} />
            {hover && p.v[hover.c] && (
              <div className="k-tip" style={{ left: Math.max(4, hover.x + 14), top: Math.max(4, hover.y - 10), position: 'absolute', pointerEvents: 'none' }}>
                <b>{p.cats[hover.c]}</b> · <span style={{ color: color(hover.s) }}>{p.series[hover.s]}</span>
                <div>{u(p.v[hover.c][hover.s])} <span className="muted">({((p.v[hover.c][hover.s] / (total || 1)) * 100).toFixed(1)}% of total)</span></div>
              </div>
            )}
          </div>
          <p className="k-hint">Drag to orbit, scroll to zoom, right-drag to pan. Hover a bar for its value.</p>
        </Panel>
        <Panel title="Pivot table" actions={<>
          <CsvButton name="pivot.csv" rows={() => [['', ...p.series, 'Total'], ...p.cats.map((c, i) => [c, ...p.v[i], rowSum[i]]), ['Total', ...colSum, total]]} />
          <CopyButton text={() => [['', ...p.series].join('\t'), ...p.cats.map((c, i) => [c, ...p.v[i]].join('\t'))].join('\n')} label="Copy TSV" />
        </>}>
          <Table head={['', ...p.series, 'Total']} rows={p.cats.map((c, i) => [<b key="c">{c}</b>, ...p.v[i].map((x) => fmt(x, 4)), <b key="t">{fmt(rowSum[i], 4)}</b>])} foot={['Total', ...colSum.map((x) => fmt(x, 4)), fmt(total, 4)]} />
        </Panel>
      </div>
    </Split>
  )
}
