import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { hasCustomChrome, isWindowFullScreen, isWindowMaximized, toggleMaximize, minimizeWindow, closeWindow, startWindowDrag } from 'lib/window'

const TITLE_BAR_HEIGHT = '2.5rem'
const LAUNCHER_PATHS = ['/launcher']

export default function WindowTitleBar () {
  const router = useRouter()
  const [isNative, setIsNative] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const isLauncher = LAUNCHER_PATHS.includes(router.pathname)

  useEffect(() => {
    const native = hasCustomChrome()
    setIsNative(native)
    if (native) {
      document.documentElement.classList.add('custom-chrome')
      document.documentElement.style.setProperty('--window-chrome-offset', TITLE_BAR_HEIGHT)
      ;(async () => {
        const fs = await isWindowFullScreen()
        if (fs) setIsFullScreen(true)
        const mx = await isWindowMaximized()
        if (mx) setIsMaximized(true)
      })()
    }
    return () => {
      document.documentElement.classList.remove('custom-chrome')
      document.documentElement.style.setProperty('--window-chrome-offset', '0px')
    }
  }, [])

  // Sync fullscreen state when toggled from elsewhere (e.g. header toolbar)
  useEffect(() => {
    const handler = (e) => {
      setIsFullScreen(e.detail)
    }
    window.addEventListener('daedalus-fullscreen-change', handler)
    return () => window.removeEventListener('daedalus-fullscreen-change', handler)
  }, [])

  // Sync maximize state
  useEffect(() => {
    const handler = (e) => {
      setIsMaximized(e.detail)
    }
    window.addEventListener('daedalus-maximize-change', handler)
    return () => window.removeEventListener('daedalus-maximize-change', handler)
  }, [])

  // Update CSS offset when fullscreen changes — title bar hides in fullscreen
  useEffect(() => {
    if (!isNative) return
    if (isFullScreen) {
      document.documentElement.classList.remove('custom-chrome')
      document.documentElement.style.setProperty('--window-chrome-offset', '0px')
    } else {
      document.documentElement.classList.add('custom-chrome')
      document.documentElement.style.setProperty('--window-chrome-offset', TITLE_BAR_HEIGHT)
    }
  }, [isNative, isFullScreen])

  if (!isNative || isFullScreen) return null

  const showFrame = !isMaximized

  async function handleMaximize () {
    if (isLauncher) return
    const mx = await toggleMaximize()
    setIsMaximized(mx)
  }

  function handleDrag (e) {
    if (e.button !== 0) return
    if (e.target.closest('button')) return
    e.preventDefault()
    startWindowDrag()
  }

  return (
    <>
      <div className='window-title-bar' onMouseDown={handleDrag}>
        <div className='window-title-bar__title'>
          <span>DAEDALUS Terminal</span>
        </div>
        <div className='window-title-bar__controls'>
          <button onClick={() => minimizeWindow()} className='window-title-bar__button' aria-label='Minimize'>
            <svg width='14' height='14' viewBox='0 0 12 12'>
              <line x1='1' y1='6' x2='11' y2='6' stroke='currentColor' strokeWidth='1.5' />
            </svg>
          </button>
          <button onClick={handleMaximize} className='window-title-bar__button' aria-label={isMaximized ? 'Restore' : 'Maximize'} disabled={isLauncher}>
            <svg width='14' height='14' viewBox='0 0 12 12'>
              {isMaximized
                ? <>
                    <rect x='3' y='0.5' width='8' height='8' fill='none' stroke='currentColor' strokeWidth='1.2' />
                    <rect x='0.5' y='3' width='8' height='8' fill='#000' stroke='currentColor' strokeWidth='1.2' />
                  </>
                : <rect x='1.5' y='1.5' width='9' height='9' fill='none' stroke='currentColor' strokeWidth='1.2' />
              }
            </svg>
          </button>
          <button onClick={() => closeWindow()} className='window-title-bar__button window-title-bar__button--close' aria-label='Close'>
            <svg width='14' height='14' viewBox='0 0 12 12'>
              <line x1='2' y1='2' x2='10' y2='10' stroke='currentColor' strokeWidth='1.5' />
              <line x1='10' y1='2' x2='2' y2='10' stroke='currentColor' strokeWidth='1.5' />
            </svg>
          </button>
        </div>
      </div>
      {showFrame && <div className='window-frame-border' />}
    </>
  )
}
