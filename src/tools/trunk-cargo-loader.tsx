import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, JsonButtons, Note, Num, num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { collisions, dropZ, fitsOpening, litres, LUGGAGE, outside, packContainer, toItems, TRUNKS, trunkDims, type Luggage, type Placed, type Trunk } from './lib/trunk-cargo-loader'

interface State { preset: number; custom: Trunk; seatsDown: boolean; squeeze: number; items: Luggage[] }

// no red: red marks collisions
const COLS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16', '#64748b', '#eab308', '#06b6d4']
const mk = (i: number, qty = 1): Luggage => ({ ...LUGGAGE[i], id: uid(), qty, color: COLS[i % COLS.length] })
const DEF: State = { preset: 1, custom: { ...TRUNKS[1], name: 'Custom' }, seatsDown: false, squeeze: 10, items: [mk(0), mk(2), mk(4, 2), mk(8, 2)] }

const where = (p: Placed, L: number, W: number) =>
  `${p.x < L / 3 ? 'against the seat backs' : p.x + p.l > (2 * L) / 3 && p.x > L / 3 ? 'near the tailgate' : 'mid-boot'}, ${p.y + p.w / 2 < W / 3 ? 'left' : p.y + p.w / 2 > (2 * W) / 3 ? 'right' : 'centre'}`

