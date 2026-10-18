import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, Note, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { describe, gamutLines, lchToLab, linearToSrgb, linearToXyz, oklabToLinear, p3LinearToXyz, parseHex, position, srgbToLinear, toHex, type Space, type V3 } from './lib/color-space-explorer'

const oklchHex = (L: number, C: number, h: number) => toHex(linearToSrgb(oklabToLinear(lchToLab([L, C, h]))))

const PRESETS: Record<string, string> = {
  'Rainbow (HSL hues)': ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'].join('\n'),
  'Even OKLCH ramp': Array.from({ length: 9 }, (_, i) => oklchHex(0.3 + i * 0.07, 0.11, 260 - i * 22)).join('\n'),
  'Web UI palette': ['#1e293b', '#475569', '#94a3b8', '#e2e8f0', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].join('\n'),
  Pastels: ['#fbcfe8', '#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fecaca', '#fed7aa', '#a7f3d0'].join('\n'),
  'Earth tones': ['#3e2723', '#5d4037', '#8d6e63', '#a1887f', '#c2b280', '#6b8e23', '#556b2f', '#cd853f', '#d2691e', '#f5deb3'].join('\n'),
}

interface State {
  text: string
  space: Space
  srgb: boolean
  p3: boolean
  cloud: boolean
  size: number
}
const DEF: State = { text: PRESETS['Web UI palette'], space: 'oklab', srgb: true, p3: true, cloud: false, size: 1 }

const SPACES: [Space, string][] = [['oklab', 'OKLab'], ['lab', 'CIELAB'], ['hsl', 'HSL'], ['hsv', 'HSV'], ['rgb', 'RGB']]
const AXES: Record<Space, [string, string, string]> = {
  rgb: ['R →', 'G ↑', 'B'],
  hsl: ['hue 0° (red)', 'L ↑', 'S = radius'],
  hsv: ['hue 0° (red)', 'V ↑', 'S·V = radius'],
  oklab: ['+a (red)', 'L ↑', '+b (yellow)'],
  lab: ['+a* (red)', 'L* ↑', '+b* (yellow)'],
}

