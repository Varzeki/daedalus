/**
 * Engineering calculation utilities.
 *
 * - aggregateMaterialRequirements  — total materials needed across a wishlist
 * - calculateTradeSuggestions      — greedy multi-source trade algorithm
 * - getTradeRatio                  — offer/receive ratio for a single trade
 * - getTradeType                   — classify the trade direction/kind
 *
 * Ported from EDOMH HorizonsTradeSuggestion.calculateTradeFactor() with the
 * key difference that calculateTradeSuggestions() uses a greedy algorithm
 * that can combine multiple partial source materials to cover a single
 * shortfall (EDOMH only allows a single source material per suggestion).
 */

// ---------------------------------------------------------------------------
// Trade constants
// ---------------------------------------------------------------------------

export const TradeType = Object.freeze({
  DOWNTRADE: 'DOWNTRADE',       // same category, higher grade → lower grade (best deal: 1 : 3^n)
  UPTRADE: 'UPTRADE',           // same category, lower grade  → higher grade (worst deal: 6^n : 1)
  CROSS_DOWNTRADE: 'CROSS_DOWNTRADE',  // cross-category, higher or same grade → lower grade
  CROSS_UPTRADE: 'CROSS_UPTRADE',      // cross-category, lower grade → higher grade
  IMPOSSIBLE: 'IMPOSSIBLE'             // different broad type (Raw/Encoded/Manufactured)
})

// Preference order for trade sorting — lower is better
// CROSS_UPTRADE is worst (6^(n+1):1, e.g. 36:1 for n=1) vs plain UPTRADE (6^n:1, e.g. 6:1 for n=1)
const TRADE_PREFERENCE = {
  [TradeType.DOWNTRADE]: 1,
  [TradeType.CROSS_DOWNTRADE]: 2,
  [TradeType.UPTRADE]: 3,
  [TradeType.CROSS_UPTRADE]: 4
}

// ---------------------------------------------------------------------------
// Trade ratio helpers
// ---------------------------------------------------------------------------

/**
 * Classify the trade kind from `from` material to `to` material.
 *
 * The material's `type` field  (e.g. 'Raw' / 'Encoded' / 'Manufactured')
 * is the broad class; `category` is the sub-category element group.
 *
 * @param {{ type: string, category: string, grade: number }} from
 * @param {{ type: string, category: string, grade: number }} to
 * @returns {string} A TradeType value
 */
export function getTradeType (from, to) {
  // Normalise for case-insensitive comparison
  const fromType = (from.type ?? '').toLowerCase()
  const toType = (to.type ?? '').toLowerCase()
  if (fromType !== toType) return TradeType.IMPOSSIBLE

  const sameCategory = (from.category ?? '') === (to.category ?? '')
  const gradeDiff = from.grade - to.grade  // positive = downgrading (from is higher)

  if (sameCategory) {
    return gradeDiff >= 0 ? TradeType.DOWNTRADE : TradeType.UPTRADE
  } else {
    return gradeDiff >= 0 ? TradeType.CROSS_DOWNTRADE : TradeType.CROSS_UPTRADE
  }
}

/**
 * Calculate the trade ratio (offer, receive) when trading `from` for `to`.
 *
 * Returns `{ offer: number, receive: number }` — i.e. you give `offer` units
 * of `from` and receive `receive` units of `to`.
 *
 * Returns `null` if the trade is IMPOSSIBLE (different broad type).
 *
 * @param {{ type: string, category: string, grade: number }} from
 * @param {{ type: string, category: string, grade: number }} to
 * @returns {{ offer: number, receive: number }|null}
 */
export function getTradeRatio (from, to) {
  const tradeType = getTradeType(from, to)
  if (tradeType === TradeType.IMPOSSIBLE) return null

  const n = Math.abs(from.grade - to.grade)
  const gradeDiff = from.grade - to.grade  // positive = downgrading

  if (tradeType === TradeType.DOWNTRADE) {
    if (n === 0) return { offer: 1, receive: 1 }
    return { offer: 1, receive: Math.pow(3, n) }
  }

  if (tradeType === TradeType.UPTRADE) {
    return { offer: Math.pow(6, n), receive: 1 }
  }

  if (tradeType === TradeType.CROSS_DOWNTRADE) {
    if (n === 0) return { offer: 6, receive: 1 }
    return { offer: 2, receive: Math.pow(3, n - 1) }
  }

  // CROSS_UPTRADE
  // gradeDiff is negative here so n = |diff|
  return { offer: Math.pow(6, n + 1), receive: 1 }
}

