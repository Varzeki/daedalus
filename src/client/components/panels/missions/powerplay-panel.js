// ─── Rank thresholds ─────────────────────────────────────────────────────────
function getMeritsForRank (rank) {
  if (rank <= 1) return 0
  if (rank === 2) return 2000
  if (rank === 3) return 5000
  if (rank === 4) return 9000
  if (rank === 5) return 15000
  return 15000 + (rank - 5) * 8000
}

// ─── Power portrait IDs (inara.cz/sites/elite/images/powers/{id}.jpg) ─────────
const POWER_PORTRAIT_IDS = {
  'Denton Patreus':       1,
  'Aisling Duval':        2,
  'Edmund Mahon':         3,
  'Arissa Lavigny-Duval': 4,
  'Felicia Winters':      5,
  'Li Yong-Rui':          7,
  'Zemina Torval':        8,
  'Pranav Antal':         9,
  'Archon Delaine':       10,
  'Yuri Grom':            11,
  'Jerome Archer':        12,
  'Nakato Kaine':         13
}

// ─── Rank tick marks for 0→100 track ─────────────────────────────────────────
const RANK_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// ─── Activity category display order ─────────────────────────────────────────
const CATEGORY_ORDER = ['Combat', 'Finance', 'Social', 'Covert']

// ─── Power pledge bonuses (passive benefits while pledged) ───────────────────
const POWER_BONUSES = {
  'Jerome Archer':        'Ship & on-foot combat bond payouts +25% in controlled systems',
  'Arissa Lavigny-Duval': 'Bounty voucher payouts +50% in controlled systems',
  'Aisling Duval':        'Passenger mission payouts +50%;  Notoriety −1 per week automatically',
  'Denton Patreus':       'Weapons & defence module outfitting −30% in controlled systems',
  'Felicia Winters':      'Federal Navy mission payouts +50%',
  'Edmund Mahon':         'Commodity trade profits +10% in Alliance-controlled systems',
  'Nakato Kaine':         'Cartography & exploration data payouts +50%',
  'Li Yong-Rui':          'Trade profits +10% in LYR-controlled systems',
  'Zemina Torval':        'Mining refined yields +25% (extra processed resources)',
  'Pranav Antal':         'Tech broker material costs −10%',
  'Archon Delaine':       'Illegal cargo sale profits +25% in controlled systems',
  'Yuri Grom':            'Ship & on-foot combat bond payouts +25% in Grom-controlled systems'
}

// ─── Power rank module unlocks ────────────────────────────────────────────────
const MODULE_NAMES = {
  PFC:  'Pacifier Frag-Cannon',
  PD:   'Pulse Disruptor',
  IH:   'Imperial Hammer',
  PS:   'Prismatic Shield Generator',
  APA:  'Advanced Plasma Accelerator',
  ML:   'Mining Lance',
  Ret:  'Retributor Beam Laser',
  CC:   'Concord Cannon',
  CM:   'Containment Missile',
  PHM:  'Pack-Hound Missile Rack',
  EC:   'Enforcer Cannon',
  Cyto: 'Cytoscrambler Burst Laser'
}

// Ranks at which the 1st–12th module unlocks (same structure for all powers, order varies per power)
const MODULE_UNLOCK_RANKS  = [ 34,     39,     44,     50,     57,     63,     70,     76,     83,     88,     91,     97     ]
const MODULE_UNLOCK_MERITS = [ 247000, 287000, 327000, 375000, 431000, 479000, 535000, 583000, 639000, 679000, 703000, 751000 ]

