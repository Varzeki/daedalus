#!/usr/bin/env node
/**
 * Large-scale comparison test: Daedalus vs ExplorationBuddy on 1000+ random bodies.
 *
 * Fetches systems from Spansh API, finds bodies with known biologicals,
 * runs both predictors, and compares against ground truth.
 *
 * Usage:
 *   node scripts/comparison-test-1000.js [--limit N] [--no-cache] [--verbose]
 *
 * Data is cached to scripts/.comparison-cache.json to avoid re-fetching.
 */

const path = require('path')
const fs = require('fs')
const { predictSpecies } = require('../../src/service/lib/bio-predictor')

// ─── ExplorationBuddy gc.dat loader ───────────────────────────────────
const gcDatPath = path.join((__dirname, '..', '..'), '..', 'Elite Dangerous Exploration Buddy', 'gc.dat')
let gcData = null
try {
  gcData = JSON.parse(Buffer.from(fs.readFileSync(gcDatPath, 'utf8').trim(), 'base64').toString('utf8'))
} catch (e) {
  console.warn('WARNING: Could not load ExplorationBuddy gc.dat — EB predictions will be skipped.')
}

// ─── CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000')
const NO_CACHE = args.includes('--no-cache')
const VERBOSE = args.includes('--verbose')
const CACHE_PATH = path.join(__dirname, '.comparison-cache.json')

// ─── System id64 list from SrvSurvey test suite ──────────────────────
const SYSTEM_IDS = [
  7259190873515, 6125336284579, 6121703676746, 6365837675955, 284180729219,
  2415457537675, 2312378322571, 2003140677259, 1728262770315, 1659543293579,
  1350305648267, 1144147218059, 1659576977859, 319933188363, 546399072737,
  241824687268, 83718378202, 2878029308905, 2930853613195, 40280107390979,
  83718410970, 52850328756, 125860586676, 8055311831762, 721911088556658,
  1005802506067, 2789153444971, 33682769023907, 147547244739, 79347697283,
  37790682707, 10887906389, 234056927058952, 2009339794090, 5264816150115,
  3464481251, 51239337267043, 683033437569, 113808345931, 305709086413707,
  184943642675, 216887347755, 43847125659, 2302134985738, 672833020273,
  11548763827697, 11360960255658, 721151664337, 674712855233, 2851187073897,
  1148829126400920, 111098727130, 612973965713, 4879485709721, 265348273105,
  787453456673, 629372094563, 1976177703003690, 2962579378659, 16604217544995,
  1182223274666, 1453569624435, 358999069386, 233444419892, 10612427019,
  10376464763, 91956533317099, 455962777099, 1693617998187, 1005903105339,
  800801672259, 2004164284331, 14096678161971, 175621288252019,
  13876099622273, 2036007784483, 869487643043, 13648186819, 82032053243,
  320570575667, 150969781115, 52837737636, 4998038101, 1238889013,
  284175090653, 36011151, 802563263091, 1797418617131, 143518344886673,
  100562634522, 77409424274, 361481876986, 3650755408786, 6406178542290,
  675416645714, 84431081539, 353504315603, 49786130467, 113053059083,
  2282674557658, 1050522316081, 2519946200947, 10393127859, 7269366113697,
  664470014523, 9693069535209, 3922344909570, 2518319061187, 2920713168209,
  2492825675329, 633272537650, 962207294841, 1726677521610, 516869988849
]

// ─── HTTP fetch via curl (Node https has connectivity issues with Spansh) ──
const { execSync } = require('child_process')

function fetchJSON (url) {
  const result = execSync(`curl -s -m 30 "${url}"`, { maxBuffer: 50 * 1024 * 1024 })
  return JSON.parse(result.toString())
}

async function fetchWithRetry (url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return fetchJSON(url)
    } catch (e) {
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
}

