import { useEffect, useRef, useState } from 'react'

// Station types that use the dodecagonal starport layout (45 pads)
const STARPORT_TYPES = new Set([
  'coriolis', 'orbis', 'ocellus', 'asteroidbase', 'bernal', 'craterport', 'dodec'
])

// Station types that use the fleet carrier layout (16 pads)
const CARRIER_TYPES = new Set([
  'fleetcarrier'
])

// Station types that are Odyssey on-foot settlements
const SETTLEMENT_TYPES = new Set([
  'onfootsettlement'
])

// Settlement templates from SrvSurvey - pad positions per economy/subType
// Each pad has x, y offset from settlement center
const SETTLEMENT_TEMPLATES = {
  Agriculture: [
    { subType: 1, name: 'Picumnus', pads: [{ x: 149, y: -122 }, { x: -147, y: 52 }] },
    { subType: 2, name: 'Consus', pads: [{ x: -34, y: -47 }] },
    { subType: 3, name: 'Ceres', pads: [{ x: 28, y: -213 }, { x: -268, y: 160 }] },
    { subType: 4, name: 'Fornax', pads: [{ x: -180, y: 0 }, { x: 153, y: 105 }, { x: -4, y: -153 }] },
    { subType: 5, name: 'Annona', pads: [{ x: 73, y: -31 }] }
  ],
  Military: [
    { subType: 1, name: 'Ioke', pads: [{ x: 4, y: 162 }] },
    { subType: 2, name: 'Minerva', pads: [{ x: 2, y: 140 }, { x: 10, y: -115 }, { x: 2, y: 49 }] },
    { subType: 3, name: 'Polemos', pads: [{ x: 6, y: -203 }, { x: 9, y: 169 }] },
    { subType: 4, name: 'Bellona', pads: [{ x: -5, y: -37 }] },
    { subType: 5, name: 'Enyo', pads: [{ x: 46, y: -121 }, { x: -82, y: 106 }] }
  ],
  Extraction: [
    { subType: 1, name: 'Erebus', pads: [{ x: -159, y: -60 }, { x: 50, y: 51 }] },
    { subType: 2, name: 'Orcus', pads: [{ x: 118, y: 119 }, { x: -162, y: 98 }] },
    { subType: 3, name: 'Aerecura', pads: [{ x: 140, y: -53 }] },
    { subType: 4, name: 'Mantus', pads: [{ x: 72, y: -195 }] },
    { subType: 5, name: 'Ourea', pads: [{ x: -59, y: 3 }] }
  ],
  Industrial: [
    { subType: 1, name: 'Fontus', pads: [{ x: -48, y: -1 }] },
    { subType: 2, name: 'Minthe', pads: [{ x: 80, y: 13 }] },
    { subType: 3, name: 'Palici', pads: [{ x: 0, y: -73 }] },
    { subType: 4, name: 'Meteope', pads: [{ x: -131, y: -59 }, { x: 47, y: 87 }] },
    { subType: 5, name: 'Gaea', pads: [{ x: -139, y: -69 }] }
  ],
  HighTech: [
    { subType: 1, name: 'Chronos', pads: [{ x: -57, y: 158 }, { x: 22, y: -132 }] },
    { subType: 2, name: 'Pheobe', pads: [{ x: -114, y: -54 }] },
    { subType: 3, name: 'Asteria', pads: [{ x: 139, y: -3 }] },
    { subType: 4, name: 'Caerus', pads: [{ x: -1, y: -120 }, { x: -94, y: -88 }, { x: -150, y: -15 }] }
  ],
  Tourist: [
    { subType: 1, name: 'Fufluns', pads: [{ x: -45, y: 107 }, { x: 53, y: 118 }, { x: -81, y: -75 }, { x: 82, y: -81 }] },
    { subType: 2, name: 'Aergia', pads: [{ x: -28, y: -7 }] },
    { subType: 3, name: 'Comus', pads: [{ x: -40, y: -76 }, { x: -40, y: 54 }, { x: -189, y: 2 }] },
    { subType: 4, name: 'Gelos', pads: [{ x: -12, y: -114 }, { x: 115, y: 178 }] }
  ]
}

