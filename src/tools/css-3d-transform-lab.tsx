import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CopyButton, Note, Panel, Row, Seg, Select, Slider, Split, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { compose, cssOf, facesAway, SPEC, toMatrix3d, toThree, withOrigin, type Fn, type M4, type TF } from './lib/css-3d-transform-lab'

const EW = 200, EH = 130 // element size, px
const SW = 360, SH = 260 // stage size, px
const K = 100 // px per three.js unit

interface State { list: TF[]; ox: number; oy: number; oz: number; persp: number; pox: number; poy: number; backface: 'visible' | 'hidden'; ghost: boolean }
const tf = (fn: Fn, ...v: number[]): TF => ({ id: uid(), fn, v })
const PRESETS: [string, Partial<State>][] = [
  ['Tilt card', { list: [tf('rotateX', 20), tf('rotateY', -30)], ox: 50, oy: 50, oz: 0, persp: 800 }],
  ['Card flip', { list: [tf('rotateY', 150)], ox: 50, oy: 50, oz: 0, persp: 900 }],
  ['Door (hinge left)', { list: [tf('rotateY', -65)], ox: 0, oy: 50, oz: 0, persp: 700 }],
  ['Fold down', { list: [tf('rotateX', 60)], ox: 50, oy: 0, oz: 0, persp: 600 }],
  ['Isometric', { list: [tf('rotateX', 54.7), tf('rotateZ', 45)], ox: 50, oy: 50, oz: 0, persp: 2000 }],
  ['Push back', { list: [tf('translateZ', -200), tf('rotateY', 25)], ox: 50, oy: 50, oz: 0, persp: 600 }],
]
const DEF: State = { list: PRESETS[0][1].list!, ox: 50, oy: 50, oz: 0, persp: 800, pox: 50, poy: 50, backface: 'visible', ghost: true }
const FNS = Object.keys(SPEC) as Fn[]

