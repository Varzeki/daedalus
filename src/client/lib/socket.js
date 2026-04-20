/* global WebSocket, CustomEvent */
import { createContext, useState, useContext, useEffect } from 'react'
import Router from 'next/router'
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
  landingPadEnabled: false,
  _autoSwitchJumping: false,
  _autoSwitchCooldown: 0
}

const PERSISTED_OPTIONS = ['notifications', 'explorationAutoSwitch', 'landingPadEnabled', 'audioEnabled']
const STORAGE_KEY = 'daedalus-socket-options'
const AUTOSWITCH_STORAGE_KEY = 'daedalus-autoswitch-state'

function setSocketOption (key, value) {
  socketOptions[key] = value
  if (typeof window !== 'undefined' && PERSISTED_OPTIONS.includes(key)) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
      saved[key] = value
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch (e) { /* ignore */ }
  }
}

function persistAutoSwitchState () {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(AUTOSWITCH_STORAGE_KEY, JSON.stringify({
      jumping: socketOptions._autoSwitchJumping,
      cooldown: socketOptions._autoSwitchCooldown
    }))
  } catch (e) { /* ignore */ }
}

// Restore persisted toggle states from localStorage
if (typeof window !== 'undefined') {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    if (saved) {
      if (typeof saved.explorationAutoSwitch === 'boolean') socketOptions.explorationAutoSwitch = saved.explorationAutoSwitch
      if (typeof saved.notifications === 'boolean') socketOptions.notifications = saved.notifications
      if (typeof saved.landingPadEnabled === 'boolean') socketOptions.landingPadEnabled = saved.landingPadEnabled
      if (typeof saved.audioEnabled === 'boolean') socketOptions.audioEnabled = saved.audioEnabled
    }
  } catch (e) { /* ignore */ }
  // Restore autoswitch navigation state from sessionStorage
  try {
    const autoState = JSON.parse(window.sessionStorage.getItem(AUTOSWITCH_STORAGE_KEY))
    if (autoState) {
      socketOptions._autoSwitchJumping = autoState.jumping || false
      socketOptions._autoSwitchCooldown = autoState.cooldown || 0
    }
  } catch (e) { /* ignore */ }
}

const isDev = process.env.NODE_ENV === 'development'

/** Timestamped dev-mode logger — matches server-side format for correlation */
function devLog (...args) {
  if (!isDev) return
  const now = new Date()
  const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  console.log(ts, ...args)
}

function socketDebugMessage () {
  devLog('[SOCKET]', ...arguments)
}

