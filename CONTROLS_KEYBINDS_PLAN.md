# Controls — Keybinds Page Plan

## Overview

This document describes the research findings for the **edrefcard2** tool and the phased plan for building the `/controls/keybinds` page in Daedalus Terminal.

---

## About edrefcard2

**Source:** `R:\BiologicalsUpdate\edrefcard2`  
**Live site:** https://edrefcard.info  
**Tech:** Python 3 web app using `lxml` (XML parsing) and `wand`/ImageMagick (image rendering)

### What it does

edrefcard2 accepts an Elite Dangerous `.binds` file upload, then renders annotated reference card images for each input device the user has bound (keyboard, HOTAS, gamepad, etc). The images show each device with its keys labelled by in-game action.

### Key source files

| File | Purpose |
|------|---------|
| `www/scripts/controlsData.py` | ~300+ control definitions: internal name → `{Group, Category, Order, Name, Type}` |
| `www/scripts/bindingsData.py` | 60+ device templates (HOTAS, keyboard, gamepad, etc.) |
| `www/scripts/bindings.py` | `.binds` XML parser + device image renderer |

### `.binds` file format

Elite Dangerous keybinding presets live at:
```
%LocalAppData%\Frontier Developments\Elite Dangerous\Options\Bindings\
```

Active preset is set by `StartPreset.start` (plain text file in same dir, contains preset name without `.binds`).

**Digital (button) control:**
```xml
<YawLeftButton>
  <Primary Device="Keyboard" Key="Key_A" />
  <Secondary Device="{NoDevice}" Key="" />
  <Modifier Device="Keyboard" Key="Key_LShift" />
</YawLeftButton>
```

**Analogue (axis) control:**
```xml
<RollAxisRaw>
  <Binding Device="SaitekX45" Key="Joy_XAxis" />
  <Inverted Value="0" />
  <Deadzone Value="0.00000000" />
</RollAxisRaw>
```

Unbound controls use `Device="{NoDevice}"` and/or empty `Key=""`.

### Control Groups (from controlsData.py)

| Group | Description |
|-------|-------------|
| `Galaxy map` | GalMap navigation and zoom controls |
| `Misc` | Shared controls (sensor range, microphone, HMD) |
| `Head look` | Head tracking controls |
| `SRV` | SRV-only driving, combat, power management |
| `Ship` | Ship flying, combat, navigation, UI panels |
| `Fighter` | SLF orders |
| `Multicrew` | Multicrew turret/FoV controls |
| `Scanners` | FSS (Full Spectrum Scanner) and DSS (Surface Scanner) |
| `Camera` | Vanity/free camera, store camera |
| `UI` | Universal panel navigation (UI Up/Down/Select etc.) |
| `Holo-Me` | Commander creator |
| `OnFoot` | Odyssey on-foot movement, combat, tools |

---

## Daedalus Architecture

### Service side
- WebSocket server in `main.js` dispatches `eventHandlers[name](message)`
- Handlers live in `src/service/lib/event-handlers/`
- Each handler class has `getHandlers()` returning `{ eventName: asyncFn }`
- Handlers are auto-registered via `_register` in `event-handlers.js`
- Runtime deps: `fs`, `path`, `os`, `glob` all available

### Client side
- Next.js pages under `src/client/pages/`
- React components under `src/client/components/`
- `sendEvent('eventName', payload)` → WebSocket → service handler → response
- Existing stub page: `src/client/pages/controls/keybinds.js`
- Nav item already wired: `ControlsPanelNavItems('Keybinds')` → `/controls/keybinds`

---

## Phase 1 — Table View (Current Work)

### Service events

**`getKeybindFiles`** — returns list of available `.binds` files + active preset:
```json
{
  "activePreset": "Keyboard",
  "files": [
    { "name": "Keyboard", "filename": "Keyboard.binds", "active": true },
    { "name": "My Custom Layout", "filename": "My Custom Layout.binds", "active": false }
  ]
}
```

**`getKeybinds({ preset })`** — parses the selected `.binds` file and returns structured bindings:
```json
{
  "presetName": "Keyboard",
  "bindings": {
    "YawLeftButton": {
      "primary": { "device": "Keyboard", "key": "Key_A", "display": "A" },
      "secondary": null,
      "modifier": { "device": "Keyboard", "key": "Key_LShift", "display": "L.Shift" },
      "binding": null
    }
  }
}
```

### Client page (`/controls/keybinds`)

- **Toolbar:** File selector dropdown + search input
- **Table columns:** Function Name | Group | Type | Primary Binding | Modifier | Secondary
- **Search:** Filters by function name, group, or key string
- Controls metadata (names, groups) stored in `src/client/lib/controls-data.js` (ported from `controlsData.py`)

### Files created

| File | Role |
|------|------|
| `src/service/lib/event-handlers/keybinds.js` | Service handler: parse `.binds` files |
| `src/client/lib/controls-data.js` | Static metadata: control name → human label + group |
| `src/client/css/panels/keybinds-panel.css` | Panel-specific styles (key badges, toolbar) |
| `src/client/pages/controls/keybinds.js` | Replaced page (was Coming Soon) |

---

## Phase 2 — Visual Reference (Future)

- Toggle between table view and visual device layout view
- Port device image templates from `bindingsData.py` to SVG/canvas  
- Annotate device images with bound actions (similar to edrefcard.info output)
- Support: keyboard, mouse, common HOTAS (Saitek X45/X52/X56, Virpil, VKB, etc.)
- Phase 2 is **out of scope** for the current work session

---

## Notes

- Default presets ship in a `Defaults 4.0a\` subdirectory — excluded from file listing (only top-level `.binds` files are shown)
- `xml2js` is in devDependencies and available at both dev and packaged runtime — but a custom lightweight parser was written instead to avoid the dependency
- The `.binds` XML is only 2 levels deep (Root → ControlKey → self-closing children), making a simple line-based parser sufficient
