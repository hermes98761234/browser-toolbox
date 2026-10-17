import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, CsvButton, download, FileDrop, Legend, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { buildGraph, layout, SAMPLE, type EdgeType, type Res } from './lib/cluster-manifest-graph'

const KIND_COLOR: Record<string, string> = {
  Ingress: '#f97316', Service: '#0ea5e9', Deployment: '#6366f1', StatefulSet: '#8b5cf6', DaemonSet: '#a855f7', ReplicaSet: '#818cf8',
  Job: '#ec4899', CronJob: '#db2777', Pod: '#4f46e5', ConfigMap: '#10b981', Secret: '#ef4444', PersistentVolumeClaim: '#eab308',
  PersistentVolume: '#ca8a04', StorageClass: '#a16207', ServiceAccount: '#14b8a6', Role: '#64748b', ClusterRole: '#475569',
  RoleBinding: '#94a3b8', ClusterRoleBinding: '#94a3b8', HorizontalPodAutoscaler: '#84cc16', NetworkPolicy: '#f43f5e', PodDisruptionBudget: '#fb7185',
}
const kc = (k: string) => KIND_COLOR[k] ?? '#64748b'
const SHORT: Record<string, string> = { HorizontalPodAutoscaler: 'HPA', PersistentVolumeClaim: 'PVC', PersistentVolume: 'PV', PodDisruptionBudget: 'PDB', NetworkPolicy: 'NetPol', ServiceAccount: 'SA', ConfigMap: 'ConfigMap', ClusterRoleBinding: 'CRB' }
const EDGE_STYLE: Record<EdgeType, { c: string; dash?: string }> = {
  selects: { c: '#0ea5e9' }, routes: { c: '#f97316' }, mounts: { c: '#10b981' }, env: { c: '#10b981', dash: '5 4' }, uses: { c: '#14b8a6', dash: '2 3' },
  scales: { c: '#84cc16' }, binds: { c: '#94a3b8' }, claims: { c: '#eab308' }, policy: { c: '#f43f5e', dash: '6 3' },
}
const NW = 160, NH = 44

