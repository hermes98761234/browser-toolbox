import { useRef } from 'react'
import { Btn, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D, label } from '../kit/three'
import { analyse, ENDS, MATERIALS, shear, type Ends, type Input } from './lib/spring-design-calculator'

const DEF: Input & { comp: number } = { d: 2, D: 16, Na: 8, L0: 50, ends: 'squaredGround', mat: 'music', Fmax: 40, Fmin: 10, seating: 'fixed', comp: 0.4 }

const PRESETS: { name: string; v: Partial<Input> }[] = [
  { name: 'Pen click', v: { d: 0.4, D: 3.2, Na: 12, L0: 22, ends: 'squared', mat: 'ss302', Fmax: 1.2, Fmin: 0.3 } },
  { name: 'Valve spring', v: { d: 4.5, D: 28, Na: 6, L0: 52, ends: 'squaredGround', mat: 'crsi', Fmax: 650, Fmin: 280 } },
  { name: 'Die / press', v: { d: 6, D: 40, Na: 7, L0: 110, ends: 'squaredGround', mat: 'crv', Fmax: 900, Fmin: 200 } },
  { name: 'Battery contact', v: { d: 0.6, D: 6, Na: 4, L0: 10, ends: 'squared', mat: 'music', Fmax: 3, Fmin: 1 } },
]

/** Centreline of the spring at overall length L (mm), with closed end coils. */
class SpringCurve extends THREE.Curve<THREE.Vector3> {
  R: number
  turns: number
  zAt: (s: number) => number
  constructor(R: number, turns: number, zAt: (s: number) => number) {
    super()
    this.R = R
    this.turns = turns
    this.zAt = zAt
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const s = t * this.turns
    const a = s * Math.PI * 2
    return target.set(this.R * Math.cos(a), this.zAt(s), this.R * Math.sin(a))
  }
}