// ─── Genus name normalization ─────────────────────────────────────────
const GENUS_MAP = {
  '$Codex_Ent_Tussocks_Genus_Name;': 'Tussock',
  '$Codex_Ent_Bacterial_Genus_Name;': 'Bacterium',
  '$Codex_Ent_Fungoids_Genus_Name;': 'Fungoida',
  '$Codex_Ent_Stratum_Genus_Name;': 'Stratum',
  '$Codex_Ent_Osseus_Genus_Name;': 'Osseus',
  '$Codex_Ent_Conchas_Genus_Name;': 'Conchas',
  '$Codex_Ent_Cactoid_Genus_Name;': 'Cactoida',
  '$Codex_Ent_Shrubs_Genus_Name;': 'Frutexta',
  '$Codex_Ent_Fonticulus_Genus_Name;': 'Fonticulua',
  '$Codex_Ent_Clypeus_Genus_Name;': 'Clypeus',
  '$Codex_Ent_Tubus_Genus_Name;': 'Tubus',
  '$Codex_Ent_Aleoids_Genus_Name;': 'Aleoida',
  '$Codex_Ent_Electricae_Genus_Name;': 'Electricae',
  '$Codex_Ent_Recepta_Genus_Name;': 'Recepta',
  '$Codex_Ent_Vents_Genus_Name;': 'Fumerola',
  '$Codex_Ent_Fumerolas_Genus_Name;': 'Fumerola',
  '$Codex_Ent_Vents_Name;': 'Fumerola',
  '$Codex_Ent_Cone_Genus_Name;': 'Bark Mounds',
  '$Codex_Ent_Cone_Name;': 'Bark Mounds',
  '$Codex_Ent_Brancae_Genus_Name;': 'Brain Trees',
  '$Codex_Ent_Brancae_Name;': 'Brain Trees',
  '$Codex_Ent_Seed_Genus_Name;': 'Amphora',
  '$Codex_Ent_Ground_Struct_Ice_Genus_Name;': 'Shards',
  '$Codex_Ent_Ground_Struct_Ice_Name;': 'Shards',
  '$Codex_Ent_Tube_Genus_Name;': 'Tubers',
  '$Codex_Ent_Tube_Name;': 'Tubers',
  '$Codex_Ent_Sphere_Genus_Name;': 'Anemone',
  '$Codex_Ent_Sphere_Name;': 'Anemone',
  '$Codex_Ent_SphereABCD_Name;': 'Anemone',
  Tussock: 'Tussock', Tussocks: 'Tussock',
  Bacterium: 'Bacterium',
  Fungoida: 'Fungoida', Fungoids: 'Fungoida',
  Stratum: 'Stratum',
  Osseus: 'Osseus',
  Conchas: 'Conchas', Concha: 'Conchas',
  Cactoida: 'Cactoida', Cactoid: 'Cactoida',
  Frutexta: 'Frutexta', Frutexa: 'Frutexta', Shrubs: 'Frutexta',
  Fonticulua: 'Fonticulua', Fonticulus: 'Fonticulua',
  Clypeus: 'Clypeus',
  Tubus: 'Tubus',
  Aleoida: 'Aleoida',
  Electricae: 'Electricae',
  Recepta: 'Recepta',
  Fumerola: 'Fumerola',
  'Bark Mounds': 'Bark Mounds',
  'Brain Trees': 'Brain Trees',
  Amphora: 'Amphora', 'Amphora Plant': 'Amphora',
  Anemone: 'Anemone', 'Luteolum Anemone': 'Anemone',
  Shards: 'Shards', 'Crystalline Shards': 'Shards',
  Tubers: 'Tubers', 'Roseum Sinuous Tubers': 'Tubers'
}

function normalizeGenus (name) {
  return GENUS_MAP[name] || name
}

