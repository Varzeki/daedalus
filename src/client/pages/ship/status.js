import { useState, useEffect } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { ShipPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ShipStatusPanel from 'components/panels/ship/ship-status-panel'
import ShipModuleInspectorPanel from 'components/panels/ship/ship-module-inspector-panel'

export default function ShipStatusPage () {
  const { connected, active, ready } = useSocket()
  const [ship, setShip] = useState()
  const [selectedModule, setSelectedModule] = useState()
  const [cmdrStatus, setCmdrStatus] = useState()

  // Using state for toggle switches like this allow us to have the UI
  // respond immediately to the input from the user, even if it takes the game
  // API a second or two to callback and update us with the new state.
  // It also means that even if they do go out of sync, the UI in DAEDALUS
  // Terminal will correctly reflect the in game state after a second or two.
  const [toggleSwitches, setToggleSwitches] = useState({
    lights: false,
    nightVision: false,
    cargoHatch: false,
    landingGear: false,
    hardpoints: false
  })

  useEffect(() => {
    ;(async () => {
      if (!connected) return
      setShip(await sendEvent('getShipStatus'))
      setCmdrStatus(await sendEvent('getCmdrStatus'))
    })()
  }, [connected, ready])

  const toggleSwitch = async (switchName) => {

    /*
    // Only toggle switch value if we think it was successful
    const switchToggled = await sendEvent('toggleSwitch', { switchName })

    setToggleSwitches({
      ...toggleSwitches,
      [switchName]: switchToggled ? !toggleSwitches[switchName] : toggleSwitches[switchName]
    })
    */
  }

  useEffect(() => {
    setToggleSwitches({
      lights: cmdrStatus?.flags?.lightsOn ?? false,
      nightVision: cmdrStatus?.flags?.nightVision ?? false,
      cargoHatch: cmdrStatus?.flags?.cargoScoopDeployed ?? false,
      landingGear: cmdrStatus?.flags?.landingGearDown ?? false,
      hardpoints: cmdrStatus?.flags?.hardpointsDeployed ?? false
    })
  }, [cmdrStatus])

  useEffect(() => eventListener('gameStateChange', async (event) => {
    // On Status.json ticks, update toggle switches and fuel directly from the
    // broadcast payload — avoids hammering getShipStatus on rapid status changes
    // (e.g. SCO, which fires many Status ticks and Fuel Replenished COVAS lines).
    if (event?._changedFile === 'Status' && event?.Status != null) {
      if (event.Status.Flags != null) {
        const f = event.Status.Flags
        setToggleSwitches({
          lights: (f & 256) !== 0,
          nightVision: (f & 268435456) !== 0,
          cargoHatch: (f & 512) !== 0,
          landingGear: (f & 4) !== 0,
          hardpoints: (f & 64) !== 0
        })
      }
      // Update fuel level inline so the fuel bar stays live without a full
      // getShipStatus round-trip on every 500ms Status tick.
      if (event.Status.Fuel?.FuelMain != null) {
        setShip(prev => prev ? {
          ...prev,
          fuelLevel: parseFloat(event.Status.Fuel.FuelMain.toFixed(2)),
          fuelReservoir: event.Status.Fuel.FuelReservoir != null
            ? parseFloat(event.Status.Fuel.FuelReservoir.toFixed(2))
            : prev.fuelReservoir,
          pips: event.Status.Pips
            ? { systems: event.Status.Pips[0], engines: event.Status.Pips[1], weapons: event.Status.Pips[2] }
            : prev.pips
        } : prev)
      }
      // Refresh cmdrStatus so flight-mode indicators (SCO, supercruise, low fuel,
      // etc.) stay in sync without waiting for journal events.
      try {
        setCmdrStatus(await sendEvent('getCmdrStatus'))
      } catch (e) { /* ignore on timeout/disconnect */ }
    }
  }), [])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    try {
      if (['Loadout', 'ModuleBuy', 'ModuleSell', 'ModuleSwap', 'ModuleStore',
        'ModuleRetrieve', 'RepairAll', 'RefuelAll', 'ShieldState',
        'HullDamage', 'DockingGranted', 'Undocked', 'Location', 'FSDJump',
        'Cargo', 'EngineerCraft'].includes(log.event)) {
        setShip(await sendEvent('getShipStatus'))
      }
      if (['Location', 'FSDJump'].includes(log.event)) {
        setCmdrStatus(await sendEvent('getCmdrStatus'))
      }
    } catch (e) { /* timeout or disconnect — will retry on next event */ }
  }), [])

  return (
    <Layout connected={connected} active={active} ready={ready} className='ship-panel'>
      <Panel navigation={ShipPanelNavItems('Status')} scrollable>
        <ShipStatusPanel
          ship={ship}
          cmdrStatus={cmdrStatus}
          toggleSwitches={toggleSwitches}
          toggleSwitch={toggleSwitch}
          selectedModule={selectedModule}
          setSelectedModule={setSelectedModule}
        />
      </Panel>
      <Panel>
        <ShipModuleInspectorPanel module={selectedModule} setSelectedModule={setSelectedModule} />
      </Panel>
    </Layout>
  )
}
