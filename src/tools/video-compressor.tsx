import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { autoHeight, bpp, grade, kbpsForCrf, kbpsForTarget, LADDER, scaleTo, sizeFor } from './lib/video-compressor'

type Mode = 'target' | 'quality'
interface State {
  mode: Mode
  targetMB: number
  crf: number
  height: number // 0 = auto
  fps: number
  audio: boolean
  audioKbps: number
  codec: string
}
const DEF: State = { mode: 'target', targetMB: 10, crf: 28, height: 0, fps: 30, audio: true, audioKbps: 96, codec: 'video/webm;codecs=vp9,opus' }

const TARGETS: [string, number][] = [['Discord (free) 10 MB', 10], ['WhatsApp 16 MB', 16], ['Outlook 20 MB', 20], ['Gmail 25 MB', 25], ['Messenger 25 MB', 25], ['Telegram bot 50 MB', 50]]
const CODECS: [string, string][] = [
  ['video/webm;codecs=vp9,opus', 'WebM · VP9 (best compression)'],
  ['video/webm;codecs=av01,opus', 'WebM · AV1'],
  ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'MP4 · H.264 (plays everywhere)'],
  ['video/webm;codecs=vp8,opus', 'WebM · VP8 (most compatible WebM)'],
]
const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window
const supported = (t: string) => hasRecorder && MediaRecorder.isTypeSupported(t)
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

interface Src { name: string; url: string; size: number; w: number; h: number; dur: number }
interface Out { url: string; blob: Blob; w: number; h: number; kbps: number; ms: number; ext: string }

async function makeDemo(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = 720
  const g = c.getContext('2d')!
  // Film-grain texture makes the clip as hard to compress as real camera footage.
  const noise = document.createElement('canvas')
  noise.width = 320
  noise.height = 180
  const ng = noise.getContext('2d')!
  const img = ng.createImageData(320, 180)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data.set([v, v, v, 34], i)
  }
  ng.putImageData(img, 0, 0)
  const stream = c.captureStream(30)
  const mime = ['video/webm;codecs=vp8', 'video/webm'].find(supported) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 25_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  rec.start(250)
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      const grad = g.createLinearGradient(0, 0, 1280, 720)
      grad.addColorStop(0, `hsl(${200 + t * 15} 70% 35%)`)
      grad.addColorStop(1, `hsl(${280 + t * 15} 70% 50%)`)
      g.fillStyle = grad
      g.fillRect(0, 0, 1280, 720)
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `hsl(${i * 40 + t * 80} 85% 62%)`
        g.beginPath()
        g.arc(640 + Math.cos(t * 1.3 + i) * (150 + i * 30), 360 + Math.sin(t * 1.9 + i) * (90 + i * 18), 30 + i * 4, 0, 7)
        g.fill()
      }
      g.drawImage(noise, (Math.random() * 40) | 0, (Math.random() * 20) | 0, 280, 160, 0, 0, 1280, 720)
      g.fillStyle = '#fff'
      g.font = 'bold 64px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('Demo clip · 720p', 640, 110)
      g.font = '36px ui-monospace, monospace'
      g.fillText(`${t.toFixed(2)} s`, 640, 660)
      if (t < 6) requestAnimationFrame(frame)
      else resolve()
    }
    frame()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
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

