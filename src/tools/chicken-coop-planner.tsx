import { Btn, Check, CsvButton, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { autoSize, birds, checks, materials, NEST_CM, requirements, roostLayout, type Climate, type Design, type Flock } from './lib/chicken-coop-planner'

const DEF = {
  flock: { bantam: 0, standard: 6, large: 0 } as Flock,
  design: { w: 2, d: 1.4, h: 1.2, legs: 0.5, runW: 2.6, runL: 2.4, runH: 1.9, roof: 'gable', pitch: 30, overhang: 0.15, confined: false, climate: 'temperate' } as Design,
  imperial: false,
  cutaway: true,
  hens: true,
  labels: true,
}
const FT = 3.28084

export default function ChickenCoopPlanner() {
  const [s, set, reset] = useToolState('chicken-coop-planner', DEF)
  const d = s.design, f = s.flock
  const r = requirements(f, d.confined, d.climate)
  const ch = checks(d, f)
  const mats = materials(d, f)
  const roost = roostLayout(d, r.roost)
  const L = (m: number) => (s.imperial ? `${num(m * FT, 1)} ft` : `${num(m, 2)} m`)
  const A = (m2: number) => (s.imperial ? `${num(m2 * FT * FT, 0)} ft²` : `${num(m2, 2)} m²`)
  const setD = (p: Partial<Design>) => set({ design: { ...d, ...p } })
  const setF = (p: Partial<Flock>) => set({ flock: { ...f, ...p } })
  const n = birds(f)

  const ref = useStage3D(
    () => undefined,
    (st) => {
      let g = st.scene.getObjectByName('coop') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'coop'
        st.scene.add(g)
      }
      st.clear(g)
      const M = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o })
      const box = (w: number, h: number, dd: number, x: number, y: number, z: number, m: THREE.Material) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m)
        b.position.set(x, y, z)
        g!.add(b)
        return b
      }
      const wood = M('#b45309'), wall = M('#dc2626', s.cutaway ? { transparent: true, opacity: 0.35 } : {}), trim = M('#f8fafc'), roofM = M('#334155', { side: THREE.DoubleSide })
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), M('#4d7c0f'))
      ground.rotation.x = -Math.PI / 2
      g.add(ground)
      const y0 = d.legs
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.07, y0, 0.07, (sx * d.w) / 2 - sx * 0.035, y0 / 2, (sz * d.d) / 2 - sz * 0.035, wood)
      box(d.w, 0.04, d.d, 0, y0 + 0.02, 0, wood)
      const t = 0.03
      box(d.w, d.h, t, 0, y0 + d.h / 2, -d.d / 2, wall) // back
      if (!s.cutaway) box(d.w, d.h, t, 0, y0 + d.h / 2, d.d / 2, wall) // front
      else box(d.w, 0.08, t, 0, y0 + 0.04, d.d / 2, trim)
      box(t, d.h, d.d, -d.w / 2, y0 + d.h / 2, 0, wall)
      box(t, d.h, d.d, d.w / 2, y0 + d.h / 2, 0, wall)
      // pop door on the run side
      box(0.01, 0.38, 0.3, d.w / 2 + 0.02, y0 + 0.22, 0, M('#1f2937'))
      // roof
      const pitch = (d.pitch * Math.PI) / 180
      const top = y0 + d.h
      if (d.roof === 'gable') {
        const half = d.w / 2 + d.overhang
        const len = half / Math.cos(pitch)
        const rise = (d.w / 2) * Math.tan(pitch)
        for (const sgn of [-1, 1]) {
          const p = box(len, 0.03, d.d + 2 * d.overhang, (sgn * half) / 2, top + rise - (half * Math.tan(pitch)) / 2, 0, roofM)
          p.rotation.z = -sgn * pitch
        }
        const tri = new THREE.Shape([new THREE.Vector2(-d.w / 2, 0), new THREE.Vector2(d.w / 2, 0), new THREE.Vector2(0, rise)])
        for (const z of [-d.d / 2, d.d / 2]) {
          const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), M('#b91c1c', { side: THREE.DoubleSide }))
          m.position.set(0, top, z)
          g.add(m)
        }
      } else {
        const len = (d.w + 2 * d.overhang) / Math.cos(pitch)
        const p = box(len, 0.03, d.d + 2 * d.overhang, 0, top + (d.w / 2) * Math.tan(pitch), 0, roofM)
        p.rotation.z = pitch
      }
      // nest boxes on the left wall, outside
      const nc = r.nestCm / 100
      const fit = Math.max(1, Math.min(r.nests, Math.floor(d.d / (nc + 0.02))))
      for (let k = 0; k < r.nests; k++) {
        const row = Math.floor(k / fit), col = k % fit
        const z = -d.d / 2 + (d.d - fit * (nc + 0.02)) / 2 + col * (nc + 0.02) + nc / 2 + 0.01
        const y = y0 + 0.25 + row * (nc + 0.04) + nc / 2
        const nb = box(nc, nc, nc, -d.w / 2 - nc / 2, y, z, M('#a16207'))
        const straw = new THREE.Mesh(new THREE.BoxGeometry(nc * 0.9, 0.04, nc * 0.9), M('#fde68a'))
        straw.position.y = -nc / 2 + 0.03
        nb.add(straw)
      }
      // roosts: ladder-style bars along the depth
      const rm = M('#78350f')
      for (let k = 0; k < roost.bars; k++) {
        const x = d.w / 2 - 0.3 - k * 0.35
        const y = Math.min(top - 0.3, y0 + 0.55 + k * 0.12)
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, roost.length, 10), rm)
        bar.rotation.x = Math.PI / 2
        bar.position.set(x, y, 0)
        g.add(bar)
      }
      // ramp
      const rampLen = Math.hypot(y0, y0 * 1.6)
      const ramp = box(rampLen, 0.025, 0.3, d.w / 2 + (y0 * 1.6) / 2, y0 / 2, 0, wood)
      ramp.rotation.z = -Math.atan2(y0, y0 * 1.6)
      // run
      if (!d.confined) {
        const x0 = d.w / 2, x1 = d.w / 2 + d.runL, zr = d.runW / 2
        const post = M('#92400e')
        for (const [x, z] of [[x0, -zr], [x1, -zr], [x0, zr], [x1, zr]]) box(0.06, d.runH, 0.06, x, d.runH / 2, z, post)
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d.runL, d.runH, d.runW)), new THREE.LineBasicMaterial({ color: '#78350f' }))
        frame.position.set((x0 + x1) / 2, d.runH / 2, 0)
        g.add(frame)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.runL, d.runH, d.runW, Math.ceil(d.runL / 0.1), Math.ceil(d.runH / 0.1), Math.ceil(d.runW / 0.1)), new THREE.MeshBasicMaterial({ color: '#cbd5e1', wireframe: true, transparent: true, opacity: 0.18 }))
        mesh.position.copy(frame.position)
        g.add(mesh)
      }
      // hens
      if (s.hens) {
        let seed = 5
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        const kinds: [number, number, string][] = []
        ;(['bantam', 'standard', 'large'] as const).forEach((k, i) => {
          for (let j = 0; j < Math.min(60, f[k]); j++) kinds.push([[0.7, 1, 1.3][i], 0, ['#f5f5f4', '#9a3412', '#1c1917', '#fbbf24'][j % 4]])
        })
        kinds.forEach(([sc, , col], i) => {
          const h = new THREE.Group()
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), M(col))
          body.scale.set(1.3, 1, 0.9)
          body.position.y = 0.14
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M(col))
          head.position.set(0.13, 0.27, 0)
          const comb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), M('#dc2626'))
          comb.position.set(0.13, 0.32, 0)
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 6), M('#f59e0b'))
          beak.rotation.z = -Math.PI / 2
          beak.position.set(0.19, 0.27, 0)
          const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), M(col))
          tail.rotation.z = Math.PI / 3
          tail.position.set(-0.15, 0.22, 0)
          h.add(body, head, comb, beak, tail)
          h.scale.setScalar(sc)
          h.rotation.y = rnd() * Math.PI * 2
          if (d.confined || i % 5 === 4) h.position.set((rnd() - 0.5) * (d.w - 0.4), y0 + 0.04, (rnd() - 0.5) * (d.d - 0.4))
          else h.position.set(d.w / 2 + 0.3 + rnd() * Math.max(0.1, d.runL - 0.6), 0, (rnd() - 0.5) * Math.max(0.1, d.runW - 0.5))
          g!.add(h)
        })
      }
      if (s.labels) {
        const lw = label(L(d.w), '#fef08a', 0.18)
        lw.position.set(0, y0 - 0.15, d.d / 2 + 0.25)
        const ld = label(L(d.d), '#fef08a', 0.18)
        ld.position.set(-d.w / 2 - nc - 0.35, y0 - 0.15, 0)
        g.add(lw, ld)
        if (!d.confined) {
          const lr = label(`run ${L(d.runL)} × ${L(d.runW)}`, '#fef08a', 0.18)
          lr.position.set(d.w / 2 + d.runL / 2, d.runH + 0.25, 0)
          g.add(lr)
        }
      }
    },
    [JSON.stringify(d), JSON.stringify(f), s.cutaway, s.hens, s.labels, s.imperial],
    { camera: [3.5, 3.2, 5.2], target: [1, 0.8, 0], grid: false, background: '#bae6fd' },
  )

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><title>Coop plan</title><style>body{font:13px system-ui,sans-serif;margin:14mm}td,th{border-bottom:1px solid #ccc;padding:5px;text-align:left}table{border-collapse:collapse;width:100%}</style><h2>Chicken coop plan — ${n} birds</h2><p>Coop ${L(d.w)} × ${L(d.d)}, ${L(d.h)} high on ${L(d.legs)} legs, ${d.roof} roof ${d.pitch}°. ${d.confined ? 'No run (confined).' : `Run ${L(d.runL)} × ${L(d.runW)} × ${L(d.runH)}.`}</p><h3>Checks</h3><table>${ch.map((c) => `<tr><td>${c.ok ? '✔' : '✘'} ${c.label}</td><td>${num(c.have, 2)} ${c.unit}</td><td>need ${num(c.need, 2)} ${c.unit}</td></tr>`).join('')}</table><h3>Materials</h3><table><tr><th>Item</th><th>Qty</th><th>Notes</th></tr>${mats.map((m) => `<tr><td>${m.item}</td><td>${m.qty} ${m.unit}</td><td>${m.note}</td></tr>`).join('')}</table><script>onload=()=>setTimeout(()=>print(),200)</script>`)
    w.document.close()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Flock" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Bantams" value={f.bantam} onChange={(bantam) => setF({ bantam: Math.max(0, Math.round(bantam)) })} min={0} step={1} />
            <Num label="Standard" value={f.standard} onChange={(standard) => setF({ standard: Math.max(0, Math.round(standard)) })} min={0} step={1} />
            <Num label="Large breeds" value={f.large} onChange={(large) => setF({ large: Math.max(0, Math.round(large)) })} min={0} step={1} />
          </Row>
          <p className="k-hint">Standard: most laying hens (Leghorn, Rhode Island Red, Sussex). Large: Brahma, Cochin, Jersey Giant, Orpington. Bantams need about half the space.</p>
          <Seg value={d.confined ? 'in' : 'run'} onChange={(v) => setD({ confined: v === 'in' })} options={[['run', 'Coop + outdoor run'], ['in', 'Confined, no run']]} />
          <Select label="Climate" value={d.climate} onChange={(climate) => setD({ climate: climate as Climate })} options={[['cold', 'Cold winters'], ['temperate', 'Temperate'], ['hot', 'Hot summers']]} />
          <Btn kind="primary" disabled={!n} onClick={() => setD(autoSize(f, d.confined, d.climate))}>✨ Size the coop for my flock</Btn>
        </Panel>
        <Panel title="Coop design">
          <Row>
            <Num label="Width" value={d.w} onChange={(w) => setD({ w })} unit="m" min={0.5} step={0.1} />
            <Num label="Depth" value={d.d} onChange={(dd) => setD({ d: dd })} unit="m" min={0.5} step={0.1} />
          </Row>
          <Row>
            <Num label="Wall height" value={d.h} onChange={(h) => setD({ h })} unit="m" min={0.5} step={0.1} />
            <Num label="Legs (floor height)" value={d.legs} onChange={(legs) => setD({ legs })} unit="m" min={0} step={0.05} />
          </Row>
          <Row>
            <Select label="Roof" value={d.roof} onChange={(roof) => setD({ roof })} options={[['gable', 'Gable'], ['shed', 'Shed (single slope)']]} />
            <Num label="Pitch" value={d.pitch} onChange={(pitch) => setD({ pitch: Math.max(5, Math.min(45, pitch)) })} unit="°" min={5} max={45} />
            <Num label="Overhang" value={d.overhang} onChange={(overhang) => setD({ overhang })} unit="m" min={0} step={0.05} />
          </Row>
          {!d.confined && (
            <Row>
              <Num label="Run length" value={d.runL} onChange={(runL) => setD({ runL })} unit="m" min={0.5} step={0.1} />
              <Num label="Run width" value={d.runW} onChange={(runW) => setD({ runW })} unit="m" min={0.5} step={0.1} />
              <Num label="Run height" value={d.runH} onChange={(runH) => setD({ runH })} unit="m" min={0.5} step={0.1} />
            </Row>
          )}
          <Seg value={s.imperial ? 'imp' : 'met'} onChange={(v) => set({ imperial: v === 'imp' })} options={[['met', 'Show metric'], ['imp', 'Show feet']]} />
        </Panel>
        <Panel title="Space rules used">
          <Table head={['Per bird', 'Bantam', 'Standard', 'Large']} rows={[
            ['Coop floor', A(0.19), A(0.37), A(0.46)],
            ['Run', A(0.46), A(0.93), A(1.4)],
            ['Roost', L(0.15), L(0.2), L(0.3)],
            ['Nest box', `${NEST_CM.bantam} cm`, `${NEST_CM.standard} cm`, `${NEST_CM.large} cm`],
          ]} />
          <p className="k-hint">Rules of thumb; give more room where you can. Without a run the coop floor needs about 2.5× the space. One nest box serves about four hens.</p>
        </Panel>
      </div>
      <div>
        <Panel title="3D model">
          <View3D refEl={ref} height={430} />
          <Row>
            <Check label="Cut-away front wall" value={s.cutaway} onChange={(cutaway) => set({ cutaway })} />
            <Check label="Show hens" value={s.hens} onChange={(hens) => set({ hens })} />
            <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
          </Row>
        </Panel>
        <Stats>
          <Stat label="Birds" value={n} sub={`${r.nests} nest box${r.nests === 1 ? '' : 'es'}`} />
          <Stat label="Coop floor" value={A(d.w * d.d)} sub={`need ${A(r.floor)}`} tone={d.w * d.d >= r.floor ? 'good' : 'bad'} />
          <Stat label="Roosts" value={`${roost.bars} × ${L(roost.length)}`} sub={`need ${L(r.roost)} total`} />
          <Stat label="Water / day" value={`${num(r.waterL, 1)} L`} sub={`feeder ${r.feederCm} cm of trough`} />
        </Stats>
        <Panel title="Design check">
          <Table head={['', 'Item', 'Design', 'Minimum']} rows={ch.map((c) => [c.ok ? '✅' : '⚠️', c.label, c.unit === 'm²' ? A(c.have) : c.unit === 'm' ? L(c.have) : num(c.have, 0), c.unit === 'm²' ? A(c.need) : c.unit === 'm' ? L(c.need) : num(c.need, 0)])} />
          {ch.every((c) => c.ok) ? <Note tone="ok">This design meets the space guidelines for {n} birds.</Note> : <Note tone="warn">Some items are below the guideline — try “Size the coop for my flock”.</Note>}
          <Note>Ventilation: at least {Math.round(r.vent * 10000)} cm² ({num(r.vent * 1550, 0)} in²) of mesh-covered openings high on the walls{d.climate === 'hot' ? ' — doubled for a hot climate' : ''}. Keep roosts higher than the nest boxes so hens don't sleep in them.</Note>
        </Panel>
        <Panel title="Materials (estimate)" actions={<><CsvButton name="coop-materials.csv" rows={() => [['Item', 'Quantity', 'Unit', 'Notes'], ...mats.map((m) => [m.item, m.qty, m.unit, m.note])]} /><Btn onClick={print}>🖨 Print plan</Btn></>}>
          <Table head={['Item', 'Qty', 'Notes']} rows={mats.map((m) => [m.item, <b key="q">{m.qty} {m.unit}</b>, <span key="n" className="muted">{m.note}</span>])} />
          <p className="k-hint">Quantities include 10–15 % waste. Use 13 mm welded hardware cloth rather than chicken wire to keep predators out.</p>
        </Panel>
      </div>
    </Split>
  )
}
