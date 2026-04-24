const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
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
const SERVICE_LIB_DIR = path.join(__dirname, '..', '..', 'src', 'service', 'lib')
const AUDIO_HELPER_SOURCE = path.join(SERVICE_LIB_DIR, 'system-audio-meter-helper.cs')
const AUDIO_HELPER_OUTPUT = path.join(BIN_DIR, 'system-audio-meter-helper.exe')
const THUMBNAIL_HELPER_SOURCE = path.join(SERVICE_LIB_DIR, 'system-media-thumbnail-helper.cs')
const THUMBNAIL_HELPER_OUTPUT = path.join(BIN_DIR, 'system-media-thumbnail-helper.exe')
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
  if (fs.existsSync(AUDIO_HELPER_OUTPUT)) fs.unlinkSync(AUDIO_HELPER_OUTPUT)
  if (fs.existsSync(THUMBNAIL_HELPER_OUTPUT)) fs.unlinkSync(THUMBNAIL_HELPER_OUTPUT)
}

function getCscPath () {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function getSystemRuntimeFacadePath () {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const candidates = [
    path.join(programFilesX86, 'Reference Assemblies', 'Microsoft', 'Framework', '.NETFramework', 'v4.8', 'Facades', 'System.Runtime.dll'),
    path.join(programFilesX86, 'Reference Assemblies', 'Microsoft', 'Framework', '.NETFramework', 'v4.7.2', 'Facades', 'System.Runtime.dll'),
    path.join(programFilesX86, 'Reference Assemblies', 'Microsoft', 'Framework', '.NETFramework', 'v4.7.1', 'Facades', 'System.Runtime.dll')
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function getWindowsMetadataPath () {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const candidates = [
    path.join(programFilesX86, 'Windows Kits', '10', 'UnionMetadata', '10.0.26100.0', 'Windows.winmd'),
    path.join(programFilesX86, 'Windows Kits', '10', 'UnionMetadata', '10.0.16299.0', 'Windows.winmd'),
    path.join(programFilesX86, 'Windows Kits', '10', 'UnionMetadata', 'Facade', 'Windows.WinMD')
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function getWindowsRuntimeAssemblyPath () {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'System.Runtime.WindowsRuntime.dll'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'System.Runtime.WindowsRuntime.dll')
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function compileHelper (outputPath, sourcePath, references) {
  const cscPath = getCscPath()
  if (!cscPath) {
    throw new Error(`Unable to compile ${path.basename(sourcePath)} because csc.exe is unavailable on the build machine.`)
  }

  execFileSync(cscPath, [
    '/nologo',
    '/target:exe',
    `/out:${outputPath}`,
    ...references.map(reference => `/reference:${reference}`),
    sourcePath
  ], {
    windowsHide: true,
    stdio: 'inherit'
  })
}

function compileBundledHelpers () {
  const systemRuntimeFacadePath = getSystemRuntimeFacadePath()
  if (!systemRuntimeFacadePath) {
    throw new Error('Unable to compile bundled Windows helpers because System.Runtime facade is unavailable on the build machine.')
  }

  compileHelper(AUDIO_HELPER_OUTPUT, AUDIO_HELPER_SOURCE, [systemRuntimeFacadePath])
  console.log('Compiled bundled system-audio-meter-helper.exe')

  const windowsMetadataPath = getWindowsMetadataPath()
  const windowsRuntimeAssemblyPath = getWindowsRuntimeAssemblyPath()
  if (!windowsMetadataPath || !windowsRuntimeAssemblyPath) {
    throw new Error('Unable to compile bundled thumbnail helper because Windows Runtime build references are unavailable on the build machine.')
  }

  compileHelper(THUMBNAIL_HELPER_OUTPUT, THUMBNAIL_HELPER_SOURCE, [
    windowsRuntimeAssemblyPath,
    systemRuntimeFacadePath,
    windowsMetadataPath
  ])
  console.log('Compiled bundled system-media-thumbnail-helper.exe')
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

  compileBundledHelpers()

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

  // Copy @parcel/watcher native addon alongside the service binary.
  // pkg cannot embed native .node files, so we ship it externally.
  // At runtime, require('@parcel/watcher-win32-x64') resolves to the
  // watcher.node file next to the exe. Falls back gracefully if missing.
  const WATCHER_SRC = path.join(__dirname, '..', '..', 'node_modules', '@parcel', 'watcher-win32-x64', 'watcher.node')
  const WATCHER_DST = path.join(BIN_DIR, 'watcher.node')
  if (fs.existsSync(WATCHER_SRC)) {
    fs.copyFileSync(WATCHER_SRC, WATCHER_DST)
    console.log('Copied @parcel/watcher native addon to build/bin/')
  } else {
    console.warn('Warning: @parcel/watcher-win32-x64 native addon not found — will use polling fallback')
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
