import { useRef, useState } from 'react'
import { Btn, CsvButton, Donut, JsonButtons, Note, num, Num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { coverage, footprint, parsePts, siteRings, totals, USES, type Block, type P, type Shape, type Use } from './lib/building-massing-studio'

interface Site { w: number; d: number; setback: number; far: number; maxH: number; maxCov: number }
interface State { site: Site; blocks: Block[]; eff: number; unit: number }

const blk = (o: Partial<Block>): Block => ({ id: uid(), name: 'Block', shape: 'rect', w: 20, d: 14, arm: 8, pts: [], x: 0, y: 0, rot: 0, floors: 4, fh: 3.2, base: 0, use: 'residential', ...o })

const PRESETS: Record<string, () => Block[]> = {
  'Tower on podium': () => [
    blk({ id: 'p', name: 'Podium', w: 56, d: 36, floors: 2, fh: 4.5, use: 'retail' }),
    blk({ id: 't', name: 'Tower', w: 24, d: 22, floors: 16, fh: 3.1, base: 9, x: -10, use: 'residential' }),
    blk({ id: 'o', name: 'Office wing', shape: 'L', w: 26, d: 30, arm: 12, floors: 6, fh: 3.8, base: 9, x: 15, y: 2, rot: 0, use: 'office' }),
  ],
  'Perimeter block': () => [
    blk({ id: 'g', name: 'Ground-floor shops', shape: 'court', w: 60, d: 44, arm: 13, floors: 1, fh: 4.5, use: 'retail' }),
    blk({ id: 'c', name: 'Courtyard flats', shape: 'court', w: 60, d: 44, arm: 13, floors: 6, fh: 3.1, base: 4.5, use: 'residential' }),
  ],
  'Office campus': () => [
    blk({ id: 'a', name: 'Building A', shape: 'U', w: 40, d: 26, arm: 12, floors: 7, fh: 3.8, x: -12, y: -10, use: 'office' }),
    blk({ id: 'b', name: 'Building B', w: 18, d: 36, floors: 5, fh: 3.8, x: 22, y: 4, rot: 12, use: 'office' }),
    blk({ id: 'k', name: 'Car park', w: 40, d: 16, floors: 3, fh: 3, x: -12, y: 18, use: 'parking' }),
  ],
}

const DEF: State = { site: { w: 80, d: 60, setback: 4, far: 3.5, maxH: 60, maxCov: 0.6 }, blocks: PRESETS['Tower on podium'](), eff: 0.82, unit: 75 }

function build(s: Stage3D, st: State, sel: string | null, group: THREE.Group) {
  s.clear(group)
  const { w, d, setback, maxH } = st.site
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#4d7c0f', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  group.add(ground)
  const sb = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * (w / 2 - setback), 0.05, b * (d / 2 - setback)))),
    new THREE.LineBasicMaterial({ color: '#fde047' }),
  )
  group.add(sb)
  const lim = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }))
  lim.rotation.x = -Math.PI / 2
  lim.position.y = maxH
  group.add(lim)
  for (const b of st.blocks) {
    const rings = siteRings(b)
    const h = Math.max(0.05, b.floors * b.fh)
    const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, -y)))
    for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, -y))))
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    const on = b.id === sel
    const mat = new THREE.MeshStandardMaterial({ color: USES[b.use].color, roughness: 0.7, transparent: b.floors === 0, opacity: b.floors === 0 ? 0.3 : 1, emissive: on ? '#ffffff' : '#000000', emissiveIntensity: on ? 0.25 : 0 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = b.base
    group.add(mesh)
    const lineMat = new THREE.LineBasicMaterial({ color: on ? '#ffffff' : '#1e293b', transparent: true, opacity: 0.6 })
    for (let f = 0; f <= b.floors; f++)
      for (const ring of rings)
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring.map(([x, y]) => new THREE.Vector3(x, b.base + f * b.fh + 0.02, y))), lineMat))
    const tag = label(`${b.name} · ${b.floors}F`, '#f8fafc', 3.5)
    tag.position.set(b.x, b.base + h + 2.5, b.y)
    group.add(tag)
  }
}

