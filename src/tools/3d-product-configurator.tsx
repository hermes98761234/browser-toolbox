import { useRef, useState } from 'react'
import { Btn, Check, CopyButton, FileDrop, Note, Panel, Row, Seg, shareLink, Split, Txt, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { luminance, MATS, normalize, partIds, PRODUCTS, spec, type MatKind, type PartCfg, type PartDef, type ProductId } from './lib/3d-product-configurator'

type Mk = (part: string) => THREE.Material

function rounded(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, part: string) => { const x = new THREE.Mesh(g, m); x.userData.part = part; return x }

function sneaker(mk: Mk): THREE.Group {
  const g = new THREE.Group()
  const foot = new THREE.Shape()
  foot.moveTo(-1.42, 0)
  foot.bezierCurveTo(-1.42, 0.46, -0.6, 0.44, 0.2, 0.52)
  foot.bezierCurveTo(1.0, 0.58, 1.6, 0.42, 1.6, 0)
  foot.bezierCurveTo(1.6, -0.42, 1.0, -0.58, 0.2, -0.52)
  foot.bezierCurveTo(-0.6, -0.44, -1.42, -0.46, -1.42, 0)
  const sole = (depth: number, bevel: number) => {
    const geo = new THREE.ExtrudeGeometry(foot, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 32 })
    geo.rotateX(-Math.PI / 2)
    return geo
  }
  const out = mesh(sole(0.06, 0.03), mk('outsole'), 'outsole')
  out.position.y = 0.03
  const mid = mesh(sole(0.16, 0.05), mk('midsole'), 'midsole')
  mid.position.y = 0.13
  mid.scale.set(0.985, 1, 0.97)
  const side = new THREE.Shape()
  side.moveTo(-1.3, 0.3)
  side.lineTo(-1.36, 0.95)
  side.quadraticCurveTo(-1.38, 1.24, -1.1, 1.22)
  side.lineTo(-0.55, 1.1)
  side.quadraticCurveTo(-0.3, 1.08, -0.1, 0.95)
  side.quadraticCurveTo(0.7, 0.62, 1.25, 0.55)
  side.quadraticCurveTo(1.5, 0.5, 1.46, 0.3)
  side.lineTo(-1.3, 0.3)
  const ug = new THREE.ExtrudeGeometry(side, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 8, curveSegments: 32 })
  ug.translate(0, 0, -0.36)
  // taper the toe and heel so the block reads as a shoe from above
  const pos = ug.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const k = x > 0.2 ? 1 - 0.32 * ((x - 0.2) / 1.3) ** 2 : x < -0.95 ? 1 - 0.18 * ((-0.95 - x) / 0.45) ** 2 : 1
    pos.setZ(i, pos.getZ(i) * k)
  }
  ug.computeVertexNormals()
  const upper = mesh(ug, mk('upper'), 'upper')
  const stripe = new THREE.Shape()
  stripe.moveTo(-1.1, 0.56)
  stripe.quadraticCurveTo(-0.3, 0.56, 0.36, 0.78)
  stripe.lineTo(0.44, 0.64)
  stripe.quadraticCurveTo(-0.2, 0.4, -1.1, 0.42)
  stripe.lineTo(-1.1, 0.56)
  for (const z of [1, -1]) {
    const sg = new THREE.ExtrudeGeometry(stripe, { depth: 0.02, bevelEnabled: false, curveSegments: 24 })
    const a = mesh(sg, mk('accent'), 'accent')
    a.position.z = z > 0 ? 0.503 : -0.523
    g.add(a)
  }
  const rim = mesh(new THREE.TorusGeometry(0.3, 0.07, 14, 48), mk('lining'), 'lining')
  rim.rotation.x = Math.PI / 2
  rim.scale.set(1.45, 1, 1)
  rim.position.set(-0.86, 1.2, 0)
  rim.rotation.y = 0.12
  const hole = mesh(new THREE.CircleGeometry(0.3, 40), mk('lining'), 'lining')
  hole.rotation.x = -Math.PI / 2
  hole.scale.set(1.45, 1, 1)
  hole.position.set(-0.86, 1.205, 0)
  const tab = mesh(new THREE.BoxGeometry(0.1, 0.34, 0.26), mk('heel'), 'heel')
  tab.position.set(-1.47, 1.02, 0)
  tab.rotation.z = -0.08
  g.add(out, mid, upper, rim, hole, tab)
  const curveY = (x: number) => { // top of the instep (matches the side profile)
    const t = (x + 0.1) / 1.35
    return (1 - t) ** 2 * 0.95 + 2 * (1 - t) * t * 0.62 + t * t * 0.55 + 0.12
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.25 + i * 0.17
    const lace = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 10), mk('laces'), 'laces')
    lace.rotation.x = Math.PI / 2
    lace.position.set(x, curveY(x) + 0.02, 0)
    g.add(lace)
  }
  return g
}

