import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, pct, Row, Seg, Select, Stat, Stats, useToolState } from '../kit'
import { diffLines, diffWords, hunks, sideBySide, unifiedPatch, type Piece } from './lib/text-diff-viewer'

const OLD = `# Server configuration
host = "0.0.0.0"
port = 8080
workers = 4
timeout = 30

[database]
url = "postgres://localhost/app"
pool_size = 10
ssl = false

[logging]
level = "info"
format = "text"
file = "/var/log/app.log"

[cache]
enabled = true
ttl = 300
`
const NEW = `# Server configuration
host = "0.0.0.0"
port = 8443
workers = 8
timeout = 30

[database]
url = "postgres://db.internal/app"
pool_size = 10
ssl = true
ssl_mode = "verify-full"

[logging]
level = "warn"
format = "json"

[cache]
enabled = true
ttl = 300
`

const DEF = { oldText: OLD, newText: NEW, oldName: 'config.old.toml', newName: 'config.toml', view: 'split' as 'split' | 'unified', gran: 'line' as 'line' | 'word', ignoreCase: false, ignoreWs: false, ctx: 3 }

const BG = { del: 'rgb(239 68 68 / 0.13)', ins: 'rgb(16 185 129 / 0.14)', delStrong: 'rgb(239 68 68 / 0.38)', insStrong: 'rgb(16 185 129 / 0.4)' }
const cell: CSSProperties = { padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', verticalAlign: 'top' }
const numCell: CSSProperties = { padding: '1px 6px', textAlign: 'right', color: 'var(--muted)', userSelect: 'none', verticalAlign: 'top', width: 1, whiteSpace: 'nowrap' }

function Pieces({ pieces, side }: { pieces: Piece[]; side: 'old' | 'new' | 'both' }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.t === 'eq' ? (
          <span key={i}>{p.text}</span>
        ) : p.t === 'del' && side !== 'new' ? (
          <del key={i} style={{ background: BG.delStrong, textDecoration: side === 'both' ? 'line-through' : 'none', borderRadius: 3 }}>{p.text}</del>
        ) : p.t === 'ins' && side !== 'old' ? (
          <ins key={i} style={{ background: BG.insStrong, textDecoration: 'none', borderRadius: 3 }}>{p.text}</ins>
        ) : null,
      )}
    </>
  )
}

