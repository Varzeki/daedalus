import { useEffect, useMemo, useRef, useState } from 'react'
import CONTROLS_METADATA from 'lib/controls-data'
import LABEL_POSITIONS from 'lib/device-label-positions.json'

// ──── keyboard layout ────────────────────────────────────────────────────────
// Each entry: { id, label, w } | null (gap spacer)
// id is appended to 'Key_' to form the binding lookup key

const FROW = [
  { id: 'Escape', label: 'Esc' }, null,
  { id: 'F1', label: 'F1' }, { id: 'F2', label: 'F2' }, { id: 'F3', label: 'F3' }, { id: 'F4', label: 'F4' }, null,
  { id: 'F5', label: 'F5' }, { id: 'F6', label: 'F6' }, { id: 'F7', label: 'F7' }, { id: 'F8', label: 'F8' }, null,
  { id: 'F9', label: 'F9' }, { id: 'F10', label: 'F10' }, { id: 'F11', label: 'F11' }, { id: 'F12', label: 'F12' }
]

const MAIN_ROWS = [
  [
    { id: 'BackQuote', label: '`' }, { id: '1', label: '1' }, { id: '2', label: '2' },
    { id: '3', label: '3' }, { id: '4', label: '4' }, { id: '5', label: '5' },
    { id: '6', label: '6' }, { id: '7', label: '7' }, { id: '8', label: '8' },
    { id: '9', label: '9' }, { id: '0', label: '0' },
    { id: 'OemMinus', label: '-' }, { id: 'Equals', label: '=' },
    { id: 'BackSpace', label: '⌫', w: 2 }
  ], [
    { id: 'Tab', label: 'Tab', w: 1.5 },
    { id: 'Q', label: 'Q' }, { id: 'W', label: 'W' }, { id: 'E', label: 'E' }, { id: 'R', label: 'R' },
    { id: 'T', label: 'T' }, { id: 'Y', label: 'Y' }, { id: 'U', label: 'U' }, { id: 'I', label: 'I' },
    { id: 'O', label: 'O' }, { id: 'P', label: 'P' },
    { id: 'LeftBracket', label: '[' }, { id: 'RightBracket', label: ']' },
    { id: 'Backslash', label: '\\', w: 1.5 }
  ], [
    { id: 'CapsLock', label: 'Caps', w: 1.75 },
    { id: 'A', label: 'A' }, { id: 'S', label: 'S' }, { id: 'D', label: 'D' }, { id: 'F', label: 'F' },
    { id: 'G', label: 'G' }, { id: 'H', label: 'H' }, { id: 'J', label: 'J' }, { id: 'K', label: 'K' },
    { id: 'L', label: 'L' },
    { id: 'SemiColon', label: ';' }, { id: 'Apostrophe', label: "'" },
    { id: 'Return', label: 'Enter', w: 2.25 }
  ], [
    { id: 'LeftShift', label: '⇧', w: 2.25 },
    { id: 'Z', label: 'Z' }, { id: 'X', label: 'X' }, { id: 'C', label: 'C' }, { id: 'V', label: 'V' },
    { id: 'B', label: 'B' }, { id: 'N', label: 'N' }, { id: 'M', label: 'M' },
    { id: 'OemComma', label: ',' }, { id: 'OemPeriod', label: '.' }, { id: 'Slash', label: '/' },
    { id: 'RightShift', label: '⇧', w: 2.75 }
  ], [
    { id: 'LeftControl', label: 'Ctrl', w: 1.5 },
    { id: 'LeftAlt', label: 'Alt', w: 1.25 },
    { id: 'Space', label: '', w: 6.25 },
    { id: 'RightAlt', label: 'Alt', w: 1.25 },
    { id: 'RightControl', label: 'Ctrl', w: 1.5 }
  ]
]

