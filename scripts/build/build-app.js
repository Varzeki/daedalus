const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const ResEdit = require('resedit')
const UPX = require('upx')({ best: true })
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
  for (const f of [APP_UNOPTIMIZED_BUILD, APP_OPTIMIZED_BUILD]) {
    unlinkRetry(f)
  }
  // Try to clean the final build, but don't fail if it's locked —
  // copy() will overwrite it
  try { unlinkRetry(APP_FINAL_BUILD) } catch (_) {}
  // Clean up any leftover .old files from previous locked builds
  for (const f of fs.readdirSync(BIN_DIR)) {
    if (f.endsWith('.old')) {
      try { fs.unlinkSync(path.join(BIN_DIR, f)) } catch (_) {}
    }
  }
  // Remove legacy DLLs no longer needed with go-webview2
  for (const dll of ['webview.dll', 'WebView2Loader.dll']) {
    const dllPath = path.join(BIN_DIR, dll)
    unlinkRetry(dllPath)
  }
}

function unlinkRetry (filePath, retries = 10, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    if (!fs.existsSync(filePath)) return
    try {
      fs.unlinkSync(filePath)
      return
    } catch (err) {
      if (err.code === 'EBUSY' && i < retries - 1) {
        // Try rename-then-delete — renaming often succeeds when unlink can't
        const tmp = filePath + '.old.' + Date.now()
        try {
          fs.renameSync(filePath, tmp)
          try { fs.unlinkSync(tmp) } catch (_) { /* will be cleaned up next build */ }
          return
        } catch (_) { /* rename also failed, wait and retry */ }
        console.log(`File locked, retrying in ${delayMs}ms: ${path.basename(filePath)}`)
        const end = Date.now() + delayMs
        while (Date.now() < end) { /* busy-wait */ }
      } else {
        throw err
      }
    }
  }
}

async function build () {
  if (DEBUG_CONSOLE) {
    // Build that opens console output to a terminal
    execSync(`cd src/app && go build -o "${APP_UNOPTIMIZED_BUILD}"`, { stdio: 'inherit' })
  } else {
    execSync(`cd src/app && go build -ldflags="-H windowsgui -s -w" -o "${APP_UNOPTIMIZED_BUILD}"`, { stdio: 'inherit' })
  }

  // Inject icon and version info before UPX compression.
  // resedit reorganizes PE sections, which corrupts UPX-compressed binaries,
  // so metadata must be applied to the uncompressed binary first.
  injectMetadata(APP_UNOPTIMIZED_BUILD, APP_VERSION_INFO, APP_ICON)

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
  // If the final exe is locked (e.g. by Windows Defender real-time scanning),
  // retry with increasing delays — Defender typically releases within 30-60s.
  const maxAttempts = 20
  const delayMs = 3000
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.copyFileSync(APP_OPTIMIZED_BUILD, APP_FINAL_BUILD)
      return postCopy()
    } catch (err) {
      if (err.code !== 'EBUSY' || attempt === maxAttempts) {
        console.error(
          '\nBuild failed: "DAEDALUS Terminal.exe" is locked by another process.\n' +
          'This is usually caused by Windows Defender scanning the file.\n' +
          'Try one of:\n' +
          '  1. Wait a minute and run the build again\n' +
          '  2. Add the build\\bin folder to Windows Defender exclusions\n' +
          '  3. Temporarily disable real-time protection\n'
        )
        process.exit(1)
      }
      if (attempt === 1) console.log('Final exe locked (likely Windows Defender) — waiting for release…')
      process.stdout.write(`  Attempt ${attempt}/${maxAttempts} (waiting ${delayMs / 1000}s)…\r`)
      const end = Date.now() + delayMs
      while (Date.now() < end) { /* busy-wait */ }
    }
  }
}

function postCopy () {
  fs.copyFileSync(APP_ICON, path.join(BIN_DIR, 'icon.ico'))
}
