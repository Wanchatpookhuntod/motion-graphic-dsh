#!/usr/bin/env node
/**
 * One-command setup for a machine that will run the motion-graphics bundle.
 *
 *   node setup.mjs                 # report only — installs nothing
 *   node setup.mjs --install       # fix what is missing (asks before downloads)
 *   node setup.mjs --install --yes # unattended: FFmpeg + HyperFrames + Chrome
 *   node setup.mjs --install --yes --python   # also install Python 3 (optional)
 *   node setup.mjs --json          # machine-readable report
 *
 * Steps, in order:
 *   1. Node.js 22+          — required; cannot be installed from inside a Node process
 *   2. FFmpeg / FFprobe     — via scripts/ensure-ffmpeg.mjs (package manager, else per-user build)
 *   3. HyperFrames + Chrome — pre-warmed through the launcher into one shared cache
 *   4. Python 3 (optional)  — only with --python; the bundle itself never needs it
 *
 * Exit codes: 0 everything ready, 1 something is missing (report mode), 2 a fix failed.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ensureScript = join(here, 'ensure-ffmpeg.mjs')
const hfScript = join(here, 'hf.mjs')

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

/** Same per-user root ensure-ffmpeg.mjs uses for its install. */
function toolsRoot() {
  if (process.env.MOTION_GRAPHICS_TOOLS_DIR) return process.env.MOTION_GRAPHICS_TOOLS_DIR
  if (IS_WIN) return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'motion-graphics')
  if (IS_MAC) return join(homedir(), 'Library', 'Application Support', 'motion-graphics')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'motion-graphics')
}

const TOOLS = toolsRoot()
const SHARED_CACHE = join(TOOLS, 'cache')

const options = {
  install: false,
  yes: false,
  json: false,
  python: false,
  all: false,
  help: false,
}
for (const arg of process.argv.slice(2)) {
  if (arg === '--install' || arg === '--fix') options.install = true
  else if (arg === '--yes' || arg === '-y') options.yes = true
  else if (arg === '--json') options.json = true
  else if (arg === '--python') options.python = true
  else if (arg === '--all') {
    options.all = true
    options.python = true
  } else if (arg === '-h' || arg === '--help') options.help = true
}

const steps = []

