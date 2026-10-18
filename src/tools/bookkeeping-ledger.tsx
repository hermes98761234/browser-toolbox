import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, download, FileDrop, money, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { balanceSheetCsv, cents, importJournal, journalCsv, ledger, plCsv, summary, totals, trialBalance, validate, type Account, type AType, type Entry, type Line } from './lib/bookkeeping-ledger'

// ---------- IndexedDB: entries and the chart of accounts ----------
const DBN = 'tb-bookkeeping-ledger'
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries', { keyPath: 'id' })
      r.result.createObjectStore('meta')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await open()
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode)
    const q = fn(t.objectStore(store))
    t.oncomplete = () => {
      d.close()
      res(q ? q.result : undefined)
    }
    t.onerror = () => rej(t.error)
  })
}
const db = {
  entries: async () => (await run<Entry[]>('entries', 'readonly', (s) => s.getAll())) ?? [],
  put: (es: Entry[]) => run('entries', 'readwrite', (s) => void es.forEach((e) => s.put(e))),
  del: (id: string) => run('entries', 'readwrite', (s) => void s.delete(id)),
  clear: () => run('entries', 'readwrite', (s) => void s.clear()),
  accounts: async () => run<Account[] | undefined>('meta', 'readonly', (s) => s.get('accounts') as IDBRequest<Account[] | undefined>),
  saveAccounts: (a: Account[]) => run('meta', 'readwrite', (s) => void s.put(a, 'accounts')),
}

const ACCOUNTS: Account[] = [
  { code: '1000', name: 'Cash at bank', type: 'asset' }, { code: '1100', name: 'Accounts receivable', type: 'asset' }, { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '1500', name: 'Equipment', type: 'asset', current: false }, { code: '1510', name: 'Accumulated depreciation', type: 'asset', current: false, contra: true },
  { code: '2000', name: 'Accounts payable', type: 'liability' }, { code: '2100', name: 'Sales tax payable', type: 'liability' }, { code: '2500', name: 'Bank loan', type: 'liability', current: false },
  { code: '3000', name: "Owner's capital", type: 'equity' }, { code: '3100', name: "Owner's drawings", type: 'equity', contra: true },
  { code: '4000', name: 'Sales', type: 'revenue' }, { code: '4100', name: 'Service income', type: 'revenue' },
  { code: '5000', name: 'Cost of goods sold', type: 'expense' }, { code: '6000', name: 'Rent', type: 'expense' }, { code: '6100', name: 'Wages', type: 'expense' },
  { code: '6200', name: 'Utilities', type: 'expense' }, { code: '6300', name: 'Depreciation', type: 'expense' }, { code: '6400', name: 'Bank fees', type: 'expense' },
]
const L = (account: string, debit = 0, credit = 0): Line => ({ account, debit, credit })
const month = new Date().toISOString().slice(0, 7)
const SAMPLE: Entry[] = [
  { id: 's1', date: `${month}-01`, ref: 'J-001', memo: 'Owner invests cash', lines: [L('1000', 15000), L('3000', 0, 15000)] },
  { id: 's2', date: `${month}-02`, ref: 'J-002', memo: 'Bank loan received', lines: [L('1000', 8000), L('2500', 0, 8000)] },
  { id: 's3', date: `${month}-03`, ref: 'J-003', memo: 'Espresso machine on account', lines: [L('1500', 6400), L('2000', 0, 6400)] },
  { id: 's4', date: `${month}-04`, ref: 'J-004', memo: 'Stock purchase', lines: [L('1200', 3200), L('1000', 0, 3200)] },
  { id: 's5', date: `${month}-08`, ref: 'J-005', memo: 'Sales weeks 1–2 incl. 8% tax', lines: [L('1000', 8164.8), L('4000', 0, 7560), L('2100', 0, 604.8)] },
  { id: 's6', date: `${month}-08`, ref: 'J-006', memo: 'Cost of goods sold, weeks 1–2', lines: [L('5000', 2300), L('1200', 0, 2300)] },
  { id: 's7', date: `${month}-10`, ref: 'J-007', memo: 'Catering invoice #104', lines: [L('1100', 950), L('4100', 0, 950)] },
  { id: 's8', date: `${month}-12`, ref: 'J-008', memo: 'Rent for the month', lines: [L('6000', 1800), L('1000', 0, 1800)] },
  { id: 's9', date: `${month}-15`, ref: 'J-009', memo: 'Payroll', lines: [L('6100', 2650), L('1000', 0, 2650)] },
  { id: 's10', date: `${month}-18`, ref: 'J-010', memo: 'Pay supplier part of machine', lines: [L('2000', 3000), L('1000', 0, 3000)] },
  { id: 's11', date: `${month}-20`, ref: 'J-011', memo: 'Customer paid invoice #104', lines: [L('1000', 950), L('1100', 0, 950)] },
  { id: 's12', date: `${month}-25`, ref: 'J-012', memo: 'Electricity and water', lines: [L('6200', 340.75), L('6400', 12.5), L('1000', 0, 353.25)] },
  { id: 's13', date: `${month}-28`, ref: 'J-013', memo: 'Monthly depreciation', lines: [L('6300', 106.67), L('1510', 0, 106.67)] },
  { id: 's14', date: `${month}-28`, ref: 'J-014', memo: 'Owner drawings', lines: [L('3100', 500), L('1000', 0, 500)] },
]
const TYPES: [AType, string][] = [['asset', 'Asset'], ['liability', 'Liability'], ['equity', 'Equity'], ['revenue', 'Revenue'], ['expense', 'Expense']]
const blank = (n: number): Entry => ({ id: '', date: new Date().toISOString().slice(0, 10), ref: `J-${String(n + 1).padStart(3, '0')}`, memo: '', lines: [L(''), L('')] })

