import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, Note, Panel, Row, Select, Slider, Split, useToolState } from '../kit'
import { findTimer, mmss, parseCommand, parseRecipe, type Command } from './lib/hands-free-recipe-reader'

const SAMPLE = `Weeknight Tomato Pasta

Ingredients
- 400 g spaghetti
- 3 tbsp olive oil
- 4 garlic cloves, sliced
- 1 can (400 g) chopped tomatoes
- 1 tsp chili flakes
- Salt and black pepper
- Handful of fresh basil
- 40 g grated parmesan

Method
1. Bring a large pot of well-salted water to a boil.
2. Add the spaghetti and cook for 9 minutes, stirring now and then.
3. Meanwhile, warm the olive oil in a wide pan and gently fry the garlic for 2 minutes until fragrant.
4. Add the chili flakes and tomatoes, then simmer for 8-10 minutes until thickened.
5. Scoop out a mug of pasta water, then drain the spaghetti.
6. Toss the spaghetti into the sauce with a splash of pasta water until glossy.
7. Tear in the basil, season, and serve topped with parmesan.`

interface State {
  text: string
  rate: number
  voice: string
  autoRead: boolean
  step: number
}

const DEF: State = { text: SAMPLE, rate: 1, voice: '', autoRead: true, step: 0 }

// Minimal typings for the (prefixed) Web Speech recognition API.
interface RecResult { isFinal: boolean; 0: { transcript: string } }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: RecEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void }
type RecCtor = new () => Rec
const getRec = (): RecCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

function chime() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = [660, 880, 1100][i]
      g.gain.setValueAtTime(0.2, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.4)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.45)
    })
  } catch {
    /* no audio */
  }
}

