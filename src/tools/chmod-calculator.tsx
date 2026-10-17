import { useState } from 'react'
import { Btn, Check, CopyButton, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { applyExpr, describe, parseOctal, parseSymbolic, SGID, STICKY, SUID, toChmodSymbolic, toOctal, toSymbolic, umaskDefaults, WHO } from './lib/chmod-calculator'

const PRESETS: [string, number, string][] = [
  ['644', 0o644, 'Regular file'],
  ['600', 0o600, 'Private file (SSH keys)'],
  ['755', 0o755, 'Script / directory'],
  ['700', 0o700, 'Private directory'],
  ['775', 0o775, 'Shared group dir'],
  ['664', 0o664, 'Group-editable file'],
  ['1777', 0o1777, '/tmp (sticky)'],
  ['2775', 0o2775, 'setgid project dir'],
  ['4755', 0o4755, 'setuid binary (passwd)'],
  ['444', 0o444, 'Read-only'],
]

const BITS = [
  ['Read', 4],
  ['Write', 2],
  ['Execute', 1],
] as const
const WHO_NAME = { u: 'Owner (u)', g: 'Group (g)', o: 'Others (o)' } as const
const SHIFT = { u: 6, g: 3, o: 0 } as const

const DEF = { mode: 0o755, kind: 'file' as 'file' | 'dir', name: 'deploy.sh', umask: '022', expr: 'g+w,o-rx' }

export default function ChmodCalculator() {
  const [s, set, reset] = useToolState('chmod-calculator', DEF)
  const [octDraft, setOctDraft] = useState<string | null>(null)
  const [symDraft, setSymDraft] = useState<string | null>(null)
  const mode = s.mode & 0o7777
  const oct = toOctal(mode)
  const sym = toSymbolic(mode)
  const setMode = (m: number) => {
    setOctDraft(null)
    setSymDraft(null)
    set({ mode: m & 0o7777 })
  }
  const toggle = (bit: number) => setMode(mode ^ bit)
  const name = s.name.trim() || 'file'
  const q = /[\s'"$`\\]/.test(name) ? `'${name.replace(/'/g, `'\\''`)}'` : name

  let exprResult: number | null = null
  let exprErr = ''
  try {
    if (s.expr.trim()) exprResult = applyExpr(mode, s.expr, s.kind === 'dir')
  } catch (e) {
    exprErr = (e as Error).message
  }
  const um = parseOctal(s.umask)
  const defs = um === null || um > 0o777 ? null : umaskDefaults(um)
  const octBad = octDraft !== null && parseOctal(octDraft) === null
  const symBad = symDraft !== null && parseSymbolic(symDraft) === null

  const commands: [string, string][] = [
    ['Numeric', `chmod ${oct} ${q}`],
    ['Symbolic', `chmod ${toChmodSymbolic(mode)} ${q}`],
    ['Recursive (everything)', `chmod -R ${oct} ${q}`],
    ['Recursive, dirs only', `find ${q} -type d -exec chmod ${oct} {} +`],
    ['Recursive, files only', `find ${q} -type f -exec chmod ${oct} {} +`],
    ['Python', `os.chmod("${name}", 0o${toOctal(mode, true)})`],
    ['Node.js', `fs.chmodSync('${name}', 0o${toOctal(mode, true)})`],
  ]

  return (
    <Split>
      <div>
        <Panel title="Permission grid" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Table
            head={['', ...BITS.map(([l, v]) => `${l} (${v})`), 'Digit']}
            rows={WHO.map((w) => {
              const digit = (mode >> SHIFT[w]) & 7
              return [
                <b key="w">{WHO_NAME[w]}</b>,
                ...BITS.map(([l, v]) => (
                  <input key={l} type="checkbox" checked={(digit & v) !== 0} onChange={() => toggle(v << SHIFT[w])} aria-label={`${WHO_NAME[w]} ${l}`} style={{ width: 20, height: 20 }} />
                )),
                <b key="d" style={{ fontFamily: 'var(--mono)', fontSize: 18 }}>{digit}</b>,
              ]
            })}
          />
          <div style={{ marginTop: 10 }}>
            <span className="k-label">Special bits</span>
            <Row>
              <Check label="setuid (4)" value={(mode & SUID) !== 0} onChange={() => toggle(SUID)} />
              <Check label="setgid (2)" value={(mode & SGID) !== 0} onChange={() => toggle(SGID)} />
              <Check label="sticky (1)" value={(mode & STICKY) !== 0} onChange={() => toggle(STICKY)} />
            </Row>
          </div>
        </Panel>
        <Panel title="Type it in">
          <Row>
            <div style={{ flex: '1 1 140px' }}>
              <Txt label="Octal" value={octDraft ?? oct} onChange={(v) => {
                setOctDraft(v)
                const m = parseOctal(v)
                if (m !== null) set({ mode: m })
              }} hint={octBad ? '⚠ 1–4 digits 0–7' : 'e.g. 640, 0755, 4755'} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Txt label="Symbolic (ls -l)" value={symDraft ?? sym} onChange={(v) => {
                setSymDraft(v)
                const m = parseSymbolic(v)
                if (m !== null) set({ mode: m })
              }} hint={symBad ? '⚠ like rwxr-x--- or drwxrwxrwt' : 'paste from ls -l'} />
            </div>
          </Row>
          <Row>
            <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['file', 'File'], ['dir', 'Directory']]} label="Type" />
            <div style={{ flex: '1 1 160px' }}>
              <Txt label="File name" value={s.name} onChange={(name) => set({ name })} />
            </div>
          </Row>
        </Panel>
        <Panel title="Presets">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {PRESETS.map(([o, m, l]) => (
              <button key={o} type="button" className={`k-btn ${m === mode ? 'primary' : ''}`} onClick={() => setMode(m)} style={{ textAlign: 'left', display: 'block' }}>
                <b style={{ fontFamily: 'var(--mono)' }}>{o}</b> <span style={{ fontSize: 12, opacity: 0.8 }}>{l}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Octal" value={<span style={{ fontFamily: 'var(--mono)' }}>{oct}</span>} tone="accent" sub={mode > 0o777 ? 'special bits in leading digit' : 'owner · group · others'} />
          <Stat label="Symbolic" value={<span style={{ fontFamily: 'var(--mono)' }}>{sym}</span>} sub={`ls -l: ${s.kind === 'dir' ? 'd' : '-'}${sym}`} />
          <Stat label="Binary" value={<span style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>{mode.toString(2).padStart(12, '0').replace(/(...)/g, '$1 ').trim()}</span>} sub="special · u · g · o" />
        </Stats>
        <Panel title="What it means">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {describe(mode).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {s.kind === 'dir' && (mode & 0o111) !== (mode & 0o444) >> 2 && (
            <Note tone="warn">For directories, read without execute lets you list names but not open entries; execute without read lets you enter but not list.</Note>
          )}
          {mode & SUID && s.kind === 'dir' ? <Note tone="info">setuid is ignored on directories by Linux.</Note> : null}
        </Panel>
        <Panel title="Commands">
          {commands.map(([l, c]) => (
            <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span className="k-label" style={{ width: 160 }}>{l}</span>
              <code style={{ flex: '1 1 220px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 13, overflowX: 'auto', whiteSpace: 'nowrap' }}>{c}</code>
              <CopyButton text={c} />
            </div>
          ))}
        </Panel>
        <Panel title="Try a symbolic change">
          <Txt label="chmod expression" value={s.expr} onChange={(expr) => set({ expr })} placeholder="u+x,go-w" hint="who: u g o a · op: + - = · perms: r w x X s t, or copy u/g/o (e.g. o=g)" />
          {exprErr ? (
            <Note tone="err">{exprErr}</Note>
          ) : exprResult !== null ? (
            <Row>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 15 }}>
                {oct} <span className="muted">({sym})</span> → <b>{toOctal(exprResult)}</b> <span className="muted">({toSymbolic(exprResult)})</span>
              </span>
              <Btn kind="primary" disabled={exprResult === mode} onClick={() => setMode(exprResult!)}>Apply</Btn>
            </Row>
          ) : null}
        </Panel>
        <Panel title="umask helper">
          <Row>
            <div style={{ flex: '0 1 140px' }}>
              <Txt label="umask" value={s.umask} onChange={(umask) => set({ umask })} hint={defs ? 'common: 022, 002, 077' : '⚠ 3 octal digits'} />
            </div>
            {defs && (
              <>
                <Stat label="New files" value={<span style={{ fontFamily: 'var(--mono)' }}>{toOctal(defs.file)}</span>} sub={toSymbolic(defs.file)} />
                <Stat label="New directories" value={<span style={{ fontFamily: 'var(--mono)' }}>{toOctal(defs.dir)}</span>} sub={toSymbolic(defs.dir)} />
              </>
            )}
          </Row>
          <Note>Defaults are 666 (files) and 777 (dirs) with the umask bits removed: <code>mode &amp; ~umask</code>.</Note>
        </Panel>
      </div>
    </Split>
  )
}
