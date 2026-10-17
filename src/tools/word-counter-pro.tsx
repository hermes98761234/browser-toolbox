import { useDeferredValue, useMemo } from 'react'
import { Area, Bar, Btn, CopyButton, download, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, num, pct, useToolState } from '../kit'
import { analyze, duration, fleschLabel, sentences, words } from './lib/word-counter-pro'

interface State { text: string; locale: string; wpm: number; spm: number; goal: number }

const SAMPLE = `The best writing is rewriting. Your first draft is where you find out what you want to say; every later draft is where you learn how to say it well.

Short sentences are easy to read. Long sentences, especially those that pile clause upon clause while the reader waits patiently for the main verb to finally arrive, are much harder to follow and should usually be split into two.

Read your text aloud before you publish it. If you stumble, your reader will too.`

const DEF: State = { text: SAMPLE, locale: 'en', wpm: 238, spm: 140, goal: 500 }

const LIMITS: [string, number, 'chars' | 'words'][] = [
  ['X / Twitter post', 280, 'chars'],
  ['SMS message', 160, 'chars'],
  ['Meta description', 160, 'chars'],
  ['Page title (SEO)', 60, 'chars'],
  ['Instagram caption', 2200, 'chars'],
  ['LinkedIn post', 3000, 'chars'],
]

const LOCALES: [string, string][] = [['en', 'English'], ['uk', 'Ukrainian'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['pl', 'Polish'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['th', 'Thai']]

export default function WordCounterPro() {
  const [s, set, reset] = useToolState('word-counter-pro', DEF)
  const text = useDeferredValue(s.text)
  const st = useMemo(() => analyze(text, s.locale), [text, s.locale])
  const long = useMemo(() => sentences(text, s.locale).map((x) => ({ x, n: words(x, s.locale).length })).filter((o) => o.n > 25).sort((a, b) => b.n - a.n).slice(0, 3), [text, s.locale])
  const readMin = st.words / Math.max(1, s.wpm)
  const speakMin = st.words / Math.max(1, s.spm)
  const report = [
    `Words: ${st.words}`,
    `Characters: ${st.chars} (${st.charsNoSpaces} without spaces)`,
    `Sentences: ${st.sentences}`,
    `Paragraphs: ${st.paragraphs}`,
    `Reading time: ${duration(readMin)} at ${s.wpm} wpm`,
    `Speaking time: ${duration(speakMin)} at ${s.spm} wpm`,
    `Flesch reading ease: ${num(st.flesch, 0)} (${fleschLabel(st.flesch)})`,
  ].join('\n')
  const latin = s.locale !== 'ja' && s.locale !== 'zh' && s.locale !== 'th'

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Your text"
          actions={
            <>
              <Btn onClick={() => set({ text: SAMPLE })}>Sample</Btn>
              <Btn onClick={() => void navigator.clipboard?.readText().then((t) => set({ text: t })).catch(() => undefined)}>📋 Paste</Btn>
              <Btn onClick={() => download('text.txt', s.text, 'text/plain')}>⬇ .txt</Btn>
              <Btn kind="danger" onClick={() => set({ text: '' })}>Clear</Btn>
            </>
          }
        >
          <Area value={s.text} onChange={(t) => set({ text: t })} rows={16} placeholder="Type or paste your text here…" />
          <Row>
            <Select label="Language (word rules)" value={s.locale} onChange={(locale) => set({ locale })} options={LOCALES} />
            <Num label="Word goal" value={s.goal} onChange={(goal) => set({ goal: Math.max(0, Math.round(goal)) })} unit="words" min={0} step={1} />
          </Row>
          {s.goal > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <b>{st.words} / {s.goal} words</b>
                <span className="muted">{st.words >= s.goal ? 'Goal reached 🎉' : `${s.goal - st.words} to go`}</span>
              </div>
              <Bar value={st.words} max={s.goal} color={st.words >= s.goal ? 'var(--ok)' : 'var(--accent)'} />
            </div>
          )}
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            Words are split with the browser's Intl.Segmenter, so languages without spaces (Japanese, Chinese, Thai) and emoji are counted correctly. Text never leaves your device.
          </p>
        </Panel>
        {long.length > 0 && (
          <Panel title="Long sentences (over 25 words)">
            {long.map((o, i) => (
              <Note key={i} tone="warn"><b>{o.n} words:</b> {o.x.length > 220 ? o.x.slice(0, 220) + '…' : o.x}</Note>
            ))}
          </Panel>
        )}
      </div>

      <div>
        <Stats>
          <Stat label="Words" value={st.words.toLocaleString('en-US')} tone="accent" sub={`${st.unique} unique`} />
          <Stat label="Characters" value={st.chars.toLocaleString('en-US')} sub={`${st.charsNoSpaces.toLocaleString('en-US')} without spaces`} />
          <Stat label="Sentences" value={st.sentences} sub={`${st.paragraphs} paragraphs · ${st.lines} lines`} />
          <Stat label="Reading time" value={duration(readMin)} sub={`Speaking ${duration(speakMin)}`} />
        </Stats>
        <Panel title="Time estimates" actions={<CopyButton text={report} label="Copy stats" />}>
          <Slider label="Reading speed" value={s.wpm} onChange={(wpm) => set({ wpm })} min={100} max={500} step={5} unit=" wpm" show={(v) => String(v)} />
          <Slider label="Speaking speed" value={s.spm} onChange={(spm) => set({ spm })} min={80} max={220} step={5} unit=" wpm" show={(v) => String(v)} />
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Typical adults read ~238 wpm silently (non-fiction) and present at 130–150 wpm.</p>
        </Panel>
        <Panel title="Readability">
          <Table
            head={['Measure', 'Value']}
            rows={[
              ['Average word length', `${num(st.avgWordLen, 1)} characters`],
              ['Average sentence length', `${num(st.avgSentenceLen, 1)} words`],
              ['Longest word', st.longest || '—'],
              ['Lexical diversity', st.words ? pct(st.unique / st.words, 0) : '—'],
              ...(latin && s.locale === 'en'
                ? [
                    ['Syllables (estimated)', String(st.syllables)],
                    ['Flesch reading ease', st.words ? `${num(st.flesch, 0)} · ${fleschLabel(st.flesch)}` : '—'],
                    ['Flesch–Kincaid grade', st.words ? num(Math.max(0, st.grade), 1) : '—'],
                  ]
                : []),
            ]}
          />
          {s.locale !== 'en' && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Flesch scores are calibrated for English and hidden for other languages.</p>}
        </Panel>
        <Panel title="Platform limits">
          {LIMITS.map(([name, max]) => {
            const v = st.chars
            return (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{name}</span>
                  <b style={{ color: v > max ? 'var(--err)' : undefined }}>{v} / {max}{v > max ? ` (−${v - max})` : ''}</b>
                </div>
                <Bar value={v} max={max} color={v > max ? 'var(--err)' : v > max * 0.9 ? 'var(--warn)' : 'var(--ok)'} />
              </div>
            )
          })}
        </Panel>
        <Panel title="Top keywords">
          {st.keywords.length === 0 ? (
            <Note>Keywords appear once you type a few sentences.</Note>
          ) : (
            <Table
              head={['Word', 'Count', 'Density', '']}
              rows={st.keywords.map((k) => [k.word, k.count, pct(k.density, 1), <Bar key="b" value={k.count} max={st.keywords[0].count} />])}
            />
          )}
          <Row>
            <Btn kind="ghost" onClick={reset}>Reset all settings</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
