import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, FileDrop, fmt, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const SAMPLES: Record<string, string> = {
  'ACME bolt': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 200">
  <path fill="#f59e0b" fill-rule="evenodd" d="M100 20 L170 60 L170 140 L100 180 L30 140 L30 60 Z M100 45 L52 72 L52 128 L100 155 L148 128 L148 72 Z"/>
  <path fill="#f59e0b" d="M110 58 L76 110 L97 110 L88 146 L126 90 L105 90 L116 58 Z"/>
  <path fill="#1e293b" fill-rule="evenodd" d="M200 140 L225 60 L245 60 L270 140 L252 140 L246 120 L224 120 L218 140 Z M229 104 L241 104 L235 82 Z"/>
  <path fill="#1e293b" d="M335 60 L295 60 L280 75 L280 125 L295 140 L335 140 L335 122 L300 122 L298 120 L298 80 L300 78 L335 78 Z"/>
  <path fill="#1e293b" d="M345 140 L345 60 L362 60 L377 95 L392 60 L409 60 L409 140 L392 140 L392 95 L380 122 L374 122 L362 95 L362 140 Z"/>
  <path fill="#1e293b" d="M420 60 L470 60 L470 76 L438 76 L438 92 L465 92 L465 108 L438 108 L438 124 L470 124 L470 140 L420 140 Z"/>
</svg>`,
  'Leaf café': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
  <path fill="#16a34a" d="M40 180 C 40 90 100 30 190 30 C 190 120 130 180 40 180 Z"/>
  <path fill="#f8fafc" d="M52 172 C 90 130 120 100 172 48 L 176 52 C 126 106 96 136 58 176 Z"/>
  <path fill="#78350f" d="M30 196 C 36 186 44 180 52 172 L 58 176 C 50 186 44 194 36 202 Z"/>
</svg>`,
  'Star badge': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path fill="#2563eb" fill-rule="evenodd" d="M100 6 A94 94 0 1 1 99.9 6 Z M100 24 A76 76 0 1 0 100.1 24 Z"/>
  <path fill="#e11d48" d="M100 38 L117 82 L164 84 L127 113 L140 158 L100 132 L60 158 L73 113 L36 84 L83 82 Z"/>
</svg>`,
}

type MatKey = 'svg' | 'steel' | 'gold' | 'chrome' | 'acrylic' | 'matte' | 'wood' | 'copper'
const MATS: [MatKey, string][] = [['svg', 'SVG colours (painted)'], ['steel', 'Brushed steel'], ['gold', 'Gold leaf'], ['chrome', 'Polished chrome'], ['copper', 'Copper'], ['acrylic', 'Gloss acrylic'], ['matte', 'Matte paint'], ['wood', 'Carved wood']]
const DENSITY: Record<MatKey, number> = { svg: 2.7, steel: 7.85, gold: 8.5, chrome: 7.85, copper: 8.96, acrylic: 1.19, matte: 2.7, wood: 0.6 }

const DEF = { sample: 'ACME bolt', svg: SAMPLES['ACME bolt'], width: 120, depth: 3, bevel: 0.4, bevelSeg: 3, face: 'svg' as MatKey, returns: 'same' as 'same' | 'black' | 'white' | 'steel', tint: '#e2e8f0', light: 'day' as 'day' | 'night' | 'halo', wall: 'brick' as 'brick' | 'concrete' | 'paint' | 'none', wallColor: '#e7e5e4', standoff: 2, panel: false, panelColor: '#0f172a', spin: false }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const brick = () =>
  canvasTex(512, 512, (g) => {
    g.fillStyle = '#d6d3d1'
    g.fillRect(0, 0, 512, 512)
    for (let r = 0; r < 16; r++)
      for (let k = -1; k < 5; k++) {
        const x = k * 128 + (r % 2 ? 64 : 0), y = r * 32
        const v = 140 + ((r * 37 + k * 91) % 40)
        g.fillStyle = `rgb(${v + 30},${v - 50},${v - 70})`
        g.fillRect(x + 3, y + 3, 122, 26)
      }
  })
const noise = (base: number) =>
  canvasTex(256, 256, (g) => {
    const d = g.createImageData(256, 256)
    for (let i = 0; i < d.data.length; i += 4) {
      const v = base + Math.random() * 26 - 13
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v
      d.data[i + 3] = 255
    }
    g.putImageData(d, 0, 0)
  })
const woodTex = () =>
  canvasTex(256, 256, (g) => {
    for (let y = 0; y < 256; y++) {
      const v = Math.sin(y * 0.25 + Math.sin(y * 0.03) * 4) * 0.5 + 0.5
      g.fillStyle = `rgb(${150 + v * 50},${95 + v * 35},${50 + v * 20})`
      g.fillRect(0, y, 256, 1)
    }
  })

function material(k: MatKey, svgColor: THREE.Color, tint: string, night: boolean): THREE.Material {
  const P = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o)
  let m: THREE.MeshPhysicalMaterial
  switch (k) {
    case 'steel': m = P({ color: '#c8ccd2', metalness: 1, roughness: 0.32 }); break
    case 'gold': m = P({ color: '#e0b04a', metalness: 1, roughness: 0.22 }); break
    case 'chrome': m = P({ color: '#ffffff', metalness: 1, roughness: 0.04 }); break
    case 'copper': m = P({ color: '#c8754a', metalness: 1, roughness: 0.3 }); break
    case 'acrylic': m = P({ color: tint, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }); break
    case 'matte': m = P({ color: tint, metalness: 0, roughness: 0.85 }); break
    case 'wood': m = P({ map: woodTex(), roughness: 0.7 }); break
    default: m = P({ color: svgColor, metalness: 0.05, roughness: 0.45, clearcoat: 0.4 })
  }
  if (night && (k === 'svg' || k === 'acrylic' || k === 'matte')) {
    m.emissive = k === 'svg' ? svgColor.clone() : new THREE.Color(tint)
    m.emissiveIntensity = 1.4
  }
  return m
}

export default function LogoSignPreview() {
  const [s, set, reset] = useToolState('logo-sign-preview', DEF)
  const [err, setErr] = useState('')
  const stage = useRef<Stage3D | null>(null)

  const parsed = useMemo(() => {
    try {
      const data = new SVGLoader().parse(s.svg)
      const items: { shapes: THREE.Shape[]; color: THREE.Color }[] = []
      let strokes = 0
      for (const p of data.paths) {
        const st = p.userData?.style as { fill?: string; stroke?: string } | undefined
        if (st?.fill === 'none' || st?.fill === 'transparent') {
          if (st?.stroke && st.stroke !== 'none') strokes++
          continue
        }
        const shapes = SVGLoader.createShapes(p)
        if (shapes.length) items.push({ shapes, color: p.color.clone() })
      }
      const box = new THREE.Box2()
      for (const it of items) for (const sh of it.shapes) for (const v of sh.getPoints(12)) box.expandByPoint(v)
      return { items, box, strokes, error: items.length ? '' : 'No filled paths found in this SVG (text must be converted to outlines/paths).' }
    } catch (e) {
      return { items: [], box: new THREE.Box2(), strokes: 0, error: `Could not parse SVG: ${(e as Error).message}` }
    }
  }, [s.svg])

  const size = parsed.box.isEmpty() ? new THREE.Vector2(1, 1) : parsed.box.getSize(new THREE.Vector2())
  const k = s.width / size.x // cm per SVG unit
  const heightCm = size.y * k
  const area = parsed.items.reduce((a, it) => a + it.shapes.reduce((b, sh) => b + Math.abs(THREE.ShapeUtils.area(sh.getPoints(12))) - sh.holes.reduce((c, h) => c + Math.abs(THREE.ShapeUtils.area(h.getPoints(12))), 0), 0), 0) * k * k
  const kg = (area * s.depth * DENSITY[s.face]) / 1000

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const pm = new THREE.PMREMGenerator(st.renderer)
      st.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
      st.renderer.toneMapping = THREE.ACESFilmicToneMapping
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
      st.onFrame((_, dt) => {
        const sign = root.getObjectByName('sign')
        if (sign && sign.userData.spin) sign.rotation.y += dt * 0.5
        else if (sign) sign.rotation.y *= 0.9
      })
      return () => pm.dispose()
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const U = 1 / 20 // scene units per cm (1 unit = 20 cm)
      const night = s.light !== 'day'
      st.scene.background = new THREE.Color(night ? '#05070d' : '#cbd5e1')
      st.scene.environmentIntensity = night ? 0.15 : 1
      st.scene.children.forEach((c) => {
        if (c instanceof THREE.HemisphereLight) c.intensity = night ? 0.08 : 1.1
        if (c instanceof THREE.DirectionalLight) c.intensity = night ? 0.05 : 1.6
      })
      const W = s.width * U, H = heightCm * U, D = s.depth * U
      const zFront = s.standoff * U + (s.panel ? 1.5 * U : 0)
      // wall
      if (s.wall !== 'none') {
        const tex = s.wall === 'brick' ? brick() : s.wall === 'concrete' ? noise(170) : null
        if (tex) {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping
          tex.repeat.set(s.wall === 'brick' ? 4 : 3, s.wall === 'brick' ? 3 : 2)
        }
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(W, H) * 3.2, Math.max(W, H) * 2.2), new THREE.MeshStandardMaterial({ color: s.wall === 'paint' ? s.wallColor : '#bdbdbd', map: tex, roughness: 0.95 }))
        wall.position.set(0, 0, 0)
        root.add(wall)
      }
      const sign = new THREE.Group()
      sign.name = 'sign'
      sign.userData.spin = s.spin
      root.add(sign)
      if (s.panel) {
        const pw = W * 1.12, ph = H * 1.3, r = Math.min(pw, ph) * 0.08
        const sh = new THREE.Shape()
        sh.moveTo(-pw / 2 + r, -ph / 2)
        sh.lineTo(pw / 2 - r, -ph / 2)
        sh.quadraticCurveTo(pw / 2, -ph / 2, pw / 2, -ph / 2 + r)
        sh.lineTo(pw / 2, ph / 2 - r)
        sh.quadraticCurveTo(pw / 2, ph / 2, pw / 2 - r, ph / 2)
        sh.lineTo(-pw / 2 + r, ph / 2)
        sh.quadraticCurveTo(-pw / 2, ph / 2, -pw / 2, ph / 2 - r)
        sh.lineTo(-pw / 2, -ph / 2 + r)
        sh.quadraticCurveTo(-pw / 2, -ph / 2, -pw / 2 + r, -ph / 2)
        const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.5 * U, bevelEnabled: true, bevelThickness: 0.2 * U, bevelSize: 0.2 * U, bevelSegments: 2 }), new THREE.MeshPhysicalMaterial({ color: s.panelColor, roughness: 0.25, clearcoat: 0.6 }))
        panel.position.z = s.standoff * U
        sign.add(panel)
      }
      if (!parsed.items.length) return
      const c = parsed.box.getCenter(new THREE.Vector2())
      const logo = new THREE.Group()
      logo.scale.set(k * U, -k * U, 1) // SVG y points down
      logo.position.set(-c.x * k * U, c.y * k * U, zFront)
      const ret = s.returns === 'black' ? new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 }) : s.returns === 'white' ? new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 }) : s.returns === 'steel' ? new THREE.MeshPhysicalMaterial({ color: '#c8ccd2', metalness: 1, roughness: 0.35 }) : null
      const bevelSvg = (s.bevel * U) / (k * U) // bevel in SVG units (x/y), depth stays in scene units on z
      for (const it of parsed.items) {
        const geo = new THREE.ExtrudeGeometry(it.shapes, { depth: D, bevelEnabled: s.bevel > 0, bevelThickness: s.bevel * U, bevelSize: Math.min(bevelSvg, 50), bevelSegments: s.bevelSeg, curveSegments: 16 })
        const face = material(s.face, it.color, s.tint, s.light === 'night')
        const mesh = new THREE.Mesh(geo, ret ? [face, ret] : face)
        logo.add(mesh)
      }
      sign.add(logo)
      if (s.light === 'halo') {
        // back-lit halo: blurred silhouette glowing on the wall behind the letters
        const R = 512, Hc = Math.max(64, Math.round((R * size.y) / size.x))
        const tex = canvasTex(R, Hc, (g) => {
          g.filter = 'blur(10px)'
          g.fillStyle = '#ffffff'
          const sx = (0.8 * R) / size.x, sy = (0.8 * Hc) / size.y
          const ox = 0.1 * R - parsed.box.min.x * sx, oy = 0.1 * Hc - parsed.box.min.y * sy
          for (const it of parsed.items)
            for (const sh of it.shapes) {
              g.beginPath()
              sh.getPoints(16).forEach((p, i) => (i ? g.lineTo(ox + p.x * sx, oy + p.y * sy) : g.moveTo(ox + p.x * sx, oy + p.y * sy)))
              g.fill()
            }
        })
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(W / 0.8, H / 0.8), new THREE.MeshBasicMaterial({ map: tex, color: s.tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
        glow.position.z = 0.002
        sign.add(glow)
        const pl = new THREE.PointLight(s.tint, 2.5, W * 2, 1.5)
        pl.position.set(0, 0, zFront * 0.5)
        sign.add(pl)
      }
      if (s.light === 'night' || s.light === 'halo') {
        const spot = new THREE.PointLight('#ffffff', s.light === 'night' ? 0.6 : 0.3, W * 3)
        spot.position.set(0, H, W)
        root.add(spot)
      }
    },
    [parsed, s.width, s.depth, s.bevel, s.bevelSeg, s.face, s.returns, s.tint, s.light, s.wall, s.wallColor, s.standoff, s.panel, s.panelColor, s.spin],
    { camera: [1.6, 0.5, 6.8], target: [0, 0, 0], grid: false, background: '#cbd5e1' },
  )

  const snap = () => stage.current?.renderer.domElement.toBlob((b) => {
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = 'logo-sign.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })

  return (
    <Split wide="right">
      <div>
        <Panel title="Logo" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Sample logo" value={s.sample} onChange={(sample) => set({ sample, svg: SAMPLES[sample] ?? s.svg })} options={[...Object.keys(SAMPLES), ...(SAMPLES[s.sample] ? [] : [s.sample])]} />
          <FileDrop
            accept=".svg,image/svg+xml"
            label="Drop your SVG logo (filled paths)"
            onFiles={async ([f]) => {
              const t = await f.text()
              if (!/<svg[\s>]/i.test(t)) return setErr('That file is not an SVG.')
              setErr('')
              set({ svg: t, sample: f.name })
            }}
          />
          {err && <Note tone="err">{err}</Note>}
          {parsed.error && <Note tone="err">{parsed.error}</Note>}
          {parsed.strokes > 0 && <Note tone="warn">{parsed.strokes} stroke-only path(s) ignored: convert strokes to outlines in your editor (Object → Path / Outline stroke).</Note>}
          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>Edit SVG source</summary>
            <Area value={s.svg} onChange={(svg) => set({ svg })} rows={8} mono />
          </details>
        </Panel>
        <Panel title="Fabrication">
          <Slider label="Sign width" value={s.width} min={20} max={400} step={5} unit=" cm" onChange={(width) => set({ width })} />
          <Slider label="Letter depth" value={s.depth} min={0.3} max={15} step={0.1} unit=" cm" onChange={(depth) => set({ depth })} />
          <Row>
            <Slider label="Bevel" value={s.bevel} min={0} max={1.5} step={0.05} unit=" cm" onChange={(bevel) => set({ bevel })} />
            <Slider label="Bevel smoothness" value={s.bevelSeg} min={1} max={8} onChange={(bevelSeg) => set({ bevelSeg })} />
          </Row>
          <Slider label="Stand-off from wall" value={s.standoff} min={0} max={10} step={0.5} unit=" cm" onChange={(standoff) => set({ standoff })} />
          <Check label="Mount on a backer panel" value={s.panel} onChange={(panel) => set({ panel })} />
          {s.panel && <label className="k-field"><span className="k-label">Panel colour</span><input type="color" value={s.panelColor} onChange={(e) => set({ panelColor: e.target.value })} /></label>}
        </Panel>
        <Panel title="Materials">
          <Select label="Face" value={s.face} onChange={(face) => set({ face })} options={MATS} />
          <Select label="Returns (sides)" value={s.returns} onChange={(returns) => set({ returns })} options={[['same', 'Same as face'], ['black', 'Black'], ['white', 'White'], ['steel', 'Brushed steel']]} />
          <label className="k-field"><span className="k-label">Acrylic / paint / light colour</span><input type="color" value={s.tint} onChange={(e) => set({ tint: e.target.value })} /></label>
          <Row>
            {MATS.slice(1, 5).map(([m, l]) => <Btn key={m} kind="ghost" onClick={() => set({ face: m, returns: 'same' })}>{l}</Btn>)}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Overall size" value={`${fmt(s.width, 4)} × ${fmt(heightCm, 4)} cm`} sub={`${fmt(s.depth + s.bevel * 2, 3)} cm deep`} />
          <Stat label="Face area" value={`${fmt(area / 10000, 3)} m²`} sub="for quoting paint / vinyl / LEDs" />
          <Stat label="Weight if solid" value={`${fmt(kg, 3)} kg`} sub={`${MATS.find((m) => m[0] === s.face)?.[1]} · ${DENSITY[s.face]} g/cm³`} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind={s.spin ? 'primary' : 'normal'} onClick={() => set({ spin: !s.spin })}>⟳ Turntable</Btn>
              <Btn onClick={snap}>⬇ PNG</Btn>
            </>
          }
        >
          <Row>
            <Seg value={s.light} onChange={(light) => set({ light })} options={[['day', '☀ Daylight'], ['night', '🌙 Face-lit'], ['halo', '✨ Halo-lit']]} />
            <Seg value={s.wall} onChange={(wall) => set({ wall })} options={[['brick', 'Brick'], ['concrete', 'Concrete'], ['paint', 'Painted'], ['none', 'No wall']]} />
            {s.wall === 'paint' && <input type="color" value={s.wallColor} onChange={(e) => set({ wallColor: e.target.value })} aria-label="Wall colour" />}
          </Row>
          <View3D refEl={ref} height={480} />
          <p className="muted">Drag to orbit, scroll to zoom. Halo-lit signs need a stand-off so light can spill onto the wall; face-lit signs use translucent acrylic faces.</p>
        </Panel>
      </div>
    </Split>
  )
}
