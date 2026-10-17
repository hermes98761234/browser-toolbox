import { useRef } from 'react'
import { Btn, CopyButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { checks, CODES, compute, stringerProfile, type Input } from './lib/stair-calculator'

type Units = 'mm' | 'in'
interface State extends Input {
  units: Units
  code: string
  width: number
  autoN: boolean
}

const DEF: State = { units: 'mm', code: 'irc', rise: 2700, tread: 254, risers: 14, maxRiser: 196, treadThick: 25, board: 286, floorThick: 250, headroom: 2032, width: 900, autoN: true }
const IN = 25.4

export default function StairCalculator() {
  const [s, set, reset] = useToolState('stair-calculator', DEF)
  const code = CODES[s.code] ?? CODES.irc
  const inch = s.units === 'in'
  const show = (mm: number) => (inch ? `${(mm / IN).toFixed(2)}″` : `${Math.round(mm)} mm`)
  const toU = (mm: number) => (inch ? Math.round((mm / IN) * 100) / 100 : Math.round(mm * 10) / 10)
  const fromU = (v: number) => (inch ? v * IN : v)
  const input: Input = { ...s, risers: s.autoN ? 0 : s.risers, maxRiser: code.maxRiser }
  const r = compute(input)
  const cks = checks(r, input, code, show)
  const valid = s.rise > 0 && s.tread > 0 && r.n >= 1 && r.n < 100
  const profile = stringerProfile(r, s.tread, s.treadThick)

  const L = (key: keyof State, label: string, hint?: string) => (
    <Num label={label} value={toU(s[key] as number)} onChange={(v) => set({ [key]: Math.max(0, fromU(v)) } as Partial<State>)} unit={s.units} min={0} hint={hint} />
  )

  // 3D model (1 unit = 1 m)
  const framed = useRef(false)
  const ref = useStage3D(
    () => {},
    (st) => {
      const old = st.scene.getObjectByName('stairs')
      if (old) {
        st.clear(old)
        st.scene.remove(old)
      }
      if (!valid) return
      const g = new THREE.Group()
      g.name = 'stairs'
      const m = 0.001
      const W = s.width * m
      const run = r.totalRun * m
      const wood = new THREE.MeshStandardMaterial({ color: '#c08a52', roughness: 0.7 })
      const riserMat = new THREE.MeshStandardMaterial({ color: '#f1e6d6', roughness: 0.9 })
      const strMat = new THREE.MeshStandardMaterial({ color: '#8d6238', roughness: 0.8 })
      for (let k = 0; k < r.treads; k++) {
        const y = (k + 1) * r.riser * m
        const t = new THREE.Mesh(new THREE.BoxGeometry(W, s.treadThick * m, (s.tread + 25) * m), wood)
        t.position.set(0, y - (s.treadThick * m) / 2, (k * s.tread + s.tread / 2 - 12.5) * m - run / 2)
        g.add(t)
      }
      for (let k = 0; k < r.n; k++) {
        const rs = new THREE.Mesh(new THREE.BoxGeometry(W, (r.riser - s.treadThick) * m, 0.012), riserMat)
        rs.position.set(0, (k * r.riser + (r.riser - s.treadThick) / 2) * m, k * s.tread * m - run / 2)
        g.add(rs)
      }
      // stringers: extruded sawtooth profile
      const shape = new THREE.Shape()
      profile.forEach(([x, y], i) => (i ? shape.lineTo(x * m, y * m) : shape.moveTo(x * m, y * m)))
      const ang = Math.atan2(r.riser, s.tread)
      const last = profile[profile.length - 1]
      const off = s.board / Math.cos(ang)
      shape.lineTo(last[0] * m, (last[1] - off) * m)
      shape.lineTo(((off - r.firstRiser) / Math.tan(ang)) * m, 0)
      shape.lineTo(0, 0)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.038, bevelEnabled: false })
      for (const side of [-1, 1]) {
        const str = new THREE.Mesh(geo, strMat)
        str.rotation.y = -Math.PI / 2
        str.position.set(side * (W / 2 - 0.02) + 0.019, 0, -run / 2)
        g.add(str)
      }
      // upper floor
      const fl = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, s.floorThick * m, 1.2), new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.6 }))
      fl.position.set(0, s.rise * m - (s.floorThick * m) / 2, run / 2 + 0.6)
      g.add(fl)
      const lbl = label(`${r.n} risers × ${show(r.riser)}`, '#e2e8f0', 0.16)
      lbl.position.set(0, s.rise * m + 0.35, 0)
      g.add(lbl)
      const lb2 = label(`run ${show(r.totalRun)}`, '#fbbf24', 0.14)
      lb2.position.set(W / 2 + 0.4, 0.15, 0)
      g.add(lb2)
      st.scene.add(g)
      st.controls.target.set(0, (s.rise * m) / 2, 0)
      if (!framed.current) {
        framed.current = true
        const d = Math.max(run, s.rise * m) * 0.85 + 0.5
        st.camera.position.set(d * 0.95, s.rise * m * 0.75 + 0.3, d * 0.55)
      }
    },
    [s, valid, r.n, r.riser, r.totalRun, profile],
    { camera: [3.4, 2.6, 3.4], target: [0, 1.2, 0], grid: true },
  )

  // SVG stringer template
  const ang = Math.atan2(r.riser, s.tread)
  const last = profile[profile.length - 1] ?? [0, 0]
  const off = s.board / Math.cos(ang)
  const outline: [number, number][] = [...profile, [last[0], last[1] - off], [(off - r.firstRiser) / Math.tan(ang), 0]]
  const maxX = Math.max(last[0], (off - r.firstRiser) / Math.tan(ang)) + 40
  const maxY = last[1] + 40
  const svgPts = outline.map(([x, y]) => `${x.toFixed(1)},${(maxY - y).toFixed(1)}`).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -20 ${(maxX + 80).toFixed(0)} ${(maxY + 60).toFixed(0)}" width="${((maxX + 80) / 10).toFixed(0)}cm" height="${((maxY + 60) / 10).toFixed(0)}cm"><polygon points="${svgPts}" fill="#f5deb3" stroke="#7c4a1e" stroke-width="4"/><text x="0" y="${maxY + 30}" font-size="40" font-family="sans-serif">Stringer: ${r.n} risers × ${show(r.riser)}, tread ${show(s.tread)}, first riser ${show(r.firstRiser)}, board ${show(s.board)}</text></svg>`

  const steps = Array.from({ length: r.n }, (_, k) => [k + 1, show((k + 1) * r.riser), k < r.treads ? show((k + 1) * s.tread) : 'top floor', show(Math.hypot((k + 1) * r.riser, (k + 1) * s.tread))])

  return (
    <Split wide="right">
      <div>
        <Panel title="Your stairs" actions={<Seg value={s.units} onChange={(units) => set({ units })} options={[['mm', 'mm'], ['in', 'inch']]} />}>
          <Select label="Building code" value={s.code} onChange={(c) => set({ code: c, tread: Math.max(s.tread, CODES[c].minTread) })} options={Object.entries(CODES).map(([k, v]) => [k, v.name] as const)} />
          {L('rise', 'Total rise', 'Finished floor to finished floor')}
          {L('tread', 'Tread run (going)', 'Horizontal depth per step, excluding nosing')}
          <Row>
            <label className="k-check"><input type="checkbox" checked={s.autoN} onChange={(e) => set({ autoN: e.target.checked, risers: r.n })} /> Auto riser count</label>
            {!s.autoN && <Num label="Risers" value={s.risers} onChange={(v) => set({ risers: Math.max(1, Math.round(v)) })} min={1} max={60} step={1} />}
          </Row>
          <Row>
            {L('width', 'Stair width')}
            {L('treadThick', 'Tread thickness')}
          </Row>
          <Row>
            {L('board', 'Stringer board width', '2×12 = 286 mm / 11.25″')}
            {L('floorThick', 'Upper floor depth')}
          </Row>
          {L('headroom', 'Required headroom')}
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Panel title="Code checks">
          {cks.map((c) => (
            <div key={c.label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: c.ok ? 'var(--ok)' : 'var(--err)', fontWeight: 800 }}>{c.ok ? '✓' : '✗'}</span>
              <b style={{ minWidth: 120 }}>{c.label}</b>
              <span className="muted">{c.detail}</span>
            </div>
          ))}
          <Note>Rules are typical values for {code.name}. Local codes and amendments vary, so confirm with your building authority before cutting.</Note>
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Enter a positive rise and tread run.</Note>}
        <Stats>
          <Stat label="Risers" value={`${r.n} × ${show(r.riser)}`} tone="accent" sub={`${r.treads} treads`} />
          <Stat label="Total run" value={show(r.totalRun)} sub={`pitch ${r.pitch.toFixed(1)}°`} />
          <Stat label="Stringer length" value={show(r.boardLength)} sub={`buy ≥ ${inch ? Math.ceil(r.boardLength / 304.8 / 2) * 2 + ' ft' : (Math.ceil(r.boardLength / 600) * 0.6).toFixed(1) + ' m'} stock`} />
          <Stat label="Ceiling opening" value={show(r.openingLength)} sub={`for ${show(s.headroom)} headroom`} />
        </Stats>
        <Panel title="3D preview">
          <View3D refEl={ref} height={360} />
        </Panel>
        <Panel
          title="Stringer template"
          actions={
            <>
              <Btn onClick={() => download('stringer.svg', svg, 'image/svg+xml')}>⬇ SVG (1:1 mm)</Btn>
              <CopyButton label="Copy cut list" text={() => `Stairs: ${r.n} risers × ${show(r.riser)}, ${r.treads} treads × ${show(s.tread)}\nTotal run ${show(r.totalRun)}, pitch ${r.pitch.toFixed(1)}°\nFirst riser (cut for tread) ${show(r.firstRiser)}\nNotch depth ${show(r.notchDepth)}, throat ${show(r.throat)}\nStringer length ${show(r.boardLength)}`} />
            </>
          }
        >
          <svg viewBox={`-40 -20 ${maxX + 80} ${maxY + 60}`} style={{ width: '100%', maxHeight: 300, background: 'var(--panel2)', borderRadius: 8 }}>
            <polygon points={svgPts} fill="#e8c99a" stroke="#7c4a1e" strokeWidth={Math.max(3, maxX / 400)} />
            <line x1={0} y1={maxY} x2={maxX} y2={maxY} stroke="var(--muted)" strokeDasharray="20 12" strokeWidth={3} />
          </svg>
          <p className="muted" style={{ fontSize: 13 }}>
            Mark with a framing square set to <b>{show(r.riser)}</b> (rise) and <b>{show(s.tread)}</b> (run). Cut the bottom riser to <b>{show(r.firstRiser)}</b> so the first step equals the rest once the tread is on. Each notch is {show(r.notchDepth)} deep, leaving a {show(r.throat)} throat.
          </p>
        </Panel>
        <Panel title="Layout marks (from the floor and the first riser face)">
          <Table head={['Step', 'Height', 'Run', 'Along stringer']} rows={steps} max={20} />
        </Panel>
      </div>
    </Split>
  )
}
