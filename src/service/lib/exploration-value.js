/**
 * Elite Dangerous exploration value calculations.
 * Ported from SrvSurvey's Util.GetBodyValue algorithm.
 * Bio values from SrvSurvey's codexRef / Canonn data.
 *
 * Star/planet formula source: MattG's Frontier forum thread
 * https://forums.frontier.co.uk/threads/exploration-value-formulae.232000/
 */

// Maximum species reward per genus (one species per genus can appear on a body).
// Sorted descending for quick "top N" lookups.
// Source: SrvSurvey codexRef.json / Canonn API
const GENUS_MAX_VALUES = [
  { genus: 'Fonticulua', maxReward: 20000000 },   // Fluctus
  { genus: 'Concha', maxReward: 19010800 },        // Biconcavis
  { genus: 'Stratum', maxReward: 19010800 },       // Tectonicas
  { genus: 'Tussock', maxReward: 19010800 },       // Stigmasis
  { genus: 'Cactoida', maxReward: 16202800 },      // Vermis
  { genus: 'Clypeus', maxReward: 16202800 },       // Speculumi
  { genus: 'Fumerola', maxReward: 16202800 },      // Extremus
  { genus: 'Recepta', maxReward: 16202800 },       // Deltahedronix
  { genus: 'Aleoida', maxReward: 12934900 },       // Gravis
  { genus: 'Osseus', maxReward: 12934900 },        // Discus
  { genus: 'Tubus', maxReward: 11873200 },         // Cavas
  { genus: 'Frutexa', maxReward: 10326000 },       // Flammasis
  { genus: 'Bacterium', maxReward: 8418000 },      // Informem
  { genus: 'Electricae', maxReward: 6284600 },     // Pluma/Radialem
  { genus: 'Fungoida', maxReward: 3703200 },       // Bullarum
  { genus: 'Amphora Plant', maxReward: 1628800 },  // Amphora Plant
  { genus: 'Crystalline Shards', maxReward: 1628800 }, // Crystalline Shards
  { genus: 'Brain Trees', maxReward: 1593700 },    // Brain Tree (all variants)
  { genus: 'Sinuous Tubers', maxReward: 1514500 }, // Sinuous Tubers (all variants)
  { genus: 'Luteolum Anemone', maxReward: 1499900 }, // Anemone (all variants)
  { genus: 'Bark Mounds', maxReward: 1471900 }     // Bark Mounds
]

// First footfall multiplier for biological rewards
const FIRST_FOOTFALL_MULTIPLIER = 5

const STAR_K_VALUES = {
  N: 22628,       // Neutron Star
  H: 22628,       // Black Hole
  SupermassiveBlackHole: 80.5, // per MattG's verified value from Sag A* data
  Nebula: 0
}

const BODY_K_VALUES = {
  'Metal rich body': { base: 21790, terraform: 0 },
  'Ammonia world': { base: 96932, terraform: 0 },
  'Sudarsky class I gas giant': { base: 1656, terraform: 0 },
  'Sudarsky class II gas giant': { base: 9654, terraform: 0 },
  'Sudarsky class III gas giant': { base: 300, terraform: 0 },
  'Sudarsky class IV gas giant': { base: 300, terraform: 0 },
  'Sudarsky class V gas giant': { base: 300, terraform: 0 },
  'High metal content body': { base: 9654, terraform: 100677 },
  'High metal content world': { base: 9654, terraform: 100677 },
  'Water world': { base: 64831, terraform: 116295 },
  'Water giant': { base: 64831, terraform: 0 },
  'Earth-like world': { base: 181126, terraform: 0 },
  'Earthlike body': { base: 181126, terraform: 0 },
  'Rocky body': { base: 300, terraform: 93328 },
  'Rocky ice body': { base: 300, terraform: 0 },
  'Rocky Ice world': { base: 300, terraform: 0 },
  'Icy body': { base: 300, terraform: 0 },
  'Ice world': { base: 300, terraform: 0 }
}

