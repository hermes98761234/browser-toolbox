import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { clock, estimateBytes, outSize, placeRect, suggestKbps, type Aspect, type Fit } from './lib/video-converter'

interface State {
  codec: string
  height: number
  aspect: Aspect
  fit: Fit
  fps: number
  kbps: number
  autoKbps: boolean
  audio: boolean
  audioKbps: number
  start: number
  end: number
  bg: string
}

const DEF: State = { codec: 'video/webm;codecs=vp9,opus', height: 720, aspect: 'orig', fit: 'contain', fps: 30, kbps: 2500, autoKbps: true, audio: true, audioKbps: 128, start: 0, end: 0, bg: '#000000' }

const CODECS: [string, string][] = [
  ['video/webm;codecs=vp9,opus', 'WebM · VP9 + Opus'],
  ['video/webm;codecs=vp8,opus', 'WebM · VP8 + Opus'],
  ['video/webm;codecs=av01,opus', 'WebM · AV1 + Opus'],
  ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'MP4 · H.264 + AAC'],
  ['video/mp4;codecs=avc1,mp4a', 'MP4 · H.264 (generic)'],
  ['video/x-matroska;codecs=avc1,opus', 'MKV · H.264 + Opus'],
]

const PRESETS: [string, Partial<State>][] = [
  ['Web 720p', { height: 720, aspect: 'orig', fps: 30, autoKbps: true }],
  ['Small 480p', { height: 480, aspect: 'orig', fps: 24, autoKbps: false, kbps: 900, audioKbps: 96 }],
  ['Full HD', { height: 1080, aspect: 'orig', fps: 30, autoKbps: true }],
  ['Story 9:16', { height: 720, aspect: '9:16', fit: 'cover', fps: 30, autoKbps: true }],
  ['Square 1:1', { height: 1080, aspect: '1:1', fit: 'contain', fps: 30, autoKbps: true }],
  ['Silent GIF-like', { height: 360, fps: 15, audio: false, autoKbps: false, kbps: 400 }],
]

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`)
const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window
const supported = (t: string) => hasRecorder && MediaRecorder.isTypeSupported(t)
const extOf = (mime: string) => (mime.includes('mp4') ? 'mp4' : mime.includes('matroska') ? 'mkv' : 'webm')

interface Src { name: string; url: string; size: number; w: number; h: number; dur: number }
interface Out { url: string; blob: Blob; mime: string; w: number; h: number; secs: number; ms: number }

/** Records a short synthetic clip (moving shapes + tone) so the tool has something to convert. */
async function makeDemo(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 540
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  let ac: AudioContext | null = null
  try {
    ac = new AudioContext()
    if (ac.state !== 'running') throw new Error('suspended without a user gesture')
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    gain.gain.value = 0.08
    osc.frequency.value = 330
    const dest = ac.createMediaStreamDestination()
    osc.connect(gain).connect(dest)
    osc.start()
    osc.frequency.setValueAtTime(330, ac.currentTime)
    osc.frequency.linearRampToValueAtTime(660, ac.currentTime + 4)
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  } catch {
    void ac?.close()
    ac = null
  }
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm'].find(supported) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  rec.start(250)
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      const grad = g.createLinearGradient(0, 0, 960, 540)
      grad.addColorStop(0, `hsl(${230 + t * 20} 70% 30%)`)
      grad.addColorStop(1, `hsl(${300 + t * 20} 70% 45%)`)
      g.fillStyle = grad
      g.fillRect(0, 0, 960, 540)
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `hsl(${i * 60 + t * 90} 85% 60%)`
        g.beginPath()
        g.arc(480 + Math.cos(t * 1.5 + i) * (120 + i * 30), 270 + Math.sin(t * 2 + i) * (80 + i * 15), 26 + i * 4, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#fff'
      g.font = 'bold 54px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('Browser Toolbox demo', 480, 90)
      g.font = '32px ui-monospace, monospace'
      g.fillText(`t = ${t.toFixed(2)} s`, 480, 500)
      if (t < 4) requestAnimationFrame(frame)
      else resolve()
    }
    frame()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  void ac?.close()
  return new Blob(chunks, { type: 'video/webm' })
}

function probe(url: string): Promise<{ w: number; h: number; dur: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.onloadedmetadata = async () => {
      let dur = v.duration
      if (!Number.isFinite(dur)) {
        // MediaRecorder WebM files have no duration until we seek far.
        v.currentTime = 1e9
        await new Promise((r) => (v.ondurationchange = r))
        dur = v.duration
      }
      resolve({ w: v.videoWidth, h: v.videoHeight, dur })
    }
    v.onerror = () => reject(new Error('This browser cannot decode the file.'))
    v.src = url
  })
}

export default function VideoConverter() {
  const [s, set, reset] = useToolState('video-converter', DEF)
  const [src, setSrc] = useState<Src | null>(null)
  const [out, setOut] = useState<Out | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState('')
  const stop = useRef<() => void>(() => {})

  const load = async (blob: Blob, name: string) => {
    setErr('')
    setOut(null)
    const url = URL.createObjectURL(blob)
    try {
      const m = await probe(url)
      setSrc({ name, url, size: blob.size, ...m })
    } catch (e) {
      setErr(`${name}: ${(e as Error).message} Chrome/Edge decode MP4 (H.264), WebM and MOV with H.264; HEVC depends on hardware.`)
    }
  }

  const demo = async () => {
    if (!hasRecorder) return
    setMsg('Recording a 4-second demo clip…')
    try {
      await load(await makeDemo(), 'demo-clip.webm')
    } finally {
      setMsg('')
    }
  }

  useEffect(() => {
    if (!hasRecorder) return
    let live = true
    void makeDemo().then((b) => {
      if (live) void load(b, 'demo-clip.webm')
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const avail = CODECS.filter(([m]) => supported(m))
  const codec = supported(s.codec) ? s.codec : (avail[0]?.[0] ?? '')
  const [W, H] = src ? outSize(src.w, src.h, s.height, s.aspect) : [0, 0]
  const kbps = s.autoKbps ? suggestKbps(W, H, s.fps, codec.includes('vp8') ? 0.12 : 0.09) : s.kbps
  const t0 = Math.max(0, Math.min(s.start, src?.dur ?? 0))
  const t1 = src ? (s.end > t0 && s.end < src.dur ? s.end : src.dur) : 0
  const secs = Math.max(0, t1 - t0)
  const est = estimateBytes(kbps, s.audio ? s.audioKbps : 0, secs)

  const convert = async () => {
    if (!src || !codec) return
    setErr('')
    setOut(null)
    setProg(0)
    const started = performance.now()
    const v = document.createElement('video')
    v.src = src.url
    v.playsInline = true
    v.preload = 'auto'
    await new Promise((r) => (v.onloadeddata = r))
    v.currentTime = t0
    await new Promise((r) => (v.onseeked = r))

    // Audio: route the element through Web Audio into the recording (not to the speakers).
    let ac: AudioContext | null = null
    let audioTracks: MediaStreamTrack[] = []
    if (s.audio) {
      try {
        ac = new AudioContext()
        await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 400))])
        if (ac.state !== 'running') throw new Error('audio context suspended')
        const dest = ac.createMediaStreamDestination()
        ac.createMediaElementSource(v).connect(dest)
        audioTracks = dest.stream.getAudioTracks()
      } catch {
        void ac?.close()
        ac = null
      }
    }
    v.muted = !audioTracks.length
    let note = s.audio && !audioTracks.length ? 'Audio could not be captured (the browser blocked it), so the output has no sound. Click Convert again.' : ''
    try {
      await v.play()
    } catch {
      if (v.muted) {
        setProg(null)
        setErr('Playback failed: the browser refused to play this video.')
        return
      }
      v.muted = true
      audioTracks = []
      note = 'The browser blocked audio playback, so the output has no sound. Click Convert again.'
      try {
        await v.play()
      } catch (e) {
        setProg(null)
        setErr(`Playback failed: ${(e as Error).message}`)
        return
      }
    }
    setWarn(note)

    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const stream = c.captureStream(s.fps)
    audioTracks.forEach((t) => stream.addTrack(t))
    const rec = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: kbps * 1000, audioBitsPerSecond: s.audioKbps * 1000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const finished = new Promise<void>((r) => (rec.onstop = () => r()))
    let cancelled = false
    let raf = 0
    const end = () => {
      cancelAnimationFrame(raf)
      v.pause()
      if (rec.state === 'recording') rec.stop()
    }
    const draw = () => {
      g.fillStyle = s.bg
      g.fillRect(0, 0, W, H)
      const [x, y, w, h] = placeRect(v.videoWidth, v.videoHeight, W, H, s.fit)
      g.drawImage(v, x, y, w, h)
      setProg(Math.min(1, (v.currentTime - t0) / (secs || 1)))
      if (v.currentTime >= t1 || v.ended) return end()
      raf = requestAnimationFrame(draw)
    }
    stop.current = () => {
      cancelled = true
      end()
    }
    v.onended = end
    rec.start(500)
    draw()
    await finished
    stream.getTracks().forEach((t) => t.stop())
    void ac?.close()
    setProg(null)
    if (cancelled) return
    const blob = new Blob(chunks, { type: codec.split(';')[0] })
    if (!blob.size) {
      setErr('The encoder produced no data. Try another codec (VP8 is the most compatible).')
      return
    }
    setOut({ url: URL.createObjectURL(blob), blob, mime: codec, w: W, h: H, secs, ms: performance.now() - started })
  }

  const busy = prog !== null
  const outName = src ? `${src.name.replace(/\.[^.]+$/, '')}_${H}p.${extOf(codec)}` : 'video.webm'

  return (
    <Split>
      <div>
        <Panel title="Source video" actions={<Btn kind="ghost" onClick={() => void demo()} disabled={busy || !!msg}>Demo clip</Btn>}>
          <FileDrop accept="video/*,.mkv,.mov" onFiles={(f) => void load(f[0], f[0].name)} label="Drop MP4, WebM or MOV" />
          {!hasRecorder && <Note tone="err">This browser has no MediaRecorder, so it cannot encode video. Use a recent Chrome, Edge, Firefox or Safari.</Note>}
          {msg && <Tip>{msg}</Tip>}
          {err && <Note tone="err">{err}</Note>}
          {warn && <Note tone="warn">{warn}</Note>}
          {src && (
            <>
              <video src={src.url} controls muted playsInline style={{ width: '100%', borderRadius: 8, marginTop: 10, background: '#000', maxHeight: 260 }} />
              <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                <b>{src.name}</b> · {src.w}×{src.h} · {clock(src.dur)} · {mb(src.size)} · {Math.round((src.size * 8) / (src.dur || 1) / 1000)} kbps avg
              </p>
            </>
          )}
        </Panel>
        <Panel title="Output settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map(([l, p]) => (
              <Btn key={l} kind="ghost" onClick={() => set(p)}>{l}</Btn>
            ))}
          </Row>
          <Select label="Container · codec" value={codec} onChange={(c) => set({ codec: c })} options={avail.length ? avail : [['', 'No supported encoder']]} />
          <Row>
            <Select label="Resolution" value={s.height} onChange={(height) => set({ height })} options={[[0, 'Source'], [2160, '2160p'], [1440, '1440p'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p'], [240, '240p']]} />
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[15, '15 fps'], [24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [60, '60 fps']]} />
          </Row>
          <Row>
            <Select label="Aspect" value={s.aspect} onChange={(aspect) => set({ aspect })} options={[['orig', 'Original'], ['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5']]} />
            <Select label="Fit" value={s.fit} onChange={(fit) => set({ fit })} options={[['contain', 'Letterbox'], ['cover', 'Crop to fill']]} />
          </Row>
          <Check label="Automatic video bitrate" value={s.autoKbps} onChange={(autoKbps) => set({ autoKbps })} />
          <Row>
            {!s.autoKbps && <Num label="Video bitrate" value={s.kbps} onChange={(v) => set({ kbps: v })} unit="kbps" min={50} />}
            {s.audio && <Num label="Audio bitrate" value={s.audioKbps} onChange={(audioKbps) => set({ audioKbps })} unit="kbps" min={16} max={512} />}
          </Row>
          <Check label="Keep audio" value={s.audio} onChange={(audio) => set({ audio })} />
          <div className="k-label" style={{ margin: '10px 0 4px', fontWeight: 650, fontSize: 13 }}>Trim</div>
          <Row>
            <Num label="Start" value={s.start} onChange={(start) => set({ start })} unit="s" min={0} />
            <Num label="End (0 = to the end)" value={s.end} onChange={(end) => set({ end })} unit="s" min={0} />
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Output frame" value={W ? `${W}×${H}` : '—'} sub={`${s.fps} fps`} />
          <Stat label="Duration" value={clock(secs)} sub={t0 > 0 || t1 < (src?.dur ?? 0) ? 'trimmed' : 'full clip'} />
          <Stat label="Bitrate" value={`${kbps} kbps`} sub={s.audio ? `+ ${s.audioKbps} audio` : 'no audio'} />
          <Stat label="Estimated size" value={mb(est)} tone="accent" sub={src ? `${est > src.size ? '+' : ''}${pct(est / src.size - 1, 0)} vs source` : ''} />
        </Stats>
        <Panel
          title="Convert"
          actions={busy ? <Btn kind="danger" onClick={() => stop.current()}>Cancel</Btn> : <Btn kind="primary" onClick={() => void convert()} disabled={!src || !codec}>▶ Convert</Btn>}
        >
          {busy ? (
            <>
              <Bar value={prog ?? 0} />
              <p className="muted" style={{ fontSize: 13 }}>Encoding in real time… {pct(prog ?? 0, 0)} · keep this tab visible (background tabs are throttled).</p>
            </>
          ) : out ? (
            <>
              <video src={out.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 360 }} />
              <Table
                head={['', 'Source', 'Output']}
                rows={[
                  ['Format', src?.name.split('.').pop()?.toUpperCase() ?? '', CODECS.find(([m]) => m === out.mime)?.[1] ?? out.mime],
                  ['Frame', `${src?.w}×${src?.h}`, `${out.w}×${out.h}`],
                  ['Size', mb(src?.size ?? 0), mb(out.blob.size)],
                  ['Avg bitrate', `${Math.round(((src?.size ?? 0) * 8) / (src?.dur || 1) / 1000)} kbps`, `${Math.round((out.blob.size * 8) / (out.secs || 1) / 1000)} kbps`],
                  ['Time taken', '', `${(out.ms / 1000).toFixed(1)} s`],
                ]}
              />
              <Row>
                <Btn kind="primary" onClick={() => download(outName, out.blob)}>⬇ Download {outName}</Btn>
              </Row>
            </>
          ) : (
            <Tip>Pick a preset or tune the settings, then press <b>Convert</b>. The video is played once and re-encoded by your browser's built-in encoder; nothing is uploaded.</Tip>
          )}
        </Panel>
        <Panel title="Encoders in this browser">
          <Table head={['Container · codec', 'Encode']} rows={CODECS.map(([m, l]) => [l, supported(m) ? <b key="y" style={{ color: 'var(--ok)' }}>✓ yes</b> : <span key="n" className="muted">✕ no</span>])} />
          <Tip>Conversion runs at playback speed (a 1-minute clip takes about a minute). MP4 output needs Chrome/Edge 126+ or Safari. MOV input works when it contains H.264.</Tip>
        </Panel>
      </div>
    </Split>
  )
}
