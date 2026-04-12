#!/usr/bin/env node
/**
 * Deep trace of why GCRV 950 body 12a gets zero predictions.
 */
const path = require('path')
const fs = require('fs')

const CACHE_PATH = path.join(__dirname, '.comparison-cache.json')
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))

// Find GCRV 950 system
const sys = Object.values(cache).find(s => s.name === 'GCRV 950')
if (!sys) { console.log('GCRV 950 not found'); process.exit(1) }

const body = sys.bodies.find(b => b.name === 'GCRV 950 12 a')
if (!body) { console.log('Body 12a not found'); process.exit(1) }

console.log('Body:', JSON.stringify(body, null, 2).substring(0, 2000))
console.log()

const allBodies = sys.bodies
const starPos = sys.coords ? [sys.coords.x, sys.coords.y, sys.coords.z] : null
console.log('starPos:', starPos)
console.log()

// Now trace through bio-predictor manually
const { predictSpecies } = require('../../src/service/lib/bio-predictor')

// Monkey-patch to trace
const origPredictSpecies = predictSpecies
const result = predictSpecies(body, allBodies, starPos)
console.log('predictSpecies result:', JSON.stringify(result))
console.log()

// Check what buildBodyProps returns
// We need to access the internal function - let me use a modification
const bioPredictor = require('../../src/service/lib/bio-predictor')
console.log('Available exports:', Object.keys(bioPredictor))

// Let's just verify the body type
console.log('\nBody subType:', JSON.stringify(body.subType))
console.log('Body type:', JSON.stringify(body.type))
console.log('Body atmosphereType:', JSON.stringify(body.atmosphereType))
console.log('Body volcanismType:', JSON.stringify(body.volcanismType))
console.log('Body surfaceTemperature:', body.surfaceTemperature)
console.log('Body gravity:', body.gravity)
console.log('Body distanceToArrival:', body.distanceToArrival)

// Check parents
console.log('Body parents:', JSON.stringify(body.parents))
console.log()

// Check if isMainStar is set on any star
const stars = allBodies.filter(b => b.type === 'Star')
console.log('Stars:', stars.map(s => `${s.name} mainStar=${s.mainStar} isMainStar=${s.isMainStar} subType=${s.subType}`))
