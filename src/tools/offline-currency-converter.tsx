import { useState } from 'react'
import { Btn, CopyButton, CsvButton, Note, num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { ageDays, ageText, BUNDLED_DATE, convert, cross, DECIMALS, effective, evalAmount, NAMES, overrideFromCross, parseApi, type Rates } from './lib/offline-currency-converter'

interface Fetched { date: string; at: number; rates: Rates }
interface State { amount: string; from: string; to: string; shown: string[]; fetched: Fetched | null; overrides: Rates; overrideAt: number }

const DEF: State = { amount: '100', from: 'EUR', to: 'USD', shown: ['USD', 'GBP', 'JPY', 'CHF', 'PLN', 'UAH', 'CAD', 'AUD'], fetched: null, overrides: {}, overrideAt: 0 }
const API = 'https://api.frankfurter.app/latest'
const nowMs = () => Date.now()
const QUICK = [1, 5, 10, 20, 50, 100, 200, 500, 1000]

const fmtC = (v: number, cur: string) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: DECIMALS[cur] ?? 2, maximumFractionDigits: DECIMALS[cur] ?? 2 }) : '—')
const fmtRate = (v: number) => (!Number.isFinite(v) ? '—' : v >= 100 ? num(v, 2) : v >= 1 ? num(v, 4) : v.toPrecision(4))

