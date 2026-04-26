/**
 * WishlistItem — single row in the wishlist table.
 *
 * Props:
 *   item      {object}   — wishlist item from localStorage
 *   shortfall {number}   — count of distinct materials short for this specific item
 *                          (computed by computeItemShortfall in the parent page)
 *   onRemove  {Function} — (id) => void
 *   onUpdate  {Function} — (id, changes) => void
 */

function StatusBadge ({ shortfall }) {
  if (shortfall === 0) {
    return (
      <span className='text-success text-uppercase' style={{ fontSize: '.85rem' }}>
        <i className='icon daedalus-terminal-engineering' style={{ marginRight: '.3rem', position: 'relative', top: '.1rem' }} />
        Ready
      </span>
    )
  }
  return (
    <span className='text-warning text-uppercase' style={{ fontSize: '.85rem' }}>
      {shortfall} short
    </span>
  )
}

export default function WishlistItem ({ item, shortfall, onRemove, onUpdate }) {
  return (
    <tr className={shortfall === 0 ? 'text-secondary' : ''}>
      <td>
        <h4 style={{ margin: 0 }}>{item.blueprintName}</h4>
      </td>
      <td className='text-center' style={{ width: '5rem' }}>
        <span
          className='text-primary text-uppercase'
          style={{
            fontSize: '.85rem',
            border: '1px solid var(--color-primary)',
            padding: '.1rem .4rem',
            borderRadius: '2px'
          }}
        >
          G{item.grade}
        </span>
      </td>
      <td className='text-center' style={{ width: '8rem' }}>
        <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center', justifyContent: 'center' }}>
          <button
            className='button'
            style={{ minWidth: '1.75rem', padding: '.1rem .4rem', fontSize: '.85rem' }}
            onClick={() => onUpdate(item.id, { quantity: Math.max(1, (item.quantity ?? 1) - 1) })}
          >
            −
          </button>
          <span style={{ minWidth: '1.5rem', textAlign: 'center' }}>{item.quantity ?? 1}</span>
          <button
            className='button'
            style={{ minWidth: '1.75rem', padding: '.1rem .4rem', fontSize: '.85rem' }}
            onClick={() => onUpdate(item.id, { quantity: Math.min(20, (item.quantity ?? 1) + 1) })}
          >
            +
          </button>
        </div>
      </td>
      <td style={{ width: '10rem' }}>
        <StatusBadge shortfall={shortfall} />
      </td>
      <td className='text-right' style={{ width: '2rem' }}>
        <button
          className='button text-danger'
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', padding: '.1rem .3rem' }}
          title='Remove from wishlist'
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.blueprintName} G${item.grade} from wishlist`}
        >
          ×
        </button>
      </td>
    </tr>
  )
}
