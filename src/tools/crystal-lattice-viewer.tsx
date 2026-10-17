import { useMemo, useRef } from 'react'
import { Area, Btn, Check, FileDrop, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, download, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { bonds, cellMatrix, density, elInfo, expand, formula, neighbours, parseCif, SAMPLES, supercell, volume, type Crystal, type Site } from './lib/crystal-lattice-viewer'

const NAMES = Object.keys(SAMPLES)
const DEF = { preset: NAMES[0], cif: SAMPLES[NAMES[0]], nx: 2, ny: 2, nz: 2, boundary: true, showBonds: true, edges: true, axes: true, scale: 0.45, tol: 1.15 }

export default function CrystalLatticeViewer() {
  const [s, set, reset] = useToolState('crystal-lattice-viewer', DEF)
  const wrap = useRef<HTMLDivElement>(null)
  const parsed = useMemo((): { c: Crystal; atoms: Site[] } | { err: string } => {
    try {
      const c = parseCif(s.cif)
      return { c, atoms: expand(c) }
    } catch (e) {
      return { err: (e as Error).message }
    }
  }, [s.cif])
  const ok = 'c' in parsed
  const n: [number, number, number] = [s.nx, s.ny, s.nz]
  const scene = useMemo(() => {
    if (!ok) return null
    const all = supercell(parsed.c, parsed.atoms, n, s.boundary)
    return { all, bonds: s.showBonds ? bonds(all, s.tol) : [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, s.nx, s.ny, s.nz, s.boundary, s.showBonds, s.tol])

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      if (!ok || !scene) return
      const M = cellMatrix(parsed.c)
      const corners: number[][] = []
      for (const i of [0, 1]) for (const j of [0, 1]) for (const k of [0, 1]) corners.push([0, 1, 2].map((d) => i * n[0] * M[0][d] + j * n[1] * M[1][d] + k * n[2] * M[2][d]))
      const lo = [0, 1, 2].map((d) => Math.min(...corners.map((c) => c[d]))), hi = [0, 1, 2].map((d) => Math.max(...corners.map((c) => c[d])))
      const size = Math.max(...hi.map((h, d) => h - lo[d]))
      const g = new THREE.Group()
      g.rotation.x = -Math.PI / 2
      const sc = 7 / size
      g.scale.setScalar(sc)
      const cc = lo.map((l, d) => (l + hi[d]) / 2)
      g.position.set(-cc[0] * sc, 3.5 - cc[2] * sc, cc[1] * sc)
      const inner = new THREE.Group()
      g.add(inner)
      root.add(g)
      // atoms: one instanced mesh per element
      const byEl = new Map<string, [number, number, number][]>()
      for (const a of scene.all) byEl.set(a.el, [...(byEl.get(a.el) ?? []), a.p])
      const m4 = new THREE.Matrix4()
      for (const [el, ps] of byEl) {
        const [col, r] = elInfo(el)
        const geo = new THREE.SphereGeometry(r * s.scale, 24, 16)
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1 }), ps.length)
        ps.forEach((p, i) => mesh.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])))
        inner.add(mesh)
      }
      if (scene.bonds.length) {
        const geo = new THREE.CylinderGeometry(0.09, 0.09, 1, 8)
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 }), scene.bonds.length)
        const up = new THREE.Vector3(0, 1, 0)
        scene.bonds.forEach(([i, j, d], k) => {
          const a = new THREE.Vector3(...scene.all[i].p), b = new THREE.Vector3(...scene.all[j].p)
          const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize())
          m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, d, 1))
          mesh.setMatrixAt(k, m4)
        })
        inner.add(mesh)
      }
      if (s.edges) {
        const pts: number[] = []
        const P = (f: number[]) => [0, 1, 2].map((d) => f[0] * M[0][d] + f[1] * M[1][d] + f[2] * M[2][d])
        const seg = (f1: number[], f2: number[]) => pts.push(...P(f1), ...P(f2))
        for (let j = 0; j <= n[1]; j++) for (let k = 0; k <= n[2]; k++) seg([0, j, k], [n[0], j, k])
        for (let i = 0; i <= n[0]; i++) for (let k = 0; k <= n[2]; k++) seg([i, 0, k], [i, n[1], k])
        for (let i = 0; i <= n[0]; i++) for (let j = 0; j <= n[1]; j++) seg([i, j, 0], [i, j, n[2]])
        const lg = new THREE.BufferGeometry()
        lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        inner.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.6 })))
      }
      if (s.axes) {
        const cols = ['#ef4444', '#22c55e', '#3b82f6']
        ;['a', 'b', 'c'].forEach((nm, k) => {
          const v = new THREE.Vector3(...M[k])
          const arrow = new THREE.ArrowHelper(v.clone().normalize(), new THREE.Vector3(0, 0, 0), v.length() * 1.0, cols[k], 0.4, 0.25)
          inner.add(arrow)
          const t = label(nm, cols[k], 0.6 / sc)
          t.position.copy(v.clone().multiplyScalar(1.12))
          inner.add(t)
        })
      }
    },
    [scene, s.scale, s.edges, s.axes],
    { camera: [8, 7, 10], target: [0, 3.5, 0], grid: false },
  )

  const info = ok ? { f: formula(parsed.atoms), V: volume(parsed.c), rho: density(parsed.c, parsed.atoms), nb: neighbours(parsed.c, parsed.atoms) } : null
  const els = ok ? [...new Set(parsed.atoms.map((a) => a.el))] : []
  const xyz = () => {
    if (!scene) return ''
    return `${scene.all.length}\n${ok ? parsed.c.name : ''} ${s.nx}x${s.ny}x${s.nz} supercell\n${scene.all.map((a) => `${a.el} ${a.p.map((v) => v.toFixed(5)).join(' ')}`).join('\n')}\n`
  }
  const p1 = () => {
    if (!ok) return ''
    const c = parsed.c
    return `data_${c.name}_P1\n_symmetry_space_group_name_H-M 'P 1'\n_cell_length_a ${c.a}\n_cell_length_b ${c.b}\n_cell_length_c ${c.c}\n_cell_angle_alpha ${c.alpha}\n_cell_angle_beta ${c.beta}\n_cell_angle_gamma ${c.gamma}\nloop_\n_symmetry_equiv_pos_as_xyz\n'x,y,z'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\n${parsed.atoms.map((a, i) => `${a.el}${i + 1} ${a.el} ${a.x.toFixed(5)} ${a.y.toFixed(5)} ${a.z.toFixed(5)} ${a.occ}`).join('\n')}\n`
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Structure" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Example" value={s.preset} onChange={(preset) => set({ preset, cif: SAMPLES[preset] })} options={NAMES} />
          <FileDrop accept=".cif,text/plain" onFiles={async ([f]) => set({ cif: await f.text(), preset: NAMES[0] })} label="Open a .cif file" />
          <div style={{ marginTop: 10 }}>
            <Area label="CIF text (editable)" value={s.cif} onChange={(cif) => set({ cif })} rows={10} mono />
          </div>
          {!ok && <Note tone="err">{parsed.err}</Note>}
        </Panel>
        <Panel title="Display">
          <Slider label="Repeat along a" value={s.nx} min={1} max={5} onChange={(nx) => set({ nx })} />
          <Slider label="Repeat along b" value={s.ny} min={1} max={5} onChange={(ny) => set({ ny })} />
          <Slider label="Repeat along c" value={s.nz} min={1} max={5} onChange={(nz) => set({ nz })} />
          <Slider label="Atom size" value={s.scale} min={0.1} max={1.2} step={0.05} show={(v) => `${Math.round(v * 100)}% of covalent radius`} onChange={(scale) => set({ scale })} />
          <Row>
            <Check label="Boundary atoms" value={s.boundary} onChange={(boundary) => set({ boundary })} />
            <Check label="Bonds" value={s.showBonds} onChange={(showBonds) => set({ showBonds })} />
            <Check label="Cell edges" value={s.edges} onChange={(edges) => set({ edges })} />
            <Check label="Axes" value={s.axes} onChange={(axes) => set({ axes })} />
          </Row>
          {s.showBonds && <Slider label="Bond tolerance" value={s.tol} min={0.9} max={1.6} step={0.05} show={(v) => `${v.toFixed(2)} × (r₁ + r₂)`} onChange={(tol) => set({ tol })} />}
        </Panel>
      </div>
      <div>
        {info && ok && (
          <Stats>
            <Stat label="Formula" value={info.f.formula} sub={`Z = ${info.f.Z} · ${parsed.c.spaceGroup || 'space group n/a'}`} tone="accent" />
            <Stat label="Cell volume" value={`${num(info.V, 2)} Å³`} sub={`${num(parsed.c.a, 4)}, ${num(parsed.c.b, 4)}, ${num(parsed.c.c, 4)} Å`} />
            <Stat label="Density" value={`${num(info.rho, 3)} g/cm³`} />
            <Stat label="Atoms" value={`${parsed.atoms.length} / cell`} sub={`${scene?.all.length ?? 0} shown · ${scene?.bonds.length ?? 0} bonds`} />
          </Stats>
        )}
        <Panel
          title="Unit cell"
          actions={
            <>
              <Btn onClick={() => { const cv = wrap.current?.querySelector('canvas'); cv?.toBlob((b) => b && download('crystal.png', b, 'image/png')) }}>⬇ PNG</Btn>
              <Btn onClick={() => download('supercell.xyz', xyz(), 'chemical/x-xyz')} disabled={!ok}>⬇ XYZ</Btn>
              <Btn onClick={() => download('structure-P1.cif', p1(), 'chemical/x-cif')} disabled={!ok}>⬇ CIF (P1)</Btn>
            </>
          }
        >
          <div ref={wrap}><View3D refEl={ref} height={480} /></div>
          <div className="k-legend" style={{ marginTop: 8 }}>
            {els.map((e) => <span key={e}><i style={{ background: elInfo(e)[0], border: '1px solid var(--line)' }} />{e}</span>)}
          </div>
        </Panel>
        {info && ok && (
          <Panel title="Sites & coordination">
            <Table
              head={['Site', 'Element', 'Fractional (x, y, z)', 'Nearest', 'CN', 'Neighbours']}
              rows={info.nb.map((r) => {
                const a = parsed.atoms.find((x) => x.label === r.label)!
                return [r.label, r.el, `${a.x.toFixed(4)}, ${a.y.toFixed(4)}, ${a.z.toFixed(4)}`, `${r.d.toFixed(3)} Å`, r.cn, r.with]
              })}
            />
            <Note>
              α = {parsed.c.alpha}°, β = {parsed.c.beta}°, γ = {parsed.c.gamma}°. {parsed.c.ops.length} symmetry operation{parsed.c.ops.length > 1 ? 's' : ''} expanded {parsed.c.sites.length} asymmetric site{parsed.c.sites.length > 1 ? 's' : ''} into {parsed.atoms.length} atoms.
              Coordination number counts neighbours within 10% of the nearest distance. Paste any CIF from the Crystallography Open Database (COD) — symmetry loops are applied automatically.
            </Note>
          </Panel>
        )}
      </div>
    </Split>
  )
}
