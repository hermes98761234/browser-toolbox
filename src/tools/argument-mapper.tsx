import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { childKind, children, fromMarkdown, KINDS, LABEL, layout, LINK, removeTree, toMarkdown, unanswered, type Kind, type Node } from './lib/argument-mapper'

interface State { title: string; nodes: Node[]; sel: string }

const COL: Record<Kind, string> = { claim: '#6366f1', reason: '#10b981', objection: '#ef4444', rebuttal: '#f59e0b', evidence: '#0ea5e9' }

const DEF: State = {
  title: 'Should cities ban cars from downtown?',
  sel: 'c',
  nodes: [
    { id: 'c', parent: null, kind: 'claim', text: 'City centres should be car-free' },
    { id: 'r1', parent: 'c', kind: 'reason', text: 'It cuts air pollution where most people walk' },
    { id: 'e1', parent: 'r1', kind: 'evidence', text: 'Madrid Central: NO₂ down ~20% in its first year' },
    { id: 'r2', parent: 'c', kind: 'reason', text: 'Streets become safer for pedestrians and cyclists' },
    { id: 'o1', parent: 'c', kind: 'objection', text: 'Shops will lose customers who drive in' },
    { id: 'b1', parent: 'o1', kind: 'rebuttal', text: 'Pedestrianised streets usually see more foot traffic and spending' },
    { id: 'e2', parent: 'b1', kind: 'evidence', text: 'Studies of high streets show walkers visit more often' },
    { id: 'o2', parent: 'c', kind: 'objection', text: 'People with disabilities need door-to-door access' },
  ],
}

const KEYS = 'Tab: add child · Enter: add sibling · F2 / double-click: edit · Del: delete branch · arrows: move · 1–5: change type'

