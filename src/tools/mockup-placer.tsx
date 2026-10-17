import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Select, Slider, Split, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'

type Product = 'mug' | 'box' | 'poster' | 'tshirt' | 'canvas'
interface State { product: Product; body: string; bg: string; scale: number; dx: number; dy: number; rot: number; wrap: number; allSides: boolean; frame: 'black' | 'white' | 'oak'; spin: boolean; res: number }
const DEF: State = { product: 'mug', body: '#f8fafc', bg: '#e2e8f0', scale: 0.85, dx: 0, dy: 0, rot: 0, wrap: 200, allSides: false, frame: 'black', spin: false, res: 2 }

const PRODUCTS: [Product, string][] = [['mug', '☕ Mug'], ['tshirt', '👕 T-shirt'], ['box', '📦 Box'], ['poster', '🖼 Framed poster'], ['canvas', '🎨 Canvas print']]
const BODY_PRESETS = ['#f8fafc', '#111827', '#1e3a8a', '#b91c1c', '#15803d', '#c8a26b', '#f472b6']
const BG_PRESETS = ['#e2e8f0', '#ffffff', '#fde68a', '#0f172a', '#d1fae5', '#fbcfe8']
const FRAME = { black: '#111111', white: '#f5f5f5', oak: '#b08150' }

/** Default artwork so the first screen shows something. */
function sampleArt(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 800
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 800, 800)
  grd.addColorStop(0, '#f97316')
  grd.addColorStop(1, '#db2777')
  g.fillStyle = grd
  g.beginPath(); g.arc(400, 360, 260, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#fff7ed'
  for (let i = 0; i < 9; i++) { g.fillRect(140 + i * 60, 420 - (i % 2) * 6, 34, 140) }
  g.fillStyle = '#7c2d12'
  g.beginPath(); g.moveTo(140, 560); g.lineTo(660, 560); g.lineTo(400, 320); g.fill()
  g.fillStyle = '#1f2937'
  g.font = 'bold 86px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('SUNRISE', 400, 715)
  g.font = '600 40px system-ui, sans-serif'
  g.fillText('coffee roasters · est. 2024', 400, 770)
  return c
}

/** Print area aspect (width / height) per product. */
function printAspect(s: State, img: CanvasImageSource & { width: number; height: number }): number {
  if (s.product === 'mug') return ((s.wrap / 360) * 2 * Math.PI * 0.42) / 0.78
  if (s.product === 'box') return 1.4 / 1
  if (s.product === 'tshirt') return 0.8
  return img.width / img.height // poster / canvas follow the artwork
}

function compose(s: State, img: CanvasImageSource & { width: number; height: number }, aspect: number): THREE.CanvasTexture {
  const H = 1024, W = Math.round(Math.min(4096, H * aspect))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  if (s.product === 'poster' || s.product === 'canvas') {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
  }
  const fit = Math.min(W / img.width, H / img.height) * s.scale
  g.translate(W / 2 + s.dx * W * 0.5, H / 2 - s.dy * H * 0.5)
  g.rotate((s.rot * Math.PI) / 180)
  g.drawImage(img, (-img.width * fit) / 2, (-img.height * fit) / 2, img.width * fit, img.height * fit)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function shadowBlob(r: number): THREE.Mesh {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.45)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.002
  return m
}