// EDSM uses slightly different names, so we also map those
const EDSM_TYPE_MAP = {
  'Metal-rich body': 'Metal rich body',
  'High metal content world': 'High metal content body',
  'Earth-like world': 'Earthlike body',
  'Rocky Ice world': 'Rocky ice body',
  'Class I gas giant': 'Sudarsky class I gas giant',
  'Class II gas giant': 'Sudarsky class II gas giant',
  'Class III gas giant': 'Sudarsky class III gas giant',
  'Class IV gas giant': 'Sudarsky class IV gas giant',
  'Class V gas giant': 'Sudarsky class V gas giant',
  'Water giant': 'Water world',
  'Ice world': 'Icy body'
}

function isStarClass (typeOrClass) {
  if (!typeOrClass) return false
  // EDSM subType strings end with "Star" (e.g., "M (Red dwarf) Star")
  if (typeOrClass.endsWith(' Star') || typeOrClass.endsWith(' star')) return true
  // Exact matches for special types
  if (typeOrClass === 'Neutron Star' || typeOrClass === 'Black Hole' || typeOrClass === 'SupermassiveBlackHole') return true
  if (typeOrClass.includes('White Dwarf')) return true
  // Short journal star type codes (M, K, G, O, B, A, F, NS, BH, etc.)
  if (typeOrClass.length < 8 && !typeOrClass.includes(' ')) return true
  return false
}

function getStarKValue (starType) {
  if (!starType) return 1200
  // EDSM long names
  if (starType.includes('Neutron')) return 22628
  if (starType.includes('Black Hole') || starType === 'SupermassiveBlackHole') return 22628
  // White Dwarfs: k=14057 (per MattG's verified formula)
  if (starType.includes('White Dwarf')) return 14057
  // Journal short codes
  if (starType === 'NS' || starType === 'BH') return 22628
  if (starType.startsWith('D') && starType.length <= 3) return 14057 // White Dwarf journal codes (D, DA, DAB, DB, DC, etc.)
  // Wolf-Rayet and all other stars: k=1200
  return 1200
}

function getBodyKValue (bodyType, isTerraformable) {
  if (!bodyType) return 300
  // Normalize EDSM type names
  const normalized = EDSM_TYPE_MAP[bodyType] || bodyType
  const entry = BODY_K_VALUES[normalized]
  if (!entry) return 300
  return entry.base + (isTerraformable ? entry.terraform : 0)
}

/**
 * Calculate the exploration value of a body.
 *
 * @param {object} opts
 * @param {string} opts.bodyType - Planet class or star type
 * @param {boolean} opts.isTerraformable - Whether the body is terraformable
 * @param {number} opts.mass - Earth masses (planets) or solar masses (stars)
 * @param {boolean} opts.isFirstDiscoverer - First to discover
 * @param {boolean} opts.isMapped - Has been DSS mapped
 * @param {boolean} opts.isFirstMapped - First to map
 * @param {boolean} opts.withEfficiencyBonus - Mapped with minimum probes
 * @returns {number} Estimated credit value
 */
function getBodyValue ({
  bodyType,
  isTerraformable = false,
  mass = 1,
  isFirstDiscoverer = false,
  isMapped = false,
  isFirstMapped = false,
  withEfficiencyBonus = true
} = {}) {
  if (!bodyType) return 0

  const q = 0.56591828

  // Star value calculation — linear mass formula per MattG: k + (m * k / 66.25)
  if (isStarClass(bodyType)) {
    const kk = getStarKValue(bodyType)
    let starValue = kk + (mass * kk / 66.25)
    if (isFirstDiscoverer) starValue *= 2.6
    return Math.round(starValue)
  }

  // Body value calculation
  const k = getBodyKValue(bodyType, isTerraformable)

  let mappingMultiplier = 1
  if (isMapped) {
    if (isFirstDiscoverer && isFirstMapped) {
      mappingMultiplier = 3.699622554
    } else if (isFirstMapped) {
      mappingMultiplier = 8.0956
    } else {
      mappingMultiplier = 3.3333333333
    }
  }

  let value = (k + k * q * Math.pow(mass, 0.2)) * mappingMultiplier

  // Odyssey DSS bonus
  if (isMapped) {
    value += Math.max(555, value * 0.3)
    if (withEfficiencyBonus) value *= 1.25
  }

  value = Math.max(500, value)

  if (isFirstDiscoverer) value *= 2.6

  return Math.round(value)
}

