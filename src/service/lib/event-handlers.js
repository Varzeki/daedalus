const os = require('os')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { UNKNOWN_VALUE } = require('../../shared/consts')

const { BROADCAST_EVENT: broadcastEvent } = global

// Preferences handling
const PREFERENCES_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal')
const PREFERENCES_FILE = path.join(PREFERENCES_DIR, 'Preferences.json')
let _preferencesCache = null

const System = require('./event-handlers/system')
const ShipStatus = require('./event-handlers/ship-status')
const Materials = require('./event-handlers/materials')
const Blueprints = require('./event-handlers/blueprints')
const Engineers = require('./event-handlers/engineers')
const Inventory = require('./event-handlers/inventory')
const CmdrStatus = require('./event-handlers/cmdr-status')
const NavRoute = require('./event-handlers/nav-route')
const Exploration = require('./event-handlers/exploration')
const TextToSpeech = require('./event-handlers/text-to-speech')
const Powerplay = require('./event-handlers/powerplay')
const Keybinds = require('./event-handlers/keybinds')
const covasPlayer = require('./covas-player')

class EventHandlers {
  constructor ({ eliteLog, eliteJson }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
    this._handlerInstances = []

    this.system = this._register(new System({ eliteLog }))
    this.shipStatus = this._register(new ShipStatus({ eliteLog, eliteJson }))
    this.materials = this._register(new Materials({ eliteLog, eliteJson }))
    this.engineers = this._register(new Engineers({ eliteLog, eliteJson }))
    this.inventory = this._register(new Inventory({ eliteLog, eliteJson }))
    this.cmdrStatus = this._register(new CmdrStatus({ eliteLog, eliteJson }))

    // These handlers depend on calls to other handlers
    this.blueprints = this._register(new Blueprints({ engineers: this.engineers, materials: this.materials, shipStatus: this.shipStatus }))
    this.navRoute = this._register(new NavRoute({ eliteLog, eliteJson, system: this.system }))
    this.exploration = this._register(new Exploration({ eliteLog, eliteJson, system: this.system, shipStatus: this.shipStatus }))
    this.powerplay = this._register(new Powerplay({ eliteLog }))
    this.keybinds = this._register(new Keybinds())
    this.textToSpeech = new TextToSpeech({ eliteLog, eliteJson, cmdrStatus: this.cmdrStatus, shipStatus: this.shipStatus })
  }

  _register (instance) {
    this._handlerInstances.push(instance)
    return instance
  }

  // logEventHandler is fired on every in-game log event
  logEventHandler (logEvent) {
    this.textToSpeech.logEventHandler(logEvent)
  }

  gameStateChangeHandler (event) {
    this.textToSpeech.gameStateChangeHandler(event)
  }

  // Return handlers for events that are fired from the client
  getEventHandlers () {
    if (!this.eventHandlers) {
      this.eventHandlers = {
        getCmdr: async () => {
          const [LoadGame] = await this.eliteLog.getEvent('LoadGame')
          return {
            commander: LoadGame?.Commander ?? UNKNOWN_VALUE,
            credits: LoadGame?.Credits ?? UNKNOWN_VALUE
          }
        },
        getLogEntries: async ({ count = 100, timestamp }) => {
          if (timestamp) {
            return await this.eliteLog.getFromTimestamp(timestamp)
          } else {
            return await this.eliteLog.getNewest(count)
          }
        },
        getPreferences: async () => {
          if (_preferencesCache) return _preferencesCache
          try {
            const data = await fs.readFile(PREFERENCES_FILE, 'utf8')
            _preferencesCache = JSON.parse(data)
          } catch (e) {
            _preferencesCache = {}
          }
          return _preferencesCache
        },
        setPreferences: async (preferences) => {
          await fs.mkdir(PREFERENCES_DIR, { recursive: true })
          await fs.writeFile(PREFERENCES_FILE, JSON.stringify(preferences))
          _preferencesCache = preferences
          this.textToSpeech.invalidatePreferencesCache()
          broadcastEvent('syncMessage', { name: 'preferences' })
          return preferences
        },
        detectVoicepackDir: () => detectVoicepackDir(),
        validateVoicepackDir: ({ dir }) => validateVoicepackDir(dir),
        testAudio: async () => covasPlayer.testWav('confirmed.wav'),
        testMessage: ({name, message}) => {
          // Method to simulate messages, intended for developers
          if (name !== 'testMessage') broadcastEvent(name, message)
        },
        toggleSwitch: async () => {
          // TODO Refactor this into a dedicated library with keybind support
          return false
        }
      }

      // Auto-register handlers from handler instances
      for (const instance of this._handlerInstances) {
        if (instance.getHandlers) {
          Object.assign(this.eventHandlers, instance.getHandlers())
        }
      }
    }
    return this.eventHandlers
  }
}

