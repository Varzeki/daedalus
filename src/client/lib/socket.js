/* global WebSocket, CustomEvent */
import { createContext, useState, useContext } from 'react'
import notification from 'lib/notification'

let socket = null// Store socket connection (defaults to null)
let callbackHandlers = {} // Store callbacks waiting to be executed (pending response from server)
let deferredEventQueue = [] // Store events waiting to be sent (used when server is not ready yet or offline)
let recentBroadcastEvents = 0
let broadcastActivityTimeout = null

const defaultSocketState = {
  connected: false, // Boolean to indicate current connection status
  active: false, // Boolean to indicate if any pending requests
  ready: false // Boolean to indicate if the service is ready and loaded
}

const socketOptions = {
  notifications: false,
  explorationAutoSwitch: false,
  audioEnabled: false,
  landingPadEnabled: false
}

// Restore persisted toggle states from localStorage
if (typeof window !== 'undefined') {
  try {
    const saved = JSON.parse(window.localStorage.getItem('daedalus-socket-options'))
    if (saved) {
      if (typeof saved.explorationAutoSwitch === 'boolean') socketOptions.explorationAutoSwitch = saved.explorationAutoSwitch
    }
  } catch (e) { /* ignore */ }
}

function socketDebugMessage () { /* console.log(...arguments) */ }

