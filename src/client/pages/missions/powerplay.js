import { useState, useEffect } from 'react'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import PowerplayPanel from 'components/panels/missions/powerplay-panel'
import { MissionsPanelNavItems } from 'lib/navigation-items'

const PP_LOG_EVENTS = [
  'Powerplay', 'PowerplayMerits', 'PowerplayRank',
  'PowerplayJoin', 'PowerplayLeave', 'PowerplayDefect',
  'FSDJump', 'Location'
]

export default function MissionsPowerplayPage () {
  const { connected, active, ready } = useSocket()
  const [powerplay, setPowerplay] = useState()

  useEffect(() => {
    ;(async () => {
      if (!connected) return
      setPowerplay(await sendEvent('getPowerplay'))
    })()
  }, [connected, ready])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (PP_LOG_EVENTS.includes(log.event)) {
      setPowerplay(await sendEvent('getPowerplay'))
    }
  }), [])

  useEffect(() => eventListener('gameStateChange', async () => {
    setPowerplay(await sendEvent('getPowerplay'))
  }), [])

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MissionsPanelNavItems('Powerplay')}>
        <PowerplayPanel powerplay={powerplay} />
      </Panel>
    </Layout>
  )
}
