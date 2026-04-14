'use strict'

const os = require('os')
const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

const BINDINGS_DIR = path.join(
  os.homedir(),
  'AppData', 'Local',
  'Frontier Developments', 'Elite Dangerous', 'Options', 'Bindings'
)
const BUTTON_MAPS_DIR = path.join(BINDINGS_DIR, 'DeviceButtonMaps')
const ACTIVE_PRESET_FILE = 'StartPreset.start'

// ---------------------------------------------------------------------------
// Key display name formatting
// ---------------------------------------------------------------------------

const KEY_NAME_MAP = {
  // Whitespace / special
  Space: 'Space',
  BackSpace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  Return: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  // Arrows
  UpArrow: '↑',
  DownArrow: '↓',
  LeftArrow: '←',
  RightArrow: '→',
  // Modifiers
  LeftShift: 'L.Shift',
  RightShift: 'R.Shift',
  LeftControl: 'L.Ctrl',
  RightControl: 'R.Ctrl',
  LeftAlt: 'L.Alt',
  RightAlt: 'R.Alt',
  LeftSuper: 'L.Win',
  RightSuper: 'R.Win',
  // Punctuation
  OemComma: ',',
  OemPeriod: '.',
  OemMinus: '-',
  Equals: '=',
  OemPlus: '+',
  LeftBracket: '[',
  RightBracket: ']',
  Backslash: '\\',
  Apostrophe: "'",
  SemiColon: ';',
  Slash: '/',
  BackQuote: '`',
  // Numpad
  Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3',
  Numpad4: 'Num4', Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7',
  Numpad8: 'Num8', Numpad9: 'Num9',
  NumpadAdd: 'Num+',
  NumpadSubtract: 'Num-',
  NumpadMultiply: 'Num*',
  NumpadDivide: 'Num/',
  NumpadDecimal: 'Num.',
  NumpadEnter: 'Num Enter',
  // Function keys
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4',
  F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8',
  F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  // Print / scroll / pause
  PrintScreen: 'PrtSc',
  ScrollLock: 'ScrLk',
  Pause: 'Pause',
  CapsLock: 'Caps',
  // Numlock
  NumLock: 'NumLk'
}

function formatKey (rawKey) {
  if (!rawKey) return null

  if (rawKey.startsWith('Key_')) {
    const rest = rawKey.slice(4)
    return KEY_NAME_MAP[rest] || rest
  }

  // Joy_1 / Joy_Button1 → Joy B1
  const joyBtn = rawKey.match(/^Joy_(?:Button)?(\d+)$/)
  if (joyBtn) return `Joy B${joyBtn[1]}`

  // Joy_XAxis → Joy X
  const joyAxis = rawKey.match(/^Joy_(\w+?)Axis(?:Raw)?$/)
  if (joyAxis) return `Joy ${joyAxis[1]}`

  // Joy_Hat1_Up → Hat1 ↑
  const joyHat = rawKey.match(/^Joy_Hat(\d+)_(Up|Down|Left|Right)$/)
  if (joyHat) {
    const dirMap = { Up: '↑', Down: '↓', Left: '←', Right: '→' }
    return `Hat${joyHat[1]} ${dirMap[joyHat[2]] || joyHat[2]}`
  }

  // Mouse_Button0/1/2 → common names
  const mouseBtn = rawKey.match(/^Mouse_Button(\d+)$/)
  if (mouseBtn) {
    const n = parseInt(mouseBtn[1])
    if (n === 0) return 'M. Left'
    if (n === 1) return 'M. Right'
    if (n === 2) return 'M. Mid'
    return `M. B${n}`
  }

  if (rawKey === 'Mouse_ScrollUp') return 'Scroll ↑'
  if (rawKey === 'Mouse_ScrollDown') return 'Scroll ↓'

  // Strip known prefixes and return remainder
  return rawKey.replace(/^(Joy_|Mouse_|Key_)/, '')
}

// ---------------------------------------------------------------------------
// .buttonMap file support
// ---------------------------------------------------------------------------

function cleanButtonMapName (raw) {
  return raw
    .replace(/\[ps4PadL\]/gi, '←')
    .replace(/\[ps4PadR\]/gi, '→')
    .replace(/\[ps4PadU\]/gi, '↑')
    .replace(/\[ps4PadD\]/gi, '↓')
    .replace(/\[[^\]]+\]/g, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
}

function parseButtonMapFile (xmlContent) {
  const result = {}
  // Match <Joy_Xyz>Display Name</Joy_Xyz> or <Key_Xyz>Name</Key_Xyz>
  const re = /<(\w+)>([^<]+)<\/\1>/g
  let m
  while ((m = re.exec(xmlContent)) !== null) {
    result[m[1]] = cleanButtonMapName(m[2].trim())
  }
  return result
}

async function loadButtonMaps (deviceNames) {
  const maps = {}
  for (const device of deviceNames) {
    const filePath = path.join(BUTTON_MAPS_DIR, `${device}.buttonMap`)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      maps[device] = parseButtonMapFile(content)
    } catch (_) { /* no map for this device */ }
  }
  return maps
}

