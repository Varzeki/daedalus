import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ExplorationPanelNavItems } from 'lib/navigation-items'

export default function ExplorationInventoryPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ExplorationPanelNavItems('Inventory')}>
        <ComingSoonPanel
          title='Exploration Inventory'
          description='Track items scanned but not yet handed in, with value and discovery status.'
          features={[
            'Items scanned but not handed in',
            'First discovery status',
            'Value and terraform icons',
            'Scan, DSS, and footfall status',
            'Biologicals discovered',
            'Categorised by system',
            'Totals for credits and first discoveries'
          ]}
        />
      </Panel>
    </Layout>
  )
}
