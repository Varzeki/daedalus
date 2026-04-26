import { useState, useEffect, useMemo } from 'react'
import animateTableEffect from 'lib/animate-table-effect'
import Link from 'next/link'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { EngineeringPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { getActiveShipId, getWishlist } from 'lib/wishlist'
import {
  aggregateMaterialRequirements,
  allocateTradeSuggestions,
  generateSmartRoute,
  buildEngineerRoute,
  findNearestTrader,
  calculateDistance
} from 'lib/engineering-calc'

// ── Collection method settings ──────────────────────────────────────────────

const COLLECTION_METHODS_KEY = 'daedalus_collection_methods'

const DEFAULT_COLLECTION_METHODS = {
  raw: { srv_surface: true, geological_sites: true },
  encoded: { wake_scanning: true, data_source: true, nav_beacon: true, signal_source: true },
  manufactured: { combat_drop: true, mission_reward: true, ship_salvage: true, on_foot: true }
}

const COLLECTION_METHOD_LABELS = {
  srv_surface: 'SRV Surface',
  geological_sites: 'Geological Sites',
  wake_scanning: 'Wake Scanning',
  data_source: 'Data Points',
  nav_beacon: 'Nav Beacon',
  signal_source: 'Signal Sources',
  combat_drop: 'Combat / Bounties',
  mission_reward: 'Mission Rewards',
  ship_salvage: 'Ship Salvage',
  on_foot: 'On-Foot Activities'
}

function loadCollectionMethods () {
  try {
    const stored = localStorage.getItem(COLLECTION_METHODS_KEY)
    if (stored) return JSON.parse(stored)
  } catch (_) {}
  return DEFAULT_COLLECTION_METHODS
}

function saveCollectionMethods (methods) {
  try { localStorage.setItem(COLLECTION_METHODS_KEY, JSON.stringify(methods)) } catch (_) {}
}

function toEnabledSet (methodsConfig) {
  const enabled = new Set()
  for (const category of Object.values(methodsConfig)) {
    for (const [key, on] of Object.entries(category)) {
      if (on) enabled.add(key)
    }
  }
  return enabled
}

// ── Tab: Smart Route ────────────────────────────────────────────────────────

const STOP_ICON_CLASSES = {
  collection: 'daedalus-terminal-materials-raw',
  trade: 'daedalus-terminal-cargo',
  engineer: 'daedalus-terminal-engineer',
  activity: 'daedalus-terminal-poi',
  commodity_purchase: 'daedalus-terminal-cargo-buy',
  outfitting: 'daedalus-terminal-cogs'
}

const STOP_LABELS = {
  collection: 'Collection',
  trade: 'Trade',
  engineer: 'Engineer',
  activity: 'Activity',
  commodity_purchase: 'Commodity Purchase',
  outfitting: 'Outfitting'
}

function GradePill ({ grade, type }) {
  const TYPE_MAP = {
    raw: { iconClass: 'daedalus-terminal-materials-raw', textClass: 'text-success' },
    encoded: { iconClass: 'daedalus-terminal-materials-encoded', textClass: 'text-info' },
    manufactured: { iconClass: 'daedalus-terminal-materials-manufactured', textClass: 'text-secondary' }
  }
  const { iconClass, textClass } = TYPE_MAP[(type ?? '').toLowerCase()] ?? { iconClass: 'daedalus-terminal-materials', textClass: 'text-muted' }
  return (
    <span className={textClass} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
      <i className={`icon ${iconClass}`} style={{ marginRight: '.2rem' }} />
      G{grade}
    </span>
  )
}

function RouteStopCard ({ stop, index }) {
  const iconClass = STOP_ICON_CLASSES[stop.type] ?? 'daedalus-terminal-poi'
  const label = STOP_LABELS[stop.type] ?? stop.type

  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
      {/* Timeline connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '2.5rem' }}>
        <div style={{
          width: '2rem', height: '2rem', borderRadius: '50%',
          background: 'var(--color-primary)', color: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '.9rem', flexShrink: 0
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, width: '2px', background: 'var(--color-primary)', opacity: .3, minHeight: '1.5rem' }} />
      </div>

      {/* Card */}
      <div style={{ flex: 1, marginBottom: '.5rem' }}>
        {/* Stop header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
          <i className={`icon ${iconClass}`} style={{ fontSize: '1rem' }} />
          <strong>{stop.system?.name ?? 'Unknown System'}</strong>
          <span className='text-muted' style={{ fontSize: '.85rem' }}>({label})</span>
          {stop.distanceFromPrev != null && stop.distanceFromPrev !== Infinity && index > 0 &&
            <span className='text-muted' style={{ fontSize: '.8rem', marginLeft: 'auto' }}>
              {stop.distanceFromPrev} Ly
            </span>}
        </div>

        {/* Card body */}
        <div style={{
          background: 'rgba(255,255,255,.04)',
          border: '1px solid var(--color-primary)',
          borderRadius: '4px',
          padding: '.75rem 1rem',
          fontSize: '.9rem'
        }}>
          {stop.type === 'collection' && <CollectionStopBody stop={stop} />}
          {stop.type === 'trade' && <TradeStopBody stop={stop} />}
          {stop.type === 'engineer' && <EngineerStopBody stop={stop} />}
          {stop.type === 'activity' && <ActivityStopBody stop={stop} />}
          {stop.type === 'commodity_purchase' && <CommodityStopBody stop={stop} />}
        </div>
      </div>
    </div>
  )
}

