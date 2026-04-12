import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { CmdrPanelNavItems } from 'lib/navigation-items'

export default function CmdrCommunityGoalsPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={CmdrPanelNavItems('Community Goals')}>
        <ComingSoonPanel
          title='Community Goals'
          description='Track ongoing and historical community events.'
          features={[
            'Ongoing community goals with rewards and progress',
            'Historical community events and results',
            'Copy system name for travel'
          ]}
        />
      </Panel>
    </Layout>
  )
}
