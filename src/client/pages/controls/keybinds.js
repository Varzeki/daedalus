import { useState, useEffect, useMemo } from 'react'
import { useSocket, sendEvent } from 'lib/socket'
import animateTableEffect from 'lib/animate-table-effect'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { ControlsPanelNavItems } from 'lib/navigation-items'
import CONTROLS_METADATA from 'lib/controls-data'
import KeybindsVisual from 'components/keybinds-visual'

// Preferred display order for groups in the table
const GROUP_ORDER = [
  'Ship', 'SRV', 'On Foot', 'Galaxy Map', 'Scanners',
  'UI', 'Camera', 'Head Look', 'Fighter', 'Multicrew', 'Holo-Me', 'Misc'
]

function BindingCell ({ binding }) {
  if (!binding) return <span className='text-muted' style={{ opacity: 0.3 }}>—</span>
  return (
    <div className='keybind-badge'>
      <kbd>{binding.display || binding.key}</kbd>
      {binding.device && binding.device !== 'Keyboard' && binding.device !== '{NoDevice}' &&
        <span className='keybind-device'>{binding.device}</span>}
    </div>
  )
}

export default function ControlsKeybindsPage () {
  const { connected, active, ready } = useSocket()

  useEffect(animateTableEffect)

  const [files, setFiles] = useState([])
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [bindings, setBindings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('All Groups')
  const [viewMode, setViewMode] = useState('table')

  // Load file list on connect
  useEffect(() => {
    if (!connected) return
    ;(async () => {
      try {
        const result = await sendEvent('getKeybindFiles')
        const fileList = result.files || []
        setFiles(fileList)
        const active = fileList.find(f => f.active)
        if (active) {
          setSelectedPreset(active.name)
        } else if (fileList.length > 0) {
          setSelectedPreset(fileList[0].name)
        }
      } catch (e) {
        setError('Could not list bindings files.')
      }
    })()
  }, [connected, ready])

  // Load bindings when selected preset changes
  useEffect(() => {
    if (!connected || !selectedPreset) return
    setLoading(true)
    setError(null)
    setBindings(null)
    ;(async () => {
      try {
        const result = await sendEvent('getKeybinds', { preset: selectedPreset })
        setBindings(result.bindings || {})
      } catch (e) {
        setError(`Could not load bindings: ${e.message}`)
      } finally {
        setLoading(false)
      }
    })()
  }, [connected, ready, selectedPreset])

  // Build annotated rows from metadata (all controls) + parsed bindings
  const rows = useMemo(() => {
    if (!bindings) return []
    const seen = new Set()
    const result = []
    // All known controls from metadata, bound or unbound
    for (const [key, meta] of Object.entries(CONTROLS_METADATA)) {
      seen.add(key)
      const data = bindings[key]
      const isAxis = !!data?.binding
      const bound = !!(data && (data.primary || data.secondary || data.binding))
      result.push({
        key,
        name: meta.name,
        group: meta.group,
        type: meta.type ?? (isAxis ? 'Analogue' : 'Digital'),
        primary: isAxis ? (data?.binding ?? null) : (data?.primary ?? null),
        modifier: data?.modifier ?? null,
        secondary: isAxis ? null : (data?.secondary ?? null),
        bound
      })
    }
    // Any bindings not in metadata (custom/unknown)
    for (const [key, data] of Object.entries(bindings)) {
      if (seen.has(key)) continue
      if (!(data.primary || data.secondary || data.binding)) continue
      const isAxis = !!data.binding
      result.push({
        key,
        name: key.replace(/([a-z])([A-Z])/g, '$1 $2'),
        group: 'Other',
        type: isAxis ? 'Analogue' : 'Digital',
        primary: isAxis ? data.binding : data.primary,
        modifier: data.modifier,
        secondary: isAxis ? null : data.secondary,
        bound: true
      })
    }
    return result
  }, [bindings])

  // Pre-filter bindings by group for the visual view
  const visualBindings = useMemo(() => {
    if (!bindings) return null
    if (groupFilter === 'All Groups') return bindings
    return Object.fromEntries(
      Object.entries(bindings).filter(([key]) => {
        const meta = CONTROLS_METADATA[key]
        return (meta?.group ?? 'Other') === groupFilter
      })
    )
  }, [bindings, groupFilter])

  // Filter and sort
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows
      .filter(row => {
        if (groupFilter !== 'All Groups' && row.group !== groupFilter) return false
        if (!q) return true
        const matchStr = [
          row.name,
          row.group,
          row.primary?.display,
          row.secondary?.display,
          row.modifier?.display
        ].filter(Boolean).join(' ').toLowerCase()
        return matchStr.includes(q)
      })
      .sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a.group)
        const bi = GROUP_ORDER.indexOf(b.group)
        const gc = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        if (gc !== 0) return gc
        return a.name.localeCompare(b.name)
      })
  }, [rows, search, groupFilter])

  // Available groups derived from current bindings
  const availableGroups = useMemo(() => {
    const inData = new Set(rows.map(r => r.group))
    const ordered = GROUP_ORDER.filter(g => inData.has(g))
    const extra = [...inData].filter(g => !GROUP_ORDER.includes(g)).sort()
    return ['All Groups', ...ordered, ...extra]
  }, [rows])

  const boundCount = useMemo(() => filteredRows.filter(r => r.bound).length, [filteredRows])

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ControlsPanelNavItems('Keybinds')}>
       <div className='keybinds-page'>
        <div className='keybinds-page-header'>
          <div className='keybinds-page-title'>
            <h2>Keybinds</h2>
            <h3 className='text-primary'>Game Control Bindings</h3>
          </div>

          <div className='keybinds-toolbar-row'>
            <div className='keybinds-toolbar'>
              <select
                className='keybinds-toolbar__preset'
                value={selectedPreset || ''}
                onChange={e => setSelectedPreset(e.target.value)}
                disabled={files.length === 0}
              >
                {files.length === 0
                  ? <option value=''>No bindings files found</option>
                  : files.map(f => (
                    <option key={f.name} value={f.name}>
                      {f.name}{f.active ? ' (active)' : ''}
                    </option>
                  ))
                }
              </select>

              <select
                className='keybinds-toolbar__group'
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
                disabled={!bindings}
              >
                {availableGroups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              <input
                type='search'
                className='keybinds-toolbar__search'
                placeholder='Search Function...'
                value={search}
                onChange={e => setSearch(e.target.value)}
                disabled={!bindings}
              />

              {viewMode === 'table' && filteredRows.length > 0 &&
                <span className='keybinds-row-count'>{boundCount}/{filteredRows.length} controls</span>}
            </div>

            <button
              className='keybinds-view-toggle'
              onClick={() => setViewMode(m => m === 'table' ? 'visual' : 'table')}
              onMouseUp={e => e.currentTarget.blur()}
              disabled={!bindings}
            >
              <i className={`icon daedalus-terminal-${viewMode === 'table' ? 'cogs' : 'table-rows'}`} />
              {viewMode === 'table' ? 'Visual' : 'Table'}
            </button>
          </div>
        </div>

        <div className='keybinds-page-body'>
          {error &&
            <p className='text-center' style={{ padding: '1rem 0', opacity: 0.7 }}>{error}</p>}

          {loading &&
            <p className='keybinds-status'>Loading bindings…</p>}

          {!loading && !error && files.length === 0 &&
            <p className='keybinds-status'>
              No bindings files found.<br />
              <span style={{ fontSize: '.8rem', opacity: .6 }}>
                Expected: %LocalAppData%\Frontier Developments\Elite Dangerous\Options\Bindings
              </span>
            </p>}

          {viewMode === 'visual' && bindings &&
            <KeybindsVisual bindings={visualBindings} visualSearch={search} />}

          {viewMode === 'table' && !loading && bindings && filteredRows.length === 0 &&
            <p className='keybinds-status'>No bindings match your search.</p>}

          {viewMode === 'table' && !loading && filteredRows.length > 0 && (
            <table className='table--animated keybinds-table'>
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Group</th>
                  <th>Type</th>
                  <th>Primary</th>
                  <th>Modifier</th>
                  <th>Secondary</th>
                </tr>
              </thead>
              <tbody className='fx-fade-in'>
                {filteredRows.map(row => (
                  <tr key={row.key} className={row.bound ? '' : 'keybind-row--unbound'}>
                    <td>{row.name}</td>
                    <td className='text-muted'>{row.group}</td>
                    <td>
                      <span className={`keybind-type keybind-type--${row.type.toLowerCase()}`}>
                        {row.type}
                      </span>
                    </td>
                    <td><BindingCell binding={row.primary} /></td>
                    <td><BindingCell binding={row.modifier} /></td>
                    <td><BindingCell binding={row.secondary} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
       </div>
      </Panel>
    </Layout>
  )
}
