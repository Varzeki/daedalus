#!/usr/bin/env node
/**
 * Detailed analysis of bio predictor false positives/negatives.
 * Reads cached comparison test data and identifies patterns.
 */
const path = require('path')
const fs = require('fs')
const { predictSpecies } = require('../../src/service/lib/bio-predictor')

const CACHE_PATH = path.join(__dirname, '.comparison-cache.json')
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))

// Reuse the same GENUS_MAP from comparison-test-1000.js
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
  Amphora: 'Amphora',
  Anemone: 'Anemone',
  Shards: 'Shards',
  Tubers: 'Tubers'
}

function ng (name) { return GENUS_MAP[name] || name }
function norm (b) {
  if (b.mainStar !== undefined && b.isMainStar === undefined) b.isMainStar = b.mainStar
  return b
}

// Collect all false positives and negatives with body details
const fpDetails = {}  // genus -> [{body details}]
const fnDetails = {}  // genus -> [{body details}]
const fpBySpecies = {} // "genus species" -> count
let totalTP = 0, totalFP = 0, totalFN = 0
let bodiesTested = 0

for (const [id64, sys] of Object.entries(cache)) {
  if (!sys?.bodies) continue
  const allBodies = sys.bodies.map(norm)
  const starPos = sys.coords ? [sys.coords.x, sys.coords.y, sys.coords.z] : null

  for (const body of allBodies) {
    if (body.type !== 'Planet' || !body.signals?.genuses?.length) continue
    const gt = new Set(body.signals.genuses.map(ng))
    if (gt.size === 0) continue

    let preds
    try { preds = predictSpecies(body, allBodies, starPos) } catch { continue }
    const predGenera = new Set(preds.map(p => ng(p.genus)))
    bodiesTested++

    // True positives
    for (const g of gt) {
      if (predGenera.has(g)) totalTP++
    }

    // False positives
    for (const g of predGenera) {
      if (!gt.has(g)) {
        totalFP++
        if (!fpDetails[g]) fpDetails[g] = []
        const species = preds.filter(p => ng(p.genus) === g).map(p => ({
          name: p.species,
          prob: p.probability
        }))
        for (const s of species) {
          const key = `${g} ${s.name}`
          fpBySpecies[key] = (fpBySpecies[key] || 0) + 1
        }
        fpDetails[g].push({
          bodyName: body.name, subType: body.subType,
          atmosType: body.atmosphereType || '(none)',
          atmosComp: body.atmosphereComposition,
          temp: Math.round(body.surfaceTemperature || 0),
          gravity: (body.gravity || 0).toFixed(3),
          volcanism: body.volcanismType || '(none)',
          dist: Math.round(body.distanceToArrival || 0),
          species,
          groundTruth: [...gt].sort()
        })
      }
    }

    // False negatives
    for (const g of gt) {
      if (!predGenera.has(g)) {
        totalFN++
        if (!fnDetails[g]) fnDetails[g] = []
        fnDetails[g].push({
          bodyName: body.name, subType: body.subType,
          atmosType: body.atmosphereType || '(none)',
          atmosComp: body.atmosphereComposition,
          temp: Math.round(body.surfaceTemperature || 0),
          gravity: (body.gravity || 0).toFixed(3),
          volcanism: body.volcanismType || '(none)',
          dist: Math.round(body.distanceToArrival || 0),
          groundTruth: [...gt].sort(),
          predicted: [...predGenera].sort()
        })
      }
    }
  }
}

console.log(`\nBodies tested: ${bodiesTested}`)
console.log(`TP: ${totalTP}, FP: ${totalFP}, FN: ${totalFN}`)
console.log(`Precision: ${(totalTP / (totalTP + totalFP) * 100).toFixed(1)}%`)
console.log(`Recall: ${(totalTP / (totalTP + totalFN) * 100).toFixed(1)}%\n`)

// ─── FALSE POSITIVE ANALYSIS ─────────────────────────────────────────
console.log('═'.repeat(80))
console.log('FALSE POSITIVE ANALYSIS (predicted but not present)')
console.log('═'.repeat(80))

