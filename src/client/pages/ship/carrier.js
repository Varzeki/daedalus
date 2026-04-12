import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ShipPanelNavItems } from 'lib/navigation-items'

export default function ShipCarrierPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ShipPanelNavItems('Carrier')}>
        <ComingSoonPanel
          title='Fleet Carrier'
          description='Manage your fleet carrier operations and logistics.'
          features={[
            'Carrier inventory and services',
            'Load and unload planning',
            'Automatic market arbitrage recommendations',
            'Fuel management and route planning'
          ]}
        />
      </Panel>
    </Layout>
  )
}
