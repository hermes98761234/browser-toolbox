import { useState } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { daysBetween, lastUse, site, SITES, suggest, usage, type Entry, type Route } from './lib/injection-site-map'

const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const SAMPLE: Entry[] = [
  { id: 's1', date: ago(12), time: '08:00', site: 'abd-up-L', note: 'Sample entry' },
  { id: 's2', date: ago(9), time: '08:10', site: 'abd-up-R', note: '' },
  { id: 's3', date: ago(6), time: '07:55', site: 'abd-lo-L', note: 'slight bruise' },
  { id: 's4', date: ago(3), time: '08:05', site: 'thigh-R', note: '' },
]

const DEF = { route: 'SC' as Route | 'all', log: SAMPLE, rest: 7, med: '' }
const COL = { IM: '#ef4444', SC: '#0ea5e9' }

function mannequin(): THREE.Group {
  const g = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.75 })
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z = 0, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, skin)
    m.position.set(x, y, z)
    m.scale.set(sx, sy, sz)
    m.rotation.z = rz
    g.add(m)
  }
  add(new THREE.SphereGeometry(0.25, 32, 20), 0, 3.32, 0, 0.9, 1.08, 0.95)
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 16), 0, 3.0)
  add(new THREE.CapsuleGeometry(0.42, 0.75, 8, 24), 0, 2.38, 0, 1.05, 1, 0.62)
  add(new THREE.SphereGeometry(0.5, 32, 20), 0, 1.74, 0, 1, 0.6, 0.66)
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.17, 20, 14), s * 0.56, 2.82)
    add(new THREE.CapsuleGeometry(0.12, 0.5, 6, 16), s * 0.64, 2.43, 0, 1, 1, 1, s * 0.08)
    add(new THREE.CapsuleGeometry(0.095, 0.5, 6, 16), s * 0.7, 1.86, 0.02, 1, 1, 1, s * 0.03)
    add(new THREE.SphereGeometry(0.1, 16, 12), s * 0.72, 1.48, 0.03, 0.8, 1.2, 0.6)
    add(new THREE.CapsuleGeometry(0.19, 0.7, 8, 18), s * 0.24, 1.18)
    add(new THREE.CapsuleGeometry(0.13, 0.7, 8, 16), s * 0.24, 0.48)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.36), skin)
    foot.position.set(s * 0.24, 0.05, 0.08)
    g.add(foot)
  }
  const navel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshStandardMaterial({ color: '#64748b' }))
  navel.position.set(0, 1.98, 0.29)
  g.add(navel)
  return g
}

