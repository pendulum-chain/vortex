#!/usr/bin/env bash
set -euo pipefail

vortex_repo_root="$(git rev-parse --show-toplevel)"
vortex_worktree_name="$(basename "$vortex_repo_root")"
vortex_tmp_root="${VORTEX_WORKTREE_TMPDIR:-/tmp/vortex-worktree-${vortex_worktree_name}}"
vortex_cache_dir="${vortex_tmp_root}/bun-cache"

mkdir -p "$vortex_cache_dir"
cd "$vortex_repo_root"

TMPDIR="$vortex_tmp_root" bun install --frozen-lockfile --cache-dir="$vortex_cache_dir"
TMPDIR="$vortex_tmp_root" bun run build:shared
