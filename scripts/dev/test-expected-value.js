#!/usr/bin/env node
const { getExpectedBioValue } = require('../../src/service/lib/exploration-value')

const SPECIES_REWARDS = {
  'Bacterium Cerbrus': 1689800,
  'Bacterium Informem': 8418000,
  'Bacterium Aurasus': 1000000,
  'Tussock Pennatis': 1000000,
  'Tussock Stigmasis': 19010800
}

console.log('=== Test 1: No predictions (fallback) ===')
console.log('3 bio signals, no predictions:', getExpectedBioValue(3, false, [], null, null).toLocaleString(), 'Cr')
console.log()

console.log('=== Test 2: With predictions (FSS stage - probability weighted) ===')
const preds = [
  { genus: 'Bacterium', species: 'Cerbrus', probability: 60 },
  { genus: 'Bacterium', species: 'Informem', probability: 10 },
  { genus: 'Bacterium', species: 'Aurasus', probability: 30 },
  { genus: 'Tussock', species: 'Pennatis', probability: 80 },
  { genus: 'Tussock', species: 'Stigmasis', probability: 20 },
]
const ev = getExpectedBioValue(2, false, [], preds, SPECIES_REWARDS)
console.log('2 signals, Bacterium+Tussock predicted:', ev.toLocaleString(), 'Cr')

const bactEV = Math.round((60 * 1689800 + 10 * 8418000 + 30 * 1000000) / 100)
const tussEV = Math.round((80 * 1000000 + 20 * 19010800) / 100)
console.log('  Bacterium EV:', bactEV.toLocaleString())
console.log('  Tussock EV:', tussEV.toLocaleString())
console.log('  Sum:', (bactEV + tussEV).toLocaleString())
console.log('  (Genus probabilities cap at 100%, so weight=1.0 for each)')
console.log()

console.log('=== Test 3: DSS confirmation (genera 100% certain) ===')
const ev2 = getExpectedBioValue(2, false, [], preds, SPECIES_REWARDS, ['Bacterium', 'Tussock'])
console.log('DSS confirmed Bacterium+Tussock:', ev2.toLocaleString(), 'Cr')
console.log('  Should equal test 2 since genus probs were already 100%')
console.log()

console.log('=== Test 4: Low probability genus (2 slots, 2 predictions → normalized to 100%) ===')
const predsLow = [
  { genus: 'Bacterium', species: 'Cerbrus', probability: 5 },
  { genus: 'Tussock', species: 'Pennatis', probability: 3 },
]
const ev4 = getExpectedBioValue(2, false, [], predsLow, SPECIES_REWARDS)
console.log('2 signals, low prob predictions:', ev4.toLocaleString(), 'Cr')
console.log('  With only 2 predicted genera for 2 slots, both normalize to 100%')
console.log('  Expected: 1689800 + 1000000 =', (1689800 + 1000000).toLocaleString())
console.log()

console.log('=== Test 5: Low probability + DSS confirmation (same result) ===')
const ev5 = getExpectedBioValue(2, false, [], predsLow, SPECIES_REWARDS, ['Bacterium', 'Tussock'])
console.log('DSS confirmed same:', ev5.toLocaleString(), 'Cr')
console.log('  Should equal test 4 since normalization already gives 100%')
console.log()

console.log('=== Test 6: Confirmed species (surface scan) ===')
const known = [{ genus: 'Bacterium', species: 'Bacterium Cerbrus', reward: 1689800 }]
const ev6 = getExpectedBioValue(2, false, known, preds, SPECIES_REWARDS, ['Bacterium', 'Tussock'])
console.log('1 confirmed + 1 predicted:', ev6.toLocaleString(), 'Cr')
console.log('  Expected: 1689800 (confirmed exact) + Tussock EV =', (1689800 + tussEV).toLocaleString())
console.log()

