import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import animateTableEffect from 'lib/animate-table-effect'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { EngineeringPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { getActiveShipId, setActiveShipId, setWishlist, getWishlist } from 'lib/wishlist'
import { aggregateMaterialRequirements, allocateTradeSuggestions, computeItemShortfall } from 'lib/engineering-calc'
import ModuleEngineeringCard from 'components/panels/eng/module-engineering-card'
import WishlistItem from 'components/panels/eng/wishlist-item'
import MaterialRequirement from 'components/panels/eng/material-requirement'
import BlueprintPicker from 'components/panels/eng/blueprint-picker'

// ---------------------------------------------------------------------------
// Module-goal persistence
// ---------------------------------------------------------------------------

const MODULE_GOALS_PREFIX = 'daedalus_module_goals_'
const MATERIAL_EVENTS = ['Materials', 'MaterialCollected', 'MaterialDiscarded', 'MaterialTrade', 'EngineerCraft']

function loadModuleGoals (shipId) {
  if (!shipId) return {}
  try {
    const raw = window.localStorage.getItem(`${MODULE_GOALS_PREFIX}${shipId}`)
    return raw ? JSON.parse(raw) : {}
  } catch (_) { return {} }
}

function saveModuleGoals (shipId, goals) {
  if (!shipId) return
  try {
    window.localStorage.setItem(`${MODULE_GOALS_PREFIX}${shipId}`, JSON.stringify(goals))
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Blueprint → module matching
// ---------------------------------------------------------------------------

/**
 * Return blueprints from `allBlueprints` applicable to the given ship module.
 *
 * Match if any entry in blueprint.modules is:
 *   (a) a whole-token match within module.name  — e.g. "Thrusters" matches "3A Thrusters"
 *       Uses word-boundary regex so "Weapon" does NOT match "Weapon Colouring"
 *       or the fallback FD symbol "hpt weaponscustomization ..."
 *   (b) a case-insensitive exact match of module.slot — e.g. "Armour" === "Armour"
 *       (handles cases like armour where moduleName is "Lightweight Alloys")
 */
function tokenMatch (haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('(?:^|\\s)' + escaped + '(?:\\s|$)').test(haystack)
}

function getApplicableBlueprints (module, allBlueprints) {
  const nameLower = (module.name ?? '').toLowerCase()
  const slotLower = (module.slot ?? '').toLowerCase()
  return allBlueprints.filter(bp =>
    (bp.modules ?? []).some(m => {
      const mLower = m.toLowerCase()
      return tokenMatch(nameLower, mLower) || mLower === slotLower
    })
  )
}

// ---------------------------------------------------------------------------
// Wishlist item generation from module goals
// ---------------------------------------------------------------------------

/**
 * Derive deterministic wishlist items from the module-goals map.
 * Items carry a stable `id` and `moduleSlot` to distinguish them from
 * manually-added items.
 */
function computeItemsFromGoals (goals, shipModules, blueprints) {
  const items = []
  for (const [slot, goal] of Object.entries(goals)) {
    if (!goal?.blueprintSymbol || !goal?.targetGrade) continue
    const module = Object.values(shipModules ?? {}).find(m => m.slot === slot)
    if (!module) continue
    const bp = blueprints.find(b => b.symbol === goal.blueprintSymbol)
    if (!bp) continue

    const currentEng = module.engineering
    let startGrade = 1
    if (currentEng && currentEng.symbol === goal.blueprintSymbol) {
      startGrade = Math.max(1, (currentEng.level ?? 0) + 1)
    }

    for (let g = startGrade; g <= goal.targetGrade; g++) {
      items.push({
        id: `slot_${slot}_${goal.blueprintSymbol}_g${g}`,
        type: 'engineering',
        moduleSlot: slot,
        blueprintSymbol: bp.symbol,
        blueprintName: bp.name,
        grade: g,
        quantity: 1
      })
    }
  }
  return items
}

// ---------------------------------------------------------------------------
// Module grouping
// ---------------------------------------------------------------------------

const CORE_SLOTS = new Set([
  'PowerPlant', 'MainEngines', 'FrameShiftDrive',
  'LifeSupport', 'PowerDistributor', 'Radar', 'FuelTank', 'Armour'
])

const CORE_ORDER = [
  'PowerPlant', 'MainEngines', 'FrameShiftDrive',
  'LifeSupport', 'PowerDistributor', 'Radar', 'Armour', 'FuelTank'
]

function groupEngineerableModules (modules, allBlueprints) {
  const core = []
  const hardpoints = []
  const optional = []

  for (const module of Object.values(modules ?? {})) {
    const applicable = getApplicableBlueprints(module, allBlueprints)
    if (applicable.length === 0) continue
    const entry = { module, applicable }
    if (CORE_SLOTS.has(module.slot)) core.push(entry)
    else if (module.hardpoint && !module.utility) hardpoints.push(entry)
    else if (!module.utility) optional.push(entry)
    // skip tiny-hardpoint utility modules — rarely blueprintable
  }

  core.sort((a, b) => {
    const ai = CORE_ORDER.indexOf(a.module.slot)
    const bi = CORE_ORDER.indexOf(b.module.slot)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })

  return { core, hardpoints, optional }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader ({ label, count }) {
  return (
    <div className='section-heading' style={{ marginTop: '1.25rem', marginBottom: '.5rem' }}>
      <h4 className='section-heading__text'>
        {label}
        <span className='text-muted' style={{ fontWeight: 'normal', fontSize: '.9rem', marginLeft: '.5rem' }}>
          ({count})
        </span>
      </h4>
    </div>
  )
}

function ModuleGroup ({ entries, goals, blueprints, onGoalChange }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
      gap: '.75rem'
    }}>
      {entries.map(({ module, applicable }) => (
        <ModuleEngineeringCard
          key={module.slot}
          module={module}
          blueprints={applicable}
          goal={goals[module.slot] ?? null}
          onChange={(newGoal) => onGoalChange(module.slot, newGoal)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EngineeringWishlistPage () {
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [blueprints, setBlueprints] = useState([])
  const [materials, setMaterials] = useState([])
  const [shipId, setShipId] = useState(null)
  const [shipStatus, setShipStatus] = useState(null)
  const [moduleGoals, setModuleGoals] = useState({})
  const [manualItems, setManualItems] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [shortfallOnly, setShortfallOnly] = useState(false)

  useEffect(animateTableEffect)

  const hasLoaded = useRef(false)

  // ── Initial data load ─────────────────────────────────────────────────────
  // Run only once on first connect to avoid resetting state when the user
  // tabs away (which can briefly cycle `connected` or `ready`).
  useEffect(() => {
    if (hasLoaded.current) return
    ;(async () => {
      if (!connected) return
      hasLoaded.current = true
      const [newBlueprints, newMaterials, newShipStatus] = await Promise.all([
        sendEvent('getBlueprints'),
        sendEvent('getMaterials'),
        sendEvent('getShipStatus')
      ])
      setBlueprints(newBlueprints ?? [])
      setMaterials(newMaterials ?? [])
      setShipStatus(newShipStatus ?? null)

      // Prefer the persisted active ship ID; fall back to what getShipStatus returned
      const activeId = getActiveShipId() ?? newShipStatus?.shipId
      if (activeId) {
        if (!getActiveShipId() && newShipStatus?.shipId) setActiveShipId(activeId)
        setShipId(activeId)
        setModuleGoals(loadModuleGoals(activeId))
        // Only restore manually-added items (no moduleSlot)
        setManualItems(getWishlist(activeId).filter(i => !i.moduleSlot))
      }

      setComponentReady(true)
    })()
  }, [connected, ready])

  // ── Journal event listeners ───────────────────────────────────────────────
  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (MATERIAL_EVENTS.includes(log.event)) {
      setMaterials(await sendEvent('getMaterials'))
    }
    if (log.event === 'Loadout' && log.ShipID != null) {
      const id = String(log.ShipID)
      setActiveShipId(id)
      setShipId(id)
      const newShip = await sendEvent('getShipStatus')
      setShipStatus(newShip ?? null)
      setModuleGoals(loadModuleGoals(id))
      setManualItems(getWishlist(id).filter(i => !i.moduleSlot))
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async (event) => {
    if (event?._changedFile === 'Status') return
    const [newMat, newShip] = await Promise.all([
      sendEvent('getMaterials'),
      sendEvent('getShipStatus')
    ])
    setMaterials(newMat ?? [])
    if (newShip) setShipStatus(newShip)
  }), [])

  // ── Derived: goal-managed wishlist items ──────────────────────────────────
  const goalItems = useMemo(
    () => computeItemsFromGoals(moduleGoals, shipStatus?.modules, blueprints),
    [moduleGoals, shipStatus, blueprints]
  )

  const wishlist = useMemo(() => [...goalItems, ...manualItems], [goalItems, manualItems])

  // Persist full wishlist whenever it changes
  useEffect(() => {
    if (!shipId) return
    setWishlist(shipId, wishlist)
  }, [shipId, wishlist])

  // ── Module grouping ───────────────────────────────────────────────────────
  const { core, hardpoints, optional } = useMemo(
    () => groupEngineerableModules(shipStatus?.modules, blueprints),
    [shipStatus, blueprints]
  )

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleGoalChange = useCallback((slot, newGoal) => {
    setModuleGoals(prev => {
      const next = { ...prev }
      if (newGoal) next[slot] = newGoal
      else delete next[slot]
      if (shipId) saveModuleGoals(shipId, next)
      return next
    })
  }, [shipId])

  const handleManualAdd = useCallback((item) => {
    const newItem = { ...item, id: crypto.randomUUID() }
    setManualItems(prev => [...prev, newItem])
    setShowPicker(false)
  }, [])

  const handleManualRemove = useCallback((id) => {
    setManualItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const handleManualUpdate = useCallback((id, changes) => {
    setManualItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i))
  }, [])

  // ── Material requirements ─────────────────────────────────────────────────
  const allRequirements = aggregateMaterialRequirements(wishlist, blueprints, materials)
  const withTrades = allocateTradeSuggestions(allRequirements, materials)
  const shortfallMap = Object.fromEntries(allRequirements.map(r => [r.symbol, r]))
  const perItemShortfall = Object.fromEntries(
    manualItems.map(item => [item.id, computeItemShortfall(item, blueprints, materials)])
  )
  const displayRequirements = shortfallOnly
    ? withTrades
    : allRequirements.map(r => withTrades.find(t => t.symbol === r.symbol) ?? r)

  const hasShip = !!(shipStatus?.modules && Object.keys(shipStatus.modules).length > 0)
  const hasModules = core.length + hardpoints.length + optional.length > 0

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Wishlist')}>
        <h2>Engineering Wishlist</h2>
        <h3 className='text-primary'>
          {hasShip
            ? (shipStatus?.name && shipStatus.name !== 'Unknown'
                ? `${shipStatus.name}  ·  ${shipStatus.type}`
                : `Ship ${shipId}  ·  ${shipStatus?.type ?? ''}`)
            : shipId
              ? 'Waiting for ship data…'
              : 'No active ship — board a ship to activate your wishlist'}
        </h3>

        {/* ── Ship module cards ── */}
        {hasShip && hasModules && (
          <>
            {core.length > 0 && (
              <>
                <SectionHeader label='Core Systems' count={core.length} />
                <ModuleGroup entries={core} goals={moduleGoals} blueprints={blueprints} onGoalChange={handleGoalChange} />
              </>
            )}
            {hardpoints.length > 0 && (
              <>
                <SectionHeader label='Hardpoints' count={hardpoints.length} />
                <ModuleGroup entries={hardpoints} goals={moduleGoals} blueprints={blueprints} onGoalChange={handleGoalChange} />
              </>
            )}
            {optional.length > 0 && (
              <>
                <SectionHeader label='Optional Internals' count={optional.length} />
                <ModuleGroup entries={optional} goals={moduleGoals} blueprints={blueprints} onGoalChange={handleGoalChange} />
              </>
            )}
          </>
        )}

        {!hasShip && componentReady && (
          <p className='text-muted' style={{ marginTop: '1rem' }}>
            Waiting for ship data. Board your ship in game to see module engineering options.
          </p>
        )}

        {/* ── Manual additions ── */}
        <div className='section-heading' style={{ marginTop: '1.5rem' }}>
          <h4 className='section-heading__text'>Manual Additions</h4>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <button
            className='button button--primary'
            onClick={() => setShowPicker(v => !v)}
            disabled={!shipId}
          >
            <i className='icon daedalus-terminal-wrench' style={{ marginRight: '.5rem' }} />
            {showPicker ? 'Cancel' : '+ Add Blueprint'}
          </button>
        </div>

        {showPicker && <BlueprintPicker blueprints={blueprints} onAdd={handleManualAdd} />}

        {manualItems.length > 0 && (
          <table className='table--animated fx-fade-in' style={{ marginBottom: '1rem' }}>
            <thead style={{ display: 'none' }}>
              <tr><th>Blueprint</th><th>Grade</th><th>Qty</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {manualItems.map(item => (
                <WishlistItem
                  key={item.id}
                  item={item}
                  shortfall={perItemShortfall[item.id] ?? 0}
                  onRemove={handleManualRemove}
                  onUpdate={handleManualUpdate}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* ── Material Requirements ── */}
        {allRequirements.length > 0
          ? (
            <>
              <div className='section-heading' style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
                <h4 className='section-heading__text' style={{ flex: 1 }}>Material Requirements</h4>
                <label style={{ fontSize: '1rem', fontWeight: 'normal', cursor: 'pointer', marginRight: '1rem' }}>
                  <input
                    type='checkbox'
                    checked={shortfallOnly}
                    onChange={e => setShortfallOnly(e.target.checked)}
                    style={{ marginRight: '.4rem' }}
                  />
                  Shortfall only
                </label>
              </div>
              <table className='table--animated fx-fade-in'>
                <thead style={{ display: 'none' }}>
                  <tr><th>Material</th><th>Progress</th><th>Type</th></tr>
                </thead>
                <tbody>
                  {displayRequirements.map(req => (
                    <MaterialRequirement
                      key={`req_${req.symbol}`}
                      requirement={req}
                      shortfallMap={shortfallMap}
                      materials={materials}
                    />
                  ))}
                </tbody>
              </table>
            </>
            )
          : hasShip && (
            <p className='text-muted' style={{ marginTop: '1.5rem' }}>
              Select a target modification on any module above to generate material requirements.
            </p>
            )}
      </Panel>
    </Layout>
  )
}