function chair(mk: Mk): THREE.Group {
  const g = new THREE.Group()
  const slab = (w: number, d: number, t: number, bevel: number, part: string) => {
    const geo = new THREE.ExtrudeGeometry(rounded(w, d, 0.18), { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 16 })
    geo.translate(0, 0, -t / 2)
    return mesh(geo, mk(part), part)
  }
  const seat = slab(1.6, 1.5, 0.08, 0.04, 'seat')
  seat.rotation.x = -Math.PI / 2
  seat.position.y = 1.0
  const cushion = slab(1.38, 1.28, 0.1, 0.08, 'cushion')
  cushion.rotation.x = -Math.PI / 2
  cushion.position.set(0, 1.16, 0.04)
  const back = slab(1.6, 1.0, 0.07, 0.04, 'back')
  back.position.set(0, 1.78, -0.78)
  back.rotation.x = -0.2
  g.add(seat, cushion, back)
  for (const [x, z] of [[-0.62, 0.56], [0.62, 0.56], [-0.62, -0.56], [0.62, -0.56]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.045, 0.03, 1.02, 16), mk('frame'), 'frame')
    leg.position.set(x * 1.06, 0.49, z * 1.06)
    leg.rotation.set(z * 0.18, 0, -x * 0.16)
    g.add(leg)
  }
  for (const x of [-0.6, 0.6]) {
    const post = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 12), mk('frame'), 'frame')
    post.position.set(x, 1.38, -0.7)
    post.rotation.x = -0.2
    g.add(post)
  }
  const rail = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 12), mk('frame'), 'frame')
  rail.rotation.z = Math.PI / 2
  rail.position.set(0, 0.35, 0.62)
  g.add(rail)
  return g
}

function labelTexture(bg: string, text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const x = c.getContext('2d')!
  x.fillStyle = bg
  x.fillRect(0, 0, 1024, 256)
  const fg = luminance(bg) > 0.35 ? '#1b1b1b' : '#f7f7f7'
  x.fillStyle = fg
  x.strokeStyle = fg
  x.lineWidth = 4
  x.strokeRect(300, 30, 424, 196)
  x.textAlign = 'center'
  x.font = 'bold 64px Georgia, serif'
  x.fillText(text.slice(0, 18) || ' ', 512, 128, 400)
  x.font = '26px sans-serif'
  x.fillText('SMALL BATCH · 500 ml', 512, 190)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function bottle(mk: Mk): THREE.Group {
  const g = new THREE.Group()
  const prof = [[0, 0], [0.5, 0], [0.6, 0.06], [0.62, 0.2], [0.62, 1.55], [0.58, 1.8], [0.34, 2.12], [0.22, 2.3], [0.22, 2.5], [0.2, 2.52]].map(([r, y]) => new THREE.Vector2(r, y))
  const body = mesh(new THREE.LatheGeometry(prof, 72), mk('body'), 'body')
  const liq = [[0, 0.05], [0.56, 0.05], [0.58, 0.2], [0.58, 1.45], [0, 1.45]].map(([r, y]) => new THREE.Vector2(r, y))
  const liquid = mesh(new THREE.LatheGeometry(liq, 64), mk('liquid'), 'liquid')
  const cap = mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.34, 48, 1), mk('cap'), 'cap')
  cap.position.y = 2.46
  const label = mesh(new THREE.CylinderGeometry(0.632, 0.632, 0.78, 96, 1, true), mk('label'), 'label')
  label.position.y = 0.88
  label.rotation.y = Math.PI
  g.add(liquid, body, label, cap)
  return g
}

const BUILD: Record<ProductId, (mk: Mk) => THREE.Group> = { sneaker, chair, bottle }

