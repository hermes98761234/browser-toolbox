import { useEffect, useMemo, useRef } from 'react'
import { Btn, Check, CsvButton, download, LineChart, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { accelJumps, LAWS, profile, summarize, svaj, type Follower, type Law, type Segment } from './lib/cam-profile-designer'

interface State { segs: Segment[]; fol: Follower; rb: number; rr: number; e: number; rpm: number; thick: number; play: boolean; speed: number; scrub: number; paLimit: number }

const PRESETS: { name: string; segs: Segment[] }[] = [
  { name: 'Rise–dwell–return–dwell (cycloidal)', segs: [{ deg: 120, lift: 20, law: 'cycloidal' }, { deg: 60, lift: 20, law: 'cycloidal' }, { deg: 120, lift: 0, law: 'cycloidal' }, { deg: 60, lift: 0, law: 'cycloidal' }] },
  { name: 'Rise–return–dwell (3-4-5)', segs: [{ deg: 90, lift: 15, law: 'poly345' }, { deg: 90, lift: 0, law: 'poly345' }, { deg: 180, lift: 0, law: 'poly345' }] },
  { name: 'Eccentric (harmonic 180/180)', segs: [{ deg: 180, lift: 12, law: 'harmonic' }, { deg: 180, lift: 0, law: 'harmonic' }] },
  { name: 'Two-step lift (4-5-6-7)', segs: [{ deg: 70, lift: 10, law: 'poly4567' }, { deg: 40, lift: 10, law: 'poly4567' }, { deg: 70, lift: 22, law: 'poly4567' }, { deg: 40, lift: 22, law: 'poly4567' }, { deg: 100, lift: 0, law: 'poly4567' }, { deg: 40, lift: 0, law: 'poly4567' }] },
  { name: 'Constant velocity (shows jerk spikes)', segs: [{ deg: 150, lift: 18, law: 'linear' }, { deg: 30, lift: 18, law: 'linear' }, { deg: 150, lift: 0, law: 'linear' }, { deg: 30, lift: 0, law: 'linear' }] },
]

const DEF: State = { segs: PRESETS[0].segs, fol: 'roller', rb: 40, rr: 10, e: 0, rpm: 300, thick: 12, play: true, speed: 0.35, scrub: 0, paLimit: 30 }
const SC = 1 / 20 // mm → scene units

export default function CamProfileDesigner() {
  const [s, set, reset] = useToolState('cam-profile-designer', DEF)
  const angleEl = useRef<HTMLSpanElement>(null)
  const total = s.segs.reduce((t, g) => t + Math.max(0, g.deg), 0)
  const samples = useMemo(() => svaj(s.segs, s.segs.at(-1)?.lift ?? 0, 720), [s.segs])
  const rr = s.fol === 'roller' ? s.rr : 0
  const prof = useMemo(() => profile(samples, s.fol, s.rb, rr, s.fol === 'flat' ? 0 : s.e), [samples, s.fol, s.rb, rr, s.e])
  const sum = summarize(samples, prof)
  const w = (2 * Math.PI * s.rpm) / 60
  const s0 = s.fol === 'flat' ? s.rb : Math.sqrt(Math.max(0, (s.rb + rr) ** 2 - s.e ** 2))
  const offsetBad = s.fol !== 'flat' && Math.abs(s.e) >= s.rb + rr
  const jump = accelJumps(samples) * w * w / 1000

  const live = useRef({ samples, s0, e: s.fol === 'flat' ? 0 : s.e, play: s.play, speed: s.speed, scrub: s.scrub, theta: 0 })
  useEffect(() => {
    live.current = { ...live.current, samples, s0, e: s.fol === 'flat' ? 0 : s.e, play: s.play, speed: s.speed, scrub: s.scrub }
  }, [samples, s0, s.fol, s.e, s.play, s.speed, s.scrub])

  const parts = useRef<{ cam: THREE.Group; fol: THREE.Group } | null>(null)
  const ref = useStage3D(
    (st) => {
      const cam = new THREE.Group(), fol = new THREE.Group()
      st.scene.add(cam, fol)
      parts.current = { cam, fol }
      st.onFrame((_, dt) => {
        const L = live.current
        L.theta = L.play ? (L.theta + dt * L.speed * 2 * Math.PI) % (2 * Math.PI) : (L.scrub * Math.PI) / 180
        cam.rotation.z = L.theta
        const deg = (L.theta * 180) / Math.PI
        const i = Math.round((deg / 360) * L.samples.length) % L.samples.length
        fol.position.set(L.e * SC, (L.s0 + L.samples[i].s) * SC, 0)
        if (angleEl.current) angleEl.current.textContent = `θ = ${deg.toFixed(0)}°, s = ${L.samples[i].s.toFixed(2)} mm`
      })
    },
    (st) => {
      const p = parts.current
      if (!p) return
      st.clear(p.cam)
      st.clear(p.fol)
      // cam disc from the surface outline
      const shape = new THREE.Shape(prof.surface.map(([x, y]) => new THREE.Vector2(x * SC, y * SC)))
      const hole = new THREE.Path()
      hole.absarc(0, 0, 6 * SC, 0, Math.PI * 2, true)
      shape.holes.push(hole)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: s.thick * SC, bevelEnabled: false, curveSegments: 4 })
      geo.translate(0, 0, (-s.thick * SC) / 2)
      p.cam.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.5, roughness: 0.35 })))
      const key = new THREE.Mesh(new THREE.BoxGeometry(3 * SC, 1.5 * SC, s.thick * SC * 1.02), new THREE.MeshStandardMaterial({ color: 0xf59e0b }))
      key.position.set(0, 6.2 * SC, 0)
      p.cam.add(key)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6 * SC, 6 * SC, s.thick * SC * 4, 32), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 }))
      shaft.rotation.x = Math.PI / 2
      st.scene.children.filter((c) => c.userData.shaft).forEach((c) => st.scene.remove(c))
      shaft.userData.shaft = true
      st.scene.add(shaft)
      const steel = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3 })
      const stemLen = 60 * SC
      if (s.fol === 'roller') {
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(rr * SC, rr * SC, s.thick * SC * 0.9, 32), new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.4, roughness: 0.4 }))
        roller.rotation.x = Math.PI / 2
        p.fol.add(roller)
        const stem = new THREE.Mesh(new THREE.BoxGeometry(rr * SC * 0.8, stemLen, s.thick * SC * 0.5), steel)
        stem.position.y = stemLen / 2 + rr * SC * 0.3
        p.fol.add(stem)
      } else if (s.fol === 'knife') {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(4 * SC, 10 * SC, 4), steel)
        tip.rotation.z = Math.PI
        tip.position.y = 5 * SC
        const stem = new THREE.Mesh(new THREE.BoxGeometry(5 * SC, stemLen, 5 * SC), steel)
        stem.position.y = 10 * SC + stemLen / 2
        p.fol.add(tip, stem)
      } else {
        const face = new THREE.Mesh(new THREE.BoxGeometry((Math.max(...samples.map((q) => Math.abs(q.v))) * 2 + 20) * SC, 3 * SC, s.thick * SC), new THREE.MeshStandardMaterial({ color: 0x10b981 }))
        face.position.y = 1.5 * SC
        const stem = new THREE.Mesh(new THREE.BoxGeometry(6 * SC, stemLen, 6 * SC), steel)
        stem.position.y = 3 * SC + stemLen / 2
        p.fol.add(face, stem)
      }
      // guide bushing
      const guide = new THREE.Mesh(new THREE.BoxGeometry(14 * SC, 12 * SC, s.thick * SC * 1.2), new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.55 }))
      st.scene.children.filter((c) => c.userData.guide).forEach((c) => st.scene.remove(c))
      guide.userData.guide = true
      guide.position.set((s.fol === 'flat' ? 0 : s.e) * SC, (s0 + sum.maxS + 45) * SC, 0)
      st.scene.add(guide)
      st.controls.target.set(0, (s0 * 0.6) * SC, 0)
    },
    [prof, s.fol, rr, s.thick, s.e, s0],
    { camera: [4.5, 4.2, 7.5], target: [0, 1.5, 0], grid: false },
  )

  const editSeg = (i: number, patch: Partial<Segment>) => set({ segs: s.segs.map((g, j) => (j === i ? { ...g, ...patch } : g)) })
  const kind = (i: number) => {
    const from = i === 0 ? s.segs.at(-1)!.lift : s.segs[i - 1].lift
    return s.segs[i].lift > from ? 'Rise' : s.segs[i].lift < from ? 'Return' : 'Dwell'
  }
  const pts = (k: 's' | 'v' | 'a' | 'j', f: number) => samples.filter((_, i) => i % 2 === 0).map((p) => [p.deg, p[k] * f] as [number, number])

  const svg = useMemo(() => {
    const R = Math.max(...prof.pitch.map(([x, y]) => Math.hypot(x, y)), ...prof.surface.map(([x, y]) => Math.hypot(x, y))) + 4
    const d = (a: [number, number][]) => a.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${(-y).toFixed(2)}`).join('') + 'Z'
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}" width="${2 * R}mm" height="${2 * R}mm">
<circle cx="0" cy="0" r="${s.rb}" fill="none" stroke="#94a3b8" stroke-width="0.3" stroke-dasharray="2 2"/>
${s.fol === 'roller' ? `<path d="${d(prof.pitch)}" fill="none" stroke="#f59e0b" stroke-width="0.3" stroke-dasharray="3 2"/>` : ''}
<path d="${d(prof.surface)}" fill="#6366f122" stroke="#6366f1" stroke-width="0.5"/>
<circle cx="0" cy="0" r="6" fill="none" stroke="#64748b" stroke-width="0.4"/><line x1="0" y1="0" x2="0" y2="${-s.rb}" stroke="#ef4444" stroke-width="0.3"/></svg>`
  }, [prof, s.rb, s.fol])

  return (
    <Split wide="right">
      <div>
        <Panel title="Motion program" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value="" onChange={(v) => { const p = PRESETS.find((x) => x.name === v); if (p) set({ segs: p.segs }) }} options={[['', 'Choose a program…'], ...PRESETS.map((p) => [p.name, p.name] as [string, string])]} />
          <Table
            head={['#', 'Type', 'Span °', 'Lift at end mm', 'Law', '']}
            rows={s.segs.map((g, i) => [
              i + 1,
              <b key="k">{kind(i)}</b>,
              <input key="d" type="number" min={1} max={360} value={g.deg} onChange={(e) => editSeg(i, { deg: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 64 }} aria-label="Span" />,
              <input key="l" type="number" min={0} value={g.lift} onChange={(e) => editSeg(i, { lift: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} aria-label="Lift" />,
              <select key="w" style={{ minWidth: 140 }} value={g.law} onChange={(e) => editSeg(i, { law: e.target.value as Law })} aria-label="Law">{LAWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>,
              <Btn key="x" kind="ghost" disabled={s.segs.length < 2} onClick={() => set({ segs: s.segs.filter((_, j) => j !== i) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => set({ segs: [...s.segs, { deg: 30, lift: s.segs.at(-1)?.lift ?? 0, law: 'cycloidal' }] })}>+ Segment</Btn>
            <Btn onClick={() => set({ segs: s.segs.map((g) => ({ ...g, law: s.segs[0].law })) })}>Same law everywhere</Btn>
          </Row>
          {Math.abs(total - 360) > 1e-9 && <Note tone="warn">Spans add up to {total}°, not 360°. They are scaled proportionally to fill one revolution.</Note>}
        </Panel>
        <Panel title="Geometry">
          <Seg value={s.fol} onChange={(fol) => set({ fol })} options={[['roller', 'Roller'], ['knife', 'Knife-edge'], ['flat', 'Flat-faced']]} />
          <Row>
            <Num label="Base circle radius" value={s.rb} onChange={(rb) => set({ rb })} unit="mm" min={5} />
            {s.fol === 'roller' && <Num label="Roller radius" value={s.rr} onChange={(v) => set({ rr: v })} unit="mm" min={1} />}
          </Row>
          <Row>
            {s.fol !== 'flat' && <Num label="Follower offset e" value={s.e} onChange={(e) => set({ e })} unit="mm" />}
            <Num label="Cam speed" value={s.rpm} onChange={(rpm) => set({ rpm })} unit="rpm" min={0} />
            <Num label="Thickness" value={s.thick} onChange={(thick) => set({ thick })} unit="mm" min={1} />
          </Row>
          <Num label="Pressure-angle limit" value={s.paLimit} onChange={(paLimit) => set({ paLimit })} unit="°" min={5} max={60} hint="≈30° for translating followers is the usual rule of thumb" />
          {offsetBad && <Note tone="err">Offset must be smaller than base radius + roller radius.</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Cam & follower" actions={<span ref={angleEl} className="muted" style={{ fontVariantNumeric: 'tabular-nums' }} />}>
          <View3D refEl={ref} height={380} />
          <Row>
            <Check label="Animate" value={s.play} onChange={(play) => set({ play })} />
            {s.play ? <Slider label="Animation speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.05} max={1.5} step={0.05} unit=" rev/s" /> : <Slider label="Cam angle" value={s.scrub} onChange={(scrub) => set({ scrub })} min={0} max={359} unit="°" />}
          </Row>
        </Panel>
        <Stats>
          <Stat label="Max lift" value={`${sum.maxS.toFixed(2)} mm`} />
          <Stat label="Peak velocity" value={`${((sum.maxV * w) / 1000).toFixed(3)} m/s`} sub={`${sum.maxV.toFixed(1)} mm/rad`} />
          <Stat label="Peak accel." value={`${((Math.max(sum.maxA, -sum.minA) * w * w) / 1000).toFixed(1)} m/s²`} sub={`+${sum.maxA.toFixed(1)} / ${sum.minA.toFixed(1)} mm/rad²`} tone={jump > 1 ? 'bad' : undefined} />
          <Stat label="Max pressure angle" value={s.fol === 'flat' ? '0° (flat face)' : `${sum.maxPA.toFixed(1)}°`} tone={sum.maxPA > s.paLimit ? 'bad' : 'good'} />
          <Stat label="Min radius of curvature" value={`${sum.minRho.toFixed(1)} mm`} tone={prof.undercut ? 'bad' : 'good'} sub={prof.undercut ? 'undercut!' : 'no undercut'} />
        </Stats>
        {prof.undercut && <Note tone="err">The profile undercuts (pitch curve sharper than the roller, or flat-face ρ ≤ 0). Increase the base circle, shrink the roller, or lengthen the rise.</Note>}
        {s.fol !== 'flat' && sum.maxPA > s.paLimit && <Note tone="warn">Pressure angle exceeds {s.paLimit}°: side load on the follower guide. Increase the base circle or the rise angle, or use an offset.</Note>}
        {jump > 1 && <Note tone="warn">Acceleration jumps by up to {jump.toFixed(1)} m/s² (infinite jerk). Cycloidal or 3-4-5/4-5-6-7 laws keep acceleration continuous between rise and dwell.</Note>}
        <Panel title="SVAJ diagrams">
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Displacement s (mm)</div>
          <LineChart series={[{ name: 'Displacement (mm)', points: pts('s', 1) }]} height={150} xLabel="" fx={(v) => `${v}°`} />
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Velocity v (m/s)</div>
          <LineChart series={[{ name: 'Velocity (m/s)', points: pts('v', w / 1000), color: '#0ea5e9' }]} height={140} fx={(v) => `${v}°`} />
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Acceleration a (m/s²)</div>
          <LineChart series={[{ name: 'Acceleration (m/s²)', points: pts('a', (w * w) / 1000), color: '#10b981' }]} height={140} fx={(v) => `${v}°`} />
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Jerk j (m/s³)</div>
          <LineChart series={[{ name: 'Jerk (m/s³)', points: pts('j', (w * w * w) / 1000), color: '#f59e0b' }]} height={140} xLabel="cam angle" fx={(v) => `${v}°`} />
        </Panel>
        {s.fol !== 'flat' && (
          <Panel title="Pressure angle">
            <LineChart series={[{ name: 'Pressure angle', points: samples.filter((_, i) => i % 2 === 0).map((p, i) => [p.deg, prof.pressure[i * 2]]) }, { name: `+${s.paLimit}° limit`, points: [[0, s.paLimit], [360, s.paLimit]], dashed: true, color: '#ef4444' }, { name: `−${s.paLimit}°`, points: [[0, -s.paLimit], [360, -s.paLimit]], dashed: true, color: '#ef4444' }]} height={170} fx={(v) => `${v}°`} fy={(v) => `${v.toFixed(0)}°`} />
          </Panel>
        )}
        <Panel title="Profile (cam frame, mm)" actions={<>
          <Btn onClick={() => download('cam-profile.svg', svg, 'image/svg+xml')}>⬇ SVG (1:1 mm)</Btn>
          <CsvButton name="cam-profile.csv" rows={() => [['deg', 'lift_mm', 'surface_x', 'surface_y', 'pitch_x', 'pitch_y', 'pressure_deg', 'rho_mm'], ...samples.map((p, i) => [p.deg, +p.s.toFixed(5), +prof.surface[i][0].toFixed(5), +prof.surface[i][1].toFixed(5), +prof.pitch[i][0].toFixed(5), +prof.pitch[i][1].toFixed(5), +prof.pressure[i].toFixed(3), +prof.rho[i].toFixed(3)])]} />
        </>}>
          <div style={{ display: 'flex', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: svg.replace(/width="[^"]+" height="[^"]+"/, 'width="260" height="260"') }} />
          <p className="muted" style={{ fontSize: 13 }}>Blue: cam surface · orange dashed: pitch curve (roller centre path) · grey dashed: base circle · red: 0° reference. The cam turns counter-clockwise; the follower moves vertically.</p>
        </Panel>
      </div>
    </Split>
  )
}
