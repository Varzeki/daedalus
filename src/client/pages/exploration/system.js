import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import animateTableEffect from 'lib/animate-table-effect'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ExplorationPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import CopyOnClick from 'components/copy-on-click'

const HIGH_GRAVITY_THRESHOLD = 2.7

function BodyIcon ({ body }) {
  const { subType, isStar, isLandable, atmosphereComposition } = body
  const isAtmospheric = atmosphereComposition && !subType?.toLowerCase()?.includes('gas giant')

  let iconClass = 'icon daedalus-terminal-'
  if (isStar) {
    iconClass += 'star'
  } else if (isLandable) {
    iconClass += isAtmospheric ? 'planet-atmosphere-landable' : 'planet-landable'
  } else {
    iconClass += isAtmospheric ? 'planet-atmosphere' : 'planet'
  }

  if (isLandable) iconClass += ' text-secondary'

  return <i className={iconClass} />
}

function BodyStatusIcons ({ body }) {
  return (
    <span className='exploration-system__status-icons'>
      {body.rings && <i className='icon daedalus-terminal-planet-ringed' title='Ringed' />}
      {body.volcanismType && body.volcanismType !== 'No volcanism' && <i className='icon daedalus-terminal-planet-volcanic' title={body.volcanismType} />}
      {body.bioSignals > 0 && <i className='icon daedalus-terminal-plant' title={`${body.bioSignals} Biological Signal${body.bioSignals > 1 ? 's' : ''}`} />}
      {body.gravity >= HIGH_GRAVITY_THRESHOLD && <i className='icon daedalus-terminal-warning text-danger' title={`High Gravity: ${body.gravity.toFixed(2)}g`} />}
    </span>
  )
}

function DiscovererCell ({ body, cmdrName }) {
  const edsm = body.edsmDiscoverer || null
  if (edsm) {
    const isPlayer = cmdrName && edsm.toLowerCase() === cmdrName.toLowerCase()
    return (
      <td className='hidden-small hidden-medium'>
        <span className={isPlayer ? 'text-secondary' : ''}>{edsm}</span>
      </td>
    )
  }
  return <td className='hidden-small hidden-medium'><span className='text-muted'>—</span></td>
}

function SpeciesRow ({ species, isFirstDiscoverer, isLast, minBioValue }) {
  const isDim = species.reward < minBioValue
  const isScanned = species.isConfirmed
  const rowClass = `exploration-system__species-row${isDim ? ' exploration-system__species-row--dim' : ''}${isScanned ? ' exploration-system__species-row--scanned' : ''}`
  return (
    <tr className={rowClass}>
      <td colSpan={5}>
        <span className='exploration-system__species-indent'>
          <span className='exploration-system__species-branch'>{isLast ? '└' : '│'}</span>
          {species.isConfirmed
            ? <i className='icon daedalus-terminal-scan' title='Confirmed' style={{ fontSize: '1.4rem', marginRight: '.35rem' }} />
            : <i className='icon daedalus-terminal-plant text-muted' style={{ fontSize: '1.4rem', marginRight: '.35rem' }} />}
          <span>{species.genus} {species.species}</span>
        </span>
      </td>
      <td className='text-right hidden-small'>
        <span>{species.reward.toLocaleString()} Cr</span>
      </td>
      <td className='text-center hidden-small'>
        {species.isConfirmed
          ? <span>✓</span>
          : <span className='text-muted'>{species.probability}%</span>}
      </td>
      <td className='text-center hidden-small' style={{ width: '2.5rem' }}>
        {isFirstDiscoverer && <i className='icon daedalus-terminal-star text-secondary' title='First Footfall — bonus rewards' style={{ fontSize: '1.4rem' }} />}
      </td>
      <td className='hidden-small hidden-medium' />
    </tr>
  )
}

