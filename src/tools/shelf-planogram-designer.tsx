import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, Donut, download, JsonButtons, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { clearance, evenShelves, layout, maxFacings, shareBy, shelfUse, type Placement, type Product, type Unit } from './lib/shelf-planogram-designer'

const K = 0.02 // cm → world units
const PRODUCTS: Product[] = [
  { id: 'cola', name: 'Cola 2 L', brand: 'FizzCo', w: 11, h: 33, d: 11, color: '#dc2626', price: 2.49, stack: false },
  { id: 'lemon', name: 'Lemon soda 2 L', brand: 'FizzCo', w: 11, h: 33, d: 11, color: '#eab308', price: 2.29, stack: false },
  { id: 'water', name: 'Sparkling water 1.5 L', brand: 'AquaPure', w: 9, h: 31, d: 9, color: '#38bdf8', price: 0.99, stack: false },
  { id: 'energy', name: 'Energy drink 250 ml', brand: 'Volt', w: 6.6, h: 12.3, d: 6.6, color: '#16a34a', price: 1.79, stack: true },
  { id: 'chips', name: 'Potato chips', brand: 'CrunchCo', w: 20, h: 28, d: 8, color: '#f97316', price: 2.99, stack: false },
  { id: 'tortilla', name: 'Tortilla chips', brand: 'CrunchCo', w: 22, h: 30, d: 8, color: '#65a30d', price: 3.29, stack: false },
  { id: 'pretzel', name: 'Pretzels', brand: 'Twistee', w: 16, h: 24, d: 7, color: '#92400e', price: 2.49, stack: false },
  { id: 'choco', name: 'Chocolate bar', brand: 'ChocoLux', w: 14, h: 8, d: 10, color: '#7c2d12', price: 1.49, stack: true },
  { id: 'cookie', name: 'Cookies', brand: 'ChocoLux', w: 18, h: 6, d: 12, color: '#a16207', price: 2.79, stack: true },
  { id: 'nuts', name: 'Mixed nuts jar', brand: 'NutHouse', w: 10, h: 14, d: 10, color: '#b45309', price: 5.49, stack: true },
]
const P = (pid: string, bay: number, shelf: number, facings: number, order: number): Placement => ({ id: `${pid}-${bay}-${shelf}`, pid, bay, shelf, facings, order })
const DEF = {
  unit: { bays: 2, bayW: 120, height: 200, depth: 40, shelves: [10, 52, 92, 130, 165], thick: 2 } as Unit,
  products: PRODUCTS,
  placements: [
    P('cola', 0, 0, 5, 0), P('lemon', 0, 0, 4, 1), P('water', 1, 0, 6, 0), P('cola', 1, 0, 4, 1),
    P('chips', 0, 1, 3, 0), P('tortilla', 0, 1, 2, 1), P('pretzel', 1, 1, 3, 0), P('chips', 1, 1, 3, 1),
    P('energy', 0, 2, 10, 0), P('nuts', 0, 2, 4, 1), P('energy', 1, 2, 8, 0), P('nuts', 1, 2, 5, 1),
    P('choco', 0, 3, 8, 0), P('choco', 1, 3, 4, 0), P('cookie', 1, 3, 3, 1),
    P('cookie', 0, 4, 6, 0), P('pretzel', 1, 4, 4, 0), P('water', 1, 4, 2, 1),
  ],
  sel: 'cola-0-0',
}

const texCache = new Map<string, HTMLCanvasElement>()
/** Front label artwork for a product (uploaded image or a generated pack design). */
function face(p: Product, done?: () => void): HTMLCanvasElement {
  const key = `${p.id}|${p.name}|${p.brand}|${p.color}|${p.w}|${p.h}|${p.img?.length ?? 0}`
  const hit = texCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 128
  c.height = Math.max(32, Math.round((128 * p.h) / p.w))
  const g = c.getContext('2d')!
  g.fillStyle = p.color
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = 'rgba(255,255,255,.88)'
  g.fillRect(6, c.height * 0.32, c.width - 12, Math.max(20, c.height * 0.36))
  g.fillStyle = '#111827'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const fs = Math.min(22, c.height * 0.14)
  g.font = `800 ${fs}px system-ui, sans-serif`
  g.fillText(p.brand, c.width / 2, c.height * 0.42, c.width - 16)
  g.font = `600 ${fs * 0.75}px system-ui, sans-serif`
  g.fillText(p.name, c.width / 2, c.height * 0.58, c.width - 16)
  g.strokeStyle = 'rgba(0,0,0,.35)'
  g.lineWidth = 3
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3)
  if (p.img) {
    const im = new Image()
    im.onload = () => { g.drawImage(im, 0, 0, c.width, c.height); done?.() }
    im.src = p.img
  }
  texCache.set(key, c)
  return c
}

