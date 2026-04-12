import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ShipPanelNavItems } from 'lib/navigation-items'

export default function ShipFleetPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ShipPanelNavItems('Fleet')}>
        <ComingSoonPanel
          title='Fleet Manager'
          description='Manage all your ships, modules, and engineering across your fleet.'
          features={[
            'All owned ships and locations',
            'Outfitting modules and engineering status',
            'Transfer cost and time estimates',
            'Rebuy values',
            'Details of installed modules on ships'
          ]}
        />
      </Panel>
    </Layout>
  )
}
