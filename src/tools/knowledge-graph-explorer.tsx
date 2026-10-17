import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Area, Btn, Check, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, color, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { fuzzyScore } from './lib/food-diary'
import { buildGraph, ForceSim, key, neighborhood, shortestPath, splitNotes, type Graph } from './lib/knowledge-graph-explorer'

interface State { text: string; sel: string; depth: number; labels: 'hubs' | 'all' | 'none'; ghosts: boolean; q: string; pathTo: string }

const SAMPLE = `# Zettelkasten
A note-taking method built on small [[Atomic notes]] connected by links. Popularised by [[Niklas Luhmann]]. See also [[Evergreen notes]] and [[Linking your thinking]]. #method

# Atomic notes
One idea per note, written in your own words so it can be reused in many contexts. Makes [[Linking your thinking]] easier and supports [[Spaced repetition]] cards. #principle

# Niklas Luhmann
German sociologist who wrote ~70 books with a paper [[Zettelkasten]] of 90,000 cards. #person

# Evergreen notes
Notes that evolve and accumulate over time (term from [[Andy Matuschak]]). They should be [[Atomic notes]] and densely linked. Related: [[Progressive summarization]]. #principle

# Andy Matuschak
Researcher writing about tools for thought, [[Evergreen notes]] and the [[Mnemonic medium]]. #person

# Mnemonic medium
Essays with embedded [[Spaced repetition]] prompts. #idea

# Spaced repetition
Reviewing material at increasing intervals to exploit the [[Spacing effect]]. Used by [[Anki]]. Pairs well with [[Active recall]]. #learning

# Spacing effect
Memory is stronger when study sessions are spread out over time; first described by [[Hermann Ebbinghaus]]. #learning

# Hermann Ebbinghaus
Pioneer of memory research; discovered the [[Forgetting curve]] and the [[Spacing effect]]. #person

# Forgetting curve
Retention decays roughly exponentially without review — the motivation for [[Spaced repetition]]. #learning

# Active recall
Retrieving information from memory (testing yourself) beats re-reading. Core of [[Anki]] and the [[Feynman technique]]. #learning

# Anki
Open-source flashcard app implementing [[Spaced repetition]] with the SM-2 family of algorithms. #tool

# Feynman technique
Explain a concept in plain language as if teaching; gaps reveal what you don't understand. Uses [[Active recall]] and produces good [[Atomic notes]]. #method

# Linking your thinking
Connecting ideas with links creates emergent structure: [[Maps of content]] act as hubs. Inspired by the [[Zettelkasten]]. #principle

# Maps of content
Index notes that gather links on a topic, e.g. a hub for [[Spaced repetition]], [[Zettelkasten]] and [[PARA method]]. #structure

# PARA method
Projects, Areas, Resources, Archives — an organising scheme by [[Tiago Forte]], often combined with [[Progressive summarization]]. #method

# Tiago Forte
Author of Building a Second Brain; created [[PARA method]] and [[Progressive summarization]]. #person

# Progressive summarization
Highlight in layers: bold the key passages, then highlight the best of those. Helps distil notes into [[Evergreen notes]]. #method

# Deliberate practice
Focused practice on weaknesses with immediate feedback. Benefits from [[Active recall]] and [[Interleaving]]. #learning

# Interleaving
Mixing different problem types during practice; feels harder but transfers better. See [[Desirable difficulties]]. #learning

# Desirable difficulties
Robert Bjork's term for learning conditions that slow initial performance but improve retention: [[Spacing effect]], [[Interleaving]], [[Active recall]]. #learning
`

const DEF: State = { text: SAMPLE, sel: 'zettelkasten', depth: 0, labels: 'hubs', ghosts: true, q: '', pathTo: '' }

function renderBody(body: string, go: (t: string) => void): ReactNode[] {
  return body.split('\n').map((line, i) => {
    const h = line.match(/^(#{2,6})\s+(.*)/)
    const bullet = /^\s*[-*]\s+/.test(line)
    const txt = (h ? h[2] : line).replace(/^\s*[-*]\s+/, '')
    const parts: ReactNode[] = []
    let last = 0
    for (const m of txt.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]|\*\*([^*]+)\*\*/g)) {
      parts.push(txt.slice(last, m.index))
      if (m[3]) parts.push(<b key={m.index}>{m[3]}</b>)
      else parts.push(<a key={m.index} href="#" onClick={(e) => { e.preventDefault(); go(m[1]) }} style={{ color: 'var(--accent)' }}>{m[2] || m[1]}</a>)
      last = (m.index ?? 0) + m[0].length
    }
    parts.push(txt.slice(last))
    if (h) return <h4 key={i} style={{ margin: '10px 0 4px' }}>{parts}</h4>
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />
    return <div key={i} style={{ paddingLeft: bullet ? 14 : 0 }}>{bullet ? '• ' : ''}{parts}</div>
  })
}

