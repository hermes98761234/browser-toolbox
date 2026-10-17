import type { Prefs, T } from '../kitlib'
import { randomToolHref } from './nav'

export function Header({ t, prefs, setPrefs }: { t: T; prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  return (
    <header className="top">
      <a className="logo" href="#/" aria-label={t('Browser Toolbox home')}>
        <img src="./favicon.svg" alt="" width={30} height={30} />
        <span className="logo-text">
          Browser<b>Toolbox</b>
        </span>
      </a>
      <nav className="nav">
        <a href="#/">{t('All tools')}</a>
        <a href="#/?status=ready">✅ {t('Ready to use')}</a>
        <a href="#/?dim=3D">🧊 3D</a>
        <a href="#/?fav=1">★ {t('Favorites')}</a>
        <a href="#/?recent=1">{t('Recent')}</a>
        <button type="button" className="btn-random" onClick={() => (location.hash = randomToolHref())}>
          🎲 {t('Random tool')}
        </button>
      </nav>
      <div className="prefs">
        <select aria-label={t('Language')} value={prefs.lang} onChange={(e) => setPrefs({ ...prefs, lang: e.target.value as Prefs['lang'] })}>
          <option value="en">EN</option>
          <option value="uk">UK</option>
        </select>
        <select aria-label={t('Theme')} value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value as Prefs['theme'] })}>
          <option value="auto">{t('System')}</option>
          <option value="dark">{t('Dark')}</option>
          <option value="light">{t('Light')}</option>
        </select>
      </div>
    </header>
  )
}
