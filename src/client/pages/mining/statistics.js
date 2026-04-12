import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MiningPanelNavItems } from 'lib/navigation-items'

export default function MiningStatisticsPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MiningPanelNavItems('Statistics')}>
        <ComingSoonPanel
          title='Mining Statistics'
          description='Rate graphs, earnings tracking, and mining performance analysis.'
          features={[
            'Mining rate graphs',
            'Rate per hour and credits per hour',
            'Check additional features of Elite Observatory mining plugin for more'
          ]}
        />
      </Panel>
    </Layout>
  )
}