// Per-power unlock order (index 0 = first unlock at rank 34, index 11 = last at rank 97)
const POWER_MODULE_ORDER = {
  'Jerome Archer':        ['PFC','PD', 'CM', 'EC', 'PHM','CC', 'APA','Cyto','PS', 'IH', 'Ret','ML'  ],
  'Felicia Winters':      ['PD', 'PFC','Ret','CC', 'PS', 'PHM','CM', 'EC', 'APA','IH', 'ML', 'Cyto' ],
  'Arissa Lavigny-Duval': ['IH', 'APA','ML', 'PS', 'EC', 'PHM','Ret','CC', 'CM', 'Cyto','PD','PFC'  ],
  'Aisling Duval':        ['PS', 'IH', 'APA','ML', 'Ret','CC', 'PHM','CM', 'EC', 'PD', 'PFC','Cyto' ],
  'Denton Patreus':       ['APA','ML', 'IH', 'PS', 'PHM','CM', 'Ret','EC', 'CC', 'PFC','PD', 'Cyto' ],
  'Zemina Torval':        ['ML', 'APA','IH', 'PS', 'CM', 'PHM','EC', 'PFC','Ret','Cyto','PD','CC'   ],
  'Edmund Mahon':         ['Ret','CC', 'PHM','EC', 'PS', 'CM', 'PD', 'APA','ML', 'IH', 'PFC','Cyto' ],
  'Nakato Kaine':         ['CC', 'Ret','PHM','PD', 'EC', 'CM', 'PS', 'IH', 'APA','PFC','Cyto','ML'  ],
  'Yuri Grom':            ['CM', 'PHM','APA','EC', 'PFC','PD', 'PS', 'IH', 'Ret','CC', 'ML', 'Cyto' ],
  'Li Yong-Rui':          ['PHM','EC', 'Ret','CC', 'PD', 'PS', 'CM', 'IH', 'ML', 'Cyto','PFC','APA' ],
  'Pranav Antal':         ['EC', 'PHM','CM', 'PD', 'ML', 'Ret','CC', 'Cyto','PFC','PS', 'IH', 'APA' ],
  'Archon Delaine':       ['Cyto','CM','PFC','PD', 'APA','PHM','ML', 'EC', 'PS', 'CC', 'IH', 'Ret'  ]
}

// ─── Power ethos per system type ─────────────────────────────────────────────
const POWER_ETHOS = {
  'Jerome Archer':        { reinforcement: 'Combat',  acquisition: 'Combat',  undermining: 'Covert'   },
  'Felicia Winters':      { reinforcement: 'Finance', acquisition: 'Social',  undermining: 'Finance'  },
  'Arissa Lavigny-Duval': { reinforcement: 'Combat',  acquisition: 'Social',  undermining: 'Combat'   },
  'Aisling Duval':        { reinforcement: 'Finance', acquisition: 'Social',  undermining: 'Social'   },
  'Denton Patreus':       { reinforcement: 'Combat',  acquisition: 'Finance', undermining: 'Combat'   },
  'Zemina Torval':        { reinforcement: 'Covert',  acquisition: 'Finance', undermining: 'Finance'  },
  'Edmund Mahon':         { reinforcement: 'Finance', acquisition: 'Finance', undermining: 'Combat'   },
  'Nakato Kaine':         { reinforcement: 'Covert',  acquisition: 'Social',  undermining: 'Social'   },
  'Yuri Grom':            { reinforcement: 'Combat',  acquisition: 'Covert',  undermining: 'Covert'   },
  'Li Yong-Rui':          { reinforcement: 'Finance', acquisition: 'Social',  undermining: 'Finance'  },
  'Pranav Antal':         { reinforcement: 'Covert',  acquisition: 'Social',  undermining: 'Social'   },
  'Archon Delaine':       { reinforcement: 'Combat',  acquisition: 'Combat',  undermining: 'Combat'   }
}

// ─── Power commodity names per activity type ─────────────────────────────────
const POWER_COMMODITIES = {
  'Jerome Archer':        { acquisition: "Archer's Restricted Intel",   reinforcement: "Archer's Field Supplies",        undermining: "Archer's Garrison Supplies"    },
  'Felicia Winters':      { acquisition: 'Liberal Federal Aid',          reinforcement: 'Liberal Federal Packages',       undermining: 'Liberal Propaganda'            },
  'Arissa Lavigny-Duval': { acquisition: 'Lavigny Corruption Reports',   reinforcement: 'Lavigny Garrison Supplies',      undermining: 'Lavigny Strategic Reports'     },
  'Aisling Duval':        { acquisition: 'Aisling Media Material',       reinforcement: 'Aisling Sealed Contract',        undermining: 'Aisling Programme Material'    },
  'Denton Patreus':       { acquisition: 'Marked Military Arms',         reinforcement: 'Patreus Field Supplies',         undermining: 'Patreus Garrison Supplies'     },
  'Zemina Torval':        { acquisition: 'Torval Trade Agreements',      reinforcement: 'Torval Deeds',                   undermining: 'Torval Political Servants'     },
  'Edmund Mahon':         { acquisition: 'Alliance Trade Agreements',    reinforcement: 'Alliance Legislative Contract',  undermining: 'Alliance Legislative Records'  },
  'Nakato Kaine':         { acquisition: 'Kaine Lobbying Material',      reinforcement: 'Kaine Aid Supplies',             undermining: 'Kaine Misinformation'          },
  'Yuri Grom':            { acquisition: 'Grom Underground Support',     reinforcement: 'Grom Military Supplies',         undermining: 'Grom Counter Intelligence'     },
  'Li Yong-Rui':          { acquisition: 'Sirius Franchise Package',     reinforcement: 'Sirius Industrial Equipment',    undermining: 'Sirius Corporate Contracts'    },
  'Pranav Antal':         { acquisition: 'Utopian Publicity',            reinforcement: 'Utopian Supplies',               undermining: 'Utopian Dissident'             },
  'Archon Delaine':       { acquisition: 'Kumo Contraband Packages',     reinforcement: 'Unmarked Military Supplies',     undermining: 'Marked Slaves'                 }
}

