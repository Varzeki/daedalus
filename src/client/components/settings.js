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

const SOUND_EFFECTS = [
  {
    category: 'FSD & Travel',
    sounds: [
      { label: 'FSD Charging', file: 'frameshift_drive_charging', mapped: true },
      { label: 'Route Plotted', file: 'route_plotted', mapped: true },
      { label: 'Jet Cone Supercharge', file: 'frameshift_drive_supercharged', mapped: true },
      { label: 'Interdiction', file: 'frameshift_anomaly_detected', mapped: true },
      { label: 'Carrier Jump Detected', file: 'massive_frameshift_surge_detected', mapped: true },
      { label: 'Dangerous System', file: 'warning_target_system_safety_risk', mapped: false }
    ]
  },
  {
    category: 'Docking',
    sounds: [
      { label: 'Docking Granted', file: 'docking_request_granted', mapped: true },
      { label: 'Docking Denied', file: 'docking_request_denied', mapped: true },
      { label: 'Docked', file: 'docking_successful_engines_disengaged', mapped: true },
      { label: 'Undocked', file: 'ship_released_engines_engaged', mapped: true }
    ]
  },
  {
    category: 'Combat & Damage',
    sounds: [
      { label: 'Under Attack', file: 'under_attack', mapped: true },
      { label: 'Taking Damage', file: 'taking_damage', mapped: true },
      { label: 'Hull Integrity Compromised', file: 'hull_integrity_compromised', mapped: true },
      { label: 'Hull Integrity Critical', file: 'hull_integrity_critical', mapped: true },
      { label: 'Heat Warning', file: 'warning_taking_heat_damage', mapped: true },
      { label: 'Temperature Critical', file: 'warning_temperature_critical', mapped: true },
      { label: 'Cockpit Breach', file: 'canopy_compromised', mapped: true },
      { label: 'Bounty Incurred', file: 'bounty_incurred', mapped: true },
      { label: 'Target Destroyed', file: 'target_destroyed', mapped: true },
      { label: 'Fighter Destroyed', file: 'fighter_destroyed', mapped: true },
      { label: 'SRV Destroyed', file: 'critical_alert', mapped: true },
      { label: 'Caustic Damage', file: 'caustic_damage_detected', mapped: false }
    ]
  },
  {
    category: 'Ship Systems',
    sounds: [
      { label: 'Cargo Scoop Deployed', file: 'cargo_scoop_deployed', mapped: true },
      { label: 'Cargo Scoop Retracted', file: 'cargo_scoop_retracted', mapped: true },
      { label: 'Landing Gear Down', file: 'landing_gear_deployed', mapped: true },
      { label: 'Landing Gear Up', file: 'landing_gear_retracted', mapped: true },
      { label: 'Silent Running On', file: 'silent_running', mapped: true },
      { label: 'Silent Running Off', file: 'thermal_signature_restored', mapped: true },
      { label: 'Cargo Full', file: 'cargo_hold_at_maximum_capacity', mapped: true },
      { label: 'Fuel Scooping', file: 'fuel_scooping', mapped: true },
      { label: 'Fuel Replenished', file: 'fuel_replenished', mapped: true },
      { label: 'System Reboot', file: 'system_reboot_sequence_initiated', mapped: true },
      { label: 'AFMU Repair', file: 'diagnostic_repair_sequence_initiated', mapped: true },
      { label: 'Repair Complete', file: 'repair_complete', mapped: true },
      { label: 'Low Fuel', file: 'main_fuel_tank_low', mapped: false },
      { label: 'Last Chance to Refuel', file: 'warning_last_chance_to_refuel_on_current_route', mapped: false },
      { label: 'FSD Beyond Safety Limits', file: 'warning_frameshift_drive_operating_beyond_safety_limits', mapped: false },
      { label: 'Power Plant Exceeded', file: 'power_plant_capacity_exceeded', mapped: false }
    ]
  },
  {
    category: 'Scanning & Exploration',
    sounds: [
      { label: 'System Scan Complete (Honk)', file: 'system_scan_complete', mapped: true },
      { label: 'All Bodies Found', file: 'all_system_bodies_located', mapped: true },
      { label: 'Surface Scan Complete', file: 'surface_scan_complete', mapped: true },
      { label: 'Scan Detected', file: 'scan_detected', mapped: true },
      { label: 'Codex Entry', file: 'new_codex_entry', mapped: true },
      { label: 'Approach Body', file: 'engage', mapped: true },
      { label: 'Approach Settlement', file: 'incoming_signal', mapped: true },
      { label: 'Valuable Body Discovered', file: 'new_discovery', mapped: false },
      { label: 'Notable Stellar Phenomena', file: 'unknown_anomaly_detected', mapped: false },
      { label: 'High Gravity Warning', file: 'high_gravity_warning', mapped: false }
    ]
  },
  {
    category: 'Support Craft',
    sounds: [
      { label: 'Fighter Deployed', file: 'fighter_deployed', mapped: true },
      { label: 'Fighter Docking', file: 'fighter_docking_sequence_initiated', mapped: true },
      { label: 'SRV Deployed', file: 'deployment_sequence_complete', mapped: true },
      { label: 'Limpet Programmed', file: 'programming_limpet_drone', mapped: true },
      { label: 'Prospector Limpet', file: 'prospector_limpet_engaged', mapped: true }
    ]
  },
  {
    category: 'Communications & Missions',
    sounds: [
      { label: 'Incoming Message', file: 'incoming_message', mapped: true },
      { label: 'Mission Failed', file: 'mission_failed', mapped: true }
    ]
  },
  {
    category: 'Emergencies',
    sounds: [
      { label: 'Ejected', file: 'eject', mapped: true },
      { label: 'Oxygen Low', file: 'warning_oxygen_low', mapped: true },
      { label: 'Oxygen Critical', file: 'warning_oxygen_critical', mapped: true },
      { label: 'Self Destruct', file: 'selfdestruct_sequence_initiated', mapped: true },
      { label: 'Hazardous Environment', file: 'warning_hazardous_environment', mapped: false },
      { label: 'Security Forces Detected', file: 'security_forces_detected', mapped: false },
      { label: 'Capital Ship Detected', file: 'warning_capital_class_signature_detected', mapped: false },
      { label: 'Alien Discovery', file: 'alien_civilization_discovery', mapped: false },
      { label: 'Energy Surge', file: 'energy_surge_detected', mapped: false }
    ]
  }
]

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
        Configure which voice announcements are broadcast for ship events and alerts.
        Use the audio button in the header to control whether this terminal plays audio.
      </p>
      <h4 className='text-primary'>COVAS Voiceover</h4>
      <p>
        Broadcast authentic in-game COVAS voice clips to all connected terminals.
        Any terminal with audio enabled will play these announcements. Enable this
        if you want voiceover (e.g. docking granted, frameshift drive charging).
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
      <TestAudioButton />
      <hr style={{ margin: '1rem 0' }} />
      <h4 className='text-primary'>COVAS Extended Alerts</h4>
      <p>
        Broadcast additional voice warnings beyond what the game provides, such as
        low fuel alerts, dangerous system warnings, high gravity cautions, and
        notifications when valuable bodies are discovered. Any terminal with audio
        enabled will play these alerts.
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
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontFamily: 'Jura, sans-serif', fontWeight: 900, textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '0.05rem', color: 'var(--color-primary)', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <i className='icon daedalus-terminal-sound' style={{ fontSize: '1.5rem', position: 'relative', top: '.15rem' }} />
          Individual Sound Toggles
        </summary>
        <p style={{ marginTop: '.5rem', fontSize: '.9rem' }}>
          Enable or disable individual voice effects. Greyed out effects are not yet triggered by the game and are coming soon.
        </p>
        {SOUND_EFFECTS.map(({ category, sounds }) => (
          <div key={category} style={{ marginTop: '.75rem' }}>
            <div style={{ color: 'var(--color-info)', fontSize: '.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: '.4rem' }}>{category}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '.25rem .75rem' }}>
              {sounds.map(({ label, file, mapped }) => (
                <label
                  key={file}
                  style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: mapped ? 'pointer' : 'default', opacity: mapped ? 1 : 0.4 }}
                >
                  <input
                    type='checkbox'
                    checked={preferences?.soundsEnabled?.[file] !== false}
                    disabled={!preferences || !mapped}
                    onChange={async (e) => {
                      const newPreferences = JSON.parse(JSON.stringify(preferences || {}))
                      if (!newPreferences.soundsEnabled) newPreferences.soundsEnabled = {}
                      newPreferences.soundsEnabled[file] = e.target.checked
                      setPreferences(await sendEvent('setPreferences', newPreferences))
                    }}
                  />
                  <span>{label}{!mapped && <span className='text-muted' style={{ marginLeft: '.35rem', fontSize: '.8rem' }}>(Coming Soon)</span>}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </details>
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

function TestAudioButton () {
  const [status, setStatus] = useState(null) // null | 'playing' | 'ok' | 'error'
  const [details, setDetails] = useState(null)

  const handleTest = async () => {
    setStatus('playing')
    setDetails(null)
    try {
      const result = await sendEvent('testAudio')
      setDetails(result)
      setStatus(result?.success ? 'ok' : 'error')
    } catch (error) {
      setDetails({
        success: false,
        error: error?.message || 'Unknown audio test error'
      })
      setStatus('error')
    }
  }

  return (
    <div style={{ marginTop: '.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={handleTest} disabled={status === 'playing'}>
          {status === 'playing' ? 'Sending...' : 'Test Audio'}
        </button>
        {status === 'ok' && <span className='text-secondary'>Broadcast sent — enable audio (header button) to hear it</span>}
        {status === 'error' && <span className='text-danger'>{details?.error || 'Audio test failed'}</span>}
      </div>
      {details && (
        <div
          style={{
            marginTop: '.5rem',
            padding: '.5rem .75rem',
            border: `.15rem solid ${details.success ? 'var(--color-secondary)' : 'var(--color-danger)'}`,
            background: 'var(--color-background-panel)',
            maxWidth: '36rem'
          }}
        >
          <div className='text-info' style={{ marginBottom: '.25rem' }}>Last test diagnostics</div>
          <div style={{ fontSize: '.9rem', lineHeight: '1.25rem', textTransform: 'none' }}>
            {details.filePath && <div>File: <span className='text-muted'>{details.filePath}</span></div>}
            {details.voicelinesDir && <div>Directory: <span className='text-muted'>{details.voicelinesDir}</span></div>}
            {typeof details.fileExists === 'boolean' && <div>File exists: <span className={details.fileExists ? 'text-secondary' : 'text-danger'}>{String(details.fileExists)}</span></div>}
            {typeof details.voiceoverEnabled === 'boolean' && <div>Voiceover enabled: <span className='text-info'>{String(details.voiceoverEnabled)}</span></div>}
          </div>
        </div>
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
