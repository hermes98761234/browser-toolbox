import { useMemo, useState } from 'react'
import { Btn, Check, CopyButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { generate, hashSeed, toCsv, toSql, type Dialect, type Field, type FieldType, type Value } from './lib/fake-data-generator'

type Out = 'csv' | 'json' | 'jsonl' | 'sql'
interface State { fields: Field[]; count: number; seed: string; out: Out; delim: string; dialect: Dialect; table: string; batch: number; create: boolean; pretty: boolean }

const TYPES: [FieldType, string, string][] = [
  ['id', 'Row number', 'Identity'], ['uuid', 'UUID v4', 'Identity'],
  ['firstName', 'First name', 'Person'], ['lastName', 'Last name', 'Person'], ['fullName', 'Full name', 'Person'], ['email', 'E-mail', 'Person'], ['username', 'Username', 'Person'], ['phone', 'Phone', 'Person'], ['jobTitle', 'Job title', 'Person'],
  ['company', 'Company', 'Place & business'], ['street', 'Street address', 'Place & business'], ['city', 'City', 'Place & business'], ['postcode', 'Postal code', 'Place & business'], ['country', 'Country', 'Place & business'],
  ['int', 'Integer', 'Numbers & time'], ['decimal', 'Decimal', 'Numbers & time'], ['bool', 'Boolean', 'Numbers & time'], ['date', 'Date', 'Numbers & time'], ['datetime', 'Date-time (UTC)', 'Numbers & time'],
  ['pick', 'Pick from list', 'Text & other'], ['words', 'Words', 'Text & other'], ['sentence', 'Sentence', 'Text & other'], ['pattern', 'Pattern (#?*)', 'Text & other'], ['color', 'Hex color', 'Text & other'], ['ipv4', 'IPv4', 'Text & other'], ['url', 'URL', 'Text & other'], ['constant', 'Constant', 'Text & other'],
]
const f = (name: string, type: FieldType, extra: Partial<Field> = {}): Field => ({ id: uid(), name, type, ...extra })
const PRESETS: Record<string, () => Field[]> = {
  Users: () => [f('id', 'id'), f('first_name', 'firstName'), f('last_name', 'lastName'), f('email', 'email'), f('phone', 'phone', { pattern: '+## ### ### ####', nulls: 15 }), f('city', 'city'), f('country', 'country'), f('signed_up', 'date', { from: '2023-01-01', to: '2026-09-30' }), f('plan', 'pick', { options: 'free:6, pro:3, team:1' }), f('active', 'bool', { prob: 82 })],
  Orders: () => [f('order_id', 'pattern', { pattern: 'ORD-######' }), f('customer', 'fullName'), f('ordered_at', 'datetime', { from: '2026-01-01', to: '2026-09-30' }), f('items', 'int', { min: 1, max: 8 }), f('total', 'decimal', { min: 5, max: 640, decimals: 2 }), f('status', 'pick', { options: 'delivered:12, shipped:4, processing:2, refunded:1' }), f('coupon', 'pattern', { pattern: '????-##', nulls: 70 })],
  Products: () => [f('sku', 'pattern', { pattern: '??-####' }), f('name', 'words', { min: 2, max: 3 }), f('category', 'pick', { options: 'Kitchen, Garden, Office, Toys, Outdoor, Lighting' }), f('price', 'decimal', { min: 2, max: 400, decimals: 2 }), f('stock', 'int', { min: 0, max: 500 }), f('color', 'color'), f('description', 'sentence')],
  Employees: () => [f('employee_id', 'id', { min: 1001 }), f('name', 'fullName'), f('email', 'email'), f('title', 'jobTitle'), f('company', 'company'), f('office', 'street'), f('hired', 'date', { from: '2012-01-01', to: '2026-06-30' }), f('salary', 'int', { min: 38000, max: 165000 }), f('remote', 'bool', { prob: 40 })],
  'Web logs': () => [f('ts', 'datetime', { from: '2026-10-01', to: '2026-10-07' }), f('ip', 'ipv4'), f('user', 'username', { nulls: 35 }), f('method', 'pick', { options: 'GET:20, POST:5, PUT:1, DELETE:1' }), f('url', 'url'), f('status', 'pick', { options: '200:30, 301:2, 404:3, 500:1' }), f('ms', 'int', { min: 3, max: 1800 })],
}
const DEF: State = { fields: PRESETS.Users(), count: 250, seed: 'demo-2026', out: 'csv', delim: ',', dialect: 'ansi', table: 'users', batch: 100, create: true, pretty: true }
const MAX = 200000
const IB = { padding: '4px 7px', minWidth: 0 }

function render(s: State, rows: Record<string, Value>[]): string {
  if (s.out === 'csv') return toCsv(s.fields, rows, s.delim === 'tab' ? '\t' : s.delim)
  if (s.out === 'json') return JSON.stringify(rows, null, s.pretty ? 2 : undefined) + '\n'
  if (s.out === 'jsonl') return rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  return toSql(s.fields, rows, s.table, s.dialect, s.batch, s.create)
}
const EXT: Record<Out, [string, string]> = { csv: ['csv', 'text/csv'], json: ['json', 'application/json'], jsonl: ['jsonl', 'application/x-ndjson'], sql: ['sql', 'application/sql'] }

function Opts({ fl, edit }: { fl: Field; edit: (p: Partial<Field>) => void }) {
  const n = (k: 'min' | 'max' | 'decimals' | 'prob' | 'nulls', label: string, def: number, w = 70) => (
    <label className="muted" style={{ fontSize: 12 }}>{label} <input type="number" value={fl[k] ?? def} onChange={(e) => edit({ [k]: Number(e.target.value) })} style={{ width: w }} /></label>
  )
  const t = (k: 'from' | 'to' | 'options' | 'pattern' | 'value', label: string, def: string, w = 140, type = 'text') => (
    <label className="muted" style={{ fontSize: 12 }}>{label} <input type={type} value={fl[k] ?? def} onChange={(e) => edit({ [k]: e.target.value })} style={{ width: w }} /></label>
  )
  const m = fl.type
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {m === 'id' && n('min', 'start', 1)}
      {(m === 'int' || m === 'decimal') && <>{n('min', 'min', 0, 90)}{n('max', 'max', m === 'int' ? 100 : 1000, 90)}</>}
      {m === 'decimal' && n('decimals', 'dp', 2, 50)}
      {m === 'words' && <>{n('min', 'min', 1, 50)}{n('max', 'max', 3, 50)}</>}
      {m === 'bool' && n('prob', '% true', 50, 60)}
      {(m === 'date' || m === 'datetime') && <>{t('from', 'from', '2020-01-01', 130, 'date')}{t('to', 'to', '2026-12-31', 130, 'date')}</>}
      {m === 'pick' && t('options', 'options', 'A, B, C', 200)}
      {(m === 'pattern' || m === 'phone' || m === 'postcode') && t('pattern', 'pattern', m === 'phone' ? '+## ### ### ####' : m === 'postcode' ? '#####' : 'ID-####', 150)}
      {m === 'constant' && t('value', 'value', '', 140)}
      {m !== 'id' && n('nulls', '% empty', 0, 55)}
    </div>
  )
}