const NAV_ROWS = [
  [{ id: 'Insert', label: 'Ins' }, { id: 'Home', label: 'Home' }, { id: 'PageUp', label: 'PgUp' }],
  [{ id: 'Delete', label: 'Del' }, { id: 'End', label: 'End' }, { id: 'PageDown', label: 'PgDn' }],
  [null, null, null],
  [null, { id: 'UpArrow', label: '↑' }, null],
  [{ id: 'LeftArrow', label: '←' }, { id: 'DownArrow', label: '↓' }, { id: 'RightArrow', label: '→' }]
]

// ──── device → SVG map ────────────────────────────────────────────────────────
// Maps device identifiers (from .binds files, including USB VID/PID aliases)
// to the SVG filename under /device-svgs/. Devices that share hardware share SVG.
const DEVICE_SVG_MAP = {
  // Thrustmaster
  ThrustMasterWarthogJoystick: 'ThrustMaster Warthog Stick and Throttle.svg',
  ThrustMasterWarthogThrottle: 'ThrustMaster Warthog Stick and Throttle.svg',
  ThrustMasterWarthogCombined: 'ThrustMaster Warthog Stick and Throttle.svg',
  T16000M: 'ThrustMaster T-16000M Stick.svg',
  T16000MFCS: 'Thrustmaster T-16000MFCS Stick and Throttle.svg',
  T16000MTHROTTLE: 'Thrustmaster T-16000MFCS Stick and Throttle.svg',
  ThrustMasterTFlightHOTASX: 'ThrustMaster T-Flight HOTAS X Stick and Throttle.svg',
  ThrustMasterHOTAS4: 'ThrustMaster T-Flight HOTAS 4 Stick and Throttle.svg',
  TFlightHotasOne: 'ThrustMaster T-Flight HOTAS 4 Stick and Throttle.svg',
  '044F0400': 'ThrustMaster_Cougar.svg',
  '044F0405': 'ThrustMaster TCA Sidestick Left.svg',
  '044F0406': 'ThrustMaster TCA Sidestick Right.svg',
  '044FB106': 'Thrustmaster T-Flight X Stick.svg',
  // Saitek / Logitech
  SaitekX45: 'Saitek X45.svg',
  SaitekX52: 'Saitek X52 Stick and Throttle.svg',
  SaitekX52Pro: 'Saitek X52 Pro Stick and Throttle.svg',
  SaitekX55Joystick: 'Saitek X55 Stick and Throttle.svg',
  SaitekX55Throttle: 'Saitek X55 Stick and Throttle.svg',
  SaitekX56Joystick: 'Saitek X56 Stick and Throttle.svg',
  SaitekX56Throttle: 'Saitek X56 Stick and Throttle.svg',
  '07382221': 'Saitek X56 Stick and Throttle.svg',  // USB alias for X56 joystick
  '0738A221': 'Saitek X56 Stick and Throttle.svg',  // USB alias for X56 throttle
  SaitekFLY5: 'Saitek Cyborg FLY 5.svg',
  '06A30836': 'Saitek Cyborg FLY 5.svg',
  LogitechExtreme3DPro: 'Logitech Extreme 3D Pro.svg',
  LogitechG940Joystick: 'Logitech G940 Stick and Throttle.svg',
  LogitechG940Throttle: 'Logitech G940 Stick and Throttle.svg',
  LF710: 'Logitech F710.svg',
  Logitech710WirelessGamepad: 'Logitech F710.svg',
  // Sony / Microsoft gamepads
  DS4: 'Sony DualShock 4 Controller.svg',
  DualShock4: 'Sony DualShock 4 Controller.svg',
  '054C05C4': 'Sony DualShock 4 Controller.svg',
  '054C09CC': 'Sony DualShock 4 Controller.svg',
  '045E02FF': 'Microsoft XBox One Controller.svg',
  '045E028E': 'Microsoft XBox One Controller.svg',
  '045E02DD': 'Microsoft XBox One Controller.svg',
  '045E02E3': 'Microsoft XBox One Elite Controller.svg',
  '045E0B22': 'Microsoft XBox One Elite Controller.svg',
  // Generic gamepad device names used by ED (XInput / generic controller mode)
  GamePad: 'Microsoft XBox One Controller.svg',
  '28DE11FF': 'Microsoft XBox One Controller.svg',  // Valve/Steam controller used by HCS presets
  // VKB
  '231D0121': 'VKB Gladiator.svg',
  VKBGladiatorNXT: 'VKB Gladiator.svg',
  // VKB Kosmosima SGC and STECS SVGs removed (broken/JPEG-only files)
  // VPC
  VPCWarBRDRight: 'VPC WarBRD DELTA Right.svg',
  '03EB2044': 'VPC WarBRD DELTA Right.svg',
  VPCWarBRDLeft: 'VPC WarBRD DELTA Left.svg',
  '03EB2042': 'VPC WarBRD DELTA Left.svg',
  // Pedals
  SlawFlightControlRudder: 'Slaw BF-109 Pedals.svg',
  '16D00A38': 'MFG Crosswind Pedals.svg',
  '85640203': 'MFG Crosswind Pedals.svg',
  'T-Rudder': 'Thrustmaster TFRP Pedals.svg',
  // Mouse
  Mouse: 'mouse.svg'
}

