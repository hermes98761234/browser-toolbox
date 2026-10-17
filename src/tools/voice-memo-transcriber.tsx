import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, CopyButton, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, Txt, download, num, uid, useToolState } from '../kit'
import { clock, toSrt, toTxt, wordCount, type Seg } from './lib/audio-transcriber'

// Minimal Web Speech API typings (not in every TS DOM lib).
interface SRResult { isFinal: boolean; [i: number]: { transcript: string } }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SR { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type SRCtor = new () => SR
const SRClass = (): SRCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

// ---------- IndexedDB audio store (blobs are too big for localStorage) ----------
const DB = 'tb-voice-memos'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('audio')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const rq = f(d.transaction('audio', mode).objectStore('audio'))
    rq.onsuccess = () => res(rq.result as T)
    rq.onerror = () => rej(rq.error)
  })
}
const putAudio = (id: string, b: Blob) => idb<IDBValidKey>('readwrite', (s) => s.put(b, id))
const getAudio = (id: string) => idb<Blob | undefined>('readonly', (s) => s.get(id))
const delAudio = (id: string) => idb<undefined>('readwrite', (s) => s.delete(id))

interface Memo { id: string; title: string; at: string; dur: number; segs: Seg[]; audio: boolean; star: boolean }
interface State { lang: string; memos: Memo[] }

const seg = (start: number, end: number, text: string): Seg => ({ id: uid(), start, end, text })
const DEF: State = {
  lang: 'en-US',
  memos: [
    { id: 'demo1', title: 'Grocery list', at: '2026-10-15T08:12', dur: 21, audio: false, star: true, segs: [seg(0, 6, 'Pick up oat milk, eggs and two avocados.'), seg(6, 13, "Don't forget coffee beans, the dark roast from the corner shop."), seg(13, 21, 'Also batteries for the smoke detector.')] },
    { id: 'demo2', title: 'Project idea — plant watering bot', at: '2026-10-14T21:40', dur: 38, audio: false, star: false, segs: [seg(0, 9, 'Idea: a little ESP32 board with a soil moisture sensor for each pot.'), seg(9, 20, 'It pings my phone when the basil is dry and logs the readings every hour.'), seg(20, 38, 'Budget around forty dollars. Check if the cheap capacitive sensors last longer than the resistive ones.')] },
    { id: 'demo3', title: 'Call with Sam', at: '2026-10-12T14:05', dur: 27, audio: false, star: false, segs: [seg(0, 10, 'Sam can do the design review on Thursday at three.'), seg(10, 27, 'Send him the updated mockups and the budget spreadsheet before Wednesday evening.')] },
  ],
}

const LANGS: [string, string][] = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (BR)'], ['uk-UA', 'Ukrainian'], ['pl-PL', 'Polish'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese']]

function hl(text: string, q: string): ReactNode {
  if (!q) return text
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}