export default function BuildingMassingStudio() {
  const [s, set, reset] = useToolState('building-massing-studio', DEF)
  const [sel, setSel] = useState<string | null>(s.blocks[1]?.id ?? s.blocks[0]?.id ?? null)
  const [draw, setDraw] = useState<P[] | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const groupRef = useRef<THREE.Group | null>(null)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      st.scene.add(g)
      groupRef.current = g
      st.scene.children.filter((c) => c instanceof THREE.GridHelper).forEach((c) => (c.visible = false))
    },
    (st) => groupRef.current && build(st, s, sel, groupRef.current),
    [s, sel],
    { camera: [70, 75, 95], target: [0, 10, 0], background: '#0f172a' },
  )

  const site = s.site
  const siteArea = site.w * site.d
  const t = totals(s.blocks)
  const cov = coverage(s.blocks.filter((b) => b.base === 0), Math.max(0.25, Math.sqrt(siteArea) / 160))
  const far = t.countedGfa / siteArea
  const b = s.blocks.find((x) => x.id === sel)
  const edit = (id: string, p: Partial<Block>) => set({ blocks: s.blocks.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const outside = s.blocks.filter((x) => siteRings(x)[0].some(([px, py]) => Math.abs(px) > site.w / 2 - site.setback + 0.01 || Math.abs(py) > site.d / 2 - site.setback + 0.01))
  const resUnits = Math.floor((t.byUse.residential * s.eff) / s.unit)

  // plan view geometry
  const M = 6
  const vb = `${-site.w / 2 - M} ${-site.d / 2 - M} ${site.w + 2 * M} ${site.d + 2 * M}`
  const toSite = (e: React.PointerEvent): P => {
    const el = svg.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse())
    return [pt.x, pt.y]
  }
  const snap = (v: number) => Math.round(v * 2) / 2

  return (
    <Split wide="right">
      <div>
        <Panel title="Site & zoning" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Site width" value={site.w} onChange={(w) => set({ site: { ...site, w } })} unit="m" min={5} />
            <Num label="Site depth" value={site.d} onChange={(d) => set({ site: { ...site, d } })} unit="m" min={5} />
          </Row>
          <Row>
            <Num label="Setback" value={site.setback} onChange={(setback) => set({ site: { ...site, setback } })} unit="m" min={0} />
            <Num label="Max FAR" value={site.far} onChange={(far) => set({ site: { ...site, far } })} min={0} step={0.1} />
          </Row>
          <Row>
            <Num label="Height limit" value={site.maxH} onChange={(maxH) => set({ site: { ...site, maxH } })} unit="m" min={0} />
            <Num label="Max coverage" value={Math.round(site.maxCov * 100)} onChange={(v) => set({ site: { ...site, maxCov: v / 100 } })} unit="%" min={0} max={100} />
          </Row>
          <Row>
            {Object.keys(PRESETS).map((k) => (
              <Btn key={k} kind="ghost" onClick={() => { const bl = PRESETS[k](); set({ blocks: bl }); setSel(bl[0].id) }}>{k}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Plan (drag blocks)" actions={draw ? <><Btn kind="primary" disabled={draw.length < 3} onClick={() => {
          const cx = draw.reduce((a, p) => a + p[0], 0) / draw.length, cy = draw.reduce((a, p) => a + p[1], 0) / draw.length
          const nb = blk({ name: `Custom ${s.blocks.length + 1}`, shape: 'poly', pts: draw.map(([x, y]) => [+(x - cx).toFixed(2), +(y - cy).toFixed(2)]), x: +cx.toFixed(2), y: +cy.toFixed(2), w: 0, d: 0 })
          set({ blocks: [...s.blocks, nb] }); setSel(nb.id); setDraw(null)
        }}>Finish ({draw.length})</Btn><Btn kind="ghost" onClick={() => setDraw(null)}>Cancel</Btn></> : <Btn onClick={() => setDraw([])}>✎ Draw footprint</Btn>}>
          <svg
            ref={svg}
            viewBox={vb}
            style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, touchAction: 'none', cursor: draw ? 'crosshair' : 'default' }}
            onPointerDown={(e) => { if (draw) { const [x, y] = toSite(e); setDraw([...draw, [snap(x), snap(y)]]) } }}
            onPointerMove={(e) => { if (drag.current) { const [x, y] = toSite(e); edit(drag.current.id, { x: snap(x - drag.current.dx), y: snap(y - drag.current.dy) }) } }}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
          >
            <rect x={-site.w / 2} y={-site.d / 2} width={site.w} height={site.d} fill="rgba(77,124,15,.18)" stroke="#65a30d" strokeWidth={0.3} />
            <rect x={-site.w / 2 + site.setback} y={-site.d / 2 + site.setback} width={Math.max(0, site.w - 2 * site.setback)} height={Math.max(0, site.d - 2 * site.setback)} fill="none" stroke="#ca8a04" strokeDasharray="1.5 1" strokeWidth={0.25} />
            {s.blocks.map((x) => (
              <path
                key={x.id}
                d={siteRings(x).map((r) => 'M' + r.map((p) => p.join(',')).join('L') + 'Z').join('')}
                fillRule="evenodd"
                fill={USES[x.use].color}
                fillOpacity={x.base > 0 ? 0.45 : 0.75}
                stroke={x.id === sel ? 'var(--text, #111)' : '#1e293b'}
                strokeWidth={x.id === sel ? 0.6 : 0.2}
                style={{ cursor: draw ? 'crosshair' : 'move' }}
                onPointerDown={(e) => { if (draw) return; e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setSel(x.id); const [px, py] = toSite(e); drag.current = { id: x.id, dx: px - x.x, dy: py - x.y } }}
              />
            ))}
            {draw && draw.length > 0 && <polyline points={draw.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={0.5} />}
            {draw?.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.8} fill="var(--accent)" />)}
            <text x={-site.w / 2} y={site.d / 2 + 4} fontSize={3} fill="var(--muted)">{site.w} × {site.d} m · north ↑</text>
          </svg>
          {draw && <p className="muted" style={{ fontSize: 13 }}>Click corners on the plan (snaps to 0.5 m), then Finish.</p>}
        </Panel>
        {b && (
          <Panel title={`Edit: ${b.name}`} actions={<><Btn onClick={() => { const c = { ...b, id: uid(), name: b.name + ' copy', x: b.x + 6, y: b.y + 6 }; set({ blocks: [...s.blocks, c] }); setSel(c.id) }}>Duplicate</Btn><Btn kind="danger" onClick={() => { set({ blocks: s.blocks.filter((x) => x.id !== b.id) }); setSel(null) }}>Delete</Btn></>}>
            <Row>
              <label className="k-field"><span className="k-label">Name</span><input className="k-text" value={b.name} onChange={(e) => edit(b.id, { name: e.target.value })} /></label>
              <Select label="Use" value={b.use} onChange={(use: Use) => edit(b.id, { use })} options={Object.entries(USES).map(([k, v]) => [k as Use, v.label] as const)} />
            </Row>
            <Select label="Footprint" value={b.shape} onChange={(shape: Shape) => edit(b.id, { shape, w: b.w || 20, d: b.d || 14 })} options={[['rect', 'Rectangle'], ['L', 'L-shape'], ['U', 'U-shape'], ['court', 'Courtyard'], ['poly', 'Custom polygon']]} />
            {b.shape === 'poly' ? (
              <label className="k-field"><span className="k-label">Corners, local metres (x,y …)</span>
                <textarea className="k-area mono" rows={2} value={b.pts.map((p) => p.join(',')).join(' ')} onChange={(e) => edit(b.id, { pts: parsePts(e.target.value) })} />
              </label>
            ) : (
              <Row>
                <Num label="Width" value={b.w} onChange={(w) => edit(b.id, { w })} unit="m" min={1} />
                <Num label="Depth" value={b.d} onChange={(d) => edit(b.id, { d })} unit="m" min={1} />
                {b.shape !== 'rect' && <Num label="Wing depth" value={b.arm} onChange={(arm) => edit(b.id, { arm })} unit="m" min={1} />}
              </Row>
            )}
            <Slider label="Floors" value={b.floors} min={0} max={60} onChange={(floors) => edit(b.id, { floors })} />
            <Row>
              <Num label="Floor-to-floor" value={b.fh} onChange={(fh) => edit(b.id, { fh })} unit="m" min={2} max={10} />
              <Num label="Starts at height" value={b.base} onChange={(base) => edit(b.id, { base })} unit="m" min={0} />
            </Row>
            <Row>
              <Num label="Centre x" value={b.x} onChange={(x) => edit(b.id, { x })} unit="m" />
              <Num label="Centre y" value={b.y} onChange={(y) => edit(b.id, { y })} unit="m" />
            </Row>
            <Slider label="Rotation" value={b.rot} min={-90} max={90} unit="°" onChange={(rot) => edit(b.id, { rot })} />
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Gross floor area" value={`${num(t.gfa, 0)} m²`} sub={`${num(t.countedGfa, 0)} m² counts toward FAR`} />
          <Stat label="FAR" value={num(far, 2)} sub={`limit ${site.far} · ${far <= site.far ? `${num((site.far - far) * siteArea, 0)} m² left` : 'over'}`} tone={far <= site.far ? 'good' : 'bad'} />
          <Stat label="Site coverage" value={pct(cov.union / siteArea, 0)} sub={`${num(cov.union, 0)} of ${num(siteArea, 0)} m² · limit ${pct(site.maxCov, 0)}`} tone={cov.union / siteArea <= site.maxCov ? 'good' : 'bad'} />
          <Stat label="Tallest point" value={`${num(t.maxHeight, 1)} m`} sub={`limit ${site.maxH} m`} tone={t.maxHeight <= site.maxH ? 'good' : 'bad'} />
        </Stats>
        <Panel title="3D massing" actions={<Btn onClick={() => set({ blocks: [...s.blocks, blk({ name: `Block ${s.blocks.length + 1}` })] })}>+ Block</Btn>}>
          <View3D refEl={ref} height={430} />
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit, scroll to zoom. Yellow line = setback; faint red plane = height limit. Lines mark each floor.</p>
        </Panel>
        {outside.length > 0 && <Note tone="warn">Outside the setback: {outside.map((x) => x.name).join(', ')}.</Note>}
        {cov.overlap > 1 && <Note>Ground-level blocks overlap by {num(cov.overlap, 0)} m²: overlapping floors are counted twice in GFA. Use “Starts at height” to stack blocks instead.</Note>}
        <Panel title="Blocks" actions={<><CsvButton name="massing.csv" rows={() => [['Block', 'Use', 'Footprint m2', 'Floors', 'Height m', 'GFA m2'], ...s.blocks.map((x) => [x.name, USES[x.use].label, +footprint(x).toFixed(1), x.floors, +(x.base + x.floors * x.fh).toFixed(1), +(footprint(x) * x.floors).toFixed(1)])]} /><JsonButtons name="massing.json" data={s} onLoad={(d) => d?.blocks && set(d)} /></>}>
          <Table
            head={['Block', 'Use', 'Footprint', 'Floors', 'Top', 'GFA']}
            rows={s.blocks.map((x) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: x.id === sel ? 700 : 400 }} onClick={() => setSel(x.id)}>{x.name}</button>,
              <span key="u"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: USES[x.use].color, marginRight: 4 }} />{USES[x.use].label}</span>,
              `${num(footprint(x), 0)} m²`, x.floors, `${num(x.base + x.floors * x.fh, 1)} m`, `${num(footprint(x) * x.floors, 0)} m²`,
            ])}
            foot={['Total', '', '', t.floorsTotal, '', `${num(t.gfa, 0)} m²`]}
          />
        </Panel>
        <Panel title="Area by use">
          <Donut slices={Object.entries(t.byUse).filter(([, v]) => v > 0).map(([k, v]) => ({ label: USES[k as Use].label, value: v, color: USES[k as Use].color }))} fv={(v) => `${num(v, 0)} m²`} center={<span>{num(t.gfa, 0)} m²</span>} />
          <Row>
            <Num label="Net-to-gross efficiency" value={Math.round(s.eff * 100)} onChange={(v) => set({ eff: v / 100 })} unit="%" min={30} max={100} />
            <Num label="Average flat size" value={s.unit} onChange={(unit) => set({ unit })} unit="m²" min={15} />
          </Row>
          <p>≈ <b>{num(resUnits, 0)}</b> residential units ({num(t.byUse.residential * s.eff, 0)} m² net). Parking is excluded from FAR here; check your local code.</p>
        </Panel>
      </div>
    </Split>
  )
}
