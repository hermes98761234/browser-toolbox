import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, BarChart, Btn, Check, Note, Panel, Row, Seg, Split, Stat, Stats, color, download, num, useToolState } from '../kit'
import { THREE, View3D, label, useStage3D, type Stage3D } from '../kit/three'
import { parseCsv } from './lib/barcode-label-maker'
import { buildTree, parseRows, stats, type Node } from './lib/org-chart-maker'
import { chain, forceLayout, parents, radialLayout, sampleOrg, subtreeIds, type P3 } from './lib/3d-org-explorer'

interface State { csv: string; layout: 'cone' | 'force'; colorBy: 'dept' | 'depth'; labels: 'auto' | 'all' | 'none'; focus: string; hidden: string[]; spin: boolean }
const DEF: State = { csv: '', layout: 'cone', colorBy: 'dept', labels: 'auto', focus: '', hidden: [], spin: false }
const DEPTH_COL = ['#f59e0b', '#ef4444', '#a855f7', '#6366f1', '#0ea5e9', '#10b981', '#84cc16']

export default function OrgExplorer3D() {
  const [s, set, reset] = useToolState('3d-org-explorer', DEF)
  const [q, setQ] = useState('')
  const [hover, setHover] = useState<{ n: Node; x: number; y: number } | null>(null)
  const csv = s.csv || sampleOrg()
  const org = useMemo(() => {
    const t = buildTree(parseRows(parseCsv(csv)))
    return { ...t, par: parents(t.roots), st: stats(t.roots) }
  }, [csv])
  const pos = useMemo(() => (s.layout === 'force' ? forceLayout(org.roots) : radialLayout(org.roots)), [org, s.layout])
  const depts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of org.byId.values()) m.set(n.dept || '—', (m.get(n.dept || '—') ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [org])
  const deptColor = (d: string) => color(Math.max(0, depts.findIndex(([x]) => x === (d || '—'))))
  const colOf = (n: Node) => (s.colorBy === 'dept' ? deptColor(n.dept) : DEPTH_COL[n.depth % DEPTH_COL.length])
  const focus = org.byId.get(s.focus)
  const path = focus ? chain(org.byId, org.par, focus.id) : []
  const lit = useMemo(() => {
    if (!focus) return null
    const set = subtreeIds(focus)
    for (const n of chain(org.byId, org.par, focus.id)) set.add(n.id)
    return set
  }, [focus, org])

  const meshes = useRef<THREE.Mesh[]>([])
  const target = useRef<THREE.Vector3 | null>(null)
  const hoverRef = useRef(setHover)
  const pickRef = useRef<(id: string) => void>(() => {})
  const spinRef = useRef(s.spin)
  useEffect(() => {
    pickRef.current = (id) => set({ focus: id === s.focus ? '' : id })
    spinRef.current = s.spin
  })

  const ref = useStage3D(
    (st: Stage3D) => {
      const g = new THREE.Group()
      g.name = 'org'
      st.scene.add(g)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const m = new THREE.Vector2()
      let downAt: [number, number] | null = null
      const hitAt = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        m.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.setFromCamera(m, st.camera)
        return { h: ray.intersectObjects(meshes.current.filter((x) => x.visible))[0]?.object as THREE.Mesh | undefined, r }
      }
      const onMove = (e: PointerEvent) => {
        const { h, r } = hitAt(e)
        hoverRef.current(h ? { n: h.userData.node as Node, x: e.clientX - r.left, y: e.clientY - r.top } : null)
        el.style.cursor = h ? 'pointer' : 'grab'
      }
      const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
        const { h } = hitAt(e)
        if (h) pickRef.current((h.userData.node as Node).id)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      st.onFrame((_t, dt) => {
        if (target.current) {
          st.controls.target.lerp(target.current, Math.min(1, dt * 4))
          if (st.controls.target.distanceTo(target.current) < 0.01) target.current = null
        }
        if (spinRef.current) g.rotation.y += dt * 0.15
      })
      return () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('org')!
      st.clear(g)
      meshes.current = []
      const visible = (n: Node) => !s.hidden.includes(n.dept || '—')
      const geo = new THREE.SphereGeometry(1, 20, 14)
      const lineCol: number[] = [], linePos: number[] = [], dimPos: number[] = []
      for (const n of org.byId.values()) {
        const p = pos.get(n.id) as P3
        if (!p || !visible(n)) continue
        const on = !lit || lit.has(n.id)
        const mat = new THREE.MeshStandardMaterial({ color: colOf(n), roughness: 0.4, transparent: !on, opacity: on ? 1 : 0.12, emissive: n.id === s.focus ? 0x444444 : 0x000000 })
        const mesh = new THREE.Mesh(geo, mat)
        const r = 0.22 + 0.07 * Math.sqrt(n.size)
        mesh.scale.setScalar(n.id === s.focus ? r * 1.5 : r)
        mesh.position.set(...p)
        mesh.userData.node = n
        g.add(mesh)
        meshes.current.push(mesh)
        for (const c of n.children) {
          const q = pos.get(c.id)
          if (!q || !visible(c)) continue
          const hot = !lit || (lit.has(c.id) && lit.has(n.id))
          ;(hot ? linePos : dimPos).push(...p, ...q)
          if (hot) {
            const col = new THREE.Color(colOf(c))
            lineCol.push(col.r, col.g, col.b, col.r, col.g, col.b)
          }
        }
        const showLabel = s.labels === 'all' || (s.labels === 'auto' && (n.depth <= 1 || n.id === s.focus || (focus && (org.par.get(n.id) === focus.id || path.includes(n)))))
        if (showLabel && on) {
          const l = label(n.name, '#f8fafc', n.depth === 0 || n.id === s.focus ? 0.55 : 0.4)
          l.position.set(p[0], p[1] + r + 0.4, p[2])
          g.add(l)
        }
      }
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
      lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3))
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 })))
      if (dimPos.length) {
        const dg = new THREE.BufferGeometry()
        dg.setAttribute('position', new THREE.Float32BufferAttribute(dimPos, 3))
        g.add(new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.12 })))
      }
      const fp = focus && pos.get(focus.id)
      const depth = org.st.depth
      target.current = fp ? new THREE.Vector3(fp[0], fp[1] - 1.2, fp[2]) : new THREE.Vector3(0, -((depth - 1) * 2.4) / 2, 0)
    },
    [org, pos, s.focus, s.hidden, s.labels, s.colorBy, lit],
    { camera: [16, 6, 22], grid: false, background: '#0b1020' },
  )

  const matches = q.trim() ? [...org.byId.values()].filter((n) => `${n.name} ${n.title} ${n.dept}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const pick = (id: string) => set({ focus: id })

  return (
    <Split wide="right">
      <div>
        <Panel title="Find a person">
          <input className="k-text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, title or department…" aria-label="Search people" style={{ width: '100%' }} />
          {matches.map((n) => (
            <button key={n.id} type="button" className="k-btn ghost" onClick={() => { pick(n.id); setQ('') }} style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', gap: 8 }}>
              <i style={{ width: 10, height: 10, borderRadius: '50%', background: colOf(n), flex: '0 0 auto' }} /> <b>{n.name}</b> <span className="muted">{n.title}</span>
            </button>
          ))}
        </Panel>
        {focus ? (
          <Panel title={focus.name} actions={<Btn kind="ghost" onClick={() => set({ focus: '' })}>✕ Clear</Btn>}>
            <p style={{ margin: '0 0 6px' }}><b>{focus.title || '—'}</b> · <span style={{ color: deptColor(focus.dept) }}>{focus.dept || 'No department'}</span></p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 13, marginBottom: 8 }}>
              {path.map((n, i) => <span key={n.id}>{i > 0 && '› '}<button type="button" className="k-btn ghost" style={{ padding: '0 4px' }} onClick={() => pick(n.id)}>{n.name}</button></span>)}
            </div>
            <Stats>
              <Stat label="Direct reports" value={focus.children.length} />
              <Stat label="Total org" value={focus.size} sub="people below" />
              <Stat label="Level" value={focus.depth + 1} />
            </Stats>
            {focus.children.length > 0 && (
              <div style={{ display: 'grid', gap: 2, maxHeight: 240, overflow: 'auto' }}>
                {focus.children.map((c) => (
                  <button key={c.id} type="button" className="k-btn ghost" onClick={() => pick(c.id)} style={{ justifyContent: 'space-between', display: 'flex' }}>
                    <span><b>{c.name}</b> <span className="muted">{c.title}</span></span><span className="muted">{c.size ? `+${c.size}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        ) : (
          <Note>Click any sphere to focus a person: their management chain and whole sub-organization stay lit, everyone else fades. Drag to orbit, scroll to zoom.</Note>
        )}
        <Panel title="Departments">
          {depts.map(([d, n]) => (
            <Check key={d} value={!s.hidden.includes(d)} onChange={(on) => set({ hidden: on ? s.hidden.filter((x) => x !== d) : [...s.hidden, d] })}
              label={<><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: deptColor(d), marginRight: 6 }} />{d} <span className="muted">({n})</span></>} />
          ))}
        </Panel>
        <Panel title="Data (CSV)" actions={<><Btn onClick={() => set({ csv: '', focus: '' })}>Sample company</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Area value={csv} onChange={(v) => set({ csv: v, focus: '' })} rows={6} mono />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Columns: id, name, title, manager (id or name), department. Paste an HR export or the CSV from the Org Chart Maker.</p>
          {(org.problems.missingManager.length > 0 || org.problems.cycles.length > 0 || org.problems.duplicates.length > 0) && (
            <Note tone="warn">
              {org.problems.missingManager.length > 0 && <div>Unknown manager: {org.problems.missingManager.slice(0, 5).join('; ')}</div>}
              {org.problems.cycles.length > 0 && <div>Reporting loop broken at: {org.problems.cycles.join(', ')}</div>}
              {org.problems.duplicates.length > 0 && <div>Duplicate ids skipped: {org.problems.duplicates.join(', ')}</div>}
            </Note>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="People" value={num(org.st.count, 0)} />
          <Stat label="Levels" value={org.st.depth} />
          <Stat label="Managers" value={org.st.managers} sub={`${num(org.st.avgSpan, 1)} avg span`} />
          <Stat label="Widest span" value={org.st.spanMax} tone={org.st.spanMax > 10 ? 'bad' : undefined} sub={org.st.spanMax > 10 ? 'above 10 is hard to manage' : 'direct reports'} />
        </Stats>
        <Panel title="Organization in 3D" actions={
          <>
            <Seg value={s.layout} onChange={(layout) => set({ layout })} options={[['cone', 'Cone tree'], ['force', 'Force']]} />
            <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['dept', 'By dept'], ['depth', 'By level']]} />
          </>
        }>
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={560} />
            {hover && (
              <div className="k-tip" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 10, position: 'absolute', pointerEvents: 'none' }}>
                <b>{hover.n.name}</b><br />{hover.n.title}<br /><span className="muted">{hover.n.dept} · {hover.n.children.length} direct · {hover.n.size} total</span>
              </div>
            )}
          </div>
          <Row>
            <Seg value={s.labels} onChange={(labels) => set({ labels })} options={[['auto', 'Smart labels'], ['all', 'All names'], ['none', 'No labels']]} />
            <Check label="Slow spin" value={s.spin} onChange={(spin) => set({ spin })} />
            <Btn onClick={() => { const c = (ref.current?.querySelector('canvas') as HTMLCanvasElement | null); c?.toBlob((b) => b && download('org-3d.png', b)) }}>⬇ PNG</Btn>
          </Row>
        </Panel>
        <Panel title="Headcount by department">
          <BarChart bars={depts.map(([d, n]) => ({ label: d, value: n, color: deptColor(d) }))} height={220} fy={(v) => num(v, 0)} />
        </Panel>
      </div>
    </Split>
  )
}
