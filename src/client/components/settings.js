import { useState, useEffect, Fragment } from 'react'
import { sendEvent, eventListener } from 'lib/socket'
import { SettingsNavItems } from 'lib/navigation-items'
import packageJson from '../../../package.json'

function Settings ({ visible, toggleVisible = () => {}, defaultActiveSettingsPanel = 'Theme' }) {
  const [activeSettingsPanel, setActiveSettingsPanel] = useState(defaultActiveSettingsPanel)

  return (
    <>
      <div className='modal-dialog__background' style={{ opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden' }} onClick={toggleVisible} />
      <div className='modal-dialog' style={{ opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden' }}>
        <h2 className='modal-dialog__title'>Settings</h2>
        <hr />
        <div className='secondary-navigation modal-dialog__navigation'>
          {SettingsNavItems(activeSettingsPanel).map(item =>
            <Fragment key={item.name}>
              <button
                tabIndex='2'
                className={`button--icon ${item.active ? 'button--active' : ''}`}
                onClick={() => setActiveSettingsPanel(item.name)}
              >
                <i className={`icon daedalus-terminal-${item.icon}`} />
              </button>
            </Fragment>
          )}
        </div>
        {activeSettingsPanel === 'Theme' && <ThemeSettings visible={visible} />}
        {activeSettingsPanel === 'Sounds' && <SoundSettings visible={visible} />}
        {activeSettingsPanel === 'Exploration' && <ExplorationSettings visible={visible} />}
        <div className='modal-dialog__footer'>
          <hr style={{ margin: '1rem 0 .5rem 0' }} />
          <button className='float-right' onClick={toggleVisible}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}

function SoundSettings ({ visible }) {
  const [preferences, setPreferences] = useState()
  const [voicepackDir, setVoicepackDir] = useState('')
  const [voicepackStatus, setVoicepackStatus] = useState(null)
  const [voicepackDetecting, setVoicepackDetecting] = useState(false)

  useEffect(() => {
    if (!visible) return
    ;(async () => {
      const prefs = await sendEvent('getPreferences')
      setPreferences(prefs)
      // Initialize voicepack dir from preferences or auto-detect
      if (prefs?.voicepackDir) {
        setVoicepackDir(prefs.voicepackDir)
        setVoicepackStatus(await sendEvent('validateVoicepackDir', { dir: prefs.voicepackDir }))
      } else {
        setVoicepackDetecting(true)
        const detected = await sendEvent('detectVoicepackDir')
        if (detected?.detected) {
          setVoicepackDir(detected.dir)
          setVoicepackStatus({ valid: true, name: detected.dir.split(/[\\/]/).pop().replace(/^hcspack-/i, '') })
      }
      setVoicepackDetecting(false)
    }
    })()
  }, [visible])

  // Listen for changes to preferences triggered by other terminals
  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event.name === 'preferences') {
      const prefs = await sendEvent('getPreferences')
      setPreferences(prefs)
      if (prefs?.voicepackDir) {
        setVoicepackDir(prefs.voicepackDir)
        setVoicepackStatus(await sendEvent('validateVoicepackDir', { dir: prefs.voicepackDir }))
      }
    }
  }), [])

  const saveVoicepackDir = async (dir) => {
    setVoicepackDir(dir)
    if (dir) {
      const status = await sendEvent('validateVoicepackDir', { dir })
      setVoicepackStatus(status)
      const newPreferences = JSON.parse(JSON.stringify(preferences || {}))
      newPreferences.voicepackDir = dir
      setPreferences(await sendEvent('setPreferences', newPreferences))
    } else {
      setVoicepackStatus(null)
      const newPreferences = JSON.parse(JSON.stringify(preferences || {}))
      delete newPreferences.voicepackDir
      setPreferences(await sendEvent('setPreferences', newPreferences))
    }
  }

  return (
    <div className='modal-dialog__panel modal-dialog__panel--with-navigation scrollable'>
      <h3 className='text-primary'>Sounds</h3>
      <p>
        Configure voice announcements for ship events and alerts.
        Audio plays through the computer DAEDALUS Terminal is running on.
      </p>
      <h4 className='text-primary'>COVAS Voiceover</h4>
      <p>
        Play authentic in-game COVAS voice clips for ship events. These are
        the same announcements that play in-game (e.g. docking granted, frameshift
        drive charging). Enable this if you have the game audio muted.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
        <input
          type='checkbox'
          checked={preferences?.covasVoiceoverEnabled || false}
          disabled={!preferences}
          onChange={async (e) => {
            const newPreferences = JSON.parse(JSON.stringify(preferences))
            newPreferences.covasVoiceoverEnabled = e.target.checked
            setPreferences(await sendEvent('setPreferences', newPreferences))
          }}
        />
        Enable COVAS voiceover
      </label>
      <hr style={{ margin: '1rem 0' }} />
      <h4 className='text-primary'>COVAS Extended Alerts</h4>
      <p>
        Additional voice warnings beyond what the game provides, such as low
        fuel alerts, dangerous system warnings, high gravity cautions, and
        notifications when valuable bodies are discovered.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
        <input
          type='checkbox'
          checked={preferences?.covasExtendedEnabled || false}
          disabled={!preferences}
          onChange={async (e) => {
            const newPreferences = JSON.parse(JSON.stringify(preferences))
            newPreferences.covasExtendedEnabled = e.target.checked
            setPreferences(await sendEvent('setPreferences', newPreferences))
          }}
        />
        Enable extended voice alerts
      </label>
      <hr style={{ margin: '1rem 0' }} />
      <h4 className='text-primary'>HCS Voicepack</h4>
      <p>
        Set the path to an HCS voicepack directory. This will be auto-detected
        from Steam if VoiceAttack is installed.
      </p>
      <input
        type='text'
        value={voicepackDir}
        placeholder={voicepackDetecting ? 'Detecting...' : 'Path to voicepack directory'}
        disabled={voicepackDetecting}
        style={{ width: '100%', maxWidth: '30rem' }}
        onChange={(e) => setVoicepackDir(e.target.value)}
        onBlur={(e) => saveVoicepackDir(e.target.value.trim())}
        onKeyDown={(e) => { if (e.key === 'Enter') saveVoicepackDir(e.target.value.trim()) }}
      />
      {voicepackStatus && (
        <p style={{ marginTop: '.5rem' }} className={voicepackStatus.valid ? 'text-secondary' : 'text-danger'}>
          {voicepackStatus.valid
            ? <>Valid Voicepack &mdash; {voicepackStatus.name}</>
            : <>Invalid Voicepack</>
          }
        </p>
      )}
    </div>
  )
}

function formatCredits (value) {
  return Number(value).toLocaleString('fr-FR').replace(/\u202F/g, ' ')
}

function parseCredits (str) {
  return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0
}

function CreditInput ({ value, disabled, onChange }) {
  const [displayValue, setDisplayValue] = useState(formatCredits(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDisplayValue(formatCredits(value))
  }, [value, focused])

  return (
    <input
      type='text'
      style={{ width: '10rem' }}
      disabled={disabled}
      value={displayValue}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDisplayValue(e.target.value)}
      onBlur={(e) => {
        setFocused(false)
        const parsed = parseCredits(e.target.value)
        setDisplayValue(formatCredits(parsed))
        onChange(parsed)
      }}
    />
  )
}