// ---- Starport geometry (dodecagonal, 45 pads in 3 shells x 12 sectors) ----

const ALPHA = Math.PI / 12 // 15 degrees
const SIN15 = Math.sin(ALPHA)
const COS15 = Math.cos(ALPHA)
const SIN45 = Math.SQRT2 / 2
const SIN60 = Math.sqrt(3) / 2

const DODECAGON = [
  [+COS15, -SIN15], [+SIN45, -SIN45], [+SIN15, -COS15],
  [-SIN15, -COS15], [-SIN45, -SIN45], [-COS15, -SIN15],
  [-COS15, +SIN15], [-SIN45, +SIN45], [-SIN15, +COS15],
  [+SIN15, +COS15], [+SIN45, +SIN45], [+COS15, +SIN15]
]

const SHELL_SCALE = [1, 0.625, 0.455, 0.25]

const PAD_SECTORS = [
  [0, +1], [-0.5, +SIN60], [-SIN60, +0.5],
  [-1, 0], [-SIN60, -0.5], [-0.5, -SIN60],
  [0, -1], [+0.5, -SIN60], [+SIN60, -0.5],
  [+1, 0], [+SIN60, +0.5], [+0.5, +SIN60]
]

// Maps pad index (0–14) within a 15-pad group to [sector_offset, shell_index]
const PAD_LIST = [
  [0, 0], [0, 0], [0, 2], [0, 2],
  [1, 0], [1, 0], [1, 1], [1, 2],
  [2, 0], [2, 2],
  [3, 0], [3, 0], [3, 1], [3, 2], [3, 2]
]

function getStarportPadCoords (padNumber) {
  // padNumber is 1-based
  const idx = padNumber - 1
  const [sectorOffset, shell] = PAD_LIST[idx % 15]
  const sector = sectorOffset + Math.floor(idx / 15) * 4
  return { sector: sector % 12, shell }
}