export default function TrunkCargoLoader() {
  const [s, set, reset] = useToolState('trunk-cargo-loader', DEF)
  const trunk = s.preset >= 0 ? TRUNKS[s.preset] : s.custom
  const T = trunkDims(trunk, s.seatsDown)
  const items = useMemo(() => toItems(s.items, s.squeeze / 100), [s.items, s.squeeze])
  const sig = JSON.stringify([T, items])
  const packed = useMemo(() => [0.7, 0.5].map((sup) => packContainer({ ...T, payload: 1e9 }, items, sup)).reduce((a, b) => (b.placed.length > a.placed.length || (b.placed.length === a.placed.length && b.volumeUse > a.volumeUse) ? b : a)), [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<{ sig: string; ps: Placed[] } | null>(null)
  const placed = moved?.sig === sig ? moved.ps : packed.placed
  const bad = new Set(collisions(placed).flat())
  placed.forEach((p, i) => { if (outside(p, T.L, T.W, T.H)) bad.add(i) })
  const tooBig = s.items.filter((g) => !fitsOpening(g, trunk.openW, trunk.openH, s.squeeze / 100))
  const total = s.items.reduce((a, g) => a + g.qty, 0)
  const vol = placed.reduce((a, p) => a + p.l * p.w * p.h, 0) / (T.L * T.W * T.H)
  const kg = placed.reduce((a, p) => a + items[p.item].kg, 0)
  const left = packed.unplaced.map((n, i) => [n, i] as const).filter(([n]) => n > 0)
  const editItem = (id: string, p: Partial<Luggage>) => set({ items: s.items.map((g) => (g.id === id ? { ...g, ...p } : g)) })

  const sRef = useRef({ placed, T, sig })
  useEffect(() => { sRef.current = { placed, T, sig } })
  const boxG = useRef(new THREE.Group())
  const carG = useRef(new THREE.Group())
  const ref = useStage3D(
    (st) => {
      st.scene.add(carG.current, boxG.current)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      let drag: { i: number; plane: THREE.Plane; dx: number; dz: number; obj: THREE.Object3D } | null = null
      const pick = (e: PointerEvent) => { const r = el.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera) }
      const onDown = (e: PointerEvent) => {
        pick(e)
        let o: THREE.Object3D | null = ray.intersectObjects(boxG.current.children, true)[0]?.object ?? null
        while (o && o.userData.i === undefined) o = o.parent
        if (!o) return
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -o.position.y)
        const p = ray.ray.intersectPlane(plane, new THREE.Vector3())
        if (!p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { i: o.userData.i as number, plane, dx: o.position.x - p.x, dz: o.position.z - p.z, obj: o }
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        pick(e)
        const p = ray.ray.intersectPlane(drag.plane, new THREE.Vector3())
        if (p) { drag.obj.position.x = p.x + drag.dx; drag.obj.position.z = p.z + drag.dz }
      }
      const onUp = () => {
        if (!drag) return
        const { placed: ps, T: t, sig: sg } = sRef.current
        const b = ps[drag.i]
        const cx = drag.obj.position.x * 1000 + t.W / 2, cz = drag.obj.position.z * 1000 + t.L / 2
        const nb = { ...b, y: Math.round(Math.min(t.W - b.w, Math.max(0, cx - b.w / 2)) / 10) * 10, x: Math.round(Math.min(t.L - b.l, Math.max(0, cz - b.l / 2)) / 10) * 10 }
        nb.z = dropZ(nb, ps.filter((_, j) => j !== drag!.i))
        setMoved({ sig: sg, ps: ps.map((q, j) => (j === drag!.i ? nb : q)) })
        drag = null
        st.controls.enabled = true
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp) }
    },
    (st) => {
      const { placed: ps, T: t } = sRef.current
      st.clear(carG.current)
      st.clear(boxG.current)
      const L = t.L / 1000, W = t.W / 1000, H = t.H / 1000
      const fl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, L), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 1 }))
      fl.position.y = -0.01
      carG.current.add(fl)
      const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }))
      shell.position.y = H / 2
      carG.current.add(shell)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
      edges.position.y = H / 2
      carG.current.add(edges)
      const seat = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.04), new THREE.MeshStandardMaterial({ color: '#475569', transparent: true, opacity: 0.5 }))
      seat.position.set(0, H / 2, -L / 2 - 0.02)
      carG.current.add(seat)
      const open = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(Math.min(W, trunk.openW / 1000), Math.min(H, trunk.openH / 1000))), new THREE.LineBasicMaterial({ color: '#fbbf24' }))
      open.position.set(0, Math.min(H, trunk.openH / 1000) / 2, L / 2)
      carG.current.add(open)
      const lb = label('tailgate opening', '#fbbf24', 0.05)
      lb.position.set(0, Math.min(H, trunk.openH / 1000) + 0.06, L / 2)
      carG.current.add(lb)
      const ls = label('seat backs', '#cbd5e1', 0.05)
      ls.position.set(0, H + 0.06, -L / 2)
      carG.current.add(ls)
      const bset = new Set(collisions(ps).flat())
      ps.forEach((p, i) => {
        const g = new THREE.Group()
        const geo = new THREE.BoxGeometry(p.w / 1000 - 0.006, p.h / 1000 - 0.006, p.l / 1000 - 0.006)
        const hit = bset.has(i) || outside(p, t.L, t.W, t.H)
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: items[p.item]?.color ?? '#888', roughness: 0.6, emissive: hit ? 0xdc2626 : 0x000000, emissiveIntensity: hit ? 0.7 : 0 }))
        g.add(m)
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#0f172a' })))
        g.position.set((p.y + p.w / 2) / 1000 - W / 2, (p.z + p.h / 2) / 1000, (p.x + p.l / 2) / 1000 - L / 2)
        g.userData.i = i
        boxG.current.add(g)
      })
    },
    [placed, T.L, T.W, T.H, trunk.openW, trunk.openH],
    { camera: [0.75, 1.05, 1.35], target: [0, 0.2, 0], background: '#0f172a', grid: false },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Car">
          <Select label="Boot type" value={s.preset} onChange={(preset) => set({ preset })} options={[...TRUNKS.map((t, i) => [i, t.name] as const), [-1, 'Custom (measure your own)'] as const]} />
          {s.preset < 0 && (
            <>
              <Row>
                <Num label="Depth" unit="cm" min={30} value={s.custom.L / 10} onChange={(v) => set({ custom: { ...s.custom, L: v * 10 } })} />
                <Num label="Width" unit="cm" min={30} value={s.custom.W / 10} onChange={(v) => set({ custom: { ...s.custom, W: v * 10 } })} />
                <Num label="Height" unit="cm" min={20} value={s.custom.H / 10} onChange={(v) => set({ custom: { ...s.custom, H: v * 10 } })} />
              </Row>
              <Row>
                <Num label="Opening width" unit="cm" min={30} value={s.custom.openW / 10} onChange={(v) => set({ custom: { ...s.custom, openW: v * 10 } })} />
                <Num label="Opening height" unit="cm" min={20} value={s.custom.openH / 10} onChange={(v) => set({ custom: { ...s.custom, openH: v * 10 } })} />
                <Num label="Extra depth, seats down" unit="cm" min={0} value={s.custom.folded / 10} onChange={(v) => set({ custom: { ...s.custom, folded: v * 10 } })} />
              </Row>
            </>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Usable space {num(T.L / 10, 0)} × {num(T.W / 10, 0)} × {num(T.H / 10, 0)} cm (depth × width × height) ≈ <b>{num(litres(T.L, T.W, T.H), 0)} L</b> as a box; opening {num(trunk.openW / 10, 0)} × {num(trunk.openH / 10, 0)} cm. Preset sizes are typical, so measure between the wheel arches and up to the parcel shelf for your car.</p>
          <Check label="Rear seats folded down" value={s.seatsDown} onChange={(seatsDown) => set({ seatsDown })} />
          <Slider label="Soft bags squeeze by" value={s.squeeze} min={0} max={25} unit="%" onChange={(squeeze) => set({ squeeze })} />
        </Panel>
        <Panel title="Luggage" actions={<><JsonButtons name="trunk-load.json" data={s} onLoad={(d) => Array.isArray(d.items) && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          {s.items.map((g) => (
            <div key={g.id} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <i style={{ width: 14, height: 14, borderRadius: 4, background: g.color, flex: 'none' }} />
                <input className="k-text" value={g.name} onChange={(e) => editItem(g.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="Item name" />
                <input className="k-text" type="number" min={0} value={g.qty} onChange={(e) => editItem(g.id, { qty: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) })} style={{ width: 56 }} aria-label="Quantity" title="Quantity" />
                <Btn kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== g.id) })} title="Remove">✕</Btn>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 13, flexWrap: 'wrap' }}>
                {(['l', 'w', 'h'] as const).map((k) => (
                  <input key={k} className="k-text" type="number" min={5} value={g[k] / 10} onChange={(e) => editItem(g.id, { [k]: Math.max(50, (Number(e.target.value) || 0) * 10) })} style={{ width: 62 }} aria-label={`${k} in cm`} title={`${k === 'l' ? 'Length' : k === 'w' ? 'Width' : 'Height'} (cm)`} />
                ))}
                <span className="muted">cm</span>
                <input className="k-text" type="number" min={0} value={g.kg} onChange={(e) => editItem(g.id, { kg: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 56 }} aria-label="Weight kg" title="Weight (kg)" />
                <span className="muted">kg</span>
                <label className="k-check"><input type="checkbox" checked={g.soft} onChange={(e) => editItem(g.id, { soft: e.target.checked })} /> soft</label>
                <label className="k-check"><input type="checkbox" checked={g.fragile} onChange={(e) => editItem(g.id, { fragile: e.target.checked })} /> nothing on top</label>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {LUGGAGE.map((p, i) => <Btn key={p.name} onClick={() => set({ items: [...s.items, mk(i)] })}>+ {p.name}</Btn>)}
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Fits" value={`${placed.length} / ${total}`} tone={placed.length === total && !bad.size ? 'good' : 'bad'} sub={placed.length === total ? (bad.size ? 'but some boxes collide' : 'everything goes in') : `${total - placed.length} left behind`} />
          <Stat label="Space used" value={pct(vol, 0)} sub={`${num(litres(T.L, T.W, T.H) * vol, 0)} of ${num(litres(T.L, T.W, T.H), 0)} L`} />
          <Stat label="Load" value={`${num(kg, 0)} kg`} sub="check your car’s payload" />
        </Stats>
        <Panel title="3D boot" actions={<Btn onClick={() => setMoved(null)} disabled={!moved || moved.sig !== sig}>↺ Suggested packing</Btn>}>
          <View3D refEl={ref} height={420} />
          <p className="muted" style={{ fontSize: 13 }}>Drag a box to move it; it drops onto whatever is below. Red boxes overlap others or stick out of the boot. Orbit with the background.</p>
        </Panel>
        {tooBig.length > 0 && <Note tone="err">Won’t pass the tailgate opening: {tooBig.map((g) => g.name).join(', ')}.</Note>}
        {left.length > 0 && <Note tone="warn">Left behind: {left.map(([n, i]) => `${n} × ${items[i].name}`).join(', ')}. {s.seatsDown ? 'Try a bigger car or a roof box.' : 'Try folding the rear seats.'}</Note>}
        <Panel title="Loading order">
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            {placed.map((p, i) => {
              const it = items[p.item]
              const dims = [it.l, it.w, it.h].sort((a, b) => a - b)
              const pose = p.h === dims[0] ? 'lying flat' : p.h === dims[2] ? 'standing upright' : 'on its side'
              const under = p.z > 0 ? placed.filter((o, j) => j !== i && Math.abs(o.z + o.h - p.z) < 2 && Math.min(p.x + p.l, o.x + o.l) > Math.max(p.x, o.x) && Math.min(p.y + p.w, o.y + o.w) > Math.max(p.y, o.y)) : []
              return (
                <li key={i} style={{ color: bad.has(i) ? 'var(--err)' : undefined }}>
                  <b>{it.name}</b> {pose}, {where(p, T.L, T.W)}{under.length ? `, on top of ${[...new Set(under.map((o) => items[o.item].name))].join(' and ')}` : ''}
                </li>
              )
            })}
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>Tips: heaviest items low and against the seat backs; keep fragile things on top; nothing above the seat backs where it could fly forward when braking.</p>
        </Panel>
      </div>
    </Split>
  )
}
