import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import ComingSoonPanel from 'components/panels/coming-soon-panel'
import { ExplorationPanelNavItems } from 'lib/navigation-items'

export default function ExplorationBiologicalsPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={ExplorationPanelNavItems('Biologicals')}>
        <ComingSoonPanel
          title='Biologicals'
          description='SRVSurvey-style biological tracking and colony distance analysis.'
          features={[
            'Colony distance and sample tracking',
            'Auto switch when on ground near biologicals',
            'Information about finding biologicals on the planet',
            'Distance circles for colonies and samples'
          ]}
        />
      </Panel>
    </Layout>
  )
}
