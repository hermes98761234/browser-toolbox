import { useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, download, fmt, Legend, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { DIR_NAMES, DIRS, feetInches, fittings, groupFittings, iso, MATERIALS, pipeTakeoff, SYSTEMS, vertices, type Dir, type Run, type System, type V3 } from './lib/pipe-routing-visualizer'

const SIZES = ['3/8', '1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '3', '4']
const DEF = {
  runs: [
    { id: 'r1', name: 'Building drain + stack', system: 'drain', material: 'PVC', size: '3', start: [-12, -7, 0], steps: 'E12 U9.5' },
    { id: 'r2', name: 'Stack vent', system: 'vent', material: 'PVC', size: '3', start: [0, 2.5, 0], steps: 'U8' },
    { id: 'r3', name: 'Toilet branch', system: 'drain', material: 'PVC', size: '3', start: [0, -1, 0], steps: 'S4 U1' },
    { id: 'r4', name: 'Lavatory arm', system: 'drain', material: 'PVC', size: '1-1/2', start: [0, 1.5, 0], steps: 'E3 U0.5' },
    { id: 'r5', name: 'Cold main', system: 'cold', material: 'PEX', size: '3/4', start: [-10, -6, -2], steps: 'E13 U6' },
    { id: 'r6', name: 'Toilet supply', system: 'cold', material: 'PEX', size: '1/2', start: [0, -6, -2], steps: 'S6 U6.5' },
    { id: 'r7', name: 'Lav cold', system: 'cold', material: 'PEX', size: '1/2', start: [3, 0, -2], steps: 'U1.5 S1.5' },
    { id: 'r8', name: 'Hot main', system: 'hot', material: 'Copper', size: '3/4', start: [-10, -6, -1], steps: 'E13.5 U6 U1.5 S0.5' },
  ] as Run[],
  sel: 'r1',
  stepLen: 2,
  waste: 10,
  labels: true,
}

const sizeIn = (s: string) => s.split(/[\s-]+/).reduce((a, t) => a + (t.includes('/') ? Number(t.split('/')[0]) / Number(t.split('/')[1]) : Number(t) || 0), 0)

function isoSvg(runs: Run[], fit: ReturnType<typeof fittings>, labels: boolean): string {
  const S = 22
  const all = runs.flatMap((r) => vertices(r).pts.map(iso))
  if (!all.length) return ''
  const xs = all.map((p) => p[0] * S), ys = all.map((p) => p[1] * S)
  const x0 = Math.min(...xs) - 50, y0 = Math.min(...ys) - 40, W = Math.max(...xs) - x0 + 50, H = Math.max(...ys) - y0 + 40
  const P = (p: V3) => iso(p).map((v) => v * S) as [number, number]
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" font-family="Arial, sans-serif"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>`]
  for (const r of runs) {
    const { pts } = vertices(r)
    const c = SYSTEMS[r.system].color === '#94a3b8' ? '#475569' : SYSTEMS[r.system].color
    out.push(`<polyline points="${pts.map((p) => P(p).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="${(1.5 + sizeIn(r.size) * 1.2).toFixed(1)}" stroke-linejoin="round"${r.system === 'vent' ? ' stroke-dasharray="8 4"' : ''}/>`)
    if (labels)
      for (let i = 1; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) < 1.5) continue
        const a = P(pts[i - 1]), b = P(pts[i])
        const len = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]) + Math.abs(pts[i][2] - pts[i - 1][2])
        out.push(`<text x="${((a[0] + b[0]) / 2 + 5).toFixed(1)}" y="${((a[1] + b[1]) / 2 - 4).toFixed(1)}" font-size="10" fill="#334155">${feetInches(len)}</text>`)
      }
    const st = P(pts[0])
    if (labels) out.push(`<text x="${(st[0] + 6).toFixed(1)}" y="${(st[1] + 12).toFixed(1)}" font-size="10" font-weight="bold" fill="${c}">${r.name.replace(/[<&]/g, '')} · ${r.size}″ ${r.material}</text>`)
  }
  for (const f of fit) {
    const [x, y] = P(f.at)
    const tee = /tee|wye/i.test(f.type)
    out.push(tee ? `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="#0f172a"/>` : /elbow/.test(f.type) ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#0f172a"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#fff" stroke="#0f172a" stroke-width="1.5"/>`)
  }
  out.push('</svg>')
  return out.join('')
}