export default function HandsFreeRecipeReader() {
  const [s, set, reset] = useToolState('hands-free-recipe-reader', DEF)
  const recipe = useMemo(() => parseRecipe(s.text), [s.text])
  const n = recipe.steps.length
  const step = Math.min(s.step, Math.max(0, n - 1))
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [lockOn, setLockOn] = useState(false)
  const [timer, setTimer] = useState<{ left: number; total: number; run: boolean } | null>(null)
  const [edit, setEdit] = useState(false)
  const recRef = useRef<Rec | null>(null)
  const wantListen = useRef(false)
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null)
  const cmdRef = useRef<(c: Command) => void>(() => {})
  const hasTTS = typeof speechSynthesis !== 'undefined'
  const hasRec = typeof window !== 'undefined' && !!getRec()
  const hasLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    if (!hasTTS) return
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')))
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [hasTTS])

  const say = (text: string) => {
    if (!hasTTS) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = s.rate
    const v = voices.find((x) => x.voiceURI === s.voice)
    if (v) u.voice = v
    speechSynthesis.speak(u)
  }
  const readStep = (i: number) => n && say(`Step ${i + 1} of ${n}. ${recipe.steps[i]}`)
  const go = (i: number) => {
    const j = Math.max(0, Math.min(n - 1, i))
    set({ step: j })
    if (s.autoRead) readStep(j)
  }
  const startTimer = (i = step) => {
    const sec = findTimer(recipe.steps[i] ?? '')
    if (sec) {
      setTimer({ left: sec, total: sec, run: true })
      say(`Timer set for ${mmss(sec).replace(':00', '')} ${sec >= 60 ? 'minutes' : 'seconds'}.`)
    } else say('This step has no time to count.')
  }

  const run = (c: Command) => {
    if (c === 'next') go(step + 1)
    else if (c === 'back') go(step - 1)
    else if (c === 'repeat') readStep(step)
    else if (c === 'first') go(0)
    else if (c === 'ingredients') say('You need: ' + recipe.ingredients.join('; '))
    else if (c === 'timer') startTimer()
    else if (c === 'stop' && hasTTS) speechSynthesis.cancel()
  }
  useEffect(() => {
    cmdRef.current = run
  })

  // Countdown
  useEffect(() => {
    if (!timer?.run) return
    const id = setInterval(() => {
      setTimer((t) => {
        if (!t) return t
        if (t.left <= 1) {
          chime()
          if (hasTTS) speechSynthesis.speak(new SpeechSynthesisUtterance('Time is up!'))
          return { ...t, left: 0, run: false }
        }
        return { ...t, left: t.left - 1 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timer?.run, hasTTS])

  const startListening = () => {
    const R = getRec()
    if (!R) return
    const r = new R()
    r.continuous = true
    r.interimResults = false
    r.lang = 'en-US'
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (!res.isFinal) continue
        const txt = res[0].transcript.trim()
        const c = parseCommand(txt)
        setHeard(`"${txt}"${c ? ` → ${c}` : ' (not a command)'}`)
        if (c) cmdRef.current(c)
      }
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListen.current = false
        setHeard('Microphone permission denied.')
      }
    }
    r.onend = () => {
      if (wantListen.current) {
        try { r.start() } catch { /* already started */ }
      } else setListening(false)
    }
    recRef.current = r
    wantListen.current = true
    r.start()
    setListening(true)
  }
  const stopListening = () => {
    wantListen.current = false
    recRef.current?.stop()
    setListening(false)
  }
  useEffect(() => () => { wantListen.current = false; recRef.current?.stop(); void lockRef.current?.release() }, [])

  // Wake lock (re-acquired when the tab becomes visible again)
  useEffect(() => {
    if (!lockOn || !hasLock) return
    const nav = navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const acquire = async () => {
      try { lockRef.current = await nav.wakeLock.request('screen') } catch { setLockOn(false) }
    }
    void acquire()
    const vis = () => document.visibilityState === 'visible' && void acquire()
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('visibilitychange', vis)
      void lockRef.current?.release()
      lockRef.current = null
    }
  }, [lockOn, hasLock])

  const stepTimer = findTimer(recipe.steps[step] ?? '')
  return (
    <Split wide="right">
      <div>
        <Panel title="Hands-free controls">
          <Row>
            {hasRec ? (
              <Btn kind={listening ? 'danger' : 'primary'} onClick={listening ? stopListening : startListening}>{listening ? '■ Stop listening' : '🎙 Start voice control'}</Btn>
            ) : (
              <Note tone="warn">Voice commands need the Web Speech recognition API (Chrome, Edge, Safari). Use the big buttons instead.</Note>
            )}
            {hasLock && <Check label="Keep screen awake" value={lockOn} onChange={setLockOn} />}
          </Row>
          {listening && <p className="muted">Listening… {heard || 'say "next", "back", "repeat", "ingredients", "start timer" or "stop".'}</p>}
          {!listening && heard && <p className="muted">Last heard: {heard}</p>}
          <Check label="Read each step aloud when it changes" value={s.autoRead} onChange={(autoRead) => set({ autoRead })} />
          <Slider label="Speaking rate" value={s.rate} onChange={(rate) => set({ rate })} min={0.6} max={1.6} step={0.1} unit="×" />
          {voices.length > 0 && <Select label="Voice" value={s.voice} onChange={(voice) => set({ voice })} options={[['', 'Default voice'], ...voices.map((v) => [v.voiceURI, `${v.name} (${v.lang})`] as const)]} />}
          {!hasTTS && <Note tone="warn">Speech synthesis is not available in this browser.</Note>}
        </Panel>
        <Panel title="Voice commands">
          <table className="k-table" style={{ fontSize: 14 }}>
            <tbody>
              {[['"next" / "done"', 'next step'], ['"back" / "previous"', 'previous step'], ['"repeat" / "again"', 'read step again'], ['"ingredients"', 'read the shopping list'], ['"start timer"', 'count the time in this step'], ['"stop"', 'stop talking'], ['"start over"', 'go to step 1']].map(([a, b]) => (
                <tr key={a}><td><b>{a}</b></td><td className="muted">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Ingredients" actions={<Btn kind="ghost" onClick={() => run('ingredients')}>🔊 Read</Btn>}>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            {recipe.ingredients.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
          {!recipe.ingredients.length && <p className="muted">No ingredients found. Add an "Ingredients" heading.</p>}
        </Panel>
      </div>
      <div>
        <Panel
          title={recipe.title || 'Recipe'}
          actions={
            <>
              <Btn kind="ghost" onClick={() => setEdit(!edit)}>{edit ? 'Done editing' : '✎ Paste recipe'}</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          {edit && (
            <>
              <Area value={s.text} onChange={(text) => set({ text, step: 0 })} rows={12} placeholder="Title, then an Ingredients list and a Method/Steps list" />
              <Note>Put a title on the first line, then an "Ingredients" heading and a "Method" or "Steps" heading. Numbered lines and long sentences become steps automatically.</Note>
            </>
          )}
          {n ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <b style={{ color: 'var(--accent)' }}>Step {step + 1} of {n}</b>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ width: `${((step + 1) / n) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
                </div>
              </div>
              <p style={{ fontSize: 'clamp(22px, 3.2vw, 32px)', lineHeight: 1.35, fontWeight: 600, minHeight: '4.2em', margin: '12px 0' }}>{recipe.steps[step]}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <button type="button" className="k-btn" style={{ padding: 18, fontSize: 18 }} disabled={step === 0} onClick={() => go(step - 1)}>◀ Back</button>
                <button type="button" className="k-btn" style={{ padding: 18, fontSize: 18 }} onClick={() => readStep(step)}>🔊 Read</button>
                <button type="button" className="k-btn primary" style={{ padding: 18, fontSize: 18 }} disabled={step >= n - 1} onClick={() => go(step + 1)}>Next ▶</button>
              </div>
              {(stepTimer || timer) && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 10, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 30, fontFamily: 'var(--mono)', fontWeight: 700, color: timer && timer.left === 0 ? 'var(--err)' : undefined }}>⏱ {timer ? mmss(timer.left) : mmss(stepTimer ?? 0)}</span>
                  {timer ? (
                    <>
                      <Btn onClick={() => setTimer({ ...timer, run: !timer.run && timer.left > 0 })}>{timer.run ? 'Pause' : 'Resume'}</Btn>
                      <Btn kind="ghost" onClick={() => setTimer(null)}>Clear</Btn>
                    </>
                  ) : (
                    <Btn kind="primary" onClick={() => startTimer()}>Start {mmss(stepTimer ?? 0)} timer</Btn>
                  )}
                </div>
              )}
            </>
          ) : (
            <Note tone="warn">No steps found. Click "Paste recipe" and add a Method section.</Note>
          )}
        </Panel>
        <Panel title="All steps">
          <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.6 }}>
            {recipe.steps.map((x, i) => (
              <li key={i} onClick={() => go(i)} style={{ cursor: 'pointer', padding: '3px 6px', borderRadius: 6, background: i === step ? 'var(--panel2)' : undefined, fontWeight: i === step ? 700 : 400, opacity: i < step ? 0.6 : 1 }}>
                {x}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </Split>
  )
}
