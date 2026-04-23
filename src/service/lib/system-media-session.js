'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

const CACHE_TTL_MS = 1000
const RUNTIME_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal', 'runtime')
const ARTWORK_CACHE_DIR = path.join(RUNTIME_DIR, 'system-media-artwork')
const SCRIPT_PATH = path.join(RUNTIME_DIR, 'system-media-session.ps1')
const EMBEDDED_THUMBNAIL_HELPER_SOURCE_PATH = path.join(__dirname, 'system-media-thumbnail-helper.cs')
const THUMBNAIL_HELPER_SOURCE_PATH = path.join(RUNTIME_DIR, 'system-media-thumbnail-helper.cs')
const THUMBNAIL_HELPER_PATH = path.join(RUNTIME_DIR, 'system-media-thumbnail-helper.exe')

let _cachedState = null
let _cachedAt = 0
let _thumbnailHelperPromise = null
let _cachedArtworkKey = null
let _cachedArtworkUrl = null

const SCRIPT_CONTENT = String.raw`param([string]$Action = 'get')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

function AwaitWinRt($Operation, [Type]$ResultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1

  $netTask = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

function Get-FriendlyAppName([string]$AppId) {
  if ([string]::IsNullOrWhiteSpace($AppId)) { return $null }
  $leaf = [System.IO.Path]::GetFileName($AppId)
  if ($leaf -match '\.exe$') { return [System.IO.Path]::GetFileNameWithoutExtension($leaf) }
  if ($leaf -match '!') { return ($leaf -split '!')[-1] }
  return $leaf
}

function Get-Seconds($TimeSpanValue) {
  if ($null -eq $TimeSpanValue) { return 0 }
  try { return [math]::Round([double]$TimeSpanValue.TotalSeconds, 3) } catch { return 0 }
}

function Build-SessionSummary($Session, $PropsType) {
  if ($null -eq $Session) { return $null }

  $playbackInfo = $Session.GetPlaybackInfo()
  $timeline = $Session.GetTimelineProperties()
  $controls = $playbackInfo.Controls
  $props = $null
  try {
    $props = AwaitWinRt ($Session.TryGetMediaPropertiesAsync()) $PropsType
  } catch {}

  $canSeek = $false
  try { $canSeek = [bool]$controls.IsPlaybackPositionEnabled } catch {}

  return [ordered]@{
    appId = $Session.SourceAppUserModelId
    appName = Get-FriendlyAppName $Session.SourceAppUserModelId
    title = if ($props) { $props.Title } else { $null }
    artist = if ($props) { $props.Artist } else { $null }
    album = if ($props) { $props.AlbumTitle } else { $null }
    albumArtist = if ($props) { $props.AlbumArtist } else { $null }
    trackNumber = if ($props) { $props.TrackNumber } else { $null }
    playbackStatus = $playbackInfo.PlaybackStatus.ToString()
    controls = [ordered]@{
      canPlay = [bool]$controls.IsPlayEnabled
      canPause = [bool]$controls.IsPauseEnabled
      canNext = [bool]$controls.IsNextEnabled
      canPrevious = [bool]$controls.IsPreviousEnabled
      canSeek = $canSeek
    }
    timeline = [ordered]@{
      positionSeconds = Get-Seconds $timeline.Position
      startSeconds = Get-Seconds $timeline.StartTime
      endSeconds = Get-Seconds $timeline.EndTime
      minSeekSeconds = Get-Seconds $timeline.MinSeekTime
      maxSeekSeconds = Get-Seconds $timeline.MaxSeekTime
    }
  }
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]

  $manager = AwaitWinRt ($managerType::RequestAsync()) $managerType
  $currentSession = $manager.GetCurrentSession()

  switch ($Action) {
    'playPause' {
      if ($currentSession) {
        $status = $currentSession.GetPlaybackInfo().PlaybackStatus.ToString()
        if ($status -eq 'Playing') {
          $null = AwaitWinRt ($currentSession.TryPauseAsync()) ([bool])
        } else {
          $null = AwaitWinRt ($currentSession.TryPlayAsync()) ([bool])
        }
        Start-Sleep -Milliseconds 150
        $currentSession = $manager.GetCurrentSession()
      }
    }
    'play' {
      if ($currentSession) {
        $null = AwaitWinRt ($currentSession.TryPlayAsync()) ([bool])
        Start-Sleep -Milliseconds 150
        $currentSession = $manager.GetCurrentSession()
      }
    }
    'pause' {
      if ($currentSession) {
        $null = AwaitWinRt ($currentSession.TryPauseAsync()) ([bool])
        Start-Sleep -Milliseconds 150
        $currentSession = $manager.GetCurrentSession()
      }
    }
    'next' {
      if ($currentSession) {
        $null = AwaitWinRt ($currentSession.TrySkipNextAsync()) ([bool])
        Start-Sleep -Milliseconds 225
        $currentSession = $manager.GetCurrentSession()
      }
    }
    'previous' {
      if ($currentSession) {
        $null = AwaitWinRt ($currentSession.TrySkipPreviousAsync()) ([bool])
        Start-Sleep -Milliseconds 225
        $currentSession = $manager.GetCurrentSession()
      }
    }
  }

  $sessions = @()
  foreach ($candidate in $manager.GetSessions()) {
    $summary = Build-SessionSummary $candidate $propsType
    if ($summary) {
      $summary.isCurrent = $currentSession -ne $null -and $candidate.SourceAppUserModelId -eq $currentSession.SourceAppUserModelId
      $sessions += $summary
    }
  }

  $result = [ordered]@{
    supported = $true
    available = $currentSession -ne $null
    current = Build-SessionSummary $currentSession $propsType
    sessions = $sessions
    error = $null
  }

  $result | ConvertTo-Json -Depth 6 -Compress
} catch {
  [ordered]@{
    supported = $false
    available = $false
    current = $null
    sessions = @()
    error = $_.Exception.Message
  } | ConvertTo-Json -Depth 6 -Compress
}
`

