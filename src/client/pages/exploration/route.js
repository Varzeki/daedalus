import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import animateTableEffect from 'lib/animate-table-effect'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ExplorationPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import CopyOnClick from 'components/copy-on-click'

const SCOOPABLE_CLASSES = ['K', 'G', 'B', 'F', 'O', 'A', 'M']

function StarClassBadge ({ starClass, isScoopable }) {
  const classColor = isScoopable ? 'text-info' : 'text-muted'
  const label = /^D/.test(starClass)
    ? 'White Dwarf'
    : /^N/.test(starClass)
      ? 'Neutron Star'
      : /^H/.test(starClass)
        ? 'Black Hole'
        : `${starClass} Class`
  return (
    <span className='exploration-route__star-class'>
      {isScoopable
        ? <i className='icon daedalus-terminal-fuel' style={{ position: 'relative', top: '.3rem', fontSize: '2rem', marginRight: '.25rem' }} />
        : null}
      <span className={classColor}>{label}</span>
    </span>
  )
}

function BodyStatusBadge ({ bodyStatus, bodyStatusText }) {
  if (bodyStatus === 'unknown') {
    return (
      <span className='exploration-route__body-status exploration-route__body-status--unknown'>
        <span className='text-muted'>—</span>
      </span>
    )
  }
  if (bodyStatus === 'partial') {
    return (
      <span className='exploration-route__body-status exploration-route__body-status--partial'>
        <i className='icon daedalus-terminal-warning text-primary' style={{ position: 'relative', top: '.3rem', fontSize: '2rem', marginRight: '.35rem' }} />
        <span className='text-primary'>{bodyStatusText}</span>
      </span>
    )
  }
  // complete
  return (
    <span className='exploration-route__body-status exploration-route__body-status--complete'>
      <i className='icon daedalus-terminal-scan text-success' style={{ position: 'relative', top: '.3rem', fontSize: '2rem', marginRight: '.35rem' }} />
      <span className='text-success'>{bodyStatusText}</span>
    </span>
  )
}

