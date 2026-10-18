import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { run, toTable, type SplitOpts, type Step, type Tbl } from './lib/column-splitter'
import { csvCell, detectDelimiter, parseCsv } from './lib/csv-json-converter'

const SAMPLE = `Full name,Address,Phone,Tags
Jane Q. Doe,"12 Elm St, Springfield, IL 62704",+1 (217) 555-0142,vip;newsletter
Marco Rossi,"Via Roma 8, Bologna, BO 40121",+39 051 555 0190,newsletter
Aiko Tanaka,"3-5 Sakura Ave, Portland, OR 97205",+1 503 555 0117,
Olu Adeyemi,"77 Harbour Rd, Leeds, WY LS1 4AP",+44 113 555 0166,wholesale;vip
Sam Lee,"9 Pine Ct, Austin, TX 73301",(512) 555-0103,trial`

const O: SplitOpts = { sep: ',', regex: false, max: 0, fromRight: false, trim: true }
const DEF = {
  text: SAMPLE,
  header: true,
  delim: 'auto',
  outDelim: ',',
  steps: [
    { kind: 'split', col: 'Full name', o: { ...O, sep: ' ', max: 2, fromRight: true }, names: 'First names, Last name', keep: false },
    { kind: 'split', col: 'Address', o: { ...O }, names: 'Street, City, Region', keep: false },
    { kind: 'extract', col: 'Region', pattern: '^(?<State>[A-Z]{2})\\s+(?<Postcode>.+)$', names: '', keep: false },
    { kind: 'combine', template: '{Last name}, {First names}', name: 'Sort name', clean: true, drop: false },
    { kind: 'explode', col: 'Tags', o: { ...O, sep: ';' } },
  ] as Step[],
}

const SEPS: [string, string][] = [[',', 'Comma ,'], [';', 'Semicolon ;'], [' ', 'Space'], ['\\t', 'Tab'], ['|', 'Pipe |'], ['-', 'Hyphen -'], ['/', 'Slash /'], ['@', 'At @']]
const KIND_LABEL: Record<Step['kind'], string> = { split: 'Split into columns', explode: 'Split into rows', extract: 'Extract with regex', combine: 'Combine columns' }

