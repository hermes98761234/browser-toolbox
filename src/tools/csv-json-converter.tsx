import { useMemo, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { columns, csvToRecords, detectDelimiter, flatten, jsonToRecords, recordsToCsv, recordsToXml, typed, type Rec } from './lib/csv-json-converter'

type F = 'csv' | 'json' | 'xml'

interface State {
  input: string
  from: F | 'auto'
  to: F
  delimIn: string
  delimOut: string
  header: boolean
  typed: boolean
  nest: boolean
  join: string
  indent: string
  jsonLines: boolean
  root: string
  row: string
}

const SAMPLES: Record<F, string> = {
  csv: `id,name,email,city,signup,plan,seats,active,tags
1,Ada Lovelace,ada@example.com,London,2024-01-14,Pro,5,true,"math;engines"
2,"Hopper, Grace",grace@example.com,New York,2024-02-03,Team,25,true,navy
3,Alan Turing,alan@example.com,Manchester,2024-03-21,Free,1,false,
4,Katherine Johnson,kj@example.com,Hampton,2024-04-09,Pro,3,true,"nasa;orbits"
5,Linus "T" Torvalds,linus@example.com,Portland,2024-05-30,Team,12,true,kernel`,
  json: `{
  "orders": [
    { "id": "A-1001", "customer": { "name": "Ana", "country": "PT" }, "total": 59.9, "items": ["mug", "tea"], "paid": true },
    { "id": "A-1002", "customer": { "name": "Bo", "country": "SE" }, "total": 12.5, "items": ["card"], "paid": false },
    { "id": "A-1003", "customer": { "name": "Chen", "country": "SG" }, "total": 240, "items": ["lamp", "bulb", "cable"], "paid": true }
  ]
}`,
  xml: `<?xml version="1.0"?>
<catalog>
  <book id="bk101" lang="en">
    <author>Gambardella, Matthew</author>
    <title>XML Developer's Guide</title>
    <price currency="USD">44.95</price>
    <published>2000-10-01</published>
  </book>
  <book id="bk102" lang="en">
    <author>Ralls, Kim</author>
    <title>Midnight Rain</title>
    <price currency="USD">5.95</price>
    <published>2000-12-16</published>
  </book>
  <book id="bk103" lang="fr">
    <author>Corets, Eva</author>
    <title>Maeve Ascendant</title>
    <price currency="EUR">5.95</price>
    <published>2000-11-17</published>
  </book>
</catalog>`,
}

const DEF: State = {
  input: SAMPLES.csv,
  from: 'auto',
  to: 'json',
  delimIn: 'auto',
  delimOut: ',',
  header: true,
  typed: true,
  nest: true,
  join: ';',
  indent: '2',
  jsonLines: false,
  root: 'rows',
  row: 'row',
}

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>
    {children}
  </div>
)
const DELIMS = [
  ['auto', 'Auto-detect'],
  [',', 'Comma ,'],
  [';', 'Semicolon ;'],
  ['\t', 'Tab ⇥'],
  ['|', 'Pipe |'],
] as const
const MIME: Record<F, string> = { csv: 'text/csv', json: 'application/json', xml: 'application/xml' }

function sniffFormat(t: string): F {
  const s = t.trimStart()
  if (s.startsWith('<')) return 'xml'
  if (s.startsWith('{') || s.startsWith('[')) return 'json'
  return 'csv'
}

/** XML → records: children of the root element are the records; attributes become "@name" fields. */
function xmlToRecords(text: string, typeIt: boolean): Rec[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const perr = doc.querySelector('parsererror')
  if (perr) throw new Error(perr.textContent?.split('\n').find((l) => l.trim()) ?? 'Invalid XML')
  const val = (s: string) => (typeIt ? typed(s) : s)
  const conv = (el: Element): unknown => {
    const o: Rec = {}
    for (const a of el.attributes) o[`@${a.name}`] = val(a.value)
    const kids = [...el.children]
    if (!kids.length) {
      const t = el.textContent ?? ''
      if (!el.attributes.length) return val(t)
      if (t.trim()) o['#text'] = val(t)
      return o
    }
    for (const k of kids) {
      const v = conv(k)
      const n = k.tagName
      if (n in o) o[n] = Array.isArray(o[n]) ? [...(o[n] as unknown[]), v] : [o[n], v]
      else o[n] = v
    }
    return o
  }
  const root = doc.documentElement
  const kids = [...root.children]
  if (!kids.length) return [{ [root.tagName]: conv(root) }]
  return kids.map((k) => {
    const v = conv(k)
    return v && typeof v === 'object' ? (v as Rec) : { [k.tagName]: v }
  })
}