export default function ColorSpaceExplorer() {
  const [s, set, reset] = useToolState('color-space-explorer', DEF)
  const colors = useMemo(
    () =>
      s.text.split(/[\s,;]+/).filter(Boolean).map((t) => ({ t, rgb: parseHex(t) })),
    [s.text],
  )
  const good = colors.filter((c) => c.rgb).map((c) => ({ hex: toHex(c.rgb!), d: describe(c.rgb!) }))
  const bad = colors.filter((c) => !c.rgb).map((c) => c.t)
  const wideOk = s.space === 'oklab' || s.space === 'lab'

  const ref = useStage3D(
    () => {},
    (st) => {
      let g = st.scene.getObjectByName('cs') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'cs'
        st.scene.add(g)
      }
      st.clear(g)
      const P = (xyz: V3) => new THREE.Vector3(...position(s.space, xyz))
      const addLines = (lines: V3[][], col: number, op: number) => {
        const pts: THREE.Vector3[] = []
        for (const l of lines) for (let i = 0; i < l.length - 1; i++) pts.push(P(l[i]), P(l[i + 1]))
        g!.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })))
      }
      if (s.srgb) addLines(gamutLines(linearToXyz, 8), 0x94a3b8, 0.45)
      if (s.p3 && wideOk) addLines(gamutLines(p3LinearToXyz, 6), 0xf472b6, 0.35)
      if (s.cloud) {
        const n = 4000
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
        let seed = 7
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < n; i++) {
          const c: V3 = [rnd(), rnd(), rnd()]
          const p = position(s.space, linearToXyz(srgbToLinear(c)))
          pos.set(p, i * 3)
          col.set(srgbToLinear(c), i * 3)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.6 })))
      }
      // neutral axis
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(linearToXyz([0, 0, 0])), P(linearToXyz([1, 1, 1]))]), new THREE.LineBasicMaterial({ color: 0xffffff })))
      const sg = new THREE.SphereGeometry(0.09 * s.size, 20, 14)
      for (const c of good) {
        const m = new THREE.Mesh(sg.clone(), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c.d.lin) }))
        m.position.copy(P(c.d.xyz))
        g.add(m)
      }
      const [ax, ay, az] = AXES[s.space]
      const lx = label(ax, '#fca5a5', 0.28)
      lx.position.set(1.9, -2, 0)
      const ly = label(ay, '#e2e8f0', 0.28)
      ly.position.set(0.3, 2.15, 0)
      const lz = label(az, '#fde68a', 0.28)
      lz.position.set(0, -2, s.space === 'rgb' ? 1.9 : -1.9)
      g.add(lx, ly, lz)
    },
    [good.map((c) => c.hex).join(), s.space, s.srgb, s.p3, s.cloud, s.size],
    { camera: [3.4, 2.2, 4.2], grid: false },
  )

  const okDist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const steps = good.slice(1).map((c, i) => okDist(c.d.oklab, good[i].d.oklab))
  const meanStep = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0
  const cv = steps.length ? Math.sqrt(steps.reduce((a, b) => a + (b - meanStep) ** 2, 0) / steps.length) / (meanStep || 1) : 0
  const css = good.map((c) => `oklch(${(c.d.oklch[0] * 100).toFixed(1)}% ${c.d.oklch[1].toFixed(3)} ${c.d.oklch[2].toFixed(1)})`).join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Palette" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={8} mono placeholder="#ff8800, one per line" />
          {bad.length > 0 && <Note tone="warn">Ignored (not a hex colour): {bad.join(', ')}</Note>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Object.keys(PRESETS).map((k) => (
              <Btn key={k} onClick={() => set({ text: PRESETS[k] })}>{k}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="View">
          <Seg value={s.space} onChange={(space) => set({ space })} options={SPACES} />
          <div style={{ marginTop: 8 }}>
            <Check label="sRGB gamut boundary (grey wireframe)" value={s.srgb} onChange={(srgb) => set({ srgb })} />
            <Check label={`Display-P3 gamut (pink)${wideOk ? '' : ' — OKLab/CIELAB only'}`} value={s.p3} onChange={(p3) => set({ p3 })} />
            <Check label="Fill with 4,000 random sRGB colours" value={s.cloud} onChange={(cloud) => set({ cloud })} />
          </div>
          <Row>
            <Seg value={String(s.size)} onChange={(v) => set({ size: Number(v) })} options={[['0.6', 'Small dots'], ['1', 'Medium'], ['1.6', 'Large']]} />
          </Row>
        </Panel>
        <Panel title="Palette evenness (OKLab)">
          <Stats>
            <Stat label="Mean step ΔE_ok" value={num(meanStep, 3)} />
            <Stat label="Step variation" value={`${num(cv * 100, 0)} %`} tone={cv < 0.25 ? 'good' : 'bad'} sub="lower = more even" />
          </Stats>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Distances in OKLab track perceived difference; a ramp with similar steps looks evenly spaced. ΔE_ok ≈ 0.02 is about a just-noticeable difference.</p>
        </Panel>
      </div>
      <div>
        <Panel title={`${SPACES.find((x) => x[0] === s.space)![1]} space`}>
          <View3D refEl={ref} height={460} />
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {good.map((c, i) => <div key={i} title={c.hex} style={{ flex: 1, height: 26, background: c.hex, borderRadius: 4 }} />)}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Drag to orbit, scroll to zoom. The white line is the neutral (grey) axis from black to white.</p>
        </Panel>
        <Panel
          title="Coordinates"
          actions={
            <>
              <CopyButton text={css} label="Copy as oklch()" />
              <CsvButton name="palette-coordinates.csv" rows={() => [['hex', 'H', 'S', 'L', 'OK L', 'OK C', 'OK h', 'L*', 'a*', 'b*'], ...good.map((c) => [c.hex, ...c.d.hsl.map((v, i) => (i ? +(v * 100).toFixed(1) : +v.toFixed(1))), ...c.d.oklch.map((v) => +v.toFixed(4)), ...c.d.lab.map((v) => +v.toFixed(2))])]} />
            </>
          }
        >
          <Table
            head={['', 'Hex', 'HSL', 'HSV', 'OKLCH', 'CIELAB (D65)', 'XYZ']}
            rows={good.map((c) => [
              <span key="s" style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 5, background: c.hex, border: '1px solid var(--line)' }} />,
              <code key="h">{c.hex}</code>,
              `${num(c.d.hsl[0], 0)}° ${num(c.d.hsl[1] * 100, 0)}% ${num(c.d.hsl[2] * 100, 0)}%`,
              `${num(c.d.hsv[0], 0)}° ${num(c.d.hsv[1] * 100, 0)}% ${num(c.d.hsv[2] * 100, 0)}%`,
              `${num(c.d.oklch[0], 3)} ${num(c.d.oklch[1], 3)} ${num(c.d.oklch[2], 1)}°`,
              `${num(c.d.lab[0], 1)} ${num(c.d.lab[1], 1)} ${num(c.d.lab[2], 1)}`,
              `${num(c.d.xyz[0], 3)} ${num(c.d.xyz[1], 3)} ${num(c.d.xyz[2], 3)}`,
            ])}
          />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>All conversions are computed locally: sRGB → linear → XYZ (D65) → CIELAB / OKLab. Out-of-gamut P3 colours are only drawn in the perceptual spaces.</p>
        </Panel>
      </div>
    </Split>
  )
}
