#!/usr/bin/env bash
# install.sh — GG Plugin installer entrypoint.
#
# Delegates to Node.js. If node_modules are missing and npm is available,
# installs them first (needed only for the optional ajv schema validator;
# the installer works without it).

set -euo pipefail

SCRIPT_PATH="$0"
# Resolve symlinks so the repo root is always correct
while [ -L "$SCRIPT_PATH" ]; do
  LINK_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$LINK_DIR/$SCRIPT_PATH"
done
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# Auto-install Node dependencies when running from a git clone
if [ ! -d "$REPO_DIR/node_modules" ] && command -v npm &>/dev/null; then
  echo "[gg] Installing installer dependencies..."
  (cd "$REPO_DIR" && npm install --no-audit --no-fund --loglevel=error)
fi

exec node "$REPO_DIR/scripts/install-apply.js" "$@"
