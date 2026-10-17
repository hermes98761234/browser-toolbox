import { useMemo, useState, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, FileDrop, Note, Panel, Row, Select, Split, Stat, Stats, Table, download, uid, useToolState } from '../kit'
import { runRegex } from './lib/regex-tester'
import { pipeline, type Rule } from './lib/regex-find-replace'

interface State { text: string; rules: Rule[]; sel: string }

const R = (find: string, replace: string, flags = 'g', literal = false): Rule => ({ id: uid(), on: true, find, replace, flags, literal })

const SAMPLE = `Order log — exported 2026-10-17
2026-10-03  john.smith@example.com    ORDER #1042   total: 49.90 USD
2026-10-05  Maria_Garcia@Mail.org     order #1043   total: 120.00 USD${'   '}
2026-10-09  li.wei@example.cn         Order #1044   total: 15.5 USD


2026-10-12  ahmed@example.com         ORDER #1045   total: 230.25 USD
Contact support at help@shop.example or call +1 (555) 010-7788.`

const DEF: State = {
  text: SAMPLE,
  sel: 'r1',
  rules: [
    { id: 'r1', on: true, find: '(\\d{4})-(\\d{2})-(\\d{2})', replace: '$3.$2.$1', flags: 'g', literal: false },
    { id: 'r2', on: true, find: 'order #(\\d+)', replace: 'Order #$1', flags: 'gi', literal: false },
    { id: 'r3', on: true, find: '([\\w.]+)@([\\w.]+)', replace: '\\L$1@$2', flags: 'g', literal: false },
    { id: 'r4', on: true, find: '[ \\t]+$', replace: '', flags: 'gm', literal: false },
    { id: 'r5', on: true, find: '\\n{3,}', replace: '\\n\\n', flags: 'g', literal: false },
  ],
}

const PRESETS: [string, Omit<Rule, 'id' | 'on'>][] = [
  ['Trim trailing spaces', { find: '[ \\t]+$', replace: '', flags: 'gm', literal: false }],
  ['Collapse repeated spaces', { find: ' {2,}', replace: ' ', flags: 'g', literal: false }],
  ['Remove blank lines', { find: '^\\s*\\n', replace: '', flags: 'gm', literal: false }],
  ['YYYY-MM-DD → DD/MM/YYYY', { find: '(\\d{4})-(\\d{2})-(\\d{2})', replace: '$3/$2/$1', flags: 'g', literal: false }],
  ['Mask e-mail addresses', { find: '([\\w.+-])[\\w.+-]*@([\\w-]+\\.)+[\\w-]+', replace: '$1***@***', flags: 'g', literal: false }],
  ['snake_case → camelCase', { find: '_([a-z])', replace: '\\u$1', flags: 'g', literal: false }],
  ['Capitalize each word', { find: '\\b(\\w)(\\w*)', replace: '\\u$1\\L$2', flags: 'g', literal: false }],
  ['Swap “Last, First” → “First Last”', { find: '^(\\w+),\\s*(\\w+)$', replace: '$2 $1', flags: 'gm', literal: false }],
  ['Quote each line', { find: '^(.*)$', replace: '"$1",', flags: 'gm', literal: false }],
  ['Strip HTML tags', { find: '<[^>]+>', replace: '', flags: 'g', literal: false }],
  ['Smart quotes → straight', { find: '[“”]', replace: '"', flags: 'g', literal: false }],
]

const FLAGS: [string, string][] = [['g', 'global'], ['i', 'ignore case'], ['m', 'multiline ^$'], ['s', 'dot matches \\n'], ['u', 'unicode']]
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MARK = ['#fde68a', '#bfdbfe']

