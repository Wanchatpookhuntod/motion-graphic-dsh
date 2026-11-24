#!/usr/bin/env node
/**
 * Portable HyperFrames launcher for the motion-graphics bundle.
 *
 *   node "<skill directory>/scripts/hf.mjs" <command> [options]
 *
 * Run it inside the project directory. Caches, npm downloads and temporary files
 * go to one per-user folder shared by every project (`<tools>/cache`, the same
 * one setup.mjs pre-warms); when a sandbox cannot write there it falls back to
 * `<project>/.hf-cache`. It turns Chrome's sandbox off. The first call downloads
 * the pinned CLI through the bundled `hyperframes` launcher (npx); later calls
 * start that installed CLI directly with node.
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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
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

/** Same per-user root setup.mjs and ensure-ffmpeg.mjs use. */
function toolsRoot() {
  if (process.env.MOTION_GRAPHICS_TOOLS_DIR) return process.env.MOTION_GRAPHICS_TOOLS_DIR
  if (process.platform === 'win32')
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'motion-graphics')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'motion-graphics')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'motion-graphics')
}

/** True when the directory exists (or can be made) and accepts a file. */
function writable(directory) {
  try {
    mkdirSync(directory, { recursive: true })
    const probe = join(directory, `.probe-${process.pid}`)
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

function pickCacheRoot() {
  const explicit = process.env.HF_CACHE_DIR
  if (explicit) return resolve(explicit)
  // One cache for every project: the CLI and Chrome are downloaded once per
  // machine (setup.mjs pre-warms this same folder). A sandbox that cannot write
  // outside the workspace falls through to the per-project cache below.
  const shared = join(toolsRoot(), 'cache')
  if (writable(shared)) return shared
  // Sandboxed: reuse a cache an earlier project left in this folder or a parent
  // (the workspace root) before starting a new download in the project.
  let folder = project
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = join(folder, '.hf-cache')
    if (existsSync(join(candidate, 'npm', '_npx')) && writable(candidate)) return candidate
    const parent = dirname(folder)
    if (parent === folder) break
    folder = parent
  }
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

/** The CLI release pinned by the bundle's plugin.json, if any. */
function pinnedVersion() {
  try {
    const manifest = JSON.parse(readFileSync(join(here, '..', '..', '..', 'plugin.json'), 'utf8'))
    return manifest.name === 'hyperframes' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * The pinned CLI as npx left it in this cache, so later calls start it with
 * plain `node` instead of paying for an npx resolution every time.
 */
function installedCli(version) {
  if (!version) return undefined
  const npxRoot = join(env.npm_config_cache, '_npx')
  let entries
  try {
    entries = readdirSync(npxRoot)
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const pkgDir = join(npxRoot, entry, 'node_modules', 'hyperframes')
    try {
      const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
      if (pkg.version !== version) continue
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.hyperframes
      if (!bin) continue
      const script = join(pkgDir, bin)
      if (existsSync(script)) return script
    } catch {
      // Not this folder.
    }
  }
  return undefined
}

/** Resolve FFmpeg for this run, installing it once when the user agrees. */
async function prepareFfmpeg(command, wantsInstall, refusesInstall) {
  // Commands that never touch FFmpeg skip the probe (two process starts).
  if (!FFMPEG_COMMANDS.has(command) && command !== 'doctor' && !wantsInstall) return true
  if (env.HYPERFRAMES_FFMPEG_PATH && env.HYPERFRAMES_FFPROBE_PATH && !wantsInstall) return true
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

  const version = pinnedVersion()
  const direct = process.env.HF_CLI ? undefined : installedCli(version)
  let result
  if (direct) {
    if (command === 'skills') {
      console.error('Bundled skills are release-managed; update them through the plugin manager.')
      return 1
    }
    result = spawnSync(process.execPath, [direct, ...args], {
      cwd: project,
      env: {
        ...env,
        HYPERFRAMES_SKIP_SKILLS: '1',
        HYPERFRAMES_SKILL_PKG_VERSION: version,
        HYPERFRAMES_PLUGIN_VERSION: version,
        HYPERFRAMES_NO_UPDATE_CHECK: '1',
        HYPERFRAMES_PLUGIN_CWD: project,
      },
      stdio: 'inherit',
      windowsHide: true,
    })
  } else if (process.env.HF_CLI) {
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
