import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { SAMPLE, decodeQuiz, encodeQuiz, grade, score, shuffled, validate, type Answer, type QType, type Question, type Quiz } from './lib/quiz-builder'

const TYPE_LABEL: [QType, string][] = [['single', 'Single choice'], ['multi', 'Multiple choice'], ['tf', 'True / False'], ['text', 'Short answer']]
const blank = (type: QType = 'single'): Question => ({ id: uid(), type, prompt: '', options: type === 'single' || type === 'multi' ? ['', ''] : [], correct: type === 'tf' ? [0] : [], answers: [], points: 1, explain: '' })
const linkFor = (code: string) => `${location.origin}${location.pathname}#/tool/quiz-builder?q=${code}`

function Player({ quiz, onExit }: { quiz: Quiz; onExit?: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState(-1) // -1 = intro, n = results
  const [ans, setAns] = useState<Record<string, Answer>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const order = useMemo(() => (quiz.shuffleQ ? shuffled(quiz.questions, 97 + attempt * 31) : quiz.questions), [quiz, attempt])
  const n = order.length
  const max = quiz.questions.reduce((s, q) => s + q.points, 0)
  const restart = () => {
    setAttempt((a) => a + 1)
    setAns({})
    setChecked({})
    setStep(0)
  }

  if (step < 0)
    return (
      <Panel title={quiz.title || 'Quiz'} actions={onExit && <Btn kind="ghost" onClick={onExit}>✎ Back to editor</Btn>}>
        {quiz.intro && <p>{quiz.intro}</p>}
        <Stats>
          <Stat label="Questions" value={n} />
          <Stat label="Points" value={max} />
          <Stat label="Pass mark" value={`${quiz.pass}%`} />
        </Stats>
        <Btn kind="primary" onClick={() => setStep(0)} disabled={!n}>Start quiz ▶</Btn>
      </Panel>
    )

  if (step >= n) {
    const r = score(quiz, ans)
    const summary = `${quiz.title}: ${r.got.toFixed(1).replace(/\.0$/, '')}/${r.max} (${Math.round(r.pct)}%) — ${r.passed ? 'passed' : 'not passed'}`
    return (
      <Panel title="Results" actions={<>{onExit && <Btn kind="ghost" onClick={onExit}>✎ Editor</Btn>}<CopyButton text={summary} label="Copy result" /><Btn kind="primary" onClick={restart}>↻ Retake</Btn></>}>
        <Row>
          <Ring value={r.pct / 100} size={120} color={r.passed ? 'var(--ok)' : 'var(--err)'} label={<b>{Math.round(r.pct)}%</b>} />
          <div>
            <h2 style={{ margin: '0 0 4px' }}>{r.passed ? '🎉 Passed!' : 'Not quite'}</h2>
            <p style={{ margin: 0 }}>{r.got.toFixed(2).replace(/\.?0+$/, '')} of {r.max} points · pass mark {quiz.pass}%</p>
            <p className="muted" style={{ margin: 0 }}>{r.per.filter((p) => p.got === p.q.points).length} of {n} fully correct</p>
          </div>
        </Row>
        <Table
          head={['#', 'Question', 'Your answer', 'Correct answer', 'Points']}
          rows={order.map((q, i) => {
            const a = ans[q.id]
            const show = (x: Answer | undefined) => (x === undefined ? '—' : typeof x === 'string' ? x || '—' : q.type === 'tf' ? (x[0] === 0 ? 'True' : 'False') : x.map((k) => q.options[k]).join(', '))
            const got = grade(q, a)
            return [i + 1, <span key="p">{q.prompt}{q.explain && <><br /><small className="muted">{q.explain}</small></>}</span>, show(a), q.type === 'text' ? q.answers.join(' / ') : show(q.correct), <b key="g" style={{ color: got === q.points ? 'var(--ok)' : got > 0 ? 'var(--warn)' : 'var(--err)' }}>{+got.toFixed(2)}/{q.points}</b>]
          })}
        />
      </Panel>
    )
  }

  const q = order[step]
  const a = ans[q.id]
  const done = !!checked[q.id]
  const lock = quiz.instant && done
  const opts = q.type === 'tf' ? ['True', 'False'] : q.options
  const idx = q.type !== 'tf' && quiz.shuffleO ? shuffled(opts.map((_, i) => i), 7 + step * 13 + attempt * 101 + q.prompt.length) : opts.map((_, i) => i)
  const pick = (i: number) => {
    if (lock) return
    if (q.type === 'multi') {
      const cur = Array.isArray(a) ? a : []
      setAns({ ...ans, [q.id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] })
    } else setAns({ ...ans, [q.id]: [i] })
  }
  const answered = a !== undefined && (typeof a === 'string' ? a.trim() !== '' : a.length > 0)
  const got = grade(q, a)
  return (
    <Panel title={`${quiz.title} — question ${step + 1} of ${n}`} actions={onExit && <Btn kind="ghost" onClick={onExit}>✎ Editor</Btn>}>
      <div className="k-bar" style={{ marginBottom: 14 }}><span style={{ width: `${(step / n) * 100}%`, background: 'var(--accent)' }} /></div>
      <h3 style={{ marginTop: 0 }}>{q.prompt}</h3>
      <p className="muted" style={{ marginTop: -6 }}>{q.type === 'multi' ? 'Select all that apply · ' : ''}{q.points} point{q.points === 1 ? '' : 's'}</p>
      {q.type === 'text' ? (
        <Txt label="Your answer" value={typeof a === 'string' ? a : ''} onChange={(v) => !lock && setAns({ ...ans, [q.id]: v })} placeholder="Type your answer" />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {idx.map((i) => {
            const sel = Array.isArray(a) && a.includes(i)
            const right = q.correct.includes(i)
            const border = lock ? (right ? 'var(--ok)' : sel ? 'var(--err)' : 'var(--line)') : sel ? 'var(--accent)' : 'var(--line)'
            return (
              <button key={i} type="button" className="k-btn" onClick={() => pick(i)} style={{ justifyContent: 'flex-start', textAlign: 'left', border: `2px solid ${border}`, background: sel ? 'var(--panel2)' : undefined }}>
                <span style={{ marginRight: 8 }}>{q.type === 'multi' ? (sel ? '☑' : '☐') : sel ? '◉' : '○'}</span>{opts[i]}{lock && right && ' ✓'}
              </button>
            )
          })}
        </div>
      )}
      {lock && (
        <Note tone={got === q.points ? 'ok' : got > 0 ? 'warn' : 'err'}>
          {got === q.points ? 'Correct!' : got > 0 ? `Partly right (${+got.toFixed(2)}/${q.points}).` : 'Not right.'}
          {q.type === 'text' && got < q.points && ` Accepted: ${q.answers.join(' / ')}.`} {q.explain}
        </Note>
      )}
      <Row>
        <Btn onClick={() => setStep(step - 1)} disabled={step === 0}>◀ Back</Btn>
        {quiz.instant && !done ? (
          <Btn kind="primary" disabled={!answered} onClick={() => setChecked({ ...checked, [q.id]: true })}>Check answer</Btn>
        ) : (
          <Btn kind="primary" onClick={() => setStep(step + 1)}>{step === n - 1 ? 'Finish ✓' : 'Next ▶'}</Btn>
        )}
        {!quiz.instant && !answered && <span className="muted">You can skip and come back.</span>}
      </Row>
    </Panel>
  )
}

function Editor({ q, i, n, edit, move, remove }: { q: Question; i: number; n: number; edit: (p: Partial<Question>) => void; move: (d: number) => void; remove: () => void }) {
  const choice = q.type === 'single' || q.type === 'multi'
  return (
    <Panel title={`Q${i + 1}`} actions={<><Btn kind="ghost" onClick={() => move(-1)} disabled={i === 0} title="Move up">↑</Btn><Btn kind="ghost" onClick={() => move(1)} disabled={i === n - 1} title="Move down">↓</Btn><Btn kind="ghost" onClick={remove} title="Delete">✕</Btn></>}>
      <Seg value={q.type} onChange={(type) => edit({ type, correct: type === 'tf' ? [0] : type === 'text' ? [] : q.correct.filter((c) => c < q.options.length).slice(0, type === 'single' ? 1 : 99), options: (type === 'single' || type === 'multi') && q.options.length < 2 ? ['', ''] : q.options })} options={TYPE_LABEL} label="Question type" />
      <Txt label="Question" value={q.prompt} onChange={(prompt) => edit({ prompt })} placeholder="Ask something…" />
      {choice && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <span className="k-label">Options — tick the correct {q.type === 'multi' ? 'ones' : 'one'}</span>
          {q.options.map((o, k) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type={q.type === 'multi' ? 'checkbox' : 'radio'} checked={q.correct.includes(k)} aria-label="Correct" onChange={() => edit({ correct: q.type === 'multi' ? (q.correct.includes(k) ? q.correct.filter((x) => x !== k) : [...q.correct, k]) : [k] })} />
              <input className="k-text" style={{ flex: 1 }} value={o} placeholder={`Option ${k + 1}`} onChange={(e) => edit({ options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} />
              <Btn kind="ghost" disabled={q.options.length <= 2} onClick={() => edit({ options: q.options.filter((_, j) => j !== k), correct: q.correct.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c)) })}>✕</Btn>
            </div>
          ))}
          <div><Btn onClick={() => edit({ options: [...q.options, ''] })} disabled={q.options.length >= 8}>+ Option</Btn></div>
        </div>
      )}
      {q.type === 'tf' && <Seg value={q.correct[0] === 1 ? 'f' : 't'} onChange={(v) => edit({ correct: [v === 't' ? 0 : 1] })} options={[['t', 'Answer: True'], ['f', 'Answer: False']]} label="Correct answer" />}
      {q.type === 'text' && <Txt label="Accepted answers (separate with |)" value={q.answers.join(' | ')} onChange={(v) => edit({ answers: v.split('|').map((x) => x.trim()) })} hint="Matching ignores case, accents and punctuation." />}
      <Row>
        <Num label="Points" value={q.points} onChange={(points) => edit({ points })} min={0.5} step={0.5} />
        <div style={{ flex: 3 }}><Txt label="Explanation (shown after answering)" value={q.explain} onChange={(explain) => edit({ explain })} /></div>
      </Row>
    </Panel>
  )
}

