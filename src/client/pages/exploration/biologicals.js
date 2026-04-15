import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ExplorationPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'

const POLL_INTERVAL = 1000 // 1s position polling
const MAP_SIZE = 400 // SVG viewBox size
const DEG_TO_RAD = Math.PI / 180

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

// ----- Radar Map Component -----
function BioRadarMap ({ player, organisms, planetRadius }) {
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
      <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className='bio-radar__svg'>
        <rect x='0' y='0' width={MAP_SIZE} height={MAP_SIZE} fill='rgba(0,0,0,0.3)' rx='4' />

        {/* Range rings */}
        {ringDistances.map(d => (
          <g key={d}>
            <circle cx={center} cy={center} r={d * scale} fill='none' stroke='rgba(250,150,0,0.12)' strokeWidth='0.5' />
            <text x={center + 3} y={center - d * scale + 10} fill='rgba(250,150,0,0.35)' fontSize='8' fontFamily='monospace'>{formatDistance(d)}</text>
          </g>
        ))}

        {/* Crosshair */}
        <line x1={center} y1='10' x2={center} y2={MAP_SIZE - 10} stroke='rgba(250,150,0,0.1)' strokeWidth='0.5' />
        <line x1='10' y1={center} x2={MAP_SIZE - 10} y2={center} stroke='rgba(250,150,0,0.1)' strokeWidth='0.5' />

        {/* North indicator */}
        <text x={center} y='14' fill='rgba(250,150,0,0.5)' fontSize='9' fontFamily='monospace' textAnchor='middle'>N</text>

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
                <circle cx={pos.x} cy={pos.y} r={radiusPx} fill={fillColor} stroke={strokeColor} strokeWidth='1' strokeDasharray={scan.scanType === 'Analyse' ? 'none' : '3,2'} />
                <circle cx={pos.x} cy={pos.y} r='2.5' fill={isInside ? 'rgba(255, 60, 60, 0.8)' : 'rgba(60, 255, 160, 0.8)'} />
              </g>
            )
          })
        )}

        {/* Player position triangle */}
        <polygon
          points={`${center},${center - 6} ${center - 4},${center + 4} ${center + 4},${center + 4}`}
          fill='rgba(250,150,0,0.9)'
          stroke='rgba(250,150,0,1)'
          strokeWidth='0.5'
        />
      </svg>
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

// ----- Organism Card Component -----
function OrganismCard ({ organism, player, planetRadius, isActive }) {
  const scanCount = organism.scanProgress?.length ?? 0
  const requiredScans = 3
  const progressSteps = []
  for (let i = 0; i < requiredScans; i++) {
    progressSteps.push(organism.scanProgress?.[i] ?? null)
  }

  // Calculate nearest scan distance from player
  let nearestScanDist = null
  let isInsideExclusion = false
  if (player?.lat && planetRadius && organism.scanPositions?.length > 0) {
    for (const scan of organism.scanPositions) {
      const dist = surfaceDistance(player.lat, player.lon, scan.lat, scan.lon, planetRadius)
      if (nearestScanDist === null || dist < nearestScanDist) {
        nearestScanDist = dist
      }
    }
    isInsideExclusion = nearestScanDist < organism.colonyDistance
  }

  const distanceRemaining = nearestScanDist != null
    ? Math.max(0, organism.colonyDistance - nearestScanDist)
    : null

  return (
    <div className={`bio-card${isActive ? ' bio-card--active' : ''}${organism.isComplete ? ' bio-card--complete' : ''}`}>
      <div className='bio-card__image-container'>
        {organism.imageUrl
          ? <img src={organism.imageUrl} alt={organism.species} className='bio-card__image' loading='lazy' />
          : <div className='bio-card__image-placeholder'><i className='icon daedalus-terminal-plant' /></div>}
      </div>

      <div className='bio-card__info'>
        <div className='bio-card__name'>
          <span className='bio-card__genus'>{organism.genus}</span>
          {' '}
          <span className='bio-card__species'>{organism.species.replace(organism.genus + ' ', '')}</span>
        </div>

        {organism.variant && organism.variant !== organism.species && (
          <div className='bio-card__variant text-muted'>{organism.variant}</div>
        )}

        <div className='bio-card__reward'>
          {typeof organism.reward === 'number'
            ? <span>{organism.reward.toLocaleString()} Cr</span>
            : <span className='text-muted'>Unknown value</span>}
        </div>

        {/* Scan progress pips */}
        <div className='bio-card__progress'>
          {progressSteps.map((step, i) => (
            <div
              key={i}
              className={`bio-card__progress-step${step ? ' bio-card__progress-step--done' : ''}${step?.scanType === 'Analyse' ? ' bio-card__progress-step--analyse' : ''}`}
              title={step?.scanType || `Scan ${i + 1}`}
            >
              {step ? <i className='icon daedalus-terminal-scan' /> : <span className='text-muted'>{i + 1}</span>}
            </div>
          ))}
          <span className='bio-card__progress-label'>
            {organism.isComplete
              ? <span className='text-success'>Complete</span>
              : <span>{scanCount} / {requiredScans}</span>}
          </span>
        </div>

        {/* Distance to exclusion zone */}
        {!organism.isComplete && nearestScanDist != null && (
          <div className={`bio-card__distance${isInsideExclusion ? ' bio-card__distance--inside' : ' bio-card__distance--clear'}`}>
            {isInsideExclusion
              ? <>Move {formatDistance(distanceRemaining)} to clear zone</>
              : <>Clear — {formatDistance(nearestScanDist - organism.colonyDistance)} beyond exclusion</>}
          </div>
        )}

        <div className='bio-card__colony-distance text-muted'>
          Exclusion: {formatDistance(organism.colonyDistance)}
        </div>
      </div>
    </div>
  )
}

