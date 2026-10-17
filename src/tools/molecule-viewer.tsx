import { useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, fmt, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState, color } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { angle, benzeneSdf, caffeineSdf, demoPeptidePdb, dihedral, dist, elem, formula, parseAny, type Molecule } from './lib/molecule-viewer'

type Style = 'ball' | 'space' | 'stick' | 'cartoon'
const SAMPLES: Record<string, [string, () => string, string]> = {
  caffeine: ['Caffeine (SDF)', caffeineSdf, 'caffeine.sdf'],
  benzene: ['Benzene (SDF)', benzeneSdf, 'benzene.sdf'],
  peptide: ['Helix–turn–helix peptide (PDB)', demoPeptidePdb, 'demo.pdb'],
  water: ['Water (XYZ)', () => '3\nWater\nO 0.000 0.000 0.117\nH 0.000 0.757 -0.469\nH 0.000 -0.757 -0.469', 'water.xyz'],
}
const DEF = { style: 'ball' as Style, showH: true, colorBy: 'element' as 'element' | 'chain', spin: true, ss: true }
type V = [number, number, number]
const P = (a: { x: number; y: number; z: number }): V => [a.x, a.y, a.z]

function helixFlags(ca: { x: number; y: number; z: number }[]): boolean[] {
  const f = ca.map(() => false)
  for (let i = 0; i + 3 < ca.length; i++) {
    const d = dist(P(ca[i]), P(ca[i + 3]))
    if (d > 4.6 && d < 5.7) for (let k = i; k <= i + 3; k++) f[k] = true
  }
  return f
}