export default function QuizBuilder() {
  const [quiz, set, reset] = useToolState<Quiz>('quiz-builder', SAMPLE)
  const [mode, setMode] = useState<'edit' | 'take'>('edit')
  const [shared, setShared] = useState<Quiz | null>(null)
  const [linkErr, setLinkErr] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    const m = /[?&]q=([^&]+)/.exec(location.hash)
    if (!m) return
    decodeQuiz(m[1]).then(setShared, (e: Error) => setLinkErr(`This quiz link could not be opened: ${e.message}`))
  }, [])
  useEffect(() => {
    let live = true
    void encodeQuiz(quiz).then((c) => live && setCode(c))
    return () => {
      live = false
    }
  }, [quiz])

  if (shared)
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Player quiz={shared} />
        <p className="muted" style={{ textAlign: 'center' }}>
          Shared quiz · <a href="#/tool/quiz-builder" onClick={() => setShared(null)}>Make your own</a> ·{' '}
          <a href="#/tool/quiz-builder" onClick={() => { set(shared); setShared(null) }}>Copy into the editor</a>
        </p>
      </div>
    )

  const problems = validate(quiz)
  const link = code ? linkFor(code) : ''
  const pts = quiz.questions.reduce((s, q) => s + q.points, 0)
  const edit = (id: string, p: Partial<Question>) => set({ questions: quiz.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) })
  const move = (i: number, d: number) => {
    const qs = [...quiz.questions]
    ;[qs[i], qs[i + d]] = [qs[i + d], qs[i]]
    set({ questions: qs })
  }

  if (mode === 'take') return <div style={{ maxWidth: 760, margin: '0 auto' }}><Player quiz={quiz} onExit={() => setMode('edit')} /></div>

  return (
    <Split wide="left">
      <div>
        {linkErr && <Note tone="err">{linkErr}</Note>}
        <Panel title="Quiz settings" actions={<><Btn kind="ghost" onClick={reset}>Sample</Btn><Btn kind="ghost" onClick={() => set({ title: 'New quiz', intro: '', questions: [blank()] })}>New</Btn></>}>
          <Txt label="Title" value={quiz.title} onChange={(title) => set({ title })} />
          <Txt label="Intro (optional)" value={quiz.intro} onChange={(intro) => set({ intro })} />
          <Row>
            <Num label="Pass mark" value={quiz.pass} onChange={(pass) => set({ pass })} unit="%" min={0} max={100} />
            <div style={{ display: 'grid', gap: 4, flex: 2 }}>
              <Check label="Show feedback after each question" value={quiz.instant} onChange={(instant) => set({ instant })} />
              <Check label="Shuffle question order" value={quiz.shuffleQ} onChange={(shuffleQ) => set({ shuffleQ })} />
              <Check label="Shuffle answer options" value={quiz.shuffleO} onChange={(shuffleO) => set({ shuffleO })} />
            </div>
          </Row>
        </Panel>
        {quiz.questions.map((q, i) => (
          <Editor key={q.id} q={q} i={i} n={quiz.questions.length} edit={(p) => edit(q.id, p)} move={(d) => move(i, d)} remove={() => set({ questions: quiz.questions.filter((x) => x.id !== q.id) })} />
        ))}
        <Row>
          {TYPE_LABEL.map(([t, l]) => <Btn key={t} onClick={() => set({ questions: [...quiz.questions, blank(t)] })}>+ {l}</Btn>)}
        </Row>
      </div>
      <div style={{ position: 'sticky', top: 12 }}>
        <Stats>
          <Stat label="Questions" value={quiz.questions.length} />
          <Stat label="Total points" value={pts} />
        </Stats>
        <Panel title="Share as a link">
          {problems.length ? (
            <Note tone="warn"><b>Fix before sharing:</b><br />{problems.slice(0, 5).map((p) => <span key={p}>• {p}<br /></span>)}</Note>
          ) : (
            <Note tone="ok">Ready. Anyone with the link can take the quiz; it grades itself in their browser.</Note>
          )}
          <textarea className="k-area mono" readOnly rows={4} value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
          <p className="muted" style={{ fontSize: 13 }}>
            {link.length.toLocaleString()} characters · {code[0] === 'z' ? 'deflate-compressed' : 'uncompressed'} · the whole quiz lives in the URL, no server.
            {link.length > 8000 && ' Long links may be cut by some chat apps; consider fewer or shorter questions.'}
          </p>
          <Row>
            <CopyButton text={link} label="Copy link" />
            <Btn kind="primary" onClick={() => setMode('take')} disabled={!!problems.length}>▶ Preview quiz</Btn>
            <Btn onClick={() => window.open(link, '_blank')} disabled={!link || !!problems.length}>Open link ↗</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Note: answers are inside the link, so a determined student could decode them. Fine for practice and fun quizzes, not for exams.</p>
        </Panel>
        <Panel title="Backup">
          <Row><JsonButtons name="quiz.json" data={quiz} onLoad={(d) => d && Array.isArray(d.questions) && set(d)} /></Row>
        </Panel>
      </div>
    </Split>
  )
}
