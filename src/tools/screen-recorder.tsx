import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { bytes, clock, extFor, fileName, mbPerMinute, pickMime, rms } from './lib/screen-recorder'

interface State { sysAudio: boolean; mic: boolean; micGain: number; sysGain: number; fps: number; mbps: number; countdown: number; surface: 'monitor' | 'window' | 'browser'; cursor: boolean }
const DEF: State = { sysAudio: true, mic: true, micGain: 1, sysGain: 0.8, fps: 30, mbps: 2.5, countdown: 3, surface: 'monitor', cursor: true }

interface Take { id: string; url: string; blob: Blob; dur: number; name: string; at: Date; audio: string; demo?: boolean }
type Phase = 'idle' | 'count' | 'rec' | 'paused'

const canDisplay = typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices
const now = () => performance.now()
const canRecord = typeof MediaRecorder !== 'undefined'

/** A 4-second synthetic "screen" clip so the takes list is never empty. */
async function demoTake(): Promise<Take | null> {
  if (!canRecord) return null
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 540
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  const draw = () => {
    const t = (performance.now() - t0) / 1000
    g.fillStyle = '#0f172a'
    g.fillRect(0, 0, 960, 540)
    g.fillStyle = '#1e293b'
    g.fillRect(0, 0, 960, 40)
    ;['#ef4444', '#f59e0b', '#10b981'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(24 + i * 22, 20, 7, 0, 7); g.fill() })
    g.fillStyle = '#e2e8f0'
    g.font = '16px ui-monospace, monospace'
    const lines = ['$ npm run build', 'vite v7 building for production…', '✓ 1243 modules transformed.', 'dist/index.html   0.6 kB', 'dist/assets/app.js   212 kB', '✓ built in 3.2s']
    lines.slice(0, Math.min(lines.length, Math.floor(t * 1.8) + 1)).forEach((l, i) => g.fillText(l, 30, 90 + i * 28))
    const x = 300 + Math.cos(t * 1.6) * 220, y = 330 + Math.sin(t * 2.1) * 110
    g.fillStyle = '#fff'
    g.beginPath()
    g.moveTo(x, y); g.lineTo(x, y + 22); g.lineTo(x + 6, y + 16); g.lineTo(x + 15, y + 16); g.closePath(); g.fill()
    g.fillStyle = '#6366f1'
    g.fillRect(30, 480, 900 * Math.min(1, t / 4), 10)
  }
  draw()
  rec.start(500)
  const tm = setInterval(draw, 33)
  await new Promise((r) => setTimeout(r, 4000))
  clearInterval(tm)
  rec.stop()
  await done
  const blob = new Blob(parts, { type: rec.mimeType || 'video/webm' })
  return { id: uid(), url: URL.createObjectURL(blob), blob, dur: 4, name: 'demo-terminal.' + extFor(blob.type), at: new Date(), audio: 'none', demo: true }
}

