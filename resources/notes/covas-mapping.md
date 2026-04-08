# COVAS Voice Mapping Reference

This document details every COVAS voice line triggered by DAEDALUS Terminal, how each is detected, and potential extensions using both in-game (Verity) and HCS Voicepack clips.

All voice lines are queued sequentially with a 0.5s gap between clips — if a new line triggers while another is playing, it waits rather than overlapping.

---

## Part 1 — Voiceover Replacements (Strict In-Game)

These play the same announcements the game would. Enable with **"Enable COVAS voiceover"** in Settings > Sounds.

### Journal Log Events

These fire when a matching `event` appears in the live journal log file.

| Event | Clip | Verity Says | Detection | Notes |
|---|---|---|---|---|
| `StartJump` (Hyperspace) | Countdown sequence | *"Five... Four... Three... Two... One... Engage."* | Journal `StartJump` with `JumpType: "Hyperspace"` | Plays `five.wav` → `four.wav` → `3.wav` → `two.wav` → `one.wav` → `engage.wav` timed ~1s apart |
| `StartJump` (Supercruise) | `frameshift_drive_charging.wav` | *"Frameshift drive charging."* | Journal `StartJump` with `JumpType: "Supercruise"` | |
| `ApproachBody` | `engage.wav` | *"Engage."* | Journal event when ship enters orbital cruise of a body | |
| `DockingGranted` | `docking_request_granted.wav` | *"Docking request granted."* | Journal event when station approves docking request | |
| `DockingDenied` | `docking_request_denied.wav` | *"Docking request denied."* | Journal event when station denies docking request | |
| `Docked` | `docking_successful_engines_disengaged.wav` | *"Docking successful. Engines disengaged."* | Journal event when ship touches down on pad | |
| `Undocked` | `ship_released_engines_engaged.wav` | *"Ship released. Engines engaged."* | Journal event when ship lifts off pad | |
| `FSSDiscoveryScan` | `system_scan_complete.wav` | *"System scan complete."* | Journal event when honk (discovery scan) finishes | |
| `FSSAllBodiesFound` | `all_system_bodies_located.wav` | *"All system bodies located."* | Journal event when FSS resolves every body in the system | |
| `SAAScanComplete` | `surface_scan_complete.wav` | *"Surface scan complete."* | Journal event when DSS mapping of a body finishes | |
| `Scanned` | `scan_detected.wav` | *"Scan detected."* | Journal event when **another ship scans the player** | |
| `NavRoute` | `route_plotted.wav` | *"Route plotted."* | Journal event when a new route is set in the galaxy map | |
| `ShieldState` (up) | `shields_online.wav` | *"Shields online."* | Journal event `ShieldState` with `ShieldsUp: true` | |
| `ShieldState` (down) | `shields_offline.wav` | *"Shields offline."* | Journal event `ShieldState` with `ShieldsUp: false` | |
| `HullDamage` | `taking_damage.wav` | *"Taking damage."* | Journal event when hull takes a hit | **45s debounce** — plays on first hit, then suppressed until 45s without hull damage |
| `HeatWarning` | `warning_taking_heat_damage.wav` | *"Warning, taking heat damage."* | Journal event when ship exceeds heat threshold | |
| `HeatDamage` | `warning_temperature_critical.wav` | *"Warning, temperature critical."* | Journal event when ship takes actual heat damage | |
| `UnderAttack` | `under_attack.wav` | *"Under attack."* | Journal event when ship is fired upon | **15s debounce** — plays once, then suppressed until 15s out of combat |
| `FighterDestroyed` | `fighter_destroyed.wav` | *"Fighter destroyed."* | Journal event when player's SLF is destroyed | |
| `SRVDestroyed` | `critical_alert.wav` | *"Critical alert."* | Journal event when player's SRV is destroyed | |
| `DiedEvent` | `eject.wav` | *"Eject."* | Journal event on player death | |
| `Resurrect` | `process_complete.wav` | *"Process complete."* | Journal event when rebuy/respawn completes | |
| `ApproachSettlement` | `incoming_signal.wav` | *"Incoming signal."* | Journal event when approaching an Odyssey settlement | |
| `CodexEntry` | `new_codex_entry.wav` | *"New codex entry."* | Journal event when a new codex entry is registered | |
| `FuelScoop` | `fuel_scooping.wav` | *"Fuel scooping."* | Journal event when fuel scoop engages | |
| `JetConeBoost` | `frameshift_drive_supercharged.wav` | *"Frameshift drive supercharged."* | Journal event when ship boosts from a neutron/white dwarf jet cone | |
| `ReservoirReplenished` | `fuel_replenished.wav` | *"Fuel replenished."* | Journal event when fuel reservoir refills from main tank | |
| `Synthesis` | `process_complete.wav` | *"Process complete."* | Journal event when a synthesis recipe finishes | |
| `Repair` | `repair_complete.wav` | *"Repair complete."* | Journal event when a module is repaired | |
| `RepairAll` | `repair_complete.wav` | *"Repair complete."* | Journal event when "Repair All" is used at a station | |
| `RebootRepair` | `system_reboot_sequence_initiated.wav` | *"System reboot sequence initiated."* | Journal event when reboot/repair is triggered | |
| `AfmuRepairs` | `diagnostic_repair_sequence_initiated.wav` | *"Diagnostic repair sequence initiated."* | Journal event when AFMU begins a repair | |
| `LaunchFighter` | `fighter_deployed.wav` | *"Fighter deployed."* | Journal event when SLF launches | |
| `DockFighter` | `fighter_docking_sequence_initiated.wav` | *"Fighter docking sequence initiated."* | Journal event when SLF begins docking | |
| `LaunchSRV` | `deployment_sequence_complete.wav` | *"Deployment sequence complete."* | Journal event when SRV deploys | |
| `LaunchDrone` | `programming_limpet_drone.wav` | *"Programming limpet drone."* | Journal event when a limpet is launched | |
| `ProspectedAsteroid` | `prospector_limpet_engaged.wav` | *"Prospector limpet engaged."* | Journal event when prospector limpet attaches | |
| `Bounty` | `target_destroyed.wav` | *"Target destroyed."* | Journal event when player destroys a wanted target | |
| `CommitCrime` (bounty) | `bounty_incurred.wav` | *"Bounty incurred."* | Journal event `CommitCrime` with `CrimeType: "bounty"` | |
| `Interdicted` | `frameshift_anomaly_detected.wav` | *"Frameshift anomaly detected."* | Journal event when player is interdicted | |
| `MissionFailed` | `mission_failed.wav` | *"Mission failed."* | Journal event when a mission fails | |
| `ReceiveText` | `incoming_message.wav` | *"Incoming message."* | Journal event when a text message is received | |
| `Screenshot` | `process_complete.wav` | *"Process complete."* | Journal event when F10 screenshot is taken | |
| `CockpitBreached` | `canopy_compromised.wav` | *"Canopy compromised."* | Journal event when cockpit glass breaks | |
| `SelfDestruct` | `selfdestruct_sequence_initiated.wav` | *"Self-destruct sequence initiated."* | Journal event when self-destruct is activated | |
| `CarrierJump` | `massive_frameshift_surge_detected.wav` | *"Massive frameshift surge detected."* | Journal event when a fleet carrier jumps in the same instance | |

