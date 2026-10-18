import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { activeAt, alphaAt, clock, gainAt, outSize, place, timeline, usable, type Fit } from './lib/video-merger'

interface Clip { id: string; name: string; url: string; size: number; w: number; h: number; dur: number; trimIn: number; trimOut: number; vol: number; thumb: string }
interface Out { url: string; blob: Blob; w: number; h: number; secs: number; ext: string; audio: boolean }

const CODECS: [string, string][] = [
  ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'MP4 · H.264 + AAC'],
  ['video/webm;codecs=vp9,opus', 'WebM · VP9 + Opus'],
  ['video/webm;codecs=vp8,opus', 'WebM · VP8 + Opus'],
  ['video/webm;codecs=av01,opus', 'WebM · AV1 + Opus'],
]
const INPUTS: [string, string, string][] = [
  ['video/mp4; codecs="avc1.42E01E"', 'MP4 / H.264', 'video/mp4;codecs=avc1.42E01F'],
  ['video/mp4; codecs="hvc1"', 'MP4 / HEVC (H.265)', 'video/mp4;codecs=hvc1'],
  ['video/webm; codecs="vp8"', 'WebM / VP8', 'video/webm;codecs=vp8'],
  ['video/webm; codecs="vp9"', 'WebM / VP9', 'video/webm;codecs=vp9'],
  ['video/webm; codecs="av01.0.05M.08"', 'WebM / AV1', 'video/webm;codecs=av01'],
  ['video/quicktime', 'MOV (QuickTime)', ''],
  ['video/ogg; codecs="theora"', 'Ogg / Theora', ''],
  ['video/x-matroska', 'MKV', 'video/x-matroska'],
]
const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window
const supported = (t: string) => hasRecorder && MediaRecorder.isTypeSupported(t)
const canPlay = (m: string) => typeof document !== 'undefined' && document.createElement('video').canPlayType(m) !== ''
const rid = () => Math.random().toString(36).slice(2, 9)
const DEF = { preset: '720', aspect: '16:9', fit: 'fit' as Fit, bg: '#000000', fps: 30, xfade: 0.6, audio: true, codec: '', kbps: 5000 }

/** Records a short synthetic clip with a tone so the merger has inputs of different sizes. */
async function demoClip(w: number, h: number, hue: number, label: string, secs: number, freq: number): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  let ac: AudioContext | null = null
  try {
    ac = new AudioContext()
    await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 300))])
    if (ac.state === 'running') {
      const osc = ac.createOscillator(), gain = ac.createGain(), dest = ac.createMediaStreamDestination()
      osc.frequency.value = freq
      gain.gain.value = 0.08
      osc.connect(gain).connect(dest)
      osc.start()
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
    }
  } catch {
    ac = null
  }
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(supported) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  rec.start(200)
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      g.fillStyle = `hsl(${hue + t * 20} 70% 45%)`
      g.fillRect(0, 0, w, h)
      g.fillStyle = `hsl(${hue + 180} 80% 70%)`
      for (let k = 0; k < 6; k++) {
        g.beginPath()
        g.arc(((k / 6 + t * 0.15) % 1) * w, h / 2 + Math.sin(t * 3 + k) * h * 0.25, Math.min(w, h) * 0.06, 0, 7)
        g.fill()
      }
      g.fillStyle = '#fff'
      g.font = `bold ${Math.round(Math.min(w, h) / 9)}px system-ui, sans-serif`
      g.textAlign = 'center'
      g.fillText(label, w / 2, h * 0.22)
      g.font = `${Math.round(Math.min(w, h) / 16)}px ui-monospace, monospace`
      g.fillText(`${w}×${h} · ${t.toFixed(1)} s`, w / 2, h * 0.88)
      if (t < secs) requestAnimationFrame(frame)
      else resolve()
    }
    frame()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  void ac?.close()
  return new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' })
}

/** Loads metadata (fixing MediaRecorder's Infinity duration) and grabs a thumbnail. */
function probe(url: string): Promise<{ w: number; h: number; dur: number; thumb: string }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.playsInline = true
    v.onerror = () => reject(new Error('This browser cannot decode this file.'))
    v.onloadedmetadata = () => {
      const snap = (dur: number) => {
        v.onseeked = () => {
          const c = document.createElement('canvas')
          c.width = 160
          c.height = Math.round((160 * v.videoHeight) / (v.videoWidth || 1))
          c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
          resolve({ w: v.videoWidth, h: v.videoHeight, dur, thumb: c.toDataURL('image/jpeg', 0.7) })
        }
        v.currentTime = Math.min(0.5, dur / 3)
      }
      if (Number.isFinite(v.duration)) snap(v.duration)
      else {
        v.ontimeupdate = () => {
          v.ontimeupdate = null
          snap(v.duration)
        }
        v.currentTime = 1e9
      }
    }
    v.src = url
  })
}

