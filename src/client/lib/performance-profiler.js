/**
 * Client-side performance profiler for DAEDALUS Terminal.
 *
 * Tracks page navigations, WebSocket request/response round-trips,
 * frame rate (via rAF), and long-running tasks (via PerformanceObserver).
 *
 * Usage — enabled via browser console:
 *   window.__perf.start()   - begin recording
 *   window.__perf.stop()    - stop recording
 *   window.__perf.report()  - print summary to console and return as string
 *   window.__perf.clear()   - discard all recorded entries
 *   window.__perf.entries   - raw array of all recorded entries
 */

const MAX_ENTRIES = 5000

let recording = false
let entries = []
let rafHandle = null
let longTaskObserver = null

// Frame-rate sampling state
let frameCount = 0
let frameSampleStart = 0
const FPS_SAMPLE_INTERVAL_MS = 1000 // report an FPS entry every second

// ─── Entry helpers ──────────────────────────────────────────────────────────

function record (type, data) {
  if (!recording) return
  if (entries.length >= MAX_ENTRIES) entries.shift()
  entries.push({
    type,
    ts: performance.now().toFixed(1),
    wall: new Date().toISOString(),
    ...data
  })
}

// ─── Frame-rate tracker ─────────────────────────────────────────────────────

function rafLoop (now) {
  frameCount++
  if (now - frameSampleStart >= FPS_SAMPLE_INTERVAL_MS) {
    const fps = Math.round((frameCount * 1000) / (now - frameSampleStart))
    record('fps', { fps })
    frameCount = 0
    frameSampleStart = now
  }
  rafHandle = requestAnimationFrame(rafLoop)
}

// ─── Navigation tracker (Next.js router) ────────────────────────────────────

let navigationStart = null
let navigationFrom = null

function onRouteChangeStart (url) {
  navigationStart = performance.now()
  navigationFrom = window.location.pathname + window.location.search
  record('nav-start', { from: navigationFrom, to: url })
}

function onRouteChangeComplete (url) {
  const duration = navigationStart != null
    ? (performance.now() - navigationStart).toFixed(1)
    : null
  record('nav-end', { from: navigationFrom || '(unknown)', to: url, ms: duration })
  navigationStart = null
  navigationFrom = null
}

// ─── WebSocket instrumentation ──────────────────────────────────────────────

let wsPatchApplied = false

function patchWebSocket () {
  if (wsPatchApplied) return
  wsPatchApplied = true

  // Patch WebSocket.prototype.send — intercepts ALL instances (past & future).
  // This works because socket.js's connect() hasn't been called yet at import
  // time; it runs later when the React SocketProvider mounts.
  const origSend = WebSocket.prototype.send
  WebSocket.prototype.send = function (data) {
    try {
      const parsed = JSON.parse(data)
      if (parsed.requestId) {
        record('ws-send', { name: parsed.name, requestId: parsed.requestId })
      }
    } catch (_) { /* non-JSON sends are fine */ }
    return origSend.call(this, data)
  }

  // Patch the onmessage property descriptor on the prototype so that when
  // socket.js sets `socket.onmessage = handler`, our wrapper intercepts
  // incoming messages before the original handler runs.
  const origDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    set (handler) {
      const wrapped = function (event) {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.requestId) {
            record('ws-recv', { name: parsed.name, requestId: parsed.requestId })
          }
        } catch (_) { /* ignore non-JSON */ }
        return handler.call(this, event)
      }
      origDesc.set.call(this, wrapped)
    },
    get () {
      return origDesc.get.call(this)
    },
    configurable: true
  })
}

function unpatchWebSocket () {
  // Prototype patches persist for the page lifetime; no-op here.
}

// ─── Long-task observer ─────────────────────────────────────────────────────

function startLongTaskObserver () {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record('long-task', { ms: entry.duration.toFixed(1), name: entry.name })
      }
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  } catch (_) { /* longtask not supported in all browsers */ }
}

function stopLongTaskObserver () {
  if (longTaskObserver) {
    longTaskObserver.disconnect()
    longTaskObserver = null
  }
}

// ─── Report generation ──────────────────────────────────────────────────────

