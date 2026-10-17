import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'

const CODECS: [string, string][] = [
  ['video/webm;codecs=vp9,opus', 'WebM · VP9 + Opus (best quality/size)'],
  ['video/webm;codecs=vp8,opus', 'WebM · VP8 + Opus (most compatible WebM)'],
  ['video/webm;codecs=av1,opus', 'WebM · AV1 + Opus (smallest, slow)'],
  ['video/webm;codecs=h264,opus', 'WebM · H.264 + Opus'],
  ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'MP4 · H.264 + AAC (Safari / plays everywhere)'],
  ['video/mp4', 'MP4 · browser default'],
  ['video/webm', 'WebM · browser default'],
]
const RES: [string, string][] = [['640x360', '360p'], ['854x480', '480p'], ['1280x720', '720p HD'], ['1920x1080', '1080p Full HD']]
const DEF = { codec: CODECS[0][0], res: '1280x720', fps: 30, kbps: 2500, mirror: true, stamp: false, caption: '', countdown: true, maxSec: 120, notes: 'Hi team! Quick update on the launch:\n• Beta is live for 200 users\n• Feedback so far is positive\n• Next step: pricing page\nThanks, talk soon!' }

interface Take { id: number; url: string; size: number; dur: number; type: string; at: string }
type Source = 'none' | 'camera' | 'demo'

