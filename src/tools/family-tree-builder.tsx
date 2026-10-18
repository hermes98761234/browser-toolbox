import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import {
  BOX_H, BOX_W, descendantLayout, emptyEvent, fromGedcom, fullName, index, lifespan, parentsOf, partner, pedigreeLayout, relationship, sampleTree, siblingsOf, toGedcom, year,
  type Family, type Person, type Sex, type Tree,
} from './lib/family-tree-builder'

interface State { tree: Tree; focus: string; view: 'desc' | 'ped'; root: string; gens: number; relA: string; relB: string; zoom: number }
const DEF: State = { tree: sampleTree(), focus: 'I16', view: 'desc', root: 'I1', gens: 4, relA: 'I16', relB: 'I21', zoom: 1 }

const FILL: Record<Sex, [string, string]> = { M: ['#dbeafe', '#3b82f6'], F: ['#fce7f3', '#db2777'], U: ['#ecfdf5', '#059669'] }
const nextId = (xs: { id: string }[], p: string) => `${p}${Math.max(0, ...xs.map((x) => +x.id.replace(/\D/g, '') || 0)) + 1}`
const newPerson = (t: Tree, given: string, surname: string, sex: Sex): Person => ({ id: nextId(t.people, 'I'), given, surname, sex, birth: emptyEvent(), death: emptyEvent(), notes: '' })
const newFamily = (t: Tree, f: Partial<Family>): Family => ({ id: nextId(t.families, 'F'), children: [], marr: emptyEvent(), div: false, ...f })
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** The ancestor of `id` with the most descendants (a sensible default root for the descendant chart). */
function topAncestor(t: Tree, id: string): string {
  const ix = index(t)
  let cur = id
  for (let i = 0; i < 30; i++) {
    const ps = parentsOf(ix, cur)
    const male = ps.find((p) => ix.person.get(p)?.sex === 'M') ?? ps[0]
    if (!male) break
    cur = male
  }
  return cur
}

