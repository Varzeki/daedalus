import { useState, useEffect } from 'react'
import { eventListener, socketOptions, setSocketOption } from 'lib/socket'

export default function useLandingPad () {
  const [landingPadEnabled, setLandingPadEnabled] = useState(socketOptions.landingPadEnabled)
  const [landingPadData, setLandingPadData] = useState(null)
  const [lastSettlementEconomy, setLastSettlementEconomy] = useState(null)

  function toggleLandingPad () {
    const newEnabled = !landingPadEnabled
    setSocketOption('landingPadEnabled', newEnabled)
    setLandingPadEnabled(newEnabled)
    if (!newEnabled) setLandingPadData(null)
    document.activeElement.blur()
  }

  function dismissLandingPad () {
    setLandingPadData(null)
  }

  useEffect(() => {
    const DISMISS_EVENTS = ['Docked', 'DockingCancelled', 'DockingTimeout', 'StartJump', 'Shutdown', 'Undocked']
    return eventListener('newLogEntry', (message) => {
      if (message.event === 'ApproachSettlement' && message.StationEconomy) {
        const raw = message.StationEconomy
        const match = raw.match(/\$economy_(\w+);/)
        setLastSettlementEconomy(match ? match[1] : null)
      }
      if (message.event === 'DockingGranted' && landingPadEnabled) {
        setLandingPadData({
          pad: message.LandingPad,
          stationName: message.StationName,
          stationType: message.StationType,
          economy: lastSettlementEconomy
        })
      }
      if (DISMISS_EVENTS.includes(message.event)) {
        setLandingPadData(null)
      }
    })
  }, [landingPadEnabled, lastSettlementEconomy])

  return { landingPadEnabled, landingPadData, toggleLandingPad, dismissLandingPad }
}
