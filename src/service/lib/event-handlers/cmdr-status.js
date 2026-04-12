const System = require('./system')

class CmdrStatus {
  constructor ({ eliteJson, eliteLog }) {
    this.eliteJson = eliteJson
    this.eliteLog = eliteLog
    this.system = new System({ eliteLog })
    this.flags = {
      docked: 1,
      landed: 2,
      landingGearDown: 4,
      shieldsUp: 8,
      supercruise: 16,
      flightAssistOff: 32,
      hardpointsDeployed: 64,
      inWing: 128,
      lightsOn: 256,
      cargoScoopDeployed: 512,
      silentRunning: 1024,
      scoopingFuel: 2048,
      srvHandbrake: 4096,
      srvUsingTurretView: 8192,
      srvTurretRetracted: 16384,
      srvDriveAssist: 32768,
      fsdMassLocked: 65536,
      fsdCharging: 131072,
      fsdCooldown: 262144,
      lowFuel: 524288, // < 25%
      overHeating: 1048576, // > 100%
      hasLatLon: 2097152,
      inDanger: 4194304,
      beingInterdicted: 8388608,
      inMainShip: 16777216,
      inFighter: 33554432,
      inSrv: 67108864,
      hudInAnalysisMode: 134217728,
      nightVision: 268435456,
      altitudeFromAverageRadius: 536870912,
      fsdJump: 1073741824,
      srvHighBeam: 2147483648
    }
    this.flags2 = {
      onFoot: 1,
      inTaxi: 2,
      inMulticrew: 4,
      onFootInStation: 8,
      onFootInPlanet: 16,
      aimDownSight: 32,
      lowOxygen: 64,
      lowHealth: 128,
      cold: 256,
      hot: 512,
      veryCold: 1024,
      veryHot: 2048,
      glideMode: 4096,
      onFootInHanger: 8192,
      onFootSocialSpace: 16384,
      onFootExterior: 32768,
      breathableAtmosphere: 65536,
      telepresenceMulticrew: 131072,
      physicalMulticrew: 262144,
      fsdHyperdriveCharging: 524288,
      // Speculative: SCO (Supercruise Overcharge) may be an undocumented flag
      // Needs live testing to confirm the correct bit
      fsdSupercruiseOvercharge: 1048576
    }
  }

  getFlag (flags, flag) {
    return (flags & flag) !== 0
  }

  async getStatusFlags (StatusJson) {
    const statusFlags = {}

    for (const flag of Object.keys(this.flags)) {
      if (StatusJson?.Flags) {
        statusFlags[flag] = this.getFlag(StatusJson.Flags, this.flags[flag])
      } else {
        statusFlags[flag] = false
      }
    }

    for (const flag of Object.keys(this.flags2)) {
      if (StatusJson?.Flags2) {
        statusFlags[flag] = this.getFlag(StatusJson.Flags2, this.flags2[flag])
      } else {
        statusFlags[flag] = false
      }
    }

    return statusFlags
  }