function applyButtonMaps (bindings, buttonMaps) {
  for (const data of Object.values(bindings)) {
    for (const field of ['primary', 'secondary', 'binding', 'modifier']) {
      const b = data[field]
      if (!b) continue
      const deviceMap = buttonMaps[b.device]
      if (deviceMap && deviceMap[b.key]) {
        b.display = deviceMap[b.key]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lightweight .binds XML parser
// ---------------------------------------------------------------------------

function extractAttrs (line) {
  const result = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(line)) !== null) {
    result[m[1]] = m[2]
  }
  return result
}

function normalizeBinding (device, key) {
  if (!device || device === '{NoDevice}' || !key || key === '') return null
  return { device, key, display: formatKey(key) }
}

function parseControlBlock (lines) {
  let primary = null
  let secondary = null
  let binding = null
  let modifier = null

  for (const line of lines) {
    const tagMatch = line.match(/^<(\w+)/)
    if (!tagMatch) continue
    const tag = tagMatch[1]
    const attrs = extractAttrs(line)
    const norm = normalizeBinding(attrs.Device, attrs.Key)

    if (tag === 'Primary' && primary === null) primary = norm
    else if (tag === 'Secondary' && secondary === null) secondary = norm
    else if (tag === 'Binding') binding = norm
    else if (tag === 'Modifier') modifier = norm
  }

  return { primary, secondary, binding, modifier }
}

function parseBindsFile (xmlContent) {
  const presetMatch = xmlContent.match(/PresetName="([^"]*)"/)
  const presetName = presetMatch ? presetMatch[1] : 'Unknown'

  const bindings = {}
  const lines = xmlContent.split('\n')
  let currentKey = null
  let blockLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('<?') || trimmed.startsWith('<Root') || trimmed === '</Root>') continue

    if (currentKey === null) {
      // Skip self-closing elements (<MouseXMode Value="" />) and single-line elements
      // (<KeyboardLayout>en-GB</KeyboardLayout>) — these are metadata at root level
      if (trimmed.endsWith('/>') || trimmed.includes('</')) continue
      // Look for opening tag of a multi-line control block
      const openMatch = trimmed.match(/^<([A-Za-z]\w*)(?:\s[^>]*)?>$/)
      if (openMatch) {
        currentKey = openMatch[1]
        blockLines = []
      }
      continue
    }

    // Closing tag
    const closeMatch = trimmed.match(/^<\/([A-Za-z]\w*)>$/)
    if (closeMatch && closeMatch[1] === currentKey) {
      bindings[currentKey] = parseControlBlock(blockLines)
      currentKey = null
      blockLines = []
      continue
    }

    // Self-closing child element
    if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
      blockLines.push(trimmed)
    }
  }

  return { presetName, bindings }
}

// ---------------------------------------------------------------------------
// Game installation discovery (default presets)
// ---------------------------------------------------------------------------

// Hardware-specific presets that only appear when that device is connected.
// Excluding these leaves the ~11 generic presets the game always shows.
const HARDWARE_PRESET_RE = /^(Saitek|ThrustMaster|TFlight|T16000M|Logitech|BlackWidow|PS3Controller|AdvancedPS3|DualShock|Oculus)/

let _controlSchemesDir // undefined = not searched, null = not found, string = path

