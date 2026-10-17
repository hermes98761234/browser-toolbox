import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, FileDrop, LineChart, Note, Num, num, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { filamentGrams, fmtDuration, parseGcode, SAMPLE_CNC, samplePrint, type GcodeResult } from './lib/g-code-previewer'

const DEF = { rapidFeed: 6000, accel: 1000, dia: 1.75, density: 1.24, colorBy: 'layer' as 'layer' | 'speed', showTravel: false, onlyLayer: false }

interface Built {
  res: GcodeResult
  cut: THREE.LineSegments
  hi: THREE.LineSegments
  travel: THREE.LineSegments
  head: THREE.Mesh
  map: (x: number, y: number, z: number) => THREE.Vector3
}

function build(g: THREE.Group, res: GcodeResult, colorBy: 'layer' | 'speed'): Built {
  const b = res.bounds ?? { min: [0, 0, 0], max: [1, 1, 1] }
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2
  const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-3)
  const k = 10 / size
  const zb = b.min[2]
  const map = (x: number, y: number, z: number) => new THREE.Vector3((x - cx) * k, (z - zb) * k, -(y - cy) * k)
  const toPos = (arr: number[]) => {
    const out = new Float32Array(arr.length)
    for (let i = 0; i < arr.length; i += 3) {
      out[i] = (arr[i] - cx) * k
      out[i + 1] = (arr[i + 2] - zb) * k
      out[i + 2] = -(arr[i + 1] - cy) * k
    }
    return out
  }
  const pos = new THREE.BufferAttribute(toPos(res.cut), 3)
  const nSeg = res.cut.length / 6
  const col = new Float32Array(nSeg * 6)
  const c = new THREE.Color()
  const fMin = Math.min(...res.cutFeed), fMax = Math.max(...res.cutFeed)
  const nL = Math.max(1, res.layers.length - 1)
  res.layers.forEach((L, li) => {
    for (let s = L.cutStart; s < L.cutEnd; s++) {
      if (colorBy === 'layer') c.setHSL(0.62 - 0.62 * (li / nL), 0.85, 0.55)
      else c.setHSL(0.66 - 0.66 * ((res.cutFeed[s] - fMin) / (fMax - fMin || 1)), 0.9, 0.55)
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], s * 6)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', pos)
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const cut = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }))
  const hgeo = new THREE.BufferGeometry()
  hgeo.setAttribute('position', pos)
  const hi = new THREE.LineSegments(hgeo, new THREE.LineBasicMaterial({ color: '#ffffff' }))
  const tgeo = new THREE.BufferGeometry()
  tgeo.setAttribute('position', new THREE.BufferAttribute(toPos(res.travel), 3))
  const travel = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.45 }))
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 16), new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#7c2d12' }))
  head.rotation.x = Math.PI
  g.add(cut, hi, travel, head)
  return { res, cut, hi, travel, head, map }
}

