import { useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { castOn, colourShare, fitRepeat, longestFloat, parseRows, PRESETS, type Chart } from './lib/knit-garment-preview'

const COLOURWAYS: [string, string[]][] = [
  ['Nordic', ['#e8e2d4', '#1e3a5f', '#b91c1c', '#d4a017']],
  ['Shetland', ['#5b4636', '#e9dcc0', '#8a9a5b', '#c2703d']],
  ['Ocean', ['#f1f5f9', '#0f4c75', '#3282b8', '#bbe1fa']],
  ['Berry', ['#2d1b2e', '#f4d6e0', '#b5405f', '#e8b04b']],
  ['Monochrome', ['#f5f5f4', '#292524', '#78716c', '#d6d3d1']],
]

const DEF = {
  preset: 'peerie',
  chart: parseRows(PRESETS.peerie.rows) as Chart,
  colours: COLOURWAYS[0][1],
  rib: 1,
  sts: 25,
  rows: 30,
  chest: 96,
  length: 62,
  sleeve: 48,
  patternSleeves: true,
  spin: true,
}

/** Paints one chart repeat as knit "V" stitches. */
function stitchCanvas(chart: Chart, colours: string[], cw = 24, ch = 20): HTMLCanvasElement {
  const H = chart.length, W = chart[0]?.length ?? 1
  const c = document.createElement('canvas')
  c.width = W * cw
  c.height = H * ch
  const g = c.getContext('2d')!
  for (let r = 0; r < H; r++)
    for (let k = 0; k < W; k++) {
      const col = colours[chart[r][k]] ?? colours[0]
      const x = k * cw, y = r * ch
      g.fillStyle = shade(col, -0.35)
      g.fillRect(x, y, cw, ch)
      for (const side of [-1, 1]) {
        g.save()
        g.translate(x + cw / 2 + side * cw * 0.2, y + ch * 0.55)
        g.rotate(side * -0.55)
        const grad = g.createLinearGradient(-cw * 0.2, 0, cw * 0.2, 0)
        grad.addColorStop(0, shade(col, side < 0 ? -0.05 : 0.12))
        grad.addColorStop(1, shade(col, side < 0 ? 0.12 : -0.08))
        g.fillStyle = grad
        g.beginPath()
        g.ellipse(0, 0, cw * 0.2, ch * 0.62, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
    }
  return c
}

function ribCanvas(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = shade(colour, -0.45)
  g.fillRect(0, 0, 64, 32)
  for (const x of [0, 16]) {
    g.fillStyle = shade(colour, 0.05)
    g.fillRect(x + 2, 0, 12, 32)
    g.fillStyle = shade(colour, 0.18)
    g.fillRect(x + 5, 0, 4, 32)
  }
  return c
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

export default function KnitGarmentPreview() {
  const [s, set, reset] = useToolState('knit-garment-preview', DEF)
  const [brush, setBrush] = useState(1)
  const painting = useRef(false)
  const chart = s.chart.length && s.chart[0]?.length ? s.chart : DEF.chart
  const H = chart.length, W = chart[0].length
  const bodySts = castOn(s.chest, s.sts)
  const fit = fitRepeat(bodySts, W)
  const share = useMemo(() => colourShare(chart, 4), [chart])
  const float = useMemo(() => longestFloat(chart), [chart])
  const floatCm = (float * 10) / s.sts

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      stage.onFrame((_, dt) => {
        if (root.userData.spin) root.rotation.y += dt * 0.35
      })
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      root.userData.spin = s.spin
      const U = 0.1 // scene units per cm
      const R = (s.chest / (2 * Math.PI)) * U
      const L = s.length * U
      const base = new THREE.CanvasTexture(stitchCanvas(chart, s.colours))
      base.colorSpace = THREE.SRGBColorSpace
      base.anisotropy = 8
      const tex = (around: number, tall: number) => {
        const t = base.clone()
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(Math.max(1, Math.round((around * s.sts) / 10 / W)), (tall * s.rows) / 10 / H)
        t.needsUpdate = true
        return t
      }
      const plain = (around: number, tall: number) => {
        const t = new THREE.CanvasTexture(stitchCanvas([[0]], s.colours))
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(Math.round((around * s.sts) / 10), (tall * s.rows) / 10)
        return t
      }
      const ribCol = s.colours[s.rib] ?? s.colours[0]
      const ribTex = (around: number) => {
        const t = new THREE.CanvasTexture(ribCanvas(ribCol))
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(Math.round((around * s.sts) / 10 / 4), 2)
        return t
      }
      const mat = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide })
      const ribH = 6 * U
      // body: lathe profile from hem up to the neckline
      const neckR = R * 0.42
      const prof = [[R * 0.97, 0], [R, L * 0.25], [R, L * 0.8], [R * 0.97, L * 0.9], [R * 0.8, L * 0.97], [neckR * 1.15, L]].map(([x, y]) => new THREE.Vector2(x, y))
      const bodyGeo = new THREE.LatheGeometry(prof, 72)
      const torso = new THREE.Group()
      torso.scale.z = 0.62
      torso.add(new THREE.Mesh(bodyGeo, mat(tex(s.chest, s.length))))
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, R * 0.93, ribH, 72, 1, true), mat(ribTex(s.chest)))
      hem.position.y = -ribH / 2
      torso.add(hem)
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.08, neckR * 1.15, 3 * U, 48, 1, true), mat(ribTex(2 * Math.PI * neckR / U)))
      neck.position.y = L + 1.5 * U
      torso.add(neck)
      root.add(torso)
      // sleeves: tapered tubes hanging from the shoulders
      const upper = s.chest * 0.36, cuff = s.chest * 0.22
      const sl = s.sleeve * U
      for (const side of [-1, 1]) {
        const arm = new THREE.Group()
        arm.position.set(side * R * 0.9, L * 0.86, 0)
        arm.rotation.z = side * 0.42
        const sleeveMat = s.patternSleeves ? mat(tex((upper + cuff) / 2, s.sleeve)) : mat(plain((upper + cuff) / 2, s.sleeve))
        const tube = new THREE.Mesh(new THREE.CylinderGeometry((upper / (2 * Math.PI)) * U, (cuff / (2 * Math.PI)) * U, sl, 48, 1, true), sleeveMat)
        tube.position.y = -sl / 2
        arm.add(tube)
        const cuffMesh = new THREE.Mesh(new THREE.CylinderGeometry((cuff / (2 * Math.PI)) * U, (cuff / (2 * Math.PI)) * U * 0.92, ribH, 40, 1, true), mat(ribTex(cuff)))
        cuffMesh.position.y = -sl - ribH / 2
        arm.add(cuffMesh)
        const cap = new THREE.Mesh(new THREE.SphereGeometry((upper / (2 * Math.PI)) * U, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(tex(upper, upper / 2)))
        arm.add(cap)
        root.add(arm)
      }
      root.position.y = -L / 2 + 0.3
      base.dispose()
    },
    [chart, s.colours, s.rib, s.sts, s.rows, s.chest, s.length, s.sleeve, s.patternSleeves, s.spin],
    { camera: [0, 1, 10.5], target: [0, 0.3, 0], grid: false, background: '#1e293b' },
  )

  const paint = (r: number, c: number) => {
    if (chart[r][c] === brush) return
    set({ chart: chart.map((row, i) => (i === r ? row.map((v, j) => (j === c ? brush : v)) : row)) })
  }
  const resize = (w: number, h: number) => {
    w = Math.max(2, Math.min(40, Math.round(w)))
    h = Math.max(2, Math.min(40, Math.round(h)))
    set({ chart: Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => chart[r % H][c % W])) })
  }
  const cell = Math.max(12, Math.min(26, Math.floor(340 / Math.max(W, H))))

  return (
    <Split wide="right">
      <div>
        <Panel title="Chart" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Motif" value={s.preset} onChange={(preset) => set({ preset, chart: parseRows(PRESETS[preset].rows) })} options={Object.entries(PRESETS).map(([k, v]) => [k, v.name] as [string, string])} />
          <Row>
            {s.colours.map((c, i) => (
              <label key={i} style={{ display: 'grid', justifyItems: 'center', gap: 2, cursor: 'pointer' }}>
                <button type="button" onClick={() => setBrush(i)} aria-label={`Paint colour ${i + 1}`} style={{ width: 36, height: 36, borderRadius: 8, background: c, border: brush === i ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />
                <input type="color" value={c} onChange={(e) => set({ colours: s.colours.map((x, j) => (j === i ? e.target.value : x)) })} style={{ width: 36, height: 18, padding: 0, border: 0, background: 'none' }} aria-label={`Edit colour ${i + 1}`} />
                <small className="muted">{i === 0 ? 'MC' : `CC${i}`} {Math.round(share[i] * 100)}%</small>
              </label>
            ))}
          </Row>
          <div style={{ overflowX: 'auto', margin: '10px 0', touchAction: 'none' }} onPointerUp={() => (painting.current = false)} onPointerLeave={() => (painting.current = false)}>
            <svg width={W * cell + 24} height={H * cell + 16} style={{ display: 'block', userSelect: 'none' }}>
              {chart.map((row, r) =>
                row.map((v, c) => (
                  <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell - 1} height={cell - 1} fill={s.colours[v] ?? s.colours[0]} stroke="#0002"
                    onPointerDown={(e) => { (e.target as Element).releasePointerCapture?.(e.pointerId); painting.current = true; paint(r, c) }}
                    onPointerEnter={() => painting.current && paint(r, c)} style={{ cursor: 'crosshair' }} />
                )),
              )}
              {chart.map((_, r) => <text key={`r${r}`} x={W * cell + 4} y={r * cell + cell * 0.7} fontSize={9} fill="var(--muted)">{H - r}</text>)}
              {chart[0].map((_, c) => (W - c) % 2 === 0 || c === 0 ? <text key={`c${c}`} x={c * cell + cell / 2} y={H * cell + 11} fontSize={9} fill="var(--muted)" textAnchor="middle">{W - c}</text> : null)}
            </svg>
          </div>
          <Row>
            <Num label="Repeat width" value={W} onChange={(w) => resize(w, H)} unit="sts" min={2} max={40} step={1} />
            <Num label="Repeat height" value={H} onChange={(h) => resize(W, h)} unit="rows" min={2} max={40} step={1} />
          </Row>
          <Row>
            <Btn onClick={() => set({ chart: chart.map((r) => [...r].reverse()) })}>⇋ Mirror</Btn>
            <Btn onClick={() => set({ chart: [...chart].reverse() })}>⇵ Flip</Btn>
            <Btn onClick={() => set({ chart: chart.map((r) => [r[r.length - 1], ...r.slice(0, -1)]) })}>→ Shift</Btn>
            <Btn kind="ghost" onClick={() => set({ chart: chart.map((r) => r.map(() => 0)) })}>Clear</Btn>
          </Row>
        </Panel>
        <Panel title="Colourway">
          <Row>
            {COLOURWAYS.map(([n, cs]) => (
              <Btn key={n} onClick={() => set({ colours: cs })}>
                <span style={{ display: 'inline-flex', gap: 2, marginRight: 6 }}>{cs.map((c) => <i key={c} style={{ width: 10, height: 10, background: c, borderRadius: 2, display: 'inline-block' }} />)}</span>{n}
              </Btn>
            ))}
          </Row>
          <Select label="Ribbing colour" value={s.rib} onChange={(rib) => set({ rib })} options={[[0, 'MC'], [1, 'CC1'], [2, 'CC2'], [3, 'CC3']]} />
        </Panel>
      </div>
      <div>
        <Panel title="3D preview">
          <View3D refEl={ref} height={460} />
          <Row>
            <Check label="Auto-rotate" value={s.spin} onChange={(spin) => set({ spin })} />
            <Check label="Pattern on sleeves" value={s.patternSleeves} onChange={(patternSleeves) => set({ patternSleeves })} />
          </Row>
        </Panel>
        <Stats>
          <Stat label="Body cast-on" value={`${bodySts} sts`} sub={`${s.chest} cm at ${s.sts} sts/10 cm`} />
          <Stat label="Repeats around" value={fit.exact ? fit.repeats : fit.repeats.toFixed(2)} tone={fit.exact ? 'good' : 'bad'} sub={fit.exact ? 'fits exactly' : `use ${fit.lower} or ${fit.upper} sts`} />
          <Stat label="Body rows" value={Math.round((s.length * s.rows) / 10)} sub={`${((s.length * s.rows) / 10 / H).toFixed(1)} vertical repeats`} />
          <Stat label="Longest float" value={`${float} sts`} sub={`${floatCm.toFixed(1)} cm`} tone={floatCm > 2.5 ? 'bad' : undefined} />
        </Stats>
        {!fit.exact && <Note tone="warn">The chart doesn't divide the cast-on. Change to {fit.lower} sts ({((fit.lower * 10) / s.sts).toFixed(1)} cm) or {fit.upper} sts ({((fit.upper * 10) / s.sts).toFixed(1)} cm), or pick a repeat width that divides {bodySts}.</Note>}
        {floatCm > 2.5 && <Note tone="warn">Floats longer than ~2.5 cm snag fingers — catch them every 5–7 stitches or redesign the long runs.</Note>}
        <Panel title="Gauge & size">
          <Row>
            <Num label="Stitch gauge" value={s.sts} onChange={(sts) => set({ sts })} unit="sts/10 cm" min={8} max={50} />
            <Num label="Row gauge" value={s.rows} onChange={(rows) => set({ rows })} unit="rows/10 cm" min={8} max={60} />
          </Row>
          <Row>
            <Num label="Chest circumference" value={s.chest} onChange={(chest) => set({ chest })} unit="cm" min={50} max={170} />
            <Num label="Body length" value={s.length} onChange={(length) => set({ length })} unit="cm" min={30} max={90} />
            <Num label="Sleeve length" value={s.sleeve} onChange={(sleeve) => set({ sleeve })} unit="cm" min={10} max={70} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>The preview scales the motif with your gauge: a tighter gauge makes each repeat smaller on the garment. Drag to orbit, scroll to zoom.</p>
        </Panel>
      </div>
    </Split>
  )
}
