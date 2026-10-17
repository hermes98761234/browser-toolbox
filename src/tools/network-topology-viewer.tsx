import { useMemo, useState } from 'react'
import { Area, Btn, Check, CsvButton, download, FileDrop, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import {
  adjacency, articulationPoints, components, forceLayout3D, latencyColor, parseCsv, parseJson, pretty, SAMPLE_CSV, SAMPLE_JSON, shortestPath, TYPES, type NodeType, type P3, type Topology,
} from './lib/network-topology-viewer'

const TYPE_COLOR: Record<NodeType, string> = {
  internet: '#94a3b8', firewall: '#ef4444', router: '#f59e0b', switch: '#0ea5e9', server: '#6366f1',
  database: '#a855f7', storage: '#14b8a6', wifi: '#84cc16', client: '#e2e8f0', cloud: '#38bdf8',
}
const TYPE_SIZE: Record<NodeType, number> = { internet: 0.42, firewall: 0.36, router: 0.36, switch: 0.3, server: 0.26, database: 0.28, storage: 0.26, wifi: 0.24, client: 0.2, cloud: 0.4 }

const DEF = { format: 'json' as 'json' | 'csv', text: SAMPLE_JSON, labels: true, search: '', from: 'pc1', to: 'db1', spof: true, edgeWidth: 1 }

function mbps(v: number) {
  return v >= 1000 ? `${num(v / 1000, 1)} Gb/s` : `${num(v, 0)} Mb/s`
}

export default function NetworkTopologyViewer() {
  const [s, set, reset] = useToolState('network-topology-viewer', DEF)
  const [selected, setSelected] = useState<string | null>(null)

  const parsed = useMemo((): { topo: Topology | null; error: string } => {
    try {
      const topo = s.format === 'json' ? parseJson(s.text) : parseCsv(s.text)
      if (!topo.nodes.length) return { topo: null, error: 'No nodes found.' }
      return { topo, error: '' }
    } catch (e) {
      return { topo: null, error: (e as Error).message }
    }
  }, [s.format, s.text])
  const topo = parsed.topo
  const pos = useMemo(() => (topo ? forceLayout3D(topo, topo.nodes.length > 200 ? 120 : 300) : new Map<string, P3>()), [topo])
  const spof = useMemo(() => (topo ? articulationPoints(topo) : new Set<string>()), [topo])
  const comps = useMemo(() => (topo ? components(topo) : []), [topo])
  const adj = useMemo(() => (topo ? adjacency(topo) : new Map()), [topo])
  const route = useMemo(() => (topo ? shortestPath(topo, s.from, s.to) : null), [topo, s.from, s.to])
  const q = s.search.trim().toLowerCase()
  const matches = useMemo(() => new Set(topo && q ? topo.nodes.filter((n) => `${n.id} ${n.label} ${n.ip} ${n.group} ${n.type}`.toLowerCase().includes(q)).map((n) => n.id) : []), [topo, q])
  const pathEdges = useMemo(() => {
    const set = new Set<string>()
    if (route) for (let i = 1; i < route.path.length; i++) set.add([route.path[i - 1], route.path[i]].sort().join('\u0000'))
    return set
  }, [route])

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'net'
      st.scene.add(root)
      st.scene.children.filter((c) => c.type === 'GridHelper').forEach((g) => (g.visible = false))
      const ray = new THREE.Raycaster()
      const el = st.renderer.domElement
      let down = [0, 0]
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(root.children.filter((c) => c.userData.id), false)[0]
        setSelected(hit ? (hit.object.userData.id as string) : null)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      st.onFrame((t) => {
        for (const c of root.children) if (c.userData.pulse) c.scale.setScalar(1 + 0.25 * Math.sin(t * 5))
      })
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st) => {
      const root = st.scene.getObjectByName('net') as THREE.Group
      st.clear(root)
      if (!topo) return
      const focus = q ? matches : null
      const sel = selected ? new Set([selected, ...(adj.get(selected) ?? []).map((e: { to: string }) => e.to)]) : null
      const dim = (id: string) => (focus ? !focus.has(id) : sel ? !sel.has(id) : false)
      const up = new THREE.Vector3(0, 1, 0)
      for (const l of topo.links) {
        const a = pos.get(l.source), b = pos.get(l.target)
        if (!a || !b) continue
        const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
        const onPath = pathEdges.has([l.source, l.target].sort().join('\u0000'))
        const len = va.distanceTo(vb)
        const w = (0.02 + 0.012 * Math.log10(Math.max(10, l.bandwidth))) * s.edgeWidth * (onPath ? 2.2 : 1)
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(w, w, len, 6, 1, true),
          new THREE.MeshBasicMaterial({ color: onPath ? '#ffffff' : latencyColor(l.latency), transparent: true, opacity: dim(l.source) && dim(l.target) ? 0.12 : onPath ? 1 : 0.85 }),
        )
        m.position.copy(va).add(vb).multiplyScalar(0.5)
        m.quaternion.setFromUnitVectors(up, vb.clone().sub(va).normalize())
        root.add(m)
      }
      for (const n of topo.nodes) {
        const p = pos.get(n.id)
        if (!p) continue
        const r = TYPE_SIZE[n.type]
        const geo = n.type === 'switch' ? new THREE.BoxGeometry(r * 2, r * 0.9, r * 1.4) : n.type === 'router' ? new THREE.CylinderGeometry(r, r, r * 0.9, 20) : n.type === 'firewall' ? new THREE.BoxGeometry(r * 1.8, r * 1.4, r * 0.7) : n.type === 'database' || n.type === 'storage' ? new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 1.6, 20) : n.type === 'server' ? new THREE.BoxGeometry(r * 1.2, r * 1.8, r * 1.2) : new THREE.SphereGeometry(r, 20, 14)
        const isDim = dim(n.id)
        const mat = new THREE.MeshStandardMaterial({ color: TYPE_COLOR[n.type], roughness: 0.45, metalness: 0.15, transparent: isDim, opacity: isDim ? 0.2 : 1, emissive: n.id === selected || matches.has(n.id) ? '#ffffff' : '#000000', emissiveIntensity: 0.35 })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(...p)
        mesh.userData.id = n.id
        if (matches.has(n.id) || n.id === selected) mesh.userData.pulse = true
        root.add(mesh)
        if (s.spof && spof.has(n.id)) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: '#f43f5e', transparent: true, opacity: isDim ? 0.2 : 0.9 }))
          ring.position.set(...p)
          ring.rotation.x = Math.PI / 2
          root.add(ring)
        }
        if (s.labels && (!isDim || matches.has(n.id))) {
          const lb = label(n.label, isDim ? '#64748b' : '#e2e8f0', 0.32)
          lb.position.set(p[0], p[1] + r + 0.28, p[2])
          root.add(lb)
        }
      }
    },
    [topo, pos, selected, q, matches, s.labels, s.spof, pathEdges, s.edgeWidth, spof, adj],
    { camera: [0, 2.5, 11.5], grid: false, background: '#0b1120' },
  )

  const ids = topo?.nodes.map((n) => [n.id, n.label] as [string, string]) ?? []
  const sel = topo?.nodes.find((n) => n.id === selected)
  const lat = topo?.links.map((l) => l.latency) ?? []
  const avgLat = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0
  const deg = (id: string) => adj.get(id)?.length ?? 0
  const hubs = topo ? [...topo.nodes].sort((a, b) => deg(b.id) - deg(a.id)).slice(0, 5) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Topology data" actions={<><Btn onClick={() => set({ format: 'json', text: SAMPLE_JSON, from: 'pc1', to: 'db1' })}>Data-center sample</Btn><Btn onClick={() => set({ format: 'csv', text: SAMPLE_CSV, from: 'MAD-pop', to: 'NRT-dc' })}>Backbone CSV</Btn></>}>
          <Row>
            <Seg value={s.format} onChange={(format) => set({ format })} options={[['json', 'JSON'], ['csv', 'CSV edge list']]} />
          </Row>
          <Area value={s.text} onChange={(text) => set({ text })} rows={12} mono />
          <FileDrop accept=".json,.csv,.txt,.tsv" label="Load a .json or .csv file" onFiles={async ([f]) => {
            const text = await f.text()
            set({ text, format: /\.json$/i.test(f.name) || text.trim().startsWith('{') ? 'json' : 'csv' })
          }} />
          {parsed.error && <Note tone="err">Cannot read topology: {parsed.error}</Note>}
          {topo && topo.warnings.length > 0 && <Note tone="warn">{topo.warnings.slice(0, 4).join(' · ')}{topo.warnings.length > 4 ? ` · +${topo.warnings.length - 4} more` : ''}</Note>}
          <p className="muted" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
            JSON: <code>{'{nodes:[{id,label,type,ip,group}], links:[{source,target,latency,bandwidth}]}'}</code>. CSV: <code>source,target,latency_ms,bandwidth_mbps,source_type,target_type</code>. Types: {TYPES.join(', ')} (guessed from names when missing).
          </p>
        </Panel>
        <Panel title="Lowest-latency route">
          <Row>
            <Select label="From" value={s.from} onChange={(from) => set({ from })} options={ids.length ? ids : [['', '—']]} />
            <Select label="To" value={s.to} onChange={(to) => set({ to })} options={ids.length ? ids : [['', '—']]} />
          </Row>
          {route ? (
            <>
              <Stats>
                <Stat label="One-way latency" value={`${num(route.latency, 2)} ms`} sub={`RTT ≈ ${num(route.latency * 2, 2)} ms`} tone="accent" />
                <Stat label="Hops" value={route.path.length - 1} />
                <Stat label="Bottleneck" value={route.path.length > 1 ? mbps(route.bottleneck) : '—'} />
              </Stats>
              <p style={{ fontSize: 13 }}>{route.path.map((id) => topo?.nodes.find((n) => n.id === id)?.label ?? id).join(' → ')}</p>
            </>
          ) : (
            <Note tone="warn">No route between these devices.</Note>
          )}
        </Panel>
      </div>
      <div>
        <Panel title="3D topology" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Search (name, IP, type, group)" value={s.search} onChange={(search) => set({ search })} placeholder="e.g. db, 10.1.1, switch" />
            <Slider label="Link thickness" value={s.edgeWidth} onChange={(edgeWidth) => set({ edgeWidth })} min={0.5} max={3} step={0.1} show={(v) => `${v.toFixed(1)}×`} />
          </Row>
          <Row>
            <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
            <Check label="Ring single points of failure" value={s.spof} onChange={(v) => set({ spof: v })} />
            {q && <span className="muted">{matches.size} match{matches.size === 1 ? '' : 'es'}</span>}
          </Row>
          <View3D refEl={ref} height={460} />
          <div className="k-legend" style={{ marginTop: 8 }}>
            {TYPES.filter((t) => topo?.nodes.some((n) => n.type === t)).map((t) => (
              <span key={t}><i style={{ background: TYPE_COLOR[t] }} />{t}</span>
            ))}
            <span><i style={{ background: 'linear-gradient(90deg,' + [0.5, 5, 30, 150].map((v) => latencyColor(v)).join(',') + ')', width: 40 }} />latency 0.5 → 150 ms</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit, scroll to zoom, click a device to inspect it and its neighbours. The white route is the lowest-latency path.</p>
        </Panel>
        {topo && (
          <Stats>
            <Stat label="Devices" value={topo.nodes.length} />
            <Stat label="Links" value={topo.links.length} />
            <Stat label="Avg link latency" value={`${num(avgLat, 2)} ms`} />
            <Stat label="Single points of failure" value={spof.size} tone={spof.size ? 'bad' : 'good'} sub={comps.length > 1 ? `${comps.length} disconnected islands` : 'fully connected'} />
          </Stats>
        )}
        {sel && (
          <Panel title={`Device: ${sel.label}`} actions={<Btn kind="ghost" onClick={() => setSelected(null)}>✕</Btn>}>
            <p>
              <b>{sel.type}</b> · id <code>{sel.id}</code>{sel.ip && <> · IP <code>{sel.ip}</code></>}{sel.group && <> · group {sel.group}</>}
              {spof.has(sel.id) && <span style={{ color: 'var(--err)' }}> · single point of failure</span>}
            </p>
            <Table head={['Neighbour', 'Type', 'Latency', 'Bandwidth']} rows={(adj.get(sel.id) ?? []).map((e: { to: string; link: { latency: number; bandwidth: number } }) => {
              const nb = topo?.nodes.find((n) => n.id === e.to)
              return [<button key="b" type="button" className="k-btn ghost" onClick={() => setSelected(e.to)}>{nb?.label ?? e.to}</button>, nb?.type ?? '', <span key="l" style={{ color: latencyColor(e.link.latency) }}>{num(e.link.latency, 2)} ms</span>, mbps(e.link.bandwidth)]
            })} />
            <Row>
              <Btn onClick={() => set({ from: sel.id })}>Route from here</Btn>
              <Btn onClick={() => set({ to: sel.id })}>Route to here</Btn>
            </Row>
          </Panel>
        )}
        {topo && (
          <Panel title="Most connected devices" actions={
            <>
              <CsvButton name="topology-links.csv" rows={() => [['source', 'target', 'latency_ms', 'bandwidth_mbps'], ...topo.links.map((l) => [l.source, l.target, l.latency, l.bandwidth])]} />
              <Btn onClick={() => download('topology.json', pretty({ nodes: topo.nodes, links: topo.links }), 'application/json')}>⬇ JSON</Btn>
            </>
          }>
            <Table head={['Device', 'Type', 'Links', 'Risk']} rows={hubs.map((n) => [
              <button key="b" type="button" className="k-btn ghost" onClick={() => setSelected(n.id)}>{n.label}</button>, n.type, deg(n.id), spof.has(n.id) ? <span key="r" style={{ color: 'var(--err)' }}>SPOF</span> : 'redundant',
            ])} />
            {spof.size > 0 && <Note tone="warn">Failure of {[...spof].slice(0, 6).map((id) => topo.nodes.find((n) => n.id === id)?.label ?? id).join(', ')}{spof.size > 6 ? '…' : ''} would split the network. Add a redundant link to remove the risk.</Note>}
          </Panel>
        )}
      </div>
    </Split>
  )
}