### Hull Integrity Thresholds

These fire based on the `Health` field (0.0–1.0) in `HullDamage` journal events. Each threshold only fires once when first crossed, and resets when hull is repaired above 50%.

| Threshold | Clip | Verity Says | Trigger |
|---|---|---|---|
| Compromised | `hull_integrity_compromised.wav` | *"Hull integrity compromised."* | Hull drops below 50% |
| Critical | `hull_integrity_critical.wav` | *"Hull integrity critical."* | Hull drops below 20% |

### Additional Core Voiceover (Not Yet Wired)

These clips play in-game and have been identified for mapping, but need handler logic to detect their trigger conditions.

| Clip | Verity Says | Trigger Condition | Detection Method |
|---|---|---|---|
| `canopy_critical.wav` | *"Canopy critical."* | Canopy integrity drops to critical levels after breach | Needs canopy health tracking (not in standard journal) |
| `cargo_hold_at_maximum_capacity.wav` | *"Cargo hold at maximum capacity."* | Cargo count reaches ship capacity | Compare cargo count vs capacity from `Loadout` event |
| `power_plant_capacity_exceeded.wav` | *"Power plant capacity exceeded."* | Modules draw more power than reactor output | Compare module power draw vs power plant from `Loadout` |
| `warning_oxygen_low.wav` | *"Warning, oxygen low."* | Suit oxygen drops below threshold (Odyssey on-foot) | Monitor `Oxygen` value in Status.json |
| `warning_oxygen_critical.wav` | *"Warning, oxygen critical."* | Suit oxygen drops to critical (Odyssey on-foot) | Monitor `Oxygen` value in Status.json |
| `warning_frameshift_drive_operating_beyond_safety_limits.wav` | *"Warning, FSD operating beyond safety limits."* | Entering neutron/white dwarf jet cone | Detect proximity to neutron/WD before `JetConeBoost` fires |
| `caustic_damage_detected.wav` | *"Caustic damage detected."* | Thargoid caustic missile hit | Detect caustic damage type from hull damage events |

