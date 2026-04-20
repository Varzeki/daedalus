function isWindowsApp () { return (typeof window !== 'undefined' && typeof window.daedalusTerminal_version === 'function') }
function isWindowFullScreen () { if (isWindowsApp()) { return window.daedalusTerminal_isFullScreen() } }
function isWindowPinned () { if (isWindowsApp()) { return window.daedalusTerminal_isPinned() } }
function openReleaseNotes () { if (isWindowsApp()) { return window.daedalusTerminal_openReleaseNotes() } }
function openTerminalInBrowser () { if (isWindowsApp()) { return window.daedalusTerminal_openTerminalInBrowser() } }

function appVersion () {
  if (isWindowsApp()) { return window.daedalusTerminal_version() }
  return null
}

function newWindow () {
  if (isWindowsApp()) { return window.daedalusTerminal_newWindow() }

  window.open(`//${window.location.host}`)
}

function closeWindow () {
  if (isWindowsApp()) { return window.daedalusTerminal_quit() }

  window.close()
}

async function checkForUpdate () {
  if (isWindowsApp()) {
    try {
      return JSON.parse(await window.daedalusTerminal_checkForUpdate())
    } catch {}
    return null
  }
}

function installUpdate () {
  if (isWindowsApp()) { return window.daedalusTerminal_installUpdate() }
}

async function toggleFullScreen () {
  let result
  if (isWindowsApp()) {
    result = await window.daedalusTerminal_toggleFullScreen()
  } else if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.webkitCurrentFullScreenElement) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen()
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen()
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen()
    }
    result = true
  } else {
    if (document.cancelFullScreen) {
      document.cancelFullScreen()
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen()
    } else if (document.webkitCancelFullScreen) {
      document.webkitCancelFullScreen()
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    }
    result = false
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('daedalus-fullscreen-change', { detail: result }))
  }
  return result
}

async function togglePinWindow () {
  if (isWindowsApp()) { return await window.daedalusTerminal_togglePinWindow() }
}

function hasCustomChrome () { return (typeof window !== 'undefined' && typeof window.daedalusTerminal_hasCustomChrome === 'function') }

function minimizeWindow () {
  if (isWindowsApp()) { return window.daedalusTerminal_minimizeWindow() }
}

async function startWindowDrag () {
  if (isWindowsApp()) {
    const maximized = await window.daedalusTerminal_startDrag()
    // startDrag may toggle maximize on double-click; sync the state
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('daedalus-maximize-change', { detail: maximized }))
    }
  }
}

async function toggleMaximize () {
  if (isWindowsApp()) {
    const result = await window.daedalusTerminal_toggleMaximize()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('daedalus-maximize-change', { detail: result }))
    }
    return result
  }
}

function isWindowMaximized () { if (isWindowsApp()) { return window.daedalusTerminal_isMaximized() } }

module.exports = {
  isWindowsApp,
  isWindowFullScreen,
  isWindowPinned,
  openReleaseNotes,
  openTerminalInBrowser,
  appVersion,
  newWindow,
  closeWindow,
  toggleFullScreen,
  togglePinWindow,
  checkForUpdate,
  installUpdate,
  hasCustomChrome,
  minimizeWindow,
  startWindowDrag,
  toggleMaximize,
  isWindowMaximized
}