function drawStarport (ctx, cx, cy, radius, padNumber, colors) {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Draw dodecagonal shells
  for (let s = 0; s < SHELL_SCALE.length; s++) {
    const r = radius * SHELL_SCALE[s]
    ctx.beginPath()
    for (let i = 0; i <= DODECAGON.length; i++) {
      const [dx, dy] = DODECAGON[i % DODECAGON.length]
      const px = cx + dx * r
      const py = cy + dy * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = colors.station
    ctx.lineWidth = (s === 0 || s === SHELL_SCALE.length - 1) ? 2 : 1
    ctx.stroke()
  }

  // Draw sector lines (outer shell to inner shell)
  const outerR = radius * SHELL_SCALE[0]
  const innerR = radius * SHELL_SCALE[SHELL_SCALE.length - 1]
  for (let i = 0; i < DODECAGON.length; i++) {
    const [dx, dy] = DODECAGON[i]
    ctx.beginPath()
    ctx.moveTo(cx + dx * outerR, cy + dy * outerR)
    ctx.lineTo(cx + dx * innerR, cy + dy * innerR)
    ctx.strokeStyle = colors.station
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Draw entry slot (toaster)
  const slotWidth = radius * 0.75
  const slotHeight = radius * SHELL_SCALE[SHELL_SCALE.length - 1]
  ctx.beginPath()
  ctx.moveTo(cx, cy - slotHeight)
  ctx.lineTo(cx + slotWidth, cy - slotHeight)
  ctx.lineTo(cx + radius, cy - slotHeight + 6)
  ctx.lineTo(cx + radius, cy + slotHeight - 6)
  ctx.lineTo(cx + slotWidth, cy + slotHeight)
  ctx.lineTo(cx, cy + slotHeight)
  ctx.strokeStyle = colors.redSide
  ctx.lineWidth = 4
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy - slotHeight)
  ctx.lineTo(cx - slotWidth, cy - slotHeight)
  ctx.lineTo(cx - radius, cy - slotHeight + 6)
  ctx.lineTo(cx - radius, cy + slotHeight - 6)
  ctx.lineTo(cx - slotWidth, cy + slotHeight)
  ctx.lineTo(cx, cy + slotHeight)
  ctx.strokeStyle = colors.greenSide
  ctx.lineWidth = 4
  ctx.stroke()

  // Highlight assigned pad
  // Rotate pad position 180° (sector+6 mod 12) to match the entry slot color swap,
  // giving a full 180° rotation of the station view (matching LandingPad plugin methodology)
  if (padNumber >= 1 && padNumber <= 45) {
    const { sector: rawSector, shell } = getStarportPadCoords(padNumber)
    const sector = (rawSector + 6) % 12
    const [dx, dy] = PAD_SECTORS[sector]
    const midScale = (SHELL_SCALE[shell] + SHELL_SCALE[shell + 1]) / 2
    const rt = radius * COS15 * midScale
    const px = cx + rt * dx
    const py = cy + rt * dy
    const dotSize = radius * (SHELL_SCALE[0] - SHELL_SCALE[1]) / 4 * (3 - shell) / (4 - shell)

    ctx.beginPath()
    ctx.arc(px, py, dotSize, 0, Math.PI * 2)
    ctx.fillStyle = colors.pad
    ctx.fill()

    // Pad number label
    ctx.font = `bold ${Math.max(10, dotSize)}px monospace`
    ctx.fillStyle = colors.padLabel
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(padNumber), px, py)
  }
}

// ---- Fleet Carrier geometry (rectangular, 16 pads) ----

const FC_PADS = [
  // 8 large pads (index 0-7)
  { x: -12, y: 22, w: 10, h: 16 },
  { x: 2, y: 22, w: 10, h: 16 },
  { x: -12, y: 2, w: 10, h: 16 },
  { x: 2, y: 2, w: 10, h: 16 },
  { x: -12, y: -18, w: 10, h: 16 },
  { x: 2, y: -18, w: 10, h: 16 },
  { x: -12, y: -38, w: 10, h: 16 },
  { x: 2, y: -38, w: 10, h: 16 },
  // 4 medium pads (index 8-11)
  { x: -22, y: 25, w: 7, h: 11 },
  { x: -22, y: 10, w: 7, h: 11 },
  { x: 15, y: 25, w: 7, h: 11 },
  { x: 15, y: 10, w: 7, h: 11 },
  // 4 small pads (index 12-15)
  { x: -24, y: 0, w: 4, h: 6 },
  { x: 14, y: 0, w: 4, h: 6 },
  { x: 20, y: 0, w: 4, h: 6 },
  { x: -18, y: 0, w: 4, h: 6 }
]

const FC_BOX_W = 48
const FC_BOX_H = 76

function drawFleetCarrier (ctx, cx, cy, size, padNumber, colors) {
  const unit = size / FC_BOX_H

  // Draw all pads as rectangles
  for (let i = 0; i < FC_PADS.length; i++) {
    const p = FC_PADS[i]
    const x = cx + p.x * unit
    const y = cy + p.y * unit
    const w = p.w * unit
    const h = p.h * unit

    ctx.strokeStyle = colors.station
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)
  }

  // Highlight assigned pad
  if (padNumber >= 1 && padNumber <= 16) {
    const p = FC_PADS[padNumber - 1]
    const x = cx + p.x * unit
    const y = cy + p.y * unit
    const w = p.w * unit
    const h = p.h * unit

    ctx.fillStyle = colors.pad
    ctx.fillRect(x, y, w, h)

    ctx.font = `bold ${Math.max(10, Math.min(w, h) * 0.6)}px monospace`
    ctx.fillStyle = colors.padLabel
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(padNumber), x + w / 2, y + h / 2)
  }
}

