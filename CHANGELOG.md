# Changelog — DAEDALUS Terminal

All notable changes to this fork are documented here.

Forked from: [ICARUS Terminal](https://github.com/iaincollins/icarus) v0.22.0

---

## v2.0.0 — Engineering & Materials Overhaul (in progress)

### New Features

#### Engineering Wishlist & Material Planner
- Per-ship wishlist (keyed by `Loadout.ShipID`) for engineering blueprints, synthesis recipes, and tech broker unlocks
- Aggregate material shortfall calculation across all wishlist items
- Multi-source trade suggestion algorithm (`calculateCombinedTrades`) combining partial sources to satisfy shortfalls
- Smart Route generator: optimal multi-stop collection, trade, and engineer unlock route with TSP/2-opt optimisation
- Engineer Unlock Chain: automatically resolves prerequisites for Horizons and Odyssey engineers; auto-completes activity stops via `EngineerProgress` journal events
- Ship Fitting Checks: validates landing pad compatibility and flags missing modules before routing to an engineer

#### Data Additions
- `unlockRequirements` added to all 38 engineers in `engineers.json` (25 Horizons with learn/invite/unlock stages; 13 Odyssey with 1–2 stages, no invite)
- New `material-sources.json`: per-material sourcing hints with 3D coordinates for Smart Route distance calculations
- New `material-traders.json`: material trader locations with background 24 h refresh from Spansh stations API

#### New Pages
- **Material Planner** — four sub-tabs: Smart Route, Trader Planner, Engineer Route, Collection Guide
- **Synthesis** — synthesis recipe viewer and wishlist integration
- **Tech Broker** — tech broker unlock viewer and wishlist integration

### Data
- `src/service/data/engineers.json` — `unlockRequirements` array added to all 38 engineers
- `src/service/data/material-sources.json` — new file, per-material sourcing hints and hotspot coordinates
- `src/service/data/material-traders.json` — new file, material trader locations

---

## Fork Changes (based on v0.22.0)

### New Features

#### Biological Predictor Engine
- Species prediction engine that determines which biological species can viably exist on a body based on its properties (atmosphere, temperature, gravity, volcanism, star class, galactic region, nebula proximity, etc.)
- Probability-weighted value estimates using per-species reward data
- Full criteria ruleset covering all known genera and species
- Data files: `bio-criteria.json`, `nebulae.json`, `region-map.json`

#### Exploration Pages
- New **Exploration** section added to navigation with three sub-pages:
  - **Overview** — summary of the current session's exploration data
  - **Route** — per-system breakdown with bio signal counts and expected credit values
  - **System** — detailed body list with predicted species and scan values
- Exploration event handler processes `FSSDiscoveryScan`, `FSSBodySignals`, `Scan`, `SAAScanComplete`, and `SAASignalsFound` events
- Body value calculations for stars, planets, and bio signals using established community formulae

#### COVAS Voiceover System
- In-game voice assistant (Verity) audio playback triggered by journal events
- Sequential queue with configurable gap between clips to avoid overlaps
- Event-to-voiceline mapping via `covas-event-map.json` covering most existing ingame voiceline triggers
- Debounce support to prevent rapid-fire repeated alerts
- Support for custom voiceline directories (point to your own voice pack, might work)
- Extended alerts mode for computed events beyond standard game audio
- Settings panel with toggle controls for voiceover and extended alerts

#### Landing Pad Overlay
- Visual overlay showing landing pad positions for stations and settlements
- Three layout types:
  - **Starport** — dodecagonal layout (Coriolis, Orbis, Ocellus, etc.) with 45 pads
  - **Fleet Carrier** — 16-pad carrier layout
  - **Settlement** — 28 Odyssey settlement templates with named pad positions per economy type (Agriculture, Extraction, High Tech, Industrial, Military, Tourism)
- Toggle control in settings to enable/disable the overlay

### Improvements

#### Journal Log Processing
- Incremental file reading: only processes new lines instead of re-reading entire log files
- Polling interval reduced to 250ms for more responsive event detection
- File size estimation for line count instead of reading entire file

#### EDSM Integration
- Improved error handling and retry logic for EDSM API requests
- Better caching of system and body data

#### UI/UX
- Galaxy background image compressed from 205 KB to 52 KB
- Removed unnecessary fade-in animations from system map panels
- Minor CSS fixes across navigation, ship, system map, and modal panels

#### System Map
- Added null guard for planetary base iteration to prevent errors on bodies with no bases
- Optimized surface port / settlement detection with early exit

### Data Files Added
- `bio-criteria.json` — biological species viability criteria
- `covas-event-map.json` — journal event to voiceline mapping
- `nebulae.json` — known nebula positions for bio prediction proximity checks
- `region-map.json` — Elite Dangerous galactic region boundaries

### Dependencies
- No new runtime dependencies added
- All new functionality uses Node.js built-in modules (`fs`, `path`, `child_process`, `os`)
