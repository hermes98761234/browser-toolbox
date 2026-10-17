import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { clean, defaultRule, type Case, type ColRule, type Kind, type Options } from './lib/data-cleaner'

const SAMPLE = `id,Full Name,Email,Phone,Signup Date,Plan,Amount
1,  john   SMITH ,John.Smith@Example.com ,(555) 010-2030,03/07/2024,pro,"$1,200.00"
2,mary-jane o'neil,MJ@example.com,555.010.4455,2024-03-09,Basic,49
3,John Smith,john.smith@example.com,+1 555 010 2030,7 Mar 2024,PRO,"1,200"
,,,,,,
4,Ali  Khan,ali.khan@example.com,N/A,March 12  2024,basic,49.00
5,Zoë Müller,zoe@example.com,555-010-9876,2024/3/15,Team,"$2,450.5"
6,ali khan,ALI.KHAN@EXAMPLE.COM,,12/03/2024,Basic,49
7,Chen Wei,chen.wei@example.com,555 010 1111,2024-03-20,null,0
`

const DEF = {
  text: SAMPLE,
  header: true,
  dayFirst: false,
  opts: { trim: true, collapse: true, nulls: true, dropEmpty: true, dedupe: true, keys: [] as number[], ignoreCase: true, keepLast: false } as Options,
  keyNames: ['Email'] as string[],
  rules: {
    'Full Name': { ...defaultRule('Full Name'), case: 'title' },
    Email: { ...defaultRule('Email'), kind: 'email' },
    Phone: { ...defaultRule('Phone'), kind: 'digits', fill: 'unknown' },
    'Signup Date': { ...defaultRule('Signup Date'), kind: 'date' },
    Plan: { ...defaultRule('Plan'), case: 'title', fill: 'Free' },
    Amount: { ...defaultRule('Amount'), kind: 'number' },
  } as Record<string, ColRule>,
}

const CASES: [Case, string][] = [['keep', 'as is'], ['lower', 'lower'], ['upper', 'UPPER'], ['title', 'Title Case'], ['sentence', 'Sentence']]
const KINDS: [Kind, string][] = [['text', 'Text'], ['number', 'Number'], ['date', 'Date → ISO'], ['digits', 'Digits only'], ['email', 'Email'], ['bool', 'Yes/No → true/false']]
const hit = 'color-mix(in srgb, var(--ok) 22%, transparent)'

