import { useEffect, useState } from 'react'
import { Catalog } from './ui/Catalog'
import { Header } from './ui/Header'
import { ToolPage } from './ui/ToolPage'
import { tr } from './i18n'
import { usePrefs } from './kitlib'
import { BY_SLUG } from './lib/data'
import { SITE } from './site'

/** Hash routes: #/?filters (catalog) and #/tool/<slug>[?s=state]. */
function useHash(): string {
  const [h, setH] = useState(() => location.hash)
  useEffect(() => {
    const f = () => setH(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h
}

export default function App() {
  const { prefs, setPrefs, t } = usePrefs('toolbox', tr)
  const hash = useHash()
  const m = hash.match(/^#\/tool\/([a-z0-9-]+)/)
  const tool = m ? BY_SLUG.get(m[1]) : undefined
  const query = hash.startsWith('#/?') ? hash.slice(3) : ''

  useEffect(() => {
    document.title = tool ? `${tool.name} — ${t('free online tool')} · Browser Toolbox` : `Browser Toolbox — ${t('1000 free tools that run in your browser')}`
  }, [tool, t])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tool?.slug])

  return (
    <div className="app">
      <Header t={t} prefs={prefs} setPrefs={setPrefs} />
      {tool ? <ToolPage key={tool.slug} tool={tool} t={t} /> : <Catalog t={t} query={query} />}
      <footer className="foot">
        <span>
          Browser Toolbox · {t('No registration, no login, no tracking. Your data stays in this browser.')}
        </span>
        <a href={`https://github.com/${SITE.owner}/${SITE.repo}`} target="_blank" rel="noreferrer">
          {t('Source on GitHub')}
        </a>
      </footer>
    </div>
  )
}
