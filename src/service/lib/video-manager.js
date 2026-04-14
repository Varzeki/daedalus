'use strict'

const os = require('os')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const { BROADCAST_EVENT: broadcastEvent } = global

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal', 'VideoCache')

// yt-dlp binary — in pkg builds, look next to the running .exe;
// in development, look in the project resources/ directory.
const YTDLP_BIN = (() => {
  const exeDir = path.dirname(process.execPath)
  const beside = path.join(exeDir, 'yt-dlp.exe')
  if (fs.existsSync(beside)) return beside
  // Fallback for development (running from source)
  return path.join(__dirname, '..', '..', '..', 'resources', 'yt-dlp.exe')
})()

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

// ---------------------------------------------------------------------------
// Active download tracking
// ---------------------------------------------------------------------------

let _activeDownload = null // { proc, videoId }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ytdlpAvailable () {
  return fs.existsSync(YTDLP_BIN)
}

function getCacheDir () {
  return CACHE_DIR
}

/** Return the cached video file path for a given videoId, or null if not cached */
function getCachedVideoPath (videoId) {
  // Videos are saved as <videoId>.mp4 (or .webm — we check both)
  for (const ext of ['.mp4', '.webm', '.mkv']) {
    const fp = path.join(CACHE_DIR, `${videoId}${ext}`)
    if (fs.existsSync(fp)) return fp
  }
  return null
}

// ---------------------------------------------------------------------------
// Search / metadata
// ---------------------------------------------------------------------------

/** Try to resolve a channel URL; returns { name, url } or null if it doesn't exist */
function probeChannel (channelUrl) {
  return new Promise(resolve => {
    const url = channelUrl.replace(/\/$/, '').replace(/\/videos$/, '') + '/videos'
    const args = [
      url,
      '--dump-json',
      '--playlist-end', '1',
      '--no-warnings',
      '--no-check-certificates'
    ]
    const proc = spawn(YTDLP_BIN, args, { windowsHide: true })
    let stdout = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.on('close', code => {
      if (code !== 0 || !stdout.trim()) return resolve(null)
      try {
        const j = JSON.parse(stdout.trim().split('\n')[0])
        const name = j.uploader || j.channel
        const resolvedUrl = j.uploader_url || j.channel_url || channelUrl
        resolve(name ? { name, url: resolvedUrl } : null)
      } catch (e) {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))
  })
}

/**
 * Search YouTube via yt-dlp and return { videos, channel }.
 * Also probes for a channel matching the query by @handle in parallel.
 */
function search (query, maxResults = 8) {
  if (!ytdlpAvailable()) return Promise.reject(new Error('yt-dlp not found'))

  const videoSearch = new Promise((resolve, reject) => {
    const args = [
      `ytsearch${maxResults}:${query}`,
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates'
    ]

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code !== 0 && !stdout) return reject(new Error(stderr || `yt-dlp exited ${code}`))
      try {
        const results = stdout.trim().split('\n').filter(Boolean).map(line => {
          const j = JSON.parse(line)
          return {
            id: j.id,
            title: j.title,
            duration: j.duration,
            uploader: j.uploader || j.channel,
            channelId: j.channel_id,
            channelUrl: j.uploader_url || j.channel_url,
            thumbnail: j.thumbnails?.length ? j.thumbnails[j.thumbnails.length - 1].url : null,
            url: j.url || j.webpage_url || `https://www.youtube.com/watch?v=${j.id}`
          }
        })
        resolve(results)
      } catch (e) {
        reject(new Error('Failed to parse search results'))
      }
    })
    proc.on('error', reject)
  })

  // Probe for a channel matching the query by @handle
  const handle = query.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '')
  const channelProbe = handle.length >= 2
    ? probeChannel(`https://www.youtube.com/@${handle}`)
    : Promise.resolve(null)

  return Promise.all([videoSearch, channelProbe]).then(([videos, channel]) => {
    // If the direct probe didn't match, check if video results share a channel
    // whose name closely matches the query
    if (!channel && videos.length > 0) {
      const q = query.toLowerCase().replace(/\s+/g, '')
      for (const v of videos) {
        if (v.uploader && v.uploader.toLowerCase().replace(/\s+/g, '') === q && v.channelUrl) {
          return { videos, channel: { name: v.uploader, url: v.channelUrl } }
        }
      }
    }
    return { videos, channel }
  })
}

