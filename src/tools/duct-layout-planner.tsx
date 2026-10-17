import { useMemo } from 'react'
import { Btn, Check, CsvButton, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { areaOf, EL, fittings, frictionPer100, diameterOf, paths, runLength, segmentFlows, sizeLabel, snap, surfaceOf, velocity, type P3, type Run } from './lib/duct-layout-planner'

interface State { L: number; W: number; H: number; step: number; runs: Run[]; active: string; draw: boolean; elev: number; labels: boolean; ahu: boolean }

const run = (id: string, name: string, kind: Run['kind'], shape: Run['shape'], size: number[], cfm: number, pts: P3[]): Run => ({ id, name, kind, shape, d: size[0], w: size[0], h: size[1] ?? size[0], cfm, pts })

const DEF: State = {
  L: 32, W: 24, H: 9, step: 1, active: 'b1', draw: false, elev: 8, labels: true, ahu: true,
  runs: [
    run('trunk', 'Supply trunk', 'supply', 'rect', [16, 8], 0, [[3, 8, 3], [28, 8, 3]]),
    run('b1', 'Kitchen', 'supply', 'round', [7], 140, [[8, 8, 3], [8, 8, 13]]),
    run('b2', 'Dining', 'supply', 'round', [6], 110, [[16, 8, 3], [16, 8, 19], [13, 8, 19]]),
    run('b3', 'Living room', 'supply', 'round', [8], 190, [[24, 8, 3], [24, 8, 11], [29, 8, 11]]),
    run('b4', 'Office', 'supply', 'round', [6], 100, [[28, 8, 3], [31, 8, 3], [31, 8, 21]]),
    run('ret', 'Central return', 'return', 'rect', [20, 10], 540, [[3, 7.5, 5.5], [5, 7.5, 5.5], [5, 7.5, 21], [12, 7.5, 21]]),
  ],
}

const SC = 0.32 // scene units per ft
const FPM_MAX = { trunk: 900, branch: 700, return: 700 }

export default function DuctLayoutPlanner() {
  const [s, set, reset] = useToolState('duct-layout-planner', DEF)
  const act = s.runs.find((r) => r.id === s.active)
  const fit = useMemo(() => fittings(s.runs), [s.runs])
  const flows = useMemo(() => segmentFlows(s.runs), [s.runs])
  const pth = useMemo(() => paths(s.runs.filter((r) => r.kind === 'supply')).concat(paths(s.runs.filter((r) => r.kind === 'return'))), [s.runs])
  const crit = pth.reduce<(typeof pth)[number] | null>((b, p) => (!b || p.tel > b.tel ? p : b), null)
  const totalLen = s.runs.reduce((t, r) => t + runLength(r), 0)
  const supplyCfm = s.runs.filter((r) => r.kind === 'supply' && fit.byRun[r.id]?.terminal).reduce((t, r) => t + r.cfm, 0)
  const returnCfm = s.runs.filter((r) => r.kind === 'return' && fit.byRun[r.id]?.terminal).reduce((t, r) => t + r.cfm, 0)
  const editRun = (id: string, p: Partial<Run>) => set({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const clampP = (p: P3): P3 => [Math.max(0, Math.min(s.L, p[0])), Math.max(0.5, Math.min(s.H, p[1])), Math.max(0, Math.min(s.W, p[2]))]

  const addPoint = (p: P3) => set((st) => ({
    ...st,
    runs: st.runs.map((r) => {
      if (r.id !== st.active) return r
      const last = r.pts[r.pts.length - 1]
      if (!last) return { ...r, pts: [p] }
      const dx = Math.abs(p[0] - last[0]), dz = Math.abs(p[2] - last[2])
      const q: P3 = dx >= dz ? [p[0], last[1], last[2]] : [last[0], last[1], p[2]]
      if (Math.hypot(q[0] - last[0], q[2] - last[2]) < 1e-6) return r
      return { ...r, pts: [...r.pts, q] }
    }),
  }))

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'duct'
      st.scene.add(root)
      const ray = new THREE.Raycaster()
      const el = st.renderer.domElement
      let down = [0, 0]
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        root.userData.click?.(ray)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st) => {
      const root = st.scene.getObjectByName('duct') as THREE.Group
      st.clear(root)
      const off = new THREE.Vector3(-s.L / 2, 0, -s.W / 2)
      const P = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]).add(off).multiplyScalar(SC)
      // room shell
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.L * SC, s.W * SC), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.9 }))
      floor.rotation.x = -Math.PI / 2
      root.add(floor)
      const grid = new THREE.GridHelper(Math.max(s.L, s.W) * SC, Math.round(Math.max(s.L, s.W) / Math.max(0.25, s.step)), 0x475569, 0x3b4a5e)
      grid.position.y = 0.002
      ;(grid.material as THREE.Material).transparent = true
      ;(grid.material as THREE.Material).opacity = 0.35
      root.add(grid)
      const box = new THREE.BoxGeometry(s.L * SC, s.H * SC, s.W * SC)
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
      shell.position.y = (s.H * SC) / 2
      root.add(shell)
      box.dispose()
      for (const [w, h, x, z, ry] of [[s.L, s.H, 0, -s.W / 2, 0], [s.W, s.H, -s.L / 2, 0, Math.PI / 2]] as const) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(w * SC, h * SC), new THREE.MeshStandardMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
        wall.position.set(x * SC, (h * SC) / 2, z * SC)
        wall.rotation.y = ry
        root.add(wall)
      }
      if (s.ahu) {
        const ahu = new THREE.Mesh(new THREE.BoxGeometry(3 * SC, 8.6 * SC, 4 * SC), new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.5, roughness: 0.4 }))
        ahu.position.copy(P([1.5, 4.3, 4.2]))
        root.add(ahu)
        if (s.labels) {
          const lb = label('Air handler', '#e2e8f0', 0.28)
          lb.position.copy(P([1.5, 9.2, 4.2]))
          root.add(lb)
        }
      }
      const up = new THREE.Vector3(0, 1, 0)
      const pick: THREE.Object3D[] = []
      for (const r of s.runs) {
        const on = r.id === s.active
        const col = r.kind === 'return' ? '#a78bfa' : '#cbd5e1'
        const mat = new THREE.MeshStandardMaterial({ color: on ? '#38bdf8' : col, metalness: 0.75, roughness: 0.35, emissive: on ? '#0c4a6e' : '#000000' })
        const rad = (diameterOf(r) / 24) * SC
        for (let i = 0; i + 1 < r.pts.length; i++) {
          const a = P(r.pts[i]), b = P(r.pts[i + 1])
          const len = a.distanceTo(b)
          if (!len) continue
          const dir = b.clone().sub(a).normalize()
          const geo = r.shape === 'round' ? new THREE.CylinderGeometry(rad, rad, len, 20) : new THREE.BoxGeometry((r.w / 12) * SC, len, (r.h / 12) * SC)
          const m = new THREE.Mesh(geo, mat)
          m.position.copy(a).add(b).multiplyScalar(0.5)
          if (r.shape === 'rect') {
            // keep the rectangle's height vertical for horizontal runs
            const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
            m.quaternion.copy(q)
            if (Math.abs(dir.y) < 0.9) {
              const sideNow = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
              const ang = Math.atan2(sideNow.clone().cross(new THREE.Vector3(0, 1, 0)).dot(dir), sideNow.dot(new THREE.Vector3(0, 1, 0)))
              m.rotateY(-ang)
            }
          } else m.quaternion.setFromUnitVectors(up, dir)
          m.userData.run = r.id
          root.add(m)
          pick.push(m)
        }
        for (let i = 1; i + 1 < r.pts.length; i++) {
          const j = r.shape === 'round' ? new THREE.Mesh(new THREE.SphereGeometry(rad * 1.05, 16, 12), mat) : new THREE.Mesh(new THREE.BoxGeometry(Math.max(r.w, r.h) / 12 * SC, Math.max(r.w, r.h) / 12 * SC * 0.8, Math.max(r.w, r.h) / 12 * SC), mat)
          j.position.copy(P(r.pts[i]))
          root.add(j)
        }
        const last = r.pts[r.pts.length - 1]
        if (fit.byRun[r.id]?.terminal && last) {
          const g = new THREE.Mesh(new THREE.BoxGeometry(rad * 3.2, 0.03, rad * 3.2), new THREE.MeshStandardMaterial({ color: r.kind === 'return' ? '#8b5cf6' : '#22c55e' }))
          g.position.copy(P(last)).add(new THREE.Vector3(0, -rad * 1.1, 0))
          root.add(g)
          if (s.labels) {
            const lb = label(`${r.name} · ${r.cfm} cfm`, r.kind === 'return' ? '#c4b5fd' : '#86efac', 0.26)
            lb.position.copy(P(last)).add(new THREE.Vector3(0, 0.35, 0))
            root.add(lb)
          }
        }
        if (on) for (const p of r.pts) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#f97316', depthTest: false }))
          dot.position.copy(P(p))
          dot.renderOrder = 2
          root.add(dot)
        }
      }
      if (s.draw && act) {
        const y = (act.pts[act.pts.length - 1]?.[1] ?? s.elev)
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.L * SC, s.W * SC), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }))
        plane.rotation.x = -Math.PI / 2
        plane.position.y = y * SC
        root.add(plane)
      }
      root.userData.click = (ray: THREE.Raycaster) => {
        if (s.draw && act) {
          const y = act.pts[act.pts.length - 1]?.[1] ?? s.elev
          const hit = new THREE.Vector3()
          if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y * SC), hit)) return
          const w = hit.multiplyScalar(1 / SC).sub(off)
          addPoint(clampP([snap(w.x, s.step), y, snap(w.z, s.step)]))
        } else {
          const h = ray.intersectObjects(pick, false)[0]
          if (h) set({ active: h.object.userData.run as string })
        }
      }
    },
    [s.runs, s.active, s.L, s.W, s.H, s.step, s.draw, s.labels, s.ahu, s.elev, fit],
    { camera: [-3.5, 6.5, 8.5], grid: false, target: [0, 1, 0] },
  )

  const newRun = (branchFrom?: P3) => {
    const id = uid()
    const start: P3 = branchFrom ?? [s.L / 2, s.elev, s.W / 2]
    set({ runs: [...s.runs, run(id, branchFrom ? 'Branch' : 'New run', act?.kind ?? 'supply', 'round', [6], 100, [start])], active: id, draw: true })
  }
  const actFlows = act ? flows.get(act.id) ?? [] : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Length (x)" value={s.L} onChange={(L) => set({ L })} unit="ft" min={4} max={200} />
            <Num label="Width (z)" value={s.W} onChange={(W) => set({ W })} unit="ft" min={4} max={200} />
            <Num label="Height" value={s.H} onChange={(H) => set({ H })} unit="ft" min={6} max={40} />
          </Row>
          <Row>
            <Seg value={String(s.step)} onChange={(v) => set({ step: Number(v) })} options={[['0.5', 'Snap 6″'], ['1', 'Snap 1 ft'], ['2', 'Snap 2 ft']]} />
            <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
            <Check label="Air handler" value={s.ahu} onChange={(ahu) => set({ ahu })} />
          </Row>
        </Panel>
        <Panel title="Duct runs" actions={<Btn onClick={() => newRun()}>+ Run</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {s.runs.map((r) => (
              <Btn key={r.id} kind={r.id === s.active ? 'primary' : 'normal'} onClick={() => set({ active: r.id })}>{r.kind === 'return' ? '↩ ' : ''}{r.name} <span style={{ opacity: 0.7 }}>{sizeLabel(r)}</span></Btn>
            ))}
          </div>
        </Panel>
        {act && (
          <Panel title={`Edit: ${act.name}`} actions={<Btn kind="danger" onClick={() => set({ runs: s.runs.filter((r) => r.id !== act.id), active: s.runs.find((r) => r.id !== act.id)?.id ?? '' })}>Delete run</Btn>}>
            <Row>
              <Txt label="Name" value={act.name} onChange={(name) => editRun(act.id, { name })} />
              <Num label="Terminal airflow" value={act.cfm} onChange={(cfm) => editRun(act.id, { cfm })} unit="cfm" min={0} />
            </Row>
            <Row>
              <Seg value={act.kind} onChange={(kind) => editRun(act.id, { kind })} options={[['supply', 'Supply'], ['return', 'Return']]} />
              <Seg value={act.shape} onChange={(shape) => editRun(act.id, { shape })} options={[['round', 'Round'], ['rect', 'Rectangular']]} />
            </Row>
            <Row>
              {act.shape === 'round' ? <Num label="Diameter" value={act.d} onChange={(d) => editRun(act.id, { d })} unit="in" min={3} max={48} /> : (
                <>
                  <Num label="Width" value={act.w} onChange={(w) => editRun(act.id, { w })} unit="in" min={3} max={96} />
                  <Num label="Height" value={act.h} onChange={(h) => editRun(act.id, { h })} unit="in" min={3} max={48} />
                </>
              )}
            </Row>
            <Row>
              <Btn kind={s.draw ? 'primary' : 'normal'} onClick={() => set({ draw: !s.draw })}>{s.draw ? '✎ Drawing: click the floor plan' : '✎ Draw points'}</Btn>
              <Btn disabled={act.pts.length < 2} onClick={() => editRun(act.id, { pts: act.pts.slice(0, -1) })}>Undo point</Btn>
              <Btn disabled={!act.pts.length} onClick={() => { const l = act.pts[act.pts.length - 1]; editRun(act.id, { pts: [...act.pts, clampP([l[0], l[1] + 1, l[2]])] }) }}>Rise 1 ft</Btn>
              <Btn disabled={!act.pts.length} onClick={() => { const l = act.pts[act.pts.length - 1]; editRun(act.id, { pts: [...act.pts, clampP([l[0], l[1] - 1, l[2]])] }) }}>Drop 1 ft</Btn>
            </Row>
            <Table head={['#', 'x ft', 'y (height)', 'z ft', 'cfm in seg', '']} rows={act.pts.map((p, i) => [
              i + 1,
              ...([0, 1, 2] as const).map((k) => <input key={k} type="number" step={s.step} value={p[k]} style={{ width: 62 }} onChange={(e) => e.target.value !== '' && editRun(act.id, { pts: act.pts.map((q, j) => (j === i ? (q.map((v, kk) => (kk === k ? Number(e.target.value) : v)) as P3) : q)) })} />),
              i > 0 ? num(actFlows[i - 1] ?? 0, 0) : '',
              <span key="b" style={{ whiteSpace: 'nowrap' }}>
                <Btn kind="ghost" title="Start a branch here" onClick={() => newRun(p)}>⑂</Btn>
                <Btn kind="ghost" title="Delete point" disabled={act.pts.length < 2} onClick={() => editRun(act.id, { pts: act.pts.filter((_, j) => j !== i) })}>✕</Btn>
              </span>,
            ])} />
            <p className="muted" style={{ fontSize: 12 }}>Draw mode adds orthogonal, snapped segments at the height of the last point. ⑂ starts a branch at a point; a branch that starts on another run's segment becomes a tee. Vertical moves create rises/drops with elbows.</p>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Duct length" value={`${num(totalLen, 1)} ft`} sub={`${num(totalLen * 0.3048, 1)} m · ${s.runs.length} runs`} tone="accent" />
          <Stat label="Fittings" value={fit.elbow90 + fit.elbowOther + fit.tees + fit.transitions} sub={`${fit.elbow90} elbows · ${fit.tees} tees · ${fit.transitions} transitions`} />
          <Stat label="Terminals" value={fit.terminals} sub={`supply ${supplyCfm} cfm · return ${returnCfm} cfm`} tone={Math.abs(supplyCfm - returnCfm) > 0.15 * supplyCfm ? 'bad' : 'good'} />
          <Stat label="Longest TEL" value={crit ? `${num(crit.tel, 0)} ft` : '—'} sub={crit ? `${s.runs.find((r) => r.id === crit.run)?.name} · ${num(crit.loss, 3)} in.wg duct loss` : ''} />
        </Stats>
        <Panel title="3D layout">
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12 }}>{s.draw ? 'Draw mode: click on the blue plane to extend the highlighted run (snapped and kept orthogonal). Drag to orbit.' : 'Click a duct to select it. Drag to orbit, scroll to zoom. Green plates are supply registers, violet ones return grilles.'}</p>
        </Panel>
        {Math.abs(supplyCfm - returnCfm) > 0.15 * supplyCfm && <Note tone="warn">Return airflow ({returnCfm} cfm) differs from supply ({supplyCfm} cfm) by more than 15 %. Balance them to avoid pressurising the room.</Note>}
        <Panel title="Material take-off" actions={<CsvButton name="duct-takeoff.csv" rows={() => [['run', 'type', 'size', 'length_ft', 'sheet_metal_ft2', 'elbows', 'tee', 'terminal', 'cfm'], ...s.runs.map((r) => [r.name, r.kind, sizeLabel(r), runLength(r).toFixed(1), surfaceOf(r).toFixed(1), fit.byRun[r.id]?.elbows ?? 0, fit.byRun[r.id]?.tee ? 1 : 0, fit.byRun[r.id]?.terminal ? 1 : 0, r.cfm])]} />}>
          <Table head={['Size', 'Type', 'Length ft', 'Sheet metal ft²', 'Runs']} rows={Object.entries(s.runs.reduce<Record<string, { kind: string; len: number; area: number; n: number }>>((acc, r) => {
            const k = `${sizeLabel(r)}|${r.kind}`
            acc[k] ??= { kind: r.kind, len: 0, area: 0, n: 0 }
            acc[k].len += runLength(r)
            acc[k].area += surfaceOf(r)
            acc[k].n++
            return acc
          }, {})).map(([k, v]) => [k.split('|')[0], v.kind, num(v.len, 1), num(v.area, 1), v.n])} />
          <Table head={['Fitting', 'Count', 'Equivalent length each']} rows={[
            ['90° elbow', fit.elbow90, `${EL.elbow90} ft`], ['Angled elbow', fit.elbowOther, `${EL.elbowOther} ft`], ['Tee / take-off', fit.tees, `${EL.teeBranch} ft (branch)`],
            ['Size transition', fit.transitions, `${EL.transition} ft`], ['Register / grille boot', fit.terminals, `${EL.terminal} ft`], ['Plenum collar (run start)', fit.collars, '—'],
          ].filter((r) => (r[1] as number) > 0)} />
        </Panel>
        <Panel title="Airflow check per terminal">
          <Table head={['Terminal', 'Size', 'cfm', 'Velocity', 'Friction /100 ft', 'TEL', 'Duct loss']} rows={pth.map((p) => {
            const r = s.runs.find((x) => x.id === p.run)!
            const v = velocity(r.cfm, r)
            const lim = r.kind === 'return' ? FPM_MAX.return : FPM_MAX.branch
            return [r.name, sizeLabel(r), r.cfm, <span key="v" style={{ color: v > lim ? 'var(--err)' : undefined }}>{num(v, 0)} fpm</span>, `${num(frictionPer100(r.cfm, diameterOf(r)), 3)} in.wg`, `${num(p.tel, 0)} ft`, `${num(p.loss, 3)} in.wg`]
          })} />
          {s.runs.filter((r) => fit.byRun[r.id] && !fit.byRun[r.id].terminal).map((r) => {
            const f = Math.max(0, ...(flows.get(r.id) ?? [0]))
            const v = f / (areaOf(r) || 1)
            return v > FPM_MAX.trunk ? <Note key={r.id} tone="warn">{r.name} carries {num(f, 0)} cfm at {num(v, 0)} fpm (over {FPM_MAX.trunk} fpm): upsize it to reduce noise.</Note> : null
          })}
          <p className="muted" style={{ fontSize: 12 }}>Total effective length (TEL) = straight length from the air handler + equivalent lengths of elbows, tees, transitions and the boot. Friction uses the ASHRAE galvanised-duct fit 0.109·q¹·⁹/d⁵·⁰² (rectangular ducts via equivalent diameter). Residential targets: ≤ 700 fpm in branches, ≤ 900 fpm in trunks.</p>
        </Panel>
      </div>
    </Split>
  )
}