function CollectionStopBody ({ stop }) {
  return (
    <>
      {(stop.materials ?? []).map((mat, i) =>
        <div key={`${mat.symbol}_${i}`} style={{ marginBottom: '.5rem', padding: '.25rem 0', borderBottom: i < stop.materials.length - 1 ? '1px solid rgba(255,255,255,.1)' : 'none' }}>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.15rem', flexWrap: 'wrap' }}>
            <span>Collect {mat.amountToCollect.toLocaleString()}×</span>
            <strong>{mat.name}</strong>
            <GradePill grade={mat.grade} type={mat.type} />
          </div>
          {mat.instructions &&
            <div className='text-muted' style={{ fontSize: '.85rem' }}><i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />{mat.instructions}</div>}
        </div>
      )}
      {stop.noSource &&
        <div className='text-warning' style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
          <i className='icon daedalus-terminal-warning' style={{ marginRight: '.2rem' }} />No known hotspot for enabled collection methods.
        </div>}
    </>
  )
}

function TradeStopBody ({ stop }) {
  return (
    <>
      {stop.station &&
        <div className='text-muted' style={{ marginBottom: '.4rem', fontSize: '.85rem' }}>
          Station: <strong className='text-primary'>{stop.station.name}</strong>
          {stop.station.distanceToArrival != null &&
            <span> · {stop.station.distanceToArrival.toLocaleString()} Ls</span>}
        </div>}
      <div className='text-muted' style={{ marginBottom: '.4rem', fontSize: '.85rem' }}>
        <i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />Dock → Contacts → Material Trader
      </div>
      {(stop.trades ?? []).map((trade, i) =>
        <div key={`trade_${i}`} className='text-primary' style={{ fontSize: '.9rem', marginBottom: '.2rem' }}>
          Give {trade.give.amount.toLocaleString()}× <strong>{trade.give.name}</strong> (G{trade.give.grade})
          {' → '}
          Receive {trade.receive.amount.toLocaleString()}× <strong>{trade.receive.name}</strong> (G{trade.receive.grade})
        </div>
      )}
    </>
  )
}

function EngineerStopBody ({ stop }) {
  const isUnlocked = (stop.unlockStatus ?? '').toLowerCase() === 'unlocked'
  return (
    <>
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '.4rem', flexWrap: 'wrap' }}>
        <span className={isUnlocked ? 'text-success' : 'text-warning'} style={{ fontSize: '.85rem' }}>
          {isUnlocked ? '✓ Unlocked' : `⚠ ${stop.unlockStatus ?? 'Locked'}`}
        </span>
        {stop.rank > 0 &&
          <span className='text-muted' style={{ fontSize: '.85rem' }}>
            Rank {stop.rank} (+{stop.rankProgress ?? 0}%)
          </span>}
      </div>
      <div className='text-muted' style={{ marginBottom: '.4rem', fontSize: '.85rem' }}>
        <i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />Dock → Contacts → Engineers
      </div>
      {(stop.blueprints ?? []).map((bp, i) =>
        <div key={`bp_${i}`} style={{ fontSize: '.9rem', marginBottom: '.15rem' }}>
          <span className='text-primary'>{bp.name}</span>
          <span className='text-muted'> G{bp.grade}</span>
        </div>
      )}
    </>
  )
}

