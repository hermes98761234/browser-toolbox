import { useEffect, useRef } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Num, num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { aisles, CATALOG, clampFix, doorBlockers, foot, overlaps, shelfMeters, type Fixture, type Store } from './lib/3d-store-planner'

interface State { store: Store; items: Fixture[]; sel: string; view: 'persp' | 'top'; snap: number; minAisle: number; showAisles: boolean }

const mk = (i: number, x: number, z: number, rot = 0): Fixture => ({ ...CATALOG[i], id: uid(), x, z, rot })

const DEF: State = {
  store: { w: 14, d: 10, h: 3.2, door: 7, doorW: 2 },
  sel: '',
  view: 'persp',
  snap: 0.1,
  minAisle: 1.2,
  showAisles: true,
  items: [
    mk(2, 3.5, 0.25), mk(2, 6.5, 0.25), mk(2, 9.5, 0.25), mk(2, 12.5, 0.25),
    mk(4, 0.4, 2.2, 270), mk(4, 0.4, 4.2, 270),
    mk(0, 4, 3, 90), mk(0, 4, 5.4, 90), mk(0, 6.4, 3, 90), mk(0, 6.4, 5.4, 90), mk(0, 8.8, 3, 90), mk(0, 8.8, 5.4, 90),
    mk(3, 4, 6.85), mk(3, 6.4, 6.85), mk(3, 8.8, 6.85),
    mk(5, 11.2, 9.1, 90), mk(5, 13.6, 9.1, 90),
    mk(6, 3.4, 9.55), mk(8, 11.2, 5.5),
  ],
}

let productTex: THREE.CanvasTexture | null = null
/** Shared texture of colourful product facings. */
function products(): THREE.CanvasTexture {
  if (productTex) return productTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const x = c.getContext('2d')!
  const cols = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc', '#84cc16', '#14b8a6', '#eab308']
  let px = 0, k = 0
  while (px < 256) {
    const w = 10 + ((k * 7) % 14)
    x.fillStyle = cols[(k * 3) % cols.length]
    x.fillRect(px + 1, 4 + ((k * 5) % 9), w - 2, 32)
    px += w
    k++
  }
  productTex = new THREE.CanvasTexture(c)
  productTex.wrapS = THREE.RepeatWrapping
  productTex.colorSpace = THREE.SRGBColorSpace
  return productTex
}

const variants = new Map<string, THREE.CanvasTexture>()
/** Cached texture variants (repeat × offset) so fixtures don't all look identical. */
function variant(rep: number, k: number): THREE.CanvasTexture {
  const key = `${Math.max(0.5, Math.round(rep * 2) / 2)}:${k % 3}`
  let t = variants.get(key)
  if (!t) {
    t = products().clone()
    t.repeat.set(Math.max(0.5, Math.round(rep * 2) / 2), 1)
    t.offset.x = (k % 3) * 0.37
    t.needsUpdate = true
    variants.set(key, t)
  }
  return t
}

