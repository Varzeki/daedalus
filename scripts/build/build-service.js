const fs = require('fs')
const path = require('path')
const { exec } = require('@yao-pkg/pkg')
const UPX = require('upx')({ brute: false })
const yargs = require('yargs')
const commandLineArgs = yargs.argv

const {
  DEVELOPMENT_BUILD: DEVELOPMENT_BUILD_DEFAULT,
  DEBUG_CONSOLE: DEBUG_CONSOLE_DEFAULT,
  BUILD_DIR,
  BIN_DIR,
  SERVICE_UNOPTIMIZED_BUILD,
  SERVICE_OPTIMIZED_BUILD,
  SERVICE_FINAL_BUILD
} = require('./lib/build-options')

const DEVELOPMENT_BUILD = commandLineArgs.debug || DEVELOPMENT_BUILD_DEFAULT
const DEBUG_CONSOLE = commandLineArgs.debug || DEBUG_CONSOLE_DEFAULT
const ENTRY_POINT = path.join(__dirname, '..', '..', 'src', 'service', 'main.js')
const COMPRESS_FINAL_BUILD = true
const PKG_TARGET = 'node24-win-x64'

;(async () => {
  clean()
  await build()
})()

function clean () {
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })
  if (fs.existsSync(SERVICE_UNOPTIMIZED_BUILD)) fs.unlinkSync(SERVICE_UNOPTIMIZED_BUILD)
  if (fs.existsSync(SERVICE_OPTIMIZED_BUILD)) fs.unlinkSync(SERVICE_OPTIMIZED_BUILD)
  if (fs.existsSync(SERVICE_FINAL_BUILD)) fs.unlinkSync(SERVICE_FINAL_BUILD)
}

async function build () {
  const pkgArgs = [
    ENTRY_POINT,
    '--target', PKG_TARGET,
    '--output', SERVICE_UNOPTIMIZED_BUILD,
    '--compress', 'GZip',
    '--config', path.join(__dirname, '..', '..', 'package.json')
  ]

  if (DEBUG_CONSOLE) {
    pkgArgs.push('--debug')
  }

  console.log(`Packaging service with pkg (target: ${PKG_TARGET})...`)
  await exec(pkgArgs)

  // Note: resedit metadata injection is skipped for pkg binaries because
  // it reorganizes PE sections, invalidating the hardcoded payload offsets
  // that pkg embeds. The service is a background process so doesn't need
  // a custom icon or version info in its PE resources.

  // Copy yt-dlp.exe alongside the service binary
  const YTDLP_SRC = path.join(__dirname, '..', '..', 'resources', 'yt-dlp.exe')
  const YTDLP_DST = path.join(BIN_DIR, 'yt-dlp.exe')
  if (fs.existsSync(YTDLP_SRC)) {
    fs.copyFileSync(YTDLP_SRC, YTDLP_DST)
    console.log('Copied yt-dlp.exe to build/bin/')
  } else {
    console.warn('Warning: resources/yt-dlp.exe not found — video features will be unavailable')
  }

  if (DEVELOPMENT_BUILD) {
    console.log('Development build (skipping compression)')
    fs.copyFileSync(SERVICE_UNOPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
  } else {
    if (COMPRESS_FINAL_BUILD) {
      console.log('Optimizing service build with UPX...')
      try {
        const optimisationStats = await UPX(SERVICE_UNOPTIMIZED_BUILD)
          .output(SERVICE_OPTIMIZED_BUILD)
          .start()
        fs.copyFileSync(SERVICE_OPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
        console.log('Optimized service build', optimisationStats)
      } catch (e) {
        console.log('UPX compression failed (expected with pkg), using GZip-only build')
        fs.copyFileSync(SERVICE_UNOPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
      }
    } else {
      console.log('Compression disabled (skipping service build optimization)')
      fs.copyFileSync(SERVICE_UNOPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
    }
  }
}
