// Debug why CH SVGs get zero annotations
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DOMParser } from '@xmldom/xmldom'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)
const LABEL_POSITIONS = require(path.join(ROOT, 'src/client/lib/device-label-positions.json'))
const SVG_DIR = path.join(ROOT, 'src/client/public/device-svgs')

const TEMPLATE_X = 2102.27, TEMPLATE_Y = 245.9, TEMPLATE_W = 839.061, TEMPLATE_H = 61.826, TOL = 2

function parseMatrix(t) {
  const m = t && t.match(/matrix\(([^)]+)\)/)
  if (!m) return null
  const [a, b, c, d, e, f] = m[1].split(',').map(Number)
  return { a, b, c, d, e, f }
}

function getScreenBounds(rectEl) {
  let node = rectEl.parentNode
  while (node && node.tagName) {
    const t = node.getAttribute && node.getAttribute('transform')
    if (t && t.startsWith('matrix')) {
      const mat = parseMatrix(t)
      if (!mat) break
      const tx1 = mat.a * TEMPLATE_X + mat.c * TEMPLATE_Y + mat.e
      const ty1 = mat.b * TEMPLATE_X + mat.d * TEMPLATE_Y + mat.f
      const tx2 = mat.a * (TEMPLATE_X + TEMPLATE_W) + mat.c * (TEMPLATE_Y + TEMPLATE_H) + mat.e
      const ty2 = mat.b * (TEMPLATE_X + TEMPLATE_W) + mat.d * (TEMPLATE_Y + TEMPLATE_H) + mat.f
      return { x: Math.min(tx1, tx2), y: Math.min(ty1, ty2), w: Math.abs(tx2 - tx1), h: Math.abs(ty2 - ty1) }
    }
    node = node.parentNode
  }
  return null
}

function* allElements(node) {
  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i]
      if (c.tagName) { yield c; yield* allElements(c) }
    }
  }
}

const raw = fs.readFileSync(path.join(SVG_DIR, 'CH Combatstick and Throttle.svg'), 'utf8')
const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')

const positions = LABEL_POSITIONS['CHCombatStick']
console.log('CHCombatStick position keys:', Object.keys(positions).length)
console.log('First 3:', JSON.stringify(Object.entries(positions).slice(0, 3)))

let rectCount = 0
for (const el of allElements(doc.documentElement)) {
  if (el.tagName !== 'rect') continue
  const x = parseFloat(el.getAttribute('x') || '')
  const y = parseFloat(el.getAttribute('y') || '')
  if (Math.abs(x - TEMPLATE_X) > TOL || Math.abs(y - TEMPLATE_Y) > TOL) continue
  rectCount++
  const bounds = getScreenBounds(el)
  if (!bounds) {
    console.log(`Rect ${rectCount}: bounds=null (no matrix parent found)`)
    console.log('  Parent tagName:', el.parentNode?.tagName, 'transform:', el.parentNode?.getAttribute?.('transform'))
    continue
  }
  // Try match
  const MATCH_TOL = 8
  const matches = Object.entries(positions).filter(([k, pos]) => {
    const xm = Math.abs(pos.x - bounds.x) < MATCH_TOL || (pos.x >= bounds.x - MATCH_TOL && pos.x <= bounds.x + bounds.w + MATCH_TOL)
    const ym = pos.y >= bounds.y - MATCH_TOL && pos.y <= bounds.y + bounds.h + MATCH_TOL
    return xm && ym
  })
  console.log(`Rect ${rectCount}: screen (${bounds.x.toFixed(0)},${bounds.y.toFixed(0)}) w=${bounds.w.toFixed(0)} h=${bounds.h.toFixed(0)} → matches: [${matches.map(([k]) => k).join(', ')}]`)
}
console.log('Total template rects found:', rectCount)
