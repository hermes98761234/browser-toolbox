import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { FLUENCY_NORMS, paceSchedule, segments, syllabify, tokenize, wpm } from './lib/read-aloud-helper'

const nowSec = () => performance.now() / 1000
const has = typeof window !== 'undefined' && 'speechSynthesis' in window

const SAMPLES: [string, string][] = [
  ['The Lighthouse Cat', 'Every night, Pip the cat climbed the winding stairs of the old lighthouse. She liked to sit beside the big lamp and watch the ships go by.\n\nOne stormy evening, the lamp flickered and went dark. Pip could hear the waves crashing against the rocks. Far away, a small fishing boat was heading straight for danger.\n\nPip jumped onto the shelf, found the spare bulb with her paw, and knocked it into the keeper’s hands. The light came back, bright and steady. The little boat turned just in time.'],
  ['Why leaves change colour', 'In spring and summer, leaves are green because they are full of chlorophyll. Chlorophyll helps the tree turn sunlight into food.\n\nWhen autumn comes, the days get shorter and colder. The tree stops making chlorophyll, and the green colour slowly fades. Yellow and orange colours, which were hiding underneath all along, can finally be seen. Some trees also make new red colours from the sugar trapped in their leaves.'],
  ['Short practice', 'The sun is up. A dog runs on the sand. It finds a red ball and brings it back to me. We play until it is time to go home.'],
]

const FONTS: [string, string][] = [
  ['Verdana, Tahoma, "Segoe UI", sans-serif', 'Clear sans'],
  ['"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive', 'Friendly'],
  ['Georgia, "Times New Roman", serif', 'Serif'],
  ['"Courier New", ui-monospace, monospace', 'Monospace'],
]
const OVERLAYS: [string, string, string][] = [
  ['none', 'var(--panel)', 'inherit'], ['cream', '#fdf6e3', '#1f2937'], ['yellow', '#fff7c2', '#1f2937'], ['blue', '#dbeafe', '#1f2937'],
  ['green', '#dcfce7', '#1f2937'], ['pink', '#fce7f3', '#1f2937'], ['peach', '#ffe4cc', '#1f2937'], ['dark', '#1e293b', '#f1f5f9'],
]

const DEF = {
  text: SAMPLES[0][1], font: FONTS[0][0], size: 22, letter: 0.06, word: 0.2, line: 1.9, overlay: 'cream',
  ruler: 'follow' as 'off' | 'follow' | 'mouse', sylColor: false, voice: '', rate: 0.9, pitch: 1, target: 100,
}

type Mode = 'idle' | 'speaking' | 'paused' | 'pacing'