// ---------------------------------------------------------------------------
// Aggregate material requirements
// ---------------------------------------------------------------------------

/**
 * Aggregate total material requirements across all wishlist items.
 *
 * @param {Array}  wishlist       — wishlist items (type 'engineering' only for now)
 * @param {Array}  blueprints     — result of getBlueprints() service call
 * @param {Array}  materials      — result of getMaterials() service call
 * @returns {Array} Per-material objects: { symbol, name, type, category, grade,
 *                  required, owned, shortfall, maxCount }
 */
export function aggregateMaterialRequirements (wishlist, blueprints, materials) {
  // Build a required-count map from all wishlist items
  const requiredMap = {}  // symbol → count

  for (const item of wishlist) {
    if (item.type !== 'engineering') continue

    const blueprint = blueprints.find(
      b => b.symbol.toLowerCase() === item.blueprintSymbol.toLowerCase()
    )
    if (!blueprint) continue

    const gradeEntry = blueprint.grades.find(g => g.grade === item.grade)
    if (!gradeEntry) continue

    const qty = item.quantity ?? 1
    for (const component of gradeEntry.components) {
      const sym = component.symbol ?? component.name.toLowerCase().replace(/\s+/g, '')
      requiredMap[sym] = (requiredMap[sym] ?? 0) + component.cost * qty
    }
  }

  // Build the full result list — only include materials that are required
  const result = []
  for (const [symbol, required] of Object.entries(requiredMap)) {
    const material = materials.find(
      m => m.symbol.toLowerCase() === symbol.toLowerCase()
    )
    if (!material) continue

    const owned = material.count ?? 0
    result.push({
      symbol: material.symbol,
      name: material.name,
      type: material.type,
      category: material.category,
      grade: material.grade,
      maxCount: material.maxCount,
      required,
      owned,
      shortfall: Math.max(0, required - owned)
    })
  }

  // Sort: shortfall first, then by grade descending (hardest to get first)
  result.sort((a, b) => {
    if (b.shortfall !== a.shortfall) return b.shortfall - a.shortfall
    return b.grade - a.grade
  })

  return result
}

// ---------------------------------------------------------------------------
// Trade suggestion calculation
// ---------------------------------------------------------------------------

/**
 * Greedy algorithm that attempts to cover a material shortfall by combining
 * multiple source materials (unlike EDOMH which only uses a single source).
 *
 * @param {{ symbol: string, type: string, category: string, grade: number }} targetMaterial
 * @param {number}  shortfall   — units of targetMaterial still needed
 * @param {Array}   allMaterials — full getMaterials() result
 * @param {Object}  shortfallMap — map of symbol → { required } from aggregateMaterialRequirements()
 *                                 used to protect reserved materials from being traded away
 * @returns {{ trades: Array, fullyResolved: boolean, stillNeeded: number }}
 */
export function calculateTradeSuggestions (targetMaterial, shortfall, allMaterials, shortfallMap) {
  const contributors = []

  for (const material of allMaterials) {
    if (material.symbol === targetMaterial.symbol) continue

    // Guardian / Thargoid / Xeno materials cannot be traded
    const typeLower = (material.type ?? '').toLowerCase()
    if (typeLower === 'xeno' || typeLower === 'guardian' || typeLower === 'thargoid') continue

    const ratio = getTradeRatio(material, targetMaterial)
    if (!ratio) continue  // IMPOSSIBLE

    // Only use surplus units — don't trade away what's reserved by other blueprint needs
    const reserved = shortfallMap[material.symbol]?.required ?? 0
    const surplus = Math.max(0, material.count - reserved)
    if (surplus === 0) continue

    const fullBatches = Math.floor(surplus / ratio.offer)
    const maxReceivable = fullBatches * ratio.receive
    if (maxReceivable === 0) continue

    const tradeType = getTradeType(material, targetMaterial)

    contributors.push({
      material,
      surplus,
      ratio,
      maxReceivable,
      tradeType
    })
  }

  // Sort by preference (best trade type first), then by most yield within same type
  contributors.sort((a, b) => {
    const prefDiff = (TRADE_PREFERENCE[a.tradeType] ?? 99) - (TRADE_PREFERENCE[b.tradeType] ?? 99)
    if (prefDiff !== 0) return prefDiff
    return b.maxReceivable - a.maxReceivable
  })

  // Greedy fill
  let remaining = shortfall
  const trades = []

  for (const contributor of contributors) {
    if (remaining <= 0) break

    const wantToReceive = Math.min(remaining, contributor.maxReceivable)
    let batchCount = Math.ceil(wantToReceive / contributor.ratio.receive)
    // Cap at what the surplus actually allows
    batchCount = Math.min(batchCount, Math.floor(contributor.surplus / contributor.ratio.offer))

    const give = batchCount * contributor.ratio.offer
    const receive = batchCount * contributor.ratio.receive
    if (give === 0 || receive === 0) continue

    trades.push({
      from: contributor.material,
      give,
      receive,
      tradeType: contributor.tradeType
    })
    remaining -= receive
  }

  return {
    trades,
    fullyResolved: remaining <= 0,
    stillNeeded: Math.max(0, remaining)
  }
}