export default function ScreenRecorder() {
  const [s, set, reset] = useToolState('screen-recorder', DEF)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [size, setSize] = useState(0)
  const [level, setLevel] = useState(0)
  const [takes, setTakes] = useState<Take[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [audioKind, setAudioKind] = useState('')
  const [demoing, setDemoing] = useState(canRecord)
  const live = useRef<HTMLVideoElement>(null)
  const r = useRef<{ rec?: MediaRecorder; streams: MediaStream[]; ac?: AudioContext; micG?: GainNode; sysG?: GainNode; an?: AnalyserNode; acc: number; since: number; parts: Blob[]; raf: number; audio: string }>({ streams: [], acc: 0, since: 0, parts: [], raf: 0, audio: '' })

  useEffect(() => {
    let on = true
    void demoTake().then((t) => {
      if (on) setDemoing(false)
      if (on && t) {
        setTakes((cur) => (cur.length ? cur : [t]))
        setSel((cur) => cur ?? t.id)
      }
    })
    return () => { on = false }
  }, [])

  // Live gain changes while recording.
  useEffect(() => {
    if (r.current.micG) r.current.micG.gain.value = s.micGain
    if (r.current.sysG) r.current.sysG.gain.value = s.sysGain
  }, [s.micGain, s.sysGain])

  // Recording clock + level meter.
  useEffect(() => {
    if (phase !== 'rec' && phase !== 'paused') return
    const buf = new Uint8Array(1024)
    const tick = () => {
      const st = r.current
      setElapsed(st.acc + (phase === 'rec' ? (now() - st.since) / 1000 : 0))
      if (st.an) { st.an.getByteTimeDomainData(buf); setLevel(rms(buf)) }
      st.raf = requestAnimationFrame(tick)
    }
    tick()
    const st = r.current
    return () => cancelAnimationFrame(st.raf)
  }, [phase])

  const cleanup = () => {
    const st = r.current
    st.streams.forEach((x) => x.getTracks().forEach((t) => t.stop()))
    st.streams = []
    void st.ac?.close()
    st.ac = st.micG = st.sysG = st.an = undefined
    if (live.current) live.current.srcObject = null
    setLevel(0)
  }

  const start = async () => {
    setErr('')
    const st = r.current
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: s.fps, displaySurface: s.surface, cursor: s.cursor ? 'always' : 'never' } as MediaTrackConstraints,
        audio: s.sysAudio,
      })
      st.streams = [display]
      let mic: MediaStream | null = null
      if (s.mic) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          st.streams.push(mic)
        } catch {
          setErr('Microphone access was denied, so this recording has no voice track.')
        }
      }
      const sys = display.getAudioTracks()
      const tracks = [...display.getVideoTracks()]
      const kinds: string[] = []
      if (sys.length || mic) {
        const ac = new AudioContext()
        const dest = ac.createMediaStreamDestination()
        const an = ac.createAnalyser()
        an.fftSize = 1024
        if (sys.length) {
          st.sysG = ac.createGain()
          st.sysG.gain.value = s.sysGain
          ac.createMediaStreamSource(new MediaStream(sys)).connect(st.sysG).connect(dest)
          st.sysG.connect(an)
          kinds.push('system')
        }
        if (mic) {
          st.micG = ac.createGain()
          st.micG.gain.value = s.micGain
          ac.createMediaStreamSource(mic).connect(st.micG).connect(dest)
          st.micG.connect(an)
          kinds.push('mic')
        }
        st.ac = ac
        st.an = an
        tracks.push(...dest.stream.getAudioTracks())
      }
      if (s.sysAudio && !sys.length) setErr((e) => e || 'No system/tab audio was shared. In Chrome, tick “Share audio” in the picker (tab audio works everywhere; full-screen audio on Windows and ChromeOS).')
      st.audio = kinds.join(' + ') || 'none'
      setAudioKind(st.audio)
      if (live.current) live.current.srcObject = display
      display.getVideoTracks()[0].addEventListener('ended', () => stop())

      for (let i = s.countdown; i > 0; i--) {
        setPhase('count')
        setCount(i)
        await new Promise((ok) => setTimeout(ok, 1000))
        if (!st.streams.length) return setPhase('idle') // stopped during countdown
      }
      const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(new MediaStream(tracks), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: s.mbps * 1e6, audioBitsPerSecond: 128000 })
      st.parts = []
      st.acc = 0
      setSize(0)
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          st.parts.push(e.data)
          setSize((x) => x + e.data.size)
        }
      }
      rec.onstop = () => {
        const blob = new Blob(st.parts, { type: rec.mimeType || 'video/webm' })
        const dur = st.acc
        const t: Take = { id: uid(), url: URL.createObjectURL(blob), blob, dur, name: fileName(new Date(), extFor(blob.type)), at: new Date(), audio: st.audio }
        setTakes((cur) => [t, ...cur])
        setSel(t.id)
        cleanup()
        setPhase('idle')
      }
      st.rec = rec
      st.since = now()
      rec.start(1000)
      setPhase('rec')
    } catch (e) {
      cleanup()
      setPhase('idle')
      const n = (e as Error).name
      setErr(n === 'NotAllowedError' ? 'Screen sharing was cancelled or blocked.' : `Could not start: ${(e as Error).message}`)
    }
  }

  const stop = () => {
    const st = r.current
    if (!st.rec || st.rec.state === 'inactive') return cleanup()
    if (st.rec.state === 'recording') st.acc += (now() - st.since) / 1000
    st.rec.stop()
  }
  const pause = () => {
    const st = r.current
    if (!st.rec) return
    if (st.rec.state === 'recording') {
      st.rec.pause()
      st.acc += (now() - st.since) / 1000
      setPhase('paused')
    } else if (st.rec.state === 'paused') {
      st.rec.resume()
      st.since = now()
      setPhase('rec')
    }
  }

  const cur = takes.find((t) => t.id === sel) ?? takes[0]
  const busy = phase !== 'idle'
  const est = mbPerMinute(s.mbps, s.sysAudio || s.mic ? 128 : 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Sources" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Suggest in picker" value={s.surface} onChange={(surface) => set({ surface })} options={[['monitor', 'Entire screen'], ['window', 'A window'], ['browser', 'A browser tab']]} />
          <Check label="System / tab audio" value={s.sysAudio} onChange={(sysAudio) => set({ sysAudio })} />
          {s.sysAudio && <Slider label="System volume" value={s.sysGain} onChange={(sysGain) => set({ sysGain })} min={0} max={2} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          <Check label="Microphone (voice-over)" value={s.mic} onChange={(mic) => set({ mic })} />
          {s.mic && <Slider label="Mic volume" value={s.micGain} onChange={(micGain) => set({ micGain })} min={0} max={3} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
          <Check label="Show mouse cursor" value={s.cursor} onChange={(cursor) => set({ cursor })} />
        </Panel>
        <Panel title="Quality">
          <Row>
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[15, '15 fps (slides)'], [24, '24 fps'], [30, '30 fps'], [60, '60 fps (games)']]} />
            <Select label="Video bitrate" value={s.mbps} onChange={(mbps) => set({ mbps })} options={[[1, '1 Mbps · small'], [2.5, '2.5 Mbps · standard'], [5, '5 Mbps · sharp text'], [8, '8 Mbps · high']]} />
          </Row>
          <Select label="Countdown" value={s.countdown} onChange={(countdown) => set({ countdown })} options={[[0, 'None'], [3, '3 seconds'], [5, '5 seconds'], [10, '10 seconds']]} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>About <b>{est.toFixed(0)} MB per minute</b>. Output is WebM (VP9/VP8 + Opus) where supported.</p>
        </Panel>
      </div>
      <div>
        {!canDisplay && <Note tone="warn">This browser cannot capture the screen (mobile browsers and some embedded views lack <code>getDisplayMedia</code>). Open this page in desktop Chrome, Edge or Firefox. The demo take below still shows how results look.</Note>}
        <Stats>
          <Stat label="Status" value={phase === 'rec' ? '● REC' : phase === 'paused' ? 'Paused' : phase === 'count' ? `Starting in ${count}` : 'Ready'} tone={phase === 'rec' ? 'bad' : phase === 'idle' ? 'good' : 'accent'} />
          <Stat label="Time" value={clock(busy ? elapsed : 0)} />
          <Stat label="File size" value={bytes(busy ? size : 0)} sub={busy ? `audio: ${audioKind}` : 'live while recording'} />
        </Stats>
        <Panel title="Recorder" actions={
          phase === 'idle'
            ? <Btn kind="primary" onClick={() => void start()} disabled={!canDisplay || !canRecord}>● Start recording</Btn>
            : <><Btn onClick={pause} disabled={phase === 'count'}>{phase === 'paused' ? '▶ Resume' : '❚❚ Pause'}</Btn><Btn kind="danger" onClick={stop}>■ Stop</Btn></>
        }>
          {err && <Note tone="warn">{err}</Note>}
          <div style={{ position: 'relative', background: '#0b1020', borderRadius: 8, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <video ref={live} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: busy ? 'block' : 'none' }} />
            {!busy && <p style={{ color: '#cbd5e1', textAlign: 'center', padding: 20 }}>Press <b>Start recording</b>, then pick a screen, window or tab.<br />The live preview appears here.</p>}
            {phase === 'count' && <span style={{ position: 'absolute', fontSize: 96, fontWeight: 800, color: '#fff', textShadow: '0 4px 20px #000' }}>{count}</span>}
          </div>
          {busy && audioKind !== 'none' && <div style={{ marginTop: 10 }}><span className="muted" style={{ fontSize: 13 }}>Audio level</span><Bar value={Math.min(1, level * 3)} color={level > 0.3 ? 'var(--err)' : 'var(--ok)'} /></div>}
        </Panel>
        <Panel title={`Takes (${takes.length})`}>
          {cur ? (
            <>
              <video key={cur.id} src={cur.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 360 }} />
              <Table
                head={['Name', 'Length', 'Size', 'Audio', '']}
                rows={takes.map((t) => [
                  <button key="n" type="button" onClick={() => setSel(t.id)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: t.id === cur.id ? 'var(--accent)' : 'inherit', fontWeight: t.id === cur.id ? 700 : 400, cursor: 'pointer', textAlign: 'left' }}>{t.name}{t.demo ? ' (demo)' : ''}</button>,
                  clock(t.dur),
                  bytes(t.blob.size),
                  t.audio,
                  <span key="a" style={{ whiteSpace: 'nowrap' }}>
                    <Btn kind="ghost" onClick={() => download(t.name, t.blob)} title="Download">⬇</Btn>
                    <Btn kind="ghost" onClick={() => { URL.revokeObjectURL(t.url); setTakes((x) => x.filter((y) => y.id !== t.id)) }} title="Delete">✕</Btn>
                  </span>,
                ])}
              />
            </>
          ) : <p className="muted">{demoing ? 'Recording a 4-second demo take so you can see how results look…' : 'No takes yet.'}</p>}
          <p className="muted" style={{ fontSize: 13 }}>Takes live in this tab's memory only. Download the ones you want to keep before closing the page. Nothing is uploaded.</p>
        </Panel>
      </div>
    </Split>
  )
}
