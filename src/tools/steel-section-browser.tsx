import { Btn, Check, CsvButton, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { outline, props, SECTIONS, select, type Family, type Section, type SectionProps } from './lib/steel-section-browser'

type Units = 'si' | 'us'
interface State { families: Family[]; maxH: number; minI: number; minZ: number; maxMass: number; units: Units; sel: string; compare: string[] }
const DEF: State = { families: ['IPE', 'HEA', 'HEB', 'W'], maxH: 1000, minI: 8000, minZ: 0, maxMass: 0, units: 'si', sel: 'IPE 300', compare: ['IPE 300', 'HEA 260', 'HEB 240', 'W18x35'] }

const FAM: [Family, string][] = [['IPE', 'IPE (EU beams)'], ['HEA', 'HEA (EU wide flange, light)'], ['HEB', 'HEB (EU wide flange)'], ['W', 'W (US wide flange)']]

// unit helpers: SI tables use mm, cm², cm⁴, cm³, cm⁶, kg/m; US tables use in, in², in⁴, in³, in⁶, lb/ft
const U = {
  si: { L: ['mm', 1], A: ['cm²', 100], I: ['cm⁴', 1e4], W: ['cm³', 1e3], Iw: ['cm⁶', 1e6], m: ['kg/m', 1], r: ['mm', 1], s: ['m²/m', 1] },
  us: { L: ['in', 25.4], A: ['in²', 25.4 ** 2], I: ['in⁴', 25.4 ** 4], W: ['in³', 25.4 ** 3], Iw: ['in⁶', 25.4 ** 6], m: ['lb/ft', 1 / 0.671969], r: ['in', 25.4], s: ['ft²/ft', 0.3048] },
} as const
type Q = keyof (typeof U)['si']
const conv = (u: Units, q: Q, v: number) => v / U[u][q][1]
const unit = (u: Units, q: Q) => U[u][q][0]
const f = (u: Units, q: Q, v: number, d = 3) => num(conv(u, q, v), v / U[u][q][1] >= 1000 ? 0 : d)

function propRows(u: Units, s: Section, p: SectionProps): [string, string, string][] {
  const strong = u === 'si' ? 'y' : 'x', weak = u === 'si' ? 'z' : 'y'
  return [
    ['Depth h / d', f(u, 'L', s.h, 2), unit(u, 'L')], ['Flange width b', f(u, 'L', s.b, 2), unit(u, 'L')],
    ['Web thickness tw', f(u, 'L', s.tw, 3), unit(u, 'L')], ['Flange thickness tf', f(u, 'L', s.tf, 3), unit(u, 'L')], ['Root radius r', f(u, 'L', s.r, 2), unit(u, 'L')],
    ['Area A', f(u, 'A', p.A, 2), unit(u, 'A')], ['Mass', f(u, 'm', p.mass, 1), unit(u, 'm')],
    [`I${strong} (strong axis)`, f(u, 'I', p.Iy, 1), unit(u, 'I')], [`I${weak} (weak axis)`, f(u, 'I', p.Iz, 1), unit(u, 'I')],
    [`Wel,${strong} / S${strong === 'x' ? 'x' : ''}`, f(u, 'W', p.Wely, 1), unit(u, 'W')], [`Wel,${weak}`, f(u, 'W', p.Welz, 1), unit(u, 'W')],
    [`Wpl,${strong} / Z`, f(u, 'W', p.Wply, 1), unit(u, 'W')], [`Wpl,${weak}`, f(u, 'W', p.Wplz, 1), unit(u, 'W')],
    [`i${strong} (radius of gyration)`, f(u, 'r', p.iy, 2), unit(u, 'r')], [`i${weak}`, f(u, 'r', p.iz, 2), unit(u, 'r')],
    ['Torsion constant It / J', f(u, 'I', p.It, 2), unit(u, 'I')], ['Warping constant Iw / Cw', f(u, 'Iw', p.Iw, 0), unit(u, 'Iw')],
    ['Painting surface', num(u === 'si' ? p.surface : p.surface / 0.3048, 3), unit(u, 's')],
  ]
}

export default function SteelSectionBrowser() {
  const [s, set, reset] = useToolState('steel-section-browser', DEF)
  const u = s.units
  const list = select({ families: s.families, maxH: s.maxH * U[u].L[1], minIy: s.minI * U[u].I[1], minWply: s.minZ * U[u].W[1], maxMass: s.maxMass > 0 ? s.maxMass * U[u].m[1] : Infinity })
  const sec = SECTIONS.find((x) => x.name === s.sel) ?? SECTIONS[0]
  const p = props(sec)
  const cmp = s.compare.map((n) => SECTIONS.find((x) => x.name === n)).filter((x): x is Section => !!x)
  const toggleCmp = (n: string) => set({ compare: s.compare.includes(n) ? s.compare.filter((x) => x !== n) : [...s.compare, n].slice(-5) })

  const ref = useStage3D(
    (st: Stage3D) => { const g = new THREE.Group(); g.name = 'beam'; st.scene.add(g) },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('beam') as THREE.Group
      st.clear(g)
      const k = 4 / Math.max(sec.h, sec.b)
      const shape = new THREE.Shape(outline(sec, 8).map(([x, y]) => new THREE.Vector2((x - sec.b / 2) * k, (y - sec.h / 2) * k)))
      const len = 7
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false })
      geo.translate(0, 0, -len / 2)
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8b9bb4, metalness: 0.65, roughness: 0.38 }))
      mesh.rotation.y = Math.PI / 2
      mesh.position.y = (sec.h / 2) * k + 0.05
      g.add(mesh)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x1e293b }))
      edges.rotation.copy(mesh.rotation)
      edges.position.copy(mesh.position)
      g.add(edges)
      const lh = label(`h = ${f(u, 'L', sec.h, 1)} ${unit(u, 'L')}`, '#e2e8f0', 0.32)
      lh.position.set(len / 2 + 0.2, (sec.h / 2) * k, (sec.b / 2) * k + 0.9)
      const lb = label(`b = ${f(u, 'L', sec.b, 1)} ${unit(u, 'L')}`, '#e2e8f0', 0.32)
      lb.position.set(len / 2 + 0.2, sec.h * k + 0.4, 0)
      const ln = label(sec.name, '#fbbf24', 0.45)
      ln.position.set(-len / 2, sec.h * k + 0.6, 0)
      g.add(lh, lb, ln)
    },
    [sec, u],
    { camera: [6.5, 4.5, 6.5], target: [0, 1.6, 0] },
  )

  return (
    <>
      <Note tone="warn">Properties are computed from nominal dimensions (EN 10365 for IPE/HEA/HEB, AISC for W) with root fillets modelled. Verify against the manufacturer's or standard tables before design use.</Note>
      <Split>
        <div>
          <Panel title="Filter" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Seg value={u} onChange={(units) => set({ units, maxH: units === u ? s.maxH : units === 'us' ? Math.round(s.maxH / 25.4) : Math.round(s.maxH * 25.4), minI: 0, minZ: 0, maxMass: 0 })} options={[['si', 'SI (mm, cm)'], ['us', 'US (in, lb/ft)']]} />
            <div style={{ margin: '8px 0' }}>{FAM.map(([fm, l]) => <Check key={fm} label={l} value={s.families.includes(fm)} onChange={(v) => set({ families: v ? [...s.families, fm] : s.families.filter((x) => x !== fm) })} />)}</div>
            <Row>
              <Num label="Max depth" value={s.maxH} onChange={(maxH) => set({ maxH })} unit={unit(u, 'L')} min={0} />
              <Num label="Max mass (0 = any)" value={s.maxMass} onChange={(maxMass) => set({ maxMass })} unit={unit(u, 'm')} min={0} />
            </Row>
            <Row>
              <Num label="Min I (strong)" value={s.minI} onChange={(minI) => set({ minI })} unit={unit(u, 'I')} min={0} />
              <Num label="Min Wpl / Z (strong)" value={s.minZ} onChange={(minZ) => set({ minZ })} unit={unit(u, 'W')} min={0} />
            </Row>
            {list.length > 0 ? <Note tone="ok">Lightest match: <b>{list[0].name}</b> at {f(u, 'm', props(list[0]).mass, 1)} {unit(u, 'm')} <Btn kind="ghost" onClick={() => set({ sel: list[0].name })}>Show</Btn></Note> : <Note tone="err">No section meets these limits.</Note>}
          </Panel>
          <Panel title={`Sections (${list.length}, lightest first)`}>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <Table
                head={['Section', `h ${unit(u, 'L')}`, `Mass ${unit(u, 'm')}`, `I ${unit(u, 'I')}`, `Wpl ${unit(u, 'W')}`]}
                rows={list.map((x) => {
                  const q = props(x)
                  return [
                    <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" aria-label={`compare ${x.name}`} checked={s.compare.includes(x.name)} onChange={() => toggleCmp(x.name)} />
                      <button type="button" className="k-btn ghost" style={{ fontWeight: x.name === sec.name ? 800 : 500, color: x.name === sec.name ? 'var(--accent)' : undefined, padding: '2px 6px' }} onClick={() => set({ sel: x.name })}>{x.name}</button>
                    </span>,
                    f(u, 'L', x.h, 1), f(u, 'm', q.mass, 1), f(u, 'I', q.Iy, 0), f(u, 'W', q.Wply, 0),
                  ]
                })}
              />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Tick up to 5 sections to compare them below.</p>
          </Panel>
        </div>
        <div>
          <Stats>
            <Stat label="Section" value={sec.name} sub={FAM.find(([x]) => x === sec.family)?.[1]} />
            <Stat label="Mass" value={`${f(u, 'm', p.mass, 1)} ${unit(u, 'm')}`} sub={`A = ${f(u, 'A', p.A, 2)} ${unit(u, 'A')}`} tone="accent" />
            <Stat label="I strong" value={`${f(u, 'I', p.Iy, 0)}`} sub={unit(u, 'I')} />
            <Stat label="Wpl strong" value={`${f(u, 'W', p.Wply, 0)}`} sub={`${unit(u, 'W')} · shape factor ${num(p.Wply / p.Wely, 2)}`} />
          </Stats>
          <Panel title="3D profile">
            <View3D refEl={ref} height={340} />
          </Panel>
          <Panel title={`${sec.name} properties`} actions={<CsvButton name={`${sec.name.replace(/\s/g, '')}.csv`} rows={() => [['Property', 'Value', 'Unit'], ...propRows(u, sec, p)]} />}>
            <Table head={['Property', 'Value', 'Unit']} rows={propRows(u, sec, p)} />
            <p className="muted" style={{ fontSize: 12 }}>Steel density 7850 kg/m³. It uses the El Darwish–Johnston fillet approximation; Iw = Iz(h − tf)²/4.</p>
          </Panel>
        </div>
      </Split>
      {cmp.length > 0 && (
        <Panel title="Comparison" actions={<CsvButton name="section-comparison.csv" rows={() => [['Property', ...cmp.map((c) => c.name)], ...propRows(u, cmp[0], props(cmp[0])).map((r, i) => [`${r[0]} (${r[2]})`, ...cmp.map((c) => propRows(u, c, props(c))[i][1])])]} />}>
          <Table
            head={['Property', ...cmp.map((c) => c.name)]}
            rows={propRows(u, cmp[0], props(cmp[0])).map((r, i) => {
              const vals = cmp.map((c) => propRows(u, c, props(c))[i][1])
              const nums = vals.map((v) => Number(v.replace(/,/g, '')))
              const best = Math.max(...nums)
              return [`${r[0]} (${r[2]})`, ...vals.map((v, j) => <span key={j} style={{ fontWeight: nums[j] === best && i >= 7 ? 800 : 400 }}>{v}</span>)]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>Bold = highest stiffness/strength value in the row. Efficiency tip: compare Wpl per kg — deep IPE/W beams usually win in bending, HE sections in compression.</p>
          <Row>{cmp.map((c) => <span key={c.name} className="muted" style={{ fontSize: 13 }}>{c.name}: Wpl/mass = <b>{num(conv(u, 'W', props(c).Wply) / conv(u, 'm', props(c).mass), 2)}</b> {unit(u, 'W')} per {unit(u, 'm')}</span>)}</Row>
        </Panel>
      )}
    </>
  )
}