function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 260
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 400, 260)
  gr.addColorStop(0, '#6366f1')
  gr.addColorStop(1, '#ec4899')
  g.fillStyle = gr
  g.fillRect(0, 0, 400, 260)
  g.strokeStyle = 'rgba(255,255,255,.25)'
  for (let x = 0; x <= 400; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 260); g.stroke() }
  for (let y = 0; y <= 260; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(400, y); g.stroke() }
  g.fillStyle = '#fff'
  g.font = 'bold 64px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('FRONT', 200, 130)
  g.font = 'bold 26px system-ui, sans-serif'
  g.textAlign = 'left'
  g.fillText('↖ top-left', 12, 26)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default function Css3dTransformLab() {
  const [s, set, reset] = useToolState('css-3d-transform-lab', DEF)
  const [play, setPlay] = useState(0)
  const [addFn, setAddFn] = useState<Fn>('rotateZ')
  const camReq = useRef<{ pos: [number, number, number]; target: [number, number, number]; fov: number } | null>(null)
  const ox = (s.ox / 100 - 0.5) * EW, oy = (s.oy / 100 - 0.5) * EH
  const M: M4 = withOrigin(compose(s.list), ox, oy, s.oz)
  const css = s.list.length ? s.list.map(cssOf).join(' ') : 'none'
  const away = facesAway(M)
  const edit = (id: string, p: Partial<TF>) => set({ list: s.list.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const move = (i: number, d: number) => {
    const l = [...s.list]
    if (i + d < 0 || i + d >= l.length) return
    ;[l[i], l[i + d]] = [l[i + d], l[i]]
    set({ list: l })
  }

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
      const mat = new THREE.MeshStandardMaterial({ map: faceTexture(), side: THREE.DoubleSide, roughness: 0.6 })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(EW / K, EH / K), mat)
      mesh.name = 'el'
      mesh.matrixAutoUpdate = false
      root.add(mesh)
      const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(EW / K, EH / K)), new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 0.08, gapSize: 0.05 }))
      ghost.computeLineDistances()
      ghost.name = 'ghost'
      root.add(ghost)
      const origin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
      origin.name = 'origin'
      root.add(origin)
      const eye = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 16), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
      eye.name = 'eye'
      eye.rotation.x = -Math.PI / 2
      root.add(eye)
      const eyeLabel = label('eye (perspective)', '#22d3ee', 0.22)
      eyeLabel.name = 'eyeLabel'
      root.add(eyeLabel)
      const ax: [THREE.Vector3, number, string][] = [[new THREE.Vector3(1, 0, 0), 0xef4444, '+x'], [new THREE.Vector3(0, -1, 0), 0x22c55e, '+y (down)'], [new THREE.Vector3(0, 0, 1), 0x3b82f6, '+z (viewer)']]
      for (const [d, c, n] of ax) {
        root.add(new THREE.ArrowHelper(d, new THREE.Vector3(0, 0, 0), 1.4, c, 0.12, 0.07))
        const l = label(n, `#${c.toString(16).padStart(6, '0')}`, 0.2)
        l.position.copy(d.clone().multiplyScalar(1.6))
        root.add(l)
      }
      st.scene.children.filter((c) => c instanceof THREE.GridHelper).forEach((g) => (g.position.y = -1.6))
      st.onFrame(() => {
        const r = camReq.current
        if (!r) return
        camReq.current = null
        st.camera.position.set(...r.pos)
        st.controls.target.set(...r.target)
        st.camera.fov = r.fov
        st.camera.updateProjectionMatrix()
      })
    },
    (st) => {
      const root = st.scene.getObjectByName('root')!
      const mesh = root.getObjectByName('el') as THREE.Mesh
      const t = toThree(M, K)
      mesh.matrix.set(...(t as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]))
      mesh.matrixWorldNeedsUpdate = true
      ;(mesh.material as THREE.MeshStandardMaterial).side = s.backface === 'visible' ? THREE.DoubleSide : THREE.FrontSide
      ;(mesh.material as THREE.MeshStandardMaterial).needsUpdate = true
      root.getObjectByName('ghost')!.visible = s.ghost
      root.getObjectByName('origin')!.position.set(ox / K, -oy / K, s.oz / K)
      const ex = ((s.pox / 100 - 0.5) * SW) / K, ey = -((s.poy / 100 - 0.5) * SH) / K, ez = s.persp / K
      root.getObjectByName('eye')!.position.set(ex, ey, Math.min(ez, 12))
      root.getObjectByName('eyeLabel')!.position.set(ex, ey + 0.35, Math.min(ez, 12))
    },
    [M.join(','), s.backface, s.ghost, ox, oy, s.oz, s.persp, s.pox, s.poy],
    { camera: [1.7, 1.1, 3.4], target: [0, 0, 0], background: '#0f172a' },
  )
  // CSS eye: perspective distance in front of the element plane, at perspective-origin; vertical FOV covers the stage.
  const matchView = () => {
    const ex = ((s.pox / 100 - 0.5) * SW) / K, ey = -((s.poy / 100 - 0.5) * SH) / K
    camReq.current = { pos: [ex, ey, s.persp / K], target: [ex, ey, 0], fov: (2 * Math.atan(SH / 2 / s.persp) * 180) / Math.PI }
  }
  const freeView = () => (camReq.current = { pos: [1.7, 1.1, 3.4], target: [0, 0, 0], fov: 50 })

  const cssText = `.scene {\n  perspective: ${s.persp}px;\n  perspective-origin: ${s.pox}% ${s.poy}%;\n}\n.card {\n  transform: ${css};\n  transform-origin: ${s.ox}% ${s.oy}%${s.oz ? ` ${s.oz}px` : ''};\n  backface-visibility: ${s.backface};\n}\n/* the same transform as one matrix (origin applied by the browser) */\n.card-matrix { transform: ${toMatrix3d(compose(s.list))}; }`

  return (
    <Split wide="right">
      <div>
        <Panel title="Transform functions" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set({ ...p, list: p.list!.map((t) => ({ ...t, id: uid() })) })}>{n}</Btn>)}</Row>
          {s.list.map((t, i) => (
            <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '6px 10px', margin: '8px 0' }}>
              <Row wrap={false}>
                <b style={{ width: 18 }}>{i + 1}</b>
                <select value={t.fn} aria-label="Function" onChange={(e) => { const fn = e.target.value as Fn; edit(t.id, { fn, v: SPEC[fn].args.map((a) => a[4]) }) }} style={{ flex: 1 }}>
                  {FNS.map((f) => <option key={f}>{f}</option>)}
                </select>
                <Btn kind="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Earlier">↑</Btn>
                <Btn kind="ghost" onClick={() => move(i, 1)} disabled={i === s.list.length - 1} title="Later">↓</Btn>
                <Btn kind="ghost" onClick={() => set({ list: s.list.filter((x) => x.id !== t.id) })} title="Remove">✕</Btn>
              </Row>
              {SPEC[t.fn].args.map(([n, unit, lo, hi], k) => (
                <Slider key={n} label={n} value={t.v[k] ?? 0} onChange={(x) => edit(t.id, { v: t.v.map((y, j) => (j === k ? x : y)) })} min={lo} max={hi} step={unit === 'deg' ? 1 : unit === 'px' ? 1 : 0.05} unit={unit === 'deg' ? '°' : unit ? ` ${unit}` : ''} />
              ))}
            </div>
          ))}
          <Row>
            <Select label="Add function" value={addFn} onChange={setAddFn} options={FNS} />
            <Btn kind="primary" onClick={() => set({ list: [...s.list, { id: uid(), fn: addFn, v: SPEC[addFn].args.map((a) => a[4]) }] })}>+ Add</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Order matters: CSS applies the list right-to-left to the element (the last function acts first, in the element’s own axes). Try swapping a rotate and a translate.</p>
        </Panel>
        <Panel title="Origin, perspective, faces">
          <Row>
            <Slider label="transform-origin x" value={s.ox} onChange={(v) => set({ ox: v })} min={0} max={100} unit="%" />
            <Slider label="y" value={s.oy} onChange={(v) => set({ oy: v })} min={0} max={100} unit="%" />
          </Row>
          <Slider label="transform-origin z" value={s.oz} onChange={(oz) => set({ oz })} min={-200} max={200} unit=" px" />
          <Slider label="perspective (on parent)" value={s.persp} onChange={(persp) => set({ persp })} min={100} max={2500} step={10} unit=" px" />
          <Row>
            <Slider label="perspective-origin x" value={s.pox} onChange={(v) => set({ pox: v })} min={-50} max={150} unit="%" />
            <Slider label="y" value={s.poy} onChange={(v) => set({ poy: v })} min={-50} max={150} unit="%" />
          </Row>
          <p className="k-label" style={{ margin: '6px 0 4px' }}>backface-visibility</p>
          <Seg value={s.backface} onChange={(backface) => set({ backface })} options={[['visible', 'visible'], ['hidden', 'hidden']]} />
          <Check label="Show untransformed outline in 3D" value={s.ghost} onChange={(ghost) => set({ ghost })} />
          {away && <Note tone={s.backface === 'hidden' ? 'warn' : 'info'}>The element is turned away from the viewer{s.backface === 'hidden' ? ', so backface-visibility: hidden makes it disappear.' : '; you see its mirrored back side.'}</Note>}
        </Panel>
      </div>
      <div>
        <Split>
          <Panel title="Live CSS" actions={<Btn onClick={() => setPlay((p) => p + 1)}>▶ Play transition</Btn>}>
            <div style={{ width: '100%', maxWidth: SW, height: SH, margin: '0 auto', position: 'relative', perspective: `${s.persp}px`, perspectiveOrigin: `${s.pox}% ${s.poy}%`, background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0 / 20px 20px', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: `calc(50% - ${EW / 2}px)`, top: (SH - EH) / 2, width: EW, height: EH, border: '1px dashed #94a3b8', borderRadius: 10, display: s.ghost ? 'block' : 'none' }} />
              <PlayBox key={play} css={css} origin={`${s.ox}% ${s.oy}%${s.oz ? ` ${s.oz}px` : ''}`} backface={s.backface} animate={play > 0} />
              <span style={{ position: 'absolute', left: `${s.pox}%`, top: `${s.poy}%`, width: 8, height: 8, margin: -4, borderRadius: 4, background: '#22d3ee' }} title="perspective-origin" />
            </div>
          </Panel>
          <Panel title="three.js mirror">
            <View3D refEl={ref} height={SH} />
            <Row><Btn onClick={matchView}>👁 Match CSS camera</Btn><Btn kind="ghost" onClick={freeView}>Orbit view</Btn></Row>
          </Panel>
        </Split>
        <Panel title="Generated CSS" actions={<CopyButton text={cssText} />}>
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>{cssText}</pre>
        </Panel>
        <Panel title="Effective matrix (with transform-origin, CSS px, y down)">
          <Table head={['', 'c1', 'c2', 'c3', 'c4']} rows={[0, 1, 2, 3].map((r) => [`r${r + 1}`, ...[0, 1, 2, 3].map((c) => M[r * 4 + c].toFixed(4))])} />
          <p className="muted" style={{ fontSize: 13 }}>The yellow dot in 3D is the transform-origin, the cyan cone is the CSS eye (perspective distance from the element plane, positioned at perspective-origin). The 3D view mirrors the same matrix with y flipped (three.js is y-up).</p>
        </Panel>
      </div>
    </Split>
  )
}

/** Element with an optional "from none" transition on mount. */
function PlayBox({ css, origin, backface, animate }: { css: string; origin: string; backface: 'visible' | 'hidden'; animate: boolean }) {
  const [on, setOn] = useState(!animate)
  useEffect(() => {
    if (on) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)))
    return () => cancelAnimationFrame(id)
  }, [on])
  return (
    <div style={{ position: 'absolute', left: `calc(50% - ${EW / 2}px)`, top: (SH - EH) / 2, width: EW, height: EH, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 30, transform: on ? css : 'none', transformOrigin: origin, backfaceVisibility: backface, transition: animate ? 'transform 1.1s cubic-bezier(.2,.8,.2,1)' : undefined, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
      FRONT
      <span style={{ position: 'absolute', left: 8, top: 4, fontSize: 13 }}>↖ top-left</span>
    </div>
  )
}
