import { useState } from 'react'
import { Btn, FileDrop, JsonButtons, Note, num, Panel, Ring, Row, Seg, Split, Stat, Stats, Txt, today, uid, useToolState } from '../kit'
import { addDays, age, CAT_ICON, CATS, days, PRESETS, status, winAnsi, wrap, type Cat, type Preset } from './lib/milestone-tracker'

interface Done { date: string; note: string; photo?: string }
interface State { name: string; birth: string; cover?: string; done: Record<string, Done>; custom: Preset[]; view: 'list' | 'timeline' | 'chart'; cat: Cat | 'All'; sel: string }

const T = today()
const BIRTH = addDays(T, -420)
const at = (mo: number) => addDays(BIRTH, Math.round(mo * 30.44))
const DEF: State = {
  name: 'Maya', birth: BIRTH, view: 'list', cat: 'All', sel: 'steps', custom: [{ id: 'c-beach', cat: 'Firsts', title: 'First trip to the seaside', from: 0, to: 0 }],
  done: {
    hands: { date: at(3.1), note: '' }, faces: { date: at(3.3), note: '' }, pass: { date: at(6.1), note: '' }, night: { date: at(6.5), note: 'Finally! Six hours straight.' },
    name: { date: at(7.4), note: '' }, stranger: { date: at(8.8), note: '' }, pincer: { date: at(9.7), note: 'Peas, one by one.' }, cruise: { date: at(11.6), note: '' },
    smile: { date: at(1.4), note: 'Grinned at Grandma during the video call.' }, coo: { date: at(2), note: '' }, head: { date: at(2.2), note: '' },
    laugh: { date: at(3.6), note: 'Big belly laugh at the cat sneezing.' }, grasp: { date: at(3.9), note: '' }, roll: { date: at(4.5), note: 'Rolled off the play mat while we watched!' },
    solids: { date: at(5.6), note: 'Sweet potato. Mostly ended up on the bib.' }, babble: { date: at(6.3), note: '' }, sit: { date: at(6.8), note: '' },
    tooth: { date: at(7.2), note: 'Bottom front tooth, after three grumpy nights.' }, peek: { date: at(7.8), note: '' }, crawl: { date: at(8.4), note: 'Backwards first, then forwards a week later.' },
    pull: { date: at(9.1), note: '' }, wave: { date: at(10.2), note: '' }, word: { date: at(11.3), note: '"Dada" — clearly at Dad.' }, 'c-beach': { date: at(12.5), note: 'Hated the sand, loved the waves.' },
    steps: { date: at(13.1), note: 'Three wobbly steps from the sofa to Mum.' },
  },
}
const ST: Record<string, [string, string]> = { done: ['Done', '#10b981'], upcoming: ['Upcoming', '#64748b'], window: ['In typical range', '#0ea5e9'], later: ['Not recorded', '#94a3b8'] }

async function shrink(f: File, max = 640): Promise<string> {
  const img = await createImageBitmap(f)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}
const dataBytes = (url: string) => Uint8Array.from(atob(url.split(',')[1] ?? ''), (c) => c.charCodeAt(0))