function ActivityStopBody ({ stop }) {
  return (
    <div>
      {stop.forEngineer &&
        <div className='text-muted' style={{ fontSize: '.85rem', marginBottom: '.3rem' }}>
          For: {stop.forEngineer} ({stop.unlockStage ?? 'invite'} step)
        </div>}
      <div>{stop.description}</div>
    </div>
  )
}

function CommodityStopBody ({ stop }) {
  return (
    <>
      {stop.forEngineer &&
        <div className='text-muted' style={{ fontSize: '.85rem', marginBottom: '.3rem' }}>
          For: {stop.forEngineer} (unlock step)
        </div>}
      {stop.station &&
        <div className='text-muted' style={{ fontSize: '.85rem', marginBottom: '.3rem' }}>
          Station: <strong className='text-primary'>{stop.station.name}</strong>
          {stop.station.distanceToArrival != null &&
            <span> · {stop.station.distanceToArrival.toLocaleString()} Ls</span>}
        </div>}
      {stop.commodity &&
        <div className='text-primary' style={{ fontSize: '.9rem' }}>
          <i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />Dock → Commodities Market → Buy {stop.commodity.amount}× <strong>{stop.commodity.name}</strong>
        </div>}
    </>
  )
}

function CollectionMethodSettings ({ methods, onChange }) {
  const [expanded, setExpanded] = useState(false)

  function toggle (category, key) {
    const categoryMethods = methods[category] ?? {}
    const currentlyOn = categoryMethods[key] ?? false
    if (currentlyOn) {
      const enabledCount = Object.values(categoryMethods).filter(Boolean).length
      if (enabledCount <= 1) return
    }
    onChange({ ...methods, [category]: { ...categoryMethods, [key]: !currentlyOn } })
  }

  return (
    <div style={{ marginBottom: '1rem', border: '1px solid var(--color-primary)', borderRadius: '4px' }}>
      <button
        style={{ width: '100%', padding: '.5rem .75rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: 'inherit' }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className='text-primary text-uppercase' style={{ fontSize: '.85rem', fontWeight: 600 }}>
          Collection Methods
        </span>
        <span className='text-muted'>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded &&
        <div style={{ padding: '.5rem .75rem', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          {[['raw', 'Raw'], ['encoded', 'Encoded'], ['manufactured', 'Manufactured']].map(([cat, label]) =>
            <div key={cat} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap' }}>
              <span className='text-muted' style={{ minWidth: '6rem', fontSize: '.85rem' }}>{label}:</span>
              {Object.keys(methods[cat] ?? {}).map(key => {
                const on = methods[cat][key]
                const enabledCount = Object.values(methods[cat]).filter(Boolean).length
                const disabled = on && enabledCount <= 1
                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, fontSize: '.85rem' }}>
                    <input type='checkbox' checked={on} disabled={disabled} onChange={() => toggle(cat, key)} />
                    {COLLECTION_METHOD_LABELS[key] ?? key}
                  </label>
                )
              })}
            </div>
          )}
        </div>}
    </div>
  )
}

