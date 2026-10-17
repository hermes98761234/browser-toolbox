import { useEffect, useRef } from 'react'
import { Btn, Check, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, num, useToolState } from '../kit'
import { THREE, View3D, label, useStage3D } from '../kit/three'
import { SPEED, compare, loadKg, parseTire, plusSizes, rimRange, type Tire } from './lib/tire-size-comparer'

interface State { a: string; b: string; units: 'mm' | 'in'; speed: 'kmh' | 'mph'; roll: boolean }
const DEF: State = { a: '205/55R16 91V', b: '225/45R17 94W', units: 'mm', speed: 'kmh', roll: true }
const PRESETS = ['195/65R15', '205/55R16', '225/45R17', '225/40R18', '235/35R19', '215/60R16', '235/65R17', '265/70R17', 'LT265/75R16', '285/70R17', '33x12.50R15', '35x12.50R17']
const S = 1 / 100 // scene units per mm
const COL_A = '#0ea5e9', COL_B = '#f97316'

function tireMesh(t: Tire, color: string) {
  const g = new THREE.Group()
  const R = (t.diameter / 2) * S, r = ((t.rim * 25.4) / 2) * S, w = t.width * S
  // tire cross-section revolved around the axle (superellipse profile)
  const pts: THREE.Vector2[] = []
  const N = 40, cx = (R + r) / 2, hx = (R - r) / 2, hw = w / 2
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI
    const c = Math.cos(a), s = Math.sin(a)
    pts.push(new THREE.Vector2(cx + hx * Math.sign(c) * Math.abs(c) ** 0.35, hw * Math.sign(s) * Math.abs(s) ** 0.5 * 0.98))
  }
  const tire = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }))
  tire.rotation.x = Math.PI / 2
  g.add(tire)
  // tread blocks
  const n = Math.round((Math.PI * 2 * R) / 0.22)
  const blk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.05, w * 0.36), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1 }), n * 2)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    q.setFromAxisAngle(z, a + Math.PI / 2)
    for (const side of [-1, 1]) {
      m.compose(new THREE.Vector3(Math.cos(a) * (R + 0.012), Math.sin(a) * (R + 0.012), side * w * 0.22), q, new THREE.Vector3(1, 1, 1))
      blk.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m)
    }
  }
  g.add(blk)
  // wheel: rim barrel, face, spokes, hub
  const metal = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.3 })
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, w * 0.92, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }))
  barrel.rotation.x = Math.PI / 2
  g.add(barrel)
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.025, 8, 64), metal)
  lip.position.z = w * 0.46
  g.add(lip)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.1, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.6, roughness: 0.3 }))
  hub.rotation.x = Math.PI / 2
  hub.position.z = w * 0.3
  g.add(hub)
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.85, r * 0.16, 0.06), metal)
    const a = (i / 5) * Math.PI * 2
    sp.position.set(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, w * 0.3)
    sp.rotation.z = a
    g.add(sp)
  }
  return g
}

