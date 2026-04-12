import { useRouter } from 'next/router'

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

export default function PrimaryNavigation () {
  const router = useRouter()
  const currentPath = `/${router.pathname.split('/')[1].toLowerCase()}`

  return (
    <div id='primaryNavigation' className='button-group'>
      {NAV_BUTTONS.map((button, i) =>
        <button
          key={button.name}
          data-primary-navigation={i + 1}
          tabIndex='1'
          disabled={button.path === currentPath}
          className={button.path === currentPath ? 'button--active' : ''}
          onClick={() => router.push(button.path)}
          style={{ fontSize: '1.5rem' }}
        >
          <span className='visible-small'>{button.abbr}</span>
          <span className='hidden-small'>{button.name}</span>
        </button>
      )}
    </div>
  )
}
