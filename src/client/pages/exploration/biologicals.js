import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ExplorationPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'

const POLL_INTERVAL = 500 // 500ms position polling
const MAP_SIZE = 400 // SVG viewBox size
const DEG_TO_RAD = Math.PI / 180
const DEFAULT_MIN_BIO_VALUE = 7000000 // 7M Cr (matches settings default)

// Haversine distance on a sphere (lat/lon in degrees, radius in meters)
function surfaceDistance (lat1, lon1, lat2, lon2, planetRadius) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2
  return 2 * planetRadius * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Bearing from point 1 to point 2 in radians (clockwise from north)
function bearing (lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG_TO_RAD)
  const x = Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
            Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLon)
  return Math.atan2(y, x)
}

function formatDistance (meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

// ----- Smooth position interpolation for fluid radar animation -----
function useSmoothPosition (target) {
  const currentRef = useRef(null)
  const targetRef = useRef(null)
  const rafRef = useRef(null)
  const [smooth, setSmooth] = useState(target)

  targetRef.current = target

  if (!currentRef.current && target?.lat != null) {
    currentRef.current = { lat: target.lat, lon: target.lon, heading: target.heading ?? 0 }
  }

  useEffect(() => {
    let active = true
    const animate = () => {
      if (!active) return
      const c = currentRef.current
      const t = targetRef.current
      if (c && t?.lat != null) {
        const k = 0.12
        const latD = t.lat - c.lat
        const lonD = t.lon - c.lon
        let hD = (t.heading ?? 0) - c.heading
        if (hD > 180) hD -= 360
        if (hD < -180) hD += 360

        if (Math.abs(latD) > 1e-7 || Math.abs(lonD) > 1e-7 || Math.abs(hD) > 0.05) {
          c.lat += latD * k
          c.lon += lonD * k
          c.heading += hD * k
          setSmooth({ lat: c.lat, lon: c.lon, heading: c.heading, altitude: t.altitude })
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { active = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  return smooth
}

// ----- Radar Map Component -----
function BioRadarMap ({ player: rawPlayer, organisms, planetRadius }) {
  const player = useSmoothPosition(rawPlayer)
  if (!player?.lat || !planetRadius) return null

  // Compute the map scale — fit all scan circles with some padding
  let maxRange = 200 // minimum view radius in meters
  for (const org of organisms) {
    for (const scan of (org.scanPositions || [])) {
      const dist = surfaceDistance(player.lat, player.lon, scan.lat, scan.lon, planetRadius)
      maxRange = Math.max(maxRange, dist + org.colonyDistance)
    }
    maxRange = Math.max(maxRange, org.colonyDistance * 1.5)
  }

  maxRange *= 1.2 // 20% padding

  const center = MAP_SIZE / 2
  const scale = (MAP_SIZE / 2 - 20) / maxRange

  // Convert a lat/lon to SVG coordinates relative to player position
  const toSvg = (lat, lon) => {
    const dist = surfaceDistance(player.lat, player.lon, lat, lon, planetRadius)
    const bear = bearing(player.lat, player.lon, lat, lon)
    const headingRad = (player.heading ?? 0) * DEG_TO_RAD
    const adjustedBear = bear - headingRad
    const x = center + dist * scale * Math.sin(adjustedBear)
    const y = center - dist * scale * Math.cos(adjustedBear)
    return { x, y }
  }

  // Range rings
  const ringDistances = []
  const ringStep = maxRange > 2000 ? 1000 : maxRange > 500 ? 250 : maxRange > 200 ? 100 : 50
  for (let d = ringStep; d < maxRange; d += ringStep) {
    ringDistances.push(d)
  }

  return (
    <div className='bio-radar'>
      <div className='bio-radar__svg-wrap'>
        <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className='bio-radar__svg'>
        <rect x='0' y='0' width={MAP_SIZE} height={MAP_SIZE} fill='rgba(0,0,0,0.3)' rx='4' />

        {/* Range rings */}
        {ringDistances.map(d => (
          <g key={d}>
            <circle cx={center} cy={center} r={d * scale} fill='none' stroke='rgba(250,150,0,0.12)' strokeWidth='1' />
            <text x={center + 5} y={center - d * scale + 12} fill='rgba(250,150,0,0.45)' fontSize='8' fontFamily='monospace'>{formatDistance(d)}</text>
          </g>
        ))}

        {/* Crosshair */}
        <line x1={center} y1='10' x2={center} y2={MAP_SIZE - 10} stroke='rgba(250,150,0,0.1)' strokeWidth='1' />
        <line x1='10' y1={center} x2={MAP_SIZE - 10} y2={center} stroke='rgba(250,150,0,0.1)' strokeWidth='1' />

        {/* North indicator */}
        <text x={center} y='18' fill='rgba(250,150,0,0.5)' fontSize='9' fontFamily='monospace' textAnchor='middle'>N</text>

        {/* Scan exclusion zones */}
        {organisms.map((org, oi) =>
          (org.scanPositions || []).map((scan, si) => {
            const pos = toSvg(scan.lat, scan.lon)
            const radiusPx = org.colonyDistance * scale
            const distToPlayer = surfaceDistance(player.lat, player.lon, scan.lat, scan.lon, planetRadius)
            const isInside = distToPlayer < org.colonyDistance
            const fillColor = isInside ? 'rgba(255, 60, 60, 0.25)' : 'rgba(60, 255, 160, 0.2)'
            const strokeColor = isInside ? 'rgba(255, 60, 60, 0.6)' : 'rgba(60, 255, 160, 0.5)'

            return (
              <g key={`${oi}-${si}`}>
                <circle cx={pos.x} cy={pos.y} r={radiusPx} fill={fillColor} stroke={strokeColor} strokeWidth='2' strokeDasharray={scan.scanType === 'Analyse' ? 'none' : '6,4'} />
                <circle cx={pos.x} cy={pos.y} r='5' fill={isInside ? 'rgba(255, 60, 60, 0.8)' : 'rgba(60, 255, 160, 0.8)'} />
              </g>
            )
          })
        )}

        {/* Player position triangle */}
        <polygon
          points={`${center},${center - 12} ${center - 8},${center + 8} ${center + 8},${center + 8}`}
          fill='rgba(250,150,0,0.9)'
          stroke='rgba(250,150,0,1)'
          strokeWidth='1'
        />
      </svg>
      </div>
      <div className='bio-radar__legend'>
        <span className='bio-radar__legend-item'>
          <span className='bio-radar__legend-dot bio-radar__legend-dot--clear' />
          Outside exclusion
        </span>
        <span className='bio-radar__legend-item'>
          <span className='bio-radar__legend-dot bio-radar__legend-dot--inside' />
          Inside exclusion
        </span>
        <span className='bio-radar__legend-item bio-radar__legend-item--range'>
          Range: {formatDistance(maxRange)}
        </span>
      </div>
    </div>
  )
}

// ----- Biological List Entry -----
function BiologicalEntry ({ bio, isActive, isFiltered, player, planetRadius, isFirstFootfall, minBioValue }) {
  const isScanned = bio.source === 'scanned'
  const isComplete = bio.isComplete === true
  const scanCount = bio.scanProgress?.length ?? 0
  const baseReward = typeof bio.reward === 'number' ? bio.reward : null
  const displayReward = baseReward != null && isFirstFootfall ? baseReward * 5 : baseReward
  const isValuable = displayReward != null && displayReward >= minBioValue

  // Distance calculations when actively scanning
  let nearestScanDist = null
  let isInsideExclusion = false
  let distanceRemaining = null
  if (isScanned && player?.lat && planetRadius && bio.scanPositions?.length > 0) {
    for (const scan of bio.scanPositions) {
      const dist = surfaceDistance(player.lat, player.lon, scan.lat, scan.lon, planetRadius)
      if (nearestScanDist === null || dist < nearestScanDist) nearestScanDist = dist
    }
    isInsideExclusion = nearestScanDist < bio.colonyDistance
    distanceRemaining = Math.max(0, bio.colonyDistance - nearestScanDist)
  }

  let entryClass = 'bio-list__entry'
  if (isActive) entryClass += ' bio-list__entry--active'
  if (isFiltered) entryClass += ' bio-list__entry--hidden'
  if (isComplete) entryClass += ' bio-list__entry--complete'
  if (!isScanned) entryClass += ' bio-list__entry--predicted'
  if (!isValuable && !isActive) entryClass += ' bio-list__entry--dim'

  // Active scanning — expanded view with large image and details
  if (isActive) {
    return (
      <div className={entryClass}>
        <div className='bio-list__active-image'>
          {bio.imageUrl
            ? <img src={bio.imageUrl} alt={bio.species} />
            : <div className='bio-list__image-placeholder'><i className='icon daedalus-terminal-plant' /></div>}
        </div>
        <div className='bio-list__active-details'>
          <div className='bio-list__active-name'>
            <span className='bio-list__genus'>{bio.genus}</span>
            {' '}
            <span className='bio-list__species-name'>{bio.species.replace(bio.genus + ' ', '')}</span>
          </div>
          {bio.variant && bio.variant !== bio.species && (
            <div className='text-muted' style={{ fontSize: '1.6rem' }}>{bio.variant}</div>
          )}
          {bio.description && (
            <div className='bio-list__description text-muted'>{bio.description}</div>
          )}
          {bio.terrain && (
            <div className='bio-list__terrain'>
              <i className='icon daedalus-terminal-planet-landable' style={{ marginRight: '.3rem' }} />
              {bio.terrain}
            </div>
          )}
          <div className='bio-list__active-value'>
            {isFirstFootfall && <i className='icon daedalus-terminal-star text-secondary' title='First Footfall ×5 bonus' style={{ marginRight: '.3rem' }} />}
            {isValuable && <i className='icon daedalus-terminal-credits text-success' style={{ marginRight: '.3rem' }} />}
            {displayReward != null
              ? <span>{displayReward.toLocaleString()} Cr</span>
              : <span className='text-muted'>Unknown value</span>}
          </div>
          <div className='bio-list__progress'>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`bio-list__progress-pip${bio.scanProgress?.[i] ? ' bio-list__progress-pip--done' : ''}${bio.scanProgress?.[i]?.scanType === 'Analyse' ? ' bio-list__progress-pip--analyse' : ''}`}
              >
                {bio.scanProgress?.[i]
                  ? <i className='icon daedalus-terminal-scan' />
                  : <span className='text-muted'>{i + 1}</span>}
              </div>
            ))}
            <span style={{ marginLeft: '.4rem', fontSize: '.9rem' }}>{scanCount} / 3</span>
          </div>
          {nearestScanDist != null && (
            <div className={`bio-list__distance${isInsideExclusion ? ' bio-list__distance--inside' : ' bio-list__distance--clear'}`}>
              {isInsideExclusion
                ? <>Move {formatDistance(distanceRemaining)} to clear zone</>
                : <>Clear — {formatDistance(nearestScanDist - bio.colonyDistance)} beyond exclusion</>}
            </div>
          )}
          <div className='text-muted' style={{ fontSize: '1.4rem' }}>
            Exclusion zone: {formatDistance(bio.colonyDistance)}
          </div>
        </div>
      </div>
    )
  }

  // Standard row view
  return (
    <div className={entryClass}>
      <div className='bio-list__thumb'>
        {bio.imageUrl
          ? <img src={bio.imageUrl} alt={bio.species} loading='lazy' />
          : <div className='bio-list__image-placeholder'><i className='icon daedalus-terminal-plant' /></div>}
      </div>
      <div className='bio-list__row-info'>
        <span className='bio-list__genus'>{bio.genus}</span>
        {' '}
        <span className='bio-list__species-name'>{bio.species.replace(bio.genus + ' ', '')}</span>
        {bio.terrain && (
          <div className='bio-list__row-terrain text-muted'>{bio.terrain}</div>
        )}
      </div>
      <div className='bio-list__row-value'>
        {isFirstFootfall && <i className='icon daedalus-terminal-star text-secondary' title='First Footfall ×5' style={{ marginRight: '.3rem' }} />}
        {isValuable && <i className='icon daedalus-terminal-credits text-success' style={{ marginRight: '.3rem' }} />}
        {displayReward != null
          ? <span>{displayReward.toLocaleString()} Cr</span>
          : <span className='text-muted'>—</span>}
      </div>
      <div className='bio-list__row-status'>
        {isComplete && <span className='text-success'>Complete</span>}
        {isScanned && !isComplete && <span className='text-primary'>{scanCount}/3</span>}
        {!isScanned && bio.probability != null && <span className='text-muted'>{bio.probability}%</span>}
        {!isScanned && bio.probability == null && <span className='text-muted'>Predicted</span>}
      </div>
    </div>
  )
}

// ----- Main Page -----
export default function ExplorationBiologicalsPage () {
  const { connected, active, ready } = useSocket()
  const [data, setData] = useState(null)
  const [minBioValue, setMinBioValue] = useState(DEFAULT_MIN_BIO_VALUE)
  const pollRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await sendEvent('getExplorationBiologicals')
      setData(result)
    } catch (e) { /* ignore fetch errors */ }
  }, [])

  useEffect(() => {
    if (!ready) return
    sendEvent('getPreferences').then(prefs => {
      if (prefs?.explorationMinBioValue != null) setMinBioValue(prefs.explorationMinBioValue)
    }).catch(() => {})
  }, [ready])

  useEffect(() => {
    if (!ready) return
    fetchData()
    pollRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [ready, fetchData])

  useEffect(() => {
    if (!ready) return
    return eventListener('newLogEntry', (log) => {
      if (['ScanOrganic', 'Touchdown', 'Liftoff', 'Location', 'ApproachBody', 'LeaveBody',
        'FSSBodySignals', 'SAASignalsFound', 'SAAScanComplete'].includes(log.event)) {
        fetchData()
      }
    })
  }, [ready, fetchData])

  const isOnSurface = data?.player?.lat != null && data?.planetRadius
  const hasOrganisms = data?.organisms?.length > 0
  const hasPredictions = data?.predictions?.length > 0
  const hasBioData = hasOrganisms || hasPredictions

  // Find the actively-scanning organism (in progress, not complete)
  // If multiple, pick the most recently scanned
  const activeOrganism = (() => {
    if (!hasOrganisms) return null
    const inProgress = data.organisms.filter(o => !o.isComplete && o.scanProgress?.length > 0)
    if (inProgress.length === 0) return null
    return inProgress.reduce((latest, o) => {
      const ts = o.scanProgress[o.scanProgress.length - 1]?.timestamp || ''
      const latestTs = latest.scanProgress[latest.scanProgress.length - 1]?.timestamp || ''
      return ts > latestTs ? o : latest
    })
  })()

  // Scan complete animation: when an organism we were tracking completes,
  // show a "Scan Complete" message before returning to the full list
  const prevActiveRef = useRef(null)
  const [scanCompletePhase, setScanCompletePhase] = useState(null) // null | 'fading-out' | 'complete' | 'fading-in'
  const [completedSpecies, setCompletedSpecies] = useState(null)

  useEffect(() => {
    const prevSpecies = prevActiveRef.current
    if (prevSpecies && !activeOrganism) {
      // We had an active organism that's now gone — check if it completed
      const org = data?.organisms?.find(o => o.species === prevSpecies)
      if (org?.isComplete) {
        setCompletedSpecies(prevSpecies)
        setScanCompletePhase('fading-out')
        const t1 = setTimeout(() => setScanCompletePhase('complete'), 600)
        const t2 = setTimeout(() => setScanCompletePhase('fading-in'), 3000)
        const t3 = setTimeout(() => { setScanCompletePhase(null); setCompletedSpecies(null) }, 3600)
        prevActiveRef.current = null
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
      }
    }
    prevActiveRef.current = activeOrganism?.species || null
  }, [activeOrganism, data?.organisms])

  // Build combined list: scanned organisms first, then predictions
  const combinedBios = []
  if (data?.organisms) {
    for (const org of data.organisms) combinedBios.push({ ...org, source: 'scanned' })
  }
  if (data?.predictions) {
    for (const pred of data.predictions) combinedBios.push({ ...pred, source: 'predicted' })
  }

  // Split into valuable / non-valuable for sectioned display
  const isFirstFootfall = data?.isFirstFootfall
  const valuableBios = combinedBios.filter(bio => {
    const base = typeof bio.reward === 'number' ? bio.reward : null
    const display = base != null && isFirstFootfall ? base * 5 : base
    return display != null && display >= minBioValue
  })
  const nonValuableBios = combinedBios.filter(bio => {
    const base = typeof bio.reward === 'number' ? bio.reward : null
    const display = base != null && isFirstFootfall ? base * 5 : base
    return display == null || display < minBioValue
  })

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!data}>
      <Panel layout='full-width' navigation={ExplorationPanelNavItems('Biologicals')} className='bio-tracker-panel'>
        <h2>
          <i className='icon daedalus-terminal-plant' style={{ marginRight: '.5rem' }} />
          Biological Scanner
        </h2>
        {data?.bodyName && (
          <p className='text-primary' style={{ marginBottom: '.5rem' }}>
            <span className='text-info'>{data.bodyName}</span>
            {data?.isFirstFootfall && <i className='icon daedalus-terminal-star text-secondary' title='First Footfall' style={{ marginLeft: '.5rem', fontSize: '1.4rem' }} />}
            {data?.bioSignalCount > 0 && (
              <span className='text-muted'> — {data.bioSignalCount} biological signal{data.bioSignalCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        )}

        <div className='bio-tracker'>
          {data && !isOnSurface && !hasBioData && (
            <div className='bio-tracker__empty'>
              <i className='icon daedalus-terminal-planet-landable' style={{ fontSize: '4rem', opacity: 0.3, marginBottom: '1rem' }} />
              <p className='text-muted'>Land on a body with biological signals to begin tracking.</p>
              <p className='text-muted' style={{ fontSize: '.9rem' }}>
                Biological data will appear when you scan organisms with the Composition Scanner.
              </p>
            </div>
          )}

          {(isOnSurface || hasBioData) && (
            <div className='bio-tracker__split'>
              <div className='bio-tracker__left'>
                {isOnSurface
                  ? <>
                      <BioRadarMap
                        player={data.player}
                        organisms={(data.organisms || []).filter(o => !o.isComplete && o.scanPositions?.length > 0)}
                        planetRadius={data.planetRadius}
                      />
                      <div className='bio-tracker__player-info text-muted'>
                        Lat {data.player.lat?.toFixed(4)}° Lon {data.player.lon?.toFixed(4)}°
                        {data.player.heading != null && <> Hdg {Math.round(data.player.heading)}°</>}
                        {data.player.altitude != null && <> Alt {formatDistance(data.player.altitude)}</>}
                      </div>
                    </>
                  : <div className='bio-tracker__radar-empty'>
                      <i className='icon daedalus-terminal-scan' style={{ fontSize: '3rem', opacity: 0.2 }} />
                      <p className='text-muted'>Radar activates when on the surface.</p>
                    </div>
                }
              </div>
              <div className='bio-tracker__right'>
                {scanCompletePhase === 'complete'
                  ? <div className='bio-scan-complete'>
                      <i className='icon daedalus-terminal-scan bio-scan-complete__icon' />
                      <span className='bio-scan-complete__text'>Scan Complete</span>
                    </div>
                  : <div className={`bio-list${scanCompletePhase === 'fading-out' ? ' bio-list--fading-out' : ''}${scanCompletePhase === 'fading-in' ? ' bio-list--fading-in' : ''}`}>
                  {activeOrganism
                    ? <>
                        {combinedBios.map((bio, i) => (
                          <BiologicalEntry
                            key={`${bio.species}-${bio.source}-${i}`}
                            bio={bio}
                            isActive={activeOrganism.species === bio.species}
                            isFiltered={activeOrganism.species !== bio.species}
                            player={data?.player}
                            planetRadius={data?.planetRadius}
                            isFirstFootfall={data?.isFirstFootfall}
                            minBioValue={minBioValue}
                          />
                        ))}
                      </>
                    : <>
                        {valuableBios.length > 0 && (
                          <div className='bio-list__section'>
                            {valuableBios.map((bio, i) => (
                              <BiologicalEntry
                                key={`v-${bio.species}-${bio.source}-${i}`}
                                bio={bio}
                                isActive={false}
                                isFiltered={false}
                                player={data?.player}
                                planetRadius={data?.planetRadius}
                                minBioValue={minBioValue}
                                isFirstFootfall={data?.isFirstFootfall}
                              />
                            ))}
                          </div>
                        )}
                        {nonValuableBios.length > 0 && (
                          <div className='bio-list__section'>
                            {nonValuableBios.map((bio, i) => (
                              <BiologicalEntry
                                key={`nv-${bio.species}-${bio.source}-${i}`}
                                bio={bio}
                                isActive={false}
                                isFiltered={false}
                                player={data?.player}
                                planetRadius={data?.planetRadius}
                                isFirstFootfall={data?.isFirstFootfall}
                                minBioValue={minBioValue}
                              />
                            ))}
                          </div>
                        )}
                        {combinedBios.length === 0 && (
                          <p className='text-muted' style={{ textAlign: 'center', padding: '2rem' }}>
                            No biological data available yet.
                          </p>
                        )}
                      </>
                  }
                </div>
                }
              </div>
            </div>
          )}
        </div>
      </Panel>
    </Layout>
  )
}