function SmartRouteTab ({ wishlist, blueprints, materials, engineers, materialSources, materialTraders, currentSystem }) {
  const [methods, setMethods] = useState(loadCollectionMethods)

  function handleMethodChange (newMethods) {
    setMethods(newMethods)
    saveCollectionMethods(newMethods)
  }

  const { route, totalDistance, stopCount } = useMemo(() => {
    if (!wishlist.length || !blueprints.length || !materials.length) {
      return { route: [], totalDistance: 0, stopCount: 0 }
    }

    const allRequirements = aggregateMaterialRequirements(wishlist, blueprints, materials)
    const allocated = allocateTradeSuggestions(allRequirements, materials)
    const enabledMethods = toEnabledSet(methods)
    const currentPos = currentSystem?.position ?? null

    const stops = generateSmartRoute({
      allocatedShortfalls: allocated,
      engineers: engineers ?? [],
      wishlist,
      blueprints,
      materialSources: materialSources ?? {},
      materialTraders: materialTraders ?? {},
      currentPos,
      enabledMethods
    })

    const totalDist = stops.reduce((sum, s) => {
      const d = s.distanceFromPrev
      return d != null && d !== Infinity ? sum + d : sum
    }, 0)

    return { route: stops, totalDistance: Math.round(totalDist), stopCount: stops.length }
  }, [wishlist, blueprints, materials, engineers, materialSources, materialTraders, methods, currentSystem])

  if (!wishlist.length) {
    return (
      <div className='text-muted' style={{ padding: '2rem 0' }}>
        Your engineering wishlist is empty.{' '}
        <Link href='/eng/wishlist' className='text-primary'>Add blueprints in the Wishlist tab</Link> to generate a route.
      </div>
    )
  }

  return (
    <>
      <CollectionMethodSettings methods={methods} onChange={handleMethodChange} />
      {route.length === 0
        ? (
          <div className='text-success' style={{ padding: '1rem 0' }}>
            No route stops needed — all materials satisfied.
          </div>
          )
        : (
          <>
            <div className='text-muted' style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>
              {stopCount} stop{stopCount !== 1 ? 's' : ''} · ~{totalDistance.toLocaleString()} Ly total
            </div>
            <div>
              {route.map((stop, i) => <RouteStopCard key={`stop_${i}`} stop={stop} index={i} />)}
            </div>
          </>
          )}
    </>
  )
}

// ── Tab: Trader Planner ─────────────────────────────────────────────────────