// --- Voicepack detection & validation ---

const STEAM_DEFAULT_DIR = path.join('C:', 'Program Files (x86)', 'Steam')
const STEAM_VDF = path.join(STEAM_DEFAULT_DIR, 'steamapps', 'libraryfolders.vdf')

function getSteamLibraryPaths () {
  const paths = []
  try {
    if (!fsSync.existsSync(STEAM_VDF)) return paths
    const content = fsSync.readFileSync(STEAM_VDF, 'utf8')
    // Parse "path" values from VDF (Valve's simple key-value format)
    const regex = /"path"\s+"([^"]+)"/g
    let match
    while ((match = regex.exec(content)) !== null) {
      paths.push(match[1].replace(/\\\\/g, '\\'))
    }
  } catch (e) {
    console.error('Failed to read Steam library paths:', e.message)
  }
  return paths
}

function findVoiceAttackSoundsDir (libraryPaths) {
  for (const libPath of libraryPaths) {
    for (const vaDir of ['VoiceAttack 2', 'VoiceAttack']) {
      const soundsDir = path.join(libPath, 'steamapps', 'common', vaDir, 'Sounds')
      if (fsSync.existsSync(soundsDir)) return soundsDir
    }
  }
  return null
}

function findHcsPacks (soundsDir) {
  if (!soundsDir || !fsSync.existsSync(soundsDir)) return []
  try {
    return fsSync.readdirSync(soundsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.toLowerCase().startsWith('hcspack-'))
      .map(d => d.name)
  } catch (e) {
    return []
  }
}

function isValidVoicepackDir (dir) {
  if (!dir || !fsSync.existsSync(dir)) return false
  try {
    const entries = fsSync.readdirSync(dir, { withFileTypes: true })
    const subdirs = entries.filter(e => e.isDirectory())
    if (subdirs.length === 0) return false
    // Check that at least one subdirectory contains MP3 files
    for (const sub of subdirs) {
      const subPath = path.join(dir, sub.name)
      const files = fsSync.readdirSync(subPath)
      if (files.some(f => f.toLowerCase().endsWith('.mp3'))) return true
    }
    return false
  } catch (e) {
    return false
  }
}

function detectVoicepackDir () {
  const libraryPaths = getSteamLibraryPaths()
  const soundsDir = findVoiceAttackSoundsDir(libraryPaths)
  if (!soundsDir) return { detected: false, dir: null, packs: [] }
  const packs = findHcsPacks(soundsDir)
  if (packs.length === 0) return { detected: false, dir: null, packs: [] }
  // Return the first pack found as the default
  const defaultPack = path.join(soundsDir, packs[0])
  return { detected: true, dir: defaultPack, packs: packs.map(p => path.join(soundsDir, p)) }
}

function validateVoicepackDir (dir) {
  if (!dir) return { valid: false, name: null }
  const valid = isValidVoicepackDir(dir)
  const name = valid ? path.basename(dir).replace(/^hcspack-/i, '') : null
  return { valid, name }
}

module.exports = EventHandlers
