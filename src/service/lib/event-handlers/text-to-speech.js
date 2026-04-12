const covasPlayer = require('../covas-player')

class TextToSpeech {
  constructor ({ eliteLog, eliteJson, cmdrStatus, shipStatus }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
    this.cmdrStatus = cmdrStatus
    this.shipStatus = shipStatus

    this.currentCmdrStatus = null
    this.voiceAlertDebounce = null
  }

  logEventHandler (logEvent) {
    covasPlayer.handleLogEvent(logEvent)
  }

  async gameStateChangeHandler () {
    const previousCmdStatus = JSON.parse(JSON.stringify(this.currentCmdrStatus))
    this.currentCmdrStatus = await this.cmdrStatus.getCmdrStatus()
    const shipStatus = await this.shipStatus.getShipStatus()

    if (shipStatus?.onBoard && previousCmdStatus && !this.voiceAlertDebounce) {
      this.voiceAlertDebounce = true
      setTimeout(() => { this.voiceAlertDebounce = false }, 1000)

      if (this.currentCmdrStatus?.flags?.cargoScoopDeployed !== previousCmdStatus?.flags?.cargoScoopDeployed) {
        covasPlayer.handleStatusChange('cargoScoopDeployed', this.currentCmdrStatus?.flags?.cargoScoopDeployed)
      }
      if (this.currentCmdrStatus?.flags?.landingGearDown !== previousCmdStatus?.flags?.landingGearDown) {
        covasPlayer.handleStatusChange('landingGearDown', this.currentCmdrStatus?.flags?.landingGearDown)
      }
      if (this.currentCmdrStatus?.flags?.silentRunning !== previousCmdStatus?.flags?.silentRunning) {
        covasPlayer.handleStatusChange('silentRunning', this.currentCmdrStatus?.flags?.silentRunning)
      }

      // FSD charging — fire charging wav on charge start; countdown fires on StartJump journal event
      if (this.currentCmdrStatus?.flags?.fsdCharging && !previousCmdStatus?.flags?.fsdCharging) {
        covasPlayer.handleFsdCharging()
      }

      // Monitor cargo capacity (cargo full alert)
      if (shipStatus?.cargo?.count != null && shipStatus?.cargo?.capacity != null) {
        covasPlayer.handleCargoCapacity(shipStatus.cargo.count, shipStatus.cargo.capacity)
      }
    }

    // Monitor oxygen level (works on foot — oxygen is in Status.json)
    if (this.currentCmdrStatus?.oxygen != null) {
      covasPlayer.handleOxygenThreshold(this.currentCmdrStatus.oxygen)
    }
  }

  invalidatePreferencesCache () {
    covasPlayer.invalidatePreferencesCache()
  }
}

module.exports = TextToSpeech