// ---- Outpost layout (simple numbered docking pads) ----

function drawOutpost (ctx, cx, cy, size, padNumber, colors) {
  const padCount = Math.max(padNumber, 4)
  const padSize = size / (padCount + 1)

  for (let i = 0; i < padCount; i++) {
    const x = cx - (padCount * padSize) / 2 + i * padSize + padSize * 0.1
    const y = cy - padSize / 2
    const w = padSize * 0.8
    const h = padSize

    const isActive = (i + 1) === padNumber

    ctx.strokeStyle = colors.station
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)

    if (isActive) {
      ctx.fillStyle = colors.pad
      ctx.fillRect(x, y, w, h)
    }

    ctx.font = `bold ${Math.max(10, w * 0.5)}px monospace`
    ctx.fillStyle = isActive ? colors.padLabel : colors.station
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), x + w / 2, y + h / 2)
  }
}

// ---- Settlement layout (Odyssey on-foot settlements with real pad positions) ----

function findSettlementTemplate (economy, padNumber) {
  if (!economy) return null
  const templates = SETTLEMENT_TEMPLATES[economy]
  if (!templates) return null

  // Filter to templates that have enough pads for the assigned pad number
  const candidates = templates.filter(t => t.pads.length >= padNumber)
  if (candidates.length === 0) return templates[0]

  // Prefer the template whose total pad count matches padNumber exactly
  const exact = candidates.find(t => t.pads.length === padNumber)
  return exact || candidates[0]
}

function drawSettlement (ctx, cx, cy, size, padNumber, economy, colors) {
  const template = findSettlementTemplate(economy, padNumber)

  if (!template) {
    drawOutpost(ctx, cx, cy, size, padNumber, colors)
    return
  }

  const pads = template.pads

  // Calculate bounding box of pad positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pads) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  // Pad visual size (Large pads ~ 60m, add margin for the rectangle)
  const PAD_HALF = 40

  const spanX = (maxX - minX) + PAD_HALF * 4 || PAD_HALF * 4
  const spanY = (maxY - minY) + PAD_HALF * 4 || PAD_HALF * 4
  const scale = size * 0.8 / Math.max(spanX, spanY)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // Draw settlement perimeter circle
  const perimR = Math.max(spanX, spanY) * scale / 2 + 20
  ctx.beginPath()
  ctx.arc(cx, cy, perimR, 0, Math.PI * 2)
  ctx.strokeStyle = colors.station
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // Draw each pad
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i]
    const px = cx + (p.x - centerX) * scale
    const py = cy + (p.y - centerY) * scale
    const pw = PAD_HALF * 2 * scale
    const ph = PAD_HALF * 2.5 * scale

    const isActive = (i + 1) === padNumber

    ctx.strokeStyle = colors.station
    ctx.lineWidth = 1.5
    ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph)

    // Draw pad direction indicator (small triangle at top)
    ctx.beginPath()
    ctx.moveTo(px, py - ph / 2 - 4)
    ctx.lineTo(px - 6, py - ph / 2 + 4)
    ctx.lineTo(px + 6, py - ph / 2 + 4)
    ctx.closePath()
    ctx.fillStyle = colors.station
    ctx.fill()

    if (isActive) {
      ctx.fillStyle = colors.pad
      ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph)
    }

    const fontSize = Math.max(12, Math.min(pw, ph) * 0.4)
    ctx.font = `bold ${fontSize}px monospace`
    ctx.fillStyle = isActive ? colors.padLabel : colors.station
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), px, py)

    // Size label below pad number
    ctx.font = `${Math.max(9, fontSize * 0.6)}px monospace`
    ctx.fillStyle = isActive ? colors.padLabel : 'rgba(255, 147, 0, 0.4)'
    ctx.fillText('L', px, py + fontSize * 0.6)
  }

  // Show template name
  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(255, 147, 0, 0.35)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(template.name + ' — ' + economy, cx, cy + perimR + 16)
}

