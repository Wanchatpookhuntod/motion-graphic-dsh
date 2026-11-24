#!/usr/bin/env bash
# Complete installer for the motion-graphics bundle (macOS / Linux).
#
#   bash install.sh              # Node.js if missing, FFmpeg, HyperFrames + Chrome, Python 3
#   bash install.sh --skip-node  # fail instead of installing Node.js
#   bash install.sh --skip-python
#
# Everything it needs travels inside the bundle folder except Node.js itself,
# which it installs with the platform package manager when possible.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
setup="$here/skills/motion-graphics/scripts/setup.mjs"
skip_node=0
skip_python=0

for arg in "$@"; do
  case "$arg" in
    --skip-node) skip_node=1 ;;
    --skip-python) skip_python=1 ;;
    -h|--help)
      echo "usage: bash install.sh [--skip-node] [--skip-python]"
      exit 0
      ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

node_major() {
  if ! have node; then echo 0; return; fi
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

echo "motion-graphics installer"
echo

# --- 1. Node.js -------------------------------------------------------------
major="$(node_major)"
if [ "$major" -ge 22 ]; then
  echo "✓ Node.js $(node -v)"
elif [ "$skip_node" -eq 1 ]; then
  echo "✗ Node.js 22+ is required (found: $major). Install it, then run this again." >&2
  exit 1
else
  echo "· Node.js 22+ not found (found: $major) — installing"
  if have brew; then
    brew install node
  elif have apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif have dnf; then
    sudo dnf install -y nodejs
  elif have pacman; then
    sudo pacman -S --noconfirm nodejs npm
  else
    echo "✗ No supported package manager. Install Node.js 22+ from https://nodejs.org and run this again." >&2
    exit 1
  fi
  major="$(node_major)"
  if [ "$major" -lt 22 ]; then
    echo "✗ Node.js was installed but this shell still sees an old version. Open a new terminal and run this again." >&2
    exit 1
  fi
  echo "✓ Node.js $(node -v) installed"
fi

# --- 2-4. FFmpeg, HyperFrames + Chrome, Python -----------------------------
code=0
if [ "$skip_python" -eq 1 ]; then
  node "$setup" --install --yes || code=$?
else
  node "$setup" --install --yes --all || code=$?
fi

echo
if [ "$code" -eq 0 ]; then
  echo "Done. Open a new DeepSeek Harness session and ask for a motion graphic."
else
  echo "Setup finished with problems — read the ✗ lines above and run this again." >&2
fi
exit "$code"
