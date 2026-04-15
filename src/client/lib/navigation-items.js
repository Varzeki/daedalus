function ShipPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Status',
      icon: 'ship',
      url: '/ship/status'
    },
    {
      name: 'Modules',
      icon: 'wrench',
      url: '/ship/modules'
    },
    {
      name: 'Cargo',
      icon: 'cargo',
      url: '/ship/cargo'
    },
    {
      name: 'Inventory',
      icon: 'inventory',
      url: '/ship/inventory'
    },
    {
      name: 'Stats',
      icon: 'info',
      url: '/ship/stats'
    },
    {
      name: 'Carrier',
      icon: 'fleet-carrier',
      url: '/ship/carrier'
    },
    {
      name: 'Fleet',
      icon: 'ship',
      url: '/ship/fleet'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function NavPanelNavItems (activePanel, query) {
  const navigationItems = [
    {
      name: 'Search',
      icon: 'search',
      type: 'SEARCH'
    },
    {
      name: 'Map',
      icon: 'system-bodies',
      url: {
        pathname: '/nav/map',
        query
      }
    },
    {
      name: 'List',
      icon: 'table-inspector',
      url: {
        pathname: '/nav/list',
        query
      }
    },
    {
      name: 'Route',
      icon: 'route',
      url: {
        pathname: '/nav/route',
        query
      }
    },
    {
      name: 'Neutron Plotter',
      icon: 'route',
      url: {
        pathname: '/nav/neutron-plotter',
        query
      }
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function EngineeringPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Blueprints',
      icon: 'engineering',
      url: '/eng/blueprints'
    },
    {
      name: 'Engineers',
      icon: 'engineer',
      url: '/eng/engineers'
    },
    {
      name: 'Raw Materials',
      icon: 'materials-raw',
      url: '/eng/raw-materials'
    },
    {
      name: 'Manufactured Materials',
      icon: 'materials-manufactured',
      url: '/eng/manufactured-materials'
    },
    {
      name: 'Encoded Materials',
      icon: 'materials-encoded',
      url: '/eng/encoded-materials'
    },
    {
      name: 'Xeno Materials',
      icon: 'materials-xeno',
      url: '/eng/xeno-materials'
    },
    {
      name: 'Wishlist',
      icon: 'poi',
      url: '/eng/wishlist'
    },
    {
      name: 'Material Planner',
      icon: 'route',
      url: '/eng/material-planner'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function ExplorationPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Route',
      icon: 'route',
      url: '/exploration/route'
    },
    {
      name: 'System',
      icon: 'system-orbits',
      url: '/exploration/system'
    },
    {
      name: 'Biologicals',
      icon: 'plant',
      url: '/exploration/biologicals'
    },
    {
      name: 'Inventory',
      icon: 'inventory',
      url: '/exploration/inventory'
    },
    {
      name: 'Log',
      icon: 'table-inspector',
      url: '/exploration/log'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function SettingsNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Theme',
      icon: 'color-picker'
    },
    {
      name: 'Sounds',
      icon: 'sound'
    },
    {
      name: 'Exploration',
      icon: 'scan'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function TradePanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Routes',
      icon: 'route',
      url: '/trade/routes'
    },
    {
      name: 'Commodities',
      icon: 'cargo',
      url: '/trade/commodities'
    },
    {
      name: 'PTN',
      icon: 'fleet-carrier',
      url: '/trade/ptn'
    },
    {
      name: 'FCOC',
      icon: 'fleet-carrier',
      url: '/trade/fcoc'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function CmdrPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Overview',
      icon: 'shield',
      url: '/cmdr/overview'
    },
    {
      name: 'Session',
      icon: 'trending-up-chart',
      url: '/cmdr/session'
    },
    {
      name: 'Community Goals',
      icon: 'poi',
      url: '/cmdr/community-goals'
    },
    {
      name: 'Wing & Crew',
      icon: 'credits',
      url: '/cmdr/wing'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function MissionsPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Missions',
      icon: 'poi',
      url: '/missions/overview'
    },
    {
      name: 'Powerplay',
      icon: 'power',
      url: '/missions/powerplay'
    },
    {
      name: 'Local Activity',
      icon: 'poi',
      url: '/missions/local-activity'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function MiningPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Status',
      icon: 'asteroid-base',
      url: '/mining/status'
    },
    {
      name: 'Log',
      icon: 'table-inspector',
      url: '/mining/log'
    },
    {
      name: 'Statistics',
      icon: 'trending-up-chart',
      url: '/mining/statistics'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function ControlsPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'Keybinds',
      icon: 'cogs',
      url: '/controls/keybinds'
    },
    {
      name: 'Button Pane',
      icon: 'settings',
      url: '/controls/button-pane'
    },
    {
      name: 'Log',
      icon: 'table-inspector',
      url: '/controls/log'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

function MediaPanelNavItems (activePanel) {
  const navigationItems = [
    {
      name: 'GalNet',
      icon: 'info',
      url: '/media/galnet'
    },
    {
      name: 'Video & Music',
      icon: 'sound',
      url: '/media/video'
    }
  ]
  navigationItems.forEach(item => {
    if (item.name.toLowerCase() === activePanel.toLowerCase()) item.active = true
  })
  return navigationItems
}

module.exports = {
  ShipPanelNavItems,
  NavPanelNavItems,
  ExplorationPanelNavItems,
  EngineeringPanelNavItems,
  SettingsNavItems,
  TradePanelNavItems,
  CmdrPanelNavItems,
  MissionsPanelNavItems,
  MiningPanelNavItems,
  ControlsPanelNavItems,
  MediaPanelNavItems
}
