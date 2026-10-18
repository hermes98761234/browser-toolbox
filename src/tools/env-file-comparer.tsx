import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { compare, looksSecret, mask, merge, parseEnv, type MergeMode, type Status } from './lib/env-file-comparer'

interface EnvFile { id: string; name: string; text: string }

const DEF = {
  files: [
    { id: 'a', name: '.env.example', text: '# App\nNODE_ENV=development\nPORT=3000\nAPP_URL=http://localhost:3000\n\n# Database\nDATABASE_URL=\nREDIS_URL=\n\n# Auth\nJWT_SECRET=\nSESSION_TTL=3600\n\n# Mail\nSMTP_HOST=\nSMTP_USER=\nSMTP_PASS=\n' },
    { id: 'b', name: '.env.local', text: 'NODE_ENV=development\nPORT=3000\nAPP_URL=http://localhost:3000\nDATABASE_URL=postgres://dev:dev@localhost:5432/app\nREDIS_URL=redis://localhost:6379\nJWT_SECRET=dev-only-not-secret-123\nSESSION_TTL=3600\nDEBUG=app:*\nSMTP_HOST=localhost\nSMTP_USER=\n' },
    { id: 'c', name: '.env.production', text: 'export NODE_ENV=production\nPORT=8080\nAPP_URL="https://app.example.com"\nDATABASE_URL=postgres://app:Xk29fLq0p@db.internal:5432/app\nREDIS_URL=redis://cache.internal:6379\nJWT_SECRET="b7Jq9!Kz2@pL0#xV4$wR8"\nSESSION_TTL=86400\nSMTP_HOST=smtp.mailgun.org\nSMTP_USER=postmaster@example.com\nSMTP_PASS=\'mg-9f8e7d6c5b4a\'\nSENTRY_DSN=https://abc123@o1.ingest.sentry.io/42\n' },
  ] as EnvFile[],
  reveal: false,
  filter: 'all' as 'all' | 'problems' | Status,
  mode: 'last' as MergeMode,
  sort: false,
}

const TONE: Record<Status, string> = { same: 'var(--ok)', differs: 'var(--warn)', missing: 'var(--err)', empty: 'var(--muted)' }
const LABEL: Record<Status, string> = { same: '✓ same', differs: '≠ differs', missing: '✕ missing', empty: '∅ empty' }

