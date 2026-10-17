import { useEffect, useRef, useState } from 'react'
import { Btn, download, FileDrop, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats } from '../kit'
import { batchTimes, clock, frameAt, frameName, outSize, seekTime, timecode, type BatchMode } from './lib/frame-grabber'
import { fmtBytes, makeZip } from './lib/image-compressor'

type Fmt = 'png' | 'jpeg' | 'webp'
interface Shot { id: number; t: number; name: string; blob: Blob; url: string; w: number; h: number }

const MIME: Record<Fmt, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

/** Records a 4-second synthetic clip (moving shapes + burned-in frame counter) so the tool works without a file. */
async function makeDemo(): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 360
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  let raf = 0
  const draw = () => {
    const t = (performance.now() - t0) / 1000
    const grd = g.createLinearGradient(0, 0, 640, 360)
    grd.addColorStop(0, `hsl(${(t * 40) % 360} 70% 30%)`)
    grd.addColorStop(1, `hsl(${(t * 40 + 120) % 360} 70% 18%)`)
    g.fillStyle = grd
    g.fillRect(0, 0, 640, 360)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsl(${i * 60} 85% 60%)`
      g.beginPath()
      g.arc(320 + Math.cos(t * (1 + i * 0.3) + i) * (90 + i * 18), 180 + Math.sin(t * (1.3 + i * 0.2) + i) * 110, 14 + i * 3, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#fff'
    g.font = 'bold 34px system-ui, sans-serif'
    g.fillText(`DEMO  ${t.toFixed(2)} s`, 24, 52)
    g.font = '18px ui-monospace, monospace'
    g.fillText(`frame ≈ ${Math.floor(t * 30)}`, 24, 82)
    g.fillRect(24, 330, (t / 4) * 592, 8)
    raf = requestAnimationFrame(draw)
  }
  draw()
  rec.start(250)
  await new Promise((r) => setTimeout(r, 4000))
  rec.stop()
  cancelAnimationFrame(raf)
  await done
  stream.getTracks().forEach((tr) => tr.stop())
  return new Blob(chunks, { type: 'video/webm' })
}

const seeked = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((res) => {
    const on = () => {
      v.removeEventListener('seeked', on)
      clearTimeout(tm)
      res()
    }
    const tm = setTimeout(on, 4000)
    v.addEventListener('seeked', on)
    v.currentTime = t
  })

export default function FrameGrabber() {
  const vRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<{ url: string; name: string; size: number } | null>(null)
  const [status, setStatus] = useState('Generating a 4-second demo clip…')
  const [meta, setMeta] = useState({ w: 0, h: 0, dur: 0 })
  const [t, setT] = useState(0)
  const [fps, setFps] = useState(30)
  const [fmt, setFmt] = useState<Fmt>('png')
  const [q, setQ] = useState(0.92)
  const [maxW, setMaxW] = useState(0)
  const [mode, setMode] = useState<BatchMode>('seconds')
  const [every, setEvery] = useState(0.5)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null)
  const cancel = useRef(false)
  const nextId = useRef(1)

  const load = (blob: Blob, name: string) => {
    setSrc((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return { url: URL.createObjectURL(blob), name, size: blob.size }
    })
    setStatus('')
  }

  useEffect(() => {
    let live = true
    void makeDemo().then((b) => {
      if (!live) return
      if (b) load(b, 'demo-clip.webm')
      else setStatus('This browser cannot record a demo clip. Open a video file to start.')
    })
    return () => {
      live = false
    }
  }, [])

  const shotsRef = useRef<Shot[]>([])
  useEffect(() => {
    shotsRef.current = shots
  }, [shots])
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), [])
  const drop = (keep: (s: Shot) => boolean) =>
    setShots((a) => {
      a.filter((s) => !keep(s)).forEach((s) => URL.revokeObjectURL(s.url))
      return a.filter(keep)
    })

  const onMeta = () => {
    const v = vRef.current!
    // MediaRecorder WebM has no duration until we seek far past the end
    if (!Number.isFinite(v.duration)) {
      const fix = () => {
        if (!Number.isFinite(v.duration)) return
        v.removeEventListener('durationchange', fix)
        v.currentTime = 0
        setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration })
        setRange([0, v.duration])
      }
      v.addEventListener('durationchange', fix)
      v.currentTime = 1e101
      return
    }
    setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration })
    setRange([0, v.duration])
  }

  const grab = async (v: HTMLVideoElement): Promise<Shot> => {
    const [w, h] = outSize(v.videoWidth, v.videoHeight, maxW)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(v, 0, 0, w, h)
    const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode failed'))), MIME[fmt], q))
    const ext = fmt === 'jpeg' ? 'jpg' : fmt
    return { id: nextId.current++, t: v.currentTime, name: frameName(src?.name ?? 'frame', v.currentTime, fps, ext), blob, url: URL.createObjectURL(blob), w, h }
  }

  const captureNow = async () => {
    const v = vRef.current
    if (!v || !meta.w) return
    v.pause()
    const s = await grab(v)
    setShots((a) => [...a, s])
  }

  const step = (frames: number) => {
    const v = vRef.current
    if (!v) return
    v.pause()
    const n = Math.min(frameAt(meta.dur, fps), Math.max(0, frameAt(v.currentTime, fps) + frames))
    v.currentTime = Math.min(seekTime(n, fps), meta.dur)
  }

  const times = batchTimes(range[0], range[1], mode, every, fps)

  const runBatch = async () => {
    const v = vRef.current
    if (!v || !times.length) return
    v.pause()
    cancel.current = false
    const out: Shot[] = []
    for (let i = 0; i < times.length && !cancel.current; i++) {
      setBusy({ i, n: times.length })
      await seeked(v, times[i])
      out.push(await grab(v))
    }
    setShots((a) => [...a, ...out])
    setBusy(null)
  }

  const zip = async () => {
    const files = await Promise.all(shots.map(async (s) => ({ name: s.name, data: new Uint8Array(await s.blob.arrayBuffer()) })))
    const z = makeZip(files)
    download(`${(src?.name ?? 'frames').replace(/\.[^.]+$/, '')}-frames.zip`, new Blob([z as BlobPart], { type: 'application/zip' }), 'application/zip')
  }

  const total = shots.reduce((a, s) => a + s.blob.size, 0)
  const frame = frameAt(t, fps)

  return (
    <Split wide="right">
      <div>
        <Panel title="Video">
          <FileDrop accept="video/*" onFiles={([f]) => load(f, f.name)} label="Drop a video (MP4, WebM, MOV…) or click to choose" />
          {status && <Note>{status}</Note>}
          {src && (
            <p className="muted" style={{ fontSize: 13 }}>
              <b>{src.name}</b> · {fmtBytes(src.size)} · {meta.w}×{meta.h} · {clock(meta.dur)}
            </p>
          )}
          <Row>
            <Select label="Frame rate (for stepping)" value={fps} onChange={setFps} options={[[23.976, '23.976'], [24, '24'], [25, '25 (PAL)'], [29.97, '29.97 (NTSC)'], [30, '30'], [50, '50'], [60, '60']]} />
          </Row>
          <Note>Browsers don't expose a file's exact frame rate. Pick the one your camera used so ±1 frame lands on real frames.</Note>
        </Panel>
        <Panel title="Output">
          <Seg value={fmt} onChange={setFmt} options={[['png', 'PNG (lossless)'], ['jpeg', 'JPEG'], ['webp', 'WebP']]} />
          {fmt !== 'png' && <Slider label="Quality" value={q} onChange={setQ} min={0.5} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
          <Select label="Size" value={maxW} onChange={setMaxW} options={[[0, 'Original resolution'], [3840, 'Max 3840 px wide'], [1920, 'Max 1920 px wide'], [1280, 'Max 1280 px wide'], [640, 'Max 640 px wide'], [320, 'Max 320 px (thumbnails)']]} />
        </Panel>
        <Panel title="Batch extraction">
          <Seg value={mode} onChange={setMode} options={[['seconds', 'Every N seconds'], ['frames', 'Every N frames'], ['count', 'N frames total']]} />
          <Row>
            <Num label={mode === 'seconds' ? 'Interval' : mode === 'frames' ? 'Every' : 'Frames'} unit={mode === 'seconds' ? 's' : 'frames'} value={every} min={mode === 'seconds' ? 0.01 : 1} onChange={(v) => setEvery(Math.max(mode === 'seconds' ? 0.01 : 1, v))} />
            <Num label="From" unit="s" value={+range[0].toFixed(3)} min={0} onChange={(a) => setRange([Math.max(0, a), range[1]])} />
            <Num label="To" unit="s" value={+range[1].toFixed(3)} min={0} onChange={(b) => setRange([range[0], Math.min(meta.dur || b, b)])} />
          </Row>
          <Row>
            <Btn onClick={() => setRange([t, range[1]])}>From = playhead</Btn>
            <Btn onClick={() => setRange([range[0], t])}>To = playhead</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>{times.length} frame{times.length === 1 ? '' : 's'} will be captured{times.length >= 500 ? ' (capped at 500)' : ''}.</p>
          {busy ? (
            <>
              <progress max={busy.n} value={busy.i + 1} style={{ width: '100%' }} />
              <Btn kind="danger" onClick={() => (cancel.current = true)}>Stop</Btn>
            </>
          ) : (
            <Btn kind="primary" disabled={!meta.w || !times.length} onClick={() => void runBatch()}>Extract {times.length} frames</Btn>
          )}
        </Panel>
      </div>

      <div>
        <Panel title="Player">
          {src ? (
            <video
              ref={vRef}
              src={src.url}
              controls
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={onMeta}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
              onSeeked={(e) => setT(e.currentTarget.currentTime)}
              style={{ width: '100%', maxHeight: 420, background: '#000', borderRadius: 10 }}
            />
          ) : (
            <div className="k-chart empty" style={{ height: 240 }}>No video yet</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <Btn onClick={() => step(-Math.round(fps))} title="Back 1 second">«1s</Btn>
            <Btn onClick={() => step(-10)} title="Back 10 frames">−10</Btn>
            <Btn onClick={() => step(-1)} title="Previous frame">◀ 1</Btn>
            <Btn onClick={() => step(1)} title="Next frame">1 ▶</Btn>
            <Btn onClick={() => step(10)} title="Forward 10 frames">+10</Btn>
            <Btn onClick={() => step(Math.round(fps))} title="Forward 1 second">1s»</Btn>
            <Btn kind="primary" disabled={!meta.w || !!busy} onClick={() => void captureNow()}>📸 Capture frame</Btn>
          </div>
        </Panel>
        <Stats>
          <Stat label="Timecode" value={<span style={{ fontFamily: 'ui-monospace, monospace' }}>{timecode(t, fps)}</span>} sub={clock(t)} />
          <Stat label="Frame" value={frame} sub={`of ~${frameAt(meta.dur, fps)}`} />
          <Stat label="Captured" value={shots.length} sub={fmtBytes(total)} tone="accent" />
        </Stats>
        <Panel
          title={`Frames (${shots.length})`}
          actions={
            <>
              <Btn kind="primary" disabled={!shots.length} onClick={() => void zip()}>⬇ ZIP</Btn>
              <Btn kind="ghost" disabled={!shots.length} onClick={() => drop(() => false)}>Clear</Btn>
            </>
          }
        >
          {!shots.length ? (
            <Note>Capture the current frame or run a batch. Frames are drawn from the decoded video at full resolution and never leave your browser.</Note>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {shots.map((s) => (
                <figure key={s.id} style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--panel)' }}>
                  <img src={s.url} alt={`Frame at ${clock(s.t)}`} style={{ width: '100%', display: 'block', aspectRatio: `${s.w}/${s.h}`, objectFit: 'cover', cursor: 'pointer' }} onClick={() => vRef.current && (vRef.current.currentTime = s.t)} title="Jump to this frame" />
                  <figcaption style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', fontSize: 12 }}>
                    <span style={{ flex: 1 }}>
                      {clock(s.t)} <span className="muted">· {fmtBytes(s.blob.size)}</span>
                    </span>
                    <button type="button" className="k-btn ghost" style={{ padding: '0 4px' }} title="Download" onClick={() => download(s.name, s.blob, s.blob.type)}>⬇</button>
                    <button type="button" className="k-btn ghost" style={{ padding: '0 4px' }} title="Remove" onClick={() => drop((x) => x.id !== s.id)}>✕</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Split>
  )
}