export default function CsvJsonConverter() {
  const [s, set, reset] = useToolState('csv-json-converter', DEF)
  const from: F = s.from === 'auto' ? sniffFormat(s.input) : s.from
  const delimIn = s.delimIn === 'auto' ? detectDelimiter(s.input) : s.delimIn

  const res = useMemo((): { rows: Rec[]; out: string; err: string } => {
    try {
      if (!s.input.trim()) return { rows: [], out: '', err: '' }
      const rows =
        from === 'csv' ? csvToRecords(s.input, { delim: delimIn, header: s.header, typed: s.typed, nest: s.nest }) : from === 'json' ? jsonToRecords(s.input) : xmlToRecords(s.input, s.typed)
      const ind = s.indent === 'tab' ? '\t' : Number(s.indent)
      const out =
        s.to === 'csv'
          ? recordsToCsv(rows, { delim: s.delimOut === 'auto' ? ',' : s.delimOut, header: s.header, joinArrays: s.join })
          : s.to === 'json'
            ? s.jsonLines
              ? rows.map((r) => JSON.stringify(r)).join('\n')
              : JSON.stringify(rows, null, ind)
            : recordsToXml(rows, s.root || 'rows', s.row || 'row', s.indent === '0' ? '' : s.indent === 'tab' ? '\t' : ' '.repeat(Number(s.indent)))
      return { rows, out, err: '' }
    } catch (e) {
      return { rows: [], out: '', err: (e as Error).message }
    }
  }, [s, from, delimIn])

  const flat = useMemo(() => res.rows.slice(0, 100).map((r) => flatten(r, s.join)), [res.rows, s.join])
  const cols = columns(flat)
  const bytes = (t: string) => new Blob([t]).size
  const swap = () => set({ input: res.out || s.input, from: 'auto', to: from === s.to ? (from === 'csv' ? 'json' : 'csv') : from })

  return (
    <>
      <Split wide="left">
        <div>
          <Panel
            title="Input"
            actions={
              <>
                {(['csv', 'json', 'xml'] as F[]).map((f) => (
                  <Btn key={f} kind="ghost" onClick={() => set({ input: SAMPLES[f], from: 'auto', to: f === 'csv' ? 'json' : 'csv' })}>
                    {f.toUpperCase()} sample
                  </Btn>
                ))}
              </>
            }
          >
            <Row>
              <Select
                label="Input format"
                value={s.from}
                onChange={(v) => set({ from: v })}
                options={[
                  ['auto', `Auto (${from.toUpperCase()})`],
                  ['csv', 'CSV / TSV'],
                  ['json', 'JSON'],
                  ['xml', 'XML'],
                ]}
              />
              {from === 'csv' && (
                <Select
                  label="Delimiter"
                  value={s.delimIn}
                  onChange={(delimIn) => set({ delimIn })}
                  options={DELIMS.map(([v, l]) => [v, v === 'auto' ? `Auto (${DELIMS.find((d) => d[0] === delimIn)?.[1] ?? delimIn})` : l] as [string, string])}
                />
              )}
            </Row>
            <Area value={s.input} onChange={(input) => set({ input })} rows={14} mono placeholder="Paste CSV, JSON or XML…" />
            <FileDrop
              accept=".csv,.tsv,.txt,.json,.xml,text/*,application/json,application/xml"
              onFiles={async ([f]) => set({ input: await f.text(), from: 'auto' })}
              label="…or drop a .csv / .tsv / .json / .xml file"
            />
            {res.err && (
              <Note tone="err">
                Could not parse {from.toUpperCase()}: {res.err}
              </Note>
            )}
          </Panel>
        </div>
        <div>
          <Panel
            title="Options"
            actions={
              <Btn kind="ghost" onClick={reset}>
                Reset
              </Btn>
            }
          >
            <div className="k-label" style={{ fontWeight: 650, fontSize: 13, marginBottom: 6 }}>
              Convert to
            </div>
            <Row>
              <Seg
                value={s.to}
                onChange={(to) => set({ to })}
                options={[
                  ['csv', 'CSV'],
                  ['json', 'JSON'],
                  ['xml', 'XML'],
                ]}
                label="Output format"
              />
              <Btn onClick={swap} title="Use the output as the new input">
                ⇄ Swap
              </Btn>
            </Row>
            <Check label="First row is a header" value={s.header} onChange={(header) => set({ header })} />
            <Check label="Detect numbers, booleans and empty → null" value={s.typed} onChange={(v) => set({ typed: v })} />
            {from === 'csv' && <Check label="Dotted headers → nested objects (user.name, tags.0)" value={s.nest} onChange={(nest) => set({ nest })} />}
            <Row>
              {s.to === 'csv' && <Select label="Output delimiter" value={s.delimOut} onChange={(delimOut) => set({ delimOut })} options={DELIMS.slice(1)} />}
              {s.to === 'csv' && (
                <Select
                  label="Arrays of values"
                  value={s.join}
                  onChange={(join) => set({ join })}
                  options={[
                    [';', 'Join with ;'],
                    ['|', 'Join with |'],
                    [', ', 'Join with , '],
                    ['', 'One column each (tags.0, tags.1)'],
                  ]}
                />
              )}
              {s.to !== 'csv' && (
                <Select
                  label="Indent"
                  value={s.indent}
                  onChange={(indent) => set({ indent })}
                  options={[
                    ['0', 'Minified'],
                    ['2', '2 spaces'],
                    ['4', '4 spaces'],
                    ['tab', 'Tab'],
                  ]}
                />
              )}
            </Row>
            {s.to === 'json' && <Check label="JSON Lines (one object per line)" value={s.jsonLines} onChange={(jsonLines) => set({ jsonLines })} />}
            {s.to === 'xml' && (
              <Row>
                <Txt label="Root element" value={s.root} onChange={(root) => set({ root })} />
                <Txt label="Row element" value={s.row} onChange={(row) => set({ row })} />
              </Row>
            )}
            <Tip>
              Nested JSON is flattened to dotted columns for CSV (<code>customer.name</code>) and rebuilt on the way back. XML attributes become <code>@name</code> fields; repeated elements become
              arrays.
            </Tip>
          </Panel>
        </div>
      </Split>

      <div style={{ marginTop: 16 }}>
        <Stats>
          <Stat label="Records" value={res.rows.length} tone="accent" />
          <Stat label="Columns (flat)" value={columns(res.rows.map((r) => flatten(r, s.join))).length} />
          <Stat label="Input" value={`${(bytes(s.input) / 1024).toFixed(1)} KB`} sub={from.toUpperCase()} />
          <Stat label="Output" value={`${(bytes(res.out) / 1024).toFixed(1)} KB`} sub={s.to.toUpperCase()} />
        </Stats>
        <Split>
          <div>
            <Panel
              title={`Output · ${s.to.toUpperCase()}`}
              actions={
                <>
                  <CopyButton text={res.out} />
                  <Btn kind="primary" onClick={() => download(`converted.${s.to === 'json' && s.jsonLines ? 'jsonl' : s.to}`, res.out, MIME[s.to])} disabled={!res.out}>
                    ⬇ Download
                  </Btn>
                </>
              }
            >
              <textarea className="k-area mono" readOnly value={res.out} rows={18} style={{ width: '100%' }} aria-label="Output" />
            </Panel>
          </div>
          <div>
            <Panel title={`Preview${res.rows.length > 100 ? ' (first 100)' : ''}`}>
              {cols.length ? (
                <Table
                  head={cols}
                  rows={flat.map((r) =>
                    cols.map((c) =>
                      r[c] === null || r[c] === undefined ? (
                        <span key={c} className="muted">
                          ∅
                        </span>
                      ) : (
                        String(r[c])
                      ),
                    ),
                  )}
                  max={50}
                />
              ) : (
                <Tip>Nothing to preview yet.</Tip>
              )}
            </Panel>
          </div>
        </Split>
      </div>
    </>
  )
}