// Map DSS/journal genus names to bio-criteria genus names for matching
// The journal Genus_Localised uses slightly different names than bio-criteria.json
const DSS_GENUS_NORMALIZE = {
  anemone: 'luteolum anemone',
  'brain tree': 'brain trees',
  'brain trees': 'brain trees',
  shards: 'crystalline shards',
  'crystalline shards': 'crystalline shards',
  'sinuous tubers': 'roseum sinuous tubers',
  'amphora plant': 'amphora plant',
  'bark mound': 'bark mounds',
  'bark mounds': 'bark mounds'
}

function normalizeDssGenus (name) {
  if (!name) return name
  return DSS_GENUS_NORMALIZE[name.toLowerCase()] || name.toLowerCase()
}

/**
 * Compute P(genus_i present | exactly N genera present) using Bayesian conditioning.
 *
 * Given M genera with independent prior probabilities and the constraint that
 * exactly N are present (from signal count), enumerates all C(M,N) combinations,
 * weights each by its joint probability, and marginalizes to get each genus's
 * conditional probability of being present.
 *
 * @param {Array} genera - Array of { genusProbability } (0-100 scale)
 * @param {number} slotCount - Number of bio signal slots (exactly this many genera present)
 * @returns {number[]} Conditional probability (0-1) for each genus
 */
function _bayesianGenusWeights (genera, slotCount) {
  const M = genera.length
  const N = Math.min(slotCount, M)

  // If fewer or equal predicted genera than slots, all are guaranteed present
  if (M <= N) return genera.map(() => 1.0)

  // Convert to 0-1 scale, clamping to avoid exact 0/1 which would zero out combos
  const probs = genera.map(g => {
    const p = Math.min(g.genusProbability, 100) / 100
    return Math.max(0.001, Math.min(0.999, p))
  })

  // Pre-compute log-odds for numerical stability with many genera
  // log(p/(1-p)) lets us compute joint probabilities via addition
  const logOdds = probs.map(p => Math.log(p / (1 - p)))
  // Base: product of all (1-p_i) — the probability none are present
  const logBase = probs.reduce((s, p) => s + Math.log(1 - p), 0)

  const weights = new Array(M).fill(0)
  let totalMass = 0

  // Enumerate all C(M, N) combinations
  const combo = new Array(N)
  function enumerate (start, depth) {
    if (depth === N) {
      // Joint prob = base × product of odds ratios for included genera
      let logJoint = logBase
      for (let d = 0; d < N; d++) logJoint += logOdds[combo[d]]
      const joint = Math.exp(logJoint)
      totalMass += joint
      for (let d = 0; d < N; d++) weights[combo[d]] += joint
      return
    }
    const maxStart = M - (N - depth)
    for (let i = start; i <= maxStart; i++) {
      combo[depth] = i
      enumerate(i + 1, depth + 1)
    }
  }

  enumerate(0, 0)

  if (totalMass > 0) {
    for (let i = 0; i < M; i++) weights[i] /= totalMass
  }
  return weights
}

