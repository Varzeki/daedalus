const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { glob } = require('glob')
const retry = require('async-retry')
const Datastore = require('nedb-promises')
const db = new Datastore()

// Do not fire log events for these event types
const INGORED_EVENT_TYPES = [
  'Music'
]

// Override PERSISTED_EVENT_TYPES to persist all events to DB (for testing)
const PERSIST_ALL_EVENTS = true

// These events will be persisted to the database
// (for all other events, only the most recent copy will be retained in memory)
const PERSISTED_EVENT_TYPES = [
  'FSSBodySignals',
  'FSSDiscoveryScan',
  'FSSSignalDiscovered'
]

class EliteLog {
  constructor(dir) {
    this.dir = dir || null
    this.files = {} // All log files found
    this.lastActiveLogFileName = null
    this.lastActiveTimestamp = null
    this.loadFileCallback = null
    this.logEventCallback = null
    this.singleInstanceEvents = {}
    this.numberOfEventsImported = 0
    this._fullLoadComplete = false
    this._fullLoadInProgress = false
    this._fullLoadPromise = null

    // setInterval(() => {
    //   const numberOfFilesBeingWatched = Object.entries(this.files)
    //     .filter(obj => {
    //       const [fileName, file] = obj
    //       return file.watch !== false
    //     }).length

    //   console.log(`events: ${this.numberOfEventsImported}\tmost recent event: ${this.lastActiveTimestamp}\tfiles watched: ${numberOfFilesBeingWatched}`)
    // }, 2000)

    return this
  }

  async clear() {
    await db.remove({}, { multi: true })
  }

  // Get all log entries
  async load({ 
    file = null, // Load a particular file (used internally when file changes)
    days = null, // Days since last activity to load (if null, load all events)
    reload = false // Attempt to reload all events if they are older (safe, won't result in duplicates)
  } = {}) {
    let logs = []
    // If file specified, load logs from that file, otherwise load all files
    const files = file ? [file] : await this.#getFiles()

    // Only determine a minimum timestamp if number of days specified and on
    // first run (this.lastActiveTimestamp will not be null if any events
    // have actually been imported already).
    let minTimestamp = null
    if (days !== null && !this.lastActiveTimestamp) {
      let oldestTimestamp = null
      let newestTimestamp = null
      for (const file of files) {
        await retry(() => { // Auto-retry on failure (write in progress)
          const rawLog = fs.readFileSync(file.name).toString()
          const logs = this.#parse(rawLog)
          for (const log of logs) {
            if (!newestTimestamp || (Date.parse(log.timestamp) > Date.parse(newestTimestamp)))
              newestTimestamp = log.timestamp

            if (!oldestTimestamp || (Date.parse(log.timestamp) < Date.parse(oldestTimestamp)))
              oldestTimestamp = log.timestamp
          }
        }, {
          retries: 10
        })
      }
      
      // Store in human readable timestamp for easier debugging
      // (performance impact is minimal)
      if (newestTimestamp) { // Conditonal to suppress errors when no data loaded
        minTimestamp = new Date(Date.parse(newestTimestamp) - days * 24 * 60 * 60 * 1000).toISOString()
      }
    }

    for (const file of files) {
      // Skip old files that haven't been modified since minTimestamp
      if (minTimestamp && Date.parse(minTimestamp) > Date.parse(file.lastModified)) continue

      // If any step fails (e.g if trying read and parse while being written)
      // then is automatically retried with this function.
      //
      // There is no error handling here, but the function has exponential
      // backoff and while single failures are quite common more than one
      // retry is extremely rare.
      await retry(() => {
        const rawLog = fs.readFileSync(file.name).toString()
        const parsedLog = this.#parse(rawLog)
        logs = logs.concat(parsedLog) // Add new log entries to existing logs
        file.lineCount = parsedLog.length // Use actual parsed count (not file-size estimate)
        if (this.loadFileCallback) this.loadFileCallback(file)
      }, {
        retries: 10
      })
    }

    // If a minimum timestamp was specified, use it to filter what is loaded
    if (minTimestamp) {
      logs = logs.filter(log => (Date.parse(log.timestamp) > Date.parse(minTimestamp)))
    }

    // If lastActiveTimestamp has been set, this function has been run at
    // least once already. We can use it to discard old log files without
    // spending more time on them. Overriden by reload argument.
    if (this.lastActiveTimestamp && reload !== true) {
      logs = logs.filter(log => (Date.parse(log.timestamp) > Date.parse(this.lastActiveTimestamp)))
    }

    const logsIngested = await this.#processLogs(logs)
    return logsIngested
  }

