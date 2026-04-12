import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { NavPanelNavItems } from 'lib/navigation-items'

export default function NavNeutronPlotterPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={NavPanelNavItems('Neutron Plotter')}>
        <ComingSoonPanel
          title='Neutron Route Plotter'
          description='Plot neutron-boosted routes based on your ship stats and destination.'
          features={[
            'Neutron route plotting using Spansh API',
            'Based on in-game ship stats',
            'Uses currently plotted destination',
            'Jump-by-jump route display'
          ]}
        />
      </Panel>
    </Layout>
  )
}
