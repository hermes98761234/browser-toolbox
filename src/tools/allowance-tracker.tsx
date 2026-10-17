import { useState } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, money, num, uid, useToolState } from '../kit'
import { addDays, balances, history, JARS, type Jar, projectSavings, round2, type Split as SplitT, splitAmount, type Tx, weeksDue, weeksToGoal } from './lib/allowance-tracker'

interface Child { id: string; name: string; emoji: string; allowance: number; split: SplitT; interest: number; goalName: string; goal: number; lastPaid: string; lastInterest: string; txs: Tx[] }

const localDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const JAR: Record<Jar, { label: string; icon: string; color: string }> = {
  save: { label: 'Save', icon: '🐷', color: '#10b981' },
  spend: { label: 'Spend', icon: '🛍️', color: '#6366f1' },
  give: { label: 'Give', icon: '💝', color: '#ec4899' },
}

function sample(name: string, emoji: string, allowance: number, split: SplitT, goalName: string, goal: number, behind: number, spends: [number, number, string][]): Child {
  const t0 = localDay()
  const txs: Tx[] = []
  const weeks = 10
  for (let w = weeks; w >= behind; w--) {
    const d = addDays(t0, -7 * w)
    const parts = splitAmount(allowance, split)
    for (const j of JARS) txs.push({ id: uid(), date: d, jar: j, amount: parts[j], note: 'Weekly allowance', kind: 'allowance' })
    if (w === 6) txs.push({ id: uid(), date: addDays(d, 1), jar: 'save', amount: 20, note: 'Birthday money from Grandma', kind: 'gift' })
    if (w === 5) txs.push({ id: uid(), date: addDays(d, 2), jar: 'save', amount: 0.45, note: 'Interest from Bank of Mom & Dad', kind: 'interest' })
    if (w === 3) txs.push({ id: uid(), date: addDays(d, 3), jar: 'give', amount: -3, note: 'Animal shelter donation', kind: 'donate' })
  }
  for (const [w, a, n] of spends) txs.push({ id: uid(), date: addDays(t0, -7 * w + 2), jar: 'spend', amount: -a, note: n, kind: 'spend' })
  return { id: uid(), name, emoji, allowance, split, interest: 2, goalName, goal, lastPaid: addDays(t0, -7 * behind), lastInterest: addDays(t0, -7 * 5 + 2), txs }
}

const DEF = {
  currency: '$',
  sel: 0,
  kids: [
    sample('Mia', '🦊', 8, { save: 50, spend: 40, give: 10 }, 'LEGO set', 80, 1, [[8, 4.5, 'Comic book'], [5, 6, 'Movie snacks'], [2, 3.25, 'Stickers']]),
    sample('Leo', '🐢', 5, { save: 40, spend: 50, give: 10 }, 'Skateboard', 60, 0, [[9, 2, 'Candy'], [7, 7.5, 'Toy car'], [4, 3, 'Ice cream'], [1, 4, 'Trading cards']]),
  ] as Child[],
}

