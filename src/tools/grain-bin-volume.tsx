import { Btn, Check, CsvButton, money, Note, num, Num, Panel, pct, Row, Select, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { bushels, capacity, coneHeight, CROPS, FT_PER_M, grainVolume, LB_PER_KG, M3_PER_FT3, PRESETS, REPOSE, type Surface } from './lib/grain-bin-volume'

interface Saved { id: string; name: string; crop: string; bu: number; marketBu: number; value: number; fill: number }
const DEF = {
  unit: 'ft' as 'ft' | 'm', diameter: 30, wall: 24, roof: 30, hopper: false, hopperAngle: 45,
  measure: 'depth' as 'depth' | 'gap', h: 18, surface: 'peaked' as Surface, crop: 'corn', repose: 23, tw: 56, moisture: 17, pack: 0, price: 4.25,
  name: 'Bin 1', saved: [] as Saved[],
}

export default function GrainBinVolume() {
  const [s, set, reset] = useToolState('grain-bin-volume', DEF)
  const metric = s.unit === 'm'
  const toFt = metric ? FT_PER_M : 1
  const crop = CROPS.find((c) => c.id === s.crop) ?? CROPS[0]
  const bin = { diameter: s.diameter * toFt, wallHeight: s.wall * toFt, roofPitch: s.roof, hopper: s.hopper, hopperAngle: s.hopperAngle }
  const depth = Math.max(0, Math.min(s.wall, s.measure === 'depth' ? s.h : s.wall - s.h)) * toFt
  const v = grainVolume(bin, depth, s.surface, s.repose)
  const capFt3 = capacity(bin, s.repose)
  const w = bushels(v.total, s.pack, s.tw, crop.lbPerBu, s.moisture, crop.base)
  const cap = bushels(capFt3, s.pack, s.tw, crop.lbPerBu, s.moisture, crop.base)
  const fill = v.total / (capFt3 || 1)
  const L = metric ? 'm' : 'ft'
  const vol = (ft3: number) => (metric ? `${num(ft3 * M3_PER_FT3, 1)} m³` : `${num(ft3, 0)} ft³`)
  const mass = (lb: number) => (metric ? `${num(lb / LB_PER_KG / 1000, 1)} t` : `${num(lb / 2000, 1)} US tons`)
  const peakTall = s.surface === 'peaked' && Math.min(s.repose, s.roof) < s.repose

  const ref = useStage3D(
    () => undefined,
    (st) => {
      const old = st.scene.getObjectByName('bin')
      if (old) {
        st.scene.remove(old)
        st.clear(old)
      }
      const g = new THREE.Group()
      g.name = 'bin'
      const k = 6 / bin.diameter
      const r = 3
      const H = bin.wallHeight * k
      const hop = s.hopper ? coneHeight(r, s.hopperAngle) : 0
      const base = hop + 0.6 // legs for hopper bins
      const wallMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 64, 1, true), wallMat)
      wall.position.y = (s.hopper ? base : 0) + H / 2
      g.add(wall)
      const rings = new THREE.LineBasicMaterial({ color: '#94a3b8' })
      for (let i = 0; i <= 8; i++) {
        const c = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, j) => new THREE.Vector3(r * Math.cos((j / 64) * Math.PI * 2), (s.hopper ? base : 0) + (H * i) / 8, r * Math.sin((j / 64) * Math.PI * 2)))), rings)
        g.add(c)
      }
      const roofH = coneHeight(r, s.roof)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.03, roofH, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }))
      roof.position.y = (s.hopper ? base : 0) + H + roofH / 2
      g.add(roof)
      if (s.hopper) {
        const hc = new THREE.Mesh(new THREE.ConeGeometry(r, hop, 64, 1, true), wallMat)
        hc.rotation.x = Math.PI
        hc.position.y = base - hop / 2
        g.add(hc)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, base, 8), new THREE.MeshStandardMaterial({ color: '#64748b' }))
          leg.position.set(r * 0.95 * Math.cos(a), base / 2, r * 0.95 * Math.sin(a))
          g.add(leg)
        }
      } else {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.15, 64), new THREE.MeshStandardMaterial({ color: '#78716c' }))
        pad.position.y = -0.075
        g.add(pad)
      }
      // grain body as a lathe profile (radius, height)
      const y0 = s.hopper ? base : 0
      const gh = depth * k
      const pk = v.peakH * k
      const prof: THREE.Vector2[] = []
      if (s.hopper) prof.push(new THREE.Vector2(0.001, y0 - hop), new THREE.Vector2(r * 0.995, y0))
      else prof.push(new THREE.Vector2(0.001, 0.001), new THREE.Vector2(r * 0.995, 0.001))
      if (gh > 0.001 || pk > 0) {
        prof.push(new THREE.Vector2(r * 0.995, y0 + gh))
        if (pk < 0) {
          const rr = (-pk / Math.max(1e-6, Math.tan((s.repose * Math.PI) / 180)))
          if (rr < r * 0.99) prof.push(new THREE.Vector2(rr, y0 + gh))
          prof.push(new THREE.Vector2(0.001, y0 + gh + pk))
        } else prof.push(new THREE.Vector2(0.001, y0 + gh + pk))
      }
      const grainColor = s.crop === 'soy' ? '#d6b56d' : s.crop === 'corn' ? '#f5b70a' : s.crop === 'canola' ? '#3f3f46' : s.crop === 'sunflower' ? '#57534e' : '#d4a373'
      const grain = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), new THREE.MeshStandardMaterial({ color: grainColor, roughness: 0.9, side: THREE.DoubleSide }))
      g.add(grain)
      const lb = label(`${num(w.bu, 0)} bu`, '#fef3c7', 0.5)
      lb.position.set(0, y0 + H + roofH + 0.6, 0)
      g.add(lb)
      st.scene.add(g)
      st.controls.target.set(0, y0 + H / 2, 0)
    },
    [s.diameter, s.wall, s.roof, s.hopper, s.hopperAngle, depth, s.surface, s.repose, s.crop, s.unit, Math.round(w.bu)],
    { camera: [9, 8, 11], grid: false, background: '#0f172a' },
  )

  const changeUnit = (unit: 'ft' | 'm') => {
    if (unit === s.unit) return
    const f = unit === 'm' ? 1 / FT_PER_M : FT_PER_M
    const r1 = (x: number) => Math.round(x * f * 100) / 100
    set({ unit, diameter: r1(s.diameter), wall: r1(s.wall), h: r1(s.h) })
  }

  return (
    <Split>
      <div>
        <Panel title="Bin" actions={<Seg value={s.unit} onChange={changeUnit} options={[['ft', 'feet'], ['m', 'metres']]} />}>
          <Row>
            <Num label="Diameter" value={s.diameter} onChange={(diameter) => diameter > 0 && set({ diameter })} unit={L} min={1} />
            <Num label="Eave (sidewall) height" value={s.wall} onChange={(wall) => wall > 0 && set({ wall })} unit={L} min={1} />
          </Row>
          {!metric && (
            <Select label="Common sizes" value="" onChange={(p: string) => { const x = PRESETS.find((q) => q[0] === p); if (x) set({ diameter: x[1], wall: x[2] }) }} options={[['', 'Choose a preset…'], ...PRESETS.map((p) => [p[0], p[0]] as [string, string])]} />
          )}
          <Slider label="Roof pitch" value={s.roof} onChange={(roof) => set({ roof })} min={15} max={40} unit="°" />
          <Check label="Hopper (cone) bottom" value={s.hopper} onChange={(hopper) => set({ hopper })} />
          {s.hopper && <Slider label="Hopper angle" value={s.hopperAngle} onChange={(hopperAngle) => set({ hopperAngle })} min={30} max={60} unit="°" />}
        </Panel>
        <Panel title="Grain level">
          <Seg value={s.measure} onChange={(measure) => set({ measure })} options={[['depth', 'Grain depth at wall'], ['gap', 'Eave down to grain']]} />
          <Num label={s.measure === 'depth' ? 'Grain depth at the wall' : 'Distance from eave to grain'} value={s.h} onChange={(h) => h >= 0 && set({ h })} unit={L} min={0} max={s.wall} hint={s.hopper ? 'Measured from the top of the hopper (bottom of sidewall).' : 'Measured from the floor.'} />
          <Seg value={s.surface} onChange={(surface) => set({ surface })} options={[['level', 'Level'], ['peaked', '▲ Peaked'], ['inverted', '▼ Inverted (cored)']]} />
          <Slider label="Angle of repose" value={s.repose} onChange={(repose) => set({ repose })} min={10} max={40} unit="°" />
          {peakTall && <Note>Peak capped at the {s.roof}° roof pitch.</Note>}
        </Panel>
        <Panel title="Grain">
          <Select label="Crop" value={s.crop} onChange={(c) => { const cr = CROPS.find((x) => x.id === c)!; set({ crop: c, tw: cr.lbPerBu, repose: REPOSE[c] ?? 25 }) }} options={CROPS.map((c) => [c.id, c.name] as [string, string])} />
          <Row>
            <Num label="Test weight" value={s.tw} onChange={(tw) => tw > 0 && set({ tw })} unit="lb/bu" min={10} hint={`Standard ${crop.lbPerBu} lb/bu`} />
            <Num label="Moisture" value={s.moisture} onChange={(moisture) => set({ moisture })} unit="%" min={0} max={40} hint={`Base ${crop.base}%`} />
          </Row>
          <Row>
            <Num label="Packing factor" value={s.pack} onChange={(pack) => set({ pack })} unit="%" min={0} max={15} hint="Settling in tall bins, often 2–8%" />
            <Num label="Price" value={s.price} onChange={(price) => set({ price })} unit="$/bu" min={0} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Grain in bin" value={`${num(w.bu, 0)} bu`} sub={vol(v.total)} tone="accent" />
          <Stat label="Weight" value={mass(w.lb)} sub={`${num(w.lb, 0)} lb`} />
          <Stat label="Market bushels" value={num(w.marketBu, 0)} sub={`at ${crop.lbPerBu} lb/bu`} />
          <Stat label={`Dry bu @ ${crop.base}%`} value={num(w.dryBu, 0)} sub={s.moisture > crop.base ? `−${num(w.marketBu - w.dryBu, 0)} bu water shrink` : 'already at/below base'} />
          <Stat label="Value" value={money(w.dryBu * s.price, '$', 0)} sub="dry bu × price" tone="good" />
          <Stat label="Bin full" value={pct(fill, 0)} sub={`capacity ${num(cap.bu, 0)} bu`} />
        </Stats>
        <Panel title="Bin view">
          <View3D refEl={ref} height={400} />
        </Panel>
        <Panel title="Breakdown">
          <Table head={['Part', 'Volume', 'Bushels']} rows={[
            ['Cylinder to grain line', vol(v.cyl), num(bushels(v.cyl, s.pack, 1, 1, 0, 0).bu, 0)],
            [s.surface === 'peaked' ? 'Peak cone' : s.surface === 'inverted' ? 'Cored cone (removed)' : 'Surface', vol(v.cone), num(bushels(v.cone, s.pack, 1, 1, 0, 0).bu, 0)],
            ...(s.hopper ? [['Hopper cone', vol(v.hopper), num(bushels(v.hopper, s.pack, 1, 1, 0, 0).bu, 0)]] : []),
          ]} foot={['Total', vol(v.total), num(w.bu, 0)]} />
          <Note>1 US bushel = 1.2445 ft³ (2150.42 in³). Bushels here are volume bushels; market bushels use your test weight, and dry bushels remove water down to the base moisture. Angle-of-repose values per crop are typical approximations.</Note>
        </Panel>
        <Panel title="Inventory" actions={<>
          <CsvButton name="grain-inventory.csv" rows={() => [['Bin', 'Crop', 'Fill %', 'Volume bu', 'Dry bu', 'Value'], ...s.saved.map((x) => [x.name, x.crop, Math.round(x.fill * 100), Math.round(x.bu), Math.round(x.marketBu), Math.round(x.value)])]} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <Row>
            <input className="k-text" style={{ maxWidth: 200 }} value={s.name} onChange={(e) => set({ name: e.target.value })} aria-label="Bin name" />
            <Btn kind="primary" onClick={() => set({ saved: [...s.saved, { id: uid(), name: s.name || 'Bin', crop: crop.name, bu: w.bu, marketBu: w.dryBu, value: w.dryBu * s.price, fill }], name: `Bin ${s.saved.length + 2}` })}>+ Add this bin</Btn>
          </Row>
          {s.saved.length > 0 && (
            <Table head={['Bin', 'Crop', 'Full', 'Bushels', 'Dry bu', 'Value', '']}
              rows={s.saved.map((x) => [x.name, x.crop, pct(x.fill, 0), num(x.bu, 0), num(x.marketBu, 0), money(x.value, '$', 0), <Btn key="x" kind="ghost" onClick={() => set({ saved: s.saved.filter((y) => y.id !== x.id) })}>✕</Btn>])}
              foot={['Total', '', '', num(s.saved.reduce((a, x) => a + x.bu, 0), 0), num(s.saved.reduce((a, x) => a + x.marketBu, 0), 0), money(s.saved.reduce((a, x) => a + x.value, 0), '$', 0), '']} />
          )}
        </Panel>
      </div>
    </Split>
  )
}
