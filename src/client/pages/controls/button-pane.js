import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ControlsPanelNavItems } from 'lib/navigation-items'

export default function ControlsButtonPanePage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ControlsPanelNavItems('Button Pane')}>
        <ComingSoonPanel
          title='Custom Button Pane'
          description='Create a fully customisable touch-friendly control panel bound to in-game actions.'
          features={[
            'Drag and drop switches, sliders, and buttons onto a grid',
            'Bind each element to in-game keybinds',
            'Click to activate functions in-game',
            'Create multiple layouts'
          ]}
        />
      </Panel>
    </Layout>
  )
}