/** Builds a fixture mesh group in local coordinates (front = +z). */
function fixtureMesh(f: Fixture, selected: boolean): THREE.Group {
  const g = new THREE.Group()
  const mat = (c: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: selected ? '#fbbf24' : '#000', emissiveIntensity: selected ? 0.3 : 0, ...extra })
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    b.position.set(x, y, z)
    g.add(b)
    return b
  }
  const shelves = (sideZ: number, depth: number, levels: number, top: number) => {
    for (let l = 0; l < levels; l++) {
      const y = 0.12 + (l * (top - 0.25)) / Math.max(1, levels)
      add(f.w - 0.04, 0.03, depth, 0, y, sideZ, mat('#cbd5e1'))
      const t = variant(f.w / 1.2, l + Math.round(f.x))
      add(f.w - 0.08, (top - 0.25) / Math.max(1, levels) - 0.06, depth * 0.8, 0, y + ((top - 0.25) / Math.max(1, levels)) / 2, sideZ, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }))
    }
  }
  switch (f.kind) {
    case 'gondola':
    case 'wall':
    case 'endcap': {
      add(f.w, f.h, 0.05, 0, f.h / 2, f.sides === 2 ? 0 : -f.d / 2 + 0.025, mat(f.color))
      add(f.w, 0.1, f.d, 0, 0.05, 0, mat(f.color))
      const depth = f.sides === 2 ? f.d / 2 - 0.05 : f.d - 0.06
      shelves(f.sides === 2 ? f.d / 4 + 0.012 : 0.03, depth, f.levels, f.h)
      if (f.sides === 2) shelves(-f.d / 4 - 0.012, depth, f.levels, f.h)
      if (f.kind === 'endcap') add(f.w, 0.25, 0.04, 0, f.h + 0.13, -f.d / 2 + 0.03, mat('#f97316'))
      break
    }
    case 'fridge': {
      add(f.w, f.h, f.d, 0, f.h / 2, 0, mat(f.color))
      const glass = new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 })
      const doors = Math.max(1, Math.round(f.w / 0.67))
      for (let k = 0; k < doors; k++) add(f.w / doors - 0.06, f.h - 0.4, 0.02, -f.w / 2 + (k + 0.5) * (f.w / doors), f.h / 2 - 0.05, f.d / 2 + 0.011, glass)
      add(f.w, 0.15, 0.02, 0, f.h - 0.08, f.d / 2 + 0.012, mat('#0ea5e9'))
      break
    }
    case 'checkout':
      add(f.w, f.h, f.d * 0.7, 0, f.h / 2, -f.d * 0.15, mat(f.color))
      add(f.w * 0.9, 0.04, f.d * 0.75, 0, f.h + 0.02, -f.d * 0.12, mat('#1e293b'))
      add(0.35, 0.25, 0.05, f.w * 0.3, f.h + 0.17, -f.d * 0.3, mat('#0f172a'))
      break
    case 'table':
      add(f.w, 0.06, f.d, 0, f.h - 0.03, 0, mat(f.color))
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(0.06, f.h - 0.06, 0.06, sx * (f.w / 2 - 0.08), (f.h - 0.06) / 2, sz * (f.d / 2 - 0.08), mat('#78350f'))
      for (let k = 0; k < 5; k++) add(0.18, 0.12, 0.25, -f.w / 2 + 0.25 + k * ((f.w - 0.5) / 4), f.h + 0.06, 0, mat(['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'][k]))
      break
    case 'rack':
      add(0.04, f.h, 0.04, -f.w / 2 + 0.02, f.h / 2, 0, mat(f.color))
      add(0.04, f.h, 0.04, f.w / 2 - 0.02, f.h / 2, 0, mat(f.color))
      add(f.w, 0.03, 0.03, 0, f.h - 0.05, 0, mat(f.color))
      for (let k = 0; k < 9; k++) add(0.05, 0.8, f.d * 0.8, -f.w / 2 + 0.15 + k * ((f.w - 0.3) / 8), f.h - 0.5, 0, mat(['#6366f1', '#ec4899', '#14b8a6', '#f8fafc', '#334155'][k % 5]))
      break
    default:
      add(f.w, 0.14, f.d, 0, 0.07, 0, mat('#a16207'))
      add(f.w * 0.92, f.h - 0.14, f.d * 0.9, 0, 0.14 + (f.h - 0.14) / 2, 0, new THREE.MeshStandardMaterial({ map: products(), roughness: 0.8 }))
  }
  // front marker strip on the floor
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(f.w * 0.6, 0.06), new THREE.MeshBasicMaterial({ color: selected ? '#f59e0b' : '#0f172a' }))
  fm.rotation.x = -Math.PI / 2
  fm.position.set(0, 0.006, f.d / 2 + 0.05)
  g.add(fm)
  return g
}

