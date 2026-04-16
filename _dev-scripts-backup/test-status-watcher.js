#!/usr/bin/env node
/**
 * test-status-watcher.js — Measures how quickly we can detect Status.json changes.
 *
 * Tests three tiers:
 *   1. @parcel/watcher (native ReadDirectoryChangesW)
 *   2. fs.watch()
 *   3. fs.watchFile() polling (100ms)
 *
 * Run while on foot or in ship — the game writes Status.json on every
 * position/heading change.  The script logs the latency between the file's
 * mtime and when we read the new data.
 *
 * Usage:
 *   node _dev-scripts-backup/test-status-watcher.js [journal-dir]
 *
 * If journal-dir is omitted it defaults to:
 *   %USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const dir = process.argv[2] || path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous')
const statusPath = path.join(dir, 'Status.json')

if (!fs.existsSync(statusPath)) {
  console.error(`Status.json not found at: ${statusPath}`)
  console.error('Pass the journal directory as an argument, or ensure Elite Dangerous is running.')
  process.exit(1)
}

// ── Shared state ──
let lastContent = ''
let lastMtime = 0
const results = { native: [], fsWatch: [], fsPoll: [] }
const startTime = Date.now()
const TEST_DURATION_MS = 30_000 // run for 30 seconds

function readStatus () {
  try {
    const raw = fs.readFileSync(statusPath, 'utf8')
    const stat = fs.statSync(statusPath)
    return { raw, mtime: stat.mtimeMs }
  } catch { return null }
}

function extractPosition (raw) {
  try {
    const j = JSON.parse(raw)
    return { lat: j.Latitude, lon: j.Longitude, heading: j.Heading, alt: j.Altitude }
  } catch { return null }
}

// ── Tier 1: @parcel/watcher ──
async function testNativeWatcher () {
  let parcelWatcher
  try {
    parcelWatcher = require('@parcel/watcher')
  } catch {
    // Try loading from beside the exe (pkg build)
    const exeDir = path.dirname(process.execPath)
    const watcherPath = path.join(exeDir, 'watcher.node')
    if (fs.existsSync(watcherPath)) {
      const binding = require(watcherPath)
      const { createWrapper } = require('@parcel/watcher/wrapper')
      parcelWatcher = createWrapper(binding)
    } else {
      console.log('[native] @parcel/watcher not available — skipping.')
      return
    }
  }

  let updates = 0
  const sub = await parcelWatcher.subscribe(dir, (err, events) => {
    if (err) return
    const now = Date.now()
    for (const ev of events) {
      if (path.basename(ev.path) !== 'Status.json') continue
      const data = readStatus()
      if (!data || data.raw === lastContent) continue
      lastContent = data.raw
      const latency = now - data.mtime
      results.native.push(latency)
      updates++
      const pos = extractPosition(data.raw)
      if (pos?.lat != null) {
        process.stdout.write(`\r[native] #${updates}  latency: ${latency.toFixed(0)}ms  lat: ${pos.lat?.toFixed(4)}  lon: ${pos.lon?.toFixed(4)}  hdg: ${pos.heading}     `)
      }
    }
  })

  console.log('[native] @parcel/watcher subscribed — waiting for Status.json changes...')
  return { label: 'native', unsub: () => sub.unsubscribe() }
}

// ── Tier 2: fs.watch() ──
function testFsWatch () {
  let updates = 0
  let debounce = null
  const watcher = fs.watch(statusPath, (eventType) => {
    if (eventType !== 'change') return
    if (debounce) return
    debounce = setTimeout(() => { debounce = null }, 10) // minimal debounce to avoid double-fires
    const now = Date.now()
    const data = readStatus()
    if (!data || data.raw === lastContent) return
    lastContent = data.raw
    const latency = now - data.mtime
    results.fsWatch.push(latency)
    updates++
    const pos = extractPosition(data.raw)
    if (pos?.lat != null) {
      process.stdout.write(`\r[fs.watch] #${updates}  latency: ${latency.toFixed(0)}ms  lat: ${pos.lat?.toFixed(4)}  lon: ${pos.lon?.toFixed(4)}  hdg: ${pos.heading}     `)
    }
  })

  console.log('[fs.watch] Watching Status.json...')
  return { label: 'fs.watch', unsub: () => watcher.close() }
}

// ── Tier 3: fs.watchFile() polling (100ms) ──
function testFsPoll () {
  let updates = 0
  const handler = (curr) => {
    const now = Date.now()
    const data = readStatus()
    if (!data || data.raw === lastContent) return
    lastContent = data.raw
    const latency = now - data.mtime
    results.fsPoll.push(latency)
    updates++
    const pos = extractPosition(data.raw)
    if (pos?.lat != null) {
      process.stdout.write(`\r[fs.poll] #${updates}  latency: ${latency.toFixed(0)}ms  lat: ${pos.lat?.toFixed(4)}  lon: ${pos.lon?.toFixed(4)}  hdg: ${pos.heading}     `)
    }
  }

  fs.watchFile(statusPath, { interval: 100 }, handler)
  console.log('[fs.poll] watchFile polling at 100ms...')
  return { label: 'fs.poll', unsub: () => fs.unwatchFile(statusPath, handler) }
}

// ── Summary ──
function summarise (label, latencies) {
  if (latencies.length === 0) {
    console.log(`  ${label}: no updates detected`)
    return
  }
  const sorted = [...latencies].sort((a, b) => a - b)
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
  const p50 = sorted[Math.floor(sorted.length * 0.5)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const rate = (latencies.length / (TEST_DURATION_MS / 1000)).toFixed(1)
  console.log(`  ${label}: ${latencies.length} updates (${rate}/s)  avg: ${avg.toFixed(0)}ms  p50: ${p50.toFixed(0)}ms  p95: ${p95.toFixed(0)}ms  min: ${min.toFixed(0)}ms  max: ${max.toFixed(0)}ms`)
}

// ── Main ──
async function main () {
  console.log(`\nStatus.json watcher latency test`)
  console.log(`Directory: ${dir}`)
  console.log(`Duration: ${TEST_DURATION_MS / 1000}s — move around in-game to generate position updates.\n`)

  // Pick which tier to test — run only one at a time for clean measurements.
  // Default: test all sequentially (10s each)
  const cleanups = []

  // Test native first
  const native = await testNativeWatcher()
  if (native) cleanups.push(native)

  // Test fs.watch
  const watch = testFsWatch()
  cleanups.push(watch)

  // Test fs.poll
  const poll = testFsPoll()
  cleanups.push(poll)

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION_MS))

  // Cleanup
  for (const c of cleanups) c.unsub()

  console.log('\n\n── Results ──')
  summarise('native (@parcel/watcher)', results.native)
  summarise('fs.watch', results.fsWatch)
  summarise('fs.watchFile(100ms)', results.fsPoll)
  console.log()
}

main().catch(console.error)
