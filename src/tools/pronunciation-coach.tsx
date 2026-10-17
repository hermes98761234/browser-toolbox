import { useEffect, useRef, useState } from 'react'
import { Btn, Check, LineChart, Note, Panel, Ring, Row, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { bestAlternative, compare, simulateAttempt, type Cell } from './lib/pronunciation-coach'

// Web Speech API typings (prefixed in Chrome/Safari; on-device members are new in Chrome).
interface RecAlt { transcript: string; confidence: number }
interface RecResult { isFinal: boolean; length: number; [i: number]: RecAlt }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number; processLocally?: boolean; mode?: string
  onresult: ((e: RecEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void
}
type Avail = 'available' | 'downloadable' | 'downloading' | 'unavailable'
type RecCtor = (new () => Rec) & {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Avail>
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
  availableOnDevice?: (lang: string) => Promise<Avail>
  installOnDevice?: (lang: string) => Promise<boolean>
}
const getRec = (): RecCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
type Engine = 'unsupported' | 'checking' | 'local' | 'downloadable' | 'downloading' | 'cloud' | 'no-local-api'

const LIB: Record<string, [string, string[]][]> = {
  'en-US': [
    ['Tongue twisters', ['She sells seashells by the seashore', 'Red lorry, yellow lorry', 'I thought a thought, but the thought I thought was not the thought I thought', 'Peter Piper picked a peck of pickled peppers']],
    ['TH, V and W', ['The weather was very warm with a light wind', 'Three thin thieves thought they would thrive', 'We wore velvet vests on Wednesday']],
    ['Travel', ['Could you tell me where the nearest station is?', 'I would like a table for two by the window', 'How much does a return ticket cost?']],
    ['Work', ['Let me walk you through the quarterly results', 'I will follow up with a detailed proposal by Thursday', 'Could we reschedule the meeting to next week?']],
  ],
  'en-GB': [['Classics', ['The rain in Spain stays mainly in the plain', 'Would you like a cup of tea?', 'Whether the weather is warm or whether the weather is not']]],
  'es-ES': [['Frases', ['Tres tristes tigres tragaban trigo en un trigal', '¿Dónde está la estación de tren?', 'Me gustaría una mesa para dos personas']]],
  'fr-FR': [['Phrases', ['Les chaussettes de l’archiduchesse sont-elles sèches ?', 'Je voudrais un café, s’il vous plaît', 'Où se trouve la gare la plus proche ?']]],
  'de-DE': [['Sätze', ['Fischers Fritz fischt frische Fische', 'Wo ist der nächste Bahnhof?', 'Ich hätte gern ein Glas Wasser, bitte']]],
  'it-IT': [['Frasi', ['Trentatré trentini entrarono a Trento', 'Vorrei un caffè, per favore', 'Dov’è la stazione?']]],
}
const LANGS: [string, string][] = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano']]

interface Attempt { t: number; phrase: string; heard: string; score: number; mode: 'mic' | 'typed' | 'demo' }
interface State { lang: string; phrase: string; rate: number; voice: string; history: Attempt[]; requireLocal: boolean }
const P0 = 'The weather was very warm with a light wind'
const now = Date.now()
const DEF: State = {
  lang: 'en-US', phrase: P0, rate: 0.85, voice: '', requireLocal: false,
  history: [
    { t: now - 3e5, phrase: P0, heard: 'de wedder was wery warm with light wind', score: 0, mode: 'demo' },
    { t: now - 2e5, phrase: P0, heard: 'the wedder was very warm with a light vind', score: 0, mode: 'demo' },
    { t: now - 1e5, phrase: P0, heard: 'the weather was very warm with a light wint', score: 0, mode: 'demo' },
  ].map((a) => ({ ...a, mode: 'demo' as const, score: compare(a.phrase, a.heard).score })),
}
const MARK_STYLE: Record<Cell['mark'], [string, string]> = {
  ok: ['var(--ok)', 'Correct'], close: ['var(--warn)', 'Close — sound slightly off'], wrong: ['var(--err)', 'Heard a different word'], missed: ['var(--err)', 'Missed'], extra: ['var(--muted)', 'Extra word'],
}

export default function PronunciationCoach() {
  const [s, set] = useToolState('pronunciation-coach', DEF)
  const [engine, setEngine] = useState<Engine>(() => (getRec() ? 'checking' : 'unsupported'))
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const rec = useRef<Rec | null>(null)
  const last = [...s.history].reverse().find((a) => a.phrase === s.phrase)
  const result = last ? compare(s.phrase, last.heard) : null

  useEffect(() => {
    const C = getRec()
    if (!C) return
    let alive = true
    const check = C.available ? C.available({ langs: [s.lang], processLocally: true }) : C.availableOnDevice ? C.availableOnDevice(s.lang) : null
    if (!check) {
      const id = setTimeout(() => setEngine('no-local-api'), 0)
      return () => clearTimeout(id)
    }
    check.then((a) => { if (alive) setEngine(a === 'available' ? 'local' : a === 'downloadable' ? 'downloadable' : a === 'downloading' ? 'downloading' : 'cloud') })
      .catch(() => { if (alive) setEngine('cloud') })
    return () => { alive = false }
  }, [s.lang])

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const langVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(s.lang.slice(0, 2).toLowerCase()))

  const speak = (text: string, rate = s.rate) => {
    if (typeof speechSynthesis === 'undefined') return setErr('Speech synthesis is not available in this browser.')
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = s.lang
    u.rate = rate
    const v = langVoices.find((x) => x.name === s.voice) ?? langVoices.find((x) => x.lang.replace('_', '-') === s.lang) ?? langVoices[0]
    if (v) u.voice = v
    speechSynthesis.speak(u)
  }

  const record = (heard: string, mode: Attempt['mode']) => {
    const score = compare(s.phrase, heard).score
    set((st) => ({ ...st, history: [...st.history.slice(-199), { t: Date.now(), phrase: st.phrase, heard, score, mode }] }))
  }

  const install = async () => {
    const C = getRec()
    if (!C) return
    setEngine('downloading')
    try {
      const ok = C.install ? await C.install({ langs: [s.lang], processLocally: true }) : C.installOnDevice ? await C.installOnDevice(s.lang) : false
      setEngine(ok ? 'local' : 'cloud')
    } catch { setEngine('cloud') }
  }

  const listen = () => {
    const C = getRec()
    if (!C) return
    setErr('')
    const r = new C()
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 5
    r.lang = s.lang
    if (engine === 'local') { r.processLocally = true; if ('mode' in r) r.mode = 'ondevice-only' }
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          const alts = Array.from({ length: res.length }, (_, k) => res[k].transcript.trim())
          record(bestAlternative(s.phrase, alts).text, 'mic')
          setInterim('')
        } else setInterim(res[0].transcript)
      }
    }
    r.onerror = (e) => {
      const m: Record<string, string> = { 'not-allowed': 'Microphone access was blocked. Allow it for this site, or use typed mode below.', network: 'The speech service could not be reached (cloud recognition needs a connection).', 'no-speech': 'No speech detected — try again a little closer to the mic.', 'language-not-supported': 'This language is not supported by the recogniser.', aborted: '' }
      const msg = m[e.error] ?? `Recognition error: ${e.error}`
      if (msg) setErr(msg)
    }
    r.onend = () => { setListening(false); setInterim('') }
    rec.current = r
    try { r.start(); setListening(true) } catch { setErr('Could not start recognition.') }
  }
  useEffect(() => () => rec.current?.stop(), [])

  const status: Record<Engine, [string, 'ok' | 'warn' | 'err' | 'info', string]> = {
    local: ['🔒 On-device', 'ok', 'Recognition runs on this device: your voice is not sent anywhere.'],
    downloadable: ['⬇ On-device after download', 'info', 'Your browser can recognise this language locally after a one-time language-pack download. Until then it uses the cloud service.'],
    downloading: ['⏳ Downloading language pack…', 'info', 'The on-device model is being installed by the browser.'],
    cloud: ['☁ Cloud service', 'warn', 'Audio is streamed to the browser vendor’s speech service (Google for Chrome) for recognition. Your scores and history stay in this browser.'],
    'no-local-api': ['☁ Cloud or unknown', 'warn', 'This browser cannot confirm on-device recognition, so assume audio goes to the vendor’s speech service (Chrome/Edge online; Safari may be on-device). History stays here.'],
    checking: ['… Checking', 'info', 'Checking whether on-device recognition is available.'],
    unsupported: ['✕ No speech recognition', 'err', 'This browser has no SpeechRecognition (e.g. Firefox). Use typed mode: say the phrase, type what a listener would hear, or try a simulated attempt.'],
  }
  const [stLabel, stTone, stText] = status[engine]
  const blocked = s.requireLocal && engine !== 'local'
  const hist = s.history.filter((a) => a.phrase === s.phrase)
  const best = hist.reduce((a, h) => Math.max(a, h.score), 0)
  const weak = result ? result.cells.filter((c) => c.mark !== 'ok' && c.target) : []
  const phrases = LIB[s.lang] ?? LIB['en-US']

  return (
    <Split>
      <div>
        <Panel title="Target phrase">
          <Row>
            <Select label="Language" value={s.lang} onChange={(lang) => set({ lang, phrase: (LIB[lang] ?? LIB['en-US'])[0][1][0], voice: '' })} options={LANGS} />
            <Select label="Voice" value={s.voice} onChange={(voice) => set({ voice })} options={[['', langVoices.length ? 'Default' : 'No voices for this language'] as [string, string], ...langVoices.map((v) => [v.name, `${v.name}${v.localService ? '' : ' (online)'}`] as [string, string])]} />
          </Row>
          <Txt label="Phrase to practise" value={s.phrase} onChange={(phrase) => set({ phrase })} />
          {phrases.map(([cat, list]) => (
            <details key={cat} style={{ margin: '4px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{cat}</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {list.map((p) => <Btn key={p} kind={p === s.phrase ? 'primary' : 'ghost'} onClick={() => set({ phrase: p })}>{p}</Btn>)}
              </div>
            </details>
          ))}
          <Slider label="Speaking rate" value={s.rate} onChange={(rate) => set({ rate })} min={0.5} max={1.3} step={0.05} show={(v) => `${v.toFixed(2)}×`} />
          <Row>
            <Btn onClick={() => speak(s.phrase)}>🔊 Hear it</Btn>
            <Btn kind="ghost" onClick={() => speak(s.phrase, 0.55)}>🐢 Slowly</Btn>
          </Row>
        </Panel>
        <Panel title="Your turn">
          <Note tone={stTone}><b>{stLabel}.</b> {stText}</Note>
          {engine === 'downloadable' && <Btn onClick={() => void install()}>⬇ Install on-device language pack</Btn>}
          {engine !== 'unsupported' && <Check label="Only use on-device recognition" value={s.requireLocal} onChange={(requireLocal) => set({ requireLocal })} />}
          <Row>
            {listening ? <Btn kind="danger" onClick={() => rec.current?.stop()}>■ Stop</Btn> : <Btn kind="primary" disabled={engine === 'unsupported' || engine === 'checking' || blocked} onClick={listen}>🎙 Speak now</Btn>}
            <Btn onClick={() => record(simulateAttempt(s.phrase, Date.now()), 'demo')}>🎲 Simulated attempt</Btn>
          </Row>
          {listening && <p style={{ fontStyle: 'italic' }}>Listening… {interim}</p>}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Txt label="Typed mode: what was heard" value={typed} onChange={setTyped} placeholder="e.g. de wedder was wery warm" />
          </Row>
          <Btn disabled={!typed.trim()} onClick={() => { record(typed, 'typed'); setTyped('') }}>Compare typed text</Btn>
        </Panel>
      </div>
      <div>
        {result && last ? (
          <>
            <Stats>
              <div className="k-stat" style={{ alignItems: 'center' }}><span className="k-stat-label">Last score</span><Ring value={result.score / 100} label={`${result.score}`} color={result.score >= 85 ? 'var(--ok)' : result.score >= 60 ? 'var(--warn)' : 'var(--err)'} /></div>
              <Stat label="Words right" value={`${result.counts.ok} / ${result.cells.filter((c) => c.target).length}`} sub={`${result.counts.close} close · ${result.counts.missed + result.counts.wrong} missed`} />
              <Stat label="Best on this phrase" value={best} sub={`${hist.length} attempt${hist.length === 1 ? '' : 's'}`} tone="accent" />
            </Stats>
            <Panel title="Word-by-word">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 18 }}>
                {result.cells.map((c, i) => (
                  <span key={i} title={`${MARK_STYLE[c.mark][1]}${c.heard && c.target && c.heard !== c.target ? ` — heard “${c.heard}”` : ''}`}
                    style={{ padding: '4px 10px', borderRadius: 8, border: `2px solid ${MARK_STYLE[c.mark][0]}`, textDecoration: c.mark === 'extra' ? 'line-through' : undefined, opacity: c.mark === 'extra' ? 0.7 : 1, cursor: c.target ? 'pointer' : undefined }}
                    onClick={() => c.target && speak(c.target, 0.6)}>
                    {c.target ?? c.heard}
                    {c.heard && c.target && c.heard !== c.target && <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>heard “{c.heard}”</small>}
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>Heard ({last.mode}): “{last.heard}”. Click a word to hear it slowly. <span style={{ color: 'var(--ok)' }}>■</span> correct <span style={{ color: 'var(--warn)' }}>■</span> close <span style={{ color: 'var(--err)' }}>■</span> missed/wrong <s>extra</s></p>
              {weak.length > 0 ? <Note tone="warn">Focus on: {weak.map((c) => <b key={c.target} style={{ marginRight: 8 }}>{c.target}</b>)} — listen slowly, then repeat just those words before the whole phrase.</Note> : <Note tone="ok">Every word was recognised. Try speaking a little faster or pick a harder phrase.</Note>}
            </Panel>
          </>
        ) : <Note>Record or simulate an attempt to see word-level feedback.</Note>}
        <Panel title="Retry history" actions={<Btn kind="ghost" onClick={() => set({ history: s.history.filter((a) => a.phrase !== s.phrase) })}>Clear this phrase</Btn>}>
          {hist.length > 1 && <LineChart series={[{ name: 'Score', points: hist.map((h, i) => [i + 1, h.score]), area: true }]} yMin={0} yMax={100} xLabel="Attempt" fx={(v) => (Number.isInteger(v) ? String(v) : "")} fy={(v) => String(Math.round(v))} height={180} />}
          <Table head={['When', 'Mode', 'Heard', 'Score']} rows={[...hist].reverse().slice(0, 12).map((h) => [new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), h.mode, h.heard, <b key="s" style={{ color: h.score >= 85 ? 'var(--ok)' : h.score >= 60 ? 'var(--warn)' : 'var(--err)' }}>{h.score}</b>])} />
          <p className="muted" style={{ fontSize: 13 }}>Recognisers guess the most likely sentence, so a word marked correct means it was intelligible — not necessarily native-like. Scores and history are stored only in this browser.</p>
        </Panel>
      </div>
    </Split>
  )
}
