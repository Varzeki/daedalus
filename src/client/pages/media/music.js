import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { MediaPanelNavItems } from 'lib/navigation-items'

const MEDIA_POLL_INTERVAL_MS = 1250
const POSITION_TICK_INTERVAL_MS = 150
const HARD_SYNC_GAP_SECONDS = 8
const SOFT_FORWARD_SYNC_SECONDS = 0.75
const SOFT_FORWARD_SYNC_STEP_SECONDS = 0.12
const VISUALIZER_BAR_COUNT = 64
const HOST_VISUALIZER_BAR_COUNT = 60
const HOST_METER_HISTORY_LIMIT = 180
const HOST_METER_STALE_FADE_MS = 480
const HOST_SPECTRUM_DISTRIBUTION_EXPONENT = 1.72
const VISUALIZER_TARGET_FILL = 0.9
const VISUALIZER_MIN_CEILING = 0.035
const VISUALIZER_NOISE_FLOOR = 0.008
const VISUALIZER_ZOOM_MIN = 0.1
const VISUALIZER_ZOOM_RANGE = 0.8
const TITLE_SCROLL_GAP_PX = 64
const TITLE_SCROLL_SPEED_PX_PER_SECOND = 110
const DEFAULT_VISUALIZER_PALETTE = {
  primary: [82, 225, 255],
  secondary: [255, 188, 88],
  info: [192, 228, 255]
}

