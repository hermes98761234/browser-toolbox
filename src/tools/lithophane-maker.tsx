import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { buildMesh, meshVolume, thickness, toGray, transmit, type LithoOpts } from './lib/lithophane-maker'
import { toBinaryStl } from './lib/stl-viewer'

interface State extends LithoOpts {
  res: number
  contrast: number
  brightness: number
  gamma: number
  invert: boolean
}
const DEF: State = { width: 100, minT: 0.8, maxT: 3.2, border: 3, mode: 'flat', angle: 120, res: 0.4, contrast: 1, brightness: 0, gamma: 1, invert: false }

/** Original procedural sample scene (no external image needed). */
function sampleImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 340
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 340)
  sky.addColorStop(0, '#1e293b')
  sky.addColorStop(0.55, '#f8d39c')
  sky.addColorStop(1, '#fff7e8')
  g.fillStyle = sky
  g.fillRect(0, 0, 480, 340)
  g.fillStyle = '#fffbe8'
  g.beginPath()
  g.arc(330, 170, 46, 0, Math.PI * 2)
  g.fill()
  const ridge = (base: number, amp: number, col: string, seed: number) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 340)
    for (let x = 0; x <= 480; x += 6) g.lineTo(x, base - amp * (0.6 * Math.sin(x / 47 + seed) + 0.4 * Math.sin(x / 19 + seed * 2)))
    g.lineTo(480, 340)
    g.fill()
  }
  ridge(225, 38, '#6b7280', 1)
  ridge(262, 26, '#374151', 3)
  ridge(300, 16, '#111827', 5)
  g.fillStyle = '#0b0f19'
  for (const [x, h] of [[70, 120], [104, 90], [410, 105]] as const) {
    g.fillRect(x - 3, 300 - h * 0.3, 6, h * 0.3)
    g.beginPath()
    g.moveTo(x, 300 - h)
    g.lineTo(x - h * 0.22, 300 - h * 0.25)
    g.lineTo(x + h * 0.22, 300 - h * 0.25)
    g.fill()
  }
  g.fillStyle = '#e2e8f0'
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 480, (i * 53) % 110, 2, 2)
  return c
}

