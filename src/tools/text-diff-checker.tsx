import { useMemo, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, Note, Panel, Row, Seg, Stat, Stats, download, pct, useToolState } from '../kit'
import { chars, diff, keyFn, lines, sideBySide, stats, unified, words, type Chunk, type Row as DRow } from './lib/text-diff-checker'

const A = `# Project setup

Install the dependencies with npm install.
Run the development server on port 3000.
The app reads its settings from config.json.

## Testing
Run npm test to execute the unit tests.
Coverage reports are written to /coverage.

Questions? Contact the team on Slack.`
const B = `# Project setup

Install the dependencies with pnpm install.
Run the development server on port 5173.
The app reads its settings from config.json and .env files.

## Testing
Run pnpm test to execute the unit and integration tests.

## Deployment
Push to main to deploy automatically.

Questions? Contact the team on Slack.`

const DEF = { a: A, b: B, nameA: 'README (old)', nameB: 'README (new)', mode: 'line' as 'line' | 'word' | 'char', view: 'split' as 'split' | 'unified', ignoreCase: false, ignoreWs: false, onlyChanges: false }
const DEL = { background: 'rgba(239,68,68,.16)' }, ADD = { background: 'rgba(16,185,129,.16)' }
const DELX = { background: 'rgba(239,68,68,.38)', borderRadius: 2, textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,.6)' }
const ADDX = { background: 'rgba(16,185,129,.4)', borderRadius: 2 }
const MAX_CHARS = 40000

/** Word-level highlight of one side of a changed line. */
function inline(l: string, r: string, side: '-' | '+', key: (s: string) => string): ReactNode {
  const cs = diff(words(l), words(r), key)
  return cs.filter((c) => c.op === '=' || c.op === side).map((c, i) => (c.op === '=' ? <span key={i}>{c.items.join('')}</span> : <span key={i} style={side === '-' ? DELX : ADDX}>{c.items.join('')}</span>))
}

