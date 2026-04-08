const os = require('os')
const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')
const covasEventMap = require('./data/covas-event-map.json')

const PREFERENCES_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal')
const PREFERENCES_FILE = path.join(PREFERENCES_DIR, 'Preferences.json')

// Default voicelines directory (relative to the service lib directory)
const BUNDLED_VOICELINES_DIR = path.join(__dirname, '..', '..', '..', '..', 'game_voicelines', 'verity')

const QUEUE_GAP_MS = 500

let _preferencesCache = null
let _psProcess = null // Persistent PowerShell audio worker
let _psResolve = null // Resolve callback for current playback
let _queue = []
let _playing = false
let _debounceTimers = {}
let _hullThresholdState = null // tracks which hull threshold was last announced
let _oxygenThresholdState = null // tracks which oxygen threshold was last announced
let _cargoFullAnnounced = false // tracks whether cargo full was already announced

/**
 * Get or create the persistent PowerShell audio worker process.
 * Reads file paths from stdin, prints "DONE" to stdout when playback finishes.
 */
function getPsProcess () {
  if (_psProcess && !_psProcess.killed) return _psProcess

  const script = `
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }
  if ($line -eq 'STOP') { $player.Stop(); $player.Close(); Write-Output 'DONE'; continue }
  try {
    $player.Open([Uri]$line)
    $player.Play()
    Start-Sleep -Milliseconds 500
    while ($player.Position -lt $player.NaturalDuration.TimeSpan) { Start-Sleep -Milliseconds 100 }
    $player.Close()
  } catch {}
  Write-Output 'DONE'
}
`

  _psProcess = childProcess.spawn('powershell', ['-NoProfile', '-Command', '-'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore']
  })

  _psProcess.stdout.setEncoding('utf8')
  _psProcess.stdout.on('data', (data) => {
    if (data.includes('DONE') && _psResolve) {
      const resolve = _psResolve
      _psResolve = null
      resolve()
    }
  })

  _psProcess.on('close', () => {
    _psProcess = null
    // If something was waiting, resolve it so the queue doesn't hang
    if (_psResolve) {
      const resolve = _psResolve
      _psResolve = null
      resolve()
    }
  })

  _psProcess.stdin.write(script + '\n')
  return _psProcess
}

function getPreferencesCached () {
  if (_preferencesCache) return _preferencesCache
  _preferencesCache = fs.existsSync(PREFERENCES_FILE) ? JSON.parse(fs.readFileSync(PREFERENCES_FILE)) : {}
  return _preferencesCache
}

function isVoiceoverEnabled () {
  const prefs = getPreferencesCached()
  return prefs?.covasVoiceoverEnabled === true
}

function isExtendedEnabled () {
  const prefs = getPreferencesCached()
  return prefs?.covasExtendedEnabled === true
}

function getVoicelinesDir () {
  const prefs = getPreferencesCached()
  return prefs?.covasDir || BUNDLED_VOICELINES_DIR
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Play a WAV file using a persistent PowerShell worker process.
 * Returns a Promise that resolves when playback finishes.
 */
function playWav (filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve() // Skip silently if file missing
    }

    try {
      const proc = getPsProcess()
      _psResolve = resolve

      // Send file path to the persistent worker
      proc.stdin.write(filePath.replace(/\\/g, '\\\\') + '\n')
    } catch (e) {
      resolve() // Don't hang on error
    }

    // Safety timeout — if playback doesn't finish in 30s, move on
    setTimeout(() => {
      if (_psResolve === resolve) {
        _psResolve = null
        resolve()
      }
    }, 30000)
  })
}

/**
 * Queue a voiceline for playback. Plays sequentially with a gap to avoid overlaps.
 */
async function queuePlay (wavFile) {
  const voicelinesDir = getVoicelinesDir()
  const filePath = path.join(voicelinesDir, wavFile)

  if (!fs.existsSync(filePath)) return

  _queue.push(filePath)
  if (!_playing) {
    _playing = true
    while (_queue.length > 0) {
      const next = _queue.shift()
      await playWav(next)
      if (_queue.length > 0) await sleep(QUEUE_GAP_MS)
    }
    _playing = false
  }
}

/**
 * Check if an event is currently debounced.
 * Returns true if the event should be suppressed.
 */
function isDebounced (eventName, debounceMs) {
  const now = Date.now()
  if (_debounceTimers[eventName] && (now - _debounceTimers[eventName]) < debounceMs) {
    return true
  }
  _debounceTimers[eventName] = now
  return false
}

/**
 * Play the FSD hyperspace countdown: 5... 4... 3... 2... 1... Engage
 * Each clip is spaced ~1 second apart to match the in-game countdown.
 */
async function playCountdown () {
  const sequence = covasEventMap.voiceover.countdownSequence
  if (!sequence) return

  const voicelinesDir = getVoicelinesDir()
  for (let i = 0; i < sequence.length; i++) {
    const filePath = path.join(voicelinesDir, sequence[i])
    if (fs.existsSync(filePath)) {
      await playWav(filePath)
    }
    // ~1 second spacing between countdown numbers (clip duration + gap)
    if (i < sequence.length - 1) await sleep(400)
  }
}

/**
 * Handle a journal log event — look up matching voiceline and queue it.
 */
