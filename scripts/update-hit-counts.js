#!/usr/bin/env node
/**
 * update-hit-counts.js
 *
 * Fetches fresh observation counts from Canonn Research Group's dump CSVs
 * and updates the "# hit count: NNNN" comments in bio-criteria.json.
 *
 * Species-level counts = sum of all variant dump CSV row counts.
 * Sub-branch counts are NOT updated (they require cross-referencing body types).
 *
 * Usage:
 *   node scripts/update-hit-counts.js [--dry-run]
 *
 * --dry-run  Show old vs new counts without writing changes
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ─── Config ───────────────────────────────────────────────────────────

const CODEX_REF_PATH = path.resolve(__dirname, '../../SrvSurvey/docs/codexRef.json')
const BIO_CRITERIA_PATH = path.resolve(__dirname, '../src/service/lib/data/bio-criteria.json')
const CONCURRENCY = 15 // parallel HTTP requests
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Helpers ──────────────────────────────────────────────────────────

/** Count lines in a remote CSV file */
function countCsvRows (url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        resolve(0) // missing dump = 0 observations
        res.resume()
        return
      }
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        const lines = data.trim().split('\n').filter(l => l.trim().length > 0)
        resolve(lines.length)
      })
      res.on('error', () => resolve(0))
    }).on('error', () => resolve(0))
  })
}

