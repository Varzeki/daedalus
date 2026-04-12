import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { MediaPanelNavItems } from 'lib/navigation-items'

export default function MediaGalNetPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MediaPanelNavItems('GalNet')}>
        <ComingSoonPanel
          title='GalNet News'
          description='Read the latest GalNet articles integrated into the terminal.'
          features={[
            'GalNet article browser (Ardent Insight-inspired)',
            'Article history and archive',
            'Search and filter articles'
          ]}
        />
      </Panel>
    </Layout>
  )
}
