#!/usr/bin/env bash
# uninstall.sh — GG Plugin selective installer cleanup entrypoint.
#
# Delegates to Node.js and removes files previously written by install.sh.

set -euo pipefail

SCRIPT_PATH="$0"
# Resolve symlinks so the repo root is always correct
while [ -L "$SCRIPT_PATH" ]; do
  LINK_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$LINK_DIR/$SCRIPT_PATH"
done
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

exec node "$REPO_DIR/scripts/install-clean.js" "$@"
