const DataLoader = require('../data')

const materialSourcesRaw = new DataLoader('material-sources').data
const materialTradersData = new DataLoader('material-traders').data
const engineerPrerequisitesData = new DataLoader('engineer-prerequisites').data
const engineerUnlockStationsData = new DataLoader('engineer-unlock-stations').data

// Flatten material-sources.json from nested { raw: { iron: {...} }, encoded: {...} }
// to a flat { iron: {...}, ... } map keyed by material symbol.
const SKIP_KEYS = new Set(['_comment', '_schema'])
const materialSourcesFlat = {}
for (const [key, value] of Object.entries(materialSourcesRaw)) {
  if (SKIP_KEYS.has(key)) continue
  if (typeof value === 'object' && value !== null && !value.sources) {
    // This is a category group (raw/encoded/manufactured/guardian/thargoid)
    for (const [symbol, sourceEntry] of Object.entries(value)) {
      materialSourcesFlat[symbol] = sourceEntry
    }
  } else {
    materialSourcesFlat[key] = value
  }
}

class Engineering {
  getMaterialSources () {
    return materialSourcesFlat
  }

  getMaterialTraders () {
    return materialTradersData
  }

  getEngineerPrerequisites () {
    return engineerPrerequisitesData
  }

  getEngineerUnlockStations () {
    return engineerUnlockStationsData
  }

  getHandlers () {
    return {
      getMaterialSources: () => this.getMaterialSources(),
      getMaterialTraders: () => this.getMaterialTraders(),
      getEngineerPrerequisites: () => this.getEngineerPrerequisites(),
      getEngineerUnlockStations: () => this.getEngineerUnlockStations()
    }
  }
}

module.exports = Engineering
