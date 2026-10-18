import { useMemo } from 'react'
import { BarChart, Btn, Check, CsvButton, LineChart, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { axialIssues, bands, bonello, logFreqs, modes, RATIOS, response, schroeder, shape, soundSpeed, type Mode, type V3 } from './lib/room-mode-calculator'

const DEF = {
  unit: 'm' as 'm' | 'ft',
  L: 5.8, W: 4.2, H: 2.6, temp: 20, rt60: 0.45, fmax: 200,
  lx: 2.25, ly: 2.1, lz: 1.1,
  sx: 0.9, spread: 2.2, sz: 1.0, stereo: true,
  sel: 0,
}
const FT = 3.28084
const TYPE_COLOR: Record<string, string> = { axial: '#ef4444', tangential: '#f59e0b', oblique: '#0ea5e9' }
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const noteOf = (f: number) => {
  const m = Math.round(69 + 12 * Math.log2(f / 440))
  return `${NOTES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}

function diverging(v: number): [number, number, number] {
  // −1 blue … 0 near-black … +1 red (pressure sign); magnitude matters for bass
  const a = Math.min(1, Math.abs(v))
  return v >= 0 ? [0.12 + 0.85 * a, 0.14 + 0.2 * a, 0.2] : [0.12, 0.14 + 0.45 * a, 0.2 + 0.78 * a]
}

export default function RoomModeCalculator() {
  const [s, set, reset] = useToolState('room-mode-calculator', DEF)
  const k = s.unit === 'ft' ? FT : 1
  const u = s.unit
  const d: V3 = [s.L, s.W, s.H]
  const c = soundSpeed(s.temp)
  const V = s.L * s.W * s.H
  const fs = schroeder(s.rt60, V)
  const ms = useMemo(() => modes([s.L, s.W, s.H], Math.max(50, s.fmax), c), [s.L, s.W, s.H, s.fmax, c])
  const bs = useMemo(() => bands(ms, 200), [ms])
  const bon = bonello(bs)
  const iss = axialIssues(ms, Math.min(200, fs))
  const rcv: V3 = [s.lx, s.ly, s.lz]
  const srcs: V3[] = s.stereo ? [[s.sx, s.W / 2 - s.spread / 2, s.sz], [s.sx, s.W / 2 + s.spread / 2, s.sz]] : [[s.sx, s.W / 2, s.sz]]
  const freqs = useMemo(() => logFreqs(20, 200, 260), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resp = useMemo(() => response(d, srcs, rcv, c, s.rt60, freqs), [s.L, s.W, s.H, s.lx, s.ly, s.lz, s.sx, s.spread, s.sz, s.stereo, c, s.rt60, freqs])
  const spread = Math.max(...resp) - Math.min(...resp)
  const sel = ms[Math.min(s.sel, ms.length - 1)]

  const ref = useStage3D(
    () => undefined,
    (st) => {
      const old = st.scene.getObjectByName('room')
      if (old) {
        st.scene.remove(old)
        st.clear(old)
      }
      const g = new THREE.Group()
      g.name = 'room'
      const P = (p: V3) => new THREE.Vector3(p[1] - s.W / 2, p[2], p[0] - s.L / 2)
      const box = new THREE.BoxGeometry(s.W, s.H, s.L)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
      edges.position.y = s.H / 2
      box.dispose()
      g.add(edges)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.W, s.L), new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 }))
      floor.rotation.x = -Math.PI / 2
      g.add(floor)
      const front = new THREE.Mesh(new THREE.PlaneGeometry(s.W, s.H), new THREE.MeshStandardMaterial({ color: '#334155', side: THREE.DoubleSide, transparent: true, opacity: 0.6 }))
      front.position.set(0, s.H / 2, -s.L / 2)
      g.add(front)
      // pressure slice of the selected mode at ear height
      if (sel) {
        const pg = new THREE.PlaneGeometry(s.W, s.L, 60, 60)
        pg.rotateX(-Math.PI / 2)
        const pos = pg.attributes.position
        const col = new Float32Array(pos.count * 3)
        for (let i = 0; i < pos.count; i++) {
          const v = shape(sel.n, d, [pos.getZ(i) + s.L / 2, pos.getX(i) + s.W / 2, s.lz])
          col.set(diverging(v), i * 3)
        }
        pg.setAttribute('color', new THREE.BufferAttribute(col, 3))
        const slice = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
        slice.position.y = s.lz
        g.add(slice)
      }
      const spk = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 })
      srcs.forEach((p, i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.3), spk)
        m.position.copy(P(p))
        g.add(m)
        const cone = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), new THREE.MeshStandardMaterial({ color: '#6366f1' }))
        cone.position.copy(P(p)).add(new THREE.Vector3(0, -0.05, 0.151))
        g.add(cone)
        const l = label(srcs.length > 1 ? (i ? 'R' : 'L') : 'Speaker', '#c7d2fe', 0.22)
        l.position.copy(P(p)).add(new THREE.Vector3(0, 0.38, 0))
        g.add(l)
      })
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: '#fbbf24' }))
      head.position.copy(P(rcv))
      g.add(head)
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.55, s.lz - 0.2, 0.55), new THREE.MeshStandardMaterial({ color: '#7c2d12' }))
      chair.position.copy(P([rcv[0] + 0.1, rcv[1], (s.lz - 0.2) / 2]))
      g.add(chair)
      const lt = label('Listener', '#fde68a', 0.22)
      lt.position.copy(P(rcv)).add(new THREE.Vector3(0, 0.3, 0))
      g.add(lt)
      const fl = label('Front wall', '#cbd5e1', 0.25)
      fl.position.set(0, s.H + 0.25, -s.L / 2)
      g.add(fl)
      st.scene.add(g)
      st.controls.target.set(0, s.H / 3, 0)
    },
    [s.L, s.W, s.H, s.lx, s.ly, s.lz, s.sx, s.spread, s.sz, s.stereo, sel?.n.join()],
    { camera: [3.6, 4.2, 5.6], target: [0, 1, 0], grid: false },
  )

  const dim = (key: 'L' | 'W' | 'H', lbl: string) => (
    <Num label={lbl} value={Math.round(s[key] * k * 100) / 100} onChange={(v) => v > 0.5 && set({ [key]: v / k } as Partial<typeof DEF>)} unit={u} min={0.5} />
  )
  const pos = (key: 'lx' | 'ly' | 'lz' | 'sx' | 'sz' | 'spread', lbl: string, max: number) => (
    <Slider label={lbl} value={s[key]} onChange={(v) => set({ [key]: v } as Partial<typeof DEF>)} min={0} max={max} step={0.01} show={(v) => num(v * k, 2)} unit={` ${u}`} />
  )
  const modeRow = (m: Mode) => [
    m.n.join(' '),
    <span key="t" style={{ color: TYPE_COLOR[m.type], fontWeight: 600 }}>{m.type}</span>,
    num(m.f, 1),
    noteOf(m.f),
    <span key="l" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 60, height: 8, background: 'var(--line)', borderRadius: 4, display: 'inline-block' }}><span style={{ display: 'block', height: 8, borderRadius: 4, width: `${Math.abs(shape(m.n, d, rcv)) * 100}%`, background: 'var(--accent)' }} /></span>{num(Math.abs(shape(m.n, d, rcv)), 2)}</span>,
    num(Math.abs(srcs.reduce((a, p) => a + shape(m.n, d, p), 0) / srcs.length), 2),
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['m', 'm'], ['ft', 'ft']]} />}>
          <Row>
            {dim('L', 'Length (front → back)')}
            {dim('W', 'Width')}
            {dim('H', 'Height')}
          </Row>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Ratio presets (keep height):</div>
          <Row>
            {RATIOS.map(([n, h, w, l]) => (
              <Btn key={n} kind="ghost" onClick={() => set({ W: Math.round(((s.H * w) / h) * 100) / 100, L: Math.round(((s.H * l) / h) * 100) / 100 })}>{n}</Btn>
            ))}
          </Row>
          <Row>
            <Num label="Air temperature" value={s.temp} onChange={(temp) => set({ temp })} unit="°C" min={-20} max={45} hint={`c = ${num(c, 1)} m/s`} />
            <Num label="RT60 (reverb time)" value={s.rt60} onChange={(rt60) => rt60 > 0 && set({ rt60 })} unit="s" min={0.1} max={3} hint="0.3–0.5 s for a furnished living room" />
          </Row>
        </Panel>
        <Panel title="Listener">
          {pos('lx', 'Distance from front wall', s.L)}
          {pos('ly', 'From left wall', s.W)}
          {pos('lz', 'Ear height', s.H)}
          <Row>
            <Btn onClick={() => set({ lx: Math.round(s.L * 0.38 * 100) / 100, ly: s.W / 2 })}>38% rule</Btn>
            <Btn onClick={() => set({ lx: s.L / 2, ly: s.W / 2 })}>Room centre (bad)</Btn>
          </Row>
        </Panel>
        <Panel title="Speakers">
          <Check label="Stereo pair (mono bass, in phase)" value={s.stereo} onChange={(stereo) => set({ stereo })} />
          {pos('sx', 'Distance from front wall', s.L / 2)}
          {s.stereo && pos('spread', 'Spacing between speakers', s.W - 0.2)}
          {pos('sz', 'Woofer height', s.H)}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Volume" value={`${num(V * (u === 'ft' ? 35.3147 : 1), 0)} ${u}³`} />
          <Stat label="Schroeder freq." value={`${num(fs, 0)} Hz`} sub="modes dominate below" tone="accent" />
          <Stat label="Lowest mode" value={`${num(ms[0]?.f ?? NaN, 1)} Hz`} />
          <Stat label="Bonello" value={bon.pass ? 'Pass' : 'Fail'} tone={bon.pass ? 'good' : 'bad'} sub={`${bon.issues.length} issue(s)`} />
          <Stat label="Response spread" value={`${num(spread, 1)} dB`} sub="peak-to-dip, 20–200 Hz" tone={spread > 20 ? 'bad' : spread < 12 ? 'good' : undefined} />
        </Stats>
        <Panel title={sel ? `3D room · pressure of mode ${sel.n.join(',')} (${num(sel.f, 1)} Hz) at ear height` : '3D room'}>
          <View3D refEl={ref} height={380} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Red/blue = opposite pressure phase, dark = pressure null. Click a row below to show another mode.</p>
        </Panel>
        <Panel title="Predicted bass response at the listener">
          <LineChart series={[{ name: 'Relative SPL', points: freqs.map((f, i) => [f, resp[i]]), color: '#6366f1', area: true }]} xLabel="Frequency (Hz)" yLabel="dB" fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} markers={fs < 200 ? [{ x: fs, label: 'Schroeder' }] : []} />
          <Note>Modal-sum estimate for rigid walls with damping from RT60; ignores furniture, wall flex and boundary interference above the Schroeder frequency. Use it to compare positions, not as an absolute prediction.</Note>
        </Panel>
        <Panel title="Modes per 1/3 octave (Bonello)">
          <BarChart bars={bs.map((b) => ({ label: String(b.fc), value: b.count, color: b.coincident ? '#ef4444' : '#6366f1' }))} height={200} fy={(v) => num(v, 0)} />
          {bon.pass ? <Note tone="ok">Mode counts never fall from one band to the next and there are no risky coincident modes.</Note> : <Note tone="warn">{bon.issues.slice(0, 4).map((x) => <div key={x}>• {x}</div>)}</Note>}
          {iss.clusters.length > 0 && <Note tone="warn">Axial modes within 5%: {iss.clusters.map(([a, b]) => `${num(a, 1)} & ${num(b, 1)} Hz`).join('; ')} — they stack into a strong peak.</Note>}
          {iss.gaps.length > 0 && <Note>Gaps over 20 Hz between axial modes: {iss.gaps.map(([a, b]) => `${num(a, 0)}–${num(b, 0)} Hz`).join('; ')} — expect dips there.</Note>}
        </Panel>
        <Panel title={`Modes up to ${s.fmax} Hz (${ms.length})`} actions={<>
          <select className="k-select" value={s.fmax} onChange={(e) => set({ fmax: Number(e.target.value) })} aria-label="Max frequency" style={{ width: 'auto' }}>
            {[120, 200, 300].map((f) => <option key={f} value={f}>≤ {f} Hz</option>)}
          </select>
          <CsvButton name="room-modes.csv" rows={() => [['nx', 'ny', 'nz', 'type', 'Hz', 'listener coupling'], ...ms.map((m) => [...m.n, m.type, m.f.toFixed(2), Math.abs(shape(m.n, d, rcv)).toFixed(3)])]} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <div onClick={(e) => {
            const tr = (e.target as HTMLElement).closest('tr')
            const i = tr ? [...tr.parentElement!.children].indexOf(tr) : -1
            if (tr?.parentElement?.tagName === 'TBODY' && i >= 0) set({ sel: i })
          }} style={{ cursor: 'pointer' }}>
            <Table head={['n (L W H)', 'Type', 'Hz', 'Note', 'At listener', 'Speaker drive']} rows={ms.map(modeRow)} max={60} />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>“At listener” 0 = seated in a null for that mode (it will sound weak); 1 = at a peak. “Speaker drive” shows how strongly the speakers excite it.</p>
        </Panel>
      </div>
    </Split>
  )
}