/**
 * Estimate the expected biological value for a body with N bio signals.
 *
 * Uses probability-weighted expected value when predictions are available:
 * - For each genus, calculates weighted average reward across predicted species
 * - Weights by genus probability (pre-DSS) or uses 100% certainty (post-DSS)
 * - Confirmed species (ScanOrganic Analyse) use exact reward values
 *
 * Value refines progressively:
 * 1. Pre-FSS: No data → genus max table fallback
 * 2. Post-FSS: Predictions with probabilities → expected value
 * 3. Post-DSS: Confirmed genera → filter to matching, weight = 100%
 * 4. Post-surface: Confirmed species → exact reward values
 *
 * @param {number} signalCount - Number of biological signals on the body
 * @param {boolean} isFirstFootfall - Whether first footfall bonus applies (x5)
 * @param {Array} [knownSpecies] - Array of { genus, species, reward } for already-identified species
 * @param {Array} [predictedSpecies] - Array of { genus, species, probability } from bio-predictor
 * @param {object} [speciesRewards] - Map of species name → reward value
 * @param {Array} [confirmedGenuses] - Genus names confirmed by DSS scan (from SAASignalsFound)
 * @returns {number} Expected bio value in credits (probability-weighted)
 */
function getExpectedBioValue (signalCount, isFirstFootfall = false, knownSpecies = [], predictedSpecies = null, speciesRewards = null, confirmedGenuses = null) {
  if (!signalCount || signalCount <= 0) return 0

  const ffMultiplier = isFirstFootfall ? FIRST_FOOTFALL_MULTIPLIER : 1
  let totalValue = 0

  // Sum confirmed species rewards (fully analysed on the surface — exact value)
  const knownGenera = new Set()
  for (const sp of knownSpecies) {
    totalValue += sp.reward * ffMultiplier
    knownGenera.add(sp.genus?.toLowerCase())
  }

  const remaining = signalCount - knownSpecies.length
  if (remaining <= 0) return totalValue

  // If we have predicted species from the bio-predictor, calculate expected value
  if (predictedSpecies && predictedSpecies.length > 0 && speciesRewards) {
    // Build a set of DSS-confirmed genera (if available) for filtering
    // Normalize names to match bio-criteria genus names
    const dssGenera = confirmedGenuses
      ? new Set(confirmedGenuses.map(g => normalizeDssGenus(g)))
      : null

    // Group predictions by genus, collecting all species with their probabilities
    // Each genus can only appear once per body, so we compute the expected value
    // per genus as: sum(species_probability * species_reward) / sum(species_probability)
    const genusSpecies = new Map() // genusKey → [{ probability, reward }]
    for (const pred of predictedSpecies) {
      const genusKey = pred.genus?.toLowerCase()
      if (!genusKey || knownGenera.has(genusKey)) continue
      // If DSS confirmed specific genera, skip predictions not matching them
      if (dssGenera && !dssGenera.has(genusKey)) continue

      const fullName = `${pred.genus} ${pred.species}`
      const reward = speciesRewards[fullName] ?? speciesRewards[pred.species] ?? 0
      const probability = pred.probability ?? 0
      if (!genusSpecies.has(genusKey)) genusSpecies.set(genusKey, [])
      genusSpecies.get(genusKey).push({ probability, reward })
    }

    // Calculate expected value per genus:
    // Within a genus, species probabilities are relative to that genus appearing.
    // The expected reward for a genus = weighted average of species rewards
    // weighted by each species' probability within that genus.
    const genusExpected = [] // [{ genusKey, expectedReward, genusProbability }]
    for (const [genusKey, species] of genusSpecies) {
      const totalProb = species.reduce((s, sp) => s + sp.probability, 0)
      if (totalProb <= 0) continue
      // Expected reward = sum(prob * reward) / sum(prob), giving weighted average
      const expectedReward = species.reduce((s, sp) => s + sp.probability * sp.reward, 0) / totalProb
      // The genus-level probability is the total probability across all its species
      // (capped at 100 since it represents the chance this genus appears at all)
      const genusProbability = Math.min(totalProb, 100)
      genusExpected.push({ genusKey, expectedReward, genusProbability })
    }

    // Sort genera by expected reward descending (for fallback slot filling)
    genusExpected.sort((a, b) => b.expectedReward - a.expectedReward)

    const hasDssConfirmation = dssGenera && dssGenera.size > 0
    let slotsAccountedFor = 0

    if (hasDssConfirmation) {
      // DSS confirmed — each matching genus is 100% certain to be present
      const pickCount = Math.min(remaining, genusExpected.length)
      for (let i = 0; i < pickCount; i++) {
        totalValue += genusExpected[i].expectedReward * ffMultiplier
      }
      slotsAccountedFor = pickCount
    } else {
      // Pre-DSS: use Bayesian conditioning to compute P(genus_i present | exactly N present).
      // Since we know exactly `remaining` genera are present (from signal count),
      // we enumerate all C(M, N) combinations of genera and weight each by its
      // joint probability: ∏ p_i (included) × ∏ (1-p_i) (excluded).
      // Each genus's conditional probability = sum of joint probs for combos
      // including it / total probability mass.
      const weights = _bayesianGenusWeights(genusExpected, remaining)

      for (let i = 0; i < genusExpected.length; i++) {
        const w = weights[i]
        totalValue += genusExpected[i].expectedReward * w * ffMultiplier
        slotsAccountedFor += w
      }
    }

    // If predictions account for fewer slots than signals, fill remainder with genus max table
    const stillRemaining = remaining - Math.round(slotsAccountedFor)
    if (stillRemaining > 0) {
      const usedGenera = new Set([...knownGenera, ...genusSpecies.keys()])
      let picked = 0
      for (const g of GENUS_MAX_VALUES) {
        if (picked >= stillRemaining) break
        if (usedGenera.has(g.genus.toLowerCase())) continue
        totalValue += g.maxReward * ffMultiplier
        picked++
      }
    }
  } else {
    // Fallback: no predictions available, use genus max values table
    let picked = 0
    for (const g of GENUS_MAX_VALUES) {
      if (picked >= remaining) break
      if (knownGenera.has(g.genus.toLowerCase())) continue
      totalValue += g.maxReward * ffMultiplier
      picked++
    }
  }

  return Math.round(totalValue)
}

