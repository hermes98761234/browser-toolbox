import { Bar, Btn, Check, CopyButton, Note, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { fit, graphemes, measure, PLATFORMS, sms, stats, type Platform } from './lib/character-limit-checker'

const SAMPLE = `🚀 Big news: our offline-first notes app is finally out of beta! After 14 months, 2,300 testers and way too much coffee ☕, version 1.0 ships today with end-to-end sync, Markdown tables and a dark mode you'll actually like. Try it free → https://example.com/notes-launch #buildinpublic #productivity`

const DEF = {
  text: SAMPLE,
  primary: 'x',
  selected: ['x', 'threads', 'bluesky', 'li', 'ig', 'desc', 'sms'],
  words: true,
  ellipsis: true,
}

const GROUPS = [...new Set(PLATFORMS.map((p) => p.group))]

function tone(used: number, limit: number) {
  const r = used / limit
  return r > 1 ? 'var(--err)' : r > 0.9 ? 'var(--warn, #f59e0b)' : 'var(--ok)'
}

/** Splits text into the part that fits and the overflow (grapheme-safe). */
function splitAt(text: string, p: Platform): [string, string] {
  const m = measure(text, p)
  if (m.used <= m.limit) return [text, '']
  const head = fit(text, p)
  return [head, text.slice(head.length)]
}

export default function CharacterLimitChecker() {
  const [s, set, reset] = useToolState('character-limit-checker', DEF)
  const st = stats(s.text)
  const primary = PLATFORMS.find((p) => p.id === s.primary) ?? PLATFORMS[0]
  const pm = measure(s.text, primary)
  const left = pm.limit - pm.used
  const [ok, over] = splitAt(s.text, primary)
  const sm = sms(s.text)
  const chosen = PLATFORMS.filter((p) => s.selected.includes(p.id))
  const failing = chosen.filter((p) => { const m = measure(s.text, p); return m.used > m.limit })
  const toggle = (id: string) => set({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })
  const longWords = graphemes(s.text).length ? (s.text.match(/\S{40,}/g) ?? []) : []

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Your text"
          actions={
            <>
              <CopyButton text={s.text} />
              <Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <textarea className="k-area" rows={8} value={s.text} onChange={(e) => set({ text: e.target.value })} placeholder="Type or paste your post, title or message…" aria-label="Text" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <Bar value={pm.used} max={pm.limit} color={tone(pm.used, pm.limit)} />
            </div>
            <b style={{ color: tone(pm.used, pm.limit), fontVariantNumeric: 'tabular-nums' }}>{pm.used} / {pm.limit}</b>
          </div>
          <Row>
            <Select
              label="Check against"
              value={s.primary}
              onChange={(primary) => set({ primary })}
              options={PLATFORMS.map((p) => [p.id, `${p.name} · ${p.limit}`] as [string, string])}
            />
          </Row>
          {primary.note && <p className="k-hint">{primary.name}: {primary.note}.</p>}
          {over ? (
            <>
              <Note tone="err">
                {-left} over the {primary.name} limit. The red part below would be cut off or rejected.
              </Note>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, border: '1px solid var(--line)', borderRadius: 10, fontSize: 14, lineHeight: 1.5 }}>
                <span>{ok}</span>
                <mark style={{ background: 'rgba(239,68,68,.22)', color: 'inherit', textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,.6)' }}>{over}</mark>
              </div>
              <Row>
                <Check label="Cut at a word" value={s.words} onChange={(words) => set({ words })} />
                <Check label="Add …" value={s.ellipsis} onChange={(ellipsis) => set({ ellipsis })} />
                <Btn kind="primary" onClick={() => set({ text: fit(s.text, primary, { words: s.words, ellipsis: s.ellipsis }) })}>✂ Trim to fit</Btn>
              </Row>
            </>
          ) : (
            <Note tone="ok">Fits {primary.name} with {left} to spare.</Note>
          )}
        </Panel>
        <Stats>
          <Stat label="Characters" value={st.graphemes} sub="what you see (graphemes)" />
          <Stat label="Words" value={st.words} sub={`${st.lines} line${st.lines === 1 ? '' : 's'}`} />
          <Stat label="UTF-16 units" value={st.utf16} sub="JavaScript .length" />
          <Stat label="UTF-8 bytes" value={st.bytes} sub={`${st.codePoints} code points`} />
        </Stats>
        <Panel title="SMS">
          <Row>
            <span>Encoding <b>{sm.encoding}</b></span>
            <span>Segments <b style={{ color: sm.segments > 1 ? 'var(--warn, #f59e0b)' : undefined }}>{sm.segments}</b></span>
            <span>{sm.units} units · {sm.perSegment} per segment</span>
          </Row>
          {sm.encoding === 'UCS-2' && (
            <p className="k-hint">
              Unicode mode (70 chars per SMS) is triggered by: {sm.nonGsm.slice(0, 12).map((c) => (c === ' ' ? '␣' : c)).join(' ')}
              {sm.nonGsm.length > 12 ? ' …' : ''}. Replace them to get 160 per SMS.
            </p>
          )}
        </Panel>
        {(st.emoji > 0 || longWords.length > 0) && (
          <Panel title="Tips">
            {st.emoji > 0 && <p className="k-hint">{st.emoji} emoji: each one shows as 1 character but counts as 2 on X and as 2–11 UTF-16 units on platforms that count code units (Instagram, LinkedIn).</p>}
            {longWords.length > 0 && <p className="k-hint">Very long unbroken strings ({longWords.length}) may be wrapped or shortened by some apps.</p>}
          </Panel>
        )}
      </div>

      <div>
        <Panel title={`Platforms · ${failing.length ? `${failing.length} over` : 'all fit'}`}>
          {GROUPS.map((g) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div className="k-label" style={{ marginBottom: 4 }}>{g}</div>
              {PLATFORMS.filter((p) => p.group === g).map((p) => {
                const m = measure(s.text, p)
                const on = s.selected.includes(p.id)
                return (
                  <div key={p.id} style={{ padding: '4px 0', opacity: on ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={`Track ${p.name}`} />
                      <button type="button" onClick={() => set({ primary: p.id })} style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', fontWeight: p.id === s.primary ? 800 : 500 }} title={p.note}>
                        {p.name}
                      </button>
                      <span style={{ color: on ? tone(m.used, m.limit) : undefined, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {m.used > m.limit ? `−${m.used - m.limit}` : m.limit - m.used}
                      </span>
                    </div>
                    {on && <Bar value={m.used} max={m.limit} color={tone(m.used, m.limit)} />}
                  </div>
                )
              })}
            </div>
          ))}
          <p className="k-hint">Number = characters left (negative = over). Click a name to check against it. Each platform counts the way it really does: graphemes, UTF-16 units, X weighted length or UTF-8 bytes.</p>
        </Panel>
      </div>
    </Split>
  )
}