function ExplorationSettings ({ visible }) {
  const [preferences, setPreferences] = useState()

  useEffect(() => {
    ;(async () => {
      setPreferences(await sendEvent('getPreferences'))
    })()
  }, [visible])

  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event.name === 'preferences') {
      setPreferences(await sendEvent('getPreferences'))
    }
  }), [])

  const updatePreference = async (key, value) => {
    const newPreferences = JSON.parse(JSON.stringify(preferences))
    newPreferences[key] = value
    setPreferences(await sendEvent('setPreferences', newPreferences))
  }

  return (
    <div className='modal-dialog__panel modal-dialog__panel--with-navigation scrollable'>
      <h3 className='text-primary'>Exploration</h3>
      <p>
        Configure how exploration data is evaluated and displayed.
      </p>
      <h4 className='text-primary'>Value thresholds</h4>
      <p>
        Set the minimum credit value for a body or biological to be
        counted as &ldquo;valuable&rdquo; in the exploration views.
      </p>
      <table className='table--layout'>
        <tbody>
          <tr>
            <td style={{ paddingLeft: '.5rem', whiteSpace: 'nowrap' }}>
              Min. valuable body
            </td>
            <td>
              <CreditInput
                disabled={!preferences}
                value={preferences?.explorationMinBodyValue ?? 1000000}
                onChange={(v) => updatePreference('explorationMinBodyValue', v)}
              />
              <span className='text-muted' style={{ marginLeft: '.5rem' }}>Cr</span>
            </td>
          </tr>
          <tr>
            <td style={{ paddingLeft: '.5rem', whiteSpace: 'nowrap' }}>
              Min. valuable biological
            </td>
            <td>
              <CreditInput
                disabled={!preferences}
                value={preferences?.explorationMinBioValue ?? 7000000}
                onChange={(v) => updatePreference('explorationMinBioValue', v)}
              />
              <span className='text-muted' style={{ marginLeft: '.5rem' }}>Cr</span>
            </td>
          </tr>
        </tbody>
      </table>
      <h4 className='text-primary' style={{ marginTop: '1rem' }}>Value prediction</h4>
      <p>
        When disabled, the value column will only include bodies and
        biologicals that meet the thresholds above, showing what you
        would earn by scanning only the valuable items.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
        <input
          type='checkbox'
          disabled={!preferences}
          checked={preferences?.explorationIncludeNonValuable !== false}
          onChange={(e) => updatePreference('explorationIncludeNonValuable', e.target.checked)}
        />
        Include non-valuable items in value prediction
      </label>
    </div>
  )
}

