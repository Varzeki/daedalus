#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const CACHE_PATH = path.join(__dirname, '.comparison-cache.json')
let cache = {}
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) } catch {}

function fetchJSON (url) {
  return JSON.parse(execSync(`curl -s -m 60 "${url}"`, { maxBuffer: 50 * 1024 * 1024 }).toString())
}

function sleep (ms) {
  execSync(`powershell -c "Start-Sleep -Milliseconds ${ms}"`)
}

function lookupId64 (name) {
  const d = fetchJSON(`https://spansh.co.uk/api/systems/field_values/system_names?q=${encodeURIComponent(name)}`)
  const m = d?.min_max?.find(x => x.name === name)
  return m?.id64
}

function fetchAndCache (id64, label) {
  if (cache[id64]) {
    console.log(`  [SKIP] ${label} already cached`)
    return 'skip'
  }
  try {
    const data = fetchJSON(`https://spansh.co.uk/api/dump/${id64}`)
    if (data?.system) {
      cache[id64] = data.system
      const genuses = new Set()
      let bioCount = 0
      for (const b of data.system.bodies || []) {
        if (b.signals?.genuses?.length > 0) {
          bioCount++
          for (const g of b.signals.genuses) genuses.add(g)
        }
      }
      console.log(`  [OK] ${data.system.name} — ${bioCount} bio bodies, genuses: ${[...genuses].join(', ').substring(0, 150)}`)
      return bioCount > 0 ? 'ok' : 'empty'
    }
  } catch (e) {
    console.log(`  [FAIL] ${label}: ${e.message}`)
  }
  return 'fail'
}

// More systems to try
const EXTRA_SYSTEMS = [
  // Tubers
  { name: 'Blaa Eohn JR-W d1-10', target: 'Tubers' },
  { name: 'Dryaa Pruae TT-P d5-20', target: 'Tubers' },
  { name: 'Dryaa Pruae OR-U d3-8', target: 'Tubers' },

  // Bark Mounds
  { name: 'Pleiades Sector PN-T b3-0', target: 'Bark Mounds' },
  { name: 'Vela Dark Region DL-Y d91', target: 'Bark Mounds' },

  // Fumerola extra
  { name: 'Byoi Aip VE-R d4-58', target: 'Fumerola' },

  // Recepta extra
  { name: 'Prua Phoe YZ-R d4-59', target: 'Recepta' },

  // Anemone extra
  { name: 'Wregoe GC-K d8-19', target: 'Anemone' },
  { name: 'BD+22 3878', target: 'Anemone' },

  // Amphora
  { name: 'Col 285 Sector RS-T d3-60', target: 'Amphora' },
  { name: 'Witch Head Sector DL-Y d17', target: 'Amphora' },
  { name: 'HIP 16460', target: 'Amphora' },
  
  // Systems that definitely have landmark bios from the SrvSurvey test set
  // but let's also add some from known community POIs
  { name: 'Synuefe EN-H d11-96', target: 'Brain Trees' },
  { name: 'Synuefe EN-H d11-28', target: 'Brain Trees' },
  { name: 'Col 173 Sector OD-J d9-46', target: 'Brain Trees' },
  { name: 'Synuefe BU-E b45-2', target: 'Brain Trees' },
]

async function main () {
  for (const sys of EXTRA_SYSTEMS) {
    process.stdout.write(`${sys.name} [${sys.target}]... `)
    const id64 = lookupId64(sys.name)
    if (!id64) {
      console.log('NOT FOUND')
      sleep(300)
      continue
    }
    console.log(`id64: ${id64}`)
    fetchAndCache(id64, sys.name)
    sleep(500)
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache))

  // Print coverage
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
  }
  function ng (n) { return GENUS_MAP[n] || n }

  const genusCounts = {}
  for (const sys of Object.values(cache)) {
    if (!sys?.bodies) continue
    for (const b of sys.bodies) {
      if (b.type !== 'Planet' || !b.signals?.genuses?.length) continue
      for (const g of b.signals.genuses) genusCounts[ng(g)] = (genusCounts[ng(g)] || 0) + 1
    }
  }
  console.log(`\nCache: ${Object.keys(cache).length} systems`)
  console.log('Genus coverage:')
  for (const [g, c] of Object.entries(genusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(5)}  ${g}`)
  }
}

main()
