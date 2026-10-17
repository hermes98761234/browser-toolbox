import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, Donut, JsonButtons, Note, Num, num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { canStand, CATALOG, clampItem, clashes, foot, heightOf, metrics, walkways, type Item, type Kind, type Room } from './lib/3d-office-layout'

type View = 'persp' | 'top' | 'walk'
interface State { room: Room; items: Item[]; sel: string; view: View; snap: number; minAisle: number; showAisles: boolean }

const mk = (kind: Kind, x: number, z: number, rot = 0): Item => {
  const c = CATALOG[kind]
  return { id: uid(), kind, name: c.name, w: c.w, d: c.d, h: c.h, color: c.color, x, z, rot }
}

const DEF: State = {
  room: { w: 16, d: 11, h: 2.9, door: 12.5, doorW: 1.8 },
  sel: '',
  view: 'persp',
  snap: 0.1,
  minAisle: 1.0,
  showAisles: false,
  items: [
    // glass meeting room, back-left corner
    { ...mk('glass', 2.78, 4.4), w: 3.56 }, { ...mk('glass', 4.6, 2.2, 90), w: 4.4 }, mk('meet6', 2.2, 2.1), mk('board', 0.3, 2.1, 90),
    // desk zone along the back (window) wall
    mk('desk', 5.45, 0.7), mk('desk', 7.15, 0.7), mk('desk', 8.85, 0.7), mk('desk', 10.55, 0.7),
    mk('bench', 7.4, 4.3), mk('bench', 10.8, 4.3), mk('ldesk', 13.4, 4.3),
    mk('partition', 8.7, 6.0), mk('storage', 12.0, 0.25), mk('printer', 13.0, 0.35), mk('filing', 13.7, 0.35), mk('plant', 15.6, 1.4),
    // lounge + kitchen near the entrance
    mk('sofa', 3.0, 10.4, 180), mk('armchair', 1.0, 8.9, 90), mk('armchair', 5.0, 8.9, 270), mk('coffee', 3.0, 9.0),
    mk('kitchen', 7.8, 10.65, 180), mk('round', 8.0, 8.2),
    mk('booth', 15.4, 6.0, 270), mk('booth', 15.4, 7.3, 270), mk('shelf', 0.2, 6.2, 90), mk('plant', 0.4, 10.6),
  ],
}

