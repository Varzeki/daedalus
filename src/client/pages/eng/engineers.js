import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import distance from '../../../shared/distance'
import { UNKNOWN_VALUE } from '../../../shared/consts'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { EngineeringPanelNavItems } from 'lib/navigation-items'
import { getActiveShipId, setActiveShipId, getWishlist, addToWishlist, removeFromWishlist } from 'lib/wishlist'
import { buildEngineerRoute } from 'lib/engineering-calc'
import Layout from 'components/layout'
import Panel from 'components/panel'
import CopyOnClick from 'components/copy-on-click'

// ── Portrait helper ──────────────────────────────────────────────────────────

function engineerPortraitSrc (name) {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\s+/g, '_')
  return `/images/engineers/${slug}.jpg`
}

// ── Unlock step helpers ──────────────────────────────────────────────────────

function getAllUnlockSteps (engineer, prerequisites) {
  const status = (engineer.progress.status ?? '').toLowerCase()
  const prereq = prerequisites?.[String(engineer.id)]
  if (!prereq) return []

  const learnDone = status !== UNKNOWN_VALUE.toLowerCase() && status !== 'unknown'
  const inviteDone = status === 'invited' || status === 'unlocked'
  const unlockDone = status === 'unlocked'

  const steps = []
  if (prereq.learn) steps.push({ key: 'learn', label: prereq.learn.description, done: learnDone })
  if (prereq.invite) steps.push({ key: 'invite', label: prereq.invite.description, done: inviteDone })
  if (prereq.unlock) {
    const unlockLabel = prereq.unlock.description
      ?? `Provide ${prereq.unlock.amount ?? '?'}x ${prereq.unlock.name ?? prereq.unlock.symbol}`
    steps.push({ key: 'unlock', label: unlockLabel, done: unlockDone })
  }
  return steps
}

// ── Card grid ────────────────────────────────────────────────────────────────

const CARD_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(max(200px, calc(100% / 6 - 1rem)), 1fr))',
  gap: '1rem',
  marginTop: '.75rem',
  marginBottom: '1.5rem'
}

const COLONIA_GOLD = '#e6a817'

// Petra Olmanova, Marsha Hicks, Mel Brandon, Etienne Dorn (Horizons)
// Baltanos, Eleanor Bresa, Rosa Dayette, Yi Shen (Odyssey)
const COLONIA_ENGINEER_IDS = new Set(['300130', '300150', '300280', '300290', '400010', '400011', '400012', '400013'])

function isColoniaEngineer (engineer) {
  return COLONIA_ENGINEER_IDS.has(String(engineer.id))
}

