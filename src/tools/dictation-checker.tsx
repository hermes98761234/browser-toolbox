import { Area, Btn, Check, CopyButton, Note, Panel, pct, Row, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { compare, score, type ErrKind, type Piece } from './lib/dictation-checker'

const SAMPLES: [string, string, string][] = [
  [
    'Lighthouse (A2)',
    'The old lighthouse stands on a rocky hill above the harbour. Every evening, the keeper climbs one hundred and twelve steps to light the lamp. Ships far out at sea can see its beam, and they know the coast is near.',
    'The old lighthouse stand on a rocky hill above the harbor. Every evening the keeper climbs one hundred and twelve stairs to light the lamp. ships far out at sea can see it\'s beam and they know that the coast is near.',
  ],
  [
    'Market morning (B1)',
    'On Saturday mornings, the square fills with stalls selling bread, cheese and fresh vegetables. Mrs. Kowal always arrives early, because the best tomatoes disappear before nine o\'clock.',
    'On saturday mornings the square fills with stalls selling bred, cheese and fresh vegetables. Mrs Kowal always arives early, because the best tomatoes dissapear before nine o\'clock.',
  ],
  [
    'Science lesson (B2)',
    'Water expands when it freezes, which is why a glass bottle left in the freezer may crack. This unusual property also allows ice to float, protecting the life beneath frozen lakes.',
    'Water expends when it freezes, which is why glass bottle left in a freezer may crack. This unusual property also allow ice to float protecting life beneath the frozen lakes.',
  ],
]

const COLORS: Record<ErrKind, string> = {
  spelling: '#f59e0b',
  'wrong word': '#ef4444',
  capitalization: '#a855f7',
  missing: '#ef4444',
  extra: '#0ea5e9',
  punctuation: '#14b8a6',
}

const DEF = {
  title: SAMPLES[0][0],
  student: 'Student A',
  original: SAMPLES[0][1],
  answer: SAMPLES[0][2],
  ignoreCase: false,
  ignorePunct: false,
  halfMinor: true,
}

function grade(x: number) {
  return x >= 0.95 ? 'Excellent' : x >= 0.85 ? 'Very good' : x >= 0.7 ? 'Good' : x >= 0.5 ? 'Needs practice' : 'Keep working'
}

function Mark({ p }: { p: Piece }) {
  const space = p.punct ? '' : ' '
  if (p.kind === 'ok') return <>{space}{p.got}</>
  const c = COLORS[p.kind]
  const title = p.kind === 'missing' ? `Missing: ${p.want}` : p.kind === 'extra' ? `Extra word: ${p.got}` : `${p.kind}: wrote “${p.got ?? '∅'}”, expected “${p.want ?? '∅'}”`
  return (
    <>
      {space}
      <span title={title} style={{ borderBottom: `2px solid ${c}`, background: `color-mix(in srgb, ${c} 14%, transparent)`, borderRadius: 3, padding: '0 2px' }}>
        {p.got !== undefined && <span style={{ textDecoration: p.want !== undefined || p.kind === 'extra' ? 'line-through' : undefined, opacity: 0.85 }}>{p.got}</span>}
        {p.want !== undefined && <b style={{ color: c, marginLeft: p.got !== undefined ? 3 : 0 }}>{p.kind === 'missing' ? `[${p.want}]` : p.want}</b>}
      </span>
    </>
  )
}

const dateStr = () => new Date().toLocaleDateString()
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export default function DictationChecker() {
  const [s, set, reset] = useToolState('dictation-checker', DEF)
  const pieces = compare(s.original, s.answer, { ignoreCase: s.ignoreCase, ignorePunct: s.ignorePunct })
  const sc = score(pieces, s.halfMinor)
  const errs = pieces.filter((p) => p.kind !== 'ok')
  const kinds = Object.entries(sc.errors).filter(([, n]) => n > 0) as [ErrKind, number][]
  const feedback = () =>
    [`${s.title} — ${s.student}`, `Score ${pct(sc.score, 0)} (${grade(sc.score)}), ${sc.correct}/${sc.words} words correct`, '', ...errs.map((p, i) => `${i + 1}. ${p.kind}: ${p.got ? `"${p.got}"` : '—'} → ${p.want ? `"${p.want}"` : 'remove'}`)].join('\n')

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const marked = pieces
      .map((p) => {
        const sp = p.punct ? '' : ' '
        if (p.kind === 'ok') return sp + esc(p.got ?? '')
        const c = COLORS[p.kind]
        return `${sp}<span style="border-bottom:2px solid ${c}">${p.got ? `<s>${esc(p.got)}</s>` : ''}${p.want ? `<b style="color:${c}"> ${p.kind === 'missing' ? '[' + esc(p.want) + ']' : esc(p.want)}</b>` : ''}</span>`
      })
      .join('')
    w.document.write(`<!doctype html><title>${esc(s.title)}</title><style>body{font:15px/1.7 system-ui,sans-serif;max-width:720px;margin:32px auto;color:#111}h1{font-size:22px;margin:0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}.box{border:1px solid #ccc;border-radius:8px;padding:12px;margin:12px 0}</style>
<h1>Dictation feedback: ${esc(s.title)}</h1><p><b>Student:</b> ${esc(s.student)} &nbsp; <b>Date:</b> ${dateStr()}</p>
<div class="box"><b>Score: ${pct(sc.score, 0)}</b> — ${grade(sc.score)} &nbsp;·&nbsp; ${sc.correct} of ${sc.words} words correct &nbsp;·&nbsp; ${errs.length} marks</div>
<h3>Your text with corrections</h3><div class="box">${marked}</div>
<h3>Mistakes</h3><table><tr><th>#</th><th>Type</th><th>You wrote</th><th>Correct</th></tr>${errs.map((p, i) => `<tr><td>${i + 1}</td><td>${p.kind}</td><td>${esc(p.got ?? '—')}</td><td>${esc(p.want ?? '(remove)')}</td></tr>`).join('')}</table>
<h3>Original text</h3><div class="box">${esc(s.original)}</div><p>Teacher's comment: ________________________________________________</p><script>print()</script>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Dictation" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {SAMPLES.map(([t, o, a]) => (
              <Btn key={t} onClick={() => set({ title: t, original: o, answer: a })}>{t}</Btn>
            ))}
          </Row>
          <Row>
            <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
            <Txt label="Student" value={s.student} onChange={(student) => set({ student })} />
          </Row>
          <Area label="Original text (teacher)" value={s.original} onChange={(original) => set({ original })} rows={5} />
          <Area label="Student's dictation" value={s.answer} onChange={(answer) => set({ answer })} rows={5} placeholder="Type or paste what the student wrote…" />
          <Check label="Ignore capitalization" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Ignore punctuation" value={s.ignorePunct} onChange={(ignorePunct) => set({ ignorePunct })} />
          <Check label="Capitalization & punctuation count half" value={s.halfMinor} onChange={(halfMinor) => set({ halfMinor })} />
        </Panel>
        <Note>Words are aligned with a longest-common-subsequence diff, so one skipped word does not shift every following word into an error. A changed word is a <b>spelling</b> error when it is within about a third of its letters of the original, otherwise a <b>wrong word</b>.</Note>
      </div>
      <div>
        <Stats>
          <Stat label="Score" value={pct(sc.score, 0)} sub={grade(sc.score)} tone={sc.score >= 0.85 ? 'good' : sc.score < 0.5 ? 'bad' : 'accent'} />
          <Stat label="Words correct" value={`${sc.correct} / ${sc.words}`} sub={`accuracy ${pct(sc.accuracy, 1)}`} />
          <Stat label="Mistakes" value={errs.length} sub={`${sc.weighted} weighted`} />
          <Stat label="Word error rate" value={pct(sc.wer, 1)} sub="(sub + del + ins) ÷ words" />
        </Stats>
        <Panel title="Marked-up dictation" actions={<><CopyButton text={feedback} label="Copy feedback" /><Btn kind="primary" onClick={print}>🖨 Feedback sheet</Btn></>}>
          <div style={{ lineHeight: 2, fontSize: 16, padding: '6px 4px' }}>
            {pieces.length ? pieces.map((p, i) => <Mark key={i} p={p} />) : <span className="muted">Enter both texts to compare.</span>}
          </div>
          <div className="k-legend" style={{ marginTop: 8 }}>
            {(Object.keys(COLORS) as ErrKind[]).map((k) => (
              <span key={k}><i style={{ background: COLORS[k] }} />{k} {sc.errors[k] ? <b>{sc.errors[k]}</b> : null}</span>
            ))}
          </div>
        </Panel>
        <Panel title="Mistake list">
          {errs.length === 0 ? (
            <Note tone="ok">No mistakes. Perfect dictation! ✓</Note>
          ) : (
            <Table
              head={['#', 'Type', 'Student wrote', 'Correct form']}
              rows={errs.map((p, i) => [i + 1, <span key="k" style={{ color: COLORS[p.kind as ErrKind], fontWeight: 650 }}>{p.kind}</span>, p.got ?? '—', p.want ?? '(remove)'])}
            />
          )}
          {kinds.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Focus next time on: {kinds.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).join(' and ')}.
            </p>
          )}
        </Panel>
      </div>
    </Split>
  )
}