export default function BookkeepingLedger() {
  const [ui, setUi] = useToolState('bookkeeping-ledger', { tab: 'journal' as 'journal' | 'ledger' | 'tb' | 'accounts' | 'io', currency: '$', acc: '1000', from: '', to: '', seeded: false })
  const [entries, setEntries] = useState<Entry[]>([])
  const [accounts, setAccounts] = useState<Account[]>(ACCOUNTS)
  const [draft, setDraft] = useState<Entry>(blank(SAMPLE.length))
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const m = (c: number) => money(c / 100, ui.currency)

  const reload = useCallback(async () => {
    try {
      setEntries((await db.entries()).sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref)))
      const acc = await db.accounts()
      if (acc?.length) setAccounts(acc)
    } catch (e) {
      setMsg({ tone: 'err', text: `IndexedDB is unavailable here (${(e as Error).message}).` })
    }
  }, [])
  useEffect(() => {
    void (async () => {
      try {
        if (!ui.seeded && !(await db.entries()).length) {
          await db.put(SAMPLE)
          await db.saveAccounts(ACCOUNTS)
        }
        setUi({ seeded: true })
      } catch {
        /* reported in reload */
      }
      await reload()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const errs = validate(draft, accounts)
  const used = draft.lines.filter((l) => l.account || l.debit || l.credit)
  const t = totals(used)
  const accName = (c: string) => accounts.find((a) => a.code === c)?.name ?? c
  const setLine = (i: number, p: Partial<Line>) => setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) })
  const post = async () => {
    if (errs.length) return
    const e = { ...draft, id: draft.id || uid(), lines: used.map((l) => ({ account: l.account, debit: cents(l.debit) / 100, credit: cents(l.credit) / 100 })) }
    await db.put([e])
    setMsg({ tone: 'ok', text: `${draft.id ? 'Updated' : 'Posted'} ${e.ref}.` })
    setDraft(blank(entries.length + (draft.id ? 0 : 1)))
    await reload()
  }
  const balanceLast = () => {
    const diff = (t.dr - t.cr) / 100
    if (!diff) return
    const i = draft.lines.findIndex((l) => !l.debit && !l.credit)
    const line = diff > 0 ? { credit: diff, debit: 0 } : { debit: -diff, credit: 0 }
    if (i >= 0) setLine(i, line)
    else setDraft({ ...draft, lines: [...draft.lines, { account: '', ...line }] })
  }

  const s = useMemo(() => summary(accounts, entries, ui.from || undefined, ui.to || undefined), [accounts, entries, ui.from, ui.to])
  const tb = useMemo(() => trialBalance(accounts, entries, ui.to || undefined), [accounts, entries, ui.to])
  const curAcc = accounts.find((a) => a.code === ui.acc) ?? accounts[0]
  const gl = useMemo(() => (curAcc ? ledger(entries, curAcc, ui.from || undefined, ui.to || undefined) : null), [entries, curAcc, ui.from, ui.to])
  const shown = entries.filter((e) => !q || `${e.ref} ${e.memo} ${e.date} ${e.lines.map((l) => accName(l.account)).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  const saveAccounts = async (a: Account[]) => {
    setAccounts(a)
    await db.saveAccounts(a)
  }
  const usedCodes = new Set(entries.flatMap((e) => e.lines.map((l) => l.account)))
  const totalDr = entries.reduce((a, e) => a + totals(e.lines).dr, 0)

  return (
    <div>
      <Stats>
        <Stat label="Journal entries" value={entries.length} sub={`${m(totalDr)} posted`} />
        <Stat label="Net income" value={m(s.netIncome)} tone={s.netIncome >= 0 ? 'good' : 'bad'} sub={`${m(s.revenue)} revenue − ${m(s.expenses)} expenses`} />
        <Stat label="Assets" value={m(s.assets)} sub={`= ${m(s.liabilities)} liab. + ${m(s.equity + s.retained)} equity`} />
        <Stat label="Trial balance" value={tb.dr === tb.cr ? 'Balanced ✓' : 'Out of balance'} tone={tb.dr === tb.cr && s.balanced ? 'good' : 'bad'} sub={`${m(tb.dr)} Dr = ${m(tb.cr)} Cr`} />
      </Stats>
      <Panel title="Ledger" actions={<><Seg value={ui.tab} onChange={(tab) => setUi({ tab })} options={[['journal', 'Journal'], ['ledger', 'General ledger'], ['tb', 'Trial balance'], ['accounts', 'Chart of accounts'], ['io', 'Import / export']]} /></>}>
        <Row>
          <Txt label="From" type="date" value={ui.from} onChange={(from) => setUi({ from })} />
          <Txt label="To (as of)" type="date" value={ui.to} onChange={(to) => setUi({ to })} />
          <Select label="Currency" value={ui.currency} onChange={(currency) => setUi({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
        </Row>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      </Panel>

      {ui.tab === 'journal' && (
        <Split>
          <Panel title={draft.id ? `Edit ${draft.ref}` : 'New journal entry'} actions={draft.id ? <Btn kind="ghost" onClick={() => setDraft(blank(entries.length))}>Cancel edit</Btn> : undefined}>
            <Row>
              <Txt label="Date" type="date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
              <Txt label="Reference" value={draft.ref} onChange={(ref) => setDraft({ ...draft, ref })} />
            </Row>
            <Txt label="Description" value={draft.memo} onChange={(memo) => setDraft({ ...draft, memo })} placeholder="e.g. Paid March rent" />
            <div className="k-table-wrap">
              <table className="k-table">
                <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th /></tr></thead>
                <tbody>
                  {draft.lines.map((l, i) => (
                    <tr key={i}>
                      <td><select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} aria-label="Account" style={{ maxWidth: 210 }}><option value="">— account —</option>{TYPES.map(([ty, label]) => <optgroup key={ty} label={label}>{accounts.filter((a) => a.type === ty).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>)}</select></td>
                      <td><input type="number" min={0} step="0.01" value={l.debit || ''} onChange={(e) => setLine(i, { debit: Math.max(0, Number(e.target.value) || 0), credit: Number(e.target.value) ? 0 : l.credit })} aria-label="Debit" style={{ width: 100 }} /></td>
                      <td><input type="number" min={0} step="0.01" value={l.credit || ''} onChange={(e) => setLine(i, { credit: Math.max(0, Number(e.target.value) || 0), debit: Number(e.target.value) ? 0 : l.debit })} aria-label="Credit" style={{ width: 100 }} /></td>
                      <td><Btn kind="ghost" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })} disabled={draft.lines.length <= 2}>✕</Btn></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Totals</td><td>{m(t.dr)}</td><td>{m(t.cr)}</td><td style={{ color: t.dr === t.cr ? 'var(--ok)' : 'var(--err)' }}>{t.dr === t.cr ? (t.dr ? '✓' : '') : '≠'}</td></tr></tfoot>
              </table>
            </div>
            <Row>
              <Btn onClick={() => setDraft({ ...draft, lines: [...draft.lines, L('')] })}>+ Line</Btn>
              <Btn onClick={balanceLast} disabled={t.dr === t.cr}>Balance with last line</Btn>
              <Btn kind="primary" onClick={() => void post()} disabled={errs.length > 0}>{draft.id ? 'Save changes' : 'Post entry'}</Btn>
            </Row>
            {errs.length > 0 && used.length > 0 && <Note tone="warn">{errs.join(' ')}</Note>}
            <Note>Every entry must balance: total debits = total credits. Debits increase assets and expenses; credits increase liabilities, equity and revenue.</Note>
          </Panel>
          <Panel title={`Journal (${shown.length})`} actions={<Txt label="Search" value={q} onChange={setQ} placeholder="memo, ref, account…" />}>
            <div style={{ maxHeight: 640, overflow: 'auto' }}>
              {[...shown].reverse().map((e) => (
                <div key={e.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                  <Row wrap={false}>
                    <span style={{ flex: 1 }}><b>{e.ref}</b> <span className="muted">{e.date}</span> · {e.memo}</span>
                    <Btn kind="ghost" onClick={() => setDraft({ ...e, lines: e.lines.map((l) => ({ ...l })) })}>Edit</Btn>
                    <Btn kind="ghost" onClick={() => { if (confirm(`Delete ${e.ref}?`)) void db.del(e.id).then(reload) }}>✕</Btn>
                  </Row>
                  {e.lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', fontSize: 13.5, paddingLeft: l.credit ? 24 : 0 }}>
                      <span>{l.account} · {accName(l.account)}</span>
                      <span style={{ textAlign: 'right' }}>{l.debit ? m(cents(l.debit)) : ''}</span>
                      <span style={{ textAlign: 'right' }}>{l.credit ? m(cents(l.credit)) : ''}</span>
                    </div>
                  ))}
                </div>
              ))}
              {!shown.length && <p className="muted">No entries{q ? ' match the search' : ' yet'}.</p>}
            </div>
          </Panel>
        </Split>
      )}

      {ui.tab === 'ledger' && gl && curAcc && (
        <Panel title={`General ledger · ${curAcc.code} ${curAcc.name}`} actions={<Select label="Account" value={curAcc.code} onChange={(acc) => setUi({ acc })} options={accounts.map((a) => [a.code, `${a.code} · ${a.name}${usedCodes.has(a.code) ? '' : ' (unused)'}`] as const)} />}>
          <p className="muted" style={{ marginTop: 0 }}>Normal balance: {(curAcc.type === 'asset' || curAcc.type === 'expense') !== !!curAcc.contra ? 'debit' : 'credit'}{curAcc.contra ? ' (contra account)' : ''}. Opening balance {m(gl.opening)}.</p>
          <Table head={['Date', 'Ref', 'Description', 'Debit', 'Credit', 'Balance']} rows={gl.rows.map((r) => [r.date, r.ref, r.memo, r.debit ? m(r.debit) : '', r.credit ? m(r.credit) : '', <b key="b">{m(r.balance)}</b>])} foot={['', '', 'Closing balance', m(gl.rows.reduce((a, r) => a + r.debit, 0)), m(gl.rows.reduce((a, r) => a + r.credit, 0)), m(gl.closing)]} />
        </Panel>
      )}

      {ui.tab === 'tb' && (
        <Split>
          <Panel title={`Trial balance${ui.to ? ` as of ${ui.to}` : ''}`} actions={<Btn onClick={() => download('trial-balance.csv', [['Code', 'Account', 'Debit', 'Credit'], ...tb.rows.map((r) => [r.acc.code, r.acc.name, (r.debit / 100).toFixed(2), (r.credit / 100).toFixed(2)])].map((r) => r.join(',')).join('\r\n'), 'text/csv')}>⬇ CSV</Btn>}>
            <Table head={['Code', 'Account', 'Debit', 'Credit']} rows={tb.rows.map((r) => [r.acc.code, r.acc.name, r.debit ? m(r.debit) : '', r.credit ? m(r.credit) : ''])} foot={['', 'Totals', m(tb.dr), m(tb.cr)]} />
            {tb.dr === tb.cr ? <Note tone="ok">Debits equal credits. (A balanced trial balance doesn't catch entries posted to the wrong account.)</Note> : <Note tone="err">Out of balance by {m(Math.abs(tb.dr - tb.cr))}.</Note>}
          </Panel>
          <Panel title="Statements">
            <Table head={['Income statement', 'Amount']} rows={[['Revenue', m(s.revenue)], ['Expenses', m(s.expenses)]]} foot={['Net income', m(s.netIncome)]} />
            <Table head={['Balance sheet', 'Amount']} rows={[['Assets', m(s.assets)], ['Liabilities', m(s.liabilities)], ['Equity (capital − drawings)', m(s.equity)], ['Retained earnings (profit to date)', m(s.retained)]]} foot={['Liabilities + equity', m(s.liabilities + s.equity + s.retained)]} />
            {s.balanced ? <Note tone="ok">Assets = Liabilities + Equity ✓</Note> : <Note tone="err">The accounting equation doesn't hold — check account types.</Note>}
          </Panel>
        </Split>
      )}

      {ui.tab === 'accounts' && (
        <Panel title={`Chart of accounts (${accounts.length})`} actions={<Btn onClick={() => void saveAccounts([...accounts, { code: String(Math.max(...accounts.map((a) => Number(a.code) || 0)) + 10), name: 'New account', type: 'expense' }])}>+ Account</Btn>}>
          <Table
            head={['Code', 'Name', 'Type', 'Long-term', 'Contra', 'Balance', '']}
            rows={accounts.map((a, i) => {
              const ed = (p: Partial<Account>) => void saveAccounts(accounts.map((x, j) => (j === i ? { ...x, ...p } : x)))
              const bal = trialBalance([a], entries, ui.to || undefined).rows[0]
              return [
                <input key="c" value={a.code} onChange={(e) => !usedCodes.has(a.code) && ed({ code: e.target.value.trim() })} readOnly={usedCodes.has(a.code)} title={usedCodes.has(a.code) ? 'Code is used by entries' : undefined} style={{ width: 70 }} aria-label="Code" />,
                <input key="n" value={a.name} onChange={(e) => ed({ name: e.target.value })} aria-label="Name" />,
                <select key="t" value={a.type} onChange={(e) => ed({ type: e.target.value as AType })} aria-label="Type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>,
                a.type === 'asset' || a.type === 'liability' ? <input key="l" type="checkbox" checked={a.current === false} onChange={(e) => ed({ current: !e.target.checked })} aria-label="Long-term" /> : '',
                <input key="k" type="checkbox" checked={!!a.contra} onChange={(e) => ed({ contra: e.target.checked })} aria-label="Contra" />,
                bal ? (bal.debit ? `${m(bal.debit)} Dr` : `${m(bal.credit)} Cr`) : '–',
                <Btn key="x" kind="ghost" disabled={usedCodes.has(a.code)} title={usedCodes.has(a.code) ? 'Has postings' : 'Remove'} onClick={() => void saveAccounts(accounts.filter((_, j) => j !== i))}>✕</Btn>,
              ]
            })}
          />
          <Note>Codes with postings are locked. "Long-term" puts an asset or liability in the non-current section of the balance sheet export.</Note>
        </Panel>
      )}

      {ui.tab === 'io' && (
        <Split>
          <Panel title="Export">
            <Row>
              <Btn onClick={() => download('journal.csv', journalCsv(entries, accounts), 'text/csv')}>⬇ Journal CSV</Btn>
              <Btn onClick={() => download('ledger-backup.json', JSON.stringify({ accounts, entries }, null, 2), 'application/json')}>⬇ Full backup (JSON)</Btn>
            </Row>
            <p className="muted">Feed other tools in this toolbox:</p>
            <Row>
              <Btn onClick={() => download('for-balance-sheet-generator.csv', balanceSheetCsv(accounts, entries, ui.to || undefined), 'text/csv')}>⬇ Balance sheet CSV</Btn>
              <Btn onClick={() => download('for-profit-and-loss-builder.csv', plCsv(accounts, entries), 'text/csv')}>⬇ P&amp;L transactions CSV</Btn>
            </Row>
            <Note>The balance sheet CSV (Account, Section, Amount) opens in the Balance Sheet Generator; the transactions CSV (Date, Description, Amount, Category) opens in the Profit &amp; Loss Builder.</Note>
            <Btn kind="danger" onClick={() => { if (confirm('Delete all journal entries from this browser?')) void db.clear().then(reload) }}>Delete all entries</Btn>
          </Panel>
          <Panel title="Import">
            <FileDrop accept=".csv,.json,text/csv,application/json" label="Drop a journal CSV or a JSON backup" onFiles={async (f) => {
              const text = await f[0].text()
              if (f[0].name.endsWith('.json')) {
                try {
                  const d = JSON.parse(text) as { accounts?: Account[]; entries?: Entry[] }
                  if (d.accounts?.length) await saveAccounts(d.accounts)
                  if (d.entries) await db.put(d.entries)
                  setMsg({ tone: 'ok', text: `Restored ${d.entries?.length ?? 0} entries.` })
                } catch {
                  setMsg({ tone: 'err', text: 'Not a valid backup file.' })
                }
              } else {
                const r = importJournal(text, accounts)
                const good = r.entries.filter((e) => !validate(e, accounts).length).map((e) => ({ ...e, id: entries.some((x) => x.id === e.id) ? uid() : e.id }))
                await db.put(good)
                setMsg({ tone: r.errors.length ? 'warn' : 'ok', text: `Imported ${good.length} balanced entries.${r.errors.length ? ` Skipped/problems: ${r.errors.slice(0, 4).join(' ')}${r.errors.length > 4 ? ' …' : ''}` : ''}` })
              }
              await reload()
            }} />
            <Note>CSV columns are matched by name: Date, Entry (groups lines), Reference, Description, Account (code or name), Debit and Credit — or a single signed Amount (positive = debit). Unbalanced entries are skipped.</Note>
          </Panel>
        </Split>
      )}
    </div>
  )
}
