import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import animateTableEffect from 'lib/animate-table-effect'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ExplorationPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import CopyOnClick from 'components/copy-on-click'

function BodyIcon ({ body }) {
  const { subType, isStar } = body
  let iconClass = 'icon daedalus-terminal-'
  if (isStar) {
    iconClass += 'star'
  } else if (subType?.toLowerCase().includes('gas giant')) {
    iconClass += 'planet'
  } else {
    iconClass += body.isTerraformable ? 'planet-terraformable' : 'planet-landable'
  }
  return <i className={iconClass} />
}

function DiscoveryBadge ({ value, label }) {
  if (value === true) return <i className='icon daedalus-terminal-star text-secondary' title={label} style={{ fontSize: '1.3rem' }} />
  if (value === null) return <span className='text-muted' title={`${label}: Unknown`}>?</span>
  return null
}

function OrganicRow ({ organic, isLast }) {
  const isSold = organic.isSold
  const isLost = organic.isLostToDeath
  const rowClass = `exploration-inventory__organic-row${isSold ? ' exploration-inventory__organic-row--sold' : ''}`
  const reward = organic.reward === 'Unknown' ? '?' : organic.reward.toLocaleString()
  const epithet = organic.species.startsWith(organic.genus)
    ? organic.species.slice(organic.genus.length).trim() || organic.species
    : organic.species
  return (
    <tr className={rowClass}>
      <td>
        <span className='exploration-inventory__organic-indent'>
          <span className='exploration-inventory__organic-branch'>{isLast ? '└' : '│'}</span>
          <i className='icon daedalus-terminal-plant' style={{ fontSize: '1.3rem', marginRight: '.35rem' }} />
          <span>{epithet}</span>
        </span>
      </td>
      <td className='hidden-small'>
        <span className='text-muted'>{organic.genus}</span>
      </td>
      <td className='text-center hidden-small'>
        {organic.isFirstFootfall && <i className='icon daedalus-terminal-star text-secondary' title='First Footfall ×5 bonus' style={{ fontSize: '1.3rem' }} />}
      </td>
      <td className='hidden-small' />
      <td className='text-right'>
        <span className={isSold ? 'text-muted' : 'text-success'}>{reward} Cr</span>
      </td>
      <td className='text-center'>
        {isLost
          ? <span className='exploration-inventory__lost-badge'>LOST</span>
          : isSold
            ? <span className='exploration-inventory__sold-badge'>SOLD</span>
            : <span className='text-primary'>Unsold</span>}
      </td>
    </tr>
  )
}

function BodyRow ({ body, systemName, isLast }) {
  const shortName = (systemName && body.name?.startsWith(systemName))
    ? (body.name.slice(systemName.length).trim() || body.name)
    : body.name

  const isSold = body.isSold
  const isLost = body.isLostToDeath
  let rowClass = 'exploration-inventory__body-row table__row--highlight-primary-hover'
  if (isSold && body.organics.every(o => o.isSold)) rowClass += ' exploration-inventory__body-row--sold'

  const value = body.value || 0
  const hasOrganics = body.organics.length > 0

  return (
    <>
      <tr className={rowClass}>
        <td>
          <div className='text-no-wrap exploration-inventory__body-name'>
            <BodyIcon body={body} />
            {shortName}
          </div>
        </td>
        <td className='hidden-small'>
          <span className='text-muted'>{body.isStar && body.subType ? body.subType + ' Class' : body.subType || ''}</span>
        </td>
        <td className='text-center hidden-small'>
          <DiscoveryBadge value={body.isFirstDiscoverer} label='First Discovery' />
        </td>
        <td className='text-center hidden-small'>
          <DiscoveryBadge value={body.isFirstMapped} label='First Mapped' />
        </td>
        <td className='text-right'>
          {value > 0
            ? <span className={isSold ? 'text-muted' : 'text-info'}>{value.toLocaleString()} Cr</span>
            : <span className='text-muted'>—</span>}
        </td>
        <td className='text-center'>
          {isLost
            ? <span className='exploration-inventory__lost-badge'>LOST</span>
            : isSold
              ? <span className='exploration-inventory__sold-badge'>SOLD</span>
              : <span className='text-primary'>Unsold</span>}
        </td>
      </tr>
      {hasOrganics && body.organics.map((org, i) =>
        <OrganicRow key={`${body.name}_org_${i}`} organic={org} isLast={i === body.organics.length - 1} />
      )}
    </>
  )
}

