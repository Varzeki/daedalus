import Loader from 'components/loader'

export default function Layout ({ children, connected = false, active = false, ready = true, loader = false, className = '' }) {
  return (
    <>
      <div className='layout'>
        <Loader visible={!connected || !ready || loader} />
        <div className={`layout__main ${className}`} style={{ opacity: connected && ready ? 1 : 0 }}>
          {children}
        </div>
      </div>
    </>
  )
}
