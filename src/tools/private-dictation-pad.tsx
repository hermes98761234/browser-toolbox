import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CopyButton, Note, Panel, Row, Select, Split, Stat, Stats, Table, download, useToolState } from '../kit'
import { PUNCT, controlCommand, insertPhrase, wordCount } from './lib/private-dictation-pad'

// Web Speech API typings (prefixed in Chrome/Safari; on-device members are new in Chrome).
interface RecResult { isFinal: boolean; 0: { transcript: string } }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  continuous: boolean; interimResults: boolean; lang: string; processLocally?: boolean; mode?: string
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

const LANGS: [string, string][] = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['de-DE', 'Deutsch'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['it-IT', 'Italiano'], ['pt-BR', 'Português (BR)'], ['pl-PL', 'Polski'], ['uk-UA', 'Українська'], ['nl-NL', 'Nederlands'], ['ja-JP', '日本語'], ['zh-CN', '中文']]
const SAMPLE = 'Meeting notes, Thursday\n\nWe agreed to ship the beta on March 3. Anna will draft the release notes and I will update the docs.\n\nOpen questions: pricing for teams, and whether to keep the free tier.'
const DEMO = ['new paragraph action items colon new line', 'call the printer about the brochure proof period', 'new line book the venue for the launch party exclamation mark', 'scratch that', 'new line book the venue for the launch event period']

interface State { text: string; lang: string; commands: boolean; requireLocal: boolean; savedAt: number }
const DEF: State = { text: SAMPLE, lang: 'en-US', commands: true, requireLocal: false, savedAt: 0 }

