import { useMemo } from 'react'
import { Area, Bar, Btn, Check, color, download, FileDrop, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'
import { crossTab, groupSplit, kFold, leakingGroups, randomSplit, sampleCsv, stratifiedSplit, type Part } from './lib/train-test-splitter'

type Mode = 'holdout' | 'kfold'
type Method = 'random' | 'stratified' | 'group'

interface State {
  csv: string
  header: boolean
  mode: Mode
  method: Method
  label: number
  group: number
  train: number
  val: number
  test: number
  k: number
  seed: number
}

const DEF: State = { csv: sampleCsv(), header: true, mode: 'holdout', method: 'stratified', label: 6, group: 1, train: 70, val: 15, test: 15, k: 5, seed: 42 }
const PART_LABEL: Record<Part, string> = { train: 'Train', val: 'Validation', test: 'Test' }

/** Numeric targets with many distinct values are stratified by quintile bins. */
function strataOf(values: string[]): { keys: string[]; binned: boolean } {
  const nums = values.map(Number)
  const distinct = new Set(values).size
  if (distinct > 10 && nums.every((x, i) => values[i].trim() !== '' && Number.isFinite(x))) {
    const sorted = [...nums].sort((a, b) => a - b)
    const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))])
    return { keys: nums.map((x) => `Q${cuts.filter((c) => x > c).length + 1}`), binned: true }
  }
  return { keys: values, binned: false }
}