async function findControlSchemesDir () {
  if (_controlSchemesDir !== undefined) return _controlSchemesDir

  const candidates = []

  // Steam: read install path from the Windows registry
  try {
    const raw = execSync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      { encoding: 'utf8', timeout: 3000 }
    )
    const m = raw.match(/InstallPath\s+REG_SZ\s+(.+)/)
    if (m) {
      const steamRoot = m[1].trim()
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
      try {
        const vdf = await fs.readFile(vdfPath, 'utf8')
        // Modern Steam (2021+): "path"  "C:\\…"
        for (const pm of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
          candidates.push(path.join(pm[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Elite Dangerous'))
        }
        // Older format: "1"  "D:\\SteamLibrary"
        if (candidates.length === 0) {
          for (const pm of vdf.matchAll(/"\d+"\s+"([A-Z]:[^"]+)"/g)) {
            candidates.push(path.join(pm[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Elite Dangerous'))
          }
        }
      } catch (_) {}
      candidates.push(path.join(steamRoot, 'steamapps', 'common', 'Elite Dangerous'))
    }
  } catch (_) { /* Steam not installed or registry inaccessible */ }

  // Common fallback paths
  candidates.push(
    path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Elite Dangerous'),
    path.join('C:', 'Program Files', 'Steam', 'steamapps', 'common', 'Elite Dangerous'),
    path.join('D:', 'Steam', 'steamapps', 'common', 'Elite Dangerous'),
    path.join('D:', 'SteamLibrary', 'steamapps', 'common', 'Elite Dangerous'),
    path.join('C:', 'Program Files', 'Epic Games', 'EliteDangerous')
  )

  // Scan Products/*/ControlSchemes/ for .binds files
  const seen = new Set()
  for (const base of candidates) {
    if (seen.has(base)) continue
    seen.add(base)
    try {
      const productsDir = path.join(base, 'Products')
      const products = (await fs.readdir(productsDir)).sort().reverse() // prefer odyssey-64 over base 64
      for (const product of products) {
        const csDir = path.join(productsDir, product, 'ControlSchemes')
        try {
          const entries = await fs.readdir(csDir)
          if (entries.some(e => e.endsWith('.binds'))) {
            _controlSchemesDir = csDir
            return csDir
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  _controlSchemesDir = null
  return null
}

// ---------------------------------------------------------------------------
// File listing
// ---------------------------------------------------------------------------

async function getBindingFiles () {
  let activePreset = null
  try {
    const startFile = path.join(BINDINGS_DIR, ACTIVE_PRESET_FILE)
    // StartPreset.start may contain just the base name (e.g. "Custom") while
    // the actual .binds files are versioned (e.g. "Custom.4.2.binds").
    // Take only the first non-empty line in case the file has multiple.
    activePreset = (await fs.readFile(startFile, 'utf8')).trim().split('\n')[0].trim()
  } catch (_) { /* no start preset file */ }

  // Scan user bindings directory
  let allFiles = []
  try {
    const entries = await fs.readdir(BINDINGS_DIR, { withFileTypes: true })
    allFiles = await Promise.all(
      entries
        .filter(e => e.isFile() && e.name.endsWith('.binds'))
        .map(async e => {
          const filePath = path.join(BINDINGS_DIR, e.name)
          let mtimeMs = 0
          try { mtimeMs = (await fs.stat(filePath)).mtimeMs } catch (_) {}
          return { name: e.name.replace(/\.binds$/, ''), filename: e.name, mtimeMs }
        })
    )
  } catch (_) { /* bindings dir not found */ }

  // Scan game's default ControlSchemes directory
  const csDir = await findControlSchemesDir()
  if (csDir) {
    try {
      const entries = await fs.readdir(csDir, { withFileTypes: true })
      const userNames = new Set(allFiles.map(f => f.name))
      const defaults = entries
        .filter(e => e.isFile() && e.name.endsWith('.binds'))
        .map(e => ({ name: e.name.replace(/\.binds$/, ''), filename: e.name, mtimeMs: 0, isDefault: true }))
        .filter(f => !userNames.has(f.name) && !HARDWARE_PRESET_RE.test(f.name))
      allFiles.push(...defaults)
    } catch (_) {}
  }

  allFiles.sort((a, b) => a.name.localeCompare(b.name))

  // Determine active file: exact match wins; for prefix matches (e.g. "Custom"
  // matching "Custom.4.2", "Custom.3.0") pick the most recently modified — that
  // is the file the game most recently wrote to (i.e. the one truly in use).
  let activeFile = null
  if (activePreset) {
    const candidates = allFiles.filter(f =>
      f.name === activePreset || f.name.startsWith(activePreset + '.')
    )
    if (candidates.length === 1) {
      activeFile = candidates[0].name
    } else if (candidates.length > 1) {
      // Most recently modified = the one the game last saved
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
      activeFile = candidates[0].name
    }
  }

  const files = allFiles.map(f => ({
    name: f.name,
    filename: f.filename,
    active: f.name === activeFile,
    ...(f.isDefault ? { isDefault: true } : {})
  }))

  return { activePreset, files }
}

// ---------------------------------------------------------------------------
// Handler class
// ---------------------------------------------------------------------------

class Keybinds {
  async getKeybindFiles () {
    return getBindingFiles()
  }

  async getKeybinds ({ preset }) {
    let content
    try {
      content = await fs.readFile(path.join(BINDINGS_DIR, `${preset}.binds`), 'utf8')
    } catch (_) {
      // Fall back to game's default ControlSchemes directory
      const csDir = await findControlSchemesDir()
      if (!csDir) throw new Error(`Binding file not found: ${preset}`)
      content = await fs.readFile(path.join(csDir, `${preset}.binds`), 'utf8')
    }
    const { presetName, bindings } = parseBindsFile(content)

    // Collect unique device names then load any .buttonMap files for them
    const deviceNames = new Set()
    for (const data of Object.values(bindings)) {
      for (const field of ['primary', 'secondary', 'binding', 'modifier']) {
        if (data[field]?.device) deviceNames.add(data[field].device)
      }
    }
    const buttonMaps = await loadButtonMaps([...deviceNames])
    applyButtonMaps(bindings, buttonMaps)

    return { presetName, bindings }
  }

  getHandlers () {
    return {
      getKeybindFiles: () => this.getKeybindFiles(),
      getKeybinds: ({ preset }) => this.getKeybinds({ preset })
    }
  }
}

module.exports = Keybinds
