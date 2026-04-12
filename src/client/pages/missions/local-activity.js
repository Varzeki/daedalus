import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MissionsPanelNavItems } from 'lib/navigation-items'

export default function MissionsLocalActivityPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MissionsPanelNavItems('Local Activity')}>
        <ComingSoonPanel
          title='Local Activity Advisor'
          description='Discover nearby notable systems for specific activities.'
          features={[
            'Nearby engineering material sources',
            'Engineer locations',
            'Useful system states and POIs',
            'Mining hotspots',
            'Powerplay activity',
            'Rare events and Thargoid activity',
            'Activity recommendations'
          ]}
        />
      </Panel>
    </Layout>
  )
}
