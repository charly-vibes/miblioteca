#!/usr/bin/env node
import fs from 'node:fs'

function usage() {
  console.error('Usage: node scripts/analyze-ghost-run.mjs <debug-export.json> [runNumber]')
  process.exit(1)
}

const [, , path, runArg] = process.argv
if (!path) usage()

const data = JSON.parse(fs.readFileSync(path, 'utf8'))
const events = Array.isArray(data.events) ? data.events : []
const shutters = events.filter((event) => event.type === 'capture:shutter')
if (shutters.length === 0) {
  console.error('No capture:shutter events found.')
  process.exit(1)
}

const runs = []
let current = []
let expectedIndex = 0
for (const event of shutters) {
  const index = event.payload?.index
  if (!Number.isInteger(index)) continue
  if (current.length > 0 && index === 0 && expectedIndex !== 0) {
    runs.push(current)
    current = []
  }
  current.push(event)
  expectedIndex = index + 1
}
if (current.length > 0) runs.push(current)

const runNumber = runArg ? Number(runArg) : runs.length
if (!Number.isInteger(runNumber) || runNumber < 1 || runNumber > runs.length) {
  console.error(`runNumber must be between 1 and ${runs.length}`)
  process.exit(1)
}

const run = runs[runNumber - 1].map((event) => {
  const ghost = event.payload?.ghost ?? {}
  const shiftX = Number(ghost.shiftPx ?? 0)
  const shiftY = Number(ghost.shiftPy ?? 0)
  return {
    seq: event.seq,
    t: event.t,
    index: Number(event.payload?.index ?? -1),
    visible: Boolean(ghost.visible),
    workingDistanceCm: Number(ghost.workingDistanceCm ?? NaN),
    shiftX,
    shiftY,
    mag: Math.hypot(shiftX, shiftY),
  }
})

const signs = run.map((entry) => (entry.shiftX > 0 ? 1 : entry.shiftX < 0 ? -1 : 0))
const signFlips = signs.reduce((count, sign, idx) => {
  if (idx === 0 || sign === 0 || signs[idx - 1] === 0) return count
  return count + (sign !== signs[idx - 1] ? 1 : 0)
}, 0)
const largeErrorCount = run.filter((entry) => Math.abs(entry.shiftX) > 25).length
const duplicateLikeCount = run.slice(1).filter((entry, idx) => Math.abs(entry.shiftX - run[idx].shiftX) < 8).length
const oscillationWindows = []
for (let i = 3; i < run.length; i++) {
  const window = run.slice(i - 3, i + 1)
  const largeEnough = window.every((entry) => Math.abs(entry.shiftX) >= 20)
  const flips = window.reduce((count, entry, idx) => {
    if (idx === 0) return count
    const prev = window[idx - 1].shiftX
    if (prev === 0 || entry.shiftX === 0) return count
    return count + (Math.sign(prev) !== Math.sign(entry.shiftX) ? 1 : 0)
  }, 0)
  if (largeEnough && flips >= 3) {
    oscillationWindows.push(window.map((entry) => entry.index))
  }
}

console.log(`file: ${path}`)
console.log(`runs: ${runs.length}`)
console.log(`selected run: ${runNumber}`)
console.log(`captures: ${run.length}`)
console.log(`large |shiftX| > 25: ${largeErrorCount}`)
console.log(`sign flips: ${signFlips}`)
console.log(`duplicate-like small advances (<8px): ${duplicateLikeCount}`)
console.log(`oscillation windows: ${oscillationWindows.length ? oscillationWindows.map((w) => `[${w.join(', ')}]`).join(' ') : 'none'}`)
console.log('')
for (let i = 0; i < run.length; i++) {
  const entry = run[i]
  const prev = run[i - 1]
  const deltaShiftX = prev ? entry.shiftX - prev.shiftX : null
  const flipped = prev ? Math.sign(entry.shiftX) !== 0 && Math.sign(prev.shiftX) !== 0 && Math.sign(entry.shiftX) !== Math.sign(prev.shiftX) : false
  console.log([
    `#${entry.index}`.padEnd(4),
    `seq=${String(entry.seq).padStart(3)}`,
    `shift=(${entry.shiftX.toFixed(2).padStart(7)}, ${entry.shiftY.toFixed(2).padStart(6)})`,
    `mag=${entry.mag.toFixed(2).padStart(6)}`,
    `vis=${String(entry.visible).padEnd(5)}`,
    `dist=${Number.isFinite(entry.workingDistanceCm) ? entry.workingDistanceCm.toFixed(1) : 'n/a'}`,
    deltaShiftX == null ? 'Δx=n/a' : `Δx=${deltaShiftX.toFixed(2).padStart(7)}`,
    flipped ? 'flip' : '',
  ].filter(Boolean).join('  '))
}
