// Compact baby-name dataset (name, gender, origin, meaning) + fuzzy search helpers.
// Gender: m / f / u (unisex). Meanings are the commonly cited etymologies.

export interface Name { name: string; g: 'm' | 'f' | 'u'; origin: string; meaning: string }

const RAW = `#Hebrew
Aaron m mountain of strength;Abigail f my father's joy;Adam m man, of the earth;Asher m happy, blessed;Benjamin m son of the right hand;Caleb m wholehearted;Daniel m God is my judge;David m beloved;Eli m ascended, uplifted;Elijah m my God is Yahweh;Elizabeth f pledged to God;Ezra m help;Gabriel m God is my strength;Hannah f grace;Isaac m he will laugh;Jacob m supplanter;James m supplanter;Jonah m dove;Joseph m he will add;Joshua m God is salvation;Leah f weary, delicate;Levi m joined, attached;Micah m who is like God?;Michael m who is like God?;Miriam f wished-for child;Naomi f pleasantness;Nathan m he gave;Noah m rest, comfort;Rachel f ewe;Rebecca f to bind;Ruth f companion, friend;Samuel m God has heard;Sarah f princess;Seth m appointed;Tobias m God is good;Zachary m God remembers;Eden u delight;Ariel u lion of God;Judah m praised;Eva f life;Anna f grace;Hadassah f myrtle tree;Talia f dew from heaven;Gideon m great warrior;Ezekiel m God strengthens;Delilah f delicate;Jordan u to flow down;Shiloh u tranquil
#Greek
Alexander m defender of the people;Alexis u defender;Andrew m manly, strong;Chloe f green shoot;Christopher m bearer of Christ;Cora f maiden;Daphne f laurel tree;Dorothy f gift of God;Eleanor f light;George m farmer;Helen f torch, light;Irene f peace;Jason m healer;Lydia f woman from Lydia;Margaret f pearl;Melissa f honeybee;Nicholas m victory of the people;Penelope f weaver;Peter m rock;Phoebe f bright, shining;Sebastian m venerable;Selena f moon;Sophia f wisdom;Stephen m crown, garland;Theodore m gift of God;Thea f goddess;Timothy m honouring God;Zoe f life;Athena f goddess of wisdom;Calliope f beautiful voice;Damian m to tame;Leander m lion-man;Philip m lover of horses;Iris f rainbow;Xander m defender of men;Ophelia f help;Kassandra f shining upon man;Nico m victory of the people;Cyrus m sun;Hector m holding fast
#Latin
Adrian m from Hadria;Amelia f work;Aurora f dawn;Beatrice f she who brings happiness;Cecilia f blind;Clara f bright, clear;Dominic m belonging to the Lord;Emilia f rival;Felix m lucky;Julia f youthful;Julian m youthful;Laura f laurel;Lucas m light-giving;Lucy f light;Luna f moon;Marcus m warlike;Maximus m greatest;Miles m soldier;Olivia f olive tree;Patrick m nobleman;Rex m king;Rose f rose;Stella f star;Sylvia f of the forest;Valentina f strong, healthy;Victor m conqueror;Victoria f victory;Vivian u alive;Silas m of the forest;Augustus m great, venerable;Clement m merciful;Felicity f happiness;Grace f grace;Hope f hope;Ivy f ivy plant;Leo m lion;Leona f lioness;Paxton m peace town;Celeste f heavenly;Nova f new;Oriana f golden;Regina f queen;Rufus m red-haired;Serena f calm, serene;Vera f true;Mira f wonderful;Jude u praised;Marina f of the sea;Juno f queen of the heavens;Atticus m from Attica
#Germanic
Adelaide f noble kind;Albert m noble and bright;Alice f noble;Arnold m eagle power;Bernard m brave as a bear;Charles m free man;Conrad m brave counsel;Emma f whole, universal;Ella f all, completely;Frederick m peaceful ruler;Gerald m spear ruler;Harold m army ruler;Henry m ruler of the home;Hilda f battle;Hugo m mind, intellect;Leonard m brave lion;Louis m famous warrior;Matilda f mighty in battle;Otto m wealth;Richard m strong ruler;Robert m bright fame;Roger m famous spear;Walter m army ruler;William m resolute protector;Wilhelmina f will helmet;Carl m free man;Raymond m wise protector;Ernest m serious, resolute;Gertrude f spear strength;Imogen f maiden;Archibald m genuinely bold;Everett m brave as a boar;Emmett m universal;Leopold m brave people;Odette f wealthy;Bruno m brown;Ida f industrious;Ingrid f Ing's beauty;Wanda f wanderer
#English
Ashley u ash tree meadow;Audrey f noble strength;Bailey u bailiff;Blake u dark or fair;Bradley m broad meadow;Brooke f small stream;Chelsea f chalk landing place;Clayton m clay settlement;Dawn f daybreak;Edward m wealthy guardian;Edith f prosperous in war;Edwin m rich friend;Harper u harp player;Hayden u hay valley;Hunter m hunter;Kimberly f royal fortress meadow;Lincoln m lake colony;Mason m stoneworker;Mildred f gentle strength;Oliver m olive tree;Parker u park keeper;Riley u courageous;Shelby u willow farm;Sidney u wide island;Taylor u tailor;Tyler m tile maker;Wesley m western meadow;Whitney f white island;Winston m joy stone;Willow f willow tree;Hazel f hazel tree;Harvey m battle worthy;Ashton m ash tree town;Avery u ruler of elves;Dylan m son of the sea;Holly f holly tree;Jade f jade stone;Lily f lily flower;Poppy f poppy flower;Scarlett f red;Summer f summer;Sunny u cheerful;Wren f small songbird;River u flowing water;Sage u wise;Rowan u little red one;Quinn u wise;Remy u oarsman;Oakley u oak meadow;Ember f spark
#Irish & Scottish
Aidan m little fire;Aisling f dream, vision;Brennan m little raven;Brian m noble, strong;Bridget f exalted one;Ciara f dark-haired;Colin m young pup;Connor m lover of hounds;Declan m man of prayer;Eileen f shining, bright;Erin f Ireland;Fiona f fair, white;Finn m fair, white;Kathleen f pure;Keira f dark-haired;Kevin m handsome;Liam m resolute protector;Maeve f she who intoxicates;Niamh f bright, radiant;Nora f honour;Owen m young warrior;Quinn u descendant of Conn;Reagan u little king;Ronan m little seal;Sean m God is gracious;Shannon f wise river;Sinead f God is gracious;Tara f hill;Cormac m charioteer;Oisin m little deer;Saoirse f freedom;Ailsa f elf victory;Alistair m defender of men;Callum m dove;Douglas m dark river;Duncan m dark warrior;Ewan m born of yew;Fergus m man of vigour;Iona f Hebridean island;Isla f island;Kenneth m handsome;Lachlan m from the land of lakes;Mackenzie u son of the fair one;Malcolm m devotee of St Columba;Mhairi f bitter, beloved;Rory m red king;Skye f Isle of Skye;Logan u little hollow
#Welsh
Bryn m hill;Carys f love;Dafydd m beloved;Emrys m immortal;Evan m God is gracious;Gareth m gentle;Gwen f white, blessed;Megan f pearl;Morgan u sea-born;Rhys m ardour;Seren f star;Tegan f fair, beautiful;Arwen f noble maiden;Cerys f love;Elis m benevolent;Taliesin m shining brow
#French
Amelie f hard-working;Andre m manly;Antoine m priceless;Aurelie f golden;Bastien m venerable;Camille u attendant at a ceremony;Celine f heavenly;Charlotte f free;Claude u lame;Colette f victory of the people;Delphine f dolphin;Eloise f healthy, wide;Esme f esteemed;Genevieve f woman of the race;Jacques m supplanter;Josephine f God will increase;Juliette f youthful;Margot f pearl;Mathis m gift of God;Noelle f Christmas;Pierre m rock;Remi m oarsman;Sabine f Sabine woman;Simone f one who hears;Sylvie f of the forest;Yvette f yew;Lucien m light;Manon f bitter, beloved;Adele f noble;Belle f beautiful;Blanche f white;Corinne f maiden;Margaux f pearl;Olive f olive tree;Rene u reborn;Etienne m crown
#Italian & Spanish
Alessandro m defender of men;Bianca f white;Carlo m free man;Chiara f clear, bright;Dante m enduring;Enzo m ruler of the home;Fabio m bean grower;Francesca f free;Gianna f God is gracious;Giulia f youthful;Isabella f pledged to God;Lorenzo m from Laurentum;Luca m light-giving;Marco m warlike;Matteo m gift of God;Nico m victory;Paolo m small;Rocco m rest;Sofia f wisdom;Aurelio m golden;Alejandro m defender of men;Alma f soul, nourishing;Camila f attendant;Carmen f song, garden;Diego m supplanter;Dolores f sorrows;Elena f bright light;Esperanza f hope;Gael m stranger;Javier m new house;Jimena f one who hears;Lola f sorrows;Lucia f light;Mateo m gift of God;Mercedes f mercies;Paloma f dove;Pilar f pillar;Rafael m God heals;Santiago m Saint James;Valeria f strong;Ximena f listener;Inés f pure;Joaquin m raised by God;Paz f peace;Sol f sun;Emilio m rival;Bruna f brown
#Slavic
Bogdan m given by God;Boris m fighter;Danica f morning star;Dmitri m earth-lover;Ivan m God is gracious;Katya f pure;Lada f harmony;Lev m lion;Lyudmila f loved by the people;Milan m gracious, dear;Milena f gracious, dear;Mila f gracious, dear;Nadia f hope;Natasha f born at Christmas;Oksana f praise to God;Olena f bright light;Radomir m joyful peace;Sasha u defender;Stanislav m becoming glorious;Svetlana f light;Taras m rebel;Vera f faith;Vladimir m ruler of peace;Yaroslav m fierce glory;Zlata f golden;Bohdana f given by God;Daryna f gift;Kazimir m destroyer of peace;Miroslava f peace and glory;Dobromir m good peace;Yana f God is gracious;Zoryana f starry
#Norse
Astrid f divinely beautiful;Bjorn m bear;Erik m eternal ruler;Freya f lady;Gunnar m warrior;Ingrid f beautiful;Ivar m archer;Leif m heir;Magnus m great;Odin m frenzy, inspiration;Ragnar m warrior judgement;Sigrid f beautiful victory;Solveig f strong house;Sven m young man;Thor m thunder;Tove f beautiful;Liv f life;Elsa f pledged to God;Axel m father of peace;Anders m manly;Linnea f twinflower;Saga f seeing one;Soren m stern;Dagny f new day;Runa f secret lore;Kai u sea
#Arabic & Persian
Aisha f alive;Ali m exalted;Amir m prince;Amira f princess;Darius m he who holds firm the good;Farah f joy;Hassan m handsome;Jasmine f jasmine flower;Karim m generous;Layla f night;Malik m king;Nadia f caller;Omar m long-lived;Rania f queenly;Rumi m Roman, mystic poet;Samir m companion;Soraya f the Pleiades;Tariq m morning star;Yasmin f jasmine;Zara f blooming flower;Zayn m beauty, grace;Idris m interpreter;Ilyas m my God is Yahweh;Nour u light;Roxana f dawn;Kian m king;Shirin f sweet;Parisa f fairy-like;Cyra f sun;Laleh f tulip
#Sanskrit & Indian
Aarav m peaceful;Aditi f boundless;Anaya f caring;Arjun m bright, shining;Asha f hope;Dev m divine;Devi f goddess;Indira f beauty;Ishaan m sun;Kavya f poetry;Krishna m dark;Lakshmi f good fortune;Maya f illusion;Nisha f night;Priya f beloved;Rahul m efficient;Ravi m sun;Rohan m ascending;Sanjay m victorious;Tara f star;Uma f tranquillity;Vihaan m dawn;Zara f princess;Aanya f grace;Advik m unique;Diya f lamp;Ira f earth;Kiran u ray of light;Meera f prosperous;Neel m blue;Om m sacred syllable;Siddharth m one who achieved his goal
#Japanese
Akira u bright, clear;Aiko f child of love;Hana f flower;Haruki m shining sun;Hikari u light;Hiro m generous;Kaito m ocean flying;Kenji m strong and healthy;Mai f dance;Mei f bud;Ren u lotus;Riku m land;Sakura f cherry blossom;Sora u sky;Takumi m artisan;Yuki u snow, happiness;Yuna f gentleness;Yuto m gentle person;Emi f blessed beauty;Kenzo m strong and wise;Naomi f beautiful;Rina f jasmine;Aoi u hollyhock, blue
#African
Abena f born on Tuesday;Ama f born on Saturday;Amara f grace;Ayo u joy;Chidi m God exists;Chioma f good God;Dayo u joy arrives;Femi u love me;Imani f faith;Jabari m brave;Kamau m quiet warrior;Kofi m born on Friday;Kwame m born on Saturday;Nia f purpose;Nala f successful;Nuru u light;Sade f honour confers a crown;Tendai u thankful;Zuri f beautiful;Adaeze f princess;Ayana f beautiful flower;Jelani m mighty;Khari m kingly;Malaika f angel;Thabo m joy
#Hawaiian & Polynesian
Kailani f sea and sky;Kalani u the heavens;Keanu m cool breeze;Leilani f heavenly flowers;Malia f beloved;Moana f ocean;Nalani f calmness of the heavens;Koa m warrior, brave;Mana u spiritual power;Tane m man;Aroha f love;Nikau m palm tree`

