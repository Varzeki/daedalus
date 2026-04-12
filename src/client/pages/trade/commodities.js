import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { TradePanelNavItems } from 'lib/navigation-items'

export default function TradeCommoditiesPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={TradePanelNavItems('Commodities')}>
        <ComingSoonPanel
          title='Commodities'
          description='Browse and compare commodity prices across stations.'
          features={[
            'Commodity price browser (Ardent Insight-style)',
            'Best buy/sell locations'
          ]}
        />
      </Panel>
    </Layout>
  )
}