export default function ReadAloudHelper() {
  const [s, set] = useToolState('read-aloud-helper', DEF)
  const [editing, setEditing] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [mode, setMode] = useState<Mode>('idle')
  const [cur, setCur] = useState(-1)
  const [sel, setSel] = useState(-1)
  const [mouseY, setMouseY] = useState<number | null>(null)
  const [selfTimer, setSelfTimer] = useState<{ start: number; from: number } | null>(null)
  const [result, setResult] = useState<{ words: number; secs: number } | null>(null)
  const rtRef = useRef({ gen: 0, timer: 0 })
  const pane = useRef<HTMLDivElement>(null)
  const [rulerY, setRulerY] = useState<number | null>(null)

  const toks = useMemo(() => tokenize(s.text), [s.text])
  const sents = useMemo(() => segments(s.text), [s.text])
  const words = useMemo(() => toks.filter((t) => t.word).length, [toks])
  const tokAt = (ch: number) => {
    let lo = 0, hi = toks.length - 1
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (toks[m].start <= ch) lo = m
      else hi = m - 1
    }
    return lo
  }
  const sentOf = (ti: number) => {
    const ch = toks[ti]?.start ?? 0
    const i = sents.findIndex((x) => ch >= x.start && ch < x.end + 1)
    return i < 0 ? 0 : i
  }
  const voiceObj = voices.find((v) => v.voiceURI === s.voice) ?? voices.find((v) => v.default && v.lang.startsWith('en')) ?? voices.find((v) => v.lang.startsWith('en'))

  useEffect(() => {
    if (!has) return
    const rt = rtRef.current
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load)
      rt.gen++
      clearInterval(rt.timer)
      speechSynthesis.cancel()
    }
  }, [])

  // ruler follows the current word
  useEffect(() => {
    if (s.ruler !== 'follow' || cur < 0) return
    const el = pane.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)
    if (el) {
      setRulerY(el.offsetTop + el.offsetHeight / 2)
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [cur, s.ruler])

  const stopAll = () => {
    rtRef.current.gen++
    clearInterval(rtRef.current.timer)
    if (has) speechSynthesis.cancel()
    setMode('idle')
  }

  /** Timed highlighting for voices that never fire boundary events (and for the pacer). */
  const runSchedule = (fromTok: number, toTok: number, pace: number, g: number, onDone?: () => void) => {
    const sched = paceSchedule(toks.slice(fromTok, toTok), pace).map((x) => ({ ...x, idx: x.idx + fromTok }))
    const t0 = nowSec()
    clearInterval(rtRef.current.timer)
    rtRef.current.timer = window.setInterval(() => {
      if (g !== rtRef.current.gen) return clearInterval(rtRef.current.timer)
      const t = nowSec() - t0
      const hit = sched.findLast((x) => x.t <= t)
      if (hit) setCur(hit.idx)
      if (!sched.length || t > sched[sched.length - 1].t + sched[sched.length - 1].d) {
        clearInterval(rtRef.current.timer)
        onDone?.()
      }
    }, 40)
  }

  const say = (text: string, rate: number, g: number, onEnd?: () => void, onWord?: (ch: number) => void) => {
    const u = new SpeechSynthesisUtterance(text)
    if (voiceObj) u.voice = voiceObj
    u.lang = voiceObj?.lang ?? 'en-US'
    u.rate = rate
    u.pitch = s.pitch
    if (onWord) u.onboundary = (e) => g === rtRef.current.gen && e.name === 'word' && onWord(e.charIndex)
    u.onend = () => g === rtRef.current.gen && onEnd?.()
    u.onerror = (e) => {
      if (g === rtRef.current.gen && e.error !== 'interrupted' && e.error !== 'canceled') setMode('idle')
    }
    speechSynthesis.speak(u)
    return u
  }

  const speakSentence = (si: number, rate: number, continueAfter: boolean, fromTok?: number) => {
    if (!has || si >= sents.length) return setMode('idle')
    speechSynthesis.cancel()
    const g = ++rtRef.current.gen
    const seg = sents[si]
    const startCh = fromTok !== undefined ? Math.max(seg.start, toks[fromTok].start) : seg.start
    const text = s.text.slice(startCh, seg.end)
    let gotBoundary = false
    const fallback = window.setTimeout(() => {
      if (!gotBoundary && g === rtRef.current.gen) runSchedule(tokAt(startCh), tokAt(seg.end - 1) + 1, 165 * rate, g)
    }, 700)
    setMode('speaking')
    setCur(tokAt(startCh))
    say(text, rate, g, () => {
      clearTimeout(fallback)
      clearInterval(rtRef.current.timer)
      if (continueAfter && si + 1 < sents.length) speakSentence(si + 1, rate, true)
      else setMode('idle')
    }, (ch) => {
      gotBoundary = true
      clearInterval(rtRef.current.timer)
      setCur(tokAt(startCh + ch))
    })
  }

  const play = () => {
    if (!has) return
    if (mode === 'paused') {
      speechSynthesis.resume()
      return setMode('speaking')
    }
    const from = sel >= 0 ? sel : cur >= 0 ? cur : 0
    speakSentence(sentOf(from), s.rate, true, from)
  }
  const pause = () => {
    speechSynthesis.pause()
    setMode('paused')
  }
  const current = Math.max(0, cur >= 0 ? sentOf(cur) : sel >= 0 ? sentOf(sel) : 0)
  const jump = (d: number) => speakSentence(Math.min(sents.length - 1, Math.max(0, current + d)), s.rate, true)

  const startPacer = () => {
    stopAll()
    const g = ++rtRef.current.gen
    setMode('pacing')
    setResult(null)
    runSchedule(Math.max(0, sel), toks.length, s.target, g, () => setMode('idle'))
  }

  const selWord = sel >= 0 && toks[sel]?.word ? toks[sel].text : ''
  const syl = selWord ? syllabify(selWord) : []
  const sayWord = (kind: 'word' | 'slow' | 'spell') => {
    if (!has || !selWord) return
    stopAll()
    const g = ++rtRef.current.gen
    if (kind === 'word') say(selWord, s.rate, g)
    else if (kind === 'spell') say(selWord.split('').join(', '), 0.7, g)
    else {
      const parts = [...syl, selWord]
      const next = (i: number) => i < parts.length && say(parts[i], i < syl.length ? 0.55 : 0.8, g, () => window.setTimeout(() => next(i + 1), 250))
      next(0)
    }
  }

  const ov = OVERLAYS.find((o) => o[0] === s.overlay) ?? OVERLAYS[0]
  const curSent = cur >= 0 ? sents[sentOf(cur)] : undefined
  const ry = s.ruler === 'mouse' ? mouseY : s.ruler === 'follow' ? rulerY : null
  const band = s.size * s.line * 1.05
  const elapsed = result ? result.secs : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Listen">
          {!has && <Note tone="warn">This browser has no speech synthesis. The display, ruler and pacer still work.</Note>}
          <Row>
            {mode === 'speaking' ? <Btn kind="primary" onClick={pause}>⏸ Pause</Btn> : <Btn kind="primary" onClick={play} disabled={!has || mode === 'pacing'}>▶ {mode === 'paused' ? 'Resume' : sel >= 0 ? 'Read from word' : 'Read aloud'}</Btn>}
            <Btn onClick={stopAll} disabled={mode === 'idle'}>⏹ Stop</Btn>
            <Btn onClick={() => jump(-1)} disabled={!has} title="Previous sentence">⏮</Btn>
            <Btn onClick={() => jump(1)} disabled={!has} title="Next sentence">⏭</Btn>
          </Row>
          <Row>
            <Btn onClick={() => speakSentence(current, Math.max(0.4, s.rate * 0.6), false)} disabled={!has}>🐢 Re-read sentence slowly</Btn>
          </Row>
          <Select label="Voice" value={voiceObj?.voiceURI ?? ''} onChange={(voice) => set({ voice })} options={voices.length ? voices.map((v) => [v.voiceURI, `${v.name} (${v.lang})`] as const) : [['', 'Default voice'] as const]} />
          <Slider label="Speed" value={s.rate} onChange={(rate) => set({ rate })} min={0.4} max={1.6} step={0.05} show={(v) => `${num(v, 2)}×`} />
          <Slider label="Pitch" value={s.pitch} onChange={(pitch) => set({ pitch })} min={0.5} max={1.5} step={0.05} />
        </Panel>
        <Panel title="Word helper">
          {selWord ? (
            <>
              <div style={{ fontSize: 34, fontFamily: s.font, letterSpacing: '0.08em', textAlign: 'center', margin: '6px 0' }}>
                {syl.map((p, i) => (
                  <span key={i} style={{ color: i % 2 ? 'var(--accent)' : undefined }}>{p}{i < syl.length - 1 && <span className="muted"> · </span>}</span>
                ))}
              </div>
              <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>{syl.length} syllable{syl.length > 1 ? 's' : ''} · {selWord.length} letters</p>
              <Row>
                <Btn onClick={() => sayWord('word')} disabled={!has}>🔊 Say it</Btn>
                <Btn onClick={() => sayWord('slow')} disabled={!has}>🧩 Syllable by syllable</Btn>
                <Btn onClick={() => sayWord('spell')} disabled={!has}>🔤 Spell it</Btn>
                <Btn kind="ghost" onClick={() => setSel(-1)}>Clear</Btn>
              </Row>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Tap any word in the text to hear it on its own, split into syllables, or spelled out. Reading then starts from that word.</p>
          )}
        </Panel>
        <Panel title="Reading-pace practice">
          <Slider label="Target pace" value={s.target} onChange={(target) => set({ target })} min={40} max={250} step={5} unit=" wpm" />
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>The pacer lights up words at this speed (no voice) — read along out loud and try to keep up.</p>
          <Row>
            <Btn kind="primary" onClick={mode === 'pacing' ? stopAll : startPacer}>{mode === 'pacing' ? '⏹ Stop pacer' : '🚦 Start pacer'}</Btn>
            {selfTimer ? (
              <Btn onClick={() => {
                const secs = (performance.now() - selfTimer.start) / 1000
                const end = sel > selfTimer.from ? sel : toks.length
                setResult({ words: toks.slice(selfTimer.from, end).filter((t) => t.word).length, secs })
                setSelfTimer(null)
              }}>✅ I finished</Btn>
            ) : (
              <Btn onClick={() => { setResult(null); setSelfTimer({ start: performance.now(), from: Math.max(0, sel) }) }}>⏱ Time my reading</Btn>
            )}
          </Row>
          {selfTimer && <Note>Read aloud from {sel >= 0 ? `“${toks[Math.max(0, sel)].text}”` : 'the start'} to the end (or tap the last word you read), then press “I finished”.</Note>}
          {result && (
            <>
              <Stats>
                <Stat label="Your pace" value={`${num(wpm(result.words, elapsed), 0)} wpm`} tone="accent" sub={`${result.words} words in ${num(elapsed, 1)} s`} />
              </Stats>
              <p className="muted" style={{ fontSize: 12 }}>Typical oral-reading fluency (median, end of year): {FLUENCY_NORMS.map(([g, v]) => `${g} ${v}`).join(' · ')} wpm. Accuracy and expression matter more than speed.</p>
            </>
          )}
        </Panel>
      </div>
      <div>
        <Panel
          title={editing ? 'Edit text' : 'Read'}
          actions={
            <>
              <Select label="" value={-1} onChange={(i: number) => { if (i >= 0) { stopAll(); setSel(-1); setCur(-1); set({ text: SAMPLES[i][1] }) } }} options={[[-1, 'Sample texts…'] as const, ...SAMPLES.map(([n], i) => [i, n] as const)]} />
              <Btn onClick={() => { stopAll(); setEditing(!editing) }}>{editing ? '✓ Done' : '✏️ Edit / paste'}</Btn>
            </>
          }
        >
          {editing ? (
            <Area value={s.text} onChange={(text) => { setSel(-1); setCur(-1); set({ text }) }} rows={14} placeholder="Paste or type the text to practise…" />
          ) : (
            <div
              style={{
                background: ov[1], color: ov[2], fontFamily: s.font, fontSize: s.size, lineHeight: s.line,
                letterSpacing: `${s.letter}em`, wordSpacing: `${s.word}em`, whiteSpace: 'pre-wrap', padding: '18px 22px', borderRadius: 10,
                maxHeight: 560, overflowY: 'auto', border: '1px solid var(--line)', textAlign: 'left',
              }}
            >
              <div
                ref={pane}
                style={{ position: 'relative' }}
                onMouseMove={(e) => s.ruler === 'mouse' && setMouseY(e.clientY - e.currentTarget.getBoundingClientRect().top)}
                onMouseLeave={() => setMouseY(null)}
              >
              {toks.map((t, i) => {
                if (!t.word) return <span key={i}>{t.text}</span>
                const inSent = curSent && t.start >= curSent.start && t.end <= curSent.end
                const isCur = i === cur
                const isSel = i === sel
                const done = cur >= 0 && i < cur && inSent
                return (
                  <span
                    key={i}
                    data-i={i}
                    onClick={() => setSel(i === sel ? -1 : i)}
                    style={{
                      cursor: 'pointer', borderRadius: 5, padding: '0 1px', transition: 'background .12s',
                      background: isCur ? '#fde047' : isSel ? 'rgba(99,102,241,.25)' : done ? 'rgba(250,204,21,.22)' : undefined,
                      color: isCur ? '#111827' : undefined,
                      boxShadow: isSel ? 'inset 0 -2px 0 var(--accent)' : undefined,
                      textDecoration: inSent && !isCur ? 'underline dotted rgba(100,116,139,.6)' : undefined,
                    }}
                  >
                    {s.sylColor ? syllabify(t.text).map((p, k) => <span key={k} style={{ color: k % 2 && !isCur ? '#2563eb' : undefined }}>{p}</span>) : t.text}
                  </span>
                )
              })}
              {ry !== null && (
                <>
                  <div style={{ position: 'absolute', left: -22, right: -22, top: -18, height: Math.max(0, ry - band / 2 + 18), background: 'rgba(15,23,42,.38)', pointerEvents: 'none', transition: 'height .2s' }} />
                  <div style={{ position: 'absolute', left: -22, right: -22, top: ry + band / 2, bottom: -18, background: 'rgba(15,23,42,.38)', pointerEvents: 'none', transition: 'top .2s' }} />
                </>
              )}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{words} words · {sents.length} sentences · about {num((words / (165 * s.rate)) * 60, 0)} s to listen</p>
        </Panel>
        <Panel title="Display">
          <Row>
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
            <Select label="Line focus ruler" value={s.ruler} onChange={(ruler) => set({ ruler })} options={[['follow', 'Follows the voice'], ['mouse', 'Follows the pointer'], ['off', 'Off']]} />
          </Row>
          <Slider label="Text size" value={s.size} onChange={(size) => set({ size })} min={14} max={40} unit=" px" />
          <Slider label="Letter spacing" value={s.letter} onChange={(letter) => set({ letter })} min={0} max={0.3} step={0.01} unit=" em" />
          <Slider label="Word spacing" value={s.word} onChange={(word) => set({ word })} min={0} max={1} step={0.05} unit=" em" />
          <Slider label="Line spacing" value={s.line} onChange={(line) => set({ line })} min={1.2} max={3} step={0.1} unit="×" />
          <p className="k-label" style={{ margin: '6px 0' }}>Colour overlay</p>
          <Row>
            {OVERLAYS.map(([id, bg]) => (
              <button key={id} type="button" onClick={() => set({ overlay: id })} title={id} aria-label={`${id} overlay`}
                style={{ width: 34, height: 34, borderRadius: 8, background: bg, border: s.overlay === id ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />
            ))}
          </Row>
          <Check label="Colour alternate syllables" value={s.sylColor} onChange={(sylColor) => set({ sylColor })} />
          <Seg value={s.size >= 26 ? 'big' : 'std'} onChange={(v) => set(v === 'big' ? { size: 28, letter: 0.12, word: 0.35, line: 2.2 } : { size: 20, letter: 0.04, word: 0.16, line: 1.7 })} options={[['std', 'Standard layout'], ['big', 'Extra-spaced layout']]} />
          <Note>Wider letter, word and line spacing and a tinted background help many readers with dyslexia or visual stress. Try a few overlays — the best colour differs from person to person.</Note>
        </Panel>
      </div>
    </Split>
  )
}
