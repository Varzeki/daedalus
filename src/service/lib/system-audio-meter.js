'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawn } = require('child_process')

const RUNTIME_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal', 'runtime')
const EMBEDDED_HELPER_SOURCE_PATH = path.join(__dirname, 'system-audio-meter-helper.cs')
const HELPER_SOURCE_PATH = path.join(RUNTIME_DIR, 'system-audio-meter-helper.cs')
const HELPER_PATH = path.join(RUNTIME_DIR, 'system-audio-meter-helper.exe')
const PREBUILT_HELPER_PATH = path.join(path.dirname(process.execPath), 'system-audio-meter-helper.exe')
const SAMPLE_HISTORY_LIMIT = 180

let _helperProcess = null
let _helperReadyPromise = null
let _helperTargetKey = ''
let _ignoreNextCloseFailure = false
let _latestState = {
  supported: false,
  active: false,
  mode: 'host-audio-spectrum',
  channels: [],
  bands: [],
  peak: 0,
  updatedAt: 0,
  history: [],
  error: null
}

function buildTargetInfo (targetSession) {
  const appId = typeof targetSession?.appId === 'string' ? targetSession.appId : ''
  const appName = typeof targetSession?.appName === 'string' ? targetSession.appName : ''
  const hasTarget = Boolean(appId || appName)

  return {
    appId,
    appName,
    args: hasTarget ? [appId, appName] : [],
    key: hasTarget ? `${appId}\u0000${appName}` : ''
  }
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

function execFileAsync (command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout = '', stderr = '') => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

function ensureHelperSource () {
  const sourceContent = fs.readFileSync(EMBEDDED_HELPER_SOURCE_PATH, 'utf8')

  if (!fs.existsSync(HELPER_SOURCE_PATH) || fs.readFileSync(HELPER_SOURCE_PATH, 'utf8') !== sourceContent) {
    fs.writeFileSync(HELPER_SOURCE_PATH, sourceContent, 'utf8')
  }

  return HELPER_SOURCE_PATH
}

async function ensureHelper () {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })

  if (fs.existsSync(PREBUILT_HELPER_PATH)) {
    return PREBUILT_HELPER_PATH
  }

  const cscPath = getCscPath()
  const systemRuntimeFacadePath = getSystemRuntimeFacadePath()
  if (!cscPath || !systemRuntimeFacadePath) {
    throw new Error('Windows audio meter helper prerequisites are unavailable')
  }

  const sourcePath = ensureHelperSource()
  const sourceStat = fs.statSync(sourcePath)
  const exeStat = fs.existsSync(HELPER_PATH) ? fs.statSync(HELPER_PATH) : null
  if (exeStat && exeStat.mtimeMs >= sourceStat.mtimeMs) {
    return HELPER_PATH
  }

  await execFileAsync(cscPath, [
    '/nologo',
    '/target:exe',
    `/out:${HELPER_PATH}`,
    `/reference:${systemRuntimeFacadePath}`,
    sourcePath
  ], {
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024
  })

  return HELPER_PATH
}

function pushSample (sample) {
  const historySample = {
    active: sample.active !== false,
    mode: sample.mode || _latestState.mode || 'host-audio-spectrum',
    peak: sample.peak,
    channels: sample.channels,
    bands: sample.bands,
    updatedAt: sample.updatedAt
  }

  const history = _latestState.history.concat(historySample)
  if (history.length > SAMPLE_HISTORY_LIMIT) {
    history.splice(0, history.length - SAMPLE_HISTORY_LIMIT)
  }

  _latestState = {
    supported: true,
    active: sample.active !== false,
    mode: sample.mode || 'host-audio-spectrum',
    channels: sample.channels,
    bands: sample.bands,
    peak: sample.peak,
    updatedAt: sample.updatedAt,
    history,
    error: null
  }

  if (global.BROADCAST_EVENT) {
    global.BROADCAST_EVENT('systemAudioMeter', historySample)
  }
}

function setFailureState (errorMessage) {
  _latestState = {
    ..._latestState,
    supported: false,
    active: false,
    error: errorMessage || 'Unable to start host audio meter.'
  }
}

async function stopHelperProcess () {
  if (!_helperProcess || _helperProcess.killed) {
    _helperProcess = null
    _helperReadyPromise = null
    return
  }

  const helperProcess = _helperProcess
  _ignoreNextCloseFailure = true
  _helperProcess = null
  _helperReadyPromise = null
  _helperTargetKey = ''

  await new Promise(resolve => {
    helperProcess.once('close', () => resolve())
    helperProcess.kill()
  })
}

async function ensureStarted (targetSession = null) {
  const targetInfo = buildTargetInfo(targetSession)

  if (_helperProcess && !_helperProcess.killed && _helperTargetKey !== targetInfo.key) {
    await stopHelperProcess()
  }

  if (_helperProcess && !_helperProcess.killed) {
    return _latestState
  }

  if (!_helperReadyPromise) {
    _helperReadyPromise = (async () => {
      const helperPath = await ensureHelper()
      const helperProcess = spawn(helperPath, targetInfo.args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      _helperProcess = helperProcess
      _helperTargetKey = targetInfo.key
      helperProcess.stdout.setEncoding('utf8')
      helperProcess.stderr.setEncoding('utf8')

      let stdoutBuffer = ''

      helperProcess.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const sample = JSON.parse(trimmed)
            pushSample({
              active: sample.active !== false,
              mode: typeof sample.mode === 'string' ? sample.mode : undefined,
              channels: Array.isArray(sample.channels) ? sample.channels : [],
              bands: Array.isArray(sample.bands) ? sample.bands : [],
              peak: Number.isFinite(sample.peak) ? sample.peak : 0,
              updatedAt: Number.isFinite(sample.updatedAt) ? sample.updatedAt : Date.now()
            })
          } catch (error) {
            setFailureState(`Failed to parse host audio sample: ${error.message}`)
          }
        }
      })

      helperProcess.stderr.on('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) setFailureState(message)
      })

      helperProcess.on('close', () => {
        _helperProcess = null
        _helperReadyPromise = null
        _helperTargetKey = ''
        if (_ignoreNextCloseFailure) {
          _ignoreNextCloseFailure = false
          return
        }

        if (!_latestState.error) {
          setFailureState('Host audio meter stopped.')
        }
      })

      _latestState = {
        ..._latestState,
        supported: true,
        active: true,
        error: null
      }

      return _latestState
    })().catch(error => {
      _helperReadyPromise = null
      _helperProcess = null
      setFailureState(error.message)
      return _latestState
    })
  }

  return _helperReadyPromise
}

async function getState (targetSession = null) {
  await ensureStarted(targetSession)
  return _latestState
}

module.exports = {
  getState,
  ensureStarted
}