const distance = require('../../../shared/distance')
const { getBodyValue, getExpectedBioValue, getSystemValue, isStarClass, GENUS_MAX_VALUES, normalizeDssGenus } = require('../exploration-value')
const { UNKNOWN_VALUE } = require('../../../shared/consts')
const EDSM = require('../edsm')
const { predictSpecies } = require('../bio-predictor')

// Limit concurrent EDSM requests to avoid hammering the API
const MAX_CONCURRENT = 4

// Species reward lookup (Species_Localised → credit value)
// From SrvSurvey codexRef / Canonn API
const SPECIES_REWARDS = {
  // Aleoida
  'Aleoida Spica': 3385200, 'Aleoida Laminiae': 3385200, 'Aleoida Coronamus': 6284600,
  'Aleoida Arcus': 7252500, 'Aleoida Gravis': 12934900,
  // Anemone
  'Luteolum Anemone': 1499900, 'Croceum Anemone': 1499900,
  'Puniceum Anemone': 1499900, 'Roseum Anemone': 1499900,
  'Blatteum Bioluminescent Anemone': 1499900, 'Rubeum Bioluminescent Anemone': 1499900,
  'Prasinum Bioluminescent Anemone': 1499900, 'Roseum Bioluminescent Anemone': 1499900,
  // Amphora Plant
  'Amphora Plant': 1628800,
  // Bark Mounds
  'Bark Mounds': 1471900,
  // Bacterium
  'Bacterium Aurasus': 1000000, 'Bacterium Acies': 1000000, 'Bacterium Vesicula': 1000000,
  'Bacterium Bullaris': 1152500, 'Bacterium Alcyoneum': 1658500, 'Bacterium Cerbrus': 1689800,
  'Bacterium Tela': 1949000, 'Bacterium Verrata': 3897000, 'Bacterium Omentum': 4638900,
  'Bacterium Scopulum': 4934500, 'Bacterium Nebulus': 5289900, 'Bacterium Volu': 7774700,
  'Bacterium Informem': 8418000,
  // Cactoida
  'Cactoida Lapis': 2483600, 'Cactoida Peperatis': 2483600, 'Cactoida Cortexum': 3667600,
  'Cactoida Pullulanta': 3667600, 'Cactoida Vermis': 16202800,
  // Clypeus
  'Clypeus Lacrimam': 8418000, 'Clypeus Margaritus': 11873200, 'Clypeus Speculumi': 16202800,
  // Concha
  'Concha Labiata': 2352400, 'Concha Renibus': 4572400, 'Concha Aureolas': 7774700,
  'Concha Biconcavis': 19010800,
  // Electricae
  'Electricae Pluma': 6284600, 'Electricae Radialem': 6284600,
  // Fonticulua
  'Fonticulua Campestris': 1000000, 'Fonticulua Digitos': 1804100, 'Fonticulua Lapida': 3111000,
  'Fonticulua Upupam': 5727600, 'Fonticulua Segmentatus': 19010800, 'Fonticulua Fluctus': 20000000,
  // Frutexa
  'Frutexa Metallicum': 1632500, 'Frutexa Fera': 1632500, 'Frutexa Collum': 1639800,
  'Frutexa Flabellum': 1808900, 'Frutexa Sponsae': 5988000, 'Frutexa Acus': 7774700,
  'Frutexa Flammasis': 10326000,
  // Fumerola
  'Fumerola Carbosis': 6284600, 'Fumerola Aquatis': 6284600, 'Fumerola Nitris': 7500900,
  'Fumerola Extremus': 16202800,
  // Fungoida
  'Fungoida Setisis': 1670100, 'Fungoida Stabitis': 2680300, 'Fungoida Gelata': 3330300,
  'Fungoida Bullarum': 3703200,
  // Osseus
  'Osseus Cornibus': 1483000, 'Osseus Spiralis': 2404700, 'Osseus Pumice': 3156300,
  'Osseus Fractus': 4027800, 'Osseus Pellebantus': 9739000, 'Osseus Discus': 12934900,
  // Recepta
  'Recepta Umbrux': 12934900, 'Recepta Conditivus': 14313700, 'Recepta Deltahedronix': 16202800,
  // Stratum
  'Stratum Paleas': 1362000, 'Stratum Limaxus': 1362000, 'Stratum Excutitus': 2448900,
  'Stratum Araneamus': 2448900, 'Stratum Frigus': 2637500, 'Stratum Laminamus': 2788300,
  'Stratum Cucumisis': 16202800, 'Stratum Tectonicas': 19010800,
  // Tubus
  'Tubus Conifer': 2415500, 'Tubus Rosarium': 2637500, 'Tubus Sororibus': 5727600,
  'Tubus Compagibus': 7774700, 'Tubus Cavas': 11873200,
  // Tussock
  'Tussock Pennatis': 1000000, 'Tussock Propagito': 1000000, 'Tussock Cultro': 1766600,
  'Tussock Catena': 1766600, 'Tussock Divisa': 1766600, 'Tussock Ignis': 1849000,
  'Tussock Ventusa': 3227700, 'Tussock Albata': 3252500, 'Tussock Caputus': 3472400,
  'Tussock Serrati': 4447100, 'Tussock Pennata': 5853800, 'Tussock Capillum': 7025800,
  'Tussock Triticum': 7774700, 'Tussock Virgam': 14313700, 'Tussock Stigmasis': 19010800,
  // Brain Tree
  'Roseum Brain Tree': 1593700, 'Gypseeum Brain Tree': 1593700,
  'Ostrinum Brain Tree': 1593700, 'Viride Brain Tree': 1593700,
  'Lividum Brain Tree': 1593700, 'Aureum Brain Tree': 1593700,
  'Puniceum Brain Tree': 1593700, 'Lindigoticum Brain Tree': 1593700,
  // Sinuous Tubers
  'Roseum Sinuous Tubers': 1514500, 'Prasinum Sinuous Tubers': 1514500,
  'Albidum Sinuous Tubers': 1514500, 'Caeruleum Sinuous Tubers': 1514500,
  'Blatteum Sinuous Tubers': 1514500, 'Lindigoticum Sinuous Tubers': 1514500,
  'Violaceum Sinuous Tubers': 1514500, 'Viride Sinuous Tubers': 1514500,
  // Crystalline Shards
  'Crystalline Shards': 1628800
}

