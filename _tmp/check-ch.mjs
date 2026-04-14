import fs from 'fs'
const ch = fs.readFileSync('r:/BiologicalsUpdate/daedalus/src/client/public/device-svgs/CH Combatstick and Throttle.svg', 'utf8')
const vb = ch.match(/viewBox="([^"]+)"/)?.[1]
console.log('CH viewBox:', vb)

// Get matrix contents and compute screen positions for rects
const pattern = /<g transform="(matrix\([^)]+\))"[^>]*>\s*<rect x="2102\.27"/g
let m
let count = 0
while ((m = pattern.exec(ch)) !== null && count < 5) {
  const nums = m[1].replace('matrix(', '').replace(')', '').split(',').map(Number)
  const [a, b, c, d, e, f] = nums
  const sx = a * 2102.27 + c * 245.9 + e
  const sy = b * 2102.27 + d * 245.9 + f
  const sw = a * 839.061
  const sh = d * 61.826
  console.log(`  matrix${count}: ${nums.map(v => v.toFixed(3)).join(',')} => screen (${sx.toFixed(0)},${sy.toFixed(0)}) w=${sw.toFixed(0)} h=${sh.toFixed(0)}`)
  count++
}