function EngineerCard ({ engineer, currentSystem, prerequisites, onAddToWishlist, onRemoveFromWishlist, wishedIds }) {
  const status = (engineer.progress.status ?? '').toLowerCase()
  const isUnlocked = status === 'unlocked'
  const isLocked = engineer.progress.status === UNKNOWN_VALUE
  const steps = getAllUnlockSteps(engineer, prerequisites)
  const dist = currentSystem?.position
    ? distance(currentSystem.position, engineer.system.position).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null
  const isWished = wishedIds.has(String(engineer.id))
  const isColonia = isColoniaEngineer(engineer)

  const statusColor = isUnlocked
    ? 'var(--color-success)'
    : isLocked ? 'var(--color-danger)' : 'var(--color-primary)'
  const statusLabel = isUnlocked
    ? `Rank ${engineer.progress.rank}`
    : isLocked ? 'Locked' : engineer.progress.status

  return (
    <div style={{
      border: `${isColonia ? '3px' : '1px'} solid ${isColonia ? COLONIA_GOLD : isUnlocked ? 'var(--color-success)' : isLocked ? 'rgba(255,255,255,.15)' : 'var(--color-primary)'}`,
      boxShadow: isColonia ? `0 0 14px 3px ${COLONIA_GOLD}88, inset 0 0 8px 0 ${COLONIA_GOLD}22` : undefined,
      borderRadius: '4px',
      overflow: 'hidden',
      opacity: isLocked ? 0.45 : 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-primary-dark)'
    }}>
      <div style={{ position: 'relative', width: '100%', paddingTop: '75%', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={engineerPortraitSrc(engineer.name)}
          alt={engineer.name}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'top center',
            filter: isUnlocked ? 'none' : isLocked ? 'grayscale(1) brightness(0.5)' : 'grayscale(0.4) brightness(0.75)'
          }}
          onError={e => { e.target.style.display = 'none' }}
        />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'rgba(0,0,0,.65)',
          padding: '.2rem .4rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.25rem'
        }}>
          <span style={{ color: statusColor, fontSize: '1em', fontWeight: 700, textTransform: 'uppercase' }}>{statusLabel}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: '.35rem' }}>
            {isColonia && <span style={{ color: COLONIA_GOLD, fontSize: '.85em', fontWeight: 700 }}>Colonia</span>}
            {dist && <span className='text-muted' style={{ fontSize: '.9em' }}>{dist} Ly</span>}
          </span>
        </div>
      </div>

      <div style={{ padding: '.5rem .6rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <h4 className={isUnlocked ? 'text-info' : 'text-info text-muted'} style={{ margin: 0, fontSize: '1.1em', lineHeight: 1.2 }}>
          <CopyOnClick>{engineer.name}</CopyOnClick>
        </h4>

        {isUnlocked && engineer.progress.rank > 0 &&
          <div className='text-secondary' style={{ display: 'flex', gap: '.1rem', flexWrap: 'wrap' }}>
            {[...Array(engineer.progress.rank)].map((_, i) =>
              <i key={i} className='icon daedalus-terminal-engineering' style={{ fontSize: '1rem' }} />
            )}
          </div>}

        {!isUnlocked && steps.length > 0 &&
          <ol style={{ margin: 0, padding: '0 0 0 1.1em', fontSize: '1em' }}>
            {steps.map(step => (
              <li
                key={step.key}
                className={step.done ? 'text-success' : 'text-muted'}
                style={{ margin: '.15rem 0', lineHeight: 1.3, textDecoration: step.done ? 'line-through' : 'none', opacity: step.done ? 0.7 : 1 }}
              >
                {step.label}
              </li>
            ))}
          </ol>}

        <div className='text-muted' style={{ fontSize: '1em', marginTop: 'auto', paddingTop: '.25rem' }}>
          <CopyOnClick>{engineer.system.name}</CopyOnClick>
        </div>

        {!isUnlocked &&
          <button
            className='button'
            style={{
              width: '100%',
              marginTop: '.25rem',
              padding: '.3rem .5rem',
              fontSize: '1em',
              color: isWished ? 'var(--color-success)' : undefined
            }}
            disabled={!onAddToWishlist}
            onClick={() => isWished ? onRemoveFromWishlist(engineer) : onAddToWishlist(engineer)}
            title={isWished ? 'Remove engineer unlock from wishlist' : 'Add engineer unlock to wishlist'}
          >
            {isWished ? '+ On Wishlist' : '+ Add Unlock'}
          </button>}
      </div>
    </div>
  )
}

