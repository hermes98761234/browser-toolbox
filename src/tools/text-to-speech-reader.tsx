import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Bar, Btn, FileDrop, Note, Panel, Row, Select, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import { cleanText, segments, speakSeconds, wordAt, wordCount } from './lib/text-to-speech-reader'

interface State { text: string; voice: string; lang: string; rate: number; pitch: number; volume: number; pos: number; follow: boolean }

const SAMPLE = `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”

So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.

There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!”

— Lewis Carroll, Alice’s Adventures in Wonderland (1865, public domain)`

const DEF: State = { text: SAMPLE, voice: '', lang: 'en', rate: 1, pitch: 1, volume: 1, pos: 0, follow: true }
const has = typeof window !== 'undefined' && 'speechSynthesis' in window
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export default function TextToSpeechReader() {
  const [s, set, reset] = useToolState('text-to-speech-reader', DEF)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [cur, setCur] = useState(-1)
  const [word, setWord] = useState<[number, number] | null>(null)
  const [edit, setEdit] = useState(false)
  const gen = useRef(0)
  const utt = useRef<SpeechSynthesisUtterance | null>(null)
  const segs = useMemo(() => segments(s.text), [s.text])
  const live = useRef({ s, segs })
  useEffect(() => { live.current = { s, segs } })
  const curEl = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!has) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); gen.current++; speechSynthesis.cancel() }
  }, [])

  useEffect(() => { if (s.follow && curEl.current) curEl.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [cur, s.follow])

  const langs = [...new Set(voices.map((v) => v.lang.split('-')[0]))].sort()
  const shown = voices.filter((v) => !s.lang || v.lang.startsWith(s.lang))
  const voiceObj = voices.find((v) => v.voiceURI === s.voice) ?? shown.find((v) => v.default) ?? shown[0]

  const speakFrom = (i: number) => {
    if (!has) return
    const { s: st, segs: sg } = live.current
    const g = ++gen.current
    speechSynthesis.cancel()
    if (i >= sg.length) { setState('idle'); setCur(-1); setWord(null); set({ pos: 0 }); return }
    const seg = sg[i]
    const u = new SpeechSynthesisUtterance(seg.text)
    const vo = voices.find((v) => v.voiceURI === st.voice) ?? voiceObj
    if (vo) { u.voice = vo; u.lang = vo.lang }
    u.rate = st.rate; u.pitch = st.pitch; u.volume = st.volume
    u.onboundary = (e) => { if (g === gen.current && e.name !== 'sentence') setWord(wordAt(st.text, seg.start + e.charIndex)) }
    u.onend = () => { if (g === gen.current) speakFrom(i + 1) }
    u.onerror = (e) => { if (g === gen.current && e.error !== 'interrupted' && e.error !== 'canceled') { setState('idle') } }
    utt.current = u
    setCur(i); setWord(null); setState('playing'); set({ pos: i })
    speechSynthesis.speak(u)
  }
  const play = () => {
    if (state === 'paused') { speechSynthesis.resume(); setState('playing'); return }
    speakFrom(Math.min(s.pos, Math.max(0, segs.length - 1)))
  }
  const pause = () => { speechSynthesis.pause(); setState('paused') }
  const stop = () => { gen.current++; speechSynthesis.cancel(); setState('idle'); setCur(-1); setWord(null) }
  const jump = (d: number) => { const i = Math.max(0, Math.min(segs.length - 1, (cur >= 0 ? cur : s.pos) + d)); if (state === 'idle') set({ pos: i }); else speakFrom(i) }

  const onFiles = async (f: File[]) => {
    const file = f[0]
    if (!file) return
    const raw = await file.text()
    const kind = /\.html?$/i.test(file.name) ? 'html' : /\.(md|markdown)$/i.test(file.name) ? 'md' : 'txt'
    stop()
    set({ text: cleanText(raw, kind), pos: 0 })
  }

  const words = wordCount(s.text)
  const doneWords = segs.slice(0, Math.max(0, cur >= 0 ? cur : s.pos)).reduce((a, x) => a + wordCount(x.text), 0)
  const total = speakSeconds(words, s.rate)
  const left = speakSeconds(words - doneWords, s.rate)

  const reading = segs.map((seg, i) => {
    const active = i === cur
    const isWord = active && word && word[0] >= seg.start && word[1] <= seg.end
    const body = isWord ? (
      <>{s.text.slice(seg.start, word![0])}<mark style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 3, padding: '0 1px' }}>{s.text.slice(word![0], word![1])}</mark>{s.text.slice(word![1], seg.end)}</>
    ) : seg.text
    const gap = s.text.slice(seg.end, segs[i + 1]?.start ?? seg.end)
    return (
      <span key={i}>
        <span ref={active ? curEl : undefined} onClick={() => (state === 'idle' ? set({ pos: i }) : speakFrom(i))} title="Read from here"
          style={{ cursor: 'pointer', borderRadius: 4, background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : i === s.pos && state === 'idle' ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined, outline: i === s.pos && state === 'idle' ? '1px dashed var(--accent)' : undefined }}>{body}</span>
        {gap.includes('\n') ? <><br /><br /></> : ' '}
      </span>
    )
  })

  return (
    <Split wide="right">
      <div>
        <Panel title="Voice">
          {!has && <Note tone="err">This browser does not support speech synthesis (Web Speech API). Try Chrome, Edge, Safari or Firefox on desktop or mobile.</Note>}
          {has && !voices.length && <Note tone="warn">No voices reported yet. Some browsers load them after a moment or only once you press Play.</Note>}
          <Select label="Language" value={s.lang} onChange={(lang) => set({ lang, voice: '' })} options={[['', 'All languages'], ...langs.map((l) => [l, l] as const)]} />
          <Select label="Voice" value={voiceObj?.voiceURI ?? ''} onChange={(voice) => set({ voice })} options={shown.length ? shown.map((v) => [v.voiceURI, `${v.name} (${v.lang})${v.localService ? '' : ' ☁'}`] as const) : [['', 'Default voice']]} />
          <Slider label="Rate" value={s.rate} onChange={(rate) => set({ rate })} min={0.5} max={2.5} step={0.05} show={(v) => `${num(v, 2)}×`} />
          <Slider label="Pitch" value={s.pitch} onChange={(pitch) => set({ pitch })} min={0} max={2} step={0.05} show={(v) => num(v, 2)} />
          <Slider label="Volume" value={s.volume} onChange={(volume) => set({ volume })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Row>
            <Btn onClick={() => { if (!has) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('This is how I sound at this speed.'); if (voiceObj) u.voice = voiceObj; u.rate = s.rate; u.pitch = s.pitch; u.volume = s.volume; speechSynthesis.speak(u) }} disabled={!has}>🔊 Test voice</Btn>
            {[0.8, 1, 1.25, 1.5, 2].map((r) => <Btn key={r} kind={s.rate === r ? 'primary' : 'ghost'} onClick={() => set({ rate: r })}>{r}×</Btn>)}
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Changes apply from the next sentence. ☁ = online voice (text is sent to the browser vendor's speech service); others run on your device.</p>
        </Panel>
        <Panel title="Load a document">
          <FileDrop accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html" onFiles={(f) => void onFiles(f)} label="Drop a .txt, .md or .html file" />
          <Row>
            <Btn kind="ghost" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) { stop(); set({ text: t, pos: 0 }) } } catch { setEdit(true) } }}>📋 Paste from clipboard</Btn>
            <Btn kind="ghost" onClick={() => { stop(); reset() }}>Sample text</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Words" value={num(words, 0)} sub={`${segs.length} sentences`} />
          <Stat label="Listening time" value={mmss(total)} sub={`at ${num(s.rate, 2)}×`} />
          <Stat label="Remaining" value={mmss(left)} tone="accent" sub={`sentence ${Math.min(segs.length, (cur >= 0 ? cur : s.pos) + 1)} of ${segs.length}`} />
        </Stats>
        <Panel
          title="Reader"
          actions={
            <Row wrap={false}>
              <Btn kind="ghost" onClick={() => jump(-1)} title="Previous sentence">⏮</Btn>
              {state === 'playing' ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={play} disabled={!has || !segs.length}>▶ {state === 'paused' ? 'Resume' : 'Play'}</Btn>}
              <Btn kind="ghost" onClick={stop} disabled={state === 'idle'} title="Stop">⏹</Btn>
              <Btn kind="ghost" onClick={() => jump(1)} title="Next sentence">⏭</Btn>
            </Row>
          }
        >
          <Bar value={cur >= 0 ? cur + 1 : s.pos} max={Math.max(1, segs.length)} />
          <Row>
            <Btn kind={edit ? 'primary' : 'ghost'} onClick={() => { stop(); setEdit(!edit) }}>{edit ? '✓ Done editing' : '✎ Edit text'}</Btn>
            <label className="k-check"><input type="checkbox" checked={s.follow} onChange={(e) => set({ follow: e.target.checked })} /> Auto-scroll</label>
          </Row>
          {edit ? (
            <Area value={s.text} onChange={(text) => set({ text, pos: 0 })} rows={16} placeholder="Paste or type text to read aloud…" />
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto', fontSize: 18, lineHeight: 1.7, padding: '8px 4px' }}>{segs.length ? reading : <p className="muted">Nothing to read — edit the text or load a file.</p>}</div>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Click any sentence to start reading from there. Word highlighting depends on the voice: some online voices don't report word boundaries, so only the sentence is highlighted.</p>
        </Panel>
      </div>
    </Split>
  )
}
