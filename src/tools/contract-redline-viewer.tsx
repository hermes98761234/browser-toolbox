import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { align, changes, docxPackage, merge, plainXml, redlineXml, stats, type Decision } from './lib/contract-redline-viewer'
import { paraText, parseDocx, type Doc } from './lib/word-to-pdf'

const ORIGINAL = `SERVICES AGREEMENT
This Services Agreement is made between Harbor Analytics Ltd. ("Provider") and Juniper Retail Inc. ("Client").
1. Services. Provider will deliver the monthly sales dashboards described in Schedule A.
2. Term. This Agreement starts on the Effective Date and continues for twelve (12) months.
3. Fees. Client will pay a fixed fee of $4,000 per month. Invoices are payable within thirty (30) days.
4. Confidentiality. Each party will keep the other party's confidential information secret and use it only to perform this Agreement.
5. Data. Provider may use anonymised Client data to improve its products.
6. Liability. Provider's total liability is limited to the fees paid in the three (3) months before the claim.
7. Termination. Either party may terminate this Agreement with ninety (90) days' written notice.
8. Governing law. This Agreement is governed by the laws of the Province of Ontario.`

const REVISED = `SERVICES AGREEMENT
This Services Agreement is made between Harbor Analytics Ltd. ("Provider") and Juniper Retail Inc. ("Client").
1. Services. Provider will deliver the weekly sales dashboards and quarterly reviews described in Schedule A.
2. Term. This Agreement starts on the Effective Date and continues for twenty-four (24) months, renewing automatically for further twelve (12) month periods.
3. Fees. Client will pay a fixed fee of $4,400 per month. Invoices are payable within forty-five (45) days.
3A. Late payment. Overdue amounts accrue interest at 1% per month.
4. Confidentiality. Each party will keep the other party's confidential information secret and use it only to perform this Agreement, for five (5) years after termination.
6. Liability. Provider's total liability is limited to the fees paid in the twelve (12) months before the claim, except for breaches of confidentiality.
7. Termination. Either party may terminate this Agreement with sixty (60) days' written notice.
8. Governing law. This Agreement is governed by the laws of the Province of Ontario.`

const DEF = { a: ORIGINAL, b: REVISED, nameA: 'Draft v1', nameB: 'Counterparty v2', threshold: 0.4, pending: 'accept' as 'accept' | 'reject', view: 'redline' as 'redline' | 'clean', author: 'Reviewer', decisions: {} as Record<number, Decision> }

function docText(doc: Doc): string {
  return doc.blocks.map((b) => (b.kind === 'p' ? paraText(b).replace(/\n/g, ' ') : b.rows.map((r) => r.cells.map((c) => c.paras.map(paraText).join(' ')).join('\t')).join('\n'))).join('\n')
}

// Screen colours readable on light and dark themes; print and DOCX use the classic legal red/blue.
const DEL = { color: '#ef4444', textDecoration: 'line-through', background: 'rgba(239,68,68,.1)' }
const INS = { color: '#3b82f6', textDecoration: 'underline double', background: 'rgba(59,130,246,.12)' }