export default function VoiceMemoTranscriber() {
  const [s, set] = useToolState('voice-memo-transcriber', DEF)
  const [rec, setRec] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState<Seg[]>([])
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const r = useRef<{ mr?: MediaRecorder; sr?: SR; stream?: MediaStream; t0: number; chunks: Blob[]; segs: Seg[]; lastEnd: number; raf?: number; ctx?: AudioContext; on: boolean }>({ t0: 0, chunks: [], segs: [], lastEnd: 0, on: false })

  const interimRef = useRef('')
  useEffect(() => { interimRef.current = interim }, [interim])
  const canRec = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const canSR = !!SRClass()

  useEffect(() => {
    if (!rec) return
    const iv = setInterval(() => setElapsed((Date.now() - r.current.t0) / 1000), 200)
    return () => clearInterval(iv)
  }, [rec])

  // Load audio URLs for memos that have recordings.
  useEffect(() => {
    let alive = true
    const made: string[] = []
    void (async () => {
      const out: Record<string, string> = {}
      for (const m of s.memos.filter((x) => x.audio)) {
        try {
          const b = await getAudio(m.id)
          if (b) { out[m.id] = URL.createObjectURL(b); made.push(out[m.id]) }
        } catch { /* IndexedDB unavailable */ }
      }
      if (alive) setUrls(out)
    })()
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [s.memos])

  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const cur = r.current
      Object.assign(cur, { mr, stream, t0: Date.now(), chunks: [], segs: [], lastEnd: 0, on: true })
      mr.ondataavailable = (e) => e.data.size && cur.chunks.push(e.data)
      mr.start(1000)
      // level meter
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const loop = () => {
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
        setLevel(peak)
        cur.raf = requestAnimationFrame(loop)
      }
      loop()
      cur.ctx = ctx
      // live transcription
      const C = SRClass()
      if (C) {
        const sr = new C()
        sr.lang = s.lang
        sr.continuous = true
        sr.interimResults = true
        sr.onresult = (e) => {
          let tmp = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]
            if (res.isFinal) {
              const now = (Date.now() - cur.t0) / 1000
              const text = res[0].transcript.trim()
              if (text) cur.segs.push(seg(cur.lastEnd, now, text.charAt(0).toUpperCase() + text.slice(1)))
              cur.lastEnd = now
              setLive([...cur.segs])
            } else tmp += res[0].transcript
          }
          setInterim(tmp)
        }
        sr.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') setErr(`Speech recognition: ${e.error}`) }
        sr.onend = () => { if (cur.on) try { sr.start() } catch { /* already started */ } } // Chrome stops after silence
        sr.start()
        cur.sr = sr
      }
      setLive([])
      setInterim('')
      setElapsed(0)
      setRec(true)
    } catch (e) {
      setErr(`Microphone unavailable: ${(e as Error).message}`)
    }
  }

  const stop = () => {
    const cur = r.current
    cur.on = false
    cur.sr?.stop()
    if (cur.raf) cancelAnimationFrame(cur.raf)
    void cur.ctx?.close()
    setLevel(0)
    setRec(false)
    const dur = (Date.now() - cur.t0) / 1000
    const mr = cur.mr
    if (!mr) return
    mr.onstop = async () => {
      cur.stream?.getTracks().forEach((t) => t.stop())
      const blob = new Blob(cur.chunks, { type: mr.mimeType || 'audio/webm' })
      const id = uid()
      let saved = false
      try { await putAudio(id, blob); saved = true } catch { setErr('Could not store audio in IndexedDB (private mode?). Transcript was kept.') }
      // give the recogniser a moment to flush its last final result
      setTimeout(() => {
        const segs = [...cur.segs]
        if (interimRef.current) segs.push(seg(cur.lastEnd, dur, interimRef.current.trim()))
        const first = segs[0]?.text.split(/\s+/).slice(0, 6).join(' ')
        const d = new Date()
        const at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        set((st) => ({ ...st, memos: [{ id, title: first ? first.replace(/[.,!?]$/, '') : `Memo ${at.replace('T', ' ')}`, at, dur, segs, audio: saved, star: false }, ...st.memos] }))
        setOpen(id)
        setInterim('')
      }, 600)
    }
    mr.stop()
  }

  const upd = (id: string, p: Partial<Memo>) => set((st) => ({ ...st, memos: st.memos.map((m) => (m.id === id ? { ...m, ...p } : m)) }))
  const remove = (m: Memo) => {
    if (!confirm(`Delete “${m.title}”?`)) return
    if (m.audio) void delAudio(m.id).catch(() => undefined)
    set((st) => ({ ...st, memos: st.memos.filter((x) => x.id !== m.id) }))
  }
  const ql = q.trim().toLowerCase()
  const shown = s.memos.filter((m) => !ql || m.title.toLowerCase().includes(ql) || m.segs.some((x) => x.text.toLowerCase().includes(ql))).sort((a, b) => Number(b.star) - Number(a.star) || b.at.localeCompare(a.at))
  const totalWords = s.memos.reduce((a, m) => a + wordCount(m.segs), 0)
  const totalDur = s.memos.reduce((a, m) => a + m.dur, 0)
  const fname = (m: Memo) => m.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'memo'

  return (
    <Split>
      <div>
        <Panel title="🎙 Record">
          {!canRec && <Note tone="warn">This browser can't record audio (MediaRecorder / microphone missing). You can still browse and search the sample memos.</Note>}
          {canRec && !canSR && <Note tone="warn">Live transcription needs the Web Speech API (Chrome, Edge, Safari). Audio will be recorded and you can type the transcript yourself.</Note>}
          <Select label="Language" value={s.lang} onChange={(lang) => set({ lang })} options={LANGS} />
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <button
              onClick={rec ? stop : () => void start()}
              disabled={!canRec}
              aria-label={rec ? 'Stop recording' : 'Start recording'}
              style={{ width: 96, height: 96, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 34, color: '#fff', background: rec ? 'var(--err)' : 'var(--accent)', boxShadow: rec ? `0 0 0 ${6 + level * 30}px color-mix(in srgb, var(--err) 25%, transparent)` : 'var(--shadow)', transition: 'box-shadow .08s' }}
            >
              {rec ? '■' : '●'}
            </button>
            <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>{clock(elapsed)}</div>
            <div className="muted" style={{ fontSize: 13 }}>{rec ? 'Recording… tap to stop and save' : 'Tap to record a memo'}</div>
          </div>
          {err && <Note tone="err">{err}</Note>}
          {(rec || live.length > 0) && (
            <div style={{ background: 'var(--panel2)', borderRadius: 8, padding: 10, minHeight: 80, fontSize: 15 }}>
              {live.map((x) => <span key={x.id}>{x.text} </span>)}
              <span className="muted">{interim}</span>
              {rec && !live.length && !interim && <span className="muted">Start speaking — words appear here live.</span>}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>Audio is kept in this browser's IndexedDB; transcripts in local storage. Nothing is uploaded by this page (your browser's speech service may process the audio).</p>
        </Panel>
        <Panel title="Library">
          <Row>
            <JsonButtons name="voice-memos.json" data={s} onLoad={(d) => d && Array.isArray(d.memos) && set(d)} />
            <Btn onClick={() => download('voice-memos.txt', s.memos.map((m) => `# ${m.title} (${m.at.replace('T', ' ')}, ${clock(m.dur)})\n${toTxt(m.segs, false)}`).join('\n'), 'text/plain')}>⬇ All transcripts</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Backup saves titles and transcripts (download audio per memo).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Memos" value={s.memos.length} />
          <Stat label="Recorded" value={clock(totalDur)} />
          <Stat label="Words" value={num(totalWords, 0)} />
          <Stat label="Matches" value={ql ? shown.length : '—'} tone="accent" />
        </Stats>
        <Panel title="Memos">
          <Txt label="Search transcripts" value={q} onChange={setQ} placeholder="e.g. budget, Thursday, coffee" />
          {!shown.length && <Note>No memos match “{q}”.</Note>}
          {shown.map((m) => {
            const isOpen = open === m.id
            const hit = ql ? m.segs.find((x) => x.text.toLowerCase().includes(ql)) : undefined
            const text = m.segs.map((x) => x.text).join(' ')
            return (
              <div key={m.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="k-btn ghost" title="Star" onClick={() => upd(m.id, { star: !m.star })} style={{ color: m.star ? 'var(--warn)' : 'var(--muted)' }}>{m.star ? '★' : '☆'}</button>
                  <button onClick={() => setOpen(isOpen ? null : m.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', padding: 0 }}>
                    <b>{hl(m.title, ql)}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{m.at.replace('T', ' ')} · {clock(m.dur)} · {wordCount(m.segs)} words{m.audio ? ' · 🔊' : ''}</div>
                    {!isOpen && <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hl(hit ? hit.text : text, ql)}</div>}
                  </button>
                  <span className="muted">{isOpen ? '▾' : '▸'}</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 8 }}>
                    <Txt label="Title" value={m.title} onChange={(title) => upd(m.id, { title })} />
                    {urls[m.id] ? <audio controls src={urls[m.id]} style={{ width: '100%', margin: '6px 0' }} /> : <p className="muted" style={{ fontSize: 12 }}>{m.audio ? 'Loading audio…' : 'Sample memo — no audio attached.'}</p>}
                    {m.segs.map((x, i) => (
                      <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                        <span className="muted" style={{ fontSize: 12, width: 40, flex: 'none', paddingTop: 6 }}>{clock(x.start)}</span>
                        <textarea className="k-area" rows={1} value={x.text} onChange={(e) => upd(m.id, { segs: m.segs.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)) })} style={{ flex: 1, minHeight: 34 }} aria-label="Transcript line" />
                      </div>
                    ))}
                    <Row>
                      <Btn onClick={() => upd(m.id, { segs: [...m.segs, seg(m.segs.at(-1)?.end ?? 0, m.dur, '')] })}>+ Line</Btn>
                      <CopyButton text={() => toTxt(m.segs, false)} label="Copy text" />
                      <Btn onClick={() => download(`${fname(m)}.txt`, toTxt(m.segs, true), 'text/plain')}>⬇ TXT</Btn>
                      <Btn onClick={() => download(`${fname(m)}.srt`, toSrt(m.segs), 'text/plain')}>⬇ SRT</Btn>
                      {m.audio && <Btn onClick={() => void getAudio(m.id).then((b) => b && download(`${fname(m)}.webm`, b, b.type))}>⬇ Audio</Btn>}
                      <Btn kind="danger" onClick={() => remove(m)}>Delete</Btn>
                    </Row>
                  </div>
                )}
              </div>
            )
          })}
        </Panel>
      </div>
    </Split>
  )
}
