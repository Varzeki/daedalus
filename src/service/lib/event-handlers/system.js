const EDSM = require('../edsm')
const SystemMap = require('../system-map')
const { UNKNOWN_VALUE } = require('../../../shared/consts')
const distance = require('../../../shared/distance')

class System {
  constructor ({ eliteLog }) {
    this.eliteLog = eliteLog
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
    if (!global.CACHE.SYSTEMS[systemName.toLowerCase()] || useCache === false) {
      // Get system from EDSM (with fallback if EDSM is unavailable)
      let system
      try {
        system = await EDSM.system(systemName)
      } catch (e) {
        console.log(`[EDSM] Failed to fetch system '${systemName}': ${e.message}`)
        system = { name: systemName, bodies: [], stations: [], edsmError: true }
      }

      // TODO Look up recent local data we have in the logs for bodies in the
      // system and merge data with about bodies and stations from EDSM,
      // overwriting data from EDSM with with more recent local where there are
      // conflicts.

      // Merge in local scan data with information about the body
      if (system?.bodies) {
        const bodyNames = system.bodies.map(b => b.name)
        const inhabitedSystem = (system?.population > 0 || system?.stations?.length > 0 || system?.ports?.length > 0 || system?.megaships?.length > 0 || system?.settlements?.length > 0)

        // Batch-fetch all relevant journal events for all bodies at once
        const [allFSSBodySignals, allSAASignalsFound, allScans, allSAAScanComplete] = await Promise.all([
          this.eliteLog._query({ event: 'FSSBodySignals', BodyName: { $in: bodyNames } }),
          this.eliteLog._query({ event: 'SAASignalsFound', BodyName: { $in: bodyNames } }),
          inhabitedSystem ? Promise.resolve([]) : this.eliteLog._query({ event: 'Scan', BodyName: { $in: bodyNames } }),
          inhabitedSystem ? Promise.resolve([]) : this.eliteLog._query({ event: 'SAAScanComplete', BodyName: { $in: bodyNames } })
        ])

        // Build lookup maps keyed by body name
        const fssMap = {}
        for (const e of allFSSBodySignals) { fssMap[e.BodyName] = e }
        const saaMap = {}
        for (const e of allSAASignalsFound) { saaMap[e.BodyName] = e }
        const scanMap = {}
        for (const e of allScans) { scanMap[e.BodyName] = e }
        const saaScanCompleteSet = new Set(allSAAScanComplete.map(e => e.BodyName))

        for (const body of system.bodies) {
          body.signals = {
            geological: 0,
            biological: 0,
            human: 0
          }

          // Merge in body signal scan data
          const fssEntry = fssMap[body.name]
          if (fssEntry?.Signals) {
            for (const signal of fssEntry.Signals) {
              if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
              if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
              if (signal?.Type === '$SAA_SignalType_Human;') body.signals.human = signal?.Count ?? 0
            }
          }

          // Merge in surface scan data
          const saaEntry = saaMap[body.name]
          if (saaEntry?.Signals) {
            for (const signal of saaEntry.Signals) {
              if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
              if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
              if (signal?.Type === '$SAA_SignalType_Human;') body.signals.human = signal?.Count ?? 0
            }
          }

          // If we have data from a surface scan about the plants, merge it
          if (body.signals.biological > 0 && saaEntry?.Genuses) {
            body.biologicalGenuses = saaEntry.Genuses.map(g => g.Genus_Localised)
          }

          // Only log discovered / mapped if in an uninhabited system
          // FIXME Suspect this logic isn't entirely correct
          if (!inhabitedSystem) {
            const scanEntry = scanMap[body.name]
            body.discovered = scanEntry?.WasDiscovered ?? false
            body.mapped = scanEntry?.WasMapped ?? false

            // If there is an SAAScanComplete entry for the body, it has been scanned
            // (even if the Scan entry says it has not, because it's old data)
            if (saaScanCompleteSet.has(body.name)) body.mapped = true
          }
        }
      }


      // Generate map data from the system data
      const systemMap = new SystemMap(system)

      // Create/Update cache entry with merged system and system map data
      global.CACHE.SYSTEMS[systemName.toLowerCase()] = {
        ...system,
        ...systemMap
      }
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

    // If we don't know what system this is return what we have
    if (!cacheResponse.name || cacheResponse.name === UNKNOWN_VALUE) {
      const isCurrentLocation = (systemName.toLowerCase() === currentLocation?.name?.toLowerCase())

      const response = {
        name: systemName,
        unknownSystem: true,
        isCurrentLocation,
        scanPercentComplete,
        _cacheTimestamp: new Date().toISOString()
      }

      if (isCurrentLocation && currentLocation?.position && currentLocation?.address) {
        response.position = currentLocation.position
        response.address = currentLocation.address
        response.distance = 0
      }

      return response
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
