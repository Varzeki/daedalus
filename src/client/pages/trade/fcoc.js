import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { TradePanelNavItems } from 'lib/navigation-items'

export default function TradeFcocPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={TradePanelNavItems('FCOC')}>
        <ComingSoonPanel
          title='FCOC Integration'
          description='Fleet Carrier Owners Club integration for carrier departures and travel status.'
          features={[
            'Carrier departure schedules',
            'Travel status and tracking',
            'Community carrier routes'
          ]}
        />
      </Panel>
    </Layout>
  )
}
