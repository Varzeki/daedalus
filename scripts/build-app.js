const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const ResEdit = require('resedit')
const UPX = require('upx')({ brute: true })
const yargs = require('yargs')
const commandLineArgs = yargs.argv

const {
  DEVELOPMENT_BUILD: DEVELOPMENT_BUILD_DEFAULT,
  DEBUG_CONSOLE: DEBUG_CONSOLE_DEFAULT,
  BUILD_DIR,
  BIN_DIR,
  RESOURCES_DIR,
  APP_UNOPTIMIZED_BUILD,
  APP_OPTIMIZED_BUILD,
  APP_FINAL_BUILD,
  APP_ICON,
  APP_VERSION_INFO
} = require('./lib/build-options')

const DEVELOPMENT_BUILD = commandLineArgs.debug || DEVELOPMENT_BUILD_DEFAULT
const DEBUG_CONSOLE = commandLineArgs.debug || DEBUG_CONSOLE_DEFAULT
const COMPRESS_FINAL_BUILD = true

;(async () => {
  clean()
  await build()
  copy()
})()

function clean () {
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })
  if (fs.existsSync(APP_UNOPTIMIZED_BUILD)) fs.unlinkSync(APP_UNOPTIMIZED_BUILD)
  if (fs.existsSync(APP_OPTIMIZED_BUILD)) fs.unlinkSync(APP_OPTIMIZED_BUILD)
  if (fs.existsSync(APP_FINAL_BUILD)) fs.unlinkSync(APP_FINAL_BUILD)
}

async function build () {
  if (DEBUG_CONSOLE) {
    // Build that opens console output to a terminal
    execSync(`cd src/app && go build -o "${APP_UNOPTIMIZED_BUILD}"`)
  } else {
    execSync(`cd src/app && go build -ldflags="-H windowsgui -s -w" -o "${APP_UNOPTIMIZED_BUILD}"`)
  }

  if (DEVELOPMENT_BUILD) {
    console.log('Development build (skipping compression)')
    fs.copyFileSync(APP_UNOPTIMIZED_BUILD, APP_OPTIMIZED_BUILD)
  } else {
    if (COMPRESS_FINAL_BUILD) {
      console.log('Optimizing app build...')
      const optimisationStats = await UPX(APP_UNOPTIMIZED_BUILD)
        .output(APP_OPTIMIZED_BUILD)
        .start()
        .catch(err => {
          console.log('Error compressing build', err)
          process.exit(1)
        })
      console.log('Optimized app build', optimisationStats)
    } else {
      console.log('Compression disabled (skipping service build optimization)')
      fs.copyFileSync(APP_UNOPTIMIZED_BUILD, APP_OPTIMIZED_BUILD)
    }
  }

  // Apply icon and resource changes after optimization
  injectMetadata(APP_OPTIMIZED_BUILD, APP_VERSION_INFO, APP_ICON)
}

function injectMetadata (exePath, versionInfo, iconPath) {
  const exeData = fs.readFileSync(exePath)
  const exe = ResEdit.NtExecutable.from(exeData)
  const res = ResEdit.NtExecutableResource.from(exe)

  // Inject version info
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
  const vi = viList.length > 0 ? viList[0] : new ResEdit.Resource.VersionInfo()
  const [major, minor, patch, build] = versionInfo.FileVersion.split('.').map(Number)
  const lang = 1033
  const codepage = 1200

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

function copy () {
  fs.copyFileSync(APP_OPTIMIZED_BUILD, APP_FINAL_BUILD)
  // Icon copied to bin dir as used by the terminal at runtime when spawning
  // new windows so must be shipped alongside the binary.
  // It's also an embeded resource in each executable but it's easier to access
  // as a distinct asset (which is why a lot of Win32 programs do this).
  fs.copyFileSync(APP_ICON, path.join(BIN_DIR, 'icon.ico'))
}
