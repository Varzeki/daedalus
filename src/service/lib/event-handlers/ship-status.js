const EDCDOutfitting = new (require('../data'))('edcd/fdevids/outfitting')
const EDCDShipyard = new (require('../data'))('edcd/fdevids/shipyard')
const EDCDCommodity = new (require('../data'))('edcd/fdevids/commodity')
const CoriolisBlueprints = new (require('../data'))('edcd/coriolis/blueprints')
const CoriolisModules = new (require('../data'))('edcd/coriolis/modules')
const { UNKNOWN_VALUE } = require('../../../shared/consts')

let lastKnownShipState = null

function toNumber (value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getGuardianBoosterRange (modules) {
  return Object.values(modules).reduce((rangeBonus, module) => {
    if (!module?.symbol?.toLowerCase().includes('guardianfsdbooster')) return rangeBonus
    return rangeBonus + (toNumber(module.range) ?? 0)
  }, 0)
}

function buildJumpProfile ({ modules, mass, fuelLevel, fuelReservoir, fuelCapacity, maxJumpRange }) {
  const frameShiftDrive = modules?.FrameShiftDrive
  if (!frameShiftDrive) return null

  const currentFuel = toNumber(fuelLevel) ?? 0
  const reservoirFuel = toNumber(fuelReservoir) ?? 0
  const availableFuel = currentFuel + reservoirFuel
  const currentMass = (toNumber(mass) ?? 0) + reservoirFuel
  const dryMass = currentMass - availableFuel
  const totalFuelCapacity = toNumber(fuelCapacity)
  const totalMaxJumpRange = toNumber(maxJumpRange)
  const fuelMultiplier = toNumber(frameShiftDrive.fsdFuelMultiplier)
  const fuelPower = toNumber(frameShiftDrive.fsdFuelPower)
  const maxFuelPerJump = toNumber(frameShiftDrive.fsdMaxFuelPerJump)
  const guardianBoosterRange = getGuardianBoosterRange(modules)
  const fsdOnlyMaxJumpRange = totalMaxJumpRange != null
    ? Math.max(totalMaxJumpRange - guardianBoosterRange, 0)
    : null

  let optimalMass = toNumber(frameShiftDrive.fsdOptimalMass)
  if (
    !optimalMass &&
    fsdOnlyMaxJumpRange &&
    dryMass > 0 &&
    totalFuelCapacity > 0 &&
    fuelMultiplier > 0 &&
    fuelPower > 0 &&
    maxFuelPerJump > 0
  ) {
    const fullTankMass = dryMass + totalFuelCapacity
    optimalMass = fsdOnlyMaxJumpRange * fullTankMass / Math.pow(maxFuelPerJump / fuelMultiplier, 1 / fuelPower)
  }

  if (
    !(dryMass > 0) ||
    !(availableFuel > 0) ||
    !(fuelMultiplier > 0) ||
    !(fuelPower > 0) ||
    !(maxFuelPerJump > 0) ||
    !(optimalMass > 0)
  ) {
    return null
  }

  return {
    currentMass: parseFloat(currentMass.toFixed(2)),
    dryMass: parseFloat(dryMass.toFixed(2)),
    availableFuel: parseFloat(availableFuel.toFixed(2)),
    fuelCapacity: totalFuelCapacity,
    fuelMultiplier,
    fuelPower,
    maxFuelPerJump,
    optimalMass: parseFloat(optimalMass.toFixed(2)),
    guardianBoosterRange: parseFloat(guardianBoosterRange.toFixed(2))
  }
}

class ShipStatus {
  constructor ({ eliteLog, eliteJson, cmdrStatus }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
    this.cmdrStatus = cmdrStatus
  }

  async getShipStatus () {
    const [Loadout, Json] = await Promise.all([
      this.eliteLog.getEvent('Loadout'),
      this.eliteJson.json()
    ])

    // The Loadout event is written on load, after switching ships and after
    // using Outfitting. This logic used to use ModulesInfo.json but it is not
    // updated as often and I haven't found a good use for ModulesInfo.json yet.
    //
    // NB: Other events like ModuleSwap, ModuleBuy are also issued *during*
    // outfitting but handling all those would add extra work and just using
    // for Loadout events is good enough for now as is fired after Outfitting.
    const loadoutModules = Loadout?.Modules ?? []
    const modules = {}
    const cmdrStatus = await this.cmdrStatus.getCmdrStatus()
    const onBoard = cmdrStatus?.flags?.inMainShip ?? false

    // If we are not onboard, and we have a last known ship state, return
    // the last known state (cargo, fuel levels, etc) but set the onBoard flag
    // to false to note that we are not onboard.
    //
    // TODO Ideally persist this last known ship state to disk (seperately for
    // each ship) so all player owned ships can be accessed, across sessions.
    if (!onBoard && lastKnownShipState !== null) {
      return {
        ...lastKnownShipState,
        onBoard: false
      }
    }

    for (const module of loadoutModules) {
      const slot = module.Slot
      if (!modules[slot]) modules[slot] = {}
      modules[slot].slot = module.Slot
      modules[slot].symbol = module.Item.toLowerCase()
      modules[slot].on = module.On
      modules[slot].health = module.Health
      modules[slot].value = module.Value
      modules[slot].power = module.Power

      // For passenger cabins, AmmoInClip refers to number of passengers
      if (module.AmmoInClip) {
        if (modules[slot].symbol.includes('passengercabin')) {
          modules[slot].passengers = module.AmmoInClip
        } else if (modules[slot].symbol.includes('heatsinklauncher')) {
          modules[slot].heatsinks = module.AmmoInClip + module.AmmoInHopper
        } else {
          modules[slot].ammoInClip = module.AmmoInClip
          modules[slot].ammoInHopper = module.AmmoInHopper
          modules[slot].ammoTotal = module.AmmoInClip + module.AmmoInHopper
        }
      }

      if (module?.Engineering) {
        if (slot === 'FrameShiftDrive') {
          const optimalMassModifier = module.Engineering.Modifiers.find(mod => /optimal[ _]*mass/i.test(mod.Label))
          const maxFuelModifier = module.Engineering.Modifiers.find(mod => /max[ _]*fuel/i.test(mod.Label))
          if (optimalMassModifier?.Value) modules[slot].fsdOptimalMass = optimalMassModifier.Value
          if (maxFuelModifier?.Value) modules[slot].fsdMaxFuelPerJump = maxFuelModifier.Value
        }

        // Enrich engineering data as we add it
        const blueprint = await CoriolisBlueprints.getBySymbol(module.Engineering.BlueprintName)

        if (!blueprint) {
          console.log(`Error! Unknown blueprint "${module.Engineering.BlueprintName}"`)
          continue
        }

        const [first, second] = blueprint?.symbol.split('_') ?? UNKNOWN_VALUE
        const blueprintName = `${second} ${first}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace('Misc', 'Utility').trim()

        modules[slot].engineering = {
          symbol: blueprint.symbol,
          name: blueprintName,
          originalName: blueprint.name,
          level: module.Engineering.Level,
          quality: module.Engineering.Quality,
          modifiers: module.Engineering.Modifiers.map(mod => {
            // Determine if change is better or worse and how much it differs
            let difference = ''
            let improvement = false
            if (mod.LessIsGood === 0) {
              if (mod.Value > mod.OriginalValue) {
                difference = `+${(mod.Value - mod.OriginalValue).toFixed(2)}`
                improvement = true
              } else {
                difference = `-${(mod.OriginalValue - mod.Value).toFixed(2)}`
              }
            } else {
              if (mod.Value < mod.OriginalValue) {
                difference = `-${(mod.OriginalValue - mod.Value).toFixed(2)}`
                improvement = true
              } else {
                difference = `+${(mod.Value - mod.OriginalValue).toFixed(2)}`
              }
            }
            if (mod.Value === mod.OriginalValue) difference = ''

            difference = difference.replace(/\.00$/, '')

            return {
              name: mod.Label.replace(/_/g, ' ')?.replace(/([a-z])([A-Z])/g, '$1 $2')?.trim(),
              value: mod.Value,
              originalValue: mod.OriginalValue,
              lessIsGood: mod.LessIsGood,
              difference,
              improvement
            }
          }),
          experimentalEffect: module.Engineering?.ExperimentalEffect_Localised?.replace(/_/g, ' ')?.replace(/([a-z])([A-Z])/g, '$1 $2')?.trim() ?? false,
          engineer: module.Engineering.Engineer,
          grades: blueprint?.grades ?? null
        }
      } else {
        modules[slot].engineering = false
      }
    }

    let armour = UNKNOWN_VALUE
    let totalMass = Loadout?.UnladenMass ?? 0
    let totalModulePowerDraw = 0
    let totalFuelCapacity = 0

    for (const moduleName in modules) {
      const module = modules[moduleName]

      // As a fallback, use cleaned up version of internal symbol for name
      module.name = module.symbol
        .replace(/ Package$/, '') // Hull / Armour modules
        .replace(/int_/, '')
        .replace(/_size(.*?)$/g, ' ')
        .replace(/_/g, ' ')

      // Populate additional metadata for module by looking it up
      const [outfittingModule, coriolisModule] = await Promise.all([
        EDCDOutfitting.getBySymbol(module.symbol),
        CoriolisModules.getBySymbol(module.symbol)
      ])

      // Enrich module info with metadata, if we have it
      if (outfittingModule) {
        module.name = outfittingModule.name
        if (outfittingModule.class) module.class = outfittingModule.class
        if (outfittingModule.rating) module.rating = outfittingModule.rating
        if (outfittingModule.mount) module.mount = outfittingModule.mount
        if (outfittingModule.guidance) module.guidance = outfittingModule.guidance
      }

      // Each ship has exactly one armour module
      if (module.symbol.includes('_armour_')) armour = module.name

      // Internal modules start with int_
      if (module.symbol.startsWith('int_')) module.internal = true

      // Set module size based on slot name
      if (module.slot.includes('HugeHardpoint')) module.size = 'huge'
      if (module.slot.includes('LargeHardpoint')) module.size = 'large'
      if (module.slot.includes('MediumHardpoint')) module.size = 'medium'
      if (module.slot.includes('SmallHardpoint')) module.size = 'small'
      if (module.slot.includes('TinyHardpoint')) module.size = 'tiny' // Utilities

      module.hardpoint = !!module.slot.includes('Hardpoint')
      module.utility = !!module.slot.includes('TinyHardpoint')
      module.core = !![
        'PowerDistributor',
        'Radar',
        'PowerPlant',
        'MainEngines',
        'FrameShiftDrive',
        'LifeSupport',
        'FuelTank',
        'Armour'
      ].includes(module.slot)

      if (coriolisModule) {
        // Just grab the first line of the description
        const [firstLine] = (coriolisModule?.description ?? '').split('. ')
        module.description = ''
        if (firstLine) module.description = firstLine.replace(/\.$/, '')
        if (coriolisModule.mass) module.mass = coriolisModule.mass
        if (coriolisModule.cost) module.cost = coriolisModule.cost
        if (coriolisModule.power) module.power = coriolisModule.power
        if (coriolisModule.range) module.range = coriolisModule.range
        if (coriolisModule.falloff) module.falloff = coriolisModule.falloff
        if (coriolisModule.clip) module.clip = coriolisModule.clip
        if (coriolisModule.bays) module.bays = coriolisModule.bays
        if (coriolisModule.proberadius) module.probeRadius = coriolisModule.proberadius
        if (coriolisModule.rate && coriolisModule.ukName === 'Fuel Scoop') module.fuelScoopRate = coriolisModule.rate
        if (coriolisModule.rate && coriolisModule.ukName === 'Life Support') module.lifeSupportTime = coriolisModule.time
        if (coriolisModule.fuel) {
          module.fuelCapacity = parseInt(coriolisModule.fuel)
          totalFuelCapacity += module.fuelCapacity
        }
        if (module.slot === 'FrameShiftDrive') {
          if (!module.fsdOptimalMass && coriolisModule.properties?.['Optimal Mass']) {
            module.fsdOptimalMass = coriolisModule.properties['Optimal Mass']
          }
          if (!module.fsdMaxFuelPerJump && coriolisModule.maxfuel) {
            module.fsdMaxFuelPerJump = coriolisModule.maxfuel
          }
          if (coriolisModule.fuelmul) module.fsdFuelMultiplier = coriolisModule.fuelmul
          if (coriolisModule.fuelpower) module.fsdFuelPower = coriolisModule.fuelpower
        }
      }

      // Keep running total of total power draw
      if (module.power) totalModulePowerDraw += module.power

      module.slotName = module.slot.replace('_', ' ')
        .replace(/([0-9]+)/g, ' $1 ')
        .replace(/^Slot ([0-9]+) Size ([0-9]+)/g, '') // "(Max size: $2)")
        .replace(/ 0/g, ' ') // Leading zeros in numbers
        .replace(/Military ([0-9])/, 'Military slot $1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^Tiny /, 'Utility ')
        .trim()
    }

    const inventory = (Json?.Cargo?.Inventory)
      ? await Promise.all(Json.Cargo.Inventory.map(async (item) => {
          const commodity = await EDCDCommodity.getBySymbol(item?.Name)
          let description = commodity?.category?.replace(/_/g, ' ')?.replace(/([a-z])([A-Z])/g, '$1 $2')?.trim() ?? ''
          if (item?.Name === 'drones') description = 'Limpet drones'

          // Include cargo in mass
          if (item?.Count) totalMass += item?.Count

          return {
            symbol: item?.Name ?? UNKNOWN_VALUE,
            name: item?.Name_Localised ?? item?.Name ?? UNKNOWN_VALUE,
            count: item?.Count ?? UNKNOWN_VALUE,
            stolen: Boolean(item?.Stolen) ?? UNKNOWN_VALUE,
            mission: item?.MissionID ?? false,
            description
          }
        })
        )
      : []

    // Include fuel in mass
    if (Json?.Status?.Fuel?.FuelMain) totalMass += Json?.Status?.Fuel?.FuelMain

    const shipMass = totalMass
    const maxJumpRange = Loadout?.MaxJumpRange ? parseFloat((Loadout.MaxJumpRange).toFixed(2)) : null
    const fuelLevel = Json?.Status?.Fuel?.FuelMain ? parseFloat((Json.Status.Fuel.FuelMain).toFixed(2)) : null
    const fuelReservoir = Json?.Status?.Fuel?.FuelReservoir ? parseFloat((Json.Status.Fuel.FuelReservoir).toFixed(2)) : null
    const jumpProfile = buildJumpProfile({
      modules,
      mass: shipMass,
      fuelLevel,
      fuelReservoir,
      fuelCapacity: totalFuelCapacity,
      maxJumpRange
    })

    // Format power draw and mass
    totalModulePowerDraw = totalModulePowerDraw?.toFixed(2)?.replace(/\.00$/, '')
    totalMass = totalMass?.toFixed(2)?.replace(/\.00$/, '')

    const ship = await EDCDShipyard.getBySymbol(Loadout?.Ship)

    const shipState = {
      timestamp: new Date().toISOString(),
      shipId: Loadout?.ShipID != null ? String(Loadout.ShipID) : null,
      type: ship?.name ?? Loadout?.Ship ?? UNKNOWN_VALUE,
      name: (Loadout?.ShipName && Loadout.ShipName !== 'NULL') ? Loadout.ShipName : UNKNOWN_VALUE,
      ident: Loadout?.ShipIdent ?? UNKNOWN_VALUE,
      pips: {
        systems: onBoard ? Json?.Status?.Pips?.[0] ?? UNKNOWN_VALUE : UNKNOWN_VALUE,
        engines: onBoard ? Json?.Status?.Pips?.[1] ?? UNKNOWN_VALUE : UNKNOWN_VALUE,
        weapons: onBoard ? Json?.Status?.Pips?.[2] ?? UNKNOWN_VALUE : UNKNOWN_VALUE
      },
      // Using parseFloat with toFixed
      maxJumpRange,
      fuelLevel,
      fuelReservoir,
      fuelCapacity: totalFuelCapacity,
      modulePowerDraw: totalModulePowerDraw,
      mass: totalMass,
      jumpProfile,
      rebuy: Loadout?.Rebuy ?? UNKNOWN_VALUE,
      armour,
      cargo: {
        capacity: Loadout?.CargoCapacity ?? null,
        count: Json?.Cargo?.Count ?? null,
        inventory
      },
      onBoard,
      modules
    }

    // If ship type is known, save ship state as last known ship state.
    // This is used to be able to return the last known ship state from memory
    // (including cargo etc) even after leaving the ship and boarding an SRV
    // or disembarking on foot.
    if (shipState.type !== UNKNOWN_VALUE) lastKnownShipState = shipState

    return shipState
  }

  async getJumpProfile () {
    return (await this.getShipStatus())?.jumpProfile ?? null
  }

  getHandlers () {
    return {
      getShipStatus: (args) => this.getShipStatus(args)
    }
  }
}

module.exports = ShipStatus