function build(st: Stage3D, s: State, img: CanvasImageSource & { width: number; height: number }, g: THREE.Group) {
  st.clear(g)
  st.scene.background = new THREE.Color(s.bg)
  const tex = compose(s, img, printAspect(s, img))
  const body = new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.35, metalness: 0.02 })
  const print = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: s.bg, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  g.add(floor)

  if (s.product === 'mug') {
    const r = 0.42, h = 0.95
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, h, 96, 1, true), body)
    wall.position.y = h / 2
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.9, h, 96, 1, true), new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.3, side: THREE.BackSide }))
    inner.position.y = h / 2 + 0.01
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.965, r * 0.035, 12, 96), body)
    rim.rotation.x = Math.PI / 2
    rim.position.y = h
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 64), body)
    bottom.rotation.x = -Math.PI / 2
    bottom.position.y = 0.06
    const arc = (s.wrap * Math.PI) / 180
    const label = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.004, r * 0.974, 0.78, 96, 1, true, -arc / 2, arc), print)
    label.position.y = h / 2
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 20, 48, Math.PI * 1.25), body)
    handle.rotation.z = -Math.PI * 0.625 // C-shape centred on +x, open towards the mug wall
    handle.position.set(r + 0.08, h * 0.52, 0)
    g.add(wall, inner, rim, bottom, label, handle, shadowBlob(0.9))
  } else if (s.product === 'box') {
    const w = 1.4, h = 1, d = 0.9
    const card = new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.85 })
    const front = new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.8 })
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [card, card, card, card, front, card])
    box.position.y = h / 2
    const decal = (rotY: number, z: number, x: number, width: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), print)
      m.position.set(x, h / 2, z)
      m.rotation.y = rotY
      return m
    }
    g.add(box, decal(0, d / 2 + 0.002, 0, w))
    if (s.allSides) g.add(decal(Math.PI, -d / 2 - 0.002, 0, w), decal(Math.PI / 2, 0, w / 2 + 0.002, d), decal(-Math.PI / 2, 0, -w / 2 - 0.002, d))
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.004, d + 0.004), new THREE.MeshStandardMaterial({ color: '#d6c08f', roughness: 0.5 }))
    tape.position.y = h + 0.002
    g.add(tape, shadowBlob(1.3))
  } else if (s.product === 'poster' || s.product === 'canvas') {
    const a = img.width / img.height
    const H = a >= 1 ? 1.3 / a : 1.3, W = H * a
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: s.bg, roughness: 0.95 }))
    wall.position.set(0, 2, -0.06)
    g.add(wall)
    const y = 1.3
    if (s.product === 'poster') {
      const fm = new THREE.MeshStandardMaterial({ color: FRAME[s.frame], roughness: 0.45 })
      const t = 0.06, depth = 0.05
      for (const [px, py, sw, sh] of [[0, H / 2 + t / 2, W + 2 * t, t], [0, -H / 2 - t / 2, W + 2 * t, t], [W / 2 + t / 2, 0, t, H], [-W / 2 - t / 2, 0, t, H]] as const) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, depth), fm)
        bar.position.set(px, y + py, 0)
        g.add(bar)
      }
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.9 }))
      mat.position.set(0, y, -0.01)
      const art = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.86), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
      art.position.set(0, y, 0)
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.2 }))
      glass.position.set(0, y, 0.02)
      g.add(mat, art, glass)
    } else {
      const sides = new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.9 })
      const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })
      const cv = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), [sides, sides, sides, sides, front, sides])
      cv.position.set(0, y, 0)
      g.add(cv)
    }
  } else {
    // t-shirt-ish: extruded outline + chest print
    const sh = new THREE.Shape()
    const P: [number, number][] = [[-0.45, -0.75], [0.45, -0.75], [0.45, 0.25], [0.55, 0.12], [0.8, 0.33], [0.55, 0.62], [0.2, 0.72], [0.1, 0.62], [-0.1, 0.62], [-0.2, 0.72], [-0.55, 0.62], [-0.8, 0.33], [-0.55, 0.12], [-0.45, 0.25]]
    sh.moveTo(...P[0])
    for (let i = 1; i < P.length; i++) {
      if (i === 8) sh.quadraticCurveTo(0, 0.52, -0.1, 0.62)
      else sh.lineTo(...P[i])
    }
    sh.closePath()
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 6, curveSegments: 16 })
    const fabric = new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.95 })
    const tee = new THREE.Mesh(geo, fabric)
    tee.position.set(0, 1.0, -0.06)
    const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.7), print)
    chest.position.set(0, 1.08, 0.115)
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 32, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.8, roughness: 0.3 }))
    hanger.position.set(0, 1.86, 0)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: s.bg, roughness: 0.95 }))
    wall.position.set(0, 2, -0.2)
    g.add(tee, chest, hanger, wall)
  }
}