const fpSorted = Object.entries(fpDetails).sort((a, b) => b[1].length - a[1].length)
for (const [genus, items] of fpSorted) {
  console.log(`\n── ${genus}: ${items.length} FPs ──`)

  // Analyze patterns: atmosphere types
  const atmosCounts = {}
  const subTypeCounts = {}
  const volcCounts = {}
  const tempRange = { min: Infinity, max: -Infinity }
  const gravRange = { min: Infinity, max: -Infinity }

  for (const d of items) {
    atmosCounts[d.atmosType] = (atmosCounts[d.atmosType] || 0) + 1
    subTypeCounts[d.subType] = (subTypeCounts[d.subType] || 0) + 1
    volcCounts[d.volcanism] = (volcCounts[d.volcanism] || 0) + 1
    const t = d.temp
    const g = parseFloat(d.gravity)
    if (t < tempRange.min) tempRange.min = t
    if (t > tempRange.max) tempRange.max = t
    if (g < gravRange.min) gravRange.min = g
    if (g > gravRange.max) gravRange.max = g
  }

  console.log(`  Atmosphere breakdown:`)
  for (const [a, c] of Object.entries(atmosCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${a}: ${c} (${(c / items.length * 100).toFixed(0)}%)`)
  }
  console.log(`  Body type breakdown:`)
  for (const [a, c] of Object.entries(subTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${a}: ${c} (${(c / items.length * 100).toFixed(0)}%)`)
  }
  console.log(`  Volcanism breakdown:`)
  for (const [a, c] of Object.entries(volcCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`    ${a}: ${c} (${(c / items.length * 100).toFixed(0)}%)`)
  }
  console.log(`  Temp range: ${tempRange.min}K - ${tempRange.max}K`)
  console.log(`  Gravity range: ${gravRange.min}g - ${gravRange.max}g`)

  // Species breakdown
  const speciesInGenus = {}
  for (const d of items) {
    for (const s of d.species) {
      speciesInGenus[s.name] = (speciesInGenus[s.name] || 0) + 1
    }
  }
  console.log(`  FP species breakdown:`)
  for (const [s, c] of Object.entries(speciesInGenus).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${s}: ${c}`)
  }

  // Show sample bodies
  console.log(`  Sample FP bodies (first 5):`)
  for (const d of items.slice(0, 5)) {
    console.log(`    ${d.bodyName} | ${d.subType} | ${d.atmosType} | T=${d.temp}K G=${d.gravity}`)
    console.log(`      Predicted: ${d.species.map(s => s.name + '(' + s.prob + '%)').join(', ')}`)
    console.log(`      GT: ${d.groundTruth.join(', ')}`)
  }
}

// ─── FALSE NEGATIVE ANALYSIS ─────────────────────────────────────────
console.log('\n' + '═'.repeat(80))
console.log('FALSE NEGATIVE ANALYSIS (present but not predicted)')
console.log('═'.repeat(80))

const fnSorted = Object.entries(fnDetails).sort((a, b) => b[1].length - a[1].length)
for (const [genus, items] of fnSorted) {
  console.log(`\n── ${genus}: ${items.length} misses ──`)

  const atmosCounts = {}
  const subTypeCounts = {}
  const volcCounts = {}
  const tempRange = { min: Infinity, max: -Infinity }

  for (const d of items) {
    atmosCounts[d.atmosType] = (atmosCounts[d.atmosType] || 0) + 1
    subTypeCounts[d.subType] = (subTypeCounts[d.subType] || 0) + 1
    volcCounts[d.volcanism] = (volcCounts[d.volcanism] || 0) + 1
    if (d.temp < tempRange.min) tempRange.min = d.temp
    if (d.temp > tempRange.max) tempRange.max = d.temp
  }

  console.log(`  Atmosphere breakdown:`)
  for (const [a, c] of Object.entries(atmosCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${a}: ${c} (${(c / items.length * 100).toFixed(0)}%)`)
  }
  console.log(`  Body type breakdown:`)
  for (const [a, c] of Object.entries(subTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${a}: ${c}`)
  }
  console.log(`  Volcanism breakdown:`)
  for (const [a, c] of Object.entries(volcCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`    ${a}: ${c}`)
  }
  console.log(`  Temp range: ${tempRange.min}K - ${tempRange.max}K`)

  // Show ALL bodies
  console.log(`  All missed bodies:`)
  for (const d of items) {
    console.log(`    ${d.bodyName} | ${d.subType} | ${d.atmosType} | T=${d.temp}K G=${d.gravity} | Volc: ${d.volcanism}`)
    console.log(`      GT: ${d.groundTruth.join(', ')}`)
    console.log(`      Predicted genera: ${d.predicted.join(', ') || '(none)'}`)
  }
}

// ─── TOP FALSE-POSITIVE SPECIES (across all genera) ──────────────────
console.log('\n' + '═'.repeat(80))
console.log('TOP FALSE-POSITIVE SPECIES (individual species predictions that were wrong)')
console.log('═'.repeat(80))
const topFpSpecies = Object.entries(fpBySpecies).sort((a, b) => b[1] - a[1]).slice(0, 25)
for (const [sp, count] of topFpSpecies) {
  console.log(`  ${sp.padEnd(40)} ${count}`)
}

// ─── PROBABILITY DISTRIBUTION of FPs ─────────────────────────────────
console.log('\n' + '═'.repeat(80))
console.log('FP PROBABILITY DISTRIBUTION (what probability thresholds would help?)')
console.log('═'.repeat(80))
const allFpProbs = []
for (const items of Object.values(fpDetails)) {
  for (const d of items) {
    for (const s of d.species) {
      allFpProbs.push(s.prob)
    }
  }
}
allFpProbs.sort((a, b) => a - b)

const brackets = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 50, 100]
console.log('  Prob ≤ threshold → FPs eliminated:')
for (const t of brackets) {
  const count = allFpProbs.filter(p => p <= t).length
  console.log(`    ≤ ${String(t).padEnd(4)}%: ${count} FPs (${(count / allFpProbs.length * 100).toFixed(1)}% of all FP species predictions)`)
}

// ─── THRESHOLD ANALYSIS: TP vs FP at genus level ─────────────────────
// Also add landmark normalization
const EXTRA_NORM = {
  'Luteolum Anemone': 'Anemone',
  'Roseum Sinuous Tubers': 'Tubers',
  'Crystalline Shards': 'Shards',
  'Amphora Plant': 'Amphora'
}
function ng2 (name) { return EXTRA_NORM[ng(name)] || ng(name) }

console.log('\n' + '═'.repeat(80))
console.log('THRESHOLD ANALYSIS (genus-level, with landmark normalization)')
console.log('═'.repeat(80))

const tpProbs = []
const fpProbs2 = []
let totalTP2 = 0, totalFP2 = 0, totalFN2 = 0

for (const [id64, sys] of Object.entries(cache)) {
  if (!sys?.bodies) continue
  const allBodies = sys.bodies.map(norm)
  const starPos = sys.coords ? [sys.coords.x, sys.coords.y, sys.coords.z] : null
  for (const body of allBodies) {
    if (body.type !== 'Planet' || !body.signals?.genuses?.length) continue
    const gt = new Set(body.signals.genuses.map(ng2))
    if (gt.size === 0) continue
    let preds
    try { preds = predictSpecies(body, allBodies, starPos) } catch { continue }

    // Group by normalized genus, take max probability
    const genusProbMap = {}
    for (const p of preds) {
      const g = ng2(p.genus)
      genusProbMap[g] = Math.max(genusProbMap[g] || 0, p.probability)
    }
    for (const [g, prob] of Object.entries(genusProbMap)) {
      if (gt.has(g)) { tpProbs.push(prob); totalTP2++ }
      else { fpProbs2.push(prob); totalFP2++ }
    }
    for (const g of gt) {
      if (!genusProbMap[g]) totalFN2++
    }
  }
}

tpProbs.sort((a, b) => a - b)
fpProbs2.sort((a, b) => a - b)

console.log(`\nWith landmark normalization: TP=${totalTP2} FP=${totalFP2} FN=${totalFN2}`)
console.log(`Precision: ${(totalTP2 / (totalTP2 + totalFP2) * 100).toFixed(1)}%`)
console.log(`Recall: ${(totalTP2 / (totalTP2 + totalFN2) * 100).toFixed(1)}%\n`)

console.log('Threshold | FPs cut | FPs left | TPs cut | TPs left | Precision | Recall  | F1')
for (const t of [0.5, 1, 2, 3, 5, 7, 10, 15, 20]) {
  const fpsGone = fpProbs2.filter(p => p < t).length
  const fpsLeft = fpProbs2.length - fpsGone
  const tpsGone = tpProbs.filter(p => p < t).length
  const tpsLeft = tpProbs.length - tpsGone
  const newFN = totalFN2 + tpsGone
  const prec = tpsLeft / (tpsLeft + fpsLeft) * 100
  const rec = tpsLeft / (tpsLeft + newFN) * 100
  const f1 = 2 * prec * rec / (prec + rec)
  console.log(`${String(t).padStart(9)}% | ${String(fpsGone).padStart(7)} | ${String(fpsLeft).padStart(8)} | ${String(tpsGone).padStart(7)} | ${String(tpsLeft).padStart(8)} | ${prec.toFixed(1).padStart(9)}% | ${rec.toFixed(1).padStart(6)}% | ${f1.toFixed(1).padStart(5)}%`)
}

console.log('\nLowest 20 TP genus max-probabilities:')
for (const p of tpProbs.slice(0, 20)) {
  console.log(`  ${p}%`)
}
