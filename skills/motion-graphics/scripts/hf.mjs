#!/usr/bin/env node
/**
 * Portable HyperFrames launcher for the motion-graphics bundle.
 *
 *   node "<skill directory>/scripts/hf.mjs" <command> [options]
 *
 * Run it inside the project directory. It keeps every cache, npm download and
 * temporary file inside `<project>/.hf-cache` (a DSH shell sandbox can write the
 * workspace but not the home folder), turns Chrome's sandbox off, and delegates
 * to the HyperFrames CLI launcher bundled in the sibling `hyperframes` skill.
 *
 * FFmpeg is checked before a command that needs it (`render`, `snapshot`,
 * `beats`). When it is missing, the launcher asks once and installs it on the
 * machine with `scripts/ensure-ffmpeg.mjs`; `--install-ffmpeg` answers yes up
 * front and `--no-install-ffmpeg` refuses to install at all. Both flags are
 * consumed here and never reach HyperFrames.
 *
 * Environment overrides:
 *   HF_CACHE_DIR      share one cache / pre-downloaded Chrome across projects
 *   HF_CLI            path to an existing hyperframes CLI script (skips npx)
 *   MOTION_GRAPHICS_TOOLS_DIR  where the per-user FFmpeg install lives
 *   HYPERFRAMES_*     passed through; unset values get the workspace defaults
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const project = process.cwd()
const cliLauncher = join(here, '..', '..', 'hyperframes', 'scripts', 'plugin-cli.mjs')
const ensureScript = join(here, 'ensure-ffmpeg.mjs')
/** Commands that cannot produce their output without FFmpeg/FFprobe. */
const FFMPEG_COMMANDS = new Set(['render', 'snapshot', 'beats'])
/** Launcher-owned flags; stripped before the CLI sees them. */
const OWN_FLAGS = new Set(['--install-ffmpeg', '--no-install-ffmpeg'])

function pickCacheRoot() {
  const explicit = process.env.HF_CACHE_DIR
  if (explicit) return resolve(explicit)
  const preferred = join(project, '.hf-cache')
  try {
    mkdirSync(preferred, { recursive: true })
    return preferred
  } catch {
    // The project may be read-only or outside the writable sandbox roots.
    const fallback = join(tmpdir(), 'motion-graphics-cache')
    mkdirSync(fallback, { recursive: true })
    return fallback
  }
}

const cacheRoot = pickCacheRoot()
for (const directory of ['npm', 'tmp', 'history', 'fonts', 'media', 'config', 'tmp/extract']) {
  try {
    mkdirSync(join(cacheRoot, directory), { recursive: true })
  } catch {
    // A missing subdirectory only costs a slower first run; the CLI recreates it.
  }
}

const env = { ...process.env }
const defaults = {
  npm_config_cache: join(cacheRoot, 'npm'),
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false',
  npm_config_audit: 'false',
  TMPDIR: join(cacheRoot, 'tmp'),
  TEMP: join(cacheRoot, 'tmp'),
  TMP: join(cacheRoot, 'tmp'),
  HYPERFRAMES_CACHE_DIR: cacheRoot,
  HYPERFRAMES_CONFIG_DIR: join(cacheRoot, 'config'),
  HYPERFRAMES_HISTORY_ROOT: join(cacheRoot, 'history'),
  HYPERFRAMES_FONT_CACHE_DIR: join(cacheRoot, 'fonts'),
  HYPERFRAMES_MEDIA_HOME: join(cacheRoot, 'media'),
  HYPERFRAMES_EXTRACT_CACHE_DIR: join(cacheRoot, 'tmp', 'extract'),
  HYPERFRAMES_CHROME_SANDBOX: '0',
}
for (const [key, value] of Object.entries(defaults)) {
  if (!env[key]) env[key] = value
}

