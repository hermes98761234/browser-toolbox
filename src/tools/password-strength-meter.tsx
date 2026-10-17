import { useMemo, useState } from 'react'
import { Btn, Check, CopyButton, fmt, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { charsetBits, estimate, feedback, humanTime, type Match } from './lib/password-strength-meter'

const SCORE = [
  ['Very weak', '#ef4444'],
  ['Weak', '#f97316'],
  ['Fair', '#eab308'],
  ['Strong', '#22c55e'],
  ['Very strong', '#10b981'],
] as const
const PAT_COLOR: Record<Match['pattern'], string> = { dictionary: '#a855f7', spatial: '#0ea5e9', repeat: '#f97316', sequence: '#f59e0b', year: '#ec4899', date: '#ec4899', bruteforce: '#64748b' }
const SCENARIOS: [string, string, number][] = [
  ['Online, throttled', '100 guesses / hour (rate-limited login)', 100 / 3600],
  ['Online, unthrottled', '10 guesses / second', 10],
  ['Offline, slow hash', 'bcrypt / scrypt / Argon2 — 10k / second', 1e4],
  ['Offline, fast hash', 'unsalted SHA-1 / MD5 on GPUs — 10 billion / second', 1e10],
]
const EXAMPLES = ['password', 'P@ssw0rd2024', 'qwertyuiop', 'Tr0ub4dor&3', 'correct horse battery staple', 'sunshine1985', 'Xq7!vR2#mL9$wK4p']

const LOWER = 'abcdefghijklmnopqrstuvwxyz', UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS = '0123456789', SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~'
const CONS = 'bdfghjklmnprstvz', VOW = 'aeiou'

/** Unbiased random integer in [0, n) via rejection sampling. */
function rnd(n: number): number {
  const buf = new Uint32Array(1)
  const lim = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(buf)
  while (buf[0] >= lim)
  return buf[0] % n
}

const DEF = { mode: 'password' as 'password' | 'phrase', len: 18, lower: true, upper: true, digits: true, symbols: true, noAmbig: false, words: 5, sep: '-', digit: true }

export default function PasswordStrengthMeter() {
  const [g, set] = useToolState('password-strength-meter', DEF) // generator options only — the password itself is never stored
  const [pw, setPw] = useState('P@ssw0rd2024')
  const [show, setShow] = useState(true)
  const [gen, setGen] = useState('')

  const e = useMemo(() => estimate(pw.slice(0, 128)), [pw])
  const fb = feedback(e, pw)
  const bits = Math.log2(Math.max(1, e.guesses))
  const naive = charsetBits(pw)

  let pool = (g.lower ? LOWER : '') + (g.upper ? UPPER : '') + (g.digits ? DIGITS : '') + (g.symbols ? SYMBOLS : '')
  if (g.noAmbig) pool = [...pool].filter((c) => !'Il1O0o|'.includes(c)).join('')
  const genBits = g.mode === 'password' ? g.len * Math.log2(pool.length || 1) : g.words * Math.log2(CONS.length ** 2 * VOW.length ** 2) + (g.digit ? Math.log2(10 * g.words) : 0)
  const generate = () => {
    if (g.mode === 'password') {
      if (!pool) return
      setGen(Array.from({ length: g.len }, () => pool[rnd(pool.length)]).join(''))
    } else {
      const words = Array.from({ length: g.words }, () => CONS[rnd(16)] + VOW[rnd(5)] + CONS[rnd(16)] + VOW[rnd(5)])
      if (g.digit) { const k = rnd(words.length); words[k] += String(rnd(10)) }
      setGen(words.join(g.sep))
    }
  }

  const checks: [string, boolean][] = [
    ['12+ characters', pw.length >= 12],
    ['Lowercase letter', /[a-z]/.test(pw)],
    ['Uppercase letter', /[A-Z]/.test(pw)],
    ['Digit', /\d/.test(pw)],
    ['Symbol', /[^a-zA-Z0-9]/.test(pw)],
    ['No common words or names', !e.sequence.some((m) => m.pattern === 'dictionary')],
    ['No keyboard walks, sequences or repeats', !e.sequence.some((m) => ['spatial', 'sequence', 'repeat'].includes(m.pattern))],
  ]

  return (
    <Split>
      <div>
        <Panel title="Password">
          <div className="k-input" style={{ display: 'flex' }}>
            <input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(ev) => setPw(ev.target.value)}
              placeholder="Type a password…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Password"
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 18 }}
            />
            <button type="button" className="k-btn ghost" onClick={() => setShow(!show)}>{show ? '🙈 Hide' : '👁 Show'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, margin: '12px 0 6px' }}>
            {SCORE.map((_, i) => <span key={i} style={{ height: 8, borderRadius: 4, background: pw && i <= e.score ? SCORE[e.score][1] : 'var(--line)' }} />)}
          </div>
          <Row wrap={false}>
            <b style={{ flex: 1, color: pw ? SCORE[e.score][1] : undefined, fontSize: 18 }}>{pw ? SCORE[e.score][0] : '—'}</b>
            <span className="muted">score {pw ? e.score : '–'} / 4</span>
          </Row>
          {pw && fb.warning && <Note tone="warn">{fb.warning}</Note>}
          {pw && fb.tips.map((t) => <Note key={t}>{t}</Note>)}
          <Note tone="ok">🔒 Checked entirely in your browser — the password is not sent anywhere and not saved.</Note>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>Try:</span>
            {EXAMPLES.map((x) => <Btn key={x} kind="ghost" onClick={() => setPw(x)}>{x}</Btn>)}
          </div>
        </Panel>
        <Panel title="Generator" actions={<Seg value={g.mode} onChange={(mode) => set({ mode })} options={[['password', 'Random'], ['phrase', 'Passphrase']]} />}>
          {g.mode === 'password' ? (
            <>
              <Slider label="Length" value={g.len} min={6} max={64} onChange={(len) => set({ len })} />
              <Row>
                <Check label="a–z" value={g.lower} onChange={(lower) => set({ lower })} />
                <Check label="A–Z" value={g.upper} onChange={(upper) => set({ upper })} />
                <Check label="0–9" value={g.digits} onChange={(digits) => set({ digits })} />
                <Check label="!@#…" value={g.symbols} onChange={(symbols) => set({ symbols })} />
                <Check label="Avoid look-alikes (Il1O0)" value={g.noAmbig} onChange={(noAmbig) => set({ noAmbig })} />
              </Row>
            </>
          ) : (
            <>
              <Slider label="Words" value={g.words} min={3} max={10} onChange={(words) => set({ words })} />
              <Row>
                <Seg value={g.sep} onChange={(sep) => set({ sep })} options={[['-', 'a-b'], ['.', 'a.b'], [' ', 'a b'], ['_', 'a_b']]} />
                <Check label="Add a digit" value={g.digit} onChange={(digit) => set({ digit })} />
              </Row>
              <p className="muted" style={{ fontSize: 12 }}>Pronounceable 4-letter words (consonant-vowel-consonant-vowel, 6,400 possibilities each) from a cryptographic RNG.</p>
            </>
          )}
          <Row>
            <Btn kind="primary" onClick={generate} disabled={g.mode === 'password' && !pool}>🎲 Generate</Btn>
            <span className="muted">{fmt(genBits, 3)} bits of entropy</span>
          </Row>
          {gen && (
            <div style={{ marginTop: 8 }}>
              <code className="mono" style={{ display: 'block', padding: 10, borderRadius: 8, background: 'var(--panel2)', wordBreak: 'break-all', fontSize: 16 }}>{gen}</code>
              <Row>
                <CopyButton text={gen} />
                <Btn onClick={() => setPw(gen)}>Test it ↑</Btn>
              </Row>
            </div>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated guesses" value={pw ? `10^${fmt(e.log10, 3)}` : '—'} sub={pw ? `≈ ${fmt(bits, 3)} bits` : ''} tone="accent" />
          <Stat label="Naive charset entropy" value={`${fmt(naive, 3)} bits`} sub="length × log₂(pool) — ignores patterns" />
          <Stat label="Length" value={pw.length} sub={`${new Set(pw).size} unique characters`} />
        </Stats>
        <Panel title="Time to crack">
          <Table head={['Attack', 'Rate', 'Time']} rows={SCENARIOS.map(([n, d, rate]) => {
            const sec = e.guesses / 2 / rate
            return [<b key="n">{n}</b>, <span key="d" className="muted" style={{ fontSize: 12 }}>{d}</span>, <b key="t" style={{ color: sec < 3600 * 24 ? 'var(--err)' : sec < 3.15e7 * 100 ? 'var(--warn)' : 'var(--ok)' }}>{pw ? humanTime(sec) : '—'}</b>]
          })} />
          <p className="muted" style={{ fontSize: 12 }}>Average time = half the estimated guesses ÷ attack rate. The estimate follows zxcvbn: the cheapest way to cover the password with known patterns.</p>
        </Panel>
        <Panel title="How an attacker would see it">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontFamily: 'var(--mono)', fontSize: 18, marginBottom: 10 }}>
            {e.sequence.map((m, k) => (
              <span key={k} title={m.detail} style={{ padding: '2px 6px', borderRadius: 6, background: PAT_COLOR[m.pattern] + '33', borderBottom: `3px solid ${PAT_COLOR[m.pattern]}`, whiteSpace: 'pre' }}>{show ? m.token : '•'.repeat(m.token.length)}</span>
            ))}
          </div>
          <Table head={['Part', 'Pattern', 'Detail', 'Guesses']} rows={e.sequence.map((m) => [
            <span key="t" className="mono">{show ? m.token : '•'.repeat(m.token.length)}</span>,
            <span key="p" style={{ color: PAT_COLOR[m.pattern], fontWeight: 700 }}>{m.pattern}</span>,
            m.detail,
            m.guesses > 1e6 ? `10^${fmt(Math.log10(m.guesses), 3)}` : fmt(m.guesses, 4),
          ])} />
        </Panel>
        <Panel title="Checklist">
          {checks.map(([t, ok]) => <div key={t} style={{ padding: '3px 0', color: ok ? 'var(--ok)' : 'var(--muted)' }}>{ok ? '✓' : '○'} {t}</div>)}
        </Panel>
      </div>
    </Split>
  )
}
