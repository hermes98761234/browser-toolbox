import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, CopyButton, JsonButtons, Note, PALETTE, Panel, Row, Stat, Stats, download, useToolState } from '../kit'
import { countNodes, edgePath, layout, newId, parentOf, parseOutline, removeNode, toOutline, type Box, type MindMap } from './lib/mind-map-maker'

const SAMPLE = `Plan a product launch
- Goals
  - 1,000 sign-ups in week one
  - Press coverage
- Audience
  - Indie developers
  - Small agencies
- Channels
  - Newsletter
  - Product Hunt
  - Social
    - Short demo video
    - Launch thread
- Timeline
  - Beta in March
  - Launch day: April 14
- Risks
  - Server load
  - Pricing confusion`
const DEF_MAP = parseOutline(SAMPLE)!
interface State { map: MindMap }
const DEF: State = { map: DEF_MAP }

const FONT = ['bold 18px system-ui, sans-serif', '600 15px system-ui, sans-serif', '14px system-ui, sans-serif']
const H = [46, 36, 30]
let ctx: CanvasRenderingContext2D | null = null
const textW = (t: string, depth: number) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return t.length * 8
  ctx.font = FONT[Math.min(2, depth)]
  return ctx.measureText(t || ' ').width
}

export default function MindMapMaker() {
  const [s, set] = useToolState('mind-map-maker', DEF)
  const m = s.map
  const [sel, setSel] = useState<string>(m.root)
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [outline, setOutline] = useState('')
  const undo = useRef<MindMap[]>([])
  const redo = useRef<MindMap[]>([])
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const [W, setW] = useState(800)
  const HGT = 560

  useEffect(() => {
    const sv = svg.current
    const stop = (e: WheelEvent) => e.preventDefault()
    sv?.addEventListener('wheel', stop, { passive: false })
    return () => sv?.removeEventListener('wheel', stop)
  }, [])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const L = useMemo(() => layout(m, (id, d) => ({ w: Math.min(320, textW(m.nodes[id].text, d)) + (d === 0 ? 40 : 26), h: H[Math.min(2, d)] })), [m])
  const cur = m.nodes[sel] ? sel : m.root
  const bounds = useMemo(() => {
    const b = [...L.values()]
    return { x0: Math.min(...b.map((x) => x.x - x.w / 2)) - 30, x1: Math.max(...b.map((x) => x.x + x.w / 2)) + 30, y0: Math.min(...b.map((x) => x.y - x.h / 2)) - 30, y1: Math.max(...b.map((x) => x.y + x.h / 2)) + 30 }
  }, [L])
  const fit = () => {
    const k = Math.min(1.4, W / (bounds.x1 - bounds.x0), HGT / (bounds.y1 - bounds.y0))
    setView({ k, x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 })
  }
  // fit once on first render (after width is known)
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || W === 800) return
    fitted.current = true
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W])

  const commit = (map: MindMap) => {
    undo.current = [...undo.current.slice(-60), m]
    redo.current = []
    set({ map })
  }
  const patch = (id: string, p: Partial<MindMap['nodes'][string]>) => commit({ ...m, nodes: { ...m.nodes, [id]: { ...m.nodes[id], ...p } } })
  const addChild = (pid: string, text = 'New idea') => {
    const id = newId()
    commit({ ...m, nodes: { ...m.nodes, [pid]: { ...m.nodes[pid], collapsed: false, children: [...m.nodes[pid].children, id] }, [id]: { text, children: [] } } })
    setSel(id)
    setEdit({ id, text: '' })
  }
  const addSibling = (id: string) => {
    const p = parentOf(m, id)
    if (!p) return addChild(id)
    const nid = newId()
    const ch = [...m.nodes[p].children]
    ch.splice(ch.indexOf(id) + 1, 0, nid)
    commit({ ...m, nodes: { ...m.nodes, [p]: { ...m.nodes[p], children: ch }, [nid]: { text: 'New idea', children: [] } } })
    setSel(nid)
    setEdit({ id: nid, text: '' })
  }
  const del = (id: string) => {
    if (id === m.root) return
    const p = parentOf(m, id)
    const sib = p ? m.nodes[p].children : []
    const i = sib.indexOf(id)
    commit(removeNode(m, id))
    setSel(sib[i + 1] ?? sib[i - 1] ?? p ?? m.root)
  }
  const finishEdit = (keep = true) => {
    if (edit && keep && edit.text.trim() && edit.text !== m.nodes[edit.id]?.text) patch(edit.id, { text: edit.text.trim() })
    setEdit(null)
    box.current?.focus()
  }
  const move = (dir: -1 | 1) => {
    const p = parentOf(m, cur)
    if (!p) return
    const ch = [...m.nodes[p].children]
    const i = ch.indexOf(cur), j = i + dir
    if (j < 0 || j >= ch.length) return
    ;[ch[i], ch[j]] = [ch[j], ch[i]]
    commit({ ...m, nodes: { ...m.nodes, [p]: { ...m.nodes[p], children: ch } } })
  }

  const nav = (key: string) => {
    const b = L.get(cur)!
    const vis = [...L.values()]
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowRight' ? 1 : -1
      if (b.side === 0) {
        const kids = vis.filter((x) => x.parent === cur && x.side === dir)
        if (kids.length) setSel(kids[Math.floor(kids.length / 2)].id)
      } else if (b.side === dir) {
        const kids = vis.filter((x) => x.parent === cur)
        if (kids.length) setSel(kids[Math.floor(kids.length / 2)].id)
        else if (m.nodes[cur].collapsed) patch(cur, { collapsed: false })
      } else if (b.parent) setSel(b.parent)
    } else {
      // nearest node above / below on the same side and depth
      const dir = key === 'ArrowDown' ? 1 : -1
      const cands = vis.filter((x) => x.side === b.side && x.depth === b.depth && (x.y - b.y) * dir > 0)
      cands.sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))
      if (cands[0]) setSel(cands[0].id)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (edit) return
    const k = e.key
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
      e.preventDefault()
      const prev = e.shiftKey ? redo.current.pop() : undo.current.pop()
      if (prev) {
        if (e.shiftKey) undo.current.push(m)
        else redo.current.push(m)
        set({ map: prev })
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && k.startsWith('Arrow') && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); move(k === 'ArrowUp' ? -1 : 1); return }
    if (k === 'Tab' || k === 'Insert') { e.preventDefault(); addChild(cur) }
    else if (k === 'Enter') { e.preventDefault(); addSibling(cur) }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); del(cur) }
    else if (k === 'F2') { e.preventDefault(); setEdit({ id: cur, text: m.nodes[cur].text }) }
    else if (k === ' ') { e.preventDefault(); if (m.nodes[cur].children.length) patch(cur, { collapsed: !m.nodes[cur].collapsed }) }
    else if (k.startsWith('Arrow')) { e.preventDefault(); nav(k) }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setEdit({ id: cur, text: k }) }
  }

  const color = (b: Box) => (b.branch < 0 ? 'var(--accent)' : PALETTE[b.branch % PALETTE.length])
  const vb = `${view.x - W / 2 / view.k} ${view.y - HGT / 2 / view.k} ${W / view.k} ${HGT / view.k}`

  const exportSvg = () => {
    const el = svg.current
    if (!el) return ''
    const c = el.cloneNode(true) as SVGSVGElement
    c.querySelectorAll('foreignObject, [data-ui]').forEach((x) => x.remove())
    const w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0
    c.setAttribute('viewBox', `${bounds.x0} ${bounds.y0} ${w} ${h}`)
    c.setAttribute('width', String(Math.round(w)))
    c.setAttribute('height', String(Math.round(h)))
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const cs = getComputedStyle(box.current ?? document.body)
    const bg = cs.getPropertyValue('--panel').trim() || '#fff'
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    Object.entries({ x: bounds.x0, y: bounds.y0, width: w, height: h, fill: bg }).forEach(([k, v]) => r.setAttribute(k, String(v)))
    c.insertBefore(r, c.firstChild)
    const txt = new XMLSerializer().serializeToString(c).replace(/var\((--[a-z0-9-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim() || '#888')
    return txt
  }
  const exportPng = () => {
    const txt = exportSvg()
    const img = new Image()
    const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }))
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = img.width * 2
      cv.height = img.height * 2
      const g = cv.getContext('2d')!
      g.scale(2, 2)
      g.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      cv.toBlob((b) => b && download('mind-map.png', b, 'image/png'))
    }
    img.src = url
  }

  const all = [...L.values()]
  const depthMax = Math.max(...all.map((b) => b.depth))

  return (
    <div>
      <Panel
        title={m.nodes[m.root].text}
        actions={<>
          <Btn onClick={() => addChild(cur)} title="Tab">+ Child</Btn>
          <Btn onClick={() => addSibling(cur)} title="Enter">+ Sibling</Btn>
          <Btn onClick={() => setEdit({ id: cur, text: m.nodes[cur].text })} title="F2">✎ Edit</Btn>
          <Btn kind="danger" disabled={cur === m.root} onClick={() => del(cur)} title="Delete">🗑</Btn>
          <Btn onClick={fit}>⤢ Fit</Btn>
          <Btn onClick={() => download('mind-map.svg', exportSvg(), 'image/svg+xml')}>⬇ SVG</Btn>
          <Btn onClick={exportPng}>⬇ PNG</Btn>
        </>}
      >
        <div
          ref={box}
          tabIndex={0}
          onKeyDown={onKey}
          style={{ position: 'relative', outline: 'none', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', touchAction: 'none' }}
          aria-label="Mind map canvas. Tab adds a child, Enter a sibling, arrows move, F2 or typing edits, Space folds, Delete removes."
        >
          <svg
            ref={svg}
            width="100%"
            height={HGT}
            viewBox={vb}
            style={{ display: 'block', cursor: drag.current ? 'grabbing' : 'grab', fontFamily: 'system-ui, sans-serif' }}
            onPointerDown={(e) => {
              if ((e.target as Element).closest('[data-node]')) return
              drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (d) setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) / v.k, y: d.vy - (e.clientY - d.y) / v.k }))
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setView((v) => ({ ...v, k: Math.max(0.25, Math.min(3, v.k * (e.deltaY > 0 ? 0.9 : 1.1))) }))}
          >
            {all.filter((b) => b.parent).map((b) => (
              <path key={`e${b.id}`} d={edgePath(L.get(b.parent!)!, b)} fill="none" stroke={color(b)} strokeWidth={Math.max(1.5, 4.5 - b.depth)} strokeLinecap="round" opacity={0.85} />
            ))}
            {all.map((b) => {
              const n = m.nodes[b.id]
              const c = color(b)
              const on = b.id === cur
              const hidden = n.collapsed ? n.children.length : 0
              return (
                <g key={b.id} data-node transform={`translate(${b.x},${b.y})`} style={{ cursor: 'pointer' }}
                  onPointerDown={() => { setSel(b.id); box.current?.focus() }}
                  onDoubleClick={() => setEdit({ id: b.id, text: n.text })}
                >
                  <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} rx={b.depth === 0 ? b.h / 2 : 8}
                    fill={b.depth === 0 ? c : b.depth === 1 ? `color-mix(in srgb, ${c} 18%, var(--panel))` : 'var(--panel)'}
                    stroke={c} strokeWidth={on ? 3 : b.depth === 0 ? 0 : 1.5} />
                  {on && <rect data-ui x={-b.w / 2 - 5} y={-b.h / 2 - 5} width={b.w + 10} height={b.h + 10} rx={12} fill="none" stroke={c} strokeDasharray="4 3" opacity={0.7} />}
                  <text textAnchor="middle" dy="0.35em" fontSize={b.depth === 0 ? 18 : b.depth === 1 ? 15 : 14} fontWeight={b.depth === 0 ? 700 : b.depth === 1 ? 600 : 400} fill={b.depth === 0 ? '#fff' : 'var(--fg)'}>
                    {n.text.length > 44 ? n.text.slice(0, 42) + '…' : n.text}
                  </text>
                  {hidden > 0 && (
                    <g transform={`translate(${b.side * (b.w / 2 + 12)},0)`} onPointerDown={(e) => { e.stopPropagation(); patch(b.id, { collapsed: false }) }}>
                      <circle r={10} fill={c} />
                      <text textAnchor="middle" dy="0.35em" fontSize={11} fill="#fff" fontWeight={700}>{hidden}</text>
                    </g>
                  )}
                  {edit?.id === b.id && (
                    <foreignObject x={-Math.max(b.w, 180) / 2} y={-b.h / 2} width={Math.max(b.w, 180)} height={b.h}>
                      <input
                        autoFocus
                        value={edit.text}
                        onChange={(e) => setEdit({ id: b.id, text: e.target.value })}
                        onBlur={() => finishEdit(true)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') finishEdit(true)
                          else if (e.key === 'Escape') finishEdit(false)
                          else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true) }
                        }}
                        style={{ width: '100%', height: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 14, textAlign: 'center', borderRadius: 8, border: `2px solid ${c}`, background: 'var(--panel)', color: 'var(--fg)' }}
                      />
                    </foreignObject>
                  )}
                </g>
              )
            })}
          </svg>
          <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6 }}>
            <Btn onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))}>＋</Btn>
            <Btn onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))}>－</Btn>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          <b>Keys:</b> Tab child · Enter sibling · type or F2 to edit · arrows move · Ctrl+↑/↓ reorder · Space fold · Delete remove · Ctrl+Z undo (Ctrl+Shift+Z redo) · drag background to pan, wheel to zoom. Saved automatically in this browser.
        </p>
      </Panel>
      <div className="k-split">
        <Panel title="Outline" actions={<><CopyButton text={() => toOutline(m)} label="Copy outline" /><Btn onClick={() => download('mind-map.md', toOutline(m), 'text/markdown')}>⬇ .md</Btn></>}>
          <Area value={outline || toOutline(m)} onChange={setOutline} rows={10} mono />
          <Row>
            <Btn kind="primary" disabled={!outline} onClick={() => { const p = parseOutline(outline); if (p) { commit(p); setSel(p.root); setOutline(''); fitted.current = false; setTimeout(fit, 0) } }}>Apply outline</Btn>
            <Btn kind="ghost" disabled={!outline} onClick={() => setOutline('')}>Discard edits</Btn>
          </Row>
          <Note>Edit or paste an indented list (“- item”, two spaces per level, or Markdown headings). The first line becomes the central topic.</Note>
        </Panel>
        <div>
          <Stats>
            <Stat label="Ideas" value={countNodes(m)} />
            <Stat label="Main branches" value={m.nodes[m.root].children.length} />
            <Stat label="Depth" value={depthMax} />
          </Stats>
          <Panel title="Map file" actions={<JsonButtons name="mind-map.json" data={m} onLoad={(d) => { if (d && d.root && d.nodes?.[d.root]) { commit(d); setSel(d.root) } }} />}>
            <Row>
              <Btn onClick={() => { const p = parseOutline('Central topic')!; commit(p); setSel(p.root) }}>New blank map</Btn>
              <Btn kind="ghost" onClick={() => { commit(parseOutline(SAMPLE)!); }}>Load example</Btn>
            </Row>
          </Panel>
        </div>
      </div>
    </div>
  )
}