### Status Flag Changes

These fire when `Status.json` changes and a flag value differs from the previous poll.

| Flag | State | Clip | Verity Says | Detection |
|---|---|---|---|---|
| `cargoScoopDeployed` | deployed | `cargo_scoop_deployed.wav` | *"Cargo scoop deployed."* | `Status.json` flag bit changes to true |
| `cargoScoopDeployed` | retracted | `cargo_scoop_retracted.wav` | *"Cargo scoop retracted."* | `Status.json` flag bit changes to false |
| `landingGearDown` | down | `landing_gear_deployed.wav` | *"Landing gear deployed."* | `Status.json` flag bit changes to true |
| `landingGearDown` | up | `landing_gear_retracted.wav` | *"Landing gear retracted."* | `Status.json` flag bit changes to false |
| `silentRunning` | on | `silent_running.wav` | *"Silent running."* | `Status.json` flag bit changes to true |
| `silentRunning` | off | `thermal_signature_restored.wav` | *"Thermal signature restored."* | `Status.json` flag bit changes to false |

### Events Verified As NOT Playing In-Game

The following events were previously mapped but confirmed to have **no in-game COVAS voiceline**:

| Event | Why Removed |
|---|---|
| `FSDJump` (arrival) | No voiceline on FSD arrive |
| `SupercruiseEntry` | No voiceline on supercruise entry (only on FSD charge) |
| `SupercruiseExit` | No voiceline on supercruise exit |
| `NavRouteClear` | No voiceline on route clear |
| `ScanOrganic` | No "new life form discovered" on scan |
| `DockSRV` | No confirmed on SRV board |
| `MiningRefined` | No voiceline on refine |
| `AsteroidCracked` | No voiceline on asteroid crack |
| `CollectCargo` | No voiceline on cargo collect |
| `EjectCargo` | No voiceline on cargo eject |
| `MarketBuy` / `MarketSell` | No voiceline on market transactions |
| `BuyDrones` / `SellDrones` | No voiceline on limpet transactions |
| `ShipTargeted` | No scan detected when player scans another ship |
| `Interdiction` | No confirmed when player interdicts |
| `EscapeInterdiction` | No confirmed on escape |
| `CargoDepot` (both) | No confirmed on cargo depot |
| `MissionCompleted` | No mission objective complete on turn-in |
| `FSSSignalDiscovered` | No new signal detected on FSS |
| `MaterialCollected` | No confirmed on material pickup |
| `Friends` / `SquadronStartup` | No incoming notification |
| `NpcCrewPaidWage` | No confirmed on crew wage |
| `ModuleBuy` / `ModuleSell` | No confirmed on module transactions |
| `UseConsumable` | No confirmed on consumable use |
| `ScanBaryCentre` | No scan detected on barycentre |
| `Backpack` | No confirmed on backpack changes |
| Lights on/off | No confirmed on light toggle |
| Night vision on/off | No confirmed on night vision toggle |
| Hardpoints deployed/retracted | No voiceline on hardpoint toggle |
| HUD analysis/combat mode | No voiceline on mode switch |

