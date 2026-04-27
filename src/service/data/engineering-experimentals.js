/**
 * Engineering experimental effects data, derived from the EDOMH
 * (Elite Dangerous Odyssey Materials Helper) source at:
 *   constants/horizons/ExperimentalEffectBlueprints.java
 *
 * Keyed by module category name, each entry lists the experimental effects
 * available for that category with their display names.
 *
 * Module FD name → category matching is done by getModuleExperimentals().
 */

// ---------------------------------------------------------------------------
// Display name helper (enum → human readable)
// ---------------------------------------------------------------------------

// Manual overrides for names that don't auto-convert cleanly
const DISPLAY_NAME_OVERRIDES = {
  FSD_INTERRUPT: 'FSD Interrupt',
  LO_DRAW: 'Lo-Draw',
  HI_CAP: 'Hi-Cap',
  MULTI_SERVOS: 'Multi-Servos',
  AUTO_LOADER: 'Auto Loader',
  ION_DISRUPTOR: 'Ion Disruptor',
  BOSS_CELLS: 'Boss Cells',
  SUPER_CAPACITOR: 'Super Capacitor',
  MULTI_WEAVE: 'Multi-Weave',
  FAST_CHARGE: 'Fast Charge',
  MASS_MANAGER: 'Mass Manager',
  DRAG_DRIVES: 'Drag Drives',
  DRIVE_DISTRIBUTORS: 'Drive Distributors',
  SUPER_CONDUITS: 'Super Conduits',
  CLUSTER_CAPACITOR: 'Cluster Capacitor'
}

