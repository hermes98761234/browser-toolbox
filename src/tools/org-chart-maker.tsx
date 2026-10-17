import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, color, download, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { parseCsv } from './lib/barcode-label-maker'
import { buildTree, layout, parseRows, stats, type Box } from './lib/org-chart-maker'

const SAMPLE = `id,name,title,manager,department
1,Maya Chen,Chief Executive Officer,,Executive
2,Omar Haddad,Chief Technology Officer,1,Engineering
3,Lena Fischer,Chief Financial Officer,1,Finance
4,Diego Santos,VP Marketing,1,Marketing
5,Priya Nair,Engineering Manager — Platform,2,Engineering
6,Tom Becker,Engineering Manager — Apps,2,Engineering
7,Yuki Tanaka,Senior Backend Engineer,5,Engineering
8,Sam Okafor,Site Reliability Engineer,5,Engineering
9,Ivy Novak,Backend Engineer,5,Engineering
10,Noah Kim,iOS Engineer,6,Engineering
11,Ella Rossi,Android Engineer,6,Engineering
12,Jon Weiss,Product Designer,2,Design
13,Ava Martin,Controller,3,Finance
14,Leo Dubois,Accountant,13,Finance
15,Zoe Park,Payroll Specialist,13,Finance
16,Kai Müller,Content Lead,4,Marketing
17,Rita Gomez,Growth Marketer,4,Marketing
18,Ben Ito,SEO Specialist,16,Marketing
19,Hana Ali,Copywriter,16,Marketing
20,Max Brown,Social Media Manager,16,Marketing`

