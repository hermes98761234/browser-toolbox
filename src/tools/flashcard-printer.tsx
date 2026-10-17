import { useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Area, Btn, Check, FileDrop, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fitFont, grid, paginate, PAPERS, parseCards, SIZES, type Card } from './lib/flashcard-printer'

type Mode = 'long' | 'short' | 'fold'
interface State {
  text: string; deck: string; paper: string; size: string; cw: number; ch: number; margin: number; gap: number
  mode: Mode; cut: boolean; swap: boolean; number: boolean; maxPt: number; offX: number; offY: number; landscape: boolean
}

const SAMPLE = `Term\tDefinition
Mitochondria\tOrganelle that produces ATP through cellular respiration
Photosynthesis\t6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂
Osmosis\tMovement of water across a semi-permeable membrane from low to high solute concentration
Enzyme\tProtein that speeds up a chemical reaction by lowering activation energy
DNA\tDeoxyribonucleic acid – the molecule that carries genetic instructions
Ribosome\tSite of protein synthesis
Homeostasis\tMaintaining a stable internal environment
Mitosis\tCell division producing two genetically identical daughter cells
Meiosis\tCell division producing four haploid gametes
Allele\tOne of two or more versions of a gene`

const DEF: State = { text: SAMPLE, deck: 'Biology 101', paper: 'A4', size: 'Business card 85×55 mm', cw: 85, ch: 55, margin: 10, gap: 0, mode: 'long', cut: true, swap: false, number: true, maxPt: 24, offX: 0, offY: 0, landscape: false }

const MM = 'mm'