export default function OfflineCurrencyConverter() {
  const [s, set] = useToolState<State>('offline-currency-converter', DEF)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [add, setAdd] = useState('')

  const rates = effective(s.fetched?.rates ?? null, s.overrides)
  const codes = Object.keys(rates).sort()
  const opts = codes.map((c) => [c, `${c} · ${NAMES[c] ?? c}`] as const)
  const amt = evalAmount(s.amount)
  const out = convert(amt, s.from, s.to, rates)
  const src = (c: string): ['manual' | 'fetched' | 'bundled', string] =>
    s.overrides[c] ? ['manual', 'manual'] : c === 'EUR' ? [s.fetched ? 'fetched' : 'bundled', 'base'] : s.fetched?.rates[c] ? ['fetched', s.fetched.date] : ['bundled', BUNDLED_DATE]
  const rateAge = s.fetched ? ageDays(s.fetched.date) : ageDays(BUNDLED_DATE)
  const pairSrc = [src(s.from)[0], src(s.to)[0]]
  const usesBundled = pairSrc.includes('bundled')

  const update = async () => {
    setBusy(true)
    setMsg(null)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 10000)
    try {
      const r = await fetch(API, { signal: ctl.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const p = parseApi(await r.json())
      if (!p) throw new Error('unexpected response')
      set({ fetched: { date: p.date, at: nowMs(), rates: p.rates } })
      setMsg({ tone: 'ok', text: `Updated: ${Object.keys(p.rates).length} reference rates dated ${p.date}.` })
    } catch (e) {
      setMsg({ tone: 'err', text: `Couldn’t update (${navigator.onLine === false ? 'you appear to be offline' : (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message}). Still using the ${s.fetched ? 'cached' : 'bundled'} rates.` })
    } finally {
      clearTimeout(timer)
      setBusy(false)
    }
  }

  const setOverride = (c: string, perFrom: number) => {
    const o = { ...s.overrides }
    const v = overrideFromCross(perFrom, s.from, rates)
    if (perFrom > 0 && Number.isFinite(v)) o[c] = v
    else delete o[c]
    set({ overrides: o, overrideAt: nowMs() })
  }
  const clearOverride = (c: string) => {
    const o = { ...s.overrides }
    delete o[c]
    set({ overrides: o })
  }

  const table = [...new Set([s.to, ...s.shown])].filter((c) => c !== s.from && rates[c])

  return (
    <Split>
      <div>
        <Panel title="Convert">
          <Txt label="Amount (you can type 12.5*3)" value={s.amount} onChange={(amount) => set({ amount })} />
          <Row wrap={false}>
            <Select label="From" value={s.from} onChange={(from) => set({ from })} options={opts} />
            <div style={{ alignSelf: 'end', paddingBottom: 4 }}><Btn onClick={() => set({ from: s.to, to: s.from })} title="Swap">⇄</Btn></div>
            <Select label="To" value={s.to} onChange={(to) => set({ to })} options={opts} />
          </Row>
          <div style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 2px', wordBreak: 'break-word' }}>
            {fmtC(out, s.to)} <span style={{ color: 'var(--accent)' }}>{s.to}</span>
          </div>
          <div className="muted">{Number.isFinite(amt) ? `${fmtC(amt, s.from)} ${s.from}` : 'Enter a number'} · 1 {s.from} = {fmtRate(cross(s.from, s.to, rates))} {s.to} · 1 {s.to} = {fmtRate(cross(s.to, s.from, rates))} {s.from}</div>
          <Row><CopyButton text={() => `${fmtC(amt, s.from)} ${s.from} = ${fmtC(out, s.to)} ${s.to}`} label="Copy result" /></Row>
          {usesBundled && <Note tone="warn">This pair uses <b>bundled reference rates from {BUNDLED_DATE}</b> — they are stale and only a rough guide. Press “Update rates” when online, or enter your own rate.</Note>}
        </Panel>
        <Panel title="Rates source" actions={<Btn kind="primary" onClick={update} disabled={busy}>{busy ? 'Updating…' : '↻ Update rates'}</Btn>}>
          {s.fetched ? (
            <p style={{ margin: 0 }}>
              Reference rates dated <b>{s.fetched.date}</b> ({ageText(rateAge)}), fetched {ageText(ageDays(s.fetched.at))} from frankfurter.app (European Central Bank data) and cached on this device.
            </p>
          ) : (
            <p style={{ margin: 0 }}>Using <b>bundled reference rates from {BUNDLED_DATE}</b> ({ageText(rateAge)}). Nothing is downloaded unless you press “Update rates”.</p>
          )}
          {rateAge > 7 && <Note tone="warn">Rates are {ageText(rateAge).replace(' ago', '')} old. Fine for rough budgeting, not for actual transactions.</Note>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>
            Reference rates are mid-market; banks, card networks and exchange booths add a spread of roughly 1–10 %. ECB data covers ~30 major currencies and is published on working days — currencies it doesn’t cover (e.g. UAH) stay on the bundled value until you set a manual rate.
            {Object.keys(s.overrides).length > 0 && <> Manual rates: {Object.keys(s.overrides).join(', ')}{s.overrideAt ? ` (last edited ${ageText(ageDays(s.overrideAt))})` : ''}.</>}
          </p>
          <Row>
            {s.fetched && <Btn kind="ghost" onClick={() => set({ fetched: null })}>Forget fetched rates</Btn>}
            {Object.keys(s.overrides).length > 0 && <Btn kind="ghost" onClick={() => set({ overrides: {} })}>Clear manual rates</Btn>}
          </Row>
        </Panel>
        <Panel title={`Pocket table ${s.from} → ${s.to}`}>
          <Table head={[s.from, s.to, '', s.to, s.from]} rows={QUICK.map((q) => [fmtC(q, s.from), <b key="a">{fmtC(convert(q, s.from, s.to, rates), s.to)}</b>, '', fmtC(q, s.to), <b key="b">{fmtC(convert(q, s.to, s.from, rates), s.from)}</b>])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Rates as of" value={s.fetched ? s.fetched.date : BUNDLED_DATE} sub={s.fetched ? 'fetched & cached' : 'bundled · stale'} tone={s.fetched && rateAge <= 7 ? 'good' : 'bad'} />
          <Stat label="Currencies" value={codes.length} sub={`${Object.keys(s.overrides).length} manual`} />
          <Stat label="Pair source" value={pairSrc[0] === pairSrc[1] ? pairSrc[0] : `${pairSrc[0]} / ${pairSrc[1]}`} />
        </Stats>
        <Panel title={`${Number.isFinite(amt) ? fmtC(amt, s.from) : '—'} ${s.from} in other currencies`} actions={<CsvButton name="currency-table.csv" rows={() => [['Currency', `Amount (${fmtC(amt, s.from)} ${s.from})`, `Rate per 1 ${s.from}`, 'Source'], ...table.map((c) => [c, convert(amt, s.from, c, rates).toFixed(DECIMALS[c] ?? 2), cross(s.from, c, rates).toPrecision(6), src(c)[0]])]} />}>
          <Table
            head={['Currency', 'Amount', `1 ${s.from} =`, 'Source', '']}
            rows={table.map((c) => {
              const [kind, when] = src(c)
              return [
                <span key="c"><b>{c}</b> <span className="muted" style={{ fontSize: 12 }}>{NAMES[c] ?? ''}</span></span>,
                <b key="a">{fmtC(convert(amt, s.from, c, rates), c)}</b>,
                <RateInput key={`r${c}${s.from}${rates[c]}`} value={cross(s.from, c, rates)} onCommit={(v) => setOverride(c, v)} />,
                <span key="s" style={{ fontSize: 12, color: kind === 'manual' ? 'var(--accent)' : kind === 'bundled' ? 'var(--warn)' : 'var(--ok)' }}>{kind}{kind !== 'manual' ? ` · ${when}` : ''}{kind === 'manual' && <> <a href="#" onClick={(e) => { e.preventDefault(); clearOverride(c) }}>reset</a></>}</span>,
                <Btn key="x" kind="ghost" title="Remove from table" onClick={() => set({ shown: s.shown.filter((x) => x !== c) })}>✕</Btn>,
              ]
            })}
          />
          <Row>
            <Select label="Add currency" value={add} onChange={(v) => { setAdd(''); if (v && !s.shown.includes(v)) set({ shown: [...s.shown, v] }) }} options={[['', 'Choose…'], ...codes.filter((c) => !s.shown.includes(c) && c !== s.from).map((c) => [c, `${c} · ${NAMES[c] ?? c}`] as const)]} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Edit any rate to set a manual override (e.g. the rate on your bank receipt or at a local exchange). Overrides are stored on this device and win over bundled and fetched rates.</p>
        </Panel>
        <Note>
          Offline-first: the converter works without a connection using the cached or bundled table. The only network request is the optional “Update rates” call to api.frankfurter.app (keyless, no personal data sent).
        </Note>
      </div>
    </Split>
  )
}

/** Rate cell: edits locally, commits on blur / Enter. */
function RateInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [t, setT] = useState(Number.isFinite(value) ? String(Number(value.toPrecision(6))) : '')
  const commit = () => {
    const v = Number(t.replace(',', '.'))
    if (Number.isFinite(v) && v > 0 && Math.abs(v - value) / value > 1e-6) onCommit(v)
  }
  return <input type="text" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} style={{ width: 110, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px', background: 'transparent', color: 'inherit' }} aria-label="Rate" title="Edit to set a manual rate" />
}
