import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { clock, parseSubs, toSrt, toTxt, toVtt, wordCount, wpm, type Seg } from './lib/audio-transcriber'

// Minimal Web Speech API typings (not in every TS DOM lib).
interface SRAlt { transcript: string; confidence: number }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlt }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SR {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SRCtor = new () => SR
const SRClass = (): SRCtor | undefined => (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition

interface State {
  title: string
  lang: string
  speaker: string
  times: boolean
  segs: Seg[]
}

const DEMO: Seg[] = [
  ['Maya', 0, 5.8, 'Okay, let’s get started. This is the Thursday product sync, and we have about fifteen minutes.'],
  ['Maya', 6.1, 11.4, 'First item is the onboarding redesign. Daniel, can you give us a quick status?'],
  ['Daniel', 12, 19.6, 'Sure. The new welcome flow is finished on web. Mobile still needs the permissions screen, which should land on Monday.'],
  ['Daniel', 20.1, 25.3, 'Early numbers look good: completion went from sixty-two to seventy-one percent in the test group.'],
  ['Priya', 26, 31.7, 'That’s great. Did we see any change in support tickets about account setup?'],
  ['Daniel', 32.2, 36.5, 'About twenty percent fewer so far, but it’s only been a week, so I’d treat that carefully.'],
  ['Maya', 37.4, 43, 'Agreed. Second item: the pricing page experiment. Priya, you wanted to propose an extension.'],
  ['Priya', 43.6, 51.2, 'Yes. We’re at eighty percent of the sample size we planned. I’d like to run it one more week before we decide.'],
  ['Maya', 51.8, 57, 'Fine by me. Action items: Daniel ships the mobile permissions screen, Priya reports pricing results next Thursday.'],
  ['Maya', 57.5, 60.2, 'Thanks everyone, see you next week.'],
].map(([speaker, start, end, text]) => ({ id: uid(), speaker: speaker as string, start: start as number, end: end as number, text: text as string }))

const DEF: State = { title: 'Product sync', lang: 'en-US', speaker: 'Speaker 1', times: true, segs: DEMO }
const LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (BR)'], ['uk-UA', 'Ukrainian'], ['pl-PL', 'Polish'], ['nl-NL', 'Dutch'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese (Mandarin)'], ['hi-IN', 'Hindi']] as const

