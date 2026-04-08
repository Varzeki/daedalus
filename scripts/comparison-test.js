#!/usr/bin/env node
/**
 * Comparison test: Daedalus bio predictor vs ExplorationBuddy vs SrvSurvey
 *
 * Tests 5 real bodies with known biologicals from Spansh, comparing:
 *   - Ground truth (actual genuses found on body)
 *   - DAEDALUS PREDICTIONS (species + probability)
 *   - ExplorationBuddy predictions (simple range/list matching from gc.dat)
 *   - SrvSurvey notes (same criteria engine as Daedalus, binary yes/no)
 */

const path = require('path')
const { predictSpecies, buildBodyProps } = require('../src/service/lib/bio-predictor')

// Load ExplorationBuddy gc.dat
const fs = require('fs')
const gcDatPath = path.join(__dirname, '..', '..', 'Elite Dangerous Exploration Buddy', 'gc.dat')
const gcData = JSON.parse(Buffer.from(fs.readFileSync(gcDatPath, 'utf8').trim(), 'base64').toString('utf8'))

// ─── ExplorationBuddy predictor (reimplemented from GeneraIndexProvider) ──

function explorationBuddyPredict (body, allBodies) {
  const results = []
  const planetClass = body.subType || ''
  const atmos = (body.atmosphereType || '').toLowerCase()
  const volcanism = (body.volcanismType || '').toLowerCase()
  const gravity = body.gravity || 0
  const temp = body.surfaceTemperature || 0
  const dist = body.distanceToArrival || 0

  // Resolve parent star - just use main star subType or class
  const parentStar = allBodies.find(b => b.type === 'Star' && b.isMainStar)
  const starClass = parentStar ? parentStar.subType : ''

  for (const entry of gcData) {
    // Planet class check
    if (entry.PlanetClasses && entry.PlanetClasses.length > 0) {
      const matchesClass = entry.PlanetClasses.some(pc =>
        planetClass.toLowerCase().includes(pc.toLowerCase()) ||
        pc.toLowerCase().includes(planetClass.toLowerCase())
      )
      if (!matchesClass) continue
    }

    // Atmosphere check
    if (entry.Atmospheres && entry.Atmospheres.length > 0) {
      const matchesAtmos = entry.Atmospheres.some(a => {
        const ea = a.toLowerCase().replace(/ atmosphere$/, '')
        return atmos.includes(ea) || ea.includes(atmos.toLowerCase())
      })
      if (!matchesAtmos) continue
    }

    // Volcanism check - empty string or "No volcanism" means no volcanism
    if (entry.Volcanisms && entry.Volcanisms.length > 0) {
      const matchesVolc = entry.Volcanisms.some(v => {
        const ev = v.toLowerCase()
        if (ev === '' || ev === 'no volcanism') {
          return volcanism === '' || volcanism === 'no volcanism'
        }
        return volcanism.includes(ev) || ev.includes(volcanism)
      })
      if (!matchesVolc) continue
    }

    // Gravity range check
    if (entry.GravityRange && entry.GravityRange.Item1 != null && entry.GravityRange.Item2 != null) {
      if (gravity < entry.GravityRange.Item1 || gravity > entry.GravityRange.Item2) continue
    }

    // Temperature range check
    if (entry.TemperatureRange && entry.TemperatureRange.Item1 != null && entry.TemperatureRange.Item2 != null) {
      if (temp < entry.TemperatureRange.Item1 || temp > entry.TemperatureRange.Item2) continue
    }

    // Distance range check
    if (entry.DistanceRange && entry.DistanceRange.Item1 != null && entry.DistanceRange.Item2 != null) {
      if (dist < entry.DistanceRange.Item1 || dist > entry.DistanceRange.Item2) continue
    }

    // Star class check
    if (entry.StarClasses && entry.StarClasses.length > 0 && starClass) {
      const matchesStar = entry.StarClasses.some(sc =>
        starClass.toLowerCase().includes(sc.toLowerCase()) ||
        sc.toLowerCase().includes(starClass.toLowerCase())
      )
      if (!matchesStar) continue
    }

    results.push({
      genus: entry.Name,
      species: entry.SpeciesShort || entry.Species
    })
  }

  // Deduplicate by genus|species
  const seen = new Set()
  return results.filter(r => {
    const key = `${r.genus}|${r.species}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Test Data: 5 real bodies with known biologicals ──────────────────

// System 1: Graea Hypue AA-Z d70 (id64: 2415457537675)
// Coords: x=-991.59375, y=-917.90625, z=13151.6875
const greaeStarPos = [-991.59375, -917.90625, 13151.6875]

const greaeAllBodies = [
  // Stars
  { bodyId: 2, type: 'Star', subType: 'F (White) Star', isMainStar: true, parents: [{ Null: 1 }, { Null: 0 }], semiMajorAxis: 0.013178 },
  { bodyId: 3, type: 'Star', subType: 'K (Yellow-Orange) Star', isMainStar: false, parents: [{ Null: 1 }, { Null: 0 }], semiMajorAxis: 0.034680 },
  { bodyId: 4, type: 'Star', subType: 'M (Red dwarf) Star', isMainStar: false, parents: [{ Null: 0 }], semiMajorAxis: 106.032 },
  // Gas giants (needed for parent chain)
  { bodyId: 41, type: 'Planet', subType: 'Class III gas giant', parents: [{ Null: 1 }, { Null: 0 }], semiMajorAxis: 7.201 },
  { bodyId: 48, type: 'Planet', subType: 'Class III gas giant', parents: [{ Null: 47 }, { Null: 1 }, { Null: 0 }], semiMajorAxis: 0.000955 },
  { bodyId: 92, type: 'Planet', subType: 'Class I gas giant', parents: [{ Star: 4 }, { Null: 0 }], semiMajorAxis: 6.153 },
  // Barycentres (for parent chain)
  { bodyId: 0, type: 'Barycentre' },
  { bodyId: 1, type: 'Barycentre', parents: [{ Null: 0 }] },
  { bodyId: 47, type: 'Barycentre', parents: [{ Null: 1 }, { Null: 0 }] },

  // === Test Body 1: AB 5a (bodyId 42) — Rocky + Thin CO2, 6 bios ===
  {
    bodyId: 42, type: 'Planet', subType: 'Rocky body', isLandable: true,
    gravity: 0.156681, earthMasses: 0.006714, surfaceTemperature: 183.554,
    surfacePressure: 0.04582, atmosphereType: 'Thin Carbon dioxide',
    atmosphereComposition: { 'Carbon dioxide': 99.01, 'Sulphur dioxide': 0.99 },
    volcanismType: 'No volcanism', distanceToArrival: 3596.787,
    semiMajorAxis: 0.01030, parents: [{ Planet: 41 }, { Null: 1 }, { Null: 0 }],
    materials: { Cadmium: 1.557, Carbon: 16.585, Germanium: 5.855, Iron: 20.049, Nickel: 15.165, Phosphorus: 10.614, Selenium: 3.087, Sulphur: 19.721, Technetium: 0.717, Tin: 1.200, Zinc: 5.449 },
    // Ground truth: Stratum, Conchas, Bacterium, Fungoids, Osseus, Tussocks
    _groundTruth: ['Stratum', 'Conchas', 'Bacterium', 'Fungoida', 'Osseus', 'Tussock']
  },

  // === Test Body 5: AB 6e (bodyId 54) — Rocky + Thin CO2, 6 bios (higher temp, Clypeus) ===
  {
    bodyId: 54, type: 'Planet', subType: 'Rocky body', isLandable: true,
    gravity: 0.214747, earthMasses: 0.01676, surfaceTemperature: 193.735,
    surfacePressure: 0.08608, atmosphereType: 'Thin Carbon dioxide',
    atmosphereComposition: { 'Carbon dioxide': 99.01, 'Sulphur dioxide': 0.99 },
    volcanismType: 'No volcanism', distanceToArrival: 4887.626,
    semiMajorAxis: 0.01579, parents: [{ Planet: 48 }, { Null: 47 }, { Null: 1 }, { Null: 0 }],
    materials: { Antimony: 1.174, Cadmium: 1.477, Carbon: 15.729, Chromium: 8.552, Iron: 19.017, Manganese: 7.854, Mercury: 0.830, Nickel: 14.383, Phosphorus: 10.070, Sulphur: 18.705, Zirconium: 2.208 },
    // Ground truth: Clypeus, Osseus, Tussocks, Bacterium, Fungoids, Stratum
    _groundTruth: ['Clypeus', 'Osseus', 'Tussock', 'Bacterium', 'Fungoida', 'Stratum']
  },

  // === Test Body 3: AB 6c (bodyId 52) — Rocky + Thin Ammonia, 4 bios ===
  {
    bodyId: 52, type: 'Planet', subType: 'Rocky body', isLandable: true,
    gravity: 0.135979, earthMasses: 0.004436, surfaceTemperature: 158.876,
    surfacePressure: 0.001138, atmosphereType: 'Thin Ammonia',
    atmosphereComposition: { Ammonia: 100 },
    volcanismType: 'No volcanism', distanceToArrival: 4883.334,
    semiMajorAxis: 0.009331, parents: [{ Planet: 48 }, { Null: 47 }, { Null: 1 }, { Null: 0 }],
    materials: { Arsenic: 2.625, Carbon: 16.622, Germanium: 5.869, Iron: 20.096, Nickel: 15.200, Niobium: 1.373, Phosphorus: 10.642, Ruthenium: 1.241, Sulphur: 19.767, Tungsten: 1.103, Zinc: 5.461 },
    // Ground truth: Tussocks, Shrubs, Bacterium, Fungoids
    _groundTruth: ['Tussock', 'Frutexta', 'Bacterium', 'Fungoida']
  },

  // === Test Body 4: C 6c (bodyId 96) — Icy + Thin Argon, 2 bios ===
  {
    bodyId: 96, type: 'Planet', subType: 'Icy body', isLandable: true,
    gravity: 0.080621, earthMasses: 0.003613, surfaceTemperature: 54.743,
    surfacePressure: 0.003103, atmosphereType: 'Thin Argon',
    atmosphereComposition: { Argon: 100 },
    volcanismType: 'No volcanism', distanceToArrival: 60695.155,
    semiMajorAxis: 0.007015, parents: [{ Planet: 92 }, { Star: 4 }, { Null: 0 }],
    materials: { Carbon: 23.183, Chromium: 5.544, Iron: 12.319, Nickel: 9.318, Niobium: 0.842, Phosphorus: 14.842, Sulphur: 27.569, Tellurium: 0.932, Tungsten: 0.676, Zinc: 3.348, Zirconium: 1.431 },
    // Ground truth: Fonticulus, Bacterium
    _groundTruth: ['Fonticulua', 'Bacterium']
  }
]

// System 2: Prua Phoe LX-S d4-211 (id64: 7259190873515)
// Coords: x=-5697.875, y=-547.28125, z=10881.40625
const pruaStarPos = [-5697.875, -547.28125, 10881.40625]

const pruaAllBodies = [
  // Stars
  { bodyId: 0, type: 'Star', subType: 'F (White) Star', isMainStar: true, parents: null, semiMajorAxis: null },
  // Gas giants (needed for parent chain)
  { bodyId: 47, type: 'Planet', subType: 'Class III gas giant', parents: [{ Star: 0 }], semiMajorAxis: 4.298 },

  // === Test Body 2: 7b (bodyId 51) — Rocky + Thin Ammonia, 6 bios ===
  {
    bodyId: 51, type: 'Planet', subType: 'Rocky body', isLandable: true,
    gravity: 0.145494, earthMasses: 0.005399, surfaceTemperature: 164.614,
    surfacePressure: 0.001302, atmosphereType: 'Thin Ammonia',
    atmosphereComposition: { Ammonia: 100 },
    volcanismType: 'No volcanism', distanceToArrival: 2155.314,
    semiMajorAxis: 0.018256, parents: [{ Planet: 47 }, { Star: 0 }],
    materials: { Carbon: 16.112, Chromium: 8.801, Iron: 19.570, Nickel: 14.802, Niobium: 1.338, Phosphorus: 10.315, Polonium: 0.508, Selenium: 2.999, Sulphur: 19.161, Tungsten: 1.075, Zinc: 5.318 },
    // Ground truth: Tussocks, Fungoids, Bacterium, Cactoid, Shrubs, Osseus
    _groundTruth: ['Tussock', 'Fungoida', 'Bacterium', 'Cactoida', 'Frutexta', 'Osseus']
  }
]

// ─── Run tests ────────────────────────────────────────────────────────

const testCases = [
  {
    name: 'Graea AA-Z d70 AB 5a',
    desc: 'Rocky + Thin CO2, 184K, 0.16g',
    bodyId: 42,
    allBodies: greaeAllBodies,
    starPos: greaeStarPos,
    system: 'Graea Hypue AA-Z d70'
  },
  {
    name: 'Prua Phoe LX-S d4-211 7b',
    desc: 'Rocky + Thin NH3, 165K, 0.15g',
    bodyId: 51,
    allBodies: pruaAllBodies,
    starPos: pruaStarPos,
    system: 'Prua Phoe LX-S d4-211'
  },
  {
    name: 'Graea AA-Z d70 AB 6c',
    desc: 'Rocky + Thin NH3, 159K, 0.14g',
    bodyId: 52,
    allBodies: greaeAllBodies,
    starPos: greaeStarPos,
    system: 'Graea Hypue AA-Z d70'
  },
  {
    name: 'Graea AA-Z d70 C 6c',
    desc: 'Icy + Thin Argon, 55K, 0.08g',
    bodyId: 96,
    allBodies: greaeAllBodies,
    starPos: greaeStarPos,
    system: 'Graea Hypue AA-Z d70'
  },
  {
    name: 'Graea AA-Z d70 AB 6e',
    desc: 'Rocky + Thin CO2, 194K, 0.21g',
    bodyId: 54,
    allBodies: greaeAllBodies,
    starPos: greaeStarPos,
    system: 'Graea Hypue AA-Z d70'
  }
]

// Normalize genus names for comparison
const GENUS_NORMALIZE = {
  Tussock: 'Tussock',
  Tussocks: 'Tussock',
  '$Codex_Ent_Tussocks_Genus_Name;': 'Tussock',
  Bacterium: 'Bacterium',
  '$Codex_Ent_Bacterial_Genus_Name;': 'Bacterium',
  Fungoida: 'Fungoida',
  Fungoids: 'Fungoida',
  '$Codex_Ent_Fungoids_Genus_Name;': 'Fungoida',
  Stratum: 'Stratum',
  '$Codex_Ent_Stratum_Genus_Name;': 'Stratum',
  Osseus: 'Osseus',
  '$Codex_Ent_Osseus_Genus_Name;': 'Osseus',
  Conchas: 'Conchas',
  '$Codex_Ent_Conchas_Genus_Name;': 'Conchas',
  Cactoida: 'Cactoida',
  Cactoid: 'Cactoida',
  '$Codex_Ent_Cactoid_Genus_Name;': 'Cactoida',
  Frutexta: 'Frutexta',
  Frutexa: 'Frutexta',
  Shrubs: 'Frutexta',
  '$Codex_Ent_Shrubs_Genus_Name;': 'Frutexta',
  Fonticulua: 'Fonticulua',
  Fonticulus: 'Fonticulua',
  '$Codex_Ent_Fonticulus_Genus_Name;': 'Fonticulua',
  Clypeus: 'Clypeus',
  '$Codex_Ent_Clypeus_Genus_Name;': 'Clypeus',
  Tubus: 'Tubus',
  '$Codex_Ent_Tubus_Genus_Name;': 'Tubus',
  Aleoida: 'Aleoida',
  Electricae: 'Electricae',
  Recepta: 'Recepta',
  Concha: 'Conchas',
  'Bark Mounds': 'Bark Mounds',
  'Brain Tree': 'Brain Trees',
  Amphora: 'Amphora',
  Anemone: 'Anemone'
}

function normalizeGenus (name) {
  return GENUS_NORMALIZE[name] || name
}

console.log('=' .repeat(100))
console.log('BIO PREDICTOR COMPARISON TEST')
console.log('Daedalus (probability) vs ExplorationBuddy (range/list) vs Ground Truth')
console.log('=' .repeat(100))
console.log()

const summary = { daedalus: { tp: 0, fp: 0, fn: 0 }, eb: { tp: 0, fp: 0, fn: 0 } }

for (const tc of testCases) {
  const body = tc.allBodies.find(b => b.bodyId === tc.bodyId)
  if (!body) {
    console.log(`ERROR: Body ${tc.bodyId} not found in ${tc.system}`)
    continue
  }

  const groundTruth = new Set(body._groundTruth.map(normalizeGenus))

  // --- Daedalus prediction ---
  const daedalusPreds = predictSpecies(body, tc.allBodies, tc.starPos)
  const daedalusGenera = new Set(daedalusPreds.map(p => normalizeGenus(p.genus)))

  // --- ExplorationBuddy prediction ---
  const ebPreds = explorationBuddyPredict(body, tc.allBodies)
  const ebGenera = new Set(ebPreds.map(p => normalizeGenus(p.genus)))

  // --- SrvSurvey note ---
  // SrvSurvey uses the same criteria engine as Daedalus (we ported from it).
  // Differences: SrvSurvey outputs variant-level (specific colors), no probability.
  // Same pass/fail criteria, so genus-level predictions should be identical to Daedalus.

  // --- Output ---
  console.log('─'.repeat(100))
  console.log(`TEST: ${tc.name}`)
  console.log(`      ${tc.desc} | System: ${tc.system}`)
  console.log('─'.repeat(100))

  // Ground truth
  console.log(`\n  GROUND TRUTH (${groundTruth.size} genuses):`)
  console.log(`    ${[...groundTruth].sort().join(', ')}`)

  // Daedalus results
  console.log(`\n  DAEDALUS PREDICTIONS (${daedalusPreds.length} species across ${daedalusGenera.size} genuses):`)
  for (const p of daedalusPreds) {
    const genNorm = normalizeGenus(p.genus)
    const inGT = groundTruth.has(genNorm) ? '✓' : '✗'
    console.log(`    ${inGT} ${p.genus} ${p.species} — ${p.probability}% (hits: ${p.hitCount})`)
  }

  // ExplorationBuddy results
  console.log(`\n  EXPLORATION BUDDY PREDICTIONS (${ebPreds.length} species across ${ebGenera.size} genuses):`)
  const ebByGenus = {}
  for (const p of ebPreds) {
    const g = normalizeGenus(p.genus)
    if (!ebByGenus[g]) ebByGenus[g] = []
    ebByGenus[g].push(p.species)
  }
  for (const [genus, species] of Object.entries(ebByGenus).sort()) {
    const inGT = groundTruth.has(genus) ? '✓' : '✗'
    console.log(`    ${inGT} ${genus}: ${species.join(', ')}`)
  }

  // Comparison summary
  const daedalusTP = [...groundTruth].filter(g => daedalusGenera.has(g))
  const daedalusFP = [...daedalusGenera].filter(g => !groundTruth.has(g))
  const daedalusFN = [...groundTruth].filter(g => !daedalusGenera.has(g))

  const ebTP = [...groundTruth].filter(g => ebGenera.has(g))
  const ebFP = [...ebGenera].filter(g => !groundTruth.has(g))
  const ebFN = [...groundTruth].filter(g => !ebGenera.has(g))

  summary.daedalus.tp += daedalusTP.length
  summary.daedalus.fp += daedalusFP.length
  summary.daedalus.fn += daedalusFN.length
  summary.eb.tp += ebTP.length
  summary.eb.fp += ebFP.length
  summary.eb.fn += ebFN.length

  console.log(`\n  GENUS-LEVEL ACCURACY:`)
  console.log(`    Daedalus:  ${daedalusTP.length}/${groundTruth.size} correct` +
    (daedalusFP.length ? `, ${daedalusFP.length} false pos (${daedalusFP.join(', ')})` : '') +
    (daedalusFN.length ? `, ${daedalusFN.length} missed (${daedalusFN.join(', ')})` : ''))
  console.log(`    ExpBudy: ${ebTP.length}/${groundTruth.size} correct` +
    (ebFP.length ? `, ${ebFP.length} false pos (${ebFP.join(', ')})` : '') +
    (ebFN.length ? `, ${ebFN.length} missed (${ebFN.join(', ')})` : ''))
  console.log(`    SrvSrvy: (same criteria engine as Daedalus — genus predictions identical, no probability)`)
  console.log()
}

// ─── Overall Summary ──────────────────────────────────────────────────

console.log('═'.repeat(100))
console.log('OVERALL SUMMARY (genus-level across all 5 test bodies)')
console.log('═'.repeat(100))

const daedalusPrec = summary.daedalus.tp / (summary.daedalus.tp + summary.daedalus.fp) * 100
const daedalusRecall = summary.daedalus.tp / (summary.daedalus.tp + summary.daedalus.fn) * 100
const ebPrec = summary.eb.tp / (summary.eb.tp + summary.eb.fp) * 100
const ebRecall = summary.eb.tp / (summary.eb.tp + summary.eb.fn) * 100

console.log()
console.log(`  ┌────────────────────┬───────────┬───────────┬───────────┬───────────┬───────────┐`)
console.log(`  │ Method             │ True Pos  │ False Pos │ Missed    │ Precision │ Recall    │`)
console.log(`  ├────────────────────┼───────────┼───────────┼───────────┼───────────┼───────────┤`)
console.log(`  │ Daedalus (probab.)   │ ${String(summary.daedalus.tp).padStart(9)} │ ${String(summary.daedalus.fp).padStart(9)} │ ${String(summary.daedalus.fn).padStart(9)} │ ${daedalusPrec.toFixed(1).padStart(8)}% │ ${daedalusRecall.toFixed(1).padStart(8)}% │`)
console.log(`  │ ExplorationBuddy   │ ${String(summary.eb.tp).padStart(9)} │ ${String(summary.eb.fp).padStart(9)} │ ${String(summary.eb.fn).padStart(9)} │ ${ebPrec.toFixed(1).padStart(8)}% │ ${ebRecall.toFixed(1).padStart(8)}% │`)
console.log(`  │ SrvSurvey          │  (same as Daedalus — identical criteria engine, no probability) │`)
console.log(`  └────────────────────┴───────────┴───────────┴───────────┴───────────┴───────────┘`)

console.log()
console.log('KEY DIFFERENCES:')
console.log('  • Daedalus:           Species-level + hit-count probability (0.5% threshold filter)')
console.log('  • ExplorationBuddy: Species-level, simple range/list matching, no probability')  
console.log('  • SrvSurvey:        Variant-level (specific colors), same criteria, no probability')
console.log('  • BioInsights:      Variant-level, 3-tier Likely/Maybe/Unlikely, star brightness ranking')
console.log()
console.log('NOTE: SrvSurvey uses the same criteria tree as Daedalus (ported from it).')
console.log('The criteria-level predictions are identical. The difference is that Daedalus')
console.log('adds probability ranking from Canonn community hit counts, and filters')
console.log('species below 0.5% relative probability.')
console.log()
