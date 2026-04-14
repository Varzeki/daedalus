import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const svgDir = '../src/client/public/device-svgs'
const labelPos = require('../src/client/lib/device-label-positions.json')

const xbox = fs.readFileSync(`${svgDir}/Microsoft XBox One Controller.svg`, 'utf8')
const rects = (xbox.match(/x="2102\.27"/g) || []).length
const orangeStrokes = (xbox.match(/fill:none;stroke:rgb\(250,150,0\)/g) || []).length
const xboxKeys = Object.keys(labelPos['045E02FD']).length
console.log('Xbox — Box rects:', rects, '| Orange strokes:', orangeStrokes, '| Label keys:', xboxKeys)

// Show all svgs in directory vs their device label mappings
const svgFiles = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg'))
console.log('\nTotal SVG files:', svgFiles.length)

// Check which SVG files have data-label annotations already (mouse.svg)
for (const f of svgFiles) {
  const content = fs.readFileSync(`${svgDir}/${f}`, 'utf8')
  const hasDataLabel = content.includes('data-label')
  if (hasDataLabel) console.log('  Already annotated:', f)
}