export default function TextDiffChecker() {
  const [s, set, reset] = useToolState('text-diff-checker', DEF)
  const key = useMemo(() => keyFn(s.ignoreCase, s.ignoreWs), [s.ignoreCase, s.ignoreWs])
  const tooBig = s.mode === 'char' && s.a.length + s.b.length > MAX_CHARS
  const mode = tooBig ? 'word' : s.mode
  const lineChunks = useMemo(() => diff(lines(s.a), lines(s.b), key), [s.a, s.b, key])
  const tokChunks = useMemo<Chunk[] | null>(() => (mode === 'line' ? null : diff(mode === 'word' ? words(s.a) : chars(s.a), mode === 'word' ? words(s.b) : chars(s.b), key)), [s.a, s.b, mode, key])
  const ls = stats(lineChunks)
  const ws = useMemo(() => stats(diff(words(s.a), words(s.b), key), (t) => (/\S/.test(t) ? 1 : 0)), [s.a, s.b, key])
  const rows = useMemo(() => sideBySide(lineChunks), [lineChunks])
  const patch = () => unified(lineChunks, s.nameA, s.nameB)
  const identical = lineChunks.every((c) => c.op === '=')

  // collapse long unchanged runs
  const visible = useMemo(() => {
    if (!s.onlyChanges) return rows.map((r) => ({ r }))
    const out: ({ r: DRow } | { skip: number })[] = []
    const near = rows.map((_, i) => rows.slice(Math.max(0, i - 2), i + 3).some((x) => x.kind !== 'same'))
    let skip = 0
    rows.forEach((r, i) => {
      if (near[i]) {
        if (skip) out.push({ skip })
        skip = 0
        out.push({ r })
      } else skip++
    })
    if (skip) out.push({ skip })
    return out
  }, [rows, s.onlyChanges])

  const load = (side: 'a' | 'b') => async (f?: File) => {
    if (!f) return
    const t = await f.text()
    set(side === 'a' ? { a: t, nameA: f.name } : { b: t, nameB: f.name })
  }
  const num = (n?: number) => <td style={{ width: 1, padding: '0 6px', color: 'var(--muted)', textAlign: 'right', userSelect: 'none', fontSize: 11 }}>{n ?? ''}</td>
  const cell = (content: ReactNode, style?: object) => <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '1px 6px', verticalAlign: 'top', ...style }}>{content}</td>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {(['a', 'b'] as const).map((side) => (
          <div key={side}><Panel title={<input value={side === 'a' ? s.nameA : s.nameB} onChange={(e) => set(side === 'a' ? { nameA: e.target.value } : { nameB: e.target.value })} aria-label="Name" style={{ font: 'inherit', fontWeight: 700, border: 0, background: 'transparent', color: 'var(--fg)', width: '100%' }} />}
            actions={<label className="k-btn">📂 Open<input type="file" hidden accept="text/*,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.xml,.yml,.yaml,.txt,.diff" onChange={(e) => { void load(side)(e.target.files?.[0]); e.target.value = '' }} /></label>}>
            <Area mono rows={10} value={side === 'a' ? s.a : s.b} onChange={(v) => set(side === 'a' ? { a: v } : { b: v })} placeholder={side === 'a' ? 'Original text…' : 'Changed text…'} />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{lines(side === 'a' ? s.a : s.b).length} lines · {(side === 'a' ? s.a : s.b).length} characters</div>
          </Panel></div>
        ))}
      </div>
      <Row>
        <Btn onClick={() => set({ a: s.b, b: s.a, nameA: s.nameB, nameB: s.nameA })}>⇄ Swap</Btn>
        <Btn kind="ghost" onClick={() => set({ a: '', b: '' })}>Clear</Btn>
        <Btn kind="ghost" onClick={reset}>Example</Btn>
        <Check label="Ignore case" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
        <Check label="Ignore whitespace" value={s.ignoreWs} onChange={(ignoreWs) => set({ ignoreWs })} />
      </Row>
      <Stats>
        <Stat label="Similarity" value={pct(ws.similarity, 1)} tone={identical ? 'good' : 'accent'} sub="by words" />
        <Stat label="Lines" value={<><span style={{ color: 'var(--ok)' }}>+{ls.add}</span> <span style={{ color: 'var(--err)' }}>−{ls.del}</span></>} sub={`${ls.same} unchanged`} />
        <Stat label="Words" value={<><span style={{ color: 'var(--ok)' }}>+{ws.add}</span> <span style={{ color: 'var(--err)' }}>−{ws.del}</span></>} sub={`${ws.same} unchanged`} />
        <Stat label="Hunks" value={(patch().match(/^@@/gm) ?? []).length} sub="in unified diff" />
      </Stats>
      <Panel title="Differences" actions={<>
        <Seg value={s.mode} onChange={(m) => set({ mode: m })} options={[['line', 'Lines'], ['word', 'Words'], ['char', 'Chars']]} />
        {s.mode === 'line' && <Seg value={s.view} onChange={(view) => set({ view })} options={[['split', 'Side by side'], ['unified', 'Unified']]} />}
        <CopyButton text={patch} label="Copy patch" />
        <Btn onClick={() => download('changes.diff', patch(), 'text/x-diff')}>⬇ .diff</Btn>
      </>}>
        {tooBig && <Note tone="warn">Character mode is limited to {MAX_CHARS.toLocaleString()} characters; showing a word diff instead.</Note>}
        {identical ? <Note tone="ok">No differences{s.ignoreCase || s.ignoreWs ? ' (with the current ignore options)' : ''}. ✓</Note> : mode === 'line' ? (
          <>
            <Check label="Only show changed lines (with 2 lines of context)" value={s.onlyChanges} onChange={(onlyChanges) => set({ onlyChanges })} />
            <div className="k-table-wrap" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: s.view === 'split' ? 'fixed' : 'auto' }}>
                {s.view === 'split' && <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 40 }} /><col /></colgroup>}
                <tbody>
                  {visible.map((v, i) => {
                    if ('skip' in v) return <tr key={i}><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', background: 'var(--panel2)', fontSize: 12 }}>⋯ {v.skip} unchanged line{v.skip > 1 ? 's' : ''}</td></tr>
                    const r = v.r
                    if (s.view === 'split') return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                        {num(r.ln)}
                        {cell(r.kind === 'change' ? inline(r.left!, r.right!, '-', key) : r.left, r.kind === 'del' || r.kind === 'change' ? DEL : r.left === undefined ? { background: 'var(--panel2)' } : undefined)}
                        {num(r.rn)}
                        {cell(r.kind === 'change' ? inline(r.left!, r.right!, '+', key) : r.right, r.kind === 'add' || r.kind === 'change' ? ADD : r.right === undefined ? { background: 'var(--panel2)' } : undefined)}
                      </tr>
                    )
                    const out: ReactNode[] = []
                    if (r.left !== undefined && r.kind !== 'same') out.push(<tr key={i + 'd'}>{num(r.ln)}{num()}{cell(<><b>− </b>{r.kind === 'change' ? inline(r.left, r.right!, '-', key) : r.left}</>, DEL)}</tr>)
                    if (r.right !== undefined && r.kind !== 'same') out.push(<tr key={i + 'a'}>{num()}{num(r.rn)}{cell(<><b>+ </b>{r.kind === 'change' ? inline(r.left!, r.right, '+', key) : r.right}</>, ADD)}</tr>)
                    if (r.kind === 'same') out.push(<tr key={i}>{num(r.ln)}{num(r.rn)}{cell(<>{'  '}{r.left}</>)}</tr>)
                    return out
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
            {tokChunks!.map((c, i) => <span key={i} style={c.op === '-' ? DELX : c.op === '+' ? ADDX : undefined}>{c.items.join('')}</span>)}
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>Myers shortest-edit-script diff, computed locally. Changed lines are refined word by word.</p>
      </Panel>
    </div>
  )
}
