const { execFileSync } = require('child_process')

// ─── Distance limits per power state ─────────────────────────────────────────
const MAX_DISTANCE = { Stronghold: 30, Fortified: 20 }
const SPANSH_SEARCH_SIZE = 30 // fetch enough to cover multiple powers + pad fallbacks

const POWER_NAME_ALIASES = {
  'A. Lavigny-Duval': 'Arissa Lavigny-Duval'
}

const SPANSH_POWER_ALIASES = Object.fromEntries(
  Object.entries(POWER_NAME_ALIASES).map(([short, full]) => [full, short])
)

// Ship display-name → required pad size ("S", "M", or "L")
const SHIP_PAD_SIZE = {
  Sidewinder: 'S', Eagle: 'S', 'Hauler': 'S', 'Adder': 'S',
  'Imperial Eagle': 'S', 'Imperial Courier': 'S', 'Viper Mk III': 'S',
  'Viper Mk IV': 'S', 'Cobra Mk III': 'S', 'Cobra Mk IV': 'S',
  'Diamondback Scout': 'S', Vulture: 'S', Mandalay: 'S',

  'Asp Explorer': 'M', 'Asp Scout': 'M', 'Diamondback Explorer': 'M',
  'Federal Dropship': 'M', 'Federal Assault Ship': 'M',
  'Federal Gunship': 'M', 'Keelback': 'M', 'Krait Mk II': 'M',
  'Krait Phantom': 'M', 'Alliance Chieftain': 'M',
  'Alliance Crusader': 'M', 'Alliance Challenger': 'M',
  'Python': 'M', 'Python Mk II': 'M', 'Fer-de-Lance': 'M',

  Anaconda: 'L', 'Federal Corvette': 'L', 'Imperial Cutter': 'L',
  'Type-6 Transporter': 'M', 'Type-7 Transporter': 'L',
  'Type-8 Transporter': 'L', 'Type-9 Heavy': 'L', 'Type-10 Defender': 'L',
  Orca: 'L', Beluga: 'L', Dolphin: 'S', Mamba: 'M',
  'Imperial Clipper': 'L'
}

function normalizePowerName (powerName) {
  if (!powerName) return null
  return POWER_NAME_ALIASES[powerName] ?? powerName
}

function getSystemType (powers, powerState, playerPower) {
  if (!powerState || !powers?.length || !playerPower) return null
  const normalizedPower = normalizePowerName(playerPower)
  const hasPledgedPower = Array.isArray(powers) && powers.some(p => normalizePowerName(p) === normalizedPower)
  if (powerState === 'Contested') return 'acquisition'
  if (hasPledgedPower) return 'reinforcement'
  return 'undermining'
}

function spanshPowerName (power) {
  return SPANSH_POWER_ALIASES[power] ?? power
}

// Returns true if the system has at least one station with a large landing pad
function systemHasLargePad (sys) {
  return sys.stations?.some(s => s.has_large_pad) ?? false
}

function searchSpanshSystems ({ power, allowedStates, referenceSystem, size }) {
  const filters = {
    power_state: { value: allowedStates }
  }
  // If power is specified, filter to that power; otherwise return all powers
  if (power) {
    filters.powers = { value: [spanshPowerName(power)] }
  }

  const body = JSON.stringify({
    filters,
    sort: [{ distance: { direction: 'asc' } }],
    size,
    page: 0,
    reference_system: referenceSystem
  })

  const result = execFileSync('curl.exe', [
    '-s', '-L', '--max-time', '15',
    '-H', 'Content-Type: application/json',
    '-d', body,
    'https://spansh.co.uk/api/systems/search'
  ], { encoding: 'utf-8', timeout: 20000, maxBuffer: 50 * 1024 * 1024 })

  const data = JSON.parse(result)
  if (!data?.results) return []

  return data.results
    .filter(sys => sys.name?.toLowerCase() !== referenceSystem.toLowerCase())
    .map(sys => ({
      name: sys.name,
      distance: sys.distance != null ? Math.round(sys.distance * 100) / 100 : null,
      powerState: sys.power_state ?? null,
      power: Array.isArray(sys.power) ? sys.power.map(normalizePowerName) : [],
      hasLargePad: systemHasLargePad(sys)
    }))
}

