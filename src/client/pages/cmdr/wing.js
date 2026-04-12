import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { CmdrPanelNavItems } from 'lib/navigation-items'

export default function CmdrWingPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={CmdrPanelNavItems('Wing & Crew')}>
        <ComingSoonPanel
          title='Wing & Crew'
          description='View details about your wing members, multi-crew, and NPC crew.'
          features={[
            'Wing member details and locations',
            'Multi-crew status',
            'NPC crew management and stats'
          ]}
        />
      </Panel>
    </Layout>
  )
}
