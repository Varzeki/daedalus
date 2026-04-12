import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { CmdrPanelNavItems } from 'lib/navigation-items'

export default function CmdrOverviewPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={CmdrPanelNavItems('Overview')}>
        <ComingSoonPanel
          title='Commander'
          description='View your commander profile, ranks, and reputation at a glance.'
          features={[
            'Rank status across all categories',
            'Faction reputations',
            'Credits to next level with progress bars'
          ]}
        />
      </Panel>
    </Layout>
  )
}
