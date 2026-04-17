const EDSM = require('../edsm')
const SystemMap = require('../system-map')
const { UNKNOWN_VALUE } = require('../../../shared/consts')
const distance = require('../../../shared/distance')

class System {
  constructor ({ eliteLog }) {
    this.eliteLog = eliteLog
    // Set after construction by EventHandlers so we can reuse the
    // exploration enrichment pipeline for journal-only systems.
    this.exploration = null
  }

  async getCurrentLocation () {
    // Get most recent Location event (written at startup and after respawn)
    const Location = await this.eliteLog.getEvent('Location')

    const currentLocation = {
      name: UNKNOWN_VALUE, // System Name
      mode: 'SHIP' // ENUM: [SHIP|SRV|FOOT|TAXI|MULTICREW]
    }

    if (!Location) return currentLocation

    const FSDJump = (await this.eliteLog.getEventsFromTimestamp('FSDJump', Location?.timestamp, 1))?.[0]

    // If there is an FSD Jump event more recent than the Location event
    // then use that for current location (note: they are formatted almost
    // the same way)
    const event = FSDJump || Location

    if (event.StarSystem) currentLocation.name = event.StarSystem
    if (event.StarPos) currentLocation.position = event.StarPos
    if (event.SystemAddress) currentLocation.address = event.SystemAddress

    if (event.InSRV) currentLocation.mode = 'SRV'
    if (event.OnFoot) currentLocation.mode = 'FOOT'
    if (event.Taxi) currentLocation.mode = 'TAXI'
    if (event.Multicrew) currentLocation.mode = 'MULTICREW'

    // Station is only set if docked
    if (event.Docked) currentLocation.docked = true
    if (event.StationName) currentLocation.station = event.StationName

    // Body can be a star or a planet
    if (event.Body) currentLocation.body = event.Body
    if (event.BodyType) currentLocation.bodyType = event.BodyType

    // Set if on (or near) a planet
    if (event.Latitude) currentLocation.latitude = event.Latitude
    if (event.Longitude) currentLocation.longitude = event.Longitude
    if (event.Altitude) currentLocation.altitude = event.Altitude

    // System information
    if (event.SystemAllegiance) currentLocation.allegiance = event.SystemAllegiance
    if (event.SystemGovernment_Localised || event.SystemGovernment) currentLocation.government = event.SystemGovernment_Localised || event.SystemGovernment
    if (event.SystemSecurity_Localised || event.SystemSecurity) currentLocation.security = event.SystemSecurity_Localised || event.SystemSecurity
    if (event.Population) currentLocation.population = event.Population
    if (event?.SystemFaction?.Name) currentLocation.faction = event.SystemFaction.Name
    if (event?.SystemFaction?.FactionState) currentLocation.state = event.SystemFaction.FactionState
    if (event.SystemEconomy_Localised || event.SystemEconomy) {
      currentLocation.economy = {
        primary: event.SystemEconomy_Localised || event.SystemEconomy
      }
      if (event.SystemSecondEconomy_Localised || event.SystemSecondEconomy) {
        currentLocation.economy.secondary = event.SystemSecondEconomy_Localised || event.SystemSecondEconomy
      }
    }

    // Not setting this until there is code to also work out when it has been cleared
    // if (event.Wanted) currentLocation.wanted = event.true

    return currentLocation
  }