export default function RegexFindReplace() {
  const [s, set, reset] = useToolState('regex-find-replace', DEF)
  const [files, setFiles] = useState<{ name: string; out: string; n: number }[]>([])
  const [view, setView] = useState<'diff' | 'out'>('out')
  const sel = s.rules.find((r) => r.id === s.sel) ?? s.rules[0]

  const res = useMemo(() => pipeline(s.text, s.rules), [s.text, s.rules])
  // Input that the selected rule sees (after the rules before it).
  const selIdx = sel ? s.rules.indexOf(sel) : -1
  const before = useMemo(() => (selIdx > 0 ? pipeline(s.text, s.rules.slice(0, selIdx)).text : s.text), [s.text, s.rules, selIdx])
  const hits = useMemo(() => (sel?.find ? runRegex(sel.literal ? esc(sel.find) : sel.find, sel.flags.includes('g') ? sel.flags : sel.flags + 'g', before, null, 2000) : null), [sel, before])

  const edit = (id: string, p: Partial<Rule>) => set({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= s.rules.length) return
    const r = [...s.rules]
    ;[r[i], r[j]] = [r[j], r[i]]
    set({ rules: r })
  }
  const total = res.counts.reduce((a, c) => a + c, 0)
  const inLines = s.text.split('\n'), outLines = res.text.split('\n')
  const changedLines = inLines.length === outLines.length ? inLines.filter((l, i) => l !== outLines[i]).length : NaN

  const highlighted: ReactNode[] = []
  if (hits && !hits.error) {
    let pos = 0
    hits.hits.forEach((h, i) => {
      if (h.index > pos) highlighted.push(before.slice(pos, h.index))
      highlighted.push(<mark key={i} style={{ background: MARK[i % 2], color: '#111', borderRadius: 2 }} title={h.groups.map((g, k) => `$${g.name || k + 1} = ${g.value ?? '∅'}`).join('\n')}>{h.text || '∣'}</mark>)
      pos = h.end
    })
    highlighted.push(before.slice(pos))
  }

  const runFiles = async (fs: File[]) => setFiles(await Promise.all(fs.map(async (f) => { const p = pipeline(await f.text(), s.rules); return { name: f.name, out: p.text, n: p.counts.reduce((a, c) => a + c, 0) } })))

  return (
    <Split>
      <div>
        <Panel
          title="Rules (applied top to bottom)"
          actions={
            <>
              <Select label="" value="" onChange={(v) => { const p = PRESETS.find((x) => x[0] === v); if (p) { const r = { ...p[1], id: uid(), on: true }; set({ rules: [...s.rules, r], sel: r.id }) } }} options={[['', '+ Preset…'], ...PRESETS.map((p) => [p[0], p[0]] as [string, string])]} />
              <Btn onClick={() => { const r = R('', ''); set({ rules: [...s.rules, r], sel: r.id }) }}>+ Rule</Btn>
            </>
          }
        >
          {s.rules.map((r, i) => {
            const err = res.errors[i]
            const active = r.id === sel?.id
            return (
              <div key={r.id} onClick={() => set({ sel: r.id })} style={{ border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: 8, marginBottom: 8, opacity: r.on ? 1 : 0.55, cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input type="checkbox" checked={r.on} onChange={(e) => edit(r.id, { on: e.target.checked })} aria-label="Enabled" />
                  <b style={{ fontSize: 13 }}>#{i + 1}</b>
                  <span className="muted" style={{ fontSize: 12, flex: 1 }}>{err ? '' : `${res.counts[i]} replacement${res.counts[i] === 1 ? '' : 's'}`}</span>
                  <button className="k-btn ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button className="k-btn ghost" onClick={() => move(i, 1)} disabled={i === s.rules.length - 1} title="Move down">↓</button>
                  <button className="k-btn ghost" onClick={() => set({ rules: s.rules.filter((x) => x.id !== r.id) })} title="Delete">✕</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="muted" style={{ fontFamily: 'var(--mono)' }}>/</span>
                  <input className="k-text" value={r.find} onChange={(e) => edit(r.id, { find: e.target.value })} placeholder="find (regex)" aria-label="Find" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--mono)' }} spellCheck={false} />
                  <span className="muted" style={{ fontFamily: 'var(--mono)' }}>/{r.flags}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <span className="muted">→</span>
                  <input className="k-text" value={r.replace} onChange={(e) => edit(r.id, { replace: e.target.value })} placeholder="replace with ($1, $<name>, \U…\E)" aria-label="Replace" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--mono)' }} spellCheck={false} />
                </div>
                {active && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                    {FLAGS.map(([f, label]) => (
                      <Check key={f} label={<span title={label}><code>{f}</code> <span className="muted" style={{ fontSize: 12 }}>{label}</span></span>} value={r.flags.includes(f)} onChange={(v) => edit(r.id, { flags: v ? r.flags + f : r.flags.replace(f, '') })} />
                    ))}
                    <Check label={<span style={{ fontSize: 12 }}>plain text (no regex)</span>} value={r.literal} onChange={(literal) => edit(r.id, { literal })} />
                  </div>
                )}
                {err && <Note tone="err">{err}</Note>}
              </div>
            )
          })}
          <Row>
            <Btn kind="ghost" onClick={reset}>Reset to example</Btn>
          </Row>
        </Panel>
        <Panel title="Replacement cheat sheet">
          <Table
            head={['Token', 'Inserts']}
            rows={[['$1 … $99', 'capture group'], ['$<name>', 'named group'], ['$&', 'whole match'], ['$` / $\'', 'text before / after match'], ['$$', 'a literal $'], ['\\U … \\E', 'UPPERCASE until \\E'], ['\\L … \\E', 'lowercase until \\E'], ['\\u / \\l', 'next character upper / lower'], ['\\n  \\t', 'newline, tab']].map(([a, b]) => [<code key="c">{a}</code>, b])}
          />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Replacements" value={total} tone="accent" />
          <Stat label={`Rule #${selIdx + 1} matches`} value={hits?.error ? 'error' : (hits?.hits.length ?? 0)} sub={hits?.truncated ? 'first 2000 shown' : undefined} />
          <Stat label="Lines changed" value={Number.isFinite(changedLines) ? changedLines : `${inLines.length}→${outLines.length}`} />
          <Stat label="Length" value={`${s.text.length} → ${res.text.length}`} />
        </Stats>
        <Panel title="Input">
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} mono />
          <FileDrop multiple accept=".txt,.csv,.md,.json,.html,.xml,.log,.js,.ts,.css,.yml,.yaml,text/*" onFiles={(fs) => void runFiles(fs)} label="Bulk: drop text files to run all rules on each" />
        </Panel>
        <Panel title={`Matches of rule #${selIdx + 1}`}>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'var(--mono)', fontSize: 13, maxHeight: 260, overflow: 'auto', background: 'var(--panel2)', padding: 10, borderRadius: 8 }}>{highlighted.length ? highlighted : before}</pre>
          {hits && hits.hits.length > 0 && hits.hits[0].groups.length > 0 && (
            <Table
              max={8}
              head={['Match', ...hits.hits[0].groups.map((g, k) => g.name ? `$<${g.name}>` : `$${k + 1}`)]}
              rows={hits.hits.map((h) => [<code key="m">{h.text}</code>, ...h.groups.map((g, k) => <code key={k}>{g.value ?? '∅'}</code>)])}
            />
          )}
        </Panel>
        <Panel
          title="Result"
          actions={
            <>
              <button className={`k-btn ${view === 'out' ? 'primary' : 'ghost'}`} onClick={() => setView('out')}>Text</button>
              <button className={`k-btn ${view === 'diff' ? 'primary' : 'ghost'}`} onClick={() => setView('diff')}>Changed lines</button>
              <CopyButton text={res.text} />
              <Btn onClick={() => download('replaced.txt', res.text, 'text/plain')}>⬇</Btn>
              <Btn onClick={() => set({ text: res.text })} title="Use the result as new input">⤴ Apply</Btn>
            </>
          }
        >
          {view === 'out' || !Number.isFinite(changedLines) ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'var(--mono)', fontSize: 13, maxHeight: 320, overflow: 'auto', background: 'var(--panel2)', padding: 10, borderRadius: 8 }}>{res.text}</pre>
          ) : (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>
              {inLines.map((l, i) => l !== outLines[i] && (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ background: 'color-mix(in srgb, var(--err) 15%, transparent)', whiteSpace: 'pre-wrap' }}>− {l}</div>
                  <div style={{ background: 'color-mix(in srgb, var(--ok) 15%, transparent)', whiteSpace: 'pre-wrap' }}>+ {outLines[i]}</div>
                </div>
              ))}
              {changedLines === 0 && <span className="muted">No changes.</span>}
            </div>
          )}
        </Panel>
        {files.length > 0 && (
          <Panel title={`Bulk results (${files.length} files)`} actions={<Btn kind="ghost" onClick={() => setFiles([])}>Clear</Btn>}>
            <Table
              head={['File', 'Replacements', '']}
              rows={files.map((f) => [f.name, f.n, <Btn key="d" onClick={() => download(f.name, f.out, 'text/plain')}>⬇ Download</Btn>])}
            />
          </Panel>
        )}
      </div>
    </Split>
  )
}
