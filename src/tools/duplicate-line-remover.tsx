import { Area, Btn, Check, CopyButton, download, FileDrop, Panel, Row, Seg, Select, Split, Stat, Stats, useToolState } from '../kit'
import { DEFAULT_OPTS, process, type Opts } from './lib/duplicate-line-remover'

const SAMPLE = `apple@example.com
Banana@example.com
cherry@example.com
apple@example.com
  banana@example.com
date@example.com

cherry@example.com
elderberry@example.com
apple@example.com
fig@example.com
Date@example.com`

const DEF = { text: SAMPLE, ...DEFAULT_OPTS, ignoreCase: true }

export default function DuplicateLineRemover() {
  const [s, set, reset] = useToolState('duplicate-line-remover', DEF)
  const o: Opts = s
  const r = process(s.text, o)
  const top = [...r.rows].filter((x) => x.count > 1).sort((a, b) => b.count - a.count).slice(0, 8)
  const outLines = r.output ? r.output.split('\n').length : 0

  return (
    <Split>
      <div>
        <Panel title="Input" actions={<><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} mono placeholder="Paste a list, one item per line…" />
          <FileDrop accept=".txt,.csv,.log,.md,text/*" onFiles={async ([f]) => set({ text: await f.text() })} label="…or drop a text file" />
        </Panel>
        <Panel title="Options">
          <div className="k-field">
            <span className="k-label">Output</span>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['dedupe', 'Remove duplicates'], ['duplicates', 'Only duplicated'], ['uniques', 'Only unique'], ['count', 'With counts']]} />
          </div>
          <Row>
            <Select label="Sort" value={s.sort} onChange={(sort) => set({ sort })} options={[['none', 'Keep original order'], ['az', 'A → Z (exact)'], ['za', 'Z → A (exact)'], ['natural', 'Natural (item2 before item10)'], ['length', 'By length'], ['count', 'Most repeated first'], ['reverse', 'Reverse original order']]} />
            <Select label="When duplicated, keep" value={s.keep} onChange={(keep) => set({ keep })} options={[['first', 'First occurrence'], ['last', 'Last occurrence']]} />
          </Row>
          <Check label="Trim spaces at line ends" value={s.trim} onChange={(trim) => set({ trim })} />
          <Check label="Ignore case (Apple = apple)" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Treat repeated spaces/tabs as one" value={s.collapseSpaces} onChange={(collapseSpaces) => set({ collapseSpaces })} />
          <Check label="Remove empty lines" value={s.dropEmpty} onChange={(dropEmpty) => set({ dropEmpty })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Lines in" value={r.total} />
          <Stat label="Distinct" value={r.unique} tone="accent" />
          <Stat label="Duplicates removed" value={r.removed} tone={r.removed ? 'good' : undefined} />
          <Stat label="Repeated items" value={r.dupGroups} />
        </Stats>
        <Panel
          title={`Result (${outLines} lines)`}
          actions={
            <>
              <CopyButton text={r.output} />
              <Btn onClick={() => download('lines.txt', r.output + '\n', 'text/plain')}>⬇ .txt</Btn>
              <Btn onClick={() => set({ text: r.output })} title="Replace the input with this result">↺ Use as input</Btn>
            </>
          }
        >
          <Area value={r.output} onChange={() => undefined} rows={14} mono />
        </Panel>
        {top.length > 0 && (
          <Panel title="Most repeated">
            {top.map((x) => (
              <div key={x.key} style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '4px 0' }}>
                <b style={{ minWidth: 34, textAlign: 'right' }}>{x.count}×</b>
                <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.text || '(empty)'}</code>
                <span style={{ flex: 'none', width: 90, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(x.count / top[0].count) * 100}%`, background: 'var(--accent)' }} /></span>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 13 }}>Matching uses the options on the left; the kept line shows its {s.keep} spelling.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
