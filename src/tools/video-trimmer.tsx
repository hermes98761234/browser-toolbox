import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { clampRange, fmtTime, parseTime, pickMime } from './lib/video-trimmer'

interface Opts {
  mute: boolean
  loop: boolean
}
interface Src {
  url: string
  name: string
  size: number
  demo?: boolean
}
type CapVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

const DEF: Opts = { mute: false, loop: true }
const mb = (n: number) => `${(n / 1048576).toFixed(2)} MB`
const STRIP = 10

/** Records an 8-second synthetic clip (moving shapes, big timer, a beep every second). */
async function makeDemo(onProgress: (p: number) => void): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 360
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  let ac: AudioContext | null = null
  try {
    ac = new AudioContext()
    await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 300))])
    // A suspended context (autoplay policy, no click yet) yields a silent track that stalls the muxer: skip audio then.
    if (ac.state !== 'running') throw new Error('suspended')
    const dest = ac.createMediaStreamDestination()
    for (let s = 0; s < 8; s++) {
      const o = ac.createOscillator()
      const gain = ac.createGain()
      o.frequency.value = s % 4 === 0 ? 880 : 440
      gain.gain.setValueAtTime(0, ac.currentTime)
      gain.gain.setValueAtTime(0.25, ac.currentTime + s)
      gain.gain.setValueAtTime(0, ac.currentTime + s + 0.12)
      o.connect(gain).connect(dest)
      o.start(ac.currentTime + s)
      o.stop(ac.currentTime + s + 0.15)
    }
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  } catch {
    void ac?.close()
    ac = null // no audio: video only
  }
  const rec = new MediaRecorder(stream, { mimeType: pickMime((m) => MediaRecorder.isTypeSupported(m)) || undefined })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  const draw = () => {
    const t = (performance.now() - t0) / 1000
    const hue = (t * 45) % 360
    g.fillStyle = `hsl(${hue} 60% 18%)`
    g.fillRect(0, 0, 640, 360)
    const bars = ['#ef4444', '#f59e0b', '#eab308', '#10b981', '#0ea5e9', '#6366f1', '#a855f7']
    bars.forEach((col, i) => {
      g.fillStyle = col
      g.fillRect(i * (640 / 7), 300, 640 / 7 + 1, 60)
    })
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(60 + ((t * 140) % 520), 150 + Math.sin(t * 3) * 70, 28, 0, Math.PI * 2)
    g.fill()
    g.font = 'bold 96px ui-monospace, monospace'
    g.textAlign = 'center'
    g.fillText(t.toFixed(1) + 's', 320, 180)
    g.font = '22px system-ui, sans-serif'
    g.fillText(`Demo clip · scene ${Math.floor(t / 2) + 1} of 4`, 320, 240)
    onProgress(Math.min(1, t / 8))
  }
  draw()
  rec.start(250)
  const timer = setInterval(draw, 1000 / 30)
  await new Promise((r) => setTimeout(r, 8000))
  clearInterval(timer)
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  void ac?.close()
  return new Blob(chunks, { type: rec.mimeType || 'video/webm' })
}

/** MediaRecorder WebM files report Infinity duration until the browser scans to the end. */
function realDuration(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration)) return Promise.resolve(v.duration)
  return new Promise((res) => {
    const on = () => {
      if (!Number.isFinite(v.duration)) return
      v.removeEventListener('durationchange', on)
      v.currentTime = 0
      res(v.duration)
    }
    v.addEventListener('durationchange', on)
    v.currentTime = 1e101
  })
}

const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((r) => {
    const on = () => {
      v.removeEventListener('seeked', on)
      r()
    }
    v.addEventListener('seeked', on)
    v.currentTime = t
  })

