/**
 * Bio-species predictor engine.
 * Ported from SrvSurvey's BioCriteria.cs / BioPredictor.cs.
 *
 * Given a body's properties (from EDSM or journal), determines which
 * biological species can viably exist on that body. Used to calculate
 * accurate maximum bio value estimates.
 */

const allCriteria = require('./data/bio-criteria.json')
const regionMapData = require('./data/region-map.json')
const nebulaeData = require('./data/nebulae.json')

// ─── Value mappings (from SrvSurvey Map class) ─────────────────────────

// Body type aliases used in criteria → full planet class prefixes
const BODY_ALIASES = {
  Icy: 'Icy body',
  Rocky: 'Rocky body',
  RockyIce: 'Rocky ice ',      // prefix match (could be "... body" or "... world")
  HMC: 'High metal content ',  // prefix match
  MRB: 'Metal rich body',      // also matches "Metal-rich body" via hyphen stripping
  MetalRich: 'Metal rich body'
}

// Criteria property names → body property keys
const PROP_MAP = {
  body: 'planetClass',
  gravity: 'surfaceGravity',
  temp: 'surfaceTemperature',
  pressure: 'surfacePressure',
  atmosphere: 'atmosphere',
  atmosType: 'atmosphereType',
  atmosComp: 'atmosphereComposition',
  matsComp: 'materials',
  dist: 'distanceFromArrivalLS',
  volcanism: 'volcanism',
  mats: 'materials',
  regions: 'region',
  star: 'starTypes',
  parentStar: 'parentStarTypes',
  primaryStar: 'primaryStarType',
  nebulae: 'nebulaDist',
  guardian: 'withinGuardianBubble',
  sma: 'semiMajorAxisAU',
  parentDist: 'parentDistanceAU'
}

// ─── Region batch definitions ───────────────────────────────────────────

const REGION_BATCHES = {
  'Orion-CygnusArm': [7, 8, 16, 17, 18, 35],
  'OuterArm': [5, 6, 13, 14, 27, 29, 31, 41, 37],
  'Scutum-CentaurusArm': [9, 10, 11, 12, 24, 25, 26, 42, 28],
  'PerseusArm': [15, 30, 32, 33, 34, 36, 38, 39],
  'Sagittarius-CarinaArm': [9, 18, 19, 20, 21, 22, 23, 40],
  'CentreLeft': [1, 4],
  'CentreTop': [1, 3, 7],
  'CentreRight': [1, 2],
  AmphoraBatch: [10, 19, 20, 21, 22],
  AnemoneBatch: [7, 8, 9, 13, 14, 15, 16, 17, 18, 27, 31],
  BarkMoundBatch: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 25, 32, 33, 34],
  BrainTreeBatch: [2, 9, 10, 17, 18, 35],
  TubersBatch: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19],
  ShardBatch: [14, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 34, 36, 37, 38, 39, 40, 41, 42]
}

// ─── Guardian bubble data ───────────────────────────────────────────────

const GUARDIAN_LARGE_BUBBLES = [
  { pos: [1099.21875, -146.6875, -133.59375], radius: 750 },   // Gamma Velorum
  { pos: [-840.65625, -561.15625, 13361.8125], radius: 750 }   // Hen 2-333
]

const GUARDIAN_SMALL_BUBBLES = [
  [-9298.6875, -419.40625, 7911.15625],
  [-5479.28125, -574.84375, 10468.96875],
  [1228.1875, -694.5625, 12341.65625],
  [4961.1875, 158.09375, 20642.65625],
  [14602.75, -237.90625, 3561.875],
  [8649.125, -154.71875, 2686.03125]
]

// ─── EDSM atmosphereType → criteria CamelCase mapping ──────────────────

// EDSM uses descriptive strings like "Hot thick Carbon dioxide"
// Criteria use CamelCase journal format like "CarbonDioxide"
const ATMOS_TYPE_MAP = {
  'carbon dioxide': 'CarbonDioxide',
  'carbon dioxide-rich': 'CarbonDioxideRich',
  'sulphur dioxide': 'SulphurDioxide',
  'methane-rich': 'MethaneRich',
  'methane': 'Methane',
  'neon-rich': 'NeonRich',
  'neon': 'Neon',
  'water-rich': 'WaterRich',
  'water': 'Water',
  'argon-rich': 'ArgonRich',
  'argon': 'Argon',
  'ammonia': 'Ammonia',
  'ammonia and oxygen': 'AmmoniaAndOxygen',
  'nitrogen': 'Nitrogen',
  'oxygen': 'Oxygen',
  'helium': 'Helium',
  'no atmosphere': 'None',
  'suitable for water-based life': 'EarthLike'
}

