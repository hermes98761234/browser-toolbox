import { Btn, CsvButton, Note, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ITEMS, search, SEV_INFO, SPECIES, worst, type Item, type Kind, type Sev, type Species } from './lib/toxic-food-checker'

interface State { q: string; species: Species[]; kind: 'all' | Kind; hideSafe: boolean; open: string }
const DEF: State = { q: 'grapes', species: ['dog', 'cat'], kind: 'all', hideSafe: false, open: 'Grapes and raisins' }

const ICON: Record<Species, string> = { dog: '🐕', cat: '🐈', bird: '🦜', rabbit: '🐇', horse: '🐎' }
const NAME: Record<Species, string> = { dog: 'Dog', cat: 'Cat', bird: 'Bird', rabbit: 'Rabbit', horse: 'Horse' }
const QUICK = ['chocolate', 'xylitol', 'onion', 'lily', 'avocado', 'macadamia', 'sago palm', 'coffee', 'apple']

function Badge({ sev }: { sev: Sev }) {
  const i = SEV_INFO[sev]
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: i.tone, whiteSpace: 'nowrap' }}>{i.label}</span>
}

function Detail({ it, species }: { it: Item; species: Species[] }) {
  const w = worst(it, species)
  return (
    <div style={{ borderLeft: `4px solid ${SEV_INFO[w].tone}`, paddingLeft: 12 }}>
      <h3 style={{ margin: '0 0 4px' }}>{it.name}</h3>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>{it.kind === 'plant' ? '🌿 Plant' : it.kind === 'food' ? '🍽 Food' : '🏠 Household'} · also: {it.aliases}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 10 }}>
        {SPECIES.map((sp) => (
          <div key={sp} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, opacity: species.includes(sp) ? 1 : 0.55 }}>
            <div style={{ fontSize: 13 }}>{ICON[sp]} {NAME[sp]}</div>
            <Badge sev={it.sev[sp]} />
          </div>
        ))}
      </div>
      {it.agent !== '—' && <p style={{ margin: '4px 0' }}><b>Toxic principle:</b> {it.agent}</p>}
      {it.signs !== '—' && <p style={{ margin: '4px 0' }}><b>Signs to watch for:</b> {it.signs}</p>}
      <p style={{ margin: '4px 0' }}><b>Note:</b> {it.note}</p>
    </div>
  )
}

