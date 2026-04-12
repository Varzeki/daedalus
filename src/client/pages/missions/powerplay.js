import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MissionsPanelNavItems } from 'lib/navigation-items'

export default function MissionsPowerplayPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MissionsPanelNavItems('Powerplay')}>
        <ComingSoonPanel
          title='Powerplay'
          description='Track your power alignment, merits, and nearby powerplay activity.'
          features={[
            'Current power alignment and rank',
            'Nearby powerplay systems',
            'Activity descriptions and strategies',
            'Merit tracking and unlocks'
          ]}
        />
      </Panel>
    </Layout>
  )
}