function SystemGroup ({ system, defaultCollapsed }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    if (collapsed) return
    return animateTableEffect()
  }, [collapsed])

  return (
    <div className={`exploration-inventory__system-group${system.allSold ? ' exploration-inventory__system-group--sold' : ''}`}>
      <div className='exploration-inventory__system-header' onClick={() => setCollapsed(!collapsed)}>
        <span className='exploration-inventory__system-toggle'>{collapsed ? '▶' : '▼'}</span>
        <i className='icon daedalus-terminal-system-orbits' style={{ fontSize: '1.6rem', marginRight: '.5rem' }} />
        <CopyOnClick>{system.name}</CopyOnClick>
        <span className='exploration-inventory__system-stats'>
          {!system.allSold && <>
            <span className='text-info'>{system.unsoldValue.toLocaleString()} Cr</span>
            <span className='text-muted'> — </span>
            <span className='text-muted'>{system.unsoldBodies} bod{system.unsoldBodies === 1 ? 'y' : 'ies'}</span>
            {system.unsoldBiologicals > 0 && <>
              <span className='text-muted'>, </span>
              <span className='text-success'>{system.unsoldBiologicals} bio</span>
            </>}
          </>}
          {system.allSold && <span className={system.bodies.every(b => b.isLostToDeath && b.organics.every(o => o.isLostToDeath)) ? 'exploration-inventory__lost-badge' : 'exploration-inventory__sold-badge'}>
            {system.bodies.every(b => b.isLostToDeath && b.organics.every(o => o.isLostToDeath)) ? 'ALL LOST' : 'ALL SOLD'}
          </span>}
        </span>
      </div>
      {!collapsed &&
        <table className='exploration-inventory__table table--animated table--interactive'>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Body</th>
              <th className='hidden-small' style={{ width: '20%' }}>Type</th>
              <th className='text-center hidden-small' style={{ width: '8%' }}>Discovered</th>
              <th className='text-center hidden-small' style={{ width: '8%' }}>Mapped</th>
              <th className='text-right' style={{ width: '20%' }}>Value</th>
              <th className='text-center' style={{ width: '14%' }}>Status</th>
            </tr>
          </thead>
          <tbody className='fx-fade-in'>
            {system.bodies.map((body, i) =>
              <BodyRow key={body.name || body.bodyId} body={body} systemName={system.name} isLast={i === system.bodies.length - 1} />
            )}
          </tbody>
        </table>}
    </div>
  )
}

