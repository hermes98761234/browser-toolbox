// HTML entity encoding/decoding with a compact named-entity table (HTML 4 set + common HTML5 additions),
// numeric references (with the HTML spec's Windows-1252 remapping) and a per-code-point inspector.

const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
const GREEK_U = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho _ Sigma Tau Upsilon Phi Chi Psi Omega'
const OTHER = `quot 34 amp 38 apos 39 lt 60 gt 62 Tab 9 NewLine 10 excl 33 num 35 dollar 36 percnt 37 lpar 40 rpar 41 ast 42 plus 43 comma 44 period 46 sol 47 colon 58
semi 59 equals 61 quest 63 commat 64 lsqb 91 bsol 92 rsqb 93 Hat 94 lowbar 95 grave 96 lcub 123 verbar 124 rcub 125 OElig 338 oelig 339 Scaron 352 scaron 353 Yuml 376
fnof 402 circ 710 tilde 732 thetasym 977 upsih 978 piv 982 ensp 8194 emsp 8195 thinsp 8201 zwnj 8204 zwj 8205 lrm 8206 rlm 8207 ndash 8211 mdash 8212 lsquo 8216 rsquo 8217
sbquo 8218 ldquo 8220 rdquo 8221 bdquo 8222 dagger 8224 Dagger 8225 bull 8226 hellip 8230 permil 8240 prime 8242 Prime 8243 lsaquo 8249 rsaquo 8250 oline 8254 frasl 8260
euro 8364 image 8465 weierp 8472 real 8476 trade 8482 alefsym 8501 larr 8592 uarr 8593 rarr 8594 darr 8595 harr 8596 crarr 8629 lArr 8656 uArr 8657 rArr 8658 dArr 8659
hArr 8660 forall 8704 part 8706 exist 8707 empty 8709 nabla 8711 isin 8712 notin 8713 ni 8715 prod 8719 sum 8721 minus 8722 lowast 8727 radic 8730 prop 8733 infin 8734
ang 8736 and 8743 or 8744 cap 8745 cup 8746 int 8747 there4 8756 sim 8764 cong 8773 asymp 8776 ne 8800 equiv 8801 le 8804 ge 8805 sub 8834 sup 8835 nsub 8836 sube 8838
supe 8839 oplus 8853 otimes 8855 perp 8869 sdot 8901 lceil 8968 rceil 8969 lfloor 8970 rfloor 8971 lang 10216 rang 10217 loz 9674 spades 9824 clubs 9827 hearts 9829
diams 9830 starf 9733 star 9734 phone 9742 female 9792 male 9794 flat 9837 natural 9838 sharp 9839 check 10003 cross 10007 sext 10038 hyphen 8208 nbhy 8209 numsp 8199
puncsp 8200 hairsp 8202 ZeroWidthSpace 8203`

/** name → code point */
export const NAMED: Record<string, number> = {}
LATIN1.split(' ').forEach((n, i) => (NAMED[n] = 160 + i))
GREEK_U.split(' ').forEach((n, i) => {
  if (n !== '_') {
    NAMED[n] = 913 + i
    NAMED[n.toLowerCase()] = 945 + i
  }
})
NAMED.sigmaf = 962
const o = OTHER.split(/\s+/)
for (let i = 0; i + 1 < o.length; i += 2) NAMED[o[i]] = Number(o[i + 1])

/** code point → preferred name (first one wins) */
export const NAME_OF: Record<number, string> = {}
for (const [n, cp] of Object.entries(NAMED)) if (!(cp in NAME_OF) && n !== 'Tab' && n !== 'NewLine') NAME_OF[cp] = n

// HTML spec: numeric references 0x80–0x9F are interpreted as Windows-1252.
const CP1252: Record<number, number> = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 }

export function numericToChar(cp: number): string {
  if (CP1252[cp]) return String.fromCodePoint(CP1252[cp])
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�'
  return String.fromCodePoint(cp)
}

/** Decodes numeric and named references. Unknown names go to `fallback` (e.g. the browser's parser) or stay as-is. */
export function decode(s: string, fallback?: (entity: string) => string | null): { text: string; count: number; unknown: string[] } {
  let count = 0
  const unknown: string[] = []
  const text = s.replace(/&(?:#(\d+)|#[xX]([\da-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g, (m, dec?: string, hex?: string, name?: string) => {
    if (dec || hex) {
      count++
      return numericToChar(parseInt(dec ?? hex!, dec ? 10 : 16))
    }
    if (!m.endsWith(';')) return m
    if (name! in NAMED) {
      count++
      return String.fromCodePoint(NAMED[name!])
    }
    const f = fallback?.(m)
    if (f != null && f !== m) {
      count++
      return f
    }
    unknown.push(m)
    return m
  })
  return { text, count, unknown: [...new Set(unknown)] }
}

export type Scope = 'basic' | 'nonascii' | 'all'
export type Form = 'named' | 'decimal' | 'hex'

export function ref(cp: number, form: Form): string {
  if (form === 'named' && NAME_OF[cp]) return `&${NAME_OF[cp]};`
  return form === 'decimal' ? `&#${cp};` : `&#x${cp.toString(16).toUpperCase()};`
}

/** Encodes text. basic: & < > " ' · nonascii: basic + everything above U+007E · all: everything but letters, digits, spaces and newlines. */
export function encode(s: string, scope: Scope, form: Form, keepNewlines = true): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    const basic = cp === 38 || cp === 60 || cp === 62 || cp === 34 || cp === 39
    const enc = basic || (scope !== 'basic' && cp > 126) || (scope === 'all' && !/[A-Za-z0-9 ]/.test(ch) && !(keepNewlines && (ch === '\n' || ch === '\r')))
    out += enc ? ref(cp, form === 'named' && cp === 39 ? 'decimal' : form) : ch
  }
  return out
}

export function utf8(cp: number): number[] {
  return [...new TextEncoder().encode(String.fromCodePoint(cp))]
}

export function category(ch: string): string {
  if (/\p{Extended_Pictographic}/u.test(ch)) return 'Emoji / pictograph'
  if (/\p{Lu}/u.test(ch)) return 'Uppercase letter'
  if (/\p{Ll}/u.test(ch)) return 'Lowercase letter'
  if (/\p{L}/u.test(ch)) return 'Letter'
  if (/\p{M}/u.test(ch)) return 'Combining mark'
  if (/\p{N}/u.test(ch)) return 'Number'
  if (/\p{Zs}/u.test(ch)) return 'Space'
  if (/\p{P}/u.test(ch)) return 'Punctuation'
  if (/\p{Sc}/u.test(ch)) return 'Currency symbol'
  if (/\p{S}/u.test(ch)) return 'Symbol'
  if (/\p{Cf}/u.test(ch)) return 'Format (invisible)'
  if (/\p{Cc}/u.test(ch)) return 'Control'
  return 'Other'
}

export interface CpInfo { ch: string; cp: number; hex: string; cat: string; utf8: string; utf16: string; named: string; js: string; css: string; url: string }

export function inspect(text: string, max = 200): CpInfo[] {
  const out: CpInfo[] = []
  for (const ch of text) {
    if (out.length >= max) break
    const cp = ch.codePointAt(0)!
    const u16 = Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'))
    out.push({
      ch, cp, hex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), cat: category(ch),
      utf8: utf8(cp).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      utf16: u16.join(' '),
      named: NAME_OF[cp] ? `&${NAME_OF[cp]};` : '',
      js: cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`,
      css: `\\${cp.toString(16).toUpperCase()}`,
      url: encodeURIComponent(ch),
    })
  }
  return out
}