function getPowerShellPath () {
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'powershell'
  ]
  return candidates.find(candidate => candidate === 'powershell' || fs.existsSync(candidate))
}

function getCscPath () {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function getWindowsMetadataPath () {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'UnionMetadata', '10.0.26100.0', 'Windows.winmd'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'UnionMetadata', '10.0.16299.0', 'Windows.winmd'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'UnionMetadata', 'Facade', 'Windows.WinMD')
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

function ensureScript () {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  fs.mkdirSync(ARTWORK_CACHE_DIR, { recursive: true })
  if (!fs.existsSync(SCRIPT_PATH) || fs.readFileSync(SCRIPT_PATH, 'utf8') !== SCRIPT_CONTENT) {
    fs.writeFileSync(SCRIPT_PATH, SCRIPT_CONTENT, 'utf8')
  }
}

function ensureThumbnailHelperSource () {
  const sourceContent = fs.readFileSync(EMBEDDED_THUMBNAIL_HELPER_SOURCE_PATH, 'utf8')

  if (!fs.existsSync(THUMBNAIL_HELPER_SOURCE_PATH) || fs.readFileSync(THUMBNAIL_HELPER_SOURCE_PATH, 'utf8') !== sourceContent) {
    fs.writeFileSync(THUMBNAIL_HELPER_SOURCE_PATH, sourceContent, 'utf8')
  }

  return THUMBNAIL_HELPER_SOURCE_PATH
}

function getArtworkExtension (contentType) {
  if (/png/i.test(contentType)) return 'png'
  if (/webp/i.test(contentType)) return 'webp'
  if (/bmp/i.test(contentType)) return 'bmp'
  return 'jpg'
}

async function ensureThumbnailHelper () {
  if (!_thumbnailHelperPromise) {
    _thumbnailHelperPromise = (async () => {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true })

      const cscPath = getCscPath()
      const windowsMetadataPath = getWindowsMetadataPath()
      const windowsRuntimeAssemblyPath = getWindowsRuntimeAssemblyPath()
      const systemRuntimeFacadePath = getSystemRuntimeFacadePath()

      if (!cscPath || !windowsMetadataPath || !windowsRuntimeAssemblyPath || !systemRuntimeFacadePath) {
        throw new Error('Windows thumbnail helper prerequisites are unavailable')
      }

      const sourcePath = ensureThumbnailHelperSource()
      const sourceStat = fs.statSync(sourcePath)
      const exeStat = fs.existsSync(THUMBNAIL_HELPER_PATH) ? fs.statSync(THUMBNAIL_HELPER_PATH) : null
      if (exeStat && exeStat.mtimeMs >= sourceStat.mtimeMs) {
        return THUMBNAIL_HELPER_PATH
      }

      await execFileAsync(cscPath, [
        '/nologo',
        '/target:exe',
        `/out:${THUMBNAIL_HELPER_PATH}`,
        `/reference:${windowsRuntimeAssemblyPath}`,
        `/reference:${systemRuntimeFacadePath}`,
        `/reference:${windowsMetadataPath}`,
        sourcePath
      ], {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024
      })

      return THUMBNAIL_HELPER_PATH
    })().catch(error => {
      _thumbnailHelperPromise = null
      throw error
    })
  }

  return _thumbnailHelperPromise
}