export default function DataCleaner() {
  const [s, set, reset] = useToolState('data-cleaner', DEF)
  const delim = useMemo(() => detectDelimiter(s.text), [s.text])
  const parsed = useMemo(() => parseCsv(s.text, delim), [s.text, delim])
  const width = parsed.reduce((a, r) => Math.max(a, r.length), 0)
  const header = s.header && parsed.length ? Array.from({ length: width }, (_, i) => parsed[0][i]?.trim() || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  const body = s.header ? parsed.slice(1) : parsed
  const rules = header.map((h) => s.rules[h] ?? defaultRule(h))
  const keys = s.keyNames.map((k) => header.indexOf(k)).filter((i) => i >= 0)
  const res = clean(header, body, rules, { ...s.opts, keys }, s.dayFirst)
  const setRule = (h: string, p: Partial<ColRule>) => set({ rules: { ...s.rules, [h]: { ...(s.rules[h] ?? defaultRule(h)), ...p } } })
  const setOpt = (p: Partial<Options>) => set({ opts: { ...s.opts, ...p } })
  const outCsv = () => toCsv([res.header, ...res.rows])
  const name = (i: number) => `row ${i + (s.header ? 2 : 1)}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" label="Drop a CSV / TSV file" onFiles={async ([f]) => set({ text: await f.text(), keyNames: [], rules: {} })} />
          <Area value={s.text} onChange={(text) => set({ text })} rows={9} mono />
          <p className="muted" style={{ margin: '6px 0' }}>
            Detected delimiter: <b>{delim === '\t' ? 'Tab' : delim}</b> · {body.length} rows × {width} columns
          </p>
          <Check label="First row is a header" value={s.header} onChange={(header) => set({ header })} />
        </Panel>
        <Panel title="Whole-table fixes">
          <Check label="Trim leading / trailing spaces" value={s.opts.trim} onChange={(trim) => setOpt({ trim })} />
          <Check label="Collapse repeated spaces, strip invisible characters" value={s.opts.collapse} onChange={(collapse) => setOpt({ collapse })} />
          <Check label='Treat "N/A", "null", "-", "none" as empty' value={s.opts.nulls} onChange={(nulls) => setOpt({ nulls })} />
          <Check label="Remove empty rows" value={s.opts.dropEmpty} onChange={(dropEmpty) => setOpt({ dropEmpty })} />
          <Check label="Ambiguous dates like 03/07 are day-first (DD/MM)" value={s.dayFirst} onChange={(dayFirst) => set({ dayFirst })} />
        </Panel>
        <Panel title="Duplicates">
          <Check label="Remove duplicate rows" value={s.opts.dedupe} onChange={(dedupe) => setOpt({ dedupe })} />
          {s.opts.dedupe && (
            <>
              <p className="muted" style={{ margin: '8px 0 4px' }}>Match on these columns (none ticked = whole row), compared after cleaning:</p>
              <Row>
                {header.map((h) => (
                  <Check key={h} label={h} value={s.keyNames.includes(h)} onChange={(on) => set({ keyNames: on ? [...s.keyNames, h] : s.keyNames.filter((k) => k !== h) })} />
                ))}
              </Row>
              <Check label="Ignore upper/lower case" value={s.opts.ignoreCase} onChange={(ignoreCase) => setOpt({ ignoreCase })} />
              <Seg value={s.opts.keepLast ? 'last' : 'first'} onChange={(v) => setOpt({ keepLast: v === 'last' })} options={[['first', 'Keep first'], ['last', 'Keep last']]} label="Which copy to keep" />
            </>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rows in" value={body.length} />
          <Stat label="Rows out" value={res.rows.length} tone="accent" />
          <Stat label="Duplicates removed" value={res.dups.length} />
          <Stat label="Cells fixed" value={res.changed.size} tone={res.changed.size ? 'good' : undefined} sub={`${res.empty.length} empty row${res.empty.length === 1 ? '' : 's'} dropped`} />
        </Stats>
        <Panel title="Column rules">
          <Table
            head={['Column', 'Keep', 'Rename', 'Case', 'Type fix', 'Fill empty with']}
            rows={header.map((h, i) => [
              <b key="h">{h}</b>,
              <input key="k" type="checkbox" checked={rules[i].keep} onChange={(e) => setRule(h, { keep: e.target.checked })} aria-label={`Keep ${h}`} />,
              <input key="r" value={rules[i].rename} onChange={(e) => setRule(h, { rename: e.target.value })} aria-label={`Rename ${h}`} style={{ width: 120 }} />,
              <select key="c" value={rules[i].case} onChange={(e) => setRule(h, { case: e.target.value as Case })} aria-label={`Case of ${h}`}>
                {CASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>,
              <select key="t" value={rules[i].kind} onChange={(e) => setRule(h, { kind: e.target.value as Kind })} aria-label={`Type of ${h}`}>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>,
              <input key="f" value={rules[i].fill} placeholder="leave empty" onChange={(e) => setRule(h, { fill: e.target.value })} aria-label={`Fill ${h}`} style={{ width: 100 }} />,
            ])}
          />
        </Panel>
        <Panel
          title="Cleaned data"
          actions={
            <>
              <Btn kind="primary" onClick={() => download('cleaned.csv', outCsv(), 'text/csv')}>⬇ CSV</Btn>
              <CopyButton text={outCsv} label="Copy CSV" />
              <CopyButton text={() => [res.header, ...res.rows].map((r) => r.join('\t')).join('\n')} label="Copy for Excel" />
            </>
          }
        >
          <Table
            head={res.header}
            rows={res.rows.map((r, ri) => r.map((c, ci) => <span key={ci} style={res.changed.has(`${ri}:${ci}`) ? { background: hit, borderRadius: 4, padding: '1px 4px' } : undefined}>{c}</span>))}
            max={200}
          />
          <p className="muted" style={{ marginBottom: 0 }}>
            <span style={{ background: hit, borderRadius: 4, padding: '1px 6px' }}>Highlighted</span> cells were changed by the rules.
          </p>
        </Panel>
        {(res.dups.length > 0 || res.empty.length > 0) && (
          <Panel title="Removed rows">
            {res.dups.length > 0 && (
              <Table
                head={['Removed', 'Duplicate of', 'Original values']}
                rows={res.dups.map((d) => [name(d.row), name(d.of), <span key="v" className="muted">{body[d.row].join(' · ')}</span>])}
                max={50}
              />
            )}
            {res.empty.length > 0 && <Note>Empty rows dropped: {res.empty.map(name).join(', ')}</Note>}
          </Panel>
        )}
      </div>
    </Split>
  )
}