function connect (socketState, setSocketState) {
  if (socket !== null) return

  // Reset on reconnect
  callbackHandlers = {}
  deferredEventQueue = []

  socket = new WebSocket('ws://' + window.location.host)
  socket.onmessage = (event) => {
    const { requestId, name, message } = JSON.parse(event.data)
    // Invoke callback to handler (if there is one)
    if (requestId && callbackHandlers[requestId]) callbackHandlers[requestId](event, setSocketState)

    // Updating resync whern loading completes tells any components to resync
    // with the server. it is useful for remote clients that disconnects then
    // reconnects to tell them to update once the service is ready.
    if (name === 'loadingProgress') {
      if (message.loadingComplete) {
        setSocketState(prevState => ({
          ...prevState,
          ready: true
        }))
      }
    }

    // Broadcast event to anything that is listening for an event with this name
    if (!requestId && name) {
      window.dispatchEvent(new CustomEvent(`socketEvent_${name}`, { detail: message }))

      // When a broadcast message is received, use recentBroadcastEvents to
      // track recent requests so the activity monitor in the UI can reflect
      // that there is activity and that the client is receiving events.
      recentBroadcastEvents++
      if (!broadcastActivityTimeout) {
        broadcastActivityTimeout = setTimeout(() => {
          broadcastActivityTimeout = null
          recentBroadcastEvents = 0
          setSocketState(prevState => ({
            ...prevState,
            active: socketRequestsPending()
          }))
        }, 500)
      }

      // Trigger notifications for key actions
      // TODO Refactor out into a seperate handler
      try { // Don't crash if fails because properties are missing
        if (socketOptions.notifications === true && name === 'newLogEntry') {
          if (message.event === 'StartJump' && message.StarSystem) notification(`Jumping to ${message.StarSystem}`)
          if (message.event === 'FSDJump') notification(`Arrived in ${message.StarSystem}`)
          if (message.event === 'ApproachBody') notification(`Approaching ${message.Body}`)
          if (message.event === 'LeaveBody') notification(`Leaving ${message.Body}`)
          if (message.event === 'NavRoute') notification('New route plotted')
          if (message.event === 'DockingGranted') notification(`Docking at ${message.StationName}`)
          if (message.event === 'Docked') notification(`Docked at ${message.StationName}`)
          if (message.event === 'Undocked') notification(`Now leaving ${message.StationName}`)
          if (message.event === 'ApproachSettlement') notification(`Approaching ${message.Name}`)
          if (message.event === 'ReceiveText' && message.From) notification(() => <p style={{ width: '100%' }}><span className='text-primary'>{message.From_Localised || message.From}</span><br /><span className='text-info text-no-transform'>{message.Message_Localised || message.Message}</span></p>)
          if (message.event === 'MarketBuy') notification(`Purchased ${message.Type_Localised || message.Type} (${message.Count})`)
          if (message.event === 'MarketSell') notification(`Sold ${message.Type_Localised || message.Type} (${message.Count})`)
          if (message.event === 'BuyDrones') notification(`Purchased Limpet ${message.Count === 1 ? 'Drone' : `Drones (${message.Count})`}`)
          if (message.event === 'SellDrones') notification(`Sold Limpet ${message.Count === 1 ? 'Drone' : `Drones (${message.Count})`}`)
          if (message.event === 'CargoDepot' && message.UpdateType === 'Collect') notification(`Collected ${message.CargoType.replace(/([a-z])([A-Z])/g, '$1 $2')} (${message.Count})`)
          if (message.event === 'CargoDepot' && message.UpdateType === 'Deliver') notification(`Delivered ${message.CargoType.replace(/([a-z])([A-Z])/g, '$1 $2')} (${message.Count})`)
          if (message.event === 'Scanned') notification('Scan detected')
        }
      } catch (e) { console.log('NOTIFICATION_ERROR', e) }

      // Auto-switch exploration pages on FSD charging (via gameStateChange + status flags)
      try {
        if (socketOptions.explorationAutoSwitch && name === 'gameStateChange') {
          const path = window.location.pathname
          if (path.startsWith('/exploration')) {
            sendEvent('getCmdrStatus').then(cmdrStatus => {
              const flags = cmdrStatus?.flags || {}
              const currentPath = window.location.pathname
              if (!currentPath.startsWith('/exploration')) return
              if (flags.fsdCharging && !flags.fsdJump) {
                // FSD is charging — save current page and switch to route view
                if (!socketOptions._autoSwitchFrom) socketOptions._autoSwitchFrom = currentPath
                if (currentPath !== '/exploration/route') window.location.href = '/exploration/route'
              } else if (flags.fsdJump) {
                // Mid-jump — stay on route
                socketOptions._autoSwitchJumping = true
              } else if (!flags.fsdCharging && !flags.fsdJump && socketOptions._autoSwitchFrom) {
                if (!socketOptions._autoSwitchJumping) {
                  // FSD charge cancelled — switch back to previous page
                  const returnTo = socketOptions._autoSwitchFrom
                  socketOptions._autoSwitchFrom = null
                  if (currentPath !== returnTo) window.location.href = returnTo
                }
                // If jumping was true, FSDJump newLogEntry will handle the switch
              }
            }).catch(() => {})
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_CHARGE_ERROR', e) }

      // Switch to system page when jump completes (FSDJump / Location events)
      try {
        if (socketOptions.explorationAutoSwitch && name === 'newLogEntry') {
          if (message.event === 'FSDJump' || message.event === 'Location') {
            socketOptions._autoSwitchFrom = null
            socketOptions._autoSwitchJumping = false
            const path = window.location.pathname
            if (path.startsWith('/exploration') && path !== '/exploration/system') {
              window.location.href = '/exploration/system'
            }
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_JUMP_ERROR', e) }
    }
    socketDebugMessage('Message received from socket server', requestId, name, message)
  }
  socket.onopen = async (e) => {
    setSocketState(prevState => ({
      ...prevState,
      active: socketRequestsPending(),
      connected: true
    }))

    // While connection remains open and there are queued messages, try to
    // deliver. The readyState check matters because otherwise if a connection
    // does down just after going up we want to catch that scenario, and try to
    // send the message again when the open event is next fired.
    while (socket.readyState === WebSocket.OPEN && deferredEventQueue.length > 0) {
      const { requestId, name, message } = deferredEventQueue[0]
      try {
        socket.send(JSON.stringify({ requestId, name, message }))
        setSocketState(prevState => ({
          ...prevState,
          active: socketRequestsPending()
        }))
        deferredEventQueue.shift() // Remove message from queue once delivered
        socketDebugMessage('Queued message sent to socket server', requestId, name, message)
      } catch (e) {
        // Edge case for flakey connections
        socketDebugMessage('Failed to deliver queued message socket server', requestId, name, message)
      }
    }

    // If we are fully loaded, then set 'ready' state to true, otherwise wait
    // until get a loadingProgress event that indicates the service is loaded
    try {
      const loadingStats = await sendEvent('getLoadingStatus')
      if (loadingStats.loadingComplete) {
        setSocketState(prevState => ({
          ...prevState,
          ready: true
        }))
      }
    } catch (err) {
      console.error('getLoadingStatus failed:', err)
    }
  }
  socket.onclose = (e) => {
    socket = null
    socketDebugMessage('Disconnected from socket server (will attempt reconnection)')
    setSocketState(prevState => ({
      ...prevState,
      active: socketRequestsPending(),
      connected: false,
      ready: false
    }))
    setTimeout(() => { connect(socketState, setSocketState) }, 5000)
  }

  socket.onerror = function (err) {
    socketDebugMessage('Socket error', err.message)
    socket.close()
  }
}

const SocketContext = createContext()

function SocketProvider ({ children }) {
  const [socketState, setSocketState] = useState(defaultSocketState)

  if (typeof window !== 'undefined' && typeof WebSocket !== 'undefined' && socketState.connected !== true) {
    connect(socketState, setSocketState)
  }

  return (
    <SocketContext.Provider value={socketState}>
      {children}
    </SocketContext.Provider>
  )
}

function useSocket () { return useContext(SocketContext) }

function sendEvent (name, message = null) {
  return new Promise((resolve, reject) => {
    const requestId = generateUuid()
    callbackHandlers[requestId] = (event, setSocketState) => {
      const { message } = JSON.parse(event.data)
      delete callbackHandlers[requestId]
      setSocketState(prevState => ({
        ...prevState,
        active: socketRequestsPending()
      }))
      resolve(message)
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ requestId, name, message }))
    } else {
      deferredEventQueue.push({ requestId, name, message })
    }
  })
}

function eventListener (eventName, callback) {
  const eventHandler = (e) => { callback(e.detail) }
  window.addEventListener(`socketEvent_${eventName}`, eventHandler)
  return () => window.removeEventListener(`socketEvent_${eventName}`, eventHandler)
}

function socketRequestsPending () {
  return !!((Object.keys(callbackHandlers).length > 0 || deferredEventQueue.length > 0 || recentBroadcastEvents > 0))
}

function generateUuid () {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

module.exports = {
  SocketProvider,
  useSocket,
  sendEvent,
  eventListener,
  socketOptions
}
