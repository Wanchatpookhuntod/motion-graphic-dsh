#!/usr/bin/env node
/**
 * Machine-wide FFmpeg provisioning for the motion-graphics bundle.
 *
 *   node ensure-ffmpeg.mjs --check   [--json]      # look only, never writes
 *   node ensure-ffmpeg.mjs --install [--yes] [--method auto|winget|brew|apt|npm] [--json]
 *
 * Detection order:
 *   1. HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH
 *   2. the state file this script writes after an install
 *   3. FFmpeg and FFprobe on PATH (plus the usual package-manager folders)
 *
 * Install methods, tried in this order by `auto`:
 *   winget (Windows) / brew (macOS) / apt-get (Debian/Ubuntu)  — a real machine install
 *   npm                                                       — per-user static build, no admin
 *
 * `--install` refuses to run unattended: it needs `--yes` or an interactive terminal.
 * Exit codes: 0 usable, 1 missing, 2 install failed, 3 consent needed.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const EXE = IS_WIN ? '.exe' : ''

/** Per-user, machine-wide tool root; survives project deletion and cache clears. */
function toolsRoot() {
  if (process.env.MOTION_GRAPHICS_TOOLS_DIR) return process.env.MOTION_GRAPHICS_TOOLS_DIR
  if (IS_WIN) {
    const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return join(base, 'motion-graphics')
  }
  if (IS_MAC) return join(homedir(), 'Library', 'Application Support', 'motion-graphics')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'motion-graphics')
}

const ROOT = toolsRoot()
const HOME = join(ROOT, 'ffmpeg')
const BIN = join(HOME, 'bin')
const STATE = join(HOME, 'state.json')

/** Every candidate path for one executable name, in PATH order. */
function pathCandidates(name) {
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : ['']
  const dirs = (process.env.PATH || process.env.Path || '').split(IS_WIN ? ';' : ':').filter(Boolean)
  const out = []
  for (const dir of dirs) for (const ext of exts) out.push(join(dir, name + ext))
  return out
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function firstExisting(paths) {
  return paths.find(isFile)
}

function usable(ffmpeg, ffprobe) {
  return Boolean(ffmpeg && ffprobe && isFile(ffmpeg) && isFile(ffprobe))
}

/** Locations a package manager or the static build may land in without touching PATH. */
function extraDirs() {
  if (IS_WIN) {
    const out = []
    if (process.env.LOCALAPPDATA) out.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'))
    if (process.env.ProgramFiles) out.push(join(process.env.ProgramFiles, 'ffmpeg', 'bin'))
    out.push(BIN)
    return out
  }
  return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', BIN]
}

/** The winget package folder is one level deeper than PATH, so look for it explicitly. */
function scanWinGet() {
  const local = process.env.LOCALAPPDATA
  if (!local) return undefined
  const root = join(local, 'Microsoft', 'WinGet', 'Packages')
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/ffmpeg/i.test(entry.name)) continue
    const base = join(root, entry.name)
    const hits = [join(base, 'bin')]
    let children = []
    try {
      children = readdirSync(base, { withFileTypes: true })
    } catch {
      children = []
    }
    for (const child of children) {
      if (!child.isDirectory()) continue
      hits.push(join(base, child.name, 'bin'), join(base, child.name))
    }
    for (const dir of hits) {
      const ffmpeg = join(dir, 'ffmpeg' + EXE)
      const ffprobe = join(dir, 'ffprobe' + EXE)
      if (usable(ffmpeg, ffprobe)) return { ffmpeg, ffprobe }
    }
  }
  return undefined
}

