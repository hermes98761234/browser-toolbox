import { useEffect, useMemo, useRef } from 'react'
import { Btn, CsvButton, download, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, color, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { angles, gearProfile, gearSvg, geom, minTeeth, solveTrain, type GearIn } from './lib/gear-train-designer'

const PRESETS: Record<string, { name: string; gears: GearIn[] }> = {
  pair: { name: 'Simple 3:1', gears: [{ z: 15, m: 2, link: 'mesh', angle: 0 }, { z: 45, m: 2, link: 'mesh', angle: 0 }] },
  idler: { name: 'With idler', gears: [{ z: 18, m: 2, link: 'mesh', angle: 0 }, { z: 24, m: 2, link: 'mesh', angle: 30 }, { z: 36, m: 2, link: 'mesh', angle: -30 }] },
  compound: {
    name: 'Compound 12:1',
    gears: [
      { z: 12, m: 1.5, link: 'mesh', angle: 0 }, { z: 48, m: 1.5, link: 'mesh', angle: 0 },
      { z: 15, m: 2, link: 'shaft', angle: 0 }, { z: 45, m: 2, link: 'mesh', angle: 120 },
    ],
  },
  clock: {
    name: 'Clock 60:1',
    gears: [
      { z: 10, m: 1, link: 'mesh', angle: 0 }, { z: 40, m: 1, link: 'mesh', angle: 0 },
      { z: 10, m: 1, link: 'shaft', angle: 0 }, { z: 30, m: 1, link: 'mesh', angle: 100 },
      { z: 12, m: 1, link: 'shaft', angle: 0 }, { z: 60, m: 1, link: 'mesh', angle: 200 },
    ],
  },
}

const DEF = { gears: PRESETS.compound.gears, rpm: 1500, torque: 2, eff: 98, alpha: 20, face: 8, bore: 5, speed: 1 }

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

export default function GearTrainDesigner() {
  const [s, set, reset] = useToolState('gear-train-designer', DEF)
  const gears = useMemo(() => s.gears.map((g, i) => ({ ...g, z: Math.max(4, Math.round(g.z) || 4), m: Math.max(0.1, g.m || 1), link: i === 0 ? 'mesh' : g.link }) as GearIn), [s.gears])
  const train = useMemo(() => solveTrain(gears, s.rpm, s.torque, s.eff / 100, s.alpha), [gears, s.rpm, s.torque, s.eff, s.alpha])
  const last = train[train.length - 1]
  const zmin = minTeeth(s.alpha)
  const live = useRef({ gears, train, speed: s.speed, rpm: s.rpm })
  useEffect(() => {
    live.current = { gears, train, speed: s.speed, rpm: s.rpm }
  }, [gears, train, s.speed, s.rpm])

  // interference between gears in the same layer that are not meshing partners
  const clashes = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < train.length; i++)
      for (let j = i + 1; j < train.length; j++) {
        if (train[i].layer !== train[j].layer) continue
        if (j === i + 1 && gears[j].link === 'mesh') continue
        const d = Math.hypot(train[i].x - train[j].x, train[i].y - train[j].y)
        if (d < geom(train[i].z, train[i].m, s.alpha).ra + geom(train[j].z, train[j].m, s.alpha).ra - 1e-6) out.push(`gear ${i + 1} ↔ gear ${j + 1}`)
      }
    return out
  }, [train, gears, s.alpha])

  const pivots = useRef<THREE.Object3D[]>([])
  const theta = useRef(0)
  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'gears'
      st.scene.add(root)
      st.onFrame((_t, dt) => {
        const L = live.current
        theta.current += dt * Math.sign(L.rpm) * L.speed * 0.25 * 2 * Math.PI * Math.min(1, Math.abs(L.rpm) / 60 || 0)
        const th = angles(L.gears, L.train, theta.current)
        pivots.current.forEach((p, i) => (p.rotation.z = th[i] ?? 0))
      })
    },
    (st) => {
      const root = st.scene.getObjectByName('gears') as THREE.Group
      st.clear(root)
      pivots.current = []
      const xs = train.map((g) => g.x), ys = train.map((g) => g.y)
      const ext = Math.max(...train.map((g) => Math.max(Math.abs(g.x - (Math.min(...xs) + Math.max(...xs)) / 2), Math.abs(g.y - (Math.min(...ys) + Math.max(...ys)) / 2)) + geom(g.z, g.m, s.alpha).ra))
      const sc = 6 / (ext || 1)
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2
      holder.scale.setScalar(sc)
      holder.position.set((-(Math.min(...xs) + Math.max(...xs)) / 2) * sc, 0.05, ((Math.min(...ys) + Math.max(...ys)) / 2) * sc)
      root.add(holder)
      const gap = s.face * 0.25
      train.forEach((g, i) => {
        const pts = gearProfile(g.z, g.m, s.alpha, 6)
        const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
        const bore = Math.min(s.bore / 2, geom(g.z, g.m, s.alpha).rf * 0.6)
        if (bore > 0) {
          const hole = new THREE.Path()
          hole.absarc(0, 0, bore, 0, Math.PI * 2, true)
          shape.holes.push(hole)
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: s.face, bevelEnabled: false, curveSegments: 24 })
        const pivot = new THREE.Group()
        pivot.position.set(g.x, g.y, g.layer * (s.face + gap))
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color(i), metalness: 0.35, roughness: 0.45 }))
        pivot.add(mesh)
        // index mark so rotation is visible
        const mark = new THREE.Mesh(new THREE.CylinderGeometry(g.m * 0.35, g.m * 0.35, 0.2, 12), new THREE.MeshBasicMaterial({ color: '#f8fafc' }))
        mark.rotation.x = Math.PI / 2
        mark.position.set(geom(g.z, g.m, s.alpha).rf * 0.75, 0, s.face + 0.1)
        pivot.add(mark)
        holder.add(pivot)
        pivots.current.push(pivot)
      })
      // shafts
      const shafts = new Map<string, number>()
      train.forEach((g) => shafts.set(`${g.x.toFixed(3)},${g.y.toFixed(3)}`, Math.max(shafts.get(`${g.x.toFixed(3)},${g.y.toFixed(3)}`) ?? 0, g.layer)))
      for (const [k, top] of shafts) {
        const [x, y] = k.split(',').map(Number)
        const h = (top + 1) * (s.face + gap) + s.face
        const r = Math.max(0.3, Math.min(s.bore / 2, 50) * 0.95)
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.8, roughness: 0.3 }))
        c.rotation.x = Math.PI / 2
        c.position.set(x, y, h / 2 - s.face / 2)
        holder.add(c)
      }
    },
    [train, s.alpha, s.face, s.bore],
    { camera: [0, 9, 9], target: [0, 0, 0] },
  )

  const edit = (i: number, p: Partial<GearIn>) => set({ gears: s.gears.map((g, j) => (j === i ? { ...g, ...p } : g)) })
  const dir = (rpm: number) => (rpm > 0 ? '⟲ CCW' : '⟳ CW')

  return (
    <Split wide="right">
      <div>
        <Panel title="Drive" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Input speed" value={s.rpm} onChange={(rpm) => set({ rpm })} unit="rpm" />
            <Num label="Input torque" value={s.torque} onChange={(torque) => set({ torque })} unit="N·m" min={0} />
          </Row>
          <Row>
            <Num label="Efficiency per mesh" value={s.eff} onChange={(eff) => set({ eff: Math.min(100, Math.max(1, eff)) })} unit="%" min={1} max={100} />
            <Num label="Face width" value={s.face} onChange={(face) => set({ face: Math.max(0.5, face) })} unit="mm" min={0.5} />
          </Row>
          <Row>
            <Num label="Bore Ø" value={s.bore} onChange={(bore) => set({ bore: Math.max(0, bore) })} unit="mm" min={0} />
          </Row>
          <span className="k-label">Pressure angle</span>
          <Seg value={String(s.alpha)} onChange={(v) => set({ alpha: Number(v) })} options={[['14.5', '14.5°'], ['20', '20°'], ['25', '25°']]} />
        </Panel>
        <Panel title="Presets">
          <Row>
            {Object.entries(PRESETS).map(([k, p]) => (
              <Btn key={k} onClick={() => set({ gears: p.gears })}>{p.name}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Gears" actions={<><Btn onClick={() => set({ gears: [...s.gears, { z: 30, m: s.gears[s.gears.length - 1]?.m ?? 2, link: 'mesh', angle: 0 }] })}>+ Mesh</Btn><Btn onClick={() => set({ gears: [...s.gears, { z: 15, m: s.gears[s.gears.length - 1]?.m ?? 2, link: 'shaft', angle: 0 }] })}>+ Same shaft</Btn></>}>
          {gears.map((g, i) => (
            <div key={i} style={{ borderLeft: `4px solid ${color(i)}`, paddingLeft: 10, marginBottom: 12 }}>
              <Row wrap={false}>
                <b style={{ flex: 1 }}>Gear {i + 1}</b>
                {i > 0 && (
                  <Seg value={g.link} onChange={(link) => edit(i, { link })} options={[['mesh', 'Meshes prev.'], ['shaft', 'Same shaft']]} />
                )}
                {i === 0 && <span className="muted">input</span>}
                {i > 1 && <Btn kind="ghost" title="Remove" onClick={() => set({ gears: s.gears.filter((_, j) => j !== i) })}>✕</Btn>}
              </Row>
              <Row>
                <Num label="Teeth" value={g.z} onChange={(z) => edit(i, { z })} min={4} step={1} />
                {i === 0 || g.link === 'shaft' ? (
                  <Num label="Module" value={g.m} onChange={(m) => edit(i, { m })} unit="mm" min={0.1} />
                ) : (
                  <Num label="Direction" value={g.angle} onChange={(angle) => edit(i, { angle })} unit="°" />
                )}
              </Row>
              {g.z < zmin && <span style={{ color: 'var(--warn)', fontSize: 12 }}>Under {zmin} teeth: undercut at {s.alpha}° unless profile-shifted.</span>}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Meshing gears inherit the module of the gear they mesh with. "Same shaft" stacks a gear above the previous one (compound train) and may use a new module.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Overall ratio" value={`${num(Math.abs(last.ratio), 3)} : 1`} sub={Math.abs(last.ratio) >= 1 ? 'reduction' : 'overdrive'} tone="accent" />
          <Stat label="Output speed" value={`${num(Math.abs(last.rpm), 2)} rpm`} sub={last.rpm * s.rpm > 0 ? 'same direction as input' : 'reversed'} />
          <Stat label="Output torque" value={`${num(last.torque, 2)} N·m`} sub={`${train.filter((_, i) => i > 0 && gears[i].link === 'mesh').length} meshes`} />
          <Stat label="Power" value={`${num((s.torque * s.rpm * 2 * Math.PI) / 60, 1)} W`} sub={`out ${num((last.torque * Math.abs(last.rpm) * 2 * Math.PI) / 60, 1)} W`} />
        </Stats>
        {clashes.length > 0 && <Note tone="err">Gears collide: {clashes.join(', ')}. Change a mesh direction.</Note>}
        <Panel title="Live preview">
          <View3D refEl={ref} height={420} />
          <Slider label="Animation speed" value={s.speed} onChange={(speed) => set({ speed })} min={0} max={3} step={0.1} unit="×" />
          <p className="muted" style={{ fontSize: 12 }}>Animation is slowed down: the input turns at most ¼ rev/s. White dots mark a reference tooth on each gear.</p>
        </Panel>
        <Panel
          title="Ratio & speed table"
          actions={<CsvButton name="gear-train.csv" rows={() => [['Gear', 'Teeth', 'Module mm', 'Pitch dia mm', 'Tip dia mm', 'rpm', 'Torque N·m', 'Center dist mm', 'Contact ratio'], ...train.map((g, i) => [i + 1, g.z, g.m, g.z * g.m, (g.z + 2) * g.m, +g.rpm.toFixed(3), +g.torque.toFixed(4), g.center ?? '', g.cr ? +g.cr.toFixed(3) : ''])]} />}
        >
          <Table
            head={['#', 'Teeth', 'Pitch Ø', 'Tip Ø', 'rpm', 'Torque', 'Center', 'Contact', 'SVG']}
            rows={train.map((g, i) => [
              <b key="n" style={{ color: color(i) }}>{i + 1}</b>,
              `${g.z} × m${g.m}`,
              `${num(g.z * g.m, 2)}`,
              `${num((g.z + 2) * g.m, 2)}`,
              <span key="r">{num(Math.abs(g.rpm), 1)} <span className="muted">{dir(g.rpm)}</span></span>,
              num(g.torque, 3),
              g.center ? num(g.center, 2) : <span key="c" className="muted">{i ? 'shaft' : '—'}</span>,
              g.cr ? (
                <span key="cr" style={{ color: g.cr < 1.2 ? 'var(--err)' : undefined }} title={`gcd ${gcd(g.z, train[i - 1].z)}${gcd(g.z, train[i - 1].z) === 1 ? ' – hunting tooth' : ''}`}>
                  {g.cr.toFixed(2)}
                </span>
              ) : '—',
              <Btn key="s" kind="ghost" onClick={() => download(`gear-${i + 1}-z${g.z}-m${g.m}.svg`, gearSvg(g.z, g.m, s.alpha, s.bore), 'image/svg+xml')}>⬇</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Dimensions in mm. Contact ratio should stay above 1.2 for smooth running. SVG outlines are 1:1 involute profiles (no backlash), ready for laser cutting or CAD import.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
