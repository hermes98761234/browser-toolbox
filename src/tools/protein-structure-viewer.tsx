import { useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, FileDrop, Note, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState, color } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { elem } from './lib/molecule-viewer'
import { demoProteinPdb, fasta, parseProtein, radiusOfGyration, resClass, seqMass, sequenceOf, type Protein, type Residue } from './lib/protein-structure-viewer'

type Style = 'cartoon' | 'trace' | 'sticks' | 'spacefill'
type ColorBy = 'ss' | 'chain' | 'rainbow' | 'residue' | 'bfactor'
const DEF = { style: 'cartoon' as Style, colorBy: 'ss' as ColorBy, ligands: true, water: false, spin: true, neighbors: true, hidden: [] as string[] }
const SS_COL = { H: '#e11d74', E: '#facc15', C: '#cbd5e1' }
const CLASS_COL = { hydrophobic: '#f59e0b', polar: '#10b981', positive: '#3b82f6', negative: '#ef4444', special: '#a855f7' }
const SS_BG = { H: 'rgba(225,29,116,.22)', E: 'rgba(250,204,21,.3)', C: 'transparent' }
type V3 = THREE.Vector3
const titleCase = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t)
const key = (r: Residue) => `${r.chain}:${r.seq}`

function cartoonGeometry(p: Protein, res: Residue[], colorOf: (r: Residue) => THREE.Color, trace: boolean): THREE.BufferGeometry | null {
  const at = (i: number) => { const a = p.mol.atoms[i]; return new THREE.Vector3(a.x, a.y, a.z) }
  const pts = res.map((r) => at(r.ca))
  if (pts.length < 2) return null
  // guide vectors (CA→O), kept from flipping between neighbours
  const guides: V3[] = res.map((r, i) => {
    if (r.o >= 0) return at(r.o).sub(pts[i]).normalize()
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    return a.clone().add(b).multiplyScalar(0.5).sub(pts[i]).normalize()
  })
  for (let i = 1; i < guides.length; i++) if (guides[i].dot(guides[i - 1]) < 0) guides[i].negate()
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const S = 8, N = (pts.length - 1) * S + 1, M = 14
  const pos: number[] = [], col: number[] = [], resIdx: number[] = [], idx: number[] = []
  const isArrowEnd = (i: number) => res[i].ss === 'E' && (res[i + 1]?.ss !== 'E' || res[i + 1]?.chain !== res[i].chain)
  const dims = (i: number, f: number): [number, number] => {
    if (trace) return [0.32, 0.32]
    const r = res[i]
    if (r.ss === 'E' && isArrowEnd(i)) return [1.9 * (1 - f) + 0.25 * f, 0.32]
    if (r.ss === 'E' && i > 0 && isArrowEnd(i - 1)) return [0.3, 0.3]
    return r.ss === 'H' ? [1.35, 0.26] : r.ss === 'E' ? [1.15, 0.32] : [0.3, 0.3]
  }
  const T = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3(), P = new THREE.Vector3()
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1)
    const u = t * (pts.length - 1)
    const i0 = Math.min(pts.length - 1, Math.floor(u)), f = u - i0
    const ri = Math.min(pts.length - 1, Math.round(u))
    curve.getPoint(t, P)
    curve.getTangent(t, T)
    const g = guides[i0].clone().lerp(guides[Math.min(guides.length - 1, i0 + 1)], f)
    side.copy(g).addScaledVector(T, -g.dot(T)).normalize()
    nrm.crossVectors(T, side).normalize()
    // blend widths between residues except across arrow heads
    let [w, h] = dims(i0, f)
    if (!isArrowEnd(i0) && i0 + 1 < res.length && !(i0 > 0 && isArrowEnd(i0 - 1) && f < 0.01)) {
      const [w2, h2] = dims(i0 + 1, 0)
      const e = f * f * (3 - 2 * f)
      w = w * (1 - e) + w2 * e
      h = h * (1 - e) + h2 * e
    }
    const c = colorOf(res[ri])
    for (let m = 0; m < M; m++) {
      const a = (m / M) * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      const x = Math.sign(ca) * Math.abs(ca) ** 0.6 * w, y = Math.sign(sa) * Math.abs(sa) ** 0.6 * h
      pos.push(P.x + side.x * x + nrm.x * y, P.y + side.y * x + nrm.y * y, P.z + side.z * x + nrm.z * y)
      col.push(c.r, c.g, c.b)
      resIdx.push(ri)
    }
    if (k < N - 1) for (let m = 0; m < M; m++) {
      const a = k * M + m, b = k * M + ((m + 1) % M), c2 = a + M, d = b + M
      idx.push(a, c2, b, b, c2, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.userData.res = resIdx
  return geo
}

export default function ProteinStructureViewer() {
  const [s, set, reset] = useToolState('protein-structure-viewer', DEF)
  const [src, setSrc] = useState<{ text: string; file: string }>(() => ({ text: demoProteinPdb(), file: 'demo-protein.pdb' }))
  const [sel, setSel] = useState<string[]>(['A:20'])
  const [query, setQuery] = useState('')
  const parsed = useMemo(() => {
    try {
      const p = parseProtein(src.text)
      if (!p.residues.length) return { p: null as Protein | null, err: 'No amino-acid residues with Cα atoms found — is this a protein PDB?' }
      return { p, err: '' }
    } catch (e) {
      return { p: null as Protein | null, err: (e as Error).message }
    }
  }, [src])
  const p = parsed.p
  const resByKey = useMemo(() => new Map(p?.residues.map((r) => [key(r), r]) ?? []), [p])
  const selAtoms = useMemo(() => sel.flatMap((k) => resByKey.get(k)?.atoms ?? []), [sel, resByKey])
  const neighbors = useMemo(() => {
    if (!p || !selAtoms.length) return [] as Residue[]
    const sa = selAtoms.map((i) => p.mol.atoms[i])
    return p.residues.filter((r) => !sel.includes(key(r)) && r.atoms.some((i) => { const a = p.mol.atoms[i]; return sa.some((b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < 25) }))
  }, [p, selAtoms, sel])
  const pickables = useRef<THREE.Object3D[]>([])

  const toggle = (k: string) => setSel((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'prot'
      st.scene.add(g)
      const el = st.renderer.domElement
      let sx = 0, sy = 0
      const down = (e: PointerEvent) => { sx = e.clientX; sy = e.clientY }
      const up = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(pickables.current, false)[0]
        if (!hit) return
        const k = hit.object.userData.pick?.(hit) as string | undefined
        if (k) toggle(k)
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    (st) => {
      const g = st.scene.getObjectByName('prot') as THREE.Group
      st.clear(g)
      pickables.current = []
      st.controls.autoRotate = s.spin
      st.controls.autoRotateSpeed = 1
      if (!p) return
      const atoms = p.mol.atoms
      const shownChains = p.chains.filter((c) => !s.hidden.includes(c))
      const resShown = p.residues.filter((r) => shownChains.includes(r.chain))
      const pts = resShown.map((r) => atoms[r.ca])
      const c = pts.reduce((q, a) => [q[0] + a.x / pts.length, q[1] + a.y / pts.length, q[2] + a.z / pts.length], [0, 0, 0])
      const R = Math.max(5, ...pts.map((a) => Math.hypot(a.x - c[0], a.y - c[1], a.z - c[2])))
      const sc = 5 / R
      g.scale.setScalar(sc)
      g.position.set(-c[0] * sc, -c[1] * sc, -c[2] * sc)
      const bmax = Math.max(1, ...p.residues.map((r) => r.b)), bmin = Math.min(...p.residues.map((r) => r.b))
      const order = new Map<Residue, [number, number]>()
      for (const ch of p.chains) { const list = p.residues.filter((x) => x.chain === ch); list.forEach((r, i) => order.set(r, [i, list.length])) }
      const colorOf = (r: Residue) => {
        switch (s.colorBy) {
          case 'ss': return new THREE.Color(SS_COL[r.ss])
          case 'chain': return new THREE.Color(color(p.chains.indexOf(r.chain)))
          case 'residue': return new THREE.Color(CLASS_COL[resClass(r.one)])
          case 'bfactor': return new THREE.Color().setHSL(0.66 * (1 - (r.b - bmin) / (bmax - bmin || 1)), 0.85, 0.55)
          default: {
            const [i, n] = order.get(r) ?? [0, 1]
            return new THREE.Color().setHSL(0.7 * (1 - i / Math.max(1, n - 1)), 0.85, 0.55)
          }
        }
      }
      const atomList = (filter: (i: number) => boolean) => atoms.map((_, i) => i).filter(filter)
      const spheres = (ids: number[], radius: (el: string) => number, col: (i: number) => THREE.Color, pickable = true) => {
        if (!ids.length) return
        const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.4 }), ids.length)
        const m = new THREE.Matrix4()
        ids.forEach((i, k) => {
          const a = atoms[i], r = radius(a.el)
          m.makeScale(r, r, r).setPosition(a.x, a.y, a.z)
          im.setMatrixAt(k, m)
          im.setColorAt(k, col(i))
        })
        if (pickable) {
          im.userData.pick = (hit: THREE.Intersection) => { const a = atoms[ids[hit.instanceId ?? 0]]; return a.het ? undefined : `${a.chain}:${a.resSeq}` }
          pickables.current.push(im)
        }
        g.add(im)
      }
      const sticks = (ids: number[], col: (i: number) => THREE.Color, r = 0.16) => {
        const set1 = new Set(ids)
        const bonds = p.mol.bonds.filter((b) => set1.has(b.a) && set1.has(b.b))
        if (!bonds.length) return
        const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.4 }), bonds.length * 2)
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0)
        bonds.forEach((b, k) => {
          const A = new THREE.Vector3(atoms[b.a].x, atoms[b.a].y, atoms[b.a].z), B = new THREE.Vector3(atoms[b.b].x, atoms[b.b].y, atoms[b.b].z)
          const mid = A.clone().add(B).multiplyScalar(0.5)
          ;[[A, mid, b.a], [mid, B, b.b]].forEach(([p0, p1, ai], j) => {
            const d = (p1 as V3).clone().sub(p0 as V3)
            q.setFromUnitVectors(upv, d.clone().normalize())
            m.compose((p0 as V3).clone().add(p1 as V3).multiplyScalar(0.5), q, new THREE.Vector3(r, d.length(), r))
            im.setMatrixAt(k * 2 + j, m)
            im.setColorAt(k * 2 + j, col(ai as number))
          })
        })
        g.add(im)
      }
      const resOfAtom = new Map<number, Residue>()
      for (const r of p.residues) for (const i of r.atoms) resOfAtom.set(i, r)
      const cpk = (i: number) => new THREE.Color(elem(atoms[i].el)[0])
      const schemeAtom = (i: number) => { const r = resOfAtom.get(i); return r && s.colorBy !== 'ss' ? colorOf(r) : atoms[i].el === 'C' && r ? colorOf(r) : cpk(i) }
      const protAtoms = atomList((i) => !atoms[i].het && shownChains.includes(atoms[i].chain) && atoms[i].el !== 'H')

      if (s.style === 'cartoon' || s.style === 'trace') {
        for (const ch of shownChains) {
          const list = resShown.filter((r) => r.chain === ch)
          // split at chain breaks
          let seg: Residue[] = []
          const flush = () => {
            const geo = cartoonGeometry(p, seg, colorOf, s.style === 'trace')
            if (geo) {
              const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }))
              const segRes = seg
              mesh.userData.pick = (hit: THREE.Intersection) => { const ri = (geo.userData.res as number[])[hit.face?.a ?? 0]; return segRes[ri] ? key(segRes[ri]) : undefined }
              pickables.current.push(mesh)
              g.add(mesh)
            }
            seg = []
          }
          list.forEach((r, i) => {
            const prev = list[i - 1]
            if (prev) {
              const a = atoms[prev.ca], b = atoms[r.ca]
              if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 4.3) flush()
            }
            seg.push(r)
          })
          flush()
        }
      } else if (s.style === 'sticks') {
        spheres(protAtoms, () => 0.2, schemeAtom)
        sticks(protAtoms, schemeAtom)
      } else {
        spheres(protAtoms, (el) => elem(el)[2], schemeAtom)
      }
      // ligands & water
      const lig = atomList((i) => atoms[i].het && (atoms[i].res === 'HOH' ? s.water : s.ligands))
      if (lig.length) {
        spheres(lig, (el) => (['C', 'N', 'O', 'S', 'P', 'H'].includes(el) ? 0.3 : 0.9), cpk, false)
        sticks(lig, cpk, 0.12)
      }
      // selection highlight (+ neighbours)
      const selIds = selAtoms.filter((i) => shownChains.includes(atoms[i].chain))
      if (selIds.length) {
        spheres(selIds, () => 0.32, (i) => (atoms[i].el === 'C' ? new THREE.Color('#fde047') : cpk(i)))
        sticks(selIds, (i) => (atoms[i].el === 'C' ? new THREE.Color('#fde047') : cpk(i)), 0.17)
        for (const k of sel) {
          const r = resByKey.get(k)
          if (!r || !shownChains.includes(r.chain)) continue
          const a = atoms[r.ca]
          const t = label(`${r.name} ${r.chain}${r.seq}`, '#fde68a', 0.42 / sc)
          t.position.set(a.x, a.y + 2.2, a.z)
          g.add(t)
        }
      }
      if (s.neighbors && neighbors.length && s.style !== 'spacefill') {
        const nb = neighbors.filter((r) => shownChains.includes(r.chain)).flatMap((r) => r.atoms)
        sticks(nb, (i) => (atoms[i].el === 'C' ? new THREE.Color('#94a3b8') : cpk(i)), 0.1)
      }
    },
    [p, s.style, s.colorBy, s.ligands, s.water, s.spin, s.hidden, s.neighbors, sel, neighbors, selAtoms, resByKey],
    { camera: [5, 6, 12], target: [0, 0, 0], grid: false, background: '#0b1120' },
  )

  const open = (text: string, file: string) => { setSrc({ text, file }); setSel([]) }
  const runQuery = () => {
    if (!p) return
    const q = query.trim().toUpperCase()
    const m = /^([A-Z0-9])?:?(\d+)(?:-(\d+))?$/.exec(q)
    let hits: Residue[] = []
    if (m) hits = p.residues.filter((r) => (!m[1] || r.chain === m[1]) && r.seq >= +m[2] && r.seq <= +(m[3] ?? m[2]))
    else if (q) hits = p.residues.filter((r) => r.name === q || r.one === q)
    setSel(hits.slice(0, 60).map(key))
  }

  const ca = p ? p.residues.map((r) => { const a = p.mol.atoms[r.ca]; return [a.x, a.y, a.z] as [number, number, number] }) : []
  const nH = p?.residues.filter((r) => r.ss === 'H').length ?? 0
  const nE = p?.residues.filter((r) => r.ss === 'E').length ?? 0
  const nR = p?.residues.length ?? 0
  const selRes = sel.map((k) => resByKey.get(k)).filter((r): r is Residue => !!r)

  return (
    <div>
      <Stats>
        <Stat label="Structure" value={<span style={{ fontSize: 16, lineHeight: 1.25, display: 'block' }}>{titleCase(p?.mol.title ?? '—').slice(0, 60)}</span>} sub={src.file} tone="accent" />
        <Stat label="Chains / residues" value={p ? `${p.chains.length} / ${nR}` : '—'} sub={p ? `${p.mol.atoms.length} atoms · ${p.ligands.filter((l) => l.name !== 'HOH').length} ligands` : ''} />
        <Stat label="Secondary structure" value={`${num((nH / (nR || 1)) * 100, 0)}% α · ${num((nE / (nR || 1)) * 100, 0)}% β`} sub={p?.ssSource === 'records' ? 'from HELIX/SHEET records' : p?.ssSource === 'estimated' ? 'estimated from Cα geometry' : ''} />
        <Stat label="Radius of gyration" value={`${num(radiusOfGyration(ca), 1)} Å`} sub="over Cα atoms" />
      </Stats>
      <Split wide="left">
        <Panel title="3D view" actions={<Seg value={s.style} onChange={(style) => set({ style })} options={[['cartoon', 'Cartoon'], ['trace', 'Trace'], ['sticks', 'Sticks'], ['spacefill', 'Spacefill']]} />}>
          <View3D refEl={ref} height={500} />
          <Row>
            <Select label="Colour by" value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['ss', 'Secondary structure'], ['chain', 'Chain'], ['rainbow', 'Rainbow N→C'], ['residue', 'Residue type'], ['bfactor', 'B-factor']]} />
            <Check label="Ligands" value={s.ligands} onChange={(ligands) => set({ ligands })} />
            <Check label="Water" value={s.water} onChange={(water) => set({ water })} />
            <Check label="Contacts ≤5 Å" value={s.neighbors} onChange={(neighbors) => set({ neighbors })} />
            <Check label="Spin" value={s.spin} onChange={(spin) => set({ spin })} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
            {(s.colorBy === 'ss' ? [['α-helix', SS_COL.H], ['β-strand', SS_COL.E], ['coil', SS_COL.C]] : s.colorBy === 'residue' ? Object.entries(CLASS_COL) : s.colorBy === 'chain' ? (p?.chains ?? []).map((c, i) => [`Chain ${c}`, color(i)]) : s.colorBy === 'bfactor' ? [['low B (rigid)', '#3b82f6'], ['high B (flexible)', '#ef4444']] : [['N-terminus', '#3b82f6'], ['C-terminus', '#ef4444']]).map(([n, c]) => (
              <span key={n}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c, marginRight: 4 }} />{n}</span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Click the cartoon or an atom to select a residue · drag to rotate · scroll to zoom.</p>
        </Panel>
        <div>
          <Panel title="Load structure" actions={<Btn kind="ghost" onClick={() => { reset(); open(demoProteinPdb(), 'demo-protein.pdb') }}>Reset</Btn>}>
            <FileDrop accept=".pdb,.ent,.txt" onFiles={async (fs) => open(await fs[0].text(), fs[0].name)} label="Drop a .pdb file (e.g. from rcsb.org)" />
            <details>
              <summary className="muted">Paste PDB text</summary>
              <textarea className="k-area mono" rows={5} value={src.text.length > 60000 ? '(large file loaded)' : src.text} onChange={(e) => open(e.target.value, 'pasted.pdb')} />
            </details>
            {src.file !== 'demo-protein.pdb' && <Btn onClick={() => open(demoProteinPdb(), 'demo-protein.pdb')}>Load demo protein</Btn>}
            {parsed.err && <Note tone="err">{parsed.err}</Note>}
          </Panel>
          {p && (
            <Panel title="Chains" actions={<CopyButton text={() => fasta(p, p.mol.title.replace(/\s+/g, '_'))} label="FASTA" />}>
              <Table
                head={['', 'Chain', 'Residues', 'α / β', 'Mass']}
                rows={p.chains.map((c, i) => {
                  const rs = p.residues.filter((r) => r.chain === c)
                  return [
                    <input key="v" type="checkbox" checked={!s.hidden.includes(c)} aria-label={`Show chain ${c}`} onChange={(e) => set({ hidden: e.target.checked ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })} />,
                    <b key="c" style={{ color: color(i) }}>{c}</b>, rs.length,
                    `${rs.filter((r) => r.ss === 'H').length} / ${rs.filter((r) => r.ss === 'E').length}`, `${num(seqMass(sequenceOf(p, c)) / 1000, 1)} kDa`,
                  ]
                })}
              />
              {p.ligands.filter((l) => l.name !== 'HOH').length > 0 && <p className="muted" style={{ fontSize: 13 }}>Ligands: {p.ligands.filter((l) => l.name !== 'HOH').map((l) => `${l.name} ${l.chain}${l.seq}`).join(', ')}</p>}
            </Panel>
          )}
          <Panel title="Select residues" actions={sel.length > 0 && <Btn kind="ghost" onClick={() => setSel([])}>Clear</Btn>}>
            <Row>
              <Txt label="Residue, range or type" value={query} onChange={setQuery} placeholder="A:20, B:5-12, LYS, W" />
              <Btn kind="primary" onClick={runQuery}>Highlight</Btn>
            </Row>
            {selRes.length > 0 ? (
              <>
                <Table head={['Residue', 'SS', 'Type', 'Atoms', 'B']} rows={selRes.slice(0, 12).map((r) => [`${r.name} ${r.chain}${r.seq}`, r.ss === 'H' ? 'helix' : r.ss === 'E' ? 'strand' : 'coil', resClass(r.one), r.atoms.length, num(r.b, 1)])} />
                {neighbors.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Within 5 Å: {neighbors.slice(0, 30).map((r) => `${r.one}${r.seq}${p && p.chains.length > 1 ? r.chain : ''}`).join(' ')}{neighbors.length > 30 ? ' …' : ''}</p>}
              </>
            ) : <Note>Click the 3D model or the sequence below.</Note>}
          </Panel>
          {p && p.elements.length > 0 && (
            <Panel title={`Secondary structure elements (${p.elements.length})`}>
              <div style={{ maxHeight: 180, overflow: 'auto' }}>
                <Table head={['Type', 'Chain', 'Residues', 'Length']} rows={p.elements.map((e) => [<span key="t" style={{ color: SS_COL[e.type], fontWeight: 700 }}>{e.type === 'H' ? 'α-helix' : 'β-strand'}</span>, e.chain, `${e.start}–${e.end}`, e.end - e.start + 1])} />
              </div>
            </Panel>
          )}
        </div>
      </Split>
      {p && (
        <Panel title="Sequence" actions={<span className="muted" style={{ fontSize: 12 }}>pink = helix · yellow = strand · click to select</span>}>
          {p.chains.map((c) => (
            <div key={c} style={{ marginBottom: 10 }}>
              <b>Chain {c}</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 13, marginTop: 4 }}>
                {p.residues.filter((r) => r.chain === c).slice(0, 2000).map((r, ri) => {
                  const on = sel.includes(key(r))
                  return (
                    <span key={ri} title={`${r.name} ${r.chain}${r.seq}`} onClick={() => toggle(key(r))}
                      style={{ cursor: 'pointer', width: '1.25em', textAlign: 'center', position: 'relative', background: on ? '#fde047' : SS_BG[r.ss], color: on ? '#111' : undefined, borderRadius: 3, marginTop: r.seq % 10 === 0 ? 0 : 12 }}>
                      {r.seq % 10 === 0 && <span style={{ display: 'block', fontSize: 9, lineHeight: '12px', color: 'var(--muted)' }}>{r.seq}</span>}
                      {r.one}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