// EDSM atmosphereComposition keys → criteria CamelCase
const ATMOS_COMP_MAP = {
  'carbon dioxide': 'CarbonDioxide',
  'sulphur dioxide': 'SulphurDioxide',
  'nitrogen': 'Nitrogen',
  'ammonia': 'Ammonia',
  'methane': 'Methane',
  'oxygen': 'Oxygen',
  'hydrogen': 'Hydrogen',
  'helium': 'Helium',
  'neon': 'Neon',
  'argon': 'Argon',
  'water': 'Water',
  'silicates': 'Silicates',
  'iron': 'Iron'
}

// ─── EDSM star subType → short star code ────────────────────────────────

function extractStarCode (edsmSubType) {
  if (!edsmSubType) return null
  // EDSM: "M (Red dwarf) Star" → "M"
  // EDSM: "White Dwarf (DA) Star" → "DA"
  // EDSM: "Neutron Star" → "N"
  // EDSM: "Black Hole" → "H"
  // EDSM: "T Tauri Star" → "TTS"
  // EDSM: "Wolf-Rayet N Star" → "WN"
  // EDSM: "Herbig Ae/Be Star" → "Ae"

  if (edsmSubType === 'Neutron Star') return 'N'
  if (edsmSubType === 'Black Hole' || edsmSubType === 'Supermassive Black Hole') return 'H'
  if (edsmSubType.startsWith('T Tauri')) return 'TTS'
  if (edsmSubType.startsWith('Herbig')) return 'Ae'

  // "White Dwarf (DA) Star" → DA
  const wdMatch = edsmSubType.match(/^White Dwarf \((\w+)\)/)
  if (wdMatch) return wdMatch[1]

  // "Wolf-Rayet N Star" → WN, "Wolf-Rayet NC Star" → WNC, etc.
  const wrMatch = edsmSubType.match(/^Wolf-Rayet\s+(\w+)/)
  if (wrMatch) return 'W' + wrMatch[1]
  if (edsmSubType === 'Wolf-Rayet Star') return 'W'

  // "M (Red dwarf) Star" → M, "K (Yellow-Orange) Star" → K
  const basicMatch = edsmSubType.match(/^(\w+)\s+\(/)
  if (basicMatch) return basicMatch[1]

  // "C Star" → "C", "S-type Star" → "S"
  const simpleMatch = edsmSubType.match(/^(\w[\w-]*)\s+Star/)
  if (simpleMatch) return simpleMatch[1].replace(/-type$/, '')

  return edsmSubType
}

// ─── Flatten star type (collapse subtypes like SrvSurvey) ───────────────

function flattenStarType (starCode) {
  if (!starCode) return null
  // D, DA, DAB, DAO, DAZ, DAV, DB, DBZ, DBV, DO, DOV, DQ, DC, DCV, DX → "D"
  if (starCode[0] === 'D' && starCode.length <= 3) return 'D'
  // W, WN, WNC, WC, WO → "W"
  if (starCode[0] === 'W' && starCode.length <= 3) return 'W'
  // C, CS, CN, CJ, CH, CHd → "C"
  if (starCode[0] === 'C' && starCode.length <= 3) return 'C'
  // M_RedGiant → M (journal style, just in case)
  if (starCode.length > 1 && starCode[1] === '_') return starCode[0]
  return starCode
}

// ─── Region map lookup ──────────────────────────────────────────────────

const REGION_X0 = -49985
const REGION_Z0 = -24105

function findRegion (x, y, z) {
  const px = Math.floor((x - REGION_X0) * 83 / 4096)
  const pz = Math.floor((z - REGION_Z0) * 83 / 4096)

  if (px < 0 || pz < 0 || pz >= regionMapData.rows.length) return 0

  const row = regionMapData.rows[pz]
  let rx = 0
  for (const [rl, rv] of row) {
    if (px < rx + rl) return rv
    rx += rl
  }
  return 0
}

function getRegionName (regionId) {
  return regionMapData.names[regionId] || null
}

// ─── Guardian bubble check ──────────────────────────────────────────────

function dist3d (a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function isWithinGuardianBubble (starPos) {
  if (!starPos || starPos.length !== 3) return false
  for (const bubble of GUARDIAN_LARGE_BUBBLES) {
    if (dist3d(starPos, bubble.pos) < bubble.radius) return true
  }
  for (const pos of GUARDIAN_SMALL_BUBBLES) {
    if (dist3d(starPos, pos) < 100) return true
  }
  return false
}

// ─── Nebula distance ────────────────────────────────────────────────────

function getDistToClosestNebula (starPos) {
  if (!starPos || starPos.length !== 3 || nebulaeData.length === 0) return Infinity
  let minDist = Infinity
  for (const neb of nebulaeData) {
    const d = dist3d(starPos, neb)
    if (d < minDist) minDist = d
  }
  return minDist
}

// ─── Normalize EDSM atmosphereType to criteria CamelCase ────────────────

function normalizeAtmosType (edsmAtmosType) {
  if (!edsmAtmosType) return 'None'
  // Strip prefixes like "Hot thick", "Thick", "Thin", "Hot thin", "Hot"
  let base = edsmAtmosType
    .replace(/^(hot\s+thick|hot\s+thin|thick|thin|hot)\s+/i, '')
    .trim()
    .toLowerCase()
  return ATMOS_TYPE_MAP[base] || edsmAtmosType
}

// ─── Normalize atmosphere composition keys ──────────────────────────────

function normalizeAtmosComp (edsmComp) {
  if (!edsmComp) return null
  const result = {}
  for (const [key, value] of Object.entries(edsmComp)) {
    const normalizedKey = ATMOS_COMP_MAP[key.toLowerCase()] || key
    result[normalizedKey] = value
  }
  return result
}

// ─── Normalize volcanism string ─────────────────────────────────────────

function normalizeVolcanism (edsmType) {
  if (!edsmType || edsmType === 'No volcanism') return 'None'
  return edsmType
}

// ─── Expand region value to set of region IDs ───────────────────────────

function expandRegionValue (value) {
  const trimmed = value.trim()
  // If it's already a number, return as-is
  const num = parseInt(trimmed, 10)
  if (!isNaN(num)) return [num]
  // Try expanding as a batch/arm name
  if (REGION_BATCHES[trimmed]) return REGION_BATCHES[trimmed]
  return []
}

// ─── Clause parsing (from string format in JSON) ────────────────────────

function parseClause (text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  // Skip comments
  if (trimmed.startsWith('#')) return null

  // Parse: "property [values]" or "property ![values]" or "property &[values]"
  const match = trimmed.match(/^\s*(\w+)\s*([!&])?\[(.+)\]/)
  if (!match) return null

  const property = match[1]
  const modifier = match[2] || ''
  const valTxt = match[3]

  const clause = { property, raw: trimmed }

  if (valTxt.includes('~')) {
    // Numeric range: "min ~ max"
    clause.op = 'range'
    const parts = valTxt.split('~').map(s => s.trim())
    if (parts[0] !== '') clause.min = parseFloat(parts[0])
    if (parts[1] !== '') clause.max = parseFloat(parts[1])
  } else if (valTxt.includes('>=')) {
    // Composition: "CO2 >= 100 | SO2 >= 0.99"
    clause.op = 'composition'
    clause.compositions = {}
    const parts = valTxt.split('|').map(s => s.trim())
    for (const part of parts) {
      const compMatch = part.match(/([\w\s]+)\s*>=\s*([\d.]+)/)
      if (compMatch) {
        clause.compositions[compMatch[1].trim()] = parseFloat(compMatch[2])
      }
    }
  } else {
    // Set of strings - determine Is, Not, or All
    if (modifier === '!') clause.op = 'not'
    else if (modifier === '&') clause.op = 'all'
    else clause.op = 'is'

    clause.values = valTxt.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(v => {
        // Apply body type aliases
        if (BODY_ALIASES[v]) return BODY_ALIASES[v]
        return v
      })
  }

  return clause
}

// ─── Clause evaluation ─────────────────────────────────────────────────

const MATS_MINIMAL_THRESHOLD = 0.25

/**
 * Evaluate a parsed clause against body properties.
 * Returns { pass: boolean, confident: boolean }
 *   pass = true means the clause doesn't block this branch
 *   confident = true means we had real data to evaluate against
 *   confident = false means data was missing, so we assumed pass (unverified)
 */
function evaluateClause (clause, bodyProps) {
  if (!clause) return { pass: true, confident: true } // null clauses (comments) always pass

  const propName = PROP_MAP[clause.property] || clause.property
  const bodyValue = bodyProps[propName]

  // Check if data is missing for this property
  const hasData = bodyValue != null &&
    bodyValue !== '' &&
    (typeof bodyValue !== 'number' || !isNaN(bodyValue)) &&
    !(Array.isArray(bodyValue) && bodyValue.length === 0)

  // For range/composition checks on missing data, assume pass but mark unconfident
  if (!hasData) {
    // For 'is', 'not', 'all' on core properties, missing data is a fail
    // For range checks (sma, parentDist, gravity, temp, pressure, dist), missing data = uncertain
    if (clause.op === 'range' || clause.op === 'composition') {
      return { pass: true, confident: false }
    }
    // For guardian check, missing means not in bubble
    if (clause.property === 'guardian') {
      return { pass: false, confident: true }
    }
    // For most set-based checks, missing data is a definite fail
    return { pass: false, confident: true }
  }

  let result
  switch (clause.op) {
    case 'is': result = evaluateIs(clause, bodyValue, bodyProps); break
    case 'not': result = evaluateNot(clause, bodyValue, bodyProps); break
    case 'all': result = evaluateAll(clause, bodyValue); break
    case 'range': result = evaluateRange(clause, bodyValue); break
    case 'composition': result = evaluateComposition(clause, bodyValue); break
    default: result = true
  }

  return { pass: result, confident: true }
}

function evaluateIs (clause, bodyValue, bodyProps) {
  if (!clause.values) return false

  // Materials check: "mats [Technetium]" → check if material exists with >0.25%
  if (clause.property === 'mats') {
    if (bodyValue && typeof bodyValue === 'object') {
      return clause.values.some(v =>
        Object.entries(bodyValue).some(([k, amount]) =>
          k.toLowerCase() === v.toLowerCase() && amount > MATS_MINIMAL_THRESHOLD
        )
      )
    }
    return false
  }

  // Region check: expand batch names to IDs
  if (clause.property === 'regions') {
    if (typeof bodyValue === 'number' || typeof bodyValue === 'string') {
      const currentRegionId = typeof bodyValue === 'number' ? bodyValue : parseInt(bodyValue, 10)
      const allowedIds = new Set()
      for (const v of clause.values) {
        for (const id of expandRegionValue(v)) allowedIds.add(id)
      }
      return allowedIds.has(currentRegionId)
    }
    return false
  }

  // Body type check: uses startsWith comparison (replace hyphens with spaces for EDSM/Spansh compat)
  // EDSM/Spansh: "Metal-rich body"; Journal/SrvSurvey: "Metal rich body"
  if (clause.property === 'body') {
    if (typeof bodyValue === 'string') {
      const bv = bodyValue.toLowerCase().replace(/-/g, ' ')
      return clause.values.some(cv =>
        bv.startsWith(cv.toLowerCase().replace(/-/g, ' '))
      )
    }
    return false
  }

  // Volcanism check: uses contains comparison; "Any" matches anything except "None"
  if (clause.property === 'volcanism') {
    if (typeof bodyValue === 'string') {
      if (clause.values[0] === 'Any') return bodyValue !== 'None'
      return clause.values.some(cv =>
        bodyValue.toLowerCase().includes(cv.toLowerCase())
      )
    }
    return false
  }

  // Star type check: bodyValue is array of parent star types
  if (clause.property === 'star' || clause.property === 'parentStar') {
    const starTypes = Array.isArray(bodyValue) ? bodyValue : (bodyValue ? [bodyValue] : [])
    return clause.values.some(cv =>
      starTypes.some(sv => sv && sv.toLowerCase() === cv.toLowerCase())
    )
  }

  // Primary star: bodyValue is a single string
  if (clause.property === 'primaryStar') {
    if (typeof bodyValue === 'string') {
      return clause.values.some(cv =>
        bodyValue.toLowerCase() === cv.toLowerCase()
      )
    }
    return false
  }

  // Guardian check: "guardian [true]"
  if (clause.property === 'guardian') {
    return bodyValue === true || bodyValue === 'true'
  }

  // Generic string match (atmosType, etc.)
  if (typeof bodyValue === 'string') {
    return clause.values.some(cv =>
      bodyValue.toLowerCase() === cv.toLowerCase()
    )
  }

  // Array of strings
  if (Array.isArray(bodyValue)) {
    return clause.values.some(cv =>
      bodyValue.some(bv => bv.toLowerCase() === cv.toLowerCase())
    )
  }

  // Dictionary-like (object keys)
  if (bodyValue && typeof bodyValue === 'object') {
    const keys = Object.keys(bodyValue)
    return clause.values.some(cv =>
      keys.some(k => k.toLowerCase() === cv.toLowerCase())
    )
  }

  return false
}

function evaluateNot (clause, bodyValue, bodyProps) {
  if (!clause.values) return true

  // Region not-check
  if (clause.property === 'regions') {
    if (typeof bodyValue === 'number' || typeof bodyValue === 'string') {
      const currentRegionId = typeof bodyValue === 'number' ? bodyValue : parseInt(bodyValue, 10)
      const disallowedIds = new Set()
      for (const v of clause.values) {
        for (const id of expandRegionValue(v)) disallowedIds.add(id)
      }
      return !disallowedIds.has(currentRegionId)
    }
    return true
  }

  // Generic: none of the values should match
  if (typeof bodyValue === 'string') {
    return !clause.values.some(cv =>
      bodyValue.toLowerCase() === cv.toLowerCase()
    )
  }

  if (Array.isArray(bodyValue)) {
    return !clause.values.some(cv =>
      bodyValue.some(bv => bv.toLowerCase() === cv.toLowerCase())
    )
  }

  if (bodyValue && typeof bodyValue === 'object') {
    const keys = Object.keys(bodyValue)
    return !clause.values.some(cv =>
      keys.some(k => k.toLowerCase() === cv.toLowerCase())
    )
  }

  return true
}

function evaluateAll (clause, bodyValue) {
  if (!clause.values) return false
  const values = Array.isArray(bodyValue) ? bodyValue
    : (typeof bodyValue === 'string' ? [bodyValue]
      : (bodyValue && typeof bodyValue === 'object' ? Object.keys(bodyValue) : []))

  return clause.values.every(cv =>
    values.some(bv => bv.toLowerCase() === cv.toLowerCase())
  )
}

function evaluateRange (clause, bodyValue) {
  const num = typeof bodyValue === 'number' ? bodyValue : parseFloat(bodyValue)
  if (isNaN(num)) return false
  if (clause.min != null && num < clause.min) return false
  if (clause.max != null && num > clause.max) return false
  return true
}

function evaluateComposition (clause, bodyValue) {
  if (!bodyValue || typeof bodyValue !== 'object') return false

  // Composition clauses are OR'd: at least ONE composition condition must pass
  let allFailed = true
  for (const [compName, minAmount] of Object.entries(clause.compositions)) {
    // Find the matching key case-insensitively
    const matchKey = Object.keys(bodyValue).find(k =>
      k.toLowerCase() === compName.toLowerCase()
    )
    if (matchKey != null && bodyValue[matchKey] >= minAmount) {
      allFailed = false
      break
    }
  }
  // All conditions had to fail for the whole clause to fail
  return !allFailed
}

// ─── Criteria tree walker ───────────────────────────────────────────────

/**
 * Recursively walk the criteria tree and collect all matching species.
 *
 * Hit counts exist at two levels in the criteria tree:
 *   - Species-level: fresh community observation totals (from Canonn dump CSVs)
 *   - Sub-branch-level: body-type-specific splits (older SrvSurvey data)
 *
 * For probability we always use the species-level count so that all species
 * are compared on a consistent, up-to-date basis. Sub-branch queries still
 * filter which species CAN exist (pass/fail), but don't affect the weight.
 *
 * @param {object} criteria - A criteria node (genus/species/variant with query + children)
 * @param {object} bodyProps - Body properties dictionary
 * @param {string|null} genus - Accumulated genus name
 * @param {string|null} species - Accumulated species name
 * @param {string|null} variant - Accumulated variant name
 * @param {Array|null} commonChildren - Common children inherited from ancestor
 * @param {number} speciesHitCount - Species-level hit count (set once at species node, never overridden)
 * @returns {Array} Array of { genus, species, variant, hitCount } matches
 */
function walkCriteria (criteria, bodyProps, genus, species, variant, commonChildren, speciesHitCount) {
  const matches = []

  speciesHitCount = speciesHitCount || 0

  // Accumulate values from current node
  commonChildren = criteria.commonChildren || commonChildren
  genus = criteria.genus || genus
  species = criteria.species || species
  variant = criteria.variant != null ? criteria.variant : variant

  // Evaluate current node's query (ALL clauses must pass)
  if (criteria.query && criteria.query.length > 0) {
    for (const queryStr of criteria.query) {
      // Extract hit count from comments like "# hit count: 16731"
      if (typeof queryStr === 'string') {
        const hitMatch = queryStr.match(/^\s*#\s*hit\s*count:\s*(\d+)/i)
        if (hitMatch) {
          // Only capture the hit count at species level (node defines the species).
          // Sub-branch hit counts are ignored for probability — they serve
          // only as structural filters via their sibling query clauses.
          if (criteria.species) {
            speciesHitCount = parseInt(hitMatch[1], 10)
          }
          continue
        }
      }
      const clause = parseClause(queryStr)
      if (!clause) continue // skip other comments/null
      const result = evaluateClause(clause, bodyProps)
      if (!result.pass) return matches // fail: prune this branch
    }
  }

  // If we have genus + species + variant, this is a leaf prediction
  if (genus != null && species != null && variant != null) {
    matches.push({ genus, species, variant, hitCount: speciesHitCount })
  }

  // Recurse into children
  const children = criteria.useCommonChildren ? commonChildren : criteria.children
  if (children && children.length > 0) {
    for (const child of children) {
      const childMatches = walkCriteria(child, bodyProps, genus, species, variant, commonChildren, speciesHitCount)
      matches.push(...childMatches)
    }
  }

  return matches
}

// ─── Resolve parent body distance (AU) ──────────────────────────────────

/**
 * Find the SMA of the body's immediate parent in AU.
 * For moons, this is the planet they orbit; we return that planet's SMA.
 *
 * @param {object} body - Body data
 * @param {Array} allBodies - All bodies in the system
 * @returns {number|null} Parent body's semi-major axis in AU, or null if unknown
 */
function resolveParentDistanceAU (body, allBodies) {
  if (!body.parents || !Array.isArray(body.parents) || body.parents.length === 0) return null

  // First parent entry is the immediate parent
  const firstParent = body.parents[0]
  const parentType = Object.keys(firstParent)[0]
  const parentId = firstParent[parentType]

  if (parentType === 'Null') return null // barycenter, can't resolve distance

  // Find the parent body
  const parentBody = allBodies.find(b => b.bodyId === parentId)
  if (!parentBody) return null

  // EDSM: semiMajorAxis is in AU
  // Journal: semiMajorAxis stored in AU (converted at capture time)
  return parentBody.semiMajorAxis ?? null
}

// ─── Build body properties from EDSM/journal body data ─────────────────

/**
 * Build the bodyProps dictionary needed for criteria evaluation.
 *
 * @param {object} body - EDSM body object
 * @param {Array} allBodies - All bodies in the system (for parent star resolution)
 * @param {Array} starPos - System star position [x, y, z]
 * @returns {object} bodyProps dictionary for criteria evaluation
 */
function buildBodyProps (body, allBodies, starPos) {
  // Resolve parent star types by walking the parents chain
  const parentStarTypes = resolveParentStarTypes(body, allBodies)
  const flatParentTypes = parentStarTypes.map(flattenStarType).filter(Boolean)

  // Primary star = main star of system
  const primaryStar = allBodies.find(b => b.isMainStar === true && b.type === 'Star')
  const primaryStarCode = primaryStar ? extractStarCode(primaryStar.subType) : null
  const primaryStarType = flattenStarType(primaryStarCode) || ''

  // Region from coordinates
  const regionId = starPos ? findRegion(starPos[0], starPos[1], starPos[2]) : 0

  // Guardian and nebula
  const withinGuardianBubble = isWithinGuardianBubble(starPos)
  const nebulaDist = getDistToClosestNebula(starPos)

  // Normalize EDSM atmosphere type
  const atmosType = normalizeAtmosType(body.atmosphereType)

  // Normalize atmosphere composition
  // SrvSurvey: if only 1 composition entry, force it to 100% (EDSM often omits traces)
  let rawAtmosComp = body.atmosphereComposition
  if (rawAtmosComp && typeof rawAtmosComp === 'object') {
    const keys = Object.keys(rawAtmosComp)
    if (keys.length === 1) {
      rawAtmosComp = { [keys[0]]: 100 }
    }
  }
  const atmosComp = normalizeAtmosComp(rawAtmosComp)

  // Normalize volcanism
  const volcanism = normalizeVolcanism(body.volcanismType)

  // Normalize body type for matching
  // EDSM subType for planets: "Metal-rich body", "High metal content world", etc.
  // Journal PlanetClass: "Metal rich body", "High metal content body", etc.
  const planetClass = body.subType || body.type || ''

  // EDSM gravity is already in g; journal SurfaceGravity is in m/s² (÷ 9.81)
  // If body._gravityInG flag is set, it's already in g
  const gravity = body.gravity ?? (body.surfaceGravity ? body.surfaceGravity / 9.81 : 0)

  // EDSM surfacePressure is in atmospheres; journal SurfacePressure is in Pascals (÷ 100000)
  const pressure = body.surfacePressure ?? 0

  // Materials: EDSM provides { "Iron": 23.51, ... }
  const materials = body.materials || null

  // Semi-major axis: EDSM provides in AU, journal provides in meters (converted at capture)
  const semiMajorAxisAU = body.semiMajorAxis ?? null

  // Parent body distance: SMA of the immediate parent body in AU
  const parentDistanceAU = resolveParentDistanceAU(body, allBodies)

  return {
    planetClass,
    surfaceGravity: gravity,
    surfaceTemperature: body.surfaceTemperature || 0,
    surfacePressure: pressure,
    atmosphere: (body.atmosphereType || '').replace(/ atmosphere$/i, ''),
    atmosphereType: atmosType,
    atmosphereComposition: atmosComp,
    distanceFromArrivalLS: body.distanceToArrival ?? body.distanceFromArrivalLS ?? 0,
    volcanism,
    materials,
    region: regionId,
    starTypes: flatParentTypes,
    parentStarTypes: flatParentTypes,
    primaryStarType,
    nebulaDist,
    withinGuardianBubble,
    semiMajorAxisAU,
    parentDistanceAU
  }
}

/**
 * Resolve the parent star types for a body by walking the parents chain.
 * More accurate than just using the main star.
 *
 * EDSM parents format: [{"Star": 0}, {"Null": 5}] where key=type, value=bodyId
 * "Null" means a barycenter.
 *
 * Algorithm (ported from SrvSurvey SystemData.getParentStars):
 * 1. Walk the parents array
 * 2. If parent type is "Star", add that star
 * 3. If parent type is "Null" (barycenter), find all stars that have this barycenter as parent
 */
function resolveParentStarTypes (body, allBodies) {
  const starCodes = []
  if (!body.parents || !Array.isArray(body.parents)) {
    // No parents data - fall back to main star
    const mainStar = allBodies.find(b => b.isMainStar === true && b.type === 'Star')
    if (mainStar) {
      const code = extractStarCode(mainStar.subType)
      if (code) starCodes.push(code)
    }
    return starCodes
  }

  for (const parentEntry of body.parents) {
    if (parentEntry.Star != null) {
      // Direct parent star
      const parentId = parentEntry.Star
      const parentStar = allBodies.find(b => b.bodyId === parentId && b.type === 'Star')
      if (parentStar) {
        const code = extractStarCode(parentStar.subType)
        if (code) starCodes.push(code)
      }
    } else if (parentEntry.Null != null) {
      // Barycenter — find all stars orbiting this barycenter
      const baryId = parentEntry.Null
      const starsAtBary = allBodies.filter(b =>
        b.type === 'Star' &&
        b.parents &&
        b.parents.some(p => p.Null === baryId || p.Star === baryId)
      )
      for (const star of starsAtBary) {
        const code = extractStarCode(star.subType)
        if (code) starCodes.push(code)
      }
    }

    // We found at least one star, that's enough for most cases
    // But continue to find more for brightness comparison
  }

  // If we found nothing, fall back to main star
  if (starCodes.length === 0) {
    const mainStar = allBodies.find(b => b.isMainStar === true && b.type === 'Star')
    if (mainStar) {
      const code = extractStarCode(mainStar.subType)
      if (code) starCodes.push(code)
    }
  }

  return starCodes
}

/**
 * Sort parent stars by approximate relative brightness to the body.
 * Uses temperature / distance² magnitude as a proxy (like SrvSurvey).
 *
 * @param {Array} parentStarBodies - Star body objects
 * @param {object} body - The body we're evaluating
 * @returns {Array} Star bodies sorted by relative brightness (brightest first)
 */
function sortByBrightness (parentStarBodies, body) {
  const bodyDist = body.distanceToArrival ?? body.distanceFromArrivalLS ?? 0
  return parentStarBodies
    .map(star => {
      const starDist = star.distanceToArrival ?? star.distanceFromArrivalLS ?? 0
      const dist = Math.abs(bodyDist - starDist)
      const dist2 = dist * dist
      const distMag = dist2 > 0 ? dist2.toString().length : 1
      const relativeHeat = (star.surfaceTemperature || 0) / distMag
      return { star, relativeHeat }
    })
    .sort((a, b) => b.relativeHeat - a.relativeHeat)
    .map(s => s.star)
}

// ─── Main prediction function ───────────────────────────────────────────

/**
 * Predict which biological species can exist on a body.
 *
 * @param {object} body - Body data (from EDSM or journal)
 * @param {Array} allBodies - All bodies in the system
 * @param {Array} starPos - System star position [x, y, z]
 * @returns {Array} Array of { genus, species, variant, hitCount, probability } for all viable species
 */
function predictSpecies (body, allBodies, starPos) {
  try {
  // Only landable bodies can have biologicals
  // Stars and gas giants can't have biologicals
  if (body.type === 'Star') return []
  const planetClass = (body.subType || body.type || '').toLowerCase()
  if (planetClass.includes('gas giant') || planetClass.includes('water world') ||
      planetClass.includes('earth-like') || planetClass.includes('earthlike') ||
      planetClass.includes('ammonia world')) {
    // These planet types are never landable (no surface biologicals)
    // But ammonia worlds could have atmosphere bio in future — skip for now
    return []
  }

  const bodyProps = buildBodyProps(body, allBodies, starPos)
  const predictions = []

  for (const criteria of allCriteria) {
    const matches = walkCriteria(criteria, bodyProps, null, null, null, null, 0)
    predictions.push(...matches)
  }

  // Deduplicate by species name — keep highest hitCount variant
  const speciesMap = new Map()
  for (const pred of predictions) {
    const key = `${pred.genus}|${pred.species}`
    const existing = speciesMap.get(key)
    if (!existing || pred.hitCount > existing.hitCount) {
      speciesMap.set(key, pred)
    }
  }

  // Calculate relative probability from community observation hit counts
  const uniqueSpecies = [...speciesMap.values()]
  const totalHits = uniqueSpecies.reduce((sum, s) => sum + s.hitCount, 0)

  for (const pred of uniqueSpecies) {
    pred.probability = totalHits > 0
      ? Math.round((pred.hitCount / totalHits) * 1000) / 10 // one decimal place
      : Math.round((1000 / uniqueSpecies.length)) / 10
  }

  // Sort by probability descending (most likely first)
  // No minimum threshold — show all valid predictions to the user.
  // Low-probability entries are still valid environmental matches;
  // the probability percentage lets users judge significance themselves.
  uniqueSpecies.sort((a, b) => b.probability - a.probability)

  return uniqueSpecies
  } catch (e) {
    console.error(`Bio predictor error for body ${body?.name || 'unknown'}:`, e.message)
    return []
  }
}

/**
 * Get the distinct genera that can exist on a body.
 *
 * @param {object} body - Body data
 * @param {Array} allBodies - All bodies in the system
 * @param {Array} starPos - System star position [x, y, z]
 * @returns {Array} Array of unique genus names
 */
function predictGenera (body, allBodies, starPos) {
  const species = predictSpecies(body, allBodies, starPos)
  return [...new Set(species.map(s => s.genus))]
}

module.exports = {
  predictSpecies,
  predictGenera,
  buildBodyProps,
  findRegion,
  getRegionName,
  isWithinGuardianBubble,
  getDistToClosestNebula,
  extractStarCode,
  flattenStarType,
  normalizeAtmosType,
  normalizeAtmosComp,
  normalizeVolcanism,
  resolveParentStarTypes,
  resolveParentDistanceAU,
  sortByBrightness,
  parseClause,
  evaluateClause
}