export default function VideoCompressor() {
  const [s, set, reset] = useToolState('video-compressor', DEF)
  const [src, setSrc] = useState<Src | null>(null)
  const [out, setOut] = useState<Out | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [fudge, setFudge] = useState(1)
  const stop = useRef<() => void>(() => {})

  const load = async (blob: Blob, name: string) => {
    setErr('')
    setOut(null)
    setFudge(1)
    const url = URL.createObjectURL(blob)
    try {
      setSrc({ name, url, size: blob.size, ...(await probe(url)) })
    } catch (e) {
      setErr(`${name}: ${(e as Error).message}`)
    }
  }
  useEffect(() => {
    if (!hasRecorder) return
    let live = true
    void makeDemo().then((b) => { if (live) void load(b, 'demo-720p.webm') })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const avail = CODECS.filter(([m]) => supported(m))
  const codec = supported(s.codec) ? s.codec : (avail[0]?.[0] ?? '')
  const aK = s.audio ? s.audioKbps : 0
  const dur = src?.dur ?? 0
  const srcKbps = src && dur ? (src.size * 8) / dur / 1000 : 0
  let vK = 0
  let H = 0
  let capped = false
  if (src) {
    if (s.mode === 'target') {
      vK = Math.round(kbpsForTarget(s.targetMB * 1e6, dur, aK) * fudge)
      H = s.height || autoHeight(vK, src.w, src.h, s.fps)
      // Never spend more than the original or than “visually lossless” needs.
      const [cw, ch] = scaleTo(src.w, src.h, H)
      const cap = Math.min(kbpsForCrf(20, cw, ch, s.fps), Math.max(100, srcKbps * 0.85 - aK))
      if (vK > cap) {
        vK = Math.round(cap)
        capped = true
      }
    } else {
      H = s.height || Math.min(src.h, 720)
    }
  }
  const [W, Hh] = src ? scaleTo(src.w, src.h, H || src.h) : [0, 0]
  if (src && s.mode === 'quality') vK = kbpsForCrf(s.crf, W, Hh, s.fps)
  const est = sizeFor(vK, aK, dur)
  const b = bpp(vK, W, Hh, s.fps)
  const [gLabel, gTone] = grade(b)
  const tooSmall = s.mode === 'target' && src && vK < 60
  const ext = codec.includes('mp4') ? 'mp4' : 'webm'

  const compress = async () => {
    if (!src || !codec || vK <= 0) return
    setErr('')
    setOut(null)
    setProg(0)
    const started = performance.now()
    const v = document.createElement('video')
    v.src = src.url
    v.playsInline = true
    await new Promise((r) => (v.onloadeddata = r))
    let ac: AudioContext | null = null
    let tracks: MediaStreamTrack[] = []
    if (s.audio) {
      try {
        ac = new AudioContext()
        await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 400))])
        if (ac.state !== 'running') throw new Error('suspended')
        const dest = ac.createMediaStreamDestination()
        ac.createMediaElementSource(v).connect(dest)
        tracks = dest.stream.getAudioTracks()
      } catch {
        void ac?.close()
        ac = null
      }
    }
    v.muted = !tracks.length
    setNote(s.audio && !tracks.length ? 'Audio could not be captured in this browser session, so the result is silent.' : '')
    try {
      await v.play()
    } catch (e) {
      setProg(null)
      setErr(`Playback failed: ${(e as Error).message}`)
      return
    }
    const c = document.createElement('canvas')
    c.width = W
    c.height = Hh
    const g = c.getContext('2d')!
    const stream = c.captureStream(s.fps)
    tracks.forEach((t) => stream.addTrack(t))
    const rec = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: vK * 1000, audioBitsPerSecond: Math.max(aK, 8) * 1000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const finished = new Promise<void>((r) => (rec.onstop = () => r()))
    let cancelled = false
    let raf = 0
    const end = () => {
      cancelAnimationFrame(raf)
      v.pause()
      if (rec.state === 'recording') rec.stop()
    }
    const draw = () => {
      g.drawImage(v, 0, 0, W, Hh)
      setProg(Math.min(1, v.currentTime / (dur || 1)))
      if (v.ended || v.currentTime >= dur) return end()
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
    if (!blob.size) return setErr('The encoder produced no data. Try another codec.')
    setOut({ url: URL.createObjectURL(blob), blob, w: W, h: Hh, kbps: vK, ms: performance.now() - started, ext })
  }

  const busy = prog !== null
  const target = s.targetMB * 1e6
  const over = out && s.mode === 'target' && out.blob.size > target

  return (
    <Split>
      <div>
        <Panel title="Video" actions={<Btn kind="ghost" disabled={busy || !hasRecorder} onClick={() => void makeDemo().then((b) => load(b, 'demo-720p.webm'))}>Demo clip</Btn>}>
          <FileDrop accept="video/*,.mov,.mkv" onFiles={(f) => void load(f[0], f[0].name)} label="Drop an MP4, MOV or WebM video" />
          {!hasRecorder && <Note tone="err">This browser has no MediaRecorder, so it cannot re-encode video. Use a recent Chrome, Edge, Firefox or Safari.</Note>}
          {!src && hasRecorder && !err && <p className="muted">Recording a 6-second demo clip…</p>}
          {err && <Note tone="err">{err}</Note>}
          {src && (
            <>
              <video src={src.url} controls muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000', marginTop: 8 }} />
              <Table head={['File', 'Resolution', 'Length', 'Size', 'Bitrate']} rows={[[src.name, `${src.w}×${src.h}`, clock(dur), fmtBytes(src.size), `${Math.round(srcKbps)} kbps`]]} />
            </>
          )}
        </Panel>
        <Panel title="Compression" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode: Mode) => set({ mode })} options={[['target', 'Target file size'], ['quality', 'Constant quality (CRF)']]} />
          <div style={{ height: 10 }} />
          {s.mode === 'target' ? (
            <>
              <Num label="Target size" value={s.targetMB} onChange={(targetMB) => { set({ targetMB }); setFudge(1) }} unit="MB" min={0.5} max={4000} />
              <Row>
                {TARGETS.map(([n, mb]) => (
                  <Btn key={n} kind={s.targetMB === mb ? 'primary' : 'normal'} onClick={() => { set({ targetMB: mb }); setFudge(1) }}>{n}</Btn>
                ))}
              </Row>
            </>
          ) : (
            <Slider label="CRF" value={s.crf} onChange={(crf) => set({ crf })} min={18} max={40} show={(v) => `${v} · ${v <= 21 ? 'near-lossless' : v <= 26 ? 'high quality' : v <= 31 ? 'balanced' : 'small file'}`} />
          )}
          <Row>
            <Select label="Resolution" value={s.height} onChange={(height) => set({ height })} options={[[0, 'Auto'], ...LADDER.filter((h) => !src || h <= src.h).map((h) => [h, `${h}p`] as [number, string])]} />
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[60, '60 fps'], [30, '30 fps'], [24, '24 fps'], [15, '15 fps']]} />
          </Row>
          <Row>
            <Check label="Keep audio" value={s.audio} onChange={(audio) => set({ audio })} />
            {s.audio && <Select label="Audio bitrate" value={s.audioKbps} onChange={(audioKbps) => set({ audioKbps })} options={[[160, '160 kbps'], [128, '128 kbps'], [96, '96 kbps'], [64, '64 kbps (voice)'], [32, '32 kbps (speech only)']]} />}
          </Row>
          <Select label="Codec" value={codec} onChange={(c: string) => set({ codec: c })} options={avail.length ? avail : [['', 'No encoder available']]} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated size" value={src ? fmtBytes(Math.round(est)) : '—'} sub={src ? (est < src.size ? `${Math.round((1 - est / src.size) * 100)}% smaller than the original` : `${Math.round((est / src.size - 1) * 100)}% larger than the original`) : ''} tone="accent" />
          <Stat label="Output" value={src ? `${W}×${Hh}` : '—'} sub={`${s.fps} fps`} />
          <Stat label="Video bitrate" value={`${vK} kbps`} sub={`${aK} kbps audio`} />
          <Stat label="Expected quality" value={src ? gLabel.split(' —')[0] : '—'} sub={`${b.toFixed(3)} bits/pixel`} tone={gTone} />
        </Stats>
        {capped && <Note tone="ok">The {s.targetMB} MB target allows more bitrate than this clip needs, so it is capped at visually lossless quality (≈ CRF 20) and below the original’s bitrate — the file comes out smaller than the target.</Note>}
        {tooSmall && <Note tone="err">The target is too small for a {clock(dur)} clip: even audio barely fits. Raise the target, drop the audio or trim the video first.</Note>}
        {src && !tooSmall && gTone === 'bad' && <Note tone="warn">{gLabel}.</Note>}
        <Panel title="Compress">
          <Row>
            <Btn kind="primary" disabled={!src || !codec || busy || vK <= 0} onClick={() => void compress()}>{busy ? 'Compressing…' : '▶ Compress video'}</Btn>
            {busy && <Btn kind="danger" onClick={() => stop.current()}>Stop</Btn>}
          </Row>
          {busy && (
            <div style={{ marginTop: 10 }}>
              <Bar value={prog ?? 0} />
              <p className="muted">{Math.round((prog ?? 0) * 100)}% · about {clock(dur * (1 - (prog ?? 0)))} left</p>
            </div>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            The browser encoder works in real time: a {clock(dur)} clip takes about {clock(dur)} to compress. Keep this tab visible while it runs.
          </p>
          {note && <Note tone="warn">{note}</Note>}
        </Panel>
        {out && src && (
          <Panel title="Result" actions={<Btn kind="primary" onClick={() => download(`${src.name.replace(/\.[^.]+$/, '')}_${out.h}p_compressed.${out.ext}`, out.blob)}>⬇ Download</Btn>}>
            <video src={out.url} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            <Stats>
              <Stat label="New size" value={fmtBytes(out.blob.size)} tone={over ? 'bad' : 'good'} sub={s.mode === 'target' ? `target ${s.targetMB} MB` : undefined} />
              <Stat label="Saved" value={`${Math.round((1 - out.blob.size / src.size) * 100)}%`} sub={`${(src.size / out.blob.size).toFixed(1)}× smaller`} />
              <Stat label="Real bitrate" value={`${Math.round((out.blob.size * 8) / dur / 1000)} kbps`} sub={`took ${(out.ms / 1000).toFixed(1)} s`} />
            </Stats>
            {over ? (
              <Note tone="warn">
                The encoder overshot the target by {fmtBytes(out.blob.size - target)}.{' '}
                <Btn onClick={() => setFudge(fudge * (target / out.blob.size) * 0.95)}>Lower the bitrate and try again</Btn>
              </Note>
            ) : (
              s.mode === 'target' && <Note tone="ok">Fits the {s.targetMB} MB limit with {fmtBytes(target - out.blob.size)} to spare.</Note>
            )}
          </Panel>
        )}
        <Note>
          How the target works: video bitrate = (target × 8 × 0.96 ÷ duration) − audio bitrate. “Auto” resolution then picks the largest size that still gets ≥ 0.05 bits per pixel, because a tight bitrate looks better at 720p than as a blocky 1080p. CRF mode follows the x264 rule of thumb: +6 CRF ≈ half the bitrate.
        </Note>
      </div>
    </Split>
  )
}
