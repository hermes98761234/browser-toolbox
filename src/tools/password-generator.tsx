import { useState } from 'react'
import { Btn, Check, CopyButton, Note, Num, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import {
  charEntropy, crackTime, estimateEntropy, generatePassphrase, generatePassword, generatePin, pools, strength, WORDS,
} from './lib/password-generator'

type Mode = 'chars' | 'phrase' | 'pin'

const DEF = {
  mode: 'chars' as Mode,
  length: 20, upper: true, lower: true, digits: true, symbols: true, symbolSet: '!@#$%^&*()-_=+[]{};:,.<>?/~', excludeAmbiguous: false, requireEach: true,
  words: 6, separator: '-', capitalize: true, addNumber: true, addSymbol: false,
  pinLength: 6, count: 5,
}
type S = typeof DEF

function makeAll(s: S): { list: string[]; bits: number } {
  const n = Math.max(1, Math.min(50, s.count))
  if (s.mode === 'chars') {
    const pool = new Set(pools(s).join('')).size
    return { list: Array.from({ length: n }, () => generatePassword(s)), bits: charEntropy(s.length, pool) }
  }
  if (s.mode === 'phrase') {
    const out = Array.from({ length: n }, () => generatePassphrase(s))
    return { list: out.map((o) => o.text), bits: out[0].bits }
  }
  return { list: Array.from({ length: n }, () => generatePin(s.pinLength)), bits: s.pinLength * Math.log2(10) }
}

function Meter({ bits }: { bits: number }) {
  const st = strength(bits)
  const c = st.tone === 'bad' ? 'var(--err)' : st.tone === 'accent' ? 'var(--warn)' : 'var(--ok)'
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0.15, 0.35, 0.55, 0.78, 1].map((t) => (
          <span key={t} style={{ flex: 1, height: 8, borderRadius: 4, background: st.level >= t ? c : 'var(--line)' }} />
        ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 13 }}>
        <b style={{ color: c }}>{st.label}</b> <span className="muted">· {num(bits, 1)} bits of entropy</span>
      </div>
    </div>
  )
}

