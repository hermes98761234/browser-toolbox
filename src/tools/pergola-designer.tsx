import { useMemo } from 'react'
import { Btn, Check, CsvButton, Donut, money, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { concrete, cutList, layout, LUMBER, lumber, shade, type Member, type Params } from './lib/pergola-designer'

type Units = 'metric' | 'imperial'
const DEF = {
  units: 'imperial' as Units,
  currency: '$',
  p: {
    length: 3658, width: 3048, height: 2438, maxPostSpacing: 2438, post: '6x6', beam: '2x10', doubleBeam: true, beamOverhang: 457,
    rafter: '2x8', rafterSpacing: 406, rafterOverhang: 305, slats: true, slat: '2x2', slatSpacing: 152, braces: true, footingDepth: 914,
  } as Params,
  // price per linear foot (imperial) or metre (metric) is derived from price per metre stored here
  pricePerM: { '2x2': 1.6, '2x4': 2.6, '2x6': 4.1, '2x8': 5.6, '2x10': 7.5, '2x12': 9.8, '4x4': 6.2, '6x6': 15.5, '8x8': 29 } as Record<string, number>,
  bag: 6.5, postBase: 32, tie: 2.4,
}
const PRESETS: [string, Partial<Params>][] = [
  ['10×12 ft classic', { length: 3658, width: 3048, height: 2438 }],
  ['12×16 ft patio', { length: 4877, width: 3658, height: 2591 }],
  ['8×8 ft garden nook', { length: 2438, width: 2438, height: 2286, slats: false, braces: false }],
  ['Wide 4×6 m deck', { length: 6000, width: 4000, height: 2600, maxPostSpacing: 3000 }],
]
const WOOD: Record<Member['kind'], string> = { Post: '#a16207', Beam: '#b45309', Rafter: '#c2803a', Slat: '#d6a461', Brace: '#92400e' }

export default function PergolaDesigner() {
  const [s, set, reset] = useToolState('pergola-designer', DEF)
  const p = s.p
  const imp = s.units === 'imperial'
  const lu = imp ? 'ft' : 'm'
  const L = (mm: number) => (imp ? mm / 304.8 : mm / 1000) // mm → display long unit
  const fromL = (v: number) => (imp ? v * 304.8 : v * 1000)
  const S = (mm: number) => (imp ? mm / 25.4 : mm / 10) // mm → in / cm
  const fromS = (v: number) => (imp ? v * 25.4 : v * 10)
  const su = imp ? 'in' : 'cm'
  const fmtLen = (mm: number) => {
    if (!imp) return `${(mm / 1000).toFixed(3)} m`
    const inch = Math.round((mm / 25.4) * 8) / 8 // nearest 1/8″
    const ft = Math.floor(inch / 12)
    return `${ft}′ ${+(inch - ft * 12).toFixed(3)}″`
  }
  const m = (x: number) => money(x, s.currency, 2)
  const setP = (patch: Partial<Params>) => set({ p: { ...p, ...patch } })

  const members = useMemo(() => layout(p), [p])
  const rows = useMemo(() => cutList(members), [members])
  const posts = members.filter((x) => x.kind === 'Post').length
  const rafters = members.filter((x) => x.kind === 'Rafter').length
  const vol = concrete(posts, p.footingDepth)
  const bags = Math.ceil(vol / 0.012)
  const lumberCost = rows.reduce((a, r) => a + r.linear * (s.pricePerM[r.size] ?? 0), 0)
  const hw = { concrete: bags * s.bag, bases: posts * s.postBase, ties: rafters * 2 * s.tie }
  const total = lumberCost + hw.concrete + hw.bases + hw.ties
  const sh = shade(p)
  const area = ((p.length + 2 * p.beamOverhang) * (p.width + 2 * p.rafterOverhang)) / 1e6
  const clear = p.height
  const usedSizes = [...new Set(rows.map((r) => r.size))]
  const span = p.length / Math.max(1, Math.ceil(p.length / Math.max(500, p.maxPostSpacing)))

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
      const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: '#365314', roughness: 1 }))
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.002
      st.scene.add(ground)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const mats = Object.fromEntries(Object.entries(WOOD).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })]))
      for (const mb of members) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...(mb.s.map((v) => v / 1000) as [number, number, number])), mats[mb.kind])
        mesh.position.set(...(mb.c.map((v) => v / 1000) as [number, number, number]))
        if (mb.rot) mesh.rotation.set(...mb.rot)
        root.add(mesh)
      }
      // concrete footings
      const fm = new THREE.MeshStandardMaterial({ color: '#9ca3af' })
      for (const mb of members.filter((x) => x.kind === 'Post')) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20), fm)
        f.position.set(mb.c[0] / 1000, 0.03, mb.c[2] / 1000)
        root.add(f)
      }
    },
    [members],
    { camera: [5.5, 4.2, 6.5], target: [0, 1.4, 0], background: '#bae6fd', grid: false },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Size" actions={<Seg value={s.units} onChange={(units) => set({ units })} options={[['imperial', 'ft / in'], ['metric', 'm / cm']]} />}>
          <Row>
            {PRESETS.map(([n, v]) => (
              <Btn key={n} kind="ghost" onClick={() => setP(v)}>{n}</Btn>
            ))}
          </Row>
          <Row>
            <Num label="Length (post to post)" value={+L(p.length).toFixed(2)} onChange={(v) => setP({ length: fromL(v) })} unit={lu} min={0.5} />
            <Num label="Width (beam to beam)" value={+L(p.width).toFixed(2)} onChange={(v) => setP({ width: fromL(v) })} unit={lu} min={0.5} />
          </Row>
          <Row>
            <Num label="Post height" value={+L(p.height).toFixed(2)} onChange={(v) => setP({ height: fromL(v) })} unit={lu} min={1} />
            <Num label="Max post spacing" value={+L(p.maxPostSpacing).toFixed(2)} onChange={(v) => setP({ maxPostSpacing: fromL(v) })} unit={lu} min={0.5} />
          </Row>
        </Panel>
        <Panel title="Members">
          <Row>
            <Select label="Posts" value={p.post} onChange={(post) => setP({ post })} options={LUMBER.filter((l) => l.t >= 89).map((l) => [l.id, l.name] as const)} />
            <Select label="Beams" value={p.beam} onChange={(beam) => setP({ beam })} options={LUMBER.filter((l) => l.t < 89 && l.w >= 140).map((l) => [l.id, l.name] as const)} />
          </Row>
          <Check label="Doubled beams (one each side of the post)" value={p.doubleBeam} onChange={(doubleBeam) => setP({ doubleBeam })} />
          <Row>
            <Select label="Rafters" value={p.rafter} onChange={(rafter) => setP({ rafter })} options={LUMBER.filter((l) => l.t < 89 && l.w >= 89).map((l) => [l.id, l.name] as const)} />
            <Num label="Rafter spacing (o.c.)" value={+S(p.rafterSpacing).toFixed(1)} onChange={(v) => setP({ rafterSpacing: fromS(v) })} unit={su} min={imp ? 4 : 10} />
          </Row>
          <Row>
            <Num label="Beam overhang (each end)" value={+S(p.beamOverhang).toFixed(1)} onChange={(v) => setP({ beamOverhang: fromS(v) })} unit={su} min={0} />
            <Num label="Rafter overhang (each side)" value={+S(p.rafterOverhang).toFixed(1)} onChange={(v) => setP({ rafterOverhang: fromS(v) })} unit={su} min={0} />
          </Row>
          <Check label="Top slats / purlins for extra shade" value={p.slats} onChange={(slats) => setP({ slats })} />
          {p.slats && (
            <Row>
              <Select label="Slats" value={p.slat} onChange={(slat) => setP({ slat })} options={LUMBER.filter((l) => l.t < 89 && l.w <= 89).map((l) => [l.id, l.name] as const)} />
              <Num label="Slat spacing (o.c.)" value={+S(p.slatSpacing).toFixed(1)} onChange={(v) => setP({ slatSpacing: fromS(v) })} unit={su} min={imp ? 2 : 5} />
            </Row>
          )}
          <Check label="45° knee braces (4×4)" value={p.braces} onChange={(braces) => setP({ braces })} />
          <Num label="Footing depth (post in ground)" value={+S(p.footingDepth).toFixed(1)} onChange={(v) => setP({ footingDepth: fromS(v) })} unit={su} min={0} hint="Frost line or at least ⅓ of the above-ground height. Post cut length includes this." />
        </Panel>
        <Panel title="Prices" actions={<Btn kind="ghost" onClick={reset}>Reset all</Btn>}>
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'C$', 'A$', '₴', 'zł']} />
          </Row>
          <Row>
            {usedSizes.map((id) => (
              <Num key={id} label={`${lumber(id).name.split(' ')[0]} per ${lu}`} value={+(imp ? (s.pricePerM[id] ?? 0) * 0.3048 : s.pricePerM[id] ?? 0).toFixed(2)} onChange={(v) => set({ pricePerM: { ...s.pricePerM, [id]: imp ? v / 0.3048 : v } })} unit={s.currency} min={0} />
            ))}
          </Row>
          <Row>
            <Num label="Concrete bag (25 kg)" value={s.bag} onChange={(bag) => set({ bag })} unit={s.currency} min={0} />
            <Num label="Post base / anchor" value={s.postBase} onChange={(postBase) => set({ postBase })} unit={s.currency} min={0} />
            <Num label="Rafter tie" value={s.tie} onChange={(tie) => set({ tie })} unit={s.currency} min={0} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated cost" value={m(total)} tone="accent" sub={`${m(total / (imp ? area * 10.7639 : area))} per ${imp ? 'ft²' : 'm²'}`} />
          <Stat label="Footprint (with overhangs)" value={imp ? `${(area * 10.7639).toFixed(0)} ft²` : `${area.toFixed(1)} m²`} />
          <Stat label="Overhead shade" value={pct(sh, 0)} sub="sun directly overhead" />
          <Stat label="Posts · rafters" value={`${posts} · ${rafters}`} sub={`post span ${fmtLen(span)}`} />
        </Stats>
        <Panel title="3D model">
          <View3D refEl={ref} height={430} />
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit, scroll to zoom. Headroom under the beams: {fmtLen(clear)}.</p>
          {span > 3048 && <Note tone="warn">Post spacing of {fmtLen(span)} is long for {lumber(p.beam).name.split(' ')[0]} beams — check span tables or add posts / use deeper beams.</Note>}
          {p.rafterOverhang > 600 && <Note tone="warn">Rafter overhangs beyond ~600 mm (2 ft) tend to sag; consider deeper rafters.</Note>}
        </Panel>
        <Panel title="Cut list & lumber to buy" actions={<CsvButton name="pergola-cut-list.csv" rows={() => [['Member', 'Size', 'Qty', 'Cut length (mm)', 'Stock length (mm)', 'Boards to buy', `Cost (${s.currency})`], ...rows.map((r) => [r.kind, r.size, r.qty, r.len, r.stock, r.pieces, +(r.linear * (s.pricePerM[r.size] ?? 0)).toFixed(2)])]} />}>
          <Table
            head={['Member', 'Size', 'Qty', 'Cut length', 'Buy', 'Cost']}
            rows={rows.map((r) => [r.kind, lumber(r.size).name.split(' ')[0], r.qty, fmtLen(r.len), `${r.pieces} × ${imp ? `${Math.round(r.stock / 304.8)} ft` : `${(r.stock / 1000).toFixed(2)} m`}`, m(r.linear * (s.pricePerM[r.size] ?? 0))])}
            foot={['Lumber', '', rows.reduce((a, r) => a + r.qty, 0), '', `${rows.reduce((a, r) => a + r.pieces, 0)} boards`, m(lumberCost)]}
          />
          <Table
            head={['Hardware & concrete', 'Qty', 'Cost']}
            rows={[
              [`Concrete (${imp ? `${(vol * 35.315).toFixed(1)} ft³` : `${vol.toFixed(2)} m³`}, Ø300 mm holes)`, `${bags} bags`, m(hw.concrete)],
              ['Post bases / anchors', posts, m(hw.bases)],
              ['Rafter ties (2 per rafter)', rafters * 2, m(hw.ties)],
            ]}
            foot={['Total', '', m(total)]}
          />
          <p className="muted" style={{ fontSize: 13 }}>Stock lengths 8–20 ft; several short cuts are nested on one board where they fit (5 mm kerf). Members longer than 20 ft are spliced over a post.</p>
        </Panel>
        <Panel title="Cost breakdown">
          <Donut
            slices={[...usedSizes.map((id) => ({ label: `Lumber ${id}`, value: rows.filter((r) => r.size === id).reduce((a, r) => a + r.linear * (s.pricePerM[id] ?? 0), 0) })), { label: 'Concrete', value: hw.concrete }, { label: 'Hardware', value: hw.bases + hw.ties }]}
            fv={m}
            center={<span>{m(total)}</span>}
          />
        </Panel>
      </div>
    </Split>
  )
}