// ----- Prediction Card Component -----
function PredictionCard ({ prediction }) {
  return (
    <div className='bio-card bio-card--prediction'>
      <div className='bio-card__image-container'>
        {prediction.imageUrl
          ? <img src={prediction.imageUrl} alt={prediction.species} className='bio-card__image' loading='lazy' />
          : <div className='bio-card__image-placeholder'><i className='icon daedalus-terminal-plant' /></div>}
      </div>
      <div className='bio-card__info'>
        <div className='bio-card__name text-muted'>
          <span>{prediction.genus}</span>
          {' '}
          <span>{prediction.species.replace(prediction.genus + ' ', '')}</span>
        </div>
        <div className='bio-card__reward text-muted'>
          {typeof prediction.reward === 'number'
            ? <span>{prediction.reward.toLocaleString()} Cr</span>
            : <span>Unknown value</span>}
        </div>
        <div className='bio-card__colony-distance text-muted'>
          Exclusion: {formatDistance(prediction.colonyDistance)}
        </div>
      </div>
    </div>
  )
}

// ----- Main Page -----
export default function ExplorationBiologicalsPage () {
  const { connected, active, ready } = useSocket()
  const [data, setData] = useState(null)
  const pollRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await sendEvent('getExplorationBiologicals')
      setData(result)
    } catch (e) { /* ignore fetch errors */ }
  }, [])

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
  const activeOrganism = data?.organisms?.find(o => !o.isComplete && o.scanProgress?.length > 0)

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ExplorationPanelNavItems('Biologicals')} className='bio-tracker-panel'>
        <h2>
          <i className='icon daedalus-terminal-plant' style={{ marginRight: '.5rem' }} />
          Biological Scanner
        </h2>
        {data?.bodyName && (
          <p className='text-primary' style={{ marginBottom: '.5rem' }}>
            <span className='text-info'>{data.bodyName}</span>
            {data?.bioSignalCount > 0 && (
              <span className='text-muted'> — {data.bioSignalCount} biological signal{data.bioSignalCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        )}

        <div className='bio-tracker'>
          {!isOnSurface && !hasOrganisms && (
            <div className='bio-tracker__empty'>
              <i className='icon daedalus-terminal-planet-landable' style={{ fontSize: '4rem', opacity: 0.3, marginBottom: '1rem' }} />
              <p className='text-muted'>Land on a body with biological signals to begin tracking.</p>
              <p className='text-muted' style={{ fontSize: '.9rem' }}>
                Biological data will appear when you scan organisms with the Composition Scanner.
              </p>
            </div>
          )}

          {(isOnSurface || hasOrganisms) && (
            <div className='bio-tracker__content'>
              {/* Radar map */}
              {isOnSurface && hasOrganisms && (
                <div className='bio-tracker__map-section'>
                  <BioRadarMap
                    player={data.player}
                    organisms={data.organisms.filter(o => o.scanPositions?.length > 0)}
                    planetRadius={data.planetRadius}
                  />
                  <div className='bio-tracker__player-info text-muted'>
                    Lat {data.player.lat?.toFixed(4)}° Lon {data.player.lon?.toFixed(4)}°
                    {data.player.heading != null && <> Hdg {Math.round(data.player.heading)}°</>}
                    {data.player.altitude != null && <> Alt {formatDistance(data.player.altitude)}</>}
                  </div>
                </div>
              )}

              {/* Scanned organisms */}
              {hasOrganisms && (
                <div className='bio-tracker__organisms'>
                  <h3 className='bio-tracker__section-title'>Scanned Organisms</h3>
                  <div className='bio-tracker__card-grid'>
                    {data.organisms.map((org, i) => (
                      <OrganismCard
                        key={`${org.species}-${i}`}
                        organism={org}
                        player={data.player}
                        planetRadius={data.planetRadius}
                        isActive={activeOrganism === org}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Predicted species */}
              {hasPredictions && (
                <div className='bio-tracker__predictions'>
                  <h3 className='bio-tracker__section-title text-muted'>Predicted Species</h3>
                  <div className='bio-tracker__card-grid'>
                    {data.predictions.map((pred, i) => (
                      <PredictionCard key={`pred-${pred.species}-${i}`} prediction={pred} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>
    </Layout>
  )
}