function getArtworkKey (session) {
  if (!session) return null
  return [
    session.appId || '',
    session.title || '',
    session.artist || '',
    session.album || '',
    session.trackNumber || ''
  ].join('||')
}

async function getAlbumArtUrl (session) {
  const artworkKey = getArtworkKey(session)
  if (!artworkKey) return null

  if (artworkKey === _cachedArtworkKey) {
    return _cachedArtworkUrl
  }

  let helperPath = null
  try {
    helperPath = await ensureThumbnailHelper()
  } catch {
    _cachedArtworkKey = artworkKey
    _cachedArtworkUrl = null
    return null
  }

  try {
    const { stdout } = await execFileAsync(helperPath, [session.appId || ''], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 4 * 1024 * 1024
    })

    const payload = JSON.parse(stdout.trim())
    const contentType = payload?.contentType || 'image/jpeg'
    const data = payload?.data || ''
    const extension = getArtworkExtension(contentType)
    const fileName = `${crypto.createHash('sha1').update(artworkKey).digest('hex')}.${extension}`
    const filePath = path.join(ARTWORK_CACHE_DIR, fileName)
    if (data) {
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    }
    const albumArtUrl = data ? `/system-media-artwork/${fileName}?v=${encodeURIComponent(artworkKey)}` : null

    _cachedArtworkKey = artworkKey
    _cachedArtworkUrl = albumArtUrl
    return albumArtUrl
  } catch {
    _cachedArtworkKey = artworkKey
    _cachedArtworkUrl = null
    return null
  }
}

async function hydrateAlbumArt (state) {
  const artworkKey = getArtworkKey(state?.current)
  if (!artworkKey) {
    _cachedArtworkKey = null
    _cachedArtworkUrl = null
    return state
  }

  const albumArtUrl = await getAlbumArtUrl(state.current)
  if (!albumArtUrl) {
    return state
  }

  const current = {
    ...state.current,
    albumArtUrl
  }

  const sessions = state.sessions.map(session => {
    if (getArtworkKey(session) !== artworkKey) return session
    return {
      ...session,
      albumArtUrl
    }
  })

  return {
    ...state,
    current,
    sessions
  }
}

function normalizeState (state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []
  const current = state?.current || null

  return {
    supported: state?.supported !== false,
    available: state?.available === true,
    current,
    sessions,
    error: state?.error || null,
    fetchedAt: Date.now()
  }
}

async function runAction (action = 'get') {
  ensureScript()

  let stdout = ''
  let stderr = ''
  try {
    const result = await execFileAsync(getPowerShellPath(), [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT_PATH,
      '-Action', action
    ], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 1024 * 1024
    })

    stdout = result.stdout || ''
    stderr = result.stderr || ''
  } catch (error) {
    stdout = error.stdout || ''
    stderr = error.stderr || ''
    if (!stdout.trim()) {
      throw new Error(stderr.trim() || error.message || 'Failed to query Windows media session')
    }
  }

  const jsonLine = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .reverse()
    .find(line => line.startsWith('{') && line.endsWith('}'))

  if (!jsonLine) {
    throw new Error(stderr.trim() || 'Windows media session returned no JSON payload')
  }

  let parsedState = null
  try {
    parsedState = normalizeState(JSON.parse(jsonLine))
  } catch (parseError) {
    throw new Error(`Failed to parse Windows media session payload: ${parseError.message}`)
  }

  return hydrateAlbumArt(parsedState)
}

async function getState ({ force = false } = {}) {
  if (!force && _cachedState && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedState
  }

  const state = await runAction('get')
  _cachedState = state
  _cachedAt = Date.now()
  return state
}

async function transport (action) {
  const state = await runAction(action)
  _cachedState = state
  _cachedAt = Date.now()
  return state
}

module.exports = {
  getState,
  transport
}