// ─── Activities available per system type ────────────────────────────────────
// conflictOnly: true — only available in Contested (Acquisition Conflict) systems
const ACTIVITIES = {
  reinforcement: [
    { name: 'Bounty Hunting',                              category: 'Combat',  description: 'Collect bounty vouchers. You do not need to hand in the vouchers.' },
    { name: 'Power Kills',                                 category: 'Combat',  description: 'Kill vessels and personnel aligned with Powers you are not pledged to in systems your Power controls.' },
    { name: 'Hand in Cartography Data',                    category: 'Finance', description: "Sell exploration data at any system your Power controls via a port's Universal Cartographics service." },
    { name: 'Sell for Large Profits',                      category: 'Finance', description: 'Sell commodities in systems that your Power controls for a profit of 40% or higher.' },
    { name: 'Sell Mined Resources',                        category: 'Finance', description: 'Sell mined commodities in systems that your Power controls. These goods must have been mined and not purchased from a market.' },
    { name: 'Sell Rare Goods',                             category: 'Finance', description: 'Sell Rare Goods in systems that your Power controls. These commodities cannot come from the same system they are being sold to.' },
    { name: 'Transport Powerplay Commodities',             category: 'Finance', description: "Requisition your Power's Reinforcement commodity from a Power contact at a Stronghold system (not the system you want to Reinforce) and deliver it to a Power contact in the target system." },
    { name: 'Collect Escape Pods',                         category: 'Social',  description: 'Collect escape pods from the system your Power controls and deliver them to a Power contact in the same system.' },
    { name: 'Complete Aid & Humanitarian Missions',        category: 'Social',  description: 'Complete reboot missions in systems that your Power controls.' },
    { name: 'Hand in Biological Research Samples',         category: 'Social',  description: 'Collect Biological Samples and deliver them to a Power contact in systems your Power controls.' },
    { name: 'Hand in Salvage',                             category: 'Social',  description: 'Collect salvage from the system your Power controls and deliver it to a Power contact in the same system.' },
    { name: 'Reboot Mission Completion',                   category: 'Social',  description: 'Complete support missions in systems that your Power controls.' },
    { name: 'Holoscreen Hacking',                          category: 'Covert',  description: 'Hack already-hacked holoscreen adverts at ports in systems that your Power controls to reset them.' },
    { name: 'Scan Ships and Wakes',                        category: 'Covert',  description: 'Scan ships, high energy wakes and low energy wakes in any system controlled by your Power. A Frame Shift Wake Scanner is required for high energy wakes.' },
    { name: 'Transfer Power Classified Data',              category: 'Covert',  description: "Download data from data ports at settlements in your Power's controlled systems and return them to the Power in the same system." },
    { name: 'Transfer Power Association & Political Data', category: 'Covert',  description: "Download data from data ports at settlements in your Power's controlled systems and return them to the Power in the same system." }
  ],
  acquisition: [
    { name: 'Bounty Hunting',                              category: 'Combat',  description: 'Collect bounty vouchers in systems that your Power can Acquire. You do not need to hand in the vouchers.' },
    { name: 'Power Kills',                                 category: 'Combat',  description: 'Kill vessels and personnel aligned with Powers you are not pledged to in systems your Power can acquire.' },
    { name: 'Sell for Large Profits',                      category: 'Finance', description: 'Sell commodities in systems that your Power can Acquire for a profit of 40% or higher.' },
    { name: 'Sell Mined Resources',                        category: 'Finance', description: 'Sell mined commodities in systems that your Power can Acquire. These goods must have been mined and not purchased from a market.' },
    { name: 'Sell Rare Goods',                             category: 'Finance', description: 'Sell Rare Goods in systems that your Power can Acquire. These commodities cannot come from the same system that they are being sold to.' },
    { name: 'Transport Powerplay Commodities',             category: 'Finance', description: "Requisition your Power's Acquisition commodity from a Power contact at a Fortified or Stronghold system within control range and deliver it to a Power contact in the Acquisition system." },
    { name: 'Flood Markets with Low Value Goods',          category: 'Finance', description: 'Sell commodities worth less than 500 credits at markets in systems that your Power can Acquire.', conflictOnly: true },
    { name: 'Collect Escape Pods',                         category: 'Social',  description: 'Collect escape pods from the Acquisition system and deliver them to a Power contact in a Fortified or Stronghold system controlled by your Power within control range.' },
    { name: 'Complete Aid & Humanitarian Missions',        category: 'Social',  description: 'Complete reboot missions in systems that your Power can Acquire.', conflictOnly: true },
    { name: 'Reboot Mission Completion',                   category: 'Social',  description: 'Complete reboot missions in systems that your Power can Acquire.' },
    { name: 'Retrieve Specific Goods',                     category: 'Social',  description: 'Retrieve Powerplay goods from Power containers at settlements and return them to a Fortified or Stronghold system controlled by your Power that is in control range.' },
    { name: 'Holoscreen Hacking',                          category: 'Covert',  description: 'Hack holoscreen adverts at ports in systems that your Power can Acquire.' },
    { name: 'Scan Datalinks',                              category: 'Covert',  description: 'Scan datalinks at Megaships in systems that your Power can Acquire.' },
    { name: 'Scan Ships and Wakes',                        category: 'Covert',  description: 'Scan ships, high energy wakes and low energy wakes in systems that your Power can Acquire. A Frame Shift Wake Scanner is required for high energy wakes.', conflictOnly: true },
    { name: 'Transfer Power Classified Data',              category: 'Covert',  description: 'Download data from data ports at settlements and return them to a Power contact in a Fortified or Stronghold system controlled by your Power that is in control range.' },
    { name: 'Transfer Power Association & Political Data', category: 'Covert',  description: 'Download data from data ports at settlements and return them to a Fortified or Stronghold system controlled by your Power that is in control range.' },
    { name: 'Transfer Power Research & Industrial Data',   category: 'Covert',  description: 'Download data from data ports at settlements and return them to a Fortified or Stronghold system controlled by your Power that is in control range.' },
    { name: 'Upload Powerplay-Specific Malware',           category: 'Covert',  description: 'Requisition Power Injection Malware from a Power contact at a Fortified or Stronghold system controlled by your Power and upload it to data ports at settlements in the Acquisition system.' }
  ],
  undermining: [
    { name: 'Power Kills',                                 category: 'Combat',  description: 'Kill vessels and personnel aligned with Powers you are not pledged to in systems controlled by Powers that you are not pledged to.' },
    { name: 'Flood Markets with Low Value Goods',          category: 'Finance', description: 'Sell commodities worth less than 500 credits at markets in systems controlled by Powers that you are not pledged to.' },
    { name: 'Sell Mined Resources',                        category: 'Finance', description: 'Sell mined commodities in systems controlled by Powers that you are not pledged to. These goods must have been mined and not purchased from a market.' },
    { name: 'Transport Powerplay Commodities',             category: 'Finance', description: "Requisition your Power's Undermining commodity from a Power contact at a Stronghold system controlled by your Power and deliver it to a Power contact in an enemy system." },
    { name: 'Collect Escape Pods',                         category: 'Social',  description: 'Collect Occupied Escape Pods and Damaged Escape Pods in systems controlled by a Power you are not pledged to. The pods count once scooped into your cargo hold.' },
    { name: 'Complete Aid & Humanitarian Missions',        category: 'Social',  description: 'Complete reboot missions in systems controlled by Powers that you are not pledged to.' },
    { name: 'Hand in Salvage',                             category: 'Social',  description: 'Collect salvage in systems controlled by a Power that you are not pledged to.' },
    { name: 'Retrieve Specific Goods',                     category: 'Social',  description: 'Retrieve Powerplay goods from Power containers at settlements in systems controlled by Powers that you are not pledged to and return them to a system controlled by your Power.' },
    { name: 'Commit Crimes',                               category: 'Covert',  description: 'Commit crimes in systems controlled by Powers that you are not pledged to.' },
    { name: 'Holoscreen Hacking',                          category: 'Covert',  description: 'Hack holoscreen adverts at ports in systems controlled by Powers that you are not pledged to.' },
    { name: 'Scan Datalinks',                              category: 'Covert',  description: 'Scan datalinks at Megaships in systems controlled by Powers that you are not pledged to.' },
    { name: 'Transfer Power Classified Data',              category: 'Covert',  description: 'Download data from data ports at settlements in systems controlled by Powers that you are not pledged to and return them to a Power contact in a system your Power controls.' },
    { name: 'Transfer Power Association & Political Data', category: 'Covert',  description: 'Download data from data ports at settlements in enemy systems and return them to a Power contact in a system your Power controls.' },
    { name: 'Transfer Power Research & Industrial Data',   category: 'Covert',  description: 'Download data from data ports at settlements in enemy systems and return them to a Power contact in a system your Power controls.' },
    { name: 'Upload Powerplay-Specific Malware',           category: 'Covert',  description: "Requisition Power Tracker Malware from a Power contact at a Stronghold system controlled by your Power and upload it to data ports at settlements in an enemy system." }
  ]
}

