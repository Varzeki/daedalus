const fs = require('fs')
const path = require('path')

module.exports = class Data {
  constructor (asset) {
    this.asset = asset
    this.data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${asset}.json`), 'utf8'))
  }

  getBySymbol (itemSymbol) {
    let result
    Object.values(this.data).some(item => {
      if (item?.symbol?.toLowerCase() === itemSymbol?.toLowerCase()) {
        result = item
        return true
      }
      return false
    })

    // if (!result) console.error('Lookup failed', this.asset, itemSymbol)

    return result
  }
}