export default function VideoMerger() {
  const [s, set] = useToolState('video-merger', DEF)
  const [clips, setClips] = useState<Clip[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [prog, setProg] = useState<number | null>(null)
  const [out, setOut] = useState<Out | null>(null)
  const dragI = useRef<number | null>(null)
  const stop = useRef<() => void>(() => {})
  const codecs = CODECS.filter(([c]) => supported(c))
  const codec = codecs.some(([c]) => c === s.codec) ? s.codec : (codecs[0]?.[0] ?? '')
  const [W, H] = outSize(s.preset, clips, s.aspect)
  const { segs, total } = timeline(clips, s.xfade)

  const add = async (files: { name: string; blob: Blob }[]) => {
    setErr('')
    for (const f of files) {
      const url = URL.createObjectURL(f.blob)
      try {
        const m = await probe(url)
        setClips((l) => [...l, { id: rid(), name: f.name, url, size: f.blob.size, ...m, trimIn: 0, trimOut: 0, vol: 1 }])
      } catch (e) {
        URL.revokeObjectURL(url)
        setErr(`${f.name}: ${(e as Error).message}`)
      }
    }
  }
  const demo = async () => {
    if (!hasRecorder) return setErr('MediaRecorder is missing, so demo clips cannot be generated here.')
    setBusy('Recording three demo clips (landscape, 4:3 and portrait)…')
    try {
      const [a, b, c] = await Promise.all([demoClip(1280, 720, 210, 'Clip A', 3, 330), demoClip(640, 480, 20, 'Clip B', 2.5, 440), demoClip(360, 640, 130, 'Clip C', 2.5, 550)])
      await add([{ name: 'demo-a-720p.webm', blob: a }, { name: 'demo-b-4x3.webm', blob: b }, { name: 'demo-c-portrait.webm', blob: c }])
    } catch (e) {
      setErr(`Demo failed: ${(e as Error).message}`)
    }
    setBusy('')
  }
  useEffect(() => {
    void demo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const edit = (id: string, p: Partial<Clip>) => setClips((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const moveClip = (from: number, to: number) => setClips((l) => {
    if (to < 0 || to >= l.length) return l
    const n = [...l]
    const [x] = n.splice(from, 1)
    n.splice(to, 0, x)
    return n
  })

  const merge = async () => {
    if (!segs.length || !codec) return
    setErr('')
    setOut(null)
    setBusy('Preparing clips…')
    const vids = await Promise.all(clips.map((c) => new Promise<HTMLVideoElement>((res, rej) => {
      const v = document.createElement('video')
      v.playsInline = true
      v.preload = 'auto'
      v.onloadeddata = () => res(v)
      v.onerror = () => rej(new Error(`${c.name} cannot be decoded`))
      v.src = c.url
    }))).catch((e: Error) => { setErr(e.message); return null })
    if (!vids) return setBusy('')
    for (const sg of segs) {
      const v = vids[sg.i]
      await new Promise((r) => { v.onseeked = r; v.currentTime = sg.srcIn })
    }
    // Audio: every clip → its own gain → one mixed track.
    let ac: AudioContext | null = null
    const gains: (GainNode | null)[] = clips.map(() => null)
    let tracks: MediaStreamTrack[] = []
    if (s.audio) {
      try {
        ac = new AudioContext()
        await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 400))])
        if (ac.state !== 'running') throw new Error('suspended')
        const dest = ac.createMediaStreamDestination()
        vids.forEach((v, i) => {
          const gn = ac!.createGain()
          gn.gain.value = 0
          ac!.createMediaElementSource(v).connect(gn).connect(dest)
          gains[i] = gn
        })
        tracks = dest.stream.getAudioTracks()
      } catch {
        void ac?.close()
        ac = null
      }
    }
    vids.forEach((v) => (v.muted = !tracks.length))
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const stream = c.captureStream(s.fps)
    tracks.forEach((t) => stream.addTrack(t))
    const mime = tracks.length ? codec : codec.replace(/,(opus|mp4a[^"]*)/, '')
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: supported(mime) ? mime : codec, videoBitsPerSecond: s.kbps * 1000, audioBitsPerSecond: 128_000 })
    } catch (e) {
      setBusy('')
      return setErr(`Encoder could not start: ${(e as Error).message}`)
    }
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const finished = new Promise<void>((r) => (rec.onstop = () => r()))
    let cancelled = false, raf = 0
    const started = new Set<number>()
    const t0 = performance.now()
    const end = () => {
      cancelAnimationFrame(raf)
      vids.forEach((v) => v.pause())
      if (rec.state === 'recording') rec.stop()
    }
    stop.current = () => { cancelled = true; end() }
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      if (t >= total) return end()
      const act = activeAt(segs, t)
      for (const sg of segs) {
        const v = vids[sg.i]
        if (act.includes(sg) && !started.has(sg.i)) {
          started.add(sg.i)
          void v.play()
        }
        if (!act.includes(sg) && started.has(sg.i) && !v.paused) v.pause()
        const gn = gains[sg.i]
        if (gn) gn.gain.value = gainAt(sg, t) * clips[sg.i].vol
      }
      g.globalAlpha = 1
      g.fillStyle = s.bg
      g.fillRect(0, 0, W, H)
      for (const sg of act) {
        const v = vids[sg.i]
        const p = place(v.videoWidth, v.videoHeight, W, H, s.fit)
        g.globalAlpha = sg === act[0] ? 1 : alphaAt(sg, t)
        if (g.globalAlpha < 1) {
          // fade the bars too, so letterboxed clips blend cleanly
          g.fillStyle = s.bg
          g.fillRect(0, 0, W, H)
        }
        g.drawImage(v, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh)
      }
      g.globalAlpha = 1
      setProg(t / total)
      raf = requestAnimationFrame(frame)
    }
    setBusy('')
    setProg(0)
    rec.start(500)
    frame()
    await finished
    stream.getTracks().forEach((t) => t.stop())
    void ac?.close()
    setProg(null)
    if (cancelled) return
    const blob = new Blob(chunks, { type: codec.split(';')[0] })
    if (!blob.size) return setErr('The encoder produced no data. Try another output format.')
    setOut({ url: URL.createObjectURL(blob), blob, w: W, h: H, secs: total, ext: codec.includes('mp4') ? 'mp4' : 'webm', audio: tracks.length > 0 })
  }

  const mixed = new Set(clips.map((c) => `${c.w}x${c.h}`)).size > 1

  return (
    <Split wide="right">
      <div>
        <Panel title="Output">
          <Row>
            <Select label="Size" value={s.preset} onChange={(preset) => set({ preset })} options={[['first', 'Same as first clip'], ['largest', 'Largest clip'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']]} />
            {s.preset !== 'first' && s.preset !== 'largest' && <Select label="Aspect" value={s.aspect} onChange={(aspect) => set({ aspect })} options={[['16:9', '16:9 landscape'], ['9:16', '9:16 vertical'], ['1:1', '1:1 square'], ['4:3', '4:3'], ['first', 'Like first clip']]} />}
          </Row>
          <p className="muted" style={{ margin: '0 0 6px' }}>Clips that don’t match {W}×{H}:</p>
          <Seg value={s.fit} onChange={(fit) => set({ fit })} options={[['fit', 'Letterbox (fit)'], ['fill', 'Crop (fill)'], ['stretch', 'Stretch']]} />
          {s.fit === 'fit' && <label className="k-field"><span className="k-label">Bar colour</span><input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} /></label>}
          <Slider label="Crossfade" value={s.xfade} onChange={(xfade) => set({ xfade })} min={0} max={2} step={0.1} unit=" s" show={(v) => (v ? v.toFixed(1) : 'off (hard cut)')} />
          <Row>
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [60, '60 fps']]} />
            <Num label="Video bitrate" value={s.kbps} onChange={(kbps) => set({ kbps })} unit="kbps" min={300} max={50000} />
          </Row>
          <Select label="Format" value={codec} onChange={(c) => set({ codec: c })} options={codecs.length ? codecs : [['', 'No encoder available']]} />
          <Check label="Mix audio (Web Audio, equal-power crossfades)" value={s.audio} onChange={(audio) => set({ audio })} />
        </Panel>
        <Panel title="What this browser supports">
          <Table head={['Format', 'Read', 'Write']} rows={INPUTS.map(([m, l, w]) => [l, canPlay(m) ? '✓' : '—', w && supported(w) ? '✓' : '—'])} />
          <p className="muted" style={{ fontSize: 13 }}>“Read” is what the browser can decode (canPlayType). “Write” is what MediaRecorder can encode. Chrome/Edge write MP4 (H.264) and WebM; Firefox writes WebM only; Safari writes MP4.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Clips" value={clips.length} sub={mixed ? 'mixed sizes → normalised' : 'same size'} />
          <Stat label="Total length" value={clock(total)} sub={s.xfade && segs.length > 1 ? `${segs.length - 1} crossfade${segs.length > 2 ? 's' : ''}` : 'hard cuts'} />
          <Stat label="Output" value={`${W}×${H}`} sub={`${s.fps} fps`} />
          <Stat label="Estimated size" value={fmtBytes(((s.kbps + (s.audio ? 128 : 0)) * 1000 * total) / 8)} sub="at the chosen bitrate" />
        </Stats>
        <Panel title="Clips — drag to reorder" actions={<><Btn onClick={() => void demo()} disabled={!!busy}>+ Demo clips</Btn><Btn kind="ghost" onClick={() => setClips([])}>Clear</Btn></>}>
          <FileDrop accept="video/*,.mkv,.mov" multiple onFiles={(fs) => void add(fs.map((f) => ({ name: f.name, blob: f })))} label="Drop video clips here or click to choose" />
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {clips.map((c, i) => {
              const sg = segs.find((x) => x.i === i)
              return (
                <div key={c.id} draggable onDragStart={() => (dragI.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragI.current !== null) moveClip(dragI.current, i); dragI.current = null }}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 8, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', cursor: 'grab' }}>
                  <b style={{ width: 18, textAlign: 'center' }}>{i + 1}</b>
                  <img src={c.thumb} alt="" style={{ width: 96, height: 54, objectFit: 'contain', background: '#000', borderRadius: 6 }} />
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{c.w}×{c.h} · {clock(c.dur)} · {fmtBytes(c.size)}{sg ? ` · plays ${clock(sg.start)}–${clock(sg.end)}` : ' · skipped (empty)'}</div>
                  </div>
                  <label className="muted" style={{ fontSize: 12 }}>In <input type="number" min={0} step={0.1} value={c.trimIn} onChange={(e) => edit(c.id, { trimIn: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 62 }} /></label>
                  <label className="muted" style={{ fontSize: 12 }}>Out <input type="number" min={0} step={0.1} value={c.trimOut || ''} placeholder="end" onChange={(e) => edit(c.id, { trimOut: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 62 }} /></label>
                  <label className="muted" style={{ fontSize: 12 }}>Vol <input type="range" min={0} max={1.5} step={0.05} value={c.vol} onChange={(e) => edit(c.id, { vol: Number(e.target.value) })} style={{ width: 70 }} /></label>
                  <span>
                    <Btn kind="ghost" onClick={() => moveClip(i, i - 1)} disabled={i === 0} title="Move up">↑</Btn>
                    <Btn kind="ghost" onClick={() => moveClip(i, i + 1)} disabled={i === clips.length - 1} title="Move down">↓</Btn>
                    <Btn kind="ghost" onClick={() => setClips((l) => l.filter((x) => x.id !== c.id))} title="Remove">✕</Btn>
                  </span>
                </div>
              )
            })}
          </div>
          {total > 0 && (
            <div style={{ position: 'relative', height: 26, marginTop: 12, borderRadius: 6, background: 'var(--line)', overflow: 'hidden' }} aria-label="Timeline">
              {segs.map((sg, k) => (
                <div key={sg.i} title={clips[sg.i]?.name} style={{ position: 'absolute', left: `${(sg.start / total) * 100}%`, width: `${((sg.end - sg.start) / total) * 100}%`, top: k % 2 ? 13 : 0, height: 13, background: `hsl(${(k * 67) % 360} 65% 55%)`, opacity: 0.9, borderRadius: 4, fontSize: 10, color: '#fff', paddingLeft: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>{sg.i + 1}</div>
              ))}
            </div>
          )}
          {clips.some((c) => usable(c) <= 0) && <Note tone="warn">A clip has In ≥ Out and will be skipped.</Note>}
        </Panel>
        <Panel title="Merge">
          <Row>
            <Btn kind="primary" onClick={() => void merge()} disabled={!segs.length || !codec || prog !== null || !!busy}>▶ Merge {segs.length} clip{segs.length === 1 ? '' : 's'}</Btn>
            {prog !== null && <Btn kind="danger" onClick={() => stop.current()}>Cancel</Btn>}
          </Row>
          {busy && <p className="muted">{busy}</p>}
          {prog !== null && <div style={{ marginTop: 8 }}><Bar value={prog} max={1} /> <span className="muted">Encoding in real time… {Math.round(prog * 100)}% ({clock(prog * total)} / {clock(total)})</span></div>}
          {err && <Note tone="err">{err}</Note>}
          {out && (
            <div style={{ marginTop: 10 }}>
              <video src={out.url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
              <Row>
                <Btn kind="primary" onClick={() => download(`merged.${out.ext}`, out.blob)}>⬇ Download {out.ext.toUpperCase()} ({fmtBytes(out.blob.size)})</Btn>
                <span className="muted">{out.w}×{out.h} · {clock(out.secs)} · {out.audio ? 'with audio' : 'silent (audio could not be captured)'}</span>
              </Row>
            </div>
          )}
          <Note>Clips are decoded by the browser and re-encoded in real time with MediaRecorder, so merging takes as long as the result plays. Different codecs and sizes are fine: every frame is normalised to {W}×{H}. MediaRecorder WebM has no duration index, so some players show the length only once fully loaded. Nothing is uploaded.</Note>
        </Panel>
      </div>
    </Split>
  )
}