---

## Part 2 — Extended Alerts

Alerts that go **beyond** what the game provides. These require computed conditions. Enable with **"Enable extended voice alerts"** in Settings > Sounds.

### Currently Mapped (In-Game Verity Clips)

| Alert | Clip | Verity Says | Trigger Condition | Status |
|---|---|---|---|---|
| Low Fuel | `main_fuel_tank_low.wav` | *"Main fuel tank low."* | Jumping to a system that would leave fuel below 15% of max tank | Not wired |
| Low Fuel (Last Chance) | `warning_last_chance_to_refuel_on_current_route.wav` | *"Warning, last chance to refuel on current route."* | Cannot reach next scoopable star on current fuel (accounting for fuel scoop presence and stations along route) | Not wired |
| Dangerous System | `warning_target_system_safety_risk.wav` | *"Warning, target system safety risk."* | System has recent PvP kills, OR contains a white dwarf/black hole as arrival star | Not wired |
| Notable Stellar Phenomena | `unknown_anomaly_detected.wav` | *"Unknown anomaly detected."* | FSS signal source contains "Notable Stellar Phenomena" | Not wired |
| High Gravity | `high_gravity_warning.wav` | *"High gravity warning."* | Body gravity exceeds a threshold (e.g., > 2g) when approaching for landing | Not wired |
| Valuable Body | `new_discovery.wav` | *"New discovery."* | FSS scan resolves a body worth more than the configured credit threshold | Not wired |
| System Survey Complete | `all_system_bodies_located.wav` | *"All system bodies located."* | All valuable bodies in the system have been scanned | Not wired |
| Hazardous Environment | `warning_hazardous_environment.wav` | *"Warning, hazardous environment."* | Entering an environment that could damage player or ship (caustic atmosphere, extreme temperatures) | Not wired |
| Security Detected | `security_forces_detected.wav` | *"Security forces detected."* | System security ships appear near a wanted player | Not wired |
| Capital Signature | `warning_capital_class_signature_detected.wav` | *"Warning, capital class signature detected."* | Farragut/Majestic-class capital ship enters instance | Not wired |
| Alien Discovery | `alien_civilization_discovery.wav` | *"Alien civilization discovery."* | Approaching a Guardian or Thargoid site | Not wired |
| Energy Surge | `energy_surge_detected.wav` | *"Energy surge detected."* | Thargoid encounter / AX combat energy pulse | Not wired |

### Additional In-Game Clips Available for Future Extensions

These are unused Verity clips extracted from the game that could be mapped to computed conditions.