function Face({ text, side, n, s, style }: { text: string; side: 'front' | 'back'; n: number; s: State; style: CSSProperties }) {
  const pt = fitFont(text, s.cw - 8, s.ch - 10, side === 'front' ? s.maxPt : Math.min(s.maxPt, 16))
  return (
    <div style={{ position: 'absolute', boxSizing: 'border-box', padding: '4mm', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', color: '#111', fontFamily: 'system-ui, sans-serif', ...style }}>
      <span style={{ fontSize: `${pt}pt`, lineHeight: 1.25, fontWeight: side === 'front' ? 700 : 400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</span>
      {(s.deck || s.number) && (
        <span style={{ position: 'absolute', left: '2.5mm', bottom: '1.8mm', fontSize: '6.5pt', color: '#777' }}>
          {s.deck}
          {s.deck && s.number ? ' · ' : ''}
          {s.number ? `#${n}` : ''}
          {side === 'back' ? ' · back' : ''}
        </span>
      )}
    </div>
  )
}

export default function FlashcardPrinter() {
  const [s, set, reset] = useToolState('flashcard-printer', DEF)
  const cards = useMemo(() => parseCards(s.text), [s.text])
  const [pw0, ph0] = PAPERS[s.paper] ?? PAPERS.A4
  const [PW, PH] = s.landscape ? [ph0, pw0] : [pw0, ph0]
  const fold = s.mode === 'fold'
  const g = grid(PW, PH, fold ? s.cw * 2 : s.cw, s.ch, s.margin, s.gap)
  const numbered = cards.map((c, i) => ({ ...c, n: i + 1 }))
  const pages = paginate(numbered, g, s.mode === 'short' ? 'short' : 'long')
  const sheets = fold ? pages.length : pages.length * 2
  const border = s.cut ? '0.25mm dashed #999' : 'none'

  const slotPos = (i: number) => ({ left: g.x0 + (i % g.cols) * (g.cw + g.gap), top: g.y0 + Math.floor(i / g.cols) * (g.ch + g.gap) })
  const faceTexts = (c: Card) => (s.swap ? [c.back, c.front] : [c.front, c.back])

  const pageEls = (screen: boolean) =>
    pages.flatMap((pg, pi) => {
      const pageStyle: CSSProperties = { position: 'relative', width: PW + MM, height: PH + MM, background: '#fff', overflow: 'hidden', breakAfter: 'page', pageBreakAfter: 'always', ...(screen ? { boxShadow: '0 2px 12px rgba(0,0,0,.25)', marginBottom: '8mm' } : {}) }
      const label = (t: string) => screen && <span style={{ position: 'absolute', right: '3mm', top: '2mm', fontSize: '8pt', color: '#999' }}>{t}</span>
      const front = (
        <div key={`f${pi}`} className="fc-page" style={pageStyle}>
          {label(`Sheet ${pi + 1} · ${fold ? 'fold on the dotted line' : 'fronts'}`)}
          {pg.fronts.map((c, i) => {
            if (!c) return null
            const { left, top } = slotPos(i)
            const [f, b] = faceTexts(c)
            return fold ? (
              <div key={i}>
                <Face text={f} side="front" n={c.n} s={s} style={{ left: left + MM, top: top + MM, width: s.cw + MM, height: s.ch + MM, border }} />
                <Face text={b} side="back" n={c.n} s={s} style={{ left: left + s.cw + MM, top: top + MM, width: s.cw + MM, height: s.ch + MM, border, borderLeft: '0.3mm dotted #c00' }} />
              </div>
            ) : (
              <Face key={i} text={f} side="front" n={c.n} s={s} style={{ left: left + MM, top: top + MM, width: s.cw + MM, height: s.ch + MM, border }} />
            )
          })}
        </div>
      )
      if (fold) return [front]
      const back = (
        <div key={`b${pi}`} className="fc-page" style={pageStyle}>
          {label(`Sheet ${pi + 1} · backs (${s.mode}-edge flip)`)}
          {pg.backs.map((c, i) => {
            if (!c) return null
            const { left, top } = slotPos(i)
            return <Face key={i} text={faceTexts(c)[1]} side="back" n={c.n} s={s} style={{ left: left + s.offX + MM, top: top + s.offY + MM, width: s.cw + MM, height: s.ch + MM, border }} />
          })}
        </div>
      )
      return [front, back]
    })

  const setSize = (size: string) => {
    const d = SIZES[size]
    set(d ? { size, cw: d[0], ch: d[1] } : { size })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Cards" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/*" onFiles={async ([f]) => set({ text: await f.text() })} label="Import CSV / TSV / text" />
          <Area label="One card per line: term ⇥ definition (tab, “ - ”, “ = ”, “: ”, “;” or comma)" value={s.text} onChange={(text) => set({ text })} rows={10} />
          <Row>
            <Txt label="Deck label" value={s.deck} onChange={(deck) => set({ deck })} placeholder="optional" />
          </Row>
          <Check label="Number the cards" value={s.number} onChange={(number) => set({ number })} />
          <Check label="Swap sides (definition on the front)" value={s.swap} onChange={(swap) => set({ swap })} />
        </Panel>
        <Panel title="Layout">
          <Row>
            <Select label="Paper" value={s.paper} onChange={(paper) => set({ paper })} options={Object.keys(PAPERS)} />
            <Select label="Card size" value={s.size} onChange={setSize} options={[...Object.keys(SIZES), 'Custom']} />
          </Row>
          <Row>
            <Num label="Card width" unit="mm" value={s.cw} min={20} onChange={(cw) => set({ cw: Math.max(20, cw), size: 'Custom' })} />
            <Num label="Card height" unit="mm" value={s.ch} min={15} onChange={(ch) => set({ ch: Math.max(15, ch), size: 'Custom' })} />
          </Row>
          <Row>
            <Num label="Page margin" unit="mm" value={s.margin} min={0} onChange={(margin) => set({ margin: Math.max(0, margin) })} />
            <Num label="Gap between cards" unit="mm" value={s.gap} min={0} onChange={(gap) => set({ gap: Math.max(0, gap) })} />
          </Row>
          <Check label="Landscape paper" value={s.landscape} onChange={(landscape) => set({ landscape })} />
          <Check label="Dashed cut lines" value={s.cut} onChange={(cut) => set({ cut })} />
          <Slider label="Max font size" value={s.maxPt} onChange={(maxPt) => set({ maxPt })} min={10} max={40} unit=" pt" show={(v) => String(v)} />
        </Panel>
        <Panel title="Double-sided printing">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['long', 'Duplex · long edge'], ['short', 'Duplex · short edge'], ['fold', 'Single-sided · fold']]} />
          {fold ? (
            <Note>Each card prints front and back side by side. Cut around the pair and fold on the red dotted line.</Note>
          ) : (
            <>
              <Note>Backs are mirrored so each definition lands behind its term. Use the same flip setting in your printer dialog, at 100 % scale (not “fit to page”).</Note>
              <Row>
                <Num label="Back offset →" unit="mm" value={s.offX} onChange={(offX) => set({ offX })} />
                <Num label="Back offset ↓" unit="mm" value={s.offY} onChange={(offY) => set({ offY })} />
              </Row>
              <p className="muted" style={{ fontSize: 12.5 }}>Print one test sheet, hold it to a light and nudge the backs if your printer shifts them.</p>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Cards" value={cards.length} tone="accent" />
          <Stat label="Per sheet" value={g.perPage} sub={`${g.cols} × ${g.rows} on ${s.paper}`} />
          <Stat label="Sheets of paper" value={pages.length} sub={`${sheets} printed side${sheets === 1 ? '' : 's'}`} />
        </Stats>
        {g.perPage === 0 && <Note tone="err">The card doesn't fit on the page. Reduce the card size or the margin.</Note>}
        {!cards.length && <Note tone="warn">Add some cards: one per line, term and definition separated by a tab, dash or comma.</Note>}
        <Panel title="Print preview" actions={<Btn kind="primary" disabled={!pages.length} onClick={() => print()}>🖨 Print</Btn>}>
          <div style={{ background: 'var(--line)', padding: 12, borderRadius: 10, maxHeight: 900, overflow: 'auto' }}>
            <div style={{ zoom: 0.62 * Math.min(1, 210 / PW), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{pageEls(true)}</div>
          </div>
        </Panel>
      </div>
      {createPortal(
        <div className="fc-print-root">
          <style>{`.fc-print-root{display:none}@media print{@page{size:${PW}mm ${PH}mm;margin:0}#root{display:none!important}.fc-print-root{display:block}html,body{background:#fff!important;margin:0!important}.fc-page{-webkit-print-color-adjust:exact;print-color-adjust:exact}.fc-print-root .fc-page:last-child{break-after:auto!important;page-break-after:auto!important}}`}</style>
          {pageEls(false)}
        </div>,
        document.body,
      )}
    </Split>
  )
}
