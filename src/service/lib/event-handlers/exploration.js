const distance = require('../../../shared/distance')
const { getBodyValue, getExpectedBioValue, getSystemValue, isStarClass, GENUS_MAX_VALUES, normalizeDssGenus, _bayesianGenusWeights, FIRST_FOOTFALL_MULTIPLIER } = require('../exploration-value')
const { UNKNOWN_VALUE } = require('../../../shared/consts')
const EDSM = require('../edsm')
const { predictSpecies } = require('../bio-predictor')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Persistent file for bio scan positions so they survive app restarts
const BIO_POSITIONS_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'DAEDALUS Terminal'
)
const BIO_POSITIONS_FILE = path.join(BIO_POSITIONS_DIR, 'bio-scan-positions.json')

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

function getJumpFuelUse (hopDistance, shipMass, jumpProfile) {
  if (!Number.isFinite(hopDistance) || hopDistance <= 0) return 0
  // The Guardian FSD Booster provides free range that doesn't consume fuel.
  // Subtract it so only the FSD-powered portion is costed.
  const fsdDistance = Math.max(hopDistance - (jumpProfile.guardianBoosterRange || 0), 0)
  if (fsdDistance <= 0) return 0
  return jumpProfile.fuelMultiplier * Math.pow((fsdDistance * shipMass) / jumpProfile.optimalMass, jumpProfile.fuelPower)
}

function projectRouteFuel (route, jumpProfile, currentSystemName) {
  if (!jumpProfile || route.length === 0) {
    return { route, fuelRunOutSystem: null }
  }

  let remainingFuel = jumpProfile.availableFuel
  let currentMass = jumpProfile.currentMass
  let fuelRunOutSystem = null
  let fuelRunOutIndex = null

  const currentIndex = route.findIndex(entry => entry.isCurrentSystem)
  const projectedRoute = route.map((entry, index) => {
    if (index !== currentIndex) return entry
    return {
      ...entry,
      fuelRemaining: parseFloat(remainingFuel.toFixed(2))
    }
  })

  for (let index = currentIndex === -1 ? 0 : currentIndex + 1; index < projectedRoute.length; index++) {
    const entry = projectedRoute[index]
    const fuelRequired = getJumpFuelUse(entry.hopDistance, currentMass, jumpProfile)
    const canReach =
      Number.isFinite(fuelRequired) &&
      fuelRequired <= jumpProfile.maxFuelPerJump + 1e-6 &&
      fuelRequired <= remainingFuel + 1e-6

    if (!canReach) {
      fuelRunOutSystem = index === 0
        ? currentSystemName
        : projectedRoute[index - 1]?.system ?? currentSystemName
      fuelRunOutIndex = index === 0 ? null : index - 1
      break
    }

    remainingFuel = Math.max(remainingFuel - fuelRequired, 0)
    currentMass = jumpProfile.dryMass + remainingFuel
    projectedRoute[index] = {
      ...entry,
      fuelRequiredFromPrevious: parseFloat(fuelRequired.toFixed(2)),
      fuelRemaining: parseFloat(remainingFuel.toFixed(2))
    }
  }

  if (fuelRunOutIndex != null) {
    projectedRoute[fuelRunOutIndex] = {
      ...projectedRoute[fuelRunOutIndex],
      fuelRunsOutHere: true
    }
  }

  return { route: projectedRoute, fuelRunOutSystem }
}

// Colony exclusion radius (meters) per genus — from SRVSurvey
const GENUS_COLONY_DISTANCE = {
  Fumerola: 100,
  Aleoida: 150, Clypeus: 150, Concha: 150, Frutexa: 150, Recepta: 150,
  Tussock: 200,
  Cactoida: 300, Fungoida: 300,
  Bacterium: 500, Fonticulua: 500, Stratum: 500,
  Osseus: 800, Tubus: 800,
  Electricae: 1000,
  'Amphora Plant': 100, Anemone: 100, 'Bark Mounds': 100,
  'Brain Tree': 100, 'Crystalline Shards': 100, 'Sinuous Tubers': 100,
  Radicoida: 15
}
const DEFAULT_COLONY_DISTANCE = 50

// Codex image lookup (english_name → image URL)
let _codexImages = null
function getCodexImages () {
  if (!_codexImages) {
    try { _codexImages = require('../codex-images.json') } catch (e) { _codexImages = {} }
  }
  return _codexImages
}

let _codexDescriptions = null
function getCodexDescriptions () {
  if (!_codexDescriptions) {
    try { _codexDescriptions = require('../codex-descriptions.json') } catch (e) { _codexDescriptions = {} }
  }
  return _codexDescriptions
}

class Exploration {
  constructor ({ eliteLog, eliteJson, system, shipStatus }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
    this.system = system
    this.shipStatus = shipStatus

    // In-memory bio scan position store: key = 'bodyId:species:scanType' → { lat, lon }
    // Captured in real-time from Status.json when ScanOrganic events fire
    // Persisted to disk so positions survive app restarts
    this._bioScanPositions = this._loadBioPositions()

    // Ship position — recorded on Disembark, cleared on Embark
    this._shipPosition = null

    // Cache for getExplorationBiologicals — avoids re-running heavy DB queries
    // and prediction pipeline on every 500ms poll.  Only position data from
    // Status.json changes at high frequency; the rest only changes on journal events.
    this._bioCache = null
    this._bioCacheDirty = true
  }

  /** Mark getExplorationBiologicals cache as stale so the next call recomputes. */
  invalidateBioCache () {
    this._bioCacheDirty = true
  }

  /** Load bio scan positions from disk (returns {} on any failure). */
  _loadBioPositions () {
    try {
      if (fs.existsSync(BIO_POSITIONS_FILE)) {
        return JSON.parse(fs.readFileSync(BIO_POSITIONS_FILE, 'utf8'))
      }
    } catch (e) {
      console.error('Failed to load bio scan positions:', e.message)
    }
    return {}
  }

  /** Persist bio scan positions to disk. */
  _saveBioPositions () {
    try {
      if (!fs.existsSync(BIO_POSITIONS_DIR)) fs.mkdirSync(BIO_POSITIONS_DIR, { recursive: true })
      fs.writeFileSync(BIO_POSITIONS_FILE, JSON.stringify(this._bioScanPositions))
    } catch (e) {
      console.error('Failed to save bio scan positions:', e.message)
    }
  }

  // Called by event-handlers.js when a Disembark event fires
  async onDisembark (logEvent) {
    const StatusJson = (await this.eliteJson.json()).Status
    if (!StatusJson || StatusJson.Latitude == null || StatusJson.Longitude == null) return
    this._shipPosition = { lat: StatusJson.Latitude, lon: StatusJson.Longitude }
    this._bioCacheDirty = true
  }

  // Called by event-handlers.js when an Embark event fires
  onEmbark () {
    this._shipPosition = null
    this._bioCacheDirty = true
  }

