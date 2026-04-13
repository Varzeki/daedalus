class Powerplay {
  constructor ({ eliteLog }) {
    this.eliteLog = eliteLog
  }

  async getPowerplay () {
    const powerplayEvent = await this.eliteLog.getEvent('Powerplay')
    const meritsEvent = await this.eliteLog.getEvent('PowerplayMerits')
    const rankEvent = await this.eliteLog.getEvent('PowerplayRank')
    const joinEvent = await this.eliteLog.getEvent('PowerplayJoin')
    const leaveEvent = await this.eliteLog.getEvent('PowerplayLeave')
    const defectEvent = await this.eliteLog.getEvent('PowerplayDefect')
    const locationEvent = await this.eliteLog.getEvent('Location')

    // Get the most current system (most recent of Location or subsequent FSDJump)
    let currentSystemEvent = locationEvent
    if (locationEvent?.timestamp) {
      const fsdJumpEvent = (await this.eliteLog.getEventsFromTimestamp('FSDJump', locationEvent.timestamp, 1))?.[0]
      if (fsdJumpEvent) currentSystemEvent = fsdJumpEvent
    }

    const currentSystem = currentSystemEvent
      ? {
          name: currentSystemEvent.StarSystem ?? null,
          powers: currentSystemEvent.Powers ?? null,
          powerState: currentSystemEvent.PowerplayState ?? null
        }
      : null

    // Not pledged if there is no Powerplay startup event and no join event
    const pledged = !!(powerplayEvent || joinEvent)

    if (!pledged) {
      return { pledged: false, power: null, rank: null, merits: null, timePledged: null, currentSystem }
    }

    // Check for a more recent leave event than startup event
    const powerplayTimestamp = powerplayEvent?.timestamp ? new Date(powerplayEvent.timestamp).getTime() : 0
    const leaveTimestamp = leaveEvent?.timestamp ? new Date(leaveEvent.timestamp).getTime() : 0
    if (leaveTimestamp > powerplayTimestamp) {
      return { pledged: false, power: null, rank: null, merits: null, timePledged: null, currentSystem }
    }

    // Determine current power (defect updates the active power)
    let power = powerplayEvent?.Power ?? null
    if (defectEvent) {
      const defectTimestamp = new Date(defectEvent.timestamp).getTime()
      if (defectTimestamp > powerplayTimestamp) {
        power = defectEvent.ToPower ?? power
      }
    }

    // Rank: prefer most recent PowerplayRank event, fall back to Powerplay startup event
    const rank = rankEvent?.Rank ?? powerplayEvent?.Rank ?? null

    // Merits: prefer most recent PowerplayMerits event (TotalMerits), fall back to startup
    const merits = meritsEvent?.TotalMerits ?? powerplayEvent?.Merits ?? null

    const timePledged = powerplayEvent?.TimePledged ?? null

    return { pledged: true, power, rank, merits, timePledged, currentSystem }
  }

  getHandlers () {
    return {
      getPowerplay: () => this.getPowerplay()
    }
  }
}

module.exports = Powerplay