export default function InjectionSiteMap() {
  const [s, set] = useToolState('injection-site-map', DEF)
  const [sel, setSel] = useState<string>('abd-lo-R')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const now = today()
  const last = lastUse(s.log)
  const used = usage(s.log, now, s.rest)
  const next = s.route === 'all' ? null : suggest(s.log, s.route)
  const cur = site(sel)
  const visible = SITES.filter((x) => s.route === 'all' || x.route === s.route)

  const ref = useStage3D(
    (st: Stage3D) => {
      st.scene.add(mannequin())
      const marks = new THREE.Group()
      marks.name = 'marks'
      st.scene.add(marks)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      let down: [number, number] | null = null
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const hit = ray.intersectObjects(marks.children, false).find((h) => h.object.userData.id)
        if (hit) setSel(hit.object.userData.id as string)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      st.onFrame((t) => {
        const m = marks.getObjectByName('sel')
        if (m) m.scale.setScalar(1 + 0.25 * Math.sin(t * 5))
      })
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st: Stage3D) => {
      const marks = st.scene.getObjectByName('marks')!
      st.clear(marks)
      for (const x of visible) {
        const rested = !used[x.id]
        const mat = new THREE.MeshStandardMaterial({ color: COL[x.route], emissive: COL[x.route], emissiveIntensity: x.id === sel ? 0.8 : 0.25, transparent: !rested, opacity: rested ? 1 : 0.4 })
        const m = new THREE.Mesh(new THREE.SphereGeometry(x.id === sel ? 0.075 : 0.055, 20, 14), mat)
        m.position.set(...x.pos)
        m.userData.id = x.id
        if (x.id === sel) m.name = 'sel'
        marks.add(m)
        if (next && x.id === next.id) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: '#10b981' }))
          ring.position.set(...x.pos)
          ring.lookAt(x.pos[0] * 3, x.pos[1], x.back ? -3 : 3)
          marks.add(ring)
        }
      }
      if (cur) {
        const l = label(cur.name, '#f8fafc', 0.16)
        l.position.set(cur.pos[0], cur.pos[1] + 0.2, cur.pos[2] + (cur.back ? -0.1 : 0.1))
        marks.add(l)
      }
    },
    [sel, s.route, s.log, s.rest],
    { camera: [1.3, 2.4, 3.7], target: [0, 1.9, 0], grid: false, background: '#1e293b' },
  )

  const add = () => {
    if (!cur) return
    set({ log: [...s.log, { id: uid(), date, time: new Date().toTimeString().slice(0, 5), site: cur.id, note: note.trim() }] })
    setNote('')
  }
  const sorted = [...s.log].sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? '')))
  const daysSince = cur && last[cur.id] ? daysBetween(last[cur.id], now) : null

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    w.document.write(`<!doctype html><title>Injection site chart</title><style>body{font:13px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 18px}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}.d{border:1px solid #c00;padding:8px;border-radius:6px}</style>
<h2>Injection site rotation chart${s.med ? ' — ' + esc(s.med) : ''}</h2><p class="d"><b>Reference only.</b> Follow your clinician's instructions for the medication, route, needle and technique.</p>
<h3>Sites</h3><table><tr><th>Site</th><th>Route</th><th>Landmarks</th><th>Last used</th></tr>${SITES.map((x) => `<tr><td>${x.name}${x.lessPreferred ? ' (less preferred)' : ''}</td><td>${x.route}</td><td>${x.landmark}</td><td>${last[x.id] ?? '—'}</td></tr>`).join('')}</table>
<h3>Log</h3><table><tr><th>Date</th><th>Time</th><th>Site</th><th>Notes</th></tr>${sorted.map((e) => `<tr><td>${e.date}</td><td>${e.time ?? ''}</td><td>${site(e.site)?.name ?? e.site}</td><td>${esc(e.note)}</td></tr>`).join('')}${'<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>'.repeat(8)}</table><script>print()</script>`)
    w.document.close()
  }

  return (
    <Split wide="right">
      <div>
        <Note tone="warn"><b>Reference only.</b> Follow your clinician's instructions for which sites, route, needle length and technique to use for your medication.</Note>
        <Panel title="Show sites">
          <Seg value={s.route} onChange={(route) => set({ route })} options={[['SC', 'Subcutaneous'], ['IM', 'Intramuscular'], ['all', 'All']]} />
          {next && (
            <Note tone="ok">Suggested next {s.route} site: <b>{next.name}</b>{last[next.id] ? ` (rested ${daysBetween(last[next.id], now)} days)` : ' (not used yet)'} <Btn onClick={() => setSel(next.id)}>Show</Btn></Note>
          )}
          <Row>
            {visible.map((x) => (
              <Btn key={x.id} kind={x.id === sel ? 'primary' : 'normal'} onClick={() => setSel(x.id)}>
                <span style={{ color: x.id === sel ? undefined : COL[x.route] }}>●</span> {x.name}
              </Btn>
            ))}
          </Row>
        </Panel>
        {cur && (
          <Panel title={cur.name}>
            <p style={{ margin: '0 0 8px' }}>
              <b style={{ color: COL[cur.route] }}>{cur.route === 'IM' ? 'Intramuscular' : 'Subcutaneous'}</b> · {cur.back ? 'back of body' : 'front / side of body'}
            </p>
            {cur.lessPreferred && <Note tone="err">Less preferred site: use only if your clinician tells you to.</Note>}
            <p style={{ margin: '0 0 10px', lineHeight: 1.5 }}>{cur.landmark}</p>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              Last used: <b>{last[cur.id] ?? 'never'}</b>{daysSince !== null ? ` · ${daysSince} day${daysSince === 1 ? '' : 's'} ago` : ''}
              {used[cur.id] ? ` · used ${used[cur.id]}× in the last ${s.rest} days` : ''}
            </p>
            <Row>
              <Txt label="Date" type="date" value={date} onChange={setDate} />
              <Txt label="Note" value={note} onChange={setNote} placeholder="e.g. dose, reaction" />
            </Row>
            <Btn kind="primary" onClick={add}>+ Log injection here</Btn>
          </Panel>
        )}
        <Panel title="Settings">
          <Txt label="Medication / label (for the printout)" value={s.med} onChange={(med) => set({ med })} placeholder="optional" />
          <Txt label="Rest period (days) — sites used within it are faded" type="number" value={String(s.rest)} onChange={(v) => set({ rest: Math.max(1, Math.min(60, Number(v) || 7)) })} />
          <p className="muted" style={{ fontSize: 13 }}>Within one site, move each new injection at least ~2.5 cm (1 in) from the last spot, and skip skin that is bruised, scarred, tender or hard.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Injections logged" value={s.log.length} />
          <Stat label="Last injection" value={sorted[0] ? (site(sorted[0].site)?.name ?? '—') : '—'} sub={sorted[0]?.date} />
          <Stat label="Sites rested" value={`${visible.filter((x) => !used[x.id]).length} / ${visible.length}`} sub={`not used in ${s.rest} days`} tone="good" />
        </Stats>
        <Panel title="Body map" actions={<Btn onClick={print}>🖨 Print chart</Btn>}>
          <View3D refEl={ref} height={480} />
          <div className="k-legend" style={{ marginTop: 6 }}>
            <span><i style={{ background: COL.SC }} />Subcutaneous</span>
            <span><i style={{ background: COL.IM }} />Intramuscular</span>
            <span><i style={{ background: '#10b981' }} />Suggested next</span>
            <span className="muted">Faded = used within {s.rest} days · drag to rotate, click a dot to select</span>
          </div>
        </Panel>
        <Panel title="Rotation log" actions={<><CsvButton name="injection-log.csv" rows={() => [['Date', 'Time', 'Site', 'Route', 'Note'], ...sorted.map((e) => [e.date, e.time ?? '', site(e.site)?.name ?? e.site, site(e.site)?.route ?? '', e.note])]} /><JsonButtons name="injection-log.json" data={s} onLoad={(d) => set(d)} /></>}>
          {sorted.length ? (
            <Table
              head={['Date', 'Site', 'Route', 'Note', '']}
              rows={sorted.map((e) => [`${e.date} ${e.time ?? ''}`, <a key="s" href="#" onClick={(ev) => { ev.preventDefault(); setSel(e.site) }}>{site(e.site)?.name ?? e.site}</a>, site(e.site)?.route ?? '', e.note, <Btn key="x" kind="ghost" onClick={() => set({ log: s.log.filter((x) => x.id !== e.id) })} title="Delete">✕</Btn>])}
              max={40}
            />
          ) : (
            <p className="muted">No injections logged yet.</p>
          )}
          <p className="muted" style={{ fontSize: 12.5 }}>The log stays in this browser. Use Backup to keep a copy.</p>
        </Panel>
      </div>
    </Split>
  )
}
