import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Split, Stat, Stats, useToolState } from '../kit'
import { colName, formatCell, readXlsx, sampleXlsx, toCsvText, type CsvOpts, type Sheet } from './lib/excel-to-csv'
import { fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'

interface State extends CsvOpts {
  bom: boolean
}
const DEF: State = { delimiter: ',', quoteAll: false, eol: '\r\n', dates: 'iso', trim: true, decimal: '.', trimText: false, bom: true }

interface Book { name: string; size: number; sheets: Sheet[] }
const PREVIEW_ROWS = 100
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sheet'

export default function ExcelToCsv() {
  const [s, set, reset] = useToolState('excel-to-csv', DEF)
  const [book, setBook] = useState<Book | null>(null)
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const open = async (name: string, bytes: Uint8Array) => {
    setErr('')
    setBusy(true)
    try {
      const sheets = await readXlsx(bytes)
      if (!sheets.length) throw new Error('The workbook has no worksheets.')
      setBook({ name, size: bytes.length, sheets })
      setPick(new Set(sheets.map((sh, i) => (sh.hidden ? -1 : i)).filter((i) => i >= 0)))
      setTab(Math.max(0, sheets.findIndex((sh) => !sh.hidden)))
    } catch (e) {
      setErr(`${name}: ${(e as Error).message}`)
    }
    setBusy(false)
  }
  useEffect(() => {
    let live = true
    void sampleXlsx().then((b) => {
      if (live) void open('sample-sales.xlsx', b)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const csvs = useMemo(() => (book ? book.sheets.map((sh) => toCsvText(sh.rows, s)) : []), [book, s])
  const base = book ? book.name.replace(/\.[^.]+$/, '') : 'workbook'
  const fileFor = (i: number) => `${base}-${safe(book!.sheets[i].name)}.csv`
  const bytesFor = (i: number) => new TextEncoder().encode((s.bom ? '﻿' : '') + csvs[i])
  const saveOne = (i: number) => download(fileFor(i), new Blob([bytesFor(i) as Uint8Array<ArrayBuffer>], { type: 'text/csv' }))
  const saveAll = () => {
    const idx = [...pick].sort((a, b) => a - b)
    if (idx.length === 1) return saveOne(idx[0])
    const names = uniqueNames(idx.map(fileFor))
    const zip = makeZip(idx.map((i, k) => ({ name: names[k], data: bytesFor(i) })))
    download(`${base}-csv.zip`, new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  }

  const sheet = book?.sheets[tab]
  const dims = (sh: Sheet) => {
    const cols = Math.max(0, ...sh.rows.map((r) => r.length))
    const cells = sh.rows.reduce((a, r) => a + r.filter((c) => c !== null && c !== '').length, 0)
    return { rows: sh.rows.length, cols, cells }
  }
  const sd = sheet ? dims(sheet) : { rows: 0, cols: 0, cells: 0 }
  const typeOf = (v: unknown) => (v instanceof Date ? 'date' : typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : '')

  return (
    <Split>
      <div>
        <Panel title="Workbook" actions={<Btn kind="ghost" onClick={() => void sampleXlsx().then((b) => download('sample-sales.xlsx', new Blob([b as Uint8Array<ArrayBuffer>]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))}>⬇ Sample .xlsx</Btn>}>
          <FileDrop accept=".xlsx,.xlsm,.xltx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onFiles={async (f) => open(f[0].name, new Uint8Array(await f[0].arrayBuffer()))} label="Drop an .xlsx / .xlsm file or click to choose" />
          {busy && <p className="muted">Reading…</p>}
          {err && <Note tone="err">{err}</Note>}
          {book && (
            <>
              <p style={{ margin: '10px 0 6px' }}>
                <b>{book.name}</b> <span className="muted">· {fmtBytes(book.size)} · {book.sheets.length} sheets</span>
              </p>
              {book.sheets.map((sh, i) => {
                const d = dims(sh)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                    <Check label={<b>{sh.name}</b>} value={pick.has(i)} onChange={(on) => { const n = new Set(pick); if (on) n.add(i); else n.delete(i); setPick(n) }} />
                    {sh.hidden && <span className="muted" style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, padding: '0 6px' }}>hidden</span>}
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{d.rows}×{d.cols}</span>
                    <Btn kind="ghost" onClick={() => saveOne(i)} title="Download this sheet">⬇</Btn>
                  </div>
                )
              })}
              <Row>
                <Btn kind="primary" disabled={!pick.size} onClick={saveAll}>{pick.size > 1 ? `⬇ Download ${pick.size} CSVs (ZIP)` : '⬇ Download CSV'}</Btn>
                <Btn kind="ghost" onClick={() => setPick(new Set(book.sheets.map((_, i) => i)))}>Select all</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="CSV format" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div className="k-label">Delimiter</div>
          <Seg value={s.delimiter} onChange={(delimiter) => set({ delimiter, decimal: delimiter === ',' ? '.' : s.decimal })} options={[[',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab'], ['|', 'Pipe |']]} />
          <Row>
            <Select label="Decimal mark" value={s.decimal} onChange={(decimal: '.' | ',') => set({ decimal })} options={[['.', '1234.5'], [',', '1234,5']]} />
            <Select label="Dates" value={s.dates} onChange={(dates: CsvOpts['dates']) => set({ dates })} options={[['iso', '2026-03-31 (ISO)'], ['datetime', '2026-03-31 00:00:00'], ['us', '03/31/2026 (US)'], ['eu', '31.03.2026 (EU)']]} />
            <Select label="Line endings" value={s.eol} onChange={(eol: CsvOpts['eol']) => set({ eol })} options={[['\r\n', 'Windows (CRLF)'], ['\n', 'Unix (LF)']]} />
          </Row>
          {s.decimal === ',' && s.delimiter === ',' && <Note tone="warn">A comma decimal mark with a comma delimiter forces every number into quotes. Use semicolon as the delimiter (the European Excel default).</Note>}
          <Check label="UTF-8 BOM (lets Excel open accents and Cyrillic correctly)" value={s.bom} onChange={(bom) => set({ bom })} />
          <Check label="Drop empty trailing rows and columns" value={s.trim} onChange={(trim) => set({ trim })} />
          <Check label="Trim spaces inside text cells" value={!!s.trimText} onChange={(trimText) => set({ trimText })} />
          <Check label="Quote every field" value={s.quoteAll} onChange={(quoteAll) => set({ quoteAll })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sheets" value={book?.sheets.length ?? 0} sub={`${pick.size} selected`} />
          <Stat label="Rows × columns" value={`${sd.rows} × ${sd.cols}`} sub={sheet?.name} />
          <Stat label="Filled cells" value={sd.cells.toLocaleString('en-US')} />
          <Stat label="CSV size" value={csvs[tab] !== undefined ? fmtBytes(bytesFor(tab).length) : '—'} tone="accent" />
        </Stats>
        {book && (
          <Panel
            title="Preview"
            actions={
              <>
                <CopyButton text={() => csvs[tab]} label="Copy CSV" />
                <Btn onClick={() => saveOne(tab)}>⬇ This sheet</Btn>
              </>
            }
          >
            <Seg value={String(tab)} onChange={(v) => setTab(Number(v))} options={book.sheets.map((sh, i) => [String(i), sh.hidden ? `${sh.name} (hidden)` : sh.name] as [string, string])} />
            {sheet && (
              <div className="k-table-wrap" style={{ maxHeight: 420, overflow: 'auto', marginTop: 10 }}>
                <table className="k-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th />
                      {Array.from({ length: sd.cols }, (_, i) => <th key={i} style={{ textAlign: 'center' }}>{colName(i)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                      <tr key={ri}>
                        <td className="muted" style={{ textAlign: 'right' }}>{ri + 1}</td>
                        {Array.from({ length: sd.cols }, (_, ci) => {
                          const v = r[ci]
                          const t = typeOf(v)
                          return (
                            <td key={ci} title={t ? `${t}` : undefined} style={{ whiteSpace: 'pre', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: t === 'num' ? 'right' : undefined, color: t === 'date' ? 'var(--accent2)' : t === 'bool' ? 'var(--warn)' : undefined }}>
                              {v === null || v === undefined ? '' : formatCell(v, s)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sd.rows > PREVIEW_ROWS && <p className="muted">Showing the first {PREVIEW_ROWS} of {sd.rows} rows — the CSV contains them all.</p>}
          </Panel>
        )}
        {book && csvs[tab] !== undefined && (
          <Panel title="CSV text">
            <pre style={{ maxHeight: 220, overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--panel2)', padding: 10, borderRadius: 8, margin: 0 }}>
              {csvs[tab].split(/\r?\n/).slice(0, 25).join('\n').replace(/\t/g, '⇥')}
            </pre>
          </Panel>
        )}
        <Note>
          The workbook is unzipped with the browser’s own DecompressionStream and the sheet XML is parsed here — nothing is uploaded. Formulas export their last calculated value; date-formatted cells become real dates; merged cells keep their value in the top-left cell. Legacy .xls (binary) files must be re-saved as .xlsx first.
        </Note>
      </div>
    </Split>
  )
}
