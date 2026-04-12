import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ControlsPanelNavItems } from 'lib/navigation-items'

export default function ControlsKeybindsPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ControlsPanelNavItems('Keybinds')}>
        <ComingSoonPanel
          title='Keybinds'
          description='Browse and search your in-game keybindings at a glance.'
          features={[
            'EDRefCard-style keybind overview',
            'Search keybinds by action or key',
            'Keyboard, controller, and HOTAS layouts',
            'X56 / other device visualisation'
          ]}
        />
      </Panel>
    </Layout>
  )
}