export default function PrivateDictationPad() {
  const [s, set] = useToolState('private-dictation-pad', DEF)
  const [engine, setEngine] = useState<Engine>(() => (getRec() ? 'checking' : 'unsupported'))
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [err, setErr] = useState('')
  const [demo, setDemo] = useState(false)
  const [undoN, setUndoN] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef(s.text)
  const cursor = useRef(s.text.length)
  const history = useRef<string[]>([])
  const rec = useRef<Rec | null>(null)
  const want = useRef(false)
  const settings = useRef({ commands: s.commands, engine })

  useEffect(() => {
    textRef.current = s.text
  }, [s.text])
  useEffect(() => {
    settings.current = { commands: s.commands, engine }
  }, [s.commands, engine])

  // which engine will this browser use for the chosen language?
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

  const install = async () => {
    const C = getRec()
    if (!C) return
    setEngine('downloading')
    try {
      const ok = C.install ? await C.install({ langs: [s.lang], processLocally: true }) : C.installOnDevice ? await C.installOnDevice(s.lang) : false
      setEngine(ok ? 'local' : 'cloud')
      if (!ok) setErr('The on-device language pack could not be installed.')
    } catch {
      setEngine('cloud')
      setErr('The on-device language pack could not be installed.')
    }
  }

  const apply = (phrase: string) => {
    const ctl = controlCommand(phrase)
    if (ctl === 'stop') return stop()
    if (ctl === 'scratch') {
      const prev = history.current.pop()
      setUndoN(history.current.length)
      if (prev !== undefined) commitText(prev, Math.min(cursor.current, prev.length))
      return
    }
    history.current = [...history.current.slice(-50), textRef.current]
    setUndoN(history.current.length)
    const pos = Math.min(cursor.current, textRef.current.length)
    const r = insertPhrase(textRef.current, pos, phrase, { commands: settings.current.commands })
    commitText(r.text, r.cursor)
  }
  const commitText = (text: string, pos: number) => {
    textRef.current = text
    cursor.current = pos
    set({ text, savedAt: Date.now() })
    requestAnimationFrame(() => {
      const el = ta.current
      if (el && document.activeElement === el) el.setSelectionRange(pos, pos)
    })
  }

  const start = () => {
    const C = getRec()
    if (!C) return
    setErr('')
    const r = new C()
    r.continuous = true
    r.interimResults = true
    r.lang = s.lang
    if (settings.current.engine === 'local') {
      r.processLocally = true
      if ('mode' in r) r.mode = 'ondevice-only'
    }
    r.onresult = (e) => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) apply(res[0].transcript)
        else inter += res[0].transcript
      }
      setInterim(inter)
    }
    r.onerror = (e) => {
      const m: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked. Allow the microphone for this site and try again.',
        'service-not-allowed': 'Speech recognition is disabled in this browser.',
        network: 'The browser’s speech service could not be reached (it needs a connection when not on-device).',
        'language-not-supported': 'This language is not supported by the recognizer.',
        'no-speech': '',
        aborted: '',
      }
      const msg = m[e.error] ?? `Recognition error: ${e.error}`
      if (msg) setErr(msg)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') want.current = false
    }
    r.onend = () => {
      setInterim('')
      if (want.current) setTimeout(() => { try { r.start() } catch { /* already started */ } }, 150) // Chrome ends after silence; keep going
      else setListening(false)
    }
    rec.current = r
    want.current = true
    try {
      r.start()
      setListening(true)
    } catch {
      setErr('Could not start recognition.')
    }
  }
  function stop() {
    want.current = false
    rec.current?.stop()
    setListening(false)
    setInterim('')
  }
  useEffect(() => () => { want.current = false; rec.current?.stop() }, [])

  // demo: feed sample phrases through the same pipeline, word by word
  useEffect(() => {
    if (!demo) return
    let i = 0, w = 0, alive = true
    const tick = () => {
      if (!alive) return
      const words = DEMO[i].split(' ')
      if (w < words.length) {
        setInterim(words.slice(0, ++w).join(' '))
        setTimeout(tick, 180)
      } else {
        setInterim('')
        apply(DEMO[i])
        i++
        w = 0
        if (i < DEMO.length) setTimeout(tick, 700)
        else setDemo(false)
      }
    }
    cursor.current = textRef.current.length
    setTimeout(tick, 300)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo])

  const blockedByPrivacy = s.requireLocal && engine !== 'local'
  const words = wordCount(s.text)
  const status: Record<Engine, [string, 'ok' | 'warn' | 'err' | 'info', string]> = {
    local: ['🔒 On-device', 'ok', 'Recognition runs on this device: audio is not sent anywhere. Works offline.'],
    downloadable: ['⬇ On-device available after download', 'info', 'Your browser can recognise this language locally after a one-time language-pack download. Until then it would use the cloud service.'],
    downloading: ['⏳ Downloading language pack…', 'info', 'The on-device model is being installed by the browser.'],
    cloud: ['☁ Cloud service', 'warn', 'On-device recognition is not available for this language. Audio is streamed to the browser vendor’s speech service (Google for Chrome). Your text itself stays in this browser.'],
    'no-local-api': ['☁ Cloud or unknown', 'warn', 'This browser has no API to confirm on-device recognition, so assume audio is sent to the vendor’s speech service (Chrome/Edge: online; Safari: may be on-device, not verifiable). Your text stays here.'],
    checking: ['… Checking', 'info', 'Checking whether on-device recognition is available.'],
    unsupported: ['✕ Not supported', 'err', 'This browser has no speech recognition (e.g. Firefox). You can still type, edit and export; try the demo to see voice commands.'],
  }
  const [stLabel, stTone, stText] = status[engine]

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Document"
          actions={<>
            {listening ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" disabled={engine === 'unsupported' || engine === 'checking' || blockedByPrivacy || demo} onClick={start}>🎙 Dictate{engine === 'local' ? ' (on-device)' : engine === 'unsupported' ? '' : ' (cloud)'}</Btn>}
            <Btn disabled={listening || demo} onClick={() => setDemo(true)}>▶ Demo</Btn>
          </>}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontWeight: 700, fontSize: 13, background: `color-mix(in srgb, var(--${stTone === 'info' ? 'accent' : stTone}) 18%, transparent)` }}>{stLabel}</span>
            {listening && <span style={{ color: 'var(--err)', fontWeight: 700 }}>● Listening…</span>}
            {demo && <span className="muted">Demo (simulated speech, no microphone)</span>}
          </div>
          <textarea
            ref={ta}
            className="k-area"
            rows={16}
            value={s.text}
            onChange={(e) => { textRef.current = e.target.value; cursor.current = e.target.selectionStart; set({ text: e.target.value, savedAt: Date.now() }) }}
            onSelect={(e) => (cursor.current = (e.target as HTMLTextAreaElement).selectionStart)}
            style={{ fontSize: 16, lineHeight: 1.55 }}
            aria-label="Dictated text"
          />
          <div style={{ minHeight: 26, color: 'var(--muted)', fontStyle: 'italic', marginTop: 6 }}>{interim ? `“${interim}…”` : ''}</div>
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn onClick={() => download('dictation.txt', s.text, 'text/plain')}>⬇ .txt</Btn>
            <Btn onClick={() => download('dictation.md', s.text, 'text/markdown')}>⬇ .md</Btn>
            <CopyButton text={() => s.text} />
            <Btn kind="ghost" disabled={!undoN} onClick={() => { const p = history.current.pop(); setUndoN(history.current.length); if (p !== undefined) commitText(p, p.length) }}>↶ Undo dictation</Btn>
            <Btn kind="ghost" onClick={() => { if (!s.text || confirm('Clear the document?')) { history.current.push(s.text); setUndoN(history.current.length); commitText('', 0) } }}>Clear</Btn>
          </Row>
        </Panel>
        <Stats>
          <Stat label="Words" value={words} />
          <Stat label="Characters" value={s.text.length} />
          <Stat label="Reading time" value={`${Math.max(1, Math.round(words / 230))} min`} />
          <Stat label="Autosaved" value={s.savedAt ? new Date(s.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '✓'} sub="in this browser" />
        </Stats>
      </div>
      <div>
        <Panel title="Privacy & engine">
          <Note tone={stTone}>{stText}</Note>
          {engine === 'downloadable' && <Btn kind="primary" onClick={install}>⬇ Install on-device {LANGS.find((l) => l[0] === s.lang)?.[1]} model</Btn>}
          <Select label="Language" value={s.lang} onChange={(lang) => set({ lang })} options={LANGS} />
          <Check label="Only dictate when recognition is on-device" value={s.requireLocal} onChange={(requireLocal) => set({ requireLocal })} />
          {blockedByPrivacy && <p className="muted" style={{ margin: '4px 0' }}>Dictation is disabled until on-device recognition is available for this language.</p>}
          <Check label="Spoken punctuation commands" value={s.commands} onChange={(commands) => set({ commands })} />
          <p className="muted" style={{ fontSize: 13 }}>The document is stored only in this browser’s local storage and never uploaded by this page.</p>
        </Panel>
        <Panel title="Voice commands">
          <Table head={['Say', 'Inserts']} rows={[
            ...PUNCT.filter(([k]) => !['dot', 'next line', 'next paragraph', 'end quote', 'open paren', 'close paren', 'exclamation point', 'percent sign', 'ampersand'].includes(k))
              .map(([k, v]) => [<b key="k">{k}</b>, v === '\n' ? '↵ line break' : v === '\n\n' ? '↵↵ paragraph' : v.trim()]),
            [<b key="s">scratch that</b>, 'removes the last phrase'],
            [<b key="t">stop listening</b>, 'ends dictation'],
          ]} />
          <p className="muted" style={{ fontSize: 13 }}>Sentences are capitalised automatically. Click anywhere in the text to dictate at that point.</p>
        </Panel>
      </div>
    </Split>
  )
}
