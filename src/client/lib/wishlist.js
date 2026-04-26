/**
 * Ship-aware wishlist CRUD utilities.
 *
 * Wishlist items are persisted in localStorage keyed by ship ID:
 *   daedalus_engineering_wishlist_{shipId}
 *
 * The active ship ID is cached in memory from the most recent Loadout event and
 * is also persisted so it survives page reloads.
 */

const ACTIVE_SHIP_KEY = 'daedalus_active_ship_id'
const WISHLIST_PREFIX = 'daedalus_engineering_wishlist_'

// ---------------------------------------------------------------------------
// Active ship tracking
// ---------------------------------------------------------------------------

let _activeShipId = null

/**
 * Return the currently active ship ID.
 * Falls back to the value persisted by a previous session.
 * @returns {string|null}
 */
export function getActiveShipId () {
  if (_activeShipId !== null) return _activeShipId
  try {
    const persisted = window.localStorage.getItem(ACTIVE_SHIP_KEY)
    if (persisted) {
      _activeShipId = persisted
      return _activeShipId
    }
  } catch (_) { /* not in browser context */ }
  return null
}

/**
 * Update the in-memory and persisted active ship ID.
 * Call this when a Loadout journal event arrives.
 * @param {string|number} shipId
 */
export function setActiveShipId (shipId) {
  _activeShipId = String(shipId)
  try {
    window.localStorage.setItem(ACTIVE_SHIP_KEY, _activeShipId)
  } catch (_) { /* not in browser context */ }
}

// ---------------------------------------------------------------------------
// Wishlist storage key helper
// ---------------------------------------------------------------------------

function wishlistKey (shipId) {
  return `${WISHLIST_PREFIX}${shipId}`
}

// ---------------------------------------------------------------------------
// Wishlist CRUD
// ---------------------------------------------------------------------------

/**
 * Return the wishlist for the given ship.
 * Returns an empty array when no wishlist exists yet.
 * @param {string|number} shipId
 * @returns {Array}
 */
export function getWishlist (shipId) {
  try {
    const raw = window.localStorage.getItem(wishlistKey(shipId))
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

/**
 * Persist the full wishlist for the given ship, replacing any existing list.
 * @param {string|number} shipId
 * @param {Array} items
 */
export function setWishlist (shipId, items) {
  try {
    window.localStorage.setItem(wishlistKey(shipId), JSON.stringify(items))
  } catch (_) { /* quota exceeded / not in browser */ }
}

/**
 * Add a new item to the wishlist for the given ship.
 * The item should already have a unique `id` field (e.g. a UUID or
 * `crypto.randomUUID()` from the caller).
 *
 * @param {string|number} shipId
 * @param {object} item — must include `id`, `type`, and type-specific fields
 * @returns {Array} Updated wishlist
 */
export function addToWishlist (shipId, item) {
  const items = getWishlist(shipId)
  items.push(item)
  setWishlist(shipId, items)
  return items
}

/**
 * Remove an item from the wishlist by its `id`.
 * @param {string|number} shipId
 * @param {string} id
 * @returns {Array} Updated wishlist
 */
export function removeFromWishlist (shipId, id) {
  const items = getWishlist(shipId).filter(i => i.id !== id)
  setWishlist(shipId, items)
  return items
}

/**
 * Update fields on an existing wishlist item.
 * @param {string|number} shipId
 * @param {string} id
 * @param {object} changes  — plain object of fields to merge
 * @returns {Array} Updated wishlist
 */
export function updateWishlistItem (shipId, id, changes) {
  const items = getWishlist(shipId).map(i =>
    i.id === id ? { ...i, ...changes } : i
  )
  setWishlist(shipId, items)
  return items
}

/**
 * Clear the entire wishlist for the given ship.
 * @param {string|number} shipId
 */
export function clearWishlist (shipId) {
  try {
    window.localStorage.removeItem(wishlistKey(shipId))
  } catch (_) { /* not in browser */ }
}