/** Get full metadata for a single video URL or ID */
function getVideoInfo (urlOrId) {
  return new Promise((resolve, reject) => {
    if (!ytdlpAvailable()) return reject(new Error('yt-dlp not found'))

    const target = urlOrId.startsWith('http') ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`
    const args = [
      target,
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--no-check-certificates'
    ]

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `yt-dlp exited ${code}`))
      try {
        const j = JSON.parse(stdout)
        resolve({
          id: j.id,
          title: j.title,
          duration: j.duration,
          uploader: j.uploader || j.channel,
          thumbnail: j.thumbnails?.length ? j.thumbnails[j.thumbnails.length - 1].url : null,
          url: j.webpage_url
        })
      } catch (e) {
        reject(new Error('Failed to parse video info'))
      }
    })
    proc.on('error', reject)
  })
}

/** Get recent videos from a channel URL (e.g. https://www.youtube.com/@Name/videos) */
function getChannelVideos (channelUrl, maxResults = 12) {
  return new Promise((resolve, reject) => {
    if (!ytdlpAvailable()) return reject(new Error('yt-dlp not found'))

    // Ensure we hit the /videos tab
    const url = channelUrl.replace(/\/$/, '').replace(/\/videos$/, '') + '/videos'
    const args = [
      url,
      '--dump-json',
      '--flat-playlist',
      '--playlist-end', String(maxResults),
      '--no-warnings',
      '--no-check-certificates'
    ]

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code !== 0 && !stdout) return reject(new Error(stderr || `yt-dlp exited ${code}`))
      try {
        const results = stdout.trim().split('\n').filter(Boolean).map(line => {
          const j = JSON.parse(line)
          return {
            id: j.id,
            title: j.title,
            duration: j.duration,
            uploader: j.uploader || j.channel,
            channelId: j.channel_id,
            channelUrl: j.uploader_url || j.channel_url,
            thumbnail: j.thumbnails?.length ? j.thumbnails[j.thumbnails.length - 1].url : null,
            url: j.url || j.webpage_url || `https://www.youtube.com/watch?v=${j.id}`
          }
        })
        resolve(results)
      } catch (e) {
        reject(new Error('Failed to parse channel videos'))
      }
    })
    proc.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/** Parse yt-dlp progress output from stderr */
function parseProgress (line) {
  // Example: [download]  42.3% of  120.50MiB at  5.23MiB/s ETA 00:14
  const match = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\S+)/)
  if (match) {
    return { percent: parseFloat(match[1]), totalSize: match[2] }
  }
  return null
}

/**
 * Download a video by URL or ID. Broadcasts progress events.
 * Returns a promise that resolves with { videoId, filePath }.
 */
function download (urlOrId) {
  return new Promise((resolve, reject) => {
    if (!ytdlpAvailable()) return reject(new Error('yt-dlp not found'))

    // Resolve video ID
    let videoId
    if (urlOrId.startsWith('http')) {
      // Extract ID from URL
      const u = new URL(urlOrId)
      videoId = u.searchParams.get('v') || u.pathname.split('/').pop()
    } else {
      videoId = urlOrId
    }

    // Check cache first
    const cached = getCachedVideoPath(videoId)
    if (cached) {
      broadcastEvent('videoDownloadComplete', { videoId, fileName: path.basename(cached) })
      return resolve({ videoId, filePath: cached })
    }

    // Cancel any active download
    cancelDownload()

    const target = urlOrId.startsWith('http') ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`
    const outputTemplate = path.join(CACHE_DIR, `${videoId}.%(ext)s`)

    const args = [
      target,
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      '--no-warnings',
      '--no-check-certificates',
      '--newline' // Force progress on new lines (easier to parse)
    ]

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true })
    _activeDownload = { proc, videoId }

    let stderr = ''

    proc.stdout.on('data', d => {
      const lines = d.toString().split('\n')
      for (const line of lines) {
        const progress = parseProgress(line)
        if (progress) {
          broadcastEvent('videoDownloadProgress', { videoId, ...progress })
        }
      }
    })

    proc.stderr.on('data', d => {
      stderr += d.toString()
      // yt-dlp may also output progress on stderr
      const lines = d.toString().split('\n')
      for (const line of lines) {
        const progress = parseProgress(line)
        if (progress) {
          broadcastEvent('videoDownloadProgress', { videoId, ...progress })
        }
      }
    })

    proc.on('close', code => {
      _activeDownload = null
      if (code !== 0) {
        broadcastEvent('videoDownloadError', { videoId, error: stderr || `yt-dlp exited ${code}` })
        return reject(new Error(stderr || `Download failed (code ${code})`))
      }
      const filePath = getCachedVideoPath(videoId)
      if (!filePath) {
        broadcastEvent('videoDownloadError', { videoId, error: 'Downloaded file not found' })
        return reject(new Error('Downloaded file not found in cache'))
      }
      broadcastEvent('videoDownloadComplete', { videoId, fileName: path.basename(filePath) })
      resolve({ videoId, filePath })
    })

    proc.on('error', err => {
      _activeDownload = null
      broadcastEvent('videoDownloadError', { videoId, error: err.message })
      reject(err)
    })
  })
}

/** Cancel any in-progress download */
function cancelDownload () {
  if (_activeDownload) {
    try { _activeDownload.proc.kill() } catch (_) {}
    _activeDownload = null
  }
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/** List cached videos (most recent first) */
function listCached () {
  if (!fs.existsSync(CACHE_DIR)) return []
  const files = fs.readdirSync(CACHE_DIR).filter(f => /\.(mp4|webm|mkv)$/i.test(f))
  return files.map(f => {
    const fp = path.join(CACHE_DIR, f)
    const stat = fs.statSync(fp)
    const videoId = path.parse(f).name
    return { videoId, fileName: f, size: stat.size, mtime: stat.mtimeMs }
  }).sort((a, b) => b.mtime - a.mtime)
}

/** Clear the entire video cache */
function clearCache () {
  const files = fs.readdirSync(CACHE_DIR)
  for (const f of files) {
    fs.unlinkSync(path.join(CACHE_DIR, f))
  }
}

module.exports = {
  ytdlpAvailable,
  getCacheDir,
  getCachedVideoPath,
  probeChannel,
  search,
  getVideoInfo,
  getChannelVideos,
  download,
  cancelDownload,
  listCached,
  clearCache
}
