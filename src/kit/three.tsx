// Three.js stage for 3D tools: renderer + camera + orbit controls + lights + resize + render loop.
// Only tools that import this file pull three.js into their chunk.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export { THREE }

export interface Stage3D {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  /** Called every frame with elapsed seconds. */
  onFrame: (fn: (t: number, dt: number) => void) => void
  /** Removes and disposes every child of `group`. */
  clear: (group: THREE.Object3D) => void
}

function dispose(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}

/**
 * Mounts a 3D view into the returned ref. `setup` runs once and may return a cleanup.
 * `deps` re-run `update` (e.g. rebuild meshes from inputs) without recreating the renderer.
 */
export function useStage3D(
  setup: (s: Stage3D) => void | (() => void),
  update?: (s: Stage3D) => void,
  deps: unknown[] = [],
  opts: { camera?: [number, number, number]; target?: [number, number, number]; background?: string; grid?: boolean } = {},
) {
  const ref = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage3D | null>(null)
  const updateRef = useRef(update)
  updateRef.current = update

  useEffect(() => {
    const host = ref.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    } catch {
      host.textContent = 'WebGL is not available in this browser.'
      return
    }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(opts.background ?? '#0f172a')
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000)
    camera.position.set(...(opts.camera ?? [6, 5, 8]))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(...(opts.target ?? [0, 0, 0]))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 10, 7)
    scene.add(sun)
    if (opts.grid !== false) {
      const g = new THREE.GridHelper(20, 20, 0x475569, 0x1e293b)
      scene.add(g)
    }
    const frames: ((t: number, dt: number) => void)[] = []
    const s: Stage3D = {
      scene, camera, renderer, controls,
      onFrame: (fn) => frames.push(fn),
      clear: (group) => {
        for (const c of [...group.children]) {
          group.remove(c)
          dispose(c)
        }
      },
    }
    stage.current = s
    const resize = () => {
      const w = host.clientWidth || 600
      const h = host.clientHeight || 400
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()
    const cleanup = setup(s)
    updateRef.current?.(s)
    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta())
      const t = clock.elapsedTime
      for (const f of frames) f(t, dt)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cleanup?.()
      controls.dispose()
      dispose(scene)
      renderer.dispose()
      renderer.domElement.remove()
      stage.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (stage.current) updateRef.current?.(stage.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

/** Simple sprite label for 3D scenes. */
export function label(text: string, color = '#e2e8f0', size = 0.5): THREE.Sprite {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 40px system-ui, sans-serif'
  c.width = Math.ceil(ctx.measureText(text).width) + 16
  c.height = 56
  ctx.font = 'bold 40px system-ui, sans-serif'
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 8, 28)
  const tex = new THREE.CanvasTexture(c)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
  sp.scale.set((size * c.width) / c.height, size, 1)
  return sp
}

export function View3D({ refEl, height = 420 }: { refEl: React.RefObject<HTMLDivElement | null>; height?: number }) {
  return <div ref={refEl} className="k-3d" style={{ height }} />
}