export default function ShelfPlanogramDesigner() {
  const [s, set, reset] = useToolState('shelf-planogram-designer', DEF)
  const [tick, setTick] = useState(0)
  const u = s.unit
  const laid = useMemo(() => layout(u, s.products, s.placements), [u, s.products, s.placements])
  const sel = s.placements.find((p) => p.id === s.sel)
  const selProd = sel ? s.products.find((p) => p.id === sel.pid) : undefined
  const pickRef = useRef<(id: string) => void>(() => {})
  const texs = useRef<THREE.Texture[]>([])
  useEffect(() => { pickRef.current = (id) => set({ sel: id }) }, [set])

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      const el = stage.renderer.domElement
      let dx = 0, dy = 0
      const down = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY }
      const up = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - dx, e.clientY - dy) > 4) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const h = ray.intersectObjects(root.children, true).find((x) => x.object.userData.pl)
        if (h) pickRef.current(h.object.userData.pl as string)
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      texs.current.forEach((t) => t.dispose())
      texs.current = []
      const W = u.bays * u.bayW
      const x0 = -W / 2
      const wood = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.7 })
      const dark = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6 })
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * K, h * K, d * K), m)
        mesh.position.set(x * K, y * K, z * K)
        root.add(mesh)
        return mesh
      }
      box(W, u.height, 1.5, 0, u.height / 2, -u.depth / 2 - 0.75, dark) // back panel
      for (let b = 0; b <= u.bays; b++) box(3, u.height, u.depth + 4, x0 + b * u.bayW, u.height / 2, 0, dark)
      for (const y of u.shelves) {
        box(W, u.thick, u.depth + 2, 0, y - u.thick / 2, 0, wood)
        box(W, 3, 0.6, 0, y - 1, u.depth / 2 + 1.2, new THREE.MeshStandardMaterial({ color: '#1e293b' })) // price rail
      }
      const sorted = [...u.shelves].sort((a, b) => a - b)
      for (const l of laid) {
        const tex = new THREE.CanvasTexture(face(l.prod, () => setTick((t) => t + 1)))
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(l.p.facings, l.high)
        texs.current.push(tex)
        const side = new THREE.MeshStandardMaterial({ color: l.prod.color, roughness: 0.5 })
        const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
        const h = l.prod.h * l.high, d = l.prod.d * l.deep
        const m = new THREE.Mesh(new THREE.BoxGeometry(l.width * K, h * K, d * K), [side, side, side, side, front, side])
        const y = sorted[l.p.shelf] ?? 0
        m.position.set((x0 + l.p.bay * u.bayW + l.x + l.width / 2) * K, (y + h / 2) * K, (u.depth / 2 - d / 2) * K)
        m.userData.pl = l.p.id
        root.add(m)
        if (l.over || l.tall) {
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#ef4444' }))
          e.position.copy(m.position)
          root.add(e)
        }
        if (l.p.id === s.sel) {
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#22d3ee', depthTest: false }))
          e.position.copy(m.position)
          e.scale.setScalar(1.03)
          root.add(e)
        }
      }
      stage.controls.target.set(0, (u.height / 2) * K, 0)
    },
    [laid, u, s.sel, tick],
    { camera: [1.6, 2.6, 4.6], target: [0, 2, 0] },
  )

  const setUnit = (patch: Partial<Unit>) => set({ unit: { ...u, ...patch } })
  const editPl = (patch: Partial<Placement>) => sel && set({ placements: s.placements.map((p) => (p.id === sel.id ? { ...p, ...patch } : p)) })
  const editProd = (id: string, patch: Partial<Product>) => set({ products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const shiftOrder = (dir: number) => {
    if (!sel) return
    const row = s.placements.filter((p) => p.bay === sel.bay && p.shelf === sel.shelf).sort((a, b) => a.order - b.order)
    const i = row.findIndex((p) => p.id === sel.id), j = i + dir
    if (j < 0 || j >= row.length) return
    ;[row[i], row[j]] = [row[j], row[i]]
    const ord = new Map(row.map((p, k) => [p.id, k]))
    set({ placements: s.placements.map((p) => (ord.has(p.id) ? { ...p, order: ord.get(p.id)! } : p)) })
  }
  const addPl = (pid: string) => {
    const bay = sel?.bay ?? 0, shelf = sel?.shelf ?? 0
    const id = uid()
    const order = Math.max(-1, ...s.placements.filter((p) => p.bay === bay && p.shelf === shelf).map((p) => p.order)) + 1
    set({ placements: [...s.placements, { id, pid, bay, shelf, facings: 2, order }], sel: id })
  }
  const upload = (pid: string, f: File) => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      const c = document.createElement('canvas')
      const k = 160 / Math.max(im.width, im.height)
      c.width = Math.round(im.width * k)
      c.height = Math.round(im.height * k)
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
      editProd(pid, { img: c.toDataURL('image/jpeg', 0.8) })
      URL.revokeObjectURL(url)
    }
    im.src = url
  }

  const exportFront = () => {
    const px = 4, pad = 30
    const W = u.bays * u.bayW
    const c = document.createElement('canvas')
    c.width = W * px + pad * 2
    c.height = u.height * px + pad * 2 + 30
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    const Y = (cm: number) => pad + (u.height - cm) * px
    g.fillStyle = '#cbd5e1'
    g.fillRect(pad, pad, W * px, u.height * px)
    const sorted = [...u.shelves].sort((a, b) => a - b)
    for (const y of sorted) { g.fillStyle = '#475569'; g.fillRect(pad, Y(y), W * px, u.thick * px) }
    for (let b = 0; b <= u.bays; b++) { g.fillStyle = '#334155'; g.fillRect(pad + b * u.bayW * px - 4, pad, 8, u.height * px) }
    for (const l of laid) {
      const img = face(l.prod)
      const y = sorted[l.p.shelf]
      for (let f = 0; f < l.p.facings; f++)
        for (let k = 0; k < l.high; k++) g.drawImage(img, pad + (l.p.bay * u.bayW + l.x + f * l.prod.w) * px, Y(y + (k + 1) * l.prod.h), l.prod.w * px, l.prod.h * px)
      if (l.over || l.tall) { g.strokeStyle = '#ef4444'; g.lineWidth = 3; g.strokeRect(pad + (l.p.bay * u.bayW + l.x) * px, Y(y + l.prod.h * l.high), l.width * px, l.prod.h * l.high * px) }
    }
    g.fillStyle = '#0f172a'
    g.font = '600 18px system-ui'
    g.fillText(`Planogram front view · ${u.bays} × ${u.bayW} cm bays · ${u.height} cm high · ${new Date().toLocaleDateString()}`, pad, c.height - 12)
    c.toBlob((b) => b && download('planogram-front.png', b))
  }

  const use = shelfUse(u, laid)
  const capacity = laid.reduce((a, l) => a + l.units, 0)
  const value = laid.reduce((a, l) => a + l.units * l.prod.price, 0)
  const warnings = laid.filter((l) => l.over || l.tall)
  const brands = shareBy(laid, (l) => l.prod.brand)
  const fill = use.reduce((a, x) => a + Math.min(x.used, u.bayW), 0) / (u.bayW * use.length || 1)
  const selLaid = laid.find((l) => l.p.id === s.sel)

  return (
    <div>
      <Stats>
        <Stat label="Facings" value={laid.reduce((a, l) => a + l.p.facings, 0)} sub={`${laid.length} placements · ${s.products.length} products`} />
        <Stat label="Shelf fill" value={pct(fill, 0)} sub={`${Math.round(use.reduce((a, x) => a + x.used, 0))} / ${u.bayW * use.length} cm linear`} tone="accent" />
        <Stat label="Capacity" value={`${capacity} units`} sub={`${money(value, '$', 0)} at retail`} />
        <Stat label="Problems" value={warnings.length} sub={warnings.length ? 'overflow or too tall' : 'all items fit ✓'} tone={warnings.length ? 'bad' : 'good'} />
      </Stats>
      <Split wide="left">
        <Panel title="Shelving unit" actions={<><Btn onClick={exportFront}>⬇ Front view PNG</Btn><CsvButton name="planogram.csv" rows={() => [['Bay', 'Shelf', 'Position', 'Product', 'Brand', 'Facings', 'Deep', 'High', 'Units', 'x from left (cm)'], ...laid.map((l) => [l.p.bay + 1, l.p.shelf + 1, l.p.order + 1, l.prod.name, l.prod.brand, l.p.facings, l.deep, l.high, l.units, l.x.toFixed(1)])]} /></>}>
          <View3D refEl={ref} height={480} />
          <p className="muted" style={{ fontSize: 12 }}>Click a product block to select it. Red outlines = overflowing the bay or taller than the shelf gap. Stackable items fill the gap vertically; every item fills the shelf depth.</p>
          {warnings.map((l) => <Note key={l.p.id} tone="err">Bay {l.p.bay + 1}, shelf {l.p.shelf + 1}: {l.prod.name} {l.over ? `runs ${Math.round(l.x + l.width - u.bayW)} cm past the bay` : ''}{l.over && l.tall ? ' and ' : ''}{l.tall ? `is ${l.prod.h} cm tall but the gap is ${clearance(u, l.p.shelf)} cm` : ''}.</Note>)}
        </Panel>
        <div>
          <Panel title={selLaid ? `Selected: ${selLaid.prod.name}` : 'Selected placement'}>
            {sel && selProd ? (
              <>
                <Row>
                  <Select label="Product" value={sel.pid} onChange={(pid) => editPl({ pid })} options={s.products.map((p) => [p.id, p.name] as [string, string])} />
                  <Num label="Facings" value={sel.facings} min={1} max={60} step={1} onChange={(facings) => editPl({ facings: Math.max(1, Math.round(facings)) })} hint={`max ${maxFacings(u, laid, sel, selProd)} fit`} />
                </Row>
                <Row>
                  <Select label="Bay" value={sel.bay} onChange={(bay) => editPl({ bay, order: 99 })} options={Array.from({ length: u.bays }, (_, i) => [i, `Bay ${i + 1}`] as [number, string])} />
                  <Select label="Shelf" value={sel.shelf} onChange={(shelf) => editPl({ shelf, order: 99 })} options={u.shelves.map((h, i) => [i, `Shelf ${i + 1} (${h} cm, gap ${clearance(u, i)})`] as [number, string])} />
                </Row>
                <Row>
                  <Btn onClick={() => shiftOrder(-1)}>◀ Left</Btn>
                  <Btn onClick={() => shiftOrder(1)}>Right ▶</Btn>
                  <Btn onClick={() => editPl({ facings: Math.max(1, maxFacings(u, laid, sel, selProd)) })}>Fill gap</Btn>
                  <Btn kind="danger" onClick={() => set({ placements: s.placements.filter((p) => p.id !== sel.id), sel: '' })}>Remove</Btn>
                </Row>
                {selLaid && <p className="muted" style={{ fontSize: 12 }}>{selLaid.p.facings} wide × {selLaid.deep} deep × {selLaid.high} high = <b>{selLaid.units} units</b> · {money(selLaid.units * selProd.price)} stock value.</p>}
              </>
            ) : <p className="muted">Click a product in the 3D view.</p>}
            <Select label="Add product to this shelf" value={'' as string} onChange={(v) => v && addPl(v)} options={[['', 'Choose…'], ...s.products.map((p) => [p.id, `${p.name} (${p.w}×${p.h} cm)`] as [string, string])]} />
          </Panel>
          <Panel title="Share of shelf by brand">
            <Donut slices={brands.map(([b, v]) => ({ label: b, value: Math.round(v * laid.reduce((a, l) => a + l.width, 0)), color: s.products.find((p) => p.brand === b)?.color }))} fv={(v) => `${v} cm`} size={180} />
          </Panel>
          <Panel title="Unit dimensions" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Row>
              <Num label="Bays" value={u.bays} min={1} max={8} step={1} onChange={(bays) => setUnit({ bays: Math.max(1, Math.round(bays)) })} />
              <Num label="Bay width" value={u.bayW} min={30} unit="cm" onChange={(bayW) => setUnit({ bayW })} />
            </Row>
            <Row>
              <Num label="Height" value={u.height} min={60} unit="cm" onChange={(height) => setUnit({ height })} />
              <Num label="Shelf depth" value={u.depth} min={10} unit="cm" onChange={(depth) => setUnit({ depth })} />
            </Row>
            <Row>
              <Num label="Shelves" value={u.shelves.length} min={1} max={10} step={1} onChange={(n) => setUnit({ shelves: evenShelves(u.height, Math.max(1, Math.round(n))) })} />
              <label className="k-field"><span className="k-label">Shelf heights (cm)</span><input className="k-text" defaultValue={u.shelves.join(', ')} key={u.shelves.join()} onBlur={(e) => { const v = e.target.value.split(/[,\s]+/).map(Number).filter((x) => x >= 0 && x < u.height).sort((a, b) => a - b); if (v.length) setUnit({ shelves: v }) }} /></label>
            </Row>
          </Panel>
        </div>
      </Split>
      <Panel title="Product library" actions={<><Btn onClick={() => set({ products: [...s.products, { id: uid(), name: 'New product', brand: 'Brand', w: 10, h: 20, d: 10, color: '#6366f1', price: 1.99, stack: false }] })}>+ Product</Btn><JsonButtons name="planogram.json" data={s} onLoad={(d) => d?.unit && set(d)} /></>}>
        <Table
          head={['Image', 'Name', 'Brand', 'W × H × D (cm)', 'Price', 'Colour', 'Stack', '']}
          rows={s.products.map((p) => [
            <label key="i" style={{ cursor: 'pointer' }} title="Upload a front photo">
              <img src={face(p).toDataURL()} alt="" style={{ height: 36, width: 'auto', maxWidth: 48, borderRadius: 3 }} />
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(p.id, f); e.target.value = '' }} />
            </label>,
            <input key="n" value={p.name} onChange={(e) => editProd(p.id, { name: e.target.value })} style={{ width: 140 }} aria-label="Name" />,
            <input key="b" value={p.brand} onChange={(e) => editProd(p.id, { brand: e.target.value })} style={{ width: 90 }} aria-label="Brand" />,
            <span key="d" style={{ whiteSpace: 'nowrap' }}>{(['w', 'h', 'd'] as const).map((k) => <input key={k} type="number" min={1} value={p[k]} onChange={(e) => editProd(p.id, { [k]: Math.max(0.5, Number(e.target.value) || 1) })} style={{ width: 52 }} aria-label={k} />)}</span>,
            <input key="p" type="number" min={0} step={0.01} value={p.price} onChange={(e) => editProd(p.id, { price: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} aria-label="Price" />,
            <input key="c" type="color" value={p.color} onChange={(e) => editProd(p.id, { color: e.target.value })} aria-label="Colour" />,
            <Check key="s" label="" value={p.stack} onChange={(stack) => editProd(p.id, { stack })} />,
            <Btn key="x" kind="ghost" title="Delete product and its placements" onClick={() => set({ products: s.products.filter((x) => x.id !== p.id), placements: s.placements.filter((x) => x.pid !== p.id) })}>✕</Btn>,
          ])}
        />
        <p className="muted" style={{ fontSize: 12 }}>Click a thumbnail to upload a front-of-pack photo; it is stored (downscaled) in this browser and used as the 3D texture and in the PNG export.</p>
      </Panel>
    </div>
  )
}