function EngineerCardGrid ({ engineers, currentSystem, prerequisites, onAddToWishlist, onRemoveFromWishlist, wishedIds }) {
  if (!engineers?.length) return <p className='text-muted'>None</p>
  return (
    <div style={CARD_GRID_STYLE}>
      {engineers.map(engineer => (
        <EngineerCard
          key={`card_${engineer.name}`}
          engineer={engineer}
          currentSystem={currentSystem}
          prerequisites={prerequisites}
          onAddToWishlist={onAddToWishlist}
          onRemoveFromWishlist={onRemoveFromWishlist}
          wishedIds={wishedIds}
        />
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EngineeringEngineersPage () {
  const router = useRouter()
  const { query } = router
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [currentSystem, setCurrentSystem] = useState()
  const [engineers, setEngineers] = useState()
  const [blueprints, setBlueprints] = useState()
  const [prerequisites, setPrerequisites] = useState({})
  const [shipId, setShipId] = useState(() => getActiveShipId())
  const [wishlist, setWishlist] = useState(() => {
    const id = getActiveShipId()
    return id ? getWishlist(id) : []
  })

  useEffect(() => {
    ;(async () => {
      if (!connected || !router.isReady) return
      const [newEngineers, newBlueprints, newPrerequisites, newSystem] = await Promise.all([
        sendEvent('getEngineers'),
        sendEvent('getBlueprints'),
        sendEvent('getEngineerPrerequisites'),
        sendEvent('getSystem')
      ])
      setEngineers(newEngineers)
      setBlueprints(newBlueprints)
      setPrerequisites(newPrerequisites ?? {})
      if (newSystem?.address) setCurrentSystem(newSystem)
      setComponentReady(true)
    })()
  }, [connected, ready, router.isReady, query])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (['Location', 'FSDJump'].includes(log.event)) {
      const newSystem = await sendEvent('getSystem')
      if (newSystem?.address) setCurrentSystem(newSystem)
    }
    if (log.event === 'EngineerProgress') {
      setEngineers((await sendEvent('getEngineers')) ?? [])
    }
    if (log.event === 'Loadout' && log.ShipID != null) {
      const id = String(log.ShipID)
      setActiveShipId(id)
      setShipId(id)
      setWishlist(getWishlist(id))
    }
  }), [])

  function handleAddToWishlist (engineer) {
    if (!shipId) return
    const item = {
      id: crypto.randomUUID(),
      type: 'engineer_unlock',
      engineerId: engineer.id,
      engineerName: engineer.name
    }
    const updated = addToWishlist(shipId, item)
    setWishlist([...updated])
  }

  function handleRemoveFromWishlist (engineer) {
    if (!shipId) return
    const current = getWishlist(shipId)
    const item = current.find(i => i.type === 'engineer_unlock' && String(i.engineerId) === String(engineer.id))
    if (!item) return
    const updated = removeFromWishlist(shipId, item.id)
    setWishlist([...updated])
  }

  const wishedIds = useMemo(() => {
    const ids = new Set()
    for (const item of wishlist) {
      if (item.type === 'engineer_unlock') ids.add(String(item.engineerId))
    }
    return ids
  }, [wishlist])

  const neededEngineers = useMemo(() => {
    if (!engineers || !blueprints || !wishlist.length) return []
    const stops = buildEngineerRoute(wishlist, blueprints, engineers, currentSystem?.position ?? null)
    return stops
      .map(stop => engineers.find(e => String(e.id) === String(stop.engineerId)))
      .filter(Boolean)
  }, [engineers, blueprints, wishlist, currentSystem])

  const cardProps = {
    currentSystem,
    prerequisites,
    onAddToWishlist: shipId ? handleAddToWishlist : null,
    onRemoveFromWishlist: shipId ? handleRemoveFromWishlist : null,
    wishedIds
  }

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Engineers')}>
        <h2>Engineers</h2>
        <h3 className='text-primary'>Engineers &amp; Workshops</h3>
        <p className='text-primary'>
          Engineers can use Blueprints and Experimental Effects to improve ships and equipment
        </p>

        {neededEngineers.length > 0 &&
          <>
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Engineers Needed</h4>
            </div>
            <p className='text-primary'>Engineers required for your current engineering wishlist</p>
            <EngineerCardGrid engineers={neededEngineers} {...cardProps} />
          </>}

        {engineers && engineers.length > 0 &&
          <>
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Unlocked Engineers</h4>
            </div>
            <EngineerCardGrid
              engineers={engineers.filter(e => e.progress.status.toLowerCase() === 'unlocked')}
              {...cardProps}
            />

            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Known / Invited Engineers</h4>
            </div>
            <EngineerCardGrid
              engineers={engineers.filter(e => e.progress.status !== UNKNOWN_VALUE && e.progress.status.toLowerCase() !== 'unlocked')}
              {...cardProps}
            />

            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Locked Engineers</h4>
            </div>
            <EngineerCardGrid
              engineers={engineers.filter(e => e.progress.status === UNKNOWN_VALUE)}
              {...cardProps}
            />
          </>}
      </Panel>
    </Layout>
  )
}
