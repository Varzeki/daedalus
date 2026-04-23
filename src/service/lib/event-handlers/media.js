'use strict'

const systemMediaSession = require('../system-media-session')
const systemAudioMeter = require('../system-audio-meter')

class Media {
  async getSystemMediaSession ({ force = false } = {}) {
    const mediaState = await systemMediaSession.getState({ force })
    const visualizer = await systemAudioMeter.getState(mediaState.current)

    return {
      ...mediaState,
      visualizer
    }
  }

  async systemMediaTransport ({ action }) {
    const allowed = ['playPause', 'play', 'pause', 'next', 'previous']
    if (!allowed.includes(action)) throw new Error(`Unsupported media action: ${action}`)
    const mediaState = await systemMediaSession.transport(action)
    const visualizer = await systemAudioMeter.getState(mediaState.current)

    return {
      ...mediaState,
      visualizer
    }
  }

  getHandlers () {
    return {
      getSystemMediaSession: (msg) => this.getSystemMediaSession(msg),
      systemMediaTransport: (msg) => this.systemMediaTransport(msg)
    }
  }
}

module.exports = Media