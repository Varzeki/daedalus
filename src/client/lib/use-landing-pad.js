import { useState, useEffect, useRef } from 'react'
import { eventListener, socketOptions, setSocketOption } from 'lib/socket'

export default function useLandingPad () {
  const [landingPadEnabled, setLandingPadEnabled] = useState(socketOptions.landingPadEnabled)
  const [landingPadData, setLandingPadData] = useState(null)
  const lastSettlementEconomyRef = useRef(null)
  const enabledRef = useRef(landingPadEnabled)

  function toggleLandingPad () {
    const newEnabled = !landingPadEnabled
    setSocketOption('landingPadEnabled', newEnabled)
    setLandingPadEnabled(newEnabled)
    enabledRef.current = newEnabled
    if (!newEnabled) setLandingPadData(null)
    document.activeElement.blur()
  }

  function dismissLandingPad () {
    setLandingPadData(null)
  }

  useEffect(() => {
    const DISMISS_EVENTS = ['Docked', 'DockingCancelled', 'DockingTimeout', 'StartJump', 'Shutdown', 'Undocked', 'Touchdown', 'Location']
    return eventListener('newLogEntry', (message) => {
      if (message.event === 'ApproachSettlement' && message.StationEconomy) {
        const raw = message.StationEconomy
        const match = raw.match(/\$economy_(\w+);/)
        lastSettlementEconomyRef.current = match ? match[1] : null
      }
      if (message.event === 'DockingGranted' && enabledRef.current) {
        setLandingPadData({
          pad: message.LandingPad,
          stationName: message.StationName,
          stationType: message.StationType,
          economy: lastSettlementEconomyRef.current
        })
      }
      if (DISMISS_EVENTS.includes(message.event)) {
        setLandingPadData(null)
      }
    })
  }, []) // stable — no re-subscription, no missed events

  return { landingPadEnabled, landingPadData, toggleLandingPad, dismissLandingPad }
}
