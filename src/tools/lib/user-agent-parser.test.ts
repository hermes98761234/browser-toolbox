import { describe, expect, it } from 'vitest'
import { parseUA } from './user-agent-parser'

const pick = (ua: string) => {
  const r = parseUA(ua)
  return [r.browser, r.version.split('.')[0], r.engine, r.os, r.osVersion, r.device, r.vendor, r.model]
}

describe('parseUA', () => {
  it('Chrome on Windows', () => expect(pick('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')).toEqual(['Chrome', '124', 'Blink', 'Windows', '10 / 11', 'desktop', '', '']))
  it('Edge', () => expect(pick('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80')[0]).toBe('Microsoft Edge'))
  it('Firefox on Linux', () => expect(pick('Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0')).toEqual(['Firefox', '125', 'Gecko', 'Linux', '', 'desktop', '', '']))
  it('Safari on macOS', () => expect(pick('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15')).toEqual(['Safari', '17', 'WebKit', 'macOS', '10.15.7', 'desktop', 'Apple', 'Mac']))
  it('Safari on iPhone', () => expect(pick('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toEqual(['Safari', '17', 'WebKit', 'iOS', '17.4', 'mobile', 'Apple', 'iPhone']))
  it('Chrome on iPad uses WebKit', () => {
    const r = parseUA('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1')
    expect([r.browser, r.engine, r.os, r.device]).toEqual(['Chrome', 'WebKit', 'iPadOS', 'tablet'])
  })
  it('Samsung Internet on Galaxy', () => expect(pick('Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36')).toEqual(['Samsung Internet', '23', 'Blink', 'Android', '13', 'mobile', 'Samsung', 'SM-S911B']))
  it('Pixel with Build tag and reduced K model', () => {
    expect(parseUA('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240305.019) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.99 Mobile Safari/537.36').model).toBe('Pixel 8')
    expect(parseUA('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36').model).toBe('')
  })
  it('Android tablet and IE11', () => {
    expect(parseUA('Mozilla/5.0 (Linux; Android 12; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36').device).toBe('tablet')
    expect(pick('Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko').slice(0, 5)).toEqual(['Internet Explorer', '11', 'Trident', 'Windows', '7'])
  })
  it('bots and tools', () => {
    expect(parseUA('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').bot).toBe('Googlebot')
    expect(parseUA('curl/8.4.0')).toMatchObject({ bot: 'curl', device: 'bot', browser: 'curl' })
  })
  it('Opera and Firefox iOS', () => {
    expect(pick('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0')[0]).toBe('Opera')
    expect(pick('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15')[0]).toBe('Firefox')
  })
})
