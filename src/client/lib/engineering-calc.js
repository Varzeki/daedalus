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
