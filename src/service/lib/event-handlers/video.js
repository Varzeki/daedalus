'use strict'

const videoManager = require('../video-manager')

class Video {
  constructor () {}

  async videoSearch ({ query }) {
    if (!query || typeof query !== 'string') throw new Error('Missing search query')
    return videoManager.search(query.trim())
  }

  async videoGetInfo ({ url }) {
    if (!url || typeof url !== 'string') throw new Error('Missing video URL or ID')
    return videoManager.getVideoInfo(url.trim())
  }

  async videoGetChannelVideos ({ channelUrl }) {
    if (!channelUrl || typeof channelUrl !== 'string') throw new Error('Missing channel URL')
    return videoManager.getChannelVideos(channelUrl.trim())
  }

  async videoDownload ({ url }) {
    if (!url || typeof url !== 'string') throw new Error('Missing video URL or ID')
    return videoManager.download(url.trim())
  }

  async videoCancelDownload () {
    videoManager.cancelDownload()
    return { cancelled: true }
  }

  async videoGetCached () {
    return videoManager.listCached()
  }

  async videoCheckStatus () {
    return {
      available: videoManager.ytdlpAvailable()
    }
  }

  getHandlers () {
    return {
      videoSearch: (msg) => this.videoSearch(msg),
      videoGetInfo: (msg) => this.videoGetInfo(msg),
      videoGetChannelVideos: (msg) => this.videoGetChannelVideos(msg),
      videoDownload: (msg) => this.videoDownload(msg),
      videoCancelDownload: () => this.videoCancelDownload(),
      videoGetCached: () => this.videoGetCached(),
      videoCheckStatus: () => this.videoCheckStatus()
    }
  }
}

module.exports = Video