  async getSystem ({ name = null, useCache = true } = {}) {
    const currentLocation = await this.getCurrentLocation()

    // If no system name was specified, get the star system the player is in
    const systemName = name?.trim() ?? currentLocation?.name ?? null

    // If no system name was provided amd we don't know the players location
    if (!systemName || systemName === UNKNOWN_VALUE) {
      return {
        name: UNKNOWN_VALUE,
        unknownSystem: true
      }
    }

    // Check for entry in cache in case we have it already
    // Note: System names are unique (they can change, but will still be unique)
    // so is okay to use them as a key.
    const cached = global.CACHE.SYSTEMS[systemName.toLowerCase()]
    // A valid cache hit requires stars/planets (SystemMap output) — partial
    // entries (e.g. bodies-only from fetchBodiesForSystems) are not complete.
    const isComplete = cached && cached.stars && cached.name && cached.name !== UNKNOWN_VALUE && !cached.unknownSystem
    const cacheHit = isComplete && useCache !== false
    if (!cacheHit) {
      // Start with what we know: the system name and any existing partial data
      let system = { name: systemName, bodies: [], stations: [] }

      // Try EDSM for rich metadata (stations, population, economy, etc.)
      try {
        const edsmData = await EDSM.system(systemName)
        if (edsmData) {
          // Keep EDSM data but always use the real system name
          system = { ...system, ...edsmData, name: systemName }
        }
      } catch (e) {
        // EDSM unavailable — continue with journal data only
      }

      // Try to get position from journal events if EDSM didn't provide it
      if (!system.position) {
        const isCurrentSystem = (systemName.toLowerCase() === currentLocation?.name?.toLowerCase())
        if (isCurrentSystem && currentLocation?.position) {
          system.position = currentLocation.position
          if (currentLocation.address) system.address = currentLocation.address
        } else {
          const [fsdJump] = await this.eliteLog._query({ event: 'FSDJump', StarSystem: systemName }, 1)
          const posEvent = fsdJump || (await this.eliteLog._query({ event: 'Location', StarSystem: systemName }, 1))?.[0]
          if (posEvent?.StarPos) system.position = posEvent.StarPos
          if (posEvent?.SystemAddress) system.address = posEvent.SystemAddress
        }
      }

      // Always enrich with journal data — this adds journal-only bodies
      // (Phase 3 of _enrichBodiesWithJournalData) and enriches any EDSM
      // bodies with discovery status, signals, materials, etc. (Phase 2).
      // This is the same enrichment pipeline used by getExplorationSystem.
      if (this.exploration) {
        if (!system.bodies) system.bodies = []
        await this.exploration._enrichBodiesWithJournalData(system.bodies, systemName, system.position)

        // Assign synthetic id64 for journal-only bodies so SystemMap dedup works
        for (const body of system.bodies) {
          if (!body.id64 && body.bodyId != null) {
            body.id64 = `journal-${body.bodyId}`
          }
        }
      }

      // Generate map data from the system data
      const systemMap = new SystemMap(system)

      // Merge with any existing cache data (e.g. bodies from fetchBodiesForSystems)
      // rather than overwriting, so partial entries aren't lost
      const existing = global.CACHE.SYSTEMS[systemName.toLowerCase()] || {}
      global.CACHE.SYSTEMS[systemName.toLowerCase()] = {
        ...existing,
        ...system,
        ...systemMap
      }
      const final = global.CACHE.SYSTEMS[systemName.toLowerCase()]
    }

    const cacheResponse = global.CACHE.SYSTEMS[systemName.toLowerCase()] // Get entry from cache

    // Determine how many bodies we actaully know of in the current system, and
    // how many we think there are based on FSS Discovery Scan
    let numberOfBodiesFound = cacheResponse?.bodies?.length ?? 0
    let numberOfBodiesInSystem = numberOfBodiesFound // We start with this value (until we know otherwise)
    let scanPercentComplete = null

    if (cacheResponse.name && cacheResponse.name !== UNKNOWN_VALUE) {
      // If we have an FSSDiscoveryScan result with a BodyCount then we can estimate
      // percentage of the system that has been scanned
      const FSSDiscoveryScan = await this.eliteLog._query({ event: 'FSSDiscoveryScan', SystemName: cacheResponse.name }, 1)
      if (FSSDiscoveryScan?.[0]?.BodyCount) {
        numberOfBodiesInSystem = FSSDiscoveryScan?.[0]?.BodyCount
        scanPercentComplete = Math.floor((numberOfBodiesFound / numberOfBodiesInSystem) * 100)
      }
    }

    if (systemName.toLowerCase() === currentLocation?.name?.toLowerCase()) {
      // Handle if this is the system the player is currently in
      return {
        ...cacheResponse,
        ...currentLocation,
        distance: 0,
        isCurrentLocation: true,
        scanPercentComplete,
        _cacheTimestamp: new Date().toISOString()
      }

    } else {
      // Handle if this is not the system the player is currently in
      return {
        ...cacheResponse,
        distance: distance(cacheResponse?.position, currentLocation?.position),
        isCurrentLocation: false,
        scanPercentComplete,
        _cacheTimestamp: new Date().toISOString()
      }
    }
  }

  getHandlers () {
    return {
      getSystem: (args) => this.getSystem(args)
    }
  }
}

module.exports = System