  // Ensures all historical journal data is loaded (not just the
  // initial N-day window). Safe to call multiple times — only
  // performs the reload once. Suppresses event callbacks during
  // backfill so historical events don't flood connected clients.
  // Returns a promise that resolves when the backfill is complete.
  ensureFullLoad () {
    if (this._fullLoadPromise) return this._fullLoadPromise
    this._fullLoadInProgress = true
    this._fullLoadPromise = (async () => {
      const savedCallback = this.logEventCallback
      this.logEventCallback = null
      try {
        await this.load({ reload: true })
      } finally {
        this.logEventCallback = savedCallback
        this._fullLoadInProgress = false
        this._fullLoadComplete = true
      }
    })()
    return this._fullLoadPromise
  }

  get isFullLoadComplete () {
    return this._fullLoadComplete
  }

  get isFullLoadInProgress () {
    return this._fullLoadInProgress
  }

  stats() {
    return {
      numberOfEventsImported: this.numberOfEventsImported,
      mostRecentEventTimestamp: this.lastActiveTimestamp,
      lastActivity: this.lastActiveTimestamp,
      files: this.files
    }
  }

  async count() {
    return await db.count({})
  }

  async getNewest(count) {
    if (count) {
      return await db.find({}).sort({ timestamp: -1 }).limit(count)
    } else {
      return await db.findOne({}).sort({ timestamp: -1 })
    }
  }

  async getOldest(count) {
    if (count) {
      return await db.find({}).sort({ timestamp: 1 }).limit(count)
    } else {
      return await db.findOne({}).sort({ timestamp: 1 })
    }
  }

  async getFromTimestamp(timestamp = new Date().toUTCString(), count = 100) {
    return await db.find({ "timestamp": { $gt: timestamp } }).sort({ timestamp: -1 }).limit(count)
  }

  async getEvent(event) {
    return (await this.getEvents(event, 1))[0]
  }

  async getEvents(event, count = 0) {
    // For single instance events, return single copy we are holding in memory
    if (this.singleInstanceEvents[event]) {
      return [this.singleInstanceEvents[event]]
    }
    try {
      let result
      if (count > 0) {
        result = await db.find({ event }).sort({ timestamp: -1 }).limit(count)
      } else {
        result = await db.find({ event }).sort({ timestamp: -1 })
      }
      return result
    } catch (e) {
      console.error(`getEvents('${event}') error:`, e.message)
      throw e
    }
  }

  async getEventsFromTimestamp(event, timestamp = new Date().toUTCString, count = 0) {
    // For single instance events, return single copy we are holding in memory
    if (this.singleInstanceEvents[event]) return [this.singleInstanceEvents[event]]
    if (count > 0) {
      return await db.find({ event, "timestamp": { $gt: timestamp } }).sort({ timestamp: -1 }).limit(count)
    } else {
      return await db.find({ event, "timestamp": { $gt: timestamp } }).sort({ timestamp: -1 })
    }
  }

  // Escape hatch for complex queries
  async _query(queryString, count = 0, sort = { timestamp: -1 }) {
    if (count > 0) {
      return await db.find(queryString).sort(sort).limit(count)
    } else {
      return await db.find(queryString).sort(sort)
    }
  }


  async getEventTypes() {
    const logs = await db.find()
    const eventTypes = []
    for (const log of logs) {
      if (!eventTypes.includes(log.event)) eventTypes.push(log.event)
    }
    return eventTypes
  }

