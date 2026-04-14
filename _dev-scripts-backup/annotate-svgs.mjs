/**
 * annotate-svgs.mjs
 *
 * Adds data-label / data-labels attributes directly to <rect> (label boxes)
 * and <path> (leader lines) elements in device SVGs. Both elements get the
 * same attribute so the JS dim logic and CSS [data-dim] opacity rule affect
 * them as a matched pair without relying on SVG tree structure.
 *
 * Usage:
 *   node _dev-scripts-backup/annotate-svgs.mjs
 *
 * Run from the daedalus/ project root. Idempotent — clears existing
 * data-label / data-labels attributes on each run before re-annotating.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const LABEL_POSITIONS = require(path.join(ROOT, 'src/client/lib/device-label-positions.json'))
const SVG_DIR = path.join(ROOT, 'src/client/public/device-svgs')

// ── Map each SVG file to the LABEL_POSITIONS key(s) to use.
const SVG_DEVICE_MAP = {
  'Microsoft XBox One Controller.svg':           ['045E02FD', '045E02FF', 'GamePad'],
  'Microsoft XBox One Elite Controller.svg':     ['045E02E3', '045E0B22'],
  'Sony DualShock 4 Controller.svg':             ['DualShock4', 'DS4'],
  'Razer Sabretooth.svg':                        ['GamePad'],
  'Logitech F710.svg':                           ['Logitech710WirelessGamepad'],
  'ThrustMaster Warthog Stick and Throttle.svg': ['ThrustMasterWarthogJoystick', 'ThrustMasterWarthogThrottle', 'ThrustMasterWarthogCombined'],
  'ThrustMaster T-16000M Stick.svg':             ['T16000M'],
  'Thrustmaster T-16000MFCS Stick and Throttle.svg': ['T16000MFCS', 'T16000MTHROTTLE'],
  'ThrustMaster T-Flight HOTAS X Stick and Throttle.svg': ['ThrustMasterTFlightHOTASX'],
  'ThrustMaster T-Flight HOTAS 4 Stick and Throttle.svg': ['ThrustMasterHOTAS4', 'TFlightHotasOne'],
  'ThrustMaster_Cougar.svg':                     ['ThrustMasterWarthogCombined', '044F0400'],
  'ThrustMaster TCA Sidestick Left.svg':         ['044F0405'],
  'ThrustMaster TCA Sidestick Right.svg':        ['044F0406'],
  'Thrustmaster T-Flight X Stick.svg':           ['044FB106'],
  'Thrustmaster TFRP Pedals.svg':                ['T-Rudder'],
  'Saitek X45.svg':                              ['SaitekX45'],
  'Saitek X52 Stick and Throttle.svg':           ['SaitekX52'],
  'Saitek X52 Pro Stick and Throttle.svg':       ['SaitekX52Pro'],
  'Saitek X55 Stick and Throttle.svg':           ['SaitekX55Joystick', 'SaitekX55Throttle'],
  'Saitek X56 Stick and Throttle.svg':           ['SaitekX56Joystick', 'SaitekX56Throttle'],
  'Saitek Cyborg FLY 5.svg':                     ['SaitekFLY5'],
  'Saitek Pro Flight Combat Pedals.svg':         ['SaitekProFlightCombatRudderPedals'],
  'Saitek Pro Flight Pedals.svg':                ['SaitekProFlightRudderPedals'],
  'Logitech Extreme 3D Pro.svg':                 ['LogitechExtreme3DPro'],
  'Logitech G940 Stick and Throttle.svg':        ['LogitechG940Joystick'],
  'Logitech G940 Pedals.svg':                    ['LogitechG940Pedals'],
  'CH Combatstick and Throttle.svg':             ['CHCombatStick'],
  'CH Fighterstick and Throttle.svg':            ['CHFighterStick'],
  'CH Pro Flight Throttle Quadrant.svg':         ['CHProThrottle1'],
  'CH Pro Pedals.svg':                           ['CHProPedals'],
  'CH Throttle Quadrant.svg':                    ['CHProThrottle1'],
  'Slaw BF-109 Pedals.svg':                      ['SlawFlightControlRudder'],
  'MFG Crosswind Pedals.svg':                    ['16D00A38'],
  'VKB Gladiator.svg':                           ['231D0121'],
  'VPC WarBRD DELTA Left.svg':                   ['03EB2042'],
  'VPC WarBRD DELTA Right.svg':                  ['03EB2044'],
  // Skip mouse.svg — already hand-annotated
}

// ── Known template rect base coordinates (Affinity Designer origin before transform)
// All label boxes use one of these as the base rect, with a matrix scaling/translating it
const RECT_TEMPLATES = [
  { x: 2102.27, y: 245.9,   w: 839.061, h: 61.826 },  // most devices
  { x: 2278.47, y: 247.279, w: 524.521, h: 204.131 },  // VKB / VPC
]
const TEMPLATE_TOL = 3

function isTemplateRect (el) {
  const x = parseFloat(el.getAttribute('x') || '')
  const y = parseFloat(el.getAttribute('y') || '')
  return RECT_TEMPLATES.some(t => Math.abs(x - t.x) < TEMPLATE_TOL && Math.abs(y - t.y) < TEMPLATE_TOL)
}

// ── Matrix helpers ────────────────────────────────────────────────────────────

function parseMatrix (transform) {
  if (!transform) return null
  const m = transform.match(/matrix\(([^)]+)\)/)
  if (!m) return null
  const [a, b, c, d, e, f] = m[1].split(',').map(Number)
  return { a, b, c, d, e, f }
}

function multiplyMatrix (m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

// Accumulate all ancestor matrix transforms from element up to (not including) the SVG root
function getEffectiveMatrix (el) {
  const matrices = []
  let node = el.parentNode
  while (node && node.tagName && node.tagName.toLowerCase() !== 'svg') {
    const t = node.getAttribute && node.getAttribute('transform')
    if (t) {
      const mat = parseMatrix(t)
      if (mat) matrices.unshift(mat) // outer-first order
    }
    node = node.parentNode
  }
  return matrices.reduce(multiplyMatrix, IDENTITY)
}

function applyMatrix (mat, x, y) {
  return {
    x: mat.a * x + mat.c * y + mat.e,
    y: mat.b * x + mat.d * y + mat.f,
  }
}

// Compute screen bounding box of a template rect element
function getRectScreenBounds (rectEl) {
  const x = parseFloat(rectEl.getAttribute('x'))
  const y = parseFloat(rectEl.getAttribute('y'))
  const w = parseFloat(rectEl.getAttribute('width'))
  const h = parseFloat(rectEl.getAttribute('height'))
  const mat = getEffectiveMatrix(rectEl)
  const tl = applyMatrix(mat, x, y)
  const br = applyMatrix(mat, x + w, y + h)
  return {
    x: Math.min(tl.x, br.x),
    y: Math.min(tl.y, br.y),
    w: Math.abs(br.x - tl.x),
    h: Math.abs(br.y - tl.y),
  }
}

// ── Match a screen rect to LABEL_POSITIONS entries by overlap ─────────────────

const MATCH_TOL = 10

function matchPositions (screenBounds, positions) {
  const { x, y, w, h } = screenBounds
  return Object.entries(positions).filter(([, pos]) => {
    const xOk = pos.x >= x - MATCH_TOL && pos.x <= x + w + MATCH_TOL
    const yOk = pos.y >= y - MATCH_TOL && pos.y <= y + h + MATCH_TOL
    return xOk && yOk
  }).map(([key]) => key)
}

// ── Parse path data to get significant endpoint coordinates ───────────────────

function getPathEndpoints (d) {
  // Extract all numbers; treat as paired (x,y) coords; return first and last pair
  const nums = (d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number)
  if (nums.length < 2) return []
  // Return start and end points
  return [
    { x: nums[0], y: nums[1] },
    { x: nums[nums.length - 2], y: nums[nums.length - 1] },
  ]
}

// Given a set of already-annotated rect bounds, find which label keys a path belongs to.
// Two strategies:
//   1. Containment: if the entire path fits inside one rect's bounds, it's a border
//      segment or separator bar of that box — attribute to that rect directly.
//   2. Proximity: for leader lines (one endpoint at a rect, the other toward the device),
//      pick the CLOSEST rect by endpoint-to-center distance.
function matchPathToLabels (pathEl, annotatedRects) {
  const mat = getEffectiveMatrix(pathEl)
  const d = pathEl.getAttribute('d') || ''
  const rawEndpoints = getPathEndpoints(d)
  if (!rawEndpoints.length) return null

  const endpoints = rawEndpoints.map(pt => applyMatrix(mat, pt.x, pt.y))

  // Strategy 1: containment — path fits entirely inside one rect
  const CONTAIN_TOL = 10
  for (const { bounds, keys } of annotatedRects) {
    const inside = endpoints.every(pt =>
      pt.x >= bounds.x - CONTAIN_TOL && pt.x <= bounds.x + bounds.w + CONTAIN_TOL &&
      pt.y >= bounds.y - CONTAIN_TOL && pt.y <= bounds.y + bounds.h + CONTAIN_TOL
    )
    if (inside) return keys
  }

  // Strategy 2: endpoint proximity for leader lines
  const PATH_TOL = 40
  let bestKeys = null
  let bestDist = Infinity

  for (const pt of endpoints) {
    for (const { bounds, keys } of annotatedRects) {
      const nearX = pt.x >= bounds.x - PATH_TOL && pt.x <= bounds.x + bounds.w + PATH_TOL
      const nearY = pt.y >= bounds.y - PATH_TOL && pt.y <= bounds.y + bounds.h + PATH_TOL
      if (nearX && nearY) {
        const cx = bounds.x + bounds.w / 2
        const cy = bounds.y + bounds.h / 2
        const dist = Math.hypot(pt.x - cx, pt.y - cy)
        if (dist < bestDist) {
          bestDist = dist
          bestKeys = keys
        }
      }
    }
  }
  return bestKeys
}

// ── Walk all descendant elements ──────────────────────────────────────────────

function* allElements (node) {
  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i]
      if (c.tagName) { yield c; yield* allElements(c) }
    }
  }
}

// ── Clear existing annotations ────────────────────────────────────────────────

function clearAnnotations (svgEl) {
  for (const el of allElements(svgEl)) {
    el.removeAttribute('data-label')
    el.removeAttribute('data-labels')
    el.removeAttribute('data-dim')
  }
}

// ── Apply annotation helper ───────────────────────────────────────────────────

function applyAnnotation (node, keys) {
  node.removeAttribute('data-label')
  node.removeAttribute('data-labels')
  if (keys.length === 1) {
    node.setAttribute('data-label', keys[0])
  } else if (keys.length > 1) {
    node.setAttribute('data-labels', keys.join(' '))
  }
}

// Check if any ancestor of el already carries a data-label/data-labels annotation
function hasAnnotatedAncestor (el) {
  let node = el.parentNode
  while (node && node.tagName && node.tagName.toLowerCase() !== 'svg') {
    if (node.hasAttribute('data-label') || node.hasAttribute('data-labels')) return true
    node = node.parentNode
  }
  return false
}

// Get the screen-space center of an element (circle, text, use, etc.)
function getElementCenter (el) {
  const mat = getEffectiveMatrix(el)
  let cx, cy
  if (el.tagName === 'circle') {
    cx = parseFloat(el.getAttribute('cx') || 0)
    cy = parseFloat(el.getAttribute('cy') || 0)
  } else {
    cx = parseFloat(el.getAttribute('x') || 0)
    cy = parseFloat(el.getAttribute('y') || 0)
  }
  return applyMatrix(mat, cx, cy)
}

// ── Main annotation function for a single SVG ─────────────────────────────────

// posKeys is an array of LABEL_POSITIONS keys. Each position set is iterated
// independently so that shared key names (e.g. Joy_1 on both joystick and
// throttle at different SVG positions) each annotate their own rects.
function annotate (svgFile, posKeys) {
  const svgPath = path.join(SVG_DIR, svgFile)
  if (!fs.existsSync(svgPath)) { console.warn(`  SKIP (not found): ${svgFile}`); return }

  // Build array of { posKey, positions } — keeps track of which device each set belongs to
  const posEntries = posKeys
    .map(k => ({ posKey: k, positions: LABEL_POSITIONS[k] }))
    .filter(e => e.positions)
  if (!posEntries.length) { console.warn(`  SKIP (no positions for ${posKeys}): ${svgFile}`); return }

  const raw = fs.readFileSync(svgPath, 'utf8')
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const svgEl = doc.documentElement

  clearAnnotations(svgEl)

  // Pass 1: annotate <rect> elements — match against each position set independently.
  // Keys are device-qualified (e.g. "SaitekX56Joystick:Joy_1") so that shared key
  // names across devices (joystick vs throttle) don't collide at runtime.
  const annotatedRects = []  // { bounds, keys } for proximity matching in pass 2+3
  let rectCount = 0

  for (const el of allElements(svgEl)) {
    if (el.tagName !== 'rect') continue
    if (!isTemplateRect(el)) continue

    const bounds = getRectScreenBounds(el)
    const allKeys = []
    for (const { posKey, positions } of posEntries) {
      const matched = matchPositions(bounds, positions)
      for (const key of matched) allKeys.push(`${posKey}:${key}`)
    }
    const unique = [...new Set(allKeys)]
    if (!unique.length) continue

    applyAnnotation(el, unique)
    annotatedRects.push({ bounds, keys: unique })
    rectCount++
  }

  // Pass 2: annotate orange <path> leader lines by endpoint proximity
  let pathCount = 0

  for (const el of allElements(svgEl)) {
    if (el.tagName !== 'path') continue
    const style = el.getAttribute('style') || ''
    if (!style.includes('stroke:rgb(250,150,0)')) continue
    if (el.hasAttribute('data-label') || el.hasAttribute('data-labels')) continue
    if (hasAnnotatedAncestor(el)) continue

    const keys = matchPathToLabels(el, annotatedRects)
    if (!keys) continue

    applyAnnotation(el, keys)
    pathCount++
  }

  // Pass 3: annotate icon/label elements (circles, text, use, etc.).
  // This covers both orange indicator circles and cyan axis-arrow icons.
  // Two strategies: containment first (icon center inside rect), then proximity.
  let iconCount = 0
  const ICON_CONTAIN_TOL = 5
  const ICON_TOL = 40

  for (const el of allElements(svgEl)) {
    if (el.tagName === 'rect' || el.tagName === 'path' || el.tagName === 'g' ||
        el.tagName === 'svg' || el.tagName === 'defs' || el.tagName === 'clipPath') continue
    // Must have SOME visible styling (orange or cyan fill/stroke)
    const style = el.getAttribute('style') || ''
    if (!style.includes('rgb(250,150,0)') && !style.includes('rgb(20,245,255)')) continue
    if (el.hasAttribute('data-label') || el.hasAttribute('data-labels')) continue
    if (hasAnnotatedAncestor(el)) continue

    const pt = getElementCenter(el)
    let matchedKeys = null

    // Strategy 1: containment — icon center is inside a rect
    for (const { bounds, keys } of annotatedRects) {
      if (pt.x >= bounds.x - ICON_CONTAIN_TOL && pt.x <= bounds.x + bounds.w + ICON_CONTAIN_TOL &&
          pt.y >= bounds.y - ICON_CONTAIN_TOL && pt.y <= bounds.y + bounds.h + ICON_CONTAIN_TOL) {
        matchedKeys = keys
        break
      }
    }

    // Strategy 2: closest rect within ICON_TOL
    if (!matchedKeys) {
      let bestDist = Infinity
      for (const { bounds, keys } of annotatedRects) {
        if (pt.x >= bounds.x - ICON_TOL && pt.x <= bounds.x + bounds.w + ICON_TOL &&
            pt.y >= bounds.y - ICON_TOL && pt.y <= bounds.y + bounds.h + ICON_TOL) {
          const cx = bounds.x + bounds.w / 2
          const cy = bounds.y + bounds.h / 2
          const dist = Math.hypot(pt.x - cx, pt.y - cy)
          if (dist < bestDist) { bestDist = dist; matchedKeys = keys }
        }
      }
    }

    if (matchedKeys) {
      applyAnnotation(el, matchedKeys)
      iconCount++
    }
  }

  // Pass 4: annotate <use> elements that reference small embedded images (e.g. rotation icons).
  // These have no inline style/fill so passes 2-3 skip them.
  // Two strategies: containment first, then closest-rect-center proximity.
  // Skip large images (device photos) — only annotate icons (both dimensions ≤ 500px).
  let useCount = 0
  const USE_CONTAIN_TOL = 10
  const USE_PROXIMITY = 400 // max distance from icon center to rect center
  const MAX_ICON_DIM = 500  // skip referenced images larger than this (device photos)

  for (const el of allElements(svgEl)) {
    if (el.tagName !== 'use') continue
    if (el.hasAttribute('data-label') || el.hasAttribute('data-labels')) continue
    if (hasAnnotatedAncestor(el)) continue
    // Skip elements inside <defs> or <clipPath>
    let inDefs = false
    let node = el.parentNode
    while (node && node.tagName) {
      if (node.tagName === 'defs' || node.tagName === 'clipPath') { inDefs = true; break }
      node = node.parentNode
    }
    if (inDefs) continue

    // Resolve referenced image dimensions — skip large device photos
    const href = el.getAttribute('xlink:href') || el.getAttribute('href') || ''
    if (href.startsWith('#')) {
      const refId = href.slice(1)
      const refEl = [...allElements(svgEl)].find(e => e.getAttribute('id') === refId)
      if (refEl && refEl.tagName === 'image') {
        const imgW = parseInt(refEl.getAttribute('width') || '0', 10)
        const imgH = parseInt(refEl.getAttribute('height') || '0', 10)
        if (imgW > MAX_ICON_DIM || imgH > MAX_ICON_DIM) continue
      }
    }

    const pt = getElementCenter(el)
    let bestKeys = null

    // Strategy 1: containment — icon center is inside a rect
    for (const { bounds, keys } of annotatedRects) {
      if (pt.x >= bounds.x - USE_CONTAIN_TOL && pt.x <= bounds.x + bounds.w + USE_CONTAIN_TOL &&
          pt.y >= bounds.y - USE_CONTAIN_TOL && pt.y <= bounds.y + bounds.h + USE_CONTAIN_TOL) {
        bestKeys = keys
        break
      }
    }

    // Strategy 2: closest rect center within USE_PROXIMITY
    if (!bestKeys) {
      let bestDist = Infinity
      for (const { bounds, keys } of annotatedRects) {
        const cx = bounds.x + bounds.w / 2
        const cy = bounds.y + bounds.h / 2
        const dist = Math.hypot(pt.x - cx, pt.y - cy)
        if (dist < bestDist) { bestDist = dist; bestKeys = keys }
      }
      if (bestDist > USE_PROXIMITY) bestKeys = null
    }

    if (bestKeys) {
      applyAnnotation(el, bestKeys)
      useCount++
    }
  }

  const serializer = new XMLSerializer()
  fs.writeFileSync(svgPath, serializer.serializeToString(doc), 'utf8')
  console.log(`  ${svgFile}: ${rectCount} rects, ${pathCount} paths, ${iconCount} icons, ${useCount} uses annotated`)
}

// ── Process all ───────────────────────────────────────────────────────────────

for (const [svgFile, deviceKeys] of Object.entries(SVG_DEVICE_MAP)) {
  const validKeys = deviceKeys.filter(k => LABEL_POSITIONS[k])
  if (!validKeys.length) { console.log(`SKIP (no label data): ${svgFile}`); continue }
  console.log(`${svgFile} → [${validKeys.join(', ')}]`)
  annotate(svgFile, validKeys)
}

console.log('\nDone.')
