import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { TradePanelNavItems } from 'lib/navigation-items'

export default function TradePtnPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={TradePanelNavItems('PTN')}>
        <ComingSoonPanel
          title='PTN Integration'
          description='Pilots Trade Network integration for carrier trading and community hauling.'
          features={[
            'Booze Cruise tracking',
            'Carrier trading opportunities',
            'Community hauling events'
          ]}
        />
      </Panel>
    </Layout>
  )
}