function generateReport () {
  if (entries.length === 0) return 'No profiler entries recorded. Call window.__perf.start() first.'

  const lines = []
  lines.push('=== DAEDALUS Performance Report ===')
  lines.push(`Entries: ${entries.length}`)
  lines.push(`Period: ${entries[0].wall} → ${entries[entries.length - 1].wall}`)
  lines.push('')

  // FPS summary
  const fpsEntries = entries.filter(e => e.type === 'fps')
  if (fpsEntries.length > 0) {
    const fpsList = fpsEntries.map(e => e.fps)
    const avg = (fpsList.reduce((a, b) => a + b, 0) / fpsList.length).toFixed(0)
    const min = Math.min(...fpsList)
    const max = Math.max(...fpsList)
    const p1 = fpsList.sort((a, b) => a - b)[Math.floor(fpsList.length * 0.01)] || min
    lines.push(`FPS  avg=${avg}  min=${min}  max=${max}  1%low=${p1}  samples=${fpsList.length}`)
  }

  // Navigation timings
  const navEntries = entries.filter(e => e.type === 'nav-end')
  if (navEntries.length > 0) {
    lines.push('')
    lines.push('--- Page Navigations ---')
    for (const e of navEntries) {
      lines.push(`  ${e.from} → ${e.to}  ${e.ms}ms`)
    }
  }

  // WS request/response pairing
  const wsSends = entries.filter(e => e.type === 'ws-send')
  const wsRecvs = entries.filter(e => e.type === 'ws-recv')
  if (wsSends.length > 0) {
    lines.push('')
    lines.push('--- WebSocket Round-Trips ---')
    const rtts = []
    for (const send of wsSends) {
      const recv = wsRecvs.find(r => r.requestId === send.requestId)
      const rtt = recv ? (parseFloat(recv.ts) - parseFloat(send.ts)).toFixed(1) : 'pending'
      if (recv) rtts.push(parseFloat(rtt))
      lines.push(`  ${send.name}  ${rtt}ms  [${send.requestId}]`)
    }
    if (rtts.length > 0) {
      const avg = (rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(1)
      const max = Math.max(...rtts).toFixed(1)
      lines.push(`  Summary: ${rtts.length} responses, avg=${avg}ms, max=${max}ms`)
    }
  }

  // Long tasks
  const longTasks = entries.filter(e => e.type === 'long-task')
  if (longTasks.length > 0) {
    lines.push('')
    lines.push('--- Long Tasks (>50ms) ---')
    for (const e of longTasks) {
      lines.push(`  ${e.ms}ms at ${e.wall}`)
    }
  }

  lines.push('')
  lines.push('=== End Report ===')
  return lines.join('\n')
}

// ─── Public API ─────────────────────────────────────────────────────────────

function start () {
  if (recording) {
    console.log('[perf] Already recording.')
    return
  }
  recording = true
  frameCount = 0
  frameSampleStart = performance.now()
  rafHandle = requestAnimationFrame(rafLoop)
  startLongTaskObserver()

  // Hook into Next.js router if available
  try {
    const { Router } = require('next/router')
    Router.events.on('routeChangeStart', onRouteChangeStart)
    Router.events.on('routeChangeComplete', onRouteChangeComplete)
  } catch (_) { /* not in Next.js context */ }

  record('profiler', { action: 'started' })
  console.log('[perf] Recording started. Use window.__perf.stop() to stop, window.__perf.report() to view.')
}

function stop () {
  if (!recording) {
    console.log('[perf] Not currently recording.')
    return
  }
  record('profiler', { action: 'stopped' })
  recording = false

  if (rafHandle) {
    cancelAnimationFrame(rafHandle)
    rafHandle = null
  }
  stopLongTaskObserver()

  try {
    const { Router } = require('next/router')
    Router.events.off('routeChangeStart', onRouteChangeStart)
    Router.events.off('routeChangeComplete', onRouteChangeComplete)
  } catch (_) {}

  console.log(`[perf] Stopped. ${entries.length} entries recorded. Use window.__perf.report() to view.`)
}

function report () {
  const text = generateReport()
  console.log(text)
  return text
}

function clear () {
  entries = []
  console.log('[perf] Entries cleared.')
}

// ─── Auto-install on window ────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  patchWebSocket()
  window.__perf = { start, stop, report, clear, get entries () { return entries } }
}

module.exports = { start, stop, report, clear }