  // Called by event-handlers.js when a ScanOrganic event fires in real-time
  async onScanOrganic (logEvent) {
    this._bioCacheDirty = true
    const StatusJson = (await this.eliteJson.json()).Status
    if (!StatusJson || StatusJson.Latitude == null || StatusJson.Longitude == null) return

    const bodyId = logEvent.Body
    const species = logEvent.Species_Localised || logEvent.Species || ''
    const scanType = logEvent.ScanType // Log, Sample, Analyse
    const genus = logEvent.Genus_Localised || (species).split(' ')[0]
    const variant = logEvent.Variant_Localised || ''

    const key = `${bodyId}:${species}`
    if (!this._bioScanPositions[key]) {
      this._bioScanPositions[key] = {
        genus,
        species,
        variant,
        bodyId,
        scans: []
      }
    }

    this._bioScanPositions[key].scans.push({
      scanType,
      lat: StatusJson.Latitude,
      lon: StatusJson.Longitude,
      timestamp: logEvent.timestamp
    })

    // When scan is complete (Analyse), clear the exclusion zone positions
    // so the radar no longer shows zones for this finished organism
    if (scanType === 'Analyse') {
      delete this._bioScanPositions[key]
    }

    this._saveBioPositions()
  }

  // For the current system, merge journal data onto EDSM bodies to get
  // accurate discovery/map status, bio signals, and fill in missing bodies.
  // Journal data is more accurate than EDSM for the current system since
  // we have first-hand Scan events with exact mass/type/discovery status.
  async _enrichBodiesWithJournalData (bodies, systemName, starPos) {
    // Build a set of known body names for quick lookup
    const knownBodies = new Set(bodies.map(b => b.name?.toLowerCase()))

    // --- Phase 1: Batch-fetch all journal events we need ---
    // Get all journal scans for the system first (needed for both enrichment and journal-only bodies)
    const journalScans = await this.eliteLog._query({ event: 'Scan', StarSystem: systemName })

    // Build a scan lookup by body name (most recent scan per body)
    const scanByName = {}
    for (const scan of journalScans) {
      if (scan.BodyName) scanByName[scan.BodyName] = scan
    }

    // Collect ALL body names (EDSM + journal-only) for batch queries
    const allBodyNames = [...new Set([
      ...bodies.map(b => b.name).filter(Boolean),
      ...journalScans.map(s => s.BodyName).filter(Boolean)
    ])]

    // Get SystemAddress for the current system to scope ScanOrganic queries
    // (body IDs repeat across systems — unfiltered queries cause cross-system contamination)
    const systemScan = journalScans.find(s => s.SystemAddress != null)
    const sysAddress = systemScan?.SystemAddress ?? null
    const organicQuery = sysAddress
      ? { event: 'ScanOrganic', SystemAddress: sysAddress }
      : { event: 'ScanOrganic' }

    // Batch-fetch signal and mapping data for all bodies at once
    const [allFSSBodySignals, allSAASignalsFound, allSAAScanComplete, allScanOrganic] = await Promise.all([
      this.eliteLog._query({ event: 'FSSBodySignals', BodyName: { $in: allBodyNames } }),
      this.eliteLog._query({ event: 'SAASignalsFound', BodyName: { $in: allBodyNames } }),
      this.eliteLog._query({ event: 'SAAScanComplete', BodyName: { $in: allBodyNames } }),
      this.eliteLog._query(organicQuery)
    ])

    // Build lookup maps
    const fssMap = {}
    for (const e of allFSSBodySignals) { fssMap[e.BodyName] = e }
    const saaMap = {}
    for (const e of allSAASignalsFound) { saaMap[e.BodyName] = e }
    const saaScanCompleteSet = new Set(allSAAScanComplete.map(e => e.BodyName))
    const organicByBody = {}
    for (const e of allScanOrganic) {
      if (!organicByBody[e.Body]) organicByBody[e.Body] = []
      organicByBody[e.Body].push(e)
    }

    // --- Phase 2: Enrich existing EDSM bodies with journal data ---
    for (const body of bodies) {
      if (!body.signals) {
        body.signals = { geological: 0, biological: 0, human: 0 }
      }

      body._isFirstDiscoverer = false
      body._isFirstMapped = false

      const scan = scanByName[body.name]
      body._wasScanned = !!scan
      if (scan) {
        if (scan.MassEM > 0) body.earthMasses = scan.MassEM
        if (scan.StellarMass > 0) body.solarMasses = scan.StellarMass

        const isNavBeacon = scan.ScanType === 'NavBeaconDetail'
        body._isFirstDiscoverer = !isNavBeacon && scan.WasDiscovered === false
        body._isFirstMapped = !isNavBeacon && scan.WasMapped === false

        if (scan.SurfaceGravity) body.gravity = scan.SurfaceGravity / 9.81
        if (scan.SurfaceTemperature) body.surfaceTemperature = scan.SurfaceTemperature
        if (scan.SurfacePressure != null) body.surfacePressure = scan.SurfacePressure / 101325
        if (scan.AtmosphereType) body.atmosphereType = scan.AtmosphereType
        else if (scan.Atmosphere) body.atmosphereType = scan.Atmosphere.replace(/ atmosphere$/i, '')
        if (scan.Volcanism) body.volcanismType = scan.Volcanism || 'No volcanism'
        if (scan.AtmosphereComposition) {
          body.atmosphereComposition = Object.fromEntries(
            scan.AtmosphereComposition.map(c => [c.Name, c.Percent])
          )
        }
        if (scan.Materials) {
          body.materials = Object.fromEntries(
            scan.Materials.map(m => [m.Name, m.Percent])
          )
        }
        if (scan.Parents) body.parents = scan.Parents
        if (scan.SemiMajorAxis != null) body.semiMajorAxis = scan.SemiMajorAxis / 149597870700
      }

      // Merge FSSBodySignals (honk-level signal data)
      const fssEntry = fssMap[body.name]
      if (fssEntry?.Signals) {
        for (const signal of fssEntry.Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
        }
      }

      // Merge SAASignalsFound (DSS-level signal data, more detailed)
      const saaEntry = saaMap[body.name]
      body._wasMapped = !!saaEntry
      if (!body._wasMapped && saaScanCompleteSet.has(body.name)) body._wasMapped = true
      if (saaEntry?.Signals) {
        for (const signal of saaEntry.Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') body.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') body.signals.geological = signal?.Count ?? 0
        }
      }
      if (saaEntry?.Genuses?.length > 0) {
        body.biologicalGenuses = saaEntry.Genuses
          .map(g => g.Genus_Localised || g.Genus)
          .filter(Boolean)
      }

      // Check for confirmed biological species (ScanOrganic with Analyse scan type)
      this._addKnownSpecies(body, organicByBody)
    }