| Clip | Verity Says | Potential Use |
|---|---|---|
| `main_fuel_tank_drained.wav` | *"Main fuel tank drained."* | Alert when main tank hits zero (fuel rats emergency) |
| `low_gravity_warning.wav` | *"Low gravity warning."* | Alert for very low gravity bodies |
| `warning_landing_gear_not_deployed.wav` | *"Warning, landing gear not deployed."* | Alert when descending near a surface without gear |
| `excess_cargo_detected.wav` | *"Excess cargo detected."* | When carrying more cargo than legal (smuggling) |
| `module_malfunction.wav` | *"Module malfunction."* | When any module drops below a health threshold |
| `warning_safety_alert.wav` | *"Warning, safety alert."* | Generic safety warning for custom conditions |
| `new_gas_giant_discovered.wav` | *"New gas giant discovered."* | When FSS resolves a gas giant (first discovery) |
| `new_terrestrial_discovered.wav` | *"New terrestrial discovered."* | When FSS resolves a rocky/HMC/water world (first discovery) |
| `new_star_discovered.wav` | *"New star discovered."* | When FSS resolves a secondary star (first discovery) |
| `new_geology_discovered.wav` | *"New geology discovered."* | When DSS reveals geological signals |
| `security_forces_inbound.wav` | *"Security forces inbound."* | When security is called and en route |

### HCS Voicepack Clips Available for Extensions

These are additional lines voiced by Verity for the HCS Voicepack (sold separately via VoiceAttack). Not included in the base game. Requires the user to set an HCS Voicepack directory in Settings.

| Clip | File (relative to voicepack dir) | Potential Use |
|---|---|---|
| *"Check your fuel"* | `Additional Dialogue/Check your fuel.mp3` | Low fuel warning (alternative/supplement to in-game clip) |
| *"This system is reported to be lawless"* | `Journal Triggers/This system is reported to be lawless.mp3` | Dangerous/anarchy system entry warning |
| *"Unidentified phenomena"* | `Role/Unidentified phenomena.mp3` | Notable Stellar Phenomena signal source detected |
| *"Warning"* | `Role/Warning.mp3` | High gravity / general danger alert |
| *"Warning" (alt)* | `Role/Warning 2.mp3` | Alternative high gravity / danger alert |
| *"Fascinating"* | `Role/Fascinating.mp3` | Valuable body discovered (random pick from pool) |
| *"Extraordinary"* | `Role/Extraordinary.mp3` | Valuable body discovered (random pick from pool) |
| *"Something wonderful"* | `Role/Something wonderful.mp3` | Valuable body discovered (random pick from pool) |
| *"Interesting"* | `Acknowledgements/Interesting.mp3` | Valuable body discovered (random pick from pool) |
| *"Interesting" (alt)* | `Role/Interesting.mp3` | Valuable body discovered (random pick from pool) |
| *"Impressive"* | `Role/Impressive.mp3` | Valuable body discovered (random pick from pool) |
| *"Impressive" (alt)* | `Role/Impressive 2.mp3` | Valuable body discovered (random pick from pool) |
| *"Interdiction warning"* | `Journal Triggers/Interdiction warning.mp3` | Pre-interdiction alert |
| *"Scanning complete"* | `Sensors Radar/Scanning complete.mp3` | System survey complete when all valuables mapped |

---

## Implementation Notes

- **Voiceover clips** are WAV files bundled at `game_voicelines/verity/`.
- **HCS Voicepack clips** are MP3 files from the user's VoiceAttack installation. The path is configured in Settings > Sounds > HCS Voicepack.
- **Queue behaviour**: All clips are queued sequentially with a **0.5s gap** between clips. If a new line triggers while another is playing, it joins the queue rather than overlapping or interrupting.
- **Debounce**: `HullDamage` has a 45-second debounce (won't re-fire until 45s without hull damage). `UnderAttack` has a 15-second debounce (won't re-fire until 15s completely out of combat).
- **FSD Countdown**: Hyperspace jumps play a 5-4-3-2-1-Engage countdown sequence; supercruise charges play "Frameshift drive charging."
- **Hull thresholds**: Cross-boundary alerts at 50% (compromised) and 20% (critical), with state reset when repaired above 50%.
- **Preferences**: `covasVoiceoverEnabled` and `covasExtendedEnabled` are independent booleans stored in `Preferences.json`.
- **Extended alerts are not yet wired** — the `handleExtendedAlert(alertName)` function exists in `covas-player.js` but the trigger conditions in the various handler modules (exploration, nav-route, ship-status) have not been connected yet.