// ---------------------------------------------------------------------------
// Global surplus allocation (for Smart Route)
// ---------------------------------------------------------------------------

/**
 * Run trade suggestions for multiple shortfalls while correctly allocating
 * the shared surplus pool — so the same surplus material isn't promised to
 * two different target materials.
 *
 * Processes targets in priority order: highest grade first (most expensive
 * to collect).
 *
 * @param {Array}  allRequirements — full result of aggregateMaterialRequirements() including
 *                                   entries with shortfall === 0 (needed for protected-quantity tracking)
 * @param {Array}  allMaterials    — full getMaterials() result
 * @returns {Array} Only entries from allRequirements where shortfall > 0, each augmented with
 *                  { trades, fullyResolved, stillNeeded }.
 */
export function allocateTradeSuggestions (allRequirements, allMaterials) {
  // Work with a mutable copy of inventory counts
  const mutableInventory = allMaterials.map(m => ({ ...m }))

  // Build shortfallMap from ALL required materials — including those we already have enough of.
  // This prevents their inventory from being offered as trade surplus for other targets.
  const shortfallMap = {}
  for (const r of allRequirements) {
    shortfallMap[r.symbol] = { required: r.required }
  }

  // Only generate trade suggestions for materials we're actually short on
  const shortfalls = allRequirements.filter(r => r.shortfall > 0)

  // Sort by grade descending (highest grade first = hardest to collect gets first pick of surplus)
  const prioritised = [...shortfalls].sort((a, b) => b.grade - a.grade)

  const results = {}

  for (const shortfallEntry of prioritised) {
    const target = mutableInventory.find(
      m => m.symbol.toLowerCase() === shortfallEntry.symbol.toLowerCase()
    )
    if (!target) continue

    const suggestion = calculateTradeSuggestions(
      shortfallEntry,
      shortfallEntry.shortfall,
      mutableInventory,
      shortfallMap
    )

    // Subtract the allocated 'give' quantities from the mutable inventory pool
    for (const trade of suggestion.trades) {
      const src = mutableInventory.find(m => m.symbol === trade.from.symbol)
      if (src) src.count = Math.max(0, src.count - trade.give)
    }

    results[shortfallEntry.symbol] = {
      ...shortfallEntry,
      ...suggestion
    }
  }

  // Return in the original order with suggestions attached (shortfall-only entries)
  return shortfalls.map(s => results[s.symbol] ?? s)
}

// ---------------------------------------------------------------------------
// Per-item shortfall (for WishlistItem status badges)
// ---------------------------------------------------------------------------

/**
 * Count how many distinct materials are short for a single wishlist item.
 * Returns the count of materials where owned < required*quantity, not the
 * total unit deficit (which scales arbitrarily with grade and quantity).
 *
 * @param {object} item       — wishlist item
 * @param {Array}  blueprints — result of getBlueprints()
 * @param {Array}  materials  — result of getMaterials()
 * @returns {number} Count of materials with a shortfall for this item
 */
export function computeItemShortfall (item, blueprints, materials) {
  if (item.type !== 'engineering') return 0
  const blueprint = blueprints.find(
    b => b.symbol.toLowerCase() === (item.blueprintSymbol ?? '').toLowerCase()
  )
  if (!blueprint) return 0
  const gradeEntry = blueprint.grades.find(g => g.grade === item.grade)
  if (!gradeEntry) return 0

  const qty = item.quantity ?? 1
  let shortCount = 0
  for (const component of gradeEntry.components) {
    const sym = component.symbol ?? component.name?.toLowerCase().replace(/\s+/g, '')
    const material = sym
      ? materials.find(m => m.symbol?.toLowerCase() === sym.toLowerCase())
      : null
    const have = material?.count ?? 0
    const need = component.cost * qty
    if (have < need) shortCount++
  }
  return shortCount
}

