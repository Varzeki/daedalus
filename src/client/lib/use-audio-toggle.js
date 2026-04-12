import { useState, useEffect, useRef } from 'react'
import { eventListener, socketOptions, setSocketOption } from 'lib/socket'

export default function useAudioToggle () {
  const [audioEnabled, setAudioEnabled] = useState(socketOptions.audioEnabled)
  const audioQueue = useRef([])
  const audioPlaying = useRef(false)

  function toggleAudio () {
    const newEnabled = !socketOptions.audioEnabled
    setSocketOption('audioEnabled', newEnabled)
    setAudioEnabled(newEnabled)
    document.activeElement.blur()
  }

  // Sync on mount (SSR hydration fix — localStorage may have true but SSR defaults to false)
  useEffect(() => {
    setAudioEnabled(socketOptions.audioEnabled)
  }, [])

  // Play a single WAV file via HTML5 Audio, returns a Promise
  function playWav (url) {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      audio.onended = resolve
      audio.onerror = resolve
      audio.play().catch(resolve)
    })
  }

  // Process the audio queue sequentially
  async function processQueue () {
    if (audioPlaying.current) return
    audioPlaying.current = true
    while (audioQueue.current.length > 0) {
      const { url, gap } = audioQueue.current.shift()
      await playWav(url)
      if (gap && audioQueue.current.length > 0) {
        await new Promise(r => setTimeout(r, gap))
      }
    }
    audioPlaying.current = false
  }

  // Listen for server voiceline broadcast events
  useEffect(() => {
    const cleanupSingle = eventListener('playVoiceline', (event) => {
      if (!socketOptions.audioEnabled) return
      audioQueue.current.push({ url: `/voicelines/${encodeURIComponent(event.file)}`, gap: 500 })
      processQueue()
    })

    const cleanupSequence = eventListener('playVoicelineSequence', (event) => {
      if (!socketOptions.audioEnabled) return
      const { files, gap } = event
      if (!files || !files.length) return
      // Clear queue for countdown sequences (matches server behavior)
      audioQueue.current = []
      for (const file of files) {
        audioQueue.current.push({ url: `/voicelines/${encodeURIComponent(file)}`, gap: gap || 400 })
      }
      processQueue()
    })

    return () => { cleanupSingle(); cleanupSequence() }
  }, [])

  return { audioEnabled, toggleAudio }
}
