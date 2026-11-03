#!/usr/bin/env bash
# Builds a local copy of the Zed extension that Zed can install as a dev
# extension. Zed loads a grammar from a git repository, so this script:
#   1. regenerates and tests the grammar,
#   2. copies it into a scratch git repo OUTSIDE this project and commits it,
#   3. writes a copy of the extension whose extension.toml points at that repo.
# Nothing inside the pavlus project is modified.
#
# Usage: ./dev-extension.sh [output-dir]      (default: ~/.cache/pavlus-zed)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
grammar="$here/../tree-sitter-pavlus"
out="${1:-${XDG_CACHE_HOME:-$HOME/.cache}/pavlus-zed}"

echo "==> generating and testing the grammar"
(cd "$grammar" && npm install --silent && npx tree-sitter generate --abi 14 && npx tree-sitter test)

echo "==> writing the grammar repository to $out/tree-sitter-pavlus"
rm -rf "$out"
mkdir -p "$out/tree-sitter-pavlus" "$out/zed-pavlus"
rsync -a --exclude node_modules --exclude queries --exclude test --exclude '.git' \
  "$grammar/" "$out/tree-sitter-pavlus/"
git -C "$out/tree-sitter-pavlus" init -q
git -C "$out/tree-sitter-pavlus" add -A
git -C "$out/tree-sitter-pavlus" \
  -c user.name=pavlus -c user.email=pavlus@localhost \
  commit -q -m "tree-sitter-pavlus"
rev="$(git -C "$out/tree-sitter-pavlus" rev-parse HEAD)"

echo "==> writing the extension to $out/zed-pavlus"
rsync -a --exclude dev-extension.sh --exclude extension.toml "$here/" "$out/zed-pavlus/"
cat > "$out/zed-pavlus/extension.toml" <<TOML
id = "pavlus"
name = "Pavlus"
description = "Syntax highlighting for pavlus templates (.pavlus)"
version = "0.1.0"
schema_version = 1
authors = ["rysev-a"]
repository = "file://$out/zed-pavlus"

[grammars.pavlus]
repository = "file://$out/tree-sitter-pavlus"
rev = "$rev"
TOML

cat <<MSG

Done. In Zed:
  1. open the command palette (cmd-shift-p)
  2. run "zed: install dev extension"
  3. choose: $out/zed-pavlus
Then open any .pavlus file (e.g. admin-app/frontend/dashboard/dashboard.pavlus).
Re-run this script after changing the grammar or the queries, then reload the
extension from the Extensions page ("Rebuild").
MSG