console.log('=== Test 7: First footfall bonus (5x) ===')
const ev7 = getExpectedBioValue(2, true, [], preds, SPECIES_REWARDS, ['Bacterium', 'Tussock'])
console.log('First footfall (5x):', ev7.toLocaleString(), 'Cr')
console.log('  Should be ~5x of test 3 (' + ev2.toLocaleString() + '):', (ev2 * 5).toLocaleString())
console.log()

console.log('=== Test 8: Bayesian signal-count normalization (1 signal, 2 genera competing) ===')
const predsCompeting = [
  { genus: 'Bacterium', species: 'Cerbrus', probability: 60 },
  { genus: 'Tussock', species: 'Pennatis', probability: 80 },
]
const ev8 = getExpectedBioValue(1, false, [], predsCompeting, SPECIES_REWARDS)
// 1 signal → exactly 1 of 2 genera is present. Bayesian conditioning:
//   P(Bact only) = 0.6 × 0.2 = 0.12
//   P(Tusk only) = 0.4 × 0.8 = 0.32
//   Total mass = 0.44
//   P(Bact | exactly 1) = 0.12 / 0.44 = 0.2727
//   P(Tusk | exactly 1) = 0.32 / 0.44 = 0.7273
const pBact = 0.12 / 0.44
const pTusk = 0.32 / 0.44
const expected8 = Math.round(pBact * 1689800 + pTusk * 1000000)
console.log('1 signal, Bact 60% vs Tusk 80%:', ev8.toLocaleString(), 'Cr')
console.log('  P(Bact|1) = 0.12/0.44 =', pBact.toFixed(4), '→', Math.round(pBact * 1689800).toLocaleString())
console.log('  P(Tusk|1) = 0.32/0.44 =', pTusk.toFixed(4), '→', Math.round(pTusk * 1000000).toLocaleString())
console.log('  Expected:', expected8.toLocaleString())
console.log()

console.log('=== Test 9: Bayesian with 3 genera for 2 slots ===')
const preds3 = [
  { genus: 'Bacterium', species: 'Cerbrus', probability: 90 },
  { genus: 'Tussock', species: 'Pennatis', probability: 60 },
  { genus: 'Tussock', species: 'Stigmasis', probability: 20 },
  { genus: 'Osseus', species: 'Fractus', probability: 30 },
]
const EXTRA_REWARDS = { ...SPECIES_REWARDS, 'Osseus Fractus': 4027800 }
const ev9 = getExpectedBioValue(2, false, [], preds3, EXTRA_REWARDS)
// Genus probs: Bact=0.9, Tusk=0.8, Oss=0.3
// C(3,2) = 3 combinations:
//   Bact+Tusk: 0.9 × 0.8 × 0.7 = 0.504
//   Bact+Oss:  0.9 × 0.2 × 0.3 = 0.054
//   Tusk+Oss:  0.1 × 0.8 × 0.3 = 0.024
//   Total = 0.582
//   P(Bact|2) = (0.504+0.054)/0.582 = 0.9588
//   P(Tusk|2) = (0.504+0.024)/0.582 = 0.9072
//   P(Oss|2)  = (0.054+0.024)/0.582 = 0.1340
const total9 = 0.504 + 0.054 + 0.024
const pBact9 = (0.504 + 0.054) / total9
const pTusk9 = (0.504 + 0.024) / total9
const pOss9 = (0.054 + 0.024) / total9
const tuskEV9 = (60*1000000 + 20*19010800) / 80
console.log('2 signals, 3 genera (Bact 90%, Tusk 80%, Oss 30%):', ev9.toLocaleString(), 'Cr')
console.log('  P(Bact|2) =', pBact9.toFixed(4), '→', Math.round(pBact9 * 1689800).toLocaleString())
console.log('  P(Tusk|2) =', pTusk9.toFixed(4), '→', Math.round(pTusk9 * tuskEV9).toLocaleString())
console.log('  P(Oss|2)  =', pOss9.toFixed(4), '→', Math.round(pOss9 * 4027800).toLocaleString())
console.log('  Weights sum:', (pBact9 + pTusk9 + pOss9).toFixed(4), '(should be ~2.0)')
