import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { TradePanelNavItems } from 'lib/navigation-items'

export default function TradeRoutesPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={TradePanelNavItems('Routes')}>
        <ComingSoonPanel
          title='Trade Routes'
          description='Plan and optimise multi-hop trade routes across the galaxy.'
          features={[
            'Multi-hop trade route calculator',
            'Profit per ton and per hour estimates'
          ]}
        />
      </Panel>
    </Layout>
  )
}
