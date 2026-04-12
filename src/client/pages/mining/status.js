import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MiningPanelNavItems } from 'lib/navigation-items'

export default function MiningStatusPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MiningPanelNavItems('Status')}>
        <ComingSoonPanel
          title='Mining Status'
          description='Real-time mining assistant with prospector analysis and refinery tracking.'
          features={[
            'Prospector limpet asteroid composition',
            'Refinery status and input tracking',
            'Configurable target minerals and yield highlighting',
            'Limpet status bar (remaining limpets)',
            'Nearby and best sale locations for target materials'
          ]}
        />
      </Panel>
    </Layout>
  )
}
