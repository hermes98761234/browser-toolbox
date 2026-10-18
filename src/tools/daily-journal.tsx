import { useEffect, useRef, useState } from 'react'
import { Area, Bar, Btn, Check, download, JsonButtons, LineChart, Note, Panel, Row, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { createVault, openVault, promptIndex, putItem, streak, strength, words, type Entry, type Vault } from './lib/daily-journal'

const PROMPTS = [
  'What made you smile today, even briefly?', 'Which small task did you finish that future-you will thank you for?', 'Describe one sound you noticed today.',
  'What drained your energy today, and what restored it?', 'Who did you think about today, and why?', 'What is one thing you would do differently if today restarted?',
  'Write about a moment when you felt completely present.', 'What are you looking forward to this week?', 'Name three things you are grateful for and one reason for each.',
  'What did you learn today that surprised you?', 'Which worry took up space today? How likely is it, honestly?', 'Describe your surroundings right now in five details.',
  'What would a kind friend say about how you handled today?', 'What did your body need today? Did it get it?', 'Which habit are you building, and how did it go today?',
  'Write a short note to yourself one year from now.', 'What conversation stayed with you today?', 'What felt easier today than it used to?',
  'If today had a title, what would it be?', 'What is something you are avoiding? What is the first tiny step?', 'Which choice today reflected your values?',
  'What made you curious today?', 'Describe a meal, a walk or a cup of tea from today as if it were a scene in a film.', 'What did you say yes to, and what did you say no to?',
  'Where did you feel tension today? Where did you feel ease?', 'What would make tomorrow ten percent better?', 'What is a compliment you received or gave recently?',
  'Which problem is quietly getting smaller?', 'What did you create, fix or tidy today?', 'What does rest look like for you this week?',
  'Write about something you changed your mind about.', 'What are you proud of that nobody else noticed?', 'Which emotion visited most often today?',
  'What would you like to remember about this season of your life?', 'What can you let go of before you sleep tonight?', 'Describe a place where you feel calm.',
]
const MOODS = [
  { v: 1, e: '😞', l: 'Rough', c: '#ef4444' }, { v: 2, e: '😕', l: 'Low', c: '#f97316' }, { v: 3, e: '😐', l: 'Okay', c: '#eab308' },
  { v: 4, e: '🙂', l: 'Good', c: '#22c55e' }, { v: 5, e: '😄', l: 'Great', c: '#16a34a' },
]
const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const TODAY = isoLocal(new Date())
const shift = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

const sampleEntry = (n: number, mood: number, tags: string[], text: string): Entry => {
  const date = shift(TODAY, -n)
  return { id: uid(), date, mood, tags, prompt: PROMPTS[promptIndex(date, PROMPTS.length)], text, updated: date }
}
const DEF = {
  entries: [
    sampleEntry(5, 3, ['work'], 'Long meeting day. I kept drifting off during the planning call, then had a good idea for the onboarding checklist while making tea. Wrote it down before it vanished.'),
    sampleEntry(4, 4, ['walk', 'friends'], 'Walked along the river with Sam after work. We talked about learning to cook properly. Agreed to try one new recipe each week and swap notes.'),
    sampleEntry(3, 2, ['sleep'], 'Slept badly and felt it all day. Skipped the gym and felt guilty, but honestly the rest was the right call. Early night tonight.'),
    sampleEntry(2, 4, ['cooking'], 'First recipe swap: a lentil soup with too much cumin. Still good. Sam made flatbread that puffed up perfectly and sent a very proud photo.'),
    sampleEntry(1, 5, ['walk', 'reading'], 'Bright cold morning. Read for half an hour before anyone else was awake, then a long walk. Felt light and unhurried for most of the day.'),
  ] as Entry[],
  vault: null as Vault | null,
  date: TODAY,
  extra: 0,
}

export default function DailyJournal() {
  const [s, set, reset] = useToolState('daily-journal', DEF)
  const [mem, setMem] = useState<Entry[] | null>(null) // decrypted entries while unlocked
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const dirty = useRef<Entry | null>(null)

  const encrypted = !!s.vault
  const locked = encrypted && !mem
  const list: Entry[] = encrypted ? (mem ?? []) : s.entries
  const cur = list.find((e) => e.date === s.date)
  const prompt = PROMPTS[(promptIndex(s.date, PROMPTS.length) + s.extra) % PROMPTS.length]

  // Seal the edited entry a moment after typing stops.
  useEffect(() => {
    if (!encrypted || !mem || !dirty.current) return
    const e = dirty.current
    const t = setTimeout(async () => {
      if (!key || !s.vault) return
      const vault = await putItem(s.vault, key, e)
      if (dirty.current === e) dirty.current = null
      set({ vault })
    }, 600)
    return () => clearTimeout(t)
  }, [mem, encrypted, s.vault, set, key])

  const upsert = (patch: Partial<Entry>) => {
    const base: Entry = cur ?? { id: uid(), date: s.date, mood: 3, tags: [], prompt, text: '', updated: '' }
    const e = { ...base, ...patch, updated: new Date().toISOString() }
    const next = [...list.filter((x) => x.id !== e.id), e].sort((a, b) => a.date.localeCompare(b.date))
    if (encrypted) {
      dirty.current = e
      setMem(next)
    } else set({ entries: next })
  }
  const remove = async () => {
    if (!cur) return
    const next = list.filter((x) => x.id !== cur.id)
    if (encrypted && s.vault) {
      setMem(next)
      set({ vault: { ...s.vault, items: s.vault.items.filter((i) => i.id !== cur.id) } })
    } else set({ entries: next })
  }

  const enable = async () => {
    setBusy('Deriving key (600,000 PBKDF2 rounds)…')
    setErr('')
    try {
      const { vault, key: k } = await createVault(pass, s.entries)
      setKey(k)
      setMem(s.entries)
      set({ vault, entries: [] })
      setPass('')
      setPass2('')
      setAck(false)
    } catch {
      setErr('Encryption failed: this browser lacks Web Crypto (needs HTTPS or localhost).')
    }
    setBusy('')
  }
  const unlock = async () => {
    if (!s.vault) return
    setBusy('Unlocking…')
    setErr('')
    try {
      const r = await openVault(pass, s.vault)
      setKey(r.key)
      setMem(r.entries)
      setPass('')
    } catch {
      setErr('Wrong passphrase.')
    }
    setBusy('')
  }
  const lock = () => {
    setKey(null)
    dirty.current = null
    setMem(null)
  }
  const disable = () => {
    if (!mem) return
    set({ entries: mem, vault: null })
    lock()
  }
  const changePass = async () => {
    if (!mem) return
    setBusy('Re-encrypting…')
    const { vault, key: k } = await createVault(pass, mem)
    setKey(k)
    set({ vault })
    setPass('')
    setPass2('')
    setBusy('')
  }

  const moodByDate = new Map(list.map((e) => [e.date, e.mood]))
  const last30 = Array.from({ length: 30 }, (_, i) => shift(TODAY, i - 29))
  const moodPts = last30.map((d, i) => [i - 29, moodByDate.get(d) ?? NaN] as [number, number]).filter(([, v]) => Number.isFinite(v))
  const avg = moodPts.length ? moodPts.reduce((a, [, v]) => a + v, 0) / moodPts.length : 0
  const allDates = encrypted ? (s.vault?.items.map((i) => i.date) ?? []) : s.entries.map((e) => e.date)
  const found = q.trim() ? list.filter((e) => (e.text + ' ' + e.tags.join(' ')).toLowerCase().includes(q.toLowerCase())) : []
  const bits = strength(pass)
  const month = s.date.slice(0, 7)
  const first = new Date(month + '-01T00:00:00Z')
  const lead = (first.getUTCDay() + 6) % 7
  const nDays = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const markdown = () => list.map((e) => `## ${e.date} ${MOODS[e.mood - 1]?.e ?? ''}\n\n*${e.prompt}*\n\n${e.text}\n${e.tags.length ? `\nTags: ${e.tags.join(', ')}\n` : ''}`).join('\n')

  const passForm = (label: string, action: () => void, confirm: boolean) => (
    <>
      <Txt label="Passphrase" type="password" value={pass} onChange={setPass} placeholder="at least 10 characters" />
      {confirm && <Txt label="Repeat passphrase" type="password" value={pass2} onChange={setPass2} />}
      {confirm && pass && <div className="muted" style={{ fontSize: 12 }}>Strength ≈ {bits} bits <Bar value={bits} max={90} color={bits < 45 ? '#ef4444' : bits < 65 ? '#f59e0b' : '#16a34a'} /></div>}
      {confirm && <Check label="I understand that a lost passphrase cannot be recovered — not by me, not by anyone." value={ack} onChange={setAck} />}
      <Btn kind="primary" disabled={!!busy || pass.length < (confirm ? 10 : 1) || (confirm && (pass !== pass2 || !ack))} onClick={action}>{label}</Btn>
    </>
  )

  return (
    <Split wide="left">
      <div>
        <Panel title={new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} actions={<>
          <Btn onClick={() => set({ date: shift(s.date, -1), extra: 0 })}>‹</Btn>
          <Btn kind="ghost" onClick={() => set({ date: TODAY, extra: 0 })}>Today</Btn>
          <Btn disabled={s.date >= TODAY} onClick={() => set({ date: shift(s.date, 1), extra: 0 })}>›</Btn>
        </>}>
          {locked ? (
            <Note tone="warn">🔒 Your journal is encrypted and locked. Enter your passphrase in the panel on the right to read and write.</Note>
          ) : (
            <>
              <div style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--panel))', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>Prompt</span>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{cur?.prompt || prompt}</div>
                {!cur?.text && <Btn kind="ghost" onClick={() => { set({ extra: s.extra + 1 }); if (cur) upsert({ prompt: PROMPTS[(promptIndex(s.date, PROMPTS.length) + s.extra + 1) % PROMPTS.length] }) }}>↻ Another prompt</Btn>}
              </div>
              <div className="k-label">Mood</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 10px' }}>
                {MOODS.map((m) => (
                  <button key={m.v} type="button" onClick={() => upsert({ mood: m.v })} title={m.l} aria-pressed={cur?.mood === m.v}
                    style={{ fontSize: 26, padding: '4px 10px', borderRadius: 12, cursor: 'pointer', border: `2px solid ${cur?.mood === m.v ? m.c : 'var(--line)'}`, background: cur?.mood === m.v ? `color-mix(in srgb, ${m.c} 18%, var(--panel))` : 'var(--panel)' }}>
                    {m.e}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.l}</div>
                  </button>
                ))}
              </div>
              <Area value={cur?.text ?? ''} onChange={(text) => upsert({ text, prompt: cur?.prompt || prompt })} rows={12} placeholder="Write freely — nobody else will read this." />
              <Txt label="Tags (comma separated)" value={cur?.tags.join(', ') ?? ''} onChange={(t) => upsert({ tags: t.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="walk, work, family" />
              <Row>
                <span className="muted">{words(cur?.text ?? '')} words{cur?.updated ? ` · saved ${new Date(cur.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{encrypted ? ' · 🔒 encrypted' : ''}</span>
                <Btn kind="danger" disabled={!cur} onClick={() => void remove()}>Delete entry</Btn>
              </Row>
            </>
          )}
        </Panel>
        {!locked && (
          <Panel title="Search">
            <Txt label="Find in entries" value={q} onChange={setQ} placeholder="word or tag" />
            {found.slice(0, 12).map((e) => (
              <button key={e.id} type="button" className="k-btn ghost" style={{ display: 'block', textAlign: 'left', width: '100%', marginBottom: 4 }} onClick={() => set({ date: e.date })}>
                <b>{e.date}</b> {MOODS[e.mood - 1]?.e} <span className="muted">{e.text.slice(0, 90)}{e.text.length > 90 ? '…' : ''}</span>
              </button>
            ))}
            {q && !found.length && <p className="muted">No matches.</p>}
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Entries" value={allDates.length} />
          <Stat label="Streak" value={`${streak(allDates, TODAY)} d`} tone="accent" />
          <Stat label="Mood (30 d)" value={avg ? `${MOODS[Math.round(avg) - 1].e} ${avg.toFixed(1)}` : '—'} />
        </Stats>
        <Panel title={first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 12, textAlign: 'center' }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="muted">{d}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: nDays }, (_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, '0')}`
              const m = moodByDate.get(d)
              const has = allDates.includes(d)
              return (
                <button key={d} type="button" disabled={d > TODAY} onClick={() => set({ date: d, extra: 0 })}
                  style={{ padding: '5px 0', borderRadius: 6, cursor: d > TODAY ? 'default' : 'pointer', border: d === s.date ? '2px solid var(--accent)' : '1px solid var(--line)', background: m ? `color-mix(in srgb, ${MOODS[m - 1].c} 35%, var(--panel))` : has ? 'var(--line)' : 'var(--panel)', color: 'inherit', opacity: d > TODAY ? 0.4 : 1 }}>
                  {i + 1}
                </button>
              )
            })}
          </div>
        </Panel>
        {!locked && moodPts.length > 1 && (
          <Panel title="Mood, last 30 days">
            <LineChart series={[{ name: 'Mood', points: moodPts, color: '#22c55e' }]} height={150} yMin={1} yMax={5} fx={(v) => (v === 0 ? 'today' : `${v}d`)} fy={(v) => MOODS[Math.round(v) - 1]?.e ?? ''} />
          </Panel>
        )}
        <Panel title="Privacy & encryption">
          {!encrypted && (
            <>
              <Note>Entries are stored only in this browser (localStorage). Turn on encryption so that anyone with access to this device or a backup file sees only ciphertext.</Note>
              {passForm('🔐 Encrypt journal', () => void enable(), true)}
            </>
          )}
          {locked && passForm('🔓 Unlock', () => void unlock(), false)}
          {encrypted && !locked && (
            <>
              <Note tone="ok">Encrypted with AES-256-GCM; key derived from your passphrase with PBKDF2-SHA256 ({s.vault?.iter.toLocaleString('en-US')} rounds). Only entry dates are stored in the clear.</Note>
              <Row>
                <Btn kind="primary" onClick={lock}>🔒 Lock now</Btn>
                <Btn kind="danger" onClick={disable}>Remove encryption</Btn>
              </Row>
              <details>
                <summary className="muted" style={{ cursor: 'pointer' }}>Change passphrase</summary>
                {passForm('Re-encrypt with new passphrase', () => void changePass(), true)}
              </details>
            </>
          )}
          {encrypted && <Note tone="warn">There is no reset or recovery: if you forget the passphrase, the entries are gone for good. Keep a backup of the passphrase somewhere safe.</Note>}
          {busy && <Note>{busy}</Note>}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <JsonButtons name={encrypted ? 'journal-encrypted.json' : 'journal.json'} data={s} onLoad={(x) => { if (x && (Array.isArray(x.entries) || x.vault)) { lock(); set({ ...DEF, ...x }) } }} />
            <Btn disabled={locked} onClick={() => download('journal.md', markdown(), 'text/markdown')}>⬇ Markdown</Btn>
            {!encrypted && <Btn kind="ghost" onClick={reset}>Sample</Btn>}
          </Row>
          <p className="k-hint">The JSON backup keeps entries encrypted when encryption is on. Markdown export is always plain text.</p>
        </Panel>
      </div>
    </Split>
  )
}