export default function PipeRoutingVisualizer() {
  const [s, set, reset] = useToolState('pipe-routing-visualizer', DEF)
  const [hide, setHide] = useState<Record<string, boolean>>({})
  const stage = useRef<Stage3D | null>(null)
  const runs = s.runs
  const sel = runs.find((r) => r.id === s.sel) ?? runs[0]
  const geo = useMemo(() => runs.map((r) => ({ r, ...vertices(r) })), [runs])
  const fit = useMemo(() => fittings(runs), [runs])
  const grouped = useMemo(() => groupFittings(fit), [fit])
  const pipes = useMemo(() => pipeTakeoff(runs, s.waste / 100), [runs, s.waste])
  const svg = useMemo(() => isoSvg(runs.filter((r) => !hide[r.system]), fit, s.labels), [runs, fit, s.labels, hide])
  const edit = (patch: Partial<Run>) => sel && set({ runs: runs.map((r) => (r.id === sel.id ? { ...r, ...patch } : r)) })
  const errors = geo.filter((g) => g.error)
  const total = pipes.reduce((a, p) => a + p.length, 0)

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const g = new THREE.Group()
      g.name = 'root'
      st.scene.add(g)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const up = new THREE.Vector3(0, 1, 0)
      for (const g of geo) {
        if (hide[g.r.system]) continue
        const r = Math.max(0.08, (sizeIn(g.r.size) / 24) * 1.6)
        const on = g.r.id === sel?.id
        const mat = new THREE.MeshStandardMaterial({ color: SYSTEMS[g.r.system].color, roughness: 0.45, metalness: g.r.material === 'Copper' || g.r.material === 'Black iron' ? 0.6 : 0.1, emissive: on ? '#ffffff' : '#000000', emissiveIntensity: on ? 0.25 : 0 })
        for (let i = 1; i < g.pts.length; i++) {
          const a = new THREE.Vector3(...g.pts[i - 1]), b = new THREE.Vector3(...g.pts[i])
          const len = a.distanceTo(b)
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18), mat)
          m.position.copy(a).add(b).multiplyScalar(0.5)
          m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize())
          root.add(m)
        }
        if (s.labels) {
          const l = label(g.r.name, SYSTEMS[g.r.system].color, 0.6)
          const p = g.pts[g.pts.length - 1]
          l.position.set(p[0], p[1] + 0.6, p[2])
          root.add(l)
        }
      }
      for (const f of fit) {
        const run = runs.find((r) => f.run.startsWith(r.name))
        if (run && hide[run.system]) continue
        const r = Math.max(0.08, (sizeIn(f.size) / 24) * 1.6)
        const tee = /tee|wye/i.test(f.type), elbow = /elbow/.test(f.type), cap = /cap|stub|terminal|cleanout/i.test(f.type)
        const geom = elbow || tee ? new THREE.SphereGeometry(r * (tee ? 1.6 : 1.35), 20, 14) : new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * (cap ? 1.2 : 1.8), 18)
        const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: tee ? '#f8fafc' : cap ? '#f97316' : '#cbd5e1', roughness: 0.5 }))
        m.position.set(...f.at)
        if (!elbow && !tee) {
          // align couplings/caps with the pipe they sit on
          const g = geo.find((x) => f.run.startsWith(x.r.name))
          const i = g ? g.pts.findIndex((p) => p.every((v, k) => Math.abs(v - f.at[k]) < 1e-6)) : -1
          const d = g && g.dirs.length ? DIRS[g.dirs[Math.max(0, Math.min(g.dirs.length - 1, i < 0 ? 0 : i === g.pts.length - 1 ? i - 1 : i))]] : ([0, 1, 0] as V3)
          m.quaternion.setFromUnitVectors(up, new THREE.Vector3(...d))
        }
        root.add(m)
      }
    },
    [geo, fit, sel?.id, s.labels, hide],
    { camera: [10, 6, 19], target: [-4, 0, 0] },
  )

  const addStep = (d: Dir) => edit({ steps: `${sel.steps.trim()} ${d}${s.stepLen}`.trim() })
  const endOf = (r: Run) => {
    const p = vertices(r).pts
    return p[p.length - 1]
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Runs" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          {runs.map((r) => (
            <label key={r.id} className="k-check" style={{ display: 'flex', gap: 6, padding: '3px 0' }}>
              <input type="radio" checked={r.id === sel?.id} onChange={() => set({ sel: r.id })} />
              <i style={{ width: 10, height: 10, borderRadius: 3, background: SYSTEMS[r.system].color, display: 'inline-block', marginTop: 5 }} />
              <span style={{ flex: 1 }}>{r.name} <span className="muted">· {r.size}″ {r.material}</span></span>
            </label>
          ))}
          <Row>
            <Btn onClick={() => {
              const id = uid()
              set({ runs: [...runs, { id, name: `Run ${runs.length + 1}`, system: 'cold', material: 'PEX', size: '1/2', start: [0, 0, 4], steps: 'E4' }], sel: id })
            }}>+ New run</Btn>
            <Btn disabled={!sel} onClick={() => {
              const id = uid()
              set({ runs: [...runs, { ...sel, id, name: `${sel.name} (cont.)`, start: endOf(sel), steps: 'U2' }], sel: id })
            }}>↳ Continue from end</Btn>
          </Row>
        </Panel>
        {sel && (
          <Panel title={`Edit: ${sel.name}`} actions={<Btn kind="danger" onClick={() => set({ runs: runs.filter((r) => r.id !== sel.id), sel: runs[0]?.id ?? '' })}>Delete</Btn>}>
            <Txt label="Name" value={sel.name} onChange={(name) => edit({ name })} />
            <Row>
              <Select label="System" value={sel.system} onChange={(system) => edit({ system: system as System })} options={Object.entries(SYSTEMS).map(([k, v]) => [k, v.name] as const)} />
              <Select label="Material" value={sel.material} onChange={(material) => edit({ material })} options={Object.keys(MATERIALS)} />
              <Select label="Size (in)" value={sel.size} onChange={(size) => edit({ size })} options={SIZES} />
            </Row>
            <Row>
              {(['X', 'Y (up)', 'Z'] as const).map((n, k) => (
                <Num key={n} label={`Start ${n}`} value={sel.start[k]} step={0.5} unit="ft" onChange={(v) => edit({ start: sel.start.map((x, j) => (j === k ? v : x)) as V3 })} />
              ))}
            </Row>
            <Txt label="Moves (direction + feet)" value={sel.steps} onChange={(steps) => edit({ steps })} hint="E/W = ±X, S/N = ±Z, U/D = up/down. Example: E12 U9.5" />
            <Row>
              <Num label="Step" value={s.stepLen} onChange={(stepLen) => set({ stepLen: Math.max(0.25, stepLen) })} unit="ft" min={0.25} step={0.5} />
              {(Object.keys(DIRS) as Dir[]).map((d) => (
                <Btn key={d} onClick={() => addStep(d)} title={DIR_NAMES[d]}>{d === 'U' ? '↑ U' : d === 'D' ? '↓ D' : d}</Btn>
              ))}
              <Btn kind="ghost" onClick={() => edit({ steps: sel.steps.trim().split(/\s+/).slice(0, -1).join(' ') })}>⌫ Undo</Btn>
            </Row>
          </Panel>
        )}
        {errors.map((g) => <Note key={g.r.id} tone="err">{g.r.name}: {g.error}</Note>)}
      </div>
      <div>
        <Stats>
          <Stat label="Pipe" value={`${fmt(total, 4)} ft`} sub={`${runs.length} runs`} />
          <Stat label="Fittings" value={fit.length} sub={`${fit.filter((f) => /elbow/.test(f.type)).length} elbows · ${fit.filter((f) => /tee|wye/i.test(f.type)).length} tees`} />
          <Stat label="Stock lengths" value={pipes.reduce((a, p) => a + p.sticks, 0)} sub={`incl. ${s.waste}% waste`} />
        </Stats>
        <Panel title="3-D view" actions={<Btn onClick={() => stage.current?.renderer.domElement.toBlob((b) => b && download('pipe-routing.png', b))}>⬇ PNG</Btn>}>
          <View3D refEl={ref} height={430} />
          <Row>
            {Object.entries(SYSTEMS).map(([k, v]) => (
              <Check key={k} label={<span style={{ color: v.color, fontWeight: 600 }}>{v.name}</span>} value={!hide[k]} onChange={(on) => setHide({ ...hide, [k]: !on })} />
            ))}
            <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
          </Row>
          <p className="muted">White spheres = tees, grey = elbows/couplings, orange = stub-outs and caps. Grid squares are 1 ft; y = 0 is the floor.</p>
        </Panel>
        <Panel title="Isometric drawing" actions={<Btn onClick={() => download('pipe-isometric.svg', svg, 'image/svg+xml')}>⬇ SVG</Btn>}>
          <div style={{ overflow: 'auto', background: '#fff', borderRadius: 8, maxHeight: 420 }} dangerouslySetInnerHTML={{ __html: svg }} />
          <Legend items={[['■ tee', '#0f172a'], ['● elbow', '#0f172a'], ['○ coupling / cap', '#64748b'], ['dashed = vent', '#22c55e']]} />
        </Panel>
        <Panel
          title="Material takeoff"
          actions={
            <>
              <Num label="Waste" value={s.waste} onChange={(waste) => set({ waste: Math.max(0, waste) })} unit="%" min={0} />
              <CsvButton name="pipe-takeoff.csv" rows={() => [['Item', 'Material', 'Size (in)', 'Quantity', 'Unit'], ...pipes.map((p) => ['Pipe', p.material, p.size, +p.length.toFixed(2), 'ft']), ...pipes.filter((p) => p.sticks).map((p) => ['Stock lengths', p.material, p.size, p.sticks, `${MATERIALS[p.material]} ft sticks`]), ...grouped.map((g) => [g.type, g.material, g.size, g.qty, 'ea'])]} />
            </>
          }
        >
          <Table head={['Pipe', 'Size', 'Length', 'Buy']} rows={pipes.map((p) => [<b key="m" style={{ color: SYSTEMS[p.system].color }}>{p.material}</b>, `${p.size}″`, feetInches(p.length), p.sticks ? `${p.sticks} × ${MATERIALS[p.material]} ft` : `${Math.ceil(p.length * (1 + s.waste / 100))} ft coil`])} />
          <Table head={['Fitting', 'Material', 'Size', 'Qty']} rows={grouped.map((g) => [g.type, g.material, `${g.size}″`, g.qty])} />
          <Note>Fittings are inferred: every change of direction gets a 90° elbow, a run starting on another run gets a tee (reducing if sizes differ), long rigid straights get couplings at stock length, open ends get stub-outs. Horizontal drains need ¼″/ft slope; check local code.</Note>
        </Panel>
      </div>
    </Split>
  )
}