const DEF = { csv: SAMPLE, collapsed: [] as string[], dir: 'down' as 'down' | 'right', compact: true, zoom: 0, search: '', title: 'Acme Inc. — organization' }
const W = 200, H = 70

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export default function OrgChartMaker() {
  const [s, set, reset] = useToolState('org-chart-maker', DEF)
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(800)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { roots, problems, byId } = useMemo(() => buildTree(parseRows(parseCsv(s.csv))), [s.csv])
  const collapsed = useMemo(() => new Set(s.collapsed), [s.collapsed])
  const horiz = s.dir === 'right'
  const L = useMemo(() => layout(roots, collapsed, horiz ? { w: H, h: W, gx: 16, gy: 60, compact: false } : { w: W, h: H, gx: 24, gy: 50, compact: s.compact }), [roots, collapsed, horiz, s.compact])
  const st = stats(roots)
  const depts = [...new Set([...byId.values()].map((n) => n.dept || '—'))]
  const deptColor = (d: string) => color(depts.indexOf(d || '—'))
  const q = s.search.trim().toLowerCase()
  const match = (b: Box) => !!q && (b.node.name.toLowerCase().includes(q) || b.node.title.toLowerCase().includes(q))

  // convert layout space to screen space
  const pos = (b: Box) => (horiz ? { x: b.y, y: b.x } : { x: b.x, y: b.y })
  const pad = 20, titleH = s.title ? 40 : 0
  const totalW = (horiz ? L.height : L.width) + pad * 2
  const totalH = (horiz ? L.width : L.height) + pad * 2 + titleH
  const fit = Math.max(0.55, Math.min(1.2, (boxW - 4) / totalW))
  const zoom = s.zoom || fit

  const edges = L.boxes.filter((b) => b.parent).map((b) => {
    const p = pos(b.parent!), c = pos(b)
    if (b.stacked) return `M${p.x + 12},${p.y + H} V${c.y + H / 2} H${c.x}`
    if (horiz) {
      const mx = p.x + W + (c.x - p.x - W) / 2
      return `M${p.x + W},${p.y + H / 2} H${mx} V${c.y + H / 2} H${c.x}`
    }
    const my = p.y + H + (c.y - p.y - H) / 2
    return `M${p.x + W / 2},${p.y + H} V${my} H${c.x + W / 2} V${c.y}`
  })

  const toggle = (id: string) => set({ collapsed: collapsed.has(id) ? s.collapsed.filter((x) => x !== id) : [...s.collapsed, id] })
  const collapseLevel = (lvl: number) => set({ collapsed: [...byId.values()].filter((n) => n.depth >= lvl && n.children.length).map((n) => n.id) })

  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.removeAttribute('style')
    clone.querySelectorAll('[data-ui]').forEach((n) => n.remove())
    return clone.outerHTML
  }
  const png = () => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = totalW * 2
      c.height = totalH * 2
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => b && download('org-chart.png', b))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="People (CSV)" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={12} mono />
          <p className="k-hint">Columns: <code>id, name, title, manager, department</code>. The manager column may hold the manager's id or name; leave it empty for the top. Paste straight from Excel or Google Sheets (tabs work too).</p>
          {problems.missingManager.length > 0 && <Note tone="warn">Manager not found (shown as separate roots): {problems.missingManager.join('; ')}</Note>}
          {problems.cycles.length > 0 && <Note tone="err">Reporting loop broken at: {problems.cycles.join(', ')}</Note>}
          {problems.duplicates.length > 0 && <Note tone="warn">Duplicate ids ignored: {problems.duplicates.join(', ')}</Note>}
        </Panel>
        <Panel title="Layout">
          <Txt label="Chart title" value={s.title} onChange={(title) => set({ title })} />
          <Seg value={s.dir} onChange={(dir) => set({ dir })} options={[['down', '↓ Top-down'], ['right', '→ Left-right']]} />
          {!horiz && <Check label="Compact: stack teams of individual contributors" value={s.compact} onChange={(compact) => set({ compact })} />}
          <Slider label={s.zoom ? 'Zoom' : 'Zoom (fit to width)'} value={zoom} onChange={(z) => set({ zoom: z })} min={0.25} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Btn onClick={() => set({ zoom: 0 })}>Fit</Btn>
            <Btn onClick={() => set({ collapsed: [] })}>Expand all</Btn>
            <Btn onClick={() => collapseLevel(1)}>Top level only</Btn>
            <Btn onClick={() => collapseLevel(2)}>2 levels</Btn>
          </Row>
        </Panel>
        <Panel title="Departments">
          {depts.map((d) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <i style={{ width: 12, height: 12, borderRadius: 3, background: deptColor(d) }} />
              <span style={{ flex: 1 }}>{d}</span>
              <b>{[...byId.values()].filter((n) => (n.dept || '—') === d).length}</b>
            </div>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Headcount" value={st.count} />
          <Stat label="Levels" value={st.depth} />
          <Stat label="Managers" value={st.managers} sub={`${st.count - st.managers} individual contributors`} />
          <Stat label="Span of control" value={st.avgSpan.toFixed(1)} sub={`max ${st.spanMax} direct reports`} />
        </Stats>
        <Panel
          title="Chart"
          actions={
            <>
              <input className="k-text" style={{ width: 150 }} placeholder="🔍 Find person" value={s.search} onChange={(e) => set({ search: e.target.value })} />
              <Btn onClick={() => download('org-chart.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
              <Btn onClick={png}>⬇ PNG</Btn>
            </>
          }
        >
          <div ref={boxRef} style={{ overflow: 'auto', maxHeight: 640, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--line)' }}>
            <svg ref={svgRef} width={totalW * zoom} height={totalH * zoom} viewBox={`0 0 ${totalW} ${totalH}`} style={{ display: 'block' }} fontFamily="system-ui, sans-serif">
              <rect width={totalW} height={totalH} fill="#ffffff" />
              {s.title && <text x={pad} y={pad + 18} fontSize={20} fontWeight={700} fill="#0f172a">{s.title}</text>}
              <g transform={`translate(${pad},${pad + titleH})`}>
                {edges.map((d, i) => <path key={i} d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} />)}
                {L.boxes.map((b) => {
                  const p = pos(b), n = b.node, hit = match(b)
                  const col = deptColor(n.dept)
                  return (
                    <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: n.children.length ? 'pointer' : 'default' }} onClick={() => n.children.length && toggle(n.id)}>
                      <rect width={W} height={H} rx={10} fill={hit ? '#fef3c7' : '#ffffff'} stroke={hit ? '#f59e0b' : '#cbd5e1'} strokeWidth={hit ? 2.5 : 1} />
                      <rect width={6} height={H} rx={3} fill={col} />
                      <circle cx={30} cy={H / 2} r={17} fill={col} opacity={0.18} />
                      <text x={30} y={H / 2 + 5} fontSize={13} fontWeight={700} textAnchor="middle" fill={col}>{n.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</text>
                      <text x={54} y={26} fontSize={13.5} fontWeight={700} fill="#0f172a">{esc(cut(n.name, 19))}</text>
                      <text x={54} y={43} fontSize={11} fill="#475569">{cut(n.title, 25)}</text>
                      {n.dept && <text x={54} y={58} fontSize={10} fill={col}>{cut(n.dept, 22)}</text>}
                      {n.children.length > 0 && (
                        <g transform={horiz ? `translate(${W - 4},${H / 2})` : `translate(${W / 2},${H})`}>
                          <rect x={-18} y={-9} width={36} height={18} rx={9} fill={b.hidden ? '#6366f1' : '#ffffff'} stroke="#6366f1" />
                          <text y={4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={b.hidden ? '#ffffff' : '#6366f1'}>{b.hidden ? `+${b.hidden}` : `${n.children.length} ▾`}</text>
                        </g>
                      )}
                      <title>{`${n.name} — ${n.title}${n.dept ? ` (${n.dept})` : ''}\n${n.children.length} direct, ${n.size} total reports`}</title>
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>
          <p className="k-hint">Click a person with reports to collapse or expand their team. Badges show direct reports (or how many are hidden).</p>
        </Panel>
      </div>
    </Split>
  )
}