export default function GCodePreviewer() {
  const [s, set, reset] = useToolState('g-code-previewer', DEF)
  const [code, setCode] = useState(samplePrint)
  const [name, setName] = useState('sample-vase.gcode')
  const [layer, setLayer] = useState(1e9)
  const [prog, setProg] = useState(1)
  const [playing, setPlaying] = useState(false)
  const res = useMemo(() => parseGcode(code, { rapidFeed: s.rapidFeed, accel: s.accel, defaultFeed: 1000 }), [code, s.rapidFeed, s.accel])
  const nL = res.layers.length
  const li = Math.max(0, Math.min(nL - 1, layer))
  const L = res.layers[li]
  const built = useRef<Built | null>(null)
  const builtKey = useRef('')

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setProg((p) => {
        if (p < 1) return Math.min(1, p + 0.04)
        setLayer((l) => {
          const cur = Math.min(nL - 1, l)
          if (cur >= nL - 1) {
            setPlaying(false)
            return cur
          }
          return cur + 1
        })
        return 0
      })
    }, 40)
    return () => clearInterval(id)
  }, [playing, nL])

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'gcode'
      st.scene.add(g)
    },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('gcode') as THREE.Group
      const key = `${s.colorBy}`
      if (!built.current || built.current.res !== res || builtKey.current !== key) {
        st.clear(g)
        built.current = build(g, res, s.colorBy)
        builtKey.current = key
      }
      const B = built.current
      if (!L) {
        B.cut.geometry.setDrawRange(0, 0)
        B.hi.geometry.setDrawRange(0, 0)
        B.travel.geometry.setDrawRange(0, 0)
        B.head.visible = false
        return
      }
      const end = L.cutStart + Math.round((L.cutEnd - L.cutStart) * prog)
      const start = s.onlyLayer ? L.cutStart : 0
      B.cut.geometry.setDrawRange(start * 2, Math.max(0, L.cutStart - start) * 2)
      B.hi.geometry.setDrawRange(L.cutStart * 2, (end - L.cutStart) * 2)
      B.travel.visible = s.showTravel
      const tEnd = L.travelStart + Math.round((L.travelEnd - L.travelStart) * prog)
      const tStart = s.onlyLayer ? L.travelStart : 0
      B.travel.geometry.setDrawRange(tStart * 2, Math.max(0, tEnd - tStart) * 2)
      const i = Math.max(L.cutStart, end - 1)
      const p = res.cut.length ? B.map(res.cut[i * 6 + 3], res.cut[i * 6 + 4], res.cut[i * 6 + 5]) : new THREE.Vector3()
      B.head.position.set(p.x, p.y + 0.25, p.z)
      B.head.visible = res.cut.length > 0
    },
    [res, s.colorBy, s.showTravel, s.onlyLayer, li, prog],
    { camera: [6.5, 6.5, 8.5], target: [0, 1.5, 0] },
  )

  const grams = filamentGrams(res.filament, s.dia, s.density)
  const size = res.bounds ? res.bounds.max.map((v, i) => v - res.bounds!.min[i]) : [0, 0, 0]
  const elapsed = res.layers.slice(0, li).reduce((a, l) => a + l.time, 0) + (L?.time ?? 0) * prog
  const load = async (f: File) => {
    const t = await f.text()
    setName(f.name)
    setCode(t)
    setLayer(1e9)
    setProg(1)
  }

  return (
    <div>
      <Stats>
        <Stat label="Estimated time" value={fmtDuration(res.time)} tone="accent" sub={`accel ${s.accel} mm/s²`} />
        <Stat label="Layers" value={nL} sub={L ? `showing ${li + 1} · Z ${num(L.z, 3)} mm` : ''} />
        {res.hasExtrusion ? (
          <Stat label="Filament" value={`${num(res.filament / 1000, 2)} m`} sub={`${num(grams, 1)} g @ ${s.dia} mm`} />
        ) : (
          <Stat label="Cutting path" value={`${num(res.pathLength / 1000, 2)} m`} sub="CNC program (no E axis)" />
        )}
        <Stat label="Size X × Y × Z" value={`${num(size[0], 1)} × ${num(size[1], 1)} × ${num(size[2], 1)}`} sub="mm" />
        <Stat label="Moves" value={num(res.moves, 0)} sub={`${num(res.lines, 0)} lines · travel ${num(res.travelLength / 1000, 2)} m`} />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="G-code file">
            <FileDrop accept=".gcode,.gco,.g,.nc,.ngc,.tap,.txt" onFiles={(f) => void load(f[0])} label="Drop a .gcode / .nc file or click to choose" />
            <p className="muted" style={{ fontSize: 13 }}>Loaded: <b>{name}</b>. Files are read locally and never uploaded.</p>
            <Row>
              <Btn onClick={() => { setCode(samplePrint()); setName('sample-vase.gcode'); setLayer(1e9); setProg(1) }}>3D-print sample</Btn>
              <Btn onClick={() => { setCode(SAMPLE_CNC); setName('sample-pocket.nc'); setLayer(1e9); setProg(1) }}>CNC sample (arcs)</Btn>
            </Row>
          </Panel>
          <Panel title="Display & machine">
            <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['layer', 'Colour by layer'], ['speed', 'Colour by speed']]} />
            <Row>
              <Check label="Travel moves" value={s.showTravel} onChange={(showTravel) => set({ showTravel })} />
              <Check label="Only current layer" value={s.onlyLayer} onChange={(onlyLayer) => set({ onlyLayer })} />
            </Row>
            <Row>
              <Num label="Rapid (G0) feed" value={s.rapidFeed} onChange={(rapidFeed) => set({ rapidFeed })} unit="mm/min" min={1} />
              <Num label="Acceleration" value={s.accel} onChange={(accel) => set({ accel })} unit="mm/s²" min={0} />
            </Row>
            <Row>
              <Num label="Filament Ø" value={s.dia} onChange={(dia) => set({ dia })} unit="mm" min={0.1} />
              <Num label="Density" value={s.density} onChange={(density) => set({ density })} unit="g/cm³" min={0.1} hint="PLA 1.24 · PETG 1.27 · ABS 1.04" />
            </Row>
            <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
          </Panel>
          {res.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          {!res.cut.length && <Note tone="err">No cutting or extruding moves found in this file.</Note>}
        </div>
        <div>
          <Panel title="Toolpath" actions={<span className="muted" style={{ fontSize: 13 }}>white = current layer · drag to orbit</span>}>
            <View3D refEl={ref} height={440} />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <b>Layer</b>
              <input type="range" min={0} max={Math.max(0, nL - 1)} value={li} onChange={(e) => { setLayer(Number(e.target.value)); setProg(1); setPlaying(false) }} aria-label="Layer" />
              <span style={{ minWidth: 120 }}>{nL ? `${li + 1} / ${nL} · Z ${num(L?.z ?? 0, 2)}` : '—'}</span>
              <b>Progress</b>
              <input type="range" min={0} max={1} step={0.01} value={prog} onChange={(e) => { setProg(Number(e.target.value)); setPlaying(false) }} aria-label="Progress within layer" />
              <span>{Math.round(prog * 100)}% · {fmtDuration(elapsed)}</span>
            </div>
            <Row>
              <Btn kind="primary" disabled={!nL} onClick={() => {
                if (!playing && li >= nL - 1 && prog >= 1) { setLayer(0); setProg(0) }
                setPlaying(!playing)
              }}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
              <Btn onClick={() => { setLayer(Math.max(0, li - 1)); setProg(1) }} disabled={li <= 0}>◀ Layer</Btn>
              <Btn onClick={() => { setLayer(Math.min(nL - 1, li + 1)); setProg(1) }} disabled={li >= nL - 1}>Layer ▶</Btn>
              {L && <span className="muted">This layer: {fmtDuration(L.time)} · path {num(L.length, 0)} mm{res.hasExtrusion ? ` · ${num(L.extruded, 1)} mm filament` : ''}</span>}
            </Row>
          </Panel>
          {nL > 1 && (
            <Panel title="Time per layer">
              <LineChart series={[{ name: 'Layer time', points: res.layers.map((l, i) => [i + 1, l.time]), area: true }]} height={200} xLabel="Layer" fy={(v) => `${num(v, 0)} s`} fx={(v) => num(v, 0)} markers={[{ x: li + 1, label: 'current' }]} />
            </Panel>
          )}
        </div>
      </Split>
      {code.length < 400_000 && (
        <Panel title="G-code (editable)">
          <Area value={code} onChange={setCode} rows={10} mono />
        </Panel>
      )}
    </div>
  )
}