/** Procedural furniture in local coordinates; the "front" (where people sit/approach) is +z. */
function furniture(it: Item, roomH: number, selected: boolean): THREE.Group {
  const g = new THREE.Group()
  const mat = (c: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, emissive: selected ? '#fbbf24' : '#000', emissiveIntensity: selected ? 0.28 : 0, ...extra })
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, p: THREE.Object3D = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    b.position.set(x, y, z)
    p.add(b)
    return b
  }
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material, p: THREE.Object3D = g) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 20), m)
    c.position.set(x, y, z)
    p.add(c)
    return c
  }
  const dark = mat('#1f2937'), metal = mat('#9ca3af', { metalness: 0.6, roughness: 0.35 }), top = mat(it.color)
  /** Task chair facing −z in its own frame (backrest at +z), placed at x,z rotated by ry. */
  const chair = (x: number, z: number, ry: number, c = '#334155') => {
    const ch = new THREE.Group()
    const m = mat(c)
    box(0.48, 0.07, 0.46, 0, 0.47, 0, m, ch)
    box(0.46, 0.5, 0.06, 0, 0.78, 0.22, m, ch)
    cyl(0.025, 0.025, 0.4, 0, 0.25, 0, metal, ch)
    for (let k = 0; k < 5; k++) {
      const leg = box(0.3, 0.03, 0.04, 0, 0.05, 0, dark, ch)
      leg.rotation.y = (k * 2 * Math.PI) / 5
      leg.position.set(Math.cos((k * 2 * Math.PI) / 5) * 0.15, 0.05, -Math.sin((k * 2 * Math.PI) / 5) * 0.15)
    }
    ch.position.set(x, 0, z)
    ch.rotation.y = ry
    g.add(ch)
  }
  const deskTop = (w: number, d: number, z: number, monitorAtBack = true, facing = 1) => {
    box(w, 0.03, d, 0, 0.735, z, top)
    for (const sx of [-1, 1]) box(0.04, 0.72, d * 0.9, sx * (w / 2 - 0.05), 0.36, z, metal)
    if (monitorAtBack) {
      const mz = z - facing * (d / 2 - 0.15)
      box(0.58, 0.34, 0.025, 0, 1.08, mz, dark)
      box(0.04, 0.25, 0.04, 0, 0.87, mz - facing * 0.03, metal)
      box(0.44, 0.02, 0.14, 0, 0.76, z + facing * 0.12, mat('#e5e7eb'))
    }
  }
  const { w, d } = it
  const H = heightOf(it, { h: roomH })
  switch (it.kind) {
    case 'desk':
      deskTop(w, 0.8, -d / 2 + 0.4)
      chair(0, d / 2 - 0.35, 0)
      break
    case 'ldesk':
      deskTop(w, 0.75, -d / 2 + 0.375)
      box(0.6, 0.03, d - 0.75, w / 2 - 0.3, 0.735, 0.375 - 0.0, top)
      box(0.04, 0.72, 0.04, w / 2 - 0.05, 0.36, d / 2 - 0.1, metal)
      box(0.4, 0.6, 0.5, w / 2 - 0.3, 0.3, 0.3, mat('#cbd5e1'))
      chair(-0.1, d / 2 - 0.4, 0)
      break
    case 'bench':
      deskTop(w, 0.75, -0.375, true, -1)
      deskTop(w, 0.75, 0.375, true, 1)
      // both rows: monitors near the centre spine
      box(w, 0.4, 0.03, 0, 0.95, 0, mat('#6366f1'))
      for (const sx of [-1, 1]) {
        chair((sx * w) / 4, -d / 2 + 0.35, Math.PI)
        chair((sx * w) / 4, d / 2 - 0.35, 0)
      }
      break
    case 'meet6':
    case 'meet10': {
      const n = it.kind === 'meet6' ? 3 : 5
      const tw = w - 0.4, td = it.kind === 'meet6' ? 1.1 : 1.2
      box(tw, 0.05, td, 0, 0.735, 0, top)
      box(tw * 0.6, 0.7, 0.12, 0, 0.36, 0, dark)
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * Math.min(0.8, (tw - 0.3) / n)
        chair(x, -(td / 2 + 0.35), Math.PI, '#475569')
        chair(x, td / 2 + 0.35, 0, '#475569')
      }
      break
    }
    case 'round':
      cyl(0.55, 0.55, 0.04, 0, 0.74, 0, top)
      cyl(0.05, 0.05, 0.72, 0, 0.36, 0, metal)
      cyl(0.28, 0.3, 0.03, 0, 0.015, 0, dark)
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2
        chair(Math.cos(a) * 0.85, Math.sin(a) * 0.85, Math.PI / 2 - a + Math.PI, '#0ea5e9')
      }
      break
    case 'sofa':
    case 'armchair': {
      const m = mat(it.color)
      box(w, 0.25, d, 0, 0.22, 0, m)
      box(w, 0.45, 0.2, 0, 0.55, -d / 2 + 0.1, m)
      for (const sx of [-1, 1]) box(0.15, 0.3, d, sx * (w / 2 - 0.075), 0.45, 0, m)
      const seats = it.kind === 'sofa' ? 3 : 1
      for (let k = 0; k < seats; k++) box((w - 0.3) / seats - 0.02, 0.1, d - 0.25, -w / 2 + 0.15 + ((k + 0.5) * (w - 0.3)) / seats, 0.39, 0.1, mat(it.color, { roughness: 0.95 }))
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.05, 0.1, 0.05, sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08), dark)
      break
    }
    case 'coffee':
      box(w, 0.04, d, 0, it.h - 0.02, 0, top)
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.04, it.h - 0.04, 0.04, sx * (w / 2 - 0.06), (it.h - 0.04) / 2, sz * (d / 2 - 0.06), dark)
      break
    case 'storage':
    case 'filing': {
      box(w, it.h, d, 0, it.h / 2, 0, top)
      const rows = it.kind === 'filing' ? 4 : 2, cols = it.kind === 'filing' ? 1 : 2
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          box(w / cols - 0.04, it.h / rows - 0.04, 0.01, -w / 2 + (c + 0.5) * (w / cols), (r + 0.5) * (it.h / rows), d / 2 + 0.005, mat('#e2e8f0'))
          box(0.12, 0.02, 0.02, -w / 2 + (c + 0.5) * (w / cols), (r + 0.75) * (it.h / rows), d / 2 + 0.02, metal)
        }
      break
    }
    case 'shelf': {
      const m = mat(it.color)
      for (const sx of [-1, 1]) box(0.03, it.h, d, sx * (w / 2 - 0.015), it.h / 2, 0, m)
      box(w, it.h, 0.02, 0, it.h / 2, -d / 2 + 0.01, m)
      const levels = 5
      const cols = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#f8fafc', '#0f766e']
      for (let l = 0; l <= levels; l++) {
        const y = (l * (it.h - 0.04)) / levels + 0.02
        box(w - 0.06, 0.02, d - 0.02, 0, y, 0, m)
        if (l === levels) continue
        let x = -w / 2 + 0.06, k = l * 3
        while (x < w / 2 - 0.1) {
          const bw = 0.03 + ((k * 7) % 4) * 0.01, bh = 0.2 + ((k * 5) % 5) * 0.02
          box(bw, bh, d * 0.75, x + bw / 2, y + 0.01 + bh / 2, 0.02, mat(cols[k % cols.length]))
          x += bw + 0.005
          k++
        }
      }
      break
    }
    case 'partition':
      box(w, it.h - 0.1, d, 0, 0.1 + (it.h - 0.1) / 2, 0, mat(it.color, { roughness: 1 }))
      for (const sx of [-1, 1]) box(0.05, 0.1, 0.4, sx * (w / 2 - 0.1), 0.05, 0, metal)
      break
    case 'glass': {
      const gl = new THREE.MeshStandardMaterial({ color: '#bae6fd', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, emissive: selected ? '#fbbf24' : '#000', emissiveIntensity: selected ? 0.4 : 0, depthWrite: false })
      box(w, H, d * 0.4, 0, H / 2, 0, gl)
      box(w, 0.06, d, 0, H - 0.03, 0, dark)
      box(w, 0.06, d, 0, 0.03, 0, dark)
      for (let k = 0; k <= Math.round(w / 1.2); k++) box(0.04, H, d, -w / 2 + (k * w) / Math.round(w / 1.2), H / 2, 0, dark)
      box(w * 0.98, 0.12, 0.01, 0, 1.2, d / 2, mat('#ffffff', { transparent: true, opacity: 0.6 }))
      break
    }
    case 'plant': {
      cyl(0.2, 0.15, 0.4, 0, 0.2, 0, mat('#b45309'))
      const leaf = mat(it.color, { roughness: 0.9 })
      for (const [x, y, z, r] of [[0, 0.75, 0, 0.26], [0.1, 1.0, 0.05, 0.22], [-0.08, 1.2, -0.05, 0.18]]) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf)
        s.position.set(x, y, z)
        g.add(s)
      }
      break
    }
    case 'printer':
      box(w, it.h - 0.2, d, 0, (it.h - 0.2) / 2, 0, top)
      box(w * 0.95, 0.2, d * 0.9, 0, it.h - 0.1, -0.02, mat('#94a3b8'))
      box(0.18, 0.08, 0.02, w / 4, it.h - 0.1, d / 2 - 0.04, mat('#0ea5e9'))
      break
    case 'kitchen':
      box(w, it.h - 0.04, d - 0.05, 0, (it.h - 0.04) / 2, -0.025, top)
      box(w, 0.04, d, 0, it.h - 0.02, 0, mat('#1f2937'))
      box(0.5, 0.02, 0.38, -w / 4, it.h + 0.001, 0, metal)
      box(0.3, 0.38, 0.3, w / 4, it.h + 0.19, -0.1, mat('#111827'))
      for (let k = 0; k < 4; k++) box(w / 4 - 0.03, it.h - 0.2, 0.01, -w / 2 + (k + 0.5) * (w / 4), (it.h - 0.04) / 2, d / 2 - 0.045, mat('#e5e7eb'))
      break
    case 'booth': {
      const m = mat(it.color)
      box(w, it.h, 0.06, 0, it.h / 2, -d / 2 + 0.03, m)
      box(w, 0.08, d, 0, it.h - 0.04, 0, m)
      for (const sx of [-1, 1]) box(0.06, it.h, d, sx * (w / 2 - 0.03), it.h / 2, 0, m)
      box(w - 0.12, it.h - 0.1, 0.02, 0, it.h / 2, d / 2 - 0.01, new THREE.MeshStandardMaterial({ color: '#bae6fd', transparent: true, opacity: 0.25, depthWrite: false }))
      box(0.6, 0.04, 0.35, 0, 1.05, -d / 2 + 0.25, mat('#a16207'))
      box(0.5, 0.45, 0.45, 0, 0.225, 0.05, mat('#f97316'))
      break
    }
    case 'board':
      for (const sx of [-1, 1]) {
        box(0.04, it.h, 0.04, sx * (w / 2 - 0.02), it.h / 2, 0, metal)
        box(0.04, 0.04, d, sx * (w / 2 - 0.02), 0.03, 0, metal)
      }
      box(w - 0.04, 1.1, 0.03, 0, it.h - 0.65, 0, mat('#ffffff', { roughness: 0.3 }))
      box(w * 0.4, 0.008, 0.005, -w * 0.15, it.h - 0.5, 0.02, mat('#2563eb'))
      box(w * 0.3, 0.008, 0.005, -w * 0.2, it.h - 0.62, 0.02, mat('#dc2626'))
      break
  }
  return g
}