// Some devices have label positions stored under a different/canonical device key
// (same physical hardware, different reporting name or shared key naming convention)
const DEVICE_LABEL_ALIAS = {
  '28DE11FF': 'GamePad',  // Steam/HCS preset uses GamePad_* key names, same positions
  '045E028E': '045E02FF',  // Xbox One S — same key layout as 045E02FF
  '045E02DD': '045E02FF',  // Xbox One original — shares positions
}

// SVG viewBox dimensions (after header removal + crop).
// h = cropped viewBox height; cropY = viewBox y-origin (SVG units clipped from top).
const SVG_DIMS = {
  'Saitek X45.svg': { w: 5120, h: 2880 },
  'CH Combatstick and Throttle.svg': { w: 3840, h: 1972, cropY: 188 },
  'CH Fighterstick and Throttle.svg': { w: 3840, h: 1972, cropY: 188 },
  'CH Pro Flight Throttle Quadrant.svg': { w: 3840, h: 1860, cropY: 300 },
  'CH Pro Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'CH Throttle Quadrant.svg': { w: 3840, h: 1860, cropY: 300 },
  'Defender Cobra M5.svg': { w: 3840, h: 1860, cropY: 300 },
  'Logitech Driving Force GT Wheel.svg': { w: 3840, h: 1880, cropY: 280 },
  'Logitech Extreme 3D Pro.svg': { w: 3840, h: 1810, cropY: 350 },
  'Logitech F710.svg': { w: 3840, h: 1778, cropY: 382 },
  'Logitech G940 Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'Logitech G940 Stick and Throttle.svg': { w: 3840, h: 1950, cropY: 210 },
  'MFG Crosswind Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'Microsoft XBox One Controller.svg': { w: 3840, h: 1664, cropY: 496 },
  'Microsoft XBox One Elite Controller.svg': { w: 3840, h: 1664, cropY: 496 },
  'Razer Sabretooth.svg': { w: 3840, h: 1664, cropY: 496 },
  'Saitek Cyborg FLY 5.svg': { w: 3840, h: 1880, cropY: 280 },
  'Saitek Pro Flight Combat Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'Saitek Pro Flight Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'Saitek Side Panel Control Deck.svg': { w: 3840, h: 1779, cropY: 381 },
  'Saitek X52 Pro Stick and Throttle.svg': { w: 3840, h: 1970, cropY: 190 },
  'Saitek X52 Stick and Throttle.svg': { w: 3840, h: 1976, cropY: 184 },
  'Saitek X55 Stick and Throttle.svg': { w: 3840, h: 1960, cropY: 200 },
  'Saitek X56 Stick and Throttle.svg': { w: 3840, h: 1976, cropY: 184 },
  'Slaw BF-109 Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'Sony DualShock 4 Controller.svg': { w: 3840, h: 1853, cropY: 307 },
  'ThrustMaster Cougar MFDs.svg': { w: 3840, h: 1861, cropY: 299 },
  'ThrustMaster T-16000M Stick.svg': { w: 3840, h: 1970, cropY: 190 },
  'ThrustMaster T-Flight HOTAS 4 Stick and Throttle.svg': { w: 3840, h: 1920, cropY: 240 },
  'ThrustMaster T-Flight HOTAS X Stick and Throttle.svg': { w: 3840, h: 1920, cropY: 240 },
  'ThrustMaster TCA Sidestick Left.svg': { w: 3840, h: 1970, cropY: 190 },
  'ThrustMaster TCA Sidestick Right.svg': { w: 3840, h: 1970, cropY: 190 },
  'ThrustMaster Warthog Stick and Throttle.svg': { w: 3840, h: 1975, cropY: 185 },
  'ThrustMaster_Cougar.svg': { w: 3840, h: 1966, cropY: 194 },
  'Thrustmaster T-16000MFCS Stick and Throttle.svg': { w: 3840, h: 1970, cropY: 190 },
  'Thrustmaster T-Flight X Stick.svg': { w: 3840, h: 1880, cropY: 280 },
  'Thrustmaster TFRP Pedals.svg': { w: 3840, h: 1853, cropY: 307 },
  'VKB Gladiator.svg': { w: 3840, h: 1898, cropY: 262 },
  'VPC WarBRD DELTA Left.svg': { w: 3840, h: 1940, cropY: 220 },
  'VPC WarBRD DELTA Right.svg': { w: 3840, h: 1940, cropY: 220 },
  'mouse.svg': { w: 360, h: 115 },
}
const SVG_DEF = { w: 3840, h: 2160 }