// ---------------------------------------------------------------------------
// Route planning utilities (Phase 4 — Smart Route)
// ---------------------------------------------------------------------------

/**
 * 3D Euclidean distance between two [x,y,z] positions (Ly).
 */
export function calculateDistance (posA, posB) {
  if (!posA || !posB) return Infinity
  try {
    const dx = posA[0] - posB[0]
    const dy = posA[1] - posB[1]
    const dz = posA[2] - posB[2]
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  } catch (_) {
    return Infinity
  }
}

/**
 * Find the nearest material trader of the given type to the current position.
 *
 * @param {Array}  traders        — material-traders.json `traders` array
 * @param {string} type           — "Raw" | "Encoded" | "Manufactured"
 * @param {Array}  currentPos     — [x, y, z]
 * @returns {{ name, coords, station, distance }|null}
 */
export function findNearestTrader (traders, type, currentPos) {
  if (!traders?.length || !currentPos) return null

  let best = null
  let bestDist = Infinity

  for (const trader of traders) {
    if ((trader.station?.type ?? '').toLowerCase() !== type.toLowerCase()) continue
    const pos = trader.coords ? [trader.coords.x, trader.coords.y, trader.coords.z] : null
    const dist = calculateDistance(pos, currentPos)
    if (dist < bestDist) {
      bestDist = dist
      best = { ...trader, distance: parseFloat(dist.toFixed(1)) }
    }
  }
  return best
}

/**
 * Nearest-neighbour TSP heuristic.
 *
 * Takes an array of stops (each with a `position` field) and returns them
 * in the order produced by the nearest-neighbour heuristic starting from
 * `startPosition`. Stops without a position are appended at the end in
 * original order.
 *
 * @param {Array} stops          — array of RouteStop objects
 * @param {Array} startPosition  — [x, y, z] of starting point
 * @returns {Array} reordered stops
 */
export function nearestNeighbourSort (stops, startPosition) {
  const located = stops.filter(s => s.system?.position)
  const unlocated = stops.filter(s => !s.system?.position)

  const result = []
  const remaining = [...located]
  let current = startPosition

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const dist = calculateDistance(current, remaining[i].system.position)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    result.push({ ...next, distanceFromPrev: parseFloat(bestDist.toFixed(1)) })
    current = next.system.position
  }

  return [...result, ...unlocated]
}

/**
 * 2-opt TSP improvement pass.
 *
 * Runs a single pass of 2-opt swaps over the sorted stops array and returns
 * the improved order if any swap reduces total distance. Skips stops that
 * have `mustPrecede` constraints (unlock steps that must come before a
 * specific other stop).
 *
 * @param {Array} stops         — ordered RouteStop array (each with system.position)
 * @param {Array} startPosition — [x, y, z] starting point
 * @returns {Array} stops with improved order and updated distanceFromPrev values
 */
export function twoOptImprove (stops, startPosition) {
  // Only work with the stops that have a position (skip activity stops etc.)
  if (stops.length < 4) return stops

  // Build a flat list of candidate stops with positions
  const withPos = stops.map((s, i) => ({ ...s, _origIdx: i, _hasPos: Boolean(s.system?.position) }))

  let improved = true
  let route = [...withPos]

  while (improved) {
    improved = false
    // Standard 2-opt: check whether reversing segment [i..j] reduces total distance.
    // Removes edges (i-1→i) and (j→j+1); reconnects as (i-1→j) and (i→j+1).
    outerLoop:
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        if (!route[i]._hasPos || !route[j]._hasPos) continue
        // Skip if constrained by mustPrecede
        if (route[i].mustPrecede || route[j].mustPrecede) continue

        const posIPrev = route[i - 1].system?.position
        const posI = route[i].system.position
        const posJ = route[j].system.position
        const posJNext = j + 1 < route.length ? route[j + 1].system?.position : null

        if (!posIPrev || !posI || !posJ) continue

        // Compare cost of edges being removed vs edges being added after reversal
        const before = calculateDistance(posIPrev, posI) +
                       (posJNext ? calculateDistance(posJ, posJNext) : 0)
        const after = calculateDistance(posIPrev, posJ) +
                      (posJNext ? calculateDistance(posI, posJNext) : 0)

        if (after < before - 0.1) {
          // Reverse the segment [i..j] and restart the pass from the beginning
          const segment = route.slice(i, j + 1).reverse()
          route = [...route.slice(0, i), ...segment, ...route.slice(j + 1)]
          improved = true
          break outerLoop
        }
      }
    }
  }

  // Recompute distanceFromPrev
  return route.map((stop, idx) => {
    if (idx === 0) return { ...stop, distanceFromPrev: parseFloat(calculateDistance(startPosition, stop.system?.position ?? null).toFixed(1)) }
    const prev = route[idx - 1]
    return { ...stop, distanceFromPrev: parseFloat(calculateDistance(prev.system?.position, stop.system?.position).toFixed(1)) }
  })
}