export default function ExplorationRoutePage () {
  const router = useRouter()
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [explorationRoute, setExplorationRoute] = useState()
  const [loadError, setLoadError] = useState(false)
  const currentSystemRef = useRef(null)

  // Helper to fetch route with current exploration preferences
  const fetchRoute = async () => {
    const prefs = await sendEvent('getPreferences')
    return sendEvent('getExplorationRoute', {
      minBodyValue: prefs?.explorationMinBodyValue,
      minBioValue: prefs?.explorationMinBioValue,
      includeNonValuable: prefs?.explorationIncludeNonValuable
    })
  }

  useEffect(animateTableEffect, [explorationRoute])

  // Scroll to current system once on load
  useEffect(() => {
    if (!scrolled && currentSystemRef?.current) {
      currentSystemRef.current.scrollIntoView({ block: 'center' })
      setScrolled(true)
    }
  }, [explorationRoute])

  useEffect(() => {
    if (!connected || !router.isReady) return
    setLoadError(false)
    const timeout = setTimeout(() => {
      setLoadError(true)
      setComponentReady(true)
    }, 30000)
    ;(async () => {
      try {
        const data = await fetchRoute()
        clearTimeout(timeout)
        if (data) setExplorationRoute(data)
      } catch (e) {
        clearTimeout(timeout)
        setLoadError(true)
      }
      setComponentReady(true)
    })()
    return () => clearTimeout(timeout)
  }, [connected, ready, router.isReady])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (['Location', 'FSDJump'].includes(log.event)) {
      const data = await fetchRoute()
      if (data) {
        setExplorationRoute(data)
        setScrolled(false)
      }
    }
  }), [])

  // gameStateChange fires on every Status.json update (position, heading, etc.)
  // The route page doesn't display real-time position data, so we don't need
  // to refetch on every state change — journal events cover all relevant updates.

  // Refresh when exploration preferences change
  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event.name === 'preferences') {
      const data = await fetchRoute()
      if (data) setExplorationRoute(data)
    }
  }), [])

  const route = explorationRoute?.route ?? []
  const fuelRunOutSystem = explorationRoute?.fuelRunOutSystem
  const routeTableTop = fuelRunOutSystem ? '11.75rem' : '10rem'

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel scrollable layout='full-width' navigation={ExplorationPanelNavItems('Route')}>
        <h2>Exploration Route</h2>
        <table>
          <tbody>
            <tr style={{ background: 'none' }}>
              <td style={{ width: '50%', padding: '.5rem 0 0 0' }}>
                {explorationRoute?.currentSystem &&
                  <>
                    <h3 className='text-primary'>
                      <i className='daedalus-terminal-location-filled text-secondary' style={{ position: 'relative', top: '.25rem', marginRight: '.5rem' }} />
                      Location
                    </h3>
                    <h2 className='text-info'>
                      <CopyOnClick>{explorationRoute.currentSystem?.name}</CopyOnClick>
                    </h2>
                  </>}
              </td>
              <td style={{ width: '50%', padding: '.5rem 0 0 0' }} className='text-right'>
                {explorationRoute?.destination &&
                  <>
                    <h3 className='text-primary'>
                      <i className='daedalus-terminal-route' style={{ position: 'relative', top: '.25rem', marginRight: '.5rem' }} />
                      Destination
                    </h3>
                    <h2 className='text-info text-right'>
                      {explorationRoute.destination?.distance > 0
                        ? <CopyOnClick>{explorationRoute.destination?.system}</CopyOnClick>
                        : <span className='text-muted'>—</span>}
                    </h2>
                  </>}
              </td>
            </tr>
          </tbody>
        </table>
        {route.length > 0 &&
          <>
            {fuelRunOutSystem &&
              <div className='text-danger' style={{ marginBottom: '1rem', fontSize: '1.05rem' }}>
                <i className='icon daedalus-terminal-warning' style={{ position: 'relative', top: '.2rem', marginRight: '.4rem' }} />
                Refuel before leaving <CopyOnClick>{fuelRunOutSystem}</CopyOnClick> or this route will strand the ship.
              </div>}
            <div className='scrollable' style={{ position: 'fixed', top: routeTableTop, bottom: '4.5rem', left: '5rem', right: '1rem' }}>
              <table className='exploration-route__table table--animated table--interactive'>
                <thead>
                  <tr>
                    <th className='text-center' style={{ width: '3.5rem' }}>#</th>
                    <th>System</th>
                    <th className='text-center hidden-small' style={{ width: '8rem', whiteSpace: 'nowrap' }}>Star</th>
                    <th className='hidden-small hidden-medium' style={{ minWidth: '7rem' }}>Status</th>
                    <th className='text-right hidden-small hidden-medium' style={{ minWidth: '7rem' }}>Value</th>
                    <th className='text-center hidden-small' style={{ width: '3rem' }} title='Valuable Bodies'>
                      <i className='icon daedalus-terminal-credits' style={{ fontSize: '1.3rem' }} />
                    </th>
                    <th className='text-center hidden-small' style={{ width: '3rem' }} title='Biological Signals'>
                      <i className='icon daedalus-terminal-plant' style={{ fontSize: '1.3rem' }} />
                    </th>
                    <th className='hidden-small hidden-medium' style={{ minWidth: '10rem' }}>Discoverer</th>
                    <th className='text-center' style={{ minWidth: '5rem' }}>Distance</th>
                  </tr>
                </thead>
                <tbody className='fx-fade-in'>
                  {route.map((entry, i) => {
                    const isPast = explorationRoute?.inSystemOnRoute &&
                      (route.length - explorationRoute.jumpsToDestination) > (i + 1)

                    return (
                      <tr
                        ref={entry.isCurrentSystem ? currentSystemRef : null}
                        key={`exploration-route_${entry.system}`}
                        className={`${entry.isCurrentSystem ? 'table__row--highlighted' : 'table__row--highlight-primary-hover'} ${isPast ? 'exploration-route__row--past' : ''}`}
                        tabIndex={0}
                      >
                        {/* Jump number */}
                        <td className='text-center' style={{ width: '3.5rem' }}>
                          {entry.isCurrentSystem
                            ? <i className='icon daedalus-terminal-location-filled text-secondary' style={{ fontSize: '2rem', position: 'relative', top: '.2rem' }} />
                            : <span className={isPast ? 'text-muted' : ''}>{entry.jumpNumber}</span>}
                        </td>

                        {/* System name */}
                        <td>
                          <CopyOnClick>
                            <span className={isPast ? 'text-muted' : 'text-info'}>{entry.system}</span>
                          </CopyOnClick>
                          {entry.fuelRunsOutHere &&
                            <div className='text-danger text-no-wrap' style={{ marginTop: '.25rem', fontSize: '.95rem' }}>
                              <i className='icon daedalus-terminal-warning' style={{ position: 'relative', top: '.2rem', marginRight: '.35rem' }} />
                              Refuel here
                            </div>}
                        </td>

                        {/* Star class + scoopable icon */}
                        <td className='text-center hidden-small' style={{ width: '8rem', whiteSpace: 'nowrap' }}>
                          <span className={isPast ? 'text-muted' : ''}>
                            <StarClassBadge starClass={entry.starClass} isScoopable={entry.isScoopable} />
                          </span>
                        </td>

                        {/* Body status */}
                        <td className='hidden-small hidden-medium'>
                          <span className={isPast ? 'text-muted' : ''}>
                            <BodyStatusBadge bodyStatus={entry.bodyStatus} bodyStatusText={entry.bodyStatusText} />
                          </span>
                        </td>

                        {/* Cartographic value / bio value */}
                        <td className='text-right hidden-small hidden-medium'>
                          {(() => {
                            const hasBody = entry.bodyValue > 0
                            const hasBio = entry.bioValue > 0
                            const totalExtracted = (entry.bodyValueExtracted || 0) + (entry.bioValueExtracted || 0)
                            const totalPossible = (entry.bodyValue || 0) + (entry.bioValue || 0)

                            // Past systems: show "extracted / possible" format
                            if (isPast && totalPossible > 0) {
                              return <span className='text-muted'>
                                {totalExtracted.toLocaleString()} / {totalPossible.toLocaleString()} Cr
                              </span>
                            }
                            if (hasBody && hasBio) {
                              return <>
                                <span className={isPast ? 'text-muted' : 'text-info'}>
                                  {entry.bodyValue.toLocaleString()} Cr
                                </span>
                                <span className='text-muted'> / </span>
                                <span className={isPast ? 'text-muted' : 'text-success'}>
                                  {entry.bioValue.toLocaleString()} Cr
                                </span>
                              </>
                            }
                            if (hasBody) {
                              return <span className={isPast ? 'text-muted' : 'text-info'}>
                                {entry.bodyValue.toLocaleString()} Cr
                              </span>
                            }
                            if (hasBio) {
                              return <span className={isPast ? 'text-muted' : 'text-success'}>
                                {entry.bioValue.toLocaleString()} Cr
                              </span>
                            }
                            return <span className='text-muted'>—</span>
                          })()}
                        </td>

                        {/* Valuable bodies count */}
                        <td className='text-center hidden-small' style={{ width: '3rem' }}>
                          {entry.valuableBodies > 0
                            ? <span className={isPast ? 'text-muted' : 'text-info'}>{entry.valuableBodies}</span>
                            : <span className='text-muted'>—</span>}
                        </td>

                        {/* Bio signals count */}
                        <td className='text-center hidden-small' style={{ width: '3rem' }}>
                          {entry.valuableBiologicals > 0
                            ? <span className={isPast ? 'text-muted' : 'text-success'}>{entry.valuableBiologicals}</span>
                            : <span className='text-muted'>—</span>}
                        </td>

                        {/* Discoverer (Ingame / EDSM) */}
                        <td className='hidden-small hidden-medium'>
                          {(() => {
                            const hasIngame = !!entry.ingameDiscoverer
                            const hasEdsm = !!entry.discoverer
                            if (hasIngame && hasEdsm && entry.ingameDiscoverer.toLowerCase() !== entry.discoverer.toLowerCase()) {
                              return <>
                                <span className={entry.isPlayerDiscoverer ? 'text-secondary' : (isPast ? 'text-muted' : '')} title='In-game discoverer'>
                                  {entry.ingameDiscoverer}
                                </span>
                                <span className='text-muted'> / </span>
                                <span className={isPast ? 'text-muted' : ''} title='EDSM discoverer'>
                                  {entry.discoverer}
                                </span>
                              </>
                            }
                            if (hasIngame) {
                              return <span className={entry.isPlayerDiscoverer ? 'text-secondary' : (isPast ? 'text-muted' : '')} title='In-game discoverer'>
                                {entry.ingameDiscoverer}
                              </span>
                            }
                            if (hasEdsm) {
                              return <span className={entry.isPlayerDiscoverer ? 'text-secondary' : (isPast ? 'text-muted' : '')} title='EDSM discoverer'>
                                {entry.discoverer}
                              </span>
                            }
                            return <span className='text-muted'>—</span>
                          })()}
                        </td>

                        {/* Distance */}
                        <td className='text-center'>
                          {entry.isCurrentSystem
                            ? <span className='text-muted'>Here</span>
                            : <span className={isPast ? 'text-muted' : 'text-no-wrap'}>
                                {entry.distance != null ? `${entry.distance.toLocaleString(undefined, { maximumFractionDigits: 2 })} Ly` : '—'}
                              </span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>}
        {route.length === 0 && componentReady &&
          <div className='text-center text-muted' style={{ marginTop: '4rem', fontSize: '1.5rem' }}>
            <i className='icon daedalus-terminal-route' style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }} />
            {loadError
              ? <>
                  <span className='text-danger'>Failed to load exploration data</span>
                  <br />
                  <span style={{ fontSize: '1rem' }}>External data sources may be unavailable. Try again later.</span>
                </>
              : <>
                  No route plotted
                  <br />
                  <span style={{ fontSize: '1rem' }}>Plot a route in the Galaxy Map to see exploration data</span>
                </>}
          </div>}
        <div className='text-primary text-uppercase text-center' style={{ height: '2.75rem', fontSize: '1.5rem', position: 'fixed', bottom: '.8rem', left: '5rem', right: '1rem', marginBottom: '.5rem' }}>
          <hr className='small' style={{ marginTop: 0, marginBottom: '1rem' }} />
          {route.length > 0 && explorationRoute?.jumpsToDestination > 0 &&
            <>
              {explorationRoute.inSystemOnRoute && <>
                {explorationRoute.jumpsToDestination === 1 ? `${explorationRoute.jumpsToDestination} jump` : `${explorationRoute.jumpsToDestination} jumps`}
                <span className='text-muted'> / </span>
              </>}
              {explorationRoute.destination?.distance != null
                ? <>{explorationRoute.destination.distance.toLocaleString(undefined, { maximumFractionDigits: 2 })} Ly
                    {' '}<span className='text-muted hidden-small'>to destination</span>
                  </>
                : null}
            </>}
        </div>
      </Panel>
    </Layout>
  )
}