function TimeBox({ label, value, onCommit }: { label: string; value: number; onCommit: (t: number) => void }) {
  const [txt, setTxt] = useState(fmtTime(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setTxt(fmtTime(value))
  }
  return (
    <Txt
      label={label}
      value={txt}
      onChange={(v) => {
        setTxt(v)
        const t = parseTime(v)
        if (Number.isFinite(t)) onCommit(t)
      }}
      hint="m:ss.mmm"
    />
  )
}

export default function VideoTrimmer() {
  const [o, set] = useToolState('video-trimmer', DEF)
  const [src, setSrc] = useState<Src | null>(null)
  const [demoP, setDemoP] = useState(0)
  const [dur, setDur] = useState(0)
  const [now, setNow] = useState(0)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [rec, setRec] = useState<number | null>(null)
  const [out, setOut] = useState<{ url: string; blob: Blob; len: number } | null>(null)
  const [err, setErr] = useState('')
  const vid = useRef<HTMLVideoElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef<'s' | 'e' | 'p' | null>(null)
  const stopAt = useRef<number | null>(null)

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined') return
    let live = true
    void makeDemo((p) => live && setDemoP(p))
      .then((b) => live && setSrc((cur) => cur ?? { url: URL.createObjectURL(b), name: 'demo-clip.webm', size: b.size, demo: true }))
      .catch(() => live && setErr('Could not generate the demo clip; open a video file instead.'))
    return () => {
      live = false
    }
  }, [])

  const onMeta = async () => {
    const v = vid.current
    if (!v || !src) return
    const d = await realDuration(v)
    setDur(d)
    setRange([Math.round(d * 2) / 10, Math.round(d * 7.5) / 10])
    setOut(null)
    // Filmstrip: seek a hidden copy to evenly spaced times and grab frames.
    const h = document.createElement('video')
    h.muted = true
    h.src = src.url
    h.preload = 'auto'
    await new Promise((r) => (h.onloadeddata = r))
    await realDuration(h)
    const c = document.createElement('canvas')
    c.width = 160
    c.height = Math.round((160 * (h.videoHeight || 9)) / (h.videoWidth || 16))
    const pics: string[] = []
    for (let i = 0; i < STRIP; i++) {
      await seek(h, Math.min(d - 0.05, ((i + 0.5) / STRIP) * d))
      c.getContext('2d')!.drawImage(h, 0, 0, c.width, c.height)
      pics.push(c.toDataURL('image/jpeg', 0.6))
    }
    setThumbs(pics)
  }

  const open = (f: File) => {
    if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|ogv|m4v)$/i.test(f.name)) return setErr('That does not look like a video file.')
    setErr('')
    setThumbs([])
    setSrc({ url: URL.createObjectURL(f), name: f.name, size: f.size })
  }

  const setR = (s: number, e: number) => setRange(clampRange(s, e, dur))
  const [a, b] = range
  const len = b - a

  const tAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur))
  }
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dur || rec !== null) return
    const t = tAt(e.clientX)
    const px = (dur / track.current!.getBoundingClientRect().width) * 12
    dragging.current = Math.abs(t - a) < px ? 's' : Math.abs(t - b) < px ? 'e' : 'p'
    track.current!.setPointerCapture(e.pointerId)
    move(e)
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragging.current
    if (!d) return
    const t = tAt(e.clientX)
    if (d === 's') setR(t, b)
    else if (d === 'e') setR(a, t)
    if (vid.current) vid.current.currentTime = t
  }

  const playSel = () => {
    const v = vid.current
    if (!v) return
    v.currentTime = a
    stopAt.current = b
    void v.play()
  }
  const onTime = () => {
    const v = vid.current
    if (!v) return
    setNow(v.currentTime)
    if (rec !== null) setRec(Math.min(1, (v.currentTime - a) / (len || 1)))
    if (stopAt.current !== null && v.currentTime >= stopAt.current) {
      if (o.loop && rec === null) v.currentTime = a
      else {
        v.pause()
        stopAt.current = null
      }
    }
  }

  const exportClip = async () => {
    const v = vid.current as CapVideo | null
    if (!v || !src) return
    setErr('')
    setOut(null)
    const cap = v.captureStream?.bind(v) ?? v.mozCaptureStream?.bind(v)
    if (!cap) return setErr('This browser cannot capture video from a <video> element. Try Chrome, Edge or Firefox.')
    v.pause()
    await seek(v, a)
    const full = cap()
    const stream = new MediaStream([...full.getVideoTracks(), ...(o.mute ? [] : full.getAudioTracks())])
    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const stopped = new Promise<void>((res) => (r.onstop = () => res()))
    setRec(0)
    r.start(200)
    stopAt.current = b
    const ended = new Promise<void>((res) => {
      const tick = () => {
        if (v.currentTime >= b || v.ended || v.paused) {
          v.pause()
          res()
        } else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    try {
      await v.play()
    } catch (e) {
      r.stop()
      setRec(null)
      stopAt.current = null
      return setErr(`Playback was blocked: ${(e as Error).message}`)
    }
    await ended
    stopAt.current = null
    r.stop()
    await stopped
    const blob = new Blob(chunks, { type: (r.mimeType || 'video/webm').split(';')[0] })
    setOut({ url: URL.createObjectURL(blob), blob, len })
    setRec(null)
  }

  const pos = (t: number) => `${(dur ? t / dur : 0) * 100}%`
  const outName = src ? src.name.replace(/\.[^.]*$/, '') + `-trim-${fmtTime(a, 1).replace(/[:.]/g, '')}.webm` : 'clip.webm'

  return (
    <Split wide="left">
      <div>
        <Panel title="Video">
          {!src ? (
            <Note tone={err ? 'err' : 'warn'}>{err || (typeof MediaRecorder === 'undefined' ? 'This browser lacks MediaRecorder; open a file to preview it.' : `Generating an 8-second demo clip… ${Math.round(demoP * 100)}%`)}</Note>
          ) : (
            <video
              key={src.url}
              ref={vid}
              src={src.url}
              controls
              playsInline
              onLoadedMetadata={() => void onMeta()}
              onTimeUpdate={onTime}
              style={{ width: '100%', maxHeight: 420, background: '#000', borderRadius: 8 }}
            />
          )}
          {dur > 0 && (
            <>
              <div
                ref={track}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (dragging.current = null)}
                style={{ position: 'relative', height: 64, margin: '12px 0 4px', borderRadius: 8, overflow: 'hidden', background: 'var(--line)', touchAction: 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', height: '100%' }}>
                  {thumbs.map((t, i) => (
                    <img key={i} src={t} alt="" draggable={false} style={{ flex: 1, minWidth: 0, objectFit: 'cover' }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', inset: 0, left: 0, width: pos(a), background: '#000a' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: pos(b), right: 0, background: '#000a' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: pos(a), width: `calc(${pos(b)} - ${pos(a)})`, border: '3px solid var(--accent)', borderRadius: 6, boxSizing: 'border-box' }} />
                {(['s', 'e'] as const).map((k) => (
                  <div key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${pos(k === 's' ? a : b)} - 7px)`, width: 14, background: 'var(--accent)', borderRadius: 4, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10 }}>⋮</div>
                ))}
                <div style={{ position: 'absolute', top: -2, bottom: -2, left: pos(now), width: 2, background: '#fff', boxShadow: '0 0 3px #000' }} />
              </div>
              <Row wrap={false}>
                <span className="muted" style={{ fontSize: 12, flex: 1 }}>0:00</span>
                <span className="muted" style={{ fontSize: 12 }}>Drag the handles · click to seek</span>
                <span className="muted" style={{ fontSize: 12, flex: 1, textAlign: 'right' }}>{fmtTime(dur, 1)}</span>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Open a video">
          <FileDrop accept="video/*" onFiles={(f) => open(f[0])} label="Drop a video (MP4, WebM, MOV…) or click to choose" />
          <p className="muted" style={{ fontSize: 13 }}>The video never leaves your device. Formats your browser can play can be trimmed.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Clip length" value={fmtTime(len, 2)} tone="accent" sub={dur ? `${Math.round((len / dur) * 100)}% of ${fmtTime(dur, 1)}` : ''} />
          <Stat label="Playhead" value={fmtTime(now, 2)} />
        </Stats>
        <Panel title="Cut points">
          <Row>
            <TimeBox label="Start" value={a} onCommit={(t) => setR(t, b)} />
            <TimeBox label="End" value={b} onCommit={(t) => setR(a, t)} />
          </Row>
          <Row>
            <Btn onClick={() => setR(now, Math.max(b, now + 0.1))} disabled={!dur}>⇤ Start = playhead</Btn>
            <Btn onClick={() => setR(Math.min(a, now - 0.1), now)} disabled={!dur}>End = playhead ⇥</Btn>
          </Row>
          <Row>
            <Btn onClick={() => vid.current && (vid.current.currentTime = Math.max(0, now - 1 / 30))} disabled={!dur} title="Back one frame (30 fps)">◂ frame</Btn>
            <Btn onClick={() => vid.current && (vid.current.currentTime = Math.min(dur, now + 1 / 30))} disabled={!dur} title="Forward one frame (30 fps)">frame ▸</Btn>
            <Btn kind="ghost" onClick={() => setR(0, dur)} disabled={!dur}>Select all</Btn>
          </Row>
          <Check label="Loop the selection while previewing" value={o.loop} onChange={(loop) => set({ loop })} />
          <Btn onClick={playSel} disabled={!dur || rec !== null}>▶ Preview selection</Btn>
        </Panel>
        <Panel title="Export">
          <Check label="Remove audio" value={o.mute} onChange={(mute) => set({ mute })} />
          <Btn kind="primary" onClick={() => void exportClip()} disabled={!dur || rec !== null || len <= 0}>
            {rec !== null ? `Recording… ${Math.round(rec * 100)}%` : `✂ Export ${fmtTime(len, 1)} clip`}
          </Btn>
          {err && <Note tone="err">{err}</Note>}
          <Note>
            <div style={{ gridColumn: '1 / -1' }}>
              Export re-records the selection in real time (a {fmtTime(len, 0)} clip takes about as long) to WebM with the browser's MediaRecorder — the video is re-encoded,
              not stream-copied. Keep this tab visible while it records.
            </div>
          </Note>
          {out && (
            <div style={{ marginTop: 10 }}>
              <video src={out.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
              <Row>
                <Btn kind="primary" onClick={() => download(outName, out.blob)}>⬇ {outName}</Btn>
                <span className="muted" style={{ fontSize: 13 }}>{mb(out.blob.size)} · {fmtTime(out.len, 1)}</span>
              </Row>
            </div>
          )}
          {src && <p className="muted" style={{ fontSize: 13 }}>Source: {src.name} · {mb(src.size)}{src.demo ? ' (generated demo)' : ''}</p>}
        </Panel>
      </div>
    </Split>
  )
}
