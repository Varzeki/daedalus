import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { EngineeringPanelNavItems } from 'lib/navigation-items'

export default function EngineeringWishlistPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Wishlist')}>
        <ComingSoonPanel
          title='Engineering Wishlist'
          description='Track engineering targets and materials (Ed Odyssey Material Helper-style).'
          features={[
            'Engineering wishlist and targets',
            'Material tracker',
            'Trade calculations including multi-trade routes'
          ]}
        />
      </Panel>
    </Layout>
  )
}
