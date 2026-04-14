import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SVG_DIR = path.join(__dirname, '..', 'src', 'client', 'public', 'device-svgs')

const results = []
for (const f of fs.readdirSync(SVG_DIR).filter(n => n.endsWith('.svg'))) {
  const content = fs.readFileSync(path.join(SVG_DIR, f), 'utf8')
  const bytes = content.length
  const labelCount = (content.match(/data-label[^=]/g) || []).length
  // Detect embedded JPEG (large base64 block in xlink:href or href)
  const hasJpeg = /data:image\/jpeg/i.test(content)
  const hasPng = /data:image\/png/i.test(content)
  const hasOrangeRects = (content.match(/stroke:rgb\(250,150,0\)/g) || []).length
  const isEmpty = !content.includes('<rect') && !content.includes('<path') && !content.includes('<circle')
  results.push({ f, bytes, labelCount, hasJpeg, hasPng, hasOrangeRects, isEmpty })
}

console.log('SVG annotation audit:\n')
console.log('File                                               | labels | orange | embed | empty | kB')
console.log('-'.repeat(100))
for (const r of results) {
  const embed = r.hasJpeg ? 'JPEG' : r.hasPng ? 'PNG' : '-'
  console.log(
    r.f.padEnd(50) + '| ' +
    String(r.labelCount).padStart(6) + ' | ' +
    String(r.hasOrangeRects).padStart(6) + ' | ' +
    embed.padEnd(5) + ' | ' +
    String(r.isEmpty).padEnd(5) + ' | ' +
    (r.bytes / 1024).toFixed(0)
  )
}
