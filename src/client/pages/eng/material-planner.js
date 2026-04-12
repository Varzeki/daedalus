import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { EngineeringPanelNavItems } from 'lib/navigation-items'

export default function EngineeringMaterialPlannerPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Material Planner')}>
        <ComingSoonPanel
          title='Material Collection Planner'
          description='Plan material collection routes based on your location and collection methods.'
          features={[
            'Route to nearby material collection points',
            'Engineer visit planning',
            'Material trader visit planning',
            'Optimised multi-stop collection routes'
          ]}
        />
      </Panel>
    </Layout>
  )
}
