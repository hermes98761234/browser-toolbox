import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import type { Dither } from './lib/video-to-gif'

const DEF = { fps: 12, width: 360, start: 0, end: 3, colors: 128, dither: 'fs' as Dither, strength: 0.8, optimize: true, local: false, loop: 0, speed: 1, boomerang: false }
type S = typeof DEF
const MAX_FRAMES = 450

const PRESETS: [string, Partial<S>][] = [
  ['Small & light', { fps: 10, width: 320, colors: 64, dither: 'bayer', optimize: true }],
  ['Balanced', { fps: 12, width: 360, colors: 128, dither: 'fs', optimize: true }],
  ['Smooth HD', { fps: 20, width: 540, colors: 256, dither: 'fs', optimize: true }],
  ['Sticker / meme', { fps: 15, width: 240, colors: 48, dither: 'none', boomerang: true }],
]

/** Frame delays in 1/100 s without cumulative rounding drift. */
function delays(n: number, fps: number, speed: number): number[] {
  const per = 100 / (fps * speed)
  return Array.from({ length: n }, (_, i) => Math.max(2, Math.round((i + 1) * per) - Math.round(i * per)))
}

/** Synthetic demo clip: drawn straight to a canvas, frame by frame. */
function demoFrame(x: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = x.createLinearGradient(0, 0, w, h)
  const hue = 205 // static backdrop: shows off frame-difference optimisation
  g.addColorStop(0, `hsl(${hue},80%,55%)`)
  g.addColorStop(1, `hsl(${(hue + 140) % 360},75%,35%)`)
  x.fillStyle = g
  x.fillRect(0, 0, w, h)
  const floor = h * 0.86
  x.fillStyle = 'rgba(0,0,0,0.25)'
  x.fillRect(0, floor, w, h - floor)
  const r = h * 0.11
  const ph = (t * 1.4) % 1
  const by = floor - r - Math.abs(Math.sin(ph * Math.PI)) * h * 0.5
  const bx = r + ((t * 0.35) % 1) * (w - 2 * r)
  x.fillStyle = 'rgba(0,0,0,0.25)'
  x.beginPath()
  x.ellipse(bx, floor + 4, r * (1 - (floor - r - by) / h), r * 0.18, 0, 0, Math.PI * 2)
  x.fill()
  const bg = x.createRadialGradient(bx - r / 3, by - r / 3, r / 6, bx, by, r)
  bg.addColorStop(0, '#fff7ae')
  bg.addColorStop(1, '#f59e0b')
  x.fillStyle = bg
  x.beginPath()
  x.arc(bx, by, r, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#fff'
  x.font = `bold ${Math.round(h * 0.12)}px system-ui, sans-serif`
  x.fillText('GIF demo', w * 0.05, h * 0.18)
  x.font = `${Math.round(h * 0.07)}px ui-monospace, monospace`
  x.fillText(`t = ${t.toFixed(2)} s`, w * 0.05, h * 0.3)
}

export default function VideoToGif() {
  const [s, set, reset] = useToolState('video-to-gif', DEF)
  const [src, setSrc] = useState<{ url: string; name: string; size: number } | null>(null)
  const [meta, setMeta] = useState<{ w: number; h: number; dur: number }>({ w: 640, h: 360, dur: 4 })
  const [phase, setPhase] = useState<{ label: string; p: number } | null>(null)
  const [out, setOut] = useState<{ url: string; blob: Blob; size: number; frames: number; colors: number; w: number; h: number; ms: number; dur: number } | null>(null)
  const [err, setErr] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const worker = useRef<Worker | null>(null)
  const auto = useRef(false)

  const start = Math.max(0, Math.min(s.start, meta.dur))
  const end = Math.max(start, Math.min(s.end, meta.dur))
  const W = Math.max(16, Math.round(Math.min(s.width, src ? meta.w : 1920) / 2) * 2)
  const H = Math.max(2, Math.round((W * meta.h) / meta.w / 2) * 2)
  const nFrames = Math.max(1, Math.floor((end - start) * s.fps))
  const tooMany = nFrames > MAX_FRAMES

  useEffect(() => () => worker.current?.terminate(), [])

  const loadFile = (f: File) => {
    if (src) URL.revokeObjectURL(src.url)
    setErr('')
    setOut(null)
    setSrc({ url: URL.createObjectURL(f), name: f.name, size: f.size })
  }

  const onMeta = () => {
    const v = video.current
    if (!v) return
    const dur = Number.isFinite(v.duration) ? v.duration : 10
    setMeta({ w: v.videoWidth || 640, h: v.videoHeight || 360, dur })
    set({ start: 0, end: Math.min(dur, 4) })
  }

  const grab = async (): Promise<Uint8ClampedArray[]> => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d', { willReadFrequently: true })!
    const frames: Uint8ClampedArray[] = []
    const n = Math.min(nFrames, MAX_FRAMES)
    const v = video.current
    for (let i = 0; i < n; i++) {
      const t = start + i / s.fps
      if (src && v) {
        await new Promise<void>((res, rej) => {
          const to = setTimeout(() => rej(new Error('Seeking timed out — the file may not be seekable.')), 8000)
          v.onseeked = () => {
            clearTimeout(to)
            res()
          }
          v.currentTime = Math.min(t, meta.dur - 0.001)
        })
        x.drawImage(v, 0, 0, W, H)
      } else demoFrame(x, W, H, t)
      frames.push(x.getImageData(0, 0, W, H).data)
      setPhase({ label: `Capturing frame ${i + 1} / ${n}`, p: ((i + 1) / n) * 0.5 })
    }
    if (s.boomerang && frames.length > 2) for (let i = frames.length - 2; i > 0; i--) frames.push(frames[i].slice())
    return frames
  }

  const convert = async () => {
    setErr('')
    const t0 = performance.now()
    try {
      if (src && video.current) video.current.pause()
      const frames = await grab()
      setPhase({ label: 'Building palette & encoding…', p: 0.5 })
      worker.current?.terminate()
      const wk = new Worker(new URL('./lib/video-to-gif.worker.ts', import.meta.url), { type: 'module' })
      worker.current = wk
      const ds = delays(frames.length, s.fps, s.speed)
      const res = await new Promise<{ bytes: Uint8Array; colors: number; frames: number }>((resolve, reject) => {
        wk.onmessage = (e) => {
          const m = e.data
          if (m.error) reject(new Error(m.error))
          else if (m.done) resolve(m)
          else setPhase({ label: `Encoding ${Math.round(m.progress * 100)}%`, p: 0.5 + m.progress * 0.5 })
        }
        wk.onerror = (e) => reject(new Error(e.message || 'Worker failed'))
        wk.postMessage(
          { w: W, h: H, frames, delays: ds, opts: { colors: s.colors, dither: s.dither, strength: s.strength, optimize: s.optimize && !s.local, localPalettes: s.local, loop: s.loop } },
          frames.map((f) => f.buffer),
        )
      })
      wk.terminate()
      worker.current = null
      if (out) URL.revokeObjectURL(out.url)
      const blob = new Blob([res.bytes as BlobPart], { type: 'image/gif' })
      setOut({ url: URL.createObjectURL(blob), blob, size: res.bytes.length, frames: res.frames, colors: res.colors, w: W, h: H, ms: performance.now() - t0, dur: ds.reduce((a, b) => a + b, 0) / 100 })
    } catch (e) {
      setErr((e as Error).message)
    }
    setPhase(null)
  }

  // first visit: encode the demo clip so the page shows a real GIF
  useEffect(() => {
    if (auto.current) return
    auto.current = true
    void convert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return (
    <Split>
      <div>
        <Panel title="Source" actions={src && <Btn kind="ghost" onClick={() => { URL.revokeObjectURL(src.url); setSrc(null); setMeta({ w: 640, h: 360, dur: 4 }); set({ start: 0, end: 3 }) }}>Use demo clip</Btn>}>
          <FileDrop accept="video/*" onFiles={(f) => loadFile(f[0])} label={src ? `${src.name} (${fmtBytes(src.size)}) — drop another to replace` : 'Drop an MP4 / WebM / MOV clip (or click)'} />
          {src ? (
            <video ref={video} src={src.url} controls muted playsInline preload="auto" onLoadedMetadata={onMeta} onError={() => setErr('This browser cannot decode that video format. Try MP4 (H.264) or WebM.')} style={{ width: '100%', borderRadius: 10, marginTop: 10, background: '#000' }} />
          ) : (
            <Note>Showing a built-in 4-second demo animation. Add your own clip to convert it — nothing is uploaded.</Note>
          )}
        </Panel>
        <Panel title="Segment">
          <Row>
            <Num label="Start" value={Number(start.toFixed(2))} onChange={(v) => set({ start: Math.max(0, v) })} unit="s" min={0} step={0.1} />
            <Num label="End" value={Number(end.toFixed(2))} onChange={(v) => set({ end: v })} unit="s" min={0} step={0.1} />
          </Row>
          {src && (
            <Row>
              <Btn onClick={() => video.current && set({ start: video.current.currentTime })}>Start = playhead</Btn>
              <Btn onClick={() => video.current && set({ end: video.current.currentTime })}>End = playhead</Btn>
            </Row>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Clip length {num(meta.dur, 2)} s · segment {num(end - start, 2)} s · {Math.min(nFrames, MAX_FRAMES)} frames{s.boomerang ? ' (×2 with boomerang)' : ''}</p>
          {tooMany && <Note tone="warn">That's {nFrames} frames — only the first {MAX_FRAMES} are used. Shorten the segment or lower the fps.</Note>}
        </Panel>
        <Panel title="Output settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </div>
          <Slider label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} min={2} max={30} unit=" fps" />
          <Slider label="Width" value={s.width} onChange={(width) => set({ width })} min={120} max={960} step={10} unit=" px" />
          <Slider label="Colours" value={s.colors} onChange={(colors) => set({ colors })} min={8} max={256} step={8} />
          <Seg value={s.dither} onChange={(dither) => set({ dither })} options={[['none', 'No dither'], ['fs', 'Floyd–Steinberg'], ['bayer', 'Ordered (Bayer)']]} />
          {s.dither !== 'none' && <Slider label="Dither strength" value={s.strength} onChange={(strength) => set({ strength })} min={0.1} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          <Slider label="Playback speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.25} max={4} step={0.25} unit="×" />
          <Row>
            <Num label="Loop count" value={s.loop} onChange={(loop) => set({ loop: Math.max(0, Math.round(loop)) })} min={0} hint="0 = forever" />
          </Row>
          <Check label="Optimise: crop & make unchanged pixels transparent" value={s.optimize && !s.local} onChange={(optimize) => set({ optimize, local: optimize ? false : s.local })} />
          <Check label="Per-frame palettes (better colour for scene changes, bigger file)" value={s.local} onChange={(local) => set({ local, optimize: local ? false : s.optimize })} />
          <Check label="Boomerang (play forward then backward)" value={s.boomerang} onChange={(boomerang) => set({ boomerang })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Output size" value={out ? fmtBytes(out.size) : '—'} tone="accent" sub={out ? `${fmtBytes(out.size / out.frames)} per stored frame` : 'not converted yet'} />
          <Stat label="Dimensions" value={`${W}×${H}`} sub={`${s.fps} fps`} />
          <Stat label="Frames" value={out ? out.frames : '—'} sub={out ? `${num(out.dur, 2)} s loop` : ''} />
          <Stat label="Palette" value={out ? `${out.colors} colours` : '—'} sub={out ? `encoded in ${num(out.ms / 1000, 1)} s` : ''} />
        </Stats>
        <Panel
          title="GIF preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => void convert()} disabled={!!phase || end <= start}>{phase ? 'Working…' : '▶ Convert'}</Btn>
              <Btn onClick={() => out && download((src?.name.replace(/\.[^.]+$/, '') ?? 'demo') + '.gif', out.blob, 'image/gif')} disabled={!out || !!phase}>⬇ GIF</Btn>
            </>
          }
        >
          {phase && (
            <div style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{phase.label}</div>
              <Bar value={phase.p} />
            </div>
          )}
          {err && <Note tone="err">{err}</Note>}
          {out ? (
            <div style={{ textAlign: 'center' }}>
              <img src={out.url} alt="Generated GIF" style={{ maxWidth: '100%', borderRadius: 8, imageRendering: out.w < 300 ? 'pixelated' : 'auto', background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 16px 16px' }} />
            </div>
          ) : (
            !phase && <Note>Press Convert to create the GIF.</Note>
          )}
        </Panel>
        <Note>
          GIFs hold at most 256 colours per frame. Fewer colours, lower fps and a narrower width shrink the file the most; "optimise" stores only the pixels that change between frames, which helps a lot for screen recordings and static backgrounds.
        </Note>
      </div>
    </Split>
  )
}
