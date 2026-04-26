import { useState, useEffect, useCallback } from 'react'
import animateTableEffect from 'lib/animate-table-effect'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { EngineeringPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { getActiveShipId, setActiveShipId, getWishlist, addToWishlist, removeFromWishlist, updateWishlistItem } from 'lib/wishlist'
import { aggregateMaterialRequirements, allocateTradeSuggestions } from 'lib/engineering-calc'
import WishlistItem from 'components/panels/eng/wishlist-item'
import MaterialRequirement from 'components/panels/eng/material-requirement'
import BlueprintPicker from 'components/panels/eng/blueprint-picker'

const MATERIAL_EVENTS = ['Materials', 'MaterialCollected', 'MaterialDiscarded', 'MaterialTrade', 'EngineerCraft']

export default function EngineeringWishlistPage () {
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [blueprints, setBlueprints] = useState([])
  const [materials, setMaterials] = useState([])
  const [shipId, setShipId] = useState(null)
  const [wishlist, setWishlist] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [shortfallOnly, setShortfallOnly] = useState(false)

  useEffect(animateTableEffect)

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      if (!connected) return
      const [newBlueprints, newMaterials] = await Promise.all([
        sendEvent('getBlueprints'),
        sendEvent('getMaterials')
      ])
      setBlueprints(newBlueprints ?? [])
      setMaterials(newMaterials ?? [])

      const activeId = getActiveShipId()
      if (activeId) {
        setShipId(activeId)
        setWishlist(getWishlist(activeId))
      }

      setComponentReady(true)
    })()
  }, [connected, ready])

  // ── Material journal events ───────────────────────────────────────────────
  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (MATERIAL_EVENTS.includes(log.event)) {
      setMaterials(await sendEvent('getMaterials'))
    }
    if (log.event === 'Loadout' && log.ShipID != null) {
      const id = String(log.ShipID)
      setActiveShipId(id)
      setShipId(id)
      setWishlist(getWishlist(id))
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async (event) => {
    if (event?._changedFile === 'Status') return
    setMaterials(await sendEvent('getMaterials'))
  }), [])

  // ── Wishlist mutations ────────────────────────────────────────────────────
  const handleAdd = useCallback((item) => {
    if (!shipId) return
    item.id = crypto.randomUUID()
    const updated = addToWishlist(shipId, item)
    setWishlist([...updated])
    setShowPicker(false)
  }, [shipId])

  const handleRemove = useCallback((id) => {
    if (!shipId) return
    const updated = removeFromWishlist(shipId, id)
    setWishlist([...updated])
  }, [shipId])

  const handleUpdate = useCallback((id, changes) => {
    if (!shipId) return
    const updated = updateWishlistItem(shipId, id, changes)
    setWishlist([...updated])
  }, [shipId])

  // ── Computed data ─────────────────────────────────────────────────────────
  const allRequirements = aggregateMaterialRequirements(wishlist, blueprints, materials)
  const shortfallRequirements = allRequirements.filter(r => r.shortfall > 0)
  const withTrades = allocateTradeSuggestions(shortfallRequirements, materials)
  const shortfallMap = Object.fromEntries(allRequirements.map(r => [r.symbol, r]))

  const displayRequirements = shortfallOnly ? withTrades : allRequirements.map(r => {
    const trade = withTrades.find(t => t.symbol === r.symbol)
    return trade ?? r
  })

  const wishlistReady = wishlist.length > 0 && allRequirements.every(r => r.shortfall === 0)

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Wishlist')}>
        <h2>Engineering Wishlist</h2>
        <h3 className='text-primary'>
          {shipId
            ? `Ship ${shipId}`
            : 'No active ship — board a ship to activate your wishlist'}
        </h3>

        {/* ── Add Blueprint ── */}
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

        {showPicker &&
          <BlueprintPicker blueprints={blueprints} onAdd={handleAdd} />}

        {/* ── Wishlist Items ── */}
        {wishlist.length > 0
          ? (
            <>
              <div className='section-heading'>
                <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>
                  Wishlist
                  {wishlistReady && (
                    <span className='text-success' style={{ marginLeft: '1rem', fontWeight: 'normal', fontSize: '1rem' }}>
                      All materials ready
                    </span>
                  )}
                </h4>
              </div>
              <table className='table--animated fx-fade-in'>
                <thead style={{ display: 'none' }}>
                  <tr>
                    <th>Blueprint</th>
                    <th>Grade</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {wishlist.map(item =>
                    <WishlistItem
                      key={item.id}
                      item={item}
                      requirements={allRequirements}
                      onRemove={handleRemove}
                      onUpdate={handleUpdate}
                    />
                  )}
                </tbody>
              </table>
            </>
            )
          : (
            <p className='text-muted' style={{ marginTop: '1rem' }}>
              No blueprints on your wishlist. Use <em>+ Add Blueprint</em> to get started.
            </p>
            )}

        {/* ── Material Requirements ── */}
        {allRequirements.length > 0 &&
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
                <tr>
                  <th>Material</th>
                  <th>Progress</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {displayRequirements.map(req =>
                  <MaterialRequirement
                    key={`req_${req.symbol}`}
                    requirement={req}
                    shortfallMap={shortfallMap}
                    materials={materials}
                  />
                )}
              </tbody>
            </table>
          </>}
      </Panel>
    </Layout>
  )
}
