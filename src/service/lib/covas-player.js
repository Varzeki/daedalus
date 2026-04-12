const os = require('os')
const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')
const covasEventMap = require('./data/covas-event-map.json')

const PREFERENCES_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal')
const PREFERENCES_FILE = path.join(PREFERENCES_DIR, 'Preferences.json')

const DEV_BUNDLED_VOICELINES_DIR = path.join(__dirname, '..', '..', '..', 'game_voicelines', 'verity')

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
 * Reads file paths from stdin, plays them synchronously, prints "DONE" when finished.
 */
function getPsProcess () {
  if (_psProcess && !_psProcess.killed) return _psProcess

  const script = `
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }
  if ($line -eq 'STOP') { Write-Output 'DONE'; continue }
  try {
    $player = New-Object System.Media.SoundPlayer($line)
    $player.PlaySync()
    $player.Dispose()
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

function getBundledVoicelinesDir () {
  const candidateDirs = [
    path.join(path.dirname(process.execPath), 'game_voicelines', 'verity'),
    path.join(process.cwd(), 'game_voicelines', 'verity'),
    DEV_BUNDLED_VOICELINES_DIR
  ]

  return candidateDirs.find(candidateDir => fs.existsSync(candidateDir)) || candidateDirs[0]
}

function getVoicelinesDir () {
  const prefs = getPreferencesCached()
  return prefs?.covasDir || getBundledVoicelinesDir()
}

function runPowerShellWavTest (filePath) {
  const escapedPath = filePath.replace(/'/g, "''")
  const script = `try {
  $player = New-Object System.Media.SoundPlayer('${escapedPath}')
  $player.Load()
  $player.PlaySync()
  $player.Dispose()
  Write-Output 'PLAYBACK_OK'
  exit 0
} catch {
  Write-Output ('PLAYBACK_ERROR:' + $_.Exception.Message)
  exit 1
}`

  return new Promise((resolve) => {
    childProcess.execFile('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 30000
    }, (error, stdout = '', stderr = '') => {
      const output = stdout.trim()
      const playbackError = output.match(/PLAYBACK_ERROR:(.*)$/m)?.[1]?.trim() || null
      const timedOut = error?.killed === true || error?.signal === 'SIGTERM'

      resolve({
        success: !error && output.includes('PLAYBACK_OK'),
        output,
        stderr: stderr.trim(),
        exitCode: typeof error?.code === 'number' ? error.code : 0,
        timedOut,
        error: playbackError || stderr.trim() || error?.message || null
      })
    })
  })
}

async function testWav (wavFile) {
  const voicelinesDir = getVoicelinesDir()
  const filePath = path.join(voicelinesDir, wavFile)
  const fileExists = fs.existsSync(filePath)

  const result = {
    success: fileExists,
    wavFile,
    voicelinesDir,
    filePath,
    fileExists,
    voiceoverEnabled: isVoiceoverEnabled(),
    error: fileExists ? null : 'Voiceline file not found'
  }

  // Broadcast unconditionally so any client with audio enabled hears the test tone
  if (fileExists) broadcastVoiceline(wavFile)

  console.log('[COVAS TEST]', result)
  return result
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
 * Broadcast a voiceline event to all connected clients.
 * Always fires regardless of server-side voiceover setting.
 */
function broadcastVoiceline (wavFile) {
  if (global.BROADCAST_EVENT) {
    global.BROADCAST_EVENT('playVoiceline', { file: wavFile })
  }
}

/**
 * Broadcast a voiceline sequence event to all connected clients.
 * Always fires regardless of server-side voiceover setting.
 */
function broadcastSequence (files, gap) {
  if (global.BROADCAST_EVENT) {
    global.BROADCAST_EVENT('playVoicelineSequence', { files, gap: gap || 400 })
  }
}

/**
 * Queue a voiceline for local playback. Plays sequentially with a gap to avoid overlaps.
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
 * Check if an individual sound file is enabled in preferences.
 * Defaults to enabled if no preference is set.
 */
function isSoundFileEnabled (wavFile) {
  const prefs = getPreferencesCached()
  if (!prefs?.soundsEnabled) return true
  const key = wavFile.replace(/\.wav$/i, '')
  return prefs.soundsEnabled[key] !== false
}

/**
 * Broadcast a voiceover event to all connected clients.
 * Only broadcasts if voiceover is enabled in settings — each client decides
 * whether to play based on its own audio toggle (header button).
 */
function voicelinePlay (wavFile) {
  if (isVoiceoverEnabled() && isSoundFileEnabled(wavFile)) broadcastVoiceline(wavFile)
}

/**
 * Handle FSD charging start — fires when the fsdCharging status flag first becomes true.
 * Plays the charging clip only. Countdown fires later on StartJump when jump actually begins.
 */
function handleFsdCharging () {
  voicelinePlay('frameshift_drive_charging.wav')
}

/**
 * Broadcast an extended alert event to all connected clients.
 * Only broadcasts if extended alerts are enabled in settings.
 */
function extendedPlay (wavFile) {
  if (isExtendedEnabled() && isSoundFileEnabled(wavFile)) broadcastVoiceline(wavFile)
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
 * Play the FSD hyperspace countdown locally: 5... 4... 3... 2... 1... Engage
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
  const eventName = logEvent.event
  if (!eventName) return

  // --- StartJump: charging wav fires on fsdCharging flag (see handleFsdCharging).
  // Countdown fires here when the hyperspace jump actually begins.
  if (eventName === 'StartJump') {
    if (logEvent.JumpType === 'Hyperspace' && isVoiceoverEnabled() && isSoundFileEnabled('frameshift_drive_charging.wav')) {
      const sequence = covasEventMap.voiceover.countdownSequence
      if (sequence) broadcastSequence(sequence, 400)
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
          voicelinePlay(thresholds[newState].file)
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
      voicelinePlay(mapping.file)
    }
    return
  }

  // --- Under attack: debounce (15s) ---
  if (eventName === 'UnderAttack') {
    const mapping = covasEventMap.voiceover.logEvents.UnderAttack
    if (mapping && !isDebounced('UnderAttack', mapping.debounce)) {
      voicelinePlay(mapping.file)
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
      voicelinePlay(canopyThresholds.critical.file)
    }
    const mapping = covasEventMap.voiceover.logEvents.CockpitBreached
    if (mapping?.file) voicelinePlay(mapping.file)
    return
  }

  const mapping = covasEventMap.voiceover.logEvents[lookupKey]
  if (mapping && mapping.file) {
    voicelinePlay(mapping.file)
  }
}

/**
 * Handle a status flag change — look up matching voiceline and queue it.
 */
function handleStatusChange (flagName, value) {
  const lookupKey = `${flagName}_${value}`
  const mapping = covasEventMap.voiceover.statusFlags[lookupKey]
  if (mapping) {
    voicelinePlay(mapping.file)
  }
}

/**
 * Handle an extended alert — plays clips for computed conditions
 * (low fuel, dangerous system, valuable body, etc.)
 */
function handleExtendedAlert (alertName) {
  const mapping = covasEventMap.extended[alertName]
  if (mapping) {
    extendedPlay(mapping.file)
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
    voicelinePlay(thresholds[newState].file)
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
  if (typeof cargoCount !== 'number' || typeof cargoCapacity !== 'number') return
  if (cargoCapacity <= 0) return

  const isFull = cargoCount >= cargoCapacity

  if (isFull && !_cargoFullAnnounced) {
    _cargoFullAnnounced = true
    const alert = covasEventMap.voiceover.capacityAlerts?.cargoFull
    if (alert?.file) voicelinePlay(alert.file)
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
  handleFsdCharging,
  handleLogEvent,
  handleStatusChange,
  handleExtendedAlert,
  handleOxygenThreshold,
  handleCargoCapacity,
  invalidatePreferencesCache,
  isVoiceoverEnabled,
  isExtendedEnabled,
  getVoicelinesDir,
  testWav,
  stop,
  queuePlay
}
