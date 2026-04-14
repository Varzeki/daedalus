import { useRouter } from 'next/router'
import { useEffect } from 'react'

const NAV_BUTTONS = [
  { name: 'Commander', abbr: 'Cmdr', path: '/cmdr' },
  { name: 'Ship', abbr: 'Ship', path: '/ship' },
  { name: 'Navigation', abbr: 'Nav', path: '/nav' },
  { name: 'Exploration', abbr: 'Expl', path: '/exploration' },
  { name: 'Trade', abbr: 'Trade', path: '/trade' },
  { name: 'Mining', abbr: 'Mine', path: '/mining' },
  { name: 'Missions', abbr: 'Msns', path: '/missions' },
  { name: 'Engineering', abbr: 'Eng', path: '/eng' },
  { name: 'Media', abbr: 'Media', path: '/media' },
  { name: 'Controls', abbr: 'Ctrl', path: '/controls' }
]

const TAB_MEMORY_PREFIX = 'daedalus:lastPage:'

export default function PrimaryNavigation () {
  const router = useRouter()
  const currentPath = `/${router.pathname.split('/')[1].toLowerCase()}`

  // Remember the current sub-page for this tab
  useEffect(() => {
    if (router.pathname && router.pathname !== currentPath) {
      sessionStorage.setItem(TAB_MEMORY_PREFIX + currentPath, router.pathname)
    }
  }, [router.pathname])

  function navigateToTab (tabPath) {
    const lastPage = sessionStorage.getItem(TAB_MEMORY_PREFIX + tabPath)
    router.push(lastPage || tabPath)
  }

  return (
    <div id='primaryNavigation' className='button-group'>
      {NAV_BUTTONS.map((button, i) =>
        <button
          key={button.name}
          data-primary-navigation={i + 1}
          tabIndex='1'
          disabled={button.path === currentPath}
          className={button.path === currentPath ? 'button--active' : ''}
          onClick={() => navigateToTab(button.path)}
        >
          <span className='visible-small'>{button.abbr}</span>
          <span className='hidden-small'>{button.name}</span>
        </button>
      )}
    </div>
  )
}