function BodyRow ({ body, cmdrName, systemName, minBodyValue, minBioValue }) {
  const shortName = (systemName && body.name?.startsWith(systemName))
    ? (body.name.slice(systemName.length).trim() || body.name)
    : body.name
  const isValuableBody = body.mappedValue >= minBodyValue
  const isValuableBio = body.bioValue >= minBioValue
  const isDim = !isValuableBody && !isValuableBio
  const isScanned = body.wasMapped || body.isStar

  let rowClass = 'exploration-system__body-row table__row--highlight-primary-hover'
  if (isDim) rowClass += ' exploration-system__body-row--dim'
  if (isScanned) rowClass += ' exploration-system__body-row--scanned'

  return (
    <>
      <tr className={rowClass} tabIndex={0}>
        {/* Body name with icon */}
        <td>
          <div className='text-no-wrap exploration-system__body-name'>
            <BodyIcon body={body} />
            {shortName}
            <BodyStatusIcons body={body} />
          </div>
        </td>
        {/* Type */}
        <td className='hidden-small'>
          <span className='text-muted'>{body.subType || ''}</span>
        </td>
        {/* Landable */}
        <td className='text-center hidden-small' style={{ width: '2.5rem' }}>
          {body.isLandable && !body.isStar && <i className='icon daedalus-terminal-planet-landable text-secondary' style={{ fontSize: '1.4rem' }} />}
        </td>
        {/* Terraformable */}
        <td className='text-center hidden-small' style={{ width: '2.5rem' }}>
          {body.isTerraformable && <i className='icon daedalus-terminal-planet-terraformable' style={{ fontSize: '1.4rem' }} />}
        </td>
        {/* Valuable */}
        <td className='text-center hidden-small' style={{ width: '2.5rem' }}>
          {(isValuableBody || isValuableBio) && <i className='icon daedalus-terminal-credits exploration-system__valuable-icon' style={{ fontSize: '1.4rem' }} />}
        </td>
        {/* Value (body / bio) */}
        <td className='text-right hidden-small' style={{ minWidth: '9rem' }}>
          {(() => {
            const hasBody = body.mappedValue > 0
            const hasBio = body.bioValue > 0
            if (hasBody && hasBio) {
              return <>
                <span className='text-info'>{body.mappedValue.toLocaleString()} Cr</span>
                <span className='text-muted'> / </span>
                <span className='text-success'>{body.bioValue.toLocaleString()} Cr</span>
              </>
            }
            if (hasBody) return <span className='text-info'>{body.mappedValue.toLocaleString()} Cr</span>
            if (hasBio) return <span className='text-success'>{body.bioValue.toLocaleString()} Cr</span>
            return <span className='text-muted'>—</span>
          })()}
        </td>
        {/* Bio signal count */}
        <td className='text-center hidden-small' style={{ width: '3rem' }}>
          {body.bioSignals > 0
            ? <span className='text-success'>{body.bioSignals}</span>
            : <span className='text-muted'>—</span>}
        </td>
        {/* First Discovery */}
        <td className='text-center hidden-small' style={{ width: '2.5rem' }}>
          {body.isFirstDiscoverer && <i className='icon daedalus-terminal-star text-secondary' title='First Discovery' style={{ fontSize: '1.4rem' }} />}
        </td>
        {/* EDSM Discoverer */}
        <DiscovererCell body={body} cmdrName={cmdrName} />
      </tr>
      {body.speciesDetail && body.speciesDetail.map((sp, i) =>
        <SpeciesRow key={`${body.name}_sp_${i}`} species={sp} isFirstDiscoverer={body.isFirstDiscoverer} isLast={i === body.speciesDetail.length - 1} minBioValue={minBioValue} />
      )}
    </>
  )
}

