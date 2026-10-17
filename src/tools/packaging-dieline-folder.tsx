import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { bbox, buildDieline, cutFold, dielineSvg, easeFold, polyArea, validate, type Panel as DPanel, type Params, type Style } from './lib/packaging-dieline-folder'

const DEF = { style: 'rte' as Style, W: 60, D: 40, H: 110, glue: 14, tuck: 16, dust: 24, brand: 'LEAFWELL', product: 'Herbal Tea · 20 bags', c1: '#0f766e', c2: '#fbbf24', guides: true, board: 0.45, gsm: 300 }

const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Tea box', { style: 'rte', W: 60, D: 40, H: 110 }],
  ['Cosmetics', { style: 'rte', W: 45, D: 45, H: 140 }],
  ['Mailer cube', { style: 'ste', W: 100, D: 100, H: 100, tuck: 20, dust: 40 }],
  ['Pill box', { style: 'ste', W: 70, D: 22, H: 95, tuck: 12, dust: 11 }],
  ['Sleeve', { style: 'sleeve', W: 120, D: 30, H: 80 }],
]

const PX = 4 // texture pixels per mm

function artwork(panels: DPanel[], s: typeof DEF, img: HTMLImageElement | null): HTMLCanvasElement {
  const b = bbox(panels)
  const k = Math.min(PX, 2048 / Math.max(b.w, b.h))
  const c = document.createElement('canvas')
  c.width = Math.ceil(b.w * k)
  c.height = Math.ceil(b.h * k)
  const g = c.getContext('2d')!
  const X = (x: number) => (x - b.x0) * k, Y = (y: number) => (b.y1 - y) * k
  const path = (p: DPanel) => {
    g.beginPath()
    p.poly.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))))
    g.closePath()
  }
  g.fillStyle = '#f8fafc'
  g.fillRect(0, 0, c.width, c.height)
  if (img) {
    g.drawImage(img, 0, 0, c.width, c.height)
  } else {
    for (const p of panels) {
      path(p)
      g.fillStyle = p.layer < 0 || p.id.startsWith('tuck') ? '#e2e8f0' : s.c1
      g.fill()
    }
    const at = (id: string) => panels.find((p) => p.id === id)
    const center = (p: DPanel) => [X(p.poly.reduce((a, v) => a + v[0], 0) / p.poly.length), Y(p.poly.reduce((a, v) => a + v[1], 0) / p.poly.length)]
    const text = (str: string, x: number, y: number, size: number, color: string, rot = 0, weight = 800) => {
      g.save()
      g.translate(x, y)
      g.rotate(rot)
      g.fillStyle = color
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `${weight} ${size * k}px system-ui, sans-serif`
      g.fillText(str, 0, 0)
      g.restore()
    }
    const fit = (str: string, wmm: number, max: number) => Math.min(max, (wmm / Math.max(1, str.length)) * 1.3)
    for (const id of ['front', 'back']) {
      const p = at(id)
      if (!p) continue
      const [cx, cy] = center(p)
      g.fillStyle = s.c2
      g.fillRect(X(p.poly[0][0]), cy - s.H * 0.12 * k, s.W * k, s.H * 0.24 * k)
      text(s.brand, cx, cy, fit(s.brand, s.W * 0.9, s.H * 0.13), s.c1)
      text(s.product, cx, cy + s.H * 0.24 * k, fit(s.product, s.W * 0.95, s.H * 0.06), '#fff', 0, 600)
      if (id === 'back') text('Ingredients · recycle me', cx, Y(s.H * 0.12), Math.min(4, s.W / 14), '#fff', 0, 500)
    }
    for (const id of ['side1', 'side2']) {
      const p = at(id)
      if (!p) continue
      const [cx, cy] = center(p)
      text(s.brand, cx, cy, fit(s.brand, s.H * 0.8, s.D * 0.4), s.c2, -Math.PI / 2)
      if (id === 'side2') for (let i = 0; i < 26; i++) {
        g.fillStyle = '#fff'
        g.fillRect(X(p.poly[0][0] + s.D * 0.2) + i * s.D * 0.023 * k, Y(s.H * 0.16), (i % 3 === 0 ? 0.8 : 0.4) * k, s.H * 0.08 * k)
      }
    }
    for (const id of ['closeTop', 'closeBottom']) {
      const p = at(id)
      if (!p) continue
      const [cx, cy] = center(p)
      text(s.brand, cx, cy, fit(s.brand, s.W * 0.8, s.D * 0.35), s.c2, id === 'closeTop' ? Math.PI : 0)
    }
  }
  if (s.guides) {
    const { cut, fold } = cutFold(panels)
    g.lineWidth = Math.max(1, k * 0.35)
    g.strokeStyle = 'rgba(37,99,235,0.85)'
    g.setLineDash([3 * k, 2 * k])
    for (const [a, b2, c2, d] of fold) {
      g.beginPath()
      g.moveTo(X(a), Y(b2))
      g.lineTo(X(c2), Y(d))
      g.stroke()
    }
    g.setLineDash([])
    g.strokeStyle = 'rgba(225,29,72,0.9)'
    for (const [a, b2, c2, d] of cut) {
      g.beginPath()
      g.moveTo(X(a), Y(b2))
      g.lineTo(X(c2), Y(d))
      g.stroke()
    }
  }
  return c
}