export default function LithophaneMaker() {
  const [s, set, reset] = useToolState('lithophane-maker', DEF)
  const [img, setImg] = useState<CanvasImageSource & { width: number; height: number }>(() => sampleImage())
  const [name, setName] = useState('sample scene')
  const backRef = useRef<HTMLCanvasElement>(null)

  const onFiles = ([f]: File[]) => {
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setName(f.name)
    }
    im.src = URL.createObjectURL(f)
  }

  const grid = useMemo(() => {
    if (!img) return null
    const cols = Math.max(8, Math.min(600, Math.round(s.width / Math.max(0.1, s.res)) + 1))
    const rows = Math.max(8, Math.round((cols * img.height) / img.width))
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, cols, rows)
    const gray = toGray(g.getImageData(0, 0, cols, rows).data, cols * rows, s)
    return thickness(gray, cols, rows, s)
  }, [img, s])

  const mesh = useMemo(() => (grid ? buildMesh(grid.t, grid.cols, grid.rows, s) : null), [grid, s])
  const H = grid ? (s.width * (grid.rows - 1)) / (grid.cols - 1) : 0
  const vol = mesh ? meshVolume(mesh) : 0

  // backlit simulation
  useEffect(() => {
    const cv = backRef.current
    if (!cv || !grid) return
    cv.width = grid.cols
    cv.height = grid.rows
    const g = cv.getContext('2d')!
    const id = g.createImageData(grid.cols, grid.rows)
    for (let i = 0; i < grid.t.length; i++) {
      const L = transmit(grid.t[i], s.minT)
      id.data[i * 4] = 255 * Math.min(1, L * 1.05)
      id.data[i * 4 + 1] = 235 * L
      id.data[i * 4 + 2] = 190 * L
      id.data[i * 4 + 3] = 255
    }
    g.putImageData(id, 0, 0)
  }, [grid, s.minT])

  const ref = useStage3D(
    () => {},
    (st) => {
      let grp = st.scene.getObjectByName('litho') as THREE.Group | undefined
      if (!grp) {
        grp = new THREE.Group()
        grp.name = 'litho'
        st.scene.add(grp)
      }
      st.clear(grp)
      if (!mesh) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(mesh, 3))
      geo.computeVertexNormals()
      geo.computeBoundingBox()
      const bb = geo.boundingBox!
      const k = 6 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, flatShading: false }))
      m.scale.setScalar(k)
      m.position.set(-((bb.max.x + bb.min.x) / 2) * k, -((bb.max.y + bb.min.y) / 2) * k, -((bb.max.z + bb.min.z) / 2) * k)
      grp.add(m)
    },
    [mesh],
    { camera: [2.5, 1.2, 7], background: '#1f2937', grid: false },
  )

  const exportStl = () => {
    if (!mesh) return
    download(`lithophane-${s.mode}.stl`, new Blob([toBinaryStl(mesh, 'lithophane')], { type: 'model/stl' }))
  }

  const tris = mesh ? mesh.length / 9 : 0
  return (
    <Split>
      <div>
        <Panel title="Photo" actions={<Btn kind="ghost" onClick={() => { reset(); setImg(sampleImage()); setName('sample scene') }}>Reset</Btn>}>
          <FileDrop accept="image/*" onFiles={onFiles} label="Drop a photo (JPG/PNG/WebP) or click to choose" />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Using: <b>{name}</b> — processed locally, never uploaded.</p>
        </Panel>
        <Panel title="Shape">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['flat', 'Flat panel'], ['curved', 'Curved (cylindrical)']]} />
          <Row>
            <Num label={s.mode === 'curved' ? 'Arc length' : 'Width'} value={s.width} onChange={(width) => set({ width })} unit="mm" min={10} max={400} />
            <Num label="Frame" value={s.border} onChange={(border) => set({ border })} unit="mm" min={0} max={20} />
            <Num label="Thinnest (white)" value={s.minT} onChange={(minT) => set({ minT })} unit="mm" min={0.3} max={5} />
            <Num label="Thickest (black)" value={s.maxT} onChange={(maxT) => set({ maxT })} unit="mm" min={0.5} max={10} />
          </Row>
          {s.mode === 'curved' && <Slider label="Arc angle" value={s.angle} onChange={(angle) => set({ angle })} min={20} max={300} step={5} unit="°" />}
          <Slider label="Detail (mm per sample)" value={s.res} onChange={(res) => set({ res })} min={0.2} max={1.5} step={0.05} show={(v) => v.toFixed(2)} unit=" mm" />
          {s.maxT <= s.minT && <Note tone="err">The thickest value must be larger than the thinnest.</Note>}
        </Panel>
        <Panel title="Image adjustments">
          <Slider label="Contrast" value={s.contrast} onChange={(contrast) => set({ contrast })} min={0.3} max={2.5} step={0.05} />
          <Slider label="Brightness" value={s.brightness} onChange={(brightness) => set({ brightness })} min={-0.5} max={0.5} step={0.01} />
          <Slider label="Gamma" value={s.gamma} onChange={(gamma) => set({ gamma })} min={0.4} max={2.5} step={0.05} />
          <Check label="Invert (negative relief)" value={s.invert} onChange={(invert) => set({ invert })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size" value={`${num(s.mode === 'curved' ? (2 * (s.width / ((s.angle * Math.PI) / 180))) * Math.sin(Math.min(Math.PI, (s.angle * Math.PI) / 360)) : s.width, 1)} × ${num(H, 1)} mm`} sub={s.mode === 'curved' ? `radius ${num(s.width / ((s.angle * Math.PI) / 180), 1)} mm` : `${num(s.maxT, 1)} mm deep`} />
          <Stat label="Triangles" value={num(tris, 0)} sub={`STL ≈ ${num((84 + tris * 50) / 1048576, 1)} MB`} />
          <Stat label="Material" value={`${num(vol / 1000, 1)} cm³`} sub={`≈ ${num((vol / 1000) * 1.24, 0)} g PLA`} />
        </Stats>
        <Panel title="3D model" actions={<Btn kind="primary" onClick={exportStl} disabled={!mesh || s.maxT <= s.minT}>⬇ Download STL</Btn>}>
          <View3D refEl={ref} height={360} />
        </Panel>
        <Panel title="Backlit preview (simulated)">
          <div style={{ background: '#111', borderRadius: 10, padding: 10, display: 'grid', placeItems: 'center' }}>
            <canvas ref={backRef} style={{ width: '100%', maxWidth: 400, borderRadius: 4 }} />
          </div>
          <Note>
            Print it standing upright in white PLA at 100 % infill and a 0.1–0.12 mm layer height for the smoothest tones. Light passes through the thin (white) areas; the thick areas stay dark.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
