#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { predictSpecies } = require('../../src/service/lib/bio-predictor')

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '.comparison-cache.json'), 'utf8'))
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
  Concha: 'Conchas', Frutexa: 'Frutexta',
  'Amphora Plant': 'Amphora', 'Luteolum Anemone': 'Anemone',
  'Crystalline Shards': 'Shards', 'Roseum Sinuous Tubers': 'Tubers'
}
function ng (n) { return GENUS_MAP[n] || n }

for (const id64 of SYSTEM_IDS) {
  const sys = cache[id64]
  if (!sys?.bodies) continue
  const allBodies = sys.bodies
  const starPos = sys.coords ? [sys.coords.x, sys.coords.y, sys.coords.z] : null

  for (const b of allBodies) {
    if (b.type !== 'Planet' || !b.signals?.genuses?.length) continue
    const gt = new Set(b.signals.genuses.map(ng))
    let preds
    try { preds = predictSpecies(b, allBodies, starPos) } catch { continue }
    const pg = new Set(preds.map(p => ng(p.genus)))

    const misses = [...gt].filter(g => !pg.has(g))
    if (misses.length > 0) {
      console.log(`${sys.name} / ${b.name}`)
      console.log(`  Missing: ${misses.join(', ')}`)
      console.log(`  Body: ${b.subType}, Atmos: ${b.atmosphereType}, Volc: ${b.volcanismType}`)
      console.log(`  Temp: ${b.surfaceTemperature}, Grav: ${b.gravity}`)
      console.log(`  GT: ${[...gt].join(', ')}`)
      console.log(`  Predicted: ${[...pg].join(', ')}`)
      console.log()
    }
  }
}