export default function SpringDesignCalculator() {
  const [s, set, reset] = useToolState('spring-design-calculator', DEF)
  const valid = s.d > 0 && s.D > s.d && s.Na > 0.5 && s.L0 > 0
  const r = analyse(s)
  const L = s.L0 - s.comp * Math.max(0, s.L0 - r.Ls) // current length
  const F = r.k * (s.L0 - L)
  const tau = shear(r.KB, F, s.D, s.d)
  const group = useRef<THREE.Group | null>(null)

  const ref = useStage3D(
    (st) => { group.current = new THREE.Group(); st.scene.add(group.current) },
    (st) => {
      const g = group.current
      if (!g || !valid) return
      st.clear(g)
      const sc = 6 / Math.max(s.L0, s.D * 1.5) // fit into view
      const e = ENDS[s.ends]
      const dead = e.extra / 2 // dead turns per end
      const Nt = r.Nt
      const zMin = s.d / 2
      const zMax = L - s.d / 2
      const activeSpan = Math.max(0, zMax - zMin - 2 * dead * s.d)
      const zAt = (u: number) => {
        if (u <= dead) return zMin + u * s.d
        if (u >= Nt - dead) return zMax - (Nt - u) * s.d
        return zMin + dead * s.d + ((u - dead) / Math.max(1e-6, Nt - 2 * dead)) * activeSpan
      }
      const curve = new SpringCurve((s.D / 2) * sc, Nt, (u) => zAt(u) * sc)
      const ratio = Math.min(1.2, tau / r.Ssy)
      const col = new THREE.Color().setHSL(Math.max(0, 0.33 - ratio * 0.33), 0.75, 0.5)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.ceil(Nt * 64), (s.d / 2) * sc, 14, false),
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.7, roughness: 0.3 }),
      )
      g.add(tube)
      const plateR = (s.D / 2 + s.d) * sc * 1.25
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.85 })
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR, 0.12, 48), plateMat)
      p1.position.y = -0.06
      const p2 = p1.clone()
      p2.position.y = L * sc + 0.06
      g.add(p1, p2)
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, L * sc + 1.4, 0), 1.2, 0xef4444, 0.35, 0.22)
      g.add(arrow)
      const t1 = label(`F = ${F.toFixed(F < 10 ? 2 : 0)} N`, '#fca5a5', 0.38)
      t1.position.set(plateR + 0.9, L * sc + 0.4, 0)
      const t2 = label(`L = ${L.toFixed(1)} mm`, '#e2e8f0', 0.34)
      t2.position.set(plateR + 0.9, (L * sc) / 2, 0)
      g.add(t1, t2)
      g.position.y = 0.06
    },
    [s.d, s.D, s.Na, s.L0, s.ends, s.comp, s.mat, valid],
    { camera: [7, 5, 8], target: [0, 2.6, 0] },
  )

  const curve = valid ? [[0, 0], [s.L0 - r.Ls, r.Fs]] as [number, number][] : []
  const statusTone = (ok: boolean) => (ok ? 'good' : 'bad') as 'good' | 'bad'

  return (
    <Split>
      <div>
        <Panel title="Geometry" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{PRESETS.map((p) => <Btn key={p.name} onClick={() => set({ ...p.v, comp: 0.4 })}>{p.name}</Btn>)}</Row>
          <Row>
            <Num label="Wire diameter d" unit="mm" value={s.d} min={0.1} step={0.1} onChange={(d) => set({ d })} />
            <Num label="Mean coil diameter D" unit="mm" value={s.D} min={0.5} step={0.5} onChange={(D) => set({ D })} />
          </Row>
          <Row>
            <Num label="Active coils Na" value={s.Na} min={1} step={0.25} onChange={(Na) => set({ Na })} />
            <Num label="Free length L0" unit="mm" value={s.L0} min={1} step={1} onChange={(L0) => set({ L0 })} />
          </Row>
          <Row>
            <Select label="End type" value={s.ends} onChange={(ends) => set({ ends: ends as Ends })} options={Object.entries(ENDS).map(([k, v]) => [k as Ends, v.label] as const)} />
            <Select label="Material" value={s.mat} onChange={(mat) => set({ mat })} options={Object.entries(MATERIALS).map(([k, v]) => [k, v.name] as const)} />
          </Row>
          <Select label="End seating (buckling)" value={s.seating} onChange={(seating) => set({ seating })} options={[['fixed', 'Both ends on parallel plates (α = 0.5)'], ['oneFixed', 'One fixed, one pivoted (α = 0.707)'], ['pinned', 'Both ends pivoted (α = 1)']]} />
        </Panel>
        <Panel title="Loads">
          <Row>
            <Num label="Working load Fmax" unit="N" value={s.Fmax} min={0} onChange={(Fmax) => set({ Fmax })} />
            <Num label="Minimum load Fmin" unit="N" value={s.Fmin} min={0} onChange={(Fmin) => set({ Fmin })} hint="for fatigue" />
          </Row>
          <Slider label="Compress the 3D model" value={s.comp} onChange={(comp) => set({ comp })} min={0} max={1} step={0.01} show={(v) => `${(v * 100).toFixed(0)}% of travel to solid`} />
        </Panel>
        <Panel title="Design checks">
          {valid ? r.checks.map((c, i) => <Note key={i} tone={c.ok ? 'ok' : 'warn'}>{c.ok ? '✓' : '⚠'} {c.text}</Note>) : <Note tone="err">Need d &gt; 0, D &gt; d, Na &gt; 0.5 and L0 &gt; 0.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Spring rate k" value={`${r.k.toFixed(r.k < 10 ? 3 : 1)} N/mm`} tone="accent" />
          <Stat label="Solid height Ls" value={`${r.Ls.toFixed(2)} mm`} sub={`${r.Nt} total coils`} />
          <Stat label="Deflection @ Fmax" value={`${r.yMax.toFixed(2)} mm`} sub={`L = ${(s.L0 - r.yMax).toFixed(2)} mm`} />
          <Stat label="Static safety" value={r.nStatic.toFixed(2)} sub={`τ ${r.tauMax.toFixed(0)} MPa`} tone={statusTone(r.nStatic >= 1.2)} />
          <Stat label="Fatigue safety (Gerber)" value={Number.isFinite(r.nf) ? r.nf.toFixed(2) : '—'} sub="Zimmerli, unpeened" tone={statusTone(r.nf >= 1.5)} />
          <Stat label="Surge frequency" value={`${r.fn.toFixed(0)} Hz`} sub="keep ≥ 15–20× operating" />
        </Stats>
        <Panel title="3D model" actions={<span className="muted" style={{ fontSize: 12 }}>colour = τ / Ssy (green → red) · now τ = {tau.toFixed(0)} MPa</span>}>
          <View3D refEl={ref} height={400} />
        </Panel>
        <Panel title="Force vs deflection">
          <LineChart height={220} xLabel="Deflection (mm)" yLabel="Force (N)" series={[{ name: 'F = k·y', points: curve, area: true }]}
            markers={[{ x: s.Fmin / r.k, label: 'Fmin' }, { x: r.yMax, label: 'Fmax' }, { x: s.L0 - r.Ls, label: 'solid' }]} />
        </Panel>
        <Panel title="Details">
          <Table head={['Quantity', 'Value']} rows={[
            ['Spring index C = D/d', r.C.toFixed(2)],
            ['Wahl factor Kw / Bergsträsser KB', `${r.Kw.toFixed(4)} / ${r.KB.toFixed(4)}`],
            ['Tensile strength Sut = A/dᵐ', `${r.Sut.toFixed(0)} MPa`],
            ['Torsional yield Ssy', `${r.Ssy.toFixed(0)} MPa (${(r.mat.ssyFrac * 100).toFixed(0)}% Sut)`],
            ['Pitch (active coils)', `${r.pitch.toFixed(2)} mm`],
            ['Force to solid Fs', `${r.Fs.toFixed(1)} N → τs ${r.tauSolid.toFixed(0)} MPa`],
            ['Alternating / mean stress', `${r.ta.toFixed(0)} / ${r.tm.toFixed(0)} MPa`],
            ['Critical free length (buckling)', `${r.Lcrit.toFixed(1)} mm`],
            ['Outside / inside diameter', `${(s.D + s.d).toFixed(2)} / ${(s.D - s.d).toFixed(2)} mm`],
            ['Wire length / mass', `${r.wireLen.toFixed(0)} mm / ${(r.massAll * 1000).toFixed(2)} g`],
          ]} />
          <Note>k = G·d⁴ / (8·D³·Na); τ = K·8FD / (πd³). Strength constants per Shigley table 10-4. Verify critical springs with the supplier.</Note>
        </Panel>
      </div>
    </Split>
  )
}