function connect (socketState, setSocketState) {
  if (socket !== null) return

  // Reset on reconnect
  callbackHandlers = {}
  deferredEventQueue = []
  if (broadcastActivityTimeout) {
    clearTimeout(broadcastActivityTimeout)
    broadcastActivityTimeout = null
  }
  recentBroadcastEvents = 0

  socket = new WebSocket('ws://' + window.location.host)
  if (process.env.NODE_ENV === 'development') devLog('[SOCKET] Connecting to', 'ws://' + window.location.host)
  socket.onmessage = (event) => {
    let requestId, name, message
    try {
      ({ requestId, name, message } = JSON.parse(event.data))
    } catch (e) {
      console.error('Failed to parse socket message:', e)
      return
    }
    // Invoke callback to handler (if there is one)
    if (requestId && callbackHandlers[requestId]) callbackHandlers[requestId](event, setSocketState)

    // Updating resync whern loading completes tells any components to resync
    // with the server. it is useful for remote clients that disconnects then
    // reconnects to tell them to update once the service is ready.
    if (name === 'loadingProgress') {
      if (process.env.NODE_ENV === 'development') devLog(`[SOCKET] loadingProgress: complete=${message.loadingComplete} inProgress=${message.loadingInProgress}`)
      if (message.loadingComplete) {
        if (process.env.NODE_ENV === 'development') devLog('[SOCKET] Ready state → true (via loadingProgress)')
        setSocketState(prevState => ({
          ...prevState,
          ready: true
        }))
      }
    }

    // Broadcast event to anything that is listening for an event with this name
    if (!requestId && name) {
      if (process.env.NODE_ENV === 'development') {
        const summary = name === 'gameStateChange'
          ? `file=${message?._changedFile}`
          : name === 'newLogEntry'
            ? `event=${message?.event}`
            : ''
        devLog(`[RECV-BROADCAST] ${name}  ${summary}`)
      }
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

      // ── Auto-switch logic ──
      // Rules:
      // 1. In supercruise + FSD charge begins → switch to route (must be a jump)
      // 2. In supercruise + jump charge cancelled → switch to system (or bio if in atmosphere)
      // 3. Not in supercruise + hyperspace jump begins → switch to route (jumped from idle)
      // 4. Enter a body's atmosphere → switch to bioscanner
      // 5. Leave a body's atmosphere → switch to system

      // Early auto-switch via Status flags (rule 1: supercruise + charging = jump)
      try {
        if (socketOptions.explorationAutoSwitch && name === 'gameStateChange' && message?._changedFile === 'Status') {
          const statusFlags = message?.Status?.Flags ?? 0
          const statusFlags2 = message?.Status?.Flags2 ?? 0
          const fsdCharging = (statusFlags & 131072) !== 0
          const supercruise = (statusFlags & 16) !== 0
          const fsdHyperdriveCharging = (statusFlags2 & 524288) !== 0
          const fsdJump = (statusFlags & 1073741824) !== 0
          const hasLatLon = (statusFlags & 2097152) !== 0
          const path = Router.asPath

          if (path.startsWith('/exploration')) {
            // Skip during post-arrival cooldown to avoid re-triggering
            const inCooldown = socketOptions._autoSwitchCooldown && Date.now() - socketOptions._autoSwitchCooldown < 5000

            // Rule 1: Supercruise + FSD charging → switch to route
            if (!inCooldown && !socketOptions._autoSwitchJumping) {
              if (fsdCharging && supercruise && fsdHyperdriveCharging) {
                socketOptions._autoSwitchJumping = true
                socketOptions._autoSwitchCooldown = 0
                persistAutoSwitchState()
                if (path !== '/exploration/route') Router.push('/exploration/route')
              }
            }

            // Rule 2: Charge cancelled — was jumping but FSD no longer charging and not mid-jump
            if (socketOptions._autoSwitchJumping && !fsdCharging && !fsdJump) {
              socketOptions._autoSwitchJumping = false
              persistAutoSwitchState()
              if (hasLatLon) {
                if (path !== '/exploration/biologicals') Router.push('/exploration/biologicals')
              } else {
                if (path !== '/exploration/system') Router.push('/exploration/system')
              }
            }
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_STATUS_ERROR', e) }

      // Rule 3: Not in supercruise + hyperspace jump begins (StartJump journal event)
      // Also acts as a fallback if Status flags fire too late
      try {
        if (socketOptions.explorationAutoSwitch && name === 'newLogEntry') {
          const path = Router.asPath
          if (path.startsWith('/exploration')) {
            if (message.event === 'StartJump' && message.JumpType === 'Hyperspace') {
              socketOptions._autoSwitchJumping = true
              socketOptions._autoSwitchCooldown = 0
              persistAutoSwitchState()
              if (path !== '/exploration/route') Router.push('/exploration/route')
            }
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_CHARGE_ERROR', e) }

      // Arrival: switch to system (or bio if on a body surface)
      try {
        if (socketOptions.explorationAutoSwitch && name === 'newLogEntry') {
          if (message.event === 'FSDJump' || message.event === 'Location') {
            socketOptions._autoSwitchJumping = false
            socketOptions._autoSwitchCooldown = Date.now()
            persistAutoSwitchState()
            const path = Router.asPath
            if (path.startsWith('/exploration')) {
              if (path !== '/exploration/system') Router.push('/exploration/system')
            }
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_JUMP_ERROR', e) }

      // Rules 4 & 5: Atmosphere enter/leave (suppressed while mid-jump)
      try {
        if (socketOptions.explorationAutoSwitch && !socketOptions._autoSwitchJumping && name === 'newLogEntry') {
          const path = Router.asPath
          if (path.startsWith('/exploration')) {
            if (message.event === 'ApproachBody') {
              if (path !== '/exploration/biologicals') Router.push('/exploration/biologicals')
            }
            if (message.event === 'LeaveBody') {
              if (path !== '/exploration/system') Router.push('/exploration/system')
            }
          }
        }
      } catch (e) { console.log('AUTO_SWITCH_BODY_ERROR', e) }
    }
    socketDebugMessage('Message received from socket server', requestId, name, message)
  }
  socket.onopen = async (e) => {
    if (process.env.NODE_ENV === 'development') devLog('[SOCKET] Connection opened')
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
      if (process.env.NODE_ENV === 'development') devLog(`[SOCKET] getLoadingStatus: complete=${loadingStats.loadingComplete} inProgress=${loadingStats.loadingInProgress}`)
      if (loadingStats.loadingComplete) {
        if (process.env.NODE_ENV === 'development') devLog('[SOCKET] Ready state → true (via getLoadingStatus)')
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
    if (process.env.NODE_ENV === 'development') devLog('[SOCKET] Connection closed — reconnecting in 5s')
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

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof WebSocket !== 'undefined') {
      connect(socketState, setSocketState)
    }
  }, [])

  return (
    <SocketContext.Provider value={socketState}>
      {children}
    </SocketContext.Provider>
  )
}

function useSocket () { return useContext(SocketContext) }

function sendEvent (name, message = null, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const requestId = generateUuid()
    const sendStart = (process.env.NODE_ENV === 'development') ? Date.now() : 0
    if (process.env.NODE_ENV === 'development') devLog(`[SEND] → ${name}  id=${requestId.slice(0,8)}`)
    let timer = null
    callbackHandlers[requestId] = (event, setSocketState) => {
      if (timer) clearTimeout(timer)
      const { message } = JSON.parse(event.data)
      delete callbackHandlers[requestId]
      if (process.env.NODE_ENV === 'development') devLog(`[SEND] ← ${name}  id=${requestId.slice(0,8)}  ${Date.now() - sendStart}ms`)
      setSocketState(prevState => ({
        ...prevState,
        active: socketRequestsPending()
      }))
      resolve(message)
    }
    if (timeout > 0) {
      timer = setTimeout(() => {
        delete callbackHandlers[requestId]
        if (process.env.NODE_ENV === 'development') devLog(`[SEND] TIMEOUT ${name}  id=${requestId.slice(0,8)}  ${timeout}ms`)
        reject(new Error(`sendEvent '${name}' timed out after ${timeout}ms`))
      }, timeout)
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
  socketOptions,
  setSocketOption,
  devLog
}