export default function ArgumentMapper() {
  const [s, set, reset] = useToolState('argument-mapper', DEF)
  const [editing, setEditing] = useState<string | null>(null)
  const [mdIn, setMdIn] = useState('')
  const [fit, setFit] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { boxes, width, height } = layout(s.nodes)
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const sel = s.nodes.find((n) => n.id === s.sel)
  const open = unanswered(s.nodes)
  const M = 20

  const add = (parent: string | null, kind?: Kind) => {
    const p = s.nodes.find((n) => n.id === parent)
    const n: Node = { id: uid(), parent, kind: kind ?? (p ? childKind(p.kind) : 'claim'), text: '' }
    set({ nodes: [...s.nodes, n], sel: n.id })
    setEditing(n.id)
  }
  const edit = (id: string, patch: Partial<Node>) => set({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  const del = (id: string) => {
    const n = s.nodes.find((x) => x.id === id)
    const rest = removeTree(s.nodes, id)
    set({ nodes: rest, sel: n?.parent ?? rest[0]?.id ?? '' })
  }

  useEffect(() => {
    if (!editing) wrapRef.current?.focus({ preventScroll: true })
  }, [editing])

  const onKey = (e: React.KeyboardEvent) => {
    if (editing || !sel) return
    const sibs = children(s.nodes, sel.parent)
    const i = sibs.findIndex((n) => n.id === sel.id)
    const go = (id?: string) => id && set({ sel: id })
    const k = e.key
    if (k === 'Tab') add(sel.id)
    else if (k === 'Enter') add(sel.parent ?? sel.id, sel.parent ? sel.kind : undefined)
    else if (k === 'F2' || k === ' ') setEditing(sel.id)
    else if ((k === 'Delete' || k === 'Backspace') && sel.parent) del(sel.id)
    else if (k === 'ArrowUp') go(sel.parent ?? undefined)
    else if (k === 'ArrowDown') go(children(s.nodes, sel.id)[0]?.id)
    else if (k === 'ArrowLeft') go(sibs[i - 1]?.id)
    else if (k === 'ArrowRight') go(sibs[i + 1]?.id)
    else if (/^[1-5]$/.test(k)) edit(sel.id, { kind: KINDS[Number(k) - 1] })
    else return
    e.preventDefault()
  }

  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    const c = el.cloneNode(true) as SVGSVGElement
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    c.querySelectorAll('[data-ui]').forEach((x) => x.remove())
    return c.outerHTML
  }
  const md = toMarkdown(s.nodes, s.title)
  const counts = KINDS.map((k) => s.nodes.filter((n) => n.kind === k).length)

  return (
    <Split wide="right">
      <div>
        <Panel title="Map" actions={<Btn kind="ghost" onClick={() => { reset(); setEditing(null) }}>Reset</Btn>}>
          <Txt label="Question or essay title" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Btn onClick={() => sel && add(sel.id)} disabled={!sel}>+ Child</Btn>
            <Btn onClick={() => add(null, 'claim')}>+ New claim</Btn>
            <Btn onClick={() => set({ nodes: [], sel: '' })} kind="ghost">Clear</Btn>
          </Row>
        </Panel>
        <Panel title={sel ? `Selected: ${LABEL[sel.kind]}` : 'Selected node'}>
          {!sel ? (
            <Note>Click a box in the map to select it.</Note>
          ) : (
            <>
              <Area value={sel.text} onChange={(text) => edit(sel.id, { text })} rows={3} placeholder="Write the statement…" />
              <Row>
                <Select label="Type" value={sel.kind} onChange={(kind) => edit(sel.id, { kind })} options={KINDS.map((k) => [k, LABEL[k]] as [Kind, string])} />
              </Row>
              <Row>
                <Btn onClick={() => add(sel.id, 'reason')}>+ Reason</Btn>
                <Btn onClick={() => add(sel.id, 'objection')}>+ Objection</Btn>
                <Btn onClick={() => add(sel.id, 'rebuttal')}>+ Rebuttal</Btn>
                <Btn onClick={() => add(sel.id, 'evidence')}>+ Evidence</Btn>
                <Btn kind="danger" onClick={() => del(sel.id)}>Delete branch</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Markdown outline" actions={<><CopyButton text={md} /><Btn onClick={() => download('argument-map.md', md, 'text/markdown')}>⬇ .md</Btn></>}>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, maxHeight: 260, overflow: 'auto', margin: 0 }}>{md}</pre>
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Import an outline</summary>
            <Area value={mdIn} onChange={setMdIn} rows={6} mono placeholder={'- Claim: Homework should be optional\n  - Reason: Students need rest\n  - Objection: Practice builds skill\n    - Rebuttal: In-class practice works better'} />
            <Btn disabled={!mdIn.trim()} onClick={() => {
              const nodes = fromMarkdown(mdIn, uid)
              if (nodes.length) set({ nodes, sel: nodes[0].id })
            }}>Replace map with outline</Btn>
          </details>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Reasons" value={counts[1]} sub={`${counts[4]} pieces of evidence`} />
          <Stat label="Objections" value={counts[2]} sub={`${counts[3]} rebuttals`} />
          <Stat label="Unanswered" value={open.length} tone={open.length ? 'bad' : 'good'} sub={open.length ? 'objections need a rebuttal' : 'every objection answered'} />
        </Stats>
        <Panel
          title={s.title || 'Argument map'}
          actions={
            <>
              <Check label="Fit width" value={fit} onChange={setFit} />
              <Btn onClick={() => download('argument-map.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
              <JsonButtons name="argument-map.json" data={s} onLoad={(d) => Array.isArray(d?.nodes) && set({ ...DEF, ...d })} />
            </>
          }
        >
          <div ref={wrapRef} tabIndex={0} onKeyDown={onKey} style={{ overflow: 'auto', outline: 'none', borderRadius: 10, background: 'var(--bg, transparent)', maxHeight: 640 }} aria-label="Argument map. Use the keyboard to edit.">
            <svg ref={svgRef} width={width + 2 * M} height={height + 2 * M} viewBox={`${-M} ${-M} ${width + 2 * M} ${height + 2 * M}`} style={{ display: 'block', fontFamily: 'system-ui, sans-serif', ...(fit ? { width: '100%', height: 'auto', maxWidth: width + 2 * M } : { minWidth: '100%' }) }}>
              {s.nodes.map((n) => {
                const b = byId.get(n.id), p = n.parent ? byId.get(n.parent) : undefined
                if (!b || !p) return null
                const x1 = p.x + p.w / 2, y1 = p.y + p.h, x2 = b.x + b.w / 2, y2 = b.y
                const my = (y1 + y2) / 2
                return (
                  <g key={`e${n.id}`}>
                    <path d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke={COL[n.kind]} strokeWidth={2} strokeDasharray={n.kind === 'objection' ? '6 4' : undefined} />
                    <text x={x2} y={y2 - 14} textAnchor="middle" fontSize={11.5} fontWeight={600} fontStyle="italic" fill={COL[n.kind]} stroke="var(--panel, #fff)" strokeWidth={4} paintOrder="stroke">{LINK[n.kind]}</text>
                  </g>
                )
              })}
              {s.nodes.map((n) => {
                const b = byId.get(n.id)
                if (!b) return null
                const isSel = n.id === s.sel
                const isOpen = open.includes(n)
                return (
                  <g key={n.id} transform={`translate(${b.x},${b.y})`} style={{ cursor: 'pointer' }} onClick={() => set({ sel: n.id })} onDoubleClick={() => setEditing(n.id)}>
                    <rect width={b.w} height={b.h} rx={10} fill={COL[n.kind]} fillOpacity={0.14} stroke={COL[n.kind]} strokeWidth={isSel ? 3.5 : 1.5} />
                    <rect width={b.w} height={18} rx={10} fill={COL[n.kind]} />
                    <rect y={9} width={b.w} height={9} fill={COL[n.kind]} />
                    <text x={10} y={13} fontSize={11} fontWeight={700} fill="#fff">{LABEL[n.kind].toUpperCase()}{isOpen ? '  ⚠ no rebuttal' : ''}</text>
                    {editing === n.id ? (
                      <foreignObject x={4} y={20} width={b.w - 8} height={Math.max(40, b.h - 22)} data-ui="1">
                        <textarea
                          autoFocus
                          defaultValue={n.text}
                          onBlur={(e) => { edit(n.id, { text: e.target.value }); setEditing(null) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() }
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          style={{ width: '100%', height: '100%', resize: 'none', font: '13px system-ui', border: 0, borderRadius: 6, padding: 4, boxSizing: 'border-box' }}
                        />
                      </foreignObject>
                    ) : (
                      b.lines.map((l, i) => (
                        <text key={i} x={10} y={36 + i * 16} fontSize={13} fill="currentColor" style={{ color: 'var(--fg)' }}>{l}</text>
                      ))
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{KEYS}. Enter saves while editing; Shift+Enter adds a line break.</p>
          <div className="k-legend" style={{ marginTop: 6 }}>
            {KINDS.map((k, i) => (
              <span key={k}><i style={{ background: COL[k] }} />{i + 1} {LABEL[k]}</span>
            ))}
          </div>
        </Panel>
        {open.length > 0 && <Note tone="warn">Unanswered objection{open.length > 1 ? 's' : ''}: {open.map((o) => `“${o.text}”`).join(', ')}. A strong essay acknowledges and rebuts each one.</Note>}
      </div>
    </Split>
  )
}