function formatTime (seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function clamp (value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getSessionKey (session) {
  if (!session) return 'idle'
  return [
    session.appId,
    session.title,
    session.artist,
    session.album,
    session.trackNumber
  ].filter(Boolean).join('::') || 'idle'
}

function getSessionPosition (session) {
  return Math.max(0, session?.timeline?.positionSeconds ?? 0)
}

function getSessionDuration (session) {
  return Math.max(0, session?.timeline?.endSeconds ?? 0)
}

function getSessionArtwork (session) {
  return session?.albumArtUrl || null
}

function getVisualizerErrorMessage (error) {
  if (!error) return null
  if (/Windows audio meter helper prerequisites are unavailable/i.test(error)) {
    return 'Audio visualizer unavailable on this system.'
  }

  return error
}

function normalizeMeterSample (sample) {
  if (!sample) return null

  const channels = Array.isArray(sample.channels)
    ? sample.channels.map(value => clamp(Number(value) || 0, 0, 1))
    : []
  const bands = Array.isArray(sample.bands)
    ? sample.bands.map(value => clamp(Number(value) || 0, 0, 1))
    : []

  return {
    peak: clamp(Number(sample.peak) || 0, 0, 1),
    channels,
    bands,
    updatedAt: Number(sample.updatedAt) || Date.now()
  }
}

function estimatePosition (anchor, now = Date.now()) {
  if (!anchor) return 0
  if (anchor.playbackStatus !== 'Playing') return anchor.positionSeconds

  const elapsed = Math.max(0, (now - anchor.updatedAt) / 1000)
  const nextPosition = anchor.positionSeconds + elapsed
  return anchor.durationSeconds > 0
    ? Math.min(anchor.durationSeconds, nextPosition)
    : nextPosition
}

function syncPlaybackAnchor (previousAnchor, nextState, { hardSync = false } = {}) {
  const current = nextState?.current || null
  if (!current) {
    return {
      key: 'idle',
      playbackStatus: 'Idle',
      positionSeconds: 0,
      durationSeconds: 0,
      updatedAt: Date.now()
    }
  }

  const now = Date.now()
  const key = getSessionKey(current)
  const playbackStatus = current.playbackStatus || 'Idle'
  const serverPosition = getSessionPosition(current)
  const durationSeconds = getSessionDuration(current)
  let positionSeconds = serverPosition

  const durationChanged = previousAnchor
    ? Math.abs((previousAnchor.durationSeconds || 0) - durationSeconds) > 1
    : false

  if (!previousAnchor || hardSync || previousAnchor.key !== key || previousAnchor.playbackStatus !== playbackStatus || durationChanged) {
    return {
      key,
      playbackStatus,
      positionSeconds,
      durationSeconds,
      updatedAt: now
    }
  }

  if (playbackStatus === 'Playing') {
    const estimatedPosition = estimatePosition(previousAnchor, now)
    const driftSeconds = serverPosition - estimatedPosition

    if (Math.abs(driftSeconds) >= HARD_SYNC_GAP_SECONDS) {
      positionSeconds = serverPosition
    } else if (driftSeconds > SOFT_FORWARD_SYNC_SECONDS) {
      positionSeconds = estimatedPosition + Math.min(SOFT_FORWARD_SYNC_STEP_SECONDS, driftSeconds * 0.08)
    } else {
      positionSeconds = estimatedPosition
    }
  }

  if (durationSeconds > 0) {
    positionSeconds = clamp(positionSeconds, 0, durationSeconds)
  }

  return {
    key,
    playbackStatus,
    positionSeconds,
    durationSeconds,
    updatedAt: now
  }
}

function readCssNumber (styles, propertyName, fallback) {
  const value = Number.parseFloat(styles.getPropertyValue(propertyName))
  return Number.isFinite(value) ? value : fallback
}

function getVisualizerPalette () {
  if (typeof window === 'undefined') return DEFAULT_VISUALIZER_PALETTE

  const styles = window.getComputedStyle(document.documentElement)
  return {
    primary: [
      readCssNumber(styles, '--color-primary-r', DEFAULT_VISUALIZER_PALETTE.primary[0]),
      readCssNumber(styles, '--color-primary-g', DEFAULT_VISUALIZER_PALETTE.primary[1]),
      readCssNumber(styles, '--color-primary-b', DEFAULT_VISUALIZER_PALETTE.primary[2])
    ],
    secondary: [
      readCssNumber(styles, '--color-secondary-r', DEFAULT_VISUALIZER_PALETTE.secondary[0]),
      readCssNumber(styles, '--color-secondary-g', DEFAULT_VISUALIZER_PALETTE.secondary[1]),
      readCssNumber(styles, '--color-secondary-b', DEFAULT_VISUALIZER_PALETTE.secondary[2])
    ],
    info: [
      readCssNumber(styles, '--color-info-r', DEFAULT_VISUALIZER_PALETTE.info[0]),
      readCssNumber(styles, '--color-info-g', DEFAULT_VISUALIZER_PALETTE.info[1]),
      readCssNumber(styles, '--color-info-b', DEFAULT_VISUALIZER_PALETTE.info[2])
    ]
  }
}

function rgba (color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`
}

function prepareCanvas (canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 640
  const height = canvas.clientHeight || 288
  const targetWidth = Math.max(1, Math.floor(width * dpr))
  const targetHeight = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }

  return {
    ctx,
    width: canvas.width,
    height: canvas.height
  }
}

function drawBackground (ctx, width, height, palette, energy = 0) {
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = `rgba(2, 5, 9, ${0.78 + (energy * 0.08)})`
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
  ctx.lineWidth = 1
  for (let row = 1; row < 5; row++) {
    const y = (height / 5) * row
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function updateDynamicCeiling (visualizerState, ceilingKey, maxLevel, isActive) {
  const restingCeiling = 0.22
  const target = isActive
    ? Math.max(VISUALIZER_MIN_CEILING, maxLevel / VISUALIZER_TARGET_FILL)
    : restingCeiling
  const current = Number(visualizerState[ceilingKey]) || target
  const smoothing = target > current ? 0.34 : 0.075
  const next = current + ((target - current) * smoothing)

  visualizerState[ceilingKey] = next
  return Math.max(VISUALIZER_MIN_CEILING, next)
}

function scaleVisualizerLevel (level, ceiling) {
  const normalized = clamp((Number(level) || 0) / Math.max(VISUALIZER_MIN_CEILING, ceiling || VISUALIZER_MIN_CEILING), 0, 1)
  return clamp((normalized - VISUALIZER_ZOOM_MIN) / VISUALIZER_ZOOM_RANGE, 0, 1)
}

function drawIdleVisualizer (ctx, width, height, palette) {
  drawBackground(ctx, width, height, palette, 0.04)
}

function sampleFrequencyBars (frequencyData) {
  const bars = new Array(VISUALIZER_BAR_COUNT)
  const maxIndex = frequencyData.length - 1

  for (let barIndex = 0; barIndex < VISUALIZER_BAR_COUNT; barIndex++) {
    const start = Math.floor(Math.pow(barIndex / VISUALIZER_BAR_COUNT, 2.05) * maxIndex)
    const end = Math.max(start + 1, Math.floor(Math.pow((barIndex + 1) / VISUALIZER_BAR_COUNT, 2.05) * maxIndex))

    let total = 0
    for (let dataIndex = start; dataIndex < end; dataIndex++) {
      total += frequencyData[dataIndex]
    }

    const average = total / Math.max(1, end - start)
    bars[barIndex] = Math.pow(average / 255, 1.18)
  }

  return bars
}

function smoothFrequencyBars (bars, visualizerState) {
  if (!visualizerState.bars || visualizerState.bars.length !== bars.length) {
    visualizerState.bars = new Float32Array(bars.length)
  }

  if (!visualizerState.peaks || visualizerState.peaks.length !== bars.length) {
    visualizerState.peaks = new Float32Array(bars.length)
  }

  let total = 0
  for (let barIndex = 0; barIndex < bars.length; barIndex++) {
    const target = bars[barIndex]
    const current = visualizerState.bars[barIndex]
    const smoothed = current + ((target - current) * (target > current ? 0.42 : 0.16))
    const peak = Math.max(smoothed, visualizerState.peaks[barIndex] - 0.012)

    visualizerState.bars[barIndex] = smoothed
    visualizerState.peaks[barIndex] = peak
    total += smoothed
  }

  return total / Math.max(1, bars.length)
}

function resampleBars (sourceBars, targetBarCount, exponent = 1) {
  if (!Array.isArray(sourceBars) || sourceBars.length < 1) {
    return new Array(targetBarCount).fill(0)
  }

  if (sourceBars.length === targetBarCount) {
    return sourceBars.slice()
  }

  if (sourceBars.length === 1) {
    return new Array(targetBarCount).fill(clamp(Number(sourceBars[0]) || 0, 0, 1))
  }

  const bars = new Array(targetBarCount)
  for (let barIndex = 0; barIndex < targetBarCount; barIndex++) {
    const position = targetBarCount > 1 ? (barIndex / (targetBarCount - 1)) : 0
    const warpedPosition = exponent === 1 ? position : Math.pow(position, exponent)
    const scaledIndex = warpedPosition * (sourceBars.length - 1)
    const leftIndex = Math.floor(scaledIndex)
    const rightIndex = Math.min(sourceBars.length - 1, leftIndex + 1)
    const mix = scaledIndex - leftIndex
    const leftValue = clamp(Number(sourceBars[leftIndex]) || 0, 0, 1)
    const rightValue = clamp(Number(sourceBars[rightIndex]) || 0, 0, 1)

    bars[barIndex] = leftValue + ((rightValue - leftValue) * mix)
  }

  return bars
}

function sampleHostMeterBars (sample, barCount) {
  if (Array.isArray(sample?.bands) && sample.bands.length > 0) {
    return resampleBars(sample.bands, barCount, HOST_SPECTRUM_DISTRIBUTION_EXPONENT)
  }

  const fallbackLevel = clamp(Number(sample?.peak) || 0, 0, 1)
  const sourceChannels = Array.isArray(sample?.channels) && sample.channels.length > 0
    ? sample.channels
    : [fallbackLevel, fallbackLevel]
  const channels = sourceChannels.length === 1 ? [sourceChannels[0], sourceChannels[0]] : sourceChannels
  const bars = new Array(barCount)

  for (let barIndex = 0; barIndex < barCount; barIndex++) {
    const position = barCount > 1 ? (barIndex / (barCount - 1)) : 0
    const scaledIndex = position * (channels.length - 1)
    const leftIndex = Math.floor(scaledIndex)
    const rightIndex = Math.min(channels.length - 1, leftIndex + 1)
    const mix = scaledIndex - leftIndex
    const channelLevel = channels[leftIndex] + ((channels[rightIndex] - channels[leftIndex]) * mix)
    const centerDistance = Math.abs((position * 2) - 1)
    const contour = 0.62 + ((1 - Math.pow(centerDistance, 1.35)) * 0.48)
    const harmonic = Math.sin(position * Math.PI * (channels.length + 3)) * fallbackLevel * 0.08

    bars[barIndex] = clamp((channelLevel * contour) + harmonic, 0, 1)
  }

  return bars
}

function smoothHostMeterBars (sample, visualizerState, now = Date.now()) {
  if (!visualizerState.hostBars || visualizerState.hostBars.length !== HOST_VISUALIZER_BAR_COUNT) {
    visualizerState.hostBars = new Float32Array(HOST_VISUALIZER_BAR_COUNT)
  }

  if (!visualizerState.hostPeaks || visualizerState.hostPeaks.length !== HOST_VISUALIZER_BAR_COUNT) {
    visualizerState.hostPeaks = new Float32Array(HOST_VISUALIZER_BAR_COUNT)
  }

  const targetBars = sample ? sampleHostMeterBars(sample, HOST_VISUALIZER_BAR_COUNT) : new Array(HOST_VISUALIZER_BAR_COUNT).fill(0)
  const staleness = sample
    ? clamp((now - sample.updatedAt) / HOST_METER_STALE_FADE_MS, 0, 1)
    : 1
  const freshness = 1 - staleness

  let total = 0
  for (let barIndex = 0; barIndex < HOST_VISUALIZER_BAR_COUNT; barIndex++) {
    const target = targetBars[barIndex] * freshness
    const current = visualizerState.hostBars[barIndex]
    const smoothed = current + ((target - current) * (target > current ? 0.38 : 0.15))
    const peak = Math.max(smoothed, visualizerState.hostPeaks[barIndex] - (0.009 + (staleness * 0.015)))

    visualizerState.hostBars[barIndex] = smoothed
    visualizerState.hostPeaks[barIndex] = peak
    total += smoothed
  }

  return total / HOST_VISUALIZER_BAR_COUNT
}

function drawHostMeterVisualizer (ctx, width, height, palette, session, positionSeconds, visualizerState, albumArtImage) {
  const sample = visualizerState.hostMeterSample || null
  if (!sample) {
    drawIdleVisualizer(ctx, width, height, palette)
    return
  }

  const averageEnergy = smoothHostMeterBars(sample, visualizerState)
  const maxBarLevel = Math.max(...visualizerState.hostBars, 0)
  const dynamicCeiling = updateDynamicCeiling(visualizerState, 'hostDynamicCeiling', maxBarLevel, sample.peak > VISUALIZER_NOISE_FLOOR)

  drawBackground(ctx, width, height, palette, averageEnergy)

  const baseline = height
  const barWidth = width / HOST_VISUALIZER_BAR_COUNT
  const visualHeight = height

  for (let barIndex = 0; barIndex < HOST_VISUALIZER_BAR_COUNT; barIndex++) {
    const normalized = scaleVisualizerLevel(visualizerState.hostBars[barIndex], dynamicCeiling)
    const peak = scaleVisualizerLevel(visualizerState.hostPeaks[barIndex], dynamicCeiling)
    const barHeight = normalized * visualHeight
    const x = barIndex * barWidth
    const y = baseline - barHeight
    const fill = ctx.createLinearGradient(0, baseline, 0, y)
    fill.addColorStop(0, rgba(palette.primary, 0.04))
    fill.addColorStop(1, rgba(palette.primary, 0.24))

    ctx.fillStyle = fill
    ctx.fillRect(x + 1, y, Math.max(4, barWidth - 3), Math.max(8, barHeight))

    ctx.fillStyle = rgba(palette.primary, 0.18)
    ctx.fillRect(x + 1, baseline - (peak * visualHeight), Math.max(4, barWidth - 3), 2)
  }
}

function drawLiveVisualizer (ctx, width, height, palette, analyser, frequencyData, waveformData, session, positionSeconds, visualizerState, albumArtImage) {
  analyser.getByteFrequencyData(frequencyData)
  analyser.getByteTimeDomainData(waveformData)

  const bars = sampleFrequencyBars(frequencyData)
  const averageEnergy = smoothFrequencyBars(bars, visualizerState)
  const maxBarLevel = Math.max(...visualizerState.bars, 0)
  const dynamicCeiling = updateDynamicCeiling(visualizerState, 'dynamicCeiling', maxBarLevel, averageEnergy > VISUALIZER_NOISE_FLOOR)

  drawBackground(ctx, width, height, palette, averageEnergy)

  const barWidth = width / VISUALIZER_BAR_COUNT
  const baseline = height
  const visualHeight = height * 0.74

  for (let barIndex = 0; barIndex < VISUALIZER_BAR_COUNT; barIndex++) {
    const normalized = scaleVisualizerLevel(visualizerState.bars[barIndex], dynamicCeiling)
    const peak = scaleVisualizerLevel(visualizerState.peaks[barIndex], dynamicCeiling)
    const barHeight = normalized * visualHeight
    const x = barIndex * barWidth
    const y = baseline - barHeight
    const fill = ctx.createLinearGradient(0, baseline, 0, y)
    fill.addColorStop(0, rgba(palette.primary, 0.04))
    fill.addColorStop(1, rgba(palette.primary, 0.24))
    ctx.fillStyle = fill
    ctx.fillRect(x + 1, y, Math.max(4, barWidth - 3), Math.max(8, barHeight))

    ctx.fillStyle = rgba(palette.primary, 0.18)
    ctx.fillRect(x + 1, baseline - (peak * visualHeight), Math.max(4, barWidth - 3), 2)
  }
}

function drawVisualizer (canvas, { palette, session, positionSeconds, analyser, frequencyData, waveformData, visualizerState, albumArtImage }) {
  const drawingContext = prepareCanvas(canvas)
  if (!drawingContext) return

  const { ctx, width, height } = drawingContext
  if (analyser && frequencyData && waveformData) {
    drawLiveVisualizer(ctx, width, height, palette, analyser, frequencyData, waveformData, session, positionSeconds, visualizerState, albumArtImage)
    return
  }

  if (visualizerState?.hostMeterSample) {
    drawHostMeterVisualizer(ctx, width, height, palette, session, positionSeconds, visualizerState, albumArtImage)
    return
  }

  drawIdleVisualizer(ctx, width, height, palette)
}

export default function MediaMusicPage () {
  const { connected, active, ready } = useSocket()
  const [mediaState, setMediaState] = useState(null)
  const [mediaError, setMediaError] = useState(null)
  const [transportPending, setTransportPending] = useState(null)
  const [displayPosition, setDisplayPosition] = useState(0)
  const [resolvedAlbumArtUrl, setResolvedAlbumArtUrl] = useState(null)
  const [hostVisualizerState, setHostVisualizerState] = useState({
    supported: false,
    active: false,
    peak: 0,
    channels: [],
    bands: [],
    error: null,
    updatedAt: 0
  })

  const canvasRef = useRef(null)
  const currentRef = useRef(null)
  const positionRef = useRef(0)
  const playbackAnchorRef = useRef(null)
  const paletteRef = useRef(DEFAULT_VISUALIZER_PALETTE)
  const animationFrameRef = useRef(null)
  const titleViewportRef = useRef(null)
  const titleCopyRef = useRef(null)
  const titleMeasureRef = useRef(null)
  const visualizerStateRef = useRef({
    bars: null,
    peaks: null,
    hostMeterHistory: [],
    hostMeterSample: null,
    hostBars: null,
    hostPeaks: null
  })
  const albumArtImageRef = useRef(null)
  const [titleMarquee, setTitleMarquee] = useState({
    active: false,
    distance: 0,
    duration: 0
  })

  const applyVisualizerState = useCallback((visualizer) => {
    if (!visualizer) {
      visualizerStateRef.current.hostMeterHistory = []
      visualizerStateRef.current.hostMeterSample = null
      visualizerStateRef.current.hostBars = null
      visualizerStateRef.current.hostPeaks = null
      setHostVisualizerState({
        supported: false,
        active: false,
        peak: 0,
        channels: [],
        bands: [],
        error: null,
        updatedAt: 0
      })
      return
    }

    const normalizedHistory = Array.isArray(visualizer.history)
      ? visualizer.history.map(normalizeMeterSample).filter(Boolean).slice(-HOST_METER_HISTORY_LIMIT)
      : []
    const normalizedSample = normalizeMeterSample(visualizer) || normalizedHistory[normalizedHistory.length - 1] || null

    visualizerStateRef.current.hostMeterHistory = normalizedHistory
    visualizerStateRef.current.hostMeterSample = normalizedSample
    setHostVisualizerState({
      supported: visualizer.supported !== false,
      active: visualizer.active === true,
      peak: clamp(Number(visualizer.peak) || 0, 0, 1),
      channels: Array.isArray(visualizer.channels) ? visualizer.channels.map(value => clamp(Number(value) || 0, 0, 1)) : [],
      bands: Array.isArray(visualizer.bands) ? visualizer.bands.map(value => clamp(Number(value) || 0, 0, 1)) : [],
      error: visualizer.error || null,
      updatedAt: Number(visualizer.updatedAt) || Date.now()
    })
  }, [])

  const updateMediaState = useCallback((nextState, options = {}) => {
    playbackAnchorRef.current = syncPlaybackAnchor(playbackAnchorRef.current, nextState, options)
    currentRef.current = nextState?.current || null
    positionRef.current = estimatePosition(playbackAnchorRef.current)
    setMediaState(nextState)
    applyVisualizerState(nextState?.visualizer || null)
    setDisplayPosition(positionRef.current)
    setMediaError(nextState?.error || null)
  }, [applyVisualizerState])

  const fetchState = useCallback(async ({ force = false, silent = false } = {}) => {
    if (!connected) return

    try {
      const nextState = await sendEvent('getSystemMediaSession', { force }, 8000)
      updateMediaState(nextState)
    } catch (e) {
      setMediaError(e.message || 'Failed to query Windows media session')
    }
  }, [connected, updateMediaState])

  const runTransport = useCallback(async (action) => {
    setTransportPending(action)
    try {
      const nextState = await sendEvent('systemMediaTransport', { action }, 10000)
      updateMediaState(nextState, { hardSync: true })
    } catch (e) {
      setMediaError(e.message || `Failed to run media action: ${action}`)
    } finally {
      setTransportPending(null)
    }
  }, [updateMediaState])

  useEffect(() => {
    if (!ready) return

    fetchState({ force: true })
    const pollId = setInterval(() => {
      fetchState({ silent: true })
    }, MEDIA_POLL_INTERVAL_MS)

    return () => clearInterval(pollId)
  }, [ready, fetchState])

  useEffect(() => {
    const tickId = setInterval(() => {
      const nextPosition = estimatePosition(playbackAnchorRef.current)
      positionRef.current = nextPosition
      setDisplayPosition(nextPosition)
    }, POSITION_TICK_INTERVAL_MS)

    return () => clearInterval(tickId)
  }, [])

  useEffect(() => {
    currentRef.current = mediaState?.current || null
  }, [mediaState])

  useEffect(() => {
    return eventListener('systemAudioMeter', (sample) => {
      const normalizedSample = normalizeMeterSample(sample)
      if (!normalizedSample) return

      visualizerStateRef.current.hostMeterHistory = visualizerStateRef.current.hostMeterHistory
        .concat(normalizedSample)
        .slice(-HOST_METER_HISTORY_LIMIT)
      visualizerStateRef.current.hostMeterSample = normalizedSample

      setHostVisualizerState(previousState => ({
        ...previousState,
        supported: true,
        active: true,
        peak: normalizedSample.peak,
        channels: normalizedSample.channels,
        bands: normalizedSample.bands,
        error: null,
        updatedAt: normalizedSample.updatedAt
      }))
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const albumArtUrl = getSessionArtwork(mediaState?.current)
    if (!albumArtUrl) {
      albumArtImageRef.current = null
      setResolvedAlbumArtUrl(null)
      return
    }

    const image = new window.Image()
    image.decoding = 'async'
    image.onload = () => {
      albumArtImageRef.current = image
      setResolvedAlbumArtUrl(albumArtUrl)
    }
    image.onerror = () => {
      albumArtImageRef.current = null
      setResolvedAlbumArtUrl(null)
    }
    image.src = albumArtUrl

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [mediaState])

  useEffect(() => {
    positionRef.current = displayPosition
  }, [displayPosition])

  useEffect(() => {
    if (typeof window === 'undefined') return

    paletteRef.current = getVisualizerPalette()
  }, [])

  useEffect(() => {
    const render = () => {
      if (canvasRef.current) {
        drawVisualizer(canvasRef.current, {
          palette: paletteRef.current,
          session: currentRef.current,
          positionSeconds: positionRef.current,
          analyser: null,
          frequencyData: null,
          waveformData: null,
          visualizerState: visualizerStateRef.current,
          albumArtImage: albumArtImageRef.current
        })
      }

      animationFrameRef.current = window.requestAnimationFrame(render)
    }

    animationFrameRef.current = window.requestAnimationFrame(render)

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const current = mediaState?.current || null
  const durationSeconds = current?.timeline?.endSeconds ?? playbackAnchorRef.current?.durationSeconds ?? 0
  const positionSeconds = displayPosition
  const progressPercent = durationSeconds > 0
    ? Math.max(0, Math.min(100, (positionSeconds / durationSeconds) * 100))
    : 0

  const canTogglePlayback = current
    ? (current.playbackStatus === 'Playing' ? current.controls?.canPause : current.controls?.canPlay)
    : false

  const albumArtUrl = resolvedAlbumArtUrl
  const hasAlbumArt = Boolean(albumArtUrl)
  const songTitle = current?.title || (mediaState?.available ? 'Unnamed track' : 'No active media session')
  const songArtist = current?.artist || (mediaState?.supported === false
    ? 'Windows media session API is unavailable on this system.'
    : 'Start playback in Spotify, a browser, or another supported media app.')
  const visualizerError = getVisualizerErrorMessage(hostVisualizerState.error)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const measureTitle = () => {
      const viewport = titleViewportRef.current
      const copy = titleMeasureRef.current || titleCopyRef.current
      if (!viewport || !copy) {
        return
      }

      const availableWidth = Math.floor(viewport.getBoundingClientRect().width)
      const titleWidth = Math.ceil(copy.getBoundingClientRect().width || copy.scrollWidth || 0)
      const overflow = Math.ceil(titleWidth - availableWidth)

      if (overflow > 0) {
        const distance = overflow + TITLE_SCROLL_GAP_PX
        setTitleMarquee(previousState => {
          if (previousState.active && previousState.distance === distance) {
            return previousState
          }

          return {
            active: true,
            distance,
            duration: distance / TITLE_SCROLL_SPEED_PX_PER_SECOND
          }
        })
        return
      }

      setTitleMarquee(previousState => {
        if (!previousState.active) {
          return previousState
        }

        return {
          active: false,
          distance: 0,
          duration: 0
        }
      })
    }

    const frameId = window.requestAnimationFrame(measureTitle)
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(() => measureTitle())
      : null

    if (resizeObserver) {
      if (titleViewportRef.current) resizeObserver.observe(titleViewportRef.current)
      if (titleMeasureRef.current) resizeObserver.observe(titleMeasureRef.current)
    }

    window.addEventListener('resize', measureTitle)

    return () => {
      window.cancelAnimationFrame(frameId)
      if (resizeObserver) resizeObserver.disconnect()
      window.removeEventListener('resize', measureTitle)
    }
  }, [songTitle])

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' navigation={MediaPanelNavItems('Music')}>
        <div className='music-panel'>
          <canvas ref={canvasRef} className='music-panel__visualizer music-panel__visualizer--background' />
          <div className='music-panel__scrim' />
          <div className={`music-panel__content${hasAlbumArt ? '' : ' music-panel__content--no-artwork'}`}>
            <header className='music-panel__header'>
              <p className='music-panel__eyebrow'>Now Playing</p>
              <h2 className={`music-panel__track-title ${titleMarquee.active ? 'music-panel__track-title--marquee' : ''}`}>
                <span ref={titleViewportRef} className='music-panel__track-title-viewport'>
                  <span
                    className='music-panel__track-title-track'
                    style={titleMarquee.active
                      ? {
                          '--music-title-scroll-distance': `${titleMarquee.distance}px`,
                          '--music-title-scroll-duration': `${Math.max(6, titleMarquee.duration).toFixed(2)}s`
                        }
                      : undefined}
                  >
                    <span ref={titleCopyRef} className='music-panel__track-title-copy'>{songTitle}</span>
                    {titleMarquee.active && (
                      <>
                        <span className='music-panel__track-title-gap' aria-hidden='true' />
                        <span className='music-panel__track-title-copy' aria-hidden='true'>{songTitle}</span>
                      </>
                    )}
                  </span>
                </span>
                <span ref={titleMeasureRef} className='music-panel__track-title-measure' aria-hidden='true'>{songTitle}</span>
              </h2>
              <p className='music-panel__track-subtitle'>{songArtist}</p>
            </header>

            {hasAlbumArt && (
              <div className='music-panel__artwork-stage'>
                <div className='music-panel__artwork-frame'>
                  <img src={albumArtUrl} alt={current?.album || current?.title || 'Album art'} className='music-panel__artwork-image' />
                </div>
              </div>
            )}

            <div className='music-panel__transport-bar'>
              <div className='music-panel__progress-row'>
                <span className='music-panel__progress-time'>{formatTime(positionSeconds)}</span>
                <div className='music-panel__progress-track' aria-hidden='true'>
                  <div className='music-panel__progress-fill' style={{ width: `${progressPercent}%` }} />
                </div>
                <span className='music-panel__progress-time'>{formatTime(durationSeconds)}</span>
              </div>

              <div className='music-panel__controls'>
                <button
                  type='button'
                  className='music-panel__control-button music-panel__control-button--secondary'
                  onClick={() => runTransport('previous')}
                  disabled={!current?.controls?.canPrevious || transportPending !== null}
                  aria-label='Previous track'
                >
                  <span className='music-panel__transport-icon music-panel__transport-icon--previous' aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className='music-panel__control-button music-panel__control-button--primary'
                  onClick={() => runTransport('playPause')}
                  disabled={!canTogglePlayback || transportPending !== null}
                  aria-label={current?.playbackStatus === 'Playing' ? 'Pause playback' : 'Play playback'}
                >
                  <span className={`music-panel__transport-icon ${current?.playbackStatus === 'Playing' ? 'music-panel__transport-icon--pause' : 'music-panel__transport-icon--play'}`} aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className='music-panel__control-button music-panel__control-button--secondary'
                  onClick={() => runTransport('next')}
                  disabled={!current?.controls?.canNext || transportPending !== null}
                  aria-label='Next track'
                >
                  <span className='music-panel__transport-icon music-panel__transport-icon--next' aria-hidden='true' />
                </button>
              </div>
            </div>

            {mediaError && (
              <p className='music-panel__message music-panel__message--error'>{mediaError}</p>
            )}

            {visualizerError && (
              <p className='music-panel__message music-panel__message--error'>{visualizerError}</p>
            )}
          </div>
        </div>
      </Panel>
    </Layout>
  )
}