export default function MoleculeViewer() {
  const [s, set, reset] = useToolState('molecule-viewer', DEF)
  const [src, setSrc] = useState<{ text: string; file: string }>(() => ({ text: caffeineSdf(), file: 'caffeine.sdf' }))
  const [picks, setPicks] = useState<number[]>([])
  const parsed = useMemo(() => {
    try {
      return { mol: parseAny(src.text, src.file), err: '' }
    } catch (e) {
      return { mol: null as Molecule | null, err: (e as Error).message }
    }
  }, [src])
  const mol = parsed.mol
  const visible = useMemo(() => (mol ? mol.atoms.map((a, i) => ({ a, i })).filter(({ a }) => s.showH || a.el !== 'H') : []), [mol, s.showH])
  const hasCA = !!mol && mol.atoms.some((a) => a.name === 'CA' && !a.het)
  const chains = useMemo(() => (mol ? [...new Set(mol.atoms.map((a) => a.chain))] : []), [mol])
  const pickMap = useRef<number[]>([])
  const atomMesh = useRef<THREE.InstancedMesh | null>(null)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'mol'
      st.scene.add(g)
      const el = st.renderer.domElement
      let sx = 0, sy = 0
      const down = (e: PointerEvent) => { sx = e.clientX; sy = e.clientY }
      const up = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4 || !atomMesh.current) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObject(atomMesh.current)[0]
        if (hit?.instanceId === undefined) return
        const idx = pickMap.current[hit.instanceId]
        setPicks((p) => (p.includes(idx) ? p.filter((x) => x !== idx) : [...(p.length >= 4 ? [] : p), idx]))
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    (st) => {
      const g = st.scene.getObjectByName('mol') as THREE.Group
      st.clear(g)
      st.controls.autoRotate = s.spin
      st.controls.autoRotateSpeed = 1.2
      atomMesh.current = null
      if (!mol) return
      const atoms = mol.atoms
      const c = atoms.reduce<V>((q, a) => [q[0] + a.x / atoms.length, q[1] + a.y / atoms.length, q[2] + a.z / atoms.length], [0, 0, 0])
      const R = Math.max(2, ...atoms.map((a) => dist(P(a), c)))
      const sc = 4.5 / R
      g.scale.setScalar(sc)
      g.position.set(-c[0] * sc, -c[1] * sc + 2.5, -c[2] * sc)
      const chainColor = (ch: string) => new THREE.Color(color(chains.indexOf(ch)))
      const atomColor = (i: number) => (s.colorBy === 'chain' && !atoms[i].het ? chainColor(atoms[i].chain) : new THREE.Color(elem(atoms[i].el)[0]))
      const cartoon = s.style === 'cartoon' && hasCA
      const shown = visible.filter(({ a }) => !cartoon || a.het)
      const rad = (el: string) => (s.style === 'space' ? elem(el)[2] : s.style === 'stick' || cartoon ? 0.18 : el === 'H' ? 0.2 : 0.16 + 0.12 * elem(el)[2])
      // atoms
      if (shown.length) {
        const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, s.style === 'space' ? 28 : 18, s.style === 'space' ? 20 : 12), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), shown.length)
        const m = new THREE.Matrix4()
        shown.forEach(({ a, i }, k) => {
          const r = rad(a.el)
          m.makeScale(r, r, r).setPosition(a.x, a.y, a.z)
          im.setMatrixAt(k, m)
          im.setColorAt(k, atomColor(i))
        })
        g.add(im)
        atomMesh.current = im
        pickMap.current = shown.map((x) => x.i)
      }
      // bonds (two half-cylinders, coloured like their atoms; double bonds drawn twice)
      if (s.style !== 'space') {
        const show = new Set(shown.map((x) => x.i))
        const list = mol.bonds.filter((b) => show.has(b.a) && show.has(b.b))
        const segs: { p: THREE.Vector3; q: THREE.Vector3; r: number; col: THREE.Color }[] = []
        for (const b of list) {
          const A = new THREE.Vector3(...P(atoms[b.a])), B = new THREE.Vector3(...P(atoms[b.b]))
          const mid = A.clone().add(B).multiplyScalar(0.5)
          const multi = s.style === 'ball' && b.order >= 2 ? Math.round(b.order) : 1
          const dir = B.clone().sub(A).normalize()
          const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize()
          for (let k = 0; k < multi; k++) {
            const off = side.clone().multiplyScalar(multi === 1 ? 0 : (k - (multi - 1) / 2) * 0.16)
            const r = s.style === 'ball' ? (multi > 1 ? 0.055 : 0.09) : 0.18
            segs.push({ p: A.clone().add(off), q: mid.clone().add(off), r, col: atomColor(b.a) }, { p: mid.clone().add(off), q: B.clone().add(off), r, col: atomColor(b.b) })
          }
        }
        if (segs.length) {
          const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.4 }), segs.length)
          const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
          segs.forEach((sg, k) => {
            const d = sg.q.clone().sub(sg.p)
            q.setFromUnitVectors(up, d.clone().normalize())
            m.compose(sg.p.clone().add(sg.q).multiplyScalar(0.5), q, new THREE.Vector3(sg.r, d.length(), sg.r))
            im.setMatrixAt(k, m)
            im.setColorAt(k, sg.col)
          })
          g.add(im)
        }
      }
      // cartoon backbone trace
      if (cartoon) {
        chains.forEach((ch) => {
          const ca = atoms.filter((a) => a.chain === ch && a.name === 'CA' && !a.het)
          if (ca.length < 4) return
          const curve = new THREE.CatmullRomCurve3(ca.map((a) => new THREE.Vector3(a.x, a.y, a.z)))
          const segsN = ca.length * 8, radial = 10
          const helix = helixFlags(ca)
          // helices thick, coils thin: build two tubes sharing the curve
          const geo = new THREE.TubeGeometry(curve, segsN, 1, radial, false)
          const pos = geo.attributes.position
          const cols: number[] = []
          const center = new THREE.Vector3()
          for (let v = 0; v < pos.count; v++) {
            const seg = Math.floor(v / (radial + 1))
            const t = seg / segsN
            const res = Math.min(ca.length - 1, Math.round(t * (ca.length - 1)))
            const isH = helix[res]
            curve.getPointAt(Math.min(1, t), center)
            const vx = new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)).sub(center)
            const rr = s.ss ? (isH ? 0.75 : 0.3) : 0.45
            vx.setLength(rr).add(center)
            pos.setXYZ(v, vx.x, vx.y, vx.z)
            const col = s.ss ? new THREE.Color(isH ? '#ef4444' : '#cbd5e1') : new THREE.Color().setHSL(0.66 * (1 - t), 0.85, 0.55)
            cols.push(col.r, col.g, col.b)
          }
          geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
          geo.computeVertexNormals()
          g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })))
        })
      }
      // picks
      picks.forEach((i, k) => {
        const a = atoms[i]
        if (!a) return
        const halo = new THREE.Mesh(new THREE.SphereGeometry(rad(a.el) * 1.25 + 0.15, 20, 14), new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.45, depthWrite: false }))
        halo.position.set(a.x, a.y, a.z)
        g.add(halo)
        const t = label(`${k + 1}: ${a.el}${a.het ? '' : ' ' + a.res + a.resSeq}`, '#fde68a', 0.45 / sc)
        t.position.set(a.x, a.y + rad(a.el) + 0.5, a.z)
        g.add(t)
      })
      if (picks.length >= 2) {
        const pts = picks.map((i) => new THREE.Vector3(...P(atoms[i])))
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#facc15', dashSize: 0.2, gapSize: 0.12, depthTest: false }))
        line.computeLineDistances()
        line.renderOrder = 5
        g.add(line)
      }
    },
    [mol, s.style, s.showH, s.colorBy, s.spin, s.ss, picks, visible, chains, hasCA],
    { camera: [0, 3, 13], target: [0, 2.5, 0], grid: false, background: '#0b1120' },
  )

  const open = (text: string, file: string) => {
    setSrc({ text, file })
    setPicks([])
  }
  const load = async (f: File) => open(await f.text(), f.name)
  const fm = mol ? formula(mol.atoms) : null
  const residues = mol ? new Set(mol.atoms.filter((a) => !a.het).map((a) => `${a.chain}${a.resSeq}`)).size : 0
  const pa = mol ? picks.map((i) => mol.atoms[i]) : []
  const meas: [string, string][] = []
  if (pa.length >= 2) meas.push(['Distance 1–2', `${fmt(dist(P(pa[0]), P(pa[1])), 4)} Å`])
  if (pa.length >= 3) { meas.push(['Distance 2–3', `${fmt(dist(P(pa[1]), P(pa[2])), 4)} Å`]); meas.push(['Angle 1–2–3', `${fmt(angle(P(pa[0]), P(pa[1]), P(pa[2])), 4)}°`]) }
  if (pa.length >= 4) meas.push(['Dihedral 1–2–3–4', `${fmt(dihedral(P(pa[0]), P(pa[1]), P(pa[2]), P(pa[3])), 4)}°`])

  return (
    <div>
      <Stats>
        <Stat label="Molecule" value={mol?.title.slice(0, 40) ?? '—'} sub={src.file} tone="accent" />
        <Stat label="Formula" value={fm?.text && fm.text.length < 24 ? fm.text : `${mol?.atoms.length ?? 0} atoms`} sub={fm ? `${fmt(fm.mass, 6)} g/mol` : ''} />
        <Stat label="Atoms / bonds" value={`${mol?.atoms.length ?? 0} / ${mol?.bonds.length ?? 0}`} sub={mol?.format === 'sdf' ? 'bonds from file' : 'bonds perceived from distances'} />
        <Stat label="Residues / chains" value={residues ? `${residues} / ${chains.length}` : '—'} />
      </Stats>
      <Split wide="left">
        <Panel title="Structure" actions={<Seg value={s.style} onChange={(style) => set({ style })} options={[['ball', 'Ball & stick'], ['stick', 'Sticks'], ['space', 'Spacefill'], ['cartoon', 'Cartoon']]} />}>
          <View3D refEl={ref} height={480} />
          {s.style === 'cartoon' && !hasCA && <Note tone="warn">Cartoon needs a protein (PDB with CA atoms) — showing sticks instead.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Click atoms to pick them (up to 4) for distance, angle and dihedral. Drag to rotate, scroll to zoom.</p>
        </Panel>
        <div>
          <Panel title="Load" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <FileDrop accept=".pdb,.ent,.sdf,.mol,.xyz" onFiles={(fs) => void load(fs[0])} label="Drop a .pdb, .sdf, .mol or .xyz file" />
            <Select label="Example" value={Object.keys(SAMPLES).find((k) => SAMPLES[k][2] === src.file) ?? ''} onChange={(k) => k && open(SAMPLES[k][1](), SAMPLES[k][2])} options={[['', 'Your file'], ...Object.entries(SAMPLES).map(([k, v]) => [k, v[0]] as [string, string])]} />
            <details>
              <summary className="muted">Paste file contents</summary>
              <textarea className="k-area mono" rows={6} value={src.text.length > 100000 ? '(large file loaded)' : src.text} onChange={(e) => open(e.target.value, 'pasted')} />
            </details>
            {parsed.err && <Note tone="err">{parsed.err}</Note>}
          </Panel>
          <Panel title="Display">
            <Row>
              <Check label="Hydrogens" value={s.showH} onChange={(showH) => set({ showH })} />
              <Check label="Auto-rotate" value={s.spin} onChange={(spin) => set({ spin })} />
              <Check label="Cartoon by helix/coil" value={s.ss} onChange={(ss) => set({ ss })} />
            </Row>
            <Select label="Colour atoms by" value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['element', 'Element (CPK)'], ['chain', 'Chain']]} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
              {[...new Set(mol?.atoms.map((a) => a.el) ?? [])].map((e) => (
                <span key={e}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: elem(e)[0], border: '1px solid var(--line)', marginRight: 4 }} />{e}</span>
              ))}
            </div>
          </Panel>
          <Panel title="Picked atoms" actions={picks.length ? <Btn kind="ghost" onClick={() => setPicks([])}>Clear</Btn> : undefined}>
            {pa.length === 0 ? <Note>Click an atom in the 3D view.</Note> : (
              <Table head={['#', 'Atom', 'Residue', 'x, y, z (Å)']} rows={pa.map((a, k) => [k + 1, `${a.el} ${a.name}`, a.het ? a.res : `${a.res} ${a.chain}${a.resSeq}`, <span key="c" className="mono" style={{ fontSize: 12 }}>{[a.x, a.y, a.z].map((v) => v.toFixed(2)).join(', ')}</span>])} />
            )}
            {meas.length > 0 && <Table head={['Measurement', 'Value']} rows={meas} />}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