// Devices rendered alongside keyboard (not in joystick section)
const KEYBOARD_ADJACENT = new Set(['Mouse', 'Mouse_'])

// ──── keyboard sub-components ─────────────────────────────────────────────────

function KbdKey ({ id, label, w = 1, fns = [], query = '' }) {
  const bound = fns.length > 0
  const q = query.trim().toLowerCase()
  const dim = bound && q && !fns.some(f => f.searchName.toLowerCase().includes(q))
  return (
    <div
      className={`kbd-key${bound ? ' kbd-key--bound' : ''}${dim ? ' kbd-key--dim' : ''}`}
      style={{ '--key-w': w }}
      title={bound ? fns.map(f => f.name).join(' / ') : undefined}
    >
      <span className='kbd-key__cap'>{label || '\u00A0'}</span>
      {bound && (
        <div className='kbd-key__fns'>
          {fns.map((f, i) => (
            <span key={i} className='kbd-key__fn-name'>{f.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function KbdRow ({ entries, keyIndex, gapW = 0.75, query = '' }) {
  return (
    <div className='kbd-row'>
      {entries.map((entry, i) => {
        if (entry === null) {
          return <div key={i} className='kbd-key kbd-key--gap' style={{ '--key-w': gapW }} />
        }
        const fns = keyIndex['Key_' + entry.id] || []
        return <KbdKey key={entry.id} id={entry.id} label={entry.label} w={entry.w ?? 1} fns={fns} query={query} />
      })}
    </div>
  )
}

// ──── device section: SVG + overlay labels ────────────────────────────────────

// Module-level cache: SVG text content keyed by filename, populated on first fetch
const SVG_CONTENT_CACHE = new Map()

function DeviceSvgSection ({ svgFile, devices, query = '', className = '' }) {
  const { w: svgW, h: svgH, cropY: svgCropY = 0 } = SVG_DIMS[svgFile] ?? SVG_DEF
  const ar = (svgH / svgW) * 100
  const q = query.trim().toLowerCase()

  // Fetch SVG content for inline rendering; cache to avoid redundant network requests
  const [svgContent, setSvgContent] = useState(() => SVG_CONTENT_CACHE.get(svgFile) ?? null)
  const svgRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (SVG_CONTENT_CACHE.has(svgFile)) {
      setSvgContent(SVG_CONTENT_CACHE.get(svgFile))
    } else {
      fetch(`/device-svgs/${encodeURIComponent(svgFile)}`)
        .then(r => r.text())
        .then(text => {
          if (cancelled) return
          SVG_CONTENT_CACHE.set(svgFile, text)
          setSvgContent(text)
        })
    }
    return () => { cancelled = true }
  }, [svgFile])

  // Collect overlay labels (buttons with known positions in LABEL_POSITIONS)
  // Use a Map to merge Neg_/Pos_ axis pairs that share the same position.
  // Also seeds dim placeholder labels for all unbound positions on the device.
  const labelsMap = new Map()
  const overflowBtns = []
  for (const { deviceName, dIdx } of devices) {
    let posKey = DEVICE_LABEL_ALIAS[deviceName] ?? deviceName
    // Gamepad fallback: if no positions found but keys look like GamePad_ buttons, use GamePad layout
    if (!LABEL_POSITIONS[posKey] && Object.keys(dIdx).some(k => k.startsWith('GamePad_') || k.startsWith('Pad_'))) {
      posKey = 'GamePad'
    }
    const positions = LABEL_POSITIONS[posKey]

    // First pass: add bound labels from the device binding index
    for (const [btnKey, fns] of Object.entries(dIdx)) {
      // Try raw key first (e.g. Pos_Mouse_ZAxis has its own distinct position entry).
      // Fall back to stripped key so Neg_Joy_RXAxis + Pos_Joy_RXAxis merge at Joy_RXAxis.
      const labelKey = btnKey.replace(/^(?:Neg_|Pos_)/, '').replace(/Raw$/, '')
      const rawPos = positions?.[btnKey]
      const pos = rawPos ?? positions?.[labelKey]
      // Device-qualified key matches data-label in the SVG (e.g. "SaitekX56Joystick:Joy_1")
      const svgKey = `${posKey}:${rawPos ? btnKey : labelKey}`
      const mapKey = `${deviceName}-${svgKey}`
      if (pos) {
        if (!labelsMap.has(mapKey)) labelsMap.set(mapKey, { id: mapKey, svgKey, pos, fns: [] })
        const entry = labelsMap.get(mapKey)
        for (const f of fns) {
          if (!entry.fns.some(e => e.name === f.name)) entry.fns.push(f)
        }
      } else {
        overflowBtns.push({ btnKey, fns })
      }
    }

    // Second pass: seed dim placeholders for every position that has no binding
    if (positions) {
      for (const [positionKey, pos] of Object.entries(positions)) {
        const svgKey = `${posKey}:${positionKey}`
        const mapKey = `${deviceName}-${svgKey}`
        if (!labelsMap.has(mapKey)) {
          labelsMap.set(mapKey, { id: mapKey, svgKey, pos, fns: [] })
        }
      }
    }
  }
  const labels = [...labelsMap.values()]
  const title = [...new Set(devices.map(d => d.deviceName))].join(' + ')

  // After every render, synchronise [data-dim] on annotated SVG elements.
  // Unbound positions are always dimmed. With a search, only matching bindings stay lit.
  useEffect(() => {
    const stageEl = svgRef.current
    if (!stageEl) return
    const svgEl = stageEl.querySelector('svg')
    if (!svgEl) return

    // A key is "lit" when ANY label with that svgKey has a binding that matches.
    const litKeys = new Set()
    for (const { svgKey, fns } of labels) {
      if (fns.length > 0 && (!q || fns.some(f => f.searchName.toLowerCase().includes(q)))) {
        litKeys.add(svgKey)
      }
    }

    svgEl.querySelectorAll('[data-label]').forEach(node => {
      if (litKeys.has(node.getAttribute('data-label'))) {
        node.removeAttribute('data-dim')
      } else {
        node.setAttribute('data-dim', 'true')
      }
    })
    // data-labels: a shared box — lit if ANY of its keys is lit.
    svgEl.querySelectorAll('[data-labels]').forEach(node => {
      const keys = node.getAttribute('data-labels').split(' ')
      if (keys.some(k => litKeys.has(k))) {
        node.removeAttribute('data-dim')
      } else {
        node.setAttribute('data-dim', 'true')
      }
    })
  })

  return (
    <div className={className ? `kbd-device ${className}` : 'kbd-device'}>
      <div className='kbd-device__name'>{title}</div>
      {/* Aspect-ratio stage with inline SVG and overlaid text labels */}
      <div
        ref={svgRef}
        className='kbd-device-svg-stage'
        style={{ paddingTop: `${ar}%` }}
      >
        {svgContent && (
          <div
            className='kbd-device-svg'
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
        {/* Button text overlays at LABEL_POSITIONS — SVG elements provide the box outline */}
        {labels.map(({ id, pos, fns }) => {
          // Dim if: nothing bound here, or search active and no function matches
          const dim = fns.length === 0 || (q && !fns.some(f => f.searchName.toLowerCase().includes(q)))
          return (
            <div
              key={id}
              className={`kbd-svg-label${dim ? ' kbd-svg-label--dim' : ''}`}
              style={{
                left: `${(pos.x / svgW) * 100}%`,
                top: `${((pos.y - svgCropY) / svgH) * 100}%`,
                width: `${(pos.w / svgW) * 100}%`,
                ...(pos.h != null ? { height: `${(pos.h / svgH) * 100}%` } : {})
              }}
            >
              {fns.map(f => f.name).join(', ')}
            </div>
          )
        })}
      </div>
      {/* Overflow: bindings without a known SVG position */}
      {overflowBtns.length > 0 && (
        <div className='kbd-device__grid kbd-device__grid--overflow'>
          {overflowBtns.map(({ btnKey, fns }) => (
            <div key={btnKey} className='kbd-device__btn'>
              <div className='kbd-device__btn-key'>{fns[0]?.display ?? btnKey}</div>
              <div className='kbd-device__btn-fns'>
                {fns.map((f, i) => <span key={i}>{f.name}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Fallback: card grid for devices with no SVG mapping
function DeviceSection ({ deviceName, deviceIndex }) {
  const buttons = Object.entries(deviceIndex)
  if (buttons.length === 0) return null
  return (
    <div className='kbd-device'>
      <div className='kbd-device__name'>{deviceName}</div>
      <div className='kbd-device__grid'>
        {buttons.map(([rawKey, fns]) => (
          <div key={rawKey} className='kbd-device__btn'>
            <div className='kbd-device__btn-key'>{fns[0]?.display ?? rawKey}</div>
            <div className='kbd-device__btn-fns'>
              {fns.map((f, i) => <span key={i}>{f.name}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MouseSection ({ mouseIndex }) {
  const buttons = Object.entries(mouseIndex)
  if (buttons.length === 0) return null
  return (
    <div className='kbd-device kbd-device--mouse'>
      <div className='kbd-device__name'>Mouse</div>
      <div className='kbd-device__grid'>
        {buttons.map(([rawKey, fns]) => (
          <div key={rawKey} className='kbd-device__btn'>
            <div className='kbd-device__btn-key'>{fns[0]?.display ?? rawKey}</div>
            <div className='kbd-device__btn-fns'>
              {fns.map((f, i) => <span key={i}>{f.name}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──── main export ─────────────────────────────────────────────────────────────

export default function KeybindsVisual ({ bindings, visualSearch = '' }) {
  const kbRef = useRef(null)
  const [kbUnit, setKbUnit] = useState(6)
  useEffect(() => {
    const el = kbRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth
      const fs = parseFloat(getComputedStyle(document.documentElement).fontSize)
      // Body = 18 key-units + 3.5rem of gaps; solve for unit size that fills cw
      const u = (cw / fs - 3.5) / 18
      setKbUnit(Math.max(4, Math.round(u * 100) / 100))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const deviceIndex = useMemo(() => {
    if (!bindings) return {}
    const idx = {}
    for (const [controlKey, data] of Object.entries(bindings)) {
      const meta = CONTROLS_METADATA[controlKey]
      const name = meta ? meta.name : controlKey.replace(/([a-z])([A-Z])/g, '$1 $2')
      const group = meta?.group ?? 'Other'
      // Append modifier key to the display name so combos (e.g. RB+A → function) are visible
      const mod = data.modifier
      const modLabel = (mod && mod.display && mod.device && mod.device !== '{NoDevice}')
        ? ` [+${mod.display}]`
        : ''
      const displayName = name + modLabel
      for (const field of ['primary', 'secondary', 'binding']) {
        const b = data[field]
        if (!b) continue
        const dev = b.device
        if (!dev || dev === '{NoDevice}') continue
        if (!idx[dev]) idx[dev] = {}
        if (!idx[dev][b.key]) idx[dev][b.key] = []
        if (!idx[dev][b.key].some(e => e.name === displayName)) {
          idx[dev][b.key].push({ name: displayName, searchName: name, group, display: b.display })
        }
      }
    }
    return idx
  }, [bindings])

  const kbIndex = deviceIndex['Keyboard'] ?? {}
  const mouseRaw = { ...(deviceIndex['Mouse'] ?? {}), ...(deviceIndex['Mouse_'] ?? {}) }
  const mouseEntry = Object.keys(mouseRaw).length > 0 ? [{ deviceName: 'Mouse', dIdx: mouseRaw }] : null
  const hasKeyboard = Object.keys(kbIndex).length > 0

  // Group joystick devices by SVG filename (deduplication)
  const svgGroups = {}   // { svgFile: [{ deviceName, dIdx }] }
  const noSvgDevices = []

  for (const [deviceName, dIdx] of Object.entries(deviceIndex)) {
    if (deviceName === 'Keyboard' || KEYBOARD_ADJACENT.has(deviceName)) continue
    let svgFile = DEVICE_SVG_MAP[deviceName]
    // Fallback: any unrecognised device whose keys look like GamePad_ buttons → Xbox SVG
    // (Sony/DualShock devices are already in DEVICE_SVG_MAP, so they won't reach here)
    if (!svgFile && Object.keys(dIdx).some(k => k.startsWith('GamePad_') || k.startsWith('Pad_'))) {
      svgFile = 'Microsoft XBox One Controller.svg'
    }
    if (svgFile) {
      if (!svgGroups[svgFile]) svgGroups[svgFile] = []
      svgGroups[svgFile].push({ deviceName, dIdx })
    } else {
      noSvgDevices.push([deviceName, dIdx])
    }
  }

  return (
    <div className='kbd-visual' ref={kbRef}>


      {/* ── Joystick / controller devices (top) ─────────────────────────── */}
      {(Object.keys(svgGroups).length > 0 || noSvgDevices.length > 0) && (
        <div className='kbd-joystick-section'>
          {Object.entries(svgGroups).map(([svgFile, group]) => (
            <DeviceSvgSection key={svgFile} svgFile={svgFile} devices={group} query={visualSearch} />
          ))}
          {noSvgDevices.map(([deviceName, dIdx]) => (
            <DeviceSection key={deviceName} deviceName={deviceName} deviceIndex={dIdx} />
          ))}
        </div>
      )}

      {/* ── Keyboard (full width) ────────────────────────────────────────── */}
      {hasKeyboard && (
        <div className='kbd-section' style={{ '--kbd-unit': `${kbUnit}rem` }}>
          <div className='kbd-device__name'>Keyboard</div>
          <div className='kbd-frow'>
            <KbdRow entries={FROW} keyIndex={kbIndex} gapW={0.75} query={visualSearch} />
          </div>
          <div className='kbd-body'>
            <div className='kbd-main-block'>
              {MAIN_ROWS.map((row, i) => (
                <KbdRow key={i} entries={row} keyIndex={kbIndex} query={visualSearch} />
              ))}
            </div>
            <div className='kbd-nav-block'>
              {NAV_ROWS.map((row, i) => (
                <KbdRow key={i} entries={row} keyIndex={kbIndex} gapW={1} query={visualSearch} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Mouse SVG (below keyboard) ───────────────────────────────────── */}
      {mouseEntry && (
        <DeviceSvgSection svgFile='mouse.svg' devices={mouseEntry} query={visualSearch} className='kbd-device--mouse' />
      )}

    </div>
  )
}
