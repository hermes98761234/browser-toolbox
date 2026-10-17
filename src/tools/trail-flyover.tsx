import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, FileDrop, LineChart, Note, Panel, Seg, Slider, Split, Stat, Stats, Check, num, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { demoTrack, parseGpx, trackStats, type Track } from './lib/gpx-track-viewer'
import { along, bbox, cumDist, decodeTerrarium, gridAt, gridFrom, type Grid, projector, syntheticGrid, tileCover } from './lib/trail-flyover'

type Cam = 'chase' | 'orbit' | 'top'
const DEF = { exag: 1.5, seconds: 40, cam: 'chase' as Cam, source: 'tiles' as 'tiles' | 'synthetic', snap: true }
const N = 128

async function loadTiles(t: Track): Promise<Grid> {
  const b = bbox(t.points)
  const c = tileCover(b, 16, 14)
  const W = (c.x1 - c.x0 + 1) * 256, H = (c.y1 - c.y0 + 1) * 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  const jobs: Promise<void>[] = []
  for (let x = c.x0; x <= c.x1; x++)
    for (let y = c.y0; y <= c.y1; y++)
      jobs.push(
        new Promise((res, rej) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            ctx.drawImage(img, (x - c.x0) * 256, (y - c.y0) * 256)
            res()
          }
          img.onerror = () => rej(new Error('tile failed'))
          img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${c.z}/${x}/${y}.png`
        }),
      )
  await Promise.race([Promise.all(jobs), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))])
  const px = ctx.getImageData(0, 0, W, H).data
  const at = (x: number, y: number) => {
    const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4
    return decodeTerrarium(px[i], px[i + 1], px[i + 2])
  }
  const { lon2x, lat2y } = await import('./lib/gpx-track-viewer')
  return gridFrom(b, N, (lat, lon) => {
    const fx = lon2x(lon, c.z) - c.x0 * 256, fy = lat2y(lat, c.z) - c.y0 * 256
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty
  })
}

// colour bands applied to elevation rescaled to 0…3300 so every region gets valleys → peaks
const BANDS: [number, string][] = [[0, '#3f7d4e'], [600, '#6aa85a'], [1200, '#a7b86a'], [1800, '#9c8559'], [2400, '#8b8680'], [3000, '#d6d6d6'], [3600, '#ffffff']]
function hypso(e: number, c: THREE.Color) {
  let i = 0
  while (i < BANDS.length - 2 && e > BANDS[i + 1][0]) i++
  const [e0, c0] = BANDS[i], [e1, c1] = BANDS[i + 1]
  c.set(c0).lerp(new THREE.Color(c1), Math.min(1, Math.max(0, (e - e0) / (e1 - e0))))
}

export default function TrailFlyover() {
  const [s, set] = useToolState('trail-flyover', DEF)
  const [track, setTrack] = useState<Track>(() => demoTrack())
  const [grid, setGrid] = useState<Grid | null>(null)
  const [status, setStatus] = useState('Loading elevation tiles…')
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(true)
  const [recording, setRecording] = useState(false)
  const [ui, setUi] = useState(0)
  const prog = useRef(0)
  const live = useRef({ playing: true, seconds: s.seconds, cam: s.cam, recording: false })
  const rec = useRef<MediaRecorder | null>(null)
  const stage = useRef<Stage3D | null>(null)
  const terrainG = useRef(new THREE.Group())
  const marker = useRef(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#facc15' })))
  const pathRef = useRef<{ pts: number[][]; cd: number[]; size: number; ground: (x: number, z: number) => number }>({ pts: [[0, 0, 0]], cd: [0], size: 100, ground: () => 0 })

  useEffect(() => {
    live.current = { ...live.current, playing, seconds: s.seconds, cam: s.cam, recording }
  }, [playing, s.seconds, s.cam, recording])

  useEffect(() => {
    let off = false
    const go = async () => {
      if (s.source === 'synthetic') {
        setStatus('Synthetic terrain built from the track elevations (offline).')
        setGrid(syntheticGrid(track.points, bbox(track.points)))
        return
      }
      setStatus('Loading elevation tiles…')
      try {
        const g = await loadTiles(track)
        if (off) return
        setGrid(g)
        setStatus('Terrain: AWS Terrain Tiles (Terrarium, SRTM/ASTER based).')
      } catch {
        if (off) return
        setGrid(syntheticGrid(track.points, bbox(track.points)))
        setStatus('Elevation tiles unavailable (offline?) — showing synthetic terrain from the track.')
      }
    }
    void go()
    return () => {
      off = true
    }
  }, [track, s.source])

  const profile = useMemo(() => {
    const cd = cumDist(track.points)
    return track.points.map((p, i) => [cd[i] / 1000, grid && (s.snap || p.ele === undefined) ? gridAt(grid, p.lat, p.lon) : (p.ele ?? 0)] as [number, number])
  }, [track, grid, s.snap])
  // stats use the same elevations as the profile (draped or GPS)
  const st = useMemo(() => trackStats(track.points.map((p, i) => ({ ...p, ele: profile[i][1] }))), [track, profile])
  const total = profile.length ? profile[profile.length - 1][0] : 0

  const ref = useStage3D(
    (sg) => {
      stage.current = sg
      sg.scene.add(terrainG.current, marker.current)
      sg.scene.background = new THREE.Color('#bcd4ea')
      sg.scene.fog = new THREE.Fog('#bcd4ea', 90, 280)
      sg.camera.far = 2000
      sg.camera.updateProjectionMatrix()
      const cam = new THREE.Vector3(), tgt = new THREE.Vector3()
      let orbitA = 0
      sg.onFrame((_t, dt) => {
        const L = live.current
        const P = pathRef.current
        const len = P.cd[P.cd.length - 1] || 1
        if (L.playing) prog.current = Math.min(1, prog.current + dt / Math.max(5, L.seconds))
        const sNow = prog.current * len
        const p = along(P.pts, P.cd, sNow)
        const ahead = along(P.pts, P.cd, sNow + len * 0.03)
        const behind = along(P.pts, P.cd, sNow - len * 0.01)
        marker.current.position.set(p[0], p[1] + 0.6, p[2])
        marker.current.scale.setScalar(P.size / 160)
        sg.controls.enabled = !L.playing
        if (L.playing) {
          const f = new THREE.Vector3(ahead[0] - behind[0], 0, ahead[2] - behind[2]).normalize()
          const k = P.size / 100
          if (L.cam === 'chase') {
            cam.set(p[0] - f.x * 20 * k, p[1] + 13 * k, p[2] - f.z * 20 * k)
            tgt.set(ahead[0], ahead[1], ahead[2])
          } else if (L.cam === 'orbit') {
            orbitA += dt * 0.25
            cam.set(Math.cos(orbitA) * 70 * k, 45 * k + p[1], Math.sin(orbitA) * 70 * k)
            tgt.set(p[0], p[1], p[2])
          } else {
            cam.set(p[0], p[1] + 60 * k, p[2] + 25 * k)
            tgt.set(p[0], p[1], p[2])
          }
          cam.y = Math.max(cam.y, P.ground(cam.x, cam.z) + 4 * k) // never fly into a ridge
          const a = 1 - Math.exp(-dt * 2.5)
          sg.camera.position.lerp(cam, a)
          sg.controls.target.lerp(tgt, a)
        }
        if (prog.current >= 1 && L.playing) {
          live.current.playing = false
          setPlaying(false)
          if (rec.current && rec.current.state === 'recording') rec.current.stop()
        }
      })
      const id = setInterval(() => setUi(prog.current), 200)
      return () => clearInterval(id)
    },
    (sg) => {
      const g = terrainG.current
      sg.clear(g)
      if (!grid) return
      const proj = projector(grid.b)
      const [x0, z0] = proj(grid.b.maxLat, grid.b.minLon)
      const [x1, z1] = proj(grid.b.minLat, grid.b.maxLon)
      const wM = x1 - x0, hM = z1 - z0
      const S = 100 / Math.max(wM, hM)
      const yOf = (e: number) => (e - grid.min) * S * s.exag
      const geo = new THREE.PlaneGeometry(wM * S, hM * S, N - 1, N - 1)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position as THREE.BufferAttribute
      const cols = new Float32Array(pos.count * 3)
      const c = new THREE.Color()
      for (let k = 0; k < pos.count; k++) {
        const e = grid.ele[k]
        pos.setY(k, yOf(e))
        hypso(((e - grid.min) / Math.max(1, grid.max - grid.min)) * 3300, c)
        cols.set([c.r, c.g, c.b], k * 3)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })))
      // track
      const pts = track.points.map((p, i) => {
        const [x, z] = proj(p.lat, p.lon)
        return [x * S, yOf(profile[i]?.[1] ?? 0) + 0.25, z * S]
      })
      const cd = [0]
      for (let i = 1; i < pts.length; i++) cd.push(cd[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]))
      const lat0 = (grid.b.minLat + grid.b.maxLat) / 2, lon0 = (grid.b.minLon + grid.b.maxLon) / 2
      const kx = Math.cos((lat0 * Math.PI) / 180)
      pathRef.current = { pts, cd, size: 100, ground: (x, z) => yOf(gridAt(grid, lat0 - z / S / 110540, lon0 + x / S / (111320 * kx))) }
      const step = Math.max(1, Math.floor(pts.length / 800))
      const curve = new THREE.CatmullRomCurve3(pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => new THREE.Vector3(p[0], p[1], p[2])))
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(2000, pts.length * 2), 0.28, 6, false), new THREE.MeshBasicMaterial({ color: '#e11d48' })))
    },
    [grid, s.exag, track, profile],
    { camera: [0, 70, 110], grid: false },
  )

  const startRecording = () => {
    const cv = stage.current?.renderer.domElement
    if (!cv || typeof MediaRecorder === 'undefined' || !cv.captureStream) {
      setErr('Video recording (MediaRecorder) is not supported in this browser.')
      return
    }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const chunks: Blob[] = []
    const r = new MediaRecorder(cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    r.onstop = () => {
      setRecording(false)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      a.download = `${track.name.replace(/[^\w-]+/g, '_')}-flyover.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
    rec.current = r
    prog.current = 0
    r.start(500)
    setRecording(true)
    setPlaying(true)
  }

  const onFile = async (f: File) => {
    setErr('')
    try {
      const { tracks } = parseGpx(await f.text())
      const t = tracks.find((x) => x.points.length > 1)
      if (!t) throw new Error('No track with at least two points found.')
      setTrack(t)
      prog.current = 0
      setPlaying(true)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const here = Math.min(total, ui * total)
  const fmtDur = (sec: number) => `${Math.floor(sec / 3600)}h ${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}m`

  return (
    <div>
      <Panel
        title={track.name}
        actions={
          <>
            <Btn kind="primary" onClick={() => { if (prog.current >= 1) prog.current = 0; setPlaying(!playing) }} disabled={recording}>{playing ? '❚❚ Pause' : '▶ Fly'}</Btn>
            <Btn onClick={() => { prog.current = 0; setUi(0) }} disabled={recording}>⏮ Restart</Btn>
            <Btn onClick={startRecording} disabled={recording || !grid}>{recording ? '● Recording…' : '⏺ Record WebM'}</Btn>
          </>
        }
      >
        <View3D refEl={ref} height={480} />
        <input type="range" min={0} max={1} step={0.001} value={ui} aria-label="Position along the trail" style={{ width: '100%', marginTop: 8 }} onChange={(e) => { prog.current = Number(e.target.value); setUi(prog.current); setPlaying(false) }} />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{status} {!playing && 'Paused: drag to orbit, scroll to zoom.'}</p>
      </Panel>
      {err && <Note tone="err">{err}</Note>}
      <Stats>
        <Stat label="Distance" value={`${num(st.distance / 1000, 2)} km`} sub={`at ${num(here, 2)} km`} tone="accent" />
        <Stat label="Elevation gain" value={`${num(st.gain, 0)} m`} sub={`loss ${num(st.loss, 0)} m`} />
        <Stat label="Highest point" value={`${num(Math.max(...profile.map((p) => p[1])), 0)} m`} sub={`lowest ${num(Math.min(...profile.map((p) => p[1])), 0)} m`} />
        <Stat label="Duration" value={st.hasTime ? fmtDur(st.duration) : '—'} sub={st.hasTime ? `moving ${fmtDur(st.moving)}` : 'no timestamps'} />
      </Stats>
      <Split>
        <div>
          <Panel title="Your track">
            <FileDrop accept=".gpx,application/gpx+xml" onFiles={(fs) => void onFile(fs[0])} label="Drop a GPX file or click to choose" />
            <Btn kind="ghost" onClick={() => { setTrack(demoTrack()); prog.current = 0 }}>Load demo (Zermatt loop)</Btn>
            <p className="muted" style={{ fontSize: 13 }}>The GPX file is read locally. Only elevation tiles for the track's area are downloaded.</p>
          </Panel>
          <Panel title="Flight settings">
            <div className="k-label" style={{ marginBottom: 6 }}>Camera</div>
            <Seg value={s.cam} onChange={(cam) => set({ cam })} options={[['chase', 'Chase'], ['orbit', 'Orbit'], ['top', 'Top-down']]} />
            <Slider label="Flight duration" value={s.seconds} min={10} max={180} step={5} unit=" s" onChange={(seconds) => set({ seconds })} />
            <Slider label="Vertical exaggeration" value={s.exag} min={1} max={4} step={0.1} unit="×" onChange={(exag) => set({ exag })} />
            <div className="k-label" style={{ margin: '8px 0 6px' }}>Terrain</div>
            <Seg value={s.source} onChange={(source) => set({ source })} options={[['tiles', 'Real elevation tiles'], ['synthetic', 'Synthetic (offline)']]} />
            <Check label="Drape track on terrain (ignore GPS elevation)" value={s.snap} onChange={(snap) => set({ snap })} />
          </Panel>
        </div>
        <div>
          <Panel title="Elevation profile">
            <LineChart series={[{ name: 'Elevation', points: profile, area: true, color: '#e11d48' }]} xLabel="km" fx={(v) => num(v, 1)} fy={(v) => `${num(v, 0)} m`} yMin={Math.floor(Math.min(...profile.map((p) => p[1])) / 100) * 100} markers={[{ x: here, label: '▼' }]} height={220} />
          </Panel>
          <Note>Recording plays the whole flight from the start and saves a WebM video when it ends. Keep this tab visible while recording; background tabs throttle rendering.</Note>
        </div>
      </Split>
    </div>
  )
}