function handleLogEvent (logEvent) {
  if (!isVoiceoverEnabled()) return

  const eventName = logEvent.event
  if (!eventName) return

  // --- Special handling for StartJump (split by JumpType) ---
  if (eventName === 'StartJump') {
    if (logEvent.JumpType === 'Hyperspace') {
      // Queue the countdown sequence (non-blocking to allow other events)
      _queue = [] // clear queue so countdown isn't interrupted
      playCountdown()
    } else {
      const mapping = covasEventMap.voiceover.logEvents.StartJump_Supercruise
      if (mapping) queuePlay(mapping.file)
    }
    return
  }

  // --- Hull damage: debounce + threshold alerts ---
  if (eventName === 'HullDamage') {
    // Play hull integrity threshold alerts (only when crossing a boundary)
    const health = logEvent.Health
    if (typeof health === 'number') {
      const thresholds = covasEventMap.voiceover.hullThresholds
      if (thresholds) {
        let newState = null
        if (health < thresholds.critical.below) {
          newState = 'critical'
        } else if (health < thresholds.compromised.below) {
          newState = 'compromised'
        }
        // Only play if crossing into a new threshold
        if (newState && newState !== _hullThresholdState) {
          _hullThresholdState = newState
          queuePlay(thresholds[newState].file)
        }
      }
      // Reset threshold state when hull is repaired above compromised
      if (health >= (covasEventMap.voiceover.hullThresholds?.compromised?.below ?? 0.5)) {
        _hullThresholdState = null
      }
    }

    // Debounce the "taking damage" clip (45s)
    const mapping = covasEventMap.voiceover.logEvents.HullDamage
    if (mapping && !isDebounced('HullDamage', mapping.debounce)) {
      queuePlay(mapping.file)
    }
    return
  }

  // --- Under attack: debounce (15s) ---
  if (eventName === 'UnderAttack') {
    const mapping = covasEventMap.voiceover.logEvents.UnderAttack
    if (mapping && !isDebounced('UnderAttack', mapping.debounce)) {
      queuePlay(mapping.file)
    }
    return
  }

  // --- Compound events ---
  let lookupKey = eventName
  if (eventName === 'ShieldState') {
    lookupKey = logEvent.ShieldsUp ? 'ShieldState_ShieldsUp' : 'ShieldState_ShieldsDown'
  } else if (eventName === 'CommitCrime' && logEvent.CrimeType === 'bounty') {
    lookupKey = 'CommitCrime_bounty'
  } else if (eventName === 'CockpitBreached') {
    // Play canopy critical first, then canopy compromised
    const canopyThresholds = covasEventMap.voiceover.canopyThresholds
    if (canopyThresholds?.critical?.file) {
      queuePlay(canopyThresholds.critical.file)
    }
    const mapping = covasEventMap.voiceover.logEvents.CockpitBreached
    if (mapping?.file) queuePlay(mapping.file)
    return
  }

  const mapping = covasEventMap.voiceover.logEvents[lookupKey]
  if (mapping && mapping.file) {
    queuePlay(mapping.file)
  }
}

/**
 * Handle a status flag change — look up matching voiceline and queue it.
 */
function handleStatusChange (flagName, value) {
  if (!isVoiceoverEnabled()) return

  const lookupKey = `${flagName}_${value}`
  const mapping = covasEventMap.voiceover.statusFlags[lookupKey]
  if (mapping) {
    queuePlay(mapping.file)
  }
}

/**
 * Handle an extended alert — plays clips for computed conditions
 * (low fuel, dangerous system, valuable body, etc.)
 */
function handleExtendedAlert (alertName) {
  if (!isExtendedEnabled()) return

  const mapping = covasEventMap.extended[alertName]
  if (mapping) {
    queuePlay(mapping.file)
  }
}

function invalidatePreferencesCache () {
  _preferencesCache = null
}

/**
 * Handle oxygen level changes — plays alert when crossing thresholds.
 * @param {number} oxygenLevel - Oxygen level from 0.0 to 1.0
 */
function handleOxygenThreshold (oxygenLevel) {
  if (!isVoiceoverEnabled()) return
  if (typeof oxygenLevel !== 'number') return

  const thresholds = covasEventMap.voiceover.oxygenThresholds
  if (!thresholds) return

  let newState = null
  if (oxygenLevel < thresholds.critical.below) {
    newState = 'critical'
  } else if (oxygenLevel < thresholds.low.below) {
    newState = 'low'
  }

  // Only play if crossing into a new threshold
  if (newState && newState !== _oxygenThresholdState) {
    _oxygenThresholdState = newState
    queuePlay(thresholds[newState].file)
  }

  // Reset threshold state when oxygen recovers above low
  if (oxygenLevel >= (thresholds.low.below)) {
    _oxygenThresholdState = null
  }
}

/**
 * Handle cargo capacity change — plays alert when cargo becomes full.
 * @param {number} cargoCount - Current cargo count
 * @param {number} cargoCapacity - Max cargo capacity
 */
function handleCargoCapacity (cargoCount, cargoCapacity) {
  if (!isVoiceoverEnabled()) return
  if (typeof cargoCount !== 'number' || typeof cargoCapacity !== 'number') return
  if (cargoCapacity <= 0) return

  const isFull = cargoCount >= cargoCapacity

  if (isFull && !_cargoFullAnnounced) {
    _cargoFullAnnounced = true
    const alert = covasEventMap.voiceover.capacityAlerts?.cargoFull
    if (alert?.file) queuePlay(alert.file)
  } else if (!isFull) {
    _cargoFullAnnounced = false
  }
}

function stop () {
  _queue = []
  if (_psProcess && !_psProcess.killed) {
    try { _psProcess.stdin.write('STOP\n') } catch (_) {}
  }
  if (_psResolve) {
    const resolve = _psResolve
    _psResolve = null
    resolve()
  }
  _playing = false
}

module.exports = {
  handleLogEvent,
  handleStatusChange,
  handleExtendedAlert,
  handleOxygenThreshold,
  handleCargoCapacity,
  invalidatePreferencesCache,
  isVoiceoverEnabled,
  isExtendedEnabled,
  stop,
  queuePlay
}
