import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { align, gainFor, mean, schedule, toGray } from './lib/plant-growth-timelapse'

interface Frame { id: string; name: string; src: HTMLCanvasElement; w: number; h: number; time: number; thumb: string; dx: number; dy: number; rot: number; scale: number; gain: number }
type LabelMode = 'none' | 'frame' | 'day' | 'date' | 'name'

const DEF = { fps: 12, hold: 2, fade: 2, endHold: 12, height: 720, onion: 0.5, onionMode: 'over' as 'over' | 'diff', grid: true, normalize: true, label: 'day' as LabelMode, startDay: 0, daysPer: 2, maxShift: 8, bitrate: 6, crop: 1 }

let seq = 0
const mkId = () => `f${++seq}`

function thumbOf(c: HTMLCanvasElement) {
  const t = document.createElement('canvas')
  t.width = 96
  t.height = Math.round((96 * c.height) / c.width)
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height)
  return t.toDataURL('image/jpeg', 0.7)
}
const frameOf = (name: string, src: HTMLCanvasElement, time: number): Frame => ({ id: mkId(), name, src, w: src.width, h: src.height, time, thumb: thumbOf(src), dx: 0, dy: 0, rot: 0, scale: 1, gain: 1 })

/** Synthetic demo: a seedling photographed on 20 days with a wobbly tripod and changing light. */
function demoFrames(n = 20): Frame[] {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, (_, i) => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const x = c.getContext('2d')!
    const g = i / (n - 1)
    x.save()
    x.translate(Math.round((r() - 0.5) * 34), Math.round((r() - 0.5) * 26))
    x.rotate((r() - 0.5) * 0.02)
    const wall = x.createLinearGradient(0, 0, 640, 0)
    wall.addColorStop(0, '#f5f5f4')
    wall.addColorStop(1, '#d6d3d1')
    x.fillStyle = wall
    x.fillRect(-60, -60, 760, 470)
    x.fillStyle = '#bae6fd'
    x.fillRect(30, 40, 150, 200)
    x.strokeStyle = '#a8a29e'
    x.lineWidth = 8
    x.strokeRect(30, 40, 150, 200)
    x.beginPath(); x.moveTo(105, 40); x.lineTo(105, 240); x.moveTo(30, 140); x.lineTo(180, 140); x.stroke()
    x.fillStyle = '#92400e'
    x.fillRect(-60, 400, 760, 140)
    x.fillStyle = '#78350f'
    for (let k = 0; k < 8; k++) x.fillRect(-60 + k * 100, 400, 3, 140)
    // ruler for scale
    x.fillStyle = '#fef9c3'
    x.fillRect(470, 150, 26, 252)
    x.fillStyle = '#44403c'
    x.font = '10px sans-serif'
    for (let k = 0; k <= 24; k++) x.fillRect(470, 400 - k * 10, k % 5 ? 7 : 13, 1.5)
    for (let k = 0; k <= 4; k++) x.fillText(String(k * 5), 482, 398 - k * 50)
    // pot
    x.fillStyle = '#c2410c'
    x.beginPath(); x.moveTo(250, 330); x.lineTo(390, 330); x.lineTo(372, 405); x.lineTo(268, 405); x.closePath(); x.fill()
    x.fillStyle = '#9a3412'
    x.fillRect(244, 322, 152, 18)
    x.fillStyle = '#3f2a1d'
    x.beginPath(); x.ellipse(320, 324, 70, 8, 0, 0, Math.PI * 2); x.fill()
    // plant
    const ease = 1 - (1 - g) ** 1.6
    const height = 12 + 215 * ease
    const sway = Math.sin(i * 1.3) * 6 * g
    const top: [number, number] = [320 + sway, 322 - height]
    x.strokeStyle = '#4d7c0f'
    x.lineWidth = 3 + 4 * g
    x.lineCap = 'round'
    x.beginPath(); x.moveTo(320, 324); x.quadraticCurveTo(316, 322 - height / 2, top[0], top[1]); x.stroke()
    const nodes = 1 + Math.floor(g * 7)
    for (let k = 0; k < nodes; k++) {
      const t = (k + 1) / (nodes + 0.6)
      const ny = 322 - height * t, nx = 320 + sway * t * t - 2 * t
      const age = Math.max(0.25, (g * 7 - k + 1) / 3)
      const size = Math.min(1, age) * (34 - k * 2.2)
      for (const side of [-1, 1]) {
        x.save()
        x.translate(nx, ny)
        x.rotate(side * (0.9 - 0.25 * Math.min(1, age)) + (k % 2 ? 0.15 : -0.15))
        x.fillStyle = k % 2 ? '#65a30d' : '#4d7c0f'
        x.beginPath(); x.ellipse(0, -size * 0.55, size * 0.32, size * 0.6, 0, 0, Math.PI * 2); x.fill()
        x.strokeStyle = '#365314'; x.lineWidth = 1
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -size * 1.05); x.stroke()
        x.restore()
      }
    }
    if (g > 0.75) {
      const open = Math.min(1, (g - 0.75) / 0.2)
      x.fillStyle = '#facc15'
      for (let p = 0; p < 6; p++) {
        x.beginPath(); x.ellipse(top[0] + Math.cos((p * Math.PI) / 3) * 9 * open, top[1] - 6 + Math.sin((p * Math.PI) / 3) * 9 * open, 4 + 5 * open, 3 + 3 * open, (p * Math.PI) / 3, 0, Math.PI * 2); x.fill()
      }
      x.fillStyle = '#92400e'
      x.beginPath(); x.arc(top[0], top[1] - 6, 5, 0, Math.PI * 2); x.fill()
    }
    x.restore()
    const light = 0.75 + r() * 0.45
    x.fillStyle = light < 1 ? `rgba(0,0,0,${(1 - light).toFixed(3)})` : `rgba(255,250,235,${(light - 1).toFixed(3)})`
    x.fillRect(0, 0, 640, 480)
    return frameOf(`plant_day${String(i * 2).padStart(2, '0')}.png`, c, Date.UTC(2026, 4, 1) + i * 2 * 86400000)
  })
}