export default function StorePlanner() {
  const [s, set, reset] = useToolState('3d-store-planner', DEF)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const stageRef = useRef<Stage3D | null>(null)
  const roomG = useRef(new THREE.Group())
  const itemG = useRef(new THREE.Group())
  const sel = s.items.find((i) => i.id === s.sel)
  const editSel = (p: Partial<Fixture>) => set((st) => ({ ...st, items: st.items.map((i) => (i.id === st.sel ? clampFix({ ...i, ...p }, st.store) : i)) }))
  const al = aisles(s.items, s.store)
  const narrow = al.filter((a) => a.gap < s.minAisle)
  const byId = new Map(s.items.map((i) => [i.id, i]))

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(roomG.current, itemG.current)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      let down: { x: number; y: number; hit: boolean } | null = null
      const pick = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
      }
      const onDown = (e: PointerEvent) => {
        pick(e)
        const hit = ray.intersectObjects(itemG.current.children, true)[0]
        let o: THREE.Object3D | null = hit?.object ?? null
        while (o && !o.userData.id) o = o.parent
        down = { x: e.clientX, y: e.clientY, hit: !!o }
        if (!o) return
        const p = ray.ray.intersectPlane(floor, new THREE.Vector3())
        if (!p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { id: o.userData.id as string, dx: o.position.x - p.x, dz: o.position.z - p.z, obj: o }
        if (sRef.current.sel !== drag.id) set({ sel: drag.id })
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        pick(e)
        const p = ray.ray.intersectPlane(floor, new THREE.Vector3())
        if (!p) return
        const { store, items, snap } = sRef.current
        const it = items.find((i) => i.id === drag!.id)
        if (!it) return
        const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
        const c = clampFix({ ...it, x: q(p.x + drag.dx + store.w / 2), z: q(p.z + drag.dz + store.d / 2) }, store)
        drag.obj.position.set(c.x - store.w / 2, 0, c.z - store.d / 2)
        drag.obj.userData.x = c.x
        drag.obj.userData.z = c.z
      }
      const onUp = (e: PointerEvent) => {
        if (drag) {
          const { id, obj } = drag
          if (obj.userData.x !== undefined) set((st2) => ({ ...st2, items: st2.items.map((i) => (i.id === id ? { ...i, x: obj.userData.x as number, z: obj.userData.z as number } : i)) }))
          drag = null
          st.controls.enabled = true
        } else if (down && !down.hit && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && sRef.current.sel) set({ sel: '' })
        down = null
      }
      const onKey = (e: KeyboardEvent) => {
        const cur = sRef.current
        if (!cur.sel || (e.target as HTMLElement)?.closest?.('input,textarea,select')) return
        if (e.key === 'r' || e.key === 'R') set((st2) => ({ ...st2, items: st2.items.map((i) => (i.id === st2.sel ? clampFix({ ...i, rot: (i.rot + 90) % 360 }, st2.store) : i)) }))
        if (e.key === 'Delete') set((st2) => ({ ...st2, items: st2.items.filter((i) => i.id !== st2.sel), sel: '' }))
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      window.addEventListener('keydown', onKey)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        window.removeEventListener('keydown', onKey)
      }
    },
    (st) => {
      const { store, items, sel: selId, view, minAisle, showAisles } = sRef.current
      const W = store.w, D = store.d, H = store.h
      st.clear(roomG.current)
      st.clear(itemG.current)
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.95 }))
      fl.rotation.x = -Math.PI / 2
      roomG.current.add(fl)
      const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D)), 0xa8a29e, 0xd6d3d1)
      grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D))
      grid.position.y = 0.002
      roomG.current.add(grid)
      const wallMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 1 })
      for (const [len, x, z, ry] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]] as const) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat)
        m.position.set(x, H / 2, z)
        m.rotation.y = ry
        m.visible = view !== 'top'
        roomG.current.add(m)
      }
      // entrance + clear zone
      const door = new THREE.Mesh(new THREE.PlaneGeometry(store.doorW, 1.5), new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.25 }))
      door.rotation.x = -Math.PI / 2
      door.position.set(store.door - W / 2, 0.004, D / 2 - 0.75)
      roomG.current.add(door)
      const dl = label('ENTRANCE', '#16a34a', 0.32)
      dl.position.set(store.door - W / 2, 0.3, D / 2 + 0.35)
      roomG.current.add(dl)
      const lw = label(`${num(W, 1)} m`, '#f59e0b', 0.4)
      lw.position.set(0, 0.05, -D / 2 - 0.5)
      const ld = label(`${num(D, 1)} m`, '#f59e0b', 0.4)
      ld.position.set(-W / 2 - 0.8, 0.05, 0)
      roomG.current.add(lw, ld)
      for (const f of items) {
        const g = fixtureMesh(f, f.id === selId)
        g.userData.id = f.id
        g.position.set(f.x - W / 2, 0, f.z - D / 2)
        g.rotation.y = (-f.rot * Math.PI) / 180
        itemG.current.add(g)
      }
      if (showAisles)
        for (const a of aisles(items, store)) {
          const bad = a.gap < minAisle
          if (!bad && a.b === 'wall' && a.gap > 3) continue
          const c = bad ? '#ef4444' : '#16a34a'
          const p0 = a.axis === 'x' ? new THREE.Vector3(a.from - W / 2, 0.03, a.at - D / 2) : new THREE.Vector3(a.at - W / 2, 0.03, a.from - D / 2)
          const p1 = a.axis === 'x' ? new THREE.Vector3(a.to - W / 2, 0.03, a.at - D / 2) : new THREE.Vector3(a.at - W / 2, 0.03, a.to - D / 2)
          roomG.current.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), new THREE.LineBasicMaterial({ color: c })))
          const t = label(`${num(a.gap, 2)} m`, c, 0.3)
          t.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).setY(0.25)
          roomG.current.add(t)
        }
    },
    [s.store, s.items, s.sel, s.view, s.minAisle, s.showAisles],
    { camera: [4.2, 9.7, 10], grid: false, background: '#1e293b' },
  )

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const span = Math.max(s.store.w, s.store.d)
    st.controls.target.set(0, 0, 0)
    if (s.view === 'top') {
      st.camera.position.set(0, span * 1.35 + 1, 0.001)
      st.controls.enableRotate = false
    } else {
      st.camera.position.set(span * 0.3, span * 0.62 + 1, span * 0.72)
      st.controls.enableRotate = true
    }
    st.controls.update()
  }, [s.view, s.store])

  const add = (i: number) => {
    const it = clampFix({ ...CATALOG[i], id: uid(), x: s.store.w / 2, z: s.store.d / 2, rot: 0 }, s.store)
    set({ items: [...s.items, it], sel: it.id })
  }
  const setStore = (p: Partial<Store>) => set((st) => {
    const store = { ...st.store, ...p }
    store.w = Math.max(3, store.w)
    store.d = Math.max(3, store.d)
    return { ...st, store, items: st.items.map((i) => clampFix(i, store)) }
  })
  const area = s.store.w * s.store.d
  const used = s.items.reduce((a, i) => a + i.w * i.d, 0)
  const meters = shelfMeters(s.items)
  const clashes = overlaps(s.items)
  const blockers = doorBlockers(s.items, s.store)
  const minGap = al.filter((a) => a.b !== 'wall').reduce((m, a) => Math.min(m, a.gap), Infinity)
  const checkouts = s.items.filter((i) => i.kind === 'checkout').length

  return (
    <Split wide="right">
      <div>
        <Panel title="Store shell" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Width" value={s.store.w} onChange={(w) => setStore({ w })} unit="m" min={3} max={80} />
            <Num label="Depth" value={s.store.d} onChange={(d) => setStore({ d })} unit="m" min={3} max={80} />
            <Num label="Ceiling" value={s.store.h} onChange={(h) => setStore({ h: Math.max(2.2, h) })} unit="m" min={2.2} max={12} />
          </Row>
          <Row>
            <Num label="Entrance centre (from left)" value={s.store.door} onChange={(door) => setStore({ door })} unit="m" min={0} />
            <Num label="Entrance width" value={s.store.doorW} onChange={(doorW) => setStore({ doorW: Math.max(0.8, doorW) })} unit="m" min={0.8} />
          </Row>
          <Row>
            <Num label="Minimum aisle" value={s.minAisle} onChange={(minAisle) => set({ minAisle: Math.max(0.5, minAisle) })} unit="m" min={0.5} hint="0.9 m wheelchair minimum; 1.2–1.5 m typical retail" />
          </Row>
          <Seg label="Snap" value={String(s.snap)} onChange={(v) => set({ snap: Number(v) })} options={[['0', 'Free'], ['0.05', '5 cm'], ['0.1', '10 cm'], ['0.25', '25 cm'], ['0.5', '50 cm']]} />
        </Panel>
        <Panel title="Add fixture">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATALOG.map((c, i) => (
              <Btn key={c.name} onClick={() => add(i)}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, marginRight: 6, border: '1px solid var(--line)' }} />
                {c.name}
              </Btn>
            ))}
          </div>
        </Panel>
        <Panel title={sel ? `Selected: ${sel.name}` : 'Selected fixture'}>
          {!sel ? (
            <Note>Click a fixture in the 3D view or the schedule, then drag it across the floor. Press R to rotate, Delete to remove.</Note>
          ) : (
            <>
              <Row>
                <Txt label="Name" value={sel.name} onChange={(name) => editSel({ name })} />
                <label className="k-field" style={{ flex: '0 0 70px' }}>
                  <span className="k-label">Colour</span>
                  <input type="color" value={sel.color} onChange={(e) => editSel({ color: e.target.value })} style={{ height: 38, width: '100%', border: 0, background: 'none' }} />
                </label>
              </Row>
              <Row>
                <Num label="Length" value={sel.w} onChange={(w) => editSel({ w: Math.max(0.2, w) })} unit="m" min={0.2} />
                <Num label="Depth" value={sel.d} onChange={(d) => editSel({ d: Math.max(0.1, d) })} unit="m" min={0.1} />
                <Num label="Height" value={sel.h} onChange={(h) => editSel({ h: Math.max(0.2, h) })} unit="m" min={0.2} />
              </Row>
              <Row>
                <Num label="Shelf levels" value={sel.levels} onChange={(levels) => editSel({ levels: Math.max(0, Math.round(levels)) })} min={0} max={12} />
                <Num label="Sides" value={sel.sides} onChange={(sides) => editSel({ sides: Math.max(0, Math.min(2, Math.round(sides))) })} min={0} max={2} />
                <Num label="Rotation" value={sel.rot} onChange={(rot) => editSel({ rot: ((rot % 360) + 360) % 360 })} unit="°" />
              </Row>
              <Row>
                <Num label="X (from left wall)" value={Math.round(sel.x * 100) / 100} onChange={(x) => editSel({ x })} unit="m" />
                <Num label="Z (from back wall)" value={Math.round(sel.z * 100) / 100} onChange={(z) => editSel({ z })} unit="m" />
              </Row>
              <Row>
                <Btn onClick={() => editSel({ rot: (sel.rot + 90) % 360 })}>⟳ Rotate 90°</Btn>
                <Btn onClick={() => {
                  const { fw } = foot(sel)
                  const c = clampFix({ ...sel, id: uid(), x: sel.x + fw }, s.store)
                  set({ items: [...s.items, c], sel: c.id })
                }}>Duplicate beside</Btn>
                <Btn kind="danger" onClick={() => set({ items: s.items.filter((i) => i.id !== sel.id), sel: '' })}>Delete</Btn>
              </Row>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Panel
          title="Floor plan"
          actions={
            <>
              <Seg value={s.view} onChange={(view) => set({ view })} options={[['persp', '3D'], ['top', 'Top']]} />
              <Btn onClick={() => set({ showAisles: !s.showAisles })}>{s.showAisles ? 'Hide' : 'Show'} aisles</Btn>
              <Btn onClick={() => {
                const c = stageRef.current?.renderer.domElement
                if (!c) return
                const a = document.createElement('a')
                a.href = c.toDataURL('image/png')
                a.download = 'store-plan.png'
                a.click()
              }}>⬇ PNG</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={480} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Drag fixtures to move · drag empty floor to orbit · scroll to zoom · right-drag to pan. Lines show walkway widths: <span style={{ color: '#16a34a' }}>green</span> OK, <span style={{ color: '#ef4444' }}>red</span> narrower than {num(s.minAisle, 2)} m. Green zone = entrance clearance.
          </p>
        </Panel>
        <Stats>
          <Stat label="Floor area" value={`${num(area, 1)} m²`} sub={`${num(area * 10.7639, 0)} ft²`} />
          <Stat label="Fixture coverage" value={pct(used / area, 0)} sub={`${num(used, 1)} m² · ${s.items.length} fixtures`} tone={used / area > 0.45 ? 'bad' : undefined} />
          <Stat label="Shelf length" value={`${num(meters, 0)} m`} sub={`≈ ${num(meters / 0.25, 0)} facings @ 25 cm`} tone="accent" />
          <Stat label="Narrowest aisle" value={Number.isFinite(minGap) ? `${num(minGap, 2)} m` : '—'} tone={minGap < s.minAisle ? 'bad' : 'good'} sub={`${checkouts} checkout${checkouts === 1 ? '' : 's'}`} />
        </Stats>
        {clashes.length > 0 && <Note tone="err">Overlapping: {clashes.map(([a, b]) => `${a.name} ↔ ${b.name}`).join(', ')}.</Note>}
        {narrow.length > 0 && (
          <Note tone="warn">
            {narrow.length} walkway{narrow.length > 1 ? 's are' : ' is'} narrower than {num(s.minAisle, 2)} m:{' '}
            {narrow.slice(0, 6).map((a) => `${byId.get(a.a)?.name ?? '?'} ↔ ${a.b === 'wall' ? 'wall' : byId.get(a.b)?.name ?? '?'} (${num(a.gap, 2)} m)`).join('; ')}
            {narrow.length > 6 ? '…' : ''}
          </Note>
        )}
        {blockers.length > 0 && <Note tone="warn">Entrance clearance (1.5 m) is blocked by: {blockers.map((b) => b.name).join(', ')}.</Note>}
        {!clashes.length && !narrow.length && !blockers.length && <Note tone="ok">No overlaps, every walkway is at least {num(s.minAisle, 2)} m and the entrance is clear. ✓</Note>}
        <Panel
          title={`Fixture schedule (${s.items.length})`}
          actions={
            <>
              <CsvButton name="store-fixtures.csv" rows={() => [['Fixture', 'Type', 'Length m', 'Depth m', 'Height m', 'Levels', 'Sides', 'Shelf m', 'X m', 'Z m', 'Rotation'], ...s.items.map((i) => [i.name, i.kind, i.w, i.d, i.h, i.levels, i.sides, +(i.w * i.levels * i.sides).toFixed(2), +i.x.toFixed(2), +i.z.toFixed(2), i.rot])]} />
              <JsonButtons name="store-layout.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.items) && d.store) set({ ...DEF, ...d, sel: '' })
              }} />
            </>
          }
        >
          <Table
            head={['Fixture', 'Size (L×D×H)', 'Shelf m', 'Position', 'Rot', '']}
            rows={s.items.map((i) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: i.id === s.sel ? 800 : 500, padding: '2px 4px' }} onClick={() => set({ sel: i.id })}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i.color, marginRight: 6 }} />
                {i.name}
              </button>,
              `${num(i.w)} × ${num(i.d)} × ${num(i.h)}`,
              num(i.w * i.levels * i.sides, 1),
              `${num(i.x)}, ${num(i.z)}`,
              `${i.rot}°`,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id), sel: s.sel === i.id ? '' : s.sel })}>✕</Btn>,
            ])}
            foot={['Total', '', num(meters, 1), '', '', '']}
          />
        </Panel>
      </div>
    </Split>
  )
}
