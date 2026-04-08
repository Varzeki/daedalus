// The standalone build creates cross platform (Win/Mac/Linux) build of the
// service with @yao-pkg/pkg. Unlike the full release, this build does not
// feature an installer, auto-updating or a native UI and must be configured
// using command line options.
const fs = require('fs')
const path = require('path')
const { exec } = require('@yao-pkg/pkg')
const yargs = require('yargs')
const commandLineArgs = yargs.argv

const {
  DEBUG_CONSOLE: DEBUG_CONSOLE_DEFAULT,
  BUILD_DIR,
  BIN_DIR,
  DIST_DIR,
  SERVICE_STANDALONE_BUILD,
  SERVICE_ICON
} = require('./lib/build-options')

const DEBUG_CONSOLE = commandLineArgs.debug || DEBUG_CONSOLE_DEFAULT
const ENTRY_POINT = path.join(__dirname, '..', 'src', 'service', 'main.js')

;(async () => {
  clean()
  await build()
})()

function clean () {
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })
  if (fs.existsSync(DIST_DIR)) fs.rmdirSync(DIST_DIR, { recursive: true })
}

async function build () {
  const targets = [
    { target: 'node24-linux-x64', suffix: '-linux' },
    { target: 'node24-macos-x64', suffix: '-mac' },
    { target: 'node24-win-x64', suffix: '-windows' }
  ]

  for (const { target, suffix } of targets) {
    const pkgArgs = [
      ENTRY_POINT,
      '--target', target,
      '--output', SERVICE_STANDALONE_BUILD + suffix,
      '--compress', 'Brotli'
    ]

    if (DEBUG_CONSOLE) {
      pkgArgs.push('--debug')
    }

    console.log(`Building standalone for ${target}...`)
    await exec(pkgArgs)
  }
}
