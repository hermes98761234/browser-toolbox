// Common clinical abbreviations (original compilation for reference/education), with the Joint
// Commission "Do Not Use" list and a selection of ISMP error-prone abbreviations flagged.
// Search reuses the fuzzy matcher from the food diary; a text checker scans notes for flagged items.
import { fuzzyScore } from './food-diary'

export type Cat = 'freq' | 'route' | 'dx' | 'lab' | 'proc' | 'exam' | 'vital' | 'chart' | 'drug' | 'org'
export const CATS: Record<Cat, string> = {
  freq: 'Dosing & frequency', route: 'Routes & forms', dx: 'Conditions', lab: 'Labs & tests', proc: 'Imaging & procedures',
  exam: 'Anatomy & exam', vital: 'Vitals & measures', chart: 'Charting & history', drug: 'Drugs & classes', org: 'Units & roles',
}
export type Flag = '' | 'dnu' | 'ismp'
export interface Abbr { abbr: string; meanings: string[]; cat: Cat; flag: Flag; note: string }

// abbr | meaning; meaning | cat | flag | note (for flagged: why + what to write instead)
const RAW = `
U|unit|freq|dnu|Mistaken for 0, 4 or "cc". Write "unit".
IU|International Unit|freq|dnu|Mistaken for IV or 10. Write "International Unit".
QD|every day (daily)|freq|dnu|Mistaken for QID; the period after Q read as "I". Write "daily".
Q.D.|every day (daily)|freq|dnu|Mistaken for QID. Write "daily".
QOD|every other day|freq|dnu|Mistaken for QD or QID. Write "every other day".
Q.O.D.|every other day|freq|dnu|Mistaken for Q.D. or Q.I.D. Write "every other day".
MS|morphine sulfate; magnesium sulfate; multiple sclerosis; mitral stenosis; mental status|drug|dnu|Morphine and magnesium sulfate confused. Write the full drug name.
MSO4|morphine sulfate|drug|dnu|Confused with magnesium sulfate. Write "morphine sulfate".
MgSO4|magnesium sulfate|drug|dnu|Confused with morphine sulfate. Write "magnesium sulfate".
X.0 mg|trailing zero after a decimal point|freq|dnu|"1.0 mg" read as 10 mg. Never write a zero after a decimal point: write "1 mg".
.X mg|missing leading zero before a decimal point|freq|dnu|".5 mg" read as 5 mg. Always write a leading zero: "0.5 mg".
µg|microgram|org|ismp|Mistaken for mg (1000-fold overdose). Write "mcg".
cc|cubic centimetre (= mL)|org|ismp|Mistaken for U (units) when poorly written. Write "mL".
AD|right ear; Alzheimer disease|exam|ismp|AD/AS/AU mistaken for OD/OS/OU (eyes). Write "right ear".
AS|left ear; aortic stenosis; ankylosing spondylitis|exam|ismp|Mistaken for OS (left eye). Write "left ear".
AU|each ear; both ears|exam|ismp|Mistaken for OU (each eye). Write "both ears".
OD|right eye; overdose; once daily (outside the US)|exam|ismp|Mistaken for AD or "once daily"; oral liquids have been put in eyes. Write "right eye".
OS|left eye|exam|ismp|Mistaken for AS (left ear) or "oral solution". Write "left eye".
OU|each eye; both eyes|exam|ismp|Mistaken for AU. Write "both eyes".
BT|bedtime|freq|ismp|Mistaken for BID. Write "bedtime".
D/C|discharge; discontinue|chart|ismp|Medicines stopped early when "discharge" was meant. Write the word in full.
HS|at bedtime (hora somni); half-strength|freq|ismp|Two opposite meanings. Write "bedtime" or "half-strength".
qhs|nightly at bedtime|freq|ismp|Mistaken for qhr (every hour). Write "nightly at bedtime".
qn|nightly|freq|ismp|Mistaken for qh (every hour). Write "nightly".
q1d|daily|freq|ismp|Mistaken for QID. Write "daily".
q6PM|every evening at 6 PM|freq|ismp|Mistaken for every 6 hours. Write "daily at 6 PM".
TIW|three times a week|freq|ismp|Mistaken for three times a day or twice weekly. Write "3 times weekly".
BIW|twice a week|freq|ismp|Mistaken for twice a day. Write "2 times weekly".
IN|intranasal|route|ismp|Mistaken for IM or IV. Write "intranasal" or "NAS".
IJ|injection; internal jugular|route|ismp|Mistaken for IV or intrajugular. Write "injection".
SC|subcutaneous|route|ismp|Mistaken for SL (sublingual). Write "subcut" or "subcutaneously".
SQ|subcutaneous|route|ismp|The Q mistaken for "5" ("5 every"). Write "subcut".
sub q|subcutaneous|route|ismp|The "q" read as "every". Write "subcut".
OJ|orange juice|chart|ismp|Mistaken for OD or OS; oral drugs given in the eye. Write "orange juice".
per os|by mouth|route|ismp|"os" read as left eye. Write "PO", "by mouth" or "orally".
ss|sliding scale (insulin); one-half (apothecary)|freq|ismp|Mistaken for "55". Write "sliding scale" or "one-half".
SSI|sliding scale insulin; sliding scale regimen|freq|ismp|Mistaken for Strong Solution of Iodine. Write in full.
SSRI|selective serotonin reuptake inhibitor; sliding scale regular insulin|drug|ismp|Two meanings with very different drugs. Write in full.
UD|as directed (ut dictum); unit dose|freq|ismp|Mistaken for unit dose, so a whole infusion was given. Write "as directed".
@|at|chart|ismp|Mistaken for "2". Write "at".
&|and|chart|ismp|Mistaken for "2". Write "and".
+|plus; and|chart|ismp|Mistaken for "4". Write "and".
>|greater than|chart|ismp|Read as its opposite (<). Write "more than" or "greater than".
<|less than|chart|ismp|Read as its opposite (>). Write "less than".
MTX|methotrexate; mitoxantrone|drug|ismp|Two cytotoxic drugs confused. Write the full drug name.
PCA|patient-controlled analgesia; procainamide|drug|ismp|Write the full name.
PTU|propylthiouracil|drug|ismp|Mistaken for mercaptopurine. Write the full drug name.
T3|liothyronine; Tylenol with codeine No. 3|drug|ismp|Write the full drug name.
TAC|triamcinolone; tetracaine, adrenaline (epinephrine) and cocaine|drug|ismp|Write the full drug name.
HCT|hydrocortisone; hematocrit|drug|ismp|Hydrocortisone confused with hydrochlorothiazide. Write in full.
HCTZ|hydrochlorothiazide|drug|ismp|Read as hydrocortisone (HCT 250 mg). Write the full drug name.
ZnSO4|zinc sulfate|drug|ismp|Mistaken for morphine sulfate. Write "zinc sulfate".
AZT|zidovudine|drug|ismp|Mistaken for azathioprine or aztreonam. Write the full drug name.
CPZ|prochlorperazine; chlorpromazine|drug|ismp|Two different drugs. Write the full drug name.
DPT|diphtheria-pertussis-tetanus vaccine; meperidine-promethazine-chlorpromazine|drug|ismp|Write in full.
APAP|acetaminophen (paracetamol)|drug|ismp|Not recognised by everyone, especially patients. Write "acetaminophen".
NOAC|novel/non-vitamin K oral anticoagulant|drug|ismp|Read as "no anticoagulant". Write "DOAC" or the drug name.
tPA|tissue plasminogen activator (alteplase)|drug|ismp|Confused with other "-ase" drugs (e.g. tenecteplase). Write the drug name.
o.d.|once daily|freq|ismp|Mistaken for right eye (OD). Write "daily".
i/d|one daily|freq|ismp|Mistaken for TID. Write "1 daily".
x3d|for three days|freq|ismp|Mistaken for "three doses". Write "for 3 days".
BID|twice a day|freq||
TID|three times a day|freq||
QID|four times a day|freq||
q4h|every 4 hours|freq||
q6h|every 6 hours|freq||
q8h|every 8 hours|freq||
q12h|every 12 hours|freq||
qAM|every morning|freq||
qPM|every evening|freq||
PRN|as needed (pro re nata)|freq||
STAT|immediately|freq||
AC|before meals (ante cibum)|freq||
PC|after meals (post cibum)|freq||
NPO|nothing by mouth (nil per os)|freq||
ad lib|as desired, freely|freq||
gtt|drops|freq||
tab|tablet|route||
cap|capsule|route||
susp|suspension|route||
supp|suppository|route||
ER|extended release; emergency room|route||
XR|extended release|route||
SR|sustained release; sinus rhythm|route||
IR|immediate release|route||
ODT|orally disintegrating tablet|route||
PO|by mouth (per os)|route||
SL|sublingual|route||
IV|intravenous|route||
IVP|intravenous push; intravenous pyelogram|route||
IVPB|intravenous piggyback|route||
IM|intramuscular; internal medicine|route||
ID|intradermal; infectious disease; identification|route||
PR|per rectum; pulse rate; PR interval|route||
PV|per vagina; polycythemia vera|route||
TD|transdermal|route||
INH|inhaled; isoniazid|route||
NEB|nebulizer|route||
MDI|metered-dose inhaler|route||
NG|nasogastric|route||
NGT|nasogastric tube|route||
PEG|percutaneous endoscopic gastrostomy; polyethylene glycol|route||
PICC|peripherally inserted central catheter|route||
CVC|central venous catheter|route||
TPN|total parenteral nutrition|route||
KVO|keep vein open|route||
TKO|to keep open (IV rate)|route||
BP|blood pressure|vital||
HR|heart rate|vital||
RR|respiratory rate|vital||
T|temperature|vital||
SpO2|peripheral oxygen saturation (pulse oximetry)|vital||
O2 sat|oxygen saturation|vital||
MAP|mean arterial pressure|vital||
BMI|body mass index|vital||
Wt|weight|vital||
Ht|height|vital||
I&O|intake and output|vital||
VS|vital signs|vital||
VSS|vital signs stable|vital||
GCS|Glasgow Coma Scale|vital||
BSA|body surface area|vital||
CVP|central venous pressure|vital||
EBL|estimated blood loss|vital||
LOC|level of consciousness; loss of consciousness|vital||
A&O x3|alert and oriented to person, place and time|exam||
AAOx4|awake, alert and oriented to person, place, time and situation|exam||
PERRLA|pupils equal, round, reactive to light and accommodation|exam||
EOMI|extraocular movements intact|exam||
HEENT|head, eyes, ears, nose and throat|exam||
JVD|jugular venous distension|exam||
RRR|regular rate and rhythm|exam||
CTA|clear to auscultation; CT angiography|exam||
CTAB|clear to auscultation bilaterally|exam||
BS|bowel sounds; breath sounds; blood sugar|exam||
NT/ND|non-tender, non-distended|exam||
ROM|range of motion; rupture of membranes|exam||
DTR|deep tendon reflexes|exam||
LUQ|left upper quadrant|exam||
RUQ|right upper quadrant|exam||
LLQ|left lower quadrant|exam||
RLQ|right lower quadrant|exam||
LE|lower extremity; lupus erythematosus|exam||
UE|upper extremity|exam||
CN|cranial nerves|exam||
WNL|within normal limits|exam||
NAD|no acute distress|exam||
c/o|complains of|chart||
CC|chief complaint|chart||
HPI|history of present illness|chart||
PMH|past medical history|chart||
PSH|past surgical history|chart||
FH|family history|chart||
SH|social history|chart||
ROS|review of systems|chart||
Hx|history|chart||
Dx|diagnosis|chart||
DDx|differential diagnosis|chart||
Tx|treatment; transplant|chart||
Rx|prescription; treatment|chart||
Sx|symptoms; surgery|chart||
Fx|fracture|chart||
s/p|status post (after)|chart||
r/o|rule out|chart||
w/|with|chart||
w/o|without|chart||
y/o|years old|chart||
NKDA|no known drug allergies|chart||
NKA|no known allergies|chart||
DNR|do not resuscitate|chart||
DNI|do not intubate|chart||
AMA|against medical advice; American Medical Association|chart||
SOAP|subjective, objective, assessment, plan|chart||
A/P|assessment and plan|chart||
f/u|follow-up|chart||
RTC|return to clinic|chart||
LMP|last menstrual period|chart||
G P|gravida (pregnancies), para (births)|chart||
ETOH|ethanol (alcohol)|chart||
SOB|shortness of breath|dx||
DOE|dyspnea on exertion|dx||
CP|chest pain; cerebral palsy|dx||
N/V|nausea and vomiting|dx||
N/V/D|nausea, vomiting and diarrhea|dx||
HA|headache|dx||
LBP|low back pain|dx||
HTN|hypertension|dx||
DM|diabetes mellitus; dermatomyositis|dx||
T1DM|type 1 diabetes mellitus|dx||
T2DM|type 2 diabetes mellitus|dx||
DKA|diabetic ketoacidosis|dx||
CAD|coronary artery disease|dx||
CHF|congestive heart failure|dx||
HF|heart failure|dx||
HFrEF|heart failure with reduced ejection fraction|dx||
MI|myocardial infarction; mitral insufficiency|dx||
STEMI|ST-elevation myocardial infarction|dx||
NSTEMI|non-ST-elevation myocardial infarction|dx||
ACS|acute coronary syndrome|dx||
AF|atrial fibrillation; amniotic fluid|dx||
AFib|atrial fibrillation|dx||
VT|ventricular tachycardia|dx||
VF|ventricular fibrillation|dx||
SVT|supraventricular tachycardia|dx||
PE|pulmonary embolism; physical examination; pleural effusion|dx||
DVT|deep vein thrombosis|dx||
VTE|venous thromboembolism|dx||
CVA|cerebrovascular accident (stroke); costovertebral angle|dx||
TIA|transient ischemic attack|dx||
COPD|chronic obstructive pulmonary disease|dx||
ARDS|acute respiratory distress syndrome|dx||
URI|upper respiratory infection|dx||
UTI|urinary tract infection|dx||
CAP|community-acquired pneumonia|dx||
TB|tuberculosis|dx||
HIV|human immunodeficiency virus|dx||
CKD|chronic kidney disease|dx||
AKI|acute kidney injury|dx||
ARF|acute renal failure; acute respiratory failure; acute rheumatic fever|dx||
ESRD|end-stage renal disease|dx||
GERD|gastroesophageal reflux disease|dx||
GI|gastrointestinal|dx||
IBD|inflammatory bowel disease|dx||
IBS|irritable bowel syndrome|dx||
PUD|peptic ulcer disease|dx||
RA|rheumatoid arthritis; right atrium; room air|dx||
OA|osteoarthritis|dx||
SLE|systemic lupus erythematosus|dx||
CA|cancer (carcinoma); calcium; cardiac arrest|dx||
Ca|calcium; cancer|dx||
PD|Parkinson disease; peritoneal dialysis|dx||
MR|mitral regurgitation; magnetic resonance|dx||
AR|aortic regurgitation; allergic rhinitis|dx||
PID|pelvic inflammatory disease|dx||
BPH|benign prostatic hyperplasia|dx||
ED|emergency department; erectile dysfunction|org||
OSA|obstructive sleep apnea|dx||
MDD|major depressive disorder|dx||
GAD|generalized anxiety disorder|dx||
PTSD|post-traumatic stress disorder|dx||
ADHD|attention-deficit/hyperactivity disorder|dx||
SIRS|systemic inflammatory response syndrome|dx||
MRSA|methicillin-resistant Staphylococcus aureus|dx||
CBC|complete blood count|lab||
BMP|basic metabolic panel|lab||
CMP|comprehensive metabolic panel|lab||
LFT|liver function tests|lab||
BUN|blood urea nitrogen|lab||
Cr|creatinine|lab||
eGFR|estimated glomerular filtration rate|lab||
Hb|hemoglobin|lab||
Hgb|hemoglobin|lab||
Hct|hematocrit|lab||
WBC|white blood cell (count)|lab||
RBC|red blood cell (count)|lab||
Plt|platelets|lab||
INR|international normalized ratio|lab||
PT|prothrombin time; physical therapy; patient|lab||
PTT|partial thromboplastin time|lab||
aPTT|activated partial thromboplastin time|lab||
HbA1c|glycated hemoglobin|lab||
FBG|fasting blood glucose|lab||
BG|blood glucose|lab||
TSH|thyroid-stimulating hormone|lab||
ABG|arterial blood gas|lab||
VBG|venous blood gas|lab||
UA|urinalysis|lab||
C&S|culture and sensitivity|lab||
ESR|erythrocyte sedimentation rate|lab||
CRP|C-reactive protein|lab||
BNP|B-type natriuretic peptide|lab||
CK|creatine kinase|lab||
LDH|lactate dehydrogenase|lab||
ALT|alanine aminotransferase|lab||
AST|aspartate aminotransferase|lab||
ALP|alkaline phosphatase|lab||
K|potassium|lab||
Na|sodium|lab||
Cl|chloride|lab||
Mg|magnesium|lab||
PO4|phosphate|lab||
LDL|low-density lipoprotein|lab||
HDL|high-density lipoprotein|lab||
PSA|prostate-specific antigen|lab||
hCG|human chorionic gonadotropin|lab||
ECG|electrocardiogram|proc||
EKG|electrocardiogram|proc||
EEG|electroencephalogram|proc||
EMG|electromyography|proc||
CXR|chest X-ray|proc||
KUB|kidneys, ureters, bladder (abdominal X-ray)|proc||
CT|computed tomography|proc||
MRI|magnetic resonance imaging|proc||
US|ultrasound|proc||
TTE|transthoracic echocardiogram|proc||
TEE|transesophageal echocardiogram|proc||
EGD|esophagogastroduodenoscopy|proc||
ERCP|endoscopic retrograde cholangiopancreatography|proc||
LP|lumbar puncture|proc||
PCI|percutaneous coronary intervention|proc||
CABG|coronary artery bypass graft|proc||
CPR|cardiopulmonary resuscitation|proc||
ACLS|advanced cardiac life support|proc||
BLS|basic life support|proc||
I&D|incision and drainage|proc||
ORIF|open reduction internal fixation|proc||
TKA|total knee arthroplasty|proc||
THA|total hip arthroplasty|proc||
D&C|dilation and curettage|proc||
C-section|cesarean section|proc||
ETT|endotracheal tube; exercise tolerance test|proc||
BiPAP|bilevel positive airway pressure|proc||
CPAP|continuous positive airway pressure|proc||
NC|nasal cannula|proc||
NRB|non-rebreather mask|proc||
Foley|indwelling urinary catheter|proc||
ASA|aspirin (acetylsalicylic acid); American Society of Anesthesiologists (class)|drug||
NSAID|non-steroidal anti-inflammatory drug|drug||
ACEi|angiotensin-converting enzyme inhibitor|drug||
ARB|angiotensin II receptor blocker|drug||
BB|beta-blocker|drug||
CCB|calcium channel blocker|drug||
PPI|proton pump inhibitor|drug||
DOAC|direct oral anticoagulant|drug||
LMWH|low-molecular-weight heparin|drug||
UFH|unfractionated heparin|drug||
NTG|nitroglycerin|drug||
KCl|potassium chloride|drug||
NS|normal saline (0.9% sodium chloride)|drug||
LR|lactated Ringer's solution|drug||
D5W|5% dextrose in water|drug||
abx|antibiotics|drug||
OTC|over the counter|drug||
mg|milligram|org||
mcg|microgram|org||
g|gram|org||
kg|kilogram|org||
mL|millilitre|org||
L|litre; left|org||
mEq|milliequivalent|org||
mmol|millimole|org||
ICU|intensive care unit|org||
CCU|coronary care unit|org||
NICU|neonatal intensive care unit|org||
PICU|pediatric intensive care unit|org||
OR|operating room|org||
PACU|post-anesthesia care unit|org||
L&D|labor and delivery|org||
OT|occupational therapy|org||
RT|respiratory therapy; radiation therapy|org||
SLP|speech-language pathologist|org||
RN|registered nurse|org||
NP|nurse practitioner|org||
PA|physician assistant; pulmonary artery; posteroanterior|org||
MD|doctor of medicine|org||
PCP|primary care provider; Pneumocystis pneumonia|org||
EMS|emergency medical services|org||
`

