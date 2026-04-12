import { useState, useEffect } from 'react'
import { socketOptions, setSocketOption } from 'lib/socket'
import { isWindowFullScreen, toggleFullScreen } from 'lib/window'
import { eliteDateTime } from 'lib/format'
import { Settings } from 'components/settings'
import LandingPadOverlay from 'components/landing-pad-overlay'
import PrimaryNavigation from 'components/primary-navigation'
import notification from 'lib/notification'
import useAudioToggle from 'lib/use-audio-toggle'
import useLandingPad from 'lib/use-landing-pad'

let IS_WINDOWS_APP = false

export default function Header ({ connected, active }) {
  const [dateTime, setDateTime] = useState(eliteDateTime())
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [notificationsVisible, setNotificationsVisible] = useState(socketOptions.notifications)
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(socketOptions.explorationAutoSwitch)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [toolbarOpen, setToolbarOpen] = useState(false)

  const { audioEnabled, toggleAudio } = useAudioToggle()
  const { landingPadEnabled, landingPadData, toggleLandingPad, dismissLandingPad } = useLandingPad()

  async function fullScreen () {
    const newFullScreenState = await toggleFullScreen()
    setIsFullScreen(newFullScreenState)
    document.activeElement.blur()
  }

  function toggleNotifications () {
    setSocketOption('notifications', !notificationsVisible)
    setNotificationsVisible(socketOptions.notifications)
    // FIXME Uses document.getElementById('notifications') hack to force
    // hiding of all notifications when muted as the toast library can be
    // buggy. It needs swapping out for a different approach but this is a
    // workaround for now.
    if (socketOptions.notifications) {
      notification('Notifications enabled', { id: 'notification-status' })
      document.getElementById('notifications').style.opacity = '1'
    } else {
      notification('Notifications disabled', { id: 'notification-status' })
      // Use a setTimeout so that the user has time to read the notificaiton
      // before they are all hidden. Uses a conditional so that if the user
      // rapidly clicks the toggle it doesn't end up in a weird state.
      setTimeout(() => {
        if (socketOptions.notifications === false) {
          document.getElementById('notifications').style.opacity = '0'
        }
      }, 2000)
    }
    document.activeElement.blur()
  }

  function toggleAutoSwitch () {
    setSocketOption('explorationAutoSwitch', !autoSwitchEnabled)
    setAutoSwitchEnabled(socketOptions.explorationAutoSwitch)
    document.activeElement.blur()
  }

  useEffect(() => {
    let mounted = true
    // daedalusTerminal_* methods are not always accessible while the app is loading.
    // This handles that by calling them when the component is mounted.
    // It uses a global for isWindowsApp to reduce UI flicker.
    if (typeof window !== 'undefined' && typeof window.daedalusTerminal_version === 'function') {
      IS_WINDOWS_APP = true
    }
    // Sync toggle states from socketOptions (restored from localStorage)
    // to fix SSR hydration mismatch where initial state defaults to false
    setAutoSwitchEnabled(socketOptions.explorationAutoSwitch)
    setNotificationsVisible(socketOptions.notifications)
    ;(async () => {
      const fs = await isWindowFullScreen()
      if (mounted) {
        setIsFullScreen(fs)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const dateTimeInterval = setInterval(async () => {
      setDateTime(eliteDateTime())
    }, 1000)
    return () => clearInterval(dateTimeInterval)
  }, [])

  let signalClassName = 'icon daedalus-terminal-signal '
  if (!connected) {
    signalClassName += 'text-primary'
  } else if (active) {
    signalClassName += 'text-secondary'
  } else {
    signalClassName += 'text-primary'
  }

  return (
    <header>
      <hr className='small' />
      <h1 className='text-info' style={{ padding: '.6rem 0 .25rem 5.5rem' }}>
        <i className='icon daedalus-terminal-logo' style={{ position: 'absolute', fontSize: '5rem', left: '-.5rem', top: '.7rem', textShadow: '0 0 1px' }} />DAEDALUS <span className='hidden-small'>Terminal</span>
      </h1>
      <div style={{ position: 'absolute', top: '1rem', right: '.5rem', display: 'flex', alignItems: 'center' }}>
        <div className={`header__toolbar ${toolbarOpen ? 'header__toolbar--open' : ''}`}>
          <p
            className='text-primary text-center text-uppercase'
            style={{ display: 'inline-block', padding: 0, margin: 0, lineHeight: '1rem', minWidth: '7.5rem' }}
          >
            <span style={{position: 'relative', top: '.3rem', fontSize: '2.4rem', paddingTop: '.25rem'}}>
            {dateTime.time}
            </span>
            <br/>
            <span style={{fontSize: '1.1rem', position: 'relative', top: '.4rem'}}>
              {dateTime.day} {dateTime.month} {dateTime.year}
            </span>
          </p>

          <button disabled className='button--icon button--transparent' style={{ marginRight: '.5rem', opacity: active ? 1 : .25, transition: 'all .25s ease-out' }}>
            <i className={signalClassName} style={{ position: 'relative', transition: 'all .25s ease', fontSize: '3rem', lineHeight: '1.8rem', top: '.5rem', right: '.25rem' }} />
          </button>

          <button tabIndex='1' onClick={toggleNotifications} className='button--icon' style={{ marginRight: '.5rem' }} data-tooltip='Notifications'>
            <i className={`icon ${notificationsVisible ? 'daedalus-terminal-notifications' : 'daedalus-terminal-notifications-disabled text-muted'}`} style={{ fontSize: '2rem' }} />
          </button>

          <button tabIndex='1' onClick={toggleAutoSwitch} className='button--icon' style={{ marginRight: '.5rem' }} data-tooltip='Auto-switch exploration pages'>
            <i className={`icon daedalus-terminal-sync ${autoSwitchEnabled ? '' : 'text-muted'}`} style={{ fontSize: '2rem' }} />
          </button>

          <button tabIndex='1' onClick={toggleAudio} className='button--icon' style={{ marginRight: '.5rem' }} data-tooltip='COVAS audio'>
            <i className={`icon daedalus-terminal-sound ${audioEnabled ? '' : 'text-muted'}`} style={{ fontSize: '2rem' }} />
          </button>

          <button tabIndex='1' onClick={toggleLandingPad} className='button--icon' style={{ marginRight: '.5rem' }} data-tooltip='Landing pad overlay'>
            <i className={`icon daedalus-terminal-planet-lander ${landingPadEnabled ? '' : 'text-muted'}`} style={{ fontSize: '2rem' }} />
          </button>

          <button
            tabIndex='1' className='button--icon' style={{ marginRight: '.5rem' }}
            onClick={() => { setSettingsVisible(!settingsVisible); document.activeElement.blur() }}
            data-tooltip='Settings'
          >
            <i className='icon daedalus-terminal-settings' style={{ fontSize: '2rem' }} />
          </button>
          <button tabIndex='1' onClick={fullScreen} className='button--icon' data-tooltip='Fullscreen'>
            <i className='icon daedalus-terminal-fullscreen' style={{ fontSize: '2rem' }} />
          </button>
        </div>

        <button tabIndex='1' onClick={() => { setToolbarOpen(!toolbarOpen); document.activeElement.blur() }} className='button--icon'>
          <i className={`icon ${toolbarOpen ? 'daedalus-terminal-chevron-right' : 'daedalus-terminal-chevron-left'}`} style={{ fontSize: '2rem', transition: 'transform .2s ease' }} />
        </button>
      </div>
      <hr />
      <PrimaryNavigation />
      <hr className='bold' />
      <Settings visible={settingsVisible} toggleVisible={() => setSettingsVisible(!settingsVisible)} />
      <LandingPadOverlay data={landingPadData} onDismiss={dismissLandingPad} />
    </header>
  )
}