    // --- Phase 3: Add bodies found in journal Scan events but not in EDSM ---
    for (const scan of journalScans) {
      if (!scan.BodyName || knownBodies.has(scan.BodyName.toLowerCase())) continue
      knownBodies.add(scan.BodyName.toLowerCase())

      const isNavBeacon = scan.ScanType === 'NavBeaconDetail'
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
        _isFirstDiscoverer: !isNavBeacon && scan.WasDiscovered === false,
        _isFirstMapped: !isNavBeacon && scan.WasMapped === false,
        _wasScanned: true,
        signals: { geological: 0, biological: 0, human: 0 },
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

      // Use pre-fetched signal data (already batch-queried above)
      const fssEntry = fssMap[scan.BodyName]
      if (fssEntry?.Signals) {
        for (const signal of fssEntry.Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') journalBody.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') journalBody.signals.geological = signal?.Count ?? 0
        }
      }

      const saaEntry = saaMap[scan.BodyName]
      journalBody._wasMapped = !!saaEntry
      if (!journalBody._wasMapped && saaScanCompleteSet.has(scan.BodyName)) journalBody._wasMapped = true
      if (saaEntry?.Signals) {
        for (const signal of saaEntry.Signals) {
          if (signal?.Type === '$SAA_SignalType_Biological;') journalBody.signals.biological = signal?.Count ?? 0
          if (signal?.Type === '$SAA_SignalType_Geological;') journalBody.signals.geological = signal?.Count ?? 0
        }
      }
      if (saaEntry?.Genuses?.length > 0) {
        journalBody.biologicalGenuses = saaEntry.Genuses
          .map(g => g.Genus_Localised || g.Genus)
          .filter(Boolean)
      }

      this._addKnownSpecies(journalBody, organicByBody)

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

  // Look up confirmed biological species on a body from pre-fetched ScanOrganic events
  _addKnownSpecies (body, organicByBody) {
    const scans = organicByBody[body.bodyId]
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

      const reward = SPECIES_REWARDS[speciesName] ?? UNKNOWN_VALUE
      // Strip genus prefix from species name — the client prepends genus separately
      const speciesEpithet = speciesName.startsWith(genus + ' ')
        ? speciesName.slice(genus.length + 1)
        : speciesName
      knownSpecies.push({ genus, species: speciesEpithet, reward })
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
      const previousPosition = index > 0 ? navRouteData[index - 1]?.StarPos : currentPosition
      const hopDistance = previousPosition ? distance(previousPosition, system.StarPos) : null
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
      let bodyValueExtracted = 0
      let bioValueExtracted = 0
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
          valuableBodies = result.valuableBodies
          valuableBiologicals = result.valuableBiologicals
        }

        // Compute extracted values — what the player has already locked in
        // from scanning (stars) and mapping (planets) + confirmed bio species.
        //
        // When includeNonValuable is OFF:
        //   - Scanned non-valuable bodies/species STILL count in both extracted
        //     AND possible (the player already did the work, so show it)
        //   - Unscanned non-valuables are excluded from both totals
        // This requires a route-specific "possible" total that differs from the
        // generic getSystemValue result when some non-valuables were scanned.
        const minBodyValue = options.minBodyValue ?? 1000000
        const minBioValue = options.minBioValue ?? 7000000
        const includeNonValuable = options.includeNonValuable !== false

        // Reset possible totals — we recompute them here to honour the
        // "scanned non-valuables always count" rule for route display
        bodyValue = 0
        bioValue = 0

