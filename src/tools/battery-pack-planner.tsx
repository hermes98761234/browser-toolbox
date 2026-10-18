import { Btn, CsvButton, LineChart, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { CELLS, compute, fmtH, runtimeCurve, suggest, type Cell } from './lib/battery-pack-planner'

interface State {
  cellId: string
  custom: Cell
  s: number
  p: number
  load: number
  mode: 'W' | 'A'
  dod: number
  eff: number
  overhead: number
  gap: number
  targetV: number
  hours: number
  peakA: number
}

const CUSTOM: Cell = { id: 'custom', name: 'Custom cell', chem: 'NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, ah: 3.0, iMax: 10, rMilli: 20, g: 48, shape: 'cyl', dims: [18.4, 65] }
const DEF: State = { cellId: '21700-e', custom: CUSTOM, s: 13, p: 4, load: 500, mode: 'W', dod: 90, eff: 92, overhead: 20, gap: 1, targetV: 48, hours: 1, peakA: 30 }

const PRESETS: [string, Partial<State>][] = [
  ['E-bike 48 V', { cellId: '21700-e', s: 13, p: 4, load: 500, mode: 'W' }],
  ['Power tool 18 V', { cellId: '18650-p', s: 5, p: 2, load: 25, mode: 'A' }],
  ['Solar 12 V LFP', { cellId: 'lfp-280', s: 4, p: 1, load: 150, mode: 'W' }],
  ['Drone 6S', { cellId: 'lipo-5', s: 6, p: 1, load: 40, mode: 'A' }],
  ['Power bank', { cellId: '18650-e', s: 1, p: 6, load: 15, mode: 'W' }],
  ['4×AA NiMH', { cellId: 'nimh-aa', s: 4, p: 1, load: 0.5, mode: 'A' }],
]

function buildPack(g: THREE.Group, cell: Cell, S: number, P: number, gap: number) {
  const cyl = cell.shape === 'cyl'
  const pitchX = (cyl ? cell.dims[0] : cell.dims[1]) + gap
  const pitchZ = cell.dims[0] + gap
  const H = cyl ? cell.dims[1] : cell.dims[2]
  const sx = S * pitchX, sz = P * pitchZ
  const k = 7 / Math.max(sx, sz, H)
  const ox = -((S - 1) * pitchX) / 2, oz = -((P - 1) * pitchZ) / 2
  const hues = [0x2563eb, 0x0ea5e9]
  const bodyMats = hues.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15 }))
  const plus = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.3 })
  const minus = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.7 })
  const nickel = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.85, transparent: true, opacity: 0.9 })
  const yTop = H * k, t = Math.max(0.02, 0.6 * k)
  const body = cyl ? new THREE.CylinderGeometry((cell.dims[0] / 2) * k, (cell.dims[0] / 2) * k, H * k, 28) : new THREE.BoxGeometry(cell.dims[1] * k, H * k, cell.dims[0] * k)
  const cap = cyl ? new THREE.CylinderGeometry((cell.dims[0] / 5) * k, (cell.dims[0] / 5) * k, 2 * k, 16) : new THREE.CylinderGeometry(Math.min(cell.dims[0] / 10, cell.dims[1] / 3) * k, Math.min(cell.dims[0] / 10, cell.dims[1] / 3) * k, 6 * k, 16)
  for (let i = 0; i < S; i++) {
    const up = i % 2 === 0
    for (let j = 0; j < P; j++) {
      const x = (ox + i * pitchX) * k, z = (oz + j * pitchZ) * k
      const m = new THREE.Mesh(body, bodyMats[i % 2])
      m.position.set(x, yTop / 2, z)
      g.add(m)
      if (cyl) {
        const c = new THREE.Mesh(cap, plus)
        c.position.set(x, up ? yTop + k : -k, z)
        g.add(c)
      } else {
        const off = (cell.dims[0] / 4) * k
        const a = new THREE.Mesh(cap, plus), b = new THREE.Mesh(cap, minus)
        a.position.set(x, yTop + 3 * k, z + (up ? -off : off))
        b.position.set(x, yTop + 3 * k, z + (up ? off : -off))
        g.add(a, b)
      }
    }
  }
  // series links: cylinders alternate top/bottom, prismatic all on top
  const strip = (i0: number, i1: number, y: number, zOff = 0) => {
    const w = (i1 - i0) * pitchX * k + (cyl ? cell.dims[0] * 0.5 * k : 8 * k)
    const geo = new THREE.BoxGeometry(w, t, cyl ? (P - 1) * pitchZ * k + cell.dims[0] * 0.5 * k : Math.max(8 * k, (P - 1) * pitchZ * k + 8 * k))
    const m = new THREE.Mesh(geo, nickel)
    m.position.set((ox + ((i0 + i1) / 2) * pitchX) * k, y, zOff)
    g.add(m)
  }
  if (cyl) {
    for (let i = 0; i < S; i++) {
      if (i % 2 === 0) strip(i, Math.min(i + 1, S - 1), yTop + 2 * k)
      if (i % 2 === 1 || i === 0) strip(i % 2 === 1 ? i : 0, i % 2 === 1 ? Math.min(i + 1, S - 1) : 0, -2 * k)
    }
  } else {
    const off = (cell.dims[0] / 4) * k
    for (let i = 0; i < S - 1; i++) strip(i, i + 1, yTop + 6 * k, (oz * k) + (i % 2 === 0 ? -off : off) - oz * k)
  }
  const neg = label('− pack', '#e2e8f0', 0.45), pos = label('+ pack', '#fca5a5', 0.45)
  neg.position.set(ox * k - 0.5, cyl ? -0.3 : yTop + 0.5, 0)
  const lastUp = (S - 1) % 2 === 0
  pos.position.set((ox + (S - 1) * pitchX) * k + 0.5, cyl ? (lastUp ? yTop + 0.4 : -0.3) : yTop + 0.5, 0)
  g.add(neg, pos)
  g.position.y = cyl ? 2 * k : 0
}