/** Run promises with concurrency limit */
async function parallelLimit (tasks, limit) {
  const results = []
  let idx = 0

  async function worker () {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main () {
  console.log('Loading codexRef.json...')
  const codexRef = JSON.parse(fs.readFileSync(CODEX_REF_PATH, 'utf8'))

  // Filter to Odyssey biology entries with dumps
  const odysseyBio = Object.entries(codexRef)
    .filter(([, v]) => v.hud_category === 'Biology' && v.platform === 'odyssey' && v.reward > 0 && v.dump)
    .map(([id, v]) => ({
      id,
      name: v.english_name,
      dump: v.dump,
      subClass: v.sub_class
    }))

  console.log(`Found ${odysseyBio.length} Odyssey bio variants with dump URLs`)

  // Also get legacy entries
  const legacyBio = Object.entries(codexRef)
    .filter(([, v]) => v.hud_category === 'Biology' && v.platform === 'legacy' && v.dump)
    .map(([id, v]) => ({
      id,
      name: v.english_name,
      dump: v.dump,
      subClass: v.sub_class
    }))

  console.log(`Found ${legacyBio.length} legacy bio entries with dump URLs`)

  const allBio = [...odysseyBio, ...legacyBio]

  // Group by species
  // Odyssey: first 5 digits of entryId = species, last 2 = variant color
  // Legacy: each entry is its own species (don't group by prefix)
  const bySpecies = {}
  for (const entry of odysseyBio) {
    const speciesKey = entry.id.substring(0, 5)
    if (!bySpecies[speciesKey]) {
      // Extract species english name (remove variant color suffix)
      const parts = entry.name.split(' - ')
      const speciesName = parts[0] || entry.name
      bySpecies[speciesKey] = { name: speciesName, subClass: entry.subClass, entries: [] }
    }
    bySpecies[speciesKey].entries.push(entry)
  }
  for (const entry of legacyBio) {
    // Each legacy entry is its own "species" — don't group by 5-digit prefix
    bySpecies[entry.id] = { name: entry.name, subClass: entry.subClass, entries: [entry] }
  }

  console.log(`Grouped into ${Object.keys(bySpecies).length} species groups`)
  console.log(`\nFetching row counts from ${allBio.length} Canonn dump CSVs (concurrency: ${CONCURRENCY})...\n`)

  // Fetch all dump CSV row counts
  let completed = 0
  const tasks = allBio.map(entry => async () => {
    const count = await countCsvRows(entry.dump)
    completed++
    if (completed % 50 === 0 || completed === allBio.length) {
      process.stdout.write(`  ${completed}/${allBio.length} fetched\r`)
    }
    return { id: entry.id, count }
  })

  const results = await parallelLimit(tasks, CONCURRENCY)
  console.log(`\nAll fetches complete.`)

  // Build species-level totals
  const variantCounts = {}
  for (const r of results) {
    variantCounts[r.id] = r.count
  }

  const speciesCounts = {}
  for (const [speciesKey, species] of Object.entries(bySpecies)) {
    let total = 0
    for (const entry of species.entries) {
      total += variantCounts[entry.id] || 0
    }
    speciesCounts[speciesKey] = { name: species.name, count: total, subClass: species.subClass }
  }

  // ─── Map species names to bio-criteria.json species ───────────────

  // Build a lookup from English species name -> count
  // bio-criteria.json uses genus + species (e.g., genus="Bacterium", species="Aurasus")
  // codexRef uses "Bacterium Aurasus"
  // Legacy species use just the species name (e.g., "Roseum Brain Tree")
  const speciesLookup = {}
  for (const [, info] of Object.entries(speciesCounts)) {
    speciesLookup[info.name] = info.count
  }

  // ─── Update bio-criteria.json ─────────────────────────────────────

  console.log('\nLoading bio-criteria.json...')
  const criteriaText = fs.readFileSync(BIO_CRITERIA_PATH, 'utf8')
  const criteria = JSON.parse(criteriaText)

  const changes = []

  function updateHitCounts (node, genusName, insideSpecies = false) {
    const speciesName = node.species
    const isSpeciesNode = !!speciesName
    const fullName = genusName && speciesName ? `${genusName} ${speciesName}` : null

    // Update species-level hit counts only on nodes that have a `species` property
    if (node.query && fullName) {
      // Try genus+species first (Odyssey), then species-only (legacy naming)
      const newCount = speciesLookup[fullName] ?? speciesLookup[speciesName]
      if (newCount != null) {
        // Find existing hit count in query array
        let found = false
        for (let i = 0; i < node.query.length; i++) {
          const m = typeof node.query[i] === 'string' && node.query[i].match(/^(\s*#\s*hit\s*count:\s*)(\d+)/i)
          if (m) {
            const oldCount = parseInt(m[2])
            if (oldCount !== newCount) {
              changes.push({ species: speciesLookup[fullName] != null ? fullName : speciesName, old: oldCount, new: newCount, ratio: (newCount / oldCount).toFixed(2) })
              node.query[i] = node.query[i].replace(/^(\s*#\s*hit\s*count:\s*)\d+/i, `$1${newCount}`)
            }
            found = true
            break
          }
        }
        if (!found && newCount > 0) {
          // Insert hit count as first query entry
          node.query.unshift(`# hit count: ${newCount}`)
          changes.push({ species: speciesLookup[fullName] != null ? fullName : speciesName, old: 0, new: newCount, ratio: 'NEW' })
        }
      }
    }

    // Recurse into children — mark descendants as "inside species" to prevent
    // anonymous sub-branch leaves from being treated as species nodes
    if (node.children) {
      for (const child of node.children) {
        updateHitCounts(child, genusName, insideSpecies || isSpeciesNode)
      }
    }
  }

  // Process each genus — start from the genus node itself so genus-level
  // species (Bark Mounds, Crystalline Shards) are also updated
  for (const genus of criteria) {
    updateHitCounts(genus, genus.genus, false)
  }

  // ─── Report ───────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(72)}`)
  console.log('SPECIES-LEVEL HIT COUNT CHANGES')
  console.log('═'.repeat(72))

  if (changes.length === 0) {
    console.log('No changes detected.')
  } else {
    // Sort by ratio descending for interesting view
    changes.sort((a, b) => {
      const ra = typeof a.ratio === 'string' ? 999 : parseFloat(a.ratio)
      const rb = typeof b.ratio === 'string' ? 999 : parseFloat(b.ratio)
      return rb - ra
    })

    console.log(`${'Species'.padEnd(35)} ${'Old'.padStart(10)} ${'New'.padStart(10)} ${'Ratio'.padStart(8)}`)
    console.log('─'.repeat(72))
    for (const c of changes) {
      console.log(`${c.species.padEnd(35)} ${String(c.old).padStart(10)} ${String(c.new).padStart(10)} ${String(c.ratio + 'x').padStart(8)}`)
    }
    console.log('─'.repeat(72))
    console.log(`Total changes: ${changes.length}`)
  }

  // Summary stats
  const totalOld = changes.reduce((s, c) => s + c.old, 0)
  const totalNew = changes.reduce((s, c) => s + c.new, 0)
  console.log(`\nTotal observations: ${totalOld.toLocaleString()} -> ${totalNew.toLocaleString()} (${(totalNew / totalOld).toFixed(2)}x growth)`)

  // List any species in bio-criteria.json that we couldn't find counts for
  const missingSpecies = []
  function findMissing (node, genusName) {
    if (node.species && genusName) {
      const fullName = `${genusName} ${node.species}`
      if (!speciesLookup[fullName] && !speciesLookup[node.species]) {
        missingSpecies.push(fullName)
      }
    }
    if (node.children) {
      for (const child of node.children) findMissing(child, genusName)
    }
  }
  for (const genus of criteria) {
    findMissing(genus, genus.genus)
  }
  if (missingSpecies.length > 0) {
    console.log(`\n⚠ Species in bio-criteria.json with NO Canonn data:`)
    for (const s of missingSpecies) console.log(`  - ${s}`)
  }

  // ─── Write ────────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files written.')
  } else if (changes.length > 0) {
    const output = JSON.stringify(criteria, null, 2) + '\n'
    fs.writeFileSync(BIO_CRITERIA_PATH, output, 'utf8')
    console.log(`\n✓ Updated ${BIO_CRITERIA_PATH}`)
  } else {
    console.log('\nNo changes to write.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