/**
 * Calculate the total estimated value of a system based on its bodies.
 * 
 * For each body, calculates the maximum obtainable value based on discovery status:
 * - isFirstDiscoverer/isFirstMapped per body determines bonus eligibility
 * - Always assumes mapped with efficiency bonus (best possible outcome)
 * - Bio value estimated from predicted species or genus max rewards
 * - First footfall (x5 bio) applies when body is undiscovered
 * - Main star bonus: honking credits the main star with a fraction of each other body
 * - Full scan bonus: 1000 Cr per body when all bodies FSS'd (only if all bodies are valuable)
 * - Full map bonus: 10000 Cr per non-star body when all mapped (only if all bodies are valuable)
 *
 * @param {Array} bodies - Array of body objects
 * @param {object} [speciesRewards] - Species name → reward map (from exploration handler)
 */
function getSystemValue (bodies, speciesRewards, options = {}) {
  if (!bodies || !Array.isArray(bodies)) return null

  const minBodyValue = options.minBodyValue ?? 1000000
  const minBioValue = options.minBioValue ?? 7000000
  const includeNonValuable = options.includeNonValuable !== false
  const bodyCount = options.bodyCount ?? null // Total bodies in system from FSS honk

  let bodyValue = 0
  let bioValue = 0
  let valuableBodies = 0
  let valuableBiologicals = 0
  let mainStarBonus = 0
  let nonStarCount = 0
  let allBodiesValuable = true
  const isFirstDiscoveredSystem = bodies.length > 0 && bodies.every(b => (b._isFirstDiscoverer ?? false))

  for (const body of bodies) {
    const bodyType = body.subType || body.type || body.group
    const isTerraformable = (
      body.terraformingState === 'Candidate for terraforming' ||
      body.terraformingState === 'Terraformable' ||
      body.terraformingState === 'Being terraformed' ||
      body.terraformingState === 'Terraformed'
    )
    const mass = body.earthMasses ?? body.solarMasses ?? 1

    // Per-body discovery/map flags default to false (no bonus)
    const isFirstDiscoverer = body._isFirstDiscoverer ?? false
    const isFirstMapped = body._isFirstMapped ?? false
    const isStar = isStarClass(bodyType)

    const value = getBodyValue({
      bodyType,
      isTerraformable,
      mass,
      isFirstDiscoverer,
      isMapped: !isStar, // Stars cannot be mapped
      isFirstMapped,
      withEfficiencyBonus: true
    })

    if (!isStar) nonStarCount++

    // Main star bonus: each non-main body contributes value/3 to the main star
    // For planets, minimum contribution is 500. For stars, straight 1/3.
    if (!body.isMainStar) {
      if (isStar) {
        mainStarBonus += Math.round(value / 3)
      } else {
        mainStarBonus += Math.max(500, Math.round(value / 3))
      }
    }

    const isValuableBody = value >= minBodyValue
    if (isValuableBody) {
      valuableBodies++
    } else {
      allBodiesValuable = false
    }

    if (includeNonValuable || isValuableBody) {
      bodyValue += value
    }

    // Biological value estimation
    const bioSignals = body.signals?.biological ?? 0
    if (bioSignals > 0) {
      // WasFootfalled (v4.2.1+) stored as _isFirstFootfall; fall back to discovery heuristic
      const isFirstFootfall = body._isFirstFootfall ?? ((body._isFirstDiscoverer ?? false) || (body._isFirstMapped ?? false))
      const knownSpecies = body._knownSpecies ?? []
      const predictedSpecies = body._predictedSpecies ?? null
      const confirmedGenuses = body.biologicalGenuses ?? null
      const bodyBioValue = getExpectedBioValue(bioSignals, isFirstFootfall, knownSpecies, predictedSpecies, speciesRewards, confirmedGenuses)

      const isValuableBio = bodyBioValue >= minBioValue
      if (isValuableBio) {
        valuableBiologicals += bioSignals
      }

      if (includeNonValuable || isValuableBio) {
        bioValue += bodyBioValue
      }
    }
  }

  // Apply first discovery multiplier to main star bonus
  if (isFirstDiscoveredSystem) {
    mainStarBonus = Math.round(mainStarBonus * 2.6)
  }

  // For bodies not yet known (bodyCount > bodies.length), estimate 500 Cr each
  const totalBodies = bodyCount ?? bodies.length
  const unknownBodies = Math.max(0, totalBodies - bodies.length)
  if (unknownBodies > 0) {
    mainStarBonus += Math.round(unknownBodies * 500 * (isFirstDiscoveredSystem ? 2.6 : 1))
  }

  bodyValue += mainStarBonus

  // Full scan bonus: 1000 Cr per body when all bodies in system are FSS scanned
  // Full map bonus: 10000 Cr per non-star body when all non-stars are mapped
  // Only add these if all bodies are considered valuable (otherwise we won't scan/map them all)
  let fullScanBonus = 0
  let fullMapBonus = 0
  if (allBodiesValuable && totalBodies > 0 && bodies.length >= totalBodies) {
    fullScanBonus = totalBodies * 1000
    fullMapBonus = nonStarCount * 10000
    bodyValue += fullScanBonus + fullMapBonus
  }

  return { total: bodyValue + bioValue, bodyValue, bioValue, valuableBodies, valuableBiologicals, mainStarBonus, fullScanBonus, fullMapBonus }
}

module.exports = {
  getBodyValue,
  getSystemValue,
  getExpectedBioValue,
  isStarClass,
  EDSM_TYPE_MAP,
  GENUS_MAX_VALUES,
  FIRST_FOOTFALL_MULTIPLIER,
  normalizeDssGenus,
  _bayesianGenusWeights
}
