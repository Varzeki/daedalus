/**
 * BlueprintPicker — inline search and grade/quantity selector for adding
 * a blueprint to the wishlist.
 *
 * Props:
 *   blueprints  {Array}    — result of getBlueprints()
 *   onAdd       {Function} — called with a wishlist item object on confirm
 */
import { useState, useMemo } from 'react'

export default function BlueprintPicker ({ blueprints, onAdd }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [grade, setGrade] = useState(null)
  const [quantity, setQuantity] = useState(1)

  const filtered = useMemo(() => {
    if (!blueprints?.length) return []
    const q = search.trim().toLowerCase()
    if (!q) return blueprints.slice(0, 20)
    return blueprints.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.originalName ?? '').toLowerCase().includes(q) ||
      (b.modules ?? []).some(m => m.toLowerCase().includes(q))
    ).slice(0, 30)
  }, [blueprints, search])

  function handleBlueprintSelect (blueprint) {
    setSelected(blueprint)
    const firstGrade = blueprint.grades?.[0]?.grade ?? 1
    setGrade(firstGrade)
    setQuantity(1)
  }

  function handleConfirm () {
    if (!selected || grade == null) return
    onAdd({
      type: 'engineering',
      blueprintSymbol: selected.symbol,
      blueprintName: selected.name,
      grade,
      quantity
    })
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-primary)',
        borderRadius: '2px',
        padding: '1rem',
        marginBottom: '1.5rem',
        background: 'var(--color-background-panel, #0a0f14)'
      }}
    >
      <h4 style={{ marginTop: 0, marginBottom: '.75rem' }}>Add Blueprint</h4>

      {/* Blueprint search */}
      {!selected &&
        <>
          <input
            autoFocus
            type='text'
            className='input'
            placeholder='Search blueprints…'
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: '.75rem' }}
          />
          <table className='table--interactive' style={{ marginBottom: 0 }}>
            <tbody>
              {filtered.map(bp =>
                <tr
                  key={bp.symbol}
                  className='table__row--highlight-primary-hover'
                  tabIndex={0}
                  onClick={() => handleBlueprintSelect(bp)}
                  onKeyDown={e => e.key === 'Enter' && handleBlueprintSelect(bp)}
                >
                  <td style={{ width: '1rem' }} className='text-center'>
                    <i className='icon daedalus-terminal-wrench' style={{ position: 'relative', top: '.1rem' }} />
                  </td>
                  <td>
                    <h4 style={{ margin: 0 }}>{bp.name}</h4>
                    <span className='text-muted' style={{ fontSize: '.9rem' }}>{bp.originalName}</span>
                  </td>
                  <td className='text-right text-muted' style={{ fontSize: '.9rem' }}>
                    {(bp.modules ?? []).join(', ')}
                  </td>
                </tr>
              )}
              {filtered.length === 0 &&
                <tr><td colSpan={3} className='text-muted'>No blueprints match your search.</td></tr>}
            </tbody>
          </table>
        </>}

      {/* Grade / quantity selector */}
      {selected &&
        <>
          <p style={{ marginTop: 0, marginBottom: '.75rem' }}>
            <button
              className='text-link text-uppercase'
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setSelected(null)}
            >
              <i className='icon daedalus-terminal-chevron-right' style={{ transform: 'rotate(180deg)', display: 'inline-block', marginRight: '.3rem' }} />
              Back
            </button>
            <span style={{ marginLeft: '.5rem' }}>
              <strong>{selected.name}</strong>
              <span className='text-muted' style={{ marginLeft: '.5rem' }}>{selected.originalName}</span>
            </span>
          </p>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className='text-muted text-uppercase' style={{ display: 'block', fontSize: '.85rem', marginBottom: '.3rem' }}>
                Grade
              </label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {selected.grades.map(g =>
                  <button
                    key={g.grade}
                    onClick={() => setGrade(g.grade)}
                    style={{
                      padding: '.3rem .75rem',
                      cursor: 'pointer',
                      border: '1px solid var(--color-primary)',
                      background: grade === g.grade ? 'var(--color-primary)' : 'transparent',
                      color: grade === g.grade ? 'var(--color-background, #000)' : 'inherit',
                      borderRadius: '2px',
                      fontSize: '1rem'
                    }}
                  >
                    G{g.grade}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className='text-muted text-uppercase' style={{ display: 'block', fontSize: '.85rem', marginBottom: '.3rem' }}>
                Quantity
              </label>
              <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center' }}>
                <button
                  className='button'
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  style={{ minWidth: '2rem', padding: '.2rem .5rem' }}
                >−</button>
                <span style={{ minWidth: '2rem', textAlign: 'center' }}>{quantity}</span>
                <button
                  className='button'
                  onClick={() => setQuantity(q => Math.min(20, q + 1))}
                  style={{ minWidth: '2rem', padding: '.2rem .5rem' }}
                >+</button>
              </div>
            </div>

            <button
              className='button button--primary'
              onClick={handleConfirm}
              disabled={grade == null}
            >
              Add to wishlist
            </button>
          </div>
        </>}
    </div>
  )
}
