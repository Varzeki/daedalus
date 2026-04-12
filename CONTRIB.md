# Contributor Guidelines

This software is in early access. All releases are pre-releases and contain known defects.

You are free to fork this codebase and use it to make your own app. See [LICENSE](LICENSE) for details.

## Adding a New Tab

Each top-level tab (Commander, Ship, Navigation, etc.) follows a consistent pattern across four files.

### 1. Register the tab in the header

Add an entry to `NAV_BUTTONS` in `src/client/components/header.js`:

```js
{
  name: 'MyTab',      // Full display name
  abbr: 'MyTab',      // Short name for narrow viewports
  path: '/mytab'      // Route prefix
}
```

### 2. Create navigation items

Add a function to `src/client/lib/navigation-items.js`:

```js
function MyTabPanelNavItems (activePanel) {
  const navigationItems = [
    { name: 'Overview', icon: 'icon-name', url: '/mytab/overview' },
    { name: 'Details',  icon: 'icon-name', url: '/mytab/details' }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}
```

Export it alongside the other nav item functions.

### 3. Create the index redirect

Create `src/client/pages/mytab/index.js` to redirect the tab root to the default sub-page:

```js
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function MyTabIndex () {
  const router = useRouter()
  useEffect(() => { router.replace('/mytab/overview') }, [])
  return null
}
```

### 4. Create sub-pages

Each sub-page follows this structure (`src/client/pages/mytab/overview.js`):

```js
import { useSocket } from 'lib/socket'
import Layout from 'components/layout'
import Panel from 'components/panel'
import { MyTabPanelNavItems } from 'lib/navigation-items'

export default function MyTabOverviewPage () {
  const { connected, active, ready } = useSocket()

  return (
    <Layout connected={connected} active={active} ready={ready}>
      <Panel layout='full-width' scrollable navigation={MyTabPanelNavItems('Overview')}>
        {/* Page content */}
      </Panel>
    </Layout>
  )
}
```

### 5. Add a service event handler (if needed)

If the tab needs backend data, create a handler class in `src/service/lib/event-handlers/`:

```js
class MyHandler {
  constructor ({ eliteLog, eliteJson }) {
    this.eliteLog = eliteLog
    this.eliteJson = eliteJson
  }

  async getMyData (args) {
    // Handler logic
  }

  getHandlers () {
    return {
      getMyData: (args) => this.getMyData(args)
    }
  }
}

module.exports = MyHandler
```

Then register it in the `EventHandlers` constructor (`src/service/lib/event-handlers.js`):

```js
this.myHandler = this._register(new MyHandler({ eliteLog, eliteJson }))
```

The `_register` call auto-wires `getHandlers()` into the event system. Call from the client with `sendEvent('getMyData', args)`.