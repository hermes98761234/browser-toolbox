import { Bar, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'

interface Envelope {
  id: string
  name: string
  group: string
  planned: number
  spent: number
}

interface State {
  currency: string
  income: number
  extra: number
  envelopes: Envelope[]
}

const GROUPS = ['Needs', 'Wants', 'Savings & debt'] as const

const DEF: State = {
  currency: '$',
  income: 4200,
  extra: 300,
  envelopes: [
    { id: 'rent', name: 'Rent / mortgage', group: 'Needs', planned: 1400, spent: 1400 },
    { id: 'util', name: 'Utilities', group: 'Needs', planned: 220, spent: 184 },
    { id: 'food', name: 'Groceries', group: 'Needs', planned: 550, spent: 412 },
    { id: 'trans', name: 'Transport', group: 'Needs', planned: 180, spent: 96 },
    { id: 'ins', name: 'Insurance', group: 'Needs', planned: 160, spent: 160 },
    { id: 'dine', name: 'Eating out', group: 'Wants', planned: 220, spent: 251 },
    { id: 'fun', name: 'Fun & hobbies', group: 'Wants', planned: 150, spent: 60 },
    { id: 'subs', name: 'Subscriptions', group: 'Wants', planned: 45, spent: 45 },
    { id: 'emerg', name: 'Emergency fund', group: 'Savings & debt', planned: 500, spent: 500 },
    { id: 'ret', name: 'Retirement', group: 'Savings & debt', planned: 600, spent: 600 },
    { id: 'debt', name: 'Extra debt payment', group: 'Savings & debt', planned: 300, spent: 300 },
  ],
}

const RULE: Record<string, number> = { Needs: 0.5, Wants: 0.3, 'Savings & debt': 0.2 }

export default function MonthlyBudgetPlanner() {
  const [s, set, reset] = useToolState('monthly-budget-planner', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const total = s.income + s.extra
  const planned = s.envelopes.reduce((a, e) => a + e.planned, 0)
  const spent = s.envelopes.reduce((a, e) => a + e.spent, 0)
  const left = total - planned
  const edit = (id: string, patch: Partial<Envelope>) => set({ envelopes: s.envelopes.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const byGroup = GROUPS.map((g) => ({ g, v: s.envelopes.filter((e) => e.group === g).reduce((a, e) => a + e.planned, 0) }))

  return (
    <Split>
      <div>
        <Panel title="Income">
          <Row>
            <Num label="Take-home pay" value={s.income} onChange={(income) => set({ income })} unit={s.currency} min={0} />
            <Num label="Other income" value={s.extra} onChange={(extra) => set({ extra })} unit={s.currency} min={0} />
          </Row>
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
        </Panel>
        <Panel title="Zero-based check">
          {left === 0 ? (
            <Note tone="ok">Every unit of income has a job. This is a zero-based budget. ✓</Note>
          ) : left > 0 ? (
            <Note tone="warn">
              {m(left)} is still unassigned. Give it a job: savings, debt or a sinking fund.
            </Note>
          ) : (
            <Note tone="err">You planned {m(-left)} more than you earn. Trim some envelopes.</Note>
          )}
          <Btn kind="primary" disabled={left <= 0} onClick={() => edit('emerg', { planned: (s.envelopes.find((e) => e.id === 'emerg')?.planned ?? 0) + left })}>
            Put the rest into Emergency fund
          </Btn>
        </Panel>
        <Panel title="50 / 30 / 20 comparison">
          {byGroup.map(({ g, v }) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <Row wrap={false}>
                <b style={{ flex: 1 }}>{g}</b>
                <span>
                  {pct(v / (total || 1), 0)} <span className="muted">/ target {pct(RULE[g], 0)}</span>
                </span>
              </Row>
              <Bar value={v / (total || 1)} max={1} color={v / (total || 1) > RULE[g] + 0.05 && g !== 'Savings & debt' ? 'var(--warn)' : 'var(--accent)'} />
            </div>
          ))}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Income" value={m(total)} />
          <Stat label="Planned" value={m(planned)} sub={pct(planned / (total || 1), 0) + ' of income'} />
          <Stat label="To assign" value={m(left)} tone={left === 0 ? 'good' : left < 0 ? 'bad' : 'accent'} />
          <Stat label="Spent so far" value={m(spent)} sub={`${m(planned - spent)} left in envelopes`} />
        </Stats>
        <Panel
          title="Envelopes"
          actions={
            <>
              <Btn onClick={() => set({ envelopes: [...s.envelopes, { id: uid(), name: 'New envelope', group: 'Wants', planned: 0, spent: 0 }] })}>+ Envelope</Btn>
              <CsvButton name="budget.csv" rows={() => [['Envelope', 'Group', 'Planned', 'Spent', 'Remaining'], ...s.envelopes.map((e) => [e.name, e.group, e.planned, e.spent, e.planned - e.spent])]} />
              <JsonButtons name="budget.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Envelope', 'Group', 'Planned', 'Spent', 'Remaining', '']}
            rows={s.envelopes.map((e) => {
              const rem = e.planned - e.spent
              return [
                <input key="n" value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} aria-label="Envelope name" />,
                <select key="g" value={e.group} onChange={(ev) => edit(e.id, { group: ev.target.value })} aria-label="Group">
                  {GROUPS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>,
                <input key="p" type="number" min={0} value={e.planned} onChange={(ev) => edit(e.id, { planned: Math.max(0, Number(ev.target.value) || 0) })} aria-label="Planned" style={{ width: 90 }} />,
                <input key="s" type="number" min={0} value={e.spent} onChange={(ev) => edit(e.id, { spent: Math.max(0, Number(ev.target.value) || 0) })} aria-label="Spent" style={{ width: 90 }} />,
                <div key="r" style={{ minWidth: 110 }}>
                  <div style={{ color: rem < 0 ? 'var(--err)' : undefined, fontWeight: 700 }}>{m(rem)}</div>
                  <Bar value={e.spent} max={e.planned || 1} color={rem < 0 ? 'var(--err)' : 'var(--ok)'} />
                </div>,
                <Btn key="x" kind="ghost" onClick={() => set({ envelopes: s.envelopes.filter((x) => x.id !== e.id) })} title="Remove">
                  ✕
                </Btn>,
              ]
            })}
            foot={['Total', '', m(planned), m(spent), m(planned - spent), '']}
          />
        </Panel>
        <Panel title="Where the money goes">
          <Donut slices={s.envelopes.filter((e) => e.planned > 0).map((e) => ({ label: e.name, value: e.planned }))} fv={m} center={<span>{m(planned)}</span>} />
        </Panel>
      </div>
    </Split>
  )
}
