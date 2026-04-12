export default function ComingSoonPanel ({ title, description, features = [] }) {
  return (
    <div className='text-center' style={{ padding: '4rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 className='text-primary' style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
        {title}
      </h2>
      <p className='text-muted' style={{ fontSize: '1.1rem', marginBottom: '2rem' }}>
        Coming Soon
      </p>
      {description && (
        <p style={{ marginBottom: '2rem', lineHeight: '1.6' }}>
          {description}
        </p>
      )}
      {features.length > 0 && (
        <div style={{ textAlign: 'left', margin: '0 auto', maxWidth: '500px' }}>
          <h4 className='text-primary' style={{ marginBottom: '0.75rem' }}>Planned Features</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0' }}>
            {features.map((feature, i) => (
              <li key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className='text-muted' style={{ marginRight: '0.5rem' }}>›</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}
      <hr style={{ margin: '2rem 0', opacity: 0.2 }} />
      <p className='text-muted' style={{ fontSize: '0.9rem' }}>
        Feedback or ideas for this upcoming feature can be submitted at{' '}
        <a
          href='https://github.com/Varzeki/daedalus/issues'
          target='_blank'
          rel='noopener noreferrer'
          className='text-info'
          style={{ textDecoration: 'underline' }}
        >
          github.com/Varzeki/daedalus
        </a>
      </p>
    </div>
  )
}