function shadowDisc(r: number): THREE.Mesh {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(0,0,0,0.38)')
  gr.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = gr
  x.fillRect(0, 0, 128, 128)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.002
  return m
}

interface S { product: ProductId | 'custom'; cfg: Partial<Record<ProductId, Record<string, PartCfg>>>; bg: string; label: string; spin: boolean }
const DEF: S = { product: 'sneaker', cfg: {}, bg: '#eef1f5', label: 'Meadow', spin: true }
const BGS = ['#eef1f5', '#ffffff', '#1d2230', '#f6e7d8', '#dfeee2']

export default function ProductConfigurator() {
  const [s, set, reset] = useToolState('3d-product-configurator', DEF)
  const [custom, setCustom] = useState<{ obj: THREE.Object3D; defs: PartDef[]; name: string; ver: number } | null>(null)
  const [customCfg, setCustomCfg] = useState<Record<string, PartCfg>>({})
  const [sel, setSel] = useState('')
  const [err, setErr] = useState('')
  const stage = useRef<Stage3D | null>(null)
  const holder = useRef(new THREE.Group())
  const mats = useRef(new Map<string, THREE.MeshPhysicalMaterial>())
  const labelTex = useRef<THREE.CanvasTexture | null>(null)

  const isCustom = s.product === 'custom' && !!custom
  const pid: ProductId = s.product === 'custom' ? 'sneaker' : s.product
  const defs = isCustom ? custom.defs : PRODUCTS[pid].parts
  const cfg = isCustom ? normalize(defs, customCfg) : normalize(defs, s.cfg[pid])
  const title = isCustom ? custom.name : PRODUCTS[pid].name
  const setPart = (id: string, p: Partial<PartCfg>) => {
    if (isCustom) setCustomCfg({ ...cfg, [id]: { ...cfg[id], ...p } })
    else set((x) => ({ ...x, cfg: { ...x.cfg, [pid]: { ...normalize(defs, x.cfg[pid]), [id]: { ...normalize(defs, x.cfg[pid])[id], ...p } } } }))
  }

  const modelKey = isCustom ? `custom${custom.ver}` : pid
  const ref = useStage3D(
    (st) => {
      stage.current = st
      const pm = new THREE.PMREMGenerator(st.renderer)
      st.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
      st.renderer.toneMapping = THREE.ACESFilmicToneMapping
      st.renderer.toneMappingExposure = 0.9
      st.scene.environmentIntensity = 0.65
      st.scene.add(holder.current)
      st.controls.minDistance = 2
      st.controls.maxDistance = 14
      st.controls.maxPolarAngle = Math.PI * 0.53
      // click (not drag) on a part selects it
      const el = st.renderer.domElement
      let down = [0, 0]
      const ray = new THREE.Raycaster()
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(holder.current.children, true).find((h) => h.object.userData.part)
        setSel(hit ? (hit.object.userData.part as string) : '')
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); pm.dispose() }
    },
    (st) => {
      // rebuild geometry when the product changes
      if (holder.current.userData.key !== modelKey) {
        st.clear(holder.current)
        mats.current.clear()
        const mk: Mk = (part) => {
          let m = mats.current.get(part)
          if (!m) { m = new THREE.MeshPhysicalMaterial(); mats.current.set(part, m) }
          return m
        }
        let obj: THREE.Object3D
        if (isCustom) {
          obj = custom.obj
          obj.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.userData.part) { const old = me.material as THREE.MeshStandardMaterial; const m = mk(me.userData.part) as THREE.MeshPhysicalMaterial; if (old.map) m.map = old.map; if (old.normalMap) m.normalMap = old.normalMap; me.material = m } })
        } else obj = BUILD[pid](mk)
        holder.current.add(obj)
        const box = new THREE.Box3().setFromObject(obj)
        const size = box.getSize(new THREE.Vector3())
        holder.current.add(shadowDisc(Math.max(size.x, size.z) * 0.75))
        st.controls.target.set(0, size.y * 0.42, 0)
        const d = Math.max(size.x, size.y, size.z)
        st.camera.position.set(d * 1.0, d * 0.75, d * 1.25)
        holder.current.userData.key = modelKey
      }
      for (const d of defs) {
        const m = mats.current.get(d.id)
        if (!m) continue
        const c = cfg[d.id]
        const p = MATS[c.mat][1]
        m.roughness = p.roughness
        m.metalness = p.metalness
        m.clearcoat = p.clearcoat
        m.clearcoatRoughness = 0.1
        m.sheen = p.sheen
        m.sheenColor.set(c.color).lerp(new THREE.Color('#ffffff'), 0.3)
        m.sheenRoughness = 0.6
        m.transmission = p.transmission
        m.thickness = p.transmission ? 0.4 : 0
        m.ior = 1.5
        m.side = p.transmission ? THREE.DoubleSide : THREE.FrontSide
        if (d.id === 'label' && !isCustom && pid === 'bottle') {
          labelTex.current?.dispose()
          labelTex.current = labelTexture(c.color, s.label)
          m.map = labelTex.current
          m.color.set('#ffffff')
        } else m.color.set(c.color)
        m.emissive.set(d.id === sel ? '#2a2a2a' : '#000000')
        m.needsUpdate = true
      }
      st.scene.background = new THREE.Color(s.bg)
      st.controls.autoRotate = s.spin
      st.controls.autoRotateSpeed = 1.2
    },
    [modelKey, JSON.stringify(cfg), s.bg, s.label, s.spin, sel],
    { camera: [4.4, 3.0, 5.2], target: [0, 0.8, 0], background: DEF.bg, grid: false },
  )

  const snapshot = () => {
    const st = stage.current
    if (!st) return
    const old = st.renderer.getPixelRatio()
    st.renderer.setPixelRatio(Math.max(2, old))
    st.renderer.render(st.scene, st.camera)
    const url = st.renderer.domElement.toDataURL('image/png')
    st.renderer.setPixelRatio(old)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\W+/g, '-')}-config.png`
    a.click()
  }

  const loadModel = async (f: File) => {
    setErr('')
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const buf = await f.arrayBuffer()
      const gltf = await new GLTFLoader().parseAsync(buf, '')
      const obj = gltf.scene
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3())
      const k = 3 / Math.max(size.x, size.y, size.z, 1e-6)
      obj.scale.setScalar(k)
      const c = box.getCenter(new THREE.Vector3())
      obj.position.set(-c.x * k, -box.min.y * k, -c.z * k)
      const byMat = new Map<THREE.Material, THREE.Mesh[]>()
      obj.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { const m = Array.isArray(me.material) ? me.material[0] : me.material; byMat.set(m, [...(byMat.get(m) ?? []), me]) } })
      if (!byMat.size) throw new Error('The file contains no meshes.')
      const entries = [...byMat.entries()].slice(0, 24)
      const ids = partIds(entries.map(([m, ms]) => m.name || ms[0].name))
      const defsC: PartDef[] = entries.map(([m, ms], i) => {
        ms.forEach((me) => (me.userData.part = ids[i]))
        const sm = m as THREE.MeshStandardMaterial
        const color = sm.color ? `#${sm.color.getHexString()}` : '#cccccc'
        const mat: MatKind = (sm.metalness ?? 0) > 0.5 ? 'metal' : (sm.roughness ?? 1) < 0.35 ? 'gloss' : 'satin'
        return { id: ids[i], name: ids[i], color, mat, mats: Object.keys(MATS) as MatKind[] }
      })
      setCustom({ obj, defs: defsC, name: f.name.replace(/\.(glb|gltf)$/i, ''), ver: Date.now() })
      setCustomCfg({})
      set({ product: 'custom' })
    } catch (e) {
      setErr(`Could not load model: ${e instanceof Error ? e.message : e}. Use a .glb or a self-contained .gltf (embedded buffers/textures); Draco-compressed files are not supported.`)
    }
  }

  const presets = isCustom ? {} : PRODUCTS[pid].presets
  const link = () => shareLink({ product: pid, cfg: { [pid]: cfg }, bg: s.bg, label: s.label, spin: s.spin })

  return (
    <Split wide="right">
      <div>
        <Panel title="Product">
          <Seg
            value={isCustom ? 'custom' : pid}
            onChange={(v) => { setSel(''); set({ product: v as S['product'] }) }}
            options={[['sneaker', '👟 Sneaker'], ['chair', '🪑 Chair'], ['bottle', '🍾 Bottle'], ...(custom ? [['custom', `📦 ${custom.name.slice(0, 14)}`] as const] : [])]}
          />
          <div style={{ marginTop: 10 }}>
            <FileDrop accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onFiles={([f]) => void loadModel(f)} label="Upload your own .glb / .gltf model" />
          </div>
          {err && <Note tone="err">{err}</Note>}
          {Object.keys(presets).length > 0 && (
            <>
              <h4 style={{ margin: '12px 0 6px' }}>Colourways</h4>
              <Row>
                {Object.entries(presets).map(([n, p]) => (
                  <button key={n} type="button" className="k-btn" onClick={() => set((x) => ({ ...x, cfg: { ...x.cfg, [pid]: Object.fromEntries(defs.map((d) => [d.id, { color: p[d.id], mat: cfg[d.id].mat }])) } }))}>
                    <span style={{ display: 'inline-flex', marginRight: 6 }}>{defs.slice(0, 4).map((d) => <i key={d.id} style={{ width: 10, height: 14, background: p[d.id], display: 'inline-block' }} />)}</span>
                    {n}
                  </button>
                ))}
              </Row>
            </>
          )}
          {pid === 'bottle' && !isCustom && <div style={{ marginTop: 10 }}><Txt label="Label text" value={s.label} onChange={(label) => set({ label })} /></div>}
        </Panel>
        <Panel title="Parts" actions={<Btn kind="ghost" onClick={() => (isCustom ? setCustomCfg({}) : set((x) => ({ ...x, cfg: { ...x.cfg, [pid]: {} } })))}>Defaults</Btn>}>
          <div style={{ display: 'grid', gap: 8 }}>
            {defs.map((d) => (
              <div key={d.id} onClick={() => setSel(d.id)} style={{ padding: 8, borderRadius: 10, border: `1px solid ${sel === d.id ? 'var(--accent)' : 'var(--line)'}`, background: sel === d.id ? 'var(--panel2)' : undefined }}>
                <Row wrap={false}>
                  <input type="color" value={cfg[d.id].color} onChange={(e) => setPart(d.id, { color: e.target.value })} aria-label={`${d.name} colour`} style={{ width: 40, height: 32, border: 0, background: 'none', padding: 0 }} />
                  <b style={{ flex: 1 }}>{d.name}</b>
                  <select className="k-select" style={{ maxWidth: 160 }} value={cfg[d.id].mat} onChange={(e) => setPart(d.id, { mat: e.target.value as MatKind })} aria-label={`${d.name} material`}>
                    {d.mats.map((m) => <option key={m} value={m}>{MATS[m][0]}</option>)}
                  </select>
                </Row>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Tip: click a part on the model to find it in this list.</p>
        </Panel>
      </div>

      <div>
        <Panel
          title={`${title} preview`}
          actions={
            <>
              <Btn kind="primary" onClick={snapshot}>⬇ PNG</Btn>
              {!isCustom && <CopyButton text={link} label="Share link" />}
              <CopyButton text={() => spec(title, defs, cfg)} label="Spec" />
            </>
          }
        >
          <View3D refEl={ref} height={520} />
          <Row>
            <Check label="Turntable" value={s.spin} onChange={(spin) => set({ spin })} />
            <span className="muted" style={{ fontSize: 13 }}>Background</span>
            {BGS.map((b) => (
              <button key={b} type="button" onClick={() => set({ bg: b })} aria-label={`Background ${b}`} style={{ width: 26, height: 26, borderRadius: 999, background: b, border: `2px solid ${s.bg === b ? 'var(--accent)' : 'var(--line)'}`, cursor: 'pointer' }} />
            ))}
            <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} aria-label="Custom background" style={{ width: 32, height: 28, border: 0, padding: 0, background: 'none' }} />
            <Btn kind="ghost" onClick={() => { reset(); setSel('') }}>Reset</Btn>
          </Row>
        </Panel>
        <Panel title="Configuration">
          <pre style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{spec(title, defs, cfg)}</pre>
        </Panel>
        <Note>
          Drag to orbit, scroll to zoom. The sample products are built procedurally from three.js primitives; the share link stores the product, colours and materials
          (uploaded models stay on your device and are not part of the link). PNG export renders at 2× resolution.
        </Note>
      </div>
    </Split>
  )
}
