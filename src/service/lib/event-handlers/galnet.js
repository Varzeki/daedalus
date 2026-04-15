'use strict'

const axios = require('axios')

const GALNET_API_URL = 'https://cms.zaonce.net/en-GB/jsonapi/node/galnet_article?&sort=-published_at&page[offset]=0&page[limit]=24'
const GALNET_IMAGE_CDN = 'https://hosting.zaonce.net/elite-dangerous/galnet/'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

class Galnet {
  constructor () {
    this._cache = null
    this._cacheTime = 0
  }

  async galnetGetArticles () {
    const now = Date.now()
    if (this._cache && (now - this._cacheTime) < CACHE_TTL_MS) {
      return this._cache
    }
    const articles = await this._fetchArticles()
    this._cache = articles
    this._cacheTime = now
    return articles
  }

  async galnetRefresh () {
    this._cache = null
    this._cacheTime = 0
    return this.galnetGetArticles()
  }

  async _fetchArticles () {
    const res = await axios.get(GALNET_API_URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'DAEDALUS-Terminal/1.0' }
    })

    const data = res.data?.data
    if (!Array.isArray(data)) return []

    return data.map(item => {
      const attrs = item.attributes
      const imageField = attrs.field_galnet_image
      return {
        id: attrs.field_galnet_guid || item.id,
        title: attrs.title || 'Untitled',
        content: attrs.body?.value || '',
        date: attrs.field_galnet_date || null,
        image: imageField ? `${GALNET_IMAGE_CDN}${imageField}.png` : null,
        link: `https://community.elitedangerous.com/galnet/uid/${attrs.field_galnet_guid}`,
        slug: attrs.field_slug || null
      }
    })
  }

  getHandlers () {
    return {
      galnetGetArticles: () => this.galnetGetArticles(),
      galnetRefresh: () => this.galnetRefresh()
    }
  }
}

module.exports = Galnet