// Reuse a Chrome headless shell that was downloaded next to the project.
if (!env.HYPERFRAMES_BROWSER_PATH) {
  const localChrome = join(project, '.hf-bin', 'chrome-headless-shell')
  if (existsSync(localChrome)) env.HYPERFRAMES_BROWSER_PATH = localChrome
}

/** Ask scripts/ensure-ffmpeg.mjs what the machine has; never installs. */
function inspectFfmpeg() {
  const result = spawnSync(process.execPath, [ensureScript, '--check', '--json'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  try {
    return JSON.parse(String(result.stdout || '').trim())
  } catch {
    return { ok: false, found: false }
  }
}

function installFfmpeg() {
  const result = spawnSync(process.execPath, [ensureScript, '--install', '--yes'], {
    stdio: 'inherit',
    windowsHide: true,
  })
  return (result.status ?? 1) === 0
}

async function confirmInstall() {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(
      'FFmpeg is missing and this command needs it. Install it on this machine now (about 50–150 MB)? [y/N] ',
    )
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

function explainMissing() {
  console.error('✗ FFmpeg is missing; this command cannot run without it.')
  console.error('  Fix: node "<skill>/scripts/hf.mjs" doctor --install-ffmpeg   (asks once, then installs)')
  console.error('  Or install FFmpeg yourself and point HyperFrames at it:')
  console.error('     HYPERFRAMES_FFMPEG_PATH=/path/to/ffmpeg HYPERFRAMES_FFPROBE_PATH=/path/to/ffprobe')
}

/** Resolve FFmpeg for this run, installing it once when the user agrees. */
async function prepareFfmpeg(command, wantsInstall, refusesInstall) {
  let info = inspectFfmpeg()
  if (info.found) {
    if (!env.HYPERFRAMES_FFMPEG_PATH) env.HYPERFRAMES_FFMPEG_PATH = info.ffmpeg
    if (!env.HYPERFRAMES_FFPROBE_PATH) env.HYPERFRAMES_FFPROBE_PATH = info.ffprobe
    return true
  }
  const needed = FFMPEG_COMMANDS.has(command)
  // Commands that do not encode may run without FFmpeg; an explicit
  // `--install-ffmpeg` still installs ahead of time (for example on `doctor`).
  if (!needed && !wantsInstall) return true
  if (refusesInstall) {
    if (needed) explainMissing()
    return !needed
  }
  let agreed = wantsInstall
  if (!agreed) {
    const interactive = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
    agreed = interactive ? await confirmInstall() : false
  }
  if (!agreed) {
    if (needed) explainMissing()
    return false
  }
  if (!installFfmpeg()) {
    explainMissing()
    return false
  }
  info = inspectFfmpeg()
  if (!info.found) {
    explainMissing()
    return false
  }
  env.HYPERFRAMES_FFMPEG_PATH = info.ffmpeg
  env.HYPERFRAMES_FFPROBE_PATH = info.ffprobe
  return true
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const wantsInstall = rawArgs.includes('--install-ffmpeg')
  const refusesInstall = rawArgs.includes('--no-install-ffmpeg')
  const args = rawArgs.filter((arg) => !OWN_FLAGS.has(arg))
  const command = args.find((arg) => !arg.startsWith('-')) || ''

  if (!(await prepareFfmpeg(command, wantsInstall, refusesInstall))) return 1

  let result
  if (process.env.HF_CLI) {
    result = spawnSync(process.execPath, [resolve(process.env.HF_CLI), ...args], {
      cwd: project,
      env,
      stdio: 'inherit',
      windowsHide: true,
    })
  } else {
    result = spawnSync(process.execPath, [cliLauncher, ...args], {
      cwd: project,
      env,
      stdio: 'inherit',
      windowsHide: true,
    })
  }

  if (result.error) {
    console.error(`hf: cannot start HyperFrames: ${result.error.message}`)
    return 1
  }
  if (result.signal) {
    console.error(`hf: HyperFrames stopped by ${result.signal}`)
    return 130
  }
  return result.status ?? 1
}

process.exitCode = await main()