export default function ExplorationSystemPage () {
  const router = useRouter()
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [systemData, setSystemData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const SORT_KEY = 'daedalus-exploration-sort'
  const [sortKey, setSortKey] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(SORT_KEY))?.key ?? null } catch { return null }
  })
  const [sortAsc, setSortAsc] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(SORT_KEY))?.asc ?? true } catch { return true }
  })

  const handleSort = (key) => {
    let newKey, newAsc
    if (sortKey === key) {
      if (!sortAsc) { newKey = null; newAsc = true } // third click resets
      else { newKey = key; newAsc = false }
    } else {
      newKey = key; newAsc = true
    }
    setSortKey(newKey)
    setSortAsc(newAsc)
    try { window.localStorage.setItem(SORT_KEY, JSON.stringify({ key: newKey, asc: newAsc })) } catch {}
  }

  const fetchSystem = async () => {
    const prefs = await sendEvent('getPreferences')
    return sendEvent('getExplorationSystem', {
      minBodyValue: prefs?.explorationMinBodyValue,
      minBioValue: prefs?.explorationMinBioValue,
      includeNonValuable: prefs?.explorationIncludeNonValuable
    })
  }

  // Re-run table row animation whenever data changes
  useEffect(animateTableEffect, [systemData])

  useEffect(() => {
    if (!connected || !router.isReady) return
    setLoadError(false)
    const timeout = setTimeout(() => {
      setLoadError(true)
      setComponentReady(true)
    }, 30000)
    ;(async () => {
      try {
        const data = await fetchSystem()
        clearTimeout(timeout)
        if (data) setSystemData(data)
      } catch (e) {
        clearTimeout(timeout)
        setLoadError(true)
      }
      setComponentReady(true)
    })()
    return () => clearTimeout(timeout)
  }, [connected, ready, router.isReady])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (['Location', 'FSDJump', 'Scan', 'FSSBodySignals', 'SAASignalsFound', 'SAAScanComplete', 'FSSDiscoveryScan', 'ScanOrganic'].includes(log.event)) {
      const data = await fetchSystem()
      if (data) setSystemData(data)
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async () => {
    const data = await fetchSystem()
    if (data) setSystemData(data)
  }), [])

  // Refresh when exploration preferences change
  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event.name === 'preferences') {
      const data = await fetchSystem()
      if (data) setSystemData(data)
    }
  }), [])

  const bodies = systemData?.bodies ?? []
  const cmdrName = systemData?.cmdrName
  const systemValue = systemData?.systemValue
  const minBodyValue = systemData?.minBodyValue ?? 1000000
  const minBioValue = systemData?.minBioValue ?? 7000000

  // Sort bodies by selected column (default = server order: stars first, then distance)
  const sortedBodies = sortKey
    ? [...bodies].sort((a, b) => {
        let va, vb
        switch (sortKey) {
          case 'name': va = a.name || ''; vb = b.name || ''; break
          case 'type': va = a.subType || ''; vb = b.subType || ''; break
          case 'value': va = (a.mappedValue || 0) + (a.bioValue || 0); vb = (b.mappedValue || 0) + (b.bioValue || 0); break
          case 'bio': va = a.bioSignals || 0; vb = b.bioSignals || 0; break
          default: return 0
        }
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
        return sortAsc ? cmp : -cmp
      })
    : bodies

  // Compute valuable counts and scan progress (client-side)
  const valuableBodiesList = bodies.filter(body =>
    body.mappedValue >= minBodyValue || body.bioValue >= minBioValue
  )
  const scannedValuableBodies = valuableBodiesList.filter(b => b.wasMapped || b.isStar).length
  const totalValuableBio = []
  bodies.forEach(body => {
    if (body.speciesDetail) {
      body.speciesDetail.forEach(sp => {
        if (sp.reward >= minBioValue) totalValuableBio.push(sp)
      })
    }
  })
  const scannedValuableBio = totalValuableBio.filter(sp => sp.isConfirmed).length
  const totalTrackable = valuableBodiesList.length + totalValuableBio.length
  const scannedTrackable = scannedValuableBodies + scannedValuableBio
  const surveyComplete = totalTrackable === 0 || scannedTrackable === totalTrackable
  const progressPct = totalTrackable > 0 ? Math.round((scannedTrackable / totalTrackable) * 100) : 0

  // Survey complete fade-out/fade-in transition
  const [surveyPhase, setSurveyPhase] = useState(null) // null | 'fading-out' | 'complete'
  useEffect(() => {
    if (surveyComplete && totalTrackable > 0) {
      // Start fade-out of table, then show complete message
      setSurveyPhase('fading-out')
      const timer = setTimeout(() => setSurveyPhase('complete'), 2000)
      return () => clearTimeout(timer)
    } else {
      setSurveyPhase(null)
    }
  }, [surveyComplete, totalTrackable])

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel scrollable layout='full-width' navigation={ExplorationPanelNavItems('System')}>
        <h2>
          <i className='daedalus-terminal-system-orbits' style={{ position: 'relative', top: '.25rem', marginRight: '.5rem' }} />
          {systemData?.name
            ? <CopyOnClick append=' system'>{systemData.name}</CopyOnClick>
            : 'System'}
        </h2>
        {systemData && systemData.bodiesFound > 0 &&
          <p className='text-primary' style={{ marginBottom: '.5rem' }}>
            {systemData.bodiesFound} / {systemData.bodyCount} bodies
            {systemValue && systemValue.total > 0 && <>
              <span className='text-muted'> — </span>
              <span className='text-info'>{systemValue.bodyValue.toLocaleString()} Cr</span>
              {systemValue.bioValue > 0 && <>
                <span className='text-muted'> + </span>
                <span className='text-success'>{systemValue.bioValue.toLocaleString()} Cr bio</span>
              </>}
              {(systemValue.mainStarBonus > 0 || systemValue.fullScanBonus > 0 || systemValue.fullMapBonus > 0) && <>
                <span className='text-muted'> (including bonuses)</span>
              </>}
            </>}
          </p>}
        {systemData && bodies.length > 0 &&
          <div className={`exploration-system__header-stats${surveyPhase === 'fading-out' ? ' exploration-system__fade-out' : ''}`}>
            {surveyPhase === 'complete'
              ? <div className='exploration-system__kpi'>
                  <span className='exploration-system__survey-complete text-secondary'>
                    <i className='icon daedalus-terminal-scan' style={{ marginRight: '.5rem' }} />
                    System Survey Complete
                  </span>
                </div>
              : <>
                  {valuableBodiesList.length > 0 &&
                    <div className='exploration-system__kpi'>
                      <span className='exploration-system__kpi-value text-info'>
                        <i className='icon daedalus-terminal-planet exploration-system__kpi-icon' />
                        {scannedValuableBodies} / {valuableBodiesList.length}
                      </span>
                      <span className='exploration-system__kpi-label text-info'>Bodies Scanned</span>
                    </div>}
                  {totalValuableBio.length > 0 &&
                    <div className='exploration-system__kpi'>
                      <span className='exploration-system__kpi-value text-success'>
                        <i className='icon daedalus-terminal-plant exploration-system__kpi-icon' />
                        {scannedValuableBio} / {totalValuableBio.length}
                      </span>
                      <span className='exploration-system__kpi-label text-success'>Biologicals Scanned</span>
                    </div>}
                  {totalTrackable > 0 && !surveyComplete &&
                    <div className='exploration-system__kpi'>
                      <div className='exploration-system__progress-bar' title={`${scannedTrackable} / ${totalTrackable} scanned`}>
                        <div className='exploration-system__progress-bar-fill' style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>}
                </>}
          </div>}
        {bodies.length > 0 &&
          <div className='scrollable' style={{ position: 'fixed', top: '14rem', bottom: '2rem', left: '5rem', right: '1rem' }}>
            <table className='exploration-system__table table--animated table--interactive'>
              <thead>
                <tr>
                  <th className='exploration-system__sortable-th' onClick={() => handleSort('name')}>
                    Body {sortKey === 'name' && <span className='exploration-system__sort-indicator'>{sortAsc ? '▲' : '▼'}</span>}
                  </th>
                  <th className='hidden-small exploration-system__sortable-th' onClick={() => handleSort('type')}>
                    Type {sortKey === 'type' && <span className='exploration-system__sort-indicator'>{sortAsc ? '▲' : '▼'}</span>}
                  </th>
                  <th className='text-center hidden-small' style={{ width: '2.5rem' }} title='Landable'>
                    <i className='icon daedalus-terminal-planet-landable' style={{ fontSize: '1.3rem' }} />
                  </th>
                  <th className='text-center hidden-small' style={{ width: '2.5rem' }} title='Terraformable'>
                    <i className='icon daedalus-terminal-planet-terraformable' style={{ fontSize: '1.3rem' }} />
                  </th>
                  <th className='text-center hidden-small' style={{ width: '2.5rem' }} title='Valuable'>
                    <i className='icon daedalus-terminal-credits' style={{ fontSize: '1.3rem' }} />
                  </th>
                  <th className='text-right hidden-small exploration-system__sortable-th' style={{ minWidth: '9rem' }} onClick={() => handleSort('value')}>
                    Value {sortKey === 'value' && <span className='exploration-system__sort-indicator'>{sortAsc ? '▲' : '▼'}</span>}
                  </th>
                  <th className='text-center hidden-small exploration-system__sortable-th' style={{ width: '3rem' }} title='Biological Signals' onClick={() => handleSort('bio')}>
                    <i className='icon daedalus-terminal-plant' style={{ fontSize: '1.3rem' }} />
                    {sortKey === 'bio' && <span className='exploration-system__sort-indicator'>{sortAsc ? '▲' : '▼'}</span>}
                  </th>
                  <th className='text-center hidden-small' style={{ width: '2.5rem' }} title='First Discovery'>
                    <i className='icon daedalus-terminal-star' style={{ fontSize: '1.3rem' }} />
                  </th>
                  <th className='hidden-small hidden-medium' style={{ minWidth: '8rem' }}>Discoverer</th>
                </tr>
              </thead>
              <tbody className='fx-fade-in'>
                {sortedBodies.map(body =>
                  <BodyRow key={body.name || body.bodyId} body={body} cmdrName={cmdrName} systemName={systemData?.name} minBodyValue={minBodyValue} minBioValue={minBioValue} />
                )}
              </tbody>
            </table>
          </div>}
        {bodies.length === 0 && componentReady &&
          <div className='text-center text-muted' style={{ marginTop: '4rem', fontSize: '1.5rem' }}>
            <i className='icon daedalus-terminal-system-orbits' style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }} />
            {loadError
              ? <>
                  <span className='text-danger'>Failed to load system data</span>
                  <br />
                  <span style={{ fontSize: '1rem' }}>External data sources may be unavailable. Try again later.</span>
                </>
              : <>
                  No system data available
                  <br />
                  <span style={{ fontSize: '1rem' }}>Enter a system to see exploration data</span>
                </>}
          </div>}
      </Panel>
    </Layout>
  )
}