  watch(callback) {
    // Three-tier fallback for journal file watching:
    //   1. @parcel/watcher native addon  (~5-10ms latency)
    //   2. fs.watch() hybrid + polling safety net (~0-100ms when watch fires, 500ms fallback)
    //   3. fs.watchFile() polling only (250ms)
    this.#startNativeWatch(callback).catch((e) => {
      console.log('Native watcher unavailable:', e.message ?? e)
      this.#startHybridWatch(callback).catch((e2) => {
        console.log('Hybrid fs.watch unavailable:', e2.message ?? e2)
        this.#watchPollingOnly(callback)
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Shared incremental reader — manages per-file read offsets and parses new
  // JSON lines appended since the last read. Used by all three watcher tiers.
  // ---------------------------------------------------------------------------
  #createIncrementalReader (callback) {
    const readState = new Map()

    const getState = (filePath) => {
      const key = path.resolve(filePath)
      if (!readState.has(key)) {
        let offset = 0
        try { offset = fs.statSync(filePath).size } catch (e) {}
        readState.set(key, { path: filePath, offset, partial: '', busy: false })
      }
      return readState.get(key)
    }

    const readNewData = async (filePath) => {
      const state = getState(filePath)
      if (state.busy) return
      state.busy = true
      try {
        const stats = fs.statSync(filePath)
        if (stats.size === state.offset) return
        if (stats.size < state.offset) {
          state.offset = 0
          state.partial = ''
        }

        const bytesToRead = stats.size - state.offset
        const buffer = Buffer.alloc(bytesToRead)
        const fd = fs.openSync(filePath, 'r')
        try {
          fs.readSync(fd, buffer, 0, bytesToRead, state.offset)
        } finally {
          fs.closeSync(fd)
        }

        const newData = state.partial + buffer.toString()
        const lines = newData.split('\n')
        state.partial = lines.pop()

        const newLogs = []
        for (const line of lines) {
          try { newLogs.push(JSON.parse(line)) } catch (e) {}
        }
        state.offset = stats.size

        if (newLogs.length > 0) {
          const ingested = await this.#processLogs(newLogs)
          if (callback) ingested.forEach(log => callback(log))
        }
      } catch (e) {
        console.error('Error reading journal incrementally:', e)
      } finally {
        state.busy = false
      }
    }

    const resetFile = (filePath) => {
      const key = path.resolve(filePath)
      readState.set(key, { path: filePath, offset: 0, partial: '', busy: false })
    }

    return { getState, readNewData, resetFile }
  }

