const fs = require('fs')
const path = require('path')
const { exec } = require('@yao-pkg/pkg')
const ResEdit = require('resedit')
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
  SERVICE_FINAL_BUILD,
  SERVICE_ICON,
  SERVICE_VERSION_INFO,
  PRODUCT_VERSION
} = require('./lib/build-options')

const DEVELOPMENT_BUILD = commandLineArgs.debug || DEVELOPMENT_BUILD_DEFAULT
const DEBUG_CONSOLE = commandLineArgs.debug || DEBUG_CONSOLE_DEFAULT
const ENTRY_POINT = path.join(__dirname, '..', 'src', 'service', 'main.js')
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

function injectMetadata (exePath, versionInfo, iconPath) {
  const exeData = fs.readFileSync(exePath)
  const exe = ResEdit.NtExecutable.from(exeData)
  const res = ResEdit.NtExecutableResource.from(exe)

  // Inject version info
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
  const vi = viList.length > 0 ? viList[0] : new ResEdit.Resource.VersionInfo()
  const [major, minor, patch, build] = versionInfo.FileVersion.split('.').map(Number)
  const lang = 1033 // en-US
  const codepage = 1200 // Unicode

  vi.setFileVersion(major, minor, patch, build || 0, lang)
  vi.setProductVersion(major, minor, patch, build || 0, lang)
  vi.setStringValues({ lang, codepage }, {
    FileDescription: versionInfo.FileDescription,
    ProductName: versionInfo.ProductName,
    CompanyName: versionInfo.CompanyName,
    ProductVersion: versionInfo.ProductVersion,
    FileVersion: versionInfo.FileVersion,
    OriginalFilename: versionInfo.OriginalFilename,
    InternalName: versionInfo.InternalName,
    LegalCopyright: versionInfo.LegalCopyright
  })
  vi.outputToResourceEntries(res.entries)

  // Inject icon
  if (iconPath && fs.existsSync(iconPath)) {
    try {
      const iconData = fs.readFileSync(iconPath)
      const iconFile = ResEdit.Data.IconFile.from(iconData)
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries, 1, lang, iconFile.icons.map(i => i.data)
      )
    } catch (e) {
      console.log('Warning: Icon injection failed:', e.message)
    }
  }

  res.outputResource(exe)
  fs.writeFileSync(exePath, Buffer.from(exe.generate()))
}

async function build () {
  const pkgArgs = [
    ENTRY_POINT,
    '--target', PKG_TARGET,
    '--output', SERVICE_UNOPTIMIZED_BUILD,
    '--compress', 'Brotli'
  ]

  if (DEBUG_CONSOLE) {
    pkgArgs.push('--debug')
  }

  console.log(`Packaging service with pkg (target: ${PKG_TARGET})...`)
  await exec(pkgArgs)

  // Inject Windows executable metadata (icon and version info)
  console.log('Injecting executable metadata...')
  injectMetadata(SERVICE_UNOPTIMIZED_BUILD, SERVICE_VERSION_INFO, SERVICE_ICON)

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
        console.log('UPX compression failed (expected with pkg), using Brotli-only build')
        fs.copyFileSync(SERVICE_UNOPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
      }
    } else {
      console.log('Compression disabled (skipping service build optimization)')
      fs.copyFileSync(SERVICE_UNOPTIMIZED_BUILD, SERVICE_FINAL_BUILD)
    }
  }
}