export default function ClusterManifestGraph() {
  const [s, set, reset] = useToolState('cluster-manifest-graph', { yaml: SAMPLE, ns: '*', hideMissing: false, edgeLabels: false, zoom: 1 })
  const [sel, setSel] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const g0 = useMemo(() => buildGraph(s.yaml), [s.yaml])
  const namespaces = useMemo(() => [...new Set(g0.nodes.map((n) => n.ns).filter(Boolean))].sort(), [g0])
  const g = useMemo(() => {
    const keep = (n: Res) => (s.ns === '*' || n.ns === s.ns || !n.ns) && !(s.hideMissing && n.missing)
    const nodes = g0.nodes.filter(keep)
    const ids = new Set(nodes.map((n) => n.id))
    return { ...g0, nodes, edges: g0.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) }
  }, [g0, s.ns, s.hideMissing])
  const L = useMemo(() => layout(g, 215, 60), [g])
  const near = useMemo(() => {
    if (!sel) return null
    const set = new Set([sel])
    g.edges.forEach((e) => { if (e.from === sel) set.add(e.to); if (e.to === sel) set.add(e.from) })
    return set
  }, [sel, g])
  const selNode = g.nodes.find((n) => n.id === sel)
  const kinds = [...new Set(g.nodes.map((n) => n.kind))]
  const orphans = g.nodes.filter((n) => !n.missing && !g.edges.some((e) => e.from === n.id || e.to === n.id))

  const exportSvg = () => {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('style', 'background:#fff;font-family:sans-serif')
    download('cluster-graph.svg', clone.outerHTML.replaceAll('var(--panel)', '#ffffff').replaceAll('var(--muted)', '#64748b').replaceAll('var(--err)', '#ef4444'), 'image/svg+xml')
  }

  return (
    <div>
        <Stats>
          <Stat label="Resources" value={g.nodes.filter((n) => !n.missing).length} sub={`${kinds.length} kinds`} />
          <Stat label="Relationships" value={g.edges.length} />
          <Stat label="Missing refs" value={g.nodes.filter((n) => n.missing).length} tone={g.nodes.some((n) => n.missing) ? 'bad' : 'good'} />
          <Stat label="Unconnected" value={orphans.length} sub={orphans.slice(0, 2).map((o) => o.name).join(', ')} />
        </Stats>
        <Panel title="Relationship graph" actions={<><Btn onClick={exportSvg}>⬇ SVG</Btn><CsvButton name="cluster-edges.csv" rows={() => [['From', 'To', 'Relation', 'Detail'], ...g.edges.map((e) => [e.from, e.to, e.type, e.label])]} /></>}>
          {g.nodes.length === 0 ? <Note tone="warn">No resources found. Paste manifests with kind and metadata.name.</Note> : (
            <div style={{ overflow: 'auto', maxHeight: 640, border: '1px solid var(--line)', borderRadius: 8 }}>
              <svg ref={svgRef} width={L.width * s.zoom} height={L.height * s.zoom} viewBox={`0 0 ${L.width} ${L.height}`} style={{ display: 'block' }} onClick={() => setSel(null)}>
                <defs>
                  {Object.entries(EDGE_STYLE).map(([t, st]) => (
                    <marker key={t} id={'arr-' + t} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={st.c} /></marker>
                  ))}
                </defs>
                {g.edges.map((e, i) => {
                  const a = L.pos.get(e.from)!, b = L.pos.get(e.to)!
                  const back = b.x < a.x
                  const same = b.x === a.x
                  const x1 = a.x + (back ? 0 : NW), y1 = a.y + NH / 2
                  const x2 = same ? b.x + NW : b.x + (back ? NW : 0), y2 = b.y + NH / 2
                  const dx = same ? 60 : Math.max(40, Math.abs(x2 - x1) / 2)
                  const d = same ? `M${a.x + NW},${y1} C${a.x + NW + dx},${y1} ${x2 + dx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + (back ? -dx : dx)},${y1} ${x2 + (back ? dx : -dx)},${y2} ${x2},${y2}`
                  const st = EDGE_STYLE[e.type]
                  const dim = near && !(near.has(e.from) && near.has(e.to) && (e.from === sel || e.to === sel))
                  return (
                    <g key={i} opacity={dim ? 0.12 : 0.9}>
                      <path d={d} fill="none" stroke={st.c} strokeWidth={1.6} strokeDasharray={st.dash} markerEnd={`url(#arr-${e.type})`} />
                      {s.edgeLabels && !dim && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3} fontSize={9.5} textAnchor="middle" fill="var(--muted)" style={{ paintOrder: 'stroke' }} stroke="var(--panel)" strokeWidth={3}>{e.label}</text>}
                    </g>
                  )
                })}
                {g.nodes.map((n) => {
                  const p = L.pos.get(n.id)!
                  const c = kc(n.kind)
                  const dim = near && !near.has(n.id)
                  return (
                    <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.25 : 1} style={{ cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSel(n.id === sel ? null : n.id) }}>
                      <title>{n.id}</title>
                      <rect width={NW} height={NH} rx={8} fill="var(--panel)" stroke={n.missing ? 'var(--err)' : c} strokeWidth={n.id === sel ? 3 : 1.5} strokeDasharray={n.missing ? '5 3' : undefined} />
                      <rect width={6} height={NH} rx={3} fill={c} />
                      <text x={14} y={17} fontSize={10.5} fontWeight={700} fill={c}>{SHORT[n.kind] ?? n.kind}{n.missing ? ' · missing' : ''}</text>
                      <text x={14} y={33} fontSize={12.5} fill="currentColor">{n.name.length > 21 ? n.name.slice(0, 20) + '…' : n.name}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Legend items={kinds.map((k) => [k, kc(k)] as [string, string])} />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Edges: {Object.entries(EDGE_STYLE).map(([t, st]) => <span key={t} style={{ marginRight: 10, color: st.c }}>{st.dash ? '┄' : '—'} {t}</span>)}
            </div>
          </div>
        </Panel>
        {selNode ? (
          <Panel title={`${selNode.kind} · ${selNode.name}`} actions={<Btn kind="ghost" onClick={() => setSel(null)}>Close</Btn>}>
            {selNode.missing && <Note tone="err">Referenced but not defined in these manifests.</Note>}
            <p className="muted" style={{ margin: '0 0 8px' }}>Namespace: <b>{selNode.ns || '(cluster-scoped)'}</b></p>
            {Object.keys(selNode.labels).length > 0 && <p style={{ margin: '0 0 8px' }}>Labels: {Object.entries(selNode.labels).map(([k, v]) => <code key={k} style={{ marginRight: 6 }}>{k}={v}</code>)}</p>}
            {selNode.podLabels && Object.keys(selNode.podLabels).length > 0 && <p style={{ margin: '0 0 8px' }}>Pod labels: {Object.entries(selNode.podLabels).map(([k, v]) => <code key={k} style={{ marginRight: 6 }}>{k}={v}</code>)}</p>}
            <Table head={['Direction', 'Resource', 'Relation']} rows={g.edges.filter((e) => e.from === selNode.id || e.to === selNode.id).map((e) => {
              const out = e.from === selNode.id
              const other = out ? e.to : e.from
              return [out ? '→ out' : '← in', <a key="o" href="#" onClick={(ev) => { ev.preventDefault(); setSel(other) }}>{other}</a>, `${e.type} (${e.label})`]
            })} />
          </Panel>
        ) : <Note>Click a resource to highlight its neighbours and see its labels and relations.</Note>}
      <Split>
        <div>
        <Panel title="Manifests" actions={<><Btn onClick={() => set({ yaml: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={() => { reset(); setSel(null) }}>Reset</Btn></>}>
          <FileDrop accept=".yaml,.yml,.json,.txt" multiple onFiles={async (fs) => {
            const texts = await Promise.all(fs.map((f) => f.text()))
            set({ yaml: texts.join('\n---\n') })
            setSel(null)
          }} label="Drop .yaml files (several are merged) or click" />
          <Area value={s.yaml} onChange={(yaml) => set({ yaml })} rows={16} mono placeholder="Paste multi-document YAML separated by ---" />
          <Note>Supports Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, Pods, Services, Ingresses, ConfigMaps, Secrets, PVCs, HPAs, NetworkPolicies, PDBs, RBAC and kind: List. Everything stays in your browser.</Note>
        </Panel>
        </div>
        <div>
        <Panel title="View">
          <Row>
            <Select label="Namespace" value={s.ns} onChange={(ns) => set({ ns })} options={[['*', 'All namespaces'], ...namespaces.map((n) => [n, n] as [string, string])]} />
            <Slider label="Zoom" value={s.zoom} onChange={(zoom) => set({ zoom })} min={0.5} max={1.6} step={0.1} show={(v) => Math.round(v * 100) + '%'} />
          </Row>
          <Check label="Hide missing (dangling) references" value={s.hideMissing} onChange={(hideMissing) => set({ hideMissing })} />
          <Check label="Edge labels" value={s.edgeLabels} onChange={(edgeLabels) => set({ edgeLabels })} />
        </Panel>
        {(g0.errors.length > 0 || g0.warnings.length > 0) && (
          <Panel title={`Findings (${g0.errors.length + g0.warnings.length})`}>
            {g0.errors.map((e, i) => <Note key={'e' + i} tone="err">{e}</Note>)}
            {g0.warnings.map((w, i) => <Note key={'w' + i} tone="warn">{w}</Note>)}
          </Panel>
        )}
        </div>
      </Split>
    </div>
  )
}