/**
 * Group shortfall materials into collection stops by their best source system.
 * Materials without a known source entry, or whose method is not enabled, are
 * grouped into a single "unknown source" stop.
 *
 * @param {Array}  shortfalls     — materials with shortfall > 0 (from allocateTradeSuggestions)
 * @param {Object} sources        — flat getMaterialSources() result keyed by symbol
 * @param {Set}    enabledMethods — set of enabled collection method keys
 * @returns {Array} collection RouteStop objects
 */
export function groupCollectionsBySystem (shortfalls, sources, enabledMethods) {
  const systemMap = new Map()  // system name → stop

  for (const sfEntry of shortfalls) {
    const stillNeeded = sfEntry.stillNeeded ?? sfEntry.shortfall
    if (stillNeeded <= 0) continue

    const source = sources?.[sfEntry.symbol.toLowerCase()]
    const enabledHotspot = source?.hotspots?.length > 0 &&
      source.methods?.some(m => enabledMethods.has(m))
      ? source.hotspots[0]
      : null

    if (enabledHotspot) {
      const key = enabledHotspot.system
      if (!systemMap.has(key)) {
        systemMap.set(key, {
          type: 'collection',
          system: { name: enabledHotspot.system, position: enabledHotspot.position },
          materials: []
        })
      }
      systemMap.get(key).materials.push({
        symbol: sfEntry.symbol,
        name: sfEntry.name,
        type: sfEntry.type,
        grade: sfEntry.grade,
        amountToCollect: stillNeeded,
        method: source.methods?.[0] ?? 'unknown',
        instructions: enabledHotspot.instructions ?? ''
      })
    } else {
      // No enabled source — add to the "unknown" bucket for this material
      const genericKey = `__unknown__${(sfEntry.type ?? '').toLowerCase()}`
      if (!systemMap.has(genericKey)) {
        systemMap.set(genericKey, {
          type: 'collection',
          system: { name: 'Unknown Location', position: null },
          materials: [],
          noSource: true
        })
      }
      systemMap.get(genericKey).materials.push({
        symbol: sfEntry.symbol,
        name: sfEntry.name,
        type: sfEntry.type,
        grade: sfEntry.grade,
        amountToCollect: stillNeeded,
        method: 'unknown',
        instructions: source?.sources?.[0] ?? genericCollectionHint(sfEntry.type)
      })
    }
  }

  return Array.from(systemMap.values())
}

function genericCollectionHint (type) {
  const t = (type ?? '').toLowerCase()
  if (t === 'raw') return 'Mine on planetary surfaces with SRV'
  if (t === 'encoded') return 'Scan ships, data ports, and signal sources'
  if (t === 'manufactured') return 'Combat bounties, mission rewards, ship salvage'
  return 'Collect from in-game sources'
}

/**
 * Determine which engineers from `engineers` (getEngineers() result) are
 * required to apply the wishlist blueprints, and return them sorted by
 * distance from `currentPos` using nearest-neighbour ordering.
 *
 * @param {Array}  wishlist    — wishlist items
 * @param {Array}  blueprints  — getBlueprints() result
 * @param {Array}  engineers   — getEngineers() result
 * @param {Array}  currentPos  — [x, y, z]
 * @returns {Array} engineer RouteStop objects, ordered nearest-first
 */