// Pick the best system for a given power from a sorted (by distance) list.
// Returns { closest, altWithPad } — altWithPad is set only when closest lacks a large pad and ship needs one.
function pickBestSystem (systems, needsLargePad) {
  if (!systems.length) return null
  const closest = systems[0]
  if (!needsLargePad || closest.hasLargePad) return { closest, altWithPad: null }
  const altWithPad = systems.find(s => s.hasLargePad) ?? null
  return { closest, altWithPad }
}

// Build nearby-sources payload for the UNDERMINING scenario:
// Player is in an enemy system → show the closest friendly pickup sources (own power's Stronghold ≤30Ly / Fortified ≤20Ly).
function buildUnderminingNearby (playerPower, referenceSystem, needsLargePad) {
  const allSystems = searchSpanshSystems({
    power: playerPower,
    allowedStates: ['Stronghold', 'Fortified'],
    referenceSystem,
    size: SPANSH_SEARCH_SIZE
  })

  // Apply distance caps per state
  const eligible = allSystems.filter(s => {
    const cap = MAX_DISTANCE[s.powerState]
    return cap && s.distance != null && s.distance <= cap
  })

  const result = pickBestSystem(eligible, needsLargePad)
  if (!result) return null

  const systems = [result.closest]
  if (result.altWithPad) systems.push(result.altWithPad)

  return {
    scenario: 'undermining',
    label: 'Nearest friendly pickup',
    description: `Pick up your power's commodity at a nearby ${playerPower} system and deliver it here to undermine.`,
    groups: [{ power: playerPower, systems }]
  }
}

// Build nearby-sources payload for the REINFORCEMENT scenario:
// Player is in a friendly Fortified/Stronghold → show closest enemy target system PER enemy power.
function buildReinforcementNearby (playerPower, referenceSystem, needsLargePad) {
  const allSystems = searchSpanshSystems({
    power: null, // all powers
    allowedStates: ['Stronghold', 'Fortified'],
    referenceSystem,
    size: SPANSH_SEARCH_SIZE
  })

  // Group by enemy power (exclude player's own power), apply distance caps
  const normalizedPlayer = normalizePowerName(playerPower)
  const byPower = {} // power → [systems sorted by distance (already sorted from Spansh)]

  for (const sys of allSystems) {
    const cap = MAX_DISTANCE[sys.powerState]
    if (!cap || sys.distance == null || sys.distance > cap) continue
    for (const p of sys.power) {
      const norm = normalizePowerName(p)
      if (norm === normalizedPlayer) continue
      if (!byPower[norm]) byPower[norm] = []
      byPower[norm].push(sys)
    }
  }

  const groups = []
  for (const [power, systems] of Object.entries(byPower)) {
    const result = pickBestSystem(systems, needsLargePad)
    if (!result) continue
    const list = [result.closest]
    if (result.altWithPad) list.push(result.altWithPad)
    groups.push({ power, systems: list })
  }

  // Sort groups by the closest system distance
  groups.sort((a, b) => (a.systems[0]?.distance ?? 999) - (b.systems[0]?.distance ?? 999))

  if (!groups.length) return null

  return {
    scenario: 'reinforcement',
    label: 'Nearby undermining targets',
    description: 'Closest enemy power systems you could undermine from here.',
    groups
  }
}

// Build nearby-sources for ACQUISITION: show own power's Fortified/Stronghold within range
function buildAcquisitionNearby (playerPower, referenceSystem, needsLargePad) {
  const allSystems = searchSpanshSystems({
    power: playerPower,
    allowedStates: ['Fortified', 'Stronghold'],
    referenceSystem,
    size: SPANSH_SEARCH_SIZE
  })

  const eligible = allSystems.filter(s => {
    const cap = MAX_DISTANCE[s.powerState]
    return cap && s.distance != null && s.distance <= cap
  })

  const result = pickBestSystem(eligible, needsLargePad)
  if (!result) return null

  const systems = [result.closest]
  if (result.altWithPad) systems.push(result.altWithPad)

  return {
    scenario: 'acquisition',
    label: 'Nearest friendly pickup',
    description: `Pick up your power's acquisition commodity at a nearby ${playerPower} system and deliver it here.`,
    groups: [{ power: playerPower, systems }]
  }
}