export default function ContractRedlineViewer() {
  const [s, set, reset] = useToolState('contract-redline-viewer', DEF)
  const [err, setErr] = useState('')
  const [focus, setFocus] = useState<number | null>(null)
  const paras = useMemo(() => align(s.a, s.b, s.threshold), [s.a, s.b, s.threshold])
  const list = useMemo(() => changes(paras), [paras])
  const st = stats(paras)
  const dec = (id: number): Decision => s.decisions[id] ?? 'pending'
  const decide = (id: number, d: Decision) => set({ decisions: { ...s.decisions, [id]: dec(id) === d ? 'pending' : d } })
  const clean = merge(paras, s.decisions, s.pending)
  const counts = { accept: list.filter((c) => dec(c.id) === 'accept').length, reject: list.filter((c) => dec(c.id) === 'reject').length }

  const load = async (f: File, side: 'a' | 'b') => {
    setErr('')
    try {
      const text = /\.docx$/i.test(f.name) ? docText(await parseDocx(new Uint8Array(await f.arrayBuffer()))) : await f.text()
      set(side === 'a' ? { a: text, nameA: f.name, decisions: {} } : { b: text, nameB: f.name, decisions: {} })
    } catch (e) {
      setErr(`${f.name}: ${(e as Error).message}`)
    }
  }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return setErr('Pop-up blocked: allow pop-ups to print the redline.')
    const body = paras.map((p) => `<p>${p.segs.map((g) => (g.t === 'eq' ? esc(g.text) : `<${g.t === 'del' ? 'del' : 'ins'}>${esc(g.text)}</${g.t === 'del' ? 'del' : 'ins'}>`)).join('')}</p>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Redline — ${esc(s.nameA)} vs ${esc(s.nameB)}</title><style>body{font:12pt/1.55 "Times New Roman",serif;max-width:7in;margin:0.8in auto;color:#000}h1{font-size:13pt;margin:0 0 4pt}p{margin:0 0 9pt;text-align:justify}del{color:#c00000;text-decoration:line-through}ins{color:#0033cc;text-decoration:underline double}.meta{font:9pt sans-serif;color:#555;border-bottom:1px solid #999;padding-bottom:6pt;margin-bottom:14pt}</style></head><body><h1>Comparison of ${esc(s.nameA)} → ${esc(s.nameB)}</h1><div class="meta">${new Date().toLocaleString()} · ${st.added} words inserted (<ins>blue double underline</ins>), ${st.deleted} deleted (<del>red strikethrough</del>), ${st.changedParas} of ${st.paras} paragraphs changed</div>${body}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }
  const docx = (xml: string, name: string) => download(name, new Blob([docxPackage(xml) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))

  return (
    <div>
      <Split>
        <Panel title={`Original — ${s.nameA}`}>
          <FileDrop accept=".docx,.txt,.md,text/plain" onFiles={([f]) => void load(f, 'a')} label="DOCX or TXT, or paste below" />
          <Area value={s.a} onChange={(a) => set({ a, decisions: {} })} rows={7} />
        </Panel>
        <Panel title={`Revised — ${s.nameB}`} actions={<Btn kind="ghost" onClick={() => set({ a: s.b, b: s.a, nameA: s.nameB, nameB: s.nameA, decisions: {} })}>⇄ Swap</Btn>}>
          <FileDrop accept=".docx,.txt,.md,text/plain" onFiles={([f]) => void load(f, 'b')} label="DOCX or TXT, or paste below" />
          <Area value={s.b} onChange={(b) => set({ b, decisions: {} })} rows={7} />
        </Panel>
      </Split>
      {err && <Note tone="err">{err}</Note>}
      <Stats>
        <Stat label="Changes" value={list.length} sub={`${counts.accept} accepted · ${counts.reject} rejected · ${list.length - counts.accept - counts.reject} open`} tone="accent" />
        <Stat label="Words inserted" value={st.added} />
        <Stat label="Words deleted" value={st.deleted} />
        <Stat label="Paragraphs changed" value={`${st.changedParas} / ${st.paras}`} sub={`${Math.round(st.share * 100)}% of wording touched`} />
      </Stats>
      <Split wide="left">
        <Panel
          title={s.view === 'redline' ? 'Redline' : 'Clean merged text'}
          actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['redline', 'Redline'], ['clean', 'Clean']]} />}
        >
          {s.view === 'redline' ? (
            <div style={{ fontFamily: '"Times New Roman", Georgia, serif', fontSize: 16, lineHeight: 1.6, maxHeight: 620, overflow: 'auto', padding: '4px 8px' }}>
              {paras.map((p, i) => (
                <p key={i} style={{ margin: '0 0 10px', textAlign: 'justify', borderLeft: p.kind !== 'same' ? '3px solid var(--accent)' : '3px solid transparent', paddingLeft: 8 }}>
                  {p.segs.map((g, k) => {
                    const d = g.change !== undefined ? dec(g.change) : 'pending'
                    const dim = (g.t === 'del' && d === 'accept') || (g.t === 'ins' && d === 'reject')
                    const first = g.change !== undefined && g.t !== 'eq' && p.segs.findIndex((x) => x.change === g.change && x.t !== 'eq') === k
                    const hl = focus !== null && g.change === focus
                    return (
                      <span key={k}>
                        {first && <sup style={{ fontFamily: 'system-ui', fontSize: 10, color: d === 'accept' ? 'var(--ok)' : d === 'reject' ? 'var(--err)' : 'var(--accent)', cursor: 'pointer', fontWeight: 700 }} onClick={() => setFocus(g.change!)}>[{g.change}{d === 'accept' ? '✓' : d === 'reject' ? '✗' : ''}]</sup>}
                        <span style={{ ...(g.t === 'del' ? DEL : g.t === 'ins' ? INS : {}), opacity: dim ? 0.35 : 1, outline: hl && g.t !== 'eq' ? '2px solid #f59e0b' : undefined }}>{g.text}</span>
                      </span>
                    )
                  })}
                </p>
              ))}
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: '"Times New Roman", Georgia, serif', fontSize: 16, lineHeight: 1.6, maxHeight: 620, overflow: 'auto', margin: 0 }}>{clean}</pre>
          )}
          <div className="k-legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: '#ef4444' }} />Deleted (strikethrough)</span>
            <span><i style={{ background: '#3b82f6' }} />Inserted (double underline)</span>
            <span><i style={{ background: 'var(--accent)' }} />Changed paragraph</span>
          </div>
        </Panel>
        <div>
          <Panel title="Changes" actions={<><Btn onClick={() => set({ decisions: Object.fromEntries(list.map((c) => [c.id, 'accept'])) })}>Accept all</Btn><Btn onClick={() => set({ decisions: Object.fromEntries(list.map((c) => [c.id, 'reject'])) })}>Reject all</Btn><Btn kind="ghost" onClick={() => set({ decisions: {} })}>Clear</Btn></>}>
            {list.length === 0 && <Note tone="ok">The two versions are identical (after collapsing whitespace).</Note>}
            <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflow: 'auto' }}>
              {list.map((c) => {
                const d = dec(c.id)
                return (
                  <div key={c.id} onMouseEnter={() => setFocus(c.id)} onMouseLeave={() => setFocus(null)} style={{ border: '1px solid var(--line)', borderLeft: `4px solid ${d === 'accept' ? 'var(--ok)' : d === 'reject' ? 'var(--err)' : 'var(--accent)'}`, borderRadius: 8, padding: '6px 8px', fontSize: 13 }}>
                    <Row wrap={false}>
                      <b style={{ flex: 1 }}>#{c.id} {c.whole ? (c.kind === 'insert' ? 'New paragraph' : 'Deleted paragraph') : c.kind === 'insert' ? 'Insertion' : c.kind === 'delete' ? 'Deletion' : 'Replacement'}</b>
                      <Btn kind={d === 'accept' ? 'primary' : 'normal'} onClick={() => decide(c.id, 'accept')}>✓</Btn>
                      <Btn kind={d === 'reject' ? 'danger' : 'normal'} onClick={() => decide(c.id, 'reject')}>✗</Btn>
                    </Row>
                    {c.old && <div style={{ ...DEL, background: 'none' }}>{c.old.length > 160 ? c.old.slice(0, 160) + '…' : c.old}</div>}
                    {c.new && <div style={{ ...INS, background: 'none' }}>{c.new.length > 160 ? c.new.slice(0, 160) + '…' : c.new}</div>}
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel title="Settings & export">
            <p className="k-label" style={{ margin: '0 0 4px' }}>Open changes in the clean text are treated as</p>
            <Seg value={s.pending} onChange={(pending) => set({ pending })} options={[['accept', 'Accepted'], ['reject', 'Rejected']]} />
            <Slider label="Paragraph match threshold" value={s.threshold} onChange={(threshold) => set({ threshold, decisions: {} })} min={0.15} max={0.9} step={0.05} show={(v) => `${Math.round(v * 100)}% similar`} />
            <Txt label="Author for tracked changes" value={s.author} onChange={(author) => set({ author })} />
            <Row>
              <Btn kind="primary" onClick={print}>🖨 Print redline</Btn>
              <Btn onClick={() => docx(redlineXml(paras, { tracked: false, author: s.author, date: '', title: `Comparison of ${s.nameA} → ${s.nameB}` }), 'redline.docx')}>⬇ Redline DOCX</Btn>
              <Btn onClick={() => docx(redlineXml(paras, { tracked: true, author: s.author, date: new Date().toISOString().slice(0, 19) + 'Z', title: '' }), 'tracked-changes.docx')}>⬇ Tracked-changes DOCX</Btn>
            </Row>
            <Row>
              <Btn onClick={() => docx(plainXml(clean, ''), 'clean.docx')}>⬇ Clean DOCX</Btn>
              <Btn onClick={() => download('clean.txt', clean)}>⬇ Clean TXT</Btn>
              <CopyButton text={clean} label="Copy clean text" />
              <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
            </Row>
            <Note>“Tracked-changes DOCX” contains real Word revisions (Review → Accept/Reject works in Word and LibreOffice). Comparison is on text only: formatting, numbering and tables are flattened. Always have the final document checked by counsel; nothing is uploaded.</Note>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