  // Helper: initialise reader state for all existing journal files and track
  // the active log file.
  async #initReaderState (reader) {
    const files = await this.#getFiles()
    for (const file of files) {
      if (!this.files[file.name]) this.files[file.name] = file
      reader.getState(file.name)
    }
    if (files.length > 0) {
      this.lastActiveLogFileName = files.sort((a, b) => b.lastModified - a.lastModified)[0].name
    }
    return files
  }

  // Helper: start a periodic safety-net scan that catches missed events and
  // detects new journal files.
  #startSafetyNet (reader, intervalMs = 1000) {
    this.watchFilesInterval = setInterval(async () => {
      const files = await this.#getFiles()
      if (files.length === 0) return
      const activeLogFile = files.sort((a, b) => b.lastModified - a.lastModified)[0]
      this.lastActiveLogFileName = activeLogFile.name
      for (const file of files) {
        if (!this.files[file.name]) this.files[file.name] = file
      }
      reader.readNewData(activeLogFile.name)
    }, intervalMs)
  }

  // ---------------------------------------------------------------------------
  // Tier 1: Native watcher — uses @parcel/watcher with ReadDirectoryChangesW
  // on Windows for near-instant file change detection (~5-10ms latency).
  // ---------------------------------------------------------------------------
  async #startNativeWatch (callback) {
    const parcelWatcher = require('@parcel/watcher')
    const reader = this.#createIncrementalReader(callback)
    await this.#initReaderState(reader)

    this._nativeSubscription = await parcelWatcher.subscribe(this.dir, (err, events) => {
      if (err) { console.error('Native watcher error:', err); return }
      for (const event of events) {
        if (event.type !== 'update' && event.type !== 'create') continue
        const basename = path.basename(event.path)
        if (!/^Journal\..+\.log$/.test(basename)) continue

        this.lastActiveLogFileName = event.path
        if (event.type === 'create') reader.resetFile(event.path)
        reader.readNewData(event.path)
      }
    })

    console.log('Using native file watcher for journal detection')
    this.#startSafetyNet(reader)
  }

  // ---------------------------------------------------------------------------
  // Tier 2: Hybrid watcher — uses fs.watch() for near-instant notification
  // with a 500ms fs.watchFile() polling safety net to catch missed events.
  // fs.watch() uses OS-level ReadDirectoryChangesW on Windows but can
  // sometimes miss events for append-only files; the polling backstop
  // ensures nothing is lost.
  // ---------------------------------------------------------------------------
  async #startHybridWatch (callback) {
    const reader = this.#createIncrementalReader(callback)
    await this.#initReaderState(reader)

    // Track which file we're currently watching with fs.watch
    let activeWatcher = null
    let activePollWatcher = null
    let activeFileName = null

    const attachToFile = (filePath) => {
      if (filePath === activeFileName) return
      // Clean up previous watchers
      if (activeWatcher) { activeWatcher.close(); activeWatcher = null }
      if (activePollWatcher) { fs.unwatchFile(activeFileName, activePollWatcher); activePollWatcher = null }

      activeFileName = filePath
      this.lastActiveLogFileName = filePath

      // Primary: fs.watch for instant notification
      try {
        activeWatcher = fs.watch(filePath, { persistent: false }, (eventType) => {
          if (eventType === 'change') reader.readNewData(filePath)
        })
        activeWatcher.on('error', () => {
          // Silently ignore — the polling safety net will pick up any changes
        })
      } catch (e) {
        // fs.watch failed to attach — rely on polling alone
      }

      // Safety net: poll to catch anything fs.watch misses
      activePollWatcher = fs.watchFile(
        filePath,
        { interval: 100 },
        (curr) => {
          reader.readNewData(filePath)
        }
      )
    }

    // Attach to the current active journal file
    if (this.lastActiveLogFileName) {
      attachToFile(this.lastActiveLogFileName)
    }

    console.log('Using hybrid fs.watch + polling fallback for journal detection')

    // Periodically check for new journal files (log rotation)
    this.watchFilesInterval = setInterval(async () => {
      const files = await this.#getFiles()
      if (files.length === 0) return
      const activeLogFile = files.sort((a, b) => b.lastModified - a.lastModified)[0]
      for (const file of files) {
        if (!this.files[file.name]) this.files[file.name] = file
      }
      // If active file changed (rotation), switch watchers
      attachToFile(activeLogFile.name)
      // Also trigger a read in case the poll hasn't fired yet
      reader.readNewData(activeLogFile.name)
    }, 10 * 1000)
  }

  // ---------------------------------------------------------------------------
  // Tier 3: Polling-only watcher — uses fs.watchFile with 250ms polling.
  // Last-resort fallback when both native and fs.watch are unavailable.
  // ---------------------------------------------------------------------------
  #watchPollingOnly (callback) {
    console.log('Using polling-only fallback for journal detection (100ms)')
    const watchFiles = async () => {
      const files = await this.#getFiles()
      if (files.length === 0) return

      const activeLogFile = files.sort((a, b) => b.lastModified - a.lastModified)[0]
      this.lastActiveLogFileName = activeLogFile.name

      for (const file of files) {
        if (!this.files[file.name])
          this.files[file.name] = file

        if (!this.files[file.name].watch && file.name === activeLogFile.name)
          this.files[file.name].watch = this.#watchFilePoll(file, callback)
      }

      for (const fileName in this.files) {
        const file = this.files[fileName]
        if (file.watch && fileName !== activeLogFile.name) {
          const logs = await this.load({ file })
          if (callback) logs.map(log => callback(log))
          fs.unwatchFile(fileName, file.watch)
          file.watch = false
        }
      }
    }

    watchFiles()
    this.watchFilesInterval = setInterval(() => { watchFiles() }, 10 * 1000)
  }

  #watchFilePoll (file, callback) {
    // Uses incremental reading: only reads new bytes appended since the last
    // read, rather than re-reading the entire file each poll. This reduces
    // disk I/O from potentially hundreds of MB/sec to just a few bytes.
    let lastReadOffset = 0
    let partialLine = ''
    let processing = false

    // Set initial offset to current file size — historical data has already
    // been loaded by the initial load() call, so we only want new events.
    try {
      lastReadOffset = fs.statSync(file.name).size
    } catch (e) { /* file may not exist yet */ }

    return fs.watchFile(
      file.name,
      { interval: 100 },
      async (curr, prev) => {
        // curr/prev are fs.Stats objects from fs.watchFile
        if (!curr || curr.size === lastReadOffset) return // No new data
        if (processing) return // Previous read still being processed
        processing = true

        try {
          if (curr.size < lastReadOffset) {
            // File was truncated or rotated — reset and read from start
            lastReadOffset = 0
            partialLine = ''
          }

          const bytesToRead = curr.size - lastReadOffset
          const buffer = Buffer.alloc(bytesToRead)
          const fd = fs.openSync(file.name, 'r')
          try {
            fs.readSync(fd, buffer, 0, bytesToRead, lastReadOffset)
          } finally {
            fs.closeSync(fd)
          }

          const newData = partialLine + buffer.toString()
          const lines = newData.split('\n')

          // Last element may be an incomplete line still being written
          partialLine = lines.pop()

          const newLogs = []
          for (const line of lines) {
            try {
              newLogs.push(JSON.parse(line))
            } catch (e) {
              // Skip unparseable lines (blank lines, partial writes, etc.)
            }
          }

          lastReadOffset = curr.size

          if (newLogs.length > 0) {
            const ingestedLogs = await this.#processLogs(newLogs)
            if (callback) ingestedLogs.map(log => callback(log))
          }
        } catch (e) {
          console.error('Error reading journal incrementally:', e)
        } finally {
          processing = false
        }
      }
    )
  }

  // Process and ingest parsed log entries — handles checksums, deduplication,
  // database persistence, single-instance events, and callbacks.
  async #processLogs(logs) {
    await db.ensureIndex({ fieldName: '_checksum', unique: true })

    const logsIngested = []
    for (const log of logs) {
      this.numberOfEventsImported++

      let logIngested = false
      const eventName = log.event
      const eventTimestamp = log.timestamp

      // Generate unique checksum for each message to avoid duplicates.
      // This is also useful for clients who receive new event log entries
      // so they can ignore events they have seen before (e.g. after a reload)
      log._checksum = this.#checksum(JSON.stringify(log))

      // Keep track of the most recent timestamp seen across all logs
      // (so when we are called again can skip over logs we've already seen)
      if (!this.lastActiveTimestamp)
        this.lastActiveTimestamp = eventTimestamp

      if (Date.parse(eventTimestamp) > Date.parse(this.lastActiveTimestamp))
        this.lastActiveTimestamp = eventTimestamp

      // Skip ignored event types (e.g. Music)
      if (INGORED_EVENT_TYPES.includes(eventName)) continue

      // Only persist supported event types in the databases
      if (PERSIST_ALL_EVENTS === true || PERSISTED_EVENT_TYPES.includes(eventName)) {
        // Insert each message one by one, as using bulk import with constraint
        // (which is faster) tends to fail because logs contain duplicates.
        const isUnique = await this.#insertUnique(log)

        if (isUnique === true) logIngested = true
      } else {
        // If it's not a persisted event type, only keep a copy of it if it
        // has a more recent timestamp than the event we currently have.
        // This is useful if we only ever need the latest version of an event
        // and is faster and uses less RAM than keeping everything in memory.
        if (this.singleInstanceEvents[eventName]) {
          if (Date.parse(eventTimestamp) > Date.parse(this.singleInstanceEvents[eventName].timestamp)) {
            this.singleInstanceEvents[eventName] = log
            logIngested = true
          }
        } else {
          this.singleInstanceEvents[eventName] = log
          logIngested = true
        }
      }

      // If log was ingested, set to true and trigger callback
      if (logIngested) {
        logsIngested.push(log)
        if (this.logEventCallback) this.logEventCallback(log)
      }
    }
    return logsIngested
  }

  async #insertUnique(log) {
    try {
      await db.insert(log)
      return true // Not a duplicate
    } catch (e) {
      if (e.errorType === 'uniqueViolated') {
        return false // Duplicate — not an error
      }
      throw e
    }
  }

  // Get path to all log files in dir
  async #getFiles() {
    try {
      // Note: Journal.*.log excludes files like JournalAlpha.*.log so that
      // alpha / beta test data doesn't get included by mistake.
      const globFiles = await glob(`${this.dir}/Journal.*.log`)

      const files = globFiles.map(name => {
        const { size, mtime: lastModified } = fs.statSync(name)
        // Estimate line count from file size to avoid reading entire files
        // (~200 bytes per journal line on average)
        const lineCount = Math.max(1, Math.ceil(size / 200))
        return new File({ name, lastModified, size, lineCount })
      })

      // Track most (mostly recently modified) log file
      if (files.length > 0) {
        const activeLogFile = files.sort((a, b) => b.lastModified - a.lastModified)[0]
        this.lastActiveLogFileName = activeLogFile.name
      }

      return files
    } catch (error) {
      console.error(error)
      return []
    }
  }

  // Load log file and parse into an array of objects
  #parse(rawLog) {
    const sortedLog = rawLog.split("\n").reverse()
    let parsedLog = []
    sortedLog.map(logLine => {
      try {
        parsedLog.push(JSON.parse(logLine))
      } catch (e) {
        return false // Skip entries that don't parse (e.g. blank lines)
      }
    })
    return parsedLog
  }

  #checksum(string) {
    return crypto.createHash('sha256').update(string).digest('hex')
  }
}

class File {
  constructor({name, lastModified, size, lineCount, watch = false}) {
    this.name = name // Full path to file
    this.lastModified = lastModified
    this.size = size,
    this.lineCount = lineCount
    this.watch = watch
  }
}

module.exports = EliteLog