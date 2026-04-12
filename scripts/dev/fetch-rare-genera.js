#!/usr/bin/env node
/**
 * Fetch systems containing rare biological genera and add to the comparison cache.
 * Uses Spansh search API to find systems with specific genuses.
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

function postJSON (url, body) {
  const bodyStr = JSON.stringify(body).replace(/"/g, '\\"')
  const result = execSync(`curl -s -m 60 -X POST -H "Content-Type: application/json" -d "${bodyStr}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 })
  return JSON.parse(result.toString())
}

function sleep (ms) {
  execSync(`powershell -c "Start-Sleep -Milliseconds ${ms}"`)
}

// Systems known to contain specific rare genera (from community databases)
// These are well-known systems documented on EDSM/Canonn/etc.
const RARE_GENUS_SYSTEMS = {
  // Amphora Plant - found near nebulae
  Amphora: [
    'Col 285 Sector CV-Y d57',   // Known amphora system
    'Plaa Aec IZ-N c20-1',      // Another documented amphora
    'Dryau Aowsy',               // Famous biological system
  ],
  // Additional Tubers (Sinuous Tubers) systems
  Tubers: [
    'Col 173 Sector LT-Q d5-82',  // Known tuber system
    'Bleia Dryoae PD-S d4-25',    // Another tuber location
  ],
  // Additional Shards (Crystalline Shards) systems
  Shards: [
    'HIP 36601',                  // Famous crystal shards system
    'Col 173 Sector LT-Q d5-3',   
  ],
  // Additional Bark Mounds systems
  'Bark Mounds': [
    'Col 173 Sector OD-J d9-46',  
    'Flyiedge VN-W c4-51',       
  ],
  // Additional Fumerola systems
  Fumerola: [
    'Eta Carina Sector DL-Y d23', 
    'Col 285 Sector KS-T d3-82',  
  ],
  // Additional Recepta systems
  Recepta: [
    'Prua Phoe UO-N c8-22',     
  ],
  // Anemone - need more Metal-rich body examples
  Anemone: [
    'HD 43193',                   // Known anemone
    'Col 285 Sector CV-Y d57',    
  ],
  // Brain Trees
  'Brain Trees': [
    'Col 173 Sector LT-Q d5-82',  
    'Synuefe XR-H d11-102',      // Famous brain tree system
  ],
}

async function main () {
  console.log('Fetching rare genus systems for test cache...\n')
  
  // Strategy: Use Spansh system search to find systems with specific genuses
  // First, try direct system name lookups for known systems
  
  // Known system id64s for rare genera (gathered from community data)
  // These are systems verified to contain the specified genera
  const knownSystems = [
    // HIP 36601 - famous Crystalline Shards system
    { name: 'HIP 36601', target: 'Shards' },
    // Synuefe XR-H d11-102 - brain trees
    { name: 'Synuefe XR-H d11-102', target: 'Brain Trees' },
    // HD 43193 - anemone
    { name: 'HD 43193', target: 'Anemone' },
  ]

  // Use Spansh search API to find systems by name and get their id64
  for (const sys of knownSystems) {
    console.log(`Looking up ${sys.name} (target: ${sys.target})...`)
    try {
      const searchUrl = `https://spansh.co.uk/api/systems/search?q=${encodeURIComponent(sys.name)}`
      const results = fetchJSON(searchUrl)
      if (results && results.length > 0) {
        const id64 = results[0].id64 || results[0].system_id64
        console.log(`  Found id64: ${id64}`)
        if (id64 && !cache[id64]) {
          console.log(`  Fetching full system data...`)
          try {
            const data = fetchJSON(`https://spansh.co.uk/api/dump/${id64}`)
            if (data?.system) {
              cache[id64] = data.system
              console.log(`  Added: ${data.system.name} (${data.system.bodies?.length || 0} bodies)`)
              const genuses = new Set()
              for (const b of data.system.bodies || []) {
                for (const g of b.signals?.genuses || []) genuses.add(g)
              }
              console.log(`  Genuses: ${[...genuses].join(', ')}`)
            }
          } catch (e) {
            console.log(`  Failed to fetch: ${e.message}`)
          }
          sleep(500)
        } else if (cache[id64]) {
          console.log(`  Already in cache`)
        }
      } else {
        console.log(`  Not found in search`)
      }
    } catch (e) {
      console.log(`  Search failed: ${e.message}`)
    }
    sleep(500)
  }

  // Now use Spansh bodies search to find systems with specific rare genuses
  // The bodies API lets us filter by has_biology and specific genus
  const rareGenuses = [
    { codexName: '$Codex_Ent_Seed_Genus_Name;', displayName: 'Amphora', count: 5 },
    { codexName: '$Codex_Ent_Tube_Name;', displayName: 'Tubers', count: 3 },
    { codexName: '$Codex_Ent_Tube_Genus_Name;', displayName: 'Tubers', count: 3 },
    { codexName: '$Codex_Ent_Ground_Struct_Ice_Name;', displayName: 'Shards', count: 3 },
    { codexName: '$Codex_Ent_Ground_Struct_Ice_Genus_Name;', displayName: 'Shards', count: 3 },
    { codexName: '$Codex_Ent_Cone_Name;', displayName: 'Bark Mounds', count: 3 },
    { codexName: '$Codex_Ent_Cone_Genus_Name;', displayName: 'Bark Mounds', count: 3 },
    { codexName: '$Codex_Ent_Recepta_Genus_Name;', displayName: 'Recepta', count: 3 },
    { codexName: '$Codex_Ent_Sphere_Name;', displayName: 'Anemone', count: 3 },
    { codexName: '$Codex_Ent_Sphere_Genus_Name;', displayName: 'Anemone', count: 3 },
    { codexName: '$Codex_Ent_Brancae_Name;', displayName: 'Brain Trees', count: 3 },
    { codexName: '$Codex_Ent_Brancae_Genus_Name;', displayName: 'Brain Trees', count: 3 },
    { codexName: '$Codex_Ent_Vents_Genus_Name;', displayName: 'Fumerola', count: 3 },
    { codexName: '$Codex_Ent_Fumerolas_Genus_Name;', displayName: 'Fumerola', count: 3 },
  ]

  // Try Spansh bodies search
  for (const rg of rareGenuses) {
    console.log(`\nSearching for ${rg.displayName} systems (${rg.codexName})...`)
    try {
      const searchBody = {
        filters: {
          subtype: { value: ['Rocky body', 'High metal content world', 'Metal-rich body', 'Icy body', 'Rocky Ice world'] },
          biology: { value: [rg.codexName] }
        },
        sort: [{ distance_to_arrival: { direction: 'asc' } }],
        size: rg.count * 2
      }
      
      // Use the Spansh bodies search endpoint
      const bodyStr = JSON.stringify(searchBody)
      const escaped = bodyStr.replace(/"/g, '\\"')
      const result = execSync(
        `curl -s -m 60 -X POST -H "Content-Type: application/json" -d "${escaped}" "https://spansh.co.uk/api/bodies/search"`,
        { maxBuffer: 50 * 1024 * 1024 }
      )
      const response = JSON.parse(result.toString())
      
      if (response?.results?.length > 0) {
        let added = 0
        const seenSystems = new Set()
        for (const r of response.results) {
          if (added >= rg.count) break
          const id64 = r.system_id64
          if (!id64 || cache[id64] || seenSystems.has(id64)) continue
          seenSystems.add(id64)
          
          console.log(`  Fetching ${r.system_name || r.name} (id64: ${id64})...`)
          try {
            const data = fetchJSON(`https://spansh.co.uk/api/dump/${id64}`)
            if (data?.system) {
              cache[id64] = data.system
              added++
              const genuses = new Set()
              for (const b of data.system.bodies || []) {
                for (const g of b.signals?.genuses || []) genuses.add(g)
              }
              console.log(`  Added: ${data.system.name} (${data.system.bodies?.length || 0} bodies, genuses: ${[...genuses].join(', ').substring(0, 100)})`)
            }
          } catch (e) {
            console.log(`  Failed: ${e.message}`)
          }
          sleep(500)
        }
        console.log(`  Added ${added} new systems for ${rg.displayName}`)
      } else if (response?.search_reference) {
        // Spansh async search - need to poll
        const ref = response.search_reference
        console.log(`  Async search started: ${ref}`)
        let attempts = 0
        while (attempts < 15) {
          sleep(2000)
          attempts++
          try {
            const poll = fetchJSON(`https://spansh.co.uk/api/bodies/search/${ref}`)
            if (poll?.results?.length > 0) {
              let added = 0
              const seenSystems = new Set()
              for (const r of poll.results) {
                if (added >= rg.count) break
                const id64 = r.system_id64
                if (!id64 || cache[id64] || seenSystems.has(id64)) continue
                seenSystems.add(id64)
                
                console.log(`  Fetching ${r.system_name || 'unknown'} (id64: ${id64})...`)
                try {
                  const data = fetchJSON(`https://spansh.co.uk/api/dump/${id64}`)
                  if (data?.system) {
                    cache[id64] = data.system
                    added++
                    const genuses = new Set()
                    for (const b of data.system.bodies || []) {
                      for (const g of b.signals?.genuses || []) genuses.add(g)
                    }
                    console.log(`  Added: ${data.system.name} (${data.system.bodies?.length || 0} bodies)`)
                  }
                } catch (e) {
                  console.log(`  Failed: ${e.message}`)
                }
                sleep(500)
              }
              console.log(`  Added ${added} new systems for ${rg.displayName}`)
              break
            } else if (poll?.count === 0) {
              console.log(`  No results found`)
              break
            }
            process.stdout.write('.')
          } catch {
            process.stdout.write('x')
          }
        }
      } else {
        console.log(`  No results: ${JSON.stringify(response).substring(0, 200)}`)
      }
    } catch (e) {
      console.log(`  Search error: ${e.message}`)
    }
  }

  // Save cache
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache))
  console.log(`\nCache saved: ${Object.keys(cache).length} systems total`)
  
  // Print final genus coverage
  const genusCounts = {}
  for (const sys of Object.values(cache)) {
    if (!sys?.bodies) continue
    for (const b of sys.bodies) {
      if (b.type !== 'Planet' || !b.signals?.genuses?.length) continue
      for (const g of b.signals.genuses) {
        genusCounts[g] = (genusCounts[g] || 0) + 1
      }
    }
  }
  console.log('\nGenus coverage in cache:')
  for (const [g, c] of Object.entries(genusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(5)}  ${g}`)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
