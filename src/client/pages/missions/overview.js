import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MissionsPanelNavItems } from 'lib/navigation-items'

export default function MissionsOverviewPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MissionsPanelNavItems('Missions')}>
        <ComingSoonPanel
          title='Missions'
          description='Track all active missions with detailed progress information.'
          features={[
            'Mission progress tracking',
            'Rewards and expiry timers',
            'Faction and system details',
            'Commodity requirements',
            'Mission history'
          ]}
        />
      </Panel>
    </Layout>
  )
}