        for (const body of edsmBodies) {
          const bType = body.subType || body.type || body.group
          const bTerraformable = (
            body.terraformingState === 'Candidate for terraforming' ||
            body.terraformingState === 'Terraformable' ||
            body.terraformingState === 'Being terraformed' ||
            body.terraformingState === 'Terraformed'
          )
          const bMass = body.earthMasses ?? body.solarMasses ?? 1
          const bStar = isStarClass(bType)
          const bFirstDisc = body._isFirstDiscoverer ?? false
          const bFirstMap = body._isFirstMapped ?? false

          // Stars count as extracted if scanned, planets if DSS mapped
          const isBodyExtracted = bStar ? (body._wasScanned ?? false) : (body._wasMapped ?? false)
          const val = getBodyValue({
            bodyType: bType,
            isTerraformable: bTerraformable,
            mass: bMass,
            isFirstDiscoverer: bFirstDisc,
            isMapped: !bStar,
            isFirstMapped: bFirstMap,
            withEfficiencyBonus: true
          })
          const isValuableBody = val >= minBodyValue

          // Include in possible total if valuable OR already scanned (always counts)
          if (includeNonValuable || isValuableBody || isBodyExtracted) {
            bodyValue += val
          }
          if (isBodyExtracted) {
            // Extracted = the player scanned/mapped it, always counts
            bodyValueExtracted += val
          }

          // Biological value
          const bioSignals = body.signals?.biological ?? 0
          if (bioSignals > 0) {
            const isFirstFootfall = body._isFirstDiscoverer ?? false
            const knownSpecies = body._knownSpecies ?? []
            const predictedSpecies = body._predictedSpecies ?? null
            const confirmedGenuses = body.biologicalGenuses ?? null
            const bodyBioValue = getExpectedBioValue(bioSignals, isFirstFootfall, knownSpecies, predictedSpecies, SPECIES_REWARDS, confirmedGenuses)

            const isValuableBio = bodyBioValue >= minBioValue
            const hasBioExtracted = knownSpecies.length > 0

            // Include in possible total if valuable OR has confirmed species
            if (includeNonValuable || isValuableBio || hasBioExtracted) {
              bioValue += bodyBioValue
            }

            // Extracted bio = only fully confirmed (analysed) species
            if (hasBioExtracted) {
              const ffMult = isFirstFootfall ? 5 : 1
              bioValueExtracted += knownSpecies.reduce((s, sp) => s + sp.reward * ffMult, 0)
            }
          }
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
        hopDistance,
        isCurrentSystem,
        bodyStatus,
        bodyStatusText,
        bodyCount: totalBodiesKnown,
        scanProgress,
        bodyValue,
        bioValue,
        bodyValueExtracted,
        bioValueExtracted,
        valuableBodies,
        valuableBiologicals,
        discoverer,
        ingameDiscoverer,
        isPlayerDiscoverer: (discoverer && cmdrName && discoverer.toLowerCase() === cmdrName.toLowerCase()) ||
          (ingameDiscoverer && cmdrName && ingameDiscoverer.toLowerCase() === cmdrName.toLowerCase())
      })
    }

    const fuelProjection = projectRouteFuel(route, await this.shipStatus?.getJumpProfile(), currentSystemName)

    return {
      currentSystem: { name: currentSystemName, position: currentPosition },
      cmdrName,
      destination: route?.[route.length - 1] ?? null,
      jumpsToDestination,
      route: fuelProjection.route,
      inSystemOnRoute,
      fuelRunOutSystem: fuelProjection.fuelRunOutSystem
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

    // Calculate per-body values and build response (filter out belt clusters)
    const bodies = cached.bodies.filter(body => !body.name?.includes('Belt Cluster')).map(body => {
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
      const bioValueTotal = bioSignals > 0
        ? getExpectedBioValue(bioSignals, isFirstFootfall, knownSpecies, predictedSpecies, SPECIES_REWARDS, confirmedGenuses)
        : 0

      // Build species detail for bio breakdown
      let speciesDetail = null
      const ffMultiplier = isFirstFootfall ? FIRST_FOOTFALL_MULTIPLIER : 1
      if (bioSignals > 0 && (predictedSpecies || knownSpecies.length > 0)) {
        speciesDetail = []

        // Add confirmed species first (actually scanned via Analyse)
        for (const sp of knownSpecies) {
          speciesDetail.push({
            genus: sp.genus,
            species: sp.species,
            reward: sp.reward * ffMultiplier,
            isConfirmed: true,
            isScanned: true,
            probability: 100
          })
        }

        // Add predicted species (not yet confirmed)
        if (predictedSpecies) {
          const knownGenera = new Set(knownSpecies.map(s => s.genus?.toLowerCase()))

          // Count remaining signal slots and unique predicted genera (excluding already-confirmed genera)
          const remainingSlots = bioSignals - knownSpecies.length
          const unconfirmedPredGenera = new Set()
          for (const pred of predictedSpecies) {
            const gk = pred.genus?.toLowerCase()
            if (!knownGenera.has(gk)) unconfirmedPredGenera.add(gk)
          }

          // Group predictions by genus (excluding already-confirmed genera)
          const genusGroups = new Map()
          for (const pred of predictedSpecies) {
            const gk = pred.genus?.toLowerCase()
            if (knownGenera.has(gk)) continue
            if (!genusGroups.has(gk)) genusGroups.set(gk, [])
            genusGroups.get(gk).push(pred)
          }

          // Recalculate display probabilities using Bayesian conditioning.
          // We know exactly `remainingSlots` genera must be present from the signal count.
          // _bayesianGenusWeights computes P(genus_i present | exactly N genera present)
          // accounting for each genus's raw probability. When genera ≤ slots, all are 100%.
          // Within each genus, species probabilities are proportional by hitCount.
          const allGeneraGuaranteed = (confirmedGenuses?.length > 0) ||
            (remainingSlots > 0 && unconfirmedPredGenera.size <= remainingSlots)

          let genusProbabilities = new Map()
          if (allGeneraGuaranteed && remainingSlots > 0) {
            // Build genus-level probability inputs for Bayesian weighting
            const genusEntries = []
            for (const [gk, members] of genusGroups) {
              // Genus-level probability = sum of species probabilities (capped at 100)
              const genusProbability = Math.min(members.reduce((s, m) => s + (m.probability ?? 0), 0), 100)
              genusEntries.push({ gk, members, genusProbability })
            }

            // Compute Bayesian conditional probability per genus
            const bayesWeights = _bayesianGenusWeights(
              genusEntries.map(e => ({ genusProbability: e.genusProbability })),
              remainingSlots
            )

            for (let i = 0; i < genusEntries.length; i++) {
              const { members } = genusEntries[i]
              const genusWeight = bayesWeights[i] // 0–1 conditional probability that genus is present
              const genusWeightPct = Math.round(genusWeight * 1000) / 10 // as percentage

              if (members.length === 1) {
                // Sole species in genus — its probability equals the genus probability
                genusProbabilities.set(`${members[0].genus}|${members[0].species}`, genusWeightPct)
              } else {
                // Multiple species — distribute genus probability by hitCount
                const genusTotal = members.reduce((s, m) => s + (m.hitCount || 1), 0)
                for (const m of members) {
                  const speciesFraction = genusTotal > 0 ? (m.hitCount || 1) / genusTotal : 1 / members.length
                  const pct = Math.round(genusWeightPct * speciesFraction * 10) / 10
                  genusProbabilities.set(`${m.genus}|${m.species}`, pct)
                }
              }
            }
          }

          for (const pred of predictedSpecies) {
            if (knownGenera.has(pred.genus?.toLowerCase())) continue
            const fullName = `${pred.genus} ${pred.species}`
            const reward = SPECIES_REWARDS[fullName] ?? SPECIES_REWARDS[pred.species] ?? 0
            const probability = genusProbabilities.has(`${pred.genus}|${pred.species}`)
              ? genusProbabilities.get(`${pred.genus}|${pred.species}`)
              : Math.round(pred.probability * 10) / 10
            speciesDetail.push({
              genus: pred.genus,
              species: pred.species,
              reward: reward * ffMultiplier,
              isConfirmed: probability >= 100,
              isScanned: false,
              probability
            })
          }
        }
      }

      // EDSM discoverer
      const edsmDiscoverer = body.discovery?.commander ?? null

      // When includeNonValuable is off, the displayed bio value should only sum valuable species,
      // weighted by probability for unconfirmed predictions (expected average outcome).
      const minBioValue = options.minBioValue ?? 7000000
      const includeNonValuable = options.includeNonValuable !== false
      let bioValue = bioValueTotal
      if (!includeNonValuable && speciesDetail && speciesDetail.length > 0) {
        bioValue = speciesDetail
          .filter(sp => sp.reward >= minBioValue)
          .reduce((sum, sp) => sum + sp.reward * (sp.isConfirmed ? 1 : sp.probability / 100), 0)
      }

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

    // Override systemValue.bioValue with the sum of per-body bioValues, which
    // filter individual species against minBioValue when includeNonValuable is off.
    // getSystemValue checks body-level totals against the threshold, but the per-body
    // handler filters per-species, so we use the per-body values for consistency.
    if (systemValue) {
      const filteredBioTotal = bodies.reduce((sum, b) => sum + (b.bioValue || 0), 0)
      systemValue.total = systemValue.total - systemValue.bioValue + filteredBioTotal
      systemValue.bioValue = filteredBioTotal
    }

    // Adjust body counts to exclude belt clusters (consistent with filtered body list)
    const beltClusterCount = cached.bodies.filter(b => b.name?.includes('Belt Cluster')).length

    return {
      name: currentSystemName,
      cmdrName,
      bodyCount: bodyCount - beltClusterCount,
      bodiesFound: bodies.length,
      bodies,
      systemValue,
      minBodyValue: options.minBodyValue ?? 1000000,
      minBioValue: options.minBioValue ?? 7000000
    }
  }

  // --- Biologicals tracking ---

  // Haversine distance on a sphere (lat/lon in degrees, radius in meters)
  _surfaceDistance (lat1, lon1, lat2, lon2, planetRadius) {
    const toRad = Math.PI / 180
    const dLat = (lat2 - lat1) * toRad
    const dLon = (lon2 - lon1) * toRad
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
    return 2 * planetRadius * Math.asin(Math.min(1, Math.sqrt(a)))
  }

  async getExplorationBiologicals () {
    // 1. Get current player position from Status.json (always fresh)
    const StatusJson = (await this.eliteJson.json()).Status
    const playerLat = StatusJson?.Latitude ?? null
    const playerLon = StatusJson?.Longitude ?? null
    const planetRadius = StatusJson?.PlanetRadius ?? null
    const heading = StatusJson?.Heading ?? null
    const altitude = StatusJson?.Altitude ?? null
    const bodyName = StatusJson?.BodyName ?? null

    // 2. If the cache is valid and the body hasn't changed, return cached
    //    bio data overlaid with fresh position.  This avoids ~10 DB queries
    //    and the full prediction pipeline on every 500ms poll.
    if (this._bioCache && !this._bioCacheDirty && this._bioCache.bodyName === bodyName) {
      return {
        ...this._bioCache,
        planetRadius,
        player: { lat: playerLat, lon: playerLon, heading, altitude },
        shipPosition: this._shipPosition
      }
    }

    // 3. Cache miss — full recompute
    this._bioCacheDirty = false

    // Get current system from journal
    const Location = await this.eliteLog.getEvent('Location')
    const FSDJump = Location
      ? (await this.eliteLog.getEventsFromTimestamp('FSDJump', Location.timestamp, 1))?.[0]
      : null
    const locationEvent = FSDJump || Location
    const systemName = locationEvent?.StarSystem ?? null

    // Get ScanOrganic events for current system only
    //    Body IDs repeat across systems — filtering by SystemAddress prevents
    //    scans from previous systems bleeding into the current body.
    const systemAddress = locationEvent?.SystemAddress ?? null
    const organicQuery = systemAddress
      ? { event: 'ScanOrganic', SystemAddress: systemAddress }
      : { event: 'ScanOrganic' }
    const allScanOrganic = await this.eliteLog._query(organicQuery)

    // Group by body — use Body (bodyId number)
    const organicByBody = {}
    for (const e of allScanOrganic) {
      if (!organicByBody[e.Body]) organicByBody[e.Body] = []
      organicByBody[e.Body].push(e)
    }

    // Identify current body ID from Status.json BodyName or journal
    let currentBodyId = null
    if (bodyName) {
      // Try to find body ID from ScanOrganic events matching this body name
      const touchdownEvent = await this.eliteLog.getEvent('Touchdown')
      const approachBodyEvent = await this.eliteLog.getEvent('ApproachBody')
      currentBodyId = approachBodyEvent?.BodyID ?? touchdownEvent?.BodyID ?? null

      // If no approach/touchdown, try to match from Scan events
      if (currentBodyId == null) {
        const scan = await this.eliteLog._query({ event: 'Scan', BodyName: bodyName }, 1)
        currentBodyId = scan?.[0]?.BodyID ?? null
      }
    }

    // 4. Build organism list for current body
    const organisms = []
    const codexImages = getCodexImages()
    const codexDescriptions = getCodexDescriptions()

    if (currentBodyId != null && organicByBody[currentBodyId]) {
      const scans = organicByBody[currentBodyId]

      // Group scans by species
      const speciesMap = {}
      for (const scan of scans) {
        const speciesKey = scan.Species_Localised || scan.Species || ''
        if (!speciesKey) continue

        if (!speciesMap[speciesKey]) {
          const genus = scan.Genus_Localised || speciesKey.split(' ')[0]
          speciesMap[speciesKey] = {
            genus,
            species: speciesKey,
            variant: scan.Variant_Localised || '',
            reward: SPECIES_REWARDS[speciesKey] ?? UNKNOWN_VALUE,
            colonyDistance: GENUS_COLONY_DISTANCE[genus] ?? DEFAULT_COLONY_DISTANCE,
            scanProgress: [],
            isComplete: false,
            imageUrl: null
          }
        }

        speciesMap[speciesKey].scanProgress.push({
          scanType: scan.ScanType,
          timestamp: scan.timestamp
        })

        if (scan.ScanType === 'Analyse') {
          speciesMap[speciesKey].isComplete = true
        }

        // Update variant from most recent scan
        if (scan.Variant_Localised) {
          speciesMap[speciesKey].variant = scan.Variant_Localised
        }
      }

      // Resolve images and build scan positions from in-memory store
      for (const [speciesKey, organism] of Object.entries(speciesMap)) {
        // Try variant match first, then species match, then genus
        const variantName = organism.variant
        const speciesName = organism.species
        const genusName = organism.genus

        organism.imageUrl = codexImages[variantName] || null

        // Fall back to first matching species image if no variant match
        if (!organism.imageUrl) {
          for (const [name, url] of Object.entries(codexImages)) {
            if (name.startsWith(speciesName + ' - ') || name === speciesName) {
              organism.imageUrl = url
              break
            }
          }
        }

        // Fall back further to first genus image
        if (!organism.imageUrl) {
          for (const [name, url] of Object.entries(codexImages)) {
            if (name.startsWith(genusName + ' ')) {
              organism.imageUrl = url
              break
            }
          }
        }

        // Attach scan positions from real-time captured data
        const posKey = `${currentBodyId}:${speciesKey}`
        const captured = this._bioScanPositions[posKey]
        organism.scanPositions = captured?.scans ?? []

        // Resolve description
        const descData = codexDescriptions[speciesKey] || codexDescriptions[genusName] || {}
        organism.description = descData.description || null
        organism.terrain = descData.terrain || null

        organisms.push(organism)
      }
    }

    // 5. Also get bio signal count from journal (how many species expected on this body)
    let bioSignalCount = 0
    if (currentBodyId != null) {
      const saaSignals = await this.eliteLog._query({ event: 'SAASignalsFound', BodyID: currentBodyId }, 1)
      const fssSignals = await this.eliteLog._query({ event: 'FSSBodySignals', BodyID: currentBodyId }, 1)
      const signals = saaSignals?.[0]?.Signals || fssSignals?.[0]?.Signals || []
      const bioSignal = signals.find(s => s.Type === '$SAA_SignalType_Biological;')
      bioSignalCount = bioSignal?.Count ?? 0
    }

    // 6. Get predicted species for this body (from bio-predictor)
    let predictions = []
    let isFirstFootfall = false
    if (currentBodyId != null && systemName) {
      try {
        const scan = await this.eliteLog._query({ event: 'Scan', BodyID: currentBodyId }, 1)
        if (scan?.[0]) {
          const rawBody = scan[0]
          isFirstFootfall = rawBody.WasDiscovered === false
          const starPos = locationEvent?.StarPos ?? null
          const allScans = await this.eliteLog._query({ event: 'Scan', StarSystem: systemName })

          // Normalize raw journal Scan events to the format buildBodyProps expects
          // (same transform as _buildSystemBodies Phase 3)
          const normalizeJournalScan = (s) => ({
            name: s.BodyName,
            bodyId: s.BodyID,
            type: s.StarType ? 'Star' : 'Planet',
            subType: s.PlanetClass || s.StarType,
            isMainStar: s.DistanceFromArrivalLS === 0,
            distanceToArrival: s.DistanceFromArrivalLS,
            gravity: s.SurfaceGravity ? s.SurfaceGravity / 9.81 : undefined,
            surfaceTemperature: s.SurfaceTemperature,
            surfacePressure: s.SurfacePressure ? s.SurfacePressure / 101325 : undefined,
            atmosphereType: s.AtmosphereType || (s.Atmosphere ? s.Atmosphere.replace(/ atmosphere$/i, '') : 'None'),
            atmosphereComposition: s.AtmosphereComposition
              ? Object.fromEntries(s.AtmosphereComposition.map(c => [c.Name, c.Percent]))
              : null,
            volcanismType: s.Volcanism || 'No volcanism',
            materials: s.Materials
              ? Object.fromEntries(s.Materials.map(m => [m.Name, m.Percent]))
              : null,
            parents: s.Parents || null,
            semiMajorAxis: s.SemiMajorAxis != null ? s.SemiMajorAxis / 149597870700 : null
          })

          const body = normalizeJournalScan(rawBody)
          const allBodies = allScans.map(normalizeJournalScan)
          let predicted = predictSpecies(body, allBodies, starPos)
          if (predicted && predicted.length > 0) {
            // Apply the same filtering as the system page (_addPredictedSpecies):

            // 1. Filter by DSS-confirmed genera (from SAASignalsFound) — definitive
            const saaForFilter = await this.eliteLog._query({ event: 'SAASignalsFound', BodyID: currentBodyId }, 1)
            const dssGenera = saaForFilter?.[0]?.Genuses
              ? saaForFilter[0].Genuses.map(g => g.Genus_Localised || g.Genus).filter(Boolean)
              : null
            if (dssGenera && dssGenera.length > 0) {
              const dssSet = new Set(dssGenera.map(g => normalizeDssGenus(g)))
              predicted = predicted.filter(p => dssSet.has(p.genus?.toLowerCase()))
            }

            // 2. If all bio signal slots accounted for by scanned genera, restrict to those
            const scannedGenera = [...new Set(organisms.map(o => o.genus?.toLowerCase()))]
            if (scannedGenera.length > 0 && scannedGenera.length >= bioSignalCount) {
              const scannedSet = new Set(scannedGenera)
              predicted = predicted.filter(p => scannedSet.has(p.genus?.toLowerCase()))
            }

            // 3. Remove predictions for species already scanned (case-insensitive)
            const scannedSpeciesNames = new Set(organisms.map(o => o.species?.toLowerCase()))
            const scannedGeneraConfirmed = new Set(
              organisms.filter(o => o.isComplete).map(o => o.genus?.toLowerCase())
            )
            const filtered = predicted
              .filter(p => !scannedSpeciesNames.has(p.species?.toLowerCase()))
              .filter(p => !scannedGeneraConfirmed.has(p.genus?.toLowerCase()))

            // 4. Apply Bayesian conditioning on genus probabilities (same as system page)
            // Remaining signal slots = total bio signals minus already-scanned organisms
            const knownGenera = new Set(organisms.map(o => o.genus?.toLowerCase()))
            const remainingSlots = bioSignalCount - organisms.length
            const unconfirmedPredGenera = new Set()
            for (const p of filtered) {
              const gk = p.genus?.toLowerCase()
              if (!knownGenera.has(gk)) unconfirmedPredGenera.add(gk)
            }

            // Group by genus
            const genusGroups = new Map()
            for (const p of filtered) {
              const gk = p.genus?.toLowerCase()
              if (!genusGroups.has(gk)) genusGroups.set(gk, [])
              genusGroups.get(gk).push(p)
            }

            const genusProbabilities = new Map()
            if (remainingSlots > 0 && genusGroups.size > 0) {
              const genusEntries = []
              for (const [gk, members] of genusGroups) {
                const genusProbability = Math.min(members.reduce((s, m) => s + (m.probability ?? 0), 0), 100)
                genusEntries.push({ gk, members, genusProbability })
              }

              const bayesWeights = _bayesianGenusWeights(
                genusEntries.map(e => ({ genusProbability: e.genusProbability })),
                remainingSlots
              )

              for (let i = 0; i < genusEntries.length; i++) {
                const { members } = genusEntries[i]
                const genusWeight = bayesWeights[i]
                const genusWeightPct = Math.round(genusWeight * 1000) / 10

                if (members.length === 1) {
                  genusProbabilities.set(`${members[0].genus}|${members[0].species}`, genusWeightPct)
                } else {
                  const genusTotal = members.reduce((s, m) => s + (m.hitCount || 1), 0)
                  for (const m of members) {
                    const speciesFraction = genusTotal > 0 ? (m.hitCount || 1) / genusTotal : 1 / members.length
                    const pct = Math.round(genusWeightPct * speciesFraction * 10) / 10
                    genusProbabilities.set(`${m.genus}|${m.species}`, pct)
                  }
                }
              }
            }

            predictions = filtered.map(p => {
              const bayesProb = genusProbabilities.get(`${p.genus}|${p.species}`)
              const fullName = `${p.genus} ${p.species}`
              const reward = SPECIES_REWARDS[fullName] ?? SPECIES_REWARDS[p.species] ?? UNKNOWN_VALUE
              return {
                genus: p.genus,
                species: p.species,
                probability: bayesProb != null ? bayesProb : Math.round(p.probability * 10) / 10,
                colonyDistance: GENUS_COLONY_DISTANCE[p.genus] ?? DEFAULT_COLONY_DISTANCE,
                reward,
                imageUrl: null
              }
            })

            // Resolve images for predictions too
            for (const pred of predictions) {
              const fullSpecies = pred.genus + ' ' + pred.species
              for (const [name, url] of Object.entries(codexImages)) {
                if (name.startsWith(fullSpecies + ' - ') || name === fullSpecies) {
                  pred.imageUrl = url
                  break
                }
              }
              if (!pred.imageUrl) {
                for (const [name, url] of Object.entries(codexImages)) {
                  if (name.startsWith(pred.genus + ' ')) {
                    pred.imageUrl = url
                    break
                  }
                }
              }

              // Resolve description
              const predDesc = codexDescriptions[fullSpecies] || codexDescriptions[pred.genus] || {}
              pred.description = predDesc.description || null
              pred.terrain = predDesc.terrain || null
            }
          }
        }
      } catch (e) { /* prediction failure is non-fatal */ }
    }

    const result = {
      systemName,
      bodyName,
      currentBodyId,
      planetRadius,
      isFirstFootfall,
      player: {
        lat: playerLat,
        lon: playerLon,
        heading,
        altitude
      },
      shipPosition: this._shipPosition,
      bioSignalCount,
      organisms,
      predictions
    }
    this._bioCache = result
    return result
  }

  // ── Data Inventory ──────────────────────────────────────────────────────────
  // Returns all scanned bodies + biologicals that haven't been sold yet,
  // grouped by system.  Historical journal data may lack first-discovery info
  // so those fields are marked unknown when unavailable.

  async getExplorationInventory (options = {}) {
    const minBodyValue = options.minBodyValue ?? 1000000
    const minBioValue = options.minBioValue ?? 7000000

    // If historical backfill is still running, tell the client to wait
    if (this.eliteLog.isFullLoadInProgress) {
      return { backfillInProgress: true }
    }

    // Ensure backfill is complete (instant if already done)
    await this.eliteLog.ensureFullLoad()

    // 1. Fetch all relevant journal events in parallel
    const [
      allScans,
      allSAAScanComplete,
      allScanOrganic,
      allSellExploration,
      allMultiSellExploration,
      allSellOrganic,
      allDied,
      LoadGame
    ] = await Promise.all([
      this.eliteLog._query({ event: 'Scan' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'SAAScanComplete' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'ScanOrganic', ScanType: 'Analyse' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'SellExplorationData' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'MultiSellExplorationData' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'SellOrganicData' }, 0, { timestamp: 1 }),
      this.eliteLog._query({ event: 'Died' }, 0, { timestamp: 1 }),
      this.eliteLog.getEvent('LoadGame')
    ])

    // Death causes loss of ALL unsold exploration and biological data.
    // Any scan before the most recent death (that wasn't already sold) is lost.
    const latestDeath = allDied.length > 0 ? allDied[allDied.length - 1].timestamp : null

    const cmdrName = LoadGame?.Commander ?? null

    // 2. Build a set of sold system names with the timestamp of sale.
    //    After a sell event, all scans in that system are "sold".
    //    If the player re-scans the same system later, those new scans
    //    are unsold again, so we track per-system sell timestamps.
    const soldSystems = {}  // systemName (lower) → latest sell timestamp
    for (const evt of allSellExploration) {
      const ts = evt.timestamp
      for (const sysName of (evt.Systems || [])) {
        const key = sysName.toLowerCase()
        if (!soldSystems[key] || ts > soldSystems[key]) soldSystems[key] = ts
      }
    }
    for (const evt of allMultiSellExploration) {
      const ts = evt.timestamp
      for (const d of (evt.Discovered || [])) {
        const key = (d.SystemName || '').toLowerCase()
        if (key && (!soldSystems[key] || ts > soldSystems[key])) soldSystems[key] = ts
      }
    }

    // 3. Build a set of sold organic species.
    //    SellOrganicData fires per visit to Vista Genomics and lists every
    //    specimen sold in that batch. We track sell timestamps to handle re-scans.
    const soldOrganics = []  // { species, timestamp }
    for (const evt of allSellOrganic) {
      const ts = evt.timestamp
      for (const bio of (evt.BioData || [])) {
        soldOrganics.push({
          species: bio.Species_Localised || bio.Species || '',
          timestamp: ts
        })
      }
    }

    // 4. Build SAAScanComplete lookup (bodyName → timestamp)
    const mappedBodies = {}
    for (const evt of allSAAScanComplete) {
      mappedBodies[evt.BodyName] = evt.timestamp
    }

    // 5. Build organic lookup: systemAddress:bodyId → [{ species, genus, reward, timestamp }]
    //    Only Analyse (3rd scan) = completed specimens.
    //    Events are sorted ascending — keep the LATEST per body+species so
    //    re-scans after death replace the lost earlier scan.
    //    Key uses systemAddress:bodyId because body IDs are only unique within a system.
    const organicsByBody = {}  // 'systemAddress:bodyId' → [specimen]
    for (const evt of allScanOrganic) {
      const key = `${evt.SystemAddress}:${evt.Body}`
      if (!organicsByBody[key]) organicsByBody[key] = []
      const speciesName = evt.Species_Localised || evt.Species || ''
      const genus = evt.Genus_Localised || speciesName.split(' ')[0]
      const entry = {
        species: speciesName,
        genus,
        reward: SPECIES_REWARDS[speciesName] ?? UNKNOWN_VALUE,
        timestamp: evt.timestamp
      }
      // Keep latest scan per body+species (overwrite earlier ones)
      const existingIdx = organicsByBody[key].findIndex(s => s.species === speciesName)
      if (existingIdx >= 0) {
        organicsByBody[key][existingIdx] = entry
      } else {
        organicsByBody[key].push(entry)
      }
    }

    // 6. Process all Scan events into inventory items, grouped by system
    const systems = {}  // systemName → { scans[], address, position }
    const seenBodies = new Set()  // track duplicates by BodyName

    for (const scan of allScans) {
      const systemName = scan.StarSystem
      if (!systemName) continue

      // Skip belt clusters — not valuable
      if (scan.BodyName?.includes('Belt Cluster')) continue

      // Skip nav beacon scans (AutoScan / NavBeaconDetail)
      if (scan.ScanType === 'NavBeaconDetail') continue

      // Deduplicate: keep the most recent scan per body (allScans sorted asc)
      const bodyKey = (scan.BodyName || '').toLowerCase()
      seenBodies.add(bodyKey)  // last one wins since sorted ascending

      const sysKey = systemName.toLowerCase()
      if (!systems[sysKey]) {
        systems[sysKey] = {
          name: systemName,
          address: scan.SystemAddress,
          position: scan.StarPos ?? null,
          bodies: {}
        }
      }

      // Check if this system was sold BEFORE this scan happened.
      // If scan is after the most recent sell, it's unsold.
      const sellTimestamp = soldSystems[sysKey]
      const wasSold = sellTimestamp && scan.timestamp <= sellTimestamp
      // Death loses all unsold exploration data — treat as gone
      const isLostToDeath = !wasSold && latestDeath && scan.timestamp <= latestDeath
      const isSold = wasSold || isLostToDeath

      const bodyType = scan.PlanetClass || scan.StarType || ''
      const isStar = isStarClass(bodyType)
      const isTerraformable = scan.TerraformState === 'Terraformable'
      const mass = scan.MassEM || scan.StellarMass || 1

      // Discovery info — may not be present in older journal versions
      const wasDiscovered = scan.WasDiscovered
      const wasMapped = scan.WasMapped
      const isFirstDiscoverer = wasDiscovered === false
      const isFirstMapped = wasMapped === false

      // Calculate body value (mapped + efficiency bonus = best possible payout)
      const mappedValue = getBodyValue({
        bodyType,
        isTerraformable,
        mass,
        isFirstDiscoverer: isFirstDiscoverer || wasDiscovered === undefined,
        isMapped: !isStar,
        isFirstMapped: isFirstMapped || wasMapped === undefined,
        withEfficiencyBonus: true
      })

      // Scan-only value (what you get just for honking/FSSing, without DSS)
      const scanValue = getBodyValue({
        bodyType,
        isTerraformable,
        mass,
        isFirstDiscoverer: isFirstDiscoverer || wasDiscovered === undefined,
        isMapped: false,
        isFirstMapped: false,
        withEfficiencyBonus: false
      })

      const wasDSSMapped = !!mappedBodies[scan.BodyName]

      systems[sysKey].bodies[bodyKey] = {
        name: scan.BodyName,
        bodyId: scan.BodyID,
        type: isStar ? 'Star' : 'Planet',
        subType: bodyType,
        isStar,
        isTerraformable,
        mass,
        distanceToArrival: scan.DistanceFromArrivalLS,
        isFirstDiscoverer: wasDiscovered === undefined ? null : isFirstDiscoverer,
        isFirstMapped: wasMapped === undefined ? null : isFirstMapped,
        wasScanned: true,
        wasMapped: wasDSSMapped,
        scanValue,
        mappedValue,
        value: wasDSSMapped ? mappedValue : scanValue,
        isSold,
        isLostToDeath: !!isLostToDeath,
        scanTimestamp: scan.timestamp
      }
    }

    // 7. Attach organics to their bodies and handle sold status
    for (const [sysKey, sys] of Object.entries(systems)) {
      for (const [bodyKey, body] of Object.entries(sys.bodies)) {
        const organicKey = `${sys.address}:${body.bodyId}`
        const specimens = organicsByBody[organicKey] ?? []
        if (specimens.length === 0) continue

        body.organics = specimens.map(sp => {
          // Check if this specific species was sold after this scan
          const soldEntry = soldOrganics.find(
            s => s.species === sp.species && s.timestamp > sp.timestamp
          )
          const wasBioSold = !!soldEntry
          // Death loses all unsold biological data
          const isLostToDeath = !wasBioSold && latestDeath && sp.timestamp <= latestDeath
          const isBioSold = wasBioSold || isLostToDeath

          const isFirstFootfall = body.isFirstDiscoverer === true
          const ffMultiplier = isFirstFootfall ? FIRST_FOOTFALL_MULTIPLIER : 1

          return {
            species: sp.species,
            genus: sp.genus,
            reward: sp.reward === UNKNOWN_VALUE ? sp.reward : sp.reward * ffMultiplier,
            baseReward: sp.reward,
            isFirstFootfall,
            isSold: isBioSold,
            isLostToDeath: !!isLostToDeath,
            scanTimestamp: sp.timestamp
          }
        })
      }
    }

    // 8. Build the response: array of systems with their bodies
    const inventory = []
    let totalValue = 0
    let totalSoldValue = 0
    let totalUnsoldValue = 0
    let totalUnsoldExploration = 0
    let totalUnsoldBio = 0
    let totalBodies = 0
    let totalBiologicals = 0

    for (const [sysKey, sys] of Object.entries(systems)) {
      const bodies = Object.values(sys.bodies)
      // Skip systems where everything is sold
      const hasUnsold = bodies.some(b =>
        !b.isSold || (b.organics ?? []).some(o => !o.isSold)
      )

      let systemValue = 0
      let systemUnsoldValue = 0
      let systemSoldValue = 0
      let systemBodies = 0
      let systemBiologicals = 0

      const bodyItems = []
      for (const body of bodies) {
        const bodyValue = body.value
        const bioValue = (body.organics ?? []).reduce((sum, o) => sum + (o.reward === UNKNOWN_VALUE ? 0 : o.reward), 0)
        const unsoldBioValue = (body.organics ?? []).filter(o => !o.isSold).reduce((sum, o) => sum + (o.reward === UNKNOWN_VALUE ? 0 : o.reward), 0)
        const soldBioValue = bioValue - unsoldBioValue

        const bodyTotalValue = bodyValue + bioValue
        const bodyUnsoldValue = (body.isSold ? 0 : bodyValue) + unsoldBioValue
        const bodySoldValue = (body.isSold ? bodyValue : 0) + soldBioValue

        systemValue += bodyTotalValue
        systemUnsoldValue += bodyUnsoldValue
        systemSoldValue += bodySoldValue
        if (!body.isSold) systemBodies++
        systemBiologicals += (body.organics ?? []).filter(o => !o.isSold).length

        bodyItems.push({
          name: body.name,
          bodyId: body.bodyId,
          type: body.type,
          subType: body.subType,
          isStar: body.isStar,
          isTerraformable: body.isTerraformable,
          distanceToArrival: body.distanceToArrival,
          isFirstDiscoverer: body.isFirstDiscoverer,
          isFirstMapped: body.isFirstMapped,
          wasScanned: body.wasScanned,
          wasMapped: body.wasMapped,
          scanValue: body.scanValue,
          mappedValue: body.mappedValue,
          value: body.value,
          isSold: body.isSold,
          isLostToDeath: body.isLostToDeath,
          organics: body.organics ?? [],
          totalValue: bodyTotalValue,
          unsoldValue: bodyUnsoldValue
        })
      }

      // Sort bodies: unsold first, then by value descending
      bodyItems.sort((a, b) => {
        if (a.isSold !== b.isSold) return a.isSold ? 1 : -1
        return b.unsoldValue - a.unsoldValue
      })

      totalValue += systemValue
      totalUnsoldValue += systemUnsoldValue
      totalSoldValue += systemSoldValue
      totalUnsoldExploration += bodyItems.reduce((sum, b) => sum + (b.isSold ? 0 : b.value), 0)
      totalUnsoldBio += bodyItems.reduce((sum, b) => sum + (b.organics ?? []).filter(o => !o.isSold).reduce((s, o) => s + (o.reward === UNKNOWN_VALUE ? 0 : o.reward), 0), 0)
      totalBodies += systemBodies
      totalBiologicals += systemBiologicals

      // Determine if system contains any valuable body or biological
      const hasValuableBody = bodyItems.some(b => b.value >= minBodyValue)
      const hasValuableBio = bodyItems.some(b =>
        (b.organics ?? []).some(o => o.reward !== UNKNOWN_VALUE && o.reward >= minBioValue)
      )
      const isValuable = hasValuableBody || hasValuableBio

      inventory.push({
        name: sys.name,
        address: sys.address,
        position: sys.position,
        bodies: bodyItems,
        totalValue: systemValue,
        unsoldValue: systemUnsoldValue,
        soldValue: systemSoldValue,
        unsoldBodies: systemBodies,
        unsoldBiologicals: systemBiologicals,
        allSold: !hasUnsold,
        isValuable
      })
    }

    // Sort systems: unsold first, then by unsold value descending
    inventory.sort((a, b) => {
      if (a.allSold !== b.allSold) return a.allSold ? 1 : -1
      return b.unsoldValue - a.unsoldValue
    })

    return {
      cmdrName,
      systems: inventory,
      totals: {
        systems: inventory.filter(s => !s.allSold).length,
        bodies: totalBodies,
        biologicals: totalBiologicals,
        value: totalValue,
        unsoldValue: totalUnsoldValue,
        unsoldExplorationValue: totalUnsoldExploration,
        unsoldBioValue: totalUnsoldBio,
        soldValue: totalSoldValue
      }
    }
  }

  getHandlers () {
    return {
      getExplorationRoute: (args) => this.getExplorationRoute(args),
      getExplorationSystem: (args) => this.getExplorationSystem(args),
      getExplorationBiologicals: () => this.getExplorationBiologicals(),
      getExplorationInventory: (args) => this.getExplorationInventory(args)
    }
  }
}

module.exports = Exploration