export default function FamilyTreeBuilder() {
  const [s, set, reset] = useToolState('family-tree-builder', DEF)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [childFam, setChildFam] = useState('')
  const [linkId, setLinkId] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const [prev, setPrev] = useState<Tree | null>(null)
  const t = s.tree
  const ix = useMemo(() => index(t), [t])
  const me = ix.person.get(s.focus) ?? t.people[0]
  const root = ix.person.has(s.root) ? s.root : (t.people[0]?.id ?? '')

  const layout = useMemo(() => {
    if (!me) return null
    return s.view === 'ped' ? pedigreeLayout(t, me.id, s.gens) : { ...descendantLayout(t, root, s.gens + 3), slots: [] as ReturnType<typeof pedigreeLayout>['slots'] }
  }, [t, me, s.view, s.gens, root])

  const setTree = (tree: Tree, focus = s.focus) => set({ tree, focus })
  const editMe = (p: Partial<Person>) => setTree({ ...t, people: t.people.map((x) => (x.id === me.id ? { ...x, ...p } : x)) })
  const editFam = (id: string, p: Partial<Family>) => setTree({ ...t, families: t.families.map((f) => (f.id === id ? { ...f, ...p } : f)) })

  const addParent = (child: string, role: 'father' | 'mother') => {
    const c = ix.person.get(child)!
    const p = newPerson(t, role === 'father' ? 'Father' : 'Mother', role === 'father' ? c.surname : '', role === 'father' ? 'M' : 'F')
    let fams = t.families
    let f = ix.childOf.get(child)?.[0]
    if (!f) {
      f = newFamily(t, { children: [child] })
      fams = [...fams, f]
    }
    const key = role === 'father' ? 'husb' : 'wife'
    if (f[key]) return
    fams = fams.map((x) => (x.id === f!.id ? { ...f!, [key]: p.id } : x))
    setTree({ people: [...t.people, p], families: fams }, p.id)
  }
  const addSpouse = (existing?: string) => {
    const sp = existing ? ix.person.get(existing)! : newPerson(t, 'Partner', '', me.sex === 'M' ? 'F' : me.sex === 'F' ? 'M' : 'U')
    const meHusb = me.sex !== 'F' && sp.sex !== 'M'
    const f = newFamily(t, meHusb ? { husb: me.id, wife: sp.id } : { husb: sp.id, wife: me.id })
    setTree({ people: existing ? t.people : [...t.people, sp], families: [...t.families, f] }, existing ? me.id : sp.id)
  }
  const addChild = () => {
    const fams = ix.spouseIn.get(me.id) ?? []
    let f = fams.find((x) => x.id === childFam) ?? fams[0]
    let families = t.families
    if (!f) {
      f = newFamily(t, me.sex === 'F' ? { wife: me.id } : { husb: me.id })
      families = [...families, f]
    }
    const father = f.husb ? ix.person.get(f.husb) : undefined
    const c = newPerson(t, 'Child', father?.surname ?? me.surname, 'U')
    families = families.map((x) => (x.id === f!.id ? { ...f!, children: [...f!.children, c.id] } : x))
    setTree({ people: [...t.people, c], families }, c.id)
  }
  const addSibling = () => {
    let f = ix.childOf.get(me.id)?.[0]
    let families = t.families
    if (!f) {
      f = newFamily(t, { children: [me.id] })
      families = [...families, f]
    }
    const c = newPerson(t, 'Sibling', me.surname, 'U')
    families = families.map((x) => (x.id === f!.id ? { ...f!, children: [...f!.children, c.id] } : x))
    setTree({ people: [...t.people, c], families }, c.id)
  }
  const remove = () => {
    if (t.people.length <= 1) return
    const id = me.id
    const families = t.families
      .map((f) => ({ ...f, husb: f.husb === id ? undefined : f.husb, wife: f.wife === id ? undefined : f.wife, children: f.children.filter((c) => c !== id) }))
      .filter((f) => (f.husb ? 1 : 0) + (f.wife ? 1 : 0) + f.children.length >= 2)
    const people = t.people.filter((p) => p.id !== id)
    const next = parentsOf(ix, id)[0] ?? people[0].id
    set({ tree: { people, families }, focus: next, root: s.root === id ? next : s.root, relA: s.relA === id ? next : s.relA, relB: s.relB === id ? next : s.relB })
  }

  const exportSvg = () => {
    const el = svgRef.current
    if (!el) return
    const src = new XMLSerializer().serializeToString(el)
    return src.startsWith('<svg') && !src.includes('xmlns="http://www.w3.org/2000/svg"') ? src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"') : src
  }
  const exportPng = () => {
    const src = exportSvg()
    if (!src || !layout) return
    const img = new Image()
    const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }))
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = layout.w * 2
      c.height = layout.h * 2
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => b && download('family-tree.png', b))
    }
    img.src = url
  }
  const importGed = async (f: File) => {
    try {
      const tree = fromGedcom(await f.text())
      if (!tree.people.length) throw new Error('No people found in the file.')
      setPrev(t)
      const first = tree.people[0].id
      set({ tree, focus: first, root: topAncestor(tree, first), relA: first, relB: tree.people[1]?.id ?? first })
      setMsg(`Imported ${tree.people.length} people and ${tree.families.length} families from ${f.name}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read the file.')
    }
  }

  if (!me || !layout) {
    return <Panel title="Family tree"><Note>The tree is empty.</Note><Btn onClick={reset}>Load the sample family</Btn></Panel>
  }

  const rel = ix.person.has(s.relA) && ix.person.has(s.relB) ? relationship(t, s.relA, s.relB) : null
  const opts = [...t.people].sort((a, b) => fullName(a).localeCompare(fullName(b))).map((p) => [p.id, `${fullName(p)} ${lifespan(p) && `(${lifespan(p)})`}`] as [string, string])
  const myFams = ix.spouseIn.get(me.id) ?? []
  const sibs = siblingsOf(ix, me.id)
  const gensSpan = (() => {
    const ys = t.people.map((p) => year(p.birth.date)).filter(Number.isFinite)
    return ys.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : '—'
  })()
  const surnames = new Set(t.people.map((p) => p.surname).filter(Boolean)).size
  const list = t.people.filter((p) => fullName(p).toLowerCase().includes(q.toLowerCase()))
  const W = layout.w, H = layout.h
  const link = (id: string) => <a key={id} href="#" onClick={(e) => { e.preventDefault(); set({ focus: id }) }}>{fullName(ix.person.get(id))}</a>

  return (
    <div>
      <Stats>
        <Stat label="People" value={t.people.length} />
        <Stat label="Families" value={t.families.length} />
        <Stat label="Surnames" value={surnames} />
        <Stat label="Births span" value={gensSpan} />
      </Stats>
      <Panel
        title={s.view === 'ped' ? `Ancestors of ${fullName(me)}` : `Descendants of ${fullName(ix.person.get(root))}`}
        actions={
          <>
            <Btn onClick={() => { const x = exportSvg(); if (x) download('family-tree.svg', x, 'image/svg+xml') }}>⬇ SVG</Btn>
            <Btn onClick={exportPng}>⬇ PNG</Btn>
          </>
        }
      >
        <Row>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['desc', 'Descendant chart'], ['ped', 'Pedigree (ancestors)']]} />
          {s.view === 'desc' && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select label="Start from" value={root} onChange={(r) => set({ root: r })} options={opts} />
              <Btn onClick={() => set({ root: me.id })}>Selected person</Btn>
              <Btn onClick={() => set({ root: topAncestor(t, me.id) })}>Oldest ancestor</Btn>
            </span>
          )}
          <span style={{ minWidth: 160 }}><Slider label="Generations" value={s.gens} onChange={(gens) => set({ gens })} min={2} max={6} show={(v) => String(s.view === 'ped' ? v : v + 3)} /></span>
          <span style={{ minWidth: 140 }}><Slider label="Zoom" value={s.zoom} onChange={(zoom) => set({ zoom })} min={0.4} max={1.5} step={0.1} show={(v) => `${Math.round(v * 100)}%`} /></span>
        </Row>
        <div style={{ overflow: 'auto', maxHeight: 640, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)' }}>
          <svg ref={svgRef} width={W * s.zoom} height={H * s.zoom} viewBox={`0 0 ${W} ${H}`} fontFamily="system-ui, sans-serif" role="img" aria-label="Family tree chart">
            {layout.lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray={l.dashed ? '5 4' : undefined} />)}
            {layout.slots.map((sl) => (
              <g key={`${sl.child}-${sl.role}`} onClick={() => addParent(sl.child, sl.role)} style={{ cursor: 'pointer' }}>
                <rect x={sl.x} y={sl.y} width={BOX_W} height={BOX_H} rx={8} fill="none" stroke="#94a3b8" strokeDasharray="5 4" />
                <text x={sl.x + BOX_W / 2} y={sl.y + BOX_H / 2 + 4} textAnchor="middle" fontSize={12} fill="#64748b">+ add {sl.role}</text>
              </g>
            ))}
            {layout.boxes.map((b) => {
              const p = ix.person.get(b.id)
              if (!p) return null
              const [fill, stroke] = FILL[p.sex]
              const sel = p.id === me.id
              return (
                <g key={`${b.id}-${b.x}-${b.y}`} onClick={() => set({ focus: p.id })} style={{ cursor: 'pointer' }}>
                  <rect x={b.x} y={b.y} width={BOX_W} height={BOX_H} rx={8} fill={fill} stroke={sel ? '#f59e0b' : stroke} strokeWidth={sel ? 3 : 1.4} opacity={b.ghost ? 0.55 : 1} />
                  <text x={b.x + BOX_W / 2} y={b.y + 21} textAnchor="middle" fontSize={13} fontWeight={600} fill="#0f172a">{trunc(fullName(p), 21)}</text>
                  <text x={b.x + BOX_W / 2} y={b.y + 39} textAnchor="middle" fontSize={11} fill="#475569">{b.ghost ? `↗ ${b.ghost}` : lifespan(p) || ' '}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Click a person to edit. Dashed marriage lines = divorced; dashed boxes = unknown parents (click to add). Blue/pink/green = male/female/unknown.</p>
      </Panel>
      <Split>
        <div>
          <Panel title={`Edit: ${fullName(me)}`} actions={<Btn kind="danger" onClick={remove} disabled={t.people.length <= 1}>Delete</Btn>}>
            <Row>
              <Txt label="Given names" value={me.given} onChange={(given) => editMe({ given })} />
              <Txt label="Surname" value={me.surname} onChange={(surname) => editMe({ surname })} />
            </Row>
            <Seg value={me.sex} onChange={(sex) => editMe({ sex })} options={[['M', 'Male'], ['F', 'Female'], ['U', 'Unknown']]} />
            <Row>
              <Txt label="Born (date)" value={me.birth.date} onChange={(date) => editMe({ birth: { ...me.birth, date } })} placeholder="12 MAR 1950 or ABT 1890" />
              <Txt label="Birthplace" value={me.birth.place} onChange={(place) => editMe({ birth: { ...me.birth, place } })} />
            </Row>
            <Row>
              <Txt label="Died (date)" value={me.death.date} onChange={(date) => editMe({ death: { ...me.death, date } })} />
              <Txt label="Place of death" value={me.death.place} onChange={(place) => editMe({ death: { ...me.death, place } })} />
            </Row>
            <Area label="Notes" value={me.notes} onChange={(notes) => editMe({ notes })} rows={3} />
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>
              <b>Parents:</b> {parentsOf(ix, me.id).map(link).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}{!parentsOf(ix, me.id).length && <span className="muted">none</span>}<br />
              <b>Siblings:</b> {sibs.length ? sibs.map((x, i) => <span key={x.id}>{i ? ', ' : ''}{link(x.id)}{x.half ? ' (half)' : ''}</span>) : <span className="muted">none</span>}
            </p>
            {myFams.map((f) => {
              const sp = partner(f, me.id)
              return (
                <div key={f.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                  <b>Family with {sp ? link(sp) : 'unknown partner'}</b>{f.children.length > 0 && <> · children: {f.children.map((c, i) => <span key={c}>{i ? ', ' : ''}{link(c)}</span>)}</>}
                  <Row>
                    <Txt label="Marriage date" value={f.marr.date} onChange={(date) => editFam(f.id, { marr: { ...f.marr, date } })} />
                    <Txt label="Place" value={f.marr.place} onChange={(place) => editFam(f.id, { marr: { ...f.marr, place } })} />
                    <label className="k-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.div} onChange={(e) => editFam(f.id, { div: e.target.checked })} /> Divorced</label>
                  </Row>
                </div>
              )
            })}
            <Row>
              <Btn onClick={() => addParent(me.id, 'father')} disabled={!!ix.childOf.get(me.id)?.[0]?.husb}>+ Father</Btn>
              <Btn onClick={() => addParent(me.id, 'mother')} disabled={!!ix.childOf.get(me.id)?.[0]?.wife}>+ Mother</Btn>
              <Btn onClick={() => addSpouse()}>+ Partner</Btn>
              <Btn onClick={addSibling}>+ Sibling</Btn>
            </Row>
            <Row>
              {myFams.length > 1 && (
                <select className="k-select" value={childFam} onChange={(e) => setChildFam(e.target.value)} aria-label="Child of which family" style={{ maxWidth: 220 }}>
                  {myFams.map((f) => <option key={f.id} value={f.id}>with {fullName(ix.person.get(partner(f, me.id) ?? ''))}</option>)}
                </select>
              )}
              <Btn onClick={addChild}>+ Child</Btn>
            </Row>
            <Row>
              <select className="k-select" value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label="Existing person" style={{ maxWidth: 240 }}>
                <option value="">Link an existing person as partner…</option>
                {opts.filter(([id]) => id !== me.id).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
              <Btn disabled={!linkId} onClick={() => { addSpouse(linkId); setLinkId('') }}>Link</Btn>
            </Row>
          </Panel>
        </div>
        <div>
          <Panel title="Relationship calculator">
            <Row>
              <Select label="How is…" value={s.relB} onChange={(relB) => set({ relB })} options={opts} />
              <Select label="…related to" value={s.relA} onChange={(relA) => set({ relA })} options={opts} />
            </Row>
            <Row>
              <Btn onClick={() => set({ relA: s.relB, relB: s.relA })}>⇄ Swap</Btn>
              <Btn onClick={() => set({ relB: me.id })}>Use selected</Btn>
            </Row>
            {rel && (
              <Note tone={rel.label.startsWith('no ') ? 'warn' : 'ok'}>
                <b>{fullName(ix.person.get(s.relB))}</b> is {rel.label.startsWith('no ') || rel.label.startsWith('the ') ? '' : `${fullName(ix.person.get(s.relA))}’s `}
                <b style={{ fontSize: 18 }}>{rel.label}</b>.
                {rel.detail && <div style={{ fontSize: 13, marginTop: 4 }}>{rel.detail}</div>}
              </Note>
            )}
            <p className="muted" style={{ fontSize: 12 }}>Cousin degree = generations from the nearer person to the common ancestor, minus one; “removed” = the difference in generations.</p>
          </Panel>
          <Panel title="GEDCOM 5.5.1">
            <Row>
              <Btn kind="primary" onClick={() => download('family-tree.ged', toGedcom(t, { date: new Date().toUTCString().slice(5, 16).toUpperCase() }), 'text/plain')}>⬇ Export .ged</Btn>
              <CopyButton text={() => toGedcom(t)} label="Copy GEDCOM" />
              {prev && <Btn onClick={() => { setPrev(null); set({ tree: prev, focus: prev.people[0]?.id ?? '' }) }}>Undo import</Btn>}
              <Btn kind="ghost" onClick={() => { setPrev(t); reset() }}>Load sample</Btn>
            </Row>
            <FileDrop accept=".ged,.gedcom,text/plain" onFiles={([f]) => void importGed(f)} label="Import a .ged file (replaces the current tree)" />
            {msg && <Note>{msg}</Note>}
            <p className="muted" style={{ fontSize: 12 }}>Exports people (names, sex, birth, death, notes) and families (partners, children, marriage, divorce) as UTF-8 lineage-linked GEDCOM, readable by most genealogy programs. Your tree is saved in this browser only.</p>
          </Panel>
          <Panel title="People">
            <Txt label="Search" value={q} onChange={setQ} placeholder="Name…" />
            <Table
              max={40}
              head={['Name', 'Life', 'Born in']}
              rows={list.map((p) => [link(p.id), lifespan(p), p.birth.place])}
            />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