export default function FakeDataGenerator() {
  const [s, set, reset] = useToolState('fake-data-generator', DEF)
  const [busy, setBusy] = useState(false)
  const seed = hashSeed(s.seed)
  const count = Math.max(1, Math.min(MAX, Math.round(s.count) || 1))
  const preview = useMemo(() => generate(s.fields, Math.min(count, 50), seed), [s.fields, count, seed])
  const sample = render(s, preview.slice(0, 12))
  const names = s.fields.map((x) => x.name.trim())
  const dupNames = names.filter((n, i) => n && names.indexOf(n) !== i)
  const empty = names.some((n) => !n)
  const edit = (id: string, p: Partial<Field>) => set({ fields: s.fields.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const move = (i: number, d: number) => {
    const a = [...s.fields]
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ fields: a })
  }
  const bytesPerRow = new Blob([render(s, preview)]).size / Math.max(1, preview.length)
  const exportAll = () => {
    setBusy(true)
    setTimeout(() => {
      const rows = generate(s.fields, count, seed)
      const [ext, mime] = EXT[s.out]
      download(`${s.table || 'fake-data'}.${ext}`, render(s, rows), mime)
      setBusy(false)
    }, 20)
  }

  return (
    <Split>
      <div>
        <Panel title="Dataset">
          <span className="k-label">Start from a template</span>
          <Row>{Object.keys(PRESETS).map((k) => <Btn key={k} kind="ghost" onClick={() => set({ fields: PRESETS[k](), table: k.toLowerCase().replace(/\s+/g, '_') })}>{k}</Btn>)}</Row>
          <Row>
            <Num label="Rows" value={s.count} onChange={(c) => set({ count: c })} min={1} max={MAX} step={1} hint={`Up to ${MAX.toLocaleString()}`} />
            <Txt label="Seed" value={s.seed} onChange={(v) => set({ seed: v })} hint="Same seed → same data" />
          </Row>
          <Btn onClick={() => set({ seed: Math.random().toString(36).slice(2, 8) })}>🎲 New seed</Btn>
        </Panel>
        <Panel title="Schema" actions={<Btn onClick={() => set({ fields: [...s.fields, f(`field_${s.fields.length + 1}`, 'words')] })}>+ Field</Btn>}>
          {(dupNames.length > 0 || empty) && <Note tone="err">{empty ? 'Every field needs a name. ' : ''}{dupNames.length ? `Duplicate names: ${[...new Set(dupNames)].join(', ')}` : ''}</Note>}
          <div style={{ display: 'grid', gap: 8 }}>
            {s.fields.map((x, i) => (
              <div key={x.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}>
                  <input value={x.name} onChange={(e) => edit(x.id, { name: e.target.value })} aria-label="Field name" style={{ minWidth: 0, fontFamily: 'ui-monospace, monospace' }} />
                  <select value={x.type} onChange={(e) => edit(x.id, { type: e.target.value as FieldType })} aria-label="Field type" style={{ minWidth: 0 }}>
                    {[...new Set(TYPES.map((t) => t[2]))].map((g) => (
                      <optgroup key={g} label={g}>{TYPES.filter((t) => t[2] === g).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
                    ))}
                  </select>
                  <span style={{ display: 'flex', gap: 0, whiteSpace: 'nowrap' }}>
                    <button type="button" className="k-btn ghost" style={IB} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                    <button type="button" className="k-btn ghost" style={IB} onClick={() => move(i, 1)} disabled={i === s.fields.length - 1} title="Move down">↓</button>
                    <button type="button" className="k-btn ghost" style={IB} onClick={() => set({ fields: s.fields.filter((y) => y.id !== x.id) })} title="Remove">✕</button>
                  </span>
                </div>
                <Opts fl={x} edit={(p) => edit(x.id, p)} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Pattern: <code>#</code> digit, <code>?</code> letter, <code>*</code> either. Pick list weights: <code>new:3, paid:1</code>. Names, e-mail and username in one row belong to the same person.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Fields" value={s.fields.length} />
          <Stat label="Rows" value={count.toLocaleString()} tone="accent" />
          <Stat label="Est. file size" value={bytesPerRow * count > 1048576 ? `${((bytesPerRow * count) / 1048576).toFixed(1)} MB` : `${((bytesPerRow * count) / 1024).toFixed(1)} KB`} sub={s.out.toUpperCase()} />
          <Stat label="Seed" value={s.seed || '—'} sub={`#${seed.toString(16)}`} />
        </Stats>
        <Panel title="Output format" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.out} onChange={(out) => set({ out })} options={[['csv', 'CSV'], ['json', 'JSON'], ['jsonl', 'JSON Lines'], ['sql', 'SQL INSERT']]} />
          {s.out === 'csv' && <Select label="Delimiter" value={s.delim} onChange={(delim) => set({ delim })} options={[[',', 'Comma ,'], [';', 'Semicolon ;'], ['tab', 'Tab'], ['|', 'Pipe |']]} />}
          {s.out === 'json' && <Check label="Pretty-print" value={s.pretty} onChange={(pretty) => set({ pretty })} />}
          {s.out === 'sql' && (
            <>
              <Row>
                <Txt label="Table" value={s.table} onChange={(table) => set({ table })} />
                <Select label="Dialect" value={s.dialect} onChange={(dialect) => set({ dialect })} options={[['ansi', 'PostgreSQL / ANSI'], ['mysql', 'MySQL / MariaDB'], ['sqlite', 'SQLite']]} />
              </Row>
              <Row>
                <Num label="Rows per INSERT" value={s.batch} onChange={(batch) => set({ batch: Math.max(1, Math.round(batch)) })} min={1} step={1} />
                <Check label="Include CREATE TABLE" value={s.create} onChange={(create) => set({ create })} />
              </Row>
            </>
          )}
          <Btn kind="primary" disabled={busy || empty || dupNames.length > 0 || !s.fields.length} onClick={exportAll}>{busy ? 'Generating…' : `⬇ Download ${count.toLocaleString()} rows`}</Btn>
          <JsonButtons name="fake-data-schema.json" data={s} onLoad={(d) => set(d)} />
          <p className="muted" style={{ fontSize: 13 }}>Names, places and companies are assembled from word parts; e-mails and URLs use the reserved example.com/.org/.net domains, so nothing points at real people or inboxes.</p>
        </Panel>
        <Panel title="Preview (first 50 rows)">
          {s.fields.length ? <Table head={s.fields.map((x) => x.name)} rows={preview.map((r) => s.fields.map((x) => (r[x.name] === null ? <span key={x.id} className="muted">null</span> : String(r[x.name]))))} max={50} /> : <Note>Add a field to start.</Note>}
        </Panel>
        <Panel title={`${s.out.toUpperCase()} sample`} actions={<CopyButton text={() => render(s, preview)} label="Copy 50 rows" />}>
          <pre style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, margin: 0 }}>{sample}</pre>
        </Panel>
      </div>
    </Split>
  )
}