async function fetchBodiesForSystems (systemNames) {
  const results = {}
  const queue = [...systemNames]

  async function worker () {
    while (queue.length > 0) {
      const name = queue.shift()
      const key = name.toLowerCase()
      // Skip if already cached
      if (global.CACHE.SYSTEMS[key]?.bodies) {
        results[key] = global.CACHE.SYSTEMS[key]
        continue
      }
      try {
        const data = await EDSM.bodiesWithCount(name)
        const cached = { bodies: data.bodies, bodyCount: data.bodyCount }
        global.CACHE.SYSTEMS[key] = { ...global.CACHE.SYSTEMS[key], ...cached }
        results[key] = global.CACHE.SYSTEMS[key]
      } catch (e) {
        // EDSM unavailable for this system — skip it
        results[key] = null
      }
    }
  }

  const workers = []
  for (let i = 0; i < Math.min(MAX_CONCURRENT, systemNames.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

class Exploration {
  constructor ({ eliteLog, eliteJson, system }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
    this.system = system

    return this
  }

  // For the current system, merge journal data onto EDSM bodies to get
  // accurate discovery/map status, bio signals, and fill in missing bodies.
  // Journal data is more accurate than EDSM for the current system since
  // we have first-hand Scan events with exact mass/type/discovery status.
  async _enrichBodiesWithJournalData (bodies, systemName, starPos) {
    // Build a set of known body names for quick lookup
    const knownBodies = new Set(bodies.map(b => b.name?.toLowerCase()))

    // Enrich existing EDSM bodies with journal data
    for (const body of bodies) {
      // Initialize signals
      if (!body.signals) {
        body.signals = { geological: 0, biological: 0, human: 0 }
      }

      // Default discovery status: assume NOT first discoverer/mapper
      // Only set true when journal Scan confirms WasDiscovered===false
      body._isFirstDiscoverer = false
      body._isFirstMapped = false

      // Look up journal Scan for this body — more accurate mass/type
      const Scan = await this.eliteLog._query({ event: 'Scan', BodyName: body.name }, 1)
      body._wasScanned = !!Scan[0]
      if (Scan[0]) {
        // Update mass from journal (more precise than EDSM)
        if (Scan[0].MassEM > 0) body.earthMasses = Scan[0].MassEM
        if (Scan[0].StellarMass > 0) body.solarMasses = Scan[0].StellarMass

        // WasDiscovered=false means WE are the first discoverer
        // WasMapped=false means WE can get first-mapped bonus
        body._isFirstDiscoverer = Scan[0].WasDiscovered === false
        body._isFirstMapped = Scan[0].WasMapped === false

        // Enrich with journal body properties needed by bio-predictor
        // Journal data is more authoritative when present
        if (Scan[0].SurfaceGravity) body.gravity = Scan[0].SurfaceGravity / 9.81
        if (Scan[0].SurfaceTemperature) body.surfaceTemperature = Scan[0].SurfaceTemperature
        if (Scan[0].SurfacePressure != null) body.surfacePressure = Scan[0].SurfacePressure / 101325
        if (Scan[0].AtmosphereType) body.atmosphereType = Scan[0].AtmosphereType
        else if (Scan[0].Atmosphere) body.atmosphereType = Scan[0].Atmosphere.replace(/ atmosphere$/i, '')
        if (Scan[0].Volcanism) body.volcanismType = Scan[0].Volcanism || 'No volcanism'
        if (Scan[0].AtmosphereComposition) {
          body.atmosphereComposition = Object.fromEntries(
            Scan[0].AtmosphereComposition.map(c => [c.Name, c.Percent])
          )
        }
        if (Scan[0].Materials) {
          body.materials = Object.fromEntries(
            Scan[0].Materials.map(m => [m.Name, m.Percent])
          )
        }
        if (Scan[0].Parents) body.parents = Scan[0].Parents
        // SemiMajorAxis: journal provides in meters, convert to AU
        if (Scan[0].SemiMajorAxis != null) body.semiMajorAxis = Scan[0].SemiMajorAxis / 149597870700
      }

      // Merge FSSBodySignals (honk-level signal data)
      const FSSBodySignals = await this.eliteLog._query({ event: 'FSSBodySignals', BodyName: body.name }, 1)
      if (FSSBodySignals[0]?.Signals) {
        for (const signal of FSSBodySignals[0].Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
        }
      }

      // Merge SAASignalsFound (DSS-level signal data, more detailed)
      const SAASignalsFound = await this.eliteLog._query({ event: 'SAASignalsFound', BodyName: body.name }, 1)
      body._wasMapped = !!SAASignalsFound[0]
      // Fallback: SAAScanComplete also confirms DSS mapping even if SAASignalsFound is missing
      if (!body._wasMapped) {
        const SAAScanComplete = await this.eliteLog._query({ event: 'SAAScanComplete', BodyName: body.name }, 1)
        if (SAAScanComplete[0]) body._wasMapped = true
      }
      if (SAASignalsFound[0]?.Signals) {
        for (const signal of SAASignalsFound[0].Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
        }
      }
      // Extract DSS-confirmed genus names (e.g., [{Genus: "$Codex_...", Genus_Localised: "Bacterium"}, ...])
      if (SAASignalsFound[0]?.Genuses?.length > 0) {
        body.biologicalGenuses = SAASignalsFound[0].Genuses
          .map(g => g.Genus_Localised || g.Genus)
          .filter(Boolean)
      }

      // Check for confirmed biological species (ScanOrganic with Analyse scan type)
      await this._addKnownSpecies(body)
    }

    // Add bodies found in journal Scan events but not in EDSM
    // This handles the case where we've FSS'd a body that nobody has uploaded to EDSM yet
    const journalScans = await this.eliteLog._query({ event: 'Scan', StarSystem: systemName })
    for (const scan of journalScans) {
      if (!scan.BodyName || knownBodies.has(scan.BodyName.toLowerCase())) continue
      knownBodies.add(scan.BodyName.toLowerCase())

      const journalBody = {
        name: scan.BodyName,
        bodyId: scan.BodyID,
        type: scan.StarType ? 'Star' : 'Planet',
        subType: scan.PlanetClass || scan.StarType,
        earthMasses: scan.MassEM || undefined,
        solarMasses: scan.StellarMass || undefined,
        terraformingState: scan.TerraformState === 'Terraformable' ? 'Candidate for terraforming' : (scan.TerraformState || ''),
        isMainStar: scan.DistanceFromArrivalLS === 0,
        distanceToArrival: scan.DistanceFromArrivalLS,
        _isFirstDiscoverer: scan.WasDiscovered === false,
        _isFirstMapped: scan.WasMapped === false,
        _wasScanned: true,
        signals: { geological: 0, biological: 0, human: 0 },
        // Journal provides richer body data needed by bio-predictor
        gravity: scan.SurfaceGravity ? scan.SurfaceGravity / 9.81 : undefined,
        surfaceTemperature: scan.SurfaceTemperature,
        surfacePressure: scan.SurfacePressure ? scan.SurfacePressure / 101325 : undefined,
        atmosphereType: scan.AtmosphereType || (scan.Atmosphere ? scan.Atmosphere.replace(/ atmosphere$/i, '') : 'None'),
        atmosphereComposition: scan.AtmosphereComposition
          ? Object.fromEntries(scan.AtmosphereComposition.map(c => [c.Name, c.Percent]))
          : null,
        volcanismType: scan.Volcanism || 'No volcanism',
        materials: scan.Materials
          ? Object.fromEntries(scan.Materials.map(m => [m.Name, m.Percent]))
          : null,
        parents: scan.Parents || null,
        semiMajorAxis: scan.SemiMajorAxis != null ? scan.SemiMajorAxis / 149597870700 : null
      }

      // Check for signals on this journal-only body
      const FSSBodySignals = await this.eliteLog._query({ event: 'FSSBodySignals', BodyName: scan.BodyName }, 1)
      if (FSSBodySignals[0]?.Signals) {
        for (const signal of FSSBodySignals[0].Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') journalBody.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') journalBody.signals.geological = signal?.Count ?? 0
        }
      }

      // Check for DSS-confirmed genus names on this journal-only body
      const SAASignals = await this.eliteLog._query({ event: 'SAASignalsFound', BodyName: scan.BodyName }, 1)
      journalBody._wasMapped = !!SAASignals[0]
      if (!journalBody._wasMapped) {
        const SAAScanComplete = await this.eliteLog._query({ event: 'SAAScanComplete', BodyName: scan.BodyName }, 1)
        if (SAAScanComplete[0]) journalBody._wasMapped = true
      }
      if (SAASignals[0]?.Signals) {
        for (const signal of SAASignals[0].Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') journalBody.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') journalBody.signals.geological = signal?.Count ?? 0
        }
      }
      if (SAASignals[0]?.Genuses?.length > 0) {
        journalBody.biologicalGenuses = SAASignals[0].Genuses
          .map(g => g.Genus_Localised || g.Genus)
          .filter(Boolean)
      }

      // Check for confirmed biological species
      await this._addKnownSpecies(journalBody)

      bodies.push(journalBody)
    }

    return bodies
  }

  // Run bio-predictor on all bodies and attach _predictedSpecies
  _addPredictedSpecies (bodies, starPos) {
    for (const body of bodies) {
      // Skip bodies without bio signals — no need to predict
      const bioSignals = body.signals?.biological ?? 0
      if (bioSignals <= 0) continue

      try {
        let predictions = predictSpecies(body, bodies, starPos)
        if (predictions.length > 0) {
          // Prune predictions using journal knowledge (inspired by EB's limitOccurrenceOfSpecies)
          const knownSpecies = body._knownSpecies ?? []
          const scannedGenera = body._scannedGenera ?? []

          // Filter by DSS-confirmed genera (from SAASignalsFound) — these are
          // definitive: only the confirmed genera can exist on this body
          const dssGenera = body.biologicalGenuses ?? null
          if (dssGenera && dssGenera.length > 0) {
            const dssSet = new Set(dssGenera.map(g => normalizeDssGenus(g)))
            predictions = predictions.filter(p => dssSet.has(p.genus?.toLowerCase()))
          }

          if (scannedGenera.length > 0 || knownSpecies.length > 0) {
            const confirmedGenera = new Set(knownSpecies.map(s => s.genus?.toLowerCase()))

            // If all bio signal slots are accounted for by scanned genera,
            // only keep predictions matching those genera (others can't exist)
            if (scannedGenera.length >= bioSignals) {
              const scannedSet = new Set(scannedGenera.map(g => g.toLowerCase()))
              predictions = predictions.filter(p => scannedSet.has(p.genus?.toLowerCase()))
            }

            // Remove predictions for fully-confirmed genera (species already known)
            predictions = predictions.filter(p => !confirmedGenera.has(p.genus?.toLowerCase()))
          }

          if (predictions.length > 0) {
            body._predictedSpecies = predictions
          }
        }
      } catch (e) {
        // Predictor error shouldn't break the whole handler
      }
    }
  }

  // Look up confirmed biological species on a body from journal ScanOrganic events
  async _addKnownSpecies (body) {
    const scans = await this.eliteLog._query({ event: 'ScanOrganic', Body: body.bodyId })
    if (!scans || scans.length === 0) return

    const knownSpecies = []
    const seenSpecies = new Set()
    const scannedGenera = []
    const seenGenera = new Set()

    for (const scan of scans) {
      const genus = scan.Genus_Localised || (scan.Species_Localised || '').split(' ')[0]
      if (!genus) continue

      // Track all scanned genera (Log/Sample/Analyse) — used to prune predictions
      if (!seenGenera.has(genus.toLowerCase())) {
        seenGenera.add(genus.toLowerCase())
        scannedGenera.push(genus)
      }

      // Only count fully analysed species (3rd scan) for value calculation
      if (scan.ScanType !== 'Analyse') continue
      const speciesName = scan.Species_Localised || scan.Species
      if (!speciesName || seenSpecies.has(speciesName)) continue
      seenSpecies.add(speciesName)

      const reward = SPECIES_REWARDS[speciesName] ?? 0
      if (reward > 0) {
        knownSpecies.push({ genus, species: speciesName, reward })
      }
    }

    if (knownSpecies.length > 0) body._knownSpecies = knownSpecies
    if (scannedGenera.length > 0) body._scannedGenera = scannedGenera
  }

  // Check journal for discovery status of a system the player is currently in
  async _getJournalDiscoveryInfo (systemName) {
    // FSSDiscoveryScan tells us total body count from honk
    const FSSDiscoveryScan = await this.eliteLog._query({ event: 'FSSDiscoveryScan', SystemName: systemName }, 1)
    const bodyCount = FSSDiscoveryScan?.[0]?.BodyCount ?? null

    return { bodyCount }
  }

  async getExplorationRoute (options = {}) {
    // Get current location from local journal data only — no EDSM calls
    const Location = await this.eliteLog.getEvent('Location')
    const FSDJump = Location
      ? (await this.eliteLog.getEventsFromTimestamp('FSDJump', Location.timestamp, 1))?.[0]
      : null
    const locationEvent = FSDJump || Location

    const currentSystemName = locationEvent?.StarSystem ?? UNKNOWN_VALUE
    const currentPosition = locationEvent?.StarPos ?? null

    // Get commander name for discoverer highlighting
    const LoadGame = await this.eliteLog.getEvent('LoadGame')
    const cmdrName = LoadGame?.Commander ?? null

    let inSystemOnRoute = false
    let jumpsToDestination = null

    const navRouteData = (await this.eliteJson.json())?.NavRoute?.Route ?? []

    // Fetch EDSM body data for all systems on the route (parallel, with concurrency limit)
    const systemNames = navRouteData.map(s => s.StarSystem).filter(Boolean)
    await fetchBodiesForSystems(systemNames)

    // For systems we have journal data for (current + previously visited),
    // enrich EDSM bodies with journal data (discovery status, bio signals, species)
    for (const sysName of systemNames) {
      const key = sysName.toLowerCase()
      if (!global.CACHE.SYSTEMS[key]) continue

      // Check if we have any journal Scan data for this system
      const hasJournalData = (await this.eliteLog._query({ event: 'Scan', StarSystem: sysName }, 1)).length > 0
      if (!hasJournalData) continue

      if (!global.CACHE.SYSTEMS[key].bodies) {
        global.CACHE.SYSTEMS[key].bodies = []
      }
      // Find the StarPos for this system from navRouteData
      const navEntry = navRouteData.find(s => s.StarSystem.toLowerCase() === key)
      const sysStarPos = navEntry?.StarPos ?? null
      await this._enrichBodiesWithJournalData(global.CACHE.SYSTEMS[key].bodies, sysName, sysStarPos)

      // Use journal-based body count if available (from FSS honk)
      const journalInfo = await this._getJournalDiscoveryInfo(sysName)
      if (journalInfo.bodyCount) {
        global.CACHE.SYSTEMS[key].bodyCount = journalInfo.bodyCount
      }
    }

    // Run bio-predictor for all systems with EDSM data (including those without journal data)
    for (const navEntry of navRouteData) {
      const key = navEntry.StarSystem?.toLowerCase()
      const cached = global.CACHE.SYSTEMS[key]
      if (!cached?.bodies?.length) continue

      const sysStarPos = navEntry.StarPos ?? null
      this._addPredictedSpecies(cached.bodies, sysStarPos)
    }

    const route = []
    for (let index = 0; index < navRouteData.length; index++) {
      const system = navRouteData[index]
      const distanceToHop = currentPosition ? distance(currentPosition, system.StarPos) : null
      const isCurrentSystem = (system?.StarSystem?.toLowerCase() === currentSystemName?.toLowerCase())

      if (isCurrentSystem) {
        inSystemOnRoute = true
        jumpsToDestination = 0
      } else if (jumpsToDestination !== null) {
        jumpsToDestination++
      }

      // Check in-memory cache for previously fetched EDSM data
      const cached = global.CACHE.SYSTEMS[system.StarSystem.toLowerCase()]
      const edsmBodies = cached?.bodies ?? []
      const expectedBodyCount = cached?.bodyCount ?? null
      const totalBodiesKnown = edsmBodies.length
      const hasEdsmData = totalBodiesKnown > 0 || expectedBodyCount > 0

      // Determine body status
      let bodyStatus = 'unknown'
      let bodyStatusText = 'No data'
      let scanProgress = null
      let bodyValue = 0
      let bioValue = 0
      let valuableBodies = 0
      let valuableBiologicals = 0
      let discoverer = null
      let ingameDiscoverer = null

      if (hasEdsmData) {
        const result = getSystemValue(edsmBodies, SPECIES_REWARDS, {
          minBodyValue: options.minBodyValue,
          minBioValue: options.minBioValue,
          includeNonValuable: options.includeNonValuable,
          bodyCount: expectedBodyCount
        })
        if (result) {
          bodyValue = result.bodyValue
          bioValue = result.bioValue
          valuableBodies = result.valuableBodies
          valuableBiologicals = result.valuableBiologicals
        }

        // Detect partial vs complete scan using EDSM bodyCount
        // bodyCount = total bodies in system (from FSS honk), bodies.length = bodies with data in EDSM
        if (expectedBodyCount && totalBodiesKnown < expectedBodyCount) {
          bodyStatus = 'partial'
          bodyStatusText = `${totalBodiesKnown}/${expectedBodyCount} scanned`
        } else if (totalBodiesKnown > 0) {
          bodyStatus = 'complete'
          bodyStatusText = `${totalBodiesKnown} bodies`
        } else {
          // bodyCount known but no individual body data submitted
          bodyStatus = 'partial'
          bodyStatusText = `0/${expectedBodyCount} scanned`
        }

        // EDSM discoverer = first person to submit system to EDSM
        const mainStar = edsmBodies.find(b => b.isMainStar === true)
        const edsmDiscoverer = mainStar?.discovery?.commander ?? null

        // In-game discoverer: check if the player has journal Scan data and WasDiscovered flag
        // WasDiscovered=false means the current CMDR is the first in-game discoverer
        let ingameDiscoverer = null
        if (isCurrentSystem) {
          const mainStarScan = await this.eliteLog._query({ event: 'Scan', BodyName: mainStar?.name }, 1)
          if (mainStarScan?.[0]) {
            ingameDiscoverer = mainStarScan[0].WasDiscovered === false ? cmdrName : null
          }
        }

        discoverer = edsmDiscoverer
      }

      // Scoopable star classes: KGB FOAM
      const isScoopable = /^[KGBFOAM]/.test(system.StarClass)

      route.push({
        jumpNumber: index,
        system: system.StarSystem,
        address: system.SystemAddress,
        position: system.StarPos,
        starClass: system.StarClass,
        isScoopable,
        distance: distanceToHop,
        isCurrentSystem,
        bodyStatus,
        bodyStatusText,
        bodyCount: totalBodiesKnown,
        scanProgress,
        bodyValue,
        bioValue,
        valuableBodies,
        valuableBiologicals,
        discoverer,
        ingameDiscoverer,
        isPlayerDiscoverer: (discoverer && cmdrName && discoverer.toLowerCase() === cmdrName.toLowerCase()) ||
          (ingameDiscoverer && cmdrName && ingameDiscoverer.toLowerCase() === cmdrName.toLowerCase())
      })
    }

    return {
      currentSystem: { name: currentSystemName, position: currentPosition },
      cmdrName,
      destination: route?.[route.length - 1] ?? null,
      jumpsToDestination,
      route,
      inSystemOnRoute
    }
  }

  async getExplorationSystem (options = {}) {
    // Get current location
    const Location = await this.eliteLog.getEvent('Location')
    const FSDJump = Location
      ? (await this.eliteLog.getEventsFromTimestamp('FSDJump', Location.timestamp, 1))?.[0]
      : null
    const locationEvent = FSDJump || Location

    const currentSystemName = locationEvent?.StarSystem ?? UNKNOWN_VALUE
    const currentStarPos = locationEvent?.StarPos ?? null

    if (!currentSystemName || currentSystemName === UNKNOWN_VALUE) {
      return { name: UNKNOWN_VALUE, bodies: [] }
    }

    // Get commander name
    const LoadGame = await this.eliteLog.getEvent('LoadGame')
    const cmdrName = LoadGame?.Commander ?? null

    // Fetch EDSM body data (reuses cache)
    await fetchBodiesForSystems([currentSystemName])
    const key = currentSystemName.toLowerCase()
    const cached = global.CACHE.SYSTEMS[key]

    if (!cached) {
      return { name: currentSystemName, cmdrName, bodies: [], bodyCount: 0 }
    }

    if (!cached.bodies) cached.bodies = []

    // Enrich with journal data (discovery status, bio signals, mass, etc.)
    await this._enrichBodiesWithJournalData(cached.bodies, currentSystemName, currentStarPos)

    // Get body count from FSS honk
    const journalInfo = await this._getJournalDiscoveryInfo(currentSystemName)
    const bodyCount = journalInfo.bodyCount ?? cached.bodies.length

    // Run bio-predictor
    this._addPredictedSpecies(cached.bodies, currentStarPos)

    // Calculate per-body values and build response
    const bodies = cached.bodies.map(body => {
      const bodyType = body.subType || body.type || body.group
      const isTerraformable = (
        body.terraformingState === 'Candidate for terraforming' ||
        body.terraformingState === 'Terraformable' ||
        body.terraformingState === 'Being terraformed' ||
        body.terraformingState === 'Terraformed'
      )
      const mass = body.earthMasses ?? body.solarMasses ?? 1
      const isFirstDiscoverer = body._isFirstDiscoverer ?? false
      const isFirstMapped = body._isFirstMapped ?? false
      const isStar = isStarClass(bodyType)

      // Cartographic value (mapped with efficiency bonus = best case)
      const mappedValue = getBodyValue({
        bodyType,
        isTerraformable,
        mass,
        isFirstDiscoverer,
        isMapped: !isStar,
        isFirstMapped,
        withEfficiencyBonus: true
      })

      // Bio value
      const bioSignals = body.signals?.biological ?? 0
      const isFirstFootfall = isFirstDiscoverer
      const knownSpecies = body._knownSpecies ?? []
      const predictedSpecies = body._predictedSpecies ?? null
      const confirmedGenuses = body.biologicalGenuses ?? null
      const bioValue = bioSignals > 0
        ? getExpectedBioValue(bioSignals, isFirstFootfall, knownSpecies, predictedSpecies, SPECIES_REWARDS, confirmedGenuses)
        : 0

      // Build species detail for bio breakdown
      let speciesDetail = null
      if (bioSignals > 0 && (predictedSpecies || knownSpecies.length > 0)) {
        speciesDetail = []

        // Add confirmed species first
        for (const sp of knownSpecies) {
          speciesDetail.push({
            genus: sp.genus,
            species: sp.species,
            reward: sp.reward,
            isConfirmed: true,
            probability: 100
          })
        }

        // Add predicted species (not yet confirmed)
        if (predictedSpecies) {
          const knownGenera = new Set(knownSpecies.map(s => s.genus?.toLowerCase()))

          // When DSS genera are confirmed, recalculate probabilities per genus:
          // - Genus with 1 predicted species → 100%
          // - Genus with N predicted species → proportional by hitCount within that genus
          const hasDssGenera = (confirmedGenuses?.length > 0)
          let genusProbabilities = null
          if (hasDssGenera) {
            // Group predictions by genus and compute intra-genus probabilities
            const genusGroups = new Map()
            for (const pred of predictedSpecies) {
              const gk = pred.genus?.toLowerCase()
              if (knownGenera.has(gk)) continue
              if (!genusGroups.has(gk)) genusGroups.set(gk, [])
              genusGroups.get(gk).push(pred)
            }
            genusProbabilities = new Map()
            for (const [gk, members] of genusGroups) {
              if (members.length === 1) {
                genusProbabilities.set(`${members[0].genus}|${members[0].species}`, 100)
              } else {
                const genusTotal = members.reduce((s, m) => s + (m.hitCount || 1), 0)
                for (const m of members) {
                  const pct = genusTotal > 0
                    ? Math.round(((m.hitCount || 1) / genusTotal) * 1000) / 10
                    : Math.round(1000 / members.length) / 10
                  genusProbabilities.set(`${m.genus}|${m.species}`, pct)
                }
              }
            }
          }

          for (const pred of predictedSpecies) {
            if (knownGenera.has(pred.genus?.toLowerCase())) continue
            const fullName = `${pred.genus} ${pred.species}`
            const reward = SPECIES_REWARDS[fullName] ?? SPECIES_REWARDS[pred.species] ?? 0
            const probability = genusProbabilities
              ? (genusProbabilities.get(`${pred.genus}|${pred.species}`) ?? Math.round(pred.probability * 10) / 10)
              : Math.round(pred.probability * 10) / 10
            speciesDetail.push({
              genus: pred.genus,
              species: pred.species,
              reward,
              isConfirmed: false,
              probability
            })
          }
        }
      }

      // EDSM discoverer
      const edsmDiscoverer = body.discovery?.commander ?? null

      return {
        name: body.name,
        bodyId: body.bodyId,
        type: body.type,
        subType: bodyType,
        isStar,
        isMainStar: body.isMainStar ?? false,
        isLandable: body.isLandable ?? false,
        isTerraformable,
        distanceToArrival: body.distanceToArrival,
        gravity: body.gravity,
        surfaceTemperature: body.surfaceTemperature,
        atmosphereType: body.atmosphereType,
        atmosphereComposition: body.atmosphereComposition,
        volcanismType: body.volcanismType,
        rings: body.rings,
        signals: body.signals,
        earthMasses: body.earthMasses,
        solarMasses: body.solarMasses,
        mappedValue,
        bioValue,
        bioSignals,
        speciesDetail,
        isFirstDiscoverer,
        isFirstMapped,
        wasScanned: body._wasScanned ?? false,
        wasMapped: body._wasMapped ?? false,
        edsmDiscoverer,
        biologicalGenuses: body.biologicalGenuses,
        parents: body.parents
      }
    })

    // Sort: stars first (main star at top), then planets by distance
    bodies.sort((a, b) => {
      if (a.isMainStar && !b.isMainStar) return -1
      if (!a.isMainStar && b.isMainStar) return 1
      if (a.isStar && !b.isStar) return -1
      if (!a.isStar && b.isStar) return 1
      return (a.distanceToArrival ?? 0) - (b.distanceToArrival ?? 0)
    })

    // System-level totals
    const systemValue = getSystemValue(cached.bodies, SPECIES_REWARDS, {
      bodyCount,
      minBodyValue: options.minBodyValue,
      minBioValue: options.minBioValue,
      includeNonValuable: options.includeNonValuable
    })

    return {
      name: currentSystemName,
      cmdrName,
      bodyCount,
      bodiesFound: cached.bodies.length,
      bodies,
      systemValue
    }
  }
}

module.exports = Exploration