export default function TextDiffViewer() {
  const [s, set, reset] = useToolState('text-diff-viewer', DEF)
  const opts = useMemo(() => ({ ignoreCase: s.ignoreCase, ignoreWhitespace: s.ignoreWs }), [s.ignoreCase, s.ignoreWs])
  const d = useMemo(() => diffLines(s.oldText, s.newText, opts), [s.oldText, s.newText, opts])
  const words = useMemo(() => (s.gran === 'word' ? diffWords(s.oldText, s.newText, opts) : []), [s.gran, s.oldText, s.newText, opts])
  const patch = useMemo(() => unifiedPatch(d, s.oldName || 'a', s.newName || 'b', 3), [d, s.oldName, s.newName])
  const nHunks = useMemo(() => hunks(d.ops, 3).length, [d])
  const A = d.old.lines, B = d.new.lines

  // Which op indices to show (context collapsing).
  const visible = useMemo(() => {
    const v = new Array<boolean>(d.ops.length).fill(s.ctx < 0)
    if (s.ctx >= 0)
      d.ops.forEach((o, i) => {
        if (o.t !== 'eq') for (let j = Math.max(0, i - s.ctx); j <= Math.min(d.ops.length - 1, i + s.ctx); j++) v[j] = true
      })
    return v
  }, [d, s.ctx])

  const gap = (key: string | number, n: number, cols: number) => (
    <tr key={`g${key}`}>
      <td colSpan={cols} style={{ padding: '3px 8px', background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }} onClick={() => set({ ctx: -1 })}>
        ⋯ {n} unchanged line{n === 1 ? '' : 's'} (click to expand all)
      </td>
    </tr>
  )

  const loadFile = async (f: File, side: 'old' | 'new') => {
    const text = await f.text()
    set(side === 'old' ? { oldText: text, oldName: f.name } : { newText: text, newName: f.name })
  }

  let body: ReactNode
  if (s.gran === 'word') {
    body = (
      <div className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.6, padding: 12, border: '1px solid var(--line)', borderRadius: 10, maxHeight: 640, overflow: 'auto' }}>
        <Pieces pieces={words} side="both" />
      </div>
    )
  } else if (s.view === 'split') {
    const rows = sideBySide(d.ops)
    // Map op visibility onto rows: a row is visible if it is a change or near one.
    const rv = new Array<boolean>(rows.length).fill(s.ctx < 0)
    if (s.ctx >= 0)
      rows.forEach((r, i) => {
        if (r.kind !== 'eq') for (let j = Math.max(0, i - s.ctx); j <= Math.min(rows.length - 1, i + s.ctx); j++) rv[j] = true
      })
    const trs: ReactNode[] = []
    let hidden = 0
    rows.forEach((r, i) => {
      if (!rv[i]) {
        hidden++
        return
      }
      if (hidden) trs.push(gap(i, hidden, 4))
      hidden = 0
      const pieces = r.kind === 'chg' ? diffWords(A[r.l!], B[r.r!], opts) : null
      const lbg = r.kind === 'del' || r.kind === 'chg' ? BG.del : undefined
      const rbg = r.kind === 'ins' || r.kind === 'chg' ? BG.ins : undefined
      trs.push(
        <tr key={i}>
          <td style={{ ...numCell, background: lbg }}>{r.l !== undefined ? r.l + 1 : ''}</td>
          <td style={{ ...cell, background: r.l !== undefined ? lbg : 'var(--bg)', borderRight: '1px solid var(--line)', width: '50%' }}>
            {pieces ? <Pieces pieces={pieces} side="old" /> : r.l !== undefined ? A[r.l] : ''}
          </td>
          <td style={{ ...numCell, background: rbg }}>{r.r !== undefined ? r.r + 1 : ''}</td>
          <td style={{ ...cell, background: r.r !== undefined ? rbg : 'var(--bg)', width: '50%' }}>{pieces ? <Pieces pieces={pieces} side="new" /> : r.r !== undefined ? B[r.r] : ''}</td>
        </tr>,
      )
    })
    if (hidden) trs.push(gap('end', hidden, 4))
    body = (
      <div style={{ overflow: 'auto', maxHeight: 640, border: '1px solid var(--line)', borderRadius: 10 }}>
        <table className="mono" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, lineHeight: 1.5, tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              <th colSpan={2} style={{ textAlign: 'left', padding: '4px 8px' }}>− {s.oldName || 'Original'}</th>
              <th colSpan={2} style={{ textAlign: 'left', padding: '4px 8px' }}>+ {s.newName || 'Changed'}</th>
            </tr>
          </thead>
          <tbody>{trs}</tbody>
        </table>
      </div>
    )
  } else {
    const trs: ReactNode[] = []
    let hidden = 0
    d.ops.forEach((o, i) => {
      if (!visible[i]) {
        hidden++
        return
      }
      if (hidden) trs.push(gap(i, hidden, 4))
      hidden = 0
      const bg = o.t === 'del' ? BG.del : o.t === 'ins' ? BG.ins : undefined
      trs.push(
        <tr key={i} style={{ background: bg }}>
          <td style={numCell}>{o.t !== 'ins' ? o.a + 1 : ''}</td>
          <td style={numCell}>{o.t !== 'del' ? o.b + 1 : ''}</td>
          <td style={{ ...numCell, width: 14, color: o.t === 'del' ? 'var(--err)' : o.t === 'ins' ? 'var(--ok)' : 'var(--muted)' }}>{o.t === 'del' ? '−' : o.t === 'ins' ? '+' : ' '}</td>
          <td style={cell}>{o.t === 'ins' ? B[o.b] : A[o.a]}</td>
        </tr>,
      )
    })
    if (hidden) trs.push(gap('end', hidden, 4))
    body = (
      <div style={{ overflow: 'auto', maxHeight: 640, border: '1px solid var(--line)', borderRadius: 10 }}>
        <table className="mono" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, lineHeight: 1.5 }}>
          <tbody>{trs}</tbody>
        </table>
      </div>
    )
  }

  const editor = (side: 'old' | 'new') => {
    const isOld = side === 'old'
    return (
      <div style={{ minWidth: 0 }}>
        <Row wrap={false}>
          <input className="k-text" style={{ flex: 1, minWidth: 0 }} value={isOld ? s.oldName : s.newName} onChange={(e) => set(isOld ? { oldName: e.target.value } : { newName: e.target.value })} aria-label={`${side} file name`} />
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{(isOld ? A : B).length} lines</span>
        </Row>
        <textarea
          className="k-area mono"
          rows={12}
          spellCheck={false}
          value={isOld ? s.oldText : s.newText}
          onChange={(e) => set(isOld ? { oldText: e.target.value } : { newText: e.target.value })}
          aria-label={isOld ? 'Original text' : 'Changed text'}
          style={{ width: '100%', marginTop: 6, whiteSpace: 'pre', overflowX: 'auto' }}
        />
        <FileDrop onFiles={([f]) => void loadFile(f, side)} label={`Open ${isOld ? 'original' : 'changed'} file`} />
      </div>
    )
  }

  const same = d.added === 0 && d.removed === 0

  return (
    <div>
      <Panel
        title="Texts to compare"
        actions={
          <>
            <Btn onClick={() => set({ oldText: s.newText, newText: s.oldText, oldName: s.newName, newName: s.oldName })}>⇄ Swap</Btn>
            <Btn onClick={() => set({ oldText: '', newText: '', oldName: 'original.txt', newName: 'changed.txt' })}>Clear</Btn>
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {editor('old')}
          {editor('new')}
        </div>
      </Panel>

      <Stats>
        <Stat label="Added lines" value={`+${d.added}`} tone={d.added ? 'good' : undefined} />
        <Stat label="Removed lines" value={`−${d.removed}`} tone={d.removed ? 'bad' : undefined} />
        <Stat label="Unchanged" value={d.same} sub={`${nHunks} hunk${nHunks === 1 ? '' : 's'}`} />
        <Stat label="Similarity" value={pct(d.similarity, 1)} tone="accent" sub="2 × common / total lines" />
      </Stats>

      <Panel
        title="Differences"
        actions={
          <>
            <Btn kind="primary" disabled={!patch} onClick={() => download(`${(s.newName || 'changes').replace(/\.[^.]*$/, '')}.patch`, patch, 'text/x-diff')}>⬇ .patch</Btn>
            <CopyButton text={() => patch} label="Copy patch" />
          </>
        }
      >
        <Row>
          <Seg value={s.gran} onChange={(gran) => set({ gran })} options={[['line', 'Lines'], ['word', 'Words']]} label="Granularity" />
          {s.gran === 'line' && <Seg value={s.view} onChange={(view) => set({ view })} options={[['split', 'Side by side'], ['unified', 'Unified']]} label="View" />}
          {s.gran === 'line' && (
            <div style={{ minWidth: 150 }}>
              <Select label="Context" value={s.ctx} onChange={(ctx) => set({ ctx })} options={[[0, 'Changes only'], [3, '3 lines'], [10, '10 lines'], [-1, 'Whole file']]} />
            </div>
          )}
          <Check label="Ignore case" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Ignore whitespace" value={s.ignoreWs} onChange={(ignoreWs) => set({ ignoreWs })} />
        </Row>
        <div style={{ marginTop: 10 }}>{same ? <Note tone="ok">The texts are identical{s.ignoreCase || s.ignoreWs ? ' (with the current ignore options)' : ''}.</Note> : body}</div>
      </Panel>

      {patch && (
        <Panel title="Unified patch preview">
          <pre className="mono" style={{ margin: 0, fontSize: 12, maxHeight: 260, overflow: 'auto', background: 'var(--bg)', padding: 10, borderRadius: 8 }}>
            {patch.split('\n').map((l, i) => (
              <div key={i} style={{ color: l.startsWith('@@') ? 'var(--accent)' : l.startsWith('+') && !l.startsWith('+++') ? 'var(--ok)' : l.startsWith('-') && !l.startsWith('---') ? 'var(--err)' : undefined }}>
                {l || ' '}
              </div>
            ))}
          </pre>
          <Note>Apply it with <code>patch -p0 &lt; file.patch</code> or <code>git apply</code>. Context is always 3 lines, like <code>diff -u</code>; ignore options affect which lines count as changed.</Note>
        </Panel>
      )}
    </div>
  )
}
