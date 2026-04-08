const { UNKNOWN_VALUE } = require('../../shared/consts')

// https://www.edsm.net/en_GB/api-v1
// Most endpoints take systemName or systemId
// https://www.edsm.net/api-v1/system
// https://www.edsm.net/api-system-v1/estimated-value
// https://www.edsm.net/api-system-v1/bodies
// https://www.edsm.net/api-system-v1/stations
// https://www.edsm.net/api-system-v1/stations/market
// https://www.edsm.net/api-system-v1/stations/shipyard

const axios = require('axios')
const retry = require('async-retry')

const baseUrl = 'https://www.edsm.net/'
const axiosConfig = {
  headers: { 'User-Agent': 'DAEDALUS-Terminal/1.0.0' },
  timeout: 15000
}

class EDSM {
  static async bodies (systemName) {
    return await retry(async (bail, attempt) => {
      try {
        const res = await axios.get(`${baseUrl}api-system-v1/bodies?systemName=${encodeURIComponent(systemName)}`, axiosConfig)
        return res.data.bodies
      } catch (e) {
        if (e.response && e.response.status >= 400 && e.response.status < 500) bail(e)
        throw e
      }
    }, {
      retries: 3
    })
  }

  static async bodiesWithCount (systemName) {
    return await retry(async (bail, attempt) => {
      try {
        const res = await axios.get(`${baseUrl}api-system-v1/bodies?systemName=${encodeURIComponent(systemName)}`, axiosConfig)
        return { bodies: res.data.bodies ?? [], bodyCount: res.data.bodyCount ?? null }
      } catch (e) {
        if (e.response && e.response.status >= 400 && e.response.status < 500) bail(e)
        throw e
      }
    }, {
      retries: 3
    })
  }

  static async stations (systemName) {
    return await retry(async (bail, attempt) => {
      try {
        const res = await axios.get(`${baseUrl}api-system-v1/stations?systemName=${encodeURIComponent(systemName)}`, axiosConfig)
        return res.data.stations
      } catch (e) {
        if (e.response && e.response.status >= 400 && e.response.status < 500) bail(e)
        throw e
      }
    }, {
      retries: 3
    })
  }

  static async system (systemName) {
    return await retry(async (bail, attempt) => {
      try {
        const resSystem = await axios.get(`${baseUrl}api-v1/system?systemName=${encodeURIComponent(systemName)}&showInformation=1&showCoordinates=1`, axiosConfig)
        const resBodies = await axios.get(`${baseUrl}api-system-v1/bodies?systemName=${encodeURIComponent(systemName)}`, axiosConfig)
        const resStations = await axios.get(`${baseUrl}api-system-v1/stations?systemName=${encodeURIComponent(systemName)}`, axiosConfig)
        return {
          name: resSystem?.data?.name ?? UNKNOWN_VALUE,
          address: resSystem?.data?.address ?? UNKNOWN_VALUE,
          position: resSystem?.data?.coords ? [resSystem?.data?.coords.x, resSystem?.data?.coords.y, resSystem?.data?.coords.z] : null,
          allegiance: resSystem?.data?.information?.allegiance ?? UNKNOWN_VALUE,
          government: resSystem?.data?.information?.government ?? UNKNOWN_VALUE,
          security: resSystem?.data?.information?.security ? `${resSystem.data.information.security} Security` : UNKNOWN_VALUE,
          state: resSystem?.data?.information?.factionState ?? UNKNOWN_VALUE,
          economy: {
            primary: resSystem?.data?.information?.economy ?? UNKNOWN_VALUE,
            secondary: resSystem?.data?.information?.secondEconomy ?? UNKNOWN_VALUE
          },
          population: resSystem?.data?.information?.population ?? UNKNOWN_VALUE,
          faction: resSystem?.data?.information?.faction ?? UNKNOWN_VALUE,
          bodies: resBodies?.data?.bodies ?? [],
          bodyCount: resBodies?.data?.bodyCount ?? null,
          stations: resStations?.data?.stations ?? []
        }
      } catch (e) {
        if (e.response && e.response.status >= 400 && e.response.status < 500) bail(e)
        throw e
      }
    }, {
      retries: 3
    })
  }
}

module.exports = EDSM
