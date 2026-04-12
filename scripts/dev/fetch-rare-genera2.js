#!/usr/bin/env node
/**
 * Fetch systems containing rare biological genera and add to the comparison cache.
 * Uses known system id64s and Spansh name search.
 */
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const CACHE_PATH = path.join(__dirname, '.comparison-cache.json')
let cache = {}
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) } catch {}

function fetchJSON (url) {
  const result = execSync(`curl -s -m 60 "${url}"`, { maxBuffer: 50 * 1024 * 1024 })
  return JSON.parse(result.toString())
}

function sleep (ms) {
  execSync(`powershell -c "Start-Sleep -Milliseconds ${ms}"`)
}

function lookupId64(systemName) {
  const url = `https://spansh.co.uk/api/systems/field_values/system_names?q=${encodeURIComponent(systemName)}`
  const data = fetchJSON(url)
  if (data?.min_max) {
    const match = data.min_max.find(m => m.name === systemName)
    if (match) return match.id64
  }
  return null
}

function fetchAndCache(id64, label) {
  if (cache[id64]) {
    console.log(`  [SKIP] id64 ${id64} already in cache`)
    return true
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
      console.log(`  [OK] ${data.system.name} — ${bioCount} bio bodies, genuses: ${[...genuses].join(', ').substring(0, 120)}`)
      return true
    }
  } catch (e) {
    console.log(`  [FAIL] ${label || id64}: ${e.message}`)
  }
  return false
}

// Known systems with rare genera (from community databases, Canonn, etc.)
const SYSTEMS_TO_FETCH = [
  // Crystalline Shards
  { name: 'HIP 36601', id64: 84456968626, target: 'Shards' },
  
  // Brain Trees
  { name: 'Synuefe XR-H d11-102', id64: 3515254557027, target: 'Brain Trees' },
  { name: 'Col 173 Sector LT-Q d5-82', id64: 2828177213779, target: 'Brain Trees' },
  
  // Anemone — especially on Metal-rich bodies
  { name: 'HD 43193', id64: 167244341, target: 'Anemone' },
  { name: 'NGC 2451A Sector IR-W d1-16', id64: 560400927059, target: 'Anemone' },
  
  // Search for additional systems by name
  { name: 'Flyiedge VN-W c4-51', target: 'Bark Mounds' },
  { name: 'NGC 1999 Sector HN-S b4-0', target: 'Amphora' },
  { name: 'Col 173 Sector CC-K b25-8', target: 'Tubers' },
  { name: 'Col 173 Sector GS-J d9-7', target: 'Bark Mounds/Tubers' },
  { name: 'Col 69 Sector VU-E b14-0', target: 'Tubers' },
  { name: 'Bleia Dryoae PD-S d4-25', target: 'Tubers' },
  { name: 'Col 285 Sector CV-Y d57', target: 'Amphora' },
  { name: 'IC 2391 Sector GW-V b2-4', target: 'Amphora' },
  { name: 'NGC 6188 Sector LC-V c2-28', target: 'Amphora' },
  { name: 'IC 2391 Sector ZE-A d101', target: 'Brain Trees' },
  { name: 'IC 2391 Sector FL-X b1-7', target: 'Brain Trees' },
  { name: 'Synuefe TP-F b44-0', target: 'Brain Trees' },
  { name: 'HIP 26176', target: 'Bark Mounds' },
  { name: 'HIP 69200', target: 'Bark Mounds' },
  { name: 'California Sector JH-V c2-12', target: 'Bark Mounds' },
  { name: 'Pleiades Sector IR-W d1-55', target: 'Bark Mounds' },
  { name: 'Musca Dark Region PJ-P b6-1', target: 'Fumerola' },
  { name: 'Eta Carina Sector DL-Y d23', target: 'Fumerola/Anemone' },
  { name: 'Col 285 Sector KS-T d3-82', target: 'Recepta' },
  { name: 'Kyloall CL-Y g1518', target: 'Recepta' },
]

async function main () {
  console.log('Fetching rare genus systems...\n')
  
  let added = 0
  for (const sys of SYSTEMS_TO_FETCH) {
    let id64 = sys.id64
    
    if (!id64) {
      // Look up by name
      process.stdout.write(`Looking up "${sys.name}"... `)
      id64 = lookupId64(sys.name)
      if (id64) {
        console.log(`id64: ${id64}`)
      } else {
        console.log(`NOT FOUND`)
        sleep(300)
        continue
      }
      sleep(300)
    }
    
    console.log(`Fetching ${sys.name} [${sys.target}] (id64: ${id64})`)
    if (fetchAndCache(id64, sys.name)) {
      added++
    }
    sleep(500)
  }

  // Save cache
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache))
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Cache: ${Object.keys(cache).length} systems total (${added} processed this run)`)
  
  // Print genus coverage
  const genusCounts = {}
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
  function ng(n) { return GENUS_MAP[n] || n }

  for (const sys of Object.values(cache)) {
    if (!sys?.bodies) continue
    for (const b of sys.bodies) {
      if (b.type !== 'Planet' || !b.signals?.genuses?.length) continue
      for (const g of b.signals.genuses) {
        const name = ng(g)
        genusCounts[name] = (genusCounts[name] || 0) + 1
      }
    }
  }
  console.log('\nGenus coverage (bodies with each genus):')
  for (const [g, c] of Object.entries(genusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(5)}  ${g}`)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