function readState() {
  try {
    const raw = JSON.parse(readFileSync(STATE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : undefined
  } catch {
    return undefined
  }
}

/** version string from `ffmpeg -version`, or undefined when it cannot run. */
function probeVersion(bin) {
  try {
    const result = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
    if ((result.status ?? 1) !== 0) return undefined
    const line = String(result.stdout || '').split(/\r?\n/)[0].trim()
    const match = /ffmpeg version (\S+)/.exec(line)
    return match ? match[1] : line || undefined
  } catch {
    return undefined
  }
}

/** Find a usable FFmpeg/FFprobe pair without changing anything. */
export function detect() {
  const envF = process.env.HYPERFRAMES_FFMPEG_PATH
  const envP = process.env.HYPERFRAMES_FFPROBE_PATH
  if (usable(envF, envP)) return { found: true, source: 'env', ffmpeg: envF, ffprobe: envP }

  const state = readState()
  if (state && usable(state.ffmpeg, state.ffprobe)) {
    return { found: true, source: 'state', ffmpeg: state.ffmpeg, ffprobe: state.ffprobe }
  }

  const ffmpeg = firstExisting(pathCandidates('ffmpeg'))
  const ffprobe = firstExisting(pathCandidates('ffprobe'))
  if (usable(ffmpeg, ffprobe)) return { found: true, source: 'path', ffmpeg, ffprobe }

  const winGet = IS_WIN ? scanWinGet() : undefined
  if (winGet) return { found: true, source: 'winget', ...winGet }

  const extra = []
  for (const dir of extraDirs()) extra.push(join(dir, 'ffmpeg' + EXE))
  const extraF = firstExisting(extra)
  if (extraF) {
    const dir = join(extraF, '..')
    const ffprobeExtra = join(dir, 'ffprobe' + EXE)
    if (isFile(ffprobeExtra)) return { found: true, source: 'dir', ffmpeg: extraF, ffprobe: ffprobeExtra }
  }

  return { found: false, source: 'missing' }
}

function have(command) {
  return Boolean(firstExisting(pathCandidates(command)))
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  return (result.status ?? 1) === 0
}

/** Adopt binaries installed outside PATH by writing the state file. */
function adopt(found) {
  mkdirSync(BIN, { recursive: true })
  writeState({ method: 'adopt', ffmpeg: found.ffmpeg, ffprobe: found.ffprobe })
  return { found: true, source: 'state', ffmpeg: found.ffmpeg, ffprobe: found.ffprobe }
}

function writeState(extra) {
  const payload = {
    installedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    binDir: BIN,
    ...extra,
  }
  mkdirSync(HOME, { recursive: true })
  writeFileSync(STATE, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  return payload
}

/** winget / brew / apt: a normal machine install the whole system can use. */
function installWithPackageManager(method) {
  if (method === 'winget' && IS_WIN && have('winget')) {
    const ok = run('winget', [
      'install', '--id', 'Gyan.FFmpeg', '--exact', '--silent',
      '--accept-package-agreements', '--accept-source-agreements',
    ])
    if (ok) {
      const hit = scanWinGet() || scanExtra()
      if (hit) return adopt(hit)
    }
    return undefined
  }
  if (method === 'brew' && IS_MAC && have('brew')) {
    if (run('brew', ['install', 'ffmpeg'])) {
      const hit = scanExtra()
      if (hit) return adopt(hit)
    }
    return undefined
  }
  if (method === 'apt' && !IS_WIN && !IS_MAC && have('apt-get')) {
    if (run('sudo', ['apt-get', 'install', '-y', 'ffmpeg'])) {
      const hit = scanExtra()
      if (hit) return adopt(hit)
    }
    return undefined
  }
  return undefined
}

function scanExtra() {
  if (IS_WIN) {
    const hit = scanWinGet()
    if (hit) return hit
  }
  for (const dir of extraDirs()) {
    const ffmpeg = join(dir, 'ffmpeg' + EXE)
    const ffprobe = join(dir, 'ffprobe' + EXE)
    if (usable(ffmpeg, ffprobe)) return { ffmpeg, ffprobe }
  }
  return undefined
}

/** Resolve the binary paths a npm static build installed into a scratch folder. */
function resolveInstalledModule(work, specifier, read) {
  const script = `const m = require(${JSON.stringify(specifier)}); console.log(String(${read}))`
  const result = spawnSync(process.execPath, ['-e', script], { cwd: work, encoding: 'utf8', windowsHide: true })
  if ((result.status ?? 1) !== 0) return undefined
  const value = String(result.stdout || '').trim()
  return value && isFile(value) ? value : undefined
}

function npmCommand() {
  const nodeDir = dirname(process.execPath)
  const candidates = [
    process.env.npm_execpath,
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean)
  const cli = candidates.find(isFile)
  if (cli) return { command: process.execPath, args: [cli] }
  return { command: 'npm', args: [] }
}

/** Per-user static build: no admin rights, npm verifies the package integrity. */
function installWithNpm() {
  const work = join(HOME, '.npm-install')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  const npm = npmCommand()
  const installed = run(npm.command, [
    ...npm.args, 'install', '--no-audit', '--no-fund', '--loglevel=error',
    '--prefix', work, 'ffmpeg-static@5.2.0', 'ffprobe-static@3.1.0',
  ])
  if (!installed) return undefined

  const ffmpegSrc = resolveInstalledModule(work, 'ffmpeg-static', 'm')
  const ffprobeSrc = resolveInstalledModule(work, 'ffprobe-static', 'm.path')
  if (!ffmpegSrc || !ffprobeSrc) return undefined

  mkdirSync(BIN, { recursive: true })
  const ffmpeg = join(BIN, 'ffmpeg' + EXE)
  const ffprobe = join(BIN, 'ffprobe' + EXE)
  copyFileSync(ffmpegSrc, ffmpeg)
  copyFileSync(ffprobeSrc, ffprobe)
  if (!IS_WIN) {
    chmodSync(ffmpeg, 0o755)
    chmodSync(ffprobe, 0o755)
  }
  writeState({
    method: 'npm',
    ffmpeg,
    ffprobe,
    packages: { 'ffmpeg-static': '5.2.0', 'ffprobe-static': '3.1.0' },
  })
  rmSync(work, { recursive: true, force: true })
  return { found: true, source: 'state', ffmpeg, ffprobe }
}

/** `auto` prefers a system package manager and falls back to the per-user build. */
function install(method) {
  const order = method && method !== 'auto'
    ? [method]
    : IS_WIN ? ['winget', 'npm'] : IS_MAC ? ['brew', 'npm'] : ['apt', 'npm']
  for (const candidate of order) {
    let result
    if (candidate === 'npm') result = installWithNpm()
    else result = installWithPackageManager(candidate)
    if (result) return { ...result, method: candidate }
  }
  return undefined
}

async function confirm(question) {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

function report(payload, json) {
  if (json) {
    process.stdout.write(JSON.stringify(payload) + '\n')
    return
  }
  if (!payload.found) {
    console.log('✗ FFmpeg and FFprobe were not found.')
    console.log(`  Fix: node ${process.argv[1]} --install`)
    return
  }
  const version = probeVersion(payload.ffmpeg)
  console.log(`✓ FFmpeg ${version ? version + ' ' : ''}(${payload.source})`)
  console.log(`  ffmpeg:  ${payload.ffmpeg}`)
  console.log(`  ffprobe: ${payload.ffprobe}`)
}

async function main(argv) {
  const json = argv.includes('--json')
  const doInstall = argv.includes('--install')
  const yes = argv.includes('--yes') || argv.includes('-y')
  const methodIndex = argv.indexOf('--method')
  const method = methodIndex >= 0 ? argv[methodIndex + 1] : 'auto'

  let found = detect()
  let installedBy
  if (!found.found && doInstall) {
    if (!yes) {
      const interactive = Boolean(process.stdin.isTTY)
      const agreed = interactive
        ? await confirm('FFmpeg is missing. Install it on this machine now (about 50–150 MB)? [y/N] ')
        : false
      if (!agreed) {
        if (json) process.stdout.write(JSON.stringify({ ok: false, found: false, needsConsent: true }) + '\n')
        else {
          console.error('✗ FFmpeg is missing and the install was not confirmed.')
          console.error(`  Fix: node ${process.argv[1]} --install --yes`)
        }
        return 3
      }
    }
    const result = install(method)
    if (!result) {
      if (json) process.stdout.write(JSON.stringify({ ok: false, found: false, failed: true }) + '\n')
      else {
        console.error('✗ FFmpeg could not be installed automatically.')
        console.error('  Fix: install it with your package manager, then point HyperFrames at it:')
        console.error('     HYPERFRAMES_FFMPEG_PATH=/path/to/ffmpeg HYPERFRAMES_FFPROBE_PATH=/path/to/ffprobe')
      }
      return 2
    }
    installedBy = result.method
    found = { ...result, found: true }
  }

  if (!found.found) {
    if (json) process.stdout.write(JSON.stringify({ ok: false, found: false, needsConsent: doInstall }) + '\n')
    else report({ found: false }, false)
    return 1
  }

  const payload = {
    ok: true,
    found: true,
    ffmpeg: found.ffmpeg,
    ffprobe: found.ffprobe,
    source: found.source,
    version: probeVersion(found.ffmpeg),
    stateFile: STATE,
    binDir: BIN,
    ...(installedBy ? { installedBy } : {}),
  }
  report(payload, json)
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('ensure-ffmpeg.mjs')) {
  const code = await main(process.argv.slice(2))
  process.exitCode = code
}
