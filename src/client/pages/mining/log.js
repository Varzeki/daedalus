import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MiningPanelNavItems } from 'lib/navigation-items'

export default function MiningLogPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MiningPanelNavItems('Log')}>
        <ComingSoonPanel
          title='Mining Log'
          description='Historical log of mining activity and asteroid data.'
          features={[
            'Asteroid and material log',
            'Mining session history',
            'Materials mined and quantities'
          ]}
        />
      </Panel>
    </Layout>
  )
}