export default function AllowanceTracker() {
  const [s, set, reset] = useToolState('allowance-tracker', DEF)
  const [amt, setAmt] = useState(5)
  const [note, setNote] = useState('')
  const [act, setAct] = useState<'spend' | 'add' | 'move'>('spend')
  const [jar, setJar] = useState<Jar>('spend')
  const [to, setTo] = useState<Jar>('save')
  const [horizon, setHorizon] = useState(26)
  const m = (x: number) => money(x, s.currency)
  const kid = s.kids[Math.min(s.sel, s.kids.length - 1)]
  if (!kid) return <Btn onClick={reset}>Restore sample family</Btn>
  const day = localDay()
  const bal = balances(kid.txs)
  const total = bal.save + bal.spend + bal.give
  const due = weeksDue(kid.lastPaid, day)
  const weeklySave = splitAmount(kid.allowance, kid.split).save
  const wk = weeksToGoal(bal.save, weeklySave, kid.interest, kid.goal)
  const proj = projectSavings(bal.save, weeklySave, kid.interest, horizon)
  const projNo = projectSavings(bal.save, weeklySave, 0, horizon)
  const hist = history(kid.txs)
  const splitSum = kid.split.save + kid.split.spend + kid.split.give
  const monthsSinceInterest = Math.floor(weeksDue(kid.lastInterest, day) / 4.345)

  const edit = (p: Partial<Child> | ((c: Child) => Child)) => set({ kids: s.kids.map((c) => (c.id === kid.id ? (typeof p === 'function' ? p(c) : { ...c, ...p }) : c)) })
  const addTx = (txs: Omit<Tx, 'id'>[], extra: Partial<Child> = {}) => edit((c) => ({ ...c, ...extra, txs: [...c.txs, ...txs.map((t) => ({ ...t, id: uid(), amount: round2(t.amount) }))] }))

  const payAllowance = () => {
    const txs: Omit<Tx, 'id'>[] = []
    const weeks = Math.max(1, due)
    for (let w = 0; w < weeks; w++) {
      const parts = splitAmount(kid.allowance, kid.split)
      const d = due ? addDays(kid.lastPaid, 7 * (w + 1)) : day
      for (const j of JARS) if (parts[j]) txs.push({ date: d, jar: j, amount: parts[j], note: 'Weekly allowance', kind: 'allowance' })
    }
    addTx(txs, { lastPaid: due ? addDays(kid.lastPaid, 7 * weeks) : day })
  }
  const payInterest = () => {
    const months = Math.max(1, monthsSinceInterest)
    const amount = bal.save * (Math.pow(1 + kid.interest / 100, months) - 1)
    if (amount > 0) addTx([{ date: day, jar: 'save', amount, note: `Interest ${kid.interest}% × ${months} mo`, kind: 'interest' }], { lastInterest: day })
  }
  const doAction = () => {
    if (!(amt > 0)) return
    if (act === 'add') {
      const parts = jar === 'save' || jar === 'spend' || jar === 'give' ? { save: 0, spend: 0, give: 0, [jar]: amt } : splitAmount(amt, kid.split)
      addTx(JARS.filter((j) => parts[j]).map((j) => ({ date: day, jar: j, amount: parts[j], note: note || 'Extra money', kind: 'gift' as const })))
    } else if (act === 'spend') {
      addTx([{ date: day, jar, amount: -amt, note: note || (jar === 'give' ? 'Donation' : 'Purchase'), kind: jar === 'give' ? 'donate' : 'spend' }])
    } else if (jar !== to) {
      addTx([
        { date: day, jar, amount: -amt, note: `Moved to ${JAR[to].label}`, kind: 'transfer' },
        { date: day, jar: to, amount: amt, note: `Moved from ${JAR[jar].label}`, kind: 'transfer' },
      ])
    }
    setNote('')
  }
  const over = (act === 'spend' || act === 'move') && amt > bal[jar] + 1e-9

  return (
    <div>
      <Row>
        <Seg value={String(kid.id)} onChange={(id) => set({ sel: s.kids.findIndex((c) => c.id === id) })} options={s.kids.map((c) => [c.id, `${c.emoji} ${c.name}`] as const)} />
        <Btn onClick={() => set({ kids: [...s.kids, { ...sample('New kid', '⭐', 5, { save: 50, spend: 40, give: 10 }, 'Something special', 50, 0, []), txs: [] }], sel: s.kids.length })}>+ Child</Btn>
        <span style={{ flex: 1 }} />
        <CsvButton name={`${kid.name}-allowance.csv`} rows={() => [['Date', 'Jar', 'Amount', 'Type', 'Note'], ...[...kid.txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.jar, t.amount, t.kind, t.note])]} />
        <JsonButtons name="allowance-tracker.json" data={s} onLoad={(d) => d && Array.isArray(d.kids) && set(d)} />
      </Row>
      <Stats>
        {JARS.map((j) => (
          <Stat key={j} label={`${JAR[j].icon} ${JAR[j].label} jar`} value={m(bal[j])} sub={`${kid.split[j]}% of allowance`} tone={j === 'save' ? 'good' : undefined} />
        ))}
        <Stat label="Total" value={m(total)} sub={`${m(kid.allowance)} per week`} tone="accent" />
      </Stats>
      <Split>
        <div>
          <Panel title="Payday">
            {due > 0 ? <Note tone="warn">{kid.name} is owed {due} week{due > 1 ? 's' : ''} of allowance ({m(due * kid.allowance)}).</Note> : <Note tone="ok">Allowance is up to date (last paid {kid.lastPaid}).</Note>}
            <Row>
              <Btn kind="primary" onClick={payAllowance}>💵 Pay {due > 1 ? `${due} weeks` : 'allowance'} ({m(Math.max(1, due) * kid.allowance)})</Btn>
              <Btn onClick={payInterest} disabled={!(kid.interest > 0) || bal.save <= 0}>🏦 Pay interest ({m(bal.save * (Math.pow(1 + kid.interest / 100, Math.max(1, monthsSinceInterest)) - 1))})</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Allowance is split automatically: {JARS.map((j) => `${JAR[j].label} ${m(splitAmount(kid.allowance, kid.split)[j])}`).join(' · ')}.</p>
          </Panel>
          <Panel title="Money in & out">
            <Seg value={act} onChange={setAct} options={[['spend', 'Spend / give'], ['add', 'Add money'], ['move', 'Move']]} />
            <Row>
              <Num label="Amount" value={amt} onChange={setAmt} min={0.01} unit={s.currency} />
              <Select label={act === 'move' ? 'From jar' : 'Jar'} value={jar} onChange={setJar} options={JARS.map((j) => [j, `${JAR[j].icon} ${JAR[j].label}`] as const)} />
              {act === 'move' && <Select label="To jar" value={to} onChange={setTo} options={JARS.map((j) => [j, `${JAR[j].icon} ${JAR[j].label}`] as const)} />}
            </Row>
            {act !== 'move' && <Txt label="What for?" value={note} onChange={setNote} placeholder={act === 'add' ? 'Chores, gift from aunt…' : 'Book, snack, charity…'} />}
            {over && <Note tone="err">Only {m(bal[jar])} in the {JAR[jar].label} jar.</Note>}
            <Btn kind="primary" onClick={doAction} disabled={over || !(amt > 0) || (act === 'move' && jar === to)}>
              {act === 'spend' ? 'Record spending' : act === 'add' ? 'Add money' : 'Move money'}
            </Btn>
          </Panel>
          <Panel title={`${kid.emoji} ${kid.name}'s settings`}>
            <Row>
              <Txt label="Name" value={kid.name} onChange={(name) => edit({ name })} />
              <Txt label="Emoji" value={kid.emoji} onChange={(emoji) => edit({ emoji: emoji.slice(0, 4) })} />
            </Row>
            <Row>
              <Num label="Weekly allowance" value={kid.allowance} min={0} unit={s.currency} onChange={(allowance) => edit({ allowance })} />
              <Num label="Interest on Save" value={kid.interest} min={0} max={50} unit="%/mo" onChange={(interest) => edit({ interest })} />
            </Row>
            <Row>
              {JARS.map((j) => <Num key={j} label={`${JAR[j].icon} ${JAR[j].label}`} value={kid.split[j]} min={0} max={100} unit="%" onChange={(v) => edit({ split: { ...kid.split, [j]: v } })} />)}
            </Row>
            {splitSum !== 100 && <Note tone="warn">Split adds up to {splitSum}%; amounts are scaled proportionally.</Note>}
            <Row>
              <Txt label="Saving for" value={kid.goalName} onChange={(goalName) => edit({ goalName })} />
              <Num label="Goal" value={kid.goal} min={0} unit={s.currency} onChange={(goal) => edit({ goal })} />
            </Row>
            <Row>
              <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
              <Btn kind="danger" onClick={() => confirm(`Remove ${kid.name} and all their history?`) && set({ kids: s.kids.filter((c) => c.id !== kid.id), sel: 0 })}>Remove child</Btn>
              <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
            </Row>
          </Panel>
        </div>
        <div>
          <Panel title={`🎯 Saving for: ${kid.goalName}`}>
            <Row wrap={false}>
              <b style={{ flex: 1 }}>{m(bal.save)} of {m(kid.goal)}</b>
              <span>{num(Math.min(100, (bal.save / (kid.goal || 1)) * 100), 0)}%</span>
            </Row>
            <Bar value={bal.save} max={kid.goal || 1} color="#10b981" />
            <p>
              {wk === 0 ? '🎉 Goal reached! Time to buy it (or set a new one).' : Number.isFinite(wk) ? <>About <b>{wk} weeks</b> to go (around {addDays(day, wk * 7)}), saving {m(weeklySave)} a week{kid.interest > 0 && ` plus ${kid.interest}% monthly interest`}.</> : 'Add to the Save jar share to reach this goal.'}
            </p>
            <LineChart
              series={[
                { name: 'With interest', points: proj.map((v, i) => [i, v]), color: '#10b981', area: true },
                { name: 'No interest', points: projNo.map((v, i) => [i, v]), color: '#94a3b8', dashed: true },
                { name: 'Goal', points: [[0, kid.goal], [horizon, kid.goal]], color: '#f59e0b', dashed: true },
              ]}
              xLabel="weeks from now"
              fy={(v) => m(v)}
              height={220}
            />
            <Row>
              <Seg value={String(horizon)} onChange={(v) => setHorizon(Number(v))} options={[['13', '3 mo'], ['26', '6 mo'], ['52', '1 yr'], ['104', '2 yrs']]} />
              <span className="muted" style={{ fontSize: 13 }}>Interest earned in this time: {m(proj[horizon] - projNo[horizon])}</span>
            </Row>
          </Panel>
          <Panel title="Jar balances over time">
            <LineChart series={JARS.map((j) => ({ name: JAR[j].label, points: hist[j], color: JAR[j].color }))} fx={(v) => new Date(v * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} fy={(v) => m(v)} height={220} />
          </Panel>
          <Panel title="Ledger">
            <Table
              head={['Date', 'Jar', 'Amount', 'Note', '']}
              rows={[...kid.txs].sort((a, b) => b.date.localeCompare(a.date)).map((t) => [
                t.date,
                `${JAR[t.jar].icon} ${JAR[t.jar].label}`,
                <b key="a" style={{ color: t.amount < 0 ? 'var(--err)' : 'var(--ok)' }}>{t.amount > 0 ? '+' : ''}{m(t.amount)}</b>,
                t.note,
                <Btn key="x" kind="ghost" onClick={() => edit({ txs: kid.txs.filter((x) => x.id !== t.id) })} title="Delete">✕</Btn>,
              ])}
              max={15}
            />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