  async getCmdrStatus () {
    const StatusJson = (await this.eliteJson.json()).Status
    const currentSystem = await this.system.getSystem()

    const cmdrStatus = {}

    if (StatusJson) {
      for (const key of Object.keys(StatusJson)) {
        // Ignore these properties
        if (['event', 'timestamp', 'Flags', 'Flags2'].includes(key)) continue
        cmdrStatus[key.toLowerCase()] = StatusJson[key]
      }
    }

    // Parse and combine Flags and Flags2 into boolean key/value pairs
    cmdrStatus.flags = await this.getStatusFlags(StatusJson)

    // Override bad flag behaviour
    // If you are in a taxi you are by definition not in your main ship!
    if (cmdrStatus.flags.inTaxi) cmdrStatus.flags.inMainShip = false

    // Determine current location

    /*
    cmdrStatus.location = {
      name: [],
      system: null,
      planet: null,
      facility: null,
    }
    */

    let location = []

    // By default we want "Body Name > [Station Name|Settlement|etc]"
    if (cmdrStatus?.bodyname) location.push(cmdrStatus.bodyname)

    const [locationEvent, dockedEvent, embarkEvent, touchdownEvent, supercruiseExitEvent] = await Promise.all([
      this.eliteLog.getEvent('Location'),
      this.eliteLog.getEvent('Docked'),
      this.eliteLog.getEvent('Embark'),
      this.eliteLog.getEvent('Touchdown'),
      this.eliteLog.getEvent('SupercruiseExit')
    ])

    // Cache parsed timestamps to avoid repeated Date.parse() calls
    const dockedTime = dockedEvent?.timestamp ? Date.parse(dockedEvent.timestamp) : 0
    const embarkTime = embarkEvent?.timestamp ? Date.parse(embarkEvent.timestamp) : 0
    const touchdownTime = touchdownEvent?.timestamp ? Date.parse(touchdownEvent.timestamp) : 0

    // Helper to format station name with Fleet Carrier prefix
    const formatStation = (event) => event?.StationType === 'FleetCarrier'
      ? `Carrier ${event.StationName}`
      : event?.StationName

    if (cmdrStatus?.flags?.onFoot) {
      if (cmdrStatus?.flags?.onFootSocialSpace) {
        // If on foot in a social space we are at a port or on a station
        //
        // We can use the Dock Event (if in the same system) to check if they
        // are Docked at a Station in this system.
        //
        // To catch the case of being on a Fleet Carrier that jumps, we also
        // need to look for the Location event (fired after a carrier jumps)
        // to if that matches the current system (as the location of the last
        // Docked event will be in another system).
        //
        // This logic is "best effort" and I would not be surprised if there
        // are edge cases to the logic.
        if ((dockedEvent && dockedEvent.StationName && dockedEvent?.StarSystem === currentSystem?.name)
           || locationEvent?.StarSystem === currentSystem?.name) {
          location.push(formatStation(dockedEvent))
        }

        // Either in a hanger, or not in a hanger
        if (cmdrStatus?.flags?.onFootInHanger) {
          location.push('Hanger')
        } else {
          if (dockedEvent?.StationType === 'FleetCarrier') {
            location.push('Flight Deck')
          } else {
            location.push('Concourse')
          }
        }
      } else if (cmdrStatus?.flags?.onFootInPlanet) {
        // If on foot on a planet, then we are at a settlement
        // We can look up the name of the station we are Docked at, or if we
        // are not Docked (e.g. have landed just outside a station) then we can
        // look up the nearest station to the touchdown point (if there is one)
        if (dockedEvent && dockedEvent.StationName && dockedEvent?.StarSystem === currentSystem?.name) {
          if (touchdownEvent && touchdownTime > dockedTime) {
            if (touchdownEvent?.NearestDestination) location.push(touchdownEvent.NearestDestination)
          } else {
            location.push(dockedEvent.StationName)
          }
        }
      }
    }

    if (cmdrStatus?.flags?.docked && cmdrStatus?.flags?.onFoot === false) {
      // If docked and not on foot get the last Embark/Docked event to find out what station we are on

      // FIXME: This is technically incorrect and it should use whatever is the
      //  most recent event
      if (!dockedEvent && embarkEvent?.StationName) {
        location.push(embarkEvent.StationName) 
      } else if (!embarkEvent && dockedEvent?.StationName) {
        location.push(formatStation(dockedEvent))
      } else if (!embarkEvent && !dockedEvent && touchdownEvent?.NearestDestination) {
        location.push(touchdownEvent.NearestDestination)
      } else if (locationEvent?.StationName) {
        location.push(formatStation(locationEvent))
        if (locationEvent?.Docked === true) location.push('Docked')
      }

      if (dockedEvent && embarkEvent) {
        if (touchdownEvent &&
            touchdownTime > dockedTime &&
            touchdownTime > embarkTime
        ) {
          if (touchdownEvent?.NearestDestination) location.push(touchdownEvent.NearestDestination)
        } else if (embarkEvent?.StationName && dockedEvent?.StationName) {
          // If we have both a Docked event and an Embark event with a station
          // name, use the newest value
          if (dockedTime > embarkTime) {
            location.push(formatStation(dockedEvent))
          } else {
            location.push(embarkEvent.StationName)
          }
          location.push('Docked')
        } else if (dockedEvent?.StationName) {
          // If the Embark event doesn't have a Station Name we fallback to Docked event
          // This can happen when embarking at a settlement (even when on a landing pad,
          // the Embark event when at a Settlement is not always populated).
          // FIXME As a simple sanity check, we at least verify the event was
          // triggered in the same system (crude, but hopefully good enough).
          if (dockedEvent?.StarSystem === currentSystem?.name) {
            location.push(formatStation(dockedEvent))
            location.push('Docked')
          }
        }
      }
    }

    // If we are not in supercruise, not docked and not landed then we are in space
    // If the last Supercruise Exit event matches the current system (it should)
    // then use the Body from that event as our location, if we don't already know our
    // location. This is useful for scenarios like exiting supercruise near a station
    // as otherwise the game doesn't know where we are. Note that it returns the
    // name of the station as a Body (with BodyType: Station) and does not
    // specify Station Name as you migth expect.
    if (cmdrStatus?.flags?.supercruise === false && cmdrStatus?.flags?.docked === false && cmdrStatus?.flags?.landed === false) {
      if (supercruiseExitEvent?.Body && supercruiseExitEvent?.StarSystem === currentSystem?.name) {
        if (!location.includes(supercruiseExitEvent.Body)) location.push(supercruiseExitEvent.Body)
      }
    }

    // If we don't have a more specific location (planet, station) use the
    // system name as the location
    if (location.length === 0 && currentSystem?.name) {
      location.push(currentSystem.name)
    }

    if (cmdrStatus?.flags?.inTaxi) {
      if (cmdrStatus?.flags?.docked) {
        // If we are in a taxi that is docked at our destination, get the station name
        if (dockedEvent?.StationName && dockedEvent.StationName === cmdrStatus?.destination?.Name) {
          if (!location.includes(dockedEvent.StationName)) location.push(dockedEvent.StationName)
        }
      }
      // Indicate that we are onboard a shuttle (e.g. Apex, Frontline Solutions)
      location.push('Shuttle')
    }

    // Because of how we grab the location, sometimes we can end up with a
    // location that is a symbol- e.g. if disembarking to a planet on a mission 
    // it could be a description of the mission target area like this:
    // "$POIScenario_Watson_Damaged_Sidewinder_01_Salvage_Easy; $USS_ThreatLevel:#threatLevel=1;"
    //
    // This obviously doesn't look good in the UI. so we filter these out by
    // checking for locations that start with the $ sigil.
    //
    // FIXME This could accidentally filter out locations that actually start
    // with a but I don't think that occurs anywhere in the game.
    location = location.filter(loc => !loc.startsWith('$'))

    // Only use the last two, most specific location names, so it's not too
    // unwieldy in the UI (e.g. "Body > Settlement" or "Settlement > Docked",
    // and not "System > Body > Settlement > Docked").
    while (location.length > 2) { location.shift() }

    cmdrStatus._location = location

    return cmdrStatus
  }

  getHandlers () {
    return {
      getCmdrStatus: (args) => this.getCmdrStatus(args)
    }
  }
}

module.exports = CmdrStatus