class Powerplay {
  constructor ({ eliteLog, shipStatus }) {
    this.eliteLog = eliteLog
    this.shipStatus = shipStatus
  }

  async getPowerplay () {
    const powerplayEvent = await this.eliteLog.getEvent('Powerplay')
    const meritsEvent = await this.eliteLog.getEvent('PowerplayMerits')
    const rankEvent = await this.eliteLog.getEvent('PowerplayRank')
    const joinEvent = await this.eliteLog.getEvent('PowerplayJoin')
    const leaveEvent = await this.eliteLog.getEvent('PowerplayLeave')
    const defectEvent = await this.eliteLog.getEvent('PowerplayDefect')
    const locationEvent = await this.eliteLog.getEvent('Location')

    // Get the most current system (most recent of Location or subsequent FSDJump)
    let currentSystemEvent = locationEvent
    if (locationEvent?.timestamp) {
      const fsdJumpEvent = (await this.eliteLog.getEventsFromTimestamp('FSDJump', locationEvent.timestamp, 1))?.[0]
      if (fsdJumpEvent) currentSystemEvent = fsdJumpEvent
    }

    const currentSystem = currentSystemEvent
      ? {
          name: currentSystemEvent.StarSystem ?? null,
          position: currentSystemEvent.StarPos ?? null,
          powers: currentSystemEvent.Powers ?? null,
          powerState: currentSystemEvent.PowerplayState ?? null
        }
      : null

    // Not pledged if there is no Powerplay startup event and no join event
    const pledged = !!(powerplayEvent || joinEvent)

    if (!pledged) {
      return { pledged: false, power: null, rank: null, merits: null, timePledged: null, currentSystem }
    }

    // Check for a more recent leave event than startup event
    const powerplayTimestamp = powerplayEvent?.timestamp ? new Date(powerplayEvent.timestamp).getTime() : 0
    const leaveTimestamp = leaveEvent?.timestamp ? new Date(leaveEvent.timestamp).getTime() : 0
    if (leaveTimestamp > powerplayTimestamp) {
      return { pledged: false, power: null, rank: null, merits: null, timePledged: null, currentSystem }
    }

    // Determine current power (defect updates the active power)
    let power = powerplayEvent?.Power ?? null
    if (defectEvent) {
      const defectTimestamp = new Date(defectEvent.timestamp).getTime()
      if (defectTimestamp > powerplayTimestamp) {
        power = defectEvent.ToPower ?? power
      }
    }

    // Rank: prefer most recent PowerplayRank event, fall back to Powerplay startup event
    const rank = rankEvent?.Rank ?? powerplayEvent?.Rank ?? null

    // Merits: prefer most recent PowerplayMerits event (TotalMerits), fall back to startup
    const merits = meritsEvent?.TotalMerits ?? powerplayEvent?.Merits ?? null

    const timePledged = powerplayEvent?.TimePledged ?? null

    let nearbySources = null
    const systemType = getSystemType(currentSystem?.powers, currentSystem?.powerState, power)
    if (systemType && power && currentSystem?.name) {
      try {
        // Determine if the ship needs a large pad
        const shipState = await this.shipStatus?.getShipStatus?.()
        const shipType = shipState?.type
        const padSize = shipType ? SHIP_PAD_SIZE[shipType] : null
        const needsLargePad = padSize === 'L'

        if (systemType === 'undermining') {
          nearbySources = buildUnderminingNearby(power, currentSystem.name, needsLargePad)
        } else if (systemType === 'reinforcement') {
          nearbySources = buildReinforcementNearby(power, currentSystem.name, needsLargePad)
        } else if (systemType === 'acquisition') {
          nearbySources = buildAcquisitionNearby(power, currentSystem.name, needsLargePad)
        }
      } catch (e) { /* Spansh unavailable — degrade gracefully */ }
    }

    return { pledged: true, power, rank, merits, timePledged, currentSystem, nearbySources }
  }

  getHandlers () {
    return {
      getPowerplay: () => this.getPowerplay()
    }
  }
}

module.exports = Powerplay