export default function ColumnSplitter() {
  const [s, set, reset] = useToolState('column-splitter', DEF)
  const delim = s.delim === 'auto' ? detectDelimiter(s.text) : s.delim === '\\t' ? '\t' : s.delim
  const input: Tbl = useMemo(() => toTable(parseCsv(s.text, delim), s.header), [s.text, delim, s.header])
  // Column names available before each step (for the dropdowns).
  const stages = useMemo(() => s.steps.map((_, i) => run(input, s.steps.slice(0, i)).table.header), [input, s.steps])
  const res = useMemo(() => run(input, s.steps), [input, s.steps])
  const out = res.table

  const patch = (i: number, p: Partial<Step>) => set({ steps: s.steps.map((x, j) => (j === i ? ({ ...x, ...p } as Step) : x)) })
  const patchO = (i: number, p: Partial<SplitOpts>) => {
    const st = s.steps[i]
    if (st.kind === 'split' || st.kind === 'explode') patch(i, { o: { ...st.o, ...p } })
  }
  const move = (i: number, d: number) => {
    const a = [...s.steps]
    const [x] = a.splice(i, 1)
    a.splice(Math.max(0, Math.min(a.length, i + d)), 0, x)
    set({ steps: a })
  }
  const first = (i: number) => stages[i]?.[0] ?? input.header[0] ?? ''
  const add = (kind: Step['kind']) => {
    const cols = res.table.header
    const col = cols[0] ?? ''
    const st: Step =
      kind === 'split' ? { kind, col, o: { ...O }, names: '', keep: false }
      : kind === 'explode' ? { kind, col, o: { ...O, sep: ';' } }
      : kind === 'extract' ? { kind, col, pattern: '(\\d+)', names: '', keep: true }
      : { kind, template: cols.slice(0, 2).map((c) => `{${c}}`).join(' '), name: 'Combined', clean: true, drop: false }
    set({ steps: [...s.steps, st] })
  }
  const outD = s.outDelim === '\\t' ? '\t' : s.outDelim
  const csv = () => [out.header, ...out.rows].map((r) => r.map((c) => csvCell(c, outD)).join(outD)).join('\r\n')
  const newCols = out.header.filter((h) => !input.header.includes(h))

  const sepEditor = (i: number, o: SplitOpts, rows: boolean) => (
    <>
      <Row>
        {o.regex ? (
          <Txt label="Regex separator" value={o.sep} onChange={(sep) => patchO(i, { sep })} />
        ) : (
          <Select label="Separator" value={SEPS.some(([v]) => v === o.sep) ? o.sep : 'custom'} onChange={(v) => patchO(i, { sep: v === 'custom' ? o.sep || ':' : v })} options={[...SEPS, ['custom', 'Custom…']]} />
        )}
        {!o.regex && !SEPS.some(([v]) => v === o.sep) && <Txt label="Custom text" value={o.sep} onChange={(sep) => patchO(i, { sep })} />}
        {!rows && <Num label="Max parts (0 = all)" value={o.max} onChange={(max) => patchO(i, { max: Math.max(0, Math.round(max)) })} min={0} step={1} />}
      </Row>
      <Row>
        <Check label="Regex" value={o.regex} onChange={(regex) => patchO(i, { regex, sep: regex ? '\\s*[,;]\\s*' : ',' })} />
        <Check label="Trim spaces" value={o.trim} onChange={(trim) => patchO(i, { trim })} />
        {!rows && <Check label="Count from right" value={o.fromRight} onChange={(fromRight) => patchO(i, { fromRight })} />}
      </Row>
    </>
  )

  return (
    <Split>
      <div>
        <Panel title="Input" actions={<><Btn onClick={() => set({ text: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async (f) => set({ text: await f[0].text() })} label="Drop a CSV / TSV file" />
          <Area value={s.text} onChange={(text) => set({ text })} rows={7} mono placeholder="Paste CSV, TSV or one value per line" />
          <Row>
            <Select label="Delimiter" value={s.delim} onChange={(d) => set({ delim: d })} options={[['auto', `Auto (${delim === '\t' ? 'tab' : delim})`], [',', 'Comma'], [';', 'Semicolon'], ['\\t', 'Tab'], ['|', 'Pipe']]} />
            <Check label="First row is header" value={s.header} onChange={(header) => set({ header })} />
          </Row>
        </Panel>
        <Panel title="Steps (run top to bottom)">
          {s.steps.map((st, i) => {
            const cols = stages[i] ?? []
            const colSel = (v: string, on: (c: string) => void) => (
              <Select label="Column" value={cols.includes(v) ? v : ''} onChange={on} options={[...(cols.includes(v) ? [] : [['', `⚠ ${v || 'choose'}`] as const]), ...cols.map((c) => [c, c] as const)]} />
            )
            return (
              <div key={i} style={{ border: '1px solid var(--line)', borderLeft: `4px solid ${res.errors[i] ? 'var(--err)' : 'var(--accent)'}`, borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{i + 1}. {KIND_LABEL[st.kind]}</b>
                  <Btn kind="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</Btn>
                  <Btn kind="ghost" onClick={() => move(i, 1)} disabled={i === s.steps.length - 1} title="Move down">↓</Btn>
                  <Btn kind="ghost" onClick={() => set({ steps: s.steps.filter((_, j) => j !== i) })} title="Remove">✕</Btn>
                </Row>
                {st.kind === 'split' && (
                  <>
                    {colSel(st.col, (col) => patch(i, { col }))}
                    {sepEditor(i, st.o, false)}
                    <Row>
                      <Txt label="New column names (comma-separated)" value={st.names} onChange={(names) => patch(i, { names })} placeholder={`${st.col}_1, ${st.col}_2…`} />
                      <Check label="Keep original" value={st.keep} onChange={(keep) => patch(i, { keep })} />
                    </Row>
                  </>
                )}
                {st.kind === 'explode' && (<>{colSel(st.col, (col) => patch(i, { col }))}{sepEditor(i, st.o, true)}</>)}
                {st.kind === 'extract' && (
                  <>
                    {colSel(st.col, (col) => patch(i, { col }))}
                    <Txt label="Pattern with (groups) or (?<Name>…)" value={st.pattern} onChange={(pattern) => patch(i, { pattern })} />
                    <Row>
                      <Txt label="Column names (optional)" value={st.names} onChange={(names) => patch(i, { names })} />
                      <Check label="Keep original" value={st.keep} onChange={(keep) => patch(i, { keep })} />
                    </Row>
                  </>
                )}
                {st.kind === 'combine' && (
                  <>
                    <Txt label="Template" value={st.template} onChange={(template) => patch(i, { template })} hint={<>Use {'{Column}'} placeholders. Columns: {cols.map((c) => <button key={c} type="button" className="k-btn ghost" style={{ padding: '0 5px', fontSize: 12 }} onClick={() => patch(i, { template: `${st.template}{${c}}` })}>{c}</button>)}</>} />
                    <Row>
                      <Txt label="New column" value={st.name} onChange={(name) => patch(i, { name })} />
                      <Check label="Skip separators of empty fields" value={st.clean} onChange={(clean) => patch(i, { clean })} />
                      <Check label="Remove source columns" value={st.drop} onChange={(drop) => patch(i, { drop })} />
                    </Row>
                  </>
                )}
                {res.errors[i] && <Note tone="err">{res.errors[i]} — this step is skipped.</Note>}
                {!res.errors[i] && first(i) === '' && <Note tone="warn">No columns.</Note>}
              </div>
            )
          })}
          <Row>
            {(['split', 'explode', 'extract', 'combine'] as const).map((k) => <Btn key={k} onClick={() => add(k)}>+ {KIND_LABEL[k]}</Btn>)}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Input" value={`${input.rows.length} × ${input.header.length}`} sub="rows × columns" />
          <Stat label="Output" value={`${out.rows.length} × ${out.header.length}`} sub="rows × columns" tone="accent" />
          <Stat label="New columns" value={newCols.length} sub={newCols.slice(0, 4).join(', ') + (newCols.length > 4 ? '…' : '')} />
          <Stat label="Steps" value={s.steps.length} sub={res.errors.some(Boolean) ? `${res.errors.filter(Boolean).length} with errors` : 'all OK'} tone={res.errors.some(Boolean) ? 'bad' : 'good'} />
        </Stats>
        <Panel
          title="Result"
          actions={
            <>
              <Select label="Output delimiter" value={s.outDelim} onChange={(outDelim) => set({ outDelim })} options={[[',', 'CSV ,'], [';', 'CSV ;'], ['\\t', 'TSV']]} />
              <CopyButton text={csv} />
              <Btn kind="primary" onClick={() => download(s.outDelim === '\\t' ? 'split.tsv' : 'split.csv', csv(), 'text/csv')}>⬇ Download</Btn>
            </>
          }
        >
          <Table
            head={out.header.map((h) => <span key={h} style={{ color: newCols.includes(h) ? 'var(--accent)' : undefined }}>{h}</span>)}
            rows={out.rows.map((r) => r.map((c) => c))}
            max={200}
          />
          <Note>Highlighted headers are new columns. Steps are saved in your browser, so the same recipe works on next month's export.</Note>
        </Panel>
      </div>
    </Split>
  )
}
