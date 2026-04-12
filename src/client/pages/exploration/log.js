import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ExplorationPanelNavItems } from 'lib/navigation-items'

export default function ExplorationLogPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ExplorationPanelNavItems('Log')}>
        <ComingSoonPanel
          title='Exploration Log'
          description='A journal of your expedition with maps and statistics.'
          features={[
            'Systems visited log',
            'Journal of expedition',
            'Map visualising path taken',
            'Stats like furthest distance from Sol'
          ]}
        />
      </Panel>
    </Layout>
  )
}
