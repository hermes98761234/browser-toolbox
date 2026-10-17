import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, CsvButton, download, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'

// English phrases with their category; each language below lists "translation|pronunciation" in the same order.
const PHRASES: [string, string][] = [
  ['Basics', 'Hello'], ['Basics', 'Goodbye'], ['Basics', 'Please'], ['Basics', 'Thank you'], ['Basics', 'Yes'], ['Basics', 'No'],
  ['Basics', 'Excuse me'], ['Basics', 'Sorry'], ['Basics', 'I don’t understand'], ['Basics', 'Do you speak English?'], ['Basics', 'My name is …'], ['Basics', 'Nice to meet you'],
  ['Directions', 'Where is the toilet?'], ['Directions', 'Where is the train station?'], ['Directions', 'Left'], ['Directions', 'Right'], ['Directions', 'Straight ahead'], ['Directions', 'How far is it?'],
  ['Food', 'A table for two, please'], ['Food', 'The menu, please'], ['Food', 'Water, please'], ['Food', 'The bill, please'], ['Food', 'I’m vegetarian'], ['Food', 'I’m allergic to nuts'],
  ['Shopping', 'How much is it?'], ['Shopping', 'Can I pay by card?'], ['Shopping', 'Too expensive'],
  ['Emergency', 'Help!'], ['Emergency', 'Call an ambulance!'], ['Emergency', 'Call the police!'], ['Emergency', 'I need a doctor'], ['Emergency', 'I’m lost'],
  ['Hotel & social', 'I have a reservation'], ['Hotel & social', 'Cheers!'],
]

