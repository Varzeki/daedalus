import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MediaPanelNavItems } from 'lib/navigation-items'

export default function MediaVideoPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MediaPanelNavItems('Video & Music')}>
        <ComingSoonPanel
          title='Media'
          description='In-terminal video and music integration with an immersive overlay.'
          features={[
            'Video player with fuzzy border / scanline effect',
            'Music controller'
          ]}
        />
      </Panel>
    </Layout>
  )
}