export default function MockupPlacer() {
  const [s, set, reset] = useToolState('mockup-placer', DEF)
  const [img, setImg] = useState<HTMLCanvasElement | HTMLImageElement>(() => sampleArt())
  const [name, setName] = useState('sample artwork')
  const stage = useRef<Stage3D | null>(null)
  const group = useRef<THREE.Group | null>(null)
  const spin = useRef(s.spin)
  useEffect(() => { spin.current = s.spin }, [s.spin])

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const gr = new THREE.Group()
      st.scene.add(gr)
      group.current = gr
      st.scene.children.filter((c) => c instanceof THREE.GridHelper).forEach((c) => (c.visible = false))
      st.controls.minDistance = 1
      st.controls.maxDistance = 8
      st.controls.maxPolarAngle = Math.PI / 2 - 0.02
      st.onFrame((_, dt) => { if (spin.current && group.current) group.current.rotation.y += dt * 0.6 })
    },
    (st) => {
      if (!group.current) return
      group.current.rotation.y = 0
      build(st, s, img, group.current)
      const flat = s.product === 'poster' || s.product === 'canvas' || s.product === 'tshirt'
      st.controls.target.set(0, flat ? 1.2 : 0.5, 0)
    },
    [s, img],
    { camera: [1.2, 1.5, 2.6], target: [0, 0.5, 0] },
  )

  const exportPng = () => {
    const st = stage.current
    if (!st) return
    const pr = st.renderer.getPixelRatio()
    st.renderer.setPixelRatio(pr * s.res)
    const w = st.renderer.domElement.clientWidth, h = st.renderer.domElement.clientHeight
    st.renderer.setSize(w, h, false)
    st.renderer.render(st.scene, st.camera)
    const url = st.renderer.domElement.toDataURL('image/png')
    st.renderer.setPixelRatio(pr)
    st.renderer.setSize(w, h, false)
    const a = document.createElement('a')
    a.href = url
    a.download = `mockup-${s.product}.png`
    a.click()
  }
  const view = (p: [number, number, number], t: [number, number, number]) => {
    const st = stage.current
    if (!st) return
    st.camera.position.set(...p)
    st.controls.target.set(...t)
  }
  const flat = s.product === 'poster' || s.product === 'canvas' || s.product === 'tshirt'

  return (
    <Split wide="right">
      <div>
        <Panel title="Your design" actions={<Btn kind="ghost" onClick={() => { setImg(sampleArt()); setName('sample artwork') }}>Sample</Btn>}>
          <FileDrop accept="image/*" label="Drop a PNG / JPG / SVG design" onFiles={([f]) => {
            const url = URL.createObjectURL(f)
            const im = new Image()
            im.onload = () => { setImg(im); setName(f.name) }
            im.src = url
          }} />
          <p className="muted" style={{ fontSize: 13 }}>Using: <b>{name}</b> ({img.width} × {img.height}). Transparent PNGs show the product colour through.</p>
        </Panel>
        <Panel title="Product">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRODUCTS.map(([p, l]) => <Btn key={p} kind={s.product === p ? 'primary' : 'normal'} onClick={() => set({ product: p })}>{l}</Btn>)}
          </div>
          {s.product !== 'poster' && s.product !== 'canvas' && (
            <>
              <p className="k-label" style={{ margin: '10px 0 4px' }}>Product colour</p>
              <Row>
                {BODY_PRESETS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => set({ body: c })} style={{ width: 28, height: 28, borderRadius: 14, background: c, border: s.body === c ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />)}
                <input type="color" value={s.body} onChange={(e) => set({ body: e.target.value })} aria-label="Custom product colour" />
              </Row>
            </>
          )}
          {s.product === 'mug' && <Slider label="Print wrap" value={s.wrap} min={60} max={330} step={5} unit="°" onChange={(wrap) => set({ wrap })} />}
          {s.product === 'box' && <Check label="Print on all four sides" value={s.allSides} onChange={(allSides) => set({ allSides })} />}
          {s.product === 'poster' && <Select label="Frame" value={s.frame} onChange={(frame) => set({ frame })} options={[['black', 'Black'], ['white', 'White'], ['oak', 'Oak']]} />}
        </Panel>
        <Panel title="Placement" actions={<Btn kind="ghost" onClick={() => set({ scale: DEF.scale, dx: 0, dy: 0, rot: 0 })}>Centre</Btn>}>
          <Slider label="Size" value={s.scale} min={0.1} max={2} step={0.01} onChange={(scale) => set({ scale })} show={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Horizontal" value={s.dx} min={-1} max={1} step={0.01} onChange={(dx) => set({ dx })} />
          <Slider label="Vertical" value={s.dy} min={-1} max={1} step={0.01} onChange={(dy) => set({ dy })} />
          <Slider label="Rotation" value={s.rot} min={-180} max={180} unit="°" onChange={(rot) => set({ rot })} />
        </Panel>
        <Panel title="Scene">
          <p className="k-label" style={{ margin: '0 0 4px' }}>Background</p>
          <Row>
            {BG_PRESETS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => set({ bg: c })} style={{ width: 28, height: 28, borderRadius: 6, background: c, border: s.bg === c ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />)}
            <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} aria-label="Custom background" />
          </Row>
          <Check label="Turntable (auto-rotate)" value={s.spin} onChange={(spin) => set({ spin })} />
          <p><Btn kind="ghost" onClick={reset}>Reset everything</Btn></p>
        </Panel>
      </div>
      <div>
        <Panel title="Mockup" actions={<>
          <Btn kind="ghost" onClick={() => view(flat ? [0, 1.25, 3] : [0, 0.7, 2.6], flat ? [0, 1.2, 0] : [0, 0.5, 0])}>Front</Btn>
          <Btn kind="ghost" onClick={() => view(flat ? [1.8, 1.6, 2.4] : [1.6, 1.6, 2.2], flat ? [0, 1.2, 0] : [0, 0.5, 0])}>3/4</Btn>
        </>}>
          <View3D refEl={ref} height={520} />
          <Row>
            <Select label="Export size" value={s.res} onChange={(res) => set({ res })} options={[[1, '1× (screen)'], [2, '2×'], [3, '3× (print)']]} />
            <div style={{ alignSelf: 'flex-end' }}><Btn kind="primary" onClick={exportPng}>⬇ Download PNG</Btn></div>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit, scroll to zoom, right-drag to pan. Export renders the current view at the chosen multiple of the on-screen size.</p>
        </Panel>
        <Note>Models are simple procedural shapes built in your browser (no photo templates), good for quick previews and social posts rather than photoreal catalogue shots. Your image never leaves the device.</Note>
      </div>
    </Split>
  )
}