export default function AudioTranscriber() {
  const [s, set, reset] = useToolState('audio-transcriber', DEF)
  const [rec, setRec] = useState(false)
  const [interim, setInterim] = useState('')
  const [err, setErr] = useState('')
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [audio, setAudio] = useState<{ name: string; url: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [rate, setRate] = useState(1)
  const player = useRef<HTMLAudioElement>(null)
  const sr = useRef<SR | null>(null)
  const live = useRef({ on: false, t0: 0, offset: 0, segStart: -1, stream: null as MediaStream | null, raf: 0 })
  const supported = typeof window !== 'undefined' && !!SRClass()

  const now = () => live.current.offset + (performance.now() - live.current.t0) / 1000
  const add = (seg: Omit<Seg, 'id'>) => set((st) => ({ ...st, segs: [...st.segs, { ...seg, id: uid() }].sort((a, b) => a.start - b.start) }))
  const edit = (id: string, p: Partial<Seg>) => set((st) => ({ ...st, segs: st.segs.map((x) => (x.id === id ? { ...x, ...p } : x)) }))

  const stop = () => {
    live.current.on = false
    sr.current?.stop()
    live.current.stream?.getTracks().forEach((t) => t.stop())
    cancelAnimationFrame(live.current.raf)
    setRec(false)
    setInterim('')
    setLevel(0)
  }
  useEffect(() => stop, []) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (append: boolean) => {
    const C = SRClass()
    if (!C) return
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Float32Array(an.fftSize)
      const tick = () => {
        an.getFloatTimeDomainData(buf)
        setLevel(Math.min(1, Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length) * 6))
        setElapsed(now())
        live.current.raf = requestAnimationFrame(tick)
      }
      live.current = { on: true, t0: performance.now(), offset: append ? Math.max(0, ...s.segs.map((x) => x.end)) + 0.5 : 0, segStart: -1, stream, raf: 0 }
      if (!append) set({ segs: [] })
      tick()
    } catch {
      setErr('Microphone permission was denied or no microphone is available.')
      return
    }
    const r = new C()
    r.lang = s.lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let tmp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (live.current.segStart < 0) live.current.segStart = Math.max(0, now() - 0.6)
        if (res.isFinal) {
          const text = res[0].transcript.trim()
          if (text) add({ start: live.current.segStart, end: now(), text: text[0].toUpperCase() + text.slice(1), speaker: s.speaker || undefined })
          live.current.segStart = -1
        } else tmp += res[0].transcript
      }
      setInterim(tmp)
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setErr(e.error === 'not-allowed' ? 'Speech recognition was blocked. Allow microphone access for this site.' : e.error === 'network' ? 'The browser’s speech service is unreachable (it needs a connection in Chrome/Edge).' : `Speech recognition error: ${e.error}`)
      stop()
    }
    r.onend = () => {
      if (live.current.on) r.start() // Chrome ends after silence: keep listening
    }
    sr.current = r
    r.start()
    setRec(true)
  }

  const words = wordCount(s.segs)
  const dur = s.segs.length ? Math.max(...s.segs.map((x) => x.end)) : 0
  const base = (s.title.trim() || 'transcript').replace(/[^\w-]+/g, '-').toLowerCase()
  const seek = (t: number) => {
    if (player.current) {
      player.current.currentTime = t
      void player.current.play()
    }
  }
  const speakers = [...new Set(s.segs.map((x) => x.speaker).filter(Boolean))] as string[]

  return (
    <Split>
      <div>
        <Panel title="🎙 Live transcription">
          {supported ? (
            <>
              <Row>
                <Select label="Language" value={s.lang} onChange={(lang) => set({ lang })} options={LANGS} />
                <Txt label="Speaker label" value={s.speaker} onChange={(speaker) => set({ speaker })} placeholder="optional" />
              </Row>
              <Row>
                {rec ? (
                  <Btn kind="danger" onClick={stop}>■ Stop</Btn>
                ) : (
                  <>
                    <Btn kind="primary" onClick={() => void start(false)}>● Start new</Btn>
                    <Btn onClick={() => void start(true)} disabled={!s.segs.length}>● Continue</Btn>
                  </>
                )}
                {rec && <b style={{ color: 'var(--err)' }}>REC {clock(elapsed)}</b>}
              </Row>
              {rec && (
                <div style={{ marginTop: 10 }}>
                  <Bar value={level} color={level > 0.8 ? 'var(--warn)' : 'var(--ok)'} />
                  <p className="muted" style={{ fontStyle: 'italic', minHeight: 22 }}>{interim || 'Listening…'}</p>
                </div>
              )}
              <Note>Change the speaker label while recording to tag who is talking. In Chrome and Edge the audio is recognised by the browser vendor’s speech service; Safari can work on-device.</Note>
            </>
          ) : (
            <Note tone="warn">This browser has no Web Speech API. Live transcription works in Chrome, Edge and Safari. You can still edit, import and export transcripts below.</Note>
          )}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="🎧 Audio file">
          <Note>
            Fully offline file transcription needs a speech model (Whisper, ~75–500 MB) which this toolbox does not bundle, so recorded files cannot be transcribed automatically here. Load a file to transcribe it <b>manually</b> with timestamps — or play it near the mic while live transcription runs.
          </Note>
          <FileDrop accept="audio/*,video/*" label="Drop an audio/video file" onFiles={([f]) => {
            if (audio) URL.revokeObjectURL(audio.url)
            setAudio({ name: f.name, url: URL.createObjectURL(f) })
          }} />
          {audio && (
            <>
              <audio ref={player} src={audio.url} controls style={{ width: '100%', marginTop: 10 }} onLoadedMetadata={(e) => (e.currentTarget.playbackRate = rate)} />
              <Row>
                <Select label="Speed" value={rate} onChange={(v) => { setRate(v); if (player.current) player.current.playbackRate = v }} options={[[0.5, '0.5×'], [0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×']]} />
                <Btn onClick={() => player.current && (player.current.currentTime -= 5)}>⟲ 5 s</Btn>
              </Row>
              <textarea
                className="k-area"
                rows={2}
                value={draft}
                placeholder="Type what you hear, press Enter to add it at the current time"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && draft.trim() && player.current) {
                    e.preventDefault()
                    const t = player.current.currentTime
                    add({ start: Math.max(0, t - Math.min(6, draft.split(/\s+/).length * 0.4)), end: t, text: draft.trim(), speaker: s.speaker || undefined })
                    setDraft('')
                  }
                }}
              />
            </>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Segments" value={s.segs.length} />
          <Stat label="Words" value={num(words, 0)} />
          <Stat label="Duration" value={clock(dur)} />
          <Stat label="Pace" value={`${num(wpm(s.segs), 0)} wpm`} sub={speakers.length ? `${speakers.length} speaker${speakers.length > 1 ? 's' : ''}` : undefined} />
        </Stats>
        <Panel
          title="Transcript"
          actions={
            <>
              <Btn onClick={() => download(`${base}.srt`, toSrt(s.segs), 'application/x-subrip')}>⬇ SRT</Btn>
              <Btn onClick={() => download(`${base}.vtt`, toVtt(s.segs), 'text/vtt')}>⬇ VTT</Btn>
              <Btn onClick={() => download(`${base}.txt`, toTxt(s.segs, s.times))}>⬇ TXT</Btn>
              <CopyButton text={() => toTxt(s.segs, s.times)} />
            </>
          }
        >
          <Row>
            <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
            <Check label="Timestamps in TXT" value={s.times} onChange={(times) => set({ times })} />
          </Row>
          {s.segs.length === 0 && <Note>No segments yet — start live transcription, add lines from an audio file, or import subtitles.</Note>}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {s.segs.map((x, i) => (
              <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '78px 1fr auto', gap: 8, alignItems: 'start', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <div>
                  <button type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontVariantNumeric: 'tabular-nums' }} onClick={() => seek(x.start)} title={audio ? 'Play from here' : `${x.start.toFixed(1)}–${x.end.toFixed(1)} s`}>
                    {clock(x.start)}
                  </button>
                  <input value={x.speaker ?? ''} placeholder="speaker" onChange={(e) => edit(x.id, { speaker: e.target.value || undefined })} aria-label="Speaker" style={{ width: '100%', fontSize: 12, marginTop: 4 }} />
                </div>
                <textarea className="k-area" rows={2} value={x.text} onChange={(e) => edit(x.id, { text: e.target.value })} aria-label="Segment text" />
                <div style={{ display: 'grid', gap: 4 }}>
                  <Btn kind="ghost" title="Merge with next" disabled={i === s.segs.length - 1} onClick={() => {
                    const n = s.segs[i + 1]
                    set({ segs: s.segs.filter((y) => y.id !== n.id).map((y) => (y.id === x.id ? { ...y, end: n.end, text: `${y.text.trim()} ${n.text.trim()}` } : y)) })
                  }}>⤓</Btn>
                  <Btn kind="ghost" title="Delete" onClick={() => set({ segs: s.segs.filter((y) => y.id !== x.id) })}>✕</Btn>
                </div>
              </div>
            ))}
          </div>
          <Row>
            <Btn onClick={() => add({ start: dur, end: dur + 3, text: 'New line', speaker: s.speaker || undefined })}>+ Line</Btn>
            <label className="k-btn">
              ⬆ Import SRT/VTT
              <input type="file" accept=".srt,.vtt,text/vtt" hidden onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const segs = parseSubs(await f.text()).map((x) => ({ ...x, id: uid() }))
                if (segs.length) set({ segs, title: f.name.replace(/\.\w+$/, '') })
                else setErr('No subtitle cues found in that file.')
              }} />
            </label>
            <Btn kind="ghost" onClick={() => set({ segs: DEMO, title: 'Product sync' })}>Demo transcript</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