export default function TireSizeComparer() {
  const [s, set, reset] = useToolState('tire-size-comparer', DEF)
  const A = parseTire(s.a), B = parseTire(s.b)
  const c = A && B ? compare(A, B) : null
  const len = (mm: number, d = 1) => (s.units === 'mm' ? `${num(mm, d)} mm` : `${num(mm / 25.4, 2)}″`)
  const spU = s.speed === 'kmh' ? 'km/h' : 'mph'
  const roll = useRef(s.roll)
  useEffect(() => {
    roll.current = s.roll
  }, [s.roll])

  const ref = useStage3D(
    (st) => {
      const fitK = Math.max(1, 1.7 / (st.camera.aspect || 1.7)) // narrow (phone) views: step back so both tires fit
      st.camera.position.set(1.2 * fitK, 4, 10.5 * fitK)
      const grp = new THREE.Group()
      grp.name = 'tires'
      st.scene.add(grp)
      const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 1 }))
      road.rotation.x = -Math.PI / 2
      road.position.y = -0.001
      st.scene.add(road)
      st.onFrame((_t, dt) => {
        if (!roll.current) return
        for (const ch of grp.children) if (ch.userData.R) ch.rotation.z -= (dt * 2.2) / ch.userData.R // same road speed: ω = v / R
      })
    },
    (st) => {
      const grp = st.scene.getObjectByName('tires') as THREE.Group
      st.clear(grp)
      const list = [A, B].map((t, i) => ({ t, col: i ? COL_B : COL_A })).filter((x): x is { t: Tire; col: string } => !!x.t)
      const gap = 0.6
      const total = list.reduce((a, x) => a + x.t.diameter * S, 0) + gap * (list.length - 1)
      let x = -total / 2
      list.forEach(({ t, col }) => {
        const R = (t.diameter / 2) * S
        const m = tireMesh(t, col)
        m.position.set(x + R, R, 0)
        m.userData.R = R
        grp.add(m)
        const l = label(t.code.split(' ')[0], col, 0.75)
        l.position.set(x + R, 2 * R + 0.75, 0)
        grp.add(l)
        const l2 = label(`Ø ${len(t.diameter, 0)}`, '#e2e8f0', 0.5)
        l2.position.set(x + R, 2 * R + 0.22, 0)
        grp.add(l2)
        x += 2 * R + gap
      })
      // reference line at the taller tire's top
      if (list.length === 2) {
        const top = Math.max(...list.map((l) => l.t.diameter * S))
        const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-total / 2 - 0.3, top, 0), new THREE.Vector3(total / 2 + 0.3, top, 0)])
        grp.add(new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 0.15, gapSize: 0.1 })).computeLineDistances())
      }
    },
    [s.a, s.b, s.units],
    { camera: [1.2, 4, 10.5], target: [0, 3.3, 0], grid: false, background: '#0f172a' },
  )

  const speeds = s.speed === 'kmh' ? [30, 50, 60, 80, 100, 110, 120, 130] : [20, 30, 40, 50, 60, 70, 80]
  const plus = A ? plusSizes(A).filter((p) => !(p.t.width === A.width && p.t.aspect === A.aspect && p.t.rim === A.rim)).filter((p, i, arr) => arr.slice(0, i).filter((q) => q.plus === p.plus).length < 3) : []
  const row = (name: string, f: (t: Tire) => string, diff?: string) => [name, A ? f(A) : '—', B ? f(B) : '—', diff ?? '']
  const err = c ? Math.abs(c.diaPct) : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Tire sizes" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label={<span style={{ color: COL_A }}>● Current tire</span>} value={s.a} onChange={(a) => set({ a })} placeholder="205/55R16 91V" hint={A ? `${A.kind === 'flotation' ? 'Flotation size' : 'Metric size'}${A.load ? ` · load ${A.load} = ${num(loadKg(A.load), 0)} kg` : ''}${A.speed ? ` · ${A.speed} = ${SPEED[A.speed] ?? '?'}${A.speed === 'Z' ? '+' : ''} km/h` : ''}` : 'Not a valid size (e.g. 225/45R17 or 33x12.50R15)'} />
          <Txt label={<span style={{ color: COL_B }}>● New tire</span>} value={s.b} onChange={(b) => set({ b })} placeholder="225/45R17 94W" hint={B ? `${B.kind === 'flotation' ? 'Flotation size' : 'Metric size'}${B.load ? ` · load ${B.load} = ${num(loadKg(B.load), 0)} kg` : ''}${B.speed ? ` · ${B.speed} = ${SPEED[B.speed] ?? '?'}${B.speed === 'Z' ? '+' : ''} km/h` : ''}` : 'Not a valid size'} />
          <Row>{PRESETS.map((p) => <Btn key={p} kind="ghost" onClick={() => set({ b: p })}>{p}</Btn>)}</Row>
          <Row>
            <Seg value={s.units} onChange={(units) => set({ units })} options={[['mm', 'mm'], ['in', 'inches']]} />
            <Seg value={s.speed} onChange={(speed) => set({ speed })} options={[['kmh', 'km/h'], ['mph', 'mph']]} />
            <Btn onClick={() => set({ a: s.b, b: s.a })}>⇄ Swap</Btn>
          </Row>
        </Panel>
        {A && (
          <Panel title={`Plus-size options for ${A.code.split(' ')[0]} (closest 3 per rim, ±1.5 %)`}>
            <Table head={['Size', 'Rim', 'Diameter', 'Diff']} rows={plus.map((p) => [
              <a key="c" href="#" onClick={(e) => { e.preventDefault(); set({ b: p.code }) }}>{p.code}</a>,
              `${p.t.rim}″ (${p.plus >= 0 ? '+' : ''}${p.plus})`, len(p.t.diameter, 0), `${p.diff >= 0 ? '+' : ''}${p.diff.toFixed(2)}%`,
            ])} />
            <p className="muted" style={{ fontSize: 13 }}>Click a size to compare it. Check load index, clearance and the wheel’s approved width before buying.</p>
          </Panel>
        )}
      </div>
      <div>
        {c && (
          <Stats>
            <Stat label="Diameter change" value={`${c.diaPct >= 0 ? '+' : ''}${c.diaPct.toFixed(2)}%`} tone={err > 3 ? 'bad' : err > 1.5 ? 'accent' : 'good'} sub={len(B!.diameter - A!.diameter)} />
            <Stat label={`Speedo shows 100 ${spU}`} value={`${num(c.actual(100), 1)} ${spU}`} sub="actual speed" />
            <Stat label="Ground clearance" value={`${c.clearanceMm >= 0 ? '+' : ''}${len(c.clearanceMm)}`} />
            <Stat label="Revs per km" value={`${num(A!.revsPerKm, 0)} → ${num(B!.revsPerKm, 0)}`} />
          </Stats>
        )}
        {c && err > 3 && <Note tone="err">More than 3 % diameter difference: speedometer, ABS/ESC and gearing can be noticeably affected, and it may not be legal or fit the wheel arch.</Note>}
        {c && err <= 3 && err > 1.5 && <Note tone="warn">Within 3 %, but above the ±1.5 % many fitters aim for.</Note>}
        <Panel title="Side by side" actions={<Check label="Roll at the same road speed" value={s.roll} onChange={(roll) => set({ roll })} />}>
          <View3D refEl={ref} height={380} />
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Drag to orbit. At the same road speed the smaller tire spins faster (ω = v / r). The dashed line marks the taller tire.</p>
        </Panel>
        <Panel title="Specifications">
          <Table head={['', 'Current', 'New', 'Difference']} rows={[
            row('Section width', (t) => len(t.width, 0), c ? len(c.widthMm, 1) : ''),
            row('Aspect ratio', (t) => `${num(t.aspect, 1)}%`),
            row('Rim', (t) => `${t.rim}″`),
            row('Sidewall height', (t) => len(t.sidewall), c ? len(c.sidewallMm) : ''),
            row('Overall diameter', (t) => len(t.diameter), c ? `${c.diaPct.toFixed(2)}%` : ''),
            row('Circumference', (t) => len(t.circumference, 0)),
            row('Revolutions per mile', (t) => num(t.revsPerMile, 0)),
            row('Typical rim width', (t) => { const [a, b] = rimRange(t.width); return `${a}–${b}″` }),
            row('Max load', (t) => (t.load ? `${num(loadKg(t.load), 0)} kg (${t.load})` : '—')),
            row('Speed rating', (t) => (t.speed ? `${t.speed} · ${SPEED[t.speed] ?? '?'}${t.speed === 'Z' ? '+' : ''} km/h` : '—')),
          ]} />
        </Panel>
        {c && (
          <Panel title="Speedometer error">
            <Table head={[`Speedometer shows`, 'You are actually doing', 'Difference']} rows={speeds.map((v) => [`${v} ${spU}`, <b key="a">{num(c.actual(v), 1)} {spU}</b>, `${c.actual(v) - v >= 0 ? '+' : ''}${num(c.actual(v) - v, 1)}`])} />
            <p className="muted" style={{ fontSize: 13 }}>Assumes the speedometer was accurate on the current tire. Real tires also vary with wear (≈ 1–2 % between new and worn tread) and inflation.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