async function loadFile(f: File): Promise<Frame | null> {
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return frameOf(f.name, c, f.lastModified)
  } catch {
    return null
  }
}

/** Zoom that keeps black borders out of view after alignment. */
const autoCrop = (frames: Frame[]) => Math.min(1.4, Math.ceil((1 + 2 * Math.max(0, ...frames.map((fr) => Math.max(Math.abs(fr.dx) / fr.w, Math.abs(fr.dy) / fr.h) + Math.abs(fr.rot) * 0.012 + Math.abs(fr.scale - 1)))) * 100) / 100)

function drawFrame(x: CanvasRenderingContext2D, f: Frame, W: number, H: number, gain: boolean, alpha = 1, crop = 1) {
  const k = Math.max(W / f.w, H / f.h) * crop
  x.save()
  x.globalAlpha = alpha
  x.translate(W / 2 + f.dx * k, H / 2 + f.dy * k)
  x.rotate((f.rot * Math.PI) / 180)
  x.scale(k * f.scale, k * f.scale)
  if (gain && Math.abs(f.gain - 1) > 0.005) x.filter = `brightness(${f.gain.toFixed(3)})`
  x.drawImage(f.src, -f.w / 2, -f.h / 2)
  x.restore()
}

export default function PlantGrowthTimelapse() {
  const [s, set, reset] = useToolState('plant-growth-timelapse', DEF)
  const [frames, setFrames] = useState<Frame[]>(() => demoFrames())
  const [cur, setCur] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [video, setVideo] = useState<{ url: string; size: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const f = frames[Math.min(cur, frames.length - 1)]
  const aspect = frames.length ? frames[0].w / frames[0].h : 4 / 3
  const H = s.height, W = Math.round((H * aspect) / 2) * 2
  const steps = useMemo(() => schedule(frames.length, s.hold, s.fade, s.endHold), [frames.length, s.hold, s.fade, s.endHold])
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

  const labelText = (i: number) => {
    const fr = frames[i]
    if (!fr) return ''
    if (s.label === 'frame') return `${i + 1} / ${frames.length}`
    if (s.label === 'day') return `Day ${s.startDay + i * s.daysPer}`
    if (s.label === 'date') return new Date(fr.time).toISOString().slice(0, 10)
    if (s.label === 'name') return fr.name
    return ''
  }
  const drawLabel = (x: CanvasRenderingContext2D, i: number) => {
    const t = labelText(i)
    if (!t) return
    const fs = Math.round(H / 18)
    x.font = `600 ${fs}px system-ui, sans-serif`
    const tw = x.measureText(t).width
    x.fillStyle = 'rgba(0,0,0,.55)'
    x.fillRect(fs * 0.6, H - fs * 2.2, tw + fs, fs * 1.6)
    x.fillStyle = '#fff'
    x.fillText(t, fs * 1.1, H - fs * 0.95)
  }
  const renderStep = (x: CanvasRenderingContext2D, st: { a: number; b: number; t: number }) => {
    x.fillStyle = '#000'
    x.fillRect(0, 0, W, H)
    drawFrame(x, frames[st.a], W, H, s.normalize, 1, s.crop)
    if (st.t > 0) drawFrame(x, frames[st.b], W, H, s.normalize, st.t, s.crop)
    drawLabel(x, st.t > 0.5 ? st.b : st.a)
  }

  // Editor / preview drawing
  useEffect(() => {
    const c = canvas.current
    if (!c || !frames.length || playing) return
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    x.fillStyle = '#000'
    x.fillRect(0, 0, W, H)
    drawFrame(x, f, W, H, s.normalize, 1, s.crop)
    const prev = frames[cur - 1]
    if (prev && s.onion > 0) {
      x.save()
      if (s.onionMode === 'diff') x.globalCompositeOperation = 'difference'
      drawFrame(x, prev, W, H, s.normalize, s.onionMode === 'diff' ? 1 : s.onion, s.crop)
      x.restore()
    }
    if (s.grid) {
      x.strokeStyle = 'rgba(255,255,255,.55)'
      x.lineWidth = Math.max(1, H / 480)
      x.beginPath()
      for (const k of [1, 2]) {
        x.moveTo((W * k) / 3, 0); x.lineTo((W * k) / 3, H)
        x.moveTo(0, (H * k) / 3); x.lineTo(W, (H * k) / 3)
      }
      x.stroke()
    }
    drawLabel(x, cur)
  })

  useEffect(() => {
    if (!playing) return
    const c = canvas.current
    if (!c) return
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    let i = 0, last = 0, raf = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < 1000 / s.fps) return
      last = t
      renderStep(x, steps[i % steps.length])
      i++
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, steps, s.fps, W, H])

  const edit = (p: Partial<Frame>) => setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, ...p } : x)))
  const addFiles = async (files: File[]) => {
    setBusy('Loading photos…')
    const loaded = (await Promise.all(files.filter((x) => x.type.startsWith('image/')).map(loadFile))).filter((x): x is Frame => !!x)
    loaded.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setFrames((fs) => (fs.length && fs[0].name.startsWith('plant_day') ? loaded : [...fs, ...loaded]))
    setCur(0)
    setBusy(loaded.length ? '' : 'No readable images in that selection.')
  }

  const autoAlign = (ref: number) => {
    if (frames.length < 2) return
    setBusy('Aligning…')
    setTimeout(() => {
      const AW = 192, AH = Math.round(AW / aspect)
      const tmp = document.createElement('canvas')
      tmp.width = AW
      tmp.height = AH
      const x = tmp.getContext('2d', { willReadFrequently: true })!
      const grayOf = (fr: Frame) => {
        x.fillStyle = '#000'
        x.fillRect(0, 0, AW, AH)
        drawFrame(x, { ...fr, dx: 0, dy: 0 }, AW, AH, false)
        return toGray(x.getImageData(0, 0, AW, AH).data, AW, AH)
      }
      const r = grayOf(frames[ref])
      const rm = mean(r)
      const max = Math.max(2, Math.round((s.maxShift / 100) * AW))
      const next = frames.map((fr, i) => {
        const g = grayOf(fr)
        const gain = gainFor(rm, mean(g))
        if (i === ref) return { ...fr, dx: 0, dy: 0, gain: 1 }
        const [sx, sy] = align(r, g, AW, AH, max)
        const ka = Math.max(AW / fr.w, AH / fr.h)
        return { ...fr, dx: sx / ka, dy: sy / ka, gain }
      })
      setFrames(next)
      set({ crop: autoCrop(next) })
      setBusy('')
    }, 20)
  }

  const exportVideo = async () => {
    if (!canRecord || !frames.length) return
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    renderStep(x, steps[0])
    const stream = c.captureStream(0)
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: s.bitrate * 1e6 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((res) => (rec.onstop = () => res()))
    setBusy('Recording WebM…')
    rec.start()
    for (let i = 0; i < steps.length; i++) {
      renderStep(x, steps[i])
      track.requestFrame?.()
      setProgress((i + 1) / steps.length)
      await new Promise((r) => setTimeout(r, 1000 / s.fps))
    }
    rec.stop()
    await done
    stream.getTracks().forEach((t) => t.stop())
    const blob = new Blob(chunks, { type: 'video/webm' })
    if (video) URL.revokeObjectURL(video.url)
    setVideo({ url: URL.createObjectURL(blob), size: blob.size })
    download('plant-timelapse.webm', blob)
    setBusy('')
    setProgress(0)
  }

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= frames.length) return
    const fs = [...frames]
    ;[fs[i], fs[j]] = [fs[j], fs[i]]
    setFrames(fs)
    setCur(j)
  }
  const seconds = steps.length / s.fps

  return (
    <Split wide="right">
      <div>
        <Panel title="Photos" actions={<Btn kind="ghost" onClick={() => { setFrames(demoFrames()); setCur(1) }}>Demo</Btn>}>
          <FileDrop accept="image/*" multiple onFiles={(fs) => void addFiles(fs)} label="Drop your plant photos (sorted by file name)" />
          <Row>
            <Btn kind="ghost" onClick={() => setFrames([...frames].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}>Sort by name</Btn>
            <Btn kind="ghost" onClick={() => setFrames([...frames].sort((a, b) => a.time - b.time))}>Sort by date</Btn>
            <Btn kind="danger" disabled={!frames.length} onClick={() => { setFrames([]); setCur(0) }}>Remove all</Btn>
          </Row>
          <p className="k-hint">Photos stay in your browser. Large photos are scaled to 1600 px for speed. Tip: shoot from the same spot at the same time of day and keep a fixed marker (pot rim, ruler) in view.</p>
        </Panel>
        <Panel title="Alignment">
          <Row>
            <Btn kind="primary" disabled={frames.length < 2 || !!busy} onClick={() => autoAlign(0)}>Auto-align to first photo</Btn>
            <Btn disabled={frames.length < 2 || !!busy} onClick={() => autoAlign(cur)}>Align to current</Btn>
          </Row>
          <Slider label="Search range" value={s.maxShift} onChange={(maxShift) => set({ maxShift })} min={2} max={20} unit="% of width" />
          <Row>
            <div style={{ flex: 1, minWidth: 180 }}><Slider label="Crop zoom (hides moving edges)" value={s.crop} onChange={(crop) => set({ crop })} min={1} max={1.4} step={0.01} show={(v) => `×${v.toFixed(2)}`} /></div>
            <Btn onClick={() => set({ crop: autoCrop(frames) })}>Auto crop</Btn>
          </Row>
          <Check label="Even out brightness (flicker reduction)" value={s.normalize} onChange={(normalize) => set({ normalize })} />
          {f && (
            <>
              <p className="k-hint" style={{ marginTop: 8 }}>Fine-tune photo {cur + 1}: drag the image, or use the controls. Compare against the previous photo with the onion skin.</p>
              <Row>
                <Btn onClick={() => edit({ dx: f.dx - 1 })}>←</Btn>
                <Btn onClick={() => edit({ dx: f.dx + 1 })}>→</Btn>
                <Btn onClick={() => edit({ dy: f.dy - 1 })}>↑</Btn>
                <Btn onClick={() => edit({ dy: f.dy + 1 })}>↓</Btn>
                <Btn kind="ghost" onClick={() => edit({ dx: 0, dy: 0, rot: 0, scale: 1, gain: 1 })}>Reset</Btn>
                <Btn kind="ghost" disabled={!cur} onClick={() => { const p = frames[cur - 1]; edit({ dx: p.dx, dy: p.dy, rot: p.rot, scale: p.scale }) }}>Copy previous</Btn>
              </Row>
              <Slider label="Rotate" value={f.rot} onChange={(rot) => edit({ rot })} min={-10} max={10} step={0.1} unit="°" />
              <Slider label="Zoom" value={f.scale} onChange={(scale) => edit({ scale })} min={0.8} max={1.25} step={0.005} show={(v) => `×${v.toFixed(3)}`} />
              <Slider label="Brightness" value={f.gain} onChange={(gain) => edit({ gain })} min={0.5} max={2} step={0.01} show={(v) => `×${v.toFixed(2)}`} />
              <p className="k-hint">Offset {f.dx.toFixed(1)}, {f.dy.toFixed(1)} px</p>
            </>
          )}
        </Panel>
        <Panel title="Video">
          <Row>
            <Num label="Frame rate" value={s.fps} onChange={(fps) => set({ fps: Math.max(1, Math.min(60, fps)) })} unit="fps" min={1} max={60} />
            <Num label="Frames per photo" value={s.hold} onChange={(hold) => set({ hold: Math.max(1, Math.round(hold)) })} min={1} step={1} />
          </Row>
          <Row>
            <Num label="Cross-fade frames" value={s.fade} onChange={(fade) => set({ fade: Math.max(0, Math.round(fade)) })} min={0} step={1} />
            <Num label="Hold last photo" value={s.endHold} onChange={(endHold) => set({ endHold: Math.max(0, Math.round(endHold)) })} unit="frames" min={0} step={1} />
          </Row>
          <Row>
            <Select label="Resolution" value={s.height} onChange={(height) => set({ height })} options={[[480, '480p'], [720, '720p'], [1080, '1080p']]} />
            <Select label="Quality" value={s.bitrate} onChange={(bitrate) => set({ bitrate })} options={[[2, '2 Mbit/s'], [6, '6 Mbit/s'], [12, '12 Mbit/s']]} />
          </Row>
          <Select label="Caption" value={s.label} onChange={(label) => set({ label })} options={[['none', 'None'], ['day', 'Day counter'], ['date', 'File date'], ['frame', 'Frame number'], ['name', 'File name']]} />
          {s.label === 'day' && (
            <Row>
              <Num label="First day" value={s.startDay} onChange={(startDay) => set({ startDay })} step={1} />
              <Num label="Days between photos" value={s.daysPer} onChange={(daysPer) => set({ daysPer })} min={0} step={0.5} />
            </Row>
          )}
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
      </div>
      <div>
        <Panel title={playing ? 'Preview' : `Photo ${frames.length ? cur + 1 : 0} of ${frames.length}${f ? ` · ${f.name}` : ''}`} actions={<>
          <Btn kind={playing ? 'danger' : 'primary'} disabled={!frames.length} onClick={() => setPlaying(!playing)}>{playing ? '■ Stop' : '▶ Preview'}</Btn>
          <Btn disabled={!canRecord || !frames.length || !!busy} onClick={() => void exportVideo()}>⬇ WebM</Btn>
          <Btn disabled={!frames.length} onClick={() => canvas.current?.toBlob((b) => b && download(`frame-${cur + 1}.png`, b), 'image/png')}>PNG</Btn>
        </>}>
          {frames.length ? (
            <canvas
              ref={canvas}
              style={{ width: '100%', borderRadius: 10, background: '#000', touchAction: 'none', cursor: playing ? 'default' : 'move', display: 'block' }}
              onPointerDown={(e) => {
                if (playing || !f) return
                drag.current = { x: e.clientX, y: e.clientY, dx: f.dx, dy: f.dy }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (!d || !f) return
                const rect = e.currentTarget.getBoundingClientRect()
                const k = W / rect.width / (Math.max(W / f.w, H / f.h) * s.crop)
                edit({ dx: d.dx + (e.clientX - d.x) * k, dy: d.dy + (e.clientY - d.y) * k })
              }}
              onPointerUp={() => (drag.current = null)}
            />
          ) : <div className="k-chart empty" style={{ height: 300 }}>Add photos or load the demo.</div>}
          {!playing && (
            <Row>
              <Seg value={s.onionMode} onChange={(onionMode) => set({ onionMode })} options={[['over', 'Onion skin'], ['diff', 'Difference']]} />
              <div style={{ flex: 1, minWidth: 160 }}><Slider label="Previous photo" value={s.onion} onChange={(onion) => set({ onion })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} /></div>
              <Check label="Grid" value={s.grid} onChange={(grid) => set({ grid })} />
            </Row>
          )}
          {busy && <Note>{busy} {progress > 0 && <Bar value={progress} />}</Note>}
          {!canRecord && <Note tone="warn">This browser cannot record canvas video (MediaRecorder / captureStream missing). Preview and PNG export still work.</Note>}
        </Panel>
        <Panel title="Timeline">
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {frames.map((fr, i) => (
              <button key={fr.id} type="button" onClick={() => { setPlaying(false); setCur(i) }} title={fr.name}
                style={{ flex: '0 0 auto', padding: 2, border: `2px solid ${i === cur ? 'var(--accent)' : 'transparent'}`, borderRadius: 8, background: 'none', cursor: 'pointer', position: 'relative' }}>
                <img src={fr.thumb} alt={fr.name} style={{ height: 54, display: 'block', borderRadius: 5 }} />
                <span style={{ position: 'absolute', left: 5, top: 3, fontSize: 10, color: '#fff', textShadow: '0 0 3px #000' }}>{i + 1}{fr.dx || fr.dy ? ' ✓' : ''}</span>
              </button>
            ))}
          </div>
          <Row>
            <Btn disabled={cur <= 0} onClick={() => move(cur, -1)}>◀ Move earlier</Btn>
            <Btn disabled={cur >= frames.length - 1} onClick={() => move(cur, 1)}>Move later ▶</Btn>
            <Btn kind="danger" disabled={!frames.length} onClick={() => { setFrames(frames.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)) }}>Delete photo</Btn>
          </Row>
          <Stats>
            <Stat label="Photos" value={frames.length} />
            <Stat label="Video length" value={`${seconds.toFixed(1)} s`} sub={`${steps.length} frames @ ${s.fps} fps`} tone="accent" />
            <Stat label="Output" value={`${W}×${H}`} sub="WebM (VP9/VP8)" />
          </Stats>
          {video && (
            <>
              <video src={video.url} controls loop style={{ width: '100%', borderRadius: 10, marginTop: 8 }} />
              <p className="k-hint">Last export: {(video.size / 1e6).toFixed(2)} MB. WebM plays in Chrome, Firefox, Edge and recent Safari; recording runs in real time.</p>
            </>
          )}
        </Panel>
      </div>
    </Split>
  )
}
