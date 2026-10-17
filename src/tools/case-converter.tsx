import { useState } from 'react'
import { Area, Btn, Check, CopyButton, download, Note, Panel, Row, Split, Stat, Stats, useToolState } from '../kit'
import { CASES, convert, detect, splitWords } from './lib/case-converter'

const EXAMPLES: [string, string][] = [
  ['Headline', 'the quick brown fox jumps over the lazy dog: a story of speed'],
  ['Identifiers', 'getUserProfile\nXMLHttpRequest\nmax_retry_count\nbackground-color\nAPI_BASE_URL'],
  ['Shouty text', 'PLEASE READ THE INSTRUCTIONS BEFORE STARTING. THANK YOU!'],
  ['Column names', 'First Name\nLast Name\nDate of Birth\nE-mail Address\nZIP code'],
]

const DEF = { text: EXAMPLES[1][1], perLine: true, pick: 'snake' }

export default function CaseConverter() {
  const [s, set, reset] = useToolState('case-converter', DEF)
  const [flash, setFlash] = useState('')
  const out = convert(s.text, s.pick, s.perLine)
  const lines = s.text.split('\n')
  const words = splitWords(s.text).length
  const picked = CASES.find((c) => c.id === s.pick) ?? CASES[0]
  const firstLine = lines.find((l) => l.trim()) ?? ''

  const copy = (t: string, id: string) => {
    void navigator.clipboard?.writeText(t).then(() => {
      setFlash(id)
      setTimeout(() => setFlash(''), 1000)
    })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Input" actions={<><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} placeholder="Type or paste text, identifiers or a list…" mono={s.perLine} />
          <Row>
            <Check label="Convert each line separately" value={s.perLine} onChange={(perLine) => set({ perLine })} />
          </Row>
          <Row>
            <span className="muted" style={{ fontSize: 13 }}>Examples:</span>
            {EXAMPLES.map(([n, t]) => <Btn key={n} kind="ghost" onClick={() => set({ text: t, perLine: t.includes('\n') })}>{n}</Btn>)}
          </Row>
        </Panel>
        <Stats>
          <Stat label="Characters" value={s.text.length.toLocaleString('en-US')} />
          <Stat label="Words" value={words.toLocaleString('en-US')} />
          <Stat label="Lines" value={lines.length} />
          <Stat label="Detected (line 1)" value={<span style={{ fontSize: 16 }}>{detect(firstLine)}</span>} />
        </Stats>
        <Note>Word boundaries are found from spaces, punctuation, <code>_ - . /</code>, camelCase humps and acronyms (<code>XMLHttpRequest</code> → xml · http · request), so any style converts to any other.</Note>
      </div>
      <div>
        <Panel
          title={<>Result: <span style={{ color: 'var(--accent)' }}>{picked.name}</span></>}
          actions={
            <>
              <CopyButton text={out} />
              <Btn onClick={() => download('converted.txt', out)}>⬇ .txt</Btn>
              <Btn onClick={() => set({ text: out })} title="Replace the input with this result">↺ Use as input</Btn>
            </>
          }
        >
          <pre style={{ margin: 0, padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--mono)', fontSize: 15, minHeight: 80, maxHeight: 300, overflow: 'auto' }}>{out || <span className="muted">Nothing to convert yet.</span>}</pre>
        </Panel>
        <Panel title="All cases (click to choose, ⧉ to copy)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
            {CASES.map((c) => {
              const v = convert(s.text, c.id, s.perLine)
              const on = c.id === s.pick
              return (
                <div key={c.id} onClick={() => set({ pick: c.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && set({ pick: c.id })}
                  style={{ border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', background: on ? 'color-mix(in srgb, var(--accent) 8%, var(--panel))' : 'var(--panel)', minWidth: 0 }}>
                  <Row wrap={false}>
                    <b style={{ flex: 1, fontSize: 13, color: on ? 'var(--accent)' : 'var(--muted)' }}>{c.name}</b>
                    <button type="button" className="k-btn ghost" style={{ padding: '0 8px' }} onClick={(e) => { e.stopPropagation(); copy(v, c.id) }} aria-label={`Copy ${c.name}`}>{flash === c.id ? '✓' : '⧉'}</button>
                  </Row>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: 62, lineHeight: 1.5 }}>{v.split('\n').slice(0, 3).join('\n') || '—'}</div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
