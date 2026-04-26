/**
 * MaterialRequirement — single row in the aggregate material requirements table.
 * Shows a progress bar, owned/required counts, and up to 4 trade suggestions.
 *
 * Props:
 *   requirement  {object}  — { symbol, name, type, category, grade, required, owned,
 *                             shortfall, maxCount, trades?, fullyResolved?, stillNeeded? }
 *   shortfallMap {object}  — symbol → { required } for all materials (reserved-quantity reference)
 */
import { useState } from 'react'

const TRADE_TYPE_LABELS = {
  DOWNTRADE: 'same category',
  CROSS_DOWNTRADE: 'cross category',
  UPTRADE: 'same category ↑',
  CROSS_UPTRADE: 'cross category ↑'
}

function TradeSuggestions ({ trades, fullyResolved, stillNeeded }) {
  const [expanded, setExpanded] = useState(false)

  if (!trades?.length) {
    return (
      <p className='text-muted' style={{ margin: '.25rem 0 0', fontSize: '.85rem' }}>
        No trade suggestions — collect directly.
      </p>
    )
  }

  const visible = expanded ? trades : trades.slice(0, 2)
  const hasMore = trades.length > 2

  return (
    <div style={{ marginTop: '.25rem' }}>
      {visible.map((trade, i) =>
        <div
          key={`trade_${trade.from.symbol}_${i}`}
          className='text-primary'
          style={{ fontSize: '.85rem', lineHeight: '1.5' }}
        >
          <i className='icon daedalus-terminal-engineering' style={{ marginRight: '.3rem', fontSize: '.9rem', position: 'relative', top: '.1rem' }} />
          Trade {trade.give.toLocaleString()}×{' '}
          <strong>{trade.from.name}</strong>
          {' '}(G{trade.from.grade})
          {' → '}
          receive {trade.receive.toLocaleString()}×
          {trade.tradeType && (
            <span className='text-muted' style={{ marginLeft: '.3rem' }}>
              [{TRADE_TYPE_LABELS[trade.tradeType] ?? trade.tradeType}]
            </span>
          )}
        </div>
      )}
      {hasMore &&
        <button
          className='text-link text-uppercase'
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '.8rem', marginTop: '.2rem' }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Show fewer' : `Show ${trades.length - 2} more…`}
        </button>}
      {!fullyResolved && (stillNeeded ?? 0) > 0 &&
        <div className='text-warning' style={{ fontSize: '.85rem', marginTop: '.2rem' }}>
          Still need {stillNeeded.toLocaleString()}× from collection.
        </div>}
    </div>
  )
}

export default function MaterialRequirement ({ requirement, shortfallMap }) {
  const {
    name,
    type,
    category,
    grade,
    required,
    owned,
    shortfall,
    maxCount,
    trades,
    fullyResolved,
    stillNeeded
  } = requirement

  const hasShortfall = shortfall > 0
  const barValue = Math.min(owned, required)

  return (
    <tr className={hasShortfall ? '' : 'text-secondary'}>
      <td>
        {/* Name + type badge row */}
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.25rem' }}>
          <h4 style={{ margin: 0 }}>{name}</h4>
          <span className='text-muted' style={{ fontSize: '.85rem' }}>
            {type} · {category} · G{grade}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.2rem' }}>
          <div style={{ flex: '0 0 50%', maxWidth: '30rem' }}>
            <progress
              style={{ height: '1rem', width: '100%' }}
              value={barValue}
              max={required}
              className={!hasShortfall ? 'progress--secondary' : ''}
            />
          </div>
          <span className={hasShortfall ? 'text-warning' : ''} style={{ fontSize: '.9rem', whiteSpace: 'nowrap' }}>
            {owned.toLocaleString()}/{required.toLocaleString()}
            {hasShortfall && <span className='text-muted'> (need {shortfall.toLocaleString()} more)</span>}
          </span>
        </div>

        {/* Trade suggestions (only shown when there's a shortfall) */}
        {hasShortfall &&
          <TradeSuggestions
            trades={trades}
            fullyResolved={fullyResolved}
            stillNeeded={stillNeeded}
          />}
      </td>
      <td className='text-right' style={{ width: '3rem', verticalAlign: 'middle' }}>
        <i className={`icon daedalus-terminal-materials-grade-${grade}`} style={{ fontSize: '2.5rem' }} />
      </td>
    </tr>
  )
}