export const ABBRS: Abbr[] = RAW.trim().split('\n').map((l) => {
  const [abbr, m, cat, flag, note] = l.split('|')
  return { abbr, meanings: m.split('; '), cat: cat as Cat, flag: (flag ?? '') as Flag, note: note ?? '' }
})

export const key = (s: string) => s.toLowerCase().replace(/[.\s]/g, '')

/** Ranked search: exact abbreviation (ignoring case/dots) first, then abbreviation prefix, then fuzzy meanings. */
export function search(q: string, list: Abbr[] = ABBRS): Abbr[] {
  const k = key(q)
  if (!k) return list
  return list
    .map((a) => {
      const ak = key(a.abbr)
      let sc = 0
      if (ak === k) sc = 1000 + (a.abbr === q.trim() ? 50 : 0)
      else if (ak.startsWith(k)) sc = 500 - ak.length
      const f = Math.max(...a.meanings.map((m) => fuzzyScore(q, m)))
      if (q.trim().length >= 3) sc = Math.max(sc, f > 0 ? 100 + f : 0)
      return { a, sc }
    })
    .filter((x) => x.sc > 0)
    .sort((x, y) => y.sc - x.sc)
    .map((x) => x.a)
}

export interface Finding { at: number; text: string; entry?: Abbr; kind: 'dnu' | 'ismp' }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Matched regardless of case; every other flagged abbreviation must match exactly (so "in", "as", "CC" are not flagged).
const ANY_CASE = new Set(['QD', 'Q.D.', 'QOD', 'Q.O.D.', 'qhs', 'qn', 'q1d', 'q6PM', 'MSO4', 'MgSO4', 'HCTZ', 'SSRI', 'NOAC', 'APAP', 'ZnSO4', 'tPA', 'per os', 'sub q', 'o.d.', 'x3d', 'TIW', 'BIW', 'D/C', 'SQ'])
const SKIP = new Set(['X.0 mg', '.X mg', '+', '<', '>', '&'])
const UNIT = String.raw`\s?(?:mg|mcg|g|mL|ml|units?|mEq|mmol|tabs?|%)\b`
const PATTERNS = ABBRS.filter((a) => a.flag && !SKIP.has(a.abbr)).map((a) => {
  const body = a.abbr.includes('.') ? a.abbr.split('.').filter(Boolean).map(esc).join('\\.?\\s?') + '\\.?' : esc(a.abbr)
  return { a, re: new RegExp(a.abbr === '@' ? body : `(?<![\\w.])${body}(?![\\w])`, ANY_CASE.has(a.abbr) ? 'gi' : 'g') }
})

/**
 * Scans free text for Do-Not-Use / error-prone abbreviations, trailing zeros ("5.0 mg") and missing
 * leading zeros (".5 mg") in doses.
 */
export function scan(text: string): Finding[] {
  const out: Finding[] = []
  for (const { a, re } of PATTERNS) for (const m of text.matchAll(re)) out.push({ at: m.index!, text: m[0], entry: a, kind: a.flag as 'dnu' | 'ismp' })
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\d.])\d+\.0+${UNIT}`, 'g'))) out.push({ at: m.index!, text: m[0], entry: ABBRS.find((a) => a.abbr === 'X.0 mg'), kind: 'dnu' })
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\d\w.])\.\d+${UNIT}`, 'g'))) out.push({ at: m.index!, text: m[0], entry: ABBRS.find((a) => a.abbr === '.X mg'), kind: 'dnu' })
  // keep the longest match at each position, drop overlaps
  out.sort((a, b) => a.at - b.at || b.text.length - a.text.length)
  return out.filter((f, i) => !out.slice(0, i).some((g) => f.at >= g.at && f.at < g.at + g.text.length))
}
