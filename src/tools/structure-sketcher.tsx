import { useMemo, useRef, useState } from 'react'
import { Bar, Btn, CopyButton, download, Note, num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { type Atom, descriptors, ELEMENTS, formula, hCount, HETERO_COLORS, kekulize, layout, masses, type Mol, neighbors, parseSmiles, writeSmiles } from './lib/structure-sketcher'

type Tool = 'draw' | 'ring6' | 'ring5' | 'benzene' | 'charge' | 'erase' | 'move'
const S = 40 // px per bond length
const PRESETS: [string, string][] = [
  ['Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'],
  ['Caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C'],
  ['Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'],
  ['Paracetamol', 'CC(=O)Nc1ccc(O)cc1'],
  ['Dopamine', 'NCCc1ccc(O)c(O)c1'],
  ['Nicotine', 'CN1CCCC1c1cccnc1'],
  ['Glucose', 'OCC1OC(O)C(O)C(O)C1O'],
  ['Naphthalene', 'c1ccc2ccccc2c1'],
]
const EL_PALETTE = ['C', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I', 'H']

function fromSmiles(s: string): Mol {
  const m = kekulize(parseSmiles(s))
  layout(m)
  return m
}
const DEF = { mol: fromSmiles(PRESETS[0][1]), smiles: PRESETS[0][1] }

function molfile(m: Mol, name: string): string {
  const pad = (v: string | number, w: number) => String(v).padStart(w)
  const lines = [name, '  BrowserToolbox 2D', '', `${pad(m.atoms.length, 3)}${pad(m.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`]
  const idx = new Map(m.atoms.map((a, i) => [a.id, i + 1]))
  for (const a of m.atoms) {
    const chg = a.charge ? ({ 3: 1, 2: 2, 1: 3, [-1]: 5, [-2]: 6, [-3]: 7 } as Record<number, number>)[a.charge] ?? 0 : 0
    lines.push(`${pad(a.x.toFixed(4), 10)}${pad((-a.y).toFixed(4), 10)}${pad('0.0000', 10)} ${a.el.padEnd(3)} 0${pad(chg, 3)}  0  0  0  0  0  0  0  0  0  0`)
  }
  for (const b of m.bonds) lines.push(`${pad(idx.get(b.a)!, 3)}${pad(idx.get(b.b)!, 3)}${pad(b.order === 1.5 ? 4 : b.order, 3)}  0`)
  const ch = m.atoms.filter((a) => a.charge)
  for (let i = 0; i < ch.length; i += 8) lines.push(`M  CHG${pad(Math.min(8, ch.length - i), 3)}` + ch.slice(i, i + 8).map((a) => `${pad(idx.get(a.id)!, 4)}${pad(a.charge, 4)}`).join(''))
  lines.push('M  END')
  return lines.join('\n') + '\n'
}

export default function StructureSketcher() {
  const [s, set, reset] = useToolState('structure-sketcher', DEF)
  const [tool, setTool] = useState<Tool>('draw')
  const [el, setEl] = useState('C')
  const [order, setOrder] = useState<'1' | '2' | '3'>('1')
  const [smilesIn, setSmilesIn] = useState(s.smiles)
  const [err, setErr] = useState('')
  const [hist, setHist] = useState<Mol[]>([])
  const [drag, setDrag] = useState<{ from: number | null; start: [number, number]; cur: [number, number]; view: number[] } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const m = s.mol

  const commit = (mol: Mol) => {
    setHist((h) => [...h.slice(-50), m])
    set({ mol })
  }
  const nextId = (arr: { id: number }[]) => arr.reduce((a, x) => Math.max(a, x.id), -1) + 1
  const atom = (id: number) => m.atoms.find((a) => a.id === id)!

  // view box in world units, frozen while dragging
  const xs = m.atoms.map((a) => a.x), ys = m.atoms.map((a) => a.y)
  const live = m.atoms.length ? [Math.min(...xs) - 1.5, Math.min(...ys) - 1.5, Math.max(...xs) - Math.min(...xs) + 3, Math.max(...ys) - Math.min(...ys) + 3] : [-4, -3, 8, 6]
  const vw0 = Math.max(live[2], 10), vh0 = Math.max(live[3], 6.5)
  const view = drag?.view ?? [live[0] - (vw0 - live[2]) / 2, live[1] - (vh0 - live[3]) / 2, vw0, vh0]

  const world = (e: { clientX: number; clientY: number }): [number, number] => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse())
    return [p.x / S, p.y / S]
  }
  const hitAtom = (p: [number, number]) => m.atoms.find((a) => Math.hypot(a.x - p[0], a.y - p[1]) < 0.32)
  const hitBond = (p: [number, number]) => m.bonds.find((b) => {
    const A = atom(b.a), B = atom(b.b)
    const dx = B.x - A.x, dy = B.y - A.y
    const t = Math.max(0, Math.min(1, ((p[0] - A.x) * dx + (p[1] - A.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p[0] - A.x - t * dx, p[1] - A.y - t * dy) < 0.22
  })
  /** best free direction from an atom (largest angular gap), snapped to 30° */
  const freeDir = (a: Atom): number => {
    const angs = neighbors(m, a.id).map(({ other }) => Math.atan2(atom(other).y - a.y, atom(other).x - a.x)).sort((x, y) => x - y)
    if (!angs.length) return -Math.PI / 6
    if (angs.length === 1) return angs[0] + (2 * Math.PI) / 3 * (neighbors(m, atom(neighbors(m, a.id)[0].other).id).length % 2 ? 1 : -1)
    let best = 0, bi = 0
    angs.forEach((x, i) => {
      const gap = ((i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI) - x)
      if (gap > best) {
        best = gap
        bi = i
      }
    })
    return angs[bi] + best / 2
  }
  const addRing = (mol: Mol, size: number, arom: boolean, onAtom?: Atom, onBond?: [Atom, Atom], at?: [number, number]): Mol => {
    const atoms = [...mol.atoms], bonds = [...mol.bonds]
    let aid = nextId(atoms), bid = nextId(bonds)
    const R = 1 / (2 * Math.sin(Math.PI / size))
    let pts: [number, number][] = []
    let shared: number[] = []
    if (onBond) {
      const [A, B] = onBond
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2
      let nx = -(B.y - A.y), ny = B.x - A.x
      // pick the side with fewer atoms
      const side = (sx: number, sy: number) => atoms.filter((x) => (x.x - mx) * sx + (x.y - my) * sy > 0.1).length
      if (side(nx, ny) > side(-nx, -ny)) {
        nx = -nx
        ny = -ny
      }
      const l = Math.hypot(nx, ny)
      const ap = R * Math.cos(Math.PI / size)
      const cx = mx + (nx / l) * ap, cy = my + (ny / l) * ap
      const a0 = Math.atan2(A.y - cy, A.x - cx), a1 = Math.atan2(B.y - cy, B.x - cx)
      const dir = Math.sin(a1 - a0) > 0 ? 1 : -1
      pts = Array.from({ length: size }, (_, i) => [cx + R * Math.cos(a0 + (dir * 2 * Math.PI * i) / size), cy + R * Math.sin(a0 + (dir * 2 * Math.PI * i) / size)])
      shared = [A.id, B.id]
    } else if (onAtom) {
      const d = freeDir(onAtom)
      const cx = onAtom.x + R * Math.cos(d), cy = onAtom.y + R * Math.sin(d)
      pts = Array.from({ length: size }, (_, i) => [cx + R * Math.cos(d + Math.PI + (2 * Math.PI * i) / size), cy + R * Math.sin(d + Math.PI + (2 * Math.PI * i) / size)])
      shared = [onAtom.id]
    } else {
      const [cx, cy] = at!
      pts = Array.from({ length: size }, (_, i) => [cx + R * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / size), cy + R * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / size)])
    }
    const ids = pts.map((p, i) => {
      if (shared[i] !== undefined) return shared[i]
      const near = atoms.find((x) => Math.hypot(x.x - p[0], x.y - p[1]) < 0.3)
      if (near) return near.id
      atoms.push({ id: aid, el: 'C', x: p[0], y: p[1], charge: 0, h: null, arom: false, iso: 0 })
      return aid++
    })
    for (let i = 0; i < size; i++) {
      const a = ids[i], b = ids[(i + 1) % size]
      const ex = bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
      const want = arom && i % 2 === (shared.length === 2 ? 1 : 0) ? 2 : 1
      if (ex) {
        if (arom && want === 2 && ex.order === 1 && !bonds.some((x) => x !== ex && x.order === 2 && [x.a, x.b].some((q) => q === a || q === b))) ex.order = 2
      } else {
        const dbl = want === 2 && !bonds.some((x) => x.order === 2 && [x.a, x.b].some((q) => q === a || q === b))
        bonds.push({ id: bid++, a, b, order: dbl ? 2 : 1 })
      }
    }
    return { atoms, bonds }
  }

  const onDown = (e: React.PointerEvent) => {
    const p = world(e)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const a = hitAtom(p)
    setDrag({ from: a?.id ?? null, start: p, cur: p, view })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = world(e)
    if (tool === 'move' && drag.from !== null) {
      set({ mol: { ...m, atoms: m.atoms.map((a) => (a.id === drag.from ? { ...a, x: p[0], y: p[1] } : a)) } })
    }
    setDrag({ ...drag, cur: p })
  }
  const onUp = () => {
    const d = drag
    setDrag(null)
    if (!d) return
    const moved = Math.hypot(d.cur[0] - d.start[0], d.cur[1] - d.start[1]) > 0.3
    const A = d.from !== null ? atom(d.from) : undefined
    const bond = !A ? hitBond(d.start) : undefined
    const mol: Mol = { atoms: m.atoms.map((x) => ({ ...x })), bonds: m.bonds.map((x) => ({ ...x })) }
    const ord = Number(order)
    if (tool === 'move') {
      if (A && moved) setHist((h) => [...h.slice(-50), m])
      return
    }
    if (tool === 'erase') {
      if (A) commit({ atoms: mol.atoms.filter((x) => x.id !== A.id), bonds: mol.bonds.filter((b) => b.a !== A.id && b.b !== A.id) })
      else if (bond) commit({ ...mol, bonds: mol.bonds.filter((b) => b.id !== bond.id) })
      return
    }
    if (tool === 'charge') {
      if (A) commit({ ...mol, atoms: mol.atoms.map((x) => (x.id === A.id ? { ...x, charge: x.charge >= 1 ? -1 : x.charge + 1 } : x)) })
      return
    }
    if (tool === 'ring6' || tool === 'ring5' || tool === 'benzene') {
      const size = tool === 'ring5' ? 5 : 6
      if (bond) commit(addRing(mol, size, tool === 'benzene', undefined, [mol.atoms.find((x) => x.id === bond.a)!, mol.atoms.find((x) => x.id === bond.b)!]))
      else commit(addRing(mol, size, tool === 'benzene', A ? mol.atoms.find((x) => x.id === A.id) : undefined, undefined, d.start))
      return
    }
    // draw tool
    const aid = nextId(mol.atoms), bid = nextId(mol.bonds)
    if (A) {
      const target = moved ? hitAtom(d.cur) : undefined
      if (target && target.id !== A.id) {
        const ex = mol.bonds.find((b) => (b.a === A.id && b.b === target.id) || (b.a === target.id && b.b === A.id))
        if (ex) ex.order = ord
        else mol.bonds.push({ id: bid, a: A.id, b: target.id, order: ord })
        return commit(mol)
      }
      if (!moved && A.el !== el) return commit({ ...mol, atoms: mol.atoms.map((x) => (x.id === A.id ? { ...x, el, h: null, arom: false } : x)) })
      const ang = moved ? Math.round(Math.atan2(d.cur[1] - A.y, d.cur[0] - A.x) / (Math.PI / 6)) * (Math.PI / 6) : freeDir(A)
      mol.atoms.push({ id: aid, el: moved ? el : 'C', x: A.x + Math.cos(ang), y: A.y + Math.sin(ang), charge: 0, h: null, arom: false, iso: 0 })
      mol.bonds.push({ id: bid, a: A.id, b: aid, order: ord })
      return commit(mol)
    }
    if (bond) {
      const b = mol.bonds.find((x) => x.id === bond.id)!
      b.order = b.order === ord ? (b.order % 3) + 1 : ord
      return commit(mol)
    }
    mol.atoms.push({ id: aid, el, x: d.start[0], y: d.start[1], charge: 0, h: null, arom: false, iso: 0 })
    commit(mol)
  }

  const loadSmiles = (txt: string) => {
    try {
      const mol = fromSmiles(txt.trim())
      setErr('')
      commit(mol)
      set({ smiles: txt.trim() })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const props = useMemo(() => {
    const f = formula(m), ms = masses(m), d = descriptors(m)
    let smiles = ''
    try {
      smiles = writeSmiles(m)
    } catch {
      smiles = ''
    }
    const comp = [...f.counts.entries()].map(([k, n]) => ({ el: k, n, mass: (ELEMENTS[k]?.[0] ?? 0) * n })).sort((a, b) => b.mass - a.mass)
    const bad = m.atoms.filter((a) => {
      const sum = neighbors(m, a.id).reduce((s2, x) => s2 + x.bond.order, 0)
      const v = ELEMENTS[a.el]?.[2]
      return v && sum > Math.max(...v) + (['N', 'O', 'S', 'P'].includes(a.el) ? Math.max(0, a.charge) : 0)
    })
    return { f, ms, d, smiles, comp, bad: new Set(bad.map((a) => a.id)) }
  }, [m])

  const label = (a: Atom) => {
    const h = hCount(m, a)
    const deg = neighbors(m, a.id).length
    if (a.el === 'C' && deg > 0 && !a.charge && !props.bad.has(a.id)) return null
    return { el: a.el, h, ch: a.charge ? (Math.abs(a.charge) > 1 ? Math.abs(a.charge) : '') + (a.charge > 0 ? '+' : '−') : '' }
  }
  // ring centres for inner double-bond lines
  const ringCenter = (aId: number, bId: number): [number, number] | null => {
    const A = atom(aId), B = atom(bId)
    const common = neighbors(m, aId).map((x) => x.other).filter((o) => o !== bId)
    const other = neighbors(m, bId).map((x) => x.other).filter((o) => o !== aId)
    if (!common.length || !other.length) return null
    const pts = [...common, ...other].map(atom)
    const cx = pts.reduce((s2, p) => s2 + p.x, 0) / pts.length, cy = pts.reduce((s2, p) => s2 + p.y, 0) / pts.length
    const side = (B.x - A.x) * (cy - A.y) - (B.y - A.y) * (cx - A.x)
    return Math.abs(side) > 0.05 ? [cx, cy] : null
  }

  const svgText = () => {
    const el2 = svgRef.current
    if (!el2) return ''
    const c = el2.cloneNode(true) as SVGSVGElement
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    c.querySelector('[data-bg]')?.setAttribute('fill', '#ffffff')
    return c.outerHTML.replace(/var\(--fg\)/g, '#0f172a').replace(/var\(--panel\)/g, '#ffffff').replace(/var\(--[a-z0-9-]+\)/g, '#64748b')
  }
  const lip = [props.ms.avg <= 500, props.d.hbd <= 5, props.d.hba <= 10]

  return (
    <Split wide="left">
      <div>
        <Panel title="Sketch" actions={<>
          <Btn onClick={() => { const h = hist[hist.length - 1]; if (h) { setHist(hist.slice(0, -1)); set({ mol: h }) } }} disabled={!hist.length}>↶ Undo</Btn>
          <Btn onClick={() => { const mol = { atoms: m.atoms.map((a) => ({ ...a })), bonds: m.bonds.map((b) => ({ ...b })) }; layout(mol); commit(mol) }}>✨ Clean up</Btn>
          <Btn kind="ghost" onClick={() => commit({ atoms: [], bonds: [] })}>Clear</Btn>
        </>}>
          <Row>
            <Seg value={tool} onChange={setTool} options={[['draw', '✎ Draw'], ['benzene', '⌬ Benzene'], ['ring6', '⬡ Ring 6'], ['ring5', '⬠ Ring 5'], ['charge', '± Charge'], ['move', '✥ Move'], ['erase', '⌫ Erase']]} label="Tool" />
          </Row>
          <Row>
            <div className="k-seg" role="radiogroup" aria-label="Element">
              {EL_PALETTE.map((x) => (
                <button key={x} type="button" className={el === x ? 'on' : ''} onClick={() => { setEl(x); setTool('draw') }} style={{ color: el === x ? undefined : HETERO_COLORS[x], minWidth: 34 }}>{x}</button>
              ))}
            </div>
            <Seg value={order} onChange={(o) => { setOrder(o); setTool('draw') }} options={[['1', '—'], ['2', '='], ['3', '≡']]} label="Bond order" />
          </Row>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginTop: 8, background: 'var(--panel)' }}>
            <svg ref={svgRef} viewBox={`${view[0] * S} ${view[1] * S} ${view[2] * S} ${view[3] * S}`} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 460, touchAction: 'none', cursor: tool === 'move' ? 'grab' : 'crosshair', userSelect: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              <rect data-bg="" x={view[0] * S} y={view[1] * S} width={view[2] * S} height={view[3] * S} fill="var(--panel)" />
              {m.bonds.map((b) => {
                const A = atom(b.a), B = atom(b.b)
                if (!A || !B) return null
                const la = label(A), lb = label(B)
                const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1
                const ux = dx / L, uy = dy / L
                const sa = la ? 0.28 : 0, sb = lb ? 0.28 : 0
                const x1 = (A.x + ux * sa) * S, y1 = (A.y + uy * sa) * S, x2 = (B.x - ux * sb) * S, y2 = (B.y - uy * sb) * S
                const nx = -uy, ny = ux
                const lines: [number, number, number, number][] = []
                if (b.order === 1 || b.order === 1.5) lines.push([x1, y1, x2, y2])
                if (b.order === 2) {
                  const rc = la || lb ? null : ringCenter(b.a, b.b)
                  if (rc) {
                    const side = Math.sign((rc[0] - A.x) * nx + (rc[1] - A.y) * ny)
                    const o = 0.17 * S * side
                    lines.push([x1, y1, x2, y2], [x1 + nx * o + ux * 0.16 * S, y1 + ny * o + uy * 0.16 * S, x2 + nx * o - ux * 0.16 * S, y2 + ny * o - uy * 0.16 * S])
                  } else {
                    const o = 0.08 * S
                    lines.push([x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o], [x1 - nx * o, y1 - ny * o, x2 - nx * o, y2 - ny * o])
                  }
                }
                if (b.order === 3) {
                  const o = 0.13 * S
                  lines.push([x1, y1, x2, y2], [x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o], [x1 - nx * o, y1 - ny * o, x2 - nx * o, y2 - ny * o])
                }
                return (
                  <g key={b.id} strokeLinecap="round">
                    {lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="var(--fg)" strokeWidth={2} />)}
                  </g>
                )
              })}
              {m.atoms.map((a) => {
                const l = label(a)
                const bad = props.bad.has(a.id)
                if (!l) return <circle key={a.id} cx={a.x * S} cy={a.y * S} r={3} fill="transparent" />
                const col = bad ? '#ef4444' : HETERO_COLORS[a.el] ?? 'var(--fg)'
                const left = l.h > 0 && neighbors(m, a.id).some(({ other }) => atom(other).x > a.x + 0.3) && !neighbors(m, a.id).some(({ other }) => atom(other).x < a.x - 0.3)
                return (
                  <g key={a.id}>
                    <text x={a.x * S} y={a.y * S + 6} textAnchor={left ? 'end' : 'start'} dx={left ? 7 : -7} fontSize={17} fontWeight={700} fill={col} stroke="var(--panel)" strokeWidth={5} paintOrder="stroke" style={{ fontFamily: 'system-ui, sans-serif' }}>
                      {left ? <>H{l.h > 1 && <tspan fontSize={12} dy={4}>{l.h}</tspan>}<tspan dy={l.h > 1 ? -4 : 0}>{a.el}</tspan></> : <>{a.el}{l.h > 0 && <>H{l.h > 1 && <tspan fontSize={12} dy={4}>{l.h}</tspan>}</>}</>}
                      {l.ch && <tspan fontSize={12} dy={l.h > 1 && !left ? -12 : -8}>{l.ch}</tspan>}
                    </text>
                  </g>
                )
              })}
              {drag && tool === 'draw' && drag.from !== null && Math.hypot(drag.cur[0] - drag.start[0], drag.cur[1] - drag.start[1]) > 0.3 && (
                <line x1={atom(drag.from).x * S} y1={atom(drag.from).y * S} x2={drag.cur[0] * S} y2={drag.cur[1] * S} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />
              )}
            </svg>
          </div>
          <p className="k-hint" style={{ margin: '6px 0 0' }}>
            Draw: click empty space for an atom, click an atom to grow a chain (or change its element), drag between atoms for a bond, click a bond to change its order. Red labels = valence exceeded.
          </p>
        </Panel>
        <Panel title="SMILES">
          <Row>
            <input className="k-text" style={{ flex: '1 1 260px', fontFamily: 'var(--mono)' }} value={smilesIn} onChange={(e) => setSmilesIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadSmiles(smilesIn)} aria-label="SMILES input" placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O" />
            <Btn kind="primary" onClick={() => loadSmiles(smilesIn)}>Load</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
          <Row>
            {PRESETS.map(([n, sm]) => <Btn key={n} kind="ghost" onClick={() => { setSmilesIn(sm); loadSmiles(sm) }}>{n}</Btn>)}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Formula" value={props.f.text || '—'} tone="accent" />
          <Stat label="Molecular weight" value={`${num(props.ms.avg, 3)}`} sub="g/mol (average)" />
          <Stat label="Exact mass" value={num(props.ms.mono, 5)} sub="monoisotopic, Da" />
        </Stats>
        <Panel title="Canonical-ish SMILES" actions={<>
          <CopyButton text={props.smiles} />
          <Btn onClick={() => download('structure.mol', molfile(m, props.f.text), 'chemical/x-mdl-molfile')}>⬇ MOL</Btn>
          <Btn onClick={() => download('structure.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
        </>}>
          <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 14, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>{props.smiles || '(empty)'}</code>
        </Panel>
        <Panel title="Descriptors">
          <Table head={['Property', 'Value']} rows={[
            ['Heavy atoms', props.d.heavy],
            ['H-bond donors (N–H, O–H)', props.d.hbd],
            ['H-bond acceptors (N, O)', props.d.hba],
            ['Rotatable bonds', props.d.rot],
            ['Rings', props.d.rings],
            ['Double-bond equivalents', Number.isFinite(props.d.dbe) ? num(props.d.dbe, 1) : '—'],
            ['TPSA (Ertl, N/O)', `${num(props.d.tpsa, 2)} Å²`],
          ]} />
        </Panel>
        <Panel title="Lipinski rule of five">
          {[['MW ≤ 500', lip[0], num(props.ms.avg, 1)], ['H-bond donors ≤ 5', lip[1], props.d.hbd], ['H-bond acceptors ≤ 10', lip[2], props.d.hba]].map(([l, ok, v]) => (
            <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{ok ? '✅' : '❌'} {l}</span><b>{v}</b></div>
          ))}
          <p className="k-hint">logP is not estimated here; {lip.filter(Boolean).length}/3 checked criteria pass.</p>
        </Panel>
        <Panel title="Elemental composition">
          {props.comp.map((c) => (
            <div key={c.el} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <b style={{ color: HETERO_COLORS[c.el] }}>{c.el}{c.n > 1 && <sub>{c.n}</sub>}</b>
              <Bar value={c.mass} max={props.ms.avg || 1} color={HETERO_COLORS[c.el] ?? 'var(--accent)'} />
              <span style={{ textAlign: 'right' }}>{num((c.mass / (props.ms.avg || 1)) * 100, 2)}%</span>
            </div>
          ))}
          <Btn kind="ghost" onClick={() => { reset(); setSmilesIn(PRESETS[0][1]) }}>Reset to aspirin</Btn>
        </Panel>
      </div>
    </Split>
  )
}