export default function KnowledgeGraphExplorer() {
  const [s, set, reset] = useToolState('knowledge-graph-explorer', DEF)
  const graph: Graph = useMemo(() => {
    const full = buildGraph(splitNotes(s.text))
    if (s.ghosts) return full
    const keep = full.nodes.map((n, i) => (n.ghost ? -1 : i)).filter((i) => i >= 0)
    const remap = new Map(keep.map((old, i) => [old, i]))
    const nodes = keep.map((i) => full.nodes[i])
    return { nodes, edges: full.edges.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]), index: new Map(nodes.map((n, i) => [n.id, i])) }
  }, [s.text, s.ghosts])

  const selIdx = graph.index.get(s.sel) ?? -1
  const sel = selIdx >= 0 ? graph.nodes[selIdx] : null
  const deg = graph.nodes.map(() => 0)
  for (const [a, b] of graph.edges) { deg[a]++; deg[b]++ }
  const visible = selIdx >= 0 && s.depth > 0 ? neighborhood(graph, selIdx, s.depth) : null
  const pathIdx = graph.index.get(s.pathTo)
  const path = selIdx >= 0 && pathIdx !== undefined ? shortestPath(graph, selIdx, pathIdx) : null

  const live = useRef({ graph, sel: selIdx, visible, path, labels: s.labels, deg })
  useEffect(() => { live.current = { graph, sel: selIdx, visible, path, labels: s.labels, deg } })
  const setRef = useRef(set)
  useEffect(() => { setRef.current = set })
  const simRef = useRef<ForceSim | null>(null)
  const posMem = useRef(new Map<string, [number, number, number]>())
  const nodeG = useRef(new THREE.Group())
  const edgeObj = useRef<THREE.LineSegments | null>(null)
  const meshes = useRef<THREE.Mesh[]>([])
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const focus = useRef<THREE.Vector3 | null>(null)

  const ref = useStage3D(
    (st: Stage3D) => {
      st.scene.add(nodeG.current)
      const el = st.renderer.domElement
      let down: [number, number] | null = null
      const ray = new THREE.Raycaster()
      const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(meshes.current.filter((m) => m.visible))[0]
        if (hit) setRef.current({ sel: hit.object.userData.id as string })
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      st.onFrame(() => {
        const sim = simRef.current
        if (sim && sim.alpha > 0.004) {
          sim.step()
          const P = sim.pos
          meshes.current.forEach((m, i) => m.position.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]))
          sprites.current.forEach((sp, i) => sp && sp.position.set(P[i * 3], P[i * 3 + 1] + 0.75, P[i * 3 + 2]))
          const g = live.current.graph
          const attr = edgeObj.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
          if (attr) {
            g.edges.forEach(([a, b], k) => { attr.setXYZ(k * 2, P[a * 3], P[a * 3 + 1], P[a * 3 + 2]); attr.setXYZ(k * 2 + 1, P[b * 3], P[b * 3 + 1], P[b * 3 + 2]) })
            attr.needsUpdate = true
          }
          g.nodes.forEach((n, i) => posMem.current.set(n.id, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]))
        }
        const fsel = live.current.sel
        if (fsel >= 0 && meshes.current[fsel]) focus.current = meshes.current[fsel].position
        if (focus.current) {
          const d = focus.current.clone().sub(st.controls.target)
          if (d.lengthSq() > 1e-4) { const step = d.multiplyScalar(0.08); st.controls.target.add(step); st.camera.position.add(step) }
        }
      })
      return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp) }
    },
    (st) => {
      const { graph: g, sel: si, visible: vis, path: pth, labels, deg: dg } = live.current
      st.clear(nodeG.current)
      if (!simRef.current || simRef.current.n !== g.nodes.length || simRef.current.edges !== g.edges) {
        const prevAlpha = simRef.current?.alpha ?? 1
        const known = g.nodes.filter((n) => posMem.current.has(n.id)).length
        simRef.current = new ForceSim(g.nodes.length, g.edges, 11, (i) => posMem.current.get(g.nodes[i].id))
        simRef.current.alpha = known === g.nodes.length && known > 0 ? Math.max(0.05, prevAlpha) : known > 0 ? 0.5 : 1
        if (!known) simRef.current.run(40)
      }
      const P = simRef.current.pos
      const tagColor = new Map<string, string>()
      const tagOf = (t: string[]) => { if (!t[0]) return '#94a3b8'; if (!tagColor.has(t[0])) tagColor.set(t[0], color(tagColor.size)); return tagColor.get(t[0])! }
      const nb = si >= 0 ? neighborhood(g, si, 1) : null
      const onPath = new Set(pth ?? [])
      const hubs = new Set([...dg.keys()].sort((a, b) => dg[b] - dg[a]).slice(0, 10))
      meshes.current = []
      sprites.current = []
      g.nodes.forEach((n, i) => {
        const shown = !vis || vis.has(i)
        const dim = nb && !nb.has(i) && !onPath.has(i)
        const mat = new THREE.MeshStandardMaterial({ color: n.ghost ? '#475569' : tagOf(n.tags), emissive: i === si ? '#ffffff' : onPath.has(i) ? '#f59e0b' : '#000000', emissiveIntensity: i === si ? 0.45 : 0.35, transparent: true, opacity: dim ? 0.18 : n.ghost ? 0.55 : 1 })
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.28 + 0.1 * Math.sqrt(dg[i]), 20, 14), mat)
        m.position.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])
        m.userData.id = n.id
        m.visible = shown
        nodeG.current.add(m)
        meshes.current.push(m)
        const want = shown && labels !== 'none' && (labels === 'all' || i === si || (nb?.has(i) ?? false) || onPath.has(i) || (!nb && hubs.has(i)))
        if (want) {
          const sp = label(n.title, dim ? '#64748b' : n.ghost ? '#94a3b8' : '#f1f5f9', i === si ? 0.75 : 0.58)
          sp.position.set(P[i * 3], P[i * 3 + 1] + 0.75, P[i * 3 + 2])
          nodeG.current.add(sp)
          sprites.current.push(sp)
        } else sprites.current.push(null)
      })
      const pos = new Float32Array(g.edges.length * 6)
      const col = new Float32Array(g.edges.length * 6)
      g.edges.forEach(([a, b], k) => {
        pos.set([P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], k * 6)
        const pathEdge = pth && pth.some((v, j) => j > 0 && ((pth[j - 1] === a && v === b) || (pth[j - 1] === b && v === a)))
        const hidden = vis && (!vis.has(a) || !vis.has(b))
        const near = si >= 0 && (a === si || b === si)
        const c = hidden ? [0.06, 0.09, 0.16] : pathEdge ? [0.96, 0.62, 0.04] : near ? [0.9, 0.93, 1] : nb ? [0.2, 0.25, 0.33] : [0.42, 0.48, 0.6]
        col.set([...c, ...c], k * 6)
      })
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      edgeObj.current = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }))
      nodeG.current.add(edgeObj.current)
    },
    [graph, selIdx, s.depth, s.labels, s.pathTo],
    { camera: [0, 3, 17], background: '#0b1120', grid: false },
  )

  const go = (title: string) => {
    const k = key(title)
    if (graph.index.has(k)) set({ sel: k, pathTo: '' })
  }
  const results = s.q.trim()
    ? graph.nodes.map((n, i) => ({ i, sc: Math.max(fuzzyScore(s.q, n.title), n.tags.some((t) => t.includes(s.q.toLowerCase().replace('#', ''))) ? 5 : 0) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 8)
    : []

  const onFiles = async (files: File[]) => {
    const parts = await Promise.all(files.map(async (f) => {
      const t = await f.text()
      return /^#\s/m.test(t.trimStart().split('\n')[0]) ? t : `# ${f.name.replace(/\.(md|markdown|txt)$/i, '')}\n${t}`
    }))
    set({ text: parts.join('\n\n'), sel: '', pathTo: '' })
  }

  const ghosts = graph.nodes.filter((n) => n.ghost).length
  const orphans = graph.nodes.filter((_, i) => deg[i] === 0).length
  const topHubs = [...deg.keys()].sort((a, b) => deg[b] - deg[a]).slice(0, 5)

  return (
    <Split wide="right">
      <div>
        <Panel title="Search & focus">
          <input className="k-input" placeholder="Search notes or #tags…" value={s.q} onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) set({ sel: graph.nodes[results[0].i].id, q: '' }) }} aria-label="Search notes" style={{ width: '100%' }} />
          {results.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {results.map(({ i }) => <Btn key={i} kind="ghost" onClick={() => set({ sel: graph.nodes[i].id, q: '' })}>{graph.nodes[i].title}{graph.nodes[i].ghost ? ' (missing)' : ''}</Btn>)}
            </div>
          )}
          <Row>
            <span className="muted">Show</span>
            <Seg value={String(s.depth)} onChange={(v) => set({ depth: +v })} options={[['0', 'Everything'], ['1', '1 hop'], ['2', '2 hops'], ['3', '3 hops']]} />
          </Row>
          <Row>
            <span className="muted">Labels</span>
            <Seg value={s.labels} onChange={(labels) => set({ labels })} options={[['hubs', 'Hubs'], ['all', 'All'], ['none', 'None']]} />
          </Row>
          <Check label="Show unresolved links (ghost notes)" value={s.ghosts} onChange={(ghosts) => set({ ghosts })} />
          <Row><Btn kind="ghost" onClick={() => set({ sel: '', pathTo: '' })}>Clear focus</Btn><Btn kind="ghost" onClick={() => { simRef.current && (simRef.current.alpha = 1) }}>Re-heat layout</Btn></Row>
        </Panel>
        {sel && (
          <Panel title={sel.title}>
            {sel.tags.length > 0 && <p style={{ margin: '0 0 8px' }}>{sel.tags.map((t) => <span key={t} className="k-btn ghost" style={{ padding: '2px 8px', marginRight: 4, fontSize: 12 }}>#{t}</span>)}</p>}
            {sel.ghost ? <Note tone="warn">This note doesn't exist yet — it is only linked from other notes.</Note> : <div style={{ fontSize: 14, lineHeight: 1.55 }}>{renderBody(sel.body, go)}</div>}
            <h4 style={{ margin: '12px 0 4px' }}>Backlinks ({sel.inc.length})</h4>
            <Row>{sel.inc.length ? sel.inc.map((id) => <Btn key={id} kind="ghost" onClick={() => go(graph.nodes[graph.index.get(id)!]?.title ?? id)}>← {graph.nodes[graph.index.get(id)!]?.title ?? id}</Btn>) : <span className="muted">None</span>}</Row>
            <Select label="Shortest path to…" value={s.pathTo} onChange={(pathTo) => set({ pathTo })} options={[['', '—'], ...graph.nodes.filter((n) => n.id !== sel.id).map((n) => [n.id, n.title] as const).sort((a, b) => a[1].localeCompare(b[1]))]} />
            {s.pathTo && (path ? <p style={{ fontSize: 14 }}>{path.map((i) => graph.nodes[i].title).join(' → ')} <span className="muted">({path.length - 1} hops)</span></p> : <Note tone="warn">No path — the notes are in separate clusters.</Note>)}
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Notes" value={graph.nodes.length - ghosts} />
          <Stat label="Links" value={graph.edges.length} />
          <Stat label="Unresolved" value={ghosts} tone={ghosts ? 'bad' : 'good'} sub="ghost notes" />
          <Stat label="Orphans" value={orphans} sub="no links" />
        </Stats>
        <Panel title="3D graph">
          <View3D refEl={ref} height={520} />
          <p className="muted" style={{ fontSize: 13 }}>Click a node to focus it · drag to orbit · scroll to zoom. Colour = first tag, size = number of links. Hubs: {topHubs.map((i) => graph.nodes[i]?.title).filter(Boolean).join(', ')}.</p>
        </Panel>
        <Panel title="Notes (markdown)" actions={<><Btn kind="ghost" onClick={() => set({ text: '', sel: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          <FileDrop accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onFiles={(f) => void onFiles(f)} label="Drop .md files (one note per file) or a whole exported vault folder's files" />
          <Area value={s.text} onChange={(text) => set({ text })} rows={10} mono placeholder={'# Note title\nText with [[Wiki links]] and #tags\n\n# Another note\n…'} />
          <p className="muted" style={{ fontSize: 13 }}>Each <code># Heading</code> starts a note. Links: <code>[[Title]]</code>, <code>[[Title|alias]]</code>, <code>[[Title#section]]</code>. Matching is case-insensitive. Everything stays in your browser.</p>
        </Panel>
      </div>
    </Split>
  )
}
