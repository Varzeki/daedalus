
export default function MainLayout ({ children, visible = true }) {
  return (
    <div className='layout__main' style={{ opacity: visible ? 1 : 0 }}>
      {children}
    </div>
  )
}
