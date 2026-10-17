import { Btn, Check, CopyButton, download, Note, Panel, Split, Txt, useToolState } from '../kit'
import { build, CATS, defaults, INTENTS, search, type Intent } from './lib/vcs-command-builder'

interface Saved {
  vals: Record<string, string>
  flags: Record<string, boolean>
}
interface State {
  id: string
  q: string
  cat: string
  saved: Record<string, Saved>
  script: string[]
}

const DEF: State = { id: 'undocommit', q: '', cat: 'All', saved: {}, script: [] }
const EXAMPLES = ['undo last commit', 'rename branch', 'delete remote branch', 'find bug', 'ignore file', 'force push']

const codeBox: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 14, background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: 10, overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.7,
}

export default function VcsCommandBuilder() {
  const [s, set, reset] = useToolState('vcs-command-builder', DEF)
  const it: Intent = INTENTS.find((i) => i.id === s.id) ?? INTENTS[0]
  const cur: Saved = { ...defaults(it), ...s.saved[it.id] }
  const lines = build(it, cur.vals, cur.flags)
  const text = lines.join('\n')
  const save = (patch: Partial<Saved>) => set((st) => ({ ...st, saved: { ...st.saved, [it.id]: { ...cur, ...patch } } }))

  const found = search(s.q).filter((i) => s.cat === 'All' || i.cat === s.cat)
  const groups = CATS.map((c) => [c, found.filter((i) => i.cat === c)] as const).filter(([, l]) => l.length)

  return (
    <Split wide="right">
      <div>
        <Panel title="What do you want to do?">
          <Txt label="Describe it in plain words" value={s.q} onChange={(q) => set({ q })} placeholder="e.g. undo last commit" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => set({ q: e })} style={{ border: '1px solid var(--line)', background: s.q === e ? 'var(--panel2)' : 'transparent', color: 'var(--fg)', borderRadius: 999, padding: '3px 10px', fontSize: 13, cursor: 'pointer' }}>
                {e}
              </button>
            ))}
          </div>
          <select className="k-select" value={s.cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Category">
            {['All', ...CATS].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div style={{ maxHeight: 560, overflowY: 'auto', marginTop: 10 }}>
            {!groups.length && <Note tone="warn">No matching task. Try other words, e.g. “branch”, “undo”, “remote”.</Note>}
            {groups.map(([c, list]) => (
              <div key={c} style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, margin: '4px 0' }}>{c}</div>
                {list.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => set({ id: i.id })}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', margin: '2px 0', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid ' + (i.id === it.id ? 'var(--accent)' : 'transparent'), background: i.id === it.id ? 'var(--panel2)' : 'transparent', color: 'var(--fg)',
                    }}
                  >
                    {i.t}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div>
        <Panel title={it.t} actions={<span className="muted">{it.cat}</span>}>
          <p style={{ marginTop: 0 }}>{it.d}</p>
          {!!it.p?.length && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {it.p.map(([k, label, , hint]) => (
                <Txt key={k} label={label} hint={hint} value={cur.vals[k] ?? ''} onChange={(v) => save({ vals: { ...cur.vals, [k]: v } })} />
              ))}
            </div>
          )}
          {!!it.f?.length && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13 }}>Options</b>
              {it.f.map(([k, flag, why]) => (
                <div key={k} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                  <Check
                    label={<><code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{flag.replace(/\{(\w+)\}/g, '<$1>')}</code> <span className="muted">— {why}</span></>}
                    value={!!cur.flags[k]}
                    onChange={(v) => save({ flags: { ...cur.flags, [k]: v } })}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Command"
          actions={
            <>
              <CopyButton text={text} />
              <Btn onClick={() => set({ script: [...s.script, `# ${it.t}`, ...lines] })}>+ Add to script</Btn>
              <Btn kind="ghost" onClick={() => set((st) => ({ ...st, saved: Object.fromEntries(Object.entries(st.saved).filter(([k]) => k !== it.id)) }))}>Defaults</Btn>
            </>
          }
        >
          <div style={codeBox}>
            {lines.map((l, i) => (
              <div key={i}>
                <span style={{ color: '#64748b', userSelect: 'none' }}>{l.startsWith('#') ? '' : '$ '}</span>
                <span style={{ color: l.startsWith('#') ? '#94a3b8' : undefined }}>{l}</span>
              </div>
            ))}
          </div>
          {it.w && <Note tone="warn">⚠ {it.w}</Note>}
          {it.u && (
            <Note tone="info">
              ↶ To undo: <code style={{ fontFamily: 'var(--mono)' }}>{it.u}</code>
            </Note>
          )}
        </Panel>

        <Panel
          title={`Script (${s.script.filter((l) => !l.startsWith('#')).length} commands)`}
          actions={
            <>
              <CopyButton text={s.script.join('\n')} />
              <Btn disabled={!s.script.length} onClick={() => download('git-steps.sh', '#!/usr/bin/env bash\nset -euo pipefail\n\n' + s.script.join('\n') + '\n', 'text/x-shellscript')}>⬇ .sh</Btn>
              <Btn kind="ghost" onClick={() => set({ script: [] })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Reset all</Btn>
            </>
          }
        >
          {s.script.length ? (
            <div style={{ ...codeBox, fontSize: 13 }}>{s.script.join('\n')}</div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Chain several steps (e.g. stash → switch → pull → pop) with “Add to script”, then copy or download them as a shell script.</p>
          )}
        </Panel>
        <Note>All {INTENTS.length} recipes are built into the page and work offline. Values are shell-quoted automatically; review destructive commands before running them.</Note>
      </div>
    </Split>
  )
}
