import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { CmdrPanelNavItems } from 'lib/navigation-items'

export default function CmdrSessionPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={CmdrPanelNavItems('Session')}>
        <ComingSoonPanel
          title='Session Summary'
          description='Track your progress and activity during the current play session.'
          features={[
            'Credits earned and spent with breakdowns',
            'Distance travelled and systems visited',
            'Commodities bought and sold',
            'Materials gathered',
            'First discoveries',
            'Rank progress by percentage'
          ]}
        />
      </Panel>
    </Layout>
  )
}
