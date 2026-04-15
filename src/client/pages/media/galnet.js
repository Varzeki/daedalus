import { useState, useEffect, useCallback } from 'react'
import { useSocket, sendEvent } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { MediaPanelNavItems } from 'lib/navigation-items'

function snippet (html, maxLen = 120) {
  const text = (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function ArticleSidebar ({ articles, filter, selected, onSelect, onFilterChange, onRefresh, loading }) {
  const filtered = filter
    ? articles.filter(a =>
      a.title.toLowerCase().includes(filter) ||
        a.content.toLowerCase().includes(filter)
    )
    : articles

  return (
    <div className='galnet-panel__sidebar'>
      <div className='galnet-panel__toolbar'>
        <input
          type='text'
          value={filter}
          onChange={e => onFilterChange(e.target.value.toLowerCase())}
          placeholder='Filter articles…'
        />
        <button onClick={onRefresh} disabled={loading} title='Refresh articles'>
          <i className='icon daedalus-terminal-sync' />
        </button>
      </div>
      <div className='galnet-panel__list'>
        {filtered.length === 0 && (
          <div className='galnet-panel__empty'>No articles found.</div>
        )}
        {filtered.map(a => (
          <button
            key={a.id}
            className={'galnet-panel__article' + (selected?.id === a.id ? ' galnet-panel__article--active' : '')}
            onClick={() => onSelect(a)}
          >
            <span className='galnet-panel__article-title'>{a.title}</span>
            <span className='galnet-panel__article-date'>{a.date || ''}</span>
            <span className='galnet-panel__article-snippet'>{snippet(a.content)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ArticleReader ({ article }) {
  if (!article) {
    return (
      <div className='galnet-panel__reader galnet-panel__reader--empty'>
        <div className='galnet-panel__empty'>Select an article to read.</div>
      </div>
    )
  }

  const paragraphs = (article.content || '')
    .replace(/<[^>]*>/g, '')
    .split(/\n{2,}|\r?\n/)
    .map(p => p.trim())
    .filter(Boolean)

  return (
    <div className='galnet-panel__reader'>
      {article.image && (
        <div className='galnet-panel__reader-image-wrap'>
          <img className='galnet-panel__reader-image' src={article.image} alt='' />
        </div>
      )}
      <div className='galnet-panel__reader-header'>
        <div className='galnet-panel__reader-title'>{article.title}</div>
        <div className='galnet-panel__reader-date'>{article.date || ''}</div>
      </div>
      <div className='galnet-panel__reader-body'>
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </div>
  )
}

export default function MediaGalNetPage () {
  const { connected, active, ready } = useSocket()
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')

  const fetchArticles = useCallback(async (refresh) => {
    setLoading(true)
    setError(null)
    try {
      const data = await sendEvent(refresh ? 'galnetRefresh' : 'galnetGetArticles')
      const list = data || []
      setArticles(list)
      if (list.length > 0 && !selected) setSelected(list[0])
    } catch (e) {
      setError(e.message || 'Failed to load GalNet articles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchArticles(false) }, [])

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' navigation={MediaPanelNavItems('GalNet')}>
        <div className='galnet-panel'>
          {error && <p className='text-danger' style={{ marginBottom: '1rem' }}>{error}</p>}

          {loading && !articles.length && (
            <div className='galnet-panel__empty'>Loading GalNet feed…</div>
          )}

          {articles.length > 0 && (
            <div className='galnet-panel__split'>
              <ArticleSidebar
                articles={articles}
                filter={filter}
                selected={selected}
                onSelect={setSelected}
                onFilterChange={setFilter}
                onRefresh={() => fetchArticles(true)}
                loading={loading}
              />
              <ArticleReader article={selected} />
            </div>
          )}
        </div>
      </Panel>
    </Layout>
  )
}