// ---- Step-based draw generators (stick-by-stick animation) ----

function getStarportSteps (ctx, cx, cy, radius, padNumber, colors) {
  const steps = []

  // Shell rings (4 steps)
  for (let s = 0; s < SHELL_SCALE.length; s++) {
    const si = s
    steps.push(() => {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      const r = radius * SHELL_SCALE[si]
      ctx.beginPath()
      for (let i = 0; i <= DODECAGON.length; i++) {
        const [dx, dy] = DODECAGON[i % DODECAGON.length]
        const px = cx + dx * r
        const py = cy + dy * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.strokeStyle = colors.station
      ctx.lineWidth = (si === 0 || si === SHELL_SCALE.length - 1) ? 2 : 1
      ctx.stroke()
    })
  }

  // Sector lines (12 steps)
  const outerR = radius * SHELL_SCALE[0]
  const innerR = radius * SHELL_SCALE[SHELL_SCALE.length - 1]
  for (let i = 0; i < DODECAGON.length; i++) {
    const li = i
    steps.push(() => {
      const [dx, dy] = DODECAGON[li]
      ctx.beginPath()
      ctx.moveTo(cx + dx * outerR, cy + dy * outerR)
      ctx.lineTo(cx + dx * innerR, cy + dy * innerR)
      ctx.strokeStyle = colors.station
      ctx.lineWidth = 2
      ctx.stroke()
    })
  }

  // Entry slot — red side
  const slotWidth = radius * 0.75
  const slotHeight = radius * SHELL_SCALE[SHELL_SCALE.length - 1]
  steps.push(() => {
    ctx.beginPath()
    ctx.moveTo(cx, cy - slotHeight)
    ctx.lineTo(cx + slotWidth, cy - slotHeight)
    ctx.lineTo(cx + radius, cy - slotHeight + 6)
    ctx.lineTo(cx + radius, cy + slotHeight - 6)
    ctx.lineTo(cx + slotWidth, cy + slotHeight)
    ctx.lineTo(cx, cy + slotHeight)
    ctx.strokeStyle = colors.redSide
    ctx.lineWidth = 4
    ctx.stroke()
  })

  // Entry slot — green side
  steps.push(() => {
    ctx.beginPath()
    ctx.moveTo(cx, cy - slotHeight)
    ctx.lineTo(cx - slotWidth, cy - slotHeight)
    ctx.lineTo(cx - radius, cy - slotHeight + 6)
    ctx.lineTo(cx - radius, cy + slotHeight - 6)
    ctx.lineTo(cx - slotWidth, cy + slotHeight)
    ctx.lineTo(cx, cy + slotHeight)
    ctx.strokeStyle = colors.greenSide
    ctx.lineWidth = 4
    ctx.stroke()
  })

  // Pad highlight
  if (padNumber >= 1 && padNumber <= 45) {
    steps.push(() => {
      const { sector: rawSector, shell } = getStarportPadCoords(padNumber)
      const sector = (rawSector + 6) % 12
      const [dx, dy] = PAD_SECTORS[sector]
      const midScale = (SHELL_SCALE[shell] + SHELL_SCALE[shell + 1]) / 2
      const rt = radius * COS15 * midScale
      const px = cx + rt * dx
      const py = cy + rt * dy
      const dotSize = radius * (SHELL_SCALE[0] - SHELL_SCALE[1]) / 4 * (3 - shell) / (4 - shell)

      ctx.beginPath()
      ctx.arc(px, py, dotSize, 0, Math.PI * 2)
      ctx.fillStyle = colors.pad
      ctx.fill()

      ctx.font = `bold ${Math.max(10, dotSize)}px monospace`
      ctx.fillStyle = colors.padLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(padNumber), px, py)
    })
  }

  return steps
}

