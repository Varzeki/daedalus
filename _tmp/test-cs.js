const { execSync } = require('child_process')
const fs = require('fs').promises
const path = require('path')

async function test () {
  const raw = execSync(
    'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
    { encoding: 'utf8', timeout: 3000 }
  )
  const m = raw.match(/InstallPath\s+REG_SZ\s+(.+)/)
  const steamRoot = m[1].trim()
  console.log('Steam root:', steamRoot)

  const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  const vdf = await fs.readFile(vdfPath, 'utf8')

  const candidates = []
  for (const pm of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
    candidates.push(path.join(pm[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Elite Dangerous'))
  }
  candidates.push(path.join(steamRoot, 'steamapps', 'common', 'Elite Dangerous'))
  console.log('Candidates:', candidates)

  for (const base of [...new Set(candidates)]) {
    try {
      const productsDir = path.join(base, 'Products')
      const products = (await fs.readdir(productsDir)).sort().reverse()
      for (const product of products) {
        const csDir = path.join(productsDir, product, 'ControlSchemes')
        try {
          const entries = await fs.readdir(csDir)
          const binds = entries.filter(e => e.endsWith('.binds'))
          if (binds.length > 0) {
            console.log('Found ControlSchemes at:', csDir)
            console.log('Default presets:', binds.length)
            console.log('Files:', binds.map(b => b.replace('.binds', '')).join(', '))
            return
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  console.log('NOT FOUND')
}

test().catch(console.error)
