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
      console.log(`  [OK] ${data.system.name} - ${bioCount} bio bodies, genuses: ${[...genuses].join(', ').substring(0, 200)}`)
      return bioCount > 0 ? 'ok' : 'empty'
    }
  } catch (e) {
    console.log(`  [FAIL] ${label}: ${e.message}`)
  }
  return 'fail'
}

const SYSTEMS = [
  // Amphora - Witch Head Nebula area
  { name: 'Witch Head Sector FB-X c1-8', target: 'Amphora' },
  { name: 'Witch Head Sector LC-V c2-10', target: 'Amphora' },
  { name: 'Witch Head Sector HW-W c1-9', target: 'Amphora' },
  { name: 'Witch Head Sector GW-W c1-4', target: 'Amphora' },
  { name: 'Witch Head Sector DL-Y d17', target: 'Amphora' },
  
  // Tubers - Guardian space
  { name: 'Synuefe TP-F b44-0', target: 'Tubers' },
  { name: 'Col 173 Sector ME-P d6-92', target: 'Tubers' },
  { name: 'Synuefe GT-H b43-1', target: 'Tubers' },
  { name: 'NGC 2451A Sector LX-U d2-25', target: 'Tubers' },
  { name: 'Synuefe CE-R c21-6', target: 'Tubers' },
  { name: 'Synuefe NL-N c23-4', target: 'Tubers' },
  { name: 'HD 63154', target: 'Tubers' },
  
  // More Recepta
  { name: 'HD 76133', target: 'Recepta' },
  { name: 'HIP 36210', target: 'Recepta' },
  
  // More Fumerola  
  { name: 'HIP 98621', target: 'Fumerola' },
  { name: 'Col 285 Sector UZ-O d6-88', target: 'Fumerola' },
]

for (const sys of SYSTEMS) {
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