export default function BatteryPackPlanner() {
  const [s, set, reset] = useToolState('battery-pack-planner', DEF)
  const cell = s.cellId === 'custom' ? s.custom : CELLS.find((c) => c.id === s.cellId) ?? CELLS[0]
  const S = Math.min(40, Math.max(1, Math.round(s.s))), P = Math.min(40, Math.max(1, Math.round(s.p)))
  const r = compute({ cell, s: S, p: P, load: s.load, mode: s.mode, dod: s.dod, eff: s.eff, overhead: s.overhead, gap: s.gap })
  const loadW = s.mode === 'W' ? s.load : s.load * r.vNom * (s.eff / 100)
  const curve = runtimeCurve({ cell, s: S, p: P, load: s.load, mode: 'W', dod: s.dod, eff: s.eff, overhead: s.overhead, gap: s.gap }, Math.max(loadW * 2, 1))
  const editCell = (patch: Partial<Cell>) => set({ cellId: 'custom', custom: { ...cell, ...patch, id: 'custom', name: 'Custom cell' } })

  const ref = useStage3D(
    (st: Stage3D) => { const g = new THREE.Group(); g.name = 'pack'; st.scene.add(g) },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('pack') as THREE.Group
      st.clear(g)
      buildPack(g, cell, S, P, s.gap)
    },
    [cell, S, P, s.gap],
    { camera: [3.6, 4.2, 5.4], target: [0, 0.6, 0] },
  )

  const rows: [string, string][] = [
    ['Cells', `${r.cells} × ${cell.name}`],
    ['Nominal / full / cutoff voltage', `${num(r.vNom, 2)} / ${num(r.vMax, 2)} / ${num(r.vMin, 2)} V`],
    ['Capacity / energy', `${num(r.ah, 2)} Ah / ${num(r.wh, 1)} Wh`],
    ['Usable energy (DoD)', `${num(r.usableWh, 1)} Wh`],
    ['Max continuous current / power', `${num(r.iMax, 1)} A / ${num(r.pMax, 0)} W`],
    ['Load current (pack)', `${num(r.current, 2)} A (${num(r.perCellA, 2)} A per cell, ${num(r.cRate, 2)} C)`],
    ['Pack internal resistance', `${num(r.rPack * 1000, 1)} mΩ`],
    ['Voltage sag at load', `${num(r.sagV, 2)} V → ${num(r.vLoad, 2)} V under load`],
    ['Heat in cells at load', `${num(r.heatW, 1)} W`],
    ['Runtime at load', fmtH(r.runtimeH)],
    ['Cell mass / total with overhead', `${num((r.cells * cell.g) / 1000, 2)} kg / ${num(r.massKg, 2)} kg`],
    ['Specific energy (pack)', `${num(r.whPerKg, 0)} Wh/kg`],
    ['Charger', `${num(r.vMax, 1)} V CC/CV, ≤ ${num(0.5 * r.ah, 1)} A (0.5 C typical)`],
  ]
  const sug = suggest(cell, s.targetV, loadW, s.hours, s.peakA, s.dod, s.eff)

  return (
    <Split>
      <div>
        <Panel title="Cell" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Cell preset (typical values)" value={s.cellId} onChange={(cellId) => set({ cellId })} options={[...CELLS.map((c) => [c.id, c.name] as [string, string]), ['custom', 'Custom cell…']]} />
          <Row>
            <Num label="Nominal V" value={cell.vNom} onChange={(vNom) => editCell({ vNom })} unit="V" min={0.5} />
            <Num label="Full V" value={cell.vMax} onChange={(vMax) => editCell({ vMax })} unit="V" min={0.5} />
            <Num label="Cutoff V" value={cell.vMin} onChange={(vMin) => editCell({ vMin })} unit="V" min={0.5} />
          </Row>
          <Row>
            <Num label="Capacity" value={cell.ah} onChange={(ah) => editCell({ ah })} unit="Ah" min={0.01} />
            <Num label="Max continuous" value={cell.iMax} onChange={(iMax) => editCell({ iMax })} unit="A" min={0.01} />
          </Row>
          <Row>
            <Num label="Internal resistance" value={cell.rMilli} onChange={(rMilli) => editCell({ rMilli })} unit="mΩ" min={0} />
            <Num label="Mass" value={cell.g} onChange={(g) => editCell({ g })} unit="g" min={0} />
          </Row>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{cell.chem} · {cell.shape === 'cyl' ? `Ø${cell.dims[0]} × ${cell.dims[1]} mm cylinder` : `${cell.dims[0]} × ${cell.dims[1]} × ${cell.dims[2]} mm prismatic/pouch`}. Preset values are typical for the format, not a specific product — use your cell's datasheet.</p>
        </Panel>
        <Panel title="Configuration & load">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Row>
            <Num label="Series (S)" value={S} onChange={(v) => set({ s: v })} min={1} max={40} step={1} />
            <Num label="Parallel (P)" value={P} onChange={(v) => set({ p: v })} min={1} max={40} step={1} />
          </Row>
          <Row>
            <Num label={s.mode === 'W' ? 'Load power' : 'Load current'} value={s.load} onChange={(load) => set({ load })} unit={s.mode} min={0} />
            <div style={{ alignSelf: 'end', paddingBottom: 6 }}><Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['W', 'Watts'], ['A', 'Amps']]} /></div>
          </Row>
          <Row>
            <Num label="Usable DoD" value={s.dod} onChange={(dod) => set({ dod })} unit="%" min={1} max={100} hint="80–90 % extends cycle life" />
            <Num label="Efficiency" value={s.eff} onChange={(eff) => set({ eff })} unit="%" min={1} max={100} hint="Converter + wiring" />
          </Row>
          <Row>
            <Num label="BMS/enclosure mass" value={s.overhead} onChange={(overhead) => set({ overhead })} unit="%" min={0} />
            <Num label="Cell spacing" value={s.gap} onChange={(gap) => set({ gap })} unit="mm" min={0} />
          </Row>
        </Panel>
        <Panel title="Size it for me">
          <Row>
            <Num label="Target voltage" value={s.targetV} onChange={(targetV) => set({ targetV })} unit="V" min={1} />
            <Num label="Runtime" value={s.hours} onChange={(hours) => set({ hours })} unit="h" min={0.01} />
            <Num label="Peak current" value={s.peakA} onChange={(peakA) => set({ peakA })} unit="A" min={0} />
          </Row>
          <Row>
            <span>For {num(loadW, 0)} W: <b>{sug.s}S{sug.p}P</b> = {sug.s * sug.p} cells ({num(sug.s * cell.vNom, 1)} V nominal)</span>
            <Btn kind="primary" onClick={() => set({ s: sug.s, p: sug.p })}>Apply</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Configuration" value={`${S}S${P}P`} sub={`${r.cells} cells`} />
          <Stat label="Voltage" value={`${num(r.vNom, 1)} V`} sub={`${num(r.vMin, 1)}–${num(r.vMax, 1)} V`} />
          <Stat label="Capacity" value={`${num(r.ah, 1)} Ah`} sub={`${num(r.wh, 0)} Wh (${num(r.usableWh, 0)} usable)`} tone="accent" />
          <Stat label="Runtime" value={fmtH(r.runtimeH)} sub={`at ${num(loadW, 0)} W delivered`} tone={r.warnings.some((w) => w.includes('exceeds')) ? 'bad' : 'good'} />
        </Stats>
        <Panel title="3D cell layout">
          <View3D refEl={ref} height={380} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Blue shades = series groups (alternating polarity), red = positive terminals, silver = nickel strips / bus bars. Drag to orbit. Footprint ≈ {num(r.size[0], 0)} × {num(r.size[1], 0)} × {num(r.size[2], 0)} mm (cells only).</p>
        </Panel>
        {r.warnings.map((w) => <Note key={w} tone={w.includes('exceeds') ? 'err' : 'warn'}>{w}</Note>)}
        <Panel title="Pack details" actions={<CsvButton name={`pack-${S}s${P}p.csv`} rows={() => [['Property', 'Value'], ...rows.map(([a, b]) => [a, b])]} />}>
          <Table head={['Property', 'Value']} rows={rows} />
        </Panel>
        <Panel title="Runtime vs. load">
          <LineChart series={[{ name: 'Runtime', points: curve, area: true }]} xLabel="Delivered load (W)" yLabel="hours" fy={(v) => num(v, 2)} fx={(v) => num(v, 0)} markers={[{ x: loadW, label: 'your load' }]} />
        </Panel>
      </div>
    </Split>
  )
}