function record(name, status, detail) {
  steps.push({ name, status, detail })
  if (!options.json) {
    const icon = status === 'ok' ? '✓' : status === 'installed' ? '+' : status === 'skipped' ? '·' : '✗'
    console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function runNode(args, { cwd, capture = false } = {}) {
  return spawnSync(process.execPath, args, {
    cwd,
    env: { ...process.env, HF_CACHE_DIR: SHARED_CACHE },
    stdio: capture || options.json ? 'pipe' : 'inherit',
    encoding: 'utf8',
    windowsHide: true,
  })
}

function nodeVersionOk() {
  const major = Number(process.versions.node.split('.')[0])
  return { ok: major >= 22, version: process.versions.node }
}

function ffmpegState() {
  const result = runNode([ensureScript, '--check', '--json'], { capture: true })
  try {
    return JSON.parse(String(result.stdout || '').trim())
  } catch {
    return { ok: false, found: false }
  }
}

function installFfmpeg() {
  // Consent was already collected above, so the child never asks twice.
  const result = runNode([ensureScript, '--install', '--yes'])
  return (result.status ?? 1) === 0
}

function prewarmHyperFrames() {
  const project = join(SHARED_CACHE, 'warmup-project')
  mkdirSync(project, { recursive: true })
  const browser = runNode([hfScript, 'browser', 'ensure'], { cwd: project })
  const doctor = runNode([hfScript, 'doctor', '--json'], { cwd: project, capture: true })
  return { ok: (browser.status ?? 1) === 0, detail: String(doctor.stdout || '').trim().slice(0, 400) }
}

function pythonState() {
  for (const name of IS_WIN ? ['python', 'python3'] : ['python3', 'python']) {
    const result = spawnSync(name, ['-c', 'import sys; print(sys.version.split()[0])'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if ((result.status ?? 1) === 0) {
      return { found: true, version: String(result.stdout || '').trim() || name }
    }
  }
  return { found: false }
}

function installPython() {
  if (IS_WIN) {
    return (spawnSync('winget', [
      'install', '--id', 'Python.Python.3.12', '--exact', '--silent',
      '--accept-package-agreements', '--accept-source-agreements',
    ], { stdio: options.json ? 'pipe' : 'inherit', windowsHide: true }).status ?? 1) === 0
  }
  if (IS_MAC) {
    return (spawnSync('brew', ['install', 'python@3.12'], {
      stdio: options.json ? 'pipe' : 'inherit',
    }).status ?? 1) === 0
  }
  return (spawnSync('sudo', ['apt-get', 'install', '-y', 'python3', 'python3-numpy'], {
    stdio: options.json ? 'pipe' : 'inherit',
  }).status ?? 1) === 0
}

async function confirm(question) {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}

async function agree(question) {
  if (options.yes) return true
  if (!process.stdin.isTTY) return false
  return confirm(question)
}

async function main() {
  if (options.help) {
    console.log('usage: node setup.mjs [--install] [--yes] [--all] [--python] [--json]')
    return 0
  }
  if (!options.json) console.log(`motion-graphics setup — shared cache: ${SHARED_CACHE}\n`)

  // 1 — Node.js, the one thing this process cannot install for itself.
  const node = nodeVersionOk()
  record('Node.js', node.ok ? 'ok' : 'missing', `v${node.version}${node.ok ? '' : ' — 22+ required'}`)

  // 2 — FFmpeg / FFprobe.
  let ffmpeg = ffmpegState()
  if (ffmpeg.found) {
    record('FFmpeg', 'ok', `${ffmpeg.version || 'found'} (${ffmpeg.source})`)
  } else if (options.install) {
    const agreed = await agree('FFmpeg is missing. Install it on this machine now (about 50–150 MB)? [y/N] ')
    if (agreed && installFfmpeg()) {
      ffmpeg = ffmpegState()
      record('FFmpeg', ffmpeg.found ? 'installed' : 'failed', ffmpeg.found ? ffmpeg.ffmpeg : 'install finished but not found')
    } else {
      record('FFmpeg', 'missing', 'not installed — render/snapshot will stop')
    }
  } else {
    record('FFmpeg', 'missing', 'run with --install to add it')
  }

  // 3 — HyperFrames CLI + headless Chrome, downloaded once into the shared cache.
  if (options.install) {
    const agreed = await agree('Pre-download the HyperFrames CLI and a headless Chrome (about 150–250 MB)? [y/N] ')
    if (agreed) {
      const warm = prewarmHyperFrames()
      record('HyperFrames + Chrome', warm.ok ? 'installed' : 'failed', `${SHARED_CACHE}`)
    } else {
      record('HyperFrames + Chrome', 'skipped', 'downloads on first use instead')
    }
  } else {
    record('HyperFrames + Chrome', 'skipped', 'run with --install to pre-download')
  }

  // 4 — Python, opt-in: this bundle does not need it, but `--all` installs it too.
  if (options.python) {
    let python = pythonState()
    if (python.found) {
      record('Python 3', 'ok', python.version)
    } else if (options.install) {
      const agreed = options.all || options.yes || (await agree('Install Python 3 on this machine too? [y/N] '))
      if (agreed && installPython()) {
        python = pythonState()
        record('Python 3', python.found ? 'installed' : 'failed', python.found ? python.version : 'installed, needs a new shell for PATH')
      } else {
        record('Python 3', 'missing', 'not installed')
      }
    } else {
      record('Python 3', 'missing', 'run with --install to add it')
    }
  }

  const failed = steps.filter((step) => step.status === 'missing' || step.status === 'failed')
  const ready = steps.filter((step) => step.name === 'Node.js' || step.name === 'FFmpeg').every((step) => step.status === 'ok' || step.status === 'installed')

  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: ready, cacheDir: SHARED_CACHE, steps }) + '\n')
    return ready ? 0 : 1
  }

  console.log('')
  if (ready) {
    console.log('Ready. Open a new DSH session and ask for a motion graphic.')
    console.log(`Tip: export HF_CACHE_DIR="${SHARED_CACHE}" so every project reuses this download.`)
    return failed.length ? 1 : 0
  }
  console.log('Not ready — fix the ✗ lines above, then run this again.')
  return 1
}

process.exitCode = await main()