export default function OfficeLayout() {
  const [s, set, reset] = useToolState('3d-office-layout', DEF)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const stageRef = useRef<Stage3D | null>(null)
  const roomG = useRef(new THREE.Group())
  const itemG = useRef(new THREE.Group())
  const walker = useRef({ x: s.room.door, z: s.room.d - 0.8, yaw: 0, pitch: -0.05 })
  const pad = useRef({ f: 0, t: 0 })
  const [pos, setPos] = useState('')
  const sel = s.items.find((i) => i.id === s.sel)
  const editSel = (p: Partial<Item>) => set((st) => ({ ...st, items: st.items.map((i) => (i.id === st.sel ? clampItem({ ...i, ...p }, st.room) : i)) }))
  const ways = walkways(s.items, s.room)
  const narrow = ways.filter((a) => a.gap < s.minAisle)
  const byId = new Map(s.items.map((i) => [i.id, i]))

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(roomG.current, itemG.current)
      const el = st.renderer.domElement
      el.tabIndex = 0
      const ray = new THREE.Raycaster()
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      let down: { x: number; y: number; hit: boolean } | null = null
      let look: { x: number; y: number } | null = null
      const keys = new Set<string>()
      const pick = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
      }
      const onDown = (e: PointerEvent) => {
        if (sRef.current.view === 'walk') {
          look = { x: e.clientX, y: e.clientY }
          el.setPointerCapture(e.pointerId)
          el.focus()
          return
        }
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
        if (look) {
          const w = walker.current
          w.yaw -= (e.clientX - look.x) * 0.005
          w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (e.clientY - look.y) * 0.004))
          look = { x: e.clientX, y: e.clientY }
          return
        }
        if (!drag) return
        pick(e)
        const p = ray.ray.intersectPlane(floor, new THREE.Vector3())
        if (!p) return
        const { room, items, snap } = sRef.current
        const it = items.find((i) => i.id === drag!.id)
        if (!it) return
        const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
        const c = clampItem({ ...it, x: q(p.x + drag.dx + room.w / 2), z: q(p.z + drag.dz + room.d / 2) }, room)
        drag.obj.position.set(c.x - room.w / 2, 0, c.z - room.d / 2)
        drag.obj.userData.x = c.x
        drag.obj.userData.z = c.z
      }
      const onUp = (e: PointerEvent) => {
        look = null
        if (drag) {
          const { id, obj } = drag
          if (obj.userData.x !== undefined) set((st2) => ({ ...st2, items: st2.items.map((i) => (i.id === id ? { ...i, x: obj.userData.x as number, z: obj.userData.z as number } : i)) }))
          drag = null
          st.controls.enabled = sRef.current.view !== 'walk'
        } else if (down && !down.hit && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && sRef.current.sel) set({ sel: '' })
        down = null
      }
      const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.('input,textarea,select')
      const onKey = (e: KeyboardEvent) => {
        if (typing(e)) return
        const cur = sRef.current
        if (cur.view === 'walk') {
          const k = e.key.toLowerCase()
          if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
            keys.add(k)
            if (k.startsWith('arrow')) e.preventDefault()
          }
          return
        }
        if (!cur.sel) return
        if (e.key === 'r' || e.key === 'R') set((st2) => ({ ...st2, items: st2.items.map((i) => (i.id === st2.sel ? clampItem({ ...i, rot: (i.rot + 90) % 360 }, st2.room) : i)) }))
        if (e.key === 'Delete') set((st2) => ({ ...st2, items: st2.items.filter((i) => i.id !== st2.sel), sel: '' }))
      }
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
      const blur = () => keys.clear()
      let lastPos = 0
      st.onFrame((t, dt) => {
        const cur = sRef.current
        if (cur.view !== 'walk') return
        const w = walker.current
        const has = (...k: string[]) => k.some((x) => keys.has(x))
        const turn = (has('arrowleft', 'q') ? 1 : 0) - (has('arrowright', 'e') ? 1 : 0) + pad.current.t
        w.yaw += turn * 1.8 * dt
        const fwd = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0) + pad.current.f
        const str = (has('d') ? 1 : 0) - (has('a') ? 1 : 0)
        const sp = (has('shift') ? 3 : 1.5) * dt
        const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw)
        const mx = (fx * fwd + Math.cos(w.yaw) * str) * sp, mz = (fz * fwd - Math.sin(w.yaw) * str) * sp
        if (canStand(w.x + mx, w.z, cur.items, cur.room)) w.x += mx
        if (canStand(w.x, w.z + mz, cur.items, cur.room)) w.z += mz
        const { room } = cur
        st.camera.position.set(w.x - room.w / 2, 1.6 + Math.sin(t * 9) * 0.012 * Math.min(1, Math.abs(fwd) + Math.abs(str)), w.z - room.d / 2)
        st.controls.target.set(st.camera.position.x + fx * Math.cos(w.pitch), 1.6 + Math.sin(w.pitch), st.camera.position.z + fz * Math.cos(w.pitch))
        if (t - lastPos > 0.25) {
          lastPos = t
          setPos(`${num(w.x, 1)} m, ${num(w.z, 1)} m · heading ${Math.round((((-w.yaw * 180) / Math.PI) % 360 + 360) % 360)}°`)
        }
      })
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      window.addEventListener('keydown', onKey)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', blur)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', blur)
      }
    },
    (st) => {
      const { room, items, sel: selId, view, minAisle, showAisles } = sRef.current
      const W = room.w, D = room.d, H = room.h
      st.clear(roomG.current)
      st.clear(itemG.current)
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#cbd5c0', roughness: 1 }))
      fl.rotation.x = -Math.PI / 2
      roomG.current.add(fl)
      if (view !== 'walk') {
        const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D)), 0x94a38a, 0xb5c2ab)
        grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D))
        grid.position.y = 0.002
        roomG.current.add(grid)
      }
      const wallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 1 })
      const winMat = new THREE.MeshStandardMaterial({ color: '#bfdbfe', emissive: '#93c5fd', emissiveIntensity: 0.5, roughness: 0.2 })
      for (const [len, x, z, ry, back] of [[W, 0, -D / 2, 0, true], [W, 0, D / 2, Math.PI, false], [D, -W / 2, 0, Math.PI / 2, false], [D, W / 2, 0, -Math.PI / 2, false]] as const) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat)
        m.position.set(x, H / 2, z)
        m.rotation.y = ry
        m.visible = view !== 'top'
        roomG.current.add(m)
        if (back && view !== 'top')
          for (let k = 0; k < Math.floor(W / 2.5); k++) {
            const wn = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5), winMat)
            wn.position.set(-W / 2 + 1.25 + k * 2.5, 1.65, -D / 2 + 0.01)
            roomG.current.add(wn)
          }
      }
      // ceiling (faces down: invisible from above) with light panels
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: '#d4d8de' }))
      ceil.rotation.x = Math.PI / 2
      ceil.position.y = H
      roomG.current.add(ceil)
      for (let x = 2; x < W - 1; x += 3)
        for (let z = 2; z < D - 1; z += 3) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#fffbe8' }))
          p.rotation.x = Math.PI / 2
          p.position.set(x - W / 2, H - 0.01, z - D / 2)
          roomG.current.add(p)
        }
      // entrance door on the front wall
      const door = new THREE.Mesh(new THREE.PlaneGeometry(room.doorW, 2.1), new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.6 }))
      door.position.set(room.door - W / 2, 1.05, D / 2 - 0.01)
      door.rotation.y = Math.PI
      roomG.current.add(door)
      if (view !== 'walk') {
        const dl = label('ENTRANCE', '#16a34a', 0.32)
        dl.position.set(room.door - W / 2, 0.3, D / 2 + 0.4)
        const lw = label(`${num(W, 1)} m`, '#f59e0b', 0.4)
        lw.position.set(0, 0.05, -D / 2 - 0.5)
        const ld = label(`${num(D, 1)} m`, '#f59e0b', 0.4)
        ld.position.set(-W / 2 - 1.2, 0.05, 0)
        roomG.current.add(dl, lw, ld)
      }
      for (const it of items) {
        const g = furniture(it, H, it.id === selId && view !== 'walk')
        g.userData.id = it.id
        g.position.set(it.x - W / 2, 0, it.z - D / 2)
        g.rotation.y = (-it.rot * Math.PI) / 180
        itemG.current.add(g)
      }
      if (showAisles && view !== 'walk')
        for (const a of walkways(items, room)) {
          const bad = a.gap < minAisle
          if (!bad && a.gap > 3) continue
          const c = bad ? '#ef4444' : '#16a34a'
          const p0 = a.axis === 'x' ? new THREE.Vector3(a.from - W / 2, 0.03, a.at - D / 2) : new THREE.Vector3(a.at - W / 2, 0.03, a.from - D / 2)
          const p1 = a.axis === 'x' ? new THREE.Vector3(a.to - W / 2, 0.03, a.at - D / 2) : new THREE.Vector3(a.at - W / 2, 0.03, a.to - D / 2)
          roomG.current.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), new THREE.LineBasicMaterial({ color: c })))
          const t = label(`${num(a.gap, 2)} m`, c, 0.3)
          t.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).setY(0.25)
          roomG.current.add(t)
        }
    },
    [s.room, s.items, s.sel, s.view, s.minAisle, s.showAisles],
    { camera: [5, 12, 13], grid: false, background: '#1e293b' },
  )

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const span = Math.max(s.room.w, s.room.d)
    st.camera.fov = s.view === 'walk' ? 70 : 50
    st.camera.updateProjectionMatrix()
    st.controls.enabled = s.view !== 'walk'
    if (s.view === 'walk') {
      const w = walker.current
      if (!canStand(w.x, w.z, s.items, s.room)) {
        w.x = s.room.door
        w.z = s.room.d - 0.6
        w.yaw = 0
        for (let k = 0; k < 30 && !canStand(w.x, w.z, s.items, s.room); k++) w.z -= 0.2
      }
      st.renderer.domElement.focus()
      return
    }
    st.controls.target.set(0, 0, 0)
    if (s.view === 'top') {
      st.camera.position.set(0, span * 1.25 + 1, 0.001)
      st.controls.enableRotate = false
    } else {
      st.camera.position.set(span * 0.25, span * 0.62 + 1, span * 0.75)
      st.controls.enableRotate = true
    }
    st.controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.view, s.room])

  const add = (k: Kind) => {
    const it = clampItem({ ...mk(k, s.room.w / 2, s.room.d / 2) }, s.room)
    set({ items: [...s.items, it], sel: it.id, view: s.view === 'walk' ? 'persp' : s.view })
  }
  const setRoom = (p: Partial<Room>) => set((st) => {
    const room = { ...st.room, ...p }
    room.w = Math.max(3, room.w)
    room.d = Math.max(3, room.d)
    return { ...st, room, items: st.items.map((i) => clampItem(i, room)) }
  })
  const m = metrics(s.items, s.room)
  const clash = clashes(s.items)
  const minGap = ways.filter((a) => a.b !== 'wall').reduce((x, a) => Math.min(x, a.gap), Infinity)
  const hold = (f: number, t: number) => ({
    onPointerDown: () => { pad.current = { f, t } },
    onPointerUp: () => { pad.current = { f: 0, t: 0 } },
    onPointerLeave: () => { pad.current = { f: 0, t: 0 } },
  })

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Width" value={s.room.w} onChange={(w) => setRoom({ w })} unit="m" min={3} max={80} />
            <Num label="Depth" value={s.room.d} onChange={(d) => setRoom({ d })} unit="m" min={3} max={80} />
            <Num label="Ceiling" value={s.room.h} onChange={(h) => setRoom({ h: Math.max(2.2, h) })} unit="m" min={2.2} max={8} />
          </Row>
          <Row>
            <Num label="Door centre (from left)" value={s.room.door} onChange={(door) => setRoom({ door })} unit="m" min={0} />
            <Num label="Min. walkway" value={s.minAisle} onChange={(minAisle) => set({ minAisle: Math.max(0.6, minAisle) })} unit="m" min={0.6} hint="0.9 m accessible route; 1.2 m+ for main corridors" />
          </Row>
          <Seg label="Snap" value={String(s.snap)} onChange={(v) => set({ snap: Number(v) })} options={[['0', 'Free'], ['0.05', '5 cm'], ['0.1', '10 cm'], ['0.25', '25 cm'], ['0.5', '50 cm']]} />
        </Panel>
        <Panel title="Add furniture">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(CATALOG) as Kind[]).map((k) => (
              <Btn key={k} onClick={() => add(k)}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: CATALOG[k].color, marginRight: 6, border: '1px solid var(--line)' }} />
                {CATALOG[k].name}
              </Btn>
            ))}
          </div>
        </Panel>
        <Panel title={sel ? `Selected: ${sel.name}` : 'Selected item'}>
          {!sel ? (
            <Note>Click furniture in the 3D view or in the list, then drag it across the floor. R rotates 90°, Delete removes it.</Note>
          ) : (
            <>
              <Row>
                <Txt label="Label" value={sel.name} onChange={(name) => editSel({ name })} />
                <label className="k-field" style={{ flex: '0 0 70px' }}>
                  <span className="k-label">Colour</span>
                  <input type="color" value={sel.color} onChange={(e) => editSel({ color: e.target.value })} style={{ height: 38, width: '100%', border: 0, background: 'none' }} />
                </label>
              </Row>
              <Row>
                <Num label="Width" value={sel.w} onChange={(w) => editSel({ w: Math.max(0.2, w) })} unit="m" min={0.2} />
                <Num label="Depth" value={sel.d} onChange={(d) => editSel({ d: Math.max(0.04, d) })} unit="m" min={0.04} />
                <Num label="Rotation" value={sel.rot} onChange={(rot) => editSel({ rot: ((rot % 360) + 360) % 360 })} unit="°" />
              </Row>
              <Row>
                <Num label="X (from left wall)" value={Math.round(sel.x * 100) / 100} onChange={(x) => editSel({ x })} unit="m" />
                <Num label="Z (from window wall)" value={Math.round(sel.z * 100) / 100} onChange={(z) => editSel({ z })} unit="m" />
              </Row>
              <Row>
                <Btn onClick={() => editSel({ rot: (sel.rot + 90) % 360 })}>⟳ Rotate 90°</Btn>
                <Btn onClick={() => {
                  const { fw } = foot(sel)
                  const c = clampItem({ ...sel, id: uid(), x: sel.x + fw }, s.room)
                  set({ items: [...s.items, c], sel: c.id })
                }}>Duplicate beside</Btn>
                <Btn kind="danger" onClick={() => set({ items: s.items.filter((i) => i.id !== sel.id), sel: '' })}>Delete</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Space use">
          <Donut size={170} slices={[['Workstations', m.byUse.work], ['Meeting', m.byUse.meet], ['Lounge', m.byUse.lounge], ['Support', m.byUse.support], ['Free floor', Math.max(0, m.area * (1 - m.coverage))]].map(([l, v]) => ({ label: l as string, value: Math.round((v as number) * 10) / 10 }))} fv={(v) => `${num(v, 1)} m²`} />
        </Panel>
      </div>

      <div>
        <Panel
          title="Floor plan"
          actions={
            <>
              <Seg value={s.view} onChange={(view) => set({ view })} options={[['persp', '3D'], ['top', 'Top'], ['walk', '🚶 Walk']]} />
              {s.view !== 'walk' && <Btn onClick={() => set({ showAisles: !s.showAisles })}>{s.showAisles ? 'Hide' : 'Show'} walkways</Btn>}
              <Btn onClick={() => {
                const c = stageRef.current?.renderer.domElement
                if (!c) return
                const a = document.createElement('a')
                a.href = c.toDataURL('image/png')
                a.download = 'office-layout.png'
                a.click()
              }}>⬇ PNG</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={500} />
          {s.view === 'walk' ? (
            <>
              <Row>
                <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>W/S or ↑/↓ walk · A/D strafe · ←/→ or Q/E turn · drag to look · Shift to hurry. {pos}</span>
                <button type="button" className="k-btn" {...hold(0, 1)}>⟲</button>
                <button type="button" className="k-btn" {...hold(1, 0)}>▲</button>
                <button type="button" className="k-btn" {...hold(-1, 0)}>▼</button>
                <button type="button" className="k-btn" {...hold(0, -1)}>⟳</button>
              </Row>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              Drag furniture to move (snaps to the grid) · drag empty floor to orbit · scroll to zoom · right-drag to pan. Switch to 🚶 Walk for a first-person tour at eye height (1.6 m).
            </p>
          )}
        </Panel>
        <Stats>
          <Stat label="Floor area" value={`${num(m.area, 1)} m²`} sub={`${num(m.area * 10.7639, 0)} ft²`} />
          <Stat label="Desks" value={m.work} sub={Number.isFinite(m.perDesk) ? `${num(m.perDesk, 1)} m² per desk` : 'no workstations'} tone={m.perDesk < 6 ? 'bad' : 'accent'} />
          <Stat label="Meeting / lounge seats" value={`${m.meet} / ${m.lounge}`} sub={m.work ? `${num(m.meet / m.work, 2)} meeting seats per desk` : ''} />
          <Stat label="Narrowest walkway" value={Number.isFinite(minGap) ? `${num(minGap, 2)} m` : '—'} tone={minGap < s.minAisle ? 'bad' : 'good'} sub={`furniture covers ${pct(m.coverage, 0)}`} />
        </Stats>
        {m.perDesk < 6 && <Note tone="warn">Under 6 m² per workstation is very dense. Typical open-plan offices plan 8–12 m² per person including circulation.</Note>}
        {clash.length > 0 && <Note tone="err">Overlapping: {clash.slice(0, 6).map(([a, b]) => `${a.name} ↔ ${b.name}`).join(', ')}{clash.length > 6 ? '…' : ''}.</Note>}
        {narrow.length > 0 && (
          <Note tone="warn">
            {narrow.length} gap{narrow.length > 1 ? 's are' : ' is'} narrower than {num(s.minAisle, 2)} m: {narrow.slice(0, 5).map((a) => `${byId.get(a.a)?.name ?? '?'} ↔ ${a.b === 'wall' ? 'wall' : byId.get(a.b)?.name ?? '?'} (${num(a.gap, 2)} m)`).join('; ')}{narrow.length > 5 ? '…' : ''}. Turn on “Show walkways” to see them.
          </Note>
        )}
        {!clash.length && !narrow.length && <Note tone="ok">No overlapping furniture and every walkway is at least {num(s.minAisle, 2)} m wide. ✓</Note>}
        <Panel
          title={`Furniture list (${s.items.length})`}
          actions={
            <>
              <CsvButton name="office-furniture.csv" rows={() => [['Item', 'Type', 'Width m', 'Depth m', 'Seats', 'X m', 'Z m', 'Rotation'], ...s.items.map((i) => [i.name, CATALOG[i.kind].name, i.w, i.d, CATALOG[i.kind].seats, +i.x.toFixed(2), +i.z.toFixed(2), i.rot])]} />
              <JsonButtons name="office-layout.json" data={s} onLoad={(d) => { if (d && Array.isArray(d.items) && d.room) set({ ...DEF, ...d, sel: '' }) }} />
            </>
          }
        >
          <Table
            head={['Item', 'Size', 'Seats', 'Position', 'Rot', '']}
            rows={s.items.map((i) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: i.id === s.sel ? 800 : 500, padding: '2px 4px' }} onClick={() => set({ sel: i.id, view: s.view === 'walk' ? 'persp' : s.view })}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i.color, marginRight: 6 }} />
                {i.name}
              </button>,
              `${num(i.w)} × ${num(i.d)} m`,
              CATALOG[i.kind].seats || '',
              `${num(i.x)}, ${num(i.z)}`,
              `${i.rot}°`,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id), sel: s.sel === i.id ? '' : s.sel })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
