import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ShipPanelNavItems } from 'lib/navigation-items'

export default function ShipStatsPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ShipPanelNavItems('Stats')}>
        <ComingSoonPanel
          title='Ship Stats'
          description='Detailed ship statistics and module analysis (EDSY-style).'
          features={[
            'Comprehensive ship stats overview',
            'Recommended common module changes',
            'Uncommon module highlights',
            'Suggested engineering improvements and upgrades',
            'Click to add engineering to wishlist or copy closest sale location'
          ]}
        />
      </Panel>
    </Layout>
  )
}