export default function TrainTestSplitter() {
  const [s, set, reset] = useToolState('train-test-splitter', DEF)

  const data = useMemo(() => {
    const rows = parseCsv(s.csv, detectDelimiter(s.csv))
    if (!rows.length) return { head: [] as string[], body: [] as string[][] }
    const width = Math.max(...rows.map((r) => r.length))
    const head = s.header ? rows[0].map((h, i) => h || `col${i + 1}`) : Array.from({ length: width }, (_, i) => `col${i + 1}`)
    const body = (s.header ? rows.slice(1) : rows).map((r) => head.map((_, i) => r[i] ?? ''))
    return { head, body }
  }, [s.csv, s.header])

  const { head, body } = data
  const labelIdx = Math.min(s.label, head.length - 1)
  const groupIdx = Math.min(s.group, head.length - 1)
  const fr: [number, number, number] = [s.train, s.val, s.test]
  const strata = useMemo(() => strataOf(body.map((r) => r[labelIdx] ?? '')), [body, labelIdx])
  const groups = useMemo(() => body.map((r) => r[groupIdx] ?? ''), [body, groupIdx])

  const buckets: string[] = useMemo(() => {
    const n = body.length
    if (!n) return []
    if (s.mode === 'kfold') {
      const f = kFold(n, Math.max(2, Math.min(s.k, n)), s.seed, s.method === 'stratified' ? { labels: strata.keys } : s.method === 'group' ? { groups } : {})
      return f.map((x) => `fold ${x + 1}`)
    }
    if (s.method === 'stratified') return stratifiedSplit(strata.keys, fr, s.seed)
    if (s.method === 'group') return groupSplit(groups, fr, s.seed)
    return randomSplit(n, fr, s.seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, s.mode, s.method, s.k, s.seed, s.train, s.val, s.test, strata, groups])

  const names = s.mode === 'kfold' ? Array.from({ length: Math.max(2, Math.min(s.k, body.length)) }, (_, i) => `fold ${i + 1}`) : (['train', 'val', 'test'] as Part[]).filter((p) => fr[['train', 'val', 'test'].indexOf(p)] > 0)
  const tab = crossTab(buckets, strata.keys)
  const classes = [...new Set(strata.keys)].sort()
  const overall = new Map<string, number>()
  for (const k of strata.keys) overall.set(k, (overall.get(k) ?? 0) + 1)
  const size = (b: string) => [...(tab.get(b)?.values() ?? [])].reduce((a, c) => a + c, 0)
  const leaks = leakingGroups(buckets, groups)
  const nGroups = new Set(groups).size
  // Largest deviation (percentage points) of any class share in any bucket from the full data.
  const drift = Math.max(0, ...names.flatMap((b) => classes.map((c) => size(b) ? Math.abs((tab.get(b)?.get(c) ?? 0) / size(b) - (overall.get(c) ?? 0) / body.length) : 0)))
  const shareSum = s.train + s.val + s.test
  const colName = s.mode === 'kfold' ? 'fold' : 'split'

  const csvOf = (filter?: string) => toCsv([[...head, ...(filter ? [] : [colName])], ...body.flatMap((r, i) => (filter && buckets[i] !== filter ? [] : [filter ? r : [...r, s.mode === 'kfold' ? buckets[i].slice(5) : buckets[i]]]))])
  const label = (b: string) => (s.mode === 'kfold' ? b.replace('fold', 'Fold') : PART_LABEL[b as Part])

  return (
    <Split>
      <div>
        <Panel title="Dataset" actions={<><Btn onClick={() => set({ csv: sampleCsv(), header: true, label: 6, group: 1 })}>Sample</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async ([f]) => set({ csv: await f.text(), label: 0, group: 0 })} label="Drop a CSV / TSV file or click to choose" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={7} mono />
          <Check label="First row is a header" value={s.header} onChange={(header) => set({ header })} />
          <p className="muted" style={{ margin: '6px 0 0' }}>{body.length} rows × {head.length} columns · stays in your browser</p>
        </Panel>
        <Panel title="Split settings">
          <Seg<Mode> value={s.mode} onChange={(mode) => set({ mode })} options={[['holdout', 'Train / val / test'], ['kfold', 'k-fold CV']]} />
          <div style={{ marginTop: 10 }}>
            <Seg<Method> value={s.method} onChange={(method) => set({ method })} options={[['random', 'Random'], ['stratified', 'Stratified'], ['group', 'Group-aware']]} />
          </div>
          <Row>
            <Select label="Label column (stratify / summarise)" value={labelIdx} onChange={(label) => set({ label })} options={head.map((h, i) => [i, h] as const)} />
            {s.method === 'group' && <Select label="Group column" value={groupIdx} onChange={(group) => set({ group })} options={head.map((h, i) => [i, h] as const)} />}
          </Row>
          {strata.binned && <Note>Numeric target: stratifying by quintile bins Q1–Q5.</Note>}
          {s.mode === 'holdout' ? (
            <>
              <Slider label="Train" value={s.train} onChange={(train) => set({ train })} min={0} max={100} unit="%" show={(v) => String(v)} />
              <Slider label="Validation" value={s.val} onChange={(val) => set({ val })} min={0} max={100} unit="%" show={(v) => String(v)} />
              <Slider label="Test" value={s.test} onChange={(test) => set({ test })} min={0} max={100} unit="%" show={(v) => String(v)} />
              {shareSum !== 100 && <Note tone="warn">Shares add up to {shareSum}% — they are normalised to 100%.</Note>}
              <Row>
                {[[80, 0, 20], [70, 15, 15], [60, 20, 20], [90, 5, 5]].map(([a, b, c]) => (
                  <Btn key={`${a}${b}`} kind="ghost" onClick={() => set({ train: a, val: b, test: c })}>{a}/{b}/{c}</Btn>
                ))}
              </Row>
            </>
          ) : (
            <Num label="Folds (k)" value={s.k} onChange={(k) => set({ k: Math.max(2, Math.round(k)) })} min={2} max={50} />
          )}
          <Row>
            <Num label="Random seed" value={s.seed} onChange={(seed) => set({ seed: Math.round(seed) })} />
            <Btn onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>🎲 New seed</Btn>
          </Row>
          <p className="muted" style={{ margin: 0 }}>Same data + same seed ⇒ the same split (mulberry32 PRNG + Fisher–Yates shuffle).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          {names.map((b, i) => <Stat key={b} label={label(b)} value={size(b)} sub={pct(size(b) / (body.length || 1))} tone={i === 0 ? 'accent' : undefined} />)}
          <Stat label="Max class drift" value={`${(drift * 100).toFixed(1)} pp`} sub="vs. full dataset" tone={drift < 0.03 ? 'good' : drift > 0.08 ? 'bad' : undefined} />
        </Stats>
        {s.method === 'group' && (leaks.length ? <Note tone="err">{leaks.length} groups appear in several parts.</Note> : <Note tone="ok">No leakage: each of the {nGroups} groups ({head[groupIdx]}) sits in exactly one {s.mode === 'kfold' ? 'fold' : 'part'}.</Note>)}
        {s.method !== 'group' && nGroups < body.length && groupIdx !== labelIdx && leakingGroups(buckets, groups).length > 0 && s.mode === 'holdout' && (
          <Note tone="warn">Column “{head[groupIdx]}” repeats across parts ({leakingGroups(buckets, groups).length} values). If rows from the same entity must stay together, use Group-aware.</Note>
        )}
        <Panel title={`Class proportions — ${head[labelIdx] ?? ''}`}>
          <Table
            head={['Class', 'All', ...names.map(label)]}
            rows={classes.map((c, ci) => [
              <b key="c" style={{ color: color(ci) }}>{c}</b>,
              `${overall.get(c)} · ${pct((overall.get(c) ?? 0) / body.length)}`,
              ...names.map((b) => {
                const v = tab.get(b)?.get(c) ?? 0
                const share = size(b) ? v / size(b) : 0
                return <div key={b} style={{ minWidth: 90 }}>{v} · {pct(share)}<Bar value={share} color={color(ci)} /></div>
              }),
            ])}
          />
        </Panel>
        <Panel
          title="Download"
          actions={<Btn kind="primary" onClick={() => download(`dataset-with-${colName}.csv`, csvOf(), 'text/csv')}>⬇ All rows + {colName} column</Btn>}
        >
          {s.mode === 'holdout' ? (
            <Row>
              {names.map((b) => <Btn key={b} onClick={() => download(`${b}.csv`, csvOf(b), 'text/csv')}>⬇ {b}.csv ({size(b)})</Btn>)}
            </Row>
          ) : (
            <p className="muted" style={{ margin: 0 }}>For fold k, train on every row whose fold ≠ k and validate on fold k.</p>
          )}
        </Panel>
        <Panel title="Preview">
          <Table
            head={[colName, ...head]}
            rows={body.slice(0, 12).map((r, i) => [<b key="b">{buckets[i]}</b>, ...r])}
          />
          {body.length > 12 && <p className="k-more">First 12 of {body.length} rows</p>}
        </Panel>
        <Note>Stratified keeps label ratios; group-aware keeps all rows of a patient/user/session together so the test score isn’t inflated by near-duplicates. Split before any scaling or feature selection to avoid leakage.</Note>
      </div>
    </Split>
  )
}