function ThemeSettings () {
  const [primaryColor, setPrimaryColor] = useState(getPrimaryColorAsHex())
  const [primaryColorModifier, setPrimaryColorModifier] = useState(getPrimaryColorModifier())
  const [secondaryColor, setSecondaryColor] = useState(getSecondaryColorAsHex())
  const [secondaryColorModifier, setSecondaryColorModifier] = useState(getSecondaryColorModifier())

  // Update this component if another window updates the theme settings
  const storageEventHandler = (event) => {
    if (event.key === 'color-settings') {
      setPrimaryColor(getPrimaryColorAsHex())
      setPrimaryColorModifier(getPrimaryColorModifier())
      setSecondaryColor(getSecondaryColorAsHex())
      setSecondaryColorModifier(getSecondaryColorModifier())
    }
  }

  useEffect(() => {
    window.addEventListener('storage', storageEventHandler)
    return () => window.removeEventListener('storage', storageEventHandler)
  }, [])

  useEffect(() => eventListener('syncMessage', async (event) => {
    if (event.name === 'colorSettings') {
      setPrimaryColor(getPrimaryColorAsHex())
      setPrimaryColorModifier(getPrimaryColorModifier())
      setSecondaryColor(getSecondaryColorAsHex())
      setSecondaryColorModifier(getSecondaryColorModifier())
    }
  }), [])

  return (
    <div className='modal-dialog__panel modal-dialog__panel--with-navigation scrollable'>
      <h3 className='text-primary'>Theme</h3>
      <p>
        You can select a primary and secondary theme color and adjust the contrast for each color using the sliders.
      </p>
      <table className='table--layout'>
        <tbody>
          <tr>
            <td style={{ paddingLeft: '.5rem' }}>
              <button className='button--active text-no-wrap' style={{ pointerEvents: 'none' }}>
                <i className='icon daedalus-terminal-color-picker' /> Text <span className='text-muted'>Muted</span>
              </button>
              <br />
              <button className='text-no-wrap' style={{ pointerEvents: 'none' }}>
                <i className='icon daedalus-terminal-color-picker' /> Text <span className='text-muted'>Muted</span>
              </button>
            </td>
            <td className='text-center'>
              <input
                id='primaryColorPicker' name='primaryColorPicker' value={primaryColor} type='color'
                style={{ marginTop: '.5rem', padding: 0, background: 'transparent', border: 'none', height: '4rem', width: '4rem' }}
                onChange={(event) => {
                  setPrimaryColor(event.target.value)
                  const color = hex2rgb(event.target.value)
                  document.documentElement.style.setProperty('--color-primary-r', color.r)
                  document.documentElement.style.setProperty('--color-primary-g', color.g)
                  document.documentElement.style.setProperty('--color-primary-b', color.b)
                  saveColorSettings()
                }}
              />
              <br />
              <input
                type='range' min='1' max='255' value={primaryColorModifier} style={{ width: '10rem' }}
                onChange={(event) => {
                  setPrimaryColorModifier(event.target.value)
                  document.documentElement.style.setProperty('--color-primary-dark-modifier', event.target.value)
                  saveColorSettings()
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <table className='table--layout'>
        <tbody>
          <tr>
            <td style={{ paddingLeft: '.5rem' }}>
              <button className='button--secondary button--active text-no-wrap' style={{ pointerEvents: 'none' }}>
                <i className='icon daedalus-terminal-color-picker' /> Text <span className='text-muted'>Muted</span>
              </button>
              <br />
              <button className='button--secondary text-no-wrap' style={{ pointerEvents: 'none' }}>
                <i className='icon daedalus-terminal-color-picker' /> Text <span className='text-muted'>Muted</span>
              </button>
            </td>
            <td className='text-center'>
              <input
                id='secondaryColorPicker' name='secondaryColorPicker' value={secondaryColor} type='color'
                style={{ marginTop: '.5rem', padding: 0, background: 'transparent', border: 'none', height: '4rem', width: '4rem' }}
                onChange={(event) => {
                  setSecondaryColor(event.target.value)
                  const color = hex2rgb(event.target.value)
                  document.documentElement.style.setProperty('--color-secondary-r', color.r)
                  document.documentElement.style.setProperty('--color-secondary-g', color.g)
                  document.documentElement.style.setProperty('--color-secondary-b', color.b)
                  saveColorSettings()
                }}
              />
              <br />
              <input
                type='range' min='1' max='255' value={secondaryColorModifier} style={{ width: '10rem' }}
                onChange={(event) => {
                  setSecondaryColorModifier(event.target.value)
                  document.documentElement.style.setProperty('--color-secondary-dark-modifier', event.target.value)
                  saveColorSettings()
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <h4 className='text-primary'>Sync theme across devices</h4>
      <p>
        Theme settings apply to all terminals on this computer / device.
        Different devices can be configured to use different colors.
      </p>
      <p>
        You can sync theme settings to have all currently connected devices
        (computers, tablets, phones, etc) use the same theme settings.
      </p>
      <div className='text-center' style={{ padding: '0.25rem 0' }}>
        <button
          onClick={() => {
            const colorSettings = {
              primaryColor: {
                r: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-r')),
                g: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-g')),
                b: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-b')),
                modifier: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-dark-modifier'))
              },
              secondaryColor: {
                r: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-r')),
                g: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-g')),
                b: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-b')),
                modifier: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-dark-modifier'))
              }
            }
            sendEvent('syncMessage', { name: 'colorSettings', message: colorSettings })
            document.activeElement.blur()
          }}
        >
          <i className='icon daedalus-terminal-sync' /> Sync theme settings
        </button>
      </div>
      <h4 className='text-primary'>Reset theme</h4>
      <p>
        Resetting theme settings will only impact this computer / device.
      </p>
      <div className='text-center' style={{ padding: '0.25rem 0' }}>
        <button
          className='text-info'
          onClick={() => {
            try {
              loadDefaultColorSettings()
              setPrimaryColor(getPrimaryColorAsHex())
              setPrimaryColorModifier(getPrimaryColorModifier())
              setSecondaryColor(getSecondaryColorAsHex())
              setSecondaryColorModifier(getSecondaryColorModifier())
              window.localStorage.removeItem('color-settings')
              document.activeElement.blur()
            } catch (err) {
              console.error('Unable to reset color settings', err)
            }
          }}
        >
          Reset theme settings
        </button>
      </div>
    </div>
  )
}

const hex2rgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

const rgb2hex = (r, g, b) => {
  const rgb = (r << 16) | (g << 8) | b
  return '#' + rgb.toString(16).padStart(6, 0)
}

const getPrimaryColorAsHex = () => {
  if (typeof document === 'undefined') return null
  const r = window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-r')
  const g = window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-g')
  const b = window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-b')
  return rgb2hex(r, g, b)
}

const getSecondaryColorAsHex = () => {
  if (typeof document === 'undefined') return null
  const r = window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-r')
  const g = window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-g')
  const b = window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-b')
  return rgb2hex(r, g, b)
}

const getPrimaryColorModifier = () => {
  if (typeof document === 'undefined') return null
  return parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-dark-modifier'))
}

const getSecondaryColorModifier = () => {
  if (typeof document === 'undefined') return null
  return parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-dark-modifier'))
}

const saveColorSettings = () => {
  const colorSettings = {
    version: packageJson.version,
    primaryColor: {
      r: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-r')),
      g: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-g')),
      b: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-b')),
      modifier: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-primary-dark-modifier'))
    },
    secondaryColor: {
      r: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-r')),
      g: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-g')),
      b: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-b')),
      modifier: parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--color-secondary-dark-modifier'))
    }
  }
  try {
    window.localStorage.setItem('color-settings', JSON.stringify({ ...colorSettings, timestamp: Date.now() }))
  } catch (err) {
    console.error('Unable to save color settings to localStorage', err)
  }
}

const loadColorSettings = () => {
  try {
    const colorSettings = JSON.parse(window.localStorage.getItem('color-settings'))
    if (!colorSettings) return loadDefaultColorSettings() // If no save settings, load defaults
    // If older than v0.3.6 then erase color settings and load defaults as
    // breaking theme changes in v0.3.6
    if (!colorSettings.version || compareVersions('0.3.6', colorSettings.version) === 1) {
      window.localStorage.removeItem('color-settings')
      return loadDefaultColorSettings()
    }

    document.documentElement.style.setProperty('--color-primary-r', colorSettings.primaryColor.r)
    document.documentElement.style.setProperty('--color-primary-g', colorSettings.primaryColor.g)
    document.documentElement.style.setProperty('--color-primary-b', colorSettings.primaryColor.b)
    document.documentElement.style.setProperty('--color-primary-dark-modifier', colorSettings.primaryColor.modifier)
    document.documentElement.style.setProperty('--color-secondary-r', colorSettings.secondaryColor.r)
    document.documentElement.style.setProperty('--color-secondary-g', colorSettings.secondaryColor.g)
    document.documentElement.style.setProperty('--color-secondary-b', colorSettings.secondaryColor.b)
    document.documentElement.style.setProperty('--color-secondary-dark-modifier', colorSettings.secondaryColor.modifier)
  } catch (err) {
    console.error('Unable to read color settings from localStorage', err)
    return loadDefaultColorSettings()
  }
}

const loadDefaultColorSettings = () => {
  const defaultPrimaryColor = {
    r: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-primary-r'),
    g: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-primary-g'),
    b: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-primary-b')
  }

  document.documentElement.style.setProperty('--color-primary-r', defaultPrimaryColor.r)
  document.documentElement.style.setProperty('--color-primary-g', defaultPrimaryColor.g)
  document.documentElement.style.setProperty('--color-primary-b', defaultPrimaryColor.b)

  const defaultPrimaryColorModifier = window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-primary-dark-modifier')
  document.documentElement.style.setProperty('--color-primary-dark-modifier', defaultPrimaryColorModifier)

  const defaultSecondaryColor = {
    r: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-secondary-r'),
    g: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-secondary-g'),
    b: window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-secondary-b')
  }

  document.documentElement.style.setProperty('--color-secondary-r', defaultSecondaryColor.r)
  document.documentElement.style.setProperty('--color-secondary-g', defaultSecondaryColor.g)
  document.documentElement.style.setProperty('--color-secondary-b', defaultSecondaryColor.b)

  const defaultSecondaryColorModifier = window.getComputedStyle(document.documentElement).getPropertyValue('--color-default-secondary-dark-modifier')
  document.documentElement.style.setProperty('--color-secondary-dark-modifier', defaultSecondaryColorModifier)
}

// Returns: 1 = v1 is bigger, 0 = same version, -1 = v1 is smaller
function compareVersions (v1, v2) {
  const v1Parts = v1.split('.')
  const v2Parts = v2.split('.')
  const length = Math.max(v1Parts.length, v2Parts.length)
  for (let i = 0; i < length; i++) {
    const value = (parseInt(v1Parts[i]) || 0) - (parseInt(v2Parts[i]) || 0)
    if (value < 0) return -1
    if (value > 0) return 1
  }
  return 0
}

module.exports = {
  Settings,
  loadColorSettings,
  loadDefaultColorSettings,
  saveColorSettings
}
