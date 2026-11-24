# Complete installer for the motion-graphics bundle (Windows).
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1 -SkipNode
#
# Installs, in order: Node.js 22+ (when missing), FFmpeg/FFprobe, the HyperFrames
# CLI with a headless Chrome, and Python 3. Then it verifies everything.
# Nothing is downloaded without an explicit step here — this script is the
# explicit step.

[CmdletBinding()]
param(
  [switch]$SkipNode,
  [switch]$SkipPython
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$setup = Join-Path $here 'skills/motion-graphics/scripts/setup.mjs'

function Have([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  if (-not (Have 'node')) { return 0 }
  try {
    return [int](& node -p "process.versions.node.split('.')[0]" 2>$null)
  } catch {
    return 0
  }
}

Write-Host 'motion-graphics installer' -ForegroundColor Cyan
Write-Host ''

# --- 1. Node.js -------------------------------------------------------------
$major = Get-NodeMajor
if ($major -ge 22) {
  Write-Host "✓ Node.js $(& node -v)" -ForegroundColor Green
} elseif ($SkipNode) {
  Write-Host "✗ Node.js 22+ is required (found: $major). Install it, then run this again." -ForegroundColor Red
  exit 1
} else {
  Write-Host "· Node.js 22+ not found (found: $major) — installing the LTS release..."
  if (Have 'winget') {
    winget install --id OpenJS.NodeJS.LTS --exact --silent `
      --accept-package-agreements --accept-source-agreements
  } elseif (Have 'choco') {
    choco install nodejs-lts -y
  } else {
    Write-Host '✗ No winget or chocolatey. Install Node.js 22+ from https://nodejs.org and run this again.' -ForegroundColor Red
    exit 1
  }
  Update-PathFromRegistry
  $major = Get-NodeMajor
  if ($major -lt 22) {
    Write-Host '✗ Node.js was installed but this shell still sees an old version.' -ForegroundColor Red
    Write-Host '  Open a new terminal and run this file again.'
    exit 1
  }
  Write-Host "✓ Node.js $(& node -v) installed" -ForegroundColor Green
}

# --- 2-4. FFmpeg, HyperFrames + Chrome, Python -----------------------------
$setupArgs = @($setup, '--install', '--yes', '--all')
if ($SkipPython) {
  $setupArgs = @($setup, '--install', '--yes')
}
& node @setupArgs
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
  Write-Host 'Done. Open a new DeepSeek Harness session and ask for a motion graphic.' -ForegroundColor Green
} else {
  Write-Host 'Setup finished with problems — read the ✗ lines above and run this file again.' -ForegroundColor Yellow
}
exit $code