export const NAMES: Name[] = RAW.split('\n#').flatMap((block) => {
  const [head, body] = block.replace(/^#/, '').split('\n')
  return body.split(';').map((e) => {
    const m = /^(\S+) ([mfu]) (.+)$/.exec(e.trim())!
    return { name: m[1], g: m[2] as Name['g'], origin: head, meaning: m[3] }
  })
})

export const ORIGINS = [...new Set(NAMES.map((n) => n.origin))]

/** Rough English syllable count (vowel groups, silent final e). */
export function syllables(word: string): number {
  const w = word.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.replace(/(?<=[^aeiouy])e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Damerau–Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** 0 = no match; higher is better. Exact > prefix > substring > typo-tolerant > meaning word match. */
export function score(n: Name, query: string): number {
  const q = fold(query.trim())
  if (!q) return 1
  const name = fold(n.name)
  if (name === q) return 100
  if (name.startsWith(q)) return 80 - (name.length - q.length)
  if (name.includes(q)) return 60
  const dist = editDistance(name.slice(0, Math.max(q.length, 3)), q)
  if (q.length >= 3 && dist <= (q.length > 5 ? 2 : 1)) return 45 - dist * 5
  const meaning = fold(n.meaning)
  if (q.length >= 3 && new RegExp(`\\b${q.replace(/[^a-z ]/g, '')}`).test(meaning)) return 30
  if (fold(n.origin).startsWith(q)) return 20
  return 0
}