export function buildEngineerRoute (wishlist, blueprints, engineers, currentPos) {
  // Find which engineers are needed for the wishlist
  const requiredBlueprintsByEngineer = {}  // engineerId → [{ symbol, name, grade, moduleName }]

  for (const item of wishlist) {
    // Explicitly requested engineer unlocks
    if (item.type === 'engineer_unlock') {
      const eng = engineers.find(e => String(e.id) === String(item.engineerId) || e.name === item.engineerName)
      if (eng && !requiredBlueprintsByEngineer[eng.id]) requiredBlueprintsByEngineer[eng.id] = []
      continue
    }

    if (item.type !== 'engineering') continue
    const bp = blueprints.find(b => b.symbol.toLowerCase() === item.blueprintSymbol.toLowerCase())
    if (!bp) continue

    for (const [engineerName, engineerInfo] of Object.entries(bp.engineers ?? {})) {
      // Match engineer by name
      const eng = engineers.find(e => e.name === engineerName)
      if (!eng) continue
      if (!requiredBlueprintsByEngineer[eng.id]) requiredBlueprintsByEngineer[eng.id] = []
      requiredBlueprintsByEngineer[eng.id].push({
        symbol: bp.symbol,
        name: bp.name,
        grade: item.grade,
        moduleName: Array.isArray(bp.appliedToModules?.[0]) ? bp.appliedToModules[0] : bp.appliedToModules?.[0] ?? ''
      })
    }
  }

  if (Object.keys(requiredBlueprintsByEngineer).length === 0) return []

  // Build stop objects for required engineers
  const stops = Object.entries(requiredBlueprintsByEngineer).map(([engId, bps]) => {
    const eng = engineers.find(e => String(e.id) === String(engId))
    if (!eng) return null
    return {
      type: 'engineer',
      engineerId: eng.id,
      engineerName: eng.name,
      system: { name: eng.system.name, position: eng.system.position },
      unlockStatus: eng.progress.status,
      rank: eng.progress.rank,
      rankProgress: eng.progress.rankProgress,
      blueprints: bps
    }
  }).filter(Boolean)

  // Nearest-neighbour sort
  return nearestNeighbourSort(stops, currentPos)
}

/**
 * Generate the full Smart Route from wishlist shortfalls, sources, and trades.
 *
 * Returns a sorted array of RouteStop objects ready for timeline rendering.
 *
 * @param {Array}  allocatedShortfalls — result of allocateTradeSuggestions()
 * @param {Array}  engineers           — getEngineers() result
 * @param {Array}  wishlist            — wishlist items
 * @param {Array}  blueprints          — getBlueprints() result
 * @param {Object} materialSources     — getMaterialSources() result (flat)
 * @param {Object} materialTraders     — getMaterialTraders() result
 * @param {Array}  currentPos          — [x, y, z]
 * @param {Set}    enabledMethods      — set of enabled collection method keys
 * @returns {Array} ordered RouteStop array
 */
export function generateSmartRoute ({
  allocatedShortfalls,
  engineers,
  wishlist,
  blueprints,
  materialSources,
  materialTraders,
  currentPos,
  enabledMethods
}) {
  const stops = []

  // ── Trade stops ──────────────────────────────────────────────────────────
  const tradesByType = { Raw: [], Encoded: [], Manufactured: [] }
  for (const sfEntry of allocatedShortfalls) {
    if (!sfEntry.trades?.length) continue
    const t = (sfEntry.type ?? '').toLowerCase()
    const key = t === 'raw' ? 'Raw' : t === 'encoded' ? 'Encoded' : t === 'manufactured' ? 'Manufactured' : null
    if (!key) continue
    for (const trade of sfEntry.trades) {
      tradesByType[key].push({
        give: { ...trade.from, amount: trade.give },
        receive: { symbol: sfEntry.symbol, name: sfEntry.name, grade: sfEntry.grade, amount: trade.receive }
      })
    }
  }

  const traders = materialTraders?.traders ?? []
  for (const [type, trades] of Object.entries(tradesByType)) {
    if (!trades.length) continue
    const nearest = findNearestTrader(traders, type, currentPos)
    if (!nearest) continue
    stops.push({
      type: 'trade',
      system: { name: nearest.name, position: [nearest.coords.x, nearest.coords.y, nearest.coords.z] },
      station: { name: nearest.station.name, distanceToArrival: nearest.station.distanceToArrival },
      traderType: type,
      trades
    })
  }

  // ── Collection stops ─────────────────────────────────────────────────────
  const collectionStops = groupCollectionsBySystem(allocatedShortfalls, materialSources, enabledMethods)
  stops.push(...collectionStops)

  // ── Engineer stops ────────────────────────────────────────────────────────
  const engineerStops = buildEngineerRoute(wishlist, blueprints, engineers, currentPos)
  stops.push(...engineerStops)

  // ── Sort (nearest-neighbour then 2-opt) ──────────────────────────────────
  const sorted = nearestNeighbourSort(stops, currentPos)
  return twoOptImprove(sorted, currentPos)
}
