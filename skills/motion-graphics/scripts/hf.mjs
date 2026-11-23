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
 * Environment overrides:
 *   HF_CACHE_DIR      share one cache / pre-downloaded Chrome across projects
 *   HF_CLI            path to an existing hyperframes CLI script (skips npx)
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

let result
if (process.env.HF_CLI) {
  result = spawnSync(process.execPath, [resolve(process.env.HF_CLI), ...process.argv.slice(2)], {
    cwd: project,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
} else {
  result = spawnSync(process.execPath, [cliLauncher, ...process.argv.slice(2)], {
    cwd: project,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
}

if (result.error) {
  console.error(`hf: cannot start HyperFrames: ${result.error.message}`)
  process.exitCode = 1
} else if (result.signal) {
  console.error(`hf: HyperFrames stopped by ${result.signal}`)
  process.exitCode = 130
} else {
  process.exitCode = result.status ?? 1
}
