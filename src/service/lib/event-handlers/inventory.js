
class Inventory {
  constructor ({ eliteLog, eliteJson }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
  }

  async getInventory () {
    const shipLocker = (await this.eliteJson.json()).ShipLocker
    if (!shipLocker) return []

    const inventoryByName = new Map()

    const addItems = (items, type) => {
      for (const item of items) {
        const name = item?.Name_Localised ?? item.Name
        let entry = inventoryByName.get(name)
        if (!entry) {
          entry = { name, type, mission: 0, stolen: 0, count: 0 }
          inventoryByName.set(name, entry)
        }
        entry.count += item.Count
        if (item.MissionID) entry.mission += item.Count
        if (item.OwnerID > 0) entry.stolen += item.Count
      }
    }

    addItems(shipLocker.Consumables ?? [], 'Consumable')
    addItems(shipLocker.Items ?? [], 'Goods')
    addItems(shipLocker.Components ?? [], 'Component')
    addItems(shipLocker.Data ?? [], 'Data')

    const inventoryItems = [...inventoryByName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))

    let goods = 0; let components = 0; let data = 0
    for (const item of inventoryItems) {
      if (item.type === 'Goods') goods += item.count
      else if (item.type === 'Component') components += item.count
      else if (item.type === 'Data') data += item.count
    }

    return {
      counts: { goods, components, data },
      items: inventoryItems
    }
  }

  getHandlers () {
    return {
      getInventory: (args) => this.getInventory(args)
    }
  }
}

module.exports = Inventory
