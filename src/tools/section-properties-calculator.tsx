import { useMemo } from 'react'
import { Area, Btn, CsvButton, Legend, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { contoursToText, parseContours, PRESETS, sectionProps, type P } from './lib/section-properties-calculator'

type Src = 'preset' | 'custom'
interface State {
  src: Src
  preset: string
  vals: Record<string, number>
  text: string
  unit: string
}

const defVals = (id: string) => Object.fromEntries((PRESETS.find((p) => p.id === id) ?? PRESETS[0]).params.map(([k, , d]) => [k, d]))
const DEF: State = { src: 'preset', preset: 'ibeam', vals: defVals('ibeam'), text: contoursToText(PRESETS[0].build(defVals('ibeam'))), unit: 'mm' }

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n: number) => (n < 0 ? '⁻' : '') + String(Math.abs(n)).split('').map((d) => SUP[+d]).join('')
/** Engineering-style number: 1.234 ×10⁶ for big/small values. */
function fe(v: number, d = 4) {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 1e5 || a < 1e-2) {
    const e = Math.floor(Math.log10(a) / 3) * 3
    return `${(v / 10 ** e).toPrecision(d)} ×10${sup(e)}`
  }
  return String(+v.toPrecision(d + 1))
}

function inside(p: P, poly: P[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export default function SectionPropertiesCalculator() {
  const [s, set, reset] = useToolState('section-properties-calculator', DEF)
  const preset = PRESETS.find((p) => p.id === s.preset) ?? PRESETS[0]
  const parsed = useMemo(() => (s.src === 'preset' ? { contours: preset.build({ ...defVals(preset.id), ...s.vals }), errors: [] as string[] } : parseContours(s.text)), [s.src, s.text, s.vals, preset])
  const cs = parsed.contours
  const r = useMemo(() => sectionProps(cs), [cs])
  const u = s.unit

  const ref = useStage3D(
    () => {},
    (st) => {
      let g = st.scene.getObjectByName('sec') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'sec'
        st.scene.add(g)
      }
      st.clear(g)
      if (!r) return
      const span = Math.max(r.xmax - r.xmin, r.ymax - r.ymin) || 1
      const k = 4 / span
      const tx = (p: P) => new THREE.Vector2((p[0] - r.cx) * k, (p[1] - r.cy) * k)
      const solids = cs.filter((c) => !c.hole)
      const holes = cs.filter((c) => c.hole)
      const len = 7
      for (const sc of solids) {
        const shape = new THREE.Shape(sc.pts.map(tx))
        for (const h of holes) if (inside(h.pts[0], sc.pts)) shape.holes.push(new THREE.Path(h.pts.map(tx)))
        const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 4 })
        geo.translate(0, 0, -len / 2)
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.55, roughness: 0.4, transparent: true, opacity: 0.85 })))
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x334155 })))
      }
      // centroidal (neutral) axis along the member and principal axes on the front face
      const axis = (a: THREE.Vector3, b: THREE.Vector3, c: number) => {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: c, depthTest: false }))
        l.renderOrder = 3
        g!.add(l)
      }
      axis(new THREE.Vector3(0, 0, -len / 2 - 1), new THREE.Vector3(0, 0, len / 2 + 1), 0xfacc15)
      const f = len / 2 + 0.01, L = 3
      const c1 = Math.cos(r.theta), s1 = Math.sin(r.theta)
      axis(new THREE.Vector3(-L * c1, -L * s1, f), new THREE.Vector3(L * c1, L * s1, f), 0xef4444)
      axis(new THREE.Vector3(L * s1, -L * c1, f), new THREE.Vector3(-L * s1, L * c1, f), 0x0ea5e9)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false }))
      dot.position.set(0, 0, f)
      dot.renderOrder = 4
      g.add(dot)
      const lb = label('centroid', '#facc15', 0.35)
      lb.position.set(0.9, 0.3, f)
      g.add(lb)
      const l1 = label('1 (major)', '#ef4444', 0.32)
      l1.position.set(L * c1 * 1.1, L * s1 * 1.1 + 0.2, f)
      g.add(l1)
      const l2 = label('2 (minor)', '#0ea5e9', 0.32)
      l2.position.set(-L * s1 * 1.1, L * c1 * 1.1 + 0.2, f)
      g.add(l2)
    },
    [cs, r],
    { camera: [4.5, 2.8, 6], grid: false },
  )

  // 2-D drawing
  const svg = useMemo(() => {
    if (!r) return null
    const W = 360, H = 300, pad = 30
    const sx = (W - 2 * pad) / (r.xmax - r.xmin || 1), sy = (H - 2 * pad) / (r.ymax - r.ymin || 1)
    const k = Math.min(sx, sy)
    const ox = (W - (r.xmax - r.xmin) * k) / 2, oy = (H - (r.ymax - r.ymin) * k) / 2
    const X = (x: number) => ox + (x - r.xmin) * k
    const Y = (y: number) => H - oy - (y - r.ymin) * k
    const d = cs.map((c) => c.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('') + 'Z').join('')
    const c1 = Math.cos(r.theta), s1 = Math.sin(r.theta), L = 140
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 320 }} role="img" aria-label="cross section">
        <path d={d} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth={1.5} fillRule="evenodd" />
        <line x1={0} x2={W} y1={Y(r.cy)} y2={Y(r.cy)} stroke="var(--muted)" strokeDasharray="5 4" />
        <line y1={0} y2={H} x1={X(r.cx)} x2={X(r.cx)} stroke="var(--muted)" strokeDasharray="5 4" />
        {Math.abs(r.pnaY - r.cy) > (r.ymax - r.ymin) * 0.005 && <line x1={0} x2={W} y1={Y(r.pnaY)} y2={Y(r.pnaY)} stroke="#10b981" strokeDasharray="2 3" />}
        <line x1={X(r.cx) - L * c1} y1={Y(r.cy) + L * s1} x2={X(r.cx) + L * c1} y2={Y(r.cy) - L * s1} stroke="#ef4444" />
        <line x1={X(r.cx) + L * s1} y1={Y(r.cy) + L * c1} x2={X(r.cx) - L * s1} y2={Y(r.cy) - L * c1} stroke="#0ea5e9" />
        <circle cx={X(r.cx)} cy={Y(r.cy)} r={5} fill="#facc15" stroke="#000" strokeWidth={0.6} />
        <text x={X(r.cx) + 8} y={Y(r.cy) - 8} fontSize={12} fill="var(--text)">C ({fe(r.cx, 3)}, {fe(r.cy, 3)})</text>
      </svg>
    )
  }, [r, cs])

  const rows: [string, string, string][] = r
    ? [
        ['Area A', fe(r.A), `${u}²`],
        ['Centroid x̄', fe(r.cx), u],
        ['Centroid ȳ', fe(r.cy), u],
        ['Ix (centroidal)', fe(r.Ix), `${u}⁴`],
        ['Iy (centroidal)', fe(r.Iy), `${u}⁴`],
        ['Ixy (product)', fe(Math.abs(r.Ixy) < 1e-9 * r.J ? 0 : r.Ixy), `${u}⁴`],
        ['Polar Ip = Ix + Iy', fe(r.J), `${u}⁴`],
        ['I₁ (major principal)', fe(r.I1), `${u}⁴`],
        ['I₂ (minor principal)', fe(r.I2), `${u}⁴`],
        ['Principal angle θ', ((r.theta * 180) / Math.PI).toFixed(2), '° from x'],
        ['Radius of gyration rx', fe(r.rx), u],
        ['Radius of gyration ry', fe(r.ry), u],
        ['Sx top / bottom', `${fe(r.SxTop)} / ${fe(r.SxBot)}`, `${u}³`],
        ['Sy left / right', `${fe(r.SyLeft)} / ${fe(r.SyRight)}`, `${u}³`],
        ['Plastic modulus Zx', fe(r.Zx), `${u}³`],
        ['Plastic modulus Zy', fe(r.Zy), `${u}³`],
        ['Shape factor Zx / Sx,min', (r.Zx / Math.min(r.SxTop, r.SxBot)).toFixed(3), ''],
        ['Plastic neutral axis y', fe(r.pnaY), u],
      ]
    : []

  return (
    <Split>
      <div>
        <Panel title="Cross section" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg
            value={s.src}
            onChange={(src) => set(src === 'custom' && s.src === 'preset' ? { src, text: contoursToText(cs) } : { src })}
            options={[['preset', 'Standard shape'], ['custom', 'Custom polygon']]}
          />
          <div style={{ height: 10 }} />
          {s.src === 'preset' ? (
            <>
              <Select label="Shape" value={s.preset} onChange={(preset) => set({ preset, vals: defVals(preset) })} options={PRESETS.map((p) => [p.id, p.name] as const)} />
              <Row>
                {preset.params.map(([k, lab]) => (
                  <Num key={preset.id + k} label={lab} value={s.vals[k] ?? defVals(preset.id)[k]} onChange={(v) => set({ vals: { ...s.vals, [k]: v } })} unit={u} min={0} />
                ))}
              </Row>
            </>
          ) : (
            <>
              <Area value={s.text} onChange={(text) => set({ text })} rows={12} mono />
              <Note>One “x, y” vertex per line. A blank line starts a new contour; put the word <b>hole</b> on its own line before a contour to subtract it. Point order (CW/CCW) does not matter.</Note>
              {parsed.errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
            </>
          )}
          <Select label="Length unit" value={u} onChange={(unit) => set({ unit })} options={['mm', 'cm', 'm', 'in', 'ft']} />
        </Panel>
        <Panel title="Section drawing">
          {svg ?? <Note tone="warn">Enter a closed polygon with positive area.</Note>}
          <Legend items={[['centroid', '#facc15'], ['major axis 1', '#ef4444'], ['minor axis 2', '#0ea5e9'], ['plastic NA', '#10b981']]} />
        </Panel>
      </div>
      <div>
        {r && (
          <Stats>
            <Stat label="Area" value={`${fe(r.A, 3)} ${u}²`} />
            <Stat label="Ix" value={`${fe(r.Ix, 3)} ${u}⁴`} tone="accent" />
            <Stat label="Iy" value={`${fe(r.Iy, 3)} ${u}⁴`} />
            <Stat label="Zx" value={`${fe(r.Zx, 3)} ${u}³`} sub="plastic modulus" />
          </Stats>
        )}
        <Panel title="Extruded member">
          <View3D refEl={ref} height={340} />
        </Panel>
        <Panel title="Properties" actions={r && <CsvButton name="section-properties.csv" rows={() => [['Property', 'Value', 'Unit'], ...rows.map((x) => [x[0], x[1].replace(/ ×10(\S+)/, (_, e: string) => 'e' + [...e].map((c) => (c === '⁻' ? '-' : SUP.indexOf(c))).join('')), x[2]])]} />}>
          <Table head={['Property', 'Value', 'Unit']} rows={rows.map((x) => [x[0], <b key="v">{x[1]}</b>, x[2]])} />
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Computed exactly for the polygon by Green’s theorem (boundary integrals), so curved shapes are approximated by their vertices. Plastic moduli assume a homogeneous material and use the equal-area axis.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