export default function ExplorationInventoryPage () {
  const router = useRouter()
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [inventoryData, setInventoryData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showSold, setShowSold] = useState(false)
  const [backfillInProgress, setBackfillInProgress] = useState(false)

  const fetchInventory = async () => {
    const prefs = await sendEvent('getPreferences')
    return sendEvent('getExplorationInventory', {
      minBodyValue: prefs?.explorationMinBodyValue,
      minBioValue: prefs?.explorationMinBioValue
    }, 60000)
  }

  useEffect(animateTableEffect, [inventoryData])

  useEffect(() => {
    if (!connected || !router.isReady) return
    setLoadError(false)
    const timeout = setTimeout(() => {
      setLoadError(true)
      setComponentReady(true)
    }, 60000)
    ;(async () => {
      try {
        const data = await fetchInventory()
        clearTimeout(timeout)
        if (data?.backfillInProgress) {
          setBackfillInProgress(true)
          setComponentReady(true)
        } else if (data) {
          setBackfillInProgress(false)
          setInventoryData(data)
          setComponentReady(true)
        }
      } catch (e) {
        clearTimeout(timeout)
        setLoadError(true)
        setComponentReady(true)
      }
    })()
    return () => clearTimeout(timeout)
  }, [connected, ready, router.isReady])

  // When backfill completes, fetch the full inventory
  useEffect(() => eventListener('backfillComplete', async () => {
    setBackfillInProgress(false)
    const data = await fetchInventory()
    if (data && !data.backfillInProgress) setInventoryData(data)
  }), [])

  // Refresh on relevant events
  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (['Scan', 'SAAScanComplete', 'ScanOrganic', 'SellExplorationData', 'MultiSellExplorationData', 'SellOrganicData', 'Died'].includes(log.event)) {
      const data = await fetchInventory()
      if (data) setInventoryData(data)
    }
  }), [])

  // Refresh when settings change (e.g. valuable thresholds)
  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event?.name === 'preferences') {
      const data = await fetchInventory()
      if (data && !data.backfillInProgress) setInventoryData(data)
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async () => {
    const data = await fetchInventory()
    if (data) setInventoryData(data)
  }), [])

  // Refresh when exploration preferences change
  useEffect(() => eventListener('gameStateChange', async (event) => {
    if (event?.name === 'preferences') {
      const data = await fetchInventory()
      if (data) setInventoryData(data)
    }
  }), [])

  const totals = inventoryData?.totals
  const systems = inventoryData?.systems ?? []
  const visibleSystems = showSold ? systems : systems.filter(s => !s.allSold)
  const valuableSystems = visibleSystems.filter(s => s.isValuable)
  const nonValuableSystems = visibleSystems.filter(s => !s.isValuable)

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady || backfillInProgress}>
      <Panel scrollable layout='full-width' navigation={ExplorationPanelNavItems('Inventory')}>
        <h2>
          <i className='daedalus-terminal-inventory' style={{ position: 'relative', top: '.25rem', marginRight: '.5rem' }} />
          Data Inventory
        </h2>

        {!backfillInProgress && totals &&
          <div className='exploration-inventory__summary'>
            <div className='exploration-inventory__kpi'>
              <span className='exploration-inventory__kpi-value text-primary'>
                {totals.unsoldValue.toLocaleString()}
              </span>
              <span className='exploration-inventory__kpi-label'>Total Value</span>
            </div>
            <div className='exploration-inventory__kpi exploration-inventory__kpi--sub'>
              <span className='exploration-inventory__kpi-value text-info'>
                {totals.unsoldExplorationValue.toLocaleString()}
              </span>
              <span className='exploration-inventory__kpi-label'>Exploration</span>
            </div>
            {totals.unsoldBioValue > 0 &&
              <div className='exploration-inventory__kpi exploration-inventory__kpi--sub'>
                <span className='exploration-inventory__kpi-value text-success'>
                  {totals.unsoldBioValue.toLocaleString()}
                </span>
                <span className='exploration-inventory__kpi-label'>Exobiology</span>
              </div>}
            <div className='exploration-inventory__kpi-separator' />
            <div className='exploration-inventory__kpi'>
              <span className='exploration-inventory__kpi-value text-primary'>
                {totals.systems}
              </span>
              <span className='exploration-inventory__kpi-label'>Systems</span>
            </div>
            <div className='exploration-inventory__kpi'>
              <span className='exploration-inventory__kpi-value text-info'>
                {totals.bodies}
              </span>
              <span className='exploration-inventory__kpi-label'>Bodies</span>
            </div>
            {totals.biologicals > 0 &&
              <div className='exploration-inventory__kpi'>
                <span className='exploration-inventory__kpi-value text-success'>
                  {totals.biologicals}
                </span>
                <span className='exploration-inventory__kpi-label'>Biologicals</span>
              </div>}
          </div>}

        {!backfillInProgress && totals && systems.length > 0 &&
          <div className='exploration-inventory__toolbar'>
            <label className='exploration-inventory__toggle'>
              <input type='checkbox' checked={showSold} onChange={(e) => setShowSold(e.target.checked)} />
              <span>Show sold / lost data</span>
            </label>
          </div>}

        {!backfillInProgress && valuableSystems.length > 0 &&
          <div className='exploration-inventory__section'>
            <h3 className='exploration-inventory__section-heading text-info'>
              <i className='icon daedalus-terminal-credits' />
              Valuable Systems
              <span className='exploration-inventory__section-count'>{valuableSystems.length}</span>
            </h3>
            <div className='exploration-inventory__systems'>
              {valuableSystems.map(sys =>
                <SystemGroup key={sys.name} system={sys} defaultCollapsed={sys.allSold} />
              )}
            </div>
          </div>}

        {!backfillInProgress && nonValuableSystems.length > 0 &&
          <div className='exploration-inventory__section'>
            <h3 className='exploration-inventory__section-heading exploration-inventory__section-heading--non-valuable'>
              <i className='icon daedalus-terminal-system-orbits' />
              Non-Valuable Systems
              <span className='exploration-inventory__section-count'>{nonValuableSystems.length}</span>
            </h3>
            <div className='exploration-inventory__systems'>
              {nonValuableSystems.map(sys =>
                <SystemGroup key={sys.name} system={sys} defaultCollapsed />
              )}
            </div>
          </div>}

        {!backfillInProgress && systems.length === 0 && componentReady &&
          <div className='text-center text-muted' style={{ marginTop: '4rem', fontSize: '1.5rem' }}>
            <i className='icon daedalus-terminal-inventory' style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }} />
            {loadError
              ? <>
                  <span className='text-danger'>Failed to load inventory data</span>
                  <br />
                  <span style={{ fontSize: '1rem' }}>Try again later.</span>
                </>
              : <>
                  No exploration data found
                  <br />
                  <span style={{ fontSize: '1rem' }}>Scan bodies and biological specimens to start building your inventory</span>
                </>}
          </div>}

        {!backfillInProgress && visibleSystems.length === 0 && systems.length > 0 && !showSold && componentReady &&
          <div className='text-center text-muted' style={{ marginTop: '4rem', fontSize: '1.5rem' }}>
            <i className='icon daedalus-terminal-scan' style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }} />
            All exploration data has been sold or lost
            <br />
            <span style={{ fontSize: '1rem' }}>
              <span className='text-primary' style={{ cursor: 'pointer' }} onClick={() => setShowSold(true)}>Show sold / lost data</span>
              {' '}to see your history
            </span>
          </div>}
      </Panel>
    </Layout>
  )
}
