/**
 * ModuleEngineeringCard — one card per engineerable ship module.
 *
 * Displays the current engineering state and lets the player pick a target
 * modification + grade + optional experimental-effect note.
 *
 * Props:
 *   module      {object}    — ship module from getShipStatus().modules
 *   blueprints  {Array}     — full getBlueprints() result (pre-filtered to applicable ones)
 *   goal        {object|null} — { blueprintSymbol, targetGrade, experimentalEffect }
 *   onChange    {Function}  — (newGoal) => void  — null goal clears the slot
 */
import { useMemo } from 'react'
import { getModuleExperimentals } from '../../../../service/data/engineering-experimentals.js'

// ── Grade summary helper ──────────────────────────────────────────────────────

function gradeSummary (module, goal) {
  if (!goal?.blueprintSymbol || !goal?.targetGrade) return null
  const isSameBp = module.engineering && module.engineering.symbol === goal.blueprintSymbol
  const startGrade = isSameBp ? Math.max(1, (module.engineering.level ?? 0) + 1) : 1
  const endGrade = goal.targetGrade
  if (startGrade > endGrade) {
    // Already at or past target grade for the same blueprint
    return { text: 'Already complete', complete: true, count: 0 }
  }
  const count = endGrade - startGrade + 1
  const range = startGrade === endGrade ? `G${startGrade}` : `G${startGrade}–G${endGrade}`
  return { text: `Adding ${range}`, count, complete: false }
}

// ── Card ─────────────────────────────────────────────────────────────────────

export default function ModuleEngineeringCard ({ module, blueprints, goal, onChange }) {
  const selectedBp = useMemo(
    () => goal?.blueprintSymbol ? blueprints.find(bp => bp.symbol === goal.blueprintSymbol) ?? null : null,
    [goal?.blueprintSymbol, blueprints]
  )

  const experimentals = useMemo(
    () => getModuleExperimentals(module.symbol),
    [module.symbol]
  )

  const currentEng = module.engineering
  const currentBpSymbol = currentEng?.symbol ?? null
  const currentGrade = currentEng?.level ?? 0

  const summary = gradeSummary(module, goal)

  function handleBpChange (e) {
    const sym = e.target.value || null
    onChange(sym ? { ...goal, blueprintSymbol: sym, targetGrade: null } : null)
  }

  function handleGradeClick (grade) {
    if (!goal?.blueprintSymbol) return
    // Clicking the already-selected grade deselects (sets target to null — clear)
    if (goal.targetGrade === grade && !(currentBpSymbol === goal.blueprintSymbol && grade <= currentGrade)) {
      onChange({ ...goal, targetGrade: null })
    } else {
      onChange({ ...goal, targetGrade: grade })
    }
  }

  function handleExperimentalChange (e) {
    onChange({ ...goal, experimentalEffect: e.target.value })
  }

  // Determine which grades are "done" for the current blueprint selection
  function isGradeDone (grade) {
    return !!(currentEng && currentBpSymbol === selectedBp?.symbol && grade <= currentGrade)
  }

  const isComplete = summary?.complete

  return (
    <div
      style={{
        border: `1px solid ${isComplete ? 'var(--color-success)' : goal?.targetGrade ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '4px',
        padding: '.85rem 1rem',
        background: 'var(--color-background-panel, #0a0f14)',
        display: 'flex',
        flexDirection: 'column',
        gap: '.65rem'
      }}
    >
      {/* Module header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem' }}>{module.name}</h4>
          <span className='text-muted' style={{ fontSize: '.85rem' }}>{module.slotName}</span>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {currentEng
            ? (
              <span style={{ fontSize: '.85rem' }}>
                <span className='text-primary text-uppercase' style={{ fontSize: '.78rem', border: '1px solid var(--color-primary)', padding: '.1rem .35rem', borderRadius: '2px', marginRight: '.4rem' }}>
                  G{currentGrade}
                </span>
                <span className='text-primary'>{currentEng.name}</span>
                {currentEng.experimentalEffect &&
                  <span className='text-muted' style={{ marginLeft: '.35rem' }}>· {currentEng.experimentalEffect}</span>}
              </span>
              )
            : <span className='text-muted' style={{ fontSize: '.85rem' }}>Stock</span>}
        </div>
      </div>

      {/* Target modification dropdown */}
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <label className='text-muted text-uppercase' style={{ display: 'block', fontSize: '.78rem', marginBottom: '.25rem' }}>
            Target Modification
          </label>
          <select
            className='input'
            style={{ width: '100%', fontSize: '.9rem' }}
            value={goal?.blueprintSymbol ?? ''}
            onChange={handleBpChange}
          >
            <option value=''>— No target —</option>
            {blueprints.map(bp => (
              <option key={bp.symbol} value={bp.symbol}>{bp.name}</option>
            ))}
          </select>
        </div>

        {/* Grade selector — only shows once a blueprint is selected */}
        {selectedBp && (
          <div>
            <label className='text-muted text-uppercase' style={{ display: 'block', fontSize: '.78rem', marginBottom: '.25rem' }}>
              Target Grade
            </label>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {selectedBp.grades.map(g => {
                const done = isGradeDone(g.grade)
                const selected = goal?.targetGrade === g.grade
                const isSameBpSwitch = currentBpSymbol !== selectedBp.symbol
                // If switching blueprint, all grades are available to target
                const baseTarget = isSameBpSwitch ? false : done
                return (
                  <button
                    key={g.grade}
                    onClick={() => handleGradeClick(g.grade)}
                    title={baseTarget ? 'Already completed' : `Set G${g.grade} as target`}
                    style={{
                      padding: '.25rem .6rem',
                      cursor: baseTarget ? 'default' : 'pointer',
                      border: '1px solid var(--color-primary)',
                      background: selected
                        ? 'var(--color-primary)'
                        : baseTarget
                          ? 'rgba(255,255,255,0.06)'
                          : 'transparent',
                      color: selected
                        ? 'var(--color-background, #000)'
                        : baseTarget
                          ? 'rgba(255,255,255,0.3)'
                          : 'inherit',
                      borderRadius: '2px',
                      fontSize: '.9rem',
                      fontWeight: selected ? 700 : 'normal',
                      opacity: baseTarget ? 0.4 : 1
                    }}
                  >
                    G{g.grade}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Experimental effect — shows when blueprint is selected and experimentals exist */}
      {goal?.blueprintSymbol && experimentals.length > 0 && (
        <div>
          <label className='text-muted text-uppercase' style={{ display: 'block', fontSize: '.78rem', marginBottom: '.25rem' }}>
            Experimental Effect
          </label>
          <select
            className='input'
            style={{ width: '100%', fontSize: '.9rem' }}
            value={goal?.experimentalEffect ?? ''}
            onChange={handleExperimentalChange}
          >
            <option value=''>— None —</option>
            {experimentals.map(e => (
              <option key={e.key} value={e.name}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Summary line */}
      {summary && (
        <div style={{ fontSize: '.85rem', paddingTop: '.1rem' }}>
          {summary.complete
            ? <span className='text-success'>✓ Blueprint complete — nothing to add</span>
            : <span className='text-primary'>{summary.text} ({summary.count} run{summary.count !== 1 ? 's' : ''})</span>}
        </div>
      )}
    </div>
  )
}