export default function ToxicFoodChecker() {
  const [s, set, reset] = useToolState('toxic-food-checker', DEF)
  const sp = s.species.length ? s.species : [...SPECIES]
  const list = search(s.q).filter((it) => (s.kind === 'all' || it.kind === s.kind) && (!s.hideSafe || worst(it, sp) !== 'S'))
  const open = list.find((i) => i.name === s.open) ?? list[0]
  const toggle = (x: Species) => set({ species: s.species.includes(x) ? s.species.filter((y) => y !== x) : [...s.species, x] })
  const counts = (['E', 'T', 'C', 'S'] as Sev[]).map((v) => ITEMS.filter((it) => worst(it, sp) === v).length)

  return (
    <>
      <div role="alert" style={{ background: '#dc2626', color: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 14, lineHeight: 1.5 }}>
        <b style={{ fontSize: 17 }}>⚠ If your pet ate something toxic, call your vet or an animal poison control line now — don't wait for symptoms.</b>
        <div style={{ fontSize: 14, marginTop: 4 }}>
          US: ASPCA Animal Poison Control <a href="tel:+18884264435" style={{ color: '#fff', fontWeight: 700 }}>(888) 426-4435</a> · Pet Poison Helpline <a href="tel:+18557647661" style={{ color: '#fff', fontWeight: 700 }}>(855) 764-7661</a> (fees may apply). Elsewhere: your nearest emergency vet. Do not induce vomiting unless a vet tells you to. Have the packaging and your pet's weight ready.
        </div>
      </div>
      <Split>
        <div>
          <Panel title="Check a food or plant" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <input className="k-input" autoFocus placeholder="Type a food, plant or product… (e.g. raisins, sugar-free gum, tulip)" value={s.q} onChange={(e) => set({ q: e.target.value, open: '' })} aria-label="Search" style={{ width: '100%', fontSize: 17, padding: '10px 12px' }} />
            <Row>{QUICK.map((q) => <Btn key={q} kind="ghost" onClick={() => set({ q, open: '' })}>{q}</Btn>)}</Row>
            <div className="k-label" style={{ marginTop: 8 }}>My pets</div>
            <Row>
              {SPECIES.map((x) => (
                <Btn key={x} kind={s.species.includes(x) ? 'primary' : 'normal'} onClick={() => toggle(x)}>{ICON[x]} {NAME[x]}</Btn>
              ))}
            </Row>
            <Row>
              <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['all', 'All'], ['food', 'Foods'], ['plant', 'Plants'], ['household', 'Household']]} />
              <label className="k-check"><input type="checkbox" checked={s.hideSafe} onChange={(e) => set({ hideSafe: e.target.checked })} /> Hide safe</label>
            </Row>
          </Panel>
          <Panel title={`Results (${list.length})`} actions={<CsvButton name="pet-toxicity.csv" rows={() => [['Item', 'Type', ...SPECIES.map((x) => NAME[x]), 'Toxic principle', 'Signs', 'Note'], ...list.map((it) => [it.name, it.kind, ...SPECIES.map((x) => SEV_INFO[it.sev[x]].label), it.agent, it.signs, it.note])]} />}>
            {list.length ? (
              <Table
                head={['Item', ...sp.map((x) => ICON[x])]}
                rows={list.map((it) => [
                  <a key="n" href="#" onClick={(e) => { e.preventDefault(); set({ open: it.name }) }} style={{ fontWeight: it === open ? 800 : 500, color: it === open ? 'var(--accent)' : undefined }}>{it.name}</a>,
                  ...sp.map((x) => <Badge key={x} sev={it.sev[x]} />),
                ])}
                max={40}
              />
            ) : (
              <Note tone="warn">Not in this list. That does <b>not</b> mean it is safe — ask your vet or poison control before feeding anything unfamiliar.</Note>
            )}
          </Panel>
        </div>
        <div>
          <Stats>
            <Stat label="Emergency" value={counts[0]} tone="bad" sub={`for ${sp.map((x) => NAME[x].toLowerCase()).join(', ')}`} />
            <Stat label="Toxic" value={counts[1]} />
            <Stat label="Caution" value={counts[2]} />
            <Stat label="Generally safe" value={counts[3]} tone="good" />
          </Stats>
          <Panel title="Details">
            {open ? <Detail it={open} species={sp} /> : <p className="muted">Search and pick an item.</p>}
          </Panel>
          <Panel title="Severity levels">
            <Table
              head={['Label', 'Meaning']}
              rows={[
                [<Badge key="e" sev="E" />, 'Can be life-threatening even in small amounts. Contact a vet immediately.'],
                [<Badge key="t" sev="T" />, 'Poisonous; seriousness depends on amount eaten and body weight. Call your vet.'],
                [<Badge key="c" sev="C" />, 'Usually mild (stomach upset, mouth irritation) or a physical hazard; large amounts can still be serious.'],
                [<Badge key="u" sev="?" />, 'Not well documented for this species — treat as unsafe.'],
                [<Badge key="s" sev="S" />, 'Generally non-toxic as an occasional treat in sensible portions.'],
              ]}
            />
            <p className="muted" style={{ fontSize: 13 }}>
              Compiled from widely published veterinary references (ASPCA Animal Poison Control Center toxic & non-toxic plant lists, Pet Poison Helpline, Merck Veterinary Manual). This is general information, not a diagnosis, and deliberately gives no “safe doses”: individual sensitivity varies, and many toxins act hours or days later.
            </p>
          </Panel>
        </div>
      </Split>
    </>
  )
}