function getCarrierSteps (ctx, cx, cy, size, padNumber, colors) {
  const steps = []
  const unit = size / FC_BOX_H

  for (let i = 0; i < FC_PADS.length; i++) {
    const pi = i
    steps.push(() => {
      const p = FC_PADS[pi]
      const x = cx + p.x * unit
      const y = cy + p.y * unit
      const w = p.w * unit
      const h = p.h * unit
      ctx.strokeStyle = colors.station
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, w, h)
    })
  }

  if (padNumber >= 1 && padNumber <= 16) {
    steps.push(() => {
      const p = FC_PADS[padNumber - 1]
      const x = cx + p.x * unit
      const y = cy + p.y * unit
      const w = p.w * unit
      const h = p.h * unit
      ctx.fillStyle = colors.pad
      ctx.fillRect(x, y, w, h)
      ctx.font = `bold ${Math.max(10, Math.min(w, h) * 0.6)}px monospace`
      ctx.fillStyle = colors.padLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(padNumber), x + w / 2, y + h / 2)
    })
  }

  return steps
}

function getOutpostSteps (ctx, cx, cy, size, padNumber, colors) {
  const steps = []
  const padCount = Math.max(padNumber, 4)
  const padSize = size / (padCount + 1)

  for (let i = 0; i < padCount; i++) {
    const pi = i
    steps.push(() => {
      const x = cx - (padCount * padSize) / 2 + pi * padSize + padSize * 0.1
      const y = cy - padSize / 2
      const w = padSize * 0.8
      const h = padSize
      const isActive = (pi + 1) === padNumber

      ctx.strokeStyle = colors.station
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, w, h)

      if (isActive) {
        ctx.fillStyle = colors.pad
        ctx.fillRect(x, y, w, h)
      }

      ctx.font = `bold ${Math.max(10, w * 0.5)}px monospace`
      ctx.fillStyle = isActive ? colors.padLabel : colors.station
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(pi + 1), x + w / 2, y + h / 2)
    })
  }

  return steps
}

function getSettlementSteps (ctx, cx, cy, size, padNumber, economy, colors) {
  const template = findSettlementTemplate(economy, padNumber)
  if (!template) return getOutpostSteps(ctx, cx, cy, size, padNumber, colors)

  const steps = []
  const pads = template.pads

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pads) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const PAD_HALF = 40
  const spanX = (maxX - minX) + PAD_HALF * 4 || PAD_HALF * 4
  const spanY = (maxY - minY) + PAD_HALF * 4 || PAD_HALF * 4
  const scale = size * 0.8 / Math.max(spanX, spanY)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const perimR = Math.max(spanX, spanY) * scale / 2 + 20

  // Perimeter circle
  steps.push(() => {
    ctx.beginPath()
    ctx.arc(cx, cy, perimR, 0, Math.PI * 2)
    ctx.strokeStyle = colors.station
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
  })

  // Each pad
  for (let i = 0; i < pads.length; i++) {
    const pi = i
    steps.push(() => {
      const p = pads[pi]
      const px = cx + (p.x - centerX) * scale
      const py = cy + (p.y - centerY) * scale
      const pw = PAD_HALF * 2 * scale
      const ph = PAD_HALF * 2.5 * scale
      const isActive = (pi + 1) === padNumber

      ctx.strokeStyle = colors.station
      ctx.lineWidth = 1.5
      ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph)

      ctx.beginPath()
      ctx.moveTo(px, py - ph / 2 - 4)
      ctx.lineTo(px - 6, py - ph / 2 + 4)
      ctx.lineTo(px + 6, py - ph / 2 + 4)
      ctx.closePath()
      ctx.fillStyle = colors.station
      ctx.fill()

      if (isActive) {
        ctx.fillStyle = colors.pad
        ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph)
      }

      const fontSize = Math.max(12, Math.min(pw, ph) * 0.4)
      ctx.font = `bold ${fontSize}px monospace`
      ctx.fillStyle = isActive ? colors.padLabel : colors.station
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(pi + 1), px, py)

      ctx.font = `${Math.max(9, fontSize * 0.6)}px monospace`
      ctx.fillStyle = isActive ? colors.padLabel : 'rgba(255, 147, 0, 0.4)'
      ctx.fillText('L', px, py + fontSize * 0.6)
    })
  }

  // Template name
  steps.push(() => {
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(255, 147, 0, 0.35)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(template.name + ' \u2014 ' + economy, cx, cy + perimR + 16)
  })

  return steps
}

