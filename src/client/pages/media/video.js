import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { MediaPanelNavItems } from 'lib/navigation-items'

// State machine: idle | searching | results | channel | downloading | playing
const STATES = { IDLE: 'idle', SEARCHING: 'searching', RESULTS: 'results', CHANNEL: 'channel', DOWNLOADING: 'downloading', PLAYING: 'playing' }

function formatDuration (seconds) {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SearchBar ({ onSearch, onPaste, disabled }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    // Detect if it's a YouTube URL or a search query
    const isUrl = /^https?:\/\//i.test(input.trim()) || /youtu\.?be/i.test(input.trim())
    if (isUrl) {
      onPaste(input.trim())
    } else {
      onSearch(input.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
      <input
        ref={inputRef}
        type='text'
        value={input}
        onChange={e => setInput(e.target.value)}
        onFocus={() => setInput('')}
        placeholder='Search YouTube or paste a link…'
        disabled={disabled}
        style={{ flex: 1 }}
      />
      <button type='submit' disabled={disabled || !input.trim()}>
        <i className='icon daedalus-terminal-search' /> Search
      </button>
    </form>
  )
}

function ChannelIcon ({ className, style }) {
  return (
    <svg className={className} style={style} viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='12' cy='8' r='4' />
      <path d='M12 14c-6 0-8 3-8 5v1h16v-1c0-2-2-5-8-5z' />
    </svg>
  )
}

function SearchResults ({ results, matchedChannel, onSelect, onChannelClick }) {
  if ((!results || results.length === 0) && !matchedChannel) {
    return <p className='text-muted' style={{ textAlign: 'center', padding: '2rem' }}>No results found.</p>
  }

  // Extract unique channels from results (excluding the matched channel if present)
  const seenChannels = new Set()
  if (matchedChannel) seenChannels.add(matchedChannel.url)
  const channels = []
  for (const r of results) {
    if (r.channelUrl && r.uploader && !seenChannels.has(r.channelUrl)) {
      seenChannels.add(r.channelUrl)
      channels.push({ name: r.uploader, url: r.channelUrl })
    }
  }

  return (
    <div className='video-panel__results'>
      {matchedChannel && (
        <button
          className='video-panel__channel-card'
          onClick={() => onChannelClick(matchedChannel)}
        >
          <ChannelIcon className='video-panel__channel-icon' />
          <div>
            <div className='video-panel__channel-card-name'>{matchedChannel.name}</div>
            <div className='text-muted' style={{ fontSize: '.85rem' }}>Browse channel videos</div>
          </div>
        </button>
      )}
      {channels.length > 0 && (
        <div className='video-panel__channels'>
          {channels.map(ch => (
            <button
              key={ch.url}
              className='video-panel__channel-tag'
              onClick={() => onChannelClick(ch)}
            >
              <ChannelIcon className='video-panel__channel-icon' style={{ width: '1rem', height: '1rem', marginRight: '.25rem', verticalAlign: 'middle' }} />{ch.name}
            </button>
          ))}
        </div>
      )}
      {results.map(r => (
        <button
          key={r.id}
          className='video-panel__result'
          onClick={() => onSelect(r)}
        >
          {r.thumbnail && (
            <img
              src={r.thumbnail}
              alt=''
              className='video-panel__result-thumb'
            />
          )}
          <div className='video-panel__result-info'>
            <span className='video-panel__result-title'>{r.title}</span>
            <span className='text-muted'>
              {r.uploader && <>{r.uploader} &middot; </>}
              {formatDuration(r.duration)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function DownloadProgress ({ videoId, title, percent }) {
  return (
    <div className='video-panel__download'>
      <p style={{ marginBottom: '.5rem' }}>
        <span className='text-primary'>Downloading</span>
        {title && <span className='text-muted'> — {title}</span>}
      </p>
      <progress value={percent || 0} max={100} style={{ width: '100%' }} />
      <p className='text-muted' style={{ marginTop: '.25rem', fontSize: '.9rem' }}>
        {percent != null ? `${percent.toFixed(1)}%` : 'Starting…'}
      </p>
    </div>
  )
}

function VideoPlayer ({ fileName, title, onBack }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const seekRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setCurrentTime(v.currentTime)
    const onDur = () => setDuration(v.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onDur)
    v.addEventListener('durationchange', onDur)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onDur)
      v.removeEventListener('durationchange', onDur)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play() : v.pause()
  }

  const handleSeek = (e) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = (parseFloat(e.target.value) / 100) * v.duration
  }

  const handleVolume = (e) => {
    const v = videoRef.current
    const val = parseFloat(e.target.value) / 100
    setVolume(val)
    if (v) v.volume = val
    if (val > 0 && muted) { setMuted(false); if (v) v.muted = false }
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const toggleFullscreen = () => {
    const frame = videoRef.current?.closest('.video-panel__player-frame')
    if (!frame) return
    document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen()
  }

  const seekPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className='video-panel__player-wrapper'>
      <div className='video-panel__player-header'>
        <button onClick={onBack} className='button--transparent' style={{ padding: '.25rem .75rem' }}>
          ← Back
        </button>
        {title && <span className='text-primary' style={{ marginLeft: '.5rem' }}>{title}</span>}
      </div>
      <div className='video-panel__player-frame'>
        <video
          ref={videoRef}
          src={`/videos/${encodeURIComponent(fileName)}`}
          autoPlay
          onClick={togglePlay}
          className='video-panel__video'
        />
        <div className='video-panel__scanlines' />
        <div className='video-panel__vignette' />
        <div className='video-panel__controls'>
          <button onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            ref={seekRef}
            type='range'
            min='0'
            max='100'
            step='0.1'
            value={seekPercent}
            onChange={handleSeek}
            className='video-panel__controls-seek'
          />
          <span className='video-panel__controls-time'>
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
          <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={muted || volume === 0 ? { opacity: 0.4 } : undefined}>
            <i className='icon daedalus-terminal-sound' />
        </button>
        <input
          type='range'
          min='0'
          max='100'
          value={muted ? 0 : volume * 100}
          onChange={handleVolume}
          className='video-panel__controls-volume'
        />
        <button onClick={toggleFullscreen} title='Fullscreen'>
          <i className='icon daedalus-terminal-fullscreen' />
        </button>
      </div>
      </div>
    </div>
  )
}

export default function MediaVideoPage () {
  const { connected, active, ready } = useSocket()
  const [state, setState] = useState(STATES.IDLE)
  const [results, setResults] = useState([])
  const [matchedChannel, setMatchedChannel] = useState(null)
  const [channelName, setChannelName] = useState(null)
  const [channelVideos, setChannelVideos] = useState([])
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [playingFile, setPlayingFile] = useState(null)
  const [error, setError] = useState(null)

  // Listen for download progress broadcasts
  useEffect(() => {
    const cleanupProgress = eventListener('videoDownloadProgress', (msg) => {
      setDownloadProgress(msg)
    })
    const cleanupComplete = eventListener('videoDownloadComplete', (msg) => {
      setPlayingFile(msg.fileName)
      setState(STATES.PLAYING)
      setDownloadProgress(null)
    })
    const cleanupError = eventListener('videoDownloadError', (msg) => {
      setError(msg.error || 'Download failed')
      setState(STATES.RESULTS)
      setDownloadProgress(null)
    })
    return () => {
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    }
  }, [])

  const handleSearch = useCallback(async (query) => {
    setState(STATES.SEARCHING)
    setError(null)
    try {
      const res = await sendEvent('videoSearch', { query })
      // search now returns { videos, channel }
      setResults(res?.videos || res || [])
      setMatchedChannel(res?.channel || null)
      setState(STATES.RESULTS)
    } catch (e) {
      setError(e.message || 'Search failed')
      setState(STATES.IDLE)
    }
  }, [])

  const handlePaste = useCallback(async (url) => {
    setState(STATES.SEARCHING)
    setError(null)
    try {
      const info = await sendEvent('videoGetInfo', { url })
      if (info) {
        setSelectedVideo(info)
        // Start downloading immediately for pasted URLs
        setState(STATES.DOWNLOADING)
        sendEvent('videoDownload', { url }, 300000).catch(() => {})
      }
    } catch (e) {
      setError(e.message || 'Failed to get video info')
      setState(STATES.IDLE)
    }
  }, [])

  const handleSelect = useCallback((video) => {
    setSelectedVideo(video)
    setState(STATES.DOWNLOADING)
    setError(null)
    sendEvent('videoDownload', { url: video.url || video.id }, 300000).catch(() => {})
  }, [])

  const handleChannelClick = useCallback(async (channel) => {
    setState(STATES.SEARCHING)
    setError(null)
    try {
      const videos = await sendEvent('videoGetChannelVideos', { channelUrl: channel.url })
      setChannelName(channel.name)
      setChannelVideos(videos || [])
      setState(STATES.CHANNEL)
    } catch (e) {
      setError(e.message || 'Failed to load channel')
      setState(STATES.RESULTS)
    }
  }, [])

  const handleBack = useCallback(() => {
    if (state === STATES.PLAYING || state === STATES.DOWNLOADING) {
      if (channelVideos.length > 0) {
        setState(STATES.CHANNEL)
      } else if (results.length > 0) {
        setState(STATES.RESULTS)
      } else {
        setState(STATES.IDLE)
      }
    } else if (state === STATES.CHANNEL) {
      setState(results.length > 0 ? STATES.RESULTS : STATES.IDLE)
      setChannelVideos([])
      setChannelName(null)
    } else {
      setState(STATES.IDLE)
    }
    setPlayingFile(null)
    setSelectedVideo(null)
  }, [results, channelVideos, state])

  const isSearchDisabled = state === STATES.SEARCHING || state === STATES.DOWNLOADING

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' navigation={MediaPanelNavItems('Video & Music')}>
        <div className='video-panel'>
          <SearchBar
            onSearch={handleSearch}
            onPaste={handlePaste}
            disabled={isSearchDisabled}
          />

          {error && (
            <p className='text-danger' style={{ marginBottom: '1rem' }}>{error}</p>
          )}

          {state === STATES.SEARCHING && (
            <p className='text-muted' style={{ textAlign: 'center', padding: '2rem' }}>Searching…</p>
          )}

          {state === STATES.RESULTS && (
            <SearchResults results={results} matchedChannel={matchedChannel} onSelect={handleSelect} onChannelClick={handleChannelClick} />
          )}

          {state === STATES.CHANNEL && (
            <div className='video-panel__results'>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                <button onClick={handleBack} className='button--transparent' style={{ padding: '.25rem .75rem' }}>
                  ← Back
                </button>
                <span className='text-primary' style={{ fontWeight: 700 }}>{channelName}</span>
              </div>
              {channelVideos.map(r => (
                <button
                  key={r.id}
                  className='video-panel__result'
                  onClick={() => handleSelect(r)}
                >
                  {r.thumbnail && (
                    <img src={r.thumbnail} alt='' className='video-panel__result-thumb' />
                  )}
                  <div className='video-panel__result-info'>
                    <span className='video-panel__result-title'>{r.title}</span>
                    <span className='text-muted'>{formatDuration(r.duration)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {state === STATES.DOWNLOADING && (
            <DownloadProgress
              videoId={selectedVideo?.id}
              title={selectedVideo?.title}
              percent={downloadProgress?.percent}
            />
          )}

          {state === STATES.PLAYING && playingFile && (
            <VideoPlayer
              fileName={playingFile}
              title={selectedVideo?.title}
              onBack={handleBack}
            />
          )}
        </div>
      </Panel>
    </Layout>
  )
}
