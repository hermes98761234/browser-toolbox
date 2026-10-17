// User-agent string parser: browser, engine, OS, device type/vendor/model, bots.

export interface UA {
  ua: string
  browser: string
  version: string
  engine: string
  engineVersion: string
  os: string
  osVersion: string
  device: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'console' | 'wearable' | 'bot' | 'unknown'
  vendor: string
  model: string
  bot: string
  notes: string[]
}

const m1 = (s: string, re: RegExp) => re.exec(s)?.[1] ?? ''

const BOTS: [RegExp, string][] = [
  [/Googlebot(?:-[\w]+)?\/?([\d.]*)/i, 'Googlebot'], [/bingbot\/([\d.]+)/i, 'Bingbot'], [/DuckDuckBot/i, 'DuckDuckBot'], [/YandexBot/i, 'YandexBot'],
  [/Baiduspider/i, 'Baiduspider'], [/Applebot/i, 'Applebot'], [/facebookexternalhit|facebookcatalog/i, 'Facebook crawler'], [/Twitterbot/i, 'Twitterbot'],
  [/LinkedInBot/i, 'LinkedInBot'], [/Slackbot/i, 'Slackbot'], [/Discordbot/i, 'Discordbot'], [/GPTBot/i, 'GPTBot'], [/ClaudeBot|Claude-Web/i, 'ClaudeBot'],
  [/PerplexityBot/i, 'PerplexityBot'], [/AhrefsBot/i, 'AhrefsBot'], [/SemrushBot/i, 'SemrushBot'], [/HeadlessChrome/i, 'Headless Chrome'],
  [/^curl\//i, 'curl'], [/^Wget\//i, 'Wget'], [/python-requests|Python-urllib|aiohttp/i, 'Python HTTP client'], [/^okhttp/i, 'OkHttp'], [/Go-http-client/i, 'Go HTTP client'],
  [/node-fetch|axios|undici/i, 'Node.js HTTP client'], [/^PostmanRuntime/i, 'Postman'], [/bot\b|crawler|spider|scraper/i, 'Generic bot'],
]

const WIN: Record<string, string> = { '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP', '5.2': 'XP x64' }

export function parseUA(raw: string): UA {
  const ua = raw.trim()
  const r: UA = { ua, browser: 'Unknown', version: '', engine: 'Unknown', engineVersion: '', os: 'Unknown', osVersion: '', device: 'unknown', vendor: '', model: '', bot: '', notes: [] }
  if (!ua) return r

  for (const [re, name] of BOTS) {
    const m = re.exec(ua)
    if (m) {
      r.bot = name
      r.device = 'bot'
      break
    }
  }

  // ----- OS -----
  let m: RegExpExecArray | null
  if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
    r.os = 'Windows'
    r.osVersion = WIN[m[1]] ?? m[1]
    if (m[1] === '10.0') r.notes.push('Windows 11 still reports "Windows NT 10.0"; use client hints (platformVersion ≥ 13) to tell them apart.')
  } else if ((m = /Windows Phone(?: OS)? ([\d.]+)/.exec(ua))) [r.os, r.osVersion] = ['Windows Phone', m[1]]
  else if ((m = /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua))) [r.os, r.osVersion] = [/iPad/.test(ua) ? 'iPadOS' : 'iOS', m[1].replace(/_/g, '.')]
  else if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) {
    r.os = 'macOS'
    r.osVersion = m[1].replace(/_/g, '.')
    if (r.osVersion === '10.15.7') r.notes.push('Browsers freeze macOS at 10.15.7 in the UA string; the real version may be newer.')
  } else if ((m = /HarmonyOS[ /]?([\d.]*)/.exec(ua))) [r.os, r.osVersion] = ['HarmonyOS', m[1]]
  else if ((m = /Android[ /]?([\d.]*)/.exec(ua))) [r.os, r.osVersion] = ['Android', m[1]]
  else if ((m = /CrOS \S+ ([\d.]+)/.exec(ua))) [r.os, r.osVersion] = ['ChromeOS', m[1]]
  else if (/Tizen/.test(ua)) [r.os, r.osVersion] = ['Tizen', m1(ua, /Tizen ([\d.]+)/)]
  else if (/Web0S|webOS/.test(ua)) r.os = 'webOS'
  else if (/PlayStation/.test(ua)) r.os = 'PlayStation'
  else if (/Xbox/.test(ua)) r.os = 'Xbox'
  else if (/Nintendo/.test(ua)) r.os = 'Nintendo'
  else if (/FreeBSD/.test(ua)) r.os = 'FreeBSD'
  else if (/Ubuntu/.test(ua)) r.os = 'Ubuntu'
  else if (/Fedora/.test(ua)) r.os = 'Fedora'
  else if (/Linux|X11/.test(ua)) r.os = 'Linux'

  // ----- engine -----
  if (/Gecko\/\d/.test(ua) && !/like Gecko/.test(ua)) [r.engine, r.engineVersion] = ['Gecko', m1(ua, /rv:([\d.]+)/)]
  else if ((m = /rv:([\d.]+)\) like Gecko/.exec(ua)) || (m = /Trident\/([\d.]+)/.exec(ua))) [r.engine, r.engineVersion] = ['Trident', m1(ua, /Trident\/([\d.]+)/) || m[1]]
  else if ((m = /Edge\/([\d.]+)/.exec(ua))) [r.engine, r.engineVersion] = ['EdgeHTML', m[1]]
  else if ((m = /Chrom(?:e|ium)\/([\d.]+)/.exec(ua))) [r.engine, r.engineVersion] = ['Blink', m[1]]
  else if ((m = /AppleWebKit\/([\d.]+)/.exec(ua))) [r.engine, r.engineVersion] = ['WebKit', m[1]]
  else if ((m = /Presto\/([\d.]+)/.exec(ua))) [r.engine, r.engineVersion] = ['Presto', m[1]]

  // ----- browser (order matters: most specific first) -----
  const B: [RegExp, string][] = [
    [/EdgA?\/([\d.]+)/, 'Microsoft Edge'], [/EdgiOS\/([\d.]+)/, 'Microsoft Edge'], [/Edge\/([\d.]+)/, 'Microsoft Edge (Legacy)'],
    [/OPR\/([\d.]+)/, 'Opera'], [/OPiOS\/([\d.]+)/, 'Opera'], [/Opera.*Version\/([\d.]+)/, 'Opera'], [/OPT\/([\d.]+)/, 'Opera Touch'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'], [/YaBrowser\/([\d.]+)/, 'Yandex Browser'], [/UCBrowser\/([\d.]+)/, 'UC Browser'],
    [/Vivaldi\/([\d.]+)/, 'Vivaldi'], [/Brave\/([\d.]+)/, 'Brave'], [/DuckDuckGo\/([\d.]+)/, 'DuckDuckGo'], [/Whale\/([\d.]+)/, 'Naver Whale'],
    [/FBAV\/([\d.]+)/, 'Facebook in-app'], [/Instagram ([\d.]+)/, 'Instagram in-app'], [/Line\/([\d.]+)/, 'LINE in-app'], [/MicroMessenger\/([\d.]+)/, 'WeChat in-app'],
    [/FxiOS\/([\d.]+)/, 'Firefox'], [/Firefox\/([\d.]+)/, 'Firefox'], [/CriOS\/([\d.]+)/, 'Chrome'], [/HeadlessChrome\/([\d.]+)/, 'Headless Chrome'],
    [/; wv\).*Chrome\/([\d.]+)/, 'Android WebView'], [/Chromium\/([\d.]+)/, 'Chromium'], [/Chrome\/([\d.]+)/, 'Chrome'],
    [/MSIE ([\d.]+)/, 'Internet Explorer'], [/Trident\/.*rv:([\d.]+)/, 'Internet Explorer'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'], [/Version\/([\d.]+).*Mobile\//, 'Safari'], [/(?:iPhone|iPad).*AppleWebKit(?!.*Safari)/, 'iOS WebView'],
  ]
  for (const [re, name] of B) {
    const mm = re.exec(ua)
    if (mm) {
      r.browser = name
      r.version = mm[1] ?? ''
      break
    }
  }
  if (r.browser === 'Unknown' && r.bot) r.browser = r.bot
  if (/(CriOS|FxiOS|EdgiOS|OPiOS)\//.test(ua)) r.notes.push('On iOS every browser uses Apple’s WebKit engine.')
  if (/iPhone|iPad|iPod/.test(ua)) [r.engine, r.engineVersion] = ['WebKit', m1(ua, /AppleWebKit\/([\d.]+)/)]
  if (r.engine === 'Blink' && /\.0\.0\.0$/.test(r.engineVersion)) r.notes.push('Reduced UA: Chrome only reports the major version; use client hints for the full version.')

  // ----- device -----
  if (r.device !== 'bot') {
    if (/iPad/.test(ua)) [r.device, r.vendor, r.model] = ['tablet', 'Apple', 'iPad']
    else if (/iPhone/.test(ua)) [r.device, r.vendor, r.model] = ['mobile', 'Apple', 'iPhone']
    else if (/iPod/.test(ua)) [r.device, r.vendor, r.model] = ['mobile', 'Apple', 'iPod touch']
    else if (/SMART-TV|SmartTV|Tizen.*TV|Web0S|webOS.*TV|AppleTV|CrKey|AFT[A-Z]|BRAVIA|HbbTV|GoogleTV|Android TV/i.test(ua)) r.device = 'tv'
    else if (/PlayStation|Xbox|Nintendo/.test(ua)) r.device = 'console'
    else if (/Watch|Wear OS|wv\) Mobile.*Watch/i.test(ua)) r.device = 'wearable'
    else if (/Android/.test(ua)) {
      r.device = /Mobile/.test(ua) ? 'mobile' : 'tablet'
      const model = m1(ua, /Android[^;)]*;(?: [a-z]{2}[-_][a-zA-Z]{2};)? ?([^;)]+?)(?: Build\/[^;)]*)?\)/).trim()
      if (model && model !== 'K' && !/^(wv|Linux|U)$/.test(model)) r.model = model
      else if (model === 'K') r.notes.push('Model hidden by UA reduction (“K”); request the "model" client hint.')
      r.vendor = /^SM-|^GT-|Samsung/i.test(r.model) ? 'Samsung' : /^Pixel/.test(r.model) ? 'Google' : /^(Redmi|Mi |M\d{4}|2\d{3})/.test(r.model) ? 'Xiaomi' : /^(CPH|OPPO)/.test(r.model) ? 'OPPO' : /^(RMX)/.test(r.model) ? 'Realme' : /^(VOG|ELE|LYA|HUAWEI|ANE|MAR)/.test(r.model) ? 'Huawei' : /^(moto|XT\d)/i.test(r.model) ? 'Motorola' : /^(SO-|XQ-|Xperia)/.test(r.model) ? 'Sony' : /^(LM-|LG)/.test(r.model) ? 'LG' : /^(ONEPLUS|IN20|KB20|LE21|NE22|CPH25)/i.test(r.model) ? 'OnePlus' : /^(Nokia|TA-)/.test(r.model) ? 'Nokia' : ''
    } else if (/Mobile|Opera Mini|IEMobile|Windows Phone/.test(ua)) r.device = 'mobile'
    else if (/Windows|Macintosh|Mac OS X|X11|Linux|CrOS/.test(ua)) r.device = 'desktop'
    if (r.os === 'macOS' && /Macintosh/.test(ua)) [r.vendor, r.model] = ['Apple', 'Mac']
    if (r.os === 'macOS' && r.browser === 'Safari') r.notes.push('iPads in desktop mode send this same Mac UA — check navigator.maxTouchPoints > 1.')
  }
  return r
}

export const majorVersion = (v: string) => v.split('.')[0] ?? ''