// ---- Main overlay component ----

const FADE_DURATION = 600   // ms for background fade-in
const STEP_DELAY = 80       // ms between each element appearing
const DISMISS_DURATION = 3000 // ms for fade-out on dismiss

export default function LandingPadOverlay ({ data, onDismiss }) {
  const canvasRef = useRef(null)
  const backdropRef = useRef(null)
  const contentRef = useRef(null)
  const animRef = useRef(null)
  const [fadedIn, setFadedIn] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const dismissTimerRef = useRef(null)

  const isVisible = data != null

  // Reset fade state when overlay appears
  useEffect(() => {
    if (isVisible) {
      setDismissing(false)
      requestAnimationFrame(() => setFadedIn(true))
    } else {
      setFadedIn(false)
      setDismissing(false)
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [isVisible])

  function handleDismiss () {
    if (dismissing) return
    setDismissing(true)
    dismissTimerRef.current = setTimeout(() => {
      onDismiss()
    }, DISMISS_DURATION)
  }

  // Draw the Elite-style rectangular vignette backdrop
  useEffect(() => {
    if (!isVisible || !backdropRef.current) return

    // Defer drawing until content is laid out so we can measure it
    const drawVignette = () => {
      const canvas = backdropRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1

      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)

      // Measure content area and add padding, or fall back to viewport percentages
      const PADDING = Math.min(w, h) * 0.06
      let innerX, innerY, innerW, innerH

      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        innerX = rect.left - PADDING
        innerY = rect.top - PADDING
        innerW = rect.width + PADDING * 2
        innerH = rect.height + PADDING * 2
      } else {
        innerX = w * 0.08
        innerY = h * 0.15
        innerW = w * 0.84
        innerH = h * 0.70
      }

      const fadeSize = Math.min(w, h) * 0.12

    // Fill solid center
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)'
    ctx.fillRect(innerX, innerY, innerW, innerH)

    // Draw faded edges using gradients
    // Top edge
    const topGrad = ctx.createLinearGradient(0, innerY - fadeSize, 0, innerY)
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0.88)')
    ctx.fillStyle = topGrad
    ctx.fillRect(innerX, innerY - fadeSize, innerW, fadeSize)

    // Bottom edge
    const bottomGrad = ctx.createLinearGradient(0, innerY + innerH, 0, innerY + innerH + fadeSize)
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0.88)')
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = bottomGrad
    ctx.fillRect(innerX, innerY + innerH, innerW, fadeSize)

    // Left edge
    const leftGrad = ctx.createLinearGradient(innerX - fadeSize, 0, innerX, 0)
    leftGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0.88)')
    ctx.fillStyle = leftGrad
    ctx.fillRect(innerX - fadeSize, innerY, fadeSize, innerH)

    // Right edge
    const rightGrad = ctx.createLinearGradient(innerX + innerW, 0, innerX + innerW + fadeSize, 0)
    rightGrad.addColorStop(0, 'rgba(0, 0, 0, 0.88)')
    rightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = rightGrad
    ctx.fillRect(innerX + innerW, innerY, fadeSize, innerH)

    // Corner fades (radial gradients in each corner)
    const corners = [
      { cx: innerX, cy: innerY },                     // top-left
      { cx: innerX + innerW, cy: innerY },             // top-right
      { cx: innerX, cy: innerY + innerH },             // bottom-left
      { cx: innerX + innerW, cy: innerY + innerH }     // bottom-right
    ]
    for (const corner of corners) {
      const grad = ctx.createRadialGradient(corner.cx, corner.cy, 0, corner.cx, corner.cy, fadeSize)
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)')
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      // Determine which quadrant to fill
      const sx = corner.cx === innerX ? corner.cx - fadeSize : corner.cx
      const sy = corner.cy === innerY ? corner.cy - fadeSize : corner.cy
      ctx.rect(sx, sy, fadeSize, fadeSize)
      ctx.fill()
    }
    }

    // Draw after a frame so content has been laid out and measured
    requestAnimationFrame(drawVignette)
  }, [isVisible])

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const cx = rect.width / 2
    const cy = rect.height / 2
    const drawSize = Math.min(rect.width, rect.height) * 0.7

    const colors = {
      station: 'rgba(255, 147, 0, 0.6)',
      pad: 'rgba(0, 180, 255, 0.85)',
      padLabel: '#000000',
      greenSide: 'rgba(0, 200, 0, 0.8)',
      redSide: 'rgba(200, 0, 0, 0.8)'
    }

    const stationType = (data.stationType || '').toLowerCase()

    // Build array of individual draw steps for stick-by-stick animation
    let steps
    if (STARPORT_TYPES.has(stationType)) {
      steps = getStarportSteps(ctx, cx, cy, drawSize / 2, data.pad, colors)
    } else if (CARRIER_TYPES.has(stationType)) {
      steps = getCarrierSteps(ctx, cx, cy, drawSize, data.pad, colors)
    } else if (SETTLEMENT_TYPES.has(stationType)) {
      steps = getSettlementSteps(ctx, cx, cy, drawSize, data.pad, data.economy, colors)
    } else {
      steps = getOutpostSteps(ctx, cx, cy, drawSize, data.pad, colors)
    }

    // Wait for background fade-in, then reveal elements one by one
    const startTime = performance.now()

    function animate (now) {
      const elapsed = now - startTime - FADE_DURATION
      ctx.clearRect(0, 0, rect.width, rect.height)

      if (elapsed < 0) {
        animRef.current = requestAnimationFrame(animate)
        return
      }

      const visibleCount = Math.min(Math.floor(elapsed / STEP_DELAY) + 1, steps.length)
      for (let i = 0; i < visibleCount; i++) steps[i]()

      if (visibleCount < steps.length) {
        animRef.current = requestAnimationFrame(animate)
      }
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [data, isVisible])

  if (!isVisible) return null

  return (
    <div
      className='landing-pad-overlay'
      onClick={handleDismiss}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: dismissing ? 0 : (fadedIn ? 1 : 0),
        transition: dismissing
          ? `opacity ${DISMISS_DURATION}ms ease-out`
          : `opacity ${FADE_DURATION}ms ease-in`
      }}
    >
      <canvas
        ref={backdropRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      />
      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <p className='text-primary' style={{ fontSize: '1.2rem', margin: '0 0 .25rem 0', opacity: 0.7 }}>
            {data.stationName}
          </p>
          <p className='text-info' style={{ fontSize: '4rem', margin: 0, fontWeight: 'bold', letterSpacing: '.2rem' }}>
            PAD {data.pad}
          </p>
        </div>
        <canvas
          ref={canvasRef}
          style={{
            width: '60vmin',
            height: '60vmin',
            maxWidth: '600px',
            maxHeight: '600px'
          }}
        />
        <p className='text-muted' style={{ fontSize: '.9rem', marginTop: '1rem', opacity: 0.5 }}>
          Click anywhere to dismiss
        </p>
      </div>
    </div>
  )
}