// ─── Salary tiers ─────────────────────────────────────────────────────────────
const SALARY_TIERS = [
  { standing: 'Top 100%',  salary: '500,000'       },
  { standing: 'Top 75%',   salary: '2,500,000'     },
  { standing: 'Top 50%',   salary: '5,000,000'     },
  { standing: 'Top 25%',   salary: '10,000,000'    },
  { standing: 'Top 10%',   salary: '50,000,000'    },
  { standing: 'Top 10',    salary: '100,000,000'   },
  { standing: 'Top 1',     salary: '1,000,000,000' }
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimePledged (seconds) {
  if (!seconds && seconds !== 0) return null
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days.toLocaleString()}d ${hours}h`
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Determine system type from PP state/powers relative to player's power
function getSystemType (powers, powerState, playerPower) {
  if (!powerState || !powers?.length) return null
  const playerControls = powers.includes(playerPower)
  if (powerState === 'Contested') return 'acquisition'
  if (playerControls) return 'reinforcement'
  return 'undermining'
}

// Group activities array into object keyed by category
function groupActivities (activities) {
  const groups = {}
  activities.forEach(a => {
    if (!groups[a.category]) groups[a.category] = []
    groups[a.category].push(a)
  })
  return groups
}

// Human-readable label and text class for each system type
const SYSTEM_TYPE_LABEL = {
  reinforcement: 'Reinforcement',
  acquisition:   'Acquisition',
  undermining:   'Undermining'
}
const SYSTEM_TYPE_CLASS = {
  reinforcement: 'text-success',
  acquisition:   'text-secondary',
  undermining:   'text-danger'
}

// Brief contextual description per system type
const SYSTEM_TYPE_INFO = {
  reinforcement: 'Your power controls this system. Activities earn merits and control points, building toward Fortified (20Ly acquisition range) or Stronghold (30Ly).',
  acquisition:   'Unoccupied system within your acquisition range. Reach 120,000 control points before a rival power to claim it. If contested by two powers, PP Combat Zones are active.',
  undermining:   "Enemy power's controlled system. Reduce their control points to push it into Turmoil, opening it for your power to acquire."
}

// ─── HeroSection ─────────────────────────────────────────────────────────────
function HeroSection ({ power, rank, merits, timePledged, systemType }) {
  const portraitId = POWER_PORTRAIT_IDS[power]
  const ethos = systemType ? POWER_ETHOS[power]?.[systemType] : null

  const currentThreshold = getMeritsForRank(rank)
  const nextThreshold = rank < 100 ? getMeritsForRank(rank + 1) : null
  const meritsNeeded = (nextThreshold != null && merits != null)
    ? Math.max(0, nextThreshold - merits)
    : null
  const progressPct = rank === 0
    ? 0
    : (nextThreshold != null && merits != null)
      ? Math.min(100, ((merits - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
      : 100
  const rankTrackPct = Math.min((rank / 100) * 100, 100)

  return (
    <div className='powerplay-panel__header'>
      {portraitId && (
        <div className='powerplay-panel__portrait-wrap'>
          <img
            src={`/images/powers/${portraitId}.jpg`}
            className='powerplay-panel__portrait'
            alt={power}
          />
          <div className='powerplay-panel__portrait-fade' />
        </div>
      )}
      <div className='powerplay-panel__hero'>
        <div className='powerplay-panel__hero-title'>
          <h1 className='powerplay-panel__power-name text-primary'>{power}</h1>
          <span className='powerplay-panel__rank-badge text-uppercase text-info'>
            Rank {rank ?? 0}{rank >= 100 && <span className='text-secondary'> ★</span>}
          </span>
        </div>

        <div className='powerplay-panel__hero-stats'>
          {merits != null && (
            <div className='powerplay-panel__hero-stat'>
              <span className='powerplay-panel__hero-stat-label text-muted'>Total merits</span>
              <span className='powerplay-panel__hero-stat-value text-info'>{merits.toLocaleString()}</span>
            </div>
          )}
          {meritsNeeded != null && (
            <div className='powerplay-panel__hero-stat'>
              <span className='powerplay-panel__hero-stat-label text-muted'>Merits to Rank {rank + 1}</span>
              <span className='powerplay-panel__hero-stat-value text-primary'>{meritsNeeded.toLocaleString()}</span>
            </div>
          )}
          {formatTimePledged(timePledged) && (
            <div className='powerplay-panel__hero-stat'>
              <span className='powerplay-panel__hero-stat-label text-muted'>Time pledged</span>
              <span className='powerplay-panel__hero-stat-value text-info'>{formatTimePledged(timePledged)}</span>
            </div>
          )}
          {ethos && (
            <div className='powerplay-panel__hero-stat'>
              <span className='powerplay-panel__hero-stat-label text-muted'>Ethos bonus</span>
              <span className={`powerplay-panel__hero-stat-value powerplay-panel__cat--${ethos.toLowerCase()}`}>
                {ethos} <span className='text-secondary'>+50%</span>
              </span>
            </div>
          )}
        </div>

        {/* Progress bars */}
        <div className='powerplay-panel__progress-section'>
          {rank === 0
            ? (
              <p className='powerplay-panel__merit-bar-label text-muted' style={{ marginBottom: '.8rem' }}>
                Complete your first set of powerplay assignments to advance to Rank 1.
              </p>
            )
            : (
              <>
                <div className='powerplay-panel__merit-bar-track'>
                  <div className='powerplay-panel__merit-bar-fill' style={{ width: `${progressPct.toFixed(1)}%` }} />
                </div>
                <span className='powerplay-panel__merit-bar-label text-muted'>
                  {rank < 100
                    ? `${progressPct.toFixed(0)}%  ·  ${meritsNeeded?.toLocaleString()} merits to Rank ${rank + 1}`
                    : 'Rank 100+ ★  ·  full care package each rank up'}
                </span>
              </>
            )
          }

          <div className='powerplay-panel__rank-track'>
            <div className='powerplay-panel__rank-track-line'>
              <div className='powerplay-panel__rank-track-fill' style={{ width: `${rankTrackPct}%` }} />
              <div className='powerplay-panel__rank-track-marker' style={{ left: `${rankTrackPct}%` }} />
              {RANK_TICKS.map(t => (
                <div
                  key={t}
                  className={`powerplay-panel__rank-tick${rank >= t ? ' powerplay-panel__rank-tick--passed' : ''}`}
                  style={{ left: `${t}%` }}
                >
                  <div className='powerplay-panel__rank-tick-line' />
                  <span className='powerplay-panel__rank-tick-label'>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SystemSection ────────────────────────────────────────────────────────────
function SystemSection ({ currentSystem, playerPower }) {
  if (!currentSystem?.name) {
    return (
      <div>
        <h4 className='powerplay-panel__section-title text-primary'>Current System</h4>
        <p className='text-muted' style={{ fontSize: '.875rem' }}>Location data unavailable.</p>
      </div>
    )
  }

  const systemType = getSystemType(currentSystem.powers, currentSystem.powerState, playerPower)
  const isContested = currentSystem.powerState === 'Contested'
  const activities = systemType
    ? ACTIVITIES[systemType].filter(a => !a.conflictOnly || isContested)
    : null
  const ethos = systemType && playerPower ? POWER_ETHOS[playerPower]?.[systemType] : null
  const commodity = playerPower && systemType ? POWER_COMMODITIES[playerPower]?.[systemType] : null
  const grouped = activities ? groupActivities(activities) : null

  return (
    <div>
      <h4 className='powerplay-panel__section-title text-primary'>Current System</h4>

      <div className='powerplay-panel__rows'>
        <div className='powerplay-panel__row'>
          <span className='text-primary'>System</span>
          <span className='text-info'>{currentSystem.name}</span>
        </div>
        {currentSystem.powers?.length > 0 && (
          <div className='powerplay-panel__row'>
            <span className='text-primary'>Controlling power</span>
            <span className='text-info'>{currentSystem.powers.join(', ')}</span>
          </div>
        )}
        {currentSystem.powerState && (
          <div className='powerplay-panel__row'>
            <span className='text-primary'>System state</span>
            <span className='text-info'>{currentSystem.powerState}</span>
          </div>
        )}
        {systemType && (
          <div className='powerplay-panel__row'>
            <span className='text-primary'>Activity type</span>
            <span className={`powerplay-panel__type-badge ${SYSTEM_TYPE_CLASS[systemType]}`}>
              {SYSTEM_TYPE_LABEL[systemType]}
            </span>
          </div>
        )}
        {ethos && (
          <div className='powerplay-panel__row'>
            <span className='text-primary'>Ethos bonus (+50%)</span>
            <span className={`powerplay-panel__cat--${ethos.toLowerCase()}`}>{ethos} activities</span>
          </div>
        )}
        {commodity && (
          <div className='powerplay-panel__row'>
            <span className='text-primary'>PP commodity</span>
            <span className='text-secondary'>{commodity}</span>
          </div>
        )}
      </div>

      {systemType && (
        <p className='powerplay-panel__system-type-note text-muted'>
          {SYSTEM_TYPE_INFO[systemType]}
        </p>
      )}

      {grouped && (
        <div className='powerplay-panel__activity-groups'>
          <h5 className='powerplay-panel__activities-heading text-primary'>Available Activities</h5>
          {CATEGORY_ORDER.map(cat => {
            const catActivities = grouped[cat]
            if (!catActivities?.length) return null
            const isEthos = cat === ethos
            return (
              <div key={cat} className={`powerplay-panel__activity-group${isEthos ? ' powerplay-panel__activity-group--ethos' : ''}`}>
                <div className={`powerplay-panel__activity-group-header powerplay-panel__cat--${cat.toLowerCase()}`}>
                  <span>{cat}</span>
                  {isEthos && <span className='text-secondary powerplay-panel__bonus-tag'>+50% ethos</span>}
                </div>
                {catActivities.map(a => (
                  <div key={a.name} className='powerplay-panel__activity-row'>
                    <span className={`powerplay-panel__activity-name ${isEthos ? 'text-info' : ''}`}>{a.name}</span>
                    {a.description && <p className='powerplay-panel__activity-desc'>{a.description}</p>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {!systemType && (
        <div className='powerplay-panel__no-pp-system'>
          <i className='icon daedalus-terminal-power powerplay-panel__no-pp-icon' />
          <p className='powerplay-panel__no-pp-text text-muted'>
            No powerplay activity in this system.<br />
            Travel to a controlled or contested system to earn merits.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── RewardsSection ───────────────────────────────────────────────────────────
function RewardsSection () {
  return (
    <div>
      <h4 className='powerplay-panel__section-title text-primary'>Care Packages</h4>
      <div className='powerplay-panel__rows'>
        <div className='powerplay-panel__row'>
          <span className='text-primary'>Every rank 1–99</span>
          <span className='text-info'>Mini package</span>
        </div>
        <div className='powerplay-panel__row'>
          <span className='text-primary'>Every rank 100+</span>
          <span className='text-secondary'>Full package</span>
        </div>
      </div>
      <div className='powerplay-panel__info-block'>
        <p className='text-muted'>
          <span className='text-info'>Mini</span> — 250,000 Cr + 5× ship engineer materials + 5× on-foot materials. Claim at any Power contact.
        </p>
        <p className='text-muted'>
          <span className='text-secondary'>Full</span> — 500,000 Cr + 10× ship engineer materials + 10× on-foot materials.
        </p>
      </div>
    </div>
  )
}

// ─── SalarySection ────────────────────────────────────────────────────────────
function SalarySection () {
  return (
    <div>
      <h4 className='powerplay-panel__section-title text-primary'>Weekly Salary</h4>
      <p className='text-muted' style={{ fontSize: '.9rem', marginBottom: '.5rem' }}>
        Awarded each Thursday based on merits earned <em>this cycle</em> vs. all pledged CMDRs. Requires at least 1 merit earned.
      </p>
      <div className='powerplay-panel__salary-table'>
        {SALARY_TIERS.map(tier => (
          <div key={tier.standing} className='powerplay-panel__salary-row'>
            <span className='text-info'>{tier.standing}</span>
            <span className='text-primary'>{tier.salary} Cr</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PowerBonusSection ────────────────────────────────────────────────────────
function PowerBonusSection ({ power, rank, merits }) {
  const bonus = POWER_BONUSES[power]
  const order = POWER_MODULE_ORDER[power] ?? []
  const nextIdx = order.findIndex((_, i) => MODULE_UNLOCK_RANKS[i] > rank)

  return (
    <div>
      <h4 className='powerplay-panel__section-title text-primary'>Pledge Benefits</h4>
      {bonus && <p className='powerplay-panel__pledge-bonus text-info'>{bonus}</p>}

      <div className='powerplay-panel__module-track'>
        <h5 className='powerplay-panel__activities-heading text-primary' style={{ marginTop: '.75rem' }}>Module Unlocks</h5>
        <div className='powerplay-panel__reward-list'>
          {order.map((abbr, i) => {
            const unlockRank   = MODULE_UNLOCK_RANKS[i]
            const unlockMerits = MODULE_UNLOCK_MERITS[i]
            const unlocked     = rank >= unlockRank
            const isNext       = i === nextIdx
            const meritsLeft   = merits != null ? Math.max(0, unlockMerits - merits) : null
            return (
              <div
                key={abbr}
                className={`powerplay-panel__reward-row${unlocked ? ' powerplay-panel__reward-row--unlocked' : ''}${isNext ? ' powerplay-panel__reward-row--next' : ''}`}
              >
                <span className='powerplay-panel__reward-rank text-muted'>R{unlockRank}</span>
                <span className={`powerplay-panel__reward-module${unlocked ? ' text-success' : isNext ? ' text-info' : ' text-muted'}`}>
                  {MODULE_NAMES[abbr]}
                </span>
                <span className='powerplay-panel__reward-status'>
                  {unlocked
                    ? <span className='text-success'>✓</span>
                    : isNext && meritsLeft != null
                      ? <span className='text-muted'>{meritsLeft.toLocaleString()}</span>
                      : null
                  }
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function PowerplayPanel ({ powerplay }) {
  if (!powerplay) {
    return (
      <div className='powerplay-panel'>
        <div className='powerplay-panel__loading text-primary text-blink-slow text-center'>
          <h2>Awaiting data</h2>
        </div>
      </div>
    )
  }

  if (!powerplay.pledged) {
    return (
      <div className='powerplay-panel'>
        <div>
          <h2 className='text-muted'>Not pledged</h2>
          <p className='text-info' style={{ marginTop: '.5rem' }}>
            Pledge allegiance to a power in the right-hand panel of your ship to begin earning merits.
          </p>
        </div>
        <hr />
        <SalarySection />
      </div>
    )
  }

  const systemType = powerplay.currentSystem
    ? getSystemType(powerplay.currentSystem.powers, powerplay.currentSystem.powerState, powerplay.power)
    : null

  return (
    <div className='powerplay-panel'>
      <HeroSection
        power={powerplay.power}
        rank={powerplay.rank ?? 0}
        merits={powerplay.merits}
        timePledged={powerplay.timePledged}
        systemType={systemType}
      />
      <hr />
      <div className='powerplay-panel__main'>
        <SystemSection currentSystem={powerplay.currentSystem} playerPower={powerplay.power} />
        <div className='powerplay-panel__right-col'>
          <PowerBonusSection power={powerplay.power} rank={powerplay.rank ?? 0} merits={powerplay.merits} />
          <hr style={{ margin: '1.25rem 0' }} />
          <RewardsSection />
          <hr style={{ margin: '1.25rem 0' }} />
          <SalarySection />
        </div>
      </div>
    </div>
  )
}