function toDisplayName (key) {
  if (DISPLAY_NAME_OVERRIDES[key]) return DISPLAY_NAME_OVERRIDES[key]
  // Convert SCREAMING_SNAKE_CASE to Title Case
  return key
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Category → experimental effects map
// Source: ExperimentalEffectBlueprints.java static Map fields
// ---------------------------------------------------------------------------

const CATEGORY_EXPERIMENTALS = {
  BEAM_LASER: [
    'CONCORDANT_SEQUENCE',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'OVERSIZED',
    'REGENERATION_SEQUENCE',
    'STRIPPED_DOWN',
    'THERMAL_CONDUIT',
    'THERMAL_SHOCK',
    'THERMAL_VENT'
  ],
  BURST_LASER: [
    'CONCORDANT_SEQUENCE',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'INERTIAL_IMPACT',
    'MULTI_SERVOS',
    'OVERSIZED',
    'PHASING_SEQUENCE',
    'SCRAMBLE_SPECTRUM',
    'STRIPPED_DOWN',
    'THERMAL_SHOCK'
  ],
  PULSE_LASER: [
    'CONCORDANT_SEQUENCE',
    'DOUBLE_BRACED',
    'EMISSIVE_MUNITIONS',
    'FLOW_CONTROL',
    'MULTI_SERVOS',
    'OVERSIZED',
    'PHASING_SEQUENCE',
    'SCRAMBLE_SPECTRUM',
    'STRIPPED_DOWN',
    'THERMAL_SHOCK'
  ],
  MULTI_CANNON: [
    'AUTO_LOADER',
    'CORROSIVE_SHELL',
    'DOUBLE_BRACED',
    'EMISSIVE_MUNITIONS',
    'FLOW_CONTROL',
    'INCENDIARY_ROUNDS',
    'MULTI_SERVOS',
    'OVERSIZED',
    'SMART_ROUNDS',
    'STRIPPED_DOWN',
    'THERMAL_SHOCK'
  ],
  CANNON: [
    'AUTO_LOADER',
    'DISPERSAL_FIELD',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'FORCE_SHELL',
    'HIGH_YIELD_SHELL',
    'MULTI_SERVOS',
    'OVERSIZED',
    'SMART_ROUNDS',
    'STRIPPED_DOWN',
    'THERMAL_CASCADE'
  ],
  FRAGMENT_CANNON: [
    'CORROSIVE_SHELL',
    'DAZZLE_SHELL',
    'DOUBLE_BRACED',
    'DRAG_MUNITION',
    'FLOW_CONTROL',
    'INCENDIARY_ROUNDS',
    'MULTI_SERVOS',
    'OVERSIZED',
    'SCREENING_SHELL',
    'STRIPPED_DOWN'
  ],
  DUMBFIRE_MISSILE_RACK: [
    'DOUBLE_BRACED',
    'EMISSIVE_MUNITIONS',
    'FLOW_CONTROL',
    'FSD_INTERRUPT',
    'MULTI_SERVOS',
    'OVERLOAD_MUNITIONS',
    'OVERSIZED',
    'PENETRATOR_MUNITIONS',
    'STRIPPED_DOWN',
    'THERMAL_CASCADE'
  ],
  SEEKER_MISSILE_RACK: [
    'DOUBLE_BRACED',
    'DRAG_MUNITION',
    'EMISSIVE_MUNITIONS',
    'FLOW_CONTROL',
    'MULTI_SERVOS',
    'OVERLOAD_MUNITIONS',
    'OVERSIZED',
    'STRIPPED_DOWN',
    'THERMAL_CASCADE'
  ],
  TORPEDO_PYLON: [
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'MASS_LOCK_MUNITION',
    'OVERSIZED',
    'PENETRATOR_PAYLOAD',
    'REVERBERATING_CASCADE',
    'STRIPPED_DOWN'
  ],
  MINE_LAUNCHER: [
    'DOUBLE_BRACED',
    'EMISSIVE_MUNITIONS',
    'FLOW_CONTROL',
    'ION_DISRUPTOR',
    'OVERLOAD_MUNITIONS',
    'OVERSIZED',
    'RADIANT_CANISTER',
    'REVERBERATING_CASCADE',
    'SHIFT_LOCK_CANISTER',
    'STRIPPED_DOWN'
  ],
  PLASMA_ACCELERATOR: [
    'DAZZLE_SHELL',
    'DISPERSAL_FIELD',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'MULTI_SERVOS',
    'OVERSIZED',
    'PHASING_SEQUENCE',
    'PLASMA_SLUG',
    'STRIPPED_DOWN',
    'TARGET_LOCK_BREAKER',
    'THERMAL_CONDUIT'
  ],
  RAIL_GUN: [
    'DOUBLE_BRACED',
    'FEEDBACK_CASCADE',
    'FLOW_CONTROL',
    'MULTI_SERVOS',
    'OVERSIZED',
    'PLASMA_SLUG',
    'STRIPPED_DOWN',
    'SUPER_PENETRATOR'
  ],
  POWER_PLANT: [
    'DOUBLE_BRACED',
    'MONSTERED',
    'STRIPPED_DOWN',
    'THERMAL_SPREAD'
  ],
  ARMOUR: [
    'ANGLED_PLATING',
    'DEEP_PLATING',
    'LAYERED_PLATING',
    'REFLECTIVE_PLATING'
  ],
  HULL_REINFORCEMENT_PACKAGE: [
    'ANGLED_PLATING',
    'DEEP_PLATING',
    'LAYERED_PLATING',
    'REFLECTIVE_PLATING'
  ],
  SHIELD_CELL_BANK: [
    'BOSS_CELLS',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'RECYCLING_CELLS',
    'STRIPPED_DOWN'
  ],
  SHIELD_BOOSTER: [
    'BLAST_BLOCK',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'FORCE_BLOCK',
    'SUPER_CAPACITOR',
    'THERMO_BLOCK'
  ],
  SHIELD_GENERATOR: [
    'DOUBLE_BRACED',
    'FAST_CHARGE',
    'FORCE_BLOCK',
    'HI_CAP',
    'LO_DRAW',
    'MULTI_WEAVE',
    'STRIPPED_DOWN',
    'THERMO_BLOCK'
  ],
  FRAME_SHIFT_DRIVE: [
    'DEEP_CHARGE',
    'DOUBLE_BRACED',
    'MASS_MANAGER',
    'STRIPPED_DOWN',
    'THERMAL_SPREAD'
  ],
  THRUSTERS: [
    'DOUBLE_BRACED',
    'DRAG_DRIVES',
    'DRIVE_DISTRIBUTORS',
    'STRIPPED_DOWN',
    'THERMAL_SPREAD'
  ],
  POWER_DISTRIBUTOR: [
    'CLUSTER_CAPACITOR',
    'DOUBLE_BRACED',
    'FLOW_CONTROL',
    'STRIPPED_DOWN',
    'SUPER_CONDUITS'
  ]
}

// ---------------------------------------------------------------------------
// FD name → module category lookup table
// Entries are checked in order; first match wins.
// ---------------------------------------------------------------------------

const FD_CATEGORY_RULES = [
  // Hardpoints
  { test: s => s.startsWith('hpt_beamlaser'), category: 'BEAM_LASER' },
  { test: s => s.startsWith('hpt_burstlaser'), category: 'BURST_LASER' },
  { test: s => s.startsWith('hpt_pulselaser'), category: 'PULSE_LASER' },
  { test: s => s.startsWith('hpt_multicannon'), category: 'MULTI_CANNON' },
  { test: s => s.startsWith('hpt_cannon'), category: 'CANNON' },
  { test: s => s.startsWith('hpt_slugshot'), category: 'FRAGMENT_CANNON' },
  { test: s => s.startsWith('hpt_minelauncher') || s.startsWith('hpt_shockminelauncher'), category: 'MINE_LAUNCHER' },
  { test: s => s.startsWith('hpt_dumbfiremissile') || s.startsWith('hpt_basicmissilerack') || s.startsWith('hpt_advancedmissilerack') || s.startsWith('hpt_rocketlauncher'), category: 'DUMBFIRE_MISSILE_RACK' },
  { test: s => s.startsWith('hpt_seekermissilerack'), category: 'SEEKER_MISSILE_RACK' },
  { test: s => s.startsWith('hpt_torpedo'), category: 'TORPEDO_PYLON' },
  { test: s => s.startsWith('hpt_plasmaaccelerator'), category: 'PLASMA_ACCELERATOR' },
  { test: s => s.startsWith('hpt_railgun'), category: 'RAIL_GUN' },
  // Utility — no experimentals by default; shield boosters are utility mounts
  { test: s => s.startsWith('hpt_shieldbooster'), category: 'SHIELD_BOOSTER' },
  // Core internals
  { test: s => s.startsWith('int_powerplant'), category: 'POWER_PLANT' },
  { test: s => s.startsWith('int_engine') || s.startsWith('int_driveenanh'), category: 'THRUSTERS' },
  { test: s => s.startsWith('int_hyperdrive') && !s.includes('limpet'), category: 'FRAME_SHIFT_DRIVE' },
  { test: s => s.startsWith('int_powerdistributor'), category: 'POWER_DISTRIBUTOR' },
  { test: s => s.startsWith('int_shieldgenerator') || s.startsWith('int_biweaveshield'), category: 'SHIELD_GENERATOR' },
  // Optional internals
  { test: s => s.startsWith('int_shieldcellbank'), category: 'SHIELD_CELL_BANK' },
  { test: s => s.startsWith('int_hullreinforcement'), category: 'HULL_REINFORCEMENT_PACKAGE' },
  { test: s => s.includes('_armour_'), category: 'ARMOUR' }
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a module FD symbol (journal Item value, lowercase, e.g. "hpt_beamlaser_fixed_small"),
 * return an array of { key, name } objects for available experimental effects.
 * Returns [] if the module has no experimental effects.
 *
 * @param {string} moduleSymbol - module FD name (lowercase)
 * @returns {{ key: string, name: string }[]}
 */
export function getModuleExperimentals (moduleSymbol) {
  if (!moduleSymbol) return []
  const sym = moduleSymbol.toLowerCase()
  const rule = FD_CATEGORY_RULES.find(r => r.test(sym))
  if (!rule) return []
  const keys = CATEGORY_EXPERIMENTALS[rule.category] ?? []
  return keys.map(key => ({ key, name: toDisplayName(key) }))
}

export { CATEGORY_EXPERIMENTALS }
