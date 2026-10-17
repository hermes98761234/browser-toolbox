import { useEffect, useMemo, useState } from 'react'
import { Bar, Btn, Check, color, CsvButton, JsonButtons, Note, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { CONTAINERS, packContainer, type Item } from './lib/container-loading-planner'

type Units = 'cm' | 'in'
const DEF = {
  container: 0,
  units: 'cm' as Units,
  support: 75,
  items: [
    { id: 'pal', name: 'Euro pallet (machinery)', l: 1200, w: 800, h: 1400, kg: 420, qty: 6, rotate: false, stackable: false, color: color(0) },
    { id: 'drm', name: 'Drum crate', l: 600, w: 600, h: 900, kg: 190, qty: 10, rotate: false, stackable: true, color: color(1) },
    { id: 'ctn', name: 'Carton L', l: 600, w: 400, h: 400, kg: 18, qty: 64, rotate: true, stackable: true, color: color(2) },
    { id: 'crt', name: 'Long crate', l: 2400, w: 500, h: 500, kg: 85, qty: 4, rotate: true, stackable: true, color: color(3) },
    { id: 'sml', name: 'Carton S', l: 400, w: 300, h: 300, kg: 8, qty: 60, rotate: true, stackable: true, color: color(4) },
  ] as Item[],
}

export default function ContainerLoadingPlanner() {
  const [s, set, reset] = useToolState('container-loading-planner', DEF)
  const c = CONTAINERS[s.container] ?? CONTAINERS[0]
  const k = s.units === 'cm' ? 10 : 25.4 // mm per display unit
  const kgk = s.units === 'cm' ? 1 : 0.45359237 // kg per display unit
  const wu = s.units === 'cm' ? 'kg' : 'lb'
  const items = useMemo(() => s.items.filter((it) => it.l > 0 && it.w > 0 && it.h > 0), [s.items])
  const res = useMemo(() => packContainer(c, items, s.support / 100), [c, items, s.support])
  const total = items.reduce((a, it) => a + Math.max(0, Math.floor(it.qty)), 0)
  const [step, setStep] = useState(res.placed.length)
  const [playing, setPlaying] = useState(false)
  const [prevLen, setPrevLen] = useState(res.placed.length)
  if (prevLen !== res.placed.length) { setPrevLen(res.placed.length); setStep(res.placed.length) }
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setStep((n) => { if (n >= res.placed.length) { setPlaying(false); return n } return n + 1 }), Math.max(15, 2500 / Math.max(1, res.placed.length)))
    return () => clearInterval(t)
  }, [playing, res.placed.length])

  const ref = useStage3D(
    (stage) => {
      const g = new THREE.Group()
      g.name = 'root'
      stage.scene.add(g)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const m = 1 / 1000
      const L = c.L * m, W = c.W * m, H = c.H * m
      if (root.userData.L !== L) {
        // frame the container whenever its size changes (keeps the user's orbit otherwise)
        root.userData.L = L
        const dd = Math.max(L, 5)
        stage.camera.position.set(0.6 * dd, 0.5 * dd + 1.2, 0.8 * dd + 1.5)
        stage.controls.target.set(0, H / 3, 0)
      }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, W), new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 }))
      floor.position.set(0, -0.02, 0)
      root.add(floor)
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: '#94a3b8' }))
      shell.position.set(0, H / 2, 0)
      root.add(shell)
      const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#334155', side: THREE.DoubleSide, transparent: true, opacity: 0.5 }))
      back.rotation.y = Math.PI / 2
      back.position.set(-L / 2, H / 2, 0)
      root.add(back)
      const side = new THREE.Mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshStandardMaterial({ color: '#334155', side: THREE.DoubleSide, transparent: true, opacity: 0.25 }))
      side.position.set(0, H / 2, -W / 2)
      root.add(side)
      const doors = label('DOORS →', '#fbbf24', 0.35)
      doors.position.set(L / 2 + 0.3, H + 0.3, 0)
      root.add(doors)
      const mats = items.map((it) => new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.6 }))
      const edgeMat = new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.5 })
      res.placed.slice(0, step).forEach((p, i) => {
        const g = new THREE.BoxGeometry(Math.max(0.001, p.l * m - 0.012), Math.max(0.001, p.h * m - 0.012), Math.max(0.001, p.w * m - 0.012))
        const mesh = new THREE.Mesh(g, i === step - 1 && step < res.placed.length ? new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#a16207' }) : mats[p.item])
        const pos = new THREE.Vector3((p.x + p.l / 2) * m - L / 2, (p.z + p.h / 2) * m, (p.y + p.w / 2) * m - W / 2)
        mesh.position.copy(pos)
        root.add(mesh)
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat)
        e.position.copy(pos)
        root.add(e)
      })
      if (res.weight > 0) {
        const cg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: '#ef4444', depthTest: false }))
        cg.renderOrder = 10
        cg.position.set(res.cog[0] * m - L / 2, 0.05, res.cog[1] * m - W / 2)
        root.add(cg)
      }
    },
    [res, step, c, items],
    { camera: [7, 6, 8], target: [0, 1, 0], grid: false },
  )

  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const loaded = items.map((_, i) => res.placed.filter((p) => p.item === i).length)
  const cogOff = res.weight ? res.cog[0] / c.L - 0.5 : 0
  const totalKg = items.reduce((a, it) => a + it.kg * Math.max(0, Math.floor(it.qty)), 0)
  const vol = (x: { L: number; W: number; H: number }) => x.L * x.W * x.H
  const bigger = CONTAINERS.map((x, i) => [vol(x), i] as const).filter(([v]) => v > vol(c)).sort((a, b) => a[0] - b[0])[0]?.[1] ?? -1
  const d = (mm: number) => +(mm / k).toFixed(1)
  const w = (kg: number) => (kg / kgk).toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div>
      <Stats>
        <Stat label="Loaded" value={`${res.placed.length} / ${total}`} sub={total - res.placed.length ? `${total - res.placed.length} don't fit` : 'everything fits ✓'} tone={res.placed.length === total ? 'good' : 'bad'} />
        <Stat label="Volume used" value={pct(res.volumeUse, 1)} sub={`floor length used ${pct(res.usedLength / c.L, 0)}`} tone="accent" />
        <Stat label="Payload" value={`${w(res.weight)} ${wu}`} sub={`${pct(res.weight / c.payload, 0)} of ${w(c.payload)} ${wu} max`} tone={res.weight / c.payload > 0.95 ? 'bad' : undefined} />
        <Stat label="Centre of gravity" value={`${cogOff >= 0 ? '+' : ''}${(cogOff * 100).toFixed(1)}%`} sub={Math.abs(cogOff) <= 0.1 ? 'well centred along length ✓' : cogOff < 0 ? 'nose-heavy: move weight to doors' : 'door-heavy: move weight forward'} tone={Math.abs(cogOff) <= 0.1 ? 'good' : 'bad'} />
      </Stats>
      <Split wide="left">
        <Panel
          title={`${c.name} · ${(c.L / 1000).toFixed(2)} × ${(c.W / 1000).toFixed(2)} × ${(c.H / 1000).toFixed(2)} m`}
          actions={<Btn kind="primary" onClick={() => { if (step >= res.placed.length) setStep(0); setPlaying((p) => !p) }}>{playing ? '⏸ Pause' : '▶ Play loading order'}</Btn>}
        >
          <View3D refEl={ref} height={440} />
          <Slider label="Loading step" value={step} min={0} max={res.placed.length} step={1} onChange={(v) => { setPlaying(false); setStep(v) }} show={(v) => `${v} / ${res.placed.length}`} />
          {step > 0 && step <= res.placed.length && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Step {step}: <b style={{ color: items[res.placed[step - 1].item]?.color }}>{items[res.placed[step - 1].item]?.name}</b> at {d(res.placed[step - 1].x)}, {d(res.placed[step - 1].y)}, {d(res.placed[step - 1].z)} {s.units} (from front wall, left side, floor). Red dot = centre of gravity.
            </p>
          )}
        </Panel>
        <div>
          <Panel title="Container" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Select label="Type" value={s.container} onChange={(container) => set({ container })} options={CONTAINERS.map((x, i) => [i, `${x.name} · ${(x.L / 1000).toFixed(2)}×${(x.W / 1000).toFixed(2)}×${(x.H / 1000).toFixed(2)} m`] as [number, string])} />
            <Row>
              <Select label="Units" value={s.units} onChange={(units) => set({ units })} options={[['cm', 'cm / kg'], ['in', 'in / lb']]} />
              <Select label="Min. support under stacked boxes" value={s.support} onChange={(support) => set({ support })} options={[[100, '100% (strict)'], [75, '75%'], [60, '60%'], [50, '50% (loose)']]} />
            </Row>
            {totalKg > c.payload && <Note tone="warn">Cargo weighs {w(totalKg)} {wu}, more than the {w(c.payload)} {wu} payload. Heaviest items may be left out.</Note>}
            {res.placed.length < total && bigger >= 0 && <Btn onClick={() => set({ container: bigger })}>Try a bigger one: {CONTAINERS[bigger].name}</Btn>}
          </Panel>
          <Panel title="Load summary">
            {items.map((it, i) => (
              <div key={it.id} style={{ marginBottom: 8 }}>
                <Row wrap={false}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: it.color, flex: '0 0 auto', marginTop: 4 }} />
                  <b style={{ flex: 1 }}>{it.name}</b>
                  <span style={{ color: loaded[i] < it.qty ? 'var(--err)' : undefined }}>{loaded[i]} / {it.qty}</span>
                </Row>
                <Bar value={loaded[i]} max={it.qty || 1} color={it.color} />
              </div>
            ))}
          </Panel>
        </div>
      </Split>
      <Panel
        title="Cargo"
        actions={
          <>
            <Btn onClick={() => set({ items: [...s.items, { id: uid(), name: `Item ${s.items.length + 1}`, l: 800, w: 600, h: 500, kg: 40, qty: 10, rotate: true, stackable: true, color: color(s.items.length) }] })}>+ Item</Btn>
            <CsvButton name="load-plan.csv" rows={() => [['Step', 'Item', `X (${s.units})`, `Y (${s.units})`, `Z (${s.units})`, `L`, `W`, `H`], ...res.placed.map((p, i) => [i + 1, items[p.item].name, d(p.x), d(p.y), d(p.z), d(p.l), d(p.w), d(p.h)])]} />
            <JsonButtons name="container-load.json" data={s} onLoad={(v) => set(v)} />
          </>
        }
      >
        <Table
          head={['', 'Name', `L (${s.units})`, `W (${s.units})`, `H (${s.units})`, `Weight (${wu})`, 'Qty', 'Rotate', 'Stack on top', 'Loaded', '']}
          rows={s.items.map((it) => {
            const n = (key: 'l' | 'w' | 'h') => <input key={key} type="number" min={1} value={d(it[key])} onChange={(e) => edit(it.id, { [key]: Math.max(0, Number(e.target.value) || 0) * k })} style={{ width: 70 }} aria-label={key} />
            return [
              <input key="c" type="color" value={it.color} onChange={(e) => edit(it.id, { color: e.target.value })} style={{ width: 30, height: 26, border: 'none', padding: 0, background: 'none' }} aria-label="Colour" />,
              <input key="n" value={it.name} onChange={(e) => edit(it.id, { name: e.target.value })} style={{ width: 150 }} aria-label="Name" />,
              n('l'), n('w'), n('h'),
              <input key="kg" type="number" min={0} value={+(it.kg / kgk).toFixed(1)} onChange={(e) => edit(it.id, { kg: Math.max(0, Number(e.target.value) || 0) * kgk })} style={{ width: 70 }} aria-label="Weight" />,
              <input key="q" type="number" min={0} step={1} value={it.qty} onChange={(e) => edit(it.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 60 }} aria-label="Quantity" />,
              <Check key="r" label="" value={it.rotate} onChange={(rotate) => edit(it.id, { rotate })} />,
              <Check key="s" label="" value={it.stackable} onChange={(stackable) => edit(it.id, { stackable })} />,
              <b key="ld" style={{ color: (loaded[items.indexOf(it)] ?? 0) < it.qty ? 'var(--err)' : 'var(--ok)' }}>{loaded[items.indexOf(it)] ?? 0}</b>,
              <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })} title="Remove">✕</Btn>,
            ]
          })}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          “Rotate” lets an item lie on any side (otherwise it stays upright, turning only on the floor). Untick “Stack on top” for fragile items: nothing will be placed on them. The planner fills from the front wall towards the doors using an extreme-point heuristic, so check real-world constraints (blocking, bracing, axle loads) before shipping.
        </p>
      </Panel>
    </div>
  )
}