export default function PackagingDielineFolder() {
  const [s, set, reset] = useToolState('packaging-dieline-folder', DEF)
  const [fold, setFold] = useState(0.7)
  const [playing, setPlaying] = useState(false)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const foldRef = useRef(fold)
  const params: Params = useMemo(() => ({ style: s.style, W: s.W, D: s.D, H: s.H, glue: s.glue, tuck: s.tuck, dust: s.dust }), [s.style, s.W, s.D, s.H, s.glue, s.tuck, s.dust])
  const errors = validate(params)
  const panels = useMemo(() => (validate(params).length ? [] : buildDieline(params)), [params])
  const tex = useMemo(() => (panels.length ? artwork(panels, s, img) : null), [panels, s, img])
  const b = panels.length ? bbox(panels) : null
  const area = panels.reduce((a, p) => a + polyArea(p.poly), 0)

  useEffect(() => {
    foldRef.current = fold
  }, [fold])
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now(), dir = foldRef.current >= 0.999 ? -1 : 1
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      let f = foldRef.current + dir * dt * 0.35
      if (f >= 1 || f <= 0) {
        f = Math.max(0, Math.min(1, f))
        dir = -dir
      }
      foldRef.current = f
      setFold(f)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'box'
      st.scene.add(root)
      st.onFrame(() => {
        const groups = root.userData.groups as { g: THREE.Group; p: DPanel }[] | undefined
        if (!groups) return
        const t = foldRef.current
        for (const { g, p } of groups) {
          const a = (easeFold(t, p.phase) * p.angle * Math.PI) / 180
          g.rotation.set(0, 0, 0)
          if (p.dir === 'right') g.rotation.y = a
          else if (p.dir === 'left') g.rotation.y = -a
          else if (p.dir === 'up') g.rotation.x = -a
          else g.rotation.x = a
        }
        const fc = root.userData.flatC as [number, number, number], bc = root.userData.boxC as [number, number, number], sc = root.userData.sc as number
        const e = easeFold(t, [0, 0.5])
        root.position.set(-(fc[0] + (bc[0] - fc[0]) * e) * sc, -(fc[1] + (bc[1] - fc[1]) * e) * sc - 0.15, -(fc[2] + (bc[2] - fc[2]) * e) * sc)
      })
    },
    (st) => {
      const root = st.scene.getObjectByName('box') as THREE.Group
      st.clear(root)
      root.userData.groups = undefined
      if (!panels.length || !tex || !b) return
      const texture = new THREE.CanvasTexture(tex)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      const outside = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, side: THREE.FrontSide })
      const inside = new THREE.MeshStandardMaterial({ color: '#d6c7a8', roughness: 0.9, side: THREE.BackSide })
      const sc = 4 / Math.max(s.W, s.D, s.H) / 1.15
      root.scale.setScalar(sc)
      const holder = new THREE.Group()
      root.add(holder)
      const byId = new Map<string, THREE.Group>()
      const groups: { g: THREE.Group; p: DPanel }[] = []
      const front = panels.find((p) => !p.parent)!
      for (const p of panels) {
        const g = new THREE.Group()
        const parentP = p.parent ? panels.find((q) => q.id === p.parent)! : null
        const po = parentP ? parentP.origin : front.origin
        g.position.set(p.origin[0] - po[0], p.origin[1] - po[1], 0)
        const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x - p.origin[0], y - p.origin[1])))
        const geo = new THREE.ShapeGeometry(shape)
        const pos = geo.getAttribute('position') as THREE.BufferAttribute
        const uv = new Float32Array(pos.count * 2)
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = (pos.getX(i) + p.origin[0] - b.x0) / b.w
          uv[i * 2 + 1] = (pos.getY(i) + p.origin[1] - b.y0) / b.h
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        const z = p.layer * 0.5
        const m1 = new THREE.Mesh(geo, outside), m2 = new THREE.Mesh(geo, inside)
        m1.position.z = m2.position.z = z
        g.add(m1, m2)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.25 }))
        edges.position.z = z
        g.add(edges)
        ;(p.parent ? byId.get(p.parent)! : holder).add(g)
        if (!p.parent) g.position.set(0, 0, 0)
        byId.set(p.id, g)
        if (p.parent) groups.push({ g, p })
      }
      root.userData.groups = groups
      root.userData.sc = sc
      root.userData.flatC = [b.x0 + b.w / 2 - front.origin[0], b.y0 + b.h / 2 - front.origin[1], 0]
      root.userData.boxC = [s.W / 2, s.H / 2, -s.D / 2]
    },
    [panels, tex, s.W, s.D, s.H],
    { camera: [3, 2.2, 4.9], grid: false, background: '#1e293b' },
  )

  const weightG = (area / 1e6) * s.gsm
  const loadArt = (f: File) => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => setImg(im)
    im.src = url
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Box style & size" actions={<Btn kind="ghost" onClick={() => { reset(); setImg(null) }}>Reset</Btn>}>
          <Seg value={s.style} onChange={(style) => set({ style })} options={[['rte', 'Reverse tuck end'], ['ste', 'Straight tuck end'], ['sleeve', 'Sleeve']]} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}
          </div>
          <Row>
            <Num label="Width W" value={s.W} onChange={(W) => set({ W })} unit="mm" min={10} max={600} />
            <Num label="Depth D" value={s.D} onChange={(D) => set({ D })} unit="mm" min={5} max={600} />
            <Num label="Height H" value={s.H} onChange={(H) => set({ H })} unit="mm" min={10} max={800} />
          </Row>
          <Row>
            <Num label="Glue flap" value={s.glue} onChange={(glue) => set({ glue })} unit="mm" min={5} />
            {s.style !== 'sleeve' && <Num label="Tuck flap" value={s.tuck} onChange={(tuck) => set({ tuck })} unit="mm" min={5} />}
            {s.style !== 'sleeve' && <Num label="Dust flap" value={s.dust} onChange={(dust) => set({ dust })} unit="mm" min={5} />}
          </Row>
          {errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
        </Panel>
        <Panel title="Artwork">
          <Row>
            <Txt label="Brand" value={s.brand} onChange={(brand) => set({ brand })} />
            <Txt label="Product line" value={s.product} onChange={(product) => set({ product })} />
          </Row>
          <Row>
            <label className="k-field"><span className="k-label">Main colour</span><input type="color" value={s.c1} onChange={(e) => set({ c1: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Accent</span><input type="color" value={s.c2} onChange={(e) => set({ c2: e.target.value })} /></label>
            <Check label="Show cut/fold guides" value={s.guides} onChange={(guides) => set({ guides })} />
          </Row>
          <FileDrop accept="image/*" label="Drop artwork laid out on the flat dieline" onFiles={([f]) => loadArt(f)} />
          {img && <Row><span className="muted" style={{ fontSize: 13 }}>Custom artwork {img.naturalWidth}×{img.naturalHeight}px stretched over the dieline.</span><Btn kind="ghost" onClick={() => setImg(null)}>Use generated art</Btn></Row>}
          <p className="muted" style={{ fontSize: 12 }}>Download the template, paint your design over it in any editor at the same proportions, then drop it here to preview it folded.</p>
          <Row>
            <Btn onClick={() => tex?.toBlob((bl) => bl && download(`dieline-template-${s.W}x${s.D}x${s.H}.png`, bl, 'image/png'))} disabled={!tex}>⬇ Artwork template PNG</Btn>
          </Row>
        </Panel>
        <Panel title="Board">
          <Row>
            <Num label="Board thickness" value={s.board} onChange={(board) => set({ board })} unit="mm" min={0.1} max={5} step={0.05} />
            <Num label="Grammage" value={s.gsm} onChange={(gsm) => set({ gsm })} unit="g/m²" min={100} max={1500} />
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>For a snug fit add about one board thickness to the inside dimensions of panels that wrap others: e.g. back and front width ≈ W + {num(s.board, 2)} mm.</p>
        </Panel>
      </div>
      <div>
        {b && (
          <Stats>
            <Stat label="Flat blank" value={`${num(b.w, 1)} × ${num(b.h, 1)} mm`} sub={`${num((b.w * b.h) / 100, 0)} cm² sheet`} tone="accent" />
            <Stat label="Board used" value={`${num(area / 100, 0)} cm²`} sub={`${num((area / (b.w * b.h)) * 100, 0)} % of the blank`} />
            <Stat label="Weight" value={`${num(weightG, 1)} g`} sub={`at ${s.gsm} g/m²`} />
            <Stat label="Volume" value={`${num((s.W * s.D * s.H) / 1000, 0)} ml`} sub={`${s.W}×${s.D}×${s.H} mm inside`} />
          </Stats>
        )}
        <Panel title="3D fold preview" actions={<Btn kind={playing ? 'primary' : 'normal'} onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Animate'}</Btn>}>
          <Slider label="Fold" value={Math.round(fold * 100)} onChange={(v) => { setPlaying(false); setFold(v / 100) }} min={0} max={100} unit="%" show={(v) => v.toFixed(0)} />
          <View3D refEl={ref} height={420} />
          <p className="muted" style={{ fontSize: 12 }}>Order: walls and glue flap → dust flaps → closures → tuck flaps. Drag to orbit; the brown side is the unprinted inside of the board.</p>
        </Panel>
        {panels.length > 0 && b && (
          <Panel title="Flat dieline" actions={<Btn kind="primary" onClick={() => download(`dieline-${s.style}-${s.W}x${s.D}x${s.H}.svg`, dielineSvg(panels, params), 'image/svg+xml')}>⬇ Dieline SVG</Btn>}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 8 }} dangerouslySetInnerHTML={{ __html: dielineSvg(panels, params).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" style="max-height:420px"') }} />
            <div className="k-legend"><span><i style={{ background: '#e11d48' }} />cut</span><span><i style={{ background: '#2563eb' }} />fold (crease)</span></div>
            <Table head={['Panel', 'Size', 'Folds from', 'Area']} rows={panels.map((p) => {
              const xs = p.poly.map((q) => q[0]), ys = p.poly.map((q) => q[1])
              return [p.name, `${num(Math.max(...xs) - Math.min(...xs), 1)} × ${num(Math.max(...ys) - Math.min(...ys), 1)} mm`, p.parent ? panels.find((q) => q.id === p.parent)!.name : '— (fixed)', `${num(polyArea(p.poly) / 100, 1)} cm²`]
            })} />
            <p className="muted" style={{ fontSize: 12 }}>SVG is drawn at real size in millimetres: send it to a cutting plotter or print shop. Cut lines are red, creases blue dashed.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