// ─── ExplorationBuddy predictor ──────────────────────────────────────
function ebPredict (body, allBodies) {
  if (!gcData) return []
  const results = []
  const planetClass = body.subType || ''
  const atmos = (body.atmosphereType || '').toLowerCase()
  const volcanism = (body.volcanismType || '').toLowerCase()
  const gravity = body.gravity || 0
  const temp = body.surfaceTemperature || 0
  const dist = body.distanceToArrival || 0

  const parentStar = allBodies.find(b => b.type === 'Star' && (b.isMainStar || b.mainStar))
  const starClass = parentStar ? (parentStar.spectralClass || parentStar.subType || '') : ''

  for (const entry of gcData) {
    if (entry.PlanetClasses?.length > 0) {
      const match = entry.PlanetClasses.some(pc =>
        planetClass.toLowerCase().includes(pc.toLowerCase()) ||
        pc.toLowerCase().includes(planetClass.toLowerCase())
      )
      if (!match) continue
    }
    if (entry.Atmospheres?.length > 0) {
      const match = entry.Atmospheres.some(a => {
        const ea = a.toLowerCase().replace(/ atmosphere$/, '')
        return atmos.includes(ea) || ea.includes(atmos)
      })
      if (!match) continue
    }
    if (entry.Volcanisms?.length > 0) {
      const match = entry.Volcanisms.some(v => {
        const ev = v.toLowerCase()
        if (ev === '' || ev === 'no volcanism') return volcanism === '' || volcanism === 'no volcanism'
        return volcanism.includes(ev) || ev.includes(volcanism)
      })
      if (!match) continue
    }
    if (entry.GravityRange?.Item1 != null && entry.GravityRange?.Item2 != null) {
      if (gravity < entry.GravityRange.Item1 || gravity > entry.GravityRange.Item2) continue
    }
    if (entry.TemperatureRange?.Item1 != null && entry.TemperatureRange?.Item2 != null) {
      if (temp < entry.TemperatureRange.Item1 || temp > entry.TemperatureRange.Item2) continue
    }
    if (entry.DistanceRange?.Item1 != null && entry.DistanceRange?.Item2 != null) {
      if (dist < entry.DistanceRange.Item1 || dist > entry.DistanceRange.Item2) continue
    }
    if (entry.StarClasses?.length > 0 && starClass) {
      const match = entry.StarClasses.some(sc =>
        starClass.toLowerCase().includes(sc.toLowerCase()) ||
        sc.toLowerCase().includes(starClass.toLowerCase())
      )
      if (!match) continue
    }
    results.push({ genus: entry.Name, species: entry.SpeciesShort || entry.Species })
  }
  const seen = new Set()
  return results.filter(r => {
    const key = `${r.genus}|${r.species}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Normalize Spansh body for Daedalus predictor ──────────────────────
function normalizeSpanshBody (b) {
  // Spansh uses 'mainStar' but Daedalus expects 'isMainStar'
  if (b.mainStar !== undefined && b.isMainStar === undefined) {
    b.isMainStar = b.mainStar
  }
  return b
}

// ─── Cache management ─────────────────────────────────────────────────
let cache = {}
function loadCache () {
  if (NO_CACHE) return
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  } catch { /* no cache yet */ }
}
function saveCache () {
  if (NO_CACHE) return
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache))
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main () {
  loadCache()

  console.log('=' .repeat(80))
  console.log('LARGE-SCALE BIO PREDICTOR COMPARISON TEST')
  console.log(`Target: ${LIMIT} bodies | Systems: ${SYSTEM_IDS.length}`)
  console.log('=' .repeat(80))
  console.log()

  const summary = {
    daedalus: { tp: 0, fp: 0, fn: 0 },
    eb: { tp: 0, fp: 0, fn: 0 }
  }
  const daedalusFpByGenus = {}
  const daedalusFnByGenus = {}
  const ebFpByGenus = {}
  const ebFnByGenus = {}

  let bodiesTested = 0
  let systemsFetched = 0
  let systemsFailed = 0

  // Shuffle system IDs for randomness — use all cached systems plus SYSTEM_IDS
  const allIds = new Set(SYSTEM_IDS)
  for (const key of Object.keys(cache)) allIds.add(Number(key) || key)
  const shuffled = [...allIds].sort(() => Math.random() - 0.5)

  for (const id64 of shuffled) {
    if (bodiesTested >= LIMIT) break

    // Fetch system data
    let systemData
    if (cache[id64]) {
      systemData = cache[id64]
    } else {
      try {
        process.stdout.write(`  Fetching system ${id64}...`)
        const raw = await fetchWithRetry(`https://spansh.co.uk/api/dump/${id64}`)
        systemData = raw.system
        cache[id64] = systemData
        saveCache()
        systemsFetched++
        process.stdout.write(` ${systemData.name} (${systemData.bodies?.length || 0} bodies)\n`)
        // Rate limit: 500ms between requests
        await new Promise(r => setTimeout(r, 500))
      } catch (e) {
        systemsFailed++
        process.stdout.write(` FAILED: ${e.message}\n`)
        continue
      }
    }

    if (!systemData?.bodies) continue

    const allBodies = systemData.bodies.map(normalizeSpanshBody)
    const starPos = systemData.coords
      ? [systemData.coords.x, systemData.coords.y, systemData.coords.z]
      : null

    // Find bodies with bio signals (ground truth)
    const bioBodies = allBodies.filter(b =>
      b.type === 'Planet' &&
      b.signals?.genuses?.length > 0
    )

    for (const body of bioBodies) {
      if (bodiesTested >= LIMIT) break

      const groundTruth = new Set(body.signals.genuses.map(normalizeGenus))
      if (groundTruth.size === 0) continue

      // Daedalus prediction
      let daedalusPreds
      try {
        daedalusPreds = predictSpecies(body, allBodies, starPos)
      } catch (e) {
        if (VERBOSE) console.log(`  ERROR predicting ${body.name}: ${e.message}`)
        continue
      }
      const daedalusGenera = new Set(daedalusPreds.map(p => normalizeGenus(p.genus)))

      // ExplorationBuddy prediction
      const ebPreds = ebPredict(body, allBodies)
      const ebGenera = new Set(ebPreds.map(p => normalizeGenus(p.genus)))

      // Score: Daedalus
      for (const g of groundTruth) {
        if (daedalusGenera.has(g)) { summary.daedalus.tp++ }
        else { summary.daedalus.fn++; daedalusFnByGenus[g] = (daedalusFnByGenus[g] || 0) + 1 }
      }
      for (const g of daedalusGenera) {
        if (!groundTruth.has(g)) { summary.daedalus.fp++; daedalusFpByGenus[g] = (daedalusFpByGenus[g] || 0) + 1 }
      }

      // Score: ExplorationBuddy
      for (const g of groundTruth) {
        if (ebGenera.has(g)) { summary.eb.tp++ }
        else { summary.eb.fn++; ebFnByGenus[g] = (ebFnByGenus[g] || 0) + 1 }
      }
      for (const g of ebGenera) {
        if (!groundTruth.has(g)) { summary.eb.fp++; ebFpByGenus[g] = (ebFpByGenus[g] || 0) + 1 }
      }

      bodiesTested++

      if (VERBOSE) {
        const iTP = [...groundTruth].filter(g => daedalusGenera.has(g)).length
        const iFP = [...daedalusGenera].filter(g => !groundTruth.has(g)).length
        const iFN = [...groundTruth].filter(g => !daedalusGenera.has(g)).length
        const eTP = [...groundTruth].filter(g => ebGenera.has(g)).length
        const eFP = [...ebGenera].filter(g => !groundTruth.has(g)).length
        const eFN = [...groundTruth].filter(g => !ebGenera.has(g)).length
        console.log(`  [${bodiesTested}] ${body.name}: GT=${groundTruth.size} | Daedalus=${iTP}tp/${iFP}fp/${iFN}fn | EB=${eTP}tp/${eFP}fp/${eFN}fn`)
      } else if (bodiesTested % 50 === 0) {
        process.stdout.write(`  ... ${bodiesTested} bodies tested\n`)
      }
    }
  }

  // ─── Results ────────────────────────────────────────────────────────
  console.log()
  console.log('=' .repeat(80))
  console.log(`RESULTS — ${bodiesTested} bodies tested across ${Object.keys(cache).length} systems`)
  console.log(`  (${systemsFetched} fetched this run, ${systemsFailed} failed)`)
  console.log('=' .repeat(80))

  const iPrec = summary.daedalus.tp / (summary.daedalus.tp + summary.daedalus.fp) * 100
  const iRec = summary.daedalus.tp / (summary.daedalus.tp + summary.daedalus.fn) * 100
  const iF1 = 2 * iPrec * iRec / (iPrec + iRec)
  const ePrec = summary.eb.tp / (summary.eb.tp + summary.eb.fp) * 100
  const eRec = summary.eb.tp / (summary.eb.tp + summary.eb.fn) * 100
  const eF1 = 2 * ePrec * eRec / (ePrec + eRec)

  console.log()
  console.log('  ┌─────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐')
  console.log('  │ Method              │ True Pos │ False Pos│ Missed   │ Precision│ Recall   │ F1 Score │')
  console.log('  ├─────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤')
  console.log(`  │ Daedalus (probability)│ ${pad(summary.daedalus.tp)}│ ${pad(summary.daedalus.fp)}│ ${pad(summary.daedalus.fn)}│ ${padf(iPrec)}│ ${padf(iRec)}│ ${padf(iF1)}│`)
  console.log(`  │ ExplorationBuddy    │ ${pad(summary.eb.tp)}│ ${pad(summary.eb.fp)}│ ${pad(summary.eb.fn)}│ ${padf(ePrec)}│ ${padf(eRec)}│ ${padf(eF1)}│`)
  console.log('  └─────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘')

  // Top false positive genera
  console.log()
  console.log('  TOP DAEDALUS FALSE POSITIVES (genus predicted but not present):')
  printTopN(daedalusFpByGenus, 10)
  console.log()
  console.log('  TOP DAEDALUS MISSES (genus present but not predicted):')
  printTopN(daedalusFnByGenus, 10)
  console.log()
  console.log('  TOP EXPLORATION BUDDY FALSE POSITIVES:')
  printTopN(ebFpByGenus, 10)
  console.log()
  console.log('  TOP EXPLORATION BUDDY MISSES:')
  printTopN(ebFnByGenus, 10)
  console.log()
}

function pad (n) { return String(n).padStart(8) + ' ' }
function padf (n) { return (isNaN(n) ? 'N/A' : n.toFixed(1) + '%').padStart(8) + ' ' }

function printTopN (obj, n) {
  const sorted = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
  if (sorted.length === 0) { console.log('    (none)'); return }
  for (const [genus, count] of sorted) {
    console.log(`    ${genus.padEnd(20)} ${count}`)
  }
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
