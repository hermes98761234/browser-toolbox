import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, Note, Panel, Row, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { check, decode, type Dict, suggest, type Token } from './lib/offline-spell-checker'

const SAMPLE = `Offline spell cheking runs entirely in your browser — nothing is uploaded.

Their goverment wants to acheive seperate buisness goals untill tommorow, wich is wierd. I recieve emails every day and definately need a quick way to fix typos befor I send them. Teh team's reports were writen in a hury.

Links like https://example.com/some-pathh, adresses like jane.doe@exmaple.org, \`inline_codee()\`, getUserNmae, v2.0 and 3rd-party numbers are ignored. So are ALL-CAPS acronyms such as NASA if you want.`

interface State { text: string; user: string[]; ignoreCaps: boolean }
const DEF: State = { text: SAMPLE, user: ['Kubernetes'], ignoreCaps: true }

let dictPromise: Promise<Dict> | null = null
const loadDict = () => (dictPromise ??= import('./lib/offline-spell-checker-words.txt?raw').then((m) => decode(m.default)))

const FONT: React.CSSProperties = { font: '15px/1.6 var(--mono, ui-monospace, monospace)', padding: '12px 14px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal', letterSpacing: 0, tabSize: 4 }

export default function OfflineSpellChecker() {
  const [s, set] = useToolState('offline-spell-checker', DEF)
  const [dict, setDict] = useState<Dict | null>(null)
  const [err, setErr] = useState('')
  const [ignore, setIgnore] = useState<Set<string>>(() => new Set())
  const [active, setActive] = useState<Token | null>(null)
  const [sugs, setSugs] = useState<Map<string, string[]>>(() => new Map())
  const [newWord, setNewWord] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const back = useRef<HTMLDivElement>(null)
  const t0 = useRef(0)
  const [loadMs, setLoadMs] = useState(0)

  useEffect(() => {
    t0.current = performance.now()
    loadDict().then((d) => { setDict(d); setLoadMs(performance.now() - t0.current) }, (e: unknown) => setErr(String(e)))
  }, [])

  const user = useMemo(() => new Set(s.user), [s.user])
  const result = useMemo(() => {
    if (!dict) return null
    const ign = new Set(ignore)
    const r = check(s.text, dict, user, ign)
    if (!s.ignoreCaps) return r
    const bad = r.bad.filter((t) => !(t.word.length > 1 && t.word === t.word.toUpperCase()))
    return { ...r, bad, issues: r.issues.filter((i) => !(i.word.length > 1 && i.word === i.word.toUpperCase())) }
  }, [dict, s.text, user, ignore, s.ignoreCaps])

  // Compute suggestions in the background, one word per tick, so typing stays smooth.
  useEffect(() => {
    if (!dict || !result) return
    const todo = result.issues.map((i) => i.word).filter((w) => !sugs.has(w)).slice(0, 40)
    if (!todo.length) return
    const id = setTimeout(() => setSugs((m) => new Map(m).set(todo[0], suggest(todo[0], dict, user))), 0)
    return () => clearTimeout(id)
  }, [dict, result, sugs, user])

  const syncScroll = () => { if (back.current && ta.current) { back.current.scrollTop = ta.current.scrollTop; back.current.scrollLeft = ta.current.scrollLeft } }
  const pickAt = () => {
    const pos = ta.current?.selectionStart ?? -1
    setActive(result?.bad.find((t) => pos >= t.start && pos <= t.end) ?? null)
  }
  const replaceRange = (t: Token, w: string) => {
    set({ text: s.text.slice(0, t.start) + w + s.text.slice(t.end) })
    setActive(null)
  }
  const replaceAll = (word: string, w: string) => {
    if (!result) return
    let out = '', last = 0
    for (const t of result.bad) if (t.word === word) { out += s.text.slice(last, t.start) + w; last = t.end }
    set({ text: out + s.text.slice(last) })
    setActive(null)
  }
  const addWord = (w: string) => { const v = w.trim(); if (v && !s.user.includes(v)) set({ user: [...s.user, v].sort((a, b) => a.localeCompare(b)) }); setActive(null) }

  // Backdrop with wavy underlines under misspelled tokens.
  const backdrop = useMemo(() => {
    if (!result) return [s.text]
    const parts: React.ReactNode[] = []
    let last = 0
    result.bad.forEach((t, i) => {
      parts.push(s.text.slice(last, t.start))
      parts.push(<mark key={i} style={{ background: active && active.start === t.start ? 'color-mix(in srgb, var(--err) 18%, transparent)' : 'transparent', color: 'transparent', textDecoration: 'underline wavy var(--err)', textDecorationThickness: 1.5, textUnderlineOffset: 3, borderRadius: 3 }}>{s.text.slice(t.start, t.end)}</mark>)
      last = t.end
    })
    parts.push(s.text.slice(last) + '\n ')
    return parts
  }, [result, s.text, active])

  const activeSugs = active && dict ? (sugs.get(active.word) ?? suggest(active.word, dict, user)) : []
  const words = (s.text.match(/[\p{L}'’]+/gu) ?? []).length

  return (
    <Split wide="left">
      <div>
        <Panel title="Text" actions={<>
          <CopyButton text={() => s.text} />
          <Btn onClick={() => download('text.txt', s.text, 'text/plain')}>⬇ .txt</Btn>
          <Btn kind="ghost" onClick={() => { set({ text: SAMPLE }); setIgnore(new Set()) }}>Sample</Btn>
          <Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn>
        </>}>
          <div style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel2)', height: 340 }}>
            <div ref={back} aria-hidden style={{ ...FONT, position: 'absolute', inset: 0, overflow: 'hidden', color: 'transparent', pointerEvents: 'none' }}>{backdrop}</div>
            <textarea
              ref={ta}
              value={s.text}
              spellCheck={false}
              aria-label="Text to check"
              onChange={(e) => { set({ text: e.target.value }); setActive(null) }}
              onScroll={syncScroll}
              onClick={pickAt}
              onKeyUp={(e) => e.key.startsWith('Arrow') && pickAt()}
              style={{ ...FONT, position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 'none', background: 'transparent', color: 'var(--fg)', caretColor: 'var(--accent)', boxSizing: 'border-box', overflowY: 'auto' }}
            />
          </div>
          {!dict && !err && <Note>Loading the dictionary (≈ 280 KB, once)…</Note>}
          {err && <Note tone="err">Could not load the dictionary: {err}</Note>}
          {active ? (
            <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)' }}>
              <b style={{ color: 'var(--err)' }}>“{active.word}”</b> <span className="muted">— pick a replacement</span>
              <Row>
                {activeSugs.length ? activeSugs.map((w) => <Btn key={w} kind="primary" onClick={() => replaceRange(active, w)}>{w}</Btn>) : <span className="muted">No close suggestions.</span>}
              </Row>
              <Row>
                {activeSugs[0] && <Btn onClick={() => replaceAll(active.word, activeSugs[0])}>Replace all with “{activeSugs[0]}”</Btn>}
                <Btn onClick={() => addWord(active.word)}>+ Add to dictionary</Btn>
                <Btn kind="ghost" onClick={() => { setIgnore(new Set(ignore).add(active.word)); setActive(null) }}>Ignore all</Btn>
              </Row>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Click an underlined word for suggestions. Checked locally against a 72 000-word US English list — your text never leaves this page.</p>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Words" value={words} />
          <Stat label="Misspellings" value={result ? result.bad.length : '…'} tone={result && !result.bad.length ? 'good' : 'bad'} sub={result ? `${result.issues.length} unique` : ''} />
        </Stats>
        <Panel title="Issues">
          {result && !result.issues.length && <Note tone="ok">No spelling problems found ✓</Note>}
          {result?.issues.slice(0, 60).map((i) => {
            const sg = sugs.get(i.word)
            return (
              <div key={i.word} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <button type="button" onClick={() => { const t = result.bad.find((b) => b.word === i.word)!; setActive(t); ta.current?.focus(); ta.current?.setSelectionRange(t.start, t.end) }} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--err)', fontWeight: 700, textDecoration: 'underline wavy' }}>{i.word}</button>
                {i.count > 1 && <span className="muted" style={{ fontSize: 12 }}>×{i.count}</span>}
                <span style={{ flex: 1 }} />
                {sg === undefined ? <span className="muted" style={{ fontSize: 12 }}>…</span> : sg[0] ? <Btn onClick={() => replaceAll(i.word, sg[0])} title={`Other options: ${sg.slice(1).join(', ')}`}>→ {sg[0]}</Btn> : <span className="muted" style={{ fontSize: 12 }}>no suggestion</span>}
                <Btn kind="ghost" title="Add to my dictionary" onClick={() => addWord(i.word)}>+</Btn>
                <Btn kind="ghost" title="Ignore in this session" onClick={() => setIgnore(new Set(ignore).add(i.word))}>✕</Btn>
              </div>
            )
          })}
          {result && result.issues.length > 1 && (
            <Row><Btn kind="primary" onClick={() => {
              let text = s.text
              for (const t of [...result.bad].reverse()) { const w = sugs.get(t.word)?.[0]; if (w) text = text.slice(0, t.start) + w + text.slice(t.end) }
              set({ text })
            }}>Accept all top suggestions</Btn></Row>
          )}
        </Panel>
        <Panel title="Options & my dictionary">
          <Check label="Ignore ALL-CAPS words (acronyms like NASA, HTTP)" value={s.ignoreCaps} onChange={(ignoreCaps) => set({ ignoreCaps })} />
          {ignore.size > 0 && <p className="muted" style={{ fontSize: 12.5 }}>Ignored this session: {[...ignore].join(', ')} <Btn kind="ghost" onClick={() => setIgnore(new Set())}>Reset</Btn></p>}
          <Row>
            <Txt label="Add a word" value={newWord} onChange={setNewWord} placeholder="e.g. Kubernetes" />
            <div style={{ alignSelf: 'end' }}><Btn onClick={() => { addWord(newWord); setNewWord('') }} disabled={!newWord.trim()}>+ Add</Btn></div>
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {s.user.map((w) => <span key={w} className="k-btn" style={{ fontSize: 12.5, padding: '2px 8px' }}>{w} <button type="button" aria-label={`Remove ${w}`} onClick={() => set({ user: s.user.filter((x) => x !== w) })} style={{ border: 0, background: 'none', color: 'var(--err)', cursor: 'pointer' }}>✕</button></span>)}
            {!s.user.length && <span className="muted" style={{ fontSize: 12.5 }}>Empty — words you add are saved in this browser.</span>}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Handles capitalisation, possessives (John’s, teachers’), hyphenated compounds and common prefixes/suffixes; skips URLs, e-mails, code, numbers and camelCase. Suggestions rank by keyboard-aware Damerau-Levenshtein distance.
            {dict && ` Dictionary: ${dict.size.toLocaleString('en-US')} words, loaded in ${Math.round(loadMs)} ms.`} Word list: SCOWL/ESDB size 50 (US) © Kevin Atkinson, used under its permissive licence.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