function TraderPlannerTab ({ wishlist, blueprints, materials, materialTraders, currentSystem }) {
  const { tradeGroups, hasShortfalls } = useMemo(() => {
    if (!wishlist.length || !blueprints.length || !materials.length) {
      return { tradeGroups: [], hasShortfalls: false }
    }

    const allRequirements = aggregateMaterialRequirements(wishlist, blueprints, materials)
    const allocated = allocateTradeSuggestions(allRequirements, materials)
    const currentPos = currentSystem?.position ?? null
    const traders = materialTraders?.traders ?? []

    const byType = { Raw: { trades: [] }, Encoded: { trades: [] }, Manufactured: { trades: [] } }

    for (const sfEntry of allocated) {
      if (!sfEntry.trades?.length) continue
      const t = (sfEntry.type ?? '').toLowerCase()
      const key = t === 'raw' ? 'Raw' : t === 'encoded' ? 'Encoded' : t === 'manufactured' ? 'Manufactured' : null
      if (!key) continue
      for (const trade of sfEntry.trades) {
        byType[key].trades.push({
          give: { ...trade.from, amount: trade.give },
          receive: { symbol: sfEntry.symbol, name: sfEntry.name, grade: sfEntry.grade, amount: trade.receive }
        })
      }
    }

    const groups = Object.entries(byType)
      .filter(([, { trades }]) => trades.length > 0)
      .map(([type, { trades }]) => ({
        type,
        trades,
        nearest: currentPos ? findNearestTrader(traders, type, currentPos) : null
      }))

    return { tradeGroups: groups, hasShortfalls: allocated.some(e => e.shortfall > 0) }
  }, [wishlist, blueprints, materials, materialTraders, currentSystem])

  if (!wishlist.length) {
    return <div className='text-muted' style={{ padding: '2rem 0' }}>No wishlist — add blueprints in the Wishlist tab first.</div>
  }
  if (!hasShortfalls) {
    return <div className='text-success' style={{ padding: '2rem 0' }}>All materials satisfied — no trades needed.</div>
  }
  if (!tradeGroups.length) {
    return <div className='text-muted' style={{ padding: '2rem 0' }}>No trade suggestions available — collect materials directly.</div>
  }

  return (
    <>
      <p className='text-primary'>Based on your Engineering Wishlist shortfalls</p>
      {tradeGroups.map(group => {
        const traderPos = group.nearest?.coords
          ? [group.nearest.coords.x, group.nearest.coords.y, group.nearest.coords.z]
          : null
        const dist = currentSystem?.position && traderPos
          ? calculateDistance(currentSystem.position, traderPos).toFixed(1)
          : null

        return (
          <div key={group.type} style={{ marginBottom: '1.5rem', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
              <h4 style={{ margin: 0 }}>{group.type} Materials Trader</h4>
              {group.nearest
                ? <span className='text-primary' style={{ fontSize: '.85rem' }}>
                    Nearest: {group.nearest.name}
                    {dist && <span className='text-muted'> · {dist} Ly</span>}
                  </span>
                : <span className='text-muted' style={{ fontSize: '.85rem' }}>Location data unavailable</span>}
            </div>
            {group.nearest?.station &&
              <div className='text-muted' style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
                Station: {group.nearest.station.name}
                {group.nearest.station.distanceToArrival != null &&
                  <span> · {Math.round(group.nearest.station.distanceToArrival).toLocaleString()} Ls</span>}
              </div>}
            <div className='text-muted' style={{ fontSize: '.8rem', marginBottom: '.4rem' }}>Trades to make:</div>
            {group.trades.map((trade, i) => (
              <div key={`trade_${i}`} className='text-primary' style={{ fontSize: '.9rem', marginBottom: '.2rem' }}>
                Give {trade.give.amount.toLocaleString()}× <strong>{trade.give.name}</strong> (G{trade.give.grade})
                {' → '}
                Receive {trade.receive.amount.toLocaleString()}× <strong>{trade.receive.name}</strong> (G{trade.receive.grade})
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}

// ── Tab: Engineer Route ─────────────────────────────────────────────────────

function EngineerRouteTab ({ wishlist, blueprints, engineers, currentSystem }) {
  const engineerStops = useMemo(() => {
    if (!wishlist.length || !blueprints.length || !engineers.length) return []
    return buildEngineerRoute(wishlist, blueprints, engineers, currentSystem?.position ?? null)
  }, [wishlist, blueprints, engineers, currentSystem])

  if (!wishlist.length) {
    return <div className='text-muted' style={{ padding: '2rem 0' }}>No wishlist — add blueprints in the Wishlist tab first.</div>
  }
  if (!engineerStops.length) {
    return <div className='text-muted' style={{ padding: '2rem 0' }}>No engineers needed for the current wishlist.</div>
  }

  return (
    <>
      <p className='text-primary'>
        {engineerStops.length} engineer{engineerStops.length !== 1 ? 's' : ''} needed for your current wishlist
      </p>
      {engineerStops.map((stop, i) => {
        const statusLower = (stop.unlockStatus ?? '').toLowerCase()
        const isUnlocked = statusLower === 'unlocked'
        const isKnown = ['known', 'invited'].includes(statusLower)
        const dist = currentSystem?.position && stop.system?.position
          ? calculateDistance(currentSystem.position, stop.system.position).toFixed(1)
          : null

        return (
          <div key={`eng_${stop.engineerId}`} style={{ border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '.75rem 1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.3rem', flexWrap: 'wrap', gap: '.5rem' }}>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{i + 1}. {stop.engineerName}</strong>
                <span className='text-muted' style={{ fontSize: '.85rem' }}>{stop.system.name}</span>
                {dist && <span className='text-muted' style={{ fontSize: '.85rem' }}>{dist} Ly</span>}
              </div>
              <span className={isUnlocked ? 'text-success' : isKnown ? 'text-warning' : 'text-danger'} style={{ fontSize: '.85rem' }}>
                {isUnlocked ? '✓ Unlocked' : `⚠ ${stop.unlockStatus ?? 'Locked'}`}
              </span>
            </div>
            {stop.rank > 0 &&
              <div className='text-muted' style={{ fontSize: '.8rem', marginBottom: '.3rem' }}>
                Rank {stop.rank} (+{stop.rankProgress ?? 0}%)
              </div>}
            {(stop.blueprints ?? []).length > 0 &&
              <div style={{ marginTop: '.4rem' }}>
                <span className='text-muted' style={{ fontSize: '.8rem' }}>Blueprints to apply: </span>
                <span style={{ fontSize: '.9rem' }}>
                  {stop.blueprints.map(bp => `${bp.name} G${bp.grade}`).join(', ')}
                </span>
              </div>}
          </div>
        )
      })}
    </>
  )
}

// ── Tab: Collection Guide ───────────────────────────────────────────────────

const GENERIC_SOURCES = {
  raw: 'Mine on planetary surfaces with SRV — metallic and rocky bodies',
  encoded: 'Scan ships, data beacons, signal sources, and nav beacons',
  manufactured: 'Combat bounties, mission rewards, ship salvage at signal sources',
  guardian: 'Guardian Structure ruins — cannot be obtained from material traders',
  thargoid: 'Thargoid sites and ship debris — cannot be obtained from material traders'
}

function GuideEntry ({ symbol, name, type, grade, shortfall, materialSources }) {
  const source = materialSources?.[symbol?.toLowerCase()]
  const genericHint = GENERIC_SOURCES[(type ?? '').toLowerCase()] ?? 'Collect from in-game sources'
  const cannotTrade = source?.cannotTrade ?? ['guardian', 'thargoid'].includes((type ?? '').toLowerCase())

  return (
    <div style={{ padding: '.5rem 0', borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: '.1rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', marginBottom: '.2rem', flexWrap: 'wrap' }}>
        <strong>{name}</strong>
        <span className='text-muted' style={{ fontSize: '.8rem' }}>{type} G{grade}</span>
        {cannotTrade && <span className='text-warning' style={{ fontSize: '.75rem' }}>Cannot Trade</span>}
        {shortfall > 0 &&
          <span className='text-warning' style={{ fontSize: '.85rem', marginLeft: 'auto' }}>
            Need {shortfall.toLocaleString()} more
          </span>}
      </div>
      {source?.sources?.length
        ? <div className='text-muted' style={{ fontSize: '.85rem' }}><i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />{source.sources.join(' · ')}</div>
        : <div className='text-muted' style={{ fontSize: '.85rem' }}><i className='icon daedalus-terminal-location' style={{ marginRight: '.2rem' }} />{genericHint}</div>}
      {source?.hotspots?.length > 0 &&
        <div style={{ marginTop: '.2rem' }}>
          {source.hotspots.slice(0, 2).map((hs, i) => (
            <div key={`hs_${i}`} className='text-primary' style={{ fontSize: '.8rem' }}>
              <i className='icon daedalus-terminal-poi' style={{ marginRight: '.2rem' }} />{hs.system}{hs.instructions ? ` — ${hs.instructions}` : ''}
            </div>
          ))}
        </div>}
    </div>
  )
}

function CollectionGuideTab ({ wishlist, blueprints, materials, materialSources }) {
  const [showAll, setShowAll] = useState(false)

  const shortfalls = useMemo(() => {
    if (!wishlist.length || !blueprints.length || !materials.length) return []
    const allRequirements = aggregateMaterialRequirements(wishlist, blueprints, materials)
    return allRequirements.filter(r => r.shortfall > 0)
  }, [wishlist, blueprints, materials])

  // Group all materials by type for "All" view
  const allByType = useMemo(() => {
    const byType = {}
    for (const mat of (materials ?? [])) {
      const t = mat.type ?? 'unknown'
      if (!byType[t]) byType[t] = []
      byType[t].push(mat)
    }
    for (const arr of Object.values(byType)) {
      arr.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))
    }
    return byType
  }, [materials])

  return (
    <>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          className={`button${!showAll ? ' button--active' : ''}`}
          style={{ fontSize: '.85rem', padding: '.25rem .75rem' }}
          onClick={() => setShowAll(false)}
        >
          Shortfall Only
        </button>
        <button
          className={`button${showAll ? ' button--active' : ''}`}
          style={{ fontSize: '.85rem', padding: '.25rem .75rem' }}
          onClick={() => setShowAll(true)}
        >
          All Materials
        </button>
        {!showAll && shortfalls.length > 0 &&
          <span className='text-muted' style={{ fontSize: '.85rem' }}>
            {shortfalls.length} material{shortfalls.length !== 1 ? 's' : ''} short
          </span>}
      </div>

      {!showAll && shortfalls.length === 0 && wishlist.length > 0 &&
        <div className='text-success'>All wishlist materials are fully stocked.</div>}

      {!showAll && wishlist.length === 0 &&
        <div className='text-muted'>No wishlist — add blueprints in the Wishlist tab to see shortfall materials here.</div>}

      {!showAll && shortfalls.length > 0 &&
        shortfalls.map(entry => (
          <GuideEntry
            key={entry.symbol}
            symbol={entry.symbol}
            name={entry.name}
            type={entry.type}
            grade={entry.grade}
            shortfall={entry.shortfall}
            materialSources={materialSources}
          />
        ))}

      {showAll &&
        Object.entries(allByType).map(([type, mats]) => (
          <div key={type} style={{ marginBottom: '1.5rem' }}>
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ textTransform: 'capitalize' }}>{type} Materials</h4>
            </div>
            {mats.map(mat => (
              <GuideEntry
                key={mat.symbol}
                symbol={mat.symbol}
                name={mat.name}
                type={mat.type}
                grade={mat.grade}
                materialSources={materialSources}
              />
            ))}
          </div>
        ))}
    </>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

const MATERIAL_EVENTS = ['Materials', 'MaterialCollected', 'MaterialDiscarded', 'MaterialTrade', 'EngineerCraft']
const TABS = ['Smart Route', 'Trader Planner', 'Engineer Route', 'Collection Guide']

export default function EngineeringMaterialPlannerPage () {
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [blueprints, setBlueprints] = useState([])
  const [materials, setMaterials] = useState([])
  const [engineers, setEngineers] = useState([])
  const [currentSystem, setCurrentSystem] = useState(null)
  const [materialSources, setMaterialSources] = useState({})
  const [materialTraders, setMaterialTraders] = useState({})
  const [wishlist, setWishlist] = useState([])

  useEffect(animateTableEffect)

  useEffect(() => {
    ;(async () => {
      if (!connected) return

      const [newBlueprints, newMaterials, newEngineers, newSystem, newSources, newTraders] = await Promise.all([
        sendEvent('getBlueprints'),
        sendEvent('getMaterials'),
        sendEvent('getEngineers'),
        sendEvent('getSystem'),
        sendEvent('getMaterialSources'),
        sendEvent('getMaterialTraders')
      ])

      setBlueprints(newBlueprints ?? [])
      setMaterials(newMaterials ?? [])
      setEngineers(newEngineers ?? [])
      if (newSystem?.position) setCurrentSystem(newSystem)
      setMaterialSources(newSources ?? {})
      setMaterialTraders(newTraders ?? {})

      const shipId = getActiveShipId()
      setWishlist(shipId ? getWishlist(shipId) : [])

      setComponentReady(true)
    })()
  }, [connected, ready])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (MATERIAL_EVENTS.includes(log.event)) {
      setMaterials((await sendEvent('getMaterials')) ?? [])
    }
    if (['Location', 'FSDJump'].includes(log.event)) {
      const newSystem = await sendEvent('getSystem')
      if (newSystem?.position) setCurrentSystem(newSystem)
    }
    if (log.event === 'EngineerProgress') {
      setEngineers((await sendEvent('getEngineers')) ?? [])
    }
    if (log.event === 'Loadout') {
      const shipId = getActiveShipId()
      setWishlist(shipId ? getWishlist(shipId) : [])
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async () => {
    const [newMaterials, newEngineers] = await Promise.all([sendEvent('getMaterials'), sendEvent('getEngineers')])
    setMaterials(newMaterials ?? [])
    setEngineers(newEngineers ?? [])
  }), [])

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Material Planner')}>
        <h2>Material Collection Planner</h2>
        <h3 className='text-primary'>Plan and optimise your engineering route</h3>

        {/* Sub-tab nav */}
        <div style={{ display: 'flex', gap: '.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className={`button${activeTab === i ? ' button--active' : ''}`}
              style={{ fontSize: '.85rem', padding: '.3rem .9rem' }}
              onClick={() => setActiveTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>

        {currentSystem?.name &&
          <div className='text-muted' style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
            Current system: <span className='text-primary'>{currentSystem.name}</span>
          </div>}

        {activeTab === 0 &&
          <SmartRouteTab
            wishlist={wishlist}
            blueprints={blueprints}
            materials={materials}
            engineers={engineers}
            materialSources={materialSources}
            materialTraders={materialTraders}
            currentSystem={currentSystem}
          />}

        {activeTab === 1 &&
          <TraderPlannerTab
            wishlist={wishlist}
            blueprints={blueprints}
            materials={materials}
            materialTraders={materialTraders}
            currentSystem={currentSystem}
          />}

        {activeTab === 2 &&
          <EngineerRouteTab
            wishlist={wishlist}
            blueprints={blueprints}
            engineers={engineers}
            currentSystem={currentSystem}
          />}

        {activeTab === 3 &&
          <CollectionGuideTab
            wishlist={wishlist}
            blueprints={blueprints}
            materials={materials}
            materialSources={materialSources}
          />}
      </Panel>
    </Layout>
  )
}
