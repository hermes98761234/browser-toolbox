import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Select, Split, Stat, Stats, Txt, download, num, uid, useToolState } from '../kit'
import { detectSound, encodeWav, fmtTime, normalizeGain, peaks, render, toDb } from './lib/audio-trimmer'
import { analyze, fmtDur, level, meterPos, parseTags, synthVoice, verdict, type Quality } from './lib/voice-memo-recorder'

// ---------- IndexedDB blob store ----------
const DB = 'tb-voice-recorder'
const db = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore('audio')
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const q = f(d.transaction('audio', mode).objectStore('audio'))
    q.onsuccess = () => res(q.result as T)
    q.onerror = () => rej(q.error)
  })
}
const DEMO_LEN: Record<string, [number, number]> = { 'demo-1': [9, 4], 'demo-2': [14, 11] }
async function getBlob(id: string): Promise<Blob | undefined> {
  if (DEMO_LEN[id]) {
    const [sec, seed] = DEMO_LEN[id]
    return new Blob([encodeWav([synthVoice(22050, sec, seed)], 22050) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' })
  }
  return idb<Blob | undefined>('readonly', (s) => s.get(id))
}

interface Memo { id: string; title: string; at: string; dur: number; mime: string; size: number; tags: string[]; star: boolean; trim: [number, number] | null; q?: Quality; input?: string }
interface State { deviceId: string; ns: boolean; ec: boolean; agc: boolean; stereo: boolean; kbps: number; normalize: boolean; tag: string; memos: Memo[] }

const DEF: State = {
  deviceId: '', ns: true, ec: true, agc: false, stereo: false, kbps: 128, normalize: true, tag: '',
  memos: [
    { id: 'demo-2', title: 'Podcast intro — take 3', at: '2026-10-16T19:20', dur: 14, mime: 'audio/wav', size: 617000, tags: ['podcast', 'draft'], star: true, trim: null, input: 'Demo (synthetic voice)' },
    { id: 'demo-1', title: 'Idea: weekend workshop', at: '2026-10-15T08:05', dur: 9, mime: 'audio/wav', size: 397000, tags: ['idea'], star: false, trim: null, input: 'Demo (synthetic voice)' },
  ],
}

const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
const ext = (m: string) => (m.includes('wav') ? 'wav' : m.includes('ogg') ? 'ogg' : m.includes('mp4') ? 'm4a' : 'webm')
const LOW = '#10b981', MID = '#f59e0b', HIGH = '#ef4444'

function drawWave(c: HTMLCanvasElement, buf: AudioBuffer, trim: [number, number], head: number) {
  const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = 140 * devicePixelRatio)
  const g = c.getContext('2d')!
  const ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
  const cols = Math.floor(w / (2 * devicePixelRatio))
  const pk = peaks(ch, cols)
  const css = getComputedStyle(c)
  g.clearRect(0, 0, w, h)
  pk.forEach(([mn, mx], i) => {
    const t = (i / cols) * buf.duration
    g.fillStyle = t >= trim[0] && t <= trim[1] ? css.getPropertyValue('--accent') || '#6366f1' : '#94a3b8'
    const y0 = h / 2 - mx * h * 0.48, y1 = h / 2 - mn * h * 0.48
    g.fillRect(i * (w / cols), y0, Math.max(1, w / cols - 1), Math.max(1, y1 - y0))
  })
  g.fillStyle = 'rgba(100,116,139,.18)'
  g.fillRect(0, 0, (trim[0] / buf.duration) * w, h)
  g.fillRect((trim[1] / buf.duration) * w, 0, w, h)
  if (head > 0) {
    g.fillStyle = HIGH
    g.fillRect((head / buf.duration) * w - 1, 0, 2 * devicePixelRatio, h)
  }
}

export default function VoiceMemoRecorder() {
  const [s, set] = useToolState('voice-memo-recorder', DEF)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [phase, setPhase] = useState<'idle' | 'monitor' | 'rec' | 'paused'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [meter, setMeter] = useState({ rms: -Infinity, peak: -Infinity, hold: -Infinity, clip: false })
  const [actual, setActual] = useState('')
  const [err, setErr] = useState('')
  const [selId, setSelId] = useState(s.memos[0]?.id ?? '')
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [url, setUrl] = useState('')
  const [head, setHead] = useState(0)
  const [quota, setQuota] = useState('')
  const [filter, setFilter] = useState('')
  const live = useRef<HTMLCanvasElement>(null)
  const wave = useRef<HTMLCanvasElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const R = useRef<{ stream?: MediaStream; ctx?: AudioContext; an?: AnalyserNode; mr?: MediaRecorder; chunks: Blob[]; raf: number; t0: number; acc: number; hist: number[]; hold: number; holdT: number }>({ chunks: [], raf: 0, t0: 0, acc: 0, hist: [], hold: -Infinity, holdT: 0 })
  const canRec = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const sel = s.memos.find((m) => m.id === selId)
  const trim: [number, number] = sel?.trim ?? [0, buf?.duration ?? sel?.dur ?? 0]
  const [t0, t1] = trim
  const editMemo = (id: string, p: Partial<Memo>) => set((st) => ({ ...st, memos: st.memos.map((m) => (m.id === id ? { ...m, ...p } : m)) }))

  const listDevices = () => navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'audioinput'))).catch(() => {})
  useEffect(() => {
    void listDevices()
    void navigator.storage?.estimate?.().then((e) => setQuota(`${num((e.usage ?? 0) / 1048576, 1)} MB used of ${num((e.quota ?? 0) / 1073741824, 1)} GB`))
    const r = R.current
    return () => {
      cancelAnimationFrame(r.raf)
      r.stream?.getTracks().forEach((t) => t.stop())
      void r.ctx?.close()
    }
  }, [])

  // load + decode the selected memo
  useEffect(() => {
    let off = false
    let made = ''
    if (!sel) return
    void (async () => {
      const b = await getBlob(sel.id)
      if (!b || off) return
      made = URL.createObjectURL(b)
      setUrl(made)
      try {
        const ctx = new AudioContext()
        const ab = await ctx.decodeAudioData(await b.arrayBuffer())
        void ctx.close()
        if (off) return
        setBuf(ab)
        if (!sel.q) editMemo(sel.id, { q: analyze(Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i)), ab.sampleRate), dur: ab.duration })
      } catch {
        setBuf(null)
      }
    })()
    return () => {
      off = true
      if (made) URL.revokeObjectURL(made)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  useEffect(() => {
    if (wave.current && buf) drawWave(wave.current, buf, [t0, t1], head)
  }, [buf, t0, t1, head])

  async function open(): Promise<MediaStream | null> {
    setErr('')
    const r = R.current
    if (r.stream) return r.stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: s.deviceId ? { exact: s.deviceId } : undefined, noiseSuppression: s.ns, echoCancellation: s.ec, autoGainControl: s.agc, channelCount: s.stereo ? 2 : 1 },
      })
      r.stream = stream
      const st = stream.getAudioTracks()[0].getSettings()
      setActual(`${stream.getAudioTracks()[0].label || 'Microphone'} · ${st.sampleRate ? num(st.sampleRate / 1000, 1) + ' kHz' : ''} · ${st.channelCount ?? 1} ch · NS ${st.noiseSuppression ? 'on' : 'off'} · echo ${st.echoCancellation ? 'on' : 'off'} · AGC ${st.autoGainControl ? 'on' : 'off'}`)
      void listDevices()
      r.ctx = new AudioContext()
      r.an = r.ctx.createAnalyser()
      r.an.fftSize = 2048
      r.ctx.createMediaStreamSource(stream).connect(r.an)
      const data = new Float32Array(r.an.fftSize)
      const loop = () => {
        r.raf = requestAnimationFrame(loop)
        r.an!.getFloatTimeDomainData(data)
        const l = level(data)
        const pk = toDb(l.peak), now = performance.now()
        if (pk > r.hold || now - r.holdT > 1500) {
          r.hold = pk
          r.holdT = now
        }
        setMeter((m) => ({ rms: toDb(l.rms), peak: pk, hold: r.hold, clip: m.clip || l.peak >= 0.99 }))
        if (r.mr?.state === 'recording') setElapsed(r.acc + (now - r.t0) / 1000)
        r.hist.push(l.peak)
        if (r.hist.length > 400) r.hist.shift()
        const c = live.current
        if (c) {
          const w = (c.width = c.clientWidth), h = (c.height = 70)
          const g = c.getContext('2d')!
          g.clearRect(0, 0, w, h)
          const bw = w / 400
          r.hist.forEach((p, i) => {
            const db = toDb(p)
            g.fillStyle = db > -3 ? HIGH : db > -12 ? MID : LOW
            const bh = Math.max(1, p * h)
            g.fillRect(w - (r.hist.length - i) * bw, (h - bh) / 2, Math.max(1, bw - 0.5), bh)
          })
        }
      }
      loop()
      return stream
    } catch (e) {
      setErr(`Microphone unavailable: ${(e as Error).message}. Allow microphone access in the address bar and try again.`)
      return null
    }
  }

  function close() {
    const r = R.current
    cancelAnimationFrame(r.raf)
    r.stream?.getTracks().forEach((t) => t.stop())
    void r.ctx?.close()
    Object.assign(r, { stream: undefined, ctx: undefined, an: undefined, mr: undefined, hist: [] })
    setPhase('idle')
    setMeter({ rms: -Infinity, peak: -Infinity, hold: -Infinity, clip: false })
  }

  async function start() {
    const stream = await open()
    if (!stream) return
    const r = R.current
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: s.kbps * 1000 })
    r.chunks = []
    r.acc = 0
    r.t0 = performance.now()
    mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data)
    mr.onstop = async () => {
      const blob = new Blob(r.chunks, { type: mr.mimeType || 'audio/webm' })
      const id = uid()
      try {
        await idb('readwrite', (st) => st.put(blob, id))
      } catch {
        setErr('Could not save to browser storage (quota or private mode). Download the memo instead.')
      }
      const d = new Date()
      const memo: Memo = { id, title: `Memo ${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, at: d.toISOString().slice(0, 16), dur: r.acc, mime: blob.type, size: blob.size, tags: s.tag ? [s.tag] : [], star: false, trim: null, input: actual }
      set((st) => ({ ...st, memos: [memo, ...st.memos] }))
      setSelId(id)
      close()
    }
    mr.onpause = () => (r.acc += (performance.now() - r.t0) / 1000)
    mr.onresume = () => (r.t0 = performance.now())
    mr.start(1000)
    r.mr = mr
    setElapsed(0)
    setPhase('rec')
  }

  function stop() {
    const r = R.current
    if (r.mr && r.mr.state !== 'inactive') {
      if (r.mr.state === 'recording') r.acc += (performance.now() - r.t0) / 1000
      r.mr.onpause = null
      r.mr.stop()
    } else close()
  }

  function play() {
    const a = audio.current
    if (!a) return
    a.currentTime = trim[0]
    void a.play()
  }

  function exportWav() {
    if (!buf || !sel) return
    const ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
    const gainDb = s.normalize ? normalizeGain(ch, buf.sampleRate, trim[0], trim[1], -1) : 0
    const out = render(ch, buf.sampleRate, { start: trim[0], end: trim[1], fadeIn: 0.01, fadeOut: 0.02, curve: 'linear', gainDb })
    download(`${sel.title.replace(/[^\w-]+/g, '-')}.wav`, new Blob([encodeWav(out, buf.sampleRate) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
  }

  async function remove(m: Memo) {
    if (!DEMO_LEN[m.id]) await idb('readwrite', (st) => st.delete(m.id)).catch(() => {})
    const rest = s.memos.filter((x) => x.id !== m.id)
    set({ memos: rest })
    setSelId(rest[0]?.id ?? '')
    setBuf(null)
  }

  const allTags = [...new Set(s.memos.flatMap((m) => m.tags))].sort()
  const shown = s.memos.filter((m) => (!filter || m.tags.includes(filter))).sort((a, b) => Number(b.star) - Number(a.star) || b.at.localeCompare(a.at))
  const totalDur = s.memos.reduce((a, m) => a + m.dur, 0)
  const meterBar = (db: number) => `${meterPos(db) * 100}%`

  return (
    <Split>
      <div>
        <Panel title="Input">
          {!canRec && <Note tone="err">This browser cannot record audio (MediaRecorder / getUserMedia missing). You can still explore the demo memos.</Note>}
          <Select label="Microphone" value={s.deviceId} onChange={(deviceId) => { set({ deviceId }); close() }}
            options={[['', 'System default'], ...devices.map((d, i) => [d.deviceId, d.label || `Microphone ${i + 1} (allow access to see names)`] as [string, string])]} />
          <Row>
            <Check label="Noise suppression" value={s.ns} onChange={(ns) => { set({ ns }); close() }} />
            <Check label="Echo cancellation" value={s.ec} onChange={(ec) => { set({ ec }); close() }} />
            <Check label="Auto gain" value={s.agc} onChange={(agc) => { set({ agc }); close() }} />
            <Check label="Stereo" value={s.stereo} onChange={(stereo) => { set({ stereo }); close() }} />
          </Row>
          <Row>
            <Select label="Bitrate" value={s.kbps} onChange={(kbps) => set({ kbps })} options={[[48, '48 kbps · voice notes'], [96, '96 kbps · good'], [128, '128 kbps · high'], [192, '192 kbps · music'], [256, '256 kbps · max']]} />
            <Txt label="Tag new memos" value={s.tag} onChange={(tag) => set({ tag: tag.toLowerCase() })} placeholder="e.g. work" />
          </Row>
          {actual && <p className="muted" style={{ fontSize: 13 }}>Active: {actual}</p>}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Tip: turn noise suppression and echo cancellation <b>off</b> for music or a treated room — they smear transients. Keep them on for laptop mics.</p>
        </Panel>
        <Panel title="Recorder">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: phase === 'rec' ? HIGH : phase === 'paused' ? MID : 'var(--line)', boxShadow: phase === 'rec' ? `0 0 10px ${HIGH}` : 'none' }} />
            <b style={{ fontSize: 34, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(elapsed, false)}</b>
            <span className="muted">{phase === 'rec' ? 'recording' : phase === 'paused' ? 'paused' : phase === 'monitor' ? 'mic check' : 'ready'}</span>
          </div>
          <div style={{ position: 'relative', height: 16, borderRadius: 8, background: 'var(--line)', overflow: 'hidden' }} aria-label="Input level">
            <div style={{ position: 'absolute', inset: 0, width: meterBar(meter.rms), background: `linear-gradient(90deg, ${LOW} 0 70%, ${MID} 80%, ${HIGH} 95%)`, backgroundSize: '100% 100%', transition: 'width 60ms' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: meterBar(meter.hold), width: 3, background: meter.hold > -3 ? HIGH : 'var(--text, #111)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="muted">
            {[-60, -48, -36, -24, -12, 0].map((d) => <span key={d}>{d}</span>)}
          </div>
          <Row>
            <span>RMS <b>{Number.isFinite(meter.rms) ? meter.rms.toFixed(1) : '−∞'}</b> dBFS</span>
            <span>Peak <b>{Number.isFinite(meter.hold) ? meter.hold.toFixed(1) : '−∞'}</b></span>
            <button type="button" className="k-btn ghost" onClick={() => setMeter((m) => ({ ...m, clip: false }))} style={{ color: meter.clip ? HIGH : undefined }}>{meter.clip ? '● CLIP (reset)' : '○ no clip'}</button>
          </Row>
          <canvas ref={live} style={{ width: '100%', height: 70, display: 'block', margin: '8px 0', background: 'var(--panel)', borderRadius: 6, border: '1px solid var(--line)' }} />
          <Row>
            {phase === 'idle' && <Btn kind="primary" disabled={!canRec} onClick={start}>● Record</Btn>}
            {phase === 'idle' && <Btn disabled={!canRec} onClick={async () => { if (await open()) setPhase('monitor') }}>Mic check</Btn>}
            {phase === 'monitor' && <><Btn kind="primary" onClick={start}>● Record</Btn><Btn onClick={close}>Stop check</Btn></>}
            {phase === 'rec' && <><Btn onClick={() => { R.current.mr?.pause(); setPhase('paused') }}>❚❚ Pause</Btn><Btn kind="danger" onClick={stop}>■ Stop & save</Btn></>}
            {phase === 'paused' && <><Btn onClick={() => { R.current.mr?.resume(); setPhase('rec') }}>▶ Resume</Btn><Btn kind="danger" onClick={stop}>■ Stop & save</Btn></>}
          </Row>
          {phase === 'monitor' && <Note>Stay quiet for a few seconds: the RMS reading is your room’s noise floor. Below −50 dBFS is great; above −40 means audible hiss or hum. Then speak normally — peaks around −12 dBFS are ideal.</Note>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Memos" value={s.memos.length} sub={quota} />
          <Stat label="Total length" value={fmtDur(totalDur)} />
          <Stat label="Starred" value={s.memos.filter((m) => m.star).length} />
          <Stat label="Tags" value={allTags.length} />
        </Stats>
        <Panel title="Memos" actions={
          <div className="k-seg">
            {['', ...allTags].map((t) => <button key={t || 'all'} type="button" className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{t ? `#${t}` : 'All'}</button>)}
          </div>
        }>
          {!shown.length && <p className="muted">No memos yet. Press Record.</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {shown.map((m) => (
              <button key={m.id} type="button" onClick={() => setSelId(m.id)}
                style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: `1px solid ${m.id === selId ? 'var(--accent)' : 'var(--line)'}`, background: m.id === selId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel)', color: 'inherit', cursor: 'pointer' }}>
                <span style={{ color: m.star ? MID : 'var(--muted)' }}>{m.star ? '★' : '☆'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{m.at.replace('T', ' ')} · {ext(m.mime).toUpperCase()} · {num(m.size / 1024, 0)} KB {m.tags.map((t) => `#${t}`).join(' ')}</span>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDur(m.dur)}</b>
              </button>
            ))}
          </div>
        </Panel>
        {sel && (
          <Panel title="Edit memo" actions={<><Btn onClick={() => editMemo(sel.id, { star: !sel.star })}>{sel.star ? '★ Starred' : '☆ Star'}</Btn><Btn kind="danger" onClick={() => remove(sel)}>Delete</Btn></>}>
            <Row>
              <Txt label="Title" value={sel.title} onChange={(title) => editMemo(sel.id, { title })} />
              <Txt label="Tags (comma separated)" value={sel.tags.join(', ')} onChange={(t) => editMemo(sel.id, { tags: parseTags(t) })} />
            </Row>
            <canvas ref={wave} style={{ width: '100%', height: 140, display: 'block', borderRadius: 6, border: '1px solid var(--line)' }} />
            {buf && (
              <>
                <Row>
                  <label className="k-field" style={{ flex: 1 }}><span className="k-label">Start <b>{fmtTime(trim[0])}</b></span>
                    <input type="range" min={0} max={buf.duration} step={0.01} value={trim[0]} onChange={(e) => editMemo(sel.id, { trim: [Math.min(+e.target.value, trim[1] - 0.1), trim[1]] })} /></label>
                  <label className="k-field" style={{ flex: 1 }}><span className="k-label">End <b>{fmtTime(trim[1])}</b></span>
                    <input type="range" min={0} max={buf.duration} step={0.01} value={trim[1]} onChange={(e) => editMemo(sel.id, { trim: [trim[0], Math.max(+e.target.value, trim[0] + 0.1)] })} /></label>
                </Row>
                <Row>
                  <Btn kind="primary" onClick={play}>▶ Play selection</Btn>
                  <Btn onClick={() => {
                    const ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
                    editMemo(sel.id, { trim: detectSound(ch, buf.sampleRate, Math.max(-60, (sel.q?.noiseDb ?? -60) + 12), 0.15) })
                  }}>✂ Auto-trim silence</Btn>
                  <Btn kind="ghost" onClick={() => editMemo(sel.id, { trim: null })}>Reset trim</Btn>
                </Row>
              </>
            )}
            <audio ref={audio} src={url} controls style={{ width: '100%', margin: '8px 0' }}
              onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setHead(t); if (t >= trim[1]) e.currentTarget.pause() }} />
            {sel.q && (
              <>
                <Stats>
                  <Stat label="Peak" value={`${sel.q.peakDb.toFixed(1)} dBFS`} tone={sel.q.peakDb > -1 ? 'bad' : undefined} />
                  <Stat label="Speech level" value={`${sel.q.rmsDb.toFixed(1)} dBFS`} />
                  <Stat label="Noise floor" value={`${sel.q.noiseDb.toFixed(1)} dBFS`} />
                  <Stat label="SNR" value={`${sel.q.snrDb.toFixed(0)} dB`} tone={sel.q.snrDb >= 25 ? 'good' : 'bad'} sub={`${sel.q.speechPct.toFixed(0)}% speech`} />
                </Stats>
                {verdict(sel.q).map(([t, m]) => <Note key={m} tone={t}>{m}</Note>)}
              </>
            )}
            {sel.input && <p className="muted" style={{ fontSize: 12 }}>Recorded with: {sel.input}</p>}
            <Row>
              <Btn onClick={exportWav} disabled={!buf}>⬇ WAV (trimmed{s.normalize ? ', normalized' : ''})</Btn>
              <Btn onClick={async () => { const b = await getBlob(sel.id); if (b) download(`${sel.title.replace(/[^\w-]+/g, '-')}.${ext(sel.mime)}`, b) }}>⬇ Original {ext(sel.mime).toUpperCase()}</Btn>
              <Check label="Normalize to −1 dBFS" value={s.normalize} onChange={(normalize) => set({ normalize })} />
            </Row>
          </Panel>
        )}
      </div>
    </Split>
  )
}