export default function MilestoneTracker() {
  const [s, set, reset] = useToolState<State>('milestone-tracker', DEF)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const all = [...PRESETS, ...s.custom]
  const nowAge = age(s.birth, T)
  const sel = all.find((m) => m.id === s.sel)
  const doneList = all.filter((m) => s.done[m.id]).sort((a, b) => s.done[a.id].date.localeCompare(s.done[b.id].date))
  const shown = all.filter((m) => s.cat === 'All' || m.cat === s.cat)
  const setDone = (id: string, d: Done | null) => {
    const next = { ...s.done }
    if (d) next[id] = d
    else delete next[id]
    set({ done: next })
  }
  const size = JSON.stringify(s).length
  const custom = (m: Preset) => m.id.startsWith('c-')

  const book = async () => {
    setBusy(true); setErr('')
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdf = await PDFDocument.create()
      pdf.setTitle(`${s.name} - milestones`)
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
      const [PW, PH, M] = [420, 595, 36]
      const accent = rgb(0.39, 0.4, 0.95), grey = rgb(0.4, 0.42, 0.47), ink = rgb(0.1, 0.1, 0.15)
      const img = async (url?: string) => { if (!url) return null; try { return url.startsWith('data:image/png') ? await pdf.embedPng(dataBytes(url)) : await pdf.embedJpg(dataBytes(url)) } catch { return null } }
      // cover
      const cover = pdf.addPage([PW, PH])
      cover.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.97, 0.96, 1) })
      for (let i = 0; i < 9; i++) cover.drawCircle({ x: 40 + ((i * 97) % 360), y: 60 + ((i * 53) % 120), size: 10 + (i % 4) * 8, color: [accent, rgb(0.96, 0.62, 0.04), rgb(0.06, 0.73, 0.5)][i % 3], opacity: 0.18 })
      const cimg = await img(s.cover)
      if (cimg) {
        const k = Math.min(300 / cimg.width, 260 / cimg.height)
        cover.drawImage(cimg, { x: (PW - cimg.width * k) / 2, y: 280, width: cimg.width * k, height: cimg.height * k })
      }
      const title = winAnsi(`${s.name || 'Baby'}'s milestones`)
      cover.drawText(title, { x: (PW - bold.widthOfTextAtSize(title, 26)) / 2, y: cimg ? 236 : 360, size: 26, font: bold, color: ink })
      const sub = winAnsi(`Born ${s.birth} - ${doneList.length} moments recorded`)
      cover.drawText(sub, { x: (PW - font.widthOfTextAtSize(sub, 12)) / 2, y: cimg ? 212 : 336, size: 12, font, color: grey })
      // pages
      let page = pdf.addPage([PW, PH]), y = PH - M, n = 2
      const foot = () => page.drawText(String(n), { x: PW / 2 - 4, y: 18, size: 9, font, color: grey })
      for (const m of doneList) {
        const d = s.done[m.id]
        const im = await img(d.photo)
        const k = im ? Math.min((PW - 2 * M) / im.width, 230 / im.height) : 0
        const lines = d.note ? wrap(winAnsi(d.note), PW - 2 * M, (t) => ital.widthOfTextAtSize(t, 11)) : []
        const h = (im ? im.height * k + 12 : 0) + 44 + lines.length * 15 + 18
        if (y - h < M) { foot(); page = pdf.addPage([PW, PH]); y = PH - M; n++ }
        page.drawRectangle({ x: M - 8, y: y - h + 8, width: 4, height: h - 12, color: accent })
        if (im) { page.drawImage(im, { x: M, y: y - im.height * k, width: im.width * k, height: im.height * k }); y -= im.height * k + 12 }
        page.drawText(winAnsi(m.title), { x: M, y: y - 16, size: 15, font: bold, color: ink })
        page.drawText(winAnsi(`${d.date}  -  age ${age(s.birth, d.date).label}  -  ${m.cat}`), { x: M, y: y - 34, size: 10, font, color: grey })
        y -= 44
        for (const l of lines) { page.drawText(l, { x: M, y: y - 12, size: 11, font: ital, color: ink }); y -= 15 }
        y -= 18
      }
      foot()
      const bytes = await pdf.save()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      a.download = `${(s.name || 'baby').replace(/\W+/g, '_')}-memory-book.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (e) { setErr(`Could not build the PDF: ${(e as Error).message}`) }
    setBusy(false)
  }

  // chart geometry
  const maxMo = Math.max(36, Math.ceil(nowAge.exact + 2))
  const CW = 640, rowH = 18, left = 210
  const cx = (mo: number) => left + (Math.min(mo, maxMo) / maxMo) * (CW - left - 10)
  const chartRows = shown.filter((m) => !custom(m))

  return (
    <Split wide="right">
      <div>
        <Panel title="Baby">
          <Row>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Txt label="Birth date" type="date" value={s.birth} onChange={(birth) => birth && set({ birth })} />
          </Row>
          <Row>
            {s.cover && <img src={s.cover} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />}
            <FileDrop accept="image/*" onFiles={(f) => shrink(f[0]).then((cover) => set({ cover }), () => setErr('Could not read that image.'))} label={s.cover ? 'Replace cover photo' : 'Add a cover photo'} />
          </Row>
          <p style={{ margin: '6px 0' }}>Today {s.name || 'baby'} is <b>{nowAge.label}</b> old.</p>
        </Panel>
        <Panel title="Progress">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-around' }}>
            {CATS.map((c) => {
              const list = all.filter((m) => m.cat === c)
              const d = list.filter((m) => s.done[m.id]).length
              return (
                <div key={c} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => set({ cat: c })}>
                  <Ring value={d / (list.length || 1)} size={78} label={`${d}/${list.length}`} />
                  <div style={{ fontSize: 12 }}>{CAT_ICON[c]} {c}</div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Memory book & data">
          <Btn kind="primary" disabled={busy || !doneList.length} onClick={() => void book()}>{busy ? 'Building…' : '📖 Download memory book (PDF)'}</Btn>
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <JsonButtons name="milestones.json" data={s} onLoad={(d) => d && d.done && set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Everything stays in this browser ({num(size / 1024, 0)} KB of ~5 MB). Photos are resized to 640 px. Back up now and then.</p>
          {size > 3_800_000 && <Note tone="warn">Storage nearly full: download a backup and remove some photos.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Age" value={nowAge.label} sub={`born ${s.birth}`} tone="accent" />
          <Stat label="Milestones recorded" value={doneList.length} sub={`of ${all.length}`} />
          <Stat label="Latest" value={doneList.at(-1) ? age(s.birth, s.done[doneList.at(-1)!.id].date).label : '—'} sub={doneList.at(-1)?.title ?? 'nothing yet'} />
          <Stat label="Photos" value={Object.values(s.done).filter((d) => d.photo).length + (s.cover ? 1 : 0)} />
        </Stats>
        <Panel title="Milestones" actions={<>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['list', 'Checklist'], ['timeline', 'Timeline'], ['chart', 'Age chart']]} />
        </>}>
          <Row>
            {(['All', ...CATS] as (Cat | 'All')[]).map((c) => <Btn key={c} kind={s.cat === c ? 'primary' : 'ghost'} onClick={() => set({ cat: c })}>{c === 'All' ? 'All' : `${CAT_ICON[c]} ${c}`}</Btn>)}
          </Row>
          {s.view === 'list' && (
            <>
              {shown.map((m) => {
                const st = status(m.from, m.to, nowAge.exact, !!s.done[m.id])
                return (
                  <div key={m.id} onClick={() => set({ sel: m.id })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: m.id === s.sel ? 'var(--line)' : undefined }}>
                    <input type="checkbox" checked={!!s.done[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setDone(m.id, e.target.checked ? { date: T, note: '' } : null)} aria-label={m.title} />
                    <span style={{ flex: 1 }}>{CAT_ICON[m.cat]} {m.title}</span>
                    {!custom(m) && <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{m.from}–{m.to} mo</span>}
                    <span style={{ fontSize: 12, fontWeight: 700, color: ST[st][1], minWidth: 96, textAlign: 'right' }}>{s.done[m.id] ? age(s.birth, s.done[m.id].date).label : custom(m) ? '' : ST[st][0]}</span>
                  </div>
                )
              })}
              <Row>
                <Txt label="Add your own milestone" value={newTitle} onChange={setNewTitle} placeholder="First swim, first snow, …" />
                <Btn disabled={!newTitle.trim()} onClick={() => { const id = `c-${uid()}`; set({ custom: [...s.custom, { id, cat: 'Firsts', title: newTitle.trim(), from: 0, to: 0 }], sel: id }); setNewTitle('') }}>+ Add</Btn>
              </Row>
            </>
          )}
          {s.view === 'timeline' && (
            <div style={{ borderLeft: '3px solid var(--accent)', marginLeft: 8, paddingLeft: 16 }}>
              {doneList.filter((m) => s.cat === 'All' || m.cat === s.cat).map((m) => {
                const d = s.done[m.id]
                return (
                  <div key={m.id} onClick={() => set({ sel: m.id })} style={{ position: 'relative', marginBottom: 14, cursor: 'pointer' }}>
                    <span style={{ position: 'absolute', left: -25, top: 2, width: 14, height: 14, borderRadius: 7, background: 'var(--accent)', border: '3px solid var(--panel)' }} />
                    <div className="muted" style={{ fontSize: 12 }}>{d.date} · {age(s.birth, d.date).label}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {d.photo ? <img src={d.photo} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: 30 }}>{CAT_ICON[m.cat]}</span>}
                      <div><b>{m.title}</b>{d.note && <div style={{ fontSize: 14 }}>{d.note}</div>}</div>
                    </div>
                  </div>
                )
              })}
              {!doneList.length && <Note>Tick a milestone to start the timeline.</Note>}
            </div>
          )}
          {s.view === 'chart' && (
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${CW} ${chartRows.length * rowH + 30}`} style={{ width: '100%', minWidth: 520 }} role="img" aria-label="Milestones by age">
                {Array.from({ length: Math.floor(maxMo / 6) + 1 }, (_, i) => i * 6).map((mo) => (
                  <g key={mo}>
                    <line x1={cx(mo)} x2={cx(mo)} y1={14} y2={chartRows.length * rowH + 16} stroke="var(--line)" />
                    <text x={cx(mo)} y={10} fontSize={10} textAnchor="middle" fill="currentColor">{mo} mo</text>
                  </g>
                ))}
                {chartRows.map((m, i) => {
                  const y = 18 + i * rowH
                  const d = s.done[m.id]
                  return (
                    <g key={m.id} onClick={() => set({ sel: m.id })} style={{ cursor: 'pointer' }}>
                      <text x={left - 6} y={y + 10} fontSize={10} textAnchor="end" fill="currentColor">{m.title.slice(0, 34)}</text>
                      <rect x={cx(m.from)} y={y + 2} width={Math.max(3, cx(m.to) - cx(m.from))} height={rowH - 6} rx={4} fill="#0ea5e9" opacity={0.25} />
                      {d && <circle cx={cx(age(s.birth, d.date).exact)} cy={y + rowH / 2 - 1} r={5} fill="#10b981" stroke="var(--panel)" strokeWidth={1.5} />}
                    </g>
                  )
                })}
                <line x1={cx(nowAge.exact)} x2={cx(nowAge.exact)} y1={14} y2={chartRows.length * rowH + 16} stroke="#ef4444" strokeDasharray="4 3" />
              </svg>
              <p className="muted" style={{ fontSize: 12 }}>Blue band = broad typical range, green dot = when it happened, red line = today.</p>
            </div>
          )}
          <Note>Typical ranges vary a lot: every child follows their own timetable. These windows are a rough guide for a keepsake, not a developmental screening. If something worries you, talk to your health visitor or paediatrician.</Note>
        </Panel>
        {sel && (
          <Panel title={`${CAT_ICON[sel.cat]} ${sel.title}`} actions={custom(sel) ? <Btn kind="ghost" onClick={() => { setDone(sel.id, null); set((st) => ({ ...st, custom: st.custom.filter((c) => c.id !== sel.id) })) }}>Delete</Btn> : undefined}>
            {s.done[sel.id] ? (
              <>
                <Row>
                  <Txt label="Date" type="date" value={s.done[sel.id].date} onChange={(date) => date && setDone(sel.id, { ...s.done[sel.id], date })} />
                  <p style={{ alignSelf: 'end' }}>Age: <b>{age(s.birth, s.done[sel.id].date).label}</b>{!custom(sel) && days(s.birth, s.done[sel.id].date) >= 0 && <span className="muted"> (typical {sel.from}–{sel.to} mo)</span>}</p>
                </Row>
                <Txt label="Story / note" value={s.done[sel.id].note} onChange={(note) => setDone(sel.id, { ...s.done[sel.id], note })} placeholder="Where were you? Who saw it?" />
                <Row>
                  {s.done[sel.id].photo && <img src={s.done[sel.id].photo} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12 }} />}
                  <FileDrop accept="image/*" onFiles={(f) => shrink(f[0]).then((photo) => setDone(sel.id, { ...s.done[sel.id], photo }), () => setErr('Could not read that image.'))} label={s.done[sel.id].photo ? 'Replace photo' : 'Add a photo'} />
                  {s.done[sel.id].photo && <Btn kind="ghost" onClick={() => setDone(sel.id, { ...s.done[sel.id], photo: undefined })}>Remove photo</Btn>}
                </Row>
              </>
            ) : (
              <Row>
                <Btn kind="primary" onClick={() => setDone(sel.id, { date: T, note: '' })}>✓ It happened today</Btn>
                <span className="muted">or tick it in the list and edit the date.</span>
              </Row>
            )}
          </Panel>
        )}
      </div>
    </Split>
  )
}