const LANGS: Record<string, { name: string; flag: string; bcp: string; data: string }> = {
  es: { name: 'Spanish', flag: '🇪🇸', bcp: 'es-ES', data: `Hola|OH-lah
Adiós|ah-DYOHS
Por favor|por fah-VOR
Gracias|GRAH-syahs
Sí|see
No|noh
Disculpe|dees-KOOL-peh
Lo siento|loh SYEN-toh
No entiendo|noh en-TYEN-doh
¿Habla inglés?|AH-blah een-GLEHS
Me llamo …|meh YAH-moh
Mucho gusto|MOO-choh GOOS-toh
¿Dónde está el baño?|DOHN-deh es-TAH el BAH-nyoh
¿Dónde está la estación de tren?|DOHN-deh es-TAH lah es-tah-SYOHN deh tren
A la izquierda|ah lah ees-KYEHR-dah
A la derecha|ah lah deh-REH-chah
Todo recto|TOH-doh REHK-toh
¿A qué distancia está?|ah keh dees-TAHN-syah es-TAH
Una mesa para dos, por favor|OO-nah MEH-sah PAH-rah dohs, por fah-VOR
La carta, por favor|lah KAR-tah, por fah-VOR
Agua, por favor|AH-gwah, por fah-VOR
La cuenta, por favor|lah KWEN-tah, por fah-VOR
Soy vegetariano / vegetariana|soy veh-heh-tah-RYAH-noh
Soy alérgico a los frutos secos|soy ah-LEHR-hee-koh ah lohs FROO-tohs SEH-kohs
¿Cuánto cuesta?|KWAHN-toh KWES-tah
¿Puedo pagar con tarjeta?|PWEH-doh pah-GAR kon tar-HEH-tah
Demasiado caro|deh-mah-SYAH-doh KAH-roh
¡Ayuda!|ah-YOO-dah
¡Llame a una ambulancia!|YAH-meh ah OO-nah ahm-boo-LAHN-syah
¡Llame a la policía!|YAH-meh ah lah poh-lee-SEE-ah
Necesito un médico|neh-seh-SEE-toh oon MEH-dee-koh
Estoy perdido / perdida|es-TOY pehr-DEE-doh
Tengo una reserva|TEN-goh OO-nah reh-SEHR-vah
¡Salud!|sah-LOOD` },
  fr: { name: 'French', flag: '🇫🇷', bcp: 'fr-FR', data: `Bonjour|bohn-ZHOOR
Au revoir|oh ruh-VWAHR
S’il vous plaît|seel voo PLEH
Merci|mehr-SEE
Oui|wee
Non|nohn
Excusez-moi|ex-kew-zay-MWAH
Pardon|par-DOHN
Je ne comprends pas|zhuh nuh kohm-PRAHN pah
Parlez-vous anglais ?|par-lay voo ahn-GLEH
Je m’appelle …|zhuh mah-PEL
Enchanté|ahn-shahn-TAY
Où sont les toilettes ?|oo sohn lay twah-LET
Où est la gare ?|oo eh lah GAR
À gauche|ah GOHSH
À droite|ah DRWAHT
Tout droit|too DRWAH
C’est loin ?|seh LWAN
Une table pour deux, s’il vous plaît|ewn TAH-bluh poor DUH, seel voo PLEH
La carte, s’il vous plaît|lah KART, seel voo PLEH
De l’eau, s’il vous plaît|duh LOH, seel voo PLEH
L’addition, s’il vous plaît|lah-dee-SYOHN, seel voo PLEH
Je suis végétarien / végétarienne|zhuh swee vay-zhay-tah-RYAN
Je suis allergique aux noix|zhuh swee ah-lehr-ZHEEK oh NWAH
C’est combien ?|seh kohm-BYAN
Je peux payer par carte ?|zhuh puh pay-YAY par KART
C’est trop cher|seh troh SHEHR
Au secours !|oh suh-KOOR
Appelez une ambulance !|ah-puh-LAY ewn ahm-bew-LAHNS
Appelez la police !|ah-puh-LAY lah poh-LEES
J’ai besoin d’un médecin|zhay buh-ZWAN dun mayd-SAN
Je suis perdu / perdue|zhuh swee pehr-DEW
J’ai une réservation|zhay ewn ray-zehr-vah-SYOHN
Santé !|sahn-TAY` },
  de: { name: 'German', flag: '🇩🇪', bcp: 'de-DE', data: `Hallo|HAH-loh
Auf Wiedersehen|owf VEE-der-zayn
Bitte|BIT-uh
Danke|DAHN-kuh
Ja|yah
Nein|nine
Entschuldigung|ent-SHOOL-dee-goong
Es tut mir leid|es toot meer LITE
Ich verstehe nicht|ikh fer-SHTAY-uh nikht
Sprechen Sie Englisch?|SHPREKH-en zee ENG-lish
Ich heiße …|ikh HY-suh
Freut mich|froyt mikh
Wo ist die Toilette?|voh ist dee toy-LET-uh
Wo ist der Bahnhof?|voh ist dair BAHN-hohf
Links|links
Rechts|rekhts
Geradeaus|geh-RAH-deh-ows
Wie weit ist es?|vee vite ist es
Einen Tisch für zwei, bitte|EYE-nen tish fuer tsvy, BIT-uh
Die Speisekarte, bitte|dee SHPY-zuh-kar-tuh, BIT-uh
Wasser, bitte|VAH-ser, BIT-uh
Die Rechnung, bitte|dee REKH-noong, BIT-uh
Ich bin Vegetarier / Vegetarierin|ikh bin veh-geh-TAH-ree-er
Ich bin allergisch gegen Nüsse|ikh bin ah-LEHR-gish GAY-gen NUE-suh
Wie viel kostet das?|vee feel KOS-tet dahs
Kann ich mit Karte zahlen?|kahn ikh mit KAR-tuh TSAH-len
Zu teuer|tsoo TOY-er
Hilfe!|HIL-fuh
Rufen Sie einen Krankenwagen!|ROO-fen zee EYE-nen KRAHN-ken-vah-gen
Rufen Sie die Polizei!|ROO-fen zee dee po-lee-TSY
Ich brauche einen Arzt|ikh BROW-khuh EYE-nen artst
Ich habe mich verlaufen|ikh HAH-buh mikh fer-LOW-fen
Ich habe eine Reservierung|ikh HAH-buh EYE-nuh reh-zer-VEE-roong
Prost!|prohst` },
  it: { name: 'Italian', flag: '🇮🇹', bcp: 'it-IT', data: `Buongiorno|bwon-JOR-noh
Arrivederci|ah-ree-veh-DEHR-chee
Per favore|pehr fah-VOH-reh
Grazie|GRAHT-see-eh
Sì|see
No|noh
Mi scusi|mee SKOO-zee
Mi dispiace|mee dees-PYAH-cheh
Non capisco|nohn kah-PEES-koh
Parla inglese?|PAR-lah een-GLEH-zeh
Mi chiamo …|mee KYAH-moh
Piacere|pyah-CHEH-reh
Dov’è il bagno?|doh-VEH eel BAH-nyoh
Dov’è la stazione?|doh-VEH lah stah-TSYOH-neh
A sinistra|ah see-NEES-trah
A destra|ah DEHS-trah
Sempre dritto|SEM-preh DREET-toh
Quanto è lontano?|KWAHN-toh eh lohn-TAH-noh
Un tavolo per due, per favore|oon TAH-voh-loh pehr DOO-eh, pehr fah-VOH-reh
Il menù, per favore|eel meh-NOO, pehr fah-VOH-reh
Acqua, per favore|AHK-kwah, pehr fah-VOH-reh
Il conto, per favore|eel KOHN-toh, pehr fah-VOH-reh
Sono vegetariano / vegetariana|SOH-noh veh-jeh-tah-RYAH-noh
Sono allergico alla frutta secca|SOH-noh ahl-LEHR-jee-koh AHL-lah FROOT-tah SEK-kah
Quanto costa?|KWAHN-toh KOHS-tah
Posso pagare con la carta?|POHS-soh pah-GAH-reh kohn lah KAR-tah
È troppo caro|eh TROHP-poh KAH-roh
Aiuto!|ah-YOO-toh
Chiami un’ambulanza!|KYAH-mee oon ahm-boo-LAHN-tsah
Chiami la polizia!|KYAH-mee lah poh-lee-TSEE-ah
Ho bisogno di un medico|oh bee-ZOH-nyoh dee oon MEH-dee-koh
Mi sono perso / persa|mee SOH-noh PEHR-soh
Ho una prenotazione|oh OO-nah preh-noh-tah-TSYOH-neh
Cin cin!|chin chin` },
  pt: { name: 'Portuguese (Brazil)', flag: '🇧🇷', bcp: 'pt-BR', data: `Olá|oh-LAH
Tchau|chow
Por favor|por fah-VOR
Obrigado / Obrigada|oh-bree-GAH-doo
Sim|seeng
Não|nowng
Com licença|kohn lee-SEN-sah
Desculpe|dess-KOOL-pee
Não entendo|nowng en-TEN-doo
Você fala inglês?|voh-SEH FAH-lah een-GLEHS
Meu nome é …|MEH-oo NOH-mee eh
Prazer|prah-ZEHR
Onde fica o banheiro?|OHN-jee FEE-kah oo bah-NYAY-roo
Onde fica a estação de trem?|OHN-jee FEE-kah ah es-tah-SOWNG jee treng
À esquerda|ah es-KEHR-dah
À direita|ah jee-RAY-tah
Em frente|eng FREN-chee
Fica longe?|FEE-kah LOHN-zhee
Uma mesa para dois, por favor|OO-mah MEH-zah PAH-rah doys, por fah-VOR
O cardápio, por favor|oo kar-DAH-pyoo, por fah-VOR
Água, por favor|AH-gwah, por fah-VOR
A conta, por favor|ah KOHN-tah, por fah-VOR
Sou vegetariano / vegetariana|soh veh-zheh-tah-RYAH-noo
Sou alérgico a nozes|soh ah-LEHR-zhee-koo ah NOH-zees
Quanto custa?|KWAHN-too KOOS-tah
Posso pagar com cartão?|POH-soo pah-GAR kohn kar-TOWNG
Muito caro|MWEEN-too KAH-roo
Socorro!|soh-KOH-hoo
Chame uma ambulância!|SHAH-mee OO-mah ahm-boo-LAHN-syah
Chame a polícia!|SHAH-mee ah poh-LEE-syah
Preciso de um médico|preh-SEE-zoo jee oong MEH-jee-koo
Estou perdido / perdida|es-TOH pehr-JEE-doo
Tenho uma reserva|TEN-yoo OO-mah heh-ZEHR-vah
Saúde!|sah-OO-jee` },
  ja: { name: 'Japanese', flag: '🇯🇵', bcp: 'ja-JP', data: `こんにちは|kon-nee-chee-wah
さようなら|sah-yoh-nah-rah
お願いします|oh-neh-gai-shee-mas
ありがとうございます|ah-ree-gah-toh go-zai-mas
はい|hai
いいえ|ee-eh
すみません|soo-mee-mah-sen
ごめんなさい|goh-men-nah-sai
わかりません|wah-kah-ree-mah-sen
英語を話せますか？|ay-goh oh hah-nah-seh-mas-kah
私の名前は…です|wah-tah-shee noh nah-mah-eh wah … des
はじめまして|hah-jee-meh-mah-shteh
トイレはどこですか？|toy-reh wah doh-koh des-kah
駅はどこですか？|eh-kee wah doh-koh des-kah
左|hee-dah-ree
右|mee-gee
まっすぐ|mahs-soo-goo
どのくらい遠いですか？|doh-noh-koo-rai toh-ee des-kah
二人です|foo-tah-ree des
メニューをください|meh-nyoo oh koo-dah-sai
お水をください|oh-mee-zoo oh koo-dah-sai
お会計をお願いします|oh-kai-keh oh oh-neh-gai-shee-mas
私はベジタリアンです|wah-tah-shee wah beh-jee-tah-ree-an des
ナッツアレルギーです|nat-tsoo ah-reh-roo-gee des
いくらですか？|ee-koo-rah des-kah
カードで払えますか？|kah-doh deh hah-rah-eh-mas-kah
高すぎます|tah-kah-soo-gee-mas
助けて！|tah-soo-keh-teh
救急車を呼んでください！|kyoo-kyoo-shah oh yon-deh koo-dah-sai
警察を呼んでください！|kay-sah-tsoo oh yon-deh koo-dah-sai
医者が必要です|ee-shah gah hee-tsoo-yoh des
道に迷いました|mee-chee nee mah-yoh-ee-mash-tah
予約しています|yoh-yah-koo shteh-ee-mas
乾杯！|kahn-pai` },
  uk: { name: 'Ukrainian', flag: '🇺🇦', bcp: 'uk-UA', data: `Добрий день|DOB-ryi den
До побачення|do po-BA-chen-nya
Будь ласка|bud LAS-ka
Дякую|DYA-ku-yu
Так|tak
Ні|nee
Перепрошую|pe-re-PRO-shu-yu
Вибачте|VY-bach-te
Я не розумію|ya ne ro-zu-MEE-yu
Ви говорите англійською?|vy ho-VO-ry-te an-HLEES-ko-yu
Мене звати …|me-NE ZVA-ty
Приємно познайомитися|pry-YEM-no poz-na-YO-my-ty-sya
Де туалет?|de tu-a-LET
Де вокзал?|de vok-ZAL
Ліворуч|lee-VO-ruch
Праворуч|pra-VO-ruch
Прямо|PRYA-mo
Як далеко це?|yak da-LE-ko tse
Столик на двох, будь ласка|STO-lyk na dvokh, bud LAS-ka
Меню, будь ласка|me-NYU, bud LAS-ka
Воду, будь ласка|VO-du, bud LAS-ka
Рахунок, будь ласка|ra-KHU-nok, bud LAS-ka
Я вегетаріанець / вегетаріанка|ya ve-he-ta-ri-A-nets
У мене алергія на горіхи|u ME-ne a-ler-HEE-ya na ho-REE-khy
Скільки це коштує?|SKEEL-ky tse KOSH-tu-ye
Можна оплатити карткою?|MOZH-na o-pla-TY-ty KART-ko-yu
Занадто дорого|za-NAD-to DO-ro-ho
Допоможіть!|do-po-mo-ZHEET
Викличте швидку!|VY-klych-te shvyd-KU
Викличте поліцію!|VY-klych-te po-LEE-tsee-yu
Мені потрібен лікар|me-NEE po-TREE-ben LEE-kar
Я заблукав / заблукала|ya za-blu-KAV
У мене бронювання|u ME-ne bro-nyu-VAN-nya
Будьмо!|BUD-mo` },
}

