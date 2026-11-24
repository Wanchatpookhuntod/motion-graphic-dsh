#!/usr/bin/env node
/**
 * script.txt -> script.json + timing report. Pure Node, no Python.
 *
 *   node txt_to_json.mjs script.txt script.json [--cps 10.2] [--max 46]
 *
 * script.txt:
 *   ## Sxx name          scene header
 *   display || spoken    one line (spoken part optional)
 *   # note               dropped
 *   [[INSTRUCTOR]]       marker scene
 */

import { readFileSync, writeFileSync } from 'node:fs'

const KEYS = 'abcdefghijklmnopqrstuvwxyz'

/** a, b … z, aa, ab … — the same stable anchors the Python tool used. */
function key(index) {
  if (index < 26) return KEYS[index]
  return KEYS[Math.floor(index / 26) - 1] + KEYS[index % 26]
}

function parse(text) {
  const scenes = []
  let current
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('##')) {
      current = { n: line.replace(/^#+/, '').trim(), p: [] }
      scenes.push(current)
    } else if (line.startsWith('#')) {
      continue
    } else if (line === '[[INSTRUCTOR]]') {
      scenes.push({ n: 'INSTRUCTOR', marker: true, p: [] })
      current = undefined
    } else {
      if (!current) throw new Error(`line outside a scene: ${line}`)
      const at = line.indexOf('||')
      const display = (at < 0 ? line : line.slice(0, at)).trim()
      const spoken = at < 0 ? '' : line.slice(at + 2).trim()
      const item = [key(current.p.length), display]
      if (spoken && spoken !== display) item.push(spoken)
      current.p.push(item)
    }
  }
  return scenes
}

/** Code points, not UTF-16 units: Thai combining marks count once, as in Python. */
function charCount(text) {
  return [...text].length
}

function parseArgs(argv) {
  const options = { cps: 10.2, max: 46, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--cps') options.cps = Number(argv[++i])
    else if (arg === '--max') options.max = Number(argv[++i])
    else if (arg === '-h' || arg === '--help') options.help = true
    else options.positional.push(arg)
  }
  return options
}

function main(argv) {
  const options = parseArgs(argv)
  if (options.help || options.positional.length < 2) {
    console.log('usage: node txt_to_json.mjs <script.txt> <script.json> [--cps 10.2] [--max 46]')
    return options.help ? 0 : 1
  }
  const [src, out] = options.positional
  const scenes = parse(readFileSync(src, 'utf8'))
  writeFileSync(out, JSON.stringify(scenes, null, 1) + '\n', 'utf8')

  const header = 'scene'.padEnd(28) + 'lines'.padStart(6) + 'chars'.padStart(7) + 'sec'.padStart(6)
  console.log(header)

  let total = 0
  const warnings = []
  for (const scene of scenes) {
    if (scene.marker) {
      console.log(('[' + scene.n + ']').padEnd(28))
      continue
    }
    let chars = 0
    for (const line of scene.p) {
      const spoken = line.length > 2 ? line[2] : line[1]
      chars += charCount(String(spoken).replace(/ /g, ''))
      if (charCount(line[1]) > options.max) {
        warnings.push(`${scene.n} ${line[0]}: ${charCount(line[1])} chars: ${line[1]}`)
      }
    }
    total += chars
    const seconds = chars / options.cps
    const flag = seconds > 40 ? '  <- over 40 s, split?' : ''
    console.log(
      String(scene.n).slice(0, 27).padEnd(28) +
        String(scene.p.length).padStart(6) +
        String(chars).padStart(7) +
        String(Math.round(seconds)).padStart(6) +
        flag,
    )
  }

  const totalSeconds = total / options.cps
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  console.log(`\ntotal ${total} chars ~ ${minutes}:${String(seconds).padStart(2, '0')} (+ instructor card)`)
  if (warnings.length) {
    console.log(`\n${warnings.length} line(s) over ${options.max} chars:`)
    console.log(warnings.map((warning) => '  ' + warning).join('\n'))
  }
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(`✗ ${error.message}`)
  process.exitCode = 1
}