export default function PasswordGenerator() {
  const [s, set, reset] = useToolState('password-generator', DEF)
  const [gen, setGen] = useState(() => makeAll(s))
  const [shown, setShown] = useState(true)
  const [test, setTest] = useState('')
  const upd = (p: Partial<S>) => {
    const next = { ...s, ...p }
    set(p)
    setGen(makeAll(next))
  }
  const st = strength(gen.bits)
  const est = estimateEntropy(test)
  const noSets = s.mode === 'chars' && !pools(s).length
  const mask = (p: string) => (shown ? p : '•'.repeat(Math.min(p.length, 32)))

  return (
    <div>
      <Stats>
        <Stat label="Entropy" value={`${num(gen.bits, 1)} bits`} tone={st.tone} sub={st.label} />
        <Stat label="Offline attack" value={crackTime(gen.bits, 1e10)} sub="10 billion guesses / s" />
        <Stat label="Online attack" value={crackTime(gen.bits, 1000)} sub="1,000 guesses / s" />
        <Stat label="Source" value="Web Crypto" sub="crypto.getRandomValues, unbiased" />
      </Stats>
      <Split>
        <div>
          <Panel title="Type">
            <Seg value={s.mode} onChange={(mode) => upd({ mode })} options={[['chars', 'Password'], ['phrase', 'Passphrase'], ['pin', 'PIN']]} />
          </Panel>
          {s.mode === 'chars' && (
            <Panel title="Password options">
              <Slider label="Length" value={s.length} onChange={(length) => upd({ length })} min={4} max={64} />
              <Row>
                <Check label="A–Z" value={s.upper} onChange={(upper) => upd({ upper })} />
                <Check label="a–z" value={s.lower} onChange={(lower) => upd({ lower })} />
                <Check label="0–9" value={s.digits} onChange={(digits) => upd({ digits })} />
                <Check label="Symbols" value={s.symbols} onChange={(symbols) => upd({ symbols })} />
              </Row>
              {s.symbols && <Txt label="Allowed symbols" value={s.symbolSet} onChange={(symbolSet) => upd({ symbolSet })} hint="Trim this list for sites that reject some symbols." />}
              <Check label="Exclude look-alikes (I l 1 | O 0 o and quotes)" value={s.excludeAmbiguous} onChange={(excludeAmbiguous) => upd({ excludeAmbiguous })} />
              <Check label="At least one character from each selected set" value={s.requireEach} onChange={(requireEach) => upd({ requireEach })} />
              {noSets && <Note tone="err">Select at least one character set.</Note>}
            </Panel>
          )}
          {s.mode === 'phrase' && (
            <Panel title="Passphrase options">
              <Slider label="Words" value={s.words} onChange={(words) => upd({ words })} min={3} max={12} />
              <Row>
                <Seg value={s.separator} onChange={(separator) => upd({ separator })} options={[['-', 'dash'], [' ', 'space'], ['.', 'dot'], ['_', 'underscore'], ['', 'none']]} />
              </Row>
              <Row>
                <Check label="Capitalize" value={s.capitalize} onChange={(capitalize) => upd({ capitalize })} />
                <Check label="Add a digit" value={s.addNumber} onChange={(addNumber) => upd({ addNumber })} />
                <Check label="Add a symbol" value={s.addSymbol} onChange={(addSymbol) => upd({ addSymbol })} />
              </Row>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Words come from a built-in list of {WORDS.length.toLocaleString()} short common words (6⁴ — four dice rolls per word), {num(Math.log2(WORDS.length), 2)} bits each. Six words ≈ 62 bits.
              </p>
            </Panel>
          )}
          {s.mode === 'pin' && (
            <Panel title="PIN options">
              <Slider label="Digits" value={s.pinLength} onChange={(pinLength) => upd({ pinLength })} min={4} max={12} />
              <Note tone="warn">PINs are only safe where the number of attempts is limited (phones, bank cards).</Note>
            </Panel>
          )}
          <Panel title="Test a password">
            <Txt label="Type or paste a password (stays in this tab)" value={test} onChange={setTest} type={shown ? 'text' : 'password'} />
            {test && (
              <>
                <Meter bits={est.bits} />
                <p style={{ fontSize: 13, margin: '6px 0' }}>Guessing offline: <b>{crackTime(est.bits, 1e10)}</b></p>
                {est.notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}
                <p className="muted" style={{ fontSize: 12 }}>Rough estimate from character classes and length; human-chosen passwords are usually weaker than this suggests.</p>
              </>
            )}
          </Panel>
        </div>
        <div>
          <Panel
            title="Generated"
            actions={
              <>
                <Btn kind="primary" onClick={() => setGen(makeAll(s))}>↻ Regenerate</Btn>
                <Btn onClick={() => setShown(!shown)}>{shown ? '🙈 Hide' : '👁 Show'}</Btn>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {gen.list.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: i === 0 ? 'var(--panel2)' : undefined }}>
                  <code style={{ flex: 1, fontSize: i === 0 ? 20 : 15, fontFamily: 'var(--mono)', wordBreak: 'break-all', fontWeight: i === 0 ? 700 : 500 }}>
                    {[...mask(p)].map((ch, k) => (
                      <span key={k} style={{ color: !shown ? undefined : /[0-9]/.test(ch) ? '#0ea5e9' : /[^a-zA-Z0-9\s]/.test(ch) ? '#f97316' : undefined }}>{ch}</span>
                    ))}
                  </code>
                  <CopyButton text={p} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Meter bits={gen.bits} />
            </div>
            <Row>
              <Num label="How many" value={s.count} onChange={(count) => upd({ count: Math.max(1, Math.min(50, Math.round(count))) })} min={1} max={50} step={1} />
              <CopyButton label="Copy all" text={() => gen.list.join('\n')} />
              <Btn kind="ghost" onClick={() => {
                reset()
                setGen(makeAll(DEF))
              }}>Reset</Btn>
            </Row>
          </Panel>
          <Panel title="Good practice">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
              <li>Use a different password for every site and keep them in a password manager.</li>
              <li>Aim for 70+ bits for important accounts; a 6-word passphrase or a 14-character random password gets you there.</li>
              <li>Turn on two-factor authentication wherever possible.</li>
              <li>Nothing here is sent or stored: passwords live only in this tab and disappear on reload.</li>
            </ul>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