const CATS = ['All', '★ Favourites', ...new Set(PHRASES.map((p) => p[0]))]
const parsed = (code: string) => LANGS[code].data.split('\n').map((l) => l.split('|') as [string, string])
const DEF = { lang: 'es', cat: 'All', favs: ['es:3', 'es:12', 'es:21', 'es:27'] as string[], rate: 0.85, pron: true, voice: '' }

export default function OfflinePhrasebook() {
  const [s, set] = useToolState('offline-phrasebook', DEF)
  const [q, setQ] = useState('')
  const [big, setBig] = useState<number | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [online, setOnline] = useState(() => navigator.onLine)
  const L = LANGS[s.lang] ?? LANGS.es
  const rows = useMemo(() => parsed(s.lang in LANGS ? s.lang : 'es'), [s.lang])
  const tts = typeof speechSynthesis !== 'undefined'

  useEffect(() => {
    if (!tts) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    const on = () => setOnline(navigator.onLine)
    addEventListener('online', on); addEventListener('offline', on)
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); removeEventListener('online', on); removeEventListener('offline', on) }
  }, [tts])

  const langVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(L.bcp.slice(0, 2)))
  const voice = langVoices.find((v) => v.voiceURI === s.voice) ?? langVoices.find((v) => v.lang.replace('_', '-') === L.bcp) ?? langVoices[0]
  const speak = (text: string, slow = false) => {
    if (!tts) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/ \/ .*$/, '').replace('…', ''))
    u.lang = L.bcp
    if (voice) u.voice = voice
    u.rate = slow ? Math.max(0.4, s.rate * 0.6) : s.rate
    speechSynthesis.speak(u)
  }
  const key = (i: number) => `${s.lang}:${i}`
  const toggleFav = (i: number) => set({ favs: s.favs.includes(key(i)) ? s.favs.filter((f) => f !== key(i)) : [...s.favs, key(i)] })
  const needle = q.trim().toLowerCase()
  const list = PHRASES.map(([cat, en], i) => ({ cat, en, i, tr: rows[i][0], pr: rows[i][1] })).filter((p) =>
    (s.cat === 'All' || p.cat === s.cat || (s.cat === '★ Favourites' && s.favs.includes(key(p.i)))) &&
    (!needle || [p.en, p.tr, p.pr].some((x) => x.toLowerCase().includes(needle))))
  const favCount = s.favs.filter((f) => f.startsWith(s.lang + ':')).length
  const sheet = () => `${L.name} phrasebook\n\n` + PHRASES.map(([, en], i) => `${en}\n  ${rows[i][0]}  [${rows[i][1]}]`).join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Language">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {Object.entries(LANGS).map(([c, l]) => (
              <Btn key={c} kind={c === s.lang ? 'primary' : 'normal'} onClick={() => { set({ lang: c, voice: '' }); setBig(null) }}>{l.flag} {l.name}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Pronunciation playback">
          {!tts ? <Note tone="warn">This browser has no speech synthesis. Use the phonetic spelling instead.</Note> : (
            <>
              {langVoices.length ? (
                <Select label="Voice" value={voice?.voiceURI ?? ''} onChange={(v) => set({ voice: v })} options={langVoices.map((v) => [v.voiceURI, `${v.name}${v.localService ? ' · offline' : ' · online'}`] as [string, string])} />
              ) : <Note tone="warn">No {L.name} voice is installed. Add one in your system’s text-to-speech settings; playback may fall back to a default voice.</Note>}
              <Slider label="Speed" min={0.5} max={1.3} step={0.05} value={s.rate} onChange={(rate) => set({ rate })} unit="×" />
              <Btn onClick={() => speak(rows[0][0])}>▶ Test voice</Btn>
            </>
          )}
          <Check label="Show phonetic spelling" value={s.pron} onChange={(pron) => set({ pron })} />
        </Panel>
        <Panel title="Offline use">
          <Note tone={online ? 'info' : 'ok'}>{online ? 'Online now.' : 'You are offline — everything below still works.'} All phrases are built into this page; no network is needed after it loads. Voices marked “offline” also speak without a connection.</Note>
          <Row>
            <Btn onClick={() => download(`phrasebook-${s.lang}.txt`, sheet())}>⬇ Cheat sheet</Btn>
            <CsvButton name={`phrasebook-${s.lang}.csv`} rows={() => [['Category', 'English', L.name, 'Pronunciation'], ...PHRASES.map(([c, en], i) => [c, en, rows[i][0], rows[i][1]])]} />
            <CopyButton text={sheet} label="Copy all" />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Language" value={`${L.flag} ${L.name}`} />
          <Stat label="Phrases" value={PHRASES.length} sub={`${CATS.length - 2} categories`} />
          <Stat label="Favourites" value={favCount} tone="accent" />
          <Stat label="Voices" value={tts ? langVoices.length : '—'} sub={voice ? (voice.localService ? 'offline voice' : 'online voice') : 'none'} />
        </Stats>
        {big !== null && (
          <Panel title="Show this to someone" actions={<Btn kind="ghost" onClick={() => setBig(null)}>✕ Close</Btn>}>
            <div style={{ textAlign: 'center', padding: '18px 8px' }}>
              <div style={{ fontSize: 'clamp(28px, 6vw, 52px)', fontWeight: 800, lineHeight: 1.2 }}>{rows[big][0]}</div>
              <div className="muted" style={{ fontSize: 18, marginTop: 10 }}>{PHRASES[big][1]} · <i>{rows[big][1]}</i></div>
              <Row><Btn kind="primary" onClick={() => speak(rows[big][0])}>🔊 Play</Btn><Btn onClick={() => speak(rows[big][0], true)}>🐢 Slow</Btn></Row>
            </div>
          </Panel>
        )}
        <Panel title="Phrases" actions={<Txt label="" value={q} onChange={setQ} placeholder="Search English or translation…" />}>
          <Seg value={s.cat} onChange={(cat) => set({ cat })} options={CATS.map((c) => [c, c] as [string, string])} />
          <div style={{ marginTop: 10 }}>
            {list.map((p) => (
              <div key={p.i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <button type="button" className="k-btn ghost" title={s.favs.includes(key(p.i)) ? 'Remove favourite' : 'Add favourite'} onClick={() => toggleFav(p.i)} style={{ color: s.favs.includes(key(p.i)) ? '#f59e0b' : 'var(--muted)' }}>
                  {s.favs.includes(key(p.i)) ? '★' : '☆'}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setBig(p.i)}>
                  <div className="muted" style={{ fontSize: 13 }}>{p.en}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{p.tr}</div>
                  {s.pron && <div style={{ fontSize: 13, color: 'var(--accent)', fontStyle: 'italic' }}>{p.pr}</div>}
                </div>
                <Btn disabled={!tts} onClick={() => speak(p.tr)} title="Play">🔊</Btn>
              </div>
            ))}
            {!list.length && <Note>{s.cat === '★ Favourites' ? 'Tap ☆ on a phrase to keep it here.' : 'No phrase matches your search.'}</Note>}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Tap a phrase to show it in large type. Stress is in CAPITALS. Phrases with “/” give the masculine / feminine form.</p>
        </Panel>
      </div>
    </Split>
  )
}