const supported = () => (typeof MediaRecorder === 'undefined' ? [] : CODECS.filter(([m]) => MediaRecorder.isTypeSupported(m)))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const mb = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(2)} MB`)

export default function WebcamRecorder() {
  const [s, set] = useToolState('webcam-recorder', DEF)
  const [src, setSrc] = useState<Source>('none')
  const [err, setErr] = useState('')
  const [devs, setDevs] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] })
  const [cam, setCam] = useState('')
  const [mic, setMic] = useState('')
  const [state, setState] = useState<'idle' | 'count' | 'rec' | 'paused'>('idle')
  const [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [takes, setTakes] = useState<Take[]>([])
  const [play, setPlay] = useState<Take | null>(null)
  const [prompter, setPrompter] = useState(false)
  const codecs = supported()

  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<{ ctx: AudioContext; an: AnalyserNode; dest: MediaStreamAudioDestinationNode; stop: () => void } | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const t0 = useRef(0)
  const acc = useRef(0)
  const opts = useRef(s)
  opts.current = s
  const srcRef = useRef(src)
  srcRef.current = src
  const [w, h] = s.res.split('x').map(Number)

  const stopSource = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    audio.current?.stop()
    audio.current = null
  }

  const startAudio = (ms: MediaStream | null) => {
    const ctx = new AudioContext()
    const an = ctx.createAnalyser()
    an.fftSize = 512
    const dest = ctx.createMediaStreamDestination()
    let stopExtra = () => {}
    if (ms && ms.getAudioTracks().length) {
      ctx.createMediaStreamSource(ms).connect(an)
    } else {
      // demo: a soft two-tone chime every second
      const g = ctx.createGain()
      g.gain.value = 0
      const o = ctx.createOscillator()
      o.frequency.value = 440
      o.connect(g)
      o.start()
      g.connect(an)
      const iv = setInterval(() => {
        const t = ctx.currentTime
        o.frequency.setValueAtTime(o.frequency.value === 440 ? 660 : 440, t)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.15, t + 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      }, 1000)
      stopExtra = () => { clearInterval(iv); o.stop() }
    }
    an.connect(dest)
    audio.current = { ctx, an, dest, stop: () => { stopExtra(); void ctx.close() } }
  }

  const startCamera = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Camera access is not available here (needs HTTPS and a modern browser). Try the demo source.')
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: s.fps }, ...(cam ? { deviceId: { exact: cam } } : {}) },
        audio: { echoCancellation: true, noiseSuppression: true, ...(mic ? { deviceId: { exact: mic } } : {}) },
      })
      stopSource()
      stream.current = ms
      if (video.current) { video.current.srcObject = ms; void video.current.play() }
      startAudio(ms)
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevs({ cams: all.filter((d) => d.kind === 'videoinput'), mics: all.filter((d) => d.kind === 'audioinput') })
      setSrc('camera')
    } catch (e) {
      setErr(`Could not open the camera: ${(e as Error).message}. Check the browser permission prompt, or use the demo source.`)
    }
  }

  const startDemo = () => {
    stopSource()
    if (video.current) video.current.srcObject = null
    startAudio(null)
    setSrc('demo')
  }

  // Draw loop: camera/demo → canvas (mirror, timestamp, caption) and audio meter.
  useEffect(() => {
    let raf = 0
    const buf = new Uint8Array(256)
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const c = canvas.current
      if (!c) return
      const g = c.getContext('2d')!
      const o = opts.current
      const W = c.width, H = c.height
      const v = video.current
      g.save()
      if (srcRef.current === 'camera' && v && v.readyState >= 2) {
        if (o.mirror) { g.translate(W, 0); g.scale(-1, 1) }
        const k = Math.max(W / v.videoWidth, H / v.videoHeight)
        g.drawImage(v, (W - v.videoWidth * k) / 2, (H - v.videoHeight * k) / 2, v.videoWidth * k, v.videoHeight * k)
      } else {
        const t = performance.now() / 1000
        const grd = g.createLinearGradient(0, 0, W, H)
        grd.addColorStop(0, `hsl(${(t * 20) % 360},60%,35%)`)
        grd.addColorStop(1, `hsl(${(t * 20 + 120) % 360},60%,22%)`)
        g.fillStyle = grd
        g.fillRect(0, 0, W, H)
        g.fillStyle = 'rgba(255,255,255,.9)'
        g.beginPath()
        g.arc(W / 2 + Math.sin(t) * W * 0.25, H / 2 + Math.cos(t * 1.3) * H * 0.18, H * 0.12, 0, 7)
        g.fill()
        g.font = `bold ${H * 0.06}px system-ui`
        g.textAlign = 'center'
        g.fillText(srcRef.current === 'demo' ? 'Demo source — no camera needed' : 'Start the camera or the demo', W / 2, H * 0.14)
      }
      g.restore()
      g.textAlign = 'left'
      if (o.stamp) {
        g.font = `600 ${H * 0.035}px ui-monospace, monospace`
        const txt = new Date().toLocaleString('en-GB')
        g.fillStyle = 'rgba(0,0,0,.5)'
        g.fillRect(W * 0.02, H * 0.03, g.measureText(txt).width + H * 0.04, H * 0.06)
        g.fillStyle = '#fff'
        g.fillText(txt, W * 0.02 + H * 0.02, H * 0.075)
      }
      if (o.caption) {
        g.font = `700 ${H * 0.05}px system-ui`
        const tw = g.measureText(o.caption).width
        g.fillStyle = 'rgba(15,23,42,.75)'
        g.fillRect(W * 0.04, H * 0.82, tw + H * 0.06, H * 0.1)
        g.fillStyle = '#fff'
        g.fillText(o.caption, W * 0.04 + H * 0.03, H * 0.89)
      }
      const a = audio.current
      if (a) {
        a.an.getByteTimeDomainData(buf)
        let sum = 0
        for (const x of buf) sum += ((x - 128) / 128) ** 2
        const lv = Math.round(Math.min(1, Math.sqrt(sum / buf.length) * 4) * 40) / 40
        setLevel((p) => (p === lv ? p : lv))
      }
      if (rec.current?.state === 'recording') {
        const sec = acc.current + (performance.now() - t0.current) / 1000
        setElapsed(sec)
        if (sec >= o.maxSec) rec.current.stop()
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    startAudio(null)
    srcRef.current = 'demo'
    const t = setTimeout(() => setSrc('demo'), 0)
    return () => { clearTimeout(t); stopSource(); rec.current?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const begin = () => {
    const c = canvas.current
    if (!c || !audio.current) return
    const vs = c.captureStream(s.fps)
    const live = audio.current.ctx.state === 'running' // a suspended context would stall the recorder
    const ms = new MediaStream([...vs.getVideoTracks(), ...(live ? audio.current.dest.stream.getAudioTracks() : [])])
    if (!live) setErr('Audio is blocked by the browser for this take — recording video only.')
    const mime = codecs.find(([m]) => m === s.codec)?.[0] ?? codecs[0]?.[0] ?? ''
    let r: MediaRecorder
    try {
      r = new MediaRecorder(ms, { mimeType: mime || undefined, videoBitsPerSecond: s.kbps * 1000, audioBitsPerSecond: 128000 })
    } catch (e) {
      setErr(`Recorder failed: ${(e as Error).message}`)
      setState('idle')
      return
    }
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      vs.getTracks().forEach((t) => t.stop())
      const type = r.mimeType || mime || 'video/webm'
      const blob = new Blob(chunks.current, { type })
      const dur = acc.current + (r.state === 'inactive' && t0.current ? (performance.now() - t0.current) / 1000 : 0)
      const take: Take = { id: Date.now(), url: URL.createObjectURL(blob), size: blob.size, dur: Math.min(dur, opts.current.maxSec), type, at: new Date().toLocaleTimeString('en-GB') }
      setTakes((ts) => [take, ...ts])
      setPlay(take)
      setState('idle')
      rec.current = null
    }
    acc.current = 0
    t0.current = performance.now()
    r.start(500)
    rec.current = r
    setElapsed(0)
    setState('rec')
  }

  const record = () => {
    if (src === 'none') return setErr('Start the camera or the demo source first.')
    setErr('')
    void audio.current?.ctx.resume().catch(() => {})
    if (!s.countdown) return void setTimeout(begin, 50)
    setState('count')
    let n = 3
    setCount(n)
    const iv = setInterval(() => {
      n--
      setCount(n)
      if (n <= 0) { clearInterval(iv); begin() }
    }, 1000)
  }
  const pause = () => {
    const r = rec.current
    if (!r) return
    if (r.state === 'recording') { r.pause(); acc.current += (performance.now() - t0.current) / 1000; t0.current = 0; setState('paused') }
    else if (r.state === 'paused') { r.resume(); t0.current = performance.now(); setState('rec') }
  }
  const ext = (t: string) => (t.includes('mp4') ? 'mp4' : 'webm')
  const remove = (t: Take) => { URL.revokeObjectURL(t.url); setTakes(takes.filter((x) => x.id !== t.id)); if (play?.id === t.id) setPlay(null) }
  const recording = state === 'rec' || state === 'paused'
  const remaining = Math.max(0, s.maxSec - elapsed)

  return (
    <Split wide="right">
      <div>
        <Panel title="Source">
          <Row>
            <Btn kind="primary" onClick={() => void startCamera()} disabled={recording}>📷 {src === 'camera' ? 'Restart camera' : 'Start camera'}</Btn>
            <Btn onClick={startDemo} disabled={recording}>✨ Demo source</Btn>
          </Row>
          <div style={{ height: 10 }} />
          {devs.cams.length > 1 && <Select label="Camera" value={cam} onChange={setCam} options={[['', 'Default'], ...devs.cams.map((d, i) => [d.deviceId, d.label || `Camera ${i + 1}`] as [string, string])]} />}
          {devs.mics.length > 1 && <Select label="Microphone" value={mic} onChange={setMic} options={[['', 'Default'], ...devs.mics.map((d, i) => [d.deviceId, d.label || `Mic ${i + 1}`] as [string, string])]} />}
          <Row>
            <Select label="Resolution" value={s.res} onChange={(res) => set({ res })} options={RES} />
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[15, '15 fps'], [24, '24 fps'], [30, '30 fps'], [60, '60 fps']]} />
          </Row>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Recording">
          <Select label="Format / codec" value={s.codec} onChange={(codec) => set({ codec })} options={codecs.length ? codecs : [[s.codec, 'MediaRecorder not supported']]} />
          <Select label="Video bitrate" value={s.kbps} onChange={(kbps) => set({ kbps })} options={[[800, '0.8 Mbps · small'], [1500, '1.5 Mbps'], [2500, '2.5 Mbps · balanced'], [5000, '5 Mbps · high'], [8000, '8 Mbps · very high']]} />
          <Select label="Max length" value={s.maxSec} onChange={(maxSec) => set({ maxSec })} options={[[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [900, '15 min']]} />
          <Check label="3-2-1 countdown" value={s.countdown} onChange={(countdown) => set({ countdown })} />
          <Check label="Mirror (selfie view)" value={s.mirror} onChange={(mirror) => set({ mirror })} />
          <Check label="Burn in date & time" value={s.stamp} onChange={(stamp) => set({ stamp })} />
          <Txt label="Lower-third caption" value={s.caption} onChange={(caption) => set({ caption })} placeholder="e.g. Alex · Product update" />
          <p className="k-hint">≈ {mb(((s.kbps + 128) * 1000 * 60) / 8)} per minute at this bitrate.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label={recording ? 'Recording' : 'Status'} value={state === 'count' ? `${count}…` : recording ? mmss(elapsed) : src === 'none' ? 'Off' : 'Ready'} tone={recording ? 'bad' : src !== 'none' ? 'good' : undefined} sub={recording ? `${mmss(remaining)} left` : src === 'demo' ? 'demo source' : ''} />
          <Stat label="Takes" value={takes.length} sub={mb(takes.reduce((a, t) => a + t.size, 0))} />
          <Stat label="Output" value={`${w}×${h}`} sub={`${s.fps} fps · ${ext(s.codec).toUpperCase()}`} />
        </Stats>
        <Panel
          title="Camera"
          actions={
            <>
              {!recording && <Btn kind="danger" onClick={record} disabled={state === 'count' || !codecs.length}>⏺ Record</Btn>}
              {recording && <Btn onClick={pause}>{state === 'paused' ? '▶ Resume' : '⏸ Pause'}</Btn>}
              {recording && <Btn kind="primary" onClick={() => rec.current?.stop()}>⏹ Stop</Btn>}
              <Btn kind="ghost" onClick={() => setPrompter(!prompter)}>📜 Notes</Btn>
            </>
          }
        >
          <div style={{ position: 'relative' }}>
            <canvas ref={canvas} width={w} height={h} style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block', outline: recording ? '3px solid #ef4444' : undefined }} />
            <video ref={video} muted playsInline style={{ display: 'none' }} />
            {state === 'count' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 120, fontWeight: 900, color: '#fff', textShadow: '0 4px 20px #000' }}>{count}</div>}
            {recording && <span style={{ position: 'absolute', top: 12, right: 12, background: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: 99, fontWeight: 700 }}>● {state === 'paused' ? 'PAUSED' : 'REC'} {mmss(elapsed)}</span>}
            {prompter && s.notes && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, maxHeight: '40%', overflow: 'auto', background: 'rgba(0,0,0,.6)', color: '#fff', padding: '10px 16px', fontSize: 18, whiteSpace: 'pre-wrap', borderRadius: '12px 12px 0 0' }}>{s.notes}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>🎙 Level</span>
            <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${level * 100}%`, height: '100%', background: level > 0.85 ? '#ef4444' : level > 0.5 ? '#f59e0b' : '#10b981', transition: 'width .08s' }} />
            </div>
          </div>
          {prompter && <textarea className="k-area" rows={4} value={s.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Speaker notes" style={{ marginTop: 8 }} />}
        </Panel>
        {play && (
          <Panel title={`Playback · take ${play.at}`}>
            <video src={play.url} controls style={{ width: '100%', borderRadius: 12, background: '#000' }} />
            <Row>
              <a className="k-btn primary" href={play.url} download={`video-message-${play.id}.${ext(play.type)}`}>⬇ Download</a>
              <Btn onClick={() => { remove(play); record() }}>↻ Retake</Btn>
              <Btn kind="ghost" onClick={() => remove(play)}>🗑 Discard</Btn>
            </Row>
          </Panel>
        )}
        {takes.length > 0 && (
          <Panel title="Takes this session">
            <Table
              head={['Time', 'Length', 'Size', 'Format', '']}
              rows={takes.map((t) => [
                t.at, mmss(t.dur), mb(t.size), t.type.split(';')[0],
                <Row key="a"><Btn kind="ghost" onClick={() => setPlay(t)}>▶</Btn><a className="k-btn ghost" href={t.url} download={`video-message-${t.id}.${ext(t.type)}`}>⬇</a><Btn kind="ghost" onClick={() => remove(t)}>✕</Btn></Row>,
              ])}
            />
          </Panel>
        )}
        <Note>Recording happens entirely in your browser with MediaRecorder; takes live in memory until you download them or close the tab. WebM files play in Chrome, Firefox, VLC and most editors.</Note>
      </div>
    </Split>
  )
}
