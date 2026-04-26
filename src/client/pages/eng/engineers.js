import { useState, useEffect, useMemo } from 'react'
import animateTableEffect from 'lib/animate-table-effect'
import { useRouter } from 'next/router'
import distance from '../../../shared/distance'
import { UNKNOWN_VALUE } from '../../../shared/consts'
import { useSocket, sendEvent, eventListener } from 'lib/socket'
import { EngineeringPanelNavItems } from 'lib/navigation-items'
import Layout from 'components/layout'
import Panel from 'components/panel'
import CopyOnClick from 'components/copy-on-click'

export default function EngineeringEngineersPage () {
  const router = useRouter()
  const { query } = router
  const { connected, active, ready } = useSocket()
  const [componentReady, setComponentReady] = useState(false)
  const [currentSystem, setCurrentSystem] = useState()
  const [engineers, setEngineers] = useState()
  const [blueprints, setBlueprints] = useState()
  const [prerequisites, setPrerequisites] = useState({})

  const relevantRows = useMemo(() => {
    if (!engineers || !blueprints) return []
    return engineers
      .filter(e => blueprints.some(bp =>
        bp.appliedToModules.length > 0 &&
        Object.prototype.hasOwnProperty.call(bp.engineers ?? {}, e.name)
      ))
      .map(e => ({
        engineer: e,
        fittedBlueprintNames: blueprints
          .filter(bp => bp.appliedToModules.length > 0 && Object.prototype.hasOwnProperty.call(bp.engineers ?? {}, e.name))
          .map(bp => bp.name)
      }))
  }, [engineers, blueprints])

  useEffect(animateTableEffect)
  
  useEffect(() => {
    ;(async () => {
      if (!connected || !router.isReady) return

      // Always refetch list of engineers to ensure up to date
      const [newEngineers, newBlueprints, newPrerequisites, newSystem] = await Promise.all([
        sendEvent('getEngineers'),
        sendEvent('getBlueprints'),
        sendEvent('getEngineerPrerequisites'),
        sendEvent('getSystem')
      ])
      setEngineers(newEngineers)
      setBlueprints(newBlueprints)
      setPrerequisites(newPrerequisites ?? {})
      if (newSystem?.address) setCurrentSystem(newSystem)
      setComponentReady(true)
    })()
  }, [connected, ready, router.isReady, query])

  useEffect(() => eventListener('newLogEntry', async (log) => {
    if (['Location', 'FSDJump'].includes(log.event)) {
      const newSystem = await sendEvent('getSystem')
      if (newSystem?.address) setCurrentSystem(newSystem)
    }
    if (log.event === 'EngineerProgress') {
      setEngineers((await sendEvent('getEngineers')) ?? [])
    }
  }), [])

  return (
    <Layout connected={connected} active={active} ready={ready} loader={!componentReady}>
      <Panel layout='full-width' scrollable navigation={EngineeringPanelNavItems('Engineers')}>
        <h2>Engineers</h2>
        <h3 className='text-primary'>Engineers &amp; Workshops</h3>

        <p className='text-primary'>
          Engineers can use Blueprints and Experimental Effects to improve ships and equipment
        </p>

        {relevantRows.length > 0 &&
          <>
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Relevant to Your Ship</h4>
            </div>
            <p className='text-primary'>Engineers with Blueprints applied to your currently fitted equipment</p>
            <table className='table--animated'>
              <tbody className='fx-fade-in'>
                {relevantRows.map(({ engineer, fittedBlueprintNames }) => (
                  <tr key={`relevant_${engineer.name}`}>
                    <td className='text-primary text-center' style={{ width: '2rem' }}>
                      <i className='icon daedalus-terminal-engineer' style={{ fontSize: '1.75rem', lineHeight: '2rem', width: '2rem', display: 'inline-block' }} />
                    </td>
                    <td>
                      <h4 className='text-info'>{engineer.name}</h4>
                      <p className='text-primary' style={{ margin: 0, fontSize: '.9rem' }}>
                        {fittedBlueprintNames.join(', ')}
                      </p>
                    </td>
                    <td className='text-right'>
                      <CopyOnClick>{engineer.system.name}</CopyOnClick>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr className='small' style={{ marginTop: 0 }} />
          </>}
        {engineers && engineers.length > 0 &&
          <>
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Unlocked Engineers</h4>
            </div>
            <ListEngineers
              engineers={engineers.filter(e => e.progress.status.toLowerCase() === 'unlocked')}
              currentSystem={currentSystem}
              prerequisites={prerequisites}
            />
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Known/Invited Engineers</h4>
            </div>
            <ListEngineers
              engineers={engineers.filter(e => e.progress.status !== UNKNOWN_VALUE && e.progress.status.toLowerCase() !== 'unlocked')}
              currentSystem={currentSystem}
              prerequisites={prerequisites}
            />
            <div className='section-heading'>
              <h4 className='section-heading__text' style={{ marginTop: '1rem' }}>Locked Engineers</h4>
            </div>
            <ListEngineers
              engineers={engineers.filter(e => e.progress.status === UNKNOWN_VALUE)}
              currentSystem={currentSystem}
              prerequisites={prerequisites}
            />
          </>}
      </Panel>
    </Layout>
  )
}

function getNextUnlockStep (engineer, prerequisites) {
  const status = (engineer.progress.status ?? '').toLowerCase()
  const prereq = prerequisites?.[String(engineer.id)]
  if (!prereq) return null

  if (status === 'unlocked') return null

  // Invited → show unlock step
  if (status === 'invited' && prereq.unlock) {
    return `Unlock: ${prereq.unlock.description ?? `Provide ${prereq.unlock.amount ?? '?'}× ${prereq.unlock.name ?? prereq.unlock.symbol}`}`
  }

  // Known → show invite (activity) step if present, else unlock
  if (status === 'known') {
    if (prereq.invite) return `Invite: ${prereq.invite.description}`
    if (prereq.unlock) return `Unlock: ${prereq.unlock.description ?? `Provide ${prereq.unlock.amount ?? '?'}× ${prereq.unlock.name ?? prereq.unlock.symbol}`}`
  }

  // Locked/Unknown → show learn step if present
  if (prereq.learn) return `Learn: ${prereq.learn.description}`
  if (prereq.invite) return `Invite: ${prereq.invite.description}`
  if (prereq.unlock) return `Unlock: ${prereq.unlock.description ?? `Provide ${prereq.unlock.amount ?? '?'}× ${prereq.unlock.name ?? prereq.unlock.symbol}`}`

  return null
}

function ListEngineers ({ engineers, currentSystem, prerequisites }) {
  return (
    <>
      <table className='table--animated'>
        <tbody className='fx-fade-in'>
          {engineers?.length === 0 &&
            <tr>
              <td className='text-muted'>None</td>
            </tr>}
          {engineers?.length > 0 && engineers.map(engineer =>
            <tr
              key={`engineer_${engineer.name}`}
              tabIndex={2}
              // className='table__row--highlighted'
              onFocus={() => {
                /// router.push({ pathname: '/eng/blueprints', query: { symbol: blueprint.symbol } })
              }}
            >
              <td className={`text-primary text-center ${engineer.progress.status.toLowerCase() === 'unlocked' ? '' : 'text-muted'}`} style={{ width: '2rem' }}>
                <i
                  className='icon daedalus-terminal-engineer'
                  style={{ fontSize: '1.75rem', lineHeight: '2rem', width: '2rem', display: 'inline-block' }}
                />
              </td>
              <td style={{ width: '18rem' }}>
                <h4 className={engineer.progress.status.toLowerCase() === 'unlocked' ? 'text-info' : 'text-info text-muted'}>
                  <CopyOnClick>{engineer.name}</CopyOnClick>
                </h4>
                {engineer.progress.rank === 0 && <>
                  {engineer.progress.status === UNKNOWN_VALUE
                    ? <p className='text-danger text-muted'>Locked</p>
                    : <p className={engineer.progress.status.toLowerCase() === 'unlocked' ? 'text-primary' : 'text-primary text-muted'}>{engineer.progress.status}</p>}
                </> }
                {engineer.progress.status.toLowerCase() !== 'unlocked' && (() => {
                  const step = getNextUnlockStep(engineer, prerequisites)
                  return step
                    ? <p className='text-warning' style={{ margin: '.1rem 0 0', fontSize: '.82rem' }}><i className='icon daedalus-terminal-chevron-right' style={{ marginRight: '.2rem' }} />{step}</p>
                    : null
                })()}
                {engineer.progress.rank > 0 &&
                  <h4 className='text-secondary'>
                    {[...Array(engineer.progress.rank)].map((j, i) =>
                      <i
                        style={{ fontSize: '1.5rem', width: '1.5rem', display: 'inline-block', marginRight: '0.1rem', marginTop: '.25rem' }}
                        key={`${engineer.name}_rank_${i}`}
                        className='icon daedalus-terminal-engineering'
                      />
                    )}
                  </h4>}
              </td>
              <td className='text-primary text-no-transform text-left hidden-small'>
                {engineer.description}
              </td>
              <td className='text-right'>
                <span className='text-right'>
                  <CopyOnClick>{engineer.system.name}</CopyOnClick>
                </span>
                {currentSystem?.position &&
                  <span className='text-muted text-no-transform'>
                    <br />
                    {distance(currentSystem.position, engineer.system.position).toLocaleString(undefined, { maximumFractionDigits: 0 })} Ly
                  </span>}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <hr className='small' style={{ marginTop: 0 }} />
    </>
  )
}