export default function EnvFileComparer() {
  const [s, set, reset] = useToolState('env-file-comparer', DEF)
  const [q, setQ] = useState('')
  const parsed = useMemo(() => s.files.map((f) => parseEnv(f.text)), [s.files])
  const rows = useMemo(() => compare(parsed), [parsed])
  const names = useMemo(() => s.files.map((f) => f.name || 'untitled'), [s.files])
  const counts = { same: 0, differs: 0, missing: 0, empty: 0 } as Record<Status, number>
  for (const r of rows) counts[r.status]++
  const shown = rows.filter((r) => (s.filter === 'all' ? true : s.filter === 'problems' ? r.status !== 'same' : r.status === s.filter) && r.key.toLowerCase().includes(q.toLowerCase()))
  const merged = useMemo(() => merge(parsed, names, s.mode, s.sort), [parsed, names, s.mode, s.sort])
  const edit = (id: string, p: Partial<EnvFile>) => set({ files: s.files.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const show = (k: string, v: string | undefined) => {
    if (v === undefined) return ''
    if (v === '') return '(empty)'
    if (!s.reveal && looksSecret(k)) return mask(v, 2)
    const t = s.reveal ? v : v.replace(/(:\/\/[^:/@\s]+:)[^@\s]+@/, '$1••••@') // hide passwords inside URLs
    return t.length > 24 ? t.slice(0, 22) + '…' : t
  }

  return (
    <Split wide="right">
      <div>
        <Panel
          title="Files"
          actions={
            <>
              <Btn disabled={s.files.length >= 6} onClick={() => set({ files: [...s.files, { id: uid(), name: `.env.${s.files.length + 1}`, text: '' }] })}>+ File</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <FileDrop
            multiple
            label="Drop .env files (any number) to add them"
            onFiles={async (fs) => {
              const add = await Promise.all(fs.map(async (f) => ({ id: uid(), name: f.name, text: await f.text() })))
              const keep = s.files.filter((f) => f.text.trim())
              set({ files: [...keep, ...add].slice(-6) })
            }}
          />
          {s.files.map((f, i) => {
            const p = parsed[i]
            return (
              <div key={f.id} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <Row wrap={false}>
                  <div style={{ flex: 1 }}>
                    <Txt label={`File ${i + 1} · ${p.map.size} keys`} value={f.name} onChange={(name) => edit(f.id, { name })} />
                  </div>
                  <Btn kind="ghost" disabled={s.files.length <= 2} onClick={() => set({ files: s.files.filter((x) => x.id !== f.id) })} title="Remove file">✕</Btn>
                </Row>
                <Area value={f.text} onChange={(text) => edit(f.id, { text })} rows={6} mono placeholder="KEY=value" />
                {p.duplicates.length > 0 && <Note tone="warn">Defined twice (last one wins): {p.duplicates.join(', ')}</Note>}
                {p.errors.length > 0 && <Note tone="err">Unparsable line{p.errors.length > 1 ? 's' : ''}: {p.errors.map((e) => e.line).join(', ')}</Note>}
              </div>
            )
          })}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Keys (union)" value={rows.length} />
          <Stat label="Missing somewhere" value={counts.missing} tone={counts.missing ? 'bad' : 'good'} />
          <Stat label="Different values" value={counts.differs} tone={counts.differs ? 'accent' : undefined} />
          <Stat label="Identical" value={counts.same} sub={`${counts.empty} empty in some file`} />
        </Stats>
        <Panel
          title="Comparison"
          actions={
            <>
              <Check label="Reveal secrets" value={s.reveal} onChange={(reveal) => set({ reveal })} />
              <CsvButton name="env-comparison.csv" rows={() => [['Key', ...names, 'Status'], ...rows.map((r) => [r.key, ...r.values.map((v) => (v === undefined ? '(missing)' : s.reveal ? v : mask(v))), r.status])]} />
            </>
          }
        >
          <Row>
            <Seg
              value={s.filter}
              onChange={(filter) => set({ filter })}
              options={[['all', `All ${rows.length}`], ['problems', 'Problems'], ['missing', `Missing ${counts.missing}`], ['differs', `Differs ${counts.differs}`], ['same', 'Same']]}
            />
            <input className="k-text" placeholder="Filter keys…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 180 }} aria-label="Filter keys" />
          </Row>
          <Table
            head={['Key', ...names, 'Status']}
            rows={shown.map((r) => [
              <code key="k" style={{ fontWeight: 600 }}>{r.key}{looksSecret(r.key) && ' 🔒'}</code>,
              ...r.values.map((v, i) =>
                v === undefined ? (
                  <span key={i} style={{ color: 'var(--err)', fontWeight: 600 }}>missing</span>
                ) : (
                  <code key={i} style={{ color: v === '' ? 'var(--muted)' : undefined, wordBreak: 'break-all' }}>{show(r.key, v)}</code>
                ),
              ),
              <span key="s" style={{ color: TONE[r.status], fontWeight: 600, whiteSpace: 'nowrap' }}>{LABEL[r.status]}</span>,
            ])}
          />
          {shown.length === 0 && <Note tone="ok">Nothing matches this filter.</Note>}
        </Panel>
        <Panel title="Missing keys per file">
          {s.files.map((f, i) => {
            const miss = rows.filter((r) => r.values[i] === undefined).map((r) => r.key)
            return (
              <p key={f.id} style={{ margin: '6px 0' }}>
                <b>{names[i]}</b>: {miss.length ? <span style={{ color: 'var(--err)' }}>{miss.join(', ')}</span> : <span style={{ color: 'var(--ok)' }}>has every key ✓</span>}
              </p>
            )
          })}
        </Panel>
        <Panel
          title="Merged output"
          actions={
            <>
              <CopyButton text={merged} />
              <Btn onClick={() => download(s.mode === 'example' ? '.env.example' : '.env.merged', merged, 'text/plain')}>⬇ Download</Btn>
            </>
          }
        >
          <Row>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['first', 'First file wins'], ['last', 'Last file wins'], ['example', '.env.example (blank)']]} />
            <Check label="Sort keys A→Z" value={s.sort} onChange={(sort) => set({ sort })} />
          </Row>
          <pre className="mono" style={{ maxHeight: 260, overflow: 'auto', background: 'var(--bg)', padding: 10, borderRadius: 8, fontSize: 12.5 }}>{merged}</pre>
          <Note>Merged output contains real values. Everything is processed locally in your browser; nothing is uploaded.</Note>
        </Panel>
      </div>
    </Split>
  )
}
