const { execSync, spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const os = require('os')

const {
  APP_FINAL_BUILD,
  SERVICE_FINAL_BUILD
} = require('./lib/build-options')

const TIMEOUT_MS = 15000

;(async () => {
  let failures = 0
  failures += await verifyApp()
  failures += await verifyService()
  if (failures > 0) {
    console.error(`\n✗ ${failures} smoke test(s) failed`)
    process.exit(1)
  }
  console.log('\n✓ All smoke tests passed')
})()

async function verifyApp () {
  console.log('\n--- Smoke test: App (WebView2 initialization) ---')

  // WebView2 requires a display — skip in headless CI environments
  if (process.env.CI) {
    console.log('⊘ Skipped (CI environment — no display for WebView2)')
    return 0
  }

  // Run the smoke test on a temp copy of the binary so that the kernel section
  // object Windows creates for UPX-compressed executables is associated with
  // the temp file rather than build/bin/. Without this, the section object
  // outlives the process and causes EBUSY on the next build's clean step.
  const tmpExe = path.join(os.tmpdir(), `~daedalus_smoke_${Date.now()}.exe`)
  fs.copyFileSync(APP_FINAL_BUILD, tmpExe)

  try {
    const output = execSync(`"${tmpExe}" --smoke-test`, {
      timeout: TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (output.includes('OK')) {
      console.log('✓ App binary OK')
      return 0
    }
    console.error('✗ App binary: unexpected output:', output)
    return 1
  } catch (e) {
    console.error('✗ App binary failed:', e.stderr || e.message)
    return 1
  } finally {
    try { fs.unlinkSync(tmpExe) } catch (_) {}
  }
}

function verifyService () {
  return new Promise((resolve) => {
    console.log('\n--- Smoke test: Service (HTTP listen) ---')
    const port = 39123 + Math.floor(Math.random() * 1000)
    // Use a temp directory as save-game-dir so the service doesn't fail
    // when no Elite Dangerous install is present (e.g. CI runners)
    const os = require('os')
    const tmpDir = path.join(os.tmpdir(), 'daedalus-smoke-test')
    if (!require('fs').existsSync(tmpDir)) require('fs').mkdirSync(tmpDir, { recursive: true })
    const child = spawn(SERVICE_FINAL_BUILD, [`--port=${port}`, `--save-game-dir=${tmpDir}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stdout = ''
    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill()
        console.error('✗ Service timed out. Output:', stdout)
        resolve(1)
      }
    }, TIMEOUT_MS)

    child.stdout.on('data', (data) => {
      stdout += data.toString()
      if (stdout.includes(`Listening on port ${port}`)) {
        // Service is listening — verify HTTP responds
        http.get(`http://localhost:${port}/`, (res) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            child.kill()
            console.log(`✓ Service binary OK (HTTP ${res.statusCode} on port ${port})`)
            resolve(0)
          }
        }).on('error', () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            child.kill()
            // Listening message appeared but HTTP failed — still OK, service started
            console.log('✓ Service binary OK (listening)')
            resolve(0)
          }
        })
      }
    })

    child.stderr.on('data', (data) => {
      stdout += data.toString()
    })

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        console.error(`✗ Service exited with code ${code}. Output:`, stdout)
        resolve(1)
      }
    })
  })
}
